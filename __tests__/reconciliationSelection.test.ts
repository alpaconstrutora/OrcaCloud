import { describe, it, expect } from 'vitest';
import { resumoDaSelecao } from '../utils/reconciliationSelection';
import type { InternalTransaction } from '../types/financial';

const b = (id: string, amount: number, direction: 'CREDIT' | 'DEBIT' = 'DEBIT') => ({ id, amount, direction });
const i = (id: string, amount: number, direction: 'CREDIT' | 'DEBIT' = 'DEBIT', source_system = 'MANUAL'): InternalTransaction => ({
    id, amount, direction, source_system, organization_id: 'o', transaction_date: '2026-09-01', status: 'PENDING',
});

describe('resumoDaSelecao — Conciliar', () => {
    it('1×1 com valores iguais concilia', () => {
        const r = resumoDaSelecao([b('b1', 100)], [i('i1', 100)]);
        expect(r.conciliar).toEqual({ habilitado: true, motivo: null });
        expect(r.diferenca).toBe(0);
        expect(r.direcao).toBe('DEBIT');
    });

    it('N×M com somas iguais concilia (sem erro de ponto flutuante)', () => {
        const r = resumoDaSelecao([b('b1', 0.1), b('b2', 0.2)], [i('i1', 0.15), i('i2', 0.15)]);
        expect(r.totalExtrato).toBe(0.3);
        expect(r.totalLancamentos).toBe(0.3);
        expect(r.conciliar.habilitado).toBe(true);
    });

    it('diferença de 1 centavo já bloqueia e diz o valor', () => {
        const r = resumoDaSelecao([b('b1', 100.01)], [i('i1', 100)]);
        expect(r.temDiferenca).toBe(true);
        expect(r.conciliar.habilitado).toBe(false);
        expect(r.conciliar.motivo).toContain('0,01');
    });

    it('lado vazio bloqueia tudo', () => {
        const r = resumoDaSelecao([b('b1', 100)], []);
        expect(r.conciliar.habilitado).toBe(false);
        expect(r.ajustes.ADJUSTMENT.habilitado).toBe(false);
        expect(r.conciliar.motivo).toMatch(/ao menos 1/);
    });

    it('direções misturadas bloqueiam tudo', () => {
        const r = resumoDaSelecao([b('b1', 100, 'CREDIT')], [i('i1', 100, 'DEBIT')]);
        expect(r.direcao).toBeNull();
        expect(r.conciliar.motivo).toMatch(/entradas e saídas/);
        expect(r.ajustes.EXCESS.habilitado).toBe(false);
    });
});

describe('resumoDaSelecao — ajustes', () => {
    it('sem diferença: nenhum ajuste, com motivo', () => {
        const r = resumoDaSelecao([b('b1', 50)], [i('i1', 50)]);
        for (const a of Object.values(r.ajustes)) {
            expect(a.habilitado).toBe(false);
            expect(a.motivo).toMatch(/Conciliar/);
        }
    });

    it('extrato MAIOR: ajuste e excedente sim, baixa parcial não', () => {
        const r = resumoDaSelecao([b('b1', 120), b('b2', 30)], [i('i1', 100), i('i2', 40)]);
        expect(r.diferenca).toBe(10);
        expect(r.ajustes.ADJUSTMENT.habilitado).toBe(true);
        expect(r.ajustes.EXCESS.habilitado).toBe(true);
        expect(r.ajustes.PARTIAL.habilitado).toBe(false);
        expect(r.ajustes.PARTIAL.motivo).toMatch(/maior que os lançamentos/);
        expect(r.ajustes.ADJUST_VALUE.habilitado).toBe(false); // 2 lançamentos
    });

    it('extrato MENOR: ajuste e baixa parcial sim, excedente não', () => {
        const r = resumoDaSelecao([b('b1', 70), b('b2', 20)], [i('i1', 60), i('i2', 50)]);
        expect(r.diferenca).toBe(-20);
        expect(r.ajustes.ADJUSTMENT.habilitado).toBe(true);
        expect(r.ajustes.PARTIAL.habilitado).toBe(true);
        expect(r.titulosDesmembraveis.map(t => t.id)).toEqual(['i1', 'i2']);
        expect(r.ajustes.EXCESS.habilitado).toBe(false);
        expect(r.ajustes.EXCESS.motivo).toMatch(/menor que os lançamentos/);
    });

    it('baixa parcial só oferece título com valor maior que a diferença', () => {
        const r = resumoDaSelecao([b('b1', 10), b('b2', 10)], [i('i1', 5), i('i2', 30)]);
        expect(r.diferenca).toBe(-15);
        expect(r.titulosDesmembraveis.map(t => t.id)).toEqual(['i2']);
    });

    it('baixa parcial sem título desmembrável diz o motivo', () => {
        const r = resumoDaSelecao([b('b1', 1)], [i('i1', 0.5), i('i2', 0.6)]);
        expect(r.diferenca).toBe(-0.1);
        // ambos > 0,10 → desmembráveis; agora um caso em que nenhum é
        const r2 = resumoDaSelecao([b('b1', 2)], [i('i1', 1.5), i('i2', 1.5)]);
        expect(r2.diferenca).toBe(-1);
        expect(r2.ajustes.PARTIAL.habilitado).toBe(true);
        const r3 = resumoDaSelecao([b('b1', 1)], [i('i1', 1), i('i2', 1)]);
        expect(r3.diferenca).toBe(-1);
        expect(r3.ajustes.PARTIAL.habilitado).toBe(false);
        expect(r3.ajustes.PARTIAL.motivo).toMatch(/maior que a diferença/);
        expect(r.ajustes.PARTIAL.habilitado).toBe(true);
    });

    it('ajustar valor com 1 lançamento vale nos dois sinais', () => {
        expect(resumoDaSelecao([b('b1', 110)], [i('i1', 100)]).ajustes.ADJUST_VALUE.habilitado).toBe(true);
        expect(resumoDaSelecao([b('b1', 90)], [i('i1', 100)]).ajustes.ADJUST_VALUE.habilitado).toBe(true);
        expect(resumoDaSelecao([b('b1', 90), b('b2', 5)], [i('i1', 100)]).ajustes.ADJUST_VALUE.habilitado).toBe(true);
    });

    it('origem sincronizada não desmembra nem ajusta valor (a sincronização desfaria)', () => {
        const r = resumoDaSelecao([b('b1', 60)], [i('i1', 100, 'DEBIT', 'COMMERCIAL')]);
        expect(r.ajustes.ADJUST_VALUE.habilitado).toBe(false);
        expect(r.ajustes.ADJUST_VALUE.motivo).toMatch(/sincroniza/);
        expect(r.ajustes.PARTIAL.habilitado).toBe(false);
        expect(r.ajustes.PARTIAL.motivo).toMatch(/origem COMMERCIAL é regravado/);
        expect(r.titulosDesmembraveis).toEqual([]);
        // os ajustes que não mexem no título continuam valendo
        expect(r.ajustes.ADJUSTMENT.habilitado).toBe(true);
        // MANUAL ao lado: só ele é desmembrável
        const r2 = resumoDaSelecao([b('b1', 150)], [i('i1', 100, 'DEBIT', 'BOLETO'), i('i2', 100)]);
        expect(r2.titulosDesmembraveis.map(t => t.id)).toEqual(['i2']);
    });
});
