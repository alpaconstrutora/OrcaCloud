import { supabase } from '../lib/supabase';
import { BrokerProposal, BrokerProposalUnit, BrokerProfile } from '../types';
import { supplierService } from './supplierService';

/**
 * ⚠️ PROPOSTA NÃO GERA PARCELA (decisão do usuário, 2026-08-02).
 *
 * Em 01/08 esta camada materializava o plano paramétrico da proposta como
 * linhas numa tabela de parcelas. Foi revertido: proposta é simulação —
 * `down_payment`, `monthly_installments`, `monthly_value`, `balloon_value` e o
 * snapshot do motor em `payment_plan`. Parcela só existe quando é cobrança
 * real, e cobrança nasce na negociação (ver `dealReceivablesService`).
 */

/**
 * `broker_portal_proposal_units` só existe depois da migration 20270826000010.
 * Enquanto ela não for aplicada, ler a tabela falha com 42P01/PGRST205 e
 * derrubaria a aba de propostas inteira. Este flag registra a ausência na
 * primeira falha e o Portal passa a operar no modo legado (1 unidade por
 * proposta, via `property_id`) sem erro visível.
 */
let proposalUnitsTableMissing = false;
function noteProposalUnitsError(error: { code?: string; message?: string } | null | undefined): boolean {
    const code = error?.code || '';
    const msg = error?.message || '';
    if (code === '42P01' || code === 'PGRST205' || msg.includes('broker_portal_proposal_units')) {
        if (!proposalUnitsTableMissing) {
            console.warn('[BROKER SERVICE] Tabela broker_portal_proposal_units indisponível — operando em modo 1 unidade por proposta. Aplique a migration 20270826000010.');
        }
        proposalUnitsTableMissing = true;
        return true;
    }
    return false;
}

/**
 * Normaliza a cesta de unidades de uma proposta.
 *
 * Propostas anteriores à tabela de itens (e qualquer linha que o backfill não
 * tenha alcançado) só têm `property_id`. Em vez de espalhar `if (units?.length)`
 * pela base, toda leitura passa por aqui e enxerga SEMPRE uma lista — com uma
 * única unidade, no caso legado.
 */
export function proposalUnitsOf(p: Partial<BrokerProposal> | null | undefined): BrokerProposalUnit[] {
    if (!p) return [];
    const list = (p.units || []).filter(u => !!u?.property_id);
    if (list.length > 0) {
        const primaryIdx = Math.max(0, list.findIndex(u => u.is_primary));
        return list
            .map((u, i) => ({
                ...u,
                unit_price: Number(u.unit_price) || 0,
                allocated_value: Number(u.allocated_value) || 0,
                is_primary: i === primaryIdx,
                sort_order: u.sort_order ?? i,
            }))
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
    if (p.property_id) {
        return [{
            property_id: p.property_id,
            unit_price: Number(p.unit_price) || 0,
            allocated_value: Number(p.total_value) || 0,
            is_primary: true,
            sort_order: 0,
        }];
    }
    return [];
}

/** Soma dos preços de tabela da cesta — é o `unit_price` do header. */
export function proposalUnitsTablePrice(units: BrokerProposalUnit[] | undefined): number {
    return (units || []).reduce((s, u) => s + (Number(u.unit_price) || 0), 0);
}

/** Soma das cotas rateadas — tem que fechar com o `total_value` do header. */
export function proposalUnitsAllocated(units: BrokerProposalUnit[] | undefined): number {
    return (units || []).reduce((s, u) => s + (Number(u.allocated_value) || 0), 0);
}

/**
 * Rateia `totalValue` entre as unidades pro rata do preço de tabela, jogando o
 * resíduo de centavos na maior cota — assim a soma fecha EXATAMENTE com o total,
 * sem o clássico R$ 0,01 de diferença que faria a validação do simulador falhar.
 */
export function allocateProRata(units: BrokerProposalUnit[], totalValue: number): BrokerProposalUnit[] {
    const base = proposalUnitsTablePrice(units);
    if (units.length === 0) return [];
    if (base <= 0) {
        // Sem preço de tabela não há proporção: divide igualmente.
        const each = Math.round((totalValue / units.length) * 100) / 100;
        const out = units.map(u => ({ ...u, allocated_value: each }));
        const diff = Math.round((totalValue - each * units.length) * 100) / 100;
        if (diff !== 0) out[0].allocated_value = Math.round((out[0].allocated_value + diff) * 100) / 100;
        return out;
    }
    const out = units.map(u => ({
        ...u,
        allocated_value: Math.round(((Number(u.unit_price) || 0) / base) * totalValue * 100) / 100,
    }));
    const diff = Math.round((totalValue - proposalUnitsAllocated(out)) * 100) / 100;
    if (diff !== 0) {
        let biggest = 0;
        out.forEach((u, i) => { if (u.allocated_value > out[biggest].allocated_value) biggest = i; });
        out[biggest].allocated_value = Math.round((out[biggest].allocated_value + diff) * 100) / 100;
    }
    return out;
}

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
        // Corretor "Todas as organizações" tem uma linha de broker_profiles por
        // organização (mesmo e-mail) — a leitura do link público
        // (fn_broker_portal_get_units) libera acesso casando por e-mail, então a
        // escrita precisa aplicar o mesmo enabled a TODAS as linhas do e-mail,
        // senão uma linha antiga habilitada noutra organização mantém o
        // empreendimento visível mesmo depois de desabilitar na tela atual.
        const { error } = await supabase.rpc('fn_set_broker_property_access', {
            p_broker_id: brokerId,
            p_property_id: propertyId,
            p_enabled: enabled,
        });

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
        const BASE_COLS = 'id, property_id, broker_id, broker_email, organization_id, buyer_name, buyer_cpf, buyer_email, buyer_phone, buyer_income, unit_price, down_payment, monthly_installments, monthly_value, balloon_value, financing_value, payment_plan, discount_pct, total_value, status, notes, admin_notes, created_at, updated_at';
        const UNITS_EMBED = ', units:broker_portal_proposal_units(id, proposal_id, property_id, organization_id, unit_price, allocated_value, is_primary, sort_order)';

        const buildQuery = (withUnits: boolean) => {
            let q = supabase
                .from('broker_portal_proposals')
                .select(withUnits ? BASE_COLS + UNITS_EMBED : BASE_COLS)
                .eq('organization_id', organizationId)
                .order('created_at', { ascending: false });
            if (brokerEmail) q = q.eq('broker_email', brokerEmail);
            return q;
        };

        // `as any` porque o select é montado dinamicamente (com ou sem o embed da
        // cesta) e o parser de tipos do supabase-js não resolve string variável.
        let { data, error } = await (buildQuery(!proposalUnitsTableMissing) as any);
        if (error && noteProposalUnitsError(error)) {
            ({ data, error } = await (buildQuery(false) as any));
        }

        if (error) {
            console.error('[BROKER SERVICE] Error listing proposals:', error);
            throw error;
        }

        return ((data || []) as BrokerProposal[]).map(p => ({ ...p, units: proposalUnitsOf(p) }));
    },

    /**
     * Substitui a cesta de uma proposta: apaga as unidades que saíram e grava as
     * atuais. O simulador sempre reenvia a cesta inteira, então é replace, não merge.
     */
    async syncProposalUnits(proposalId: string, organizationId: string | undefined, units: BrokerProposalUnit[]) {
        if (proposalUnitsTableMissing) return;

        const { data: existing, error: readErr } = await supabase
            .from('broker_portal_proposal_units')
            .select('id, property_id')
            .eq('proposal_id', proposalId);
        if (readErr && noteProposalUnitsError(readErr)) return;

        const keep = new Set(units.map(u => u.property_id));
        const removed = (existing || [])
            .filter(e => !keep.has(e.property_id as string))
            .map(e => e.property_id as string);

        if (removed.length > 0) {
            await supabase
                .from('broker_portal_proposal_units')
                .delete()
                .eq('proposal_id', proposalId)
                .in('property_id', removed);
        }

        if (units.length > 0) {
            const rows = units.map((u, i) => ({
                proposal_id: proposalId,
                property_id: u.property_id,
                organization_id: organizationId || u.organization_id || null,
                unit_price: Number(u.unit_price) || 0,
                allocated_value: Number(u.allocated_value) || 0,
                is_primary: !!u.is_primary,
                sort_order: u.sort_order ?? i,
            }));
            const { error } = await supabase
                .from('broker_portal_proposal_units')
                .upsert(rows, { onConflict: 'proposal_id,property_id' });
            if (error) {
                if (noteProposalUnitsError(error)) return;
                console.error('[BROKER SERVICE] Erro ao sincronizar unidades da proposta:', error);
                throw error;
            }
        }
    },

    async saveProposal(proposal: Partial<BrokerProposal>) {
        // A cesta NÃO é coluna de broker_portal_proposals — vive em
        // broker_portal_proposal_units. Extraída antes de qualquer coisa; se
        // vazasse no payload, o PostgREST rejeitaria ("Could not find the 'units'
        // column"). Quem manda é a lista: property_id é a principal, unit_price é
        // a soma das tabelas e total_value a soma das cotas rateadas.
        const units = proposalUnitsOf(proposal);
        const primaryUnit = units.find(u => u.is_primary) || units[0];

        // Sem a tabela de itens, uma cesta seria gravada com a SOMA no header e as
        // unidades perdidas em silêncio — proposta com valor de 3 imóveis apontando
        // para 1. Falha explícita em vez de dado errado. (Uma unidade só continua
        // funcionando: o header já a representa por inteiro.)
        if (units.length > 1) {
            const { error: probeErr } = await supabase
                .from('broker_portal_proposal_units')
                .select('id')
                .limit(1);
            if (probeErr && noteProposalUnitsError(probeErr)) {
                throw new Error(
                    'Propostas com mais de uma unidade exigem a migration 20270826000010 aplicada. '
                    + 'Envie uma proposta por unidade ou aplique a migration.'
                );
            }
        }

        const withDerived = <T extends Partial<BrokerProposal>>(payload: T): T => {
            if (!primaryUnit) return payload;
            return {
                ...payload,
                property_id: primaryUnit.property_id,
                unit_price: Number(proposalUnitsTablePrice(units).toFixed(2)),
                total_value: Number(proposalUnitsAllocated(units).toFixed(2)),
            };
        };

        if (proposal.id && !proposal.id.startsWith('prop-')) {
            // Versionamento (F3): antes de alterar, guarda a versão atual em
            // revision_history e incrementa version. version/revision_history são
            // controlados aqui — o payload do caller não os define.
            const { version, revision_history, units: _units, ...clean } = proposal as Partial<BrokerProposal> & {
                version?: number; revision_history?: unknown[];
            };
            const { data: current } = await supabase
                .from('broker_portal_proposals')
                .select('version, revision_history, property_id, unit_price, discount_pct, total_value, down_payment, monthly_installments, monthly_value, balloon_value, financing_value, payment_plan, status, updated_at')
                .eq('id', proposal.id)
                .single();

            // A cesta ANTERIOR entra no snapshot. Versionar a proposta sem as
            // unidades perderia justamente o que mudou quando o corretor troca
            // uma unidade ou mexe no rateio.
            let previousUnits: unknown[] = [];
            if (!proposalUnitsTableMissing) {
                const { data: prevRows, error: prevErr } = await supabase
                    .from('broker_portal_proposal_units')
                    .select('property_id, unit_price, allocated_value, is_primary, sort_order')
                    .eq('proposal_id', proposal.id);
                if (prevErr) noteProposalUnitsError(prevErr);
                previousUnits = prevRows || [];
            }

            const prevVersion = (current?.version as number) ?? 1;
            const history = Array.isArray(current?.revision_history) ? current!.revision_history : [];
            const snapshot = current
                ? { v: prevVersion, at: current.updated_at, ...current, units: previousUnits, version: undefined, revision_history: undefined }
                : null;

            const { data, error } = await supabase
                .from('broker_portal_proposals')
                .update(withDerived({
                    ...clean,
                    version: prevVersion + 1,
                    revision_history: snapshot ? [...history, snapshot] : history,
                    updated_at: new Date().toISOString(),
                }))
                .eq('id', proposal.id)
                .select()
                .single();

            if (error) {
                console.error('[BROKER SERVICE] Error updating proposal:', error);
                throw error;
            }
            const updated = data as BrokerProposal;

            if (units.length > 0) {
                try {
                    await this.syncProposalUnits(updated.id, updated.organization_id, units);
                } catch (e) {
                    console.error('[BROKER SERVICE] Falha ao gravar unidades da proposta:', e);
                }
            }
            updated.units = units;
            return updated;
        } else {
            // Remove temporary ID if exists
            const { id, units: _u, ...payload } = proposal;
            const { data, error } = await supabase
                .from('broker_portal_proposals')
                .insert(withDerived(payload))
                .select()
                .single();

            if (error) {
                console.error('[BROKER SERVICE] Error inserting proposal:', error);
                throw error;
            }
            const saved = data as BrokerProposal;

            if (units.length > 0) {
                try {
                    await this.syncProposalUnits(saved.id, saved.organization_id, units);
                } catch (e) {
                    console.error('[BROKER SERVICE] Falha ao gravar unidades da proposta:', e);
                }
            }
            saved.units = units;

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

    // `deleteProposal` foi removida em 2026-08-26. Era código morto — nenhum
    // chamador em todo o repo — e, se alguém a tivesse usado, teria mentido:
    // `broker_portal_proposals` tem policy de SELECT, INSERT e UPDATE e NENHUMA
    // de DELETE, então o comando apagava zero linhas sem devolver erro
    // (encontrado por scripts/check-rls-delete-gap.mjs).
    //
    // Se excluir proposta virar requisito, o caminho não é ressuscitar isto:
    // é decidir entre policy de DELETE ou um `status = 'cancelada'`, e conferir
    // as linhas afetadas — como foi feito em companyService.archive() e
    // nfeService.deleteNfeInvoice().

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
