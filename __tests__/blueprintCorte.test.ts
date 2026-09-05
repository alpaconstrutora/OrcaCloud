/**
 * VISTA DE CORTE — `utils/blueprintCorte.ts` e a família `sections` do kernel.
 *
 * As sete perguntas do molde de família nova, com a terceira sendo a que separa
 * um corte de uma elevação:
 *
 *   1. a base sai da linha, e olhar para o outro lado espelha;
 *   2. a classificação é pela PEGADA — cortado, atrás, na frente;
 *   3. **o que está NA FRENTE some** — é a metade removida;
 *   4. a parede cortada sai com a ESPESSURA dela, e a porta atravessada vira vão;
 *   5. a água cortada sai INCLINADA (é o motivo de o corte existir para o telhado);
 *   6. planta SEM corte continua com a MESMA FORMA canônica;      ← a guarda
 *   7. os invariantes recusam o que produziria desenho errado calado.
 *
 * ⚠️ Todo valor esperado está CALCULADO À MÃO no comentário.
 */

import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  payloadDoHash,
  point,
  snapshotHash,
  type BlueprintModel,
  type Command,
  type Corte,
} from '../utils/blueprintKernel';
import {
  baseDoCorte,
  classificarNoCorte,
  projetarCorte,
  trechosCortados,
} from '../utils/blueprintCorte';

const H = 2800;
const T = 150;

function comNivel(): { model: BlueprintModel; levelId: string } {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  return { model: r.model, levelId: r.model.levels[0].id };
}

const parede = (levelId: string, ax: number, ay: number, bx: number, by: number): Command => ({
  type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: T, heightMm: H,
});

/**
 * Casa 6,00 × 4,00 m, paredes de 150 mm, eixos em 0..6000 × 0..4000.
 *
 * Com o avanço de canto de 75 mm em cada ponta, o CORPO vai de −75 a 6075 em x
 * e de −75 a 4075 em y. Todos os números abaixo saem daí.
 */
function casa(): BlueprintModel {
  const { model, levelId } = comNivel();
  return applyBatch(model, [
    parede(levelId, 0, 0, 6000, 0),
    parede(levelId, 6000, 0, 6000, 4000),
    parede(levelId, 6000, 4000, 0, 4000),
    parede(levelId, 0, 4000, 0, 0),
  ]).model;
}

/** Corte HORIZONTAL em y = 2000, olhando para +y (para os fundos). */
function corteHorizontal(m: BlueprintModel): { model: BlueprintModel; corte: Corte } {
  const r = applyCommand(m, {
    type: 'AddCorte',
    a: point(-1000, 2000),
    b: point(7000, 2000),
  });
  return { model: r.model, corte: r.model.sections[0] };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('corte · 1. a base sai da LINHA', () => {
  it('olhando para a ESQUERDA, `u` cai sobre `a → b`', () => {
    // a→b = (−1000,2000)→(7000,2000), então t = (1,0).
    // ESQUERDA: d = (−t.y, t.x) = (0,1) — olha para +y.
    // u = (d.y, −d.x) = (1,0) — sobre a→b, como prometido.
    const { corte } = corteHorizontal(casa());
    const base = baseDoCorte(corte);
    expect(base.origem).toBe('LINHA_DE_CORTE');
    expect(base.d).toEqual({ x: 0, y: 1 });
    expect(base.u).toEqual({ x: 1, y: 0 });
  });

  it('olhando para a DIREITA, tudo espelha — a mesma casa vista do outro lado', () => {
    // DIREITA: d = (t.y, −t.x) = (0,−1); u = (−1,0).
    const { model, corte } = corteHorizontal(casa());
    const invertido = applyCommand(model, {
      type: 'SetCorteProps', corteId: corte.id, olharPara: 'DIREITA',
    }).model.sections[0];
    const base = baseDoCorte(invertido);
    expect(base.d).toEqual({ x: 0, y: -1 });
    expect(base.u).toEqual({ x: -1, y: 0 });
  });
});

describe('corte · 2 e 3. os três destinos', () => {
  it('a parede da FRENTE some, a dos FUNDOS fica, as laterais são cortadas', () => {
    // f(p) = p.y − 2000 (a origem é `a`, e d = (0,1)).
    //   parede de baixo (corpo em y de −75 a 75)   → f de −2075 a −1925 → FRENTE
    //   parede de cima  (corpo em y de 3925 a 4075) → f de 1925 a 2075  → ATRÁS
    //   laterais (corpo em y de −75 a 4075)         → f de −2075 a 2075 → CORTADO
    const { model, corte } = corteHorizontal(casa());
    const proj = projetarCorte(model, { corte });

    expect(proj.cortados).toHaveLength(2);
    expect(proj.paredes).toHaveLength(1);

    const deBaixo = model.walls.find((w) => w.a.y === 0 && w.b.y === 0)!;
    const deCima = model.walls.find((w) => w.a.y === 4000 && w.b.y === 4000)!;
    expect(proj.paredes[0].wallId).toBe(deCima.id);
    expect(proj.cortados.map((c) => c.id)).not.toContain(deBaixo.id);
    expect(proj.paredes.map((p) => p.wallId)).not.toContain(deBaixo.id);
  });

  it('`classificarNoCorte` não confunde ENCOSTAR com atravessar', () => {
    const { corte } = corteHorizontal(casa());
    const base = baseDoCorte(corte);
    const o = corte.a;
    // Encostar POR TRÁS (y de 2000 a 3000): fica, e inteira.
    const atras = [point(0, 2000), point(100, 2000), point(100, 3000), point(0, 3000)];
    expect(classificarNoCorte(atras, base, o)).toBe('ATRAS');
    // Encostar PELA FRENTE (y de 1000 a 2000): some. Tocar não é atravessar —
    // sem a folga, esta sairia CHEIA com espessura zero, um risco preto vindo
    // de uma parede que o plano não corta.
    const encosta = [point(0, 1000), point(100, 1000), point(100, 2000), point(0, 2000)];
    expect(classificarNoCorte(encosta, base, o)).toBe('FRENTE');
    // Atravessando de verdade.
    const cruza = [point(0, 1000), point(100, 1000), point(100, 3000), point(0, 3000)];
    expect(classificarNoCorte(cruza, base, o)).toBe('CORTADO');
    // Inteiramente na frente.
    const frente = [point(0, 0), point(100, 0), point(100, 500), point(0, 500)];
    expect(classificarNoCorte(frente, base, o)).toBe('FRENTE');
  });

  it('num "L", o plano dá DOIS trechos, e não um só costurando o vazio', () => {
    const { corte } = corteHorizontal(casa());
    const base = baseDoCorte(corte);
    // Duas pernas verticais unidas em cima: o plano em y=2000 corta as duas.
    const emU = [
      point(0, 0), point(1000, 0), point(1000, 3000), point(2000, 3000),
      point(2000, 0), point(3000, 0), point(3000, 4000), point(0, 4000),
    ];
    const trechos = trechosCortados(emU, base, corte.a);
    expect(trechos).toHaveLength(2);
    // `u` é o próprio x. Perna esquerda 0..1000; o entalhe 1000..2000 fica
    // VAZIO; perna direita 2000..3000.
    expect(trechos[0]).toEqual({ uMin: 0, uMax: 1000 });
    expect(trechos[1]).toEqual({ uMin: 2000, uMax: 3000 });
  });
});

describe('corte · 4. a parede cortada', () => {
  it('sai com a ESPESSURA dela, do piso ao topo', () => {
    // `u` é o próprio x (o eixo é absoluto, como na elevação).
    // Lateral esquerda: corpo em x de −75 a 75. Direita: de 5925 a 6075.
    const { model, corte } = corteHorizontal(casa());
    const proj = projetarCorte(model, { corte });

    const us = proj.cortados
      .map((c) => ({ uMin: Math.min(...c.pontos.map((p) => p.u)), uMax: Math.max(...c.pontos.map((p) => p.u)) }))
      .sort((a, b) => a.uMin - b.uMin);
    expect(us).toEqual([
      { uMin: -75, uMax: 75 },
      { uMin: 5925, uMax: 6075 },
    ]);
    // 150 mm de espessura, medidos no desenho.
    expect(us[0].uMax - us[0].uMin).toBe(T);

    for (const c of proj.cortados) {
      expect(Math.min(...c.pontos.map((p) => p.v))).toBe(0);
      expect(Math.max(...c.pontos.map((p) => p.v))).toBe(H);
    }
  });

  it('a porta ATRAVESSADA vira vão; a que fica de fora, não', () => {
    // Lateral esquerda vai de (0,4000) a (0,0): 4000 mm, medidos a partir de a.
    // O plano em y=2000 cai a 2000 mm de `a`.
    //   porta em 1500..2400 → contém 2000 → CORTADA
    //   janela em 200..1000 → não contém  → não vira vão
    const base = casa();
    const esquerda = base.walls.find((w) => w.a.x === 0 && w.b.x === 0)!;
    const comVaos = applyBatch(base, [
      { type: 'AddOpening', wallId: esquerda.id, kind: 'door', offsetMm: 1500, widthMm: 900, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId: esquerda.id, kind: 'window', offsetMm: 200, widthMm: 800, heightMm: 1200, sillMm: 900 },
    ] as Command[]).model;

    const { model, corte } = corteHorizontal(comVaos);
    const proj = projetarCorte(model, { corte });
    const cortada = proj.cortados.find((c) => c.id === esquerda.id)!;

    expect(cortada.vaos).toHaveLength(1);
    // O vão ocupa TODO o trecho: o plano atravessa a espessura inteira ali.
    expect(cortada.vaos[0]).toEqual({ uMin: -75, uMax: 75, vMin: 0, vMax: 2100 });
  });
});

describe('corte · 5. a água cortada sai INCLINADA', () => {
  /** Corte VERTICAL em x = 3000, perpendicular ao beiral — o que mostra a rampa. */
  function comTelhadoCortado() {
    const base = casa();
    const levelId = base.levels[0].id;
    const comAgua = applyCommand(base, {
      type: 'AddAgua',
      levelId,
      pontos: [point(-500, -500), point(6500, -500), point(6500, 4500), point(-500, 4500)],
      inclinacaoPct: 30,
      baseMm: H,
    }).model;
    const r = applyCommand(comAgua, {
      type: 'AddCorte', a: point(3000, -1000), b: point(3000, 5000),
    });
    return { model: r.model, corte: r.model.sections[0] };
  }

  it('a aresta de cima sobe do beiral à cumeeira', () => {
    // a→b = (3000,−1000)→(3000,5000): t = (0,1); ESQUERDA → d = (−1,0); u = (0,1).
    // u(p) = p.y.
    //   beiral em y=−500  → u = −500, cota 2800 (a base da água)
    //   fundo  em y= 4500 → u = 4500, cota 2800 + 5000 × 0,30 = 4300
    const { model, corte } = comTelhadoCortado();
    const proj = projetarCorte(model, { corte });
    const agua = proj.cortados.find((c) => c.familia === 'TELHADO')!;
    expect(agua).toBeTruthy();
    expect(agua.rotulo).toBe('30%');

    const topo = agua.pontos.slice(0, 2);
    expect(topo[0]).toEqual({ u: -500, v: 2800 });
    expect(topo[1]).toEqual({ u: 4500, v: 4300 });
    // INCLINADA: os dois `v` diferem. Um retângulo aqui apagaria a rampa.
    expect(topo[1].v).toBeGreaterThan(topo[0].v);
  });

  it('a aresta de baixo é a de cima deslocada pela NORMAL, não para baixo em prumo', () => {
    // normal = (0, −0,3, 1)/√1,09 = (0, −0,287348, 0,957826)
    // Descer 120 mm ao longo dela: Δy = +34,48 e Δz = −114,94.
    // Em (u, v) — u = y — isso é du = +34,48 e dv = −114,94.
    const { model, corte } = comTelhadoCortado();
    const agua = projetarCorte(model, { corte }).cortados.find((c) => c.familia === 'TELHADO')!;
    const [t0, t1, b1, b0] = agua.pontos;
    expect(b0.u - t0.u).toBeCloseTo(34.4818, 3);
    expect(b0.v - t0.v).toBeCloseTo(-114.939, 3);
    expect(b1.u - t1.u).toBeCloseTo(34.4818, 3);
    // O paralelogramo fecha: os dois deslocamentos são iguais.
    expect(b1.v - t1.v).toBeCloseTo(b0.v - t0.v, 6);
  });

  it('cortando PARALELO ao beiral, a água sai horizontal — e isso é o certo', () => {
    // Cortar ao longo da linha de maior declive é o que mostra a rampa; cortar
    // paralelo ao beiral corta na cota constante. O teste existe para que a
    // horizontal não seja lida como defeito.
    const base = casa();
    const levelId = base.levels[0].id;
    const comAgua = applyCommand(base, {
      type: 'AddAgua', levelId,
      pontos: [point(-500, -500), point(6500, -500), point(6500, 4500), point(-500, 4500)],
      inclinacaoPct: 30, baseMm: H,
    }).model;
    const { model, corte } = corteHorizontal(comAgua);
    const agua = projetarCorte(model, { corte }).cortados.find((c) => c.familia === 'TELHADO')!;
    // Todo o corte a y=2000: d = 2500 do beiral → 2800 + 750 = 3550.
    expect(agua.pontos[0].v).toBe(3550);
    expect(agua.pontos[1].v).toBe(3550);
  });
});

describe('corte · o enquadramento é do CORTE, não da elevação', () => {
  it('a caixa não inclui a metade removida', () => {
    const { model, corte } = corteHorizontal(casa());
    const proj = projetarCorte(model, { corte });
    // Cortados −75..6075 e a parede de trás −75..6075 — a de baixo, descartada,
    // não estica nada.
    expect(proj.bbox.uMin).toBe(-75);
    expect(proj.bbox.uMax).toBe(6075);
    expect(proj.bbox.vMin).toBe(0);
    expect(proj.bbox.vMax).toBe(H);
  });
});

describe('corte · 6. A GUARDA: planta sem corte não muda de forma', () => {
  it('a chave `sections` NÃO existe no payload de um desenho sem corte', () => {
    const geometria = JSON.parse(payloadDoHash(casa()));
    expect(Object.keys(geometria)).not.toContain('sections');
  });

  it('com corte a chave aparece, e some de novo ao apagar — o hash volta', () => {
    const semCorte = casa();
    const { model, corte } = corteHorizontal(semCorte);
    expect(Object.keys(JSON.parse(payloadDoHash(model)))).toContain('sections');

    const apagado = applyCommand(model, { type: 'DeleteCorte', corteId: corte.id }).model;
    expect(Object.keys(JSON.parse(payloadDoHash(apagado)))).not.toContain('sections');
    expect(snapshotHash(apagado)).toBe(snapshotHash(semCorte));
  });

  it('round-trip preserva a linha, o lado e a letra', () => {
    const { model } = corteHorizontal(casa());
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(model)));
    expect(snapshotHash(volta)).toBe(snapshotHash(model));
    expect(canonicalPayload(volta)).toBe(canonicalPayload(model));
    expect(volta.sections).toHaveLength(1);
    expect(volta.sections[0].a).toEqual(point(-1000, 2000));
    expect(volta.sections[0].olharPara).toBe('ESQUERDA');
    expect(volta.sections[0].rotulo).toBe('A');
    expect(volta.sections[0].uid).toBe(model.sections[0].uid);
  });
});

describe('corte · 7. comandos e invariantes', () => {
  it('a letra da marca avança sozinha: A, B, C', () => {
    const m1 = corteHorizontal(casa()).model;
    const m2 = applyCommand(m1, { type: 'AddCorte', a: point(0, 500), b: point(6000, 500) }).model;
    const m3 = applyCommand(m2, { type: 'AddCorte', a: point(0, 3000), b: point(6000, 3000) }).model;
    expect(m3.sections.map((c) => c.rotulo).sort()).toEqual(['A', 'B', 'C']);
  });

  it('`MoveCorteVertex` move uma ponta e recusa colapsar a linha', () => {
    const { model, corte } = corteHorizontal(casa());
    const movido = applyCommand(model, {
      type: 'MoveCorteVertex', corteId: corte.id, end: 'b', to: point(7000, 2500),
    }).model;
    expect(movido.sections[0].b).toEqual(point(7000, 2500));
    expect(() =>
      applyCommand(model, { type: 'MoveCorteVertex', corteId: corte.id, end: 'b', to: corte.a }),
    ).toThrow();
  });

  it('`AddCorte` recusa linha de comprimento zero', () => {
    expect(() =>
      applyCommand(casa(), { type: 'AddCorte', a: point(0, 0), b: point(0, 0) }),
    ).toThrow();
  });

  it('o corte NÃO tem pavimento: remover um nível não o leva junto', () => {
    // O plano atravessa a edificação inteira — ver o cabeçalho de `Corte`.
    const { model } = corteHorizontal(casa());
    const dois = applyCommand(model, {
      type: 'DuplicateLevel', levelId: model.levels[0].id, novoNome: '1º', elevationMm: 2800,
    }).model;
    expect(dois.sections).toHaveLength(1);
    const removido = applyCommand(dois, { type: 'RemoveLevel', levelId: dois.levels[1].id }).model;
    expect(removido.sections).toHaveLength(1);
  });

  it('lado inválido é recusado pelos invariantes', () => {
    const { model } = corteHorizontal(casa());
    const forjado: BlueprintModel = {
      ...model,
      sections: [{ ...model.sections[0], olharPara: 'CIMA' as 'ESQUERDA' }],
    };
    expect(() =>
      applyCommand(forjado, { type: 'SetLevelProps', levelId: model.levels[0].id, name: 'T' }),
    ).toThrow(/ESQUERDA ou DIREITA/);
  });
});
