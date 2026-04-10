==============================================================
  ADLogs — Sistema de Auditoria de Acessos Windows
  Documentação de Funcionamento
==============================================================


1. VISÃO GERAL
--------------
O ADLogs é composto por duas partes independentes:

  [SERVIDOR LINUX / NUVEM]          [SERVIDOR WINDOWS / AD]
  ┌─────────────────────┐           ┌──────────────────────┐
  │  Docker             │           │  Coletor Python      │
  │  ├── PostgreSQL     │◄──────────│  (Windows Service)   │
  │  ├── API (NestJS)   │           │                      │
  │  ├── Frontend       │           │  Lê o Event Log do   │
  │  └── Nginx          │           │  Windows e envia     │
  └─────────────────────┘           │  para o banco        │
         ↑                          └──────────────────────┘
    Acessado via
    navegador web


2. COMO O COLETOR FUNCIONA
--------------------------
O coletor é um Windows Service (serviço do Windows) escrito em Python
que roda em segundo plano no servidor AD/Windows.

A cada ciclo (padrão: 30 segundos) ele:

  a) Abre o Security Event Log do Windows via API win32evtlog
  b) Lê os eventos novos desde o último processado (por RecordNumber)
  c) Filtra apenas os Event IDs relevantes:
       Login/Logoff: 4624 (sucesso), 4625 (falha), 4634, 4647 (logoff),
                     4648 (credenciais explícitas)
       Arquivos:     4663 (acesso), 4660 (exclusão), 4670 (permissão)
  d) Insere os eventos diretamente no PostgreSQL
  e) Envia um heartbeat HTTP para a API informando que está vivo

O serviço inicia automaticamente com o Windows e se reinicia em caso
de falha. Logs do próprio coletor ficam em:
  C:\ProgramData\ADLogs\collector.log


3. COMO CONFIGURAR O IP DO SERVIDOR
------------------------------------
Todas as configurações ficam em um único arquivo:
  C:\adlog\collector\.env

Edite esse arquivo para apontar para o servidor correto:

  DB_URL=postgresql://adlogs:adlogs@IP_DO_SERVIDOR:5434/adlogs
  API_URL=http://IP_DO_SERVIDOR
  POLL_INTERVAL=30

Exemplos:

  # Servidor local na rede
  DB_URL=postgresql://adlogs:adlogs@192.168.1.75:5434/adlogs
  API_URL=http://192.168.1.75

  # Servidor na nuvem (AWS, Azure, etc.)
  DB_URL=postgresql://adlogs:adlogs@meuservidor.com:5434/adlogs
  API_URL=http://meuservidor.com

Após editar o .env, reinicie o serviço:
  Stop-Service ADLogsCollector
  Start-Service ADLogsCollector

SIM — o servidor Docker pode estar em qualquer lugar: rede local,
VPS, AWS, Azure, etc. O coletor só precisa conseguir alcançar a
porta 5434 (banco) e porta 80 (API) do servidor. Basta liberar essas
portas no firewall do servidor.


4. COMO FUNCIONA A LEITURA DOS LOGS DO WINDOWS
-----------------------------------------------
O Windows Event Log NÃO é um arquivo de texto. É um banco de dados
binário gerenciado pelo próprio Windows, acessado via API do sistema
(win32evtlog). O coletor usa essa API — não lê arquivos .evtx
diretamente.

Sobre o tamanho dos logs:
  - O Windows rotaciona o Security Event Log automaticamente quando
    atinge o tamanho configurado (padrão: 20 MB, recomendado: 1 GB+)
  - Quando o log "gira" (é sobrescrito), os RecordNumbers continuam
    crescendo de forma sequencial — não reiniciam do zero
  - O coletor rastreia o último RecordNumber processado em memória.
    Na próxima execução, lê apenas eventos com RecordNumber maior
    que o último visto, independente de quantas rotações ocorreram

Para configurar o tamanho máximo do Security Log no servidor AD:
  1. Abra o Event Viewer (eventvwr.msc)
  2. Windows Logs → Security → clique direito → Properties
  3. Defina "Maximum log size" para 1024000 KB (1 GB) ou mais
  4. Marque "Overwrite events as needed"


5. COMO É EVITADA A DUPLICIDADE
---------------------------------
Há duas camadas de proteção contra duplicatas:

  Camada 1 — Leitura inteligente (event_reader.py):
    O coletor mantém o último RecordNumber processado em memória.
    A cada ciclo, só lê eventos com RecordNumber maior que esse valor.
    Assim, nunca relê o que já foi processado (enquanto o serviço
    está rodando).

  Camada 2 — Banco de dados (db_writer.py):
    Antes de inserir qualquer lote, o coletor consulta o banco:
      SELECT windows_record_id FROM login_events
      WHERE windows_record_id = ANY(lista_de_ids)
    e descarta os que já existem.

    A inserção final usa ON CONFLICT DO NOTHING como terceira garantia.

  Resultado: mesmo que o serviço seja reiniciado e releia eventos já
  processados, nada é duplicado no banco.

  ATENÇÃO: Se o serviço ficar muito tempo parado (dias), ao reiniciar
  ele lê os últimos 1000 eventos de login (e 5000 de arquivo) para
  recuperar o que ficou para trás. Eventos mais antigos que isso podem
  não ser recuperados se o log do Windows já os sobrescreveu.


6. MÚLTIPLOS COLETORES (MÚLTIPLOS SERVIDORES AD)
-------------------------------------------------
É possível instalar o coletor em quantos servidores Windows quiser,
todos apontando para o mesmo banco/API. Cada coletor identifica de
qual servidor veio o evento pelo campo "hostname" registrado no
heartbeat. Os eventos de login já incluem o campo "workstation"
(nome da máquina de origem) registrado pelo próprio Windows.


7. ESTRUTURA DE PORTAS
-----------------------
  5434 → PostgreSQL (banco de dados)
          Precisa estar acessível a partir dos servidores Windows
          onde o coletor está instalado.

  80   → Nginx → Frontend (interface web) + API (REST)
          Precisa estar acessível a partir dos navegadores dos
          usuários e dos servidores com o coletor.

  443  → HTTPS (opcional, requer certificado SSL configurado no Nginx)


8. MONITORAMENTO DE ARQUIVOS
------------------------------
Por padrão o coletor coleta apenas logins. Para coletar acesso a
arquivos é necessário:

  No servidor Windows:
    1. Habilitar política de auditoria:
       secpol.msc → Local Policies → Audit Policy
       → Audit object access → Success e Failure

    2. Configurar SACL nas pastas desejadas:
       Clique direito na pasta → Properties → Security
       → Advanced → Auditing → Add → selecionar usuários/grupos
       → marcar os tipos de acesso a auditar

  No sistema ADLogs (interface web):
    - Ir em Configurações → Pastas Monitoradas → Adicionar
    - Informar o caminho exato da pasta (ex: C:\Dados\Financeiro)
    - O coletor busca essa configuração da API a cada ciclo


9. LOGS DO PRÓPRIO COLETOR
----------------------------
  C:\ProgramData\ADLogs\collector.log

  Rotação automática: máximo 10 MB por arquivo, mantém 5 arquivos
  (collector.log, collector.log.1, ... collector.log.5)
  Total máximo: ~50 MB de log do próprio coletor.

  Para acompanhar em tempo real via PowerShell:
    Get-Content "C:\ProgramData\ADLogs\collector.log" -Wait -Tail 50


10. COMANDOS ÚTEIS (PowerShell como Admin no servidor AD)
----------------------------------------------------------
  # Ver status do serviço
  Get-Service ADLogsCollector

  # Iniciar / Parar / Reiniciar
  Start-Service ADLogsCollector
  Stop-Service ADLogsCollector
  Restart-Service ADLogsCollector

  # Ver logs em tempo real
  Get-Content "C:\ProgramData\ADLogs\collector.log" -Wait -Tail 50

  # Testar sem instalar como serviço (modo debug)
  C:\adlog\collector\venv\Scripts\python.exe C:\adlog\collector\service.py debug

  # Desinstalar o serviço
  C:\adlog\collector\.\install.ps1 -Uninstall


==============================================================
