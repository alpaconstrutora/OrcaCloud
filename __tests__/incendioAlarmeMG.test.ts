/**
 * D1.2 (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — detecção e alarme pela IT 14 do CBMMG:
 * 30 m até o acionador (5.8), um acionador por pavimento (5.11), as alturas (5.10 e 5.6.3).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { ALTURAS_DA_CENTRAL_MM, ALTURA_DO_ACIONADOR_MM, DISTANCIA_ATE_ACIONADOR_MM, analisarAlarme, proporAlarme } from '../utils/blueprintDeteccaoAlarme';

const texto = readFileSync(join(__dirname, '..', 'docs', 'normas', 'incendio-mg', 'it14-itens.txt'), 'utf-8');

/** Dois pavimentos com uma sala de 10 × 6 m cada, porta para fora no térreo. */
function predio(): BlueprintModel {
  let m = emptyModel();
  for (let i = 0; i < 2; i++) m = applyCommand(m, { type: 'AddLevel', name: i === 0 ? 'Térreo' : '1º', elevationMm: 3000 * i, defaultHeightMm: 3000 }).model;
  for (const lv of m.levels) {
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: lv.id, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 }) as Command;
    m = applyBatch(m, [w(0, 0, 10000, 0), w(10000, 0, 10000, 6000), w(10000, 6000, 0, 6000), w(0, 6000, 0, 0)]).model;
  }
  m = applyCommand(m, { type: 'AddOpening', wallId: m.walls.find((x) => x.levelId === m.levels[0].id && x.a.y === 0 && x.b.y === 0)!.id, kind: 'door', offsetMm: 500, widthMm: 900, heightMm: 2100, sillMm: 0 } as Command).model;
  return applyBatch(m, m.spaces.map((s) => ({ type: 'NameSpace', spaceId: s.id, name: 'Sala' }) as Command)).model;
}
const peca = (m: BlueprintModel, i: number, tipo: string, cota: number): BlueprintModel =>
  applyCommand(m, { type: 'AddTerminal', levelId: m.levels[i].id, disciplina: 'INCENDIO', tipo, tipoHidraulico: tipo, at: point(5000, 3000), cotaMm: cota } as Command).model;

describe('D1.2 · IT 14 do CBMMG', () => {
  it('a transcrição tem os itens; os valores no código', () => {
    for (const k of ['5.6.3', '5.8', '5.10', '5.11', '5.21']) expect(texto).toMatch(new RegExp(`^${k.replace(/\./g, '\.')} `, 'm'));
    expect(DISTANCIA_ATE_ACIONADOR_MM).toBe(30000);
    expect(ALTURA_DO_ACIONADOR_MM).toEqual({ min: 900, max: 1350 });
    expect(ALTURAS_DA_CENTRAL_MM).toEqual([{ min: 1400, max: 1600 }, { min: 900, max: 1200 }]);
  });

  it('5.11: com alarme exigido, o pavimento sem acionador é falta; a proposta põe um em cada, e a 2ª sai vazia', () => {
    const m = peca(predio(), 0, 'ACIONADOR_MANUAL', 1200);
    const a = analisarAlarme(m, false, true);
    expect(a.pavimentosSemAcionador!.map((x) => x.nome)).toEqual(['1º']);
    const m1 = applyBatch(m, proporAlarme(m, a)).model;
    const a1 = analisarAlarme(m1, false, true);
    expect(a1.pavimentosSemAcionador).toEqual([]);
    expect(proporAlarme(m1, a1)).toEqual([]);
  });

  it('5.10 e 5.6.3: o acionador a 1,50 m e a central a 2,00 m ficam fora; a 1,20 e 1,50 m, dentro; a central sentada a 1,00 m vale', () => {
    let m = peca(peca(predio(), 0, 'ACIONADOR_MANUAL', 1500), 1, 'CENTRAL_ALARME', 2000);
    expect(analisarAlarme(m, false, true).foraDaAltura).toHaveLength(2);
    m = peca(peca(predio(), 0, 'ACIONADOR_MANUAL', 1200), 1, 'CENTRAL_ALARME', 1000);
    expect(analisarAlarme(m, false, true).foraDaAltura).toEqual([]);
  });
});
