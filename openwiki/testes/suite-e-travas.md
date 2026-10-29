---
type: testes
title: Testes e travas mecânicas
description: Como a suíte Vitest está organizada (ambiente node por padrão, jsdom declarado por arquivo, ~1.200 arquivos de teste sobre lógica pura), como rodar um teste isolado, e o padrão central do projeto — regras que já causaram bug viram testes que varrem o código-fonte ("catracas") ou scripts check-*.sh, para não depender de alguém lembrar.
tags: [testing, vitest, ci, guard-tests, ratchet, conventions]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-a7401834e69de31f8a4983a4
    resource: repo://__tests__/bytesNulNoFonte.test.ts
  - id: openwiki-source-19ae5477b1f6ab6e7e9a45aa
    resource: repo://__tests__/components/setup.ts
  - id: openwiki-source-8e67c1e12c3ba68b6f964cc5
    resource: repo://__tests__/darkSoPorClasse.test.ts
  - id: openwiki-source-f3093ac0d673ccf55e874739
    resource: repo://__tests__/orgContextGuard.test.ts
  - id: openwiki-source-6866c18a13750171ad185278
    resource: repo://__tests__/segurancaMigrations.test.ts
  - id: openwiki-source-f8f65ca6585894cbc661341f
    resource: repo://__tests__/selectEstrelaSensivel.test.ts
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-d9195e1bcbd3e73b3e6c3d03
    resource: repo://scripts/check-ui-standard.sh
  - id: openwiki-source-5e1b077422a94ae165e88e4e
    resource: repo://vite.config.ts
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Testes e travas mecânicas

## Vitest

Configuração no próprio `vite.config.ts` (`test:`):

- `environment: 'node'` por padrão; `globals: true`;
- `include`: `__tests__/**/*.test.ts` e `*.test.tsx`;
- setup único `__tests__/components/setup.ts` (importa
  `@testing-library/jest-dom`);
- **teste que precisa de DOM declara `// @vitest-environment jsdom` no topo do
  próprio arquivo**. A antiga opção `environmentMatchGlobs` (que mandava
  `__tests__/components/**` para jsdom) foi removida no Vitest 4 e saiu da
  config — documentação que ainda diga "jsdom só para `components/`" está
  desatualizada.

Organização de `__tests__/`: ~900 arquivos na raiz (um por módulo/regra), ~320 em
`components/` (Testing Library), `fixtures/` (ex.: NBR 12721 conferido contra o
SQL antigo), `apoio/` (helpers) e `__snapshots__/`. A maior parte testa **lógica
pura** — `utils/`, `lib/`, kernel da Planta, motores de folha, conciliação,
cronograma — sem banco e sem DOM. É por isso que o código de regra é extraído
para módulos sem imports de rede (ver `utils/reconciliationRules.ts`,
`utils/folhaFinanceiro.ts`).

```bash
npm run test                                             # suíte inteira (vitest run)
npm run test:watch                                       # watch
npx vitest run __tests__/blueprintKernel.test.ts         # um arquivo
npx vitest run -t "nome do teste"                        # por nome
npx vitest run __tests__/foo.test.ts -t "nome do teste"  # arquivo + nome
npm run typecheck                                        # tsc --noEmit (heap de 8 GB)
npm run ci                                               # typecheck && test && build
```

⚠️ A suíte só roda com `node_modules` **real** — com junção do Windows o runner
se perde e todos os arquivos falham iguais (ver
[Frentes e publicação](../operacao/publicacao-e-frentes.md)). Leia o resultado
da suíte antes de empurrar; não encadeie o push no comando de teste.

## O padrão: regra que voltou vira teste

O `CLAUDE.md` tem regras obrigatórias numeradas, cada uma nascida de um bug real
que voltou mais de uma vez. O aprendizado registrado em todas: **script que
depende de alguém rodar não protege** — foi exatamente assim que os bugs
voltaram. Então as regras viraram **testes que leem o código-fonte** e rodam no
CI a cada push/PR.

### Catracas (baseline que só diminui)

| Teste | O que proíbe |
|---|---|
| `orgContextGuard.test.ts` | `organizations[0]`, `\|\| ''` como "Todas", guard que bloqueia leitura, `enabled: !!organizationId` — ver [Multi-tenancy](../conceitos/multi-tenancy-organizacao.md) |
| `segurancaMigrations.test.ts` | policy sem condição, policy `anon` com `true`, `SECURITY DEFINER` sem `REVOKE` — ver [Segurança](../seguranca/rls-funcoes-e-edge-functions.md) |
| `migrationsPrefixo.test.ts` | prefixo de migration duplicado ou ausente — ver [Banco](../operacao/banco-e-migrations.md) |
| `viewSecurityGuard.test.ts` | view nova que não nasce fechada |
| `selectEstrelaSensivel.test.ts` | `select('*')` **novo** em tabela de credencial, documento pessoal ou remuneração |
| `orgDoCondominioGuard.test.ts` | regra da organização própria do condomínio |

Mecânica comum: um **BASELINE** registra a dívida existente quando a regra
nasceu (arquivo → número de ocorrências). Arquivo fora do baseline com violação
falha; baseline que piora falha; baseline que **melhora sem ser baixado** também
falha (nunca fica folgado). Uma **ALLOWLIST** separada guarda exceções
permanentes, cada uma com justificativa. Nunca acrescente entrada ao baseline
para fazer passar; nunca mova um corte de histórico para frente.

### Outras travas por varredura

`darkSoPorClasse` (variante `dark:` só por classe), `cabecalhoSemCinzaGuard` e
`valorDeCampoSemCinzaGuard` (padrões de UI §6.11 e §32), `canvasSemOnWheel`
(canvas de desenho não usa o `onWheel` do React), `bytesNulNoFonte` (um `\0`
literal no fonte já escondeu um defeito por três semanas),
`barraDeRolagemPadrao`, `conciliacaoStatusUnico` (uma definição só de
"conciliado"), `codigoPatrimonialUnico` e outras — ~70 arquivos de teste leem o
código-fonte com `readFileSync`/`readdirSync`. Testes de "contrato" amarram
listas que precisam andar juntas (ex.: abas de portal ↔ seções da ajuda; fichas
por tipo de ponto da Planta ↔ todas as tabelas que as consomem).

### Scripts de verificação

| Script | Uso | No CI? |
|---|---|---|
| `scripts/check-ui-standard.sh <arquivo>` | padrão de UI nos arquivos tocados | não — obrigatório ao editar tela |
| `scripts/check-system-projects.sh [arq]` | comparação literal com "Gestão Comercial" | não |
| `scripts/check-project-classification.sh [arq]` | `=== 'OBRA'` literal | não |
| `scripts/check-org-selector-guard.sh` | equivalente em shell do `orgContextGuard` | (o teste roda) |
| `scripts/check-xss-sinks.sh` | HTML sem `sanitizeHtml()` | **sim**, e no build do Vercel |
| `scripts/check-rls-postura.sh` | postura real do banco | não — precisa do banco |
| `scripts/verificar-views-anon.sh` | views expostas a `anon` | não — precisa do banco |
| `scripts/check-rls-delete-gap.mjs` | DELETE que a RLS engole | não |

Todos saem com código ≠ 0 quando acham algo. Um alerta só vira achado depois de
conferir o dado.

## CI

`.github/workflows/ci.yml`, em push e PR para `main`: `npm ci` → `tsc --noEmit` →
`check-xss-sinks.sh` → `vitest run` → `vite build`. Usa Node 20 e
`NODE_OPTIONS=--max-old-space-size=6144` (o `tsc` passou de 4 GB de heap). O CI
**não** é portão de publicação — o build do Vercel roda em paralelo e tem portão
próprio (`verificar:build`). Ver
[Frentes, publicação e conferência](../operacao/publicacao-e-frentes.md).

## Verificar de verdade

Teste verde prova a lógica; não prova a tela nem o deploy. Mudança de interface
se confere no app rodando (`npm run dev`, porta 3100); publicação se confere
pelo SHA servido no domínio (`scripts/conferir-producao.sh`); Edge Function, pela
resposta HTTP do deploy publicado.
