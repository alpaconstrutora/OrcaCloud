/**
 * Processos — editar modelo, dono obrigatório e alçada por valor na aprovação.
 * docs/planos/2026-10-04-processos-modelo-dono-alcada.md
 *
 * Banco em memória por trás do mock do supabase (mesmo molde de
 * processServiceCondicaoEtapa.test.ts), e o `approvalService` REAL por cima
 * dele — o defeito que este arquivo trava mora justamente na costura entre os
 * dois (a tela mandava nível 1 fixo e valor zero).
 *
 * O que este arquivo trava:
 *   1. editar o modelo atualiza etapas por id, inclui novas, remove as que
 *      saíram, reordena e sobe a versão;
 *   2. modelo automático sem dono (ou sem evento) é recusado e nada é gravado;
 *   3. editar o modelo NÃO muda o prazo de processo em curso (SLA é cópia);
 *   4. a aprovação usa o valor DO PEDIDO e a org DO PROCESSO: R$ 10 mil numa
 *      faixa de 2 níveis fica PENDENTE com 2 níveis exigidos;
 *   5. nível 1 por uma pessoa, a MESMA pessoa é recusada no nível 2, outra
 *      pessoa conclui — e o processo avança;
 *   6. abaixo do piso da alçada a etapa é liberada, conclui e o processo avança.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Linha = Record<string, unknown>;
const db: Record<string, Linha[]> = {};
let seq = 0;
/** Faixa que o `fn_resolve_approval_levels` devolve no teste (null = valor fora de todas). */
let faixa: { required_levels: number; level1_label: string; level2_label: string } | null = null;
const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];

function query(tabela: string) {
    const filtros: Array<(r: Linha) => boolean> = [];
    let pendingUpdate: Linha | null = null;
    let pendingInsert: Linha[] | null = null;
    let pendingDelete = false;
    const rows = () => (db[tabela] ?? []).filter(r => filtros.every(f => f(r)));
    const q: Record<string, unknown> = {};
    const chain = () => q;
    const aplicar = () => {
        if (pendingUpdate) { for (const r of rows()) Object.assign(r, pendingUpdate); pendingUpdate = null; }
        if (pendingInsert) { db[tabela] = [...(db[tabela] ?? []), ...pendingInsert]; pendingInsert = null; }
        if (pendingDelete) { const fora = new Set(rows()); db[tabela] = (db[tabela] ?? []).filter(r => !fora.has(r)); pendingDelete = false; }
    };
    Object.assign(q, {
        select: chain, order: chain, not: chain, limit: chain, neq: chain,
        eq: (c: string, v: unknown) => { filtros.push(r => r[c] === v); return q; },
        in: (c: string, vs: unknown[]) => { filtros.push(r => vs.includes(r[c])); return q; },
        update: (p: Linha) => { pendingUpdate = p; return q; },
        delete: () => { pendingDelete = true; return q; },
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

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (t: string) => query(t),
        rpc: async (fn: string, args: Record<string, unknown>) => {
            rpcs.push({ fn, args });
            return { data: faixa ? [faixa] : [], error: null };
        },
    },
}));

import { processService, problemaDoModelo } from '../services/processService';

const ORG = 'org-do-processo';
const TEMPLATE = { id: 'tpl', organization_id: ORG, version: 3, criticality: 'MEDIA', department_id: null, trigger_type: 'MANUAL', owner_user_id: null };
const etapaModelo = (id: string, order_index: number, extra: Linha = {}) => ({
    id, process_template_id: 'tpl', name: id, step_type: 'manual', order_index, requires_document: false,
    default_responsible_type: null, default_responsible_id: null, sla_hours: null, condition: null,
    escalation_user_id: null, escalation_after_hours: null, ...extra,
});
const pedido = (total: number) => ({ id: 'po1', items: [{ code: 'a', description: 'x', unit: 'un', quantity: 1, unitPrice: total, total }] });
const etapasDaInstancia = () => (db.process_instance_steps ?? []).slice().sort((a, b) => (a.order_index as number) - (b.order_index as number));
const acoes = () => (db.process_audit_logs ?? []).map(l => l.action);
const instancia = () => db.process_instances[0];

beforeEach(() => {
    for (const k of Object.keys(db)) delete db[k];
    seq = 0;
    faixa = null;
    rpcs.length = 0;
    db.process_templates = [{ ...TEMPLATE }];
    db.process_instances = [];
    db.process_instance_steps = [];
    db.process_audit_logs = [];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('editar modelo', () => {
    it('atualiza por id, inclui nova, remove a que saiu, reordena e sobe a versão', async () => {
        db.process_template_steps = [etapaModelo('a', 0), etapaModelo('b', 1), etapaModelo('c', 2)];

        await processService.updateTemplate('tpl',
            { name: 'Pagamento', category: 'Financeiro', trigger_type: 'EVENTO', trigger_event_key: 'purchase_order.received', owner_user_id: 'u-dono' },
            [
                { id: 'a', name: 'Conferir NF', step_type: 'document', requires_document: true, sla_hours: 10 },
                { name: 'Nova etapa', step_type: 'manual', requires_document: false },
                { id: 'c', name: 'c', step_type: 'manual', requires_document: false },
            ]);

        const etapas = db.process_template_steps.slice().sort((x, y) => (x.order_index as number) - (y.order_index as number));
        expect(etapas.map(e => e.name)).toEqual(['Conferir NF', 'Nova etapa', 'c']);
        expect(etapas.map(e => e.order_index)).toEqual([0, 1, 2]);
        expect(etapas[0]).toMatchObject({ id: 'a', step_type: 'document', sla_hours: 10 });
        expect(etapas[1].process_template_id).toBe('tpl');
        expect(db.process_template_steps.some(e => e.id === 'b')).toBe(false);
        expect(db.process_templates[0]).toMatchObject({
            version: 4, owner_user_id: 'u-dono', trigger_type: 'EVENTO', trigger_event_key: 'purchase_order.received', name: 'Pagamento',
        });
    });

    it('modelo automático sem dono é recusado e nada é gravado', async () => {
        db.process_template_steps = [etapaModelo('a', 0)];
        await expect(processService.updateTemplate('tpl',
            { name: 'X', trigger_type: 'EVENTO', trigger_event_key: 'nfe.linked', owner_user_id: null },
            [{ id: 'a', name: 'mudou', step_type: 'manual', requires_document: false }],
        )).rejects.toThrow(/dono/);
        expect(db.process_template_steps[0].name).toBe('a');
        expect(db.process_templates[0].version).toBe(3);
    });

    it('problemaDoModelo: automático exige evento e dono; manual não exige dono', () => {
        const etapa = [{ name: 'e', step_type: 'manual' as const, requires_document: false }];
        expect(problemaDoModelo({ name: 'X', trigger_type: 'EVENTO', owner_user_id: 'u' }, etapa)).toMatch(/evento/);
        expect(problemaDoModelo({ name: 'X', trigger_type: 'EVENTO', trigger_event_key: 'nfe.linked' }, etapa)).toMatch(/dono/);
        expect(problemaDoModelo({ name: 'X', trigger_type: 'MANUAL' }, etapa)).toBeNull();
        expect(problemaDoModelo({ name: ' ', trigger_type: 'MANUAL' }, etapa)).toMatch(/nome/);
        expect(problemaDoModelo({ name: 'X', trigger_type: 'MANUAL' }, [])).toMatch(/etapa/);
    });

    it('editar o modelo não muda o prazo de processo em curso (SLA é cópia)', async () => {
        db.process_template_steps = [etapaModelo('a', 0), etapaModelo('b', 1, { sla_hours: 48 })];
        await processService.startInstance({ organizationId: ORG, templateId: 'tpl', title: 'P' });
        expect(etapasDaInstancia()[1].sla_hours).toBe(48);

        // O modelo muda depois que o processo começou.
        await processService.updateTemplate('tpl', { name: 'X', trigger_type: 'MANUAL' }, [
            { id: 'a', name: 'a', step_type: 'manual', requires_document: false },
            { id: 'b', name: 'b', step_type: 'manual', requires_document: false, sla_hours: 1 },
        ]);

        const antes = Date.now();
        await processService.completeStep(etapasDaInstancia()[0].id as string, instancia().id as string, 'u');
        const b = etapasDaInstancia()[1];
        expect(b.status).toBe('EM_ANDAMENTO');
        const horas = (new Date(b.due_at as string).getTime() - antes) / 3_600_000;
        expect(horas).toBeGreaterThan(47.9);
        expect(horas).toBeLessThan(48.1);
    });
});

describe('aprovação com alçada por valor', () => {
    /** Processo de um pedido de `total`, parado na etapa de aprovação (2ª), com uma 3ª depois. */
    async function processoNaAprovacao(total: number) {
        db.purchase_orders = [pedido(total)];
        db.process_template_steps = [
            etapaModelo('conferir', 0),
            etapaModelo('aprovar', 1, { step_type: 'approval' }),
            etapaModelo('pagar', 2),
        ];
        await processService.startInstance({ organizationId: ORG, templateId: 'tpl', title: 'Pedido', purchaseOrderId: 'po1' });
        await processService.completeStep(etapasDaInstancia()[0].id as string, instancia().id as string, 'u');
        const aprovar = etapasDaInstancia()[1];
        // Estado inicial de toda etapa de aprovação (default da coluna).
        Object.assign(aprovar, { approval_status: 'RASCUNHO', approval_chain: [], approval_required_levels: 1 });
        return aprovar.id as string;
    }

    it('usa o valor do pedido e a org do processo: R$ 10 mil numa faixa de 2 níveis', async () => {
        faixa = { required_levels: 2, level1_label: 'Gestor', level2_label: 'Diretoria' };
        const stepId = await processoNaAprovacao(10_000);

        await processService.submitStepApproval(stepId, instancia().id as string);

        const etapa = etapasDaInstancia()[1];
        expect(etapa).toMatchObject({ amount: 10_000, approval_status: 'PENDENTE', approval_required_levels: 2 });
        expect(instancia().status).toBe('AGUARDANDO_APROVACAO');
        expect(rpcs.find(r => r.fn === 'fn_resolve_approval_levels')?.args).toEqual({ p_organization_id: ORG, p_amount: 10_000 });
    });

    it('nível 1 por uma pessoa, a mesma é recusada no nível 2, outra conclui e o processo avança', async () => {
        faixa = { required_levels: 2, level1_label: 'Gestor', level2_label: 'Diretoria' };
        const stepId = await processoNaAprovacao(10_000);
        const instId = instancia().id as string;
        await processService.submitStepApproval(stepId, instId);

        await processService.approveStep(stepId, instId, 'gestor@x');
        expect(etapasDaInstancia()[1]).toMatchObject({ approval_status: 'PENDENTE', status: 'EM_ANDAMENTO' });

        await expect(processService.approveStep(stepId, instId, 'gestor@x')).rejects.toThrow(/outra pessoa/);

        await processService.approveStep(stepId, instId, 'diretor@x');
        const etapa = etapasDaInstancia()[1];
        expect(etapa).toMatchObject({ approval_status: 'APROVADO', status: 'CONCLUIDO' });
        expect((etapa.approval_chain as Array<{ level: number; role: string; approved_by: string }>).map(c => [c.level, c.role, c.approved_by]))
            .toEqual([[1, 'Gestor', 'gestor@x'], [2, 'Diretoria', 'diretor@x']]);
        expect(etapasDaInstancia()[2].status).toBe('EM_ANDAMENTO');
    });

    it('alçada de 1 nível: uma aprovação conclui', async () => {
        faixa = { required_levels: 1, level1_label: 'Gestor', level2_label: '' };
        const stepId = await processoNaAprovacao(1_000);
        const instId = instancia().id as string;
        await processService.submitStepApproval(stepId, instId);
        await processService.approveStep(stepId, instId, 'gestor@x');
        expect(etapasDaInstancia()[1]).toMatchObject({ approval_status: 'APROVADO', status: 'CONCLUIDO' });
        expect(etapasDaInstancia()[2].status).toBe('EM_ANDAMENTO');
    });

    it('abaixo do piso da alçada: libera, conclui a etapa e avança', async () => {
        faixa = null; // R$ 300 fica fora de todas as faixas
        const stepId = await processoNaAprovacao(300);
        await processService.submitStepApproval(stepId, instancia().id as string);

        expect(etapasDaInstancia()[1]).toMatchObject({ amount: 300, approval_status: 'APROVADO', status: 'CONCLUIDO' });
        expect(etapasDaInstancia()[2].status).toBe('EM_ANDAMENTO');
        expect(acoes()).toContain('APPROVAL_RELEASED');
    });

    it('etapa sem valor (sem pedido) continua exigindo 1 aprovação — não se autoaprova', async () => {
        faixa = null;
        db.process_template_steps = [etapaModelo('aprovar', 0, { step_type: 'approval' }), etapaModelo('depois', 1)];
        await processService.startInstance({ organizationId: ORG, templateId: 'tpl', title: 'Sem pedido' });
        const etapa = etapasDaInstancia()[0];
        Object.assign(etapa, { approval_status: 'RASCUNHO', approval_chain: [], approval_required_levels: 1 });

        await processService.submitStepApproval(etapa.id as string, instancia().id as string);
        expect(etapasDaInstancia()[0]).toMatchObject({ approval_status: 'PENDENTE', approval_required_levels: 1, status: 'EM_ANDAMENTO' });
    });
});
