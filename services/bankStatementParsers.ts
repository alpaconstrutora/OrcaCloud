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
 *  - (15/09/2026) o ".xls" do Itaú é HTML e as datas vêm "dd/mm" sem ano: oito
 *    importações seguidas com 0 linhas e a tela dizendo "extrato inválido". Daí o
 *    parser HTML, a data de referência para o ano e o campo `avisos`.
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
    /**
     * Por que o parser devolveu menos do que o arquivo parecia ter (datas sem ano,
     * datas ilegíveis, HTML sem tabela). Vazio quando não há o que explicar. É o que
     * impede "0 transações" de virar "extrato inválido" na tela.
     */
    avisos: string[];
}

/** Data de referência para resolver `dd/mm` sem ano: o movimento nunca é DEPOIS dela. */
export interface DataReferencia { y: number; m: number; d: number }

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
        // O ÚLTIMO separador é o decimal: "1.234,56" (BR) · "1,013.21" (US — o HTML do
        // Itaú vem assim, e a regra antiga lia 1,013.21 como 1.01321).
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
        else s = s.replace(/,/g, '');
    } else if (s.includes(',')) {
        s = s.replace(',', '.');
    }
    const n = parseFloat(s);
    if (isNaN(n)) return NaN;
    return neg ? -n : n;
}

/**
 * Normaliza uma data (Date, serial Excel, dd/mm/aaaa, aaaa-mm-dd, AAAAMMDD) para 'YYYY-MM-DD'.
 *
 * `dd/mm` SEM ano (Itaú exporta assim) só resolve com `ref`: o ano é o da referência,
 * ou o anterior quando dd/mm cai depois dela — extrato de dezembro extraído em janeiro.
 * Sem referência devolve null, e quem chama conta a linha como "sem ano".
 */
export function parseDateCell(raw: unknown, ref?: DataReferencia | null): string | null {
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
    m = s.match(/^(\d{1,2})[-/](\d{1,2})$/); // dd/mm sem ano
    if (m && ref) {
        const dd = Number(m[1]), mm = Number(m[2]);
        if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
        const depoisDaRef = mm > ref.m || (mm === ref.m && dd > ref.d);
        const year = depoisDaRef ? ref.y - 1 : ref.y;
        return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
    return null;
}

/** `dd/mm` sem ano? (só para contar o que foi perdido por falta de referência) */
export const isDateSemAno = (raw: unknown): boolean => /^\d{1,2}[-/]\d{1,2}$/.test(String(raw ?? '').trim());

const ultimoDiaDoMes = (y: number, m: number) => new Date(y, m, 0).getDate();

/**
 * De onde tirar o ano quando as datas vêm `dd/mm`:
 *  1. uma data completa nas primeiras linhas da planilha (Itaú: "Data: 04/04/2019",
 *     que é a data da extração — limite superior perfeito);
 *  2. o nome do arquivo: `dd-mm-aaaa`, `mm-aaaa`, `aaaa-mm`, `mm-aa` (03-19.xls) ou um
 *     ano solto; mês/ano vira o último dia do mês.
 * Nada disso → null, e o parser avisa em vez de perder as linhas em silêncio.
 */
export function inferirDataDeReferencia(rows: unknown[][], fileName?: string): DataReferencia | null {
    for (const row of rows.slice(0, 20)) {
        for (const cell of row || []) {
            if (cell instanceof Date && !isNaN(cell.getTime())) {
                return { y: cell.getFullYear(), m: cell.getMonth() + 1, d: cell.getDate() };
            }
            const m = String(cell ?? '').match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
            if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return { y: Number(m[3]), m: Number(m[2]), d: Number(m[1]) };
        }
    }
    const nome = (fileName ?? '').replace(/\.[^.]+$/, '');
    let m = nome.match(/(\d{1,2})[-_. ](\d{1,2})[-_. ]((?:19|20)\d{2})/);           // dd-mm-aaaa
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return { y: Number(m[3]), m: Number(m[2]), d: Number(m[1]) };
    m = nome.match(/(?:^|\D)(\d{1,2})[-_. ]?((?:19|20)\d{2})(?:\D|$)/);               // mm-aaaa
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return { y: Number(m[2]), m: Number(m[1]), d: ultimoDiaDoMes(Number(m[2]), Number(m[1])) };
    m = nome.match(/((?:19|20)\d{2})[-_. ]?(\d{1,2})(?:\D|$)/);                       // aaaa-mm
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return { y: Number(m[1]), m: Number(m[2]), d: ultimoDiaDoMes(Number(m[1]), Number(m[2])) };
    m = nome.match(/(?:^|\D)(\d{1,2})[-_. ](\d{2})(?:\D|$)/);                          // mm-aa (03-19)
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return { y: 2000 + Number(m[2]), m: Number(m[1]), d: ultimoDiaDoMes(2000 + Number(m[2]), Number(m[1])) };
    m = nome.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);                                // ano solto
    if (m) return { y: Number(m[1]), m: 12, d: 31 };
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

export interface PlanilhaOptions {
    /** Nome do arquivo — pista de mês/ano quando as datas vêm `dd/mm`. */
    fileName?: string;
}

/**
 * Converte linhas de planilha (já em células) em movimentos, pulando linhas de saldo/total.
 * Devolve também `avisos` quando perdeu linhas por um motivo que o usuário precisa saber.
 */
export function rowsToTransactions(rows: unknown[][], opts: PlanilhaOptions = {}): { transactions: RawTransaction[]; skipped: number; avisos: string[] } {
    const transactions: RawTransaction[] = [];
    const avisos: string[] = [];
    let skipped = 0;
    if (rows.length === 0) return { transactions, skipped, avisos: ['o arquivo não tem nenhuma linha.'] };

    const detected = detectColumns(rows);
    // Sem cabeçalho reconhecido: fallback posicional (data, valor, descrição) desde a 1ª linha —
    // a linha de cabeçalho, se existir, cai fora sozinha por não ter data.
    const cols: ColumnMap = detected?.cols ?? { date: 0, amount: 1, credit: -1, debit: -1, desc: 2, type: -1 };
    const start = detected ? detected.headerIdx + 1 : 0;
    const ref = inferirDataDeReferencia(rows, opts.fileName);

    let semAno = 0;
    let dataIlegivel = 0;
    let exemploIlegivel = '';

    for (let i = start; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const rawDate = row[cols.date];
        const date = parseDateCell(rawDate, ref);
        if (!date) {
            if (isDateSemAno(rawDate)) semAno++;
            else if (String(rawDate ?? '').trim()) { dataIlegivel++; exemploIlegivel ||= String(rawDate).trim(); }
            continue;
        }

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

    // Linha com `dd/mm` e nenhuma referência de ano é movimento REAL perdido — avisa sempre.
    if (semAno > 0) {
        avisos.push(`${semAno} linha(s) têm data sem ano (ex.: "01/03") e nem o arquivo nem o nome dele dizem o ano. Renomeie o arquivo com mês e ano (ex.: "03-2019.xlsx") ou exporte em OFX.`);
    }
    // Data ilegível só explica quando NADA foi lido — rodapé de planilha com texto na
    // coluna de data é normal e não merece alarme.
    if (transactions.length === 0 && dataIlegivel > 0) {
        avisos.push(`${dataIlegivel} linha(s) com data em formato não reconhecido (ex.: "${exemploIlegivel}"). Aceitos: dd/mm/aaaa, aaaa-mm-dd, data do Excel.`);
    }
    if (transactions.length === 0 && !detected && avisos.length === 0) {
        avisos.push('não encontrei um cabeçalho com colunas de data e valor nas 20 primeiras linhas.');
    }
    return { transactions, skipped, avisos };
}

/**
 * Cabeçalho de planilha de extrato (Itaú: "Agência:" 7824 / "Conta:" 12263-9, ou
 * "Agência/Conta:" "7824/12263-9") → `acctId`, para `accountMatches` recusar arquivo
 * de outra conta também em Excel/HTML, não só em OFX.
 */
export function extrairContaDoCabecalho(rows: unknown[][]): StatementHeader {
    const header: StatementHeader = {};
    const primeiraCelulaCheia = (row: unknown[], apos: number) =>
        row.slice(apos + 1).map(c => String(c ?? '').trim()).find(Boolean) ?? '';
    for (const row of rows.slice(0, 20)) {
        const cells = (row || []).map(c => String(c ?? '').trim());
        for (let i = 0; i < cells.length; i++) {
            const rotulo = normHeader(cells[i]);
            if (/^ag(encia)?\.?\s*\/\s*conta:?$/.test(rotulo) || /^conta( corrente)?:?$/.test(rotulo)) {
                const v = primeiraCelulaCheia(row, i).replace(/\s+/g, '');
                if (/\d/.test(v)) { header.acctId = v; return header; }
            }
        }
    }
    return header;
}

/** XLSX/XLS: primeira aba, cabeçalho detectado pelo nome das colunas. */
export function parseXLSX(buffer: ArrayBuffer, opts: PlanilhaOptions = {}): ParsedStatement {
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return { format: 'XLSX', transactions: [], header: {}, skipped: 0, avisos: ['a planilha não tem nenhuma aba.'] };
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    return { format: 'XLSX', header: extrairContaDoCabecalho(rows), ...rowsToTransactions(rows, opts) };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML disfarçado de .xls (Itaú exporta "Excel" assim: <html xmlns:x=...>)
// ─────────────────────────────────────────────────────────────────────────────

function decodeHtmlText(s: string): string {
    return s
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Tabela(s) HTML → linhas de células, como `sheet_to_json(header: 1)` faria.
 * Trata o que o `XLSX.read` não trata no arquivo do Itaú: `<td />` auto-fechado
 * (sem ele as colunas desalinham), `colspan`, e o atributo `x:num="-35.00"`, que
 * traz o valor limpo quando existe.
 */
export function parseHTMLTable(html: string): unknown[][] {
    const corpo = html
        .slice(Math.max(0, html.search(/<body\b/i)))
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
    const rows: unknown[][] = [];
    const reTr = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    const reTd = /<t([dh])\b([^>]*?)(\/?)>/gi;
    let tr: RegExpExecArray | null;
    while ((tr = reTr.exec(corpo))) {
        const conteudo = tr[1];
        const cells: unknown[] = [];
        let td: RegExpExecArray | null;
        reTd.lastIndex = 0;
        while ((td = reTd.exec(conteudo))) {
            const attrs = td[2];
            let valor: unknown;
            if (td[3] === '/') {
                valor = '';
            } else {
                const inicio = td.index + td[0].length;
                const fecha = conteudo.slice(inicio).search(new RegExp(`</t${td[1]}\\b|<t[dh]\\b`, 'i'));
                const inner = fecha >= 0 ? conteudo.slice(inicio, inicio + fecha) : conteudo.slice(inicio);
                const xnum = attrs.match(/\bx:num="([^"]*)"/i);
                valor = xnum && xnum[1] !== '' && !isNaN(Number(xnum[1])) ? Number(xnum[1]) : decodeHtmlText(inner);
            }
            cells.push(valor);
            const span = Number((attrs.match(/\bcolspan="?(\d+)/i) || [])[1] || 1);
            for (let k = 1; k < span; k++) cells.push('');
        }
        if (cells.length > 0) rows.push(cells);
    }
    return rows;
}

/** Extrato em HTML (com qualquer extensão). */
export function parseHTML(html: string, opts: PlanilhaOptions = {}): ParsedStatement {
    const rows = parseHTMLTable(html);
    if (rows.length === 0) {
        return { format: 'XLSX', transactions: [], header: {}, skipped: 0, avisos: ['o arquivo é uma página HTML sem tabela de lançamentos.'] };
    }
    return { format: 'XLSX', header: extrairContaDoCabecalho(rows), ...rowsToTransactions(rows, opts) };
}

/** É HTML? Olha os primeiros bytes, não a extensão — o Itaú chama de .xls. */
export function pareceHTML(buffer: ArrayBuffer): boolean {
    const inicio = new TextDecoder('latin1').decode(buffer.slice(0, 512)).replace(/^\uFEFF/, '').trimStart();
    return /^(<!doctype\s+html|<html|<table|<\?xml[^>]*>\s*<html)/i.test(inicio);
}

/** Decodifica pelo charset do <meta>, ou windows-1252 (padrão dos bancos brasileiros). */
export function decodeHTMLBuffer(buffer: ArrayBuffer): string {
    const cabeca = new TextDecoder('latin1').decode(buffer.slice(0, 4096));
    const charset = (cabeca.match(/charset=["']?([\w-]+)/i) || [])[1] || 'windows-1252';
    try { return new TextDecoder(charset).decode(buffer); }
    catch { return new TextDecoder('windows-1252').decode(buffer); }
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
export function parseCSV(text: string, opts: PlanilhaOptions = {}): ParsedStatement {
    const clean = text.replace(/^﻿/, ''); // BOM
    const delimiter = detectDelimiter(clean);
    const rows = clean.split(/\r?\n/).filter(l => l.trim()).map(l => splitCsvLine(l, delimiter));
    return { format: 'CSV', header: {}, ...rowsToTransactions(rows, opts) };
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

    return { format: 'OFX', transactions, header, skipped: 0, avisos: [] };
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
    return { format: 'CNAB240', transactions, header: {}, skipped: 0, avisos: [] };
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
    return { format: 'CNAB400', transactions, header: {}, skipped: 0, avisos: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrada única por arquivo
// ─────────────────────────────────────────────────────────────────────────────

/** Lê o arquivo pelo nome/extensão. Lança se a extensão não for reconhecida. */
export async function parseStatementFile(file: File): Promise<ParsedStatement> {
    const name = file.name.toLowerCase();
    const opts: PlanilhaOptions = { fileName: file.name };
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.html') || name.endsWith('.htm')) {
        const buffer = await file.arrayBuffer();
        // O "Excel" do Itaú é HTML: o XLSX.read abre sem erro e devolve zero linhas.
        if (pareceHTML(buffer)) return parseHTML(decodeHTMLBuffer(buffer), opts);
        return parseXLSX(buffer, opts);
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
    if (name.endsWith('.csv')) return parseCSV(text, opts);
    if (name.endsWith('.ret') || name.endsWith('.txt') || name.endsWith('.cnab')) {
        const firstLine = text.split('\n')[0] || '';
        return firstLine.length >= 400 ? parseCNAB400(text) : parseCNAB240(text);
    }
    throw new Error(`Formato não reconhecido: ${file.name}. Aceitos: OFX, CSV, XLSX/XLS, HTML, CNAB (.ret/.txt).`);
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
