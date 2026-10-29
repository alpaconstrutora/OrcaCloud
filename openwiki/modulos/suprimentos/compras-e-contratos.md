---
type: "Referência"
title: "Suprimentos: solicitações, cotações, pedidos e contratos"
openwiki_generated: true
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-47bb32ebfff46afce0927f6b
    resource: repo://services/almoxarifadoService.ts
  - id: openwiki-source-7678189c8daef1ccd842ad01
    resource: repo://services/contractService.ts
  - id: openwiki-source-bd6165c03f255f4e588381b6
    resource: repo://services/orderNumberingService.ts
  - id: openwiki-source-945fd6d080bf747907f0865d
    resource: repo://services/orderService.ts
  - id: openwiki-source-8265e8078cb66e657bdae4df
    resource: repo://services/p2pFlowService.ts
  - id: openwiki-source-0e8cb8ad6c5748bc3e5612fb
    resource: repo://services/purchaseRequestService.ts
  - id: openwiki-source-c2cb27f1a0e4493b13405067
    resource: repo://services/quotationService.ts
  - id: openwiki-source-24ad9024f7bcef9050d3b40d
    resource: repo://types/purchaseRequest.ts
  - id: openwiki-source-11f2a936239fe9dedd397747
    resource: repo://utils/solicitacaoCompra.ts
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---


# Suprimentos: solicitações, cotações, pedidos e contratos

Telas no grupo **Suprimentos** do menu (`supplies-*` no `AppRouter`, trava pela
permissão `canViewOrders`): Solicitações de compra
(`components/suprimentos/`), Cotações (`SupplyChainQuotation*`), Pedidos
(`SupplyChainOrder*`), Recebimentos (`SupplyChainReceiptManager`), Contratos
(`SupplyChainContractList`, `ContractDetailView` e modais `Contract*`), mais
`ProcurementModule`, Plano de Aquisições e Almoxarifado.

> **Suprimentos nunca tem cliente.** Em contrato e documento gerado por modelo, o
> credor é sempre o fornecedor.

## O fluxo P2P

```
Suprimentos            Estoque & Fiscal                 Financeiro
solicitação → cotação → pedido → recebimento → estoque → fiscal → título → pagamento
```

`services/p2pFlowService.ts` modela esses nós em três grupos
(`P2P_GROUPS`: suprimentos, estoque & fiscal, financeiro) para a **Torre de
controle** (`P2PFlowBoard`). Cada nó emite eventos do **Motor de Processos**
(`services/processMotor.ts`, tipos em `types/processFlow.ts`): o processo que
nasce no nó N conduz a transição para N+1. Por isso **toda forma de dar baixa**
(manual, conciliação, Asaas) precisa emitir o evento — ver
[Títulos e sincronização](../financeiro/titulos-e-sincronizacao.md).

### 1. Solicitação de compra

`services/purchaseRequestService.ts` (única camada que fala com
`purchase_requests` / `purchase_request_items`). Origem: `orcamento`, `avulso`,
`almoxarifado` ou `plano`; prioridade `normal`/`urgente`.

- **Não há coluna `status`.** O status exibido é **derivado** por
  `statusDaSolicitacao` (`utils/solicitacaoCompra.ts`), com precedência:
  cancelada > rascunho > em aprovação > reprovada > aprovada > em atendimento >
  atendida. "Atendida" = todo item **ativo** tem cotação ou pedido.
- Toda regra de "pode / não pode" mora em `utils/solicitacaoCompra.ts` **com o
  motivo em texto** (botão desabilitado sempre diz por quê). A trava definitiva
  é do banco: `fn_purchase_requests_guard` / `_items_guard`.

### 2. Cotação

`services/quotationService.ts`: pedido de cotação a fornecedores
(`createRequest`), respostas (`submitResponse`, inclusive pelo Portal do
Fornecedor via `listRequestsForSupplier`), contraproposta
(`sendCounterProposal`/`respondToCounterProposal`) e escolha do vencedor
(`selectWinner`). O **Mapa de Cotação** (`SupplyChainQuotationComparison`)
compara as respostas; a seleção da cotação aberta sobrevive enquanto a view é de
Suprimentos (ver [Estado e dados](../../arquitetura/estado-e-dados.md)).

### 3. Pedido de compra

`services/orderService.ts`: `createOrder`, `submitForApproval` →
`approveOrder`/`rejectOrder`, `updateAsSupplier` (o fornecedor mexe no que lhe
cabe), `duplicateOrder`, `confirmOrderReceipt`. A negociação de condições entre
comprador e fornecedor é `services/negotiationService.ts` (propostas
`pending`/`accepted`/`countered`/`rejected`). Parcelas do pedido e financeiro
do comprador em `pedidoCompradorService` / `pedidoFinanceiroService`.

### 4. Recebimento e 3-way match

`confirmOrderReceipt` grava `purchase_receipts` + `purchase_receipt_items` e as
**divergências** com fluxo de tratamento (`discrepancyService`,
`divergenceService`). `services/matchService.ts` faz o **3-way match** pedido ×
recebimento × nota (`ThreeWayMatchPanel`).

### 5. Nota e título

A NF-e do fornecedor se liga ao pedido; se o pedido já tem título, a nota se
vincula a ele em vez de gerar outro (ver [NF-e](../fiscal/ingestao-nfe.md)). O
título aparece em Contas a Pagar e no Portal do Fornecedor ("parcelas do
pedido").

## Numeração de documentos

`services/documentNumbering/` é um **motor genérico** de numeração por slots,
configurável por organização em Configurações do Sistema › Nomenclatura
(persistido em `document_numbering_settings`, não mais em `localStorage`). Os
adaptadores de domínio (`orderNumberingService`, `quotationNumberingService`,
`purchaseRequestNumberingService`, contratos, propostas…) fazem o que o motor não
adivinha — por exemplo descobrir a **organização a partir da obra**. Existem
serviços `*RegenService` para regerar números. A nomenclatura **nunca bloqueia**
o salvamento.

## Contratos com fornecedores

`services/contractService.ts` (~3.400 linhas) cobre o ciclo inteiro:

| Área | Operações |
|---|---|
| Ciclo de vida | `createContract`, `submitForApproval`/`approveContract`/`rejectContract`, `issueStartOrder`, condições precedentes, exigências documentais (`getDocumentGate`) |
| Minuta e assinatura | versões de minuta (`addMinutaVersion`, `emitMinutaVersion`), `sendForSignature`/`getSignatureStatus` (Edge Function `sign-contract`, ZapSign) |
| Itens e orçamento | `listContractItems`, `generateFromBudget` |
| Aditivos | `createAddendum`, `approveAddendum` |
| Medições | `createMeasurement`, `submitMeasurementForReview`, `approveMeasurement`, `getMeasurementRollupByBudgetItem` |
| Reajuste | `applyReajuste` (índices em `contractIndexService`; vencidos aparecem como alerta na Central de Controle) |
| Retenções | `getRetentionLedger`, `releaseRetention` |
| Financeiro | `syncContractToFinance` (à vista, parcelado, recorrente, medição), `ajustarValorDoContrato`, `aplicarCronogramaCorrigido` |
| Organização | `moverParaOrganizacao` (com prévia) |

Parcela com vencimento editado à mão é marcada e **preservada** pela
sincronização. Contrato de locação original não fatura por aqui (ver
[Comercial](../comercial/empreendimentos-vendas-e-locacoes.md)). Modelos de
documento (DOCX) em `contractTemplateService` / `docGen*`.

## Almoxarifado e estoque

- `services/inventoryService.ts` — itens de estoque, almoxarifados
  (`warehouses`), prazos de fornecedor; é o **modelo canônico** do padrão de
  service com organização opcional (ver
  [Multi-tenancy](../../conceitos/multi-tenancy-organizacao.md)).
- `services/almoxarifadoService.ts` — requisições de material
  (`material_requests`), movimentos (`stock_movements`) e transferências entre
  almoxarifados.
- Marcas e modelos de item são catálogo próprio (`brandModelService`), com
  `brand`/`model` derivados por gatilho.
- Ativos/patrimônio em `assetService` / `OpuraAssetsModule`.

## Onde olhar

| Pergunta | Arquivo |
|---|---|
| status da solicitação e o que pode ser feito | `utils/solicitacaoCompra.ts` |
| cotação e vencedor | `services/quotationService.ts` |
| pedido, aprovação, recebimento | `services/orderService.ts` |
| torre do fluxo | `services/p2pFlowService.ts`, `components/P2PFlowBoard.tsx` |
| contrato | `services/contractService.ts` |
| numeração | `services/documentNumbering/` |
