# Canto de parede aberto na vista 3D (e no IFC) — Planta Inteligente

## Pedido original

> incorporacao < planta interligente: veja pela print que as paredes nao estao
> sendo corretamente conectadas, nao formam cantos. a conexão se sempre no eito
> de centro e nao pelas cantos da parede mesmo tendo selecionado para serem assim

(sessão de 2026-08-30, com print da vista 3D em close, mostrando entalhes nos
cantos e pontas de parede que morrem no eixo.)

Respostas de esclarecimento na mesma sessão:
- **"2D fecha, só o 3D abre"** — na planta baixa os cantos estão corretos.
- **Escopo: 3D + IFC** — corrigir os dois na mesma passada.

---

## Contexto

O modelo guarda parede como **eixo + espessura** (`Wall` em
[model.ts:32](orçacloud-saas/utils/blueprintKernel/model.ts#L32)). O corpo com
espessura é derivado por cada renderizador, e o quanto a ponta avança além do
eixo na junção é uma regra **única do kernel**:
[`extensaoDeCanto`](orçacloud-saas/utils/blueprintKernel/model.ts#L658) —
`(t/2)/tg(θ/2)`, teto de 4 meias-espessuras, `0` em ponta livre.

Quem já aplica essa régua:
- planta baixa — [BlueprintCanvas.tsx:1769-1770](orçacloud-saas/components/blueprint/BlueprintCanvas.tsx#L1769)
- encaixe/ímã — [BlueprintCanvas.tsx:1189-1190](orçacloud-saas/components/blueprint/BlueprintCanvas.tsx#L1189)
- exportação PDF/DXF — [blueprintExport.ts:333-334](orçacloud-saas/utils/blueprintExport.ts#L333)

Quem **não** aplica — a causa do print:
- **vista 3D** — [`geometriaDaParede`](orçacloud-saas/components/blueprint/Blueprint3DViewer.tsx#L50)
  extruda o perfil frontal com `L = perfil.comprimentoMm`, que é
  `wallLength(wall)`, **eixo a eixo**
  ([blueprintElevation.ts:328](orçacloud-saas/utils/blueprintElevation.ts#L328)).
  Cada parede vira uma caixa independente que termina exatamente no vértice do
  eixo. Num canto em L de espessura `t`, sobra um entalhe de `t/2 × t/2` na face
  externa — exatamente o buraco do print.
- **exportação IFC** — [`emitirParede`](orçacloud-saas/utils/blueprintIfc.ts#L247)
  emite `IFCRECTANGLEPROFILEDEF(wallLength(w), thicknessMm)`, mesmo defeito, e
  ele viaja para Revit/Navisworks.

**O modelo NÃO muda.** A conexão no eixo é decisão registrada
(`docs/planos/2026-08-27-conexao-pela-face-e-medida.md`): o arranjo planar monta
o grafo a partir dos eixos, e ponta que pare na face deixa vértice de grau 1 →
o anel não fecha e o ambiente some com área e quantitativo junto. O que o
usuário pediu — "conectar pelos cantos" — é o que ele **vê**, e é lá que se
corrige. `KERNEL_VERSION` (0.7.0) **não sobe**: o payload canônico não muda.

---

## Mudanças

### 1. `utils/blueprintElevation.ts` — o perfil passa a carregar o avanço

`perfilDaParedeComVaos` é consumido **só** pelo viewer 3D (grep confirmou:
apenas `Blueprint3DViewer.tsx:51` e o próprio teste). Acrescentar dois campos a
`PerfilParede`, sem mexer no significado de `comprimentoMm` (segue sendo o eixo
— o teste em `blueprintElevation.test.ts:219` continua valendo):

```ts
/** Avanço além do eixo em cada ponta, em mm. Vem de `extensaoDeCanto`. */
avancoAMm: number;
avancoBMm: number;
```

Calculados com `extensaoDeCanto` importado do kernel, **contra as paredes do
MESMO nível**, não `model.walls` inteiro:

```ts
const doNivel = model.walls.filter((w) => w.levelId === wall.levelId);
avancoAMm: extensaoDeCanto(doNivel, wall, 'a'),
avancoBMm: extensaoDeCanto(doNivel, wall, 'b'),
```

O recorte por nível é o que `BlueprintCanvas` já faz (`paredesDoNivel`). Sem
ele, uma parede do 2º pavimento em cima de uma do térreo compartilha o vértice
e vira "vizinha" — `isFreeWallEnd` não olha `levelId`. Comentar essa razão no
código.

**Pronto quando:** o perfil de uma parede em canto reto de 150 mm devolve
`avanco = 75`; ponta livre devolve `0`; hexágono devolve `(t/2)/tg(60°)`.

### 2. `components/blueprint/Blueprint3DViewer.tsx` — estender a extrusão

Em `geometriaDaParede` ([:50-94](orçacloud-saas/components/blueprint/Blueprint3DViewer.tsx#L50)),
o `THREE.Shape` deixa de ir de `0` a `L` e passa a ir de `-avancoA` a
`L + avancoB` (em metros, pelo mesmo `S`):

```ts
const x0 = -perfil.avancoAMm * S;
const x1 = (perfil.comprimentoMm + perfil.avancoBMm) * S;
```

**A origem local continua em `wall.a`**, então:
- `position` e `quaternion` ficam **inalterados**;
- os furos das aberturas (`f.x0`/`f.x1`, medidos a partir de `a`) ficam
  **inalterados** — só o clamp do `EPS` passa a usar `x0`/`x1` em vez de `0`/`L`.

Comentar no código por que o avanço vem do kernel e não é meia espessura
recalculada (é a mesma armadilha já documentada em `cantosDaParede`).

**Pronto quando:** no canto em L do harness, a caixa da parede horizontal chega
até a face externa da vertical (avanço = `t/2` a 90°), e o entalhe some.

### 3. `utils/blueprintIfc.ts` — mesmo avanço no sólido extrudado

O laço já filtra por nível (`:170`), então passar essa lista no `ctx` de
`emitirParede`:

- `comp = wallLength(w) + eA + eB`, com `eA/eB = extensaoDeCanto(paredesDoNivel, w, 'a'|'b')`;
- o `IFCRECTANGLEPROFILEDEF` é **centrado**, então o ponto do
  `IFCAXIS2PLACEMENT3D` deixa de ser o meio do eixo e passa a ser o meio do
  trecho estendido — deslocar o centro em `(eB − eA)/2` ao longo do versor do
  eixo. Sem isso a parede fica com o comprimento certo e a posição errada.

**Pronto quando:** o teste novo (item 5) confere comprimento e centro em canto
reto, em ponta livre e em junção assimétrica (`eA ≠ eB`).

### 4. `docs/spikes/blueprint-3d/` — cenário que discrimina

O `main.tsx` atual monta um "L" ortogonal **na origem** e o `passeio.mjs` só
falha em erro de console — ele não vê o entalhe. Acrescentar:

- um cenário `?canto=1` que enquadra um canto de perto (câmera baixa, como o
  print do usuário) e grava `saida-canto.png`;
- mover a fixture para **longe da origem e assimétrica** (memória:
  `project_blueprint_canvas_y_espelhado` — fixture simétrica na origem não
  distingue `z=y` de `z=−y`);
- um canto **obtuso** (120°) além dos retos, que é onde meia-espessura fixa
  erraria e o entalhe é mais visível.

**Pronto quando:** rodando o harness no código atual o PNG mostra o entalhe, e
depois da correção não mostra. É o par antes/depois que prova, não o exit 0.

### 5. Testes

- `__tests__/blueprintElevation.test.ts` — bloco novo para `avancoAMm/avancoBMm`
  (canto reto = `t/2`, ponta livre = `0`, hexágono pelo ângulo, paredes de outro
  nível não contam como vizinha).
- `__tests__/blueprintIfc.test.ts` (**novo** — não existe hoje) — parseia o
  `IFCRECTANGLEPROFILEDEF` e o `IFCCARTESIANPOINT` emitidos e confere
  comprimento + centro nos três casos do item 3.

---

## O que este plano NÃO faz (e por quê)

- **Não persiste `AlinhamentoParede`.** Ele é estado da ferramenta de desenho
  ([BlueprintEditor.tsx:472](orçacloud-saas/components/blueprint/BlueprintEditor.tsx#L472)),
  aplicado uma vez no clique por `eixoDaParede`. Persistir é mudança de payload
  canônico → bump de `KERNEL_VERSION` e reconciliação de hash de versões já
  publicadas. Fica registrado como pendência separada: hoje, mudar a espessura
  depois (`SetThickness`) faz a parede crescer para os dois lados a partir do
  eixo, saindo do canto que o usuário apontou.
- **Não faz mitra verdadeira (ponta em bisel) nem CSG.** A extrusão do perfil
  frontal é o que abre porta e janela sem booleano; trocá-la por footprint
  mitrado exigiria CSG para os vãos. A ponta reta estendida fecha exatamente o
  canto até ~90° e é a **mesma** solução já aceita no 2D e no PDF — uma régua,
  três renderizadores.
- **Não mexe na vista de elevação** (`projetarElevacao`/`ElevationCanvas`).
  Provavelmente tem o mesmo desconto de canto faltando na silhueta da fachada,
  mas não foi o que o usuário reportou. Anotar como pendência.

---

## Verificação

1. `npx vitest run __tests__/blueprintElevation.test.ts __tests__/blueprintIfc.test.ts __tests__/blueprintKernel.test.ts __tests__/blueprintKernelGoldens.test.ts`
   — os **goldens têm de passar sem tocar em nada**: se um golden mexer, a
   mudança vazou para o payload canônico e o diagnóstico está errado.
2. `npx vitest run __tests__/blueprintExport.test.ts` — a régua do PDF não pode
   ter mudado de valor.
3. Harness 3D, com `npm run dev` na 3100 e a partir de `c:/tmp/pwtest`:
   `PLAYWRIGHT_CORE=… node docs/spikes/blueprint-3d/passeio.mjs` — comparar
   `saida-canto.png` **antes e depois**.
4. **No app de verdade** (`/rodar-app`): abrir a Planta Inteligente do mesmo
   estudo do print, aba 3D, orbitar até o canto reclamado e conferir que fechou —
   e que a planta baixa (2D), que já estava certa, **não** mudou.
5. `npx tsc --noEmit` — lembrando que `Blueprint3DViewer.tsx` é `@ts-nocheck`, a
   validação dele é o harness do passo 3, não o compilador.

---

## Passo 0 da implementação (REGRA #6)

Copiar este plano para
`orçacloud-saas/docs/planos/2026-08-30-canto-de-parede-no-3d-e-ifc.md`, com a
seção `## Pedido original` transcrita literalmente como está acima, e manter
**aquele** arquivo atualizado conforme o trabalho anda.

---

# Adendo — as duas pendências, fechadas (30/08/2026)

## Pedido

> corrigir as duas pendencias

As duas que este plano havia registrado como fora de escopo.

## Pendência 2 — a elevação tinha o mesmo defeito

`projetarElevacao` chamava `cantosDaParede(a, b, thickness)` **sem os avanços**
(os dois últimos argumentos são `0` por padrão), então a fachada era projetada de
eixo a eixo e a silhueta ficava curta meia espessura em cada ponta que encontra
outra parede — um degrau no canto da edificação que não existe na obra.

Corrigido em `utils/blueprintElevation.ts` passando `extensaoDeCanto` das paredes
do MESMO nível, como o desenho, o 3D e o PDF.

**A prova de que o número novo é o certo já estava no próprio teste:** o `bbox`
da projeção JÁ era `−75…4075` (as paredes laterais o esticavam com a própria meia
espessura) enquanto o retângulo da fachada dizia `0…4000`. Era a fachada que
discordava do próprio edifício. Goldens de elevação atualizados com essa nota, e
dois casos novos travam a outra metade da régua: ponta livre não avança, e canto
de um lado só avança de um lado só.

## Pendência 1 — o alinhamento agora é persistido (kernel 0.8.0)

`Wall` ganhou `alinhamento` (`EIXO`/`DIREITA`/`ESQUERDA`) — de que lado do eixo
estava o traço clicado. **O campo não move nada e não muda a topologia**: `a`/`b`
continuam sendo o eixo e a conexão continua pelo eixo (decisão de 27/08/2026
preservada). Ele é memória da autoria.

O que ele destrava: `deslocamentoParaManterFace(wall, novaEspessura)` (kernel,
puro) diz para onde levar o eixo para que a face traçada fique parada. A troca de
espessura na UI virou um LOTE de dois comandos:

```
SetThickness  +  TranslateEntities({ manterJuncoes: true })
```

**`manterJuncoes` é o que torna isto seguro, e não é detalhe.** Mover o eixo de
lado desencaixaria o vértice compartilhado com a vizinha, o anel abriria e o
ambiente sumiria com área e quantitativo junto. Com ele, a ponta da vizinha
acompanha pela componente paralela ao eixo DELA: a vizinha muda de comprimento,
nunca de direção. Há um teste dedicado a esse invariante (`spaces` continua com 1
depois de engrossar uma parede da sala).

Sutileza tratada: `MergeWalls` pode percorrer a primeira parede AO CONTRÁRIO
(caso `first.a === second.a`), e aí a face que era à DIREITA passa a estar à
ESQUERDA. O lado é invertido pela mesma pergunta que o comando já fazia para o
offset das aberturas.

### Bump de KERNEL_VERSION 0.7.0 → 0.8.0

Emitido no payload **só quando difere de `'EIXO'`**, para não engordar a forma
canônica de todo desenho do acervo. Ausente = `'EIXO'` = o comportamento de
sempre, então desenho antigo continua idêntico.

O protocolo dos goldens foi cumprido, não presumido: com a string de versão
trocada de volta para 0.7.0, os sete testes voltaram a passar sem nenhuma outra
alteração — o que só acontece se os seis payloads baterem byte a byte com o
golden anterior. As contagens de ambientes (9/49/144/3/78/4) são afirmadas na
linha ANTES do hash e não falharam em momento nenhum. Também aproveitei para
registrar a entrada **0.7.0**, que faltava no histórico de `units.ts`.

## Verificação

- Suíte inteira: **1975 passam, 24 skip**. `tsc --noEmit` limpo. Travas do repo
  (`migrationsPrefixo`, `orgContextGuard`) passam.
- 8 casos novos para o alinhamento, incluindo o invariante do ambiente, o
  round-trip do payload e a inversão no merge.
- **No app**: elevação de FRENTE da planta real desenha uma silhueta contínua,
  fechada nas duas pontas. A troca de espessura foi exercitada num estudo
  DESCARTÁVEL (criado e apagado), com "na face · parede à direita": de 150 para
  250 mm a face traçada ficou **no mesmo pixel** e só a face oposta andou — antes
  as duas andariam 50 mm cada.

## Erro cometido e corrigido

No primeiro script de verificação eu cliquei a ferramenta Parede sobre a planta
REAL (`Planta 23/08/2026`) e deixei lá uma parede que ninguém desenhou: a
contagem foi de 33 para 34. Encontrada (horizontal longa e solta, fora da
edificação), selecionada e removida; a planta voltou a **33 paredes · 6
ambientes**, com terreno 250,30 m² e perímetro 70,06 m — igual à captura feita
antes de eu tocar nela. Os quatro estudos de rascunho que meus testes criaram
também foram apagados.

**Lição para o próximo:** verificação que ESCREVE não se faz no dado do usuário.
O estudo descartável tinha de ter sido o primeiro passo, não o segundo.
