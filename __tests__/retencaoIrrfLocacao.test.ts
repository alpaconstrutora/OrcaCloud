import { describe, it, expect } from 'vitest';
import { deveReterIrrfLocacao, irrfDoAluguel } from '../utils/retencaoIrrfLocacao';
import type { IRRFBracket } from '../services/fiscalService';

// Tabela progressiva mensal vigente desde 05/2025 (a mesma semeada em irrf_brackets).
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

describe('irrfDoAluguel — tabela progressiva + redutor 2026 da folha', () => {
    it('2025: R$ 4.000 na faixa de 22,5% → 900 − 675,49', () => {
        expect(irrfDoAluguel(4000, faixas, 2025)).toBe(224.51);
    });
    it('2025: até R$ 2.428,80 é isento', () => {
        expect(irrfDoAluguel(2400, faixas, 2025)).toBe(0);
    });
    it('2026: até R$ 5.000 o redutor zera', () => {
        expect(irrfDoAluguel(4000, faixas, 2026)).toBe(0);
        expect(irrfDoAluguel(5000, faixas, 2026)).toBe(0);
    });
    it('2026: entre R$ 5.000 e R$ 7.350 reduz proporcionalmente', () => {
        // 6000×27,5% − 908,73 = 741,27; redutor 466,27×1350/2350 = 267,857…
        expect(irrfDoAluguel(6000, faixas, 2026)).toBe(473.41);
    });
    it('2026: acima de R$ 7.350 a tabela cheia', () => {
        expect(irrfDoAluguel(8000, faixas, 2026)).toBe(1291.27);
    });
});
