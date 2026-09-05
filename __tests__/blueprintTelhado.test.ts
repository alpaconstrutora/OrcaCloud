/**
 * TELHADO — a água como plano inclinado (kernel 0.12.0).
 *
 * Segue o molde que este repositório usa para família nova (o bloco do grupo
 * Estrutural em `blueprintEstrutural.test.ts`). São sete perguntas, e a sexta é
 * a que mais importa:
 *
 *   1. o kernel aceita a água e a coloca no plano certo;
 *   2. efeito geométrico — ÁREA REAL conferida à mão, que é o número da compra;
 *   3. efeito de REGRA — o telhado NÃO mexe nos ambientes;
 *   4. conta separado nos totais;
 *   5. sobrevive ao round-trip do payload;
 *   6. planta SEM telhado continua com a MESMA FORMA canônica;   ← a guarda
 *   7. os invariantes recusam o que produziria número errado calado.
 *
 * ⚠️ Todo valor esperado aqui está CALCULADO À MÃO no comentário, nunca copiado
 * da saída. Teste que aceita o que o código produziu só mede "não mudou", e o
 * erro que interessa em quantitativo é o que já nasce errado.
 */

import { describe, expect, it } from 'vitest';
import {
  AGUA_INCLINACAO_MAX_PCT,
  applyBatch,
  applyCommand,
  alturaNaAgua,
  canonicalPayload,
  computeQuantities,
  contornoDaAguaEm3d,
  emptyModel,
  medirAgua,
  modelFromCanonicalPayload,
  normalDaAgua,
  parseCanonicalPayload,
  payloadDoHash,
  perfilDaAguaNoPlano,
  planoDaAgua,
  point,
  polygonArea,
  snapshotHash,
  type Agua,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';

const H = 2800;

function comNivel(): { model: BlueprintModel; levelId: string } {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  return { model: r.model, levelId: r.model.levels[0].id };
}

/** Retângulo 6,00 × 4,00 m, anti-horário, começando na origem. */
const RETANGULO = [point(0, 0), point(6000, 0), point(6000, 4000), point(0, 4000)];

function comAgua(over: Partial<Agua> = {}): { model: BlueprintModel; agua: Agua } {
  const { model, levelId } = comNivel();
  const r = applyCommand(model, {
    type: 'AddAgua',
    levelId,
    pontos: RETANGULO,
    inclinacaoPct: 30,
    ...over,
  } as Command);
  const agua = { ...r.model.roofs[0], ...over };
  return { model: r.model, agua };
}

/** Uma água solta, sem passar pelos comandos — para exercitar só a geometria. */
function agua(over: Partial<Agua> = {}): Agua {
  return {
    id: 'agu_0001',
    uid: '00000000-0000-4000-8000-000000000001',
    levelId: 'lvl_0001',
    pontos: RETANGULO,
    beiralIndex: 0,
    inclinacaoPct: 30,
    baseMm: 0,
    espessuraMm: 120,
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. O plano
// ─────────────────────────────────────────────────────────────────────────────

describe('telhado · 1. a água é um PLANO', () => {
  it('a cota sobe do beiral para dentro, e é ZERO no beiral', () => {
    // Beiral é o lado 0: (0,0) → (6000,0). A água sobe em +y, a 30%.
    //   d = 0    → z = 0
    //   d = 4000 → z = 4000 × 0,30 = 1200 mm
    const a = agua();
    expect(alturaNaAgua(a, point(0, 0))).toBe(0);
    expect(alturaNaAgua(a, point(6000, 0))).toBe(0);
    expect(alturaNaAgua(a, point(0, 4000))).toBeCloseTo(1200, 6);
    expect(alturaNaAgua(a, point(6000, 4000))).toBeCloseTo(1200, 6);
    // No meio da rampa, metade: d = 2000 → 600 mm.
    expect(alturaNaAgua(a, point(3000, 2000))).toBeCloseTo(600, 6);
  });

  it('`baseMm` LEVANTA a água inteira, sem mudar o caimento', () => {
    // Beiral a 2,80 m (topo da parede): o ponto alto vai a 2800 + 1200 = 4000.
    const a = agua({ baseMm: 2800 });
    expect(alturaNaAgua(a, point(0, 0))).toBe(2800);
    expect(alturaNaAgua(a, point(0, 4000))).toBeCloseTo(4000, 6);
  });

  it('É UM PLANO, e não uma interpolação entre vértices', () => {
    // A prova: num "L" (não convexo), a cota de QUALQUER ponto é função afim de
    // (x, y). Se fosse interpolação por vértice, o vértice reentrante puxaria a
    // superfície e o ponto médio não bateria com a fórmula.
    const emL = agua({
      pontos: [
        point(0, 0),
        point(6000, 0),
        point(6000, 2000),
        point(3000, 2000),
        point(3000, 4000),
        point(0, 4000),
      ],
    });
    // z = d × 0,30, com d = y. Vale em vértice, em aresta e no miolo.
    for (const [x, y] of [
      [0, 0],
      [6000, 2000],
      [3000, 4000],
      [1500, 1500],
      [4500, 500],
    ] as const) {
      expect(alturaNaAgua(emL, point(x, y)), `(${x},${y})`).toBeCloseTo(y * 0.3, 6);
    }
  });

  it('O SENTIDO DO ANEL NÃO INVERTE O TELHADO', () => {
    // A armadilha que `anelRecuado` já tinha: com a normal fixa, metade das
    // águas subiria para FORA do polígono. Aqui o MESMO retângulo é desenhado no
    // sentido horário, e o beiral continua sendo o lado (0,0)→(6000,0) — que no
    // anel invertido é o lado de índice 3.
    const horario = agua({
      pontos: [point(0, 0), point(0, 4000), point(6000, 4000), point(6000, 0)],
      beiralIndex: 3,
    });
    expect(alturaNaAgua(horario, point(0, 0))).toBe(0);
    expect(alturaNaAgua(horario, point(0, 4000))).toBeCloseTo(1200, 6);
    // E a normal do plano aponta para cima nos dois sentidos.
    expect(normalDaAgua(horario).z).toBeGreaterThan(0);
    expect(normalDaAgua(agua()).z).toBeGreaterThan(0);
  });

  it('telhado PLANO (0%) é legítimo: laje impermeabilizada', () => {
    const plana = agua({ inclinacaoPct: 0, baseMm: 2800 });
    expect(alturaNaAgua(plana, point(0, 4000))).toBe(2800);
    const m = medirAgua(plana);
    expect(m.areaRealM2).toBeCloseTo(m.areaProjetadaM2, 9);
    expect(m.inclinacaoGraus).toBe(0);
  });

  it('a normal é unitária e perpendicular ao plano', () => {
    const a = agua();
    const n = normalDaAgua(a);
    expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 9);
    // Perpendicular: o produto escalar com dois vetores do próprio plano é zero.
    const p3d = contornoDaAguaEm3d(a);
    const v1 = { x: p3d[1].x - p3d[0].x, y: p3d[1].y - p3d[0].y, z: p3d[1].z - p3d[0].z };
    const v2 = { x: p3d[3].x - p3d[0].x, y: p3d[3].y - p3d[0].y, z: p3d[3].z - p3d[0].z };
    expect(n.x * v1.x + n.y * v1.y + n.z * v1.z).toBeCloseTo(0, 6);
    expect(n.x * v2.x + n.y * v2.y + n.z * v2.z).toBeCloseTo(0, 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. A ÁREA REAL — o número da compra
// ─────────────────────────────────────────────────────────────────────────────

describe('telhado · 2. ÁREA REAL ≠ ÁREA PROJETADA', () => {
  it('a 30%, a água de 24 m² em planta tem 25,06 m² de telha', () => {
    // fator = √(1 + 0,30²) = √1,09 = 1,04403065…
    // 6,00 × 4,00 = 24,00 m² projetados
    // 24,00 × 1,04403065 = 25,0567356 m² reais  →  4,4% a mais
    const m = medirAgua(agua());
    expect(m.areaProjetadaM2).toBeCloseTo(24, 9);
    expect(m.areaRealM2).toBeCloseTo(25.0567356213, 8);
    expect(m.areaRealM2 / m.areaProjetadaM2).toBeCloseTo(1.0440306509, 9);
  });

  it('a 100% (45°) são 41% a mais — o erro cresce rápido', () => {
    // fator = √(1 + 1) = √2 = 1,41421356
    // 24,00 × 1,41421356 = 33,9411255 m²
    const m = medirAgua(agua({ inclinacaoPct: 100 }));
    expect(m.inclinacaoGraus).toBeCloseTo(45, 9);
    expect(m.areaRealM2).toBeCloseTo(33.9411254969, 8);
  });

  it('a inclinação em graus é DERIVADA do por cento', () => {
    // atan(0,30) = 0,291456794 rad = 16,6992442°
    expect(medirAgua(agua()).inclinacaoGraus).toBeCloseTo(16.6992442340, 9);
    // 57,7% é a inclinação de 30° — a conferência na outra direção.
    expect(medirAgua(agua({ inclinacaoPct: 57.735 })).inclinacaoGraus).toBeCloseTo(30, 4);
  });

  it('beiral e altura máxima saem da mesma medição', () => {
    const m = medirAgua(agua({ baseMm: 2800 }));
    expect(m.comprimentoBeiralM).toBeCloseTo(6, 9);
    expect(m.alturaMaximaMm).toBe(4000);
  });

  it('A PROVA CRUZADA: a área do perfil NO PLANO é a área real', () => {
    // `perfilDaAguaNoPlano` chega ao mesmo número por outro caminho — esticando
    // o `v` em vez de multiplicar a área no fim. Se os dois divergirem, um dos
    // dois está errado, e é o perfil que o IFC extruda.
    for (const pct of [0, 15, 30, 57.735, 100, 200]) {
      const a = agua({ inclinacaoPct: pct });
      const areaPerfilM2 = polygonArea(perfilDaAguaNoPlano(a)) / 1_000_000;
      expect(areaPerfilM2, `${pct}%`).toBeCloseTo(medirAgua(a).areaRealM2, 6);
    }
  });

  it('o perfil no plano preserva o comprimento do BEIRAL, e estica só a rampa', () => {
    // O beiral está na linha de base do plano: ele não encurta nem estica.
    // A rampa, sim: 4000 mm em planta viram 4000 × 1,04403065 = 4176,12 mm.
    const perfil = perfilDaAguaNoPlano(agua());
    expect(Math.hypot(perfil[1].x - perfil[0].x, perfil[1].y - perfil[0].y)).toBeCloseTo(6000, 6);
    expect(Math.hypot(perfil[2].x - perfil[1].x, perfil[2].y - perfil[1].y)).toBeCloseTo(
      4176.1226036,
      6,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Regra: telhado não mexe em ambiente
// ─────────────────────────────────────────────────────────────────────────────

describe('telhado · 3. NÃO participa do arranjo planar', () => {
  it('uma água sobre a sala não parte o ambiente nem tira área de piso', () => {
    const { model, levelId } = comNivel();
    const parede = (ax: number, ay: number, bx: number, by: number): Command => ({
      type: 'AddWall',
      levelId,
      a: point(ax, ay),
      b: point(bx, by),
      thicknessMm: 150,
      heightMm: H,
    });
    const sala = applyBatch(model, [
      parede(0, 0, 6000, 0),
      parede(6000, 0, 6000, 4000),
      parede(6000, 4000, 0, 4000),
      parede(0, 4000, 0, 0),
    ]).model;

    const antes = computeQuantities(sala);
    const comTelhado = applyCommand(sala, {
      type: 'AddAgua',
      levelId,
      pontos: RETANGULO,
      inclinacaoPct: 30,
    }).model;
    const depois = computeQuantities(comTelhado);

    expect(comTelhado.spaces).toHaveLength(1);
    expect(depois.ambientes[0].areaPisoM2).toBeCloseTo(antes.ambientes[0].areaPisoM2, 9);
    expect(depois.totais.areaPisoM2).toBeCloseTo(antes.totais.areaPisoM2, 9);
    expect(depois.totais.comprimentoRodapeM).toBeCloseTo(antes.totais.comprimentoRodapeM, 9);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Totais
// ─────────────────────────────────────────────────────────────────────────────

describe('telhado · 4. conta separado nos totais', () => {
  it('duas águas somam área real e projetada, e contam como 2', () => {
    // Duas águas iguais de 24 m² a 30%: 48,00 projetados, 50,1134712 reais.
    const { model, levelId } = comNivel();
    const duas = applyBatch(model, [
      { type: 'AddAgua', levelId, pontos: RETANGULO, inclinacaoPct: 30 },
      {
        type: 'AddAgua',
        levelId,
        pontos: [point(0, 4000), point(6000, 4000), point(6000, 8000), point(0, 8000)],
        inclinacaoPct: 30,
        beiralIndex: 2,
      },
    ] as Command[]).model;

    const q = computeQuantities(duas);
    expect(q.telhados).toHaveLength(2);
    expect(q.totais.aguas).toBe(2);
    expect(q.totais.areaTelhadoProjetadaM2).toBeCloseTo(48, 9);
    expect(q.totais.areaTelhadoM2).toBeCloseTo(50.1134712427, 8);
    // A área CONSTRUÍDA não é a do telhado — são grandezas diferentes.
    expect(q.totais.areaTelhadoM2).not.toBeCloseTo(q.totais.areaConstruidaM2, 2);
  });

  it('a fórmula acompanha o número, para conferência (RF-121)', () => {
    const q = computeQuantities(comAgua().model);
    expect(q.telhados[0].formula).toContain('área real');
    expect(q.telhados[0].formula).toContain('1.0440');
  });

  it('planta sem telhado tem os totais zerados, não ausentes', () => {
    const q = computeQuantities(comNivel().model);
    expect(q.telhados).toEqual([]);
    expect(q.totais.areaTelhadoM2).toBe(0);
    expect(q.totais.aguas).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe('telhado · 5. sobrevive ao round-trip do payload', () => {
  it('o modelo relido é idêntico e tem o mesmo hash', () => {
    const { model } = comAgua({ baseMm: 2800, espessuraMm: 150 });
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(model)));

    expect(snapshotHash(volta)).toBe(snapshotHash(model));
    expect(canonicalPayload(volta)).toBe(canonicalPayload(model));
    expect(volta.roofs).toHaveLength(1);
    expect(volta.roofs[0].inclinacaoPct).toBe(30);
    expect(volta.roofs[0].baseMm).toBe(2800);
    expect(volta.roofs[0].espessuraMm).toBe(150);
    expect(volta.roofs[0].beiralIndex).toBe(0);
    // A identidade sobrevive junto (kernel 0.12.0 sobre a identidade de 04/09).
    expect(volta.roofs[0].uid).toBe(model.roofs[0].uid);
  });

  it('a ORDEM de criação não muda o payload — a ordem canônica é geométrica', () => {
    const { model, levelId } = comNivel();
    const norte: Command = { type: 'AddAgua', levelId, pontos: RETANGULO, inclinacaoPct: 30 };
    const sul: Command = {
      type: 'AddAgua',
      levelId,
      pontos: [point(0, -4000), point(6000, -4000), point(6000, 0), point(0, 0)],
      inclinacaoPct: 30,
      beiralIndex: 2,
    };
    const a = applyBatch(model, [norte, sul]).model;
    const b = applyBatch(model, [sul, norte]).model;

    expect(payloadDoHash(b)).toBe(payloadDoHash(a));
    expect(snapshotHash(b)).toBe(snapshotHash(a));
  });

  it('payload SEM a chave volta a ler como lista vazia, não como erro', () => {
    const { model } = comAgua();
    const p = parseCanonicalPayload(canonicalPayload(model));
    delete p.roofs;
    const devolta = modelFromCanonicalPayload(p);
    expect(devolta.roofs).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. A GUARDA
// ─────────────────────────────────────────────────────────────────────────────

describe('telhado · 6. A GUARDA: planta sem telhado não muda de forma', () => {
  it('a chave `roofs` NÃO existe no payload de um desenho sem água nenhuma', () => {
    // A asserção é sobre as CHAVES, não sobre o valor: `roofs: []` também
    // passaria num teste de "está vazio", e é justamente `[]` que mudaria a
    // forma canônica de todo desenho do acervo.
    const semTelhado = comNivel().model;
    const geometria = JSON.parse(payloadDoHash(semTelhado));
    expect(Object.keys(geometria)).not.toContain('roofs');
    expect(Object.keys(geometria).sort()).toEqual(
      ['boundaries', 'kernel', 'labels', 'levels', 'openings', 'spaces', 'toleranceMm', 'walls'].sort(),
    );
  });

  it('com água, a chave aparece — e some de novo quando ela é apagada', () => {
    const { model } = comAgua();
    expect(Object.keys(JSON.parse(payloadDoHash(model)))).toContain('roofs');

    const semAgua = applyCommand(model, { type: 'DeleteAgua', aguaId: model.roofs[0].id }).model;
    expect(Object.keys(JSON.parse(payloadDoHash(semAgua)))).not.toContain('roofs');
    // E o hash volta a ser o do desenho sem telhado — apagar desfaz de verdade.
    expect(snapshotHash(semAgua)).toBe(snapshotHash(comNivel().model));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Invariantes e comandos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Afirma o CÓDIGO do `KernelError`, não a mensagem.
 *
 * `toThrow(/…/)` casa a MENSAGEM, e mensagem é texto de tela: reescrevê-la para
 * ficar mais clara não deveria quebrar teste nenhum. O código é o contrato — é
 * por ele que a UI decide o que mostrar.
 */
function esperaCodigo(fn: () => unknown, codigo: string) {
  try {
    fn();
  } catch (e) {
    expect((e as { code?: string }).code, `mensagem: ${(e as Error).message}`).toBe(codigo);
    return;
  }
  throw new Error(`esperava ${codigo}, e nada foi levantado`);
}

describe('telhado · 7. os invariantes recusam número errado calado', () => {
  const forjar = (over: Partial<Agua>) => {
    const { model } = comAgua();
    const alterado: BlueprintModel = {
      ...model,
      roofs: [{ ...model.roofs[0], ...over }],
    };
    // Qualquer comando serve de gatilho: os invariantes rodam em todo
    // `applyCommand`, ao final.
    return () =>
      applyCommand(alterado, {
        type: 'SetLevelProps',
        levelId: model.levels[0].id,
        name: 'Térreo',
      });
  };

  it('beiral apontando um lado que não existe', () => {
    esperaCodigo(forjar({ beiralIndex: 4 }), 'BAD_ROOF_EDGE');
    esperaCodigo(forjar({ beiralIndex: -1 }), 'BAD_ROOF_EDGE');
  });

  it('inclinação negativa, e o erro de digitação do 300 no lugar do 30', () => {
    esperaCodigo(forjar({ inclinacaoPct: -10 }), 'BAD_ROOF_SLOPE');
    esperaCodigo(forjar({ inclinacaoPct: AGUA_INCLINACAO_MAX_PCT + 1 }), 'BAD_ROOF_SLOPE');
    // No teto ainda passa: o limite é inclusivo.
    expect(forjar({ inclinacaoPct: AGUA_INCLINACAO_MAX_PCT })).not.toThrow();
  });

  it('área projetada zero (vértices colineares) e menos de 3 vértices', () => {
    esperaCodigo(forjar({ pontos: [point(0, 0), point(3000, 0), point(6000, 0)] }), 'DEGENERATE_ROOF');
    esperaCodigo(forjar({ pontos: [point(0, 0), point(6000, 0)] }), 'BAD_ROOF_POINTS');
  });

  it('espessura não positiva', () => {
    esperaCodigo(forjar({ espessuraMm: 0 }), 'BAD_ROOF_SIZE');
  });

  it('`AddAgua` recusa o gesto ANTES de criar, com mensagem do gesto', () => {
    const { model, levelId } = comNivel();
    expect(() =>
      applyCommand(model, {
        type: 'AddAgua',
        levelId,
        pontos: [point(0, 0), point(6000, 0)],
        inclinacaoPct: 30,
      }),
    ).toThrow(/pelo menos 3 vértices/);
    expect(() =>
      applyCommand(model, {
        type: 'AddAgua',
        levelId,
        pontos: RETANGULO,
        inclinacaoPct: 30,
        beiralIndex: 9,
      }),
    ).toThrow(/Lado 9 não existe/);
  });
});

describe('telhado · comandos', () => {
  it('`SetAguaProps` muda uma medida por vez e preserva o resto', () => {
    const { model } = comAgua();
    const id = model.roofs[0].id;
    const uid = model.roofs[0].uid;

    const r1 = applyCommand(model, { type: 'SetAguaProps', aguaId: id, inclinacaoPct: 40 }).model;
    expect(r1.roofs[0].inclinacaoPct).toBe(40);
    expect(r1.roofs[0].baseMm).toBe(0);
    expect(r1.roofs[0].uid).toBe(uid);

    const r2 = applyCommand(r1, { type: 'SetAguaProps', aguaId: id, beiralIndex: 2 }).model;
    expect(r2.roofs[0].beiralIndex).toBe(2);
    expect(r2.roofs[0].inclinacaoPct).toBe(40);
    // Trocar o beiral para o lado oposto inverte o caimento: o que era alto
    // vira baixo. (0,0) estava em z=0 e passa a ser o ponto alto.
    expect(alturaNaAgua(r2.roofs[0], point(0, 0))).toBeCloseTo(4000 * 0.4, 6);
    expect(alturaNaAgua(r2.roofs[0], point(0, 4000))).toBeCloseTo(0, 6);
  });

  it('`MoveAguaVertex` move um vértice e recusa índice inexistente', () => {
    const { model } = comAgua();
    const id = model.roofs[0].id;
    const movido = applyCommand(model, {
      type: 'MoveAguaVertex',
      aguaId: id,
      index: 2,
      to: point(8000, 4000),
    }).model;
    expect(movido.roofs[0].pontos[2]).toEqual(point(8000, 4000));
    esperaCodigo(
      () => applyCommand(model, { type: 'MoveAguaVertex', aguaId: id, index: 7, to: point(0, 0) }),
      'BAD_ROOF_POINTS',
    );
  });

  it('`DuplicateLevel` copia as águas com uid NOVO', () => {
    const { model } = comAgua();
    const dois = applyCommand(model, {
      type: 'DuplicateLevel',
      levelId: model.levels[0].id,
      novoNome: '1º pavimento',
      elevationMm: 2800,
    }).model;

    expect(dois.roofs).toHaveLength(2);
    expect(dois.roofs[1].uid).not.toBe(dois.roofs[0].uid);
    expect(dois.roofs[1].levelId).toBe(dois.levels[1].id);
    expect(dois.roofs[1].inclinacaoPct).toBe(dois.roofs[0].inclinacaoPct);
  });

  it('`RemoveLevel` leva as águas do nível junto', () => {
    const { model } = comAgua();
    const dois = applyCommand(model, {
      type: 'DuplicateLevel',
      levelId: model.levels[0].id,
      novoNome: '1º',
      elevationMm: 2800,
    }).model;
    const removido = applyCommand(dois, {
      type: 'RemoveLevel',
      levelId: dois.levels[1].id,
    });
    expect(removido.model.roofs).toHaveLength(1);
    expect(removido.diff.deleted).toContain(dois.roofs[1].id);
  });

  it('`TranslateEntities` leva a água junto — senão ela fica no ar', () => {
    const { model } = comAgua();
    const id = model.roofs[0].id;
    const movido = applyCommand(model, {
      type: 'TranslateEntities',
      wallIds: [],
      boundaryIds: [],
      structuralIds: [],
      aguaIds: [id],
      delta: point(1000, 500),
      manterJuncoes: false,
    }).model;
    expect(movido.roofs[0].pontos[0]).toEqual(point(1000, 500));
    expect(movido.roofs[0].pontos[2]).toEqual(point(7000, 4500));
    // O beiral continua sendo o MESMO lado: índice não muda ao transladar.
    expect(movido.roofs[0].beiralIndex).toBe(0);
    expect(medirAgua(movido.roofs[0]).areaRealM2).toBeCloseTo(
      medirAgua(model.roofs[0]).areaRealM2,
      9,
    );
  });

  it('`DuplicateEntities` cola a água deslocada, com uid novo', () => {
    const { model } = comAgua();
    const colado = applyCommand(model, {
      type: 'DuplicateEntities',
      levelId: model.levels[0].id,
      wallIds: [],
      boundaryIds: [],
      structuralIds: [],
      aguaIds: [model.roofs[0].id],
      openings: [],
      delta: point(0, 10000),
    }).model;
    expect(colado.roofs).toHaveLength(2);
    expect(colado.roofs[1].uid).not.toBe(colado.roofs[0].uid);
    expect(colado.roofs[1].pontos[0]).toEqual(point(0, 10000));
  });

  it('`DeleteAgua` apaga só ela', () => {
    const { model, levelId } = comNivel();
    const duas = applyBatch(model, [
      { type: 'AddAgua', levelId, pontos: RETANGULO, inclinacaoPct: 30 },
      {
        type: 'AddAgua',
        levelId,
        pontos: [point(0, 5000), point(6000, 5000), point(6000, 9000), point(0, 9000)],
        inclinacaoPct: 30,
      },
    ] as Command[]).model;
    const sobrou = applyCommand(duas, { type: 'DeleteAgua', aguaId: duas.roofs[0].id }).model;
    expect(sobrou.roofs).toHaveLength(1);
    expect(sobrou.roofs[0].id).toBe(duas.roofs[1].id);
  });
});
