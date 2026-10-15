/**
 * Harness da "Casa automática" (plano `docs/planos/2026-10-14-casa-automatica.md`).
 *
 * F0: só o lote de prova — 12 × 30 m, quatro divisas TERRENO com papel (FRENTE ao sul) —
 * no `BlueprintCanvas` REAL, sem Supabase. A partir da F3 o `planejarCasa` roda aqui
 * sobre este lote, o resultado é desenhado e o plano vai para `window.__plano`, que o
 * `medir.mjs` confere (exit ≠ 0 reprova).
 *
 * Abrir em: /docs/spikes/casa-automatica/index.html no servidor de dev.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../../utils/blueprintKernel';

declare global {
  interface Window {
    __estado: { divisas: number; frente: number; plano: unknown | null };
  }
}

const FRENTE_MM = 12000;
const FUNDO_MM = 30000;

function loteDeProva(): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = base.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({
    type: 'AddBoundary', levelId, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel,
  });
  return applyBatch(base, [
    d(0, 0, FRENTE_MM, 0, 'FRENTE'),
    d(FRENTE_MM, 0, FRENTE_MM, FUNDO_MM, 'LATERAL_DIREITA'),
    d(FRENTE_MM, FUNDO_MM, 0, FUNDO_MM, 'FUNDOS'),
    d(0, FUNDO_MM, 0, 0, 'LATERAL_ESQUERDA'),
  ]).model;
}

const model = loteDeProva();
window.__estado = {
  divisas: model.boundaries.filter((b) => b.kind === 'TERRENO').length,
  frente: model.boundaries.filter((b) => b.papel === 'FRENTE').length,
  plano: null,
};
document.getElementById('dump')!.textContent = 'sem plano (F0: só o lote de prova)';

function App() {
  return (
    <div id="tela">
      <div>
        <BlueprintCanvas
          model={model}
          tool="selecionar"
          levelId={model.levels[0].id}
          selectedIds={[]}
          onSelecionar={() => {}}
          onAddWall={() => null}
          onAddOpening={() => {}}
          onDelete={() => {}}
          larguraAberturaMm={900}
          espessuraMm={150}
          passoGradeMm={100}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
