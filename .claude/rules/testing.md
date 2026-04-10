# Estratégia de Testes

## Princípio: TDD Inviolável

RED → GREEN → REFACTOR. Escrever o teste antes do código de produção. Sem exceções.

## NestJS (apps/api)

### Unit Tests (*.spec.ts)
- Testar cada Service de forma isolada.
- Mockar apenas dependências externas (PrismaService, requests HTTP).
- Não mockar PrismaService para testes de integração.
- Usar `@nestjs/testing` com `createTestingModule`.

```typescript
// Exemplo: auth.service.spec.ts
import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn(), update: jest.fn() },
          },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('token') },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    prisma = module.get(PrismaService);
  });
  // ...
});
```

### Integration Tests (*.integration.spec.ts)
- Usar banco de dados real (PostgreSQL de teste).
- Nunca mockar o Prisma em testes de integração.
- Limpar dados entre testes com `beforeEach`.

### E2E Tests (test/*)
- Usar `supertest` para testar a API end-to-end.
- Cobrir o fluxo completo: auth → operação → verificação no banco.

## Next.js (apps/web)

### Unit Tests (*.spec.tsx)
- Usar Vitest + jsdom.
- Testar hooks e funções utilitárias.
- Mockar `api.ts` para testes de componentes.

## Python Collector

- Pytest para todos os testes.
- Mockar `win32evtlog` (não disponível fora do Windows).
- Mockar `psycopg2` para testes de db_writer.
- Testar parser de eventos com strings de exemplo reais.

## Cobertura Mínima

- Services NestJS: 80%
- Utilitários frontend: 70%
- Parser Python: 90% (crítico para corretude)

## Padrão de Nomenclatura

- `describe('NomeDoModulo')` → `it('deve fazer X quando Y')`
- Mensagens em português.
- Um `describe` por arquivo, `it` por comportamento.
