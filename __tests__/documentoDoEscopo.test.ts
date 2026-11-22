// Escopo do documento no download do Credit Room. Regra gêmea no banco:
// supabase/migrations/aplicar_20271122300000_credit_room_documentos_grupo.sql
// Código: supabase/functions/_shared/documentoDoEscopo.ts
import { describe, expect, it } from 'vitest';
import { documentoDoEscopo } from '../supabase/functions/_shared/documentoDoEscopo';

const DONA = '11111111-1111-4111-8111-111111111111';
const IRMA = '22222222-2222-4222-8222-222222222222';
const FORA = '33333333-3333-4333-8333-333333333333';

describe('documentoDoEscopo', () => {
    it('org dona sempre vale, em qualquer escopo', () => {
        expect(documentoDoEscopo(DONA, { organization_id: DONA })).toBe(true);
        expect(documentoDoEscopo(DONA, { organization_id: DONA, escopo: 'EMPRESA', grupo_organization_ids: [] })).toBe(true);
        expect(documentoDoEscopo(DONA, { organization_id: DONA, escopo: 'GRUPO', grupo_organization_ids: [IRMA] })).toBe(true);
    });

    it('org do grupo vale só quando o escopo é GRUPO', () => {
        expect(documentoDoEscopo(IRMA, { organization_id: DONA, escopo: 'GRUPO', grupo_organization_ids: [DONA, IRMA] })).toBe(true);
    });

    it('org fora do escopo é recusada, inclusive em GRUPO', () => {
        expect(documentoDoEscopo(FORA, { organization_id: DONA, escopo: 'GRUPO', grupo_organization_ids: [DONA, IRMA] })).toBe(false);
        expect(documentoDoEscopo(FORA, { organization_id: DONA })).toBe(false);
    });

    it('array nulo/ausente = nenhuma org de grupo', () => {
        expect(documentoDoEscopo(IRMA, { organization_id: DONA, escopo: 'GRUPO', grupo_organization_ids: null })).toBe(false);
        expect(documentoDoEscopo(IRMA, { organization_id: DONA, escopo: 'GRUPO' })).toBe(false);
    });

    it('EMPRESA com array velho recusa a irmã', () => {
        expect(documentoDoEscopo(IRMA, { organization_id: DONA, escopo: 'EMPRESA', grupo_organization_ids: [IRMA] })).toBe(false);
        expect(documentoDoEscopo(IRMA, { organization_id: DONA, escopo: null, grupo_organization_ids: [IRMA] })).toBe(false);
    });

    it('documento sem org nunca vale', () => {
        expect(documentoDoEscopo(null, { organization_id: DONA, escopo: 'GRUPO', grupo_organization_ids: [IRMA] })).toBe(false);
        expect(documentoDoEscopo(undefined, { organization_id: DONA })).toBe(false);
    });
});
