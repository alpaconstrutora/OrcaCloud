# A fila de carregamento do login — 28 requisições, 3 MB, 17 simultâneas

## Pedido original

Sessão de 24/09/2026. Depois de eu diagnosticar que o `AbortError` relatado
vinha do badge de notificações e propor publicar só aquela correção, o usuário
respondeu, escolhendo entre as opções oferecidas:

> Antes, investigar a fila de ~30 requisições

Contexto do pedido anterior, na mesma sessão:

> erro no console ao tentar cadastrar novo equipamento, atraves do modal Novo equipamento:
> […] "Failed to fetch unread count: AbortError: signal is aborted without reason"

## Método

Roteiro `c:/tmp/pwtest/fila-carregamento.js`, rodado contra **produção**
(`orcacloud.vercel.app`) — não contra o servidor da frente, porque duplicata de
efeito por StrictMode só existe em dev e contaria uma história que o usuário não
vive. Somente leitura: POST/PATCH/DELETE em `/rest/v1/` abortados (nenhuma
escrita foi sequer tentada).

Mede por requisição: instante de início, duração, bytes do corpo, status.

## O que a fila é, medida

**28 requisições · ~3 MB · pico de 17 em voo ao mesmo tempo, todas disparadas
em +840 ms do login.**

### As mais lentas

| Duração | Corpo | Requisição |
|---|---|---|
| 5.469 ms | 0 KB | `rpc/fn_reconciliation_divergences` |
| 5.460 ms | **1.193 KB** | `GET projects` |
| 5.415 ms | 134 KB | `rpc/fn_approval_action_queue` |
| 5.264 ms | 1 KB | `rpc/fn_financial_alerts` |
| 5.259 ms | 0 KB | `rpc/fn_approval_pending_summary` |
| 5.252 ms | 9 KB | `rpc/fn_cashflow_projection` |
| 5.213 ms | 3 KB | `rpc/fn_project_scorecard` |

Sete RPCs em ~5,2–5,5 s, todas começando no mesmo instante. Elas não são
grandes — são **lentas**, e concorrem entre si.

### Onde estão os 3 MB

`GET projects` = **1.193 KB, e roda DUAS vezes** = 2.385 KB. É **80% de todo o
tráfego do carregamento**. Depois vêm `organizations` (261 KB),
`fn_approval_action_queue` (134 KB), `notifications` (93 KB).

### Repetições

| Vezes | Requisição | Quando |
|---|---|---|
| 3× | `GET employees` | +840 ms, +3.057 ms, +6.441 ms |
| 2× | `GET projects` | +840 ms, +6.621 ms — **2.385 KB somados** |
| 2× | `GET organization_members` | +840 ms, +6.263 ms |
| 2× | `GET tasks` | +840 ms, +840 ms (simultâneas) |

## Por que `GET projects` pesa 1,2 MB

`projectService.listProjects` seleciona a coluna `settings` inteira — um JSONB —
de **todos** os projetos, e só depois filtra classificação e projeto de sistema
**em JavaScript**.

São 31 projetos. O que vem dentro de `settings`, medido no banco:

| Chave | Peso | Em quantos projetos |
|---|---|---|
| `planningVersions` | **472 kB** | 1 |
| `schedule` | 325 kB | 5 |
| `financialInfo` | 215 kB | 31 |
| `basedOnBudgetSnapshot` | 136 kB | 1 |
| `diaryEntries` | 75 kB | 27 |
| `wbs` | 67 kB | 31 |

Um único projeto tem 131 kB de `settings`.

**E de `settings` a lista precisa de cinco chaves escalares:**
`classification` (para `onlyObras`), `isSystemProject` e `name` (para
`isSystemProject`), `organizationId` e `code` (para a árvore de contexto).
Todo o resto — cronograma, versões de planejamento, WBS, diário, financeiro —
é baixado e descartado.

## Quem chama duas vezes

Dois consumidores independentes, ambos com `classifications: 'ALL'`:

1. `store/useStore.ts:296` — `fetchProjects`, a lista global do app.
2. `hooks/useContextTree.ts:210` — a árvore do seletor de contexto do topo.

A árvore de contexto (`buildContextTree`) usa **só** `id`, `name`,
`organization_id`, `code`, `settings?.organizationId`, `settings?.code` e
`settings?.classification`. Ela não toca em nada do que pesa.

## Conclusão sobre o `AbortError`

O timeout do client é 20 s (`lib/supabase.ts`). Com 17 requisições em voo, sete
delas de ~5,5 s, e 2,4 MB de `projects` no meio da fila, uma requisição chegar a
20 s em rede ou banco pior **deixa de ser improvável**. O badge de notificações
era uma vítima da fila, não a causa — e por isso a correção dele (95 KB → 0
bytes) alivia, mas não resolve.

## Opções (nenhuma executada ainda)

| # | O que fazer | Ganho medido | Risco |
|---|---|---|---|
| A | `useContextTree` passa a pedir uma projeção enxuta (`settings->>classification` etc.) | **−1,2 MB** (metade do total) | Baixo: 1 consumidor, `buildContextTree`, que já só usa 7 campos |
| B | `listProjects` deixa de trazer `settings` por padrão; quem precisa pede | −2,4 MB, e corta o payload de toda tela que lista obra | Alto: ~30 chamadas, e o compilador aponta cada uma (REGRA #3) |
| C | Investigar por que 7 RPCs levam 5,5 s | some o pior da latência | Médio: é trabalho de banco (plano, índice, RLS), não de front |
| D | Escalonar a rajada (fila com concorrência limitada no client) | tira o pico de 17 | Médio: muda o comportamento de carregamento do app inteiro |

## Execução do item A — e a correção de rota no meio dele

O usuário escolheu **A + badge agora, C como frente própria**.

### ⚠️ A minha hipótese sobre A estava errada, e a medição corrigiu

Eu havia escrito que os dois `GET projects` eram "store + árvore de contexto".
Ao instrumentar `window.fetch` e capturar a **pilha de chamada** de cada uma
(`c:/tmp/pwtest/quem-chama-projects.js`), as duas vieram do MESMO lugar:

```
at async Object.listProjects (services/projectService.ts)
at async fetchProjects      (store/useStore.ts)
```

A árvore de contexto **não busca nada no login**: `ContextSelector` só passa
`everOpened=true` depois do primeiro clique no seletor. Ela nunca foi a segunda
chamada.

### A causa real da duplicata: um parâmetro morto na lista de dependências

`fetchProjects(organizations)` **nunca usou** o parâmetro — a organização sai de
`activeOrganizationId` do próprio store (REGRA #5). Mas `organizations` estava
na lista de dependências do efeito em `App.tsx:487`, e a identidade do array
muda quando `fetchOrganizations` resolve. O efeito refazia a busca inteira.

Correção: o parâmetro saiu da assinatura (o compilador apontou as 4 chamadas) e
das dependências, em `App.tsx` e em `DiaryProjectsList.tsx`.

### E o `lean` continua valendo — para quando a árvore ABRE

A projeção enxuta ficou, porque abrir o seletor de contexto baixava 1,2 MB para
desenhar uma árvore que usa 7 campos.

⚠️ O risco dessa projeção era **falhar em silêncio**: se
`settings->>isSystemProject` (chave camelCase) voltasse nulo, `onlyObras` e
`excludeSystemProjects` passariam a mentir sem erro nenhum. Exercitado na tela,
com o corpo da resposta inspecionado:

- `s_classification` preenchido em **30/30** linhas
- distribuição `{OBRA: 18, ORCAMENTO: 6, DIARIO: 3, PLANEJAMENTO: 3}` — bate com o banco
- `s_is_system` não-nulo em **3/30**, todos `'true'` — os três projetos de sistema
- a árvore monta (Bella Vista, Garden na tela)

## Resultado medido

| Momento | Antes | Depois |
|---|---|---|
| `GET projects` no login | 2 × 1.193 KB = **2.386 KB** | 1 × 1.193 KB |
| `GET projects` ao abrir o seletor de contexto | 1.193 KB | **13 KB** |
| Badge de notificações, por ciclo | 95 KB | **0 bytes** |

**~2,4 MB a menos no carregamento**, e o badge deixou de trafegar 95 KB a cada
60 s.

### O que NÃO foi feito

- **B** (tirar `settings` do `listProjects` por padrão) — segue de pé: o login
  ainda baixa 1.193 KB de cronograma, WBS, diário e financeiro para listar obra.
- **C** (as 7 RPCs de 5,2–5,5 s) — frente própria, como combinado.
- **D** (limitar concorrência) — não avaliado.

## Estado

Item A e badge concluídos e verificados — 24/09/2026.
Mecânica: `tsc` limpo · `build` limpo · **5.166 testes** · `check-ui-standard`
limpo nos arquivos tocados · os 4 scripts de regra OK · zero erro de console.
