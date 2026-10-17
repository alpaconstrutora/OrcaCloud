/**
 * Costura Financeiro → Processos — seção C de
 * docs/planos/2026-10-16-torre-fluxo-financeiro.md: quatro eventos novos, que
 * valem para título de QUALQUER origem (o `internal_transaction.paid` do P2P
 * continua só de pedido — `processosEventosP2P.test.ts`).
 *
 * O que este arquivo trava:
 *   1. `triggerForFinancialTitle` usa a organização DO TÍTULO, liga a
 *      instância ao título e recusa direção errada (payable.* = DEBIT,
 *      receivable.* = CREDIT); `triggerSettlement` escolhe pela direção;
 *   2. baixa manual: `payableService` (PAGO/darBaixa) → `payable.settled` — e,
 *      em título de pedido, TAMBÉM o `internal_transaction.paid` do P2P;
 *      `receivableService` (RECEBIDO/darBaixa) → `receivable.settled`;
 *   3. alçada: `financialApprovalService.approve` só dispara quando a alçada
 *      FECHA; `submitForApproval` dispara quando o título nasce liberado
 *      (abaixo do piso) e não quando entra na fila;
 *   4. conciliação no app (`createMatch`/`reconcileGroup`) → settled pela direção;
 *   5. boleto: aprovar → `boleto.approved` (com boleto e título); marcar pago →
 *      `payable.settled`;
 *   6. idempotência: segunda instância do mesmo modelo para o mesmo título não
 *      nasce; `startInstance` sem título NÃO manda as colunas novas (o INSERT
 *      dos processos do P2P não pode depender da migration);
 *   7. motor lançando não derruba nenhuma gravação de origem.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Banco falso em memória: filtra por `eq`, grava insert/update ────────────
type Linha = Record<string, unknown>;
const db: Record<string, Linha[]> = {};
const inserts: { tabela: string; linha: Linha }[] = [];
const rpcs: { fn: string; args: unknown }[] = [];
let faixaDaAlcada: unknown[] = [];

function query(tabela: string) {
    const filtros: [string, unknown][] = [];
    let modo: 'select' | 'insert' | 'update' = 'select';
    let payload: Linha | Linha[] = {};
    let resolvido: Linha[] | null = null;
    const resolver = (): Linha[] => {
        if (resolvido) return resolvido;
        if (modo === 'insert') {
            const linhas = (Array.isArray(payload) ? payload : [payload]).map((l, i) => ({ id: `novo-${tabela}-${inserts.length + i}`, ...l }));
            for (const l of linhas) { (db[tabela] ??= []).push(l); inserts.push({ tabela, linha: l }); }
            return (resolvido = linhas);
        }
        const linhas = (db[tabela] ?? []).filter(l => filtros.every(([c, v]) => l[c] === v));
        if (modo === 'update') for (const l of linhas) Object.assign(l, payload);
        return (resolvido = linhas);
    };
    const q: Record<string, unknown> = {};
    const chain = () => q;
    Object.assign(q, {
        select: chain, order: chain, limit: chain, in: chain, not: chain, neq: chain, gte: chain, lte: chain, is: chain,
        eq: (c: string, v: unknown) => { filtros.push([c, v]); return q; },
        insert: (l: Linha | Linha[]) => { modo = 'insert'; payload = l; return q; },
        update: (l: Linha) => { modo = 'update'; payload = l; return q; },
        maybeSingle: async () => ({ data: resolver()[0] ?? null, error: null }),
        single: async () => {
            const r = resolver()[0];
            return r ? { data: r, error: null } : { data: null, error: { message: 'não achou', code: 'PGRST116' } };
        },
        then: (res: (v: unknown) => void, rej?: (e: unknown) => void) =>
            Promise.resolve({ data: resolver(), error: null, count: resolver().length }).then(res, rej),
    });
    return q;
}

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (tabela: string) => query(tabela),
        rpc: async (fn: string, args: unknown) => {
            rpcs.push({ fn, args });
            if (fn === 'fn_resolve_approval_levels') return { data: faixaDaAlcada, error: null };
            return { data: { match_id: 'm1', payment_date: '2026-10-16', adjustment_id: null }, error: null };
        },
        storage: { from: () => ({ upload: async () => ({ data: { path: 'p' }, error: null }), remove: async () => ({}) }) },
        auth: { getUser: async () => ({ data: { user: null } }) },
    },
}));
vi.mock('../utils/boletoParser', () => ({ sha256File: async () => 'h', extractFromPdfFile: async () => ({}), buildExtractionFromLinhaDigitavel: () => ({}) }));
vi.mock('../services/boletoNomeDocumentoService', () => ({ renomearDocumentoDoBoleto: async () => {}, renomearDocumentosDosBoletos: async () => {} }));
vi.mock('../services/financialCategoryResolver', () => ({ resolverCategoriaPorId: async () => null }));
vi.mock('../services/empreendimentoService', () => ({ empreendimentoService: {} }));
vi.mock('../lib/supabasePaginate', () => ({ fetchAllPages: async () => [], fetchAllPagesParallel: async () => [] }));
vi.mock('../utils/storageUtils', () => ({ sanitizeFileName: (s: string) => s }));

import { processService } from '../services/processService';
import { payableService } from '../services/payableService';
import { receivableService } from '../services/receivableService';
import { financialApprovalService } from '../services/financialApprovalService';
import { bankReconciliationService } from '../services/bankReconciliationService';
import { boletoService } from '../services/boletoService';

const TITULO_PAGAR = { id: 't-pagar', direction: 'DEBIT', organization_id: 'org-do-titulo', project_id: 'obra1', supplier_id: 'sup1', description: 'Aluguel do galpão', purchase_order_id: null, amount: 100 };
const TITULO_RECEBER = { id: 't-receber', direction: 'CREDIT', organization_id: 'org-do-titulo', project_id: null, supplier_id: null, description: 'Parcela 3/12 — Apto 101', purchase_order_id: null, amount: 100 };

let disparos: { orgId: string; eventKey: string; ctx: Record<string, unknown> }[] = [];
let motorFalha = false;

function zerar() {
    for (const k of Object.keys(db)) delete db[k];
    inserts.length = 0;
    rpcs.length = 0;
    faixaDaAlcada = [];
    disparos = [];
    motorFalha = false;
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
}

function espiarMotor() {
    vi.spyOn(processService, 'triggerEvent').mockImplementation(async (orgId, eventKey, ctx) => {
        if (motorFalha) throw new Error('motor fora');
        disparos.push({ orgId, eventKey, ctx: ctx as Record<string, unknown> });
    });
}

describe('processService — resolvedor do título', () => {
    beforeEach(() => { zerar(); espiarMotor(); });

    it('payable.settled em título a pagar: org do título, vínculo ao título, obra e fornecedor', async () => {
        db.internal_transactions = [{ ...TITULO_PAGAR }];
        await processService.triggerForFinancialTitle('t-pagar', 'payable.settled');
        expect(disparos).toEqual([{
            orgId: 'org-do-titulo', eventKey: 'payable.settled',
            ctx: { title: 'Aluguel do galpão', internalTransactionId: 't-pagar', projectId: 'obra1', supplierId: 'sup1', amount: 100 },
        }]);
    });

    it('direção errada não dispara (payable.* em CREDIT, receivable.* em DEBIT); título sem organização também não', async () => {
        db.internal_transactions = [{ ...TITULO_PAGAR }, { ...TITULO_RECEBER }, { ...TITULO_PAGAR, id: 't-sem-org', organization_id: null }];
        await processService.triggerForFinancialTitle('t-receber', 'payable.approved');
        await processService.triggerForFinancialTitle('t-pagar', 'receivable.settled');
        await processService.triggerForFinancialTitle('t-sem-org', 'payable.settled');
        expect(disparos).toHaveLength(0);
        await processService.triggerForFinancialTitle('t-receber', 'receivable.settled');
        expect(disparos.map(d => d.eventKey)).toEqual(['receivable.settled']);
    });

    it('triggerSettlement escolhe a chave pela direção; título inexistente não lança', async () => {
        db.internal_transactions = [{ ...TITULO_PAGAR }, { ...TITULO_RECEBER }];
        await processService.triggerSettlement('t-pagar');
        await processService.triggerSettlement('t-receber');
        await expect(processService.triggerSettlement('nope')).resolves.toBeUndefined();
        expect(disparos.map(d => d.eventKey)).toEqual(['payable.settled', 'receivable.settled']);
    });
});

describe('baixa manual', () => {
    beforeEach(() => { zerar(); espiarMotor(); });

    it('payableService: PAGO e darBaixa → payable.settled; APROVADO não dispara', async () => {
        db.internal_transactions = [{ ...TITULO_PAGAR }];
        await payableService.updateStatus('t-pagar', 'APROVADO');
        expect(disparos).toHaveLength(0);
        await payableService.updateStatus('t-pagar', 'PAGO');
        await payableService.darBaixa('t-pagar', { paymentDate: '2026-10-16', paymentType: null });
        expect(disparos.map(d => d.eventKey)).toEqual(['payable.settled', 'payable.settled']);
    });

    it('título de PEDIDO baixado dispara as duas chaves: a do P2P e a do Financeiro', async () => {
        db.internal_transactions = [{ ...TITULO_PAGAR, purchase_order_id: 'po1' }];
        db.purchase_orders = [{ id: 'po1', number: 'PC-1', organization_id: 'org-do-titulo', project_id: 'obra1', supplier_id: 'sup1' }];
        await payableService.updateStatus('t-pagar', 'PAGO');
        expect(disparos.map(d => d.eventKey)).toEqual(['internal_transaction.paid', 'payable.settled']);
    });

    it('receivableService: RECEBIDO e darBaixa → receivable.settled; EMITIDO não dispara', async () => {
        db.internal_transactions = [{ ...TITULO_RECEBER }];
        await receivableService.updateStatus('t-receber', 'EMITIDO');
        expect(disparos).toHaveLength(0);
        await receivableService.updateStatus('t-receber', 'RECEBIDO');
        await receivableService.darBaixa('t-receber', { paymentDate: '2026-10-16', paymentType: null });
        expect(disparos.map(d => d.eventKey)).toEqual(['receivable.settled', 'receivable.settled']);
    });
});

describe('alçada → payable.approved', () => {
    beforeEach(() => { zerar(); espiarMotor(); });

    it('approve dispara quando a alçada fecha; nível 1 de 2 não dispara', async () => {
        db.internal_transactions = [{ ...TITULO_PAGAR, approval_status: 'PENDENTE', approval_required_levels: 2, approval_chain: [] }];
        const labels = { level1_label: 'Gestor', level2_label: 'Diretoria' };
        await financialApprovalService.approve('t-pagar', 1, 'gestor@x', labels);
        expect(disparos).toHaveLength(0);
        await financialApprovalService.approve('t-pagar', 2, 'diretor@x', labels);
        expect(disparos.map(d => d.eventKey)).toEqual(['payable.approved']);
    });

    it('submitForApproval: abaixo do piso nasce liberado e dispara; dentro da faixa entra na fila e não dispara', async () => {
        db.internal_transactions = [{ ...TITULO_PAGAR, approval_status: null }];
        faixaDaAlcada = [];
        await financialApprovalService.submitForApproval('t-pagar');
        expect(disparos.map(d => d.eventKey)).toEqual(['payable.approved']);

        db.internal_transactions = [{ ...TITULO_PAGAR, approval_status: null }];
        disparos = [];
        faixaDaAlcada = [{ required_levels: 1, level1_label: 'Gestor', level2_label: 'Diretoria' }];
        await financialApprovalService.submitForApproval('t-pagar');
        expect(db.internal_transactions[0].approval_status).toBe('PENDENTE');
        expect(disparos).toHaveLength(0);
    });
});

describe('conciliação no app → settled pela direção', () => {
    beforeEach(() => { zerar(); espiarMotor(); });

    it('createMatch e reconcileGroup', async () => {
        db.internal_transactions = [{ ...TITULO_PAGAR }, { ...TITULO_RECEBER }];
        await bankReconciliationService.createMatch('b1', 't-receber', 'MANUAL' as never, 1);
        expect(rpcs.map(r => r.fn)).toEqual(['fn_reconcile_match']);
        await bankReconciliationService.reconcileGroup(['b2'], ['t-pagar'], 'EXACT' as never);
        expect(disparos.map(d => d.eventKey)).toEqual(['receivable.settled', 'payable.settled']);
    });
});

describe('boleto', () => {
    beforeEach(() => { zerar(); espiarMotor(); });

    it('aprovar → boleto.approved com o boleto e o título que nasceu dele', async () => {
        db.boletos = [{ id: 'bol1', organization_id: 'org-do-titulo', supplier_id: 'sup1', vencimento: '2026-10-30', valor: 250, status: 'revisao', beneficiario_nome: 'Fornecedor X', descricao: 'Energia' }];
        db.suppliers = [{ id: 'sup1', name: 'Fornecedor X', nickname: null }];
        await boletoService.aprovarECriarInvoice('bol1', 'org-do-titulo', 'eu@x');
        const titulo = inserts.find(i => i.tabela === 'internal_transactions')!.linha;
        const ev = disparos.find(d => d.eventKey === 'boleto.approved')!;
        expect(ev).toMatchObject({ orgId: 'org-do-titulo', ctx: { boletoId: 'bol1', internalTransactionId: titulo.id, supplierId: 'sup1', title: 'Boleto — Energia' } });
        // abaixo do piso da alçada (sem faixa) o título também sai liberado
        expect(disparos.map(d => d.eventKey).sort()).toEqual(['boleto.approved', 'payable.approved']);
    });

    it('marcar pago → payable.settled no título do boleto', async () => {
        db.boletos = [{ id: 'bol1', organization_id: 'org-do-titulo', status: 'aprovado', invoice_id: null }];
        db.internal_transactions = [{ ...TITULO_PAGAR, id: 't-bol', source_system: 'BOLETO', reference_id: 'bol1' }];
        await boletoService.marcarPago('bol1', 'org-do-titulo', 'eu@x');
        expect(disparos.map(d => d.eventKey)).toEqual(['payable.settled']);
        expect(disparos[0].ctx.internalTransactionId).toBe('t-bol');
    });
});

describe('motor: idempotência por título e INSERT sem as colunas novas', () => {
    beforeEach(() => { zerar(); });

    it('instância viva do mesmo modelo para o mesmo título → não nasce outra', async () => {
        db.process_templates = [{ id: 'tpl1', organization_id: 'org1', trigger_type: 'EVENTO', trigger_event_key: 'payable.settled', status: 'ATIVO' }];
        db.process_instances = [{ id: 'i-viva', process_template_id: 'tpl1', internal_transaction_id: 't-pagar', status: 'EM_ANDAMENTO' }];
        const start = vi.spyOn(processService, 'startInstance').mockResolvedValue({} as never);
        await processService.triggerEvent('org1', 'payable.settled', { title: 'x', internalTransactionId: 't-pagar' });
        expect(start).not.toHaveBeenCalled();
        await processService.triggerEvent('org1', 'payable.settled', { title: 'y', internalTransactionId: 't-outro' });
        expect(start).toHaveBeenCalledTimes(1);
        expect(start.mock.calls[0][0]).toMatchObject({ internalTransactionId: 't-outro', organizationId: 'org1', templateId: 'tpl1' });
    });

    it('startInstance só manda internal_transaction_id/boleto_id quando há valor', async () => {
        db.process_templates = [{ id: 'tpl1', organization_id: 'org1', version: 1, criticality: 'MEDIA' }];
        db.process_template_steps = [{ id: 'ts1', process_template_id: 'tpl1', name: 'Etapa', order_index: 0, step_type: 'TAREFA' }];
        await processService.startInstance({ organizationId: 'org1', templateId: 'tpl1', title: 'P2P', purchaseOrderId: 'po1' }).catch(() => {});
        await processService.startInstance({ organizationId: 'org1', templateId: 'tpl1', title: 'Fin', internalTransactionId: 't1', boletoId: 'b1' }).catch(() => {});
        const instancias = inserts.filter(i => i.tabela === 'process_instances').map(i => i.linha);
        expect(instancias).toHaveLength(2);
        expect('internal_transaction_id' in instancias[0]).toBe(false);
        expect('boleto_id' in instancias[0]).toBe(false);
        expect(instancias[1]).toMatchObject({ internal_transaction_id: 't1', boleto_id: 'b1' });
    });
});

describe('baixa manual × alçada (17/10/2026, item H.1)', () => {
    beforeEach(() => { zerar(); espiarMotor(); });

    it('título PENDENTE na alçada: darBaixa, updateStatus(PAGO) e boleto marcado pago são recusados com o motivo e nada é gravado', async () => {
        db.internal_transactions = [{ ...TITULO_PAGAR, approval_status: 'PENDENTE', source_system: 'BOLETO', reference_id: 'bol1' }];
        db.boletos = [{ id: 'bol1', organization_id: 'org-do-titulo', status: 'aprovado', invoice_id: null }];
        await expect(payableService.darBaixa('t-pagar', { paymentDate: '2026-10-17', paymentType: null })).rejects.toThrow(/aguardando aprovação na alçada/i);
        await expect(payableService.updateStatus('t-pagar', 'PAGO')).rejects.toThrow(/aguardando aprovação na alçada/i);
        await expect(boletoService.marcarPago('bol1', 'org-do-titulo')).rejects.toThrow(/aguardando aprovação na alçada/i);
        expect(db.internal_transactions[0].status).toBeUndefined();
        expect(db.boletos[0].status).toBe('aprovado');
        expect(disparos).toHaveLength(0);
    });

    it('título sem alçada pendente (aprovado, rascunho ou nunca enviado) baixa normalmente', async () => {
        db.internal_transactions = [{ ...TITULO_PAGAR, approval_status: 'RASCUNHO' }];
        await expect(payableService.darBaixa('t-pagar', { paymentDate: '2026-10-17', paymentType: null })).resolves.toBeUndefined();
        expect(db.internal_transactions[0].status).toBe('CONCILIATED');
    });

    it('conciliação NÃO é barrada pela alçada (o dinheiro já saiu do banco)', async () => {
        db.internal_transactions = [{ ...TITULO_PAGAR, approval_status: 'PENDENTE' }];
        await expect(bankReconciliationService.createMatch('b1', 't-pagar', 'MANUAL' as never, 1)).resolves.toMatchObject({ match_id: 'm1' });
    });
});

describe('motor fora não derruba a origem', () => {
    beforeEach(() => { zerar(); espiarMotor(); motorFalha = true; });

    it('baixas, alçada e conciliação resolvem com o motor lançando', async () => {
        db.internal_transactions = [
            { ...TITULO_PAGAR, approval_status: 'PENDENTE', approval_required_levels: 1, approval_chain: [] },
            { ...TITULO_PAGAR, id: 't-pagar-livre', approval_status: 'APROVADO' },
            { ...TITULO_RECEBER },
        ];
        await expect(payableService.updateStatus('t-pagar-livre', 'PAGO')).resolves.toBeUndefined();
        await expect(receivableService.darBaixa('t-receber', { paymentDate: '2026-10-16', paymentType: null })).resolves.toBeUndefined();
        await expect(financialApprovalService.approve('t-pagar', 1, 'g', { level1_label: 'G' })).resolves.toBeUndefined();
        await expect(bankReconciliationService.createMatch('b1', 't-receber', 'MANUAL' as never, 1)).resolves.toMatchObject({ match_id: 'm1' });
    });
});
