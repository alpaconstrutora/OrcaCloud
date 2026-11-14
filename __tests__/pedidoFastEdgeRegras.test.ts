import { describe, it, expect } from 'vitest';
import {
    validarPedido,
    pastaDoLote,
    pathDaFotoTemporaria,
    indiceDaFoto,
    pathDoAnexo,
    hojeEmBrasilia,
    nomeDoComprador,
    destinatariosDoAviso,
    MAX_BASE64_POR_FOTO,
} from '../supabase/functions/pedido-fast/regras';

// Edge `pedido-fast` — regras puras (docs/planos/2026-11-14-pedido-fast.md, Parte 1 item 5).

const UUID = '3f2a1c4e-9b7d-4e21-8a55-0c1d2e3f4a5b';
const foto = { base64: 'iVBORw0KGgo=', mediaType: 'image/png' };

describe('pedido-fast · validarPedido', () => {
    it('ler aceita 1 a 3 fotos JPEG/PNG/WEBP', () => {
        const r = validarPedido({ acao: 'ler', fotos: [foto] });
        expect(r).toEqual({ ok: true, pedido: { acao: 'ler', fotos: [foto], token: null } });
        expect(validarPedido({ acao: 'ler', fotos: [] }).ok).toBe(false);
        expect(validarPedido({ acao: 'ler', fotos: [foto, foto, foto, foto] }).ok).toBe(false);
    });

    it('ler recusa HEIC, base64 inválido e foto grande demais', () => {
        expect(validarPedido({ acao: 'ler', fotos: [{ base64: 'abc=', mediaType: 'image/heic' }] }))
            .toEqual({ ok: false, erro: 'Formato de foto não aceito — use JPEG, PNG ou WEBP.' });
        expect(validarPedido({ acao: 'ler', fotos: [{ base64: 'não é base64!', mediaType: 'image/jpeg' }] }).ok).toBe(false);
        expect(validarPedido({ acao: 'ler', fotos: [{ base64: 'A'.repeat(MAX_BASE64_POR_FOTO + 4), mediaType: 'image/jpeg' }] }).ok).toBe(false);
    });

    it('criar exige lote e obra uuid; o cliente nunca manda path', () => {
        const r = validarPedido({ acao: 'criar', lote: UUID.toUpperCase(), projectId: UUID });
        expect(r).toEqual({ ok: true, pedido: { acao: 'criar', lote: UUID, projectId: UUID, token: null } });
        expect(validarPedido({ acao: 'criar', lote: '../outro-usuario', projectId: UUID }).ok).toBe(false);
        expect(validarPedido({ acao: 'criar', lote: UUID, projectId: '' })).toEqual({ ok: false, erro: 'Escolha a obra.' });
    });

    it('token (Parte 2) só no formato do link; corpo e ação inválidos', () => {
        expect(validarPedido({ acao: 'ler', fotos: [foto], token: 'curto' }).ok).toBe(false);
        const r = validarPedido({ acao: 'ler', fotos: [foto], token: 'A'.repeat(32) });
        expect(r.ok && r.pedido.token).toBe('A'.repeat(32));
        expect(validarPedido(null).ok).toBe(false);
        expect(validarPedido([]).ok).toBe(false);
        expect(validarPedido({ acao: 'apagar' })).toEqual({ ok: false, erro: 'Ação desconhecida.' });
    });
});

describe('pedido-fast · paths do lote e do anexo', () => {
    it('lote sempre sob o usuário; foto numerada a partir de 1', () => {
        expect(pastaDoLote('u1', UUID)).toBe(`fast-tmp/u1/${UUID}`);
        expect(pathDaFotoTemporaria('u1', UUID, 0, 'image/jpeg')).toBe(`fast-tmp/u1/${UUID}/foto-1.jpg`);
        expect(pathDaFotoTemporaria('u1', UUID, 2, 'image/webp')).toBe(`fast-tmp/u1/${UUID}/foto-3.webp`);
        expect(indiceDaFoto('foto-2.png')).toBe(1);
        expect(indiceDaFoto('leitura.json')).toBeNull();
        expect(indiceDaFoto('foto-1.exe')).toBeNull();
    });

    it('anexo no formato de pedidoDocumentoService (orderId/uuid_nome), sem caracteres estranhos', () => {
        expect(pathDoAnexo('ped-1', 'abc', 'PC-EMP/OB 0001', 0, 'jpg')).toBe('ped-1/abc_PC-EMP_OB_0001-foto-1.jpg');
        expect(pathDoAnexo('ped-1', 'abc', '', 1, 'png')).toBe('ped-1/abc_pedido-foto-2.png');
    });
});

describe('pedido-fast · data, comprador e aviso', () => {
    it('hoje no fuso de Brasília (02:00Z ainda é ontem)', () => {
        expect(hojeEmBrasilia(new Date('2026-11-15T02:00:00Z'))).toBe('2026-11-14');
        expect(hojeEmBrasilia(new Date('2026-11-15T12:00:00Z'))).toBe('2026-11-15');
    });

    it('nome: perfil → membro → e-mail', () => {
        expect(nomeDoComprador('Iago Silva', 'Iago', 'iago@x.com')).toBe('Iago Silva');
        expect(nomeDoComprador('  ', 'Iago', 'iago@x.com')).toBe('Iago');
        expect(nomeDoComprador(null, null, 'iago.silva@x.com')).toBe('iago.silva');
        expect(nomeDoComprador(null, null, null)).toBe('comprador');
    });

    it('aviso: só owner/admin, sem o comprador, sem repetir, e-mail em minúscula', () => {
        const membros = [
            { email: 'Dono@x.com', role: 'owner' },
            { email: 'dono@x.com', role: 'admin' },
            { email: 'admin@x.com', role: 'admin' },
            { email: 'comprador@x.com', role: 'admin' },
            { email: 'membro@x.com', role: 'member' },
            { email: null, role: 'owner' },
        ];
        expect(destinatariosDoAviso(membros, 'Comprador@x.com')).toEqual(['dono@x.com', 'admin@x.com']);
    });
});

describe('pedido-fast · erros do link do celular (Parte 2)', () => {
    it('42501 → 403 com a mensagem do banco; a recusa do token sai igual à do gate', async () => {
        const { respostaDoErroDoLink, MENSAGEM_LINK_RECUSADO } = await import('../supabase/functions/pedido-fast/regras');
        const { MENSAGEM_LINK_RECUSADO: doGate } = await import('../services/celular/tarefasFonte');
        expect(MENSAGEM_LINK_RECUSADO).toBe(doGate);
        expect(respostaDoErroDoLink({ code: '42501', message: 'link inválido ou vencido' }))
            .toEqual({ status: 403, corpo: { error: 'link inválido ou vencido' }, logar: false });
        expect(respostaDoErroDoLink({ code: '42501', message: 'sem acesso a Pedidos de Compra' }).corpo.error)
            .toBe('sem acesso a Pedidos de Compra');
    });

    it('54000 → 429, 22023 → 400, resto → 500 logado', async () => {
        const { respostaDoErroDoLink } = await import('../supabase/functions/pedido-fast/regras');
        expect(respostaDoErroDoLink({ code: '54000', message: 'Limite de uso do link atingido — tente de novo na próxima hora.' }).status).toBe(429);
        expect(respostaDoErroDoLink({ code: '22023', message: 'ação inválida' }).status).toBe(400);
        expect(respostaDoErroDoLink({ code: 'XX000', message: 'boom' })).toMatchObject({ status: 500, logar: true });
        expect(respostaDoErroDoLink(null).status).toBe(500);
    });
});
