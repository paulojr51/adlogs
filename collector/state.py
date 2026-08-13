"""
Persistência da marca d'água de leitura do Event Log.

O coletor guarda, por categoria de evento, até onde já leu. Antes esse
controle vivia apenas em memória: reiniciar o serviço zerava a posição e o
coletor voltava a ler somente os últimos N eventos, pulando em silêncio tudo
que tivesse acontecido durante a parada.

A marca d'água tem dois componentes:
  - record_id: o RecordNumber do Windows (rápido, mas reinicia quando o log
    é limpo ou arquivado por tamanho);
  - timestamp: o horário do evento (nunca reinicia — é a referência confiável).

O arquivo fica em %PROGRAMDATA%\\ADLogs\\state.json.
"""
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger('adlogs.state')

STATE_DIR: str = os.path.join(os.environ.get('PROGRAMDATA', 'C:\\ProgramData'), 'ADLogs')
STATE_PATH: str = os.path.join(STATE_DIR, 'state.json')

# Categorias de evento rastreadas
KINDS = ('login', 'file', 'process', 'account', 'sql')


def load_state(path: str | None = None) -> dict[str, Any]:
    """Carrega o estado do disco.

    Nunca levanta exceção: um estado ausente ou corrompido faz o coletor
    recomeçar do zero, o que é preferível a derrubar o serviço.
    """
    target = path or STATE_PATH
    if not os.path.exists(target):
        return {}

    try:
        with open(target, 'r', encoding='utf-8') as handle:
            data = json.load(handle)
    except (OSError, ValueError) as exc:
        logger.warning('Estado ilegivel em %s (%s) — recomecando do zero.', target, exc)
        return {}

    if not isinstance(data, dict):
        logger.warning('Estado com formato inesperado em %s — recomecando do zero.', target)
        return {}

    return data


def save_state(state: dict[str, Any], path: str | None = None) -> None:
    """Grava o estado no disco de forma atômica.

    A escrita passa por um arquivo temporário e só então é renomeada: uma
    queda de energia no meio da gravação não deixa um state.json truncado.
    """
    target = path or STATE_PATH
    directory = os.path.dirname(target)

    try:
        if directory:
            os.makedirs(directory, exist_ok=True)

        temp = f'{target}.tmp'
        with open(temp, 'w', encoding='utf-8') as handle:
            json.dump(state, handle, indent=2)
        os.replace(temp, target)
    except OSError as exc:
        logger.error('Nao foi possivel gravar o estado em %s: %s', target, exc)


def get_watermark(
    state: dict[str, Any],
    kind: str,
) -> tuple[int | None, datetime | None]:
    """Retorna (record_id, timestamp) da categoria, ou (None, None)."""
    entry = state.get(kind)
    if not isinstance(entry, dict):
        return None, None

    raw_id = entry.get('record_id')
    record_id = raw_id if isinstance(raw_id, int) else None

    timestamp = None
    raw_ts = entry.get('timestamp')
    if isinstance(raw_ts, str):
        try:
            parsed = datetime.fromisoformat(raw_ts)
            timestamp = parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            logger.warning('Timestamp invalido no estado de %s: %r', kind, raw_ts)

    return record_id, timestamp


def set_watermark(
    state: dict[str, Any],
    kind: str,
    record_id: int | None,
    timestamp: datetime | None,
) -> None:
    """Atualiza a marca d'água de uma categoria no dicionário de estado."""
    state[kind] = {
        'record_id': record_id,
        'timestamp': timestamp.isoformat() if timestamp else None,
    }
