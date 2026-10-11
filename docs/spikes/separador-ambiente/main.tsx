/**
 * Harness do SEPARADOR DE AMBIENTE (F3 do plano `2026-10-11-planta-recursos-video-synaps.md`).
 *
 * `BlueprintCanvas` REAL, com a ferramenta vinda da URL (`?tool=separador` ou
 * `?tool=divisa`) e `kindDaDivisa = 'RESTRICAO'` — o caso traiçoeiro: o separador
 * reaproveita o gesto da Divisa e tem de gravar `DIVISA` MESMO com a opção da
 * Divisa (aba Terreno) em "Faixa restrita". Cada limite vai para `window.__limites`.
 *
 * Sem Supabase. Abrir em: /docs/spikes/separador-ambiente/index.html?tool=separador
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyCommand, emptyModel } from '../../../utils/blueprintKernel';
import type { BlueprintTool } from '../../../hooks/useBlueprintEditor';

declare global {
  interface Window {
    __limites: { kind: string; a: { x: number; y: number }; b: { x: number; y: number } }[];
  }
}

const tool = (new URLSearchParams(location.search).get('tool') ?? 'separador') as BlueprintTool;
const model = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
window.__limites = [];

createRoot(document.getElementById('raiz')!).render(
  <div id="tela">
    <div>
      <BlueprintCanvas
        model={model}
        tool={tool}
        levelId={model.levels[0].id}
        selectedIds={[]}
        onSelecionar={() => {}}
        onAddWall={() => null}
        onAddOpening={() => {}}
        onDelete={() => {}}
        larguraAberturaMm={900}
        espessuraMm={150}
        passoGradeMm={100}
        kindDaDivisa="RESTRICAO"
        onAddLimite={(a, b, kind) => {
          window.__limites.push({ kind, a, b });
        }}
      />
    </div>
  </div>,
);
