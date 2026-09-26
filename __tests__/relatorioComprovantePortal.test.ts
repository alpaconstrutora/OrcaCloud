/**
 * Comprovantes do relatório de rateio no PORTAL do condômino (26/09/2026).
 *
 * O condômino não alcança o bucket `boletos` (só membro da organização lê), então
 * o comprovante chega a ele JÁ ASSINADO pela Edge Function
 * `client-portal-rateio-comprovantes`. Estes testes travam as duas pontas que
 * tornam isso seguro e coerente com o lado do síndico:
 *
 *  1. `urlDoComprovante` usa a URL pronta quando vem do portal, e só assina com
 *     a sessão quando vem `{ bucket, path }` — o portal nunca tenta assinar
 *     (daria 400 e o anexo sumiria sem motivo).
 *  2. O resolvedor de origem é UM arquivo, importado pela tela do síndico e pela
 *     function. Ele tem de continuar sem `import`: a function roda em Deno, e um
 *     import do app nesse arquivo quebraria o deploy — ou pior, alguém copiaria
 *     a regra para a function e as duas divergiriam.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const assinar = vi.fn(async (bucket: string, path: string) => `https://assinado/${bucket}/${path}`);
vi.mock('../services/storageService', () => ({
    storageService: { createSignedUrl: (b: string, p: string) => assinar(b, p) },
}));

import { urlDoComprovante } from '../services/relatorioAnexos';
import { resolverOrigens, BUCKET_BOLETOS } from '../supabase/functions/_shared/origemDoLancamento';

beforeEach(() => assinar.mockClear());

describe('urlDoComprovante — portal traz a URL, síndico assina', () => {
    it('comprovante do portal usa a URL que a function assinou, sem assinar de novo', async () => {
        const url = await urlDoComprovante({ url: 'https://function/boleto.pdf', nome: 'boleto.pdf' });
        expect(url).toBe('https://function/boleto.pdf');
        expect(assinar).not.toHaveBeenCalled();
    });

    it('URL vazia (a function achou o arquivo mas não assinou) vira FALHA dita, não fetch de ""', async () => {
        await expect(urlDoComprovante({ url: '', nome: 'boleto.pdf' }))
            .rejects.toThrow(/não pôde ser liberado/);
        expect(assinar).not.toHaveBeenCalled();
    });

    it('comprovante do síndico ({ bucket, path }) assina com a sessão, no bucket DA ORIGEM', async () => {
        const url = await urlDoComprovante({ bucket: 'fiscal-documents', path: 'org/nf.xml', nome: 'nf.xml' });
        expect(assinar).toHaveBeenCalledWith('fiscal-documents', 'org/nf.xml');
        expect(url).toBe('https://assinado/fiscal-documents/org/nf.xml');
    });
});

describe('_shared/origemDoLancamento — um resolvedor, dois leitores', () => {
    it('não importa nada: precisa valer no app (Vite) e na Edge Function (Deno)', () => {
        const fonte = readFileSync(resolve(__dirname, '../supabase/functions/_shared/origemDoLancamento.ts'), 'utf-8');
        expect(fonte).not.toMatch(/^\s*import\s/m);
    });

    it('a Edge Function do portal usa ESTE resolvedor, não uma cópia', () => {
        const fonte = readFileSync(resolve(__dirname, '../supabase/functions/client-portal-rateio-comprovantes/index.ts'), 'utf-8');
        expect(fonte).toMatch(/from\s+["']\.\.\/_shared\/origemDoLancamento\.ts["']/);
        // Nenhuma consulta de origem reescrita dentro da function.
        expect(fonte).not.toMatch(/from\(['"](boletos|nfe_invoices|raw_documents|contracts|contract_document_versions)['"]\)/);
    });

    it('a Edge Function autoriza pela RPC do portal com a credencial do CHAMADOR antes de usar a service_role', () => {
        const fonte = readFileSync(resolve(__dirname, '../supabase/functions/client-portal-rateio-comprovantes/index.ts'), 'utf-8');
        const rpcToken = fonte.indexOf("rpc('client_portal_get_condominio'");
        const rpcCliente = fonte.indexOf("rpc('client_portal_get_condominio_for_client'");
        const serviceRole = fonte.indexOf('createClient(supabaseUrl, serviceRoleKey)');
        expect(rpcToken).toBeGreaterThan(0);
        expect(rpcCliente).toBeGreaterThan(0);
        expect(serviceRole).toBeGreaterThan(Math.max(rpcToken, rpcCliente));
        // E só aceita rateio que a RPC devolveu.
        expect(fonte).toMatch(/payload\.rateios[\s\S]*\.find\(/);
    });

    it('resolve com o client que recebe — o da function (service_role) serve igual ao do app', async () => {
        const consultas: string[] = [];
        const cliente = {
            from(tabela: string) {
                consultas.push(tabela);
                const q: any = {
                    select: () => q,
                    in: async () => ({
                        data: tabela === 'boletos'
                            ? [{ id: 'b-1', numero: 705, documento_path: 'org/705.pdf', documento_nome: 'Energisa 06-2020.pdf' }]
                            : [],
                        error: null,
                    }),
                };
                return q;
            },
        };
        const m = await resolverOrigens(cliente, [{ id: 'tx-1', source_system: 'BOLETO', reference_id: 'b-1' }]);
        expect(consultas).toEqual(['boletos']);
        expect(m.get('tx-1')).toEqual({
            codigo: '0705',
            documento: { bucket: BUCKET_BOLETOS, path: 'org/705.pdf', nome: 'Energisa 06-2020.pdf' },
        });
    });
});
