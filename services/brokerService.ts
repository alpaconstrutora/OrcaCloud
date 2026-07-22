import { supabase } from '../lib/supabase';
import { BrokerProposal, BrokerProfile } from '../types';
import { supplierService } from './supplierService';

export const brokerService = {
    // --- Broker Profiles (Gestão de Corretores) ---
    // organizationId aceita uma org (string) OU uma lista de orgs (string[]).
    // A lista serve para a negociação enxergar corretores de TODAS as
    // organizações do usuário (ex: corretor cadastrado na "Alpa Construtora"
    // aparece nas negociações das SPEs de cada empreendimento — decisão do
    // usuário 2026-07-21). Sem filtro nenhum, a RLS (is_org_member) já escopa às
    // orgs do usuário; a lista explícita é defesa em profundidade.
    async listProfiles(organizationId?: string | string[]) {
        const orgIds = Array.isArray(organizationId)
            ? organizationId.filter(Boolean)
            : (organizationId ? [organizationId] : []);

        // syncRealEstateBrokerProfiles materializa corretores a partir de
        // fornecedores-corretores de cada org — roda para todas as orgs pedidas.
        for (const orgId of orgIds) {
            await supplierService.syncRealEstateBrokerProfiles(orgId);
        }

        let query = supabase
            .from('broker_profiles')
            .select('id, email, name, phone, cpf, creci, agency_name, organization_id, commission_rate, is_active, settings, created_at, updated_at')
            .order('name');
        if (orgIds.length === 1) query = query.eq('organization_id', orgIds[0]);
        else if (orgIds.length > 1) query = query.in('organization_id', orgIds);
        const { data, error } = await query;

        if (error) {
            console.error('[BROKER PROFILE SERVICE] Error listing profiles:', error);
            throw error;
        }

        return (data || []) as BrokerProfile[];
    },

    // Igual a listProfiles, mas só devolve quem tem hoje um fornecedor
    // categoria "Corretor Imobiliário" correspondente (mesma org + e-mail).
    // broker_profiles acumula registros órfãos de um fluxo antigo de cadastro
    // direto (removido da UI, nunca limpo do banco) — as abas Corretores de
    // Venda de Ativos/Locações usam esta função para não misturar esse lixo
    // com o cadastro centralizado em Fornecedores.
    async listSupplierLinkedProfiles(organizationId?: string): Promise<BrokerProfile[]> {
        const [profiles, brokerSuppliers] = await Promise.all([
            this.listProfiles(organizationId),
            supplierService.listRealEstateBrokers(organizationId),
        ]);
        const validEmails = new Set(
            brokerSuppliers.map(s => (s.email || '').trim().toLowerCase()).filter(Boolean)
        );
        return profiles.filter(p => validEmails.has((p.email || '').trim().toLowerCase()));
    },

    async saveProfile(profile: Partial<BrokerProfile>) {
        if (!profile.id && !profile.organization_id) {
            throw new Error('Nenhuma organização selecionada para cadastrar o corretor.');
        }

        if (profile.id) {
            const { data, error } = await supabase
                .from('broker_profiles')
                .update({
                    ...profile,
                    updated_at: new Date().toISOString()
                })
                .eq('id', profile.id)
                .select()
                .single();

            if (error) {
                console.error('[BROKER PROFILE SERVICE] Error updating profile:', error);
                throw error;
            }
            return data as BrokerProfile;
        } else {
            const { data, error } = await supabase
                .from('broker_profiles')
                .insert(profile)
                .select()
                .single();

            if (error) {
                console.error('[BROKER PROFILE SERVICE] Error inserting profile:', error);
                throw error;
            }
            return data as BrokerProfile;
        }
    },

    async deleteProfile(id: string) {
        const { error } = await supabase
            .from('broker_profiles')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[BROKER PROFILE SERVICE] Error deleting profile:', error);
            throw error;
        }
    },

    async getProfile(id: string) {
        const { data, error } = await supabase
            .from('broker_profiles')
            .select('id, email, name, phone, cpf, creci, agency_name, organization_id, commission_rate, is_active, settings, created_at, updated_at')
            .eq('id', id)
            .single();

        if (error) {
            console.error('[BROKER PROFILE SERVICE] Error getting profile:', error);
            return null;
        }

        return data as BrokerProfile;
    },

    // --- Broker Property Access (habilitação de corretor por empreendimento) ---
    // property_id é a linha commercial_properties tipo BUILDING selecionada nas
    // abas Corretores de Venda de Ativos/Locações. Sem linha em
    // broker_property_access = corretor NÃO vê aquele empreendimento no Portal
    // (default enabled=false na tabela).
    async listPropertyAccess(propertyId: string): Promise<Record<string, boolean>> {
        if (!propertyId) return {};
        const { data, error } = await supabase
            .from('broker_property_access')
            .select('broker_id, enabled')
            .eq('property_id', propertyId);

        if (error) {
            console.error('[BROKER PROFILE SERVICE] Error listing property access:', error);
            throw error;
        }

        return Object.fromEntries((data || []).map(row => [row.broker_id as string, row.enabled as boolean]));
    },

    async setPropertyAccess(brokerId: string, propertyId: string, enabled: boolean) {
        const { error } = await supabase
            .from('broker_property_access')
            .upsert(
                { broker_id: brokerId, property_id: propertyId, enabled, updated_at: new Date().toISOString() },
                { onConflict: 'broker_id,property_id' }
            );

        if (error) {
            console.error('[BROKER PROFILE SERVICE] Error setting property access:', error);
            throw error;
        }
    },

    async listEnabledPropertyIds(brokerId: string): Promise<string[]> {
        if (!brokerId) return [];
        const { data, error } = await supabase
            .from('broker_property_access')
            .select('property_id')
            .eq('broker_id', brokerId)
            .eq('enabled', true);

        if (error) {
            console.error('[BROKER PROFILE SERVICE] Error listing enabled property ids:', error);
            throw error;
        }

        return (data || []).map(row => row.property_id as string);
    },

    // --- Broker Proposals (Gestão de Propostas do Portal) ---
    async listProposals(organizationId: string, brokerEmail?: string) {
        let query = supabase
            .from('broker_portal_proposals')
            .select('id, property_id, broker_id, broker_email, organization_id, buyer_name, buyer_cpf, buyer_email, buyer_phone, buyer_income, unit_price, down_payment, monthly_installments, monthly_value, balloon_value, financing_value, payment_plan, discount_pct, total_value, status, notes, admin_notes, created_at, updated_at')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });

        if (brokerEmail) {
            query = query.eq('broker_email', brokerEmail);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[BROKER SERVICE] Error listing proposals:', error);
            throw error;
        }

        return (data || []) as BrokerProposal[];
    },

    async saveProposal(proposal: Partial<BrokerProposal>) {
        if (proposal.id && !proposal.id.startsWith('prop-')) {
            // Versionamento (F3): antes de alterar, guarda a versão atual em
            // revision_history e incrementa version. version/revision_history são
            // controlados aqui — o payload do caller não os define.
            const { version, revision_history, ...clean } = proposal as Partial<BrokerProposal> & {
                version?: number; revision_history?: unknown[];
            };
            const { data: current } = await supabase
                .from('broker_portal_proposals')
                .select('version, revision_history, unit_price, discount_pct, total_value, down_payment, monthly_installments, monthly_value, balloon_value, financing_value, payment_plan, status, updated_at')
                .eq('id', proposal.id)
                .single();

            const prevVersion = (current?.version as number) ?? 1;
            const history = Array.isArray(current?.revision_history) ? current!.revision_history : [];
            const snapshot = current
                ? { v: prevVersion, at: current.updated_at, ...current, version: undefined, revision_history: undefined }
                : null;

            const { data, error } = await supabase
                .from('broker_portal_proposals')
                .update({
                    ...clean,
                    version: prevVersion + 1,
                    revision_history: snapshot ? [...history, snapshot] : history,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', proposal.id)
                .select()
                .single();

            if (error) {
                console.error('[BROKER SERVICE] Error updating proposal:', error);
                throw error;
            }
            return data as BrokerProposal;
        } else {
            // Remove temporary ID if exists
            const { id, ...payload } = proposal;
            const { data, error } = await supabase
                .from('broker_portal_proposals')
                .insert(payload)
                .select()
                .single();

            if (error) {
                console.error('[BROKER SERVICE] Error inserting proposal:', error);
                throw error;
            }
            const saved = data as BrokerProposal;

            // Notifica admins da organização — fire-and-forget (falha silenciosa)
            if (saved.id && saved.organization_id) {
                supabase.functions.invoke('notify-broker-proposal', {
                    body: {
                        proposalId: saved.id,
                        organizationId: saved.organization_id,
                    },
                }).catch(() => {/* notificação não bloqueia o fluxo */});
            }

            return saved;
        }
    },

    /**
     * Gera (ou reusa) o token do link público da proposta. O token é o segredo —
     * quem tem o link vê a proposta pela RPC fn_proposal_public (sem login).
     * Idempotente: se já houver token, retorna o existente.
     */
    async shareProposal(id: string): Promise<string> {
        const { data: existing } = await supabase
            .from('broker_portal_proposals')
            .select('share_token')
            .eq('id', id)
            .single();
        const current = (existing?.share_token as string | null) ?? null;
        if (current) return current;

        const token = crypto.randomUUID();
        const { error } = await supabase
            .from('broker_portal_proposals')
            .update({ share_token: token })
            .eq('id', id);
        if (error) throw error;
        return token;
    },

    /** Leitura pública da proposta pelo token (acesso anon via RPC SECURITY DEFINER). */
    async getProposalByToken(token: string): Promise<Record<string, unknown> | null> {
        const { data, error } = await supabase.rpc('fn_proposal_public', { p_token: token });
        if (error) throw error;
        return (data as Record<string, unknown>) ?? null;
    },

    async deleteProposal(id: string) {
        const { error } = await supabase
            .from('broker_portal_proposals')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[BROKER SERVICE] Error deleting proposal:', error);
            throw error;
        }
    },

    // --- Broker Commissions ---
    async listCommissions(organizationId: string | null, brokerEmail?: string) {
        console.log(`[BROKER SERVICE] listing commissions for org: ${organizationId}, email: ${brokerEmail}`);
        let query = supabase
            .from('broker_portal_commissions')
            .select('id, organization_id, proposal_id, broker_email, unit_number, block, buyer_name, sale_value, commission_pct, commission_predicted, commission_released, commission_paid, status, milestones, created_at, updated_at')
            .order('created_at', { ascending: false });
        if (organizationId) query = query.eq('organization_id', organizationId);

        if (brokerEmail) {
            // Case insensitive search using ilike
            query = query.ilike('broker_email', brokerEmail);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[BROKER SERVICE] Error listing commissions:', error);
            throw error;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (data || []) as any[];
    }
};
