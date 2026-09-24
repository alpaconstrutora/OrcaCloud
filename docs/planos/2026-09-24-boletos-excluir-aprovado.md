# Boletos a Pagar — botão Excluir ativo também para aprovados

## Pedido original

Sessão de 24/09/2026:

> financeiro < Boletos a Pagar: botao excluir nao esta ativo

Na resposta, o diagnóstico mostrou que o botão estava desligado de propósito
(`disabled={b.status !== 'rascunho'}`) e o usuário escolheu, entre três opções:

> **Permitir excluir aprovado também** — Excluir passa a valer para rascunho e
> aprovado, estornando/apagando junto o título financeiro gerado na aprovação.
> Pago e cancelado continuam protegidos.

## Diagnóstico

O botão nunca esteve quebrado. A trava existia em três camadas — UI, handler e
serviço — e o motivo era real: `aprovarECriarInvoice` cria, além do boleto
aprovado, uma nota (`invoices`) e um título no razão (`internal_transactions`
com `source_system='BOLETO'`, `reference_id = boleto.id`). Apagar só a linha do
boleto deixaria título órfão em Contas a Pagar.

No banco em 24/09: 519 `pago`, 288 `rascunho`, 280 `aprovado`, 60 `cancelado` —
ou seja, em ~75% das linhas o ícone aparecia cinza.

FKs que apontam para o título e que decidem o que é seguro apagar:

| tabela | coluna | ON DELETE | consequência de apagar o título |
|---|---|---|---|
| `reconciliation_matches` | `internal_transaction_id` | RESTRICT | banco recusa — mas o erro cru não explica nada |
| `condominio_rateio_itens` | `transaction_id` | SET NULL | **despesa sairia do rateio em silêncio** |
| `supplier_payments` | `transaction_id` | SET NULL | pagamento ficaria sem título |
| `boletos_auditoria` | `boleto_id` | CASCADE | histórico do boleto some junto |

A alçada não tem tabela própria (`approvalService` grava colunas na própria
`internal_transactions`), então apagar o título leva a solicitação junto.

## Itens

1. **`services/boletoService.ts`** — `excluirRascunho` vira `excluir`, com
   `podeExcluir(status)` (rascunho|aprovado) e `desfazerLancamento`, que remove
   título + nota e recusa, com motivo, quando o título já tem vida própria
   (status ≠ `PENDING`, conciliação, rateio de condomínio, pagamento a
   fornecedor). **Pronto quando**: `__tests__/boletoExcluir.test.ts` passa,
   incluindo os casos de recusa que provam que nada é apagado antes da recusa.
   ✅ feito.

2. **`components/BoletoManager.tsx`** — célula da tabela, card e os dois
   handlers (individual e lote) passam a usar `boletoService.podeExcluir`; a
   confirmação avisa que o título e a nota vão junto; a falha em lote passa a
   mostrar o MOTIVO da recusa em vez de só contar falhas. **Pronto quando**:
   `bash scripts/check-ui-standard.sh components/BoletoManager.tsx` sai 0 e o
   typecheck passa. ✅ feito.

3. **`components/BoletoFormModal.tsx`** — o botão Excluir do rodapé aparece para
   rascunho e aprovado, com confirmação específica do aprovado. **Pronto
   quando**: check-ui-standard sai 0 e o typecheck passa. ✅ feito.

4. **Auditoria de exclusão** — a chamada `registrarAuditoria(..., 'exclusao')`
   rodava DEPOIS do delete, e `boletos_auditoria.boleto_id` é CASCADE: o insert
   violava a FK e o erro era engolido por `registrarAuditoria`. Nunca existiu
   registro de exclusão. Removida, com comentário explicando o que seria preciso
   para ter um (tabela sem FK para `boletos`). ✅ feito.

## Fora de escopo

- Recuperar boleto excluído (não há lixeira).
- Registro de auditoria de exclusão que sobreviva ao CASCADE — precisaria de
  tabela nova; anotado no item 4.
