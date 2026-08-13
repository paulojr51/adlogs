"""Testes da persistencia da marca d'agua entre reinicios do servico.

Sem persistencia, reiniciar o servico zera a posicao de leitura e o coletor
volta a ler apenas os ultimos N eventos — qualquer coisa acumulada durante a
parada e' pulada silenciosamente.
"""
import json
import sys
from datetime import datetime, timezone

sys.path.insert(0, 'C:/projetos/adlogs/collector')


def _utc(*args) -> datetime:
    return datetime(*args, tzinfo=timezone.utc)


class TestPersistenciaDeEstado:
    def test_deve_retornar_vazio_quando_arquivo_nao_existe(self, tmp_path):
        import state
        caminho = str(tmp_path / 'inexistente.json')
        assert state.load_state(caminho) == {}

    def test_deve_salvar_e_recarregar_marca_dagua(self, tmp_path):
        import state
        caminho = str(tmp_path / 'state.json')

        dados = {}
        state.set_watermark(dados, 'login', 150, _utc(2026, 8, 13, 10, 0))
        state.save_state(dados, caminho)

        recarregado = state.load_state(caminho)
        record_id, timestamp = state.get_watermark(recarregado, 'login')

        assert record_id == 150
        assert timestamp == _utc(2026, 8, 13, 10, 0)

    def test_deve_retornar_none_para_categoria_desconhecida(self, tmp_path):
        import state
        record_id, timestamp = state.get_watermark({}, 'file')
        assert record_id is None
        assert timestamp is None

    def test_deve_tolerar_arquivo_corrompido(self, tmp_path):
        """Estado corrompido nao pode derrubar o servico — melhor recomecar."""
        import state
        caminho = str(tmp_path / 'state.json')
        with open(caminho, 'w', encoding='utf-8') as f:
            f.write('{isso nao e json')

        assert state.load_state(caminho) == {}

    def test_deve_tolerar_timestamp_invalido_no_arquivo(self, tmp_path):
        import state
        caminho = str(tmp_path / 'state.json')
        with open(caminho, 'w', encoding='utf-8') as f:
            json.dump({'login': {'record_id': 10, 'timestamp': 'data-quebrada'}}, f)

        record_id, timestamp = state.get_watermark(state.load_state(caminho), 'login')
        assert record_id == 10
        assert timestamp is None

    def test_deve_criar_diretorio_do_arquivo_se_necessario(self, tmp_path):
        import state
        caminho = str(tmp_path / 'sub' / 'dir' / 'state.json')

        dados = {}
        state.set_watermark(dados, 'file', 7, _utc(2026, 8, 13, 11, 0))
        state.save_state(dados, caminho)

        assert state.get_watermark(state.load_state(caminho), 'file')[0] == 7

    def test_deve_preservar_categorias_independentes(self, tmp_path):
        import state
        caminho = str(tmp_path / 'state.json')

        dados = {}
        state.set_watermark(dados, 'login', 150, _utc(2026, 8, 13, 10, 0))
        state.set_watermark(dados, 'file', 900, _utc(2026, 8, 13, 9, 0))
        state.save_state(dados, caminho)

        recarregado = state.load_state(caminho)
        assert state.get_watermark(recarregado, 'login')[0] == 150
        assert state.get_watermark(recarregado, 'file')[0] == 900
