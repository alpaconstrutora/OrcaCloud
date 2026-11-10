// @ts-nocheck — mesmo motivo do components/blueprint/Blueprint3DViewer.tsx: os elementos three intrínsecos
// (<mesh>, <ambientLight>…) só existem via a augmentation global de JSX do @react-three/fiber, tirada do programa
// TS (types/react-three-stubs.d.ts) por quebrar o className no codebase inteiro. O que dá para tipar mora fora
// daqui, em `utils/espelhoDeVendas3dMalha.ts` (grupos, toque, paleta); este arquivo se confere no navegador, pelo
// harness `docs/spikes/espelho-vendas-3d` (com servidor NOVO), que acusa qualquer erro de console.
/**
 * A CENA do Espelho de Vendas 3D (09/11/2026): as torres em prismas, um por unidade, na cor do status.
 * Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 *
 * ⚠️ Este é o ÚNICO arquivo do espelho que importa three. Só entra por `React.lazy` (ver `Espelho3D.tsx`): o
 * three (~600 KB) não pode cair no pacote de entrada dos portais.
 *
 * Desenho: uma malha por status (`gruposDoEspelho`), não uma por unidade — o prédio de 500 unidades custa meia
 * dúzia de chamadas de desenho. O toque devolve o triângulo; `prismaDaFace` diz de qual unidade ele é. Quadro só
 * quando algo muda (`frameloop="demand"`): parado, o espelho não gasta bateria do tablet.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SaleUnitStatus } from '../../lib/salesAnalysis';
import { ehClique } from '../../utils/blueprint3dSelecao';
import type { CenaDoEspelho, PrismaDoEspelho } from '../../utils/espelhoDeVendas3d';
import {
  COR_DA_UNIDADE_APAGADA,
  COR_DO_PISO_SEM_UNIDADE,
  gruposDoEspelho,
  iniciosDasFaces,
  prismaDaFace,
  type ChaveDoGrupo,
  type PaletaDoEspelho,
} from '../../utils/espelhoDeVendas3dMalha';
import { reduzMovimento } from './webglDisponivel';

export interface Espelho3DCenaProps {
  cena: CenaDoEspelho;
  paleta: PaletaDoEspelho;
  /** Só este status fica colorido; os outros esmaecem. null = todos. */
  destaque: SaleUnitStatus | null;
  selecionada: string | null;
  onSelecionar: (unitId: string | null) => void;
}

/** mm do modelo → metros da cena. */
const M = 1 / 1000;

/** O prisma em metros, com o centro da cena na origem: planta (x, y) → chão (x, −z); a altura sobe em y. */
function geometriaDoPrisma(p: PrismaDoEspelho, cx: number, cy: number): THREE.BufferGeometry {
  const forma = new THREE.Shape(p.anel.map((q) => new THREE.Vector2((q.x - cx) * M, (q.y - cy) * M)));
  const g = new THREE.ExtrudeGeometry(forma, { depth: (p.topoMm - p.baseMm) * M, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, p.baseMm * M, 0);
  // Sem índice: o triângulo k são os vértices 3k..3k+2, e é assim que `prismaDaFace` conta.
  return g.index ? g.toNonIndexed() : g;
}

/** De onde a câmera olha: de frente, um pouco de lado e de cima. */
const DIRECAO_DA_CAMERA = new THREE.Vector3(0.55, 0.42, 0.72).normalize();

/**
 * Enquadra as torres inteiras na tela, qualquer que seja o formato dela: o campo de visão do three é o VERTICAL, e
 * numa tela em pé (celular) a largura é que aperta — sem isto as torres saíam cortadas dos lados. Roda ao montar e
 * quando a tela muda de formato; girar e aproximar depois disso é de quem usa.
 */
const Enquadrar: React.FC<{ alvo: [number, number, number]; raioDaCena: number }> = ({ alvo, raioDaCena }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controles = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const aspecto = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const invalidar = useThree((s) => s.invalidate);
  const [ax, ay, az] = alvo;
  useEffect(() => {
    const vertical = (camera.fov * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspecto);
    const distancia = (raioDaCena / Math.sin(Math.min(vertical, horizontal) / 2)) * 1.05;
    camera.position.set(ax + DIRECAO_DA_CAMERA.x * distancia, ay + DIRECAO_DA_CAMERA.y * distancia, az + DIRECAO_DA_CAMERA.z * distancia);
    camera.lookAt(ax, ay, az);
    camera.updateProjectionMatrix();
    if (controles) {
      controles.target.set(ax, ay, az);
      controles.update();
    }
    invalidar();
  }, [camera, controles, aspecto, raioDaCena, ax, ay, az, invalidar]);
  return null;
};

interface MalhaDoGrupo {
  chave: ChaveDoGrupo;
  prismas: PrismaDoEspelho[];
  geometria: THREE.BufferGeometry;
  inicios: number[];
}

const Espelho3DCena: React.FC<Espelho3DCenaProps> = ({ cena, paleta, destaque, selecionada, onSelecionar }) => {
  const cx = (cena.caixa.minX + cena.caixa.maxX) / 2;
  const cy = (cena.caixa.minY + cena.caixa.maxY) / 2;
  const largura = (cena.caixa.maxX - cena.caixa.minX) * M;
  const profundidade = (cena.caixa.maxY - cena.caixa.minY) * M;
  const altura = Math.max(cena.caixa.topoMm, 0) * M;
  const raio = Math.max(largura, profundidade, altura, 10);
  /** A esfera que envolve as torres acima do chão — é ela que a câmera enquadra. */
  const raioDaCena = Math.max(Math.hypot(largura, profundidade, altura) / 2, 5);
  const alvo = useMemo<[number, number, number]>(() => [0, altura / 2, 0], [altura]);

  const { malhas, arestas } = useMemo(() => {
    const ms: MalhaDoGrupo[] = [];
    const linhas: THREE.BufferGeometry[] = [];
    for (const g of gruposDoEspelho(cena.prismas)) {
      const partes = g.prismas.map((p) => geometriaDoPrisma(p, cx, cy));
      for (const parte of partes) linhas.push(new THREE.EdgesGeometry(parte));
      const geometria = mergeGeometries(partes, false);
      if (!geometria) continue;
      ms.push({ chave: g.chave, prismas: g.prismas, geometria, inicios: iniciosDasFaces(partes.map((x) => x.attributes.position.count / 3)) });
      for (const parte of partes) parte.dispose();
    }
    const juntas = linhas.length > 0 ? mergeGeometries(linhas, false) : null;
    for (const l of linhas) l.dispose();
    return { malhas: ms, arestas: juntas };
  }, [cena.prismas, cx, cy]);
  useEffect(
    () => () => {
      for (const m of malhas) m.geometria.dispose();
      arestas?.dispose();
    },
    [malhas, arestas],
  );

  const daSelecionada = useMemo(() => {
    const p = selecionada ? cena.prismas.find((x) => x.unitId === selecionada && !x.abaixoDoSolo) : null;
    if (!p) return null;
    const geometria = geometriaDoPrisma(p, cx, cy);
    return { p, geometria, contorno: new THREE.EdgesGeometry(geometria) };
  }, [selecionada, cena.prismas, cx, cy]);
  useEffect(
    () => () => {
      daSelecionada?.geometria.dispose();
      daSelecionada?.contorno.dispose();
    },
    [daSelecionada],
  );

  const inicioDoToque = useRef<{ x: number; y: number } | null>(null);
  const corDe = (chave: ChaveDoGrupo) => (chave === 'piso' ? COR_DO_PISO_SEM_UNIDADE : destaque && chave !== destaque ? COR_DA_UNIDADE_APAGADA : paleta[chave].cor);
  const apagado = (chave: ChaveDoGrupo) => chave !== 'piso' && destaque != null && chave !== destaque;

  return (
    // `flat`: sem o mapa de tons do three, que escurecia as cores — a cor do prédio tem de ser a da legenda.
    <Canvas
      flat
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ position: [raio, raio, raio * 2], fov: 40, near: 0.1, far: raio * 40 }}
      onPointerMissed={() => onSelecionar(null)}
      gl={{ antialias: true, alpha: true }}
    >
      <Enquadrar alvo={alvo} raioDaCena={raioDaCena} />
      <ambientLight intensity={2.1} />
      <directionalLight position={[raio, raio * 2, raio * 0.8]} intensity={1.5} />
      <directionalLight position={[-raio, raio, -raio]} intensity={0.5} />

      {/* O chão: só dá a referência de onde a torre pousa. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[raio * 1.6, 64]} />
        <meshBasicMaterial color="#e8edf3" />
      </mesh>

      {malhas.map((m) => (
        <mesh
          key={m.chave}
          geometry={m.geometria}
          onPointerDown={(e) => {
            inicioDoToque.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            // Girar a câmera também solta o dedo em cima de uma unidade: só o toque parado seleciona.
            if (!ehClique(inicioDoToque.current, { x: e.clientX, y: e.clientY })) return;
            e.stopPropagation();
            const p = m.prismas[prismaDaFace(m.inicios, e.faceIndex)];
            onSelecionar(p?.unitId ?? null);
          }}
        >
          {/* O apagado fica translúcido e não esconde: a unidade em destaque do outro lado da torre aparece através dele. */}
          <meshStandardMaterial color={corDe(m.chave)} roughness={0.85} metalness={0} transparent={apagado(m.chave)} opacity={apagado(m.chave) ? 0.28 : 1} depthWrite={!apagado(m.chave)} />
        </mesh>
      ))}

      {arestas && (
        <lineSegments geometry={arestas}>
          <lineBasicMaterial color="#ffffff" transparent opacity={0.85} />
        </lineSegments>
      )}

      {daSelecionada && (
        <group>
          {/* A escolhida: a cor dela inteira (mesmo com o status apagado pelo destaque) e o contorno escuro por cima de tudo. */}
          {/* `transparent` + `renderOrder`: desenha DEPOIS do grupo apagado, que é translúcido e passaria por cima. */}
          <mesh geometry={daSelecionada.geometria} renderOrder={5}>
            <meshStandardMaterial
              color={daSelecionada.p.status ? paleta[daSelecionada.p.status].cor : COR_DO_PISO_SEM_UNIDADE}
              roughness={0.85}
              transparent
              polygonOffset
              polygonOffsetFactor={-4}
              polygonOffsetUnits={-4}
            />
          </mesh>
          <lineSegments geometry={daSelecionada.contorno} renderOrder={10}>
            <lineBasicMaterial color="#0f172a" depthTest={false} transparent />
          </lineSegments>
        </group>
      )}

      {cena.torres.map((t) => (
        <Html
          key={t.torreId}
          position={[((t.caixa.minX + t.caixa.maxX) / 2 - cx) * M, t.topoMm * M + raio * 0.04, -((t.caixa.minY + t.caixa.maxY) / 2 - cy) * M]}
          center
          zIndexRange={[10, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <span aria-hidden="true" className="whitespace-nowrap rounded-[6px] bg-white/90 px-2 py-0.5 text-xs font-medium text-gray-900 shadow-sm border border-gray-200">
            {t.nome}
          </span>
        </Html>
      ))}

      <OrbitControls
        makeDefault
        target={alvo}
        enableDamping={!reduzMovimento()}
        maxPolarAngle={Math.PI / 2 - 0.04}
        minDistance={raio * 0.35}
        maxDistance={raio * 5}
      />
    </Canvas>
  );
};

export default Espelho3DCena;
