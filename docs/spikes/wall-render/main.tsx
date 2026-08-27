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
  pontasSoltasDoNivel,
  type Command,
} from '../../../utils/blueprintKernel';

// Espessura exagerada de proposito: a 0,05 px/mm ela rende 60 px na tela, e o
// canto fica grande o bastante para se julgar sem ampliar nada.
const T = 1200;
const H = 2800;

/**
 * Cena de ESPESSURAS DIFERENTES — o caso do print de 27/08/2026.
 *
 * As cenas anteriores usavam espessura uniforme, onde o avanço de mitra e o
 * recuo até a face coincidem. Foi por isso que o defeito passou por toda a
 * bateria de testes: sem espessuras diferentes, as duas grandezas são iguais.
 */
const cenaMista = new URLSearchParams(location.search).get('mista') === '1';

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

/**
 * Planta de ESPESSURAS DIFERENTES: fachada de 300, divisória de 100.
 *
 * Reproduz o print de 27/08/2026. Com espessura uniforme o defeito é invisível
 * — avanço de mitra e recuo até a face valem os dois `t/2`. Aqui eles diferem
 * por 100 mm, que é a medida que estava mentindo.
 */
function construirMista() {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  const levelId = base.model.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number, t: number): Command => ({
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: t,
    heightMm: H,
  });

  return applyBatch(base.model, [
    // Envoltória GROSSA (300).
    w(0, 0, 9000, 0, 300),
    w(9000, 0, 9000, 6000, 300),
    w(9000, 6000, 0, 6000, 300),
    w(0, 6000, 0, 0, 300),
    // Divisória FINA (100), em T nas duas fachadas.
    w(4000, 0, 4000, 6000, 100),
  ]).model;
}

const modelo = cenaMista ? construirMista() : construir();

// ?medidas=1 liga o toggle "Medidas" — harness estático, sem botão de verdade,
// mas o mesmo prop que o botão da barra acende.
const mostrarMedidas = new URLSearchParams(location.search).get('medidas') === '1';
// Cadeias de cota por lado — total/parcial/interna. Botão próprio no editor.
const mostrarCotas = new URLSearchParams(location.search).get('cotas') === '1';

function App() {
  return (
    <BlueprintCanvas
      model={modelo}
      tool="selecionar"
      levelId={modelo.levels[0].id}
      selectedIds={[]}
      onSelecionar={() => {}}
      onAddWall={() => {}}
      onAddOpening={() => {}}
      larguraAberturaMm={900}
      onDelete={() => {}}
      espessuraMm={T}
      passoGradeMm={null}
      vaos={[{ a: point(8000, 4500), b: point(8000, 5400), mm: 900 }]}
      pontasSoltas={pontasSoltasDoNivel(modelo, modelo.levels[0])}
      mostrarMedidasParedes={mostrarMedidas}
      mostrarCotas={mostrarCotas}
    />
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
