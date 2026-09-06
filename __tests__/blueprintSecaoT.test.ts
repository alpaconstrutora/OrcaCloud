/**
 * A seção em T da viga — mesa e alma.
 *
 * ─── POR QUE ELA ENTROU ─────────────────────────────────────────────────────
 *
 * Medido em 06/09/2026 nos dois modelos estruturais reais: das vigas com perfil
 * poligonal, **219 são T e ZERO são L, I, U ou cruz**. Elas eram recusadas na
 * importação porque o kernel só tinha seção retangular ou circular.
 *
 * ─── O QUE ESTES CASOS PROTEGEM ─────────────────────────────────────────────
 *
 * O risco aqui é aritmético e silencioso: uma T tratada como caixa cheia dá
 * ~3× o volume real de concreto. Num orçamento, isso não aparece como erro —
 * aparece como preço.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  emptyModel,
  medirEstrutura,
  point,
  type Structural,
} from '../utils/blueprintKernel';
import {
  areaDaSecaoT,
  contornoDaSecaoT,
  perimetroDeFormaDaSecaoT,
  secaoTValida,
} from '../utils/blueprintKernel/secaoT';

/** A viga T mais comum do modelo real: 99 × 70, mesa 15, alma 19. */
const L = 99;
const A = 70;
const T = { mesaAlturaMm: 15, almaLarguraMm: 19 };

const viga = (over: Partial<Structural> = {}): Structural =>
  ({
    id: 'str_1',
    uid: 'u1',
    levelId: 'lvl_1',
    kind: 'VIGA',
    pontos: [point(0, 0), point(1000, 0)],
    larguraMm: L,
    profundidadeMm: 0,
    alturaMm: A,
    baseMm: 0,
    circular: false,
    rotacaoDeg: 0,
    ...over,
  }) as Structural;

describe('seção T · a área', () => {
  it('é mesa + alma, e não a caixa', () => {
    // 99×15 = 1485 na mesa; 19×(70−15) = 1045 na alma; 2530 no total.
    expect(areaDaSecaoT(L, A, T)).toBe(2530);
    // A caixa daria 6930 — quase o TRIPLO. É o erro que isto evita.
    expect(L * A).toBe(6930);
  });

  it('mesa da altura toda seria a caixa — e por isso é recusada, não aceita', () => {
    expect(secaoTValida(viga({ secaoT: { mesaAlturaMm: A, almaLarguraMm: 19 } }))).toBeNull();
  });

  it('alma da largura toda também', () => {
    expect(secaoTValida(viga({ secaoT: { mesaAlturaMm: 15, almaLarguraMm: L } }))).toBeNull();
  });

  it('medida não positiva é recusada', () => {
    expect(secaoTValida(viga({ secaoT: { mesaAlturaMm: 0, almaLarguraMm: 19 } }))).toBeNull();
    expect(secaoTValida(viga({ secaoT: { mesaAlturaMm: 15, almaLarguraMm: -1 } }))).toBeNull();
  });

  it('sem o campo, não há seção T — o padrão continua a viga cheia', () => {
    expect(secaoTValida(viga())).toBeNull();
  });
});

describe('seção T · a fôrma', () => {
  it('o topo da mesa NÃO entra — é por onde o concreto entra', () => {
    // 2×15 (lados da mesa) + 80 (abas) + 2×55 (lados da alma) + 19 (fundo) = 239.
    expect(perimetroDeFormaDaSecaoT(L, A, T)).toBe(239);
  });

  it('É IGUAL ao da caixa — sempre, e isso não é coincidência', () => {
    // 2m + (L−a) + 2(A−m) + a  =  L + 2A. Os degraus da T projetam exatamente
    // sobre o contorno da caixa: os trechos horizontais somam L, os verticais
    // somam 2A. Ou seja: a viga T gasta MENOS CONCRETO e a MESMA FÔRMA.
    //
    // Descoberto por um teste meu que afirmava o contrário e falhou. Vale
    // registrar porque é contraintuitivo e o orçamento depende disso.
    for (const [l, a, t] of [
      [L, A, T],
      [120, 60, { mesaAlturaMm: 30, almaLarguraMm: 40 }],
      [200, 45, { mesaAlturaMm: 8, almaLarguraMm: 12 }],
    ] as [number, number, { mesaAlturaMm: number; almaLarguraMm: number }][]) {
      expect(perimetroDeFormaDaSecaoT(l, a, t)).toBeCloseTo(2 * a + l, 9);
    }
  });
});

describe('seção T · o contorno', () => {
  it('tem oito vértices, centrados na caixa', () => {
    const c = contornoDaSecaoT(L, A, T);
    expect(c).toHaveLength(8);
    const xs = c.map((p) => p.x);
    const ys = c.map((p) => p.y);
    expect(Math.min(...xs)).toBe(-L / 2);
    expect(Math.max(...xs)).toBe(L / 2);
    expect(Math.min(...ys)).toBe(-A / 2);
    expect(Math.max(...ys)).toBe(A / 2);
  });

  it('a área do contorno bate com a fórmula — as duas contas concordam', () => {
    // Se divergirem, o 3D desenha uma peça e o orçamento cobra outra.
    const c = contornoDaSecaoT(L, A, T);
    let dobro = 0;
    for (let i = 0; i < c.length; i++) {
      const j = (i + 1) % c.length;
      dobro += c[i].x * c[j].y - c[j].x * c[i].y;
    }
    expect(Math.abs(dobro) / 2).toBeCloseTo(areaDaSecaoT(L, A, T), 6);
  });

  it('a MESA fica em cima', () => {
    const c = contornoDaSecaoT(L, A, T);
    const noTopo = c.filter((p) => p.y === A / 2);
    const noFundo = c.filter((p) => p.y === -A / 2);
    // Dois vértices largos em cima (a mesa), dois estreitos embaixo (a alma).
    expect(noTopo.map((p) => Math.abs(p.x))).toEqual([L / 2, L / 2]);
    expect(noFundo.map((p) => Math.abs(p.x))).toEqual([T.almaLarguraMm / 2, T.almaLarguraMm / 2]);
  });
});

describe('seção T · no quantitativo', () => {
  it('o volume da viga T é o da seção, não o da caixa', () => {
    const m = medirEstrutura(viga({ secaoT: T }));
    // 1 m de comprimento × 2530 mm² de seção.
    expect(m.volumeMm3).toBeCloseTo(1000 * 2530, 6);
    expect(m.formula).toMatch(/seção T/);
  });

  it('a viga CHEIA continua como sempre — nada regrediu', () => {
    const m = medirEstrutura(viga());
    expect(m.volumeMm3).toBeCloseTo(1000 * L * A, 6);
    expect(m.formula).toMatch(/base × altura/);
  });

  it('a PEGADA EM PLANTA não muda: a viga ocupa a largura da mesa', () => {
    // É o que sustenta `larguraMm` continuar significando a mesma coisa.
    expect(medirEstrutura(viga({ secaoT: T })).areaPlantaMm2).toBe(
      medirEstrutura(viga()).areaPlantaMm2,
    );
  });

  it('seção T INVÁLIDA cai na viga cheia, e não em número inventado', () => {
    const m = medirEstrutura(viga({ secaoT: { mesaAlturaMm: 999, almaLarguraMm: 19 } }));
    expect(m.volumeMm3).toBeCloseTo(1000 * L * A, 6);
  });
});

describe('seção T · o modelo aceita', () => {
  it('uma viga T criada pelo comando sobrevive com o campo', () => {
    const base = applyCommand(emptyModel(), {
      type: 'AddLevel',
      name: 'Térreo',
      elevationMm: 0,
      defaultHeightMm: 2800,
    });
    const r = applyCommand(base.model, {
      type: 'AddStructural',
      levelId: base.model.levels[0].id,
      kind: 'VIGA',
      pontos: [point(0, 0), point(4000, 0)],
      larguraMm: L,
      profundidadeMm: 0,
      alturaMm: A,
      baseMm: 0,
      secaoT: T,
    });
    expect(r.model.structures?.[0].secaoT).toEqual(T);
  });
});
