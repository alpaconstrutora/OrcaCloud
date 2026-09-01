// @ts-nocheck — mesmo motivo do components/planta_ai/Building3DViewer.tsx: os
// elementos three intrínsecos (<mesh>, <group>, <ambientLight>…) só existem via a
// augmentation global de JSX do @react-three/fiber, que foi tirada do programa
// TS (types/react-three-stubs.d.ts) por quebrar o className em todo o codebase.
// Sem os tipos intrínsecos o tsc não valida este JSX — validação é em runtime,
// e o harness docs/spikes/blueprint-3d falha o exit em qualquer erro de console.
import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Edges } from '@react-three/drei';
import { RotateCcw, Maximize, Minimize } from 'lucide-react';
import type { BlueprintModel, Structural } from '../../utils/blueprintKernel';
import { contornoExternoDoNivel, FORMA_ESTRUTURAL } from '../../utils/blueprintKernel';
import { perfilDaParedeComVaos } from '../../utils/blueprintElevation';
import { medirTerreno } from '../../utils/blueprintTerreno';

interface Props {
  model: BlueprintModel;
  /** Níveis a mostrar. Omitido = todos. */
  levelIds?: string[];
  mostrarLaje?: boolean;
  mostrarArestas?: boolean;
  /** O polígono do lote (divisas `TERRENO`) como um plano de chão. */
  mostrarTerreno?: boolean;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
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
 * Geometria de UMA parede: o perfil frontal (retângulo + furos das aberturas)
 * extrudado pela espessura. Sem CSG — `THREE.Shape` com `THREE.Path` de furo já
 * abre porta e janela na malha.
 *
 * ─── O CANTO ────────────────────────────────────────────────────────────────
 *
 * O retângulo NÃO vai de 0 a `comprimento`: ele começa em `-avancoA` e termina
 * em `comprimento + avancoB`. Sem esse avanço cada parede é uma caixa que morre
 * no VÉRTICE DO EIXO, e num canto em L sobra um entalhe de meia espessura na
 * face externa — o buraco que o usuário fotografou em 30/08/2026. A planta baixa
 * e a exportação em PDF já esticavam a ponta; só o 3D e o IFC não.
 *
 * O avanço vem do perfil, que o tira de `extensaoDeCanto` — a régua do kernel.
 * NÃO recalcular aqui como meia espessura: isso acerta em 90° e erra em todo o
 * resto, e é a divergência que `cantosDaParede` já documenta ter nascido de uma
 * segunda cópia da mesma medida.
 *
 * A origem local continua em `wall.a`, e é por isso que `position` e os furos
 * (medidos a partir de `a`) não mudam com o avanço.
 */
function geometriaDaParede(model: BlueprintModel, wall: BlueprintModel['walls'][number]) {
  const perfil = perfilDaParedeComVaos(model, wall);
  const L = perfil.comprimentoMm * S;
  const A = perfil.alturaMm * S;
  if (L <= 0 || A <= 0) return [];

  const xIni = -perfil.avancoAMm * S;
  const xFim = L + perfil.avancoBMm * S;

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
  const t = perfil.espessuraMm * S;

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
    for (const f of [...perfil.furos, ...perfil.furosEstruturais.filter((x) => !atravessaTudo(x))]) {
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
function geometriaDaEstrutura(s: Structural, elevacaoDoNivelMm: number) {
  const alturaM = s.alturaMm * S;
  if (alturaM <= 0) return null;

  const baseY = (elevacaoDoNivelMm + s.baseMm) * S;
  const forma = FORMA_ESTRUTURAL[s.kind];

  if (forma === 'AREA') {
    if (s.pontos.length < 3) return null;
    const geom = new THREE.ExtrudeGeometry(shapeDoAnel(s.pontos), {
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

function Cena({ model, levelIds, mostrarLaje, mostrarArestas, mostrarTerreno }: Props) {
  const niveis = model.levels.filter((l) => !levelIds || levelIds.includes(l.id));
  const idsVisiveis = new Set(niveis.map((l) => l.id));

  const paredes = useMemo(
    () =>
      model.walls
        .filter((w) => idsVisiveis.has(w.levelId))
        // `flatMap`: uma parede pode virar VÁRIOS pedaços quando o concreto a
        // interrompe (ver `geometriaDaParede`).
        .flatMap((w) => geometriaDaParede(model, w)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, levelIds?.join(',')],
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

  const estruturas = useMemo(
    () =>
      (model.structures ?? [])
        .filter((s) => idsVisiveis.has(s.levelId))
        .map((s) => {
          const nivel = model.levels.find((l) => l.id === s.levelId);
          const g = geometriaDaEstrutura(s, nivel?.elevationMm ?? 0);
          return g ? { ...g, enterrada: s.baseMm < 0 } : null;
        })
        .filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, levelIds?.join(',')],
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
    </group>
  );
}

export default function Blueprint3DViewer(props: Props) {
  const controlsRef = useRef<{ reset: () => void } | null>(null);
  const { model, mostrarTerreno, onToggleFullscreen, isFullscreen = false } = props;

  // Enquadramento pela caixa dos vértices de parede — e do lote também, quando
  // o terreno está visível, senão um lote grande sairia pela metade da tela.
  const { centro, spread, alturaTopo } = useMemo(() => {
    const xs: number[] = [];
    const zs: number[] = [];
    let topo = 3;
    for (const w of model.walls) {
      xs.push(w.a.x * S, w.b.x * S);
      zs.push(w.a.y * S, w.b.y * S);
      const lvl = model.levels.find((l) => l.id === w.levelId);
      topo = Math.max(topo, ((lvl?.elevationMm ?? 0) + w.heightMm) * S);
    }
    if (mostrarTerreno) {
      const t = medirTerreno(model.boundaries);
      for (const p of t?.anel ?? []) {
        xs.push(p.x * S);
        zs.push(p.y * S);
      }
    }
    if (xs.length === 0) return { centro: [0, 0, 0], spread: 20, alturaTopo: 6 };
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    return {
      centro: [(minX + maxX) / 2, topo / 2, (minZ + maxZ) / 2],
      spread: Math.max(maxX - minX, maxZ - minZ, topo, 6),
      alturaTopo: topo,
    };
  }, [model, mostrarTerreno]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-50">
      <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <button
            onClick={() => controlsRef.current?.reset()}
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
      </Canvas>
    </div>
  );
}
