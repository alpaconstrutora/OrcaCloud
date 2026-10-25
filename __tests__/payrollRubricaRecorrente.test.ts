import { describe, it, expect } from 'vitest';
import {
    motivoBloqueioRecorrente,
    ficaEmAbertoSemValor,
    valorDaRubrica,
    valorRecorrente,
    valorParaGravar,
    rubricasEmAbertoSemLancamento,
} from '../lib/payrollRubricaRecorrente';

const r = (extra: Record<string, unknown> = {}) => ({
    code: 'X', calculation_type: 'manual', category: null, is_clt_mandatory: false, ...extra,
}) as Parameters<typeof motivoBloqueioRecorrente>[0];

describe('rubrica recorrente do colaborador — o que pode, o que trava', () => {
    it('trava o que a própria folha calcula, o Padrão CLT e a rescisão', () => {
        expect(motivoBloqueioRecorrente(r({ code: 'INSS', category: 'tax', is_clt_mandatory: true }))).toBe('Calculada pela folha');
        expect(motivoBloqueioRecorrente(r({ code: 'IRRF', category: 'tax' }))).toBe('Calculada pela folha');
        expect(motivoBloqueioRecorrente(r({ code: 'FGTS', category: 'tax' }))).toBe('Calculada pela folha');
        expect(motivoBloqueioRecorrente(r({ code: 'SALARIO', category: 'base', is_clt_mandatory: true }))).toBe('Já entra para todo CLT');
        expect(motivoBloqueioRecorrente(r({ code: 'OUTRA_CLT', is_clt_mandatory: true }))).toBe('Já entra para todo CLT');
        expect(motivoBloqueioRecorrente(r({ code: 'FGTS_MULTA', category: 'termination' }))).toBe('Só na rescisão');
        // 13º e férias têm folha própria: recorrente entraria em TODA folha mensal (24/10/2026)
        expect(motivoBloqueioRecorrente(r({ code: 'DECIMO', category: 'thirteenth' }))).toBe('Só na folha de 13º');
        expect(motivoBloqueioRecorrente(r({ code: 'DESC_ADIANT_13', category: 'thirteenth' }))).toBe('Só na folha de 13º');
        expect(motivoBloqueioRecorrente(r({ code: 'FERIAS', category: 'vacation' }))).toBe('Só na folha de férias');
        expect(motivoBloqueioRecorrente(r({ code: 'FERIAS_TERCO', category: 'vacation' }))).toBe('Só na folha de férias');
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
        expect(valorDaRubrica(r({ calculation_type: 'percentage', calculation_config: { percentage: 0.4 } }))).toBe('40% do salário');
        expect(valorDaRubrica(r({ calculation_type: 'percentage', calculation_config: { percentage: 0.015 } }))).toBe('1,5% do salário');
        expect(valorDaRubrica(r({ calculation_type: 'fixed', calculation_config: { amount: 150 } }))).toBe('R$ 150,00');
        expect(valorDaRubrica(r({ calculation_type: 'formula' }))).toBe('Fórmula');
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

describe('rubrica recorrente do colaborador — o que vai para o banco', () => {
    // 25/10/2026: vínculo antigo (ou salvo vazio) volta com valor_tipo NULL; a tela
    // mostra "R$" mas o estado ficava NULL, e o valor digitado era jogado fora ao salvar
    // (VA e Gratificação do Rogério nunca gravavam).
    it('valor digitado em vínculo com tipo NULL grava como R$ — o que a tela mostra', () => {
        expect(valorParaGravar({ valor_tipo: null, valor: 350 })).toEqual({ valor_tipo: 'fixo', valor: 350 });
    });

    it('mantém o tipo escolhido e zera os dois quando não há valor', () => {
        expect(valorParaGravar({ valor_tipo: 'percentual', valor: 10 })).toEqual({ valor_tipo: 'percentual', valor: 10 });
        expect(valorParaGravar({ valor_tipo: 'fixo', valor: null })).toEqual({ valor_tipo: null, valor: null });
        expect(valorParaGravar({ valor_tipo: null, valor: null })).toEqual({ valor_tipo: null, valor: null });
    });
});

describe('rubrica recorrente do colaborador — em aberto nos Eventos da folha', () => {
    // 25/10/2026: a Gratificação recorrente do Rogério (manual, sem valor) não aparecia
    // nos Eventos de 07/2026 para preencher — o modal não lia os vínculos.
    const catalogo = [
        r({ code: 'GRATIFICAÇÃO', name: 'Gratificação' }),
        r({ code: 'VA', name: 'Vale Alimentação' }),
        r({ code: 'AUXEDU', name: 'Auxílio Educação' }),
        r({ code: 'ADIANTAMENTO', calculation_type: 'percentage' }),
        r({ code: 'IRRF', category: 'tax' }),
    ];

    it('lista as manuais sem valor que ainda não têm lançamento no mês', () => {
        const vinculos = [
            { code: 'ADIANTAMENTO', valor_tipo: null, valor: null },   // cálculo próprio: não está em aberto
            { code: 'VA', valor_tipo: null, valor: null },
            { code: 'AUXEDU', valor_tipo: 'fixo' as const, valor: 200 }, // tem valor: entra sozinha
            { code: 'GRATIFICAÇÃO', valor_tipo: 'fixo' as const, valor: null },
            { code: 'IRRF', valor_tipo: null, valor: null },            // travada
        ];
        expect(rubricasEmAbertoSemLancamento(vinculos, catalogo, []).map(x => x.code)).toEqual(['VA', 'GRATIFICAÇÃO']);
    });

    it('some da lista quando o mês já tem lançamento da rubrica', () => {
        const vinculos = [{ code: 'GRATIFICAÇÃO', valor_tipo: null, valor: null }];
        expect(rubricasEmAbertoSemLancamento(vinculos, catalogo, [{ rubric_code: 'GRATIFICAÇÃO' }])).toEqual([]);
        expect(rubricasEmAbertoSemLancamento(vinculos, catalogo, [{ rubric_code: null, code: 'GRATIFICAÇÃO' }])).toEqual([]);
    });

    it('ignora vínculo de rubrica fora do catálogo (apagada ou inativa)', () => {
        expect(rubricasEmAbertoSemLancamento([{ code: 'SUMIU', valor_tipo: null, valor: null }], catalogo, [])).toEqual([]);
    });
});
