/**
 * Processos F3.2 — responsável por Departamento/Cargo e "Assumir etapa".
 * Plano: docs/planos/2026-09-29-processos-f32-responsavel-por-grupo.md (item 3).
 *
 * Banco em memória com filtros DE VERDADE (eq, is, in, caminho aninhado) — o
 * harness das F3/F4 tratava `.in()` como no-op, e aqui a fila de grupo depende
 * exatamente dele.
 *
 * O que este arquivo trava:
 *   1. startInstance copia o responsável do template (pessoa E grupo) para a etapa;
 *   2. claimStep: membro do grupo assume; não-membro é recusado; etapa já
 *      assumida por outro é recusada; etapa sem responsável → qualquer um;
 *      assumir tira a instância de AGUARDANDO_RESPONSAVEL, mas ATRASADO fica;
 *   3. listMyPendingSteps traz a etapa do grupo com `via_group`, só a EM_ANDAMENTO,
 *      e deixa de trazer depois que alguém assume;
 *   4. setGroupMembers faz o diff (insere os novos, remove os que saíram);
 *   5. listGroups monta departamentos + cargos com empresa e membros.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Linha = Record<string, any>;
const db: Record<string, Linha[]> = {};
let seq = 0;

const get = (row: Linha, path: string) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), row as any);

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
        if (pendingDelete) { const alvo = new Set(rows()); db[tabela] = (db[tabela] ?? []).filter(r => !alvo.has(r)); pendingDelete = false; }
    };
    Object.assign(q, {
        select: chain, order: chain, limit: chain, not: chain,
        eq: (c: string, v: unknown) => { filtros.push(r => get(r, c) === v); return q; },
        is: (c: string, v: unknown) => { filtros.push(r => (get(r, c) ?? null) === v); return q; },
        in: (c: string, vs: unknown[]) => { filtros.push(r => vs.includes(get(r, c))); return q; },
        update: (p: Linha) => { pendingUpdate = p; return q; },
        delete: () => { pendingDelete = true; return q; },
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

const INST = { title: 'Pedido PC-1', status: 'AGUARDANDO_RESPONSAVEL', priority: 'MEDIA', organization_id: 'org' };
const acoes = () => (db.process_audit_logs ?? []).map(l => l.action);

beforeEach(() => {
    for (const k of Object.keys(db)) delete db[k];
    seq = 0;
    db.process_audit_logs = [];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('startInstance copia o responsável do template', () => {
    it('pessoa vira responsible_user_id; grupo fica em responsible_type/ref sem pessoa', async () => {
        db.process_templates = [{ id: 'tpl', organization_id: 'org', version: 1, criticality: 'MEDIA', department_id: null }];
        db.process_template_steps = [
            { id: 'a', process_template_id: 'tpl', name: 'Financeiro confere', step_type: 'manual', order_index: 0, default_responsible_type: 'DEPARTMENT', default_responsible_id: 'dep-fin', condition: null },
            { id: 'b', process_template_id: 'tpl', name: 'Diretor aprova', step_type: 'manual', order_index: 1, default_responsible_type: 'USER', default_responsible_id: 'u-dir', condition: null },
        ];
        db.process_instances = [];
        db.process_instance_steps = [];
        await processService.startInstance({ organizationId: 'org', templateId: 'tpl', title: 'T' });
        const [a, b] = db.process_instance_steps.sort((x, y) => x.order_index - y.order_index);
        expect(a).toMatchObject({ responsible_type: 'DEPARTMENT', responsible_ref_id: 'dep-fin', responsible_user_id: null });
        expect(b).toMatchObject({ responsible_type: 'USER', responsible_ref_id: 'u-dir', responsible_user_id: 'u-dir' });
        expect(db.process_instances[0].status).toBe('AGUARDANDO_RESPONSAVEL'); // grupo: ninguém assumiu ainda
    });
});

describe('claimStep — Assumir etapa', () => {
    beforeEach(() => {
        db.process_instances = [{ id: 'i1', ...INST }];
        db.process_instance_steps = [{ id: 's1', process_instance_id: 'i1', status: 'EM_ANDAMENTO', step_type: 'approval',
            responsible_user_id: null, responsible_type: 'DEPARTMENT', responsible_ref_id: 'dep-fin' }];
        db.process_group_members = [{ id: 'gm1', organization_id: 'org', group_type: 'DEPARTMENT', group_id: 'dep-fin', user_id: 'ana' }];
    });

    it('membro do grupo assume: vira responsável, instância sai de AGUARDANDO_RESPONSAVEL, log STEP_CLAIMED', async () => {
        await processService.claimStep('s1', 'i1', 'ana');
        expect(db.process_instance_steps[0].responsible_user_id).toBe('ana');
        expect(db.process_instances[0].status).toBe('AGUARDANDO_APROVACAO');
        expect(acoes()).toEqual(['STEP_CLAIMED']);
    });

    it('quem não é do grupo é recusado e nada muda', async () => {
        await expect(processService.claimStep('s1', 'i1', 'bruno')).rejects.toThrow(/departamento\/cargo/);
        expect(db.process_instance_steps[0].responsible_user_id).toBeNull();
    });

    it('etapa já assumida por outro é recusada; o próprio assumir de novo é no-op', async () => {
        db.process_instance_steps[0].responsible_user_id = 'ana';
        await expect(processService.claimStep('s1', 'i1', 'carla')).rejects.toThrow(/outra pessoa/);
        await expect(processService.claimStep('s1', 'i1', 'ana')).resolves.toBeUndefined();
        expect(acoes()).toEqual([]);
    });

    it('etapa sem responsável nenhum: qualquer membro da org assume', async () => {
        Object.assign(db.process_instance_steps[0], { responsible_type: null, responsible_ref_id: null });
        await processService.claimStep('s1', 'i1', 'bruno');
        expect(db.process_instance_steps[0].responsible_user_id).toBe('bruno');
    });

    it('instância ATRASADO continua ATRASADO depois de assumida (o prazo não mudou)', async () => {
        db.process_instances[0].status = 'ATRASADO';
        await processService.claimStep('s1', 'i1', 'ana');
        expect(db.process_instances[0].status).toBe('ATRASADO');
    });
});

describe('listMyPendingSteps — fila do grupo', () => {
    beforeEach(() => {
        db.process_group_members = [{ id: 'gm1', organization_id: 'org', group_type: 'DEPARTMENT', group_id: 'dep-fin', user_id: 'ana' }];
        db.company_departments = [{ id: 'dep-fin', nome: 'Diretoria Financeira' }];
        db.org_roles = [];
        db.process_instance_steps = [
            { id: 'meu', process_instance_id: 'i0', name: 'Minha', status: 'EM_ANDAMENTO', step_type: 'manual', responsible_user_id: 'ana', responsible_type: 'USER', responsible_ref_id: 'ana', process_instances: INST },
            { id: 'grupo', process_instance_id: 'i1', name: 'Do grupo', status: 'EM_ANDAMENTO', step_type: 'manual', responsible_user_id: null, responsible_type: 'DEPARTMENT', responsible_ref_id: 'dep-fin', process_instances: INST },
            { id: 'futura', process_instance_id: 'i1', name: 'Futura', status: 'PENDENTE', step_type: 'manual', responsible_user_id: null, responsible_type: 'DEPARTMENT', responsible_ref_id: 'dep-fin', process_instances: INST },
            { id: 'outro-grupo', process_instance_id: 'i2', name: 'Outro', status: 'EM_ANDAMENTO', step_type: 'manual', responsible_user_id: null, responsible_type: 'DEPARTMENT', responsible_ref_id: 'dep-obras', process_instances: INST },
        ];
    });

    it('traz a minha + a atual do meu grupo (com via_group); não a futura nem a de outro grupo', async () => {
        const lista = await processService.listMyPendingSteps('org', 'ana');
        expect(lista.map(i => [i.id, i.via_group ?? null])).toEqual([['meu', null], ['grupo', 'Diretoria Financeira']]);
    });

    it('depois que alguém assume, a etapa sai da fila do grupo', async () => {
        db.process_instance_steps.find(s => s.id === 'grupo')!.responsible_user_id = 'carla';
        const lista = await processService.listMyPendingSteps('org', 'ana');
        expect(lista.map(i => i.id)).toEqual(['meu']);
    });

    it('usuário sem grupo: só a fila pessoal', async () => {
        const lista = await processService.listMyPendingSteps('org', 'bruno');
        expect(lista).toEqual([]);
    });
});

describe('setGroupMembers — diff', () => {
    it('insere os novos e remove os que saíram, sem mexer em quem fica', async () => {
        db.process_group_members = [
            { id: 'fica', organization_id: 'org', group_type: 'ROLE', group_id: 'r1', user_id: 'ana' },
            { id: 'sai', organization_id: 'org', group_type: 'ROLE', group_id: 'r1', user_id: 'bruno' },
            { id: 'outro', organization_id: 'org', group_type: 'ROLE', group_id: 'r2', user_id: 'bruno' },
        ];
        await processService.setGroupMembers({ type: 'ROLE', id: 'r1', organizationId: 'org' }, ['ana', 'carla'], 'eu');
        const r1 = db.process_group_members.filter(m => m.group_id === 'r1').map(m => m.user_id).sort();
        expect(r1).toEqual(['ana', 'carla']);
        expect(db.process_group_members.find(m => m.id === 'fica')).toBeTruthy();
        expect(db.process_group_members.find(m => m.id === 'outro')).toBeTruthy(); // outro grupo intacto
        expect(db.process_group_members.find(m => m.user_id === 'carla')!.created_by).toBe('eu');
    });
});

describe('listGroups', () => {
    it('departamentos (só ativos) + cargos das empresas da org, com empresa e membros', async () => {
        db.companies = [{ id: 'c1', org_id: 'org', nome_fantasia: 'Alpa', razao_social: 'Alpa LTDA' }, { id: 'c9', org_id: 'outra', nome_fantasia: 'X' }];
        db.company_departments = [
            { id: 'd1', company_id: 'c1', nome: 'Tesouraria', ativo: true },
            { id: 'd2', company_id: 'c1', nome: 'Inativo', ativo: false },
            { id: 'd9', company_id: 'c9', nome: 'De outra org', ativo: true },
        ];
        db.org_roles = [{ id: 'r1', company_id: 'c1', nome: 'Comprador' }];
        db.process_group_members = [{ organization_id: 'org', group_type: 'DEPARTMENT', group_id: 'd1', user_id: 'ana' }];
        const grupos = await processService.listGroups('org');
        expect(grupos).toEqual([
            { type: 'DEPARTMENT', id: 'd1', name: 'Tesouraria', organizationId: 'org', companyName: 'Alpa', memberUserIds: ['ana'] },
            { type: 'ROLE', id: 'r1', name: 'Comprador', organizationId: 'org', companyName: 'Alpa', memberUserIds: [] },
        ]);
    });
});
