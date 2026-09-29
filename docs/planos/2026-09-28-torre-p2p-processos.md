# Torre de Controle (Fluxo P2P) × Processos — ligar as duas peças

## Pedido original

> ANALISAR POSSIVEL INTEGRACAO COM SUPRIMENTOS < Torre de Controle — Fluxo P2P
>
> [colado junto: PRD "Módulo: Processos — BPM" para o ÒPURA — tese "BPM Core como
> infraestrutura transversal, módulos ERP como consumidores"; blocos funcionais
> (modelador BPMN, motor de workflow, tarefas, formulários, aprovações, regras,
> automação, documentos, comunicação, monitoramento, analytics, auditoria,
> versionamento, simulação, process mining, IA); hierarquia Processo→Versão→
> Diagrama→Etapas / Instância→Etapas→Tarefas→Aprovações→Logs; exemplo
> "Solicitação de compra → aprovação → cotação → escolha do fornecedor → pedido →
> recebimento → financeiro → pagamento"; MVP em 5 etapas (workflow operacional →
> BPMN → automação → inteligência operacional → intelligent BPM).]
>
> Sessão: 8d15a5ed · 2026-09-28

Pedido posterior, mesma sessão, após a análise:

> abrir uma frente (nova-frente.sh processos-torre-p2p) e escrever isto como plano
> em docs/planos/2026-09-28-torre-p2p-processos.md com o seu pedido literal no
> topo — o checkout de integração está sujo com arquivo de outra frente, então
> não toco nele.

## Contexto — o que foi medido antes de planejar (2026-09-28)

**A Torre** (`components/P2PFlowBoard.tsx` + `services/p2pFlowService.ts`) tem 8 nós
com contagem real do banco, mas a **costura de entrada de cada nó é um rótulo
fixo no código** (`inboundSeam: 'auto' | 'manual' | 'gap'` + `inboundNote`), não
uma medição. Três rótulos já estão desatualizados:

| Nó | Torre diz | Código hoje |
|---|---|---|
| Nota Fiscal | `gap` — "SEM 3-way match" | `services/matchService.ts` + `ThreeWayMatchPanel` na aba Recebimento do pedido (`SupplyChainOrderDetails.tsx:1712`) |
| Contas a Pagar | `manual` — "NF-e isolada não gera título" | `nfeService` cria `internal_transaction` com `purchase_order_id` e `journal_entry_id` (`nfeService.ts:~335-350`) |
| Contas a Pagar | "título nasce do recebimento (parcial)" | `financialService.syncOrderToFinance` grava `purchase_order_id` no título — vínculo primário PO→título (`financialService.ts:36`) |

**O motor de Processos** (F0+F1+F2 do `PLANO_MODULO_PROCESSOS.md` aplicadas) —
estado real no banco remoto, consulta de 2026-09-28:

| medida | valor |
|---|---|
| `process_templates` com `trigger_type='EVENTO'` | 6 (2 por org × 3 orgs: "Aprovação de pagamento de fornecedor" ← `purchase_order.received`; "Tratamento de Divergência de Pedido" ← `purchase_order.divergence`) |
| `process_instances` no total | **1** (teste manual de 2026-07-04) |
| instâncias com `purchase_order_id` | **0** |
| pedidos em `Recebido`/`Divergência` | 2, ambos mudaram em **2026-02-19** — antes da F2 |
| pedidos com alçada (`approval_status` ≠ RASCUNHO) | 0 |

Conclusão: a costura P2P→Processos **nunca disparou em produção**; nunca teve
chance. E há um **bug latente** no gancho (`services/orderService.ts:459-461`,
bloco "2b"): a organização é resolvida por `empresa_id → companies.org_id`
porque, quando foi escrito, `purchase_orders` não tinha `organization_id`
(comentário da migration `20261223000003`). Hoje a coluna existe — a própria
Torre filtra por ela — e **diverge de `companies.org_id` nos 2 pedidos reais**.
A instância nasceria na org da empresa, não na do pedido.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-28 | O PRD BPM colado pede modelador BPMN 2.0 e Form Builder como "Crítica". Fazer agora? | Análise recomendou NÃO: continuam Fase 4 do `PLANO_MODULO_PROCESSOS.md`. Com 1 instância no banco, editor visual é ferramenta sem uso. O usuário mandou seguir com o plano tal como analisado (integração Torre × motor), sem contestar. |
| 2026-09-28 | Migrar o `OrderLifeline` (7 estados do pedido) para o motor? | NÃO — decisão já registrada no §6 do plano de Processos (acoplado a foto/estoque/e-mail; convergência é Fase 4+). Mantida. |
| 2026-09-28 | Segunda caixa de tarefas / segundo motor de alçada / segundo anexador de documento? | NÃO — regra dura do módulo: `taskService`, `approvalService`, `documentService`. "Minhas tarefas" do PRD = Central de Controle + `listMyPendingSteps`. |

## O que do PRD colado já existe (não reconstruir)

- Processo → Versão → Etapas / Instância → Etapas → Logs: schema atual
  (`template_version` snapshotado em `startInstance`; `process_audit_logs`).
- Aprovação por alçada com faixas por valor: `approvalService` (entidade
  `process_step` respeita faixas desde o commit `27069fba`).
- Monitor / gargalo / tempo médio por etapa: `fn_process_bottlenecks` + aba
  Dashboard do `ProcessosModule`.
- Documentos: ponte para `documentService` / ÒPURA Docs.
- Caixa de tarefas: `taskService` + Central de Controle.

## Plano

Um item por arquivo. Cada item diz **o que muda** e **como sei que terminou**.

### Passo 1 — Gancho correto e primeira instância real

**1.1 `services/orderService.ts`** (bloco "2b", ~linha 454-470)
- O que muda: resolver a organização como `data.organization_id ?? companies.org_id`
  (a coluna própria do pedido primeiro; a da empresa só como fallback para pedido
  antigo sem `organization_id`). Ler `organization_id` no SELECT de pré-flight e
  no refetch, se ainda não vier.
- Como sei que terminou: teste unitário em `__tests__/` que mocka um pedido cujo
  `organization_id` ≠ `companies.org_id` e afirma que `processService.triggerEvent`
  recebeu o `organization_id` **do pedido**. `npx vitest run` do arquivo passa.

**1.2 Teste da costura em produção (não é arquivo — é verificação)**
- O que muda: um pedido real, combinado com o usuário, passa para `Recebido`.
- Como sei que terminou: `select id, organization_id, purchase_order_id, status
  from process_instances where purchase_order_id is not null` devolve 1 linha, na
  org do pedido, com status `AGUARDANDO_*`; a instância aparece em Processos ›
  Todos os Processos.

### Passo 2 — Torre lê o motor em vez de rótulo fixo

**2.1 `services/p2pFlowService.ts`**
- O que muda:
  - Cada estágio ganha `eventKey?: ProcessEventKey` (a transição de entrada que o
    motor pode orquestrar). `inboundSeam` deixa de ser literal e é derivado:
    `'orquestrada'` se a org (ou qualquer org do usuário, em "Todas") tem template
    `EVENTO` ATIVO para aquele `eventKey`; senão cai no rótulo estático atual.
    Tipo `SeamStatus` ganha o valor novo.
  - Cada estágio ganha `processes?: { ativos: number; atrasados: number }` vindo
    de `process_instances` filtradas por `trigger_event_key` do template (join
    por `process_template_id`), dentro do mesmo `Promise.all` (não em série — ver
    comentário existente sobre a medição de 30/08).
  - Corrigir os 3 rótulos estáticos desatualizados: Nota Fiscal → `manual`
    ("3-way match na aba Recebimento do pedido; sem bloqueio automático");
    Contas a Pagar → `auto` ("título nasce do pedido recebido ou da NF-e
    vinculada, com `purchase_order_id`"); manter Pago/Baixado como `manual`.
- Como sei que terminou: teste unitário com supabase mockado: (a) org com
  template EVENTO para `purchase_order.received` → nó Recebimento sai
  `'orquestrada'`; (b) org sem template → sai o rótulo estático; (c) nenhum nó
  sai `'gap'` por "SEM 3-way match". `npx vitest run` passa.

**2.2 `components/P2PFlowBoard.tsx`**
- O que muda: `SEAM_CFG` ganha `orquestrada` (cor/ícone próprios, distinta de
  `auto`); o card mostra `processes.ativos`/`atrasados` quando existirem; o nó
  expandido lista as instâncias ativas daquela costura (título, etapa atual,
  atrasada?) com botão "Abrir processo" → `onChangeView('opura-processos')`. Os
  cards de saúde do topo ganham a 4ª contagem.
- Como sei que terminou: `bash scripts/check-ui-standard.sh components/P2PFlowBoard.tsx`
  sai 0; leitura completa de `docs/ui_ux_guia_unificado.md` antes de editar
  (REGRA #1) e checklist de aplicação listado no relatório; com o pedido do
  Passo 1.2 recebido, o nó Recebimento mostra 1 processo ativo e o expande.

**2.3 `types/process.ts`**
- O que muda: `ProcessStepBottleneck`/tipos auxiliares que a Torre precisar
  (instância resumida por costura). Sem tabela nova.
- Como sei que terminou: `npm run typecheck` limpo.

### Passo 3 — Novos eventos (fechar o ciclo do exemplo do PRD)

Padrão único, igual ao bloco "2b" de `orderService`: `try/catch`, `console.error`,
**nunca** derruba a operação de origem. O motor não muda; só ganha chaves.

**3.1 `types/process.ts`**
- O que muda: `ProcessEventKey` ganha `'purchase_order.approved' |
  'nfe.linked' | 'purchase_receipt.divergence' | 'internal_transaction.paid'`.
- Como sei que terminou: typecheck limpo; cada chave tem ao menos um chamador.

**3.2 `services/orderService.ts`** — `purchase_order.approved`
- O que muda: em `approveOrder` (ou onde `approvalService.approve('purchase_order', …)`
  devolve `approval_status === 'APROVADO'`), disparar o evento com
  `purchaseOrderId`, `supplierId`, `projectId`.
- Como sei que terminou: teste unitário afirma o `triggerEvent` com a chave certa
  só quando o resultado é `APROVADO` (não em nível 1 de 2).

**3.3 `services/nfeService.ts`** — `nfe.linked`
- O que muda: ao final de criar título pela NF-e e de `linkNfeToTransaction`,
  disparar com `purchaseOrderId` (quando houver) e `projectId`.
- Como sei que terminou: teste unitário; idempotência do `triggerEvent` por
  `(template, purchaseOrderId)` continua valendo — NF-e sem pedido dispara uma
  instância por chamada (documentar no código).

**3.4 `services/receiptService.ts`** — `purchase_receipt.divergence`
- O que muda: quando o recebimento é gravado com divergência/recusa, disparar
  com `purchaseOrderId`. Hoje só a mudança de **status do pedido** dispara; o
  recebimento parcial com divergência de item não muda o status.
- Como sei que terminou: teste unitário; recebimento sem divergência não dispara.

**3.5 `services/bankReconciliationService.ts` (ou onde a baixa marca
`status='CONCILIATED'` no título de DEBIT com `purchase_order_id`)** —
`internal_transaction.paid`
- O que muda: disparar com `purchaseOrderId` do título.
- Como sei que terminou: teste unitário; título sem `purchase_order_id` não dispara
  (fora do P2P).

**3.6 `supabase/migrations/aplicar_2027MMDD0000NN_processos_fase3_eventos.sql`**
- O que muda: **sem tabela nova**. Só seed idempotente por organização (mesmo
  `DO $$` loop da `20270105000000`) de templates EVENTO para as 4 chaves novas,
  guardado por `NOT EXISTS (template com esse trigger_event_key na org)`. Sem
  `CREATE POLICY`/`CREATE FUNCTION` → REGRA #7 não se aplica; se vier a ter,
  `REVOKE … FROM PUBLIC, anon` na mesma migration.
- Como sei que terminou: aplicada via `npx supabase db query --linked -f` (nunca
  `db push`); `select trigger_event_key, count(*) from process_templates group by 1`
  mostra as 6 chaves × 3 orgs; reexecutar o arquivo não duplica.

### Passo 4 — Condição por etapa (F3 mínima do plano de Processos)

**4.1 `supabase/migrations/aplicar_2027MMDD0000NN_processos_fase3_condicao_etapa.sql`**
- O que muda: `process_template_steps.condition jsonb null` e a cópia
  `process_instance_steps.condition jsonb null` (snapshot, para instância antiga
  não mudar de comportamento quando o template mudar). Formato:
  `{ "field": "amount" | "project_id" | "supplier_id", "op": "gt"|"gte"|"lt"|"lte"|"eq"|"neq"|"in", "value": … }`.
- Como sei que terminou: aplicada via `db query -f`; idempotente (`ADD COLUMN IF NOT EXISTS`).

**4.2 `utils/processCondition.ts`** (novo, puro)
- O que muda: `avaliarCondicao(condition, ctx)` → boolean. Sem supabase.
- Como sei que terminou: `__tests__/processCondition.test.ts` cobre cada `op`,
  `condition` nula (= sempre executa) e campo ausente no contexto (= executa,
  nunca pula por falta de dado — regra "nunca bloqueia" da casa).

**4.3 `services/processService.ts`**
- O que muda: `startInstance` copia `condition` do template para a etapa da
  instância; `advanceToNextStep` avalia a condição da próxima etapa com o
  contexto da instância (`amount` da etapa, `project_id`, `supplier_id`) e, se
  falsa, marca a etapa `PULADA` (novo status) com `completed_at` e log
  `STEP_SKIPPED`, e segue para a seguinte. Faixa de valor da alçada **continua**
  no `approvalService`; a condição só decide se a etapa entra no caminho.
- Como sei que terminou: teste com template de 3 etapas onde a 2ª tem
  `amount > 30000`: instância de 5.000 conclui com a 2ª `PULADA`; instância de
  50.000 para na 2ª em `AGUARDANDO_APROVACAO`.

**4.4 `components/ProcessosModule.tsx`**
- O que muda: no criador de template, campo opcional "Só executa quando…"
  (campo/operador/valor) por etapa; na timeline da instância, etapa `PULADA`
  aparece com estilo próprio e o motivo.
- Como sei que terminou: `check-ui-standard.sh` sai 0; checklist REGRA #1 no
  relatório; template criado na tela persiste `condition` e a instância a copia.

## Publicações

| Data | Commit em `main` | O que foi ao ar | Prova |
|---|---|---|---|
| 2026-09-28 | `a8390d72` (rebase sobre `aa14555a`, +15 commits de outras frentes) | Passos 1.1, 2 e 3 + `darBaixa` cobrindo `internal_transaction.paid` (função nova de `main` achada no rebase) | `conferir-producao.sh "Orquestradas" "Conduzida por Processos"` → bundle `index-B04ZSa-F.js` carimbado `a8390d7`, os dois textos presentes |
| 2026-09-28 | `83107bb0` (sobre `a8390d72`, `main` não andou) | Passo 4 — condição por etapa, prazo por etapa, UI do criador de template; migration das colunas aplicada ANTES do push | `conferir-producao.sh "Só executa quando" "Não se aplicou"` → carimbado `83107bb`, os dois textos presentes (4ª tentativa do laço de 30 s, ~2 min após o push) |
| 2026-09-29 | `ab47c12d` (3 tentativas de push — outra sessão publicava Contratos em paralelo; rebase a cada recusa) | Pendências: Fornecedor via drawer, operador "em", tabela de gargalos no padrão | `conferir-producao.sh "Escolha o fornecedor" "Gargalos por etapa"` → domínio já em `44116a5` (commit posterior de outra frente, que contém o meu), os dois textos presentes |

## Estado final (2026-09-28)

Passos 1 a 4 implementados, testados e publicados. Pendências deixadas de propósito, todas registradas acima: verificação visual do criador de template com condição; org "Altair Pereira da Rosa" sem os templates da F2; `in`/Fornecedor só no avaliador (sem UI); o roteiro `docs/spikes/torre-p2p` fica como receita para o próximo teste real de costura.

### Pendências — fechamento (2026-09-29, pedido "corrija todos")

| Pendência | Estado |
|---|---|
| Verificação visual do criador de template com condição e da etapa `PULADO` | ✅ confirmada pelo usuário em 2026-09-29 |
| Org "Altair Pereira da Rosa" sem templates da F2 | ✅ seeds `20270104000000` (F1) e `20270105000000` (F2) reexecutados no remoto — idempotentes; as 4 orgs ficaram com 6 templates EVENTO cada (24 no total) |
| `in` / Fornecedor sem UI no criador de template | ✅ frente `processos-pendencias` — Fornecedor via drawer `SupplierSelect` (§7.1.1: fornecedor nunca em `<select>`); `in` (lista) para Obra e Fornecedor |
| Tabela "Gargalos por etapa" do módulo fora do §6.6/§7 (dívida pré-existente, achada ao tocar no arquivo) | ✅ mesma frente — `px-6 py-2.5 border-r`, thead sentence case, `font-normal`, `rounded-[10px]` |
| Eventos `approved`/`nfe.linked`/`receipt.divergence`/`paid` sem instância real | ⏳ depende de operação real (alçada de pedido, NF-e vinculada, baixa de título). Não se força com dado fabricado; o roteiro de `docs/spikes/torre-p2p` é o molde se quiser provocar |

## Fora de escopo (decidido, não esquecido)

- Modelador BPMN 2.0 / gateways paralelos / subprocessos — Fase 4 de
  `PLANO_MODULO_PROCESSOS.md`.
- Form Builder genérico.
- Webhooks/API para fora.
- Migrar `OrderLifeline` para `process_instances`.
- Qualquer tabela `process_tasks` ou segunda fila de aprovação.

## Estado

- [x] Frente `processos-torre-p2p` aberta a partir de `origin/main` 76f9b5d2 (2026-09-28)
- [x] Este plano escrito
- [x] 1.1 gancho lê `purchase_orders.organization_id` (fallback `companies.org_id` só para pedido antigo) — teste `__tests__/processosGanchoOrgDoPedido.test.ts` (4 casos; falha no código antigo, passa no novo); `tsc` limpo; `orgContextGuard` 14/14
- [x] 1.2 primeira instância real nascida de pedido — **FEITO em 2026-09-28 21:18** pelo roteiro `docs/spikes/torre-p2p/__tests__/receber-pedido-real.test.ts`, executado pelo usuário com o próprio login (a 1ª tentativa falhou por e-mail padrão errado no roteiro — corrigido para `PW_EMAIL` obrigatório; a 2ª por senha divergente). Resultado: `PC-013-013-0002` → `Recebido`; instância `2c8d805b-7035-46f6-9b2d-36eefda9c6c6` do template "Aprovação de pagamento de fornecedor", `AGUARDANDO_RESPONSAVEL`, na org do pedido (Alpa). Sem título financeiro (`syncOrderToFinance` pulou: pedido sem NF-e) e sem e-mail. É a **primeira instância nascida de gatilho em produção**, 86 dias depois da F2. Histórico da preparação: pedido escolhido `PC-013-013-0002` (Rascunho desde 01/06, obra Galeria, fornecedor Fordinho sem e-mail, 5 itens de limpeza; org do pedido = org da empresa = Alpa, então a divergência do 1.1 não se manifesta aqui — o que se prova é a costura disparar). Caminho pela tela não serve para o comprador sozinho: `handleUpdateStatus` só oferece Enviado/Confirmado/Cancelado, e "Confirmar recebimento" exige `Entregue` (etapas do fornecedor). O caminho proposto foi um roteiro vitest fora do glob da suíte (`docs/spikes/torre-p2p/__tests__/`, auto-pulado sem `PW_SENHA`, rodado por `npx vitest run --dir docs/spikes/torre-p2p`) que importa o `orderService` da frente e chama `updateOrder(id, {status:'Recebido'})` com o login do usuário — **a criação desse arquivo foi bloqueada pelo classificador do modo automático (escrita em produção); não criado.** Decisão pendente do usuário: liberar a criação do roteiro, fazer o recebimento pela tela (preview da frente em `http://127.0.0.1:4173`), ou adiar o 1.2. Efeito colateral do teste, em qualquer caminho: título em Contas a Pagar via `syncOrderToFinance`
- [x] 2.1 `p2pFlowService` costura derivada + rótulos corrigidos — `lerMotor` (templates ATIVOS por evento + instâncias não terminais + etapa atual em consulta separada, por causa das 2 FKs) dentro do mesmo `Promise.all`; `STAGE_EVENT_KEYS` (o evento NASCE no nó, a entrada do nó SEGUINTE vira `orquestrada`); `getStageProcesses`; teste `__tests__/p2pFlowServiceCosturaOrquestrada.test.ts` (5 casos)
- [x] 2.2 `P2PFlowBoard` mostra processos por nó — `SEAM_CFG`/`SEAM_KPI` com `orquestrada` (4 KPIs, grade `md:2 lg:4`), card do nó com "N processos · M atrasados", drawer do nó com bloco "Processos em andamento" + "Abrir Processos", legenda de atenção só para `manual`/`gap`; `check-ui-standard.sh` limpo; teste de drawer existente continua passando
- [x] 2.3 tipos — `P2PProcessSummary`, `P2PProcessItem`, `STAGE_EVENT_KEYS` em `p2pFlowService.ts`; `INSTANCE_STATUS_LABEL` movido para `types/process.ts` (vocabulário único, `ProcessosModule` importa). Ao tocar em `ProcessosModule` a REGRA #1 acusou 2 violações pré-existentes (pílula §8 na `StatusBadge`, `font-bold` §7 em `<td>`) — corrigidas
- [ ] 2.x **pendente de verificação visual** — a Torre não foi aberta no navegador; a costura `orquestrada` só aparece quando o Passo 1.2 gerar a primeira instância real
- [x] 3.1–3.5 quatro eventos novos com chamador (2026-09-28) — mudança de desenho em relação ao plano: em vez de cada origem ler o pedido, um **resolvedor único** em `processService` (`triggerPurchaseOrderEvent` — lê o pedido, aplica a regra de org do 1.1, chama `triggerEvent`; `triggerForTransaction` — chega ao pedido pelo título, só DEBIT com `purchase_order_id`), ambos best-effort. Chamadores: `orderService.approveOrder` (só quando `approval_status` devolvido é APROVADO); `nfeService.approveAndLink`/`linkExistingTransaction` (o pedido vem do parâmetro ou do título; `linkExistingTransaction` passou a selecionar `purchase_order_id` do título); `receiptService.createReceipt` (Parcial ou item com problema, **e não** quando o status é 'Divergência' — esse é do `updateOrder`, senão nasciam dois processos); `payableService.updateStatus('PAGO')` e `bankReconciliationService.createMatch` (após a RPC, fora da transação). `STAGE_EVENT_KEYS` da Torre: pedido/recebimento/fiscal/financeiro. Teste `__tests__/processosEventosP2P.test.ts` (11 casos); `tsc` limpo
- [x] 3.6 seed dos templates — `supabase/migrations/aplicar_20270928000001_processos_fase3_eventos.sql` escrito (4 templates por org, idempotente por (org, `trigger_event_key`), sem tabela/policy/função; `segurancaMigrations.test.ts` passa). **APLICADA no remoto em 2026-09-28** (`db query -f`, autorizado pelo usuário): 4 chaves × 4 orgs = 16 templates, 48 etapas; reexecução não duplicou (idempotência provada). Achado: as chaves da F2 (`received`/`divergence`) existem em só 3 orgs — a 4ª organização nasceu depois do seed de julho e não tem o template piloto
- [x] 4.1 migration `aplicar_20270928000002_processos_fase3_condicao_etapa.sql` — `condition jsonb` em `process_template_steps` e `process_instance_steps` (ADD COLUMN IF NOT EXISTS, sem policy/função). **APLICADA no remoto em 2026-09-28** (`db query -f`, autorizada pelo usuário; conferido em `information_schema.columns`: as duas colunas `jsonb` existem). Pré-requisito da publicação do código deste passo cumprido — `startInstance` grava a coluna
- [x] 4.2 `utils/processCondition.ts` — `avaliarCondicao` (puro; nula/campo ausente/valor não comparável → executa), `descreverCondicao`, `validarCondicao`, tabelas de rótulo/operadores por campo; `__tests__/processCondition.test.ts` (21 casos)
- [x] 4.3 `services/processService.ts` — `startInstance` cria todas as etapas `PENDENTE` com `condition` copiada (snapshot) e delega a `advanceToNextStep`; este avalia a condição de cada pendente em ordem com `contextoDaInstancia` (obra/fornecedor da instância; valor = soma dos itens do pedido de origem, mesma régua da alçada; lido só se alguma pendente tem condição), pula com `PULADO` + log `STEP_SKIPPED`. **Bônus:** `due_at` passa a nascer quando a etapa começa (fecha o achado do 1.2). `__tests__/processServiceCondicaoEtapa.test.ts` (6 casos, banco em memória): 5 mil pula o diretor / 50 mil não; 1ª etapa condicionada falsa → nasce na 2ª; snapshot; prazo só na etapa em andamento; contexto lazy
- [x] 4.4 `components/ProcessosModule.tsx` — criador de template: botão por etapa abre "Só executa quando" (campo Valor/Obra · operador · valor ou seletor de obra do `useStore`; `in`/Fornecedor ficam só no avaliador por enquanto); erro de validação aparece em texto e bloqueia o salvar; timeline mostra etapa `PULADO` tracejada/riscada com "Não se aplicou: <condição>" e a condição nas demais. Inputs do modal migrados para §16/§21 (`rounded-[6px]`, rótulo `text-xs font-semibold text-slate-500`); `check-ui-standard.sh` limpo; **não verificado no navegador**

## Verificação de ponta a ponta

1. Pedido novo em obra X, valor > faixa da alçada → submeter à aprovação →
   aprovar → nasce instância `purchase_order.approved` na org **do pedido**.
2. Marcar `Recebido` → nasce instância `purchase_order.received`; Torre › nó
   Recebimento mostra costura `orquestrada`, 1 processo ativo, expande e abre.
3. Vincular NF-e ao pedido → título em Contas a Pagar com `purchase_order_id`;
   nasce instância `nfe.linked`; Torre › nó Nota Fiscal **não** é mais `gap`.
4. Baixar o título → instância `internal_transaction.paid`.
5. Repetir com pedido de valor baixo num template com etapa condicionada a
   `amount > 30000` → etapa aparece `PULADA`.
6. `npm run ci` limpo; `npx vitest run __tests__/orgContextGuard.test.ts` limpo;
   `bash scripts/conferir-producao.sh "Fluxo Integrado (P2P)"` após o push.
