import { supabase } from '../lib/supabase';

/**
 * Convite por e-mail para os portais do Cliente, do Fornecedor e do Corretor
 * (Edge Function `portal-invite-user`, 16/10/2026). Molde:
 * `partnerService.invitePartnerUser` (Portal do Parceiro).
 *
 * A function: confere que quem chama é membro da organização do cadastro,
 * garante o token do portal, gera o link de criar senha (ou redefinir, se o
 * e-mail já tem conta), manda pelo Resend e grava `portal_invited_at`.
 * Devolve o tipo de link; em erro, a MENSAGEM da function (não o genérico
 * "Edge Function returned a non-2xx status code").
 */
export type PortalComConvite = 'cliente' | 'fornecedor' | 'corretor';

export interface ResultadoDoConvite {
    kind: 'invite' | 'recovery';
    /** ISO da gravação em `portal_invited_at` (para atualizar a tela sem reler). */
    invitedAt: string;
}

export const portalInviteService = {
    async enviarConvite(portal: PortalComConvite, id: string): Promise<ResultadoDoConvite> {
        const { data, error } = await supabase.functions.invoke('portal-invite-user', {
            body: { portal, id },
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
        return { kind: data.kind, invitedAt: data.invited_at || new Date().toISOString() };
    },
};
