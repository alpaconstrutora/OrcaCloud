/**
 * Edição em Lote › mudar o status (23/10/2026 —
 * docs/planos/2026-10-23-boleto-lote-status.md, item 1).
 *
 * Mesma tabela do campo Status da página (`transicoesDoBoleto`), boleto a
 * boleto: quem pode muda com o efeito de sempre; quem não pode fica como
 * está, e diz por quê.
 */
import { describe, expect, it } from 'vitest';
import {
    STATUS_DO_LOTE, planoDeStatusDoBoleto, resumoDeStatusEmLote, temLancamento, MOTIVO_STATUS_PROGRAMADO,
} from '../utils/boletoStatus';

describe('planoDeStatusDoBoleto', () => {
    it('o lote oferece revisão, rascunho, pago e cancelado — aprovar é o "Aprovar e Lançar"', () => {
        expect(STATUS_DO_LOTE).toEqual(['revisao', 'rascunho', 'pago', 'cancelado']);
    });

    it('muda quando o caminho existe, com o efeito da tabela', () => {
        const p = planoDeStatusDoBoleto({ status: 'aprovado', invoice_id: 'inv' }, 'rascunho');
        expect(p.muda && p.transicao.efeito).toBe('estornar');
        const q = planoDeStatusDoBoleto({ status: 'rascunho' }, 'revisao');
        expect(q.muda && q.transicao.efeito).toBe('rotulo');
    });

    it('fica como está — com o motivo — quando já está, é programado ou o caminho não existe', () => {
        expect(planoDeStatusDoBoleto({ status: 'pago' }, 'pago')).toEqual({ muda: false, motivo: 'Já está em "Pago".' });
        expect(planoDeStatusDoBoleto({ status: 'programado' }, 'cancelado')).toEqual({ muda: false, motivo: MOTIVO_STATUS_PROGRAMADO });
        expect(planoDeStatusDoBoleto({ status: 'rascunho' }, 'pago'))
            .toEqual({ muda: false, motivo: 'De "Rascunho" não vai para "Pago" — aprove e lance antes.' });
        expect(planoDeStatusDoBoleto({ status: 'pago' }, 'cancelado'))
            .toEqual({ muda: false, motivo: 'De "Pago" não vai para "Cancelado".' });
    });

    it('lançamento = nota, ou aprovado/pago', () => {
        expect(temLancamento({ status: 'cancelado', invoice_id: 'inv' })).toBe(true);
        expect(temLancamento({ status: 'cancelado' })).toBe(false);
        expect(temLancamento({ status: 'pago' })).toBe(true);
    });
});

describe('resumoDeStatusEmLote', () => {
    it('conta quem muda e quem fica, e agrupa o efeito pelo status de origem', () => {
        const r = resumoDeStatusEmLote([
            { id: 'a', status: 'aprovado', invoice_id: 'i1' },
            { id: 'b', status: 'aprovado', invoice_id: 'i2' },
            { id: 'c', status: 'revisao' },
            { id: 'd', status: 'pago' },
        ], 'cancelado');
        expect(r.mudam).toBe(3);
        expect(r.ficam).toBe(1);
        expect(r.porId.get('d')).toEqual({ muda: false, motivo: 'De "Pago" não vai para "Cancelado".' });
        expect(r.efeitos.map(e => [e.de, e.quantos, e.efeito])).toEqual([['aprovado', 2, 'cancelar'], ['revisao', 1, 'cancelar']]);
        expect(r.efeitos[0].descricao).toMatch(/título em Contas a Pagar e a nota ficam cancelados/);
        expect(r.mexeNoFinanceiro).toBe(true);
    });

    it('só rascunho ↔ revisão não mexe no financeiro', () => {
        const r = resumoDeStatusEmLote([{ id: 'a', status: 'rascunho' }, { id: 'b', status: 'revisao' }], 'revisao');
        expect(r.mudam).toBe(1);
        expect(r.mexeNoFinanceiro).toBe(false);
    });
});
