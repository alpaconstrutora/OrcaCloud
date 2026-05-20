import { supabase } from '../lib/supabase';
import { QuotationRequest, QuotationResponse } from '../types';
import { orderService } from './orderService';

export const quotationService = {
    async listRequests(projectId?: string): Promise<QuotationRequest[]> {
        let query = supabase
            .from('quotation_requests')
            .select('*, project:projects(name)')
            .order('created_at', { ascending: false });

        if (projectId) {
            query = query.eq('project_id', projectId);
        }

        const { data, error } = await query;
        if (error) throw error;

        return (data || []).map(item => ({
            id: item.id,
            number: item.number,
            projectId: item.project_id,
            projectName: item.project?.name || '-',
            title: item.title,
            description: item.description,
            deadline: item.deadline,
            status: item.status,
            items: item.items,
            invitedSupplierIds: item.invited_supplier_ids || [],
            deliveryDate: item.delivery_date,
            deliveryMethod: item.delivery_method,
            deliveryLocation: item.delivery_location,
            paymentMethod: item.payment_method,
            paymentTermType: item.payment_term_type,
            paymentDays: item.payment_days,
            paymentInstallments: item.payment_installments,
            created_at: item.created_at,
            updated_at: item.updated_at
        }));
    },

    async listRequestsForSupplier(supplierId: string): Promise<QuotationRequest[]> {
        const { data, error } = await supabase
            .from('quotation_requests')
            .select('*, project:projects(name)')
            .contains('invited_supplier_ids', [supplierId])
            .order('created_at', { ascending: false });

        if (error) throw error;

        return (data || []).map(item => ({
            id: item.id,
            number: item.number,
            projectId: item.project_id,
            projectName: item.project?.name || '-',
            title: item.title,
            description: item.description,
            deadline: item.deadline,
            status: item.status,
            items: item.items,
            invitedSupplierIds: item.invited_supplier_ids || [],
            deliveryDate: item.delivery_date,
            deliveryMethod: item.delivery_method,
            deliveryLocation: item.delivery_location,
            paymentMethod: item.payment_method,
            paymentTermType: item.payment_term_type,
            paymentDays: item.payment_days,
            paymentInstallments: item.payment_installments,
            created_at: item.created_at,
            updated_at: item.updated_at
        }));
    },

    async createRequest(request: Omit<QuotationRequest, 'id' | 'number' | 'created_at' | 'updated_at'>) {
        const number = `RFQ-${Date.now().toString().slice(-6)}`;
        const { data, error } = await supabase
            .from('quotation_requests')
            .insert({
                number,
                project_id: request.projectId,
                title: request.title,
                description: request.description,
                deadline: request.deadline,
                status: request.status || 'Aberta',
                items: request.items,
                invited_supplier_ids: request.invitedSupplierIds,
                delivery_date: request.deliveryDate || null,
                delivery_method: request.deliveryMethod,
                delivery_location: request.deliveryLocation,
                payment_method: request.paymentMethod,
                payment_term_type: request.paymentTermType,
                payment_days: request.paymentDays,
                payment_installments: request.paymentInstallments
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async updateRequest(id: string, request: Partial<QuotationRequest>) {
        const { data, error } = await supabase
            .from('quotation_requests')
            .update({
                project_id: request.projectId,
                title: request.title,
                description: request.description,
                deadline: request.deadline,
                status: request.status,
                items: request.items,
                invited_supplier_ids: request.invitedSupplierIds,
                delivery_date: request.deliveryDate || null,
                delivery_method: request.deliveryMethod,
                delivery_location: request.deliveryLocation,
                payment_method: request.paymentMethod,
                payment_term_type: request.paymentTermType,
                payment_days: request.paymentDays,
                payment_installments: request.paymentInstallments
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async listResponses(requestId: string): Promise<QuotationResponse[]> {
        const { data, error } = await supabase
            .from('quotation_responses')
            .select('*, supplier:suppliers(name)')
            .eq('request_id', requestId);

        if (error) throw error;

        return (data || []).map(item => ({
            id: item.id,
            requestId: item.request_id,
            supplierId: item.supplier_id,
            supplierName: item.supplier?.name || '-',
            items: item.items,
            deliveryDate: item.delivery_date,
            deliveryMethod: item.delivery_method,
            deliveryLocation: item.delivery_location,
            paymentMethod: item.payment_method,
            paymentTermType: item.payment_term_type,
            paymentDays: item.payment_days,
            paymentInstallments: item.payment_installments,
            status: item.status,
            negotiationStatus: item.negotiation_status || 'Original',
            counterProposal: item.counter_proposal,
            negotiationHistory: item.negotiation_history || [],
            notes: item.notes,
            created_at: item.created_at
        }));
    },

    async sendCounterProposal(responseId: string, counterProposal: NonNullable<QuotationResponse['counterProposal']>, author: 'Comprador' | 'Fornecedor' = 'Comprador') {
        // 1. Get current state for history
        const { data: resp, error: fetchError } = await supabase
            .from('quotation_responses')
            .select('*')
            .eq('id', responseId)
            .single();

        if (fetchError) throw fetchError;

        // 2. Calculate changes with robustness
        const changes: Record<string, unknown> = {};
        const itemsWithChanges = counterProposal.items.map(newItem => {
            const oldItem = resp.items?.find((oi: { code: string; unitPrice?: number; unit_price?: number }) => oi.code === newItem.code);
            // Robustness: check both camelCase and snake_case in case of legacy data
            const oldPrice = Number(oldItem?.unitPrice ?? oldItem?.unit_price ?? 0);
            const newPrice = Number(newItem.unitPrice || 0);
            if (oldPrice !== newPrice) {
                return { code: newItem.code, oldPrice, newPrice };
            }
            return null;
        }).filter(Boolean);

        if (itemsWithChanges.length > 0) changes.items = itemsWithChanges;

        // Safety check helper for value comparison
        const hasChanged = (oldVal: unknown, newVal: unknown) => {
            if (newVal === undefined || newVal === null) return false;
            return oldVal !== newVal;
        };

        if (hasChanged(resp.delivery_date, counterProposal.deliveryDate)) changes.deliveryDate = { old: resp.delivery_date, new: counterProposal.deliveryDate };
        if (hasChanged(resp.delivery_method, counterProposal.deliveryMethod)) changes.deliveryMethod = { old: resp.delivery_method, new: counterProposal.deliveryMethod };
        if (hasChanged(resp.delivery_location, counterProposal.deliveryLocation)) changes.deliveryLocation = { old: resp.delivery_location, new: counterProposal.deliveryLocation };
        if (hasChanged(resp.payment_method, counterProposal.paymentMethod)) changes.paymentMethod = { old: resp.payment_method, new: counterProposal.paymentMethod };
        if (hasChanged(resp.payment_term_type, counterProposal.paymentTermType)) changes.paymentTermType = { old: resp.payment_term_type, new: counterProposal.paymentTermType };
        if (counterProposal.paymentDays !== undefined && counterProposal.paymentDays !== resp.payment_days) changes.paymentDays = { old: resp.payment_days, new: counterProposal.paymentDays };
        if (counterProposal.paymentInstallments !== undefined && counterProposal.paymentInstallments !== resp.payment_installments) changes.paymentInstallments = { old: resp.payment_installments, new: counterProposal.paymentInstallments };

        const newEvent = {
            timestamp: new Date().toISOString(),
            action: 'Contraproposta enviada' as const,
            author: author,
            changes,
            notes: counterProposal.notes
        };

        const { error } = await supabase
            .from('quotation_responses')
            .update({
                counter_proposal: author === 'Comprador' ? counterProposal : null,
                items: author === 'Fornecedor' ? counterProposal.items : resp.items,
                delivery_date: author === 'Fornecedor' ? (counterProposal.deliveryDate || null) : resp.delivery_date,
                delivery_method: author === 'Fornecedor' ? counterProposal.deliveryMethod : resp.delivery_method,
                delivery_location: author === 'Fornecedor' ? counterProposal.deliveryLocation : resp.delivery_location,
                payment_method: author === 'Fornecedor' ? counterProposal.paymentMethod : resp.payment_method,
                payment_term_type: author === 'Fornecedor' ? counterProposal.paymentTermType : resp.payment_term_type,
                payment_days: author === 'Fornecedor' ? (counterProposal.paymentDays ?? resp.payment_days) : resp.payment_days,
                payment_installments: author === 'Fornecedor' ? (counterProposal.paymentInstallments ?? resp.payment_installments) : resp.payment_installments,
                negotiation_status: author === 'Comprador' ? 'Contraproposta' : 'Nova Proposta',
                negotiation_history: [...(resp.negotiation_history || []), newEvent],
                notes: author === 'Fornecedor' ? (counterProposal.notes || resp.notes) : resp.notes
            })
            .eq('id', responseId);

        if (error) throw error;
    },

    async respondToCounterProposal(responseId: string, accept: boolean, author: 'Comprador' | 'Fornecedor' = 'Fornecedor', notes?: string) {
        // 1. Get current response
        const { data: resp, error: fetchError } = await supabase
            .from('quotation_responses')
            .select('*')
            .eq('id', responseId)
            .single();

        if (fetchError) throw fetchError;

        if (accept) {
            const newEvent = {
                timestamp: new Date().toISOString(),
                action: 'Aceite de contraproposta' as const,
                author: author,
                changes: {}, // No changes in values, just status
                notes
            };

            // If it's the Supplier accepting a Buyer's counter proposal, we update main fields with CP values
            if (author === 'Fornecedor') {
                if (!resp.counter_proposal) throw new Error("No counter proposal found to accept");
                const cp = resp.counter_proposal;

                const updatedItems = resp.items.map((item: { code: string; quantity: number; unitPrice?: number; unit_price?: number; [key: string]: unknown }) => {
                    const counterItem = cp.items.find((ci: { code: string; unitPrice: number }) => ci.code === item.code);
                    if (counterItem) {
                        const unitPrice = counterItem.unitPrice;
                        return {
                            ...item,
                            unitPrice,
                            unit_price: unitPrice,
                            total: item.quantity * unitPrice
                        };
                    }
                    return item;
                });

                const { error: updateError } = await supabase
                    .from('quotation_responses')
                    .update({
                        items: updatedItems,
                        delivery_date: cp.deliveryDate || resp.delivery_date,
                        delivery_method: cp.deliveryMethod || resp.delivery_method,
                        delivery_location: cp.deliveryLocation || resp.delivery_location,
                        payment_method: cp.paymentMethod || resp.payment_method,
                        payment_term_type: cp.paymentTermType || resp.payment_term_type,
                        payment_days: cp.paymentDays ?? resp.payment_days,
                        payment_installments: cp.paymentInstallments ?? resp.payment_installments,
                        negotiation_status: 'Aceita',
                        negotiation_history: [...(resp.negotiation_history || []), newEvent],
                        notes: notes ? `${resp.notes || ''}\n\nAceite de contraproposta: ${notes}` : resp.notes
                    })
                    .eq('id', responseId);

                if (updateError) throw updateError;
            } else {
                // If it's the Buyer accepting a Supplier's proposal (status was 'Nova Proposta')
                // We just mark it as Aceita. The items are already in the main fields for 'Nova Proposta'
                const { error: updateError } = await supabase
                    .from('quotation_responses')
                    .update({
                        negotiation_status: 'Aceita',
                        negotiation_history: [...(resp.negotiation_history || []), newEvent],
                        notes: notes ? `${resp.notes || ''}\n\nAceite da proposta: ${notes}` : resp.notes
                    })
                    .eq('id', responseId);

                if (updateError) throw updateError;
            }
        } else {
            const newEvent = {
                timestamp: new Date().toISOString(),
                action: 'Recusa de contraproposta' as const,
                author: author,
                changes: {},
                notes
            };

            const { error: updateError } = await supabase
                .from('quotation_responses')
                .update({
                    negotiation_status: 'Recusada',
                    negotiation_history: [...(resp.negotiation_history || []), newEvent],
                    notes: notes ? `${resp.notes || ''}\n\nRecusa: ${notes}` : resp.notes
                })
                .eq('id', responseId);

            if (updateError) throw updateError;
        }
    },

    async submitResponse(response: Omit<QuotationResponse, 'id' | 'created_at'>) {
        // 1. Check if already exists
        const { data: existing } = await supabase
            .from('quotation_responses')
            .select('*')
            .eq('request_id', response.requestId)
            .eq('supplier_id', response.supplierId)
            .single();

        const initialEvent = {
            timestamp: new Date().toISOString(),
            action: existing ? 'Edição' : 'Proposta',
            author: 'Fornecedor',
            changes: existing ? {
                items: response.items.map(newItem => {
                    const oldItem = existing.items.find((oi: { code: string; unitPrice?: number }) => oi.code === newItem.code);
                    if (oldItem && oldItem.unitPrice !== newItem.unitPrice) {
                        return { code: newItem.code, oldPrice: oldItem.unitPrice, newPrice: newItem.unitPrice };
                    }
                    return null;
                }).filter(Boolean)
            } : {
                items: response.items.map(i => ({ code: i.code, oldPrice: 0, newPrice: i.unitPrice })),
                deliveryDate: { old: '', new: response.deliveryDate || '' },
                paymentMethod: { old: '', new: response.paymentMethod || '' }
            },
            notes: response.notes
        };

        // Map to DB schema
        const dbData = {
            id: existing?.id, // If it exists, use the same ID
            request_id: response.requestId,
            supplier_id: response.supplierId,
            items: response.items.map(i => ({
                code: i.code,
                description: i.description,
                unit: i.unit,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                total: i.total,
                notes: i.notes
            })),
            delivery_date: response.deliveryDate || null,
            delivery_method: response.deliveryMethod,
            delivery_location: response.deliveryLocation,
            payment_method: response.paymentMethod,
            payment_term_type: response.paymentTermType,
            payment_days: response.paymentDays,
            payment_installments: response.paymentInstallments,
            status: 'Enviada', // Always 'Enviada' on submission
            negotiation_status: response.negotiationStatus || 'Original',
            negotiation_history: existing
                ? [...(existing.negotiation_history || []), initialEvent]
                : [initialEvent],
            notes: response.notes
        };

        const { data, error } = await supabase
            .from('quotation_responses')
            .upsert(dbData)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async selectWinner(requestId: string, responseId: string) {
        // 1. Mark response as selected
        const { error: responseError } = await supabase
            .from('quotation_responses')
            .update({ status: 'Selecionada' })
            .eq('id', responseId);

        if (responseError) throw responseError;

        // 2. Mark other responses as rejected
        await supabase
            .from('quotation_responses')
            .update({ status: 'Recusada' })
            .eq('request_id', requestId)
            .neq('id', responseId);

        // 3. Mark request as Concluída
        await supabase
            .from('quotation_requests')
            .update({ status: 'Concluída' })
            .eq('id', requestId);

        // 4. Create Purchase Order
        const { data: responsesRaw } = await supabase
            .from('quotation_responses')
            .select('*, supplier:suppliers(name)')
            .eq('id', responseId)
            .single();

        const { data: requestRaw } = await supabase
            .from('quotation_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (responsesRaw && requestRaw) {
            await orderService.createOrder({
                projectId: requestRaw.project_id,
                supplierId: responsesRaw.supplier_id,
                deliveryDate: responsesRaw.delivery_date || new Date().toISOString(),
                deliveryMethod: responsesRaw.delivery_method,
                deliveryLocation: responsesRaw.delivery_location,
                status: 'Rascunho',
                paymentMethod: responsesRaw.payment_method,
                paymentTermType: responsesRaw.payment_term_type,
                paymentDays: responsesRaw.payment_days,
                paymentInstallments: responsesRaw.payment_installments,
                items: responsesRaw.items.map((item: { code: string; description: string; unit: string; quantity: number; unitPrice: number; total: number }) => ({
                    code: item.code,
                    description: item.description,
                    unit: item.unit,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    total: item.total
                })),
                notes: `Gerado a partir da cotação ${requestRaw.number}. ${responsesRaw.notes || ''}`
            });
        }
    }
};
