# Pedido de Compra › Recebimento › sub-aba "Documentos"

## Pedido original
> suprimmentos > pedidos de Compra: criar aba para upload de notas fiscais, recibos etc
>
> Sessão e7d28ecc · 2026-11-09

### Pedido posterior (2026-11-09, mesma sessão, depois do PR #270 no ar)
> implemente também a lista de recibo em formado de cards imitando um recibo real
>
> (esclarecimento) Documentos (recem criado) porem não é para substituir e sim criar uma opcao de visualizacao para o usuario escolher como preferir

## Decisões tomadas com o usuário
| Data | Pergunta | Resposta |
|---|---|---|
| 2026-11-09 | O que acontece com uma NF enviada lá? | **Anexo + NFs vinculadas.** O upload só GUARDA o arquivo (sem título, sem pipeline fiscal). A aba também mostra, só para leitura, as NFs que já estão ligadas ao pedido por outros caminhos. |
| 2026-11-09 | Quem vê e envia? | **Comprador e fornecedor.** Os dois enviam; cada um só exclui o que o próprio lado enviou. |
| 2026-11-09 | Nome/lugar da aba | *"Pode ficar dentro de recebimento"* → sub-aba de Recebimento, não aba de topo. |
| 2026-11-09 | Qual lista vira cartão de recibo? | **Documentos**, como **opção de visualização** (alternador cartões/tabela), sem substituir a tabela. |

## Contexto
O pedido (`components/SupplyChainOrderDetails.tsx`) não tinha onde guardar recibo,
comprovante, boleto ou arquivo solto. As NFs chegam ao pedido por dois caminhos
(`invoices.order_id`, nota enviada pelo fornecedor; `nfe_invoices.purchase_order_id`,
NF-e importada), mas nenhum aparecia no pedido.

Em 21/08/2026 a seção "Documentos Fiscais" saiu deste detalhe por duplicar Contas a
Pagar › Notas. Este desenho não repete aquilo: o anexo novo não cria nota nem título,
e as notas dos outros módulos aparecem só para leitura.

A tela atende três portas — comprador (app), fornecedor logado (`SupplierDashboard`)
e link público (`portalToken`, sessão anon, leitura sempre por RPC).

## Plano — um item por arquivo

1. **`supabase/migrations/aplicar_20271030500000_pedido_documentos.sql`** — tabela
   `purchase_order_documents` (categoria, descrição, arquivo, `enviado_por_lado`,
   `enviado_por`/`uploaded_by` gravados por gatilho a partir do JWT), RLS com
   `purchase_order_is_buyer`/`purchase_order_is_supplier` (cada perna amarra o lado a
   quem é; sem UPDATE), bucket privado `purchase-order-documents` (10 MB, 1ª pasta =
   pedido) com DELETE do objeto só quando nenhuma linha aponta para ele, e RPC de link
   `supplier_portal_get_order_documents` (REVOKE PUBLIC; GRANT anon intencional).
   **Pronto quando:** aplicada com `db query --linked -f`; `pg_policies` mostra 3
   policies na tabela e 3 no storage; anon executa só a RPC; `segurancaMigrations` e
   `migrationsPrefixo` verdes.
2. **`supabase/functions/supplier-portal-upload/index.ts`** — ramo
   `destino=pedido_documento` (enviar e `acao=excluir`), validando token, pedido do
   fornecedor (`supplier_portal_pedido_do_fornecedor`), categoria, extensão e 10 MB.
   Sem `destino`, o caminho antigo (`invoices`) não muda.
   **Pronto quando:** deploy feito; pelo link, enviar devolve a linha e excluir o do
   comprador devolve 403.
3. **`supabase/functions/supplier-portal-download/index.ts`** — bucket novo na lista
   fechada, com vínculo conferido pelo `file_path` exato → pedido do fornecedor.
   **Pronto quando:** deploy feito; pelo link, abrir devolve URL assinada.
4. **`lib/pedidoDocumentos.ts`** + **`__tests__/pedidoDocumentos.test.ts`** — regras
   puras (categorias, tipo/tamanho, quem exclui, motivo do botão desligado).
   **Pronto quando:** teste verde.
5. **`services/pedidoDocumentoService.ts`** — listar/enviar/excluir/abrir nas três
   portas (a diferença fica dentro do serviço) e `notasVinculadas` (nota do
   fornecedor + NF-e importada, esta só para o comprador; cada origem falha sozinha).
   *Mudança em relação ao rascunho:* as variantes de link ficaram neste serviço, não
   em `supplierPortalTokenService`, para a tela não escolher porta.
   **Pronto quando:** typecheck verde e teste manual das três portas.
6. **`components/suprimentos/PedidoDocumentos.tsx`** — `StandardTable` de documentos
   (Abrir; Excluir só do próprio lado, desligado com o motivo no `title`;
   `useConfirm`), drawer `Sheet` "Enviar documento" e tabela só-leitura de notas
   vinculadas. **Pronto quando:** `check-ui-standard.sh` sai 0.
7. **`components/SupplyChainOrderDetails.tsx`** — sub-aba `documentos` em Recebimento
   (badge = nº de documentos), lista carregada junto dos demais anexos do pedido (falha
   sozinha) e comentário da remoção de 21/08 atualizado.
   **Pronto quando:** `check-ui-standard.sh` sai 0 e typecheck verde.

### Fase 2 — cartões de recibo (pedido posterior)
8. **`components/ui/CartaoRecibo.tsx`** (novo) — primitiva de recibo de papel: papel creme,
   sombra por `drop-shadow`, picote com meia-lua, linhas "rótulo ··· valor", código de barras
   decorativo, borda serrilhada. **Pronto quando:** `check-ui-standard.sh` = 0.
9. **`lib/pedidoDocumentos.ts`** — `codigoCurtoDocumento`, `barrasDoCodigo` (determinístico).
   **Pronto quando:** casos novos em `pedidoDocumentos.test.ts` verdes.
10. **`components/suprimentos/PedidoDocumentos.tsx`** — alternador cartões/lista persistido
    (padrão `'list'`), busca única nos dois modos, grade de `CartaoRecibo` em card §5.2; larguras
    da tabela somando 1.000 + 130 (antes 1.240: a coluna de ações saía cortada).
    **Pronto quando:** `check-ui-standard.sh` = 0, typecheck verde.
11. **`docs/ui_ux_guia_unificado.md`** — §34 Cartão de recibo + item nos dois checklists.
    **Pronto quando:** a seção existe e é citada no componente.
12. **`__tests__/components/PedidoDocumentos.test.tsx`** (novo) — começa na tabela; troca para
    cartões; escolha guardada; busca única; Excluir desligado com motivo no cartão.
    **Pronto quando:** verde.

## Estado
- [x] 1. migration aplicada em 2026-11-09 (`db query --linked -f`). Conferido no banco: 3 policies na tabela, 3 no storage, bucket privado de 10 MB, anon executa só a RPC de link. Regras testadas com JWT simulado, em transação desfeita: comprador envia (o nome forjado é trocado pelo e-mail do JWT); comprador não grava como fornecedor; fornecedor vê o do comprador, envia, não exclui o do comprador, exclui o próprio; estranho não vê nem envia.
- [x] 2. upload — publicada pelo usuário (v5). Sonda de fora: sem credencial 401, token falso 403.
- [x] 3. download — publicada pelo usuário (v5). Token falso → "Link inválido ou expirado".
- [x] 4. regras puras + teste (7 verdes)
- [x] 5. serviço
- [x] 6. componente — `check-ui-standard.sh` = 0
- [x] 7. detalhe do pedido — `check-ui-standard.sh` = 0, typecheck verde, build verde
- [ ] Verificação na tela: comprador, fornecedor logado e fornecedor pelo link (envio real pelo link não testado por mim — o modo automático barrou ler um token de portal do banco)
- [x] 8. `CartaoRecibo` — `check-ui-standard.sh` = 0
- [x] 9. funções do cartão — 9 testes verdes em `pedidoDocumentos.test.ts`
- [x] 10. `PedidoDocumentos` — `check-ui-standard.sh` = 0, typecheck e build verdes
- [x] 11. guia §34
- [x] 12. teste de componente — 4 verdes
- [x] Prévia visual (página temporária no Vite + Playwright, apagada depois): desktop 3 colunas;
  celular 390 px em 1 coluna sem rolagem lateral; portal com acento coral (botão e alternador);
  sistema em modo escuro idêntico ao claro; tabela com a coluna de ações inteira.

## Verificação
1. `npm run ci` na frente.
2. Comprador: Suprimentos › Pedidos de Compra › pedido › Recebimento › Documentos →
   enviar PDF de recibo e XML de NF; abrir; excluir; conferir linha e objeto no banco.
3. Link do fornecedor: vê os do comprador, envia um, não exclui o do comprador, exclui
   o próprio.
4. Fornecedor logado: idem 3.
5. Pedido com nota vinculada (`invoices.order_id` / `nfe_invoices.purchase_order_id`):
   aparece em "Notas fiscais vinculadas" e abre.
6. Nenhum `internal_transactions` novo pelos uploads.
