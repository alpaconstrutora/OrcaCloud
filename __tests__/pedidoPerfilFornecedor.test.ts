import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ehCompradorDoPedido } from '../utils/pedidoPerfil';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRAVA — o detalhe do pedido se recorta por PERFIL, não por ausência de token
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O defeito que esta trava impede de voltar (verificado em 2026-09-07):
 * `SupplyChainOrderDetails` decidia o que mostrar com `!portalToken`. Como o
 * fornecedor LOGADO no app (`ProfileGroup.SUPPLIER`, via `AppRouter` →
 * `SupplierDashboard`) não tem token, ele caía no ramo do comprador e recebia o
 * formulário de edição do pedido, o 3-Way Match e as dimensões contábeis
 * (conta de pagamento, centro de custo, plano de contas).
 *
 * Nenhum erro aparecia: a tela entregava dado demais, calada. E `!portalToken`
 * lê como se cobrisse "o fornecedor" — foi o que fez a revisão deixar passar.
 */

const RAIZ = process.cwd();
const DETALHE = path.join(RAIZ, 'components', 'SupplyChainOrderDetails.tsx');
const DASHBOARD = path.join(RAIZ, 'components', 'SupplierDashboard.tsx');

/** Remove comentários para não acusar o padrão citado numa explicação. */
function semComentarios(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');
}

describe('ehCompradorDoPedido — os três contextos', () => {
    it('app interno, sem perfil declarado: é o comprador', () => {
        expect(ehCompradorDoPedido({})).toBe(true);
        expect(ehCompradorDoPedido({ perfil: 'comprador' })).toBe(true);
    });

    it('fornecedor LOGADO (sem token) NÃO é comprador — o caso que escapava', () => {
        expect(ehCompradorDoPedido({ perfil: 'fornecedor' })).toBe(false);
    });

    it('link público: token manda, mesmo se o perfil vier errado', () => {
        expect(ehCompradorDoPedido({ portalToken: 'abc' })).toBe(false);
        expect(ehCompradorDoPedido({ portalToken: 'abc', perfil: 'comprador' })).toBe(false);
    });
});

describe('trava de código — o gate não volta a ser a ausência de token', () => {
    it('SupplyChainOrderDetails não usa `!portalToken` como condição de renderização', () => {
        const src = semComentarios(readFileSync(DETALHE, 'utf8'));
        // `portalToken` sozinho continua legítimo (escolhe a FONTE dos dados);
        // o que não pode voltar é a NEGAÇÃO, que é sempre um corte de exibição.
        // O lookbehind exclui `!!portalToken` — coerção para booleano não é gate.
        const ocorrencias = src.match(/(?<!!)!\s*portalToken/g) ?? [];
        expect(
            ocorrencias,
            'Use `ehCompradorDoPedido({ portalToken, perfil })` — `!portalToken` deixa o fornecedor LOGADO no ramo do comprador.',
        ).toEqual([]);
    });

    it('SupplierDashboard declara perfil="fornecedor" ao abrir o detalhe do pedido', () => {
        const src = semComentarios(readFileSync(DASHBOARD, 'utf8'));
        expect(src).toMatch(/perfil="fornecedor"/);
    });

    it('o detalhe do pedido decide por perfil', () => {
        const src = semComentarios(readFileSync(DETALHE, 'utf8'));
        expect(src).toMatch(/ehCompradorDoPedido\(\s*\{\s*portalToken,\s*perfil\s*\}\s*\)/);
    });
});
