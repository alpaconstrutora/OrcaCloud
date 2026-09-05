/**
 * Fingerprint v2 do extrato bancário — item 1.2 do plano
 * docs/planos/2026-09-05-conciliacao-bancaria-plano-execucao.md.
 *
 * O fingerprint antigo era `btoa(...).substring(0, 32)`: 24 bytes de TEXTO, não um
 * hash. Dois PIX de R$ 16 no mesmo dia para contrapartes diferentes colidiam e o
 * segundo era descartado como duplicata (45 casos reais em produção, 09/2026).
 *
 * Estes testes travam três coisas:
 *   1. a cadeia canônica é exatamente a que a migration
 *      aplicar_20270919000013_bank_tx_fingerprint_v2.sql recalcula em SQL;
 *   2. o SHA-256 do TypeScript bate byte a byte com o do Postgres
 *      (vetor colhido com `encode(sha256(convert_to(...,'UTF8')),'hex')`);
 *   3. o caso real de colisão agora separa, e linhas idênticas no mesmo arquivo
 *      sobrevivem pelo ordinal.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { bankReconciliationService } from '../services/bankReconciliationService';

const CONTA = '11111111-2222-3333-4444-555555555555';
const REGINALDO = 'PAGAMENTO PIX SICREDI-CX140166  07593144000148 REGINALDO BEN';
const EMPORIUM = 'PAGAMENTO PIX-PIX_DEB   11866633000101 EMPORIUM DOS PAES';

// SELECT encode(sha256(convert_to('<cadeia>','UTF8')),'hex') — rodado em produção em 05/09/2026.
const VETOR_SQL = 'da9188787ba6c228a4c64644686969e7d8bcf4f55fea8716acd3a563eaccc226';

describe('fingerprint v2 — cadeia canônica', () => {
    it('monta a cadeia na ordem conta|data|valor(2 casas)|direção|descrição(trim)|ordinal', () => {
        const s = bankReconciliationService.fingerprintCanonical({
            bankAccountId: CONTA, date: '2026-01-28', amount: 16, direction: 'DEBIT',
            description: `  ${REGINALDO}  `, ordinal: 1,
        });
        expect(s).toBe(`${CONTA}|2026-01-28|16.00|DEBIT|${REGINALDO}|1`);
    });

    it('formata o valor com 2 casas como o to_char(FM9999999999990.00) do Postgres', () => {
        const casos: Array<[number, string]> = [[16, '16.00'], [400000, '400000.00'], [2972.73, '2972.73'], [0.1 + 0.2, '0.30']];
        for (const [valor, esperado] of casos) {
            const s = bankReconciliationService.fingerprintCanonical({
                bankAccountId: CONTA, date: '2020-10-30', amount: valor, direction: 'CREDIT', description: 'X', ordinal: 1,
            });
            expect(s.split('|')[2]).toBe(esperado);
        }
    });
});

describe('fingerprint v2 — SHA-256 igual ao do Postgres', () => {
    it('produz o mesmo hex que encode(sha256(convert_to(x, UTF8)), hex)', async () => {
        const canonical = bankReconciliationService.fingerprintCanonical({
            bankAccountId: CONTA, date: '2026-01-28', amount: 16, direction: 'DEBIT', description: REGINALDO, ordinal: 1,
        });
        expect(await bankReconciliationService.generateFingerprint(canonical)).toBe(VETOR_SQL);
    });

    it('tem 64 caracteres hex', async () => {
        const h = await bankReconciliationService.generateFingerprint('qualquer coisa');
        expect(h).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe('fingerprint v2 — o caso real de colisão', () => {
    it('dois PIX de R$ 16 no mesmo dia para contrapartes diferentes têm fingerprints diferentes', async () => {
        const rows = await bankReconciliationService.toNormalizedRows([
            { date: '2026-01-28', amount: -16, description: REGINALDO },
            { date: '2026-01-28', amount: -16, description: EMPORIUM },
        ], CONTA, 'org-1');
        expect(rows).toHaveLength(2);
        expect(rows[0].fingerprint).not.toBe(rows[1].fingerprint);
        expect(rows[0].direction).toBe('DEBIT');
        expect(rows[0].amount).toBe(16);
    });

    it('duas linhas idênticas no mesmo arquivo recebem ordinal 1 e 2 e ambas sobrevivem', async () => {
        const rows = await bankReconciliationService.toNormalizedRows([
            { date: '2026-01-28', amount: -16, description: REGINALDO },
            { date: '2026-01-28', amount: -16, description: REGINALDO },
        ], CONTA, 'org-1');
        expect(rows).toHaveLength(2);
        expect(rows[0].fingerprint).not.toBe(rows[1].fingerprint);
        const esperado2 = await bankReconciliationService.generateFingerprint(
            bankReconciliationService.fingerprintCanonical({
                bankAccountId: CONTA, date: '2026-01-28', amount: 16, direction: 'DEBIT', description: REGINALDO, ordinal: 2,
            }),
        );
        expect(rows[1].fingerprint).toBe(esperado2);
    });

    it('reimportar o mesmo arquivo reproduz os mesmos fingerprints (idempotência)', async () => {
        const arquivo = [
            { date: '2026-01-28', amount: -16, description: REGINALDO },
            { date: '2026-01-28', amount: -16, description: REGINALDO },
            { date: '2026-01-29', amount: 1500.5, description: 'TED RECEBIDA', fitid: 'FIT-1' },
        ];
        const a = await bankReconciliationService.toNormalizedRows(arquivo, CONTA, 'org-1');
        const b = await bankReconciliationService.toNormalizedRows(arquivo, CONTA, 'org-1');
        expect(a.map(r => r.fingerprint)).toEqual(b.map(r => r.fingerprint));
    });

    it('sem FITID o external_id é NULL, nunca um valor aleatório', async () => {
        const rows = await bankReconciliationService.toNormalizedRows([
            { date: '2026-01-28', amount: -16, description: REGINALDO },
            { date: '2026-01-29', amount: 10, description: 'X', fitid: 'FIT-9' },
        ], CONTA, 'org-1');
        expect(rows[0].external_id).toBeNull();
        expect(rows[1].external_id).toBe('FIT-9');
    });

    it('a descrição gravada é a descrição sem espaços nas pontas (igual ao regexp_replace do SQL)', async () => {
        const rows = await bankReconciliationService.toNormalizedRows([
            { date: '2026-01-28', amount: -16, description: '  INTEGR.CAPITAL SUBSCRITO-1   ' },
        ], CONTA, 'org-1');
        expect(rows[0].description_raw).toBe('INTEGR.CAPITAL SUBSCRITO-1');
    });
});
