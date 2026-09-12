# Venda de Unidades › Inteligência de Precificação: só as regras da aba Inteligência

## Pedido original

Sessão de 2026-09-12 (Claude Code, frente `venda-precificacao-so-regras`).
Mensagem do usuário, literal:

> comercial < venda de unidades <Inteligência de Precificação:
> para calculo utilizar apenas as regras da aba Inteligência

### Pedido posterior · mesma sessão, 2026-09-12

> 1. mover  o botao "aplicar inteligencia" e os campos (VGV Alvo do Projeto (R$); Incluir unidades permutadas no VGV) na aba inteligencia

Chegou depois da primeira entrega estar pronta (modal novo, só com esses dois
campos). É o mesmo passo que Locações deu em 12/09
(`2026-09-12-inteligencia-aba-unica.md`): o modal deixa de existir em Venda, o
botão sai da toolbar, e o conteúdo vira bloco compacto no topo da aba
Inteligência, acima da tabela de regras.

## Leitura do pedido

É o mesmo corte que Locações recebeu em 11/09
(`2026-09-11-hedonica-so-regras-da-aba-inteligencia.md`), agora do lado de
Venda. Aquele plano deixou Venda de fora de propósito ("se a mesma
simplificação for desejada lá, é outro pedido") — este é o pedido.

Hoje o preço de cada unidade em Venda sai de
`área × andar × posição × vista × orientação solar × regras`, com os quatro
pesos do meio embutidos no modal "Inteligência de Precificação" (andar como
slider, posição e sol como campos, vista sem campo mas pesando). Passa a sair
de **`área × regras da aba Inteligência`**, e de mais nada: quem quiser
valorizar pavimento, posição ou vista cria uma regra na aba, onde o critério
fica explícito e aparece na coluna "Regras da Inteligência".

Consequência prática que vale registrar: com o modelo hedônico fora, a coluna
"Regras da Inteligência" (Tabela de preços) passa a explicar o preço
**inteiro** — `base` é a participação pura por área e `total` é o que as
regras somaram. Antes, metade do porquê (pesos embutidos) não aparecia em
lugar nenhum.

## Escopo

- **Venda** (`SalesModule`, `pricingService`, o modal de precificação).
- **Imovib NÃO muda.** `ImovibSalesMapTab` usa o mesmo modal e o mesmo motor
  para precificar instâncias de um estudo de viabilidade, que não têm regras da
  aba Inteligência (as regras são por `building_property_id` do Comercial). O
  caminho hedônico continua existindo só para ela, com nome próprio
  (`calculateHedonicPrices`) e o modal antigo — comportamento idêntico.
- **Locações não muda** (já está assim desde 11/09).
- **O modal deixa de existir em Venda** (pedido posterior): o botão "Aplicar
  Inteligência" e os dois campos que restaram vivem num bloco compacto no topo
  da aba Inteligência, espelho do `RentalPricingIntelligencePanel` de Locações.
  O botão "Inteligência de preços" sai da toolbar de escopo.

## Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `types/imovib.ts` | Novo `SalesPricingConfig { target_vgv, include_exchanged? }` — é o que o motor de Venda consome. `HedonicPricingConfig` fica, marcado como **só Imovib**. Comentários que diziam "Venda segue com o modelo hedônico" corrigidos. | `tsc` exit 0; `grep "modelo hedônico"` só acha Imovib/histórico. |
| 2 | `services/pricingService.ts` | `calculateUnitScore(property, adjustPct)` = área × (1 + pct/100). `calculatePrices`/`calculatePricesWithSplit` recebem `SalesPricingConfig`. O cálculo hedônico antigo vira `calculateHedonicPrices(properties, HedonicPricingConfig)`, intocado na conta, só para Imovib. | Testes novos: atributos não mudam o preço; regra é o único ajuste; `include_exchanged` continua mandando; Imovib hedônico dá o mesmo número de antes. |
| 3 | `components/SalesPricingIntelligencePanel.tsx` (novo) | Bloco compacto no topo da aba Inteligência (espelho de `RentalPricingIntelligencePanel`): explicação curta, VGV-alvo, toggle de permutadas, aviso de substituição e "Aplicar Inteligência". Escala compacta (§16), rótulo §21, botão §17. Sem andar/posição/vista/sol. Botão travado sem VGV (zero zeraria todos os preços). *(Antes do pedido posterior, este item era um modal novo — `SalesPricingIntelligenceModal` — que foi descartado antes de ser commitado.)* | `check-ui-standard.sh` exit 0; teste de componente cobre o contrato do `onApply`. |
| 4 | `components/SalesModule.tsx` | Sai o botão "Inteligência de preços" da toolbar, o estado `isPricingModalOpen` e o modal; a aba `intelligence` renderiza o bloco acima do `RentalIntelligenceTab` (que passa a usar o `engineLabel` default, "no topo desta aba"). `handleApplyPricing(config: SalesPricingConfig)`; comentário e toast deixam de dizer "6º fator"/"Inteligência Hedônica". | `tsc` exit 0; toast diz "área × regras"; Playwright: botão não existe na toolbar e o bloco está acima da tabela. |
| 5 | `components/PricingIntelligenceModal.tsx`, `components/ImovibSalesMapTab.tsx` | Modal antigo ganha comentário de cabeçalho: só Imovib usa. Imovib troca `calculatePrices` → `calculateHedonicPrices` (uma linha). Nada mais. | `grep PricingIntelligenceModal` só acha Imovib + o próprio arquivo. |
| 6 | Comentários em `services/rentalPricingRuleService.ts`, `services/rentalPricingService.ts`, `components/RentalIntelligenceTab.tsx`, `components/RentalsModule.tsx` | Deixam de dizer que Venda "continua com o 6º fator"/"pesos hedônicos que Venda ainda usa". | `grep -n "Venda" nesses arquivos` não descreve mais modelo hedônico. |
| 7 | `__tests__/pricingRuleApplication.test.ts`, `__tests__/salesPricingRules.test.ts` (novo), `__tests__/components/SalesPricingIntelligencePanel.test.tsx` (novo) | O teste existente perde `PESOS`; os novos travam o comportamento (espelho dos 4 de Locação + Imovib preservada) e o contrato do bloco. | Suíte completa verde. |

## Decisões

- **Área continua sendo a base.** "Somente as regras" é sobre os *ajustes*; o
  VGV é distribuído por m² e sem a área não há o que multiplicar. Unidade sem
  `private_area` nem `area` segue com score 0 e preço 0 — já era assim.
- **"Incluir unidades permutadas no VGV" fica.** Não é peso de atributo — é o
  recorte de quais unidades compõem o bolo (commit `bea8d308`, pedido do
  usuário). Em Locações o toggle saiu porque o usuário o listou; aqui não foi
  listado e tem função própria no VGV.
- **`view_weights` sai junto**, como em Locações: não tinha campo na tela, mas
  pesava no cálculo. "Apenas as regras" não admite peso escondido.
- **Componente novo em vez de editar o modal antigo.** O antigo é
  compartilhado com a Imovib, que não tem regras; adaptar o mesmo componente
  aos dois seria uma prop de modo num arquivo que não cabe em nenhum dos dois
  padrões. O bloco nasce na escala compacta do guia.
- **Nomes do motor:** Venda fica com `calculatePrices`/`calculatePricesWithSplit`
  (é o que o registro de aplicação e a coluna já chamam); o hedônico ganha o
  nome explícito `calculateHedonicPrices`, para ninguém achar que é o caminho
  normal.

## Estado

- [x] 1 — tipos; `tsc` exit 0.
- [x] 2 — motor de Venda = área × regras; hedônico isolado em `calculateHedonicPrices`.
- [x] 3 — bloco compacto no topo da aba Inteligência.
- [x] 4 — wiring no `SalesModule`: botão e modal fora, bloco dentro da aba.
- [x] 5 — Imovib apontando para o hedônico com nome novo (1 linha + comentário).
- [x] 6 — comentários corrigidos nos 5 arquivos.
- [x] 7 — 10 testes de motor + 6 de componente novos; `pricingRuleApplication` adaptado.
- [x] `tsc` ✅ · `check-ui-standard.sh` ✅ nos 6 `.tsx` tocados (a `ImovibSalesMapTab.tsx` acusa 10 itens **pré-existentes**, linhas 93 e 334–420, tabela que esta tarefa não tocou — dívida fora de escopo, mesma nota do plano de 19/08) · `check-xss-sinks.sh` ✅ · `orgContextGuard` ✅
- [x] Suíte completa: **287 arquivos / 3931 testes** verde (após o pedido posterior).
- [x] Prova no navegador (Playwright, `c:/tmp/pwtest/venda-so-regras.cjs`, dev server da frente na porta 5312, login do agente de leitura, **todas as escritas a `/rest/v1/**` interceptadas — nada chegou ao banco**):
  - **007 - Bella Vista** (Alpa, sem regra cadastrada), VGV 5.000.000: botão "Inteligência de preços" não existe mais na toolbar; bloco na aba Inteligência com 0 slider / 1 input numérico / 1 checkbox, sem "Coeficiente de Andar", "Pesos por Atendimento", "Sol da Manhã"; 8 unidades, Σ price = 5.000.000; `base/m²` constante (4.604,05) — nenhum peso escondido.
  - **011 - Garden Cambuhy** (org a2c4b292, 3 regras ativas: área > 120 m² +20%, pavimento 2 +5%, pavimento 3 +10%), VGV 8.000.000: bloco em y=336, tabela de regras em y=596 (acima, como pedido); 38 unidades no upsert, Σ price = 7.999.999 (arredondamento por unidade); 34 linhas de `pricing_rule_applications`, 17 com regra casando; `base/m²` constante (2.207,50); **cada preço = VGV × área×(1+pct) / Σ**, sem desvio > R$ 1; Σ `total_amount` = −4 (≈ 0, esperado no VGV-alvo); toast: "38 unidades precificadas (19 com ajuste da aba Inteligência) com sucesso — área × regras da aba Inteligência."
  - Sem erro de console/JS nem HTTP 4xx/5xx nas duas execuções (a primeira execução acusou `value_mismatch` porque o roteiro devolvia `[]` às RPCs da Central de Controle — defeito do roteiro, corrigido deixando RPC passar).
  - Achado lateral, fora de escopo: ao abrir Vendas de Ativos, o app dispara ~10 `POST broker_profiles` (upsert) só por carregar a tela — pré-existente, não tocado aqui.

## Publicação

- Push em `main`: `c22bf9d4` (rebase sobre `d0532456`), 2026-09-12.
- Prova de fora (`scripts/conferir-producao.sh "VGV-alvo do edifício"`): o domínio entrega o bundle `index-Bt3ewVc-.js` carimbado com `c22bf9d` e o texto do bloco novo está no bundle servido. A primeira conferência pegou a publicação entrando no ar (chunks 404) — repetida 60 s depois, passou.
