/**
 * Motor de Processos — F3: bloqueio manual e snapshot de escalonamento.
 * Plano: docs/planos/2026-09-29-processos-f3-escalonamento-sla.md (2.2).
 *
 * Mesmo harness de banco em memória do processServiceCondicaoEtapa.
 * O que este arquivo trava:
 *   1. bloquear sem motivo lança e não grava;
 *   2. bloquear grava BLOQUEADO + status_before_block + blocked_reason + log;
 *   3. bloquear processo concluído/cancelado/já bloqueado lança;
 *   4. desbloquear restaura o status anterior e limpa os campos;
 *   5. desbloquear quando o anterior era ATRASADO recalcula pela etapa atual;
 *   6. startInstance copia escalation_user_id/escalation_after_hours do template;
 *   7. listAssignableMembers devolve userId null para membro sem login (não esconde).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Linha = Record<string, unknown>;
const db: Record<string, Linha[]> = {};
let seq = 0;

function query(tabela: string) {
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
        insert: (p: Linha | Linha[]) => { pendingInsert = (Array.isArray(p) ? p : [p]).map(r => ({ id: `${tabela}-${++seq}`, ...r })); return q; },
        single: async () => { const ins = pendingInsert; aplicar(); const r = ins ? ins[0] : rows()[0]; return { data: r ?? null, error: r ? null : { message: 'não achou' } }; },
        maybeSingle: async () => { aplicar(); return { data: rows()[0] ?? null, error: null }; },
        then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => { try { aplicar(); res({ data: rows(), error: null }); } catch (e) { rej?.(e); } },
    });
    return q;
}

vi.mock('../lib/supabase', () => ({ supabase: { from: (t: string) => query(t) } }));
vi.mock('../services/approvalService', () => ({ approvalService: {} }));

import { processService } from '../services/processService';

const acoes = () => (db.process_audit_logs ?? []).map(l => l.action);

beforeEach(() => {
    for (const k of Object.keys(db)) delete db[k];
    seq = 0;
    db.process_audit_logs = [];
    db.process_instance_steps = [];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('bloqueio manual', () => {
    beforeEach(() => {
        db.process_instances = [{ id: 'i1', status: 'AGUARDANDO_APROVACAO', current_step_id: 's1', blocked_reason: null, status_before_block: null }];
        db.process_instance_steps = [{ id: 's1', step_type: 'approval', responsible_user_id: 'u9' }];
    });

    it('sem motivo lança e não grava', async () => {
        await expect(processService.blockInstance('i1', 'u1', '   ')).rejects.toThrow(/motivo/i);
        expect(db.process_instances[0].status).toBe('AGUARDANDO_APROVACAO');
        expect(acoes()).toEqual([]);
    });

    it('grava BLOQUEADO, guarda o status anterior e o motivo, registra log', async () => {
        await processService.blockInstance('i1', 'u1', 'Aguardando laudo do fornecedor');
        expect(db.process_instances[0]).toMatchObject({ status: 'BLOQUEADO', status_before_block: 'AGUARDANDO_APROVACAO', blocked_reason: 'Aguardando laudo do fornecedor' });
        expect(acoes()).toEqual(['INSTANCE_BLOCKED']);
    });

    it('concluído, cancelado ou já bloqueado não bloqueia', async () => {
        for (const st of ['CONCLUIDO', 'CANCELADO', 'BLOQUEADO']) {
            db.process_instances[0].status = st;
            await expect(processService.blockInstance('i1', 'u1', 'x')).rejects.toThrow(new RegExp(st));
        }
    });

    it('desbloquear restaura o status anterior e limpa os campos', async () => {
        await processService.blockInstance('i1', 'u1', 'pausa');
        await processService.unblockInstance('i1', 'u1');
        expect(db.process_instances[0]).toMatchObject({ status: 'AGUARDANDO_APROVACAO', status_before_block: null, blocked_reason: null });
        expect(acoes()).toEqual(['INSTANCE_BLOCKED', 'INSTANCE_UNBLOCKED']);
    });

    it('anterior ATRASADO → recalcula pela etapa atual (com responsável: aguardando do tipo)', async () => {
        db.process_instances[0].status = 'ATRASADO';
        await processService.blockInstance('i1', 'u1', 'pausa');
        await processService.unblockInstance('i1', 'u1');
        expect(db.process_instances[0].status).toBe('AGUARDANDO_APROVACAO');
    });

    it('desbloquear processo que não está bloqueado lança', async () => {
        await expect(processService.unblockInstance('i1', 'u1')).rejects.toThrow(/não está bloqueado/);
    });
});

describe('startInstance copia o escalonamento do template', () => {
    it('etapa da instância nasce com escalation_user_id/after_hours do template', async () => {
        db.process_templates = [{ id: 'tpl', organization_id: 'org', version: 1, criticality: 'MEDIA', department_id: null }];
        db.process_template_steps = [
            { id: 'a', process_template_id: 'tpl', name: 'a', step_type: 'manual', order_index: 0, sla_hours: 24, escalation_user_id: 'diretor', escalation_after_hours: 12, condition: null },
            { id: 'b', process_template_id: 'tpl', name: 'b', step_type: 'manual', order_index: 1, condition: null },
        ];
        db.process_instances = [];
        await processService.startInstance({ organizationId: 'org', templateId: 'tpl', title: 'T' });
        const [a, b] = db.process_instance_steps;
        expect(a).toMatchObject({ escalation_user_id: 'diretor', escalation_after_hours: 12 });
        expect(b).toMatchObject({ escalation_user_id: null, escalation_after_hours: null });
    });
});

describe('listAssignableMembers', () => {
    it('membro sem user_id vem com userId null (a UI desabilita com motivo, não esconde)', async () => {
        db.organization_members = [
            { organization_id: 'org', user_id: 'u1', name: 'Ana', email: 'ana@x' },
            { organization_id: 'org', user_id: null, name: null, email: 'convidado@x' },
        ];
        const lista = await processService.listAssignableMembers('org');
        expect(lista).toEqual([
            { userId: 'u1', name: 'Ana', email: 'ana@x' },
            { userId: null, name: 'convidado@x', email: 'convidado@x' },
        ]);
    });
});
