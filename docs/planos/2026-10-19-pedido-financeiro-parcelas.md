# Pedido › aba Financeiro: tabela das parcelas geradas pelo pedido

## Pedido original

Sessão de 19/10/2026 (VS Code):

> criar em financeiro tabela com as parcelas geradas pelo pedido

## Diagnóstico

- A aba Financeiro do comprador era só o formulário de condições (Vista/Parcelado, conta,
  centro de custo, plano de contas). As parcelas reais não apareciam para ele.
- A visão do FORNECEDOR já tinha a tabela, lida de `purchase_order_financeiro_json`
  (`pedidoFinanceiroService`) — que também atende o comprador logado (RPC em lote
  `purchase_orders_financeiro`). Reusar a mesma fonte mantém comprador, fornecedor e portal
  dizendo a mesma coisa.

## Itens

- [x] **`components/PedidoParcelasComprador.tsx`** (novo) — card "Parcelas no Contas a Pagar"
  com `StandardTable` (§6.10, `bare`, sem busca — poucas linhas): Parcela · Vencimento ·
  Valor · Pago em · Status (texto colorido §8, rótulos de `PAYABLE_STATUS`); linha de totais
  Total / Pago / Em aberto / Vencido (cancelada fora); estado vazio explica quando as parcelas
  nascem; erro de leitura vira aviso, não "não geradas". Recarrega a cada abertura da aba.
  **Pronto quando:** `__tests__/components/PedidoParcelasComprador.test.tsx` verde. ✅ 3 casos.
- [x] **`components/SupplyChainOrderDetails.tsx`** — monta o card abaixo do formulário, só
  para o comprador e só com a aba Financeiro aberta.
  **Pronto quando:** `tsc` limpo, `check-ui-standard.sh` sem achado.
- [x] **Leitura pelo comprador provada no banco** (transação desfeita, agente-leitura):
  `purchase_orders_financeiro` devolve a parcela de PCO-007-111-0002.
  Observação: essa parcela vence em 17/10/2016 — provável data digitada errada no pedido.
- [ ] **Conferência na tela** — pelo usuário depois de publicado (senha do agente-leitura
  recusada desde 17:45).
