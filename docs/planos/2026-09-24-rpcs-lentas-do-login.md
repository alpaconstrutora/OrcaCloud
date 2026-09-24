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

## Execução de C1 + C3 (a recomendação, aprovada pelo usuário)

> Siga sua recomendação

### C1 — uma chamada no lugar de seis

`supabase/migrations/aplicar_20270924000001_central_controle_bootstrap.sql`:
`fn_central_controle_bootstrap` roda as seis consultas numa **sessão só**, em
sequência. Uma conexão, um round-trip, cache do Postgres aproveitado entre os
blocos em vez de seis sessões disputando o mesmo buffer pool.

Duas decisões que não são detalhe:

- **`SECURITY INVOKER`**, como as seis originais. Marcar DEFINER faria a
  consolidação virar furo de autorização — devolveria, com os privilégios do
  dono, dados que o chamador não pode ver. A autorização segue na RLS.
- **Um `BEGIN … EXCEPTION` por fonte.** O código que isto substitui usava
  `Promise.allSettled` de propósito, para que uma RPC fora do ar não apagasse
  as outras cinco. Um `SELECT` único perderia isso. Cada fonte devolve
  `{ok, data}` ou `{ok: false, erro}`, e `comoSettled()` reconstrói o mesmo
  `PromiseSettledResult` que a tela já lia — os seis blocos de tratamento não
  mudaram.

Aplicada e conferida com a RLS ativa: **2.501 ms**, 6/6 fontes `ok`,
`action_queue` com 483 itens, `scorecards` 11, `bottlenecks` 5.

### C3 — o painel não compete mais com a casca

As consultas do painel saíam no MESMO instante em que a casca carregava
projetos, organizações, clientes, colaboradores e tarefas. `projectsLoading`
nasce `true` e cai quando o carregamento mais pesado da casca termina — é o
sinal de "assentou" mais honesto que o store oferece. Teto de 4 s para o painel
nunca ficar refém da casca.

O `fn_cashflow_projection` entrou no mesmo portão: ficou fora da consolidada
por ser a única que aceita período (30/60/90) e recarregar sozinha, mas no
primeiro carregamento disputava igual às outras.

| | Antes | Depois |
|---|---|---|
| Chamadas do painel | 8 | **3** (consolidada + 2 leituras de tabela baratas) |
| RPCs pesadas | 6 requisições | **1** (`fn_central_controle_bootstrap`, 148 KB, 893 ms) |
| Quando o painel começa | **+679 ms** — dentro da rajada da casca | **+3.039 ms** — depois de ela assentar |

### A prova que mais importa: os números não mudaram

Produção (código antigo, 6 chamadas) × frente (consolidada) — mesmo usuário,
mesmo dado, texto da tela extraído e comparado linha a linha:

```
✅ IDÊNTICO: 46 linhas de conteúdo batem
```

Inclui os 460 títulos aguardando aprovação (R$ 2.623.352,01), os 27 contratos
(R$ 4.375.623,05), os 5 pedidos, os 6 reajustes vencidos e os saldos projetados
por obra. Zero erro de console nos dois lados.

### O que NÃO prometo

Não afirmo ganho de tempo de parede. A variância do banco compartilhado é
grande demais para isso — foi o que derrubou a tentativa do limitador de
concorrência (ver acima). O que está provado aqui é **estrutural**: seis
round-trips viraram um, e o painel deixou de sobrepor a rajada da casca.

## Estado

C1 e C3 concluídos e verificados — 24/09/2026.
C2, C4 e C5 seguem em aberto (ver a tabela de caminhos acima).

Mecânica: `tsc` limpo · `build` limpo · **5.178 testes** · `segurancaMigrations`
e `migrationsPrefixo` OK · `check-ui-standard` limpo em `CentralControle.tsx` ·
os 4 scripts de regra OK.
