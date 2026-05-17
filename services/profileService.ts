import { supabase } from '../lib/supabase';
import { ProfileGroup } from '../types';
import { clientService } from './clientService';

export const profileService = {
    async validateAccess(email: string | undefined, group: ProfileGroup): Promise<{ isValid: boolean; error?: string }> {
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
                // Check organization members in a case-insensitive way
                const { data: memberEntry, error } = await supabase
                    .from('organization_members')
                    .select('id')
                    .ilike('email', lowerEmail)
                    .maybeSingle();

                if (error) throw error;
                if (memberEntry) return { isValid: true };

                return { isValid: false, error: 'Seu e-mail não está vinculado a nenhuma organização como usuário.' };
            }

            if (group === ProfileGroup.CLIENT) {
                const clients = await clientService.listClients();
                const isClient = clients.some(c => c.email?.toLowerCase() === lowerEmail);

                if (isClient) return { isValid: true };
                return { isValid: false, error: 'Seu e-mail não está cadastrado como cliente autorizado.' };
            }

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

            if (group === ProfileGroup.SUPPLIER) {
                // If the supplierService still uses localStorage, we can't easily validate on server side,
                // but let's assume for now we want to allow it if they exist in the list.
                // We will migrate supplierService to Supabase next.
                const { data: suppliers, error } = await supabase
                    .from('suppliers')
                    .select('email')
                    .eq('email', lowerEmail);

                if (error && error.code !== 'PGRST116') { // Ignore missing table for now if needed, but we should create it
                    console.error("Supplier table check error:", error.message);
                }

                if (suppliers && suppliers.length > 0) return { isValid: true };
                return { isValid: false, error: 'Seu e-mail não está cadastrado como fornecedor autorizado.' };
            }

            if (group === ProfileGroup.BROKER) {
                const { data: brokers, error } = await supabase
                    .from('broker_profiles')
                    .select('email')
                    .eq('email', lowerEmail)
                    .eq('is_active', true);

                if (error && error.code !== 'PGRST116') {
                    console.error("Broker table check error:", error.message);
                }

                if (brokers && brokers.length > 0) return { isValid: true };
                return { isValid: false, error: 'Seu e-mail não está cadastrado como corretor autorizado.' };
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
