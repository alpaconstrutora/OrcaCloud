import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Área equivalente NBR 12721 no estudo (item 8.2 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): o estudo lê o
 * quadro gravado na Planta, não recalcula a norma.
 */

// Banco simulado: cada tabela devolve as linhas que casam com os filtros `eq`/`in`.
const banco = vi.hoisted(() => ({
    tabelas: {} as Record<string, Record<string, unknown>[]>,
    consultas: [] as { tabela: string; colunas: string; filtros: [string, unknown][] }[],
}));
vi.mock('../lib/supabase', () => {
    const consulta = (tabela: string) => {
        const filtros: [string, unknown][] = [];
        let colunas = '';
        const linhas = () => (banco.tabelas[tabela] ?? []).filter(l => filtros.every(([c, v]) => (Array.isArray(v) ? v.includes(l[c]) : l[c] === v)));
        const q = {
            select(c: string) { colunas = c; banco.consultas.push({ tabela, colunas, filtros }); return q; },
            eq(c: string, v: unknown) { filtros.push([c, v]); return q; },
            in(c: string, v: unknown[]) { filtros.push([c, v]); return q; },
            maybeSingle() { return Promise.resolve({ data: linhas()[0] ?? null, error: null }); },
            then(ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) { return Promise.resolve({ data: linhas(), error: null }).then(ok, erro); },
        };
        return q;
    };
    return { supabase: { from: consulta } };
});

import { areaEquivalenteDaVersao, type VersaoDoQuadro } from '../utils/imovibAreaEquivalente';
import { imovibService } from '../services/imovibService';

const versao = (over: Partial<VersaoDoQuadro> = {}): VersaoDoQuadro => ({ snapshotId: 's1', revisao: 1, aprovacoes: [], status: 'success', ...over });

describe('8.2 — área equivalente de uma versão', () => {
    it('o total é a soma de qi_18_floor_equivalent_total_raw do Quadro I', () => {
        const r = areaEquivalenteDaVersao(versao(), [{ qi_18_floor_equivalent_total_raw: 1_000.5 }, { qi_18_floor_equivalent_total_raw: 2_000.25 }]);
        expect(r?.total).toBeCloseTo(3_000.75, 6);
        expect(r?.revisao).toBe(1);
        expect(r?.situacao).toBe('Sem aprovação');
    });

    it('Quadro I vazio, nulo ou sem área conta como não medido, nunca zero', () => {
        expect(areaEquivalenteDaVersao(versao(), [])).toBeNull();
        expect(areaEquivalenteDaVersao(versao(), null)).toBeNull();
        expect(areaEquivalenteDaVersao(versao(), [{ qi_18_floor_equivalent_total_raw: 0 }])).toBeNull();
    });
});

describe('8.2 — imovibService.areaEquivalenteDaPlanta (quadro gravado)', () => {
    const quadro = (snapshot_id: string, qi18: number, status = 'success') => ({
        snapshot_id, study_id: 'planta-1', status, quadroI: [{ qi_18_floor_equivalent_total_raw: qi18 }],
    });
    beforeEach(() => {
        banco.consultas.length = 0;
        banco.tabelas = {
            blueprint_studies: [{ id: 'planta-1' }],
            blueprint_snapshot_nbr12721: [quadro('v2', 500), quadro('v3', 900)],
            blueprint_snapshots: [{ id: 'v2', revision: 2 }, { id: 'v3', revision: 3 }],
            blueprint_snapshot_nbr12721_aprovacoes: [{ snapshot_id: 'v2', tipo: 'TECNICA' }, { snapshot_id: 'v2', tipo: 'JURIDICA' }],
        };
    });

    it('escolhe a versão como o memorial (aprovada antes da revisão mais alta) e soma o Quadro I dela', async () => {
        const r = await imovibService.areaEquivalenteDaPlanta('planta-1');
        expect(r).toEqual({ snapshotId: 'v2', revisao: 2, total: 500, situacao: 'Técnica e jurídica aprovadas', status: 'success' });
    });

    it('baixa o Quadro I só da versão escolhida', async () => {
        await imovibService.areaEquivalenteDaPlanta('planta-1');
        const comQuadro = banco.consultas.filter(c => c.colunas.includes('quadroI'));
        expect(comQuadro).toHaveLength(1);
        expect(comQuadro[0].filtros).toEqual([['snapshot_id', 'v2']]);
        expect(banco.consultas.filter(c => c.tabela === 'blueprint_snapshot_nbr12721' && !c.colunas.includes('quadroI'))[0].colunas).not.toMatch(/saida->quadroI|quadroI/);
    });

    it('status do quadro: só "failed" é pendência bloqueante', async () => {
        banco.tabelas.blueprint_snapshot_nbr12721 = [quadro('v2', 500, 'failed')];
        expect(await imovibService.areaEquivalenteDaPlanta('planta-1')).toMatchObject({ status: 'failed' });
        banco.tabelas.blueprint_snapshot_nbr12721 = [{ ...quadro('v2', 500), status: null }];
        expect(await imovibService.areaEquivalenteDaPlanta('planta-1')).toMatchObject({ status: 'success' });
    });

    it('versão sem linha em blueprint_snapshots fica fora', async () => {
        banco.tabelas.blueprint_snapshots = [{ id: 'v3', revision: 3 }];
        expect(await imovibService.areaEquivalenteDaPlanta('planta-1')).toMatchObject({ snapshotId: 'v3', total: 900 });
    });

    it('sem quadro gravado: null (não medido)', async () => {
        banco.tabelas.blueprint_snapshot_nbr12721 = [];
        expect(await imovibService.areaEquivalenteDaPlanta('planta-1')).toBeNull();
    });

    it('Planta que quem lê não enxerga (outra organização, ou apagada): "sem_acesso", não "não medido"', async () => {
        banco.tabelas.blueprint_studies = [];
        expect(await imovibService.areaEquivalenteDaPlanta('planta-1')).toBe('sem_acesso');
        expect(banco.consultas.some(c => c.tabela === 'blueprint_snapshot_nbr12721')).toBe(false);
    });
});
