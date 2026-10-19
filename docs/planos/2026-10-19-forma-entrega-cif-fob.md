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

## Pedido de 19/10/2026 (mesma sessão, depois da 1ª publicação `9daddbc`)

Com print do pedido PCO-011-017-0002 (FOB, Rascunho), aba Recebimento:

> quando a retirada FOB o Rastreamento logístico deve deixar de ter acão por parte do fornecedor.
> Atualmente fica bloqueado aguardando acao do fornecedor. verificar

**Verificação:** o comprador não tinha NENHUM controle de etapa logística. Separação,
Em Trânsito e Entregue só mudavam pela tela de logística do fornecedor
(`SupplierDashboard`, "Editar Logística"), e o botão Receber só aparece em `Entregue`
— então o pedido FOB parava esperando o fornecedor. (O print ainda mostrava "Em
Trânsito/Entregue" porque a 1ª publicação não tinha chegado ao domínio.)

**Decisão (revisa a da 1ª entrega):** no FOB a logística é toda do comprador.

| status gravado | FOB, antes | FOB, agora |
|---|---|---|
| `Separação` | Separação (fornecedor marcava) | fora do trilho; lido "Aguardando retirada" |
| `Em Trânsito` | Pronto para retirada (fornecedor marcava) | fora do trilho; lido "Aguardando retirada" |
| `Entregue` | Retirado (fornecedor marcava) | Retirado — **o comprador registra** |

Trilho FOB: Lances → Confirmado → Retirado → Recebido → Divergência.

- [x] **`utils/formaEntrega.ts`** — `rotuloStatusLogistico` novo mapeamento;
  `situacaoDaRetirada(status)` (pode a partir de Enviado; Rascunho/Em Negociação =
  desligado com motivo; Entregue em diante = sem botão).
  **Pronto quando:** `__tests__/formaEntrega.test.ts` verde. ✅ 12 casos.
- [x] **`OrderLifeline`** — FOB sem Separação/Em Trânsito; pedido antigo nesses status
  fica no passo Confirmado. **Pronto quando:** `OrderLifelineFob.test.tsx` verde. ✅ 3 casos.
- [x] **`SupplyChainOrderDetails`** — no cartão de rastreamento, para o comprador em
  FOB: "Data da retirada" (padrão hoje, máx. hoje) + **Registrar retirada** (confirma,
  grava `status='Entregue'` + `actual_delivery_date`, que libera Receber e é a base de
  vencimento das parcelas). Textos do cartão de status (Dados Gerais) ajustados.
  **Pronto quando:** `tsc` limpo, `check-ui-standard.sh` sem achado.
- [x] **`SupplierDashboard`** — FOB: sem "Editar Logística", com aviso "a retirada é
  registrada pelo comprador"; trilho não editável.
  **Pronto quando:** idem.
- [x] **Conferência na tela** — pedido FOB do comprador mostra o botão e o trilho de 5
  passos. **Pronto quando:** testado no app publicado. ✅ 19/10: o usuário testou em
  produção no pedido PCO-011-017-0002 — "esta ok". (A conferência por Playwright não
  rodou: a senha do agente-leitura foi trocada às 17:45 e a informada foi recusada.)
  Publicado em `a2e1233d`.

## Pedido de 19/10/2026 (mesma sessão, depois da 2ª publicação `a2e1233`)

> 1. O fornecedor só está impedido de mexer na logística do FOB pela tela. As funções do banco que o portal usa ainda aceitam mudança de status vinda dele; fechar isso exige uma migration, que eu faço se você quiser. Pode fazer
> 2. criar campo para informar quem esta autorizado retirar e quem retirou. Conectar com o recursos humanos < colaboradores

Respostas às perguntas feitas antes de criar (AskUserQuestion):
- Quantos autorizados por pedido? → **Vários**.
- O que o fornecedor vê? → **Nome e CPF** (conferência no balcão), nada mais do RH.

Achado no caminho: a policy `po_update_org_or_supplier` ainda tem a perna do fornecedor,
mas desde `aplicar_20270921000027` ele não passa no SELECT, e UPDATE com WHERE exige
SELECT — o caminho direto na tabela já estava fechado. As duas RPCs eram o único caminho.

- [x] **Migration `aplicar_20271019987000_pedido_fob_retirada_autorizada.sql`** (aplicada
  com `db query -f` em 19/10):
  `fn_pedido_eh_fob`; as duas RPCs de escrita do fornecedor recusam status logístico
  (Separação/Em Trânsito/Entregue/Recebido/Divergência) e datas no FOB com
  `reason: 'fob'` (aceitar/negociar/cotar seguem); a do token deixa de devolver as colunas
  internas; `purchase_orders.retirado_por_employee_id` (FK employees, interna);
  tabela `purchase_order_retirada_autorizados` (PK pedido+colaborador, RLS = enxergar o
  pedido; INSERT também exige enxergar o colaborador; anon sem grant); RPC
  `purchase_order_retirada_autorizados_fornecedor(order, token)` → só nome/CPF, só FOB,
  só do fornecedor do pedido.
  **Pronto quando:** prova por perfil em transação desfeita. ✅ comprador insere/lê/grava
  retirado_por e recebe `[]` da RPC do fornecedor; fornecedor lê 0 linhas da tabela, INSERT
  recusado (42501), RPC devolve `[{nome, cpf}]`; FOB: Entregue/Em Trânsito/previsão →
  `fob`, Confirmar → ok e sem `retirado_por_employee_id` na resposta; CIF Separação → ok
  (controle); anon: RPC `[]`, tabela 42501. Banco conferido limpo depois; ACL sem PUBLIC;
  sem mojibake; `segurancaMigrations` + `migrationsPrefixo` verdes.
- [x] **`services/retiradaPedidoService.ts`** (novo) — get/adicionar/remover autorizado,
  colaboradores ATIVOS da org do pedido (reusa `laborService.listEmployees`, com
  compartilhados), visão do fornecedor pela RPC. `orderService.updateOrder` grava
  `retiradoPorEmployeeId`; `reason 'fob'` vira mensagem nos dois serviços do fornecedor.
- [x] **`utils/retiradaPedido.ts`** (novo) — itens dos seletores (autorizados primeiro;
  CPF no nome, não no `code`, que ordenaria por CPF), motivo do botão desligado (status →
  data → quem retirou), `formatarCpf`.
  **Pronto quando:** `__tests__/retiradaPedido.test.ts` verde. ✅ 11 casos.
- [x] **`SupplyChainOrderDetails`** — comprador, FOB: lista "Autorizados a retirar"
  (nome · CPF · cargo, remover com confirmação) + "Adicionar colaborador autorizado"
  (drawer, busca nome/CPF) até a retirada; "Retirado por" (obrigatório) + data +
  Registrar; depois de retirado mostra quem e quando. Fornecedor: lista só leitura.
- [x] **`components/supplier/AutorizadosRetiradaFornecedor.tsx`** (novo) — visão do
  fornecedor no detalhe e na logística do portal (`SupplierDashboard`); erro dito como erro.
  **Pronto quando:** `tsc` limpo; `check-ui-standard.sh` e `orgContextGuard` sem achado.
- [ ] **Conferência na tela** — depende de login (senha do agente-leitura recusada desde
  17:45) ou do teste do usuário depois de publicado.

## Fora do escopo (anotado)

- Listas (Suprimentos › Pedidos, Recebimentos, portal do fornecedor) continuam mostrando
  o status cru para pedido FOB.
