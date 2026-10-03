/**
 * Remover pavimento e desagrupar (03/10/2026) — três defeitos do kernel achados nas pendências do Estudo de Massa:
 *  1. `RemoveLevel` não levava o LOTEAMENTO do piso (quadras, lotes, vias, áreas públicas): o invariante "pavimento
 *     inexistente" recusava a remoção inteira com um erro críptico.
 *  2. Nem os GRUPOS (E2.3): origem ou instância no piso removido → mesma recusa.
 *  3. "Desagrupar (as cópias ficam)" APAGAVA as cópias quando havia outro grupo no modelo — a sincronização da cauda as
 *     via como órfãs. (O pavimento tipo da massa nasce com vários grupos.)
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';

const quadrado = (x: number, y = 0, l = 1000): Point[] => [
  { x, y },
  { x: x + l, y },
  { x: x + l, y: y + l },
  { x, y: y + l },
];
function doisPisos(): { m: BlueprintModel; terreo: string; p2: string } {
  const m = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 },
    { type: 'AddLevel', name: '2º', elevationMm: 3000, defaultHeightMm: 3000 },
  ]).model;
  return { m, terreo: m.levels[0].id, p2: m.levels[1].id };
}
const parede = (levelId: string, y: number): Command => ({ type: 'AddWall', levelId, a: { x: 0, y }, b: { x: 3000, y }, thicknessMm: 150, heightMm: 2800 });

describe('RemoveLevel leva o loteamento do piso', () => {
  it('quadras, lotes, vias e áreas públicas do piso saem; lote de outro piso fica sem a quadra', () => {
    const { m: m0, terreo, p2 } = doisPisos();
    let m = applyBatch(m0, [{ type: 'AddQuadra', levelId: p2, nome: 'Q1', pontos: quadrado(0) }]).model;
    const q = m.quadras![0].id;
    m = applyBatch(m, [
      { type: 'AddLote', levelId: p2, quadraId: q, numero: '1', pontos: quadrado(0) },
      { type: 'AddLote', levelId: terreo, quadraId: q, numero: '2', pontos: quadrado(5000) },
      { type: 'AddVia', levelId: p2, nome: 'Rua A', eixo: [{ x: 0, y: 2000 }, { x: 9000, y: 2000 }], larguraMm: 8000 },
      { type: 'AddAreaPublica', levelId: p2, tipo: 'VERDE', pontos: quadrado(20000) },
    ]).model;
    const r = applyCommand(m, { type: 'RemoveLevel', levelId: p2 });
    expect(r.model.quadras ?? []).toHaveLength(0);
    expect(r.model.vias ?? []).toHaveLength(0);
    expect(r.model.areasPublicas ?? []).toHaveLength(0);
    expect(r.model.lotes!.map((l) => [l.numero, l.quadraId])).toEqual([['2', null]]);
    expect(r.diff.deleted).toEqual(expect.arrayContaining([q, m.vias![0].id, m.areasPublicas![0].id]));
  });
});

describe('RemoveLevel e os grupos (E2.3)', () => {
  it('a ORIGEM no piso removido: o grupo some e as cópias dos outros pisos ficam LIVRES (editáveis)', () => {
    const { m: m0, terreo, p2 } = doisPisos();
    let m = applyBatch(m0, [parede(p2, 0)]).model;
    m = applyCommand(m, { type: 'AddGrupo', nome: 'G', wallIds: [m.walls[0].id], instancias: [{ levelId: terreo }, { translacao: { x: 0, y: 5000 } }] }).model;
    const r = applyCommand(m, { type: 'RemoveLevel', levelId: p2 }).model;
    expect(r.grupos ?? []).toHaveLength(0);
    const livre = r.walls.filter((w) => w.levelId === terreo);
    expect(livre).toHaveLength(1);
    // Não é mais cópia: editar passa.
    expect(applyCommand(r, { type: 'SetThickness', wallId: livre[0].id, thicknessMm: 200 }).model.walls[0].thicknessMm).toBe(200);
  });

  it('a INSTÂNCIA no piso removido: sai do grupo; a origem e a outra instância ficam', () => {
    const { m: m0, terreo, p2 } = doisPisos();
    let m = applyBatch(m0, [parede(terreo, 0)]).model;
    m = applyCommand(m, { type: 'AddGrupo', nome: 'G', wallIds: [m.walls[0].id], instancias: [{ levelId: p2 }, { translacao: { x: 0, y: 5000 } }] }).model;
    const r = applyCommand(m, { type: 'RemoveLevel', levelId: p2 }).model;
    expect(r.grupos!.map((g) => g.instancias.map((i) => i.levelId))).toEqual([[terreo]]);
    expect(r.walls.map((w) => w.levelId)).toEqual([terreo, terreo]);
  });
});

describe('desagrupar com OUTRO grupo no modelo', () => {
  function doisGrupos() {
    const { m: m0, terreo } = doisPisos();
    let m = applyBatch(m0, [parede(terreo, 0), parede(terreo, 20000)]).model;
    const [w1, w2] = m.walls.map((w) => w.id);
    m = applyBatch(m, [
      { type: 'AddGrupo', nome: 'A', wallIds: [w1], instancias: [{ translacao: { x: 0, y: 5000 } }] },
      { type: 'AddGrupo', nome: 'B', wallIds: [w2], instancias: [{ translacao: { x: 0, y: 5000 } }] },
    ]).model;
    return m;
  }

  it('"as cópias ficam" — e ficam livres; o outro grupo segue intacto', () => {
    const m = doisGrupos();
    expect(m.walls).toHaveLength(4);
    const r = applyCommand(m, { type: 'DeleteGrupo', grupoId: m.grupos![0].id, manterInstancias: true }).model;
    expect(r.walls).toHaveLength(4);
    expect(r.grupos!.map((g) => g.nome)).toEqual(['B']);
    const exCopia = r.walls.find((w) => w.a.y === 5000)!;
    expect(applyCommand(r, { type: 'SetThickness', wallId: exCopia.id, thicknessMm: 200 }).model.walls.find((w) => w.id === exCopia.id)!.thicknessMm).toBe(200);
    // E a do grupo que ficou continua cópia: editar é recusado.
    const copiaB = r.walls.find((w) => w.a.y === 25000)!;
    expect(() => applyCommand(r, { type: 'SetThickness', wallId: copiaB.id, thicknessMm: 200 })).toThrow(/instância do grupo/);
  });

  it('excluir grupo E cópias continua apagando as cópias dele (só as dele)', () => {
    const m = doisGrupos();
    const r = applyCommand(m, { type: 'DeleteGrupo', grupoId: m.grupos![0].id, manterInstancias: false }).model;
    expect(r.walls.map((w) => w.a.y).sort((a, b) => a - b)).toEqual([0, 20000, 25000]);
  });
});
