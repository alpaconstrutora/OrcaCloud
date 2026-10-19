/**
 * Credor (fornecedor) no catálogo de campos do .docx — 19/10/2026.
 * Contrato de Suprimentos nunca tem cliente: a outra parte é o fornecedor de Dados Gerais.
 * Plano: docs/planos/2026-10-19-gerar-pelo-modelo-credor-modal.md
 */
import { describe, it, expect } from 'vitest';
import { resolveFields, fornecedorComoCliente, FIELD_GROUPS } from '../services/docxFieldCatalog';
import type { Supplier } from '../types/users';

const DEBORA = {
    id: 's-1', name: 'Débora Cristina Duarte', type: 'PF', document: '123.456.789-00',
    email: 'debora@x.com', phone: '(65) 99999-0000', contact_name: 'Débora',
    street: 'Rua das Flores', number: '10', neighborhood: 'Centro', city: 'Cuiabá', state: 'MT', zip_code: '78000-000',
} as Supplier;

describe('origem "Credor (fornecedor)"', () => {
    it('existe no catálogo (aparece no mapeamento de Modelos de documento)', () => {
        expect(FIELD_GROUPS.find(g => g.source === 'supplier')?.label).toBe('Credor (fornecedor)');
    });

    it('resolve os campos do fornecedor', () => {
        const out = resolveFields({
            a: { source: 'supplier', field: 'name' },
            b: { source: 'supplier', field: 'document' },
            c: { source: 'supplier', field: 'address_full' },
            d: { source: 'supplier', field: 'qualificacao' },
        }, { supplier: DEBORA });
        expect(out.a).toBe('Débora Cristina Duarte');
        expect(out.b).toBe('123.456.789-00');
        expect(out.c).toBe('Rua das Flores, 10 - Centro - Cuiabá/MT - CEP 78000-000');
        expect(out.d).toContain('Débora Cristina Duarte');
        expect(out.d).toContain('123.456.789-00');
    });

    it('endereço legado (`address`, sem `street`) também serve', () => {
        const out = resolveFields({ a: { source: 'supplier', field: 'street' } },
            { supplier: { ...DEBORA, street: undefined, address: 'Av. Legada' } as Supplier });
        expect(out.a).toBe('Av. Legada');
    });
});

describe('fornecedorComoCliente — modelos mapeados por Cliente/Compradores', () => {
    it('as origens client e buyers leem o fornecedor quando ele ocupa o lugar do cliente', () => {
        const client = fornecedorComoCliente(DEBORA);
        const out = resolveFields({
            n: { source: 'buyers', field: 'names' },
            t: { source: 'buyers', field: 'documents' },
            r: { source: 'buyers', field: 'address' },
            u: { source: 'client', field: 'state' },
        }, { client });
        expect(out).toEqual({ n: 'Débora Cristina Duarte', t: '123.456.789-00', r: 'Rua das Flores', u: 'MT' });
    });

    it('contato NÃO vira representante legal (não inventa quem assina)', () => {
        expect(fornecedorComoCliente({ ...DEBORA, type: 'PJ' } as Supplier)?.legal_rep_name).toBeUndefined();
    });

    it('sem fornecedor, nada', () => {
        expect(fornecedorComoCliente(null)).toBeNull();
    });
});
