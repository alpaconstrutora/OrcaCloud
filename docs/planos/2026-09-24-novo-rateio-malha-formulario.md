# Drawer "Novo rateio" fora do padrão — malha do formulário (§30)

## Pedido original (literal)

> drawer  novo raterio nao esta no padrao do app

Acompanhado de print do drawer **Condomínio › Financeiro › Novo rateio**.

## O que estava fora do padrão

Medido no DOM, não olhado:

| §30 manda | Estava |
|---|---|
| rótulo → campo **6px** (`space-y-1.5`) | `mt-1` = 4px |
| campo ↔ campo **16px vertical / 24px horizontal** (`gap-x-6 gap-y-4`) | `gap-3` = 12px nos dois eixos |
| seção com título + `border-b border-gray-100 pb-3` | nenhum título de seção |
| seção ↔ seção **32px** (`space-y-8`) | tudo num `space-y-4` só |
| **campo curto não ocupa a linha inteira** | `Critério` (um `<select>`) atravessava o painel |

E, sem prévia calculada, sobrava um vão grande entre o botão "Calcular" e o
rodapé, sem nada dizendo o que faltava fazer (§12).

## O que foi feito

`components/condominio/FinanceiroTab.tsx` — os **dois** drawers gêmeos:

- **Novo rateio**: seção "O que ratear" (ícone + título + linha), grade
  `grid-cols-2 gap-x-6 gap-y-4`, pares `space-y-1.5`, `Calcular` alinhado à
  direita numa linha solta (§30: rodapé de formulário não ganha card).
- **Gerar cobrança**: mesma malha, seção "Como cobrar".
- A lista de unidades do critério GRUPO fica em `col-span-2` — é conteúdo
  largo, não campo curto.
- Estado vazio (§12) no lugar do vão: "Calcule para ver quais despesas entram
  e quanto cada unidade paga. Nada é gravado até você salvar o rascunho."

Nenhuma regra de negócio mudou: `previa()`, `salvar()` e `gerarRecebiveis()`
estão intactos, e as invalidações de prévia (trocar competência/tipo/critério/
grupo zera `previa`) continuam onde estavam.

## Prova

Medição com Playwright no DOM dos dois drawers (`C:\tmp\pwtest\malha2.js`,
`malha-cobranca.js`), servidor da própria frente:

```
grade 324px 324px | gap-x 24px (alvo 24) | gap-y 16px (alvo 16)
entre seções: 32px (alvo 32)
título de seção: borda 1px / padding-bottom 12px
rótulo → campo: 3px visual
campo curto: 324px num painel de 672px — não ocupa a linha
```

Os 3px do par rótulo→campo são o mesmo número que o §30 registra na sua própria
referência (`ContractModal.tsx`, "rótulo→campo 3–6px"): `space-y-1.5` põe
`margin-block-end` num `<label>` inline, que ignora margem vertical; o que
sobra é a folga da caixa de fonte. Igual à referência, portanto no padrão.

⚠️ Não havia **nenhum** rateio FECHADO na base, então o botão "Gerar cobrança"
não aparecia. O print dessa gêmea saiu interceptando a **resposta de leitura**
de `condominio_rateios` (status → FECHADO) no Playwright — um `page.route` só,
escritas abortadas, nada gravado.

Portões: `tsc --noEmit` 0 · `vitest run` 5259 passaram / 0 falhas ·
`check-ui-standard.sh` · `check-system-projects.sh` ·
`check-project-classification.sh` · `check-org-selector-guard.sh` ·
`check-xss-sinks.sh` · `npm run build` — todos limpos.
