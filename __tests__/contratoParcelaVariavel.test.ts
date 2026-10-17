import { describe, it, expect } from 'vitest';
import {
    modoValorParcela, parcelaBaixada, semParcelasBaixadas, valorDaBaixa, conciliarAjustandoValor,
} from '../utils/contratoParcelaVariavel';
import { planMatching, pontuarParcelaVariavel, AJUSTES_PADRAO, type PartyIndex } from '../utils/reconciliationRules';
import { resumoDaSelecao } from '../utils/reconciliationSelection';
import type { InternalTransaction } from '../types/financial';

describe('modoValorParcela', () => {
    it('sem a coluna (contrato antigo) é FIXO', () => {
        expect(modoValorParcela({})).toBe('FIXO');
        expect(modoValorParcela(null)).toBe('FIXO');
        expect(modoValorParcela({ installment_value_mode: 'VARIAVEL' })).toBe('VARIAVEL');
    });
});

describe('semParcelasBaixadas — o sync não regrava parcela paga', () => {
    const lote = [{ reference_id: 'c-p2026-01-10' }, { reference_id: 'c-p2026-02-10' }, { reference_id: 'c-p2026-03-10' }];
    it('conciliada, paga e parcial ficam fora; em aberto continua sendo atualizada', () => {
        const r = semParcelasBaixadas(lote, [
            { reference_id: 'c-p2026-01-10', status: 'CONCILIATED', business_status: 'PREVISTO' },
            { reference_id: 'c-p2026-02-10', status: 'PENDING', business_status: 'PREVISTO' },
        ]);
        expect(r.map(x => x.reference_id)).toEqual(['c-p2026-02-10', 'c-p2026-03-10']);
    });
    it('parcelaBaixada reconhece PAGO, RECEBIDO e PARCIAL', () => {
        expect(parcelaBaixada({ business_status: 'PAGO' })).toBe(true);
        expect(parcelaBaixada({ business_status: 'RECEBIDO' })).toBe(true);
        expect(parcelaBaixada({ business_status: 'PARCIAL' })).toBe(true);
        expect(parcelaBaixada({ status: 'PENDING', business_status: 'PREVISTO' })).toBe(false);
    });
});

describe('valorDaBaixa', () => {
    it('variável com valor diferente grava o pago (em centavos)', () => {
        expect(valorDaBaixa({ valorVariavel: true, valor: 600 }, 750)).toBe(750);
        expect(valorDaBaixa({ valorVariavel: true, valor: 600 }, 750.004)).toBe(750);
    });
    it('fixa, igual ao previsto ou inválido: não mexe no valor', () => {
        expect(valorDaBaixa({ valorVariavel: false, valor: 600 }, 750)).toBeNull();
        expect(valorDaBaixa({ valorVariavel: true, valor: 600 }, 600)).toBeNull();
        expect(valorDaBaixa({ valorVariavel: true, valor: 600 }, 0)).toBeNull();
        expect(valorDaBaixa({ valorVariavel: true, valor: 600 }, null)).toBeNull();
    });
});

describe('conciliarAjustandoValor', () => {
    it('só parcela variável com valor diferente do extrato', () => {
        expect(conciliarAjustandoValor({ valor_variavel: true, amount: 600 }, 750)).toBe(true);
        expect(conciliarAjustandoValor({ valor_variavel: true, amount: 600 }, 600)).toBe(false);
        expect(conciliarAjustandoValor({ valor_variavel: false, amount: 600 }, 750)).toBe(false);
    });
});

// ── Motor: o caso real da faxina (PIX R$ 750 × parcela prevista R$ 600) ──
const indice: PartyIndex = {
    docIndex: new Map([['32195297808', { party_id: 'sup-debora', party_type: 'SUPPLIER' as const, party_name: 'Débora Cristina Duarte' }]]),
    aliases: [],
};
const pix750 = {
    id: 'b1', transaction_date: '2024-07-03', amount: 750, direction: 'DEBIT',
    description_raw: 'PAGAMENTO PIX-PIX_DEB 32195297808 Débora Cristina Duarte',
    description_normalized: 'PAGAMENTO PIX PIX DEB 32195297808 DEBORA CRISTINA DUARTE',
};
const parcela = (over: Partial<{ id: string; valor_variavel: boolean; party_name: string; amount: number }> = {}) => ({
    id: 'p1', transaction_date: '2024-07-10', due_date: '2024-07-10', amount: 600, direction: 'DEBIT',
    description: 'Fatura Contrato CTS-010-036-0001 (36) - julho de 2024',
    entity_name: 'Débora Cristina Duarte', party_name: 'Débora Cristina Duarte', valor_variavel: true, ...over,
});

describe('motor × parcela de valor variável', () => {
    it('mesmo fornecedor, valor diferente: vira SUGESTÃO, nunca conciliação automática', () => {
        const plano = planMatching([pix750], [parcela()], AJUSTES_PADRAO, indice);
        expect(plano.autoMatches).toHaveLength(0);
        expect(plano.suggestionRows).toHaveLength(1);
        expect(plano.suggestionRows[0].confidence).toBeLessThan(AJUSTES_PADRAO.auto_threshold);
        expect(plano.suggestionRows[0].reason).toMatch(/valor variável/);
    });

    it('parcela FIXA de R$ 600 continua fora da faixa de um PIX de R$ 750', () => {
        const plano = planMatching([pix750], [parcela({ valor_variavel: false })], AJUSTES_PADRAO, indice);
        expect(plano.suggestionRows).toHaveLength(0);
        expect(plano.autoMatches).toHaveLength(0);
    });

    it('sem o fornecedor reconhecido no extrato, a variável não é sugerida', () => {
        const semNome = { ...pix750, description_raw: 'SAQUE DINHEIRO ATM', description_normalized: 'SAQUE DINHEIRO ATM' };
        const r = pontuarParcelaVariavel(semNome, parcela(), AJUSTES_PADRAO, null);
        expect(r.score).toBe(0);
    });

    it('valor exato segue a regra comum (pode conciliar sozinha)', () => {
        const plano = planMatching([{ ...pix750, amount: 600, transaction_date: '2024-07-10' }], [parcela()], AJUSTES_PADRAO, indice);
        expect(plano.autoMatches).toHaveLength(1);
    });
});

describe('dock "Ajustar valor"', () => {
    const titulo = (over: Partial<InternalTransaction>): InternalTransaction => ({
        id: 't', organization_id: 'o', amount: 600, direction: 'DEBIT', status: 'PENDING',
        source_system: 'CONTRACT_RECURRING', transaction_date: '2024-07-10', description: 'x',
        ...over,
    } as InternalTransaction);
    const extrato = [{ id: 'b', amount: 750, direction: 'DEBIT' as const }];

    it('libera para parcela de contrato com valor variável', () => {
        expect(resumoDaSelecao(extrato, [titulo({ valor_variavel: true })]).ajustes.ADJUST_VALUE.habilitado).toBe(true);
    });
    it('parcela de contrato fixa segue bloqueada, com o motivo', () => {
        const r = resumoDaSelecao(extrato, [titulo({ valor_variavel: false })]).ajustes.ADJUST_VALUE;
        expect(r.habilitado).toBe(false);
        expect(r.motivo).toMatch(/regravado pela sincronização/);
    });
});
