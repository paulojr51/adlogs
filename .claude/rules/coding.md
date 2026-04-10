# Convenções Gerais de Código

- TypeScript estrito. Nunca usar `any` — usar `unknown` com type guards ou `as unknown as T`.
- **Naming:** variáveis/funções camelCase, arquivos kebab-case, classes PascalCase, enums UPPER_CASE.
- Exportações nomeadas (sem `export default`, exceto páginas Next.js e layout.tsx).
- Nunca usar `npm` — sempre `pnpm`. O projeto usa pnpm workspaces.
- Não criar arquivos fora da estrutura definida — respeitar a organização do monorepo.
- Não commitar `.env`, secrets ou credentials — nunca.
- Não usar `git add .` — adicionar arquivos específicos por nome.
- **Eventos são imutáveis:** `login_events` e `file_events` nunca recebem UPDATE ou DELETE — apenas INSERT e SELECT.
- **Roles e RBAC:** sempre verificar role do usuário nos controllers. VIEWER não pode criar/editar/deletar nada. ANALYST pode ler eventos e gerar relatórios. ADMIN gerencia usuários e configurações. SUPER_ADMIN tem acesso total.
- **Datas:** sempre usar UTC no backend. O frontend converte para o fuso local do usuário.
- **Porta PostgreSQL:** 5434 (não 5432, não 5433). API: 3001. Frontend: 3000.

## Padrão NestJS (apps/api)

- Módulos: um diretório por domínio com `*.module.ts`, `*.service.ts`, `*.controller.ts`, `dto/`.
- Services: toda lógica de negócio. Controllers: apenas validação de entrada e delegação ao service.
- DTOs: usar `class-validator` decorators. Todos os campos com `!` (non-null assertion) para campos obrigatórios.
- Injeção de dependência: sempre via construtor.
- PrismaService é global (via PrismaModule global).

## Padrão Next.js (apps/web)

- App Router com route groups: `(auth)` para login, `(app)` para área autenticada.
- Componentes client: `'use client'` apenas quando necessário (estado, eventos, hooks).
- Dados: fetch direto na página com `useEffect` + `api.get()`. Não usar Server Components para chamadas autenticadas.
- Tailwind CSS com dark theme (slate-900/950 como base).
- Sem `export default` em componentes — apenas em pages/layouts (obrigação Next.js).

## Collector Python

- PEP 8 obrigatório.
- Type hints em todas as funções.
- Logging com `logging.getLogger('adlogs.<module>')`.
- Todas as operações de DB com try/except e rollback em caso de erro.
- Nunca deixar uma exceção não tratada no loop principal do serviço.
