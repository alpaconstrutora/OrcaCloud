import { describe, it, expect } from 'vitest';
import { resumoFinanceiroParceiro, situacaoExibida, ParcelaParceiro } from '../components/partner/PartnerPortalFinanceiro';

const HOJE = new Date(2026, 8, 30, 10, 0, 0); // 30/09/2026

const parcela = (id: string, data: string, amount: number, status = 'PENDING', business_status: string | null = null): ParcelaParceiro =>
    ({ id, transaction_date: data, amount, description: id, status, business_status });

describe('Portal do Parceiro › Financeiro — situação e KPIs', () => {
    it('aberta com vencimento antes de hoje é VENCIDA; hoje ainda é ABERTA', () => {
        expect(situacaoExibida(parcela('a', '2026-09-29', 1), HOJE)).toBe('VENCIDA');
        expect(situacaoExibida(parcela('b', '2026-09-30', 1), HOJE)).toBe('ABERTA');
        expect(situacaoExibida(parcela('c', '2026-10-15', 1), HOJE)).toBe('ABERTA');
    });

    it('paga e cancelada nunca viram vencida, mesmo com data passada', () => {
        expect(situacaoExibida(parcela('p', '2026-01-01', 1, 'CONCILIATED'), HOJE)).toBe('PAGA');
        expect(situacaoExibida(parcela('x', '2026-01-01', 1, 'CANCELLED'), HOJE)).toBe('CANCELADA');
    });

    it('resumo: em aberto inclui vencido; cancelada não entra em nada; próximo = aberta mais antiga', () => {
        const r = resumoFinanceiroParceiro([
            parcela('v1', '2026-09-01', 100),
            parcela('v2', '2026-09-20', 50),
            parcela('f1', '2026-10-10', 200),
            parcela('pg', '2026-08-01', 300, 'CONCILIATED'),
            parcela('cx', '2026-09-05', 999, 'CANCELLED'),
        ], HOJE);
        expect(r.emAberto).toBe(350);
        expect(r.vencido).toBe(150);
        expect(r.recebido).toBe(300);
        expect(r.proximoVencimento?.id).toBe('v1');
    });

    it('sem parcela aberta não há próximo vencimento', () => {
        expect(resumoFinanceiroParceiro([], HOJE).proximoVencimento).toBeNull();
    });
});
