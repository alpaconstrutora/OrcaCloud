# Planta Inteligente — lançamento automático de eletrodutos

## Pedido original

> implementar lançamento automatico de eletroduto

(13/09/2026, na sequência do ribbon e das tarefas em drawer.)

## O que foi feito — 13/09/2026 ✅

**Molde**: o mesmo da distribuição de tomadas — o sistema **propõe**, marca
como sugerido, mover ou aceitar confirma, Ctrl+Z desfaz o lote. Somar é
registro, decidir é projeto; toda hipótese é nomeada no drawer.

| camada | onde |
|---|---|
| kernel | `Trecho.sugerido` (irmão de `Terminal.sugerida`; `true` ou ausente, nunca `false`); `AddTrecho` aceita `circuitoId`, `condutores`, `sugerido`; `SetTrechoProps.sugerido: false` aceita; **mover** (`TranslateEntities`) limpa a marca. `KERNEL_VERSION` 0.29.0 → **0.30.0**, goldens provadas neutras em 0.29.0 antes da recaptura |
| cálculo puro | `utils/blueprintEletrodutos.ts`: `planejarEletrodutos(model, circuito, levelId, hip)` → `{pontos, ligados, aLigar, comandos, metrosPrevistos, motivo}`; `planejarEletrodutosDoNivel`; `pontosSemCircuito`; `eletrodutosSugeridos`; `HIPOTESES_ELETRODUTO_PADRAO` (bitola 25; condutores FN 3 · FF 3 · FFF 4); `BITOLAS_DE_ELETRODUTO_MM` |
| algoritmo | (1) prumada na posição de cada ponto pendente, da cota do ponto ao **teto** (pé-direito do pavimento) — luz de teto já está lá; (2) prumada do quadro, se ainda não há nó dele no teto; (3) **árvore de menor comprimento (Prim)** no teto a partir dos nós já alcançados (quadro + pontas de eletroduto do mesmo circuito no teto), desempate determinístico. Ponto com eletroduto chegando na sua posição conta como ligado → **idempotente** |
| canvas | trecho sugerido pontilhado fino `[3,3]` (mesmo tracejado do anel da tomada sugerida) |
| tela | aba Instalações › Elétrica › **"Lançar eletrodutos"** (contagem de pontos a ligar) abre o drawer "Eletrodutos por circuito": hipóteses escritas + bitola (20/25/32/40), tabela por circuito (quadro, ligados/total, metros previstos, Lançar), pendência de pontos sem circuito com "ver"; rodapé com "Lançar em todos (n)", "Aceitar sugeridos" e a contagem de sugeridos |
| queda de tensão | depois do lançamento `comprimentoDoCircuito` passa de ESTIMADO para **ELETRODUTOS** — o pré-dimensionamento lê o caminho proposto |

**O que fica declarado e não decidido**: a rede vai pelo teto em linha reta —
não desvia de viga nem de laje, que o desenho não conhece; a bitola é uma só
por lançamento; ponto **sem circuito** não entra (atribuir circuito é do
projetista) e é listado como pendência.

**Prova**: `__tests__/blueprintEletrodutos.test.ts` (7): prumadas certas (quadro
1600→2800, interruptor 1100→2800, luz no teto sem prumada), 2 trechos no teto
com o interruptor ligando direto ao quadro, FFF com 4 condutores, bitola da
hipótese, idempotência (segunda rodada: `aLigar 0`), prumada existente
respeitada, motivos, canônico sem a chave quando falso e ida e volta com
`true`, mover/aceitar limpam. Editor: teste do drawer (hipóteses, "nenhum
circuito ainda", bitola 25, botões apagados). App real com escritas
bloqueadas: quadro colocado, circuito criado, 3 pontos ligados pelo quadro de
cargas, "Lançar em todos (3)" → 6 eletrodutos sugeridos pontilhados no
desenho, rodapé "6 sugerido(s)". Suíte completa verde; build ok.

## Agrupamento dos pontos no Quadro de cargas (mesmo dia)

Pedido: *"no Quadro de cargas e NBR 5410: aparecem todos os pontos elétricos.
agrupe-os por ambiente"* → *"ou melhor, ofereça ao usuário a forma que ele quer
agrupar. e sugeria agrupar por ambiente e ele decide"*.

`utils/blueprintAgrupamentoDePontos.ts`: critérios **Ambiente (sugerido)**,
Tipo de ponto, Pavimento, Sem agrupar; o pertencimento ao ambiente é a mesma
regra da conferência NBR 5410 (contorno de eixo, fora dos furos); "Fora de
ambiente" e "A classificar" são grupos ditos, não escondidos. No
`PainelEletrica`, a lista de pontos fora de circuito ganhou o seletor "Agrupar
por" (persistido em `blueprint:agruparPontosSoltos`) e, em grupo com 2+
pontos, **"Ligar todos a…"** — o caso comum é o cômodo inteiro no mesmo
circuito. Testes: `blueprintAgrupamentoDePontos` (3) e o teste do painel.

## Fora, por decisão

- Desvio de vigas/lajes e passagem pelo piso — o desenho não conhece a
  estrutura do teto; quando conhecer (lajes por ambiente), a rede pode
  preferir o piso onde a laje não deixa.
- Compartilhar eletroduto entre circuitos (agrupamento) — a árvore é por
  circuito; agrupar é decisão de projeto que a Tabela 42 penaliza.
- Caixas de passagem e curvas — símbolos, não geometria; entram com a
  prancha elétrica detalhada.
