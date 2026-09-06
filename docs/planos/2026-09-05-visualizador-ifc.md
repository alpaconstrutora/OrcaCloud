# Visualizador de IFC dentro do app (Etapa 4 do roadmap BIM, item 1)

## Pedido original

> usar o ifc como modelo 3d faz todo sentido . importar planta de fundo comom
> modelo ifc como eu pedi nao faz muito sentido

E, à pergunta *"Quer que eu comece por aí?"* (pela primeira parte da Etapa 4, o
visualizador):

> sim

Sessão `b7041736-bf7a-4895-a5ec-193e752d57b7` · 2026-09-05. Nasceu de um defeito
real: o usuário tentou importar `Modelo 3D - Estrutural 10-02-26.IFC` (1,28 MB,
do calculista) como planta de fundo, e a tela falhou
([[planta-fundo-formato-ifc]]). A conclusão dele é a premissa deste plano — **as
duas coisas são de naturezas diferentes**: planta de fundo é imagem para traçar
por cima; um IFC chega com a informação viva, e rasterizá-lo joga fora
exatamente o que ele tem de melhor.

Contexto: `[[bim-lab-spike]]` (o spike já funciona em `c:\D\ORÇACLOUD\bim-spike\`)
e a Etapa 4 de `[[blueprint-roadmap-bim]]`.

## Decisões de desenho

### 1. Módulo PRÓPRIO, não uma aba da Planta Inteligente

O IFC de terceiro **não é o desenho do usuário**. Pendurá-lo no editor faria o
estado dele carregar um modelo que não se edita, não entra no payload canônico e
não tem `uid` do kernel — três exceções dentro de um componente que já tem 4.000
linhas. É a Fase 0 do BIM LAB, e o BIM LAB é módulo.

Entra como `bim-viewer` no dropdown de Incorporação, ao lado de Planta
Inteligente. Vista nova não exige tipo novo (`activeView: string`) nem chave de
permissão (o padrão em `AppRouter` é permitir; só views listadas são barradas).

### 2. Fase 1 SEM persistência — abre do disco, vê, fecha

É o que entrega hoje o que o usuário tentou fazer, e é o que valida a stack **no
build de produção**, que é onde mora o risco real: wasm servido, tamanho do
bundle, Vercel.

Persistir traz bucket, RLS, tabela e a decisão de schema `digital_files` →
`digital_objects` (adotada no PRD do BIM LAB, ver [[bim-lab-spike]]). É outro
peso e outra fase — e é melhor decidida **depois** de ter olhado modelos reais no
visualizador, sabendo o que de fato precisa ser guardado.

Consequência aceita e dita na tela: fechar a aba perde o modelo carregado.

### 3. Tudo LAZY: quem nunca abre BIM não paga nada

O `.wasm` são 1,16 MB, mais o JS do `web-ifc` e o `three`. O módulo é
`React.lazy` (como os outros ~30 do `AppRouter`), e o `import('web-ifc')` é
**dinâmico dentro dele**. O build já avisa de chunks acima de 500 kB; este não
pode entrar no chunk inicial.

### 4. O `.wasm` é COPIADO do `node_modules` no build

Nem commitado, nem por CDN. Commitar pina a versão à mão e o arquivo envelhece
calado no primeiro `npm update`; CDN é o erro clássico de mismatch que o README
do spike já documenta. Um plugin inline em `vite.config.ts` copia
`node_modules/web-ifc/web-ifc.wasm` para um caminho fixo, e a versão bate sempre
com a instalada.

`web-ifc` sai de `devDependencies` para `dependencies`: hoje ele está lá só
porque `blueprintIfcRoundTrip.test.ts` o usa em Node (e passa). Passando a rodar
no navegador, é dependência de produção.

### 5. A geometria mesclada do spike é o ponto de partida, com a limitação dita

Dois meshes (opaco/transparente) com vertex colors — bom para FPS, ruim para
raycast fino. O próprio README do spike declara: produção deveria usar
`three-mesh-bvh` e instancing por tipo. **Não entra agora**: otimizar antes de
medir com modelo real é escolher sem dado.

### 6. Medir com o IFC REAL do usuário, não com o exemplo

A memória do spike aponta isso como *"o próximo passo real"* e nunca foi feito —
os samples são `AC20-FZK-Haus` (2,5 MB) e `DigitalHub` (14 MB), modelos de
demonstração. O `Modelo 3D - Estrutural 10-02-26.IFC` do usuário continua no
storage (órfão desde a limpeza de 05/09) e é um modelo de obra de verdade.

## Plano — um item por arquivo, com critério de pronto

### Fase 0 — Plano e medida ✅ (05/09/2026)
- [x] Este arquivo (REGRA #6), com o pedido literal.
- [x] **A medida com o modelo REAL de obra**, que a memória do spike apontava
  como "o próximo passo real" e nunca fora feita. Baixei o
  `Modelo 3D - Estrutural 10-02-26.IFC` do storage (ficou órfão na limpeza) e
  rodei o parser:

  | | |
  |---|---|
  | arquivo | 1,22 MB, **IFC4** |
  | init do wasm | 10 ms |
  | parse | 12 ms |
  | geometria | 31 ms |
  | **total até navegável** | **54 ms** |
  | produtos com forma | 449 |
  | triângulos | 10.375 |
  | elementos | 203 vigas · 104 pilares · 85 estacas · 46 sapatas · 10 lajes · 5 pavimentos |
  | property sets | 2.132 |
  | **`IfcElementQuantity`** | **ZERO** |

  **Veredito: go client-side, com folga.** O limiar do spike era "<8 s ok"; deu
  54 ms. Não é um modelo grande — é o que o usuário tem, e é estrutural (saída
  do AltoQi Eberick), sem paredes nem esquadrias.

  ⚠️ **Nenhum `IfcElementQuantity`.** Responde uma pergunta que o spike deixara
  aberta: **o quantitativo NÃO vem do arquivo**. Quem quiser área e volume deste
  modelo terá de calculá-los da malha. Isso é escopo da Etapa 3, e agora tem
  número.

  O que sobra desta medida: os PSets são ricos — a estaca E1 traz
  `StrengthClass=C-25`, `ConcreteCover=3`, `ConstructionMethod=InSitu`, e as
  vigas trazem `AltoQi_Eberick_Cargas`. É informação de projeto de verdade, não
  só geometria.

### Fase 1 — O visualizador ✅ (05/09/2026)
- [x] `package.json` — `web-ifc` de `devDependencies` para `dependencies`.
- [x] `vite.config.ts` — plugin `webIfcWasm`: serve em dev e emite no build, do
  `node_modules`, em caminho FIXO. Não commitado (envelheceria calado no
  primeiro `npm update`) nem por CDN (o mismatch que o spike documenta).
  Caminho fixo e não `?url` com hash porque `SetWasmPath` recebe um DIRETÓRIO e
  concatena o nome.
- [x] `services/ifcViewerService.ts` — carrega o parser sob demanda, converte
  em malhas, lê propriedades. **Uma malha por produto**, e não os dois meshes
  mesclados do spike: num mesh mesclado o raycast devolve um triângulo sem dono,
  e a seleção seria impossível. O preço em draw calls está medido acima.
- [x] `usarCaminhoDoWasm` — gancho de teste, no molde de `usarGeradorDeUid`: o
  caminho de produção é absoluto e em Node vira `C:\wasm\`. Sem a costura, a
  conversão de geometria — a parte que mais erra — só seria verificável abrindo
  o navegador.
- [x] `components/bim/BimViewerModule.tsx` — **Three puro, não R3F**: os outros
  dois visualizadores do app carregam `@ts-nocheck` por causa da augmentation
  de JSX do R3F, e um módulo que manipula buffers de arquivo alheio é o último
  lugar onde se quer abrir mão do compilador.
- [x] `AppRouter` + `Layout` — vista `bim-viewer` no dropdown de Incorporação.
- [x] **Pronto**: `dist/assets/web-ifc-api-*.js` (3,1 MB) é chunk PRÓPRIO, fora
  do `index-*.js`; `dist/wasm/web-ifc.wasm` emitido no caminho fixo.

### Fase 2 — O elemento ✅ (05/09/2026)
- [x] Clique seleciona (com a guarda de "não arrastou", senão toda órbita
  selecionaria), destaca em azul e o painel mostra tipo, `GlobalId`, nome e os
  conjuntos de propriedades.
- [x] `IfcElementQuantity` aparece marcado como "quantidades" quando existir —
  neste modelo não existe, e é isso que a Fase 0 registrou.
- [x] **Provado no modelo real**, em Node: `IFCPILE` "E1", GUID
  `2eLAtl03eHyPb3ZBX_KmWI`, `Pset_ConcreteElementGeneral` e `Pset_PileCommon`
  com `StrengthClass=C-25`.

### Fase 3 — Verificação ✅ (05/09/2026)
- [x] `tsc`, suíte (2634), `check-ui-standard`, build, e os chunks conferidos.

## Estado

Fases 0–3: **feitas**. **Em produção desde 05/09/2026** (`fda4b42`).

O status consolidado das etapas rumo ao BIM vive em
`docs/planos/2026-09-04-planta-inteligente-identidade-e-ifc.md`.


⚠️ **Pendente de olho**: ninguém VIU a cena. O serviço está provado contra o
modelo real em Node (geometria, contagem, caixa envolvente, propriedades), o
componente compila, passa no check-ui e o bundle está correto — mas a câmera, a
iluminação e o destaque da seleção só se conferem abrindo. É a mesma pendência
das quatro entregas anteriores, e aqui ela é mais provável de morder: cena 3D é
onde erro de escala e de orientação não aparece em teste nenhum.
