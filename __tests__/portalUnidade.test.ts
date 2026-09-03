// Aba "Dados da Unidade" do Portal do Cliente — as regras puras da tela.
// Plano: docs/planos/2026-09-03-portal-cliente-aba-dados-da-unidade.md
//
// Por que estas três: o resto da aba é leitura de um payload que a RPC já monta.
// O que erra em SILÊNCIO — mostrando número plausível, não tela quebrada — é:
//
//   1. valor de locação: `value` é o TOTAL do contrato e `installment_value` é a
//      parcela mensal. Trocar um pelo outro erra por um fator de `installments`
//      e continua parecendo dinheiro. Já custou duas rodadas de correção em
//      Locações;
//   2. pavimento 0: é o TÉRREO, não vazio. O padrão dos campos vizinhos (`|| '—'`)
//      come o térreo e o sintoma parece dado faltando;
//   3. escala da fração ideal: decimal (0,0833) lido como % dá erro de 100×,
//      que já aconteceu de verdade neste domínio.
import { describe, it, expect } from 'vitest';
import {
    fracaoParaPercentual, rotuloPavimento, valorDaUnidade, enderecoEmLinha,
} from '../components/client/UnidadeTab';
import type {
    PortalUnidadeNegociacao, PortalUnidadeEndereco,
} from '../services/clientPortalService';

const negociacao = (over: Partial<PortalUnidadeNegociacao>): PortalUnidadeNegociacao => ({
    id: 'd1', tipo: 'SALE', status: 'PENDING', data: '2026-03-10',
    codigo: '001', contrato: 'CV-001', valorUnidade: 450000,
    aluguelMensal: null, vigenciaFim: null, periodicidade: null, indiceReajuste: null,
    ...over,
});

const endereco = (over: Partial<PortalUnidadeEndereco>): PortalUnidadeEndereco => ({
    logradouro: null, numero: null, complemento: null, bairro: null,
    cidade: null, uf: null, cep: null, livre: null, ...over,
});

describe('valorDaUnidade', () => {
    it('venda mostra o valor da unidade, sem periodicidade', () => {
        const { rotulo, valor } = valorDaUnidade(negociacao({ tipo: 'SALE', valorUnidade: 450000 }));
        expect(rotulo).toBe('Valor da unidade');
        expect(valor).toContain('450.000');
        expect(valor).not.toContain('/');
    });

    it('locação mostra o MENSAL, nunca o total do contrato', () => {
        // O contrato de 12×R$ 3.000 vale R$ 36.000. Mostrar 36.000 como "aluguel"
        // é o erro clássico — o número é plausível e ninguém confere.
        const { rotulo, valor } = valorDaUnidade(negociacao({
            tipo: 'RENTAL', valorUnidade: 36000, aluguelMensal: 3000, periodicidade: 'Mensal',
        }));
        expect(rotulo).toBe('Aluguel contratado');
        expect(valor).toContain('3.000');
        expect(valor).not.toContain('36.000');
        expect(valor).toContain('/mês');
    });

    it('o "/mês" não vem de billing_cycle — aquele campo é a frequência de cobrança', () => {
        // Dois contratos reais estão marcados "Anual" com 36 e 60 parcelas (36
        // anos de locação não existe). Derivar o rótulo dali escrevia
        // "R$ 1.517,26/ano" num aluguel mensal de verdade — visto na tela.
        const { valor } = valorDaUnidade(negociacao({
            tipo: 'RENTAL', aluguelMensal: 1517.26, periodicidade: 'Anual',
        }));
        expect(valor).toContain('/mês');
        expect(valor).not.toContain('/ano');
        expect(valor).toContain('1.517,26');
    });

    it('locação sem valor mensal registrado não inventa número', () => {
        const { valor } = valorDaUnidade(negociacao({ tipo: 'RENTAL', aluguelMensal: null }));
        expect(valor).toBe('—');
    });
});

describe('rotuloPavimento', () => {
    it('pavimento 0 é TÉRREO, não vazio', () => {
        expect(rotuloPavimento(0, null)).toBe('Térreo');
    });

    it('pavimento numerado sai com ordinal', () => {
        expect(rotuloPavimento(7, null)).toBe('7º');
    });

    it('o tipo do pavimento, quando existe, qualifica o número', () => {
        expect(rotuloPavimento(12, 'COBERTURA')).toBe('12º (Cobertura)');
        expect(rotuloPavimento(-1, 'SUBSOLO')).toBe('-1º (Subsolo)');
    });

    it('sem pavimento e sem tipo, aí sim é vazio', () => {
        expect(rotuloPavimento(null, null)).toBe('—');
        expect(rotuloPavimento(null, 'GARAGEM')).toBe('Garagem');
    });
});

describe('fracaoParaPercentual', () => {
    it('converte decimal em porcentagem com 4 casas', () => {
        // 0,0833333 é 8,3333% — não 0,08%. O erro de 100× já aconteceu aqui.
        expect(fracaoParaPercentual(0.0833333)).toBe('8,3333%');
    });

    it('ausência não vira zero', () => {
        expect(fracaoParaPercentual(null)).toBe('—');
        expect(fracaoParaPercentual(undefined)).toBe('—');
    });
});

describe('enderecoEmLinha', () => {
    it('monta a linha a partir dos campos separados', () => {
        expect(enderecoEmLinha(endereco({
            logradouro: 'Av. Afonso Pena', numero: '1500', complemento: 'Sala 201',
            bairro: 'Centro', cidade: 'Belo Horizonte', uf: 'MG', cep: '30130-005',
        }))).toBe('Av. Afonso Pena, 1500 · Sala 201 · Centro · Belo Horizonte - MG · 30130-005');
    });

    it('cai no campo livre quando o cadastro é antigo', () => {
        expect(enderecoEmLinha(endereco({ livre: 'Rua X, 10 — Centro' }))).toBe('Rua X, 10 — Centro');
    });

    it('sem endereço nenhum, não renderiza pontuação solta', () => {
        expect(enderecoEmLinha(endereco({}))).toBe('—');
    });
});
