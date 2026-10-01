/**
 * Harness do TRAÇADO DOS SPRINKLERS (E5.4, 01/10/2026): o `BlueprintCanvas`
 * REAL com o salão de 12 × 8 m do teste, a bomba no canto e o lote do botão
 * "Lançar" (distribuição + tubulação). `?t=PONTA|CENTRO|GRELHA` escolhe o
 * traçado. Mostra se o geral chega na prumada e se ramais e subgerais ficam
 * onde o desenho diz (o dump traz o comprimento e o nó ligado).
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../../../utils/blueprintKernel';
import { HIPOTESES_SPRINKLERS_PADRAO as HS, criterioDeSprinklers } from '../../../utils/blueprintSprinklersIncendio';
import { comandosDaDistribuicao, distribuirSprinklers } from '../../../utils/blueprintDistribuicaoSprinklers';
import { tracarRedeDeSprinklers, type TipoDeTracado } from '../../../utils/blueprintRedeDeSprinklers';

const tipo = (new URLSearchParams(location.search).get('t') ?? 'PONTA') as TipoDeTracado;
let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
const l = m.levels[0].id;
const c = [point(0, 0), point(12000, 0), point(12000, 8000), point(0, 8000)];
m = applyBatch(m, c.map((a, i) => ({ type: 'AddWall', levelId: l, a, b: c[(i + 1) % 4], thicknessMm: 150, heightMm: 2800 }) as Command)).model;
m = applyBatch(m, [
  { type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo: 'BOMBA_INCENDIO', at: point(500, 500), cotaMm: 300, tipoHidraulico: 'BOMBA_INCENDIO' } as Command,
  { type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(500, 500), b: point(500, 500), cotaAMm: 300, cotaBMm: 2650, bitolaMm: 65 } as Command,
]).model;
const crit = criterioDeSprinklers({ ...HS, risco: 'LEVE' }, null);
const plano = distribuirSprinklers(m, m.spaces[0].id, crit, HS);
const alt = plano.alternativas.find((a) => a.sentido === 'X')!;
const t = tracarRedeDeSprinklers(m, plano, alt, tipo, 'LEVE');
m = applyBatch(m, [...comandosDaDistribuicao(plano, alt, 80), ...t.comandos]).model;
document.getElementById('dump')!.textContent = JSON.stringify({ tipo, motivo: t.motivo, ligadoA: t.ligadoA, comprimentoM: t.comprimentoM, trechos: t.comandos.length }, null, 1);
createRoot(document.getElementById('raiz')!).render(
  <BlueprintCanvas model={m} tool="selecionar" levelId={l} selectedIds={[]} onSelecionar={() => {}} onAddWall={() => null} alinhamento="EIXO" onInverterLado={() => {}} />,
);
