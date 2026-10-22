# ZARO · aplicação

Recriação do protótipo `../prototipo/ZARO.dc.html` como sistema de verdade, seguindo `../README.md`.

## Pilha
- Next.js 15 (App Router, server actions) + TypeScript, CSS próprio com os tokens do protótipo (`src/app/globals.css`).
- PostgreSQL via Drizzle ORM. Sem `DATABASE_URL`, usa PGlite (Postgres embutido) em `./dados/banco`. Migrações em `src/db/migrations`, aplicadas na primeira conexão.
- Arquivos em disco (`./dados/arquivos`), atrás de `src/server/arquivos.ts`, para trocar por S3/Supabase Storage.
- IA (Conselho) só no servidor, com `@anthropic-ai/sdk` (`src/server/conselho.ts`).

## Estrutura
| Pasta | O quê |
|---|---|
| `src/domain` | Regras de negócio puras, com testes: leitura de XML (`nfe.ts`), operação da nota e títulos (`operacao.ts`), regime por vigência, motor contábil e extrato (`motor.ts`), demonstrações, Lucro Presumido |
| `src/db` | Esquema (todo dado tem `tenant_id` e, quando é de empresa, `empresa_id`) e conexão |
| `src/server` | Serviços: login e sessão, auditoria, Autopilot, financeiro, contábil, SEFAZ, importação do backup, Conselho |
| `src/app` | Telas. `(acesso)` = login e primeiro acesso; `(app)` = sistema |

Os lançamentos contábeis são recalculados das operações a cada consulta; o banco guarda só a decisão do contador (`lancamento_decisoes`) e as regras aprendidas. Assim, corrigir uma operação corrige a contabilidade.

## Comandos
```
npm install
npm test            # regras de negócio
npm run typecheck
npm run build && npm start   # http://localhost:3000
npm run db:generate # depois de mudar src/db/schema.ts
```

## Produção
Defina `DATABASE_URL` (Supabase, Neon), publique atrás de HTTPS com `ZARO_COOKIE_SEGURO=1` e mova os arquivos para um storage. Veja `.env.example`.
