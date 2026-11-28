import { supabase } from '../lib/supabase';
import { FinancialTransaction, PurchaseOrderItem, ProjectSettings, FinancialInfo } from '../types';
import { projectService } from './projectService';
import { isSystemProject } from '../utils/systemProjects';
import { measurementRef } from '../lib/receivableRef';
import { criarFinanceiroDoPedido, linhaDoRazao, MARCA_PARCELA_SEM_NOTA, type ResultadoSyncPedido } from './pedidoFinanceiroMotor';

// Moram no motor (mesmo código no navegador e na Edge `pedido-recebimento`); reexportados para quem já importava daqui.
export { MARCA_PARCELA_SEM_NOTA, type ResultadoSyncPedido };

/**
 * Campos de `internal_transactions` que o JSONB do projeto não carrega.
 * Não expõe partyId de propósito: internal_transactions.party_id tem FK só
 * para `clients` (internal_txs_party_id_fkey), e tudo que passa por aqui é
 * despesa com fornecedor — gravar o supplier_id ali viola a FK.
 * `supplierId` é outra coluna, com FK própria para `suppliers` — é o que
 * Contas a Pagar usa para resolver o Credor pelo cadastro vivo (razão
 * social/apelido), em vez do texto congelado de `party_name`/`entity_name`.
 */
type InternalTxSyncOptions = {
    sourceSystem?: string;
    /**
     * Chave de origem gravada em `internal_transactions.reference_id`. Sem ela o
     * espelho nasce com o uuid do lançamento no JSON do projeto — um id que NADA
     * mais conhece, então o lançamento fica órfão de toda consulta que procura
     * pela origem.
     *
     * ⚠️ Precisa ser ÚNICA por linha: existe
     * `UNIQUE (organization_id, reference_id, entry_type)`. A convenção do
     * sistema é composta — `'<id da origem>:p<n>'` — e as consultas casam por
     * PREFIXO (`LIKE '<id>%'`), nunca por igualdade.
     */
    referenceId?: string;
    partyType?: 'SUPPLIER' | 'CLIENT' | null;
    partyName?: string | null;
    supplierId?: string | null;
    /**
     * Vínculo PRIMÁRIO título→pedido (`internal_transactions.purchase_order_id`).
     * Para parcela de pedido `reference_id` continua sendo o id do tx do JSON,
     * de propósito: `financialSyncService.syncFinancialData` faz upsert de todo
     * o JSON da obra por `(organization_id, reference_id, entry_type)` — com um
     * `reference_id` composto aqui, o upsert não acharia a linha e criaria uma
     * segunda (título duplicado). Quem procura "as parcelas do pedido X" usa
     * esta coluna (`purchase_order_financeiro_json`, aplicar_20270921000026).
     */
    purchaseOrderId?: string | null;
};

/**
 * Identidade natural de um lançamento derivado de contrato, para reconhecer a
 * MESMA parcela entre duas execuções do sync.
 *
 * O `id` não serve: ele é `crypto.randomUUID()` gerado a cada regeração da série,
 * então a mesma parcela nunca tem o mesmo id duas vezes. O que não muda é a
 * combinação data do vencimento, descrição, valor e tipo — é ela que identifica
 * "Fatura Contrato 005 (1) - junho de 2026, R$ 600, despesa".
 *
 * A data é cortada em YYYY-MM-DD porque o gerador grava `...T12:00:00.000Z` e
 * versões antigas podem ter gravado só o dia.
 */
export function chaveNaturalDaTransacao(tx: { date?: string; description?: string; value?: number; type?: string }): string {
    const dia = String(tx.date ?? '').slice(0, 10);
    const descricao = String(tx.description ?? '').trim().toLowerCase();
    const valor = Number(tx.value ?? 0).toFixed(2);
    return `${dia}|${descricao}|${valor}|${tx.type ?? ''}`;
}

/**
 * Das linhas novas, devolve só as que ainda não existem na lista atual.
 * Duas linhas novas com a mesma chave dentro do mesmo lote também colapsam:
 * a série gerada não deve trazer a mesma parcela duas vezes.
 */
export function transacoesAindaNaoGravadas<T extends { date?: string; description?: string; value?: number; type?: string }>(
    existentes: readonly T[],
    novas: readonly T[],
): T[] {
    const vistas = new Set((existentes || []).map(chaveNaturalDaTransacao));
    const saida: T[] = [];
    for (const tx of novas) {
        const chave = chaveNaturalDaTransacao(tx);
        if (vistas.has(chave)) continue;
        vistas.add(chave);
        saida.push(tx);
    }
    return saida;
}

export const financialService = {
    /**
     * Adds a transaction to a project's financial settings.
     */
    async addTransaction(
        projectId: string,
        transaction: Omit<FinancialTransaction, 'id'>,
        sync?: InternalTxSyncOptions
    ) {
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

        // Sync to internal_transactions — fonte de vw_payables / vw_receivables.
        // due_date e business_status são obrigatórios de fato: as views derivam
        // VENCIDO deles, e sem due_date a parcela nasce sem vencimento na tela.
        try {
            const { error } = await supabase.from('internal_transactions').insert(linhaDoRazao(
                newTx,
                { organizationId: settings.organizationId, projectId: isSystemProject(project) ? null : projectId },
                sync,
            ));
            if (error) throw error;
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
    /**
     * Grava um lote de lançamentos derivados (hoje: séries de parcelas de contrato).
     *
     * ⚠️ IDEMPOTENTE desde 09/2026. Antes, as duas gravações abaixo faziam
     * `[...novas, ...existentes]` sem conferir nada, e a série inteira era regerada
     * com `crypto.randomUUID()` novo a cada chamada. Sincronizar o mesmo contrato
     * três vezes deixava três cópias de cada parcela no JSON do cofre, que o
     * `financialSyncService` espelhava em `internal_transactions` como COMMERCIAL.
     * Medido em produção em 05/09/2026: 49 grupos duplicados, 61 linhas excedentes,
     * R$ 36.600 de contas a pagar que não existem. Ver
     * `docs/planos/2026-09-05-titulos-duplicados-por-sincronizacao.md`.
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
                    .select('id, name, settings, budget')
                    .eq('name', 'Gestão Comercial')
                    .filter('settings->>organizationId', 'eq', orgId)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (vaultProjects && vaultProjects.length > 0) {
                    const vault = vaultProjects[0];
                    const vaultInfo = vault.settings?.financialInfo || {
                        totalValue: 0, paymentMethod: 'Variavel', installments: [], transactions: []
                    };

                    const existentes = vaultInfo.transactions || [];
                    const inserir = transacoesAindaNaoGravadas(existentes, newTxs);
                    if (inserir.length === 0) {
                        console.log(`[CONTRACTS-BATCH] Nada a gravar no cofre: as ${newTxs.length} parcelas já existem (org: ${orgId})`);
                        return [];
                    }

                    const updatedVault = {
                        ...vault,
                        settings: {
                            ...vault.settings,
                            financialInfo: { ...vaultInfo, transactions: [...inserir, ...existentes] }
                        }
                    };

                    await projectService.saveProject(updatedVault);
                    console.log(`[CONTRACTS-BATCH] Gravadas ${inserir.length} de ${newTxs.length} parcelas no cofre Gestão Comercial (${newTxs.length - inserir.length} já existiam) (org: ${orgId})`);
                    return inserir;
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

            const existentes = info.transactions || [];
            const inserir = transacoesAindaNaoGravadas(existentes, newTxs);
            if (inserir.length === 0) {
                console.log(`[CONTRACTS-BATCH] Fallback: as ${newTxs.length} parcelas já existem no projeto ${projectId}`);
                return [];
            }

            await projectService.saveProject({
                ...project,
                settings: {
                    ...settings,
                    financialInfo: { ...info, transactions: [...inserir, ...existentes] }
                }
            });
            console.log(`[CONTRACTS-BATCH] Fallback: gravadas ${inserir.length} de ${newTxs.length} parcelas no projeto ${projectId}`);
            return inserir;
        } catch (e) {
            console.error('[CONTRACTS-BATCH] Fallback save also failed:', e);
        }

        return newTxs;
    },



    /**
     * Gera as parcelas do pedido no Contas a Pagar (JSON da obra + razão).
     *
     * Regra de sempre: pedido Entregue/Recebido/Divergência COM nota fiscal
     * vinculada — é chamada sozinha na mudança de status e no vínculo da nota.
     *
     * `permitirSemNota` (19/10/2026, botão "Gerar título a pagar" da aba
     * Financeiro do pedido): existe compra sem nota fiscal. Gera mesmo sem nota
     * e carimba a parcela com `MARCA_PARCELA_SEM_NOTA`. Se a nota for vinculada
     * DEPOIS, o sync automático vê a marca e MANTÉM as parcelas — sem apagar e
     * regerar, que trocaria os ids e soltaria vínculo de boleto/conciliação.
     *
     * Devolve o que aconteceu: quem chama por botão precisa poder dizer por
     * que nada foi gerado.
     *
     * O código mora em `services/pedidoFinanceiroMotor.ts` (o mesmo que a Edge
     * `pedido-recebimento` usa); aqui roda com a sessão do usuário.
     */
    syncOrderToFinance(orderId: string, opcoes: { permitirSemNota?: boolean } = {}): Promise<ResultadoSyncPedido> {
        return criarFinanceiroDoPedido(supabase).syncOrderToFinance(orderId, opcoes);
    },

    /**
     * Synchronizes a contract measurement with the financial module.
     * Generates a payment forecast based on the contract's terms.
     */
    async syncMeasurementToFinance(measurementId: string) {
        // 1. Fetch Measurement
        const { data: measurement, error: mError } = await supabase
            .from('contract_measurements')
            .select('id, contract_id, number, period_start, period_end, measurement_date, status, total_value, retention_value, net_value, notes, invoice_url, created_at')
            .eq('id', measurementId)
            .single();

        if (mError || !measurement) {
            console.error("[FINANCIAL] Measurement not found for sync:", measurementId);
            return;
        }

        // 2. Fetch Contract
        const { data: contract, error: cError } = await supabase
            .from('contracts')
            .select('id, organization_id, project_id, supplier_id, number, title, nature, start_date, end_date, status, original_value, current_value, retention_rate, responsible_email, empresa_id, cost_center_id, category_id, payment_method, payment_term_type, payment_days, payment_installments, direction, created_at')
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
                }, {
                    sourceSystem: 'CONTRACT_MEASUREMENT',
                    referenceId: measurementRef(contract.id, measurementId, i + 1),
                    partyType: 'SUPPLIER',
                    partyName: supplierName,
                    supplierId: contract.supplier_id ?? null,
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
            }, {
                sourceSystem: 'CONTRACT_MEASUREMENT',
                referenceId: measurementRef(contract.id, measurementId, i + 1),
                partyType: 'SUPPLIER',
                partyName: supplierName,
                supplierId: contract.supplier_id ?? null,
            });
        }

        console.log(`[FINANCIAL] Generated ${installmentsCount} forecast(s) for Measurement ${measurement.number}`);
    }
};
