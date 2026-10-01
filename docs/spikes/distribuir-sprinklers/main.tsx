/**
 * Harness da DISTRIBUIÇÃO DE SPRINKLERS (E5.3, 01/10/2026): o componente REAL
 * com o salão em L do teste (perna larga 30 × 10 m, perna estreita 6 × 20 m),
 * risco ordinário 1. Mostra as alternativas lado a lado — o desenho tem de
 * cobrir o L inteiro, sem sprinkler fora e sem buraco no canto interno.
 */
import './harness.css';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import DistribuicaoDeSprinklers from '../../../components/blueprint/DistribuicaoDeSprinklers';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../../../utils/blueprintKernel';
import { HIPOTESES_SPRINKLERS_PADRAO as HS, criterioDeSprinklers } from '../../../utils/blueprintSprinklersIncendio';
import { distribuirSprinklers } from '../../../utils/blueprintDistribuicaoSprinklers';

let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
const l = m.levels[0].id;
const c = [point(0, 0), point(30000, 0), point(30000, 10000), point(6000, 10000), point(6000, 30000), point(0, 30000)];
m = applyBatch(m, c.map((a, i) => ({ type: 'AddWall', levelId: l, a, b: c[(i + 1) % c.length], thicknessMm: 150, heightMm: 2800 }) as Command)).model;
const s = m.spaces[0];

function App() {
  const [spaceId, setSpace] = useState<string | null>(s.id);
  const plano = spaceId ? distribuirSprinklers(m, spaceId, criterioDeSprinklers({ ...HS, risco: 'ORDINARIO_1' }, null), HS) : null;
  return <DistribuicaoDeSprinklers ambientes={[{ id: s.id, nome: 'Salão em L', areaM2: s.areaMm2 / 1e6 }]} spaceId={spaceId} onSpace={setSpace} contorno={s.ring} plano={plano} onLancar={() => {}} />;
}
createRoot(document.getElementById('raiz')!).render(<App />);
