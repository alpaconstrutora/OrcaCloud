# Vigência da locação: prazo em meses calcula o Fim da Vigência

## Pedido original

Sessão Claude Code de 22–23/11/2026 (VS Code), mensagem de 23/11/2026, com print da aba Contrato › Dados do contrato:

> ...Gerenciar Negociação > contrato > dados do contrato > Fim da Vigência: onde posso digitar a data do fim da vigencia ou escolher atraves de um botão chamado 12 meses logo acima deste campo.
> Aprimore esse botão que se limita a apenas 12 meses e crie um campo numero onde eu posso digitar a quantidade de meses e a data (Fim da Vigência:) é automaticamente calculada

### Decisões (perguntadas no plan mode, 23/11/2026)

- **Campo + atalhos**: campo numérico "Prazo (meses)" ao lado da data + atalhos 12 · 24 · 30 · 36 meses.
- **Fim acompanha o Início**: mudando o Início, se o fim era início + N meses, continua N meses (fim recalculado); fim digitado à mão fora de meses inteiros não é tocado.

## Contexto

Só existia o botão "12 meses" (+1 ano − 1 dia sobre o Início). Contrato de 24/30/36/60 meses exigia calcular a data à mão. O prazo **não** ganha coluna: deriva de `date` + `end_date`.

## Itens

1. **`utils/paymentPlan.ts` — `fimDaVigencia` / `mesesDaVigencia`** (reusam `somarMeses`/`somarDias`/`mesesEntre`).
   Pronto quando: testes em `__tests__/paymentPlan.test.ts` passam (23/09/2016 + 12 → 22/09/2017, + 30 → 22/03/2019, 31/01 + 1 → 28/02, ida-e-volta, fim arbitrário → null). ✅ 51/51.
2. **`components/DealModal.tsx` — bloco Fim da Vigência (locação)**: atalhos 12/24/30/36, campo "Prazo (meses)" que calcula o fim, Início que leva o fim junto (prazo lido no foco), campos desligados com motivo sem Início.
   Pronto quando: `check-ui-standard.sh` e `tsc` limpos; CI verde.
3. **Este arquivo.** ✅

## Andamento

- 23/11/2026: itens 1–3 implementados na frente `vigencia-prazo-meses`.
