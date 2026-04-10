# Roadmap de Sprints — ADLogs

## Sprint 0 — Estrutura Base ✅ (Concluída: 2026-04-09)

**Objetivo:** Criar toda a estrutura do projeto.

**Entregues:**
- Monorepo Turborepo + pnpm configurado
- packages/shared com Prisma schema completo
- apps/api NestJS: auth JWT, users CRUD, login-events, file-events, dashboard, monitored-folders, collector-status
- apps/web Next.js 15: login, dashboard, logins, arquivos, relatórios, configurações, usuários
- collector/ Python Windows Service completo (event_reader, db_writer, service wrapper)
- Docker Compose dev + production
- Nginx reverse proxy
- Dockerfiles para API e Web
- CLAUDE.md + AGENTS.md com 18 regras
- docs/ inicial

---

## Sprint 1 — Bootstrap e Validação Real (Planejada)

**Objetivo:** Instalar em servidor Windows Server real e validar fluxo completo.

**Escopo:**
- [ ] `pnpm install` e resolução de dependências
- [ ] `prisma migrate dev` — criar tabelas no banco
- [ ] `prisma db seed` — criar usuário admin inicial
- [ ] Validar API: `GET /api/health` retorna 200
- [ ] Validar login na interface web
- [ ] Instalar coletor Python: `.\install.ps1`
- [ ] Verificar heartbeat do coletor na interface
- [ ] Adicionar primeira pasta monitorada
- [ ] Validar que eventos de login aparecem na interface
- [ ] Corrigir bugs de instalação encontrados

**Critérios de Aceite:**
- API rodando em Docker, acessível pela rede local
- Frontend acessível pelo navegador
- Coletor ativo como Windows Service
- Eventos de login reais aparecendo na tabela de Logins

---

## Sprint 2 — Hardening e Relatórios (Planejada)

**Objetivo:** Robustez e funcionalidades de relatório.

**Escopo:**
- [ ] Exportação de relatórios em CSV
- [ ] Filtros avançados (por período, usuário, IP)
- [ ] Paginação robusta
- [ ] Alertas de segurança (muitas falhas de login de um IP)
- [ ] Retenção de dados configurável (auto-limpeza de eventos antigos)
- [ ] Testes unitários e de integração
- [ ] Documentação de API completa

---

## Sprint 3 — Funcionalidades Avançadas (Planejada)

**Objetivo:** Features solicitadas após validação.

**Escopo:** A definir com base no uso real (Sprint 1 e 2).

Exemplos possíveis:
- Dashboard de alertas em tempo real
- Correlação de eventos (mesmo usuário, múltiplos IPs)
- Relatórios agendados por e-mail
- Multi-servidor (coletor remoto → API centralizada)
- Exportação PDF
