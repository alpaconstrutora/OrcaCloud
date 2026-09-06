/**
 * REGRAS DE CONCILIAÇÃO — decisões puras, sem banco e sem navegador.
 *
 * ─── POR QUE ESTE ARQUIVO EXISTE ────────────────────────────────────────────
 * Estas funções decidem o que casa com o quê. Elas precisam rodar em DOIS lugares:
 * no navegador (hoje) e no servidor (item 3.3 do plano da conciliação). Enquanto
 * viviam dentro do serviço, junto das chamadas ao Supabase, mover o motor exigiria
 * reescrevê-las — e aí passariam a existir duas implementações das mesmas regras.
 *
 * Isso seria caro. Em 06/09/2026 estas regras erraram nas DUAS direções antes de
 * acertar: primeiro ligaram 25 pares sem relação, depois bloquearam 9 corretos.
 * Manter duas cópias de algo tão sutil é garantir que uma delas fique para trás.
 *
 * Por isso não há um único `import` aqui. Zero dependências significa que Deno,
 * Vite e Vitest carregam o mesmo arquivo, e a regra existe uma vez só.
 *
 * ⚠️ Nada que toque rede, banco ou `window` entra aqui. Se precisar de dado,
 * receba por parâmetro.
 */

/** Milissegundos num dia. */
export const DAY = 86_400_000;

/** Tolerâncias e limiares do motor, configuráveis por organização. */
export interface ReconciliationEngineSettings {
    fine_percent: number;
    interest_percent_month: number;
    value_tol_abs: number;
    value_tol_pct: number;
    encargos_tol_pct: number;
    date_window_days: number;
    auto_threshold: number;
    suggestion_min: number;
}

/** Contraparte reconhecida no texto do extrato. */
export interface ResolvedParty {
    // Opcional pela mesma razão do alias: contraparte reconhecida pelo NOME, sem cadastro,
    // é reconhecimento legítimo. `scoreCandidate` já pergunta `resolved.party_id &&` antes
    // de usar, e cai na comparação por nome quando não há id.
    party_id?: string | null;
    party_type: 'SUPPLIER' | 'CLIENT';
    party_name?: string | null;
    via: string;
}

/** Índice de contrapartes conhecidas: documentos e apelidos aprendidos. */
export interface PartyIndex {
    docIndex: Map<string, { party_id: string; party_type: 'SUPPLIER' | 'CLIENT'; party_name?: string | null }>;
    // `party_id` é opcional de propósito: desde o item 2.3 o alias aprende também quando
    // não há contraparte cadastrada, usando só o nome. Fornecedor nunca tem `party_id` —
    // a FK aponta apenas para `clients` —, e exigi-lo aqui era o motivo de a base ter
    // dois aliases e nenhum de fornecedor, com 73% do extrato sendo débito.
    aliases: { token: string; party_id?: string | null; party_type: 'SUPPLIER' | 'CLIENT'; party_name?: string | null; hit: number }[];
}

/**
 * Unifica a normalização de texto para garantir paridade entre regras e descrições.
 */
export function normalizeText(text: string): string {
    return (text || '')
        .toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/[^A-Z0-9 ]/g, ' ') // Remove caracteres especiais
        .replace(/\s+/g, ' ') // Remove espaços duplicados
        .trim();
}

/** Extrai um token significativo da descrição do extrato para virar alias. */
export function extractAliasToken(text: string): string {
    const NOISE = new Set(['PIX', 'TED', 'DOC', 'TEV', 'TRANSFERENCIA', 'TRANSF', 'RECEBIDO', 'ENVIADO', 'PAGAMENTO', 'PAGTO', 'COBRANCA', 'BOLETO', 'DEB', 'CRED', 'DEBITO', 'CREDITO', 'CARTAO', 'COMPRA', 'SAQUE', 'TARIFA', 'LIQUIDACAO', 'REF', 'NOME', 'LTDA', 'ME', 'EPP', 'SA', 'EIRELI', 'DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);
    const words = normalizeText(text).split(' ').filter(w => w && !/^\d+$/.test(w) && !NOISE.has(w));
    return words.slice(0, 4).join(' ').trim();
}

export function calculateSimilarity(str1: string, str2: string): number {
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
}

/**
 * Calcula o valor esperado de um título pago em atraso (multa + juros pró-rata).
 * Retorna null se o pagamento não foi após o vencimento.
 */
export function computeInterestExpectation(
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
}

/** Procura um nº de documento (NF) da transação interna dentro da descrição do extrato. */
export function documentMatches(internalDesc: string, bankText: string): boolean {
    const tokens = (internalDesc || '').match(/\d{4,8}/g) || [];
    if (tokens.length === 0) return false;
    const bankDigits = (bankText || '').replace(/\D/g, '');
    if (!bankDigits) return false;
    return tokens.some(t => bankDigits.includes(t));
}

/**
 * As duas contrapartes se contradizem?
 *
 * Só responde `true` quando os DOIS lados NOMEIAM alguém e nenhuma palavra
 * significativa do título aparece no texto do extrato.
 *
 * ⚠️ "Texto presente" NÃO é "contraparte declarada". Um extrato que diz
 * `INT PAG TIT BANCO 001` é jargão puro: não nomeia ninguém. Na primeira versão
 * desta guarda eu tratei os dois como a mesma coisa, e ela bloqueou 9 de 9 pares
 * do Banco Itaú — inclusive um boleto da ENERGISA cujo título dizia
 * "ENERGISA SUL-SUDESTE" e cujo extrato não dizia nada. Ausência de nome é
 * ausência de informação, não desmentido.
 *
 * Por isso o extrato passa pelo mesmo filtro de ruído do alias: se, tirado o
 * jargão bancário e os números, não sobra nome nenhum, não há o que contradizer.
 */
export function contrapartesDiscordam(textoExtrato: string | undefined, contraparteTitulo: string | undefined): boolean {
    const alvo = normalizeText(contraparteTitulo || '');
    if (!alvo) return false;
    const palavrasTitulo = alvo.split(' ').filter(w => w.length >= 4);
    if (palavrasTitulo.length === 0) return false;

    const texto = normalizeText(textoExtrato || '');
    if (!texto) return false;

    // O extrato chega a nomear alguém? `extractAliasToken` tira PIX/TED/PAGTO e
    // afins; JARGAO_DE_EXTRATO cobre o que sobra em lançamento de compensação,
    // que é justamente onde o nome não aparece.
    const JARGAO_DE_EXTRATO = new Set(['INT', 'TIT', 'TITULO', 'BANCO', 'COMPE', 'LIQ', 'AUT', 'CONV', 'AVULSO', 'AGENCIA', 'CONTA', 'DOCTO', 'FATURA', 'PARCELA']);
    const nomeNoExtrato = extractAliasToken(texto)
        .split(' ')
        .filter(w => w.length >= 4 && !JARGAO_DE_EXTRATO.has(w));
    if (nomeNoExtrato.length === 0) return false; // o extrato não nomeia ninguém

    return !palavrasTitulo.some(w => texto.includes(w));
}

/**
 * Pontua um candidato interno contra um movimento bancário, com motivos explicáveis.
 * Pesos: valor exato +40 / encargos compatíveis +35 / valor próximo +20;
 *        mesma data +20 / próxima +15..8; fornecedor +30/+15; documento +40.
 */
export function scoreCandidate(
    bTx: { amount: number; direction: string; transaction_date: string; description_normalized?: string; description_raw?: string; counterparty_name?: string; bank_account_id?: string },
    c: { amount: number; transaction_date: string; due_date?: string; description?: string; entity_name?: string; party_name?: string; party_id?: string; payment_account_id?: string },
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
        const interest = computeInterestExpectation(c.amount, c.due_date || c.transaction_date, bTx.transaction_date, s);
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
    } else if (resolved && resolved.party_name && calculateSimilarity(intParty, resolved.party_name) >= 0.7) {
        score += 25; reasons.push(`Fornecedor reconhecido (${resolved.via})`);
    } else {
        // ── Fornecedor por similaridade textual (fallback) ──
        const bankParty = bTx.counterparty_name || bTx.description_normalized || '';
        const sim = calculateSimilarity(bankParty, intParty);
        if (sim >= 0.8) { score += 30; reasons.push('Mesmo fornecedor (alta similaridade)'); }
        else if (sim >= 0.5) { score += 15; reasons.push('Fornecedor similar'); }
    }

    // ── Documento (NF) ──
    if (documentMatches(c.description || '', bTx.description_normalized || bTx.description_raw || '')) {
        score += 40; reasons.push('Documento encontrado no extrato');
    }

    // ── Conta bancária prevista ──
    // Sinal barato e forte: folha sai sempre da mesma conta, aluguel entra sempre
    // na mesma. Vale nos DOIS sentidos — conta certa soma, conta errada tira, porque
    // "esperava-se esta saída no Itaú e ela apareceu no Sicredi" é evidência contra.
    // Título sem conta prevista não pontua nem penaliza: 1.619 dos 1.620 pendentes
    // estão assim hoje, e ausência não é sinal.
    if (c.payment_account_id && bTx.bank_account_id) {
        if (c.payment_account_id === bTx.bank_account_id) {
            score += 20; reasons.push('Conta bancária prevista confere');
        } else {
            score -= 15; reasons.push('Conta bancária diferente da prevista');
        }
    }

    return { score: Math.round(score), reasons };
}

/**
 * Pares extrato × título com valor exato, data em até 3 dias e candidato ÚNICO
 * dos dois lados dentro dessa janela.
 *
 * Unicidade MÚTUA: o movimento tem um só título compatível E aquele título tem um
 * só movimento compatível. Sem isso, valor igual vira armadilha — foi o caso do PIX
 * de R$ 600 que batia com oito faturas de R$ 600 de um fornecedor diferente.
 *
 * ⚠️ E unicidade também NÃO basta sozinha. Na primeira execução real (06/09/2026),
 * a regra casou 45 pares e 25 deles ligavam contrapartes que não têm nada a ver:
 * um PIX para "NOVA ALIANCA CAMBUI" foi parar num contrato de "Bruna Suelem", e um
 * crédito de "ALEX DUTRA CHAVES" num contrato da "Filtrelec". Coincidir em valor e
 * data, sendo os dois únicos na janela, acontece muito mais do que a intuição diz.
 * Por isso: quando os dois lados nomeiam contrapartes e elas se CONTRADIZEM, o par
 * vira sugestão em vez de conciliação automática. Ausência de nome não impede —
 * o que impede é o desmentido.
 */
export function findExactUniquePairs(
    bankTxs: { id: string; amount: number; direction: string; transaction_date: string; counterparty_name?: string; description_normalized?: string; description_raw?: string }[],
    candidates: { id: string; amount: number; direction: string; transaction_date: string; party_name?: string; entity_name?: string }[],
    maxDays = 3,
): { bankId: string; internalId: string; days: number; reason: string }[] {
    const days = (a: string, b: string) =>
        Math.abs(Math.round((new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / DAY));

    // Índice por (direção|valor com 2 casas) — evita varrer todos os títulos por movimento.
    const byKey = new Map<string, typeof candidates>();
    for (const c of candidates) {
        const k = `${c.direction}|${c.amount.toFixed(2)}`;
        const arr = byKey.get(k) ?? [];
        arr.push(c);
        byKey.set(k, arr);
    }

    // 1ª passada: para cada movimento, os títulos compatíveis; guarda só quem tem exatamente 1.
    const bankToOne = new Map<string, { internalId: string; days: number }>();
    const internalHits = new Map<string, number>(); // quantos movimentos apontam para o título
    for (const b of bankTxs) {
        const pool = (byKey.get(`${b.direction}|${b.amount.toFixed(2)}`) ?? [])
            .filter(c => days(c.transaction_date, b.transaction_date) <= maxDays);
        if (pool.length !== 1) continue;
        bankToOne.set(b.id, { internalId: pool[0].id, days: days(pool[0].transaction_date, b.transaction_date) });
    }
    // 2ª passada: quantos movimentos (quaisquer, não só os de candidato único) casam com cada título.
    for (const c of candidates) {
        let n = 0;
        for (const b of bankTxs) {
            if (b.direction !== c.direction) continue;
            if (Math.abs(b.amount - c.amount) >= 0.005) continue;
            if (days(c.transaction_date, b.transaction_date) <= maxDays) n++;
        }
        if (n > 0) internalHits.set(c.id, n);
    }

    const porId = new Map(bankTxs.map(b => [b.id, b]));
    const candPorId = new Map(candidates.map(c => [c.id, c]));

    const out: { bankId: string; internalId: string; days: number; reason: string }[] = [];
    const usados = new Set<string>();
    for (const [bankId, { internalId, days: d }] of bankToOne) {
        if (internalHits.get(internalId) !== 1) continue; // o título tem outro pretendente
        if (usados.has(internalId)) continue;

        // Contrapartes que se contradizem derrubam o par: vira sugestão, não vínculo.
        const b = porId.get(bankId);
        const c = candPorId.get(internalId);
        const textoExtrato = b?.counterparty_name || b?.description_normalized || b?.description_raw;
        const contraparteTitulo = c?.party_name || c?.entity_name;
        if (contrapartesDiscordam(textoExtrato, contraparteTitulo)) continue;

        usados.add(internalId);
        out.push({
            bankId,
            internalId,
            days: d,
            reason: d === 0
                ? 'Valor exato, mesma data, candidato único dos dois lados'
                : `Valor exato, ${d} dia(s) de diferença, candidato único dos dois lados`,
        });
    }
    return out;
}

/**
 * Acha os pares débito×crédito de contas DIFERENTES, mesmo valor, ≤ maxDays de
 * distância. Função pura para poder ser testada sem banco.
 */
export function findInternalTransferPairs(
    rows: { id: string; bank_account_id: string; transaction_date: string; amount: number; direction: string }[],
    maxDays = 1,
): { debitId: string; creditId: string; days: number }[] {
    const t = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
    const debits = rows.filter(r => r.direction === 'DEBIT');
    const creditsByKey = new Map<string, typeof rows>();
    for (const c of rows.filter(r => r.direction === 'CREDIT')) {
        const k = c.amount.toFixed(2);
        const arr = creditsByKey.get(k) ?? [];
        arr.push(c);
        creditsByKey.set(k, arr);
    }

    const usados = new Set<string>();
    const out: { debitId: string; creditId: string; days: number }[] = [];
    // Ordena os débitos por data para o resultado ser determinístico.
    for (const d of [...debits].sort((a, b) => (a.transaction_date < b.transaction_date ? -1 : a.transaction_date > b.transaction_date ? 1 : a.id < b.id ? -1 : 1))) {
        if (usados.has(d.id)) continue;
        const candidatos = (creditsByKey.get(d.amount.toFixed(2)) ?? [])
            .filter(c => !usados.has(c.id)
                && c.bank_account_id !== d.bank_account_id
                && Math.abs(Math.round((t(c.transaction_date) - t(d.transaction_date)) / DAY)) <= maxDays)
            .sort((a, b) => {
                const da = Math.abs(t(a.transaction_date) - t(d.transaction_date));
                const db = Math.abs(t(b.transaction_date) - t(d.transaction_date));
                return da !== db ? da - db : (a.id < b.id ? -1 : 1);
            });
        if (candidatos.length === 0) continue;
        const c = candidatos[0];
        usados.add(d.id);
        usados.add(c.id);
        out.push({ debitId: d.id, creditId: c.id, days: Math.abs(Math.round((t(c.transaction_date) - t(d.transaction_date)) / DAY)) });
    }
    return out;
}

/** Reconhece a contraparte de um movimento bancário por alias aprendido ou CNPJ/CPF/PIX. */
export function resolveBankParty(
    bTx: { description_raw?: string; description_normalized?: string; counterparty_name?: string },
    index: PartyIndex,
): ResolvedParty | null {
    const descNorm = normalizeText(bTx.counterparty_name || bTx.description_normalized || bTx.description_raw || '');
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
}

/** O que o plano precisa saber de um lançamento de extrato. */
export interface BankRowParaPlano {
    id: string; transaction_date: string; amount: number; direction: string;
    description_raw?: string; description_normalized?: string;
    counterparty_name?: string; bank_account_id?: string;
}

/** O que o plano precisa saber de um título interno pendente. */
export interface TituloParaPlano {
    id: string; transaction_date: string; due_date?: string; amount: number; direction: string;
    description?: string; entity_name?: string; party_name?: string;
    party_id?: string; payment_account_id?: string;
}


/**
 * O PLANO de uma rodada do motor: o que casar sozinho, o que sugerir, e que contraparte
 * carimbar no extrato. Não toca no banco — recebe tudo pronto e devolve a decisão.
 *
 * Isto era o miolo de `runMatchingEngine`, no navegador. Foi movido para cá em 06/09/2026
 * (item 3.3) para que a Edge Function pontue com o MESMO código, e não com uma segunda
 * implementação das mesmas regras. Duas cópias seriam duas chances de divergir — e estas
 * regras já erraram nas duas direções antes de acertar: ligaram 25 pares sem relação,
 * depois bloquearam 9 corretos.
 *
 * A separação é a mesma de sempre: aqui mora o julgamento, lá fora mora a I/O.
 */
export interface PlanoDeConciliacao {
    autoMatches: { bankId: string; internalId: string; score: number; reason: string }[];
    suggestionRows: { bank_transaction_id: string; candidate_internal_transaction_id: string; confidence: number; reason: string }[];
    /** nome da contraparte reconhecida → ids do extrato que ainda não a tinham */
    partyUpdates: Map<string, string[]>;
    exactUnique: number;
}

export function planMatching(
    bankTxs: BankRowParaPlano[],
    candidatesAll: TituloParaPlano[],
    settings: ReconciliationEngineSettings,
    partyIndex: PartyIndex,
): PlanoDeConciliacao {
    const AUTO_THRESHOLD = settings.auto_threshold;
    const MIN_SUGGESTION = settings.suggestion_min;

    // 2) Casa em memória (sem ida ao banco por transação)
    const autoMatches: { bankId: string; internalId: string; score: number; reason: string }[] = [];
    const suggestionRows: { bank_transaction_id: string; candidate_internal_transaction_id: string; confidence: number; reason: string }[] = [];
    const claimedInternal = new Set<string>();
    const partyUpdates = new Map<string, string[]>(); // nome reconhecido → ids do extrato

    // 2.a) Regra de ouro: valor exato, data em até 3 dias e candidato ÚNICO dos DOIS lados.
    // É o que um conciliador humano faz sem pensar, e o score sozinho nunca alcançava:
    // valor exato (40) + mesma data (20) = 60, longe do limiar de 100. Por isso o sistema
    // tinha ZERO conciliações automáticas em toda a sua história.
    // A unicidade MÚTUA é a regra, não um refinamento: em 09/2026 havia um PIX de R$ 600
    // que casava em valor com oito títulos "Fatura Contrato 005 (n)" de outro fornecedor.
    // Dos 231 pares de valor exato do banco, só 55 são exatos E únicos dos dois lados.
    const exactPairs = findExactUniquePairs(bankTxs, candidatesAll);
    for (const p of exactPairs) {
        autoMatches.push({
            bankId: p.bankId,
            internalId: p.internalId,
            score: 100,
            reason: p.reason,
        });
        claimedInternal.add(p.internalId);
    }
    const bankHandled = new Set(exactPairs.map(p => p.bankId));

    for (const bTx of bankTxs) {
        if (bankHandled.has(bTx.id)) continue; // já resolvido pela regra exato-e-único
        const bDate = new Date(bTx.transaction_date).getTime();
        const minT = bDate - 60 * DAY; // títulos vencidos pagos semanas depois
        const maxT = bDate + 5 * DAY;
        const amtMin = bTx.amount * 0.90;
        const amtMax = bTx.amount * 1.01;
        const resolved = resolveBankParty(bTx, partyIndex);

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
            .map(c => ({ c, ...scoreCandidate(bTx, c, settings, resolved) }))
            .filter(r => r.score >= MIN_SUGGESTION)
            .sort((a, b) => b.score - a.score);

        if (ranked.length === 0) continue;

        const top = ranked[0];
        const second = ranked[1];
        const clearWinner = !second || (top.score - second.score) >= 20;

        if (top.score >= AUTO_THRESHOLD && clearWinner && !claimedInternal.has(top.c.id)) {
            autoMatches.push({ bankId: bTx.id, internalId: top.c.id, score: Math.min(top.score, 100), reason: top.reasons.join(' · ') });
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

    return { autoMatches, suggestionRows, partyUpdates, exactUnique: exactPairs.length };
}

/**
 * Janela de títulos que vale carregar para um extrato: 60 dias antes do primeiro
 * movimento, 5 depois do último. Parcelas de 2027–2029 nunca casam com extrato de hoje e
 * só engordam a carga. Fica aqui para os dois lados calcularem igual.
 */
export function janelaDeTitulos(datasDoExtrato: string[]): { inicio: string; fim: string } {
    const desloca = (iso: string, dias: number) =>
        new Date(new Date(`${iso}T12:00:00`).getTime() + dias * DAY).toISOString().slice(0, 10);
    const ordenadas = [...datasDoExtrato].sort();
    return { inicio: desloca(ordenadas[0], -60), fim: desloca(ordenadas[ordenadas.length - 1], 5) };
}


/** Ajustes do motor quando a organização não configurou nada. */
export const AJUSTES_PADRAO: ReconciliationEngineSettings = {
    fine_percent: 2, interest_percent_month: 1,
    value_tol_abs: 50, value_tol_pct: 3, encargos_tol_pct: 0.5,
    date_window_days: 10, auto_threshold: 100, suggestion_min: 40,
};

/**
 * Mistura o que veio das duas tabelas de configuração com os padrões.
 *
 * Está aqui, e não em cada chamador, porque o PADRÃO é decisão: `auto_threshold: 100` é o
 * que separa "concilia sozinho" de "só sugere". Deixar essa constante duplicada entre o
 * navegador e o servidor seria deixar as duas metades do motor discordarem sobre quando
 * escrever um vínculo — e ninguém perceberia até um lado conciliar o que o outro não
 * conciliaria.
 */
export function montarAjustes(
    asaas?: { fine_percent?: number | null; interest_percent_month?: number | null } | null,
    rs?: Partial<Record<keyof ReconciliationEngineSettings, number | null>> | null,
): ReconciliationEngineSettings {
    return {
        fine_percent:           asaas?.fine_percent ?? AJUSTES_PADRAO.fine_percent,
        interest_percent_month: asaas?.interest_percent_month ?? AJUSTES_PADRAO.interest_percent_month,
        value_tol_abs:          rs?.value_tol_abs ?? AJUSTES_PADRAO.value_tol_abs,
        value_tol_pct:          rs?.value_tol_pct ?? AJUSTES_PADRAO.value_tol_pct,
        encargos_tol_pct:       rs?.encargos_tol_pct ?? AJUSTES_PADRAO.encargos_tol_pct,
        date_window_days:       rs?.date_window_days ?? AJUSTES_PADRAO.date_window_days,
        auto_threshold:         rs?.auto_threshold ?? AJUSTES_PADRAO.auto_threshold,
        suggestion_min:         rs?.suggestion_min ?? AJUSTES_PADRAO.suggestion_min,
    };
}

/**
 * Monta o índice de contrapartes a partir das quatro listas cruas.
 *
 * As regras de montagem também são decisão, não transporte: o corte de 11 dígitos (CPF) é
 * o que impede um "código 12345" de virar documento; a ordem importa, porque fornecedor
 * escreve antes de cliente e a conta bancária do fornecedor só preenche o que ficou
 * vazio — quem chegar depois NÃO sobrescreve. Repetir isso em dois lugares seria repetir
 * a chance de inverter a precedência num deles.
 */
export function montarIndiceDeContrapartes(
    aliases: Array<{ alias_token: string; party_type: string; party_id?: string | null; party_name?: string | null; hit_count?: number | null }>,
    fornecedores: Array<{ id: string; name: string; document?: string | null }>,
    clientes: Array<{ id: string; name: string; document?: string | null }>,
    contasDeFornecedor: Array<{ supplier_id: string; pix_key?: string | null; pix_key_type?: string | null; beneficiary_document?: string | null }>,
): PartyIndex {
    const soDigitos = (v?: string | null) => (v || '').replace(/\D/g, '');
    const docIndex: PartyIndex['docIndex'] = new Map();
    const nomeDoFornecedor = new Map<string, string>();

    fornecedores.forEach(f => {
        nomeDoFornecedor.set(f.id, f.name);
        const d = soDigitos(f.document);
        if (d.length >= 11) docIndex.set(d, { party_id: f.id, party_type: 'SUPPLIER', party_name: f.name });
    });
    clientes.forEach(c => {
        const d = soDigitos(c.document);
        if (d.length >= 11) docIndex.set(d, { party_id: c.id, party_type: 'CLIENT', party_name: c.name });
    });
    contasDeFornecedor.forEach(a => {
        const nome = nomeDoFornecedor.get(a.supplier_id) ?? null;
        const docs = [a.beneficiary_document, (a.pix_key_type === 'cnpj' || a.pix_key_type === 'cpf') ? a.pix_key : null];
        docs.forEach(v => {
            const d = soDigitos(v);
            if (d.length >= 11 && !docIndex.has(d)) docIndex.set(d, { party_id: a.supplier_id, party_type: 'SUPPLIER', party_name: nome });
        });
    });

    return {
        docIndex,
        aliases: aliases.map(a => ({
            token: a.alias_token, party_id: a.party_id ?? undefined,
            party_type: a.party_type as 'SUPPLIER' | 'CLIENT',
            party_name: a.party_name ?? undefined, hit: a.hit_count ?? 0,
        })),
    };
}
