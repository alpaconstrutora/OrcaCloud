# Comercial › Locações › Gestão de Unidades — aba "Inteligência" (regras de ajuste %)

## Pedido original

> agora a segunda parte. em comercial < Gestão de Locações < Gestão de Unidades < criar Nova
> aba chamada inteligencia:
> 1. trazer a tabela da aba empreendimentos < aba caracteristicas adicionais onde cada linha
> da tabela é um iten da coluna da tabela caracteristicas adicionais
> 2. criar duas colunas Validação e Faixa de ajuste
> 3. A coluna faixa de ajuste será um valor porcentual
> 4. A coluna Validacao é melhor explicada com exemplo:
> Carcacteristica área privatia / Validacao: área privativa:  > 15m2 / 5%
>
> Sessão atual · 2026-08-19

### Pedido posterior · 2026-09-03

> comercial < Gestão de Unidades < aba inteligencia: criar coluna com o nome da regra

**Feito.** A tabela ganhou a coluna **"Nome da regra"** como primeira coluna
(ordenável, entra na busca, aparece na confirmação de exclusão) e o painel de
criar/editar ganhou o campo correspondente, obrigatório.

- Migration `aplicar_20270918000028_rental_pricing_rules_nome.sql` — coluna
  `name TEXT` (nullable: nasceu depois das regras existentes) + backfill
  `name = attribute_label` para o que já estava cadastrado.
  **Aplicada** no banco remoto em 2026-09-03 (BLOCO 3: coluna=1, sem_nome=0,
  total_regras=4).
- `types/imovib.ts` — `RentalPricingRule.name?: string | null`.
- `services/rentalPricingRuleService.ts` — `name` no `RULE_COLS`; `duplicate`
  passa a sufixar `(cópia)` no nome, senão a cópia fica indistinguível da
  original na tabela.
- `components/RentalIntelligenceTab.tsx` — coluna, largura padrão (240),
  célula, ordenação, busca, campo no Sheet e validação. Regra antiga sem nome
  cai no rótulo da característica (`ruleDisplayName`).

## Decisões tomadas com o usuário

| Pergunta | Resposta |
|---|---|
| Já existe uma aba "Inteligência de Aluguéis" (modelo hedônico) nesse mesmo trilho. Como conviver? | Segunda aba, separada. A nova chama-se **"Inteligência"**; a existente foi renomeada para **"Inteligência Hedônica"** para não colidir. |
| Sobre qual valor o percentual incide e quando é aplicado? | **Entra como fator no motor hedônico** — não é botão que sobrescreve o aluguel por fora. Só produz efeito quando o usuário roda "Aplicar" na aba Inteligência Hedônica. Preserva a soma exata no modo "aluguel-alvo total". |
| Combinação de regras que casam na mesma unidade | **Somam** (5% + 3% = 8%, fator 1,08), não compõem. |
| Escopo das regras | **Por edifício** — cada edifício aberto em Gestão de Unidades tem seu próprio conjunto. |
| Cada linha da tabela representa o quê | **Uma regra**, não uma característica — permite mais de uma faixa na mesma característica (`área privativa > 15m² → 5%` e `área privativa > 30m² → 10%` como duas linhas). |

## Plano

1. **Migration** `supabase/migrations/aplicar_20270905000030_rental_pricing_rules.sql` — tabela `rental_pricing_rules` (organização, edifício sem FK — `commercial_properties` é tabela quente —, atributo, rótulo congelado, operador, valores, `adjust_pct`), RLS por organização, sem `anon`.
   **Feito quando:** aplicada manualmente no SQL Editor e o bloco de conferência (BLOCO 4) retorna os valores esperados.

2. **Tipos** `types/imovib.ts` — `RentalPricingRuleOperator`, `RentalPricingRule(+Insert/Update)`.
   **Feito.**

3. **Service** `services/rentalPricingRuleService.ts` (novo) — CRUD; `resolveUnitAttributes` (mescla atributos físicos do `Property`, a unidade do Empreendimento via `vw_unit_property_map` e os valores das Características Adicionais); `ruleMatches`/`computeAdjustmentPct` (avaliador puro, soma percentuais); `countMatchesByRule` (contador por regra, alimenta o texto "N unidades" ao lado do percentual na tabela).
   **Feito.**

4. **Motor hedônico** `services/rentalPricingService.ts` — `calculateUnitScore`/`calculateRents` ganham um parâmetro opcional de ajuste percentual (6º fator multiplicativo). Sem o parâmetro, o resultado é idêntico ao de antes.
   **Feito.**

5. **Aba nova** `components/RentalIntelligenceTab.tsx` (novo) — tabela Característica/Validação/Faixa de ajuste + Ações, no padrão completo do `ui_ux_guia_unificado.md` (toolbar §5.2, `useTableColumns`+`useResizableColumns`+autofit, §22 estado local pós-ação), painel lateral para criar/editar com seletor de operador filtrado pelo tipo do atributo.
   **Feito.**

6. **Wiring** `components/RentalsModule.tsx` — novo id `'intelligence'` no union `RentalsTab`; botão no trilho de Gestão de Unidades; bloco de conteúdo condicionado a `selectedBuildingId && currentBuilding && effectiveOrganizationId`; `handleApplyRentalPricing` agora carrega as regras do edifício, resolve os atributos das unidades e passa o ajuste (best-effort — se a resolução falhar, segue sem ajuste, não trava a precificação).
   **Feito.**

7. **Testes** `__tests__/rentalPricingRules.test.ts` (novo, 15 casos) — cada operador do avaliador, soma de regras, regra inativa ignorada, atributo ausente não casa, característica multi-select, percentual negativo, e retrocompatibilidade de `calculateRents` (com/sem o novo parâmetro dão o mesmo resultado; soma bate com o alvo no modo TARGET_TOTAL).
   **Feito — 15/15 passando.**

## Estado

- [x] Migration escrita (**pendente de aplicação manual no Supabase** — nunca `supabase db push`)
- [x] Tipos TS
- [x] Service de regras (CRUD + avaliador puro + resolução de atributos)
- [x] Motor hedônico com 6º fator, retrocompatível
- [x] Aba "Inteligência" (tabela + toolbar + autofit + CRUD)
- [x] Wiring no `RentalsModule.tsx` (aba, trilho, `handleApplyRentalPricing`)
- [x] `npx tsc --noEmit` limpo no projeto inteiro
- [x] `scripts/check-ui-standard.sh` sem violação nos arquivos novos/tocados por esta tarefa (dívida pré-existente e não relacionada foi encontrada em `RentalsModule.tsx`, fora do escopo — ver nota abaixo)
- [x] `__tests__/rentalPricingRules.test.ts`, `__tests__/migrationsPrefixo.test.ts`, `__tests__/orgContextGuard.test.ts` passando (32/32)
- [ ] **Verificação manual na tela** — pendente: exige a migration aplicada e login real, indisponíveis neste ambiente

### Nota — dívida de UI pré-existente, fora de escopo

`scripts/check-ui-standard.sh components/RentalsModule.tsx` acusa 13 ocorrências de §7 (`font-black`/`font-mono` dentro de `<td>`/card) nas linhas ~1630-1698, ~1750, ~2034 — um componente de **card de imóvel** (grid view), completamente fora do que esta tarefa tocou (`handleApplyRentalPricing`, o trilho de abas e o bloco de conteúdo da aba nova). Não foi corrigido: não faz parte do pedido e mexer nele seria escopo não pedido num componente maduro e usado em produção. Rodando o check isolado em `components/RentalIntelligenceTab.tsx`, o arquivo novo está 100% limpo.

### Ajustes finais (revisão pós-implementação)

Ao reconferir o trabalho após a compactação de contexto, dois gaps pequenos foram corrigidos:
1. **Import morto** — `isCharacteristicKey` era importado em `RentalIntelligenceTab.tsx` mas nunca usado (`tsc` não acusa porque `noUnusedLocals: false` no `tsconfig.json`). Removido.
2. **Rótulo interno divergente** — o botão do trilho foi renomeado para "Inteligência Hedônica" (item 6), mas o `<h2>` dentro do próprio painel (`RentalPricingIntelligencePanel.tsx:50`) continuava dizendo "Inteligência de Aluguéis". Corrigido para bater com o botão. Restam só 2 ocorrências do nome antigo, ambas em **comentário de código** (não afetam a UI) — deixadas como estão.

## Verificação

**Mecânica (executada):**
```bash
npx tsc --noEmit
bash scripts/check-ui-standard.sh components/RentalIntelligenceTab.tsx
npx vitest run __tests__/rentalPricingRules.test.ts __tests__/migrationsPrefixo.test.ts __tests__/orgContextGuard.test.ts
```
Todos passaram.

**Manual — pendente, a fazer após aplicar a migration:**
1. Aplicar `aplicar_20270905000030_rental_pricing_rules.sql` no SQL Editor do Supabase (bloco a bloco) e conferir o BLOCO 4.
2. Comercial › Locações → abrir um edifício → o trilho mostra **"Inteligência Hedônica"** e **"Inteligência"** como abas distintas.
3. Cadastrar `Área privativa > 15 m² → 5%`; conferir o contador "N unidades" ao lado do percentual.
4. Cadastrar uma 2ª regra na mesma característica (`> 30 m² → 10%`) — as duas coexistem como linhas separadas.
5. Cadastrar `Acessibilidade contém Elevador → 3%` numa unidade vinculada a uma unidade de Empreendimento com esse valor gravado na aba Características Adicionais.
6. Buscar, ordenar, esconder coluna, arrastar borda, clicar no autofit; recarregar (F5) e confirmar que tudo persistiu.
7. Editar / duplicar / excluir uma regra — a tabela reflete na hora, sem recarregar.
8. **Prova fim a fim:** anotar o aluguel de uma unidade que casa com duas regras (5% + 3%), rodar "Aplicar" na aba Inteligência Hedônica e conferir que o novo valor é o hedônico **× 1,08** — e que uma unidade sem regra nenhuma ficou com o valor hedônico puro.
9. No modo "aluguel-alvo total", conferir que a soma dos aluguéis continua batendo com o alvo informado.
10. Abrir o Portal do Corretor e confirmar que o valor exibido acompanhou (`syncActiveTableItems` já cuida da tabela ativa).
