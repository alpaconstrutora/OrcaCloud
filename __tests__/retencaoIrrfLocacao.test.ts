import { describe, it, expect } from 'vitest';
import { deveReterIrrfLocacao, irrfDoAluguel } from '../utils/retencaoIrrfLocacao';
import { calcularIrrfMensal, descontoSimplificadoMensal, aplicarRedutorIRRF2026 } from '../lib/payrollCalc';
import type { IRRFBracket } from '../services/fiscalService';

// Tabela progressiva mensal vigente desde 05/2025 (Lei 15.191/2025).
const faixas: IRRFBracket[] = [
    { valid_from: '2025-05-01', valid_to: null, min_value: 0,       max_value: 2428.80, rate: 0,     deduction: 0 },
    { valid_from: '2025-05-01', valid_to: null, min_value: 2428.81, max_value: 2826.65, rate: 0.075, deduction: 182.16 },
    { valid_from: '2025-05-01', valid_to: null, min_value: 2826.66, max_value: 3751.05, rate: 0.15,  deduction: 394.16 },
    { valid_from: '2025-05-01', valid_to: null, min_value: 3751.06, max_value: 4664.68, rate: 0.225, deduction: 675.49 },
    { valid_from: '2025-05-01', valid_to: null, min_value: 4664.69, max_value: null,    rate: 0.275, deduction: 908.73 },
];

const PF = { type: 'PF' as const };
const PJ = { type: 'PJ' as const };

describe('deveReterIrrfLocacao — só inquilino PJ + locador PF', () => {
    it('inquilino PJ e locador PF → retém', () => {
        expect(deveReterIrrfLocacao([PJ], PF)).toBe(true);
    });
    it('PF→PF, PJ→PJ e PF→PJ → não retém', () => {
        expect(deveReterIrrfLocacao([PF], PF)).toBe(false);
        expect(deveReterIrrfLocacao([PJ], PJ)).toBe(false);
        expect(deveReterIrrfLocacao([PF], PJ)).toBe(false);
    });
    it('vários inquilinos: basta um PJ', () => {
        expect(deveReterIrrfLocacao([PF, PJ], PF)).toBe(true);
        expect(deveReterIrrfLocacao([PF, PF], PF)).toBe(false);
    });
    it('sem locador informado (empresa) → não retém', () => {
        expect(deveReterIrrfLocacao([PJ], undefined)).toBe(false);
        expect(deveReterIrrfLocacao([PJ], null)).toBe(false);
    });
});

describe('desconto simplificado mensal — Lei 9.250, art. 4º, § 2º', () => {
    it('25% do teto da faixa isenta (R$ 2.428,80 → R$ 607,20)', () => {
        expect(descontoSimplificadoMensal(faixas, '2025-06-10')).toBe(607.2);
    });
    it('antes de 05/2023 não existia', () => {
        expect(descontoSimplificadoMensal(faixas, '2023-04-30')).toBe(0);
        expect(descontoSimplificadoMensal(faixas, '2018-05-10')).toBe(0);
    });
    it('é alternativo às deduções legais: vale o maior', () => {
        expect(calcularIrrfMensal(5000, 400, faixas, '2025-06-10').deducao).toBe(607.2);
        expect(calcularIrrfMensal(5000, 700, faixas, '2025-06-10').deducao).toBe(700);
    });
});

describe('redução 2026 — Lei 9.250, art. 3º-A (Lei 15.270/2025)', () => {
    it('até R$ 5.000 reduz até R$ 312,89', () => {
        expect(aplicarRedutorIRRF2026(312.89, 5000)).toBe(0);
        expect(aplicarRedutorIRRF2026(466.27, 5000)).toBeCloseTo(153.38, 2);
    });
    it('entre R$ 5.000 e R$ 7.350: 978,62 − 0,133145 × rendimento', () => {
        expect(aplicarRedutorIRRF2026(741.27, 6000)).toBeCloseTo(561.52, 2);
    });
    it('acima de R$ 7.350 não reduz; nunca negativo', () => {
        expect(aplicarRedutorIRRF2026(1000, 8000)).toBe(1000);
        expect(aplicarRedutorIRRF2026(10, 4000)).toBe(0);
    });
});

describe('irrfDoAluguel — a mesma conta da folha', () => {
    it('antes de 05/2023 (sem desconto simplificado): R$ 4.000 → 900 − 675,49', () => {
        expect(irrfDoAluguel(4000, faixas, '2022-06-10')).toBe(224.51);
    });
    it('2025 com desconto simplificado: R$ 4.000 → base 3.392,80 → 114,76', () => {
        expect(irrfDoAluguel(4000, faixas, '2025-06-10')).toBe(114.76);
    });
    it('até R$ 2.428,80 + 607,20 é isento', () => {
        expect(irrfDoAluguel(3000, faixas, '2025-06-10')).toBe(0);
    });
    it('2026: R$ 5.000 → base 4.392,80 → 312,89 − 312,89 = 0', () => {
        expect(irrfDoAluguel(5000, faixas, '2026-03-10')).toBe(0);
    });
    it('2026: R$ 4.556 → 0', () => {
        expect(irrfDoAluguel(4556, faixas, '2026-03-10')).toBe(0);
    });
    it('2026: R$ 6.000 → base 5.392,80 → 574,29 − 179,75 = 394,54', () => {
        expect(irrfDoAluguel(6000, faixas, '2026-03-10')).toBe(394.54);
    });
    it('2026: R$ 7.000 → base 6.392,80 → 849,29 − 46,605 = 802,685 → 802,69', () => {
        // a redução não é arredondada no meio; só o imposto final
        expect(irrfDoAluguel(7000, faixas, '2026-03-10')).toBe(802.69);
    });
    it('2026: R$ 8.000 → base 7.392,80 → 1.124,29 sem redução', () => {
        expect(irrfDoAluguel(8000, faixas, '2026-03-10')).toBe(1124.29);
    });
});
