import { supabase } from '../lib/supabase';
import type { ApprovalStep, ApprovalStatus } from '../types/financial';
import { mensagemDaAlcada } from '../utils/alcada';

/**
 * Entidade de um item da fila. `darf` não passa por `submit/approve/reject`
 * daqui: a aprovação do DARF grava todos os membros de uma vez e é RPC própria
 * (`darfService.aprovar`/`rejeitar`, 26/10/2026).
 */
export type QueueEntity = ApprovalEntity | 'darf';

/** Item acionável da fila unificada (transação, DARF, contrato, compra…). */
export interface ActionQueueItem {
    entity: QueueEntity;
    id: string;
    title: string;
    party_name?: string;
    project_name?: string;
    amount: number;
    due_date?: string;
    approval_status: ApprovalStatus;
    approval_chain: ApprovalStep[];
    approval_required_levels: number;
    /**
     * Título já baixado (conciliação/Asaas) com a alçada ainda pendente — marcado
     * pela tela a partir de `pago_sem_alcada_em` (item H.1 do plano 2026-10-16),
     * não pela RPC (`fn_approval_action_queue` alimenta também a Central).
     */
    pago_sem_alcada?: boolean;
    /**
     * Origem do item (26/10/2026): `source_system` do título (BOLETO, LABOR,
     * CONTRACT_*…), TRIBUTO para tributo, DARF, ou o tipo da entidade (CONTRATO,
     * PEDIDO, PLANTA, SOLICITACAO_COMPRA, OFICIO). Coluna e filtro "Origem" da fila.
     */
    origem?: string | null;
    /**
     * Alçada por usuário (10/11/2026): quem está logado pode aprovar o nível da vez?
     * Nível sem ninguém cadastrado = `true` (liberado). Ver utils/alcada.ts.
     */
    pode_aprovar?: boolean;
    /** Nomes de quem aprova o nível da vez; vazio = qualquer pessoa. */
    vez_de?: string[];
}

// ============================================================
// approvalService — primitiva ÚNICA de aprovação multinível.
//
// Colapsa a lógica antes duplicada entre financialApprovalService
// (internal_transactions) e contractService (contracts). Cada serviço
// de domínio mantém um wrapper fino que injeta seus efeitos colaterais
// (ex.: contrato→status 'Ativo', transação→business_status) e preserva
// a assinatura pública atual (Regra de Ouro 12).
//
// Fonte única de "quantos níveis": financial_approval_config via RPC
// fn_resolve_approval_levels(org, amount).
//
// DECIDIR É NO SERVIDOR (18/11/2026, F14/F59 — plano
// docs/planos/2026-11-18-seguranca-alcada-no-servidor.md): enviar, aprovar e
// rejeitar são as RPCs fn_alcada_enviar/aprovar/rejeitar. O banco recusa
// gravação direta de approval_status/approval_chain/approval_required_levels que
// aprove (gatilho trg_alcada_guarda) — não volte a gravar esses campos daqui.
// ENTITY_META abaixo espelha fn_alcada_tabela (a lista que vale é a do banco).
// ============================================================

/** Entidades que participam do fluxo unificado de aprovação. */
export type ApprovalEntity =
    | 'transaction'
    | 'contract'
    | 'purchase_order'
    | 'process_step'
    | 'blueprint_snapshot'
    | 'purchase_request'
    | 'doc_gen_documento'
    // Módulo Riscos (F2.3, 15/11/2026): sem valor; aprovadores por tipo; fila própria no módulo.
    | 'project_risk';

interface EntityMeta {
    /** Tabela no banco. */
    table: string;
    /** Coluna que carrega o valor usado para resolver as faixas. */
    valueField: string;
}

const ENTITY_META: Record<ApprovalEntity, EntityMeta> = {
    transaction:    { table: 'internal_transactions', valueField: 'amount' },
    contract:       { table: 'contracts',             valueField: 'current_value' },
    // Fase 2 — confirmar a coluna de valor real de purchase_orders antes de ligar.
    purchase_order: { table: 'purchase_orders',       valueField: 'total_value' },
    // process_instance_steps não tem organization_id nem valor monetário em coluna
    // simples (o processo pode não ser sobre dinheiro) — o motor de Processos SEMPRE
    // deve chamar submit() passando opts.organizationId e opts.amount explícitos
    // (amount=0 para aprovação não monetária), do mesmo jeito que purchase_order faz.
    process_step:   { table: 'process_instance_steps', valueField: 'amount' },
    // A REVISAO DE PLANTA (Etapa 5 do roadmap BIM). Nao tem valor monetario:
    // `blueprintApprovalService` SEMPRE chama submit() com `amount: 0` e o
    // `organizationId` explicito, exatamente como process_step faz — e por isso
    // `valueField` aponta para uma coluna que nao existe e nunca e lida (submit
    // so a inclui no select quando `opts.amount` vem indefinido).
    //
    // O que se aprova e o SNAPSHOT, e nao o estudo: o snapshot e imutavel e
    // carrega o hash, entao o carimbo diz exatamente O QUE foi aprovado. Um
    // estado no estudo congelaria o desenho inteiro enquanto uma revisao esta
    // sob analise.
    blueprint_snapshot: { table: 'blueprint_snapshots', valueField: 'amount' },
    // SOLICITAÇÃO DE COMPRA (2026-09-26). `estimated_total` existe, mas
    // `purchaseRequestService` passa organizationId e amount explícitos — e
    // `semFaixa: 'exigir1'`: SC sem preço (valor 0) ainda precisa de aprovação.
    purchase_request:   { table: 'purchase_requests',   valueField: 'estimated_total' },
    // OFÍCIO (Documentos › Ofícios, 10/10/2026). Não tem valor: o serviço sempre
    // chama submit() com `amount: 0`, `organizationId` explícito e
    // `semFaixa: 'exigir1'` — `valueField` aponta para coluna inexistente e nunca é lido.
    doc_gen_documento:  { table: 'doc_gen_documentos',  valueField: 'amount' },
    project_risk:       { table: 'project_risks',       valueField: 'amount' },  // sem valor: chamador passa amount 0
};

export interface ResolvedLevels {
    required_levels: number;
    level1_label: string;
    level2_label: string;
}

/** Rótulos dos níveis exibidos na cadeia (vêm da faixa em financial_approval_config). */
export interface RoleLabels {
    level1_label: string;
    level2_label?: string;
}

/** Pendências de aprovação por entidade (enforcement soft). */
export interface ApprovalPendingSummary {
    /** Lê a fila (`fn_approval_action_queue`), então inclui `darf`. */
    entity: QueueEntity;
    qtd: number;
    soma: number;
}

export const approvalService = {

    /**
     * Resumo de pendências (enforcement soft): itens que caem em uma faixa de
     * aprovação mas ainda não estão APROVADO, por entidade. Read-only — alimenta
     * o indicador/alerta na UI. Não bloqueia nada.
     */
    async getPendingSummary(organizationId: string | null): Promise<ApprovalPendingSummary[]> {
        const { data, error } = await supabase.rpc('fn_approval_pending_summary', {
            p_organization_id: organizationId || null,
        });
        if (error) {
            console.error('[approvalService] getPendingSummary:', error);
            throw new Error(`Erro ao carregar pendências de aprovação: ${error.message}`);
        }
        return (data as ApprovalPendingSummary[]) ?? [];
    },

    /**
     * Fila ACIONÁVEL unificada (transações + contratos + compras): itens acima
     * da faixa que precisam de ação — RASCUNHO (a submeter) ou PENDENTE (a aprovar).
     * Cada item traz `entity` para a UI despachar a ação ao serviço de domínio.
     */
    async listActionQueue(organizationId: string | null): Promise<ActionQueueItem[]> {
        const { data, error } = await supabase.rpc('fn_approval_action_queue', {
            p_organization_id: organizationId || null,
        });
        if (error) {
            console.error('[approvalService] listActionQueue:', error);
            throw new Error(`Erro ao carregar fila de aprovação: ${error.message}`);
        }
        return ((data || []) as ActionQueueItem[]).map(r => ({
            ...r,
            approval_chain: (r.approval_chain as unknown as ApprovalStep[]) ?? [],
        }));
    },

    /** Resolve quantos níveis a faixa de valor exige. Fonte: financial_approval_config. */
    async resolveRequiredLevels(organizationId: string, amount: number): Promise<ResolvedLevels | null> {
        const { data, error } = await supabase.rpc('fn_resolve_approval_levels', {
            p_organization_id: organizationId,
            p_amount:          amount,
        });
        if (error) {
            console.error('[approvalService] resolveRequiredLevels:', error);
            throw new Error(`Erro ao resolver níveis de aprovação: ${error.message}`);
        }
        return (data as ResolvedLevels[])?.[0] ?? null;
    },

    /**
     * Coloca a entidade no fluxo — pela RPC `fn_alcada_enviar` (18/11/2026, F14). O SERVIDOR
     * lê o valor do item, resolve a faixa e marca PENDENTE com os níveis dela (ou libera abaixo
     * do piso). `extra` injeta campos específicos da entidade (ex.: business_status), num UPDATE
     * comum depois da decisão. Retorna a linha atualizada.
     *
     * `opts.organizationId`/`opts.amount` não decidem mais nada: valor e organização são os do
     * banco (a RPC usa a mesma conta da trava — pedido pelo total dos itens, etapa pela coluna
     * `amount`). Ficam na assinatura para não mexer nos chamadores.
     *
     * ── `semFaixa`: o que fazer quando NENHUMA faixa cobre o valor ───────────
     *
     * `fn_resolve_approval_levels` não devolve linha quando o valor está fora de
     * todas as faixas. Isso significa coisas OPOSTAS conforme a entidade:
     *
     *  • Dinheiro (título, contrato, pedido): a ausência de faixa É a regra —
     *    "abaixo do piso da alçada não precisa de aprovação". A config real
     *    desta base começa em R$ 5.000, e tratar isso como "exige 1 nível"
     *    prendia na fila justamente a maioria dos lançamentos (os boletos reais
     *    iam de R$ 108 a R$ 2.050). Esses passam `'liberar'`.
     *
     *  • Processo (`process_step`): decide **por etapa**, em
     *    `processService.submitStepApproval`. Etapa com valor (`amount > 0`) lê
     *    "fora de faixa" como abaixo do piso e passa `'liberar'`, igual às
     *    demais. Etapa NÃO monetária chega com `amount = 0`, e aí "fora de
     *    faixa" não quer dizer "barato" — quer dizer que a pergunta sobre valor
     *    não se aplica. Essa mantém `'exigir1'`: alguém modelou o processo
     *    dizendo que ali precisa de aprovação, e liberar sozinho faria o portão
     *    se autoaprovar. (O servidor repete a regra: etapa sem valor nunca libera.)
     *
     * O servidor só libera item em RASCUNHO: item REJEITADO vai para a fila.
     * O default é `'exigir1'` de propósito: preserva o comportamento histórico
     * para qualquer chamador que não tenha sido revisado.
     */
    async submit(
        entity: ApprovalEntity,
        id: string,
        extra: Record<string, unknown> = {},
        opts: { organizationId?: string; amount?: number; semFaixa?: 'liberar' | 'exigir1' } = {},
    ): Promise<any> {
        const { data, error } = await supabase.rpc('fn_alcada_enviar', {
            p_entity:    entity,
            p_id:        id,
            p_sem_faixa: opts.semFaixa ?? 'exigir1',
            p_extra:     extra,
        });
        if (error) {
            console.error('[approvalService] submit:', error);
            throw new Error(mensagemDaAlcada(error.message) ?? `Erro ao enviar para aprovação: ${error.message}`);
        }
        return data;
    },

    /**
     * Reenvia um item REJEITADO (o histórico da cadeia fica; a aprovação conta só a rodada
     * depois da rejeição). Mesma RPC, `p_reenvio`. Recusa item que não está rejeitado.
     */
    async resubmit(
        entity: ApprovalEntity,
        id: string,
        extra: Record<string, unknown> = {},
    ): Promise<any> {
        const { data, error } = await supabase.rpc('fn_alcada_enviar', {
            p_entity:    entity,
            p_id:        id,
            p_sem_faixa: 'exigir1',
            p_extra:     extra,
            p_reenvio:   true,
        });
        if (error) {
            console.error('[approvalService] resubmit:', error);
            throw new Error(mensagemDaAlcada(error.message) ?? `Erro ao reenviar para aprovação: ${error.message}`);
        }
        return data;
    },

    /**
     * Aprova o nível da vez — pela RPC `fn_alcada_aprovar` (18/11/2026, F14). O SERVIDOR
     * confere que o item está pendente, que `level` é o nível da vez, que quem está logado
     * está na alçada desse nível, grava o passo em nome do e-mail do login e decide se a
     * alçada fechou. Quando fecha, aplica `extraOnApproved` (efeito específico da entidade).
     * `approvedBy` não é mais gravado (o passo leva o e-mail do JWT, que é o mesmo); fica na
     * assinatura para não mexer nos chamadores. Retorna a linha atualizada.
     */
    async approve(
        entity: ApprovalEntity,
        id: string,
        level: 1 | 2,
        approvedBy: string,
        labels: RoleLabels,
        notes?: string,
        extraOnApproved: Record<string, unknown> = {},
    ): Promise<any> {
        const { data, error } = await supabase.rpc('fn_alcada_aprovar', {
            p_entity:  entity,
            p_id:      id,
            p_nivel:   level,
            p_obs:     notes ?? null,
            p_rotulos: { level1_label: labels.level1_label, level2_label: labels.level2_label ?? null },
            p_extra:   extraOnApproved,
        });
        if (error) {
            console.error('[approvalService] approve:', error);
            // ALCADA_NAO_PERMITE já traz a frase para o usuário.
            throw new Error(mensagemDaAlcada(error.message) ?? `Erro ao aprovar: ${error.message}`);
        }
        return data;
    },

    /**
     * Rejeita — pela RPC `fn_alcada_rejeitar` (18/11/2026, F14): quem rejeita é quem
     * poderia aprovar o nível da vez; o passo vai em nome do e-mail do login.
     * `extra` injeta campos específicos (ex.: business_status, status).
     * Retorna a linha atualizada.
     */
    async reject(
        entity: ApprovalEntity,
        id: string,
        rejectedBy: string,
        reason: string,
        extra: Record<string, unknown> = {},
    ): Promise<any> {
        const { data, error } = await supabase.rpc('fn_alcada_rejeitar', {
            p_entity: entity,
            p_id:     id,
            p_motivo: reason,
            p_extra:  extra,
        });
        if (error) {
            console.error('[approvalService] reject:', error);
            throw new Error(mensagemDaAlcada(error.message) ?? `Erro ao rejeitar: ${error.message}`);
        }
        return data;
    },
};
