# Manual Operacional — ADLogs

**Versão:** 2.0  
**Público:** Equipe técnica responsável por implantação e manutenção  
**Última atualização:** 2026-06

---

## Índice

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Instalação em Novo Cliente](#2-instalação-em-novo-cliente)
3. [Adicionar Servidor Monitorado a Cliente Existente](#3-adicionar-servidor-monitorado-a-cliente-existente)
4. [Atualização do Sistema](#4-atualização-do-sistema)
5. [Configuração de Auditoria do Windows](#5-configuração-de-auditoria-do-windows)
6. [Configuração de Alertas por E-mail](#6-configuração-de-alertas-por-e-mail)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│  Servidor Central (Linux/Windows com Docker)            │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐   │
│  │ Frontend │  │   API    │  │    PostgreSQL       │   │
│  │  :3000   │  │  :3001   │  │      :5434         │   │
│  └──────────┘  └──────────┘  └────────────────────┘   │
│          via Docker Compose (produção)                  │
└─────────────────────────────────────────────────────────┘
           ↑                    ↑
     HTTPS / :443          HTTPS / :3001
           |                    |
┌──────────────────┐  ┌──────────────────────────────────┐
│  Windows Server  │  │  Windows Server 2 (outro cliente)│
│  (Servidor DC)   │  │  (Servidor de Arquivos)          │
│                  │  │                                  │
│  ADLogsCollector │  │  ADLogsCollector (Python Service)│
│  (Python Service)│  │  Coleta eventos → envia via API  │
└──────────────────┘  └──────────────────────────────────┘
```

**Componentes:**

| Componente | Onde roda | Função |
|---|---|---|
| **Frontend** (Next.js) | Docker — servidor central | Interface web de consulta e configuração |
| **API** (NestJS) | Docker — servidor central | Recebe eventos, autentica usuários, gera relatórios |
| **PostgreSQL** | Docker — servidor central | Banco de dados com todos os eventos |
| **Coletor** (Python) | Cada Windows Server monitorado | Lê o Event Log e envia eventos para a API |

**Regra fundamental:** o coletor **nunca** acessa o banco diretamente. Toda comunicação é via HTTPS com `X-Server-Key` única por servidor.

---

## 2. Instalação em Novo Cliente

### Pré-requisitos

**Servidor Central:**
- Linux Ubuntu 22.04+ ou Windows Server (com WSL2) ou qualquer sistema com Docker
- Docker Engine 24+ e Docker Compose v2
- Mínimo 2 GB RAM (recomendado 4 GB), 20 GB disco
- Porta 80/443 aberta para acesso da equipe do cliente

**Cada Windows Server monitorado:**
- Windows Server 2016, 2019, 2022 ou Windows 10/11 Pro
- Python 3.10 ou superior (baixar em python.org)
- PowerShell executado como Administrador para instalar o serviço
- Acesso de rede HTTPS ao servidor central (porta 443 ou 3001)

---

### 2.1 — Preparar o servidor central

#### Passo 1: Clonar o repositório

```bash
git clone https://github.com/seu-org/adlogs.git /opt/adlogs
cd /opt/adlogs
```

#### Passo 2: Criar arquivo `.env` de produção

```bash
cp .env.example .env
nano .env
```

Preencher os seguintes campos obrigatórios:

```env
# === Banco de Dados ===
POSTGRES_USER=adlogs
POSTGRES_PASSWORD=TROQUE_POR_SENHA_FORTE_AQUI
POSTGRES_DB=adlogs

# === JWT (gere com: openssl rand -hex 64) ===
JWT_SECRET=COLE_AQUI_STRING_ALEATORIA_DE_64_CHARS

# === URL pública da API (como o frontend vai chamar) ===
NEXT_PUBLIC_API_URL=https://adlogs.cliente.com.br
ALLOWED_ORIGINS=https://adlogs.cliente.com.br

# === Alertas por e-mail (opcional, deixe em branco para desativar) ===
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@cliente.com.br
SMTP_PASS=senha_do_smtp
SMTP_FROM="ADLogs <noreply@cliente.com.br>"
```

> **Atenção:** nunca comitar o arquivo `.env` no repositório. Ele já está no `.gitignore`.

#### Passo 3: Subir os containers

```bash
docker compose -f docker-compose.production.yml up -d
```

Aguardar todos os containers ficarem saudáveis:

```bash
docker compose -f docker-compose.production.yml ps
```

Saída esperada (todos `healthy` ou `running`):
```
NAME                STATUS
adlogs-postgres     running (healthy)
adlogs-api          running
adlogs-web          running
adlogs-nginx        running
```

#### Passo 4: Aplicar as migrations do banco

```bash
docker exec adlogs-api npx prisma migrate deploy
```

#### Passo 5: Verificar acesso

O sistema cria o usuário administrador padrão automaticamente na primeira inicialização:

| Campo | Valor |
|---|---|
| **E-mail** | `admin@adlogs.local` |
| **Senha** | `admin123` |
| **Perfil** | SUPER_ADMIN |

Abra o navegador em `https://adlogs.cliente.com.br` (ou o IP do servidor central) e faça login com as credenciais acima.

> **Importante:** após o primeiro login, acesse **Usuários** e altere a senha do administrador, ou crie um novo usuário SUPER_ADMIN para o cliente e desative o padrão.

---

### 2.2 — Configurar o primeiro servidor monitorado

Após acessar o painel, siga os passos abaixo para registrar o primeiro servidor Windows que terá o coletor instalado.

#### No painel web (Servidores → Adicionar)

1. Acesse **Servidores** no menu lateral
2. Clique em **Adicionar Servidor**
3. Preencha:
   - **Nome:** nome descritivo (ex: `DC Principal`, `Servidor de Arquivos`)
   - **Hostname:** hostname do servidor Windows (ex: `WIN-DC01`)
   - **IP:** endereço IP (opcional, para referência)
   - **Descrição:** função do servidor
4. Clique em **Salvar**
5. **Copie a API Key** exibida — ela começa com `adlogs_` e é exibida apenas uma vez

> Se perder a API Key, é necessário deletar e recadastrar o servidor — ela não pode ser recuperada.

Depois do cadastro, clique em **Config** ao lado do servidor para configurar o que deve ser coletado:
- **Logins** — sempre recomendado
- **Arquivos** — necessário configurar SACL nas pastas (ver seção 5)
- **Processos** — alto volume, habilitar apenas se necessário
- **Contas** — mudanças de usuários e grupos do AD
- **SQL Server** — apenas se houver SQL Server no servidor

---

### 2.3 — Instalar o coletor no Windows Server

Execute todos os comandos abaixo no **servidor Windows monitorado**, em um PowerShell como **Administrador**.

#### Passo 1: Copiar a pasta do coletor para o servidor

Copiar a pasta `collector/` do repositório para o servidor Windows. Sugestão de destino:

```
C:\ADLogs\collector\
```

Opções de transferência:
- Compartilhamento de rede (`\\servidor-central\adlogs\collector`)
- SCP/WinSCP do servidor Linux
- Pendrive / transferência manual

#### Passo 2: Verificar Python 3.10+

```powershell
python --version
# Saída esperada: Python 3.10.x ou superior
```

Se Python não estiver instalado, baixar o instalador em [python.org/downloads](https://python.org/downloads) e instalar com a opção **"Add Python to PATH"** marcada.

#### Passo 3: Criar o arquivo `.env`

```powershell
cd C:\ADLogs\collector
Copy-Item .env.example .env
notepad .env
```

Preencher o arquivo `.env`:

```env
# URL da API central (sem barra no final)
API_URL=https://adlogs.cliente.com.br

# Chave gerada ao cadastrar este servidor no painel
SERVER_API_KEY=adlogs_COLE_AQUI_A_CHAVE_COPIADA

# Intervalo de coleta em segundos (padrão: 30)
POLL_INTERVAL=30

# Versão do coletor
COLLECTOR_VERSION=2.0.0
```

> `DB_URL` pode ser deixado em branco — o coletor v2 envia tudo via API, não acessa o banco diretamente.

#### Passo 4: Instalar o serviço Windows

```powershell
cd C:\ADLogs\collector
.\install.ps1
```

O script faz automaticamente:
1. Verifica Python
2. Cria ambiente virtual (`venv/`)
3. Instala dependências (`pywin32`, `requests`, `python-dotenv`)
4. Registra e inicia o serviço Windows `ADLogsCollector`

Saída esperada ao final:
```
[5/5] Instalando servico Windows...
      Servico instalado e iniciado!
Instalacao concluida!
```

#### Passo 5: Verificar que o serviço está rodando

```powershell
Get-Service ADLogsCollector
# Status esperado: Running

# Ver os primeiros logs
Get-Content C:\ProgramData\ADLogs\collector.log -Tail 30
```

Nos logs, confirmar mensagem similar a:
```
INFO  adlogs.collector - Coletor iniciado. Servidor: WIN-DC01, versão: 2.0.0
INFO  adlogs.collector - Configuração recebida: logins=True, files=True, processes=False
INFO  adlogs.collector - Heartbeat enviado com sucesso
```

#### Passo 6: Confirmar no painel

No painel ADLogs, acesse o **Painel de Controle**. O servidor recém-instalado deve aparecer na lista de coletores como **Online** em até 1 minuto.

---

## 3. Adicionar Servidor Monitorado a Cliente Existente

Use este procedimento quando o sistema já está instalado e funcionando para o cliente, e um novo servidor Windows precisa ser adicionado ao monitoramento.

### 3.1 — Cadastrar o servidor no painel

1. Acesse o painel ADLogs com conta ADMIN ou SUPER_ADMIN
2. Menu **Servidores** → **Adicionar Servidor**
3. Preencha nome, hostname, IP e descrição
4. Salvar e **copiar a API Key** gerada (`adlogs_...`)
5. Configurar o que coletar (**Servidores** → botão **Config**)

### 3.2 — Instalar o coletor no novo servidor

Seguir exatamente os **Passos 1 a 6** da seção [2.3](#23--instalar-o-coletor-no-windows-server), usando a API Key do novo servidor.

> Cada servidor tem sua própria API Key. Nunca reutilize a chave de um servidor em outro.

### 3.3 — Configurar auditoria do Windows no novo servidor

Se o novo servidor vai monitorar arquivos, logins ou processos, aplicar as configurações de GPO/auditpol descritas na [seção 5](#5-configuração-de-auditoria-do-windows).

---

## 4. Atualização do Sistema

### 4.1 — Atualizar o servidor central (API + Frontend)

> **Os dados nunca são perdidos em atualizações normais.** Os eventos ficam no volume Docker `adlogs-postgres-data`, que persiste independente dos containers. As migrations só adicionam tabelas/colunas novas — nunca fazem DROP ou DELETE. O único comando que apagaria dados seria `docker compose down -v`, que **jamais deve ser usado em produção**.

Execute no servidor central:

```bash
cd /opt/adlogs

# 1. Backup preventivo (recomendado antes de qualquer atualização)
docker exec adlogs-postgres pg_dump -U adlogs adlogs > backup_pre_update_$(date +%Y%m%d).sql

# 2. Baixar a versão mais recente
git pull origin main

# 3. Rebuild e restart dos containers (sem derrubar o banco)
#    NUNCA use "docker compose down -v" — o -v apaga os volumes e os dados
docker compose -f docker-compose.production.yml up -d --build api web

# 4. Aplicar migrations novas (se houver — operação segura e idempotente)
docker exec adlogs-api npx prisma migrate deploy

# 5. Verificar status
docker compose -f docker-compose.production.yml ps
docker logs adlogs-api --tail 30
```

> **Tempo de indisponibilidade estimado:** 30-60 segundos durante o restart. Os coletores continuam rodando nos servidores Windows — os eventos acumulados serão enviados assim que a API voltar.

### 4.2 — Atualizar o coletor nos servidores Windows

Execute no **servidor Windows monitorado** (PowerShell como Administrador):

```powershell
# 1. Parar o serviço
Stop-Service ADLogsCollector

# 2. Fazer backup do .env atual
Copy-Item C:\ADLogs\collector\.env C:\ADLogs\collector\.env.bak

# 3. Substituir os arquivos do coletor
# (copie os novos arquivos de collector/ do repositório para C:\ADLogs\collector\)
# Mantenha o arquivo .env — não sobrescreva

# 4. Reinstalar dependências (se requirements.txt mudou)
C:\ADLogs\collector\venv\Scripts\pip.exe install -r C:\ADLogs\collector\requirements.txt

# 5. Reiniciar o serviço
Start-Service ADLogsCollector

# 6. Verificar
Get-Service ADLogsCollector
Get-Content C:\ProgramData\ADLogs\collector.log -Tail 20
```

> Verificar se o arquivo `.env` permanece correto após a atualização. Em caso de dúvida, restaurar o backup: `Copy-Item C:\ADLogs\collector\.env.bak C:\ADLogs\collector\.env`.

### 4.3 — Rollback em caso de problema

Se algo der errado após a atualização do servidor central:

```bash
cd /opt/adlogs

# Voltar para o commit anterior
git log --oneline -5          # identificar o commit anterior
git checkout <COMMIT_HASH>    # ou git reset --hard HEAD~1

# Rebuild com a versão anterior
docker compose -f docker-compose.production.yml up -d --build api web
```

---

## 5. Configuração de Auditoria do Windows

Esta seção deve ser aplicada no **servidor Windows monitorado** para que os eventos sejam gerados pelo sistema operacional. O coletor só consegue ler eventos que o Windows já gerou.

### 5.1 — Logins (Obrigatório)

Normalmente já habilitado por padrão. Verificar e habilitar se necessário:

```powershell
# Verificar status atual
auditpol /get /subcategory:"Logon"
auditpol /get /subcategory:"Logoff"

# Habilitar (executar se a saída acima mostrar "No auditing")
auditpol /set /subcategory:"Logon" /success:enable /failure:enable
auditpol /set /subcategory:"Logoff" /success:enable /failure:enable
```

### 5.2 — Acesso a Arquivos (Monitoramento de Pastas)

Requer dois passos: habilitar a política + configurar a SACL nas pastas.

**Passo A — Habilitar política:**

```powershell
auditpol /set /subcategory:"File System" /success:enable /failure:enable
```

**Passo B — Configurar SACL em cada pasta a monitorar:**

```powershell
# Substituir o caminho pela pasta desejada
$FolderPath = "C:\Dados\Financeiro"

$acl = Get-Acl -Path $FolderPath
$auditRule = New-Object System.Security.AccessControl.FileSystemAuditRule(
    "Everyone",
    "FullControl",
    "ContainerInherit,ObjectInherit",
    "None",
    "Success,Failure"
)
$acl.SetAuditRule($auditRule)
Set-Acl -Path $FolderPath -AclObject $acl
Write-Host "SACL aplicada em: $FolderPath"
```

Repetir o Passo B para cada pasta que deve ser monitorada.

**Passo C — Cadastrar as pastas no painel ADLogs:**

1. Menu **Configurações** → **Pastas Monitoradas**
2. Clicar **Adicionar** e informar o caminho exato (ex: `C:\Dados\Financeiro`)
3. O coletor buscará a lista atualizada no próximo ciclo

### 5.3 — Rastreamento de Processos (Opcional — Alto Volume)

Habilitar apenas se o cliente precisar saber quais programas/comandos foram executados:

```powershell
# Habilitar Process Creation
auditpol /set /subcategory:"Process Creation" /success:enable

# Incluir linha de comando nos eventos (recomendado)
# Via registro
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\Audit" /v ProcessCreationIncludeCmdLine_Enabled /t REG_DWORD /d 1 /f

# Aplicar a política
gpupdate /force
```

No painel ADLogs, habilitar a coleta de processos em **Servidores** → **Config** → ativar **Processos**.

### 5.4 — Gestão de Contas (Usuários e Grupos AD)

Normalmente habilitado em Domain Controllers. Verificar:

```powershell
auditpol /get /subcategory:"User Account Management"
auditpol /get /subcategory:"Security Group Management"

# Habilitar se necessário
auditpol /set /subcategory:"User Account Management" /success:enable /failure:enable
auditpol /set /subcategory:"Security Group Management" /success:enable /failure:enable
```

### 5.5 — SQL Server (Apenas se houver SQL Server no servidor)

Para capturar falhas de login e paradas/inicializações do SQL Server, o **SQL Server Audit** deve estar habilitado no SQL Server Management Studio:

1. Abrir SSMS → conectar na instância
2. **Security** → **Audits** → botão direito → **New Audit**
3. Destino: **Application Log**
4. Habilitar a auditoria

O coletor lê automaticamente eventos do Application Log com source `MSSQLSERVER`. No painel, habilitar em **Servidores** → **Config** → ativar **SQL Server**.

---

## 6. Configuração de Alertas por E-mail

Os alertas enviam notificações automáticas quando um evento crítico é detectado (ex: conta bloqueada, N logins falhos, serviço SQL parado).

### 6.1 — Configurar SMTP no servidor central

No arquivo `.env` do servidor central, preencher:

```env
SMTP_HOST=smtp.gmail.com        # ou smtp do cliente
SMTP_PORT=587
SMTP_USER=noreply@cliente.com.br
SMTP_PASS=senha_do_email
SMTP_FROM="ADLogs <noreply@cliente.com.br>"
```

Reiniciar a API para aplicar:

```bash
docker compose -f docker-compose.production.yml restart api
```

### 6.2 — Criar regras de alerta no painel

1. Acesse **Alertas** → aba **Regras** → **Nova Regra**
2. Preencher:
   - **Nome:** ex: `Contas bloqueadas`
   - **Categoria:** LOGIN / ARQUIVO / CONTA / SQL
   - **Tipos de evento:** selecionar os específicos (ex: `USER_LOCKED`)
   - **Condição:** `Qualquer ocorrência` ou `Limite` (N eventos em X minutos)
   - **Janela:** período de deduplicação (padrão: 5 min — não dispara o mesmo alerta duas vezes em 5 min)
   - **E-mails:** um ou mais endereços separados por vírgula
   - **Webhook:** URL opcional para integração (Slack, Teams, etc.)
3. Salvar

Os alertas são avaliados a cada **60 segundos** automaticamente.

**Exemplos de regras comuns:**

| Situação | Categoria | Tipo | Condição |
|---|---|---|---|
| Qualquer conta bloqueada | CONTA | USER_LOCKED | Qualquer ocorrência |
| Mais de 5 falhas de login em 10 min | LOGIN | LOGIN_FAILED | Limite: 5, janela: 10 min |
| Arquivo excluído em pasta crítica | ARQUIVO | DELETE | Qualquer ocorrência |
| SQL Server parado | SQL | SERVICE_STOPPED | Qualquer ocorrência |

---

## 7. Troubleshooting

### Coletor aparece Offline no painel

```powershell
# 1. Verificar se o serviço está rodando
Get-Service ADLogsCollector

# 2. Ver logs de erro
Get-Content C:\ProgramData\ADLogs\collector.log -Tail 50

# 3. Testar conectividade com a API
Test-NetConnection adlogs.cliente.com.br -Port 443

# 4. Reiniciar o serviço
Restart-Service ADLogsCollector
```

Causas comuns:
- Firewall bloqueando saída HTTPS para o servidor central
- `API_URL` incorreta no `.env`
- `SERVER_API_KEY` incorreta ou expirada (deletar e recadastrar o servidor)

---

### Eventos de arquivo não aparecem

```powershell
# 1. Verificar se a política está ativa
auditpol /get /subcategory:"File System"
# Deve mostrar: Success and Failure

# 2. Verificar se há eventos no Event Viewer
Get-WinEvent -LogName Security -FilterHashtable @{Id=4663} -MaxEvents 5 |
    Select-Object TimeCreated, Message | Format-List

# 3. Verificar se a pasta está cadastrada no ADLogs
# Painel → Configurações → Pastas Monitoradas

# 4. Ver se o coletor está processando arquivos
Get-Content C:\ProgramData\ADLogs\collector.log -Tail 30 | Select-String "file"
```

---

### Eventos de login aparecem mas sem IP de origem

Comportamento esperado para logins interativos locais (console físico ou KVM). O IP `null` = acesso local. Logins via RDP ou rede mostram o IP normalmente.

---

### Erro ao instalar serviço Windows

```powershell
# Verificar se há versão anterior instalada
Get-Service ADLogsCollector -ErrorAction SilentlyContinue

# Se houver, remover antes de reinstalar
cd C:\ADLogs\collector
.\install.ps1 -Uninstall
.\install.ps1
```

---

### Container da API não inicia

```bash
# Ver logs de erro
docker logs adlogs-api --tail 50

# Problemas comuns:
# - DATABASE_URL incorreta
# - JWT_SECRET não definido no .env
# - Banco ainda não pronto (aguardar 30s e tentar novamente)

# Forçar restart
docker compose -f docker-compose.production.yml restart api
```

---

### Banco de dados cheio ou lento

```bash
# Ver tamanho das tabelas (executar dentro do container do postgres)
docker exec adlogs-postgres psql -U adlogs -d adlogs -c "
SELECT
  relname AS tabela,
  pg_size_pretty(pg_total_relation_size(relid)) AS tamanho
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
"
```

> **Atenção:** eventos de auditoria são **imutáveis** por política de segurança — não é permitido deletar eventos das tabelas `login_events` e `file_events`. Se o armazenamento for crítico, aumentar o disco ou contatar o time de desenvolvimento para implementar archiving.

---

### Reinstalar o coletor do zero

Se necessário reinstalar completamente:

```powershell
# 1. Remover serviço atual
cd C:\ADLogs\collector
.\install.ps1 -Uninstall

# 2. Fazer backup do .env
Copy-Item .env .env.bak

# 3. Remover ambiente virtual
Remove-Item -Recurse -Force venv

# 4. Reinstalar
.\install.ps1

# 5. Restaurar .env se necessário
Copy-Item .env.bak .env
Restart-Service ADLogsCollector
```

---

## Referência Rápida — Comandos Essenciais

### Servidor Central

```bash
# Status de todos os containers
docker compose -f docker-compose.production.yml ps

# Logs da API
docker logs adlogs-api -f --tail 50

# Logs do banco
docker logs adlogs-postgres --tail 20

# Parar tudo
docker compose -f docker-compose.production.yml down

# Subir tudo
docker compose -f docker-compose.production.yml up -d

# Backup do banco
docker exec adlogs-postgres pg_dump -U adlogs adlogs > backup_$(date +%Y%m%d).sql
```

### Windows Server (Coletor)

```powershell
# Status do serviço
Get-Service ADLogsCollector

# Iniciar / Parar / Reiniciar
Start-Service ADLogsCollector
Stop-Service ADLogsCollector
Restart-Service ADLogsCollector

# Ver logs em tempo real
Get-Content C:\ProgramData\ADLogs\collector.log -Wait -Tail 30

# Rodar em modo debug (sem instalar como serviço)
cd C:\ADLogs\collector
.\venv\Scripts\python.exe service.py debug

# Verificar conectividade com API
Test-NetConnection adlogs.cliente.com.br -Port 443

# Ver política de auditoria atual
auditpol /get /category:*
```

---

## Portas e Configurações de Rede

| Porta | Serviço | Direção | Notas |
|---|---|---|---|
| 443 (HTTPS) | Frontend + API (via Nginx) | Entrada no servidor central | Deve ser liberada para os usuários do painel e para os coletores |
| 3001 | API (interno) | Interno ao Docker | Não expor diretamente se houver Nginx |
| 5434 | PostgreSQL | Interno ao Docker | Não expor externamente |

**Regra de firewall nos servidores Windows (coletor):**
- Saída HTTPS (porta 443) para o IP/domínio do servidor central: **liberar**
- Entrada: nenhuma porta precisa ser aberta no servidor Windows
