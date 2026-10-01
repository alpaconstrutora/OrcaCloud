/**
 * Harness da BOMBA DE INCÊNDIO (E4.2, 01/10/2026): o `PainelBombaIncendio` REAL
 * com a análise do galpão de prova (bomba a 0,30 m, hidrantes a 5 m e 30 m) e
 * a curva "forte". Por que existe: o gráfico do recharts não renderiza no jsdom
 * (sem tamanho); só o navegador mostra se as curvas se cruzam onde o ponto de
 * operação diz.
 */
import './harness.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import PainelBombaIncendio from '../../../components/blueprint/PainelBombaIncendio';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../../../utils/blueprintKernel';
import { HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO as HIP, calculoDeIncendio } from '../../../utils/blueprintCalculoIncendio';
import { HIPOTESES_BOMBEAMENTO_PADRAO as HB, analisarBomba, bombasQueAtendem } from '../../../utils/blueprintBombeamentoIncendio';

const CURVA = [{ vazaoLmin: 0, alturaMm: 70000 }, { vazaoLmin: 600, alturaMm: 55000 }, { vazaoLmin: 1200, alturaMm: 30000 }];
let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
const l = m.levels[0].id;
const t = (ax: number, ca: number, bx: number, cb: number): Command => ({ type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(ax, 0), b: point(bx, 0), cotaAMm: ca, cotaBMm: cb, bitolaMm: 65 }) as Command;
const p = (tipo: string, x: number, cota: number, extra: Record<string, unknown> = {}): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, at: point(x, 0), cotaMm: cota, tipoHidraulico: tipo, ...extra }) as Command;
m = applyBatch(m, [p('BOMBA_INCENDIO', 0, 300, { curvaBomba: CURVA, npshrMm: 4000 }), t(0, 300, 0, 2600), t(0, 2600, 5000, 2600), t(5000, 2600, 30000, 2600), t(5000, 2600, 5000, 1300), t(30000, 2600, 30000, 1300), p('HIDRANTE_SIMPLES', 5000, 1300), p('HIDRANTE_SIMPLES', 30000, 1300)]).model;
const c = calculoDeIncendio(m, HIP);
const a = analisarBomba(m, HIP, HB, c)!;
const candidatas = bombasQueAtendem([{ id: 'x', nome: 'Fabricante X — 10 cv', curva: [{ vazaoLmin: 0, alturaMm: 62000 }, { vazaoLmin: 600, alturaMm: 50000 }, { vazaoLmin: 1100, alturaMm: 32000 }] }], a.projeto!);
createRoot(document.getElementById('raiz')!).render(<PainelBombaIncendio analise={a} curva={CURVA} hb={HB} onHb={() => {}} candidatas={candidatas} onAplicar={() => {}} onSelecionarBomba={() => {}} />);
