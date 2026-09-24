# Boleto: a data de competência do título, e o guarda da data

## Pedido original

Sessão de 24/09/2026:

> verifque por que os boletos lançamentos no condomínio referentes ao
> fornecedor MN conservaçao... estao quase todos na mesma data 17/09/2026

Depois do diagnóstico, escolhendo entre as quatro opções que ofereci:

> A + D agora e trataria B como frente própria, conforme sua sugestao

- **A** — boleto novo nasce com `transaction_date = vencimento` (hoje como reserva)
- **D** — barrar data absurda na captura
- **B** — backfill dos 532 títulos existentes → **frente própria, não feita aqui**

## O diagnóstico

`services/boletoService.ts` gravava, ao aprovar o boleto:

```js
const hoje = new Date().toISOString().slice(0, 10);
transaction_date: hoje,     // ← o dia da APROVAÇÃO
due_date: boletoRow.vencimento ?? null,
```

**O que aconteceu com a MN Conservação:** os boletos foram capturados entre
17/06 e 02/07/2026, ao longo de uma sessão real (14:19, 14:29, 14:43, 14:47…).
Os títulos foram todos criados em **17/09/26 às 16:28** — no mesmo minuto.
Alguém aprovou ~43 boletos pendentes de uma vez, e cada um foi carimbado com a
data daquele clique. Os vencimentos reais vão de 10/01/2020 a 10/11/2023.

**Escala:** 532 dos 634 títulos de boleto (**84%**) têm `transaction_date` igual
à data da captura; 508 (**80%**) foram lançados mais de 30 dias depois do
vencimento.

**Por que dói no condomínio:** o rateio e a aba Despesas recortam por
`transaction_date`. Um boleto de 2021 caía na competência de setembro/2026 — e o
condômino seria cobrado hoje por despesa de cinco anos atrás. Das 139 despesas
de condomínio, **109 (R$ 51.519,95)** estavam num mês diferente do vencimento.

**A data certa não estava disponível:** a tabela tem `data_documento`, mas ela
está **nula nos 1.147 boletos** — a captura nunca a preenche. A única data do
documento é o `vencimento` (810 de 1.147, 71%).

**E um dado corrompido:** um boleto com vencimento **`20023-09-21`** — ano de
cinco dígitos. Veio de um PDF sem linha digitável (`metodo_extracao: pdf_text`,
`confidence_score: 0`), então a data saiu do texto ou da digitação. Nenhum
guarda no caminho: `<input type="date">` aceita ano até 275760, e o Postgres
guarda o ano 20023 numa coluna `date` sem reclamar.

## O que foi feito

### A — a data de competência (`services/boletoService.ts`)

`transaction_date` passa a ser o **vencimento**, com `hoje` de reserva quando o
boleto não tem vencimento (29% dos casos).

Medido no banco: com a regra nova, as despesas de condomínio fora do mês do
vencimento vão de **109 para 0**.

⚠️ **Não reescreve o passado.** Os 532 títulos já gravados seguem com a data da
captura — esse é o item **B**, e tem efeito em DRE, balancete e nos rateios já
feitos (14 dessas despesas já estão num rateio vivo).

### D — o guarda da data (`utils/febrabanRules.ts` + duas vias de escrita)

`vencimentoPlausivel(iso, referenceDate)` novo, na **mesma janela** que
`resolverFatorVencimento` já usa para desempatar ciclos (piso 07/10/1997, teto
5 anos à frente) — uma definição só de "data plausível de boleto", para o
desempate e a validação não discordarem.

Aplicado nas duas vias por onde um vencimento entra:

| Via | Comportamento | Por quê |
|---|---|---|
| Extração (`extractionToColumns`) | data implausível vira `null` **+ aviso** em `erros_validacao` | valor e beneficiário podem ter vindo certos; perder o boleto inteiro por causa da data seria pior |
| Formulário (`associar`) | data implausível é **recusada** | quem digitou está olhando para o campo e pode corrigir |

Mais `min`/`max` nos dois `<input type="date">` de `BoletoFormModal` — barreira
de navegador para o usuário não digitar e só então tomar o erro. O service
continua sendo o guarda de verdade.

## Estado — 24/09/2026: concluído

| Verificação | Resultado |
|---|---|
| Efeito de A, medido no banco | despesas de condomínio fora do mês do vencimento: **109 → 0** |
| `vencimentoPlausivel` | **9 testes**, incluindo o caso real `20023-09-21` |
| Boleto antigo legítimo continua passando | ✅ 2017 e 2020 aceitos — atraso é o caso normal |
| Limites no formulário | ✅ `min=1997-10-07 max=2031-12-31` |
| Tela de Boletos a Pagar | ✅ 1.118 boletos, zero erro de console |

Mecânica: `tsc` limpo · `build` limpo · **5.249 testes** ·
`check-ui-standard.sh` limpo em `BoletoFormModal.tsx` · os 4 scripts de regra OK.

## Fica em aberto — item B

Backfill dos 532 títulos com `transaction_date` = data da captura. Decisões que
ele exige, e que não são minhas: o que fazer com as **14 despesas já dentro de
rateio vivo**, e o efeito em DRE e balancete de mover 508 títulos de competência.
