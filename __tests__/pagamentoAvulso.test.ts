import { describe, expect, it } from 'vitest';
import {
    caminhoDoAnexo,
    montarTitulosAvulsos,
    motivoBloqueio,
    nomeSeguroDeArquivo,
    previaParcelas,
    validarPagamentoAvulso,
    type FormPagamentoAvulso,
} from '../utils/pagamentoAvulso';

const HOJE = '2026-10-17';

function form(over: Partial<FormPagamentoAvulso> = {}): FormPagamentoAvulso {
    return {
        supplierId: null,
        credorNome: 'Cartório do 1º Ofício',
        descricao: 'Registro de escritura',
        valorTotal: 100,
        projeto: null,
        costCenterId: null,
        planoDeContasId: null,
        categoryId: null,
        categoryName: null,
        formaPagamento: null,
        paymentAccountId: null,
        competencia: '',
        parcelas: 1,
        periodicidade: 'Mensal',
        primeiroVencimento: '2026-10-20',
        jaPago: false,
        dataPagamento: '',
        ...over,
    };
}

describe('pagamento avulso · montarTitulosAvulsos', () => {
    it('1 parcela: um título MANUAL a débito, em aberto, tipo Parcela única', () => {
        const [t, ...resto] = montarTitulosAvulsos(form(), 'g1');
        expect(resto).toHaveLength(0);
        expect(t).toMatchObject({
            source_system: 'MANUAL',
            direction: 'DEBIT',
            reference_id: 'g1:p1',
            transaction_date: '2026-10-20',
            due_date: '2026-10-20',
            competencia_date: '2026-10-01',
            amount: 100,
            description: 'Registro de escritura',
            party_name: 'Cartório do 1º Ofício',
            entity_name: 'Cartório do 1º Ofício',
            party_type: 'SUPPLIER',
            installment_type: 'UNICA',
            status: 'PENDING',
            business_status: 'PREVISTO',
        });
    });

    it('3× mensal de R$ 100,00: sobra dos centavos na última, descrições k/N, vencimentos mês a mês', () => {
        const ts = montarTitulosAvulsos(form({ parcelas: 3 }), 'g2');
        expect(ts.map(t => t.amount)).toEqual([33.33, 33.33, 33.34]);
        expect(ts.reduce((s, t) => s + t.amount, 0)).toBeCloseTo(100, 2);
        expect(ts.map(t => t.due_date)).toEqual(['2026-10-20', '2026-11-20', '2026-12-20']);
        expect(ts.map(t => t.description)).toEqual([
            'Registro de escritura (1/3)', 'Registro de escritura (2/3)', 'Registro de escritura (3/3)',
        ]);
        expect(ts.map(t => t.reference_id)).toEqual(['g2:p1', 'g2:p2', 'g2:p3']);
        expect(new Set(ts.map(t => t.installment_type))).toEqual(new Set(['MENSAL']));
        expect(ts.map(t => t.competencia_date)).toEqual(['2026-10-01', '2026-11-01', '2026-12-01']);
    });

    it('31/jan bimestral não transborda (31/jan → 31/mar → 31/mai, e 30/abr quando cabe)', () => {
        const ts = montarTitulosAvulsos(form({ parcelas: 3, periodicidade: 'Bimestral', primeiroVencimento: '2027-01-31' }), 'g');
        expect(ts.map(t => t.due_date)).toEqual(['2027-01-31', '2027-03-31', '2027-05-31']);
        expect(ts[0].installment_type).toBe('BIMESTRAL');
        const mensal = montarTitulosAvulsos(form({ parcelas: 2, primeiroVencimento: '2027-01-31' }), 'g');
        expect(mensal.map(t => t.due_date)).toEqual(['2027-01-31', '2027-02-28']);
    });

    it('competência informada desloca todas as parcelas igual', () => {
        const ts = montarTitulosAvulsos(form({ parcelas: 2, competencia: '2026-09' }), 'g');
        expect(ts.map(t => t.competencia_date)).toEqual(['2026-09-01', '2026-10-01']);
    });

    it('obra de sistema (Gestão Comercial) vira project_id NULL — REGRA #2 na escrita', () => {
        const sistema = montarTitulosAvulsos(form({ projeto: { id: 'p-sis', name: 'Gestão Comercial' } }), 'g');
        expect(sistema[0].project_id).toBeNull();
        const marcado = montarTitulosAvulsos(form({ projeto: { id: 'p-x', name: 'Outro nome', settings: { isSystemProject: true } } }), 'g');
        expect(marcado[0].project_id).toBeNull();
        const obra = montarTitulosAvulsos(form({ projeto: { id: 'p-obra', name: 'Residencial Aurora' } }), 'g');
        expect(obra[0].project_id).toBe('p-obra');
    });

    it('grava as dimensões; categoria em texto só acompanha quando há Conta Financeira', () => {
        const [t] = montarTitulosAvulsos(form({
            supplierId: 's1', costCenterId: 'cc1', planoDeContasId: 'pc1',
            categoryId: 'cat1', categoryName: 'Despesas cartoriais',
            formaPagamento: 'PIX', paymentAccountId: 'acc1',
        }), 'g');
        expect(t).toMatchObject({
            supplier_id: 's1', cost_center_id: 'cc1', plano_de_contas_id: 'pc1',
            category_id: 'cat1', category: 'Despesas cartoriais',
            payment_type: 'PIX', payment_account_id: 'acc1',
        });
        const [sem] = montarTitulosAvulsos(form({ categoryName: 'sobrou de outra escolha' }), 'g');
        expect(sem.category).toBeNull();
    });

    // 26/10/2026 (plano 2026-10-26-todo-titulo-a-pagar-passa-pela-aprovacao, S5): todo título a
    // pagar nasce PENDENTE na alçada, e a baixa logo depois do INSERT seria recusada. O pagamento
    // já aconteceu — como na conciliação, o título nasce pago e não entra na fila.
    // (Até 26/10: "Já pago" gravava PENDING e baixava em seguida, pela alçada.)
    it('"Já pago" grava pago no INSERT, com a data do pagamento', () => {
        const [t] = montarTitulosAvulsos(form({ jaPago: true, dataPagamento: '2026-10-15', paymentAccountId: 'acc1' }), 'g');
        expect(t.status).toBe('CONCILIATED');
        expect(t.business_status).toBe('PAGO');
        expect(t.payment_date).toBe('2026-10-15');
    });

    it('sem "Já pago" o título nasce em aberto, sem data de pagamento', () => {
        const [t] = montarTitulosAvulsos(form({ jaPago: false, dataPagamento: '2026-10-15' }), 'g');
        expect(t.status).toBe('PENDING');
        expect(t.business_status).toBe('PREVISTO');
        expect(t.payment_date).toBeNull();
    });

    it('credor vazio grava NULL, não string vazia', () => {
        const [t] = montarTitulosAvulsos(form({ credorNome: '   ' }), 'g');
        expect(t.party_name).toBeNull();
        expect(t.entity_name).toBeNull();
    });
});

describe('pagamento avulso · validação', () => {
    it('formulário completo passa', () => {
        expect(validarPagamentoAvulso(form(), HOJE)).toEqual({});
        expect(motivoBloqueio(form(), HOJE)).toBeNull();
    });

    it('descrição, valor e vencimento são obrigatórios', () => {
        const e = validarPagamentoAvulso(form({ descricao: ' ', valorTotal: 0, primeiroVencimento: '' }), HOJE);
        expect(Object.keys(e).sort()).toEqual(['descricao', 'primeiroVencimento', 'valorTotal']);
        expect(motivoBloqueio(form({ descricao: '' }), HOJE)).toBe('Informe a descrição.');
    });

    it('parcelas: mínimo 1, teto, e não abaixo de 1 centavo cada', () => {
        expect(validarPagamentoAvulso(form({ parcelas: 0 }), HOJE).parcelas).toBeTruthy();
        expect(validarPagamentoAvulso(form({ parcelas: 500 }), HOJE).parcelas).toMatch(/Dívidas/);
        expect(validarPagamentoAvulso(form({ valorTotal: 0.05, parcelas: 10 }), HOJE).parcelas).toMatch(/0,01/);
    });

    it('"Já pago": uma parcela só, data não futura, conta obrigatória', () => {
        const e = validarPagamentoAvulso(form({ jaPago: true, parcelas: 2, dataPagamento: '2026-10-18' }), HOJE);
        expect(e.jaPago).toMatch(/uma parcela/);
        expect(e.dataPagamento).toMatch(/futura/);
        expect(e.paymentAccountId).toBeTruthy();
        expect(validarPagamentoAvulso(form({ jaPago: true, dataPagamento: HOJE, paymentAccountId: 'a' }), HOJE)).toEqual({});
    });

    it('competência mal formada é recusada', () => {
        expect(validarPagamentoAvulso(form({ competencia: '2026-1' }), HOJE).competencia).toBeTruthy();
    });
});

describe('pagamento avulso · prévia e anexo', () => {
    it('prévia vazia até ter valor e vencimento', () => {
        expect(previaParcelas(form({ valorTotal: 0 }))).toEqual([]);
        expect(previaParcelas(form({ primeiroVencimento: '' }))).toEqual([]);
        expect(previaParcelas(form({ parcelas: 2 }))).toEqual([
            { vencimento: '2026-10-20', valor: 50 }, { vencimento: '2026-11-20', valor: 50 },
        ]);
    });

    it('caminho do anexo começa pela org (é o que a policy do bucket confere) e sai sem acento/espaço', () => {
        expect(caminhoDoAnexo('org-1', 'g1', 'Recibo Cartório nº 12.pdf')).toBe('org-1/avulso/g1/Recibo-Cartorio-n-12.pdf');
        expect(nomeSeguroDeArquivo('../../etc')).toBe('etc');
        expect(nomeSeguroDeArquivo('###')).toBe('documento');
    });
});
