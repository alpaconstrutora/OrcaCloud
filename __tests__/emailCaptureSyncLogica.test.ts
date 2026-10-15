/**
 * Lógica pura da sincronização da caixa (supabase/functions/email-capture-sync/logica.ts).
 * Plano: docs/planos/2026-10-15-captura-boletos-por-email.md, item 3.2.
 */
import { describe, it, expect } from 'vitest';
import {
    encontrarPdfs,
    valoresDoCabecalho,
    caminhoNoStorage,
    criterioDeBusca,
    uidsNovos,
    hexDoHash,
} from '../supabase/functions/email-capture-sync/logica';

describe('encontrarPdfs — BODYSTRUCTURE do imapflow', () => {
    it('desce em multipart aninhado e acha os PDFs em ordem, com índice', () => {
        const raiz = {
            type: 'multipart/mixed',
            childNodes: [
                { type: 'multipart/alternative', childNodes: [
                    { part: '1.1', type: 'text/plain' },
                    { part: '1.2', type: 'text/html' },
                ] },
                { part: '2', type: 'application/pdf', dispositionParameters: { filename: 'boleto-out.pdf' }, size: 70_000 },
                { part: '3', type: 'image/png', parameters: { name: 'logo.png' } },
                { part: '4', type: 'application/octet-stream', parameters: { name: 'Fatura.PDF' }, size: 40_000 },
            ],
        };
        expect(encontrarPdfs(raiz)).toEqual([
            { parte: '2', nome: 'boleto-out.pdf', tamanho: 70_000, indice: 0 },
            { parte: '4', nome: 'Fatura.PDF', tamanho: 40_000, indice: 1 },
        ]);
    });

    it('mensagem de parte única que é o próprio PDF → parte "1"', () => {
        expect(encontrarPdfs({ type: 'application/pdf', parameters: { name: 'b.pdf' }, size: 10 }))
            .toEqual([{ parte: '1', nome: 'b.pdf', tamanho: 10, indice: 0 }]);
    });

    it('sem PDF → lista vazia; texto chamado .pdf não conta', () => {
        expect(encontrarPdfs({ type: 'multipart/mixed', childNodes: [{ part: '1', type: 'text/plain', parameters: { name: 'x.pdf' } }] })).toEqual([]);
        expect(encontrarPdfs(null)).toEqual([]);
    });

    it('PDF sem nome ganha nome pela parte', () => {
        expect(encontrarPdfs({ type: 'multipart/mixed', childNodes: [{ part: '2', type: 'application/pdf' }] })[0].nome).toBe('anexo-2.pdf');
    });
});

describe('valoresDoCabecalho', () => {
    it('devolve os valores na ordem e desdobra continuação de linha', () => {
        const bruto = 'Authentication-Results: mx.google.com;\r\n       dmarc=pass header.from=acme.com.br\r\nMessage-ID: <x@y>\r\nauthentication-results: outro; dmarc=pass\r\n';
        expect(valoresDoCabecalho(bruto, 'Authentication-Results')).toEqual([
            'mx.google.com; dmarc=pass header.from=acme.com.br',
            'outro; dmarc=pass',
        ]);
        expect(valoresDoCabecalho(new TextEncoder().encode(bruto), 'message-id')).toEqual(['<x@y>']);
        expect(valoresDoCabecalho(null, 'x')).toEqual([]);
    });
});

describe('caminho, busca e UIDs', () => {
    it('caminho no bucket igual ao do upload manual', () => {
        const agora = new Date('2026-10-15T12:00:00Z');
        expect(caminhoNoStorage('org-1', 'Boleto Outubro ç.pdf', agora)).toBe(`org-1/2026/${agora.getTime()}_Boleto_Outubro_c.pdf`);
    });

    it('busca começa depois do último UID e desde a data inicial', () => {
        expect(criterioDeBusca(41, '2026-10-01')).toEqual({ uid: '42:*', since: new Date('2026-10-01T00:00:00Z') });
        expect(criterioDeBusca(null, '2026-10-01').uid).toBe('1:*');
    });

    it('"n:*" que devolve a última mensagem já vista é filtrado', () => {
        expect(uidsNovos([41], 41)).toEqual([]);
        expect(uidsNovos([44, 42, 42, 43], 41)).toEqual([42, 43, 44]);
    });

    it('hash em hex', async () => {
        const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('abc'));
        expect(hexDoHash(h)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });
});
