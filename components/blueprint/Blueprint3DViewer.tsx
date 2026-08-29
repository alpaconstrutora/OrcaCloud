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
import type { BlueprintModel } from '../../utils/blueprintKernel';
import { contornoExternoDoNivel } from '../../utils/blueprintKernel';
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
 */
function geometriaDaParede(model: BlueprintModel, wall: BlueprintModel['walls'][number]) {
  const perfil = perfilDaParedeComVaos(model, wall);
  const L = perfil.comprimentoMm * S;
  const A = perfil.alturaMm * S;
  if (L <= 0 || A <= 0) return null;

  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(L, 0);
  shape.lineTo(L, A);
  shape.lineTo(0, A);
  shape.lineTo(0, 0);

  for (const f of perfil.furos) {
    const x0 = Math.max(EPS, f.x0 * S);
    const x1 = Math.min(L - EPS, f.x1 * S);
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

  const t = perfil.espessuraMm * S;
  const geom = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  // Centra a espessura no eixo: local Z passa a ir de -t/2 a +t/2.
  geom.translate(0, 0, -t / 2);

  // Orientação: local X → direção do eixo (no plano XZ do mundo three, com
  // model.y → three.z); local Y → altura (three +Y); local Z → normal horizontal.
  const dir = new THREE.Vector3(wall.b.x - wall.a.x, 0, wall.b.y - wall.a.y).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const nrm = new THREE.Vector3().crossVectors(dir, up).normalize();
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(dir, up, nrm),
  );
  const position = new THREE.Vector3(wall.a.x * S, perfil.elevacaoBaseMm * S, wall.a.y * S);

  return { geom, quaternion, position };
}

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

function Cena({ model, levelIds, mostrarLaje, mostrarArestas, mostrarTerreno }: Props) {
  const niveis = model.levels.filter((l) => !levelIds || levelIds.includes(l.id));
  const idsVisiveis = new Set(niveis.map((l) => l.id));

  const paredes = useMemo(
    () =>
      model.walls
        .filter((w) => idsVisiveis.has(w.levelId))
        .map((w) => geometriaDaParede(model, w))
        .filter(Boolean),
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
          <meshStandardMaterial color="#e2e8f0" roughness={0.85} side={THREE.DoubleSide} />
          {mostrarArestas && <Edges color="#475569" threshold={20} />}
        </mesh>
      ))}
      {lajes.map((l, i) => (
        <mesh key={`laje-${i}`} geometry={l.geom} position={[0, l.y, 0]} receiveShadow>
          <meshStandardMaterial color="#cbd5e1" roughness={0.95} side={THREE.DoubleSide} />
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
