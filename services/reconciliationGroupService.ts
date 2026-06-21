import { supabase } from '../lib/supabase';
import { bankReconciliationService } from './bankReconciliationService';

const DAY = 86_400_000;

interface BankItem {
    id: string;
    transaction_date: string;
    amount: number;
    direction: 'CREDIT' | 'DEBIT';
    description_normalized?: string;
    description_raw?: string;
    counterparty_name?: string;
}
interface TitleItem {
    id: string;
    transaction_date: string;
    due_date?: string;
    amount: number;
    direction: 'CREDIT' | 'DEBIT';
    description?: string;
    entity_name?: string;
    party_name?: string;
}

export interface BankToTitlesGroup {
    bank: BankItem;
    titles: TitleItem[];
    total: number;
    diff: number;
}
export interface TitleToBanksGroup {
    title: TitleItem;
    banks: BankItem[];
    total: number;
    diff: number;
}
export interface GroupSuggestions {
    bankToTitles: BankToTitlesGroup[];
    titleToBanks: TitleToBanksGroup[];
}

/** Acha o melhor subconjunto (tamanho 2..maxK) cuja soma bate o alvo dentro da tolerância. */
function findSubset<T extends { amount: number }>(target: number, items: T[], tol: number, maxK: number): T[] | null {
    const pool = items.slice(0, 18); // limita explosão combinatória
    const n = pool.length;
    let best: T[] | null = null;
    let bestDiff = Infinity;
    const consider = (combo: T[]) => {
        const sum = combo.reduce((s, x) => s + x.amount, 0);
        const d = Math.abs(sum - target);
        if (d <= tol && d < bestDiff) { best = combo; bestDiff = d; }
    };
    for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
            consider([pool[i], pool[j]]);
            if (bestDiff < 0.01) return best;
            if (maxK >= 3)
                for (let k = j + 1; k < n; k++) {
                    consider([pool[i], pool[j], pool[k]]);
                    if (bestDiff < 0.01) return best;
                }
        }
    return best;
}

// Tolerância de agrupamento APERTADA: a soma dos itens deve bater quase exatamente
// com o pagamento/título (≤ 1% ou R$1). Diferente do 1:1, aqui folga grande gera lixo.
const groupTol = (target: number) => Math.max(1, target * 0.01);

export const reconciliationGroupService = {
    /**
     * Detecta oportunidades de conciliação agrupada (on-the-fly, sem persistir):
     *  • 1 pagamento → N títulos
     *  • 1 título → N pagamentos
     */
    async findGroups(bankAccountId: string, organizationId: string): Promise<GroupSuggestions> {
        const [{ data: bankTxs }, { data: titles }] = await Promise.all([
            supabase.from('bank_transactions')
                .select('id, transaction_date, amount, direction, description_normalized, description_raw, counterparty_name')
                .eq('bank_account_id', bankAccountId)
                .in('status', ['NORMALIZED', 'RULE_APPLIED'])
                .limit(2000),
            supabase.from('internal_transactions')
                .select('id, transaction_date, due_date, amount, direction, description, entity_name, party_name')
                .eq('organization_id', organizationId)
                .eq('status', 'PENDING')
                .limit(4000),
        ]);

        const banks = (bankTxs || []) as BankItem[];
        const allTitles = (titles || []) as TitleItem[];

        const bankToTitles: BankToTitlesGroup[] = [];
        const titleToBanks: TitleToBanksGroup[] = [];

        // 1 pagamento → N títulos
        for (const b of banks) {
            const bT = new Date(b.transaction_date).getTime();
            const pool = allTitles.filter(t =>
                t.direction === b.direction &&
                t.amount < b.amount * 1.01 &&
                (() => { const x = new Date(t.transaction_date).getTime(); return x >= bT - 45 * DAY && x <= bT + 5 * DAY; })(),
            );
            // pula se já há um título 1:1 (caso simples já coberto pelo motor)
            if (pool.some(t => Math.abs(t.amount - b.amount) < 0.01)) continue;
            const subset = findSubset(b.amount, pool.sort((a, c) => c.amount - a.amount), groupTol(b.amount), 3);
            if (subset && subset.length >= 2) {
                const total = subset.reduce((s, x) => s + x.amount, 0);
                bankToTitles.push({ bank: b, titles: subset, total: Math.round(total * 100) / 100, diff: Math.round((b.amount - total) * 100) / 100 });
            }
            if (bankToTitles.length >= 50) break;
        }

        // 1 título → N pagamentos
        for (const t of allTitles) {
            const tT = new Date(t.transaction_date).getTime();
            const pool = banks.filter(b =>
                b.direction === t.direction &&
                b.amount < t.amount * 1.01 &&
                (() => { const x = new Date(b.transaction_date).getTime(); return x >= tT - 5 * DAY && x <= tT + 60 * DAY; })(),
            );
            if (pool.some(b => Math.abs(b.amount - t.amount) < 0.01)) continue;
            const subset = findSubset(t.amount, pool.sort((a, c) => c.amount - a.amount), groupTol(t.amount), 3);
            if (subset && subset.length >= 2) {
                const total = subset.reduce((s, x) => s + x.amount, 0);
                titleToBanks.push({ title: t, banks: subset, total: Math.round(total * 100) / 100, diff: Math.round((t.amount - total) * 100) / 100 });
            }
            if (titleToBanks.length >= 50) break;
        }

        return { bankToTitles, titleToBanks };
    },

    /** Confirma 1 pagamento → N títulos: cria N vínculos (pagamento liquida vários títulos). */
    async confirmBankToTitles(bankId: string, internalIds: string[]): Promise<void> {
        for (const internalId of internalIds) {
            await bankReconciliationService.createMatch(bankId, internalId, 'MANUAL', 100);
        }
    },

    /** Confirma 1 título → N pagamentos: cria N vínculos (vários pagamentos liquidam o título). */
    async confirmTitleToBanks(internalId: string, bankIds: string[]): Promise<void> {
        for (const bankId of bankIds) {
            await bankReconciliationService.createMatch(bankId, internalId, 'MANUAL', 100);
        }
    },
};
