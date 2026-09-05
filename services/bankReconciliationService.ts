import { supabase } from '../lib/supabase';
import { fetchAllPages, type RangeableQuery } from '../lib/supabasePaginate';
import {
    parseStatementFile,
    accountMatches,
    type RawTransaction,
    type StatementHeader,
    type StatementFormat,
} from './bankStatementParsers';
import {
    BankTransaction,
    BankTransactionStatus,
    MatchType
} from '../types';

export interface ImportResult {
    inserted: number;
    duplicates: number;
    /** Linhas de saldo/total reconhecidas e descartadas de propósito. */
    skipped: number;
    /** Arquivos que não entraram, com o motivo (formato, conta errada, erro de leitura). */
    rejected: { file: string; reason: string }[];
    /** Cabeçalho de cada arquivo lido (conta, saldo de fechamento, período) — base do item 2.4. */
    headers: { file: string; format: StatementFormat; header: StatementHeader }[];
    data: unknown[];
}

interface NormalizedBankTx {
    organization_id: string;
    bank_account_id: string;
    /** FITID/identificador do banco. NULL quando o arquivo não traz (CSV/XLSX): antes
     *  era um valor aleatório, o que tornava o UNIQUE(bank_account_id, external_id) inútil. */
    external_id: string | null;
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
    async ingestMultipleFiles(files: File[], bankAccountId: string, organizationId: string): Promise<ImportResult> {
        const allNormalizedTxs: NormalizedBankTx[] = [];
        const rejected: ImportResult['rejected'] = [];
        const headers: ImportResult['headers'] = [];
        let skipped = 0;

        // Número da conta cadastrado, para recusar um OFX de OUTRA conta (BANKACCTFROM/ACCTID).
        const { data: acct } = await supabase
            .from('payment_accounts')
            .select('name, account_number')
            .eq('id', bankAccountId)
            .maybeSingle();

        for (const file of files) {
            try {
                const parsed = await parseStatementFile(file);
                if (accountMatches(parsed.header.acctId, acct?.account_number) === false) {
                    rejected.push({
                        file: file.name,
                        reason: `o arquivo é da conta ${parsed.header.acctId}, mas a conta selecionada é "${acct?.name ?? ''}" (${acct?.account_number ?? 'sem número'}). Nada foi importado deste arquivo.`,
                    });
                    continue;
                }
                headers.push({ file: file.name, format: parsed.format, header: parsed.header });
                skipped += parsed.skipped;
                allNormalizedTxs.push(...await this.toNormalizedRows(parsed.transactions, bankAccountId, organizationId));
            } catch (err) {
                // Antes isto era um console.error engolido: o arquivo "sumia" sem aviso.
                rejected.push({ file: file.name, reason: err instanceof Error ? err.message : String(err) });
            }
        }

        if (files.length > 0 && rejected.length === files.length) {
            throw new Error(rejected.map(r => `${r.file}: ${r.reason}`).join('\n'));
        }

        if (allNormalizedTxs.length === 0) return { inserted: 0, duplicates: 0, skipped, rejected, headers, data: [] };

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

        if (newTxs.length === 0) return { inserted: 0, duplicates: duplicateCount, skipped, rejected, headers, data: [] };

        // INSERT puro: com external_id NULL o onConflict nunca disparava, e a dedupe real
        // já aconteceu acima pelo fingerprint (há índice único em (bank_account_id, fingerprint)).
        const { data, error } = await supabase
            .from('bank_transactions')
            .insert(newTxs)
            .select();

        if (error) throw error;

        // Após importar o lote completo, normaliza e aplica regras uma única vez
        await this.normalizeTransactions(bankAccountId);
        await this.applyCustomRules(bankAccountId, organizationId);

        return { inserted: data?.length ?? newTxs.length, duplicates: duplicateCount, skipped, rejected, headers, data: data ?? [] };
    },

    /**
     * Converte as linhas brutas de UM arquivo em linhas prontas para gravar.
     *
     * Ordinal por ARQUIVO: duas linhas idênticas (data, valor, direção, descrição) no
     * mesmo extrato são dois movimentos reais e recebem ordinal 1 e 2 — ambas
     * sobrevivem à dedupe. Reimportar o mesmo arquivo reencontra os mesmos ordinais,
     * logo os mesmos fingerprints, logo nenhuma duplicata.
     */
    async toNormalizedRows(rawTransactions: RawTransaction[], bankAccountId: string, organizationId: string): Promise<NormalizedBankTx[]> {
        const ordinalPorChave = new Map<string, number>();
        const rows: NormalizedBankTx[] = [];
        for (const tx of rawTransactions) {
            const direction: 'DEBIT' | 'CREDIT' = tx.amount < 0 ? 'DEBIT' : 'CREDIT';
            const amount = Math.abs(tx.amount);
            const description = (tx.memo || tx.description || 'Sem descrição').trim();
            const chave = `${tx.date}|${amount.toFixed(2)}|${direction}|${description}`;
            const ordinal = (ordinalPorChave.get(chave) ?? 0) + 1;
            ordinalPorChave.set(chave, ordinal);
            rows.push({
                organization_id: organizationId,
                bank_account_id: bankAccountId,
                external_id: tx.fitid || tx.id || null,
                transaction_date: tx.date,
                amount,
                direction,
                description_raw: description,
                status: 'IMPORTED' as BankTransactionStatus,
                fingerprint: await this.generateFingerprint(this.fingerprintCanonical({
                    bankAccountId, date: tx.date, amount, direction, description, ordinal,
                })),
            });
        }
        return rows;
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

        if (!txs || txs.length === 0) return 0;

        for (const tx of txs) {
            for (const rule of rules) {
                const match = this.evaluateRule(tx, rule.conditions);
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

        return appliedCount;
    },

    evaluateRule(tx: BankTransaction, conditions: RuleCondition | RuleCondition[]): boolean {
        if (Array.isArray(conditions)) {
            return conditions.some(c => this.evaluateRuleSingle(tx, c));
        }
        return this.evaluateRuleSingle(tx, conditions);
    },

    evaluateRuleSingle(tx: BankTransaction, cond: RuleCondition): boolean {
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

        // 1) Carrega TUDO, paginando: o PostgREST corta em 1000 linhas por requisição e
        //    `.limit(5000)` aqui fazia o motor pontuar ~17% do extrato de uma conta com
        //    5.797 pendentes (subconjunto arbitrário, porque não havia ordenação).
        // (campos opcionais tipados sem `null` para casar com scoreCandidate/resolveBankParty;
        //  em runtime o PostgREST devolve null e os `||` lá dentro já tratam)
        type BankRow = { id: string; transaction_date: string; amount: number; direction: string; description_raw: string; description_normalized?: string; counterparty_name?: string };
        type PendingRow = { id: string; transaction_date: string; due_date?: string; amount: number; direction: string; description?: string; entity_name?: string; party_name?: string; party_id?: string };

        const [{ data: bankTxs, error: bankErr }, partyIndex] = await Promise.all([
            fetchAllPages<BankRow>(() => supabase
                .from('bank_transactions')
                .select('id, transaction_date, amount, direction, description_raw, description_normalized, counterparty_name')
                .eq('bank_account_id', bankAccountId)
                .in('status', ['NORMALIZED', 'RULE_APPLIED'])
                .order('transaction_date', { ascending: true })
                .order('id', { ascending: true }) as unknown as RangeableQuery<BankRow>),
            this.loadPartyIndex(organizationId),
        ]);
        if (bankErr) throw bankErr;
        if (!bankTxs || bankTxs.length === 0) return;

        // Só faz sentido buscar títulos na janela que o extrato carregado alcança
        // (60 dias antes do primeiro movimento, 5 dias depois do último): parcelas de
        // 2027–2029 nunca casam com extrato de hoje e só engordam a carga.
        const shiftDate = (iso: string, days: number) =>
            new Date(new Date(`${iso}T12:00:00`).getTime() + days * DAY).toISOString().slice(0, 10);
        const bankDates = bankTxs.map(b => b.transaction_date).sort();
        const windowStart = shiftDate(bankDates[0], -60);
        const windowEnd = shiftDate(bankDates[bankDates.length - 1], 5);

        const { data: pending, error: pendingErr } = await fetchAllPages<PendingRow>(() => supabase
            .from('internal_transactions')
            .select('id, transaction_date, due_date, amount, direction, description, entity_name, party_name, party_id')
            .eq('organization_id', organizationId)
            .eq('status', 'PENDING')
            .gte('transaction_date', windowStart)
            .lte('transaction_date', windowEnd)
            .order('transaction_date', { ascending: true })
            .order('id', { ascending: true }) as unknown as RangeableQuery<PendingRow>);
        if (pendingErr) throw pendingErr;
        const candidatesAll = pending || [];

        // 2) Casa em memória (sem ida ao banco por transação)
        const autoMatches: { bankId: string; internalId: string; score: number }[] = [];
        const suggestionRows: { bank_transaction_id: string; candidate_internal_transaction_id: string; confidence: number; reason: string }[] = [];
        const claimedInternal = new Set<string>();
        const partyUpdates = new Map<string, string[]>(); // nome reconhecido → ids do extrato

        for (const bTx of bankTxs) {
            const bDate = new Date(bTx.transaction_date).getTime();
            const minT = bDate - 60 * DAY; // títulos vencidos pagos semanas depois
            const maxT = bDate + 5 * DAY;
            const amtMin = bTx.amount * 0.90;
            const amtMax = bTx.amount * 1.01;
            const resolved = this.resolveBankParty(bTx, partyIndex);

            // Persiste a contraparte reconhecida (alias/CNPJ) quando o extrato ainda não a tem
            if (resolved?.party_name && !bTx.counterparty_name) {
                const arr = partyUpdates.get(resolved.party_name) ?? [];
                arr.push(bTx.id);
                partyUpdates.set(resolved.party_name, arr);
            }

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

        // 3.5) Carimba a contraparte reconhecida no extrato (mudança de reclassificação,
        // liberada mesmo em período fechado pela trigger de hard-lock)
        for (const [name, ids] of partyUpdates) {
            for (let i = 0; i < ids.length; i += 100) {
                try {
                    await supabase.from('bank_transactions').update({ counterparty_name: name }).in('id', ids.slice(i, i + 100));
                } catch (e) {
                    console.warn('[Motor] carimbo de contraparte ignorado:', e);
                }
            }
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

    /**
     * Concilia movimento × título. Uma RPC, uma transação (`fn_reconcile_match`,
     * migration aplicar_20270919000014): vínculo com `created_by`, extrato MATCHED,
     * título CONCILIATED com `payment_date` = DATA DO EXTRATO (antes era "hoje"),
     * boleto/fatura pagos, ajuste opcional do resíduo e auditoria. Falhou no meio?
     * Nada fica escrito — antes eram 5 escritas soltas e o banco tinha órfãos.
     */
    async createMatch(
        bankTxId: string,
        internalTxId: string,
        type: MatchType,
        confidence: number,
        adjustmentCategory?: string | null,
    ): Promise<{ match_id: string; payment_date: string; adjustment_id: string | null }> {
        const { data, error } = await supabase.rpc('fn_reconcile_match', {
            p_bank_id: bankTxId,
            p_internal_id: internalTxId,
            p_match_type: type,
            p_confidence: confidence,
            p_adjustment_category: adjustmentCategory ?? null,
        });
        if (error) throw error;
        return data as { match_id: string; payment_date: string; adjustment_id: string | null };
    },

    /** Desfaz um vínculo (`fn_reconcile_unmatch`): restaura os dois lados só se não restar outro vínculo. */
    async unmatch(matchId: string): Promise<void> {
        const { error } = await supabase.rpc('fn_reconcile_unmatch', { p_match_id: matchId });
        if (error) throw error;
    },

    /**
     * Marca movimentos como IGNORED (`fn_reconcile_ignore`): "não é dinheiro que se
     * moveu" — duplicata, linha de saldo. Substitui a exclusão do extrato: a linha
     * continua visível no Extrato, com o motivo na auditoria, e sai do saldo e das
     * pendências. Recusa movimentos já conciliados (desfazer antes).
     */
    async ignoreBankTransactions(bankTxIds: string[], reason?: string): Promise<number> {
        if (bankTxIds.length === 0) return 0;
        const { data, error } = await supabase.rpc('fn_reconcile_ignore', { p_bank_ids: bankTxIds, p_reason: reason ?? null });
        if (error) throw error;
        return (data as number) ?? 0;
    },

    /** Volta movimentos IGNORED para pendente (`fn_reconcile_unignore`). */
    async unignoreBankTransactions(bankTxIds: string[]): Promise<number> {
        if (bankTxIds.length === 0) return 0;
        const { data, error } = await supabase.rpc('fn_reconcile_unignore', { p_bank_ids: bankTxIds });
        if (error) throw error;
        return (data as number) ?? 0;
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
    async confirmTransaction(bankTxId: string, internalTxId?: string, organizationId?: string, note?: string) {
        if (internalTxId) {
            await this.createMatch(bankTxId, internalTxId, 'MANUAL', 100);
            // Aprende a associação extrato→contraparte para reconhecer nos próximos matches
            if (organizationId) await this.learnAliasFromMatch(bankTxId, internalTxId, organizationId);
            return;
        }

        // Sem título: confirma a categorização externa (tarifa, imposto, repasse) — RPC com auditoria.
        const { error } = await supabase.rpc('fn_reconcile_confirm', { p_bank_id: bankTxId, p_note: note ?? null });
        if (error) throw error;
    },

    /**
     * Cadeia canônica do fingerprint. Tem de ser IDÊNTICA à do backfill em SQL
     * (`aplicar_20270919000013_bank_tx_fingerprint_v2.sql`):
     *
     *   bank_account_id | transaction_date | amount (2 casas) | direction | description (trim) | ordinal
     *
     * `ordinal` = posição (1..n) entre linhas idênticas no mesmo arquivo. Antes o
     * fingerprint era `btoa(...).substring(0, 32)` — 24 bytes de TEXTO (data, valor e
     * as primeiras letras da descrição), não um hash: dois PIX de R$ 16 no mesmo dia,
     * "PAGAMENTO PIX ... REGINALDO" e "PAGAMENTO PIX ... EMPORIUM", colidiam e o
     * segundo era descartado como duplicata. 45 colisões reais em produção (09/2026).
     */
    fingerprintCanonical(p: {
        bankAccountId: string;
        date: string;
        amount: number;
        direction: 'DEBIT' | 'CREDIT';
        description: string;
        ordinal: number;
    }): string {
        return `${p.bankAccountId}|${p.date}|${p.amount.toFixed(2)}|${p.direction}|${p.description.trim()}|${p.ordinal}`;
    },

    /** SHA-256 em hex (64 chars) — o mesmo `encode(sha256(convert_to(x,'UTF8')),'hex')` do Postgres. */
    async generateFingerprint(canonical: string): Promise<string> {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
};
