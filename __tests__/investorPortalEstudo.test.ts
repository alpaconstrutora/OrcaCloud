import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { montarEstudoDoPortal } from '../services/investorPortalTokenService';
import { computeImovibMath } from '../utils/imovibMotor';
import { estudoComPrazoDoPortal } from '../utils/imovibVariacoes';
import { calcularIndicadores } from '../utils/imovibIndicadores';
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
        const sql = readFileSync(resolve(__dirname, '../supabase/migrations/aplicar_20271111980000_imovib_funding_sources.sql'), 'utf-8');
        for (const col of ['amount', 'entry_month', 'remuneration', 'rate_annual', 'profit_share_percent', 'amortization', 'term_months', 'grace_months'])
            expect(sql).toContain(`'${col}', f.${col}`);
        expect(sql).toContain("'funding_sources', v_fontes");
    });

    it('sem estudo na resposta devolve null', () => {
        expect(montarEstudoDoPortal(null)).toBeNull();
        expect(montarEstudoDoPortal(undefined)).toBeNull();
    });
});

describe('10.6 — o portal calcula o mesmo número do app', () => {
    it('sem mexer no prazo: VGV líquido, TIR e prazo iguais aos do Resumo (mesmo com as durações vazias)', () => {
        const estudo = baseStudy({ construction_duration_months: null, sales_duration_months: null });
        const app = computeImovibMath(estudo);
        const portal = computeImovibMath(estudoComPrazoDoPortal(estudo, 0));
        expect(portal.netVgvTotal).toBe(app.netVgvTotal);
        expect(portal.annualIrr).toBe(app.annualIrr);
        expect(portal.duration).toBe(app.duration);
    });

    it('atrasar o prazo vale também quando a duração está vazia (antes o controle não fazia nada)', () => {
        const estudo = baseStudy({ construction_duration_months: null, sales_duration_months: null });
        expect(computeImovibMath(estudoComPrazoDoPortal(estudo, 6)).duration).toBeGreaterThan(computeImovibMath(estudo).duration);
    });

    it('payback e múltiplo do portal são os do app', () => {
        const estudo = baseStudy();
        const r = computeImovibMath(estudoComPrazoDoPortal(estudo, 0));
        const app = calcularIndicadores(computeImovibMath(estudo), 12);
        const portal = calcularIndicadores(r, 12);
        expect(portal.paybackSimplesMes).toBe(app.paybackSimplesMes);
        expect(portal.multiploDoCapital).toBe(app.multiploDoCapital);
    });
});

describe('0.6 (pendência) — contrato com a função publicada, e não só com o raw escrito à mão', () => {
    // A definição que vale é a da migration mais recente que recria a função.
    const pasta = resolve(__dirname, '../supabase/migrations');
    const ultima = readdirSync(pasta)
        .filter(f => f.endsWith('.sql') && /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_investor_portal_get_study/i.test(readFileSync(`${pasta}/${f}`, 'utf-8')))
        .sort((a, b) => (a.match(/\d{14}/)?.[0] ?? '').localeCompare(b.match(/\d{14}/)?.[0] ?? ''))
        .pop()!;
    const sql = readFileSync(`${pasta}/${ultima}`, 'utf-8');
    const chave = (k: string) => new RegExp(`'${k}'\\s*,`).test(sql);

    it('monta as chaves que montarEstudoDoPortal consome', () => {
        for (const k of ['study', 'unit_instances', 'blocks', 'capex_items', 'funding_sources', 'estrutura_do_empreendimento', 'torres', 'unidades']) {
            expect(chave(k), k).toBe(true);
        }
    });

    it('torres e unidades trazem os campos que a estrutura do motor usa', () => {
        for (const k of ['imovib_block_id', 'construction_cost_sqm', 'sales_price_sqm', 'sort_order', 'tower_id', 'typology', 'private_area', 'common_area', 'price', 'is_vendavel']) {
            expect(chave(k), k).toBe(true);
        }
    });

    it('tira do link toda coluna interna de governança (parecer, notas, mínimos)', () => {
        const fora = /row_to_json\(s\)::jsonb\s*-\s*ARRAY\[([^\]]*)\]/i.exec(sql)?.[1] ?? '';
        for (const k of ['premise_notes', 'recommendation', 'recommendation_notes', 'recommended_by', 'recommended_at', 'recommended_by_user_id',
            'recommendation_snapshot', 'hurdle_irr_spread', 'hurdle_margin_percent', 'hurdle_max_exposure']) {
            expect(fora, k).toContain(`'${k}'`);
        }
    });
});
