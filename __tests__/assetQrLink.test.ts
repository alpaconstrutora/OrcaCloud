import { describe, it, expect } from 'vitest';
import QRCode from 'qrcode';
import { linkDoAtivo, ativoDoHash, HASH_SEM_PEDIDO } from '../utils/assetQrLink';

// QR Code da etiqueta patrimonial (13/10/2026): o QR abre a ficha do bem.
const ID = '5d932ad7-34c6-4802-9751-9a936f1a66ef';

describe('link do QR Code do ativo', () => {
    it('monta o link direto a partir do endereço atual, sem hash velho nem barra dupla', () => {
        expect(linkDoAtivo('https://orcacloud.vercel.app/', ID)).toBe(`https://orcacloud.vercel.app/#/opura-assets?ativo=${ID}`);
        expect(linkDoAtivo('https://orcacloud.vercel.app/#/almoxarifado?x=1', ID)).toBe(`https://orcacloud.vercel.app/#/opura-assets?ativo=${ID}`);
    });

    it('lê o id do hash, e só da vista de ativos', () => {
        expect(ativoDoHash(`#/opura-assets?ativo=${ID}`)).toBe(ID);
        expect(ativoDoHash('#/opura-assets')).toBeNull();
        expect(ativoDoHash('#/opura-assets?ativo=')).toBeNull();
        expect(ativoDoHash(`#/almoxarifado?ativo=${ID}`)).toBeNull();
        expect(HASH_SEM_PEDIDO).toBe('#/opura-assets');
    });

    it('ida e volta: o que o QR carrega é o que a tela lê', () => {
        const link = linkDoAtivo('https://orcacloud.vercel.app', ID);
        expect(ativoDoHash(link.slice(link.indexOf('#')))).toBe(ID);
    });

    it('o QR codifica o link de verdade (não é desenho fixo)', async () => {
        const link = linkDoAtivo('https://orcacloud.vercel.app', ID);
        const qr = QRCode.create(link, { errorCorrectionLevel: 'M' });
        // Um link de ~85 caracteres em correção M cabe na versão 5 ou 6; um desenho
        // fixo não teria versão nem módulos que dependam do conteúdo.
        expect(qr.version).toBeGreaterThanOrEqual(4);
        const outro = QRCode.create(linkDoAtivo('https://orcacloud.vercel.app', 'outro-id'), { errorCorrectionLevel: 'M' });
        expect(Array.from(qr.modules.data)).not.toEqual(Array.from(outro.modules.data));
        const png = await QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 1, width: 480 });
        expect(png.startsWith('data:image/png;base64,')).toBe(true);
    });
});
