# Tabela de aluguéis — coluna Δ e coluna de regras da Inteligência

## Pedido original

Sessão de 2026-09-10 (Claude Code, frente `tabela-alugueis-regras`):

> comercial < Gestão de Locações < Gestão de Unidades < aba tabela de precos:
> 1. existe uma coluna depois da coluna status, chamada delta, e esta vazia. verificar a funcionalidade desta coluna.
> 2. inserir coluna com o resulta das regras criadas na aba Inteligente, informar quais regras foram aplicadas e o valor de cada ajuste e total

## Diagnóstico (item 1)

`components/PriceTableManager.tsx` — coluna `delta` (label "Δ"): mostra a variação
percentual de **"Preço nesta versão"** sobre **"Preço vigente"** (`rental_price`
da unidade). Quando as duas são iguais o código renderiza `—`.

Medido no banco (2026-09-10): as duas tabelas ativas (Galeria Avenida 494 v2,
Galeria Altavista v4) têm **100% dos itens iguais ao vigente** — é assim por
construção: ativar grava `rental_price` a partir da versão, e a Inteligência
Hedônica sincroniza a versão ativa ao gravar `rental_price`. Como a tela abre
sempre na versão mais recente (a ativa), a coluna aparece vazia em todas as
linhas. Nas versões `draft`/`superseded` do mesmo prédio, 0 de 12 itens são
iguais ao vigente — ali a coluna mostra o percentual.

Não é bug de cálculo; é (a) rótulo ilegível ("Δ" sem explicação) e (b) `—`
para "sem variação", que se confunde com "sem dado".

## Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/PriceTableManager.tsx` | Coluna `delta`: label "Variação"; quando há vigente e a diferença é zero mostra `0,0%` (cinza) em vez de `—`; `—` só sem base; `title` na célula com os dois valores. | Na versão ativa toda linha mostra `0,0%`; num rascunho reajustado mostra o percentual. |
| 2 | `services/rentalPricingRuleService.ts` | Novas funções puras `computeAdjustmentBreakdown(attrs, rules)` (por unidade: regras ativas que casaram, com pct de cada, e total) e `splitPriceByRules(price, breakdown)` (base sem regras = preço ÷ (1 + total/100); R$ de cada regra = base × pct/100; total R$ = preço − base). | Testes em `__tests__/rentalPricingRules.test.ts` passando, incluindo `base + Σ ajustes = preço`. |
| 3 | `components/PriceTableManager.tsx` | Nova coluna `rules` ("Regras da Inteligência"): carrega regras do prédio + atributos das unidades (mesmo resolvedor que a Hedônica usa), lista por linha cada regra aplicada com pct e R$, e o total; "Sem regra" quando nenhuma casa; `—` quando o prédio não tem regra. Ordenável pelo total %. | Coluna visível na Tabela de aluguéis; unidade com regra mostra nome/pct/R$ e total; unidade sem regra mostra "Sem regra". |
| 4 | `components/RentalsModule.tsx`, `components/SalesModule.tsx` | Passam `properties` ao `PriceTableManager` (a coluna precisa dos atributos das unidades). | Sem `properties` a coluna degrada para `—` (não quebra). |
| 5 | verificação | `check-ui-standard.sh` no arquivo, `tsc`, suíte de regras. | Todos com exit 0. |

## Decisões

- **O valor em R$ é decomposição do preço nesta versão**, não histórico do que a
  Hedônica gravou: as regras entram no motor como fator `1 + total/100` sobre o
  score; no modo R$/m² o preço sem regras é exatamente `preço ÷ (1 + total/100)`.
  No modo aluguel-alvo total o motor redistribui entre unidades, então a
  decomposição é aproximação. Não existe registro persistido de "quais regras
  aplicaram" no momento do Aplicar — a coluna avalia as regras **ativas hoje**
  contra os atributos **atuais** da unidade (mesmo avaliador `ruleMatches`).
- Coluna serve os dois modos (`sale`/`rental`) porque o componente é o mesmo;
  `purpose` da ponte com empreendimento segue o modo.

## Estado

- [x] 1 — `PriceTableManager.tsx`: label "Variação", `0,0%` quando sem diferença, `—` só sem vigente, `title` com os dois valores; percentuais em pt-BR (KPI "Variação" também).
- [x] 2 — `computeAdjustmentBreakdown` + `splitPriceByRules` em `rentalPricingRuleService.ts`; 6 testes novos em `__tests__/rentalPricingRules.test.ts` (21/21).
- [x] 3 — coluna `rules` ("Regras da Inteligência") com nome/%/R$ por regra e Total; ordenável.
- [x] 4 — `RentalsModule.tsx` e `SalesModule.tsx` passam `properties`.
- [x] 5 — `check-ui-standard.sh` ✅, `check-system-projects.sh` ✅, `check-project-classification.sh` ✅, `tsc` ✅, `orgContextGuard` ✅.

Verificado no navegador (Playwright, dev server da frente, porta 5293, login do
agente de leitura) em 010 - Galeria Altavista, versão ativa v4: as 12 linhas
mostram `0,0%` em Variação e a coluna Regras lista "Área privativa +5% · R$ 48,87 /
Vista +5% / Posição +5% / Total +15% · R$ 146,61" (Loja 101, aluguel R$ 1.124,00 —
base sem regras R$ 977,39); Sala 203 (Lateral) mostra só "Área privativa" e Total
+5%. Nas versões v1/v2 (rascunho, preços zerados) Variação mostra −100,0% e as
parcelas R$ 0,00 — coerente com o dado. A regra "Acessibilidade" (`carac:` contém
"elevador") não casou com nenhuma unidade porque nenhuma tem a característica
preenchida — comportamento esperado.
