/**
 * Motor de Processos fora do navegador (services/processMotor.ts) — seção G de
 * docs/planos/2026-10-16-torre-fluxo-financeiro.md.
 *
 * O que este arquivo trava:
 *   1. o motor funciona SOZINHO, com o cliente de quem chama e `this` sendo ele
 *      mesmo (é assim que as Edge Functions o usam): baixa a pagar abre a
 *      instância ligada ao título, com etapas e log; baixa de título de pedido
 *      também abre a do P2P;
 *   2. o `processService` usa o MESMO motor (não uma cópia): os gatilhos dele
 *      são os do motor;
 *   3. a Edge Function da conciliação por CRON chama o motor — tirar a chamada
 *      reprova aqui. (O webhook do Asaas fica para depois da Fase 1 da frente
 *      do Asaas, que reescreveu o caminho de gravação — plano, item G.5.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}) } }));

import { criarMotor } from '../services/processMotor';
import { processService } from '../services/processService';

type Linha = Record<string, unknown>;
let db: Record<string, Linha[]>;
let inserts: { tabela: string; linha: Linha }[];

function cliente() {
    const query = (tabela: string) => {
        const filtros: [string, unknown][] = [];
        let modo: 'select' | 'insert' | 'update' = 'select';
        let payload: Linha | Linha[] = {};
        const resolver = (): Linha[] => {
            if (modo === 'insert') {
                const linhas = (Array.isArray(payload) ? payload : [payload]).map((l, i) => ({ id: `novo-${tabela}-${inserts.length + i}`, ...l }));
                for (const l of linhas) { (db[tabela] ??= []).push(l); inserts.push({ tabela, linha: l }); }
                return linhas;
            }
            const linhas = (db[tabela] ?? []).filter(l => filtros.every(([c, v]) => l[c] === v));
            if (modo === 'update') for (const l of linhas) Object.assign(l, payload);
            return linhas;
        };
        const q: Record<string, unknown> = {};
        const chain = () => q;
        Object.assign(q, {
            select: chain, order: chain, limit: chain, in: chain, not: chain,
            eq: (c: string, v: unknown) => { filtros.push([c, v]); return q; },
            insert: (l: Linha | Linha[]) => { modo = 'insert'; payload = l; return q; },
            update: (l: Linha) => { modo = 'update'; payload = l; return q; },
            maybeSingle: async () => ({ data: resolver()[0] ?? null, error: null }),
            single: async () => { const r = resolver()[0]; return r ? { data: r, error: null } : { data: null, error: { message: 'não achou' } }; },
            then: (res: (v: unknown) => void) => Promise.resolve({ data: resolver(), error: null }).then(res),
        });
        return q;
    };
    return { from: query };
}

beforeEach(() => {
    inserts = [];
    db = {
        process_templates: [
            { id: 'tpl-fin', organization_id: 'org1', trigger_type: 'EVENTO', trigger_event_key: 'payable.settled', status: 'ATIVO', version: 1, criticality: 'BAIXA' },
            { id: 'tpl-p2p', organization_id: 'org1', trigger_type: 'EVENTO', trigger_event_key: 'internal_transaction.paid', status: 'ATIVO', version: 1, criticality: 'BAIXA' },
        ],
        process_template_steps: [
            { id: 'ts1', process_template_id: 'tpl-fin', name: 'Conferir comprovante', step_type: 'document', order_index: 0, sla_hours: 48 },
            { id: 'ts2', process_template_id: 'tpl-p2p', name: 'Arquivar comprovante', step_type: 'document', order_index: 0, sla_hours: 24 },
        ],
        process_instances: [],
        process_instance_steps: [],
        process_audit_logs: [],
        purchase_orders: [{ id: 'po1', number: 'PC-1', organization_id: 'org1', project_id: null, supplier_id: 'sup1' }],
        internal_transactions: [
            { id: 't-avulso', direction: 'DEBIT', organization_id: 'org1', project_id: null, supplier_id: null, description: 'Energia', purchase_order_id: null },
            { id: 't-pedido', direction: 'DEBIT', organization_id: 'org1', project_id: null, supplier_id: 'sup1', description: 'Pedido PC-1', purchase_order_id: 'po1' },
        ],
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('processMotor — sozinho, como nas Edge Functions', () => {
    it('baixa a pagar abre a instância ligada ao título, com etapa em andamento e log', async () => {
        const motor = criarMotor(cliente());
        await motor.triggerSettlement('t-avulso');
        const inst = inserts.filter(i => i.tabela === 'process_instances').map(i => i.linha);
        expect(inst).toHaveLength(1);
        expect(inst[0]).toMatchObject({ organization_id: 'org1', process_template_id: 'tpl-fin', internal_transaction_id: 't-avulso', title: 'Energia' });
        expect(inserts.filter(i => i.tabela === 'process_instance_steps')).toHaveLength(1);
        expect(db.process_instance_steps[0]).toMatchObject({ status: 'EM_ANDAMENTO', name: 'Conferir comprovante' });
        expect(db.process_audit_logs.map(l => l.action)).toEqual(['INSTANCE_STARTED', 'STEP_ADVANCED']);
    });

    it('reexecutar a mesma baixa não abre segunda instância (idempotência por título)', async () => {
        const motor = criarMotor(cliente());
        await motor.triggerSettlement('t-avulso');
        db.process_instances[0].status = 'EM_ANDAMENTO';
        await motor.triggerSettlement('t-avulso');
        expect(inserts.filter(i => i.tabela === 'process_instances')).toHaveLength(1);
    });

    it('título de pedido: abre a do P2P (pelo pedido) e a do Financeiro (pelo título)', async () => {
        const motor = criarMotor(cliente());
        await motor.triggerForTransaction('t-pedido', 'internal_transaction.paid');
        await motor.triggerSettlement('t-pedido');
        const inst = inserts.filter(i => i.tabela === 'process_instances').map(i => i.linha);
        expect(inst.map(i => i.process_template_id).sort()).toEqual(['tpl-fin', 'tpl-p2p']);
        expect(inst.find(i => i.process_template_id === 'tpl-p2p')).toMatchObject({ purchase_order_id: 'po1', title: 'Pedido PC-1 — Pago' });
    });
});

describe('processService usa o mesmo motor', () => {
    it('os gatilhos do serviço são os do motor (mesmo código, não cópia)', () => {
        const motor = criarMotor(cliente());
        for (const nome of ['triggerEvent', 'triggerPurchaseOrderEvent', 'triggerForTransaction', 'triggerForFinancialTitle', 'triggerSettlement', 'triggerBoletoApproved'] as const) {
            expect(typeof processService[nome]).toBe('function');
            expect(processService[nome].toString()).toBe(motor[nome].toString());
        }
    });
});

describe('a Edge Function da conciliação chama o motor', () => {
    const ler = (f: string) => readFileSync(`supabase/functions/${f}/index.ts`, 'utf-8');

    it('reconciliation-engine (CRON): importa o motor e dispara a baixa depois de cada vínculo', () => {
        const src = ler('reconciliation-engine');
        expect(src).toContain('from "../../../services/processMotor.ts"');
        expect(src).toMatch(/fn_reconcile_match[\s\S]*motor\.triggerSettlement\(m\.internalId\)/);
        expect(src).toContain("motor.triggerForTransaction(m.internalId, 'internal_transaction.paid')");
    });
});
