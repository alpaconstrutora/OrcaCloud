# Planta Inteligente — terreno "Maquete" + curvas de nível interativas

## Pedido original

> assista esse reel para implementarmos na planta inteligente: https://www.instagram.com/reel/Df0Vmt1SIAe/?utm_source=ig_web_copy_link&avpt=NTc4MTIwNjQ2YQ==

Sessão 66201aaa-7041-468a-b159-bfddc8fb9dfb · 17/11/2026.

Resposta do usuário em 25/11/2026 (com print do app: planta 2D com curvas + 3D do relevo com curvas laranja):

> 1. primeiro gostaria que o visual do gerador de terreno fosse igual ao do video. Mas como opção para o usuário escolher. veja o print do app. No video mostra o volume em corte e arvores etc analise tudo e faça igual e o usuário escolher qual ele quer visualizar.
>
> O que a mudança tocaria:
> O visualizador 3D passaria a descobrir em que ponto do relevo o mouse está, achar a curva daquela altura e destacá-la. Resposta: de acordo
> Hoje o código junta as linhas do 3D por cor, não por altura, então isso muda. . Resposta: de acordo
> No 3D as linhas atuais têm 1 pixel de espessura. Para o traço grosso do vídeo, a linha destacada precisa ser desenhada de outro jeito. . Resposta: de acordo
>
> Pergunta: em que momento do trabalho você imagina usar isso, e o que precisa ler no número que aparece? [...] mostrar o valor que o app ja mostra hoje e ao passar o mouse mostre o valor de cada linha

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 25/11 | De onde vêm árvores e prédios? | OSM (prédios, Overpass) + satélite ESA WorldCover (árvores, via Edge Function) |
| 25/11 | Onde o usuário escolhe a maquete? | Novo estilo do 3D "Maquete" (5º item do seletor Estilo do 3D) |
| 25/11 | Hover da curva vale onde? | 3D e planta 2D; o clique do 2D (cota · comprimento) continua |
| 25/11 | O que o rótulo mostra? | A cota como o app já mostra (ex.: 885,00) |

## Estado

- [x] F1 — Curvas interativas (3D + 2D) — PR 1 (junto com a F2)
  - 3D: curvas agrupadas por cota (`curvasDeNivel3d` devolve `cotaM`), hover no relevo acende a curva da cota
    mais próxima (drei `Line` 3 px, `DoubleSide` porque o mundo é espelhado) e o rótulo `885,00` segue o cursor.
    Prova: `docs/spikes/terreno-grande-3d/hover.mjs` (903 px escuros com o mouse, 0 sem; Maquete: 1191/0).
  - 2D: `curvaSob` por quadro (rAF), estado só quando o índice muda, rótulo `<div>` por transform.
    Prova: `__tests__/components/BlueprintCanvasCurvaSobOMouse.test.tsx` (5) + foto no harness da topografia.
  - `formatarCotaM` é a fonte única do texto da cota (rótulo da mestra, balão do clique, pontos cotados, hover).
  - ⚠️ Desvio do plano: o hover 2D NÃO testa peça sob o cursor (seria rodar toda a cadeia de acerto do clique
    a cada movimento); sobre uma parede em cima da curva, a curva acende mesmo assim — o clique continua
    selecionando a parede.
- [x] F2 — Estilo "Maquete" (bloco em corte, cores) — PR 1
  - `MAQUETE` no `Estilo3d`, catálogo e viewer; `blocoDoTerreno` (laterais nas arestas de borda + fundo,
    espessura = máx(2 m, 15 % do desnível, 6 % do lado)); sem relevo, placa de 1,5 m.
  - Topo `#f1eee8` com luz própria, laterais `#d6cbb8`, fundo `#eeece7`, sem grade, curvas cinza-pedra,
    paredes/estrutura/massa/entorno brancos; enquadramento até o fundo do bloco.
  - Prova: `__tests__/blueprintMaqueteBlocoDoTerreno.test.ts` (sólido fechado: cada aresta em 2 faces) +
    foto `?curvas=1&estilo=MAQUETE`.
- [x] F3 — Prédios do OpenStreetMap — PR 2
  - ⚠️ MUDANÇA DE FONTE (25/11, medido): o Overpass do plano falhou na prática — principal "at capacity"
    (502) e noutra hora 40 s; espelhos 504 e dois estourando 60 s. Os MESMOS dados do OSM vêm do
    OpenFreeMap em ladrilho vetorial (esquema OpenMapTiles): CORS `*`, ~80 ms por ladrilho, camada
    `building` com `render_height`. No z14 o OpenMapTiles junta prédios de mesma altura numa feição com
    vários anéis (centro de Campinas: 170 prédios em 14 feições). A decisão do usuário ("prédios do OSM")
    continua: só muda o servidor.
  - `npm install @mapbox/vector-tile pbf` foi BARRADO pelo auto mode → decodificador próprio
    `utils/geo/mvt.ts` (protobuf + comandos MVT 2.1), testado com um codificador escrito pela especificação.
  - `utils/blueprintMaqueteOsm.ts`: caixa da grade → ladrilhos z14 (teto 16) → anel externo recortado no
    ladrilho (sem duplicar na divisa) → desenho com base na menor cota sob o prédio; tira o que cruza paredes
    e blocos do estudo (+1 m). Hook `usePrediosDaMaquete`.
  - Prova: 16 testes + harness `?osm=1&lat=-22.9056&lon=-47.0608` → 17 prédios reais em segundos.
- [x] F4 — Árvores da ESA WorldCover — PR 2 (#722)
  - `utils/geo/coberturaDoSolo.ts` (grade global 1/12000°, quadrícula 3° SW) — 8 testes + prova no ARQUIVO
    REAL (Campinas, Bosque dos Jequitibás: 46 % árvore, 2 pedidos, 0,15 MB, 2,3 s).
  - Edge Function `cobertura-do-solo` (JWT, ≤ 4 km², 400/502) + bundle `scripts/build-cobertura-do-solo.mjs`
    com teste de bundle velho. ⏳ deploy: `npx supabase functions deploy cobertura-do-solo` (de pasta em
    origin/main, depois do merge).
  - `utils/blueprintMaqueteArvores.ts`: 1–2 árvores por pixel de mata, determinísticas pelo pixel global,
    fora de prédio/obra/relevo, teto 15 mil — 5 testes. 3D: `InstancedMesh` copa + tronco, sem raycast
    (o hover atravessa a mata — portão do hover verde com prédios e árvores: 646/0).
  - Canto de créditos/avisos no 3D da Maquete (fonte, carregando, motivo de falha, terreno > 4 km²).
  - Deploy da function pelo usuário em 25/11 (da frente em origin/main; do checkout de integração deu
    "Entrypoint path does not exist"). Prova logada (`c:/tmp/pwtest/maquete_cobertura_logado.mjs`): 200 em
    2 s com a MESMA grade da leitura direta no arquivo da ESA (60 × 54; 1480 árvore, 1759 construído, 1 pasto
    = 46 %); caixa > 4 km² → 400 "Área maior que 4 km²". Sem login → 401.
  - Prova de TELA em produção (print do usuário, 25/11): estudo rural com Copernicus no estilo Maquete —
    bloco cortado, curvas cinza, mata real nos fundos de vale. Sem prédios no recorte (área rural; o canto
    de notas ficou fora do print).

## Estado final (25/11/2026)

F1–F4 no ar (#721, #722) e provadas. Desvio aceito e anotado: hover 2D não testa peça sob o cursor.

## Contexto

O usuário mandou um reel da Hektar (11 s). O terreno 3D aparece como **maquete**: um bloco recortado com as
laterais em bege até uma base plana, chão claro, curvas de nível finas em cinza, árvores verde-claras e
prédios brancos. Ao **passar o mouse**, a curva da altura sob o cursor fica grossa e escura, e um rótulo com a
cota acompanha o cursor.

O que o usuário pediu:
1. O visual do vídeo como **opção escolhida pelo usuário**: um novo estilo do 3D, **"Maquete"**, ao lado de
   Sombreado, Linha oculta, Transparente e Concepção.
2. Árvores e prédios com dados reais. Prédios vêm do **OpenStreetMap** (Overpass). Árvores vêm da **ESA WorldCover
   10 m** (satélite), lida por Edge Function.
3. Ao passar o mouse sobre o terreno, a curva fica destacada e mostra a cota **no formato que o app já usa**
   (ex.: `885,00`). Vale **no 3D e na planta 2D**. O clique do 2D (cota · comprimento) continua igual.
4. Pontos já aprovados: o 3D descobre o ponto do relevo sob o mouse; as linhas 3D passam a ser agrupadas
   **por cota** e não por cor; o destaque usa linha grossa (o WebGL padrão desenha 1 px).

### Medições feitas no planejamento
- **Overpass**: responde com `Access-Control-Allow-Origin: *`. O navegador lê direto. Num quadrado de cerca de
  500 m em Campinas vieram 113 prédios. Com o User-Agent padrão do curl a resposta é 406; o navegador manda o
  dele.
- **WorldCover v200 (2021)**: `esa-worldcover.s3.eu-central-1.amazonaws.com`. Aceita `Range` (206), mas **não**
  tem CORS, então precisa de Edge Function. Medi o cabeçalho de `…_S24W048_Map.tif`: 36000², uint8, Deflate,
  sem preditor, blocos de 1024², nodata 48. Quadrícula de 3°, nomeada pelo canto **sudoeste**
  (`floor(lat/3)*3`, `floor(lon/3)*3`). Classe 10 = cobertura arbórea. Licença CC BY 4.0, que permite uso
  comercial com atribuição.
- O `ArquivoCog` de `utils/geo/cog.ts` já decodifica uint8 e Deflate (`cog.ts:154-165`, `tiff.ts:364-366`). Só o
  `AmostradorCog` é amarrado ao Copernicus (nome e grade de 1°).

## O que existe hoje (lido em `origin/main`)
- **Relevo 3D**: `malhaDaGrade` (`utils/blueprintTopografia.ts:1364`) produz uma `MalhaDoTerreno
  {posicoes, indices, minY, maxY, triangulos}`. É uma grade retangular sobre a caixa do lote + 1 célula, e as
  células nodata são puladas, então a borda pode ser recortada. **Não existe saia nem base.** No viewer
  (`Blueprint3DViewer.tsx:1724-1741`, malha em 2111-2131) o material é `COR_DO_CHAO #d9cfbd`. Na Concepção usa
  `COR_DO_LOTE_NA_CONCEPCAO` (`utils/blueprintConcepcao.ts:30`).
- **Curvas 3D**: `curvasDeNivel3d` (`utils/blueprintTopografia3dExtras.ts:60`) agrupa por `cor|mestra` e perde a
  cota. É chamada em `BlueprintEditor.tsx:5999-6012` com `amostradorDaMalha(v.grade)`. É desenhada como
  `lineSegments` em `Blueprint3DViewer.tsx:2089-2093`.
- **Estilo 3D**: `Estilo3d` / `ESTILOS_3D` / `ROTULO_DO_ESTILO_3D` (`utils/blueprintTemplatesDeVista.ts:14-16`).
  O seletor fica em `MenuVista.tsx:147-154`. O estado é `usePreferenciaDaPlanta('vista3dEstilo')`
  (`BlueprintEditor.tsx:2507`). As opções aparecem duplicadas em `OPCOES_ESTILO_3D` (`utils/preferencias/catalogoExibir.ts:191-199`,
  com igualdade conferida em `__tests__/preferenciasCatalogoExibir.test.ts`) e na união literal do viewer
  (`Blueprint3DViewer.tsx:131`). Os ramos ficam em `Cena` (1340-1341). Um valor novo entra nos modelos de vista
  sem trabalho extra.
- **Clique da curva no 2D**: `curvaSob` (`utils/blueprintTopografiaAnalises.ts:358`, tolerância
  `HIT_PX/vista.escala`). O destaque e o balão estão em `BlueprintCanvas.tsx:5796-5835`. O `aoMover` está em
  `BlueprintCanvas.tsx:10505`; com `tool !== 'parede'` ele sai em 10851. **O canvas redesenha tudo num único
  `useEffect`** com cerca de 150 dependências, então o hover não pode mudar estado a cada pixel.
- **Rótulos no 3D**: sprites próprios (`RotuloDeRede` ~1210, `EtiquetaDeChamada` ~1277), sem `Html` nem troika
  (o PWA funciona offline). O drei `Line` já é usado.
- **Entorno atual**: prismas de vizinhos digitados na Insolação (`prismasDoEntorno`), não OSM. **Não há árvore
  3D nem Overpass** no código.
- **Cota em texto**: `x.toFixed(2).replace('.', ',')` repetido em 3 pontos do canvas, sem formatador
  compartilhado.

## Abordagem: 4 fases, 1 PR cada (eu faço o merge com CI todo verde)

Antes de editar: ler `orçacloud-saas/CLAUDE.md` inteiro, abrir a frente com `git worktree add` a partir de
`origin/main` (sem junção de `node_modules`) e seguir `index_publicacao_build.md`.

### F1 — Curvas interativas (3D + 2D)
- `formatarCotaM(m)` em `utils/blueprintTopografia.ts`, que devolve `"885,00"`. Os 3 pontos do canvas passam a
  usá-lo.
- `curvasDeNivel3d` passa a devolver **um grupo por cota**: `{cotaM, cor, mestra, posicoes}`. A subdivisão sobre a
  malha e a folga continuam como hoje. Ajustar `__tests__/blueprintCurvasNo3d.test.ts`.
- Função pura `nivelMaisProximo(niveisOrdenados, cotaM)`, com busca binária. Fica em
  `blueprintTopografia3dExtras.ts`.
- **3D**: `onPointerMove`/`onPointerOut` no mesh do relevo, só quando há curvas.
  - O ponto vira coordenada de desenho pelo `worldToLocal` do mesh (por causa do `scale(1,1,-1)` do grupo,
    ver a memória do 3D espelhado). Depois `amostradorDaMalha` dá a cota e `nivelMaisProximo` dá o nível.
  - O estado React só muda quando o **nível muda**.
  - O nível sob o mouse é desenhado com drei `<Line segments lineWidth={3}>` escuro, a partir das `posicoes`
    do grupo daquela cota (todas as partes da mesma cota acendem juntas, como no vídeo).
  - Um rótulo-sprite com `formatarCotaM` é reposicionado por ref, sem re-render.
  - `raycast={() => null}` na linha e no rótulo.
  - Não pode atrapalhar a órbita nem o clique de peça: sem `stopPropagation` no move.
- **2D**: no `aoMover`, com a ferramenta `selecionar` e as curvas visíveis, rodar `curvaSob` limitado por
  `requestAnimationFrame`.
  - `setCurvaSobOMouse(i)` só quando o índice muda, para que o redesenho só aconteça quando o índice muda.
  - A curva do hover sai em traço 2,6 na cor dela com alpha 1. A clicada continua em `COR_SELECIONADA`.
  - O rótulo `885,00` é um `<div>` absoluto sobre o canvas, posicionado por ref.
  - Peça sob o cursor e arrasto em curso desligam o hover.

### F2 — Estilo "Maquete" (sem dados externos)
- `MAQUETE` entra em `Estilo3d`, `ESTILOS_3D`, `ROTULO_DO_ESTILO_3D` ("Maquete"), `OPCOES_ESTILO_3D` e na união
  do viewer. Caçar quem estreita o enum (`=== 'CONCEPCAO'`, `linhaOculta`…) e decidir caso a caso.
- Função pura `blocoDoTerreno(malha, espessuraM)` em `utils/blueprintTopografia.ts`. Ela acha as arestas de
  borda (as usadas por um só triângulo nos `indices`), sobe as paredes verticais até `baseY = minY − espessura`
  e fecha o fundo projetando os triângulos em `baseY` com a ordem invertida. Espessura padrão
  `max(2 m, 15 % do desnível)`. Sem relevo, o bloco é o anel do lote com espessura fixa.
- No viewer, quando o estilo é `MAQUETE`:
  - topo do relevo em claro quente (~`#f1eee8`) e laterais/base em bege (~`#d6cbb8`), sem `Edges` no relevo;
  - curvas em cinza-escuro com transparência (mestra mais forte). "Curvas coloridas pela cota" continua
    valendo se estiver ligado;
  - paredes, massa e entorno em branco com sombra suave; câmera em perspectiva normal (não a da Concepção);
    sol ligado; fundo claro;
  - a grade do chão some (a maquete "flutua", como no vídeo).
- `enquadramentoDoModelo` passa a considerar a base do bloco.

### F3 — Prédios do OpenStreetMap
- `utils/blueprintMaqueteOsm.ts` (puro):
  - monta a consulta Overpass para a caixa geográfica da grade, que vem de `localParaGeo` nos cantos (é preciso
    que o estudo esteja georreferenciado);
  - interpreta a resposta: `way[building]` vira anel local por `geoParaLocal`;
  - altura = `height` → `building:levels × 3 m` → 6 m padrão. A base é a menor cota do relevo sob o contorno;
  - descarta prédios que cruzam a área construída do próprio estudo (paredes/massa + 1 m) e os que ficam fora
    da grade.
- Hook `useMaqueteOsm(caixa, ligado)`: busca só no estilo `MAQUETE` e guarda em memória por caixa. Falha ou falta
  de georreferência viram um **aviso visível** no canto do 3D, que diz o motivo; a maquete aparece sem os
  prédios.
- Viewer: prismas brancos (reusar o `ExtrudeGeometry` do entorno) com sombra e aresta suave.
- Atribuição "© colaboradores do OpenStreetMap" no canto de cima do 3D.

### F4 — Árvores da ESA WorldCover
- `utils/geo/cog.ts`:
  - generalizar o amostrador para receber a regra de nome/URL da quadrícula. O caso do Copernicus continua com
    o mesmo comportamento (`topografiaCopernicusFonte.test.ts` precisa continuar verde);
  - adicionar `urlWorldCover(lat, lon)` (3°, canto SW, `ESA_WorldCover_10m_2021_v200_{S|N}dd{W|E}ddd_Map.tif`);
  - acrescentar uma leitura de **janela** (caixa → matriz de classes), além do ponto a ponto.
- Edge Function nova `cobertura-do-solo`:
  - `POST { caixa:{sul,oeste,norte,leste} }`, até ~4 km²;
  - devolve `{ origem, passoGraus, colunas, linhas, classes (base64 uint8) }`, com JWT obrigatório, CORS e 502
    para falha do provedor, como a `topografia-copernicus`;
  - o bundle sai de `scripts/build-topografia-copernicus.mjs`, estendido para gerar o segundo bundle, com o
    teste de bundle velho no mesmo padrão;
  - deploy: `npx supabase functions deploy cobertura-do-solo`.
- `utils/blueprintMaqueteArvores.ts` (puro e determinístico, semente pela posição):
  - cada pixel de classe 10 dentro da grade recebe 1–2 árvores com deslocamento e escala variados;
  - não entram árvores dentro de prédio OSM nem na área construída do estudo;
  - teto de cerca de 15 mil instâncias, rareando de forma uniforme quando passa;
  - Y = cota do relevo no ponto.
- Viewer: `InstancedMesh` de árvore low-poly (copa de icosaedro verde-claro ~`#b5cfa8` + tronco curto), com
  sombra. Atribuição "ESA WorldCover 2021 (CC BY 4.0)".

## Arquivos principais
- `utils/blueprintTopografia.ts`: `formatarCotaM`, `blocoDoTerreno`
- `utils/blueprintTopografia3dExtras.ts`: `curvasDeNivel3d` por cota, `nivelMaisProximo`
- `utils/blueprintTemplatesDeVista.ts`, `utils/preferencias/catalogoExibir.ts`, `components/blueprint/MenuVista.tsx`
- `components/blueprint/Blueprint3DViewer.tsx`: hover, estilo MAQUETE, bloco, prédios, árvores
- `components/blueprint/BlueprintCanvas.tsx` e `BlueprintEditor.tsx`: hover 2D, passagem de props
- Novos: `utils/blueprintMaqueteOsm.ts`, `utils/blueprintMaqueteArvores.ts`, `hooks/useMaqueteOsm.ts`,
  `hooks/useCoberturaDoSolo.ts`, `supabase/functions/cobertura-do-solo/`
- `utils/geo/cog.ts`, `scripts/build-topografia-copernicus.mjs`

## Verificação
- **Vitest (por fase)**:
  - curvas por cota (sem cota perdida, mesma geometria total de antes), `nivelMaisProximo`, `formatarCotaM`;
  - `blocoDoTerreno`: grade cheia dá 4 paredes; grade com nodata dá borda recortada fechada; volume fechado
    (cada aresta usada por 2 faces);
  - interpretação do Overpass (altura por tag, descarte por sobreposição); nome da quadrícula WorldCover (o
    caso de Campinas dá `S24W048`); árvores determinísticas e teto respeitado;
  - catálogo × `ESTILOS_3D`; bundle atualizado;
  - suítes atingidas e `tsc`.
- **Harness** `docs/spikes/topografia/`:
  - nova vista `?estilo=MAQUETE` no `fotografar.mjs`;
  - portão de hover: mover o mouse sobre o relevo e conferir que o rótulo mostra a cota do nível esperado e que
    a linha grossa existe;
  - no 2D, conferir o `<div>` do rótulo e que não houve redesenho por pixel (contador de desenhos).
- **Edge Function**: com curl, 401 sem token e classes reais com token, na caixa de Campinas.
- **Produção, logado** (o usuário digita a senha no Chrome): estudo georreferenciado com Copernicus →
  estilo Maquete → bloco, prédios e árvores aparecem → hover mostra `885,00`-like no 3D e no 2D → print para o
  usuário.
- Ao fim de cada fase, atualizar `docs/planos/` e a memória da Planta.
