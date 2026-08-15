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

  const base2 = applyBatch(base.model, [
    // Retângulo fechado: exercita os quatro cantos em L.
    w(0, 0, 16000, 0),
    w(16000, 0, 16000, 11000),
    w(16000, 11000, 0, 11000),
    w(0, 11000, 0, 0),
    // Divisória: junção em T nas duas pontas.
    w(8000, 0, 8000, 4500),
    w(8000, 5400, 8000, 11000),
    // Ponta solta: exercita a extremidade LIVRE.
    w(16000, 5000, 21000, 5000),
  ]).model;

  // Divisoria com VAO ABERTO no meio: e o caso que trava o ambiente e que o
  // painel de vaos existe para resolver. Duas pontas soltas a 900 mm.

  // Aberturas: uma porta e uma janela, para conferir vao, batente e simbolo.
  const paredeSul = base2.walls.find((w) => w.a.y === 11000 && w.b.y === 11000);
  const paredeOeste = base2.walls.find((w) => w.a.x === 0 && w.b.x === 0);

  let comAberturas = base2;
  if (paredeSul) {
    comAberturas = applyCommand(comAberturas, {
      type: 'AddOpening',
      wallId: paredeSul.id,
      kind: 'door',
      offsetMm: 4000,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    }).model;
  }
  if (paredeOeste) {
    comAberturas = applyCommand(comAberturas, {
      type: 'AddOpening',
      wallId: paredeOeste.id,
      kind: 'window',
      offsetMm: 3000,
      widthMm: 2000,
      heightMm: 1200,
      sillMm: 900,
    }).model;
  }
  return comAberturas;
}

const modelo = construir();

// ?medidas=1 liga o toggle "Medidas" — harness estático, sem botão de verdade,
// mas o mesmo prop que o botão da barra acende.
const mostrarMedidas = new URLSearchParams(location.search).get('medidas') === '1';

function App() {
  return (
    <BlueprintCanvas
      model={modelo}
      tool="selecionar"
      levelId={modelo.levels[0].id}
      selectedId={null}
      onSelect={() => {}}
      onAddWall={() => {}}
      onAddOpening={() => {}}
      larguraAberturaMm={900}
      onDelete={() => {}}
      espessuraMm={T}
      passoGradeMm={null}
      vaos={[{ a: point(8000, 4500), b: point(8000, 5400), mm: 900 }]}
      pontasSoltas={[point(8000, 4500), point(8000, 5400)]}
      mostrarMedidasParedes={mostrarMedidas}
    />
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
