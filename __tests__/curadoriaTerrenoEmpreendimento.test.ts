import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Curadoria aprova campo do PRÓPRIO empreendimento (plano 2026-10-22-planta-empreendimento-pendencias.md, item 5).
 * Até 22/10/2026 `TABLE_BY_ENTITY` só tinha torre e unidade, e uma proposta de terreno cairia em
 * "Entidade não suportada". Banco falso em memória, para afirmar o que fica GRAVADO.
 */
type Linha = Record<string, any>;
const db = vi.hoisted(() => {
    const estado = { tabelas: {} as Record<string, Linha[]> };
    const from = (tabela: string) => {
        const st = { op: 'select', filtros: [] as ((r: Linha) => boolean)[], payload: null as any, maybe: false };
        const executar = () => {
            const linhas = (estado.tabelas[tabela] ??= []);
            const casa = (r: Linha) => st.filtros.every((f) => f(r));
            if (st.op === 'update') { linhas.filter(casa).forEach((r) => Object.assign(r, st.payload)); return { data: null, error: null }; }
            const achou = linhas.filter(casa).map((r) => ({ ...r }));
            if (st.maybe) return { data: achou[0] ?? null, error: null };
            return { data: achou, error: null };
        };
        const q: any = {
            select() { return q; },
            update(p: any) { st.op = 'update'; st.payload = p; return q; },
            eq(c: string, v: any) { st.filtros.push((r) => r[c] === v); return q; },
            in(c: string, vs: any[]) { st.filtros.push((r) => vs.includes(r[c])); return q; },
            maybeSingle() { st.maybe = true; return q; },
            then(ok: any, erro: any) { return Promise.resolve(executar()).then(ok, erro); },
        };
        return q;
    };
    return { estado, supabase: { from } };
});
vi.mock('../lib/supabase', () => ({ supabase: db.supabase }));
vi.mock('../services/empreendimentoAuditService', () => ({ empreendimentoAuditService: { record: vi.fn(async () => undefined) } }));

import { empreendimentoProposalService } from '../services/empreendimentoProposalService';

const proposta = (over: Linha = {}) => ({
    id: 'p1', organization_id: 'org-1', empreendimento_id: 'emp-1', origin: 'blueprint', entity: 'empreendimento',
    entity_id: 'emp-1', field: 'terreno_fundos', field_group: 'area', label: 'Fundos do terreno (m)',
    current_value: 11, proposed_value: 12, status: 'pending', ...over,
});

beforeEach(() => {
    db.estado.tabelas = {
        empreendimentos: [{ id: 'emp-1', terreno_fundos: 11 }],
        empreendimento_field_proposals: [proposta()],
    };
});

describe('Curadoria › campo do empreendimento (terreno)', () => {
    it('aprovar grava na ficha (tabela empreendimentos) e marca a proposta aplicada', async () => {
        const r = await empreendimentoProposalService.approve(['p1']);
        expect(r).toEqual({ applied: ['p1'], superseded: [], failed: [] });
        expect(db.estado.tabelas.empreendimentos[0].terreno_fundos).toBe(12);
        expect(db.estado.tabelas.empreendimento_field_proposals[0].status).toBe('applied');
    });

    it('a ficha mudou desde a proposta: não sobrescreve (superseded)', async () => {
        db.estado.tabelas.empreendimentos[0].terreno_fundos = 10.5;
        const r = await empreendimentoProposalService.approve(['p1']);
        expect(r.superseded).toEqual([{ id: 'p1', field: 'terreno_fundos' }]);
        expect(db.estado.tabelas.empreendimentos[0].terreno_fundos).toBe(10.5);
    });
});
