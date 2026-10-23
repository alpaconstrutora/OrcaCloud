import { describe, it, expect } from 'vitest';
import {
    motivoBloqueioRecorrente,
    ficaEmAbertoSemValor,
    valorDaRubrica,
    valorRecorrente,
} from '../lib/payrollRubricaRecorrente';

const r = (extra: Record<string, unknown> = {}) => ({
    code: 'X', calculation_type: 'manual', category: null, is_clt_mandatory: false, ...extra,
}) as Parameters<typeof motivoBloqueioRecorrente>[0];

describe('rubrica recorrente do colaborador — o que pode, o que trava', () => {
    it('trava o que a própria folha calcula, o Padrão CLT e a rescisão', () => {
        expect(motivoBloqueioRecorrente(r({ code: 'INSS', category: 'tax', is_clt_mandatory: true }))).toBe('Calculada pela própria folha');
        expect(motivoBloqueioRecorrente(r({ code: 'IRRF', category: 'tax' }))).toBe('Calculada pela própria folha');
        expect(motivoBloqueioRecorrente(r({ code: 'FGTS', category: 'tax' }))).toBe('Calculada pela própria folha');
        expect(motivoBloqueioRecorrente(r({ code: 'SALARIO', category: 'base', is_clt_mandatory: true }))).toBe('Padrão CLT: já entra para todo CLT');
        expect(motivoBloqueioRecorrente(r({ code: 'OUTRA_CLT', is_clt_mandatory: true }))).toBe('Padrão CLT: já entra para todo CLT');
        expect(motivoBloqueioRecorrente(r({ code: 'FGTS_MULTA', category: 'termination' }))).toBe('Só entra na rescisão');
    });

    it('libera as manuais e as de cálculo próprio', () => {
        expect(motivoBloqueioRecorrente(r({ code: 'GRATIFICACAO' }))).toBeNull();
        expect(motivoBloqueioRecorrente(r({ code: 'ADIANTAMENTO', calculation_type: 'percentage' }))).toBeNull();
        expect(motivoBloqueioRecorrente(r({ code: 'FALTA', calculation_type: 'formula' }))).toBeNull();
    });

    it('só a manual liberada fica em aberto sem valor (valor variável, lançado no mês)', () => {
        expect(ficaEmAbertoSemValor(r({ code: 'GRATIFICACAO' }))).toBe(true);
        expect(ficaEmAbertoSemValor(r({ code: 'SEM_TIPO', calculation_type: undefined }))).toBe(true);
        expect(ficaEmAbertoSemValor(r({ code: 'ADIANTAMENTO', calculation_type: 'percentage' }))).toBe(false);
        expect(ficaEmAbertoSemValor(r({ code: 'FIXA', calculation_type: 'fixed' }))).toBe(false);
        expect(ficaEmAbertoSemValor(r({ code: 'IRRF', category: 'tax' }))).toBe(false);
    });

    it('descreve o cálculo próprio da rubrica (placeholder do campo)', () => {
        expect(valorDaRubrica(r({ calculation_type: 'percentage', calculation_config: { percentage: 0.4 } }))).toBe('40% do salário (da rubrica)');
        expect(valorDaRubrica(r({ calculation_type: 'percentage', calculation_config: { percentage: 0.015 } }))).toBe('1,5% do salário (da rubrica)');
        expect(valorDaRubrica(r({ calculation_type: 'fixed', calculation_config: { amount: 150 } }))).toBe('R$ 150,00 (da rubrica)');
        expect(valorDaRubrica(r({ calculation_type: 'formula' }))).toBe('Fórmula da rubrica');
        expect(valorDaRubrica(r())).toBe('');
    });

    it('calcula o valor do colaborador: R$ fixo, ou % sobre o salário da competência', () => {
        expect(valorRecorrente({ valor_tipo: 'fixo', valor: 500 }, 3000)).toEqual({ amount: 500, base_amount: 500, reference: 1 });
        expect(valorRecorrente({ valor_tipo: 'percentual', valor: 10 }, 3000)).toEqual({ amount: 300, base_amount: 3000, reference: 0.1 });
        // centavos: 7,5% de 1.621,00 = 121,575 → 121,58
        expect(valorRecorrente({ valor_tipo: 'percentual', valor: 7.5 }, 1621)?.amount).toBe(121.58);
        expect(valorRecorrente({ valor_tipo: null, valor: null }, 3000)).toBeNull();
        expect(valorRecorrente(undefined, 3000)).toBeNull();
    });
});
