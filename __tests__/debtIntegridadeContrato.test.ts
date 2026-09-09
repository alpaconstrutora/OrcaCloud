/**
 * Integridade do contrato de dívida — os quatro achados laterais do 5772.
 *
 * Plano: docs/planos/2026-09-09-divida-integridade-do-contrato.md
 */

import { describe, it, expect } from 'vitest';
import {
    buildSchedule,
    verificarFechamento,
    verificarDatasDoContrato,
    type DebtScheduleParams,
} from '../utils/debtAmortization';

const BASE: DebtScheduleParams = {
    principal: 57000,
    firstDueDate: '2021-07-26',
    installmentCount: 44,
    installmentPeriod: 'MENSAL',
    system: 'SAC',
    nominalRate: 0.41,
    ratePeriod: 'MENSAL',
} as DebtScheduleParams;

describe('verificarFechamento — a identidade do saldo', () => {
    it('aprova o SAC do contrato 5772', () => {
        const rows = buildSchedule(BASE);
        expect(rows).toHaveLength(44);
        expect(verificarFechamento(rows, BASE.principal)).toBeNull();
    });

    it('aprova PRICE, AMERICANO e BULLET', () => {
        for (const system of ['PRICE', 'AMERICANO', 'BULLET'] as const) {
            const rows = buildSchedule({ ...BASE, system });
            expect(verificarFechamento(rows, BASE.principal), system).toBeNull();
        }
    });

    it('carência COM capitalização fecha pela identidade nova e furaria a antiga', () => {
        const rows = buildSchedule({
            ...BASE,
            gracePrincipalPeriods: 5,
            graceInterestPeriods: 5,
            capitalizeInterest: true,
        } as DebtScheduleParams);

        const somaAmort = rows.reduce((a, r) => a + r.amortization, 0);
        const capitalizado = rows.reduce((a, r) => a + r.capitalizedInterest, 0);

        // A invariante ANTIGA ("Σ amort === principal") é falsa aqui — foi ela
        // que fez as versões 9 e 12 do 5772 parecerem defeito.
        expect(capitalizado).toBeGreaterThan(0);
        expect(Math.abs(somaAmort - BASE.principal)).toBeGreaterThan(1);

        // A identidade verdadeira fecha.
        expect(verificarFechamento(rows, BASE.principal)).toBeNull();
        expect(somaAmort).toBeCloseTo(BASE.principal + capitalizado, 1);
    });

    it('carência SEM capitalização não capitaliza nada e fecha no principal', () => {
        const rows = buildSchedule({
            ...BASE,
            gracePrincipalPeriods: 5,
            graceInterestPeriods: 5,
            capitalizeInterest: false,
        } as DebtScheduleParams);
        expect(rows.reduce((a, r) => a + r.capitalizedInterest, 0)).toBe(0);
        expect(rows.reduce((a, r) => a + r.amortization, 0)).toBeCloseTo(57000, 1);
        expect(verificarFechamento(rows, BASE.principal)).toBeNull();
    });

    it('RECUSA cronograma adulterado — é a trava que não existia', () => {
        const rows = buildSchedule(BASE);
        rows[10].amortization += 5000;
        const problema = verificarFechamento(rows, BASE.principal);
        expect(problema).toContain('não fecha');
        expect(problema).toContain('soma das amortizações');
    });

    it('RECUSA cronograma que deixa saldo devedor na última parcela', () => {
        const rows = buildSchedule(BASE);
        rows[rows.length - 1].closingBalance = 1200;
        expect(verificarFechamento(rows, BASE.principal)).toContain('sobra saldo devedor');
    });

    it('RECUSA cronograma vazio', () => {
        expect(verificarFechamento([], 1000)).toContain('sem nenhuma parcela');
    });

    it('a tolerância acompanha o prazo — 360 parcelas não viram falso positivo', () => {
        const rows = buildSchedule({ ...BASE, installmentCount: 360 });
        expect(verificarFechamento(rows, BASE.principal)).toBeNull();
    });
});

describe('verificarDatasDoContrato', () => {
    it('barra 1º vencimento anterior à contratação (o caso real do 5772)', () => {
        const r = verificarDatasDoContrato({ signedAt: '2021-07-29', firstDueDate: '2021-07-26' });
        expect(r).toContain('anterior à data de contratação');
    });

    it('barra vencimento final anterior ao 1º vencimento', () => {
        const r = verificarDatasDoContrato({ firstDueDate: '2025-01-10', finalDueDate: '2024-01-10' });
        expect(r).toContain('vencimento final é anterior');
    });

    it('aceita datas coerentes e datas iguais', () => {
        expect(verificarDatasDoContrato({
            signedAt: '2021-07-26', firstDueDate: '2021-07-26', finalDueDate: '2025-02-26',
        })).toBeNull();
    });

    it('não bloqueia por data ausente — quem exige as datas é a geração', () => {
        expect(verificarDatasDoContrato({})).toBeNull();
        expect(verificarDatasDoContrato({ firstDueDate: '2021-07-26' })).toBeNull();
        expect(verificarDatasDoContrato({ signedAt: '2021-07-29' })).toBeNull();
    });
});
