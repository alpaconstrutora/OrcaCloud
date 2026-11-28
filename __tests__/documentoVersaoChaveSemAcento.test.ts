/**
 * Gerenciar Negociação › Contrato › Documentos › Nova versão (27/11/2026): "Erro ao
 * subir documento" — POST .../documents/contract-minutas/.../CONTRATO_LOCAÇÃO_-_Ivana_r1.pdf
 * → 400. Reproduzido: o Storage responde `InvalidKey` para chave com acento. A chave
 * passa por sanitizeFileName; o nome EXIBIDO da versão continua o original.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const enviados: string[] = [];
const inseridos: Record<string, unknown>[] = [];

vi.mock('../lib/supabase', () => {
    const cadeia = (tabela: string) => {
        const b: Record<string, unknown> = {};
        Object.assign(b, {
            select: () => b, eq: () => b, order: () => b, limit: () => b, in: () => b, update: () => b,
            insert: (p: Record<string, unknown>) => { if (tabela === 'contract_document_versions') inseridos.push(p); return b; },
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: { id: 'v1' }, error: null }),
            then: (r: (v: unknown) => void) => r({ data: [], error: null }),
        });
        return b;
    };
    return {
        supabase: {
            from: (t: string) => cadeia(t),
            storage: { from: () => ({ upload: async (path: string) => { enviados.push(path); return { error: null }; } }) },
        },
    };
});

import { contractDocumentVersionService } from '../services/contractDocumentVersionService';

beforeEach(() => {
    enviados.length = 0; inseridos.length = 0;
    vi.spyOn(contractDocumentVersionService, '_syncMinutaMirror').mockResolvedValue(undefined);
});

const arquivo = (nome: string) => new File(['%PDF-1.4'], nome, { type: 'application/pdf' });

describe('Nova versão de documento — chave do Storage sem acento', () => {
    it('o caso real: "CONTRATO LOCAÇÃO - Ivana r1.pdf"', async () => {
        await contractDocumentVersionService.addVersion({
            ownerType: 'CONTRACT', ownerId: 'c1', contractId: 'c1', organizationId: 'org1',
            file: arquivo('CONTRATO LOCAÇÃO - Ivana r1.pdf'),
        });
        expect(enviados).toHaveLength(1);
        expect(enviados[0]).toMatch(/^contract-minutas\/c1\/\d+-CONTRATO_LOCACAO_-_Ivana_r1\.pdf$/);
        // só [A-Za-z0-9._/-]: o que o Storage aceita
        expect(enviados[0]).toMatch(/^[A-Za-z0-9._/-]+$/);
        // o nome que aparece na tabela continua o do arquivo, com acento
        expect(inseridos[0]).toMatchObject({ name: 'CONTRATO LOCAÇÃO - Ivana r1', storage_path: enviados[0] });
    });

    it('aditivo e documento gerado também saem sem acento', async () => {
        await contractDocumentVersionService.addVersionFromBlob({
            ownerType: 'ADDENDUM', ownerId: 'ad4', contractId: 'c1', organizationId: 'org1',
            blob: new Blob(['%PDF'], { type: 'application/pdf' }),
            fileName: 'CTL-006-012-0001 - Aditivo AD-004 ao Contrato de Locação.pdf',
        });
        expect(enviados[0]).toMatch(/^contract-addendums\/ad4\/\d+-CTL-006-012-0001_-_Aditivo_AD-004_ao_Contrato_de_Locacao\.pdf$/);
    });
});
