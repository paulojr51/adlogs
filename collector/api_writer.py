"""
Submissão de eventos para a API central do ADLogs.

Substitui o acesso direto ao PostgreSQL — todos os eventos agora
vão via HTTPS com autenticação por X-Server-Key.
"""
import logging
from datetime import datetime
from typing import Any

import requests

logger = logging.getLogger('adlogs.api_writer')

_TIMEOUT = 10


def _serialize_event(event: dict[str, Any]) -> dict[str, Any]:
    """Converte datetime para ISO string e retorna cópia segura para JSON."""
    result = {}
    for key, value in event.items():
        result[key] = value.isoformat() if isinstance(value, datetime) else value
    return result


def _post_batch(
    endpoint: str,
    events: list[dict[str, Any]],
    api_url: str,
    api_key: str,
) -> int:
    if not events:
        return 0

    payload = {'events': [_serialize_event(e) for e in events]}
    headers = {'X-Server-Key': api_key, 'Content-Type': 'application/json'}

    try:
        resp = requests.post(
            f'{api_url}/api/collector/{endpoint}',
            json=payload,
            headers=headers,
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json().get('inserted', 0)
    except Exception as exc:
        logger.error('Falha ao submeter %s (%d eventos): %s', endpoint, len(events), exc)
        return 0


def submit_login_events(events: list[dict[str, Any]], api_url: str, api_key: str) -> int:
    return _post_batch('events/login', events, api_url, api_key)


def submit_file_events(events: list[dict[str, Any]], api_url: str, api_key: str) -> int:
    return _post_batch('events/file', events, api_url, api_key)


def submit_process_events(events: list[dict[str, Any]], api_url: str, api_key: str) -> int:
    return _post_batch('events/process', events, api_url, api_key)
