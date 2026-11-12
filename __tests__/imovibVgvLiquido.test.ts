import { describe, it, expect } from 'vitest';
import { vgvLiquidoPassaDoBruto, notaDoVgvLiquido } from '../constants/imovibClassificacao';
import { computeImovibMath } from '../hooks/useImovibMath';
import { baseStudy } from './fixtures/imovibEstudos';

/** Pendência da Fase 1: a tela não dizia quando o VGV líquido passa do bruto (juros do pós-chaves). */
describe('VGV líquido acima do bruto', () => {
    it('com pós-chaves a juros sem inadimplência nem distrato, o líquido passa do bruto e a tela é avisada', () => {
        const r = computeImovibMath(baseStudy({
            revenue_post_handover_percent: 40, revenue_handover_percent: 30, post_handover_months: 60, post_handover_rate_monthly: 1.5,
            default_rate_percent: 0, cancellation_rate_percent: 0,
        }));
        expect(r.netVgvTotal).toBeGreaterThan(r.vgvTotal);
        expect(vgvLiquidoPassaDoBruto(r)).toBe(true);
    });

    it('no estudo comum, não', () => {
        expect(vgvLiquidoPassaDoBruto(computeImovibMath(baseStudy()))).toBe(false);
    });
});

describe('revisão — a nota diz o motivo certo', () => {
    it('com juros do pós-chaves: "inclui juros do pós-chaves"; sem juros: "acima do VGV bruto"', () => {
        expect(notaDoVgvLiquido({ post_handover_rate_monthly: 1.5 } as never)).toBe('inclui juros do pós-chaves');
        expect(notaDoVgvLiquido({ post_handover_rate_monthly: 0 } as never)).toBe('acima do VGV bruto');
    });
});
