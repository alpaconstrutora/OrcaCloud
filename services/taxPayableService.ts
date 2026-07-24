import { supabase } from '../lib/supabase';
import type { PropertyDeal } from '../types';
import type { TaxPayable, TaxPayableBusinessStatus } from '../types/financial';
import { taxSettingsService } from './taxSettingsService';

export interface TaxPayableFilters {
    search?: string;
    status?: TaxPayableBusinessStatus | 'VENCIDO' | 'all';
    dueFrom?: string;
    dueTo?: string;
}

// Marcadores fixos do tributo comercial em internal_transactions.
// Ver migration 20270824000010_vw_commercial_tax_payables.sql.
const TAX_PARTY_TYPE = 'TAX';
const TAX_SOURCE_SYSTEM = 'COMMERCIAL'; // isenta o hard-lock de período

function today() { return new Date().toISOString().slice(0, 10); }

// ── Datas ────────────────────────────────────────────────────
// Parsing/format em horário LOCAL para não retroceder 1 dia (bug de fuso
// UTC-3): NUNCA usar new Date('YYYY-MM-DD').

function parseLocal(iso: string): Date {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}
function fmtLocal(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
/** Recua para o dia útil anterior se cair em sábado/domingo (feriados não tratados). */
function prevBusinessDay(d: Date): Date {
    const out = new Date(d);
    while (out.getDay() === 0 || out.getDay() === 6) out.setDate(out.getDate() - 1);
    return out;
}

/**
 * Vencimento do tributo a partir do fato gerador (data da parcela), por tipo:
 *   • PIS / COFINS         → dia 25 do mês seguinte.
 *   • IRPJ / CSLL / IR     → trimestral: último dia do mês seguinte ao trimestre
 *       Q1(jan-mar)→30/abr · Q2(abr-jun)→31/jul · Q3(jul-set)→31/out · Q4(out-dez)→31/jan (ano seguinte)
 *   • demais (IRRF, etc.)  → dia 25 do mês seguinte (default).
 * Ajusta para dia útil anterior em fim de semana.
 */
function taxDueDate(taxName: string, fatoGeradorIso: string): string {
    const fato = parseLocal(fatoGeradorIso);
    const nome = (taxName || '').toUpperCase();
    let due: Date;

    if (/CSLL|IRPJ|IMPOSTO DE RENDA|\bIR\b/.test(nome) && !/IRRF/.test(nome)) {
        // trimestral — fim do mês seguinte ao trimestre do fato gerador
        const q = Math.floor(fato.getMonth() / 3); // 0..3
        // mês do vencimento (0-based) e ano
        const dueMonthByQuarter = [3, 6, 9, 12]; // abr, jul, out, jan(+1)
        let dueMonth = dueMonthByQuarter[q];
        let dueYear = fato.getFullYear();
        if (dueMonth === 12) { dueMonth = 0; dueYear += 1; } // jan do ano seguinte
        // último dia do mês: dia 0 do mês seguinte
        due = new Date(dueYear, dueMonth + 1, 0);
    } else {
        // dia 25 do mês seguinte
        due = new Date(fato.getFullYear(), fato.getMonth() + 1, 25);
    }
    return fmtLocal(prevBusinessDay(due));
}

interface DealParcel {
    reference_id: string;
    amount: number;
    fato_gerador: string; // data-base do tributo (venc./pagamento da parcela)
}

export const taxPayableService = {

    async list(organizationId: string, filters?: TaxPayableFilters): Promise<TaxPayable[]> {
        let q = supabase
            .from('vw_commercial_tax_payables')
            .select('id,organization_id,source_system,reference_id,transaction_date,due_date,amount,direction,description,category,status,business_status,effective_status,party_id,party_name,party_type,project_id,project_name,created_at,updated_at')
            .eq('organization_id', organizationId)
            .order('due_date', { ascending: true, nullsFirst: false });

        if (filters?.dueFrom) q = q.gte('due_date', filters.dueFrom);
        if (filters?.dueTo)   q = q.lte('due_date', filters.dueTo);

        const { data, error } = await q;
        if (error) throw error;

        let rows = (data || []) as TaxPayable[];

        if (filters?.status && filters.status !== 'all') {
            rows = rows.filter(r => r.effective_status === filters.status);
        }

        if (filters?.search) {
            const s = filters.search.toLowerCase();
            rows = rows.filter(r =>
                (r.party_name ?? '').toLowerCase().includes(s) ||
                (r.description ?? '').toLowerCase().includes(s) ||
                (r.category ?? '').toLowerCase().includes(s) ||
                (r.reference_id ?? '').toLowerCase().includes(s),
            );
        }

        return rows;
    },

    /** Baixa (PAGO) ou reclassificação de status do tributo. */
    async updateStatus(id: string, newStatus: TaxPayableBusinessStatus): Promise<void> {
        const updates: Record<string, unknown> = {
            business_status: newStatus,
            updated_at: new Date().toISOString(),
        };
        if (newStatus === 'PAGO') updates.status = 'CONCILIATED';
        if (newStatus === 'CANCELADO') updates.status = 'CANCELLED';

        const { error } = await supabase
            .from('internal_transactions')
            .update(updates)
            .eq('id', id);
        if (error) throw error;
    },

    /** Lançamento manual de tributo (reference_id NULL = editável/excluível aqui). */
    async create(
        organizationId: string,
        data: { due_date: string; amount: number; description: string; party_name?: string; category?: string },
    ): Promise<TaxPayable> {
        const { data: row, error } = await supabase
            .from('internal_transactions')
            .insert({
                organization_id: organizationId,
                source_system:   TAX_SOURCE_SYSTEM,
                direction:       'DEBIT',
                transaction_date: data.due_date,
                due_date:        data.due_date,
                amount:          data.amount,
                description:     data.description,
                party_name:      data.party_name ?? null,
                party_type:      TAX_PARTY_TYPE,
                project_id:      null,
                category:        data.category || 'Manual',
                status:          'PENDING',
                business_status: 'PREVISTO',
            })
            .select('id,organization_id,source_system,reference_id,transaction_date,due_date,amount,direction,description,category,status,business_status,party_id,party_name,party_type,project_id,created_at,updated_at')
            .single();
        if (error) throw error;
        return { ...row, direction: 'DEBIT', effective_status: 'PREVISTO' } as TaxPayable;
    },

    /** Corrige dados de um tributo (valor, vencimento, descrição, tributo). */
    async update(
        id: string,
        data: { amount?: number; due_date?: string; description?: string; party_name?: string | null; category?: string | null },
    ): Promise<void> {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (data.amount      !== undefined) updates.amount = data.amount;
        if (data.due_date    !== undefined) {
            updates.due_date = data.due_date;
            updates.transaction_date = data.due_date;
        }
        if (data.description !== undefined) updates.description = data.description;
        if (data.party_name  !== undefined) updates.party_name = data.party_name;
        if (data.category    !== undefined) updates.category = data.category;

        const { error } = await supabase
            .from('internal_transactions')
            .update(updates)
            .eq('id', id);
        if (error) throw error;
    },

    /**
     * Exclui um tributo **manual** (reference_id NULL). Os automáticos são
     * espelho do negócio comercial — apagados aqui, voltariam no próximo sync.
     */
    async remove(id: string): Promise<void> {
        const { data, error } = await supabase
            .from('internal_transactions')
            .delete()
            .eq('id', id)
            .eq('party_type', TAX_PARTY_TYPE)
            .is('reference_id', null)
            .select('id');

        if (error) {
            if (error.code === '23503') {
                throw new Error('Este tributo está conciliado com o extrato bancário. Desfaça a conciliação antes de excluir.');
            }
            throw error;
        }
        if (!data || data.length === 0) {
            throw new Error('Só tributos lançados manualmente podem ser excluídos aqui. Este veio de um negócio do Comercial — cancele o negócio na origem.');
        }
    },

    /**
     * Gera (upsert idempotente) os tributos a pagar de um negócio de Venda de
     * Ativo (SALE) ou Locação (RENTAL). Regime de CAIXA: incide POR PARCELA do
     * negócio (recebíveis materializados em internal_transactions, reference_id
     * `tx-{dealId}-*`), aplicando cada alíquota ativa de tax_settings sobre o
     * valor da parcela. O vencimento segue a regra fiscal de cada tributo
     * (ver taxDueDate).
     */
    async generateForDeal(deal: Pick<PropertyDeal, 'id' | 'type'>, organizationId: string): Promise<void> {
        if (!organizationId || !deal?.id) return;
        if (deal.type !== 'SALE' && deal.type !== 'RENTAL') return;

        const origin = deal.type === 'SALE' ? 'Venda de Ativo' : 'Locação';
        const shortId = deal.id.substring(0, 8);

        // Sempre limpa os automáticos PENDENTES deste negócio antes de regerar
        // (parcela cancelada, mudança de valor, alíquota desativada). Preserva os
        // já PAGOS/conciliados (dinheiro que saiu).
        await this.removeForDeal(deal.id, organizationId);

        // Parcelas do negócio = recebíveis (CREDIT) `tx-{dealId}-*`, exceto cancelados.
        const { data: parcels, error: pErr } = await supabase
            .from('internal_transactions')
            .select('reference_id, amount, due_date, transaction_date, status, business_status')
            .eq('organization_id', organizationId)
            .eq('direction', 'CREDIT')
            .like('reference_id', `tx-${deal.id}-%`);
        if (pErr) { console.error('[TAX-PAYABLE] Falha ao ler parcelas do negócio:', pErr); return; }

        const validParcels: DealParcel[] = (parcels || [])
            .filter((p: { status?: string; business_status?: string }) =>
                p.status !== 'CANCELLED' && p.business_status !== 'CANCELADO')
            .map((p: { reference_id: string; amount: number; due_date?: string; transaction_date?: string }) => ({
                reference_id: p.reference_id,
                amount: Number(p.amount) || 0,
                fato_gerador: (p.due_date || p.transaction_date || today()).slice(0, 10),
            }))
            .filter(p => p.amount > 0);
        if (validParcels.length === 0) return;

        const taxes = (await taxSettingsService.list(organizationId))
            .filter(t => t.ativo && t.aliquota != null && t.aliquota > 0);
        if (taxes.length === 0) return;

        const rows: Record<string, unknown>[] = [];
        for (const parcel of validParcels) {
            // sufixo da parcela (ex.: p1, dp, custom-p2) para compor o reference_id do tributo
            const instSuffix = parcel.reference_id.replace(`tx-${deal.id}-`, '');
            for (const t of taxes) {
                rows.push({
                    organization_id: organizationId,
                    source_system:   TAX_SOURCE_SYSTEM,
                    reference_id:    `tax-${deal.id}-${instSuffix}-${t.id}`,
                    transaction_date: parcel.fato_gerador,
                    due_date:        taxDueDate(t.nome, parcel.fato_gerador),
                    amount:          Number((parcel.amount * (t.aliquota as number) / 100).toFixed(2)),
                    direction:       'DEBIT',
                    description:     `${t.nome} s/ ${origin} (${instSuffix}) — Deal #${shortId}`,
                    party_name:      t.nome,
                    party_type:      TAX_PARTY_TYPE,
                    project_id:      null,
                    category:        origin,
                    status:          'PENDING',
                    business_status: 'PREVISTO',
                });
            }
        }

        const { error } = await supabase
            .from('internal_transactions')
            .upsert(rows, { onConflict: 'organization_id,reference_id,entry_type' });
        if (error) {
            console.error('[TAX-PAYABLE] Falha ao gerar tributos do negócio:', error);
        }
    },

    /**
     * Backfill: gera os tributos de todos os negócios (Vendas de Ativos e
     * Locações) já existentes da organização que geram financeiro. Idempotente
     * (o generateForDeal faz upsert e preserva os já pagos). Retorna quantos
     * negócios foram processados.
     */
    async generateAllForOrganization(organizationId: string): Promise<number> {
        if (!organizationId) return 0;
        const allowedStatuses = ['COMPLETED', 'PENDING', 'APPROVED', 'WAITING_PAYMENT', 'RESERVA', 'CONTRATO', 'ASSINATURA', 'DONE'];
        const { data: deals, error } = await supabase
            .from('commercial_deals')
            .select('id, type, status')
            .eq('organization_id', organizationId)
            .in('type', ['SALE', 'RENTAL']);
        if (error) { console.error('[TAX-PAYABLE] Falha ao listar negócios p/ backfill:', error); throw error; }

        let count = 0;
        for (const d of (deals || [])) {
            if (!allowedStatuses.includes(d.status || '')) continue;
            try {
                await this.generateForDeal({ id: d.id, type: d.type }, organizationId);
                count++;
            } catch (e) {
                console.error(`[TAX-PAYABLE] Backfill falhou p/ deal ${d.id}:`, e);
            }
        }
        return count;
    },

    /** Remove os tributos PENDENTES de um negócio (distrato/cancelamento). */
    async removeForDeal(dealId: string, organizationId: string): Promise<void> {
        if (!dealId || !organizationId) return;
        try {
            const { data: existing } = await supabase
                .from('internal_transactions')
                .select('id, status, business_status')
                .eq('organization_id', organizationId)
                .eq('party_type', TAX_PARTY_TYPE)
                .like('reference_id', `tax-${dealId}-%`);
            const toDelete = (existing || [])
                .filter((r: { status?: string; business_status?: string }) =>
                    r.status !== 'CONCILIATED' && r.business_status !== 'PAGO')
                .map((r: { id: string }) => r.id);
            if (toDelete.length) {
                await supabase.from('internal_transactions').delete().in('id', toDelete);
            }
        } catch (e) {
            console.error('[TAX-PAYABLE] Falha ao remover tributos do negócio:', e);
        }
    },
};
