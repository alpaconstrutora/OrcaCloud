# Descrição defasada dentro do rateio

## Pedido original (literal)

> a coluna descrição esta trazendo informacao atualizada e correta na tabela
> financeiro < aba despesas porem em financeiro < aba Rateio nao. verifique

## A causa

`condominio_rateio_despesas.descricao` é um **snapshot**, tirado quando o
rateio foi criado. A aba Despesas lê o lançamento **vivo**
(`internal_transactions.description`). As descrições boas foram escritas no
lançamento **depois** que os rateios nasceram, e o snapshot nunca soube.

Medido em 26/09/2026 sobre as 38 despesas de rateio da base:

```
snapshot diferente do lançamento vivo:   38 de 38
snapshot que ainda é nome de arquivo:     5
lançamento vivo que é nome de arquivo:    0
```

No rascunho do Galeria Altavista, lado a lado:

| snapshot no rateio | lançamento vivo |
|---|---|
| `ENERGISA SUL-SUDESTE - DISTRIBUIDORA DE ENER…` | `Consumo de Energia` |
| `MN CONSERVACAO DE ELEVADORES E COMERCIO DE P…` | `Manutençao do Elevador` |
| `Despesa sem descrição` | `Consumo de Energia` |

**Havia uma segunda diferença**, menor e no mesmo lugar: `listarDespesas`
chamava `rotuloDeDespesa(d.descricao)` com **um** argumento, enquanto a aba
Despesas e a prévia passam o credor como segunda chance
(`rotuloDeDespesa(desc, credor)`). Por isso a mesma despesa virava "Despesa sem
descrição" no rateio e mostrava o nome do fornecedor na aba.

## A regra nova (decisão do usuário)

| situação | descrição |
|---|---|
| **RASCUNHO** | segue o LANÇAMENTO (com o credor de reserva) |
| ao **FECHAR** | o texto vivo é gravado no snapshot — congela o que estava na tela |
| **FECHADO** · **CANCELADO** | segue o snapshot — é o documento que o condômino recebeu |

O congelamento no fechamento não é detalhe: sem ele, o síndico veria "Consumo
de Energia" na tela e o condômino receberia o PDF com o texto antigo.

**A decisão de qual usar fica no serviço**, não em quem chama: a tela de
detalhe e o relatório leem a mesma lista, e um deles escolhendo diferente daria
dois textos para a mesma despesa. O congelamento é best-effort — falhar ali não
pode impedir o fechamento, que é o que gera o número do documento.

## A edição passou a corrigir o lançamento

Decisão do usuário: **uma descrição, um lugar**. Clicar na célula dentro de um
rascunho agora escreve em `internal_transactions.description` — a correção vale
em Contas a Pagar, na aba Despesas, nos outros rateios e no portal. Antes valia
só dentro daquele rateio, e era por isso que o mesmo boleto aparecia com dois
textos em duas telas.

Despesa **sem** `transaction_id` (rateio montado à mão) continua gravando no
snapshot: é o único lugar que existe.

⚠️ Sem essa mudança, a edição teria sido silenciosamente anulada: em rascunho o
texto vivo ganha, e a correção gravada no snapshot nunca mais apareceria.

## Prova

A mesma despesa, nas duas telas, no servidor da frente (Galeria Altavista,
08/2026):

```
aba Despesas (lançamento vivo):   · Consumo de Energia
dentro do rateio (Rascunho):      · Consumo de Energia
as descrições do rateio estão TODAS na aba Despesas: true
```

Antes, a segunda linha era `ENERGISA SUL-SUDESTE - DISTRIBUIDORA DE ENER…`.

Testes: `__tests__/condominioDescricaoDoRateio.test.ts` (12) — rascunho segue o
lançamento, nome de arquivo cai no credor, despesa sem lançamento mantém o
snapshot, fechado e cancelado não se reescrevem, `fechar` congela, a edição
escreve no lançamento e alcança os outros rascunhos, e descrição vazia é
recusada antes de qualquer escrita.

Os 2 testes que dependem do comportamento novo foram **provados falhando** com
a regra antiga (`seguirLancamento = false`) antes de valerem como portão.

Portões: `tsc --noEmit` 0 · `vitest run` 5483 passaram / 0 falhas · os cinco
`check-*.sh` · `npm run build`.

## O que NÃO foi feito

Os 5 rateios **cancelados** da base continuam com o snapshot antigo. É o
correto pela regra acima — histórico não se reescreve —, e eles não aparecem
para o condômino.
