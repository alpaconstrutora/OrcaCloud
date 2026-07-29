import { supabase } from '../lib/supabase';
import {
    EmpreendimentoAuditLog, EmpreendimentoAuditInput,
    EmpreendimentoAuditEntity, EmpreendimentoAuditAction, EmpreendimentoAuditSource,
} from '../types';

/**
 * Trilha de auditoria do Empreendimento (tabela `empreendimento_audit_logs`,
 * migration 20270839000000). Alimenta a aba Histórico.
 *
 * ⚠️ REGRA DE VOLUME — operação em LOTE grava UM evento resumo, com os contadores
 * em `metadata`; nunca uma linha por unidade. Uma sincronização com o Imovib mexe
 * em centenas de unidades: sem essa regra, o primeiro sync afoga a aba Histórico e
 * ela deixa de servir para qualquer coisa. Use `record` com `action: 'sync'` e
 * `metadata: { unitsCreated, unitsUpdated, ... }` — não `recordMany` por item.
 *
 * ⚠️ NUNCA gravar payload grande em `old_value`/`new_value` (budget, array de
 * unidades, settings inteiro). Só o campo que mudou.
 *
 * ⚠️ Auditoria NUNCA derruba a operação de negócio: toda escrita aqui engole o erro
 * com `console.warn`. Quem chama não precisa de try/catch (mesmo contrato de
 * `processService.logAction`).
 */

const AUDIT_TABLE = 'empreendimento_audit_logs';

const LOG_COLS =
    'id, organization_id, empreendimento_id, entity_type, entity_id, entity_label, ' +
    'action, field_name, old_value, new_value, metadata, reason, source, ' +
    'user_id, user_email, created_at';

/** Campos que nunca viram evento de update — ruído puro. */
const IGNORED_DIFF_FIELDS = new Set(['id', 'created_at', 'updated_at', 'last_synced_at']);

// ── Ator ─────────────────────────────────────────────────────────────────────
// Resolvido uma única vez por sessão de aba. É justamente por não fazer isso que
// `area_version_audit_logs.performed_by` vive NULL em produção: cada call site
// teria que passar o usuário, e nenhum passa.

type Actor = { user_id: string | null; user_email: string | null };

let actorCache: Actor | null = null;
let actorPromise: Promise<Actor> | null = null;

async function currentActor(): Promise<Actor> {
    if (actorCache) return actorCache;
    if (!actorPromise) {
        actorPromise = (async () => {
            try {
                const { data } = await supabase.auth.getUser();
                actorCache = { user_id: data.user?.id ?? null, user_email: data.user?.email ?? null };
            } catch {
                actorCache = { user_id: null, user_email: null };
            }
            return actorCache;
        })();
    }
    return actorPromise;
}

// ── Organização ──────────────────────────────────────────────────────────────
// Quem chama normalmente já tem a org em mãos. Quando não tem, buscamos — mas com
// cache por empreendimento, senão um lote de eventos vira um lote de round-trips.

const orgCache = new Map<string, string | null>();

async function resolveOrganizationId(
    empreendimentoId: string,
    provided?: string | null,
): Promise<string | null> {
    if (provided) return provided;
    if (orgCache.has(empreendimentoId)) return orgCache.get(empreendimentoId) ?? null;
    try {
        const { data } = await supabase
            .from('empreendimentos')
            .select('organization_id')
            .eq('id', empreendimentoId)
            .maybeSingle();
        const orgId = (data?.organization_id as string | undefined) ?? null;
        orgCache.set(empreendimentoId, orgId);
        return orgId;
    } catch {
        return null;
    }
}

async function toRow(input: EmpreendimentoAuditInput) {
    const [actor, organizationId] = await Promise.all([
        currentActor(),
        resolveOrganizationId(input.empreendimentoId, input.organizationId),
    ]);
    // Sem org não há como passar pelo WITH CHECK da RLS — o insert seria rejeitado.
    if (!organizationId) return null;
    return {
        organization_id: organizationId,
        empreendimento_id: input.empreendimentoId,
        entity_type: input.entityType,
        entity_id: input.entityId ?? null,
        entity_label: input.entityLabel ?? null,
        action: input.action,
        field_name: input.fieldName ?? null,
        old_value: input.oldValue ?? null,
        new_value: input.newValue ?? null,
        metadata: input.metadata ?? {},
        reason: input.reason ?? null,
        source: input.source ?? 'app',
        user_id: actor.user_id,
        user_email: actor.user_email,
    };
}

/** Normaliza para comparação de diff: `undefined`/`''` e `null` são a mesma ausência. */
const normalize = (v: unknown): unknown => (v === undefined || v === '' ? null : v);

const sameValue = (a: unknown, b: unknown): boolean => {
    const na = normalize(a);
    const nb = normalize(b);
    if (na === nb) return true;
    if (na === null || nb === null) return false;
    if (typeof na === 'object' || typeof nb === 'object') {
        try { return JSON.stringify(na) === JSON.stringify(nb); } catch { return false; }
    }
    return false;
};

export interface AuditDiffBase {
    empreendimentoId: string;
    organizationId?: string | null;
    entityType: EmpreendimentoAuditEntity;
    entityId?: string | null;
    entityLabel?: string | null;
    source?: EmpreendimentoAuditSource;
    reason?: string | null;
}

export interface AuditListOptions {
    entityType?: EmpreendimentoAuditEntity[];
    action?: EmpreendimentoAuditAction[];
    source?: EmpreendimentoAuditSource[];
    /** Busca textual em entity_label / field_name / user_email. */
    search?: string;
    /** ISO date (inclusive). */
    from?: string;
    /** ISO date (inclusive). */
    to?: string;
    limit?: number;
    offset?: number;
}

function applyFilters<T extends { in: any; or: any; gte: any; lte: any }>(query: T, opts?: AuditListOptions): T {
    let q = query;
    if (opts?.entityType?.length) q = q.in('entity_type', opts.entityType);
    if (opts?.action?.length) q = q.in('action', opts.action);
    if (opts?.source?.length) q = q.in('source', opts.source);
    if (opts?.from) q = q.gte('created_at', opts.from);
    if (opts?.to) q = q.lte('created_at', opts.to);
    if (opts?.search?.trim()) {
        const term = opts.search.trim().replace(/[%,()]/g, ' ');
        q = q.or(`entity_label.ilike.%${term}%,field_name.ilike.%${term}%,user_email.ilike.%${term}%`);
    }
    return q;
}

export const empreendimentoAuditService = {
    /** Registra um evento. Nunca lança. */
    async record(input: EmpreendimentoAuditInput): Promise<void> {
        try {
            const row = await toRow(input);
            if (!row) return;
            const { error } = await supabase.from(AUDIT_TABLE).insert(row);
            if (error) throw error;
        } catch (err) {
            console.warn('[empreendimentoAuditService] falha ao registrar evento:', err);
        }
    },

    /** Registra vários eventos num único insert. Nunca lança. */
    async recordMany(inputs: EmpreendimentoAuditInput[]): Promise<void> {
        if (!inputs.length) return;
        try {
            const rows = (await Promise.all(inputs.map(toRow))).filter(Boolean);
            if (!rows.length) return;
            const { error } = await supabase.from(AUDIT_TABLE).insert(rows);
            if (error) throw error;
        } catch (err) {
            console.warn('[empreendimentoAuditService] falha ao registrar eventos:', err);
        }
    },

    /**
     * Diff campo-a-campo → um evento 'update' por campo que realmente mudou.
     * Campos iguais, `id`/`created_at`/`updated_at`/`last_synced_at` são ignorados.
     * Quando `fields` é omitido, considera as chaves presentes em `after`.
     */
    async recordDiff(
        base: AuditDiffBase,
        before: Record<string, unknown> | null | undefined,
        after: Record<string, unknown> | null | undefined,
        fields?: string[],
    ): Promise<void> {
        if (!after) return;
        const keys = (fields ?? Object.keys(after)).filter(k => !IGNORED_DIFF_FIELDS.has(k));
        const inputs: EmpreendimentoAuditInput[] = [];
        for (const key of keys) {
            const oldValue = before?.[key];
            const newValue = after[key];
            if (sameValue(oldValue, newValue)) continue;
            inputs.push({
                empreendimentoId: base.empreendimentoId,
                organizationId: base.organizationId,
                entityType: base.entityType,
                entityId: base.entityId,
                entityLabel: base.entityLabel,
                action: 'update',
                fieldName: key,
                oldValue: normalize(oldValue),
                newValue: normalize(newValue),
                source: base.source,
                reason: base.reason,
            });
        }
        await this.recordMany(inputs);
    },

    /** Eventos do empreendimento, mais recentes primeiro. */
    async list(empreendimentoId: string, opts?: AuditListOptions): Promise<EmpreendimentoAuditLog[]> {
        const limit = opts?.limit ?? 50;
        const offset = opts?.offset ?? 0;
        let query = supabase
            .from(AUDIT_TABLE)
            .select(LOG_COLS)
            .eq('empreendimento_id', empreendimentoId);
        query = applyFilters(query as any, opts) as any;
        const { data, error } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (error) throw new Error(`Failed to fetch audit logs: ${error.message}`);
        return (data || []) as unknown as EmpreendimentoAuditLog[];
    },

    /** Contagem para os KPIs da aba (sem trazer as linhas). */
    async count(empreendimentoId: string, opts?: AuditListOptions): Promise<number> {
        let query = supabase
            .from(AUDIT_TABLE)
            .select('id', { count: 'exact', head: true })
            .eq('empreendimento_id', empreendimentoId);
        query = applyFilters(query as any, opts) as any;
        const { count, error } = await query;
        if (error) throw new Error(`Failed to count audit logs: ${error.message}`);
        return count ?? 0;
    },
};
