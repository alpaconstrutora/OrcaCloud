/**
 * Quem a Edição em Lote pode aprovar e lançar, e com qual fornecedor
 * (21/10/2026 — docs/planos/2026-10-21-boleto-lote-aprovar-sem-alterar.md).
 *
 * O botão passou a funcionar sem alteração de campo. Por isso a regra decide
 * por boleto: só rascunho/revisão (um pago selecionado não pode voltar a
 * "aprovado"), e fornecedor vazio usa o SUGERIDO — como a página do boleto.
 */
import { describe, expect, it } from 'vitest';
import {
    avaliarAprovacaoEmLote,
    resumoDaAprovacaoEmLote,
    MOTIVO_SEM_FORNECEDOR,
    MOTIVO_SEM_VALOR,
    MOTIVO_SEM_VENCIMENTO,
    motivoDoStatus,
} from '../utils/boletoAprovacaoLote';

const pronto = {
    status: 'revisao' as const, supplier_id: 'sup-1', sugestao_supplier_id: null,
    vencimento: '2026-06-21', valor: 107.32,
};

describe('avaliarAprovacaoEmLote', () => {
    it('boleto completo em revisão está pronto, com o fornecedor dele', () => {
        expect(avaliarAprovacaoEmLote(pronto, {})).toEqual({ pronto: true, fornecedor: 'sup-1', usaSugestao: false });
    });

    it('sem fornecedor, usa o sugerido (os 14 da Energisa)', () => {
        const b = { ...pronto, supplier_id: null, sugestao_supplier_id: 'sup-energisa' };
        expect(avaliarAprovacaoEmLote(b, {})).toEqual({ pronto: true, fornecedor: 'sup-energisa', usaSugestao: true });
    });

    it('fornecedor escolhido no lote vence o do boleto e a sugestão', () => {
        const b = { ...pronto, sugestao_supplier_id: 'sup-sug' };
        expect(avaliarAprovacaoEmLote(b, { supplier_id: 'sup-lote' })).toEqual({ pronto: true, fornecedor: 'sup-lote', usaSugestao: false });
    });

    it('"Sem vínculo" no lote (supplier_id: null) não cai na sugestão', () => {
        const b = { ...pronto, supplier_id: null, sugestao_supplier_id: 'sup-sug' };
        expect(avaliarAprovacaoEmLote(b, { supplier_id: null })).toEqual({ pronto: false, motivo: MOTIVO_SEM_FORNECEDOR });
    });

    it('rascunho também pode; aprovado, programado, pago e cancelado não', () => {
        expect(avaliarAprovacaoEmLote({ ...pronto, status: 'rascunho' }, {}).pronto).toBe(true);
        for (const status of ['aprovado', 'programado', 'pago', 'cancelado'] as const) {
            expect(avaliarAprovacaoEmLote({ ...pronto, status }, {})).toEqual({ pronto: false, motivo: motivoDoStatus(status) });
        }
        expect(motivoDoStatus('pago')).toMatch(/"Pago"/);
    });

    it('sem vencimento ou sem valor não lança — com o motivo', () => {
        expect(avaliarAprovacaoEmLote({ ...pronto, vencimento: null }, {})).toEqual({ pronto: false, motivo: MOTIVO_SEM_VENCIMENTO });
        expect(avaliarAprovacaoEmLote({ ...pronto, valor: null }, {})).toEqual({ pronto: false, motivo: MOTIVO_SEM_VALOR });
        expect(avaliarAprovacaoEmLote({ ...pronto, valor: 0 }, {})).toEqual({ pronto: false, motivo: MOTIVO_SEM_VALOR });
    });

    it('ordem dos motivos: status, fornecedor, vencimento, valor', () => {
        const vazio = { status: 'pago' as const, supplier_id: null, sugestao_supplier_id: null, vencimento: null, valor: null };
        expect(avaliarAprovacaoEmLote(vazio, {})).toEqual({ pronto: false, motivo: motivoDoStatus('pago') });
        expect(avaliarAprovacaoEmLote({ ...vazio, status: 'revisao' }, {})).toEqual({ pronto: false, motivo: MOTIVO_SEM_FORNECEDOR });
        expect(avaliarAprovacaoEmLote({ ...vazio, status: 'revisao', supplier_id: 's' }, {})).toEqual({ pronto: false, motivo: MOTIVO_SEM_VENCIMENTO });
    });
});

describe('resumoDaAprovacaoEmLote', () => {
    it('conta prontos, os que usam a sugestão e lista as pendências com o motivo', () => {
        const boletos = [
            { id: 'a', ...pronto },
            { id: 'b', ...pronto, supplier_id: null, sugestao_supplier_id: 'sug' },
            { id: 'c', ...pronto, status: 'pago' as const },
        ];
        const r = resumoDaAprovacaoEmLote(boletos, {});
        expect(r.prontos).toBe(2);
        expect(r.comSugestao).toBe(1);
        expect(r.pendencias).toEqual([{ id: 'c', motivo: motivoDoStatus('pago') }]);
        expect(r.porId.get('b')).toEqual({ pronto: true, fornecedor: 'sug', usaSugestao: true });
    });
});
