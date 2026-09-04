/**
 * Comandos de pavimento — `SetLevelProps`, `RemoveLevel`, `DuplicateLevel`.
 *
 * A gestão de pavimentos entrou junto com as vistas em elevação (decisão do
 * usuário 2026-08-29, `docs/planos/2026-08-29-planta-inteligente-vistas-elevacoes-3d.md`):
 * uma elevação só empilha o que existir em mais de um nível.
 */

import { describe, expect, it } from 'vitest';
import {
  type BlueprintModel,
  type Command,
  KernelError,
  applyBatch,
  applyCommand,
  emptyModel,
  payloadDoHash,
  point,
  snapshotHash,
} from '../utils/blueprintKernel';

const T = 150;
const H = 2800;

function base(): { model: BlueprintModel; terreoId: string } {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  return { model: r.model, terreoId: r.model.levels[0].id };
}

function wall(levelId: string, ax: number, ay: number, bx: number, by: number): Command {
  return { type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: T, heightMm: H };
}

function sala(model: BlueprintModel, levelId: string): BlueprintModel {
  return applyBatch(model, [
    wall(levelId, 0, 0, 4000, 0),
    wall(levelId, 4000, 0, 4000, 3000),
    wall(levelId, 4000, 3000, 0, 3000),
    wall(levelId, 0, 3000, 0, 0),
  ]).model;
}

describe('SetLevelProps', () => {
  it('renomeia e reposiciona sem tocar nas paredes', () => {
    const { model, terreoId } = base();
    const comParede = applyCommand(model, wall(terreoId, 0, 0, 3000, 0)).model;
    const r = applyCommand(comParede, {
      type: 'SetLevelProps',
      levelId: terreoId,
      name: '  Pavimento Térreo  ',
      elevationMm: 1500,
      defaultHeightMm: 3000,
    });
    const lvl = r.model.levels[0];
    expect(lvl.name).toBe('Pavimento Térreo');
    expect(lvl.elevationMm).toBe(1500);
    expect(lvl.defaultHeightMm).toBe(3000);
    expect(r.model.walls[0].heightMm).toBe(H); // parede mantém a altura própria
    expect(r.diff.updated).toContain(terreoId);
  });

  it('campo omitido fica como está', () => {
    const { model, terreoId } = base();
    const r = applyCommand(model, { type: 'SetLevelProps', levelId: terreoId, elevationMm: 500 });
    expect(r.model.levels[0].name).toBe('Térreo');
    expect(r.model.levels[0].defaultHeightMm).toBe(H);
  });

  it('recusa nome vazio e pé-direito não positivo', () => {
    const { model, terreoId } = base();
    expect(() =>
      applyCommand(model, { type: 'SetLevelProps', levelId: terreoId, name: '   ' }),
    ).toThrow(KernelError);
    expect(() =>
      applyCommand(model, { type: 'SetLevelProps', levelId: terreoId, defaultHeightMm: 0 }),
    ).toThrow(/maior que zero/);
  });
});

describe('RemoveLevel', () => {
  it('apaga o nível e tudo que vive nele, em cascata', () => {
    const { model, terreoId } = base();
    const comSala = sala(model, terreoId);
    const dup = applyCommand(comSala, {
      type: 'DuplicateLevel',
      levelId: terreoId,
      novoNome: 'Pavimento 1',
      elevationMm: H,
    }).model;
    const pav1 = dup.levels[1].id;
    expect(dup.walls.filter((w) => w.levelId === pav1)).toHaveLength(4);

    const r = applyCommand(dup, { type: 'RemoveLevel', levelId: pav1 });
    expect(r.model.levels).toHaveLength(1);
    expect(r.model.walls.every((w) => w.levelId === terreoId)).toBe(true);
    expect(r.model.walls).toHaveLength(4);
    expect(r.diff.deleted).toContain(pav1);
  });

  it('recusa remover o único pavimento', () => {
    const { model, terreoId } = base();
    expect(() => applyCommand(model, { type: 'RemoveLevel', levelId: terreoId })).toThrow(
      /único pavimento/,
    );
  });
});

describe('DuplicateLevel', () => {
  it('copia paredes, aberturas, limites e etiquetas com ids novos', () => {
    const { model, terreoId } = base();
    let m = sala(model, terreoId);
    const paredeBaixa = m.walls[0].id;
    m = applyCommand(m, {
      type: 'AddOpening',
      wallId: paredeBaixa,
      kind: 'door',
      offsetMm: 500,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    }).model;

    const r = applyCommand(m, {
      type: 'DuplicateLevel',
      levelId: terreoId,
      novoNome: 'Pavimento 1',
      elevationMm: 2800,
    });
    const pav1 = r.model.levels[1];
    expect(pav1.name).toBe('Pavimento 1');
    expect(pav1.elevationMm).toBe(2800);
    expect(pav1.defaultHeightMm).toBe(H);

    const paredesPav1 = r.model.walls.filter((w) => w.levelId === pav1.id);
    expect(paredesPav1).toHaveLength(4);
    // ids realmente novos, não repetidos entre níveis
    const idsTerreo = new Set(r.model.walls.filter((w) => w.levelId === terreoId).map((w) => w.id));
    expect(paredesPav1.some((w) => idsTerreo.has(w.id))).toBe(false);

    const aberturasPav1 = r.model.openings.filter((o) =>
      paredesPav1.some((w) => w.id === o.wallId),
    );
    expect(aberturasPav1).toHaveLength(1);
    expect(aberturasPav1[0].offsetMm).toBe(500);
  });

  it('é determinístico: o mesmo roteiro produz o mesmo hash', () => {
    const roteiro = (): BlueprintModel => {
      const { model, terreoId } = base();
      const m = sala(model, terreoId);
      return applyCommand(m, {
        type: 'DuplicateLevel',
        levelId: terreoId,
        novoNome: 'P1',
        elevationMm: 2800,
      }).model;
    };
    const a = roteiro();
    const b = roteiro();
    // Os `id` e a geometria são determinísticos; os `uid` não (e ficam fora do
    // hash — ver `identity.ts`), então a comparação é pelo que o hash lê.
    expect(a.walls.map((w) => w.id)).toEqual(b.walls.map((w) => w.id));
    expect(a.levels.map((l) => l.id)).toEqual(b.levels.map((l) => l.id));
    expect(payloadDoHash(a)).toBe(payloadDoHash(b));
    expect(snapshotHash(a)).toBe(snapshotHash(b));
  });

  it('não copia a cópia (a foto do array é tirada antes dos push)', () => {
    const { model, terreoId } = base();
    const m = sala(model, terreoId);
    const r = applyCommand(m, {
      type: 'DuplicateLevel',
      levelId: terreoId,
      novoNome: 'P1',
      elevationMm: 2800,
    });
    expect(r.model.walls).toHaveLength(8); // 4 + 4, nunca 12
  });
});
