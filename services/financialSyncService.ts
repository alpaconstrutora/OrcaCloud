import { supabase } from '../lib/supabase';
import { FinancialInfo, ProjectSettings } from '../types';
import { isSystemProject } from '../utils/systemProjects';

export const financialSyncService = {
    /**
     * Sincroniza os dados financeiros do projeto (parcelas e transações manuais)
     * com a tabela central de transações internas para conciliação.
     */
    async syncFinancialData(project: { id?: string; name: string; settings?: ProjectSettings }, organizationId: string) {
        if (!project || !organizationId) return;

        const settings = project.settings as ProjectSettings;
        const info = settings.financialInfo;
        if (!info) return;

        // O vault "Gestão Comercial" é um projeto de sistema: existe só para pendurar
        // as parcelas do comercial (vendas/locações), NÃO é uma obra.
        const isVault = isSystemProject(project);

        // Dimensão obra: o vault NUNCA carimba project_id. Ele tem um id real na tabela
        // `projects`, então `project.id ?? null` deixava passar o id do vault e as parcelas
        // de Vendas/Locações apareciam em Contas a Receber com Obra = "Gestão Comercial"
        // (vw_receivables faz LEFT JOIN projects → p.name). Parcela de comercial não tem
        // obra: fica null e a coluna mostra "—". Ver utils/systemProjects.ts e REGRA #2.
        const projectId = isVault ? null : (project.id ?? null);

        // Vault comercial é isento do hard-lock de período fechado (decisão de produto):
        // marca source_system='COMMERCIAL' para a trigger trg_block_period_internal_tx liberar.
        const sourceSystem = isVault ? 'COMMERCIAL' : 'PROJECT';

        const internalTxs: Record<string, unknown>[] = [];

        // 1. Processar Parcelas (Receitas)
        //
        // ⚠️ O VAULT COMERCIAL NÃO MATERIALIZA MAIS PARCELAS.
        // Desde 2026-08-01 as parcelas de Vendas/Locações vivem em
        // `deal_installments` e só vão para Contas a Receber pelo botão "Enviar
        // ao Contas a Receber" (dealInstallmentService.publishToReceivables).
        //
        // Sem este corte, o JSONB legado do vault continua sendo uma bomba: a
        // Conciliação Bancária (BankReconciliation) varre TODOS os projetos e
        // chama esta função direto — sem passar por syncDealToFinance, onde fica
        // o guard — e cada varredura reinseria em Contas a Receber tudo que o
        // usuário tinha acabado de tirar de lá. Foi exatamente o que aconteceu.
        //
        // Obra de verdade continua materializando normalmente: lá a parcela é do
        // projeto, não de uma negociação.
        if (!isVault && info.installments && info.installments.length > 0) {
            info.installments.forEach(inst => {
                internalTxs.push({
                    organization_id: organizationId,
                    source_system: sourceSystem,
                    reference_id: inst.id,
                    project_id: projectId,
                    transaction_date: inst.dueDate,
                    // due_date é o que Contas a Receber (vw_receivables) exibe na coluna
                    // Vencimento E o que a view usa para calcular VENCIDO. Sem ele a
                    // parcela aparecia sem vencimento e NUNCA era marcada como vencida.
                    due_date: inst.dueDate,
                    amount: inst.value,
                    direction: 'CREDIT',
                    description: inst.description || `Parcela - ${project.name}`,
                    entity_name: inst.clientName,
                    // Contas a Receber (vw_receivables) exibe party_name, não entity_name.
                    // Sem estes campos a parcela aparecia sem o nome do cliente.
                    party_name: inst.clientName,
                    party_id: inst.clientId ?? null, // FK clients(id), ON DELETE SET NULL
                    party_type: 'CLIENT',
                    category: (inst as unknown as Record<string, unknown>).category || 'Receita de Obra',
                    // Dimensões contábeis vindas do cabeçalho da negociação — SÓ no
                    // vault comercial. Numa obra estas colunas são preenchidas à mão
                    // em Contas a Receber; emiti-las aqui faria o upsert zerá-las a
                    // cada sync (o PostgREST monta as colunas pela união das chaves
                    // do array, então uma chave presente com null SOBRESCREVE).
                    ...(isVault ? {
                        cost_center_id: inst.costCenterId ?? null,
                        plano_de_contas_id: inst.planoDeContasId ?? null,
                    } : {}),
                    status: inst.status === 'PAID' ? 'CONCILIATED' : 'PENDING',
                    // business_status é o status de NEGÓCIO que Contas a Receber exibe
                    // e filtra (Previsto/Recebido/...). Ficava nulo em tudo que vinha de
                    // sync — e a regra de VENCIDO da view dependia dele.
                    business_status: inst.status === 'PAID' ? 'RECEBIDO' : 'PREVISTO'
                });
            });
        }

        // 2. Processar Transações Manuais (Despesas)
        if (info.transactions && info.transactions.length > 0) {
            info.transactions.forEach(tx => {
                internalTxs.push({
                    organization_id: organizationId,
                    source_system: sourceSystem,
                    reference_id: tx.id,
                    project_id: projectId,
                    transaction_date: tx.date,
                    amount: tx.value,
                    direction: tx.type === 'INCOME' ? 'CREDIT' : 'DEBIT',
                    description: tx.description || `Despesa - ${project.name}`,
                    entity_name: tx.supplier,
                    // Ponte ÒPURA: custo de obra carrega o fornecedor (FK) capturado no form.
                    supplier_id: tx.type === 'EXPENSE' ? (tx.supplierId || null) : null,
                    category: tx.category || 'Despesa de Obra',
                    status: tx.status === 'PAID' ? 'CONCILIATED' : 'PENDING',
                    /* Lançamento marcado como PAGO tem que trazer a data da baixa.
                       Sem isto, 277 títulos ficaram CONCILIATED com `payment_date`
                       nulo (levantamento de 15/08/2026) e sumiam de qualquer
                       relatório por data de pagamento.
                       `tx.date` é a data que a pessoa digita no formulário da obra
                       — confirmado com o usuário em 15/08/2026 que, para despesa
                       lançada como paga, ela É a data do pagamento.
                       A trigger `trg_payment_date_na_baixa` (20270909000002) não
                       cobre este caso: ela é BEFORE UPDATE, e aqui a linha nasce
                       já conciliada num upsert. */
                    payment_date: tx.status === 'PAID' ? tx.date : null,
                });
            });
        }

        if (internalTxs.length === 0) return;

        try {
            // Enriquecer category_id a partir do nome da categoria
            const categoryNames = [...new Set(internalTxs.map(tx => tx.category as string).filter(Boolean))];
            let catMap: Record<string, string> = {};
            if (categoryNames.length > 0) {
                const { data: cats } = await supabase
                    .from('financial_categories')
                    .select('id, name')
                    .in('name', categoryNames);
                if (cats) catMap = Object.fromEntries(cats.map(c => [c.name, c.id]));
            }
            const enrichedTxs = internalTxs.map(tx => ({
                ...tx,
                category_id: catMap[tx.category as string] ?? null,
            }));

            const { error } = await supabase
                .from('internal_transactions')
                .upsert(enrichedTxs, { onConflict: 'organization_id,reference_id,entry_type' });

            if (error) {
                console.error('[FINANCIAL-SYNC] Error during upsert:', error);
                throw error;
            }

            console.log(`[FINANCIAL-SYNC] Sincronizados ${internalTxs.length} registros para o projeto: ${project.name}`);
        } catch (err) {
            console.error('[FINANCIAL-SYNC] Failed to sync to internal_transactions:', err);
        }
    }
};
