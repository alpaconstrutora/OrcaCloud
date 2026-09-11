/**
 * Fase 4 da topografia: banqueta, via de serviço, canaleta, talude por aresta
 * e hipsometria por equidistância (`utils/blueprintTopografiaAnalises.ts`).
 */
import { describe, expect, it } from 'vitest';
import type { Point } from '../utils/blueprintKernel';
import { nosDaGrade, planejarGrade, type GradeDeElevacao } from '../utils/blueprintTopografia';
import {
  alturaNoTalude,
  distanciaAoAnelComAresta,
  hipsometriaDaGrade,
  PARAMETROS_PADRAO,
  superficieDeProjeto,
  taludeDaAresta,
  terraplenagemComTalude,
} from '../utils/blueprintTopografiaAnalises';

const LOTE: Point[] = [
  { x: 0, y: 0 },
  { x: 40000, y: 0 },
  { x: 40000, y: 40000 },
  { x: 0, y: 40000 },
];
const PLATO: Point[] = [
  { x: 10000, y: 10000 },
  { x: 30000, y: 10000 },
  { x: 30000, y: 30000 },
  { x: 10000, y: 30000 },
];

function gradeDe(fn: (x: number, y: number) => number | null, esp = 1000): GradeDeElevacao {
  const grade = planejarGrade(LOTE, esp);
  return { ...grade, cotasM: nosDaGrade(grade).map((n) => fn(n.x, n.y)) };
}

describe('alturaNoTalude — banqueta', () => {
  it('sem banqueta é a reta d/h', () => {
    expect(alturaNoTalude(3, 1.5, 0, 0).alturaM).toBeCloseTo(2, 9);
    expect(alturaNoTalude(3, 1.5, undefined, undefined).naBanqueta).toBe(false);
  });
  it('com lance de 2 m e banqueta de 1 m: sobe 2 m em 3 m, para 1 m, sobe de novo', () => {
    const h = 1.5;
    expect(alturaNoTalude(3, h, 2, 1).alturaM).toBeCloseTo(2, 9); // fim do 1º lance
    const naBanqueta = alturaNoTalude(3.5, h, 2, 1);
    expect(naBanqueta.alturaM).toBeCloseTo(2, 9);
    expect(naBanqueta.naBanqueta).toBe(true);
    expect(alturaNoTalude(4, h, 2, 1).alturaM).toBeCloseTo(2, 9); // fim da banqueta
    expect(alturaNoTalude(5.5, h, 2, 1).alturaM).toBeCloseTo(3, 9); // 2º lance
  });
});

describe('talude por aresta e via', () => {
  it('a aresta mais próxima decide o h; vazio herda o padrão', () => {
    const p = { ...PARAMETROS_PADRAO, taludePorAresta: [null, { corteH: 3 }, undefined as never, { aterroH: 1 }] };
    expect(taludeDaAresta(p, 0)).toEqual({ corteH: 1.5, aterroH: 1.5 });
    expect(taludeDaAresta(p, 1)).toEqual({ corteH: 3, aterroH: 1.5 });
    expect(taludeDaAresta(p, 3)).toEqual({ corteH: 1.5, aterroH: 1 });
    // A leste do platô (x > 30 m) a aresta mais próxima é a 1 (30000,10000→30000,30000).
    expect(distanciaAoAnelComAresta({ x: 33000, y: 20000 }, PLATO).aresta).toBe(1);
  });

  it('a via de serviço adia o talude: dentro da via a superfície é o platô', () => {
    const p = { ...PARAMETROS_PADRAO, larguraDaViaM: 2 };
    const naVia = superficieDeProjeto(100, 1500, 0, p);
    expect(naVia.naVia).toBe(true);
    expect(naVia.corteM).toBe(100);
    const fora = superficieDeProjeto(100, 3500, 0, p); // 1,5 m além da via
    expect(fora.naVia).toBe(false);
    expect(fora.corteM).toBeCloseTo(101, 9);
  });

  it('terreno plano acima do platô com via de 2 m: a via corta na cota do platô e o talude começa depois', () => {
    const g = gradeDe(() => 103);
    const sem = terraplenagemComTalude(g, PLATO, 100, { ...PARAMETROS_PADRAO, larguraDaViaM: 0 });
    const com = terraplenagemComTalude(g, PLATO, 100, { ...PARAMETROS_PADRAO, larguraDaViaM: 2 });
    expect(com.areaViaM2).toBeGreaterThan(0);
    expect(com.ladoDaCelula.some((l) => l === 'VIA_CORTE')).toBe(true);
    // A via corta 3 m em toda a sua área; o total de corte cresce.
    expect(com.corteTotalM3).toBeGreaterThan(sem.corteTotalM3);
    expect(com.canaletaPeDeCorteM).toBeGreaterThan(0);
    expect(com.canaletaCristaDeAterroM).toBe(0);
  });

  it('talude de aterro num lado só (1:3) alarga a faixa daquele lado', () => {
    const g = gradeDe(() => 98);
    const igual = terraplenagemComTalude(g, PLATO, 100, PARAMETROS_PADRAO);
    const leste = terraplenagemComTalude(g, PLATO, 100, {
      ...PARAMETROS_PADRAO,
      taludePorAresta: [null, { aterroH: 3 }, null, null],
    });
    expect(leste.areaTaludeM2).toBeGreaterThan(igual.areaTaludeM2);
    expect(leste.canaletaCristaDeAterroM).toBeGreaterThan(0);
  });

  it('banqueta cria patamares e canaleta de banqueta', () => {
    const g = gradeDe(() => 106);
    const t = terraplenagemComTalude(g, PLATO, 100, {
      ...PARAMETROS_PADRAO,
      alturaDoLanceM: 2,
      larguraDaBanquetaM: 1,
    });
    expect(t.areaBanquetasM2).toBeGreaterThan(0);
    expect(t.canaletaDeBanquetaM).toBeCloseTo(t.areaBanquetasM2 / 1, 9);
    // Com banqueta o talude alcança mais longe que sem: mais área tocada.
    const semBanqueta = terraplenagemComTalude(g, PLATO, 100, { ...PARAMETROS_PADRAO, alturaDoLanceM: 0 });
    expect(t.areaTaludeM2).toBeGreaterThan(semBanqueta.areaTaludeM2);
  });
});

describe('hipsometria por equidistância', () => {
  it('classes em cotas redondas, múltiplas do intervalo', () => {
    const g = gradeDe((x) => 100.3 + x / 10000); // 100,35 a 104,25 nas células
    const h = hipsometriaDaGrade(g, LOTE, { modo: 'EQUIDISTANCIA', intervaloM: 1 });
    expect(h.classes[0].deM).toBe(100);
    expect(h.classes.map((c) => c.deM)).toEqual([100, 101, 102, 103, 104]);
    expect(h.classes[1].ateM).toBe(102);
    const total = h.classes.reduce((a, c) => a + c.areaM2, 0);
    expect(total).toBeCloseTo(1600, 6);
  });

  it('acima do máximo de classes o intervalo dobra', () => {
    const g = gradeDe((x) => 100 + x / 1000); // 0 a 40 m
    const h = hipsometriaDaGrade(g, LOTE, { modo: 'EQUIDISTANCIA', intervaloM: 1, maxClasses: 12 });
    expect(h.classes.length).toBeLessThanOrEqual(12);
    expect(h.classes[1].deM - h.classes[0].deM).toBeGreaterThanOrEqual(4);
  });

  it('o modo IGUAIS continua o de sempre (número como antes)', () => {
    const g = gradeDe((x) => 100 + x / 1000);
    expect(hipsometriaDaGrade(g, LOTE, 8).classes).toHaveLength(8);
    expect(hipsometriaDaGrade(g, LOTE, { modo: 'IGUAIS', n: 4 }).classes).toHaveLength(4);
  });
});
