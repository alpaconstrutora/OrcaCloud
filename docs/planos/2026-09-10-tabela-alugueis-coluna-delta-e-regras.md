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

---

## Pedido posterior — 2026-09-11

Mesma conversa, depois do relatório da entrega acima (que terminou listando duas
ressalvas). Mensagem do usuário, literal:

> implementar as Duas ressalvas:
> (a) não existe registro persistido de "quais regras aplicaram" no momento do Aplicar — a coluna avalia as regras ativas hoje contra os atributos atuais da unidade; se você editar uma regra depois de aplicar, a coluna reflete a regra nova, não a que gerou o preço;
> (b) no modo "aluguel-alvo total" o motor redistribui entre unidades, então a decomposição em R$ é aproximação (no modo R$/m² é exata)

### Diagnóstico

As duas ressalvas têm a mesma raiz: **o preço era o único vestígio do Aplicar.**
Tudo o mais — quais regras casaram, com que percentual, quanto cada uma pesou —
era reconstruído depois, a partir do preço e das regras de hoje. Daí (a) a
reconstrução mentir quando a regra muda, e (b) ela não ter como acertar no modo
de alvo total, onde o preço de uma unidade depende das regras de TODAS.

Sobre (b), o detalhe que decide o desenho: no alvo total, `+5%` numa unidade
**tira participação** de todas as outras. A base verdadeira não é `preço ÷ (1+%)`
— é a distribuição inteira refeita com os scores sem regra. Nas unidades de 0%
essa conta antiga dava zero justamente onde havia diferença. Só o motor, no
momento do cálculo, tem as duas distribuições na mão.

### Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 6 | `supabase/migrations/aplicar_20270921000012_pricing_rule_applications.sql` | Tabela nova: uma linha por (property_id, purpose) com regras congeladas (nome, pct, R$), `price`, `base_price`, `total_amount`, `total_pct`, `mode`, `applied_at/by`. RLS por `is_org_member`, sem policy anon. | Bloco 4 devolve tabela=1, rls=1, policies=4, anon=0, índices=2, trigger=1, unique=1; sonda com a chave anon responde 401. |
| 7 | `services/rentalPricingService.ts`, `services/pricingService.ts` | `calculateRentsWithSplit` / `calculatePricesWithSplit`: devolvem, junto dos preços, o contrafactual EXATO por unidade (distribuição refeita sem regras). As assinaturas antigas delegam. | Teste: no alvo total a base da unidade sem regra é 5000 e o total −238 (a conta antiga daria 0); Σ base = Σ price = alvo. |
| 8 | `services/rentalPricingRuleService.ts` | `allocateAmountByRules(total, applied)` reparte o total exato entre as regras; `splitPriceByRules` passa a ser explicitamente o caminho de ESTIMATIVA. | Testes de rateio, inclusive regras que se anulam (0%) → parcelas zero. |
| 9 | `services/pricingRuleApplicationService.ts` | `buildApplicationRows` (pura) + `listByBuilding` + `saveBatch` (upsert em `property_id,purpose`). | Teste: unidade sem regra também vira linha; nome/pct/R$ congelados. |
| 10 | `components/RentalsModule.tsx`, `components/SalesModule.tsx` | Aplicar passa a usar `computeAdjustmentBreakdown` + `*WithSplit` e grava o registro. Best-effort: falhar aqui não desfaz a precificação. | Playwright captura o POST real de `pricing_rule_applications` com 12 linhas. |
| 11 | `utils/pricingRuleCell.ts` + `components/PriceTableManager.tsx` | A célula passa a preferir o REGISTRO; sem ele, estimativa rotulada. Avisa (⚠ âmbar) quando as regras mudaram desde a aplicação ou o preço não é mais o aplicado; ⓘ cinza quando é estimativa. | Playwright: 4 cenários na tela, com os `title` corretos. |
| 12 | verificação | checks mecânicos + `tsc` + suíte completa. | Todos exit 0. |

### Decisões

- **Não é histórico.** Uma linha por unidade/finalidade, substituída a cada
  Aplicar. A pergunta é "o preço que está aí veio de quê?", e ela só tem uma
  resposta por vez. Histórico completo seria outra tabela, e ninguém pediu.
- **Unidade sem regra também ganha registro.** No alvo total ela pode ter mudado
  de preço por causa de regra em OUTRA unidade — "por que mudou sem regra minha?"
  é exatamente a pergunta que o registro responde. A célula mostra "Sem regra" e
  o Total da redistribuição.
- **R$ por regra é rateio proporcional, não contribuição marginal.** No alvo
  total o efeito de cada regra depende das outras; o rateio fecha a conta
  (Σ parcelas = total exato) e está dito no código. Regras que se anulam (0%)
  recebem parcela zero, e o resto aparece no Total como redistribuição.
- **A estimativa continua existindo** para unidade que nunca passou pelo Aplicar,
  agora rotulada como tal (ⓘ + `title`), em vez de se passar por medida.

### Estado

- [x] 6 — migration aplicada no banco remoto via `db query -f` (nunca `db push`); conferência do Bloco 4 OK; sonda anon → 401 `42501 permission denied`.
- [x] 7 — contrafactual exato nos dois motores, com as assinaturas antigas delegando.
- [x] 8 — `allocateAmountByRules` + `splitPriceByRules` redocumentada como estimativa.
- [x] 9 — `pricingRuleApplicationService` com `buildApplicationRows` pura.
- [x] 10 — os dois módulos gravam o registro no Aplicar.
- [x] 11 — célula com precedência registro › estimativa, e os dois avisos.
- [x] 12 — `check-ui-standard.sh` ✅, `check-system-projects.sh` ✅, `check-project-classification.sh` ✅, `segurancaMigrations` ✅, `migrationsPrefixo` ✅, `orgContextGuard` ✅, `tsc` ✅, suíte completa ✅.

Provas no navegador (Playwright, dev server da frente na porta 5297, login do
agente de leitura, 010 - Galeria Altavista):

1. **Leitura** (`regras-snapshot.js`, registro injetado por `page.route`, nada
   gravado): Loja 101 com registro que confere → sem aviso, `title` "Aplicado em
   10/09/2026 · modo aluguel-alvo total · Preço sem regras R$ 977,39 → aplicado
   R$ 1.124,00"; Loja 102 com pct gravado diferente do de hoje → ⚠ "regras
   mudaram desde a aplicação"; Loja 103 com preço da versão ≠ aplicado → ⚠
   "preço alterado depois da aplicação"; Loja 204 sem regra própria → "Sem
   regra" + Total 0% · −R$ 45,00 com a explicação da redistribuição. Linhas sem
   registro mostram ⓘ "estimativa".
2. **Escrita** (`regras-aplicar-payload.js`, todas as escritas a `/rest/v1/**`
   interceptadas — nenhum byte chegou ao banco): clicar "Aplicar Inteligência" no
   modo aluguel-alvo total (R$ 20.000) produz POST em
   `pricing_rule_applications?on_conflict=property_id,purpose` com **12 linhas**,
   `mode=TARGET_TOTAL`, Σ price = 19.998, Σ base = 20.000, Σ total = −2,00 (só
   arredondamento por unidade) — a soma-zero esperada da redistribuição.
   Achado que a decomposição antiga escondia: como as três regras casam com quase
   todas as unidades, o efeito real de cada uma no alvo total é de ~R$ 4, não os
   ~R$ 48 que a conta `preço ÷ (1+%)` exibia. Nesse modo, regra que vale para
   todo mundo quase não muda nada — e agora a coluna diz isso.
