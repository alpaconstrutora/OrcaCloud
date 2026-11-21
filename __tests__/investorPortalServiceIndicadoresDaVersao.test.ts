/**
 * investorPortalService: a oportunidade vem com `indicadores_da_versao` (embed da versão publicada,
 * achatado) e esse campo — que não é coluna — nunca vai num insert/update.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const q = vi.hoisted(() => {
    const st = { select: '', insert: null as unknown, update: null as unknown, resposta: null as unknown };
    const b: Record<string, unknown> = {};
    for (const m of ['eq', 'order']) b[m] = () => b;
    b.select = (s: string) => { st.select = s; return b; };
    b.insert = (x: unknown) => { st.insert = x; return b; };
    b.update = (x: unknown) => { st.update = x; return b; };
    b.single = () => Promise.resolve({ data: st.resposta, error: null });
    b.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [st.resposta], error: null }).then(ok);
    return { st, b };
});
vi.mock('../lib/supabase', () => ({ supabase: { from: () => q.b } }));

import { investorPortalService } from '../services/investorPortalService';

const IND = { vgv: 11648000, tirAnual: 19 };
const linha = { id: 'op1', organization_id: 'spe', title: 'Garden', versao_publicada: { indicadores: IND } };

beforeEach(() => { q.st.insert = null; q.st.update = null; q.st.resposta = linha; });

describe('investorPortalService › indicadores da versão', () => {
    it('o select traz a versão publicada pelo imovib_version_id', async () => {
        await investorPortalService.listOpportunities(null);
        expect(q.st.select).toContain('versao_publicada:imovib_study_versions!imovib_version_id(indicadores:snapshot->calculo->investidor->indicadores, results, fontes:snapshot->funding_sources)');
        // Fase 2 do plano 2026-11-21: nenhum número digitado no select.
        for (const c of ['vgv', 'roi_pct', 'tir_pct', 'cost_estimate', 'duration_months', 'location_city', 'risks_json', 'target_funding_value']) {
            expect(q.st.select.split(', ')).not.toContain(c);
        }
    });

    it('resultados da versão vêm achatados só com prazo e custos; sem estudo, local null', async () => {
        q.st.resposta = { ...linha, versao_publicada: { indicadores: IND, results: { duracao: 48, custoObra: 7, terreno: 1, vpl: 99 } } };
        const [o] = await investorPortalService.listOpportunities('spe');
        expect(o.resultados_da_versao).toEqual({ duracao: 48, custoObra: 7, terreno: 1 });
        expect(o.local).toBeNull();
    });

    it('listar, criar e salvar devolvem indicadores_da_versao achatado (sem versao_publicada)', async () => {
        const [listada] = await investorPortalService.listOpportunities('spe');
        const criada = await investorPortalService.addOpportunity({ organization_id: 'spe', title: 'Garden' });
        const salva = await investorPortalService.updateOpportunity('op1', { title: 'Garden' });
        for (const o of [listada, criada, salva]) {
            expect(o.indicadores_da_versao).toEqual(IND);
            expect('versao_publicada' in o).toBe(false);
        }
    });

    it('sem versão: indicadores_da_versao null', async () => {
        q.st.resposta = { ...linha, versao_publicada: null };
        const [o] = await investorPortalService.listOpportunities('spe');
        expect(o.indicadores_da_versao).toBeNull();
    });

    it('indicadores_da_versao nunca vai no insert/update', async () => {
        await investorPortalService.addOpportunity({ organization_id: 'spe', title: 'G', indicadores_da_versao: IND });
        await investorPortalService.updateOpportunity('op1', { title: 'G', indicadores_da_versao: IND });
        expect(q.st.insert).not.toHaveProperty('indicadores_da_versao');
        expect(q.st.update).not.toHaveProperty('indicadores_da_versao');
        expect(q.st.update).toEqual({ title: 'G' });
        await investorPortalService.updateOpportunity('op1', { title: 'G', resultados_da_versao: { duracao: 1 }, local: { cidade: 'X', uf: null, obra_id: null } });
        expect(q.st.update).toEqual({ title: 'G' });
    });
});
