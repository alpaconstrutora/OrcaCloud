import { supabase } from '../lib/supabase';
import { Property, PropertyDeal, PropertyStatus } from '../types';
import { commercialFinanceService } from './commercialFinanceService';
import { projectService } from './projectService';



export const commercialService = {
    async listProperties(organizationId?: string, projectId?: string, purpose?: 'SALE' | 'RENTAL' | 'BOTH') {
        console.log('[commercialService] API Call: listProperties', { organizationId, projectId, purpose });
        let query = supabase
            .from('commercial_properties')
            .select('*')
            .order('name', { ascending: true });

        if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }

        if (projectId) {
            query = query.eq('project_id', projectId);
        }

        if (purpose && purpose !== 'BOTH') {
            query = query.eq('purpose', purpose);
        }

        const { data, error } = await query;
        if (error) throw error;
        return (data || []) as Property[];
    },

    async saveProperty(property: Partial<Property>) {
        // Enforce uppercase for block names
        if (property.block) {
            property.block = property.block.toUpperCase();
        }

        if (property.id) {
            const { data, error } = await supabase
                .from('commercial_properties')
                .update(property)
                .eq('id', property.id)
                .select()
                .single();

            if (error) throw error;
            return data as Property;
        } else {
            // Remover 'id' do payload de INSERT para garantir que o banco gere via DEFAULT gen_random_uuid()
            const { id: _ignoredId, ...insertPayload } = property;
            const { data, error } = await supabase
                .from('commercial_properties')
                .insert(insertPayload)
                .select()
                .single();

            if (error) throw error;
            return data as Property;
        }
    },

    async savePropertiesBatch(properties: Partial<Property>[]) {
        // Separar itens com ID (existentes → upsert) dos sem ID (novos → insert)
        // O upsert do Supabase não aceita misturar itens com e sem a coluna de conflito (id).
        // Itens sem 'id' passados no upsert geram null no payload JSON → viola NOT NULL.
        const toUpdate: any[] = [];
        const toInsert: any[] = [];

        for (const p of properties) {
            const { id, block, ...rest } = p;
            const entry: any = {
                ...rest,
                block: block ? block.toUpperCase() : block
            };

            if (id) {
                entry.id = id;
                toUpdate.push(entry);
            } else {
                // Não incluir 'id' → banco gera via DEFAULT gen_random_uuid()
                toInsert.push(entry);
            }
        }

        let allResults: Property[] = [];

        // 1. Upsert dos existentes (com id)
        if (toUpdate.length > 0) {
            const { data, error } = await supabase
                .from('commercial_properties')
                .upsert(toUpdate)
                .select();
            if (error) throw error;
            allResults = allResults.concat((data || []) as Property[]);
        }

        // 2. Insert dos novos (sem id — banco gera UUID automaticamente)
        if (toInsert.length > 0) {
            const { data, error } = await supabase
                .from('commercial_properties')
                .insert(toInsert)
                .select();
            if (error) throw error;
            allResults = allResults.concat((data || []) as Property[]);
        }

        return allResults;
    },

    async updatePropertiesBatch(ids: string[], updates: Partial<Property>) {
        const { data, error } = await supabase
            .from('commercial_properties')
            .update(updates)
            .in('id', ids)
            .select();

        if (error) throw error;
        return data as Property[];
    },

    async deleteProperty(id: string) {
        // Now handled by database-level ON DELETE CASCADE on parent_id
        const { error } = await supabase
            .from('commercial_properties')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    async listDeals(propertyId?: string) {
        let query = supabase
            .from('commercial_deals')
            .select('*')
            .order('date', { ascending: false });

        if (propertyId) {
            query = query.eq('property_id', propertyId);
        }

        const { data, error } = await query;
        if (error) throw error;
        return (data || []) as PropertyDeal[];
    },

    async saveDeal(deal: Partial<PropertyDeal>) {
        let result: PropertyDeal;

        // Remove virtual fields before DB operation
        const { custom_installments, ...dbPayload } = deal;

        Object.keys(dbPayload).forEach(key => {
            if (dbPayload[key as keyof typeof dbPayload] === "") {
                delete dbPayload[key as keyof typeof dbPayload];
            }
        });

        // Force organization_id from property if available to ensure consistency
        // This prevents deals being saved in the wrong organization (like Alpa Principal instead of Alpa Projetos)
        if (dbPayload.property_id) {
            try {
                const { data: propData } = await supabase.from('commercial_properties').select('organization_id').eq('id', dbPayload.property_id).single();
                if (propData && propData.organization_id) {
                    dbPayload.organization_id = propData.organization_id;
                }
            } catch (e) {
                console.error('[COMMERCIAL SERVICE] Error fetching property org for consistency:', e);
            }
        }

        if (deal.id) {
            // 1.1 — Ao avançar para RESERVA (ou WAITING_PAYMENT legacy), verifica se a unidade
            // ainda está disponível (outro deal pode ter reservado no intervalo)
            if ((dbPayload.status === 'RESERVA' || dbPayload.status === 'WAITING_PAYMENT') && dbPayload.property_id) {
                const { data: prop } = await supabase
                    .from('commercial_properties')
                    .select('status')
                    .eq('id', dbPayload.property_id)
                    .single();
                if (prop && prop.status !== 'AVAILABLE' && prop.status !== 'RESERVED') {
                    throw new Error(`Unidade não disponível para reserva (status atual: ${prop.status}). Verifique se já foi vendida ou alugada.`);
                }
                // Também verifica se há outro deal ativo (não este) para a mesma unidade
                const { data: otherDeals } = await supabase
                    .from('commercial_deals')
                    .select('id, status')
                    .eq('property_id', dbPayload.property_id)
                    .neq('id', deal.id)
                    .neq('status', 'CANCELLED');
                if (otherDeals && otherDeals.length > 0) {
                    throw new Error('Já existe outro contrato ativo para esta unidade. Cancele-o antes de reservar.');
                }
            }

            const { data, error } = await supabase
                .from('commercial_deals')
                .update(dbPayload)
                .eq('id', deal.id)
                .select()
                .single();

            if (error) {
                console.error('[COMMERCIAL SERVICE] Error updating deal:', error);
                throw error;
            }
            result = data as PropertyDeal;
        } else {
            // REGRA: Unicidade de Unidade (Uma Unidade, Uma Venda Ativa)
            if (dbPayload.property_id && (dbPayload.type === 'SALE' || dbPayload.type === 'RENTAL')) {
                const { data: existingDeals } = await supabase
                    .from('commercial_deals')
                    .select('id, status')
                    .eq('property_id', dbPayload.property_id)
                    .neq('status', 'CANCELLED');

                if (existingDeals && existingDeals.length > 0) {
                    throw new Error('Já existe um contrato ativo para esta unidade. Cancele o contrato atual antes de cadastrar um novo.');
                }
            }

            const { data, error } = await supabase
                .from('commercial_deals')
                .insert(dbPayload)
                .select()
                .single();

            if (error) {
                console.error('[COMMERCIAL SERVICE] Error inserting deal:', error);
                throw error;
            }
            result = data as PropertyDeal;
        }

        // Estágios que reservam a unidade (impede venda duplicada)
        const RESERVA_STATUSES = ['WAITING_PAYMENT', 'RESERVA', 'CONTRATO', 'ASSINATURA'];

        // Trigger financial sync if completed OR any reservation stage
        if (result.status === 'COMPLETED' || RESERVA_STATUSES.includes(result.status)) {
            try {
                // Atualizar status do imóvel se estiver configurado o vinculamento no negócio
                if (result.property_id && result.client_id && result.type !== 'SERVICE') {
                    const propertyUpdates: Partial<Property> = {
                        status: result.status === 'COMPLETED'
                            ? (result.type === 'SALE' ? PropertyStatus.SOLD : PropertyStatus.RENTED)
                            : PropertyStatus.RESERVED,
                        client_id: result.client_id
                    };
                    await this.saveProperty({ id: result.property_id, ...propertyUpdates });
                    console.log(`[COMMERCIAL SERVICE] Property ${result.property_id} status updated to ${propertyUpdates.status} (Deal: ${result.status})`);
                }

                // Fallback: PostgREST cache delay might strip new columns from the RETURNING clause.
                const finalDealToSync = {
                    ...result,
                    payment_method: deal.payment_method || result.payment_method,
                    down_payment: deal.down_payment !== undefined ? deal.down_payment : result.down_payment,
                    installments: deal.installments || result.installments,
                    custom_installments: custom_installments,
                    linked_project_id: deal.linked_project_id || (result as any).linked_project_id
                };

                // 0.1 — passa organization_id explicitamente para evitar vazamento cross-tenant
                const orgId = result.organization_id || dbPayload.organization_id;
                if (!orgId) throw new Error('[COMMERCIAL SERVICE] organization_id ausente — impossível sincronizar financeiro.');
                const syncResult = await commercialFinanceService.syncDealToFinance(finalDealToSync, orgId);
                
                // PERSISTÊNCIA IMEDIATA: Gravar as parcelas calculadas no cofre financeiro
                // Antes, o resultado do syncDealToFinance era descartado, e o Global Sync posterior
                // (com isGlobalSync=true) preservava parcelas antigas em vez de usar as novas.
                if (syncResult && syncResult.commercialProject) {
                    const { installments, transactions, commercialProject: targetProject } = syncResult;
                    const updatedSettings = {
                        ...targetProject.settings,
                        financialInfo: {
                            ...(targetProject.settings?.financialInfo || {}),
                            installments,
                            transactions
                        }
                    };
                    await projectService.saveProject({
                        ...targetProject,
                        settings: updatedSettings
                    });
                    console.log(`[COMMERCIAL SERVICE] Financial sync PERSISTED: ${installments.length} installments saved to Vault`);
                }
            } catch (err) {
                console.error('[COMMERCIAL SERVICE] Sync or Property update failed:', err);
            }
        } else if (result.status === 'CANCELLED') {
            // 1.3 — Distrato: reverte unidade + estorna parcelas pendentes do vault financeiro
            const cancelOrgId = result.organization_id || dbPayload.organization_id;
            await Promise.allSettled([
                // (a) Libera a unidade no espelho
                result.property_id
                    ? supabase.from('commercial_properties')
                        .update({ status: 'AVAILABLE', client_id: null })
                        .eq('id', result.property_id)
                        .then(() => console.log(`[COMMERCIAL SERVICE] Property ${result.property_id} reverted to AVAILABLE (distrato)`))
                    : Promise.resolve(),
                // (b) Estorna parcelas pendentes do vault (deleteDealInstallments ignora PAID, remove PENDING)
                cancelOrgId
                    ? commercialFinanceService.deleteDealInstallments(result.id, cancelOrgId)
                        .then(() => console.log(`[COMMERCIAL SERVICE] Installments reversed for deal ${result.id} (distrato)`))
                    : Promise.resolve(),
            ]);
        }

        return result;
    },

    async deleteDeal(id: string) {
        // 1. Fetch deal to get details for cleanup
        const { data: deal } = await supabase
            .from('commercial_deals')
            .select('*')
            .eq('id', id)
            .single();

        if (deal) {
            // 2. Cleanup installments (this will throw if any are PAID)
            await commercialFinanceService.deleteDealInstallments(id, deal.organization_id);

            // Revert property status to AVAILABLE
            if (deal.property_id) {
                await supabase.from('commercial_properties').update({ status: 'AVAILABLE', client_id: null }).eq('id', deal.property_id);
            }
        }

        // 3. Delete the deal
        const { error } = await supabase
            .from('commercial_deals')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    async uploadPropertyImage(propertyId: string, file: File) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${propertyId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('properties')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
            .from('properties')
            .getPublicUrl(filePath);

        return publicUrl;
    },

    async updateUnitsAddress(parentId: string, updates: Partial<Property>) {
        const { error } = await supabase
            .from('commercial_properties')
            .update(updates)
            .eq('parent_id', parentId);

        if (error) throw error;
    },

    async deleteUnitsByParentId(parentId: string) {
        const { error } = await supabase
            .from('commercial_properties')
            .delete()
            .eq('parent_id', parentId);

        if (error) throw error;
    }
};
