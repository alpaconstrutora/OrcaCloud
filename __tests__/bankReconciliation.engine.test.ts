/**
 * Motor de conciliação — funções puras (item 1.8 do plano
 * docs/planos/2026-09-05-conciliacao-bancaria-plano-execucao.md).
 *
 * Cada peso do score aditivo tem um caso: valor exato +40 / encargos +35 / valor
 * próximo +20 · mesma data +20 / ≤3d +15 / ≤janela +8 · mesma contraparte por id +50 /
 * reconhecida +25 / similaridade alta +30 / similar +15 · documento (NF) +40.
 * Auto-conciliação exige ≥ auto_threshold (100) e 20 pontos à frente do 2º.
 *
 * Os pares "reais" foram anonimizados a partir da consulta de 231 pares exatos em
 * produção (05/09/2026): mesmo valor, mesma direção, ±10 dias.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { bankReconciliationService, type ReconciliationEngineSettings } from '../services/bankReconciliationService';
import { findSubset, partyMatchesText } from '../services/reconciliationGroupService';

const S: ReconciliationEngineSettings = {
    fine_percent: 2, interest_percent_month: 1,
    value_tol_abs: 50, value_tol_pct: 3, encargos_tol_pct: 0.5,
    date_window_days: 10, auto_threshold: 100, suggestion_min: 40,
};

const svc = bankReconciliationService;

describe('calculateSimilarity (Dice em bigramas)', () => {
    it('idênticos = 1, vazios = 0', () => {
        expect(svc.calculateSimilarity('CONSTRUTORA ALPA', 'construtora alpa')).toBe(1);
        expect(svc.calculateSimilarity('', 'X')).toBe(0);
    });
    it('ruído de extrato ainda reconhece o fornecedor', () => {
        // 0.5 é exatamente o piso de "Fornecedor similar" (+15) em scoreCandidate — o teste trava esse limiar.
        const sim = svc.calculateSimilarity('PIX ENVIADO 11866633000101 EMPORIUM DOS PAES', 'EMPORIUM DOS PAES LTDA');
        expect(sim).toBeGreaterThanOrEqual(0.5);
    });
    it('contrapartes diferentes ficam baixas', () => {
        expect(svc.calculateSimilarity('REGINALDO BENEDITO NUNES', 'EMPORIUM DOS PAES')).toBeLessThan(0.3);
    });
});

describe('computeInterestExpectation (multa + juros pró-rata)', () => {
    it('pago antes ou no vencimento → null', () => {
        expect(svc.computeInterestExpectation(1000, '2026-03-10', '2026-03-10', S)).toBeNull();
        expect(svc.computeInterestExpectation(1000, '2026-03-10', '2026-03-05', S)).toBeNull();
    });
    it('15 dias de atraso: multa 2% + juros 1% a.m. pró-rata', () => {
        const r = svc.computeInterestExpectation(1000, '2026-03-10', '2026-03-25', S)!;
        expect(r.daysLate).toBe(15);
        expect(r.multa).toBe(20);
        expect(r.juros).toBeCloseTo(5, 2);
        expect(r.expected).toBe(1025);
    });
});

describe('documentMatches (nº de NF na descrição do extrato)', () => {
    it('acha o número do documento entre os dígitos do extrato', () => {
        expect(svc.documentMatches('NF 4521 Materiais', 'PAGTO BOLETO 000004521 FORNEC')).toBe(true);
    });
    it('sem número no título → false', () => {
        expect(svc.documentMatches('Aluguel março', 'PIX 123456')).toBe(false);
    });
});

describe('extractAliasToken', () => {
    it('tira ruído bancário e números, mantém até 4 palavras da contraparte', () => {
        expect(svc.extractAliasToken('PIX ENVIADO 11866633000101 EMPORIUM DOS PAES LTDA')).toBe('EMPORIUM PAES');
        expect(svc.extractAliasToken('PAGAMENTO BOLETO CONSTRUTORA ALPA ENGENHARIA E COMERCIO')).toBe('CONSTRUTORA ALPA ENGENHARIA COMERCIO');
    });
});

describe('resolveBankParty', () => {
    const index = {
        docIndex: new Map([['11866633000101', { party_id: 'sup-emporium', party_type: 'SUPPLIER' as const, party_name: 'Emporium dos Pães' }]]),
        aliases: [{ token: 'REGINALDO', party_id: 'sup-reginaldo', party_type: 'SUPPLIER' as const, party_name: 'Reginaldo B. Nunes', hit: 3 }],
    };
    it('alias aprendido vem primeiro', () => {
        const r = svc.resolveBankParty({ description_raw: 'PIX SICREDI 07593144000148 REGINALDO BEN' }, index);
        expect(r).toMatchObject({ party_id: 'sup-reginaldo', via: 'aprendido' });
    });
    it('CNPJ no texto bruto identifica o fornecedor', () => {
        const r = svc.resolveBankParty({ description_raw: 'PAGAMENTO PIX-PIX_DEB   11866633000101 EMPORIUM DOS PAES' }, index);
        expect(r).toMatchObject({ party_id: 'sup-emporium', via: 'CNPJ' });
    });
    it('sem alias nem documento → null', () => {
        expect(svc.resolveBankParty({ description_raw: 'TARIFA PACOTE SERVICOS' }, index)).toBeNull();
    });
});

describe('scoreCandidate — cada peso', () => {
    const bank = { amount: 1500, direction: 'DEBIT', transaction_date: '2026-03-10', description_normalized: 'PIX ENVIADO CONSTRUTORA ALPA', counterparty_name: undefined as string | undefined };

    it('valor exato + mesma data = 60 (não basta para auto)', () => {
        const r = svc.scoreCandidate(bank, { amount: 1500, transaction_date: '2026-03-10', description: 'Parcela 3' }, S);
        expect(r.score).toBe(60);
        expect(r.reasons).toEqual(['Valor exato', 'Mesma data']);
    });
    it('valor exato + data próxima (2d) = 55', () => {
        const r = svc.scoreCandidate(bank, { amount: 1500, transaction_date: '2026-03-08', description: 'x' }, S);
        expect(r.score).toBe(55);
    });
    it('valor exato + data na janela (7d) = 48', () => {
        const r = svc.scoreCandidate(bank, { amount: 1500, transaction_date: '2026-03-03', description: 'x' }, S);
        expect(r.score).toBe(48);
    });
    it('encargos compatíveis: título de 1.000 vencido há 15 dias pago por 1.025 → +35', () => {
        const b = { ...bank, amount: 1025, transaction_date: '2026-03-25' };
        const r = svc.scoreCandidate(b, { amount: 1000, transaction_date: '2026-03-10', due_date: '2026-03-10', description: 'x' }, S);
        expect(r.reasons[0]).toMatch(/encargos/);
        expect(r.score).toBe(35); // 15 dias de distância: fora de ±3 e fora da janela de 10 → só o valor pontua
    });
    it('valor próximo (dif 30 ≤ tolerância 50) → +20', () => {
        const r = svc.scoreCandidate({ ...bank, amount: 1530 }, { amount: 1500, transaction_date: '2026-03-10', description: 'x' }, S);
        expect(r.reasons).toContain('Valor próximo (dif R$ 30,00)');
        expect(r.score).toBe(40);
    });
    it('mesma contraparte por id (+50) leva a 110 → auto', () => {
        const resolved = { party_id: 'sup-1', party_type: 'SUPPLIER' as const, party_name: 'Construtora Alpa', via: 'CNPJ' };
        const r = svc.scoreCandidate(bank, { amount: 1500, transaction_date: '2026-03-10', description: 'x', party_id: 'sup-1', party_name: 'Construtora Alpa' }, S, resolved);
        expect(r.score).toBe(110);
        expect(r.reasons).toContain('Mesmo fornecedor (CNPJ)');
    });
    it('contraparte reconhecida sem id no título (+25) — o caso dos fornecedores hoje', () => {
        const resolved = { party_id: 'sup-1', party_type: 'SUPPLIER' as const, party_name: 'Construtora Alpa Engenharia', via: 'aprendido' };
        const r = svc.scoreCandidate(bank, { amount: 1500, transaction_date: '2026-03-10', description: 'x', party_name: 'Construtora Alpa Engenharia' }, S, resolved);
        expect(r.reasons).toContain('Fornecedor reconhecido (aprendido)');
        expect(r.score).toBe(85);
    });
    it('similaridade textual alta (+30) sem reconhecimento', () => {
        const r = svc.scoreCandidate(bank, { amount: 1500, transaction_date: '2026-03-10', description: 'x', entity_name: 'PIX ENVIADO CONSTRUTORA ALPA' }, S);
        expect(r.reasons).toContain('Mesmo fornecedor (alta similaridade)');
        expect(r.score).toBe(90);
    });
    it('documento no extrato (+40)', () => {
        const r = svc.scoreCandidate({ ...bank, description_normalized: 'PAGTO BOLETO 000004521' }, { amount: 1500, transaction_date: '2026-03-10', description: 'NF 4521' }, S);
        expect(r.reasons).toContain('Documento encontrado no extrato');
        expect(r.score).toBe(100);
    });
});

describe('pares reais anonimizados (produção 05/09/2026) — o que o motor deveria fazer', () => {
    // Amostra dos 231 pares exatos: mesmo valor, mesma direção, ±10 dias, sem outro candidato.
    const pares = [
        { bank: { amount: 2200, direction: 'DEBIT', transaction_date: '2026-08-05', description_normalized: 'PIX ENVIADO ALUGUEL GALPAO 14' }, title: { amount: 2200, transaction_date: '2026-08-05', description: 'Aluguel Galpão 14 - parcela 08/2026', party_name: 'Imobiliária Centro' } },
        { bank: { amount: 4870.33, direction: 'DEBIT', transaction_date: '2026-07-31', description_normalized: 'PAGTO FOLHA 07 2026' }, title: { amount: 4870.33, transaction_date: '2026-07-30', description: 'Salário líquido 07/2026', party_name: 'Colaborador A' } },
        { bank: { amount: 15000, direction: 'CREDIT', transaction_date: '2026-06-12', description_normalized: 'TED RECEBIDA CLIENTE UNIDADE 302' }, title: { amount: 15000, transaction_date: '2026-06-10', description: 'Parcela 12 - Unidade 302', party_name: 'Cliente Unidade 302' } },
    ];
    it('todos pontuam ≥ 55 (valor exato + data ≤ 3 dias) e viram sugestão — hoje NÃO auto-conciliam', () => {
        for (const p of pares) {
            const r = svc.scoreCandidate(p.bank, p.title, S);
            expect(r.score).toBeGreaterThanOrEqual(55);
            expect(r.score).toBeLessThan(S.auto_threshold); // motivo do item 2.1 do plano: regra "exato e único"
        }
    });
    it('caso real negativo: PIX de R$ 600 para uma pessoa × 8 faturas de R$ 600 de outro fornecedor — nenhuma se destaca', () => {
        // Visto em produção (06/2026): "PAGAMENTO PIX-PIX_DEB # Daiane Barros" casava em valor com
        // oito títulos "Fatura Contrato 005 (n) - junho de 2026" de LL Contábil. Valor igual não é
        // evidência quando há vários candidatos: o motor tem de deixar em sugestão, e a regra
        // "exato e único" (plano 2.1) NÃO pode disparar aqui.
        const bank = { amount: 600, direction: 'DEBIT', transaction_date: '2026-06-15', description_normalized: 'PAGAMENTO PIX PIX DEB DAIANE BARROS VASCO' };
        const faturas = [1, 2, 139].map(n => ({ amount: 600, transaction_date: '2026-06-10', description: `Fatura Contrato 005 (${n}) - junho de 2026`, party_name: 'LL Contábil LTDA' }));
        const scores = faturas.map(f => svc.scoreCandidate(bank, f, S).score);
        expect(new Set(scores).size).toBe(1);          // empatados: não há vencedor claro
        expect(scores[0]).toBeLessThan(S.auto_threshold);
    });
    it('caso negativo: mesmo valor e data, contrapartes claramente distintas → fica em sugestão, não auto', () => {
        const r = svc.scoreCandidate(
            { amount: 16, direction: 'DEBIT', transaction_date: '2026-01-28', description_normalized: 'PAGAMENTO PIX SICREDI REGINALDO BEN' },
            { amount: 16, transaction_date: '2026-01-28', description: 'Pão e café', party_name: 'Emporium dos Pães' },
            S,
        );
        expect(r.score).toBe(60);
    });
});

describe('evaluateRule (formatos legados)', () => {
    const tx = { id: 't1', description_normalized: 'PIX ENVIADO REGINALDO BENEDITO NUNES', description_raw: 'Pix enviado Reginaldo Benedito Nunes', status: 'NORMALIZED' } as never;
    it('objeto único com field legado description_norm', () => {
        expect(svc.evaluateRule(tx, { field: 'description_norm', type: 'contains', value: 'REGINALDO BENEDITO NUNES' })).toBe(true);
    });
    it('array = OR', () => {
        expect(svc.evaluateRule(tx, [{ field: 'description', type: 'equals', value: 'X' }, { field: 'description', type: 'starts_with', value: 'pix enviado' }])).toBe(true);
    });
    it('regex inválida não derruba o motor', () => {
        expect(svc.evaluateRule(tx, { field: 'description', type: 'regex', value: '([' })).toBe(false);
    });
    it('valor vazio nunca casa', () => {
        expect(svc.evaluateRule(tx, { field: 'description', type: 'contains', value: '' })).toBe(false);
    });
});

describe('agrupamento — findSubset e afinidade de contraparte', () => {
    it('acha 2 títulos que somam o pagamento', () => {
        const r = findSubset(300, [{ amount: 120 }, { amount: 180 }, { amount: 500 }], 1, 3);
        expect(r?.map(x => x.amount).sort()).toEqual([120, 180]);
    });
    it('acha 3 títulos dentro da tolerância', () => {
        const r = findSubset(1000, [{ amount: 400 }, { amount: 350.5 }, { amount: 249.5 }, { amount: 90 }], 1, 3);
        expect(r).toHaveLength(3);
    });
    it('nada bate → null', () => {
        expect(findSubset(100, [{ amount: 60 }, { amount: 70 }], 1, 3)).toBeNull();
    });
    it('partyMatchesText exige palavra significativa (≥4) do nome no extrato', () => {
        expect(partyMatchesText('Emporium dos Pães LTDA', 'PIX EMPORIUM PAES')).toBe(true);
        expect(partyMatchesText('Posto Ipiranga', 'PAGTO FATURA CONTRATO 12')).toBe(false);
        expect(partyMatchesText(undefined, 'x')).toBe(false);
    });
});
