import { describe, expect, it } from 'vitest';
import { contaPeloCentroDeCusto } from '../lib/contaPeloCentroDeCusto';

const CONTAS = ['c-itau', 'c-sicredi'];

describe('contaPeloCentroDeCusto', () => {
    it('campo vazio: preenche com a conta do centro', () => {
        expect(contaPeloCentroDeCusto({ contaAtual: null, contaPreenchidaAntes: null, contaDoCentro: 'c-itau', contasDisponiveis: CONTAS }))
            .toEqual({ conta: 'c-itau', preenchida: 'c-itau' });
    });

    it('conta escolhida à mão: mantém', () => {
        expect(contaPeloCentroDeCusto({ contaAtual: 'c-sicredi', contaPreenchidaAntes: null, contaDoCentro: 'c-itau', contasDisponiveis: CONTAS }))
            .toEqual({ conta: 'c-sicredi', preenchida: null });
    });

    it('conta que ela mesma preencheu: troca junto com o centro', () => {
        expect(contaPeloCentroDeCusto({ contaAtual: 'c-itau', contaPreenchidaAntes: 'c-itau', contaDoCentro: 'c-sicredi', contasDisponiveis: CONTAS }))
            .toEqual({ conta: 'c-sicredi', preenchida: 'c-sicredi' });
    });

    it('centro novo sem conta: limpa só o que ela preencheu', () => {
        expect(contaPeloCentroDeCusto({ contaAtual: 'c-itau', contaPreenchidaAntes: 'c-itau', contaDoCentro: null, contasDisponiveis: CONTAS }))
            .toEqual({ conta: null, preenchida: null });
        expect(contaPeloCentroDeCusto({ contaAtual: 'c-sicredi', contaPreenchidaAntes: null, contaDoCentro: null, contasDisponiveis: CONTAS }))
            .toEqual({ conta: 'c-sicredi', preenchida: null });
    });

    it('conta do centro fora da lista da tela (outra org, inativa): não preenche', () => {
        expect(contaPeloCentroDeCusto({ contaAtual: null, contaPreenchidaAntes: null, contaDoCentro: 'c-outra', contasDisponiveis: CONTAS }))
            .toEqual({ conta: null, preenchida: null });
    });
});
