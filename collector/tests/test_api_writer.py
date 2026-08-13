"""Testes para api_writer.py"""
import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch


def _make_login_event(record_id: str = '1001') -> dict:
    return {
        'windows_event_id': 4624,
        'username': 'joao',
        'domain': 'EMPRESA',
        'source_ip': '192.168.1.100',
        'workstation': 'PC-JOAO',
        'logon_type': 10,
        'logon_type_name': 'RemoteInteractive',
        'success': True,
        'failure_reason': None,
        'timestamp': datetime(2026, 6, 23, 10, 0, 0, tzinfo=timezone.utc),
        'windows_record_id': record_id,
    }


def _make_process_event(record_id: str = '2001') -> dict:
    return {
        'windows_event_id': 4688,
        'username': 'joao',
        'domain': 'EMPRESA',
        'process_name': 'powershell.exe',
        'process_path': 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        'command_line': 'powershell.exe -Command Get-Date',
        'parent_process_name': 'explorer.exe',
        'parent_process_id': 1234,
        'process_id': 5678,
        'timestamp': datetime(2026, 6, 23, 10, 0, 0, tzinfo=timezone.utc),
        'windows_record_id': record_id,
    }


class TestSubmitLoginEvents:
    def test_deve_postar_eventos_na_api(self):
        import sys
        sys.path.insert(0, 'C:/projetos/adlogs/collector')
        import api_writer

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {'inserted': 1}

        with patch('api_writer.requests.post', return_value=mock_resp) as mock_post:
            result = api_writer.submit_login_events(
                [_make_login_event()],
                'http://api:3001',
                'adlogs_testkey',
            )

        assert result == 1
        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args
        assert call_kwargs[1]['headers']['X-Server-Key'] == 'adlogs_testkey'
        payload = call_kwargs[1]['json']
        assert len(payload['events']) == 1
        assert payload['events'][0]['username'] == 'joao'
        assert isinstance(payload['events'][0]['timestamp'], str)

    def test_deve_retornar_zero_em_lista_vazia(self):
        import sys
        sys.path.insert(0, 'C:/projetos/adlogs/collector')
        import api_writer

        result = api_writer.submit_login_events([], 'http://api:3001', 'adlogs_key')
        assert result == 0

    def test_deve_levantar_excecao_em_erro_de_api(self):
        """Falha de envio NAO pode virar 0 silencioso — o coletor precisa
        distinguir 'nada inserido' de 'nao consegui enviar' para nao avancar
        o checkpoint por cima de eventos que nunca chegaram ao banco."""
        import sys
        sys.path.insert(0, 'C:/projetos/adlogs/collector')
        import api_writer

        with patch('api_writer.requests.post', side_effect=Exception('timeout')):
            with pytest.raises(api_writer.SubmissionError):
                api_writer.submit_login_events(
                    [_make_login_event()], 'http://api:3001', 'adlogs_key'
                )

    def test_deve_retornar_zero_sem_erro_quando_todos_duplicados(self):
        """Envio bem-sucedido com 0 inseridos (todos duplicados) e sucesso,
        nao falha — o checkpoint deve avancar normalmente."""
        import sys
        sys.path.insert(0, 'C:/projetos/adlogs/collector')
        import api_writer

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {'inserted': 0}

        with patch('api_writer.requests.post', return_value=mock_resp):
            result = api_writer.submit_login_events(
                [_make_login_event()], 'http://api:3001', 'adlogs_key'
            )

        assert result == 0

    def test_deve_levantar_excecao_em_status_http_de_erro(self):
        import sys
        sys.path.insert(0, 'C:/projetos/adlogs/collector')
        import api_writer
        import requests

        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_resp.raise_for_status.side_effect = requests.HTTPError('401 Unauthorized')

        with patch('api_writer.requests.post', return_value=mock_resp):
            with pytest.raises(api_writer.SubmissionError):
                api_writer.submit_login_events(
                    [_make_login_event()], 'http://api:3001', 'adlogs_key'
                )


class TestSubmitProcessEvents:
    def test_deve_postar_eventos_de_processo(self):
        import sys
        sys.path.insert(0, 'C:/projetos/adlogs/collector')
        import api_writer

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {'inserted': 1}

        with patch('api_writer.requests.post', return_value=mock_resp) as mock_post:
            result = api_writer.submit_process_events(
                [_make_process_event()],
                'http://api:3001',
                'adlogs_testkey',
            )

        assert result == 1
        call_kwargs = mock_post.call_args
        payload = call_kwargs[1]['json']
        # A API recebe camelCase (ver CollectorService DTOs)
        assert payload['events'][0]['processName'] == 'powershell.exe'
