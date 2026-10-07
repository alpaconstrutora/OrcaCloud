import { supabase } from '../lib/supabase';
import { EmployeeBankAccount, normalizeBankAccounts } from '../utils/employeeBankAccounts';

// Colunas explícitas — `pix_key` é sensível (__tests__/selectEstrelaSensivel.test.ts).
const COLUMNS = 'id, employee_id, org_id, bank_code, bank_name, agency, account, account_type, pix_key, pix_key_type, holder_name, is_primary, created_at, updated_at';

/**
 * Contas bancárias do colaborador (`employee_bank_accounts`, N por colaborador,
 * uma principal). Substitui as colunas `employees.banco_*` — ver migration
 * aplicar_20271007000020.
 */
export const employeeBankAccountService = {
    async list(employeeId: string): Promise<EmployeeBankAccount[]> {
        const { data, error } = await supabase
            .from('employee_bank_accounts')
            .select(COLUMNS)
            .eq('employee_id', employeeId)
            .order('is_primary', { ascending: false })
            .order('created_at', { ascending: true });
        if (error) throw error;
        return (data as EmployeeBankAccount[]) || [];
    },

    /**
     * Grava a lista INTEIRA numa transação (RPC): atualiza as que têm id,
     * insere as novas, apaga as que saíram e deixa exatamente uma principal.
     * Devolve o estado gravado, já na ordem de exibição.
     */
    async saveAll(employeeId: string, accounts: EmployeeBankAccount[]): Promise<EmployeeBankAccount[]> {
        const payload = normalizeBankAccounts(accounts).map(a => ({
            id: a.id,
            bank_code: a.bank_code,
            bank_name: a.bank_name,
            agency: a.agency,
            account: a.account,
            account_type: a.account_type,
            pix_key: a.pix_key,
            pix_key_type: a.pix_key_type,
            holder_name: a.holder_name,
            is_primary: a.is_primary,
        }));
        const { data, error } = await supabase.rpc('save_employee_bank_accounts', {
            p_employee_id: employeeId,
            p_accounts: payload,
        });
        if (error) throw error;
        return (data as EmployeeBankAccount[]) || [];
    },
};
