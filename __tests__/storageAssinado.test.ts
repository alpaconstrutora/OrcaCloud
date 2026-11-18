// Bucket PRIVADO (`documents`, `organization-assets`): o valor gravado vira
// caminho e o caminho vira URL ASSINADA na hora de usar.
// Código: supabase/functions/_shared/caminhoNoBucket.ts, lib/storageAssinado.ts,
// hooks/useUrlAssinada.ts. Plano: docs/planos/2026-11-18-seguranca-storage-privado.md
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createSignedUrl = vi.fn();
const createSignedUrls = vi.fn();
const invoke = vi.fn();
const from = vi.fn(() => ({ createSignedUrl, createSignedUrls }));

vi.mock('../lib/supabase', () => ({
    supabase: { storage: { from: (b: string) => from(b) }, functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

import { caminhoNoBucket, ehUrlExterna } from '../supabase/functions/_shared/caminhoNoBucket';
import {
    abrirArquivoAssinado, abrirDocumentoDoPortal, abrirEmNovaAba, urlAssinada,
    BUCKET_DOCUMENTOS, BUCKET_ARQUIVOS_DA_ORGANIZACAO, TTL_ABRIR_SEGUNDOS, TTL_EXIBIR_SEGUNDOS,
} from '../lib/storageAssinado';
import { assinarParaExibir, limparCacheDeUrlsAssinadas } from '../hooks/useUrlAssinada';

const PROJ = 'https://oxedkknreghxrgenyjiu.supabase.co';
const CONTRATO = '41c2ad2d-91cf-4d3d-8879-8fa16325bfa5';

describe('caminhoNoBucket — do valor gravado para o caminho no bucket', () => {
    it.each([
        // a URL pública que os escritores gravavam (getPublicUrl faz encodeURI)
        [`${PROJ}/storage/v1/object/public/documents/contract-minutas/${CONTRATO}/1781-CT-2026-002_1.pdf`,
            `contract-minutas/${CONTRATO}/1781-CT-2026-002_1.pdf`],
        // espaço e acento percent-encoded voltam ao nome real do objeto
        [`${PROJ}/storage/v1/object/public/documents/reports/x/Relat%C3%B3rio%20mensal.pdf`,
            'reports/x/Relatório mensal.pdf'],
        // URL assinada e autenticada: a query (token) sai
        [`${PROJ}/storage/v1/object/sign/documents/invoices/${CONTRATO}/nf.pdf?token=abc.def`, `invoices/${CONTRATO}/nf.pdf`],
        [`${PROJ}/storage/v1/object/authenticated/documents/a/b.pdf`, 'a/b.pdf'],
        [`${PROJ}/storage/v1/render/image/public/documents/gallery/o/x.png?width=200`, 'gallery/o/x.png'],
        // outro domínio do mesmo projeto (troca de domínio): o caminho sobrevive
        ['https://api.exemplo.com.br/storage/v1/object/public/documents/a/b.pdf', 'a/b.pdf'],
        // caminho cru (escritor novo) e a forma do GED
        [`contract-minutas/${CONTRATO}/v2.pdf`, `contract-minutas/${CONTRATO}/v2.pdf`],
        [`/contract-minutas/${CONTRATO}/v2.pdf`, `contract-minutas/${CONTRATO}/v2.pdf`],
        [`documents:contract-minutas/${CONTRATO}/v2.pdf`, `contract-minutas/${CONTRATO}/v2.pdf`],
        // nome com `#`, `?` e espaço num caminho cru é nome, não query
        ['a/NF #12 (final) ação?.pdf', 'a/NF #12 (final) ação?.pdf'],
        // ponto que não é o segmento inteiro
        ['a/1_a..b.pdf', 'a/1_a..b.pdf'],
        ['  a/b.pdf  ', 'a/b.pdf'],
    ])('%s → %s', (valor, esperado) => {
        expect(caminhoNoBucket(valor, 'documents')).toBe(esperado);
    });

    it.each([
        // outro bucket e URL de fora do Storage = URL externa, não caminho
        [`${PROJ}/storage/v1/object/public/boletos/a/b.pdf`],
        ['https://app.zapsign.com.br/verificar/abc.pdf'],
        [`${PROJ}/rest/v1/contracts?id=eq.1`],
        // outro esquema
        ['data:image/png;base64,AAAA'], ['blob:https://x/1'], ['organization-assets:a/b.png'],
        // vazio, pasta, segmento vazio
        [''], ['   '], ['a/'], ['a//b.pdf'], ['documents:'],
        // travessia, inclusive codificada, e controle
        ['../x.pdf'], ['a/../b.pdf'], ['a/./b.pdf'], ['a/%2e%2e/b.pdf'], ['a/%2E./b'], ['a\\..\\b'],
        ['a%2f..%2fb'], ['a/x%5c..%5cy'], ['a/\t../b'], ['a/b\n.pdf'], ['a/b\u0000.pdf'],
        [`${PROJ}/storage/v1/object/public/documents/a/../b.pdf`],
        [`${PROJ}/storage/v1/object/public/documents/a/%2e%2e/b.pdf`],
        [`${PROJ}/storage/v1/object/public/documents/a/x%2F..%2Fy.pdf`],
        [`${PROJ}/storage/v1/object/public/documents/a/%E0%A4%A.pdf`], // percent-encoding quebrado
        // não string
        [null], [undefined], [42],
    ])('recusa %s', (valor) => {
        expect(caminhoNoBucket(valor as unknown, 'documents')).toBeNull();
    });

    it('URL que o parser normaliza (`/documents/../boletos/`) é de OUTRO bucket — nunca vira caminho de documents', () => {
        expect(caminhoNoBucket(`${PROJ}/storage/v1/object/public/documents/../boletos/x.pdf`, 'documents')).toBeNull();
    });

    it('ehUrlExterna: só http(s) que não é deste bucket', () => {
        expect(ehUrlExterna('https://app.zapsign.com.br/x.pdf', 'documents')).toBe(true);
        expect(ehUrlExterna(`${PROJ}/storage/v1/object/public/documents/a/b.pdf`, 'documents')).toBe(false);
        expect(ehUrlExterna('a/b.pdf', 'documents')).toBe(false);
        expect(ehUrlExterna(null, 'documents')).toBe(false);
    });
});

describe('urlAssinada — assina o caminho, nunca devolve URL pública', () => {
    beforeEach(() => {
        createSignedUrl.mockReset();
        from.mockClear();
    });

    it('URL pública antiga: assina o caminho extraído, no bucket certo, com o TTL de abrir', async () => {
        createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/sign/ok?token=t' }, error: null });
        const url = await urlAssinada(BUCKET_DOCUMENTOS, `${PROJ}/storage/v1/object/public/documents/reports/o/Relat%C3%B3rio.pdf`);
        expect(url).toBe('https://x/sign/ok?token=t');
        expect(from).toHaveBeenCalledWith('documents');
        expect(createSignedUrl).toHaveBeenCalledWith('reports/o/Relatório.pdf', TTL_ABRIR_SEGUNDOS);
    });

    it('caminho cru também', async () => {
        createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/s' }, error: null });
        await urlAssinada(BUCKET_ARQUIVOS_DA_ORGANIZACAO, 'labor-documents/e/x.pdf', 60);
        expect(from).toHaveBeenCalledWith('organization-assets');
        expect(createSignedUrl).toHaveBeenCalledWith('labor-documents/e/x.pdf', 60);
    });

    it('URL externa volta como está, sem assinar', async () => {
        expect(await urlAssinada(BUCKET_DOCUMENTOS, 'https://app.zapsign.com.br/x.pdf')).toBe('https://app.zapsign.com.br/x.pdf');
        expect(createSignedUrl).not.toHaveBeenCalled();
    });

    it('vazio → null; travessia → erro sem chamar o Storage', async () => {
        expect(await urlAssinada(BUCKET_DOCUMENTOS, '')).toBeNull();
        expect(await urlAssinada(BUCKET_DOCUMENTOS, null)).toBeNull();
        await expect(urlAssinada(BUCKET_DOCUMENTOS, 'a/../b.pdf')).rejects.toThrow(/inválida/);
        expect(createSignedUrl).not.toHaveBeenCalled();
    });

    it('assinatura recusada pela policy vira mensagem legível', async () => {
        createSignedUrl.mockResolvedValue({ data: null, error: { message: 'new row violates row-level security policy' } });
        await expect(urlAssinada(BUCKET_DOCUMENTOS, 'a/b.pdf')).rejects.toThrow('Sem permissão para abrir este arquivo.');
        createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found' } });
        await expect(urlAssinada(BUCKET_DOCUMENTOS, 'a/b.pdf')).rejects.toThrow('Arquivo não encontrado.');
    });
});

/** Aba falsa: o que `window.open('', '_blank')` devolve. */
function abaFalsa() {
    return {
        opener: {} as unknown,
        closed: false,
        document: { title: '', body: { textContent: '' } },
        location: { replace: vi.fn() },
    };
}

describe('abrir em nova aba — a aba abre NO CLIQUE, antes da assinatura (bloqueio de pop-up)', () => {
    let open: ReturnType<typeof vi.fn>;
    let aba: ReturnType<typeof abaFalsa>;

    beforeEach(() => {
        createSignedUrl.mockReset();
        invoke.mockReset();
        aba = abaFalsa();
        open = vi.fn((url?: string) => (url ? ({}) : aba));
        vi.stubGlobal('window', { open });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('window.open é síncrono; opener zerado; a URL entra depois que assinou', async () => {
        let soltar!: (v: unknown) => void;
        createSignedUrl.mockReturnValue(new Promise(r => { soltar = r; }));

        const promessa = abrirArquivoAssinado(BUCKET_DOCUMENTOS, 'contract-minutas/c/v1.pdf');
        // Ainda não assinou — e a aba JÁ abriu, vazia, sem opener.
        expect(open).toHaveBeenCalledTimes(1);
        expect(open).toHaveBeenCalledWith('', '_blank');
        expect(aba.opener).toBeNull();
        expect(aba.location.replace).not.toHaveBeenCalled();

        soltar({ data: { signedUrl: 'https://x/sign/v1' }, error: null });
        await promessa;
        expect(aba.location.replace).toHaveBeenCalledWith('https://x/sign/v1');
        expect(open).toHaveBeenCalledTimes(1);
    });

    it('erro: a aba mostra o motivo (não fica em branco) e a promessa rejeita', async () => {
        createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found' } });
        await expect(abrirArquivoAssinado(BUCKET_DOCUMENTOS, 'a/b.pdf')).rejects.toThrow('Arquivo não encontrado.');
        expect(aba.document.body.textContent).toContain('Arquivo não encontrado.');
        expect(aba.location.replace).not.toHaveBeenCalled();
    });

    it('URL externa abre direto com noopener,noreferrer, sem aba vazia', async () => {
        await abrirArquivoAssinado(BUCKET_DOCUMENTOS, 'https://app.zapsign.com.br/x.pdf');
        expect(open).toHaveBeenCalledWith('https://app.zapsign.com.br/x.pdf', '_blank', 'noopener,noreferrer');
        expect(createSignedUrl).not.toHaveBeenCalled();
    });

    it('pop-up bloqueado no clique: tenta de novo com noopener depois de assinar', async () => {
        open = vi.fn((url?: string) => (url ? ({}) : null));
        vi.stubGlobal('window', { open });
        await abrirEmNovaAba(async () => 'https://x/s');
        expect(open).toHaveBeenLastCalledWith('https://x/s', '_blank', 'noopener,noreferrer');
    });

    it('portal com token: assina pela Edge Function, com a aba já aberta', async () => {
        let soltar!: (v: unknown) => void;
        invoke.mockReturnValue(new Promise(r => { soltar = r; }));
        const promessa = abrirDocumentoDoPortal({
            portal: 'cliente', token: 'tok', contratoId: CONTRATO,
            referencia: `${PROJ}/storage/v1/object/public/documents/contract-minutas/${CONTRATO}/v1.pdf`,
        });
        expect(open).toHaveBeenCalledWith('', '_blank');
        expect(invoke).toHaveBeenCalledWith('portal-documentos-download', {
            body: {
                portal: 'cliente', token: 'tok', workspaceId: undefined, contratoId: CONTRATO,
                referencia: `${PROJ}/storage/v1/object/public/documents/contract-minutas/${CONTRATO}/v1.pdf`,
            },
        });
        soltar({ data: { url: 'https://x/sign/portal' }, error: null });
        await promessa;
        expect(aba.location.replace).toHaveBeenCalledWith('https://x/sign/portal');
        expect(createSignedUrl).not.toHaveBeenCalled();
    });

    it('parceiro logado (sem token): vai pela function com o workspace', async () => {
        invoke.mockResolvedValue({ data: { url: 'https://x/s' }, error: null });
        await abrirDocumentoDoPortal({ portal: 'parceiro', workspaceId: 'ws', referencia: 'invoices/c/nf.pdf' });
        expect(invoke.mock.calls[0][1].body).toMatchObject({ portal: 'parceiro', workspaceId: 'ws', token: undefined });
    });

    it('pré-visualização do gestor (sem token nem workspace): assina com a sessão dele', async () => {
        createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/s' }, error: null });
        await abrirDocumentoDoPortal({ portal: 'investidor', token: null, referencia: 'reports/o/r.pdf' });
        expect(invoke).not.toHaveBeenCalled();
        expect(createSignedUrl).toHaveBeenCalledWith('reports/o/r.pdf', TTL_ABRIR_SEGUNDOS);
    });

    it('function recusou: a aba mostra o motivo que veio no corpo', async () => {
        invoke.mockResolvedValue({ data: null, error: { context: { json: async () => ({ error: 'Documento não disponível para este acesso' }) } } });
        await expect(abrirDocumentoDoPortal({ portal: 'cliente', token: 't', referencia: 'a/b.pdf' }))
            .rejects.toThrow('Documento não disponível para este acesso');
        expect(aba.document.body.textContent).toContain('Documento não disponível para este acesso');
    });
});

describe('assinarParaExibir — <img> de bucket privado, em lote e com cache', () => {
    beforeEach(() => {
        createSignedUrls.mockReset();
        limparCacheDeUrlsAssinadas();
    });

    it('uma requisição para a lista; URL antiga e caminho apontando para o mesmo arquivo assinam uma vez', async () => {
        createSignedUrls.mockResolvedValue({
            data: [
                { path: 'asset-photos/o/a1/f.webp', signedUrl: 'https://x/s1', error: null },
                { path: 'asset-photos/o/a2/g.webp', signedUrl: 'https://x/s2', error: null },
            ],
            error: null,
        });
        const antiga = `${PROJ}/storage/v1/object/public/organization-assets/asset-photos/o/a1/f.webp`;
        const mapa = await assinarParaExibir(BUCKET_ARQUIVOS_DA_ORGANIZACAO, [
            'asset-photos/o/a1/f.webp', antiga, 'asset-photos/o/a2/g.webp', null, '', 'https://cdn.exemplo.com/x.png',
        ]);
        expect(createSignedUrls).toHaveBeenCalledTimes(1);
        expect(createSignedUrls).toHaveBeenCalledWith(['asset-photos/o/a1/f.webp', 'asset-photos/o/a2/g.webp'], TTL_EXIBIR_SEGUNDOS);
        expect(mapa).toEqual({
            'asset-photos/o/a1/f.webp': 'https://x/s1',
            [antiga]: 'https://x/s1',
            'asset-photos/o/a2/g.webp': 'https://x/s2',
            'https://cdn.exemplo.com/x.png': 'https://cdn.exemplo.com/x.png',
        });

        // Segunda tela com a mesma foto: sai do cache, sem nova requisição.
        const denovo = await assinarParaExibir(BUCKET_ARQUIVOS_DA_ORGANIZACAO, ['asset-photos/o/a1/f.webp']);
        expect(denovo).toEqual({ 'asset-photos/o/a1/f.webp': 'https://x/s1' });
        expect(createSignedUrls).toHaveBeenCalledTimes(1);
    });

    it('assinatura recusada: a foto fica de fora (a tela mostra o substituto)', async () => {
        createSignedUrls.mockResolvedValue({ data: null, error: { message: 'policy' } });
        expect(await assinarParaExibir(BUCKET_ARQUIVOS_DA_ORGANIZACAO, ['labor-photos/o/e/x.jpg'])).toEqual({});
    });
});
