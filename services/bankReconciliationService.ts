import { supabase } from '../lib/supabase';
// As decisões (o que casa com o quê) moram num módulo SEM dependências, para que o
// servidor possa rodar exatamente as mesmas regras — item 3.3 do plano. O serviço
// cuida do banco; `utils/reconciliationRules` cuida do julgamento.
import * as regras from '../utils/reconciliationRules';
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


/** Resumo do que o motor fez numa rodada — a Central mostra isso ao reprocessar. */
export interface MatchingRunResult {
    /** Conciliações automáticas efetivamente gravadas. */
    autoApplied: number;
    /** Sugestões (1:1) gravadas para revisão. */
    suggestions: number;
    /** Quantas vieram da regra "valor exato, ±3 dias, candidato único dos dois lados". */
    exactUnique: number;
    /** Transferências entre contas próprias pareadas nesta rodada. */
    transfersPaired: number;
    /** Volume varrido — o que denuncia teto silencioso de paginação. */
    bankRowsScanned?: number;
    titleRowsScanned?: number;
}

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

/**
 * Condição sobre um campo que NÃO é texto: valor, direção e conta.
 *
 * Sem isto, "Tarifa" pegava qualquer lançamento com a palavra, de R$ 2 ou de
 * R$ 20.000, entrada ou saída, em qualquer conta. Regra que não sabe distinguir
 * isso não pode conciliar sozinha.
 */
export interface RuleFilters {
    amount_min?: number | null;
    amount_max?: number | null;
    direction?: 'DEBIT' | 'CREDIT' | null;
    bank_account_id?: string | null;
}

/**
 * Grupo de condições com operador explícito.
 *
 * O formato antigo continua valendo e significa OR: um array de condições, ou uma
 * condição solta. As regras gravadas antes de 09/2026 estão nesses formatos e não
 * podem parar de funcionar.
 */
export interface RuleConditionGroup {
    op: 'AND' | 'OR';
    items: RuleCondition[];
    filters?: RuleFilters;
}

export type RuleConditions = RuleCondition | RuleCondition[] | RuleConditionGroup;

import type { ReconciliationEngineSettings, PartyIndex } from '../utils/reconciliationRules';
export type { ReconciliationEngineSettings, ResolvedParty, PartyIndex } from '../utils/reconciliationRules';



export const bankReconciliationService = {
    // ── Regras puras: delegadas a `utils/reconciliationRules`, que roda também no
    //    servidor. Mantidas aqui como método porque dezenas de chamadas e testes já
    //    usam `bankReconciliationService.x(...)`, e mudar isso não agregaria nada.
    normalizeText: regras.normalizeText,
    extractAliasToken: regras.extractAliasToken,
    calculateSimilarity: regras.calculateSimilarity,
    computeInterestExpectation: regras.computeInterestExpectation,
    documentMatches: regras.documentMatches,
    contrapartesDiscordam: regras.contrapartesDiscordam,
    scoreCandidate: regras.scoreCandidate,
    findExactUniquePairs: regras.findExactUniquePairs,
    findInternalTransferPairs: regras.findInternalTransferPairs,
    resolveBankParty: regras.resolveBankParty,


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
            .select('name, account_number, opening_balance_date')
            .eq('id', bankAccountId)
            .maybeSingle();

        // Sem saldo inicial, todo saldo que a tela mostra é soma desde 1900 a partir de
        // zero — número sem significado apresentado como se tivesse. A primeira
        // importação da conta é o momento certo de exigir o ponto de partida.
        if (acct && !acct.opening_balance_date) {
            const { count } = await supabase
                .from('bank_transactions')
                .select('id', { count: 'exact', head: true })
                .eq('bank_account_id', bankAccountId);
            if ((count ?? 0) === 0) {
                throw new Error(
                    `A conta "${acct.name}" ainda não tem saldo inicial. Informe o saldo e a data de partida no cadastro da conta antes de importar: sem isso o saldo bancário e a diferença do Dashboard não têm significado.`,
                );
            }
        }

        // Um registro por arquivo: é o que permite responder depois "o que importei bate
        // com o saldo que o banco informou?" e "falta algum pedaço de extrato?".
        const registros: Array<Record<string, unknown>> = [];

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
                const linhas = await this.toNormalizedRows(parsed.transactions, bankAccountId, organizationId);
                allNormalizedTxs.push(...linhas);

                // O arquivo original vai para um bucket privado, com a organização na
                // primeira pasta — é o que as policies conferem. Falha aqui não derruba a
                // importação: os lançamentos valem mais que a cópia do arquivo.
                let storagePath: string | null = null;
                try {
                    const caminho = `${organizationId}/${new Date().getFullYear()}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`;
                    const { error: upErr } = await supabase.storage.from('bank-statements').upload(caminho, file, { upsert: false });
                    if (!upErr) storagePath = caminho;
                } catch (e) {
                    console.warn('[Extrato] arquivo não pôde ser guardado (importação segue):', e);
                }

                registros.push({
                    organization_id: organizationId,
                    bank_account_id: bankAccountId,
                    file_name: file.name,
                    storage_path: storagePath,
                    format: parsed.format,
                    acct_id: parsed.header.acctId ?? null,
                    ledger_balance: parsed.header.ledgerBalance ?? null,
                    ledger_balance_date: parsed.header.ledgerBalanceDate ?? null,
                    period_start: parsed.header.dtStart ?? null,
                    period_end: parsed.header.dtEnd ?? null,
                    lines_read: parsed.transactions.length,
                    lines_skipped: parsed.skipped,
                    _fingerprints: linhas.map(l => l.fingerprint),
                });
            } catch (err) {
                // Antes isto era um console.error engolido: o arquivo "sumia" sem aviso.
                rejected.push({ file: file.name, reason: err instanceof Error ? err.message : String(err) });
            }
        }

        if (files.length > 0 && rejected.length === files.length) {
            throw new Error(rejected.map(r => `${r.file}: ${r.reason}`).join('\n'));
        }

        if (allNormalizedTxs.length === 0) {
            await this.registrarImportacoes(registros, new Set());
            return { inserted: 0, duplicates: 0, skipped, rejected, headers, data: [] };
        }

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

        if (newTxs.length === 0) {
            await this.registrarImportacoes(registros, new Set());
            return { inserted: 0, duplicates: duplicateCount, skipped, rejected, headers, data: [] };
        }

        // INSERT puro: com external_id NULL o onConflict nunca disparava, e a dedupe real
        // já aconteceu acima pelo fingerprint (há índice único em (bank_account_id, fingerprint)).
        const { data, error } = await supabase
            .from('bank_transactions')
            .insert(newTxs)
            .select();

        if (error) throw error;

        // Grava o registro de cada arquivo, agora que dá para dizer quantas linhas dele
        // realmente entraram e quantas já existiam.
        await this.registrarImportacoes(registros, new Set(newTxs.map(t => t.fingerprint)));

        // Após importar o lote completo, normaliza e aplica regras uma única vez
        await this.normalizeTransactions(bankAccountId);
        await this.applyCustomRules(bankAccountId, organizationId);

        return { inserted: data?.length ?? newTxs.length, duplicates: duplicateCount, skipped, rejected, headers, data: data ?? [] };
    },

    /**
     * Grava um registro por arquivo importado, com o que o BANCO afirmou (saldo de
     * fechamento e período) e o que a importação fez (linhas lidas, inseridas,
     * já existentes, descartadas).
     *
     * `_fingerprints` é interno: serve só para saber quantas linhas DAQUELE arquivo
     * entraram de fato, já que o lote pode ter vindo de vários arquivos de uma vez.
     * Falha aqui nunca derruba a importação — os lançamentos já estão gravados.
     */
    async registrarImportacoes(registros: Array<Record<string, unknown>>, inseridos: Set<string>): Promise<void> {
        if (registros.length === 0) return;
        try {
            const linhas = registros.map(r => {
                const fps = (r._fingerprints as string[] | undefined) ?? [];
                const inseridas = fps.filter(f => inseridos.has(f)).length;
                const { _fingerprints, ...resto } = r;
                void _fingerprints;
                return { ...resto, lines_inserted: inseridas, lines_duplicated: Math.max(0, fps.length - inseridas) };
            });
            const { error } = await supabase.from('bank_statement_imports').insert(linhas);
            if (error) throw error;
        } catch (e) {
            console.warn('[Extrato] registro da importação não gravado (os lançamentos foram):', e);
        }
    },

    /**
     * Transforma movimentos de extrato já classificados em lançamentos internos
     * conciliados (item 2.5). É o que permite DRE retroativa do extrato histórico:
     * sem isso a classificação fica presa no extrato e não vira contabilidade.
     *
     * Recusa quem não tem categoria — a RPC devolve a contagem para a tela avisar.
     */
    async gerarLancamentosDoExtrato(bankTxIds: string[]): Promise<{
        gerados: number; sem_categoria: number; ja_conciliados: number; ignorados: number;
    }> {
        if (bankTxIds.length === 0) return { gerados: 0, sem_categoria: 0, ja_conciliados: 0, ignorados: 0 };
        const { data, error } = await supabase.rpc('fn_generate_internal_from_bank', { p_bank_ids: bankTxIds });
        if (error) throw error;
        return data as { gerados: number; sem_categoria: number; ja_conciliados: number; ignorados: number };
    },

    /**
     * De qual organização é esta conta bancária.
     *
     * A resposta vem SEMPRE da conta, nunca do seletor do topo. São duas razões,
     * e as duas apareceram em produção em 06/09/2026:
     *
     * 1. Com "Todas as organizações" o seletor manda nulo ou vazio, e `.eq()` de
     *    coluna uuid com isso quebra com 22P02 — o motor morria calado.
     * 2. O seletor pode apontar para uma organização DIFERENTE da conta escolhida.
     *    A conta "Sicredi - Garden" é da SPE do Garden Cambuhy, enquanto o resto é
     *    da Alpa Construtora. Confiar no seletor faria o motor procurar título de
     *    uma organização para movimento de outra — casamento entre inquilinos, num
     *    sistema onde a separação por organização é a base de tudo.
     *
     * A conta pertence a exatamente uma organização e o motor trabalha sobre uma
     * conta. O parâmetro `informada` sobrevive só para a chamada não quebrar, e é
     * ignorado de propósito.
     */
    async resolverOrganizacaoDaConta(bankAccountId: string, informada?: string | null): Promise<string | null> {
        void informada;
        const { data, error } = await supabase
            .from('payment_accounts')
            .select('organization_id')
            .eq('id', bankAccountId)
            .maybeSingle();
        if (error) throw error;
        return data?.organization_id ?? null;
    },

    /** Progresso separado: histórico mede classificação, corrente mede conciliação. */
    async progressoDaConta(bankAccountId: string): Promise<Record<string, unknown> | null> {
        const { data, error } = await supabase.rpc('fn_reconciliation_progress', { p_bank_account_id: bankAccountId });
        if (error) throw error;
        return (data as Record<string, unknown>) ?? null;
    },

    /** Define até quando o extrato desta conta é histórico (null = tudo corrente). */
    async definirCorteHistorico(bankAccountId: string, ate: string | null): Promise<void> {
        const { error } = await supabase
            .from('payment_accounts')
            .update({ reconciliation_historic_until: ate })
            .eq('id', bankAccountId);
        if (error) throw error;
    },

    /** Saldo informado pelo banco × calculado, e buracos de período, para uma conta. */
    async conferirCompletude(bankAccountId: string): Promise<Record<string, unknown> | null> {
        const { data, error } = await supabase.rpc('fn_bank_account_completeness', { p_bank_account_id: bankAccountId });
        if (error) throw error;
        return (data as Record<string, unknown>) ?? null;
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
            const normalizedDescription = regras.normalizeText(tx.description_raw);

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
    async applyCustomRules(bankAccountId: string, organizationId?: string | null, reprocessAll: boolean = false, ruleIds?: string[]) {
        // Mesma razão de runMatchingEngine: com "Todas as organizações" o seletor manda
        // nulo e a consulta de regras quebraria com 22P02. A conta é a fonte certa.
        const orgResolvida = await this.resolverOrganizacaoDaConta(bankAccountId, organizationId);
        if (!orgResolvida) throw new Error('Não foi possível identificar a organização desta conta bancária.');
        organizationId = orgResolvida;

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

        // Casa tudo em memória e agrupa por REGRA: antes era um UPDATE e um INSERT de
        // auditoria POR LINHA. Três regras sobre 6.000 pendentes davam milhares de
        // requisições, cada uma passando pela trigger de período fechado — foi o que
        // já travou o "Reprocessar". Agora são poucas, em lotes.
        const porRegra = new Map<string, { rule: typeof rules[number]; ids: string[] }>();

        for (const tx of txs) {
            for (const rule of rules) {
                if (!this.evaluateRule(tx, rule.conditions)) continue;
                const grupo = porRegra.get(rule.id) ?? { rule, ids: [] };
                grupo.ids.push(tx.id);
                porRegra.set(rule.id, grupo);
                appliedCount++;
                break; // a primeira regra que casar (maior prioridade) manda
            }
        }

        for (const { rule, ids } of porRegra.values()) {
            // auto_confirm: marca como CONFIRMED (transação já contabilizada externamente,
            // ex.: repasse de gateway) — sai do pool de matching de receita, evitando
            // dupla contagem com recebíveis já baixados via webhook.
            const nextStatus = rule.actions.auto_confirm ? 'CONFIRMED' : 'RULE_APPLIED';
            const corpo: Record<string, unknown> = { category: rule.actions.category, status: nextStatus };
            // `counterparty` só entra quando a regra define: antes o valor de cada linha
            // era preservado individualmente, e num UPDATE em lote isso é impossível.
            // Sem contraparte na regra, a do movimento fica como está.
            if (rule.actions.counterparty) corpo.counterparty_name = rule.actions.counterparty;
            if (rule.actions.project_id) corpo.project_id = rule.actions.project_id;
            if (rule.actions.cost_center_id) corpo.cost_center_id = rule.actions.cost_center_id;

            for (let i = 0; i < ids.length; i += 200) {
                const fatia = ids.slice(i, i + 200);
                const { error: updateError } = await supabase
                    .from('bank_transactions')
                    .update(corpo)
                    .in('id', fatia);
                if (updateError) {
                    console.error('[ERRO] Falha ao atualizar transações com a regra:', updateError);
                    throw updateError;
                }
            }

            // Uma linha de auditoria por regra, com a contagem — não uma por movimento.
            try {
                await supabase.from('reconciliation_audit_log').insert({
                    organization_id: organizationId,
                    event_type: 'RULE_MATCH',
                    target_id: ids[0],
                    payload: {
                        rule_id: rule.id, rule_name: rule.name,
                        applied_category: rule.actions.category,
                        affected: ids.length,
                    },
                });
            } catch (logError) {
                console.warn('[Aviso] Falha ao gravar log de auditoria, mas a regra foi aplicada:', logError);
            }
        }

        return appliedCount;
    },

    /**
     * Avalia as condições de uma regra contra um movimento.
     *
     * Três formatos convivem, e é de propósito:
     *   • condição solta            → a regra casa se ela casar
     *   • array de condições        → OR (formato legado; as regras em produção usam)
     *   • { op, items, filters }    → AND ou OR explícito, com filtros de valor,
     *                                 direção e conta
     *
     * Os filtros são conjuntivos com o resultado do texto: eles RESTRINGEM. Uma
     * regra sem nenhuma condição de texto mas com filtros casa por filtro só, o que
     * permite "toda saída acima de R$ 10.000 nesta conta".
     */
    evaluateRule(tx: BankTransaction, conditions: RuleConditions): boolean {
        if (Array.isArray(conditions)) {
            return conditions.some(c => this.evaluateRuleSingle(tx, c));
        }
        if (conditions && typeof conditions === 'object' && 'items' in conditions) {
            const grupo = conditions as RuleConditionGroup;
            if (!this.matchesFilters(tx, grupo.filters)) return false;
            const itens = grupo.items ?? [];
            if (itens.length === 0) return !!grupo.filters && Object.keys(grupo.filters).length > 0;
            return grupo.op === 'AND'
                ? itens.every(c => this.evaluateRuleSingle(tx, c))
                : itens.some(c => this.evaluateRuleSingle(tx, c));
        }
        return this.evaluateRuleSingle(tx, conditions as RuleCondition);
    },

    /** Valor dentro da faixa, direção e conta certas. Campo ausente não restringe. */
    matchesFilters(tx: BankTransaction, filtros?: RuleFilters): boolean {
        if (!filtros) return true;
        const valor = Number(tx.amount ?? 0);
        if (filtros.amount_min != null && valor < filtros.amount_min) return false;
        if (filtros.amount_max != null && valor > filtros.amount_max) return false;
        if (filtros.direction && tx.direction !== filtros.direction) return false;
        if (filtros.bank_account_id && tx.bank_account_id !== filtros.bank_account_id) return false;
        return true;
    },

    /**
     * Quantos e quais movimentos uma regra pegaria, SEM gravar nada.
     * É o "Testar" da tela: regra aplicada às cegas em 6.000 linhas é difícil de
     * desfazer, e ver 5 exemplos antes custa nada.
     */
    simularRegra(
        movimentos: BankTransaction[],
        conditions: RuleConditions,
        limiteExemplos = 5,
    ): { total: number; exemplos: BankTransaction[] } {
        const casados = movimentos.filter(tx => this.evaluateRule(tx, conditions));
        return { total: casados.length, exemplos: casados.slice(0, limiteExemplos) };
    },

    evaluateRuleSingle(tx: BankTransaction, cond: RuleCondition): boolean {
        // Normaliza o nome do campo para garantir compatibilidade com versões anteriores
        const fieldName = (cond.field === 'description_norm' || cond.field === 'description') 
            ? 'description_normalized' 
            : cond.field;
            
        const rawVal = (tx as unknown as Record<string, unknown>)[fieldName] ?? tx.description_normalized ?? tx.description_raw ?? '';
        
        // Normalização extrema para comparação
        const normalizedFieldVal = regras.normalizeText(rawVal.toString());
        const normalizedSearchVal = regras.normalizeText(cond.value || '');

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
        try {
            const [{ data: asaas }, { data: rs }] = await Promise.all([
                supabase.from('asaas_charge_config').select('fine_percent, interest_percent_month').eq('organization_id', organizationId).maybeSingle(),
                supabase.from('reconciliation_settings').select('value_tol_abs, value_tol_pct, encargos_tol_pct, date_window_days, auto_threshold, suggestion_min').eq('organization_id', organizationId).maybeSingle(),
            ]);
            // A MISTURA com os padrões vive em `reconciliationRules`, não aqui: o padrão é
            // decisão (`auto_threshold: 100` separa "concilia sozinho" de "só sugere"), e
            // duplicá-lo entre navegador e servidor seria deixar as duas metades do motor
            // discordarem sobre quando escrever vínculo.
            return regras.montarAjustes(asaas, rs);
        } catch {
            return regras.AJUSTES_PADRAO;
        }
    },

    /**
     * Carrega o índice de contrapartes: aliases aprendidos + documentos (CNPJ/CPF/PIX)
     * de fornecedores, clientes e contas bancárias de fornecedor.
     */
    async loadPartyIndex(organizationId: string): Promise<PartyIndex> {
        const orgOrNull = `organization_id.eq.${organizationId},organization_id.is.null`;
        const [aliasesRes, supRes, cliRes, sbaRes] = await Promise.all([
            supabase.from('reconciliation_aliases').select('alias_token, party_type, party_id, party_name, hit_count').eq('organization_id', organizationId).order('hit_count', { ascending: false }).limit(2000),
            supabase.from('suppliers').select('id, name, document').or(orgOrNull),
            supabase.from('clients').select('id, name, document').or(orgOrNull),
            supabase.from('supplier_bank_accounts').select('supplier_id, pix_key, pix_key_type, beneficiary_document').eq('organization_id', organizationId),
        ]);
        // A MONTAGEM vive em `reconciliationRules` pelo mesmo motivo dos ajustes: o corte de
        // 11 dígitos e a precedência (fornecedor, depois cliente, e a conta bancária só
        // preenchendo o que ficou vazio) são regra, não transporte.
        return regras.montarIndiceDeContrapartes(
            aliasesRes.data || [], supRes.data || [], cliRes.data || [], sbaRes.data || []);
    },





    /** Aprende a associação extrato→contraparte ao confirmar um match (só com contraparte cadastrada). */
    async learnAliasFromMatch(bankTxId: string, internalTxId: string, organizationId: string) {
        try {
            const [{ data: bt }, { data: it }] = await Promise.all([
                supabase.from('bank_transactions').select('description_normalized, counterparty_name, description_raw').eq('id', bankTxId).maybeSingle(),
                supabase.from('internal_transactions').select('party_id, party_type, party_name, entity_name').eq('id', internalTxId).maybeSingle(),
            ]);
            if (!bt || !it) return;
            // Fornecedor NUNCA tem party_id: a FK internal_txs_party_id_fkey aponta só
            // para `clients`. Exigir party_id aqui era o motivo de o sistema ter 2 aliases
            // em toda a base e nenhum de fornecedor, com 73% do extrato sendo débito.
            // Agora basta ter COMO nomear a contraparte.
            const partyName = it.party_name || it.entity_name || null;
            if (!it.party_id && !partyName) return;

            const token = regras.extractAliasToken(bt.counterparty_name || bt.description_normalized || bt.description_raw || '');
            if (!token || token.length < 3) return;
            const partyType: 'SUPPLIER' | 'CLIENT' = it.party_type === 'CLIENT' ? 'CLIENT' : 'SUPPLIER';

            let busca = supabase.from('reconciliation_aliases')
                .select('id, hit_count')
                .eq('organization_id', organizationId)
                .eq('alias_token', token)
                .eq('party_type', partyType);
            busca = it.party_id ? busca.eq('party_id', it.party_id) : busca.is('party_id', null).eq('party_name', partyName);

            const { data: existing } = await busca.maybeSingle();
            if (existing) {
                await supabase.from('reconciliation_aliases').update({ hit_count: (existing.hit_count || 1) + 1, updated_at: new Date().toISOString() }).eq('id', existing.id);
            } else {
                await supabase.from('reconciliation_aliases').insert({
                    organization_id: organizationId, alias_token: token, party_type: partyType,
                    party_id: it.party_id ?? null, party_name: partyName,
                });
            }
        } catch (e) {
            console.warn('[Alias] aprendizado falhou (ignorado):', e);
        }
    },







    /**
     * Motor de matching com score aditivo explicável (Fase 1 da Central Inteligente).
     * Considera valor, juros/multa, data, fornecedor e documento. Auto-concilia
     * apenas vencedores muito claros (≥100 e à frente do 2º); o resto vira sugestão
     * explicada (confidence = score, reason = motivos).
     */
    /**
     * Executa o motor REGISTRANDO a execução em `reconciliation_runs`.
     *
     * É este que a tela deve chamar. Em 06/09/2026 o usuário clicou três vezes achando
     * que o motor tinha rodado e nas duas primeiras ele não rodou — a única forma de
     * descobrir foi comparar o `created_at` das sugestões com a hora do clique. Motor
     * que escreve em conta financeira e não registra que rodou não se audita nem se
     * depura. A falha também é gravada: erro que só existe no console some com a aba.
     */
    async runMatchingEngineTracked(
        bankAccountId: string,
        organizationId?: string | null,
        trigger: 'MANUAL' | 'IMPORT' | 'CRON' = 'MANUAL',
    ): Promise<MatchingRunResult> {
        const orgId = await this.resolverOrganizacaoDaConta(bankAccountId, organizationId);
        if (!orgId) throw new Error('Não foi possível identificar a organização desta conta bancária.');

        // ── Primeiro caminho: o SERVIDOR ──────────────────────────────────────
        //
        // Desde 06/09/2026 a Edge Function faz o motor inteiro — determinístico E
        // pontuação —, com o MESMO `planMatching` que roda aqui. Chamar o servidor é o
        // caminho normal, e não uma otimização: no navegador, uma rodada carrega quase
        // 6.000 lançamentos para a memória da aba, só acontece se alguém estiver com a
        // tela aberta, e falha em silêncio se o bundle em cache estiver velho.
        //
        // Ela registra a própria execução em `reconciliation_runs`, então NÃO se abre
        // registro aqui antes de tentar — duas linhas para a mesma rodada seriam pior do
        // que nenhuma.
        try {
            const { data, error } = await supabase.functions.invoke('reconciliation-engine', {
                body: { bank_account_id: bankAccountId, trigger },
            });
            if (error) throw error;
            const r = data as Record<string, number>;
            return {
                autoApplied: r.auto_matched ?? 0,
                suggestions: r.suggestions ?? 0,
                exactUnique: r.exact_unique ?? 0,
                transfersPaired: r.transfers_paired ?? 0,
                bankRowsScanned: r.bank_rows_scanned ?? 0,
                titleRowsScanned: r.title_rows_scanned ?? 0,
            };
        } catch (e) {
            // Cair para o navegador é DEGRADAÇÃO, não plano B silencioso: se a function
            // estiver fora do ar, é melhor conciliar mais devagar do que não conciliar.
            // O aviso fica no console para que "por que demorou?" tenha resposta.
            console.warn('[Motor] servidor indisponível, rodando no navegador:', e);
        }

        const inicio = Date.now();
        let runId: string | null = null;
        try {
            const { data } = await supabase
                .from('reconciliation_runs')
                .insert({ organization_id: orgId, bank_account_id: bankAccountId, trigger, status: 'RUNNING' })
                .select('id')
                .single();
            runId = data?.id ?? null;
        } catch (e) {
            // Não poder registrar não pode impedir de conciliar.
            console.warn('[Motor] início da execução não registrado:', e);
        }

        try {
            const r = await this.runMatchingEngine(bankAccountId, orgId);
            if (runId) {
                await supabase.from('reconciliation_runs').update({
                    status: 'DONE',
                    auto_matched: r.autoApplied,
                    exact_unique: r.exactUnique,
                    transfers_paired: r.transfersPaired,
                    suggestions: r.suggestions,
                    bank_rows_scanned: r.bankRowsScanned ?? 0,
                    title_rows_scanned: r.titleRowsScanned ?? 0,
                    finished_at: new Date().toISOString(),
                    duration_ms: Date.now() - inicio,
                }).eq('id', runId);
            }
            return r;
        } catch (e) {
            const err = e as { message?: string; code?: string; details?: string };
            if (runId) {
                await supabase.from('reconciliation_runs').update({
                    status: 'FAILED',
                    error_message: [err?.message, err?.details].filter(Boolean).join(' · ') || String(e),
                    error_code: err?.code ?? null,
                    finished_at: new Date().toISOString(),
                    duration_ms: Date.now() - inicio,
                }).eq('id', runId).then(undefined, () => { /* registro é melhor-esforço */ });
            }
            throw e;
        }
    },

    /** Última execução do motor nesta conta — a tela usa para dizer "rodou quando?". */
    async ultimaExecucao(bankAccountId: string): Promise<Record<string, unknown> | null> {
        const { data, error } = await supabase.rpc('fn_reconciliation_last_run', { p_bank_account_id: bankAccountId });
        if (error) throw error;
        return (data as Record<string, unknown>) ?? null;
    },

    async runMatchingEngine(bankAccountId: string, organizationId?: string | null): Promise<MatchingRunResult> {
        // A organização do seletor do topo é OPCIONAL aqui, e não pode ser exigida:
        // com "Todas as organizações" ela vem nula, e `.eq('organization_id', null)`
        // vira `organization_id=eq.` no PostgREST, que responde 22P02 (uuid inválido).
        // O motor inteiro lançava e a tela dizia só "Erro ao reprocessar" — o botão
        // parecia não fazer nada. Ver REGRA #5 do CLAUDE.md e a memória
        // `project_org_vazia_22p02_uuid`.
        //
        // A conta bancária pertence a exatamente UMA organização, então ela é a fonte
        // certa: o motor trabalha sobre uma conta, não sobre a seleção da tela.
        const orgId = await this.resolverOrganizacaoDaConta(bankAccountId, organizationId);
        if (!orgId) {
            throw new Error('Não foi possível identificar a organização desta conta bancária.');
        }
        organizationId = orgId;

        const settings = await this.loadSettings(organizationId);
        const AUTO_THRESHOLD = settings.auto_threshold;
        const MIN_SUGGESTION = settings.suggestion_min;

        // 0) Transferência entre contas próprias sai do caminho ANTES de tudo: não é
        //    receita nem despesa, e deixá-la no pool cria candidatos falsos dos dois lados.
        let transfersPaired = 0;
        try {
            ({ paired: transfersPaired } = await this.pairInternalTransfers(organizationId));
        } catch (e) {
            console.warn('[Motor] pareamento de transferências ignorado:', e);
        }

        // 1) Carrega TUDO, paginando: o PostgREST corta em 1000 linhas por requisição e
        //    `.limit(5000)` aqui fazia o motor pontuar ~17% do extrato de uma conta com
        //    5.797 pendentes (subconjunto arbitrário, porque não havia ordenação).
        // (campos opcionais tipados sem `null` para casar com scoreCandidate/resolveBankParty;
        //  em runtime o PostgREST devolve null e os `||` lá dentro já tratam)
        type BankRow = { id: string; transaction_date: string; amount: number; direction: string; description_raw: string; description_normalized?: string; counterparty_name?: string; bank_account_id?: string };
        type PendingRow = { id: string; transaction_date: string; due_date?: string; amount: number; direction: string; description?: string; entity_name?: string; party_name?: string; party_id?: string; payment_account_id?: string };

        const [{ data: bankTxs, error: bankErr }, partyIndex] = await Promise.all([
            fetchAllPages<BankRow>(() => supabase
                .from('bank_transactions')
                .select('id, transaction_date, amount, direction, description_raw, description_normalized, counterparty_name, bank_account_id')
                .eq('bank_account_id', bankAccountId)
                .in('status', ['NORMALIZED', 'RULE_APPLIED'])
                .order('transaction_date', { ascending: true })
                .order('id', { ascending: true }) as unknown as RangeableQuery<BankRow>),
            this.loadPartyIndex(organizationId),
        ]);
        if (bankErr) throw bankErr;
        if (!bankTxs || bankTxs.length === 0) return { autoApplied: 0, suggestions: 0, exactUnique: 0, transfersPaired, bankRowsScanned: 0, titleRowsScanned: 0 };

        // Só faz sentido buscar títulos na janela que o extrato carregado alcança
        // (60 dias antes do primeiro movimento, 5 dias depois do último): parcelas de
        // 2027–2029 nunca casam com extrato de hoje e só engordam a carga.
        const { inicio: windowStart, fim: windowEnd } =
            regras.janelaDeTitulos(bankTxs.map(b => b.transaction_date));

        const { data: pending, error: pendingErr } = await fetchAllPages<PendingRow>(() => supabase
            .from('internal_transactions')
            .select('id, transaction_date, due_date, amount, direction, description, entity_name, party_name, party_id, payment_account_id')
            .eq('organization_id', organizationId)
            .eq('status', 'PENDING')
            .gte('transaction_date', windowStart)
            .lte('transaction_date', windowEnd)
            .order('transaction_date', { ascending: true })
            .order('id', { ascending: true }) as unknown as RangeableQuery<PendingRow>);
        if (pendingErr) throw pendingErr;
        const candidatesAll = pending || [];

        // 2) Decide em memória. O julgamento inteiro mora em `utils/reconciliationRules`,
        //    sem um único import, para que a Edge Function pontue com o MESMO código —
        //    não com uma segunda implementação das mesmas regras (item 3.3 do plano).
        const { autoMatches, suggestionRows, partyUpdates, exactUnique } =
            regras.planMatching(bankTxs, candidatesAll, settings, partyIndex);

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

        // 4) Aplica auto-conciliações (isoladas p/ não abortar o lote em período fechado).
        //    Cada uma é uma transação no banco (fn_reconcile_match) com auditoria.
        let autoApplied = 0;
        for (const m of autoMatches) {
            try {
                await this.createMatch(m.bankId, m.internalId, 'HEURISTIC', m.score);
                autoApplied++;
            } catch (e) {
                console.warn('[Motor] auto-match ignorado:', e);
            }
        }
        return {
            autoApplied, suggestions: suggestionRows.length, exactUnique, transfersPaired,
            bankRowsScanned: bankTxs.length, titleRowsScanned: candidatesAll.length,
        };
    },

    /**
     * Pareia transferências entre contas da PRÓPRIA organização antes de tentar casar
     * com títulos: débito numa conta × crédito de mesmo valor em outra, com até 1 dia
     * de diferença. Sem isso, o mesmo dinheiro aparece como despesa numa conta e receita
     * na outra, polui o pool de candidatos e infla o Dashboard (51 pares em 05/09/2026).
     *
     * Guloso pela menor distância de data; cada movimento entra em no máximo um par.
     */
    async pairInternalTransfers(organizationId: string): Promise<{ paired: number }> {
        type Row = { id: string; bank_account_id: string; transaction_date: string; amount: number; direction: string };
        const { data, error } = await fetchAllPages<Row>(() => supabase
            .from('bank_transactions')
            .select('id, bank_account_id, transaction_date, amount, direction')
            .eq('organization_id', organizationId)
            .in('status', ['NORMALIZED', 'RULE_APPLIED'])
            .order('transaction_date', { ascending: true })
            .order('id', { ascending: true }) as unknown as RangeableQuery<Row>);
        if (error) throw error;
        const rows = data || [];

        const pairs = regras.findInternalTransferPairs(rows);
        let paired = 0;
        for (const p of pairs) {
            try {
                const { error: rpcErr } = await supabase.rpc('fn_reconcile_transfer', { p_debit_id: p.debitId, p_credit_id: p.creditId });
                if (rpcErr) throw rpcErr;
                paired++;
            } catch (e) {
                console.warn('[Motor] par de transferência ignorado:', e);
            }
        }
        return { paired };
    },



    /** Desfaz um par de transferência: as duas pontas voltam a pendente. */
    async unpairInternalTransfer(pairId: string): Promise<number> {
        const { data, error } = await supabase.rpc('fn_reconcile_untransfer', { p_pair_id: pairId });
        if (error) throw error;
        return (data as number) ?? 0;
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
