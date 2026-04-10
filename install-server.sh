#!/bin/bash
# =============================================================================
#  ADLogs — Instalador/Atualizador do Servidor (Ubuntu 24.04)
#
#  Primeira instalacao:
#    sudo bash install-server.sh
#
#  Atualizacao (a partir do servidor instalado):
#    sudo bash /opt/adlogs/install-server.sh --update
#
#  Repositorio privado? Passe o token:
#    sudo bash install-server.sh --token ghp_SEUTOKEN
# =============================================================================
set -e

REPO_URL="https://github.com/paulojr51/adlogs.git"
INSTALL_DIR="/opt/adlogs"
COMPOSE_FILE="docker-compose.production.yml"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

step()  { echo -e "\n${CYAN}${BOLD}[>]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[X]${NC} $1"; exit 1; }

[[ $EUID -ne 0 ]] && err "Execute como root: sudo bash install-server.sh"

# ─── Argumentos ──────────────────────────────────────────────────────────────
UPDATE_MODE=0
GITHUB_TOKEN=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --update)  UPDATE_MODE=1 ;;
        --token)   GITHUB_TOKEN="$2"; shift ;;
        --token=*) GITHUB_TOKEN="${1#*=}" ;;
    esac
    shift
done

# Monta URL com token se informado
if [[ -n "$GITHUB_TOKEN" ]]; then
    CLONE_URL="https://${GITHUB_TOKEN}@github.com/paulojr51/adlogs.git"
else
    CLONE_URL="$REPO_URL"
fi

# =============================================================================
# MODO ATUALIZACAO
# =============================================================================
if [[ $UPDATE_MODE -eq 1 ]]; then
    clear
    echo -e "${CYAN}${BOLD}"
    echo "=================================================="
    echo "   ADLogs — Atualizacao do Servidor"
    echo "==================================================${NC}"
    echo ""

    [[ ! -d "$INSTALL_DIR/.git" ]] && err "Repositorio nao encontrado em $INSTALL_DIR. Execute a instalacao completa primeiro."

    step "Baixando ultima versao do GitHub..."
    cd "$INSTALL_DIR"

    # Atualiza URL com token se fornecido
    if [[ -n "$GITHUB_TOKEN" ]]; then
        git remote set-url origin "$CLONE_URL"
    fi

    git fetch origin
    git reset --hard origin/main
    ok "Codigo atualizado"

    step "Reconstruindo imagens Docker..."
    docker compose -f "$COMPOSE_FILE" build
    ok "Imagens reconstruidas"

    step "Reiniciando containers..."
    docker compose -f "$COMPOSE_FILE" up -d
    ok "Containers reiniciados"

    step "Aguardando API..."
    HTTP_PORT=$(grep "^HTTP_PORT=" .env 2>/dev/null | cut -d= -f2 || echo "80")
    TRIES=0
    until curl -sf "http://localhost:${HTTP_PORT}/api/health" &>/dev/null; do
        TRIES=$((TRIES + 1))
        [[ $TRIES -ge 30 ]] && { warn "API demorou mais que o esperado."; break; }
        sleep 3
    done
    ok "API respondendo"

    echo ""
    echo -e "${GREEN}${BOLD}=================================================="
    echo -e "  Atualizacao concluida!"
    echo -e "==================================================${NC}"
    echo ""
    echo "  Status dos containers:"
    docker compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}"
    echo ""
    exit 0
fi

# =============================================================================
# MODO INSTALACAO COMPLETA
# =============================================================================
clear
echo -e "${CYAN}${BOLD}"
echo "=================================================="
echo "   ADLogs — Instalador do Servidor"
echo "   Ubuntu 24.04"
echo "==================================================${NC}"
echo ""

# ─── 1. Git ──────────────────────────────────────────────────────────────────
step "Verificando Git..."
if ! command -v git &>/dev/null; then
    apt-get update -qq
    apt-get install -y -qq git
    ok "Git instalado: $(git --version)"
else
    ok "Git ja instalado: $(git --version)"
fi

# ─── 2. Clonar ou atualizar repositorio ──────────────────────────────────────
step "Obtendo codigo do repositorio..."
if [[ -d "$INSTALL_DIR/.git" ]]; then
    warn "Instalacao anterior encontrada em $INSTALL_DIR. Atualizando..."
    cd "$INSTALL_DIR"
    [[ -n "$GITHUB_TOKEN" ]] && git remote set-url origin "$CLONE_URL"
    git fetch origin
    git reset --hard origin/main
    ok "Repositorio atualizado"
else
    if [[ -d "$INSTALL_DIR" ]]; then
        warn "Pasta $INSTALL_DIR existe mas nao e um repositorio git. Fazendo backup..."
        mv "$INSTALL_DIR" "${INSTALL_DIR}.backup.$(date +%Y%m%d%H%M%S)"
    fi
    git clone "$CLONE_URL" "$INSTALL_DIR"
    ok "Repositorio clonado em $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# Salva token para atualizacoes futuras (sem expor no historico de shell)
if [[ -n "$GITHUB_TOKEN" ]]; then
    git remote set-url origin "$CLONE_URL"
fi

# ─── 3. Coleta de informacoes ────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Informe os dados da instalacao:${NC}"
echo ""

while true; do
    read -rp "  IP ou dominio deste servidor (ex: 192.168.1.10): " SERVER_IP
    [[ -n "$SERVER_IP" ]] && break
    warn "Campo obrigatorio."
done

read -rp "  Porta HTTP [80]: " HTTP_PORT
HTTP_PORT=${HTTP_PORT:-80}

DB_PASS_DEFAULT="ADLogs2026SecProd"
read -rp "  Senha do banco de dados [${DB_PASS_DEFAULT}]: " DB_PASSWORD
DB_PASSWORD=${DB_PASSWORD:-$DB_PASS_DEFAULT}

JWT_SECRET=$(openssl rand -hex 32)

echo ""
echo -e "  ${BOLD}Configuracao:${NC}"
echo "  Servidor:  $SERVER_IP"
echo "  HTTP:      http://$SERVER_IP:$HTTP_PORT"
echo "  DB Porta:  5434 (senha configurada)"
echo "  JWT:       gerado automaticamente"
echo ""
read -rp "Confirmar e iniciar instalacao? [S/n] " CONFIRM
[[ "$CONFIRM" =~ ^[Nn]$ ]] && echo "Cancelado." && exit 0

# ─── 4. Docker ───────────────────────────────────────────────────────────────
step "Instalando Docker..."
if command -v docker &>/dev/null; then
    ok "Docker ja instalado: $(docker --version)"
else
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg lsb-release
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        | tee /etc/apt/sources.list.d/docker.list >/dev/null
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker --quiet
    systemctl start docker
    ok "Docker instalado: $(docker --version)"
fi

# ─── 5. Arquivo .env ─────────────────────────────────────────────────────────
step "Criando .env..."
[[ -f ".env" ]] && cp .env ".env.backup.$(date +%Y%m%d%H%M%S)" && warn "Backup do .env anterior criado."

cat > .env << EOF
# === Ambiente ===
APP_ENV=production
NODE_ENV=production

# === Banco de Dados ===
DATABASE_URL="postgresql://adlogs:${DB_PASSWORD}@postgres:5432/adlogs?schema=public"
POSTGRES_USER=adlogs
POSTGRES_PASSWORD=${DB_PASSWORD}
POSTGRES_DB=adlogs
POSTGRES_PORT=5434

# === JWT ===
JWT_SECRET="${JWT_SECRET}"
JWT_SECRET_OLD=""
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# === API ===
PORT=3001
ALLOWED_ORIGINS="http://${SERVER_IP}"

# === Nginx ===
HTTP_PORT=${HTTP_PORT}
HTTPS_PORT=443
EOF
ok ".env criado"

# ─── 6. Firewall ─────────────────────────────────────────────────────────────
step "Configurando firewall (UFW)..."
if command -v ufw &>/dev/null; then
    ufw allow "${HTTP_PORT}/tcp" comment "ADLogs HTTP" 2>/dev/null || true
    ufw allow 443/tcp comment "ADLogs HTTPS" 2>/dev/null || true
    warn "Porta 5434 (PostgreSQL) NAO aberta publicamente."
    warn "Para permitir coletores AD execute:"
    warn "  ufw allow from <IP_DO_SERVIDOR_AD> to any port 5434"
    ok "Firewall HTTP/HTTPS configurado"
else
    warn "UFW nao encontrado. Configure o firewall manualmente."
fi

# ─── 7. Build e subir containers ─────────────────────────────────────────────
step "Construindo imagens Docker (pode levar 5-15 minutos)..."
docker compose -f "$COMPOSE_FILE" build --no-cache
ok "Imagens construidas"

step "Iniciando containers..."
docker compose -f "$COMPOSE_FILE" up -d
ok "Containers iniciados"

# ─── 8. Aguardar banco ────────────────────────────────────────────────────────
step "Aguardando banco de dados ficar saudavel..."
TRIES=0
until docker exec adlogs-postgres pg_isready -U adlogs -d adlogs &>/dev/null; do
    TRIES=$((TRIES + 1))
    [[ $TRIES -ge 30 ]] && err "Banco nao respondeu apos 60s.\nVerifique: docker logs adlogs-postgres"
    sleep 2
done
ok "Banco de dados pronto"

# ─── 9. Aguardar API ─────────────────────────────────────────────────────────
step "Aguardando API inicializar e aplicar migrations..."
TRIES=0
until curl -sf "http://localhost:${HTTP_PORT}/api/health" &>/dev/null; do
    TRIES=$((TRIES + 1))
    [[ $TRIES -ge 40 ]] && { warn "API demorou mais que o esperado. Verifique: docker logs adlogs-api"; break; }
    sleep 3
done
ok "API respondendo"

# ─── Resumo ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}=================================================="
echo -e "  Instalacao concluida com sucesso!"
echo -e "==================================================${NC}"
echo ""
echo -e "  ${BOLD}Acesso ao sistema:${NC}"
echo "  URL:     http://${SERVER_IP}:${HTTP_PORT}"
echo "  Usuario: admin@adlogs.local"
echo -e "  ${YELLOW}Senha:   admin123  <- troque no primeiro login!${NC}"
echo ""
echo -e "  ${BOLD}Dados para configurar os coletores Windows:${NC}"
echo "  IP do servidor: ${SERVER_IP}"
echo "  Porta do banco: 5434"
echo "  Senha do banco: ${DB_PASSWORD}"
echo ""
echo -e "  ${BOLD}Comandos uteis:${NC}"
echo "  Atualizar:  sudo bash /opt/adlogs/install-server.sh --update"
echo "  Status:     docker compose -f $INSTALL_DIR/$COMPOSE_FILE ps"
echo "  Logs API:   docker compose -f $INSTALL_DIR/$COMPOSE_FILE logs -f api"
echo "  Restart:    docker compose -f $INSTALL_DIR/$COMPOSE_FILE restart"
echo ""
echo -e "  ${BOLD}Firewall para coletores AD:${NC}"
echo "  ufw allow from <IP_DO_AD> to any port 5434"
echo ""
