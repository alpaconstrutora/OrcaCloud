/**
 * Contas bancárias do colaborador — regras puras (sem Supabase), espelho do que
 * a RPC `save_employee_bank_accounts` faz no banco
 * (migration aplicar_20271007000020). A tela usa estas funções para mostrar,
 * ANTES de salvar, exatamente o que vai ser gravado: linha em branco some e
 * sempre existe uma (e só uma) principal quando há conta.
 */

export type EmployeeBankAccountType = 'corrente' | 'poupanca' | 'pagamento';
export type EmployeePixKeyType = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

export interface EmployeeBankAccount {
    /** Ausente = conta nova, ainda não gravada. */
    id?: string;
    employee_id?: string;
    org_id?: string | null;
    bank_code: string | null;
    bank_name: string | null;
    agency: string | null;
    account: string | null;
    account_type: EmployeeBankAccountType;
    pix_key: string | null;
    pix_key_type: EmployeePixKeyType | null;
    holder_name: string | null;
    is_primary: boolean;
    created_at?: string;
    updated_at?: string;
}

export const ACCOUNT_TYPE_LABELS: Record<EmployeeBankAccountType, string> = {
    corrente: 'Conta corrente',
    poupanca: 'Conta poupança',
    pagamento: 'Conta de pagamento',
};

export const PIX_KEY_TYPE_LABELS: Record<EmployeePixKeyType, string> = {
    cpf: 'CPF',
    cnpj: 'CNPJ',
    email: 'E-mail',
    telefone: 'Telefone',
    aleatoria: 'Chave aleatória',
};

export function emptyBankAccount(): EmployeeBankAccount {
    return {
        bank_code: '', bank_name: '', agency: '', account: '', account_type: 'corrente',
        pix_key: '', pix_key_type: null, holder_name: '', is_primary: false,
    };
}

/** Linha sem banco, agência, conta nem PIX — a RPC ignora; a tela também. */
export function isBlankBankAccount(a: Pick<EmployeeBankAccount, 'bank_code' | 'bank_name' | 'agency' | 'account' | 'pix_key'>): boolean {
    return ![a.bank_code, a.bank_name, a.agency, a.account, a.pix_key].some(v => (v ?? '').trim() !== '');
}

/**
 * Tira as linhas em branco e deixa exatamente UMA principal quando sobra
 * alguma conta: a primeira marcada, ou a primeira da lista se nenhuma estiver.
 * Mesma regra da RPC — se mudar aqui, mude lá.
 */
export function normalizeBankAccounts<T extends EmployeeBankAccount>(accounts: T[]): T[] {
    const kept = accounts.filter(a => !isBlankBankAccount(a));
    const primaryIdx = Math.max(0, kept.findIndex(a => a.is_primary));
    return kept.map((a, i) => ({ ...a, is_primary: i === primaryIdx }));
}

/** Marca `index` como principal e desmarca as demais. */
export function setPrimaryBankAccount<T extends EmployeeBankAccount>(accounts: T[], index: number): T[] {
    return accounts.map((a, i) => ({ ...a, is_primary: i === index }));
}

/** Resumo de uma linha para a lista: "341 · Itaú — Ag 1234 · CC 56789-0". */
export function describeBankAccount(a: EmployeeBankAccount): string {
    const banco = [a.bank_code, a.bank_name].filter(v => (v ?? '').trim()).join(' · ');
    const conta = [
        a.agency?.trim() ? `Ag ${a.agency.trim()}` : '',
        a.account?.trim() ? `${a.account_type === 'poupanca' ? 'CP' : a.account_type === 'pagamento' ? 'CPg' : 'CC'} ${a.account.trim()}` : '',
    ].filter(Boolean).join(' · ');
    return [banco, conta].filter(Boolean).join(' — ') || (a.pix_key?.trim() ? 'Somente PIX' : '—');
}
