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

/**
 * Replicação parcial: o toast dizia sempre "as demais já tinham", mesmo quando
 * a causa era RLS (42501). Em 2026-08-04 o usuário estava em 4 organizações no
 * seletor mas era membro de 1 — 3 gravações falhariam por permissão e a
 * mensagem culparia duplicata.
 */
import { partialFailureNote } from '../hooks/useOrgContext';

const rls = { message: 'new row violates row-level security policy for table "x"', code: '42501' };
const dup = { message: 'duplicate key value violates unique constraint "x_name_key"', code: '23505' };

describe('partialFailureNote', () => {
    it('sem falha, sem nota', () => {
        expect(partialFailureNote([])).toBe('');
    });

    it('todas por RLS → fala de permissão, não de duplicata', () => {
        expect(partialFailureNote([{ error: rls }, { error: rls }]))
            .toBe('as demais você não tem permissão de gravar');
    });

    it('todas duplicadas → mantém a mensagem original', () => {
        expect(partialFailureNote([{ error: dup }])).toBe('as demais já tinham');
    });

    it('misturado → discrimina as duas causas', () => {
        expect(partialFailureNote([{ error: dup }, { error: rls }, { error: rls }]))
            .toBe('1 já tinham, 2 sem permissão');
    });

    it('causa desconhecida → mostra a mensagem real em vez de inventar', () => {
        expect(partialFailureNote([{ error: { message: 'connection timeout' } }]))
            .toContain('connection timeout');
    });
});
