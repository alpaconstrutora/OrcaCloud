# Torre de Controle — Fluxo Financeiro (canvas, como a Torre P2P)

## Pedido original

> faça um fluxo do módulo financeiro da mesma maneira que foi implementado em suprimentos > Torre de Controle — Fluxo P2P
>
> Sessão: ab95e1ed-35f6-4f01-a39a-1d24d201df46 · 2026-10-16

## Pedidos posteriores (mesma sessão, 16/10/2026)

> 1. [senha do usuário de leitura — omitida de propósito: não vai para arquivo versionado] · 2. aplique voce · 3. autorizado

(resposta às três pendências: senha do usuário de leitura para a conferência no navegador — usada só na
linha de comando, não gravada; aplicar a migration; commit + publicação autorizados.)

> Vamos criar
>
> (16/10/2026, depois da publicação — resposta a "falta criar os modelos de processo dos quatro eventos")

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-10-16 | Qual ciclo o fluxo desenha? | **Pagar + Receber**, as duas linhas convergindo em Tesouraria (conciliação) → Controladoria (fechamento/DRE). |
| 2026-10-16 | O motor de Processos só tem UM evento financeiro (`internal_transaction.paid`, e só para título de pedido). O canvas permite gatilhos novos no Financeiro? | **Monitor + eventos novos**: 4 chaves financeiras emitidas pelos serviços + vínculo da instância de processo ao título/boleto (migration). |

Decisão técnica (registrada para não reabrir): **reusar, não copiar**. O canvas da Torre
P2P só é preso ao P2P em 4 pontos — posições por id (`p2pLayout.ts`), ícones por id
(`P2PNodeCard.tsx`), a chamada direta a `p2pFlowService.getStageProcesses` no painel de
métricas, e as `storageKey`s. Viram parâmetro; a página vira um shell genérico
(`components/fluxo/ProcessFlowBoard.tsx`) configurado por fluxo. Os arquivos de
`components/p2p/` mantêm o nome (código publicado no mesmo dia; renomear é churn sem ganho).

Decisão técnica: `internal_transaction.paid` **continua só-pedido**. Torná-lo genérico faria
os modelos já semeados em 3 organizações (`aplicar_20270928000001`) dispararem para toda
folha/tributo/boleto pago. O Financeiro ganha chaves próprias.

## Contexto — o que foi medido antes de planejar (2026-10-16)

- Torre P2P em canvas: commit `3492e66b` (em `origin/main`). Plano de referência
  `docs/planos/2026-10-16-torre-p2p-processo-visual.md`; guia de UI §31.
- Títulos financeiros moram numa tabela só, `internal_transactions`, com ~16 origens
  (`source_system`): `PURCHASE_ORDER`, `NFE`, `BOLETO`, `CONTRACT_*`, `CONTRACT_MEASUREMENT`,
  `LABOR`, `PROLABORE`, `DIVIDENDOS`, `COMMERCIAL` (tributos), `PROJECT`,
  `CONDOMINIO_RATEIO`, `DEBT_INSTALLMENT`, `ASSET_MAINTENANCE`, `ASAAS_FEE`, `MANUAL`.
  Nenhuma trigger no banco cria título: todos os produtores são services/Edge Functions.
- `status` técnico: `PENDING | CONCILIATED | CANCELLED`. `business_status` de negócio
  (pagar: `PREVISTO/APROVADO/PAGO/PARCIAL/RENEGOCIADO/CANCELADO`, mais
  `AGUARDANDO_APROVACAO/BLOQUEADO` gravados por `financialApprovalService`; receber:
  `PREVISTO/EMITIDO/ENVIADO/RECEBIDO/...`). `effective_status` derivado em
  `vw_payables`/`vw_receivables` (VENCIDO, PAGO/RECEBIDO).
- Alçada: `approvalService.submit('transaction')`; só o **boleto** submete sozinho.
  **Nenhum caminho de baixa confere `approval_status`** (lacuna — vai aparecer no canvas).
- Baixa: manual (`payableService`/`receivableService`/`boletoService.marcarPago`),
  conciliação (`bankReconciliationService.createMatch`/`reconcileGroup` → `fn_reconcile_match`),
  CRON `reconciliation-engine-sweep` (10 min, Edge Function), Asaas (`asaas-webhook`).
- Motor de Processos: 6 `ProcessEventKey`, todos do P2P. Eventos são emitidos pelos
  serviços (cliente), não por trigger. `process_templates.trigger_event_key` não tem CHECK
  no banco. `process_instances` liga a pedido/contrato/fornecedor/cliente/obra — **não a
  título nem a boleto**; `triggerEvent` deduplica só por `purchase_order_id`.

## Plano — um item por arquivo (o que muda · como sei que terminou)

### A. Frente e plano
- [x] **A.1** `bash scripts/nova-frente.sh torre-financeiro-canvas` → `C:\D\frentes\torre-financeiro-canvas` a partir de `origin/main` `a816a446`.
- [x] **A.2** este arquivo. Lidos antes de editar: `CLAUDE.md` inteiro, `docs/ui_ux_guia_unificado.md` inteiro (§31 incluída).

### B. Generalizar o que é do P2P (comportamento do P2P inalterado)
- [x] **B.1 `types/processFlow.ts`** (novo) — tipos do fluxo (`SeamStatus`, `FlowEdge`, `FlowGroup`, `FlowStage`, `FlowRecord`, `FlowTemplateAtivo`, `FlowProcessItem`, `FlowProcessSummary`, `FlowSnapshot`). `p2pFlowService.ts` re-exporta com os nomes `P2P*`. Terminou: nenhum import existente muda.
- [x] **B.2 `services/processFlowShared.ts`** (novo) — `countRows`, `fetchRows`, `lerMotor`, `instanciaAtrasada`, `instanciasDoNo`, `resumirProcessos`, `montarArestas(definicoes, edgeEventKeys, motor)`, `processosDoNo`. `p2pFlowService` importa daqui. Terminou: `p2pFlowServiceCosturaOrquestrada.test.ts` verde sem alteração.
- [x] **B.3 `utils/p2pLayout.ts`** — `posicoesDosNos(ids, celulas = CELULAS_P2P)`; linha de reserva = maior linha + 1. Terminou: `__tests__/p2pLayout.test.ts` com casos novos (células customizadas, reserva abaixo).
- [x] **B.4 `components/p2p/P2PNodeCard.tsx`** — prop `icones` (padrão `STAGE_ICON`); propagada por `P2PCanvas`, `P2PLibrary`, `P2PListaMobile`.
- [x] **B.5 `components/p2p/P2PCanvas.tsx`** — props `celulas` e `icones`.
- [x] **B.6 `components/p2p/P2PMetricsPanel.tsx`** — props `carregarProcessos` e `storageKey`.
- [x] **B.7 `components/p2p/P2PLibrary.tsx`** — Gatilhos = só os eventos das arestas deste fluxo.
- [x] **B.8 `components/fluxo/ProcessFlowBoard.tsx`** (novo) — corpo do `P2PFlowBoard` com `config: FlowBoardConfig`. Drawers/editor/modal de org irmãos da grade.
- [x] **B.9 `components/P2PFlowBoard.tsx`** — wrapper com a config P2P. Terminou: `P2PFlowBoardCanvas`, `P2PFlowBoardDrawer`, `P2PFlowBoardEditor`, `ProcessosModeloAlcada` verdes sem alteração.

### C. Eventos financeiros no motor de Processos

| Chave | Rótulo | Quem emite | Conduz a aresta |
|---|---|---|---|
| `boleto.approved` | Boleto aprovado (título criado) | `boletoService.aprovarECriarInvoice` | boletos → a_pagar |
| `payable.approved` | Título a pagar aprovado na alçada | `approvalService` (entidade `transaction` fecha APROVADO), só DEBIT | aprovacao → pagamento |
| `payable.settled` | Título a pagar baixado | `payableService`, `boletoService.marcarPago`, conciliação (DEBIT) | pagamento → baixado |
| `receivable.settled` | Título a receber recebido | `receivableService`, conciliação (CREDIT) | cobranca → baixado |

- [x] **C.1 `types/process.ts`** — 4 chaves + rótulos.
- [x] **C.2 `supabase/migrations/aplicar_20271016400000_processos_vinculo_titulo.sql`** — aplicada em 16/10 (`db query --linked -f`) com ok do usuário; conferida em `information_schema` + `pg_indexes` + `pg_constraint` (duas colunas `uuid`, dois índices parciais, `confdeltype = n` = SET NULL); `NOTIFY pgrst, 'reload schema'`. — `process_instances.internal_transaction_id` / `boleto_id` (FK ON DELETE SET NULL) + índices parciais; idempotente; sem policy/função/seed. Aplicar só com ok do usuário (`db query --linked -f`, nunca `db push`); conferir por `information_schema.columns`.
- [x] **C.3 `services/processService.ts`** — `startInstance`/`triggerEvent` aceitam e deduplicam por `internalTransactionId`/`boletoId`; `triggerForFinancialTitle(txId, key)`; `triggerSettlement(txId)`. Best-effort.
- [x] **C.4 Emissores** — `boletoService.ts`, `approvalService.ts`, `payableService.ts`, `receivableService.ts`, `bankReconciliationService.ts`.
- [x] **C.5 `__tests__/processosEventosFinanceiro.test.ts`** — cada emissor dispara a chave certa; direção errada não; dedup por título; motor lançando não derruba a gravação.

### D. Fluxo Financeiro
- [x] **D.1 `services/financeiroFlowService.ts`** — 11 nós, 10 arestas, 4 grupos (tabela abaixo).
- [x] **D.2 `utils/p2pLayout.ts`** — `CELULAS_FINANCEIRO`. Terminou: teste de caixas de grupo sem sobreposição.
- [x] **D.3 `components/FinanceiroFlowBoard.tsx`** — wrapper com a config financeira.
- [x] **D.4 Rota e menu** — `AppRouter.tsx` (`fluxo-financeiro`), `Layout.tsx` (Financeiro › Análise › "Fluxo Financeiro", `financeiroViews`, `commandItems`), `.claude/skills/rodar-app/varrer-abas.cjs`. **Desvio registrado:** o menu do celular (overlay `forceFull`) não tem grupo Financeiro nenhum — não foi criado um só para esta tela.
- [x] **D.5 Testes** — `__tests__/financeiroFlowService.test.ts`, `__tests__/components/FinanceiroFlowBoard.test.tsx`.

Nós:

| id | Rótulo | Contagem (pendente) | view |
|---|---|---|---|
| `boletos` | Boletos capturados | `boletos` rascunho/revisao | `boletos-pagar` |
| `origens_pagar` | Origens a pagar | DEBIT PENDING, origem ∉ {MANUAL, BOLETO} | `contas-a-pagar` |
| `a_pagar` | Contas a Pagar | `vw_payables` PREVISTO/APROVADO/VENCIDO (VENCIDO) | `contas-a-pagar` |
| `aprovacao` | Alçada | DEBIT aberto (`status='PENDING'`) com `approval_status='PENDENTE'` | `financial-approval` |
| `pagamento` | Pagamento | DEBIT aberto com `approval_status='APROVADO'` (inclui o liberado abaixo do piso e o boleto programado) | `contas-a-pagar` |
| `origens_receber` | Origens a receber | CREDIT PENDING, origem ≠ MANUAL | `contas-a-receber` |
| `a_receber` | Contas a Receber | `vw_receivables` PREVISTO/VENCIDO (VENCIDO) | `contas-a-receber` |
| `cobranca` | Cobrança emitida | `vw_receivables` EMITIDO/ENVIADO | `financial-boletos` |
| `extrato` | Extrato bancário | `bank_transactions` IMPORTED/NORMALIZED/RULE_APPLIED/CONFIRMED (= aba Pendentes da Conciliação) | `bank-reconciliation` |
| `baixado` | Pago / Recebido | `vw_payables` PAGO + `vw_receivables` RECEBIDO | `bank-reconciliation` |
| `fechamento` | Fechamento & DRE | períodos fechados | `controladoria` |

## Achados durante a execução

- **`internal_transactions` não tem `client_id`** (conferido em `information_schema`, 16/10): o resolvedor do título não o seleciona — pedir coluna inexistente derrubaria todo gatilho financeiro.
- **Reserva do layout com linha fracionária**: a primeira versão de `posicoesDosNos(ids, celulas)` usava `floor(max)+1` e, com linha 3,5, a reserva caía em cima do cartão. O teste novo pegou; virou `ceil(max)+1` (o P2P, linha máxima 1, continua na linha 2 como antes).
- **INSERT das colunas novas é condicional** (`processService.startInstance`): mandar `null` numa coluna que o banco ainda não tem derrubaria TODO processo, inclusive os do P2P (PGRST204). Travado em teste.
- `payable.approved` sai do `financialApprovalService`, não do `approvalService` genérico: este é importado pelo `processService` (ciclo).

### Achados da conferência no navegador (16/10, Playwright, login real)
- **Pagamento dava 0**: contava `business_status = 'APROVADO'`, mas a liberação abaixo do piso grava só `approval_status`. Na Alpa: 75 títulos liberados com `business_status` vazio. Agora conta pelo `approval_status` de título aberto → 75.
- **Alçada dava 17, eram 6 na fila**: contava também título já baixado que ficou PENDENTE na alçada (é a lacuna, não fila). Agora só aberto.
- **Extrato**: o critério passou a ser o mesmo da aba Pendentes da Conciliação (+ `CONFIRMED`): 9.397 na Alpa — número real, confere com a distribuição de status no banco.
- **Cartão do canvas (afetava as duas Torres)**: 208×148 truncava o nome da etapa ("Solicitaç…", "Boletos …") e escondia a linha "Entrada" nos cartões com "Processos". Virou 240×184 (o guia já pedia 240 de largura) e o dono saiu do cabeçalho (vai no `title`, drawer e painel). Piso do zoom 0,35 → 0,25 para "Enquadrar" ainda mostrar as 7 colunas. Guia §31 atualizado.
- **Drawer**: status cru (`VENCIDO`, `AGUARDANDO_APROVACAO`, `NORMALIZED`) virou texto; nó com várias entradas (Contas a Pagar: 2; Pago/Recebido: 3) mostrava só a nota da primeira — agora lista todas e fica com a costura mais exigente (`entradaDoNo`).

### E. Modelos de processo dos quatro eventos (pedido "Vamos criar", 16/10)

Decisões do usuário (pergunta com o volume medido na Alpa, 30 dias: 781 boletos aprovados, 102 liberados na alçada, 274 pagos, 3 recebidos):

| Pergunta | Resposta |
|---|---|
| Quais eventos ganham modelo? | **Os quatro.** |
| Volume: valor mínimo por modelo (código novo) ou todo título abre processo? | **Todo título abre processo** — sem código novo. |
| Em quais organizações? | **Nas quatro**, como os modelos do P2P. |

- [x] **E.1 `supabase/migrations/aplicar_20271017100000_processos_modelos_financeiro.sql`** — carga idempotente por (organização, evento), mesmo molde de `aplicar_20270928000001` (sem dono nem responsável por etapa; o dono se define no editor). Modelos: "Boleto aprovado — conferência de classificação" (1 etapa), "Programar pagamento" (programar 24 h → anexar comprovante 72 h), "Pós-pagamento: comprovante e conciliação" (comprovante 48 h → conciliação 72 h), "Recebimento: recibo e conciliação" (recibo 24 h → conciliação 72 h). `segurancaMigrations` verde; **aplicada em 16/10** e conferida: 16 modelos ATIVOS (4 × 4 orgs) com as etapas.
- Consequência registrada: um boleto aprovado abaixo do piso abre DOIS processos na hora (boleto aprovado + programar pagamento) e um terceiro quando é pago.
- [x] **E.2 `services/processFlowShared.ts`** — achado na conferência em produção depois da carga: transição orquestrada tinha a nota SUBSTITUÍDA por "Conduzida por Processos: …", e a lacuna "a baixa não confere a alçada" sumia do painel. Agora a nota do retrato fica depois de quem conduz (vale para as duas Torres). Teste novo em `financeiroFlowService.test.ts`; P2P verde sem alteração.
- [x] **E.3 Conferência** — produção (antes de E.2) e frente (depois), login real, "Todas" e Alpa: as quatro transições "Orquestrada", nós Contas a Pagar, Pagamento e Pago/Recebido com entrada orquestrada, KPI Orquestradas = 3, biblioteca com 1 modelo por gatilho; painel da baixa com "Conduzida por Processos: Pós-pagamento… — … A baixa não confere a alçada". Sem erro de console/JS nem HTTP 4xx/5xx. (O roteiro passou a selecionar a transição pela biblioteca: com um modelo, o chip abre o editor.)

## Verificação

| Prova | Resultado |
|---|---|
| Testes novos | `financeiroFlowService` (11), `processosEventosFinanceiro` (14), `components/FinanceiroFlowBoard` (4), `p2pLayout` (+2 = 12). Mutações conferidas: extrato filtrando por obra, recebível sem disparo e `null` nas colunas novas — cada uma reprovou o teste certo. |
| P2P sem alteração de teste | `p2pFlowServiceCosturaOrquestrada`, `P2PFlowBoardCanvas`, `P2PFlowBoardDrawer`, `P2PFlowBoardEditor`, `ProcessosModeloAlcada`, `usePanZoom`, `processosEventosP2P` — verdes. |
| Suíte inteira (JSON, 16/10 ~16:50) | 3.689 arquivos; 9.960 testes = 9.925 passaram + 34 pulados + **1 falha**: `PainelVersoes` (Planta, fora desta frente) — rodado sozinho: 26/26 verdes; intermitente sob carga. A conta fecha. |
| `check-ui-standard.sh` nos 10 `.tsx` tocados | exit 0 em todos |
| `check-org-selector-guard.sh` (REGRA #5) | exit 0 |
| `check-system-projects.sh`/`check-project-classification.sh` nos serviços e boards | exit 0 |
| Tipos (`tsc --noEmit`, heap 12 GB) | 1ª rodada caiu com segfault do Node (exit 139, sem erro TS — instabilidade conhecida da máquina); 2ª rodada pelo PowerShell: **exit 0, 0 erros** |
| Migration aplicada e conferida | ✅ 16/10 (ver C.2) |
| Visual (Playwright, login real, `c:\tmp\pwtest\torre-financeiro.cjs`, contextos "Todas" e Alpa) | ✅ 16/10 18:30 — menu Financeiro › Análise › Fluxo Financeiro abre a Torre; 11 cartões, 10 linhas, 4 grupos; roda não rola a página; painel da transição Pagamento → Pago/Recebido com a lacuna; 11 drawers abrem; "Novo gatilho" → Alçada → Pagamento → modal de organização em "Todas" (REGRA #5) → editor com `payable.approved` (fechado sem gravar); celular vira lista de 11; Torre P2P com 8/7/3 e biblioteca sem evento do Financeiro. **Sem erro de console/JS nem HTTP 4xx/5xx.** O Chrome caiu ("Page crashed") na 1ª rodada do dia — instabilidade da máquina já registrada; as rodadas seguintes completaram. |
| Publicação | ✅ 16/10 ~22:05 UTC, com ok do usuário — `git push origin HEAD:main` → `d6520791`. Prova de tipos/suíte/build pela CI (PR de rascunho #17, fechada; e a CI de push na main em `d6520791`: Type check, Sinks de XSS, Tests, Build — success), porque nesta máquina o `tsc` e dois arquivos da Planta caíram por crash do V8. `conferir-producao.sh "Torre de Controle — Fluxo Financeiro" "Título a pagar aprovado na alçada"`: domínio serve exatamente `d652079`, os dois textos no bundle. |

## Fora de escopo (decidido, não esquecido)
- Emitir eventos a partir das Edge Functions (`reconciliation-engine` CRON, `asaas-webhook`): baixas automáticas por lá não abrem processo — a nota da aresta diz isso.
- Evento "título vencido" (precisa de CRON no banco).
- Fazer a baixa respeitar a alçada (lacuna mostrada no canvas; corrigir é outra frente).
- Mostrar o título vinculado no detalhe da instância em Processos.
