/**
 * Fase 3 da topografia: talude/empolamento/contração, perfil altimétrico e
 * hipsometria (`utils/blueprintTopografiaAnalises.ts`).
 *
 * Fixtures com resposta à mão: platô num terreno PLANO acima dele gera talude
 * de corte só numa faixa de largura conhecida; empolamento 25 % dá 1,25 ×;
 * contração 15 % dá 1,15 ×; rampa dá declividade média exata; rampa de 10 m em
 * 8 classes dá 1/8 da área em cada.
 */
import { describe, expect, it } from 'vitest';
import type { Point } from '../utils/blueprintKernel';
import { amostradorDaGrade, nosDaGrade, planejarGrade, type GradeDeElevacao } from '../utils/blueprintTopografia';
import {
  distanciaAoAnel,
  estatisticasDoPerfil,
  hipsometriaDaGrade,
  PARAMETROS_PADRAO,
  perfilAoLongo,
  terraplenagemComTalude,
} from '../utils/blueprintTopografiaAnalises';

const LOTE: Point[] = [
  { x: 0, y: 0 },
  { x: 40000, y: 0 },
  { x: 40000, y: 40000 },
  { x: 0, y: 40000 },
];
/** Platô central de 20 × 20 m. */
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

describe('distanciaAoAnel', () => {
  it('zero dentro, distância à borda fora', () => {
    expect(distanciaAoAnel({ x: 20000, y: 20000 }, PLATO)).toBe(0);
    expect(distanciaAoAnel({ x: 35000, y: 20000 }, PLATO)).toBe(5000);
    expect(distanciaAoAnel({ x: 33000, y: 34000 }, PLATO)).toBeCloseTo(5000, 6);
  });
});

describe('terraplenagemComTalude', () => {
  it('terreno plano 3 m acima do platô: corte no platô e talude de corte numa faixa de 4,5 m', () => {
    // Platô em 100, terreno em 103, talude 1:1,5 → o talude encontra o terreno
    // a 3 × 1,5 = 4,5 m da borda. Fora dessa faixa nada é tocado.
    const g = gradeDe(() => 103);
    const t = terraplenagemComTalude(g, PLATO, 100, PARAMETROS_PADRAO);
    expect(t.corteM3).toBeCloseTo(3 * 400, 6);
    expect(t.aterroM3).toBe(0);
    expect(t.taludeAterroM3).toBe(0);
    expect(t.taludeCorteM3).toBeGreaterThan(0);
    // Toda célula de talude fica a menos de 4,5 m da borda; célula a 5,5 m não.
    const idx = (x: number, y: number) => Math.floor((y + 1000) / 1000) * (g.colunas - 1) + Math.floor((x + 1000) / 1000);
    expect(t.ladoDaCelula[idx(32500, 20500)]).toBe('TALUDE_CORTE'); // 2,5 m da borda
    expect(t.ladoDaCelula[idx(35500, 20500)]).toBeNull(); // 5,5 m da borda
    // Volume do talude numa aresta reta: ∫₀^4,5 (3 − d/1,5) dd = 6,75 m³ por metro
    // de borda; o perímetro tem 80 m mais os cantos — só a ordem de grandeza.
    expect(t.taludeCorteM3).toBeGreaterThan(6.75 * 80 * 0.8);
    expect(t.taludeCorteM3).toBeLessThan(6.75 * 80 * 1.5);
    expect(t.corteTotalM3).toBeCloseTo(t.corteM3 + t.taludeCorteM3, 9);
  });

  it('terreno plano abaixo do platô: aterro e talude de aterro', () => {
    const t = terraplenagemComTalude(gradeDe(() => 98), PLATO, 100, PARAMETROS_PADRAO);
    expect(t.aterroM3).toBeCloseTo(2 * 400, 6);
    expect(t.taludeAterroM3).toBeGreaterThan(0);
    expect(t.taludeCorteM3).toBe(0);
    expect(t.ladoDaCelula.some((l) => l === 'TALUDE_ATERRO')).toBe(true);
  });

  it('empolamento e contração no balanço de materiais', () => {
    const t = terraplenagemComTalude(gradeDe(() => 103), PLATO, 100, {
      taludeCorteH: 1.5,
      taludeAterroH: 1.5,
      empolamentoPct: 25,
      contracaoPct: 15,
    });
    expect(t.corteSoltoM3).toBeCloseTo(t.corteTotalM3 * 1.25, 9);
    expect(t.aterroEmBancoM3).toBe(0);
    expect(t.botaForaM3).toBeCloseTo(t.corteTotalM3, 9);
    expect(t.emprestimoM3).toBe(0);

    const a = terraplenagemComTalude(gradeDe(() => 98), PLATO, 100, {
      taludeCorteH: 1.5,
      taludeAterroH: 1.5,
      empolamentoPct: 25,
      contracaoPct: 15,
    });
    expect(a.aterroEmBancoM3).toBeCloseTo(a.aterroTotalM3 * 1.15, 9);
    expect(a.emprestimoM3).toBeCloseTo(a.aterroEmBancoM3, 9);
    expect(a.botaForaM3).toBe(0);
  });

  it('talude mais íngreme (1:1) toca menos terreno que 1:2', () => {
    const g = gradeDe(() => 103);
    const ingreme = terraplenagemComTalude(g, PLATO, 100, { ...PARAMETROS_PADRAO, taludeCorteH: 1 });
    const suave = terraplenagemComTalude(g, PLATO, 100, { ...PARAMETROS_PADRAO, taludeCorteH: 2 });
    expect(ingreme.areaTaludeM2).toBeLessThan(suave.areaTaludeM2);
    expect(ingreme.taludeCorteM3).toBeLessThan(suave.taludeCorteM3);
  });
});

describe('perfil altimétrico', () => {
  const RAMPA = (x: number) => 100 + (x / 1000) * 0.1; // 10 % em X

  it('rampa: declividade média exata, desnível = fim − início, passa pelos vértices', () => {
    const f = amostradorDaGrade(gradeDe(RAMPA));
    const perfil = perfilAoLongo(f, [{ x: 0, y: 5000 }, { x: 20000, y: 5000 }], 250);
    expect(perfil[0].distM).toBe(0);
    expect(perfil[perfil.length - 1].distM).toBeCloseTo(20, 9);
    const e = estatisticasDoPerfil(perfil);
    expect(e.comprimentoM).toBeCloseTo(20, 9);
    expect(e.desnivelM).toBeCloseTo(2, 9);
    expect(e.declividadeMediaP).toBeCloseTo(10, 6);
    expect(e.declividadeMaxP).toBeCloseTo(10, 6);
    expect(e.subidaM).toBeCloseTo(2, 9);
    expect(e.descidaM).toBeCloseTo(0, 9);
    expect(e.pontosSemCota).toBe(0);
  });

  it('polilinha soma as distâncias e volta a descer', () => {
    const f = amostradorDaGrade(gradeDe(RAMPA));
    const perfil = perfilAoLongo(f, [{ x: 0, y: 5000 }, { x: 10000, y: 5000 }, { x: 0, y: 5000 }], 500);
    const e = estatisticasDoPerfil(perfil);
    expect(e.comprimentoM).toBeCloseTo(20, 9);
    expect(e.subidaM).toBeCloseTo(1, 9);
    expect(e.descidaM).toBeCloseTo(1, 9);
    expect(e.desnivelM).toBeCloseTo(0, 9);
  });

  it('fora da grade conta como ponto sem cota; início e fim são o primeiro e o último COM cota', () => {
    const f = amostradorDaGrade(gradeDe(RAMPA));
    // Linha de −10 a 60 m: a grade cobre −1 a 41 m. As pontas caem fora.
    const perfil = perfilAoLongo(f, [{ x: -10000, y: 5000 }, { x: 60000, y: 5000 }], 1000);
    const e = estatisticasDoPerfil(perfil);
    expect(e.pontosSemCota).toBeGreaterThan(0);
    expect(e.cotaInicioM).toBeCloseTo(RAMPA(-1000), 6);
    expect(e.cotaFimM).toBeCloseTo(RAMPA(41000), 6);
    expect(e.desnivelM).toBeCloseTo(4.2, 6);
    // A declividade média é sobre o trecho COM cota (42 m), não sobre os 70 m.
    expect(e.declividadeMediaP).toBeCloseTo(10, 6);
  });
});

describe('hipsometria', () => {
  it('rampa de 0 a 40 m em 8 classes: 1/8 da área em cada, cores da rampa', () => {
    const g = gradeDe((x) => 100 + x / 1000); // 0 a 40 m dentro do lote
    const h = hipsometriaDaGrade(g, LOTE, 8);
    expect(h.classes).toHaveLength(8);
    expect(h.minM).toBeCloseTo(100.5, 9);
    expect(h.maxM).toBeCloseTo(139.5, 9);
    for (const c of h.classes) expect(c.areaM2).toBeCloseTo(1600 / 8, 6);
    expect(h.classes[0].cor).toBe('#1a9850');
    expect(h.classes[7].cor).toBe('#d73027');
    expect(h.classes[3].ateM).toBeCloseTo(h.classes[4].deM, 9);
  });

  it('terreno plano cai numa classe só, sem dividir por zero', () => {
    const h = hipsometriaDaGrade(gradeDe(() => 100), LOTE, 8);
    expect(h.classes[0].areaM2).toBeCloseTo(1600, 6);
    expect(h.classes.slice(1).every((c) => c.areaM2 === 0)).toBe(true);
  });

  it('sem cota nenhuma, sem classes', () => {
    expect(hipsometriaDaGrade(gradeDe(() => null), LOTE).classes).toEqual([]);
  });
});
