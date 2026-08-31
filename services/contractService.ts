import { supabase } from '../lib/supabase';
import { financialService } from './financialService';
import { projectService } from './projectService';
import { approvalService } from './approvalService';
import { normalizeIndexName } from './contractIndexService';
import { commercialFinanceService } from './commercialFinanceService';
import { generateRentalContractNumber } from './rentalContractNumberingService';
import { generateUnitSaleContractNumber } from './unitSaleContractNumberingService';
import { INITIAL_PROJECT_SETTINGS } from '../constants';
import { BudgetEntry } from '../types/budget';
import {
    Contract,
    ContractItem,
    ContractAddendum,
    ContractMeasurement,
    ContractMeasurementItem,
    ContractUtilityBill,
    ContractRetentionLedger,
    ContractRetentionRelease,
    ContractPrecedentCondition,
    ContractDocumentRequirement,
    ContractDocumentGateItem,
    DocumentRequirementPhase
} from '../types';

// Colunas de aditivo — inclui os campos de prorrogação e assinatura da
// migration 20270828000002. Mantido em constante porque três consultas leem a
// mesma coisa e a lista já ficou longa demais para repetir.
const ADDENDUM_COLS =
    'id, contract_id, organization_id, number, type, description, value_impact, new_end_date, ' +
    'new_start_date, previous_end_date, new_value, previous_value, reajuste_index, reajuste_fator, ' +
    'installments_generated, status, requested_by, approved_by, approved_at, notes, ' +
    'signature_status, signature_token, signature_url, signature_completed_at, signed_document_url, created_at';

// Resolve supplier name from DB (returns fallback string on error)
async function resolveSupplierName(supplierId: string | undefined, fallback: string): Promise<string> {
    if (!supplierId) return fallback;
    try {
        const { data } = await supabase.from('suppliers').select('name').eq('id', supplierId).maybeSingle();
        return data?.name || fallback;
    } catch { return fallback; }
}

/**
 * Direção de CAIXA do contrato: recebível (dinheiro entra) × pagável (dinheiro sai).
 *
 * ⚠️ NÃO usar `contract.direction` para isto. Esse campo carrega semântica de
 * DOMÍNIO legada e INVERTIDA em relação ao caixa: contratos de SUPRIMENTOS são
 * gravados com direction='INCOMING' (herança da numeração/listagem antiga), mas
 * Suprimentos é onde você PAGA o fornecedor → pagável. Ler `direction` como
 * direção de caixa (INCOMING→CREDIT) era exatamente o bug de contratos de
 * Suprimentos caindo em Contas a Receber.
 *
 * Regra de negócio por domínio (fonte de verdade = `domain`):
 *   • SUPRIMENTOS                 → você PAGA o fornecedor → PAGÁVEL  (DEBIT).
 *   • VENDAS / SERVICOS / LOCACAO → você RECEBE do cliente → RECEBÍVEL (CREDIT).
 * Fallback (domain nulo, contratos legados pré-coluna domain): semântica ORIGINAL
 * de direction — OUTGOING=para cliente=recebível; INCOMING/nulo=fornecedor=pagável.
 */
function isReceivableContract(contract: { domain?: string | null; direction?: string | null }): boolean {
    if (contract.domain) return contract.domain !== 'SUPRIMENTOS';
    return contract.direction === 'OUTGOING';
}

/**
 * Contrato COMERCIAL (locação/venda) só propaga parcela pra Contas a Receber
 * AUTOMATICAMENTE (na criação/edição do contrato, sem clique explícito do
 * usuário) depois de assinado OU emitido.
 *
 * Antes de 02/08/2026 o motor lançava em Contas a Receber assim que o contrato
 * existia — inclusive em ASSINATURA, ou seja, antes de o cliente assinar. Junto
 * com o auto-lançamento da negociação, era isso que enchia o financeiro de
 * cobrança de negócio que ainda não fechou. O usuário mandou eliminar.
 *
 * Este portão só se aplica à propagação AUTOMÁTICA
 * (syncParceladoScheduleToFinance/syncRecurringToFinance, disparadas por
 * criação/edição). O clique explícito em "Gerar parcelas"
 * (generateRecurringInstallmentsForPeriod) NÃO passa por aqui — ato explícito
 * do usuário sempre foi permitido (mesma regra de
 * project_deal_installments_serie_unica: "nada cria cobrança por varredura ou
 * efeito colateral", clique explícito não é efeito colateral).
 *
 * Suprimentos/Serviços NÃO passam por aqui: são Contas a Pagar, com fluxo de
 * aprovação próprio, e mexer neles não foi pedido.
 *
 * Libera por QUALQUER UM destes (união, não substituição — 2026-08-05):
 *   1. Documento EMITIDO: alguma versão em `minuta_versions` com `emitted`.
 *      Critério pedido pelo usuário — "as parcelas só se propagam quando o
 *      contrato for emitido". É o único critério para contratos NOVOS a
 *      partir de agora.
 *   2. `signature_status = 'SIGNED'` OU `status` em/após a assinatura (lista
 *      abaixo) — critério ANTIGO, mantido só para não regredir contratos já
 *      em produção sem nenhuma minuta emitida (verificado no banco em
 *      2026-08-05: CL-2026-001 a 004, status 'Ativo', zero minutas — se o
 *      critério antigo saísse, esses 4 parariam de faturar imediatamente).
 *
 * ⚠️ A lista do critério 2 precisa cobrir TUDO que `createFromDeal` grava,
 * senão o portão fica invertido. Ele mapeia o estágio do negócio assim:
 *   deal COMPLETED        → 'Concluído'
 *   signature SIGNED      → 'Assinado'
 *   qualquer outro caso   → 'Ativo'   ← o MENOS avançado
 * Até 04/08/2026 só `'ativo'` passava: o negócio ainda em andamento faturava,
 * e o negócio FECHADO ('Concluído') era o único bloqueado — exatamente o
 * contrário da intenção. Caso real: CL-2026-005 e CV-2026-002, travados em
 * "contrato ainda não está assinado" com a negociação toda concluída.
 */
const STATUS_CONTRATO_FATURAVEL = ['ativo', 'assinado', 'concluído', 'concluido'];

function podeFaturarContratoComercial(contract: {
    domain?: string | null; status?: string | null; signature_status?: string | null;
    minuta_versions?: { emitted?: boolean }[] | null;
}): boolean {
    const comercial = contract.domain === 'LOCACAO' || contract.domain === 'VENDAS';
    if (!comercial) return true;
    const emitido = (contract.minuta_versions ?? []).some(v => v.emitted);
    return emitido
        || contract.signature_status === 'SIGNED'
        || STATUS_CONTRATO_FATURAVEL.includes((contract.status || '').toLowerCase());
}

/**
 * Resolve a contraparte cadastrada de um contrato para popular party_type/party_name
 * (e party_id/supplier_id) nos lançamentos internos.
 * Recebível → cliente; pagável → fornecedor (ver isReceivableContract).
 * IMPORTANTE: internal_transactions.party_id tem FK só para clients
 * (internal_txs_party_id_fkey). Por isso party_id só é setado para CLIENTE;
 * para fornecedor, gravamos party_type/party_name e o `supplier_id` — coluna
 * própria, com FK para `suppliers`, que Contas a Pagar usa para resolver o
 * Credor pelo cadastro vivo (razão social/apelido) em vez do texto congelado.
 */
async function resolveContractParty(
    contract: Contract,
    fallbackName: string,
): Promise<{ party_id: string | null; party_type: 'SUPPLIER' | 'CLIENT' | null; party_name: string | null; supplier_id: string | null }> {
    const cAny = contract as unknown as { domain?: string; direction?: string; client_id?: string; supplier_id?: string };
    if (!cAny.client_id && !cAny.supplier_id) return { party_id: null, party_type: null, party_name: null, supplier_id: null };

    // Rótulo segue a direção de caixa (recebível = cliente; pagável = fornecedor),
    // mas o NOME é resolvido de qualquer id que exista (a contraparte às vezes está em supplier_id).
    const isIncoming = isReceivableContract(cAny);
    const partyType: 'SUPPLIER' | 'CLIENT' = isIncoming ? 'CLIENT' : 'SUPPLIER';
    let name = fallbackName;
    try {
        if (cAny.client_id) {
            const { data } = await supabase.from('clients').select('name').eq('id', cAny.client_id).maybeSingle();
            name = data?.name || fallbackName;
        } else if (cAny.supplier_id) {
            name = await resolveSupplierName(cAny.supplier_id, fallbackName);
        }
    } catch { /* mantém fallback */ }

    // party_id tem FK só p/ clients → só preenche quando há cliente real
    const partyId = isIncoming && cAny.client_id ? cAny.client_id : null;
    // supplier_id tem FK própria p/ suppliers → só preenche no lado pagável
    const supplierId = !isIncoming && cAny.supplier_id ? cAny.supplier_id : null;
    return { party_id: partyId, party_type: partyType, party_name: name, supplier_id: supplierId };
}

// Find the "Gestão Comercial" vault for an org
async function findVault(orgId: string) {
    const { data } = await supabase
        .from('projects')
        .select('id, name, settings')
        .eq('name', 'Gestão Comercial')
        .filter('settings->>organizationId', 'eq', orgId)
        .order('created_at', { ascending: false })
        .limit(1);
    return data?.[0] ?? null;
}

// Remove all transactions tagged [contract:id] from project JSONB (priority) or vault (fallback)
async function removeContractTransactions(contractId: string, orgId: string | undefined, projectId: string | undefined) {
    const tag = `[contract:${contractId}]`;
    // Priority 1: project JSONB
    if (projectId) {
        try {
            const project = await projectService.loadProject(projectId);
            if (project) {
                const info = (project.settings as any)?.financialInfo;
                if (info) {
                    const cleaned = (info.transactions || []).filter((t: any) => !(t.notes || '').includes(tag));
                    if (cleaned.length !== (info.transactions || []).length) {
                        await projectService.saveProject({ ...project, settings: { ...project.settings, financialInfo: { ...info, transactions: cleaned } } });
                    }
                }
                return;
            }
        } catch (e) { console.error('[CONTRACTS] removeContractTransactions project error:', e); }
    }
    // Fallback: vault
    if (orgId) {
        try {
            const vault = await findVault(orgId);
            if (vault) {
                const vaultInfo = vault.settings?.financialInfo;
                if (!vaultInfo) return;
                const cleaned = (vaultInfo.transactions || []).filter((t: any) => !(t.notes || '').includes(tag));
                if (cleaned.length !== (vaultInfo.transactions || []).length) {
                    await supabase.from('projects').update({
                        settings: { ...vault.settings, financialInfo: { ...vaultInfo, transactions: cleaned } }
                    }).eq('id', vault.id);
                }
            }
        } catch (e) { console.error('[CONTRACTS] removeContractTransactions vault error:', e); }
    }
}

/**
 * Remove as transações do contrato geradas A PARTIR de uma data (parcelas no
 * JSONB do projeto/vault). Variante de `removeContractTransactions` usada pela
 * renovação: ao renovar, só as parcelas FUTURAS do contrato-pai são cortadas —
 * as anteriores ao início do filho e as já pagas permanecem, senão o histórico
 * financeiro do pai deixaria de bater.
 */
export async function removeContractTransactionsFrom(
    contractId: string,
    orgId: string | undefined,
    projectId: string | undefined,
    fromDate: string,
): Promise<number> {
    const tag = `[contract:${contractId}]`;
    const keep = (t: any) => {
        if (!(t.notes || '').includes(tag)) return true;          // não é deste contrato
        if (t.status === 'PAID') return true;                     // pago nunca é removido
        return (t.date || '').slice(0, 10) < fromDate;            // anterior ao corte, mantém
    };

    if (projectId) {
        try {
            const project = await projectService.loadProject(projectId);
            if (project) {
                const info = (project.settings as any)?.financialInfo;
                if (!info) return 0;
                const before = (info.transactions || []).length;
                const cleaned = (info.transactions || []).filter(keep);
                if (cleaned.length !== before) {
                    await projectService.saveProject({
                        ...project,
                        settings: { ...project.settings, financialInfo: { ...info, transactions: cleaned } }
                    });
                }
                return before - cleaned.length;
            }
        } catch (e) { console.error('[CONTRACTS] removeContractTransactionsFrom project error:', e); }
        return 0;
    }

    if (orgId) {
        try {
            const vault = await findVault(orgId);
            if (!vault) return 0;
            const vaultInfo = vault.settings?.financialInfo;
            if (!vaultInfo) return 0;
            const before = (vaultInfo.transactions || []).length;
            const cleaned = (vaultInfo.transactions || []).filter(keep);
            if (cleaned.length !== before) {
                await supabase.from('projects').update({
                    settings: { ...vault.settings, financialInfo: { ...vaultInfo, transactions: cleaned } }
                }).eq('id', vault.id);
            }
            return before - cleaned.length;
        } catch (e) { console.error('[CONTRACTS] removeContractTransactionsFrom vault error:', e); }
    }
    return 0;
}

/**
 * Próximo número da sequência de LOCAÇÃO (`CL-{empreendimento}-{unidade}-{seq}`),
 * independente da de vendas. Usado por `createFromDeal` e pela renovação
 * (contractRenewalService).
 *
 * A máscara e o contador vivem em `rentalContractNumberingService` desde
 * 15/08/2026 (Configurações do Sistema › Nomenclatura › Contratos de Locação).
 * O contador é por UNIDADE (chegada via `vw_unit_property_map`, não há obra em
 * contrato de locação) e é atômico no banco — dois usuários gerando contrato da
 * mesma unidade ao mesmo tempo não colidem.
 *
 * `propertyId` é `commercial_properties.id` da unidade principal da
 * negociação — mesmo campo que `resolveDealUnitsInfo` já resolve.
 */
export async function nextRentalNumber(propertyId: string, extra?: { clientId?: string | null; costCenterId?: string | null }): Promise<string> {
    return generateRentalContractNumber(propertyId, extra);
}

/**
 * Dados das unidades de uma negociação, numa passagem só:
 *  • `unitLabel`       — nomes concatenados, para o título do contrato
 *                        ("Apto 101 + Vaga 12"). Um contrato de locação pode
 *                        reunir apto + vaga + box.
 *  • `companyId`       — empresa dona da unidade PRINCIPAL. Vira
 *                        `contracts.empresa_id`, que já é filtro em produção
 *                        (`listContractsByEmpresa`) e até aqui nunca era
 *                        preenchido em locação — nenhum contrato aparecia lá.
 *  • `executionAddress`— endereço da unidade principal numa linha. Alimenta
 *                        `contracts.execution_address`, que já é token do
 *                        catálogo de documentos: modelos .docx existentes
 *                        passam a resolver "local do imóvel" sem mudança.
 *
 * Nunca lança: falhar aqui não pode impedir a geração do contrato.
 */
export async function resolveDealUnitsInfo(dealId: string, fallbackPropertyId?: string): Promise<{
    unitLabel: string;
    companyId?: string;
    executionAddress?: string;
    /** `commercial_properties.id` da unidade PRINCIPAL — entrada da numeração de contrato (locação/venda). */
    primaryPropertyId?: string;
}> {
    try {
        const { data: unitRows } = await supabase
            .from('commercial_deal_units')
            .select('property_id, is_primary')
            .eq('deal_id', dealId);

        const rows = (unitRows || []) as { property_id: string; is_primary?: boolean }[];
        const ids = rows.map(u => u.property_id);
        if (ids.length === 0 && fallbackPropertyId) ids.push(fallbackPropertyId);
        if (ids.length === 0) return { unitLabel: '' };

        const { data: props } = await supabase
            .from('commercial_properties')
            .select('id, name, company_id, street, number, complement, neighborhood, city, state, zip_code, address')
            .in('id', ids);

        type Row = {
            id: string; name?: string; company_id?: string; street?: string; number?: string;
            complement?: string; neighborhood?: string; city?: string; state?: string;
            zip_code?: string; address?: string;
        };
        const byId = new Map((props || []).map(p => [(p as Row).id, p as Row]));

        const unitLabel = ids
            .map(id => (byId.get(id)?.name || '').trim())
            .filter(Boolean)
            .join(' + ');

        const primaryId = rows.find(r => r.is_primary)?.property_id ?? ids[0];
        const primary = byId.get(primaryId);

        // `street` só existe nas linhas migradas; `address` é o campo legado de
        // texto livre e continua sendo o preenchido em muitas unidades antigas.
        const line = primary ? [
            [primary.street, primary.number].filter(Boolean).join(', '),
            primary.complement,
            primary.neighborhood,
            primary.city && primary.state ? `${primary.city}/${primary.state}` : (primary.city || primary.state),
            primary.zip_code ? `CEP ${primary.zip_code}` : '',
        ].filter(Boolean).join(' - ') : '';

        return {
            unitLabel,
            companyId: primary?.company_id || undefined,
            executionAddress: line || primary?.address || undefined,
            primaryPropertyId: primaryId || undefined,
        };
    } catch {
        return { unitLabel: '' };
    }
}

/**
 * Aplica um aditivo de PRORROGAÇÃO de locação: estende a vigência do próprio
 * contrato e gera as parcelas do período novo.
 *
 * Diferente da renovação por contrato-filho, aqui o contrato NÃO é encerrado —
 * é o mesmo contrato que continua, com `end_date` avançado. Por isso nada
 * anterior a `new_start_date` é tocado.
 *
 * Retorna false quando o aditivo não é desse tipo (aí o chamador segue pelo
 * caminho antigo, de suprimentos/serviços).
 */
async function applyProrrogacaoAddendum(addendum: ContractAddendum, approvedBy: string): Promise<boolean> {
    const { data: contract, error } = await supabase
        .from('contracts')
        .select('id, organization_id, project_id, deal_id, number, title, domain, is_recurring, start_date, end_date, billing_cycle, due_day, payment_days, original_value, current_value, supplier_id, client_id, direction, status')
        .eq('id', addendum.contract_id)
        .single();
    if (error) throw error;

    // Gate: prorrogação só existe para locação recorrente. Qualquer outra coisa
    // volta para o caminho legado — não vamos gerar parcela em contrato de
    // fornecedor por causa de um campo homônimo.
    if (!contract.is_recurring || contract.domain !== 'LOCACAO') return false;

    const novoValor = addendum.new_value ?? contract.current_value ?? contract.original_value ?? 0;
    const inicio = addendum.new_start_date!;
    const fim = addendum.new_end_date;
    if (!fim) throw new Error('Aditivo de prorrogação sem nova data de término.');

    // 1) Corta o resíduo da NEGOCIAÇÃO no período novo. A negociação só conhece
    //    a vigência original; o que ela tiver dali para frente colidiria com as
    //    parcelas do aditivo (mesmo aluguel cobrado duas vezes).
    if (contract.deal_id && contract.organization_id) {
        try {
            await commercialFinanceService.deleteDealInstallmentsFrom(
                contract.deal_id, contract.organization_id, inicio);
        } catch (e) {
            console.error('[CONTRACTS] Prorrogação: erro ao cortar parcelas da negociação:', e);
        }
    }

    // 2) Estende o contrato. UPDATE direto de propósito: updateContract
    //    recalcularia current_value e apagaria o reajuste embutido no aditivo.
    const proximoReajuste = (() => {
        const [y, m, d] = inicio.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        dt.setUTCFullYear(dt.getUTCFullYear() + 1);
        return dt.toISOString().slice(0, 10);
    })();

    const { error: updErr } = await supabase
        .from('contracts')
        .update({
            end_date: fim,
            current_value: novoValor,
            reajuste_data_base: inicio,
            reajuste_proximo: proximoReajuste,
            status: contract.status === 'Encerrado' ? 'Ativo' : contract.status,
        })
        .eq('id', contract.id);
    if (updErr) throw updErr;

    // 3) Gera as parcelas só da janela nova (idempotente por data).
    const result = await generateRecurringInstallmentsForPeriod(
        { ...contract, end_date: fim } as unknown as Contract,
        { fromDate: inicio, toDate: fim, amount: novoValor, label: `Aluguel ${contract.number || ''} (${addendum.number})`.trim() },
    );

    await supabase
        .from('contract_addendums')
        .update({ installments_generated: result.inserted })
        .eq('id', addendum.id);

    console.log(`[CONTRACTS] Aditivo ${addendum.number} aprovado por ${approvedBy}: vigência até ${fim}, ${result.inserted} parcela(s) geradas (${result.skipped} já existiam).`);
    return true;
}

// Returns all measurement IDs for a contract (used to clean up measurement-based transactions)
async function getContractMeasurementIds(contractId: string): Promise<string[]> {
    try {
        const { data } = await supabase
            .from('contract_measurements')
            .select('id')
            .eq('contract_id', contractId);
        return (data || []).map((r: any) => r.id);
    } catch { return []; }
}

// Removes all transactions belonging to this contract: tag-based OR measurement-based
function isContractTx(t: any, contractTag: string, measurementIds: string[]): boolean {
    if ((t.notes || '').includes(contractTag)) return true;
    if (t.measurementId && measurementIds.includes(t.measurementId)) return true;
    return false;
}

// Generate financial transactions from payment_schedule for a Parcelado contract.
// Writes to both: project JSONB (Despesas tab) and internal_transactions table (Conciliação tab).
async function syncParceladoScheduleToFinance(contract: Contract) {
    if (!contract.payment_schedule?.length || contract.is_recurring) return;
    // Só fatura contrato comercial depois de assinado — ver podeFaturarContratoComercial.
    if (!podeFaturarContratoComercial(contract)) {
        console.log(`[CONTRACTS] Contrato ${contract.number || contract.id} ainda não assinado — nada lançado em Contas a Receber.`);
        return;
    }
    try {
        const supplierName = await resolveSupplierName(contract.supplier_id, 'Fornecedor');
        const tag = `[contract:${contract.id}]`;
        const measurementIds = await getContractMeasurementIds(contract.id);

        const newTxs = contract.payment_schedule.map((inst, i) => ({
            id: crypto.randomUUID(),
            date: inst.date + 'T12:00:00.000Z',
            type: 'EXPENSE' as const,
            category: 'Mão de Obra / Serviço',
            description: `Contrato: ${contract.title || contract.number} - Parcela ${i + 1}/${contract.payment_schedule!.length}`,
            value: inst.value,
            status: 'PENDING' as const,
            supplier: supplierName,
            notes: `${tag} Parcela ${i + 1} gerada automaticamente do contrato ${contract.number || contract.id}`
        }));

        // ── 1. Project JSONB (aba Despesas) ────────────────────────────────────
        if (contract.project_id) {
            const project = await projectService.loadProject(contract.project_id);
            if (project) {
                const info = (project.settings as any)?.financialInfo || { totalValue: 0, paymentMethod: 'Parcelamento Próprio', installments: [], transactions: [] };
                const toRemove = (info.transactions || []).filter((t: any) => isContractTx(t, tag, measurementIds));
                const kept = (info.transactions || []).filter((t: any) => !isContractTx(t, tag, measurementIds));
                await projectService.saveProject({
                    ...project,
                    settings: { ...project.settings, financialInfo: { ...info, transactions: [...newTxs, ...kept] } }
                });
                // Remove internal_transactions mirror entries created by addTransaction (source_system='PROJECT')
                const removedIds = toRemove.map((t: any) => t.id).filter(Boolean);
                if (removedIds.length > 0 && contract.organization_id) {
                    await supabase.from('internal_transactions')
                        .delete()
                        .eq('source_system', 'PROJECT')
                        .in('reference_id', removedIds);
                }
                console.log(`[CONTRACTS] Synced ${newTxs.length} parcelado txs to project JSONB, removed ${toRemove.length} old`);
            }
        } else if (contract.organization_id) {
            // Fallback: org-level vault
            const vault = await findVault(contract.organization_id);
            if (vault) {
                const vaultInfo = vault.settings?.financialInfo || { totalValue: 0, paymentMethod: 'Variavel', installments: [], transactions: [] };
                const kept = (vaultInfo.transactions || []).filter((t: any) => !isContractTx(t, tag, measurementIds));
                await supabase.from('projects').update({
                    settings: { ...vault.settings, financialInfo: { ...vaultInfo, transactions: [...newTxs, ...kept] } }
                }).eq('id', vault.id);
            }
        }

        // ── 2. internal_transactions (aba Conciliação) ─────────────────────────
        // reference_id uses contract.id:pN pattern to satisfy the (org, reference) unique constraint
        if (contract.organization_id) {
            // Remove old entries: use LIKE 'contract.id%' to catch all installment keys
            const { data: oldRows } = await supabase
                .from('internal_transactions')
                .select('id')
                .eq('organization_id', contract.organization_id)
                .eq('source_system', 'CONTRACT_PARCELADO')
                .like('reference_id', `${contract.id}%`);
            if (oldRows?.length) {
                await supabase.from('internal_transactions')
                    .delete()
                    .in('id', oldRows.map((r: any) => r.id));
            }
            if (measurementIds.length > 0) {
                await supabase.from('internal_transactions')
                    .delete()
                    .eq('organization_id', contract.organization_id)
                    .eq('source_system', 'CONTRACT_MEASUREMENT')
                    .in('reference_id', measurementIds);
            }

            // Insert one row per installment with unique reference_id
            const party = await resolveContractParty(contract, supplierName);
            const txDirection = isReceivableContract(contract) ? 'CREDIT' : 'DEBIT';
            const internalRows = newTxs.map((tx, i) => ({
                organization_id: contract.organization_id,
                source_system: 'CONTRACT_PARCELADO',
                reference_id: `${contract.id}:p${i + 1}`,
                project_id: contract.project_id ?? null,
                transaction_date: tx.date.split('T')[0],
                // Vencimento da parcela — Contas a Receber exibe due_date e a view
                // calcula VENCIDO a partir dele; sem isso a parcela nasce sem data.
                due_date: tx.date.split('T')[0],
                amount: tx.value,
                direction: txDirection,
                description: tx.description,
                category: 'Mão de Obra / Serviço',
                entity_name: party.party_name ?? supplierName,
                supplier_id: party.supplier_id,
                party_id: party.party_id,
                party_type: party.party_type,
                party_name: party.party_name,
                status: 'PENDING',
                // Status de NEGÓCIO exibido/filtrado em Contas a Receber. Ficava nulo,
                // e a regra de VENCIDO da view dependia dele estar preenchido.
                business_status: 'PREVISTO',
            }));
            // UPSERT: reference_id embute a parcela e o vencimento é editável —
            // ver nota em generateRecurringInstallmentsForPeriod (erro 23505).
            await supabase.from('internal_transactions')
                .upsert(internalRows, { onConflict: 'organization_id,reference_id,entry_type' });
            console.log(`[CONTRACTS] Synced ${internalRows.length} parcelado txs to internal_transactions`);
        }
    } catch (e) {
        console.error('[CONTRACTS] Error syncing parcelado schedule to finance:', e);
    }
}

function advanceCycle(date: Date, cycle: string | undefined) {
    if (cycle === 'Anual') date.setFullYear(date.getFullYear() + 1);
    else if (cycle === 'Semestral') date.setMonth(date.getMonth() + 6);
    else if (cycle === 'Bimestral') date.setMonth(date.getMonth() + 2);
    else date.setMonth(date.getMonth() + 1);
}

// Advance by one cycle and snap to due_day (if provided).
function advanceCycleAligned(date: Date, cycle: string | undefined, dueDay?: number) {
    advanceCycle(date, cycle);
    if (dueDay) {
        const maxDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        date.setDate(Math.min(dueDay, maxDay));
    }
}

/**
 * Primeiro vencimento de um contrato recorrente.
 *
 * Extraído de `syncRecurringToFinance` sem mudar a regra: a data de referência
 * é `start_date + payment_days`, e o primeiro vencimento é a primeira
 * ocorrência de `due_day` a partir dela. Usa hora 12:00 local de propósito —
 * evita que conversão de fuso jogue a parcela para o dia anterior.
 */
export function firstRecurringDueDate(opts: {
    startDate: string;
    dueDay?: number;
    billingCycle?: string;
    paymentDays?: number;
}): Date {
    const ref = new Date(opts.startDate.slice(0, 10) + 'T12:00:00');
    if (opts.paymentDays && opts.paymentDays > 0) {
        ref.setDate(ref.getDate() + opts.paymentDays);
    }
    if (!opts.dueDay) return ref;

    const maxDaySameMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
    const sameMonth = new Date(ref.getFullYear(), ref.getMonth(), Math.min(opts.dueDay, maxDaySameMonth), 12, 0, 0);
    if (sameMonth >= ref) return sameMonth;
    const next = new Date(sameMonth);
    advanceCycleAligned(next, opts.billingCycle, opts.dueDay);
    return next;
}

/**
 * Vencimentos de um contrato recorrente dentro da janela fechada [from, to].
 *
 * Função pura, sem I/O. É a mesma cadência de `syncRecurringToFinance` (âncora
 * em `startDate`, alinhada a `due_day`, avançando por `billing_cycle`) — só que
 * recortada por janela, o que permite gerar SÓ o período prorrogado de um
 * aditivo sem tocar nas parcelas anteriores.
 */
export function buildRecurringDueDates(opts: {
    /** Âncora do ciclo — o start_date do contrato, não o início da janela. */
    startDate: string;
    from: string;
    to: string;
    dueDay?: number;
    billingCycle?: string;
    paymentDays?: number;
}): string[] {
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const from = opts.from.slice(0, 10);
    const to = opts.to.slice(0, 10);
    const cur = firstRecurringDueDate(opts);
    const out: string[] = [];

    // Guarda contra ciclo inválido/ausente que não avançaria o cursor.
    for (let guard = 0; guard < 1200; guard++) {
        const cursor = iso(cur);
        if (cursor > to) break;
        if (cursor >= from) out.push(cursor);
        const before = cur.getTime();
        advanceCycleAligned(cur, opts.billingCycle, opts.dueDay);
        if (cur.getTime() <= before) break;
    }
    return out;
}

// Generate financial entries for a recurring contract.
//
// Rules:
//   • due_day    = fixed day of month for ALL payments (e.g. always the 10th)
//   • payment_days = minimum offset in days after start_date before first payment
//   • First payment = first occurrence of due_day >= (start_date + payment_days)
//   • Subsequent payments = same due_day, advancing by billing_cycle
//   • ALL payments from start are generated (past ones = PAID, future = PENDING)
//   • Without end_date: generates from start up to 12 cycles into the future
async function syncRecurringToFinance(contract: Contract) {
    if (!contract.is_recurring || !contract.original_value) return;
    // Só fatura contrato comercial depois de assinado — ver podeFaturarContratoComercial.
    if (!podeFaturarContratoComercial(contract)) {
        console.log(`[CONTRACTS] Contrato ${contract.number || contract.id} ainda não assinado — nada lançado em Contas a Receber.`);
        return;
    }
    try {
        const supplierName = await resolveSupplierName(contract.supplier_id, 'Contrato Recorrente');

        const today = new Date();
        today.setHours(23, 59, 59, 0);

        const dueDay = contract.due_day;

        const cur = firstRecurringDueDate({
            startDate: contract.start_date,
            dueDay,
            billingCycle: contract.billing_cycle,
            paymentDays: contract.payment_days,
        });

        // End boundary: contract end_date OR (last past payment + 12 future cycles)
        const endDate = contract.end_date
            ? new Date(contract.end_date + 'T12:00:00')
            : (() => {
                // find the first future payment, then add 11 more cycles
                const e = new Date(cur);
                while (e <= today) advanceCycleAligned(e, contract.billing_cycle, dueDay);
                for (let i = 0; i < 11; i++) advanceCycleAligned(e, contract.billing_cycle, dueDay);
                return e;
            })();

        if (cur > endDate) return;

        const transactions: Array<{
            id: string; date: string; type: 'EXPENSE'; category: string;
            description: string; value: number; status: 'PAID' | 'PENDING'; supplier: string; notes: string;
        }> = [];
        let n = 1;

        while (cur <= endDate) {
            const isPast = cur <= today;
            transactions.push({
                id: crypto.randomUUID(),
                date: cur.toISOString().split('T')[0] + 'T12:00:00.000Z',
                type: 'EXPENSE',
                category: 'Mão de Obra / Serviço',
                description: `Fatura Contrato ${contract.number || ''} (${n}) - ${cur.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
                value: contract.original_value,
                status: isPast ? 'PAID' : 'PENDING',
                supplier: supplierName,
                notes: `[contract:${contract.id}] Gerado automaticamente do contrato ${contract.number || contract.id}`
            });

            advanceCycleAligned(cur, contract.billing_cycle, dueDay);
            n++;
        }

        if (transactions.length === 0) return;

        if (contract.project_id) {
            await financialService.addTransactionBatch(contract.project_id, transactions.map(tx => ({
                date: tx.date,
                type: tx.type,
                category: tx.category,
                description: tx.description,
                value: tx.value,
                status: tx.status,
                supplier: tx.supplier,
                notes: tx.notes,
            })));
        } else if (contract.organization_id) {
            const party = await resolveContractParty(contract, supplierName);
            const txDirection = isReceivableContract(contract) ? 'CREDIT' : 'DEBIT';
            // UPSERT — mesma razão de generateRecurringInstallmentsForPeriod (23505).
            await supabase.from('internal_transactions').upsert(transactions.map(tx => ({
                organization_id: contract.organization_id,
                source_system: 'CONTRACT_RECURRING',
                // ⚠️ Um reference_id POR PARCELA. A constraint
                // internal_transactions_org_ref_key é UNIQUE(organization_id,
                // reference_id, entry_type): repetir o id do contrato em todas as
                // linhas fazia a 2ª estourar 23505. Mesmo padrão do lado da
                // negociação (tx-{dealId}-custom-pN). Os filtros usam
                // `like('{contractId}%')`, então as linhas legadas (reference_id =
                // id puro) continuam sendo encontradas.
                reference_id: `${contract.id}-p${tx.date.split('T')[0]}`,
                project_id: contract.project_id ?? null,
                transaction_date: tx.date.split('T')[0],
                // Vencimento da parcela — Contas a Receber exibe due_date e a view
                // calcula VENCIDO a partir dele; sem isso a parcela nasce sem data.
                due_date: tx.date.split('T')[0],
                amount: tx.value,
                direction: txDirection,
                description: tx.description,
                category: 'Mão de Obra / Serviço',
                entity_name: party.party_name ?? supplierName,
                supplier_id: party.supplier_id,
                party_id: party.party_id,
                party_type: party.party_type,
                party_name: party.party_name,
                status: 'PENDING',
                // Status de NEGÓCIO exibido/filtrado em Contas a Receber. Ficava nulo,
                // e a regra de VENCIDO da view dependia dele estar preenchido.
                business_status: 'PREVISTO',
            })), { onConflict: 'organization_id,reference_id,entry_type' });
        }
        console.log(`[CONTRACTS] Generated ${transactions.length} recurring entries for contract ${contract.id} (from current month)`);
    } catch (e) {
        console.error('[CONTRACTS] Error syncing recurring contract to finance:', e);
    }
}

/**
 * Faz o valor do CONTRATO acompanhar o aluguel que acabou de ser gerado.
 *
 * `contracts.original_value` de uma locação é o valor da PARCELA, gravado uma
 * única vez por `createFromDeal` — e quando a negociação ainda não tinha
 * `installment_value`, ele saiu de `value ÷ installments`. Depois que alguém
 * preencheu o valor mensal na aba Forma de Pagamento, nada propagava a
 * correção: em 11/08/2026 o CL-2026-005 dizia 38,88 (= 933 ÷ 24) enquanto
 * cobrava 1.100,00 por mês, e o CL-2026-004 dizia 4.346,00 cobrando 3.000,00.
 * Como `current_value` é a BASE DO REAJUSTE, a fila de reajuste reajustaria
 * 38,88 — as parcelas já lançadas não mudam, mas o aluguel vigente do contrato
 * (e toda renovação/aditivo que parte dele) nasce errado.
 *
 * Só roda na geração por CLIQUE, e nunca em contrato com reajuste já aplicado:
 *   • `current_value != original_value` = alguém já reajustou. A partir daí a
 *     negociação deixou de ser a autoridade sobre o aluguel, e sobrescrever
 *     apagaria o reajuste acumulado — mesmo motivo pelo qual `updateContract`
 *     não recalcula `current_value` de contrato recorrente.
 *   • Falha aqui não derruba a geração: as parcelas, que são o que o cliente
 *     paga, já estão lançadas.
 */
async function syncContractValueToGeneratedAmount(
    contract: Contract, amount: number,
): Promise<{ from: number; to: number } | undefined> {
    if (contract.domain !== 'LOCACAO') return undefined;
    const original = Number(contract.original_value ?? 0);
    const vigente = Number(contract.current_value ?? contract.original_value ?? 0);
    if (Math.abs(vigente - original) > 0.01) return undefined;   // já reajustado
    if (Math.abs(original - amount) < 0.01) return undefined;    // já bate
    try {
        const { error } = await supabase
            .from('contracts')
            .update({ original_value: amount, current_value: amount })
            .eq('id', contract.id);
        if (error) throw error;
        console.log(`[CONTRACTS] Valor do contrato ${contract.number || contract.id} atualizado de ${original} para ${amount} pela geração de parcelas.`);
        return { from: original, to: amount };
    } catch (e) {
        console.error('[CONTRACTS] Falha ao atualizar o valor do contrato após a geração:', e);
        return undefined;
    }
}

/**
 * Gera parcelas de um contrato recorrente APENAS na janela [fromDate, toDate],
 * com o valor informado explicitamente.
 *
 * Existe porque nenhuma função anterior servia ao aditivo de prorrogação:
 *   • `syncRecurringToFinance` regera a série INTEIRA desde start_date — no
 *     aditivo isso duplicaria tudo que já foi cobrado;
 *   • ela lê `original_value`, e em locação o aluguel vigente mora em
 *     `current_value` (é lá que `applyReajuste` escreve). Por isso o valor
 *     entra por parâmetro: quem chama sabe qual é o aluguel do período.
 *
 * Idempotente por data: relê o que já existe na janela e pula os vencimentos
 * já lançados — protege contra duplo clique em "Aprovar aditivo".
 *
 * REGRA #2: `project_id` só é gravado quando o contrato tem obra real; locação
 * org-level fica nulo (parcela do comercial não tem obra).
 */
export async function generateRecurringInstallmentsForPeriod(
    contract: Contract,
    opts: {
        fromDate: string; toDate: string; amount: number; label?: string; maxCount?: number;
        /** Espaçamento entre parcelas, quando NÃO deve vir de `billing_cycle`.
         *  A Periodicidade da aba Contrato fica ao lado do Índice de Reajuste e
         *  é lida (com razão) como a periodicidade do REAJUSTE — usá-la como
         *  cadência de cobrança gerava aluguel de ano em ano. */
        cycleOverride?: string;
        /** Regerar refaz a série: apaga as parcelas ainda PREVISTAS do período e
         *  reinsere com o valor/quantidade atuais. Pagas nunca são tocadas. */
        replaceExisting?: boolean;
        /** Data do 1º Pagamento escolhida no modal. Quando vem, ela ANCORA a
         *  série: a 1ª parcela cai exatamente nesse dia, e o dia do mês das
         *  seguintes passa a ser o dela — `due_day` do contrato é ignorado.
         *  Sem isto o campo ficava na tela sem efeito: a série era sempre
         *  ancorada em start_date + due_day (regressão relatada em 02/08/2026). */
        firstDueDate?: string;
        /** Dimensões contábeis do cabeçalho da negociação (aba Forma de
         *  Pagamento) — propagam para cada parcela em internal_transactions.
         *  Sem elas, cai no cost_center_id do contrato (se houver) e fica
         *  sem Plano de Contas — ver 20270846000000_commercial_deals_cost_center_plano_contas.sql. */
        costCenterId?: string | null;
        planoDeContasId?: string | null;
    },
): Promise<{
    inserted: number; skipped: number; removed: number; dueDates: string[];
    /** Preenchido quando o valor do contrato foi corrigido para o da geração. */
    contractValueUpdated?: { from: number; to: number };
}> {
    const { fromDate, toDate, amount, maxCount, replaceExisting } = opts;
    const cycle = opts.cycleOverride || contract.billing_cycle;
    if (!contract.is_recurring) throw new Error('Geração por período só se aplica a contrato recorrente.');
    if (!(amount > 0)) throw new Error('Valor da parcela deve ser maior que zero.');
    // Gerar o CRONOGRAMA (o parcelamento em si) é sempre permitido — já exige
    // um contrato como alvo (chamador sempre passa `target.contract`, não há
    // mais opção "Negociação" no seletor). O portão de assinatura/emissão
    // (podeFaturarContratoComercial) só entra na PROPAGAÇÃO pra Contas a
    // Receber (syncParceladoScheduleToFinance/syncRecurringToFinance) — gerar
    // parcela sem isso não lança nada no financeiro sozinho. Antes barrava
    // aqui também, travando até o contrato "Concluído" (o estágio mais
    // avançado) de gerar parcela. Caso real: CL-2026-005.

    // Quem chama pode mandar o Nº de Parcelas explicitamente (campo da aba Forma
    // de Pagamento). Nesse caso ele MANDA sobre a janela: a vigência define só
    // onde a série COMEÇA e a cadência, e a série vai até completar N parcelas,
    // podendo passar de `toDate`. Sem isso, um contrato com end_date curto (ou
    // sem end_date, virando janela de poucos meses) truncava a série: 60
    // parcelas acordadas geravam 6.
    const n = maxCount && maxCount > 0 ? Math.floor(maxCount) : 0;
    // Data do 1º Pagamento manda sobre a âncora do contrato, quando informada.
    const ancora = opts.firstDueDate ? opts.firstDueDate.slice(0, 10) : null;
    const diaDoVencimento = ancora ? Number(ancora.slice(8, 10)) : contract.due_day;
    let dueDates = buildRecurringDueDates({
        startDate: ancora || contract.start_date,
        from: ancora || fromDate,
        // HORIZONTE_ABERTO: com N definido, quem corta a série é o slice abaixo,
        // não a data final. O laço de buildRecurringDueDates já tem guarda de
        // 1200 iterações, então isso não é loop infinito.
        to: n > 0 ? '9999-12-31' : toDate,
        dueDay: diaDoVencimento,
        billingCycle: cycle,
        // Com âncora explícita o offset já está embutido na data escolhida.
        paymentDays: ancora ? 0 : contract.payment_days,
    });
    if (n > 0) dueDates = dueDates.slice(0, n);
    // Janela sem nenhum vencimento é quase sempre erro de cadastro (ciclo ou dia
    // de vencimento ausente, janela invertida) — retornar 0 calado deixava a tela
    // dizendo "nada gerado" sem dizer por quê.
    if (dueDates.length === 0) {
        throw new Error(
            `Nenhum vencimento cai a partir de ${fromDate} com a cadência do contrato `
            + `(${cycle ?? 'sem periodicidade'}, dia ${contract.due_day ?? 'não definido'}). `
            + 'Confira periodicidade, dia de vencimento e o período informado.');
    }
    // A checagem de duplicidade tem que cobrir a série REAL, não a janela pedida:
    // com N mandando, o último vencimento pode ser depois de `toDate`, e consultar
    // só até lá faria a repetição reinserir as parcelas do excedente.
    const rangeFim = dueDates[dueDates.length - 1] > toDate ? dueDates[dueDates.length - 1] : toDate;

    const supplierName = await resolveSupplierName(contract.supplier_id, 'Contrato Recorrente');
    const label = opts.label || `Contrato ${contract.number || ''}`.trim();

    // ── Contrato ligado a obra: parcelas no JSONB do projeto, tag [contract:id]
    if (contract.project_id) {
        const existing = new Set<string>();
        try {
            const project = await projectService.loadProject(contract.project_id);
            const txs = ((project?.settings as any)?.financialInfo?.transactions || []) as Array<{ date?: string; notes?: string }>;
            const tag = `[contract:${contract.id}]`;
            txs.filter(t => (t.notes || '').includes(tag))
               .forEach(t => existing.add((t.date || '').slice(0, 10)));
        } catch { /* sem histórico legível: gera tudo */ }

        const novos = dueDates.filter(d => !existing.has(d));
        if (novos.length > 0) {
            await financialService.addTransactionBatch(contract.project_id, novos.map((d, i) => ({
                date: `${d}T12:00:00.000Z`,
                type: 'EXPENSE' as const,
                category: 'Mão de Obra / Serviço',
                description: `${label} — parcela ${i + 1}/${novos.length} (${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)})`,
                value: amount,
                status: 'PENDING' as const,
                supplier: supplierName,
                notes: `[contract:${contract.id}] Gerado pela prorrogação de vigência`,
            })));
        }
        const valorCorrigido = novos.length > 0
            ? await syncContractValueToGeneratedAmount(contract, amount)
            : undefined;
        return {
            inserted: novos.length, skipped: dueDates.length - novos.length, removed: 0, dueDates,
            contractValueUpdated: valorCorrigido,
        };
    }

    if (!contract.organization_id) {
        throw new Error('Contrato sem organização — não é possível lançar as parcelas.');
    }

    // ── Contrato org-level: internal_transactions
    const { data: jaExistem } = await supabase
        .from('internal_transactions')
        .select('id, due_date, status')
        .eq('organization_id', contract.organization_id)
        .eq('source_system', 'CONTRACT_RECURRING')
        .like('reference_id', `${contract.id}%`)
        .gte('due_date', fromDate)
        .lte('due_date', rangeFim);

    // Regerar SOBRESCREVE: a série é refeita com o valor e a quantidade atuais.
    // Sem isso, uma geração anterior com valor diferente sobrevivia — a
    // idempotência é por DATA, então o vencimento repetido era pulado e ficava
    // com o valor antigo, produzindo uma série com dois valores misturados.
    // Parcela já paga/conciliada NUNCA é tocada: o dinheiro já entrou, refazer
    // a cobrança seria falsear o histórico. Ela é preservada e reportada.
    let removed = 0;
    let existing: Set<string>;
    if (replaceExisting) {
        const pagas = (jaExistem || []).filter(r => r.status !== 'PENDING');
        const previstas = (jaExistem || []).filter(r => r.status === 'PENDING');
        if (previstas.length > 0) {
            const { error: delErr } = await supabase
                .from('internal_transactions')
                .delete()
                .in('id', previstas.map(r => r.id));
            if (delErr) throw delErr;
            removed = previstas.length;
        }
        existing = new Set(pagas.map(r => (r.due_date as string).slice(0, 10)));
    } else {
        existing = new Set((jaExistem || []).map(r => (r.due_date as string).slice(0, 10)));
    }

    const novos = dueDates.filter(d => !existing.has(d));
    if (novos.length === 0) return { inserted: 0, skipped: dueDates.length, removed, dueDates };

    const party = await resolveContractParty(contract, supplierName);
    const txDirection = isReceivableContract(contract) ? 'CREDIT' : 'DEBIT';

    // UPSERT, não INSERT (corrigido 2026-08-02, erro 23505 em produção).
    // `reference_id` embute a DATA (`{contrato}-p{data}`), mas a checagem de
    // duplicidade acima filtra por `due_date` dentro da janela. Como o
    // vencimento é editável na aba Parcelas, uma parcela cuja data foi alterada
    // fica com reference_id de uma data e due_date de outra: a consulta não a
    // encontra, não a apaga, e o INSERT colidia com
    // internal_transactions_org_ref_key. Com upsert, a linha é atualizada.
    const { error } = await supabase.from('internal_transactions').upsert(novos.map((d, i) => ({
        organization_id: contract.organization_id,
        source_system: 'CONTRACT_RECURRING',
        // Um id por parcela — ver a nota em syncRecurringToFinance.
        reference_id: `${contract.id}-p${d}`,
        project_id: contract.project_id ?? null,
        transaction_date: d,
        due_date: d,
        amount,
        direction: txDirection,
        description: `${label} — parcela ${i + 1}/${novos.length} (${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)})`,
        category: 'Mão de Obra / Serviço',
        entity_name: party.party_name ?? supplierName,
        supplier_id: party.supplier_id,
        party_id: party.party_id,
        party_type: party.party_type,
        party_name: party.party_name,
        status: 'PENDING',
        business_status: 'PREVISTO',
        cost_center_id: opts.costCenterId ?? contract.cost_center_id ?? null,
        plano_de_contas_id: opts.planoDeContasId ?? null,
    })), { onConflict: 'organization_id,reference_id,entry_type' });
    if (error) throw error;

    console.log(`[CONTRACTS] Prorrogação: ${novos.length} parcela(s) geradas para ${contract.number} (${fromDate} → ${toDate})`);
    const valorCorrigido = await syncContractValueToGeneratedAmount(contract, amount);
    return {
        inserted: novos.length, skipped: dueDates.length - novos.length, removed, dueDates,
        contractValueUpdated: valorCorrigido,
    };
}

// Generate a single financial entry for a À Vista (non-parcelado, non-recurring) contract.
async function syncAVistaToFinance(contract: Contract) {
    if (contract.is_recurring || contract.payment_term_type === 'Parcelado') return;
    if (!contract.original_value || contract.original_value <= 0) return;
    // Só fatura contrato comercial depois de assinado — ver podeFaturarContratoComercial.
    if (!podeFaturarContratoComercial(contract)) {
        console.log(`[CONTRACTS] Contrato ${contract.number || contract.id} ainda não assinado — nada lançado em Contas a Receber.`);
        return;
    }
    try {
        const supplierName = await resolveSupplierName(contract.supplier_id, 'Fornecedor');
        const tag = `[contract:${contract.id}]`;
        const measurementIds = await getContractMeasurementIds(contract.id);

        // Due date = start_date + payment_days (or start_date if no payment_days)
        const base = new Date(contract.start_date + 'T12:00:00');
        if (contract.payment_days) base.setDate(base.getDate() + contract.payment_days);
        const dueDate = base.toISOString().split('T')[0];

        const tx = {
            id: crypto.randomUUID(),
            date: dueDate + 'T12:00:00.000Z',
            type: 'EXPENSE' as const,
            category: 'Mão de Obra / Serviço',
            description: `Contrato: ${contract.title || contract.number} — À Vista`,
            value: contract.original_value,
            status: 'PENDING' as const,
            supplier: supplierName,
            notes: `${tag} Lançamento à vista gerado automaticamente do contrato ${contract.number || contract.id}`
        };

        if (contract.project_id) {
            const project = await projectService.loadProject(contract.project_id);
            if (project) {
                const info = (project.settings as any)?.financialInfo || { totalValue: 0, paymentMethod: 'À Vista', installments: [], transactions: [] };
                const kept = (info.transactions || []).filter((t: any) => !isContractTx(t, tag, measurementIds));
                await projectService.saveProject({
                    ...project,
                    settings: { ...project.settings, financialInfo: { ...info, transactions: [tx, ...kept] } }
                });
            }
        } else if (contract.organization_id) {
            const vault = await findVault(contract.organization_id);
            if (vault) {
                const vaultInfo = vault.settings?.financialInfo || { totalValue: 0, paymentMethod: 'À Vista', installments: [], transactions: [] };
                const kept = (vaultInfo.transactions || []).filter((t: any) => !isContractTx(t, tag, measurementIds));
                await supabase.from('projects').update({
                    settings: { ...vault.settings, financialInfo: { ...vaultInfo, transactions: [tx, ...kept] } }
                }).eq('id', vault.id);
            }
        }

        // internal_transactions mirror
        if (contract.organization_id) {
            await supabase.from('internal_transactions')
                .delete()
                .eq('organization_id', contract.organization_id)
                .eq('source_system', 'CONTRACT_AVISTA')
                .eq('reference_id', contract.id);

            const party = await resolveContractParty(contract, supplierName);
            const txDirection = isReceivableContract(contract) ? 'CREDIT' : 'DEBIT';
            await supabase.from('internal_transactions').insert({
                organization_id: contract.organization_id,
                source_system: 'CONTRACT_AVISTA',
                reference_id: contract.id,
                project_id: contract.project_id ?? null,
                transaction_date: dueDate,
                // Vencimento — ver comentário nas outras duas funções de sync.
                due_date: dueDate,
                amount: contract.original_value,
                direction: txDirection,
                description: tx.description,
                category: 'Mão de Obra / Serviço',
                entity_name: party.party_name ?? supplierName,
                supplier_id: party.supplier_id,
                party_id: party.party_id,
                party_type: party.party_type,
                party_name: party.party_name,
                status: 'PENDING',
                // Status de NEGÓCIO exibido/filtrado em Contas a Receber. Ficava nulo,
                // e a regra de VENCIDO da view dependia dele estar preenchido.
                business_status: 'PREVISTO',
            });
        }
        console.log(`[CONTRACTS] Synced À Vista contract ${contract.id} to finance`);
    } catch (e) {
        console.error('[CONTRACTS] Error syncing À Vista to finance:', e);
    }
}

export const contractService = {
    // Contracts
    listContracts: async (
        projectId?: string,
        organizationId?: string,
        empresaId?: string,
        direction?: 'OUTGOING' | 'INCOMING',
        domain?: 'SUPRIMENTOS' | 'SERVICOS' | 'LOCACAO' | 'VENDAS',
    ): Promise<Contract[]> => {
        // payment_schedule (array JSONB) omitido na listagem — carregado em getContractById
        let query = supabase
            .from('contracts')
            .select('id, organization_id, project_id, supplier_id, client_id, budget_id, number, client_contract_number, title, description, contract_type, nature, direction, domain, start_date, end_date, is_recurring, billing_cycle, due_day, status, original_value, current_value, reajuste_index, reajuste_data_base, reajuste_proximo, retention_rate, responsible_email, signed_contract_url, empresa_id, empreendimento_id, cost_center_id, category_id, plano_de_contas_id, payment_method, payment_term_type, payment_days, payment_installments, signature_status, signature_url, approval_status, approval_required_levels, template_id, created_at')
            .order('created_at', { ascending: false });

        if (projectId) {
            query = query.eq('project_id', projectId);
        } else if (empresaId) {
            query = query.eq('empresa_id', empresaId);
        } else if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }

        // Separação de módulos por domínio de negócio (preferencial).
        //   SUPRIMENTOS · SERVICOS · LOCACAO · VENDAS — nunca misturar.
        if (domain) {
            // Contratos legados de Suprimentos podem ter domain NULL antes do backfill.
            if (domain === 'SUPRIMENTOS') {
                query = query.or('domain.eq.SUPRIMENTOS,domain.is.null');
            } else {
                query = query.eq('domain', domain);
            }
        }

        // Compat: separação legada por direction (quando domain não é informado).
        //  - OUTGOING  → Comercial / Contratos de Serviço
        //  - INCOMING  → Suprimentos (inclui contratos legados com direction NULL)
        if (!domain && direction === 'OUTGOING') {
            query = query.eq('direction', 'OUTGOING');
        } else if (!domain && direction === 'INCOMING') {
            query = query.or('direction.eq.INCOMING,direction.is.null');
        }

        const { data, error } = await query;
        if (error) throw error;
        return data as Contract[];
    },

    // Mapeia a categoria do cliente comercial para o domínio de contrato correspondente.
    categoryToContractDomain: (category?: string): 'VENDAS' | 'LOCACAO' | 'SERVICOS' | undefined => {
        switch (category) {
            case 'Vendas':   return 'VENDAS';
            case 'Locação':  return 'LOCACAO';
            case 'Serviços': return 'SERVICOS';
            default:         return undefined;
        }
    },

    listContractsByClientId: async (
        clientId: string,
        orgId?: string,
        category?: string,
    ): Promise<Contract[]> => {
        let query = supabase
            .from('contracts')
            .select('id, organization_id, number, title, contract_type, nature, status, original_value, current_value, start_date, end_date, is_recurring, billing_cycle, due_day, reajuste_index, reajuste_data_base, reajuste_proximo, sla_days, warranty_months, signature_status, signature_url, signed_contract_url, direction, domain, minuta_versions, created_at')
            .eq('client_id', clientId)
            // NÃO filtrar por direction: é a direção FINANCEIRA, não "contrato
            // emitido ao cliente". Locação virou INCOMING em 20270815000001
            // (aluguel é receita do locador), então `= OUTGOING` escondia todo
            // contrato CL-* desta visão. O corte de "contrato do cliente" é o
            // domain — mesmo critério da RPC fn_portal_get_contracts
            // (20270825000020), que espelha esta query no acesso via link.
            .in('domain', ['VENDAS', 'LOCACAO', 'SERVICOS'])
            .neq('status', 'Rascunho')
            .order('created_at', { ascending: false });
        if (orgId) query = query.eq('organization_id', orgId);
        // Blindagem por domínio: cliente só vê contratos do seu próprio tipo
        // (Vendas / Locação / Serviços). O client_id já isola, mas o domínio é explícito.
        const domain = contractService.categoryToContractDomain(category);
        if (domain) query = query.eq('domain', domain);
        const { data, error } = await query;
        if (error) throw error;
        return data as Contract[];
    },

    // ─── Ponte Negociação (Vendas de Ativos) → Contrato de Venda ──────────────
    // Retorna o contrato VENDAS já gerado para uma negociação, se existir.
    // Resiliente: se a coluna deal_id ainda não existe no banco (migration pendente),
    // retorna null em vez de lançar erro.
    getContractByDealId: async (dealId: string): Promise<Contract | null> => {
        try {
            const { data, error } = await supabase
                .from('contracts')
                // `empresa_id`/`execution_address` entram para a reconciliação de
                // createFromDeal saber o que ainda está vazio (backfill).
                .select('id, organization_id, deal_id, client_id, empresa_id, execution_address, number, title, status, original_value, current_value, direction, domain, signature_status, signed_contract_url, created_at')
                .eq('deal_id', dealId)
                .maybeSingle();
            if (error) {
                // Coluna deal_id pode não existir ainda (migration pendente) — trata como "não encontrado"
                console.warn('[contractService] getContractByDealId error (deal_id column may be missing):', error.message);
                return null;
            }
            return (data as Contract) ?? null;
        } catch {
            return null;
        }
    },

    // Cria (ou retorna se já existir) um contrato a partir de uma negociação
    // comercial. `domain` decide o tipo: 'VENDAS' (compra e venda avulsa) ou
    // 'LOCACAO' (contrato recorrente de aluguel, com reajuste anual). Idempotente
    // via deal_id ou número do contrato.
    createFromDeal: async (deal: {
        id: string;
        organization_id?: string;
        client_id: string;
        property_id?: string;
        value: number;
        date?: string;
        contract_number?: string;
        notes?: string;
        payment_method?: string;
        installments?: number;
        status?: string;
        signature_status?: string;
        signature_url?: string;
        signed_contract_url?: string;
        // Locação (domain='LOCACAO') — parâmetros do contrato recorrente
        payment_due_date?: string;
        end_date?: string;
        billing_cycle?: 'Mensal' | 'Bimestral' | 'Semestral' | 'Anual';
        reajuste_index?: string;
        installment_value?: number;
        // Só usado se a máscara de Nomenclatura tiver {Centro de custo}.
        cost_center_id?: string | null;
    }, domain: 'VENDAS' | 'LOCACAO' = 'VENDAS'): Promise<Contract> => {
        if (!deal.organization_id) throw new Error('Negociação sem organização — impossível gerar contrato.');
        if (!deal.client_id) throw new Error('Negociação sem cliente — selecione o comprador antes de gerar o contrato.');

        const isRental = domain === 'LOCACAO';
        const cfg = isRental
            // Sem `numberPrefix`: o prefixo passou a ser configurável e mora na
            // máscara de cada domínio (rental/unitSale ContractNumberingService).
            ? { contractType: 'Contrato Recorrente', nature: 'Locação', titlePrefix: 'Contrato de Locação', titleFallback: 'Contrato de Locação' }
            : { contractType: 'Compra e Venda', nature: 'Outros', titlePrefix: 'Contrato de Venda', titleFallback: 'Contrato de Compra e Venda' };

        // Unidades da negociação: nome (para o título), empresa dona (locador) e
        // endereço da unidade principal. Resolvido ANTES da idempotência porque
        // o ramo do contrato já existente também precisa deles (backfill).
        const unitsInfo = await resolveDealUnitsInfo(deal.id, deal.property_id);

        // Idempotência primária: busca por deal_id (requer migration 20261228000006 aplicada)
        const existing = await contractService.getContractByDealId(deal.id);
        if (existing) {
            // Reconciliação: a negociação pode ter trocado de cliente DEPOIS da geração
            // do contrato (ex: locatário corrigido). O contrato ficava congelado no
            // cliente antigo e sumia do Portal do Cliente — tanto na visão do app
            // (listContractsByClientId) quanto no link (fn_portal_get_contracts), pois
            // ambos filtram por client_id. As parcelas continuavam aparecendo (vêm do
            // deal), o que fazia o problema parecer "portal sem conexão". Caso real:
            // CL-2026-002 apontando para um cliente de Vendas. Ver ClientArea.tsx:211.
            const patch: Record<string, unknown> = {};
            if (existing.client_id && existing.client_id !== deal.client_id) {
                patch.client_id = deal.client_id;
            }
            // Backfill do locador e do endereço: contratos gerados antes de
            // `empresa_id`/`execution_address` passarem a ser gravados aqui se
            // consertam sozinhos na primeira reabertura da negociação. Só
            // preenche o que está vazio — nunca sobrescreve escolha manual.
            if (isRental) {
                if (!(existing as { empresa_id?: string }).empresa_id && unitsInfo.companyId) {
                    patch.empresa_id = unitsInfo.companyId;
                }
                if (!(existing as { execution_address?: string }).execution_address && unitsInfo.executionAddress) {
                    patch.execution_address = unitsInfo.executionAddress;
                }
            }

            if (Object.keys(patch).length > 0) {
                const { data: fixed } = await supabase
                    .from('contracts')
                    .update(patch as any)
                    .eq('id', existing.id)
                    .select('id, organization_id, deal_id, client_id, empresa_id, execution_address, number, title, status, original_value, current_value, direction, domain, signature_status, signed_contract_url, created_at')
                    .maybeSingle();
                if (fixed) return fixed as Contract;
            }
            return existing;
        }

        const { unitLabel, companyId: unitCompanyId, executionAddress, primaryPropertyId } = unitsInfo;

        // Gera número: usa o do deal se preenchido; senão sequência própria do domínio.
        let number = (deal.contract_number && deal.contract_number.trim())
            ? deal.contract_number.trim()
            : '';
        if (!number) {
            // Cada domínio tem sua própria sequência e sua própria máscara,
            // configuráveis em Configurações do Sistema › Nomenclatura. O
            // sequencial é por UNIDADE — resolvida de primaryPropertyId via
            // vw_unit_property_map, não há obra em locação/venda de unidade.
            const propertyId = primaryPropertyId || deal.property_id;
            if (!propertyId) throw new Error('Negociação sem unidade — selecione o imóvel antes de gerar o contrato.');
            const numberingExtra = { clientId: deal.client_id, costCenterId: deal.cost_center_id };
            number = isRental
                ? await nextRentalNumber(propertyId, numberingExtra)
                : await generateUnitSaleContractNumber(propertyId, numberingExtra);
        }

        // Idempotência secundária: contrato com este número já existe?
        const { data: byNumber } = await supabase
            .from('contracts')
            .select('id, organization_id, client_id, number, title, status, original_value, current_value, direction, domain, signature_status, signed_contract_url, created_at')
            .eq('organization_id', deal.organization_id)
            .eq('number', number)
            .maybeSingle();
        if (byNumber) {
            // Só é o MESMO contrato se for do mesmo cliente. Número colidido de outro
            // cliente não pode ser adotado: sobrescrever o deal_id roubaria o contrato
            // alheio (e deixaria a negociação original órfã). Nesse caso, desambigua
            // com sufixo derivado do deal — único e estável entre chamadas.
            if ((byNumber as any).client_id && (byNumber as any).client_id !== deal.client_id) {
                number = `${number}-${deal.id.slice(0, 4)}`;
            } else {
                await supabase.from('contracts').update({ deal_id: deal.id } as any).eq('id', (byNumber as any).id);
                return byNumber as Contract;
            }
        }

        // Mapeia o estágio da negociação para o status do contrato.
        const status =
            deal.status === 'COMPLETED' ? 'Concluído'
            : deal.signature_status === 'SIGNED' ? 'Assinado'
            : 'Ativo';

        // Reajuste anual (locação): +12 meses a partir da data-base, sem drift de fuso.
        const nextAdjustment = (() => {
            if (!isRental || !deal.date) return undefined;
            const [y, m, d] = deal.date.split('-').map(Number);
            if (!y || !m || !d) return undefined;
            const dt = new Date(Date.UTC(y, m - 1, d));
            dt.setUTCFullYear(dt.getUTCFullYear() + 1);
            return dt.toISOString().split('T')[0];
        })();
        // Dia de vencimento derivado do vencimento informado (UTC evita retroceder 1 dia).
        const dueDay = isRental && deal.payment_due_date
            ? new Date(deal.payment_due_date).getUTCDate()
            : undefined;
        // Offset (dias) do início do contrato até o "Vencimento Pagto." — faz a
        // PRIMEIRA parcela cair exatamente na data informada (syncRecurringToFinance
        // ancora em start_date + payment_days). Sem isso, só o DIA do mês era
        // preservado e a 1ª parcela podia cair em outro mês.
        const paymentDays = isRental && deal.payment_due_date && deal.date
            ? Math.max(0, Math.round(
                (Date.parse(deal.payment_due_date.slice(0, 10) + 'T00:00:00Z')
                    - Date.parse(deal.date.slice(0, 10) + 'T00:00:00Z')) / 86400000))
            : undefined;

        // Valor do contrato.
        //
        // ⚠️ Em contrato RECORRENTE, `original_value` é o valor de CADA parcela —
        // é ele que syncRecurringToFinance grava em todo lançamento gerado. Mas
        // `deal.value` de uma locação é o valor TOTAL do contrato (36 meses ×
        // aluguel). Gravar o total aqui fazia cada parcela nascer com o valor do
        // contrato inteiro; o erro ficou latente enquanto locação nascia sem
        // `end_date` (sem ela o sync nunca rodava) e só apareceu ao capturar a
        // vigência no DealModal. Caso real: CL-2026-001, aluguel de R$ 1.000
        // gravado como R$ 36.000.
        //
        // Fonte da parcela, nesta ordem: Valor Mensal do Contrato (aba Forma de
        // Pagamento, `installment_value` — o próprio campo que gera as parcelas
        // em geracaoContrato/DealModal.tsx) → total ÷ nº de parcelas → total
        // (deal sem parcelamento, aí o valor já é o mensal).
        // Antes lia `custom_installments[0].value` — espelho legado do plano de
        // pagamento (nunca fonte real da tela desde 02/08/2026, ver
        // project_deal_installments_serie_unica); `installment_value` é o campo
        // que a aba realmente edita e usa para gerar parcela.
        const rentalInstallmentValue = (() => {
            if (deal.installment_value && deal.installment_value > 0) return deal.installment_value;
            if (deal.installments && deal.installments > 1 && deal.value > 0) {
                return parseFloat((deal.value / deal.installments).toFixed(2));
            }
            return deal.value || 0;
        })();

        const payload = {
            deal_id: deal.id,
            organization_id: deal.organization_id,
            client_id: deal.client_id,
            number,
            title: unitLabel ? `${cfg.titlePrefix} — ${unitLabel}` : cfg.titleFallback,
            description: deal.notes || undefined,
            contract_type: cfg.contractType,
            nature: cfg.nature,
            // Locação é receita do locador → INCOMING (parcelas nascem CREDIT/a receber
            // via syncRecurringToFinance); Vendas/Suprimentos permanecem OUTGOING.
            direction: (isRental ? 'INCOMING' : 'OUTGOING') as 'INCOMING' | 'OUTGOING',
            domain,
            status,
            // Locação: valor da PARCELA (ver rentalInstallmentValue). Vendas: total.
            original_value: isRental ? rentalInstallmentValue : (deal.value || 0),
            start_date: deal.date || new Date().toISOString().split('T')[0],
            is_recurring: isRental,
            ...(isRental ? {
                // Locador e local do imóvel — ver resolveDealUnitsInfo.
                empresa_id: unitCompanyId,
                execution_address: executionAddress,
                billing_cycle: deal.billing_cycle || 'Mensal',
                due_day: dueDay,
                payment_days: paymentDays,
                end_date: deal.end_date || undefined,
                // normalizeIndexName: o default antigo era 'IGPM' (sem hífen), que não
                // casa com nenhum index_name de contract_index_values ('IGP-M') — a fila
                // de reajuste falhava com "índice não encontrado" em TODO contrato de locação.
                reajuste_index: normalizeIndexName(deal.reajuste_index) || 'IGP-M',
                reajuste_data_base: deal.date || undefined,
                reajuste_proximo: nextAdjustment,
            } : {}),
            payment_method: deal.payment_method || undefined,
            payment_installments: deal.installments || undefined,
            signature_status: deal.signature_status && ['PENDING', 'SENT', 'SIGNED', 'EXPIRED', 'CANCELLED'].includes(deal.signature_status)
                ? deal.signature_status as Contract['signature_status']
                : undefined,
            signature_url: deal.signature_url || undefined,
            signed_contract_url: deal.signed_contract_url || undefined,
        };

        try {
            return await contractService.createContract(payload as Omit<Contract, 'id' | 'created_at' | 'current_value'>);
        } catch (err: any) {
            // Duplicate key (23505): contrato criado por corrida — busca e retorna o existente
            if (err?.code === '23505') {
                const { data: race } = await supabase
                    .from('contracts')
                    .select('id, organization_id, client_id, number, title, status, original_value, current_value, direction, domain, signature_status, signed_contract_url, created_at')
                    .eq('organization_id', deal.organization_id)
                    .eq('number', number)
                    .maybeSingle();
                if (race) {
                    await supabase.from('contracts').update({ deal_id: deal.id } as any).eq('id', (race as any).id);
                    return race as Contract;
                }
            }
            throw err;
        }
    },

    // ⚠️ LEGADO. A fonte da verdade das versões passou a ser a tabela
    // `contract_document_versions` (contractDocumentVersionService), e
    // `contracts.minuta_versions` virou projeção com escritor único
    // (_syncMinutaMirror). Estes quatro métodos escrevem direto no JSONB e, se
    // usados junto do novo serviço, seriam sobrescritos na próxima projeção.
    // Mantidos apenas para não quebrar integrações externas — não usar em código novo.
    addMinutaVersion: async (contractId: string, version: { url: string; notes: string; name?: string }): Promise<void> => {
        // Lê versões atuais, incrementa número e faz append. Versão entra como rascunho (não emitida).
        const { data, error: fetchErr } = await supabase
            .from('contracts')
            .select('minuta_versions')
            .eq('id', contractId)
            .single();
        if (fetchErr) throw fetchErr;
        const current: import('../types').MinutaVersion[] = (data?.minuta_versions as any) ?? [];
        const next: import('../types').MinutaVersion = {
            v: (current.length > 0 ? Math.max(...current.map((x: any) => x.v)) : 0) + 1,
            url: version.url,
            name: version.name?.trim() || undefined,
            notes: version.notes,
            emitted: false,
            created_at: new Date().toISOString(),
        };
        const { error } = await supabase
            .from('contracts')
            .update({ minuta_versions: [...current, next] })
            .eq('id', contractId);
        if (error) throw error;
    },

    // Helper interno: lê, transforma e grava o array de versões
    _mutateMinutaVersions: async (
        contractId: string,
        transform: (versions: import('../types').MinutaVersion[]) => import('../types').MinutaVersion[],
    ): Promise<void> => {
        const { data, error: fetchErr } = await supabase
            .from('contracts')
            .select('minuta_versions')
            .eq('id', contractId)
            .single();
        if (fetchErr) throw fetchErr;
        const current: import('../types').MinutaVersion[] = (data?.minuta_versions as any) ?? [];
        const { error } = await supabase
            .from('contracts')
            .update({ minuta_versions: transform(current) })
            .eq('id', contractId);
        if (error) throw error;
    },

    // Emite uma versão → fica disponível no portal do cliente
    emitMinutaVersion: async (contractId: string, v: number): Promise<void> => {
        await contractService._mutateMinutaVersions(contractId, versions =>
            versions.map(ver =>
                ver.v === v ? { ...ver, emitted: true, emitted_at: new Date().toISOString() } : ver,
            ),
        );
    },

    // Edita nome / notas de uma versão
    updateMinutaVersion: async (
        contractId: string,
        v: number,
        patch: { name?: string; notes?: string },
    ): Promise<void> => {
        await contractService._mutateMinutaVersions(contractId, versions =>
            versions.map(ver =>
                ver.v === v
                    ? {
                          ...ver,
                          ...(patch.name !== undefined ? { name: patch.name.trim() || undefined } : {}),
                          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
                      }
                    : ver,
            ),
        );
    },

    // Exclui uma versão (bloqueada caso já emitida)
    deleteMinutaVersion: async (contractId: string, v: number): Promise<void> => {
        await contractService._mutateMinutaVersions(contractId, versions => {
            const target = versions.find(ver => ver.v === v);
            if (target && target.emitted !== false) {
                throw new Error('Não é possível excluir uma versão já emitida ao cliente.');
            }
            return versions.filter(ver => ver.v !== v);
        });
    },

    getContractById: async (id: string): Promise<Contract | null> => {
        const { data, error } = await supabase
            .from('contracts')
            .select('id, organization_id, project_id, budget_id, budget_snapshot, supplier_id, number, title, description, contract_type, nature, domain, start_date, end_date, is_recurring, billing_cycle, due_day, status, original_value, current_value, reajuste_index, reajuste_data_base, reajuste_proximo, retention_rate, responsible_email, signed_contract_url, empresa_id, empreendimento_id, cost_center_id, category_id, payment_method, payment_term_type, payment_days, payment_installments, payment_schedule, client_id, direction, execution_address, client_responsible, internal_responsible, sla_days, warranty_months, labor_value, materials_value, services_included, services_excluded, signature_status, signature_token, signature_url, signature_completed_at, approval_status, approval_chain, approval_required_levels, billing_mode, release_requirements, minuta_versions, retention_cap, retention_release_provisional, retention_release_definitive, retention_definitive_days, liability_cap, penalty_daily_rate, penalty_moratoria_cap, penalty_material_rate, cno, obra_registration, manager_name, inspector_name, start_order_issued_at, start_order_authorized_by, subcontracting_rule, fiscal_classification, created_at')
            .eq('id', id)
            .maybeSingle();

        if (error) throw error;
        return data as Contract;
    },

    createContract: async (contract: Omit<Contract, 'id' | 'created_at' | 'current_value'>): Promise<Contract> => {
        // Captura snapshot do orçamento se budget_id informado
        let budgetSnapshot: unknown = undefined;
        if (contract.budget_id) {
            try {
                const { data: proj } = await supabase
                    .from('projects')
                    .select('budget')
                    .eq('id', contract.budget_id)
                    .maybeSingle();
                if (proj?.budget) budgetSnapshot = proj.budget;
            } catch { /* snapshot opcional, não bloqueia */ }
        }

        const { data, error } = await supabase
            .from('contracts')
            .insert({
                ...contract,
                current_value: contract.original_value,
                ...(budgetSnapshot !== undefined ? { budget_snapshot: budgetSnapshot } : {}),
            })
            .select()
            .single();

        if (error) throw error;
        
        const newContract = data as Contract;

        // Sync to financial module based on payment type
        if (!newContract.is_recurring && newContract.payment_term_type === 'Parcelado') {
            await syncParceladoScheduleToFinance(newContract);
        } else if (!newContract.is_recurring) {
            await syncAVistaToFinance(newContract);
        }

        // Auto-generate installments for recurring contracts with an end date.
        //
        // ⚠️ LOCAÇÃO ORIGINAL é exceção: quem fatura o aluguel do contrato
        // original é a NEGOCIAÇÃO (decisão de 2026-07-26). Aquelas parcelas
        // vivem em `internal_transactions` com `source_system='COMMERCIAL'` e
        // `reference_id='tx-{dealId}-...'`, geradas por
        // commercialFinanceService.syncDealToFinance. Gerar aqui também criaria
        // uma SEGUNDA série do mesmo aluguel — duplicidade para o inquilino.
        // Enquanto locação nascia sem `end_date` isso nunca acontecia; ao
        // capturar a vigência no DealModal, passaria a acontecer em todo contrato.
        //
        // A RENOVAÇÃO é o contrário: o período renovado não existe na negociação
        // (ela só conhece a vigência original), então o contrato-filho fatura.
        // Não há sobreposição — o filho começa no dia seguinte ao fim do pai, e
        // a renovação corta o que passar disso na série do deal.
        const cAny = newContract as { domain?: string; parent_contract_id?: string };
        const isLocacaoOriginal = cAny.domain === 'LOCACAO' && !cAny.parent_contract_id;
        if (!isLocacaoOriginal && newContract.is_recurring && newContract.start_date && newContract.end_date && newContract.original_value > 0) {
            try {
                await syncRecurringToFinance(newContract);
            } catch (e) {
                console.error('[CONTRACTS] Error generating installments for recurring contract:', e);
            }
        }

        return newContract;
    },

    updateContract: async (id: string, updates: Partial<Contract>): Promise<Contract> => {
        // Se estiver atualizando o valor original, precisamos manter o valor atual sincronizado
        if (updates.original_value !== undefined) {
            // ⚠️ Contrato RECORRENTE fica de fora deste recálculo. Nele
            // `current_value` é o ALUGUEL VIGENTE — quem o define é
            // `applyReajuste` (que só escreve em current_value) e o aditivo de
            // prorrogação. Recalcular `original_value + Σ(aditivos)` aqui
            // apagaria silenciosamente todo o reajuste acumulado assim que
            // alguém editasse o valor do contrato na tela.
            const { data: contractRow } = await supabase
                .from('contracts')
                .select('is_recurring')
                .eq('id', id)
                .maybeSingle();

            if (!contractRow?.is_recurring) {
                const { data: addendums } = await supabase
                    .from('contract_addendums')
                    .select('value_impact')
                    .eq('contract_id', id)
                    .eq('status', 'Aprovado');

                const addendumsTotal = (addendums || []).reduce((sum, a) => sum + (a.value_impact || 0), 0);
                updates.current_value = updates.original_value + addendumsTotal;
            }
        }

        // Sanitize UUID fields: empty string fails Postgres UUID cast
        for (const key of Object.keys(updates) as (keyof typeof updates)[]) {
            if (key.endsWith('_id') && (updates[key] as unknown) === '') {
                (updates as Record<string, unknown>)[key] = undefined;
            }
        }

        // Refresh budget_snapshot when budget_id changes
        if (updates.budget_id) {
            try {
                const { data: proj } = await supabase
                    .from('projects')
                    .select('budget')
                    .eq('id', updates.budget_id)
                    .maybeSingle();
                if (proj?.budget) (updates as any).budget_snapshot = proj.budget;
            } catch { /* snapshot opcional */ }
        }

        const { data, error } = await supabase
            .from('contracts')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        const updated = data as Contract;

        // Re-sync financial entries when value or schedule changes
        if ('original_value' in updates || 'payment_schedule' in updates) {
            if (!updated.is_recurring && updated.payment_term_type === 'Parcelado') {
                await syncParceladoScheduleToFinance(updated);
            } else if (!updated.is_recurring) {
                await syncAVistaToFinance(updated);
            }
        }

        return updated;
    },

    // Re-lança o contrato no financeiro (uso retroativo ou manual).
    // Para recorrentes sem end_date: gera os próximos 12 meses.
    // Para recorrentes com end_date: gera do mês atual até o fim.
    syncContractToFinance: async (contract: Contract): Promise<{ count: number }> => {
        // Locação ORIGINAL é faturada pela negociação (ver createContract).
        // Lançar por aqui criaria uma segunda série do mesmo aluguel — é o que o
        // botão "Lançar no financeiro" do ContractDetailView faria sem esta trava.
        // Renovação (tem parent_contract_id) fatura pelo contrato e passa direto.
        const cAny = contract as { domain?: string; parent_contract_id?: string };
        if (cAny.domain === 'LOCACAO' && !cAny.parent_contract_id) {
            throw new Error(
                'As parcelas deste aluguel são geradas pela negociação (Comercial > Locações), não pelo contrato. '
                + 'Lançar aqui duplicaria a cobrança do inquilino — ajuste o plano de pagamento na negociação.'
            );
        }
        if (!contract.is_recurring && contract.payment_term_type === 'Parcelado') {
            await syncParceladoScheduleToFinance(contract);
            return { count: contract.payment_schedule?.length ?? 0 };
        } else if (!contract.is_recurring) {
            await syncAVistaToFinance(contract);
            return { count: 1 };
        } else {
            // syncRecurringToFinance returns void; count = 12 cycles (or less until end_date)
            await syncRecurringToFinance(contract);
            return { count: contract.end_date ? -1 : 12 }; // -1 = unknown exact count with end_date
        }
    },

    deleteContract: async (id: string): Promise<void> => {
        // 1. Antes de excluir, busca o contrato para saber se era recorrente e qual organização
        const { data: contract } = await supabase
            .from('contracts')
            .select('id, is_recurring, organization_id, number, project_id, payment_term_type')
            .eq('id', id)
            .single();

        // 2. Se for recorrente, verifica se há parcelas já pagas antes de permitir a exclusão
        if (contract?.is_recurring && contract.organization_id) {
            try {
                const orgId = contract.organization_id;
                const contractTag = `[contract:${id}]`;

                const { data: vaultProjects } = await supabase
                    .from('projects')
                    .select('settings')
                    .eq('name', 'Gestão Comercial')
                    .filter('settings->>organizationId', 'eq', orgId)
                    .limit(1);

                if (vaultProjects && vaultProjects.length > 0) {
                    const txs = vaultProjects[0].settings?.financialInfo?.transactions || [];
                    const contractTxs = txs.filter((t: any) => (t.notes || '').includes(contractTag));
                    const paidTxs = contractTxs.filter((t: any) => t.status === 'PAID');

                    if (paidTxs.length > 0) {
                        throw new Error(
                            `Não é possível excluir este contrato pois ${paidTxs.length} parcela(s) já foram pagas no módulo Financeiro. ` +
                            `Cancele as baixas no Financeiro antes de excluir o contrato.`
                        );
                    }
                }
            } catch (e: any) {
                // Re-lança apenas erros de negócio (parcelas pagas), ignora erros de consulta
                if (e.message?.includes('parcela')) throw e;
                console.error('[CONTRACTS] Could not verify paid installments:', e);
            }
        }

        // 3. Exclui o contrato do banco
        const { error } = await supabase
            .from('contracts')
            .delete()
            .eq('id', id);

        if (error) throw error;

        // 4. Remove transações financeiras geradas (recorrente ou parcelado)
        if (contract?.is_recurring || contract?.payment_term_type === 'Parcelado') {
            try {
                const orgId = contract.organization_id;
                if (!orgId) return;

                // Localiza o vault da organização
                const { data: vaultProjects } = await supabase
                    .from('projects')
                    .select('id, name, settings')
                    .eq('name', 'Gestão Comercial')
                    .filter('settings->>organizationId', 'eq', orgId)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (!vaultProjects || vaultProjects.length === 0) return;

                const vault = vaultProjects[0];
                const vaultInfo = vault.settings?.financialInfo;
                if (!vaultInfo) return;

                // Remove todas as transações que referenciam este contrato pelo ID embutido no campo notes
                const contractTag = `[contract:${id}]`;
                const cleanedTransactions = (vaultInfo.transactions || []).filter((t: any) => {
                    const notes = t.notes || '';
                    return !notes.includes(contractTag);
                });

                const removedCount = (vaultInfo.transactions || []).length - cleanedTransactions.length;

                if (removedCount > 0) {
                    const updatedVault = {
                        ...vault,
                        settings: {
                            ...vault.settings,
                            financialInfo: { ...vaultInfo, transactions: cleanedTransactions }
                        }
                    };
                    await supabase
                        .from('projects')
                        .update({ settings: updatedVault.settings })
                        .eq('id', vault.id);
                    console.log(`[CONTRACTS] Removed ${removedCount} financial transactions for deleted contract ${id}`);
                }

                // Also clean internal_transactions (Conciliação / Contas a Receber).
                // reference_id = contract.id (RECORRENTE/AVISTA) ou contract.id:pN
                // (PARCELADO) → `${id}%` cobre os dois. Antes só limpava PARCELADO,
                // então parcelas de LOCAÇÃO (recorrente) ficavam órfãs no financeiro.
                const { data: contractRows } = await supabase
                    .from('internal_transactions')
                    .select('id')
                    .eq('organization_id', orgId)
                    .in('source_system', ['CONTRACT_RECURRING', 'CONTRACT_PARCELADO', 'CONTRACT_AVISTA'])
                    .like('reference_id', `${id}%`);
                if (contractRows?.length) {
                    await supabase.from('internal_transactions')
                        .delete()
                        .in('id', contractRows.map((r: any) => r.id));
                }
            } catch (e) {
                console.error('[CONTRACTS] Error cleaning up financial transactions on contract delete:', e);
            }
        }
    },

    duplicateContract: async (id: string): Promise<Contract> => {
        // 1. Fetch original contract
        const { data: original, error: fetchError } = await supabase
            .from('contracts')
            .select('id, organization_id, project_id, budget_id, supplier_id, number, title, description, contract_type, nature, start_date, end_date, is_recurring, billing_cycle, due_day, status, original_value, current_value, reajuste_index, reajuste_data_base, reajuste_proximo, retention_rate, responsible_email, signed_contract_url, empresa_id, empreendimento_id, cost_center_id, category_id, payment_method, payment_term_type, payment_days, payment_installments, payment_schedule, client_id, direction, execution_address, client_responsible, internal_responsible, sla_days, warranty_months, labor_value, materials_value, services_included, services_excluded, signature_status, signature_token, signature_url, signature_completed_at, approval_status, approval_chain, approval_required_levels, created_at')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        // 2. Fetch original items
        const { data: items, error: itemsError } = await supabase
            .from('contract_items')
            .select('id, contract_id, budget_item_id, description, unit, quantity, unit_price, total_price, created_at')
            .eq('contract_id', id);

        if (itemsError) throw itemsError;

        // 3. Create new contract (Resetting some fields)
        const { data: dupe, error: createError } = await supabase
            .from('contracts')
            .insert({
                ...original,
                id: undefined,
                created_at: undefined,
                title: `${original.title} (Cópia)`,
                status: 'Rascunho',
                number: `${original.number}-COPY`
            })
            .select()
            .single();

        if (createError) throw createError;

        // 4. Duplicate items
        if (items && items.length > 0) {
            const duplicatedItems = items.map(item => ({
                ...item,
                id: undefined,
                created_at: undefined,
                contract_id: dupe.id
            }));

            const { error: insertItemsError } = await supabase
                .from('contract_items')
                .insert(duplicatedItems);

            if (insertItemsError) throw insertItemsError;
        }

        return dupe as Contract;
    },

    // Contract Items
    listContractItems: async (contractId: string): Promise<ContractItem[]> => {
        const { data, error } = await supabase
            .from('contract_items')
            .select('id, contract_id, budget_item_id, description, unit, quantity, unit_price, total_price, created_at')
            .eq('contract_id', contractId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data as ContractItem[];
    },

    addContractItem: async (item: Omit<ContractItem, 'id' | 'created_at'>): Promise<ContractItem> => {
        const { data, error } = await supabase
            .from('contract_items')
            .insert(item)
            .select()
            .single();

        if (error) throw error;
        return data as ContractItem;
    },

    updateContractItem: async (id: string, updates: Partial<ContractItem>): Promise<ContractItem> => {
        const { data, error } = await supabase
            .from('contract_items')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as ContractItem;
    },

    deleteContractItem: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('contract_items')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    // Aditivos (Addendums)
    listAddendums: async (contractId: string): Promise<ContractAddendum[]> => {
        const { data, error } = await supabase
            .from('contract_addendums')
            .select(ADDENDUM_COLS)
            .eq('contract_id', contractId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as unknown as ContractAddendum[];
    },

    getAddendumById: async (id: string): Promise<ContractAddendum | null> => {
        const { data, error } = await supabase
            .from('contract_addendums')
            .select(ADDENDUM_COLS)
            .eq('id', id)
            .maybeSingle();
        if (error) throw error;
        return (data as unknown as ContractAddendum) ?? null;
    },

    /**
     * Próximo número de aditivo do contrato (`AD-001`, `AD-002`…).
     *
     * Deriva do MAIOR sufixo existente, não de COUNT(*): a numeração antiga era
     * `length + 1` feita no ContractAddendumModal, então excluir um aditivo
     * fazia o próximo repetir um número já usado. O índice único
     * `uq_addendums_contract_number` é a rede de segurança.
     */
    nextAddendumNumber: async (contractId: string): Promise<string> => {
        const { data } = await supabase
            .from('contract_addendums')
            .select('number')
            .eq('contract_id', contractId);
        const maxSeq = (data || []).reduce((max, row) => {
            const m = /^AD-(\d+)/.exec((row.number as string) || '');
            return m ? Math.max(max, parseInt(m[1], 10)) : max;
        }, 0);
        return `AD-${String(maxSeq + 1).padStart(3, '0')}`;
    },

    createAddendum: async (addendum: Omit<ContractAddendum, 'id' | 'created_at' | 'status' | 'approved_at'>): Promise<ContractAddendum> => {
        // Exclude notes if empty to avoid 400 when the column hasn't been migrated yet
        const { notes, ...rest } = addendum as typeof addendum & { notes?: string };
        const payload: Record<string, unknown> = { ...rest, status: 'Pendente' };
        if (notes) payload.notes = notes;

        const { data, error } = await supabase
            .from('contract_addendums')
            .insert(payload)
            .select()
            .single();

        if (error) throw error;
        return data as ContractAddendum;
    },

    approveAddendum: async (id: string, approvedBy: string): Promise<void> => {
        // Fetch addendum to get value impact and contract_id
        const { data: addendumRow, error: fetchError } = await supabase
            .from('contract_addendums')
            .select(ADDENDUM_COLS)
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;
        // O select por constante perde a inferência de tipo do supabase-js.
        const addendum = addendumRow as unknown as ContractAddendum;
        if (addendum.status !== 'Pendente') throw new Error('Addendum is not pending approval');

        const { error: updateAddendumError } = await supabase
            .from('contract_addendums')
            .update({
                status: 'Aprovado',
                approved_by: approvedBy,
                approved_at: new Date().toISOString()
            })
            .eq('id', id);

        if (updateAddendumError) throw updateAddendumError;

        // ── Ramo PRORROGAÇÃO DE LOCAÇÃO ─────────────────────────────────────
        // Gate triplo: só entra aqui aditivo de renovação de contrato de
        // aluguel recorrente. Suprimentos e serviços seguem pelo caminho antigo.
        if (addendum.new_start_date) {
            const applied = await applyProrrogacaoAddendum(addendum, approvedBy);
            if (applied) return;
        }

        // Update contract: value and/or end_date — evaluated independently
        if (addendum.value_impact !== 0 || addendum.new_end_date) {
            const { data: contract, error: contractErr } = await supabase
                .from('contracts')
                .select('id, organization_id, project_id, budget_id, supplier_id, number, title, description, contract_type, nature, start_date, end_date, is_recurring, billing_cycle, due_day, status, original_value, current_value, reajuste_index, reajuste_data_base, reajuste_proximo, retention_rate, responsible_email, signed_contract_url, empresa_id, empreendimento_id, cost_center_id, category_id, payment_method, payment_term_type, payment_days, payment_installments, payment_schedule, client_id, direction, execution_address, client_responsible, internal_responsible, sla_days, warranty_months, labor_value, materials_value, services_included, services_excluded, signature_status, signature_token, signature_url, signature_completed_at, approval_status, approval_chain, approval_required_levels, minuta_versions, created_at')
                .eq('id', addendum.contract_id)
                .single();

            if (contractErr) throw contractErr;

            const contractUpdates: Record<string, any> = {};
            if (addendum.value_impact !== 0) {
                // Recalcula pela MESMA fórmula de updateContract (original_value +
                // Σ dos aditivos aprovados). Antes era `current_value += impacto`,
                // e os dois caminhos divergiam: salvar o contrato depois de
                // aprovar um aditivo reescrevia o valor com outra conta.
                const { data: aprovados } = await supabase
                    .from('contract_addendums')
                    .select('value_impact')
                    .eq('contract_id', addendum.contract_id)
                    .eq('status', 'Aprovado');
                const total = (aprovados || []).reduce((sum, a) => sum + (a.value_impact || 0), 0);
                contractUpdates.current_value = (contract.original_value || 0) + total;
            }
            if (addendum.new_end_date) {
                contractUpdates.end_date = addendum.new_end_date;
            }

            const { error: contractUpdateErr } = await supabase
                .from('contracts')
                .update(contractUpdates)
                .eq('id', addendum.contract_id);

            if (contractUpdateErr) throw contractUpdateErr;

            // Re-sync parcelado installments so Despesas/Conciliação reflect the new value
            if (addendum.value_impact !== 0 && !contract.is_recurring && contract.payment_term_type === 'Parcelado') {
                await syncParceladoScheduleToFinance({
                    ...contract,
                    current_value: contractUpdates.current_value
                } as Contract);
            }
        }
    },

    // Lançamentos financeiros gerados a partir deste contrato (Conciliação / internal_transactions)
    /**
     * Edita UMA parcela lançada pelo contrato (vencimento, valor, descrição).
     * Mesma regra da exclusão: paga ou conciliada não se altera por aqui.
     * `transaction_date` acompanha `due_date` — as duas datas nascem iguais na
     * geração e Contas a Receber usa a segunda para calcular atraso.
     */
    updateFinancialEntry: async (
        entryId: string,
        patch: {
            due_date?: string; amount?: number; description?: string;
            discount_type?: string | null; discount_amount?: number | null;
            installment_type?: string | null; payment_type?: string | null;
        },
    ): Promise<void> => {
        const { data } = await supabase
            .from('internal_transactions')
            .select('id, status, business_status')
            .eq('id', entryId)
            .maybeSingle();
        if (!data) return;
        const pago = data.status !== 'PENDING'
            || ['RECEBIDO', 'PAGO'].includes((data.business_status as string) ?? '');
        if (pago) {
            throw new Error('Parcela já paga ou conciliada — estorne no financeiro antes de editar.');
        }
        const payload: Record<string, unknown> = {};
        if (patch.due_date) { payload.due_date = patch.due_date; payload.transaction_date = patch.due_date; }
        if (patch.description != null) payload.description = patch.description;
        if (patch.installment_type !== undefined) payload.installment_type = patch.installment_type || null;
        if (patch.payment_type !== undefined) payload.payment_type = patch.payment_type || null;

        // Desconto: `original_amount` guarda o bruto e `amount` passa a ser o
        // LÍQUIDO — é ele que Contas a Receber cobra. Mesma regra do plano de
        // pagamento da negociação (updateInstallmentDiscount no DealModal).
        const mexeuValor = patch.amount != null
            || patch.discount_type !== undefined || patch.discount_amount !== undefined;
        if (mexeuValor) {
            const { data: atual } = await supabase
                .from('internal_transactions')
                .select('amount, original_amount, discount_type, discount_amount')
                .eq('id', entryId)
                .maybeSingle();

            const bruto = patch.amount ?? (atual?.original_amount as number | null) ?? (atual?.amount as number) ?? 0;
            const tipo = patch.discount_type !== undefined
                ? patch.discount_type
                : (atual?.discount_type as string | null);
            const valorDesc = patch.discount_amount !== undefined
                ? patch.discount_amount
                : (atual?.discount_amount as number | null);

            const desconto = !tipo || !valorDesc ? 0
                : tipo === 'PERCENT' ? (bruto * valorDesc) / 100
                : valorDesc;

            payload.original_amount = bruto;
            payload.discount_type = tipo || null;
            payload.discount_amount = tipo ? (valorDesc ?? 0) : null;
            payload.amount = Math.max(0, parseFloat((bruto - desconto).toFixed(2)));
        }
        if (Object.keys(payload).length === 0) return;

        const { error } = await supabase.from('internal_transactions').update(payload).eq('id', entryId);
        if (error) throw error;
    },

    /**
     * Exclui UMA parcela lançada pelo contrato (Contas a Receber).
     *
     * Só PENDING/PREVISTO: parcela paga ou conciliada é dinheiro reconhecido —
     * some daqui e o extrato deixa de fechar. Nesse caso o caminho é estorno no
     * financeiro, não exclusão pela negociação.
     */
    removeFinancialEntry: async (entryId: string): Promise<void> => {
        const { data } = await supabase
            .from('internal_transactions')
            .select('id, status, business_status')
            .eq('id', entryId)
            .maybeSingle();
        if (!data) return;
        const pago = data.status !== 'PENDING'
            || ['RECEBIDO', 'PAGO'].includes((data.business_status as string) ?? '');
        if (pago) {
            throw new Error('Parcela já paga ou conciliada — estorne no financeiro antes de excluir.');
        }
        const { error } = await supabase.from('internal_transactions').delete().eq('id', entryId);
        if (error) throw error;
    },

    listFinancialEntries: async (contract: Contract): Promise<{
        id: string; source_system: string; reference_id: string | null;
        transaction_date: string; amount: number; direction: 'CREDIT' | 'DEBIT';
        description: string | null; category: string | null; status: string;
        original_amount?: number | null; discount_type?: string | null; discount_amount?: number | null;
        installment_type?: string | null; payment_type?: string | null;
    }[]> => {
        if (!contract.organization_id) return [];

        const measurementSources = ['CONTRACT_AVISTA', 'CONTRACT_PARCELADO', 'CONTRACT_RECURRING'];
        const { data: byContract, error: e1 } = await supabase
            .from('internal_transactions')
            .select('id, source_system, reference_id, transaction_date, amount, direction, description, category, status, original_amount, discount_type, discount_amount, installment_type, payment_type')
            .eq('organization_id', contract.organization_id)
            .in('source_system', measurementSources)
            .like('reference_id', `${contract.id}%`);
        if (e1) throw e1;

        const { data: measurementRows } = await supabase
            .from('contract_measurements')
            .select('id')
            .eq('contract_id', contract.id);
        const measurementIds = (measurementRows ?? []).map((m: { id: string }) => m.id);

        let byMeasurement: typeof byContract = [];
        if (measurementIds.length > 0) {
            const { data, error: e2 } = await supabase
                .from('internal_transactions')
                .select('id, source_system, reference_id, transaction_date, amount, direction, description, category, status, original_amount, discount_type, discount_amount, installment_type, payment_type')
                .eq('organization_id', contract.organization_id)
                .eq('source_system', 'CONTRACT_MEASUREMENT')
                .in('reference_id', measurementIds);
            if (e2) throw e2;
            byMeasurement = data ?? [];
        }

        return [...(byContract ?? []), ...byMeasurement]
            .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
    },

    // Medições (Measurements)
    listMeasurements: async (contractId: string): Promise<ContractMeasurement[]> => {
        const { data, error } = await supabase
            .from('contract_measurements')
            .select('id, contract_id, number, period_start, period_end, measurement_date, status, measurement_mode, total_value, retention_value, net_value, notes, invoice_url, approved_by, approved_at, rejection_reason, created_at')
            .eq('contract_id', contractId)
            .order('number', { ascending: false });

        if (error) throw error;
        return data as ContractMeasurement[];
    },

    createMeasurement: async (
        measurement: Omit<ContractMeasurement, 'id' | 'created_at'>,
        items: Omit<ContractMeasurementItem, 'id' | 'measurement_id' | 'created_at'>[]
    ): Promise<ContractMeasurement> => {
        // 0. Carrega contrato para validar saldo e calcular retenção
        const { data: contract, error: contractErr } = await supabase
            .from('contracts')
            .select('current_value, retention_rate, billing_mode, release_requirements')
            .eq('id', measurement.contract_id)
            .single();
        if (contractErr) throw contractErr;

        // Gate de responsabilidade técnica (Cl.10.2): ART/RRT/TRT inválida ou
        // vencida suspende o pagamento do trecho até regularização.
        const { data: technicalGate } = await supabase.rpc('fn_contract_technical_gate', { p_contract_id: measurement.contract_id });
        const blockingTechnical = (technicalGate ?? []).filter((t: { is_blocking: boolean }) => t.is_blocking);
        if (blockingTechnical.length > 0) {
            const names = blockingTechnical.map((t: { professional_name: string; art_type: string }) => `${t.art_type} de ${t.professional_name}`).join(', ');
            throw new Error(`Medição bloqueada: responsabilidade técnica inválida/vencida (${names}). Regularize antes de medir (Cl.10.2).`);
        }

        const { data: prevMeasurements } = await supabase
            .from('contract_measurements')
            .select('total_value')
            .eq('contract_id', measurement.contract_id)
            .neq('status', 'Cancelada');
        const previousTotal = (prevMeasurements ?? []).reduce((s: number, m: { total_value: number }) => s + m.total_value, 0);
        const availableBalance = (contract.current_value ?? 0) - previousTotal;

        if (measurement.total_value > availableBalance + 0.01) {
            throw new Error(
                `Saldo insuficiente: disponível R$ ${availableBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, solicitado R$ ${measurement.total_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`
            );
        }

        // Retenção automática calculada a partir do contrato
        const retentionRate = contract.retention_rate ?? 0;
        const retentionValue = Math.round(measurement.total_value * retentionRate) / 100;
        const netValue = measurement.total_value - retentionValue;

        // 1. Cria cabeçalho da medição
        const { data: mData, error: mError } = await supabase
            .from('contract_measurements')
            .insert({ ...measurement, retention_value: retentionValue, net_value: netValue })
            .select()
            .single();

        if (mError) throw mError;

        // 2. Cria itens da medição
        const measurementItems = items.map(item => ({
            ...item,
            measurement_id: mData.id
        }));

        const { error: itemsError } = await supabase
            .from('contract_measurement_items')
            .insert(measurementItems);

        if (itemsError) throw itemsError;

        // 3. Sync financeiro — apenas quando NÃO é contrato por medição com gating.
        // Para billing_mode=MEDICAO o sync só ocorre após approveMeasurement().
        if (contract.billing_mode !== 'MEDICAO') {
            financialService.syncMeasurementToFinance(mData.id).catch(err => {
                console.error("[FINANCIAL SYNC ERROR]", err);
            });
        }

        return mData as ContractMeasurement;
    },

    updateMeasurement: async (
        id: string,
        measurement: Partial<ContractMeasurement>,
        items: Omit<ContractMeasurementItem, 'id' | 'measurement_id' | 'created_at'>[]
    ): Promise<ContractMeasurement> => {
        // Recalcula retenção se total_value mudou
        let patch = { ...measurement };
        if (patch.total_value !== undefined) {
            const { data: cm } = await supabase
                .from('contract_measurements')
                .select('contract_id')
                .eq('id', id)
                .single();
            if (cm?.contract_id) {
                const { data: ct } = await supabase
                    .from('contracts')
                    .select('current_value, retention_rate')
                    .eq('id', cm.contract_id)
                    .single();
                if (ct) {
                    const { data: prevMeasurements } = await supabase
                        .from('contract_measurements')
                        .select('total_value')
                        .eq('contract_id', cm.contract_id)
                        .neq('status', 'Cancelada')
                        .neq('id', id);
                    const previousTotal = (prevMeasurements ?? []).reduce((s: number, m: { total_value: number }) => s + m.total_value, 0);
                    const availableBalance = (ct.current_value ?? 0) - previousTotal;

                    if (patch.total_value > availableBalance + 0.01) {
                        throw new Error(
                            `Saldo insuficiente: disponível R$ ${availableBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, solicitado R$ ${patch.total_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`
                        );
                    }

                    const retentionValue = Math.round(patch.total_value * (ct.retention_rate ?? 0)) / 100;
                    patch.retention_value = retentionValue;
                    patch.net_value = patch.total_value - retentionValue;
                }
            }
        }

        // 1. Atualiza cabeçalho
        const { data: mData, error: mError } = await supabase
            .from('contract_measurements')
            .update(patch)
            .eq('id', id)
            .select()
            .single();

        if (mError) throw mError;

        // 2. Substitui itens
        const { error: deleteError } = await supabase
            .from('contract_measurement_items')
            .delete()
            .eq('measurement_id', id);

        if (deleteError) throw deleteError;

        const measurementItems = items.map(item => ({
            ...item,
            measurement_id: id
        }));

        const { error: itemsError } = await supabase
            .from('contract_measurement_items')
            .insert(measurementItems);

        if (itemsError) throw itemsError;

        // 3. Sync financeiro — só se não for gating por medição (ou se já estava Processada)
        const { data: ct2 } = await supabase
            .from('contracts')
            .select('billing_mode')
            .eq('id', mData.contract_id)
            .single();

        if (ct2?.billing_mode !== 'MEDICAO') {
            financialService.syncMeasurementToFinance(id).catch(err => {
                console.error("[FINANCIAL SYNC ERROR]", err);
            });
        }

        return mData as ContractMeasurement;
    },

    deleteMeasurement: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('contract_measurements')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    // Workflow de aprovação para contratos billing_mode=MEDICAO
    submitMeasurementForReview: async (id: string): Promise<ContractMeasurement> => {
        const { data, error } = await supabase
            .from('contract_measurements')
            .update({ status: 'Em Análise' })
            .eq('id', id)
            .eq('status', 'Pendente')
            .select()
            .single();
        if (error) throw error;
        if (!data) throw new Error('Medição não encontrada ou já enviada para análise.');
        return data as ContractMeasurement;
    },

    approveMeasurement: async (id: string, approvedBy: string): Promise<ContractMeasurement> => {
        // Valida checklist de liberação
        const { data: m, error: mErr } = await supabase
            .from('contract_measurements')
            .select('contract_id, status, invoice_url, total_value')
            .eq('id', id)
            .single();
        if (mErr) throw mErr;
        if (m.status !== 'Em Análise')
            throw new Error(`Medição não está Em Análise (status atual: ${m.status}).`);

        const { data: ct } = await supabase
            .from('contracts')
            .select('billing_mode, release_requirements')
            .eq('id', m.contract_id)
            .single();

        const req = ct?.release_requirements ?? {};
        if (req.require_invoice && !m.invoice_url)
            throw new Error('Aprovação bloqueada: Nota Fiscal não anexada.');

        if (req.require_evidence) {
            const { data: itemsWithEvidence } = await supabase
                .from('contract_measurement_items')
                .select('attachment_urls')
                .eq('measurement_id', id);
            const hasEvidence = (itemsWithEvidence ?? []).some(
                (i: { attachment_urls?: string[] }) => (i.attachment_urls ?? []).length > 0
            );
            if (!hasEvidence)
                throw new Error('Aprovação bloqueada: nenhuma evidência fotográfica anexada.');
        }

        const now = new Date().toISOString();
        const { data: updated, error: upErr } = await supabase
            .from('contract_measurements')
            .update({ status: 'Processada', approved_by: approvedBy, approved_at: now, rejection_reason: null })
            .eq('id', id)
            .select()
            .single();
        if (upErr) throw upErr;

        // Sync financeiro só ocorre aqui — após aprovação
        financialService.syncMeasurementToFinance(id).catch(err => {
            console.error('[FINANCIAL SYNC ERROR]', err);
        });

        return updated as ContractMeasurement;
    },

    rejectMeasurement: async (id: string, reason: string): Promise<ContractMeasurement> => {
        const { data, error } = await supabase
            .from('contract_measurements')
            .update({ status: 'Pendente', rejection_reason: reason, approved_by: null, approved_at: null })
            .eq('id', id)
            .in('status', ['Em Análise', 'Processada'])
            .select()
            .single();
        if (error) throw error;
        if (!data) throw new Error('Medição não encontrada ou não pode ser rejeitada neste status.');
        return data as ContractMeasurement;
    },

    getMeasurementItems: async (measurementId: string): Promise<ContractMeasurementItem[]> => {
        const { data, error } = await supabase
            .from('contract_measurement_items')
            .select('id, measurement_id, contract_item_id, quantity_executed, value_executed, attachment_urls, percent_executed, item_mode, created_at')
            .eq('measurement_id', measurementId);

        if (error) throw error;
        return data as ContractMeasurementItem[];
    },

    // Fase 4 (EVM) — rollup de medições de empreitada por item de orçamento (= id da
    // tarefa do cronograma). Agrega medido/aprovado/pago via RPC, sem fan-out N+M.
    getMeasurementRollupByBudgetItem: async (
        projectId: string,
    ): Promise<Record<string, { measured: number; approved: number; paid: number }>> => {
        const { data, error } = await supabase.rpc('fn_project_measurements_by_budget_item', {
            p_project_id: projectId,
        });
        if (error) throw error;
        const map: Record<string, { measured: number; approved: number; paid: number }> = {};
        (data ?? []).forEach((r: { budget_item_id: string; measured: number; approved: number; paid: number }) => {
            map[r.budget_item_id] = {
                measured: Number(r.measured ?? 0),
                approved: Number(r.approved ?? 0),
                paid: Number(r.paid ?? 0),
            };
        });
        return map;
    },

    // Faturas de Consumo (Utility Bills)
    listUtilityBills: async (contractId: string): Promise<ContractUtilityBill[]> => {
        const { data, error } = await supabase
            .from('contract_utility_bills')
            .select('id, contract_id, reference_month, consumption_metric, total_value, status, due_date, notes, created_at')
            .eq('contract_id', contractId)
            .order('reference_month', { ascending: false });

        if (error) throw error;
        return data as ContractUtilityBill[];
    },

    createUtilityBill: async (bill: Omit<ContractUtilityBill, 'id' | 'created_at'>): Promise<ContractUtilityBill> => {
        const { data, error } = await supabase
            .from('contract_utility_bills')
            .insert(bill)
            .select()
            .single();

        if (error) throw error;
        return data as ContractUtilityBill;
    },

    updateUtilityBill: async (id: string, updates: Partial<ContractUtilityBill>): Promise<ContractUtilityBill> => {
        const { data, error } = await supabase
            .from('contract_utility_bills')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as ContractUtilityBill;
    },

    deleteUtilityBill: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('contract_utility_bills')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    // ─── Gerar Contrato a partir do Orçamento ────────────────────────────────

    /**
     * Cria um contrato OUTGOING (para cliente) a partir do orçamento aprovado do projeto.
     * - Congela snapshot do budget
     * - Importa itens do orçamento como contract_items
     * - Herda valor total, escopo e cronograma do projeto
     */
    generateFromBudget: async (
        projectId: string,
        organizationId: string,
        budgetEntries: BudgetEntry[],
        overrides?: Partial<Contract>
    ): Promise<Contract> => {
        // Calcula valor total do orçamento (quantidade × preço × (1 + bdi/100))
        const totalValue = budgetEntries.reduce((sum, e) => {
            const bdi = e.bdi ?? 0;
            return sum + e.quantity * e.sinapiItem.price * (1 + bdi / 100);
        }, 0);

        // Busca dados do projeto para herdar nome e configurações
        const { data: project } = await supabase
            .from('projects')
            .select('name, settings, budget')
            .eq('id', projectId)
            .single();

        // Gera número sequencial isolado para OUTGOING (Serviços)
        const number = await contractService.getNextContractNumber(organizationId, 'OUTGOING');

        const contractPayload: Omit<Contract, 'id' | 'created_at' | 'current_value'> = {
            organization_id: organizationId,
            project_id: projectId,
            number,
            title: `Contrato — ${project?.name ?? 'Projeto'}`,
            contract_type: 'Empreitada Global',
            nature: 'Serviço',
            direction: 'OUTGOING',
            start_date: new Date().toISOString().split('T')[0],
            end_date: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
            status: 'Rascunho',
            original_value: Math.round(totalValue * 100) / 100,
            retention_rate: 0,
            budget_id: projectId, // referência ao projeto-orçamento
            budget_snapshot: project?.budget ?? null,
            ...overrides,
        };

        const contract = await contractService.createContract(contractPayload);

        // Importa itens do orçamento como contract_items
        if (budgetEntries.length > 0) {
            const items = budgetEntries.map(e => {
                const unitPrice = e.sinapiItem.price * (1 + (e.bdi ?? 0) / 100);
                return {
                    contract_id: contract.id,
                    budget_item_id: e.id,
                    description: `[${e.sinapiItem.code}] ${e.sinapiItem.description}`,
                    unit: e.sinapiItem.unit,
                    quantity: e.quantity,
                    unit_price: Math.round(unitPrice * 100) / 100,
                    total_price: Math.round(e.quantity * unitPrice * 100) / 100,
                };
            });
            await supabase.from('contract_items').insert(items);
        }

        return contract;
    },

    /** Retorna próximo número de contrato formatado, isolado por direction quando informado */
    getNextContractNumber: async (organizationId: string, direction?: 'OUTGOING' | 'INCOMING'): Promise<string> => {
        const { data } = direction
            ? await supabase.rpc('get_next_contract_number', { p_org_id: organizationId, p_direction: direction })
            : await supabase.rpc('get_next_contract_number', { p_org_id: organizationId });
        return data ?? '001';
    },

    // ─── Gerar Obra a partir do Contrato ─────────────────────────────────────

    /**
     * Cria um projeto OBRA vinculado ao contrato assinado.
     * Herda: nome, valor contratado, escopo (budget_snapshot), centro de custo.
     */
    generateObra: async (contractId: string): Promise<{ projectId: string }> => {
        const { data: contract, error } = await supabase
            .from('contracts')
            .select('id, organization_id, project_id, budget_id, supplier_id, number, title, description, contract_type, nature, start_date, end_date, is_recurring, billing_cycle, due_day, status, original_value, current_value, reajuste_index, reajuste_data_base, reajuste_proximo, retention_rate, responsible_email, signed_contract_url, empresa_id, empreendimento_id, cost_center_id, category_id, payment_method, payment_term_type, payment_days, payment_installments, payment_schedule, client_id, direction, execution_address, client_responsible, internal_responsible, sla_days, warranty_months, labor_value, materials_value, services_included, services_excluded, budget_snapshot, signature_status, signature_token, signature_url, signature_completed_at, approval_status, approval_chain, approval_required_levels, created_at')
            .eq('id', contractId)
            .single();
        if (error || !contract) throw new Error('Contrato não encontrado.');
        if (contract.project_id) throw new Error('Este contrato já possui uma obra vinculada.');


        const settings = {
            ...INITIAL_PROJECT_SETTINGS,
            organizationId: contract.organization_id,
            classification: 'OBRA' as const,
            totalValue: contract.current_value,
            contractId,
            contractNumber: contract.number,
            ...(contract.cost_center_id ? { costCenterId: contract.cost_center_id } : {}),
        };

        const savedProject = await projectService.saveProject({
            name: contract.title,
            settings,
            budget: (contract.budget_snapshot as any) ?? [],
        });

        // Vincula obra ao contrato
        await supabase
            .from('contracts')
            .update({ project_id: savedProject.id })
            .eq('id', contractId);

        return { projectId: savedProject.id };
    },

    // ─── Assinatura Eletrônica ────────────────────────────────────────────────

    sendForSignature: async (
        contractId: string,
        organizationId: string,
        documentBase64: string,
        documentName: string,
        signers: { name: string; email: string; phone?: string }[]
    ): Promise<{ token: string; sign_url: string }> => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Não autenticado.');

        const { data: fnData, error: fnError } = await supabase.functions.invoke('sign-contract', {
            body: { action: 'send', contractId, organizationId, documentBase64, documentName, signers },
        });
        if (fnError) throw new Error(fnError.message ?? 'Erro ao invocar serviço de assinatura.');
        if (!fnData?.success) throw new Error(fnData?.error ?? 'Falha ao enviar para assinatura.');
        return { token: fnData.token, sign_url: fnData.sign_url };
    },

    getSignatureStatus: async (signatureToken: string): Promise<{ status: string; signed_file?: string }> => {
        const { data: fnData, error: fnError } = await supabase.functions.invoke('sign-contract', {
            body: { action: 'status', signatureToken, organizationId: 'query', dealId: 'query' },
        });
        if (fnError) throw new Error(fnError.message);
        return fnData;
    },

    // ─── Aprovação Multinível ─────────────────────────────────────────────────

    // Delega à primitiva unificada (approvalService); injeta os efeitos
    // específicos do contrato (status 'Ativo' ao aprovar / 'Rascunho' ao
    // rejeitar). Assinaturas preservadas (Regra de Ouro 12).
    // Observação: o submit agora resolve os níveis pelo valor do contrato
    // (antes ficava no default 1), unificando a política com o financeiro.

    submitForApproval: async (contractId: string): Promise<Contract> => {
        // `semFaixa: 'liberar'` — contrato abaixo do piso da alçada não entra na
        // fila. Ver a explicação em `approvalService.submit`.
        return await approvalService.submit('contract', contractId, {}, { semFaixa: 'liberar' }) as Contract;
    },

    approveContract: async (
        contractId: string,
        level: 1 | 2,
        approvedBy: string,
        notes?: string
    ): Promise<Contract> => {
        return await approvalService.approve(
            'contract', contractId, level, approvedBy,
            { level1_label: 'Gestor', level2_label: 'Financeiro/Diretoria' },
            notes,
            { status: 'Ativo' },
        ) as Contract;
    },

    rejectContract: async (
        contractId: string,
        rejectedBy: string,
        reason: string
    ): Promise<Contract> => {
        return await approvalService.reject(
            'contract', contractId, rejectedBy, reason,
            { status: 'Rascunho' },
        ) as Contract;
    },

    // ─── Reajuste contratual ──────────────────────────────────────────────────

    /**
     * Aplica reajuste ao contrato usando a fórmula padrão:
     *   novo_valor = current_value × (indexValue / indexBase)
     * onde indexBase e indexValue são fornecidos pelo chamador (ex: INCC/IPCA manual ou via API).
     * Atualiza current_value, reajuste_data_base (nova base = hoje) e reajuste_proximo (+ 12 meses),
     * e re-sincroniza parcelas/recorrência ao módulo financeiro.
     */
    applyReajuste: async (
        contractId: string,
        indexBase: number,
        indexValue: number,
        notes?: string
    ): Promise<Contract> => {
        if (indexBase <= 0) throw new Error('Índice base deve ser maior que zero.');
        if (indexValue <= 0) throw new Error('Índice atual deve ser maior que zero.');

        const { data: contract, error: fetchErr } = await supabase
            .from('contracts')
            .select('id, organization_id, project_id, budget_id, supplier_id, number, title, description, contract_type, nature, start_date, end_date, is_recurring, billing_cycle, due_day, status, original_value, current_value, reajuste_index, reajuste_data_base, reajuste_proximo, retention_rate, responsible_email, signed_contract_url, empresa_id, empreendimento_id, cost_center_id, category_id, payment_method, payment_term_type, payment_days, payment_installments, payment_schedule, client_id, direction, execution_address, client_responsible, internal_responsible, sla_days, warranty_months, labor_value, materials_value, services_included, services_excluded, signature_status, signature_token, signature_url, signature_completed_at, approval_status, approval_chain, approval_required_levels, created_at')
            .eq('id', contractId)
            .single();
        if (fetchErr) throw fetchErr;

        if (!['Ativo', 'Assinado'].includes(contract.status)) {
            throw new Error(`Não é possível aplicar reajuste em um contrato com status "${contract.status}". O contrato deve estar "Ativo" ou "Assinado".`);
        }

        const fator = indexValue / indexBase;
        const novoValor = parseFloat((contract.current_value * fator).toFixed(2));
        const hoje = new Date().toISOString().split('T')[0];
        const proximo = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0];

        const { data: updated, error: updateErr } = await supabase
            .from('contracts')
            .update({
                current_value: novoValor,
                reajuste_data_base: hoje,
                reajuste_proximo: proximo,
                ...(notes ? { description: `[Reajuste ${hoje}] ${notes}\n${contract.description || ''}` } : {}),
            })
            .eq('id', contractId)
            .select()
            .single();
        if (updateErr) throw updateErr;

        // Re-sync parcelas futuras se parcelado
        if (!updated.is_recurring && updated.payment_term_type === 'Parcelado') {
            await syncParceladoScheduleToFinance(updated as Contract);
        }

        // Re-sync recorrente (ex.: locação): o reajuste altera apenas o VALOR das
        // parcelas futuras — mesmas datas. Parcelas passadas/já conciliadas não mudam.
        // (syncRecurringToFinance não serve aqui: usa original_value e re-inseriria
        // tudo, duplicando os lançamentos.)
        if (updated.is_recurring && updated.organization_id) {
            try {
                await supabase.from('internal_transactions')
                    .update({ amount: novoValor })
                    .eq('organization_id', updated.organization_id)
                    .eq('source_system', 'CONTRACT_RECURRING')
                    .like('reference_id', `${updated.id}%`)
                    .eq('status', 'PENDING')
                    .gte('transaction_date', hoje);
            } catch (e) {
                console.error('[CONTRACTS] Erro ao re-sincronizar recorrente após reajuste:', e);
            }
        }

        return updated as Contract;
    },

    // ─────────────────────────────────────────────────────────
    // Fase 5.2 — Retenção faseada / liberação (CP-08, Cl.18)
    // PLANO_MODULO_CONTRATOS_GAPS.md
    // ─────────────────────────────────────────────────────────

    /** Retido (soma das medições) vs liberado vs saldo — card "Retenção" na aba Financeiro */
    getRetentionLedger: async (contractId: string): Promise<ContractRetentionLedger> => {
        const { data, error } = await supabase
            .rpc('fn_contract_retention_ledger', { p_contract_id: contractId })
            .single();
        if (error) throw error;
        return data as ContractRetentionLedger;
    },

    listRetentionReleases: async (contractId: string): Promise<ContractRetentionRelease[]> => {
        const { data, error } = await supabase
            .from('contract_retention_releases')
            .select('*')
            .eq('contract_id', contractId)
            .order('released_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
    },

    /** Registra a liberação de uma parcela da retenção (provisório/definitivo/manual) */
    releaseRetention: async (payload: {
        organization_id: string;
        contract_id: string;
        kind: 'PROVISORIO' | 'DEFINITIVO' | 'MANUAL';
        amount: number;
        released_by?: string;
        notes?: string;
    }): Promise<ContractRetentionRelease> => {
        if (payload.amount <= 0) throw new Error('O valor a liberar deve ser maior que zero.');

        const { data: ledger, error: ledgerErr } = await supabase
            .rpc('fn_contract_retention_ledger', { p_contract_id: payload.contract_id })
            .single();
        if (ledgerErr) throw ledgerErr;
        const balance = (ledger as ContractRetentionLedger).balance;
        if (payload.amount > balance) {
            throw new Error(`Valor solicitado (R$ ${payload.amount.toFixed(2)}) excede o saldo retido disponível (R$ ${balance.toFixed(2)}).`);
        }

        const { data, error } = await supabase
            .from('contract_retention_releases')
            .insert({ ...payload, released_at: new Date().toISOString().split('T')[0] })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // ─────────────────────────────────────────────────────────
    // Fase 6.3 — Pré-mobilização & Ordem de Início (Cl.4, Manual §11)
    // PLANO_MODULO_CONTRATOS_GAPS.md
    // ─────────────────────────────────────────────────────────

    listPrecedentConditions: async (contractId: string): Promise<ContractPrecedentCondition[]> => {
        const { data, error } = await supabase
            .from('contract_precedent_conditions')
            .select('*')
            .eq('contract_id', contractId)
            .order('sort_order', { ascending: true });
        if (error) throw error;
        return data ?? [];
    },

    togglePrecedentCondition: async (id: string, satisfied: boolean): Promise<ContractPrecedentCondition> => {
        const { data, error } = await supabase
            .from('contract_precedent_conditions')
            .update({ satisfied, satisfied_at: satisfied ? new Date().toISOString() : null })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    /**
     * Emite a Ordem de Início — só permite se todas as condições precedentes
     * obrigatórias estiverem satisfeitas (Manual §11) e, para contratação de
     * mão de obra/PF, se o questionário trabalhista não estiver com 2+
     * alertas sem parecer jurídico anexado (Manual §8).
     */
    issueStartOrder: async (contractId: string, authorizedBy: string): Promise<Contract> => {
        const { data: conditions, error: condErr } = await supabase
            .from('contract_precedent_conditions')
            .select('item, required, satisfied')
            .eq('contract_id', contractId);
        if (condErr) throw condErr;
        const pending = (conditions ?? []).filter(c => c.required && !c.satisfied);
        if (pending.length > 0) {
            throw new Error(`Condições precedentes pendentes: ${pending.map(c => c.item).join(', ')}.`);
        }

        const { data: contract, error: contractErr } = await supabase
            .from('contracts')
            .select('nature')
            .eq('id', contractId)
            .single();
        if (contractErr) throw contractErr;

        if (contract.nature === 'Mão de Obra') {
            const { data: questionnaire } = await supabase
                .from('contract_labor_questionnaires')
                .select('alert_count, legal_opinion_url')
                .eq('contract_id', contractId)
                .maybeSingle();
            if (questionnaire && questionnaire.alert_count >= 2 && !questionnaire.legal_opinion_url) {
                throw new Error('Questionário de Risco Trabalhista com 2+ alertas exige parecer jurídico anexado antes da Ordem de Início (Manual §8).');
            }
        }

        const { data, error } = await supabase
            .from('contracts')
            .update({
                start_order_issued_at: new Date().toISOString().split('T')[0],
                start_order_authorized_by: authorizedBy,
                status: 'Ativo',
            })
            .eq('id', contractId)
            .select()
            .single();
        if (error) throw error;
        return data as Contract;
    },

    // ─────────────────────────────────────────────────────────
    // Fase 6.4 — Matriz Documental & Condicionantes (Anexo V, Manual §14)
    // PLANO_MODULO_CONTRATOS_GAPS.md
    // ─────────────────────────────────────────────────────────

    listDocumentRequirements: async (contractId: string): Promise<ContractDocumentRequirement[]> => {
        const { data, error } = await supabase
            .from('contract_document_requirements')
            .select('*')
            .eq('contract_id', contractId)
            .order('phase', { ascending: true });
        if (error) throw error;
        return data ?? [];
    },

    saveDocumentRequirement: async (payload: Partial<ContractDocumentRequirement> & { organization_id: string; contract_id: string; document: string; phase: DocumentRequirementPhase }): Promise<ContractDocumentRequirement> => {
        const { id, ...rest } = payload;
        const query = id
            ? supabase.from('contract_document_requirements').update(rest).eq('id', id)
            : supabase.from('contract_document_requirements').insert(rest);
        const { data, error } = await query.select().single();
        if (error) throw error;
        return data;
    },

    removeDocumentRequirement: async (id: string): Promise<void> => {
        const { error } = await supabase.from('contract_document_requirements').delete().eq('id', id);
        if (error) throw error;
    },

    /** Documentos MENSAL vencidos que bloqueiam a próxima medição (gate de pagamento) */
    getDocumentGate: async (contractId: string): Promise<ContractDocumentGateItem[]> => {
        const { data, error } = await supabase.rpc('fn_contract_document_gate', { p_contract_id: contractId });
        if (error) throw error;
        return data ?? [];
    },
};
