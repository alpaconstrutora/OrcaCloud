# Gerar paredes automaticamente a partir do PDF do projeto

## Pedido original

Sessão de 22/08/2026, na sequência da conferência da planta de fundo.

> e como gero as paredes automaticamente?

A resposta foi que não existe caminho automático, mas que **parede não é
ambiente**: o bloqueio semântico que travou o épico (fechar vão) é do ambiente,
e a parede já tinha extração provada. Faltava uma etapa nunca testada
(retângulo → eixo). Ofereci medi-la antes de prometer a feature; o usuário
respondeu:

> sim

A medição aprovou (rodada 6 do Spike C, commit `09e789b`). Perguntei se
commitava o spike ou seguia para a Fase 1; o usuário respondeu:

> sim

Entendido como as duas coisas.

## O que a medição estabeleceu

- **52 eixos de 147 segmentos**, 69,1 m de parede, 68% do comprimento de face
  emparelhado.
- **A espessura derivada agrupa em 20/15/10 cm** — valores de construção, 75%
  dos eixos. É a prova de que os pares são paredes de verdade.
- **A parede não é retângulo fechado**: 140 dos 143 subpaths têm um segmento
  só. Cada face é uma linha solta. O pareamento geométrico é inevitável.
- **Consumir a face por TRECHO, não inteira** — uma fachada encosta em várias
  paredes internas. Foi o que levou 42→52 eixos.

## As três decisões de desenho

### 1. O PDF é escolhido de novo, e isso é dito na tela

A importação de hoje **destrói o vetor**: rasteriza a 150 dpi e sobe o PNG
(`useBlueprintUnderlay.importar`). Guardar o vetor exigiria mexer no pipeline
de importação, no bucket e provavelmente no schema.

Para a Fase 1 o usuário aponta o PDF outra vez, e a tela **explica por quê**.
É um clique a mais numa operação que se faz uma vez por planta — e mantém a
Fase 1 sem migration, sem mudança de schema e sem tocar no caminho de
importação que acabou de ser verificado.

### 2. A escala vem da aferição que já existe — não se pergunta nada

Descoberta que dispensa qualquer campo de escala na tela. A corrente é exata:

```
pt do PDF ──(×150/72, com Y invertido pela altura da página)──> px da imagem
px da imagem ──(pixelParaModelo, a aferição do usuário)──> mm do modelo
```

O raster do fundo saiu do MESMO PDF a 150 dpi, então o pt do vetor e o px da
imagem são o mesmo espaço a menos de um fator constante. **As paredes geradas
caem exatamente em cima da planta de fundo**, usando a aferição que o usuário
já fez. Nenhuma escala nova para errar.

Consequência: a ação só existe com um fundo aferido. É a ordem natural
(importar → aferir → gerar) e a tela deixa isso explícito.

### 3. A região é o que está na tela

A prancha tem ~23 desenhos (plantas, cortes, fachadas, tabelas). Gerar de todos
de uma vez seria um amontoado.

Em vez de inventar uma ferramenta de recorte, a região é o **enquadramento
atual**: o usuário dá zoom na planta que quer e gera. Zero interação nova, e
reaproveita o enquadramento que acabou de ser corrigido.

## Itens

- [x] **`utils/blueprintVetor.ts`** — o algoritmo, puro e sem pdfjs:
      `juntarColineares`, `parearFaces` (com consumo por trecho),
      `histogramaEspessura`, `ptParaModelo` e `espessuraDeConstrucao`.

- [x] **`__tests__/blueprintVetor.test.ts`** — 20 testes, incluindo o caso que
      a medição ensinou (face longa emparelhando com DUAS faces opostas) e os
      dois do arredondamento de espessura.

- [x] **`services/blueprintUnderlayService.ts`** — `extrairSegmentosPdf`.

- [x] **`components/blueprint/BlueprintCanvas.tsx`** — `onVistaMudou`.

- [x] **`components/blueprint/PainelGerarParedes.tsx`** — painel lateral, na
      aba "Do PDF".

- [x] **`components/blueprint/BlueprintEditor.tsx`** — `runBatch`, um passo de
      desfazer só.

- [x] **`docs/spikes/prancha-real/`** — cena `vetor`, que roda o caminho no
      NAVEGADOR contra a prancha real.

## Duas mudanças de rumo durante a implementação

### A prévia colorida saiu — a prévia é o próprio resultado

O plano previa acender no canvas os traços da espessura escolhida. Substituído
por um resumo numérico ("59 paredes · 20 cm ×20 · 15 cm ×11 · 10 cm ×8") antes
de aplicar, porque gerar é **um** passo de desfazer: errar a espessura custa um
Ctrl+Z, e uma camada de prévia exigiria um caminho de desenho novo no canvas
para dar a mesma informação que o número já dá. Volta se o uso mostrar que o
número não basta.

### A espessura passou a ser encostada no centímetro

**Não estava no plano, e foi a cena `vetor` do harness que obrigou.** O
pareamento devolvia 20,3 · 19,9 · 19,7 cm para paredes que são todas a mesma
parede de 20 cm — a diferença é onde o CAD pousou o traço.

Não é questão estética: espessura é dimensão de **quantitativo**, e 20,3 com
19,7 produziria duas linhas de orçamento para a mesma alvenaria. Com
`espessuraDeConstrucao` o resultado passou a bater exatamente com o histograma
do spike (20 cm ×20 · 15 cm ×11 · 10 cm ×8).

## Verificações

- `__tests__/blueprintVetor.test.ts` — **20/20**
- `npx vitest run __tests__` — **1472 passaram**, 24 puladas
- `docs/spikes/prancha-real/conferir.mjs` — **12/12**, e a cena `vetor`
  confere que o pdfjs do NAVEGADOR lê os mesmos 19923 traços que o de Node e
  gera 59 paredes contra as 58 do spike (a folga é o arredondamento para
  milímetro inteiro, que o spike não faz)
- `docs/spikes/medicoes/passeio.mjs` — **9/9** com a 6ª aba; a lista de abas do
  harness foi atualizada, senão ele aprovaria uma barra que transborda
- `npx tsc --noEmit` — limpo
- `scripts/check-ui-standard.sh` nos três componentes — sem violação
- `scripts/check-org-selector-guard.sh` — 14/14

## Um defeito de algoritmo que o teste de unidade pegou

`juntarColineares` dobrava o ÂNGULO para o semiplano positivo
(`if (ang < 0) ang += π`). Parece equivalente a canonizar o vetor e não é: a
direção (−1, 0) tem ângulo exatamente π, não é negativa, escapava da correção
e ia para a chave "180.0" enquanto (1, 0) ia para "0.0" — a mesma face
desenhada da direita para a esquerda virava duas faces, e as duas ficavam
órfãs.

O spike original tinha o mesmo defeito. Corrigido nos dois; com a correção o
spike passa de 52 para **58 eixos** e de 68% para **71%** de comprimento
emparelhado, com as três espessuras dominantes idênticas.

## Fora do escopo da Fase 1

- **Guardar o vetor na importação.** É o que elimina o segundo clique, e é
  mudança de pipeline + storage. Fase 2.
- **Ambiente/cômodo.** Continua bloqueado pelo fechamento semântico de vão.
  Esta fase entrega PAREDE, não área.
- **Foto e scan.** Sem vetor não há o que extrair; é o braço multimodal, que
  segue parado pela `GEMINI_API_KEY` inválida.
- **Mitrar os cantos.** O eixo abrange só a sobreposição do par e para uma
  espessura antes do canto. O editor já tem a mitragem do traçado manual; ligar
  as duas é trabalho próprio, e sem ela o usuário fecha o canto arrastando a
  ponta, como já faz.
