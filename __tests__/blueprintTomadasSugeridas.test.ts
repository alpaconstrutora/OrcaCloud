/**
 * TOMADAS SUGERIDAS e TIPO DO AMBIENTE — a Fatia 1 da distribuição (10/09/2026).
 *
 * *"o sistema pode inserir uma tomada no banheiro e o projetista tem o trabalho
 * apenas de mover para o local adequado"*
 *
 * ─── ⚠️ O QUE A MARCA `sugerida` GARANTE ────────────────────────────────────
 *
 * 1. Nasce com o ponto que o sistema pôs, e só com ele.
 * 2. MOVER limpa — porque mover é decidir. Não há botão para "confirmar uma".
 * 3. Vai para o canônico só quando `true`; ausente é o estado de todo ponto
 *    que uma pessoa pôs, e escrevê-lo como `false` mudaria o hash do acervo.
 * 4. A parede entre dois ambientes tem DUAS faces; a externa, uma.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import {
  COTA_TOMADA_SUGERIDA_MM,
  comandosDeTomadasSugeridas,
  distribuirAoLongo,
  etiquetaDoAmbiente,
  ladosDaParede,
  ladosDePiso,
} from '../utils/blueprintDistribuicao';

/** Duas salas lado a lado, 4 × 4 cada, dividindo a parede x = 4000. */
function duasSalas(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId: t,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: 150,
    heightMm: 2800,
  });
  return applyBatch(base, [
    p(0, 0, 8000, 0),
    p(8000, 0, 8000, 4000),
    p(8000, 4000, 0, 4000),
    p(0, 4000, 0, 0),
    p(4000, 0, 4000, 4000),
  ]).model;
}

function comSugeridas(n = 3): { m: BlueprintModel; antes: BlueprintModel } {
  const antes = duasSalas();
  const sala = antes.spaces[0];
  const lados = ladosDePiso(sala, antes.walls);
  const pontos = distribuirAoLongo(lados, n, antes.walls, antes.openings);
  const m = applyBatch(antes, comandosDeTomadasSugeridas(antes.levels[0].id, pontos)).model;
  return { m, antes };
}

describe('sugeridas · o que nasce', () => {
  it('cada ponto é TUG, na cota baixa, marcado como sugerido', () => {
    const { m } = comSugeridas(3);
    expect(m.terminais).toHaveLength(3);
    for (const t of m.terminais) {
      expect(t.disciplina).toBe('ELETRICA');
      expect(t.tipoEletrico).toBe('TUG');
      expect(t.cotaMm).toBe(COTA_TOMADA_SUGERIDA_MM);
      expect(t.sugerida).toBe(true);
    }
  });

  it('⚠️ o lote inteiro é UM passo: um único applyBatch, n comandos', () => {
    const antes = duasSalas();
    const lados = ladosDePiso(antes.spaces[0], antes.walls);
    const cmds = comandosDeTomadasSugeridas(
      antes.levels[0].id,
      distribuirAoLongo(lados, 4, antes.walls, antes.openings),
    );
    expect(cmds).toHaveLength(4);
    expect(cmds.every((c) => c.type === 'AddTerminal')).toBe(true);
  });

  it('o ponto que uma PESSOA põe não é sugerido', () => {
    const m = duasSalas();
    const depois = applyCommand(m, {
      type: 'AddTerminal',
      levelId: m.levels[0].id,
      disciplina: 'ELETRICA',
      tipo: 'TUG',
      at: point(1000, 75),
      cotaMm: 300,
      tipoEletrico: 'TUG',
    }).model;
    expect(depois.terminais[0].sugerida ?? null).toBeNull();
  });
});

describe('sugeridas · mover é decidir', () => {
  it('⚠️ TranslateEntities limpa a marca do ponto movido — e só dele', () => {
    const { m } = comSugeridas(3);
    const [primeiro, ...outros] = m.terminais;
    const depois = applyCommand(m, {
      type: 'TranslateEntities',
      wallIds: [],
      boundaryIds: [],
      structuralIds: [],
      terminalIds: [primeiro.id],
      delta: point(200, 0),
      manterJuncoes: false,
    }).model;
    expect(depois.terminais.find((t) => t.id === primeiro.id)?.sugerida ?? null).toBeNull();
    for (const o of outros) {
      expect(depois.terminais.find((t) => t.id === o.id)?.sugerida).toBe(true);
    }
  });

  it('"Aceitar" é SetTerminalProps sugerida:false — o ponto não se mexe', () => {
    const { m } = comSugeridas(1);
    const t = m.terminais[0];
    const depois = applyCommand(m, { type: 'SetTerminalProps', terminalId: t.id, sugerida: false })
      .model;
    expect(depois.terminais[0].sugerida ?? null).toBeNull();
    expect(depois.terminais[0].at).toEqual(t.at);
  });
});

describe('sugeridas · no canônico', () => {
  it('⚠️ `true` vai; ausente NÃO vira `false` — o hash do acervo não muda por isto', () => {
    const { m } = comSugeridas(2);
    const payload = JSON.parse(canonicalPayload(m));
    expect(payload.terminais.every((t: { sugerida?: boolean }) => t.sugerida === true)).toBe(true);

    const aceito = applyBatch(
      m,
      m.terminais.map((t) => ({ type: 'SetTerminalProps' as const, terminalId: t.id, sugerida: false })),
    ).model;
    const payloadAceito = JSON.parse(canonicalPayload(aceito));
    expect(payloadAceito.terminais.every((t: object) => !('sugerida' in t))).toBe(true);
  });

  it('sobrevive à ida e volta', () => {
    const { m } = comSugeridas(2);
    const volta = modelFromCanonicalPayload(JSON.parse(canonicalPayload(m)));
    expect(volta.terminais.map((t) => t.sugerida)).toEqual([true, true]);
  });
});

describe('tipo do ambiente', () => {
  it('NameSpace com tipo cria a etiqueta classificada; SetSpaceLabelProps reclassifica', () => {
    const m = duasSalas();
    const sala = m.spaces[0];
    const nomeado = applyCommand(m, {
      type: 'NameSpace',
      spaceId: sala.id,
      name: 'Banho',
      tipoDeAmbiente: 'BANHEIRO',
    }).model;
    const etiqueta = etiquetaDoAmbiente(nomeado.spaces[0], nomeado.labels);
    expect(etiqueta?.tipoDeAmbiente).toBe('BANHEIRO');

    const re = applyCommand(nomeado, {
      type: 'SetSpaceLabelProps',
      labelId: etiqueta!.id,
      tipoDeAmbiente: 'COZINHA_SERVICO',
    }).model;
    expect(etiquetaDoAmbiente(re.spaces[0], re.labels)?.tipoDeAmbiente).toBe('COZINHA_SERVICO');
  });

  it('⚠️ renomear sem falar em tipo NÃO apaga o tipo', () => {
    const m = duasSalas();
    const nomeado = applyCommand(m, {
      type: 'NameSpace',
      spaceId: m.spaces[0].id,
      name: 'Banho',
      tipoDeAmbiente: 'BANHEIRO',
    }).model;
    const renomeado = applyCommand(nomeado, {
      type: 'NameSpace',
      spaceId: nomeado.spaces[0].id,
      name: 'Lavabo',
    }).model;
    expect(etiquetaDoAmbiente(renomeado.spaces[0], renomeado.labels)?.tipoDeAmbiente).toBe(
      'BANHEIRO',
    );
  });

  it('vai e volta pelo canônico; ausente fica ausente', () => {
    const m = duasSalas();
    const nomeado = applyCommand(m, {
      type: 'NameSpace',
      spaceId: m.spaces[0].id,
      name: 'Banho',
      tipoDeAmbiente: 'BANHEIRO',
    }).model;
    const payload = JSON.parse(canonicalPayload(nomeado));
    expect(payload.labels[0].tipoDeAmbiente).toBe('BANHEIRO');
    const volta = modelFromCanonicalPayload(payload);
    expect(volta.labels[0].tipoDeAmbiente).toBe('BANHEIRO');

    const semTipo = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Sala' })
      .model;
    expect('tipoDeAmbiente' in JSON.parse(canonicalPayload(semTipo)).labels[0]).toBe(false);
  });
});

describe('faces de uma parede', () => {
  it('⚠️ a parede ENTRE duas salas tem duas faces, uma por ambiente', () => {
    const m = duasSalas();
    const meio = m.walls.find((w) => w.a.x === 4000 && w.b.x === 4000)!;
    const faces = ladosDaParede(m, meio.id, m.levels[0].id);
    expect(faces).toHaveLength(2);
    expect(new Set(faces.map((f) => f.spaceId)).size).toBe(2);
    // Uma face de cada lado do eixo x = 4000.
    const xs = faces.map((f) => f.a.x).sort((a, b) => a - b);
    expect(xs).toEqual([3925, 4075]);
  });

  it('a parede EXTERNA tem uma face só', () => {
    const m = duasSalas();
    const baixo = m.walls[0]; // y = 0, corre pelas duas salas
    const faces = ladosDaParede(m, baixo.id, m.levels[0].id);
    // Duas salas encostam nela — uma face por sala, ambas do lado de dentro.
    expect(faces).toHaveLength(2);
    expect(faces.every((f) => f.a.y === 75 && f.b.y === 75)).toBe(true);
  });

  it('parede que não fecha ambiente: nenhuma face', () => {
    const m = duasSalas();
    const solta = applyCommand(m, {
      type: 'AddWall',
      levelId: m.levels[0].id,
      a: point(10000, 0),
      b: point(12000, 0),
      thicknessMm: 150,
      heightMm: 2800,
    }).model;
    const w = solta.walls[solta.walls.length - 1];
    expect(ladosDaParede(solta, w.id, solta.levels[0].id)).toEqual([]);
  });

  it('distribuir numa face só põe os pontos NAQUELA face', () => {
    const m = duasSalas();
    const meio = m.walls.find((w) => w.a.x === 4000 && w.b.x === 4000)!;
    const faces = ladosDaParede(m, meio.id, m.levels[0].id);
    const esquerda = faces.find((f) => f.a.x === 3925)!;
    const pts = distribuirAoLongo([esquerda], 3, m.walls, m.openings);
    expect(pts).toHaveLength(3);
    expect(pts.every((p) => p.at.x === 3925)).toBe(true);
  });
});
