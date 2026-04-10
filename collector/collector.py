"""
ADLogs Collector — loop principal de coleta.

Responsável por:
1. Ler eventos do Windows Event Log (login e arquivo)
2. Persistir no PostgreSQL
3. Reportar heartbeat à API
4. Buscar configuração de pastas monitoradas da API
"""
import logging
import socket
import time
from datetime import datetime, timezone

import requests

from config import API_URL, COLLECTOR_VERSION, POLL_INTERVAL
from db_writer import insert_login_events, insert_file_events
from event_reader import EventReader

logger = logging.getLogger('adlogs.collector')


class Collector:
    """Gerencia o ciclo de coleta e persistência."""

    def __init__(self):
        self.reader = EventReader()
        self.hostname = socket.gethostname()
        self.running = False
        self._last_login_record_id: int | None = None
        self._last_file_record_id: int | None = None
        self._monitored_folders: list[str] = []
        self._events_today = 0
        self._login_today = 0
        self._file_today = 0
        self._last_day: int | None = None

    def start(self):
        """Inicia o loop de coleta."""
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
        """Um ciclo de coleta."""
        try:
            login_events = self.reader.read_login_events(self._last_login_record_id)
            if login_events:
                inserted = insert_login_events(login_events)
                self._login_today += inserted
                self._events_today += inserted
                if login_events:
                    # Atualiza o último record processado
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
                    inserted = insert_file_events(file_events)
                    self._file_today += inserted
                    self._events_today += inserted
                    if file_events:
                        self._last_file_record_id = int(file_events[0].get('windows_record_id', 0) or 0)
                    logger.info('File events: %d lidos, %d inseridos', len(file_events), inserted)
        except Exception as exc:
            logger.error('Erro ao coletar file events: %s', exc)

    def _heartbeat(self):
        """Envia heartbeat para a API."""
        try:
            requests.post(
                f'{API_URL}/api/collector/heartbeat',
                json={
                    'version': COLLECTOR_VERSION,
                    'hostname': self.hostname,
                    'eventsToday': self._events_today,
                    'loginToday': self._login_today,
                    'fileToday': self._file_today,
                },
                timeout=5,
            )
        except Exception as exc:
            logger.debug('Heartbeat falhou (API pode estar offline): %s', exc)

    def _fetch_config(self):
        """Busca configuração de pastas monitoradas da API."""
        try:
            resp = requests.get(f'{API_URL}/api/collector/config', timeout=5)
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
            self._last_day = today
            self._fetch_config()  # Recarrega configuração uma vez por dia
