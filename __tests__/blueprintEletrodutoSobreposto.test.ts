/**
 * Eletrodutos sobrepostos em planta ganham uma LEVE CURVA (14/09/2026):
 * *"alguns eletrodutos estão se sobrepondo. uma solução é fazer uma leve
 * curva no eletroduto."* — desenho, não modelo.
 */
import { describe, expect, it } from 'vitest';
import {
  FLECHA_DO_ARCO_FRACAO,
  FLECHA_MAXIMA_DO_ARCO_MM,
  SEGMENTOS_DO_ARCO,
  arcoDoTrecho,
  curvaDoTrecho,
  desviosDeSobreposicao,
  entradasNoQuadro,
  flechaDoArcoMm,
  geometriaDesenhada,
  mesmoLeque,
  sobrepostos,
} from '../utils/blueprintEletrodutoSobreposto';

const seg = (id: string, ax: number, ay: number, bx: number, by: number) => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by } });

describe('sobrepostos — a mesma reta, cobrindo-se', () => {
  it('idênticos e parcialmente cobertos: sim; só encostados na ponta (continuação): não; cruzados: não', () => {
    expect(sobrepostos(seg('a', 0, 0, 4000, 0), seg('b', 0, 0, 4000, 0))).toBe(true);
    expect(sobrepostos(seg('a', 0, 0, 4000, 0), seg('b', 2000, 0, 6000, 0))).toBe(true);
    expect(sobrepostos(seg('a', 0, 0, 4000, 0), seg('b', 6000, 0, 3000, 0))).toBe(true); // sentido oposto, cobre 1000 mm
    expect(sobrepostos(seg('a', 0, 0, 4000, 0), seg('b', 4000, 0, 8000, 0))).toBe(false);
    expect(sobrepostos(seg('a', 0, 0, 4000, 0), seg('b', 2000, -1000, 2000, 1000))).toBe(false);
  });

  it('paralelos afastados mais que a tolerância não contam; a 10 mm ainda contam; prumada nunca', () => {
    expect(sobrepostos(seg('a', 0, 0, 4000, 0), seg('b', 0, 100, 4000, 100))).toBe(false);
    expect(sobrepostos(seg('a', 0, 0, 4000, 0), seg('b', 0, 10, 4000, 10))).toBe(true);
    expect(sobrepostos(seg('a', 0, 0, 4000, 0), seg('b', 1000, 0, 1000, 0))).toBe(false);
  });
});

describe('desviosDeSobreposicao — quem curva, e para que lado', () => {
  it('dois iguais: o primeiro (por id) fica reto, o segundo curva +1; sem sobreposição, ninguém curva', () => {
    const d = desviosDeSobreposicao([seg('t2', 0, 0, 4000, 0), seg('t1', 0, 0, 4000, 0), seg('t3', 0, 500, 4000, 500)]);
    expect(d.get('t1')).toBeUndefined();
    expect(d.get('t2')).toBe(1);
    expect(d.get('t3')).toBeUndefined();
  });

  it('três no mesmo tronco: reto, +1, −1 — e um ramal que só cobre o meio entra no mesmo grupo', () => {
    // A cobre B, B cobre C, mas A e C não se tocam: mesmo grupo, um só arranjo.
    const d = desviosDeSobreposicao([
      seg('a', 0, 0, 3000, 0),
      seg('b', 2000, 0, 5000, 0),
      seg('c', 4000, 0, 7000, 0),
    ]);
    expect(d.get('a')).toBeUndefined();
    expect(d.get('b')).toBe(1);
    expect(d.get('c')).toBe(-1);
  });

  it('o sinal segue a orientação canônica: o mesmo nível desenhado de trás para frente troca o sinal, e cai do MESMO lado na tela', () => {
    const d1 = desviosDeSobreposicao([seg('a', 0, 0, 4000, 0), seg('b', 0, 0, 4000, 0)]);
    const d2 = desviosDeSobreposicao([seg('a', 0, 0, 4000, 0), seg('b', 4000, 0, 0, 0)]);
    expect(d1.get('b')).toBe(1);
    expect(d2.get('b')).toBe(-1);
    // Na tela: normal de a→b × desvio dá o mesmo ponto de controle nos dois casos.
    const c1 = curvaDoTrecho({ x: 0, y: 0 }, { x: 400, y: 0 }, d1.get('b')!);
    const c2 = curvaDoTrecho({ x: 400, y: 0 }, { x: 0, y: 0 }, d2.get('b')!);
    expect(c1.controle).toEqual(c2.controle);
  });

  it('determinístico: a ordem de entrada não muda o resultado', () => {
    const ts = [seg('c', 0, 0, 4000, 0), seg('a', 0, 0, 4000, 0), seg('b', 1000, 0, 3000, 0)];
    const d1 = desviosDeSobreposicao(ts);
    const d2 = desviosDeSobreposicao([...ts].reverse());
    expect([...d1.entries()].sort()).toEqual([...d2.entries()].sort());
  });
});

describe('curvaDoTrecho — a leve curva em tela', () => {
  it('nível 0 = reto (controle e meio no ponto médio); nível 1 desloca o controle 14 px e o meio 7 px na normal', () => {
    const reto = curvaDoTrecho({ x: 0, y: 0 }, { x: 100, y: 0 }, 0);
    expect(reto.controle).toEqual({ x: 50, y: 0 });
    expect(reto.meio).toEqual({ x: 50, y: 0 });
    const c = curvaDoTrecho({ x: 0, y: 0 }, { x: 100, y: 0 }, 1);
    expect(c.controle).toEqual({ x: 50, y: 14 });
    expect(c.meio).toEqual({ x: 50, y: 7 });
    const c2 = curvaDoTrecho({ x: 0, y: 0 }, { x: 100, y: 0 }, -2);
    expect(c2.meio).toEqual({ x: 50, y: -14 });
  });
});

describe('o leque do quadro (15/09/2026) — "ainda estão próximos, principalmente perto do quadro"', () => {
  it('dois troncos que saem do mesmo nó a menos de 12° se confundem; a 30° não; sem nó comum não', () => {
    const q = { x: 0, y: 0 };
    expect(mesmoLeque({ a: q, b: { x: 5000, y: 0 } }, { a: q, b: { x: 5000, y: 600 } })).toBe(true); // ~6,8°
    expect(mesmoLeque({ a: q, b: { x: 5000, y: 0 } }, { a: { x: 5000, y: 600 }, b: q })).toBe(true); // sentido oposto
    expect(mesmoLeque({ a: q, b: { x: 5000, y: 0 } }, { a: q, b: { x: 5000, y: 3000 } })).toBe(false); // ~31°
    expect(mesmoLeque({ a: q, b: { x: 5000, y: 0 } }, { a: { x: 0, y: 100 }, b: { x: 5000, y: 100 } })).toBe(false);
  });

  it('o leque entra no mesmo grupo de curvas: reto, +1, −1', () => {
    const q = { x: 0, y: 0 };
    const d = desviosDeSobreposicao([
      { id: 'a', a: q, b: { x: 5000, y: 0 } },
      { id: 'b', a: q, b: { x: 5000, y: 500 } },
      { id: 'c', a: q, b: { x: 5000, y: -500 } },
    ]);
    expect(d.get('a')).toBeUndefined();
    expect(d.get('b')).toBe(1);
    expect(d.get('c')).toBe(-1);
  });

  it('entradas no quadro: com 2+ trechos no centro, cada um entra por um ponto da frente (80 % da largura), na ordem do ângulo', () => {
    const at = { x: 1000, y: 1000 };
    const quadro = { id: 'q', at, larguraMm: 400, rotacaoGraus: 0 };
    const trechos = [
      { id: 't1', a: at, b: { x: 5000, y: 3000 } }, // chega por baixo-direita
      { id: 't2', a: { x: -3000, y: 1000 }, b: at }, // chega pela esquerda (ponta b)
      { id: 't3', a: at, b: { x: 5000, y: -1000 } }, // por cima-direita
      { id: 'p', a: at, b: at }, // prumada: fica no centro
      { id: 'longe', a: { x: 0, y: 0 }, b: { x: 0, y: 5000 } },
    ];
    const e = entradasNoQuadro(trechos, [quadro]);
    expect(e.has('p')).toBe(false);
    expect(e.has('longe')).toBe(false);
    // Três entradas: em x = 1000 − 133, 1000, 1000 + 133 (largura útil 320 / 3), todas em y = 1000.
    const xs = ['t1', 't2', 't3'].map((id) => (e.get(id)!.a ?? e.get(id)!.b)!);
    expect(xs.every((p) => p.y === 1000)).toBe(true);
    expect(new Set(xs.map((p) => p.x)).size).toBe(3);
    for (const p of xs) expect(Math.abs(p.x - 1000)).toBeLessThanOrEqual(160);
    // t2 chega da esquerda: entra pela esquerda; t1 e t3 pela direita.
    expect(e.get('t2')!.b!.x).toBeLessThan(e.get('t1')!.a!.x);
    expect(e.get('t2')!.b!.x).toBeLessThan(e.get('t3')!.a!.x);
    // Um só trecho: nada muda.
    expect(entradasNoQuadro([trechos[0]], [quadro]).size).toBe(0);
  });

  it('quadro girado 90°: as entradas se espalham ao longo do eixo girado', () => {
    const at = { x: 0, y: 0 };
    const e = entradasNoQuadro(
      [
        { id: 'a', a: at, b: { x: 3000, y: 100 } },
        { id: 'b', a: at, b: { x: 3000, y: -100 } },
      ],
      [{ id: 'q', at, larguraMm: 400, rotacaoGraus: 90 }],
    );
    const pa = e.get('a')!.a!;
    const pb = e.get('b')!.a!;
    expect(pa.x).toBe(0);
    expect(pb.x).toBe(0);
    expect(pa.y).not.toBe(pb.y);
  });

  it('geometriaDesenhada: reto vira 2 pontos; curvo vira 13 pontos que passam pelo meio da curva; a entrada substitui a ponta', () => {
    const trechos = [{ id: 'a', a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } }];
    const reto = geometriaDesenhada(trechos, new Map(), new Map(), 0.1);
    expect(reto[0].pontos).toEqual([{ x: 0, y: 0 }, { x: 1000, y: 0 }]);
    // escala 0,1 px/mm: passo de 14 px = 140 mm no controle → 70 mm no meio.
    const curvo = geometriaDesenhada(trechos, new Map([['a', 1]]), new Map([['a', { a: { x: 100, y: 0 } }]]), 0.1);
    expect(curvo[0].pontos).toHaveLength(13);
    expect(curvo[0].pontos[0]).toEqual({ x: 100, y: 0 });
    expect(curvo[0].pontos[12]).toEqual({ x: 1000, y: 0 });
    expect(curvo[0].pontos[6].y).toBeCloseTo(70, 6);
  });
});

describe('arco base do eletroduto elétrico (24/10/2026) — "Curvas, como no seu print"', () => {
  const dist = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);
  const a = { x: 0, y: 0 };
  const b = { x: 3000, y: 0 };

  it('as constantes do pedido: 12 % do comprimento, teto de 300 mm, 12 segmentos', () => {
    expect(FLECHA_DO_ARCO_FRACAO).toBe(0.12);
    expect(FLECHA_MAXIMA_DO_ARCO_MM).toBe(300);
    expect(SEGMENTOS_DO_ARCO).toBe(12);
  });

  it('flecha = 12 % do comprimento em planta, até o teto de 300 mm', () => {
    expect(flechaDoArcoMm(1000)).toBeCloseTo(120, 9);
    expect(flechaDoArcoMm(2000)).toBeCloseTo(240, 9);
    expect(flechaDoArcoMm(2500)).toBe(300);
    expect(flechaDoArcoMm(20000)).toBe(300);
    expect(flechaDoArcoMm(0)).toBe(0);
    // Na polilinha: o ponto do meio (13 pontos, índice 6) fica a `flecha` da corda.
    const curto = arcoDoTrecho({ x: 0, y: 0 }, { x: 1000, y: 0 }, { eletrico: true });
    expect(curto.pontos).toHaveLength(SEGMENTOS_DO_ARCO + 1);
    expect(dist(curto.pontos[6], { x: 0, y: 0 }, { x: 1000, y: 0 })).toBeCloseTo(120, 6);
    const longo = arcoDoTrecho(a, { x: 10000, y: 0 }, { eletrico: true });
    expect(dist(longo.pontos[6], a, { x: 10000, y: 0 })).toBeCloseTo(300, 6);
    // O meio devolvido é esse mesmo ponto; as pontas ficam exatamente onde estão.
    expect(curto.meio.y).toBeCloseTo(curto.pontos[6].y, 9);
    expect(curto.pontos[0]).toEqual({ x: 0, y: 0 });
    expect(curto.pontos[12]).toEqual({ x: 1000, y: 0 });
  });

  it('determinístico: o mesmo trecho com a e b trocados dá a mesma polilinha, invertida', () => {
    for (const [p, q] of [
      [a, b],
      [{ x: 100, y: 200 }, { x: 900, y: 1700 }],
      [{ x: 500, y: 500 }, { x: 500, y: 3500 }], // vertical
      [{ x: -800, y: 300 }, { x: 600, y: -2000 }],
    ] as const) {
      const direto = arcoDoTrecho(p, q, { eletrico: true }).pontos;
      const invertido = arcoDoTrecho(q, p, { eletrico: true }).pontos.slice().reverse();
      expect(invertido).toHaveLength(direto.length);
      direto.forEach((ponto, i) => {
        expect(invertido[i].x).toBeCloseTo(ponto.x, 6);
        expect(invertido[i].y).toBeCloseTo(ponto.y, 6);
      });
    }
  });

  it('o arco fica sempre à ESQUERDA de min→max (menor x; empate, menor y)', () => {
    // De (0,0) a (3000,0) a esquerda é +y; de (500,500) a (500,3500) (vertical, o de baixo vem primeiro) é −x.
    expect(arcoDoTrecho(a, b, { eletrico: true }).meio.y).toBeGreaterThan(0);
    expect(arcoDoTrecho(b, a, { eletrico: true }).meio.y).toBeGreaterThan(0);
    expect(arcoDoTrecho({ x: 500, y: 500 }, { x: 500, y: 3500 }, { eletrico: true }).meio.x).toBeLessThan(500);
    expect(arcoDoTrecho({ x: 500, y: 3500 }, { x: 500, y: 500 }, { eletrico: true }).meio.x).toBeLessThan(500);
  });

  it('prumada (a = b em planta) e trecho que não é elétrico: sem arco', () => {
    const prumada = arcoDoTrecho({ x: 100, y: 100 }, { x: 100, y: 100 }, { eletrico: true });
    expect(prumada.pontos).toEqual([{ x: 100, y: 100 }, { x: 100, y: 100 }]);
    const hidraulico = arcoDoTrecho(a, b, { eletrico: false });
    expect(hidraulico.pontos).toEqual([a, b]);
    expect(hidraulico.meio).toEqual({ x: 1500, y: 0 });
    // geometriaDesenhada: só o trecho de disciplina ELETRICA ganha o arco base.
    const g = geometriaDesenhada(
      [
        { id: 'e', disciplina: 'ELETRICA', a, b },
        { id: 'h', disciplina: 'AGUA_FRIA', a, b },
        { id: 'p', disciplina: 'ELETRICA', a: { x: 5, y: 5 }, b: { x: 5, y: 5 } },
      ],
      new Map(),
      new Map(),
      0.1,
    );
    expect(g[0].pontos).toHaveLength(13);
    expect(g[1].pontos).toEqual([a, b]);
    expect(g[2].pontos).toHaveLength(2);
  });

  it('o ponto de controle da curva fica a 2 × flecha do meio da corda (o meio da curva, a 1 × flecha)', () => {
    const arco = arcoDoTrecho(a, b, { eletrico: true });
    expect(arco.controle.x).toBeCloseTo(1500, 9);
    expect(arco.controle.y).toBeCloseTo(2 * 300, 9);
    expect(arco.meio.y).toBeCloseTo(300, 9);
  });

  it('dois sobrepostos continuam separados: o deslocamento do nível SOMA-SE ao arco base', () => {
    const trechos = [
      { id: 't1', disciplina: 'ELETRICA', a, b },
      { id: 't2', disciplina: 'ELETRICA', a, b },
    ];
    const desvios = desviosDeSobreposicao(trechos);
    expect(desvios.get('t2')).toBe(1);
    // 0,1 px/mm: passo de 14 px = 140 mm no controle, 70 mm no meio.
    const g = geometriaDesenhada(trechos, desvios, new Map(), 0.1);
    const [p1, p2] = [g[0].pontos, g[1].pontos];
    expect(p1[6].y).toBeCloseTo(300, 6);
    expect(p2[6].y).toBeCloseTo(300 + 70, 6);
    // A menor distância entre as duas polilinhas, no miolo (excluídas as pontas, onde se encontram), é > 0.
    const distanciaMinima = (xs: { x: number; y: number }[], ys: { x: number; y: number }[]) => {
      let min = Infinity;
      for (const p of xs) for (const q of ys) min = Math.min(min, Math.hypot(p.x - q.x, p.y - q.y));
      return min;
    };
    expect(distanciaMinima(p1.slice(2, 11), p2.slice(2, 11))).toBeGreaterThan(10);
    expect(Math.abs(p2[6].y - p1[6].y)).toBeGreaterThan(50);
    // Sentido invertido de um deles: continua do outro lado do primeiro, não em cima.
    const g2 = geometriaDesenhada(
      [trechos[0], { id: 't2', disciplina: 'ELETRICA', a: b, b: a }],
      desviosDeSobreposicao([trechos[0], { id: 't2', a: b, b: a }]),
      new Map(),
      0.1,
    );
    expect(Math.abs(g2[1].pontos[6].y - g2[0].pontos[6].y)).toBeGreaterThan(50);
  });

  it('a entrada espalhada no quadro continua valendo: o arco parte do ponto de entrada', () => {
    const t = { id: 't', disciplina: 'ELETRICA', a, b };
    const g = geometriaDesenhada([t], new Map(), new Map([['t', { a: { x: 100, y: 40 } }]]), 0.1);
    expect(g[0].pontos[0]).toEqual({ x: 100, y: 40 });
    expect(g[0].pontos[12]).toEqual(b);
  });
});
