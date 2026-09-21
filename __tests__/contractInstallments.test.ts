import { describe, it, expect } from 'vitest';
import {
    gerarCronogramaContrato,
    lerParametrosDoCronograma,
    somaDoCronograma,
    periodicidadePorMeses,
    PERIODICIDADES_CONTRATO,
    TIPO_ENTRADA,
    type ParametrosCronograma,
} from '../utils/contractInstallments';

const params = (over: Partial<ParametrosCronograma> = {}): ParametrosCronograma => ({
    total: 120000,
    entrada: 20000,
    vencimentoEntrada: '2026-09-21',
    parcelas: 10,
    periodicidade: 'Mensal',
    primeiroVencimento: '2026-10-10',
    ...over,
});

describe('gerarCronogramaContrato', () => {
    it('entrada + parcelas mensais iguais, soma fecha no total', () => {
        const linhas = gerarCronogramaContrato(params());
        expect(linhas).toHaveLength(11);
        expect(linhas[0]).toEqual({ date: '2026-09-21', value: 20000, installment_type: TIPO_ENTRADA });
        expect(linhas[1]).toEqual({ date: '2026-10-10', value: 10000, installment_type: 'MENSAL' });
        expect(linhas[10].date).toBe('2027-07-10');
        expect(somaDoCronograma(linhas)).toBe(120000);
    });

    it('sem entrada não cria a linha de sinal', () => {
        const linhas = gerarCronogramaContrato(params({ entrada: 0, parcelas: 4 }));
        expect(linhas).toHaveLength(4);
        expect(linhas.every(l => l.installment_type === 'MENSAL')).toBe(true);
        expect(linhas.map(l => l.value)).toEqual([30000, 30000, 30000, 30000]);
    });

    it.each([
        ['Bimestral', 2, 'BIMESTRAL'],
        ['Trimestral', 3, 'TRIMESTRAL'],
        ['Semestral', 6, 'SEMESTRAL'],
        ['Anual', 12, 'ANUAL'],
    ] as const)('%s espaça as parcelas de %i em %i meses e grava o tipo %s', (periodicidade, meses, tipo) => {
        const linhas = gerarCronogramaContrato(params({ entrada: 0, parcelas: 3, periodicidade }));
        expect(linhas.map(l => l.date)).toEqual([
            '2026-10-10',
            `${2026 + Math.floor((9 + meses) / 12)}-${String(((9 + meses) % 12) + 1).padStart(2, '0')}-10`,
            `${2026 + Math.floor((9 + 2 * meses) / 12)}-${String(((9 + 2 * meses) % 12) + 1).padStart(2, '0')}-10`,
        ]);
        expect(linhas.every(l => l.installment_type === tipo)).toBe(true);
    });

    it('sobra do arredondamento vai para a última parcela', () => {
        const linhas = gerarCronogramaContrato(params({ total: 100, entrada: 0, parcelas: 3 }));
        expect(linhas.map(l => l.value)).toEqual([33.33, 33.33, 33.34]);
        expect(somaDoCronograma(linhas)).toBe(100);
    });

    it('31/jan + 1 mês cai em 28/fev, não 03/mar', () => {
        const linhas = gerarCronogramaContrato(params({ entrada: 0, parcelas: 3, primeiroVencimento: '2027-01-31' }));
        expect(linhas.map(l => l.date)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
    });

    it('entrada maior que o total é limitada ao total e as parcelas ficam zeradas', () => {
        const linhas = gerarCronogramaContrato(params({ total: 1000, entrada: 5000, parcelas: 2 }));
        expect(linhas[0].value).toBe(1000);
        expect(linhas.slice(1).map(l => l.value)).toEqual([0, 0]);
    });

    it('nº de parcelas inválido vira 1', () => {
        expect(gerarCronogramaContrato(params({ entrada: 0, parcelas: 0 }))).toHaveLength(1);
        expect(gerarCronogramaContrato(params({ entrada: 0, parcelas: NaN }))).toHaveLength(1);
    });
});

describe('lerParametrosDoCronograma', () => {
    it('é o inverso de gerar, para cada periodicidade', () => {
        for (const { value } of PERIODICIDADES_CONTRATO) {
            const p = params({ periodicidade: value, parcelas: 5 });
            const lido = lerParametrosDoCronograma(gerarCronogramaContrato(p));
            expect(lido).toEqual({
                entrada: 20000,
                vencimentoEntrada: '2026-09-21',
                parcelas: 5,
                periodicidade: value,
                primeiroVencimento: '2026-10-10',
            });
        }
    });

    it('cronograma antigo sem tipo: nenhuma entrada, tudo é parcela', () => {
        const lido = lerParametrosDoCronograma([
            { date: '2026-10-10', value: 500 },
            { date: '2026-11-10', value: 500 },
        ]);
        expect(lido).toEqual({
            entrada: 0,
            vencimentoEntrada: '2026-10-10',
            parcelas: 2,
            periodicidade: 'Mensal',
            primeiroVencimento: '2026-10-10',
        });
    });

    it('cadência editada à mão que não bate com nenhuma opção cai em Mensal', () => {
        const lido = lerParametrosDoCronograma([
            { date: '2026-10-10', value: 500, installment_type: 'MENSAL' },
            { date: '2027-03-10', value: 500, installment_type: 'MENSAL' },
        ]);
        expect(lido?.periodicidade).toBe('Mensal');
        expect(lido?.parcelas).toBe(2);
    });

    it('parcela única sem entrada', () => {
        const lido = lerParametrosDoCronograma([{ date: '2026-10-10', value: 900, installment_type: 'MENSAL' }]);
        expect(lido).toMatchObject({ entrada: 0, parcelas: 1, primeiroVencimento: '2026-10-10' });
    });

    it('vazio devolve null', () => {
        expect(lerParametrosDoCronograma([])).toBeNull();
        expect(lerParametrosDoCronograma(undefined)).toBeNull();
    });
});

describe('periodicidadePorMeses', () => {
    it('mapeia os intervalos oferecidos e rejeita os demais', () => {
        expect(periodicidadePorMeses(1)).toBe('Mensal');
        expect(periodicidadePorMeses(2)).toBe('Bimestral');
        expect(periodicidadePorMeses(3)).toBe('Trimestral');
        expect(periodicidadePorMeses(6)).toBe('Semestral');
        expect(periodicidadePorMeses(12)).toBe('Anual');
        expect(periodicidadePorMeses(4)).toBeNull();
    });
});
