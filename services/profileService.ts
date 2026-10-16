import { supabase } from '../lib/supabase';
import { ProfileGroup } from '../types';

export type PortalComToken = 'cliente' | 'fornecedor' | 'corretor';

/**
 * Cliente, Fornecedor e Corretor (16/10/2026): a validação é a RPC
 * `portal_token_para_mim` — SECURITY DEFINER, pela pessoa do JWT. Antes, Cliente
 * e Fornecedor eram validados em tabela direta (`clients`/`suppliers`), que a RLS
 * só libera a membro da organização: quem era DE FORA era recusado sempre.
 * A RPC também devolve o token do portal, e o App abre a casca do link com ele.
 */
async function validarPorTokenDoPortal(portal: PortalComToken, nomeDoPortal: string, papel: string): Promise<{ isValid: boolean; error?: string; portalToken?: string }> {
    const { data, error } = await supabase.rpc('portal_token_para_mim', { p_portal: portal });
    if (error) {
        console.error(`[validateAccess] ${portal}:`, error.message);
        return { isValid: false, error: `Erro de validação do acesso ao ${nomeDoPortal}. Por favor, contate o suporte.` };
    }
    const r = (data ?? {}) as { situacao?: string; token?: string };
    if (r.situacao === 'ok' && r.token) return { isValid: true, portalToken: r.token };
    if (r.situacao === 'revogado') return { isValid: false, error: `Seu acesso ao ${nomeDoPortal} foi desativado. Fale com a construtora.` };
    if (r.situacao === 'sem_organizacao') return { isValid: false, error: `Seu cadastro de ${papel} ainda não está ligado a uma construtora. Peça a ela o convite por e-mail.` };
    return { isValid: false, error: `Seu e-mail não está cadastrado como ${papel} autorizado.` };
}

export const profileService = {
    /**
     * `portalToken` vem só para Cliente, Fornecedor e Corretor (16/10/2026): o login
     * por e-mail "entrega a experiência do link" — a RPC `portal_token_para_mim`
     * resolve o token da própria pessoa (e-mail do JWT) e o App abre a mesma casca
     * do acesso por link. Plano: docs/planos/2026-10-16-portais-login-exclusivo-convite.md
     */
    async validateAccess(email: string | undefined, group: ProfileGroup): Promise<{ isValid: boolean; error?: string; portalToken?: string }> {
        if (!email) return { isValid: false, error: 'Usuário não identificado.' };

        const lowerEmail = email.toLowerCase();

        // 1. Exclusive Reserved Emails
        const reservedMapping: Record<string, ProfileGroup[]> = {
            'altair.rosa@alpaconstrutora.com.br': [ProfileGroup.DEVELOPER, ProfileGroup.USER],
            'financeiro@alpaconstrutora.com.br': [ProfileGroup.INVESTOR],
            'alpaconstrutora@gmail.com': [ProfileGroup.CLIENT]
        };

        const matchedReserved = Object.keys(reservedMapping).find(key => key.toLowerCase() === lowerEmail);

        if (matchedReserved) {
            if (reservedMapping[matchedReserved].includes(group)) return { isValid: true };

            const targetPortal = reservedMapping[matchedReserved][0] === ProfileGroup.DEVELOPER ? 'Desenvolvedor' :
                reservedMapping[matchedReserved][0] === ProfileGroup.INVESTOR ? 'Investidor' : 'Cliente';

            return {
                isValid: false,
                error: `Este e-mail está reservado apenas para o Portal do ${targetPortal}.`
            };
        }

        try {
            if (group === ProfileGroup.USER || group === ProfileGroup.DEVELOPER) {
                // A pergunta é "pertence a ALGUMA organização?", não "a exatamente
                // uma".
                //
                // ⚠️ Sem o `.limit(1)`, o `maybeSingle()` devolve
                // `PGRST116: Results contain 2 rows` para quem é membro de mais
                // de uma organização — e a policy `Users can view own membership`
                // (lower(email) = e-mail do JWT) faz o usuário enxergar TODAS as
                // próprias linhas. O erro cai no catch, vira `isValid: false`, e
                // o useAuthSync DESLOGA o usuário 3 segundos depois.
                //
                // Não aparecia porque o único multi-org da base era
                // altair.rosa@…, que está fixo no `reservedMapping` acima e
                // retorna antes de chegar aqui. Medido em 07/09/2026, ao dar a
                // uma segunda conta acesso a uma SPE: login impossível.
                const { data: memberEntry, error } = await supabase
                    .from('organization_members')
                    .select('id')
                    .ilike('email', lowerEmail)
                    .limit(1)
                    .maybeSingle();

                if (error) throw error;
                if (memberEntry) return { isValid: true };

                return { isValid: false, error: 'Seu e-mail não está vinculado a nenhuma organização como usuário.' };
            }

            if (group === ProfileGroup.CLIENT) return validarPorTokenDoPortal('cliente', 'Portal do Cliente', 'cliente');

            if (group === ProfileGroup.INVESTOR) {
                const { data: investors, error } = await supabase
                    .from('investors') // Table to be created
                    .select('email')
                    .eq('email', lowerEmail);

                if (error) {
                    // Table might not exist or connection issue - DENY by default for security
                    console.error("Investor table check error:", error.message);
                    return { isValid: false, error: 'Erro de validação de investidor. Por favor, contate o suporte.' };
                }

                if (investors && investors.length > 0) return { isValid: true };
                return { isValid: false, error: 'Seu e-mail não está na lista de investidores autorizados.' };
            }

            if (group === ProfileGroup.SUPPLIER) return validarPorTokenDoPortal('fornecedor', 'Portal do Fornecedor', 'fornecedor');

            if (group === ProfileGroup.BROKER) return validarPorTokenDoPortal('corretor', 'Portal do Corretor', 'corretor');

            if (group === ProfileGroup.LENDER) {
                // O credor não é membro de organização nenhuma: o vínculo dele é
                // o convite em credit_room_members, lido pela função DEFINER que
                // já filtra revogado/expirado e casa pelo e-mail do JWT.
                const { data, error } = await supabase.rpc('fn_my_credit_rooms');
                if (error) {
                    console.error('Lender validation error:', error.message);
                    return { isValid: false, error: 'Erro de validação do acesso de crédito. Por favor, contate o suporte.' };
                }
                if (Array.isArray(data) && data.length > 0) return { isValid: true };
                return { isValid: false, error: 'Seu e-mail não foi convidado para nenhuma operação de crédito, ou o convite expirou.' };
            }

            if (group === ProfileGroup.PARTNER) {
                const { data: partnerUser, error } = await supabase
                    .from('partner_users')
                    .select('id, is_active')
                    .eq('email', lowerEmail)
                    .eq('is_active', true)
                    .maybeSingle();

                if (error) {
                    console.error("Partner validation error:", error.message);
                    return { isValid: false, error: 'Erro de validação do parceiro. Por favor, contate o suporte.' };
                }

                if (partnerUser) return { isValid: true };
                return { isValid: false, error: 'Seu e-mail não está cadastrado como parceiro autorizado.' };
            }

            if (group === ProfileGroup.TRAINEE) {
                // O treinando não é membro de organização: ler `academy_portal_users`
                // direto devolveria [] pela RLS. A RPC resolve pelo e-mail do JWT e
                // devolve as identidades ativas (uma por organização que convidou).
                const { data, error } = await supabase.rpc('academy_portal_user_my_access');
                if (error) {
                    console.error('Trainee validation error:', error.message);
                    return { isValid: false, error: 'Erro de validação do acesso ao Portal de Treinamentos. Por favor, contate o suporte.' };
                }
                if (Array.isArray(data) && data.length > 0) return { isValid: true };
                return { isValid: false, error: 'Seu e-mail não está cadastrado no Portal de Treinamentos. Peça ao RH da empresa para enviar o convite.' };
            }

            return { isValid: true };
        } catch (err) {
            console.error("Validation error:", err);
            return { isValid: false, error: 'Ocorreu um erro ao validar seu acesso.' };
        }
    },

    async getCurrentUser(): Promise<{ email: string; name: string } | null> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        return {
            email: user.email || '',
            name: user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário'
        };
    }
};
