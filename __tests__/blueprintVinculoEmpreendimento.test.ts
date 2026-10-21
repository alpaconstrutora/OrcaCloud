import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Planta Inteligente › lista › Editar (plano 2026-10-21-planta-lista-editar-e-empreendimento.md,
 * item 1): renomear a planta e vinculá-la a um empreendimento (`empreendimentos.blueprint_study_id`).
 * Um banco falso em memória, para afirmar o que fica GRAVADO — não só que a função foi chamada.
 * Mesmo molde de `imovibVinculo.test.ts`, que cobre o gesto equivalente do Imovib.
 */

type Linha = Record<string, any>;
const db = vi.hoisted(() => {
    const estado = {
        tabelas: {} as Record<string, Linha[]>,
        /** Tabelas onde o UPDATE "passa" sem erro e sem linha — como a RLS faz. */
        updateMudo: new Set<string>(),
        seq: 0,
    };
    const from = (tabela: string) => {
        const st = { op: 'select', filtros: [] as ((r: Linha) => boolean)[], payload: null as any, single: false, maybe: false, devolve: false };
        const executar = () => {
            const linhas = (estado.tabelas[tabela] ??= []);
            const casa = (r: Linha) => st.filtros.every(f => f(r));
            if (st.op === 'update') {
                const alvo = estado.updateMudo.has(tabela) ? [] : linhas.filter(casa);
                alvo.forEach(r => Object.assign(r, st.payload));
                const devolvidas = alvo.map(r => ({ ...r }));
                if (st.single) return devolvidas.length === 1 ? { data: devolvidas[0], error: null } : { data: null, error: { message: `single: ${devolvidas.length} linhas` } };
                return { data: st.devolve ? devolvidas : null, error: null };
            }
            if (st.op === 'insert') {
                const nova = { id: `novo-${++estado.seq}`, ...st.payload };
                linhas.push(nova);
                return { data: st.single ? { ...nova } : [{ ...nova }], error: null };
            }
            const achou = linhas.filter(casa).map(r => ({ ...r }));
            if (st.single) return achou.length === 1 ? { data: achou[0], error: null } : { data: null, error: { message: `single: ${achou.length} linhas` } };
            if (st.maybe) return { data: achou[0] ?? null, error: null };
            return { data: achou, error: null };
        };
        const q: any = {
            select() { if (st.op !== 'select') st.devolve = true; return q; },
            update(p: any) { st.op = 'update'; st.payload = p; return q; },
            insert(p: any) { st.op = 'insert'; st.payload = p; return q; },
            eq(c: string, v: any) { st.filtros.push(r => r[c] === v); return q; },
            neq(c: string, v: any) { st.filtros.push(r => r[c] !== v); return q; },
            in(c: string, vs: any[]) { st.filtros.push(r => vs.includes(r[c])); return q; },
            order() { return q; },
            single() { st.single = true; return q; },
            maybeSingle() { st.maybe = true; return q; },
            then(ok: any, erro: any) { return Promise.resolve(executar()).then(ok, erro); },
        };
        return q;
    };
    return { estado, supabase: { from } };
});

vi.mock('../lib/supabase', () => ({ supabase: db.supabase }));

import { renameStudy, vincularEmpreendimento } from '../services/blueprintService';

const emps = () => db.estado.tabelas.empreendimentos;
const auditoria = () => db.estado.tabelas.blueprint_audit_events ?? [];

beforeEach(() => {
    db.estado.updateMudo.clear();
    db.estado.seq = 0;
    db.estado.tabelas = {
        blueprint_studies: [
            { id: 'planta-1', organization_id: 'org', name: 'Planta 01/10/2026', status: 'RASCUNHO' },
            { id: 'planta-2', organization_id: 'org', name: 'Outra', status: 'RASCUNHO' },
        ],
        empreendimentos: [
            { id: 'emp-a', name: 'A', organization_id: 'org', blueprint_study_id: 'planta-1' },
            { id: 'emp-b', name: 'B', organization_id: 'org', blueprint_study_id: null },
            { id: 'emp-c', name: 'C', organization_id: 'org', blueprint_study_id: 'planta-2' },
            { id: 'emp-x', name: 'X', organization_id: 'outra-org', blueprint_study_id: null },
        ],
    };
});

describe('vincularEmpreendimento', () => {
    it('trocar de empreendimento não deixa dois apontando para a planta', async () => {
        await vincularEmpreendimento('planta-1', 'emp-b');
        expect(emps().filter(e => e.blueprint_study_id === 'planta-1').map(e => e.id)).toEqual(['emp-b']);
        expect(emps().find(e => e.id === 'emp-c')!.blueprint_study_id).toBe('planta-2'); // o de outra planta fica
        expect(auditoria().map(a => a.action)).toEqual(['ESTUDO_VINCULADO_A_EMPREENDIMENTO']);
    });

    it('recusa empreendimento já ligado a OUTRA planta, sem mexer em nada', async () => {
        await expect(vincularEmpreendimento('planta-1', 'emp-c')).rejects.toThrow(/"C".*outra planta/);
        expect(emps().find(e => e.id === 'emp-a')!.blueprint_study_id).toBe('planta-1');
        expect(emps().find(e => e.id === 'emp-c')!.blueprint_study_id).toBe('planta-2');
        expect(auditoria()).toHaveLength(0);
    });

    it('recusa empreendimento de outra organização, sem mexer em nada', async () => {
        await expect(vincularEmpreendimento('planta-1', 'emp-x')).rejects.toThrow(/organização/);
        expect(emps().find(e => e.id === 'emp-a')!.blueprint_study_id).toBe('planta-1');
        expect(emps().find(e => e.id === 'emp-x')!.blueprint_study_id).toBeNull();
    });

    it('null desvincula', async () => {
        await vincularEmpreendimento('planta-1', null);
        expect(emps().some(e => e.blueprint_study_id === 'planta-1')).toBe(false);
        expect(auditoria().map(a => a.action)).toEqual(['ESTUDO_DESVINCULADO_DE_EMPREENDIMENTO']);
    });

    it('vincular de novo ao mesmo empreendimento não falha nem duplica', async () => {
        await vincularEmpreendimento('planta-1', 'emp-a');
        expect(emps().filter(e => e.blueprint_study_id === 'planta-1').map(e => e.id)).toEqual(['emp-a']);
    });

    it('UPDATE recusado em silêncio (RLS) vira erro, não "vinculado"', async () => {
        db.estado.updateMudo.add('empreendimentos');
        await expect(vincularEmpreendimento('planta-1', 'emp-b')).rejects.toThrow(/permissão/);
    });
});

describe('renameStudy', () => {
    it('grava o nome sem espaços nas pontas e devolve o estudo', async () => {
        const s = await renameStudy('planta-1', '  Torre Garden  ');
        expect(s.name).toBe('Torre Garden');
        expect(db.estado.tabelas.blueprint_studies.find(r => r.id === 'planta-1')!.name).toBe('Torre Garden');
        expect(auditoria().map(a => a.action)).toEqual(['ESTUDO_RENOMEADO']);
    });

    it('nome vazio é recusado antes de ir ao banco', async () => {
        await expect(renameStudy('planta-1', '   ')).rejects.toThrow(/nome/i);
        expect(db.estado.tabelas.blueprint_studies.find(r => r.id === 'planta-1')!.name).toBe('Planta 01/10/2026');
    });

    it('UPDATE recusado em silêncio (RLS) vira erro', async () => {
        db.estado.updateMudo.add('blueprint_studies');
        await expect(renameStudy('planta-1', 'Novo')).rejects.toThrow();
    });
});
