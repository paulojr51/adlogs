"""Leitura do Windows Event Log.

Lê eventos de segurança do Windows em tempo real usando a API win32evtlog.
Processa:
  - Login/Logoff: Event IDs 4624, 4625, 4634, 4647, 4648
  - Acesso a arquivos: Event IDs 4663, 4656, 4670
  - Criação de processos: Event ID 4688
  - Gestão de contas: Event IDs 4720, 4722, 4725, 4726, 4740, 4723, 4724, 4728-4733
  - SQL Server (Application Log): Event IDs 18456, 17806, 17852, 7036

Pré-requisito para eventos de arquivo:
  1. Política de auditoria: Acesso a Objetos deve estar habilitada
  2. SACLs configuradas nas pastas monitoradas

Pré-requisito para eventos de processo (4688):
  1. secpol.msc → Audit Process Creation: Habilitar Success
  2. gpedit.msc → Computer Configuration → Administrative Templates →
     System → Audit Process Creation → Include command line: Enabled

Nota sobre exclusão de arquivos:
  O Windows gera 4663 com AccessMask DELETE (0x10000) para exclusão de PASTAS,
  mas para exclusão de ARQUIVOS gera apenas 4656 (handle solicitado com DELETE).
  Por isso capturamos 4656 especificamente para detectar exclusões de arquivos.
"""
import logging
import os
import socket
from datetime import datetime, timezone
from typing import Any
from xml.etree import ElementTree

import win32evtlog  # type: ignore[import]
import win32evtlogutil  # type: ignore[import]
import win32con  # type: ignore[import]
import winerror  # type: ignore[import]

from config import (
    LOGIN_EVENT_IDS, FILE_EVENT_IDS, PROCESS_EVENT_IDS,
    ACCOUNT_EVENT_IDS, SQL_EVENT_IDS, SQL_EVENT_SOURCE,
    LOGON_TYPES, ACCESS_MASK_TO_ACTION, WINDOWS_MSG_TO_ACTION,
)

logger = logging.getLogger('adlogs.reader')

HOSTNAME = socket.gethostname()


class EventReader:
    """Lê eventos do Security Event Log do Windows."""

    def __init__(self):
        self._login_handle = None
        self._file_handle = None
        self._process_handle = None

    # ─── Marca d'água de leitura ──────────────────────────────────────────────

    def _record_timestamp(self, record: Any) -> datetime | None:
        """Timestamp do registro em UTC, ou None se indisponível."""
        raw = getattr(record, 'TimeGenerated', None)
        if raw is None or not hasattr(raw, 'timestamp'):
            return None
        try:
            return datetime.fromtimestamp(raw.timestamp(), tz=timezone.utc)
        except (OSError, ValueError, OverflowError):
            return None

    def _reached_watermark(
        self,
        record: Any,
        last_record_id: int | None,
        last_timestamp: datetime | None,
    ) -> bool:
        """
        True quando a leitura retroativa (do mais novo ao mais antigo) alcançou
        o ponto já processado.

        O timestamp tem prioridade sobre o RecordNumber: o RecordNumber reinicia
        em 1 quando o Event Log é limpo ou arquivado por tamanho
        (AutoBackupLogFiles), e nesse caso todo evento novo pareceria "antigo",
        travando a coleta indefinidamente.

        A comparação usa `<` e não `<=`: os eventos do exato instante da marca
        d'água são reprocessados de propósito. A API deduplica por
        (servidor, record_id, timestamp), então repetir é inofensivo — enquanto
        pular perderia eventos gravados no mesmo segundo da última leitura.
        """
        if last_timestamp is not None:
            ts = self._record_timestamp(record)
            if ts is not None:
                return ts < last_timestamp
        if last_record_id is not None:
            return record.RecordNumber <= last_record_id
        return False

    def _warn_if_record_number_reset(
        self,
        record: Any,
        last_record_id: int | None,
        channel: str,
    ) -> None:
        """Registra aviso quando o RecordNumber recua — sinal de log limpo/arquivado.

        Precisa ser visível: foi justamente o silêncio desse evento que manteve
        um coletor "ativo" no dashboard por semanas sem coletar nada.
        """
        if last_record_id is None:
            return
        numero = getattr(record, 'RecordNumber', None)
        if not isinstance(numero, int) or numero >= last_record_id:
            return
        logger.warning(
            'RecordNumber do log %s recuou (%d < %d): o log foi limpo ou arquivado '
            'por tamanho. Seguindo pela marca d\'agua de tempo.',
            channel, numero, last_record_id,
        )

    # ─── Leitura ──────────────────────────────────────────────────────────────

    def read_login_events(
        self,
        last_record_id: int | None = None,
        last_timestamp: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """
        Lê eventos de login/logoff desde a última marca d'água processada.
        Sem marca d'água, lê os últimos 1000 eventos.
        """
        events = []
        try:
            handle = win32evtlog.OpenEventLog(None, 'Security')
            flags = win32evtlog.EVENTLOG_BACKWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ

            records_processed = 0
            max_records = 1000
            reset_checked = False

            while records_processed < max_records:
                batch = win32evtlog.ReadEventLog(handle, flags, 0)
                if not batch:
                    break

                for record in batch:
                    if (record.EventID & 0xFFFF) not in LOGIN_EVENT_IDS:
                        continue

                    if not reset_checked:
                        self._warn_if_record_number_reset(record, last_record_id, 'Security')
                        reset_checked = True

                    if self._reached_watermark(record, last_record_id, last_timestamp):
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
        last_timestamp: datetime | None = None,
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
            reset_checked = False

            while records_processed < max_records:
                batch = win32evtlog.ReadEventLog(handle, flags, 0)
                if not batch:
                    break

                for record in batch:
                    if (record.EventID & 0xFFFF) not in FILE_EVENT_IDS:
                        continue

                    if not reset_checked:
                        self._warn_if_record_number_reset(record, last_record_id, 'Security')
                        reset_checked = True

                    if self._reached_watermark(record, last_record_id, last_timestamp):
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
                # 4663: [8]=AccessList [9]=AccessMask [10]=ProcessId [11]=ProcessName
                process_id_str = strings[10] if len(strings) > 10 else '0'
                try:
                    process_id = int(process_id_str, 16)
                except (ValueError, TypeError):
                    process_id = None
                access_mask = strings[9].strip() if len(strings) > 9 else '0x0'
                action = _access_mask_to_action(access_mask)

            elif event_id == 4656:  # Handle solicitado — captura exclusão de arquivo
                object_type = strings[5] if len(strings) > 5 else ''
                if object_type != 'File':
                    return None
                username = strings[1] if len(strings) > 1 else ''
                domain = strings[2] if len(strings) > 2 else ''
                file_path = strings[6] if len(strings) > 6 else ''
                # 4656: [9]=AccessList [10]=AccessReason [11]=AccessMask [14]=ProcessId [15]=ProcessName
                process_name = strings[15] if len(strings) > 15 else None
                process_id_str = strings[14] if len(strings) > 14 else '0'
                try:
                    process_id = int(process_id_str, 16)
                except (ValueError, TypeError):
                    process_id = None
                access_mask = strings[11].strip() if len(strings) > 11 else '0x0'
                if access_mask.startswith('%%'):
                    # Formato %%NNNN usado em Windows 2016/2019/2022+
                    if WINDOWS_MSG_TO_ACTION.get(access_mask) != 'DELETE':
                        return None
                else:
                    # Formato hex: só DELETE sem bits de escrita
                    # Máscaras compostas com escrita = Office abrindo para editar, não exclusão
                    try:
                        mask_int = int(access_mask, 16)
                    except (ValueError, TypeError):
                        return None
                    if not (mask_int & 0x10000) or (mask_int & 0x106):
                        return None
                action = 'DELETE'
                # Ignora arquivos temporários internos (Office .tmp, ~$lockfiles, .crdownload)
                fname = os.path.basename(file_path).lower() if file_path else ''
                if fname.endswith('.tmp') or fname.startswith('~$') or fname.endswith('.crdownload'):
                    return None

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


    def read_process_events(
        self,
        last_record_id: int | None = None,
        last_timestamp: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """
        Lê eventos de criação de processo (4688) desde a última marca d'água.
        Requer que "Audit Process Creation" esteja habilitado no Windows.
        """
        events = []
        try:
            handle = win32evtlog.OpenEventLog(None, 'Security')
            flags = win32evtlog.EVENTLOG_BACKWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ

            records_processed = 0
            max_records = 5000
            reset_checked = False

            while records_processed < max_records:
                batch = win32evtlog.ReadEventLog(handle, flags, 0)
                if not batch:
                    break

                for record in batch:
                    if (record.EventID & 0xFFFF) not in PROCESS_EVENT_IDS:
                        continue

                    if not reset_checked:
                        self._warn_if_record_number_reset(record, last_record_id, 'Security')
                        reset_checked = True

                    if self._reached_watermark(record, last_record_id, last_timestamp):
                        win32evtlog.CloseEventLog(handle)
                        return events

                    parsed = self._parse_process_event(record)
                    if parsed:
                        events.append(parsed)

                    records_processed += 1

            win32evtlog.CloseEventLog(handle)
        except Exception as exc:
            logger.error('Error reading process events: %s', exc)

        return events

    def _parse_process_event(self, record: Any) -> dict[str, Any] | None:
        """Extrai campos do Event 4688 (Process Creation).

        Índices dos StringInserts para 4688:
          [1]  SubjectUserName    = username
          [2]  SubjectDomainName  = domain
          [5]  NewProcessId       = processId (hex)
          [6]  NewProcessName     = processPath
          [7]  TokenElevationType
          [8]  ProcessId          = parentProcessId (hex)
          [9]  CommandLine        (disponível se política habilitada)
          [13] ParentProcessName  (disponível em Windows 10+/Server 2016+)
        """
        try:
            event_id = record.EventID & 0xFFFF
            strings = record.StringInserts or []

            username = strings[1] if len(strings) > 1 else ''
            domain = strings[2] if len(strings) > 2 else ''

            if not username or username.endswith('$') or username == '-':
                return None

            process_path = strings[6] if len(strings) > 6 else ''
            process_name = os.path.basename(process_path) if process_path else ''
            command_line = strings[9] if len(strings) > 9 else None
            parent_process_name = strings[13] if len(strings) > 13 else None

            process_id_str = strings[5] if len(strings) > 5 else '0'
            parent_process_id_str = strings[8] if len(strings) > 8 else '0'
            try:
                process_id = int(process_id_str, 16) if process_id_str else None
            except (ValueError, TypeError):
                process_id = None
            try:
                parent_process_id = int(parent_process_id_str, 16) if parent_process_id_str else None
            except (ValueError, TypeError):
                parent_process_id = None

            timestamp = record.TimeGenerated
            if hasattr(timestamp, 'timestamp'):
                ts = datetime.fromtimestamp(timestamp.timestamp(), tz=timezone.utc)
            else:
                ts = datetime.now(timezone.utc)

            return {
                'windows_event_id': event_id,
                'username': username.strip(),
                'domain': domain.strip() or None,
                'process_name': process_name,
                'process_path': process_path.strip() or None,
                'command_line': command_line.strip() if command_line else None,
                'parent_process_name': parent_process_name.strip() if parent_process_name else None,
                'parent_process_id': parent_process_id,
                'process_id': process_id,
                'timestamp': ts,
                'windows_record_id': str(record.RecordNumber),
            }

        except Exception as exc:
            logger.debug('Error parsing process event %s: %s', getattr(record, 'RecordNumber', '?'), exc)
            return None


    def read_account_events(
        self,
        last_record_id: int | None = None,
        last_timestamp: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """Lê eventos de gestão de contas (4720-4733) do Security Log."""
        events = []
        try:
            handle = win32evtlog.OpenEventLog(None, 'Security')
            flags = win32evtlog.EVENTLOG_BACKWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ
            records_processed = 0
            reset_checked = False

            while records_processed < 2000:
                batch = win32evtlog.ReadEventLog(handle, flags, 0)
                if not batch:
                    break
                for record in batch:
                    if (record.EventID & 0xFFFF) not in ACCOUNT_EVENT_IDS:
                        continue
                    if not reset_checked:
                        self._warn_if_record_number_reset(record, last_record_id, 'Security')
                        reset_checked = True
                    if self._reached_watermark(record, last_record_id, last_timestamp):
                        win32evtlog.CloseEventLog(handle)
                        return events
                    parsed = self._parse_account_event(record)
                    if parsed:
                        events.append(parsed)
                    records_processed += 1

            win32evtlog.CloseEventLog(handle)
        except Exception as exc:
            logger.error('Error reading account events: %s', exc)
        return events

    def _parse_account_event(self, record: Any) -> dict[str, Any] | None:
        """Extrai campos de evento de gestão de conta.

        Índices dos StringInserts para eventos de conta:
          [0] TargetUserName   = targetUsername
          [1] TargetDomainName = targetDomain
          [2] groupName        (para eventos de grupo 4728/4729/4732/4733)
          [4] SubjectUserName  = actorUsername
          [5] SubjectDomainName = actorDomain
        """
        try:
            event_id = record.EventID & 0xFFFF
            strings = record.StringInserts or []

            target_username = strings[0] if len(strings) > 0 else ''
            target_domain = strings[1] if len(strings) > 1 else ''
            group_name = strings[2] if len(strings) > 2 else None
            actor_username = strings[4] if len(strings) > 4 else None
            actor_domain = strings[5] if len(strings) > 5 else None

            if not target_username or target_username.endswith('$') or target_username == '-':
                return None

            event_type_map = {
                4720: 'USER_CREATED',
                4722: 'USER_ENABLED',
                4725: 'USER_DISABLED',
                4726: 'USER_DELETED',
                4740: 'USER_LOCKED',
                4723: 'PASSWORD_CHANGED',
                4724: 'PASSWORD_RESET',
                4728: 'GROUP_MEMBER_ADDED',
                4729: 'GROUP_MEMBER_REMOVED',
                4732: 'GROUP_MEMBER_ADDED',
                4733: 'GROUP_MEMBER_REMOVED',
            }
            event_type = event_type_map.get(event_id)
            if not event_type:
                return None

            timestamp = record.TimeGenerated
            if hasattr(timestamp, 'timestamp'):
                ts = datetime.fromtimestamp(timestamp.timestamp(), tz=timezone.utc)
            else:
                ts = datetime.now(timezone.utc)

            return {
                'windows_event_id': event_id,
                'event_type': event_type,
                'target_username': target_username.strip(),
                'target_domain': target_domain.strip() or None,
                'actor_username': actor_username.strip() if actor_username else None,
                'actor_domain': actor_domain.strip() if actor_domain else None,
                'group_name': group_name.strip() if group_name else None,
                'timestamp': ts,
                'windows_record_id': str(record.RecordNumber),
            }

        except Exception as exc:
            logger.debug('Error parsing account event %s: %s', getattr(record, 'RecordNumber', '?'), exc)
            return None

    def read_sql_events(
        self,
        last_record_id: int | None = None,
        last_timestamp: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """Lê eventos SQL Server do Windows Application Log."""
        events = []
        try:
            handle = win32evtlog.OpenEventLog(None, 'Application')
            flags = win32evtlog.EVENTLOG_BACKWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ
            records_processed = 0
            reset_checked = False

            while records_processed < 2000:
                batch = win32evtlog.ReadEventLog(handle, flags, 0)
                if not batch:
                    break
                for record in batch:
                    source = getattr(record, 'SourceName', '') or ''
                    if source.upper() != SQL_EVENT_SOURCE.upper():
                        continue
                    if (record.EventID & 0xFFFF) not in SQL_EVENT_IDS:
                        continue
                    if not reset_checked:
                        self._warn_if_record_number_reset(record, last_record_id, 'Application')
                        reset_checked = True
                    if self._reached_watermark(record, last_record_id, last_timestamp):
                        win32evtlog.CloseEventLog(handle)
                        return events
                    parsed = self._parse_sql_event(record)
                    if parsed:
                        events.append(parsed)
                    records_processed += 1

            win32evtlog.CloseEventLog(handle)
        except Exception as exc:
            logger.error('Error reading SQL events: %s', exc)
        return events

    def _parse_sql_event(self, record: Any) -> dict[str, Any] | None:
        """Extrai campos de evento SQL Server do Application Log."""
        try:
            event_id = record.EventID & 0xFFFF
            strings = record.StringInserts or []

            username = strings[0].strip() if len(strings) > 0 and strings[0] else None
            detail = strings[1].strip() if len(strings) > 1 and strings[1] else None

            if event_id == 18456:
                event_type = 'LOGIN_FAILED'
                success = False
            elif event_id in (17806, 17852):
                event_type = 'AUTH_FAILURE'
                success = False
                username = None
            elif event_id == 7036:
                state = (detail or '').lower()
                if 'running' in state or 'started' in state or 'iniciado' in state:
                    event_type = 'SERVICE_STARTED'
                    success = True
                else:
                    event_type = 'SERVICE_STOPPED'
                    success = False
                username = None
            else:
                return None

            timestamp = record.TimeGenerated
            if hasattr(timestamp, 'timestamp'):
                ts = datetime.fromtimestamp(timestamp.timestamp(), tz=timezone.utc)
            else:
                ts = datetime.now(timezone.utc)

            return {
                'windows_event_id': event_id,
                'event_type': event_type,
                'username': username or None,
                'detail': detail,
                'success': success,
                'timestamp': ts,
                'windows_record_id': str(record.RecordNumber),
            }

        except Exception as exc:
            logger.debug('Error parsing SQL event %s: %s', getattr(record, 'RecordNumber', '?'), exc)
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
