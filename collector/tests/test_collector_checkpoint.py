"""Testes do avanco de checkpoint do Collector.

Duas garantias, ambas aprendidas de falhas reais em producao:

1. O checkpoint so avanca quando ha confirmacao de que os eventos chegaram ao
   banco. Avancar apos falha de envio descarta esses eventos permanentemente.
2. O checkpoint sobrevive a reinicio do servico e ao reset do RecordNumber
   (log limpo/arquivado por tamanho).
"""
import sys
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

# Mock das dependencias Windows antes de importar o coletor
sys.modules['win32evtlog'] = MagicMock()
sys.modules['win32evtlogutil'] = MagicMock()
sys.modules['win32con'] = MagicMock()
sys.modules['winerror'] = MagicMock()

sys.path.insert(0, 'C:/projetos/adlogs/collector')


def _utc(*args) -> datetime:
    return datetime(*args, tzinfo=timezone.utc)


def _make_login_event(record_id: str, when: datetime | None = None) -> dict:
    return {
        'windows_event_id': 4624,
        'username': 'joao',
        'success': True,
        'timestamp': when or _utc(2026, 8, 13, 10, 0),
        'windows_record_id': record_id,
    }


def _build_collector(tmp_path):
    import importlib
    import collector as collector_mod
    importlib.reload(collector_mod)
    c = collector_mod.Collector(state_path=str(tmp_path / 'state.json'))
    c.reader = MagicMock()
    c._collect_logins = True
    c._collect_files = False
    c._collect_processes = False
    c._collect_accounts = False
    c._collect_sql = False
    return collector_mod, c


def _watermark(c, kind='login'):
    import state
    return state.get_watermark(c._state, kind)


class TestAvancoDeCheckpoint:
    def test_nao_deve_avancar_checkpoint_quando_envio_falha(self, tmp_path):
        collector_mod, c = _build_collector(tmp_path)
        import state
        state.set_watermark(c._state, 'login', 100, _utc(2026, 8, 13, 8, 0))
        c.reader.read_login_events.return_value = [_make_login_event('150')]

        with patch.object(
            collector_mod,
            'submit_login_events',
            side_effect=collector_mod.SubmissionError('API fora do ar'),
        ):
            c._collect()

        assert _watermark(c)[0] == 100, (
            'checkpoint avancou apos falha de envio — eventos perdidos'
        )

    def test_nao_deve_contar_eventos_do_dia_quando_envio_falha(self, tmp_path):
        collector_mod, c = _build_collector(tmp_path)
        c.reader.read_login_events.return_value = [_make_login_event('150')]

        with patch.object(
            collector_mod,
            'submit_login_events',
            side_effect=collector_mod.SubmissionError('API fora do ar'),
        ):
            c._collect()

        assert c._today['login'] == 0
        assert c._events_today == 0

    def test_deve_avancar_checkpoint_quando_envio_confirma(self, tmp_path):
        collector_mod, c = _build_collector(tmp_path)
        c.reader.read_login_events.return_value = [
            _make_login_event('150', _utc(2026, 8, 13, 10, 0))
        ]

        with patch.object(collector_mod, 'submit_login_events', return_value=1):
            c._collect()

        record_id, timestamp = _watermark(c)
        assert record_id == 150
        assert timestamp == _utc(2026, 8, 13, 10, 0)
        assert c._today['login'] == 1

    def test_deve_avancar_checkpoint_quando_todos_ja_eram_duplicados(self, tmp_path):
        """0 inseridos com envio bem-sucedido e' sucesso — nao pode travar."""
        collector_mod, c = _build_collector(tmp_path)
        c.reader.read_login_events.return_value = [_make_login_event('150')]

        with patch.object(collector_mod, 'submit_login_events', return_value=0):
            c._collect()

        assert _watermark(c)[0] == 150


class TestPersistenciaDoCheckpoint:
    def test_deve_persistir_checkpoint_em_disco_apos_coleta(self, tmp_path):
        collector_mod, c = _build_collector(tmp_path)
        c.reader.read_login_events.return_value = [
            _make_login_event('150', _utc(2026, 8, 13, 10, 0))
        ]

        with patch.object(collector_mod, 'submit_login_events', return_value=1):
            c._collect()

        import state
        salvo = state.load_state(str(tmp_path / 'state.json'))
        assert state.get_watermark(salvo, 'login')[0] == 150

    def test_deve_retomar_checkpoint_do_disco_ao_iniciar(self, tmp_path):
        """Reinicio do servico nao pode voltar a ler so os ultimos N eventos."""
        import state
        caminho = str(tmp_path / 'state.json')
        dados = {}
        state.set_watermark(dados, 'login', 4242, _utc(2026, 8, 13, 7, 0))
        state.save_state(dados, caminho)

        import importlib
        import collector as collector_mod
        importlib.reload(collector_mod)
        c = collector_mod.Collector(state_path=caminho)

        assert state.get_watermark(c._state, 'login') == (4242, _utc(2026, 8, 13, 7, 0))

    def test_deve_repassar_marca_dagua_de_tempo_ao_leitor(self, tmp_path):
        """O leitor precisa do timestamp para sobreviver ao reset do RecordNumber."""
        collector_mod, c = _build_collector(tmp_path)
        import state
        state.set_watermark(c._state, 'login', 4242, _utc(2026, 8, 13, 7, 0))
        c.reader.read_login_events.return_value = []

        c._collect()

        c.reader.read_login_events.assert_called_once_with(4242, _utc(2026, 8, 13, 7, 0))

    def test_nao_deve_gravar_estado_quando_nao_ha_eventos(self, tmp_path):
        collector_mod, c = _build_collector(tmp_path)
        c.reader.read_login_events.return_value = []

        c._collect()

        import state
        assert state.get_watermark(c._state, 'login') == (None, None)


class TestRelatorioDeUltimoEvento:
    """O heartbeat precisa carregar ate onde a coleta realmente chegou.

    Sem isso o dashboard so sabe que o processo esta vivo — foi exatamente essa
    cegueira que manteve um servidor 'verde' por 23 dias sem coletar nada.
    """

    def test_deve_reportar_evento_mais_recente_entre_categorias(self, tmp_path):
        collector_mod, c = _build_collector(tmp_path)
        import state
        state.set_watermark(c._state, 'login', 10, _utc(2026, 8, 13, 9, 0))
        state.set_watermark(c._state, 'file', 20, _utc(2026, 8, 13, 11, 0))
        state.set_watermark(c._state, 'process', 30, _utc(2026, 8, 13, 7, 0))

        assert c._last_event_at() == _utc(2026, 8, 13, 11, 0)

    def test_deve_reportar_none_quando_nada_foi_coletado(self, tmp_path):
        _, c = _build_collector(tmp_path)
        assert c._last_event_at() is None

    def test_deve_enviar_last_event_at_no_heartbeat(self, tmp_path):
        collector_mod, c = _build_collector(tmp_path)
        import state
        state.set_watermark(c._state, 'login', 10, _utc(2026, 8, 13, 9, 0))

        with patch.object(collector_mod, 'SERVER_API_KEY', 'adlogs_key'), \
             patch.object(collector_mod.requests, 'post') as post:
            c._heartbeat()

        payload = post.call_args[1]['json']
        assert payload['lastEventAt'] == _utc(2026, 8, 13, 9, 0).isoformat()

    def test_deve_omitir_last_event_at_quando_nada_foi_coletado(self, tmp_path):
        collector_mod, c = _build_collector(tmp_path)

        with patch.object(collector_mod, 'SERVER_API_KEY', 'adlogs_key'), \
             patch.object(collector_mod.requests, 'post') as post:
            c._heartbeat()

        payload = post.call_args[1]['json']
        assert 'lastEventAt' not in payload
