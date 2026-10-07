import { describe, expect, it } from 'vitest';
import {
    EmployeeBankAccount, describeBankAccount, emptyBankAccount, isBlankBankAccount,
    normalizeBankAccounts, setPrimaryBankAccount,
} from '../utils/employeeBankAccounts';

// Mesmas regras da RPC save_employee_bank_accounts
// (supabase/migrations/aplicar_20271007000020_employee_bank_accounts.sql).

const conta = (over: Partial<EmployeeBankAccount>): EmployeeBankAccount => ({ ...emptyBankAccount(), ...over });

describe('contas bancárias do colaborador — principal única', () => {
    it('nenhuma marcada → a primeira vira principal', () => {
        const out = normalizeBankAccounts([conta({ bank_code: '001' }), conta({ bank_code: '341' })]);
        expect(out.map(a => a.is_primary)).toEqual([true, false]);
    });

    it('várias marcadas → só a primeira marcada fica', () => {
        const out = normalizeBankAccounts([
            conta({ bank_code: '001' }),
            conta({ bank_code: '341', is_primary: true }),
            conta({ bank_code: '237', is_primary: true }),
        ]);
        expect(out.map(a => a.is_primary)).toEqual([false, true, false]);
    });

    it('lista vazia → nenhuma principal (e nada inventado)', () => {
        expect(normalizeBankAccounts([])).toEqual([]);
    });

    it('linha em branco sai antes de escolher a principal', () => {
        const out = normalizeBankAccounts([conta({ is_primary: true }), conta({ pix_key: 'a@b.com' })]);
        expect(out).toHaveLength(1);
        expect(out[0].pix_key).toBe('a@b.com');
        expect(out[0].is_primary).toBe(true);
    });

    it('só espaços conta como branco; só PIX não', () => {
        expect(isBlankBankAccount(conta({ bank_name: '   ', account: ' ' }))).toBe(true);
        expect(isBlankBankAccount(conta({ pix_key: '123' }))).toBe(false);
    });

    it('tornar principal desmarca as outras', () => {
        const lista = [conta({ bank_code: '1', is_primary: true }), conta({ bank_code: '2' }), conta({ bank_code: '3' })];
        expect(setPrimaryBankAccount(lista, 2).map(a => a.is_primary)).toEqual([false, false, true]);
    });
});

describe('describeBankAccount', () => {
    it('resume banco e conta', () => {
        expect(describeBankAccount(conta({ bank_code: '341', bank_name: 'Itaú', agency: '1234', account: '5678-9' })))
            .toBe('341 · Itaú — Ag 1234 · CC 5678-9');
    });
    it('conta só com PIX', () => {
        expect(describeBankAccount(conta({ pix_key: 'x@y.com' }))).toBe('Somente PIX');
    });
});
