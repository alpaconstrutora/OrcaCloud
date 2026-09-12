# Inteligência Hedônica (Locações): fora os pesos embutidos, só as regras da aba Inteligência

## Pedido original

Sessão de 2026-09-11 (Claude Code, frente `hedonica-so-regras`), logo depois da
entrega do registro de aplicação das regras. Mensagem do usuário, literal:

> na aba inteligência hedônica:
> 1.	tem campos que devem ser removidos: Pesos por Posição; Sol da Manhã/Tarde; Coeficiente de Andar; INCLUIR UNIDADES PERMUTADAS
> 2.	devem ser considerados nos cálculos somente as regras da aba Inteligência.

## Leitura do pedido

Os dois itens são a mesma decisão vista de dois lados: **um lugar só para dizer
quanto vale um atributo.** Até aqui havia dois — os pesos embutidos no painel
(andar, posição, vista, sol) e as regras da aba Inteligência — e o preço saía da
multiplicação dos dois, sem que nenhuma tela mostrasse a conta inteira. Quem
olhasse a coluna "Regras da Inteligência" via só metade do porquê.

Consequência do item 2 que vai além dos 4 campos citados: **`view_weights`
(vista) também sai do cálculo**. Ele não tinha campo na tela de locação — só o
valor padrão no código —, então não estava na lista do pedido, mas continuaria
pesando no preço, e "somente as regras" não admite isso.

## Escopo

- **Locações** (`RentalPricingConfig`, `rentalPricingService`,
  `RentalPricingIntelligencePanel`). É onde fica a aba citada.
- **Venda de Ativos NÃO muda** (`HedonicPricingConfig`, `pricingService`,
  `PricingIntelligenceModal`): tem tela e motor próprios, e o pedido é sobre a
  aba de Locações. Se a mesma simplificação for desejada lá, é outro pedido —
  mexer nela junto seria alargar o escopo por conta própria.

## Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `types/imovib.ts` | `RentalPricingConfig` perde `floor_coefficient`, `position_weights`, `view_weights`, `orientation_weights` e `include_exchanged`; sobram `mode`, `base_per_sqm`, `target_total_rent`. | `tsc` aponta todo uso remanescente (é a trava: campo removido do tipo não some em silêncio). |
| 2 | `services/rentalPricingService.ts` | `calculateUnitScore` = área × (1 + pct/100). Filtro de unidades passa a excluir permutada sempre. | Testes novos: atributos não mudam o aluguel; permutada fora; regra é o único ajuste. |
| 3 | `components/RentalPricingIntelligencePanel.tsx` | Removidos os 4 blocos; grade de 2 colunas vira 1; textos do painel deixam de prometer modelo hedônico e apontam para a aba Inteligência. | Playwright: os 5 rótulos não existem mais na tela; 1 input numérico, 0 checkbox, 0 slider. |
| 4 | comentários de `rentalPricingRuleService.ts`, `RentalIntelligenceTab.tsx`, `RentalsModule.tsx`, `types/imovib.ts` | Deixam de dizer "6º fator do modelo hedônico" para locação (continua verdade em venda). | `grep` por "6º fator" só acha as menções de venda. |
| 5 | `__tests__/rentalPricingRules.test.ts`, `__tests__/pricingRuleApplication.test.ts` | Configs sem os campos removidos + 4 testes que travam o novo comportamento. | Suíte completa verde. |

## Decisões

- **Permutadas: fixadas em "fora".** O toggle saiu; o comportamento que fica é o
  que ele trazia desligado por padrão. Unidade permutada não é estoque de
  locação, e no modo de alvo total incluí-la tiraria participação das unidades
  que serão de fato alugadas. Quem quiser precificar uma permutada muda o status
  dela.
- **Área continua sendo a base.** "Somente as regras" é sobre os *ajustes*: o
  modo chama-se R$/m², e sem a área não há o que multiplicar. Unidade sem área
  (nem `private_area` nem `area`) segue com score 0 e não é precificada — já era
  assim, porque a área sempre multiplicou todos os fatores.
- **O nome "Inteligência Hedônica" ficou.** Renomear aba é decisão do usuário;
  o texto interno do painel já descreve o cálculo real.
- **O painel segue com o vocabulário visual antigo** (cabeçalho azul, `rounded-3xl`,
  labels `font-black uppercase`), fora do §16/§21 do guia de UI. Migrá-lo é
  redesign, que o §20 manda não fazer sem decisão explícita — não entrou aqui.

## Estado

- [x] 1 — tipo enxugado; `tsc` exit 0.
- [x] 2 — score = área × regras; permutada sempre fora.
- [x] 3 — painel com um campo só.
- [x] 4 — comentários corrigidos.
- [x] 5 — 4 testes novos; suíte completa **277 arquivos / 3845 testes** verde.

Provas no navegador (Playwright, dev server da frente na porta 5301, login do
agente de leitura, 010 - Galeria Altavista):

1. **Tela** — "Pesos por Posição", "Sol da Manhã/Tarde", "Coeficiente de Andar",
   "Valorização por Pavimento" e "Incluir unidades permutadas" não aparecem mais;
   restam 1 input numérico, 0 checkbox, 0 slider.
2. **Cálculo** — "Aplicar Inteligência" no modo aluguel-alvo total (R$ 20.000),
   com todas as escritas a `/rest/v1/**` interceptadas (nada chegou ao banco):
   12 linhas, Σ price = 20.000. Os valores por unidade mudaram em relação ao
   motor antigo (Loja 101: R$ 1.403 contra R$ 1.384), exatamente porque pavimento,
   posição e sol deixaram de pesar — a distribuição agora é área × regras.
