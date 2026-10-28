// services/empreendimentoProposalService.ts
//
// Inbox de Curadoria — o serviço das propostas de mudança por campo. Quando um sync da
// Viabilidade/Planta encontra um CONFLITO (campo divergente dos dois lados), em vez de
// sobrescrever o Empreendimento ele materializa uma proposta aqui; o usuário aprova ou rejeita
// campo a campo. Criação e preenchimento de vazio continuam aplicando direto (não passam por
// aqui) — só o conflito exige decisão.

import { supabase } from '../lib/supabase';
import { proposalHash } from './sync/hash';
import { FieldChange, SyncOrigin, SyncEntity } from './sync/types';
import { empreendimentoAuditService } from './empreendimentoAuditService';

export type ProposalStatus = 'pending' | 'applied' | 'rejected' | 'superseded';

export interface FieldProposal {
    id: string;
    organization_id: string;
    empreendimento_id: string;
    origin: SyncOrigin;
    entity: SyncEntity;
    entity_id: string;
    field: string;
    field_group: 'identidade' | 'estrutura' | 'area' | 'comercial';
    label: string;
    current_value: unknown;
    proposed_value: unknown;
    applied_value: unknown;
    source_ref: Record<string, string> | null;
    proposal_hash: string;
    status: ProposalStatus;
    detected_at: string;
    decided_at: string | null;
    decided_by: string | null;
    decision_reason: string | null;
    // Resolvidos no cliente por resolveNames (pendentes e decididas):
    tower_name?: string | null;
    unit_name?: string | null;
}

export interface ApplyOutcome {
    applied: string[];
    /** O destino mudou desde que a proposta nasceu — não sobrescreve, marca superseded. */
    superseded: { id: string; field: string }[];
    failed: { id: string; error: string }[];
}

/** Os conflitos de um plano separados pelo que a Curadoria já sabe deles. */
export interface ConflitosClassificados {
    /** Sem proposta, ou com proposta aplicada/obsoleta (voltou a divergir): ainda a decidir. */
    novos: FieldChange[];
    /** Já na Curadoria, aguardando decisão. */
    pendentes: FieldChange[];
    /** Rejeitados na Curadoria: o valor do empreendimento fica, por decisão do usuário. */
    rejeitados: FieldChange[];
}

const COLS = 'id, organization_id, empreendimento_id, origin, entity, entity_id, field, field_group, label, current_value, proposed_value, applied_value, source_ref, proposal_hash, status, detected_at, decided_at, decided_by, decision_reason';

/** A mesma identidade do UNIQUE da tabela (empreendimento_id, origin, entity, entity_id, field, proposal_hash). */
const hashDe = (empreendimentoId: string, c: FieldChange) => proposalHash({
    empreendimentoId, origin: c.origin, entity: c.entity,
    entityId: c.entityId, field: c.field, proposedValue: c.to,
});
const chave = (r: { origin: string; entity: string; entity_id: string; field: string; proposal_hash: string }) =>
    `${r.origin}|${r.entity}|${r.entity_id}|${r.field}|${r.proposal_hash}`;

type LinhaExistente = { id: string; origin: string; entity: string; entity_id: string; field: string; proposal_hash: string; status: ProposalStatus };

/** Propostas já gravadas para estes conflitos, por identidade. */
async function existentes(empreendimentoId: string, conflicts: FieldChange[]): Promise<Map<string, LinhaExistente>> {
    const hashes = [...new Set(conflicts.map(c => hashDe(empreendimentoId, c)))];
    const out = new Map<string, LinhaExistente>();
    if (hashes.length === 0) return out;
    const { data, error } = await supabase
        .from('empreendimento_field_proposals')
        .select('id, origin, entity, entity_id, field, proposal_hash, status')
        .eq('empreendimento_id', empreendimentoId)
        .in('proposal_hash', hashes);
    if (error) throw error;
    for (const r of (data ?? []) as LinhaExistente[]) out.set(chave(r), r);
    return out;
}

/** Destinos escritos. O empreendimento entrou em 22/10/2026 com o terreno medido na Planta. */
const TABLE_BY_ENTITY: Partial<Record<SyncEntity, string>> = {
    empreendimento: 'empreendimentos',
    tower: 'empreendimento_towers',
    unit: 'empreendimento_units',
};

export const empreendimentoProposalService = {
    /**
     * Separa os conflitos de um plano pelo que a Curadoria já sabe deles. Só leitura — o ensaio
     * da aba Sincronização usa isto para não contar como "a trazer" o que já está esperando
     * decisão (ou foi rejeitado), que era o que deixava a contagem presa para sempre.
     * Sem a tabela (migration não aplicada) ou com erro de leitura, tudo conta como novo:
     * o ensaio não pode cair por causa da Curadoria.
     */
    async classificarConflitos(empreendimentoId: string, conflicts: FieldChange[]): Promise<ConflitosClassificados> {
        const out: ConflitosClassificados = { novos: [], pendentes: [], rejeitados: [] };
        if (conflicts.length === 0) return out;
        let porChave: Map<string, LinhaExistente>;
        try {
            porChave = await existentes(empreendimentoId, conflicts);
        } catch (err) {
            console.warn('[empreendimentoProposalService] Curadoria indisponível no ensaio:', err);
            return { ...out, novos: [...conflicts] };
        }
        for (const c of conflicts) {
            const r = porChave.get(chave({ origin: c.origin, entity: c.entity, entity_id: c.entityId, field: c.field, proposal_hash: hashDe(empreendimentoId, c) }));
            if (r?.status === 'pending') out.pendentes.push(c);
            else if (r?.status === 'rejected') out.rejeitados.push(c);
            else out.novos.push(c);
        }
        return out;
    },

    /**
     * Materializa os conflitos de um sync como propostas pendentes. INSERT ... ON CONFLICT DO
     * NOTHING pela identidade: origem inalterada não recria (um 'rejected' segue rejeitado);
     * origem que mudou nasce como linha nova. Roda SÓ no apply do sync, nunca no preview —
     * senão abrir a tela viraria escrita.
     *
     * Proposta 'applied' ou 'superseded' com a MESMA identidade é reaberta como pendente: se o
     * conflito está de volta, o empreendimento voltou a divergir depois daquela decisão. Sem isto
     * o ON CONFLICT DO NOTHING a ignorava e o conflito nunca mais chegava à Curadoria. A decisão
     * antiga continua registrada no Histórico (empreendimento_audit_logs).
     */
    async materializeConflicts(
        empreendimentoId: string,
        organizationId: string,
        conflicts: FieldChange[],
    ): Promise<number> {
        if (conflicts.length === 0) return 0;

        let reabertas = 0;
        try {
            const porChave = await existentes(empreendimentoId, conflicts);
            for (const c of conflicts) {
                const r = porChave.get(chave({ origin: c.origin, entity: c.entity, entity_id: c.entityId, field: c.field, proposal_hash: hashDe(empreendimentoId, c) }));
                if (r?.status !== 'applied' && r?.status !== 'superseded') continue;
                const { error } = await supabase
                    .from('empreendimento_field_proposals')
                    .update({
                        status: 'pending', current_value: c.from ?? null, applied_value: null,
                        label: c.label, source_ref: c.sourceRef,
                        detected_at: new Date().toISOString(), decided_at: null, decided_by: null, decision_reason: null,
                    })
                    .eq('id', r.id)
                    .eq('status', r.status);
                if (error) throw new Error(`Falha ao reabrir proposta de curadoria: ${error.message}`);
                reabertas++;
            }
        } catch (err: any) {
            if (err?.code === '42P01' || err?.code === 'PGRST205' || /schema cache|does not exist/i.test(err?.message ?? '')) {
                throw new Error('Curadoria indisponível: aplique a migration 20270218000000_empreendimento_field_proposals no banco antes de sincronizar.');
            }
            throw err instanceof Error ? err : new Error(String(err?.message ?? err));
        }

        const rows = conflicts.map(c => ({
            organization_id: organizationId,
            empreendimento_id: empreendimentoId,
            origin: c.origin,
            entity: c.entity,
            entity_id: c.entityId,
            field: c.field,
            field_group: c.group,
            label: c.label,
            current_value: c.from ?? null,
            proposed_value: c.to ?? null,
            source_ref: c.sourceRef,
            proposal_hash: hashDe(empreendimentoId, c),
            status: 'pending' as ProposalStatus,
        }));

        // ignoreDuplicates: não sobrescreve a linha existente (preserva um 'rejected' anterior).
        const { data, error } = await supabase
            .from('empreendimento_field_proposals')
            .upsert(rows, { onConflict: 'empreendimento_id,origin,entity,entity_id,field,proposal_hash', ignoreDuplicates: true })
            .select('id');
        if (error) {
            // Tabela ausente = migration 20270218000000 não aplicada. Falha com instrução clara
            // em vez de deixar o conflito desaparecer (o applier já não o escreve no destino).
            if (error.code === '42P01' || error.code === 'PGRST205' || /schema cache|does not exist/i.test(error.message)) {
                throw new Error('Curadoria indisponível: aplique a migration 20270218000000_empreendimento_field_proposals no banco antes de sincronizar.');
            }
            throw new Error(`Falha ao registrar propostas de curadoria: ${error.message}`);
        }
        return (data?.length ?? 0) + reabertas;
    },

    /** Propostas pendentes. Os nomes de torre/unidade são resolvidos no cliente (não há view —
     *  ela adicionaria contenção de lock na migration; ver o topo do 20270218000000). */
    async listPending(empreendimentoId: string): Promise<FieldProposal[]> {
        const { data, error } = await supabase
            .from('empreendimento_field_proposals')
            .select(COLS)
            .eq('empreendimento_id', empreendimentoId)
            .eq('status', 'pending')
            .order('detected_at', { ascending: false });
        if (error) {
            if (error.code === '42P01' || error.code === 'PGRST205' || /schema cache|does not exist/i.test(error.message)) {
                throw new Error('Curadoria indisponível: aplique a migration 20270218000000_empreendimento_field_proposals no banco.');
            }
            throw new Error(`Falha ao listar propostas: ${error.message}`);
        }
        return resolveNames((data ?? []) as FieldProposal[]);
    },

    /** Propostas já decididas com UM status (applied/rejected/superseded) — o "Arquivados".
     *  O status vai na consulta, não num filtro no cliente: com o limite de 200 aplicado sobre
     *  todos os decididos, uma aba (ex.: Rejeitadas) perdia as linhas mais antigas em silêncio. */
    async listDecided(empreendimentoId: string, status: Exclude<ProposalStatus, 'pending'>): Promise<FieldProposal[]> {
        const { data, error } = await supabase
            .from('empreendimento_field_proposals')
            .select(COLS)
            .eq('empreendimento_id', empreendimentoId)
            .eq('status', status)
            .order('decided_at', { ascending: false })
            .limit(200);
        if (error) throw new Error(`Falha ao listar histórico: ${error.message}`);
        // Mesmos nomes de torre/unidade da inbox — sem eles o histórico dizia só
        // "Dormitórios: 2 → 3", sem dizer de qual unidade.
        return resolveNames((data ?? []) as FieldProposal[]);
    },

    /** Quantas propostas o empreendimento já teve, em qualquer situação — o bloco Curadoria só aparece com alguma. */
    async countAll(empreendimentoId: string): Promise<number> {
        const { count, error } = await supabase
            .from('empreendimento_field_proposals')
            .select('id', { count: 'exact', head: true })
            .eq('empreendimento_id', empreendimentoId);
        if (error) throw new Error(`Falha ao contar propostas: ${error.message}`);
        return count ?? 0;
    },

    async countPending(empreendimentoId: string): Promise<number> {
        const { count, error } = await supabase
            .from('empreendimento_field_proposals')
            .select('id', { count: 'exact', head: true })
            .eq('empreendimento_id', empreendimentoId)
            .eq('status', 'pending');
        if (error) throw new Error(`Falha ao contar propostas: ${error.message}`);
        return count ?? 0;
    },

    /** Rejeita: carimba a decisão e mantém os valores (nada é apagado — padrão dead letter). */
    async reject(ids: string[], reason?: string): Promise<number> {
        if (ids.length === 0) return 0;
        const { data, error } = await supabase
            .from('empreendimento_field_proposals')
            .update({ status: 'rejected', decided_at: new Date().toISOString(), decision_reason: reason ?? null })
            .in('id', ids)
            .eq('status', 'pending')     // só decide o que ainda está pendente
            .select(COLS);
        if (error) throw new Error(`Falha ao rejeitar propostas: ${error.message}`);

        // Histórico: uma decisão de curadoria é um evento por campo (aba Histórico).
        await empreendimentoAuditService.recordMany(
            ((data ?? []) as FieldProposal[]).map(p => ({
                empreendimentoId: p.empreendimento_id,
                organizationId: p.organization_id,
                entityType: 'proposal' as const,
                entityId: p.entity_id,
                entityLabel: p.label ?? p.field,
                action: 'reject' as const,
                fieldName: p.field,
                oldValue: p.current_value,
                newValue: p.proposed_value,
                reason: reason ?? null,
                source: 'curadoria' as const,
                metadata: { entidade: p.entity, origem: p.origin },
            })),
        );

        return data?.length ?? 0;
    },

    /**
     * Aprova: escreve o proposed_value no destino — mas antes relê o valor ATUAL do destino e o
     * compara com o current_value gravado. Se o destino mudou desde a detecção (alguém editou à
     * mão entre revisar e aplicar), NÃO sobrescreve: marca 'superseded'. É o guard de TOCTOU,
     * sem depender de um 2º hash.
     */
    async approve(ids: string[]): Promise<ApplyOutcome> {
        const outcome: ApplyOutcome = { applied: [], superseded: [], failed: [] };
        if (ids.length === 0) return outcome;

        const { data: proposals, error } = await supabase
            .from('empreendimento_field_proposals')
            .select(COLS)
            .in('id', ids)
            .eq('status', 'pending');
        if (error) throw new Error(`Falha ao carregar propostas: ${error.message}`);

        for (const p of (proposals ?? []) as FieldProposal[]) {
            const table = TABLE_BY_ENTITY[p.entity];
            if (!table) { outcome.failed.push({ id: p.id, error: `Entidade não suportada: ${p.entity}` }); continue; }

            try {
                // 1. Relê o valor atual do destino.
                const { data: row, error: readErr } = await supabase
                    .from(table).select(p.field).eq('id', p.entity_id).maybeSingle();
                if (readErr) throw new Error(readErr.message);
                if (!row) { outcome.failed.push({ id: p.id, error: 'Destino não encontrado.' }); continue; }

                // 2. Mudou desde a detecção? → superseded, não sobrescreve.
                const currentNow = (row as unknown as Record<string, unknown>)[p.field];
                if (!sameValue(currentNow, p.current_value)) {
                    await supabase.from('empreendimento_field_proposals')
                        .update({ status: 'superseded', decided_at: new Date().toISOString() })
                        .eq('id', p.id).eq('status', 'pending');
                    outcome.superseded.push({ id: p.id, field: p.field });
                    continue;
                }

                // 3. Aplica no destino e carimba a proposta.
                const { error: upErr } = await supabase.from(table).update({ [p.field]: p.proposed_value }).eq('id', p.entity_id);
                if (upErr) throw new Error(upErr.message);
                await supabase.from('empreendimento_field_proposals')
                    .update({ status: 'applied', applied_value: p.proposed_value, decided_at: new Date().toISOString() })
                    .eq('id', p.id).eq('status', 'pending');
                outcome.applied.push(p.id);

                // Histórico: registra a mudança que a proposta efetivou no destino.
                await empreendimentoAuditService.record({
                    empreendimentoId: p.empreendimento_id,
                    organizationId: p.organization_id,
                    entityType: 'proposal',
                    entityId: p.entity_id,
                    entityLabel: p.label ?? p.field,
                    action: 'approve',
                    fieldName: p.field,
                    oldValue: p.current_value,
                    newValue: p.proposed_value,
                    source: 'curadoria',
                    metadata: { entidade: p.entity, origem: p.origin },
                });
            } catch (e: any) {
                outcome.failed.push({ id: p.id, error: e.message });
            }
        }
        return outcome;
    },
};

/**
 * Preenche tower_name/unit_name resolvendo torres e unidades pelos ids das propostas. Para uma
 * proposta de UNIDADE, resolve também o nome da torre dela (via unit.tower_id) — assim o
 * agrupamento por torre na inbox funciona de verdade (a view antiga não fazia esse salto).
 */
async function resolveNames(proposals: FieldProposal[]): Promise<FieldProposal[]> {
    if (proposals.length === 0) return proposals;

    const towerIds = new Set<string>();
    const unitIds = new Set<string>();
    for (const p of proposals) {
        if (p.entity === 'tower') towerIds.add(p.entity_id);
        if (p.entity === 'unit') unitIds.add(p.entity_id);
    }

    const unitRes = unitIds.size
        ? await supabase.from('empreendimento_units').select('id, name, tower_id').in('id', [...unitIds])
        : { data: [] as { id: string; name: string; tower_id: string }[] };
    const units = (unitRes.data ?? []) as { id: string; name: string; tower_id: string }[];
    for (const u of units) towerIds.add(u.tower_id);

    const towerRes = towerIds.size
        ? await supabase.from('empreendimento_towers').select('id, name').in('id', [...towerIds])
        : { data: [] as { id: string; name: string }[] };
    const towerName = new Map((towerRes.data ?? []).map((t: any) => [t.id, t.name as string]));
    const unitById = new Map(units.map(u => [u.id, u]));

    return proposals.map(p => {
        if (p.entity === 'tower') return { ...p, tower_name: towerName.get(p.entity_id) ?? null, unit_name: null };
        if (p.entity === 'unit') {
            const u = unitById.get(p.entity_id);
            return { ...p, tower_name: u ? (towerName.get(u.tower_id) ?? null) : null, unit_name: u?.name ?? null };
        }
        // Campo do próprio empreendimento: a inbox agrupa sob "Terreno" (único grupo hoje).
        if (p.entity === 'empreendimento') return { ...p, tower_name: 'Terreno', unit_name: null };
        return p;
    });
}

/** Igualdade tolerante ao ruído de float e a null/undefined, alinhada à do diff. */
function sameValue(a: unknown, b: unknown): boolean {
    if (a == null && b == null) return true;
    if (typeof a === 'number' || typeof b === 'number') {
        const na = Number(a), nb = Number(b);
        if (Number.isNaN(na) || Number.isNaN(nb)) return false;
        return Math.abs(na - nb) <= 0.01;
    }
    return a === b;
}
