# Forma de entrega só CIF/FOB + rastreamento logístico no FOB

## Pedido original

Sessão de 19/10/2026 (VS Code), com print do campo "Forma de Entrega" aberto:

> na aba dados gerais > campo Forma de Entrega parece que tem campos com mesmo sentido

Depois da análise (a lista misturava *quem paga o frete* — CIF/FOB — com *por qual
meio chega* — entrega própria, transportadora, retirada em mãos):

> Só com CIF/FOB.
> e mais um ponto, quando é FOB o rastreamento logistico da aba recebimento, deve ser adaptado para essa condicao

## Diagnóstico

- A mesma lista de 5 opções estava escrita à mão em 3 telas (pedido, solicitação
  de cotação, resposta do fornecedor); a contraproposta já oferecia só CIF/FOB.
- Banco (19/10): pedidos 11 CIF, 5 FOB, 5 vazios; cotações só CIF. As outras três
  opções nunca foram gravadas → sem migração de dados.
- `delivery_method` é texto livre; nenhuma regra dependia do valor.
- O rastreamento (`OrderLifeline`) era um trilho único: … Separação → Em Trânsito →
  Entregue → Recebido. O botão **Receber** do comprador só aparece em `Entregue`,
  e `syncOrderToFinance` (título a pagar) dispara em Entregue/Recebido/Divergência.

## Decisão

No FOB **os status gravados não mudam** (CHECK de `purchase_orders.status`, botão
Receber e geração do título dependem deles); muda o que a tela mostra:

| status gravado | CIF | FOB |
|---|---|---|
| `Em Trânsito` | Em Trânsito | Pronto para retirada (trilho: "Para retirar") |
| `Entregue` | Entregue | Retirado |

A entrega do FOB É a retirada — por isso `Entregue` ≡ Retirado, e a data de
"entrega efetiva" passa a ser a data da retirada.

## Itens

- [x] **`utils/formaEntrega.ts`** (novo) — `FORMAS_DE_ENTREGA` (só CIF/FOB),
  `FORMA_ENTREGA_PADRAO`, `ehFob`, `rotuloStatusLogistico`.
  **Pronto quando:** `__tests__/formaEntrega.test.ts` verde. ✅ 7 casos.
- [x] **`SupplyChainOrderForm` / `SupplyChainQuotationForm` / `QuotationResponseForm` /
  `SupplyChainQuotationComparison`** — select lê `FORMAS_DE_ENTREGA`; padrão vem da constante.
  **Pronto quando:** nenhum arquivo de `components/` contém "Transportadora Terceirizada",
  "Entrega Própria Fornecedor" ou "Retirada em Mãos"; `tsc` limpo. ✅
- [x] **`OrderLifeline`** — prop `fob`: passos "Para retirar" / "Retirado".
  **Pronto quando:** `__tests__/components/OrderLifelineFob.test.tsx` verde. ✅ 2 casos.
- [x] **`SupplyChainOrderDetails`** (aba Recebimento + cabeçalho) — aviso de frete FOB,
  "Previsão de retirada", "Retirar em", status pelo rótulo FOB.
  **Pronto quando:** `tsc` limpo e `check-ui-standard.sh` sem achado novo. ✅
- [x] **`SupplierDashboard`** (logística do fornecedor) — trilho FOB, opções do select de
  status, "Previsão de Retirada", "Pronto para Retirada em", "Data da Retirada".
  **Pronto quando:** idem. ✅
- [x] **Conferência na tela de verdade** (pedido FOB, aba Recebimento).
  **Pronto quando:** print do trilho sem rótulos sobrepostos e sem erro de
  console/HTTP. ✅ 19/10, Playwright no vite da frente, pedido FOB PO-054827 (Alpa
  Construtora) com status real (Enviado) e simulados só na resposta do navegador
  (Em Trânsito → cabeçalho e status "Pronto para retirada", passo "Para retirar"
  aceso; Entregue → "Retirado"); 0 rótulos sobrepostos, 0 erros de console/HTTP;
  select de Dados gerais com exatamente CIF e FOB. A logística do portal do
  fornecedor (`SupplierDashboard`) não foi aberta — a conta de teste não é
  fornecedor; coberta por `tsc` e pelo teste do `OrderLifeline`.

## Fora do escopo (anotado)

- Listas (Suprimentos › Pedidos, Recebimentos, portal do fornecedor) continuam mostrando
  o status cru ("Em Trânsito") para pedido FOB.
- No FOB o comprador ainda depende do fornecedor marcar "Retirado" para ver o botão
  Receber.
