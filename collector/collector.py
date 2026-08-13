"""
ADLogs Collector — loop principal de coleta.

Responsável por:
1. Ler eventos do Windows Event Log (login, arquivo, processo, conta, SQL)
2. Submeter eventos para a API central via HTTPS (autenticado por X-Server-Key)
3. Reportar heartbeat à API
4. Buscar configuração de coleta da API (pastas monitoradas + flags por servidor)
"""
import logging
import socket
import time
from datetime import datetime, timezone

import requests

from config import API_URL, COLLECTOR_VERSION, POLL_INTERVAL, SERVER_API_KEY
from api_writer import (
    SubmissionError,
    submit_login_events, submit_file_events, submit_process_events,
    submit_account_events, submit_sql_events,
)
from event_reader import EventReader
import state

logger = logging.getLogger('adlogs.collector')


class Collector:
    """Gerencia o ciclo de coleta e submissão para a API central."""

    def __init__(self, state_path: str | None = None):
        self.reader = EventReader()
        self.hostname = socket.gethostname()
        self.running = False
        self._state_path = state_path or state.STATE_PATH
        # Marca d'água por categoria, retomada do disco — sobrevive a reinício
        # do serviço e ao reset do RecordNumber do Windows.
        self._state = state.load_state(self._state_path)
        self._monitored_folders: list[str] = []
        self._events_today = 0
        self._today: dict[str, int] = {kind: 0 for kind in state.KINDS}
        self._last_day: int | None = None
        self._headers = {'X-Server-Key': SERVER_API_KEY}
        # Flags de coleta — carregados de /collector/config
        self._collect_logins = True
        self._collect_files = True
        self._collect_processes = False
        self._collect_accounts = False
        self._collect_sql = False

    def start(self):
        """Inicia o loop de coleta."""
        if not SERVER_API_KEY:
            logger.warning(
                'SERVER_API_KEY não configurada — heartbeat e submissão de eventos desabilitados. '
                'Gere uma chave no painel de Servidores e configure SERVER_API_KEY no .env.'
            )

        logger.info('ADLogs Collector v%s iniciando em %s', COLLECTOR_VERSION, self.hostname)
        self.running = True
        self._fetch_config()

        while self.running:
            try:
                self._reset_daily_counters()
                self._collect()
                self._heartbeat()
            except Exception as exc:
                logger.error('Erro no ciclo de coleta: %s', exc)
            time.sleep(POLL_INTERVAL)

    def stop(self):
        """Para o loop de coleta graciosamente."""
        logger.info('Parando coletor...')
        self.running = False

    def _collect(self):
        """Um ciclo de coleta e submissão, uma categoria por vez."""
        self._collect_kind(
            'login',
            self._collect_logins,
            self.reader.read_login_events,
            submit_login_events,
        )
        self._collect_kind(
            'file',
            self._collect_files and bool(self._monitored_folders),
            lambda rid, ts: self.reader.read_file_events(self._monitored_folders, rid, ts),
            submit_file_events,
        )
        self._collect_kind(
            'process',
            self._collect_processes,
            self.reader.read_process_events,
            submit_process_events,
        )
        self._collect_kind(
            'account',
            self._collect_accounts,
            self.reader.read_account_events,
            submit_account_events,
        )
        self._collect_kind(
            'sql',
            self._collect_sql,
            self.reader.read_sql_events,
            submit_sql_events,
        )

    def _collect_kind(self, kind: str, enabled: bool, read_fn, submit_fn) -> None:
        """Lê, submete e avança a marca d'água de uma categoria de evento.

        A ordem aqui é deliberada: a marca d'água só avança DEPOIS que o envio
        retorna sem erro. `submit_fn` levanta SubmissionError quando não
        conseguiu entregar — nesse caso a exceção sobe até o except abaixo e a
        marca d'água fica onde estava, para reler os mesmos eventos no próximo
        ciclo. Avançar antes da confirmação perde eventos para sempre.
        """
        if not enabled:
            return

        try:
            last_record_id, last_timestamp = state.get_watermark(self._state, kind)
            events = read_fn(last_record_id, last_timestamp)
            if not events:
                return

            inserted = submit_fn(events, API_URL, SERVER_API_KEY)

            self._advance_watermark(kind, events)
            self._today[kind] += inserted
            self._events_today += inserted
            logger.info('%s events: %d lidos, %d inseridos', kind, len(events), inserted)
        except Exception as exc:
            logger.error('Erro ao coletar %s events: %s', kind, exc)

    def _advance_watermark(self, kind: str, events: list[dict]) -> None:
        """Move a marca d'água para o evento mais recente do lote e persiste.

        A leitura é retroativa (do mais novo ao mais antigo), então events[0]
        é o mais recente. Guardamos também o timestamp: é ele que sustenta a
        retomada quando o Windows reinicia a contagem de RecordNumber.
        """
        newest = events[0]

        try:
            record_id = int(newest.get('windows_record_id', 0) or 0)
        except (TypeError, ValueError):
            record_id = None

        timestamp = newest.get('timestamp')
        if not isinstance(timestamp, datetime):
            timestamp = None

        state.set_watermark(self._state, kind, record_id, timestamp)
        state.save_state(self._state, self._state_path)

    def _last_event_at(self) -> datetime | None:
        """Evento mais recente já entregue, considerando todas as categorias.

        É o que permite ao dashboard separar "processo vivo" de "coletando":
        se a leitura travar, este valor congela enquanto o heartbeat continua.
        """
        timestamps = [
            ts
            for ts in (state.get_watermark(self._state, kind)[1] for kind in state.KINDS)
            if ts is not None
        ]
        return max(timestamps) if timestamps else None

    def _heartbeat(self):
        """Envia heartbeat para a API."""
        if not SERVER_API_KEY:
            return

        payload = {
            'version': COLLECTOR_VERSION,
            'hostname': self.hostname,
            'eventsToday': self._events_today,
            'loginToday': self._today['login'],
            'fileToday': self._today['file'],
            'processToday': self._today['process'],
            'accountToday': self._today['account'],
            'sqlToday': self._today['sql'],
        }

        # Omitido quando nada foi coletado ainda: a API preserva o último valor
        # conhecido em vez de sobrescrevê-lo com vazio.
        ultimo_evento = self._last_event_at()
        if ultimo_evento is not None:
            payload['lastEventAt'] = ultimo_evento.isoformat()

        try:
            requests.post(
                f'{API_URL}/api/collector/heartbeat',
                json=payload,
                headers=self._headers,
                timeout=5,
            )
        except Exception as exc:
            logger.debug('Heartbeat falhou (API pode estar offline): %s', exc)

    def _fetch_config(self):
        """Busca configuração e flags de coleta da API."""
        if not SERVER_API_KEY:
            self._monitored_folders = []
            return
        try:
            resp = requests.get(
                f'{API_URL}/api/collector/config',
                headers=self._headers,
                timeout=5,
            )
            data = resp.json()
            self._monitored_folders = data.get('monitoredFolders', [])
            self._collect_logins    = data.get('collectLogins', True)
            self._collect_files     = data.get('collectFiles', True)
            self._collect_processes = data.get('collectProcesses', False)
            self._collect_accounts  = data.get('collectAccountChanges', False)
            self._collect_sql       = data.get('collectSqlServer', False)
            logger.info(
                'Config: pastas=%d logins=%s arquivos=%s processos=%s contas=%s sql=%s',
                len(self._monitored_folders),
                self._collect_logins, self._collect_files,
                self._collect_processes, self._collect_accounts, self._collect_sql,
            )
        except Exception as exc:
            logger.warning('Não foi possível buscar configuração da API: %s', exc)
            self._monitored_folders = []

    def _reset_daily_counters(self):
        """Reseta contadores diários à meia-noite."""
        today = datetime.now(timezone.utc).day
        if self._last_day is None:
            self._last_day = today
        elif today != self._last_day:
            self._events_today = 0
            for kind in self._today:
                self._today[kind] = 0
            self._last_day = today
            self._fetch_config()
