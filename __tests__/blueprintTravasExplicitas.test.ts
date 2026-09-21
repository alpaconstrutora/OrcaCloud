/**
 * TRAVAS EXPLÍCITAS (21/09/2026, backlog P2 "lock fino"): vigência, índice de
 * peças, bloqueio por ELEMENTOS (só o que a trava cobre), por PAVIMENTO
 * (inclusive criar) e por DISCIPLINA (inclusive criar e circuitos); o dono
 * passa; vencida não bloqueia; ids travados para o crachá; rótulos.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { bloqueioDasTravas, idsTravados, rotuloDaTrava, travasVigentes, type TravaExplicita } from '../utils/blueprintColaboracao';

function casa() {
  const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
  const t = nivel.model.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(nivel.model, [w(0, 0, 4000, 0), w(4000, 0, 4000, 3000), w(4000, 3000, 0, 3000), w(0, 3000, 0, 0)]).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Tomada', at: point(1000, 150), cotaMm: 300 } as Command).model;
  m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Torneira', at: point(2000, 150), cotaMm: 600 } as Command).model;
  return { m, t, sup: m.levels[1].id };
}

const daqui = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const trava = (x: Partial<TravaExplicita> & Pick<TravaExplicita, 'escopo' | 'alvos'>): TravaExplicita => ({ id: 'trv_1', branchId: 'br', holderUserId: 'u_ana', holderEmail: 'ana@x.com', holderNome: 'Ana Lima', nota: 'revisando', createdAt: new Date().toISOString(), expiresAt: daqui(8), ...x });

describe('travas explícitas', () => {
  it('ELEMENTOS: bloqueia só o que cobre, com nome/nota/prazo; o dono passa; vencida não conta', () => {
    const { m } = casa();
    const [w0, w1] = m.walls;
    const t = trava({ escopo: 'ELEMENTOS', alvos: [w0.uid] });
    const mover: Command = { type: 'SetWallProps', wallId: w0.id, thicknessMm: 200 } as Command;
    const b = bloqueioDasTravas([mover], [t], m, 'u_eu');
    expect(b?.motivo).toMatch(/está travado por Ana Lima \("revisando"\) até /);
    expect(bloqueioDasTravas([{ type: 'SetWallProps', wallId: w1.id, thicknessMm: 200 } as Command], [t], m, 'u_eu')).toBeNull();
    expect(bloqueioDasTravas([mover], [t], m, 'u_ana')).toBeNull();
    expect(bloqueioDasTravas([mover], [{ ...t, expiresAt: daqui(-1) }], m, 'u_eu')).toBeNull();
    expect(travasVigentes([t, { ...t, id: 'v', expiresAt: daqui(-1) }])).toHaveLength(1);
    // Criar parede nova não esbarra numa trava de elementos.
    expect(bloqueioDasTravas([{ type: 'AddWall', levelId: m.levels[0].id, a: point(0, 5000), b: point(1000, 5000), thicknessMm: 150, heightMm: 2800 }], [t], m, 'u_eu')).toBeNull();
    expect(idsTravados([t], m).map((x) => x.id)).toEqual([w0.id]);
    expect(rotuloDaTrava(t, m)).toBe('1 elemento(s)');
  });

  it('PAVIMENTO: bloqueia editar E criar nele; o outro pavimento segue livre', () => {
    const { m, t: terreo, sup } = casa();
    const tr = trava({ escopo: 'PAVIMENTO', alvos: [m.levels[0].uid], nota: '' });
    expect(bloqueioDasTravas([{ type: 'AddWall', levelId: terreo, a: point(0, 5000), b: point(1000, 5000), thicknessMm: 150, heightMm: 2800 }], [tr], m, 'u_eu')?.motivo).toMatch(/O pavimento "Térreo" está travado por Ana Lima até/);
    expect(bloqueioDasTravas([{ type: 'SetWallProps', wallId: m.walls[0].id, thicknessMm: 200 } as Command], [tr], m, 'u_eu')).not.toBeNull();
    expect(bloqueioDasTravas([{ type: 'AddWall', levelId: sup, a: point(0, 5000), b: point(1000, 5000), thicknessMm: 150, heightMm: 2800 }], [tr], m, 'u_eu')).toBeNull();
    expect(rotuloDaTrava(tr, m)).toBe('Pavimento Térreo');
  });

  it('DISCIPLINA: bloqueia pontos/trechos/circuitos da disciplina (editar e criar); as outras seguem livres', () => {
    const { m, t } = casa();
    const tr = trava({ escopo: 'DISCIPLINA', alvos: ['ELETRICA'] });
    const tomada = m.terminais!.find((x) => x.disciplina === 'ELETRICA')!;
    const torneira = m.terminais!.find((x) => x.disciplina === 'AGUA_FRIA')!;
    expect(bloqueioDasTravas([{ type: 'SetTerminalProps', terminalId: tomada.id, cotaMm: 1100 } as Command], [tr], m, 'u_eu')?.motivo).toMatch(/A disciplina ELETRICA está travada/);
    expect(bloqueioDasTravas([{ type: 'SetTerminalProps', terminalId: torneira.id, cotaMm: 1100 } as Command], [tr], m, 'u_eu')).toBeNull();
    expect(bloqueioDasTravas([{ type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Luz', at: point(500, 500), cotaMm: 2800 } as Command], [tr], m, 'u_eu')).not.toBeNull();
    expect(bloqueioDasTravas([{ type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'Ralo', at: point(500, 500), cotaMm: 0 } as Command], [tr], m, 'u_eu')).toBeNull();
    expect(bloqueioDasTravas([{ type: 'AddCircuito', levelId: t, nome: 'C1' } as Command], [tr], m, 'u_eu')).not.toBeNull();
    // Parede não é de disciplina nenhuma.
    expect(bloqueioDasTravas([{ type: 'SetWallProps', wallId: m.walls[0].id, thicknessMm: 200 } as Command], [tr], m, 'u_eu')).toBeNull();
    expect(rotuloDaTrava(tr, m)).toBe('Disciplina ELETRICA');
  });
});
