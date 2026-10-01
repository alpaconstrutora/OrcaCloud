/**
 * Harness das SAÍDAS DE EMERGÊNCIA (E6.1, 01/10/2026): o `PainelSaidasIncendio`
 * REAL com o pavimento-tipo do teste (quatro dormitórios sobre a circulação de
 * 1,20 m entre eixos, escada de 0,90 m, porta de 0,90 m para fora).
 */
import './harness.css';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import PainelSaidasIncendio from '../../../components/blueprint/PainelSaidasIncendio';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../../../utils/blueprintKernel';
import { HIPOTESES_SAIDAS_PADRAO, analisarSaidas } from '../../../utils/blueprintSaidasIncendio';

let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2880 }).model;
m = applyCommand(m, { type: 'AddLevel', name: 'Tipo', elevationMm: 2880, defaultHeightMm: 2880 }).model;
const [t, tipo] = m.levels.map((l) => l.id);
const w = (l: string, ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2880 }) as Command;
const caixa = (l: string) => [w(l, 0, 0, 20000, 0), w(l, 20000, 0, 20000, 10000), w(l, 20000, 10000, 0, 10000), w(l, 0, 10000, 0, 0)];
m = applyBatch(m, [...caixa(t), ...caixa(tipo), w(tipo, 0, 1200, 20000, 1200), ...[5000, 10000, 15000].map((x) => w(tipo, x, 1200, x, 10000))]).model;
m = applyBatch(m, m.walls.filter((x) => (x.levelId === tipo && x.a.y === 1200 && x.b.y === 1200) || (x.levelId === t && x.a.y === 0 && x.b.y === 0)).flatMap((x) => (x.levelId === tipo ? [1000, 6000, 11000, 16000] : [9000]).map((off) => ({ type: 'AddOpening', wallId: x.id, kind: 'door', offsetMm: off, widthMm: 900, heightMm: 2100, sillMm: 0 }) as Command))).model;
m = applyBatch(m, m.spaces.filter((s) => s.levelId === tipo).map((s) => ({ type: 'NameSpace', spaceId: s.id, name: Math.min(...s.ring.map((p) => p.y)) < 1000 ? 'Circulação' : `Dormitório ${Math.round(Math.min(...s.ring.map((p) => p.x)) / 5000) + 1}` }) as Command)).model;
m = applyCommand(m, { type: 'AddEscada', levelId: t, pontos: [point(17000, 3000), point(17000, 8000)], larguraMm: 900, rotulo: 'E1' } as Command).model;

// E6.2: a altura de 20 m pede escada enclausurada protegida — a escada E1 está solta no térreo (sem caixa).
function App() {
  const [hip, setHip] = useState(HIPOTESES_SAIDAS_PADRAO);
  const [modelo, setModelo] = useState(m);
  return (
    <PainelSaidasIncendio
      analise={analisarSaidas(modelo, 'A-2', hip, null, 20)}
      hip={hip}
      onHip={setHip}
      onSelecionar={() => {}}
      onProtecao={(escadaId, protecao) => setModelo((x) => applyCommand(x, { type: 'SetEscadaProps', escadaId, protecao } as Command).model)}
      onCortaFogo={(ids) => setModelo((x) => applyBatch(x, ids.map((openingId) => ({ type: 'SetOpeningEmergencia', openingId, marcas: ['CORTA_FOGO'] }) as Command)).model)}
    />
  );
}
createRoot(document.getElementById('raiz')!).render(<App />);
