/**
 * Regras por linha da propagação no Financeiro (fornecedor e cliente usam as
 * mesmas): boleto preserva o beneficiário lido; rascunho de conta a pagar não
 * é tocado (o gatilho o mandaria para a aprovação). Plano:
 * docs/planos/2026-11-14-meus-fornecedores-propagar-edicao.md
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const chamadas: { or?: string; select?: string } = {};
let linhas: unknown[] = [];
vi.mock('../lib/supabase', () => ({
    supabase: {
        from: () => {
            const c: Record<string, unknown> = {};
            c.select = (s: string) => { chamadas.select = s; return c; };
            c.or = (f: string) => { chamadas.or = f; return Promise.resolve({ data: linhas, error: null }); };
            return c;
        },
    },
}));

import { alteracoesDoFinanceiro } from '../services/clientPropagacaoService';
import { supplierPropagacaoService } from '../services/supplierPropagacaoService';
import { mandariaParaAlcada } from '../utils/clientPropagacao';

const novo = { name: 'Cimento Forte Ltda' };

beforeEach(() => { linhas = []; });

describe('alteracoesDoFinanceiro', () => {
    it('BOLETO: troca o party_name (OCR ou vazio) e preserva o entity_name do beneficiário', () => {
        const { alteracoes } = alteracoesDoFinanceiro([
            { id: 'b1', source_system: 'BOLETO', party_name: 'CIMENTO FORTE LTDA CNPJ 00 RUA X', entity_name: 'CIMENTO FORTE LTDA CNPJ 00 RUA X', direction: 'DEBIT', status: 'PENDING', approval_status: 'APROVADO' },
            { id: 'b2', source_system: 'BOLETO', party_name: null, entity_name: null, direction: 'DEBIT', status: 'CONCILIATED', approval_status: 'APROVADO' },
        ], novo);
        expect(alteracoes).toEqual([
            { tabela: 'internal_transactions', id: 'b1', patch: { party_name: 'Cimento Forte Ltda' } },
            { tabela: 'internal_transactions', id: 'b2', patch: { party_name: 'Cimento Forte Ltda' } },
        ]);
    });

    it('fora do boleto, o entity_name espelho acompanha', () => {
        const { alteracoes } = alteracoesDoFinanceiro([
            { id: 'm1', source_system: 'MANUAL', party_name: 'Cimento Forte', entity_name: 'Cimento Forte', direction: 'DEBIT', status: 'PENDING', approval_status: 'APROVADO' },
        ], novo);
        expect(alteracoes[0].patch).toEqual({ party_name: 'Cimento Forte Ltda', entity_name: 'Cimento Forte Ltda' });
    });

    it('rascunho de conta a pagar fica como está e é contado', () => {
        const r = alteracoesDoFinanceiro([
            { id: 'r1', party_name: 'Cimento Forte', direction: 'DEBIT', status: 'PENDING', approval_status: 'RASCUNHO' },
            { id: 'r2', party_name: 'Cimento Forte', direction: 'DEBIT', status: 'PENDING', approval_status: null },
            { id: 'ok', party_name: 'Cimento Forte', direction: 'DEBIT', status: 'PENDING', approval_status: 'PENDENTE' },
            { id: 'em-dia', party_name: 'Cimento Forte Ltda', direction: 'DEBIT', status: 'PENDING', approval_status: 'RASCUNHO' },
        ], novo);
        expect(r.alteracoes.map(a => a.id)).toEqual(['ok']);
        expect(r.rascunhosMantidos).toBe(2);
    });
});

describe('mandariaParaAlcada', () => {
    it('só DEBIT + PENDING + RASCUNHO (nulo conta como rascunho)', () => {
        expect(mandariaParaAlcada({ direction: 'DEBIT', status: 'PENDING', approval_status: null })).toBe(true);
        expect(mandariaParaAlcada({ direction: 'DEBIT', status: 'CONCILIATED', approval_status: 'RASCUNHO' })).toBe(false);
        expect(mandariaParaAlcada({ direction: 'CREDIT', status: 'PENDING', approval_status: 'RASCUNHO' })).toBe(false);
        expect(mandariaParaAlcada({ direction: 'DEBIT', status: 'PENDING', approval_status: 'APROVADO' })).toBe(false);
    });
});

describe('supplierPropagacaoService.planejar', () => {
    it('lê o financeiro por supplier_id OU party_id, com as colunas das regras', async () => {
        linhas = [{ id: 't1', party_name: 'Cimento Forte', direction: 'DEBIT', status: 'PENDING', approval_status: 'APROVADO' }];
        const plano = await supplierPropagacaoService.planejar('f1', novo);
        expect(chamadas.or).toBe('supplier_id.eq.f1,party_id.eq.f1');
        expect(chamadas.select).toContain('approval_status');
        expect(chamadas.select).toContain('source_system');
        expect(plano.porDestino.financeiro?.map(a => a.id)).toEqual(['t1']);
        expect(plano.rascunhosMantidos).toBe(0);
    });

    it('sem nada a mudar devolve porDestino vazio', async () => {
        linhas = [{ id: 't1', party_name: 'Cimento Forte Ltda' }];
        const plano = await supplierPropagacaoService.planejar('f1', novo);
        expect(plano.porDestino).toEqual({});
    });
});
