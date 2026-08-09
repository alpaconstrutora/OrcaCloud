/**
 * Spike A — kernel geométrico, braço TypeScript (PRD §30).
 *
 * Os 25 casos que o PRD exige: junções T/L/X, split/merge, aberturas próximas às
 * pontas, ambientes com ilha, tolerâncias e undo.
 *
 * Critério de aprovação: igualdade bit a bit do payload canônico entre navegador e
 * servidor. Como o kernel é puro e sem dependência de runtime, "navegador × servidor"
 * se traduz aqui em: a mesma geometria construída por caminhos diferentes produz
 * exatamente o mesmo payload — que é a propriedade que torna a igualdade entre
 * runtimes possível por construção.
 */

import { describe, expect, it } from 'vitest';
import {
  type BlueprintModel,
  type Command,
  KernelError,
  ModelHistory,
  applyBatch,
  applyCommand,
  areCollinear,
  buildArrangement,
  canonicalPayload,
  emptyModel,
  interiorPoint,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  pointInPolygon,
  intersectSegments,
  point,
  sha256,
  snapshotHash,
  vertexDegrees,
} from '../utils/blueprintKernel';

// ─────────────────────────────────────────────────────────────────────────────
// Ajuda
// ─────────────────────────────────────────────────────────────────────────────

const T = 150; // espessura padrão, mm
const H = 2800; // altura padrão, mm

function withLevel(): { model: BlueprintModel; levelId: string } {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  return { model: base.model, levelId: base.model.levels[0].id };
}

function wall(levelId: string, ax: number, ay: number, bx: number, by: number): Command {
  return {
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: T,
    heightMm: H,
  };
}

/** Sala retangular fechada: 4 paredes em anel. */
function room(levelId: string, x0: number, y0: number, x1: number, y1: number): Command[] {
  return [
    wall(levelId, x0, y0, x1, y0),
    wall(levelId, x1, y0, x1, y1),
    wall(levelId, x1, y1, x0, y1),
    wall(levelId, x0, y1, x0, y0),
  ];
}

function level0(model: BlueprintModel) {
  return model.levels[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Junções (casos 1–6)
// ─────────────────────────────────────────────────────────────────────────────

describe('Spike A · junções', () => {
  it('caso 01 — junção em L: duas paredes com ponta comum formam um vértice de grau 2', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [wall(levelId, 0, 0, 4000, 0), wall(levelId, 4000, 0, 4000, 3000)]);

    const degrees = vertexDegrees(built.model, level0(built.model));
    expect(degrees.get('4000,0')).toBe(2);
    expect(degrees.get('0,0')).toBe(1);
  });

  it('caso 02 — junção em T: parede que termina no meio de outra divide a hospedeira', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      wall(levelId, 0, 0, 6000, 0),
      wall(levelId, 3000, 0, 3000, 3000),
    ]);

    const degrees = vertexDegrees(built.model, level0(built.model));
    // O vértice do T tem grau 3: dois trechos da parede base + a que chega.
    expect(degrees.get('3000,0')).toBe(3);
  });

  it('caso 03 — junção em X: duas paredes que se cruzam geram vértice de grau 4', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      wall(levelId, 0, 2000, 6000, 2000),
      wall(levelId, 3000, 0, 3000, 4000),
    ]);

    const degrees = vertexDegrees(built.model, level0(built.model));
    expect(degrees.get('3000,2000')).toBe(4);
  });

  it('caso 04 — vão dentro da tolerância: pontas a 3 mm são unificadas', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      wall(levelId, 0, 0, 4000, 0),
      wall(levelId, 4003, 0, 4003, 3000), // 3 mm de folga, tolerância é 5
    ]);

    const degrees = vertexDegrees(built.model, level0(built.model));
    const merged = [...degrees.entries()].filter(([, d]) => d === 2);
    expect(merged.length).toBe(1);
  });

  it('caso 05 — vão além da tolerância: pontas a 40 mm permanecem separadas', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      wall(levelId, 0, 0, 4000, 0),
      wall(levelId, 4040, 0, 4040, 3000),
    ]);

    const degrees = vertexDegrees(built.model, level0(built.model));
    expect(degrees.get('4000,0')).toBe(1);
    expect(degrees.get('4040,0')).toBe(1);
  });

  it('caso 06 — paredes colineares sobrepostas produzem sobreposição, não ponto', () => {
    const hit = intersectSegments(
      { a: point(0, 0), b: point(4000, 0) },
      { a: point(2000, 0), b: point(6000, 0) },
    );

    expect(hit.kind).toBe('overlap');
    expect(hit.overlap?.a).toEqual({ x: 2000, y: 0 });
    expect(hit.overlap?.b).toEqual({ x: 4000, y: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ambientes (casos 7–12)
// ─────────────────────────────────────────────────────────────────────────────

describe('Spike A · ambientes', () => {
  it('caso 07 — quatro paredes fechadas derivam exatamente um ambiente com a área certa', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000));

    expect(built.model.spaces).toHaveLength(1);
    expect(built.model.spaces[0].areaMm2).toBe(4000 * 3000);
    expect(built.model.spaces[0].perimeterMm).toBe(2 * (4000 + 3000));
  });

  it('caso 08 — duas salas com parede comum derivam dois ambientes', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      ...room(levelId, 0, 0, 6000, 3000),
      wall(levelId, 3000, 0, 3000, 3000), // divisória
    ]);

    expect(built.model.spaces).toHaveLength(2);
    const areas = built.model.spaces.map((s) => s.areaMm2).sort((a, b) => a - b);
    expect(areas).toEqual([3000 * 3000, 3000 * 3000]);
  });

  it('caso 09 — ilha interna vira buraco do ambiente, não ambiente próprio', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      ...room(levelId, 0, 0, 8000, 6000),
      ...room(levelId, 3000, 2000, 5000, 4000), // ilha central, sem tocar o contorno
    ]);

    const outer = built.model.spaces.find((s) => s.holes.length > 0);
    expect(outer).toBeDefined();
    expect(outer!.holes).toHaveLength(1);
    // Área líquida desconta a ilha.
    expect(outer!.areaMm2).toBe(8000 * 6000 - 2000 * 2000);
  });

  it('caso 10 — contorno aberto não fecha ambiente e reporta as pontas soltas', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      wall(levelId, 0, 0, 4000, 0),
      wall(levelId, 4000, 0, 4000, 3000),
      wall(levelId, 4000, 3000, 0, 3000),
      // falta a quarta parede
    ]);

    const arrangement = buildArrangement(built.model, level0(built.model));
    expect(arrangement.spaces).toHaveLength(0);
    expect(arrangement.danglingVertices).toHaveLength(2);
  });

  it('caso 11 — limite sem material divide o ambiente como uma parede dividiria', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      ...room(levelId, 0, 0, 6000, 3000),
      { type: 'AddBoundary', levelId, a: point(3000, 0), b: point(3000, 3000) },
    ]);

    expect(built.model.spaces).toHaveLength(2);
  });

  it('caso 12 — identidade do ambiente sobrevive a mudança de espessura', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000));
    const before = built.model.spaces[0];

    const after = applyCommand(built.model, {
      type: 'SetThickness',
      wallId: built.model.walls[0].id,
      thicknessMm: 250,
    });

    // Espessura é propriedade, não geometria do eixo: a face não muda.
    expect(after.model.spaces[0].id).toBe(before.id);
    expect(after.model.spaces[0].areaMm2).toBe(before.areaMm2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Aberturas (casos 13–17)
// ─────────────────────────────────────────────────────────────────────────────

describe('Spike A · aberturas', () => {
  function roomWithWall() {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000));
    return { model: built.model, wallId: built.model.walls[0].id };
  }

  it('caso 13 — abertura no meio da parede é aceita', () => {
    const { model, wallId } = roomWithWall();
    const after = applyCommand(model, {
      type: 'AddOpening',
      wallId,
      kind: 'door',
      offsetMm: 1500,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    });

    expect(after.model.openings).toHaveLength(1);
    expect(after.model.openings[0].offsetMm).toBe(1500);
  });

  it('caso 14 — abertura encostada na ponta (offset 0) é aceita', () => {
    const { model, wallId } = roomWithWall();
    const after = applyCommand(model, {
      type: 'AddOpening',
      wallId,
      kind: 'window',
      offsetMm: 0,
      widthMm: 1200,
      heightMm: 1200,
      sillMm: 900,
    });

    expect(after.model.openings[0].offsetMm).toBe(0);
  });

  it('caso 15 — abertura que ultrapassa a parede é rejeitada', () => {
    const { model, wallId } = roomWithWall();
    expect(() =>
      applyCommand(model, {
        type: 'AddOpening',
        wallId,
        kind: 'door',
        offsetMm: 3500,
        widthMm: 900, // 3500+900 = 4400 > 4000
        heightMm: 2100,
        sillMm: 0,
      }),
    ).toThrow(KernelError);
  });

  it('caso 16 — abertura migra para o fragmento certo quando a parede é dividida', () => {
    const { model, wallId } = roomWithWall();
    const withOpening = applyCommand(model, {
      type: 'AddOpening',
      wallId,
      kind: 'door',
      offsetMm: 2500,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    });

    const split = applyCommand(withOpening.model, {
      type: 'SplitWall',
      wallId,
      at: point(2000, 0),
    });

    const opening = split.model.openings[0];
    const host = split.model.walls.find((w) => w.id === opening.wallId)!;
    // Foi para o segundo fragmento, com offset medido a partir do novo início.
    expect(host.a).toEqual({ x: 2000, y: 0 });
    expect(opening.offsetMm).toBe(500);
  });

  it('caso 17 — duas aberturas sobrepostas na mesma parede são rejeitadas', () => {
    const { model, wallId } = roomWithWall();
    const first = applyCommand(model, {
      type: 'AddOpening',
      wallId,
      kind: 'door',
      offsetMm: 1000,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    });

    expect(() =>
      applyCommand(first.model, {
        type: 'AddOpening',
        wallId,
        kind: 'window',
        offsetMm: 1500, // invade a anterior (1000..1900)
        widthMm: 900,
        heightMm: 1200,
        sillMm: 900,
      }),
    ).toThrow(/sobrep/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Split / merge (casos 18–21)
// ─────────────────────────────────────────────────────────────────────────────

describe('Spike A · split e merge', () => {
  it('caso 18 — split produz dois fragmentos e registra ancestralidade', () => {
    const { model, levelId } = withLevel();
    const built = applyCommand(model, wall(levelId, 0, 0, 4000, 0));
    const original = built.model.walls[0].id;

    const split = applyCommand(built.model, {
      type: 'SplitWall',
      wallId: original,
      at: point(1500, 0),
    });

    expect(split.model.walls).toHaveLength(2);
    expect(split.diff.deleted).toContain(original);
    expect(split.diff.created).toHaveLength(2);
    for (const created of split.diff.created) {
      expect(split.diff.ancestry[created]).toEqual([original]);
    }
  });

  it('caso 19 — merge de colineares adjacentes devolve uma parede só', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [wall(levelId, 0, 0, 2000, 0), wall(levelId, 2000, 0, 5000, 0)]);
    const [first, second] = built.model.walls.map((w) => w.id);

    const merged = applyCommand(built.model, {
      type: 'MergeWalls',
      firstId: first,
      secondId: second,
    });

    expect(merged.model.walls).toHaveLength(1);
    expect(merged.model.walls[0].a).toEqual({ x: 0, y: 0 });
    expect(merged.model.walls[0].b).toEqual({ x: 5000, y: 0 });
    expect(merged.diff.ancestry[merged.model.walls[0].id]).toEqual([first, second]);
  });

  it('caso 20 — merge de não colineares é rejeitado', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [wall(levelId, 0, 0, 2000, 0), wall(levelId, 2000, 0, 2000, 3000)]);
    const [first, second] = built.model.walls.map((w) => w.id);

    expect(() =>
      applyCommand(built.model, { type: 'MergeWalls', firstId: first, secondId: second }),
    ).toThrow(/colinear/i);
  });

  it('caso 21b — numa sala, a vizinha que encosta NÃO é candidata a unir', () => {
    // Regressão de um bug de UI: a busca por "vizinha para unir" pegava a
    // primeira parede que compartilhasse uma ponta. Numa sala retangular toda
    // vizinha é PERPENDICULAR, então ela escolhia a errada e o kernel recusava
    // com "Paredes não são colineares" — depois do clique, não antes.
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000)).model;

    const primeira = built.walls[0]; // (0,0) -> (4000,0)
    const encostadas = built.walls.filter(
      (o) =>
        o.id !== primeira.id &&
        [o.a, o.b].some((p) =>
          [primeira.a, primeira.b].some((q) => p.x === q.x && p.y === q.y),
        ),
    );

    // Duas paredes encostam nela, e nenhuma serve para unir.
    expect(encostadas).toHaveLength(2);
    for (const o of encostadas) {
      const colinear =
        areCollinear(primeira.a, primeira.b, o.a) && areCollinear(primeira.a, primeira.b, o.b);
      expect(colinear).toBe(false);
      expect(() =>
        applyCommand(built, { type: 'MergeWalls', firstId: primeira.id, secondId: o.id }),
      ).toThrow(/colinear/i);
    }
  });

  it('caso 21 — split seguido de merge devolve o payload canônico original', () => {
    const { model, levelId } = withLevel();
    const built = applyCommand(model, wall(levelId, 0, 0, 4000, 0));
    const before = canonicalPayload(built.model);

    const split = applyCommand(built.model, {
      type: 'SplitWall',
      wallId: built.model.walls[0].id,
      at: point(1500, 0),
    });
    const [a, b] = split.model.walls.map((w) => w.id);
    const merged = applyCommand(split.model, { type: 'MergeWalls', firstId: a, secondId: b });

    // Os IDs mudaram, mas o payload canônico ignora ID de parede de propósito:
    // o que identifica o desenho é a geometria, não o número de série do objeto.
    expect(canonicalPayload(merged.model)).toBe(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Determinismo, tolerância e undo (casos 22–25)
// ─────────────────────────────────────────────────────────────────────────────

describe('Spike A · determinismo e histórico', () => {
  it('caso 22 — a mesma sala desenhada em ordem diferente tem o mesmo hash', () => {
    const { model, levelId } = withLevel();
    const forward = room(levelId, 0, 0, 4000, 3000);
    const shuffled = [forward[2], forward[0], forward[3], forward[1]];

    const a = applyBatch(model, forward);
    const b = applyBatch(model, shuffled);

    expect(canonicalPayload(a.model)).toBe(canonicalPayload(b.model));
    expect(a.hash).toBe(b.hash);
  });

  it('caso 23 — undo restaura o hash exato do estado anterior', () => {
    const { model, levelId } = withLevel();
    const history = new ModelHistory(model);
    history.apply(wall(levelId, 0, 0, 4000, 0));
    const afterFirst = history.hash;

    history.apply(wall(levelId, 4000, 0, 4000, 3000));
    expect(history.hash).not.toBe(afterFirst);

    history.undo();
    expect(history.hash).toBe(afterFirst);
  });

  it('caso 24 — redo volta ao estado desfeito e comando idempotente não duplica', () => {
    const { model, levelId } = withLevel();
    const history = new ModelHistory(model);
    history.apply(wall(levelId, 0, 0, 4000, 0));
    const beforeSecond = history.hash;

    const second = history.apply(wall(levelId, 4000, 0, 4000, 3000), 'cmd-42');
    history.undo();
    expect(history.hash).toBe(beforeSecond);

    history.redo();
    expect(history.hash).toBe(second.hash);

    // Reenviar o mesmo commandId não cria uma segunda parede.
    const replay = history.apply(wall(levelId, 4000, 0, 4000, 3000), 'cmd-42');
    expect(replay.hash).toBe(second.hash);
    expect(history.current.walls).toHaveLength(2);
  });

  it('caso 25 — mil operações não acumulam deriva: coordenadas seguem inteiras', () => {
    const { model, levelId } = withLevel();
    let current = applyCommand(model, wall(levelId, 0, 0, 4000, 0)).model;
    const wallId = current.walls[0].id;

    // Vai e volta 500 vezes; em ponto flutuante isso acumularia erro.
    for (let i = 0; i < 500; i++) {
      current = applyCommand(current, {
        type: 'MoveVertex',
        wallId,
        end: 'b',
        to: point(4000 + (i % 7), 0),
      }).model;
      current = applyCommand(current, {
        type: 'MoveVertex',
        wallId,
        end: 'b',
        to: point(4000, 0),
      }).model;
    }

    expect(current.walls[0].b).toEqual({ x: 4000, y: 0 });
    expect(Number.isInteger(current.walls[0].b.x)).toBe(true);

    const fresh = applyCommand(model, wall(levelId, 0, 0, 4000, 0));
    expect(snapshotHash(current)).toBe(fresh.hash);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regressão — geometria oblíqua
//
// Os 25 casos acima são todos ortogonais, porque nasceram do helper `room()`. Esse
// viés escondeu um bug: a interseção era arredondada para mm inteiro e depois
// validada por colinearidade EXATA, teste que o próprio arredondamento invalida. Em
// planta ortogonal a interseção cai em inteiro por sorte e nada quebra; em parede
// oblíqua todos os cortes eram descartados e a planta não produzia ambiente nenhum.
// ─────────────────────────────────────────────────────────────────────────────

describe('Spike A · geometria oblíqua', () => {
  function fromSegments(segs: [number, number, number, number][]) {
    const { model, levelId } = withLevel();
    return applyBatch(
      model,
      segs.map(([ax, ay, bx, by]) => wall(levelId, ax, ay, bx, by)),
    ).model;
  }

  it('caso 26 — triângulo fechado oblíquo deriva um ambiente com a área correta', () => {
    const built = fromSegments([
      [0, 0, 6000, 0],
      [6000, 0, 3000, 5000],
      [3000, 5000, 0, 0],
    ]);

    expect(built.spaces).toHaveLength(1);
    expect(built.spaces[0].areaMm2).toBe((6000 * 5000) / 2);
  });

  it('caso 27 — três retas oblíquas que se cruzam formam o triângulo interno', () => {
    // Nenhuma ponta é compartilhada: a face só existe por causa dos cruzamentos.
    // Antes da correção este caso devolvia zero ambientes.
    const built = fromSegments([
      [0, 0, 9000, 3000],
      [0, 3000, 9000, 0],
      [4000, -2000, 4600, 6000],
    ]);

    expect(built.spaces).toHaveLength(1);
    // Área exata em reais é ~18912 mm²; os vértices arredondam para mm.
    expect(built.spaces[0].areaMm2).toBeGreaterThan(18000);
    expect(built.spaces[0].areaMm2).toBeLessThan(19500);
  });

  it('caso 28 — quadrilátero oblíquo irregular fecha e mede certo', () => {
    const built = fromSegments([
      [0, 0, 5000, 1000],
      [5000, 1000, 4000, 6000],
      [4000, 6000, -1000, 5000],
      [-1000, 5000, 0, 0],
    ]);

    expect(built.spaces).toHaveLength(1);
    expect(built.spaces[0].areaMm2).toBe(26000000);
  });

  it('caso 29 — corte oblíquo divide a sala ortogonal em dois ambientes', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      ...room(levelId, 0, 0, 6000, 4000),
      wall(levelId, 0, 0, 6000, 4000), // diagonal completa
    ]);

    expect(built.model.spaces).toHaveLength(2);
    const total = built.model.spaces.reduce((sum, s) => sum + s.areaMm2, 0);
    expect(total).toBe(6000 * 4000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E0 — persistência: o payload canônico é ida E VOLTA
//
// Sem estes casos o payload é só um hash. Para o snapshot ser útil ele precisa
// reconstruir um modelo editável, e o modelo reconstruído precisa re-serializar
// para exatamente o mesmo payload — senão publicar e reabrir muda a planta.
// ─────────────────────────────────────────────────────────────────────────────

describe('E0 · round-trip do payload canônico', () => {
  it('caso 30 — modelo → payload → modelo → payload é idempotente', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      ...room(levelId, 0, 0, 6000, 4000),
      wall(levelId, 3000, 0, 3000, 4000),
    ]).model;

    const payload = canonicalPayload(built);
    const rebuilt = modelFromCanonicalPayload(parseCanonicalPayload(payload));

    expect(canonicalPayload(rebuilt)).toBe(payload);
    expect(snapshotHash(rebuilt)).toBe(snapshotHash(built));
    expect(rebuilt.spaces).toHaveLength(built.spaces.length);
  });

  it('caso 31 — aberturas sobrevivem ao round-trip presas na parede certa', () => {
    const { model, levelId } = withLevel();
    const base = applyBatch(model, room(levelId, 0, 0, 4000, 3000)).model;
    const withOpening = applyCommand(base, {
      type: 'AddOpening',
      wallId: base.walls[1].id,
      kind: 'door',
      offsetMm: 900,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    }).model;

    const payload = canonicalPayload(withOpening);
    const rebuilt = modelFromCanonicalPayload(parseCanonicalPayload(payload));

    expect(rebuilt.openings).toHaveLength(1);
    // A abertura tem que reencontrar a MESMA parede geometricamente, ainda que o id
    // seja outro depois da reconstrução.
    const originalHost = withOpening.walls.find((w) => w.id === withOpening.openings[0].wallId)!;
    const rebuiltHost = rebuilt.walls.find((w) => w.id === rebuilt.openings[0].wallId)!;
    expect(rebuiltHost.a).toEqual(originalHost.a);
    expect(rebuiltHost.b).toEqual(originalHost.b);
    expect(canonicalPayload(rebuilt)).toBe(payload);
  });

  it('caso 32 — com abertura, a ordem de desenho não muda o hash', () => {
    // Este é o caso que o payload antigo errava. Ele guardava `wallId` na abertura,
    // então a mesma planta desenhada em outra ordem gerava outro hash assim que
    // tivesse uma porta. Os goldens não pegavam porque nenhum deles tem abertura.
    const { model, levelId } = withLevel();
    const forward = room(levelId, 0, 0, 4000, 3000);
    const shuffled = [forward[3], forward[1], forward[0], forward[2]];

    const build = (order: Command[]) => {
      const built = applyBatch(model, order).model;
      // Mesma parede geométrica nos dois: a que vai de (0,0) a (4000,0).
      const host = built.walls.find(
        (w) => w.a.x === 0 && w.a.y === 0 && w.b.x === 4000 && w.b.y === 0,
      )!;
      return applyCommand(built, {
        type: 'AddOpening',
        wallId: host.id,
        kind: 'door',
        offsetMm: 1500,
        widthMm: 900,
        heightMm: 2100,
        sillMm: 0,
      }).model;
    };

    expect(snapshotHash(build(shuffled))).toBe(snapshotHash(build(forward)));
  });

  it('caso 33 — o payload não carrega identificador volátil nenhum', () => {
    const { model, levelId } = withLevel();
    const base = applyBatch(model, room(levelId, 0, 0, 4000, 3000)).model;
    const built = applyCommand(base, {
      type: 'AddOpening',
      wallId: base.walls[0].id,
      kind: 'window',
      offsetMm: 500,
      widthMm: 1200,
      heightMm: 1200,
      sillMm: 900,
    }).model;

    const payload = canonicalPayload(built);
    for (const prefix of ['wal_', 'lvl_', 'opn_', 'bnd_', 'spc_', 'seq']) {
      expect(payload).not.toContain(prefix);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Critério de saída do spike
// ─────────────────────────────────────────────────────────────────────────────

describe('Spike A · critério de saída', () => {
  it('SHA-256 próprio bate com os vetores conhecidos', () => {
    // Sem esses vetores o hash poderia estar consistentemente errado e os testes
    // de determinismo passariam mesmo assim.
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('o payload canônico é estável entre execuções repetidas', () => {
    const { model, levelId } = withLevel();
    const build = () => applyBatch(model, [...room(levelId, 0, 0, 4000, 3000)]).model;

    const runs = Array.from({ length: 5 }, build).map(canonicalPayload);
    expect(new Set(runs).size).toBe(1);
  });

  it('o payload canônico não carrega ID volátil nem estado do alocador', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000));
    const payload = canonicalPayload(built.model);

    expect(payload).not.toContain('wal_');
    expect(payload).not.toContain('seq');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Nome de ambiente (etiqueta ancorada)
// ─────────────────────────────────────────────────────────────────────────────

describe('nome de ambiente', () => {
  function salaNomeada(nome = 'Cozinha') {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000)).model;
    return {
      levelId,
      built,
      nomeada: applyCommand(built, {
        type: 'NameSpace',
        spaceId: built.spaces[0].id,
        name: nome,
      }).model,
    };
  }

  it('o nome aparece no ambiente', () => {
    const { nomeada } = salaNomeada();
    expect(nomeada.spaces[0].name).toBe('Cozinha');
  });

  it('O QUE ESTE RECURSO EXISTE PARA FAZER: o nome sobrevive a mudar a geometria', () => {
    // Ambiente é DERIVADO: a cada rederivação os `Space` são recriados, e o id
    // deles é posicional. Um nome guardado por `spaceId` não some — faz coisa
    // pior: reaparece colado no ambiente ERRADO quando a ordem muda.
    //
    // Este caso passa por um estado INTERMEDIÁRIO em que a sala está aberta e
    // não existe ambiente nenhum. A etiqueta é persistente, não derivada, então
    // atravessa o buraco e volta a colar quando a sala fecha de novo.
    const { nomeada } = salaNomeada();
    const direita = nomeada.walls.find((w) => w.a.x === 4000 && w.b.x === 4000)!;
    const topo = nomeada.walls.find((w) => w.a.y === 3000 && w.b.y === 3000)!;

    const aberta = applyCommand(nomeada, {
      type: 'MoveVertex',
      wallId: direita.id,
      end: 'b',
      to: point(6000, 3000),
    }).model;
    expect(aberta.spaces, 'a sala precisa ficar aberta no meio do caminho').toHaveLength(0);
    expect(aberta.labels, 'a etiqueta não pode sumir com o ambiente').toHaveLength(1);

    const maior = applyCommand(aberta, {
      type: 'MoveVertex',
      wallId: topo.id,
      end: 'a',
      to: point(6000, 3000),
    }).model;

    expect(maior.spaces).toHaveLength(1);
    expect(maior.spaces[0].name, 'o nome tinha que ter voltado').toBe('Cozinha');
    // E é outra sala: virou trapézio, base 4,00 e topo 6,00 com 3,00 de altura.
    //   (4,00 + 6,00) / 2 × 3,00 = 15,00 m²
    expect(maior.spaces[0].areaMm2).toBe(15_000_000);
  });

  it('renomear substitui a etiqueta, não empilha outra', () => {
    const { nomeada } = salaNomeada();
    const rebatizada = applyCommand(nomeada, {
      type: 'NameSpace',
      spaceId: nomeada.spaces[0].id,
      name: 'Sala de jantar',
    }).model;

    expect(rebatizada.labels).toHaveLength(1);
    expect(rebatizada.spaces[0].name).toBe('Sala de jantar');
  });

  it('nome vazio remove a etiqueta', () => {
    const { nomeada } = salaNomeada();
    const limpa = applyCommand(nomeada, {
      type: 'NameSpace',
      spaceId: nomeada.spaces[0].id,
      name: '   ',
    }).model;

    expect(limpa.labels).toHaveLength(0);
    expect(limpa.spaces[0].name).toBeUndefined();
  });

  it('o nome é CONTEÚDO: renomear muda o hash', () => {
    // Se não mudasse, publicar depois de renomear seria idempotente pela regra
    // (ramo, revisão, hash) e o nome nunca chegaria ao snapshot.
    const { built, nomeada } = salaNomeada();
    expect(snapshotHash(nomeada)).not.toBe(snapshotHash(built));
  });

  it('o nome atravessa o ciclo canônico de ida e volta', () => {
    const { nomeada } = salaNomeada();
    const voltou = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(nomeada)));

    expect(voltou.spaces[0].name).toBe('Cozinha');
    expect(snapshotHash(voltou)).toBe(snapshotHash(nomeada));
  });

  it('etiqueta não vaza para o ambiente vizinho', () => {
    const { model, levelId } = withLevel();
    const duas = applyBatch(model, [
      ...room(levelId, 0, 0, 6000, 3000),
      wall(levelId, 3000, 0, 3000, 3000),
    ]).model;

    const nomeada = applyCommand(duas, {
      type: 'NameSpace',
      spaceId: duas.spaces[0].id,
      name: 'Banheiro',
    }).model;

    expect(nomeada.spaces.filter((s) => s.name === 'Banheiro')).toHaveLength(1);
    expect(nomeada.spaces.filter((s) => s.name === undefined)).toHaveLength(1);
  });

  it('a âncora cai dentro mesmo num ambiente em "L"', () => {
    // O centroide de um "L" cai FORA dele. Se a âncora fosse o centroide, o nome
    // sumiria na primeira rederivação — e sem aviso.
    const emL = [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 2000 },
      { x: 2000, y: 2000 },
      { x: 2000, y: 6000 },
      { x: 0, y: 6000 },
    ];
    const p = interiorPoint(emL);
    expect(pointInPolygon(emL, p), `âncora ${p.x},${p.y} caiu fora do L`).toBe(true);
  });

  it('a âncora não cai dentro de um buraco', () => {
    const anel = [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 10000 },
      { x: 0, y: 10000 },
    ];
    const buraco = [
      { x: 2000, y: 2000 },
      { x: 8000, y: 2000 },
      { x: 8000, y: 8000 },
      { x: 2000, y: 8000 },
    ];
    const p = interiorPoint(anel, [buraco]);

    expect(pointInPolygon(anel, p)).toBe(true);
    expect(pointInPolygon(buraco, p), 'a âncora caiu no vazio central').toBe(false);
  });
});
