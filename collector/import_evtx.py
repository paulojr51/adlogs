"""
ADLogs — Importador de logs historicos (.evtx)

Lê arquivos de log do Windows Event Log (.evtx) e importa os eventos
para o banco de dados do ADLogs. Útil para migração de clientes que
possuem histórico de logs armazenado em arquivos.

Uso:
    # Importar um arquivo específico
    python import_evtx.py C:\\Windows\\System32\\winevt\\Logs\\Security.evtx

    # Importar todos os .evtx de uma pasta (recursivo)
    python import_evtx.py C:\\Backup\\Logs\\

    # Importar pasta com filtro de data (apenas eventos a partir de)
    python import_evtx.py C:\\Backup\\Logs\\ --desde 2025-01-01

    # Modo simulacao (nao insere no banco, apenas conta)
    python import_evtx.py C:\\Backup\\Logs\\ --simular
"""
import argparse
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Garante diretorio correto e carrega .env antes de importar config
_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(_dir)
if _dir not in sys.path:
    sys.path.insert(0, _dir)

_env_path = os.path.join(_dir, '.env')
if os.path.exists(_env_path):
    with open(_env_path, 'r', encoding='utf-8-sig') as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _key, _val = _line.split('=', 1)
                os.environ.setdefault(_key.strip(), _val.strip())

import win32evtlog  # type: ignore[import]

from config import LOGIN_EVENT_IDS, FILE_EVENT_IDS, LOGON_TYPES, DB_URL
from db_writer import insert_login_events, insert_file_events
from event_reader import _clean_ip, _access_mask_to_action

import socket
HOSTNAME = socket.gethostname()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s: %(message)s',
)
logger = logging.getLogger('adlogs.import')

BATCH_SIZE = 500  # Insere em lotes para não sobrecarregar o banco


# ─── Leitura de arquivo .evtx ────────────────────────────────────────────────

def read_evtx_file(
    filepath: str,
    since: datetime | None = None,
) -> tuple[list[dict], list[dict]]:
    """
    Lê um arquivo .evtx e retorna (login_events, file_events).
    'since' filtra eventos anteriores à data informada.
    """
    login_events: list[dict[str, Any]] = []
    file_events: list[dict[str, Any]] = []
    total_read = 0
    skipped_date = 0
    skipped_system = 0

    try:
        handle = win32evtlog.OpenBackupEventLog(None, filepath)
    except Exception as exc:
        logger.error('Nao foi possivel abrir %s: %s', filepath, exc)
        return [], []

    flags = win32evtlog.EVENTLOG_FORWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ

    try:
        while True:
            batch = win32evtlog.ReadEventLog(handle, flags, 0)
            if not batch:
                break

            for record in batch:
                total_read += 1

                event_id = record.EventID & 0xFFFF

                if event_id not in LOGIN_EVENT_IDS and event_id not in FILE_EVENT_IDS:
                    continue

                # Converte timestamp
                raw_ts = record.TimeGenerated
                if hasattr(raw_ts, 'timestamp'):
                    ts = datetime.fromtimestamp(raw_ts.timestamp(), tz=timezone.utc)
                else:
                    ts = datetime.now(timezone.utc)

                # Filtra por data se informado
                if since and ts < since:
                    skipped_date += 1
                    continue

                strings = record.StringInserts or []

                if event_id in LOGIN_EVENT_IDS:
                    parsed = _parse_login(record, event_id, strings, ts)
                    if parsed is None:
                        skipped_system += 1
                    elif parsed:
                        login_events.append(parsed)
                elif event_id in FILE_EVENT_IDS:
                    parsed = _parse_file(record, event_id, strings, ts)
                    if parsed is None:
                        skipped_system += 1
                    elif parsed:
                        file_events.append(parsed)

    except Exception as exc:
        logger.error('Erro lendo %s: %s', filepath, exc)
    finally:
        try:
            win32evtlog.CloseEventLog(handle)
        except Exception:
            pass

    logger.debug(
        '%s: %d eventos lidos, %d login, %d arquivo, %d filtrados por data, %d contas sistema',
        os.path.basename(filepath), total_read, len(login_events), len(file_events),
        skipped_date, skipped_system
    )
    return login_events, file_events


def _parse_login(record: Any, event_id: int, strings: list, ts: datetime) -> dict | None:
    """Retorna None para eventos de sistema, {} para não reconhecidos, dict para válidos."""
    try:
        username = ''
        domain = ''
        source_ip = None
        workstation = None
        logon_type = None
        logon_type_name = None
        failure_reason = None
        success = event_id in (4624, 4634, 4647, 4648)

        if event_id == 4624:
            username = strings[5] if len(strings) > 5 else ''
            domain = strings[6] if len(strings) > 6 else ''
            logon_type = int(strings[8]) if len(strings) > 8 and strings[8].isdigit() else None
            logon_type_name = LOGON_TYPES.get(logon_type, '') if logon_type else None
            workstation = strings[11] if len(strings) > 11 else None
            source_ip = strings[18] if len(strings) > 18 else None

        elif event_id == 4625:
            username = strings[5] if len(strings) > 5 else ''
            domain = strings[6] if len(strings) > 6 else ''
            logon_type = int(strings[10]) if len(strings) > 10 and strings[10].isdigit() else None
            logon_type_name = LOGON_TYPES.get(logon_type, '') if logon_type else None
            workstation = strings[13] if len(strings) > 13 else None
            source_ip = strings[19] if len(strings) > 19 else None
            failure_reason = strings[8] if len(strings) > 8 else None

        elif event_id in (4634, 4647):
            username = strings[1] if len(strings) > 1 else ''
            domain = strings[2] if len(strings) > 2 else ''
            logon_type = int(strings[4]) if len(strings) > 4 and strings[4].isdigit() else None

        elif event_id == 4648:
            username = strings[5] if len(strings) > 5 else ''
            domain = strings[6] if len(strings) > 6 else ''
            source_ip = strings[12] if len(strings) > 12 else None

        if not username or username.endswith('$') or username == '-':
            return None  # Conta de sistema

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
    except Exception:
        return {}


def _parse_file(record: Any, event_id: int, strings: list, ts: datetime) -> dict | None:
    try:
        username = ''
        domain = ''
        file_path = ''
        process_name = None
        process_id = None
        action = 'READ'

        if event_id == 4663:
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

        elif event_id == 4656:  # Handle solicitado — captura exclusão de arquivo
            object_type = strings[5] if len(strings) > 5 else ''
            if object_type != 'File':
                return None
            username = strings[1] if len(strings) > 1 else ''
            domain = strings[2] if len(strings) > 2 else ''
            file_path = strings[6] if len(strings) > 6 else ''
            process_name = strings[12] if len(strings) > 12 else None
            process_id_str = strings[11] if len(strings) > 11 else '0'
            try:
                process_id = int(process_id_str, 16)
            except (ValueError, TypeError):
                process_id = None
            access_mask = strings[10].strip() if len(strings) > 10 else '0x0'
            try:
                mask_int = int(access_mask, 16)
            except (ValueError, TypeError):
                return None
            # Deleção real: tem DELETE (0x10000) sem bits de escrita (WriteData|AppendData|WriteAttributes)
            # Máscaras compostas com escrita (ex: 0x13019f) = Office abrindo arquivo para editar, não exclusão
            if not (mask_int & 0x10000) or (mask_int & 0x106):
                return None
            action = 'DELETE'
            # Ignora arquivos temporários internos (Office .tmp, ~$lockfiles, .crdownload)
            fname = os.path.basename(file_path).lower() if file_path else ''
            if fname.endswith('.tmp') or fname.startswith('~$') or fname.endswith('.crdownload'):
                return None

        elif event_id == 4670:
            username = strings[1] if len(strings) > 1 else ''
            domain = strings[2] if len(strings) > 2 else ''
            file_path = strings[6] if len(strings) > 6 else ''
            process_name = strings[11] if len(strings) > 11 else None
            action = 'PERMISSION_CHANGE'

        if not username or username.endswith('$') or username == '-':
            return None
        if not file_path:
            return None

        return {
            'windows_event_id': event_id,
            'username': username.strip(),
            'domain': domain.strip() or None,
            'file_path': file_path.strip(),
            'monitored_folder': None,  # Importacao historica nao filtra por pasta
            'action': action,
            'process_name': process_name.strip() if process_name else None,
            'process_id': process_id,
            'timestamp': ts,
            'windows_record_id': str(record.RecordNumber),
        }
    except Exception:
        return {}


# ─── Descoberta de arquivos ───────────────────────────────────────────────────

def find_evtx_files(path: str) -> list[str]:
    """Retorna lista de arquivos .evtx a processar (arquivo ou pasta recursiva)."""
    p = Path(path)
    if p.is_file():
        if p.suffix.lower() == '.evtx':
            return [str(p)]
        else:
            logger.error('Arquivo nao e .evtx: %s', path)
            sys.exit(1)
    elif p.is_dir():
        files = sorted(p.rglob('*.evtx'))
        if not files:
            logger.error('Nenhum arquivo .evtx encontrado em: %s', path)
            sys.exit(1)
        return [str(f) for f in files]
    else:
        logger.error('Caminho nao encontrado: %s', path)
        sys.exit(1)


# ─── Importacao em lotes ─────────────────────────────────────────────────────

def import_in_batches(events: list[dict], insert_fn, label: str, simulate: bool) -> int:
    """Insere eventos em lotes, retorna total inserido."""
    if not events:
        return 0
    total = 0
    for i in range(0, len(events), BATCH_SIZE):
        batch = events[i:i + BATCH_SIZE]
        if simulate:
            total += len(batch)
        else:
            inserted = insert_fn(batch)
            total += inserted
        pct = min(i + BATCH_SIZE, len(events))
        print(f'  {label}: {pct}/{len(events)} processados, {total} inseridos...', end='\r')
    print()
    return total


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Importa logs historicos .evtx para o ADLogs',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('path', help='Arquivo .evtx ou pasta com arquivos .evtx')
    parser.add_argument(
        '--desde',
        metavar='YYYY-MM-DD',
        help='Importar apenas eventos a partir desta data (ex: 2025-01-01)',
    )
    parser.add_argument(
        '--simular',
        action='store_true',
        help='Modo simulacao: conta eventos mas nao insere no banco',
    )
    args = parser.parse_args()

    since: datetime | None = None
    if args.desde:
        try:
            since = datetime.strptime(args.desde, '%Y-%m-%d').replace(tzinfo=timezone.utc)
        except ValueError:
            logger.error('Data invalida. Use o formato YYYY-MM-DD (ex: 2025-01-01)')
            sys.exit(1)

    files = find_evtx_files(args.path)

    print()
    print('=' * 60)
    print('  ADLogs — Importador de Logs Historicos')
    print('=' * 60)
    print(f'  Arquivos encontrados : {len(files)}')
    if since:
        print(f'  Importar desde       : {since.strftime("%d/%m/%Y")}')
    if args.simular:
        print('  MODO SIMULACAO       : nenhum dado sera inserido')
    print()

    total_login = 0
    total_file = 0
    total_login_inserted = 0
    total_file_inserted = 0

    for idx, filepath in enumerate(files, 1):
        size_mb = os.path.getsize(filepath) / (1024 * 1024)
        print(f'[{idx}/{len(files)}] {os.path.basename(filepath)} ({size_mb:.1f} MB)')

        login_events, file_events = read_evtx_file(filepath, since=since)

        total_login += len(login_events)
        total_file += len(file_events)

        if login_events:
            n = import_in_batches(login_events, insert_login_events, 'Login', args.simular)
            total_login_inserted += n
            print(f'  Login events: {len(login_events)} lidos, {n} inseridos')

        if file_events:
            n = import_in_batches(file_events, insert_file_events, 'Arquivo', args.simular)
            total_file_inserted += n
            print(f'  File events : {len(file_events)} lidos, {n} inseridos')

        if not login_events and not file_events:
            print('  Nenhum evento relevante encontrado neste arquivo.')

        print()

    print('=' * 60)
    print('  Importacao concluida!')
    print(f'  Login events : {total_login} lidos, {total_login_inserted} inseridos')
    print(f'  File events  : {total_file} lidos, {total_file_inserted} inseridos')
    duplicatas_login = total_login - total_login_inserted
    duplicatas_file = total_file - total_file_inserted
    if duplicatas_login or duplicatas_file:
        print(f'  Duplicatas ignoradas: {duplicatas_login + duplicatas_file} (ja existiam no banco)')
    print('=' * 60)
    print()


if __name__ == '__main__':
    main()
