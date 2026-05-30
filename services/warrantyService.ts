import { supabase } from '../lib/supabase';
import type {
    WarrantyClaim, WarrantyClaimInsert, WarrantyClaimVisit, WarrantyClaimVisitInsert,
    WarrantyClaimEvidence, WarrantyClaimEvent, WarrantyTerm, WarrantyKPIs,
    OpenWarrantyClaimCommand, TriageClaimCommand, ScheduleVisitCommand, CloseClaimCommand,
    ClaimFilters,
} from '../types/warranty';

export const warrantyService = {

    // ── Lookup ────────────────────────────────────────────────
    async getTerms(): Promise<WarrantyTerm[]> {
        const { data, error } = await supabase
            .from('warranty_terms')
            .select('*')
            .eq('active', true)
            .order('prazo_meses', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    // ── Chamados ──────────────────────────────────────────────
    async list(filters: ClaimFilters): Promise<WarrantyClaim[]> {
        let query = supabase
            .from('warranty_claims')
            .select('*, warranty_term:warranty_terms(*)')
            .eq('organization_id', filters.organization_id)
            .order('created_at', { ascending: false });

        if (filters.project_id)  query = query.eq('project_id', filters.project_id);
        if (filters.client_id)   query = query.eq('client_id', filters.client_id);
        if (filters.in_warranty !== undefined) query = query.eq('in_warranty', filters.in_warranty);
        if (filters.state?.length)    query = query.in('state', filters.state);
        if (filters.severity?.length) query = query.in('severity', filters.severity);

        const { data, error } = await query;
        if (error) throw error;
        return (data || []) as WarrantyClaim[];
    },

    async getById(id: string, organizationId: string): Promise<WarrantyClaim | null> {
        const { data, error } = await supabase
            .from('warranty_claims')
            .select('*, warranty_term:warranty_terms(*), visits:warranty_claim_visits(*), evidence:warranty_claim_evidence(*)')
            .eq('id', id)
            .eq('organization_id', organizationId)
            .maybeSingle();
        if (error) throw error;
        return data as WarrantyClaim | null;
    },

    // ── RPCs ──────────────────────────────────────────────────
    async open(cmd: OpenWarrantyClaimCommand): Promise<{ id: string; version: number }> {
        const { data, error } = await supabase.rpc('open_warranty_claim', {
            p_organization_id:   cmd.organization_id,
            p_project_id:        cmd.project_id ?? null,
            p_client_id:         cmd.client_id ?? null,
            p_client_name:       cmd.client_name ?? null,
            p_unidade_ref:       cmd.unidade_ref ?? null,
            p_sistema_descricao: cmd.sistema_descricao,
            p_local_afetado:     cmd.local_afetado ?? null,
            p_descricao:         cmd.descricao,
            p_severity:          cmd.severity,
            p_warranty_term_code: cmd.warranty_term_code ?? null,
            p_opened_by:         cmd.opened_by,
        });
        if (error) throw error;
        return data as { id: string; version: number };
    },

    async triage(cmd: TriageClaimCommand): Promise<{ version: number; new_state: string }> {
        const { data, error } = await supabase.rpc('triage_warranty_claim', {
            p_claim_id:             cmd.claim_id,
            p_organization_id:      cmd.organization_id,
            p_expected_version:     cmd.expected_version,
            p_in_warranty:          cmd.in_warranty,
            p_warranty_expires_at:  cmd.warranty_expires_at ?? null,
            p_sla_deadline:         cmd.sla_deadline ?? null,
            p_fora_garantia_motivo: cmd.fora_garantia_motivo ?? null,
            p_triaged_by:           cmd.triaged_by,
        });
        if (error) throw error;
        return data as { version: number; new_state: string };
    },

    async scheduleVisit(cmd: ScheduleVisitCommand): Promise<{ visit_id: string; version: number }> {
        const { data, error } = await supabase.rpc('schedule_warranty_visit', {
            p_claim_id:         cmd.claim_id,
            p_organization_id:  cmd.organization_id,
            p_expected_version: cmd.expected_version,
            p_scheduled_at:     cmd.scheduled_at,
            p_technician_name:  cmd.technician_name,
            p_technician_id:    cmd.technician_id ?? null,
            p_actor:            cmd.actor,
        });
        if (error) throw error;
        return data as { visit_id: string; version: number };
    },

    async close(cmd: CloseClaimCommand): Promise<{ version: number }> {
        const { data, error } = await supabase.rpc('close_warranty_claim', {
            p_claim_id:         cmd.claim_id,
            p_organization_id:  cmd.organization_id,
            p_expected_version: cmd.expected_version,
            p_custo_real:       cmd.custo_real ?? null,
            p_nps_nota:         cmd.nps_nota ?? null,
            p_nps_comentario:   cmd.nps_comentario ?? null,
            p_closed_by:        cmd.closed_by,
        });
        if (error) throw error;
        return data as { version: number };
    },

    async updateVisit(visitId: string, updates: Partial<WarrantyClaimVisit>): Promise<WarrantyClaimVisit> {
        const { data, error } = await supabase
            .from('warranty_claim_visits')
            .update(updates)
            .eq('id', visitId)
            .select()
            .single();
        if (error) throw error;
        return data as WarrantyClaimVisit;
    },

    async createVisit(visit: WarrantyClaimVisitInsert): Promise<WarrantyClaimVisit> {
        const { data, error } = await supabase
            .from('warranty_claim_visits')
            .insert(visit)
            .select()
            .single();
        if (error) throw error;
        return data as WarrantyClaimVisit;
    },

    async update(id: string, organizationId: string, updates: Partial<WarrantyClaim>): Promise<WarrantyClaim> {
        const { data, error } = await supabase
            .from('warranty_claims')
            .update(updates)
            .eq('id', id)
            .eq('organization_id', organizationId)
            .select()
            .single();
        if (error) throw error;
        return data as WarrantyClaim;
    },

    // ── Evidências ────────────────────────────────────────────
    async getEvidence(claimId: string): Promise<WarrantyClaimEvidence[]> {
        const { data, error } = await supabase
            .from('warranty_claim_evidence')
            .select('*')
            .eq('claim_id', claimId)
            .eq('superseded', false)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []) as WarrantyClaimEvidence[];
    },

    async uploadEvidence(
        organizationId: string,
        claimId: string,
        file: File,
        capturedBy: Record<string, unknown>,
        attachedTo: 'claim' | 'visit' | 'repair' = 'claim',
        attachedToRef?: string,
    ): Promise<WarrantyClaimEvidence> {
        const ext = file.name.split('.').pop();
        const path = `${organizationId}/warranty/${claimId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
            .from('warranty-evidence')
            .upload(path, file);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('warranty-evidence').getPublicUrl(path);

        const { data, error } = await supabase
            .from('warranty_claim_evidence')
            .insert({
                organization_id: organizationId,
                claim_id: claimId,
                type: file.type.startsWith('image') ? 'photo' : file.type.startsWith('video') ? 'video' : 'document',
                url: publicUrl,
                mime_type: file.type,
                size_bytes: file.size,
                captured_by: capturedBy,
                attached_to: attachedTo,
                attached_to_ref: attachedToRef ?? null,
            })
            .select()
            .single();
        if (error) throw error;
        return data as WarrantyClaimEvidence;
    },

    // ── Audit log ─────────────────────────────────────────────
    async getEvents(claimId: string): Promise<WarrantyClaimEvent[]> {
        const { data, error } = await supabase
            .from('warranty_claim_events')
            .select('*')
            .eq('claim_id', claimId)
            .order('occurred_at', { ascending: true });
        if (error) throw error;
        return (data || []) as WarrantyClaimEvent[];
    },

    // ── KPIs ─────────────────────────────────────────────────
    async getKPIs(organizationId: string): Promise<WarrantyKPIs> {
        const now = new Date();
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

        const { data, error } = await supabase
            .from('warranty_claims')
            .select('state, in_warranty, nps_nota, custo_real, sla_deadline, created_at')
            .eq('organization_id', organizationId);
        if (error) throw error;

        const rows = data || [];
        const today = now.toISOString().slice(0, 10);

        return {
            total_abertos:   rows.filter(r => !['ENCERRADO','FORA_GARANTIA'].includes(r.state)).length,
            em_garantia:     rows.filter(r => r.in_warranty === true  && r.state !== 'ENCERRADO').length,
            fora_garantia:   rows.filter(r => r.in_warranty === false).length,
            encerrados_mes:  rows.filter(r => r.state === 'ENCERRADO' && r.created_at >= firstOfMonth).length,
            nps_medio:       (() => {
                const notas = rows.filter(r => r.nps_nota != null).map(r => r.nps_nota as number);
                return notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
            })(),
            custo_total_mes: rows
                .filter(r => r.state === 'ENCERRADO' && r.created_at >= firstOfMonth)
                .reduce((s, r) => s + (r.custo_real || 0), 0),
            sla_vencidos:    rows.filter(r => r.sla_deadline && r.sla_deadline < today && !['ENCERRADO','FORA_GARANTIA'].includes(r.state)).length,
        };
    },
};
