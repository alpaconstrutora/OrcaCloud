/**
 * "Ver PDF" dos contratos nos portais — utils/contractFileUrl.ts (04/10/2026).
 * Antes: `signed_contract_url` na frente de tudo, então o PDF do upload "GED"
 * antigo (no CTS-018-104-0001, um extrato bancário) vencia a versão emitida.
 */
import { describe, it, expect } from 'vitest';
import { urlDoPdfDoContrato } from '../utils/contractFileUrl';

const emitida = (url: string) => ({ v: 1, url, notes: '', emitted: true, created_at: '2026-10-01' });

describe('urlDoPdfDoContrato', () => {
    it('assinatura concluída: o PDF assinado vence', () => {
        expect(urlDoPdfDoContrato({
            signature_status: 'SIGNED', signed_contract_url: 'https://x/assinado.pdf',
            minuta_versions: [emitida('https://x/v1.pdf')],
        })).toBe('https://x/assinado.pdf');
    });

    it('sem assinatura: a versão emitida mais recente vence o GED legado', () => {
        expect(urlDoPdfDoContrato({
            signed_contract_url: 'https://x/extrato-ged.pdf',
            minuta_versions: [emitida('https://x/v1.pdf'), emitida('https://x/v2.pdf')],
        })).toBe('https://x/v2.pdf');
    });

    it('sem versão emitida: cai no GED legado', () => {
        expect(urlDoPdfDoContrato({ signed_contract_url: 'https://x/legado.pdf', minuta_versions: [] }))
            .toBe('https://x/legado.pdf');
    });

    it('nada: null (o botão não aparece)', () => {
        expect(urlDoPdfDoContrato({})).toBeNull();
    });
});
