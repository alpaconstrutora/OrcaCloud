/**
 * Regras da Edge `pedido-recebimento` (validação do corpo e tradução de erro).
 * docs/planos/2026-11-27-recebimento-mobile.md, Fase 3.
 */
import { describe, it, expect } from 'vitest';
import { validarPedido, acaoDaCota, respostaDoErro, pathDoDocumento, MENSAGEM_CONFLITO } from '../supabase/functions/pedido-recebimento/regras';

const PEDIDO = '0a1b2c3d-1111-4222-8333-444455556666';
const REC = '9f8e7d6c-1111-4222-8333-444455556666';
const TOKEN = 'abcDEF_123-xyzxyzxyzxyzxyzxyzxyzxyzxyzxyz';

describe('validarPedido', () => {
    it('receber válido (com e sem token); itens normalizados', () => {
        const r = validarPedido({ acao: 'receber', orderId: PEDIDO, receiptId: REC, versao: 3, notas: '  ok  ',
            itens: [{ indice: 0, recebida: 6, restoDepois: true }, { indice: 1, recebida: 4, problema: 'quebrado', obs: ' 1 ' }] });
        expect(r).toEqual({ ok: true, pedido: { acao: 'receber', token: null, orderId: PEDIDO, receiptId: REC, versao: 3, notas: 'ok', foto: null,
            itens: [{ indice: 0, recebida: 6, problema: null, restoDepois: true, obs: null }, { indice: 1, recebida: 4, problema: 'quebrado', restoDepois: false, obs: '1' }] } });
        const t = validarPedido({ acao: 'receber', token: TOKEN, orderId: PEDIDO, receiptId: REC, versao: 0, itens: [{ indice: 0, recebida: 1 }], foto: `${PEDIDO}/receipt_${REC}.jpg` });
        expect(t.ok && t.pedido.token).toBe(TOKEN);
    });

    it.each([
        ['sem corpo', null, 'Corpo inválido.'],
        ['token curto', { acao: 'receber', token: 'abc', orderId: PEDIDO }, 'Link inválido.'],
        ['pedido não-uuid', { acao: 'receber', orderId: 'x' }, 'Pedido inválido.'],
        ['ação desconhecida', { acao: 'apagar', orderId: PEDIDO }, 'Ação inválida.'],
        ['receber sem receiptId', { acao: 'receber', orderId: PEDIDO, versao: 1, itens: [{ indice: 0, recebida: 1 }] }, 'Conferência sem identificador.'],
        ['receber sem versão', { acao: 'receber', orderId: PEDIDO, receiptId: REC, itens: [{ indice: 0, recebida: 1 }] }, 'Versão do pedido inválida.'],
        ['receber sem itens', { acao: 'receber', orderId: PEDIDO, receiptId: REC, versao: 1, itens: [] }, 'Itens da conferência inválidos.'],
        ['item com quantidade texto', { acao: 'receber', orderId: PEDIDO, receiptId: REC, versao: 1, itens: [{ indice: 0, recebida: '5' }] }, 'Itens da conferência inválidos.'],
        ['item com problema estranho', { acao: 'receber', orderId: PEDIDO, receiptId: REC, versao: 1, itens: [{ indice: 0, recebida: 1, problema: 'sumiu' }] }, 'Itens da conferência inválidos.'],
        ['retirada com data ruim', { acao: 'retirada', orderId: PEDIDO, versao: 1, data: '27/11/2026', employeeId: REC }, 'Data da retirada inválida.'],
        ['retirada sem colaborador', { acao: 'retirada', orderId: PEDIDO, versao: 1, data: '2026-11-27' }, 'Informe quem retirou.'],
        ['documento .exe', { acao: 'documento_subir', orderId: PEDIDO, nome: 'virus.exe', tamanho: 10 }, null],
        ['documento grande', { acao: 'documento_subir', orderId: PEDIDO, nome: 'nf.pdf', tamanho: 50 * 1024 * 1024 }, null],
        ['registrar fora da pasta', { acao: 'documento_registrar', orderId: PEDIDO, path: 'outro/x.pdf', nome: 'nf.pdf', tamanho: 10, categoria: 'NOTA_FISCAL' }, 'Arquivo fora da pasta do pedido.'],
        ['registrar com ..', { acao: 'documento_registrar', orderId: PEDIDO, path: `${PEDIDO}/../x.pdf`, nome: 'nf.pdf', tamanho: 10, categoria: 'NOTA_FISCAL' }, 'Arquivo fora da pasta do pedido.'],
        ['registrar categoria estranha', { acao: 'documento_registrar', orderId: PEDIDO, path: `${PEDIDO}/a_nf.pdf`, nome: 'nf.pdf', tamanho: 10, categoria: 'XPTO' }, 'Categoria inválida.'],
        ['assinar sem paths', { acao: 'assinar', orderId: PEDIDO, paths: [] }, 'Arquivos inválidos.'],
    ])('recusa: %s', (_n, corpo, erro) => {
        const r = validarPedido(corpo);
        expect(r.ok).toBe(false);
        if (erro && !r.ok) expect(r.erro).toBe(erro);
    });

    it('documento_registrar e assinar válidos', () => {
        expect(validarPedido({ acao: 'documento_registrar', orderId: PEDIDO, path: `${PEDIDO}/a_nf.pdf`, nome: 'nf.pdf', tamanho: 10, categoria: 'NOTA_FISCAL', tipo: 'application/pdf' }).ok).toBe(true);
        const a = validarPedido({ acao: 'assinar', orderId: PEDIDO, paths: ['a', 'a', 'b'] });
        expect(a.ok && a.pedido.acao === 'assinar' && a.pedido.paths).toEqual(['a', 'b']);
    });
});

it('acaoDaCota: uploads contam como "subir"', () => {
    expect(acaoDaCota('receber')).toBe('receber');
    expect(acaoDaCota('retirada')).toBe('retirada');
    expect(acaoDaCota('assinar')).toBe('assinar');
    expect(acaoDaCota('comprovante_subir')).toBe('subir');
    expect(acaoDaCota('documento_subir')).toBe('subir');
    expect(acaoDaCota('documento_registrar')).toBe('subir');
});

describe('respostaDoErro', () => {
    it.each([
        [{ code: '42501', message: 'link inválido ou vencido' }, 403, 'link inválido ou vencido', false],
        [{ code: '22023', message: 'O item 2 recebeu mais do que o saldo (4).' }, 400, 'O item 2 recebeu mais do que o saldo (4).', false],
        [{ code: '40001', message: 'CONFLICT: x' }, 409, MENSAGEM_CONFLITO, false],
        [{ code: '54000', message: 'Limite' }, 429, 'Limite', false],
        [{ code: 'XX000', message: 'boom' }, 500, 'Falha ao registrar o recebimento. Tente de novo.', true],
    ])('%o → %s', (erro, status, msg, logar) => {
        expect(respostaDoErro(erro)).toEqual({ status, corpo: { error: msg }, logar });
    });
});

it('pathDoDocumento: pasta = pedido', () => {
    expect(pathDoDocumento(PEDIDO, 'u', 'nf.pdf')).toBe(`${PEDIDO}/u_nf.pdf`);
});
