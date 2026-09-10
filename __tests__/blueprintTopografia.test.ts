/**
 * O motor de curvas de nível (`utils/blueprintTopografia.ts`).
 *
 * As fixtures são as do PRD §20.2 — plano, rampa, cone, sela, `nodata`, lote
 * côncavo — porque cada uma tem uma resposta que se sabe de antemão: um plano
 * não tem curva; uma rampa dá retas paralelas; um cone dá anéis fechados; a
 * sela é o caso em que o marching squares erra se o centro da célula não for
 * consultado. Sem elas, o algoritmo "parece certo" em qualquer terreno real,
 * porque terreno real não tem resposta conhecida.
 *
 * Pedido de 10/09/2026 — `docs/planos/2026-09-10-planta-inteligente-topografia.md`.
 */

import { describe, expect, it } from 'vitest';
import type { Point } from '../utils/blueprintKernel';
import {
  amostradorDaGrade,
  amostrarPontosCotados,
  CELULAS_MINIMAS_DA_FONTE,
  espacamentoPorQualidade,
  estatisticasDoTerreno,
  gerarCurvas,
  hashDaEntrada,
  hashDoResultado,
  interpoladorDaTin,
  localParaGeo,
  malhaDaGrade,
  metrosPorGrauLatitude,
  metrosPorGrauLongitude,
  niveisDasCurvas,
  nosDaGrade,
  planejarGrade,
  recortarNoAnel,
  sugerirEquidistancia,
  TETO_DE_NOS,
  triangular,
  unirSegmentos,
  verificarResolucao,
  type GradeDeElevacao,
} from '../utils/blueprintTopografia';

/** Lote quadrado de 20 × 20 m. */
const QUADRADO: Point[] = [
  { x: 0, y: 0 },
  { x: 20000, y: 0 },
  { x: 20000, y: 20000 },
  { x: 0, y: 20000 },
];

/** Lote em L: braço direito só na metade de baixo. */
const EM_L: Point[] = [
  { x: 0, y: 0 },
  { x: 20000, y: 0 },
  { x: 20000, y: 10000 },
  { x: 10000, y: 10000 },
  { x: 10000, y: 20000 },
  { x: 0, y: 20000 },
];

/** Grade de 500 mm sobre o anel, com cota `fn(x, y)` (mm → m). */
function gradeDe(anel: Point[], fn: (x: number, y: number) => number | null): GradeDeElevacao {
  const grade = planejarGrade(anel, 500);
  const nos = nosDaGrade(grade);
  return { ...grade, cotasM: nos.map((n) => fn(n.x, n.y)) };
}

const RAMPA = (x: number) => 100 + (x / 1000) * 0.5; // 0,5 m por metro em X

describe('planejarGrade', () => {
  it('cobre o lote com uma célula de folga em volta', () => {
    const g = planejarGrade(QUADRADO, 500);
    expect(g.origem).toEqual({ x: -500, y: -500 });
    // De -500 a 20500 em passos de 500: 43 nós.
    expect(g.colunas).toBe(43);
    expect(g.linhas).toBe(43);
    const nos = nosDaGrade(g);
    expect(nos[nos.length - 1]).toEqual({ x: 20500, y: 20500 });
  });
});

describe('gerarCurvas — fixtures do PRD §20.2', () => {
  it('plano horizontal: nenhuma curva', () => {
    const curvas = gerarCurvas(gradeDe(QUADRADO, () => 100), QUADRADO, 1);
    expect(curvas).toEqual([]);
  });

  it('plano inclinado: uma reta vertical por nível, recortada na divisa', () => {
    const curvas = gerarCurvas(gradeDe(QUADRADO, RAMPA), QUADRADO, 1);
    // Cotas dentro do lote: 100 a 110 → níveis 101..109.
    expect(curvas.map((c) => c.cotaM)).toEqual([101, 102, 103, 104, 105, 106, 107, 108, 109]);
    for (const c of curvas) {
      const xEsperado = ((c.cotaM - 100) / 0.5) * 1000;
      for (const p of c.pontos) expect(p.x).toBeCloseTo(xEsperado, 3);
      const ys = c.pontos.map((p) => p.y);
      // Termina EXATAMENTE nas divisas de baixo e de cima — não meia célula antes.
      expect(Math.min(...ys)).toBeCloseTo(0, 6);
      expect(Math.max(...ys)).toBeCloseTo(20000, 6);
      expect(c.fechada).toBe(false);
    }
  });

  it('a cada 5 níveis uma mestra', () => {
    const curvas = gerarCurvas(gradeDe(QUADRADO, RAMPA), QUADRADO, 1);
    expect(curvas.filter((c) => c.mestra).map((c) => c.cotaM)).toEqual([105]);
  });

  it('cone: anéis fechados concêntricos, no raio certo', () => {
    const cone = (x: number, y: number) => 110 - 0.5 * (Math.hypot(x - 10000, y - 10000) / 1000);
    const curvas = gerarCurvas(gradeDe(QUADRADO, cone), QUADRADO, 1);
    // Cota 108 → raio 4 m; 107 → 6 m; 106 → 8 m. Todas cabem inteiras no lote.
    for (const [cota, raioM] of [
      [108, 4],
      [107, 6],
      [106, 8],
    ] as const) {
      const anel = curvas.filter((c) => c.cotaM === cota);
      expect(anel).toHaveLength(1);
      expect(anel[0].fechada).toBe(true);
      for (const p of anel[0].pontos) {
        const r = Math.hypot(p.x - 10000, p.y - 10000) / 1000;
        // Interpolação linear numa grade de 0,5 m: erro de poucos centímetros.
        expect(Math.abs(r - raioM)).toBeLessThan(0.1);
      }
    }
  });

  it('sela: cada ramo da hipérbole é um pedaço próprio', () => {
    const sela = (x: number, y: number) => 100 + ((x - 10000) ** 2 - (y - 10000) ** 2) / 1e8;
    const curvas = gerarCurvas(gradeDe(QUADRADO, sela), QUADRADO, 0.5);
    // 100,5: x² > y² → ramos à esquerda e à direita. 99,5: ramos em cima e embaixo.
    const acima = curvas.filter((c) => c.cotaM === 100.5);
    const abaixo = curvas.filter((c) => c.cotaM === 99.5);
    expect(acima).toHaveLength(2);
    expect(abaixo).toHaveLength(2);
    const ladoX = (c: { pontos: Point[] }) => Math.sign(c.pontos[0].x - 10000);
    expect(new Set(acima.map(ladoX))).toEqual(new Set([-1, 1]));
    const ladoY = (c: { pontos: Point[] }) => Math.sign(c.pontos[0].y - 10000);
    expect(new Set(abaixo.map(ladoY))).toEqual(new Set([-1, 1]));
  });

  it('nodata: a curva que atravessa o buraco sai partida, nunca interpolada', () => {
    const comBuraco = (x: number, y: number) =>
      x >= 9000 && x <= 11000 && y >= 8000 && y <= 12000 ? null : RAMPA(x);
    const grade = gradeDe(QUADRADO, comBuraco);
    const curvas = gerarCurvas(grade, QUADRADO, 1);
    // Cota 105 → x = 10 m, que cruza o buraco: dois pedaços.
    const em105 = curvas.filter((c) => c.cotaM === 105);
    expect(em105).toHaveLength(2);
    for (const c of em105) {
      for (const p of c.pontos) expect(p.y < 8000 || p.y > 12000).toBe(true);
    }
    // Cota 102 → x = 4 m, longe do buraco: inteira.
    expect(curvas.filter((c) => c.cotaM === 102)).toHaveLength(1);
    const est = estatisticasDoTerreno(grade, QUADRADO, curvas);
    expect(est.amostrasAusentes).toBeGreaterThan(0);
  });

  it('lote côncavo: a curva só existe onde o lote existe', () => {
    const curvas = gerarCurvas(gradeDe(EM_L, RAMPA), EM_L, 1);
    // Cota 107 → x = 14 m: só o braço de baixo (y ≤ 10 m).
    const em107 = curvas.filter((c) => c.cotaM === 107);
    expect(em107).toHaveLength(1);
    const ys = em107[0].pontos.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...ys)).toBeCloseTo(10000, 6);
    // Cota 102 → x = 4 m: altura inteira.
    const em102 = curvas.filter((c) => c.cotaM === 102);
    expect(Math.max(...em102[0].pontos.map((p) => p.y))).toBeCloseTo(20000, 6);
  });

  it('é determinístico: mesma grade, mesmo resultado, mesmo hash', () => {
    const g = gradeDe(QUADRADO, RAMPA);
    const a = gerarCurvas(g, QUADRADO, 1);
    const b = gerarCurvas(g, QUADRADO, 1);
    expect(hashDoResultado(g, a)).toBe(hashDoResultado(g, b));
    expect(hashDoResultado(g, a)).not.toBe(hashDoResultado(g, gerarCurvas(g, QUADRADO, 2)));
  });
});

describe('unirSegmentos e recortarNoAnel', () => {
  it('encadeia segmentos que dividem ponta, nos dois sentidos', () => {
    const p = (x: number, y: number) => ({ x, y });
    const linhas = unirSegmentos([
      [p(1, 0), p(2, 0)],
      [p(0, 0), p(1, 0)],
      [p(2, 0), p(3, 0)],
    ]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].pontos.map((q) => q.x)).toEqual([0, 1, 2, 3]);
    expect(linhas[0].fechada).toBe(false);
  });

  it('um quadrado de segmentos vira uma curva fechada', () => {
    const p = (x: number, y: number) => ({ x, y });
    const linhas = unirSegmentos([
      [p(0, 0), p(1, 0)],
      [p(1, 0), p(1, 1)],
      [p(1, 1), p(0, 1)],
      [p(0, 1), p(0, 0)],
    ]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].fechada).toBe(true);
  });

  it('recorta uma reta que entra e sai do lote, mantendo só o de dentro', () => {
    const pedacos = recortarNoAnel(
      [
        { x: -5000, y: 5000 },
        { x: 25000, y: 5000 },
      ],
      QUADRADO,
    );
    expect(pedacos).toHaveLength(1);
    expect(pedacos[0][0]).toEqual({ x: 0, y: 5000 });
    expect(pedacos[0][pedacos[0].length - 1]).toEqual({ x: 20000, y: 5000 });
  });
});

describe('estatísticas', () => {
  it('plano: mínimo = máximo = média, amplitude zero, área do lote', () => {
    const g = gradeDe(QUADRADO, () => 100);
    const est = estatisticasDoTerreno(g, QUADRADO, []);
    expect(est.cotaMinM).toBe(100);
    expect(est.cotaMaxM).toBe(100);
    expect(est.cotaMediaM).toBe(100);
    expect(est.amplitudeM).toBe(0);
    expect(est.areaM2).toBe(400);
    expect(est.amostrasAusentes).toBe(0);
    expect(est.espacamentoM).toBe(0.5);
  });

  it('rampa: amplitude de 10 m e comprimento das curvas = 9 × 20 m', () => {
    const g = gradeDe(QUADRADO, RAMPA);
    const curvas = gerarCurvas(g, QUADRADO, 1);
    const est = estatisticasDoTerreno(g, QUADRADO, curvas);
    expect(est.amplitudeM).toBeCloseTo(10, 6);
    expect(est.curvas).toBe(9);
    expect(est.comprimentoDasCurvasM).toBeCloseTo(180, 3);
  });
});

describe('níveis e equidistância', () => {
  it('sugere pela amplitude, nas faixas do PRD', () => {
    expect(sugerirEquidistancia(1.5).sugestaoM).toBe(0.25);
    expect(sugerirEquidistancia(6).sugestaoM).toBe(0.5);
    expect(sugerirEquidistancia(30).sugestaoM).toBe(2);
    expect(sugerirEquidistancia(120).sugestaoM).toBe(5);
  });

  it('níveis são os múltiplos estritamente entre mínimo e máximo', () => {
    expect(niveisDasCurvas(100, 110, 2)).toEqual([102, 104, 106, 108]);
    expect(niveisDasCurvas(100.2, 100.9, 0.25)).toEqual([100.25, 100.5, 100.75]);
    expect(niveisDasCurvas(100, 100, 1)).toEqual([]);
  });

  it('recusa equidistância que daria curvas demais', () => {
    expect(() => niveisDasCurvas(0, 1000, 0.5)).toThrow(/máximo/);
  });
});

describe('espaçamento por qualidade e recusa por resolução', () => {
  it('sem fonte remota, o passo vem do preset', () => {
    expect(espacamentoPorQualidade(QUADRADO, 'EQUILIBRADA', null).espacamentoMm).toBe(500);
    expect(espacamentoPorQualidade(QUADRADO, 'RAPIDA', null).espacamentoMm).toBe(1000);
    expect(espacamentoPorQualidade(QUADRADO, 'DETALHADA', null).espacamentoMm).toBe(250);
  });

  it('com DEM de 90 m, nunca mais fino que meia célula — e avisa', () => {
    const r = espacamentoPorQualidade(QUADRADO, 'DETALHADA', 90);
    expect(r.espacamentoMm).toBeGreaterThanOrEqual(45000);
    expect(r.avisos.join(' ')).toMatch(/mais densa que a fonte/);
  });

  it('nunca passa do teto de nós', () => {
    const gleba: Point[] = [
      { x: 0, y: 0 },
      { x: 2_000_000, y: 0 },
      { x: 2_000_000, y: 2_000_000 },
      { x: 0, y: 2_000_000 },
    ];
    const { espacamentoMm } = espacamentoPorQualidade(gleba, 'DETALHADA', null);
    const g = planejarGrade(gleba, espacamentoMm);
    expect(g.colunas * g.linhas).toBeLessThanOrEqual(TETO_DE_NOS);
  });

  it('DR-08: lote de 20 m com fonte de 90 m é recusado; gleba de 300 m passa', () => {
    const r = verificarResolucao(QUADRADO, 90);
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/pontos cotados/);
    const gleba: Point[] = [
      { x: 0, y: 0 },
      { x: 300_000, y: 0 },
      { x: 300_000, y: 300_000 },
      { x: 0, y: 300_000 },
    ];
    const ok = verificarResolucao(gleba, 90);
    expect(ok.ok).toBe(true);
    expect(ok.celulasNoLadoMenor).toBeGreaterThanOrEqual(CELULAS_MINIMAS_DA_FONTE);
  });
});

describe('georreferência', () => {
  const geo = { latitude: -22.6, longitude: -46.1 };

  it('+X anda para leste e +Y para norte quando não há giro', () => {
    const leste = localParaGeo({ x: 1000, y: 0 }, geo);
    expect(leste.lat).toBeCloseTo(geo.latitude, 9);
    expect(leste.lon - geo.longitude).toBeCloseTo(1 / metrosPorGrauLongitude(-22.6), 12);
    const norte = localParaGeo({ x: 0, y: 1000 }, geo);
    expect(norte.lon).toBeCloseTo(geo.longitude, 9);
    expect(norte.lat - geo.latitude).toBeCloseTo(1 / metrosPorGrauLatitude(-22.6), 12);
  });

  it('com o desenho girado 90° anti-horário, +Y aponta para oeste', () => {
    const p = localParaGeo({ x: 0, y: 1000 }, { ...geo, rotacaoNorteDeg: 90 });
    expect(p.lat).toBeCloseTo(geo.latitude, 9);
    expect(p.lon).toBeLessThan(geo.longitude);
  });

  it('um grau de latitude vale ~111 km; de longitude, menos perto do polo', () => {
    expect(metrosPorGrauLatitude(0)).toBeCloseTo(110574, -1);
    expect(metrosPorGrauLongitude(60)).toBeLessThan(metrosPorGrauLongitude(0) / 1.9);
  });
});

describe('pontos cotados → TIN', () => {
  const PLANO = (x: number, y: number) => 100 + x / 10000 + y / 20000;
  const cantos = QUADRADO.map((p) => ({ ...p, cotaM: PLANO(p.x, p.y) }));

  it('triangula os quatro cantos em dois triângulos', () => {
    expect(triangular(QUADRADO)).toHaveLength(2);
  });

  it('interpola exatamente um plano e recusa fora da envoltória', () => {
    const f = interpoladorDaTin(cantos)!;
    expect(f({ x: 10000, y: 10000 })).toBeCloseTo(PLANO(10000, 10000), 9);
    expect(f({ x: 3000, y: 17000 })).toBeCloseTo(PLANO(3000, 17000), 9);
    expect(f({ x: 25000, y: 10000 })).toBeNull();
  });

  it('três pontos alinhados não bastam; ponto repetido não quebra', () => {
    expect(
      interpoladorDaTin([
        { x: 0, y: 0, cotaM: 1 },
        { x: 1000, y: 1000, cotaM: 2 },
        { x: 2000, y: 2000, cotaM: 3 },
      ]),
    ).toBeNull();
    expect(interpoladorDaTin([...cantos, { ...cantos[0], cotaM: 999 }])).not.toBeNull();
  });

  it('preenche a grade e deixa `nodata` fora da TIN', () => {
    const g = amostrarPontosCotados(planejarGrade(QUADRADO, 500), cantos);
    const nos = nosDaGrade(g);
    const dentro = nos.findIndex((n) => n.x === 5000 && n.y === 5000);
    expect(g.cotasM[dentro]).toBeCloseTo(PLANO(5000, 5000), 9);
    // O nó da folga (-500, -500) está fora da envoltória convexa.
    expect(g.cotasM[0]).toBeNull();
    // E o desenho continua honesto: as curvas de um plano são retas.
    const curvas = gerarCurvas(g, QUADRADO, 0.5);
    expect(curvas.length).toBeGreaterThan(0);
  });
});

describe('amostradorDaGrade', () => {
  it('é bilinear exato num plano e nulo fora da grade', () => {
    const g = gradeDe(QUADRADO, (x, y) => 100 + x / 10000 + y / 20000);
    const f = amostradorDaGrade(g);
    expect(f({ x: 1234, y: 5678 })).toBeCloseTo(100 + 0.1234 + 0.2839, 9);
    expect(f({ x: 20500, y: 20500 })).not.toBeNull();
    expect(f({ x: 30000, y: 0 })).toBeNull();
  });

  it('célula com nodata devolve nulo', () => {
    const g = gradeDe(QUADRADO, (x, y) => (x === 10000 && y === 10000 ? null : 100));
    const f = amostradorDaGrade(g);
    expect(f({ x: 10100, y: 10100 })).toBeNull();
    expect(f({ x: 2000, y: 2000 })).toBe(100);
  });
});

describe('malhaDaGrade (3D)', () => {
  it('3 × 3 nós = 4 células = 8 triângulos, em metros e sem negar y', () => {
    const g: GradeDeElevacao = {
      origem: { x: 0, y: 0 },
      espacamentoMm: 1000,
      colunas: 3,
      linhas: 3,
      cotasM: [100, 100, 100, 101, 101, 101, 102, 102, 102],
    };
    const m = malhaDaGrade(g, 100)!;
    expect(m.triangulos).toBe(8);
    expect(m.posicoes.length).toBe(9 * 3);
    // Nó (l=2, c=1): X = 1 m, Y = 102 − 100 = 2 m, Z = +2 m.
    expect(Array.from(m.posicoes.slice(7 * 3, 8 * 3))).toEqual([1, 2, 2]);
    expect(m.minY).toBe(0);
    expect(m.maxY).toBe(2);
  });

  it('nodata no centro apaga as quatro células que o tocam', () => {
    const g: GradeDeElevacao = {
      origem: { x: 0, y: 0 },
      espacamentoMm: 1000,
      colunas: 3,
      linhas: 3,
      cotasM: [100, 100, 100, 100, null, 100, 100, 100, 100],
    };
    expect(malhaDaGrade(g, 100)).toBeNull();
  });

  it('decima até caber no teto de triângulos, preservando a borda', () => {
    const g = gradeDe(QUADRADO, RAMPA); // 43 × 43 nós → 3.528 triângulos
    const m = malhaDaGrade(g, 100, 0.001, 500)!;
    expect(m.triangulos).toBeLessThanOrEqual(500);
    const xs = Array.from(m.posicoes).filter((_, i) => i % 3 === 0);
    expect(Math.max(...xs)).toBeCloseTo(20.5, 6);
  });
});

describe('hash da entrada', () => {
  const base = {
    fonteCodigo: 'PONTOS_COTADOS',
    datasetVersao: 'x',
    anel: QUADRADO,
    georreferencia: null,
    espacamentoMm: 500,
    equidistanciaM: 1,
    pontosCotados: [],
  };
  it('mesma entrada, mesmo hash; equidistância diferente, hash diferente', () => {
    expect(hashDaEntrada(base)).toBe(hashDaEntrada({ ...base }));
    expect(hashDaEntrada(base)).not.toBe(hashDaEntrada({ ...base, equidistanciaM: 2 }));
  });
  it('a cota do ponto de origem não entra: ela não muda a grade amostrada', () => {
    const a = hashDaEntrada({ ...base, georreferencia: { latitude: -22, longitude: -46, elevacaoM: 700 } });
    const b = hashDaEntrada({ ...base, georreferencia: { latitude: -22, longitude: -46, elevacaoM: 900 } });
    expect(a).toBe(b);
  });
});
