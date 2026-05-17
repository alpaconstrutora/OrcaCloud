import { supabase } from '../lib/supabase';
import { BrokerProposal, BrokerProfile } from '../types';

export const brokerService = {
    // --- Broker Profiles (Gestão de Corretores) ---
    async listProfiles(organizationId?: string) {
        if (!organizationId) return [] as BrokerProfile[];
        const { data, error } = await supabase
            .from('broker_profiles')
            .select('*')
            .eq('organization_id', organizationId)
            .order('name');

        if (error) {
            console.error('[BROKER PROFILE SERVICE] Error listing profiles:', error);
            throw error;
        }

        return (data || []) as BrokerProfile[];
    },

    async saveProfile(profile: Partial<BrokerProfile>) {
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
            .select('*')
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
            .select('*')
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
            return data as BrokerProposal;
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
    async listCommissions(organizationId: string, brokerEmail?: string) {
        console.log(`[BROKER SERVICE] listing commissions for org: ${organizationId}, email: ${brokerEmail}`);
        let query = supabase
            .from('broker_portal_commissions')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });

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
