# Pedido › aba Financeiro: "Gerar título a pagar" para compra sem nota fiscal

## Pedido original

Sessão de 19/10/2026 (VS Code). Depois de publicada a tabela de parcelas, o usuário colou o
estado vazio do PCO-011-017-0002:

> Parcelas ainda não geradas
> São geradas quando o pedido é entregue (no FOB, retirado) e tem nota fiscal vinculada.

Explicado que a regra exige nota e oferecidos dois caminhos (vincular a nota / gerar sem nota):

> Existe compra também sem nota fiscal. entao o caminho 2 também existe como opcao

(Liga à primeira pergunta da sessão: "existe botão para fechamento do pedido e geração de
título a pagar no financeiro?" — não existia.)

Condições propostas e seguidas: só com o pedido Entregue/Retirado, Recebido ou Divergência;
sempre com confirmação; se a nota chegar depois, o título já gerado é mantido (não duplica).

## Itens

- [x] **`services/financialService.ts` › `syncOrderToFinance(orderId, { permitirSemNota })`** —
  sem nota e com a opção, gera mesmo assim (mesma condição/vencimento) e carimba as `notes`
  com `MARCA_PARCELA_SEM_NOTA`. O sync automático (nota vinculada depois, mudança de status)
  vê a marca e MANTÉM as parcelas (não apaga/regera: trocaria ids e soltaria vínculo de
  boleto/conciliação). Passa a devolver `{ gerou }` ou `{ pulou, motivo }`; os chamadores
  automáticos ignoram o retorno.
  **Pronto quando:** `__tests__/syncOrderToFinance.test.ts` verde. ✅ 12 (7 antigos + 5 novos:
  sem nota sem permissão não gera; botão gera com marca; nota depois mantém; botão regera;
  antes da entrega não gera).
- [x] **`components/PedidoParcelasComprador.tsx`** — botão "Gerar título a pagar" no card,
  só sem parcelas; desligado antes da entrega com o motivo à vista; `useConfirm` com nº de
  parcelas, total e condição; recusa do serviço aparece no card; sucesso recarrega a tabela.
  **Pronto quando:** `__tests__/components/PedidoParcelasComprador.test.tsx` verde. ✅ 8.
- [x] `tsc` limpo; `check-ui-standard.sh` sem achado; `orgContextGuard` verde.
- [x] **Conferência na tela** — publicado em `69b2ff11`. ✅ 19/10: o usuário gerou o título no
  PCO-011-017-0002 pelo botão — "funcionou e verifiquei o titulo no financeiro tambem!".

## Atenção (não muda nesta entrega)

Quando a nota de uma compra assim chegar, aprovar no Fiscal por **"vincular a título
existente"** (`nfeService.linkExistingTransaction`), não por "criar título"
(`createPayableFromInvoice`), que lança um título próprio da nota — duplicaria. O risco já
existia para qualquer pedido com parcelas; travar isso é trabalho à parte.
