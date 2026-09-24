# Item C — por que as RPCs do login levam 5 a 18 segundos

## Pedido original

Sessão de 24/09/2026. Depois de eu apresentar quatro opções para a fila de
carregamento, o usuário respondeu:

> siga com A + beadge e C como frente própria, como voce sugeriu

e, ao abrir esta frente:

> ok, abrir a frente de C

"C" era, na minha própria lista: *"Investigar por que 7 RPCs levam 5,5 s"*.

## Resposta curta

**Não é o SQL delas.** Cada função é rápida sozinha e fica lenta só quando as
oito correm juntas num banco pequeno. O gargalo é **capacidade × rajada**, não
plano de consulta nem índice faltando.

E a consequência disso é dura: **não existe conserto no agendamento do
cliente.** Eu tentei — e a medição me desmentiu. Ver "O que eu tentei e
descartei".

## As medições

### 1. Cada RPC, sozinha, com a RLS ativa

Todas são `SECURITY INVOKER`, então a RLS pesa **por dentro** delas: medir como
`postgres` daria um número bonito e falso. Medido com o papel `authenticated` e
as claims do JWT no GUC, como o PostgREST faz:

| função | sozinha |
|---|---|
| `fn_reconciliation_divergences` | 1.511 ms |
| `fn_approval_pending_summary` | 880 ms |
| `fn_approval_action_queue` | 79 ms |
| `fn_financial_alerts` | 55 ms |
| `fn_process_bottlenecks` | 48 ms |
| `fn_cashflow_projection` | 41 ms |
| `fn_project_scorecard` | 30 ms |

Somadas, **2,6 s**.

### 2. As mesmas RPCs, em produção, sob concorrência real

`pg_stat_statements`, sobre ~350 chamadas reais:

| função | melhor | média | pior | CPU acumulada |
|---|---|---|---|---|
| `fn_reconciliation_divergences` | 226 ms | 3.744 ms | **7.805 ms** | 172 s |
| `fn_approval_pending_summary` | 159 ms | 3.068 ms | 7.768 ms | 147 s |
| `fn_approval_action_queue` | 160 ms | 2.880 ms | 7.442 ms | 138 s |
| `fn_financial_alerts` | 49 ms | 2.162 ms | 7.733 ms | 110 s |
| `fn_cashflow_projection` | 65 ms | 1.911 ms | 6.893 ms | 99 s |
| `fn_project_scorecard` | 32 ms | 1.575 ms | 7.103 ms | 82 s |
| `fn_process_bottlenecks` | **3 ms** | 687 ms | **3.565 ms** | 36 s |

`fn_process_bottlenecks` leva **3 ms** sozinha e **3.565 ms** no pior caso —
mil vezes pior. Isso não é função lenta. É disputa.

### 3. Quem dispara, e quantas de uma vez

As oito saem juntas de `components/CentralControle.tsx:90`, a **tela de
entrada**, num `Promise.allSettled` — por cima das ~17 outras requisições da
casca do app. Pico medido: **17 requisições em voo ao mesmo tempo**.

### 4. O tamanho da instância

`shared_buffers` **224 MB** · `max_parallel_workers` **2** ·
`max_connections` **60**. É instância pequena para 17 consultas concorrentes.

### 5. O timeout de 20 s É atingido em produção — capturado

Perfilando a produção logo após o deploy do item A, oito requisições morreram
no teto do client, todas em 20.005–20.009 ms:

```
POST rpc/fn_reconciliation_divergences → ERR_ABORTED (20006ms)
POST rpc/fn_approval_pending_summary   → ERR_ABORTED (20009ms)
POST rpc/fn_approval_action_queue      → ERR_ABORTED (20007ms)
GET  financial_approval_config         → ERR_ABORTED (20006ms)
POST rpc/fn_cashflow_projection        → ERR_ABORTED (20006ms)
HEAD notifications                     → ERR_ABORTED (20005ms)  ← o erro relatado
GET  projects                          → ERR_ABORTED (20005ms)
GET  companies                         → ERR_ABORTED (20005ms)
```

É a reprodução do `AbortError` que abriu esta investigação.

### 6. Um imposto de fundo que ninguém vê

O WAL-poller do Supabase Realtime: **26.363 execuções, 12,33 ms cada,
325 s de CPU** acumulados. Não é rajada — é carga constante na mesma instância
pequena.

## O que eu tentei e descartei

**Hipótese:** se elas se atropelam, limitar a concorrência no cliente deveria
deixar o conjunto mais rápido.

Escrevi `utils/concorrencia.ts` (`allSettledLimitado`, com 7 testes) e liguei na
Central de Controle com teto de 3. Depois medi.

| teto | janela da faixa |
|---|---|
| 1 (sequencial) | 18,99 s — **muito pior** |
| 3 | 4,32 s |
| 8 (atual) | 5,05 s |

Parecia ganho. Mas repetindo, os números pularam para 13–22 s com o MESMO teto
de 3 — o banco é compartilhado e a carga dele deriva. Refiz como **A/B
intercalado** (A, B, A, B, A, B), para a deriva cair igual nos dois braços:

| rodada | A (sem teto) | B (teto 3) |
|---|---|---|
| 1 | 8,06 s | 9,37 s |
| 2 | 6,26 s | 4,23 s |
| 3 | 2,70 s | 4,70 s |

**Inconclusivo.** A variância (2,7 s a 9,4 s) engole qualquer diferença entre os
braços. Não dá para afirmar que o teto ajuda.

**Revertido.** O código do limitador e os testes foram removidos — não publico
otimização que não consegui demonstrar. Ficam no histórico desta branch se a
decisão mudar.

A lição: reorganizar o MESMO trabalho num cano mais estreito não reduz o
trabalho. O que resolve é fazer menos, ou ter mais capacidade.

## Caminhos que de fato reduzem trabalho ou aumentam capacidade

| # | O quê | Por que deve funcionar | Custo |
|---|---|---|---|
| C1 | **Consolidar as 7 RPCs numa só** | 1 conexão, 1 round-trip, e o Postgres reaproveita cache entre os blocos em vez de sete sessões disputando | Médio — uma função nova, a tela passa a ler um objeto |
| C2 | **Materializar os agregados** (view materializada + `pg_cron`) | Dashboard olha número de ontem/da última hora; hoje recalcula tudo a cada login de cada usuário | Médio-alto — decidir a frescura aceitável com o usuário |
| C3 | **Adiar a Central de Controle** até a casca assentar | Tira a sobreposição entre as 8 da tela e as 17 da casca | Baixo — mas atrasa o primeiro dado da tela de entrada |
| C4 | **Item B da investigação anterior** (parar de trazer `settings` no `listProjects`) | Ainda são 1.193 KB por login, e `GET projects` chegou a abortar em 20 s | Alto — ~30 chamadas, o compilador aponta cada uma |
| C5 | **Instância maior** | 224 MB de `shared_buffers` e 2 parallel workers é pouco para essa rajada | Custo de infraestrutura, decisão do usuário |

Minha recomendação, nessa ordem: **C1 + C3** primeiro (reduzem trabalho e
sobreposição sem mexer em ~30 chamadas), depois **C4**. **C2** só com decisão
explícita sobre frescura. **C5** é a alavanca mais simples se o orçamento
permitir — nenhuma das outras compensa uma instância subdimensionada para sempre.

## Estado

Investigação concluída — 24/09/2026. **Nenhum código de produto alterado.**
