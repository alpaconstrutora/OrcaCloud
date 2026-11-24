import { describe, it, expect } from 'vitest';
import {
    analisarSequencias,
    acharPagamentosJuntos,
    acharCreditosParecidos,
    posicoesNasSeries,
    trocaPelaMaisAntiga,
    type ParcelaDeContrato,
    type ExtratoPendente,
} from '../../utils/sequenciaParcelas';

const CONTA = 'conta-1';
const HOJE = '2026-11-24';

/** Parcela mensal de aluguel (dia 10), aberta por padrão. */
function parcela(mes: string, over: Partial<ParcelaDeContrato> = {}): ParcelaDeContrato {
    return {
        id: `p-${over.contract_id ?? 'c1'}-${mes}`,
        contract_id: 'c1',
        due_date: `${mes}-10`,
        amount: 1000,
        direction: 'CREDIT',
        status: 'PENDING',
        business_status: 'PREVISTO',
        bank_reconciled_at: null,
        payment_date: null,
        reference_id: null,
        party_name: 'Fulano de Tal Souza',
        entity_name: null,
        contrato: { number: 'CTL-001', title: 'Aluguel sala 1', domain: 'LOCACAO', payment_account_id: null },
        vinculos: [],
        ...over,
    };
}
/** Parcela conferida no extrato da conta, na data informada. */
function conferida(mes: string, dataBanco: string, bankId = `b-${mes}`, over: Partial<ParcelaDeContrato> = {}): ParcelaDeContrato {
    return parcela(mes, {
        status: 'CONCILIATED',
        bank_reconciled_at: `${dataBanco}T12:00:00Z`,
        payment_date: dataBanco,
        vinculos: [{ bank_transaction_id: bankId, data: dataBanco, bank_account_id: CONTA }],
        ...over,
    });
}

const opcoes = { hoje: HOJE, primeiroExtrato: '2026-01-01', ultimoExtrato: '2026-10-31', contaId: CONTA };

describe('analisarSequencias — situação de cada parcela', () => {
    it('numera pela data de vencimento, não pela ordem de chegada', () => {
        const [serie] = analisarSequencias([
            conferida('2026-03', '2026-03-10'),
            conferida('2026-01', '2026-01-10'),
            conferida('2026-02', '2026-02-10'),
        ], opcoes);
        expect(serie.parcelas.map(p => p.due_date)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);
        expect(serie.parcelas.map(p => p.numero)).toEqual([1, 2, 3]);
    });

    it('parcela aberta entre parcelas pagas é FURO', () => {
        const [serie] = analisarSequencias([
            conferida('2026-01', '2026-01-10'),
            parcela('2026-02'),
            conferida('2026-03', '2026-03-10'),
        ], opcoes);
        expect(serie.parcelas[1].situacao).toBe('furo');
        expect(serie.ocorrencias.furos).toBe(1);
    });

    it('vencida aberta sem parcela paga depois é VENCIDA (não furo)', () => {
        const [serie] = analisarSequencias([
            conferida('2026-01', '2026-01-10'),
            parcela('2026-02'),
            parcela('2026-03'),
        ], opcoes);
        expect(serie.parcelas[1].situacao).toBe('vencida');
        expect(serie.parcelas[2].situacao).toBe('vencida');
        expect(serie.ocorrencias).toMatchObject({ furos: 0, vencidas: 2 });
    });

    it('vencida depois do último extrato importado é SEM EXTRATO (não furo nem vencida)', () => {
        const [serie] = analisarSequencias([
            conferida('2026-09', '2026-09-10'),
            parcela('2026-10', { due_date: '2026-10-28' }), // +5 dias passa de 31/10
            parcela('2026-11', { due_date: '2026-11-10' }),
        ], opcoes);
        expect(serie.parcelas[1].situacao).toBe('sem_extrato');
        expect(serie.parcelas[2].situacao).toBe('sem_extrato');
        expect(serie.ocorrencias.vencidas).toBe(0);
    });

    it('vencida ANTES do primeiro extrato também é SEM EXTRATO', () => {
        const [serie] = analisarSequencias([
            parcela('2025-12'),
            conferida('2026-01', '2026-01-10'),
        ], opcoes);
        expect(serie.parcelas[0].situacao).toBe('sem_extrato');
        expect(serie.ocorrencias.furos).toBe(0);
    });

    it('vencimento hoje ou no futuro é A VENCER', () => {
        const [serie] = analisarSequencias([
            conferida('2026-10', '2026-10-10'),
            parcela('2026-12'),
        ], opcoes);
        expect(serie.parcelas[1].situacao).toBe('a_vencer');
    });

    it('baixada sem conferência no extrato é BAIXADA FORA DO EXTRATO e conta como paga', () => {
        const [serie] = analisarSequencias([
            conferida('2026-01', '2026-01-10'),
            parcela('2026-02'),
            parcela('2026-03', { status: 'CONCILIATED', payment_date: '2026-03-09' }),
        ], opcoes);
        expect(serie.parcelas[2].situacao).toBe('baixada_fora');
        expect(serie.parcelas[1].situacao).toBe('furo'); // a 3 está paga
    });

    it('paga mais de 5 dias depois do vencimento é CONFERIDA COM ATRASO, marcando mês posterior', () => {
        const [serie] = analisarSequencias([
            conferida('2026-01', '2026-01-14'), // +4: em dia
            conferida('2026-02', '2026-03-05'), // +23, mês seguinte
        ], opcoes);
        expect(serie.parcelas[0].situacao).toBe('conferida');
        const p2 = serie.parcelas[1];
        expect(p2.situacao).toBe('conferida_atrasada');
        expect(p2.diasAtraso).toBe(23);
        expect(p2.mesPosterior).toBe(true);
        expect(p2.dataBanco).toBe('2026-03-05');
        expect(serie.ocorrencias.atrasadas).toBe(1);
    });

    it('duas parcelas na MESMA linha do extrato são PAGAS JUNTAS', () => {
        const [serie] = analisarSequencias([
            conferida('2026-01', '2026-01-10'),
            conferida('2026-02', '2026-03-08', 'b-junto'),
            conferida('2026-03', '2026-03-08', 'b-junto'),
        ], opcoes);
        expect(serie.parcelas[1].juntoCom).toEqual([3]);
        expect(serie.parcelas[2].juntoCom).toEqual([2]);
        expect(serie.ocorrencias.juntas).toBe(2);
    });

    it('duas parcelas conferidas no MESMO mês do banco (linhas diferentes) também são PAGAS JUNTAS', () => {
        const [serie] = analisarSequencias([
            conferida('2026-04', '2026-05-06', 'b-a'),
            conferida('2026-05', '2026-05-12', 'b-b'),
        ], opcoes);
        expect(serie.parcelas[0].juntoCom).toEqual([2]);
        expect(serie.ocorrencias.juntas).toBe(2);
    });

    it('IRRF retido e cancelada não entram na série', () => {
        const [serie] = analisarSequencias([
            conferida('2026-01', '2026-01-10'),
            parcela('2026-01', { id: 'irrf', business_status: 'RETIDO', due_date: '2026-01-25' }),
            parcela('2026-02', { id: 'canc', status: 'CANCELLED' }),
            conferida('2026-03', '2026-03-10'),
        ], opcoes);
        expect(serie.parcelas).toHaveLength(2);
        expect(serie.ocorrencias.furos).toBe(0);
    });

    it('separa as séries por contrato', () => {
        const series = analisarSequencias([
            conferida('2026-01', '2026-01-10'),
            conferida('2026-01', '2026-01-10', 'b-x', { contract_id: 'c2', id: 'x1' }),
        ], opcoes);
        expect(series.map(s => s.contractId).sort()).toEqual(['c1', 'c2']);
    });

    it('série é "da conta" quando já foi conferida nela ou o contrato aponta a conta', () => {
        const [outraConta] = analisarSequencias([
            conferida('2026-01', '2026-01-10', 'b1', { vinculos: [{ bank_transaction_id: 'b1', data: '2026-01-10', bank_account_id: 'outra' }] }),
            parcela('2026-02'),
        ], opcoes);
        expect(outraConta.daConta).toBe(false);

        const [doContrato] = analisarSequencias([
            parcela('2026-02', { contrato: { number: 'C', title: 'T', domain: 'SUPRIMENTOS', payment_account_id: CONTA } }),
        ], opcoes);
        expect(doContrato.daConta).toBe(true);

        const [conferidaAqui] = analisarSequencias([conferida('2026-01', '2026-01-10')], opcoes);
        expect(conferidaAqui.daConta).toBe(true);
    });

    it('série nova (nada pago ainda) recebe sugestão "Conciliar juntas" pelo nome no extrato', () => {
        const series = analisarSequencias([parcela('2026-02'), parcela('2026-03')], opcoes);
        expect(series[0].daConta).toBe(false);
        expect(acharPagamentosJuntos(series, [{
            id: 'b', transaction_date: '2026-03-12', amount: 2000, direction: 'CREDIT',
            description_normalized: 'PIX FULANO DE TAL', counterparty_name: null,
        }])).toHaveLength(1);
    });
});

describe('acharPagamentosJuntos — "Conciliar juntas"', () => {
    const extrato = (over: Partial<ExtratoPendente> = {}): ExtratoPendente => ({
        id: 'bx',
        transaction_date: '2026-04-08',
        amount: 2000,
        direction: 'CREDIT',
        description_normalized: 'PIX RECEBIDO FULANO DE TAL',
        counterparty_name: null,
        ...over,
    });

    it('crédito = soma de 2 parcelas abertas e SEGUIDAS casa com as duas', () => {
        const series = analisarSequencias([
            conferida('2026-01', '2026-01-10'),
            parcela('2026-02'),
            parcela('2026-03'),
        ], opcoes);
        const [c] = acharPagamentosJuntos(series, [extrato()]);
        expect(c.contractId).toBe('c1');
        expect(c.bank.id).toBe('bx');
        expect(c.parcelas.map(p => p.numero)).toEqual([2, 3]);
        expect(c.total).toBe(2000);
    });

    it('prefere as parcelas MAIS ANTIGAS quando há mais de uma dupla possível', () => {
        const series = analisarSequencias([
            conferida('2026-01', '2026-01-10'),
            parcela('2026-02'),
            parcela('2026-03'),
            parcela('2026-04'),
        ], opcoes);
        const [c] = acharPagamentosJuntos(series, [extrato({ transaction_date: '2026-05-08' })]);
        expect(c.parcelas.map(p => p.numero)).toEqual([2, 3]);
    });

    it('não junta parcelas que não são seguidas', () => {
        const series = analisarSequencias([
            parcela('2026-02', { amount: 1500 }),
            conferida('2026-03', '2026-03-10'),
            parcela('2026-04', { amount: 500 }),
        ], opcoes);
        expect(acharPagamentosJuntos(series, [extrato({ transaction_date: '2026-05-08' })])).toEqual([]);
    });

    it('valor fora da tolerância (1% ou R$ 1) não casa', () => {
        const series = analisarSequencias([conferida('2026-01', '2026-01-10'), parcela('2026-02'), parcela('2026-03')], opcoes);
        expect(acharPagamentosJuntos(series, [extrato({ amount: 2050 })])).toEqual([]);
        expect(acharPagamentosJuntos(series, [extrato({ amount: 2015 })])).toHaveLength(1);
    });

    it('usa o valor já líquido do retido (amount vem de valor_esperado)', () => {
        const series = analisarSequencias([
            conferida('2026-01', '2026-01-10'),
            parcela('2026-02', { amount: 4167.03 }),
            parcela('2026-03', { amount: 4167.03 }),
        ], opcoes);
        expect(acharPagamentosJuntos(series, [extrato({ amount: 8334.06 })])).toHaveLength(1);
    });

    it('não casa crédito de direção diferente nem muito antes da 1ª parcela', () => {
        const series = analisarSequencias([conferida('2026-01', '2026-01-10'), parcela('2026-02'), parcela('2026-03')], opcoes);
        expect(acharPagamentosJuntos(series, [extrato({ direction: 'DEBIT' })])).toEqual([]);
        expect(acharPagamentosJuntos(series, [extrato({ transaction_date: '2026-01-20' })])).toEqual([]);
    });

    it('dois contratos com o mesmo valor e sem o nome no extrato: ambíguo, não sugere', () => {
        const series = analisarSequencias([
            conferida('2026-01', '2026-01-10'), parcela('2026-02'), parcela('2026-03'),
            conferida('2026-01', '2026-01-10', 'b-y', { contract_id: 'c2', id: 'y1', party_name: 'Beltrano Pereira' }),
            parcela('2026-02', { contract_id: 'c2', party_name: 'Beltrano Pereira' }),
            parcela('2026-03', { contract_id: 'c2', party_name: 'Beltrano Pereira' }),
        ], opcoes);
        expect(acharPagamentosJuntos(series, [extrato({ description_normalized: 'TED RECEBIDA' })])).toEqual([]);
        // Com o nome no extrato, desempata.
        const [c] = acharPagamentosJuntos(series, [extrato({ description_normalized: 'PIX BELTRANO PEREIRA' })]);
        expect(c.contractId).toBe('c2');
    });

    it('cada parcela entra em uma sugestão só', () => {
        const series = analisarSequencias([conferida('2026-01', '2026-01-10'), parcela('2026-02'), parcela('2026-03')], opcoes);
        const cs = acharPagamentosJuntos(series, [extrato({ id: 'b1' }), extrato({ id: 'b2', transaction_date: '2026-04-09' })]);
        expect(cs).toHaveLength(1);
    });
});

describe('acharCreditosParecidos — parcela "aberta" que talvez foi paga com outro valor', () => {
    const ext = (over: Partial<ExtratoPendente> = {}): ExtratoPendente => ({
        id: 'b1', transaction_date: '2026-03-05', amount: 1041, direction: 'CREDIT',
        description_normalized: 'TED 237 3396FULANO SOUZA', counterparty_name: null, ...over,
    });
    const serieComVencidas = () => analisarSequencias([
        conferida('2026-01', '2026-01-10'), parcela('2026-02'), parcela('2026-03'),
    ], opcoes);

    it('crédito pendente do mesmo cliente, até 15% diferente e perto do vencimento, aponta a parcela', () => {
        const r = acharCreditosParecidos(serieComVencidas(), [ext({ id: 'fev', transaction_date: '2026-02-06' }), ext({ id: 'mar', transaction_date: '2026-03-05' })], []);
        expect(r.get('p-c1-2026-02')?.id).toBe('fev');
        expect(r.get('p-c1-2026-03')?.id).toBe('mar');
    });

    it('sem o nome no extrato, ou com valor muito diferente, não aponta', () => {
        expect(acharCreditosParecidos(serieComVencidas(), [ext({ description_normalized: 'TED RECEBIDA' })], []).size).toBe(0);
        expect(acharCreditosParecidos(serieComVencidas(), [ext({ amount: 1300 })], []).size).toBe(0);
    });

    it('não reaproveita o movimento já sugerido em "Conciliar juntas" nem aponta parcela conferida', () => {
        const series = serieComVencidas();
        expect(acharCreditosParecidos(series, [ext()], ['b1']).size).toBe(0);
        const r = acharCreditosParecidos(series, [ext({ transaction_date: '2026-01-12' })], []);
        expect(r.has('p-c1-2026-01')).toBe(false);
    });

    it('cada movimento aponta uma parcela só (a de vencimento mais próximo)', () => {
        const r = acharCreditosParecidos(serieComVencidas(), [ext({ transaction_date: '2026-03-08' })], []);
        expect([...r.keys()]).toEqual(['p-c1-2026-03']);
    });
});

describe('posicoesNasSeries — coluna "Sequência sugerida" da Central', () => {
    it('numera cada parcela na série do contrato (1..N, pelo vencimento) com o total', () => {
        const pos = posicoesNasSeries([
            parcela('2026-03'), conferida('2026-01', '2026-01-10'), parcela('2026-02'),
        ]);
        expect(pos.get('p-c1-2026-01')).toMatchObject({ numero: 1, total: 3, numeroContrato: 'CTL-001' });
        expect(pos.get('p-c1-2026-03')).toMatchObject({ numero: 3, total: 3 });
    });

    it('aponta as parcelas ANTERIORES ainda em aberto (a sugestão pula uma mais antiga)', () => {
        const pos = posicoesNasSeries([
            conferida('2026-01', '2026-01-10'), parcela('2026-02'), parcela('2026-03'), parcela('2026-04'),
        ]);
        expect(pos.get('p-c1-2026-02')?.abertasAntes).toEqual([]);
        expect(pos.get('p-c1-2026-04')?.abertasAntes).toEqual([2, 3]);
    });

    it('baixada fora do extrato conta como paga; retido e cancelada não entram na conta', () => {
        const pos = posicoesNasSeries([
            parcela('2026-01', { status: 'CONCILIATED' }),
            parcela('2026-01', { id: 'irrf', business_status: 'RETIDO', due_date: '2026-01-25' }),
            parcela('2026-02', { id: 'canc', status: 'CANCELLED' }),
            parcela('2026-03'),
        ]);
        expect(pos.has('irrf')).toBe(false);
        expect(pos.has('canc')).toBe(false);
        expect(pos.get('p-c1-2026-03')).toMatchObject({ numero: 2, total: 2, abertasAntes: [] });
    });
});

describe('trocaPelaMaisAntiga — "usar a NN" na Central', () => {
    it('aponta a parcela aberta MAIS ANTIGA quando o valor esperado é o mesmo', () => {
        const pos = posicoesNasSeries([
            conferida('2026-01', '2026-01-10'), parcela('2026-02'), parcela('2026-03'), parcela('2026-04'),
        ]);
        expect(trocaPelaMaisAntiga(pos.get('p-c1-2026-04'))).toMatchObject({ id: 'p-c1-2026-02', numero: 2, due_date: '2026-02-10' });
        // A própria mais antiga não troca com ninguém.
        expect(trocaPelaMaisAntiga(pos.get('p-c1-2026-02'))).toBeNull();
    });

    it('valor diferente (reajuste) não troca', () => {
        const pos = posicoesNasSeries([parcela('2026-02', { amount: 1000 }), parcela('2026-03', { amount: 1041 })]);
        expect(pos.get('p-c1-2026-03')?.maisAntigaAberta?.numero).toBe(1);
        expect(trocaPelaMaisAntiga(pos.get('p-c1-2026-03'))).toBeNull();
    });

    it('sem parcela anterior em aberto não há troca', () => {
        const pos = posicoesNasSeries([conferida('2026-01', '2026-01-10'), parcela('2026-02')]);
        expect(trocaPelaMaisAntiga(pos.get('p-c1-2026-02'))).toBeNull();
    });
});
