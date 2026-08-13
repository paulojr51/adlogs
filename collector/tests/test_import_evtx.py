"""Testes do importador de .evtx historicos.

O importador e' a unica via de recuperacao quando o coletor ficou parado: ele
le os Archive-Security-*.evtx e reinsere os eventos. Duas falhas o tornavam
inutil na pratica:

1. Escrevia direto no PostgreSQL sem preencher server_id (NOT NULL no schema),
   entao todo INSERT falhava — e o erro era engolido, reportando 0 inseridos
   como se fossem duplicatas.
2. Um lote que falhava era contado como "0 inseridos", indistinguivel de
   "ja existia", escondendo perda de dados no meio de uma importacao longa.
"""
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.modules['win32evtlog'] = MagicMock()
sys.modules['win32evtlogutil'] = MagicMock()
sys.modules['win32con'] = MagicMock()
sys.modules['winerror'] = MagicMock()

sys.path.insert(0, 'C:/projetos/adlogs/collector')


def _load_module():
    import importlib
    import import_evtx
    importlib.reload(import_evtx)
    return import_evtx


class TestSubmissaoViaApi:
    def test_nao_deve_depender_de_acesso_direto_ao_banco(self):
        """A importacao passa pela API, que resolve o serverId pela X-Server-Key.
        Depender de db_writer era a causa do server_id ausente."""
        mod = _load_module()
        assert not hasattr(mod, 'insert_login_events'), (
            'import_evtx ainda usa db_writer — server_id ficaria nulo'
        )

    def test_deve_contar_apenas_lotes_confirmados(self):
        mod = _load_module()
        eventos = [{'windows_record_id': str(i)} for i in range(3)]

        total = mod.import_in_batches(eventos, lambda lote: len(lote), 'Login', simulate=False)

        assert total == 3

    def test_deve_abortar_quando_lote_falha_apos_tentativas(self):
        """Falha de envio nao pode virar '0 inseridos' silencioso no meio de
        uma recuperacao — o operador precisa saber onde parou."""
        mod = _load_module()
        eventos = [{'windows_record_id': '1'}]

        def sempre_falha(_lote):
            raise mod.SubmissionError('API fora do ar')

        with patch.object(mod.time, 'sleep'):
            with pytest.raises(mod.SubmissionError):
                mod.import_in_batches(eventos, sempre_falha, 'Login', simulate=False)

    def test_deve_reenviar_lote_antes_de_desistir(self):
        mod = _load_module()
        eventos = [{'windows_record_id': '1'}]
        tentativas = {'n': 0}

        def falha_uma_vez(lote):
            tentativas['n'] += 1
            if tentativas['n'] == 1:
                raise mod.SubmissionError('blip de rede')
            return len(lote)

        with patch.object(mod.time, 'sleep'):
            total = mod.import_in_batches(eventos, falha_uma_vez, 'Login', simulate=False)

        assert total == 1
        assert tentativas['n'] == 2

    def test_modo_simulacao_nao_deve_enviar_nada(self):
        mod = _load_module()
        eventos = [{'windows_record_id': '1'}, {'windows_record_id': '2'}]
        enviado = MagicMock()

        total = mod.import_in_batches(eventos, enviado, 'Login', simulate=True)

        assert total == 2
        enviado.assert_not_called()


class TestFiltroDeLeitura:
    """Auditar leitura gera volume desproporcional: no cliente Belvedere,
    70% dos eventos de arquivo sao READ. Permitir descarta-los na importacao
    corta o tempo de recuperacao pela mesma proporcao.
    """

    def test_deve_descartar_eventos_de_leitura(self):
        mod = _load_module()
        eventos = [
            {'action': 'READ', 'file_path': 'a.txt'},
            {'action': 'WRITE', 'file_path': 'b.txt'},
            {'action': 'DELETE', 'file_path': 'c.txt'},
            {'action': 'READ', 'file_path': 'd.txt'},
        ]

        resultado = mod.filtrar_acoes(eventos, sem_leitura=True)

        assert len(resultado) == 2
        assert {e['action'] for e in resultado} == {'WRITE', 'DELETE'}

    def test_deve_manter_tudo_quando_filtro_desligado(self):
        mod = _load_module()
        eventos = [
            {'action': 'READ', 'file_path': 'a.txt'},
            {'action': 'WRITE', 'file_path': 'b.txt'},
        ]

        assert mod.filtrar_acoes(eventos, sem_leitura=False) == eventos

    def test_deve_preservar_permission_change(self):
        """PERMISSION_CHANGE nao e' leitura e nao pode ser descartado."""
        mod = _load_module()
        eventos = [
            {'action': 'PERMISSION_CHANGE', 'file_path': 'a.txt'},
            {'action': 'READ', 'file_path': 'b.txt'},
        ]

        resultado = mod.filtrar_acoes(eventos, sem_leitura=True)

        assert len(resultado) == 1
        assert resultado[0]['action'] == 'PERMISSION_CHANGE'

    def test_deve_tolerar_lista_vazia(self):
        mod = _load_module()
        assert mod.filtrar_acoes([], sem_leitura=True) == []


class TestValidacaoDeConfiguracao:
    def test_deve_exigir_server_api_key(self):
        """Sem chave, a API nao sabe a qual servidor os eventos pertencem."""
        mod = _load_module()
        with patch.object(mod, 'SERVER_API_KEY', ''):
            with pytest.raises(SystemExit):
                mod.validar_configuracao()

    def test_deve_aceitar_server_api_key_presente(self):
        mod = _load_module()
        with patch.object(mod, 'SERVER_API_KEY', 'adlogs_abc123'):
            mod.validar_configuracao()


class TestDescobertaDeArquivos:
    def test_deve_encontrar_evtx_em_pasta_recursiva(self, tmp_path):
        mod = _load_module()
        (tmp_path / 'sub').mkdir()
        (tmp_path / 'Archive-Security-1.evtx').write_bytes(b'x')
        (tmp_path / 'sub' / 'Archive-Security-2.evtx').write_bytes(b'x')
        (tmp_path / 'ignorar.txt').write_bytes(b'x')

        arquivos = mod.find_evtx_files(str(tmp_path))

        assert len(arquivos) == 2
        assert all(a.endswith('.evtx') for a in arquivos)

    def test_deve_encerrar_quando_caminho_nao_existe(self, tmp_path):
        mod = _load_module()
        with pytest.raises(SystemExit):
            mod.find_evtx_files(str(tmp_path / 'nao-existe'))
