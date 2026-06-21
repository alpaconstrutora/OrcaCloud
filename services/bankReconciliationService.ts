import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import {
    BankTransaction,
    BankTransactionStatus,
    MatchType
} from '../types';

interface RawTransaction {
    date: string;
    amount: number;
    description?: string;
    memo?: string;
    fitid?: string;
    id?: string;
}

interface NormalizedBankTx {
    organization_id: string;
    bank_account_id: string;
    external_id: string;
    transaction_date: string;
    amount: number;
    direction: 'DEBIT' | 'CREDIT';
    description_raw: string;
    status: BankTransactionStatus;
    fingerprint: string;
}

interface RuleCondition {
    field: string;
    type: 'contains' | 'equals' | 'starts_with' | 'regex';
    value: string;
}

export interface ReconciliationEngineSettings {
    fine_percent: number;
    interest_percent_month: number;
    value_tol_abs: number;       // R$
    value_tol_pct: number;       // %
    encargos_tol_pct: number;    // %
    date_window_days: number;
    auto_threshold: number;
    suggestion_min: number;
}

interface ResolvedParty {
    party_id: string;
    party_type: 'SUPPLIER' | 'CLIENT';
    party_name?: string | null;
    via: string;                 // 'aprendido' | 'CNPJ'
}

interface PartyIndex {
    docIndex: Map<string, { party_id: string; party_type: 'SUPPLIER' | 'CLIENT'; party_name?: string | null }>;
    aliases: { token: string; party_id: string; party_type: 'SUPPLIER' | 'CLIENT'; party_name?: string | null; hit: number }[];
}

export const bankReconciliationService = {
    /**
     * Unifica a normalização de texto para garantir paridade entre regras e descrições.
     */
    normalizeText(text: string): string {
        return (text || '')
            .toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
            .replace(/[^A-Z0-9 ]/g, ' ') // Remove caracteres especiais
            .replace(/\s+/g, ' ') // Remove espaços duplicados
            .trim();
    },

    /**
     * Ingiere un arquivo OFX, CSV ou CNAB e cria as transações brutas.
     */
    async ingestFile(file: File, bankAccountId: string, organizationId: string) {
        return this.ingestMultipleFiles([file], bankAccountId, organizationId);
    },

    /**
     * Ingiere múltiplos arquivos OFX, CSV ou CNAB e cria as transações brutas de forma consolidada.
     */
    async ingestMultipleFiles(files: File[], bankAccountId: string, organizationId: string) {
        const allNormalizedTxs: NormalizedBankTx[] = [];

        for (const file of files) {
            try {
                const fileName = file.name.toLowerCase();
                const rawTransactions: RawTransaction[] = [];

                if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
                    const buffer = await file.arrayBuffer();
                    rawTransactions.push(...this.parseXLSX(buffer));
                } else {
                    let text: string;
                    if (fileName.endsWith('.ofx')) {
                        // OFX de bancos brasileiros costuma usar Windows-1252/ISO-8859-1
                        const buffer = await file.arrayBuffer();
                        try {
                            text = new TextDecoder('windows-1252').decode(buffer);
                        } catch {
                            text = new TextDecoder('utf-8').decode(buffer);
                        }
                    } else {
                        text = await file.text();
                    }

                    if (fileName.endsWith('.ofx')) {
                        rawTransactions.push(...this.parseOFX(text));
                    } else if (fileName.endsWith('.csv')) {
                        rawTransactions.push(...this.parseCSV(text));
                    } else if (fileName.endsWith('.ret') || fileName.endsWith('.txt') || fileName.endsWith('.cnab')) {
                        const firstLine = text.split('\n')[0];
                        if (firstLine.length >= 400) {
                            rawTransactions.push(...this.parseCNAB400(text));
                        } else {
                            rawTransactions.push(...this.parseCNAB240(text));
                        }
                    }
                }

                const normalizedTxs = rawTransactions.map(tx => ({
                    organization_id: organizationId,
                    bank_account_id: bankAccountId,
                    external_id: tx.fitid || tx.id || `ext-${Math.random().toString(36).substring(7)}`,
                    transaction_date: tx.date,
                    amount: Math.abs(tx.amount),
                    direction: (tx.amount < 0 ? 'DEBIT' : 'CREDIT') as 'DEBIT' | 'CREDIT',
                    description_raw: tx.memo || tx.description || 'Sem descrição',
                    status: 'IMPORTED' as BankTransactionStatus,
                    fingerprint: this.generateFingerprint(tx)
                }));

                allNormalizedTxs.push(...normalizedTxs);
            } catch (err) {
                console.error(`Error parsing file ${file.name}:`, err);
            }
        }

        if (allNormalizedTxs.length === 0) return { inserted: 0, duplicates: 0, data: [] };

        // Remover duplicatas dentro do próprio lote (mesmo fingerprint)
        const uniqueInBatch = Array.from(new Map(allNormalizedTxs.map(tx => [tx.fingerprint, tx])).values());

        // Estabilização: Filtrar transações já existentes pelo fingerprint e bank_account_id
        const fingerprints = uniqueInBatch.map(tx => tx.fingerprint);

        const { data: existingTxs } = await supabase
            .from('bank_transactions')
            .select('fingerprint')
            .eq('bank_account_id', bankAccountId)
            .in('fingerprint', fingerprints);

        const existingFingerprints = new Set(existingTxs?.map(tx => tx.fingerprint) || []);
        const newTxs = uniqueInBatch.filter(tx => !existingFingerprints.has(tx.fingerprint));
        const duplicateCount = uniqueInBatch.length - newTxs.length;

        if (newTxs.length === 0) return { inserted: 0, duplicates: duplicateCount, data: [] };

        const { data, error } = await supabase
            .from('bank_transactions')
            .upsert(newTxs, { onConflict: 'bank_account_id,external_id' })
            .select();

        if (error) throw error;

        // Após importar o lote completo, normaliza e aplica regras uma única vez
        await this.normalizeTransactions(bankAccountId);
        await this.applyCustomRules(bankAccountId, organizationId);

        return { inserted: data?.length ?? newTxs.length, duplicates: duplicateCount, data: data ?? [] };
    },

    /**
     * Normaliza as descrições brutas para facilitar o matching.
     */
    async normalizeTransactions(bankAccountId: string) {
        const { data: txs, error } = await supabase
            .from('bank_transactions')
            .select('id, organization_id, bank_account_id, external_id, transaction_date, amount, direction, description_raw, description_normalized, counterparty_name, transaction_type, fingerprint, category, status, project_id, created_at')
            .eq('bank_account_id', bankAccountId)
            .eq('status', 'IMPORTED');

        if (error || !txs) return;

        for (const tx of txs) {
            const normalizedDescription = this.normalizeText(tx.description_raw);

            const { error: updateError } = await supabase
                .from('bank_transactions')
                .update({
                    description_normalized: normalizedDescription,
                    status: 'NORMALIZED'
                })
                .eq('id', tx.id);
            
            if (updateError) throw updateError;
        }
    },

    /**
     * Aplica regras customizadas pré-definidas pelo usuário.
     */
    async applyCustomRules(bankAccountId: string, organizationId: string, reprocessAll: boolean = false, ruleIds?: string[]) {
        console.log(`[Motor] Verificando para Conta: ${bankAccountId} | Org: ${organizationId}`);
        let appliedCount = 0;
        let query = supabase
            .from('reconciliation_rules')
            .select('id, name, priority, is_active, organization_id, conditions, actions, created_at')
            .eq('organization_id', organizationId)
            .eq('is_active', true);

        if (ruleIds && ruleIds.length > 0) {
            query = query.in('id', ruleIds);
        }

        const { data: rules, error: rulesError } = await query.order('priority', { ascending: false });

        if (rulesError) {
            console.error('[ERRO] Falha ao carregar regras:', rulesError);
            throw rulesError;
        }

        console.log(`[Regras] Encontradas: ${rules?.length || 0} regras para org: ${organizationId}`);
        if (!rules || rules.length === 0) return 0;

        // Sincronização de Segurança: Garante que as transações na conta selecionada 
        // pertençam oficialmente a esta organização, corrigindo possíveis órfãs de importação
        await supabase
            .from('bank_transactions')
            .update({ organization_id: organizationId })
            .eq('bank_account_id', bankAccountId)
            .is('organization_id', null);

        const targetStatuses = ['IMPORTED', 'NORMALIZED', 'RULE_APPLIED'];
        if (reprocessAll) targetStatuses.push('MATCHED'); // Permite re-aplicar regras se solicitado

        const { data: txs, error: txsError } = await supabase
            .from('bank_transactions')
            .select('id, organization_id, bank_account_id, external_id, transaction_date, amount, direction, description_raw, description_normalized, counterparty_name, transaction_type, fingerprint, category, status, project_id, created_at')
            .eq('bank_account_id', bankAccountId)
            .in('status', targetStatuses)
            .order('transaction_date', { ascending: false })
            .limit(10000); 

        if (txsError) {
            console.error('[ERRO] Falha ao carregar transações para regras:', txsError);
            throw txsError;
        }

        console.log(`[Motor] Processando ${txs?.length || 0} transações em status: ${targetStatuses.join(', ')}`);
        if (!txs || txs.length === 0) return 0;

        for (const tx of txs) {
            for (const rule of rules) {
                const match = this.evaluateRule(tx, rule.conditions, organizationId);
                if (match) {
                    // Logs a aplicação da regra para auditoria (Isolado para não quebrar o motor se o log falhar)
                    try {
                        await supabase.from('reconciliation_audit_log').insert({
                            organization_id: organizationId,
                            event_type: 'RULE_MATCH',
                            target_id: tx.id,
                            payload: { rule_id: rule.id, rule_name: rule.name, applied_category: rule.actions.category }
                        });
                    } catch (logError) {
                        console.warn('[Aviso] Falha ao gravar log de auditoria, mas a regra continua:', logError);
                    }

                    // auto_confirm: marca como CONFIRMED (transação já contabilizada externamente,
                    // ex.: repasse de gateway) — sai do pool de matching de receita, evitando
                    // dupla contagem com recebíveis já baixados via webhook.
                    const nextStatus = rule.actions.auto_confirm ? 'CONFIRMED' : 'RULE_APPLIED';

                    const { error: updateError } = await supabase
                        .from('bank_transactions')
                        .update({
                            category: rule.actions.category,
                            counterparty_name: rule.actions.counterparty || tx.counterparty_name,
                            status: nextStatus
                        })
                        .eq('id', tx.id);
                    
                    if (updateError) {
                        console.error('[ERRO] Falha ao atualizar transação com a regra:', updateError);
                        throw updateError;
                    }

                    appliedCount++;
                    break; 
                }
            }
        }
        
        console.log(`[Motor Finalizado] Total de ${appliedCount} transações identificadas por regras.`);
        return appliedCount;
    },

    evaluateRule(tx: BankTransaction, conditions: RuleCondition | RuleCondition[], organizationId: string): boolean {
        if (Array.isArray(conditions)) {
            return conditions.some(c => this.evaluateRuleSingle(tx, c, organizationId));
        }
        return this.evaluateRuleSingle(tx, conditions, organizationId);
    },

    evaluateRuleSingle(tx: BankTransaction, cond: RuleCondition, organizationId: string): boolean {
        // Normaliza o nome do campo para garantir compatibilidade com versões anteriores
        const fieldName = (cond.field === 'description_norm' || cond.field === 'description') 
            ? 'description_normalized' 
            : cond.field;
            
        const rawVal = (tx as unknown as Record<string, unknown>)[fieldName] ?? tx.description_normalized ?? tx.description_raw ?? '';
        
        // Normalização extrema para comparação
        const normalizedFieldVal = this.normalizeText(rawVal.toString());
        const normalizedSearchVal = this.normalizeText(cond.value || '');

        if (!normalizedSearchVal) return false;

        let match = false;
        switch (cond.type) {
            case 'contains': match = normalizedFieldVal.includes(normalizedSearchVal); break;
            case 'equals': match = normalizedFieldVal === normalizedSearchVal; break;
            case 'starts_with': match = normalizedFieldVal.startsWith(normalizedSearchVal); break;
            case 'regex': try { match = new RegExp(cond.value, 'i').test(normalizedFieldVal); } catch { match = false; } break;
            default: match = false;
        }

        if (match) {
            console.log(`[Regra Match!] ID: ${tx.id} | Regra: ${JSON.stringify(cond.value)} | Status: ${tx.status}`);
        } else {
             const lowerField = normalizedFieldVal.toLowerCase();
             const lowerSearch = normalizedSearchVal.toLowerCase();
             
             // Log diagnóstico específico para o caso em questão
             if (lowerField.includes('waldir') || lowerSearch.includes('waldir')) {
                 console.log(`[DIAGNÓSTICO WALDIR] Falha de Match!
                    - ID Transação: ${tx.id}
                    - Org Transação: ${tx.organization_id}
                    - Org Motor: ${organizationId}
                    - Status: ${tx.status}
                    - Contém Waldir? ${lowerField.includes('waldir')}
                    - Termo Busca: "${normalizedSearchVal}"
                    - Match Inclusão: ${normalizedFieldVal.includes(normalizedSearchVal)}`);
             }
        }

        return match;
    },

    /**
     * Carrega as configurações do motor: tolerâncias/limiares (reconciliation_settings)
     * + multa/juros (asaas_charge_config). Aplica defaults quando ausente.
     */
    async loadSettings(organizationId: string): Promise<ReconciliationEngineSettings> {
        const defaults: ReconciliationEngineSettings = {
            fine_percent: 2, interest_percent_month: 1,
            value_tol_abs: 50, value_tol_pct: 3, encargos_tol_pct: 0.5,
            date_window_days: 10, auto_threshold: 100, suggestion_min: 40,
        };
        try {
            const [{ data: asaas }, { data: rs }] = await Promise.all([
                supabase.from('asaas_charge_config').select('fine_percent, interest_percent_month').eq('organization_id', organizationId).maybeSingle(),
                supabase.from('reconciliation_settings').select('value_tol_abs, value_tol_pct, encargos_tol_pct, date_window_days, auto_threshold, suggestion_min').eq('organization_id', organizationId).maybeSingle(),
            ]);
            return {
                fine_percent:           asaas?.fine_percent ?? defaults.fine_percent,
                interest_percent_month: asaas?.interest_percent_month ?? defaults.interest_percent_month,
                value_tol_abs:          rs?.value_tol_abs ?? defaults.value_tol_abs,
                value_tol_pct:          rs?.value_tol_pct ?? defaults.value_tol_pct,
                encargos_tol_pct:       rs?.encargos_tol_pct ?? defaults.encargos_tol_pct,
                date_window_days:       rs?.date_window_days ?? defaults.date_window_days,
                auto_threshold:         rs?.auto_threshold ?? defaults.auto_threshold,
                suggestion_min:         rs?.suggestion_min ?? defaults.suggestion_min,
            };
        } catch {
            return defaults;
        }
    },

    /**
     * Carrega o índice de contrapartes: aliases aprendidos + documentos (CNPJ/CPF/PIX)
     * de fornecedores, clientes e contas bancárias de fornecedor.
     */
    async loadPartyIndex(organizationId: string): Promise<PartyIndex> {
        const onlyDigits = (v?: string | null) => (v || '').replace(/\D/g, '');
        const orgOrNull = `organization_id.eq.${organizationId},organization_id.is.null`;
        const [aliasesRes, supRes, cliRes, sbaRes] = await Promise.all([
            supabase.from('reconciliation_aliases').select('alias_token, party_type, party_id, party_name, hit_count').eq('organization_id', organizationId).order('hit_count', { ascending: false }).limit(2000),
            supabase.from('suppliers').select('id, name, document').or(orgOrNull),
            supabase.from('clients').select('id, name, document').or(orgOrNull),
            supabase.from('supplier_bank_accounts').select('supplier_id, pix_key, pix_key_type, beneficiary_document').eq('organization_id', organizationId),
        ]);

        const docIndex: PartyIndex['docIndex'] = new Map();
        const supName = new Map<string, string>();
        (supRes.data || []).forEach(s => {
            supName.set(s.id, s.name);
            const d = onlyDigits(s.document);
            if (d.length >= 11) docIndex.set(d, { party_id: s.id, party_type: 'SUPPLIER', party_name: s.name });
        });
        (cliRes.data || []).forEach(c => {
            const d = onlyDigits(c.document);
            if (d.length >= 11) docIndex.set(d, { party_id: c.id, party_type: 'CLIENT', party_name: c.name });
        });
        (sbaRes.data || []).forEach(a => {
            const name = supName.get(a.supplier_id) ?? null;
            const docs = [a.beneficiary_document, (a.pix_key_type === 'cnpj' || a.pix_key_type === 'cpf') ? a.pix_key : null];
            docs.forEach(v => {
                const d = onlyDigits(v);
                if (d.length >= 11 && !docIndex.has(d)) docIndex.set(d, { party_id: a.supplier_id, party_type: 'SUPPLIER', party_name: name });
            });
        });

        const aliases = (aliasesRes.data || []).map(a => ({
            token: a.alias_token, party_id: a.party_id, party_type: a.party_type as 'SUPPLIER' | 'CLIENT', party_name: a.party_name, hit: a.hit_count,
        }));
        return { docIndex, aliases };
    },

    /** Reconhece a contraparte de um movimento bancário por alias aprendido ou CNPJ/CPF/PIX. */
    resolveBankParty(
        bTx: { description_raw?: string; description_normalized?: string; counterparty_name?: string },
        index: PartyIndex,
    ): ResolvedParty | null {
        const descNorm = this.normalizeText(bTx.counterparty_name || bTx.description_normalized || bTx.description_raw || '');
        // 1) Alias aprendido (já ordenado por hit_count desc)
        for (const a of index.aliases) {
            if (a.token && descNorm.includes(a.token)) {
                return { party_id: a.party_id, party_type: a.party_type, party_name: a.party_name, via: 'aprendido' };
            }
        }
        // 2) CNPJ/CPF/PIX presente no texto bruto
        const rawDigits = `${bTx.description_raw || ''} ${bTx.counterparty_name || ''}`.replace(/\D/g, '');
        if (rawDigits.length >= 11) {
            for (const [doc, party] of index.docIndex) {
                if (rawDigits.includes(doc)) return { ...party, via: 'CNPJ' };
            }
        }
        return null;
    },

    /** Extrai um token significativo da descrição do extrato para virar alias. */
    extractAliasToken(text: string): string {
        const NOISE = new Set(['PIX', 'TED', 'DOC', 'TEV', 'TRANSFERENCIA', 'TRANSF', 'RECEBIDO', 'ENVIADO', 'PAGAMENTO', 'PAGTO', 'COBRANCA', 'BOLETO', 'DEB', 'CRED', 'DEBITO', 'CREDITO', 'CARTAO', 'COMPRA', 'SAQUE', 'TARIFA', 'LIQUIDACAO', 'REF', 'NOME', 'LTDA', 'ME', 'EPP', 'SA', 'EIRELI', 'DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);
        const words = this.normalizeText(text).split(' ').filter(w => w && !/^\d+$/.test(w) && !NOISE.has(w));
        return words.slice(0, 4).join(' ').trim();
    },

    /** Aprende a associação extrato→contraparte ao confirmar um match (só com contraparte cadastrada). */
    async learnAliasFromMatch(bankTxId: string, internalTxId: string, organizationId: string) {
        try {
            const [{ data: bt }, { data: it }] = await Promise.all([
                supabase.from('bank_transactions').select('description_normalized, counterparty_name, description_raw').eq('id', bankTxId).maybeSingle(),
                supabase.from('internal_transactions').select('party_id, party_type, party_name, entity_name').eq('id', internalTxId).maybeSingle(),
            ]);
            if (!bt || !it || !it.party_id) return;
            const token = this.extractAliasToken(bt.counterparty_name || bt.description_normalized || bt.description_raw || '');
            if (!token || token.length < 3) return;
            const partyType: 'SUPPLIER' | 'CLIENT' = it.party_type === 'CLIENT' ? 'CLIENT' : 'SUPPLIER';

            const { data: existing } = await supabase.from('reconciliation_aliases')
                .select('id, hit_count')
                .eq('organization_id', organizationId).eq('alias_token', token).eq('party_id', it.party_id)
                .maybeSingle();
            if (existing) {
                await supabase.from('reconciliation_aliases').update({ hit_count: (existing.hit_count || 1) + 1, updated_at: new Date().toISOString() }).eq('id', existing.id);
            } else {
                await supabase.from('reconciliation_aliases').insert({
                    organization_id: organizationId, alias_token: token, party_type: partyType,
                    party_id: it.party_id, party_name: it.party_name || it.entity_name || null,
                });
            }
        } catch (e) {
            console.warn('[Alias] aprendizado falhou (ignorado):', e);
        }
    },

    /**
     * Calcula o valor esperado de um título pago em atraso (multa + juros pró-rata).
     * Retorna null se o pagamento não foi após o vencimento.
     */
    computeInterestExpectation(
        amount: number,
        dueDate: string,
        payDate: string,
        config: { fine_percent: number; interest_percent_month: number },
    ): { daysLate: number; multa: number; juros: number; expected: number } | null {
        const due = new Date(dueDate);
        const pay = new Date(payDate);
        if (isNaN(due.getTime()) || isNaN(pay.getTime())) return null;
        const daysLate = Math.floor((pay.getTime() - due.getTime()) / 86_400_000);
        if (daysLate <= 0) return null;
        const multa = amount * (config.fine_percent / 100);
        const juros = amount * (config.interest_percent_month / 100) * (daysLate / 30);
        return { daysLate, multa, juros, expected: Math.round((amount + multa + juros) * 100) / 100 };
    },

    /** Procura um nº de documento (NF) da transação interna dentro da descrição do extrato. */
    documentMatches(internalDesc: string, bankText: string): boolean {
        const tokens = (internalDesc || '').match(/\d{4,8}/g) || [];
        if (tokens.length === 0) return false;
        const bankDigits = (bankText || '').replace(/\D/g, '');
        if (!bankDigits) return false;
        return tokens.some(t => bankDigits.includes(t));
    },

    /**
     * Pontua um candidato interno contra um movimento bancário, com motivos explicáveis.
     * Pesos: valor exato +40 / encargos compatíveis +35 / valor próximo +20;
     *        mesma data +20 / próxima +15..8; fornecedor +30/+15; documento +40.
     */
    scoreCandidate(
        bTx: { amount: number; direction: string; transaction_date: string; description_normalized?: string; description_raw?: string; counterparty_name?: string },
        c: { amount: number; transaction_date: string; due_date?: string; description?: string; entity_name?: string; party_name?: string; party_id?: string },
        s: ReconciliationEngineSettings,
        resolved?: ResolvedParty | null,
    ): { score: number; reasons: string[] } {
        const reasons: string[] = [];
        let score = 0;
        const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
        const diff = Math.round((bTx.amount - c.amount) * 100) / 100;

        // ── Valor (com inteligência de juros/multa) ──
        if (Math.abs(diff) < 0.01) {
            score += 40; reasons.push('Valor exato');
        } else {
            const interest = this.computeInterestExpectation(c.amount, c.due_date || c.transaction_date, bTx.transaction_date, s);
            const interestOk = diff > 0 && interest
                && Math.abs(bTx.amount - interest.expected) <= Math.max(0.5, c.amount * (s.encargos_tol_pct / 100));
            if (interestOk && interest) {
                score += 35;
                reasons.push(`Diferença compatível com encargos: multa ${fmt(interest.multa)} + juros ${fmt(interest.juros)} (${interest.daysLate}d) → esperado ${fmt(interest.expected)}`);
            } else if (Math.abs(diff) <= Math.max(s.value_tol_abs, c.amount * (s.value_tol_pct / 100))) {
                score += 20; reasons.push(`Valor próximo (dif ${fmt(Math.abs(diff))})`);
            }
        }

        // ── Data ──
        const dDays = Math.abs(Math.round((new Date(bTx.transaction_date).getTime() - new Date(c.transaction_date).getTime()) / 86_400_000));
        if (c.transaction_date === bTx.transaction_date) { score += 20; reasons.push('Mesma data'); }
        else if (dDays <= 3) { score += 15; reasons.push(`Data próxima (${dDays}d)`); }
        else if (dDays <= s.date_window_days) { score += 8; reasons.push(`Data dentro de ${dDays}d`); }

        // ── Fornecedor reconhecido por CNPJ/PIX/alias (sinal forte) ──
        const intParty = c.entity_name || c.party_name || c.description || '';
        if (resolved && resolved.party_id && c.party_id && c.party_id === resolved.party_id) {
            score += 50; reasons.push(`Mesmo fornecedor (${resolved.via})`);
        } else if (resolved && resolved.party_name && this.calculateSimilarity(intParty, resolved.party_name) >= 0.7) {
            score += 25; reasons.push(`Fornecedor reconhecido (${resolved.via})`);
        } else {
            // ── Fornecedor por similaridade textual (fallback) ──
            const bankParty = bTx.counterparty_name || bTx.description_normalized || '';
            const sim = this.calculateSimilarity(bankParty, intParty);
            if (sim >= 0.8) { score += 30; reasons.push('Mesmo fornecedor (alta similaridade)'); }
            else if (sim >= 0.5) { score += 15; reasons.push('Fornecedor similar'); }
        }

        // ── Documento (NF) ──
        if (this.documentMatches(c.description || '', bTx.description_normalized || bTx.description_raw || '')) {
            score += 40; reasons.push('Documento encontrado no extrato');
        }

        return { score: Math.round(score), reasons };
    },

    /**
     * Motor de matching com score aditivo explicável (Fase 1 da Central Inteligente).
     * Considera valor, juros/multa, data, fornecedor e documento. Auto-concilia
     * apenas vencedores muito claros (≥100 e à frente do 2º); o resto vira sugestão
     * explicada (confidence = score, reason = motivos).
     */
    async runMatchingEngine(bankAccountId: string, organizationId: string) {
        const settings = await this.loadSettings(organizationId);
        const AUTO_THRESHOLD = settings.auto_threshold;
        const MIN_SUGGESTION = settings.suggestion_min;
        const DAY = 86_400_000;

        // 1) Carrega de uma vez: extrato + títulos pendentes + índice de contrapartes
        const [{ data: bankTxs }, { data: pending }, partyIndex] = await Promise.all([
            supabase
                .from('bank_transactions')
                .select('id, transaction_date, amount, direction, description_raw, description_normalized, counterparty_name')
                .eq('bank_account_id', bankAccountId)
                .in('status', ['NORMALIZED', 'RULE_APPLIED'])
                .limit(5000),
            supabase
                .from('internal_transactions')
                .select('id, transaction_date, due_date, amount, direction, description, entity_name, party_name, party_id')
                .eq('organization_id', organizationId)
                .eq('status', 'PENDING')
                .limit(8000),
            this.loadPartyIndex(organizationId),
        ]);

        if (!bankTxs || bankTxs.length === 0) return;
        const candidatesAll = pending || [];

        // 2) Casa em memória (sem ida ao banco por transação)
        const autoMatches: { bankId: string; internalId: string; score: number }[] = [];
        const suggestionRows: { bank_transaction_id: string; candidate_internal_transaction_id: string; confidence: number; reason: string }[] = [];
        const claimedInternal = new Set<string>();

        for (const bTx of bankTxs) {
            const bDate = new Date(bTx.transaction_date).getTime();
            const minT = bDate - 60 * DAY; // títulos vencidos pagos semanas depois
            const maxT = bDate + 5 * DAY;
            const amtMin = bTx.amount * 0.90;
            const amtMax = bTx.amount * 1.01;
            const resolved = this.resolveBankParty(bTx, partyIndex);

            const ranked = candidatesAll
                .filter(c => {
                    if (c.direction !== bTx.direction) return false;
                    if (c.amount < amtMin || c.amount > amtMax) return false;
                    const t = new Date(c.transaction_date).getTime();
                    return t >= minT && t <= maxT;
                })
                .map(c => ({ c, ...this.scoreCandidate(bTx, c, settings, resolved) }))
                .filter(r => r.score >= MIN_SUGGESTION)
                .sort((a, b) => b.score - a.score);

            if (ranked.length === 0) continue;

            const top = ranked[0];
            const second = ranked[1];
            const clearWinner = !second || (top.score - second.score) >= 20;

            if (top.score >= AUTO_THRESHOLD && clearWinner && !claimedInternal.has(top.c.id)) {
                autoMatches.push({ bankId: bTx.id, internalId: top.c.id, score: Math.min(top.score, 100) });
                claimedInternal.add(top.c.id);
            } else {
                for (const r of ranked.slice(0, 5)) {
                    suggestionRows.push({
                        bank_transaction_id: bTx.id,
                        candidate_internal_transaction_id: r.c.id,
                        confidence: Math.min(Math.round(r.score), 100),
                        reason: r.reasons.join(' · '),
                    });
                }
            }
        }

        // 3) Grava em lote: limpa sugestões antigas e insere as novas (poucas requisições)
        const allBankIds = bankTxs.map(b => b.id);
        for (let i = 0; i < allBankIds.length; i += 100) {
            await supabase.from('reconciliation_suggestions').delete().in('bank_transaction_id', allBankIds.slice(i, i + 100));
        }
        for (let i = 0; i < suggestionRows.length; i += 200) {
            await supabase.from('reconciliation_suggestions').insert(suggestionRows.slice(i, i + 200));
        }

        // 4) Aplica auto-conciliações (poucas; isoladas p/ não abortar o lote em período fechado)
        for (const m of autoMatches) {
            try {
                await this.createMatch(m.bankId, m.internalId, 'HEURISTIC', m.score);
            } catch (e) {
                console.warn('[Motor] auto-match ignorado:', e);
            }
        }
    },

    calculateSimilarity(str1: string, str2: string): number {
        const s1 = str1.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const s2 = str2.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (s1 === s2) return 1.0;
        if (s1.length < 2 || s2.length < 2) return 0;
        
        // Dice's Coefficient em n-grams (bigrams) - Geralmente melhor que Jaccard para strings curtas
        const getBigrams = (s: string) => {
            const bigrams = [];
            for (let i = 0; i < s.length - 1; i++) bigrams.push(s.substring(i, i + 2));
            return bigrams;
        };

        const b1 = getBigrams(s1);
        const b2 = getBigrams(s2);
        
        let intersection = 0;
        const b2Copy = [...b2];
        
        for (const item1 of b1) {
            const index2 = b2Copy.indexOf(item1);
            if (index2 !== -1) {
                intersection++;
                b2Copy.splice(index2, 1);
            }
        }
        
        return (2.0 * intersection) / (b1.length + b2.length);
    },

    async createMatch(bankTxId: string, internalTxId: string, type: MatchType, confidence: number) {
        const { error: matchError } = await supabase
            .from('reconciliation_matches')
            .insert({
                bank_transaction_id: bankTxId,
                internal_transaction_id: internalTxId,
                match_type: type,
                confidence_score: confidence
            });

        if (!matchError) {
            await supabase.from('bank_transactions').update({ status: 'MATCHED' }).eq('id', bankTxId);
            await supabase.from('internal_transactions').update({ status: 'CONCILIATED' }).eq('id', internalTxId);
        }
    },

    /**
     * Grava (ou atualiza) uma sugestão de conciliação com score e motivos explicáveis.
     */
    async upsertSuggestion(bankTxId: string, candidateId: string, score: number, reason: string) {
        const { data: existing } = await supabase
            .from('reconciliation_suggestions')
            .select('id')
            .eq('bank_transaction_id', bankTxId)
            .eq('candidate_internal_transaction_id', candidateId)
            .maybeSingle();

        const payload = {
            confidence: Math.min(Math.round(score), 100),
            reason: reason || 'Sugestão de conciliação.',
        };

        if (existing) {
            await supabase.from('reconciliation_suggestions').update(payload).eq('id', existing.id);
        } else {
            await supabase.from('reconciliation_suggestions').insert({
                bank_transaction_id: bankTxId,
                candidate_internal_transaction_id: candidateId,
                ...payload,
            });
        }
    },

    /**
     * Confirma uma transação que foi automatizada por regras ou heurística.
     * Se não houver internalTxId, ela é marcada como CONFIRMED (comum para tarifas/impostos).
     */
    async confirmTransaction(bankTxId: string, internalTxId?: string, organizationId?: string) {
        if (internalTxId) {
            await this.createMatch(bankTxId, internalTxId, 'MANUAL', 100);
            // Aprende a associação extrato→contraparte para reconhecer nos próximos matches
            if (organizationId) await this.learnAliasFromMatch(bankTxId, internalTxId, organizationId);
            return;
        }

        // Se não houver internalTxId, apenas confirmamos a categorização externa
        const { error } = await supabase
            .from('bank_transactions')
            .update({ status: 'CONFIRMED' })
            .eq('id', bankTxId);

        if (error) throw error;

        // Auditoria
        if (organizationId) {
            await supabase.from('reconciliation_audit_log').insert({
                organization_id: organizationId,
                event_type: 'MATCH',
                target_id: bankTxId,
                payload: { action: 'AUTO_CONFIRM_WITHOUT_INTERNAL' }
            });
        }
    },

    parseCNAB240(text: string): RawTransaction[] {
        const transactions: RawTransaction[] = [];
        const lines = text.split('\n');
        
        lines.forEach(line => {
            // Segmento 'E' - Detalhes do extrato (Padrão FEBRABAN)
            if (line.substring(7, 8) === '3' && line.substring(13, 14) === 'E') {
                const dateRaw = line.substring(142, 150); 
                const amountRaw = line.substring(150, 168); 
                const desc = line.substring(113, 142).trim(); 
                const type = line.substring(168, 169); // D=Débito, C=Crédito
                const memo = line.substring(175, 230).trim(); // Informação complementar

                const year = dateRaw.substring(4, 8);
                const month = dateRaw.substring(2, 4);
                const day = dateRaw.substring(0, 2);
                
                const amount = parseInt(amountRaw) / 100;

                transactions.push({
                    date: `${year}-${month}-${day}`,
                    amount: type === 'D' ? -amount : amount,
                    description: desc || memo,
                    memo: memo,
                    id: line.substring(183, 203).trim() || `240-${Math.random().toString(36).substring(7)}`
                });
            }
        });
        return transactions;
    },

    parseCNAB400(text: string): RawTransaction[] {
        const transactions: RawTransaction[] = [];
        const lines = text.split('\n');
        
        lines.forEach(line => {
            // Registro de Detalhe (Tipo 1)
            if (line.substring(0, 1) === '1') { 
                const dateRaw = line.substring(110, 116); // DDMMYY
                const amountRaw = line.substring(152, 165); 
                const desc = line.substring(116, 152).trim();
                const type = line.substring(107, 108); // Algumas variantes usam campos específicos para D/C

                const day = dateRaw.substring(0, 2);
                const month = dateRaw.substring(2, 4);
                const year = `20${dateRaw.substring(4, 6)}`;

                const amount = parseInt(amountRaw) / 100;

                transactions.push({
                    date: `${year}-${month}-${day}`,
                    amount: -amount, // No CNAB 400, geralmente focamos em retorno de cobrança (líquido/taxas)
                    description: desc,
                    id: line.substring(37, 62).trim() || `400-${Math.random().toString(36).substring(7)}`
                });
            }
        });
        return transactions;
    },

    parseOFX(text: string): RawTransaction[] {
        const transactions: RawTransaction[] = [];
        const stmTrnMatches = text.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/g);
        
        if (stmTrnMatches) {
            stmTrnMatches.forEach(match => {
                const dtPosted = match.match(/<DTPOSTED>(.*)/)?.[1]?.trim();
                const trnAmt = match.match(/<TRNAMT>(.*)/)?.[1]?.trim();
                const fitId = match.match(/<FITID>(.*)/)?.[1]?.trim();
                let memo = match.match(/<MEMO>(.*)/)?.[1]?.trim() || '';
                
                const name = match.match(/<NAME>(.*)/)?.[1]?.trim();
                const checkNum = match.match(/<CHECKNUM>(.*)/)?.[1]?.trim();
                const refNum = match.match(/<REFNUM>(.*)/)?.[1]?.trim();

                const extras = [];
                if (name) extras.push(`Nome: ${name}`);
                if (checkNum) extras.push(`Doc: ${checkNum}`);
                if (refNum) extras.push(`Ref: ${refNum}`);

                if (extras.length > 0) {
                    memo = memo ? `${memo} (${extras.join(' | ')})` : extras.join(' | ');
                }

                if (dtPosted && trnAmt) {
                    const year = dtPosted.substring(0, 4);
                    const month = dtPosted.substring(4, 6);
                    const day = dtPosted.substring(6, 8);

                    transactions.push({
                        date: `${year}-${month}-${day}`,
                        amount: parseFloat(trnAmt.replace(',', '.')),
                        fitid: fitId,
                        memo: memo
                    });
                }
            });
        }
        return transactions;
    },

    /**
     * Converte um valor monetário (number ou string BR "1.234,56") para number.
     */
    parseAmountBR(raw: unknown): number {
        if (typeof raw === 'number') return raw;
        let s = String(raw ?? '').trim();
        if (!s) return NaN;
        s = s.replace(/r\$/i, '').replace(/\s/g, '');
        const neg = /^-/.test(s) || /\(.*\)/.test(s); // -123 ou (123)
        s = s.replace(/[()]/g, '').replace(/^-/, '');
        if (s.includes('.') && s.includes(',')) {
            // '.' = milhar, ',' = decimal
            s = s.replace(/\./g, '').replace(',', '.');
        } else if (s.includes(',')) {
            s = s.replace(',', '.');
        }
        const n = parseFloat(s);
        if (isNaN(n)) return NaN;
        return neg ? -n : n;
    },

    /**
     * Normaliza uma data (Date, serial Excel ou string dd/mm/aaaa | aaaa-mm-dd) para 'YYYY-MM-DD'.
     */
    parseDateCell(raw: unknown): string | null {
        if (raw instanceof Date && !isNaN(raw.getTime())) {
            return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-${String(raw.getDate()).padStart(2, '0')}`;
        }
        if (typeof raw === 'number' && raw > 0) {
            // Serial Excel (dias desde 1899-12-30)
            const d = XLSX.SSF?.parse_date_code?.(raw);
            if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
        }
        const s = String(raw ?? '').trim();
        if (!s) return null;
        let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
        m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
        if (m) {
            const year = m[3].length === 2 ? `20${m[3]}` : m[3];
            return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        }
        return null;
    },

    /**
     * Parser de extrato em XLSX/XLS. Detecta a linha de cabeçalho e identifica
     * as colunas de data, valor (ou crédito/débito separados) e descrição pelo nome.
     */
    parseXLSX(buffer: ArrayBuffer): RawTransaction[] {
        const transactions: RawTransaction[] = [];
        const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) return transactions;

        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
        if (rows.length === 0) return transactions;

        const norm = (v: unknown) => String(v ?? '')
            .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

        const reDate = /^(data|date|dt)\b|lancamento|movimento/;
        const reAmount = /valor|amount|value|montante/;
        const reCredit = /credito|entrada|^c$|deposito/;
        const reDebit = /debito|saida|^d$|saque/;
        const reDesc = /hist|descri|lancamento|memo|detalhe|complemento/;
        const reType = /tipo|natureza|d\/c|c\/d|debito\/credito/;

        // Localiza o cabeçalho nas primeiras 20 linhas
        let headerIdx = -1;
        let cols = { date: -1, amount: -1, credit: -1, debit: -1, desc: -1, type: -1 };
        for (let i = 0; i < Math.min(rows.length, 20); i++) {
            const cells = rows[i].map(norm);
            const find = (re: RegExp) => cells.findIndex(c => re.test(c));
            const dateC = find(reDate);
            const amountC = cells.findIndex(c => reAmount.test(c));
            const creditC = cells.findIndex(c => reCredit.test(c));
            const debitC = cells.findIndex(c => reDebit.test(c));
            if (dateC >= 0 && (amountC >= 0 || (creditC >= 0 && debitC >= 0))) {
                headerIdx = i;
                cols = {
                    date: dateC,
                    amount: amountC,
                    credit: creditC,
                    debit: debitC,
                    desc: find(reDesc),
                    type: find(reType),
                };
                break;
            }
        }

        if (headerIdx === -1) {
            // Sem cabeçalho reconhecido: fallback posicional (data, valor, descrição)
            cols = { date: 0, amount: 1, credit: -1, debit: -1, desc: 2, type: -1 };
            headerIdx = 0;
        }

        for (let i = headerIdx + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            const date = this.parseDateCell(row[cols.date]);
            if (!date) continue;

            let amount: number;
            if (cols.amount >= 0) {
                amount = this.parseAmountBR(row[cols.amount]);
                if (cols.type >= 0) {
                    const t = norm(row[cols.type]);
                    if (reDebit.test(t)) amount = -Math.abs(amount);
                    else if (reCredit.test(t)) amount = Math.abs(amount);
                }
            } else {
                const credit = this.parseAmountBR(row[cols.credit]) || 0;
                const debit = this.parseAmountBR(row[cols.debit]) || 0;
                amount = credit - debit;
            }
            if (isNaN(amount) || amount === 0) continue;

            const description = cols.desc >= 0 ? String(row[cols.desc] ?? '').trim() : '';
            transactions.push({
                date,
                amount,
                description: description || 'Sem descrição',
                id: `xlsx-${Math.random().toString(36).substring(7)}`,
            });
        }

        return transactions;
    },

    parseCSV(text: string): RawTransaction[] {
        const lines = text.split('\n').filter(l => l.trim());
        const transactions: RawTransaction[] = [];

        // Parser simples de CSV com suporte a campos entre aspas ("descrição, com vírgula")
        const parseCSVLine = (line: string): string[] => {
            const cols: string[] = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') { inQuotes = !inQuotes; }
                else if (ch === ',' && !inQuotes) { cols.push(current.trim()); current = ''; }
                else { current += ch; }
            }
            cols.push(current.trim());
            return cols;
        };

        lines.slice(1).forEach(line => {
            const cols = parseCSVLine(line);
            const rawAmount = cols[1]?.trim().replace(',', '.');
            const amount = parseFloat(rawAmount);
            if (cols.length >= 3 && !isNaN(amount)) {
                transactions.push({
                    date: cols[0].trim(),
                    amount,
                    description: cols[2].trim(),
                    id: `csv-${Math.random().toString(36).substring(7)}`
                });
            }
        });

        return transactions;
    },

    generateFingerprint(tx: RawTransaction): string {
        const raw = `${tx.date}-${tx.amount}-${tx.memo || tx.description}`;
        // btoa() lança RangeError em chars > 0xFF (ã, ç, etc. do PT-BR).
        // encodeURIComponent → unescape converte para representação Latin-1 segura.
        try {
            return btoa(unescape(encodeURIComponent(raw))).substring(0, 32);
        } catch {
            return btoa(raw.replace(/[^\x00-\xff]/g, '?')).substring(0, 32);
        }
    }
};
