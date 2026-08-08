/**
 * Harness isolado do desenho de parede.
 *
 * Monta o BlueprintCanvas REAL — não uma cópia — com um modelo fixo, sem
 * Supabase e sem login. Existe porque duas correções de canto seguidas foram
 * feitas no escuro: `tsc` e testes não olham pixel, e sem ver o resultado a
 * correção vira chute.
 *
 * Abrir em: /docs/spikes/wall-render/index.html no servidor de dev.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type Command,
} from '../../../utils/blueprintKernel';

// Espessura exagerada de proposito: a 0,05 px/mm ela rende 60 px na tela, e o
// canto fica grande o bastante para se julgar sem ampliar nada.
const T = 1200;
const H = 2800;

function construir() {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  const levelId = base.model.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: T,
    heightMm: H,
  });

  return applyBatch(base.model, [
    // Retângulo fechado: exercita os quatro cantos em L.
    w(0, 0, 16000, 0),
    w(16000, 0, 16000, 11000),
    w(16000, 11000, 0, 11000),
    w(0, 11000, 0, 0),
    // Divisória: junção em T nas duas pontas.
    w(8000, 0, 8000, 11000),
    // Ponta solta: exercita a extremidade LIVRE.
    w(16000, 5000, 21000, 5000),
  ]).model;
}

const modelo = construir();

function App() {
  return (
    <BlueprintCanvas
      model={modelo}
      tool="selecionar"
      levelId={modelo.levels[0].id}
      selectedId={null}
      onSelect={() => {}}
      onAddWall={() => {}}
      onDelete={() => {}}
      espessuraMm={T}
      passoGradeMm={null}
    />
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
