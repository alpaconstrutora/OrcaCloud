/**
 * Montagem do template "pedido enviado" (utils/whatsappPedido.ts), que desde
 * 18/11/2026 roda na Edge Function `whatsapp-cloud` (achado F75). O formato tem
 * de continuar o MESMO que o navegador mandava antes — é o template aprovado na
 * Meta que decide a ordem dos parâmetros.
 */
import { describe, it, expect } from 'vitest';
import {
    TEMPLATE_PEDIDO_PADRAO, formatarDataDeEntrega, montarMensagemDoPedido,
    nomeDeTemplateValido, normalizarTelefoneWhatsapp, phoneNumberIdValido,
} from '../utils/whatsappPedido';

describe('utils/whatsappPedido', () => {
    it('telefone vira E.164 sem +, com DDI 55 quando falta', () => {
        expect(normalizarTelefoneWhatsapp('(11) 99999-0000')).toBe('5511999990000');
        expect(normalizarTelefoneWhatsapp('011 99999-0000')).toBe('5511999990000');
        expect(normalizarTelefoneWhatsapp('+55 11 99999-0000')).toBe('5511999990000');
        expect(normalizarTelefoneWhatsapp('')).toBe('');
        expect(normalizarTelefoneWhatsapp(null)).toBe('');
        expect(normalizarTelefoneWhatsapp('sem número')).toBe('');
    });

    it('data de entrega dd/mm/aaaa; sem data → "A definir"', () => {
        expect(formatarDataDeEntrega('2026-11-20')).toBe('20/11/2026');
        expect(formatarDataDeEntrega('2026-11-20T03:00:00Z')).toBe('20/11/2026');
        expect(formatarDataDeEntrega(null)).toBe('A definir');
        expect(formatarDataDeEntrega('lixo')).toBe('A definir');
    });

    it('valida Phone Number ID e nome de template como a migration', () => {
        expect(phoneNumberIdValido('123456789012345')).toBe(true);
        expect(phoneNumberIdValido('12ab')).toBe(false);
        expect(phoneNumberIdValido('')).toBe(false);
        expect(nomeDeTemplateValido(TEMPLATE_PEDIDO_PADRAO)).toBe(true);
        expect(nomeDeTemplateValido('Pedido Enviado')).toBe(false);
        expect(nomeDeTemplateValido('a'.repeat(513))).toBe(false);
    });

    it('corpo do template: mesma ordem de parâmetros e botão com o share token', () => {
        const m = montarMensagemDoPedido({
            para: '5511999990000', template: 'opura_pedido_enviado', fornecedor: 'Cimento SA',
            numeroDoPedido: 'PO-7', obra: 'Garden', quantidadeDeItens: 3, total: 1234.5,
            dataDeEntrega: '2026-11-20', shareToken: 'tok-1',
        });
        expect(m.to).toBe('5511999990000');
        expect(m.template.name).toBe('opura_pedido_enviado');
        expect(m.template.language).toEqual({ code: 'pt_BR' });
        const corpo = m.template.components[0].parameters.map(p => p.text);
        expect(corpo[0]).toBe('Cimento SA');
        expect(corpo[1]).toBe('PO-7');
        expect(corpo[2]).toBe('Garden');
        expect(corpo[3]).toBe('3');
        expect(corpo[4].replace(/\s/g, ' ')).toBe('R$ 1.234,50');
        expect(corpo[5]).toBe('20/11/2026');
        expect(m.template.components[1]).toEqual({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'tok-1' }] });
    });

    it('parâmetro vazio ganha valor de reserva (a Meta recusa texto vazio)', () => {
        const m = montarMensagemDoPedido({
            para: '55', template: 't', fornecedor: '', numeroDoPedido: '', obra: '  ',
            quantidadeDeItens: 0, total: NaN, dataDeEntrega: undefined, shareToken: 'x',
        });
        const corpo = m.template.components[0].parameters.map(p => p.text);
        expect(corpo.slice(0, 3)).toEqual(['Fornecedor', '—', 'Obra']);
        expect(corpo[4].replace(/\s/g, ' ')).toBe('R$ 0,00');
        expect(corpo[5]).toBe('A definir');
    });
});
