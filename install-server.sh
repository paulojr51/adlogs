#!/bin/bash
# =============================================================================
#  ADLogs — Instalador do Servidor (Ubuntu 24.04)
#  Instala Docker, configura ambiente e sobe todos os containers.
#
#  Pré-requisito: executar do diretório raiz do projeto ADLogs
#  Uso: sudo bash install-server.sh
# =============================================================================
set -e

# ─── Cores ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

step()  { echo -e "\n${CYAN}${BOLD}[▶]${NC} $1"; }
ok()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ─── Verificações iniciais ────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && err "Execute como root: sudo bash install-server.sh"

[[ ! -f "docker-compose.production.yml" ]] && \
    err "Execute este script a partir do diretório raiz do projeto ADLogs.\nExemplo: cd /opt/adlogs && sudo bash install-server.sh"

clear
echo -e "${CYAN}${BOLD}"
echo "=================================================="
echo "   ADLogs — Instalador do Servidor"
echo "   Ubuntu 24.04"
echo "==================================================${NC}"
echo ""

# ─── Coleta de informações ────────────────────────────────────────────────────
echo -e "${BOLD}Informe os dados da instalação:${NC}"
echo ""

# IP/domínio do servidor
while true; do
    read -rp "  IP ou domínio deste servidor (ex: 192.168.1.10): " SERVER_IP
    [[ -n "$SERVER_IP" ]] && break
    warn "Campo obrigatório."
done

# Porta HTTP
read -rp "  Porta HTTP [80]: " HTTP_PORT
HTTP_PORT=${HTTP_PORT:-80}

# Senha do banco
DB_PASS_DEFAULT="ADLogs2026SecProd"
read -rp "  Senha do banco de dados [${DB_PASS_DEFAULT}]: " DB_PASSWORD
DB_PASSWORD=${DB_PASSWORD:-$DB_PASS_DEFAULT}

# JWT Secret (gerado automaticamente)
JWT_SECRET=$(openssl rand -hex 32)

echo ""
echo -e "  ${BOLD}Configuração:${NC}"
echo "  ├── Servidor:  $SERVER_IP"
echo "  ├── HTTP:      http://$SERVER_IP:$HTTP_PORT"
echo "  ├── DB Porta:  5434 (senha configurada)"
echo "  └── JWT:       gerado automaticamente"
echo ""
read -rp "Confirmar e iniciar instalação? [S/n] " CONFIRM
[[ "$CONFIRM" =~ ^[Nn]$ ]] && echo "Cancelado." && exit 0

# ─── 1. Docker ───────────────────────────────────────────────────────────────
step "Instalando Docker..."
if command -v docker &>/dev/null; then
    ok "Docker já instalado: $(docker --version)"
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

# ─── 2. Arquivo .env ─────────────────────────────────────────────────────────
step "Criando .env..."

# Se já existe, faz backup
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

# === Frontend ===
# NEXT_PUBLIC_API_URL não deve ser definido em produção.
# O nginx roteia /api/* para a API automaticamente (URL relativa).

# === Nginx ===
HTTP_PORT=${HTTP_PORT}
HTTPS_PORT=443
EOF
ok ".env criado"

# ─── 3. Firewall ─────────────────────────────────────────────────────────────
step "Configurando firewall (UFW)..."
if command -v ufw &>/dev/null; then
    ufw allow "${HTTP_PORT}/tcp" comment "ADLogs HTTP" 2>/dev/null || true
    ufw allow 443/tcp comment "ADLogs HTTPS" 2>/dev/null || true
    warn "Porta 5434 (PostgreSQL) NÃO aberta publicamente."
    warn "Para permitir coletores de servidores AD, execute:"
    warn "  ufw allow from <IP_DO_SERVIDOR_AD> to any port 5434"
    ok "Firewall HTTP/HTTPS configurado"
else
    warn "UFW não encontrado. Configure o firewall manualmente se necessário."
fi

# ─── 4. Build das imagens ─────────────────────────────────────────────────────
step "Construindo imagens Docker (pode levar 5-15 minutos)..."
docker compose -f docker-compose.production.yml build --no-cache
ok "Imagens construídas"

# ─── 5. Subir containers ──────────────────────────────────────────────────────
step "Iniciando containers..."
docker compose -f docker-compose.production.yml up -d
ok "Containers iniciados"

# ─── 6. Aguardar banco ────────────────────────────────────────────────────────
step "Aguardando banco de dados ficar saudável..."
TRIES=0
until docker exec adlogs-postgres pg_isready -U adlogs -d adlogs &>/dev/null; do
    TRIES=$((TRIES + 1))
    [[ $TRIES -ge 30 ]] && err "Banco não respondeu após 60s.\nVerifique: docker logs adlogs-postgres"
    sleep 2
done
ok "Banco de dados pronto"

# ─── 7. Aguardar API (migrations rodam via entrypoint.sh) ────────────────────
step "Aguardando API inicializar e aplicar migrations..."
TRIES=0
until curl -sf "http://localhost:${HTTP_PORT}/api/health" &>/dev/null; do
    TRIES=$((TRIES + 1))
    [[ $TRIES -ge 40 ]] && {
        warn "API demorou mais que o esperado. Verifique: docker logs adlogs-api"
        break
    }
    sleep 3
done
ok "API respondendo"

# ─── 8. Liberar porta 5434 para coletores ─────────────────────────────────────
step "Configurando acesso externo ao banco para coletores..."
warn "A porta 5434 está acessível em todas as interfaces (0.0.0.0)."
warn "Restrinja no firewall aos IPs dos servidores AD:"
warn "  ufw allow from <IP_AD> to any port 5434"

# ─── Resumo final ─────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}=================================================="
echo -e "  Instalação concluída com sucesso!"
echo -e "==================================================${NC}"
echo ""
echo -e "  ${BOLD}Acesso ao sistema:${NC}"
echo "  URL:    http://${SERVER_IP}:${HTTP_PORT}"
echo "  Usuário: admin@adlogs.local"
echo -e "  ${YELLOW}Senha:   admin123  ← troque no primeiro login!${NC}"
echo ""
echo -e "  ${BOLD}Dados para configurar os coletores Windows:${NC}"
echo "  IP/Host do servidor: ${SERVER_IP}"
echo "  Porta do banco:      5434"
echo "  Senha do banco:      ${DB_PASSWORD}"
echo ""
echo -e "  ${BOLD}Comandos úteis:${NC}"
echo "  Status:    docker compose -f docker-compose.production.yml ps"
echo "  Logs API:  docker compose -f docker-compose.production.yml logs -f api"
echo "  Restart:   docker compose -f docker-compose.production.yml restart"
echo "  Parar:     docker compose -f docker-compose.production.yml down"
echo ""
echo -e "  ${BOLD}Firewall para coletores AD:${NC}"
echo "  ufw allow from <IP_DO_AD> to any port 5434"
echo ""
