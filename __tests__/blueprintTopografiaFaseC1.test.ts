/**
 * TERRAPLENAGEM C1 — platô inclinado e volume entre duas superfícies.
 *
 * Os casos são ANALÍTICOS: terreno plano e um platô conhecido, para que o
 * número esperado saia da fórmula e não de outra rodada do próprio motor.
 *
 *  - platô a 2% sobre terreno plano, cota no centróide igual à do terreno:
 *    corte = aterro (o plano gira em torno do centro), e a inclinação a 0%
 *    devolve exatamente a conta horizontal de antes;
 *  - volume entre A e A = 0; entre A e A + 1 m = área × 1 m, ± 0,1%;
 *  - área de superfície de um plano inclinado = projetada / cos(θ).
 */
import { describe, expect, it } from 'vitest';
import type { GradeDeElevacao } from '../utils/blueprintTopografia';
import {
  terraplenagemPreliminar,
  terraplenagemComTalude,
  cotaDoPlatoEm,
  centroDoPlato,
  cotaDeProjeto,
  volumeEntreSuperficies,
  areaDeSuperficie,
  PARAMETROS_PADRAO,
  SEM_INCLINACAO,
} from '../utils/blueprintTopografiaAnalises';

/** Grade quadrada de `n` nós por lado a `esp` mm, com cota dada por f(x, y) em METROS de modelo. */
function grade(n: number, esp: number, f: (xM: number, yM: number) => number | null): GradeDeElevacao {
  const cotasM: (number | null)[] = [];
  for (let l = 0; l < n; l++) for (let c = 0; c < n; c++) cotasM.push(f((c * esp) / 1000, (l * esp) / 1000));
  return { origem: { x: 0, y: 0 }, espacamentoMm: esp, colunas: n, linhas: n, cotasM };
}

/** 41 × 41 nós a 1 m: 40 × 40 m. Platô = quadrado central de 20 × 20 m. */
const ESP = 1000;
const N = 41;
const PLATO = [
  { x: 10000, y: 10000 },
  { x: 30000, y: 10000 },
  { x: 30000, y: 30000 },
  { x: 10000, y: 30000 },
];

describe('cota do platô num ponto', () => {
  it('sem inclinação é constante; o centróide do quadrado é o centro', () => {
    const centro = centroDoPlato(PLATO);
    expect(centro).toEqual({ x: 20000, y: 20000 });
    expect(cotaDoPlatoEm(100, null, centro, { x: 0, y: 0 })).toBe(100);
    expect(cotaDoPlatoEm(100, SEM_INCLINACAO, centro, { x: 99999, y: -5 })).toBe(100);
  });

  it('a 2% longitudinal no azimute 0 (+Y), 10 m ao norte do centro sobe 0,20 m', () => {
    const centro = centroDoPlato(PLATO);
    const inc = { declividadeLongPct: 2, declividadeTransvPct: 0, azimuteDeg: 0 };
    expect(cotaDoPlatoEm(100, inc, centro, { x: 20000, y: 30000 })).toBeCloseTo(100.2, 9);
    expect(cotaDoPlatoEm(100, inc, centro, { x: 20000, y: 10000 })).toBeCloseTo(99.8, 9);
    // transversal não mexe no eixo longitudinal
    expect(cotaDoPlatoEm(100, inc, centro, { x: 30000, y: 20000 })).toBeCloseTo(100, 9);
  });

  it('o azimute gira o plano: a 90° (+X) o caimento longitudinal vai para leste', () => {
    const centro = centroDoPlato(PLATO);
    const inc = { declividadeLongPct: 2, declividadeTransvPct: 0, azimuteDeg: 90 };
    expect(cotaDoPlatoEm(100, inc, centro, { x: 30000, y: 20000 })).toBeCloseTo(100.2, 9);
    expect(cotaDoPlatoEm(100, inc, centro, { x: 20000, y: 30000 })).toBeCloseTo(100, 9);
  });

  it('a transversal cai para a DIREITA de quem olha no azimute', () => {
    const centro = centroDoPlato(PLATO);
    // olhando para +Y (azimute 0), a direita é +X
    const inc = { declividadeLongPct: 0, declividadeTransvPct: 1, azimuteDeg: 0 };
    expect(cotaDoPlatoEm(100, inc, centro, { x: 30000, y: 20000 })).toBeCloseTo(100.1, 9);
    expect(cotaDoPlatoEm(100, inc, centro, { x: 10000, y: 20000 })).toBeCloseTo(99.9, 9);
  });
});

describe('platô inclinado no motor', () => {
  const plano = grade(N, ESP, () => 100);

  it('inclinação zero devolve EXATAMENTE a conta horizontal', () => {
    const a = terraplenagemPreliminar(plano, PLATO, 101);
    const b = terraplenagemPreliminar(plano, PLATO, 101, SEM_INCLINACAO);
    expect(b).toEqual(a);
    const ct = terraplenagemComTalude(plano, PLATO, 101, PARAMETROS_PADRAO);
    const ci = terraplenagemComTalude(plano, PLATO, 101, PARAMETROS_PADRAO, SEM_INCLINACAO);
    expect(ci).toEqual(ct);
  });

  it('platô a 2% com a cota do centro igual ao terreno: corte = aterro no eixo de equilíbrio', () => {
    const inc = { declividadeLongPct: 2, declividadeTransvPct: 0, azimuteDeg: 0 };
    const t = terraplenagemPreliminar(plano, PLATO, 100, inc);
    expect(t.areaPlatoM2).toBeCloseTo(400, 6);
    // Metade do platô sobe, metade desce, simetricamente: os volumes se igualam.
    expect(t.corteM3).toBeGreaterThan(0);
    expect(t.corteM3).toBeCloseTo(t.aterroM3, 6);
    // E o total é o de um "telhado": ∫|2% × d| sobre 20 m de largura, 10 m de meia-extensão → 2 × (20 × 0,02 × 10²/2) = 40 m³ na soma corte+aterro.
    expect(t.corteM3 + t.aterroM3).toBeCloseTo(40, 1);
  });

  it('platô a 2% que sobe: o aterro cresce e o corte some quando a cota central sobe 0,2 m', () => {
    const inc = { declividadeLongPct: 2, declividadeTransvPct: 0, azimuteDeg: 0 };
    const t = terraplenagemPreliminar(plano, PLATO, 100.2, inc);
    // ponto mais baixo do plano = 100,2 − 0,2 = 100,0 → nunca abaixo do terreno.
    expect(t.corteM3).toBeCloseTo(0, 6);
    expect(t.aterroM3).toBeCloseTo(0.2 * 400, 1);
  });

  it('a cota de projeto dentro do platô segue o plano, e na borda o talude nasce da cota inclinada', () => {
    const inc = { declividadeLongPct: 2, declividadeTransvPct: 0, azimuteDeg: 0 };
    const projeto = cotaDeProjeto(plano, PLATO, 100, PARAMETROS_PADRAO, inc);
    expect(projeto({ x: 20000, y: 20000 })).toBeCloseTo(100, 9);
    expect(projeto({ x: 20000, y: 29000 })).toBeCloseTo(100.18, 9);
    // Fora do anel, 10 cm além da borda norte, o plano extrapolado vale ~100,2:
    // o terreno (100) está ABAIXO, então é aterro em talude que nasce de ~100,2
    // e ainda não chegou ao chão (a 1:1,5 ele desce ~7 cm em 10 cm).
    const junto = projeto({ x: 20000, y: 30100 })!;
    expect(junto).toBeGreaterThan(100);
    expect(junto).toBeLessThan(100.202);
    // Meio metro além, o talude já alcançou o terreno: volta a ser a cota natural.
    expect(projeto({ x: 20000, y: 30500 })).toBeCloseTo(100, 9);
  });
});

describe('volume entre duas superfícies', () => {
  const antes = grade(N, ESP, () => 100);

  it('a mesma superfície contra ela mesma dá zero', () => {
    const v = volumeEntreSuperficies(antes, antes);
    expect(v.corteM3).toBe(0);
    expect(v.aterroM3).toBe(0);
    expect(v.saldoM3).toBe(0);
    expect(v.areaM2).toBeCloseTo(40 * 40, 6);
  });

  it('A contra A + 1 m dá área × 1 m de ATERRO, ± 0,1%', () => {
    const depois = grade(N, ESP, () => 101);
    const v = volumeEntreSuperficies(antes, depois);
    expect(v.aterroM3).toBeCloseTo(1600, 6);
    expect(Math.abs(v.aterroM3 - 1600) / 1600).toBeLessThan(0.001);
    expect(v.corteM3).toBe(0);
    // e ao contrário é CORTE
    const w = volumeEntreSuperficies(depois, antes);
    expect(w.corteM3).toBeCloseTo(1600, 6);
    expect(w.aterroM3).toBe(0);
  });

  it('o anel recorta a conta, e célula sem cota é contada — não escondida', () => {
    const depois = grade(N, ESP, (x, y) => (x < 5 && y < 5 ? null : 101));
    const v = volumeEntreSuperficies(antes, depois, PLATO);
    expect(v.areaM2).toBeCloseTo(400, 6); // só o platô
    expect(v.celulasSemCota).toBe(0); // o canto sem cota fica fora do anel
    const tudo = volumeEntreSuperficies(antes, depois);
    expect(tudo.celulasSemCota).toBeGreaterThan(0);
    expect(tudo.areaM2).toBeLessThan(1600);
  });

  it('⚠️ malhas diferentes não se comparam: erro DITO, não interpolação silenciosa', () => {
    const outra = grade(21, 2000, () => 100);
    expect(() => volumeEntreSuperficies(antes, outra)).toThrow(/mesma malha/);
  });
});

describe('área de superfície', () => {
  it('plano horizontal: área real = projetada', () => {
    const g = grade(N, ESP, () => 100);
    const a = areaDeSuperficie(g);
    expect(a.areaM2).toBeCloseTo(1600, 6);
    expect(a.areaProjetadaM2).toBeCloseTo(1600, 6);
  });

  it('plano inclinado: área real = projetada / cos θ (talude 1:1 → √2)', () => {
    const g = grade(N, ESP, (x) => x); // sobe 1 m por metro em X → 45°
    const a = areaDeSuperficie(g);
    expect(a.areaM2 / a.areaProjetadaM2).toBeCloseTo(Math.SQRT2, 6);
  });

  it('recorta pelo anel e conta a célula sem cota', () => {
    const g = grade(N, ESP, (x, y) => (x === 15 && y === 15 ? null : 100));
    const a = areaDeSuperficie(g, PLATO);
    expect(a.celulasSemCota).toBe(4); // o nó (15,15) é canto de 4 células
    expect(a.areaProjetadaM2).toBeCloseTo(400 - 4, 6);
  });
});
