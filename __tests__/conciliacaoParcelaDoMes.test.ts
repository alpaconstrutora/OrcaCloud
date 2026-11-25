/**
 * Motor de conciliação × parcela do mês (pedido de 24/11/2026).
 *
 * Caso real anonimizado — contrato de aluguel de 30 parcelas mensais (vencimento dia 10),
 * cliente deposita todo mês R$ 4.338,43 entre os dias 5 e 7; o título está em R$ 4.167,03
 * (reajuste que não chegou ao título, 4,1%). Antes: cada depósito ia para a parcela de DOIS
 * meses antes "com encargos" (multa 2% + juros ≈ 58 dias → 65), e os depósitos sem parcela
 * antiga em aberto ficavam sem sugestão (parcela do mês 38 < mínimo 40).
 *
 * Regra A: encargos de parcela antiga descartados quando ela já tem o seu depósito no mês.
 * Regra B: parcela de contrato do mês, mesmo cliente, até 15% de diferença → +15 (reajuste).
 */
import { describe, it, expect } from 'vitest';
import * as regras from '../utils/reconciliationRules';

const semIndice = { docIndex: new Map(), aliases: [] };
const S = regras.AJUSTES_PADRAO;
const CLIENTE = 'Igreja Exemplo do Reino';

const parcela = (venc: string, extra: Partial<regras.TituloParaPlano> = {}): regras.TituloParaPlano => ({
    id: `p${venc}`, direction: 'CREDIT', amount: 4167.03, transaction_date: venc, due_date: venc,
    description: `Contrato CTL-X — parcela (${venc})`, party_name: CLIENTE, contract_id: 'ctl-x', ...extra,
});
const deposito = (data: string, valor = 4338.43): regras.BankRowParaPlano => ({
    id: `b${data}`, direction: 'CREDIT', amount: valor, transaction_date: data,
    description_normalized: 'TED RECEBIDA IGREJA EXEMPLO DO REINO', counterparty_name: CLIENTE,
});

/** Sugestão de MAIOR confiança por depósito → vencimento da parcela. */
const topo = (plano: regras.PlanoDeConciliacao) => {
    const m = new Map<string, { venc: string; conf: number; motivo: string }>();
    for (const s of plano.suggestionRows) {
        const atual = m.get(s.bank_transaction_id);
        if (!atual || s.confidence > atual.conf) {
            m.set(s.bank_transaction_id, { venc: s.candidate_internal_transaction_id.slice(1), conf: s.confidence, motivo: s.reason });
        }
    }
    return m;
};

// Parcelas 25–30 em aberto (nov/2018–abr/2019); 02–24 já conciliadas (fora dos candidatos).
const PARCELAS = ['2018-11-10', '2018-12-10', '2019-01-10', '2019-02-10', '2019-03-10', '2019-04-10'].map(v => parcela(v));
const DEPOSITOS = ['2018-11-06', '2018-12-05', '2019-01-07', '2019-02-05', '2019-03-07', '2019-04-05', '2019-05-06', '2019-06-05'].map(d => deposito(d));

describe('motor × parcela do mês (caso real anonimizado, 24/11/2026)', () => {
    it('cada depósito sugere a parcela do PRÓPRIO mês; depois do fim do contrato, nada', () => {
        const t = topo(regras.planMatching(DEPOSITOS, PARCELAS, S, semIndice));
        expect(Object.fromEntries([...t].map(([b, v]) => [b.slice(1), v.venc]))).toEqual({
            '2018-11-06': '2018-11-10',
            '2018-12-05': '2018-12-10',
            '2019-01-07': '2019-01-10',
            '2019-02-05': '2019-02-10',
            '2019-03-07': '2019-03-10',
            '2019-04-05': '2019-04-10',
            // mai e jun/2019: a parcela de mar e abr já tem o seu depósito → sem encargos, sem sugestão
        });
    });

    it('Regra B: o motivo diz "possível reajuste" e a confiança fica abaixo da conciliação automática', () => {
        const plano = regras.planMatching([deposito('2018-11-06')], [parcela('2018-11-10')], S, semIndice);
        expect(plano.autoMatches).toEqual([]);
        const [s] = plano.suggestionRows;
        expect(s.reason).toContain('Valor 4,1% diferente (possível reajuste)');
        expect(s.confidence).toBeGreaterThanOrEqual(S.suggestion_min);
        expect(s.confidence).toBeLessThan(S.auto_threshold);
    });

    it('Regra A: a parcela antiga sem depósito no mês continua podendo ser "paga atrasada com encargos"', () => {
        // Só o depósito de janeiro existe: a parcela de novembro não tem dono no mês.
        const plano = regras.planMatching([deposito('2019-01-07')], [parcela('2018-11-10')], S, semIndice);
        expect(plano.suggestionRows[0]?.reason).toContain(regras.PREFIXO_ENCARGOS);
    });

    it('Regra A: com o depósito do mês presente, os encargos da parcela antiga são descartados e o motivo diz qual', () => {
        const plano = regras.planMatching([deposito('2018-11-06'), deposito('2019-01-07')], [parcela('2018-11-10')], S, semIndice);
        const doJaneiro = plano.suggestionRows.filter(s => s.bank_transaction_id === 'b2019-01-07');
        expect(doJaneiro).toEqual([]); // 65 − 35 = 30, abaixo do mínimo
        const r = regras.descartarEncargosComDonoNoMes(
            { c: parcela('2018-11-10'), score: 65, reasons: [`${regras.PREFIXO_ENCARGOS}: multa…`, 'Mesmo fornecedor (alta similaridade)'] },
            deposito('2019-01-07'), [deposito('2018-11-06'), deposito('2019-01-07')], S, semIndice);
        expect(r.score).toBe(30);
        expect(r.reasons[0]).toBe('Encargos descartados: o depósito de 06/11/2018 do mesmo cliente já é desta parcela');
    });

    it('Regra B NÃO vale para título fora de contrato, nem com outro cliente, nem acima de 15%', () => {
        const avulso = parcela('2018-11-10', { contract_id: null });
        expect(regras.planMatching([deposito('2018-11-06')], [avulso], S, semIndice).suggestionRows).toEqual([]);
        const outro = parcela('2018-11-10', { party_name: 'Comercial Tal e Qual Ltda', description: 'Fatura' });
        expect(regras.planMatching([deposito('2018-11-06')], [outro], S, semIndice).suggestionRows).toEqual([]);
        expect(regras.planMatching([deposito('2018-11-06', 4167.03 * 1.16)], [parcela('2018-11-10')], S, semIndice).suggestionRows).toEqual([]);
    });
});
