import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Vínculo estudo ↔ empreendimento e o custo/preço por torre (plano
 * 2026-10-19-imovib-premissas-planta-inteligente.md, Fases 1 e 2). Um banco falso em
 * memória, para afirmar o que fica GRAVADO — não só que a função foi chamada.
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
                return { data: st.devolve ? alvo.map(r => ({ ...r })) : null, error: null };
            }
            if (st.op === 'insert') {
                const nova = { id: `novo-${++estado.seq}`, ...st.payload };
                linhas.push(nova);
                return { data: st.single ? { ...nova } : [{ ...nova }], error: null };
            }
            if (st.op === 'delete') {
                estado.tabelas[tabela] = linhas.filter(r => !casa(r));
                return { data: null, error: null };
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
            delete() { st.op = 'delete'; return q; },
            eq(c: string, v: any) { st.filtros.push(r => r[c] === v); return q; },
            neq(c: string, v: any) { st.filtros.push(r => r[c] !== v); return q; },
            in(c: string, vs: any[]) { st.filtros.push(r => vs.includes(r[c])); return q; },
            order() { return q; },
            limit() { return q; },
            range() { return q; },
            single() { st.single = true; return q; },
            maybeSingle() { st.maybe = true; return q; },
            then(ok: any, erro: any) { return Promise.resolve(executar()).then(ok, erro); },
        };
        return q;
    };
    return { estado, supabase: { from } };
});

vi.mock('../lib/supabase', () => ({ supabase: db.supabase }));

import { imovibService } from '../services/imovibService';
import { PREFIXO_TORRE_SEM_BLOCO } from '../utils/imovibEstrutura';

const emps = () => db.estado.tabelas.empreendimentos;

beforeEach(() => {
    db.estado.updateMudo.clear();
    db.estado.seq = 0;
    db.estado.tabelas = {
        empreendimentos: [
            { id: 'emp-a', name: 'A', organization_id: 'org', imovib_study_id: 'estudo-1' },
            { id: 'emp-b', name: 'B', organization_id: 'org', imovib_study_id: null },
            { id: 'emp-c', name: 'C', organization_id: 'org', imovib_study_id: 'estudo-2' },
        ],
        empreendimento_towers: [
            { id: 't-1', empreendimento_id: 'emp-b', name: 'Torre B', imovib_block_id: null },
            { id: 't-2', empreendimento_id: 'emp-b', name: 'Torre C', imovib_block_id: 'bloco-existente' },
        ],
        imovib_blocks: [
            { id: 'bloco-existente', study_id: 'estudo-1', name: 'Torre C', construction_cost_sqm: 3000, sales_price_sqm: 8000 },
        ],
    };
});

describe('vincularEmpreendimento', () => {
    it('trocar de empreendimento não deixa dois apontando para o estudo', async () => {
        await imovibService.vincularEmpreendimento('estudo-1', 'emp-b');
        expect(emps().filter(e => e.imovib_study_id === 'estudo-1').map(e => e.id)).toEqual(['emp-b']);
        expect(emps().find(e => e.id === 'emp-c')!.imovib_study_id).toBe('estudo-2'); // o de outro estudo fica
    });

    it('recusa empreendimento já ligado a OUTRO estudo, sem mexer em nada', async () => {
        await expect(imovibService.vincularEmpreendimento('estudo-1', 'emp-c')).rejects.toThrow(/outro estudo/);
        expect(emps().find(e => e.id === 'emp-a')!.imovib_study_id).toBe('estudo-1');
        expect(emps().find(e => e.id === 'emp-c')!.imovib_study_id).toBe('estudo-2');
    });

    it('null desvincula', async () => {
        await imovibService.vincularEmpreendimento('estudo-1', null);
        expect(emps().some(e => e.imovib_study_id === 'estudo-1')).toBe(false);
    });

    it('UPDATE recusado em silêncio (RLS) vira erro, não "vinculado"', async () => {
        db.estado.updateMudo.add('empreendimentos');
        await expect(imovibService.vincularEmpreendimento('estudo-1', 'emp-b')).rejects.toThrow(/permissão/);
    });
});

describe('salvarEconomiaDoBloco', () => {
    const semLinha = {
        id: `${PREFIXO_TORRE_SEM_BLOCO}t-1`, study_id: 'estudo-1', name: 'Torre B', tower_id: 't-1',
        construction_cost_sqm: 2500, sales_price_sqm: 7000,
    };

    it('torre sem bloco: cria UMA linha com os valores exibidos + o editado, e liga a torre', async () => {
        await imovibService.salvarEconomiaDoBloco(semLinha, { construction_cost_sqm: 3200 });
        const novos = db.estado.tabelas.imovib_blocks.filter(b => b.id !== 'bloco-existente');
        expect(novos).toHaveLength(1);
        expect(novos[0]).toMatchObject({ study_id: 'estudo-1', name: 'Torre B', construction_cost_sqm: 3200, sales_price_sqm: 7000 });
        expect(db.estado.tabelas.empreendimento_towers.find(t => t.id === 't-1')!.imovib_block_id).toBe(novos[0].id);
    });

    it('torre já ligada depois da leitura: atualiza o bloco dela, não cria outro', async () => {
        db.estado.tabelas.empreendimento_towers[0].imovib_block_id = 'bloco-existente';
        await imovibService.salvarEconomiaDoBloco(semLinha, { sales_price_sqm: 9000 });
        expect(db.estado.tabelas.imovib_blocks).toHaveLength(1);
        expect(db.estado.tabelas.imovib_blocks[0].sales_price_sqm).toBe(9000);
    });

    it('ligar a torre falhou: o bloco criado é desfeito (nada órfão no estudo)', async () => {
        db.estado.updateMudo.add('empreendimento_towers');
        await expect(imovibService.salvarEconomiaDoBloco(semLinha, { construction_cost_sqm: 3200 })).rejects.toThrow(/Torre B/);
        expect(db.estado.tabelas.imovib_blocks.map(b => b.id)).toEqual(['bloco-existente']);
    });

    it('bloco com linha: só atualiza', async () => {
        await imovibService.salvarEconomiaDoBloco(
            { id: 'bloco-existente', study_id: 'estudo-1', name: 'Torre C', tower_id: 't-2', construction_cost_sqm: 3000, sales_price_sqm: 8000 },
            { construction_cost_sqm: 3500 });
        expect(db.estado.tabelas.imovib_blocks).toEqual([expect.objectContaining({ id: 'bloco-existente', construction_cost_sqm: 3500 })]);
    });
});

describe('getStudyById com empreendimento vinculado', () => {
    it('blocos = torres do empreendimento; bloco antigo sem torre fica fora e é nomeado', async () => {
        db.estado.tabelas.imovib_studies = [{ id: 'estudo-1', organization_id: 'org', name: 'Estudo' }];
        db.estado.tabelas.empreendimentos[0].imovib_study_id = null;
        db.estado.tabelas.empreendimentos[1].imovib_study_id = 'estudo-1';
        db.estado.tabelas.imovib_blocks.push({ id: 'bloco-velho', study_id: 'estudo-1', name: 'Bloco Único (Planta AI)', construction_cost_sqm: 1, sales_price_sqm: 1 });
        db.estado.tabelas.imovib_units = [];
        db.estado.tabelas.imovib_capex_items = [];
        db.estado.tabelas.imovib_unit_instances = [];
        db.estado.tabelas.empreendimento_units = [
            { id: 'u1', tower_id: 't-1', typology: 'Tipo 1', private_area: 70, common_area: 10, price: 0, is_vendavel: true },
            { id: 'u2', tower_id: 't-2', typology: 'Tipo 2', private_area: 90, common_area: 10, price: 0, is_vendavel: true },
        ];
        const s = await imovibService.getStudyById('estudo-1', true);
        expect(s!.estrutura).toMatchObject({ origem: 'empreendimento', empreendimento_id: 'emp-b', torres: 2, unidades: 2, blocos_fora_do_calculo: ['Bloco Único (Planta AI)'] });
        expect(s!.blocks!.map(b => b.name).sort()).toEqual(['Torre B', 'Torre C']);
        // A torre ligada mantém o id do bloco (custo/preço e espelho continuam valendo).
        expect(s!.blocks!.find(b => b.name === 'Torre C')).toMatchObject({ id: 'bloco-existente', construction_cost_sqm: 3000, sales_price_sqm: 8000 });
    });

    it('empreendimento de OUTRA organização não vale como vínculo: estrutura antiga do estudo', async () => {
        db.estado.tabelas.imovib_studies = [{ id: 'estudo-1', organization_id: 'outra-org', name: 'Estudo' }];
        db.estado.tabelas.imovib_units = [];
        db.estado.tabelas.imovib_capex_items = [];
        db.estado.tabelas.imovib_unit_instances = [];
        const s = await imovibService.getStudyById('estudo-1', true);
        expect(s!.estrutura!.origem).toBe('estudo');
        expect(s!.blocks!.map(b => b.id)).toEqual(['bloco-existente']);
    });
});
