import { supabase } from '../lib/supabase';
import { PropertyDeal, ProjectSettings, PaymentInstallment, FinancialTransaction } from '../types';
import { projectService } from './projectService';
import { brokerService } from './brokerService';

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
    async syncDealToFinance(deal: PropertyDeal, targetOrganizationId?: string, currentSettings?: ProjectSettings, isGlobalSync: boolean = false) {
        const orgToUse = targetOrganizationId || deal.organization_id;
        console.log(`[COMMERCIAL-FINANCE] Processing Deal #${deal.id} for Org: ${orgToUse}`);
        
        const allowedStatuses = ['COMPLETED', 'PENDING', 'WAITING_PAYMENT', 'APPROVED'];
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
            const { data: allProj } = await supabase.from('projects').select('settings').eq('name', 'Gestão Comercial');
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

        const metadata = {
            dealId: deal.id,
            dealType: deal.type,
            clientId: deal.client_id,
            clientName,
            propertyId: deal.property_id,
            propertyName,
            linkedProjectId: deal.linked_project_id
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
                    ...metadata 
                });
            }
            
            console.log(`[COMMERCIAL-FINANCE] Saving ${deal.custom_installments.length} CUSTOM installments${downPayment > 0 ? ' + Entrada' : ''} for Deal #${deal.id.substring(0,8)}`);
            deal.custom_installments.forEach((custom: PaymentInstallment) => {
                const sd = getStatus(custom.id, custom.value, custom.description, custom.status);
                newInstallments.push({
                    ...custom,
                    ...metadata,
                    paymentDate: sd.paymentDate,
                    status: sd.status as PaymentInstallment['status']
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
                newInstallments.push({ id, description: desc, dueDate: deal.date || new Date().toISOString().split('T')[0], value: Number(downPayment.toFixed(2)), status: sd.status as PaymentInstallment['status'],paymentDate: sd.paymentDate, ...metadata });
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

    async getOrCreateCommercialProject(organizationId?: string) {
        // 1. Tenta localizar projetos vinculados
        let query = supabase
            .from('projects')
            .select('*')
            .eq('name', 'Gestão Comercial');

        if (organizationId) {
            query = query.filter('settings->>organizationId', 'eq', organizationId);
        }

        const { data: projects, error } = await query.order('created_at', { ascending: false });

        if (error) {
            console.error('[COMMERCIAL-FINANCE] Error searching for isolated project:', error);
        }

        // Se estiver em modo GLOBAL (ID nulo) e houver múltiplos projetos, vamos retornar um "projeto virtual" consolidado
        if (!organizationId && projects && projects.length > 1) {
            console.log(`[COMMERCIAL-FINANCE] Consolidating ${projects.length} commercial projects for global view.`);

            const consolidatedInstallments: (PaymentInstallment & { sourceProjectId?: string })[] = [];
            const consolidatedTransactions: (Record<string, unknown> & { sourceProjectId?: string })[] = [];

            // 1b. Limpar e consolidar individualmente cada projeto
            for (const p of projects) {
                // EXECUTAR LIMPEZA NO FILHO: Remove lixos do banco de dados desse projeto individual
                const cleanedP = await this.cleanupOrphanedInstallments(p as CommercialProjectRow);

                const info = cleanedP.settings?.financialInfo;
                if (info) {
                    if (info.installments) {
                        info.installments.forEach((i: PaymentInstallment) => {
                            // DEDUPLICAÇÃO POR BIOMETRIA DE LANÇAMENTO: Nome + Parcela + Valor
                            // Resolve casos onde existem dois contratos (IDs diferentes) para a mesma venda.
                            // Corrigimos i.title para i.description; 'title' vinha nulo e aglomerava parcelas do mesmo valor!
                            const descr = i.description || 'sem-titulo';

                            // NORMALIZAÇÃO DE DESCRIÇÃO: Remove prefixos como 'Receita: Venda - ' para agrupar versões diferentes
                            const normalizedDescr = descr
                                .replace(/^Receita: (Venda|Aluguel) - /, '')
                                .replace(/ - Deal #.{8}$/, '') // Remove sufixo de Deal ID se houver
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
                            } else {
                                // Preferência para o que já está PAGO em caso de duplicidade
                                if (i.status === 'PAID' && consolidatedInstallments[existingIndex].status !== 'PAID') {
                                    consolidatedInstallments[existingIndex] = { ...i, sourceProjectId: cleanedP.id };
                                }
                            }
                        });
                    }
                    if (info.transactions) {
                        info.transactions.forEach((t: Record<string, unknown>) => {
                            const compositeKey = `${t['dealId'] || 'manual'}-${t['title']}-${t['value']}-${t['date']}`;
                            if (!consolidatedTransactions.some(existing => {
                                const existingKey = `${existing['dealId'] || 'manual'}-${existing['title']}-${existing['value']}-${existing['date']}`;
                                return existingKey === compositeKey;
                            })) {
                                consolidatedTransactions.push({
                                    ...t,
                                    sourceProjectId: cleanedP.id
                                });
                            }
                        });
                    }
                }
            }

            // Retorna o primeiro como base, mas com dados agregados
            return {
                ...projects[0],
                isVirtual: true, // Flag indicando que não deve ser salvo como um registro individual
                settings: {
                    ...projects[0].settings,
                    organizationId: undefined, // Identifica como global
                    financialInfo: {
                        ...projects[0].settings.financialInfo,
                        installments: consolidatedInstallments,
                        transactions: consolidatedTransactions
                    }
                }
            };
        }

        if (projects && projects.length > 0) {
            const candidate = projects[0];
            // Executa limpeza de órfãos para garantir integridade
            return await this.cleanupOrphanedInstallments(candidate);
        }

        // 2. [RECUPERAÇÃO] Se não achou projeto isolado, procura por um projeto órfão (sem org) que TENHA dados (parcelas)
        // Isso recupera os dados legados que estavam sendo compartilhados indevidamente
        const { data: orphanedProjects } = await supabase
            .from('projects')
            .select('*')
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
     * Sincroniza todas as negociações finalizadas de uma organização.
     * Útil para recuperar dados históricos ou forçar atualização total.
     */
    async syncAllOrganizationDeals(organizationId?: string) {
        console.log(`[COMMERCIAL-FINANCE] Starting batch sync for Org ${organizationId || 'ALL'}`);

        // 1. Listar todas as negociações finalizadas
        let query = supabase
            .from('commercial_deals')
            .select('*')
            .eq('status', 'COMPLETED');

        if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }

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
                await this.syncDealToFinance(deal);
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
    async hasPaidInstallments(dealId: string): Promise<{ hasPaid: boolean, paidCount: number }> {
        try {
            console.log(`[COMMERCIAL-FINANCE] Global audit for paid installments on Deal ${dealId}`);
            
            // 1. Carregar TODOS os projetos de Gestão Comercial
            const { data: projects, error } = await supabase
                .from('projects')
                .select('id, settings')
                .eq('name', 'Gestão Comercial');

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
     * Remove todas as parcelas vinculadas a um negócio.
     * Bloqueia a remoção se houver parcelas já pagas (PAID).
     */
    async deleteDealInstallments(dealId: string, organizationId?: string) {
        console.log(`[COMMERCIAL-FINANCE] Cleanup for Deal ${dealId} (Org: ${organizationId})`);

        // Filtra por organizationId quando disponível — evita varredura cross-tenant.
        let query = supabase.from('projects').select('id, name, settings');
        if (organizationId) {
            query = query.filter('settings->>organizationId', 'eq', organizationId);
        }
        const { data: allProjects, error } = await query;
        if (error || !allProjects) {
            console.error(`[COMMERCIAL-FINANCE] Failed to load ALL projects for global cleanup:`, error);
            return;
        }

        const projectsToUpdate: CommercialProjectRow[] = [];
        let totalPaidFound = 0;

        // 2. Primeira Passagem: AUDITORIA GLOBAL PARA BLOQUEIO
        // Verifica TODOS os cofres antes de deletar qualquer coisa
        for (const proj of allProjects) {
            const info = (proj.settings as ProjectSettings)?.financialInfo;
            if (!info || !info.installments) continue;

            const dealInstallments = info.installments.filter((i: PaymentInstallment) => i.dealId === dealId);
            if (dealInstallments.length > 0) {
                const hasPaid = dealInstallments.some((i: PaymentInstallment) => i.status === 'PAID');
                if (hasPaid) totalPaidFound++;
                
                // Se encontrarmos o deal neste projeto, agendamos o projeto para edição na passagem 2
                projectsToUpdate.push(proj as CommercialProjectRow);
            }
        }

        if (totalPaidFound > 0) {
            console.error(`[COMMERCIAL-FINANCE] Blocked deletion of Deal ${dealId} due to ${totalPaidFound} paid installments across ${projectsToUpdate.length} projects.`);
            throw new Error(`Não é possível excluir esta negociação. Existem ${totalPaidFound} parcelas com status "PAGO" associadas a ela (algumas podem estar ocultas em outras obras/satélites). Cancele as baixas no financeiro primeiro.`);
        }

        // 3. Segunda Passagem: DEDETIZAÇÃO E SALVAMENTO SEGURO
        // Se chegamos aqui, todas as parcelas estão PENDENTES em todos os cofres do sistema
        console.log(`[COMMERCIAL-FINANCE] No paid installments found. Proceeding to securely purge Deal ${dealId} from ${projectsToUpdate.length} Vaults...`);
        
        for (const proj of projectsToUpdate) {
            const info = proj.settings.financialInfo;
            if (!info) continue;

            // Filtramos as parcelas e transações
            const cleanInstallments = (info.installments || []).filter((i: PaymentInstallment) => i.dealId !== dealId);
            const cleanTransactions = (info.transactions || []).filter((t: FinancialTransaction & { dealId?: string }) => t.dealId !== dealId);

            proj.settings.financialInfo = {
                ...info,
                installments: cleanInstallments,
                transactions: cleanTransactions
            };

            await projectService.saveProject(proj as unknown as Parameters<typeof projectService.saveProject>[0]);
            console.log(`[COMMERCIAL-FINANCE] Purged ghost installments from Project [${proj.name}]`);
        }
        
        console.log(`[COMMERCIAL-FINANCE] Cleanup of Deal ${dealId} installments globally completed.`);

        // 4. Remover do Portal do Corretor
        await this.deleteBrokerCommissionFromPortal(dealId);
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
     * Busca TODAS as parcelas vinculadas a um ID de cliente em qualquer projeto "Gestão Comercial".
     * Ignora o organizationId para permitir visão unificada no Portal do Cliente (externo).
     */
    async listAllClientInstallments(clientId: string) {
        console.log(`[COMMERCIAL-FINANCE] Listing all global installments for Client ${clientId}`);
        
        // Buscar todos os projetos com nome "Gestão Comercial" na base
        const { data: projects, error } = await supabase
            .from('projects')
            .select('id, settings')
            .eq('name', 'Gestão Comercial');

        if (error) {
            console.error('[COMMERCIAL-FINANCE] Error fetching global commercial projects for client view:', error);
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

        return consolidated;
    },

    /**
     * Reconcilia o status de uma negociação (Deal) com base no estado das parcelas financeiras.
     * Se todas as parcelas estiverem PAID, o status do Deal será COMPLETED.
     * Se houver qualquer parcela PENDING/OVERDUE, o status volta para PENDING.
     */
    async reconcileDealStatusWithFinance(dealId: string, organizationId?: string) {
        if (!dealId) return;

        console.log(`[COMMERCIAL-RECONCILE] Checking financial health for Deal ${dealId} (Org: ${organizationId ?? 'all'})...`);

        // Filtra por org quando disponível — evita varredura cross-tenant.
        let query = supabase.from('projects').select('id, name, settings');
        if (organizationId) {
            query = query.filter('settings->>organizationId', 'eq', organizationId);
        }
        const { data: allProjects, error: fetchProjError } = await query;
        if (fetchProjError || !allProjects) {
            console.error('[COMMERCIAL-RECONCILE] Error fetching ALL projects:', fetchProjError);
            return;
        }

        // 2. Coletar todas as parcelas deste deal, em todos os cofres do sistema
        let dealInstallments: PaymentInstallment[] = [];
        for (const proj of allProjects) {
            const info = (proj.settings as ProjectSettings)?.financialInfo;
            if (info && info.installments) {
                const projInstalls = info.installments.filter((i: PaymentInstallment) => i.dealId === dealId);
                dealInstallments.push(...projInstalls);
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
