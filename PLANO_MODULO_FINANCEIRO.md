# PRD / Plano de Implementação — Módulo Financeiro (ÒPURA Financeiro)

> Núcleo financeiro da plataforma. Unifica AP, AR, fluxo de caixa, aprovações,
> cobrança e inteligência financeira sobre a base já existente.
> Ancorado no schema real (verificado 2026-06-18).

---

## 1. Por que agora

O financeiro **já existe na prática**, mas espalhado: boletos de fornecedor, conciliação
bancária, DRE/Balancete, categorias e centros de custo estão prontos e bons. O que falta
não é refazer — é **unificar e surfaçar**. Hoje recebíveis vivem implícitos em três lugares
desconectados (`project.financialInfo.installments`, deals do comercial, `contract_measurements`),
não há tela de Contas a Receber, não há dashboard executivo consolidado, nem aprovação por
faixa de valor, nem cobrança automatizada.

Este plano transforma os dados já estruturados em uma experiência coesa de **AP / AR / Fluxo de
Caixa / Inteligência**, sem jogar fora o que está sólido.

---

## 2. Realidade do schema

### Existe e será reusado
- **Ledger central** — `internal_transactions` (`source_system`, `direction` CREDIT/DEBIT,
  `status` PENDING/CONCILIATED/CANCELLED, `project_id`, `cost_center_id`). É a fonte de verdade.
- **Conciliação** — `bank_transactions`, `reconciliation_matches/suggestions/rules`, parser OFX/CSV/CNAB
  (`bankReconciliationService`). Completo.
- **Boletos (AP)** — `boletos` + `boletos_auditoria`, OCR/FEBRABAN, workflow 6 status (`boletoService`).
- **Contas a Pagar** — `invoices` (pending/approved/rejected/paid/overdue) + `ContasPagarManager`.
- **Categorias / DRE** — `financial_categories` (`dre_group`, `nature`, `sort_order`); RPCs
  `fn_dre`, `fn_dre_summary`, `fn_dre_projects`, `fn_cash_flow`, `fn_balancete`.
- **Centros de custo / contas** — `cost_centers`, `payment_accounts`, `bank_accounts`.
- **Integrações de entrada** — `contractService` (medições + parcelado), `payrollService` (folha),
  `orderService`/`FinancialOrderDetails` (compras), `commercialFinanceService` (deals).

### NÃO existe (criado por este plano)
- `receivables` (ou enriquecimento de `internal_transactions` com campos de negócio).
- `payables` unificado linkando invoice + boleto + transação.
- `approval_levels` / motor de aprovação por faixa.
- `dunning_rules` / `dunning_events` (cobrança automatizada).
- Telas: Dashboard Executivo, Contas a Receber, Calendário Financeiro, Régua de Cobrança.

---

## 3. Decisão de arquitetura central

**`internal_transactions` permanece o ledger, mas ganha uma camada de "título de negócio".**

Hoje a tabela mistura status de conciliação bancária (CONCILIATED) com status de negócio
(aprovado/pago/vencido). Para o PRD funcionar sem reescrever a conciliação, adicionamos campos
de negócio à própria `internal_transactions` (caminho de menor atrito) **ou** projetamos uma
view `vw_titulos`. Decisão recomendada: **enriquecer `internal_transactions`** com:

```
business_status   text     -- PREVISTO|AGUARDANDO_APROVACAO|APROVADO|PROGRAMADO|PAGO|PARCIAL|VENCIDO|CANCELADO|BLOQUEADO
due_date          date     -- vencimento (negócio), separado do status de conciliação
document_number   text     -- nº NF / documento
party_type        text     -- SUPPLIER | CLIENT
party_id          uuid     -- supplier_id ou client_id
invoice_id        uuid     -- link opcional p/ invoices
boleto_id         uuid     -- link opcional p/ boletos
```

Assim AP e AR são a mesma tabela, separadas por `direction` (DEBIT = pagar, CREDIT = receber),
e os relatórios/dashboards existentes continuam funcionando.

```
                 direction=DEBIT  → Contas a Pagar   ┐
internal_         direction=CREDIT → Contas a Receber ┤→ Dashboard Executivo
transactions  ──> business_status + due_date          ┤→ Calendário Financeiro
(ledger)          party/invoice/boleto links          ┤→ Régua de Cobrança (só AR)
                 status conciliação (intacto)         ┘→ DRE/Balancete (já existem)
```

---

## 4. Fases

> Ordem definida: **começar pela Fase 1 (Dashboard Executivo)** — maior valor percebido,
> menor esforço, a maioria dos dados já existe.

### Fase 1 — Dashboard Executivo Financeiro  *(2 sprints)*

**Objetivo:** uma tela única consolidando a saúde financeira da empresa. Quase tudo já existe
como dado; falta a composição.

**Migrations:**
- Nenhuma estrutural. Criar RPC `fn_financial_overview(org_id, project_id?, period)` que agrega
  saldo atual (`payment_accounts`/conciliação), a receber/recebido, a pagar/pago, em atraso,
  top obras por consumo de caixa, top fornecedores por pagamento. Reusa `internal_transactions`.

**Services:** `financialOverviewService.ts` → `getOverview()`, `getTopProjects()`, `getTopSuppliers()`.

**Telas:** `FinancialDashboard.tsx` (cards: Caixa atual/projetado, Receitas a receber/recebido,
Despesas a pagar/pago/atraso, Inadimplência; widgets: obras maior consumo/faturamento/margem,
fornecedores maiores pagamentos). Recharts, padrão do `CashFlowDashboard`.

**Critérios de aceite:**
- Saldo atual bate com soma dos `payment_accounts`.
- Filtro por obra e por período (mês/trimestre/ano).
- A receber/a pagar batem com `internal_transactions` por `direction`.

---

### Fase 2 — Contas a Receber unificado  *(3 sprints)*  ← maior gap funcional

**Objetivo:** tela de AR equivalente ao `ContasPagarManager`, com ciclo
Previsto → Emitido → Enviado → Recebido / Parcial / Vencido / Renegociado.

**Migrations:**
- Enriquecer `internal_transactions` (campos da Seção 3).
- Backfill: projetar recebíveis hoje implícitos (installments de projeto, deals comerciais,
  medições de contrato) como linhas CREDIT com `business_status` e `due_date`.

**Services:** `receivableService.ts` → CRUD, mudança de status, vínculo NF/boleto/recebimento.
Adaptar `commercialFinanceService` e `contractService` para gravar os novos campos.

**Telas:** `ContasReceberManager.tsx` (grid + filtros + drill-down cliente/obra/medição),
modal de baixa/recebimento, vínculo a boleto emitido.

**Critérios de aceite:**
- Toda parcela de deal/contrato/medição aparece como recebível com status correto.
- Baixa de recebimento gera/atualiza `internal_transactions` e fica disponível p/ conciliação.
- Inadimplência por faixa (a vencer / 1–30 / 31–60 / 61–90 / 90+).

---

### Fase 3 — Fluxo de Aprovação por faixas  *(2 sprints)*

**Objetivo:** aprovação configurável N1/N2/N3 por valor (ex.: até 5k Gestor; até 50k +Financeiro;
acima Diretoria).

**Reuso:** generalizar o motor de aprovação multinível que já existe em Contratos
(`ContractApprovalWorkflow`) em vez de criar do zero.

**Migrations:** `approval_levels` (faixa_min, faixa_max, approvers[], ordem) +
`approval_requests`/`approval_steps` (ou tabela genérica reusada de contratos).

**Services:** `approvalService.ts` → resolve nível pela faixa, encadeia aprovadores, notifica.
Substitui o `is_financial_approved` binário de `purchase_orders`.

**Telas:** config de faixas em `FinancialRegistryManager`; fila "Aguardando aprovação"
em AP; trilha de aprovação no título.

**Critérios de aceite:** título acima da faixa não pode ir a PROGRAMADO sem todas as assinaturas;
log de aprovações auditável.

---

### Fase 4 — Programação / Calendário Financeiro  *(2 sprints)*

**Objetivo:** calendário global da empresa (não por projeto) com AP + AR + saldo projetado,
visões diário/semanal/mensal/anual, e horizontes de fluxo 7/15/30/60/90/180/365 dias.

**Migrations:** estender `fn_cash_flow` com horizontes parametrizáveis; nenhuma tabela nova.

**Services:** `financialCalendarService.ts` → agenda consolidada por data.

**Telas:** `FinancialCalendar.tsx` (calendário) + projeção de saldo. Reaproveita lógica do
`FinancialSchedule`, mas em escopo de empresa.

**Critérios de aceite:** cada dia mostra entradas/saídas previstas e saldo acumulado projetado;
clicar no dia abre os títulos.

---

### Fase 5 — Cobrança automatizada (régua)  *(3 sprints)*

**Objetivo:** régua pré-vencimento (15/7/3/1 dia) e pós (1/7/15/30) por e-mail → depois WhatsApp/SMS.

**Migrations:** `dunning_rules` (gatilhos, canal, template) + `dunning_events` (log de envios).

**Services:** `dunningService.ts` + cron diário (padrão dos crons já existentes no projeto).
**E-mail primeiro** (menor atrito); WhatsApp via integração externa numa etapa seguinte.

**Telas:** config da régua + histórico de cobranças por título/cliente.

**Critérios de aceite:** título vencido dispara evento no dia certo, uma vez; opt-out por cliente;
parada automática ao receber.

**Depende de:** Fase 2 (AR) para saber o que cobrar.

---

### Fase 6 — Emissão de boletos para clientes  *(4 sprints)*

**Objetivo:** emitir boleto/cobrança ao cliente (registro bancário, baixa automática, 2ª via,
renegociação). Distinto do `BoletoManager` atual, que **captura** boletos de fornecedor (AP).

**Migrations:** `client_charges` (ou reuso de `boletos` com `party_type=CLIENT`) + webhook de baixa.

**Services:** integração com provedor (Asaas / PJBank / Celcoin ou API bancária direta).
Webhook → baixa automática em `internal_transactions` → conciliação.

**Critérios de aceite:** boleto emitido com linha digitável válida; pagamento via webhook baixa
o recebível e dispensa cobrança.

**Open Finance:** deferido para depois desta fase — OFX/CNAB já cobre a maioria dos casos hoje.

---

### Fase 7 — Inteligência Financeira (Tier S+)  *(contínuo)*

**Objetivo:** motor analítico correlacionando orçamento × aquisições × contratos × medições ×
pagamentos × recebimentos × avanço físico × fluxo de caixa. Responde:
- Quais obras terão falta de caixa em 90 dias?
- Quais fornecedores são maior risco financeiro?
- Quais contratos consomem acima do previsto?
- Desvio entre avanço físico e financeiro por obra?
- Margem projetada por empreendimento?

**Base:** os dados já convergem em `internal_transactions` + DRE por obra + WIP. Começar com
regras determinísticas (alertas) antes de IA narrativa.

---

## 5. Resumo de esforço e dependências

| Fase | Escopo | Esforço | Depende de |
|---|---|---|---|
| 1 | Dashboard Executivo | 2 sprints | — (quick win) |
| 2 | Contas a Receber unificado | 3 sprints | enriquecer ledger |
| 3 | Aprovação por faixas | 2 sprints | reuso motor de Contratos |
| 4 | Calendário Financeiro | 2 sprints | Fase 1, 2 |
| 5 | Cobrança automatizada | 3 sprints | Fase 2 |
| 6 | Emissão de boletos a cliente | 4 sprints | Fase 2; provedor externo |
| 7 | Inteligência Financeira | contínuo | Fases 1–6 |

**Dívida técnica a resolver junto:** hoje `invoices`, `boletos` e `internal_transactions` são
três entidades desconectadas. A Fase 2 deve introduzir os links (`invoice_id`, `boleto_id`,
`payable_id`) para que pedido → NF → boleto → pagamento seja rastreável de ponta a ponta.

## 6. Classificação estratégica (do PRD)
- **Tier A** — Fases 1–3 (financeiro operacional completo).
- **Tier A+** — + integrações já existentes (suprimentos, contratos, obras).
- **Tier S** — + Fases 4–6 orientadas à construção civil.
- **Tier S+** — + Fase 7 (inteligência e previsão econômica).
