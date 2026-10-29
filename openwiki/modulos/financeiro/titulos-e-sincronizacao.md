---
type: módulo
title: "Financeiro: títulos, lançamentos e sincronização com os módulos"
description: O centro do financeiro é a tabela internal_transactions — todo título a pagar ou a receber, venha de onde vier, é uma linha nela com source_system e reference_id. Esta página explica o modelo, as views vw_payables/vw_receivables, os status de negócio, quem produz títulos (obra, contrato, folha, boleto, NF-e, comercial), alçada de aprovação, fechamento de período e o que conta como "pago".
tags: [finance, internal-transactions, payables, receivables, sync, period-lock, approval]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-7678189c8daef1ccd842ad01
    resource: repo://services/contractService.ts
  - id: openwiki-source-2730e05d2fb89cc1346086a2
    resource: repo://services/financialApprovalService.ts
  - id: openwiki-source-127d2577d79fa39a6a23709b
    resource: repo://services/financialCloseService.ts
  - id: openwiki-source-6e96284336f8745ed0bcde22
    resource: repo://services/financialSyncService.ts
  - id: openwiki-source-124b3712d3b6e2e675d233f4
    resource: repo://services/payableService.ts
  - id: openwiki-source-d2dcddc4b48cc06e892c420f
    resource: repo://services/receivableService.ts
  - id: openwiki-source-4af12e5a26c37f2671991b3e
    resource: repo://supabase/migrations/20261220000004_period_lock_triggers.sql
  - id: openwiki-source-8cef1fb550c5d0b7cfa61cf0
    resource: repo://types/financial.ts
  - id: openwiki-source-5fdd019f98b0bdea90459bab
    resource: repo://utils/situacaoDaCota.ts
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Financeiro: títulos, lançamentos e sincronização com os módulos

## Uma tabela para todos os títulos

**`internal_transactions`** é a tabela central: cada título a pagar (DEBIT) ou a
receber (CREDIT) é uma linha nela. Os módulos não têm "contas a pagar" próprias;
eles **produzem linhas** nesta tabela. Campos que importam em toda leitura:

| Campo | Significado |
|---|---|
| `organization_id` | dono do título (multi-tenancy) |
| `source_system` | **quem gerou**: `PROJECT`, `COMMERCIAL`, `CONTRACT_AVISTA`, `CONTRACT_PARCELADO`, `CONTRACT_RECURRING`, `CONTRACT_MEASUREMENT`, `LABOR`, `PROLABORE`, `DIVIDENDOS`, `BOLETO`, `NFE`, `DARF`, `MANUAL`… |
| `reference_id` | id do objeto de origem (parcela, ciclo, boleto, `brk-{deal}` da comissão…) |
| `project_id` | dimensão **obra** — nunca um projeto de sistema |
| `transaction_date`, `due_date` | competência e vencimento (`due_date` decide o VENCIDO) |
| `status` | estado de conciliação (`CONCILIATED` = ligado ao extrato) |
| `business_status` | estado de negócio (abaixo) |

O par `source_system` + `reference_id` é o que torna a sincronização
**idempotente**: o produtor reescreve o título do seu objeto em vez de criar
outro. Também é por ele que telas resolvem "documento de origem" de um
lançamento (um resolvedor por `source_system`).

### Views de leitura

- `vw_payables` (Contas a Pagar) e `vw_receivables` (Contas a Receber) juntam
  título, contraparte, obra (`LEFT JOIN projects`) e calculam
  **`effective_status`**, que acrescenta `VENCIDO` (e `RETIDO` para tributo que o
  cliente recolhe) ao status gravado.
- `payableService.list` / `receivableService.list` leem dessas views;
  `fn_inadimplencia` dá a visão de atraso.

### Status de negócio

| A pagar | A receber |
|---|---|
| `PREVISTO` → `APROVADO` → `PAGO` / `PARCIAL` / `RENEGOCIADO` / `CANCELADO` | `PREVISTO` → `EMITIDO` → `ENVIADO` → `RECEBIDO` / `PARCIAL` / `RENEGOCIADO` / `CANCELADO` |

**"Pago" tem uma regra única** — `tituloEstaPago(status, businessStatus)` em
`utils/situacaoDaCota.ts`: conciliado **ou** `business_status` em
`RECEBIDO`/`PAGO`. A mesma função serve o Portal do Cliente e o Portal do
Síndico.

## Quem produz títulos

| Produtor | Caminho | `source_system` |
|---|---|---|
| Obra (parcelas e lançamentos do projeto) | `financialSyncService.syncFinancialData` a partir de `settings.financialInfo` | `PROJECT` |
| Contrato de venda/fornecimento | `contractService.syncContractToFinance` (à vista, parcelado pelo `payment_schedule`, recorrente, medição) | `CONTRACT_*` |
| Comercial (venda/locação) | contrato da negociação; cofre "Gestão Comercial" | `COMMERCIAL` / `CONTRACT_*` |
| Comissão de corretor | gatilho sobre a negociação (`brk-{deal}`) | `COMMERCIAL` |
| Folha e encargos | sincronização da folha (encargos viram títulos de tributo próprios) | `LABOR`, `PROLABORE`, `DARF` |
| Boleto aprovado | `boletoService.aprovarECriarInvoice` | `BOLETO` |
| NF-e | módulo fiscal | `NFE` |
| Pagamento avulso | `payableService.createAvulso` (com anexo no bucket `financeiro-anexos`) | `MANUAL` |

Páginas dos produtores:
[Boletos e Asaas](./boletos-asaas-e-cobranca.md),
[Comercial](../comercial/empreendimentos-vendas-e-locacoes.md),
[Folha](../rh/folha-de-pagamento.md),
[Suprimentos e contratos](../suprimentos/compras-e-contratos.md),
[NF-e](../fiscal/ingestao-nfe.md).

### `financialSyncService.syncFinancialData`

Materializa parcelas e transações do `settings.financialInfo` de um projeto em
`internal_transactions`. Duas decisões explícitas no código:

- **Projeto de sistema nunca carimba `project_id`.** Antes, o id do cofre
  "Gestão Comercial" ia para a coluna e toda parcela de Vendas/Locações
  aparecia em Contas a Receber com Obra = "Gestão Comercial". Ver
  [Projetos e classificação](../../conceitos/classificacao-de-projetos.md).
- **O cofre comercial não materializa mais parcelas.** A Conciliação varria
  todos os projetos e chamava esta função direto, reinserindo em Contas a
  Receber o que o usuário tinha acabado de tirar. Parcela comercial agora só
  nasce do contrato. Obra de verdade continua materializando normalmente.

Além disso, o título recebe `due_date` (sem ele a parcela nunca virava VENCIDO)
e o cofre comercial usa `source_system = 'COMMERCIAL'`, isento da trava de
período fechado por decisão de produto.

### Contratos

`syncContractToFinance` despacha por tipo (à vista, parcelado, recorrente). Ele
**recusa contrato de locação original**: a locação é faturada pela série gerada
na negociação, e lançar pelo contrato criaria uma segunda série do mesmo aluguel.
Renovação (com `parent_contract_id`) fatura pelo contrato. Vencimento de parcela
editado à mão é marcado e preservado pela sincronização.

## Baixa, alçada e efeitos

- `payableService.darBaixa` / `updateStatus('PAGO')` dão baixa manual. A baixa
  **não passa por cima da alçada pendente**.
- Títulos em pagamento pela Asaas (`STATUS_ASAAS_TRAVA_TITULO`: `APPROVED`,
  `PENDING`, `SCHEDULED`, `DONE`) ficam travados para edição.
- Toda baixa — manual, pela conciliação, pela Asaas — emite o evento que avança o
  fluxo **P2P** (pedido de compra) e o **Motor de Processos**. Cada produtor de
  baixa precisa dessa "costura"; quando uma baixa nova nasceu sem ela, ficou
  invisível para Processos.
- A baixa propaga ao boleto pelo gatilho `fn_sync_boleto_baixa`.

**Alçada de aprovação** (`services/financialApprovalService.ts`,
`FinancialApprovalModule`): faixas por organização em
`financial_approval_config`; regras puras em `utils/filaAprovacao.ts` e
`utils/situacaoAprovacaoTitulo.ts`. Faixa de alçada é operação de organização
específica — o modal não oferece "Todas".

## Fechamento de período

`services/financialCloseService.ts` + `FinancialClosePanel`:

- `fn_financial_close_checklist` lista as pendências do mês (conciliação,
  classificação, tarifas);
- meses fechados ficam em `financial_period_locks`; `fn_period_is_closed`
  responde se uma data está num mês fechado;
- **trava no banco** (`20261220000004_period_lock_triggers.sql`): gatilhos em
  `internal_transactions` e `bank_transactions` recusam inserir, alterar ou
  **mover para/de** um mês fechado ("reabra o mês no Fechamento Mensal"). Títulos
  `COMMERCIAL` são isentos.

## Plano de contas e centro de custo

`services/costCenterService.ts`, `PlanoDeContasModule`, `CostCenterModule`,
categorias em `FinancialCategoriesManager` (38 categorias padrão são seeds
globais com `organization_id NULL`). A escolha é sempre pelos drawers
`PlanoContasSelect` / `CostCenterSelect` (ver
[Padrões de interface](../../interface/padroes-de-ui.md)).
`services/financialCategoryResolver.ts` sugere categoria; `costCenterClosingService`
fecha centro de custo.

## Relatórios e painéis

DRE (`DREReport`, `DRESPEReport`), balancete, fluxo de caixa
(`CashFlowDashboard`, `FinancialSchedule`), calendário financeiro, painel
financeiro (`FinancialDashboard`, `lib/dashboardFinanceiro.ts`), Inteligência
Financeira (`FinancialIntelligence`, relatório agendado por
`financial-report-notifier`) e a "Torre de controle" do fluxo financeiro
(`FinanceiroFlowBoard`, `services/financeiroFlowService.ts`). Contas de
pagamento (bancos e Asaas) em `payment_accounts`.

`utils/financialMath.ts` reúne a matemática pura (PMT, VPL, TIR, XIRR, ROI,
arredondamento) usada por simuladores e análises.

## Regras práticas

1. Para criar título de um módulo novo, **produza linha em
   `internal_transactions`** com `source_system` próprio e `reference_id`
   estável — não crie tabela de contas paralela.
2. Gravando `project_id` a partir de um objeto de projeto, corte projeto de
   sistema antes.
3. Toda nova forma de baixa precisa da costura de eventos (P2P e Processos).
4. Leia pelas views quando precisar de `effective_status`.
