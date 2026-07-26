import { supabase } from '../lib/supabase';
import type { PropertyDeal } from '../types';
import type { TaxPayable, TaxPayableBusinessStatus } from '../types/financial';
import { taxSettingsService } from './taxSettingsService';
import { pisRatesService } from './pisRatesService';
import { cofinsRatesService } from './cofinsRatesService';
import { inssBracketsService } from './inssBracketsService';

// Regime tributário da empresa (companies.regime_tributario) → rótulo usado nas
// tabelas oficiais tax_pis_rates/tax_cofins_rates. Simples/MEI não têm PIS/COFINS
// destacados (ficam no DAS), então ficam fora do mapa (⇒ não gera PIS/COFINS).
const REGIME_LABEL: Record<string, string> = {
    lucro_real: 'Lucro Real',
    lucro_presumido: 'Lucro Presumido',
};

/** Alíquota da tabela por exercício/regime — usa o exercício mais recente ≤ ano. */
function rateForYear(
    rates: { exercicio: number; regime_tributario: string; aliquota: number }[],
    regimeLabel: string,
    year: number,
): number | null {
    const candidates = rates.filter(r => r.regime_tributario === regimeLabel && r.exercicio <= year);
    if (candidates.length === 0) return null;
    const ex = Math.max(...candidates.map(r => r.exercicio));
    return candidates.find(r => r.exercicio === ex)?.aliquota ?? null;
}

/** Alíquota da faixa de INSS onde o valor cai (exercício mais recente ≤ ano). */
function inssRateForValue(
    brackets: { exercicio: number; base_de: number; base_ate: number; aliquota: number }[],
    value: number,
    year: number,
): number | null {
    const years = brackets.filter(b => b.exercicio <= year).map(b => b.exercicio);
    if (years.length === 0) return null;
    const ex = Math.max(...years);
    const inYear = brackets.filter(b => b.exercicio === ex);
    const hit = inYear.find(b => value >= b.base_de && value <= b.base_ate);
    if (hit) return hit.aliquota;
    // Acima da última faixa: aplica a alíquota da faixa de maior teto.
    return inYear.reduce((top, b) => (b.base_ate > (top?.base_ate ?? -1) ? b : top), inYear[0])?.aliquota ?? null;
}

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

// Regime de reconhecimento dos tributos comerciais (organizations.settings).
// CAIXA = fato gerador na data de recebimento (due_date da parcela);
// COMPETENCIA = fato gerador no mês de auferimento da receita (transaction_date).
export type TaxRecognitionRegime = 'CAIXA' | 'COMPETENCIA';

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

/** Competência (1º dia do mês) a partir do vencimento, recuando `offsetMonths`
 *  meses. Aluguel postecipado (vence N meses após a competência) → offset N;
 *  offset 0 = competência no próprio mês do vencimento; negativo = antecipado. */
function competenceFromDue(dueIso: string, offsetMonths: number): string {
    const d = parseLocal(dueIso);
    d.setMonth(d.getMonth() - (offsetMonths || 0));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

interface DealParcel {
    reference_id: string;
    amount: number;
    fato_gerador: string; // data-base do tributo (venc./pagamento da parcela)
}

/**
 * Deal de origem do tributo automático. reference_id = `tax-{dealId}-{parcela}-{tributo}`
 * e o dealId é um UUID (36 chars), então o recorte por posição é seguro.
 */
function dealIdFromReference(referenceId?: string | null): string | null {
    if (!referenceId || !referenceId.startsWith('tax-')) return null;
    const id = referenceId.slice(4, 40);
    return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/**
 * Descrição do tributo com o CLIENTE no lugar do nome do tributo — este já tem
 * coluna própria na tabela, repeti-lo na descrição é redundante. Reescreve o
 * prefixo até ` s/ ` das descrições geradas (`{tributo} s/ {origem} (n) — Deal #x`);
 * descrição manual ou em outro formato fica intacta.
 */
function describeWithClient(description: string | undefined, clientName: string | undefined): string | undefined {
    if (!description || !clientName) return description;
    const sep = description.indexOf(' s/ ');
    if (sep < 0) return description;
    return `${clientName}${description.slice(sep)}`;
}

/**
 * Resolve, a partir do negócio de origem, o Empreendimento (Incorporação) e o
 * cliente de cada tributo automático.
 * Empreendimento: tributo → deal → imóvel → empreendimento_units (rental_property_id
 * OU commercial_property_id) → torre → empreendimento.
 * Cliente: deal.client_id → clients.name (usado na coluna Descrição).
 * Lançamento manual e negócio sem unidade vinculada ficam sem empreendimento.
 */
async function enrichWithEmpreendimento(rows: TaxPayable[], organizationId: string): Promise<TaxPayable[]> {
    const dealIds = [...new Set(rows.map(r => dealIdFromReference(r.reference_id)).filter((v): v is string => !!v))];
    if (dealIds.length === 0) return rows;

    try {
        const { data: deals } = await supabase
            .from('commercial_deals')
            .select('id, property_id, client_id')
            .eq('organization_id', organizationId)
            .in('id', dealIds);

        const propertyByDeal = new Map<string, string>();
        const clientIdByDeal = new Map<string, string>();
        (deals || []).forEach((d: { id: string; property_id?: string | null; client_id?: string | null }) => {
            if (d.property_id) propertyByDeal.set(d.id, d.property_id);
            if (d.client_id)   clientIdByDeal.set(d.id, d.client_id);
        });

        // Nome do cliente — vai para a coluna Descrição no lugar do nome do tributo.
        const clientNameById = new Map<string, string>();
        const clientIds = [...new Set(clientIdByDeal.values())];
        if (clientIds.length > 0) {
            const { data: clients } = await supabase
                .from('clients')
                .select('id, name')
                .in('id', clientIds);
            (clients || []).forEach((c: { id: string; name?: string | null }) => clientNameById.set(c.id, c.name ?? ''));
        }
        const clientNameForRow = (r: TaxPayable): string | undefined => {
            const dealId = dealIdFromReference(r.reference_id);
            const clientId = dealId ? clientIdByDeal.get(dealId) : undefined;
            return clientId ? (clientNameById.get(clientId) || undefined) : undefined;
        };
        const withClient = (r: TaxPayable): TaxPayable => {
            const clientName = clientNameForRow(r);
            if (!clientName) return r;
            return { ...r, client_name: clientName, description: describeWithClient(r.description, clientName) };
        };

        const propertyIds = [...new Set(propertyByDeal.values())];
        if (propertyIds.length === 0) return rows.map(withClient);

        const inList = propertyIds.map(id => `"${id}"`).join(',');
        const { data: units } = await supabase
            .from('empreendimento_units')
            .select('tower_id, commercial_property_id, rental_property_id')
            .or(`commercial_property_id.in.(${inList}),rental_property_id.in.(${inList})`);

        const towerByProperty = new Map<string, string>();
        (units || []).forEach((u: { tower_id?: string | null; commercial_property_id?: string | null; rental_property_id?: string | null }) => {
            if (!u.tower_id) return;
            if (u.commercial_property_id) towerByProperty.set(u.commercial_property_id, u.tower_id);
            if (u.rental_property_id)     towerByProperty.set(u.rental_property_id, u.tower_id);
        });
        const towerIds = [...new Set(towerByProperty.values())];
        if (towerIds.length === 0) return rows.map(withClient);

        const { data: towers } = await supabase
            .from('empreendimento_towers')
            .select('id, empreendimento_id')
            .in('id', towerIds);
        const empByTower = new Map<string, string>();
        (towers || []).forEach((t: { id: string; empreendimento_id?: string | null }) => {
            if (t.empreendimento_id) empByTower.set(t.id, t.empreendimento_id);
        });
        const empIds = [...new Set(empByTower.values())];
        if (empIds.length === 0) return rows.map(withClient);

        const { data: emps } = await supabase
            .from('empreendimentos')
            .select('id, name')
            .in('id', empIds);
        const nameByEmp = new Map<string, string>();
        (emps || []).forEach((e: { id: string; name?: string | null }) => nameByEmp.set(e.id, e.name ?? ''));

        return rows.map(row => {
            const r = withClient(row);
            const dealId = dealIdFromReference(r.reference_id);
            const propertyId = dealId ? propertyByDeal.get(dealId) : undefined;
            const towerId = propertyId ? towerByProperty.get(propertyId) : undefined;
            const empId = towerId ? empByTower.get(towerId) : undefined;
            if (!empId) return r;
            return { ...r, empreendimento_id: empId, empreendimento_name: nameByEmp.get(empId) ?? null };
        });
    } catch (e) {
        console.warn('[TAX-PAYABLE] Falha ao resolver empreendimento dos tributos:', e);
        return rows;
    }
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

        // Empreendimento é derivado (não é coluna da view) — resolve antes da busca
        // para que o texto digitado também case com o nome do empreendimento.
        rows = await enrichWithEmpreendimento(rows, organizationId);

        if (filters?.search) {
            const s = filters.search.toLowerCase();
            rows = rows.filter(r =>
                (r.party_name ?? '').toLowerCase().includes(s) ||
                (r.description ?? '').toLowerCase().includes(s) ||
                (r.category ?? '').toLowerCase().includes(s) ||
                (r.client_name ?? '').toLowerCase().includes(s) ||
                (r.empreendimento_name ?? '').toLowerCase().includes(s) ||
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
        data: { due_date: string; amount: number; description: string; party_name?: string; category?: string; competencia?: string },
    ): Promise<TaxPayable> {
        const { data: row, error } = await supabase
            .from('internal_transactions')
            .insert({
                organization_id: organizationId,
                source_system:   TAX_SOURCE_SYSTEM,
                direction:       'DEBIT',
                // Competência (auferimento) = transaction_date; default = vencimento.
                transaction_date: data.competencia || data.due_date,
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
        data: { amount?: number; due_date?: string; description?: string; party_name?: string | null; category?: string | null; competencia?: string },
    ): Promise<void> {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (data.amount      !== undefined) updates.amount = data.amount;
        if (data.due_date    !== undefined) {
            updates.due_date = data.due_date;
            updates.transaction_date = data.due_date; // default; competência sobrescreve abaixo
        }
        // Competência (auferimento) editada explicitamente → transaction_date.
        if (data.competencia !== undefined) updates.transaction_date = data.competencia;
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
    /**
     * Resolve o regime tributário (companies.regime_tributario) da empresa dona
     * do imóvel da locação: primeiro o vínculo direto do imóvel
     * (commercial_properties.company_id); na falta, herda do empreendimento
     * (empreendimentos.company_id via empreendimento_units.commercial_property_id).
     * Retorna null se não houver empresa/regime definidos.
     */
    async resolveRentalRegime(propertyId: string | undefined | null, organizationId: string): Promise<string | null> {
        if (!propertyId) { console.warn('[TAX-REGIME] sem property_id no negócio'); return null; }
        const { data: prop, error: propErr } = await supabase
            .from('commercial_properties')
            .select('company_id')
            .eq('id', propertyId)
            .maybeSingle();
        if (propErr) console.error('[TAX-REGIME] erro lendo commercial_properties:', propErr);
        let companyId: string | null = (prop as { company_id?: string | null } | null)?.company_id ?? null;
        console.log('[TAX-REGIME] property', propertyId, '→ company_id direto:', companyId);

        if (!companyId) {
            // Herança do empreendimento. A unidade NÃO tem empreendimento_id direto:
            // liga por tower_id → empreendimento_towers.empreendimento_id. E o imóvel
            // liga à unidade por rental_property_id (Locação) ou commercial_property_id
            // (Venda). Consultas separadas e tolerantes a erro.
            const findTowerBy = async (col: string): Promise<string | null> => {
                const { data, error } = await supabase
                    .from('empreendimento_units')
                    .select('tower_id')
                    .eq(col, propertyId)
                    .limit(1);
                if (error) { console.warn(`[TAX-REGIME] busca por ${col} falhou:`, error.message); return null; }
                return (data as { tower_id?: string | null }[] | null)?.[0]?.tower_id ?? null;
            };
            const towerId = (await findTowerBy('rental_property_id')) ?? (await findTowerBy('commercial_property_id'));
            console.log('[TAX-REGIME] tower_id da unidade:', towerId);
            if (towerId) {
                const { data: tower } = await supabase
                    .from('empreendimento_towers')
                    .select('empreendimento_id')
                    .eq('id', towerId)
                    .maybeSingle();
                const empId = (tower as { empreendimento_id?: string | null } | null)?.empreendimento_id ?? null;
                console.log('[TAX-REGIME] empreendimento_id da torre:', empId);
                if (empId) {
                    const { data: emp } = await supabase
                        .from('empreendimentos')
                        .select('company_id')
                        .eq('id', empId)
                        .maybeSingle();
                    companyId = (emp as { company_id?: string | null } | null)?.company_id ?? null;
                    console.log('[TAX-REGIME] empreendimento', empId, '→ company_id:', companyId);
                }
            }
        }
        if (!companyId) { console.warn('[TAX-REGIME] nenhuma empresa resolvida p/ property', propertyId); return null; }

        const { data: comp } = await supabase
            .from('companies')
            .select('regime_tributario')
            .eq('id', companyId)
            .maybeSingle();
        const regime = (comp as { regime_tributario?: string | null } | null)?.regime_tributario ?? null;
        console.log('[TAX-REGIME] company', companyId, '→ regime_tributario:', JSON.stringify(regime));
        return regime;
    },

    /**
     * Regime de reconhecimento de tributos da organização (settings). Default CAIXA
     * (comportamento histórico) quando não configurado.
     */
    async getRecognitionRegime(organizationId: string): Promise<TaxRecognitionRegime> {
        if (!organizationId) return 'CAIXA';
        const { data } = await supabase
            .from('organizations')
            .select('settings')
            .eq('id', organizationId)
            .maybeSingle();
        const regime = (data?.settings as { tax_recognition_regime?: string } | null)?.tax_recognition_regime;
        return regime === 'COMPETENCIA' ? 'COMPETENCIA' : 'CAIXA';
    },

    async generateForDeal(
        deal: Pick<PropertyDeal, 'id' | 'type' | 'property_id'>,
        organizationId: string,
        regime?: TaxRecognitionRegime,
    ): Promise<void> {
        if (!organizationId || !deal?.id) return;
        if (deal.type !== 'SALE' && deal.type !== 'RENTAL') return;

        // Regime da org (recebido do backfill em lote ou resolvido aqui p/ chamada avulsa).
        const recognitionRegime = regime ?? await this.getRecognitionRegime(organizationId);

        const origin = deal.type === 'SALE' ? 'Venda de Ativo' : 'Locação';
        const shortId = deal.id.substring(0, 8);

        // Regime de COMPETÊNCIA em VENDA: a receita é auferida no mês do contrato
        // (commercial_deals.date), independente do recebimento — então todos os
        // tributos da venda caem nesse mês. Locação segue por parcela (competência
        // mensal do aluguel) e o regime de CAIXA sempre segue o recebimento.
        let saleAccrualDate: string | null = null;
        let rentalOffsetMonths = 0;
        if (recognitionRegime === 'COMPETENCIA' && deal.type === 'SALE') {
            const { data: d } = await supabase
                .from('commercial_deals')
                .select('date')
                .eq('id', deal.id)
                .maybeSingle();
            saleAccrualDate = (d?.date as string | undefined)?.slice(0, 10) || null;
        } else if (recognitionRegime === 'COMPETENCIA' && deal.type === 'RENTAL') {
            // Defasagem por contrato entre competência e vencimento do aluguel.
            // A coluna pode não existir ainda (migration pendente) → fallback offset 0.
            const { data: d, error } = await supabase
                .from('commercial_deals')
                .select('rental_competencia_offset_months')
                .eq('id', deal.id)
                .maybeSingle();
            if (!error) {
                rentalOffsetMonths = Number((d as { rental_competencia_offset_months?: number } | null)?.rental_competencia_offset_months) || 0;
            }
        }

        // Cliente do negócio — vai na descrição no lugar do nome do tributo
        // (o tributo já tem coluna própria na tela). Sem cliente, cai no nome do tributo.
        let clientName: string | null = null;
        {
            const { data: d } = await supabase
                .from('commercial_deals')
                .select('client_id')
                .eq('id', deal.id)
                .maybeSingle();
            const clientId = (d as { client_id?: string | null } | null)?.client_id ?? null;
            if (clientId) {
                const { data: c } = await supabase
                    .from('clients')
                    .select('name')
                    .eq('id', clientId)
                    .maybeSingle();
                clientName = (c as { name?: string | null } | null)?.name || null;
            }
        }

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
                // Venda+Competência: mês do contrato (saleAccrualDate).
                // Locação+Competência: mês do vencimento recuado pela defasagem do contrato.
                // Demais casos (Caixa): data de recebimento da parcela.
                fato_gerador: saleAccrualDate
                    ? saleAccrualDate
                    : (recognitionRegime === 'COMPETENCIA' && deal.type === 'RENTAL')
                        ? competenceFromDue(p.due_date || p.transaction_date || today(), rentalOffsetMonths)
                        : (p.due_date || p.transaction_date || today()).slice(0, 10),
            }))
            .filter(p => p.amount > 0);
        if (validParcels.length === 0) return;

        // Cada item = um tributo incidente sobre UMA parcela.
        const rows: Record<string, unknown>[] = [];
        const pushRow = (parcel: DealParcel, taxKey: string, taxName: string, amount: number) => {
            if (!(amount > 0)) return;
            const instSuffix = parcel.reference_id.replace(`tx-${deal.id}-`, '');
            rows.push({
                organization_id: organizationId,
                source_system:   TAX_SOURCE_SYSTEM,
                reference_id:    `tax-${deal.id}-${instSuffix}-${taxKey}`,
                transaction_date: parcel.fato_gerador,
                due_date:        taxDueDate(taxName, parcel.fato_gerador),
                amount:          Number(amount.toFixed(2)),
                direction:       'DEBIT',
                description:     `${clientName || taxName} s/ ${origin} (${instSuffix}) — Deal #${shortId}`,
                party_name:      taxName,
                party_type:      TAX_PARTY_TYPE,
                project_id:      null,
                category:        origin,
                status:          'PENDING',
                business_status: 'PREVISTO',
            });
        };

        if (deal.type === 'SALE') {
            // Vendas de Ativos: catálogo livre da aba Geral (tax_settings), como antes.
            const taxes = (await taxSettingsService.list(organizationId))
                .filter(t => t.ativo && t.aliquota != null && t.aliquota > 0 && t.aplica_venda_ativo);
            if (taxes.length === 0) return;
            for (const parcel of validParcels) {
                for (const t of taxes) {
                    pushRow(parcel, t.id, t.nome, parcel.amount * (t.aliquota as number) / 100);
                }
            }
        } else {
            // Locações: PIS/COFINS pelas tabelas oficiais (exercício + regime da
            // empresa dona do imóvel) e INSS pela faixa progressiva onde a parcela cai.
            const [regime, pisRates, cofinsRates, inssBrackets] = await Promise.all([
                this.resolveRentalRegime(deal.property_id, organizationId),
                pisRatesService.list(),
                cofinsRatesService.list(),
                inssBracketsService.list(),
            ]);
            const regimeLabel = regime ? REGIME_LABEL[regime] : null;
            console.log(`[TAX-PAYABLE] Locação ${shortId}: regime=${JSON.stringify(regime)} → label=${JSON.stringify(regimeLabel)}; pisRates=${pisRates.length} cofinsRates=${cofinsRates.length} inssBrackets=${inssBrackets.length}`);
            if (!regimeLabel) {
                console.warn(`[TAX-PAYABLE] Locação ${shortId}: sem empresa/regime (Lucro Real/Presumido) definidos no imóvel/empreendimento — PIS/COFINS não gerados. INSS segue.`);
            }
            for (const parcel of validParcels) {
                const year = parseLocal(parcel.fato_gerador).getFullYear();
                if (regimeLabel) {
                    const pis = rateForYear(pisRates, regimeLabel, year);
                    const cofins = rateForYear(cofinsRates, regimeLabel, year);
                    console.log(`[TAX-PAYABLE] parcela ${parcel.reference_id} ano=${year} → PIS=${pis} COFINS=${cofins}`);
                    if (pis != null)    pushRow(parcel, 'pis',    'PIS',    parcel.amount * pis / 100);
                    if (cofins != null) pushRow(parcel, 'cofins', 'COFINS', parcel.amount * cofins / 100);
                }
                const inss = inssRateForValue(inssBrackets, parcel.amount, year);
                if (inss != null) pushRow(parcel, 'inss', 'INSS', parcel.amount * inss / 100);
            }
        }

        if (rows.length === 0) return;

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
    async generateAllForOrganization(organizationId: string, regime?: TaxRecognitionRegime): Promise<number> {
        if (!organizationId) return 0;
        const allowedStatuses = ['COMPLETED', 'PENDING', 'APPROVED', 'WAITING_PAYMENT', 'RESERVA', 'CONTRATO', 'ASSINATURA', 'DONE'];
        const { data: deals, error } = await supabase
            .from('commercial_deals')
            .select('id, type, status, property_id')
            .eq('organization_id', organizationId)
            .in('type', ['SALE', 'RENTAL']);
        if (error) { console.error('[TAX-PAYABLE] Falha ao listar negócios p/ backfill:', error); throw error; }

        // Regime resolvido uma vez para todo o lote (ou recebido explicitamente,
        // ex: logo após trocar o regime na tela de Organização).
        const resolvedRegime = regime ?? await this.getRecognitionRegime(organizationId);

        let count = 0;
        for (const d of (deals || [])) {
            if (!allowedStatuses.includes(d.status || '')) continue;
            try {
                await this.generateForDeal({ id: d.id, type: d.type, property_id: d.property_id }, organizationId, resolvedRegime);
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
