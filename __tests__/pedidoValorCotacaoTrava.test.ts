import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRAVA — quem soma o valor de um item do pedido passa por utils/pedidoItemValor
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Desde 2026-09-17 o item do pedido tem dois pares de preço: referência
 * (`unitPrice`/`total`) e cotado (`quotedUnitPrice`/`quotedTotal`). O valor
 * que VALE é o cotado quando houver, senão a referência — decisão do usuário,
 * ver docs/planos/2026-09-17-pedido-itens-valor-cotacao.md.
 *
 * Antes, ~20 lugares somavam `item.total` cru. Se um deles voltar a fazer
 * isso, a lista mostra um valor e o título financeiro outro, sem erro nenhum.
 * Por isso cada consumidor abaixo precisa IMPORTAR o helper — e o teste
 * também procura a soma crua (`.total || 0`, `.total ?? 0`) fora do helper.
 */

const RAIZ = process.cwd();

/** Arquivos que somam/exibem o valor de itens de pedido de compra. */
const CONSUMIDORES = [
    'services/orderService.ts',
    'services/financialService.ts',
    'services/matchService.ts',
    'services/webhookService.ts',
    'services/negotiationService.ts',
    'services/quotationService.ts',
    'components/SupplyChainOrderList.tsx',
    'components/SupplyChainOrderDetails.tsx',
    'components/SupplyChainOrderForm.tsx',
    'components/NegotiationHub.tsx',
    'components/SupplierDashboard.tsx',
    'components/supplier/portal/status.ts',
    'components/FinancialOrderDetails.tsx',
    'components/ProjectFinancialManager.tsx',
    'components/SupplyChainReceiptManager.tsx',
    'components/FinancialSchedule.tsx',
    'components/PublicOrderView.tsx',
    'utils/projectUtils.ts',
];

function semComentarios(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');
}

describe('trava — valor de item do pedido vem de utils/pedidoItemValor', () => {
    it.each(CONSUMIDORES)('%s importa o helper', arquivo => {
        const src = readFileSync(path.join(RAIZ, arquivo), 'utf8');
        expect(src, `${arquivo}: some \`item.total\` cru — use valorEfetivoDoItem/totalEfetivoDoPedido de utils/pedidoItemValor`)
            .toMatch(/from '(\.\.\/)+utils\/pedidoItemValor'|from '\.\/pedidoItemValor'/);
    });

    it.each(CONSUMIDORES)('%s não soma item.total cru', arquivo => {
        const src = semComentarios(readFileSync(path.join(RAIZ, arquivo), 'utf8'));
        // `(x.total || 0)` / `(x.total ?? 0)` dentro de um reduce é a assinatura
        // da soma antiga. `inv.total`/`total_value` (nota fiscal) não entram.
        const cruas = src.match(/\b(item|i|it|orderItem|o)\.total\s*(\|\||\?\?)\s*0/g) ?? [];
        expect(cruas, `${arquivo}: soma crua de item.total — ${cruas.join(', ')}`).toEqual([]);
    });
});
