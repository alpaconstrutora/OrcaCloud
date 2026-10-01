/**
 * Harness da ILUMINAÇÃO DE EMERGÊNCIA (E7.3, 01/10/2026): o `BlueprintCanvas`
 * REAL com o andar do teste (corredor de 60 × 2 m com saída na ponta oeste,
 * dez salas) e as luminárias da PROPOSTA aplicadas sobre as rotas de fuga.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../../../utils/blueprintKernel';
import { percursoDeFuga } from '../../../utils/blueprintRotaDeFuga';
import { HIPOTESES_ILUMINACAO_PADRAO as HI, analisarIluminacao, proporIluminacao } from '../../../utils/blueprintIluminacaoEmergencia';

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
const p = percursoDeFuga(m, 'A', l);
const lote = proporIluminacao(m, p, analisarIluminacao(m, p, l, HI));
m = applyBatch(m, lote).model;
const depois = analisarIluminacao(m, percursoDeFuga(m, 'A', l), l, HI);
document.getElementById('dump')!.textContent = JSON.stringify({ lancadas: lote.length, semLuz: depois.trechosSemLuz.length, obrigatoriosFaltando: depois.pontosObrigatorios.filter((x) => !x.coberto).length }, null, 1);
createRoot(document.getElementById('raiz')!).render(
  <BlueprintCanvas model={m} tool="selecionar" levelId={l} selectedIds={[]} onSelecionar={() => {}} onAddWall={() => null} alinhamento="EIXO" onInverterLado={() => {}} rotasDeFuga={p.ambientes.flatMap((a) => a.rota.map((r) => ({ ...r, falta: false })))} />,
);
