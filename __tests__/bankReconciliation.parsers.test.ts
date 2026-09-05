/**
 * Parsers de extrato — item 1.3 do plano docs/planos/2026-09-05-conciliacao-bancaria-plano-execucao.md.
 *
 * Fixtures aqui são SINTÉTICAS, escritas a partir dos defeitos vistos em produção
 * (descrição com "</MEMO>", linhas "SALDO DO DIA" como movimento, CSV com `;`).
 * Quando o usuário fornecer arquivos reais anonimizados (Itaú OFX, Sicredi OFX/XLSX/CSV),
 * eles entram em `__tests__/fixtures/extratos/` e ganham um `describe` próprio com
 * contagem de linhas, soma de débitos/créditos e saldo do cabeçalho conferidos à mão.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
    parseOFX, parseCSV, parseXLSX, parseCNAB400, detectDelimiter, splitCsvLine,
    isBalanceLine, accountMatches, parseAmountBR, parseDateCell, parseStatementFile,
} from '../services/bankStatementParsers';

// ── OFX 1.x (SGML, sem fechamento de folha) — estilo Itaú ────────────────────
const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20260131120000[-3:BRT]
<LANGUAGE>POR
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>0341
<BRANCHID>1234
<ACCTID>12345-6
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260101
<DTEND>20260131
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260128
<TRNAMT>-16.00
<FITID>2026012800001
<MEMO>PAGAMENTO PIX SICREDI-CX140166  07593144000148 REGINALDO BEN
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260129
<TRNAMT>1500.50
<FITID>2026012900002
<CHECKNUM>000123
<NAME>CLIENTE EXEMPLO LTDA
<MEMO>TED RECEBIDA
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260130
<TRNAMT>-250,75
<FITID>2026013000003
<MEMO>TARIFA &amp; PACOTE
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>10234.56
<DTASOF>20260131
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

// ── OFX 2.x (XML, tag de fechamento na MESMA linha) — estilo Sicredi ─────────
const OFX_XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<?OFX OFXHEADER="200" VERSION="220" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><DTSERVER>20260131</DTSERVER><LANGUAGE>POR</LANGUAGE></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1</TRNUID><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>
<STMTRS><CURDEF>BRL</CURDEF>
<BANKACCTFROM><BANKID>748</BANKID><BRANCHID>0710</BRANCHID><ACCTID>07101234567</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260101</DTSTART><DTEND>20260131</DTEND>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260127</DTPOSTED><TRNAMT>-50.00</TRNAMT><FITID>20921891190</FITID><REFNUM>20921891190</REFNUM><MEMO>INTEGR.CAPITAL SUBSCRITO-1         </MEMO></STMTTRN>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260128</DTPOSTED><TRNAMT>-16.00</TRNAMT><FITID>A1</FITID><MEMO>PAGAMENTO PIX-PIX_DEB   11866633000101 EMPORIUM DOS PAES</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260129</DTPOSTED><TRNAMT>16.00</TRNAMT><FITID>A2</FITID><MEMO></MEMO><NAME>SEM MEMO</NAME></STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>-1200.10</BALAMT><DTASOF>20260131120000</DTASOF></LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('parseOFX — SGML (OFX 1.x)', () => {
    const r = parseOFX(OFX_SGML);

    it('lê as 3 transações com data, sinal e FITID', () => {
        expect(r.format).toBe('OFX');
        expect(r.transactions).toHaveLength(3);
        expect(r.transactions[0]).toMatchObject({ date: '2026-01-28', amount: -16, fitid: '2026012800001' });
        expect(r.transactions[1]).toMatchObject({ date: '2026-01-29', amount: 1500.5, fitid: '2026012900002' });
    });

    it('aceita vírgula decimal no TRNAMT e decodifica entidades', () => {
        expect(r.transactions[2].amount).toBe(-250.75);
        expect(r.transactions[2].memo).toBe('TARIFA & PACOTE');
    });

    it('mantém o formato antigo de memo + extras (Nome | Doc | Ref) para o fingerprint não mudar', () => {
        expect(r.transactions[1].memo).toBe('TED RECEBIDA (Nome: CLIENTE EXEMPLO LTDA | Doc: 000123)');
    });

    it('lê o cabeçalho: conta, banco, saldo de fechamento e período', () => {
        expect(r.header).toEqual({
            acctId: '12345-6', bankId: '0341',
            ledgerBalance: 10234.56, ledgerBalanceDate: '2026-01-31',
            dtStart: '2026-01-01', dtEnd: '2026-01-31',
        });
    });
});

describe('parseOFX — XML (OFX 2.x, fechamento na mesma linha)', () => {
    const r = parseOFX(OFX_XML);

    it('nunca deixa "</MEMO>" dentro da descrição (defeito real de produção)', () => {
        for (const t of r.transactions) expect(t.memo).not.toMatch(/<\/?[A-Z]+>/);
        expect(r.transactions[0].memo).toBe('INTEGR.CAPITAL SUBSCRITO-1 (Ref: 20921891190)');
    });

    it('lê as 3 transações mesmo com tudo numa linha', () => {
        expect(r.transactions).toHaveLength(3);
        expect(r.transactions[1].memo).toBe('PAGAMENTO PIX-PIX_DEB   11866633000101 EMPORIUM DOS PAES');
    });

    it('MEMO vazio com NAME vira só o extra', () => {
        expect(r.transactions[2].memo).toBe('Nome: SEM MEMO');
        expect(r.transactions[2].amount).toBe(16);
    });

    it('lê saldo negativo e ACCTID sem máscara', () => {
        expect(r.header.acctId).toBe('07101234567');
        expect(r.header.ledgerBalance).toBe(-1200.1);
        expect(r.header.ledgerBalanceDate).toBe('2026-01-31');
    });
});

describe('accountMatches — o arquivo é desta conta?', () => {
    it('OFX com agência+conta termina com a conta cadastrada', () => {
        expect(accountMatches('07101234567', '1234567')).toBe(true);
        expect(accountMatches('07101234567', '12345-67')).toBe(true);
    });
    it('conta diferente é recusada', () => {
        expect(accountMatches('07101234567', '99999-9')).toBe(false);
    });
    it('sem número cadastrado (ou sem ACCTID) não dá para conferir → null', () => {
        expect(accountMatches('07101234567', null)).toBeNull();
        expect(accountMatches(undefined, '1234')).toBeNull();
        expect(accountMatches('07101234567', '')).toBeNull();
    });
});

describe('parseCSV — padrão brasileiro', () => {
    const CSV_PONTO_VIRGULA = [
        'Data;Histórico;Valor;Saldo',
        '02/01/2026;"PIX ENVIADO; JOAO DA SILVA";-1.234,56;10.000,00',
        '03/01/2026;TED RECEBIDA CLIENTE X;2.500,00;12.500,00',
        '03/01/2026;SALDO DO DIA;12.500,00;',
        '31/01/2026;SALDO FINAL DISPONIVEL;12.500,00;',
        '04/01/2026;TARIFA PACOTE;-29,90;12.470,10',
    ].join('\r\n');

    it('detecta `;` como delimitador', () => {
        expect(detectDelimiter(CSV_PONTO_VIRGULA)).toBe(';');
        expect(detectDelimiter('Data,Valor,Descrição\n01/01/2026,10,X')).toBe(',');
    });

    it('respeita aspas: o `;` dentro da descrição não quebra a coluna', () => {
        expect(splitCsvLine('02/01/2026;"PIX ENVIADO; JOAO";-1.234,56', ';')).toEqual(['02/01/2026', 'PIX ENVIADO; JOAO', '-1.234,56']);
        expect(splitCsvLine('a;"diz ""oi"" aqui";b', ';')).toEqual(['a', 'diz "oi" aqui', 'b']);
    });

    it('lê 3 movimentos, pula 2 linhas de saldo e converte número BR', () => {
        const r = parseCSV(CSV_PONTO_VIRGULA);
        expect(r.transactions).toHaveLength(3);
        expect(r.skipped).toBe(2);
        expect(r.transactions[0]).toEqual({ date: '2026-01-02', amount: -1234.56, description: 'PIX ENVIADO; JOAO DA SILVA' });
        expect(r.transactions[2].amount).toBe(-29.9);
    });

    it('CSV legado com vírgula e colunas fixas (data, valor, descrição) continua funcionando', () => {
        const r = parseCSV('data,valor,descricao\n2026-01-05,100.00,DEPOSITO\n2026-01-06,-40.00,SAQUE');
        expect(r.transactions).toHaveLength(2);
        expect(r.transactions[1]).toMatchObject({ date: '2026-01-06', amount: -40, description: 'SAQUE' });
    });

    it('colunas Crédito/Débito separadas', () => {
        const r = parseCSV('Data;Lançamento;Crédito;Débito\n10/02/2026;RECEBIMENTO;500,00;\n11/02/2026;PAGAMENTO;;300,00');
        expect(r.transactions.map(t => t.amount)).toEqual([500, -300]);
    });
});

describe('parseXLSX', () => {
    it('lê a primeira aba, detecta o cabeçalho e pula linhas de saldo', () => {
        const ws = XLSX.utils.aoa_to_sheet([
            ['Extrato conta corrente', '', ''],
            ['Data', 'Descrição', 'Valor'],
            ['05/03/2026', 'SALDO ANTERIOR', 5000],
            ['05/03/2026', 'PIX RECEBIDO FULANO', 1200.5],
            ['06/03/2026', 'BOLETO ENERGIA', '-350,40'],
            ['06/03/2026', 'SALDO DO DIA', 5850.1],
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Extrato');
        const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

        const r = parseXLSX(buf);
        expect(r.format).toBe('XLSX');
        expect(r.skipped).toBe(2);
        expect(r.transactions).toEqual([
            { date: '2026-03-05', amount: 1200.5, description: 'PIX RECEBIDO FULANO' },
            { date: '2026-03-06', amount: -350.4, description: 'BOLETO ENERGIA' },
        ]);
    });
});

describe('isBalanceLine', () => {
    it('reconhece as variantes de saldo e o TOTAL isolado', () => {
        for (const s of ['SALDO DO DIA', 'Saldo anterior', ' SALDO FINAL DISPONIVEL', 'SALDO EM CONTA', 'TOTAL', 'Total do dia']) {
            expect(isBalanceLine(s)).toBe(true);
        }
    });
    it('não confunde com lançamento real', () => {
        for (const s of ['PAGAMENTO SALDO DEVEDOR', 'TOTAL ENERGIA LTDA', 'PIX SALDO CONSTRUCOES', '']) {
            expect(isBalanceLine(s)).toBe(false);
        }
    });
});

describe('parseCNAB400 — retorno de cobrança é crédito', () => {
    it('não força mais o valor como débito', () => {
        // registro tipo 1, ≥ 400 colunas: nosso número em 37–62, data DDMMYY em 110–116, valor em 152–165
        let line = '1'.padEnd(37, ' ');
        line += 'NN0000000000001'.padEnd(25, ' ');           // 37–62 id
        line = line.padEnd(110, ' ') + '150126';             // 110–116 data 15/01/2026
        line = line.padEnd(116, ' ') + 'LIQUIDACAO TITULO'.padEnd(36, ' ');
        line = line.padEnd(152, ' ') + '0000000012345';      // 152–165 valor 123,45
        line = line.padEnd(400, ' ');
        const r = parseCNAB400(line + '\n');
        expect(r.format).toBe('CNAB400');
        expect(r.transactions).toHaveLength(1);
        expect(r.transactions[0]).toMatchObject({ date: '2026-01-15', amount: 123.45, id: 'NN0000000000001' });
    });
});

describe('utilidades', () => {
    it('parseAmountBR', () => {
        expect(parseAmountBR('1.234,56')).toBe(1234.56);
        expect(parseAmountBR('-12,5')).toBe(-12.5);
        expect(parseAmountBR('(300)')).toBe(-300);
        expect(parseAmountBR('R$ 99,90')).toBe(99.9);
        expect(parseAmountBR('150,00 D')).toBe(-150);
        expect(parseAmountBR('150,00 C')).toBe(150);
        expect(parseAmountBR(7)).toBe(7);
        expect(parseAmountBR('')).toBeNaN();
    });
    it('parseDateCell', () => {
        expect(parseDateCell('05/03/2026')).toBe('2026-03-05');
        expect(parseDateCell('5/3/26')).toBe('2026-03-05');
        expect(parseDateCell('2026-03-05T00:00:00')).toBe('2026-03-05');
        expect(parseDateCell('20260305120000[-3:BRT]')).toBe('2026-03-05');
        expect(parseDateCell('')).toBeNull();
        expect(parseDateCell('SALDO')).toBeNull();
    });
    it('parseStatementFile recusa extensão desconhecida com mensagem clara', async () => {
        const f = new File(['x'], 'extrato.pdf');
        await expect(parseStatementFile(f)).rejects.toThrow(/Formato não reconhecido/);
    });
    it('parseStatementFile roteia .ofx e .csv', async () => {
        const ofx = await parseStatementFile(new File([OFX_XML], 'sicredi.ofx'));
        expect(ofx.format).toBe('OFX');
        expect(ofx.transactions).toHaveLength(3);
        const csv = await parseStatementFile(new File(['Data;Valor;Histórico\n01/02/2026;10,00;X'], 'a.csv'));
        expect(csv.transactions).toHaveLength(1);
    });
});
