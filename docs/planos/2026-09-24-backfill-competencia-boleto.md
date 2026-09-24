# Item B — backfill da competência dos títulos de boleto

## Pedido original

Sessão de 24/09/2026. Depois de eu deixar o item B em aberto:

> B fica em aberto
> o que fazer com as 14 despesas já dentro de rateio vivo, e o efeito em DRE e
> balancete de mover 508 títulos de competência: corrigir tudo
> Quando quiser, abro a frente: pode abrir

E, depois de eu medir o impacto e apresentar quatro escopos possíveis (B1 a B4),
recomendando B2:

> b1

**B1 = corrigir tudo.** O usuário escolheu com os números à vista.

## O que eu medi ANTES de executar, e apresentei

| Exercício | Despesa que chega |
|---|---|
| 2020 | R$ 209.294,59 (79 títulos) |
| 2017 | R$ 147.410,01 (108 títulos) |
| 2016 | R$ 55.735,63 (58 títulos) |
| demais (2014-15, 2018-19, 2021-25, 2028) | R$ 101.697,91 |
| **2026** | **−R$ 514.138,61** |

446 dos 527 títulos deslocam **mais de três anos**. Doze exercícios encerrados
passam a ter despesa nova.

Apresentei também o efeito contraintuitivo: **o backfill piora o condomínio**,
que era o motivo original. Antes, o rascunho de 08/2026 do Altavista batia
exato (14 despesas, R$ 1.144,95). Depois, as 13 que mudam de data se espalham
por 14 meses, de 2020 a 2028.

O usuário confirmou mesmo assim. Executado.

## Como foi feito

`supabase/migrations/aplicar_20270924000020_backfill_competencia_boleto.sql`,
em três blocos aplicados um por vez:

1. **Tabela de reversão** `boleto_backfill_competencia_20270924` — guarda a
   data anterior de cada título. Um `UPDATE` em 527 linhas de competência
   financeira sem isso é caminho sem volta. RLS ligada e **sem policy**:
   é tabela de operação, e ninguém autenticado precisa lê-la pelo PostgREST.
2. **Registro do estado anterior**, sem alterar nada. Conferido: 527 linhas,
   R$ 532.935,18, nenhuma aplicada.
3. **O UPDATE**, guiado pela tabela de reversão, com trava
   `t.transaction_date = b.transaction_date_antes` — se alguém editasse a data
   entre o bloco 2 e o 3, a linha ficaria de fora em vez de sobrescrever
   trabalho alheio.

Fora do escopo, de propósito: os **3 títulos sem vencimento** (não há data
melhor) e **1 com vencimento `20023-09-21`** — ano de cinco dígitos, que não
pode virar competência de coisa nenhuma. Ele precisa ser corrigido à mão.

## Resultado, conferido no banco

| Verificação | Resultado |
|---|---|
| Títulos movidos | **527 de 527**, zero pendentes |
| Ainda divergentes (janela plausível) | **0** |
| Despesas de condomínio fora do mês do vencimento | 109 → **1** (a do vencimento corrompido) |
| Vínculos de conciliação | **intactos** — `reconciliation_matches` liga por id, e `payment_date` não foi tocado |

**O caso que abriu tudo isto:** os boletos da MN Conservação, que estavam quase
todos em 17/09/2026, agora aparecem em 12/2025, 01, 02, 03, 05 e 07/2026 — os
meses reais.

**Distribuição por exercício, depois:** 2017 R$ 165.486,41 · 2020 R$ 211.515,49 ·
2026 caiu para R$ 29.982,82.

## Na tela

A aba Despesas do condomínio agora mostra o rótulo **"Rateada em 08/2026"** num
lançamento de 10/2024 — a marca de rateio cruzado que eu tinha construído em
`a7d0d64` e **não conseguira demonstrar** por falta de dado. O backfill criou
os casos, e ela funciona.

Zero erro de console.

## ⚠️ O que ficou pendente para o usuário decidir

1. **O rascunho de 08/2026 do Altavista está inconsistente**: 14 despesas
   espalhadas por 14 meses (2020 a 2028), e só 1 ainda em agosto. O
   `total_despesas` gravado (R$ 1.144,95) não corresponde mais a mês nenhum.
   Como é RASCUNHO, o caminho limpo é cancelar e refazer.
2. **O boleto com vencimento `20023-09-21`** segue com a data errada — é a
   única despesa de condomínio fora do mês. Precisa de correção manual.
3. **DRE e balancete de doze exercícios mudaram.** Se algum foi entregue a
   contador ou fisco, a reversão está pronta no fim da migration.
