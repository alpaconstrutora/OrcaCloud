# Planta Inteligente — eletrodutos por quadro, compartilhados, entre pavimentos

**Data:** 15/09/2026 · **Frente:** `planta-ribbon` · **Estado:** ✅ concluído

## Pedido original

Depois de eu listar os critérios do lançamento automático:

> 1. cada circuito nao necessariamente utilizar eletroduto esclusivo. a norma não fala isso. entao deve ser descartada esse requisito. E isso implica alguns dos outros requisitos. Atualize e retorne o a lista de requisitos novamente

> outro ponto, não existe a necessidade de quadro pavimento. Por exemplo, um residencia com dois pavimento, nao necessariamente precisa de um quadro por pavimento, pode ter um quadro somente com eletrodutos que sobe ou desce entre pavimentos. A norma nao fala nada sobre necessidade de quadro de distribuicao para cada pavimento. Então esse requisito deve ser desconsiderado. Atualizar e trazer a lista de requisitos atualizada

> sim

## Critérios (a lista aprovada)

1. A unidade é o **quadro**: uma rede alimenta todos os pontos com circuito dele, em qualquer pavimento. Ponto sem circuito fica fora.
2. O quadro alimenta para cima e para baixo — não há quadro por pavimento.
3. Rede embutida no teto de cada pavimento (pé-direito).
4. Prumadas na posição de cada ponto; o quadro sobe ao teto do dele.
5. **Prumada entre pavimentos na posição do quadro** (piso→teto em cada pavimento atravessado; para baixo, o quadro desce ao piso). A laje é o encontro: cota 0 de um pavimento ≡ teto do imediatamente abaixo.
6. Uma árvore de menor comprimento (Prim) **por pavimento** com todos os pontos do quadro ali; raiz = nó do quadro ou da prumada.
7. Cada trecho carrega os **circuitos que passam por ele**; condutores = soma (FN/FF 3, FFF 4 por circuito).
8. **Bitola pela taxa de ocupação** (6.2.11.1.6): menor comercial (20/25/32/40) que atende, nunca abaixo da mínima do drawer.
9. **Agrupamento medido** entra na Tabela 42: por circuito, o máximo de circuitos no pior trecho do caminho.
10. Compartilhamento só dentro do mesmo quadro (6.2.5.6: mesma origem; isolação única PVC 70 °C).
11. Idempotente por quadro, em todos os pavimentos; trecho existente pelo qual passa um ponto novo **ganha** os circuitos dele (SetTrechoProps) em vez de ser duplicado.
12. Nasce sugerido; um lote, um Ctrl+Z; mover/aceitar confirma. O drawer mostra, por quadro, os pontos por pavimento e as prumadas entre pavimentos.
13. Comprimento por circuito pela rede (com a prumada entre pavimentos) para a queda de tensão.

Fora: desvio de viga/laje, caminho por parede, atribuir circuito a ponto solto, otimizar o ponto de subida.

## O que mudou

| Área | Mudança |
|---|---|
| Kernel (`model.ts`, `canonical.ts`, `commands.ts`, `units.ts`) | `Trecho.circuitoId` → **`circuitoIds`** (lista sem repetição; ausente = sem circuito). Canônico emite `circuitos` (índices crescentes) só quando há; o `circuito` escalar antigo é lido como lista de um. `AddTrecho`/`SetTrechoProps` aceitam `circuitoIds` (`circuitoId` fica como açúcar). `DeleteCircuito`/`DeleteQuadro`/`DeleteLevel` tiram só os circuitos apagados (`semCircuitos`). Invariante: cada id existe, sem repetição, só em ELETRICA. **`KERNEL_VERSION` 0.31.0**, 6 goldens recapturados (só paredes — mudaram pela string da versão). |
| `utils/blueprintEletrodutos.ts` (reescrito) | `planejarEletrodutos(model, quadro, hip, hipEletricas)` / `planejarEletrodutosDoModelo`: grafo da rede existente + nova (nó = pavimento·x,y·cota, laje como encontro), prumadas entre pavimentos, Prim por pavimento, BFS de cada ponto ao quadro para atribuir circuitos aos trechos, condutores somados, `bitolaMinimaPorOcupacao`; `PlanoDeEletrodutos` com `pavimentos[]`, `prumadasEntrePavimentos`, `trechosAtualizados`. |
| `utils/blueprintEletricaDimensionamento.ts` | `ocupacaoDoTrecho` soma condutores de seções diferentes (`ocupacaoDoEletrodutoCompartilhado`, `condutoresPorCircuitoNoTrecho`); `bitolaMinimaPorOcupacao`; `agrupamentoDoCircuito` e o pré-dimensionamento passa a usar o agrupamento **medido** quando há eletroduto; `comprimentoDoCircuito` lê a lista. |
| `utils/blueprintCondutores.ts` | `condutoresDoEletroduto(trecho, circuitos[])`: condutores de cada circuito, na ordem; excedente = retorno. |
| Canvas e prancha | Números de **todos** os circuitos em cima do grupo ("1 2"), seções distintas embaixo ("1,5/2,5"). |
| `PainelTrechoSelecionado.tsx` | Select único → lista de caixas "Circuitos neste eletroduto". |
| `BlueprintEditor.tsx` | Drawer por quadro (pavimentos · ligados/pontos · prumadas · trechos que ganham circuitos · previsto · lançar), hipóteses reescritas, "Bitola mínima". |

## Verificação

- `__tests__/blueprintEletrodutos.test.ts` (10): árvore única com tronco `[C1, C2]` e 7 condutores; bitola por ocupação (20 → 25 no tronco com C2 em 10 mm², ramal só de C1 fica 20); idempotente + comprimento por eletroduto + agrupamento medido 2; prumada existente ganha o segundo circuito (`SetTrechoProps`); pavimento acima (prumada piso→teto na posição do quadro, plano aplica e zera); pavimento abaixo (quadro desce ao piso); motivos; canônico `circuitos`/legado `circuito`; apagar circuito tira só ele.
- Kernel: goldens recapturados; `blueprintQuadroDeCargas` (eletroduto solto) ajustado.
- Suíte completa **321 arquivos / 4209 testes** verde · `tsc` 0 · build ok · `check-ui-standard.sh` limpo em `BlueprintEditor.tsx`, `BlueprintCanvas.tsx`, `PainelTrechoSelecionado.tsx`.
- **App real** (Playwright, escritas bloqueadas): drawer "Eletrodutos por quadro" com o QDC 2 em `Térreo: 0/2 · 26,4 m`; "Lançar em todos" → `2/2 · todos os pontos já têm eletroduto`; no canvas o tronco QDC→luz sai com **"1 2"** e **"1,5/2,5"** (6 condutores) e o ramal luz→TUG só com "2". Um quadro pré-existente com 30 pontos já ligados apareceu como "2 trecho(s) ganham circuitos" (trechos antigos que passam a carregar os circuitos que os atravessam) — rótulo do botão virou "atualizar" nesse caso.

## Consequências a saber

- Acervo: trechos antigos continuam com um circuito (lido como lista de um); o primeiro lançamento por quadro pode propor `SetTrechoProps` neles (ganham os circuitos que passam) — é o "atualizar" da tabela.
- Emissões do projeto executivo elétrico: hash da base não muda por si (o hash é do desenho + hipóteses), mas o desenho muda ao lançar — como qualquer edição.

## Relançar (15/09, pedido: *"Ao realizar qualquer movimentação em pontos ou no quadro o botão de lançar eletrodutos deveria ficar disponível para lançamento novamente"*)

Mover um ponto ou o quadro leva a rede junto (conexão mantida), então o plano
continuava "todos os pontos já têm eletroduto" e o botão ficava apagado.
Agora o plano conta os trechos **sugeridos** do quadro (`PlanoDeEletrodutos.sugeridos`)
e, sem nada novo a ligar mas com sugeridos, o botão da linha vira **"Relançar (n)"**
(e "Lançar em todos" fica habilitado): `relancarEletrodutos` apaga só os sugeridos
do quadro (`DeleteTrecho` primeiro no lote) e refaz a rede com o que sobrou — os
trechos **confirmados** (movidos/aceitos) nunca são tocados. Um Ctrl+Z desfaz.

Prova: teste puro (mover a TUG → `comandos []` e `sugeridos` = n; relançar apaga
n−1 quando um trecho foi confirmado, preserva o confirmado, refaz a prumada na
posição nova e zera o plano) e app real (QDC 2 após lançar: "Relançar (4)"
habilitado; relançar reconstrói e continua disponível enquanto a rede for sugerida).

## Rota máxima (15/09, pedido com print: *"o encaminhamento do eletroduto faz um percurso muito maior do que poderia, resultando em gastos desnecessários. implemente novo critério para lançamento de eletroduto levando em conta a menor rota"*)

A árvore de menor eletroduto total (Prim) encadeava pontos distantes e o cabo de
um circuito dava a volta na casa. Critério novo, hipótese nomeada
`rotaMaximaVezes` (padrão **1,5×**; opções 1,25× · 1,5× · 2× · sem limite, persistida
em `blueprint:eletrodutosRotaMaxima`): a cada passo entra o pendente que exige o
menor eletroduto novo, mas só pendurado num nó cujo caminho até a raiz do
pavimento (rota do nó + trecho novo, medida pela rede que já existe — Dijkstra
sobre as arestas) fique dentro de `rotaMaxima × linha reta em planta` até o quadro.
Sem nó que caiba, o mais próximo. `null` = árvore mínima antiga; `1` = leque.

Prova: cenário Q(0,0), C(1500,3000), B(4000,3000), A(4000,0) — sem limite: Q→C→B→A
(8,9 m; A a 8,85 m por 4 m em reta); 1,5×: A direto ao quadro, B por C (9,9 m);
1,1×: B também direto (12,4 m). Os testes anteriores (casa, pavimentos, relançar)
seguem iguais — a rota de 1,5× não altera aquelas árvores.
