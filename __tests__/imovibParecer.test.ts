import { describe, it, expect } from 'vitest';
import { criteriosDoParecer } from '../utils/imovibParecer';
import { computeImovibMath } from '../hooks/useImovibMath';
import { calcularIndicadores } from '../utils/imovibIndicadores';
import { baseStudy } from './fixtures/imovibEstudos';

/**
 * Parecer e critérios (item 10.3 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): quatro critérios com
 * o valor do estudo, o mínimo e se atende. O sistema não escolhe o parecer.
 */
const criterios = (over: Record<string, unknown> = {}, rOver: Record<string, unknown> = {}) => {
    const s = baseStudy(over);
    const r = { ...computeImovibMath(s), ...rOver };
    return criteriosDoParecer(s, r, calcularIndicadores(r, s.discount_rate ?? 12));
};
const de = (lista: ReturnType<typeof criterios>, id: string) => lista.find(c => c.id === id)!;

describe('10.3 — critérios do parecer', () => {
    it('quatro critérios, na ordem', () => {
        expect(criterios().map(c => c.id)).toEqual(['tir_acima_da_tma', 'margem_minima', 'exposicao_maxima', 'vpl_positivo']);
    });

    it('TIR NaN deixa o critério da TIR com atende nulo, e não falso', () => {
        const c = de(criterios({}, { annualIrr: NaN }), 'tir_acima_da_tma');
        expect(c.valor).toBeNull();
        expect(c.atende).toBeNull();
    });

    it('TIR acima da TMA + folga atende; abaixo não', () => {
        expect(de(criterios({ discount_rate: 12 }, { annualIrr: 20 }), 'tir_acima_da_tma')).toMatchObject({ valor: 20, minimo: 12, atende: true });
        expect(de(criterios({ discount_rate: 12, hurdle_irr_spread: 10 }, { annualIrr: 20 }), 'tir_acima_da_tma')).toMatchObject({ minimo: 22, atende: false });
    });

    it('exposição sem mínimo definido fica nula; com mínimo compara o módulo da exposição', () => {
        expect(de(criterios(), 'exposicao_maxima')).toMatchObject({ minimo: null, atende: null });
        expect(de(criterios({ hurdle_max_exposure: 1 }, { maxExposure: -5_000_000 }), 'exposicao_maxima')).toMatchObject({ valor: 5_000_000, minimo: 1, atende: false });
        expect(de(criterios({ hurdle_max_exposure: 10_000_000 }, { maxExposure: -5_000_000 }), 'exposicao_maxima').atende).toBe(true);
    });

    it('margem mínima: padrão de 15% editável; sem VGV fica nulo', () => {
        expect(de(criterios(), 'margem_minima').minimo).toBe(15);
        expect(de(criterios({ hurdle_margin_percent: 40 }), 'margem_minima').minimo).toBe(40);
        expect(de(criterios({ blocks: [] }), 'margem_minima')).toMatchObject({ valor: null, atende: null });
    });

    it('VPL positivo: zero não atende', () => {
        expect(de(criterios({}, { vpl: 0 }), 'vpl_positivo').atende).toBe(false);
        expect(de(criterios({}, { vpl: 1 }), 'vpl_positivo').atende).toBe(true);
    });
});

describe('pendência da Fase 10 — TIR inexistente porque o fluxo é de um lado só', () => {
    const fluxo = (net: number[]) => ({ monthlyFlows: net.map((n, i) => ({ month: i + 1, net: n })) as never, annualIrr: NaN });
    it('só saída de caixa (nunca recupera): a TIR não atende — reprova, não "sem como avaliar"', () => {
        expect(de(criterios({}, fluxo([-100, -50, -10])), 'tir_acima_da_tma').atende).toBe(false);
    });
    it('só entrada de caixa (retorno sem capital): atende', () => {
        expect(de(criterios({}, fluxo([10, 20, 30])), 'tir_acima_da_tma').atende).toBe(true);
    });
    it('fluxo misto sem TIR calculável continua sem como avaliar', () => {
        expect(de(criterios({}, fluxo([-100, 300, -250])), 'tir_acima_da_tma').atende).toBeNull();
    });
});
