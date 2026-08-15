import { supabase } from '../lib/supabase';

/**
 * Fechamento de competência de Contas a Pagar, consolidado por Centro de Custo.
 *
 * Fechar um mês é dizer que os títulos a pagar com vencimento nele não mudam
 * mais: o consolidado por Centro de Custo vira um RETRATO congelado (os itens
 * abaixo) e a trigger `trg_payable_competencia_fechada_*` passa a recusar
 * INSERT/UPDATE/DELETE em `internal_transactions` daquele mês.
 *
 * Migration: `aplicar_20270905000025_fechamento_centro_custo.sql`.
 */

export type ClosingStatus = 'FECHADO' | 'REABERTO';

export interface CostCenterClosingItem {
    id?: string;
    closing_id?: string;
    organization_id?: string;
    /** Nulo = a fatia "sem centro de custo" — quanto do mês ninguém classificou. */
    cost_center_id: string | null;
    /** Congelado no fechamento: renomear o CC depois não reescreve o passado. */
    cost_center_name: string;
    total_previsto: number;
    total_pago: number;
    total_aberto: number;
    qtd_titulos: number;
}

export interface CostCenterClosing {
    id: string;
    organization_id: string;
    /** Primeiro dia do mês ('YYYY-MM-01'). */
    competencia: string;
    status: ClosingStatus;
    total_previsto: number;
    total_pago: number;
    total_aberto: number;
    qtd_titulos: number;
    observacoes?: string | null;
    fechado_em?: string | null;
    fechado_por?: string | null;
    reaberto_em?: string | null;
    reaberto_por?: string | null;
    /** Só vem em `getByCompetencia` — a listagem não carrega os itens. */
    items?: CostCenterClosingItem[];
}

const CLOSING_COLS =
    'id,organization_id,competencia,status,total_previsto,total_pago,total_aberto,qtd_titulos,observacoes,fechado_em,fechado_por,reaberto_em,reaberto_por';

/** 'YYYY-MM' → 'YYYY-MM-01'. A coluna tem CHECK de primeiro dia do mês. */
export function competenciaToDate(competencia: string): string {
    return `${competencia.slice(0, 7)}-01`;
}

/** Quem está fechando — para a trilha. E-mail é o que o resto do app usa. */
async function currentUserLabel(): Promise<string> {
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? data.user?.id ?? 'desconhecido';
}

export const costCenterClosingService = {

    /**
     * `organizationId` aceita null: em "Todas as organizações" não filtramos e a
     * RLS recorta o que o usuário pode ver (REGRA #5 — leitura nunca bloqueia).
     */
    async list(organizationId?: string | null): Promise<CostCenterClosing[]> {
        let q = supabase
            .from('cost_center_closings')
            .select(CLOSING_COLS)
            .order('competencia', { ascending: false });

        if (organizationId) q = q.eq('organization_id', organizationId);

        const { data, error } = await q;
        if (error) throw error;
        return (data || []) as CostCenterClosing[];
    },

    /** O fechamento de um mês, com o retrato por centro de custo. */
    async getByCompetencia(organizationId: string, competencia: string): Promise<CostCenterClosing | null> {
        const { data, error } = await supabase
            .from('cost_center_closings')
            .select(CLOSING_COLS)
            .eq('organization_id', organizationId)
            .eq('competencia', competenciaToDate(competencia))
            .maybeSingle();
        if (error) throw error;
        if (!data) return null;

        const closing = data as CostCenterClosing;
        const { data: items, error: itemsError } = await supabase
            .from('cost_center_closing_items')
            .select('id,closing_id,organization_id,cost_center_id,cost_center_name,total_previsto,total_pago,total_aberto,qtd_titulos')
            .eq('closing_id', closing.id)
            .order('cost_center_name');
        if (itemsError) throw itemsError;

        return { ...closing, items: (items || []) as CostCenterClosingItem[] };
    },

    /**
     * Fecha (ou refecha) a competência e grava o retrato.
     *
     * `organizationId` é obrigatório e específico: fechamento contábil é a
     * exceção nomeada da REGRA #5 — não existe "fechar o mês em todas as
     * organizações de uma vez", porque cada uma fecha o próprio caixa.
     */
    async close(
        organizationId: string,
        competencia: string,
        items: CostCenterClosingItem[],
        observacoes?: string,
    ): Promise<CostCenterClosing> {
        const quem = await currentUserLabel();
        const comp = competenciaToDate(competencia);
        const totais = items.reduce(
            (acc, i) => ({
                total_previsto: acc.total_previsto + i.total_previsto,
                total_pago:     acc.total_pago     + i.total_pago,
                total_aberto:   acc.total_aberto   + i.total_aberto,
                qtd_titulos:    acc.qtd_titulos    + i.qtd_titulos,
            }),
            { total_previsto: 0, total_pago: 0, total_aberto: 0, qtd_titulos: 0 },
        );

        // upsert em vez de insert: refechar um mês reaberto é UPDATE da MESMA
        // linha (o índice único é por org+competência) — um segundo registro
        // faria duas verdades sobre o mesmo mês.
        const { data, error } = await supabase
            .from('cost_center_closings')
            .upsert(
                {
                    organization_id: organizationId,
                    competencia: comp,
                    status: 'FECHADO',
                    ...totais,
                    observacoes: observacoes ?? null,
                    fechado_em: new Date().toISOString(),
                    fechado_por: quem,
                    // Zera a trilha de reabertura: o mês voltou a estar fechado.
                    reaberto_em: null,
                    reaberto_por: null,
                },
                { onConflict: 'organization_id,competencia' },
            )
            .select(CLOSING_COLS)
            .single();
        if (error) throw error;

        const closing = data as CostCenterClosing;

        // Refechar substitui o retrato inteiro: os números mudaram entre a
        // reabertura e agora, e um item antigo sobrevivente mentiria.
        const { error: delError } = await supabase
            .from('cost_center_closing_items')
            .delete()
            .eq('closing_id', closing.id);
        if (delError) throw delError;

        if (items.length > 0) {
            const { error: insError } = await supabase
                .from('cost_center_closing_items')
                .insert(items.map(i => ({
                    closing_id: closing.id,
                    organization_id: organizationId,
                    cost_center_id: i.cost_center_id,
                    cost_center_name: i.cost_center_name,
                    total_previsto: i.total_previsto,
                    total_pago: i.total_pago,
                    total_aberto: i.total_aberto,
                    qtd_titulos: i.qtd_titulos,
                })));
            if (insError) throw insError;
        }

        return { ...closing, items };
    },

    /**
     * Reabre a competência. Marca REABERTO em vez de apagar: apagar a linha
     * apagaria junto a prova de que o mês esteve fechado — que é exatamente o
     * que uma auditoria procura. O retrato dos itens fica preservado.
     */
    async reopen(closingId: string): Promise<void> {
        const quem = await currentUserLabel();
        const { error } = await supabase
            .from('cost_center_closings')
            .update({
                status: 'REABERTO',
                reaberto_em: new Date().toISOString(),
                reaberto_por: quem,
                updated_at: new Date().toISOString(),
            })
            .eq('id', closingId);
        if (error) throw error;
    },
};
