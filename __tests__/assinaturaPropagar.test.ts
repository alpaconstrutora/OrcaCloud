import { describe, expect, it } from 'vitest';
import { propagarVersao, propagarDocumentoDaNegociacao } from '../supabase/functions/_shared/assinaturaPropagar';

/**
 * A regra única de "documento assinado" — ZapSign (webhook) e assinatura interna
 * (docs/planos/2026-11-21-assinatura-eletronica-interna.md, F2). Admin falso que
 * registra cada UPDATE com seus filtros.
 */

type Chamada = { tabela: string; valores: Record<string, unknown>; filtros: [string, unknown][] };

function adminFalso(erroEm?: string) {
    const chamadas: Chamada[] = [];
    const admin = {
        from(tabela: string) {
            return {
                update(valores: Record<string, unknown>) {
                    const c: Chamada = { tabela, valores, filtros: [] };
                    chamadas.push(c);
                    const resultado = { error: erroEm === tabela ? { message: 'falhou' } : null };
                    const encadeavel = {
                        eq(coluna: string, valor: unknown) {
                            c.filtros.push([coluna, valor]);
                            return encadeavel;
                        },
                        then(ok: (r: typeof resultado) => unknown, falha?: (e: unknown) => unknown) {
                            return Promise.resolve(resultado).then(ok, falha);
                        },
                    };
                    return encadeavel;
                },
            };
        },
    };
    return { admin, chamadas };
}

const QUANDO = '2026-11-22T10:00:00.000Z';

describe('propagarVersao', () => {
    it('CONTRATO do contrato sobe para contracts', async () => {
        const { admin, chamadas } = adminFalso();
        await propagarVersao(admin, { id: 'v1', owner_type: 'CONTRACT', owner_id: 'c1', kind: 'CONTRATO' }, { assinado: true, arquivo: 'contract-minutas/c1/assinado-e1.pdf', quando: QUANDO });
        expect(chamadas.map(c => c.tabela)).toEqual(['contract_document_versions', 'contracts']);
        expect(chamadas[1]).toEqual({
            tabela: 'contracts',
            valores: { signature_status: 'SIGNED', signature_completed_at: QUANDO, signed_contract_url: 'contract-minutas/c1/assinado-e1.pdf' },
            filtros: [['id', 'c1']],
        });
    });

    it('MINUTA e ANEXO assinados NÃO mexem no contrato', async () => {
        for (const kind of ['MINUTA', 'ANEXO']) {
            const { admin, chamadas } = adminFalso();
            await propagarVersao(admin, { id: 'v1', owner_type: 'CONTRACT', owner_id: 'c1', kind }, { assinado: true, arquivo: 'x.pdf', quando: QUANDO });
            expect(chamadas.map(c => c.tabela)).toEqual(['contract_document_versions']);
            expect(chamadas[0].valores).toEqual({ signature_status: 'SIGNED', signature_completed_at: QUANDO, signed_file_url: 'x.pdf' });
        }
    });

    it('versão de aditivo vai para contract_addendums, não para o contrato', async () => {
        const { admin, chamadas } = adminFalso();
        await propagarVersao(admin, { id: 'v2', owner_type: 'ADDENDUM', owner_id: 'a1', kind: 'ADITIVO' }, { assinado: true, arquivo: 'y.pdf', quando: QUANDO });
        expect(chamadas.map(c => [c.tabela, c.filtros])).toEqual([
            ['contract_document_versions', [['id', 'v2']]],
            ['contract_addendums', [['id', 'a1']]],
        ]);
        expect(chamadas[1].valores).toEqual({ signature_status: 'SIGNED', signature_completed_at: QUANDO, signed_document_url: 'y.pdf' });
    });

    it('evento intermediário do ZapSign: SENT, sem data nem arquivo', async () => {
        const { admin, chamadas } = adminFalso();
        await propagarVersao(admin, { id: 'v1', owner_type: 'CONTRACT', owner_id: 'c1', kind: 'CONTRATO' }, { assinado: false, arquivo: 'ignorado.pdf', quando: QUANDO });
        expect(chamadas.map(c => c.valores)).toEqual([{ signature_status: 'SENT' }, { signature_status: 'SENT' }]);
    });

    it('fluxo interno só atualiza a versão que ainda aponta o envelope', async () => {
        const { admin, chamadas } = adminFalso();
        await propagarVersao(admin, { id: 'v1', owner_type: 'CONTRACT', owner_id: 'c1', kind: 'MINUTA' }, { assinado: true, arquivo: 'x.pdf', quando: QUANDO }, { envelopeId: 'e1' });
        expect(chamadas[0].filtros).toEqual([['id', 'v1'], ['assinatura_envelope_id', 'e1']]);
    });

    it('erro de banco não passa calado', async () => {
        const { admin } = adminFalso('contracts');
        await expect(propagarVersao(admin, { id: 'v1', owner_type: 'CONTRACT', owner_id: 'c1', kind: 'CONTRATO' }, { assinado: true, quando: QUANDO })).rejects.toThrow('contrato: falhou');
    });
});

describe('propagarDocumentoDaNegociacao', () => {
    it('grava a projeção no documento que aponta o envelope', async () => {
        const { admin, chamadas } = adminFalso();
        await propagarDocumentoDaNegociacao(admin, 'd1', 'e1', { arquivo: 'org/negociacoes/deal/assinado-e1.pdf', quando: QUANDO });
        expect(chamadas).toEqual([{
            tabela: 'commercial_deal_documents',
            valores: { signature_status: 'SIGNED', signed_path: 'org/negociacoes/deal/assinado-e1.pdf', signed_at: QUANDO },
            filtros: [['id', 'd1'], ['assinatura_envelope_id', 'e1']],
        }]);
    });
});
