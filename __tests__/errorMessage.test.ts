import { describe, expect, it } from 'vitest';
import { errorMessage } from '../hooks/useOrgContext';

/**
 * Erro do Supabase é um objeto `{ message, code, details, hint }` e NÃO é
 * instância de `Error`. O código usava `e instanceof Error ? e.message : 'Erro
 * ao criar'`, então a causa real era trocada pelo texto genérico e o usuário
 * via só "Erro ao criar" — reportado em 2026-08-04, com a mensagem de RLS
 * escondida.
 */
describe('errorMessage', () => {
    it('extrai a mensagem de um erro do Supabase (não é instanceof Error)', () => {
        const supabaseError = {
            message: 'new row violates row-level security policy for table "empreendimento_types"',
            code: '42501',
            details: null,
            hint: null,
        };
        expect(supabaseError instanceof Error).toBe(false); // a premissa do bug
        expect(errorMessage(supabaseError, 'Erro ao criar'))
            .toContain('violates row-level security policy');
        expect(errorMessage(supabaseError, 'Erro ao criar')).toContain('42501');
    });

    it('inclui details quando presente', () => {
        expect(errorMessage({ message: 'duplicate key', details: 'Key (name) already exists' }, 'x'))
            .toBe('duplicate key (Key (name) already exists)');
    });

    it('funciona com Error nativo', () => {
        expect(errorMessage(new Error('falhou'), 'fallback')).toBe('falhou');
    });

    it('usa o fallback só quando não há mensagem alguma', () => {
        expect(errorMessage(null, 'fallback')).toBe('fallback');
        expect(errorMessage({}, 'fallback')).toBe('fallback');
        expect(errorMessage(undefined, 'fallback')).toBe('fallback');
    });

    it('aceita string crua', () => {
        expect(errorMessage('erro em texto', 'fallback')).toBe('erro em texto');
    });
});
