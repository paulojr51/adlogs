"""Escrita de eventos no PostgreSQL."""
import logging
from datetime import datetime, timezone
from typing import Any

import psycopg2
from psycopg2.extras import execute_values

from config import DB_URL

logger = logging.getLogger('adlogs.db')


def get_connection():
    """Retorna uma conexão com o banco de dados."""
    return psycopg2.connect(DB_URL)


def insert_login_events(events: list[dict[str, Any]]) -> int:
    """
    Insere uma lista de eventos de login no banco.
    Ignora duplicatas baseado em windows_record_id.
    Retorna o número de eventos inseridos.
    """
    if not events:
        return 0

    conn = None
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            # Filtra eventos já inseridos
            record_ids = [e['windows_record_id'] for e in events if e.get('windows_record_id')]
            if record_ids:
                cur.execute(
                    'SELECT windows_record_id FROM login_events WHERE windows_record_id = ANY(%s)',
                    (record_ids,)
                )
                existing = {row[0] for row in cur.fetchall()}
                events = [e for e in events if e.get('windows_record_id') not in existing]

            if not events:
                return 0

            rows = [
                (
                    e['windows_event_id'],
                    e['username'],
                    e.get('domain'),
                    e.get('source_ip'),
                    e.get('workstation'),
                    e.get('logon_type'),
                    e.get('logon_type_name'),
                    e['success'],
                    e.get('failure_reason'),
                    e['timestamp'],
                    e.get('windows_record_id'),
                )
                for e in events
            ]

            execute_values(
                cur,
                '''INSERT INTO login_events
                   (id, windows_event_id, username, domain, source_ip, workstation,
                    logon_type, logon_type_name, success, failure_reason, timestamp,
                    windows_record_id, created_at)
                   VALUES %s
                   ON CONFLICT DO NOTHING''',
                [
                    (
                        _generate_cuid(),
                        *row,
                        datetime.now(timezone.utc),
                    )
                    for row in rows
                ],
            )
            inserted = cur.rowcount
            conn.commit()
            logger.debug('Inserted %d login events', inserted)
            return inserted
    except Exception as exc:
        logger.error('Error inserting login events: %s', exc)
        if conn:
            conn.rollback()
        return 0
    finally:
        if conn:
            conn.close()


def insert_file_events(events: list[dict[str, Any]]) -> int:
    """
    Insere uma lista de eventos de arquivo no banco.
    Ignora duplicatas baseado em windows_record_id.
    """
    if not events:
        return 0

    conn = None
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            record_ids = [e['windows_record_id'] for e in events if e.get('windows_record_id')]
            if record_ids:
                cur.execute(
                    'SELECT windows_record_id FROM file_events WHERE windows_record_id = ANY(%s)',
                    (record_ids,)
                )
                existing = {row[0] for row in cur.fetchall()}
                events = [e for e in events if e.get('windows_record_id') not in existing]

            if not events:
                return 0

            rows = [
                (
                    e['windows_event_id'],
                    e['username'],
                    e.get('domain'),
                    e['file_path'],
                    e.get('monitored_folder'),
                    e['action'],
                    e.get('process_name'),
                    e.get('process_id'),
                    e['timestamp'],
                    e.get('windows_record_id'),
                )
                for e in events
            ]

            execute_values(
                cur,
                '''INSERT INTO file_events
                   (id, windows_event_id, username, domain, file_path, monitored_folder,
                    action, process_name, process_id, timestamp, windows_record_id, created_at)
                   VALUES %s
                   ON CONFLICT DO NOTHING''',
                [
                    (
                        _generate_cuid(),
                        *row,
                        datetime.now(timezone.utc),
                    )
                    for row in rows
                ],
            )
            inserted = cur.rowcount
            conn.commit()
            logger.debug('Inserted %d file events', inserted)
            return inserted
    except Exception as exc:
        logger.error('Error inserting file events: %s', exc)
        if conn:
            conn.rollback()
        return 0
    finally:
        if conn:
            conn.close()


def _generate_cuid() -> str:
    """Gera um ID compatível com o formato cuid do Prisma."""
    import random
    import string
    import time
    timestamp = format(int(time.time() * 1000), 'x')
    random_part = ''.join(random.choices(string.ascii_lowercase + string.digits, k=16))
    return f'c{timestamp}{random_part}'
