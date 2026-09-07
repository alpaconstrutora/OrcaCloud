/**
 * Portal de Crédito · Credit Room — CRUD, snapshot, participantes, Data Room,
 * solicitações, comentários e auditoria.
 * Plano: docs/planos/2026-09-07-portal-credito-credit-room.md (item 4)
 *
 * REGRA #5: `organizationId` pode ser `null` ("Todas as organizações") e isso
 * NUNCA bloqueia leitura — o `.eq()` só entra quando há org. A RLS recorta o
 * resto. Modelo: services/debtService.ts.
 *
 * O que este serviço NÃO faz: calcular. Dívida, KPIs da obra, NOI e unidades
 * vêm dos serviços donos (debtAnalyticsService, opuraAnalyticsService,
 * rentalNoiService, empreendimentoService); `freezeVersion` só os reúne e
 * entrega a `utils/creditRoomSnapshot.ts`, que é puro e testado.
 */

import { supabase } from '../lib/supabase';
import type {
    CreditRoom,
    CreditRoomAccessAction,
    CreditRoomAccessLog,
    CreditRoomComment,
    CreditRoomCommentVisibility,
    CreditRoomDisbursement,
    CreditRoomDisbursementStatus,
    CreditRoomDocument,
    CreditRoomInput,
    CreditRoomMember,
    CreditRoomMemberInput,
    CreditRoomRequest,
    CreditRoomRequestInput,
    CreditRoomRequestStatus,
    CreditRoomSide,
    CreditRoomStatus,
    CreditRoomVersion,
    MyCreditRoomMembership,
} from '../types/creditRoom';
import { PERMISSOES_PADRAO } from '../types/creditRoom';
import {
    buildSnapshot,
    computeIndicators,
    orcadoDoOrcamento,
    servicoPrimeirosMeses,
    type CreditRoomIndicators,
    type CreditRoomSnapshot,
} from '../utils/creditRoomSnapshot';
import { avaliarCovenant, type AvaliacaoCovenant } from '../utils/covenantAvaliacao';
import { calculateProjectProgress } from '../utils/projectUtils';
import { debtCovenantService, type DebtCovenant, type DebtCovenantInput } from './debtCovenantService';
import { debtAnalyticsService } from './debtAnalyticsService';
import { debtService } from './debtService';
import { opuraAnalyticsService } from './opuraAnalyticsService';
import { rentalNoiService } from './rentalNoiService';
import { empreendimentoService } from './empreendimentoService';
import { documentService } from './documentService';

// ⚠️ supabase-js exige string LITERAL em `.select()` — concatenar vira
// `string` e o cliente devolve GenericStringError.
const ROOM_COLS =
    'id, organization_id, seq, code, name, company_id, empreendimento_id, project_id, debt_contract_id, institution_supplier_id, institution_name, requested_amount, purpose, modality, term_months, grace_months, eligible_flows, guarantees, equity_committed, equity_contributed, status, active_version_id, notes, created_by, created_at, updated_at';

const VERSION_COLS =
    'id, organization_id, credit_room_id, version_no, label, data_base, snapshot, indicators, document_version_ids, notes, frozen_by, frozen_at';

const MEMBER_COLS =
    'id, organization_id, credit_room_id, email, user_id, name, institution, side, permissions, invited_by, invited_at, expires_at, revoked_at, revoked_by, last_access_at';

const REQUEST_COLS =
    'id, organization_id, credit_room_id, title, description, from_side, assignee_email, due_at, priority, status, answer_document_id, created_by, created_at, updated_at';

const COMMENT_COLS =
    'id, organization_id, credit_room_id, request_id, visibility, author_email, author_side, body, created_at';

const LOG_COLS =
    'id, credit_room_id, actor_user_id, actor_email, actor_side, action, resource_type, resource_id, metadata, ip, user_agent, created_at';

const DISBURSEMENT_COLS =
    'id, organization_id, debt_contract_id, credit_room_id, seq, status, requested_amount, approved_amount, gross_amount, net_amount, disbursed_at, purpose, measurement_ref, physical_pct, analysis_notes, decided_at, decided_by, document_url, notes, created_at, updated_at';

type Row = Record<string, unknown>;
const str = (v: unknown): string | undefined => (v == null ? undefined : String(v));
const num = (v: unknown): number => (v == null ? 0 : Number(v));

function mapRoom(r: Row): CreditRoom {
    const flows = (r.eligible_flows ?? {}) as Partial<CreditRoom['eligibleFlows']>;
    return {
        id: String(r.id),
        organizationId: String(r.organization_id),
        seq: num(r.seq),
        code: String(r.code ?? ''),
        name: String(r.name ?? ''),
        companyId: str(r.company_id),
        empreendimentoId: str(r.empreendimento_id),
        projectId: str(r.project_id),
        debtContractId: str(r.debt_contract_id),
        institutionSupplierId: str(r.institution_supplier_id),
        institutionName: str(r.institution_name),
        requestedAmount: num(r.requested_amount),
        purpose: str(r.purpose),
        modality: str(r.modality),
        termMonths: r.term_months == null ? undefined : num(r.term_months),
        graceMonths: r.grace_months == null ? undefined : num(r.grace_months),
        eligibleFlows: {
            noi: flows.noi ?? true,
            receivables: flows.receivables ?? false,
            operating_cash: flows.operating_cash ?? false,
        },
        guarantees: Array.isArray(r.guarantees) ? (r.guarantees as CreditRoom['guarantees']) : [],
        equityCommitted: num(r.equity_committed),
        equityContributed: num(r.equity_contributed),
        status: String(r.status) as CreditRoomStatus,
        activeVersionId: str(r.active_version_id),
        notes: str(r.notes),
        createdBy: str(r.created_by),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
    };
}

function toRoomRow(input: CreditRoomInput): Row {
    return {
        name: input.name,
        company_id: input.companyId ?? null,
        empreendimento_id: input.empreendimentoId ?? null,
        project_id: input.projectId ?? null,
        debt_contract_id: input.debtContractId ?? null,
        institution_supplier_id: input.institutionSupplierId ?? null,
        institution_name: input.institutionName ?? null,
        requested_amount: input.requestedAmount,
        purpose: input.purpose ?? null,
        modality: input.modality ?? null,
        term_months: input.termMonths ?? null,
        grace_months: input.graceMonths ?? null,
        eligible_flows: input.eligibleFlows,
        guarantees: input.guarantees ?? [],
        equity_committed: input.equityCommitted,
        equity_contributed: input.equityContributed,
        status: input.status,
        notes: input.notes ?? null,
    };
}

function mapVersion(r: Row): CreditRoomVersion {
    return {
        id: String(r.id),
        organizationId: String(r.organization_id),
        creditRoomId: String(r.credit_room_id),
        versionNo: num(r.version_no),
        label: str(r.label),
        dataBase: String(r.data_base),
        snapshot: r.snapshot as CreditRoomSnapshot,
        indicators: (r.indicators ?? {}) as CreditRoomIndicators,
        documentVersionIds: Array.isArray(r.document_version_ids) ? (r.document_version_ids as string[]) : [],
        notes: str(r.notes),
        frozenBy: str(r.frozen_by),
        frozenAt: String(r.frozen_at),
    };
}

function mapMember(r: Row): CreditRoomMember {
    return {
        id: String(r.id),
        organizationId: String(r.organization_id),
        creditRoomId: String(r.credit_room_id),
        email: String(r.email),
        userId: str(r.user_id),
        name: str(r.name),
        institution: str(r.institution),
        side: String(r.side) as CreditRoomSide,
        permissions: { ...PERMISSOES_PADRAO, ...((r.permissions ?? {}) as Partial<CreditRoomMember['permissions']>) },
        invitedBy: str(r.invited_by),
        invitedAt: String(r.invited_at),
        expiresAt: str(r.expires_at),
        revokedAt: str(r.revoked_at),
        revokedBy: str(r.revoked_by),
        lastAccessAt: str(r.last_access_at),
    };
}

function mapRequest(r: Row): CreditRoomRequest {
    return {
        id: String(r.id),
        organizationId: String(r.organization_id),
        creditRoomId: String(r.credit_room_id),
        title: String(r.title ?? ''),
        description: str(r.description),
        fromSide: String(r.from_side) as CreditRoomSide,
        assigneeEmail: str(r.assignee_email),
        dueAt: str(r.due_at),
        priority: String(r.priority) as CreditRoomRequest['priority'],
        status: String(r.status) as CreditRoomRequestStatus,
        answerDocumentId: str(r.answer_document_id),
        createdBy: String(r.created_by ?? ''),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
    };
}

function mapComment(r: Row): CreditRoomComment {
    return {
        id: String(r.id),
        organizationId: String(r.organization_id),
        creditRoomId: String(r.credit_room_id),
        requestId: str(r.request_id),
        visibility: String(r.visibility) as CreditRoomCommentVisibility,
        authorEmail: String(r.author_email),
        authorSide: String(r.author_side) as CreditRoomSide,
        body: String(r.body ?? ''),
        createdAt: String(r.created_at),
    };
}

function mapLog(r: Row): CreditRoomAccessLog {
    return {
        id: String(r.id),
        creditRoomId: String(r.credit_room_id),
        actorUserId: str(r.actor_user_id),
        actorEmail: String(r.actor_email),
        actorSide: str(r.actor_side) as CreditRoomSide | undefined,
        action: String(r.action) as CreditRoomAccessAction,
        resourceType: str(r.resource_type),
        resourceId: str(r.resource_id),
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
        ip: str(r.ip),
        userAgent: str(r.user_agent),
        createdAt: String(r.created_at),
    };
}

function mapDisbursement(r: Row): CreditRoomDisbursement {
    return {
        id: String(r.id),
        organizationId: String(r.organization_id),
        debtContractId: String(r.debt_contract_id),
        creditRoomId: str(r.credit_room_id),
        seq: num(r.seq),
        status: String(r.status) as CreditRoomDisbursementStatus,
        requestedAmount: num(r.requested_amount),
        approvedAmount: r.approved_amount == null ? undefined : num(r.approved_amount),
        grossAmount: num(r.gross_amount),
        netAmount: num(r.net_amount),
        disbursedAt: str(r.disbursed_at),
        purpose: str(r.purpose),
        measurementRef: str(r.measurement_ref),
        physicalPct: r.physical_pct == null ? undefined : num(r.physical_pct),
        analysisNotes: str(r.analysis_notes),
        decidedAt: str(r.decided_at),
        decidedBy: str(r.decided_by),
        documentUrl: str(r.document_url),
        notes: str(r.notes),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
    };
}

function mapDocument(r: Row): CreditRoomDocument {
    return {
        shareId: String(r.share_id),
        documentId: String(r.document_id),
        nome: String(r.nome ?? ''),
        descricao: str(r.descricao),
        categoria: String(r.categoria ?? ''),
        tipoDocumento: String(r.tipo_documento ?? ''),
        status: String(r.status ?? ''),
        dataEmissao: str(r.data_emissao),
        dataValidade: str(r.data_validade),
        versionId: str(r.version_id),
        versionNumber: r.version_number == null ? undefined : num(r.version_number),
        storagePath: str(r.storage_path),
        mimeType: str(r.mime_type),
        tamanho: r.tamanho == null ? undefined : num(r.tamanho),
        sharedAt: String(r.shared_at),
    };
}

/**
 * E-mail do usuário logado, em minúsculas — as policies de INSERT de
 * requests/comments/log exigem `= lower(auth.jwt()->>'email')`. Vem da sessão
 * local (sem ida ao servidor).
 */
async function actorEmail(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    return (data.session?.user?.email ?? '').toLowerCase();
}

async function actorUserId(): Promise<string | undefined> {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id;
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const addMonths = (iso: string, months: number): string => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + months, d));
    return dt.toISOString().slice(0, 10);
};

export const creditRoomService = {

    // ── Credit Rooms ──────────────────────────────────────────────────────

    async list(organizationId: string | null): Promise<CreditRoom[]> {
        let q = supabase.from('credit_rooms').select(ROOM_COLS).order('created_at', { ascending: false });
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []).map(r => mapRoom(r as Row));
    },

    async get(id: string): Promise<CreditRoom | null> {
        const { data, error } = await supabase.from('credit_rooms').select(ROOM_COLS).eq('id', id).maybeSingle();
        if (error) throw error;
        return data ? mapRoom(data as Row) : null;
    },

    async create(organizationId: string, input: CreditRoomInput): Promise<CreditRoom> {
        const created_by = await actorEmail();
        const { data, error } = await supabase
            .from('credit_rooms')
            .insert({ ...toRoomRow(input), organization_id: organizationId, created_by })
            .select(ROOM_COLS)
            .single();
        if (error) throw error;
        return mapRoom(data as Row);
    },

    async update(id: string, input: CreditRoomInput): Promise<CreditRoom> {
        const { data, error } = await supabase
            .from('credit_rooms')
            .update(toRoomRow(input))
            .eq('id', id)
            .select(ROOM_COLS)
            .single();
        if (error) throw error;
        return mapRoom(data as Row);
    },

    async setStatus(room: CreditRoom, status: CreditRoomStatus): Promise<CreditRoom> {
        const { data, error } = await supabase
            .from('credit_rooms')
            .update({ status })
            .eq('id', room.id)
            .select(ROOM_COLS)
            .single();
        if (error) throw error;
        await this.log(room, 'STATUS', 'room', room.id, { de: room.status, para: status });
        return mapRoom(data as Row);
    },

    /**
     * Excluir só é possível sem versão congelada — a trigger de imutabilidade
     * recusa o CASCADE (R2). Com versões, o caminho é cancelar.
     */
    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('credit_rooms').delete().eq('id', id);
        if (error) {
            if (error.code === '23514') {
                throw new Error('Este Credit Room já tem versões congeladas e não pode ser excluído. Cancele a operação em vez de excluí-la.');
            }
            throw error;
        }
    },

    // ── Versões / snapshot ────────────────────────────────────────────────

    async listVersions(creditRoomId: string): Promise<CreditRoomVersion[]> {
        const { data, error } = await supabase
            .from('credit_room_versions')
            .select(VERSION_COLS)
            .eq('credit_room_id', creditRoomId)
            .order('version_no', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(r => mapVersion(r as Row));
    },

    async getVersion(id: string): Promise<CreditRoomVersion | null> {
        const { data, error } = await supabase.from('credit_room_versions').select(VERSION_COLS).eq('id', id).maybeSingle();
        if (error) throw error;
        return data ? mapVersion(data as Row) : null;
    },

    /**
     * Reúne os pedaços dos módulos donos e congela. Cada fonte que falhar vira
     * bloco `null` no snapshot (a tela mostra "sem dado"), nunca zero — exceto
     * a posição da dívida, que é o mínimo para a operação fazer sentido e por
     * isso propaga o erro.
     */
    async freezeVersion(
        room: CreditRoom,
        opts: { label?: string; notes?: string; dataBase?: string } = {},
    ): Promise<CreditRoomVersion> {
        const dataBase = opts.dataBase ?? isoDate(new Date());
        const orgId = room.organizationId;

        const divida = await debtAnalyticsService.position(orgId, dataBase);

        const [obra, unidades, empreendimento, portfolio, recebiveis, novoServico12m, documentos] = await Promise.all([
            this.coletarObra(orgId, room.projectId),
            this.coletarUnidades(room.empreendimentoId),
            this.coletarEmpreendimento(room.empreendimentoId),
            this.coletarPortfolio(orgId, dataBase),
            this.coletarRecebiveis(orgId),
            this.coletarNovoServico(room.debtContractId),
            this.listDocuments(room.id).catch(() => [] as CreditRoomDocument[]),
        ]);

        const snapshot = buildSnapshot({
            dataBase,
            operacao: {
                requestedAmount: room.requestedAmount,
                termMonths: room.termMonths,
                graceMonths: room.graceMonths,
                modality: room.modality,
                purpose: room.purpose,
                institutionName: room.institutionName,
                eligibleFlows: room.eligibleFlows,
                guarantees: room.guarantees,
                equityCommitted: room.equityCommitted,
                equityContributed: room.equityContributed,
            },
            novoServico12m,
            empreendimento,
            divida: { ...divida, dataBase },
            obra,
            unidades,
            portfolio,
            recebiveis,
            documentVersionIds: documentos.map(d => d.versionId).filter((v): v is string => !!v),
        });
        const indicators = computeIndicators(snapshot);

        const { data: last } = await supabase
            .from('credit_room_versions')
            .select('version_no')
            .eq('credit_room_id', room.id)
            .order('version_no', { ascending: false })
            .limit(1)
            .maybeSingle();
        const versionNo = num((last as Row | null)?.version_no) + 1;

        const frozen_by = await actorEmail();
        const { data, error } = await supabase
            .from('credit_room_versions')
            .insert({
                organization_id: orgId,
                credit_room_id: room.id,
                version_no: versionNo,
                label: opts.label ?? null,
                data_base: dataBase,
                snapshot,
                indicators,
                document_version_ids: snapshot.documentos.version_ids,
                notes: opts.notes ?? null,
                frozen_by,
            })
            .select(VERSION_COLS)
            .single();
        if (error) throw error;
        const version = mapVersion(data as Row);

        // A versão recém-congelada passa a ser a que o credor vê.
        const { error: upErr } = await supabase
            .from('credit_rooms')
            .update({ active_version_id: version.id })
            .eq('id', room.id);
        if (upErr) throw upErr;

        await this.log(room, 'FREEZE', 'version', version.id, { version_no: versionNo, label: opts.label ?? null });
        return version;
    },

    async setActiveVersion(room: CreditRoom, versionId: string | null): Promise<void> {
        const { error } = await supabase
            .from('credit_rooms')
            .update({ active_version_id: versionId })
            .eq('id', room.id);
        if (error) throw error;
        await this.log(room, 'STATUS', 'version', versionId ?? '', { active_version: versionId });
    },

    // Coletores — cada um devolve `null` quando a fonte não se aplica ou falha.

    async coletarObra(orgId: string, projectId?: string) {
        if (!projectId) return null;
        try {
            const [{ data: proj }, kpis] = await Promise.all([
                supabase.from('projects').select('id, name, budget, settings').eq('id', projectId).maybeSingle(),
                opuraAnalyticsService.obraKpis(orgId, projectId),
            ]);
            if (!proj) return null;
            const p = proj as { id: string; name: string; budget: unknown; settings: { bdi?: number; diaryEntries?: unknown[] } | null };
            const budget = Array.isArray(p.budget) ? p.budget : [];
            const diary = Array.isArray(p.settings?.diaryEntries) ? p.settings!.diaryEntries : [];
            let avanco: number | null = null;
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                avanco = budget.length ? calculateProjectProgress(budget as any, diary as any) : null;
            } catch {
                avanco = null;
            }
            return {
                projectId: p.id,
                projectName: p.name,
                orcado: orcadoDoOrcamento(budget as Parameters<typeof orcadoDoOrcamento>[0], p.settings?.bdi),
                contratadoCusto: kpis?.contratado_custo ?? 0,
                pago: kpis?.pago ?? 0,
                aPagar: kpis?.a_pagar ?? 0,
                vencidoPagar: kpis?.vencido_pagar ?? 0,
                avancoFisicoPct: avanco,
            };
        } catch (e) {
            console.warn('[creditRoomService] obra indisponível no snapshot:', e);
            return null;
        }
    },

    async coletarUnidades(empreendimentoId?: string) {
        if (!empreendimentoId) return null;
        try {
            const units = await empreendimentoService.listAllUnitsForEmpreendimento(empreendimentoId);
            return units.map(u => ({ status: u.status, price: u.price ?? null }));
        } catch (e) {
            console.warn('[creditRoomService] unidades indisponíveis no snapshot:', e);
            return null;
        }
    },

    async coletarEmpreendimento(empreendimentoId?: string) {
        if (!empreendimentoId) return null;
        try {
            const e = await empreendimentoService.getById(empreendimentoId);
            if (!e) return null;
            return {
                id: e.id,
                name: e.name,
                tipo: e.tipo ?? null,
                spe_razao_social: e.spe_razao_social ?? null,
                spe_cnpj: e.spe_cnpj ?? null,
                endereco_city: e.endereco_city ?? null,
                endereco_state: e.endereco_state ?? null,
                terreno_area: e.terreno_area ?? null,
                vgv_total: e.vgv_total ?? null,
            };
        } catch (e) {
            console.warn('[creditRoomService] empreendimento indisponível no snapshot:', e);
            return null;
        }
    },

    /**
     * Recebíveis de venda para o aging (PRD §25).
     *
     * ⚠️ **A fonte é `vw_receivables`, não `deal_installments`.** A tabela
     * `deal_installments` existe no repositório (migration 20270849000000) mas
     * **nunca foi aplicada no banco** — medido em 07/09: `42P01, relation does
     * not exist`. Quem sustenta Contas a Receber é a view sobre
     * `internal_transactions`, com 362 linhas.
     *
     * ⚠️ **O escopo é a ORGANIZAÇÃO, e é assim de propósito.** `vw_receivables`
     * tem `project_id`, mas só **1 das 362 linhas** o traz preenchido. Filtrar
     * pela obra do room mostraria "R$ 0,00 a receber" para uma carteira real de
     * 344 parcelas em aberto — um zero que o banco leria como ausência de
     * recebíveis, quando é ausência de vínculo no cadastro. Enquanto o
     * `project_id` não for preenchido na origem, o único número verdadeiro é o
     * da organização, e o snapshot diz isso na cara (`escopo`).
     *
     * `effective_status`: 'PREVISTO' | 'VENCIDO' | 'RECEBIDO'. O aging só olha
     * o que não foi recebido; 'RECEBIDO' vira o total à parte (R6 do PRD:
     * receita realizada nunca se mistura com a projetada).
     */
    async coletarRecebiveis(orgId: string) {
        try {
            const { data, error } = await supabase
                .from('vw_receivables')
                .select('due_date, amount, effective_status')
                .eq('organization_id', orgId);
            if (error) throw error;
            return {
                escopo: 'ORGANIZACAO' as const,
                parcelas: ((data ?? []) as Row[])
                    .filter(r => !!r.due_date)
                    .map(r => ({
                        dueDate: String(r.due_date),
                        amount: num(r.amount),
                        // O builder entende 'RECEBIDA'/'CANCELADA'; a view fala
                        // 'RECEBIDO'/'PREVISTO'/'VENCIDO'. Traduz aqui, uma vez.
                        settlementStatus: String(r.effective_status) === 'RECEBIDO' ? 'RECEBIDA' : 'LANCADA',
                    })),
            };
        } catch (e) {
            console.warn('[creditRoomService] recebíveis indisponíveis no snapshot:', e);
            return null;
        }
    },

    /** NOI dos 12 meses até a data-base — `null` sem apropriação de despesa. */
    async coletarPortfolio(orgId: string, dataBase: string) {
        try {
            const from = addMonths(dataBase, -12);
            const m = await rentalNoiService.getNoiMetrics(orgId, from, dataBase);
            if (!m) return null;
            return {
                janelaMeses: m.monthsInWindow,
                receita: m.revenue,
                despesa: m.expense,
                noi: m.noi,
                margem: m.margin,
                capRate: m.capRate,
            };
        } catch (e) {
            console.warn('[creditRoomService] portfólio indisponível no snapshot:', e);
            return null;
        }
    },

    /** Serviço dos 12 primeiros meses do cronograma da proposta vinculada. */
    async coletarNovoServico(debtContractId?: string): Promise<number | null> {
        if (!debtContractId) return null;
        try {
            const schedule =
                (await debtService.getActiveSchedule(debtContractId, 'VIGENTE'))
                ?? (await debtService.getActiveSchedule(debtContractId, 'CONTRATUAL'));
            if (!schedule) return null;
            const parcelas = await debtService.listInstallments(schedule.id);
            return servicoPrimeirosMeses(parcelas.map(p => ({ total: p.total })));
        } catch (e) {
            console.warn('[creditRoomService] cronograma da proposta indisponível:', e);
            return null;
        }
    },

    // ── Data Room (GED) ───────────────────────────────────────────────────

    async listDocuments(creditRoomId: string): Promise<CreditRoomDocument[]> {
        const { data, error } = await supabase.rpc('fn_credit_room_documents', { p_room: creditRoomId });
        if (error) throw error;
        return ((data ?? []) as Row[]).map(mapDocument);
    },

    async shareDocuments(room: CreditRoom, documentIds: string[]): Promise<void> {
        const sharedBy = await actorEmail();
        await documentService.sharePortalDocumentsBatch(documentIds, { audience: 'credor', creditRoomId: room.id }, sharedBy);
        await this.log(room, 'SHARE', 'document', documentIds.join(','), { count: documentIds.length });
    },

    async unshareDocument(room: CreditRoom, shareId: string, documentId: string): Promise<void> {
        await documentService.unsharePortalDocument(shareId);
        await this.log(room, 'UNSHARE', 'document', documentId);
    },

    /**
     * Link assinado de 15 min para o credor. Passa pela Edge Function
     * `credit-room-download`, que valida o JWT, o vínculo e grava o log com IP.
     * O lado interno (membro da org) pode assinar direto pelo storage — mas
     * usa o mesmo caminho para a trilha ser uma só.
     */
    async getDownloadUrl(creditRoomId: string, storagePath: string): Promise<string> {
        const { data, error } = await supabase.functions.invoke('credit-room-download', {
            body: { creditRoomId, storagePath },
        });
        if (error) throw error;
        const url = (data as { signedUrl?: string } | null)?.signedUrl;
        if (!url) throw new Error((data as { error?: string } | null)?.error || 'Não foi possível gerar o link do documento.');
        return url;
    },

    // ── Participantes ─────────────────────────────────────────────────────

    async listMembers(creditRoomId: string): Promise<CreditRoomMember[]> {
        const { data, error } = await supabase
            .from('credit_room_members')
            .select(MEMBER_COLS)
            .eq('credit_room_id', creditRoomId)
            .order('invited_at');
        if (error) throw error;
        return (data ?? []).map(r => mapMember(r as Row));
    },

    async invite(room: CreditRoom, input: CreditRoomMemberInput): Promise<CreditRoomMember> {
        const invited_by = await actorEmail();
        const email = input.email.trim().toLowerCase();
        const { data, error } = await supabase
            .from('credit_room_members')
            .insert({
                organization_id: room.organizationId,
                credit_room_id: room.id,
                email,
                name: input.name ?? null,
                institution: input.institution ?? null,
                side: input.side,
                permissions: { ...PERMISSOES_PADRAO, ...(input.permissions ?? {}) },
                invited_by,
                expires_at: input.expiresAt ?? null,
            })
            .select(MEMBER_COLS)
            .single();
        if (error) {
            if (error.code === '23505') throw new Error('Este e-mail já foi convidado para este Credit Room.');
            throw error;
        }
        await this.log(room, 'INVITE', 'member', String((data as Row).id), { email, side: input.side });
        return mapMember(data as Row);
    },

    async updateMember(memberId: string, patch: Partial<Pick<CreditRoomMemberInput, 'name' | 'institution' | 'permissions' | 'expiresAt'>>): Promise<CreditRoomMember> {
        const row: Row = {};
        if (patch.name !== undefined) row.name = patch.name;
        if (patch.institution !== undefined) row.institution = patch.institution;
        if (patch.permissions !== undefined) row.permissions = { ...PERMISSOES_PADRAO, ...patch.permissions };
        if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt || null;
        const { data, error } = await supabase
            .from('credit_room_members')
            .update(row)
            .eq('id', memberId)
            .select(MEMBER_COLS)
            .single();
        if (error) throw error;
        return mapMember(data as Row);
    },

    async revoke(room: CreditRoom, member: CreditRoomMember): Promise<CreditRoomMember> {
        const revoked_by = await actorEmail();
        const { data, error } = await supabase
            .from('credit_room_members')
            .update({ revoked_at: new Date().toISOString(), revoked_by })
            .eq('id', member.id)
            .select(MEMBER_COLS)
            .single();
        if (error) throw error;
        await this.log(room, 'REVOKE', 'member', member.id, { email: member.email });
        return mapMember(data as Row);
    },

    /** Reativa um convite revogado (a linha é a mesma — o histórico fica). */
    async reinstate(room: CreditRoom, member: CreditRoomMember): Promise<CreditRoomMember> {
        const { data, error } = await supabase
            .from('credit_room_members')
            .update({ revoked_at: null, revoked_by: null })
            .eq('id', member.id)
            .select(MEMBER_COLS)
            .single();
        if (error) throw error;
        await this.log(room, 'INVITE', 'member', member.id, { email: member.email, reativado: true });
        return mapMember(data as Row);
    },

    // ── Lado do credor ────────────────────────────────────────────────────

    async myMemberships(): Promise<MyCreditRoomMembership[]> {
        const { data, error } = await supabase.rpc('fn_my_credit_rooms');
        if (error) throw error;
        return ((data ?? []) as Row[]).map(r => ({
            creditRoomId: String(r.credit_room_id),
            side: String(r.side) as CreditRoomSide,
            permissions: { ...PERMISSOES_PADRAO, ...((r.permissions ?? {}) as Partial<CreditRoomMember['permissions']>) },
            expiresAt: str(r.expires_at),
        }));
    },

    /** Rooms em que o usuário logado é participante ativo (a RLS já recorta). */
    async myRooms(): Promise<{ room: CreditRoom; membership: MyCreditRoomMembership }[]> {
        const memberships = await this.myMemberships();
        if (!memberships.length) return [];
        const { data, error } = await supabase
            .from('credit_rooms')
            .select(ROOM_COLS)
            .in('id', memberships.map(m => m.creditRoomId));
        if (error) throw error;
        const byId = new Map(memberships.map(m => [m.creditRoomId, m]));
        return (data ?? [])
            .map(r => mapRoom(r as Row))
            .map(room => ({ room, membership: byId.get(room.id)! }))
            .filter(x => !!x.membership);
    },

    /**
     * Primeiro acesso: liga user_id ao convite e marca last_access_at.
     *
     * `side` não é opcional por capricho: sem ele o LOGIN — o evento que a
     * auditoria mais consulta — nasce com `actor_side` nulo e a coluna "Lado"
     * fica vazia justamente na linha "fulano acessou". Visto na trilha real em
     * 07/09.
     */
    async touch(room: CreditRoom, side?: CreditRoomSide): Promise<boolean> {
        const { data, error } = await supabase.rpc('fn_credit_room_touch_member', { p_room: room.id });
        if (error) throw error;
        await this.log(room, 'LOGIN', 'room', room.id, {}, side);
        return !!data;
    },

    // ── Solicitações (request list) ───────────────────────────────────────

    async listRequests(creditRoomId: string): Promise<CreditRoomRequest[]> {
        const { data, error } = await supabase
            .from('credit_room_requests')
            .select(REQUEST_COLS)
            .eq('credit_room_id', creditRoomId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(r => mapRequest(r as Row));
    },

    async createRequest(room: CreditRoom, input: CreditRoomRequestInput): Promise<CreditRoomRequest> {
        const created_by = await actorEmail();
        const { data, error } = await supabase
            .from('credit_room_requests')
            .insert({
                organization_id: room.organizationId,
                credit_room_id: room.id,
                title: input.title,
                description: input.description ?? null,
                from_side: input.fromSide,
                assignee_email: input.assigneeEmail?.toLowerCase() ?? null,
                due_at: input.dueAt ?? null,
                priority: input.priority ?? 'MEDIA',
                answer_document_id: input.answerDocumentId ?? null,
                created_by,
            })
            .select(REQUEST_COLS)
            .single();
        if (error) throw error;
        await this.log(room, 'REQUEST', 'request', String((data as Row).id), { title: input.title, side: input.fromSide });
        return mapRequest(data as Row);
    },

    async updateRequest(
        requestId: string,
        patch: Partial<CreditRoomRequestInput> & { status?: CreditRoomRequestStatus },
    ): Promise<CreditRoomRequest> {
        const row: Row = {};
        if (patch.title !== undefined) row.title = patch.title;
        if (patch.description !== undefined) row.description = patch.description ?? null;
        if (patch.assigneeEmail !== undefined) row.assignee_email = patch.assigneeEmail?.toLowerCase() ?? null;
        if (patch.dueAt !== undefined) row.due_at = patch.dueAt || null;
        if (patch.priority !== undefined) row.priority = patch.priority;
        if (patch.answerDocumentId !== undefined) row.answer_document_id = patch.answerDocumentId ?? null;
        if (patch.status !== undefined) row.status = patch.status;
        const { data, error } = await supabase
            .from('credit_room_requests')
            .update(row)
            .eq('id', requestId)
            .select(REQUEST_COLS)
            .single();
        if (error) throw error;
        return mapRequest(data as Row);
    },

    async removeRequest(requestId: string): Promise<void> {
        const { error } = await supabase.from('credit_room_requests').delete().eq('id', requestId);
        if (error) throw error;
    },

    // ── Comentários ───────────────────────────────────────────────────────

    async listComments(creditRoomId: string, requestId?: string | null): Promise<CreditRoomComment[]> {
        let q = supabase
            .from('credit_room_comments')
            .select(COMMENT_COLS)
            .eq('credit_room_id', creditRoomId)
            .order('created_at');
        if (requestId === null) q = q.is('request_id', null);
        else if (requestId) q = q.eq('request_id', requestId);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []).map(r => mapComment(r as Row));
    },

    async addComment(
        room: CreditRoom,
        input: { body: string; visibility: CreditRoomCommentVisibility; side: CreditRoomSide; requestId?: string },
    ): Promise<CreditRoomComment> {
        const author_email = await actorEmail();
        const { data, error } = await supabase
            .from('credit_room_comments')
            .insert({
                organization_id: room.organizationId,
                credit_room_id: room.id,
                request_id: input.requestId ?? null,
                visibility: input.visibility,
                author_email,
                author_side: input.side,
                body: input.body,
            })
            .select(COMMENT_COLS)
            .single();
        if (error) throw error;
        await this.log(room, 'COMMENT', input.requestId ? 'request' : 'room', input.requestId ?? room.id, { visibility: input.visibility });
        return mapComment(data as Row);
    },

    async removeComment(commentId: string): Promise<void> {
        const { error } = await supabase.from('credit_room_comments').delete().eq('id', commentId);
        if (error) throw error;
    },

    // ── Covenants da operação (PRD §74–76) ────────────────────────────────

    async listCovenants(room: CreditRoom): Promise<DebtCovenant[]> {
        return debtCovenantService.list(room.organizationId, undefined, room.id);
    },

    async saveCovenant(room: CreditRoom, input: DebtCovenantInput): Promise<DebtCovenant> {
        return debtCovenantService.save(room.organizationId, { ...input, creditRoomId: room.id });
    },

    async removeCovenant(id: string): Promise<void> {
        return debtCovenantService.remove(id);
    },

    /**
     * Apura o covenant da operação (R8) — e a diferença em relação ao covenant
     * de contrato é o ponto inteiro.
     *
     * `fn_debt_covenant_evaluate` calcula o DSCR como `EBITDA 12m ÷ serviço
     * 12m` da EMPRESA. Numa operação de crédito isso não serve: o banco
     * negociou *quais* fluxos contam (`eligible_flows`), e é sobre eles que a
     * cláusula foi escrita. Esse número já existe pronto e conferido em
     * `indicators.dscr_pos` da versão congelada — o mesmo que o banco viu na
     * Visão. Recalculá-lo por outro caminho abriria a porta para dois DSCR
     * divergentes na mesma tela.
     *
     * Os demais tipos (dívida/EBITDA, endividamento, liquidez…) continuam indo
     * para o SQL: são da empresa, não da operação.
     */
    async evaluateCovenant(
        covenant: DebtCovenant,
        versaoAtiva: CreditRoomVersion | null,
        refDate: string,
        caixa?: number | null,
    ): Promise<AvaliacaoCovenant & { origem: 'SNAPSHOT' | 'RAZAO' }> {
        if (covenant.kind === 'DSCR') {
            const dscr = versaoAtiva?.indicators?.dscr_pos ?? versaoAtiva?.indicators?.dscr_atual ?? null;
            return {
                ...avaliarCovenant(dscr, covenant.threshold, covenant.comparator, covenant.warningMarginPct),
                origem: 'SNAPSHOT',
            };
        }
        const r = await debtCovenantService.evaluate(covenant.id, refDate, caixa);
        return {
            apurado: r.apurado ?? null,
            margemPct: r.margemPct ?? null,
            situacao: r.situacao === 'REGULAR' || r.situacao === 'ATENCAO' || r.situacao === 'VIOLADO'
                ? r.situacao : 'NAO_APURADO',
            origem: 'RAZAO',
        };
    },

    // ── Desembolsos (PRD §68–71) ──────────────────────────────────────────

    async listDisbursements(room: CreditRoom): Promise<CreditRoomDisbursement[]> {
        const { data, error } = await supabase
            .from('debt_disbursements')
            .select(DISBURSEMENT_COLS)
            .eq('credit_room_id', room.id)
            .order('seq', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(r => mapDisbursement(r as Row));
    },

    /**
     * Cria a SOLICITAÇÃO (§68). Nasce em `SOLICITADO`, sem data e sem valor
     * bruto — é a trava condicional da migration ...000005 que permite isso, e
     * é ela que impede a linha de chegar a LIBERADO pela metade.
     */
    async createDisbursement(
        room: CreditRoom,
        input: { requestedAmount: number; purpose?: string; measurementRef?: string; notes?: string },
    ): Promise<CreditRoomDisbursement> {
        if (!room.debtContractId) {
            throw new Error('Vincule um contrato de dívida à operação antes de solicitar desembolso — a liberação é dele.');
        }
        const { data, error } = await supabase
            .from('debt_disbursements')
            .insert({
                organization_id: room.organizationId,
                debt_contract_id: room.debtContractId,
                credit_room_id: room.id,
                status: 'SOLICITADO',
                requested_amount: input.requestedAmount,
                gross_amount: 0,
                purpose: input.purpose ?? null,
                measurement_ref: input.measurementRef ?? null,
                notes: input.notes ?? null,
            })
            .select(DISBURSEMENT_COLS)
            .single();
        if (error) throw error;
        const criado = mapDisbursement(data as Row);
        await this.log(room, 'REQUEST', 'disbursement', criado.id, { seq: criado.seq, valor: input.requestedAmount });
        return criado;
    },

    /**
     * Move o desembolso no fluxo do §69. Chegar em LIBERADO exige data e valor
     * — o banco recusa com 23514 se faltarem, e a mensagem crua não ajudaria
     * ninguém, então é traduzida aqui.
     */
    async moveDisbursement(
        room: CreditRoom,
        id: string,
        patch: Partial<{
            status: CreditRoomDisbursementStatus;
            approvedAmount: number | null;
            grossAmount: number;
            disbursedAt: string | null;
            physicalPct: number | null;
            analysisNotes: string;
            measurementRef: string;
            purpose: string;
            notes: string;
        }>,
        side?: CreditRoomSide,
    ): Promise<CreditRoomDisbursement> {
        const row: Row = {};
        if (patch.status !== undefined) row.status = patch.status;
        if (patch.approvedAmount !== undefined) row.approved_amount = patch.approvedAmount;
        if (patch.grossAmount !== undefined) row.gross_amount = patch.grossAmount;
        if (patch.disbursedAt !== undefined) row.disbursed_at = patch.disbursedAt || null;
        if (patch.physicalPct !== undefined) row.physical_pct = patch.physicalPct;
        if (patch.analysisNotes !== undefined) row.analysis_notes = patch.analysisNotes;
        if (patch.measurementRef !== undefined) row.measurement_ref = patch.measurementRef;
        if (patch.purpose !== undefined) row.purpose = patch.purpose;
        if (patch.notes !== undefined) row.notes = patch.notes;
        if (patch.status === 'APROVADO' || patch.status === 'RECUSADO') {
            row.decided_at = new Date().toISOString();
            row.decided_by = await actorEmail();
        }

        const { data, error } = await supabase
            .from('debt_disbursements')
            .update(row)
            .eq('id', id)
            .select(DISBURSEMENT_COLS)
            .single();
        if (error) {
            if (error.code === '23514') {
                throw new Error('Para marcar como liberado é preciso informar a data e o valor efetivamente liberado.');
            }
            throw error;
        }
        const atualizado = mapDisbursement(data as Row);
        await this.log(room, 'STATUS', 'disbursement', id, { status: patch.status ?? '(edição)' }, side);
        return atualizado;
    },

    // ── Auditoria ─────────────────────────────────────────────────────────

    /**
     * Grava uma linha na trilha. Nunca derruba a ação que a originou — um
     * log que falha vira console.warn, não erro na tela.
     */
    async log(
        room: Pick<CreditRoom, 'id' | 'organizationId'>,
        action: CreditRoomAccessAction,
        resourceType?: string,
        resourceId?: string,
        metadata: Record<string, unknown> = {},
        side?: CreditRoomSide,
    ): Promise<void> {
        try {
            const [actor_email, actor_user_id] = await Promise.all([actorEmail(), actorUserId()]);
            if (!actor_email) return;
            const { error } = await supabase.from('credit_room_access_log').insert({
                organization_id: room.organizationId,
                credit_room_id: room.id,
                actor_user_id: actor_user_id ?? null,
                actor_email,
                actor_side: side ?? null,
                action,
                resource_type: resourceType ?? null,
                resource_id: resourceId ?? null,
                metadata,
                user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            });
            if (error) console.warn('[creditRoomService] log não gravado:', error.message);
        } catch (e) {
            console.warn('[creditRoomService] log não gravado:', e);
        }
    },

    async listAccessLog(creditRoomId: string, limit = 200): Promise<CreditRoomAccessLog[]> {
        const { data, error } = await supabase
            .from('credit_room_access_log')
            .select(LOG_COLS)
            .eq('credit_room_id', creditRoomId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return (data ?? []).map(r => mapLog(r as Row));
    },
};
