"""Testes para parsing do Event ID 4688 (Process Creation) no EventReader."""
import sys
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

# Mock das dependências Windows antes de importar event_reader
sys.modules['win32evtlog'] = MagicMock()
sys.modules['win32evtlogutil'] = MagicMock()
sys.modules['win32con'] = MagicMock()
sys.modules['winerror'] = MagicMock()

sys.path.insert(0, 'C:/projetos/adlogs/collector')


def _make_record(event_id: int, strings: list[str], record_number: int = 9001) -> MagicMock:
    record = MagicMock()
    record.EventID = event_id
    record.RecordNumber = record_number
    record.StringInserts = strings
    ts = MagicMock()
    ts.timestamp.return_value = datetime(2026, 6, 23, 10, 0, 0, tzinfo=timezone.utc).timestamp()
    record.TimeGenerated = ts
    return record


class TestParseProcessEvent:
    """Testa _parse_process_event do EventReader."""

    def setup_method(self):
        import importlib
        import event_reader
        importlib.reload(event_reader)
        from event_reader import EventReader
        self.reader = EventReader()

    def test_deve_parsear_evento_4688_basico(self):
        strings = [
            'S-1-5-21-...', 'joao', 'EMPRESA', 'S-1-5-...', '0x1234',  # 0-4
            '0x5678',        # 5 = NewProcessId (hex)
            'C:\\Windows\\System32\\cmd.exe',  # 6 = NewProcessName
            '%%1936',        # 7 = TokenElevationType
            '0x1000',        # 8 = ProcessId (parentProcessId, hex)
            'cmd.exe /c dir',  # 9 = CommandLine
            '',              # 10
            '',              # 11
            '',              # 12
            'explorer.exe',  # 13 = ParentProcessName
        ]
        record = _make_record(4688, strings)
        result = self.reader._parse_process_event(record)

        assert result is not None
        assert result['username'] == 'joao'
        assert result['domain'] == 'EMPRESA'
        assert result['process_path'] == 'C:\\Windows\\System32\\cmd.exe'
        assert result['process_name'] == 'cmd.exe'
        assert result['command_line'] == 'cmd.exe /c dir'
        assert result['parent_process_name'] == 'explorer.exe'
        assert result['windows_event_id'] == 4688
        assert isinstance(result['timestamp'], datetime)

    def test_deve_ignorar_conta_de_sistema(self):
        strings = ['', 'SISTEMA$', 'NT AUTHORITY', '', '', '0x1234',
                   'C:\\Windows\\svchost.exe', '', '0x100', '', '', '', '', 'services.exe']
        record = _make_record(4688, strings)
        result = self.reader._parse_process_event(record)
        assert result is None

    def test_deve_ignorar_username_vazio(self):
        strings = ['', '', 'EMPRESA', '', '', '0x1234',
                   'C:\\Windows\\cmd.exe', '', '0x100', '', '', '', '', 'explorer.exe']
        record = _make_record(4688, strings)
        result = self.reader._parse_process_event(record)
        assert result is None

    def test_deve_retornar_none_em_excecao(self):
        record = MagicMock()
        record.EventID = 4688
        record.StringInserts = None  # vai causar erro ao indexar
        record.RecordNumber = 9999
        result = self.reader._parse_process_event(record)
        assert result is None

    def test_deve_extrair_nome_do_processo_do_path(self):
        strings = ['', 'maria', 'CORP', '', '', '0xabc',
                   'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
                   '', '0x200', 'firefox.exe --profile C:\\Users\\maria\\profile',
                   '', '', '', 'explorer.exe']
        record = _make_record(4688, strings)
        result = self.reader._parse_process_event(record)
        assert result is not None
        assert result['process_name'] == 'firefox.exe'
