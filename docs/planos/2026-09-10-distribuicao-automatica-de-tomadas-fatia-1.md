# Distribuição automática de tomadas — Fatia 1: tipo do ambiente, N por ambiente/parede, ponto sugerido

## Pedido original

> Aceito o painel, mas também queria a distribuição automática e onde depende
> do projetista, por exemplo em cima da pia do banheiro, eu compreendo que o
> sistema não sabe onde seria, mas o sistema pode inserir uma tomada no
> banheiro e o projetista tem o trabalho apenas de mover para o local adequado.
> Também proponho que além da distribuição automática também tenha um campo
> para que o usuário pode decidir a quantidade de tomadas por ambiente e por
> parede e depois ele move para o local que ele deseja. Avalie

Avaliação dada em 10/09/2026, com três fatias; o usuário respondeu **"Sim"** a
"Começo pela fatia 1?". Este documento é a fatia 1. As fatias 2 (mínimo pela
NBR 5410 9.5.2.2.1, com déficit por ambiente) e 3 (painel "Conferência
NBR 5410" e ponto de ligação direta) ficam para os próximos pedidos.

## A fronteira que organiza tudo: "somar é registro, decidir é projeto"

O sistema **não decide** onde a tomada fica. Ele gera posições PROVISÓRIAS e
as marca como **sugeridas**. A marca é o que separa ajuda de decisão
disfarçada:

- o ponto sugerido nasce **tracejado** (anel azul de prévia em volta);
- o painel **Quadro de cargas** o conta como pendência — "N tomadas sugeridas
  aguardam posição";
- **mover** o ponto limpa a marca, no kernel (`TranslateEntities`), e não num
  botão: mover é o ato de decidir;
- "Aceitar todas" existe para quem olhou e concordou com todas de uma vez.

## O que foi feito

### Kernel (`blueprint-kernel-ts-0.23.0 → 0.24.0`)

- `SpaceLabel.tipoDeAmbiente` — `BANHEIRO · COZINHA_SERVICO · VARANDA ·
  SALA_DORMITORIO · OUTRO` (`TIPOS_DE_AMBIENTE`). Mora na etiqueta porque o
  ambiente é derivado. `NameSpace` aceita o tipo (ausente não mexe: renomear
  não é reclassificar); `SetSpaceLabelProps` reclassifica. Invariante
  `BAD_SPACE_KIND`.
- `Terminal.sugerida` — `AddTerminal`/`SetTerminalProps` aceitam;
  `TranslateEntities` limpa nos terminais movidos.
- Canônico: os dois campos são **omitidos quando ausentes**; `sugerida` vai
  como `true` ou ausente, nunca `false`. Prova de neutralidade feita com a
  string ainda em 0.23.0 (goldens intactos, contagens 9/49/144/3/78/4), depois
  o bump e a recaptura dos 6 hashes com entrada no cabeçalho.

### Motor puro — `utils/blueprintDistribuicao.ts`

- `ladosDePiso(space, walls)` — o contorno recuado até a FACE de cada parede,
  com a parede de cada lado identificada. Na face, e não no eixo: é onde a
  tomada fica e onde `orientacaoDaTomada` a faz apontar para dentro.
- `distribuirAoLongo(lados, n, walls, openings, folga = 150)` — n pontos
  uniformes pelo comprimento **utilizável** (menos portas/janelas ± folga,
  menos folga de canto). Uniforme pelo total, e não "n ÷ lados": um lado
  inteiramente tomado por uma porta não recebe ponto. Sem comprimento livre →
  vazio, para a tela dizer "sem parede livre" em vez de empilhar n no mesmo
  ponto.
- `ladosDaParede(model, wallId, levelId)` — as faces de uma parede, uma por
  ambiente vizinho (a parede entre sala e cozinha tem duas; a externa, uma; a
  que não fecha ambiente, nenhuma).
- `comandosDeTomadasSugeridas(levelId, pontos)` — um `AddTerminal` por ponto
  (TUG, cota 300, `sugerida: true`), para aplicar em **um lote** = um Ctrl+Z.
- `ROTULO_DO_TIPO_DE_AMBIENTE`, `etiquetaDoAmbiente`.

### Tela

- **Lista de ambientes** (painel direito): select "Tipo" (A classificar +
  5 tipos) e o controle "N tomadas neste ambiente → Distribuir".
- **Painel da parede selecionada**: "N tomadas nesta parede → Distribuir";
  com dois ambientes vizinhos aparece "do lado [Sala ▾]"; parede que não
  fecha ambiente explica e não oferece o botão. Slot `tomadasSlot`, pela
  razão de `camadasSlot`.
- **Canvas**: anel tracejado azul (`COR_PREVIA`) em volta do ponto sugerido,
  para tomada e para ponto redondo.
- **Quadro de cargas** (`PainelEletrica`): contagem das sugeridas + "Aceitar
  todas", com e sem quadro no desenho.
- Componente único `DistribuirTomadas` (+ `TomadasNaParede`) para os dois
  lugares.

## ⚠️ O que o teste pegou antes do usuário

O campo numérico guardava o NÚMERO e o "corrigia" a cada tecla: apagar para
digitar outro valor virava `1` na hora, e digitar `4` em seguida dava `14`. O
teste de componente falhou na primeira rodada exatamente por isso. Agora o
campo guarda o TEXTO e só fecha o número ao usar (ou ao sair do campo).

## Portões medidos no defeito

- Comentar `if (t.sugerida) t.sugerida = null;` em `TranslateEntities` →
  1 teste falha ("mover limpa a marca — e só dele").
- `blueprintDistribuicao.test.ts`: o caso "NENHUM ponto cai numa porta" foi
  medido contra a versão ingênua (dividir por n sem tirar vãos) antes de virar
  portão.

## Verificação

- `npm run typecheck` limpo.
- `blueprintTomadasSugeridas` 14/14 · `blueprintDistribuicao` 8/8 ·
  `components/DistribuirTomadas` 8/8 · goldens 7/7.
- `bash scripts/check-ui-standard.sh` em `DistribuirTomadas.tsx`,
  `PainelEletrica.tsx`, `PainelParedeSelecionada.tsx`, `BlueprintEditor.tsx`:
  sem violação.
- Suíte inteira e `npm run build` antes de publicar (resultado abaixo).

## Fora de escopo, declarado

- Mínimo pela norma (9.5.2.2.1) e o campo W→VA — fatia 2.
- Painel "Conferência NBR 5410" e ponto de ligação direta — fatia 3.
- O tipo do ambiente ainda não muda nada além da própria classificação: é
  o dado que a fatia 2 consome.
