/**
 * Mover núcleo, vaga e componente por arraste (20/09/2026, backlog P2 — P2.4):
 * `TranslateEntities` aceita `nucleoIds`, `vagaIds` e `componenteIds` — rígidos,
 * no mesmo passo; mover confirma o sugerido; id desconhecido recusa; a
 * geometria só muda em x/y e o hash volta ao original ao desfazer o delta.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, snapshotHash, type Command } from '../utils/blueprintKernel';

function cena() {
  const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m0.levels[0].id;
  const m = applyBatch(m0, [
    { type: 'AddNucleo', levelId: t, tipo: 'SHAFT', ring: [point(0, 0), point(800, 0), point(800, 600), point(0, 600)], disciplina: 'MECANICA' },
    { type: 'AddVaga', levelId: t, tipo: 'COMUM', at: point(5000, 5000), sugerida: true } as Command,
    { type: 'AddComponente', levelId: t, tipoId: 'SOFA', at: point(2000, 2000), sugerido: true },
    { type: 'AddWall', levelId: t, a: point(0, 8000), b: point(6000, 8000), thicknessMm: 150, heightMm: 2800 },
  ]).model;
  return { m, t };
}

describe('mover núcleo, vaga e componente (P2.4)', () => {
  it('TranslateEntities desloca os três rígidos no mesmo comando, confirma o sugerido e não mexe no resto', () => {
    const { m } = cena();
    const n = m.nucleos![0];
    const v = m.vagas![0];
    const c = m.componentes![0];
    expect(v.sugerida).toBe(true);
    expect(c.sugerido).toBe(true);
    const r = applyCommand(m, { type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], aguaIds: [], nucleoIds: [n.id], vagaIds: [v.id], componenteIds: [c.id], delta: point(300, -200), manterJuncoes: false });
    expect(r.diff.updated.sort()).toEqual([n.id, v.id, c.id].sort());
    const n2 = r.model.nucleos![0];
    expect(n2.ring).toEqual([point(300, -200), point(1100, -200), point(1100, 400), point(300, 400)]);
    expect(n2.disciplina).toBe('MECANICA');
    expect(r.model.vagas![0].at).toEqual(point(5300, 4800));
    expect(r.model.vagas![0].sugerida).toBeUndefined();
    expect(r.model.componentes![0].at).toEqual(point(2300, 1800));
    expect(r.model.componentes![0].sugerido).toBeUndefined();
    expect(r.model.walls[0].a).toEqual(point(0, 8000));
    // Voltar pelo delta oposto devolve a geometria (o sugerido, decidido, não volta).
    const volta = applyCommand(r.model, { type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], aguaIds: [], nucleoIds: [n.id], vagaIds: [v.id], componenteIds: [c.id], delta: point(-300, 200), manterJuncoes: false }).model;
    expect(volta.nucleos![0].ring).toEqual(n.ring);
    expect(volta.componentes![0].at).toEqual(c.at);
    const semSugestao = applyBatch(m, [{ type: 'SetComponenteProps', componenteId: c.id, sugerido: false }, { type: 'MoveVaga', vagaId: v.id, to: v.at }]).model;
    expect(snapshotHash(volta)).toBe(snapshotHash(semSugestao));
  });

  it('seleção vazia e id desconhecido são recusados; só componentes também vale', () => {
    const { m } = cena();
    expect(() => applyCommand(m, { type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], aguaIds: [], delta: point(100, 0), manterJuncoes: false })).toThrow(/Nada para deslocar/);
    expect(() => applyCommand(m, { type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], aguaIds: [], componenteIds: ['cmp_9999'], delta: point(100, 0), manterJuncoes: false })).toThrow();
    const so = applyCommand(m, { type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], aguaIds: [], componenteIds: [m.componentes![0].id], delta: point(100, 0), manterJuncoes: true }).model;
    expect(so.componentes![0].at).toEqual(point(2100, 2000));
    expect(so.nucleos![0].ring[0]).toEqual(point(0, 0));
  });
});
