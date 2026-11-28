/**
 * services/recebimentoFonte.ts — uma fonte, dois modos (app logado × link /celular).
 * docs/planos/2026-11-27-recebimento-mobile.md, Fases 4 e 5.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
    rpc: vi.fn(),
    invoke: vi.fn(),
    uploadToSignedUrl: vi.fn(),
    bucket: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: m.rpc,
        functions: { invoke: m.invoke },
        storage: { from: (b: string) => { m.bucket(b); return { uploadToSignedUrl: m.uploadToSignedUrl }; } },
    },
}));
vi.mock('../utils/comprimirFoto', () => ({ comprimirFoto: async (f: File) => f }));

import { criarFonteRecebimento, fraseDoFinanceiro, ErroDoRecebimento } from '../services/recebimentoFonte';

const TOKEN = 'abcDEF_123-xyzxyzxyzxyzxyzxyzxyzxyzxyzxyz';
const ok = (data: unknown) => ({ data, error: null });
/** Erro como o supabase-js devolve de uma Edge (FunctionsHttpError com a Response em `context`). */
const erroDaEdge = (status: number, error: string) => ({
    data: null,
    error: { context: { status, json: async () => ({ error }) } },
});

beforeEach(() => {
    m.rpc.mockReset(); m.invoke.mockReset(); m.uploadToSignedUrl.mockReset(); m.bucket.mockReset();
});

describe('leitura', () => {
    it('logado: recebimento_listar com a org do topo; abrir por recebimento_abrir', async () => {
        m.rpc.mockResolvedValue(ok([]));
        const f = criarFonteRecebimento({ orgId: 'org1' });
        expect(f.modo).toBe('logado');
        await f.listar();
        await f.abrir('po1');
        expect(m.rpc.mock.calls).toEqual([
            ['recebimento_listar', { p_org: 'org1' }],
            ['recebimento_abrir', { p_order: 'po1' }],
        ]);
    });

    it('logado em "Todas": p_org null', async () => {
        m.rpc.mockResolvedValue(ok(null));
        expect(await criarFonteRecebimento({ orgId: null }).listar()).toEqual([]);
        expect(m.rpc).toHaveBeenCalledWith('recebimento_listar', { p_org: null });
    });

    it('link: celular_recebimento_* com o token', async () => {
        m.rpc.mockResolvedValue(ok([]));
        const f = criarFonteRecebimento({ token: TOKEN });
        expect(f.modo).toBe('link');
        await f.listar();
        await f.abrir('po1');
        expect(m.rpc.mock.calls).toEqual([
            ['celular_recebimento_listar', { p_token: TOKEN }],
            ['celular_recebimento_abrir', { p_token: TOKEN, p_order: 'po1' }],
        ]);
    });

    it('link: recusa do token avisa aoRecusar; outro 42501 não', async () => {
        const aoRecusar = vi.fn();
        m.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'link inválido ou vencido' } });
        await expect(criarFonteRecebimento({ token: TOKEN, aoRecusar }).listar()).rejects.toBeInstanceOf(ErroDoRecebimento);
        expect(aoRecusar).toHaveBeenCalledTimes(1);
        m.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'pedido não encontrado ou sem permissão' } });
        await expect(criarFonteRecebimento({ token: TOKEN, aoRecusar }).abrir('x')).rejects.toThrow('pedido não encontrado');
        expect(aoRecusar).toHaveBeenCalledTimes(1);
    });
});

describe('gravação pela Edge pedido-recebimento', () => {
    const itens = [{ indice: 0, recebida: 5 }];

    it('logado, sem foto: só a ação receber, sem token', async () => {
        m.invoke.mockResolvedValue(ok({ receiptId: 'r1', status: 'Recebido', statusPedido: 'Recebido', versao: 4, jaExistia: false, financeiro: null }));
        const r = await criarFonteRecebimento({ orgId: null }).receber({ orderId: 'po1', receiptId: 'r1', versao: 3, itens, notas: null, foto: null });
        expect(m.invoke).toHaveBeenCalledWith('pedido-recebimento', { body: { acao: 'receber', orderId: 'po1', receiptId: 'r1', versao: 3, itens, notas: null, foto: null } });
        expect(r.status).toBe('Recebido');
    });

    it('link, com foto: sobe por URL assinada no bucket receipts e manda o path; token no corpo', async () => {
        m.invoke
            .mockResolvedValueOnce(ok({ path: 'po1/receipt_r1.jpg', token: 'tk-envio' }))
            .mockResolvedValueOnce(ok({ receiptId: 'r1', status: 'Parcial', statusPedido: 'Entregue', versao: 4, jaExistia: false, financeiro: null }));
        m.uploadToSignedUrl.mockResolvedValue({ error: null });
        const foto = new File(['x'], 'f.jpg', { type: 'image/jpeg' });
        await criarFonteRecebimento({ token: TOKEN }).receber({ orderId: 'po1', receiptId: 'r1', versao: 3, itens, notas: 'ok', foto });
        expect(m.invoke.mock.calls[0]).toEqual(['pedido-recebimento', { body: { acao: 'comprovante_subir', orderId: 'po1', receiptId: 'r1', token: TOKEN } }]);
        expect(m.bucket).toHaveBeenCalledWith('receipts');
        expect(m.uploadToSignedUrl).toHaveBeenCalledWith('po1/receipt_r1.jpg', 'tk-envio', foto, { contentType: 'image/jpeg' });
        expect(m.invoke.mock.calls[1][1].body).toMatchObject({ acao: 'receber', foto: 'po1/receipt_r1.jpg', token: TOKEN });
    });

    it('409 vira ErroDoRecebimento com a mensagem da Edge e status 409', async () => {
        m.invoke.mockResolvedValue(erroDaEdge(409, 'Este pedido foi alterado por outra pessoa. Recarregue e tente de novo.'));
        const p = criarFonteRecebimento({ orgId: null }).registrarRetirada({ orderId: 'po1', versao: 1, data: '2026-11-27', employeeId: 'e1' });
        await expect(p).rejects.toMatchObject({ status: 409, message: 'Este pedido foi alterado por outra pessoa. Recarregue e tente de novo.' });
    });

    it('link: 403 "link inválido ou vencido" da Edge derruba o gate', async () => {
        const aoRecusar = vi.fn();
        m.invoke.mockResolvedValue(erroDaEdge(403, 'link inválido ou vencido'));
        await expect(criarFonteRecebimento({ token: TOKEN, aoRecusar }).assinar('po1', ['a'])).rejects.toBeInstanceOf(ErroDoRecebimento);
        expect(aoRecusar).toHaveBeenCalledTimes(1);
    });

    it('documento: sobe no bucket do pedido e registra com categoria', async () => {
        m.invoke
            .mockResolvedValueOnce(ok({ path: 'po1/u_nf.pdf', token: 'tk' }))
            .mockResolvedValueOnce(ok({ documento: { id: 'd1' } }));
        m.uploadToSignedUrl.mockResolvedValue({ error: null });
        const nf = new File(['%PDF'], 'nf.pdf', { type: 'application/pdf' });
        await criarFonteRecebimento({ orgId: null }).enviarDocumento({ orderId: 'po1', file: nf, categoria: 'NOTA_FISCAL', descricao: null });
        expect(m.invoke.mock.calls[0][1].body).toEqual({ acao: 'documento_subir', orderId: 'po1', nome: 'nf.pdf', tamanho: 4 });
        expect(m.bucket).toHaveBeenCalledWith('purchase-order-documents');
        expect(m.invoke.mock.calls[1][1].body).toEqual({ acao: 'documento_registrar', orderId: 'po1', path: 'po1/u_nf.pdf', nome: 'nf.pdf', tamanho: 4, tipo: 'application/pdf', categoria: 'NOTA_FISCAL', descricao: null });
    });

    it('assinar sem paths não chama a Edge', async () => {
        expect(await criarFonteRecebimento({ orgId: null }).assinar('po1', [])).toEqual({});
        expect(m.invoke).not.toHaveBeenCalled();
    });
});

it('fraseDoFinanceiro', () => {
    expect(fraseDoFinanceiro(null)).toBeNull();
    expect(fraseDoFinanceiro({ gerou: 3 })).toBe('3 parcelas a pagar geradas.');
    expect(fraseDoFinanceiro({ gerou: 1 })).toBe('1 parcela a pagar gerada.');
    expect(fraseDoFinanceiro({ pulou: 'sem-nota', motivo: 'x' })).toBe('Parcelas a pagar: aguardando a nota fiscal.');
    expect(fraseDoFinanceiro({ falhou: 'boom' })).toMatch(/não foram geradas agora/);
    expect(fraseDoFinanceiro({ pulou: 'status', motivo: 'x' })).toBeNull();
});
