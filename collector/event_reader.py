"""Leitura do Windows Event Log.

Lê eventos de segurança do Windows em tempo real usando a API win32evtlog.
Processa:
  - Login/Logoff: Event IDs 4624, 4625, 4634, 4647, 4648
  - Acesso a arquivos: Event IDs 4663, 4660, 4670

Pré-requisito para eventos de arquivo:
  1. Política de auditoria: Acesso a Objetos deve estar habilitada
  2. SACLs configuradas nas pastas monitoradas
"""
import logging
import socket
from datetime import datetime, timezone
from typing import Any
from xml.etree import ElementTree

import win32evtlog  # type: ignore[import]
import win32evtlogutil  # type: ignore[import]
import win32con  # type: ignore[import]
import winerror  # type: ignore[import]

from config import LOGIN_EVENT_IDS, FILE_EVENT_IDS, LOGON_TYPES, ACCESS_MASK_TO_ACTION, WINDOWS_MSG_TO_ACTION

logger = logging.getLogger('adlogs.reader')

HOSTNAME = socket.gethostname()


class EventReader:
    """Lê eventos do Security Event Log do Windows."""

    def __init__(self):
        self._login_handle = None
        self._file_handle = None

    def read_login_events(self, last_record_id: int | None = None) -> list[dict[str, Any]]:
        """
        Lê eventos de login/logoff desde o último record_id processado.
        Se last_record_id for None, lê os últimos 1000 eventos.
        """
        events = []
        try:
            handle = win32evtlog.OpenEventLog(None, 'Security')
            flags = win32evtlog.EVENTLOG_BACKWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ

            records_processed = 0
            max_records = 1000

            while records_processed < max_records:
                batch = win32evtlog.ReadEventLog(handle, flags, 0)
                if not batch:
                    break

                for record in batch:
                    if record.EventID not in LOGIN_EVENT_IDS:
                        continue

                    record_number = record.RecordNumber
                    if last_record_id is not None and record_number <= last_record_id:
                        win32evtlog.CloseEventLog(handle)
                        return events

                    parsed = self._parse_login_event(record)
                    if parsed:
                        events.append(parsed)

                    records_processed += 1

            win32evtlog.CloseEventLog(handle)
        except Exception as exc:
            logger.error('Error reading login events: %s', exc)

        return events

    def read_file_events(
        self,
        monitored_folders: list[str],
        last_record_id: int | None = None,
    ) -> list[dict[str, Any]]:
        """
        Lê eventos de arquivo para as pastas monitoradas.
        Filtra por caminho — só retorna eventos em subpastas das pastas monitoradas.
        """
        if not monitored_folders:
            return []

        events = []
        try:
            handle = win32evtlog.OpenEventLog(None, 'Security')
            flags = win32evtlog.EVENTLOG_BACKWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ

            records_processed = 0
            max_records = 5000

            while records_processed < max_records:
                batch = win32evtlog.ReadEventLog(handle, flags, 0)
                if not batch:
                    break

                for record in batch:
                    if record.EventID not in FILE_EVENT_IDS:
                        continue

                    record_number = record.RecordNumber
                    if last_record_id is not None and record_number <= last_record_id:
                        win32evtlog.CloseEventLog(handle)
                        return events

                    parsed = self._parse_file_event(record, monitored_folders)
                    if parsed:
                        events.append(parsed)

                    records_processed += 1

            win32evtlog.CloseEventLog(handle)
        except Exception as exc:
            logger.error('Error reading file events: %s', exc)

        return events

    def _parse_login_event(self, record: Any) -> dict[str, Any] | None:
        """Extrai campos relevantes de um evento de login."""
        try:
            event_id = record.EventID & 0xFFFF  # Normaliza o Event ID
            strings = record.StringInserts or []

            username = ''
            domain = ''
            source_ip = None
            workstation = None
            logon_type = None
            logon_type_name = None
            failure_reason = None
            success = event_id in (4624, 4634, 4647, 4648)

            if event_id == 4624:  # Logon bem-sucedido
                username = strings[5] if len(strings) > 5 else ''
                domain = strings[6] if len(strings) > 6 else ''
                logon_type = int(strings[8]) if len(strings) > 8 and strings[8].isdigit() else None
                logon_type_name = LOGON_TYPES.get(logon_type, '') if logon_type else None
                workstation = strings[11] if len(strings) > 11 else None
                source_ip = strings[18] if len(strings) > 18 else None

            elif event_id == 4625:  # Falha de logon
                username = strings[5] if len(strings) > 5 else ''
                domain = strings[6] if len(strings) > 6 else ''
                logon_type = int(strings[10]) if len(strings) > 10 and strings[10].isdigit() else None
                logon_type_name = LOGON_TYPES.get(logon_type, '') if logon_type else None
                workstation = strings[13] if len(strings) > 13 else None
                source_ip = strings[19] if len(strings) > 19 else None
                failure_reason = strings[8] if len(strings) > 8 else None

            elif event_id in (4634, 4647):  # Logoff
                username = strings[1] if len(strings) > 1 else ''
                domain = strings[2] if len(strings) > 2 else ''
                logon_type = int(strings[4]) if len(strings) > 4 and strings[4].isdigit() else None

            elif event_id == 4648:  # Logon com credenciais explícitas
                username = strings[5] if len(strings) > 5 else ''
                domain = strings[6] if len(strings) > 6 else ''
                source_ip = strings[12] if len(strings) > 12 else None

            # Ignora eventos de contas de sistema (username vazio ou $)
            if not username or username.endswith('$') or username == '-':
                return None

            timestamp = record.TimeGenerated
            if hasattr(timestamp, 'timestamp'):
                ts = datetime.fromtimestamp(timestamp.timestamp(), tz=timezone.utc)
            else:
                ts = datetime.now(timezone.utc)

            return {
                'windows_event_id': event_id,
                'username': username.strip(),
                'domain': domain.strip() or None,
                'source_ip': _clean_ip(source_ip),
                'workstation': workstation.strip() if workstation else None,
                'logon_type': logon_type,
                'logon_type_name': logon_type_name,
                'success': success,
                'failure_reason': failure_reason,
                'timestamp': ts,
                'windows_record_id': str(record.RecordNumber),
            }

        except Exception as exc:
            logger.debug('Error parsing login event %s: %s', getattr(record, 'RecordNumber', '?'), exc)
            return None

    def _parse_file_event(
        self,
        record: Any,
        monitored_folders: list[str],
    ) -> dict[str, Any] | None:
        """Extrai campos de um evento de acesso a arquivo."""
        try:
            event_id = record.EventID & 0xFFFF
            strings = record.StringInserts or []

            username = ''
            domain = ''
            file_path = ''
            process_name = None
            process_id = None
            action = 'READ'

            if event_id == 4663:  # Acesso tentado
                username = strings[1] if len(strings) > 1 else ''
                domain = strings[2] if len(strings) > 2 else ''
                file_path = strings[6] if len(strings) > 6 else ''
                process_name = strings[11] if len(strings) > 11 else None
                process_id_str = strings[9] if len(strings) > 9 else '0'
                try:
                    process_id = int(process_id_str, 16)
                except (ValueError, TypeError):
                    process_id = None
                access_mask = strings[10].strip() if len(strings) > 10 else '0x0'
                action = _access_mask_to_action(access_mask)

            elif event_id == 4660:  # Objeto excluído
                username = strings[1] if len(strings) > 1 else ''
                domain = strings[2] if len(strings) > 2 else ''
                file_path = strings[6] if len(strings) > 6 else ''
                process_name = strings[10] if len(strings) > 10 else None
                action = 'DELETE'

            elif event_id == 4670:  # Permissões alteradas
                username = strings[1] if len(strings) > 1 else ''
                domain = strings[2] if len(strings) > 2 else ''
                file_path = strings[6] if len(strings) > 6 else ''
                process_name = strings[11] if len(strings) > 11 else None
                action = 'PERMISSION_CHANGE'

            if not username or username.endswith('$') or username == '-':
                return None

            if not file_path:
                return None

            # Verifica se o arquivo está em uma pasta monitorada
            matched_folder = None
            file_path_lower = file_path.lower()
            for folder in monitored_folders:
                if file_path_lower.startswith(folder.lower()):
                    matched_folder = folder
                    break

            if not matched_folder:
                return None

            timestamp = record.TimeGenerated
            if hasattr(timestamp, 'timestamp'):
                ts = datetime.fromtimestamp(timestamp.timestamp(), tz=timezone.utc)
            else:
                ts = datetime.now(timezone.utc)

            return {
                'windows_event_id': event_id,
                'username': username.strip(),
                'domain': domain.strip() or None,
                'file_path': file_path.strip(),
                'monitored_folder': matched_folder,
                'action': action,
                'process_name': process_name.strip() if process_name else None,
                'process_id': process_id,
                'timestamp': ts,
                'windows_record_id': str(record.RecordNumber),
            }

        except Exception as exc:
            logger.debug('Error parsing file event %s: %s', getattr(record, 'RecordNumber', '?'), exc)
            return None


def _clean_ip(ip: str | None) -> str | None:
    """Normaliza o IP, retornando None para valores inválidos."""
    if not ip or ip in ('-', '::1', '0.0.0.0', ''):
        return None
    return ip.strip()


def _access_mask_to_action(access_mask: str) -> str:
    """Converte o AccessMask do Windows em uma acao legivel.

    O Windows reporta o AccessMask em dois formatos:
    - Hex: '0x2', '0x10000', etc.
    - Mensagem: '%%4416', '%%1537', etc. (Windows 2016/2019/2022+)
    """
    mask = access_mask.strip()

    # Formato %% (Windows moderno)
    if mask.startswith('%%'):
        return WINDOWS_MSG_TO_ACTION.get(mask, 'READ')

    # Hex exato
    mask_lower = mask.lower()
    for pattern, action in ACCESS_MASK_TO_ACTION.items():
        if mask_lower == pattern.lower():
            return action

    # Hex com multiplos bits — verifica flags individualmente
    try:
        mask_int = int(mask, 16)
        if mask_int & 0x10000:  # DELETE
            return 'DELETE'
        if mask_int & 0x2 or mask_int & 0x4 or mask_int & 0x40:  # WriteData/AppendData/DeleteChild
            return 'WRITE'
        if mask_int & 0x1 or mask_int & 0x80 or mask_int & 0x100:  # ReadData/ReadAttributes
            return 'READ'
    except (ValueError, TypeError):
        pass

    return 'READ'
