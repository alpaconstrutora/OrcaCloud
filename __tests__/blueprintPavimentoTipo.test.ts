/**
 * Pavimento tipo (18/09/2026, E2.1): vincular, propagar, recusar edição na
 * cópia, desvincular, remover o tipo, canônico e idempotência.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  snapshotHash,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';

function terreo(): { m: BlueprintModel; t: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model;
  m = applyBatch(m, [
    { type: 'AddOpening', wallId: m.walls[0].id, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 },
    { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(0, 0)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800, rotulo: 'P1' },
    { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Sala' },
  ]).model;
  return { m, t };
}

const doNivel = (m: BlueprintModel, id: string) => ({
  walls: m.walls.filter((w) => w.levelId === id),
  openings: m.openings.filter((o) => m.walls.some((w) => w.id === o.wallId && w.levelId === id)),
  structures: m.structures.filter((s) => s.levelId === id),
  labels: m.labels.filter((l) => l.levelId === id),
  spaces: m.spaces.filter((s) => s.levelId === id),
});

describe('vincular e propagar', () => {
  it('AddLevel com tipoDeId nasce como cópia viva; editar o tipo propaga; a cópia tem uids próprios e estáveis', () => {
    const { m, t } = terreo();
    const r = applyCommand(m, { type: 'AddLevel', name: '1º andar', elevationMm: 2800, defaultHeightMm: 2800, tipoDeId: t });
    const p1 = r.model.levels[1].id;
    const copia = doNivel(r.model, p1);
    expect(copia.walls).toHaveLength(4);
    expect(copia.openings).toHaveLength(1);
    expect(copia.structures).toHaveLength(1);
    expect(copia.labels).toHaveLength(1);
    expect(copia.spaces[0]?.name).toBe('Sala');
    // Uids: diferentes dos do tipo, e os mesmos após qualquer comando.
    const uidsAntes = copia.walls.map((w) => w.uid).sort();
    expect(new Set([...uidsAntes, ...m.walls.map((w) => w.uid)]).size).toBe(8);
    // Edita o TIPO: a parede da frente engrossa e ganha camadas; a cópia acompanha, com o MESMO id.
    const idCopiaFrente = copia.walls.find((w) => w.a.x === 0 && w.a.y === 0 && w.b.x === 6000)!.id;
    const x = applyCommand(r.model, { type: 'SetThickness', wallId: m.walls[0].id, thicknessMm: 200 }).model;
    const frenteCopia = x.walls.find((w) => w.id === idCopiaFrente)!;
    expect(frenteCopia.thicknessMm).toBe(200);
    expect(doNivel(x, p1).walls.map((w) => w.uid).sort()).toEqual(uidsAntes);
    // Apaga a porta no tipo: some na cópia. Adiciona pilar no tipo: nasce na cópia.
    const y = applyBatch(x, [
      { type: 'DeleteOpening', openingId: x.openings.find((o) => o.wallId === m.walls[0].id)!.id },
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(6000, 4000)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800, rotulo: 'P2' },
    ]).model;
    expect(doNivel(y, p1).openings).toHaveLength(0);
    expect(doNivel(y, p1).structures.map((s) => s.rotulo).sort()).toEqual(['P1', 'P2']);
    // Idempotente: sincronizar de novo (qualquer comando neutro) não muda o hash.
    const z = applyCommand(y, { type: 'SetLevelProps', levelId: p1, name: '1º andar' }).model;
    expect(snapshotHash(z)).toBe(snapshotHash(y));
  });

  it('editar arquitetura/estrutura NA CÓPIA é recusado com a mensagem; instalações e pavimento continuam livres', () => {
    const { m, t } = terreo();
    const r = applyCommand(m, { type: 'AddLevel', name: '1º andar', elevationMm: 2800, defaultHeightMm: 2800, tipoDeId: t });
    const p1 = r.model.levels[1].id;
    const copia = doNivel(r.model, p1);
    expect(() => applyCommand(r.model, { type: 'SetThickness', wallId: copia.walls[0].id, thicknessMm: 300 })).toThrow(/cópia do pavimento tipo "Térreo"/);
    expect(() => applyCommand(r.model, { type: 'AddWall', levelId: p1, a: point(0, 0), b: point(1000, 1000), thicknessMm: 150, heightMm: 2800 })).toThrow(/LEVEL_LINKED|cópia do pavimento tipo/);
    expect(() => applyCommand(r.model, { type: 'DeleteStructural', structuralId: copia.structures[0].id })).toThrow(/edite o tipo/);
    expect(() => applyCommand(r.model, { type: 'NameSpace', spaceId: copia.spaces[0].id, name: 'Suíte' })).toThrow(/edite o tipo/);
    // Livres: instalações e propriedades do pavimento.
    const ok = applyBatch(r.model, [
      { type: 'AddTerminal', levelId: p1, disciplina: 'ELETRICA', tipo: 'TUG', at: point(500, 500), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 100 },
      { type: 'SetLevelProps', levelId: p1, defaultHeightMm: 2700 },
    ]).model;
    expect(ok.terminais!.filter((x) => x.levelId === p1)).toHaveLength(1);
    expect(ok.levels[1].defaultHeightMm).toBe(2700);
  });

  it('desvincular deixa as cópias, agora editáveis; vincular um pavimento já desenhado DESCARTA o que ele tinha; sem corrente de tipos', () => {
    const { m, t } = terreo();
    let x = applyCommand(m, { type: 'AddLevel', name: '1º andar', elevationMm: 2800, defaultHeightMm: 2800, tipoDeId: t }).model;
    const p1 = x.levels[1].id;
    x = applyCommand(x, { type: 'SetLevelProps', levelId: p1, tipoDeId: null }).model;
    expect(x.levels[1].tipoDeId).toBeUndefined();
    const copia = doNivel(x, p1);
    expect(copia.walls).toHaveLength(4);
    x = applyCommand(x, { type: 'SetThickness', wallId: copia.walls[0].id, thicknessMm: 300 }).model; // agora pode
    // Um 2º andar desenhado à mão, depois vinculado ao térreo: a parede solta some, vira cópia.
    x = applyCommand(x, { type: 'AddLevel', name: '2º andar', elevationMm: 5600, defaultHeightMm: 2800 }).model;
    const p2 = x.levels[2].id;
    x = applyCommand(x, { type: 'AddWall', levelId: p2, a: point(100, 100), b: point(900, 100), thicknessMm: 150, heightMm: 2800 }).model;
    x = applyCommand(x, { type: 'SetLevelProps', levelId: p2, tipoDeId: t }).model;
    expect(doNivel(x, p2).walls).toHaveLength(4);
    expect(doNivel(x, p2).walls.some((w) => w.a.x === 100)).toBe(false);
    // Corrente: vincular ao 2º (que é cópia) é recusado; e o térreo (tipo de outros) não pode virar cópia.
    x = applyCommand(x, { type: 'AddLevel', name: '3º andar', elevationMm: 8400, defaultHeightMm: 2800 }).model;
    const p3 = x.levels[3].id;
    expect(() => applyCommand(x, { type: 'SetLevelProps', levelId: p3, tipoDeId: p2 })).toThrow(/já é cópia/);
    expect(() => applyCommand(x, { type: 'SetLevelProps', levelId: t, tipoDeId: p1 })).toThrow(/é tipo de outros/);
    // Remover o tipo desvincula quem dependia; as cópias ficam.
    const semTerreo = applyCommand(x, { type: 'RemoveLevel', levelId: t }).model;
    expect(semTerreo.levels.find((l) => l.id === p2)!.tipoDeId).toBeUndefined();
    expect(doNivel(semTerreo, p2).walls).toHaveLength(4);
  });

  it('canônico: `tipoDe` por índice; ida e volta byte a byte e o vínculo sobrevive', () => {
    const { m, t } = terreo();
    const x = applyCommand(m, { type: 'AddLevel', name: '1º andar', elevationMm: 2800, defaultHeightMm: 2800, tipoDeId: t }).model;
    const json = canonicalPayload(x);
    expect(json).toContain('"tipoDe":0');
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(json));
    expect(volta.levels[1].tipoDeId).toBe(volta.levels[0].id);
    expect(canonicalPayload(volta)).toBe(json);
    // E um comando qualquer depois da volta não muda o hash (a sincronização é estável).
    const depois = applyCommand(volta, { type: 'SetLevelProps', levelId: volta.levels[1].id, name: '1º andar' }).model;
    expect(snapshotHash(depois)).toBe(snapshotHash(volta));
  });
});
