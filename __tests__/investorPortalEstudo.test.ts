import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { montarEstudoDoPortal } from '../services/investorPortalTokenService';
import { computeImovibMath } from '../utils/imovibMotor';
import { baseStudy, instancia } from './fixtures/imovibEstudos';

/**
 * Portal do Investidor por link com a mesma estrutura do app (item 0.6 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). `raw` imita o
 * `study` que fn_investor_portal_get_study devolve.
 */

// Formato do Bruninho em 11/11/2026: preço/m² 0 no bloco, preço só no espelho.
const rawSemPrecoNoBloco = (over: Record<string, any> = {}) => {
    const s = baseStudy();
    s.blocks[0].sales_price_sqm = 0;
    return { ...s, ...over };
};

describe('0.6 — estudo do portal por link', () => {
    it('resposta nova: o VGV sai do espelho, como no app', () => {
        const espelho = Array.from({ length: 40 }, (_, i) => instancia(`u${i}`, 'b1', 250_000));
        const estudo = montarEstudoDoPortal(rawSemPrecoNoBloco({ unit_instances: espelho, estrutura_do_empreendimento: null }))!;
        const r = computeImovibMath(estudo);
        expect(r.vgvBase).toBe(40 * 250_000);
        expect(estudo.estrutura?.origem).toBe('estudo');
    });

    it('resposta antiga (sem espelho nem estrutura): não quebra e calcula como antes', () => {
        const estudo = montarEstudoDoPortal(rawSemPrecoNoBloco())!;
        expect(estudo.unit_instances).toEqual([]);
        expect(computeImovibMath(estudo).vgvBase).toBe(0);
    });

    it('estudo vinculado: blocos vêm das torres e unidades do empreendimento', () => {
        const raw = rawSemPrecoNoBloco({
            unit_instances: [],
            estrutura_do_empreendimento: {
                // Só o nome: é o que a migration devolve a anon (ver o teste da migration abaixo).
                empreendimento: { name: 'Garden' },
                torres: [{ id: 't1', empreendimento_id: 'emp', name: 'Torre A', imovib_block_id: 'b1', construction_cost_sqm: null, sales_price_sqm: null, sort_order: 0 }],
                unidades: [
                    { id: 'x1', tower_id: 't1', typology: '2Q', private_area: 60, common_area: 15, price: 600_000, is_vendavel: true },
                    { id: 'x2', tower_id: 't1', typology: '2Q', private_area: 60, common_area: 15, price: 600_000, is_vendavel: true },
                ],
            },
        });
        const estudo = montarEstudoDoPortal(raw)!;
        expect(estudo.estrutura).toMatchObject({ origem: 'empreendimento', empreendimento_nome: 'Garden', torres: 1, unidades: 2 });
        expect(estudo.blocks?.map(b => b.name)).toEqual(['Torre A']);
        expect(computeImovibMath(estudo).totalPrivateArea).toBe(120);
        expect('estrutura_do_empreendimento' in estudo).toBe(false);
    });

    it('a migration devolve do empreendimento só o nome, e as chaves que o cliente lê', () => {
        const sql = readFileSync(resolve(__dirname, '../supabase/migrations/aplicar_20271111700000_investor_portal_estudo_mesma_estrutura.sql'), 'utf-8')
            .replace(/^\s*--.*$/gm, ' ');
        const emp = /'empreendimento',\s*jsonb_build_object\(([^)]*)\)/.exec(sql)?.[1] ?? '';
        expect([...emp.matchAll(/'([a-z_]+)'\s*,/g)].map(m => m[1])).toEqual(['name']);
        for (const chave of ["'torres'", "'unidades'", "'unit_instances'", "'estrutura_do_empreendimento'"]) expect(sql).toContain(chave);
    });

    it('4.4 — as outras fontes de capital chegam ao motor do portal: mesmo VPL do app', () => {
        const fontes = [{
            id: 'f1', study_id: 'estudo-teste', name: 'Mútuo', kind: 'mutuo', amount: 1_000_000, entry_month: 3,
            remuneration: 'juros', rate_annual: 12, profit_share_percent: null, amortization: 'BULLET',
            term_months: 24, grace_months: 0, sort_order: 0,
        }];
        const app = computeImovibMath(baseStudy({ funding_sources: fontes }));
        const portal = computeImovibMath(montarEstudoDoPortal({ ...baseStudy(), funding_sources: fontes, unit_instances: [], estrutura_do_empreendimento: null })!);
        expect(portal.vpl).toBe(app.vpl);
        expect(montarEstudoDoPortal(rawSemPrecoNoBloco())!.funding_sources).toEqual([]);
        // A função devolve as colunas que o motor lê das fontes.
        const sql = readFileSync(resolve(__dirname, '../supabase/migrations/aplicar_20271111960000_imovib_funding_sources.sql'), 'utf-8');
        for (const col of ['amount', 'entry_month', 'remuneration', 'rate_annual', 'profit_share_percent', 'amortization', 'term_months', 'grace_months'])
            expect(sql).toContain(`'${col}', f.${col}`);
        expect(sql).toContain("'funding_sources', v_fontes");
    });

    it('sem estudo na resposta devolve null', () => {
        expect(montarEstudoDoPortal(null)).toBeNull();
        expect(montarEstudoDoPortal(undefined)).toBeNull();
    });
});
