/**
 * Harness da DETECÇÃO E ALARME (E7.4, 01/10/2026): o `BlueprintCanvas` REAL
 * com o andar do teste (corredor de 60 × 2 m com saída a oeste, dez salas; a 1
 * é cozinha, a 2 banheiro) e a PROPOSTA aplicada: central junto da saída,
 * detectores por ambiente, acionadores, avisador — tudo no laço.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../../../utils/blueprintKernel';
import { analisarAlarme, proporAlarme } from '../../../utils/blueprintDeteccaoAlarme';

let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
const l = m.levels[0].id;
const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Command;
const cmds: Command[] = [w(0, 0, 60000, 0), w(60000, 0, 60000, 8000), w(60000, 8000, 0, 8000), w(0, 8000, 0, 2000), w(0, 2000, 0, 0)];
for (let k = 0; k < 10; k++) cmds.push(w(k * 6000, 2000, (k + 1) * 6000, 2000));
for (let k = 1; k < 10; k++) cmds.push(w(k * 6000, 2000, k * 6000, 8000));
m = applyBatch(m, cmds).model;
const portas = m.walls.filter((x) => x.a.y === 2000 && x.b.y === 2000).map((x) => ({ type: 'AddOpening', wallId: x.id, kind: 'door', offsetMm: 2500, widthMm: 900, heightMm: 2100, sillMm: 0 }) as Command);
const saida = m.walls.find((x) => x.a.x === 0 && x.b.x === 0 && x.a.y === 2000)!;
m = applyBatch(m, [...portas, { type: 'AddOpening', wallId: saida.id, kind: 'door', offsetMm: 550, widthMm: 900, heightMm: 2100, sillMm: 0 } as Command]).model;
m = applyBatch(m, m.spaces.map((s) => {
  const k = Math.round(Math.min(...s.ring.map((p) => p.x)) / 6000) + 1;
  return { type: 'NameSpace', spaceId: s.id, name: s.ring.every((p) => p.y <= 2000) ? 'Corredor' : k === 1 ? 'Cozinha' : k === 2 ? 'Banheiro' : `Sala ${k}` } as Command;
})).model;
const lote = proporAlarme(m, analisarAlarme(m, true, true));
m = applyBatch(m, lote).model;
const b = analisarAlarme(m, true, true);
const conta = (t: string) => m.terminais!.filter((x) => x.tipoHidraulico === t).length;
document.getElementById('dump')!.textContent = JSON.stringify({ itens: lote.length, CA: conta('CENTRAL_ALARME'), DF: conta('DETECTOR_FUMACA'), DT: conta('DETECTOR_TEMPERATURA'), AM: conta('ACIONADOR_MANUAL'), AV: conta('AVISADOR'), faltaDeteccao: b.ambientes.filter((x) => !x.atende).length, longe: b.longeDoAcionador.length, foraDoLaco: b.foraDoLaco.length }, null, 1);
createRoot(document.getElementById('raiz')!).render(
  <BlueprintCanvas model={m} tool="selecionar" levelId={l} selectedIds={[]} onSelecionar={() => {}} onAddWall={() => null} alinhamento="EIXO" onInverterLado={() => {}} />,
);
