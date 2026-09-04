/**
 * Identidade persistente de elemento (`uid`) — 04/09/2026.
 *
 * O que este arquivo TRAVA, em ordem de importância:
 *
 *  1. o uid fica FORA do hash — dois desenhos iguais com uids diferentes têm o
 *     mesmo `snapshotHash`, e a parte hasheada do payload não contém a palavra
 *     `identity` nem `uid`;
 *  2. o uid SOBREVIVE ao round-trip payload → modelo → payload;
 *  3. snapshot ANTIGO (sem `identity`) recebe uids determinísticos: duas leituras
 *     dão os mesmos, todos em formato válido, e o hash não muda;
 *  4. os comandos respeitam a política: criar gera, copiar gera NOVO, dividir
 *     mantém no fragmento de `a`, unir mantém o da primeira;
 *  5. os invariantes recusam uid duplicado ou fora do formato.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  EH_UID,
  applyCommand,
  canonicalPayload,
  emptyModel,
  hashDePayload,
  modelFromCanonicalPayload,
  novoUid,
  parseCanonicalPayload,
  payloadDoHash,
  rotuloCurto,
  snapshotHash,
  uidDeTeste,
  uidDeterministico,
  usarGeradorDeUid,
  type BlueprintModel,
  type CanonicalPayload,
  type Command,
} from '../utils/blueprintKernel';
import type { Wall } from '../utils/blueprintKernel';

afterEach(() => usarGeradorDeUid(null));

function aplicar(model: BlueprintModel, ...comandos: Command[]): BlueprintModel {
  let atual = model;
  for (const c of comandos) atual = applyCommand(atual, c).model;
  return atual;
}

/** Sala 4×3 m com uma porta na parede de baixo. */
function sala(): BlueprintModel {
  let m = aplicar(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  });
  const lvl = m.levels[0].id;
  const parede = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId: lvl,
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    thicknessMm: 150,
    heightMm: 2800,
  });
  m = aplicar(
    m,
    parede(0, 0, 4000, 0),
    parede(4000, 0, 4000, 3000),
    parede(4000, 3000, 0, 3000),
    parede(0, 3000, 0, 0),
  );
  const baixo = m.walls.find((w) => w.a.y === 0 && w.b.y === 0)!;
  return aplicar(m, {
    type: 'AddOpening',
    wallId: baixo.id,
    kind: 'door',
    offsetMm: 1000,
    widthMm: 800,
    heightMm: 2100,
    sillMm: 0,
  });
}

describe('identity.ts · geração', () => {
  it('novoUid é UUID v4 e não repete', () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const u = novoUid();
      expect(u).toMatch(EH_UID);
      expect(u[14]).toBe('4');
      vistos.add(u);
    }
    expect(vistos.size).toBe(2000);
  });

  it('uidDeterministico é estável, válido e marcado com a versão 8', () => {
    const a = uidDeterministico('abc:walls:0');
    const b = uidDeterministico('abc:walls:0');
    const c = uidDeterministico('abc:walls:1');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(EH_UID);
    expect(a[14]).toBe('8');
  });

  it('uidDeTeste e rotuloCurto', () => {
    expect(uidDeTeste(42)).toBe('00000000-0000-4000-8000-000000000042');
    expect(uidDeTeste(42)).toMatch(EH_UID);
    expect(rotuloCurto('1a2b3c4d-0000-4000-8000-000000000000', 'wall')).toBe('P-1A2B');
    expect(rotuloCurto('1a2b3c4d-0000-4000-8000-000000000000', 'opening')).toBe('V-1A2B');
  });
});

describe('canonical · identidade fora do hash', () => {
  it('a parte hasheada não contém identidade', () => {
    const m = sala();
    const geometria = payloadDoHash(m);
    expect(geometria).not.toContain('identity');
    expect(geometria).not.toContain('uid');
    expect(snapshotHash(m)).toBe(
      // sha256 da geometria, e de mais nada — `hashDePayload` do payload
      // completo tem de dar o mesmo.
      hashDePayload(parseCanonicalPayload(canonicalPayload(m))),
    );
  });

  it('o payload completo traz um array de uids por família, paralelo ao geométrico', () => {
    const m = sala();
    const p = parseCanonicalPayload(canonicalPayload(m));
    expect(p.identity?.v).toBe(1);
    expect(p.identity?.levels).toHaveLength(p.levels.length);
    expect(p.identity?.walls).toHaveLength(p.walls.length);
    expect(p.identity?.openings).toHaveLength(p.openings.length);
    expect(p.identity?.spaces).toHaveLength(p.spaces.length);
    expect(p.identity?.structures).toEqual([]);
    // Todo uid do modelo aparece, e nenhum outro.
    expect(new Set(p.identity!.walls)).toEqual(new Set(m.walls.map((w) => w.uid)));
    expect(p.identity!.openings).toEqual([m.openings[0].uid]);
    // Ambiente sem etiqueta não tem identidade.
    expect(p.identity!.spaces).toEqual([null]);
  });

  it('mesmo desenho, uids diferentes → mesmo hash, payloads diferentes', () => {
    const a = sala();
    const b = sala();
    expect(a.walls.map((w) => w.uid)).not.toEqual(b.walls.map((w) => w.uid));
    expect(snapshotHash(a)).toBe(snapshotHash(b));
    expect(payloadDoHash(a)).toBe(payloadDoHash(b));
    expect(canonicalPayload(a)).not.toBe(canonicalPayload(b));
  });

  it('o uid não decide a ordem: duas paredes iguais em tudo menos na altura', () => {
    // Mesmo nível, mesmo eixo, mesma espessura — a ordem tem que vir da altura
    // (via serialização), nunca do uid. Se viesse do uid, trocar os uids
    // reordenaria a geometria e mudaria o hash.
    const base = aplicar(emptyModel(), {
      type: 'AddLevel',
      name: 'T',
      elevationMm: 0,
      defaultHeightMm: 2800,
    });
    const lvl = base.levels[0].id;
    const duas = (uids: [string, string]) => {
      usarGeradorDeUid(() => uids.shift()!);
      return aplicar(
        base,
        { type: 'AddWall', levelId: lvl, a: { x: 0, y: 0 }, b: { x: 3000, y: 0 }, thicknessMm: 150, heightMm: 2800 },
        { type: 'AddWall', levelId: lvl, a: { x: 0, y: 0 }, b: { x: 3000, y: 0 }, thicknessMm: 150, heightMm: 3000 },
      );
    };
    const x = duas([uidDeTeste(1), uidDeTeste(2)]);
    const y = duas([uidDeTeste(2), uidDeTeste(1)]);
    expect(snapshotHash(x)).toBe(snapshotHash(y));
    const px = parseCanonicalPayload(canonicalPayload(x));
    const py = parseCanonicalPayload(canonicalPayload(y));
    // A geometria saiu na MESMA ordem nos dois (2800 antes de 3000)…
    expect(px.walls.map((w) => w.heightMm)).toEqual([2800, 3000]);
    expect(py.walls.map((w) => w.heightMm)).toEqual([2800, 3000]);
    // …e a identidade acompanhou cada parede, não a posição.
    expect(px.identity!.walls).toEqual([uidDeTeste(1), uidDeTeste(2)]);
    expect(py.identity!.walls).toEqual([uidDeTeste(2), uidDeTeste(1)]);
  });

  it('round-trip preserva os uids e o hash', () => {
    const m = sala();
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    expect(snapshotHash(volta)).toBe(snapshotHash(m));
    expect(new Set(volta.walls.map((w) => w.uid))).toEqual(new Set(m.walls.map((w) => w.uid)));
    expect(volta.openings[0].uid).toBe(m.openings[0].uid);
    expect(volta.levels[0].uid).toBe(m.levels[0].uid);
    // E o payload re-serializado é byte a byte o mesmo — identidade inclusa.
    expect(canonicalPayload(volta)).toBe(canonicalPayload(m));
  });

  it('snapshot ANTIGO (sem identity): uids determinísticos, iguais em duas leituras, hash intacto', () => {
    const m = sala();
    const antigo = parseCanonicalPayload(canonicalPayload(m));
    delete antigo.identity;
    const json = JSON.stringify(antigo);

    const l1 = modelFromCanonicalPayload(parseCanonicalPayload(json));
    const l2 = modelFromCanonicalPayload(parseCanonicalPayload(json));

    expect(snapshotHash(l1)).toBe(snapshotHash(m));
    for (const w of l1.walls) {
      expect(w.uid).toMatch(EH_UID);
      expect(w.uid[14]).toBe('8'); // derivado, não aleatório
    }
    expect(l1.walls.map((w) => w.uid)).toEqual(l2.walls.map((w) => w.uid));
    expect(l1.openings[0].uid).toBe(l2.openings[0].uid);
    expect(l1.levels[0].uid).toBe(l2.levels[0].uid);
    // Derivados são distintos entre si.
    expect(new Set(l1.walls.map((w) => w.uid)).size).toBe(l1.walls.length);
    // E o payload gravado a partir daí já carrega identidade.
    expect(parseCanonicalPayload(canonicalPayload(l1)).identity?.walls).toEqual(
      l1.walls.length ? expect.arrayContaining(l1.walls.map((w) => w.uid)) : [],
    );
  });

  it('identity com comprimento errado numa família é tratada como ausente só nela', () => {
    const m = sala();
    const p = parseCanonicalPayload(canonicalPayload(m));
    const adulterado: CanonicalPayload = {
      ...p,
      identity: { ...p.identity!, walls: p.identity!.walls.slice(1) },
    };
    const lido = modelFromCanonicalPayload(adulterado);
    expect(snapshotHash(lido)).toBe(snapshotHash(m));
    // Paredes: derivados (versão 8). Abertura: preservada.
    for (const w of lido.walls) expect(w.uid[14]).toBe('8');
    expect(lido.openings[0].uid).toBe(m.openings[0].uid);
  });

  it('hashDePayload ignora a ordem das chaves (JSONB reordena)', () => {
    const m = sala();
    const p = parseCanonicalPayload(canonicalPayload(m));
    // Reordena as chaves de topo E as de uma parede — é o que o Postgres faz
    // ao gravar JSONB (ordena por tamanho, depois bytes).
    const inverter = <T extends object>(o: T): T =>
      Object.fromEntries(Object.entries(o).reverse()) as T;
    const embaralhado: CanonicalPayload = inverter({
      ...p,
      walls: p.walls.map((w) => inverter({ ...w, a: inverter(w.a) })),
    });
    expect(JSON.stringify(embaralhado)).not.toBe(JSON.stringify(p));
    expect(hashDePayload(embaralhado)).toBe(snapshotHash(m));
  });
});

describe('commands · política de uid', () => {
  it('criar gera uid válido em toda família', () => {
    const m = sala();
    const lvl = m.levels[0].id;
    const com = aplicar(
      m,
      { type: 'AddBoundary', levelId: lvl, a: { x: -1000, y: -1000 }, b: { x: 9000, y: -1000 } },
      { type: 'AddStructural', levelId: lvl, kind: 'PILAR', pontos: [{ x: 2000, y: 1500 }], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800 },
      { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Sala' },
    );
    expect(com.levels[0].uid).toMatch(EH_UID);
    expect(com.boundaries[0].uid).toMatch(EH_UID);
    expect(com.structures[0].uid).toMatch(EH_UID);
    expect(com.labels[0].uid).toMatch(EH_UID);
    // O ambiente herda a identidade da etiqueta que o nomeia.
    expect(com.spaces[0].labelUid).toBe(com.labels[0].uid);
    const p = parseCanonicalPayload(canonicalPayload(com));
    expect(p.identity!.spaces).toEqual([com.labels[0].uid]);
    expect(p.identity!.structures).toEqual([com.structures[0].uid]);
  });

  it('editar preserva o uid', () => {
    const m = sala();
    const w = m.walls[0];
    const depois = aplicar(m, { type: 'SetThickness', wallId: w.id, thicknessMm: 200 });
    expect(depois.walls.find((x) => x.id === w.id)!.uid).toBe(w.uid);
  });

  it('DuplicateEntities: a cópia tem uid NOVO, o original mantém o seu', () => {
    const m = sala();
    const lvl = m.levels[0].id;
    const baixo = m.walls.find((w) => w.a.y === 0 && w.b.y === 0)!;
    const depois = aplicar(m, {
      type: 'DuplicateEntities',
      levelId: lvl,
      delta: { x: 0, y: 6000 },
      wallIds: [baixo.id],
      boundaryIds: [],
      openings: [],
    });
    const original = depois.walls.find((w) => w.id === baixo.id)!;
    const copia = depois.walls.find((w) => w.a.y === 6000)!;
    expect(original.uid).toBe(baixo.uid);
    expect(copia.uid).toMatch(EH_UID);
    expect(copia.uid).not.toBe(baixo.uid);
    // A porta acompanhou a parede, também com uid novo.
    const portaCopiada = depois.openings.find((o) => o.wallId === copia.id)!;
    expect(portaCopiada.uid).not.toBe(m.openings[0].uid);
  });

  it('DuplicateLevel: nível e peças copiadas ganham uids novos', () => {
    const m = sala();
    const depois = aplicar(m, {
      type: 'DuplicateLevel',
      levelId: m.levels[0].id,
      novoNome: '1º',
      elevationMm: 2800,
    });
    const todos = [
      ...depois.levels.map((l) => l.uid),
      ...depois.walls.map((w) => w.uid),
      ...depois.openings.map((o) => o.uid),
    ];
    expect(new Set(todos).size).toBe(todos.length);
    expect(depois.levels[1].uid).not.toBe(depois.levels[0].uid);
  });

  it('SplitWall: o fragmento que contém `a` mantém o uid; o outro é novo', () => {
    const m = sala();
    const direita = m.walls.find((w) => w.a.x === 4000 && w.b.x === 4000)!;
    const depois = aplicar(m, { type: 'SplitWall', wallId: direita.id, at: { x: 4000, y: 1500 } });
    const comA = depois.walls.find((w) => w.a.x === direita.a.x && w.a.y === direita.a.y && w.b.y === 1500)!;
    const outro = depois.walls.find((w) => w.a.y === 1500 && w.b.y === direita.b.y)!;
    expect(comA.uid).toBe(direita.uid);
    expect(outro.uid).toMatch(EH_UID);
    expect(outro.uid).not.toBe(direita.uid);
  });

  it('MergeWalls: a parede unida fica com o uid da primeira', () => {
    const m = sala();
    const direita = m.walls.find((w) => w.a.x === 4000 && w.b.x === 4000)!;
    const dividido = aplicar(m, { type: 'SplitWall', wallId: direita.id, at: { x: 4000, y: 1500 } });
    const [p1, p2] = dividido.walls.filter((w) => w.a.x === 4000 && w.b.x === 4000);
    const unido = aplicar(dividido, { type: 'MergeWalls', firstId: p1.id, secondId: p2.id });
    const resultado = unido.walls.find((w) => w.a.x === 4000 && w.b.x === 4000)!;
    expect(resultado.uid).toBe(p1.uid);
    expect(unido.walls.filter((w) => w.uid === p2.uid)).toHaveLength(0);
  });

  it('CutWallAtStructural com dois trechos: o de `a` mantém, o outro é novo', () => {
    const m = sala();
    const lvl = m.levels[0].id;
    const baixo = m.walls.find((w) => w.a.y === 0 && w.b.y === 0)!;
    const comPilar = aplicar(m, {
      type: 'AddStructural',
      levelId: lvl,
      kind: 'PILAR',
      pontos: [{ x: 3000, y: 0 }],
      larguraMm: 300,
      profundidadeMm: 300,
      alturaMm: 2800,
    });
    const cortado = aplicar(comPilar, {
      type: 'CutWallAtStructural',
      wallId: baixo.id,
      structuralId: comPilar.structures[0].id,
    });
    const trechos = cortado.walls.filter((w) => w.a.y === 0 && w.b.y === 0);
    expect(trechos).toHaveLength(2);
    const comA = trechos.find((w) => w.a.x === 0)!;
    const outro = trechos.find((w) => w.a.x !== 0)!;
    expect(comA.uid).toBe(baixo.uid);
    expect(outro.uid).not.toBe(baixo.uid);
  });
});

describe('invariantes', () => {
  it('DUPLICATE_UID: dois elementos com o mesmo uid derrubam o comando', () => {
    const m = sala();
    const forjado: BlueprintModel = {
      ...m,
      walls: m.walls.map((w, i) => (i === 1 ? { ...w, uid: m.walls[0].uid } : w)) as Wall[],
    };
    expect(() =>
      applyCommand(forjado, { type: 'SetThickness', wallId: m.walls[2].id, thicknessMm: 200 }),
    ).toThrow(/DUPLICATE_UID|repete o uid/);
  });

  it('BAD_UID: uid fora do formato é recusado', () => {
    const m = sala();
    const forjado: BlueprintModel = {
      ...m,
      walls: m.walls.map((w, i) => (i === 0 ? { ...w, uid: 'nao-e-uuid' } : w)) as Wall[],
    };
    expect(() =>
      applyCommand(forjado, { type: 'SetThickness', wallId: m.walls[2].id, thicknessMm: 200 }),
    ).toThrow(/BAD_UID|fora do formato/);
  });
});
