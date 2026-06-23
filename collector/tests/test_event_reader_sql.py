"""Testes para parsing de eventos SQL Server do Application Log."""
import sys
import types
import datetime

for mod in ('win32evtlog', 'win32evtlogutil', 'win32con', 'pywintypes'):
    sys.modules.setdefault(mod, types.ModuleType(mod))

import win32con
win32con.EVENTLOG_BACKWARDS_READ = 8
win32con.EVENTLOG_SEQUENTIAL_READ = 4

import pytest
sys.path.insert(0, 'C:/projetos/adlogs/collector')
from event_reader import EventReader


def _make_sql_record(event_id: int, strings: list[str], source: str = 'MSSQLSERVER', record_number: int = 1):
    rec = type('Record', (), {})()
    rec.EventID = event_id
    rec.SourceName = source
    rec.StringInserts = strings
    rec.TimeGenerated = datetime.datetime(2026, 6, 23, 12, 0, 0)
    rec.RecordNumber = record_number
    return rec


class TestParseSqlEvent:
    def setup_method(self):
        self.reader = EventReader.__new__(EventReader)

    def test_deve_parsear_login_falhado_18456(self):
        rec = _make_sql_record(18456, [
            'sa',                              # [0] username
            "Login failed for user 'sa'.",     # [1] detail
        ])
        result = self.reader._parse_sql_event(rec)

        assert result is not None
        assert result['event_type'] == 'LOGIN_FAILED'
        assert result['username'] == 'sa'
        assert result['success'] is False
        assert result['windows_event_id'] == 18456

    def test_deve_parsear_falha_de_autenticacao_17806(self):
        rec = _make_sql_record(17806, [
            '',
            'SSPI handshake failed',
        ])
        result = self.reader._parse_sql_event(rec)

        assert result is not None
        assert result['event_type'] == 'AUTH_FAILURE'
        assert result['success'] is False

    def test_deve_parsear_servico_iniciado_7036(self):
        rec = _make_sql_record(7036, [
            'SQL Server (MSSQLSERVER)',
            'running',
        ])
        result = self.reader._parse_sql_event(rec)

        assert result is not None
        assert result['event_type'] == 'SERVICE_STARTED'
        assert result['success'] is True

    def test_deve_parsear_servico_parado_7036(self):
        rec = _make_sql_record(7036, [
            'SQL Server (MSSQLSERVER)',
            'stopped',
        ])
        result = self.reader._parse_sql_event(rec)

        assert result is not None
        assert result['event_type'] == 'SERVICE_STOPPED'
        assert result['success'] is False

    def test_deve_retornar_none_em_excecao(self):
        # Record com EventID que lança exceção ao acessar
        rec = type('Record', (), {
            'EventID': property(lambda self: (_ for _ in ()).throw(RuntimeError('fail'))),
            'SourceName': 'MSSQLSERVER',
            'StringInserts': [],
            'TimeGenerated': __import__('datetime').datetime(2026, 6, 23),
            'RecordNumber': 1,
        })()
        result = self.reader._parse_sql_event(rec)
        assert result is None
