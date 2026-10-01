/**
 * HARNESS — o GERADOR DE PPCI (E10, 01/10/2026): a gaveta com o plano REAL do
 * prédio de 8 pavimentos do teste (`gerarPpci`), na largura do drawer.
 * `?semBomba=1` mostra a rede que não roda. Porta 3173.
 */
import './harness.css';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../../utils/blueprintKernel';
import { HIPOTESES_INCENDIO_PADRAO, type HipotesesIncendio } from '../../../utils/blueprintIncendioClassificacao';
import { conferirPlanoDoPpci, gerarPpci, type PlanoDoPpci } from '../../../utils/blueprintGeradorPpci';
import PainelGeradorPpci from '../../../components/blueprint/PainelGeradorPpci';

const H: HipotesesIncendio = { ...HIPOTESES_INCENDIO_PADRAO, classificacao: { ...HIPOTESES_INCENDIO_PADRAO.classificacao, divisao: 'A-2' } };

/**
 * 8 pavimentos de 20 × 12 m (3 m de piso a piso): corredor de 2 m ao longo do
 * y = 0–2 m e quatro salas de 5 × 10 m, cada uma com porta para o corredor; no
 * térreo, a porta da rua no fim do corredor e a bomba de incêndio.
 */
function predio(comBomba = true): BlueprintModel {
  let m = emptyModel();
  for (let i = 0; i < 8; i++) m = applyCommand(m, { type: 'AddLevel', name: i === 0 ? 'Térreo' : `${i}º`, elevationMm: i * 3000, defaultHeightMm: 2800 }).model;
  for (const l of m.levels) {
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l.id, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Command;
    m = applyBatch(m, [w(0, 0, 20000, 0), w(20000, 0, 20000, 12000), w(20000, 12000, 0, 12000), w(0, 12000, 0, 0), w(0, 2000, 20000, 2000), ...[5000, 10000, 15000].map((x) => w(x, 2000, x, 12000))]).model;
    const corredor = m.walls.find((x) => x.levelId === l.id && x.a.y === 2000 && x.b.y === 2000)!;
    m = applyBatch(m, [0, 1, 2, 3].map((k) => ({ type: 'AddOpening', wallId: corredor.id, kind: 'door', offsetMm: k * 5000 + 2000, widthMm: 900, heightMm: 2100, sillMm: 0 }) as Command)).model;
  }
  const t0 = m.levels[0].id;
  const fundo = m.walls.find((x) => x.levelId === t0 && x.a.x === 0 && x.b.x === 0)!;
  m = applyCommand(m, { type: 'AddOpening', wallId: fundo.id, kind: 'door', offsetMm: 10500, widthMm: 1200, heightMm: 2100, sillMm: 0 } as Command).model;
  if (comBomba) m = applyCommand(m, { type: 'AddTerminal', levelId: t0, disciplina: 'INCENDIO', tipo: 'Bomba', tipoHidraulico: 'BOMBA_INCENDIO', at: point(19000, 1000), cotaMm: 300 } as Command).model;
  return m;
}


const semBomba = new URLSearchParams(location.search).get('semBomba') === '1';
const ORIGINAL = predio(!semBomba);

function App() {
  const [plano, setPlano] = useState<PlanoDoPpci | null>(() => gerarPpci(ORIGINAL, H));
  const [lancado, setLancado] = useState<string | null>(null);
  return (
    <div style={{ width: 420 }} className="rounded-[10px] bg-white p-4 shadow">
      <PainelGeradorPpci
        g={{
          plano,
          gerando: false,
          onGerar: () => setPlano(gerarPpci(ORIGINAL, H)),
          prova: plano ? conferirPlanoDoPpci(ORIGINAL, plano) : null,
          onLancar: () => { setLancado(`${plano!.criados.length} peça(s) e trecho(s) lançados num lote — Ctrl+Z desfaz tudo.`); setPlano(null); },
          lancado,
          onBaixar: () => undefined,
        }}
      />
    </div>
  );
}
createRoot(document.getElementById('raiz')!).render(<App />);
