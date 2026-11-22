/**
 * Fase D do plano docs/planos/2026-11-21-portal-do-investidor-consolidacao.md.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
import { rateioPorCotas } from '../components/investor/DistribuirResultadoPanel';
import { linhasDoAcompanhamento } from '../utils/acompanhamentoDoInvestidor';

const sql = readFileSync(join(__dirname, '../supabase/migrations/aplicar_20271121999800_portal_investidor_fase_d.sql'), 'utf8').replace(/--.*$/gm, '');

describe('D2 — distribuir resultado pelas cotas', () => {
    it('a prévia é o rateio do banco: centavos, sobra para o maior sócio, soma exata', () => {
        const r = rateioPorCotas(1000, [{ id: 'b', ownership_pct: 66.67 }, { id: 'a', ownership_pct: 33.33 }]);
        expect(r).toEqual([{ id: 'a', valor: 333.3 }, { id: 'b', valor: 666.7 }]);
        const tres = rateioPorCotas(100, [{ id: 'a', ownership_pct: 1 }, { id: 'b', ownership_pct: 1 }, { id: 'c', ownership_pct: 1 }]);
        expect(tres.reduce((s, p) => s + p.valor, 0)).toBeCloseTo(100, 10);
        expect(tres.map(p => p.valor)).toEqual([33.33, 33.33, 33.34]);
    });
    it('sem sócio com participação ou sem valor: nada', () => {
        expect(rateioPorCotas(100, [{ id: 'a', ownership_pct: 0 }])).toEqual([]);
        expect(rateioPorCotas(0, [{ id: 'a', ownership_pct: 10 }])).toEqual([]);
    });
    it('o banco grava um lançamento liquidado por sócio, pela RLS de quem chama', () => {
        expect(sql).toMatch(/FUNCTION public\.fn_spe_distribuir_resultado[\s\S]*SECURITY INVOKER/);
        expect(sql).toMatch(/ORDER BY ownership_pct, investor_id/);
        expect(sql).toMatch(/'liquidado'/);
    });
});

describe('D3 — várias organizações', () => {
    it('comunicados, relatórios e a resposta valem para todas as orgs do investidor', () => {
        for (const f of ['fn_investor_portal_get_reports', 'fn_investor_portal_get_announcements']) {
            const corpo = sql.slice(sql.indexOf(`FUNCTION public.${f}(`));
            expect(corpo.slice(0, 2500)).toMatch(/fn_orgs_do_investidor\(v_inv_id\) \|\| v_tok\.org_id/);
            expect(corpo.slice(0, 2500)).toMatch(/'organization_name'/);
        }
        expect(sql).toMatch(/organization_id = ANY \(public\.fn_orgs_do_investidor\(v_tok\.investor_id\) \|\| v_tok\.org_id\)\s+AND published_at IS NOT NULL/);
    });
    it('as migrations não têm prefixo repetido com esta', () => {
        const pasta = resolve(__dirname, '../supabase/migrations');
        const prefixos = readdirSync(pasta).map(f => f.match(/\d{14}/)?.[0]).filter(p => p === '20271121999800');
        expect(prefixos).toHaveLength(1);
    });
});

describe('D1 — acompanhamento (só totais)', () => {
    it('previsto da versão × realizado da obra e das vendas', () => {
        const l = linhasDoAcompanhamento({ vgv: 10_000_000, custo_total: 6_000_000 },
            { obra_nome: 'Garden', avanco: 25, custo_realizado: 1_500_000, entradas: 0, vendido: 2_500_000, unidades: 40, unidades_vendidas: 10 });
        expect(l.map(x => [x.rotulo, x.fracao])).toEqual([
            ['Vendas (VGV)', 0.25], ['Unidades vendidas', 0.25], ['Custo (obra e terreno)', 0.25], ['Avanço físico da obra', 0.25],
        ]);
    });
    it('a RPC do link não devolve lançamento nem negociação, só somas', () => {
        const corpo = sql.slice(sql.indexOf('FUNCTION public.fn_investor_portal_get_acompanhamento('));
        expect(corpo).toMatch(/sum\(m\.saidas\)/);
        expect(corpo).not.toMatch(/jsonb_agg/);
    });
});
