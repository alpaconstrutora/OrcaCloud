/**
 * PDF protegido por senha (15/10/2026 — docs/planos/2026-10-15-captura-boletos-por-email.md, S1/S2).
 *
 * O 1º boleto lido da caixa real (Energisa) era um PDF com senha e foi gravado
 * com "PDF sem camada de texto" — aviso errado, que mandava procurar o problema
 * no lugar errado. Aqui fica travado: senha → aviso de senha, nos dois leitores.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: { workerSrc: 'x' },
    getDocument: () => ({
        promise: Promise.reject(Object.assign(new Error('No password given'), { name: 'PasswordException' })),
    }),
}));

import { extractFromPdfFile } from '../utils/boletoParser';
import { ehErroDeSenha, resultadoPdfComSenha, ERRO_PDF_COM_SENHA, ERRO_SEM_TEXTO } from '../utils/boletoTexto';

describe('PDF protegido por senha', () => {
    it('ehErroDeSenha reconhece o PasswordException do pdf.js/unpdf', () => {
        expect(ehErroDeSenha(Object.assign(new Error('No password given'), { name: 'PasswordException' }))).toBe(true);
        expect(ehErroDeSenha(new Error('Incorrect Password'))).toBe(true);
        expect(ehErroDeSenha(new Error('Invalid PDF structure'))).toBe(false);
        expect(ehErroDeSenha(null)).toBe(false);
    });

    it('resultado próprio: aviso de senha, nunca o de "sem camada de texto"', () => {
        const r = resultadoPdfComSenha();
        expect(r.erros).toEqual([ERRO_PDF_COM_SENHA]);
        expect(r.erros).not.toContain(ERRO_SEM_TEXTO);
        expect(r.raw.protegidoPorSenha).toBe(true);
        expect(r.campos.linha_digitavel.valor).toBeNull();
    });

    it('upload na tela: o PasswordException do pdf.js vira o aviso de senha, sem exceção', async () => {
        const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'conta.pdf', { type: 'application/pdf' });
        const r = await extractFromPdfFile(file);
        expect(r.erros).toEqual([ERRO_PDF_COM_SENHA]);
    });
});
