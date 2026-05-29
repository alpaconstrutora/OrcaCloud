import { supabase } from '../lib/supabase';
import { FinancialTransaction, PurchaseOrderItem, ProjectSettings, FinancialInfo } from '../types';
import { projectService } from './projectService';
import { invoiceService } from './invoiceService';

export const financialService = {
    /**
     * Adds a transaction to a project's financial settings.
     */
    async addTransaction(projectId: string, transaction: Omit<FinancialTransaction, 'id'>) {
        const project = await projectService.loadProject(projectId);
        if (!project) throw new Error('Projeto não encontrado');

        const settings = project.settings as ProjectSettings;
        const info: FinancialInfo = settings.financialInfo || {
            totalValue: 0,
            paymentMethod: 'Parcelamento Próprio',
            installments: [],
            transactions: []
        };

        const newTx: FinancialTransaction = {
            ...transaction,
            id: crypto.randomUUID()
        };

        const updatedTransactions = [newTx, ...(info.transactions || [])];

        await projectService.saveProject({
            ...project,
            settings: {
                ...settings,
                financialInfo: {
                    ...info,
                    transactions: updatedTransactions
                }
            }
        });

        // Sync to internal_transactions table for reconciliation engine
        try {
            await supabase.from('internal_transactions').insert({
                organization_id: settings.organizationId,
                source_system: 'PROJECT',
                reference_id: newTx.id,
                transaction_date: newTx.date.split('T')[0],
                amount: newTx.value,
                direction: newTx.type === 'INCOME' ? 'CREDIT' : 'DEBIT',
                description: newTx.description,
                category: newTx.category,
                status: newTx.status === 'PAID' ? 'CONCILIATED' : 'PENDING'
            });
        } catch (e) {
            console.error('[FINANCIAL-SYNC] Failed to sync to internal_transactions:', e);
        }

        return newTx;
    },

    /**
     * Inserts multiple transactions in a single load+save cycle (batch).
     * Saves into the "Gestão Comercial" vault project so the Financial module can display them.
     * Falls back to the individual project if no vault exists.
     */
    async addTransactionBatch(projectId: string, inputTransactions: Omit<FinancialTransaction, 'id'>[]) {
        if (!inputTransactions.length) return [];

        const newTxs: FinancialTransaction[] = inputTransactions.map(tx => ({
            ...tx,
            id: crypto.randomUUID()
        }));

        // 1. Try to find the organization from the project so we can find the vault
        let orgId: string | undefined;
        try {
            const project = await projectService.loadProject(projectId);
            if (project) {
                orgId = (project.settings as ProjectSettings)?.organizationId;
            }
        } catch (e) {
            console.warn('[FINANCIAL-BATCH] Could not load project to determine orgId:', e);
        }

        // 2. Try to save into the "Gestão Comercial" vault
        if (orgId) {
            try {
                const { data: vaultProjects } = await supabase
                    .from('projects')
                    .select('*')
                    .eq('name', 'Gestão Comercial')
                    .filter('settings->>organizationId', 'eq', orgId)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (vaultProjects && vaultProjects.length > 0) {
                    const vault = vaultProjects[0];
                    const vaultInfo = vault.settings?.financialInfo || {
                        totalValue: 0, paymentMethod: 'Variavel', installments: [], transactions: []
                    };

                    const updatedTransactions = [...newTxs, ...(vaultInfo.transactions || [])];
                    const updatedVault = {
                        ...vault,
                        settings: {
                            ...vault.settings,
                            financialInfo: { ...vaultInfo, transactions: updatedTransactions }
                        }
                    };

                    await projectService.saveProject(updatedVault);
                    console.log(`[CONTRACTS-BATCH] Saved ${newTxs.length} transactions to Gestão Comercial vault (org: ${orgId})`);
                    return newTxs;
                }
            } catch (e) {
                console.error('[CONTRACTS-BATCH] Failed to save to vault, falling back to project JSONB:', e);
            }
        }

        // 3. Fallback: save to the individual project's JSONB
        try {
            const project = await projectService.loadProject(projectId);
            if (!project) throw new Error('Projeto não encontrado');

            const settings = project.settings as ProjectSettings;
            const info: FinancialInfo = settings.financialInfo || {
                totalValue: 0, paymentMethod: 'Parcelamento Próprio', installments: [], transactions: []
            };

            await projectService.saveProject({
                ...project,
                settings: {
                    ...settings,
                    financialInfo: { ...info, transactions: [...newTxs, ...(info.transactions || [])] }
                }
            });
            console.log(`[CONTRACTS-BATCH] Fallback: saved ${newTxs.length} transactions to project ${projectId}`);
        } catch (e) {
            console.error('[CONTRACTS-BATCH] Fallback save also failed:', e);
        }

        return newTxs;
    },



    /**
     * Synchronizes an order with the financial module.
     * Generates a payment forecast if the order is delivered and has an invoice.
     */
    async syncOrderToFinance(orderId: string) {
        // 1. Fetch Order and Supplier separately (Joins on suppliers can fail due to schema caching)
        const { data: orderRaw, error: orderError } = await supabase
            .from('purchase_orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (orderError || !orderRaw) {
            console.error("[FINANCIAL] Order not found for sync:", orderId);
            return;
        }

        type DbOrder = { id: string; number: string; status: string; supplier_id?: string; project_id?: string; items: PurchaseOrderItem[]; actual_delivery_date?: string; delivery_date?: string; payment_method?: string; payment_term_type?: string; payment_installments?: number; payment_days?: number; bank_account?: string; cost_center?: string; chart_of_accounts?: string; };
        const order = orderRaw as DbOrder;

        // Fetch supplier name separately
        let supplierName = 'Fornecedor não identificado';
        if (order.supplier_id) {
            const { data: supplier } = await supabase
                .from('suppliers')
                .select('name')
                .eq('id', order.supplier_id)
                .single();
            if (supplier) supplierName = supplier.name;
        }

        // 2. Check Prerequisites: Status MUST be 'Entregue', 'Recebido', or 'Divergência'
        const allowedStatuses = ['Entregue', 'Recebido', 'Divergência'];
        if (!allowedStatuses.includes(order.status)) {
            console.log(`[FINANCIAL] Order ${order.number} status is ${order.status}. Skipping forecast.`);
            return;
        }

        // 3. Check for Invoices
        const invoices = await invoiceService.listInvoicesByOrder(orderId);
        if (invoices.length === 0) {
            console.log(`[FINANCIAL] Order ${order.number} has no invoices. Skipping forecast.`);
            return;
        }

        // 4. Project loading
        if (!order.project_id) return;
        const projectId = order.project_id;
        const project = await projectService.loadProject(projectId);
        if (!project) return;

        const settings = project.settings as ProjectSettings;
        const info = settings.financialInfo;

        // 5. Prevent Duplicates / Allow Update of Pending
        const orderTransactions = info?.transactions?.filter(t => t.orderId === orderId) || [];
        if (orderTransactions.length > 0 && info?.transactions) {
            const hasStartedPayment = orderTransactions.some(t => t.status !== 'PENDING' && t.status !== 'CANCELLED');
            if (hasStartedPayment) {
                console.log(`[FINANCIAL] Order ${order.number} has non-pending transactions. Skipping sync.`);
                return;
            }

            // Clean up existing pending transactions to allow recreation with fresh data
            console.log(`[FINANCIAL] Order ${order.number} has pending transactions. Cleaning up for re-sync...`);
            const cleanedTransactions = info.transactions.filter(t => t.orderId !== orderId);

            await projectService.saveProject({
                ...project,
                settings: {
                    ...settings,
                    financialInfo: {
                        ...info,
                        transactions: cleanedTransactions
                    }
                }
            });
        }

        // 6. Calculate Values and Terms
        const total = order.items.reduce((acc: number, item: PurchaseOrderItem) => acc + (item.total || 0), 0);
        const baseDate = order.actual_delivery_date || order.delivery_date || new Date().toISOString();
        const paymentMethod = order.payment_method || 'Não inf.';
        const termType = order.payment_term_type || 'Vista';
        const installmentsCount = termType === 'Parcelado' ? (order.payment_installments || 1) : 1;
        const intervalDays = order.payment_days || 30; // Use negotiated days or default to 30

        // 7. Generate Transactions
        const baseInstallment = Math.round((total / installmentsCount) * 100) / 100;

        for (let i = 0; i < installmentsCount; i++) {
            // Última parcela absorve o resíduo de centavos para soma exata ao total
            const installmentValue = i === installmentsCount - 1
                ? Math.round((total - baseInstallment * (installmentsCount - 1)) * 100) / 100
                : baseInstallment;

            const dueDate = new Date(baseDate);
            // intervalDays * (i+1): 30/60/90 ou 28/56/84 — espaçamento uniforme
            dueDate.setDate(dueDate.getDate() + intervalDays * (i + 1));

            const installmentDesc = installmentsCount > 1
                ? `Pedido ${order.number} (${i + 1}/${installmentsCount})`
                : `Pedido ${order.number}`;

            await this.addTransaction(projectId, {
                date: dueDate.toISOString(),
                type: 'EXPENSE',
                category: 'Material',
                description: `Pagamento PO - ${installmentDesc}`,
                value: installmentValue,
                status: 'PENDING',
                supplier: supplierName,
                orderId: orderId,
                bankAccount: order.bank_account,
                costCenter: order.cost_center,
                chartOfAccounts: order.chart_of_accounts,
                notes: `Gerado da entrega. Método: ${paymentMethod}. NFe: ${invoices[0].fileName}`
            });
        }


        console.log(`[FINANCIAL] Generated ${installmentsCount} forecast(s) for Order ${order.number}`);
    },

    /**
     * Synchronizes a contract measurement with the financial module.
     * Generates a payment forecast based on the contract's terms.
     */
    async syncMeasurementToFinance(measurementId: string) {
        // 1. Fetch Measurement
        const { data: measurement, error: mError } = await supabase
            .from('contract_measurements')
            .select('*')
            .eq('id', measurementId)
            .single();

        if (mError || !measurement) {
            console.error("[FINANCIAL] Measurement not found for sync:", measurementId);
            return;
        }

        // 2. Fetch Contract
        const { data: contract, error: cError } = await supabase
            .from('contracts')
            .select('*')
            .eq('id', measurement.contract_id)
            .single();

        if (cError || !contract) {
            console.error("[FINANCIAL] Contract not found for measurement sync:", measurement.contract_id);
            return;
        }

        // 3. Fetch Supplier name
        let supplierName = 'Contratado não identificado';
        if (contract.supplier_id) {
            const { data: supplier } = await supabase
                .from('suppliers')
                .select('name')
                .eq('id', contract.supplier_id)
                .single();
            if (supplier) supplierName = supplier.name;
        }

        // 4. Project loading
        const projectId = contract.project_id;
        if (!projectId) return;

        const project = await projectService.loadProject(projectId);
        if (!project) return;

        const settings = project.settings as ProjectSettings;
        const info = settings.financialInfo;

        // 5. Prevent Duplicates
        const existingTx = info?.transactions?.filter(t => (t as FinancialTransaction & { measurementId?: string }).measurementId === measurementId) || [];
        if (existingTx.length > 0) {
            console.log(`[FINANCIAL] Measurement ${measurement.number} already synced. Skipping.`);
            return;
        }

        // 6. Calculate Values and Terms
        const total = measurement.net_value ?? measurement.total_value;
        const baseDate = measurement.measurement_date || new Date().toISOString();
        const paymentMethod = contract.payment_method || 'Não inf.';
        const termType = contract.payment_term_type || 'Vista';
        const intervalDays = contract.payment_days || 0;

        // 7. If contract has a custom payment_schedule, use it as source of truth
        // (schedule already has dates and values; measurement total is proportional)
        const paymentSchedule: { date: string; value: number }[] | undefined = (contract as any).payment_schedule;
        if (termType === 'Parcelado' && paymentSchedule?.length) {
            const scheduleTotal = paymentSchedule.reduce((s: number, p: any) => s + p.value, 0);
            const ratio = scheduleTotal > 0 ? total / scheduleTotal : 1;
            for (let i = 0; i < paymentSchedule.length; i++) {
                const inst = paymentSchedule[i];
                await this.addTransaction(projectId, {
                    date: inst.date + 'T12:00:00.000Z',
                    type: 'EXPENSE',
                    category: 'Mão de Obra / Serviço',
                    description: `Contrato: ${contract.title} - Medição #${measurement.number} (${i + 1}/${paymentSchedule.length})`,
                    value: Math.round(inst.value * ratio * 100) / 100,
                    status: 'PENDING',
                    supplier: supplierName,
                    measurementId: measurementId,
                    notes: `Gerado da medição. Método: ${paymentMethod}.`
                });
            }
            console.log(`[FINANCIAL] Generated ${paymentSchedule.length} forecast(s) from schedule for Measurement ${measurement.number}`);
            return;
        }

        // Fallback: equal division
        const installmentsCount = termType === 'Parcelado' ? (contract.payment_installments || 1) : 1;
        const baseInstallmentM = Math.round((total / installmentsCount) * 100) / 100;

        for (let i = 0; i < installmentsCount; i++) {
            const installmentValue = i === installmentsCount - 1
                ? Math.round((total - baseInstallmentM * (installmentsCount - 1)) * 100) / 100
                : baseInstallmentM;

            const dueDate = new Date(baseDate);
            dueDate.setDate(dueDate.getDate() + intervalDays * (i + 1));

            const installmentDesc = installmentsCount > 1
                ? `Medição #${measurement.number} (${i + 1}/${installmentsCount})`
                : `Medição #${measurement.number}`;

            await this.addTransaction(projectId, {
                date: dueDate.toISOString(),
                type: 'EXPENSE',
                category: 'Mão de Obra / Serviço',
                description: `Contrato: ${contract.title} - ${installmentDesc}`,
                value: installmentValue,
                status: 'PENDING',
                supplier: supplierName,
                measurementId: measurementId,
                notes: `Gerado da medição. Método: ${paymentMethod}.`
            });
        }

        console.log(`[FINANCIAL] Generated ${installmentsCount} forecast(s) for Measurement ${measurement.number}`);
    }
};
