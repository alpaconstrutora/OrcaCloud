# Boletos a Pagar — botão Excluir ativo também para aprovados

## Pedido original

Sessão de 24/09/2026:

> financeiro < Boletos a Pagar: botao excluir nao esta ativo

Na resposta, o diagnóstico mostrou que o botão estava desligado de propósito
(`disabled={b.status !== 'rascunho'}`) e o usuário escolheu, entre três opções:

> **Permitir excluir aprovado também** — Excluir passa a valer para rascunho e
> aprovado, estornando/apagando junto o título financeiro gerado na aprovação.
> Pago e cancelado continuam protegidos.


### Pedido posterior — 24/09/2026, mesma sessão

Depois de publicado o primeiro commit, o usuário voltou:

> boleto #0010 continua com botão excluir desativado. por que?

Duas causas: o commit ainda não estava no ar, e o #0010 está `pago` — que a
primeira rodada mantinha protegido. Perguntado se queria liberar o pago, o
usuário escolheu:

> **Sim, liberar pago também** — definir o que acontece com a baixa e a
> conciliação do título antes de apagar.

## O que a medição mostrou sobre o "pago" (24/09/2026)

| | |
|---|---|
| boletos `pago` | 519 |
| …com título no razão | 434 |
| …**sem título nenhum** | **85** (o #0010 é um deles) |
| …com conciliação bancária real | **7** |
| …em rateio de condomínio / com pagamento a fornecedor | 0 / 0 |

Isso derrubou a trava por status do título que a primeira rodada usava. `pago`
no boleto é MARCAÇÃO: `marcarPago` grava `CONCILIATED`/`PAGO` no título por
conta própria, sem linha de extrato do outro lado — 517 títulos `CONCILIATED`
para 7 conciliações de verdade. Barrar por status recusaria ~510 exclusões
legítimas **e ainda assim não protegeria nada**. Quem protege é o vínculo
concreto: `reconciliation_matches`, `condominio_rateio_itens`,
`supplier_payments`.

## Itens — 2ª rodada (pago)

5. **`services/boletoService.ts`** — `podeExcluir` passa a aceitar `pago`;
   `desfazerLancamento` perde o gate por status do título e passa a decidir só
   pelos três vínculos; `excluir` chama o desfazimento para todo status que
   não seja rascunho. **Pronto quando**: os casos de `excluir pago` passam,
   incluindo o pago sem título (os 85) e a recusa do pago conciliado.
   ✅ feito — e o teste pegou um defeito real: `excluir` chamava o desfazimento
   só para `aprovado`, então um pago sairia deixando o título de pé.

6. **UI (`BoletoManager.tsx`, `BoletoFormModal.tsx`)** — confirmação própria do
   pago, dizendo que o valor **sai do realizado**; `mensagemDeExclusao` concentra
   os três textos; o lote conta pagos à parte. **Pronto quando**:
   check-ui-standard sai 0 nos dois arquivos. ✅ feito.

7. **`cancelado` continua fora**, e de propósito: cancelar é a alternativa que
   preserva o histórico; se o cancelado pudesse ser excluído, cancelar deixaria
   de significar alguma coisa. Registrado no código.

## Publicação

- 1ª rodada (rascunho + aprovado): commit `658042c`, provado no domínio por
  `scripts/conferir-producao.sh`.

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
