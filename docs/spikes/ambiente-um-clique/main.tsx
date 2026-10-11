/**
 * Harness da ferramenta "Ambiente" (F2 do plano `2026-10-11-planta-recursos-video-synaps.md`).
 *
 * `BlueprintCanvas` REAL com `tool="ambiente"` sobre dois cômodos lado a lado. O
 * que nenhum teste de unidade alcança: que o realce aparece SOB O CURSOR no
 * canvas de verdade, e que o clique reporta o MESMO ambiente que estava aceso —
 * os dois passam por `paraMundo`, e um erro de espelhamento (o Y do canvas é
 * invertido, ver memória do canvas espelhado) acenderia um e nomearia outro.
 *
 * Sem Supabase: o modelo é fabricado aqui. Cada clique vai para `window.__cliques`.
 *
 * Abrir em: /docs/spikes/ambiente-um-clique/index.html no servidor de dev.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel, type Command } from '../../../utils/blueprintKernel';

declare global {
  interface Window {
    __cliques: string[];
    __ambientes: { id: string; xMin: number; xMax: number }[];
  }
}

const T = 150;
const H = 2800;

function construir(): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: H }).model;
  const levelId = base.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId, a: { x: ax, y: ay }, b: { x: bx, y: by }, thicknessMm: T, heightMm: H,
  });
  // 8000 × 4000 mm partido no meio: esquerdo 0–3000, direito 3000–8000 (larguras
  // diferentes de propósito — se o X saísse espelhado, o ponto em 2000 cairia no direito).
  return applyBatch(base, [
    w(0, 0, 8000, 0), w(8000, 0, 8000, 4000), w(8000, 4000, 0, 4000), w(0, 4000, 0, 0),
    w(3000, 0, 3000, 4000),
  ]).model;
}

const model = construir();
window.__cliques = [];
window.__ambientes = model.spaces.map((s) => ({
  id: s.id,
  xMin: Math.min(...s.ring.map((p) => p.x)),
  xMax: Math.max(...s.ring.map((p) => p.x)),
}));

function App() {
  return (
    <div id="tela">
      <div>
        <BlueprintCanvas
          model={model}
          tool="ambiente"
          levelId={model.levels[0].id}
          selectedIds={[]}
          onSelecionar={() => {}}
          onAddWall={() => null}
          onAddOpening={() => {}}
          onDelete={() => {}}
          larguraAberturaMm={900}
          espessuraMm={T}
          passoGradeMm={100}
          onClicarAmbiente={(id) => {
            window.__cliques.push(id);
          }}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
