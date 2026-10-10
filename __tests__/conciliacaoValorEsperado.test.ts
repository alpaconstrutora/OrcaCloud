/**
 * Parcela com tributo retido pelo cliente concilia pelo LÍQUIDO (10/10/2026).
 *
 * Aluguel bruto de R$ 10.000; o cliente retém PIS+COFINS (R$ 465) e deposita
 * R$ 9.535. O banco devolve `valor_esperado` = 9.535 (campo computado); o
 * `amount` do título continua 10.000 (a DRE e os syncs dependem do bruto).
 */
import { describe, it, expect } from 'vitest';
import * as regras from '../utils/reconciliationRules';
import { resumoDaSelecao } from '../utils/reconciliationSelection';
import type { InternalTransaction } from '../types/financial';

const tituloRetido = {
    id: 't1', direction: 'CREDIT', amount: 10000, valor_esperado: 9535,
    transaction_date: '2026-09-10', due_date: '2026-09-10',
    description: 'Aluguel 09/2026', party_name: 'Defensoria Pública',
};
const creditoLiquido = {
    id: 'b1', direction: 'CREDIT', amount: 9535, transaction_date: '2026-09-10',
    description_raw: 'TED RECEBIDA DEFENSORIA PUBLICA', description_normalized: 'TED RECEBIDA DEFENSORIA PUBLICA',
    counterparty_name: 'DEFENSORIA PUBLICA',
};
const semIndice = { docIndex: new Map(), aliases: [] };

describe('comValorEsperado / valorParaConciliar', () => {
    it('troca o amount pelo esperado só no objeto do plano', () => {
        const t = regras.comValorEsperado(tituloRetido);
        expect(t.amount).toBe(9535);
        expect(tituloRetido.amount).toBe(10000); // original intacto
    });

    it('sem valor_esperado (null/ausente) fica o bruto', () => {
        expect(regras.comValorEsperado({ amount: 500, valor_esperado: null }).amount).toBe(500);
        expect(regras.comValorEsperado({ amount: 500 }).amount).toBe(500);
        expect(regras.valorParaConciliar({ amount: 500 })).toBe(500);
    });

    it('aceita o numeric do PostgREST vindo como string', () => {
        expect(regras.valorParaConciliar({ amount: 10000, valor_esperado: '9535.00' })).toBe(9535);
    });
});

describe('motor de conciliação com parcela retida', () => {
    it('pelo bruto, o crédito líquido nem chega a ser candidato (pré-filtro 0,90–1,01)', () => {
        const plano = regras.planMatching([creditoLiquido], [tituloRetido], regras.AJUSTES_PADRAO, semIndice);
        expect(plano.autoMatches).toEqual([]);
        expect(plano.suggestionRows).toEqual([]);
    });

    it('pelo esperado, casa sozinho (valor exato e único)', () => {
        const plano = regras.planMatching([creditoLiquido], [tituloRetido].map(regras.comValorEsperado), regras.AJUSTES_PADRAO, semIndice);
        expect(plano.autoMatches.map(m => [m.bankId, m.internalId])).toEqual([['b1', 't1']]);
    });

    it('sem retenção (esperado = bruto) nada muda: crédito líquido não casa', () => {
        const semRetencao = { ...tituloRetido, valor_esperado: 10000 };
        const plano = regras.planMatching([creditoLiquido], [semRetencao].map(regras.comValorEsperado), regras.AJUSTES_PADRAO, semIndice);
        expect(plano.autoMatches).toEqual([]);
    });
});

describe('resumoDaSelecao soma o que o banco credita', () => {
    const lanc = (valor_esperado?: number): InternalTransaction => ({
        id: 'i1', organization_id: 'o', source_system: 'CONTRACT_RECURRING', transaction_date: '2026-09-10',
        status: 'PENDING', amount: 10000, direction: 'CREDIT', valor_esperado,
    });

    it('com retenção: extrato líquido × parcela bruta concilia sem diferença', () => {
        const r = resumoDaSelecao([{ id: 'b1', amount: 9535, direction: 'CREDIT' }], [lanc(9535)]);
        expect(r.totalLancamentos).toBe(9535);
        expect(r.temDiferenca).toBe(false);
        expect(r.conciliar.habilitado).toBe(true);
    });

    it('sem retenção: o líquido no extrato continua sendo diferença', () => {
        const r = resumoDaSelecao([{ id: 'b1', amount: 9535, direction: 'CREDIT' }], [lanc()]);
        expect(r.totalLancamentos).toBe(10000);
        expect(r.temDiferenca).toBe(true);
    });
});
