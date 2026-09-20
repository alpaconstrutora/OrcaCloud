/**
 * `costCenterService.moveToOrganization` — Minha Organização › Centro de Custo ›
 * Editar › campo Organização (2026-09-19).
 *
 * O que está em jogo e não dá para provar pela tela (as provas de UI rodam com
 * escritas bloqueadas):
 *   • UNIQUE (organization_id, code): o código só é mantido se estiver livre no
 *     destino; senão vem o próximo da sequência de lá (RPC);
 *   • grupo leva os filhos junto — filho perde a obra (obra é por org), mantém
 *     o empreendimento (vínculo cruza orgs por desenho) e o parent_id;
 *   • empresa_id zera nos dois casos (empresa pertence à organização);
 *   • os campos editados no formulário vão no MESMO PATCH do próprio registro.
 *
 * O cliente Supabase é um dublê em memória que entende só a cadeia que o
 * serviço usa (from/select/eq/order/single/update/rpc).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown> & { id: string; organization_id: string; code: string; parent_id: string | null };

const db: { rows: Row[]; nextCode: Record<string, number>; patches: Array<{ id: string; payload: Record<string, unknown> }> } = {
    rows: [], nextCode: {}, patches: [],
};

function builder(table: string) {
    const filtros: Array<[string, unknown]> = [];
    let payload: Record<string, unknown> | null = null;
    const aplicar = () => db.rows.filter(r => filtros.every(([k, v]) => r[k] === v));
    const q: any = {
        select() { return q; },
        order() { return q; },
        eq(k: string, v: unknown) { filtros.push([k, v]); return q; },
        update(p: Record<string, unknown>) { payload = p; return q; },
        single() {
            return q.then((res: { data: Row[] }) => ({ data: res.data[0] ?? null, error: res.data[0] ? null : { message: 'sem linha' } }));
        },
        then(resolve: (v: { data: Row[]; error: null }) => unknown) {
            expect(table).toBe('cost_centers_v2');
            if (payload) {
                const alvo = aplicar();
                for (const r of alvo) {
                    // UNIQUE (organization_id, code) — o mesmo que o banco faria.
                    const org = (payload.organization_id ?? r.organization_id) as string;
                    const code = (payload.code ?? r.code) as string;
                    if (db.rows.some(o => o.id !== r.id && o.organization_id === org && o.code === code)) {
                        throw new Error(`duplicate key value violates unique constraint "uq_cost_centers_v2_org_code" (${org}, ${code})`);
                    }
                    Object.assign(r, payload);
                    db.patches.push({ id: r.id, payload: { ...payload } });
                }
                return Promise.resolve(resolve({ data: alvo, error: null }));
            }
            return Promise.resolve(resolve({ data: aplicar(), error: null }));
        },
    };
    return q;
}

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (table: string) => builder(table),
        rpc: async (fn: string, args: { p_org_id: string }) => {
            expect(fn).toBe('get_next_cost_center_v2_code');
            // Igual à função do banco: MAX(code)+1 na org, com zeros à esquerda.
            const max = db.rows.filter(r => r.organization_id === args.p_org_id && /^\d+$/.test(r.code))
                .reduce((m, r) => Math.max(m, parseInt(r.code, 10)), 0);
            return { data: String(max + 1).padStart(3, '0'), error: null };
        },
    },
}));

import { costCenterService } from '../services/costCenterService';

const ORIGEM = 'org-alpa';
const DESTINO = 'org-spe';
const linha = (id: string, org: string, code: string, extra: Partial<Row> = {}): Row => ({
    id, organization_id: org, code, parent_id: null, name: id, description: null, empresa_id: null, project_id: null, empreendimento_id: null, ...extra,
});

beforeEach(() => {
    db.rows = [
        linha('grupo-obra', ORIGEM, '001'),
        linha('cc-garden', ORIGEM, '004', { parent_id: 'grupo-obra', empresa_id: 'emp-alpa', project_id: 'obra-garden', empreendimento_id: 'emp-garden' }),
        linha('cc-livre', ORIGEM, '009', { parent_id: 'grupo-obra' }),
        // Destino já usa 001 e 004 — o 009 está livre lá.
        linha('spe-adm', DESTINO, '001'),
        linha('spe-004', DESTINO, '004'),
    ];
    db.patches = [];
});

describe('moveToOrganization — centro de custo (filho)', () => {
    it('código em uso no destino → recebe o próximo da sequência de lá; empresa zera; campos do form vão no mesmo PATCH', async () => {
        const movido = await costCenterService.moveToOrganization('cc-garden', DESTINO, { name: 'Garden Cambuhy', parent_id: 'spe-adm', project_id: null });
        expect(movido).toMatchObject({ organization_id: DESTINO, code: '005', empresa_id: null, name: 'Garden Cambuhy', parent_id: 'spe-adm' });
        // vínculo com empreendimento é mantido (cruza organizações por desenho)
        expect(movido.empreendimento_id).toBe('emp-garden');
        // um único PATCH para o próprio registro
        expect(db.patches.filter(p => p.id === 'cc-garden')).toHaveLength(1);
        expect(db.patches[0].payload).toMatchObject({ organization_id: DESTINO, code: '005', empresa_id: null, name: 'Garden Cambuhy' });
    });

    it('código livre no destino → mantém o código', async () => {
        const movido = await costCenterService.moveToOrganization('cc-livre', DESTINO);
        expect(movido).toMatchObject({ organization_id: DESTINO, code: '009' });
    });

    it('filho não arrasta irmãos nem o grupo', async () => {
        await costCenterService.moveToOrganization('cc-livre', DESTINO);
        expect(db.rows.find(r => r.id === 'grupo-obra')!.organization_id).toBe(ORIGEM);
        expect(db.rows.find(r => r.id === 'cc-garden')!.organization_id).toBe(ORIGEM);
    });

    it('mesma organização → só aplica os campos (sem mexer em código/empresa)', async () => {
        const r = await costCenterService.moveToOrganization('cc-garden', ORIGEM, { name: 'Renomeado' });
        expect(r).toMatchObject({ organization_id: ORIGEM, code: '004', empresa_id: 'emp-alpa', name: 'Renomeado' });
    });
});

describe('moveToOrganization — grupo', () => {
    it('leva os filhos: cada um com código livre no destino, obra desfeita, parent_id e empreendimento mantidos', async () => {
        await costCenterService.moveToOrganization('grupo-obra', DESTINO);
        const grupo = db.rows.find(r => r.id === 'grupo-obra')!;
        const garden = db.rows.find(r => r.id === 'cc-garden')!;
        const livre = db.rows.find(r => r.id === 'cc-livre')!;

        expect(grupo).toMatchObject({ organization_id: DESTINO, code: '005' });          // 001 ocupado → 005
        expect(garden).toMatchObject({ organization_id: DESTINO, code: '006', parent_id: 'grupo-obra', project_id: null, empresa_id: null, empreendimento_id: 'emp-garden' }); // 004 ocupado → 006
        expect(livre).toMatchObject({ organization_id: DESTINO, code: '009', parent_id: 'grupo-obra' }); // 009 livre → mantém

        // nada ficou para trás na origem
        expect(db.rows.filter(r => r.organization_id === ORIGEM)).toHaveLength(0);
        // e o UNIQUE do destino continua íntegro
        const codes = db.rows.filter(r => r.organization_id === DESTINO).map(r => r.code);
        expect(new Set(codes).size).toBe(codes.length);
    });

    it('grupo vai ANTES dos filhos (se um filho falhar, o grupo já está no destino)', async () => {
        await costCenterService.moveToOrganization('grupo-obra', DESTINO);
        expect(db.patches.map(p => p.id)).toEqual(['grupo-obra', 'cc-garden', 'cc-livre']);
    });
});
