"""Configuração do coletor ADLogs."""
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# Banco de dados (usado apenas por import_evtx.py — não pelo coletor principal)
DB_URL: str = os.environ.get('DB_URL', 'postgresql://adlogs:adlogs@localhost:5434/adlogs')

# API central
API_URL: str = os.environ.get('API_URL', 'http://localhost:3001')

# Chave de API deste servidor (gerada no painel de Servidores)
SERVER_API_KEY: str = os.environ.get('SERVER_API_KEY', '')

# Polling
POLL_INTERVAL: int = int(os.environ.get('POLL_INTERVAL', '30'))

# Versão
# 2.1.0 — marca d'água persistida e à prova de reset do RecordNumber,
#         checkpoint só avança com envio confirmado, lastEventAt no heartbeat.
COLLECTOR_VERSION: str = os.environ.get('COLLECTOR_VERSION', '2.1.0')

# Serviço Windows
SERVICE_NAME: str = os.environ.get('SERVICE_NAME', 'ADLogsCollector')
SERVICE_DISPLAY_NAME: str = os.environ.get('SERVICE_DISPLAY_NAME', 'ADLogs - Coletor de Auditoria')
SERVICE_DESCRIPTION: str = os.environ.get(
    'SERVICE_DESCRIPTION',
    'Coleta eventos de login e acesso a arquivos do Windows Event Log.'
)

# IDs de eventos de Processo
PROCESS_EVENT_IDS = {
    4688: 'Processo criado',
}

# IDs de eventos de Gestão de Contas
ACCOUNT_EVENT_IDS = {
    4720: 'Conta de usuário criada',
    4722: 'Conta de usuário habilitada',
    4725: 'Conta de usuário desabilitada',
    4726: 'Conta de usuário removida',
    4740: 'Conta de usuário bloqueada',
    4723: 'Tentativa de alteração de senha',
    4724: 'Senha redefinida por administrador',
    4728: 'Membro adicionado ao grupo global',
    4729: 'Membro removido do grupo global',
    4732: 'Membro adicionado ao grupo local',
    4733: 'Membro removido do grupo local',
}

# IDs de eventos do SQL Server (Application Log)
SQL_EVENT_IDS = {
    18456: 'Login SQL Server falhou',
    17806: 'Falha de autenticação SSPI',
    17852: 'Falha de autenticação',
    7036:  'Serviço iniciado ou parado',
}
SQL_EVENT_SOURCE: str = 'MSSQLSERVER'

# IDs de eventos de Login/Logoff
LOGIN_EVENT_IDS = {
    4624: 'Logon bem-sucedido',
    4625: 'Falha de logon',
    4634: 'Logoff',
    4647: 'Logoff iniciado pelo usuário',
    4648: 'Logon com credenciais explícitas',
}

# IDs de eventos de Arquivo
# Nota: 4660 (Objeto excluído) foi removido pois não contém o nome do arquivo.
# 4656 (Handle solicitado) é usado para capturar exclusão de arquivos — o Windows
# gera 4656 com DELETE quando um arquivo é aberto para exclusão, mas não gera 4663.
FILE_EVENT_IDS = {
    4663: 'Acesso a objeto tentado',
    4656: 'Handle a objeto solicitado',
    4670: 'Permissões de objeto alteradas',
}

# Mapeamento de tipos de logon
LOGON_TYPES = {
    2: 'Interactive',
    3: 'Network',
    4: 'Batch',
    5: 'Service',
    7: 'Unlock',
    8: 'NetworkCleartext',
    9: 'NewCredentials',
    10: 'RemoteInteractive',
    11: 'CachedInteractive',
}

# Mapeamento de ações de arquivo por AccessMask (hex exato)
ACCESS_MASK_TO_ACTION = {
    '0x1': 'READ',
    '0x2': 'WRITE',
    '0x4': 'WRITE',
    '0x6': 'WRITE',
    '0x40': 'WRITE',
    '0x80': 'READ',
    '0x100': 'READ',
    '0x10000': 'DELETE',
}

# Formato %% usado pelo Windows 2016/2019/2022 em vez de hex
WINDOWS_MSG_TO_ACTION = {
    '%%4416': 'READ',    # ReadData / ListDirectory
    '%%4417': 'WRITE',   # WriteData / AddFile
    '%%4418': 'WRITE',   # AppendData / AddSubdirectory
    '%%4419': 'READ',    # ReadEA
    '%%4420': 'WRITE',   # WriteEA
    '%%4421': 'READ',    # Execute / Traverse
    '%%4423': 'READ',    # ReadAttributes
    '%%4424': 'WRITE',   # WriteAttributes
    '%%1537': 'DELETE',  # DELETE
    '%%1538': 'READ',    # READ_CONTROL
    '%%1539': 'WRITE',   # WRITE_DAC (alteração de permissão)
}
