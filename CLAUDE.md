# CLAUDE.md — ADLogs

Sistema de auditoria para Windows Server: coleta eventos de login/logoff e acesso a arquivos do Event Log e os persiste em PostgreSQL, com interface web moderna. Monorepo TypeScript: NestJS + Prisma + PostgreSQL (backend), Next.js 15 App Router + Tailwind + shadcn/ui (frontend), Turborepo + pnpm. Componente adicional: coletor Python (Windows Service).

---

## REGRAS OBRIGATÓRIAS (FUNDAMENTAIS)

1. **TDD inviolável.** RED → GREEN → REFACTOR. Teste primeiro, código depois. Sem exceções. Ver `.claude/rules/testing.md`.
2. **Consultar `docs/` antes de implementar. Atualizar `docs/` depois.** Identificar docs relevantes → ler com Read → implementar → atualizar docs afetados. Se a implementação mudou um endpoint, atualizar `api-endpoints.md`. Se adicionou evento, atualizar `fluxos.md`. Se mudou campo no schema, atualizar `schema.md`. Nenhuma entrega deve ter docs desatualizados.
3. **Planejamento Mandatório (Strategy phase).** Para features novas ou refatorações grandes, utilize obrigatoriamente o modo de planejamento (`enter_plan_mode`). O plano antecede o TDD.
4. **Nunca tomar decisões de negócio ou design sozinho — REGRA INVIOLÁVEL.** Ao encontrar ambiguidade, furo lógico, ou necessidade de definir regra/comportamento/limite/valor — SEMPRE pergunte antes de decidir. Listar as opções com prós/contras e aguardar escolha explícita. Nunca invente comportamentos ou regras por conta própria.
5. **Continuidade entre Sprints quando já autorizado.** Por padrão, trabalhar uma sprint por vez. Se o usuário já tiver autorizado explicitamente seguir sem checkpoints, continuar automaticamente para o próximo corte documentado ao concluir a sprint atual. Só interromper se surgir bloqueio real.
6. **Documentação Granular Obrigatória.** Toda nova pasta de estrutura de código deve conter um `README.md` local detalhando responsabilidade, padrões e exemplos de uso. Serve como contexto RAG para IA e guia para desenvolvedores.
7. **Espelhamento Obrigatório e Simultâneo (CLAUDE.md e AGENTS.md).** Estes dois arquivos devem ser mantidos sempre idênticos em termos de regras e estrutura. Qualquer alteração em um DEVE ser replicada no outro no mesmo turno.
8. **Higiene e Conclusão de Sprint.** Antes de declarar uma sprint finalizada: 1. verificar se todos os testes passam; 2. `pnpm build` verde; 3. docs atualizados. Nenhuma sprint nova pode ser iniciada com build ou testes falhando.
9. **Isolamento de Execução — REGRA CRÍTICA.** É estritamente proibido executar qualquer comando fora da pasta raiz deste projeto. Nunca utilizar caminhos absolutos para fora do projeto.
10. **Proibição de Gambiarras no Lint.** É terminantemente proibido o uso de `eslint-disable` ou `@ts-ignore`. Erros devem ser resolvidos na raiz. O uso de `any` deve ser evitado; quando inevitável, usar `as unknown as T`.
11. **Evidência Técnica Obrigatória — REGRA ANTIFALHA.** É terminantemente proibido declarar uma tarefa como "concluída" sem antes executar e obter sucesso em: 1. `pnpm build`; 2. `pnpm test`. **`--no-verify` no git é TERMINANTEMENTE PROIBIDO.**
12. **Execução Contínua com Paralelismo Máximo.** Trabalhar até o limite do escopo autorizado. Puxar e executar em paralelo todas as frentes independentes. Só interromper para: 1. ambiguidade de regra de negócio; 2. dependência indisponível; 3. risco destrutivo; 4. decisão explícita necessária.
13. **Branch obrigatória por sprint — REGRA INVIOLÁVEL.** É proibido iniciar qualquer sprint diretamente na `main`. Sempre criar branch dedicada (ex: `sprint-1`). Proibido commitar na `main` durante sprint.
14. **Documentação de Bugs/Issues.** Ao receber `documente o erro`, `cria issue` ou equivalente: 1. levantar contexto técnico; 2. sintetizar problema; 3. montar issue completa com título, contexto, impacto, passos de reprodução, comportamento atual/esperado, evidências, critérios de aceite. Se possível, criar via `gh issue create`.
15. **Segurança de Dados.** Eventos de auditoria do Windows são imutáveis após inserção — nunca permitir UPDATE ou DELETE em `login_events` e `file_events`. Apenas leitura. Dados sensíveis (senhas, hashes) nunca em logs ou respostas de API.
16. **Collector é componente separado.** O coletor Python roda como Windows Service nativo — nunca containerizá-lo. Documenta-lo em `collector/README.md` e `docs/windows-audit-setup.md`. Qualquer mudança no schema que afete o coletor deve ser refletida em `collector/`.
17. **Compatibilidade de Portas.** PostgreSQL roda na porta `5434` (não 5432 nem 5433) para não conflitar com outros projetos. API na `3001`, Frontend na `3000`. Não alterar estas portas sem atualizar todos os arquivos de config.
18. **Fluxo Canônico de Resolução de Issues.** Ao receber `resolver issue <id>`: 1. ler `docs/testing/issue-validation-queue.md`; 2. criar branch dedicada; 3. escrever teste que falha; 4. implementar fix; 5. validar localmente; 6. PR para main; 7. aguardar CI; 8. merge; 9. atualizar fila com status `pronta_para_teste`. Issue só fecha quando usuário declarar `issue <id> aprovada`.

---

## Orientações de Contexto

- **Node 20 via nvm**: Sempre `source ~/.nvm/nvm.sh && nvm use 20` antes de rodar comandos Node.
- **Convenções Gerais:** Ver `.claude/rules/coding.md` para naming, exports e padrões TS.
- **Testes:** Ver `.claude/rules/testing.md` para padrões de teste NestJS e Next.js.

---

## Visão Geral

**ADLogs** é um sistema de auditoria para Windows Server. Captura eventos do Windows Event Log (login/logoff e acesso a arquivos) e os persiste em PostgreSQL, com interface web moderna para buscas e relatórios. Projetado para ser replicável em qualquer Windows Server.

**Componentes:**
- **API (NestJS):** REST API com autenticação JWT, RBAC, endpoints para consulta de eventos e relatórios.
- **Web (Next.js):** Dashboard moderno com shadcn/ui, pensado para usuários não técnicos.
- **Collector (Python):** Windows Service que lê o Event Log em tempo real e persiste no PostgreSQL.
- **PostgreSQL:** Banco de dados principal (Docker).

**Roles:**
- `SUPER_ADMIN`: acesso total, gestão do sistema
- `ADMIN`: gestão de usuários e configurações
- `ANALYST`: visualização de eventos e geração de relatórios
- `VIEWER`: somente leitura, sem exportação

---

## Estado Atual do Repositório

**Sprint 0 — Estrutura base criada.**
- Monorepo configurado: Turborepo + pnpm workspaces.
- packages/shared com Prisma schema completo.
- apps/api com NestJS: auth, users, events, dashboard, monitored-folders, collector-status.
- apps/web com Next.js 15 + shadcn/ui: login, dashboard, logins, arquivos, relatórios, configurações, usuários.
- collector/ Python Windows Service completo.
- Docker Compose dev + production configurados.
- Docs iniciais criadas.

**Próxima sprint:** Sprint 1 — Instalação real e validação em ambiente Windows Server.

---

## Quick Start

```bash
# Pré-requisito: Node 20, pnpm 9, Docker

# 1. Instalar dependências
pnpm install

# 2. Subir banco de dados
docker compose up -d postgres

# 3. Gerar cliente Prisma e aplicar migrations
pnpm --filter @adlogs/shared prisma:generate
pnpm --filter @adlogs/shared prisma:migrate

# 4. Subir API (porta 3001)
pnpm --filter @adlogs/api start:dev

# 5. Subir Frontend (porta 3000)
pnpm --filter @adlogs/web dev

# 6. Instalar coletor Windows Service (PowerShell como Admin)
# cd collector && .\install.ps1
```
