// @ts-nocheck — Este é o único arquivo que usa os elementos three intrínsecos
// (<mesh>, <boxGeometry>, <ambientLight>…). Esses só existem via a augmentation
// global de JSX do @react-three/fiber, que removemos do programa TS (ver
// types/react-three-stubs.d.ts) por quebrar o className de React.ElementType em
// todo o codebase. Sem os tipos intrínsecos, o tsc não valida este JSX — por
// isso @ts-nocheck. O componente é validado em runtime.
import React, { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Edges } from '@react-three/drei';
import { RotateCcw, Maximize, Minimize } from 'lucide-react';
import { computeFloorLayout } from './plantaGeometry';

interface Props {
  buildingWidth?: number;
  buildingDepth?: number;
  unitsPerFloor?: number;
  terrainWidth?: number;
  terrainDepth?: number;
  leftSetback?: number;
  frontSetback?: number;
  minRightSetback?: number;
  minRearSetback?: number;
  floorsCount?: number;
  floorHeight?: number;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
}

/**
 * Cena volumétrica: reaproveita a MESMA geometria paramétrica do 2D
 * (computeFloorLayout) e extruda a pegada por `floorsCount` pavimentos.
 *
 * Eixos three.js (Y para cima): 2D x -> X, 2D y (profundidade) -> Z, andares -> Y.
 * O mundo é transladado para o centro do terreno para orbitar em volta do prédio.
 */
function BuildingScene({
  buildingWidth = 20,
  buildingDepth = 30,
  unitsPerFloor = 4,
  terrainWidth = 20,
  terrainDepth = 30,
  leftSetback = 0,
  frontSetback = 0,
  minRightSetback = 0,
  minRearSetback = 0,
  floorsCount = 1,
  floorHeight = 3,
}: Props) {
  const w = buildingWidth;
  const d = buildingDepth;
  const tW = terrainWidth;
  const tD = terrainDepth;
  const floors = Math.max(1, Math.round(floorsCount));
  const buildingHeight = floors * floorHeight;

  const layout = computeFloorLayout(w, d, unitsPerFloor);

  // Centraliza o terreno na origem
  const cx = tW / 2;
  const cz = tD / 2;

  // Envelope construtivo (recuos) — equivale ao retângulo vermelho tracejado do 2D
  const envW = Math.max(0, tW - leftSetback - minRightSetback);
  const envD = Math.max(0, tD - frontSetback - minRearSetback);

  const slabThickness = Math.min(0.35, floorHeight * 0.12);
  const unitBoxHeight = floorHeight - slabThickness;

  return (
    <group position={[-cx, 0, -cz]}>
      {/* Terreno */}
      <mesh position={[cx, -0.1, cz]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[tW, tD]} />
        <meshStandardMaterial color="#e5e7eb" roughness={1} />
      </mesh>

      {/* Contorno do terreno */}
      <mesh position={[cx, 0.02, cz]}>
        <boxGeometry args={[tW, 0.02, tD]} />
        <meshBasicMaterial transparent opacity={0} />
        <Edges color="#9ca3af" />
      </mesh>

      {/* Envelope máximo edificável (recuos) — só wireframe, sem fill translúcido
          (fill transparente causava artefatos de ordenação contra o prédio) */}
      {envW > 0 && envD > 0 && (
        <mesh position={[leftSetback + envW / 2, buildingHeight / 2, frontSetback + envD / 2]}>
          <boxGeometry args={[envW, buildingHeight, envD]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          <Edges color="#ef4444" />
        </mesh>
      )}

      {/* Prédio: pavimentos empilhados */}
      <group position={[leftSetback, 0, frontSetback]}>
        {Array.from({ length: floors }).map((_, f) => {
          const yBase = f * floorHeight;
          return (
            <group key={f} position={[0, yBase, 0]}>
              {/* Laje do pavimento */}
              <mesh position={[w / 2, slabThickness / 2, d / 2]} receiveShadow castShadow>
                <boxGeometry args={[w, slabThickness, d]} />
                <meshStandardMaterial color="#d1d5db" roughness={0.9} />
              </mesh>

              {/* Unidades */}
              {layout.units.map((u) => (
                <mesh
                  key={u.index}
                  position={[
                    u.x + u.width / 2,
                    slabThickness + unitBoxHeight / 2,
                    u.y + u.height / 2,
                  ]}
                  castShadow
                >
                  <boxGeometry args={[u.width * 0.96, unitBoxHeight, u.height * 0.96]} />
                  <meshStandardMaterial color={u.color} roughness={0.7} />
                  <Edges color="#6b7280" threshold={15} />
                </mesh>
              ))}
            </group>
          );
        })}

        {/* Núcleo / hall — coluna central; sobe um pouco acima do telhado
            (caixa de circulação/elevador) para ficar visível sobre as unidades opacas */}
        {(() => {
          const coreOverrun = floorHeight * 0.6;
          const coreTotalHeight = buildingHeight + coreOverrun;
          return (
            <mesh
              position={[layout.core.x + layout.core.width / 2, coreTotalHeight / 2, layout.core.y + layout.core.height / 2]}
              castShadow
            >
              <boxGeometry args={[layout.core.width, coreTotalHeight, layout.core.height]} />
              <meshStandardMaterial color="#9ca3af" roughness={0.8} />
              <Edges color="#6b7280" />
            </mesh>
          );
        })()}
      </group>
    </group>
  );
}

export default function Building3DViewer(props: Props) {
  const controlsRef = useRef<{ reset: () => void } | null>(null);

  const {
    terrainWidth = 20,
    terrainDepth = 30,
    floorsCount = 1,
    floorHeight = 3,
    onToggleFullscreen,
    isFullscreen = false,
  } = props;

  const buildingHeight = Math.max(1, Math.round(floorsCount)) * floorHeight;
  const spread = Math.max(terrainWidth, terrainDepth, buildingHeight);

  return (
    <div className="w-full h-full relative overflow-hidden bg-gray-50 rounded-xl">
      {/* Controles overlay (mesmo estilo do viewer 2D) */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
        <div className="flex bg-white shadow-sm border border-gray-200 rounded-lg p-1">
          <button
            onClick={() => controlsRef.current?.reset()}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-600 transition-colors"
            title="Centralizar Visualização"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="p-1.5 hover:bg-gray-100 rounded text-gray-600 transition-colors border-l border-gray-100 ml-1 pl-2"
              title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Legenda */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-3 py-1.5 bg-white/80 backdrop-blur border border-gray-200 rounded-full text-xs text-gray-500 shadow-sm z-10 pointer-events-none">
        <span>Arraste para orbitar · Scroll para zoom · Botão direito para mover</span>
      </div>

      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [spread * 1.1, buildingHeight + spread * 0.8, spread * 1.3], fov: 45, near: 0.1, far: spread * 20 }}
      >
        <color attach="background" args={['#f9fafb']} />
        <ambientLight intensity={0.7} />
        <directionalLight
          position={[spread, buildingHeight + spread, spread * 0.6]}
          intensity={1.1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.0005}
          shadow-normalBias={0.05}
        />
        <directionalLight position={[-spread, spread, -spread]} intensity={0.3} />

        <Grid
          args={[spread * 4, spread * 4]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#d1d5db"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#9ca3af"
          fadeDistance={spread * 6}
          fadeStrength={1}
          position={[0, -0.09, 0]}
          infiniteGrid
        />

        <BuildingScene {...props} />

        <OrbitControls
          ref={controlsRef}
          target={[0, buildingHeight / 2, 0]}
          enableDamping
          maxPolarAngle={Math.PI / 2.05}
        />
      </Canvas>
    </div>
  );
}
