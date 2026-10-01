/**
 * Harness dos SPRINKLERS (E5.1, 01/10/2026): o `PainelCalculoIncendio` REAL com
 * um ramal de 10 sprinklers e um hidrante junto da bomba — o risco é o
 * sugerido pela divisão A-2 (leve). Mostra a seção do critério, o cenário dos
 * sprinklers e quem governa a bomba, como o editor desenha.
 */
import './harness.css';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import PainelCalculoIncendio from '../../../components/blueprint/PainelCalculoIncendio';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../../../utils/blueprintKernel';
import { HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO as HIP, calculoDeIncendio } from '../../../utils/blueprintCalculoIncendio';
import { conferenciaDeIncendio } from '../../../utils/blueprintConferenciaIncendio';
import { HIPOTESES_SPRINKLERS_PADRAO, criterioDeSprinklers } from '../../../utils/blueprintSprinklersIncendio';

let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
const l = m.levels[0].id;
const t = (ax: number, ca: number, bx: number, cb: number, dn = 50): Command => ({ type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(ax, 0), b: point(bx, 0), cotaAMm: ca, cotaBMm: cb, bitolaMm: dn }) as Command;
const p = (tipo: string, x: number, cota: number, extra: Record<string, unknown> = {}): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, at: point(x, 0), cotaMm: cota, tipoHidraulico: tipo, ...extra }) as Command;
const xs = Array.from({ length: 10 }, (_, i) => 3000 * (i + 1));
m = applyBatch(m, [p('BOMBA_INCENDIO', 0, 300), t(0, 300, 0, 2600, 65), ...xs.map((x) => t(x - 3000, 2600, x, 2600)), ...xs.map((x) => p('SPRINKLER', x, 2600, { fatorK: 80 })), t(0, 2600, 0, 1300, 65), p('HIDRANTE_SIMPLES', 0, 1300)]).model;
const nome = new Map(m.terminais!.map((x, i) => [x.id, x.tipoHidraulico === 'SPRINKLER' ? `SPK-${i}` : x.tipoHidraulico === 'HIDRANTE_SIMPLES' ? 'H-1' : 'B-1']));

function App() {
  const [hs, setHs] = useState(HIPOTESES_SPRINKLERS_PADRAO);
  const criterio = criterioDeSprinklers(hs, 'A-2');
  const c = calculoDeIncendio(m, HIP, criterio);
  return (
    <PainelCalculoIncendio
      hip={HIP}
      onHip={() => {}}
      calculo={c}
      nomeDe={(id) => nome.get(id) ?? id}
      onSelecionar={() => {}}
      ajusteDeDn={{ alterados: 0, onAjustar: () => {} }}
      conferencia={conferenciaDeIncendio(m, c, HIP)}
      sprinklers={{ hs, onHs: setHs, criterio }}
    />
  );
}
createRoot(document.getElementById('raiz')!).render(<App />);
