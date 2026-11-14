import { describe, it, expect } from 'vitest';
import { computeImovibMath } from '../hooks/useImovibMath';
import { baseStudy } from './fixtures/imovibEstudos';

/**
 * Pendências da Fase 1 e da Fase 4 (plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md,
 * "Pendências depois do plano"): o motor ajustava premissas fora da faixa sem avisar.
 * Regra 5 do plano: calcula como dá, e o aviso diz o que foi ajustado e onde corrigir.
 */
const aviso = (over: Record<string, unknown>, codigo: string) =>
    computeImovibMath(baseStudy(over)).avisos.find(a => a.codigo === codigo);

describe('ajustes que o cálculo faz passam a avisar', () => {
    it('lançamento acima de 100% (ou abaixo de 0) vale como 100% (ou 0%)', () => {
        const a = aviso({ sales_curve_type: 'lancamento', sales_launch_percent: 130, sales_launch_months: 3 }, 'premissa_ajustada');
        expect(a?.mensagem).toMatch(/lançamento de 130% vale como 100%/);
        expect(a?.aba).toBe('receitas');
    });

    it('meses do lançamento maiores que o prazo de vendas: vende igual em todos os meses', () => {
        expect(aviso({ sales_curve_type: 'lancamento', sales_launch_percent: 30, sales_launch_months: 99 }, 'premissa_ajustada')?.mensagem)
            .toMatch(/meses do lançamento \(99\).*prazo de vendas/i);
    });

    it('VSO fora de 0 a 100%', () => {
        expect(aviso({ sales_curve_type: 'vso', sales_vso_percent: 150 }, 'premissa_ajustada')?.mensagem).toMatch(/VSO de 150% vale como 100%/);
    });

    it('pesos da curva personalizada além do prazo de vendas ficam fora; negativos valem 0', () => {
        const pesos = Array.from({ length: 40 }, () => 1);
        expect(aviso({ sales_curve_type: 'custom', sales_curve_custom: pesos }, 'premissa_ajustada')?.mensagem).toMatch(/16 pesos .*além do prazo/); // 40 pesos, prazo de 24 meses
        expect(aviso({ sales_curve_type: 'custom', sales_curve_custom: [5, -1, 5] }, 'premissa_ajustada')?.mensagem).toMatch(/pesos negativos .*valem 0/);
    });

    it('defasagens negativas; a da liberação aponta para a aba Capital', () => {
        expect(aviso({ cancellation_lag_months: -3 }, 'premissa_ajustada')?.mensagem).toMatch(/meses até o distrato \(-3\) valem 0/i);
        const capital = aviso({ financing_release_lag_months: -2 }, 'premissa_ajustada_capital');
        expect(capital?.mensagem).toMatch(/defasagem da liberação \(-2\) vale 0/i);
        expect(capital?.aba).toBe('capital');
        expect(aviso({ financing_release_lag_months: -2 }, 'premissa_ajustada')).toBeUndefined();
    });

    it('revisão: permuta acima de 100% NÃO diz "vale como 100%" (o motor usa o valor; receita_liquida_negativa avisa)', () => {
        const r = computeImovibMath(baseStudy({ swap_financial_percent: 120 }));
        expect(r.avisos.find(a => a.codigo === 'premissa_ajustada')).toBeUndefined();
        expect(r.avisos.some(a => a.codigo === 'receita_liquida_negativa')).toBe(true);
    });

    it('revisão: lançamento com meses iguais ao prazo ou zerados avisa; meses além do prazo não fala do %', () => {
        expect(aviso({ sales_curve_type: 'lancamento', sales_launch_percent: 30, sales_launch_months: 24 }, 'premissa_ajustada')?.mensagem).toMatch(/vende igual em todos os meses/);
        expect(aviso({ sales_curve_type: 'lancamento', sales_launch_percent: 30, sales_launch_months: 0 }, 'premissa_ajustada')?.mensagem).toMatch(/vende igual em todos os meses/);
        expect(aviso({ sales_curve_type: 'lancamento', sales_launch_percent: 130, sales_launch_months: 99 }, 'premissa_ajustada')?.mensagem).not.toMatch(/130%/);
    });

    it('revisão: zeros no fim da curva personalizada não são "pesos fora do cálculo"', () => {
        const pesos = [...Array.from({ length: 24 }, () => 1), 0, 0, 0];
        expect(aviso({ sales_curve_type: 'custom', sales_curve_custom: pesos }, 'premissa_ajustada')).toBeUndefined();
    });

    it('revisão: distrato e deságio da revenda fora de 0–100% avisam; devolução acima de 100% também', () => {
        expect(aviso({ cancellation_rate_percent: 150 }, 'premissa_ajustada')?.mensagem).toMatch(/Distrato de 150% vale como 100%/);
        expect(aviso({ cancellation_resale_discount_percent: -5 }, 'premissa_ajustada')?.mensagem).toMatch(/Deságio da revenda de -5% vale como 0%/);
        expect(aviso({ cancellation_refund_percent: 120 }, 'premissa_ajustada')?.mensagem).toMatch(/Devolução ao comprador de 120%/);
    });

    it('estudo sem nada fora da faixa não avisa', () => {
        expect(aviso({}, 'premissa_ajustada')).toBeUndefined();
    });
});

describe('distrato sem revenda (pendência da Fase 1)', () => {
    it('avisa que a unidade distratada sai do estoque e não é vendida de novo', () => {
        const a = aviso({ cancellation_rate_percent: 10, cancellation_resale: false }, 'distrato_sem_revenda');
        expect(a?.mensagem).toMatch(/não é vendida de novo/);
        expect(a?.aba).toBe('receitas');
        expect(aviso({ cancellation_rate_percent: 10, cancellation_resale: true }, 'distrato_sem_revenda')).toBeUndefined();
        expect(aviso({ cancellation_rate_percent: 0, cancellation_resale: false }, 'distrato_sem_revenda')).toBeUndefined();
    });

    it('revisão: sem venda antes das chaves (ninguém distrata), não avisa', () => {
        expect(aviso({ cancellation_rate_percent: 10, cancellation_resale: false, sales_start_month: 30 }, 'distrato_sem_revenda')).toBeUndefined();
    });
});

describe('custo de obra negativo (pendência da Fase 4)', () => {
    it('avisa: o financiamento não libera nada sobre custo negativo', () => {
        const s = baseStudy({ funding_debt_percent: 60 });
        s.blocks[0].construction_cost_sqm = -100;
        const a = computeImovibMath(s).avisos.find(x => x.codigo === 'custo_de_obra_negativo');
        expect(a?.mensagem).toMatch(/custo de obra está negativo/i);
        expect(a?.aba).toBe('capex');
    });
});
