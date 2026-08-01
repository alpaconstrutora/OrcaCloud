import { supabase } from '../lib/supabase';
import { PropertyDeal, ProjectSettings, PaymentInstallment, FinancialTransaction } from '../types';
import { projectService } from './projectService';
import { brokerService } from './brokerService';
import { dealInstallmentService, toPaymentInstallment } from './dealInstallmentService';

// Supabase project row as returned by .select('id, name, settings') / .select('*')
interface CommercialProjectRow {
    id: string;
    name: string;
    settings: ProjectSettings & { organizationId?: string };
    isVirtual?: boolean;
    created_at?: string;
}

export const commercialFinanceService = {
    /**
     * Sincroniza uma negociação com o cofre financeiro de uma organização específica.
     * Retorna os dados atualizados para acumulação em lote (Operação Átomo).
     * @param deal A venda vinda do comercial
     * @param targetOrganizationId ID da organização onde os dados devem ser salvos
     * @param currentSettings Configurações atuais do projeto (para acumulação sequencial)
     */
    async syncDealToFinance(deal: PropertyDeal, targetOrganizationId: string, currentSettings?: ProjectSettings, isGlobalSync: boolean = false) {
        if (!targetOrganizationId) throw new Error('[COMMERCIAL-FINANCE] organizationId obrigatório — acesso cross-tenant não permitido');
        // Garante que o deal pertence à org solicitada
        if (deal.organization_id && deal.organization_id !== targetOrganizationId) {
            throw new Error(`[COMMERCIAL-FINANCE] Cross-tenant bloqueado: deal ${deal.id} pertence à org ${deal.organization_id}, não ${targetOrganizationId}`);
        }
        const orgToUse = targetOrganizationId;

        // ⚠️ SÉRIE ÚNICA (2026-08-01): negócio cujas parcelas já vivem em
        // `deal_installments` NUNCA é materializado por aqui. Sem este guard, o
        // `syncAllOrganizationDeals` — disparado ao abrir a Conciliação Bancária
        // e o Financeiro do projeto — republicaria em Contas a Receber tudo o
        // que o usuário tirou de lá pelo botão "Remover do Contas a Receber".
        // Publicar é ação explícita: dealInstallmentService.publishToReceivables.
        if (await dealInstallmentService.hasRows(deal.id)) {
            console.log(`[COMMERCIAL-FINANCE] Skip: Deal #${deal.id.substring(0, 8)} usa a série única (deal_installments).`);
            return null;
        }

        console.log(`[COMMERCIAL-FINANCE] Processing Deal #${deal.id} for Org: ${orgToUse}`);

        // DEVE bater com FINANCIAL_STATUSES de commercialService.saveDeal — antes as duas
        // listas divergiam (faltavam RESERVA/CONTRATO/ASSINATURA aqui), então negócios
        // nessas etapas eram chamados pelo saveDeal e rejeitados aqui, sem gerar recebível.
        const allowedStatuses = ['COMPLETED', 'PENDING', 'APPROVED', 'WAITING_PAYMENT', 'RESERVA', 'CONTRATO', 'ASSINATURA'];
        if (!allowedStatuses.includes(deal.status || '')) {
            console.log(`[COMMERCIAL-FINANCE] Skip: Invalid status "${deal.status}"`);
            return null;
        }

        // 1. Localizar o Projeto de destino (Vault)
        let commercialProject = await this.getOrCreateCommercialProject(orgToUse);
        if (!commercialProject) throw new Error('Falha ao localizar/criar projeto Vault');

        // Se estivermos salvando ativamente (comercial -> financeiro), limpamos vestígios globais primeiro.
        // Isso evita duplicidades se o deal foi movido de organização ou existe em projetos órfãos.
        const globalStates: PaymentInstallment[] = [];
        if (!isGlobalSync) {
            console.log(`[COMMERCIAL-FINANCE] Omniscient Purge for Deal #${deal.id.substring(0,8)}...`);
            const { data: allProj } = await supabase.from('projects').select('settings')
                .eq('name', 'Gestão Comercial')
                .filter('settings->>organizationId', 'eq', orgToUse);
            allProj?.forEach(p => {
                const insts: PaymentInstallment[] | undefined = (p.settings as ProjectSettings)?.financialInfo?.installments;
                if (insts) {
                    const matches = insts.filter(i => i.dealId === deal.id || (i.description || '').includes(deal.id.substring(0, 8)));
                    globalStates.push(...matches);
                }
            });

            // Executamos a purga física global
            await this.deleteDealInstallments(deal.id, orgToUse);
            
            // Recarregamos o projeto alvo (que agora deve estar limpo deste deal)
            commercialProject = await this.getOrCreateCommercialProject(orgToUse);
        }

        // Se passarmos o settings atual (em loop), usamos ele. Senão, carregamos do projeto.
        const settings = currentSettings || (commercialProject.settings as ProjectSettings);
        const info = settings.financialInfo || { totalValue: 0, installments: [], transactions: [] };
        
        // Unificar estados para soberania (locais + capturados globalmente antes da purga)
        const allExistingInstallments = [...(info.installments || []), ...globalStates];


        let clientName = 'Indefinido';
        let propertyName = 'Indefinido';
        let propertyNumber = '';

        try {
            if (deal.client_id) {
                const { data: clientData } = await supabase.from('clients').select('name').eq('id', deal.client_id).single();
                if (clientData) clientName = clientData.name;
            }
            if (deal.property_id) {
                const { data: propData } = await supabase.from('commercial_properties').select('name, number').eq('id', deal.property_id).single();
                if (propData) {
                    propertyName = propData.name;
                    propertyNumber = propData.number || propData.name;
                }
            }
        } catch (e) { console.error('Error fetching ref names:', e); }

        // Um contrato pode reunir várias unidades (apto + vaga + box). O rateio
        // por unidade fica na tabela commercial_deal_units; aqui basta o rótulo
        // completo — a cobrança continua sendo UMA série de parcelas sobre o total.
        let propertyIds: string[] = deal.property_id ? [deal.property_id] : [];
        let propertyNames = propertyName;
        try {
            const { data: unitRows } = await supabase
                .from('commercial_deal_units')
                .select('property_id, is_primary')
                .eq('deal_id', deal.id);
            if (unitRows && unitRows.length > 0) {
                propertyIds = unitRows.map(u => u.property_id as string);
                const { data: props } = await supabase
                    .from('commercial_properties')
                    .select('id, name')
                    .in('id', propertyIds);
                const nameById = new Map((props || []).map(p => [p.id as string, (p.name as string) || '']));
                propertyNames = propertyIds.map(id => nameById.get(id) || '').filter(Boolean).join(' + ') || propertyName;
            }
        } catch (e) { console.error('Error fetching deal units:', e); }

        const metadata = {
            dealId: deal.id,
            dealType: deal.type,
            clientId: deal.client_id,
            clientName,
            // Unidade principal — mantida para não quebrar os consumidores legados
            // que leem metadata.propertyId (BI, Conciliação, Portal do Cliente).
            propertyId: deal.property_id,
            propertyName,
            /** Todas as unidades do contrato. */
            propertyIds,
            /** Rótulo concatenado ("Apto 101 + Vaga 12"). */
            propertyNames,
            linkedProjectId: deal.linked_project_id,
            // Dimensões contábeis do CABEÇALHO (aba Forma de Pagamento). Ficam no
            // metadata de propósito: assim as três formas de gerar parcelas
            // (customizadas, cronograma padrão e a Entrada) herdam sem repetição,
            // e o espelho em internal_transactions as encontra no mesmo lugar.
            // Não são editáveis por parcela — na aba Parcelas são só leitura.
            costCenterId: deal.cost_center_id ?? null,
            planoDeContasId: deal.plano_de_contas_id ?? null
        };

        // 2. RECUPERAR LANÇAMENTOS EXISTENTES NO LOTE ATUAL
        const currentInstallments = info.installments || [];
        const currentTransactions = info.transactions || [];
        // 2B. ISOLAR LANÇAMENTOS
        // 2B. ISOLAR LANÇAMENTOS DO CONTRATO ATUAL PARA SUBSTITUIÇÃO
        // Esta é a parte crítica para evitar duplicidade: identificamos TUDO que pertence a este Deal
        const isDealInstallment = (i: PaymentInstallment): boolean => {
            const shortId = deal.id.substring(0, 8);
            return i.dealId === deal.id || (i.description || '').includes(`Deal #${shortId}`) || (i.id || '').includes(shortId);
        };

        const thisDealInstallments = currentInstallments.filter(isDealInstallment);

        // PURGA: Removemos TUDO do deal atual do lote original.
        // O que sobrar (otherInstallments) sāo parcelas de OUTRAS negociações que devem ser preservadas.
        const otherInstallments = currentInstallments.filter(i => !isDealInstallment(i));

        const newInstallments: PaymentInstallment[] = [];

        const getStatus = (id: string, value: number, description: string, defStatus: string) => {
            const ex = allExistingInstallments.find((oi: PaymentInstallment) =>
                oi.id === id ||
                (Math.abs(oi.value - value) < 0.01 && oi.description === description) ||
                (oi.dealId === deal.id && (oi.description || '').includes(description.substring(0, 15)))
            );
            return ex ? { status: ex.status, paymentDate: ex.paymentDate } : { status: defStatus, paymentDate: undefined };
        };

        // 4. Lógica de Geração Não Destrutiva (Soberania Customizada)
        if (isGlobalSync && thisDealInstallments.length > 0) {
            // CASO 1: Sincronia Global de um contrato que JÁ ESTÁ NO COFRE.
            // Preservamos o histórico (parcelas customizadas, quebras manuais, edições do financeiro).
            // O Global Sync atua apenas como corretor de conectividade (metadata) e detector de calotes (cancelamentos).
            console.log(`[COMMERCIAL-FINANCE] Preserving ${thisDealInstallments.length} established installments for Deal #${deal.id.substring(0,8)}`);
            thisDealInstallments.forEach((ex: PaymentInstallment) => {
                newInstallments.push({
                    ...ex,
                    ...metadata,
                    status: (deal.status === 'CANCELLED' || deal.status === 'IN_NEGOTIATION') ? 'CANCELLED' : ex.status
                });
            });
        } 
        else if (deal.custom_installments && deal.custom_installments.length > 0) {
            // CASO 2: Salvamento Ativo do Comercial COM Cronograma Customizado (ex: Waldir 36 parcelas flexíveis)
            const downPayment = deal.down_payment || 0;
            
            // Adicionar Sinal/Entrada se houver (o custom_installments não inclui a entrada, apenas as parcelas)
            if (downPayment > 0) {
                const dpId = `tx-${deal.id}-dp`;
                const dpDesc = `Receita: ${deal.type === 'SALE' ? 'Venda' : 'Aluguel'} - Sinal (Entrada)`;
                const sd = getStatus(dpId, downPayment, dpDesc, 'PENDING');
                newInstallments.push({
                    id: dpId,
                    description: dpDesc,
                    dueDate: deal.date || new Date().toISOString().split('T')[0],
                    value: Number(downPayment.toFixed(2)),
                    status: sd.status as PaymentInstallment['status'],
                    paymentDate: sd.paymentDate,
                    paymentType: deal.down_payment_payment_type,
                    installmentType: deal.down_payment_installment_type,
                    notes: deal.down_payment_notes,
                    ...metadata
                });
            }
            
            console.log(`[COMMERCIAL-FINANCE] Saving ${deal.custom_installments.length} CUSTOM installments${downPayment > 0 ? ' + Entrada' : ''} for Deal #${deal.id.substring(0,8)}`);
            deal.custom_installments.forEach((custom: PaymentInstallment, idx: number) => {
                const sd = getStatus(custom.id, custom.value, custom.description, custom.status);
                newInstallments.push({
                    ...custom,
                    ...metadata,
                    paymentDate: sd.paymentDate,
                    status: sd.status as PaymentInstallment['status'],
                    // id original vem de DealModal como `temp-${Date.now()}-${i}` — não embute
                    // o dealId, então uma parcela customizada excluída junto com o negócio é
                    // impossível de achar/limpar depois (deleteDealInstallments casa por
                    // 'tx-{dealId}-%'). Reescreve para um id estável e rastreável ao deal.
                    // getStatus acima já casa por value+description além do id, então preserva
                    // status/paymentDate de execuções anteriores mesmo trocando o id agora.
                    id: `tx-${deal.id}-custom-p${idx + 1}`
                });
            });
        }
        else {
            // CASO 3: Resoluçāo Matemática Crua (Contrato simples ou Novo via DB)
            const installments = deal.installments || 0;
            const downPayment = deal.down_payment || 0;
            const installmentValue = installments > 0 ? (deal.value - (deal.type === 'RENTAL' ? 0 : downPayment)) / installments : 0;

            console.log(`[COMMERCIAL-FINANCE] Generating standard schedule for Deal #${deal.id.substring(0,8)} (DP: ${downPayment}, Inst: ${installments})`);

            // Adicionar Sinal
            if (downPayment > 0) {
                const id = `tx-${deal.id}-dp`;
                const desc = `Receita: ${deal.type === 'SALE' ? 'Venda' : 'Aluguel'} - Sinal (Entrada) - Deal #${deal.id.substring(0, 8)}`;
                const sd = getStatus(id, downPayment, desc, 'PENDING');
                newInstallments.push({ id, description: desc, dueDate: deal.date || new Date().toISOString().split('T')[0], value: Number(downPayment.toFixed(2)), status: sd.status as PaymentInstallment['status'], paymentDate: sd.paymentDate, paymentType: deal.down_payment_payment_type, installmentType: deal.down_payment_installment_type, notes: deal.down_payment_notes, ...metadata });
            }

            // Adicionar Parcelas Regulares
            if (installments > 0) {
                for (let i = 1; i <= installments; i++) {
                    const id = `tx-${deal.id}-p${i}`;
                    const date = new Date(deal.date || Date.now());
                    date.setMonth(date.getMonth() + i);
                    const desc = `Receita: ${deal.type === 'SALE' ? 'Venda' : 'Aluguel'} - Parcela ${i}/${installments} - Deal #${deal.id.substring(0, 8)}`;
                    const sd = getStatus(id, installmentValue, desc, 'PENDING');
                    newInstallments.push({ ...metadata, id, description: desc, dueDate: date.toISOString().split('T')[0], value: Number(installmentValue.toFixed(2)), status: sd.status as PaymentInstallment['status'],paymentDate: sd.paymentDate });
                }
            }
        }

        const updatedInstallments = [...newInstallments, ...otherInstallments];
        const updatedTransactions = [...currentTransactions]; // Mantendo transactions por enquanto

        return {
            installments: updatedInstallments,
            transactions: updatedTransactions,
            commercialProject,
            clientName,
            propertyNumber
        };
    },

    async getOrCreateCommercialProject(organizationId: string) {
        if (!organizationId) throw new Error('[COMMERCIAL-FINANCE] organizationId obrigatório — acesso cross-tenant não permitido');
        // 1. Tenta localizar projetos vinculados a esta org
        const query = supabase
            .from('projects')
            .select('id, name, settings, budget')
            .eq('name', 'Gestão Comercial')
            .filter('settings->>organizationId', 'eq', organizationId);

        const { data: projects, error } = await query.order('created_at', { ascending: false });

        if (error) {
            console.error('[COMMERCIAL-FINANCE] Error searching for isolated project:', error);
        }

        // Nota: o branch antigo "global view" foi removido (Fase 0.1 Gestão de Vendas)
        // — consolidava parcelas de TODOS os tenants quando organizationId era omitido,
        // o que vazava dados cross-tenant. Agora organizationId é obrigatório.

        if (projects && projects.length > 0) {
            const candidate = projects[0];
            // Executa limpeza de órfãos para garantir integridade
            return await this.cleanupOrphanedInstallments(candidate);
        }

        // 2. [RECUPERAÇÃO] Se não achou projeto isolado, procura por um projeto órfão (sem org) que TENHA dados (parcelas)
        // Isso recupera os dados legados que estavam sendo compartilhados indevidamente
        const { data: orphanedProjects } = await supabase
            .from('projects')
            .select('id, name, settings, budget')
            .eq('name', 'Gestão Comercial');

        if (orphanedProjects && orphanedProjects.length > 0) {
            // Filtra o que não tem organização vinculada no settings
            const bestCandidate = orphanedProjects.find((p: CommercialProjectRow) => {
                const info = p.settings?.financialInfo;
                const hasInstallments = info && info.installments && info.installments.length > 0;
                const isOrphan = !p.settings?.organizationId;
                return hasInstallments && isOrphan;
            });

            if (bestCandidate && organizationId) {
                console.log(`[COMMERCIAL-FINANCE] Recovering orphaned project ${bestCandidate.id} for Org ${organizationId}`);
                // Adota o projeto: vincula à organização atual
                const updated = await projectService.saveProject({
                    ...bestCandidate,
                    settings: {
                        ...bestCandidate.settings,
                        organizationId
                    }
                });
                return updated;
            }
        }

        // 3. Criar novo projeto de sistema para finanças comerciais se nada for encontrado
        console.log('[COMMERCIAL-FINANCE] Creating New isolated Commercial Management project...');
        return await projectService.saveProject({
            name: 'Gestão Comercial',
            budget: [],
            settings: {
                name: 'Gestão Comercial',
                location: 'Sistema',
                standard: 'Vendas',
                area: 0,
                cubRate: 0,
                bdi: 0,
                ls: 0,
                wbs: [],
                database: 'Própria',
                referenceMonth: new Date().toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' }),
                socialChargesMode: 'Nenhum',
                classification: 'OBRA',
                isSystemProject: true,
                organizationId, // Isola o novo projeto
                financialInfo: {
                    totalValue: 0,
                    paymentMethod: 'Variavel',
                    installments: [],
                    transactions: []
                }
            }
        });
    },

    /**
     * Visão consolidada (somente leitura) do Vault Comercial de "Todas as
     * Organizações". Reconstrói a antiga "Global View" (removida no commit
     * dbf5f12 por vazar dados de QUALQUER tenant do sistema — a busca era
     * `.eq('name', 'Gestão Comercial')` sem filtro de organização nenhum),
     * mas agora escopada explicitamente à lista de organizações que o
     * usuário chamador de fato pertence (`userOrganizationIds`, vinda de
     * useStore().organizations no front — nunca uma varredura livre da
     * tabela). Cada projeto "Gestão Comercial" fora dessa lista nunca é
     * lido, então não há como um usuário ver dados de uma organização à
     * qual não pertence.
     *
     * Retorna um "projeto virtual" (isVirtual: true) com installments e
     * transactions mesclados e deduplicados — cada item carrega
     * sourceProjectId para permitir "save-through" ao vault real de origem
     * (ProjectFinancialManager já sabe fazer isso).
     */
    async getConsolidatedVault(userOrganizationIds: string[]) {
        if (!userOrganizationIds || userOrganizationIds.length === 0) {
            return null;
        }

        const { data: projects, error } = await supabase
            .from('projects')
            .select('id, name, settings, budget, organization_id')
            .eq('name', 'Gestão Comercial')
            .in('organization_id', userOrganizationIds)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[COMMERCIAL-FINANCE] Error consolidating vaults:', error);
            return null;
        }

        if (!projects || projects.length === 0) return null;

        if (projects.length === 1) {
            return await this.cleanupOrphanedInstallments(projects[0] as CommercialProjectRow);
        }

        console.log(`[COMMERCIAL-FINANCE] Consolidating ${projects.length} commercial vaults (organizações do usuário) for "Todas as Organizações".`);

        const consolidatedInstallments: (PaymentInstallment & { sourceProjectId?: string })[] = [];
        const consolidatedTransactions: (Record<string, unknown> & { sourceProjectId?: string })[] = [];

        for (const p of projects) {
            const cleanedP = await this.cleanupOrphanedInstallments(p as CommercialProjectRow);

            const info = cleanedP.settings?.financialInfo;
            if (!info) continue;

            if (info.installments) {
                info.installments.forEach((i: PaymentInstallment) => {
                    // Deduplicação por "biometria" do lançamento (dealId + descrição normalizada + valor),
                    // já que o mesmo negócio pode ter sido salvo em contratos/vaults diferentes.
                    const descr = i.description || 'sem-titulo';
                    const normalizedDescr = descr
                        .replace(/^Receita: (Venda|Aluguel) - /, '')
                        .replace(/ - Deal #.{8}$/, '')
                        .trim();
                    const compositeKey = `${i.dealId || 'manual'}-${normalizedDescr}-${i.value}`;

                    const existingIndex = consolidatedInstallments.findIndex(existing => {
                        const existDescr = (existing.description || 'sem-titulo')
                            .replace(/^Receita: (Venda|Aluguel) - /, '')
                            .replace(/ - Deal #.{8}$/, '')
                            .trim();
                        const existingKey = `${existing.dealId || 'manual'}-${existDescr}-${existing.value}`;
                        return existingKey === compositeKey;
                    });

                    if (existingIndex === -1) {
                        consolidatedInstallments.push({ ...i, sourceProjectId: cleanedP.id });
                    } else if (i.status === 'PAID' && consolidatedInstallments[existingIndex].status !== 'PAID') {
                        consolidatedInstallments[existingIndex] = { ...i, sourceProjectId: cleanedP.id };
                    }
                });
            }

            if (info.transactions) {
                info.transactions.forEach((t: Record<string, unknown>) => {
                    const compositeKey = `${t['dealId'] || 'manual'}-${t['title']}-${t['value']}-${t['date']}`;
                    const alreadyExists = consolidatedTransactions.some(existing => {
                        const existingKey = `${existing['dealId'] || 'manual'}-${existing['title']}-${existing['value']}-${existing['date']}`;
                        return existingKey === compositeKey;
                    });
                    if (!alreadyExists) {
                        consolidatedTransactions.push({ ...t, sourceProjectId: cleanedP.id });
                    }
                });
            }
        }

        return {
            ...projects[0],
            isVirtual: true,
            settings: {
                ...projects[0].settings,
                organizationId: undefined,
                financialInfo: {
                    ...projects[0].settings.financialInfo,
                    installments: consolidatedInstallments,
                    transactions: consolidatedTransactions,
                },
            },
        };
    },

    /**
     * Sincroniza todas as negociações finalizadas de uma organização.
     * Útil para recuperar dados históricos ou forçar atualização total.
     */
    async syncAllOrganizationDeals(organizationId: string) {
        if (!organizationId) throw new Error('[COMMERCIAL-FINANCE] organizationId obrigatório — acesso cross-tenant não permitido');
        console.log(`[COMMERCIAL-FINANCE] Starting batch sync for Org ${organizationId}`);

        // 1. Listar todas as negociações finalizadas da organização
        const query = supabase
            .from('commercial_deals')
            .select('id, organization_id, property_id, client_id, linked_project_id, type, value, status, date, contract_number, notes, payment_method, installments, installment_value, down_payment, payment_due_date, broker_id, broker_name, broker_commission_pct, broker_commission_value, broker_payment_due_date, broker_payment_method, custom_installments, signature_token, signature_status, signature_url, signature_completed_at, signed_contract_url, cancellation_reason, cancellation_date, cancellation_refund_amount, created_at')
            .eq('status', 'COMPLETED')
            .eq('organization_id', organizationId);

        const { data: deals, error } = await query;
        if (error) {
            console.error('[COMMERCIAL-FINANCE] Error fetching deals for sync:', error);
            throw error;
        }

        if (!deals || deals.length === 0) {
            console.log('[COMMERCIAL-FINANCE] No completed deals found to sync.');
            return 0;
        }

        console.log(`[COMMERCIAL-FINANCE] Found ${deals.length} deals to sync.`);

        // 2. Sincronizar uma por uma (o service lida com a centralização no projeto correto)
        let successCount = 0;
        for (const deal of deals) {
            try {
                await this.syncDealToFinance(deal, organizationId);
                successCount++;
            } catch (err) {
                console.error(`[COMMERCIAL-FINANCE] Failed to sync deal ${deal.id}:`, err);
            }
        }

        return successCount;
    },

    /**
     * Verifica se existem parcelas já pagas para uma determinada negociação.
     * Útil para bloquear a regeração de cronogramas que já tiveram movimentação financeira.
     */
    /**
     * Verifica se existem parcelas já pagas para uma determinada negociação.
     * Varredura global em todos os cofres comerciais da base para máxima segurança.
     */
    async hasPaidInstallments(dealId: string, organizationId: string): Promise<{ hasPaid: boolean, paidCount: number }> {
        if (!organizationId) throw new Error('[COMMERCIAL-FINANCE] organizationId obrigatório — acesso cross-tenant não permitido');
        try {
            console.log(`[COMMERCIAL-FINANCE] Auditing paid installments for Deal ${dealId} (Org: ${organizationId})`);

            // Série única primeiro (fonte da verdade); vault só como legado.
            const rows = await dealInstallmentService.listByDeal(dealId, organizationId);
            if (rows.length > 0) {
                const pagas = rows.filter(r => r.settlementStatus === 'RECEBIDA').length;
                return { hasPaid: pagas > 0, paidCount: pagas };
            }

            // 1. Carregar projetos de Gestão Comercial da organização
            const { data: projects, error } = await supabase
                .from('projects')
                .select('id, settings')
                .eq('name', 'Gestão Comercial')
                .filter('settings->>organizationId', 'eq', organizationId);

            if (error || !projects) return { hasPaid: false, paidCount: 0 };

            const shortId = (dealId || '').substring(0, 8);
            let totalPaid = 0;

            // 2. Vasculhar cada projeto
            for (const p of projects) {
                const installments = p.settings?.financialInfo?.installments;
                if (!installments || !Array.isArray(installments)) continue;

                const dealInstallments = installments.filter((i: PaymentInstallment) => {
                    const isSameDeal = i.dealId === dealId;
                    const isGhost = (i.description || '').includes(`Deal #${shortId}`) || (i.id || '').includes(shortId);
                    return isSameDeal || isGhost;
                });

                const paidOnes = dealInstallments.filter((i: PaymentInstallment) => i.status === 'PAID');
                totalPaid += paidOnes.length;
            }
            
            return {
                hasPaid: totalPaid > 0,
                paidCount: totalPaid
            };
        } catch (err) {
            console.error('[COMMERCIAL-FINANCE] Error checking paid installments globally:', err);
            return { hasPaid: false, paidCount: 0 };
        }
    },

    /**
     * Recupera as parcelas já materializadas no cofre financeiro para uma negociação
     * (o "Plano de Pagamento" de uma edição anterior). `custom_installments` nunca é
     * gravado em `commercial_deals` — é campo de trabalho, removido antes do insert/
     * update (ver commercialService.saveDeal) e só sobrevive dentro de
     * `financialInfo.installments` no vault. Sem isto, reabrir uma negociação salva
     * sempre mostrava o Plano de Pagamento vazio, mesmo com parcelas já geradas e
     * salvas — o usuário via elas "sumirem" ao sair e voltar.
     * Exclui o Sinal/Entrada (`tx-{dealId}-dp`), que é editado à parte no campo
     * "Entrada (BRL)", não como linha do cronograma.
     */
    async getDealInstallments(dealId: string, organizationId: string): Promise<PaymentInstallment[]> {
        if (!organizationId || !dealId) return [];
        try {
            // Fonte da verdade desde 2026-08-01: a tabela `deal_installments`.
            // O vault só responde por negócios anteriores ao backfill.
            const rows = await dealInstallmentService.listByDeal(dealId, organizationId);
            if (rows.length > 0) {
                return rows
                    .filter(r => r.sequence > 0) // Entrada é editada à parte
                    .map(toPaymentInstallment);
            }
        } catch (e) {
            console.error('[COMMERCIAL-FINANCE] getDealInstallments (série única):', e);
        }
        try {
            const { data: projects, error } = await supabase
                .from('projects')
                .select('id, settings')
                .eq('name', 'Gestão Comercial')
                .filter('settings->>organizationId', 'eq', organizationId);

            if (error || !projects) return [];

            const shortId = dealId.substring(0, 8);
            const dpId = `tx-${dealId}-dp`;
            const found: PaymentInstallment[] = [];

            for (const p of projects) {
                const installments = p.settings?.financialInfo?.installments;
                if (!installments || !Array.isArray(installments)) continue;

                const dealInstallments = installments.filter((i: PaymentInstallment) => {
                    if (i.id === dpId) return false; // Sinal/Entrada — editado à parte
                    const isSameDeal = i.dealId === dealId;
                    const isGhost = (i.description || '').includes(`Deal #${shortId}`) || (i.id || '').includes(shortId);
                    return isSameDeal || isGhost;
                });
                found.push(...dealInstallments);
            }

            return found.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
        } catch (err) {
            console.error('[COMMERCIAL-FINANCE] Error fetching deal installments:', err);
            return [];
        }
    },

    /**
     * Distrato: remove parcelas PENDENTES e marca PAGAS como ESTORNADO.
     * Não bloqueia mais — parcelas pagas ficam auditáveis com status CANCELLED.
     */
    async deleteDealInstallments(dealId: string, organizationId: string | undefined) {
        if (!organizationId) throw new Error('[COMMERCIAL-FINANCE] organizationId obrigatório — acesso cross-tenant não permitido');
        console.log(`[COMMERCIAL-FINANCE] Distrato cleanup for Deal ${dealId} (Org: ${organizationId})`);

        const { data: allProjects, error } = await supabase
            .from('projects')
            .select('id, name, settings')
            .eq('name', 'Gestão Comercial')
            .filter('settings->>organizationId', 'eq', organizationId);
        if (error || !allProjects) {
            console.error(`[COMMERCIAL-FINANCE] Failed to load projects for distrato cleanup:`, error);
            return;
        }

        let paidCount = 0;
        let pendingCount = 0;

        for (const proj of allProjects) {
            const info = (proj.settings as ProjectSettings)?.financialInfo;
            if (!info?.installments) continue;

            const dealInstallments = info.installments.filter((i: PaymentInstallment) => i.dealId === dealId);
            if (dealInstallments.length === 0) continue;

            const cancelledAt = new Date().toISOString();

            // Parcelas PAGAS → marcadas como CANCELLED (estornadas, auditáveis)
            // Parcelas PENDENTES → removidas completamente
            const updatedInstallments = info.installments
                .map((i: PaymentInstallment) => {
                    if (i.dealId !== dealId) return i;
                    if (i.status === 'PAID') {
                        paidCount++;
                        return { ...i, status: 'CANCELLED', cancelledAt, cancellationNote: 'Distrato' };
                    }
                    pendingCount++;
                    return null; // será removida
                })
                .filter(Boolean) as PaymentInstallment[];

            const updatedTransactions = (info.transactions || []).filter(
                (t: FinancialTransaction & { dealId?: string }) => t.dealId !== dealId
            );

            (proj.settings as ProjectSettings).financialInfo = {
                ...info,
                installments: updatedInstallments,
                transactions: updatedTransactions,
            };

            await projectService.saveProject(proj as unknown as Parameters<typeof projectService.saveProject>[0]);
            console.log(`[COMMERCIAL-FINANCE] Distrato [${proj.name}]: ${pendingCount} removidas, ${paidCount} estornadas (CANCELLED)`);
        }

        if (paidCount > 0) {
            console.warn(`[COMMERCIAL-FINANCE] Distrato de Deal ${dealId}: ${paidCount} parcela(s) PAGA(s) marcadas como ESTORNADO para auditoria.`);
        }

        // Espelho em internal_transactions (Contas a Receber / Conciliação): as
        // parcelas do negócio sao materializadas la' com reference_id
        // 'tx-{dealId}-p{n}'/'tx-{dealId}-dp'. A comissao do corretor vai como
        // 'tx-comm-{dealId}' (DEBIT). O vault acima nao as toca — antes ficavam
        // orfas ao excluir o negocio. Remove as PENDENTES; preserva as ja'
        // RECEBIDAS/PAGAS/conciliadas (dinheiro que entrou/saiu).
        // ⚠️ NÃO filtrar por source_system='COMMERCIAL': quando o deal tem
        // linked_project_id para uma obra real, financialSyncService materializa
        // com source_system='PROJECT' (isSystemProject retorna false para o
        // projeto real). Um filtro de source_system aqui deixava essas parcelas
        // órfãs — achado em auditoria 2026-07-19 (16 lançamentos, R$2M, presos
        // em Contas a Receber de negócios já excluídos). reference_id já embute
        // o dealId (UUID), então basta o padrão — sem risco de colisão entre orgs.
        try {
            const { data: mirrored } = await supabase
                .from('internal_transactions')
                .select('id, status, business_status')
                .eq('organization_id', organizationId)
                .or(`reference_id.like.tx-${dealId}-*,reference_id.eq.tx-comm-${dealId}`);
            const toDelete = (mirrored || [])
                .filter((r: { status?: string; business_status?: string }) =>
                    r.status !== 'CONCILIATED' && !['RECEBIDO', 'PAGO'].includes(r.business_status ?? ''))
                .map((r: { id: string }) => r.id);
            if (toDelete.length) {
                await supabase.from('internal_transactions').delete().in('id', toDelete);
                console.log(`[COMMERCIAL-FINANCE] Removidas ${toDelete.length} parcela(s) espelhadas em internal_transactions do Deal ${dealId}.`);
            }
        } catch (e) {
            console.error('[COMMERCIAL-FINANCE] Erro ao limpar espelho em internal_transactions:', e);
        }

        // Remover comissão do Portal do Corretor
        await this.deleteBrokerCommissionFromPortal(dealId);
    },

    /**
     * Remove as parcelas de um negócio a partir de uma data (não o negócio todo).
     *
     * Usado pela RENOVAÇÃO de locação (contractRenewalService): a partir do
     * início do contrato-filho quem fatura é o filho, então o que a negociação
     * tiver marcado daquela data em diante viraria cobrança em duplicidade.
     *
     * Mesmo cuidado do `deleteDealInstallments`: mexe nas DUAS camadas — o JSONB
     * do "Gestão Comercial" (fonte) e o espelho em `internal_transactions`
     * (Contas a Receber). Limpar só o espelho não adianta: o próximo
     * `syncDealToFinance` o recriaria a partir do JSONB.
     *
     * Nunca toca em parcela PAGA/RECEBIDA/conciliada — dinheiro que entrou fica.
     */
    async deleteDealInstallmentsFrom(dealId: string, organizationId: string | undefined, fromDate: string): Promise<number> {
        if (!organizationId) throw new Error('[COMMERCIAL-FINANCE] organizationId obrigatório — acesso cross-tenant não permitido');
        let removed = 0;

        const { data: allProjects, error } = await supabase
            .from('projects')
            .select('id, name, settings')
            .eq('name', 'Gestão Comercial')
            .filter('settings->>organizationId', 'eq', organizationId);
        if (error || !allProjects) {
            console.error('[COMMERCIAL-FINANCE] Falha ao carregar projetos para corte de parcelas:', error);
            return 0;
        }

        for (const proj of allProjects) {
            const info = (proj.settings as ProjectSettings)?.financialInfo;
            if (!info?.installments) continue;

            const kept = info.installments.filter((i: PaymentInstallment) => {
                if (i.dealId !== dealId) return true;
                if (i.status === 'PAID') return true;
                if ((i.dueDate || '').slice(0, 10) < fromDate) return true;
                removed++;
                return false;
            });
            if (kept.length === info.installments.length) continue;

            (proj.settings as ProjectSettings).financialInfo = { ...info, installments: kept };
            await projectService.saveProject(proj as unknown as Parameters<typeof projectService.saveProject>[0]);
        }

        // Espelho em internal_transactions. Mesmo padrão de reference_id do
        // deleteDealInstallments, e sem filtrar por source_system (deal ligado a
        // obra real materializa como 'PROJECT', não 'COMMERCIAL').
        try {
            const { data: mirrored } = await supabase
                .from('internal_transactions')
                .select('id, status, business_status, due_date')
                .eq('organization_id', organizationId)
                .gte('due_date', fromDate)
                .like('reference_id', `tx-${dealId}-%`);
            const toDelete = (mirrored || [])
                .filter((r: { status?: string; business_status?: string }) =>
                    r.status !== 'CONCILIATED' && !['RECEBIDO', 'PAGO'].includes(r.business_status ?? ''))
                .map((r: { id: string }) => r.id);
            if (toDelete.length) {
                await supabase.from('internal_transactions').delete().in('id', toDelete);
            }
        } catch (e) {
            console.error('[COMMERCIAL-FINANCE] Erro ao cortar espelho em internal_transactions:', e);
        }

        console.log(`[COMMERCIAL-FINANCE] Corte de parcelas do Deal ${dealId} a partir de ${fromDate}: ${removed} removida(s).`);
        return removed;
    },

    /**
     * Sincroniza a comissão do corretor para a tabela do Portal do Corretor.
     * Isso permite que o corretor veja suas comissões em tempo real no portal dele.
     */
    async syncBrokerCommissionToPortal(deal: PropertyDeal, unitNumber: string, block: string, clientName: string) {
        if (!deal.broker_id || !deal.organization_id) return;

        console.log(`[COMMERCIAL-FINANCE] Syncing Broker Commission to Portal for Deal ${deal.id}`);

        try {
            // 1. Obter o e-mail do corretor (chave de vinculação no portal)
            const profile = await brokerService.getProfile(deal.broker_id);
            if (!profile || !profile.email) {
                console.warn(`[COMMERCIAL-FINANCE] Could not find broker profile or email for ID ${deal.broker_id}. Portal sync skipped.`);
                return;
            }

            // 2. Preparar payload para a tabela broker_portal_commissions
            const commission = {
                organization_id: deal.organization_id,
                broker_email: profile.email,
                proposal_id: null, // deal originado no comercial não tem obrigatoriamente uma proposta no portal
                unit_number: unitNumber,
                block: block,
                buyer_name: clientName,
                sale_value: deal.value,
                commission_pct: deal.broker_commission_pct || 0,
                commission_predicted: deal.broker_commission_value || 0,
                commission_released: 0, // Inicia como zero, liberadora via financeiro
                commission_paid: 0,
                status: 'PENDENTE',
                updated_at: new Date().toISOString()
            };

            // 3. Upsert baseado na origem (Deal ID em um campo de metadados se existisse, mas usaremos a ID da comissão idêntica ao dealId)
            // deal.id já é um UUID válido no banco, então removemos o prefixo de string que causou o erro 22P02.
            const commissionId = deal.id;

            const { error } = await supabase
                .from('broker_portal_commissions')
                .upsert({
                    id: commissionId,
                    ...commission
                });

            if (error) {
                console.error('[COMMERCIAL-FINANCE] Failed to upsert broker portal commission:', error);
            } else {
                console.log(`[COMMERCIAL-FINANCE] Broker commission synced to portal for ${profile.email}`);
            }

        } catch (err) {
            console.error('[COMMERCIAL-FINANCE] Error in syncBrokerCommissionToPortal:', err);
        }
    },

    /**
     * Remove a comissão do corretor vinculada a um deal comercial.
     */
    async deleteBrokerCommissionFromPortal(dealId: string) {
        console.log(`[COMMERCIAL-FINANCE] Deleting Broker Commission for Deal ${dealId} from portal`);
        const { error } = await supabase
            .from('broker_portal_commissions')
            .delete()
            .eq('id', dealId);

        if (error) {
            console.error('[COMMERCIAL-FINANCE] Failed to delete broker portal commission:', error);
        }
    },
    /**
     * Busca parcelas vinculadas a um cliente dentro da organização do cliente.
     * Escoped por organizationId para evitar vazamento cross-tenant.
     */
    async listAllClientInstallments(clientId: string, organizationId: string) {
        if (!organizationId) throw new Error('[COMMERCIAL-FINANCE] organizationId obrigatório — acesso cross-tenant não permitido');
        console.log(`[COMMERCIAL-FINANCE] Listing installments for Client ${clientId} (Org: ${organizationId})`);

        const { data: projects, error } = await supabase
            .from('projects')
            .select('id, settings')
            .eq('name', 'Gestão Comercial')
            .filter('settings->>organizationId', 'eq', organizationId);

        if (error) {
            console.error('[COMMERCIAL-FINANCE] Error fetching commercial projects for client view:', error);
            return [];
        }

        const consolidated: PaymentInstallment[] = [];
        projects?.forEach(p => {
            const info = (p.settings as ProjectSettings)?.financialInfo;
            if (info && info.installments) {
                const clientInsts = info.installments.filter((i: PaymentInstallment) => i.clientId === clientId);
                consolidated.push(...clientInsts);
            }
        });

        // Série única: o Portal do Cliente mostra o que foi PUBLICADO em Contas a
        // Receber — parcela que ainda é só plano/proposta não é cobrança e não
        // pode aparecer para o cliente. Sem esta união o portal esvaziaria para
        // todo negócio criado depois da migração.
        try {
            const { data: deals } = await supabase
                .from('commercial_deals')
                .select('id')
                .eq('client_id', clientId)
                .eq('organization_id', organizationId);
            for (const d of deals || []) {
                const rows = await dealInstallmentService.listByDeal(d.id as string, organizationId);
                consolidated.push(
                    ...rows
                        .filter(r => !!r.publishedAt && r.settlementStatus !== 'CANCELADA')
                        .map(r => ({ ...toPaymentInstallment(r), clientId })),
                );
            }
        } catch (e) {
            console.error('[COMMERCIAL-FINANCE] listAllClientInstallments (série única):', e);
        }

        return consolidated;
    },

    /**
     * Reconcilia o status de uma negociação (Deal) com base no estado das parcelas financeiras.
     * Se todas as parcelas estiverem PAID, o status do Deal será COMPLETED.
     * Se houver qualquer parcela PENDING/OVERDUE, o status volta para PENDING.
     */
    async reconcileDealStatusWithFinance(dealId: string, organizationId: string) {
        if (!dealId) return;
        if (!organizationId) throw new Error('[COMMERCIAL-RECONCILE] organizationId obrigatório — acesso cross-tenant não permitido');

        console.log(`[COMMERCIAL-RECONCILE] Checking financial health for Deal ${dealId} (Org: ${organizationId})...`);

        // Limita à tabela de projetos comerciais da organização — evita varredura de projetos de obra
        const { data: allProjects, error: fetchProjError } = await supabase
            .from('projects')
            .select('id, name, settings')
            .eq('name', 'Gestão Comercial')
            .filter('settings->>organizationId', 'eq', organizationId);
        if (fetchProjError || !allProjects) {
            console.error('[COMMERCIAL-RECONCILE] Error fetching ALL projects:', fetchProjError);
            return;
        }

        // 2. Coletar todas as parcelas deste deal. Série única primeiro — sem
        //    isto, "todas pagas → COMPLETED/SOLD" pararia de funcionar para
        //    negócios que não existem mais no vault.
        let dealInstallments: PaymentInstallment[] = [];
        try {
            const rows = await dealInstallmentService.listByDeal(dealId, organizationId);
            dealInstallments.push(...rows.filter(r => !!r.publishedAt).map(toPaymentInstallment));
        } catch (e) {
            console.error('[COMMERCIAL-RECONCILE] série única:', e);
        }
        // Vault só entra quando a série única não respondeu (negócio legado):
        // somar as duas duplicaria a mesma parcela e travaria a reconciliação.
        if (dealInstallments.length === 0) {
            for (const proj of allProjects) {
                const info = (proj.settings as ProjectSettings)?.financialInfo;
                if (info && info.installments) {
                    const projInstalls = info.installments.filter((i: PaymentInstallment) => i.dealId === dealId);
                    dealInstallments.push(...projInstalls);
                }
            }
        }

        if (dealInstallments.length === 0) {
            console.log(`[COMMERCIAL-RECONCILE] No installments found globally for Deal ${dealId}. Skipping auto-update.`);
            return;
        }

        // 3. Verificar se TODAS estão pagas (Globalmente)
        const allPaid = dealInstallments.length > 0 && dealInstallments.every((i: PaymentInstallment) => i.status === 'PAID');
        const targetStatus = allPaid ? 'DONE' : 'WAITING_PAYMENT';

        console.log(`[COMMERCIAL-RECONCILE] Deal ${dealId}: All Paid? ${allPaid} (Found ${dealInstallments.length} global insts). Target: ${targetStatus}`);

        // 4. Buscar o Deal atual no banco
        const { data: deal, error: fetchError } = await supabase
            .from('commercial_deals')
            .select('status, property_id')
            .eq('id', dealId)
            .single();

        if (fetchError || !deal) {
            console.error('[COMMERCIAL-RECONCILE] Error fetching deal:', fetchError);
            return;
        }

        // 5. Atualizar se houver mudança necessária 
            if (deal.status !== targetStatus) {
                console.log(`[COMMERCIAL-RECONCILE] Updating Deal ${dealId} status to ${targetStatus} (Triggered by FINANCE)`);
                const { error: updateError } = await supabase
                    .from('commercial_deals')
                    .update({ 
                        status: targetStatus, 
                        updated_at: new Date().toISOString() 
                    })
                    .eq('id', dealId);

            if (updateError) {
                console.error('[COMMERCIAL-RECONCILE] Error updating deal status:', updateError);
            } else {
                console.log(`[COMMERCIAL-RECONCILE] Success! Deal ${dealId} is now ${targetStatus}.`);
                
                // Sincronização de Status da Propriedade
                if (deal.property_id) {
                    const propertyStatus = targetStatus === 'DONE' ? 'SOLD' : 'RESERVED';
                    console.log(`[COMMERCIAL-RECONCILE] Updating Property ${deal.property_id} status to ${propertyStatus}`);
                    
                    await supabase
                        .from('commercial_properties')
                        .update({ status: propertyStatus })
                        .eq('id', deal.property_id);
                }
            }
        } else {
             console.log(`[COMMERCIAL-RECONCILE] Deal is already ${targetStatus}. No update needed.`);
        }
    },

    /**
     * Limpa parcelas e transações órfãs (cujo dealId não existe mais em commercial_deals)
     */
    async cleanupOrphanedInstallments(project: CommercialProjectRow) {
        if (!project || !project.id || project.isVirtual) return project;
        
        const info = project.settings?.financialInfo;
        if (!info || (!info.installments && !info.transactions)) return project;

        const installments = info.installments || [];
        const transactions = info.transactions || [];
        
        // 1. Extrai IDs únicos de Deal (filtra apenas os que vieram do comercial)
        const allLocalIds = Array.from(new Set([
            ...installments.map((i: PaymentInstallment) => i.dealId),
            ...(transactions as (FinancialTransaction & { dealId?: string })[]).map(t => t.dealId)
        ])).filter(Boolean);

        // Separa UUIDs válidos de 'lixos' (strings curtas ou mal-formatadas)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const validFormatIds = allLocalIds.filter(id => uuidRegex.test(id as string));

        // 2. Verifica existência no banco comercial_deals (apenas para UUIDs válidos)
        let validExistIds = new Set();
        if (validFormatIds.length > 0) {
            const { data: existingDeals, error } = await supabase
                .from('commercial_deals')
                .select('id')
                .in('id', validFormatIds);

            if (error) {
                console.error('[COMMERCIAL-CLEANUP] Error checking deals:', error);
                return project;
            }
            validExistIds = new Set(existingDeals.map(d => d.id));
        }
        
        // 3. Filtra apenas o que é REALMENTE VÁLIDO
        // Se tem dealId: deve ser UUID válido E deve existir no banco
        const validInstallments = installments.filter((i: PaymentInstallment) => {
            if (!i.dealId) return true; // Lançamento manual direto
            return validExistIds.has(i.dealId); // Remove se não é UUID ou se não existe no banco
        });

        const validTransactions = (transactions as (FinancialTransaction & { dealId?: string })[]).filter(t => {
            if (!t.dealId) return true;
            return validExistIds.has(t.dealId);
        });

        if (validInstallments.length === installments.length && validTransactions.length === transactions.length) {
            return project; // Tudo certo
        }

        console.log(`[COMMERCIAL-CLEANUP] Removing ${installments.length - validInstallments.length} orphaned installments from Project ${project.id}`);

        // 4. Salva o projeto limpo
        const updated = {
            ...project,
            settings: {
                ...project.settings,
                financialInfo: {
                    ...info,
                    installments: validInstallments,
                    transactions: validTransactions
                }
            }
        };

        const { data: saved, error: saveError } = await supabase
            .from('projects')
            .update({ settings: updated.settings })
            .eq('id', project.id)
            .select()
            .single();

        if (saveError) {
            console.error('[COMMERCIAL-CLEANUP] Error saving cleaned project:', saveError);
            return project;
        }

        return saved;
    }
};
