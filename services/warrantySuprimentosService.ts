import { supabase } from '../lib/supabase';
import { purchaseRequestService } from './purchaseRequestService';
import type { PurchaseRequest } from '../types/purchaseRequest';
import type { ContratoDoChamado, PedidoDoChamado } from '../utils/warrantySuprimentos';

/**
 * Pós-Obra & Garantia ↔ Suprimentos — o que um chamado já gerou.
 * Plano: docs/planos/2026-10-11-pos-obra-garantia-conexao-suprimentos.md (1.6).
 *
 * Sem view/RPC nova: a RLS de cada tabela já recorta. A consolidação (previsto,
 * comprometido, realizado) é de utils/warrantySuprimentos.ts.
 *
 * Pedidos chegam por DOIS caminhos: o item da SC aponta o pedido
 * (`generateOrder`), ou aponta a cotação e a cotação gerou o pedido
 * (`selectWinner` grava `purchase_orders.quotation_request_id` desde
 * aplicar_20271011000600). A união é deduplicada por id.
 *
 * ⚠️ `purchase_orders` NÃO tem FK para `suppliers` (matchService.ts:61): embed
 * `suppliers(name)` derruba a consulta inteira com 400. O nome do fornecedor vem
 * numa consulta separada — também para contratos, por uniformidade.
 */
export interface SuprimentosDoChamado {
    solicitacoes: PurchaseRequest[];
    pedidos: PedidoDoChamado[];
    contratos: ContratoDoChamado[];
}

type Row = Record<string, any>;

async function nomesDeFornecedores(ids: string[]): Promise<Record<string, string>> {
    const unicos = [...new Set(ids.filter(Boolean))];
    if (unicos.length === 0) return {};
    const { data, error } = await supabase.from('suppliers').select('id, name').in('id', unicos);
    if (error) throw error;
    return Object.fromEntries(((data ?? []) as Row[]).map(s => [s.id, s.name]));
}

const COLS_PEDIDO = 'id, number, status, supplier_id, items, created_at';

/** SC ou contrato ainda sem chamado, que pode ser vinculado (drawer "Vincular existente"). */
export interface Vinculavel {
    tipo: 'solicitacao' | 'contrato';
    id: string;
    numero: string;
    descricao: string;
    projectId: string | null;
    status: string;
    valor: number;
    data: string | null;
}

const TABELA_DO_TIPO = { solicitacao: 'purchase_requests', contrato: 'contracts' } as const;

export const warrantySuprimentosService = {
    /**
     * SCs e contratos de FORNECEDOR da organização do chamado ainda sem vínculo
     * com chamado nenhum. Cancelados ficam de fora. O recorte por obra é da tela.
     */
    async listarVinculaveis(organizationId: string): Promise<Vinculavel[]> {
        const [scs, cts] = await Promise.all([
            supabase.from('purchase_requests')
                .select('id, number, title, project_id, estimated_total, approval_status, created_at')
                .eq('organization_id', organizationId)
                .is('warranty_claim_id', null)
                .is('cancelled_at', null)
                .order('created_at', { ascending: false }),
            supabase.from('contracts')
                .select('id, number, title, project_id, status, current_value, start_date')
                .eq('organization_id', organizationId)
                .eq('direction', 'INCOMING')
                .or('domain.eq.SUPRIMENTOS,domain.is.null')
                .is('warranty_claim_id', null)
                .neq('status', 'Cancelado')
                .order('start_date', { ascending: false }),
        ]);
        if (scs.error) throw scs.error;
        if (cts.error) throw cts.error;
        const SC_STATUS: Record<string, string> = { RASCUNHO: 'Rascunho', PENDENTE: 'Em aprovação', APROVADO: 'Aprovada', REJEITADO: 'Reprovada' };
        return [
            ...((scs.data ?? []) as Row[]).map(r => ({
                tipo: 'solicitacao' as const, id: r.id, numero: r.number ?? '—', descricao: r.title,
                projectId: r.project_id ?? null, status: SC_STATUS[r.approval_status] ?? r.approval_status,
                valor: Number(r.estimated_total ?? 0), data: r.created_at ?? null,
            })),
            ...((cts.data ?? []) as Row[]).map(r => ({
                tipo: 'contrato' as const, id: r.id, numero: r.number ?? '—', descricao: r.title,
                projectId: r.project_id ?? null, status: r.status,
                valor: Number(r.current_value ?? 0), data: r.start_date ?? null,
            })),
        ];
    },

    /**
     * Liga um registro existente ao chamado. A trava de organização e o evento
     * `ProcurementLinked` são do banco (aplicar_20271011000600) — a recusa vem
     * como P0004 com a frase pronta.
     */
    async vincular(tipo: 'solicitacao' | 'contrato', id: string, claimId: string): Promise<void> {
        const { error } = await supabase.from(TABELA_DO_TIPO[tipo]).update({ warranty_claim_id: claimId }).eq('id', id);
        if (error) throw error;
    },

    /** Tira o vínculo; o registro continua em Suprimentos. Evento `ProcurementUnlinked` no banco. */
    async desvincular(tipo: 'solicitacao' | 'contrato', id: string): Promise<void> {
        const { error } = await supabase.from(TABELA_DO_TIPO[tipo]).update({ warranty_claim_id: null }).eq('id', id);
        if (error) throw error;
    },

    /** Quantos registros de Suprimentos apontam para o chamado (aviso ao excluir). */
    async contarVinculos(claimId: string): Promise<{ solicitacoes: number; contratos: number }> {
        const [sc, ct] = await Promise.all([
            supabase.from('purchase_requests').select('id', { count: 'exact', head: true }).eq('warranty_claim_id', claimId),
            supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('warranty_claim_id', claimId),
        ]);
        if (sc.error) throw sc.error;
        if (ct.error) throw ct.error;
        return { solicitacoes: sc.count ?? 0, contratos: ct.count ?? 0 };
    },

    async carregar(claimId: string): Promise<SuprimentosDoChamado> {
        const [solicitacoes, contratosRaw] = await Promise.all([
            purchaseRequestService.listByWarrantyClaim(claimId),
            supabase
                .from('contracts')
                .select('id, number, title, status, current_value, start_date, supplier_id, contract_measurements(total_value, status)')
                .eq('warranty_claim_id', claimId)
                .then(r => { if (r.error) throw r.error; return (r.data ?? []) as Row[]; }),
        ]);

        const itens = solicitacoes.flatMap(sc => sc.items);
        const idsPedido = [...new Set(itens.map(i => i.purchaseOrderId).filter(Boolean) as string[])];
        const idsCotacao = [...new Set(itens.map(i => i.quotationRequestId).filter(Boolean) as string[])];

        const [porItem, porCotacao] = await Promise.all([
            idsPedido.length
                ? supabase.from('purchase_orders').select(COLS_PEDIDO).in('id', idsPedido)
                    .then(r => { if (r.error) throw r.error; return (r.data ?? []) as Row[]; })
                : Promise.resolve([] as Row[]),
            idsCotacao.length
                ? supabase.from('purchase_orders').select(COLS_PEDIDO).in('quotation_request_id', idsCotacao)
                    .then(r => { if (r.error) throw r.error; return (r.data ?? []) as Row[]; })
                : Promise.resolve([] as Row[]),
        ]);
        const pedidosRaw = [...new Map([...porItem, ...porCotacao].map(p => [p.id as string, p])).values()];

        const nomes = await nomesDeFornecedores([
            ...pedidosRaw.map(p => p.supplier_id as string),
            ...contratosRaw.map(c => c.supplier_id as string),
        ]);

        return {
            solicitacoes,
            pedidos: pedidosRaw.map(p => ({
                id: p.id, number: p.number, status: p.status,
                supplierName: nomes[p.supplier_id] ?? null,
                items: p.items ?? [], createdAt: p.created_at,
            })),
            contratos: contratosRaw.map(c => ({
                id: c.id, number: c.number, title: c.title, status: c.status,
                currentValue: c.current_value, startDate: c.start_date,
                supplierName: nomes[c.supplier_id] ?? null,
                medicoes: ((c.contract_measurements ?? []) as Row[]).map(m => ({ totalValue: m.total_value, status: m.status })),
            })),
        };
    },
};
