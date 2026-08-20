# Planta Inteligente — seleção múltipla e mover

## Pedido original

> Planta Inteligente: Opção de selecionar todas as paredes e objetos e mover ou selecionar parte e mover

Sessão: `0cca01b3-e758-4415-839e-5516fd06a6fd` · 2026-08-19

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-08-19 | O que "objetos" abrange, além das paredes? | **Aberturas** (portas/janelas — vêm de carona, custo zero) **+ medições** (área/linha/contagem). Planta de fundo fica de fora. |
| 2026-08-19 | Movendo só PARTE do desenho, o que acontece nas junções com paredes não selecionadas? | **Os dois modos, com uma chave na barra**: *Mover* (rígido, desprende — MOVE do AutoCAD) e *Esticar* (vizinhas acompanham — STRETCH). |
| 2026-08-19 | Como o laço decide o que pega? | **Direcional, estilo CAD**: esquerda→direita pega só o que está inteiro dentro; direita→esquerda pega tudo que toca. |

## Contexto

O editor tinha **cardinalidade 1**: `selectedId: string | null` (`hooks/useBlueprintEditor.ts`), um id heterogêneo que tanto podia ser parede quanto abertura, desambiguado por lookup duplo em `BlueprintEditor.tsx`. Não havia laço, nem `Ctrl+clique`, nem seleção múltipla em lugar nenhum do módulo. A única geometria que se movia por arraste era **uma ponta de uma parede** (alça de `MoveVertex`) e o deslizamento de uma abertura ao longo da parede que a hospeda.

Consequência prática: para reposicionar um cômodo inteiro — ou a planta toda, depois de calibrar a planta de fundo — era preciso arrastar ponta por ponta, e cada arraste desencostava a junção com a vizinha.

## Plano

### 1. Kernel — comando `TranslateWalls` · `utils/blueprintKernel/commands.ts`

```ts
| { type: 'TranslateWalls'; wallIds: ObjectId[]; delta: Point; arrastarVizinhas: boolean }
```

Captura os vértices originais do conjunto (`pointKey`) **antes** de deslocar; soma `delta` em `a`/`b` de cada parede selecionada; com `arrastarVizinhas`, as pontas de paredes não selecionadas que casam com aqueles vértices recebem o mesmo `delta`.

**Por que um comando novo e não um lote de `MoveVertex`** — três motivos, cada um sozinho já bastaria:

- `applyBatch` roda `recomputeSpaces` + `assertModelInvariants` + `snapshotHash` **por comando**. Mover 40 paredes seriam 80 recomputações do arranjo planar num gesto só.
- **Os estados intermediários são inválidos.** `MoveVertex` mexe numa ponta de cada vez e, ao encurtar a parede, lança `OPENING_OUT_OF_BOUNDS` se houver abertura perto do limite — o lote abortaria numa translação que, vista como um todo, não encurta nada. Translação rígida **preserva comprimento**.
- Um gesto = um passo de desfazer, sem depender de `runBatch` para fingir atomicidade.

`KERNEL_VERSION` **não muda**: o payload canônico serializa o *modelo*, não comandos.

**Pronto quando:** testes de unidade passam e `npx tsc --noEmit` fica limpo.

### 2. Estado de seleção · `hooks/useBlueprintEditor.ts`

`selectedIds: string[]`, com `selectedId` mantido como **derivado** (`length === 1 ? [0] : null`). É o que mantém `PainelParedeSelecionada`, dividir, unir, espessura e esticar intocados — todas são operações de cardinalidade 1 e continuam sendo.

**Pronto quando:** com um item selecionado, tudo funciona exatamente como antes.

### 3. Canvas — laço, acumular, mover · `components/blueprint/BlueprintCanvas.tsx`

Props passam a `selectedIds: string[]` / `onSelecionar(ids)`. Precedência no `aoApertar` (ramo `selecionar`): alça de vértice → abertura já selecionada → **item já selecionado sob o cursor = mover** → item não selecionado = seleciona (Ctrl/Shift alterna) → vazio = **laço**.

Laço direcional; teste de acerto pelo **corpo** da parede (`cantosDaParede` + `pointInPolygon` + `intersectSegments`), não pelo eixo. Arraste < 3 px é clique. `Ctrl+A` seleciona tudo. Setas deslocam um passo de grade (Shift = 10). `Escape` cancela o arraste sem gravar.

**Pronto quando:** o harness de gesto mede as três coisas (abaixo).

### 4. Editor · `components/blueprint/BlueprintEditor.tsx` + `PainelSelecaoMultipla.tsx`

Despacho de `TranslateWalls`; chave **Mover/Esticar** na barra; exclusão em massa por `runBatch` — filtrando do lote as aberturas cuja parede também está selecionada, porque `DeleteWall` já as cascateia.

**Pronto quando:** selecionar 3 paredes com uma porta, arrastar e `Ctrl+Z` volta em um passo só.

### 5. Medições · `hooks/useBlueprintMedicoes.ts`

`deslocar(ids, delta)` no molde de `reposicionar`, reusando `regravarPontos` (lote) + atualização otimista.

⚠️ **Limitação declarada:** medição **não entra no histórico de desfazer** (decisão registrada no próprio hook: `Ctrl+Z` apagando um levantamento seria irrecuperável). Mover seleção mista produz um `Ctrl+Z` que reverte **só as paredes** — a UI avisa em vez de disfarçar. Duas pilhas independentes coordenadas por uma tecla seria pior: ao terceiro `Ctrl+Z` já não corresponderiam.

**Pronto quando:** o número medido não muda (translação não altera área nem comprimento) e a forma continua sobre o mesmo ponto do desenho.

### 6. Padrão de UI (REGRA #1)

Ler `docs/ui_ux_guia_unificado.md` inteiro antes de editar; rodar `scripts/check-ui-standard.sh` em cada arquivo tocado.

## Estado

Implementado em 2026-08-19/20, sem commit ainda (a árvore tem trabalho de outra
sessão — `components/ServicesCommercialModule.tsx`, `scratch/*`).

- [x] 1. Kernel `TranslateWalls` — `utils/blueprintKernel/commands.ts`, com a conta extraída para `pontasDeslocadas` em `model.ts`
- [x] 2. `selectedIds` no hook, com `selectedId` derivado — `hooks/useBlueprintEditor.ts`
- [x] 3. Canvas — laço direcional, Ctrl+A, arraste do conjunto, setas — `components/blueprint/BlueprintCanvas.tsx`
- [x] 4. Editor — chave Mover/Esticar, `PainelSelecaoMultipla.tsx`, exclusão em massa
- [x] 5. Medições — `deslocar` reusando `regravarPontos`
- [x] 6. `scripts/check-ui-standard.sh` limpo nos 3 arquivos + conferência visual por print
- [x] 7. 8 testes de kernel + 6 de painel + harness `docs/spikes/mover-selecao/` (4/4)

**A prévia usa a mesma conta do commit.** `pontasDeslocadas` vive no kernel e é
chamada pelos dois — pelo comando e pelo desenho do arraste. Reimplementar a
regra do modo Esticar no renderizador seria a cópia que diverge em silêncio, a
mesma classe de defeito que já deixou a regra de ponta livre certa na tela e
errada no papel.

**Consertado de quebra:** `docs/spikes/arrastar-ponta/medir.mjs` estava com a
conversão de tela ANTERIOR à correção do Y espelhado (09/08/2026) — mirava
580 px acima da alça, não pegava nada e relatava "o gesto não move nada". Um
harness que sempre reprova é um harness que ninguém roda. Agora passa 3/3.

**Perf:** `docs/spikes/wall-render/perf.mjs` continua em **60 fps** sob zoom
contínuo. As listas derivadas do canvas (`paredesDoNivel`, `ambientesDoNivel`)
viraram `useMemo` no caminho — soltas, devolviam array novo a cada render e
repintavam a planta a cada mudança de estado da tela.

## Verificação

### Testes de unidade — `__tests__/blueprintKernel.test.ts`
- Translação rígida preserva todos os comprimentos e mantém as aberturas válidas.
- `arrastarVizinhas: true` puxa a ponta da vizinha que compartilha o vértice — e só dela.
- Vizinha que encolheria abaixo de uma abertura → `OPENING_OUT_OF_BOUNDS` e o modelo original não muda.
- `delta` zero, lista vazia, id inexistente.

### Harness de gesto — `docs/spikes/mover-selecao/`
⚠️ **Arrastar é gesto: jsdom não alcança.** Mede três coisas, e a terceira é a que prova:

1. laço esquerda→direita **não** pega a parede que só cruza o retângulo;
2. modo *Mover*: o bloco anda e **os comprimentos ficam idênticos**;
3. modo *Esticar*: a vizinha não selecionada **muda de comprimento** e o vértice continua único.

```bash
PLAYWRIGHT_CORE=... node docs/spikes/mover-selecao/medir.mjs http://localhost:PORTA
```

### Conferência no app (Incorporação › Planta Inteligente)
1. Desenhar um cômodo com porta e janela; traçar uma medição de área por cima.
2. `Ctrl+A` → arrastar 2 m → publicar → reabrir: tudo no lugar novo, porta e janela sem se mexer *dentro* da parede.
3. Laço direita→esquerda pegando meia planta, modo *Mover*: desencosta, e o painel de pontas soltas acusa.
4. Mesmo laço, modo *Esticar*: nada desencosta; as vizinhas alongam.
5. `Ctrl+Z` volta em um passo.
6. Selecionar 1 parede: alça de ponta, dividir, unir, espessura e esticar continuam como antes.

## Fora de escopo (declarado)

- Mover a **planta de fundo** junto com a seleção.
- **Histórico de desfazer para medições** (ver item 5).
- **Rotacionar / espelhar / copiar** a seleção — o pedido é mover.
- Editar espessura ou altura **em massa** pelo painel de seleção múltipla.
