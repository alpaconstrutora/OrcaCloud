/**
 * Fase 13: o modo INTERVALO de níveis — passo fixo a partir do mínimo do
 * terreno (o "Interval" do Contour Map Creator), em contraste com a
 * equidistância, que ancora em cotas redondas.
 */
import { describe, expect, it } from 'vitest';
import type { Point } from '../utils/blueprintKernel';
import {
  MAX_NIVEIS,
  faixaDeCotas,
  gerarCurvas,
  gerarCurvasNosNiveis,
  hashDaEntrada,
  niveisPorIntervalo,
  nosDaGrade,
  planejarGrade,
  type GradeDeElevacao,
} from '../utils/blueprintTopografia';

const LOTE: Point[] = [
  { x: 0, y: 0 },
  { x: 12000, y: 0 },
  { x: 12000, y: 30000 },
  { x: 0, y: 30000 },
];

function gradeDe(fn: (x: number, y: number) => number | null, esp = 1000): GradeDeElevacao {
  const grade = planejarGrade(LOTE, esp);
  return { ...grade, cotasM: nosDaGrade(grade).map((n) => fn(n.x, n.y)) };
}

describe('niveisPorIntervalo (o "Interval" do site)', () => {
  it('conta a partir do mínimo, exclui o próprio mínimo e para antes do máximo', () => {
    expect(niveisPorIntervalo(100.32, 102.27, 0.5)).toEqual([100.82, 101.32, 101.82]);
    // Máximo exato num nível: fica de fora (curva no máximo é um ponto).
    expect(niveisPorIntervalo(100, 102, 0.5)).toEqual([100.5, 101, 101.5]);
    expect(niveisPorIntervalo(100, 100.4, 0.5)).toEqual([]);
    expect(niveisPorIntervalo(100, 100, 0.5)).toEqual([]);
    expect(niveisPorIntervalo(100, 110, 0)).toEqual([]);
  });

  it('é diferente da equidistância: a mesma faixa e o mesmo passo dão cotas não redondas', () => {
    const g = gradeDe((x) => 100.32 + (x / 12000) * 1.95, 500); // 100,32 → 102,27 m
    const faixa = faixaDeCotas(g, LOTE)!;
    const intervalo = niveisPorIntervalo(faixa.minM, faixa.maxM, 0.5);
    expect(intervalo).toEqual([100.82, 101.32, 101.82]);
    const redondas = new Set(gerarCurvas(g, LOTE, 0.5).map((c) => c.cotaM));
    expect(redondas).toEqual(new Set([100.5, 101, 101.5, 102]));
    const curvas = gerarCurvasNosNiveis(g, LOTE, intervalo);
    expect(new Set(curvas.map((c) => c.cotaM))).toEqual(new Set(intervalo));
    // A de 100,82 m é a reta x = (0,50 / 1,95) · 12 m ≈ 3,077 m.
    const c = curvas.find((k) => k.cotaM === 100.82)!;
    expect(c.pontos.every((p) => Math.abs(p.x - 3076.9) < 2)).toBe(true);
  });

  it('respeita o teto de níveis com a mesma mensagem da equidistância', () => {
    expect(() => niveisPorIntervalo(0, 100, 0.1)).toThrow(/máximo é 200/);
    expect(niveisPorIntervalo(0, 100, 0.5)).toHaveLength(199);
    expect(MAX_NIVEIS).toBe(200);
  });

  it('o hash da entrada distingue INTERVALO de EQUIDISTANCIA com o mesmo passo', () => {
    const base = { fonteCodigo: 'PONTOS_COTADOS', datasetVersao: 'x', anel: LOTE, georreferencia: null, espacamentoMm: 500, equidistanciaM: 0.5, pontosCotados: [] };
    const h1 = hashDaEntrada({ ...base, modoNiveis: 'EQUIDISTANCIA', niveisM: null });
    const h2 = hashDaEntrada({ ...base, modoNiveis: 'INTERVALO', niveisM: [100.82, 101.32, 101.82] });
    expect(h1).not.toBe(h2);
  });
});
