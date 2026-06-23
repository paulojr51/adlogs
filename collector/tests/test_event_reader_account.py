"""Testes para parsing de eventos de gestão de contas (4720, 4740, 4728)."""
import sys
import types
import datetime

# Mock de módulos Windows
for mod in ('win32evtlog', 'win32evtlogutil', 'win32con', 'pywintypes'):
    sys.modules.setdefault(mod, types.ModuleType(mod))

import win32con
win32con.EVENTLOG_BACKWARDS_READ = 8
win32con.EVENTLOG_SEQUENTIAL_READ = 4

import pytest
sys.path.insert(0, 'C:/projetos/adlogs/collector')
from event_reader import EventReader


def _make_record(event_id: int, strings: list[str], record_number: int = 1):
    rec = type('Record', (), {})()
    rec.EventID = event_id
    rec.StringInserts = strings
    rec.TimeGenerated = datetime.datetime(2026, 6, 23, 10, 0, 0)
    rec.RecordNumber = record_number
    return rec


class TestParseAccountEvent:
    def setup_method(self):
        self.reader = EventReader.__new__(EventReader)

    def test_deve_parsear_criacao_de_conta_4720(self):
        rec = _make_record(4720, [
            'novo.usuario',   # [0] targetUsername
            'EMPRESA',        # [1] targetDomain
            '',               # [2] groupName (N/A)
            '',               # [3]
            'admin.rh',       # [4] actorUsername
            'EMPRESA',        # [5] actorDomain
        ])
        result = self.reader._parse_account_event(rec)

        assert result is not None
        assert result['event_type'] == 'USER_CREATED'
        assert result['target_username'] == 'novo.usuario'
        assert result['target_domain'] == 'EMPRESA'
        assert result['actor_username'] == 'admin.rh'
        assert result['windows_event_id'] == 4720

    def test_deve_parsear_bloqueio_de_conta_4740(self):
        rec = _make_record(4740, [
            'joao.silva',
            'EMPRESA',
            '',
            '',
            'WIN-SRV-01$',
            'EMPRESA',
        ])
        result = self.reader._parse_account_event(rec)

        assert result is not None
        assert result['event_type'] == 'USER_LOCKED'
        assert result['target_username'] == 'joao.silva'

    def test_deve_parsear_adicao_a_grupo_4728(self):
        rec = _make_record(4728, [
            'joao.silva',     # [0] targetUsername (membro adicionado)
            'EMPRESA',        # [1] targetDomain
            'Domain Admins',  # [2] groupName
            '',               # [3]
            'admin',          # [4] actorUsername
            'EMPRESA',        # [5] actorDomain
        ])
        result = self.reader._parse_account_event(rec)

        assert result is not None
        assert result['event_type'] == 'GROUP_MEMBER_ADDED'
        assert result['target_username'] == 'joao.silva'
        assert result['group_name'] == 'Domain Admins'

    def test_deve_ignorar_contas_de_sistema(self):
        rec = _make_record(4720, [
            'SISTEMA$',
            'NT AUTHORITY',
            '', '', '', '',
        ])
        result = self.reader._parse_account_event(rec)
        assert result is None

    def test_deve_retornar_none_em_excecao(self):
        rec = _make_record(4720, None)
        result = self.reader._parse_account_event(rec)
        assert result is None
