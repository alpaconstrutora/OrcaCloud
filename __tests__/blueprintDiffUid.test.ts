/**
 * Diff semântico POR IDENTIDADE (04/09/2026).
 *
 * Antes da identidade, mover uma parede saía como "removida + adicionada" — a
 * única leitura que o casamento geométrico permite. Com `uid` nos dois lados,
 * vira "Parede P-1A2B movida". O que este arquivo trava:
 *
 *  1. mover parede/abertura/estrutura é UMA alteração `*_MOVIDA`, com o rótulo;
 *  2. porta que anda JUNTO com a parede não é "porta movida";
 *  3. snapshot antigo × novo cai no fallback geométrico, sem inventar
 *     "movida" e sem falso "removida + adicionada" quando nada mudou;
 *  4. ambiente nomeado casa pela etiqueta (`labelUid`) e vira uma frase de área.
 */

import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  rotuloCurto,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { diffSnapshots } from '../utils/blueprintDiff';

function aplicar(model: BlueprintModel, ...comandos: Command[]): BlueprintModel {
  let atual = model;
  for (const c of comandos) atual = applyCommand(atual, c).model;
  return atual;
}

function comNivel(): { model: BlueprintModel; lvl: string } {
  const model = aplicar(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  });
  return { model, lvl: model.levels[0].id };
}

const parede = (lvl: string, ax: number, ay: number, bx: number, by: number): Command => ({
  type: 'AddWall',
  levelId: lvl,
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  thicknessMm: 150,
  heightMm: 2800,
});

function sala(): BlueprintModel {
  const { model, lvl } = comNivel();
  return aplicar(
    model,
    parede(lvl, 0, 0, 4000, 0),
    parede(lvl, 4000, 0, 4000, 3000),
    parede(lvl, 4000, 3000, 0, 3000),
    parede(lvl, 0, 3000, 0, 0),
  );
}

const tipos = (d: ReturnType<typeof diffSnapshots>, t: string) =>
  d.alteracoes.filter((a) => a.tipo === t);

/** Snapshot "antigo": o mesmo desenho relido de um payload SEM identidade. */
function comoSnapshotAntigo(m: BlueprintModel): BlueprintModel {
  const p = parseCanonicalPayload(canonicalPayload(m));
  delete p.identity;
  return modelFromCanonicalPayload(p);
}

describe('diff por uid · parede', () => {
  it('TranslateEntities → 1 PAREDE_MOVIDA com rótulo, 0 removida/adicionada', () => {
    const { model, lvl } = comNivel();
    const antes = aplicar(model, parede(lvl, 0, 0, 4000, 0));
    const w = antes.walls[0];
    const depois = aplicar(antes, {
      type: 'TranslateEntities',
      wallIds: [w.id],
      boundaryIds: [],
      structuralIds: [],
      delta: { x: 0, y: 1000 },
      manterJuncoes: false,
    });

    const d = diffSnapshots(antes, depois);
    expect(d.identicos).toBe(false);
    expect(tipos(d, 'PAREDE_MOVIDA')).toHaveLength(1);
    expect(tipos(d, 'PAREDE_REMOVIDA')).toHaveLength(0);
    expect(tipos(d, 'PAREDE_ADICIONADA')).toHaveLength(0);
    expect(tipos(d, 'PAREDE_MOVIDA')[0].descricao).toContain(rotuloCurto(w.uid, 'wall'));
    expect(tipos(d, 'PAREDE_MOVIDA')[0].descricao).toContain('4,00 m movida');
    expect(tipos(d, 'PAREDE_MOVIDA')[0].uid).toBe(w.uid);
  });

  it('esticar a ponta muda o comprimento: a frase traz antes → depois', () => {
    const { model, lvl } = comNivel();
    const antes = aplicar(model, parede(lvl, 0, 0, 4000, 0));
    const depois = aplicar(antes, {
      type: 'MoveVertex',
      wallId: antes.walls[0].id,
      end: 'b',
      to: { x: 5000, y: 0 },
    });
    const movida = tipos(diffSnapshots(antes, depois), 'PAREDE_MOVIDA');
    expect(movida).toHaveLength(1);
    expect(movida[0].descricao).toContain('4,00 → 5,00 m');
  });

  it('a porta que anda JUNTO com a parede não é porta movida', () => {
    const { model, lvl } = comNivel();
    const antes = aplicar(model, parede(lvl, 0, 0, 4000, 0), {
      type: 'AddOpening',
      wallId: 'wal_0001',
      kind: 'door',
      offsetMm: 1000,
      widthMm: 800,
      heightMm: 2100,
      sillMm: 0,
    });
    const depois = aplicar(antes, {
      type: 'TranslateEntities',
      wallIds: [antes.walls[0].id],
      boundaryIds: [],
      structuralIds: [],
      delta: { x: 500, y: 500 },
      manterJuncoes: false,
    });
    const d = diffSnapshots(antes, depois);
    expect(tipos(d, 'PAREDE_MOVIDA')).toHaveLength(1);
    expect(tipos(d, 'ABERTURA_MOVIDA')).toHaveLength(0);
    expect(tipos(d, 'ABERTURA_REMOVIDA')).toHaveLength(0);
    expect(tipos(d, 'ABERTURA_ADICIONADA')).toHaveLength(0);
    expect(d.alteracoes).toHaveLength(1);
  });
});

describe('diff por uid · abertura e estrutura', () => {
  it('MoveOpening → ABERTURA_MOVIDA; SetOpeningSize → ABERTURA_ALTERADA', () => {
    const { model, lvl } = comNivel();
    const antes = aplicar(model, parede(lvl, 0, 0, 4000, 0), {
      type: 'AddOpening',
      wallId: 'wal_0001',
      kind: 'door',
      offsetMm: 1000,
      widthMm: 800,
      heightMm: 2100,
      sillMm: 0,
    });
    const o = antes.openings[0];

    const movida = diffSnapshots(
      antes,
      aplicar(antes, { type: 'MoveOpening', openingId: o.id, offsetMm: 2000 }),
    );
    expect(movida.alteracoes).toHaveLength(1);
    expect(movida.alteracoes[0].tipo).toBe('ABERTURA_MOVIDA');
    expect(movida.alteracoes[0].descricao).toContain(rotuloCurto(o.uid, 'opening'));

    const alterada = diffSnapshots(
      antes,
      aplicar(antes, { type: 'SetOpeningSize', openingId: o.id, widthMm: 900 }),
    );
    expect(alterada.alteracoes).toHaveLength(1);
    expect(alterada.alteracoes[0].tipo).toBe('ABERTURA_ALTERADA');
    expect(alterada.alteracoes[0].descricao).toContain('0,80×2,10 → 0,90×2,10 m');
  });

  it('MoveStructuralVertex → ESTRUTURA_MOVIDA, 0 removida/adicionada', () => {
    const { model, lvl } = comNivel();
    const antes = aplicar(model, {
      type: 'AddStructural',
      levelId: lvl,
      kind: 'PILAR',
      pontos: [{ x: 1000, y: 1000 }],
      larguraMm: 200,
      profundidadeMm: 400,
      alturaMm: 2800,
      rotulo: 'P1',
    });
    const depois = aplicar(antes, {
      type: 'MoveStructuralVertex',
      structuralId: antes.structures[0].id,
      index: 0,
      to: { x: 1500, y: 1000 },
    });
    const d = diffSnapshots(antes, depois);
    expect(d.alteracoes).toHaveLength(1);
    expect(d.alteracoes[0].tipo).toBe('ESTRUTURA_MOVIDA');
    expect(d.alteracoes[0].descricao).toContain('P1');
    expect(d.alteracoes[0].descricao).toContain(rotuloCurto(antes.structures[0].uid, 'structural'));
  });
});

describe('diff por uid · fallback geométrico', () => {
  it('snapshot antigo × desenho novo idêntico → identicos', () => {
    const novo = sala();
    const antigo = comoSnapshotAntigo(novo);
    // Sanidade: os uids NÃO batem (derivados × aleatórios).
    expect(antigo.walls.map((w) => w.uid)).not.toEqual(novo.walls.map((w) => w.uid));
    const d = diffSnapshots(antigo, sala());
    expect(d.identicos, d.alteracoes.map((a) => a.descricao).join(' | ')).toBe(true);
  });

  it('snapshot antigo × novo com parede movida → removida + adicionada, nunca "movida"', () => {
    const novo = sala();
    const antigo = comoSnapshotAntigo(novo);
    const direita = novo.walls.find((w) => w.a.x === 4000 && w.b.x === 4000)!;
    const depois = aplicar(novo, {
      type: 'TranslateEntities',
      wallIds: [direita.id],
      boundaryIds: [],
      structuralIds: [],
      delta: { x: 1000, y: 0 },
      manterJuncoes: false,
    });
    const d = diffSnapshots(antigo, depois);
    expect(tipos(d, 'PAREDE_MOVIDA')).toHaveLength(0);
    expect(tipos(d, 'PAREDE_REMOVIDA')).toHaveLength(1);
    expect(tipos(d, 'PAREDE_ADICIONADA')).toHaveLength(1);
  });

  it('dois snapshots antigos consecutivos continuam comparáveis por geometria', () => {
    const a = sala();
    const b = aplicar(a, {
      type: 'SetThickness',
      wallId: a.walls[0].id,
      thicknessMm: 250,
    });
    const d = diffSnapshots(comoSnapshotAntigo(a), comoSnapshotAntigo(b));
    expect(tipos(d, 'PAREDE_ESPESSURA')).toHaveLength(1);
    expect(tipos(d, 'PAREDE_REMOVIDA')).toHaveLength(0);
  });
});

describe('diff por uid · ambiente pela etiqueta', () => {
  it('ambiente nomeado que muda de contorno casa pelo labelUid: UMA frase de área', () => {
    const base = sala();
    const nomeado = aplicar(base, { type: 'NameSpace', spaceId: base.spaces[0].id, name: 'Quarto' });
    const direita = nomeado.walls.find((w) => w.a.x === 4000 && w.b.x === 4000)!;
    const topo = nomeado.walls.find((w) => w.a.y === 3000 && w.b.y === 3000)!;
    const depois = aplicar(
      nomeado,
      { type: 'MoveVertex', wallId: direita.id, end: 'b', to: { x: 6000, y: 3000 } },
      { type: 'MoveVertex', wallId: topo.id, end: 'a', to: { x: 6000, y: 3000 } },
    );
    const d = diffSnapshots(nomeado, depois);
    const area = tipos(d, 'AMBIENTE_AREA');
    expect(area).toHaveLength(1);
    expect(area[0].descricao).toContain('Quarto');
    expect(area[0].uid).toBe(nomeado.labels[0].uid);
    expect(tipos(d, 'AMBIENTE_REMOVIDO')).toHaveLength(0);
    expect(tipos(d, 'AMBIENTE_ADICIONADO')).toHaveLength(0);
    // E as duas paredes esticadas aparecem como movidas, não como troca.
    expect(tipos(d, 'PAREDE_MOVIDA')).toHaveLength(2);
    expect(tipos(d, 'PAREDE_REMOVIDA')).toHaveLength(0);
  });

  it('renomear pela mesma etiqueta é só AMBIENTE_RENOMEADO', () => {
    const base = sala();
    const a = aplicar(base, { type: 'NameSpace', spaceId: base.spaces[0].id, name: 'Sala' });
    const b = aplicar(a, { type: 'NameSpace', spaceId: a.spaces[0].id, name: 'Escritório' });
    expect(a.labels[0].uid).toBe(b.labels[0].uid);
    const d = diffSnapshots(a, b);
    expect(d.alteracoes).toHaveLength(1);
    expect(d.alteracoes[0].tipo).toBe('AMBIENTE_RENOMEADO');
  });
});
