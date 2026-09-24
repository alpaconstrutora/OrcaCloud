# Rescaldo do backfill: o boleto corrompido e o rascunho desmontado

## Pedido original

Sessão de 24/09/2026. Eu havia deixado três pendências ao fim do backfill
(`a111b67f`); o usuário respondeu item a item:

> 1. pode fazer voce mesmo
> 2. nao encontrei.
> 3. pode corrigir

- **1** — cancelar e refazer o rascunho de rateio do Altavista → fiz
- **2** — o usuário não achou o boleto com vencimento corrompido → localizei
- **3** — "pode corrigir" → corrigi o boleto

## 2 e 3 — o boleto com ano de cinco dígitos

**Onde estava:** boleto **nº 107**, organização Alpa Construtora, R$ 89,88,
arquivo `download (15).pdf`, capturado em 18/06/26 16:24, status `aprovado`.
`vencimento = 20023-09-21`.

**O que é o documento:** uma **DANF3E da ENERGISA** — nota fiscal de energia
elétrica, não um boleto. Sem linha digitável, daí `metodo_extracao: pdf_text` e
`confidence_score: 0`.

**A data foi digitada, não extraída.** O texto do PDF tem exatamente três
datas — `11/09/2023`, `11/07/2023`, `10/08/2023` — e **nenhuma delas é 21/09**.

**A correção, e por que é segura:** `20023` → `2023`, tirando o zero a mais e
preservando dia e mês. É reparo mecânico da string, não palpite sobre o
documento. E cai na **mesma competência** que a data do próprio documento
(11/09/2023): setembro/2023. Para efeito de competência — que é o que o rateio
e o DRE usam — os dois valores dizem a mesma coisa. O dia (21 contra 11) ficou
como estava: mexer nele seria escolher pelo usuário, sem base no documento.

O título que nasceu dele acompanhou (`transaction_date = 2023-09-21`, vindo de
23/08/2026) e foi registrado na **mesma tabela de reversão** do backfill, para
a volta ser uma só.

## 1 — o rascunho de rateio que o backfill desmontou

Rateio do **010 - Galeria Altavista**, competência 08/2026. Tinha 14 despesas
somando R$ 1.144,95, todas em agosto; depois do backfill elas voltaram aos
meses reais e se espalharam por **14 meses** (04/2020 a 01/2028), sobrando
**uma** em agosto.

**Cancelado por migration** — seguro porque não tinha número (`number` nulo:
número só nasce no fechamento), não gerou cobrança e nenhuma das 12 cotas virou
recebível.

**Refeito pela TELA, não por SQL.** Criar rateio é `previa()` + `salvar()`,
incluindo a distribuição em centavos por maior resto, que tem teste próprio.
Reimplementar isso num `INSERT` seria duplicar regra de negócio no lugar mais
difícil de conferir. Roteiro:
`c:/tmp/pwtest/refazer-rateio-altavista.js` — o único desta série que **escreve**
de propósito, com cada escrita registrada:

```
POST condominio_rateios
POST condominio_rateio_itens
POST condominio_rateio_despesas
```

Três inserts, exatamente os esperados. Zero erro de console.

## Estado — 24/09/2026: concluído

| Verificação | Antes | Depois |
|---|---|---|
| Boletos com vencimento absurdo | 1 | **0** |
| Despesas de condomínio fora do mês do vencimento | 1 | **0** |
| Rascunho Altavista 08/2026 | 14 despesas em 14 meses, R$ 1.144,95 | **1 despesa, 1 mês, R$ 72,14** |
| Diferença do rateio novo | — | **fecha exato** (72,14 = 72,14), 12 cotas |

## ⚠️ O que o backfill deixou, e não é erro

As 13 despesas que saíram de agosto **não sumiram**: foram para os meses reais
delas, entre 2020 e 2028, e lá não existe rateio. A aba Despesas as mostra como
**"Fora de rateio"**, mês a mês.

Isso é consequência esperada de B1, não defeito. Ratear cada um desses meses é
decisão do condomínio — são contas de energia de anos anteriores, e cobrá-las
do condômino de hoje é escolha de gestão, não de sistema.
