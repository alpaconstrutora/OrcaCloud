# Planta Inteligente — Vistas (4 elevações + 3D) + gestão de pavimentos

## Pedido original

> incorporação < planta inteligente:
> implementar vistas (laterais, frente, fundos e 3d)

Sessão de 2026-08-28→29 (plan mode).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-08-29 | Como o sistema decide qual lado é a "frente" nas elevações? | **Seguir a divisa marcada FRENTE** — deriva a base ortonormal da normal externa da divisa de `papel = 'FRENTE'`; cai para eixos fixos do modelo (frente = face de menor Y) quando não há divisa marcada. |
| 2026-08-29 | Qual o escopo de pavimentos nesta entrega? | **Incluir gestão de pavimentos** — nível ativo na planta baixa, adicionar / editar cota e pé-direito / duplicar / remover. Novos comandos no kernel (`SetLevelProps`, `RemoveLevel`, `DuplicateLevel`). |
| 2026-08-29 | As 4 elevações entram na exportação (PDF/DXF) agora? | **Incluir agora** — PDF + DXF + PNG pela aba Versões. |

## Contexto

O módulo **Planta Inteligente** (`components/blueprint/`, tabelas `blueprint_*`, kernel
`utils/blueprintKernel/`) hoje só tem **planta baixa 2D** (`BlueprintCanvas`, Canvas 2D,
decisão DP-03). O kernel já guarda tudo que uma elevação precisa
(`Wall.heightMm/thicknessMm`, `Level.elevationMm/defaultHeightMm`,
`Opening.sillMm/heightMm/widthMm/offsetMm/kind`) e o vocabulário
`BoundaryPapel = 'FRENTE'|'FUNDOS'|'LATERAL_DIREITA'|'LATERAL_ESQUERDA'`. Falta a
**projeção** (o kernel não tem noção de plano vertical / cota Z) e a **UI multi-pavimento**
(o editor fixa `editor.model.levels[0]`, `BlueprintEditor.tsx:359`).

### Desvio do plano aprovado (registrado 2026-08-29)

O plano em `~/.claude/plans/` previa **bump de `KERNEL_VERSION`**. Ao ler o código,
confirmou-se que **nenhuma mudança é de FORMATO do payload canônico**: `elevation.ts`
é só função de leitura, e `SetLevelProps`/`RemoveLevel`/`DuplicateLevel` produzem
modelos normais sem campo novo em `canonicalPayload`. Bump gratuito invalidaria o
hash de todo snapshot do acervo e obrigaria a recapturar os 6 goldens sem motivo.
**Decisão: não bumpar `KERNEL_VERSION`; goldens de `blueprintKernelGoldens.test.ts`
ficam intactos.** Se algum hash de golden mudar durante a implementação, é regressão
de geometria — parar e investigar.

## Plano

### A. Projeção — `utils/blueprintElevation.ts` (novo)
> **Desvio 2026-08-29:** ficou em `utils/blueprintElevation.ts` (irmão de
> `blueprintTerreno.ts`/`blueprintCotas.ts`), **não** dentro de `utils/blueprintKernel/`.
> Motivo: precisa de `medirTerreno` (que vive em `blueprintTerreno.ts`) para achar a
> divisa FRENTE, e o kernel não importa para fora de si. Continua PURO (sem React/
> canvas/three). Sem mudança em `index.ts`, sem bump de `KERNEL_VERSION`.

Função pura. Zero import de React/three/canvas.
- `baseDaElevacao(model, direcao)` → `{ origem, u, d }`: base ortonormal. Com divisa
  `papel:'FRENTE'` → base pela direção dessa divisa, `d` = normal externa (orientada
  pelo `interiorPoint` do anel de `kind:'TERRENO'`); as outras 3 direções por rotação
  de 90°. Sem divisa FRENTE → convenção fixa: FRENTE olha `+Y`/`u=+X`, FUNDOS `-Y`/`-X`,
  LATERAL_DIREITA `-X`/`u=+Y`, LATERAL_ESQUERDA `+X`/`u=-Y`.
- `projetarElevacao(model, { direcao, levelIds? })` → `ProjecaoElevacao` com `paredes`
  (`RetanguloElevacao[]`, ordenadas por `profundidade` decrescente), `aberturas`
  (`AberturaElevacao[]`), `linhaDoSolo`, `bbox`. `uSpan` pela projeção de
  `cantosDaParede(a,b,thickness)` em `u`; `vSpan = [elevationMm, elevationMm+heightMm]`;
  `ehContorno` por coincidência do eixo (±tol) com `contornoExternoDoNivel`;
  `degenerada` se `uSpan < DEFAULT_TOLERANCE_MM`.
- `perfilDaParedeComVaos(model, wall)` → `PerfilParede` (retângulo + furos), consumido
  pelo renderer 2D e pelo 3D.
- **Pronto:** `npx vitest run __tests__/blueprintElevation.test.ts` verde; `tsc` limpo;
  `__tests__/blueprintKernelGoldens.test.ts` intacto.

### B. Kernel — `utils/blueprintKernel/commands.ts`
- `SetLevelProps { levelId, name?, elevationMm?, defaultHeightMm? }` — invariantes
  `defaultHeightMm > 0` inteiro, `elevationMm` inteiro.
- `RemoveLevel { levelId }` — cascade em walls/openings/boundaries/labels do nível;
  recusa o último nível (`LAST_LEVEL`).
- `DuplicateLevel { levelId, novoNome, elevationMm }` — cria nível e copia
  walls/openings/boundaries/labels (ids novos via `nextId`).
- **Pronto:** `npx vitest run __tests__/blueprintLevelCommands.test.ts` verde;
  `assertModelInvariants` roda em todos.

### C. `hooks/useCanvasVista.ts` (novo)
Câmera 2D reutilizável: `Vista {escala,dx,dy}`, `paraTela`/`paraMundo` (flip de Y),
pan por arraste, zoom na roda com pivô, `enquadrar(bbox)`.

### D. `components/blueprint/ElevationCanvas.tsx` (novo)
Renderer 2D read-only. Painter's algorithm: linha do solo → paredes opacas por
profundidade → contorno externo por nível em traço forte → recortes de abertura.
Toggle "Paredes internas" (default OFF). Cotas de altura e rótulos de esquadria
opcionais. `enquadrar(projecao.bbox)` no mount e ao trocar `direcao`.

### E. `components/blueprint/Blueprint3DViewer.tsx` + `Blueprint3DTab.tsx` (novos)
Segue `components/planta_ai/View3DTab.tsx` + `Building3DViewer.tsx`: `React.lazy` +
`<Suspense>`, `// @ts-nocheck`, `@react-three/fiber` + `@react-three/drei` (deps já
instaladas). Extrusão sem CSG: `THREE.Shape` do perfil da parede + `THREE.Path` por
furo → `ExtrudeGeometry(depth: espessuraMm)`. Empilha `levels` por `elevationMm`.
Laje por nível opcional (`contornoExternoDoNivel` extrudado). `OrbitControls` + overlay.
Merge por nível (`BufferGeometryUtils.mergeGeometries`) se a fixture de stress cair de 30 fps.

### F. `components/blueprint/SeletorDeVista.tsx` (novo)
Segmented control §19.1 (`docs/ui_ux_guia_unificado.md`): trilho `bg-gray-50`, ativo
`bg-white text-blue-600 shadow-sm`, `flex-wrap`, `h-7`. 6 segmentos: Planta · Frente ·
Fundos · Lat. esquerda · Lat. direita · 3D.

### G. `components/blueprint/PainelPavimentos.tsx` (novo)
Faixa acima do `AbasDoPainel`. Lista `model.levels`; radio de nível ativo (planta) /
multi-check de níveis visíveis (vistas). Adicionar (`AddLevel`) / Editar (`SetLevelProps`)
/ Duplicar (`DuplicateLevel`) / Remover (`useConfirm` + `RemoveLevel`, desabilitado com 1 nível).

### H. `components/blueprint/BlueprintEditor.tsx`
(1) `vista` em `usePersistedState('blueprint:vista','planta')`; (2) `<SeletorDeVista>`
entre `<header>` (l.1936) e `<div role="toolbar">` (l.1944); (3) toolbar de desenho só
em `vista==='planta'`, senão barra mínima; (4) `nivelAtivoId` em
`usePersistedState('blueprint:nivelAtivo',null)` substitui `levels[0]` na l.359;
(5) `levelIds` do `PainelPavimentos`; (6) swap do slot do canvas (~l.2545) para
`ElevationCanvas` / `Blueprint3DTab` com `projetarElevacao` memoizado; (7) `AbasDoPainel`
com `ambientes`/`vetor`/`medicoes`/`orcamento` desabilitadas fora da planta, fallback
para `quantitativos`; (8) `<PainelPavimentos>` acima das abas; (9) conferir
`envelope`/`topoMm`/`pavimentosDesenhados` com nível ativo.
- **Pronto:** `rodar-app` cicla as 6 vistas sem erro JS/console/4xx; `blueprint:vista`
  e `blueprint:nivelAtivo` persistem; `bash scripts/check-ui-standard.sh` limpo nos
  `.tsx` tocados.

### I. Exportação — `utils/blueprintExport.ts`, `utils/blueprintDxf.ts`, `services/blueprintExportService.ts`, `components/blueprint/PainelVersoes.tsx`
`desenharElevacao(desenhista, projecao)` + `desenharPranchas([...])` com carimbo por
prancha; camadas DXF `ELEVACAO-*`; opção `pranchas[]` nos exportadores; checkboxes
"Pranchas" (Planta + 4 elevações) no `PainelVersoes`. IFC/manifesto inalterados.

### Testes / harness
- `__tests__/blueprintElevation.test.ts` — goldens: sala retangular c/ porta+janela,
  planta em "L", 2 níveis empilhados, lote c/ divisa FRENTE girada × 4 direções.
- `__tests__/blueprintLevelCommands.test.ts` — os 3 comandos novos.
- `docs/spikes/blueprint-elevation/*` e `docs/spikes/blueprint-3d/*` — harness Playwright
  (padrão `docs/spikes/wall-render/`), captura `pageerror`.
- Estender `__tests__/blueprintExport.test.ts` / `blueprintDxf*` para elevações.

## Fora de escopo

HLR real / linhas ocultas tracejadas · telhado · terreno e recuos nas vistas · símbolo
de esquadria (folha, bandeira, montante) · materiais/HDRI/sombra fina no 3D · câmera
ortográfica no 3D · edição a partir das vistas · refatorar `BlueprintCanvas` para
`useCanvasVista` · IFC com portas/janelas · direção derivada da normal de cada
`Boundary` individual (v1 usa só a divisa FRENTE por rotação de 90°).

## Estado

- [x] **Fase 0** — plano oficial criado (2026-08-29).
- [x] **Fase 1** — `utils/blueprintElevation.ts` (`baseDaElevacao`, `projetarElevacao`,
  `perfilDaParedeComVaos`) + comandos `SetLevelProps`/`RemoveLevel`/`DuplicateLevel`
  em `commands.ts`. Testes: `__tests__/blueprintElevation.test.ts` (8),
  `__tests__/blueprintLevelCommands.test.ts` (8). `tsc` limpo, 586 testes blueprint
  verdes, goldens do kernel INTACTOS (sem bump de versão).
- [x] **Fase 2** — `hooks/useCanvasVista.ts` (câmera pan/zoom/enquadrar) +
  `components/blueprint/ElevationCanvas.tsx` (painter's algorithm, toggle "Paredes
  internas", cotas de altura, rótulos de esquadria) + harness
  `docs/spikes/blueprint-elevation/*`. `passeio.mjs` percorre as 4 direções sem erro
  de console; prints conferidos: fachada com porta/janela na cota certa, dois
  pavimentos empilhados, silhueta-só quando "internas" OFF.
- [x] **Fase 3** — `components/blueprint/Blueprint3DViewer.tsx` (`@ts-nocheck`,
  extrusão do perfil da parede com furos via `THREE.Shape`+`THREE.Path`, sem CSG;
  laje opcional; `OrbitControls` + overlay) + `Blueprint3DTab.tsx` (`React.lazy` +
  `<Suspense>`) + harness `docs/spikes/blueprint-3d/*`. `passeio.mjs`: cena carrega
  sem `pageerror`/erro de console, chunk three só entra ao abrir a aba, furos
  visíveis, stress de 180 paredes renderiza. `tsc` limpo.
- [x] **Fase 4** — `components/blueprint/SeletorDeVista.tsx` (segmented control §19.1,
  6 vias) + `components/blueprint/PainelPavimentos.tsx` (radio nível ativo / multi-check
  visíveis + Adicionar/Editar/Duplicar/Remover com `useConfirm`) + fiação no
  `BlueprintEditor.tsx`: `blueprint:vista` e `blueprint:nivelAtivo` persistidos;
  `nivelAtivoId` resolvido no lugar de `levels[0]` (l.398); barra de vista entre header
  e toolbar; toolbar de desenho só em `vista==='planta'`; swap do slot do canvas para
  `ElevationCanvas`/`Blueprint3DTab`; abas do painel reduzidas a Quantitativos/Versões
  fora da planta; `niveisVisiveis` sincronizado com os níveis reais. `tsc` limpo,
  `npm run build` verde (chunk `Grid` do three fica lazy, fora do bundle principal).
- [x] **Fase 5** — `desenharElevacao` + `enquadrarElevacao` em `utils/blueprintExport.ts`;
  camadas `ELEVACAO-*` + `elevacoes?` em `utils/blueprintDxf.ts`;
  `exportarPranchasPdf`/`exportarPranchasPng` + `exportarDxf(…, elevacoes)` em
  `services/blueprintExportService.ts`; grupo de checkboxes "Pranchas" (Planta + 4
  elevações) em `components/blueprint/PainelVersoes.tsx`. Teste
  `__tests__/blueprintElevationExport.test.ts` (5). PDF = 1 página por prancha; PNG =
  1 arquivo por prancha; DXF = elevações como blocos à direita da planta. IFC/manifesto
  inalterados (IFC já é 3D).
- [x] **Fase 6** — walkthrough `rodar-app` no app real (2026-08-29): login → Planta
  Inteligente → abrir estudo "Planta 23/08/2026". As 6 vistas renderam (Frente com
  portas recortadas + cota 2,80 m; 3D com a planta real extrudada); barra de desenho
  some fora da planta, abas caem para Quantitativos/Versões; `PainelPavimentos`
  Adicionar/form/salvar funcionou (cota sugerida 5,60 m = topo). **Nenhum erro de JS
  do código novo** — só ruído pré-existente (RPCs da Central de Controle com
  `statement timeout`; aviso de hydration `<colgroup>` do `BlueprintModule`, alheio a
  esta entrega). `tsc` limpo, `npm run build` verde, 1786 testes passam, goldens do
  kernel intactos.

## Follow-ups (fora desta entrega)

- Merge de geometria por nível no 3D (`BufferGeometryUtils.mergeGeometries`) se o
  número de paredes derrubar o fps — hoje é uma mesh por parede.
- Corrigir o aviso de hydration do `<colgroup>` em `BlueprintModule` (pré-existente).
- Remoção de linha oculta real nas elevações; símbolo de esquadria; telhado.

## Verificação

1. `npx vitest run __tests__/blueprintElevation.test.ts __tests__/blueprintLevelCommands.test.ts __tests__/blueprintKernelGoldens.test.ts`
2. `node docs/spikes/blueprint-elevation/passeio.mjs` · `node docs/spikes/blueprint-3d/passeio.mjs`
3. `rodar-app`: Incorporação › Planta Inteligente → abrir estudo → ciclar as 6 vistas;
   marcar divisa FRENTE e ver realinhamento; `PainelPavimentos` Adicionar/Duplicar/Editar/Remover;
   recarregar e conferir persistência de `blueprint:vista`/`blueprint:nivelAtivo`.
4. Aba Versões → exportar PDF/DXF/PNG com Planta + 4 elevações.
5. `bash scripts/check-ui-standard.sh` nos `.tsx` tocados.
6. `tsc --noEmit` limpo; `npm run build` verde; sem regressão na planta baixa.
