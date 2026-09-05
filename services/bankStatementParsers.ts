/**
 * Parsers de extrato bancário — OFX (SGML e XML), CSV, XLSX/XLS, CNAB 240/400.
 *
 * Funções PURAS (texto/buffer → linhas), sem Supabase, para serem testadas com
 * arquivos reais anonimizados em `__tests__/fixtures/extratos/`. A ingestão
 * (dedupe, gravação, regras) fica em `bankReconciliationService`.
 *
 * Por que este arquivo existe (achados de 05/09/2026 em produção):
 *  - o parser OFX antigo usava `<MEMO>(.*)` e, em OFX 2.x (XML, tag de fechamento
 *    na mesma linha), gravava "</MEMO>" dentro da descrição;
 *  - linhas "SALDO DO DIA"/"SALDO FINAL" de planilhas entravam como movimento
 *    (175 linhas, R$ 2,66 milhões de "movimento" que nunca existiu);
 *  - o CSV assumia vírgula e colunas fixas 0/1/2 — o padrão brasileiro é `;`;
 *  - o CNAB 400 forçava todo valor como débito;
 *  - o arquivo nunca dizia de QUE conta era: `BANKACCTFROM/ACCTID` era ignorado,
 *    assim como o saldo de fechamento `LEDGERBAL`, que é a única prova de que a
 *    importação está completa.
 */
import * as XLSX from 'xlsx';

export interface RawTransaction {
    /** YYYY-MM-DD */
    date: string;
    /** Negativo = débito, positivo = crédito. */
    amount: number;
    description?: string;
    memo?: string;
    /** FITID do OFX. */
    fitid?: string;
    /** Identificador do banco em outros formatos (CNAB). */
    id?: string;
}

export interface StatementHeader {
    /** BANKACCTFROM/ACCTID — número da conta segundo o banco. */
    acctId?: string;
    /** BANKACCTFROM/BANKID — código do banco (341, 748...). */
    bankId?: string;
    /** LEDGERBAL/BALAMT — saldo de fechamento informado pelo banco. */
    ledgerBalance?: number;
    /** LEDGERBAL/DTASOF — data do saldo, YYYY-MM-DD. */
    ledgerBalanceDate?: string;
    /** BANKTRANLIST/DTSTART e DTEND. */
    dtStart?: string;
    dtEnd?: string;
}

export type StatementFormat = 'OFX' | 'CSV' | 'XLSX' | 'CNAB240' | 'CNAB400';

export interface ParsedStatement {
    format: StatementFormat;
    transactions: RawTransaction[];
    header: StatementHeader;
    /** Linhas reconhecidas como saldo/total e descartadas de propósito. */
    skipped: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades compartilhadas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Linha de saldo/total de planilha — não é movimento. "SALDO" no início cobre
 * SALDO DO DIA / FINAL / ANTERIOR / INICIAL / EM CONTA / DISPONÍVEL; "TOTAL" só
 * quando a célula é só o rótulo (um lançamento real pode começar com "TOTAL ...").
 */
export function isBalanceLine(description: string): boolean {
    const d = (description || '').trim();
    return /^SALDO\b/i.test(d) || /^TOTAL(\s+(DO\s+DIA|GERAL|DE\s+CR[EÉ]DITOS?|DE\s+D[EÉ]BITOS?|DO\s+PER[IÍ]ODO))?\s*$/i.test(d);
}

/** Converte um valor monetário (number ou string BR "1.234,56" / "-123" / "(123)") para number. */
export function parseAmountBR(raw: unknown): number {
    if (typeof raw === 'number') return raw;
    let s = String(raw ?? '').trim();
    if (!s) return NaN;
    s = s.replace(/r\$/i, '').replace(/\s/g, '');
    const neg = /^-/.test(s) || /\(.*\)/.test(s) || /D$/i.test(s); // -123 · (123) · 123D
    s = s.replace(/[()]/g, '').replace(/^-/, '').replace(/[CD]$/i, '');
    if (s.includes('.') && s.includes(',')) {
        s = s.replace(/\./g, '').replace(',', '.'); // '.' milhar, ',' decimal
    } else if (s.includes(',')) {
        s = s.replace(',', '.');
    }
    const n = parseFloat(s);
    if (isNaN(n)) return NaN;
    return neg ? -n : n;
}

/** Normaliza uma data (Date, serial Excel, dd/mm/aaaa, aaaa-mm-dd, AAAAMMDD) para 'YYYY-MM-DD'. */
export function parseDateCell(raw: unknown): string | null {
    if (raw instanceof Date && !isNaN(raw.getTime())) {
        return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-${String(raw.getDate()).padStart(2, '0')}`;
    }
    if (typeof raw === 'number' && raw > 0) {
        const d = XLSX.SSF?.parse_date_code?.(raw); // serial Excel (dias desde 1899-12-30)
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
    m = s.match(/^(\d{4})(\d{2})(\d{2})/); // AAAAMMDD (OFX)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Planilha (CSV e XLSX compartilham a detecção de colunas)
// ─────────────────────────────────────────────────────────────────────────────

interface ColumnMap { date: number; amount: number; credit: number; debit: number; desc: number; type: number }

const normHeader = (v: unknown) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const reDate = /^(data|date|dt)\b|lancamento|movimento/;
const reAmount = /valor|amount|value|montante/;
const reCredit = /credito|entrada|^c$|deposito/;
const reDebit = /debito|saida|^d$|saque/;
const reDesc = /hist|descri|lancamento|memo|detalhe|complemento/;
const reType = /tipo|natureza|d\/c|c\/d|debito\/credito/;

/** Procura a linha de cabeçalho nas primeiras 20 linhas e mapeia as colunas pelo nome. */
export function detectColumns(rows: unknown[][]): { headerIdx: number; cols: ColumnMap } | null {
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const cells = (rows[i] || []).map(normHeader);
        const find = (re: RegExp) => cells.findIndex(c => re.test(c));
        const dateC = find(reDate);
        const amountC = find(reAmount);
        const creditC = find(reCredit);
        const debitC = find(reDebit);
        if (dateC >= 0 && (amountC >= 0 || (creditC >= 0 && debitC >= 0))) {
            return { headerIdx: i, cols: { date: dateC, amount: amountC, credit: creditC, debit: debitC, desc: find(reDesc), type: find(reType) } };
        }
    }
    return null;
}

/** Converte linhas de planilha (já em células) em movimentos, pulando linhas de saldo/total. */
export function rowsToTransactions(rows: unknown[][]): { transactions: RawTransaction[]; skipped: number } {
    const transactions: RawTransaction[] = [];
    let skipped = 0;
    if (rows.length === 0) return { transactions, skipped };

    const detected = detectColumns(rows);
    // Sem cabeçalho reconhecido: fallback posicional (data, valor, descrição) desde a 1ª linha —
    // a linha de cabeçalho, se existir, cai fora sozinha por não ter data.
    const cols: ColumnMap = detected?.cols ?? { date: 0, amount: 1, credit: -1, debit: -1, desc: 2, type: -1 };
    const start = detected ? detected.headerIdx + 1 : 0;

    for (let i = start; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const date = parseDateCell(row[cols.date]);
        if (!date) continue;

        const description = cols.desc >= 0 ? String(row[cols.desc] ?? '').trim() : '';
        if (isBalanceLine(description)) { skipped++; continue; }

        let amount: number;
        if (cols.amount >= 0) {
            amount = parseAmountBR(row[cols.amount]);
            if (cols.type >= 0) {
                const t = normHeader(row[cols.type]);
                if (reDebit.test(t)) amount = -Math.abs(amount);
                else if (reCredit.test(t)) amount = Math.abs(amount);
            }
        } else {
            const credit = parseAmountBR(row[cols.credit]) || 0;
            const debit = parseAmountBR(row[cols.debit]) || 0;
            amount = credit - Math.abs(debit);
        }
        if (isNaN(amount) || amount === 0) continue;

        transactions.push({ date, amount, description: description || 'Sem descrição' });
    }
    return { transactions, skipped };
}

/** XLSX/XLS: primeira aba, cabeçalho detectado pelo nome das colunas. */
export function parseXLSX(buffer: ArrayBuffer): ParsedStatement {
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return { format: 'XLSX', transactions: [], header: {}, skipped: 0 };
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    return { format: 'XLSX', header: {}, ...rowsToTransactions(rows) };
}

/** Escolhe o delimitador pela primeira linha não vazia: o que aparecer mais vezes fora de aspas. */
export function detectDelimiter(text: string): string {
    const first = text.split(/\r?\n/).find(l => l.trim()) || '';
    const count = (d: string) => splitCsvLine(first, d).length;
    const candidatos = [';', ',', '\t', '|'];
    return candidatos.reduce((best, d) => (count(d) > count(best) ? d : best), ';');
}

/** Divide uma linha CSV respeitando aspas ("descrição; com delimitador"). */
export function splitCsvLine(line: string, delimiter: string): string[] {
    const cols: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } // aspas escapadas
            else inQuotes = !inQuotes;
        } else if (ch === delimiter && !inQuotes) {
            cols.push(current.trim()); current = '';
        } else {
            current += ch;
        }
    }
    cols.push(current.trim());
    return cols;
}

/** CSV com `;` (padrão BR), `,`, tab ou `|`; cabeçalho detectado pelo nome das colunas. */
export function parseCSV(text: string): ParsedStatement {
    const clean = text.replace(/^﻿/, ''); // BOM
    const delimiter = detectDelimiter(clean);
    const rows = clean.split(/\r?\n/).filter(l => l.trim()).map(l => splitCsvLine(l, delimiter));
    return { format: 'CSV', header: {}, ...rowsToTransactions(rows) };
}

// ─────────────────────────────────────────────────────────────────────────────
// OFX — tokenizador (SGML 1.x sem fechamento de folha; XML 2.x com fechamento)
// ─────────────────────────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
    return s
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function parseOfxAmount(raw: string): number {
    let s = raw.trim().replace(/\s/g, '');
    if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    return parseFloat(s);
}

type OfxNode = Record<string, string>;

/**
 * OFX por tokens. Folha = tag seguida de texto; agregado = tag seguida de outra
 * tag. Uma tag de fechamento só desempilha se o nome estiver na pilha — é o que
 * faz `<MEMO>abc</MEMO>` (XML) não derrubar o `<STMTTRN>` aberto e não deixar
 * "</MEMO>" no texto, como o regex antigo deixava.
 */
export function parseOFX(text: string): ParsedStatement {
    const body = text.slice(Math.max(0, text.search(/<OFX>/i)));
    const tokenRe = /<(\/?)([A-Za-z0-9_.:-]+)\s*\/?>([^<]*)/g;

    const transactions: RawTransaction[] = [];
    const header: StatementHeader = {};
    const stack: { name: string; node: OfxNode }[] = [];
    const current = () => stack[stack.length - 1]?.node;

    const closeAggregate = (name: string) => {
        const idx = stack.map(s => s.name).lastIndexOf(name);
        if (idx === -1) return; // fechamento de folha (XML) — ignora
        const popped = stack.splice(idx);
        const agg = popped[0];
        if (agg.name === 'STMTTRN') {
            const t = agg.node;
            const dtPosted = t.DTPOSTED ? parseDateCell(t.DTPOSTED) : null;
            const amount = t.TRNAMT !== undefined ? parseOfxAmount(t.TRNAMT) : NaN;
            if (dtPosted && !isNaN(amount)) {
                let memo = (t.MEMO || '').trim();
                const extras: string[] = [];
                if (t.NAME) extras.push(`Nome: ${t.NAME.trim()}`);
                if (t.CHECKNUM) extras.push(`Doc: ${t.CHECKNUM.trim()}`);
                if (t.REFNUM) extras.push(`Ref: ${t.REFNUM.trim()}`);
                if (extras.length > 0) memo = memo ? `${memo} (${extras.join(' | ')})` : extras.join(' | ');
                transactions.push({ date: dtPosted, amount, fitid: t.FITID?.trim() || undefined, memo });
            }
        } else if (agg.name === 'BANKACCTFROM' || agg.name === 'CCACCTFROM') {
            if (agg.node.ACCTID) header.acctId = agg.node.ACCTID.trim();
            if (agg.node.BANKID) header.bankId = agg.node.BANKID.trim();
        } else if (agg.name === 'LEDGERBAL') {
            const bal = agg.node.BALAMT !== undefined ? parseOfxAmount(agg.node.BALAMT) : NaN;
            if (!isNaN(bal)) header.ledgerBalance = bal;
            const d = agg.node.DTASOF ? parseDateCell(agg.node.DTASOF) : null;
            if (d) header.ledgerBalanceDate = d;
        } else if (agg.name === 'BANKTRANLIST') {
            const s = agg.node.DTSTART ? parseDateCell(agg.node.DTSTART) : null;
            const e = agg.node.DTEND ? parseDateCell(agg.node.DTEND) : null;
            if (s) header.dtStart = s;
            if (e) header.dtEnd = e;
        }
    };

    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(body)) !== null) {
        const [, slash, rawName, rawText] = m;
        const name = rawName.toUpperCase();
        const textValue = decodeEntities(rawText).trim();
        if (slash) { closeAggregate(name); continue; }
        if (textValue) {
            const node = current();
            if (node) node[name] = textValue; // folha
        } else {
            stack.push({ name, node: {} }); // agregado
        }
    }
    // SGML sem fechamento final (arquivo truncado): fecha o que ficou aberto.
    while (stack.length) closeAggregate(stack[stack.length - 1].name);

    return { format: 'OFX', transactions, header, skipped: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// CNAB (posições FEBRABAN; 400 ainda SEM arquivo de referência — ver plano 1.3)
// ─────────────────────────────────────────────────────────────────────────────

export function parseCNAB240(text: string): ParsedStatement {
    const transactions: RawTransaction[] = [];
    for (const line of text.split('\n')) {
        // Segmento 'E' — detalhe do extrato
        if (line.substring(7, 8) === '3' && line.substring(13, 14) === 'E') {
            const dateRaw = line.substring(142, 150);
            const amount = parseInt(line.substring(150, 168), 10) / 100;
            const desc = line.substring(113, 142).trim();
            const type = line.substring(168, 169); // D=Débito, C=Crédito
            const memo = line.substring(175, 230).trim();
            const date = `${dateRaw.substring(4, 8)}-${dateRaw.substring(2, 4)}-${dateRaw.substring(0, 2)}`;
            if (isNaN(amount)) continue;
            transactions.push({
                date,
                amount: type === 'D' ? -amount : amount,
                description: desc || memo,
                memo,
                id: line.substring(183, 203).trim() || undefined,
            });
        }
    }
    return { format: 'CNAB240', transactions, header: {}, skipped: 0 };
}

/**
 * CNAB 400 — retorno de cobrança (registro tipo 1). Liquidação de cobrança é
 * dinheiro que ENTRA: crédito. O parser antigo forçava `-amount` (débito) para
 * tudo. Formato marcado como "não verificado" na UI até existir fixture real.
 */
export function parseCNAB400(text: string): ParsedStatement {
    const transactions: RawTransaction[] = [];
    for (const line of text.split('\n')) {
        if (line.substring(0, 1) !== '1') continue;
        const dateRaw = line.substring(110, 116); // DDMMYY
        const amount = parseInt(line.substring(152, 165), 10) / 100;
        const desc = line.substring(116, 152).trim();
        if (isNaN(amount) || dateRaw.trim().length < 6) continue;
        transactions.push({
            date: `20${dateRaw.substring(4, 6)}-${dateRaw.substring(2, 4)}-${dateRaw.substring(0, 2)}`,
            amount: Math.abs(amount),
            description: desc,
            id: line.substring(37, 62).trim() || undefined,
        });
    }
    return { format: 'CNAB400', transactions, header: {}, skipped: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrada única por arquivo
// ─────────────────────────────────────────────────────────────────────────────

/** Lê o arquivo pelo nome/extensão. Lança se a extensão não for reconhecida. */
export async function parseStatementFile(file: File): Promise<ParsedStatement> {
    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        return parseXLSX(await file.arrayBuffer());
    }
    if (name.endsWith('.ofx')) {
        // OFX de bancos brasileiros costuma vir em Windows-1252/ISO-8859-1
        const buffer = await file.arrayBuffer();
        let text: string;
        try { text = new TextDecoder('windows-1252').decode(buffer); }
        catch { text = new TextDecoder('utf-8').decode(buffer); }
        return parseOFX(text);
    }
    const text = await file.text();
    if (name.endsWith('.csv')) return parseCSV(text);
    if (name.endsWith('.ret') || name.endsWith('.txt') || name.endsWith('.cnab')) {
        const firstLine = text.split('\n')[0] || '';
        return firstLine.length >= 400 ? parseCNAB400(text) : parseCNAB240(text);
    }
    throw new Error(`Formato não reconhecido: ${file.name}. Aceitos: OFX, CSV, XLSX/XLS, CNAB (.ret/.txt).`);
}

/** Só dígitos — para comparar ACCTID do OFX com o número da conta cadastrado. */
export const onlyDigits = (v?: string | null) => (v || '').replace(/\D/g, '');

/**
 * O arquivo é desta conta? Compara os dígitos: um termina com o outro (o OFX
 * costuma trazer agência+conta+dígito, o cadastro só conta+dígito ou vice-versa).
 * Sem número cadastrado, não há como conferir: devolve `null` (aviso, não erro).
 */
export function accountMatches(ofxAcctId: string | undefined, registeredAccountNumber: string | null | undefined): boolean | null {
    const a = onlyDigits(ofxAcctId);
    const b = onlyDigits(registeredAccountNumber);
    if (!a || !b) return null;
    return a.endsWith(b) || b.endsWith(a);
}
