# Dívidas — os quatro achados laterais do contrato 5772

> Frente: `divida-integridade-contrato` (REGRA #8) · branch `feat/divida-integridade-contrato`
> Continuação de `2026-09-09-divida-contrato-historico-emissao-zero.md`.

## Pedido original

Sessão de 2026-09-09. Depois de eu listar os quatro achados laterais que a
verificação do contrato 5772 produziu e perguntar se ele queria que eu atacasse
algum, o usuário respondeu, literalmente:

> ataque todos

Os quatro, como foram apresentados a ele:

> - `final_due_date` fica NULL mesmo com cronograma gerado;
> - `first_due_date` pode ser anterior a `signed_at` sem ninguém reclamar;
> - a geração aceitou parâmetros que furam a invariante Σ amortização =
>   principal (duas versões inativas, 67.948,09 e 58.178,13 contra 57.000);
> - `principal_released` preenchido sem nenhuma linha em `debt_disbursements`.

---

## Item 1 — `final_due_date` nunca é preenchido

**Diagnóstico.** `generateSchedule` e `rebuildScheduleFrom` terminam os dois em
`persistSchedule`, que grava o cronograma e as parcelas e **não toca no
contrato**. `debt_contracts.final_due_date` só existiria se o usuário digitasse
à mão em `DebtForm` (`DebtForm.tsx:406`) — e aí envelheceria na primeira
regeração. Efeito visível: "Vencimento final —" na aba Visão geral, com 44
parcelas na tela.

**O que muda.** `persistSchedule` passa a gravar `final_due_date` = maior
`dueDate` das linhas, **só para `kind === 'VIGENTE'`**. É o único ponto por onde
as duas rotas passam, então cobre geração e renegociação sem duplicar. O
CONTRATUAL não mexe: o contrato deve refletir a realidade vigente, não a
original.

**Como sei que terminou.** Teste que gera cronograma e confere que o contrato
recebeu o último vencimento; e, no banco, o 5772 com `final_due_date` = último
vencimento do cronograma ativo.

## Item 2 — 1º vencimento anterior à assinatura passa calado

**Diagnóstico.** `DebtForm.handleSave` valida contraparte e mútuo, mas nenhuma
data. O 5772 tem `signed_at` 2021-07-29 e `first_due_date` 2021-07-26 — três
dias **antes** da assinatura.

**O que muda.** Duas validações no mesmo estilo das existentes (`setErro` +
`return`, mensagem que diz o que fazer):
- 1º vencimento anterior à assinatura;
- vencimento final anterior ao 1º vencimento (o campo é digitável e, até o item
  1, ninguém o recalculava).

Bloqueiam de propósito: parcela vencendo antes de o contrato existir não é caso
de negócio, é erro de digitação — e é o tipo de dado que contamina prazo médio,
CET e projeção de caixa em silêncio.

**Como sei que terminou.** Teste da função pura de validação nos dois casos e
nos limites (datas iguais passam; data ausente não bloqueia).

## Item 3 — a invariante documentada é falsa e ninguém a verifica

**Diagnóstico — e ele não é o que parecia.** O comentário de `buildSchedule`
(`utils/debtAmortization.ts:220`) promete `Σ amortization === principal`. Isso é
**falso por construção** em dois caminhos legítimos do próprio motor:

- **juros capitalizados** na carência (`capitalizeInterest`) e no BULLET entram
  no saldo (`saldo = saldo + jurosBruto`), e a última parcela amortiza o saldo
  inteiro;
- **correção monetária** também entra no saldo (`saldo = saldo + correcao`).

Ou seja: as versões 9 e 12 do 5772 não expuseram um motor quebrado — expuseram
uma invariante mal escrita. A identidade verdadeira é

```
Σ amortização === principal + Σ juros capitalizados + Σ correção monetária
```

O defeito real é que **nada verifica identidade nenhuma**: um cronograma que não
fecha seria gravado e viraria título no Contas a Pagar.

**O que muda.**
1. `DebtInstallmentRow` ganha `capitalizedInterest` — o único termo da identidade
   que hoje não sobra em lugar nenhum (o motor zera `row.interest` ao
   capitalizar). Campo **não persistido**: `persistSchedule` lista as colunas uma
   a uma.
2. Nova `verificarFechamento(rows, principal)` exportada: confere a identidade e
   o saldo final zero, com tolerância de 1 centavo por parcela (o motor arredonda
   a cada linha).
3. `generateSchedule` e `rebuildScheduleFrom` chamam a verificação **antes** de
   persistir e recusam com mensagem clara.
4. O comentário da invariante é reescrito para a identidade verdadeira.

**Como sei que terminou.** Testes: SAC fecha; PRICE fecha; carência com
capitalização fecha pela identidade nova e **não** pela antiga; BULLET fecha; e
um cronograma adulterado é recusado.

## Item 4 — `principal_released` sem liberação registrada

**Diagnóstico.** `syncReleasedFromDisbursements` sai cedo quando não há liberação
(`if (liberacoes.length === 0) return`), então o valor digitado no formulário
nunca é confrontado. O 5772 tem R$ 57.000 liberados e **zero** linhas em
`debt_disbursements`.

**Decisão de escopo.** Digitar o valor liberado sem registrar a liberação é uso
legítimo do módulo (contrato simples, dinheiro em uma tranche só) — bloquear
seria errado. O que falta é **enxergar a diferença**. O aviso vai na aba
**Liberações**, onde o usuário já está olhando para isso, e não na tela toda:
banner permanente em contrato simples seria ruído.

**O que muda.** A aba Liberações passa a comparar Σ bruto das liberações com o
valor liberado do contrato e mostrar a divergência — inclusive no estado vazio,
que hoje diz apenas "Nenhuma liberação registrada".

**Como sei que terminou.** Print da aba com a divergência visível, e o
`check-ui-standard.sh` limpo no arquivo.

---

## Fora de escopo, mas achado aqui (decisão do usuário pendente)

⚠️ **A correção monetária parece cobrada duas vezes.** No motor, `correcao` é
somada ao saldo (e portanto será amortizada) **e** entra em
`row.total` como componente próprio. Em contrato indexado isso cobraria a
correção no caixa e de novo dentro da amortização. Não mexi: muda o valor de
parcela de todo contrato indexado, é decisão de produto, e não afeta o 5772
(taxa FIXA, correção zero). A verificação do item 3 deixa o efeito mensurável.

---

## Estado

- [x] Item 1 — `final_due_date` carimbado em `persistSchedule` (só VIGENTE);
      `DebtDetail` relê o contrato depois de gerar, senão a tela seguiria com o
      objeto antigo. Testes em `__tests__/debtFinalDueDate.test.ts`.
- [x] Item 2 — `verificarDatasDoContrato` (pura, exportada) ligada ao
      `DebtForm.handleSave`.
- [x] Item 3 — `capitalizedInterest` na linha, `verificarFechamento` exportada,
      chamada em `generateSchedule` e em `rebuildScheduleFrom` ANTES de
      persistir; comentário da invariante reescrito.
- [x] Item 4 — divergência entre Σ liberações e valor liberado visível na aba
      Liberações. Conferida no navegador (print `32-liberacoes.png`): o 5772
      mostra "Liberações somam R$ 0,00 e o contrato diz R$ 57.000,00 —
      diferença de R$ 57.000,00".

### Como cada portão foi provado

Os testes novos foram verificados invertendo o código de propósito:

| Adulteração | O que quebrou |
|---|---|
| `>=` → `>` no filtro de emissão (frente anterior) | 2 testes |
| carimbo de `final_due_date` removido | 2 testes |
| maior vencimento → última linha do array | 1 teste |
| amortização de uma parcela + 5.000 | `verificarFechamento` recusa |

Suíte completa: 216 arquivos, 3363 testes, verde. `tsc --noEmit` limpo.
`check-ui-standard.sh` limpo em `DebtDetail.tsx` e `DebtForm.tsx`.

## ⚠️ O 5º achado, agora MEDIDO — decisão do usuário pendente

A investigação do item 3 confirmou, com número, a suspeita registrada acima: **a
correção monetária é cobrada duas vezes** em contrato indexado.

Medição (100.000, 24 parcelas, SAC, juros 1% a.m., indexador 0,5% a.m.):

```
principal              100.000,00
Σ amortização          106.188,70
Σ correção monetária     6.188,70
Σ juros                 13.439,32
Σ total pago           125.816,72
Σ amortização − principal = 6.188,70  ← exatamente a Σ da correção
```

O saldo é corrigido (`saldo = saldo + correcao`), então a correção **já é paga
dentro da amortização** — e `row.total` a soma **de novo** como componente
próprio. Sobre R$ 100.000 em 24 meses, R$ 6.188,70 cobrados em duplicidade. E
como a emissão no Contas a Pagar cria uma linha por componente, a duplicidade
chega ao título.

**Não corrigido de propósito.** Há dois desenhos corretos possíveis — (a) manter
a correção capitalizada no saldo e tirá-la do `total`, ou (b) cobrá-la na
parcela e não somá-la ao saldo — e escolher entre eles muda o valor de parcela
de todo contrato indexado. É decisão de produto, não de implementação.
Não afeta o contrato 5772 (taxa FIXA, correção zero).
