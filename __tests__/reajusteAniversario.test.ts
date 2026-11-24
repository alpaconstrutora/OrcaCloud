import { describe, it, expect } from 'vitest';
import {
    mesesDaPeriodicidade,
    aniversarioDoReajuste,
    valorAposReajuste,
    entraNaFilaDeReajuste,
    termosDeReajusteParaOContrato,
    motivoDaDataDeReajuste,
} from '../utils/reajusteAniversario';

/**
 * Caso real (24/11/2026): CTL-006-012-0001, vigência 23/09/2016 → 22/03/2019
 * (30 meses), IGP-M, data-base 23/09/2016. Cabem DOIS reajustes (23/09/2017 e
 * 23/09/2018); o de 23/09/2019 já é depois do fim. Até aqui o app comparava o
 * índice de HOJE com o de 2016 — 10 anos de IGP-M de uma vez.
 */
const CTL = {
    start_date: '2016-09-23',
    end_date: '2019-03-22',
    reajuste_data_base: '2016-09-23',
    reajuste_proximo: '2017-09-23',
    reajuste_periodicidade_meses: null,
};

describe('mesesDaPeriodicidade', () => {
    it('vazio = Anual (decisão do usuário)', () => {
        expect(mesesDaPeriodicidade(null)).toBe(12);
        expect(mesesDaPeriodicidade(0)).toBe(12);
    });
    it('número de meses passa direto', () => {
        expect(mesesDaPeriodicidade(6)).toBe(6);
    });
});

describe('aniversarioDoReajuste', () => {
    it('1º aniversário do caso real: índice de 09/2016 a 09/2017, próximo em 23/09/2018', () => {
        expect(aniversarioDoReajuste(CTL)).toEqual({
            dataBase: '2016-09-23', aniversario: '2017-09-23', proximo: '2018-09-23', dentroDaVigencia: true,
        });
    });
    it('2º aniversário ainda dentro da vigência; o seguinte (2019-09) já não', () => {
        const depoisDo1 = { ...CTL, reajuste_data_base: '2017-09-23', reajuste_proximo: '2018-09-23' };
        expect(aniversarioDoReajuste(depoisDo1)).toMatchObject({ aniversario: '2018-09-23', proximo: '2019-09-23', dentroDaVigencia: true });
        const depoisDo2 = { ...CTL, reajuste_data_base: '2018-09-23', reajuste_proximo: '2019-09-23' };
        expect(aniversarioDoReajuste(depoisDo2)?.dentroDaVigencia).toBe(false);
    });
    it('periodicidade semestral', () => {
        expect(aniversarioDoReajuste({ ...CTL, reajuste_proximo: null, reajuste_periodicidade_meses: 6 }))
            .toMatchObject({ aniversario: '2017-03-23', proximo: '2017-09-23' });
    });
    it('sem próximo gravado: data-base + periodicidade', () => {
        expect(aniversarioDoReajuste({ ...CTL, reajuste_proximo: null })?.aniversario).toBe('2017-09-23');
    });
    it('sem data-base: usa o início do contrato', () => {
        expect(aniversarioDoReajuste({ ...CTL, reajuste_data_base: null, reajuste_proximo: null })?.aniversario).toBe('2017-09-23');
    });
    it('29/02 + 12 meses para em 28/02', () => {
        expect(aniversarioDoReajuste({ start_date: '2024-02-29', end_date: null, reajuste_data_base: null, reajuste_proximo: null })?.aniversario).toBe('2025-02-28');
    });
    it('sem fim de vigência: sempre dentro', () => {
        expect(aniversarioDoReajuste({ ...CTL, end_date: null, reajuste_proximo: '2030-01-01' })?.dentroDaVigencia).toBe(true);
    });
    it('data escolhida pelo usuário: vira o aniversário e conta o próximo a partir dela', () => {
        expect(aniversarioDoReajuste(CTL, '2017-11-01')).toEqual({
            dataBase: '2016-09-23', aniversario: '2017-11-01', proximo: '2018-11-01', dentroDaVigencia: true,
        });
    });
    it('data escolhida vazia: a calculada', () => {
        expect(aniversarioDoReajuste(CTL, '')?.aniversario).toBe('2017-09-23');
    });
    it('sem nenhuma data: null', () => {
        expect(aniversarioDoReajuste({ start_date: null, reajuste_data_base: null, reajuste_proximo: null })).toBeNull();
    });
});

describe('valorAposReajuste', () => {
    it('100% do índice', () => {
        expect(valorAposReajuste(4556, 1.05, { tipo: 'INDICE' })).toEqual({ valorNovo: 4783.8, percentualAplicado: 5 });
    });
    it('outro percentual', () => {
        expect(valorAposReajuste(4556, 1.05, { tipo: 'PERCENTUAL', percentual: 3 })).toEqual({ valorNovo: 4692.68, percentualAplicado: 3 });
    });
    it('valor digitado: o percentual é derivado', () => {
        expect(valorAposReajuste(1000, null, { tipo: 'VALOR', valor: 1100 })).toEqual({ valorNovo: 1100, percentualAplicado: 10 });
    });
    it('não aplicar: valor fica', () => {
        expect(valorAposReajuste(1000, 1.05, { tipo: 'NAO_APLICADO' })).toEqual({ valorNovo: 1000, percentualAplicado: 0 });
    });
    it('100% do índice sem índice cadastrado é erro', () => {
        expect(() => valorAposReajuste(1000, null, { tipo: 'INDICE' })).toThrow(/índice/i);
    });
    it('valor ou percentual inválido é erro', () => {
        expect(() => valorAposReajuste(1000, null, { tipo: 'VALOR', valor: 0 })).toThrow();
        expect(() => valorAposReajuste(1000, null, { tipo: 'PERCENTUAL', percentual: -100 })).toThrow();
    });
});

describe('entraNaFilaDeReajuste', () => {
    const hoje = '2026-11-24';
    it('vencido dentro da vigência entra', () => {
        expect(entraNaFilaDeReajuste(CTL, 30, hoje)).toBe(true);
    });
    it('aniversário depois do fim da vigência não entra (é caso de renovação)', () => {
        expect(entraNaFilaDeReajuste({ ...CTL, reajuste_proximo: '2019-09-23' }, 30, hoje)).toBe(false);
    });
    it('respeita os dias de aviso', () => {
        const futuro = { ...CTL, end_date: null, reajuste_proximo: '2026-12-20' };
        expect(entraNaFilaDeReajuste(futuro, 30, hoje)).toBe(true);
        expect(entraNaFilaDeReajuste(futuro, 15, hoje)).toBe(false);
    });
});

describe('termosDeReajusteParaOContrato', () => {
    const contrato = { start_date: '2016-09-23', reajuste_data_base: '2016-09-23', reajuste_proximo: '2017-09-23', reajuste_periodicidade_meses: null, reajuste_index: 'IGP-M' };
    it('vazio na negociação e vazio no contrato (= Anual nos dois): nada a gravar', () => {
        expect(termosDeReajusteParaOContrato({ billing_cycle: null, reajuste_index: 'IGP-M' }, contrato)).toBeNull();
    });
    it('Anual explícito grava 12 sem mudar o aniversário', () => {
        expect(termosDeReajusteParaOContrato({ billing_cycle: 'Anual' }, contrato))
            .toEqual({ reajuste_periodicidade_meses: 12, reajuste_proximo: '2017-09-23' });
    });
    it('Semestral recalcula o próximo aniversário pela data-base', () => {
        expect(termosDeReajusteParaOContrato({ billing_cycle: 'Semestral' }, contrato))
            .toEqual({ reajuste_periodicidade_meses: 6, reajuste_proximo: '2017-03-23' });
    });
    it('troca de índice vai junto', () => {
        expect(termosDeReajusteParaOContrato({ billing_cycle: null, reajuste_index: 'IPCA' }, contrato))
            .toEqual({ reajuste_index: 'IPCA' });
    });
});

describe('motivoDaDataDeReajuste (data escolhida na gaveta)', () => {
    it('depois da data-base e dentro da vigência: ok', () => {
        expect(motivoDaDataDeReajuste(CTL, '2017-11-01')).toBeNull();
        expect(motivoDaDataDeReajuste(CTL, '2019-03-22')).toBeNull();
    });
    it('vazia', () => {
        expect(motivoDaDataDeReajuste(CTL, '')).toMatch(/Informe a data/);
    });
    it('na data-base ou antes', () => {
        expect(motivoDaDataDeReajuste(CTL, '2016-09-23')).toMatch(/depois da data-base \(23\/09\/2016\)/);
        expect(motivoDaDataDeReajuste(CTL, '2016-01-01')).toMatch(/depois da data-base/);
    });
    it('depois do fim da vigência = renovação', () => {
        expect(motivoDaDataDeReajuste(CTL, '2019-03-23')).toMatch(/renovação/);
    });
});
