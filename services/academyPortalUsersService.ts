/**
 * Portal de Treinamentos — GESTÃO dos acessos (RH › Treinamentos › Portal).
 *
 * Plano: docs/planos/2026-10-15-portal-de-treinamentos.md
 *
 * Quem usa este arquivo é o membro da organização (RLS de `academy_portal_users`
 * = is_org_member). O treinando, do outro lado, usa `academyTraineeService`.
 *
 * Criar passa pela RPC `academy_portal_users_create`: para TERCEIRO ela cria
 * a ficha em `employees` (contract_type EMPREITEIRO, academy_externo) e o
 * acesso na mesma transação — a Academia só matricula e certifica fichas.
 */

import { supabase } from '../lib/supabase';
import type { AcademyPortalUser, AcademyPortalUserTipo } from '../types/academy';

const COLS = 'id, org_id, email, name, phone, cpf, tipo, employee_id, empresa_terceira, contractor_id, ' +
    'is_active, invited_at, last_access_at, created_by, created_at, updated_at';

export interface NovoAcessoPortal {
    orgId: string;
    tipo: AcademyPortalUserTipo;
    name: string;
    email: string;
    phone?: string;
    cpf?: string;
    /** COLABORADOR: ficha existente */
    employeeId?: string;
    /** TERCEIRO */
    empresaTerceira?: string;
    contractorId?: string | null;
    funcao?: string;
}

export const academyPortalUsersService = {
    /** `organizationId` null = "Todas": a RLS recorta pelas orgs do usuário (REGRA #5). */
    async list(organizationId?: string | null): Promise<AcademyPortalUser[]> {
        let q = supabase.from('academy_portal_users').select(COLS).order('name');
        if (organizationId) q = q.eq('org_id', organizationId);
        const { data, error } = await q;
        if (error) throw error;
        // `academy_portal_users` ainda não está em types_db.ts (gerado) — cast explícito.
        const rows = ((data || []) as unknown) as AcademyPortalUser[];

        // Nome/função da ficha — join resolvido no cliente (sem FK por design).
        const ids = Array.from(new Set(rows.map(r => r.employee_id).filter(Boolean)));
        if (ids.length) {
            const { data: emps } = await supabase.from('employees').select('id, name, role').in('id', ids);
            const mapa = new Map((emps || []).map((e: { id: string; name: string; role?: string }) => [e.id, e]));
            for (const r of rows) {
                const e = mapa.get(r.employee_id);
                if (e) { r.employee_name = e.name; r.employee_role = e.role ?? undefined; }
            }
        }
        return rows;
    },

    async create(input: NovoAcessoPortal): Promise<AcademyPortalUser> {
        const { data, error } = await supabase.rpc('academy_portal_users_create', {
            p_org: input.orgId,
            p_tipo: input.tipo,
            p_name: input.name.trim(),
            p_email: input.email.trim().toLowerCase(),
            p_phone: input.phone?.trim() || null,
            p_cpf: input.cpf?.trim() || null,
            p_employee_id: input.employeeId || null,
            p_empresa_terceira: input.empresaTerceira?.trim() || null,
            p_contractor_id: input.contractorId || null,
            p_funcao: input.funcao?.trim() || null,
        });
        if (error) throw error;
        return data as AcademyPortalUser;
    },

    async update(id: string, updates: Partial<Pick<AcademyPortalUser, 'name' | 'phone' | 'cpf' | 'empresa_terceira' | 'contractor_id' | 'is_active' | 'email'>>): Promise<AcademyPortalUser> {
        const clean = { ...updates };
        if (typeof clean.email === 'string') clean.email = clean.email.trim().toLowerCase();
        const { data, error } = await supabase
            .from('academy_portal_users').update(clean).eq('id', id).select(COLS).single();
        if (error) throw error;
        return (data as unknown) as AcademyPortalUser;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('academy_portal_users').delete().eq('id', id);
        if (error) throw error;
    },

    /** Convite por e-mail (Edge Function academy-portal-invite). */
    async invite(id: string): Promise<{ kind: 'invite' | 'recovery' }> {
        const { data, error } = await supabase.functions.invoke('academy-portal-invite', {
            body: { portal_user_id: id },
        });
        if (error) {
            let msg = error.message || 'Falha ao enviar o convite.';
            try {
                const body = await (error as { context?: Response }).context?.json();
                if (body?.error) msg = body.error;
            } catch { /* corpo não era JSON */ }
            throw new Error(msg);
        }
        if (!data?.ok) throw new Error(data?.error || 'Falha ao enviar o convite.');
        return { kind: data.kind };
    },
};
