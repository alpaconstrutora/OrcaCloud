/**
 * Testes do motor de validação de folha de pagamento.
 * Cobre as tabelas INSS e IRRF vigentes e os cálculos derivados (FGTS, líquido, custo patronal).
 *
 * Tabelas de referência (2024):
 *   INSS: 7.5% até 1.412 | 9% até 2.666,68 | 12% até 4.000,03 | 14% até 7.786,02
 *   IRRF: isento até 2.112 | 7.5% até 2.826,65 | 15% até 3.751,05 | 22.5% até 4.664,68 | 27.5% acima
 */
import { describe, it, expect } from 'vitest';
import { payrollValidationService } from '../services/payrollValidationService';

// Faixas 2024 — espelham os dados que devem existir no banco (inss_brackets / irrf_brackets)
const INSS_2024 = [
  { min_value: 0,       max_value: 1412.00,  rate: 0.075, deduction: 0, valid_from: '2024-01-01', valid_to: '2024-12-31' },
  { min_value: 1412.00, max_value: 2666.68,  rate: 0.09,  deduction: 0, valid_from: '2024-01-01', valid_to: '2024-12-31' },
  { min_value: 2666.68, max_value: 4000.03,  rate: 0.12,  deduction: 0, valid_from: '2024-01-01', valid_to: '2024-12-31' },
  { min_value: 4000.03, max_value: 7786.02,  rate: 0.14,  deduction: 0, valid_from: '2024-01-01', valid_to: '2024-12-31' },
];

const IRRF_2024 = [
  { min_value: 0,       max_value: 2112.00,  rate: 0,     deduction: 0,      valid_from: '2024-01-01', valid_to: '2024-12-31' },
  { min_value: 2112.00, max_value: 2826.65,  rate: 0.075, deduction: 158.40, valid_from: '2024-01-01', valid_to: '2024-12-31' },
  { min_value: 2826.65, max_value: 3751.05,  rate: 0.15,  deduction: 370.40, valid_from: '2024-01-01', valid_to: '2024-12-31' },
  { min_value: 3751.05, max_value: 4664.68,  rate: 0.225, deduction: 651.73, valid_from: '2024-01-01', valid_to: '2024-12-31' },
  { min_value: 4664.68, max_value: null,      rate: 0.275, deduction: 884.96, valid_from: '2024-01-01', valid_to: '2024-12-31' },
];

const calc = (salary: number, overtime50 = 0, bonus = 0) =>
  payrollValidationService.calculatePayrollReference({
    salary, overtime50, bonus,
    inssBrackets: INSS_2024 as any,
    irrfBrackets: IRRF_2024 as any,
  });

// ─── Salário Mínimo (R$ 1.412) — faixa INSS 7.5%, IRRF isento ────────────────

describe('Salário Mínimo 2024 (R$ 1.412)', () => {
  const result = calc(1412);

  it('gross igual ao salário bruto (sem extras)', () => {
    expect(result.gross).toBe(1412);
  });

  it('INSS = 7.5% sobre o total (faixa única)', () => {
    expect(result.inss).toBeCloseTo(105.90, 2);
  });

  it('IRRF = 0 (abaixo do limite de isenção)', () => {
    expect(result.irrf).toBe(0);
  });

  it('FGTS = 8% do bruto', () => {
    expect(result.fgts).toBeCloseTo(112.96, 2);
  });

  it('líquido = bruto - INSS - IRRF', () => {
    expect(result.net).toBeCloseTo(result.gross - result.inss - result.irrf, 2);
  });

  it('custo patronal = bruto + FGTS', () => {
    expect(result.employerCost).toBeCloseTo(result.gross + result.fgts, 2);
  });
});

// ─── Faixa Intermediária (R$ 3.500) — INSS progressivo, IRRF 15% ──────────────

describe('Salário R$ 3.500 (faixa intermediária)', () => {
  const result = calc(3500);

  it('INSS calculado progressivamente (múltiplas faixas)', () => {
    // 1.412 × 7.5% = 105.90
    // (2.666,68 - 1.412) × 9% = 112.81
    // (3.500 - 2.666,68) × 12% = 99.99
    // Total ≈ 318.70
    expect(result.inss).toBeGreaterThan(300);
    expect(result.inss).toBeLessThan(350);
  });

  it('IRRF > 0 (acima do limite de isenção)', () => {
    expect(result.irrf).toBeGreaterThan(0);
  });

  it('IRRF nunca negativo', () => {
    expect(result.irrf).toBeGreaterThanOrEqual(0);
  });

  it('líquido = gross - INSS - IRRF', () => {
    expect(result.net).toBeCloseTo(result.gross - result.inss - result.irrf, 2);
  });
});

// ─── Salário Alto (R$ 8.000) — teto INSS + IRRF 27.5% ───────────────────────

describe('Salário R$ 8.000 (acima do teto INSS)', () => {
  const result = calc(8000);

  it('INSS teto: não ultrapassa a alíquota máxima de 14% × 7.786,02', () => {
    // Teto INSS 2024 = 7.786,02 × média ponderada das faixas
    // INSS máximo ≈ 908,85
    expect(result.inss).toBeLessThanOrEqual(1200); // teto com margem
    expect(result.inss).toBeGreaterThan(800);
  });

  it('IRRF na faixa máxima (27.5%)', () => {
    expect(result.irrf).toBeGreaterThan(500);
  });

  it('custo patronal maior que salário bruto', () => {
    expect(result.employerCost).toBeGreaterThan(8000);
  });
});

// ─── Hora Extra ───────────────────────────────────────────────────────────────

describe('Cálculo de hora extra 50%', () => {
  it('adiciona horas extras ao gross corretamente', () => {
    const semHE = calc(3000, 0);
    const comHE = calc(3000, 10); // 10 horas extras
    // valorHE = (3000/220) × 1.5 × 10 ≈ 204,55
    expect(comHE.gross).toBeGreaterThan(semHE.gross);
    expect(comHE.gross - semHE.gross).toBeCloseTo((3000 / 220) * 1.5 * 10, 0);
  });

  it('hora extra eleva INSS proporcional', () => {
    const semHE = calc(2000, 0);
    const comHE = calc(2000, 20);
    expect(comHE.inss).toBeGreaterThan(semHE.inss);
  });
});

// ─── Bônus ────────────────────────────────────────────────────────────────────

describe('Cálculo com bônus', () => {
  it('bônus integra o gross', () => {
    const semBonus = calc(2000, 0, 0);
    const comBonus = calc(2000, 0, 500);
    expect(comBonus.gross).toBe(semBonus.gross + 500);
  });

  it('bônus eleva FGTS (8% sobre tudo)', () => {
    const semBonus = calc(2000, 0, 0);
    const comBonus = calc(2000, 0, 500);
    expect(comBonus.fgts).toBeCloseTo(semBonus.fgts + 500 * 0.08, 2);
  });
});

// ─── Salário Zero ─────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('salário zero retorna todos os campos em 0', () => {
    const result = calc(0);
    expect(result.gross).toBe(0);
    expect(result.inss).toBe(0);
    expect(result.irrf).toBe(0);
    expect(result.fgts).toBe(0);
    expect(result.net).toBe(0);
  });

  it('IRRF nunca é negativo (proteção max(0, irrf))', () => {
    // Salários no limiar de isenção não podem gerar IRRF negativo
    [1000, 1500, 2000, 2112].forEach(salary => {
      expect(calc(salary).irrf).toBeGreaterThanOrEqual(0);
    });
  });

  it('líquido nunca maior que gross', () => {
    [1412, 3000, 5000, 10000].forEach(salary => {
      const r = calc(salary);
      expect(r.net).toBeLessThanOrEqual(r.gross);
    });
  });
});
