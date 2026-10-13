/**
 * As medidas do corte do terreno (13/10/2026): níveis, corte/aterro, talude,
 * muro e comprimentos — `medidasDoCorte` sobre a projeção REAL (`projetarCorte`).
 * Plano: docs/planos/2026-10-13-corte-medidas.md.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command, type Point } from '../utils/blueprintKernel';
import { baseDoCorte, bordasDoAnelNoCorte, projetarCorte, type TerrenoParaCorte } from '../utils/blueprintCorte';
import { formatarCota, medidasDoCorte } from '../utils/blueprintCorteMedidas';
import { PARAMETROS_PADRAO } from '../utils/blueprintTopografiaAnalises';

function soCorte() {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 });
  const r = applyCommand(base.model, { type: 'AddCorte', a: point(-1000, 2000), b: point(7000, 2000) });
  return { model: r.model, corte: r.model.sections[0] };
}
/** Platô de x 1 a 5 m: a linha de corte (y = 2 m, oeste → leste, u = x) o atravessa por 4 m. */
const PLATO: Point[] = [point(1000, 0), point(5000, 0), point(5000, 4000), point(1000, 4000)];

/** O lote, para o perfil do terreno passar além dos taludes (é o que os vértices fazem no app). */
const LOTE: Point[] = [point(-8000, -2000), point(14000, -2000), point(14000, 6000), point(-8000, 6000)];

function medir(terreno: TerrenoParaCorte) {
  const { model, corte } = soCorte();
  const proj = projetarCorte(model, { corte, terreno: { vertices: LOTE, ...terreno } });
  return { proj, m: medidasDoCorte(proj) };
}

describe('corte · as bordas exatas do platô', () => {
  it('a linha cruza o anel em x = 1 m e x = 5 m, sem amostragem', () => {
    const { corte } = soCorte();
    expect(bordasDoAnelNoCorte(corte, baseDoCorte(corte), PLATO)).toEqual([1000, 5000]);
    // Anel girado: a borda cai fora do passo de 250 mm e continua exata.
    const losango = [point(3000, -1500), point(6500, 2000), point(3000, 5500), point(-500, 2000)];
    expect(bordasDoAnelNoCorte(corte, baseDoCorte(corte), losango)).toEqual([-500, 6500]);
  });

  it('cada ponto da linha do projeto diz se é platô ou talude', () => {
    const { proj } = medir({ cotaEmM: () => 103, cotaZeroM: 100, plato: { cotaM: 100, anel: PLATO, taludeCorteH: 1.5, taludeAterroH: 1.5 } });
    const linha = proj.platoNoCorte!.flat();
    expect(linha.find((p) => p.u === 3000)!.trecho).toBe('PLATO');
    expect(linha.find((p) => p.u === 8000)!.trecho).toBe('TALUDE');
    expect(proj.cotaZeroM).toBe(100);
  });
});

describe('corte · medidas do terreno', () => {
  it('terreno 3 m acima: corte 3,00 m; platô 4,00 m entre as bordas exatas; talude 4,50 m a 1:1,5', () => {
    const { m } = medir({ cotaEmM: () => 103, cotaZeroM: 100, plato: { cotaM: 100, anel: PLATO, taludeCorteH: 1.5, taludeAterroH: 1.5 } });
    const corte = m.verticais.find((c) => c.tipo === 'CORTE')!;
    expect(corte.rotulo).toBe('corte 3,00 m');
    expect([corte.vDe, corte.vAte]).toEqual([0, 3000]);
    expect(m.verticais.some((c) => c.tipo === 'ATERRO')).toBe(false);
    const plato = m.horizontais.find((c) => c.tipo === 'PLATO')!;
    expect([plato.uDe, plato.uAte, plato.rotulo]).toEqual([1000, 5000, 'platô 4,00 m']);
    // Os dois taludes (oeste e leste), com o PÉ no encontro com o terreno — não no último ponto amostrado.
    const taludes = m.horizontais.filter((c) => c.tipo === 'TALUDE');
    // Pé a ±5 mm: os pontos da linha vêm arredondados ao mm, e a rampa é estendida por eles.
    expect(taludes.map((t) => [t.uDe, t.uAte]).flat().map((u, i) => Math.abs(u - [-3500, 1000, 5000, 9500][i]) <= 5)).toEqual([true, true, true, true]);
    expect(taludes.every((t) => t.rotulo === 'talude 4,50 m · 1:1,5')).toBe(true);
    expect(m.verticais.filter((c) => c.tipo === 'TALUDE').map((c) => c.rotulo)).toEqual(['h 3,00 m', 'h 3,00 m']);
  });

  it('borda fora do passo de 250 mm: o platô mede 3,80 m pela borda exata, não 3,50 m pelos pontos', () => {
    const anel = [point(1100, 0), point(4900, 0), point(4900, 4000), point(1100, 4000)];
    const { m, proj } = medir({ cotaEmM: () => 100, cotaZeroM: 100, plato: { cotaM: 100, anel } });
    const us = proj.platoNoCorte!.flat().map((p) => p.u);
    expect(Math.max(...us) - Math.min(...us)).toBeLessThan(3800);
    expect(m.horizontais.find((c) => c.tipo === 'PLATO')!.rotulo).toBe('platô 3,80 m');
  });

  it('terreno 2 m abaixo: aterro 2,00 m, sem corte', () => {
    const { m } = medir({ cotaEmM: () => 98, cotaZeroM: 100, plato: { cotaM: 100, anel: PLATO } });
    expect(m.verticais.map((c) => c.rotulo)).toEqual(['aterro 2,00 m']);
    expect(m.verticais[0]).toMatchObject({ vDe: -2000, vAte: 0 });
  });

  it('terreno inclinado contra platô a meia altura: o maior corte a leste, o maior aterro a oeste', () => {
    // Terreno sobe 1 m a cada 2 m para leste; platô a 101,5 (o terreno em x = 3 m).
    const { m } = medir({ cotaEmM: (p) => 100 + p.x / 2000, cotaZeroM: 100, plato: { cotaM: 101.5, anel: PLATO } });
    const corte = m.verticais.find((c) => c.tipo === 'CORTE')!;
    const aterro = m.verticais.find((c) => c.tipo === 'ATERRO')!;
    expect(corte.u).toBeGreaterThan(4500);
    expect(aterro.u).toBeLessThan(1500);
    // O maior corte é ~1 m na borda leste (x = 5 m → 102,5 − 101,5), medido no último ponto amostrado.
    expect(corte.vAte - corte.vDe).toBeGreaterThan(850);
    expect(corte.vAte - corte.vDe).toBeLessThanOrEqual(1000);
  });

  it('níveis: o platô e o piso em cota absoluta; o terreno nas pontas, no alto e no baixo, sem repetir', () => {
    const { m } = medir({ cotaEmM: (p) => 880 + p.x / 2000, cotaZeroM: 880, plato: { cotaM: 881.25, anel: PLATO } });
    expect(m.niveis.filter((n) => n.tipo === 'PLATO').map((n) => n.rotulo)).toEqual(['881,25']);
    expect(m.niveis.find((n) => n.tipo === 'PISO')!.rotulo).toBe('piso 880,00');
    const terreno = m.niveis.filter((n) => n.tipo === 'TERRENO');
    // Rampa: o alto é a ponta leste e o baixo a oeste — duas marcas, não quatro.
    expect(terreno).toHaveLength(2);
    expect(Math.max(...terreno.map((n) => n.cotaM))).toBeGreaterThan(Math.min(...terreno.map((n) => n.cotaM)));
  });

  it('comprimentos: a linha do perfil inteiro abaixo da do projeto', () => {
    const { m, proj } = medir({ cotaEmM: () => 103, cotaZeroM: 100, plato: { cotaM: 100, anel: PLATO, taludeCorteH: 1.5, taludeAterroH: 1.5 } });
    const perfil = m.horizontais.find((c) => c.tipo === 'PERFIL')!;
    const us = proj.perfilDoTerreno!.flat().map((p) => p.u);
    expect([perfil.uDe, perfil.uAte, perfil.linha]).toEqual([Math.min(...us), Math.max(...us), 1]);
    expect(m.horizontais.filter((c) => c.linha === 0).every((c) => c.tipo !== 'PERFIL')).toBe(true);
    expect(m.vMinimo).toBe(0);
  });

  it('sem terreno não há medida; diferença de grade abaixo de 5 cm não vira cota', () => {
    const { model, corte } = soCorte();
    expect(medidasDoCorte(projetarCorte(model, { corte }))).toEqual({ niveis: [], verticais: [], horizontais: [], vMinimo: null });
    const { m } = medir({ cotaEmM: () => 100.03, cotaZeroM: 100, plato: { cotaM: 100, anel: PLATO } });
    expect(m.verticais).toEqual([]);
  });

  it('formatar: duas casas, vírgula, sem −0', () => {
    expect(formatarCota(887.944)).toBe('887,94');
    expect(formatarCota(-0.001)).toBe('0,00');
    expect(formatarCota(1083.5)).toBe('1083,50');
  });
});

describe('corte · muro de arrimo', () => {
  it('a face do muro a leste vira a cota "muro 4,00 m"', () => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const levelId = base.model.levels[0].id;
    const cantos = [point(0, 0), point(40000, 0), point(40000, 40000), point(0, 40000)];
    const lados: Command[] = cantos.map((c, i) => ({ type: 'AddBoundary' as const, levelId, a: c, b: cantos[(i + 1) % 4], kind: 'TERRENO' as const }));
    let model = applyBatch(base.model, lados).model;
    model = applyCommand(model, { type: 'AddCorte', a: point(-2000, 20000), b: point(42000, 20000) }).model;
    const anel = [point(10000, 10000), point(30000, 10000), point(30000, 30000), point(10000, 30000)];
    const proj = projetarCorte(model, {
      corte: model.sections[0],
      levelIds: [levelId],
      terreno: {
        cotaEmM: () => 104,
        cotaZeroM: 100,
        vertices: cantos,
        plato: { cotaM: 100, anel, taludeCorteH: 1.5, taludeAterroH: 1.5, parametros: { ...PARAMETROS_PADRAO, taludePorAresta: [null, { muro: true }, null, null] } },
      },
    });
    const m = medidasDoCorte(proj);
    expect(m.verticais.filter((c) => c.tipo === 'MURO').map((c) => c.rotulo)).toEqual(['muro 4,00 m']);
  });
});
