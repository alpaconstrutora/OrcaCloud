import { supabase } from '../lib/supabase';
import { BrokerProposal, BrokerProfile } from '../types';
import { supplierService } from './supplierService';

export const brokerService = {
    // --- Broker Profiles (Gestão de Corretores) ---
    async listProfiles(organizationId?: string) {
        if (!organizationId) return [] as BrokerProfile[];
        await supplierService.syncRealEstateBrokerProfiles(organizationId);
        const { data, error } = await supabase
            .from('broker_profiles')
            .select('id, email, name, phone, cpf, creci, agency_name, organization_id, commission_rate, is_active, settings, created_at, updated_at')
            .eq('organization_id', organizationId)
            .order('name');

        if (error) {
            console.error('[BROKER PROFILE SERVICE] Error listing profiles:', error);
            throw error;
        }

        return (data || []) as BrokerProfile[];
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

    // --- Broker Proposals (Gestão de Propostas do Portal) ---
    async listProposals(organizationId: string, brokerEmail?: string) {
        let query = supabase
            .from('broker_portal_proposals')
            .select('id, property_id, broker_id, broker_email, organization_id, buyer_name, buyer_cpf, buyer_email, buyer_phone, buyer_income, unit_price, down_payment, monthly_installments, monthly_value, balloon_value, financing_value, payment_plan_id, discount_pct, total_value, status, notes, admin_notes, created_at, updated_at')
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
            const { data, error } = await supabase
                .from('broker_portal_proposals')
                .update({
                    ...proposal,
                    updated_at: new Date().toISOString()
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
