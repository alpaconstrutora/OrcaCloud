/**
 * LOTE ATÔMICO do kernel (03/10/2026): `AddWalls`, `AddOpenings` e `PlaceSpaceLabels` fazem N peças num comando só —
 * uma cauda só (cópias do pavimento tipo, ambientes, invariantes). A geometria é a mesma dos comandos unitários em
 * sequência; a recusa em pavimento cópia vale item por item; a memória do arranjo não muda resultado nenhum.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, buildArrangement, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';

/** Térreo + um pavimento tipo com duas cópias vivas. */
function predio(): { m: BlueprintModel; tipo: string; copias: string[] } {
  let m = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 },
    { type: 'AddLevel', name: 'Tipo', elevationMm: 3000, defaultHeightMm: 3000 },
  ]).model;
  const tipo = m.levels[1].id;
  m = applyBatch(m, [
    { type: 'AddLevel', name: '3º', elevationMm: 6000, defaultHeightMm: 3000, tipoDeId: tipo },
    { type: 'AddLevel', name: '4º', elevationMm: 9000, defaultHeightMm: 3000, tipoDeId: tipo },
  ]).model;
  return { m, tipo, copias: m.levels.filter((l) => l.tipoDeId === tipo).map((l) => l.id) };
}

/** Uma sala 8 × 6 dividida ao meio, com porta e janela. */
const paredes = (levelId: string) => [
  { levelId, a: point(0, 0), b: point(8000, 0), thicknessMm: 150, heightMm: 2800 },
  { levelId, a: point(8000, 0), b: point(8000, 6000), thicknessMm: 150, heightMm: 2800 },
  { levelId, a: point(8000, 6000), b: point(0, 6000), thicknessMm: 150, heightMm: 2800 },
  { levelId, a: point(0, 6000), b: point(0, 0), thicknessMm: 150, heightMm: 2800 },
  { levelId, a: point(4000, 0), b: point(4000, 6000), thicknessMm: 100, heightMm: 2800, uid: '0b1d5c4e-0000-4000-8000-000000000001' },
];

describe('lote atômico', () => {
  it('AddWalls + AddOpenings + PlaceSpaceLabels = os unitários em sequência (geometria, aberturas, nomes, cópias)', () => {
    const { m, tipo, copias } = predio();
    const emLote = applyBatch(m, [
      { type: 'AddWalls', walls: paredes(tipo) },
      { type: 'AddOpenings', openings: [{ wallId: '', wallUid: '0b1d5c4e-0000-4000-8000-000000000001', kind: 'door', offsetMm: 2000, widthMm: 900, heightMm: 2100, sillMm: 0 }] },
      { type: 'PlaceSpaceLabels', labels: [{ levelId: tipo, at: point(2000, 3000), name: 'Sala' }, { levelId: tipo, at: point(6000, 3000), name: 'Quarto', tipoDeAmbiente: 'VARANDA' }] },
    ]).model;
    const unitarios = applyBatch(m, [
      ...paredes(tipo).map((w): Command => ({ type: 'AddWall', ...w })),
      { type: 'AddOpening', wallId: '', wallUid: '0b1d5c4e-0000-4000-8000-000000000001', kind: 'door', offsetMm: 2000, widthMm: 900, heightMm: 2100, sillMm: 0 },
      { type: 'PlaceSpaceLabel', levelId: tipo, at: point(2000, 3000), name: 'Sala' },
      { type: 'PlaceSpaceLabel', levelId: tipo, at: point(6000, 3000), name: 'Quarto', tipoDeAmbiente: 'VARANDA' },
    ]).model;
    const resumo = (x: BlueprintModel) =>
      x.levels.map((l) => ({
        nivel: l.name,
        paredes: x.walls.filter((w) => w.levelId === l.id).map((w) => `${w.a.x},${w.a.y}-${w.b.x},${w.b.y}/${w.thicknessMm}`).sort(),
        portas: x.openings.filter((o) => x.walls.some((w) => w.id === o.wallId && w.levelId === l.id)).length,
        ambientes: x.spaces.filter((s) => s.levelId === l.id).map((s) => `${s.name ?? '?'}:${Math.round(s.areaMm2 / 1e4) / 100}`).sort(),
      }));
    expect(resumo(emLote)).toEqual(resumo(unitarios));
    // As cópias vivas levam tudo.
    for (const c of copias) {
      expect(emLote.walls.filter((w) => w.levelId === c)).toHaveLength(5);
      expect(emLote.spaces.filter((s) => s.levelId === c).map((s) => s.name).sort()).toEqual(['Quarto', 'Sala']);
    }
    expect(emLote.labels.find((l) => l.name === 'Quarto' && l.levelId === tipo)!.tipoDeAmbiente).toBe('VARANDA');
  });

  it('a recusa em pavimento CÓPIA vale item por item; lote vazio não muda nada', () => {
    const { m, tipo, copias } = predio();
    expect(() => applyCommand(m, { type: 'AddWalls', walls: [...paredes(tipo).slice(0, 1), { ...paredes(tipo)[1], levelId: copias[0] }] })).toThrow(/cópia do pavimento tipo/);
    const vazio = applyCommand(m, { type: 'AddWalls', walls: [] });
    expect(vazio.model.walls).toHaveLength(0);
  });

  it('a etiqueta no lote renomeia a que já está no ambiente (não empilha); a de dois itens no mesmo ambiente fica uma só', () => {
    const { m, tipo } = predio();
    const comSala = applyBatch(m, [{ type: 'AddWalls', walls: paredes(tipo) }, { type: 'PlaceSpaceLabel', levelId: tipo, at: point(2000, 3000), name: 'Sala' }]).model;
    const r = applyCommand(comSala, { type: 'PlaceSpaceLabels', labels: [{ levelId: tipo, at: point(1000, 1000), name: 'Estar' }, { levelId: tipo, at: point(3000, 5000), name: 'Living' }] }).model;
    expect(r.labels.filter((l) => l.levelId === tipo).map((l) => l.name)).toEqual(['Living']);
  });

  it('a memória do arranjo devolve o mesmo resultado, com o id do pavimento pedido e objetos novos', () => {
    const { m, tipo, copias } = predio();
    const r = applyCommand(m, { type: 'AddWalls', walls: paredes(tipo) }).model;
    const nivelTipo = r.levels.find((l) => l.id === tipo)!;
    const nivelCopia = r.levels.find((l) => l.id === copias[0])!;
    const a1 = buildArrangement(r, nivelTipo);
    const a2 = buildArrangement(r, nivelTipo);
    const ac = buildArrangement(r, nivelCopia);
    expect(a2.spaces).toEqual(a1.spaces);
    expect(a2.spaces[0]).not.toBe(a1.spaces[0]);
    expect(a2.spaces[0].ring).not.toBe(a1.spaces[0].ring);
    expect(ac.spaces.map((s) => [s.id.startsWith(`spc_${copias[0]}_`), s.levelId, s.areaMm2])).toEqual(a1.spaces.map((s) => [true, copias[0], s.areaMm2]));
  });
});
