# Status FOB nas listas · trava de cobrança em dobro no Fiscal · pedido sumido do portal

## Pedido original

Sessão de 19/10/2026 (VS Code), respondendo aos três pontos em aberto do resumo:

> 1. Status nas listas: as listas de Pedidos, Recebimentos e do portal ainda mostram o status original nos pedidos FOB (por exemplo "Entregue" em vez de "Retirado"): Implementar
> 2. Testes na tela pendentes: estao ok
> 3. Cobrança em dobro no Fiscal: Implementar
> Ponto adicional:
> 4. verifique por que o Pedido #PCO-011-017-0002 nao apareceu no portal do fornecedor

## 4. Diagnóstico — por que o pedido não apareceu no portal

Provado no banco (transações desfeitas):
- pelo LINK do fornecedor (`supplier_portal_get_orders`): 2 pedidos, com o PCO-011-017-0002;
- pelo LOGIN do fornecedor (alpaconstrutora@gmail.com, `pedidos_do_fornecedor`): idem;
- pelo ADMIN (desenvolvedor@…): `pedidos_do_fornecedor` devolve **0** — para qualquer fornecedor.

O "Impersonar Fornecedor" do portal (`SupplierDashboard`, admin sem perfil de fornecedor)
carregava a lista por `orderService.listOrders(_, supplierId, email)`, que desde
`aplicar_20270921000027` lê pela RPC `pedidos_do_fornecedor` — filtrada pelo e-mail da
**sessão** (o do admin). A impersonação ficou vazia para todos os fornecedores.

Outras causas descartadas: banco (status/fornecedor ok), filtro de organização (não há),
Visão geral (lista os recentes sem filtro). Ponto de atenção que NÃO era a causa: o filtro da
lista de pedidos do portal fica gravado no navegador ("Em aberto" esconde Recebido).

## Itens

- [x] **4 · `SupplierDashboard.loadOrders`** — impersonando (`isAdmin && !supplierProfile`),
  lê como comprador (`listOrders()`, RLS da org) e recorta pelo fornecedor escolhido, sem
  rascunho. Abrir o pedido já funcionava (o detalhe cai na leitura de comprador).
- [x] **1 · rótulo FOB nas listas** (`rotuloStatusLogistico`, texto; cor segue o status
  gravado): Suprimentos › Pedidos (`StatusBadge`, tabela e cartões), Recebimentos
  (`ReceiptStatusBadge`), portal › Pedidos (tabela e cartões) e Visão geral, e a lista do
  `SupplierDashboard`. Lances (só Enviado/Em Negociação) não muda.
  **Pronto quando:** `__tests__/components/PortalOrdersStatusFob.test.tsx` verde. ✅
- [x] **3 · cobrança em dobro — nos dois sentidos** (hoje 0 pedidos com os dois tipos de
  título, conferido no banco — trava preventiva):
  - `nfeService.titulosDoPedido` + `approveAndLink` recusa "Criar título" quando o pedido
    (escolhido agora OU o que a nota já tinha) tem débito principal não cancelado;
  - modal de aprovação (`FiscalDocuments`): abre em "Vincular existente" quando o pedido tem
    título, lista as parcelas do PRÓPRIO pedido primeiro (antes só a busca pelo 1º nome do
    emissor), e "Aprovar e gerar título" fica desligado com o motivo;
  - `syncOrderToFinance` não gera parcelas do pedido quando a NOTA já lançou o título
    (`source_system='NFE'`) — `pulou: 'titulo-da-nota'`, inclusive pelo botão.
  **Pronto quando:** `__tests__/nfeAprovarSemCobrancaEmDobro.test.ts` (4) e
  `__tests__/syncOrderToFinance.test.ts` (15) verdes. ✅
- [x] `tsc` limpo; `check-ui-standard.sh` sem achado novo; `orgContextGuard` verde.
- [ ] **Conferência na tela** — pelo usuário depois de publicado: impersonar o Sebastião
  Eugênio (pedido aparece), Pedidos/Recebimentos com "Retirado"/"Aguardando retirada", e
  aprovar uma NF de pedido com título (abre em Vincular; Criar desligado).

## 2.

Testes na tela das entregas anteriores: conferidos pelo usuário ("estao ok").
