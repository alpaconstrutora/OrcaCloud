// @vitest-environment jsdom
/**
 * Pedido de folha de Configurações (24/11/2026). Em produção a tela é montada
 * TRÊS vezes num carregamento (sonda: get=tributos-irrf, remove, get=null, remove,
 * get=null) — ler-e-apagar fazia a montagem que fica na tela abrir em Nomenclatura.
 * Agora a leitura não apaga: o pedido vale por um prazo curto e sai quando o
 * usuário escolhe uma folha.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { pedirFolha, lerFolhaPedida, esquecerFolhaPedida, CHAVE_FOLHA_PEDIDA, VALIDADE_DO_PEDIDO_MS } from '../utils/folhaDeConfiguracoes';

describe('pedido de folha de Configurações', () => {
    beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-24T21:00:00Z')); });
    afterEach(() => vi.useRealTimers());

    it('três montagens seguidas leem o MESMO pedido (a leitura não apaga)', () => {
        pedirFolha('tributos-irrf');
        expect(lerFolhaPedida()).toBe('tributos-irrf');
        expect(lerFolhaPedida()).toBe('tributos-irrf');
        expect(lerFolhaPedida()).toBe('tributos-irrf');
    });

    it('vencido o prazo, o pedido não vale mais (e sai)', () => {
        pedirFolha('tributos-inss');
        vi.setSystemTime(Date.now() + VALIDADE_DO_PEDIDO_MS + 1);
        expect(lerFolhaPedida()).toBeNull();
        expect(localStorage.getItem(CHAVE_FOLHA_PEDIDA)).toBeNull();
    });

    it('escolher uma folha esquece o pedido', () => {
        pedirFolha('tributos-inss');
        esquecerFolhaPedida();
        expect(lerFolhaPedida()).toBeNull();
    });

    it('valor no formato antigo (sem data) ou lixo: ignorado', () => {
        localStorage.setItem(CHAVE_FOLHA_PEDIDA, 'tributos-inss');
        expect(lerFolhaPedida()).toBeNull();
        localStorage.setItem(CHAVE_FOLHA_PEDIDA, '{quebrado');
        expect(lerFolhaPedida()).toBeNull();
    });
});
