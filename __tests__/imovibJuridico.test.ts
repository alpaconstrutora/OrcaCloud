import { describe, it, expect } from 'vitest';
import { computeImovibMath } from '../hooks/useImovibMath';
import { baseStudy } from './fixtures/imovibEstudos';

/**
 * Estrutura jurídica no motor (item 9.1 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): RET sem patrimônio
 * de afetação avisa; com afetação, a devolução padrão no distrato vai a 50%.
 */
const temAviso = (s: ReturnType<typeof baseStudy>) => computeImovibMath(s).avisos.some(a => a.codigo === 'ret_sem_afetacao');
// Distrato com efeito para a devolução mudar o resultado.
const comDistrato = (over: Record<string, unknown> = {}) => baseStudy({ cancellation_rate_percent: 10, ...over });

describe('9.1 — RET exige patrimônio de afetação', () => {
    it('RET (e RET de interesse social) sem afetação gera o aviso, na aba Premissas', () => {
        expect(temAviso(baseStudy({ tax_regime: 'ret' }))).toBe(true);
        expect(temAviso(baseStudy({ tax_regime: 'ret_his', patrimonio_afetacao: false }))).toBe(true);
        const aviso = computeImovibMath(baseStudy({ tax_regime: 'ret' })).avisos.find(a => a.codigo === 'ret_sem_afetacao');
        expect(aviso?.aba).toBe('premises');
    });

    it('afetação não informada diz "não informado"; desmarcada diz "sem patrimônio de afetação"', () => {
        const msg = (over: Record<string, unknown>) => computeImovibMath(baseStudy({ tax_regime: 'ret', ...over })).avisos.find(a => a.codigo === 'ret_sem_afetacao')?.mensagem ?? '';
        expect(msg({})).toMatch(/não foi informado/);
        expect(msg({ patrimonio_afetacao: false })).toMatch(/sem patrimônio de afetação/);
    });

    it('RET com afetação, ou outro regime, não avisa', () => {
        expect(temAviso(baseStudy({ tax_regime: 'ret', patrimonio_afetacao: true }))).toBe(false);
        expect(temAviso(baseStudy({ tax_regime: 'presumido' }))).toBe(false);
        expect(temAviso(baseStudy())).toBe(false);
    });
});

describe('9.1 — devolução padrão no distrato com afetação', () => {
    const vpl = (over: Record<string, unknown>) => computeImovibMath(comDistrato(over)).vpl;

    it('campo vazio + afetação: calcula com 50% (Lei 13.786: retenção de até 50%)', () => {
        expect(vpl({ patrimonio_afetacao: true })).toBeCloseTo(vpl({ cancellation_refund_percent: 50 }), 6);
        expect(vpl({ patrimonio_afetacao: true })).not.toBeCloseTo(vpl({}), 0);
    });

    it('sem afetação o padrão continua 75% (nenhum número de estudo existente muda)', () => {
        expect(vpl({})).toBeCloseTo(vpl({ cancellation_refund_percent: 75 }), 6);
        expect(vpl({ patrimonio_afetacao: false })).toBeCloseTo(vpl({}), 6);
    });

    it('valor digitado vale, com ou sem afetação', () => {
        expect(vpl({ patrimonio_afetacao: true, cancellation_refund_percent: 75 })).toBeCloseTo(vpl({ cancellation_refund_percent: 75 }), 6);
    });
});
