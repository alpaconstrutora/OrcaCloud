import { describe, expect, it } from 'vitest';
import {
    validarPedido, cpfValido, mascararCpf, formatarCpf, respostaDoErroDaRpc, codigoDeSeisDigitos,
    materialDoCodigo, sha256Hex, ipDoPedido, pareceUmPdf, pastaDaOrigem, caminhoDoAssinado,
    linkParaAssinar, sanitizarWinAnsi, blocosDoManifesto, quebrarLinhas, TERMO_DE_ACEITE, TERMO_VERSAO,
} from '../supabase/functions/assinatura-interna/regras';

/**
 * Regras puras da Edge `assinatura-interna`
 * (docs/planos/2026-11-21-assinatura-eletronica-interna.md, F2).
 * Quem decide permissão e estado é o banco (scripts/teste-assinatura-interna.sql);
 * aqui: forma do pedido, CPF, mapa de erros, links e o texto do manifesto.
 */

const UUID = '11111111-2222-4333-8444-555555555555';
const UUID2 = '66666666-7777-4888-8999-aaaaaaaaaaaa';

describe('CPF', () => {
    it('confere os dígitos verificadores', () => {
        expect(cpfValido('529.982.247-25')).toBe(true);
        expect(cpfValido('52998224725')).toBe(true);
        expect(cpfValido('529.982.247-24')).toBe(false);
        expect(cpfValido('111.111.111-11')).toBe(false);
        expect(cpfValido('1234')).toBe(false);
        expect(cpfValido(null)).toBe(false);
    });
    it('mascara e formata', () => {
        expect(mascararCpf('52998224725')).toBe('***.982.247-**');
        expect(formatarCpf('52998224725')).toBe('529.982.247-25');
        expect(mascararCpf('x')).toBe('***');
    });
});

describe('validarPedido', () => {
    it('criar exige origem, documento e signatários válidos', () => {
        const ok = validarPedido({
            acao: 'criar', origem_tipo: 'DEAL_DOC', origem_id: UUID,
            signatarios: [{ canal: 'PORTAL_CLIENTE', client_id: UUID2 }, { canal: 'LINK', nome: ' Ana ', email: 'ANA@x.com', cpf: '529.982.247-25' }],
        });
        expect(ok.ok).toBe(true);
        if (ok.ok && ok.pedido.acao === 'criar') {
            expect(ok.pedido.signatarios[1]).toEqual({ canal: 'LINK', nome: 'Ana', email: 'ana@x.com', cpf: '52998224725' });
        }
        expect(validarPedido({ acao: 'criar', origem_tipo: 'X', origem_id: UUID, signatarios: [{}] }).ok).toBe(false);
        expect(validarPedido({ acao: 'criar', origem_tipo: 'CDV', origem_id: UUID, signatarios: [] }).ok).toBe(false);
        const testemunhaRuim = validarPedido({ acao: 'criar', origem_tipo: 'CDV', origem_id: UUID, signatarios: [{ canal: 'LINK', nome: 'A', email: 'a@x.com', cpf: '123' }] });
        expect(testemunhaRuim).toEqual({ ok: false, erro: 'CPF inválido para A.' });
        const muitos = Array.from({ length: 13 }, () => ({ canal: 'PORTAL_CLIENTE', client_id: UUID2 }));
        expect(validarPedido({ acao: 'criar', origem_tipo: 'CDV', origem_id: UUID, signatarios: muitos }).ok).toBe(false);
    });

    it('nenhum pedido carrega organização: ela sai da linha de origem', () => {
        const r = validarPedido({ acao: 'criar', origem_tipo: 'CDV', origem_id: UUID, organizationId: UUID2, signatarios: [{ canal: 'PORTAL_CLIENTE', client_id: UUID2 }] });
        expect(r.ok).toBe(true);
        if (r.ok) expect(Object.keys(r.pedido).sort()).toEqual(['acao', 'expira_dias', 'origem_id', 'origem_tipo', 'signatarios', 'titulo']);
    });

    it('portal e link exigem credencial; membro não usa credencial do corpo', () => {
        expect(validarPedido({ acao: 'ver', signatario_id: UUID, canal: 'PORTAL_CLIENTE' }).ok).toBe(false);
        expect(validarPedido({ acao: 'ver', signatario_id: UUID, canal: 'LINK', credencial: 't' }).ok).toBe(true);
        const membro = validarPedido({ acao: 'pedir_codigo', signatario_id: UUID, canal: 'MEMBRO', credencial: 'ignorada' });
        expect(membro.ok && membro.pedido.acao === 'pedir_codigo' && membro.pedido.credencial).toBe(null);
        expect(validarPedido({ acao: 'ver', signatario_id: UUID, canal: 'OUTRO', credencial: 't' }).ok).toBe(false);
    });

    it('assinar exige 6 dígitos, CPF, aceite true e versão do termo', () => {
        const base = { acao: 'assinar', signatario_id: UUID, canal: 'PORTAL_CLIENTE', credencial: 'tok', codigo: '012345', cpf: '529.982.247-25', aceite: true, termo_versao: TERMO_VERSAO };
        expect(validarPedido(base).ok).toBe(true);
        expect(validarPedido({ ...base, codigo: '12345' }).ok).toBe(false);
        expect(validarPedido({ ...base, aceite: 'true' }).ok).toBe(false);
        expect(validarPedido({ ...base, cpf: '' }).ok).toBe(false);
        expect(validarPedido({ ...base, termo_versao: '' }).ok).toBe(false);
    });

    it('recusa corpo que não é objeto e ação desconhecida', () => {
        expect(validarPedido(null).ok).toBe(false);
        expect(validarPedido([]).ok).toBe(false);
        expect(validarPedido({ acao: 'apagar' }).ok).toBe(false);
    });
});

describe('respostaDoErroDaRpc', () => {
    it('mapeia os SQLSTATE do banco', () => {
        expect(respostaDoErroDaRpc({ code: '42501', message: 'detalhe interno' })).toEqual({ status: 403, erro: 'Assinatura não encontrada ou sem permissão.' });
        expect(respostaDoErroDaRpc({ code: '54000', message: 'Aguarde um minuto' }).status).toBe(429);
        expect(respostaDoErroDaRpc({ code: '22023', message: 'Já assinada' })).toEqual({ status: 400, erro: 'Já assinada' });
        expect(respostaDoErroDaRpc({ code: 'P0002' }).status).toBe(404);
        expect(respostaDoErroDaRpc({ code: 'XX000', message: 'segredo do banco' })).toEqual({ status: 500, erro: 'Não foi possível concluir agora. Tente de novo.' });
    });
});

describe('código e hash', () => {
    it('sempre 6 dígitos', () => {
        expect(codigoDeSeisDigitos(0)).toBe('000000');
        expect(codigoDeSeisDigitos(4294967295)).toBe('967295');
        expect(codigoDeSeisDigitos(123)).toBe('000123');
    });
    it('o hash amarra o código ao signatário', async () => {
        const a = await sha256Hex(materialDoCodigo(UUID, '123456'));
        const b = await sha256Hex(materialDoCodigo(UUID2, '123456'));
        expect(a).toMatch(/^[0-9a-f]{64}$/);
        expect(a).not.toBe(b);
        expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });
});

describe('IP, PDF, pastas e links', () => {
    it('IP vem do primeiro item do x-forwarded-for', () => {
        const h = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });
        expect(ipDoPedido(h({ 'x-forwarded-for': '200.1.2.3, 10.0.0.1' }))).toBe('200.1.2.3');
        expect(ipDoPedido(h({ 'cf-connecting-ip': '200.9.9.9' }))).toBe('200.9.9.9');
        expect(ipDoPedido(h({}))).toBe(null);
    });
    it('reconhece PDF pelo cabeçalho', () => {
        expect(pareceUmPdf(new TextEncoder().encode('%PDF-1.7\n...'))).toBe(true);
        expect(pareceUmPdf(new TextEncoder().encode('<html>'))).toBe(false);
    });
    it('pasta da origem e do assinado', () => {
        const org = 'org-1';
        expect(pastaDaOrigem({ origem_tipo: 'DEAL_DOC', organization_id: org, deal_id: 'd1' })).toBe('org-1/negociacoes/d1/');
        expect(pastaDaOrigem({ origem_tipo: 'CDV', organization_id: org, contract_id: 'c1', owner_type: 'CONTRACT', owner_id: 'c1' })).toBe('contract-minutas/c1/');
        expect(pastaDaOrigem({ origem_tipo: 'CDV', organization_id: org, contract_id: 'c1', owner_type: 'ADDENDUM', owner_id: 'a1' })).toBe('contract-addendums/a1/');
        expect(caminhoDoAssinado({ origem_tipo: 'CDV', organization_id: org, contract_id: 'c1', owner_type: 'CONTRACT' }, 'e1')).toBe('contract-minutas/c1/assinado-e1.pdf');
        expect(pastaDaOrigem({ origem_tipo: 'DEAL_DOC', organization_id: org })).toBe(null);
    });
    it('link por canal; o token do link vai no fragmento', () => {
        expect(linkParaAssinar('https://app.x/', 'PORTAL_CLIENTE', 's1', 'tok')).toBe('https://app.x/portal-cliente?token=tok&assinar=s1');
        expect(linkParaAssinar('https://app.x', 'PORTAL_CORRETOR', 's1', 'tok')).toBe('https://app.x/portal-corretor?token=tok&assinar=s1');
        expect(linkParaAssinar('https://app.x', 'MEMBRO', 's1', null)).toBe('https://app.x/?assinar=s1');
        expect(linkParaAssinar('https://app.x', 'LINK', 's1', 'a+b')).toBe('https://app.x/assinar#s=s1&t=a%2Bb');
    });
});

describe('manifesto', () => {
    const env = { id: UUID, titulo: 'Proposta “Apto 101” — Torre A', emitente: 'Construtora X', criado_em: '2026-11-21T12:00:00Z', concluido_em: '2026-11-22T15:30:00Z', paginas: 3, original_sha256: 'a'.repeat(64) };
    const sig = { nome: 'Ana Souza', representa: null, papel: 'PARTE', canal: 'PORTAL_CLIENTE', email: 'ana@x.com', cpf: '52998224725', assinado_em: '2026-11-22T15:29:00Z', ip: '200.1.2.3', user_agent: 'Mozilla/5.0', termo_versao: TERMO_VERSAO };

    it('traz documento, cada signatário com a prova e o termo', () => {
        const blocos = blocosDoManifesto(env, [sig, { ...sig, nome: 'João', papel: 'REPRESENTANTE', representa: 'Construtora X', canal: 'MEMBRO' }], 'https://app.x/publico/validar-assinatura/' + UUID);
        const textoTodo = blocos.map(b => [b.titulo, ...b.linhas].join('\n')).join('\n');
        expect(textoTodo).toContain(`SHA-256 do documento original: ${'a'.repeat(64)}`);
        expect(textoTodo).toContain('1. Ana Souza - Parte');
        expect(textoTodo).toContain('2. João (por Construtora X) - Representante da empresa');
        expect(textoTodo).toContain('CPF: 529.982.247-25');
        expect(textoTodo).toContain('IP: 200.1.2.3');
        expect(textoTodo).toContain('22/11/2026 12:29:00 (horário de Brasília)');
        expect(textoTodo).toContain(sanitizarWinAnsi(TERMO_DE_ACEITE));
        expect(textoTodo).toContain('/publico/validar-assinatura/' + UUID);
    });

    it('sanitiza o que a fonte padrão do PDF não desenha', () => {
        expect(sanitizarWinAnsi('“Apto” — teste… ✓ 😀 ção')).toBe('"Apto" - teste...   ção');
    });

    it('quebra linhas pela largura e corta palavra gigante', () => {
        const medir = (t: string) => t.length;
        expect(quebrarLinhas('um dois três quatro', 9, medir)).toEqual(['um dois', 'três', 'quatro']);
        expect(quebrarLinhas('a'.repeat(25), 10, medir)).toEqual(['a'.repeat(10), 'a'.repeat(10), 'a'.repeat(5)]);
    });
});
