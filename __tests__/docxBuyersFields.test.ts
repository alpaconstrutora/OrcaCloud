import { describe, expect, it } from 'vitest';
import { resolveFields, FIELD_GROUPS, ResolveContext } from '../services/docxFieldCatalog';
import { Client } from '../types/users';

/**
 * Origem `buyers` do catálogo da minuta — todos os compradores com o MESMO peso
 * (docs/planos/2026-09-12-vendas-multiplos-compradores.md). Sem ela, uma
 * venda em casal saía do .docx com um comprador só (a origem `client` é o
 * `contracts.client_id`, que aponta para um único cadastro).
 */
const ana: Client = {
    id: 'a', name: 'Ana Silva', type: 'PF', document: '111.111.111-11', email: 'ana@x.com',
    nationality: 'Brasileira', profession: 'Engenheira', marital_status: 'Casada', marital_regime: 'Comunhão parcial',
    address: 'Rua A', address_number: '10', neighborhood: 'Centro', city: 'Campinas', state: 'SP', zip_code: '13000-000',
} as Client;
const bruno: Client = {
    id: 'b', name: 'Bruno Souza', type: 'PF', document: '222.222.222-22', email: 'bruno@x.com',
} as Client;
const empresa: Client = { id: 'c', name: 'Casa Ltda', type: 'PJ', document: '00.000.000/0001-00' } as Client;

const tokens = {
    '001': { source: 'buyers' as const, field: 'names' },
    '002': { source: 'buyers' as const, field: 'documents' },
    '003': { source: 'buyers' as const, field: 'count' },
    '004': { source: 'buyers' as const, field: 'count_ext' },
    '005': { source: 'buyers' as const, field: 'qualificacao' },
    '006': { source: 'buyers' as const, field: 'names_documents' },
    '007': { source: 'buyers' as const, field: 'emails' },
    '008': { source: 'client' as const, field: 'name' },
};

describe('minuta · origem "buyers" — compradores com o mesmo peso', () => {
    it('o grupo existe no catálogo, com rótulo em pt-BR', () => {
        const g = FIELD_GROUPS.find(x => x.source === 'buyers');
        expect(g?.label).toBe('Compradores (todos)');
        expect(g?.fields.map(f => f.field)).toEqual(
            expect.arrayContaining(['names', 'documents', 'emails', 'count', 'count_ext', 'qualificacao', 'names_documents']),
        );
    });

    it('dois compradores: "A e B", CPFs de ambos, qualificação de ambos', () => {
        const ctx: ResolveContext = { client: ana, buyers: [ana, bruno] };
        const r = resolveFields(tokens, ctx);
        expect(r['001']).toBe('Ana Silva e Bruno Souza');
        expect(r['002']).toBe('111.111.111-11 e 222.222.222-22');
        expect(r['003']).toBe('2');
        expect(r['004']).toBe('dois');
        expect(r['005']).toContain('Ana Silva, brasileira, casada sob o regime de comunhão parcial');
        expect(r['005']).toContain('; e Bruno Souza');
        expect(r['006']).toBe('Ana Silva (CPF 111.111.111-11) e Bruno Souza (CPF 222.222.222-22)');
        expect(r['007']).toBe('ana@x.com, bruno@x.com');
        // A origem `client` continua sendo o cliente do contrato — não muda.
        expect(r['008']).toBe('Ana Silva');
    });

    it('três compradores enumeram com vírgula e "e" só antes do último', () => {
        const r = resolveFields(tokens, { buyers: [ana, bruno, empresa] });
        expect(r['001']).toBe('Ana Silva, Bruno Souza e Casa Ltda');
        expect(r['006']).toContain('Casa Ltda (CNPJ 00.000.000/0001-00)');
        expect(r['004']).toBe('três');
    });

    it('sem a origem buyers, cai no client (negociação de um comprador só)', () => {
        const r = resolveFields(tokens, { client: bruno });
        expect(r['001']).toBe('Bruno Souza');
        expect(r['003']).toBe('1');
    });

    it('sem comprador nenhum, tudo em branco — nunca "undefined"', () => {
        const r = resolveFields(tokens, {});
        expect(Object.values(r).every(v => v === '')).toBe(true);
    });
});
