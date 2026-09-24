// @ts-nocheck — mesmo motivo do components/planta_ai/Building3DViewer.tsx: os
// elementos three intrínsecos (<mesh>, <group>, <ambientLight>…) só existem via a
// augmentation global de JSX do @react-three/fiber, que foi tirada do programa
// TS (types/react-three-stubs.d.ts) por quebrar o className em todo o codebase.
// Sem os tipos intrínsecos o tsc não valida este JSX — validação é em runtime,
// e o harness docs/spikes/blueprint-3d falha o exit em qualquer erro de console.
//
// ⚠️ E O HARNESS SÓ VALE SE RODAR CONTRA CÓDIGO NOVO. Editar com o `npm run dev`
// já de pé pode deixá-lo servindo a versão anterior: em 05/09/2026 duas
// execuções passaram "verdes" sobre um defeito que derrubava a aba, e só
// reiniciando o servidor (e apagando `node_modules/.vite`) ele apareceu.
//   npm run dev  # servidor NOVO
//   PLAYWRIGHT_CORE=/c/tmp/pwtest/node_modules/playwright-core \
//     node docs/spikes/blueprint-3d/passeio.mjs http://localhost:3100
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PointerLockControls, Grid, Edges } from '@react-three/drei';
import { RotateCcw, Maximize, Minimize, Footprints } from 'lucide-react';
import type { Agua, BlueprintModel, Escada, FatiaDaEscada, Structural } from '../../utils/blueprintKernel';
import {
  ehConjunto,
  contornoDaAguaEm3d,
  contornoExternoDoNivel,
  DEFAULT_TOLERANCE_MM,
  FORMA_ESTRUTURAL,
  fatiasDaEscada,
  furosDaEscada,
  furosDoNucleo,
  medirAgua,
  pavimentosDoNucleo,
  pointInPolygon,
  normalDaAgua,
  poligonoDaJuncao,
} from '../../utils/blueprintKernel';
import {
  COR_DA_DISCIPLINA,
  caixaDaPeca,
  cilindroDoTrecho,
  giroDaPeca,
  segmentosDoEletroduto,
  medidasDoQuadro,
  medidasDoTerminal,
  rotacaoY3D,
} from '../../utils/blueprintRede';
import { perfilDaParedeComVaos } from '../../utils/blueprintElevation';
import { contornoDaSecaoT, secaoTValida } from '../../utils/blueprintKernel/secaoT';
import { medirTerreno } from '../../utils/blueprintTerreno';
import { ehClique } from '../../utils/blueprint3dSelecao';
import { prismasDoNucleo } from '../../utils/blueprintNucleo3d';
import {
  SEM_TECLAS,
  alturaDoOlho,
  direcaoDaTecla,
  passo,
  type TeclasDeAndar,
} from '../../utils/blueprint3dWalk';
import {
  DIRECAO_DA_CAMERA,
  distanciaParaCaber,
  enquadramentoDoModelo,
  gradeDaCena,
  saiuDoQuadro,
  sombraDaCena,
} from '../../utils/blueprint3dEnquadramento';
import type { MalhaDoTerreno } from '../../utils/blueprintTopografia';
import type { ExtrasDoRelevo3d } from '../../utils/blueprintTopografia3dExtras';
import type { ArmaduraDaPeca, HipotesesDeArmadura } from '../../utils/blueprintArmadura';
import { ehTransversal, segmentosDaArmaduraDoModelo } from '../../utils/blueprintArmaduraGeometria';
import { paineisDaPolilinha, pecaNoMundo } from '../../utils/blueprint3dPecas';

interface Props {
  model: BlueprintModel;
  /** Níveis a mostrar. Omitido = todos. */
  levelIds?: string[];
  mostrarLaje?: boolean;
  mostrarArestas?: boolean;
  /** ESTILO (E8.2): sombreado (padrão), linha oculta (branco + arestas) ou transparente (paredes/lajes a 35 %). */
  estilo?: 'SOMBREADO' | 'LINHA_OCULTA' | 'TRANSPARENTE';
  /** O polígono do lote (divisas `TERRENO`) como um plano de chão. */
  mostrarTerreno?: boolean;
  /** ENVELOPE 3D (E3.3): um prisma translúcido por pavimento — âmbar; vermelho acima do gabarito. */
  envelope?: { levelId: string; nome: string; anel: { x: number; y: number }[]; pecas?: { x: number; y: number }[][]; baseMm: number; topoMm: number; acimaDoGabarito: boolean }[];
  /**
   * SOL (E5.1): direção unitária PARA o sol no espaço do desenho (x, y em
   * planta, z para cima) — a luz principal aponta de lá e as sombras seguem a
   * data/hora escolhidas. Ausente = a luz fixa de sempre.
   */
  sol?: { x: number; y: number; z: number } | null;
  /** ENTORNO (E5.1): vizinhos como prismas cinza que fazem sombra. */
  entorno?: { id: string; rotulo: string; anel: { x: number; y: number }[]; alturaMm: number }[];
  /**
   * A malha do relevo (topografia gerada), já em metros de mundo — ver
   * `malhaDaGrade`. Com ela o terreno deixa de ser o plano chato. Vem de fora do
   * modelo porque a topografia não vive no payload; `relevoChave` (o hash da
   * versão) é a dependência dos memos, para a geometria não remontar a cada
   * render.
   */
  relevo?: MalhaDoTerreno | null;
  relevoChave?: string;
  /**
   * A cota do CHÃO em metros de mundo, em (x, z) — para andar acompanhando o
   * relevo. `null` onde não há dado (fora da grade): aí o chão é o zero.
   */
  alturaDoChao?: (x: number, z: number) => number | null;
  /** Drenagem traçada e muros de arrimo sobre o relevo (fase 8), em números crus. */
  extrasDoRelevo?: ExtrasDoRelevo3d | null;
  extrasChave?: string;
  /**
   * Ids de peça escondidos pela lista de Componentes (pedido de 01/09/2026).
   *
   * Filtra o DESENHO e nada mais: não é comando de kernel, não entra no
   * histórico, não muda quantitativo. Aceita id de parede, de abertura e de peça
   * estrutural — a lista não separa as três famílias e o viewer não deveria
   * obrigá-la a separar.
   */
  ocultos?: Set<string>;
  /**
   * Cor por `uid` de elemento — o 4D (simulação temporal).
   *
   * Vem de fora porque a cor depende de uma DATA e do cronograma da obra, que
   * este componente não conhece nem deveria: ele desenha o modelo. Ausente, ou
   * sem entrada para a peça, cada uma mantém a cor de sempre.
   */
  coresPorUid?: Map<string, string>;
  /** Ids do kernel já selecionados — para destacar a peça na cena. */
  selecionados?: Set<string>;
  /**
   * Clique numa peça. Recebe o id do KERNEL (não o uid): é a moeda da seleção
   * no editor, a mesma que o canvas 2D usa.
   *
   * Ausente = a cena não é clicável, e é o padrão. O harness e qualquer uso de
   * leitura não deveriam pagar por raycast que ninguém vai consumir.
   */
  onSelecionar?: (ids: string[]) => void;
  /**
   * ARMADURA DESENHADA (16/09/2026: *"implementar exibição gráfica das
   * armaduras"*): as barras do esquema de cada peça, como linhas, e o
   * concreto fica translúcido para elas aparecerem. Ausente = cena de sempre.
   * `pecas` é o esquema já calculado (`armaduraDoModelo`); `hipoteses` dá o
   * cobrimento. É o desenho do pré-quantitativo — sem dobras nem ancoragem.
   */
  armadura?: { pecas: readonly ArmaduraDaPeca[]; hipoteses: HipotesesDeArmadura };
}

/** Cores das barras: longitudinal em ferro-oxidado, transversal (estribo/espiral/malha) em vermelho. */
const COR_BARRA_LONGITUDINAL = '#7c2d12';
const COR_BARRA_TRANSVERSAL = '#dc2626';

/** mm → m: o resto do viewer (câmera, grade, luzes) trabalha em metros. */
const S = 0.001;
const EPS = 0.001; // 1 mm — afasta o furo da borda para o ExtrudeGeometry não bugar.

/**
 * Cotas do chão, em metros. A ORDEM importa e a FOLGA também.
 *
 * grade < terreno < 0 (piso do térreo). A folga entre as duas é de 12 cm, e não
 * de 1 cm, porque a planta real vive a dezenas de metros da origem: a câmera
 * recua junto, e a essa distância o depth buffer não separa um centímetro — o
 * lote sumia atrás da grade. Perto da origem o mesmo código desenhava certo,
 * que é exatamente por que o defeito passou pelo harness sintético.
 */
const COTA_GRADE_Y = -0.14;
const COTA_TERRENO_Y = -0.02;

/**
 * Tolerância para reconhecer um vértice como sendo DO PLANO DA PONTA, em metros.
 *
 * Mil vezes menor que o `EPS` que afasta os furos da borda: o furo mais próximo
 * possível fica a 1 mm da ponta, e um vértice de furo empurrado junto com a
 * ponta rasgaria a malha.
 */
const TOL_PONTA = 1e-6;

/**
 * Empurra para `alvo(z)` todo vértice que está no plano `x = xBase`.
 *
 * É assim que a ponta reta vira bisel sem geometria nova: os vértices da tampa
 * e das duas faces já existem no lugar certo, só estão todos no mesmo `x`.
 * Depois de mexer, as normais têm de ser refeitas — a tampa deixou de ser
 * perpendicular ao eixo, e sem isso ela reflete luz como se ainda fosse.
 */
function biselarPonta(
  geom: THREE.BufferGeometry,
  xBase: number,
  alvo: (z: number) => number,
) {
  const pos = geom.attributes.position as THREE.BufferAttribute;
  let mexeu = false;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getX(i) - xBase) > TOL_PONTA) continue;
    pos.setX(i, alvo(pos.getZ(i)));
    mexeu = true;
  }
  if (!mexeu) return;
  pos.needsUpdate = true;
  geom.computeVertexNormals();
}

/**
 * Geometria de UMA parede: o perfil frontal (retângulo + furos das aberturas)
 * extrudado pela espessura. Sem CSG — `THREE.Shape` com `THREE.Path` de furo já
 * abre porta e janela na malha.
 *
 * ─── O CANTO, E POR QUE ELE É UM BISEL E NÃO UM AVANÇO ──────────────────────
 *
 * O retângulo NÃO vai de 0 a `comprimento`: a ponta avança além do vértice do
 * eixo, senão num canto em L sobra um entalhe de meia espessura na face externa
 * (o buraco fotografado em 30/08/2026).
 *
 * Mas avançar IGUAL nas duas faces — que foi a primeira correção — faz as duas
 * paredes do canto cobrirem o quadrado da junção INTEIRO, cada uma. No 2D isso
 * não aparece (o preenchimento é uma união); aqui são dois sólidos, e o que se
 * vê é face contra face e ponta de parede saindo do outro lado da vizinha: o
 * print de 03/09/2026, medido em 0,88 m² de planta desenhada duas vezes numa das
 * plantas reais.
 *
 * Por isso a ponta vem do kernel com um avanço POR FACE (`mitraDaPonta`), e o
 * corte é em BISEL. A malha sai em dois passos:
 *
 *   1. o perfil é extrudado com a ponta reta no avanço MENOR das duas faces —
 *      recuada, portanto, e com os furos intactos onde sempre estiveram;
 *   2. os vértices que caem no plano dessa ponta são empurrados para fora
 *      conforme o `z` LOCAL de cada um, que é onde ele está na espessura.
 *
 * Empurrar vértice em vez de colar uma cunha separada é o que mantém a malha
 * fechada, sem costura nova para o `<Edges>` desenhar no meio da face, e vale
 * igual para parede em camadas — cada faixa tem seu `z`, e a conta é a mesma.
 *
 * ⚠️ Vértice de 3+ pontas deixa um MIOLO que parede nenhuma cobre depois do
 * bisel; quem o desenha é `geometriasDasJuncoes`. Mitrar sem ele abre buraco
 * onde hoje há massa demais — o remédio seria pior que a doença.
 *
 * A origem local continua em `wall.a`, e é por isso que `position` e os furos
 * (medidos a partir de `a`) não mudam com a mitra.
 */
export function geometriaDaParede(
  model: BlueprintModel,
  wall: BlueprintModel['walls'][number],
  ocultos?: Set<string>,
) {
  const perfil = perfilDaParedeComVaos(model, wall);
  const L = perfil.comprimentoMm * S;
  const A = perfil.alturaMm * S;
  if (L <= 0 || A <= 0) return [];

  // Avanço de cada face, em metros. `esquerda` é o lado `+n` do modelo, que é o
  // `+z` LOCAL desta malha: `nrm = cross(dir, up)` dá exatamente `rot90(a→b)`
  // (ver o `makeBasis` abaixo). Trocar os dois espelharia o bisel — o canto
  // fecharia pelo lado errado, e num canto de 90° o erro tem o tamanho da
  // espessura inteira.
  const t = perfil.espessuraMm * S;
  const avancoA = (z: number) =>
    t > 0
      ? (perfil.mitraA.direitaMm +
          (perfil.mitraA.esquerdaMm - perfil.mitraA.direitaMm) * ((z + t / 2) / t)) *
        S
      : 0;
  const avancoB = (z: number) =>
    t > 0
      ? (perfil.mitraB.direitaMm +
          (perfil.mitraB.esquerdaMm - perfil.mitraB.direitaMm) * ((z + t / 2) / t)) *
        S
      : 0;

  // O corpo nasce no avanço MENOR (o mais recuado) e o bisel empurra para fora.
  // Fazer o contrário — nascer no maior e puxar para dentro — arrastaria a borda
  // para cima de um furo que estivesse a menos de uma mitra da ponta.
  let xIni = -Math.min(perfil.mitraA.esquerdaMm, perfil.mitraA.direitaMm) * S;
  let xFim = L + Math.min(perfil.mitraB.esquerdaMm, perfil.mitraB.direitaMm) * S;
  // Parede mais curta que os próprios recuos (fragmento entre duas paredes
  // grossas): o corpo colapsaria e ela sumiria da tela. Melhor o eixo cru.
  const semMitra = xFim - xIni <= EPS;
  if (semMitra) {
    xIni = 0;
    xFim = L;
  }
  // Até onde a mitra EMPURRA a ponta (a face mais avançada). É o alcance real
  // da parede no canto — o corpo nasce recuado, mas o bisel chega até aqui.
  const xIniExt = semMitra ? xIni : -Math.max(perfil.mitraA.esquerdaMm, perfil.mitraA.direitaMm) * S;
  const xFimExt = semMitra ? xFim : L + Math.max(perfil.mitraB.esquerdaMm, perfil.mitraB.direitaMm) * S;

  // ─── ESCONDER UMA ESQUADRIA FECHA O VÃO ────────────────────────────────────
  //
  // A esquadria É o vazio: tirá-la do desenho devolve alvenaria inteira, que é
  // o que "ocultar Janela 3" promete ao ser lido.
  //
  // ⚠️ E é por isso que `furosEstruturais` NÃO entra nesta conta. Esconder um
  // pilar some com a malha DELE e só; o rasgo que ele abriu na parede fica.
  // O rasgo não é consequência de o pilar estar desenhado — é consequência de
  // `cedeSobreposicao`, que é decisão de QUANTITATIVO. Refechar a parede junto
  // faria o 3D mostrar alvenaria que a medição diz não existir: exatamente a
  // divergência que `perfilDaParedeComVaos` já documenta ter sido reportada com
  // print em 01/09/2026, só que ao contrário. Esconder é ver menos, não medir
  // diferente.
  const furosVisiveis = ocultos?.size
    ? perfil.furos.filter((f) => !ocultos.has(f.openingId))
    : perfil.furos;

  // ─── O CONCRETO NÃO É FURO: ELE ENCURTA A PAREDE ───────────────────────────
  //
  // A primeira versão tratava o vão do pilar como mais um `THREE.Path` em
  // `shape.holes`, junto com porta e janela. Funcionou no harness e NÃO funcionou
  // na planta do usuário, e a diferença era onde o pilar estava: no meio da
  // parede o vão é interno e o furo vale; na PONTA — que é onde quase todo pilar
  // fica — o furo encosta na borda do retângulo, e furo que toca a borda não é
  // furo, é entalhe. A triangulação do `ExtrudeGeometry` não sabe representar
  // isso e simplesmente IGNORA o furo: a parede sai inteira, atravessando o
  // concreto. Foi o "não interrompe nada" relatado em 01/09/2026.
  //
  // Agora a parede é montada pelos TRECHOS QUE SOBRAM. Isso resolve os três
  // casos com a mesma conta: pilar no meio → dois trechos; na ponta → um trecho
  // mais curto; cobrindo tudo → nenhum, e a parede some do desenho, que é o que
  // ela é.
  // ⚠️ SÓ o que atravessa a parede DE CIMA A BAIXO vira trecho removido. Uma
  // peça mais baixa que a parede deixa alvenaria em cima dela, e apagar a faixa
  // inteira comeria o que continua lá — a informação de altura não pode ser
  // jogada fora só porque a de comprimento é mais fácil de usar. O que sobra
  // (peça mais baixa) continua sendo FURO, como porta e janela.
  const atravessaTudo = (f: { y0: number; y1: number }) =>
    f.y0 * S <= EPS && f.y1 * S >= A - EPS;

  // ⚠️ Recortado ao ALCANCE da mitra (`xIniExt`/`xFimExt`), não ao corpo
  // recuado (`xIni`/`xFim`). Num canto de paredes de 15 cm o corpo nasce em
  // +75 mm e o bisel o empurra até −75 mm; o pilar de canto 14 × 40 ocupa
  // [−70, +70] — recortado ao corpo virava [75, 70], vazio, e sumia da lista:
  // a parede saía inteira, era biselada até −75 e atravessava o pilar. Foi o
  // *"nos quatro cantos a alvenaria e o pilar ainda estão se sobrepondo"* de
  // 16/09/2026, medido na planta do usuário: 0,021 m² em comum em cada canto,
  // enquanto o pilar de T da mesma parede (longe da mitra) era recortado certo.
  const removidos = perfil.furosEstruturais
    .filter(atravessaTudo)
    .map((f) => ({ x0: Math.max(xIniExt, f.x0 * S), x1: Math.min(xFimExt, f.x1 * S) }))
    .filter((r) => r.x1 > r.x0)
    .sort((a, b) => a.x0 - b.x0);

  // ⚠️ LASCA não é parede. Um pilar 14 × 40 num canto de paredes de 15 cm
  // (16/09/2026, print do 3D do usuário: *"ainda existe sobreposição de pilar
  // com alvenaria"*) deixava um trecho de 5 mm entre a face do pilar e o
  // avanço da mitra da parede vizinha — medido na planta dele: trechos de
  // 0,005 m nas duas paredes do canto. Extrudado e biselado, esse filete
  // aparecia como um serrilhado colado ao pilar. Trecho mais curto que 2 cm
  // sai do desenho: obra nenhuma assenta 5 mm de bloco ao lado de um pilar.
  const LASCA_M = 0.02;
  const trechos: { x0: number; x1: number }[] = [];
  // ─── CONCRETO NA PONTA COME A MITRA ────────────────────────────────────────
  //
  // Quando o pilar ocupa a ponta, a parede não chega ao canto: ela morre na
  // FACE do pilar, em corte reto — o bisel é encontro de alvenaria com
  // alvenaria, e ali não há outra alvenaria, há concreto. Por isso o primeiro
  // trecho nasce em `r.x1` (a face do pilar), mesmo que isso fique AQUÉM do
  // corpo recuado, e a ponta correspondente perde o bisel (`biselarA`/`B`).
  // Sem isso o trecho nascia em `xIni` e era empurrado de volta ao canto.
  let cursor = xIni;
  let biselarA = !semMitra;
  let biselarB = !semMitra;
  for (const r of removidos) {
    if (r.x0 - cursor > LASCA_M) {
      trechos.push({ x0: cursor, x1: r.x0 });
      cursor = Math.max(cursor, r.x1);
    } else if (trechos.length === 0) {
      // Encosta na ponta A: a primeira peça leva o cursor à SUA face, ainda que
      // fique aquém de `xIni`; as seguintes só avançam.
      cursor = biselarA ? r.x1 : Math.max(cursor, r.x1);
      biselarA = false;
    } else {
      cursor = Math.max(cursor, r.x1);
    }
    if (r.x1 >= xFim - LASCA_M) biselarB = false;
  }
  if (xFim - cursor > LASCA_M) trechos.push({ x0: cursor, x1: xFim });

  // Orientação: local X → direção do eixo (no plano XZ do mundo three, com
  // model.y → three.z); local Y → altura (three +Y); local Z → normal horizontal.
  const dir = new THREE.Vector3(wall.b.x - wall.a.x, 0, wall.b.y - wall.a.y).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const nrm = new THREE.Vector3().crossVectors(dir, up).normalize();
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(dir, up, nrm),
  );
  const position = new THREE.Vector3(wall.a.x * S, perfil.elevacaoBaseMm * S, wall.a.y * S);

  const pecas: { geom: THREE.BufferGeometry; quaternion: THREE.Quaternion; position: THREE.Vector3 }[] =
    [];

  // ─── PEÇA MAIS BAIXA QUE A PAREDE ENCOSTADA NO TOPO: É ENTALHE, NÃO FURO ─────
  //
  // A viga embutida no topo da alvenaria (16/09/2026, print do 3D do usuário:
  // *"ainda existe sobreposição alvenaria × viga"*) caía aqui como FURO com o
  // topo a 1 mm da borda — e o `ExtrudeGeometry` não abre furo que encosta na
  // borda: a parede saía inteira, a face dela ficava coplanar com a face da
  // viga e o que se via era o serrilhado do z-fighting. É a mesma armadilha do
  // pilar de ponta (acima), só que na vertical.
  //
  // O remédio é o mesmo: em vez de furo, o PERFIL muda. O trecho é fatiado nas
  // abscissas em que uma peça encostada no topo ou na base começa e termina, e
  // cada fatia é um retângulo da altura que SOBRA (de 0 até a base da viga, por
  // exemplo). Porta e janela continuam furos dentro da fatia que as contém.
  const montarFatia = (
    sx0: number,
    sx1: number,
    ya: number,
    yb: number,
    furosDaFatia: readonly { x0: number; x1: number; y0: number; y1: number }[],
  ) => {
    const shape = new THREE.Shape();
    shape.moveTo(sx0, ya);
    shape.lineTo(sx1, ya);
    shape.lineTo(sx1, yb);
    shape.lineTo(sx0, yb);
    shape.lineTo(sx0, ya);

    // A abertura vai para a fatia que a contém — e continua sendo FURO, porque
    // porta e janela são interiores por natureza: elas não encostam na borda.
    for (const f of furosDaFatia) {
      const x0 = Math.max(sx0 + EPS, f.x0);
      const x1 = Math.min(sx1 - EPS, f.x1);
      const y0 = Math.max(ya + EPS, f.y0);
      const y1 = Math.min(yb - EPS, f.y1);
      if (x1 <= x0 || y1 <= y0) continue;
      const furo = new THREE.Path();
      furo.moveTo(x0, y0);
      furo.lineTo(x1, y0);
      furo.lineTo(x1, y1);
      furo.lineTo(x0, y1);
      furo.lineTo(x0, y0);
      shape.holes.push(furo);
    }

    // ─── UMA PEÇA POR CAMADA ────────────────────────────────────────────────
    //
    // O perfil, os furos e o recorte do concreto são os MESMOS: o que muda de
    // uma camada para a outra é só a profundidade da extrusão e onde ela fica
    // dentro da espessura. Reaproveitar o `shape` inteiro é o que garante que a
    // porta abre nas três camadas no mesmo lugar — remontar o perfil por camada
    // seria a segunda cópia da regra de furo, e a primeira a divergir.
    //
    // Parede sem composição continua saindo como UMA peça da espessura cheia:
    // o caminho de sempre, intocado.
    // `c.espessuraMm * S` direto, e não uma fração de `t`: a soma das camadas É
    // `thicknessMm` por invariante do kernel, então as faixas fecham a espessura
    // exatamente. Uma regra de três a partir de `t` daria o mesmo número e
    // acrescentaria um ponto onde arredondamento pode abrir fresta entre camadas.
    const faixas: { esp: number; funcao: string | null }[] = wall.camadas?.length
      ? wall.camadas.map((c) => ({ esp: c.espessuraMm * S, funcao: c.funcao }))
      : [{ esp: t, funcao: null }];

    // Começa na face de local Z negativo e avança. A ORDEM da lista é da face
    // esquerda para a direita do sentido `a → b` (ver `Wall.camadas`); qual das
    // duas faces do 3D corresponde a "esquerda" depende do referencial montado
    // em `makeBasis` acima, e por isso a conferência é VISUAL, com uma
    // composição assimétrica — numa parede de reboco simétrico um sinal trocado
    // não apareceria.
    let base = -t / 2;
    for (const faixa of faixas) {
      if (faixa.esp <= EPS) continue;
      const geom = new THREE.ExtrudeGeometry(shape, { depth: faixa.esp, bevelEnabled: false });
      geom.translate(0, 0, base);
      base += faixa.esp;
      // O BISEL, depois do `translate`: é ele que põe cada vértice na cota `z`
      // real dentro da espessura, e o avanço da mitra é função dessa cota.
      // Só a ponta da PAREDE entra — a borda de um trecho interrompido pelo
      // concreto é corte reto e continua reto.
      if (biselarA && Math.abs(sx0 - xIni) < TOL_PONTA) biselarPonta(geom, xIni, (z) => -avancoA(z));
      if (biselarB && Math.abs(sx1 - xFim) < TOL_PONTA) biselarPonta(geom, xFim, (z) => L + avancoB(z));
      pecas.push({ geom, quaternion, position, funcao: faixa.funcao });
    }
  };

  for (const tr of trechos) {
    if (tr.x1 - tr.x0 <= EPS) continue;

    // As peças que NÃO atravessam tudo, recortadas ao trecho, em metros.
    const parciais = perfil.furosEstruturais
      .filter((f) => !atravessaTudo(f))
      .map((f) => ({ x0: Math.max(tr.x0, f.x0 * S), x1: Math.min(tr.x1, f.x1 * S), y0: f.y0 * S, y1: f.y1 * S }))
      .filter((f) => f.x1 - f.x0 > EPS && f.y1 - f.y0 > EPS);
    const encostaNaBorda = (f: { y0: number; y1: number }) => f.y0 <= EPS || f.y1 >= A - EPS;
    const entalhes = parciais.filter(encostaNaBorda);
    const furosDoTrecho = [
      ...furosVisiveis.map((f) => ({ x0: f.x0 * S, x1: f.x1 * S, y0: f.y0 * S, y1: f.y1 * S })),
      ...parciais.filter((f) => !encostaNaBorda(f)),
    ];

    const cortes = [...new Set([tr.x0, tr.x1, ...entalhes.flatMap((e) => [e.x0, e.x1])])].sort((p, q) => p - q);
    for (let i = 0; i + 1 < cortes.length; i++) {
      const sx0 = cortes[i];
      const sx1 = cortes[i + 1];
      // A mesma régua da lasca: a viga de 15 cm que atravessa a parede é 5 mm
      // mais larga que o pilar de 14 embutido nela, e o entalhe sobrava 5 mm de
      // fatia rebaixada de cada lado do corte do pilar (medido na planta do
      // usuário, 16/09/2026). Fatia mais estreita que 2 cm não é parede.
      if (sx1 - sx0 <= LASCA_M) continue;
      const meio = (sx0 + sx1) / 2;
      // O que sobra da altura nesta fatia: [0, A] menos os entalhes que a cobrem.
      let faixasY: { ya: number; yb: number }[] = [{ ya: 0, yb: A }];
      for (const e of entalhes) {
        if (!(e.x0 <= meio && e.x1 >= meio)) continue;
        const y0 = e.y0 <= EPS ? 0 : e.y0;
        const y1 = e.y1 >= A - EPS ? A : e.y1;
        faixasY = faixasY.flatMap(({ ya, yb }) => {
          const sobra: { ya: number; yb: number }[] = [];
          if (y0 > ya) sobra.push({ ya, yb: Math.min(yb, y0) });
          if (y1 < yb) sobra.push({ ya: Math.max(ya, y1), yb });
          return sobra.filter((f) => f.yb - f.ya > EPS);
        });
      }
      for (const { ya, yb } of faixasY) montarFatia(sx0, sx1, ya, yb, furosDoTrecho);
    }
  }

  return pecas;
}

/**
 * Cor de cada camada no 3D — a MESMA leitura do canvas 2D.
 *
 * `null` é a parede sem composição, que mantém o cinza de sempre. Duas paletas
 * para a mesma informação fariam a mesma parede parecer duas coisas conforme a
 * vista, que é o tipo de divergência que ninguém reporta como bug e todo mundo
 * estranha.
 */
const COR_CAMADA_3D: Record<string, string> = {
  ESTRUTURAL: '#94a3b8',
  VEDACAO: '#cbd5e1',
  REVESTIMENTO: '#e2e8f0',
  ISOLAMENTO: '#fde68a',
  ACABAMENTO: '#f1f5f9',
  CAMARA_AR: '#ffffff',
};

/**
 * O anel do modelo como `THREE.Shape` deitado no chão.
 *
 * ⚠️ O `y` do modelo entra NEGADO, e isso não é gosto: o `rotateX(-π/2)` que
 * deita o plano XY no XZ leva `y → −z`. Sem negar antes, o polígono nasce
 * ESPELHADO em relação às paredes (que usam `wall.a.y` direto como z), e vai
 * parar do lado oposto do mundo. Numa planta centrada na origem os dois quase
 * se sobrepõem e o erro não aparece; numa planta real, que vive a dezenas de
 * metros da origem, o chão simplesmente some da tela. Negar aqui e girar depois
 * devolve `z = y`, alinhado com a parede.
 */
function shapeDoAnel(anel: { x: number; y: number }[]) {
  const shape = new THREE.Shape();
  shape.moveTo(anel[0].x * S, -anel[0].y * S);
  for (let i = 1; i < anel.length; i++) shape.lineTo(anel[i].x * S, -anel[i].y * S);
  shape.lineTo(anel[0].x * S, -anel[0].y * S);
  return shape;
}

/** Laje fina no contorno externo do nível. */
function geometriaDaLaje(anel: { x: number; y: number }[]) {
  if (anel.length < 3) return null;
  const geom = new THREE.ExtrudeGeometry(shapeDoAnel(anel), {
    depth: 0.12,
    bevelEnabled: false,
  });
  // Deita no XZ do mundo. A extrusão, que era +Z local, passa a subir em +Y.
  geom.rotateX(-Math.PI / 2);
  return geom;
}

/**
 * O MIOLO das junções de 3+ pontas — a massa que nenhuma parede cobre.
 *
 * Com duas paredes, a mitra parte o quadrado do canto em duas metades e cada uma
 * é de uma parede: não sobra nada e esta função não devolve nada. Com três ou
 * mais, cada ponta recua até a reta do seu setor e o centro fica vazio — num "T"
 * de vértice partilhado o buraco tem a largura do ramo pela espessura da
 * hospedeira, e apareceria como falta de massa onde antes havia massa DEMAIS.
 * Trocar um defeito por outro não é conserto.
 *
 * A altura é a MENOR das paredes que chegam ali: um miolo mais alto que a parede
 * mais baixa apareceria como dente por cima dela.
 */
function geometriasDasJuncoes(
  model: BlueprintModel,
  niveis: BlueprintModel['levels'],
  ocultos?: Set<string>,
) {
  const out: { geom: THREE.BufferGeometry; y: number }[] = [];
  for (const level of niveis) {
    // Recorte por nível, como em `perfilDaParedeComVaos`: coordenada não carrega
    // pavimento, e uma parede do 2º em cima de uma do térreo partilha o vértice.
    const doNivel = model.walls.filter((w) => w.levelId === level.id);

    // ⚠️ NÃO agrupar por coordenada exata e NÃO exigir "3+ pontas neste ponto".
    //
    // Quem decide se há miolo é `poligonoDaJuncao`, e ele conta as pontas por
    // TOLERÂNCIA (a mesma com que o arranjo solda vértices) e ainda soma as
    // paredes que chegam pela quina. Uma junção fechada com 5 mm de folga tem
    // duas chaves distintas de uma ponta cada — filtrar por `>= 3` aqui a
    // descartaria, e as paredes já teriam recuado: buraco na tela.
    //
    // O que sobra para o viewer é não desenhar o MESMO miolo duas vezes, quando
    // dois vértices quase coincidentes descrevem a mesma junção. Daí a varredura
    // em ordem determinística com a mesma folga.
    const candidatos: { x: number; y: number }[] = [];
    const pontos = doNivel
      .flatMap((w) => [w.a, w.b])
      .sort((a, b) => a.x - b.x || a.y - b.y);
    for (const p of pontos) {
      if (candidatos.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= DEFAULT_TOLERANCE_MM)) continue;
      candidatos.push(p);
    }

    for (const p of candidatos) {
      const naJuncao = doNivel.filter((w) =>
        (['a', 'b'] as const).some(
          (e) => Math.hypot(w[e].x - p.x, w[e].y - p.y) <= DEFAULT_TOLERANCE_MM,
        ),
      );
      // Junção cujas paredes estão TODAS escondidas não deixa miolo flutuando.
      // Escondida em parte, o miolo fica: ele é massa da junção, não da peça —
      // a mesma leitura que faz esconder um pilar não refechar a parede.
      if (ocultos?.size && naJuncao.length && naJuncao.every((w) => ocultos.has(w.id))) continue;
      const anel = poligonoDaJuncao(doNivel, p);
      if (!anel) continue;
      const altura = Math.min(...naJuncao.map((w) => w.heightMm)) * S;
      if (altura <= 0) continue;
      const geom = new THREE.ExtrudeGeometry(shapeDoAnel(anel), {
        depth: altura,
        bevelEnabled: false,
      });
      geom.rotateX(-Math.PI / 2);
      out.push({ geom, y: level.elevationMm * S });
    }
  }
  return out;
}

/** Plano de chão do lote — face chata do polígono do terreno, sem espessura. */
function geometriaDoTerreno(anel: { x: number; y: number }[]) {
  if (anel.length < 3) return null;
  const geom = new THREE.ShapeGeometry(shapeDoAnel(anel));
  geom.rotateX(-Math.PI / 2);
  return geom;
}

/**
 * Malha de UMA peça estrutural, já na cota dela.
 *
 * Três casos, um por forma geométrica:
 *
 *   PONTO redondo   → `CylinderGeometry`. Cilindro DE VERDADE, e não a caixa que
 *                     `contornoEmPlanta` devolveria: uma estaca ⌀30 desenhada
 *                     como quadrado não parece estaca nenhuma, e o 3D existe
 *                     justamente para se olhar.
 *   PONTO retangular→ `BoxGeometry` girada de `rotacaoDeg`.
 *   LINHA           → `BoxGeometry` do comprimento do eixo, girada para ele.
 *   AREA            → extrusão do anel, como a laje do contorno externo.
 *
 * A cota Y é `elevaçãoDoNível + baseMm`, e a peça sobe a partir dali — por isso
 * o centro da caixa fica em `base + altura/2`. Com `baseMm` negativo (estaca,
 * bloco, baldrame) a peça nasce abaixo do piso sozinha, sem nenhum caso especial.
 */
function geometriaDaEstrutura(
  s: Structural,
  elevacaoDoNivelMm: number,
  furos: { x: number; y: number }[][] = [],
) {
  const alturaM = s.alturaMm * S;
  if (alturaM <= 0) return null;

  const baseY = (elevacaoDoNivelMm + s.baseMm) * S;
  const forma = FORMA_ESTRUTURAL[s.kind];

  if (forma === 'AREA') {
    if (s.pontos.length < 3) return null;
    const shape = shapeDoAnel(s.pontos);
    // O FURO DA ESCADA na laje. Só entra quando cai INTEIRO no interior do
    // anel: furo que encosta na borda não é furo, é entalhe, e a triangulação
    // do `ExtrudeGeometry` não sabe representá-lo (a mesma limitação já
    // documentada para o vão da parede). O quantitativo desconta certo nos
    // dois casos; é só o desenho que simplifica.
    for (const furo of furos) {
      if (furo.length < 3) continue;
      if (!furo.every((q) => pointInPolygon(s.pontos, q))) continue;
      const caminho = new THREE.Path();
      caminho.moveTo(furo[0].x * S, -furo[0].y * S);
      for (let i = 1; i < furo.length; i++) caminho.lineTo(furo[i].x * S, -furo[i].y * S);
      caminho.lineTo(furo[0].x * S, -furo[0].y * S);
      shape.holes.push(caminho);
    }
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: alturaM,
      bevelEnabled: false,
    });
    geom.rotateX(-Math.PI / 2);
    // O anel já carrega X e Z; só a altura entra na posição.
    return { geom, position: new THREE.Vector3(0, baseY, 0), quaternion: null };
  }

  if (forma === 'LINHA') {
    const [a, b] = s.pontos;
    const comp = Math.hypot(b.x - a.x, b.y - a.y) * S;
    if (comp <= 0) return null;
    // SEÇÃO T: o perfil é extrudado ao longo do eixo, em vez de uma caixa.
    // Sem isto a viga faixa apareceria maciça — e o 3D mostraria três vezes o
    // concreto que o quantitativo cobra, que é a pior forma de discordar.
    const t = secaoTValida(s);
    const geom = t
      ? (() => {
          const perfil = new THREE.Shape();
          const c = contornoDaSecaoT(s.larguraMm, s.alturaMm, t);
          // O contorno vem em (largura, altura) e é extrudado no comprimento.
          // No espaço local da peça, X é o eixo — então o perfil desenha em
          // (z, y) e a extrusão anda em X depois da rotação.
          perfil.moveTo(c[0].x * S, c[0].y * S);
          for (let i = 1; i < c.length; i++) perfil.lineTo(c[i].x * S, c[i].y * S);
          perfil.closePath();
          const g = new THREE.ExtrudeGeometry(perfil, { depth: comp, bevelEnabled: false });
          // O `ExtrudeGeometry` sobe em +Z; a viga anda em +X, e o perfil fica
          // no plano (z, y). Girar em Y leva a profundidade para o eixo, e a
          // translação recentra o que o extrude deixou começando em 0.
          g.rotateY(Math.PI / 2);
          g.translate(-comp / 2, 0, 0);
          return g;
        })()
      : new THREE.BoxGeometry(comp, alturaM, s.larguraMm * S);
    // `y → z` como nas paredes; a direção do eixo vira o X local.
    const dir = new THREE.Vector3(b.x - a.x, 0, b.y - a.y).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const nrm = new THREE.Vector3().crossVectors(dir, up).normalize();
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(dir, up, nrm),
    );
    const position = new THREE.Vector3(
      ((a.x + b.x) / 2) * S,
      baseY + alturaM / 2,
      ((a.y + b.y) / 2) * S,
    );
    return { geom, position, quaternion };
  }

  const c = s.pontos[0];
  const geom = s.circular
    ? new THREE.CylinderGeometry((s.larguraMm / 2) * S, (s.larguraMm / 2) * S, alturaM, 24)
    : new THREE.BoxGeometry(s.larguraMm * S, alturaM, s.profundidadeMm * S);
  // O giro da seção é em torno do eixo VERTICAL (Y do mundo). O sinal é negativo
  // pela mesma razão de `shapeDoAnel` negar o y: o modelo é XY com Y para cima,
  // o mundo é XZ com Z para o sul, e um giro positivo em planta é negativo aqui.
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, (-s.rotacaoDeg * Math.PI) / 180, 0),
  );
  return {
    geom,
    position: new THREE.Vector3(c.x * S, baseY + alturaM / 2, c.y * S),
    quaternion,
  };
}

/**
 * Malha de UMA água de telhado, já na cota dela — um PRISMA INCLINADO.
 *
 * ─── POR QUE NÃO `ExtrudeGeometry` + rotação, como a laje ──────────────────
 *
 * O mapeamento modelo → mundo deste viewer (`x → X`, `y → Z`, cota → `Y`) é uma
 * REFLEXÃO: troca a mão do sistema. A laje escapa disso com o `-y` de
 * `shapeDoAnel` seguido de `rotateX`, que é um truque de plano horizontal. Num
 * plano INCLINADO o truque vira uma base de três vetores que sai canhota, e a
 * extrusão cresce para o lado errado do telhado — o defeito só aparece a olho,
 * no 3D de outra pessoa.
 *
 * Então a malha é montada DIRETO em coordenadas de mundo: a face de cima é o
 * contorno da água com a cota de cada vértice (`contornoDaAguaEm3d`), a de
 * baixo é a mesma face deslocada `espessuraMm` ao longo da normal do plano
 * (`normalDaAgua`), e as laterais fecham o prisma. Nenhuma matriz, nenhum
 * sinal para acertar. A triangulação é feita em PLANTA, o que é legítimo porque
 * o plano projeta bijetivamente sobre ela — vale para "L" e para qualquer
 * polígono simples.
 *
 * `side: DoubleSide` no material, como o resto do viewer: a orientação das
 * faces após a reflexão não importa para o que se vê.
 */
function geometriaDaAgua(agua: Agua, elevacaoDoNivelMm: number): THREE.BufferGeometry | null {
  if (agua.pontos.length < 3) return null;

  const topo3d = contornoDaAguaEm3d(agua);
  const n = normalDaAgua(agua);
  // Modelo (x, y, z↑) → mundo (X = x, Y = z, Z = y). O `y → Z` SEM sinal é o
  // mesmo das paredes; `shapeDoAnel` só nega o y porque passa por um `rotateX`.
  const topo = topo3d.map(
    (p) => new THREE.Vector3(p.x * S, (elevacaoDoNivelMm + p.z) * S, p.y * S),
  );
  const desl = new THREE.Vector3(n.x, n.z, n.y).multiplyScalar(-agua.espessuraMm * S);
  const base = topo.map((v) => v.clone().add(desl));

  const tri = THREE.ShapeUtils.triangulateShape(
    agua.pontos.map((p) => new THREE.Vector2(p.x, p.y)),
    [],
  );

  const pos: number[] = [];
  const push = (v: THREE.Vector3) => pos.push(v.x, v.y, v.z);
  for (const [a, b, c] of tri) {
    push(topo[a]); push(topo[b]); push(topo[c]);
    push(base[c]); push(base[b]); push(base[a]);
  }
  const m = topo.length;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    push(topo[i]); push(topo[j]); push(base[j]);
    push(topo[i]); push(base[j]); push(base[i]);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.computeVertexNormals();
  return geom;
}

/**
 * A escada ou rampa como UM prisma por fatia, montado DIRETO em coordenadas de
 * mundo — pela razão de `geometriaDaAgua`: o mapeamento modelo → mundo é uma
 * reflexão, e um `ExtrudeGeometry` girado sairia com a mão trocada num topo
 * inclinado. Cada fatia tem quatro cantos com cota própria (plana no degrau,
 * inclinada na rampa), então topo e base são dois quadriláteros e as laterais
 * fecham. Nenhuma matriz.
 */
function geometriaDaEscada(
  model: BlueprintModel,
  escada: Escada,
  elevacaoDoNivelMm: number,
): THREE.BufferGeometry | null {
  const fatias: FatiaDaEscada[] = fatiasDaEscada(model, escada);
  if (fatias.length === 0) return null;

  const pos: number[] = [];
  const push = (v: THREE.Vector3) => pos.push(v.x, v.y, v.z);
  const baseY = elevacaoDoNivelMm * S;

  for (const f of fatias) {
    const topo = f.cantos.map(
      (c, k) => new THREE.Vector3(c.x * S, (elevacaoDoNivelMm + f.cotasMm[k]) * S, c.y * S),
    );
    const base = f.cantos.map((c) => new THREE.Vector3(c.x * S, baseY, c.y * S));
    const n = topo.length;
    // Topo e base como dois triângulos cada (os cantos vêm em ordem de anel).
    for (let i = 1; i + 1 < n; i++) {
      push(topo[0]); push(topo[i]); push(topo[i + 1]);
      push(base[i + 1]); push(base[i]); push(base[0]);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      push(topo[i]); push(topo[j]); push(base[j]);
      push(topo[i]); push(base[j]); push(base[i]);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.computeVertexNormals();
  return geom;
}

/** Destaque da peça selecionada. Vence a cor do 4D — retorno de ação primeiro. */
const COR_SELECIONADA = '#2563eb';

/**
 * O clique que SELECIONA, sem confundir com ORBITAR.
 *
 * ─── O PROBLEMA ────────────────────────────────────────────────────────────
 *
 * Numa cena 3D o mesmo botão do mouse faz as duas coisas: arrastar gira a
 * câmera, clicar escolhe a peça. O `onClick` do R3F dispara no `pointerup`
 * mesmo depois de um arraste — então girar a cena e soltar o botão em cima de
 * uma parede a selecionaria, e a pessoa veria o painel trocar sem ter pedido.
 *
 * A decisão é pela DISTÂNCIA percorrida entre apertar e soltar, e mora em
 * `utils/blueprint3dSelecao.ts` — puro e testado, porque aqui dentro, sob
 * `@ts-nocheck`, nem compilador nem teste alcançam.
 *
 * `stopPropagation` só no clique de verdade: sem ele o raycast atinge também as
 * peças ATRÁS da clicada, e a última a responder ganharia — selecionando algo
 * que a pessoa nem vê.
 */
function usarCliqueDePeca(onSelecionar?: (ids: string[]) => void) {
  const inicio = useRef<{ x: number; y: number } | null>(null);
  return (id: string) =>
    onSelecionar
      ? {
          onPointerDown: (e: { clientX: number; clientY: number }) => {
            inicio.current = { x: e.clientX, y: e.clientY };
          },
          onPointerUp: (e: {
            clientX: number;
            clientY: number;
            stopPropagation: () => void;
          }) => {
            const i = inicio.current;
            inicio.current = null;
            if (!ehClique(i, { x: e.clientX, y: e.clientY })) return;
            e.stopPropagation();
            onSelecionar([id]);
          },
          onPointerOver: (e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            // O cursor é o que ANUNCIA que a cena é clicável. Sem ele ninguém
            // descobre o recurso — foi o que aconteceu com "Inverter o lado".
            document.body.style.cursor = 'pointer';
          },
          onPointerOut: () => {
            document.body.style.cursor = '';
          },
        }
      : {};
}

function Cena({ model, levelIds, mostrarLaje, mostrarArestas, mostrarTerreno, envelope, entorno, relevo, relevoChave, extrasDoRelevo, extrasChave, ocultos, coresPorUid, selecionados, onSelecionar, armadura, estilo = 'SOMBREADO' }: Props) {
  const niveis = model.levels.filter((l) => !levelIds || levelIds.includes(l.id));
  const idsVisiveis = new Set(niveis.map((l) => l.id));

  // `Set` tem identidade nova a cada alternância, então a dep é o CONTEÚDO — o
  // mesmo idioma do `levelIds?.join(',')` que os memos daqui já usam.
  const chaveOcultos = ocultos ? [...ocultos].sort().join(',') : '';
  const escondida = (id: string) => !!ocultos?.has(id);

  const cliqueDe = usarCliqueDePeca(onSelecionar);

  const paredes = useMemo(
    () =>
      model.walls
        .filter((w) => idsVisiveis.has(w.levelId) && !escondida(w.id))
        // `flatMap`: uma parede pode virar VÁRIOS pedaços quando o concreto a
        // interrompe (ver `geometriaDaParede`).
        // O `uid` acompanha cada pedaço para o 4D poder colorir por elemento.
        // Uma parede vira VÁRIOS pedaços quando o concreto a interrompe, e todos
        // são a mesma parede — logo, a mesma cor.
        .flatMap((w) =>
          geometriaDaParede(model, w, ocultos).map((g) => ({ ...g, uid: w.uid, id: w.id, cortina: !!w.cortina })),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, levelIds?.join(','), chaveOcultos],
  );

  const juncoes = useMemo(
    () => geometriasDasJuncoes(model, niveis, ocultos),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, levelIds?.join(','), chaveOcultos],
  );

  const lajes = useMemo(() => {
    if (!mostrarLaje) return [];
    const out: { geom: THREE.BufferGeometry; y: number }[] = [];
    for (const level of niveis) {
      for (const anel of contornoExternoDoNivel(model, level)) {
        const geom = geometriaDaLaje(anel);
        if (geom) out.push({ geom, y: level.elevationMm * S });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, levelIds?.join(','), mostrarLaje]);

  // ⚠️ ANTES de `estruturas`, que o consome. Em 05/09/2026 este bloco nasceu
  // DEPOIS dela e derrubou a vista 3D inteira: `useMemo` roda na hora, então o
  // `.map` das peças tocava uma `const` ainda na zona morta temporal —
  // "Cannot access 'furosPorLaje' before initialization", e a aba não abria.
  //
  // O compilador teria pego (TS2448), mas este arquivo está sob `@ts-nocheck`
  // pela augmentation de JSX do R3F. Quem pega é o harness — ver o cabeçalho.
  const furosPorLaje = useMemo(() => {
    const porLaje = new Map<string, { x: number; y: number }[][]>();
    for (const f of furosDaEscada(model)) {
      const lista = porLaje.get(f.structuralId) ?? [];
      lista.push(f.contorno);
      porLaje.set(f.structuralId, lista);
    }
    // NÚCLEO VERTICAL (E2.4): shaft e elevador furam a laje como a escada.
    for (const f of furosDoNucleo(model)) {
      const lista = porLaje.get(f.structuralId) ?? [];
      lista.push(f.contorno);
      porLaje.set(f.structuralId, lista);
    }
    return porLaje;
  }, [model]);

  const estruturas = useMemo(
    () =>
      (model.structures ?? [])
        .filter((s) => idsVisiveis.has(s.levelId) && !escondida(s.id))
        .map((s) => {
          const nivel = model.levels.find((l) => l.id === s.levelId);
          const g = geometriaDaEstrutura(s, nivel?.elevationMm ?? 0, furosPorLaje.get(s.id) ?? []);
          return g ? { ...g, enterrada: s.baseMm < 0, uid: s.uid, id: s.id } : null;
        })
        .filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, levelIds?.join(','), chaveOcultos],
  );

  // ─── AS BARRAS ───────────────────────────────────────────────────────────
  //
  // Duas geometrias de segmentos (longitudinal e transversal), uma cor cada,
  // montadas de uma vez: milhares de segmentos num `LineSegments` só custam
  // um draw call por cor; um `<Line>` por barra travaria a cena numa planta
  // com dezesseis pilares e quatro lajes. Peças ocultas e de pavimentos fora
  // da vista não entram — o mesmo recorte das malhas de concreto.
  const barras = useMemo(() => {
    if (!armadura) return null;
    const segs = segmentosDaArmaduraDoModelo(
      model,
      armadura.pecas,
      armadura.hipoteses,
      (s) => idsVisiveis.has(s.levelId) && !escondida(s.id),
    );
    const montar = (filtro: (papel: string) => boolean) => {
      const pos: number[] = [];
      for (const g of segs) {
        if (!filtro(g.papel)) continue;
        pos.push(g.a.x * S, g.a.z * S, g.a.y * S, g.b.x * S, g.b.z * S, g.b.y * S);
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      return geom;
    };
    return { longitudinais: montar((p) => !ehTransversal(p) && p !== 'malha'), transversais: montar((p) => ehTransversal(p) || p === 'malha') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, armadura, levelIds?.join(','), chaveOcultos]);

  // Os furos que as escadas abrem, por laje — derivados a cada leitura, como
  // o desconto do quantitativo. Escada escondida NÃO refecha a laje: a
  // decisão de esconder é do olho, não do modelo (mesma regra do pilar que não
  // refecha a parede).
  const escadas = useMemo(
    () =>
      (model.stairs ?? [])
        .filter((e) => idsVisiveis.has(e.levelId) && !escondida(e.id))
        .map((e) => {
          const nivel = model.levels.find((l) => l.id === e.levelId);
          return geometriaDaEscada(model, e, nivel?.elevationMm ?? 0);
        })
        .filter((g): g is THREE.BufferGeometry => g !== null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, levelIds?.join(','), chaveOcultos],
  );

  const telhados = useMemo(
    () =>
      (model.roofs ?? [])
        .filter((r) => idsVisiveis.has(r.levelId) && !escondida(r.id))
        .map((r) => {
          const nivel = model.levels.find((l) => l.id === r.levelId);
          return geometriaDaAgua(r, nivel?.elevationMm ?? 0);
        })
        .filter((g): g is THREE.BufferGeometry => g !== null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, levelIds?.join(','), chaveOcultos],
  );

  /**
   * As INSTALAÇÕES — um cilindro por trecho, uma esfera por terminal.
   *
   * ⚠️ Toda a geometria sai de `utils/blueprintRede.ts`, e nada dela é
   * calculado aqui. Este arquivo está sob `@ts-nocheck`: um sinal trocado
   * nesta linha não seria acusado por nada, e o sintoma — um cano deitado ou
   * num andar errado — é plausível demais para alguém notar. Lá o compilador
   * olha e o teste alcança.
   */
  const redes = useMemo(
    () =>
      (model.trechos ?? [])
        .filter((t) => idsVisiveis.has(t.levelId) && !escondida(t.id))
        // ⚠️ Um trecho vira UM OU DOIS cilindros: o eletroduto embutido não anda
        // em diagonal — sobe pela parede e corre pelo teto (ou pelo piso). O
        // "L" sai de `segmentosDoEletroduto`, que decide em qual ponta fica a
        // horizontal; aqui só se desenha o que ela devolve. Pedido de
        // 10/09/2026: "na planta 3D o eletroduto deve ser representado
        // seguindo a parede, teto ou piso".
        .flatMap((t) => {
          const nivel = model.levels.find((l) => l.id === t.levelId);
          return segmentosDoEletroduto(t, nivel?.defaultHeightMm ?? 2800).map((seg, k) => ({
            t,
            k,
            c: cilindroDoTrecho({ ...t, ...seg }, nivel?.elevationMm ?? 0),
          }));
        })
        .map(({ t, k, c }) => {
          // O `CylinderGeometry` nasce alinhado ao Y — daí a prumada ser o caso
          // trivial e a rotação sair de um `setFromUnitVectors` só.
          const quaternion = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(c.eixo[0], c.eixo[1], c.eixo[2]),
          );
          return {
            // A chave do React precisa distinguir os dois pedaços; o id de
            // seleção continua sendo o do TRECHO — clicar em qualquer pedaço
            // seleciona a peça inteira.
            chave: `${t.id}-${k}`,
            id: t.id,
            uid: t.uid,
            cor: COR_DA_DISCIPLINA[t.disciplina],
            // Raio mínimo de 15 mm no desenho: um eletroduto de 25 mm tem 12 mm
            // de raio e some na tela cheia. Isto é ESPESSURA DE TRAÇO, não
            // medida — o quantitativo usa a bitola de verdade.
            geom: new THREE.CylinderGeometry(
              Math.max(c.raioM, 0.015),
              Math.max(c.raioM, 0.015),
              c.comprimentoM,
              10,
            ),
            position: new THREE.Vector3(c.centro[0], c.centro[1], c.centro[2]),
            quaternion,
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, levelIds?.join(','), chaveOcultos],
  );

  /**
   * Os TERMINAIS — uma CAIXA nas medidas declaradas, não mais uma esfera fixa.
   *
   * ⚠️ Caixa, e não esfera, porque é o que o IFC emite: duas formas para a mesma
   * peça fariam o 3D e o arquivo entregue discordarem sobre o que existe.
   */
  const terminais3d = useMemo(
    () =>
      (model.terminais ?? [])
        .filter((t) => idsVisiveis.has(t.levelId) && !escondida(t.id))
        .map((t) => {
          const nivel = model.levels.find((l) => l.id === t.levelId);
          const c = caixaDaPeca(t.at, t.cotaMm, nivel?.elevationMm ?? 0, medidasDoTerminal(t));
          return {
            id: t.id,
            uid: t.uid,
            cor: COR_DA_DISCIPLINA[t.disciplina],
            tamanho: c.tamanho,
            // ⚠️ O sinal do giro vem de `rotacaoY3D`, no módulo puro: aqui é
            // `@ts-nocheck` e um sinal trocado passaria sem acusação, com o
            // sintoma de uma peça virada para o lado errado — plausível demais.
            giroY: rotacaoY3D(giroDaPeca(t)),
            position: new THREE.Vector3(c.centro[0], c.centro[1], c.centro[2]),
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, levelIds?.join(','), chaveOcultos],
  );

  /**
   * Os QUADROS de distribuição.
   *
   * ⚠️ Eles simplesmente NÃO EXISTIAM no 3D — nem como marca de lugar. Quem
   * desenhava um quadro e abria a vista 3D via a instalação inteira menos a
   * peça de onde ela sai, e nada na tela dizia que faltava algo.
   */
  const quadros3d = useMemo(
    () =>
      (model.quadros ?? [])
        .filter((q) => idsVisiveis.has(q.levelId) && !escondida(q.id))
        .map((q) => {
          const nivel = model.levels.find((l) => l.id === q.levelId);
          const c = caixaDaPeca(q.at, q.cotaMm, nivel?.elevationMm ?? 0, medidasDoQuadro(q));
          return {
            id: q.id,
            uid: q.uid,
            tamanho: c.tamanho,
            giroY: rotacaoY3D(giroDaPeca(q)),
            position: new THREE.Vector3(c.centro[0], c.centro[1], c.centro[2]),
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, levelIds?.join(','), chaveOcultos],
  );

  /**
   * O chão: a MALHA do relevo quando há topografia, o plano chato do lote
   * quando não há.
   *
   * A malha vem pronta em números crus (`malhaDaGrade`, puro e testado fora
   * deste arquivo sem checagem): aqui é só `BufferGeometry` + índices, o mesmo
   * caminho do `ifcViewerService`. Coordenadas de mundo diretas, SEM negar `y`
   * — a rota `shapeDoAnel` + `rotateX` só vale para plano horizontal.
   */
  const usaRelevo = !!(mostrarTerreno && relevo && relevo.triangulos > 0);
  const terreno = useMemo(() => {
    if (!mostrarTerreno) return null;
    if (relevo && relevo.triangulos > 0) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(relevo.posicoes, 3));
      geom.setIndex(new THREE.BufferAttribute(relevo.indices, 1));
      geom.computeVertexNormals();
      return geom;
    }
    const t = medirTerreno(model.boundaries);
    if (!t || t.anel.length < 3) return null;
    return geometriaDoTerreno(t.anel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, mostrarTerreno, relevoChave]);

  /**
   * Drenagem e muros sobre o relevo (fase 8): as linhas viram `Line` (uma cor
   * para o que escoa, vermelho para o que não escoa); a face do muro vira uma
   * tira de triângulos. Tudo já em metros de mundo, vindo de
   * `blueprintTopografia3dExtras` — aqui só se monta a geometria.
   */
  const extras3d = useMemo(() => {
    if (!mostrarTerreno || !extrasDoRelevo) return null;
    const linhas = extrasDoRelevo.drenagem.map((d) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(d.posicoes, 3));
      return { id: d.id, atende: d.atende, geometria: g };
    });
    const muros = extrasDoRelevo.muros.map((m) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(m.posicoes, 3));
      g.setIndex(new THREE.BufferAttribute(m.indices, 1));
      g.computeVertexNormals();
      return { aresta: m.aresta, geometria: g };
    });
    return { linhas, muros };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarTerreno, extrasChave]);

  /** Os prismas do envelope edificável (E3.3), já na cota de cada pavimento. */
  const prismasDoEnvelope = useMemo(() => {
    if (!envelope) return [];
    // P2.11: um prisma por PEÇA (a servidão no meio divide o envelope).
    return envelope
      .filter((p) => p.anel.length >= 3 && p.topoMm > p.baseMm)
      .flatMap((p) => (p.pecas?.length ? p.pecas : [p.anel]).map((anel, i) => {
        const geom = new THREE.ExtrudeGeometry(shapeDoAnel(anel), { depth: (p.topoMm - p.baseMm) * S, bevelEnabled: false });
        geom.rotateX(-Math.PI / 2);
        return { levelId: `${p.levelId}${i > 0 ? `-${i}` : ''}`, nome: p.nome, geom, y: p.baseMm * S, acimaDoGabarito: p.acimaDoGabarito };
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envelope]);

  /** COMPONENTES (E7.1): caixas no piso do pavimento — mobiliário cinza-quente, louça branca. */
  const caixasDeComponentes = useMemo(() => {
    const out: { id: string; geom: THREE.BufferGeometry; pos: [number, number, number]; rot: number; cor: string; sugerido: boolean }[] = [];
    for (const c of model.componentes ?? []) {
      if (!levelIds || !levelIds.includes(c.levelId)) continue;
      if (ocultos?.has(c.id)) continue;
      // FAMÍLIAS ANINHADAS (P2.18): o conjunto é agrupamento; as caixas são as dos filhos.
      if (ehConjunto(c.tipoId)) continue;
      const nivel = model.levels.find((l) => l.id === c.levelId);
      if (!nivel) continue;
      const geom = new THREE.BoxGeometry(c.larguraMm * S, c.alturaMm * S, c.profundidadeMm * S);
      const cor = c.familia === 'LOUCA' ? '#f8fafc' : c.familia === 'EQUIPAMENTO' ? '#cbd5e1' : c.familia === 'ARMARIO' ? '#b08968' : c.familia === 'CLIMATIZACAO' ? '#5eead4' : '#a3b18a';
      // E11.1: a base pode estar acima do piso (evaporadora, exaustor).
      // A convenção mora em `blueprint3dPecas` (Z = y do modelo, giro invertido) — a mesma das paredes.
      const { pos, rot } = pecaNoMundo(c.at, c.rotacaoGraus, c.alturaMm, c.cotaMm ?? 0, nivel.elevationMm);
      out.push({ id: c.id, geom, pos, rot, cor, sugerido: !!c.sugerido });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.componentes, model.levels, levelIds, ocultos]);

  /** GUARDA-CORPOS (E7.3): um painel fino por trecho, na altura declarada; vidro translúcido, sugerido mais ainda. */
  const paineisDeGuardaCorpo = useMemo(() => {
    const out: { id: string; chave: string; geom: THREE.BufferGeometry; pos: [number, number, number]; rot: number; material: string; sugerido: boolean }[] = [];
    for (const g of model.guardaCorpos ?? []) {
      if (!levelIds || !levelIds.includes(g.levelId)) continue;
      if (ocultos?.has(g.id)) continue;
      const nivel = model.levels.find((l) => l.id === g.levelId);
      if (!nivel) continue;
      for (const painel of paineisDaPolilinha(g.pontos, g.alturaMm, nivel.elevationMm)) {
        const geom = new THREE.BoxGeometry(painel.comprimentoM, g.alturaMm * S, 50 * S);
        out.push({ id: g.id, chave: `${g.id}-${painel.trecho}`, geom, pos: painel.pos, rot: painel.rot, material: g.material, sugerido: !!g.sugerido });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.guardaCorpos, model.levels, levelIds, ocultos]);

  /**
   * NÚCLEOS VERTICAIS NO 3D (20/09/2026, backlog P2 — P2.6): até aqui só o furo
   * na laje aparecia. Agora o SHAFT é um prisma translúcido do piso de partida
   * ao teto do último pavimento (na cor da disciplina — verde-azulado se
   * mecânico, cinza se geral) e o ELEVADOR é a caixa translúcida + o POÇO
   * abaixo do piso de partida + a CASA DE MÁQUINAS acima do último teto (as
   * medidas da ficha) + a CABINE opaca no pavimento de partida. Translúcido e
   * com arestas: é vazio de projeto, não massa — a planta continua legível.
   */
  const prismasDeNucleo = useMemo(() => {
    const out: { id: string; chave: string; geom: THREE.BufferGeometry; y: number; cor: string; opacidade: number; arestas: string }[] = [];
    for (const n of model.nucleos ?? []) {
      const pavimentos = pavimentosDoNucleo(model, n);
      if (levelIds && !pavimentos.some((p) => levelIds.includes(p.id))) continue;
      if (ocultos?.has(n.id)) continue;
      // Os números vêm do módulo puro (`blueprintNucleo3d`); aqui só a geometria.
      for (const p of prismasDoNucleo(model, n)) {
        const geom = new THREE.ExtrudeGeometry(shapeDoAnel(p.anel), { depth: p.alturaMm * S, bevelEnabled: false });
        geom.rotateX(-Math.PI / 2);
        out.push({ id: n.id, chave: `${n.id}-${p.parte}`, geom, y: p.baseMm * S, cor: p.cor, opacidade: p.opacidade, arestas: p.arestas });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.nucleos, model.levels, levelIds, ocultos]);

  /** Os vizinhos do entorno (E5.1): prismas opacos que projetam sombra. */
  const prismasDoEntorno = useMemo(() => {
    if (!entorno) return [];
    return entorno
      .filter((p) => p.anel.length >= 3 && p.alturaMm > 0)
      .map((p) => {
        const geom = new THREE.ExtrudeGeometry(shapeDoAnel(p.anel), { depth: p.alturaMm * S, bevelEnabled: false });
        geom.rotateX(-Math.PI / 2);
        return { id: p.id, geom };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entorno]);

  return (
    <group>
      {caixasDeComponentes.map((c) => (
        <mesh key={`componente-${c.id}`} geometry={c.geom} position={c.pos} rotation={[0, c.rot, 0]} castShadow receiveShadow onClick={(e) => { e.stopPropagation(); onSelecionar?.([c.id]); }}>
          <meshStandardMaterial color={selecionados?.has(c.id) ? '#2563eb' : c.cor} transparent={c.sugerido} opacity={c.sugerido ? 0.55 : 1} roughness={0.85} />
        </mesh>
      ))}
      {paineisDeGuardaCorpo.map((g) => (
        <mesh key={`guarda-corpo-${g.chave}`} geometry={g.geom} position={g.pos} rotation={[0, g.rot, 0]} castShadow receiveShadow onClick={(e) => { e.stopPropagation(); onSelecionar?.([g.id]); }}>
          <meshStandardMaterial color={selecionados?.has(g.id) ? '#2563eb' : g.material === 'VIDRO' ? '#bae6fd' : g.material === 'MADEIRA' ? '#a16207' : g.material === 'ALVENARIA' ? '#e7e5e4' : '#334155'} transparent={g.material === 'VIDRO' || g.sugerido} opacity={g.sugerido ? 0.45 : g.material === 'VIDRO' ? 0.4 : 1} roughness={g.material === 'INOX' ? 0.2 : 0.7} metalness={g.material === 'INOX' || g.material === 'METALICO' ? 0.6 : 0} />
        </mesh>
      ))}
      {prismasDeNucleo.map((p) => (
        <mesh key={`nucleo-${p.chave}`} geometry={p.geom} position={[0, p.y, 0]} onClick={(e) => { e.stopPropagation(); onSelecionar?.([p.id]); }}>
          <meshStandardMaterial color={selecionados?.has(p.id) ? '#2563eb' : p.cor} transparent={p.opacidade < 1} opacity={selecionados?.has(p.id) ? Math.max(0.35, p.opacidade) : p.opacidade} depthWrite={p.opacidade >= 1} side={THREE.DoubleSide} roughness={0.8} />
          <Edges color={p.arestas} />
        </mesh>
      ))}
      {prismasDoEntorno.map((p) => (
        <mesh key={`entorno-${p.id}`} geometry={p.geom} castShadow receiveShadow>
          <meshStandardMaterial color="#cbd5e1" roughness={0.9} />
          <Edges color="#94a3b8" />
        </mesh>
      ))}
      {prismasDoEnvelope.map((p) => (
        <mesh key={`env-${p.levelId}`} geometry={p.geom} position={[0, p.y, 0]} renderOrder={-1}>
          {/* Translúcido e sem escrever profundidade: é referência, não massa —
              a edificação continua legível por dentro dele. */}
          <meshStandardMaterial color={p.acimaDoGabarito ? '#dc2626' : '#d97706'} transparent opacity={p.acimaDoGabarito ? 0.12 : 0.09} depthWrite={false} side={THREE.DoubleSide} />
          <Edges color={p.acimaDoGabarito ? '#b91c1c' : '#b45309'} />
        </mesh>
      ))}
      {extras3d?.linhas.map((l) => (
        <line key={`dren-${l.id}`} geometry={l.geometria}>
          <lineBasicMaterial color={l.atende ? '#0284c7' : '#dc2626'} linewidth={2} />
        </line>
      ))}
      {extras3d?.muros.map((m) => (
        <mesh key={`muro-${m.aresta}`} geometry={m.geometria} castShadow receiveShadow>
          <meshStandardMaterial color="#6b7280" roughness={0.9} side={THREE.DoubleSide} />
          <Edges color="#1f2937" />
        </mesh>
      ))}
      {terreno && (
        // ACIMA da grade, e com folga de verdade (ver COTA_GRADE_Y).
        //
        // A primeira versão punha o lote 1 cm ABAIXO da grade, e ele
        // simplesmente não aparecia num estudo real: as coordenadas ficam a
        // dezenas de metros da origem, a câmera recua junto, e a essa distância
        // 1 cm não distingue nada no depth buffer — a grade ganhava. Num lote
        // sintético perto da origem o mesmo código desenhava certo, que é o
        // que fazia o defeito passar despercebido.
        //
        // Com RELEVO a malha já carrega a cota em Y: nada de deslocar.
        <mesh geometry={terreno} position={[0, usaRelevo ? 0 : COTA_TERRENO_Y, 0]} receiveShadow castShadow={usaRelevo}>
          <meshStandardMaterial
            color="#d9cfbd"
            roughness={1}
            side={THREE.DoubleSide}
            // Empurra o polígono para trás na resolução de profundidade sem
            // movê-lo no mundo: segura a briga com a laje do térreo, que fica
            // na cota 0 logo acima.
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
          <Edges color="#a8a29e" />
        </mesh>
      )}
      {paredes.map((p, i) => (
        <mesh
          key={i}
          geometry={p.geom}
          position={p.position}
          quaternion={p.quaternion}
          castShadow
          receiveShadow
          {...cliqueDe(p.id)}
        >
          {/* Sem composição, o cinza de sempre. Com ela, a cor da função —
              a mesma paleta do canvas 2D. */}
          <meshStandardMaterial
            color={
              selecionados?.has(p.id)
                ? COR_SELECIONADA
                : estilo === 'LINHA_OCULTA'
                  ? '#ffffff'
                  : p.cortina
                    ? '#7dd3fc'
                    : (coresPorUid?.get(p.uid) ?? ((p.funcao && COR_CAMADA_3D[p.funcao]) || '#e2e8f0'))
            }
            roughness={estilo === 'LINHA_OCULTA' ? 1 : p.cortina ? 0.15 : 0.85}
            side={THREE.DoubleSide}
            // CORTINA DE VIDRO (P2.20): translúcida em qualquer estilo — é vidro.
            transparent={estilo === 'TRANSPARENTE' || p.cortina}
            opacity={estilo === 'TRANSPARENTE' ? 0.35 : p.cortina ? 0.45 : 1}
            depthWrite={estilo !== 'TRANSPARENTE' && !p.cortina}
          />
          {(mostrarArestas || estilo === 'LINHA_OCULTA') && <Edges color={estilo === 'LINHA_OCULTA' ? '#0f172a' : '#475569'} threshold={20} />}
        </mesh>
      ))}
      {/* O miolo da junção usa a MESMA cor e o mesmo material da parede sem
          composição: ele é alvenaria, não peça à parte. Sem `<Edges>`, porque
          as arestas dele coincidem com as pontas das paredes que o cercam e
          sairiam como risco duplo no canto. */}
      {juncoes.map((j, i) => (
        <mesh key={`juncao-${i}`} geometry={j.geom} position={[0, j.y, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#e2e8f0" roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {lajes.map((l, i) => (
        <mesh key={`laje-${i}`} geometry={l.geom} position={[0, l.y, 0]} receiveShadow>
          <meshStandardMaterial color="#cbd5e1" roughness={0.95} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* ESTRUTURA por último: ela fica DENTRO da alvenaria quase sempre, e
          desenhada antes seria comida pela parede na resolução de profundidade.
          Cinza-concreto, mais escuro que a parede — a mesma hierarquia da planta
          baixa. A peça de fundação vem em tom terroso, porque está enterrada e
          precisa se ler como outra coisa. */}
      {estruturas.map((s, i) => (
        <mesh
          key={`estrutura-${i}`}
          geometry={s.geom}
          position={s.position}
          {...(s.quaternion ? { quaternion: s.quaternion } : {})}
          castShadow
          receiveShadow
          {...cliqueDe(s.id)}
        >
          <meshStandardMaterial
            color={
              selecionados?.has(s.id)
                ? COR_SELECIONADA
                : estilo === 'LINHA_OCULTA'
                  ? '#ffffff'
                  : (coresPorUid?.get(s.uid) ?? (s.enterrada ? '#a8a29e' : '#94a3b8'))
            }
            roughness={0.9}
            side={THREE.DoubleSide}
            // Com a armadura ligada o concreto vira vidro fosco: as barras
            // estão DENTRO dele, e opaco ninguém as veria. `depthWrite` falso
            // para as barras de trás não sumirem atrás da face da frente.
            // O estilo TRANSPARENTE (E8.2) faz o mesmo, mais claro.
            transparent={!!armadura || estilo === 'TRANSPARENTE'}
            opacity={armadura ? 0.28 : estilo === 'TRANSPARENTE' ? 0.35 : 1}
            depthWrite={!armadura && estilo !== 'TRANSPARENTE'}
          />
          {(mostrarArestas || estilo === 'LINHA_OCULTA') && <Edges color={estilo === 'LINHA_OCULTA' ? '#0f172a' : '#334155'} threshold={20} />}
        </mesh>
      ))}
      {barras && (
        <>
          <lineSegments geometry={barras.longitudinais} renderOrder={2}>
            <lineBasicMaterial color={COR_BARRA_LONGITUDINAL} />
          </lineSegments>
          <lineSegments geometry={barras.transversais} renderOrder={2}>
            <lineBasicMaterial color={COR_BARRA_TRANSVERSAL} />
          </lineSegments>
        </>
      )}
      {/* TELHADO por cima de tudo, na cor de telha cerâmica: é o que o olho
          procura primeiro numa casa vista de fora, e a cor o separa da laje
          (cinza) que às vezes fica logo abaixo dele. A malha já vem em
          coordenadas de mundo — sem `position`. */}
      {/* ESCADA E RAMPA em cinza de pedra — entre a alvenaria e o concreto, e
          distinto dos dois. A malha já vem em coordenadas de mundo. */}
      {escadas.map((g, i) => (
        <mesh key={`escada-${i}`} geometry={g} castShadow receiveShadow>
          <meshStandardMaterial color="#94a3b8" roughness={0.85} side={THREE.DoubleSide} />
          {mostrarArestas && <Edges color="#334155" threshold={20} />}
        </mesh>
      ))}
      {/* INSTALAÇÕES por último de todas: elas atravessam parede, laje e forro,
          e desenhadas antes seriam comidas pela alvenaria no teste de
          profundidade. A cor é a da disciplina — é o único jeito de distinguir
          quatro redes num emaranhado. */}
      {redes.map((r) => (
        <mesh
          key={`rede-${r.chave}`}
          geometry={r.geom}
          position={r.position}
          quaternion={r.quaternion}
          castShadow
          {...cliqueDe(r.id)}
        >
          <meshStandardMaterial
            color={selecionados?.has(r.id) ? COR_SELECIONADA : (coresPorUid?.get(r.uid) ?? r.cor)}
            roughness={0.5}
            metalness={0.1}
          />
        </mesh>
      ))}
      {terminais3d.map((t) => (
        <mesh
          key={`terminal-${t.id}`}
          position={t.position}
          rotation={[0, t.giroY, 0]}
          castShadow
          {...cliqueDe(t.id)}
        >
          <boxGeometry args={t.tamanho} />
          <meshStandardMaterial
            color={selecionados?.has(t.id) ? COR_SELECIONADA : (coresPorUid?.get(t.uid) ?? t.cor)}
            roughness={0.4}
          />
        </mesh>
      ))}
      {quadros3d.map((q) => (
        <mesh
          key={`quadro-${q.id}`}
          position={q.position}
          rotation={[0, q.giroY, 0]}
          castShadow
          {...cliqueDe(q.id)}
        >
          <boxGeometry args={q.tamanho} />
          <meshStandardMaterial
            color={
              selecionados?.has(q.id)
                ? COR_SELECIONADA
                : (coresPorUid?.get(q.uid) ?? COR_DA_DISCIPLINA.ELETRICA)
            }
            roughness={0.45}
            metalness={0.15}
          />
          {mostrarArestas && <Edges color="#1e293b" threshold={20} />}
        </mesh>
      ))}
      {telhados.map((g, i) => (
        <mesh key={`telhado-${i}`} geometry={g} castShadow receiveShadow>
          <meshStandardMaterial color="#b45f3c" roughness={0.9} side={THREE.DoubleSide} />
          {mostrarArestas && <Edges color="#7c2d12" threshold={20} />}
        </mesh>
      ))}
    </group>
  );
}

/**
 * Põe a câmera onde dá para ver o que existe.
 *
 * ─── POR QUE UM COMPONENTE, E NÃO A PROP `camera` DO CANVAS ─────────────────
 *
 * `<Canvas camera={{ position }}>` só vale na MONTAGEM. Depois disso, mudar o
 * objeto não move nada — e foi por isso que importar um IFC num estudo já aberto
 * deixava a câmera parada olhando para o vazio. O botão "Centralizar" não
 * salvava: ele chamava `controls.reset()`, que devolve exatamente o
 * enquadramento inicial, o errado.
 *
 * ─── QUANDO REENQUADRA SOZINHO ──────────────────────────────────────────────
 *
 * Só quando o conteúdo SAIU do quadro (ver `saiuDoQuadro`). Reenquadrar a cada
 * mudança brigaria com quem está navegando: desenhar uma parede puxaria a
 * câmera de volta a cada clique.
 */
function Enquadrar({
  centro,
  raio,
  spread,
  alturaTopo,
  token,
  controlsRef,
}: {
  centro: [number, number, number];
  raio: [number, number, number];
  spread: number;
  alturaTopo: number;
  token: number;
  controlsRef: React.MutableRefObject<{ target?: THREE.Vector3; update?: () => void } | null>;
}) {
  const camera = useThree((e) => e.camera);
  const tamanho = useThree((e) => e.size);
  const ultima = useRef<{ centro: [number, number, number]; spread: number } | null>(null);
  const ultimoToken = useRef(-1);

  useEffect(() => {
    const pedido = token !== ultimoToken.current;
    const fugiu = saiuDoQuadro(ultima.current, {
      centro,
      raio,
      spread,
      alturaTopo,
      temConteudo: true,
    });
    if (!pedido && !fugiu) return;

    ultimoToken.current = token;
    ultima.current = { centro: [centro[0], centro[1], centro[2]], spread };

    // A distância sai da LENTE e do formato da tela, não de um múltiplo da
    // maior dimensão: numa tela larga e baixa a altura é que aperta, e o
    // palpite fixo antigo deixava o desenho ocupando pouco mais da metade da
    // largura. `size` vem do R3F e já reflete o tamanho real do canvas.
    const c = camera as THREE.PerspectiveCamera;
    const aspecto = tamanho.height > 0 ? tamanho.width / tamanho.height : 1.6;
    const d = distanciaParaCaber(raio, c.fov ?? 50, aspecto);
    camera.position.set(
      centro[0] + DIRECAO_DA_CAMERA[0] * d,
      centro[1] + DIRECAO_DA_CAMERA[1] * d,
      centro[2] + DIRECAO_DA_CAMERA[2] * d,
    );
    c.near = Math.max(0.01, d / 1000);
    c.far = d * 8 + spread * 4;
    c.updateProjectionMatrix();
    controlsRef.current?.target?.set(centro[0], centro[1], centro[2]);
    controlsRef.current?.update?.();
  }, [centro, raio, spread, alturaTopo, token, camera, tamanho, controlsRef]);

  return null;
}

/**
 * ANDAR dentro do desenho — o modo walk.
 *
 * ─── POR QUE PRIMEIRA PESSOA, E NÃO SÓ "ZOOM MAIS PERTO" ────────────────────
 *
 * Orbitar responde "como é o prédio"; andar responde "como é ESTAR nele" — se o
 * corredor é estreito, se a viga passa na altura da cabeça, se a porta abre
 * contra a parede. São perguntas que o modelo já responde e a órbita não deixa
 * fazer, porque de fora nunca se está à altura do olho.
 *
 * ─── A CONTA NÃO MORA AQUI ──────────────────────────────────────────────────
 *
 * Só o gesto: teclas, quadro a quadro e a trava do ponteiro. A matemática do
 * passo está em `utils/blueprint3dWalk.ts`, porque este arquivo é `@ts-nocheck`
 * e já produziu três defeitos invisíveis nesta frente.
 *
 * ─── A ALTURA É FIXA, DE PROPÓSITO ──────────────────────────────────────────
 *
 * A câmera fica em `ALTURA_DO_OLHO_M` e o passo é sempre no plano. Olhar para
 * cima e andar não decola; olhar para o chão não enterra. É o que separa andar
 * de voar — e voar não responde nenhuma das perguntas acima.
 */
/** Ao entrar a pé, o olhar desce 15°: vê o chão perto sem perder o horizonte. */
const INCLINACAO_AO_ENTRAR_RAD = (15 * Math.PI) / 180;

function Percorrer({
  ativo,
  centro,
  alturaDoChao,
  onSair,
}: {
  ativo: boolean;
  centro: [number, number, number];
  /** Cota do chão em (x, z) de mundo; ausente = chão no zero. */
  alturaDoChao?: (x: number, z: number) => number | null;
  /**
   * O navegador destravou o ponteiro (Esc, troca de aba, clique fora).
   *
   * Sem isto o botão continuaria aceso dizendo "andando" com o mouse livre —
   * estado que mente, e o pior tipo: a pessoa vê "está no modo" e o modo não
   * responde. Quem manda aqui é o NAVEGADOR, não o nosso `useState`.
   */
  onSair: () => void;
}) {
  const camera = useThree((e) => e.camera);
  const teclas = useRef<TeclasDeAndar>({ ...SEM_TECLAS });
  const entrou = useRef(false);

  useEffect(() => {
    if (!ativo) {
      entrou.current = false;
      teclas.current = { ...SEM_TECLAS };
      return;
    }
    // Ao ENTRAR, põe a pessoa no meio do desenho, à altura do olho. Sem isto
    // ela começaria de onde a órbita estava — de fora e do alto, olhando o
    // próprio desenho de longe, que é o oposto do que o modo serve.
    if (!entrou.current) {
      entrou.current = true;
      camera.position.set(
        centro[0],
        alturaDoOlho(alturaDoChao?.(centro[0], centro[2]) ?? null),
        centro[2],
      );
      // E ajeita o olhar (fase 14): a órbita vinha olhando para BAIXO, para o
      // centro do desenho — a pé, isso é olhar para os próprios pés. Mantém a
      // direção no plano e inclina só um pouco para baixo, como quem anda num
      // terreno: com o olhar no horizonte e a lente de 45°, num lote de 7,5 m
      // a pessoa no meio não via chão nenhum (a borda fica 23° abaixo). O
      // mouse muda depois.
      const olhar = new THREE.Vector3();
      camera.getWorldDirection(olhar);
      olhar.y = 0;
      if (olhar.lengthSq() < 1e-6) olhar.set(0, 0, -1);
      olhar.normalize();
      olhar.y = -Math.tan(INCLINACAO_AO_ENTRAR_RAD);
      camera.lookAt(camera.position.clone().add(olhar));
    }

    const aoApertar = (e: KeyboardEvent) => {
      const d = direcaoDaTecla(e.code);
      if (!d) return;
      teclas.current[d] = true;
      // Evita a página rolar com as setas enquanto se anda.
      e.preventDefault();
    };
    const aoSoltar = (e: KeyboardEvent) => {
      const d = direcaoDaTecla(e.code);
      if (d) teclas.current[d] = false;
    };
    window.addEventListener('keydown', aoApertar);
    window.addEventListener('keyup', aoSoltar);
    return () => {
      window.removeEventListener('keydown', aoApertar);
      window.removeEventListener('keyup', aoSoltar);
    };
  }, [ativo, camera, centro]);

  useFrame((_, dt) => {
    if (!ativo) return;
    const olhar = new THREE.Vector3();
    camera.getWorldDirection(olhar);
    const { dx, dz } = passo(teclas.current, olhar.x, olhar.z, Math.min(dt, 0.1));
    if (dx === 0 && dz === 0) return;
    camera.position.x += dx;
    camera.position.z += dz;
    // A altura não vem do passo: vem do CHÃO sob a pessoa (1,6 m acima dele).
    // Sem relevo o chão é o zero, como sempre; com relevo, acompanha o morro.
    camera.position.y = alturaDoOlho(
      alturaDoChao?.(camera.position.x, camera.position.z) ?? null,
    );
  });

  return ativo ? <PointerLockControls onUnlock={onSair} /> : null;
}

export default function Blueprint3DViewer(props: Props) {
  const controlsRef = useRef<{ target?: THREE.Vector3; update?: () => void } | null>(null);
  const { model, mostrarTerreno, relevo, relevoChave, alturaDoChao, onToggleFullscreen, isFullscreen = false } = props;

  // A conta vive em `utils/blueprint3dEnquadramento.ts`: pura, verificada pelo
  // compilador e coberta por teste. Ela morava AQUI DENTRO, sob `@ts-nocheck`, e
  // foi assim que ficou incompleta — ignorando estrutura e escada — sem que nada
  // acusasse, até a importação de IFC trazer um estudo só com estrutura.
  const { centro, raio, spread, alturaTopo } = useMemo(
    () => enquadramentoDoModelo(model, !!mostrarTerreno, mostrarTerreno ? (relevo ?? null) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, mostrarTerreno, relevoChave],
  );

  // A grade do chão desce para baixo do ponto mais baixo do relevo: fixa em
  // −14 cm, ela cortaria um terreno que desce 2 m abaixo do piso.
  const cotaDaGrade =
    mostrarTerreno && relevo ? Math.min(COTA_GRADE_Y, relevo.minY - 0.14) : COTA_GRADE_Y;

  // A conta vive em `utils/blueprint3dEnquadramento.ts` — pura e coberta por
  // teste. Aqui dentro, sob `@ts-nocheck`, ela seria invisível ao compilador,
  // que é como o enquadramento chegou a ignorar duas famílias inteiras.
  const { passo: passoDaGrade, alcance: alcanceDaGrade } = gradeDaCena(spread);
  const sombra = sombraDaCena(spread);

  /** Sobe a cada clique em "Centralizar" — é o que reenquadra sob demanda. */
  const [tokenDeEnquadrar, setTokenDeEnquadrar] = useState(0);
  /** Modo de percorrer o desenho a pé. Ver `Percorrer`. */
  const [andando, setAndando] = useState(false);

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-50">
      <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <button
            onClick={() => setTokenDeEnquadrar((t) => t + 1)}
            className="rounded p-1.5 text-slate-600 transition-colors hover:bg-slate-100"
            title="Centralizar"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setAndando((v) => !v)}
            className={`ml-1 rounded border-l border-slate-100 p-1.5 pl-2 transition-colors hover:bg-slate-100 ${
              andando ? 'text-blue-700' : 'text-slate-600'
            }`}
            title={
              andando
                ? 'Sair de percorrer (Esc)'
                : 'Percorrer a pé — clique na cena e use WASD ou as setas'
            }
          >
            <Footprints className="h-4 w-4" />
          </button>
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="ml-1 rounded border-l border-slate-100 p-1.5 pl-2 text-slate-600 transition-colors hover:bg-slate-100"
              title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs text-slate-500 shadow-sm backdrop-blur">
        {/* A DICA TEM DE DIZER O QUE VALE AGORA. Em modo de percorrer, "arraste
            para orbitar" está simplesmente errado — a órbita saiu de cena —, e
            uma instrução falsa é pior que nenhuma: quem a segue conclui que
            quebrou. */}
        {andando
          ? 'WASD ou setas para andar · mouse para olhar · Esc para sair'
          : 'Arraste para orbitar · scroll para zoom · botão direito para mover'}
      </div>

      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{
          position: [centro[0] + spread * 1.1, alturaTopo + spread * 0.8, centro[2] + spread * 1.3],
          fov: 45,
          near: 0.1,
          far: spread * 20,
        }}
      >
        <color attach="background" args={['#f8fafc']} />
        <ambientLight intensity={0.75} />
        {/* A câmera de sombra acompanha a CENA (`sombraDaCena`): a padrão cobre
            ±5 m, e num lote de 60 m com relevo a sombra simplesmente não
            existia fora daquele quadrado — ou virava acne com o mapa esticado. */}
        {/* SOL (E5.1): com a direção do sol, a luz vem de lá — o desenho é Y
            para cima e o mundo é Z para "baixo da tela" (y → −z, como no
            rotateX(−π/2) das extrusões). Sol baixo, luz mais fraca e quente. */}
        <directionalLight
          position={
            props.sol
              ? [centro[0] + props.sol.x * spread * 2, Math.max(0.5, props.sol.z * spread * 2), centro[2] - props.sol.y * spread * 2]
              : [spread, alturaTopo + spread, spread * 0.6]
          }
          intensity={props.sol ? (props.sol.z <= 0 ? 0.15 : 0.6 + 0.7 * Math.min(1, props.sol.z * 1.5)) : 1.1}
          color={props.sol && props.sol.z < 0.35 ? '#ffe4b5' : '#ffffff'}
          castShadow
          shadow-mapSize-width={sombra.mapa}
          shadow-mapSize-height={sombra.mapa}
          shadow-camera-left={-sombra.meia}
          shadow-camera-right={sombra.meia}
          shadow-camera-top={sombra.meia}
          shadow-camera-bottom={-sombra.meia}
          shadow-camera-near={0.5}
          shadow-camera-far={sombra.far}
          shadow-bias={-0.0005}
        />
        <directionalLight position={[-spread, spread, -spread]} intensity={0.3} />
        <Grid
          args={[spread * 6, spread * 6]}
          cellSize={passoDaGrade}
          cellThickness={0.5}
          cellColor="#d1d5db"
          sectionSize={passoDaGrade * 5}
          sectionThickness={1}
          sectionColor="#9ca3af"
          fadeDistance={alcanceDaGrade}
          position={[centro[0], cotaDaGrade, centro[2]]}
          infiniteGrid
        />
        <Cena {...props} />
        {/* A ÓRBITA SAI DE CENA ao andar: os dois disputariam o mesmo mouse, e
            o resultado seria a câmera brigando consigo mesma a cada gesto. */}
        {!andando && (
          <OrbitControls ref={controlsRef} target={centro} enableDamping maxPolarAngle={Math.PI / 2.05} />
        )}
        <Percorrer ativo={andando} centro={centro} alturaDoChao={alturaDoChao} onSair={() => setAndando(false)} />
        <Enquadrar
          centro={centro}
          raio={raio}
          spread={spread}
          alturaTopo={alturaTopo}
          token={tokenDeEnquadrar}
          controlsRef={controlsRef}
        />
      </Canvas>
    </div>
  );
}
