/**
 * A superfície de PROJETO como grade (25/11/2026, platô desenhado ajustado no 3D — P0): a mesma grade
 * do terreno, com a cota de projeto (`cotaDeProjeto`) em cada nó. É ela que vira relevo e curvas no 3D.
 */
import { describe, expect, it } from 'vitest';
import {
  gradeDeProjeto,
  gradeRala,
  saldoDoPlato,
  PARAMETROS_PADRAO,
  terraplenagemComTalude,
  volumeEntreSuperficies,
} from '../utils/blueprintTopografiaAnalises';
import type { GradeDeElevacao } from '../utils/blueprintTopografia';

/** Plano inclinado 100 + x/10 m (x em m), 41 × 41 nós a 1 m (−20…20 m). */
function rampa(semDado?: (c: number, l: number) => boolean): GradeDeElevacao {
  const n = 41;
  const cotasM: (number | null)[] = [];
  for (let l = 0; l < n; l++)
    for (let c = 0; c < n; c++) cotasM.push(semDado?.(c, l) ? null : 100 + (c - 20) / 10);
  return { origem: { x: -20_000, y: -20_000 }, espacamentoMm: 1000, colunas: n, linhas: n, cotasM };
}
const ANEL = [
  { x: -5000, y: -5000 },
  { x: 5000, y: -5000 },
  { x: 5000, y: 5000 },
  { x: -5000, y: 5000 },
];
const no = (g: GradeDeElevacao, c: number, l: number) => g.cotasM[l * g.colunas + c];

describe('gradeDeProjeto', () => {
  it('mesma grade: origem, espaçamento e tamanho do terreno', () => {
    const t = rampa();
    const p = gradeDeProjeto(t, ANEL, 100, PARAMETROS_PADRAO, null);
    expect([p.origem, p.espacamentoMm, p.colunas, p.linhas]).toEqual([t.origem, t.espacamentoMm, t.colunas, t.linhas]);
  });

  it('dentro do anel, a cota do platô; longe (além do talude), o terreno natural', () => {
    const t = rampa();
    const p = gradeDeProjeto(t, ANEL, 100, PARAMETROS_PADRAO, null);
    expect(no(p, 20, 20)).toBe(100); // centro (0, 0)
    expect(no(p, 24, 22)).toBe(100); // (4, 2) m, dentro
    expect(no(p, 0, 0)).toBeCloseTo(no(t, 0, 0)!, 9); // canto (−20, −20), longe
  });

  it('nó sem cota natural fica sem cota — sem degrau a zero, nem dentro do anel', () => {
    const t = rampa((c, l) => (c === 20 && l === 20) || (c === 0 && l === 40));
    const p = gradeDeProjeto(t, ANEL, 100, PARAMETROS_PADRAO, null);
    expect(no(p, 20, 20)).toBeNull();
    expect(no(p, 0, 40)).toBeNull();
  });

  it('passo 2: grade rala com ceil(n/2) nós e as mesmas cotas nos nós que coincidem', () => {
    const t = rampa();
    const cheia = gradeDeProjeto(t, ANEL, 100, PARAMETROS_PADRAO, null);
    const rala = gradeDeProjeto(t, ANEL, 100, PARAMETROS_PADRAO, null, 2);
    expect(rala.colunas).toBe(21);
    expect(rala.linhas).toBe(21);
    expect(rala.espacamentoMm).toBe(2000);
    expect(rala.origem).toEqual(t.origem);
    expect(no(rala, 10, 10)).toBe(no(cheia, 20, 20));
    expect(no(rala, 3, 7)).toBeCloseTo(no(cheia, 6, 14)!, 9);
  });

  it('o volume entre o natural e o projeto vai no mesmo sentido da conta da terraplenagem', () => {
    const t = rampa();
    // Platô a 99,8 m: abaixo de quase todo o terreno sob o anel (99,5–100,5) → predomina corte.
    const p = gradeDeProjeto(t, ANEL, 99.8, PARAMETROS_PADRAO, null);
    const v = volumeEntreSuperficies(t, p);
    const conta = terraplenagemComTalude(t, ANEL, 99.8, PARAMETROS_PADRAO, null);
    expect(v.corteM3).toBeGreaterThan(v.aterroM3);
    expect(conta.corteTotalM3).toBeGreaterThan(conta.aterroTotalM3);
  });
});

describe('saldoDoPlato (o selo do 3D)', () => {
  it('os números são os da conta da terraplenagem (corte total, aterro total, saldo em banco)', () => {
    const t = rampa();
    const conta = terraplenagemComTalude(t, ANEL, 99.8, PARAMETROS_PADRAO, null);
    const s = saldoDoPlato(conta, t, ANEL, false);
    expect(s).toEqual({ corteM3: conta.corteTotalM3, aterroM3: conta.aterroTotalM3, saldoM3: conta.saldoEmBancoM3, equilibrio: false, foraDoRelevo: false });
  });

  it('canto do platô fora do relevo → foraDoRelevo; a cota de equilíbrio passa adiante', () => {
    const t = rampa();
    const fora = [...ANEL.slice(0, 3), { x: -30_000, y: 5000 }];
    const s = saldoDoPlato(terraplenagemComTalude(t, fora, 100, PARAMETROS_PADRAO, null), t, fora, true);
    expect(s.foraDoRelevo).toBe(true);
    expect(s.equilibrio).toBe(true);
  });
});

describe('gradeRala (a prévia do arraste)', () => {
  it('um nó a cada passo, espaçamento × passo, mesmas cotas nos nós que coincidem', () => {
    const t = rampa();
    const r = gradeRala(t, 3);
    expect([r.colunas, r.linhas, r.espacamentoMm]).toEqual([14, 14, 3000]);
    expect(r.origem).toEqual(t.origem);
    expect(no(r, 2, 5)).toBe(no(t, 6, 15));
  });
  it('passo 1 devolve a própria grade', () => {
    const t = rampa();
    expect(gradeRala(t, 1)).toBe(t);
  });
  it('a conta da terraplenagem na grade rala fica perto da cheia (é só a prévia)', () => {
    // Um platô que cobre muitas células da rala (30 × 30 m em células de 2 m) — o caso da prévia, que só entra em
    // terreno de mais de 12 mil nós; num platô de 5 células por lado o erro passa de 25 %.
    const t = rampa();
    const grande = [{ x: -15000, y: -15000 }, { x: 15000, y: -15000 }, { x: 15000, y: 15000 }, { x: -15000, y: 15000 }];
    const cheia = terraplenagemComTalude(t, grande, 99.8, PARAMETROS_PADRAO, null);
    const rala = terraplenagemComTalude(gradeRala(t, 2), grande, 99.8, PARAMETROS_PADRAO, null);
    expect(Math.abs(rala.corteTotalM3 - cheia.corteTotalM3) / cheia.corteTotalM3).toBeLessThan(0.25);
  });
});
