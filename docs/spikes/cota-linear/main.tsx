/**
 * Harness do GESTO da cota linear (F5 do plano `2026-10-11-planta-recursos-video-synaps.md`).
 *
 * `BlueprintCanvas` REAL, ferramenta `anotacao` no tipo `COTA_LINEAR`, com a TRAVA
 * ORTOGONAL ligada (o padrão do editor). Existe porque a prova no app real pegou o
 * gesto gravando 5 pontos em vez de 4: travando pelo ponto ANTERIOR, o clique de
 * colocação caía sobre a reta dos medidos e o 2º clique do duplo virava ponto extra.
 * Cada cota gravada vai para `window.__cotas` (os pontos, em mm do modelo).
 *
 * Sem Supabase. Abrir em: /docs/spikes/cota-linear/index.html
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, type Command, type Point } from '../../../utils/blueprintKernel';

declare global {
  interface Window {
    __cotas: Point[][];
  }
}

const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
const levelId = base.levels[0].id;
const w = (ax: number, ay: number, bx: number, by: number): Command => ({
  type: 'AddWall', levelId, a: { x: ax, y: ay }, b: { x: bx, y: by }, thicknessMm: 150, heightMm: 2800,
});
// Sala 8000 × 4000: há o que enquadrar, e a cota é desenhada sobre a parede de baixo.
const model = applyBatch(base, [w(0, 0, 8000, 0), w(8000, 0, 8000, 4000), w(8000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model;
window.__cotas = [];

createRoot(document.getElementById('raiz')!).render(
  <div id="tela">
    <div>
      <BlueprintCanvas
        model={model}
        tool="anotacao"
        tipoDeAnotacao="COTA_LINEAR"
        ortogonal
        levelId={levelId}
        selectedIds={[]}
        onSelecionar={() => {}}
        onAddWall={() => null}
        onAddOpening={() => {}}
        onDelete={() => {}}
        larguraAberturaMm={900}
        espessuraMm={150}
        passoGradeMm={100}
        onAddAnotacao={(_tipo, pontos) => {
          window.__cotas.push(pontos);
        }}
      />
    </div>
  </div>,
);
