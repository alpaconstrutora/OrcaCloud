import { supabase } from '../lib/supabase';
import { fetchAllPages, type RangeableQuery } from '../lib/supabasePaginate';
import { bankReconciliationService } from './bankReconciliationService';
import { extratoForaDaConciliacao, comValorEsperado, COLUNA_VALOR_ESPERADO, COLUNA_DARF, FILTRO_SEM_TRIBUTO_RETIDO } from '../utils/reconciliationRules';

const DAY = 86_400_000;

/** Folga de `findGroups` (`groupTol`), repassada à RPC ao confirmar o grupo. */
const TOLERANCIA_DO_GRUPO = { tolerance_abs: 1, tolerance_pct: 1 };

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
    /** Bruto − tributos retidos pelo cliente (campo computado). Ver comValorEsperado. */
    valor_esperado?: number | null;
    /** DARF que agrupa o lançamento: só casa junto com os demais membros. */
    darf_id?: string | null;
}

export interface BankToTitlesGroup {
    bank: BankItem;
    titles: TitleItem[];
    total: number;
    diff: number;
    /** Grupo = um DARF inteiro (todos os membros; ver `gruposDeDarf`). */
    darfId?: string;
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
export function findSubset<T extends { amount: number }>(target: number, items: T[], tol: number, maxK: number): T[] | null {
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

const NOISE = new Set(['LTDA', 'ME', 'EPP', 'SA', 'EIRELI', 'DA', 'DE', 'DO', 'DAS', 'DOS', 'E', 'COMERCIO', 'INDUSTRIA', 'SERVICOS']);
const normalizeTxt = (s?: string) =>
    (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Afinidade de contraparte: ao menos uma palavra significativa (≥4 chars) do nome aparece no texto. */
export function partyMatchesText(partyName: string | undefined, text: string): boolean {
    if (!partyName) return false;
    const words = normalizeTxt(partyName).split(' ').filter(w => w.length >= 4 && !NOISE.has(w.toUpperCase()));
    if (words.length === 0) return false;
    const t = normalizeTxt(text);
    return words.some(w => t.includes(w));
}
const bankText = (b: BankItem) => `${b.counterparty_name || ''} ${b.description_normalized || b.description_raw || ''}`;

/**
 * DARF ↔ extrato: um débito com o valor do DARF inteiro (tributos + multa/juros),
 * do vencimento −5 a +30 dias, vira um grupo com TODOS os membros — sem o limite
 * de 3 de `findSubset` e sem exigir o nome no extrato (débito de DARF raramente
 * traz o nome do tributo). Cada débito e cada DARF entram em um grupo só.
 */
export function gruposDeDarf(banks: BankItem[], titulos: TitleItem[]): BankToTitlesGroup[] {
    const porDarf = new Map<string, TitleItem[]>();
    for (const t of titulos) {
        if (!t.darf_id) continue;
        const l = porDarf.get(t.darf_id) ?? [];
        l.push(t);
        porDarf.set(t.darf_id, l);
    }
    const usados = new Set<string>();
    const grupos: BankToTitlesGroup[] = [];
    for (const [darfId, membros] of porDarf) {
        if (membros.some(m => m.direction !== 'DEBIT')) continue;
        const total = Math.round(membros.reduce((s, m) => s + m.amount, 0) * 100) / 100;
        const venc = new Date(membros[0].due_date ?? membros[0].transaction_date).getTime();
        const candidatos = banks
            .filter(b => !usados.has(b.id) && b.direction === 'DEBIT'
                && Math.abs(b.amount - total) <= groupTol(total)
                && (() => { const x = new Date(b.transaction_date).getTime(); return x >= venc - 5 * DAY && x <= venc + 30 * DAY; })())
            .sort((a, c) => Math.abs(a.amount - total) - Math.abs(c.amount - total)
                || Math.abs(new Date(a.transaction_date).getTime() - venc) - Math.abs(new Date(c.transaction_date).getTime() - venc));
        const b = candidatos[0];
        if (!b) continue;
        usados.add(b.id);
        grupos.push({ bank: b, titles: membros, total, diff: Math.round((b.amount - total) * 100) / 100, darfId });
    }
    return grupos;
}
const titleParty = (t: TitleItem) => t.entity_name || t.party_name;

export const reconciliationGroupService = {
    /**
     * Detecta oportunidades de conciliação agrupada (on-the-fly, sem persistir):
     *  • 1 pagamento → N títulos
     *  • 1 título → N pagamentos
     */
    async findGroups(bankAccountId: string, organizationId: string): Promise<GroupSuggestions> {
        // Títulos de todas as orgs que a conta atende, como o motor (não só da dona).
        const orgsDosTitulos = await bankReconciliationService.orgsAtendidasPelaConta(bankAccountId, organizationId);
        // Paginado: `.limit(2000)` aqui era teto silencioso de 1000 linhas (PostgREST).
        const [{ data: bankTxs, error: bankErr }, { data: titles, error: titleErr }, filtros] = await Promise.all([
            fetchAllPages<BankItem & { category?: string | null }>(() => supabase.from('bank_transactions')
                .select('id, transaction_date, amount, direction, description_normalized, description_raw, counterparty_name, category')
                .eq('bank_account_id', bankAccountId)
                .in('status', ['NORMALIZED', 'RULE_APPLIED'])
                .order('transaction_date', { ascending: true })
                .order('id', { ascending: true }) as unknown as RangeableQuery<BankItem & { category?: string | null }>),
            fetchAllPages<TitleItem>(() => supabase.from('internal_transactions')
                .select(`id, transaction_date, due_date, amount, direction, description, entity_name, party_name, ${COLUNA_VALOR_ESPERADO}, ${COLUNA_DARF}`)
                .in('organization_id', orgsDosTitulos)
                .eq('status', 'PENDING')
                .or(FILTRO_SEM_TRIBUTO_RETIDO)
                .order('transaction_date', { ascending: true })
                .order('id', { ascending: true }) as unknown as RangeableQuery<TitleItem>),
            // Falha ao ler a lista não derruba os agrupamentos: sem ela, nada é excluído.
            bankReconciliationService.lerFiltrosDaConciliacao(organizationId).catch(e => {
                console.error('[findGroups] filtros da conciliação', e);
                return null;
            }),
        ]);
        if (bankErr) throw bankErr;
        if (titleErr) throw titleErr;

        // Fora da conciliação (painel Regras: categoria excluída, ou sem credor/cliente com a
        // inclusão desligada): o extrato não entra em agrupamento.
        const banks = (bankTxs || []).filter(b => !extratoForaDaConciliacao(b, filtros));
        // Grupo soma o que o banco credita: líquido quando o cliente retém tributo
        // (mesma conta do fn_reconcile_group, que soma valor_esperado).
        const todosOsTitulos = (titles || []).map(comValorEsperado);
        // Membro de DARF só casa com o DARF inteiro (abaixo), nunca solto nos grupos genéricos.
        const allTitles = todosOsTitulos.filter(t => !t.darf_id);

        // DARF primeiro: o débito que casa com um DARF não entra nos grupos genéricos.
        const bankToTitles: BankToTitlesGroup[] = gruposDeDarf(banks, todosOsTitulos);
        const debitosDosDarfs = new Set(bankToTitles.map(g => g.bank.id));
        const titleToBanks: TitleToBanksGroup[] = [];

        // 1 pagamento → N títulos
        // Afinidade: só agrupa títulos da MESMA contraparte cujo nome aparece no extrato.
        for (const b of banks) {
            if (debitosDosDarfs.has(b.id)) continue;
            const bT = new Date(b.transaction_date).getTime();
            const bTxt = bankText(b);
            const pool = allTitles.filter(t =>
                t.direction === b.direction &&
                t.amount < b.amount * 1.01 &&
                titleParty(t) && partyMatchesText(titleParty(t), bTxt) &&
                (() => { const x = new Date(t.transaction_date).getTime(); return x >= bT - 45 * DAY && x <= bT + 5 * DAY; })(),
            );
            if (pool.length < 2) continue;
            // pula se já há um título 1:1 (caso simples já coberto pelo motor)
            if (pool.some(t => Math.abs(t.amount - b.amount) < 0.01)) continue;

            // agrupa por contraparte normalizada e tenta subset dentro de cada
            const byParty = new Map<string, TitleItem[]>();
            for (const t of pool) {
                const key = normalizeTxt(titleParty(t));
                const arr = byParty.get(key) ?? []; arr.push(t); byParty.set(key, arr);
            }
            for (const grp of byParty.values()) {
                if (grp.length < 2) continue;
                const subset = findSubset(b.amount, grp.sort((a, c) => c.amount - a.amount), groupTol(b.amount), 3);
                if (subset && subset.length >= 2) {
                    const total = subset.reduce((s, x) => s + x.amount, 0);
                    bankToTitles.push({ bank: b, titles: subset, total: Math.round(total * 100) / 100, diff: Math.round((b.amount - total) * 100) / 100 });
                    break; // um grupo por pagamento
                }
            }
            if (bankToTitles.length >= 50) break;
        }

        // 1 título → N pagamentos
        // Afinidade: só agrupa pagamentos cujo extrato menciona a contraparte do título.
        for (const t of allTitles) {
            const party = titleParty(t);
            if (!party) continue;
            const tT = new Date(t.transaction_date).getTime();
            const pool = banks.filter(b =>
                b.direction === t.direction &&
                b.amount < t.amount * 1.01 &&
                partyMatchesText(party, bankText(b)) &&
                (() => { const x = new Date(b.transaction_date).getTime(); return x >= tT - 5 * DAY && x <= tT + 60 * DAY; })(),
            );
            if (pool.length < 2) continue;
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

    /**
     * Confirma 1 pagamento → N títulos (o pagamento liquida vários títulos).
     * Atômico (`fn_reconcile_group`) — antes era um loop de `createMatch` que podia
     * parar no meio. A tolerância é a MESMA de `findGroups` (máx(R$ 1, 1%)): o grupo
     * sugerido com essa folga continua conciliável.
     */
    async confirmBankToTitles(bankId: string, internalIds: string[]): Promise<void> {
        await bankReconciliationService.reconcileGroup([bankId], internalIds, 'EXACT', TOLERANCIA_DO_GRUPO);
    },

    /** Confirma 1 título → N pagamentos (vários pagamentos liquidam o título). Atômico, mesma tolerância. */
    async confirmTitleToBanks(internalId: string, bankIds: string[]): Promise<void> {
        await bankReconciliationService.reconcileGroup(bankIds, [internalId], 'EXACT', TOLERANCIA_DO_GRUPO);
    },
};
