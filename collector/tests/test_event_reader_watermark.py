"""Testes da marca d'agua (watermark) de leitura do Event Log.

O RecordNumber do Windows NAO e' monotonico ao longo do tempo: quando o
Security log e' limpo ou arquivado por tamanho (AutoBackupLogFiles), a
contagem reinicia em 1. Parar a leitura por `record_number <= last_record_id`
faz o coletor descartar TODO evento novo indefinidamente apos um reset —
sem erro, sem log, com o heartbeat continuando normal.

O timestamp nunca reinicia, por isso e' ele a marca d'agua primaria.
"""
import sys
from datetime import datetime, timezone
from unittest.mock import MagicMock

sys.modules['win32evtlog'] = MagicMock()
sys.modules['win32evtlogutil'] = MagicMock()
sys.modules['win32con'] = MagicMock()
sys.modules['winerror'] = MagicMock()

sys.path.insert(0, 'C:/projetos/adlogs/collector')


def _utc(*args) -> datetime:
    return datetime(*args, tzinfo=timezone.utc)


def _make_login_record(record_number: int, when: datetime, username: str = 'joao') -> MagicMock:
    record = MagicMock()
    record.EventID = 4624
    record.RecordNumber = record_number
    strings = [''] * 20
    strings[5] = username
    strings[6] = 'EMPRESA'
    strings[8] = '10'
    strings[11] = 'PC-JOAO'
    strings[18] = '192.168.1.10'
    record.StringInserts = strings
    ts = MagicMock()
    ts.timestamp.return_value = when.timestamp()
    record.TimeGenerated = ts
    return record


def _reader_with_records(records: list):
    """Reader com o Event Log mockado devolvendo `records` (do mais novo ao mais antigo)."""
    import importlib
    import event_reader
    importlib.reload(event_reader)
    event_reader.win32evtlog.OpenEventLog = MagicMock(return_value='HANDLE')
    event_reader.win32evtlog.CloseEventLog = MagicMock()
    event_reader.win32evtlog.ReadEventLog = MagicMock(side_effect=[records, []])
    event_reader.win32evtlog.EVENTLOG_BACKWARDS_READ = 1
    event_reader.win32evtlog.EVENTLOG_SEQUENTIAL_READ = 2
    return event_reader, event_reader.EventReader()


class TestWatermarkDeLogin:
    def test_deve_retornar_eventos_novos_apos_reset_do_record_number(self):
        """Causa raiz: log arquivado em 21/07 zerou o RecordNumber."""
        registros = [
            _make_login_record(3, _utc(2026, 8, 13, 10, 0)),
            _make_login_record(2, _utc(2026, 8, 13, 9, 0)),
            _make_login_record(1, _utc(2026, 8, 13, 8, 0)),
        ]
        _, reader = _reader_with_records(registros)

        eventos = reader.read_login_events(
            last_record_id=50000,
            last_timestamp=_utc(2026, 7, 21, 12, 0),
        )

        assert len(eventos) == 3, (
            'eventos novos descartados apos reset do RecordNumber — '
            'coleta ficaria parada indefinidamente'
        )

    def test_deve_parar_nos_eventos_ja_processados_usando_timestamp(self):
        registros = [
            _make_login_record(105, _utc(2026, 8, 13, 10, 0)),
            _make_login_record(104, _utc(2026, 8, 13, 9, 0)),
            _make_login_record(103, _utc(2026, 8, 13, 7, 0)),
        ]
        _, reader = _reader_with_records(registros)

        eventos = reader.read_login_events(
            last_record_id=103,
            last_timestamp=_utc(2026, 8, 13, 8, 0),
        )

        assert len(eventos) == 2
        assert {e['windows_record_id'] for e in eventos} == {'105', '104'}

    def test_deve_ler_tudo_quando_nao_ha_marca_dagua(self):
        registros = [
            _make_login_record(2, _utc(2026, 8, 13, 10, 0)),
            _make_login_record(1, _utc(2026, 8, 13, 9, 0)),
        ]
        _, reader = _reader_with_records(registros)

        eventos = reader.read_login_events()

        assert len(eventos) == 2

    def test_deve_registrar_aviso_quando_record_number_recua(self, caplog):
        """O reset precisa ser visivel no log — foi o silencio que escondeu
        a falha do cliente por 23 dias."""
        import logging
        registros = [_make_login_record(3, _utc(2026, 8, 13, 10, 0))]
        _, reader = _reader_with_records(registros)

        with caplog.at_level(logging.WARNING, logger='adlogs.reader'):
            reader.read_login_events(
                last_record_id=50000,
                last_timestamp=_utc(2026, 7, 21, 12, 0),
            )

        assert any('recuou' in r.message.lower() or 'reset' in r.message.lower()
                   for r in caplog.records), 'reset do RecordNumber nao foi logado'

    def test_deve_usar_record_id_quando_timestamp_ausente(self):
        """Compatibilidade: primeira execucao apos upgrade ainda nao tem
        timestamp persistido."""
        registros = [
            _make_login_record(105, _utc(2026, 8, 13, 10, 0)),
            _make_login_record(104, _utc(2026, 8, 13, 9, 0)),
            _make_login_record(103, _utc(2026, 8, 13, 8, 0)),
        ]
        _, reader = _reader_with_records(registros)

        eventos = reader.read_login_events(last_record_id=104)

        assert len(eventos) == 1
        assert eventos[0]['windows_record_id'] == '105'
