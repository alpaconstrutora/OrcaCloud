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
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Edges } from '@react-three/drei';
import { RotateCcw, Maximize, Minimize } from 'lucide-react';
import type { Agua, BlueprintModel, Escada, FatiaDaEscada, Structural } from '../../utils/blueprintKernel';
import {
  contornoDaAguaEm3d,
  contornoExternoDoNivel,
  DEFAULT_TOLERANCE_MM,
  FORMA_ESTRUTURAL,
  fatiasDaEscada,
  furosDaEscada,
  medirAgua,
  pointInPolygon,
  normalDaAgua,
  poligonoDaJuncao,
} from '../../utils/blueprintKernel';
import { perfilDaParedeComVaos } from '../../utils/blueprintElevation';
import { medirTerreno } from '../../utils/blueprintTerreno';
import {
  DIRECAO_DA_CAMERA,
  distanciaParaCaber,
  enquadramentoDoModelo,
  saiuDoQuadro,
} from '../../utils/blueprint3dEnquadramento';

interface Props {
  model: BlueprintModel;
  /** Níveis a mostrar. Omitido = todos. */
  levelIds?: string[];
  mostrarLaje?: boolean;
  mostrarArestas?: boolean;
  /** O polígono do lote (divisas `TERRENO`) como um plano de chão. */
  mostrarTerreno?: boolean;
  /**
   * Ids de peça escondidos pela lista de Componentes (pedido de 01/09/2026).
   *
   * Filtra o DESENHO e nada mais: não é comando de kernel, não entra no
   * histórico, não muda quantitativo. Aceita id de parede, de abertura e de peça
   * estrutural — a lista não separa as três famílias e o viewer não deveria
   * obrigá-la a separar.
   */
  ocultos?: Set<string>;
}

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
function geometriaDaParede(
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

  const removidos = perfil.furosEstruturais
    .filter(atravessaTudo)
    .map((f) => ({ x0: Math.max(xIni, f.x0 * S), x1: Math.min(xFim, f.x1 * S) }))
    .filter((r) => r.x1 > r.x0)
    .sort((a, b) => a.x0 - b.x0);

  const trechos: { x0: number; x1: number }[] = [];
  let cursor = xIni;
  for (const r of removidos) {
    if (r.x0 > cursor) trechos.push({ x0: cursor, x1: r.x0 });
    cursor = Math.max(cursor, r.x1);
  }
  if (cursor < xFim) trechos.push({ x0: cursor, x1: xFim });

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

  for (const tr of trechos) {
    if (tr.x1 - tr.x0 <= EPS) continue;

    const shape = new THREE.Shape();
    shape.moveTo(tr.x0, 0);
    shape.lineTo(tr.x1, 0);
    shape.lineTo(tr.x1, A);
    shape.lineTo(tr.x0, A);
    shape.lineTo(tr.x0, 0);

    // A abertura vai para o trecho que a contém — e continua sendo FURO, porque
    // porta e janela são interiores por natureza: elas não encostam na borda.
    // A peça de concreto que NÃO atravessa toda a altura entra aqui pelo mesmo
    // caminho: ela deixa alvenaria acima, então é furo, não corte.
    for (const f of [
      ...furosVisiveis,
      ...perfil.furosEstruturais.filter((x) => !atravessaTudo(x)),
    ]) {
      const x0 = Math.max(tr.x0 + EPS, f.x0 * S);
      const x1 = Math.min(tr.x1 - EPS, f.x1 * S);
      const y0 = Math.max(EPS, f.y0 * S);
      const y1 = Math.min(A - EPS, f.y1 * S);
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
      if (!semMitra) {
        if (Math.abs(tr.x0 - xIni) < TOL_PONTA) biselarPonta(geom, xIni, (z) => -avancoA(z));
        if (Math.abs(tr.x1 - xFim) < TOL_PONTA) biselarPonta(geom, xFim, (z) => L + avancoB(z));
      }
      pecas.push({ geom, quaternion, position, funcao: faixa.funcao });
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
    const geom = new THREE.BoxGeometry(comp, alturaM, s.larguraMm * S);
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

function Cena({ model, levelIds, mostrarLaje, mostrarArestas, mostrarTerreno, ocultos }: Props) {
  const niveis = model.levels.filter((l) => !levelIds || levelIds.includes(l.id));
  const idsVisiveis = new Set(niveis.map((l) => l.id));

  // `Set` tem identidade nova a cada alternância, então a dep é o CONTEÚDO — o
  // mesmo idioma do `levelIds?.join(',')` que os memos daqui já usam.
  const chaveOcultos = ocultos ? [...ocultos].sort().join(',') : '';
  const escondida = (id: string) => !!ocultos?.has(id);

  const paredes = useMemo(
    () =>
      model.walls
        .filter((w) => idsVisiveis.has(w.levelId) && !escondida(w.id))
        // `flatMap`: uma parede pode virar VÁRIOS pedaços quando o concreto a
        // interrompe (ver `geometriaDaParede`).
        .flatMap((w) => geometriaDaParede(model, w, ocultos)),
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
    return porLaje;
  }, [model]);

  const estruturas = useMemo(
    () =>
      (model.structures ?? [])
        .filter((s) => idsVisiveis.has(s.levelId) && !escondida(s.id))
        .map((s) => {
          const nivel = model.levels.find((l) => l.id === s.levelId);
          const g = geometriaDaEstrutura(s, nivel?.elevationMm ?? 0, furosPorLaje.get(s.id) ?? []);
          return g ? { ...g, enterrada: s.baseMm < 0 } : null;
        })
        .filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, levelIds?.join(','), chaveOcultos],
  );

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

  const terreno = useMemo(() => {
    if (!mostrarTerreno) return null;
    const t = medirTerreno(model.boundaries);
    if (!t || t.anel.length < 3) return null;
    return geometriaDoTerreno(t.anel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, mostrarTerreno]);

  return (
    <group>
      {terreno && (
        // ACIMA da grade, e com folga de verdade (ver COTA_GRADE_Y).
        //
        // A primeira versão punha o lote 1 cm ABAIXO da grade, e ele
        // simplesmente não aparecia num estudo real: as coordenadas ficam a
        // dezenas de metros da origem, a câmera recua junto, e a essa distância
        // 1 cm não distingue nada no depth buffer — a grade ganhava. Num lote
        // sintético perto da origem o mesmo código desenhava certo, que é o
        // que fazia o defeito passar despercebido.
        <mesh geometry={terreno} position={[0, COTA_TERRENO_Y, 0]} receiveShadow>
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
        <mesh key={i} geometry={p.geom} position={p.position} quaternion={p.quaternion} castShadow receiveShadow>
          {/* Sem composição, o cinza de sempre. Com ela, a cor da função —
              a mesma paleta do canvas 2D. */}
          <meshStandardMaterial
            color={(p.funcao && COR_CAMADA_3D[p.funcao]) || '#e2e8f0'}
            roughness={0.85}
            side={THREE.DoubleSide}
          />
          {mostrarArestas && <Edges color="#475569" threshold={20} />}
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
        >
          <meshStandardMaterial
            color={s.enterrada ? '#a8a29e' : '#94a3b8'}
            roughness={0.9}
            side={THREE.DoubleSide}
          />
          {mostrarArestas && <Edges color="#334155" threshold={20} />}
        </mesh>
      ))}
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

export default function Blueprint3DViewer(props: Props) {
  const controlsRef = useRef<{ target?: THREE.Vector3; update?: () => void } | null>(null);
  const { model, mostrarTerreno, onToggleFullscreen, isFullscreen = false } = props;

  // A conta vive em `utils/blueprint3dEnquadramento.ts`: pura, verificada pelo
  // compilador e coberta por teste. Ela morava AQUI DENTRO, sob `@ts-nocheck`, e
  // foi assim que ficou incompleta — ignorando estrutura e escada — sem que nada
  // acusasse, até a importação de IFC trazer um estudo só com estrutura.
  const { centro, raio, spread, alturaTopo } = useMemo(
    () => enquadramentoDoModelo(model, !!mostrarTerreno),
    [model, mostrarTerreno],
  );

  /** Sobe a cada clique em "Centralizar" — é o que reenquadra sob demanda. */
  const [tokenDeEnquadrar, setTokenDeEnquadrar] = useState(0);

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
        Arraste para orbitar · scroll para zoom · botão direito para mover
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
        <directionalLight position={[spread, alturaTopo + spread, spread * 0.6]} intensity={1.1} castShadow />
        <directionalLight position={[-spread, spread, -spread]} intensity={0.3} />
        <Grid
          args={[spread * 6, spread * 6]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#d1d5db"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#9ca3af"
          fadeDistance={spread * 8}
          position={[centro[0], COTA_GRADE_Y, centro[2]]}
          infiniteGrid
        />
        <Cena {...props} />
        <OrbitControls ref={controlsRef} target={centro} enableDamping maxPolarAngle={Math.PI / 2.05} />
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
