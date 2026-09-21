/**
 * PAVIMENTO CRIADO NA IMPORTAÇÃO (21/09/2026, P2.32): `AddLevel` com `uid` e
 * `AddWall`/`AddStructural` com `levelUid` no MESMO lote — o pavimento nasce e
 * as peças caem nele, um passo de desfazer; uid desconhecido e uid repetido
 * são recusados.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { gerarCollada } from '../utils/blueprintCollada';
import { prepararCollada } from '../utils/colladaParaKernel';

describe('levelUid no lote de importação', () => {
  it('cria o pavimento e põe parede e pilar nele pelo uid; recusa uid desconhecido e repetido', () => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const uid = '11111111-1111-4111-8111-111111111111';
    const lote: Command[] = [
      { type: 'AddLevel', name: 'Pavimento +2,80', elevationMm: 2800, defaultHeightMm: 2800, uid },
      { type: 'AddWall', levelId: '', levelUid: uid, a: point(0, 0), b: point(4000, 0), thicknessMm: 150, heightMm: 2800 },
      { type: 'AddStructural', levelId: '', levelUid: uid, kind: 'PILAR', pontos: [point(2000, 1500)], larguraMm: 300, profundidadeMm: 300, alturaMm: 2800, baseMm: 0 } as Command,
    ];
    const r = applyBatch(base, lote);
    expect(r.model.levels.map((l) => [l.name, l.elevationMm, l.uid])).toEqual([['Térreo', 0, base.levels[0].uid], ['Pavimento +2,80', 2800, uid]]);
    const novo = r.model.levels[1];
    expect(r.model.walls[0].levelId).toBe(novo.id);
    expect(r.model.structures![0].levelId).toBe(novo.id);
    expect(() => applyCommand(base, { type: 'AddWall', levelId: '', levelUid: 'nao-existe', a: point(0, 0), b: point(1000, 0), thicknessMm: 150, heightMm: 2800 })).toThrow(/Nenhum pavimento com uid/);
    expect(() => applyCommand(r.model, { type: 'AddLevel', name: 'Outro', elevationMm: 5600, defaultHeightMm: 2800, uid })).toThrow(/Já existe pavimento com uid/);
  });

  it('o .dae de um sobrado lido com as cotas 0 e 2,80 devolve dois grupos de pavimento (o painel cria o que não existe)', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
    const [t, s] = m.levels.map((l) => l.id);
    const w = (lv: string, ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: lv, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
    m = applyBatch(m, [w(t, 0, 0, 6000, 0), w(t, 6000, 0, 6000, 4000), w(t, 6000, 4000, 0, 4000), w(t, 0, 4000, 0, 0), w(s, 0, 0, 6000, 0), w(s, 6000, 0, 6000, 4000), w(s, 6000, 4000, 0, 4000), w(s, 0, 4000, 0, 0)]).model;
    const r = prepararCollada(gerarCollada(m, { titulo: 'Sobrado', revisao: 1, hash: 'h' }));
    expect(r.pavimentos.map((p) => [p.elevationMm, p.paredes.length])).toEqual([
      [0, 4],
      [2800, 4],
    ]);
  });
});
