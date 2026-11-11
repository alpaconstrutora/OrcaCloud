import { supabase } from '../lib/supabase';
import type { ApprovalApprover, MembroAprovador } from '../types/financial';

/**
 * Quem aprova cada nível (alçada por usuário, 10/11/2026).
 *
 * Só dono/admin da organização (ou superadmin) grava — a RLS de
 * `approval_approvers` recusa os demais. Não há UPDATE: trocar aprovador é
 * remover e incluir. Plano: docs/planos/2026-11-10-alcada-aprovacao-por-usuario.md
 */
export const approvalApproversService = {
    async listar(organizationId: string): Promise<ApprovalApprover[]> {
        const [{ data, error }, membros] = await Promise.all([
            supabase
                .from('approval_approvers')
                .select('id, organization_id, faixa_id, entity_type, level, user_id')
                .eq('organization_id', organizationId),
            this.membros(organizationId),
        ]);
        if (error) throw new Error(`Erro ao carregar aprovadores: ${error.message}`);
        const porId = new Map(membros.map(m => [m.user_id, m]));
        return ((data ?? []) as ApprovalApprover[]).map(a => ({
            ...a,
            nome: porId.get(a.user_id)?.nome ?? 'Usuário removido da organização',
            email: porId.get(a.user_id)?.email ?? null,
        }));
    },

    /** Membros com conta (user_id preenchido) — só eles podem ser aprovadores. */
    async membros(organizationId: string): Promise<MembroAprovador[]> {
        const { data, error } = await supabase
            .from('organization_members')
            .select('user_id, name, email, role')
            .eq('organization_id', organizationId)
            .not('user_id', 'is', null);
        if (error) throw new Error(`Erro ao carregar membros: ${error.message}`);
        return (data ?? [])
            .map(m => ({
                user_id: m.user_id as string,
                nome: (m.name as string | null)?.trim() || (m.email as string),
                email: m.email as string,
                role: m.role as string,
            }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    },

    async incluir(alvo: { organizationId: string; level: 1 | 2; userId: string } & ({ faixaId: string } | { entityType: NonNullable<ApprovalApprover['entity_type']> })): Promise<void> {
        const { error } = await supabase.from('approval_approvers').insert({
            organization_id: alvo.organizationId,
            faixa_id: 'faixaId' in alvo ? alvo.faixaId : null,
            entity_type: 'entityType' in alvo ? alvo.entityType : null,
            level: alvo.level,
            user_id: alvo.userId,
        });
        if (error) {
            if (error.code === '23505') return; // já estava na lista
            throw new Error(error.code === '42501'
                ? 'Só o dono ou um administrador da organização define quem aprova.'
                : `Erro ao incluir aprovador: ${error.message}`);
        }
    },

    async remover(id: string): Promise<void> {
        const { error, count } = await supabase.from('approval_approvers').delete({ count: 'exact' }).eq('id', id);
        if (error) throw new Error(`Erro ao remover aprovador: ${error.message}`);
        // RLS de DELETE não dá erro: só não apaga. Sem isso o "removido" voltaria ao recarregar.
        if (count === 0) throw new Error('Só o dono ou um administrador da organização define quem aprova.');
    },
};
