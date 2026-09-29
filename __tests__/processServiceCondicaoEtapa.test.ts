/**
 * Motor de Processos — condição por etapa e prazo por etapa.
 * Passo 4 de docs/planos/2026-09-28-torre-p2p-processos.md.
 *
 * Banco em memória (arrays por tabela) por trás do mock do supabase, porque o
 * que se testa é a SEQUÊNCIA de escritas do motor, não uma chamada isolada.
 *
 * O que este arquivo trava:
 *   1. instância de pedido de R$ 5.000 com etapa "Diretor" condicionada a
 *      amount > 30000: a etapa vira PULADO (log STEP_SKIPPED) e a instância
 *      segue para a seguinte; de R$ 50.000, a etapa entra normalmente;
 *   2. condição falsa já na 1ª etapa: a instância nasce na 2ª;
 *   3. `due_at` nasce quando a etapa COMEÇA (sla da etapa), não na criação —
 *      a etapa pendente fica sem prazo;
 *   4. a condição da etapa da instância é SNAPSHOT do template;
 *   5. template sem condição nenhuma não lê purchase_orders (contexto é lazy).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Linha = Record<string, unknown>;
const db: Record<string, Linha[]> = {};
const tabelasLidas: string[] = [];
let seq = 0;

function query(tabela: string) {
    tabelasLidas.push(tabela);
    const filtros: Array<[string, unknown]> = [];
    let pendingUpdate: Linha | null = null;
    let pendingInsert: Linha[] | null = null;
    const rows = () => (db[tabela] ?? []).filter(r => filtros.every(([c, v]) => r[c] === v));
    const q: Record<string, unknown> = {};
    const chain = () => q;
    const aplicar = () => {
        if (pendingUpdate) { for (const r of rows()) Object.assign(r, pendingUpdate); pendingUpdate = null; }
        if (pendingInsert) { db[tabela] = [...(db[tabela] ?? []), ...pendingInsert]; pendingInsert = null; }
    };
    Object.assign(q, {
        select: chain, order: chain, in: chain, not: chain, limit: chain,
        eq: (c: string, v: unknown) => { filtros.push([c, v]); return q; },
        update: (p: Linha) => { pendingUpdate = p; return q; },
        insert: (p: Linha | Linha[]) => {
            const arr = (Array.isArray(p) ? p : [p]).map(r => ({ id: `${tabela}-${++seq}`, ...r }));
            pendingInsert = arr;
            return q;
        },
        single: async () => { const ins = pendingInsert; aplicar(); const r = ins ? ins[0] : rows()[0]; return { data: r ?? null, error: r ? null : { message: 'não achou' } }; },
        maybeSingle: async () => { aplicar(); return { data: rows()[0] ?? null, error: null }; },
        then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => {
            try { aplicar(); res({ data: rows(), error: null }); } catch (e) { rej?.(e); }
        },
    });
    return q;
}

vi.mock('../lib/supabase', () => ({ supabase: { from: (t: string) => query(t) } }));
vi.mock('../services/approvalService', () => ({ approvalService: {} }));

import { processService } from '../services/processService';

const TEMPLATE = { id: 'tpl', organization_id: 'org', version: 3, criticality: 'MEDIA', department_id: null };
const etapa = (id: string, order_index: number, extra: Linha = {}) => ({
    id, process_template_id: 'tpl', name: id, step_type: 'manual', order_index,
    default_responsible_type: null, default_responsible_id: null, sla_hours: null, condition: null, ...extra,
});
const pedido = (total: number) => ({ id: 'po1', items: [{ code: 'a', description: 'x', unit: 'un', quantity: 1, unitPrice: total, total }] });

const etapasDaInstancia = () => (db.process_instance_steps ?? []).slice().sort((a, b) => (a.order_index as number) - (b.order_index as number));
const acoes = () => (db.process_audit_logs ?? []).map(l => l.action);

beforeEach(() => {
    for (const k of Object.keys(db)) delete db[k];
    tabelasLidas.length = 0;
    seq = 0;
    db.process_templates = [TEMPLATE];
    db.process_instances = [];
    db.process_instance_steps = [];
    db.process_audit_logs = [];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const iniciar = () => processService.startInstance({ organizationId: 'org', templateId: 'tpl', title: 'T', purchaseOrderId: 'po1', projectId: 'obra1' });

describe('condição por etapa', () => {
    beforeEach(() => {
        db.process_template_steps = [
            etapa('solicitante', 0, { sla_hours: 48 }),
            etapa('diretor', 1, { condition: { field: 'amount', op: 'gt', value: 30000 }, sla_hours: 24 }),
            etapa('pagamento', 2),
        ];
    });

    it('R$ 5.000: a etapa do diretor é PULADA e a instância segue para o pagamento', async () => {
        db.purchase_orders = [pedido(5000)];
        const inst = await iniciar();
        expect(etapasDaInstancia().map(s => s.status)).toEqual(['EM_ANDAMENTO', 'PENDENTE', 'PENDENTE']);

        await processService.completeStep(etapasDaInstancia()[0].id as string, inst.id, 'u1');
        expect(etapasDaInstancia().map(s => s.status)).toEqual(['CONCLUIDO', 'PULADO', 'EM_ANDAMENTO']);
        expect(acoes()).toContain('STEP_SKIPPED');
        expect(etapasDaInstancia()[1].completed_at).toBeTruthy();

        await processService.completeStep(etapasDaInstancia()[2].id as string, inst.id, 'u1');
        expect(db.process_instances[0].status).toBe('CONCLUIDO');
    });

    it('R$ 50.000: a etapa do diretor entra normalmente', async () => {
        db.purchase_orders = [pedido(50000)];
        const inst = await iniciar();
        await processService.completeStep(etapasDaInstancia()[0].id as string, inst.id, 'u1');
        expect(etapasDaInstancia().map(s => s.status)).toEqual(['CONCLUIDO', 'EM_ANDAMENTO', 'PENDENTE']);
        expect(acoes()).not.toContain('STEP_SKIPPED');
    });

    it('a condição da etapa da instância é snapshot do template', async () => {
        db.purchase_orders = [pedido(50000)];
        await iniciar();
        expect(etapasDaInstancia()[1].condition).toEqual({ field: 'amount', op: 'gt', value: 30000 });
        expect(etapasDaInstancia()[0].condition).toBeNull();
    });
});

describe('condição falsa já na primeira etapa', () => {
    it('a instância nasce na segunda etapa, com a primeira PULADA', async () => {
        db.process_template_steps = [
            etapa('so-obra-x', 0, { condition: { field: 'project_id', op: 'eq', value: 'obraX' } }),
            etapa('geral', 1),
        ];
        db.purchase_orders = [pedido(1)];
        const inst = await iniciar();
        expect(etapasDaInstancia().map(s => s.status)).toEqual(['PULADO', 'EM_ANDAMENTO']);
        expect(inst.current_step_id).toBe(etapasDaInstancia()[1].id);
    });
});

describe('prazo nasce quando a etapa começa', () => {
    it('etapa em andamento tem due_at ≈ agora + sla; pendente fica sem prazo', async () => {
        db.process_template_steps = [etapa('a', 0, { sla_hours: 48 }), etapa('b', 1, { sla_hours: 24 })];
        const antes = Date.now();
        await iniciar();
        const [a, b] = etapasDaInstancia();
        const dueA = new Date(a.due_at as string).getTime();
        expect(dueA - antes).toBeGreaterThanOrEqual(48 * 3_600_000 - 5_000);
        expect(dueA - antes).toBeLessThanOrEqual(48 * 3_600_000 + 5_000);
        expect(b.due_at ?? null).toBeNull(); // só ganha prazo quando começar — antes, a 2ª vencia antes da 1ª
    });
});

describe('contexto é lazy', () => {
    it('template sem condição não lê purchase_orders', async () => {
        db.process_template_steps = [etapa('a', 0), etapa('b', 1)];
        await iniciar();
        expect(tabelasLidas).not.toContain('purchase_orders');
    });
});
