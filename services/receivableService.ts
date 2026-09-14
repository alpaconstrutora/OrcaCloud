import { supabase } from '../lib/supabase';
import { originIdFromRef } from '../lib/receivableRef';
import { empreendimentoService } from './empreendimentoService';
import type { Receivable, ReceivableBusinessStatus, InadimplenciaFaixa } from '../types/financial';

export interface ReceivableFilters {
    search?: string;
    status?: ReceivableBusinessStatus | 'VENCIDO' | 'all';
    dueFrom?: string;
    dueTo?: string;
    projectId?: string;
}

/** PostgREST recebe o `.in()` pela URL — lotes de 200 UUIDs ficam longe do limite. */
function chunk<T>(list: T[], size = 200): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
}

/**
 * Resolve o Empreendimento de cada recebível. Não é coluna da view: o vínculo
 * mora no CONTRATO de origem (`reference_id` = `<contract_id>-p…`/`:p…`, ver
 * lib/receivableRef), e dali por três caminhos, nesta ordem:
 *
 *   1. `contracts.empreendimento_id` — vínculo direto (prédio em operação);
 *   2. `contracts.deal_id` → `commercial_deals.property_id` → unidade → torre →
 *      empreendimento (`vw_unit_property_map`) — venda/locação de unidade. É o
 *      caminho que resolve hoje: medido 14/09/2026, 361 de 362 títulos;
 *   3. obra (`project_id` do título ou do contrato) → `empreendimentos.project_id`
 *      / `empreendimento_towers.project_id` — contrato de obra.
 *
 * Lançamento manual e NF-e não têm contrato e ficam sem empreendimento. Falha em
 * qualquer consulta devolve as linhas sem a coluna — a tela não pode ficar em
 * branco por causa de uma dimensão derivada.
 */
async function enrichWithEmpreendimento(rows: Receivable[], organizationId: string | null): Promise<Receivable[]> {
    const contractIds = [...new Set(rows.map(r => originIdFromRef(r.reference_id)).filter(Boolean))];
    if (contractIds.length === 0) return rows;

    try {
        type ContractLink = { id: string; empreendimento_id: string | null; deal_id: string | null; project_id: string | null };
        const contracts: ContractLink[] = [];
        for (const ids of chunk(contractIds)) {
            // Sem organização ("Todas"): não filtra por org — os ids já vieram das
            // linhas que a RLS liberou, então o `in(...)` sozinho já é o recorte.
            let q = supabase.from('contracts').select('id, empreendimento_id, deal_id, project_id').in('id', ids);
            if (organizationId) q = q.eq('organization_id', organizationId);
            const { data } = await q;
            contracts.push(...((data || []) as ContractLink[]));
        }
        if (contracts.length === 0) return rows;
        const contractById = new Map(contracts.map(c => [c.id, c]));

        // Caminho 2 — negócio → imóvel.
        const dealIds = [...new Set(contracts.map(c => c.deal_id).filter((v): v is string => !!v))];
        const propertyByDeal = new Map<string, string>();
        for (const ids of chunk(dealIds)) {
            const { data } = await supabase.from('commercial_deals').select('id, property_id').in('id', ids);
            (data || []).forEach((d: { id: string; property_id?: string | null }) => {
                if (d.property_id) propertyByDeal.set(d.id, d.property_id);
            });
        }

        const [byProperty, byObra] = await Promise.all([
            propertyByDeal.size > 0
                ? empreendimentoService.mapPropertiesToEmpreendimentos(organizationId)
                : Promise.resolve({} as Awaited<ReturnType<typeof empreendimentoService.mapPropertiesToEmpreendimentos>>),
            empreendimentoService.mapObrasToEmpreendimentos(organizationId),
        ]);

        // Caminho 1 — nome dos vínculos diretos (os mapas acima só trazem os
        // empreendimentos que têm unidade/obra).
        const nameById = new Map<string, string>();
        Object.values(byProperty).forEach(e => nameById.set(e.id, e.name));
        Object.values(byObra).forEach(e => nameById.set(e.id, e.name));
        const diretos = [...new Set(contracts.map(c => c.empreendimento_id).filter((v): v is string => !!v && !nameById.has(v)))];
        for (const ids of chunk(diretos)) {
            const { data } = await supabase.from('empreendimentos').select('id, name').in('id', ids);
            (data || []).forEach((e: { id: string; name?: string | null }) => nameById.set(e.id, e.name ?? ''));
        }

        return rows.map(r => {
            const contract = contractById.get(originIdFromRef(r.reference_id));
            let empId: string | undefined = contract?.empreendimento_id ?? undefined;
            if (!empId && contract?.deal_id) {
                const propertyId = propertyByDeal.get(contract.deal_id);
                empId = propertyId ? byProperty[propertyId]?.id : undefined;
            }
            if (!empId) {
                const projectId = r.project_id ?? contract?.project_id ?? undefined;
                empId = projectId ? byObra[projectId]?.id : undefined;
            }
            if (!empId) return r;
            return { ...r, empreendimento_id: empId, empreendimento_name: nameById.get(empId) ?? null };
        });
    } catch (e) {
        console.warn('[RECEIVABLE] Falha ao resolver empreendimento dos recebíveis:', e);
        return rows;
    }
}

export const receivableService = {

    /** `organizationId` null = "Todas as organizações": sem filtro, a RLS recorta. */
    async list(organizationId: string | null, filters?: ReceivableFilters): Promise<Receivable[]> {
        let q = supabase
            .from('vw_receivables')
            .select('id,organization_id,source_system,reference_id,transaction_date,due_date,amount,description,category,status,business_status,effective_status,party_id,party_name,party_type,project_id,project_name,cost_center_id,plano_de_contas_id,created_at,updated_at')
            .order('due_date', { ascending: true, nullsFirst: false });

        if (organizationId) q = q.eq('organization_id', organizationId);

        if (filters?.dueFrom)    q = q.gte('due_date', filters.dueFrom);
        if (filters?.dueTo)      q = q.lte('due_date', filters.dueTo);
        if (filters?.projectId)  q = q.eq('project_id', filters.projectId);

        const { data, error } = await q;
        if (error) throw error;

        let rows = (data || []) as Receivable[];

        if (filters?.status && filters.status !== 'all') {
            rows = rows.filter(r => r.effective_status === filters.status);
        }

        // Antes da busca: o texto digitado também casa com o nome do empreendimento.
        rows = await enrichWithEmpreendimento(rows, organizationId);

        if (filters?.search) {
            const q2 = filters.search.toLowerCase();
            rows = rows.filter(r =>
                (r.party_name ?? '').toLowerCase().includes(q2) ||
                (r.description ?? '').toLowerCase().includes(q2) ||
                (r.project_name ?? '').toLowerCase().includes(q2) ||
                (r.empreendimento_name ?? '').toLowerCase().includes(q2) ||
                (r.reference_id ?? '').toLowerCase().includes(q2),
            );
        }

        return rows;
    },

    async updateStatus(
        id: string,
        newStatus: ReceivableBusinessStatus,
    ): Promise<void> {
        const updates: Record<string, unknown> = {
            business_status: newStatus,
            updated_at: new Date().toISOString(),
        };
        // Sincroniza status de conciliação quando confirmado
        if (newStatus === 'RECEBIDO')       updates.status = 'CONCILIATED';
        else if (newStatus === 'CANCELADO') updates.status = 'CANCELLED';
        else if (newStatus !== 'PARCIAL' && newStatus !== 'RENEGOCIADO') {
            /* Espelho de `payableService.updateStatus`: voltar para estado aberto
               (Previsto/Emitido/Enviado) tem que desfazer a baixa em `status` e
               `payment_date`, senão a view — que desde 20270909000000 lê os dois
               campos — mantém o título como Recebido. */
            updates.status = 'PENDING';
            updates.payment_date = null;
        }

        const { error } = await supabase
            .from('internal_transactions')
            .update(updates)
            .eq('id', id);
        if (error) throw error;
    },

    async create(
        organizationId: string,
        data: {
            due_date: string;
            amount: number;
            description: string;
            party_id?: string;
            party_name?: string;
            party_type?: string;
            project_id?: string;
            category?: string;
        },
    ): Promise<Receivable> {
        const { data: row, error } = await supabase
            .from('internal_transactions')
            .insert({
                organization_id: organizationId,
                source_system:   'MANUAL',
                direction:       'CREDIT',
                transaction_date: data.due_date,
                due_date:        data.due_date,
                amount:          data.amount,
                description:     data.description,
                party_id:        data.party_id ?? null,
                party_name:      data.party_name ?? null,
                party_type:      data.party_type ?? 'CLIENT',
                project_id:      data.project_id ?? null,
                category:        data.category ?? null,
                status:          'PENDING',
                business_status: 'PREVISTO',
            })
            .select('id,organization_id,source_system,reference_id,transaction_date,due_date,amount,description,category,status,business_status,party_id,party_name,party_type,project_id,created_at,updated_at')
            .single();
        if (error) throw error;
        return { ...row, direction: 'CREDIT', effective_status: 'PREVISTO' } as Receivable;
    },

    /** Corrige dados de negócio do recebível (valor, vencimento, descrição, contraparte). */
    async update(
        id: string,
        data: {
            amount?: number; due_date?: string; description?: string;
            party_id?: string | null; party_name?: string | null; category?: string | null;
        },
    ): Promise<void> {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (data.amount      !== undefined) updates.amount = data.amount;
        if (data.due_date    !== undefined) {
            updates.due_date = data.due_date;
            // transaction_date espelha o vencimento em lançamento manual (é como o
            // create o grava) — sem isso a linha reordena/soma errado após editar.
            updates.transaction_date = data.due_date;
        }
        if (data.description !== undefined) updates.description = data.description;
        if (data.party_id    !== undefined) updates.party_id = data.party_id;
        if (data.party_name  !== undefined) updates.party_name = data.party_name;
        if (data.category    !== undefined) updates.category = data.category;

        const { error } = await supabase
            .from('internal_transactions')
            .update(updates)
            .eq('id', id);
        if (error) throw error;
    },

    /**
     * Exclui um recebível **manual**.
     * O `.eq('source_system','MANUAL')` é trava de segurança, não filtro de
     * conveniência: lançamentos vindos de outro módulo (negócio comercial,
     * contrato, NF-e) são espelho da origem — apagados aqui, voltariam no
     * próximo sync e, pior, sumiriam do lugar onde de fato são gerenciados.
     */
    async remove(id: string): Promise<void> {
        const { data, error } = await supabase
            .from('internal_transactions')
            .delete()
            .eq('id', id)
            .eq('source_system', 'MANUAL')
            .select('id');

        if (error) {
            // reconciliation_matches tem FK RESTRICT: recebível casado com uma
            // linha do extrato não pode sumir sem desfazer a conciliação antes.
            if (error.code === '23503') {
                throw new Error('Este recebível está conciliado com o extrato bancário. Desfaça a conciliação antes de excluir.');
            }
            throw error;
        }
        if (!data || data.length === 0) {
            throw new Error('Só lançamentos manuais podem ser excluídos aqui. Este veio de outro módulo — exclua na origem.');
        }
    },

    /**
     * Faixas de inadimplência. A RPC `fn_inadimplencia` consolida POR organização,
     * então em "Todas as organizações" (null) não há um número único a devolver —
     * retorna vazio e a tela omite só este KPI. A LISTA de recebíveis continua
     * carregando normalmente (`list` aceita null).
     */
    async getInadimplencia(organizationId: string | null): Promise<InadimplenciaFaixa[]> {
        if (!organizationId) return [];
        const { data, error } = await supabase.rpc('fn_inadimplencia', {
            p_organization_id: organizationId,
        });
        if (error) throw error;
        return (data || []) as InadimplenciaFaixa[];
    },
};
