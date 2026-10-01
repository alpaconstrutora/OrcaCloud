/**
 * Harness da ÁREA DE OPERAÇÃO (E5.2, 01/10/2026): o `BlueprintCanvas` REAL com
 * o salão em L do teste (perna larga 30 × 10 m, perna estreita 6 × 20 m),
 * sprinklers a cada 3 m e a área PROPOSTA na região mais desfavorável já
 * aplicada. Mostra se a área cai dentro do L, em volta do sprinkler do topo da
 * perna estreita, e como ela se desenha (tracejado laranja, nome e m²).
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../../../utils/blueprintKernel';
import { HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO as HIP } from '../../../utils/blueprintCalculoIncendio';
import { HIPOTESES_SPRINKLERS_PADRAO as HS, criterioDeSprinklers } from '../../../utils/blueprintSprinklersIncendio';
import { proporAreaDeOperacao } from '../../../utils/blueprintAreaDeOperacao';

let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
const l = m.levels[0].id;
const contorno = [point(0, 0), point(30000, 0), point(30000, 10000), point(6000, 10000), point(6000, 30000), point(0, 30000)];
m = applyBatch(m, contorno.map((a, i) => ({ type: 'AddWall', levelId: l, a, b: contorno[(i + 1) % contorno.length], thicknessMm: 150, heightMm: 2800 }) as Command)).model;
const linhas = [1500, 4500, 7500, 10500, 13500, 16500, 19500, 22500, 25500, 28500];
const xsDaLinha = (y: number) => (y < 10000 ? Array.from({ length: 10 }, (_, i) => 1500 + 3000 * i) : [1500, 4500]);
const t = (ax: number, ay: number, bx: number, by: number, ca = 2600, cb = 2600, dn = 50): Command => ({ type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(ax, ay), b: point(bx, by), cotaAMm: ca, cotaBMm: cb, bitolaMm: dn }) as Command;
const cmds: Command[] = [{ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo: 'BOMBA_INCENDIO', at: point(28500, 1500), cotaMm: 300, tipoHidraulico: 'BOMBA_INCENDIO' } as Command, t(28500, 1500, 28500, 1500, 300, 2600, 65)];
for (const y of linhas) {
  const xs = xsDaLinha(y);
  for (let i = 1; i < xs.length; i++) cmds.push(t(xs[i - 1], y, xs[i], y));
  for (const x of xs) cmds.push({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo: 'SPRINKLER', at: point(x, y), cotaMm: 2600, tipoHidraulico: 'SPRINKLER', fatorK: 80 } as Command);
}
cmds.push(t(28500, 1500, 28500, 4500), t(28500, 4500, 28500, 7500));
for (let i = 3; i < linhas.length; i++) cmds.push(t(1500, linhas[i - 1], 1500, linhas[i]));
m = applyBatch(m, cmds).model;
const p = proporAreaDeOperacao(m, HIP, criterioDeSprinklers({ ...HS, risco: 'LEVE' }, 'A-2'));
m = applyBatch(m, p.comandos).model;
document.getElementById('dump')!.textContent = JSON.stringify({ motivo: p.motivo, areaM2: p.areaM2, pontos: p.pontos }, null, 1);

createRoot(document.getElementById('raiz')!).render(
  <BlueprintCanvas model={m} tool="selecionar" levelId={l} selectedIds={[]} onSelecionar={() => {}} onAddWall={() => null} alinhamento="EIXO" onInverterLado={() => {}} />,
);
