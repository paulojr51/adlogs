r"""
ADLogs — Verificador de deteccao de exclusao de arquivo

Detectar exclusao e' a funcao principal do sistema, e a logica que a sustenta
e' delicada: o Windows nao gera 4663 com DELETE para ARQUIVOS (so para pastas),
entao a deteccao depende do evento 4656 com a mascara certa. O parser precisa
distinguir uma exclusao real de um Office abrindo o arquivo para editar, que
tambem pede DELETE na mascara.

Como essa logica foi calibrada contra os eventos que a SACL atual produz,
qualquer mudanca de auditoria pode quebra-la em silencio. Este script fecha
esse risco: cria um arquivo, apaga, le o Security log com o MESMO parser de
producao e diz se a exclusao foi detectada.

Rode ANTES e DEPOIS de mexer em SACL ou politica de auditoria, e compare.

Uso:
    .\venv\Scripts\python.exe testar-exclusao.py E:\dados\Dropbox

    # Mostrando os campos brutos do evento (para diagnostico)
    .\venv\Scripts\python.exe testar-exclusao.py E:\dados\Dropbox --detalhado
"""
import argparse
import os
import sys
import time
import uuid
from datetime import datetime, timezone

_dir = os.path.dirname(os.path.abspath(__file__))
if _dir not in sys.path:
    sys.path.insert(0, _dir)

import win32evtlog  # type: ignore[import]

from config import FILE_EVENT_IDS
from event_reader import EventReader

SEGUNDOS_ESPERA = 15
INTERVALO_TENTATIVA = 3


def criar_e_excluir(pasta: str) -> str:
    """Cria um arquivo de teste e o exclui. Retorna o caminho usado."""
    nome = f'_adlogs_teste_exclusao_{uuid.uuid4().hex[:8]}.txt'
    caminho = os.path.join(pasta, nome)

    with open(caminho, 'w', encoding='utf-8') as f:
        f.write('Arquivo temporario de verificacao do ADLogs.\n')

    # Pequena pausa: sem ela, criacao e exclusao podem colapsar num unico
    # handle e o evento sai diferente do caso real.
    time.sleep(1)
    os.remove(caminho)
    return caminho


def coletar_eventos_do_arquivo(pasta: str, caminho: str) -> list[dict]:
    """Le o Security log com o parser de producao e filtra pelo arquivo alvo."""
    leitor = EventReader()
    alvo = os.path.basename(caminho).lower()

    # Sem marca d'agua: pega os eventos mais recentes.
    eventos = leitor.read_file_events([pasta])
    return [e for e in eventos if alvo in (e.get('file_path') or '').lower()]


def dump_eventos_brutos(caminho: str) -> None:
    """Mostra os campos crus dos 4656/4663 do arquivo alvo.

    Serve para diagnosticar quando o parser NAO detecta: revela se o evento
    nem foi gerado (problema de SACL) ou se foi gerado com mascara inesperada
    (problema de parsing).
    """
    alvo = os.path.basename(caminho).lower()
    print()
    print('  Campos brutos dos eventos encontrados:')
    print('  ' + '-' * 58)

    try:
        handle = win32evtlog.OpenEventLog(None, 'Security')
    except Exception as exc:
        print(f'    Nao foi possivel abrir o Security log: {exc}')
        return

    flags = win32evtlog.EVENTLOG_BACKWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ
    achou = False
    lidos = 0

    try:
        while lidos < 3000:
            lote = win32evtlog.ReadEventLog(handle, flags, 0)
            if not lote:
                break
            for registro in lote:
                lidos += 1
                event_id = registro.EventID & 0xFFFF
                if event_id not in FILE_EVENT_IDS:
                    continue
                strings = registro.StringInserts or []
                texto = ' '.join(s for s in strings if s).lower()
                if alvo not in texto:
                    continue

                achou = True
                print(f'    Event ID   : {event_id}')
                for indice, valor in enumerate(strings):
                    if valor and valor.strip():
                        print(f'      [{indice:2}] {valor.strip()[:90]}')
                print()
    except Exception as exc:
        print(f'    Erro lendo o log: {exc}')
    finally:
        try:
            win32evtlog.CloseEventLog(handle)
        except Exception:
            pass

    if not achou:
        print('    Nenhum evento 4656/4663 encontrado para este arquivo.')
        print('    Indica que o Windows NAO gerou o evento — problema de SACL')
        print('    ou de politica de auditoria, nao de parsing.')


def main() -> int:
    parser = argparse.ArgumentParser(
        description='Verifica se a deteccao de exclusao de arquivo esta funcionando',
    )
    parser.add_argument('pasta', help='Pasta monitorada (ex: E:\\dados\\Dropbox)')
    parser.add_argument('--detalhado', action='store_true',
                        help='Mostra os campos brutos do evento')
    args = parser.parse_args()

    pasta = args.pasta
    if not os.path.isdir(pasta):
        print(f'ERRO: pasta nao encontrada: {pasta}')
        return 1

    print()
    print('=' * 62)
    print('  ADLogs — Verificacao de deteccao de exclusao')
    print('=' * 62)
    print(f'  Pasta  : {pasta}')
    print(f'  Inicio : {datetime.now(timezone.utc).astimezone():%d/%m/%Y %H:%M:%S}')
    print()

    try:
        caminho = criar_e_excluir(pasta)
    except OSError as exc:
        print(f'ERRO: nao foi possivel criar/excluir arquivo de teste: {exc}')
        return 1

    print(f'  Arquivo de teste criado e excluido:')
    print(f'    {caminho}')
    print()
    print(f'  Aguardando o Windows gravar o evento (ate {SEGUNDOS_ESPERA}s)...')

    encontrados: list[dict] = []
    esperado = 0
    while esperado < SEGUNDOS_ESPERA:
        time.sleep(INTERVALO_TENTATIVA)
        esperado += INTERVALO_TENTATIVA
        encontrados = coletar_eventos_do_arquivo(pasta, caminho)
        if any(e.get('action') == 'DELETE' for e in encontrados):
            break

    print()
    print('  ' + '-' * 58)

    exclusoes = [e for e in encontrados if e.get('action') == 'DELETE']

    if exclusoes:
        print('  RESULTADO: DETECCAO DE EXCLUSAO OK')
        print()
        for e in exclusoes:
            print(f'    acao      : {e["action"]}')
            print(f'    usuario   : {e.get("username")}')
            print(f'    arquivo   : {e.get("file_path")}')
            print(f'    processo  : {e.get("process_name")}')
            print(f'    horario   : {e.get("timestamp")}')
        codigo = 0
    else:
        print('  RESULTADO: EXCLUSAO NAO DETECTADA')
        print()
        if encontrados:
            print('    O evento foi gerado, mas o parser nao o classificou como')
            print('    exclusao. Acoes detectadas para este arquivo:')
            for e in encontrados:
                print(f'      - {e.get("action")}  {e.get("file_path")}')
            print()
            print('    Isso aponta para a logica de mascara em _parse_file_event.')
        else:
            print('    Nenhum evento foi encontrado para o arquivo de teste.')
            print('    Verifique a SACL da pasta e a politica de auditoria')
            print('    (Acesso a Objetos / Object Access).')
        codigo = 1

    if args.detalhado or codigo != 0:
        dump_eventos_brutos(caminho)

    print()
    print('=' * 62)
    print()
    return codigo


if __name__ == '__main__':
    sys.exit(main())
