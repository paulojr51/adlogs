"""
Submissão de eventos para a API central do ADLogs.

Substitui o acesso direto ao PostgreSQL — todos os eventos agora
vão via HTTPS com autenticação por X-Server-Key.
"""
import logging
import re
from datetime import datetime
from typing import Any

import requests

logger = logging.getLogger('adlogs.api_writer')

_TIMEOUT = 60


class SubmissionError(Exception):
    """Falha ao enviar eventos para a API.

    Levantada — e nunca convertida em 0 — para que o coletor consiga
    distinguir 'a API aceitou e nada era novo' de 'nao consegui enviar'.
    Sem essa distincao o checkpoint avanca por cima de eventos que nunca
    chegaram ao banco, perdendo-os permanentemente.
    """


def _snake_to_camel(name: str) -> str:
    return re.sub(r'_([a-z])', lambda m: m.group(1).upper(), name)


def _serialize_event(event: dict[str, Any]) -> dict[str, Any]:
    """Converte datetime para ISO string e chaves para camelCase (padrão da API)."""
    result = {}
    for key, value in event.items():
        camel_key = _snake_to_camel(key)
        result[camel_key] = value.isoformat() if isinstance(value, datetime) else value
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
        raise SubmissionError(
            f'{endpoint}: {len(events)} eventos nao enviados — {exc}'
        ) from exc


def submit_login_events(events: list[dict[str, Any]], api_url: str, api_key: str) -> int:
    return _post_batch('events/login', events, api_url, api_key)


def submit_file_events(events: list[dict[str, Any]], api_url: str, api_key: str) -> int:
    return _post_batch('events/file', events, api_url, api_key)


def submit_process_events(events: list[dict[str, Any]], api_url: str, api_key: str) -> int:
    return _post_batch('events/process', events, api_url, api_key)


def submit_account_events(events: list[dict[str, Any]], api_url: str, api_key: str) -> int:
    return _post_batch('events/account', events, api_url, api_key)


def submit_sql_events(events: list[dict[str, Any]], api_url: str, api_key: str) -> int:
    return _post_batch('events/sql', events, api_url, api_key)
