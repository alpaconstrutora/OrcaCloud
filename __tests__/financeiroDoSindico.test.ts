import { describe, it, expect } from 'vitest';
import {
    MOTIVO_PREVIA, MOTIVO_SEM_LOGIN, motivoNaoAltera, motivoNaoBaixa, motivoNaoOpera, resumoDoMes, situacaoDoTitulo,
    type TituloDoCondominio,
} from '../utils/financeiroDoSindico';

const HOJE = '2026-10-24';

function titulo(p: Partial<TituloDoCondominio> = {}): TituloDoCondominio {
    return {
        id: 't1', condominioId: 'c1', direcao: 'DEBIT', origem: 'MANUAL', descricao: 'Limpeza', credor: 'Fulano',
        supplierId: null, vencimento: '2026-10-10', competencia: '2026-10-01', valor: 100, status: 'PENDING',
        businessStatus: 'PREVISTO', approvalStatus: 'APROVADO', pagoEm: null, formaPagamento: null, contaId: null,
        centroId: 'cc', categoriaId: 'cat', categoria: 'Limpeza', planoId: null, lancadoPeloSindico: false, travaAsaas: null,
        ...p,
    };
}

describe('situacaoDoTitulo', () => {
    it('pago pela MESMA regra de Contas a Pagar (CONCILIATED ou PAGO/RECEBIDO)', () => {
        expect(situacaoDoTitulo(titulo({ status: 'CONCILIATED', businessStatus: 'PREVISTO' }), HOJE)).toBe('PAGO');
        expect(situacaoDoTitulo(titulo({ businessStatus: 'PAGO' }), HOJE)).toBe('PAGO');
        expect(situacaoDoTitulo(titulo({ businessStatus: 'RECEBIDO', direcao: 'CREDIT' }), HOJE)).toBe('PAGO');
    });
    it('cancelado ganha de tudo', () => {
        expect(situacaoDoTitulo(titulo({ status: 'CANCELLED' }), HOJE)).toBe('CANCELADO');
        expect(situacaoDoTitulo(titulo({ businessStatus: 'CANCELADO', status: 'CONCILIATED' }), HOJE)).toBe('CANCELADO');
    });
    it('vencido = em aberto com vencimento ANTES de hoje (hoje ainda não venceu)', () => {
        expect(situacaoDoTitulo(titulo({ vencimento: '2026-10-23' }), HOJE)).toBe('VENCIDO');
        expect(situacaoDoTitulo(titulo({ vencimento: HOJE }), HOJE)).toBe('EM_ABERTO');
    });
});

describe('resumoDoMes', () => {
    it('separa pago, a pagar, atraso, recebido e inadimplência; cancelado não conta', () => {
        const r = resumoDoMes([
            titulo({ id: 'pago', businessStatus: 'PAGO', status: 'CONCILIATED', pagoEm: '2026-10-05', valor: 50 }),
            titulo({ id: 'aberto', vencimento: '2026-10-30', valor: 200 }),
            titulo({ id: 'atraso-mes', vencimento: '2026-10-02', valor: 30 }),
            titulo({ id: 'atraso-antes', vencimento: '2026-08-10', valor: 70 }),
            titulo({ id: 'cancelado', status: 'CANCELLED', valor: 999 }),
            titulo({ id: 'cota-paga', direcao: 'CREDIT', status: 'CONCILIATED', pagoEm: '2026-10-11', valor: 400 }),
            titulo({ id: 'cota-aberta', direcao: 'CREDIT', vencimento: '2026-10-28', valor: 300 }),
            titulo({ id: 'cota-atrasada', direcao: 'CREDIT', vencimento: '2026-09-10', valor: 120 }),
        ], '2026-10', HOJE);
        expect(r.pagoNoMes).toBe(50);
        // a pagar NO MÊS: o aberto + o atrasado do próprio mês (o de agosto é de outro mês)
        expect(r.aPagarNoMes).toBe(230);
        expect(r.vencidoAPagar).toBe(100);
        expect(r.recebidoNoMes).toBe(400);
        expect(r.aReceberNoMes).toBe(300);
        expect(r.inadimplencia).toBe(120);
        expect(r.saldoDoMes).toBe(350);
    });
    it('pago no mês é pelo DIA DO PAGAMENTO; sem ele, pelo vencimento', () => {
        const r = resumoDoMes([
            titulo({ id: 'pago-out-venc-set', businessStatus: 'PAGO', vencimento: '2026-09-28', pagoEm: '2026-10-02', valor: 10 }),
            titulo({ id: 'pago-set-venc-out', businessStatus: 'PAGO', vencimento: '2026-10-01', pagoEm: '2026-09-30', valor: 20 }),
            titulo({ id: 'pago-sem-data', status: 'CONCILIATED', vencimento: '2026-10-15', pagoEm: null, valor: 40 }),
        ], '2026-10', HOJE);
        expect(r.pagoNoMes).toBe(50);
    });
});

describe('o que o síndico pode fazer (espelho das RPCs)', () => {
    it('contexto: prévia, link sem login e condomínio sem organização própria', () => {
        expect(motivoNaoOpera({ somenteLeitura: true, logado: true, motivoDoCondominio: null })).toBe(MOTIVO_PREVIA);
        expect(motivoNaoOpera({ somenteLeitura: false, logado: false, motivoDoCondominio: null })).toBe(MOTIVO_SEM_LOGIN);
        expect(motivoNaoOpera({ somenteLeitura: false, logado: true, motivoDoCondominio: 'sem org' })).toBe('sem org');
        expect(motivoNaoOpera({ somenteLeitura: false, logado: true, motivoDoCondominio: null })).toBeNull();
    });
    it('editar/cancelar: só MANUAL a pagar, em aberto, sem Asaas', () => {
        expect(motivoNaoAltera(titulo())).toBeNull();
        expect(motivoNaoAltera(titulo({ origem: 'BOLETO' }))).toMatch(/boleto/);
        expect(motivoNaoAltera(titulo({ origem: 'CONTRACT_RECURRING' }))).toMatch(/contrato/);
        expect(motivoNaoAltera(titulo({ origem: 'NFE' }))).toMatch(/outra origem/);
        expect(motivoNaoAltera(titulo({ direcao: 'CREDIT' }))).toMatch(/a pagar/);
        expect(motivoNaoAltera(titulo({ status: 'CANCELLED' }))).toMatch(/cancelado/);
        expect(motivoNaoAltera(titulo({ status: 'CONCILIATED' }))).toMatch(/pago/);
        expect(motivoNaoAltera(titulo({ travaAsaas: 'Asaas em andamento' }))).toBe('Asaas em andamento');
    });
    it('baixa: qualquer origem a pagar, menos pago, cancelado, alçada pendente e Asaas', () => {
        expect(motivoNaoBaixa(titulo({ origem: 'CONTRACT_RECURRING' }))).toBeNull();
        expect(motivoNaoBaixa(titulo({ origem: 'BOLETO' }))).toBeNull();
        expect(motivoNaoBaixa(titulo({ approvalStatus: 'PENDENTE' }))).toMatch(/alçada/);
        expect(motivoNaoBaixa(titulo({ businessStatus: 'PAGO' }))).toMatch(/pago/);
        expect(motivoNaoBaixa(titulo({ businessStatus: 'CANCELADO' }))).toMatch(/cancelado/);
        expect(motivoNaoBaixa(titulo({ direcao: 'CREDIT' }))).toMatch(/a pagar/);
        expect(motivoNaoBaixa(titulo({ travaAsaas: 'pago pela Asaas' }))).toBe('pago pela Asaas');
    });
});
