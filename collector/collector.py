"""
ADLogs Collector — loop principal de coleta.

Responsável por:
1. Ler eventos do Windows Event Log (login, arquivo e processo)
2. Submeter eventos para a API central via HTTPS (autenticado por X-Server-Key)
3. Reportar heartbeat à API
4. Buscar configuração de pastas monitoradas da API
"""
import logging
import socket
import time
from datetime import datetime, timezone

import requests

from config import API_URL, COLLECTOR_VERSION, POLL_INTERVAL, SERVER_API_KEY
from api_writer import submit_login_events, submit_file_events, submit_process_events
from event_reader import EventReader

logger = logging.getLogger('adlogs.collector')


class Collector:
    """Gerencia o ciclo de coleta e submissão para a API central."""

    def __init__(self):
        self.reader = EventReader()
        self.hostname = socket.gethostname()
        self.running = False
        self._last_login_record_id: int | None = None
        self._last_file_record_id: int | None = None
        self._last_process_record_id: int | None = None
        self._monitored_folders: list[str] = []
        self._events_today = 0
        self._login_today = 0
        self._file_today = 0
        self._process_today = 0
        self._last_day: int | None = None
        self._headers = {'X-Server-Key': SERVER_API_KEY}

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
        """Um ciclo de coleta e submissão."""
        try:
            login_events = self.reader.read_login_events(self._last_login_record_id)
            if login_events:
                inserted = submit_login_events(login_events, API_URL, SERVER_API_KEY)
                self._login_today += inserted
                self._events_today += inserted
                self._last_login_record_id = int(login_events[0].get('windows_record_id', 0) or 0)
                logger.info('Login events: %d lidos, %d inseridos', len(login_events), inserted)
        except Exception as exc:
            logger.error('Erro ao coletar login events: %s', exc)

        try:
            if self._monitored_folders:
                file_events = self.reader.read_file_events(
                    self._monitored_folders, self._last_file_record_id
                )
                if file_events:
                    inserted = submit_file_events(file_events, API_URL, SERVER_API_KEY)
                    self._file_today += inserted
                    self._events_today += inserted
                    self._last_file_record_id = int(file_events[0].get('windows_record_id', 0) or 0)
                    logger.info('File events: %d lidos, %d inseridos', len(file_events), inserted)
        except Exception as exc:
            logger.error('Erro ao coletar file events: %s', exc)

        try:
            process_events = self.reader.read_process_events(self._last_process_record_id)
            if process_events:
                inserted = submit_process_events(process_events, API_URL, SERVER_API_KEY)
                self._process_today += inserted
                self._events_today += inserted
                self._last_process_record_id = int(process_events[0].get('windows_record_id', 0) or 0)
                logger.info('Process events: %d lidos, %d inseridos', len(process_events), inserted)
        except Exception as exc:
            logger.error('Erro ao coletar process events: %s', exc)

    def _heartbeat(self):
        """Envia heartbeat para a API."""
        if not SERVER_API_KEY:
            return
        try:
            requests.post(
                f'{API_URL}/api/collector/heartbeat',
                json={
                    'version': COLLECTOR_VERSION,
                    'hostname': self.hostname,
                    'eventsToday': self._events_today,
                    'loginToday': self._login_today,
                    'fileToday': self._file_today,
                    'processToday': self._process_today,
                },
                headers=self._headers,
                timeout=5,
            )
        except Exception as exc:
            logger.debug('Heartbeat falhou (API pode estar offline): %s', exc)

    def _fetch_config(self):
        """Busca configuração de pastas monitoradas da API."""
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
            logger.info('Pastas monitoradas: %s', self._monitored_folders)
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
            self._login_today = 0
            self._file_today = 0
            self._process_today = 0
            self._last_day = today
            self._fetch_config()
