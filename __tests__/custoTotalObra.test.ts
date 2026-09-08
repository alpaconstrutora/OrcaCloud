/**
 * Qual número serve de custo total da obra (§LTC).
 *
 * O que estes testes protegem: que um orçamento detalhado INACABADO não
 * substitua a estimativa declarada — no Garden Cambuhy o detalhado tem 2 itens
 * (R$ 173.650) contra R$ 18.000.000 declarados, e usar os R$ 173 mil daria um
 * LTC de milhares por cento.
 *
 * E, sobretudo: que a ORIGEM nunca se perca. "Orçamento detalhado de R$ 18M" e
 * "estimativa declarada de R$ 18M" são afirmações diferentes para um analista.
 */

import { describe, expect, it } from 'vitest';
import { escolherCustoTotal } from '../utils/creditRoomEac';

describe('escolherCustoTotal', () => {
    it('🔴 o caso Garden Cambuhy: detalhado inacabado NÃO vence a estimativa', () => {
        const c = escolherCustoTotal(173_650, 18_000_000);
        expect(c.valor).toBe(18_000_000);
        expect(c.origem).toBe('VALOR_ESTIMADO');
        // E o detalhado continua visível: a tela precisa poder mostrar os dois.
        expect(c.orcadoDetalhado).toBe(173_650);
    });

    it('quando o detalhado alcança a estimativa, ele vence — e é mais conservador', () => {
        const c = escolherCustoTotal(20_000_000, 18_000_000);
        expect(c.valor).toBe(20_000_000);
        expect(c.origem).toBe('ORCAMENTO_DETALHADO');
    });

    it('empate resolve pelo detalhado (mesma cifra, fonte melhor)', () => {
        expect(escolherCustoTotal(18_000_000, 18_000_000).origem).toBe('ORCAMENTO_DETALHADO');
    });

    it('sem estimativa declarada, vale o detalhado', () => {
        const c = escolherCustoTotal(416_086.25, null);
        expect(c.valor).toBe(416_086.25);
        expect(c.origem).toBe('ORCAMENTO_DETALHADO');
    });

    it('sem detalhado, vale a estimativa', () => {
        const c = escolherCustoTotal(0, 18_000_000);
        expect(c.valor).toBe(18_000_000);
        expect(c.origem).toBe('VALOR_ESTIMADO');
    });

    it('🔴 sem nenhum dos dois, o custo é null — nunca R$ 0,00', () => {
        const c = escolherCustoTotal(0, null);
        expect(c.valor).toBeNull();
        expect(c.origem).toBe('AUSENTE');
        // Um custo total de zero faria o LTC dividir por zero e a tela mostrar
        // um número; "ausente" faz a tela mostrar "—", que é a verdade.
    });

    it('estimativa zerada ou vazia conta como não declarada', () => {
        expect(escolherCustoTotal(0, 0).origem).toBe('AUSENTE');
        expect(escolherCustoTotal(0, undefined).origem).toBe('AUSENTE');
        expect(escolherCustoTotal(500, 0).origem).toBe('ORCAMENTO_DETALHADO');
    });

    it('a origem NUNCA é omitida — é o que separa estimativa de orçamento', () => {
        for (const [d, e] of [[0, null], [1, null], [0, 1], [5, 10], [10, 5]] as const) {
            expect(['ORCAMENTO_DETALHADO', 'VALOR_ESTIMADO', 'AUSENTE'])
                .toContain(escolherCustoTotal(d, e).origem);
        }
    });
});
