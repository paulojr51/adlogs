# AGENTS.md — ADLogs

Sistema de auditoria para Windows Server: coleta eventos de login/logoff e acesso a arquivos do Event Log e os persiste em PostgreSQL, com interface web moderna. Monorepo TypeScript: NestJS + Prisma + PostgreSQL (backend), Next.js 15 App Router + Tailwind + shadcn/ui (frontend), Turborepo + pnpm. Componente adicional: coletor Python (Windows Service).

---

## REGRAS OBRIGATÓRIAS (FUNDAMENTAIS)

1. **TDD inviolável.** RED → GREEN → REFACTOR. Teste primeiro, código depois. Sem exceções. Ver `.claude/rules/testing.md`.
2. **Consultar `docs/` antes de implementar. Atualizar `docs/` depois.** Identificar docs relevantes → ler com Read → implementar → atualizar docs afetados. Se a implementação mudou um endpoint, atualizar `api-endpoints.md`. Se adicionou evento, atualizar `fluxos.md`. Se mudou campo no schema, atualizar `schema.md`. Nenhuma entrega deve ter docs desatualizados.
3. **Planejamento Mandatório (Strategy phase).** Para features novas ou refatorações grandes, utilize obrigatoriamente o modo de planejamento. O plano antecede o TDD.
4. **Nunca tomar decisões de negócio ou design sozinho — REGRA INVIOLÁVEL.** Ao encontrar ambiguidade, furo lógico, ou necessidade de definir regra/comportamento/limite/valor — SEMPRE pergunte antes de decidir. Listar as opções com prós/contras e aguardar escolha explícita. Nunca invente comportamentos ou regras por conta própria.
5. **Continuidade entre Sprints quando já autorizado.** Por padrão, trabalhar uma sprint por vez. Se o usuário já tiver autorizado explicitamente seguir sem checkpoints, continuar automaticamente para o próximo corte documentado ao concluir a sprint atual. Só interromper se surgir bloqueio real.
6. **Documentação Granular Obrigatória.** Toda nova pasta de estrutura de código deve conter um `README.md` local detalhando responsabilidade, padrões e exemplos de uso.
7. **Espelhamento Obrigatório e Simultâneo (CLAUDE.md e AGENTS.md).** Estes dois arquivos devem ser mantidos sempre idênticos em termos de regras e estrutura. Qualquer alteração em um DEVE ser replicada no outro no mesmo turno.
8. **Higiene e Conclusão de Sprint.** Antes de declarar uma sprint finalizada: 1. verificar se todos os testes passam; 2. `pnpm build` verde; 3. docs atualizados.
9. **Isolamento de Execução — REGRA CRÍTICA.** É estritamente proibido executar qualquer comando fora da pasta raiz deste projeto.
10. **Proibição de Gambiarras no Lint.** É terminantemente proibido o uso de `eslint-disable` ou `@ts-ignore`. O uso de `any` deve ser evitado; quando inevitável, usar `as unknown as T`.
11. **Evidência Técnica Obrigatória — REGRA ANTIFALHA.** É terminantemente proibido declarar uma tarefa como "concluída" sem antes executar e obter sucesso em: 1. `pnpm build`; 2. `pnpm test`. **`--no-verify` no git é TERMINANTEMENTE PROIBIDO.**
12. **Execução Contínua com Paralelismo Máximo.** Trabalhar até o limite do escopo autorizado. Puxar e executar em paralelo todas as frentes independentes.
13. **Branch obrigatória por sprint — REGRA INVIOLÁVEL.** É proibido iniciar qualquer sprint diretamente na `main`. Sempre criar branch dedicada (ex: `sprint-1`).
14. **Documentação de Bugs/Issues.** Ao receber `documente o erro`, `cria issue` ou equivalente: levantar contexto técnico, sintetizar problema, montar issue completa.
15. **Segurança de Dados.** Eventos de auditoria do Windows são imutáveis após inserção — nunca permitir UPDATE ou DELETE em `login_events` e `file_events`.
16. **Collector é componente separado.** O coletor Python roda como Windows Service nativo — nunca containerizá-lo.
17. **Compatibilidade de Portas.** PostgreSQL: `5434`, API: `3001`, Frontend: `3000`. Não alterar sem atualizar todos os configs.
18. **Fluxo Canônico de Resolução de Issues.** Ao receber `resolver issue <id>`: branch dedicada → teste que falha → fix → validação local → PR → CI → merge → atualizar fila.

---

## Build & Test

```bash
# Instalar dependências
pnpm install

# Build completo
pnpm build

# Testes
pnpm test

# Dev
docker compose up -d postgres
pnpm --filter @adlogs/shared prisma:migrate
pnpm dev
```

## Code Standards

- TypeScript estrito — nunca `any`
- Arquivos: kebab-case; classes: PascalCase; variáveis: camelCase; enums: UPPER_CASE
- Exportações nomeadas (sem `export default` exceto páginas Next.js)
- Sempre `pnpm`, nunca `npm`
- Não commitar `.env` ou secrets

## Testing Requirements

- Jest (NestJS) + Vitest (Next.js)
- TDD obrigatório: teste antes do código
- Cobertura mínima: 80%
- Testes de integração com banco real (não mocks do Prisma)
