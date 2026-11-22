import { describe, expect, it } from 'vitest';
import { propertyExportService } from '../services/propertyExportService';

/**
 * A proposta gravada na negociação (para assinar) é a MESMA do botão "Gerar
 * proposta" — docs/planos/2026-11-21-assinatura-eletronica-interna.md (F5).
 */
const deal = { id: 'deal-12345', type: 'SALE', value: 500000, status: 'IN_NEGOTIATION' } as never;
const unidade = { id: 'p1', name: 'Apto 101', address: 'Rua A, 10', type: 'APARTMENT' } as never;
const cliente = { id: 'c1', name: 'Ana Souza', email: 'ana@x.com', document: '529.982.247-25' } as never;

describe('proposta como arquivo', () => {
    it('proposalPdfBlob devolve um PDF e o nome de sempre', async () => {
        const { blob, nomeArquivo } = propertyExportService.proposalPdfBlob(deal, unidade, cliente, null, [unidade], [cliente]);
        expect(nomeArquivo).toBe('Proposta_Apto_101_deal-.pdf');
        expect(blob.type).toBe('application/pdf');
        const inicio = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5));
        expect(inicio).toBe('%PDF-');
    });

});
