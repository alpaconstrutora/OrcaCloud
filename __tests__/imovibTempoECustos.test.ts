import { describe, it, expect } from 'vitest';
import { computeImovibMath } from '../utils/imovibMotor';
import { baseStudy, rubrica } from './fixtures/imovibEstudos';

/**
 * Tempo e custos no motor (itens 5.2, 5.3, 5.5 e 5.6 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 * baseStudy: terreno de R$ 5 mi; obra do mês 6 ao 29; vendas do mês 1 ao 24.
 */

const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
type R = ReturnType<typeof computeImovibMath>;
const linha = (r: R, k: keyof R['monthlyFlows'][number]['linhas']) => r.monthlyFlows.map(f => f.linhas[k]);
const acumulado = (xs: number[]) => xs.reduce<number[]>((a, x) => [...a, (a[a.length - 1] ?? 0) + x], []);

describe('5.2 — terreno parcelado', () => {
    it('30% no mês 1 e 70% no mês 12: mesmo total, VPL maior e exposição menor até o mês 11', () => {
        const avista = computeImovibMath(baseStudy());
        const parcelado = computeImovibMath(baseStudy({ land_payment_schedule: [{ month: 1, percent: 30 }, { month: 12, percent: 70 }] }));
        expect(soma(linha(parcelado, 'terreno'))).toBeCloseTo(-5_000_000, 6);
        expect(linha(parcelado, 'terreno')[0]).toBeCloseTo(-1_500_000, 6);
        expect(linha(parcelado, 'terreno')[11]).toBeCloseTo(-3_500_000, 6);
        expect(parcelado.vpl).toBeGreaterThan(avista.vpl);
        for (let i = 0; i < 11; i++) expect(parcelado.monthlyFlows[i].acc).toBeGreaterThan(avista.monthlyFlows[i].acc);
        expect(parcelado.avisos).toEqual([]);
    });

    it('vazio: 100% no mês da aquisição; rubrica de terreno sai na 1ª parcela', () => {
        const r = computeImovibMath(baseStudy({ acquisition_month: 3, capex_items: [rubrica('1. Terreno', 'ITBI', 'percent', 3, 'terreno')] }));
        expect(linha(r, 'terreno')[2]).toBe(-5_000_000);
        expect(linha(r, 'terreno')[0]).toBe(0);
        expect(linha(r, 'rubricasTerreno')[2]).toBeCloseTo(-150_000, 6);
        const p = computeImovibMath(baseStudy({ land_payment_schedule: [{ month: 4, percent: 50 }, { month: 2, percent: 50 }], capex_items: [rubrica('1. Terreno', 'ITBI', 'percent', 3, 'terreno')] }));
        expect(linha(p, 'rubricasTerreno')[1]).toBeCloseTo(-150_000, 6);
    });

    it('parcelas somando 90%: avisa e calcula como veio', () => {
        const r = computeImovibMath(baseStudy({ land_payment_schedule: [{ month: 1, percent: 40 }, { month: 6, percent: 50 }] }));
        expect(soma(linha(r, 'terreno'))).toBeCloseTo(-4_500_000, 6);
        expect(r.avisos.find(a => a.codigo === 'terreno_nao_soma_100')?.aba).toBe('premises');
    });

    it('parcelas todas em 0%: calcula como veio (terreno não sai) e avisa — nunca volta à vista em silêncio', () => {
        const r = computeImovibMath(baseStudy({ land_payment_schedule: [{ month: 3, percent: 0 }] }));
        expect(soma(linha(r, 'terreno'))).toBe(0);
        expect(r.avisos.find(a => a.codigo === 'terreno_nao_soma_100')).toBeTruthy();
    });

    it('parcela depois do fim do fluxo estende o estudo', () => {
        const base = computeImovibMath(baseStudy());
        const r = computeImovibMath(baseStudy({ land_payment_schedule: [{ month: 1, percent: 50 }, { month: base.duration + 6, percent: 50 }] }));
        expect(r.duration).toBe(base.duration + 6);
    });
});

describe('5.3 — curva de desembolso no motor', () => {
    it('curva S: mesmo custo total, obra concentrada no meio; a liberação da dívida acompanha', () => {
        const s = baseStudy({ cost_curve_type: 'curva_s', funding_debt_percent: 60 });
        const r = computeImovibMath(s);
        const lin = computeImovibMath(baseStudy({ funding_debt_percent: 60 }));
        expect(soma(linha(r, 'obra'))).toBeCloseTo(soma(linha(lin, 'obra')), 4);
        const obra = linha(r, 'obra');
        expect(Math.abs(obra[5])).toBeLessThan(Math.abs(obra[17]));
        r.monthlyFlows.forEach((f, i) => expect(f.linhas.liberacaoDivida).toBeCloseTo(-(f.linhas.obra + f.linhas.rubricasObra) * 0.6, 6));
        expect(r.avisos).toEqual([]);
    });

    it('personalizada acompanha o prazo: igual à linear com +6 meses de obra (choque do tornado)', () => {
        const igualLinear = { cost_curve_type: 'custom', cost_curve_custom: Array.from({ length: 24 }, () => 100 / 24) };
        const lin = computeImovibMath(baseStudy({ construction_duration_months: 30 }));
        const cus = computeImovibMath(baseStudy({ ...igualLinear, construction_duration_months: 30 }));
        expect(cus.vpl).toBeCloseTo(lin.vpl, 2);
    });

    it('personalizada que não soma 100 avisa e distribui na proporção', () => {
        const r = computeImovibMath(baseStudy({ cost_curve_type: 'custom', cost_curve_custom: Array.from({ length: 24 }, () => 2) }));
        const lin = computeImovibMath(baseStudy());
        expect(soma(linha(r, 'obra'))).toBeCloseTo(soma(linha(lin, 'obra')), 4);
        expect(r.avisos.find(a => a.codigo === 'curva_de_desembolso_nao_soma_100')?.aba).toBe('capex');
    });
});

describe('5.5 — momento de cada rubrica', () => {
    const com = (timing: string | null, extra: Record<string, unknown> = {}) =>
        computeImovibMath(baseStudy({ capex_items: [{ ...rubrica('2. Projetos e Consultorias', 'Projeto', 'currency', 100_000, 'obra'), timing, ...extra }] }));

    it('pré-obra sem mês antes da obra (aquisição no início da obra ou depois): avisa onde caiu', () => {
        // Pendência da Fase 5 do plano 2026-11-11: caía no mês da aquisição sem aviso.
        const r = computeImovibMath(baseStudy({ construction_start_month: 1, capex_items: [{ ...rubrica('2. Projetos e Consultorias', 'Projeto', 'currency', 100_000, 'obra'), timing: 'pre_obra' }] }));
        const aviso = r.avisos.find(a => a.codigo === 'pre_obra_sem_meses');
        expect(aviso?.aba).toBe('premises');
        expect(aviso?.mensagem).toMatch(/Projeto/);
        expect(aviso?.mensagem).toMatch(/mês 1/);
        // Com meses antes da obra, nada a avisar.
        expect(com('pre_obra').avisos.some(a => a.codigo === 'pre_obra_sem_meses')).toBe(false);
        // Pré-obra sem valor não avisa.
        const zero = computeImovibMath(baseStudy({ construction_start_month: 1, capex_items: [{ ...rubrica('2. Projetos e Consultorias', 'Projeto', 'currency', 0, 'obra'), timing: 'pre_obra' }] }));
        expect(zero.avisos.some(a => a.codigo === 'pre_obra_sem_meses')).toBe(false);
    });

    it('pré-obra: sai inteira antes do início da obra, em partes iguais desde a aquisição, e reduz o VPL frente a "obra"', () => {
        const pre = com('pre_obra');
        const obra = com('obra');
        const r = linha(pre, 'rubricasObra');
        expect(soma(r.slice(0, 5))).toBeCloseTo(-100_000, 6);
        expect(soma(r.slice(5))).toBeCloseTo(0, 6);
        r.slice(0, 5).forEach(x => expect(x).toBeCloseTo(-20_000, 6));
        expect(pre.vpl).toBeLessThan(obra.vpl);
    });

    it('sem momento calcula igual a hoje; "obra" igual a sem momento numa rubrica de base obra', () => {
        expect(com(null).vpl).toBe(computeImovibMath(baseStudy({ capex_items: [rubrica('2. Projetos e Consultorias', 'Projeto', 'currency', 100_000, 'obra')] })).vpl);
        expect(com('obra').vpl).toBeCloseTo(com(null).vpl, 6);
    });

    it('lançamento: nos três meses até o início das vendas (cortado no mês 1)', () => {
        const r = computeImovibMath(baseStudy({ sales_start_month: 5, capex_items: [{ ...rubrica('5. Marketing e Vendas', 'Stand', 'currency', 90_000, 'vgv'), timing: 'lancamento' }] }));
        const v = linha(r, 'rubricasVendas');
        expect(v.slice(2, 5).map(x => Math.round(x))).toEqual([-30_000, -30_000, -30_000]);
        expect(soma(v)).toBeCloseTo(-90_000, 6);
    });

    it('pós-obra: em timing_months meses depois do fim da obra e estende o estudo', () => {
        const base = computeImovibMath(baseStudy());
        const r = com('pos_obra', { timing_months: 40 });
        const v = linha(r, 'rubricasObra');
        expect(soma(v.slice(0, 29))).toBe(0);
        expect(v[29]).toBeCloseTo(-2_500, 6);
        expect(r.duration).toBe(29 + 40);
        expect(r.duration).toBeGreaterThan(base.duration);
    });

    it('vendas: segue a curva de vendas', () => {
        const r = com('vendas');
        const v = linha(r, 'rubricasObra');
        expect(soma(v)).toBeCloseTo(-100_000, 6);
        v.slice(0, 24).forEach(x => expect(x).toBeCloseTo(-100_000 / 24, 6));
    });

    it('rubrica em % do VGV ignora o momento (é dedução sobre a receita de cada mês)', () => {
        const pct = (timing: string | null) => computeImovibMath(baseStudy({ capex_items: [{ ...rubrica('5. Marketing e Vendas', 'Comissão', 'percent', 5, 'vgv'), timing }] })).vpl;
        expect(pct('pos_obra')).toBe(pct(null));
    });
});

describe('5.5 — pós-obra não mexe na dívida nem nas fontes (revisão da Fase 5)', () => {
    // A base de comparação tem a mesma rubrica sem momento: qualquer rubrica liga o modo de rubricas (impostos e corretagem vêm delas).
    const posObra = (valor: number, timing: string | null = 'pos_obra') => ({ ...rubrica('10. Pós-obra', 'Manutenção e garantia', 'currency', valor, 'obra'), timing });
    const mutuo = { id: 'f1', study_id: 'estudo-teste', name: 'Mútuo', kind: 'mutuo', amount: 1_000_000, entry_month: 3, remuneration: 'juros', rate_annual: 12, profit_share_percent: null, amortization: 'BULLET', term_months: 36, grace_months: 0, sort_order: 0 };

    it('rubrica de pós-obra com valor 0 (o botão cria assim) não muda duração, VPL nem TIR', () => {
        for (const over of [
            { funding_debt_percent: 80, financing_amortization: 'repasse' },
            { funding_debt_percent: 80, financing_interest_mode: 'paga_mensal' },
            { funding_sources: [mutuo] },
        ]) {
            const sem = computeImovibMath(baseStudy({ ...over, capex_items: [posObra(0, null)] }));
            const com = computeImovibMath(baseStudy({ ...over, capex_items: [posObra(0)] }));
            expect(com.duration).toBe(sem.duration);
            expect(com.vpl).toBe(sem.vpl);
        }
    });

    it('com valor, o pós-obra estende o fluxo, mas a dívida e o mútuo são quitados no fim das receitas', () => {
        const over = { funding_debt_percent: 80, financing_amortization: 'repasse', funding_sources: [mutuo] };
        const sem = computeImovibMath(baseStudy({ ...over, capex_items: [posObra(0, null)] }));
        const com = computeImovibMath(baseStudy({ ...over, capex_items: [posObra(120_000)] }));
        expect(com.duration).toBeGreaterThan(sem.duration);
        const ultimo = sem.duration - 1;
        expect(com.monthlyFlows[ultimo].linhas.pagamentoDaDivida).toBeCloseTo(sem.monthlyFlows[ultimo].linhas.pagamentoDaDivida, 6);
        expect(com.monthlyFlows[ultimo].linhas.remuneracaoDeTerceiros).toBeCloseTo(sem.monthlyFlows[ultimo].linhas.remuneracaoDeTerceiros, 6);
        com.monthlyFlows.slice(sem.duration).forEach(f => {
            expect(Math.abs(f.linhas.pagamentoDaDivida)).toBe(0);
            expect(Math.abs(f.linhas.remuneracaoDeTerceiros)).toBe(0);
        });
    });
});

describe('5.6 — custo do estoque depois da obra', () => {
    it('R$ 800 por unidade/mês: só depois do fim da obra e zera quando o estoque acaba', () => {
        // Vendas terminam 12 meses depois da obra (mês 41).
        const s = baseStudy({ sales_duration_months: 41, stock_carrying_cost_unit_month: 800 });
        const r = computeImovibMath(s);
        const c = linha(r, 'carregamentoDoEstoque');
        expect(soma(c.slice(0, 29))).toBe(0);
        expect(c[29]).toBeLessThan(0);
        // 40 unidades; no mês 30 já se venderam 30 de 41 meses → 40 × 11/41 unidades em estoque.
        expect(c[29]).toBeCloseTo(-800 * 40 * (11 / 41), 4);
        expect(c[40]).toBeCloseTo(0, 6);
        expect(soma(c)).toBeLessThan(0);
    });

    it('a permuta física sai das unidades em estoque (as do espelho PERMUTADO já saem)', () => {
        const c = linha(computeImovibMath(baseStudy({ sales_duration_months: 41, stock_carrying_cost_unit_month: 800, swap_physical_percent: 20 })), 'carregamentoDoEstoque');
        expect(c[29]).toBeCloseTo(-800 * 40 * 0.8 * (11 / 41), 4);
    });

    it('sem custo informado, a linha fica zerada', () => {
        const r = computeImovibMath(baseStudy({ sales_duration_months: 41 }));
        expect(linha(r, 'carregamentoDoEstoque').every(x => x === 0)).toBe(true);
    });
});
