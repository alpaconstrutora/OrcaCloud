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

interface InternalTxCandidate {
    id: string;
    description?: string;
    transaction_date: string;
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
                const rawTransactions: RawTransaction[] = [];

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
            .select('*')
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
            .select('*')
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
            .select('*')
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

                    const { error: updateError } = await supabase
                        .from('bank_transactions')
                        .update({
                            category: rule.actions.category,
                            counterparty_name: rule.actions.counterparty || tx.counterparty_name,
                            status: 'RULE_APPLIED'
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
     * Executa o motor de matching (Layer 1 e Layer 2).
     */
    async runMatchingEngine(bankAccountId: string, organizationId: string) {
        const { data: bankTxs } = await supabase
            .from('bank_transactions')
            .select('*')
            .eq('bank_account_id', bankAccountId)
            .in('status', ['NORMALIZED', 'RULE_APPLIED']);

        if (!bankTxs) return;

        for (const bTx of bankTxs) {
            const date = new Date(bTx.transaction_date);
            const minDate = new Date(date);
            minDate.setDate(date.getDate() - 3); // Janela padrão de 3 dias
            const maxDate = new Date(date);
            maxDate.setDate(date.getDate() + 3);

            // Layer 1: Valor Exato e Direção
            const { data: candidates } = await supabase
                .from('internal_transactions')
                .select('*')
                .eq('organization_id', organizationId)
                .eq('amount', bTx.amount)
                .eq('direction', bTx.direction)
                .eq('status', 'PENDING')
                .gte('transaction_date', minDate.toISOString().split('T')[0])
                .lte('transaction_date', maxDate.toISOString().split('T')[0]);

            if (candidates && candidates.length > 0) {
                // Nova Lógica: Layer 1.5 - Match Exato de Data
                const exactDateCandidates = candidates.filter(c => c.transaction_date === bTx.transaction_date);
                
                if (exactDateCandidates.length === 1) {
                    // Match exato de data e valor único -> Confiança Máxima (95%)
                    await this.createSuggestion(bTx.id, [exactDateCandidates[0]], 95);
                    continue;
                } else if (exactDateCandidates.length > 1) {
                    // Múltiplos no mesmo dia com mesmo valor, sugere todos com alta confiança
                    await this.createSuggestion(bTx.id, exactDateCandidates, 90);
                    continue; 
                }

                // Se não achou na data exata, volta pro Layer 2: Similaridade de Texto
                if (candidates.length === 1) {
                    const similarity = this.calculateSimilarity(bTx.description_normalized || '', candidates[0].description || '');
                    if (similarity > 0.85) {
                        await this.createMatch(bTx.id, candidates[0].id, 'RULE', similarity * 100);
                    } else {
                        await this.createSuggestion(bTx.id, [candidates[0]], similarity * 100);
                    }
                } else {
                    // Ranking por similaridade
                    const ranked = candidates.map(c => ({
                        ...c,
                        score: this.calculateSimilarity(bTx.description_normalized || '', c.description || '')
                    })).sort((a, b) => b.score - a.score);

                    // Se houver um vencedor claro
                    if (ranked[0].score > 0.9 && (ranked.length === 1 || ranked[0].score > ranked[1].score + 0.2)) {
                        await this.createMatch(bTx.id, ranked[0].id, 'HEURISTIC', ranked[0].score * 100);
                    } else {
                        await this.createSuggestion(bTx.id, ranked, ranked[0].score * 100);
                    }
                }
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

    async createSuggestion(bankTxId: string, candidates: InternalTxCandidate[], score: number) {
        for (const candidate of candidates) {
            // Verifica se já existe a sugestão para evitar duplicidade
            const { data: existing } = await supabase
                .from('reconciliation_suggestions')
                .select('id')
                .eq('bank_transaction_id', bankTxId)
                .eq('candidate_internal_transaction_id', candidate.id)
                .single();
            
            if (!existing) {
                await supabase
                    .from('reconciliation_suggestions')
                    .insert({
                        bank_transaction_id: bankTxId,
                        candidate_internal_transaction_id: candidate.id,
                        confidence: score || 80,
                        reason: score > 0.5 ? 'Similaridade de descrição detectada.' : 'Valor idêntico em data próxima.'
                    });
            }
        }
    },

    /**
     * Confirma uma transação que foi automatizada por regras ou heurística.
     * Se não houver internalTxId, ela é marcada como CONFIRMED (comum para tarifas/impostos).
     */
    async confirmTransaction(bankTxId: string, internalTxId?: string, organizationId?: string) {
        if (internalTxId) {
            return this.createMatch(bankTxId, internalTxId, 'MANUAL', 100);
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

    parseCSV(text: string): RawTransaction[] {
        const lines = text.split('\n').filter(l => l.trim());
        const transactions: RawTransaction[] = [];

        lines.slice(1).forEach(line => {
            const cols = line.split(',');
            if (cols.length >= 3) {
                transactions.push({
                    date: cols[0].trim(),
                    amount: parseFloat(cols[1].trim().replace(',', '.')),
                    description: cols[2].trim(),
                    id: `csv-${Math.random().toString(36).substring(7)}`
                });
            }
        });

        return transactions;
    },

    generateFingerprint(tx: RawTransaction): string {
        return btoa(`${tx.date}-${tx.amount}-${tx.memo || tx.description}`).substring(0, 32);
    }
};
