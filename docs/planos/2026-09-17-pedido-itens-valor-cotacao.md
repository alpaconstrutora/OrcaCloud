# Pedidos › Itens do pedido: "Valor unit. da cotação" e "Valor total da cotação"

## Pedido original

> Sessão de 2026-09-17, primeira mensagem:
>
> suprimentos < pedidos < itens do pedido: valores unitário e total dos itens avulso ou do orçamento são de referencia. Criar novas colunas Valor Unitário da Cotação e valor total da Cotação, que deve ser importado da cotação quando houver e se nao houver cotação ficará vazio para que o fornecedor possa preencher quando o pedido chegar para ele

## Decisões tomadas com o usuário (2026-09-17)

| Pergunta | Resposta |
|---|---|
| Com as colunas novas, qual valor manda nos ~20 lugares que somam `item.total` (lista, Contas a Pagar, alçada, 3 vias, estoque, webhook)? | **Cotado quando houver, senão referência** — helper único `valorEfetivoDoItem(item) = quotedTotal ?? total`. |
| Pedido gerado pelo mapa de cotação (`selectWinner`): como fica a referência? | **Referência = `unitPrice` do item da RFQ (orçamento), 0 se não houver**; cotado = resposta vencedora. |
| Quem edita as colunas cotadas no app interno? | **Comprador também edita** (formulário e detalhe), além do fornecedor no portal. |
| Negociação (`NegotiationHub`/contraproposta) mexe em qual par? | **Só no cotado.** A referência nunca é tocada pela negociação. |

Decisões assumidas (não perguntadas, ditas aqui):
- `0` cotado é cotação válida (`??`, não `||`).
- `quotedTotal` é sempre derivado (`round2(quantity × quotedUnitPrice)`), não editável em separado.
- Fornecedor pode cotar em qualquer status exceto `Entregue`, `Recebido`, `Divergência`, `Cancelado` (Rascunho nunca chega a ele).

## Contexto

O item do pedido (`purchase_orders.items`, **JSONB** — não há tabela de itens) tinha um único par
`unitPrice`/`total`, que misturava orçamento/SINAPI, preço digitado no avulso e o preço cotado do
vencedor da cotação. Passa a ter dois pares: **referência** (o que existia) e **cotado** (novo,
`quotedUnitPrice`/`quotedTotal`). O cotado é o que vale para o financeiro quando preenchido.

Fatos que moldam o desenho:
- `SupplyChainOrderForm` **reconstrói** os itens a partir de `customPrices`/`customQuantities`/`avulsoItems` —
  o cotado precisa de estado próprio (`quotedPrices`) para não morrer ao salvar.
- O fornecedor escreve por **duas portas**: logado (`orderService.updateOrder`, policy `po_update_org_or_supplier`)
  e por token (só RPC `supplier_portal_*`). O gate de exibição é `ehCompradorDoPedido`, nunca `!portalToken`.
- `supplier_portal_get_order_detail` devolve `row_to_json(purchase_orders)` → as chaves novas do JSON fluem sozinhas.
- Colunas novas entram visíveis no fim para quem já tem preferência salva (`useTableColumns`, `TableUtils.tsx:91-103`).

## Plano

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| A1 | `types/supplyChain.ts` | `PurchaseOrderItem` ganha `quotedUnitPrice?` / `quotedTotal?` (`number \| null`) | `npx tsc --noEmit` limpo |
| A2 | `utils/pedidoItemValor.ts` (novo) | `temCotacao`, `unitarioEfetivoDoItem`, `valorEfetivoDoItem`, `totalEfetivoDoPedido`, `totalReferenciaDoPedido`, `fornecedorPodeCotar`, `aplicarCotadoNosItens` (índice+code, fallback code, legado), `montarItensDoPedidoDaCotacao` | `__tests__/pedidoItemValor.test.ts` verde |
| H | `supabase/migrations/aplicar_20270921000025_pedido_itens_valor_cotacao.sql` (novo) | `fn_pedido_itens_aplicar_cotado` (SQL puro, espelho do helper); RPC `supplier_portal_update_item_quotes` (token, versão otimista, trava de status, não toca `status`); `supplier_portal_accept_negotiation_proposal` redefinida para aplicar só o cotado; `fn_create_stock_entry_from_receipt` com `COALESCE(quotedUnitPrice, unitPrice)`; `fn_approval_action_queue` e `fn_approval_pending_summary` somando `COALESCE(quotedTotal, total)`. REVOKE/GRANT em todas | `segurancaMigrations.test.ts` verde; aplicada com `db query --linked -f`; `pg_proc` lista as 2 funções novas; teste SQL de code duplicado cota só o índice certo |
| F | `orderService` (WhatsApp, `submitForApproval`), `financialService.syncOrderToFinance`, `matchService`, `webhookService`, `SupplyChainOrderList`, `supplier/portal/status.ts`, `SupplierDashboard`, `FinancialOrderDetails`, `ProjectFinancialManager`, `SupplyChainReceiptManager`, `utils/projectUtils`, `FinancialSchedule`, `PublicOrderView` | Toda soma de `item.total` → `valorEfetivoDoItem`/`totalEfetivoDoPedido` | `__tests__/pedidoValorCotacaoTrava.test.ts` verde (cada arquivo importa `pedidoItemValor`) |
| G | `services/supplierPortalTokenService.ts` | `updateItemQuotes(token, orderId, cotados, expectedVersion?)` → RPC nova; `reason:'conflict'` vira `Error('CONFLICT…')` | link público: preencher cotado, recarregar → persistiu, `version` +1, `unitPrice` intacto |
| B | `services/quotationService.ts` (`selectWinner`) | itens via `montarItensDoPedidoDaCotacao(rfq.items, resposta.items)` | teste do helper; UI: pedido gerado mostra referência = RFQ e cotado = resposta |
| C | `components/SupplyChainOrderForm.tsx` | `quotedPrices` Map + campos no `AvulsoItem`; carga/classificação/`orderItems` preservam o cotado; colunas "Unit. cotação"/"Total cotação" nas tabelas de avulsos e materiais (input §7.1); campo no modal de avulso; total efetivo + "Referência" no resumo | `check-ui-standard.sh` → 0; UI: salvar sem mexer e reabrir mantém o cotado |
| D | `components/SupplyChainOrderDetails.tsx` | colunas novas em `ITEM_COLUMNS`; edição inline: comprador edita tudo, fornecedor só o cotado (lápis restrito, `fornecedorPodeCotar`); salvar do fornecedor por token → RPC, logado → `updateOrder` com `aplicarCotadoNosItens`; totais efetivos + linha "Referência" | `check-ui-standard.sh` → 0; `pedidoPerfilFornecedor.test.ts` verde; UI comprador e fornecedor |
| E | `components/NegotiationHub.tsx`, `services/negotiationService.ts` | proposta/aceite alteram só `quotedUnitPrice`/`quotedTotal`; hub mostra o efetivo como base e a referência como dica | contraproposta grava `unitPrice` igual ao do pedido; aceite muda só "Unit. cotação" |
| I | `__tests__/pedidoItemValor.test.ts`, `__tests__/pedidoValorCotacaoTrava.test.ts` (novos) | ver A2 e F | verdes na suíte cheia |

Fora do escopo (comportamento igual ao atual): pedidos de NF-e, `procurementService`, `duplicateOrder`
continuam sem cotado; `fetchBudgetPrices` sobrescrevendo a referência carregada quando o SINAPI tem
preço > 0 é bug pré-existente, não tratado aqui.

## Estado

- [ ] A1/A2 — tipo + helper + teste
- [ ] H — migration escrita e aplicada
- [ ] F + G — consumidores + service do portal + trava
- [ ] B — `selectWinner`
- [ ] C — formulário
- [ ] D — detalhe
- [ ] E — negociação
- [ ] Suíte cheia + tsc + check-ui; push em main; `conferir-producao.sh "Unit. cotação"`

## Verificação

1. `npx vitest run __tests__/pedidoItemValor.test.ts __tests__/pedidoValorCotacaoTrava.test.ts __tests__/pedidoPerfilFornecedor.test.ts __tests__/segurancaMigrations.test.ts`
2. `npx tsc --noEmit`; `bash scripts/check-ui-standard.sh` em `SupplyChainOrderForm.tsx`, `SupplyChainOrderDetails.tsx`, `NegotiationHub.tsx`.
3. Banco: `select fn_pedido_itens_aplicar_cotado('[{"code":"A","unitPrice":1,"total":2,"quantity":2},{"code":"A","unitPrice":1,"total":2,"quantity":2}]','[{"index":1,"code":"A","quotedUnitPrice":5,"quotedTotal":10}]')` cota só o 2º.
4. UI (skill `rodar-app`): (i) mapa de cotação → fechar compra → detalhe do pedido; (ii) pedido avulso com/sem cotação, salvar e reabrir; (iii) link público do fornecedor preenchendo o cotado; negociação com aceite.
