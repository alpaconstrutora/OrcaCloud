/**
 * Onda 2 do plano de conciliação — as duas regras que fazem o motor acertar:
 *   2.1 "valor exato, ±3 dias, candidato ÚNICO dos dois lados" (findExactUniquePairs)
 *   2.2 transferência entre contas próprias (findInternalTransferPairs)
 *
 * Ambas são puras de propósito: a decisão de conciliar sozinho é a mais perigosa do
 * módulo e precisa ser testável sem banco.
 *
 * Os cenários negativos vêm de dados reais de 05/09/2026: um PIX de R$ 600 casava em
 * valor com oito títulos "Fatura Contrato 005 (n) - junho de 2026" de OUTRO fornecedor.
 * Por isso a unicidade é mútua, e por isso "231 pares de valor exato" viram 55 pares
 * de verdade.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { bankReconciliationService } from '../services/bankReconciliationService';

const svc = bankReconciliationService;
const b = (id: string, amount: number, date: string, direction = 'DEBIT') => ({ id, amount, direction, transaction_date: date });
const t = b; // mesma forma para o lado interno

describe('2.1 findExactUniquePairs', () => {
    it('par único dos dois lados, mesma data → concilia', () => {
        const r = svc.findExactUniquePairs([b('b1', 2200, '2026-08-05')], [t('i1', 2200, '2026-08-05')]);
        expect(r).toHaveLength(1);
        expect(r[0]).toMatchObject({ bankId: 'b1', internalId: 'i1', days: 0 });
        expect(r[0].reason).toBe('Valor exato, mesma data, candidato único dos dois lados');
    });

    it('até 3 dias de diferença ainda conta, e o motivo diz quantos', () => {
        const r = svc.findExactUniquePairs([b('b1', 4870.33, '2026-07-31')], [t('i1', 4870.33, '2026-07-30')]);
        expect(r[0].days).toBe(1);
        expect(r[0].reason).toMatch(/1 dia\(s\) de diferença/);
    });

    it('4 dias de diferença não conta', () => {
        expect(svc.findExactUniquePairs([b('b1', 100, '2026-03-10')], [t('i1', 100, '2026-03-06')])).toHaveLength(0);
    });

    it('direção diferente nunca casa (débito × título a receber)', () => {
        expect(svc.findExactUniquePairs([b('b1', 100, '2026-03-10', 'DEBIT')], [t('i1', 100, '2026-03-10', 'CREDIT')])).toHaveLength(0);
    });

    it('centavos diferentes não são "valor exato"', () => {
        expect(svc.findExactUniquePairs([b('b1', 100.01, '2026-03-10')], [t('i1', 100, '2026-03-10')])).toHaveLength(0);
    });

    it('CASO REAL: 1 pagamento de R$ 600 × 8 títulos de R$ 600 → nenhum par', () => {
        const faturas = Array.from({ length: 8 }, (_, i) => t(`i${i}`, 600, '2026-06-10'));
        expect(svc.findExactUniquePairs([b('b1', 600, '2026-06-15')], faturas)).toHaveLength(0);
    });

    it('o inverso também: 2 pagamentos iguais × 1 título → nenhum par', () => {
        const r = svc.findExactUniquePairs([b('b1', 600, '2026-06-15'), b('b2', 600, '2026-06-16')], [t('i1', 600, '2026-06-15')]);
        expect(r).toHaveLength(0);
    });

    it('candidato único de um lado mas o título tem outro pretendente → nenhum par', () => {
        // b1 vê só i1 (±3d). Mas i1 também casa com b2, que está a 2 dias.
        const r = svc.findExactUniquePairs([b('b1', 500, '2026-05-10'), b('b2', 500, '2026-05-12')], [t('i1', 500, '2026-05-11')]);
        expect(r).toHaveLength(0);
    });

    it('vários pares independentes no mesmo lote são todos encontrados', () => {
        const banco = [b('b1', 100, '2026-01-05'), b('b2', 250, '2026-01-06'), b('b3', 999, '2026-01-07')];
        // i3 está a 2 dias de b3 — dentro da janela de 3, então também pareia.
        const titulos = [t('i1', 100, '2026-01-05'), t('i2', 250, '2026-01-07'), t('i3', 999, '2026-01-09')];
        const r = svc.findExactUniquePairs(banco, titulos);
        expect(r.map(x => [x.bankId, x.internalId])).toEqual([['b1', 'i1'], ['b2', 'i2'], ['b3', 'i3']]);
        expect(r.map(x => x.days)).toEqual([0, 1, 2]);
    });

    it('valor fora da janela de data não entra, mesmo com valor exato e único', () => {
        const r = svc.findExactUniquePairs([b('b1', 999, '2026-01-07')], [t('i1', 999, '2026-01-11')]);
        expect(r).toEqual([]);
    });

    it('nenhum título compatível → lista vazia, sem erro', () => {
        expect(svc.findExactUniquePairs([b('b1', 100, '2026-01-05')], [])).toEqual([]);
        expect(svc.findExactUniquePairs([], [t('i1', 100, '2026-01-05')])).toEqual([]);
    });
});

describe('2.2 findInternalTransferPairs', () => {
    const row = (id: string, conta: string, amount: number, date: string, direction: string) =>
        ({ id, bank_account_id: conta, amount, direction, transaction_date: date });

    it('débito numa conta e crédito de mesmo valor em outra, mesmo dia → par', () => {
        const r = svc.findInternalTransferPairs([
            row('d1', 'sicredi', 10000, '2026-04-10', 'DEBIT'),
            row('c1', 'garden', 10000, '2026-04-10', 'CREDIT'),
        ]);
        expect(r).toEqual([{ debitId: 'd1', creditId: 'c1', days: 0 }]);
    });

    it('1 dia de diferença ainda é o mesmo dinheiro', () => {
        const r = svc.findInternalTransferPairs([
            row('d1', 'a', 5000, '2026-04-10', 'DEBIT'),
            row('c1', 'b', 5000, '2026-04-11', 'CREDIT'),
        ]);
        expect(r[0].days).toBe(1);
    });

    it('2 dias já não pareia', () => {
        expect(svc.findInternalTransferPairs([
            row('d1', 'a', 5000, '2026-04-10', 'DEBIT'),
            row('c1', 'b', 5000, '2026-04-12', 'CREDIT'),
        ])).toEqual([]);
    });

    it('mesma conta não é transferência (é lançamento estornado, outra coisa)', () => {
        expect(svc.findInternalTransferPairs([
            row('d1', 'a', 700, '2026-04-10', 'DEBIT'),
            row('c1', 'a', 700, '2026-04-10', 'CREDIT'),
        ])).toEqual([]);
    });

    it('dois créditos candidatos: escolhe o mais próximo em data', () => {
        const r = svc.findInternalTransferPairs([
            row('d1', 'a', 3000, '2026-04-10', 'DEBIT'),
            row('c_longe', 'b', 3000, '2026-04-11', 'CREDIT'),
            row('c_perto', 'b', 3000, '2026-04-10', 'CREDIT'),
        ]);
        expect(r).toEqual([{ debitId: 'd1', creditId: 'c_perto', days: 0 }]);
    });

    it('cada movimento entra em no máximo um par', () => {
        const r = svc.findInternalTransferPairs([
            row('d1', 'a', 1000, '2026-04-10', 'DEBIT'),
            row('d2', 'a', 1000, '2026-04-10', 'DEBIT'),
            row('c1', 'b', 1000, '2026-04-10', 'CREDIT'),
        ]);
        expect(r).toHaveLength(1);
        expect(r[0].creditId).toBe('c1');
    });

    it('dois pares distintos no mesmo lote', () => {
        const r = svc.findInternalTransferPairs([
            row('d1', 'a', 1000, '2026-04-10', 'DEBIT'),
            row('c1', 'b', 1000, '2026-04-10', 'CREDIT'),
            row('d2', 'b', 250.5, '2026-04-20', 'DEBIT'),
            row('c2', 'a', 250.5, '2026-04-20', 'CREDIT'),
        ]);
        expect(r).toHaveLength(2);
        expect(r.map(x => x.debitId).sort()).toEqual(['d1', 'd2']);
    });

    it('valores diferentes não pareiam nem por 1 centavo', () => {
        expect(svc.findInternalTransferPairs([
            row('d1', 'a', 1000, '2026-04-10', 'DEBIT'),
            row('c1', 'b', 1000.01, '2026-04-10', 'CREDIT'),
        ])).toEqual([]);
    });

    it('é determinístico: a mesma entrada em outra ordem dá o mesmo resultado', () => {
        const linhas = [
            row('c1', 'b', 1000, '2026-04-10', 'CREDIT'),
            row('d2', 'b', 250.5, '2026-04-20', 'DEBIT'),
            row('d1', 'a', 1000, '2026-04-10', 'DEBIT'),
            row('c2', 'a', 250.5, '2026-04-20', 'CREDIT'),
        ];
        const a = svc.findInternalTransferPairs(linhas);
        const bb = svc.findInternalTransferPairs([...linhas].reverse());
        expect(a).toEqual(bb);
    });
});

describe('2.1 — contraparte que se contradiz derruba o par (achado da 1ª execução real)', () => {
    const bc = (id: string, amount: number, date: string, texto?: string) =>
        ({ id, amount, direction: 'DEBIT', transaction_date: date, counterparty_name: texto });
    const tc = (id: string, amount: number, date: string, party?: string) =>
        ({ id, amount, direction: 'DEBIT', transaction_date: date, party_name: party });

    it('CASO REAL: "NOVA ALIANCA CAMBUI" não casa com título de "Bruna Suelem"', () => {
        const r = svc.findExactUniquePairs(
            [bc('b1', 2000, '2026-01-08', 'NOVA ALIANCA CAMBUI')],
            [tc('i1', 2000, '2026-01-10', 'Bruna Suelem')],
        );
        expect(r).toEqual([]);
    });

    it('CASO REAL: "ALEX DUTRA CHAVES" não casa com título da "Filtrelec"', () => {
        const r = svc.findExactUniquePairs(
            [bc('b1', 1300, '2024-06-11', 'ALEX DUTRA CHAVES')],
            [tc('i1', 1300, '2024-06-10', 'Filtrelec')],
        );
        expect(r).toEqual([]);
    });

    it('CASO REAL que DEVE continuar casando: "Ivana Braga Demier" dos dois lados', () => {
        const r = svc.findExactUniquePairs(
            [bc('b1', 1100, '2023-02-07', 'Ivana Braga Demier')],
            [tc('i1', 1100, '2023-02-05', 'Ivana Braga Demier')],
        );
        expect(r).toHaveLength(1);
    });

    it('nome parcial basta: o extrato traz jargão em volta', () => {
        const r = svc.findExactUniquePairs(
            [bc('b1', 500, '2026-03-10', 'PIX ENVIADO CONSTRUTORA ALPA LTDA')],
            [tc('i1', 500, '2026-03-10', 'Construtora Alpa')],
        );
        expect(r).toHaveLength(1);
    });

    it('título SEM contraparte continua casando: ausência não é contradição', () => {
        const r = svc.findExactUniquePairs(
            [bc('b1', 500, '2026-03-10', 'QUALQUER COISA')],
            [tc('i1', 500, '2026-03-10', undefined)],
        );
        expect(r).toHaveLength(1);
    });

    it('extrato sem texto também continua casando', () => {
        const r = svc.findExactUniquePairs(
            [bc('b1', 500, '2026-03-10', undefined)],
            [tc('i1', 500, '2026-03-10', 'Fornecedor X')],
        );
        expect(r).toHaveLength(1);
    });

    it('CASO REAL: extrato de jargão puro NÃO bloqueia — "INT PAG TIT BANCO 001" não nomeia ninguém', () => {
        // Bloqueou 9 de 9 pares do Banco Itaú na 1ª versão da guarda, inclusive um
        // boleto da ENERGISA cujo extrato não trazia nome nenhum.
        expect(svc.contrapartesDiscordam('INT  PAG TIT BANCO 001', 'ENERGISA SUL-SUDESTE - DISTRIBUIDORA')).toBe(false);
        const r = svc.findExactUniquePairs(
            [bc('b1', 106.30, '2019-08-19', 'INT  PAG TIT BANCO 001')],
            [tc('i1', 106.30, '2019-08-19', 'ENERGISA SUL-SUDESTE - DISTRIBUIDORA')],
        );
        expect(r).toHaveLength(1);
    });

    it('CASO REAL que DEVE continuar bloqueado: extrato nomeia "ALPA CONSTR", título é da Defensoria', () => {
        expect(svc.contrapartesDiscordam('TED 077.0001ALPA CONSTR', 'Defensoria Pública de Minas')).toBe(true);
    });

    it('contrapartesDiscordam isolada', () => {
        expect(svc.contrapartesDiscordam('NOVA ALIANCA CAMBUI', 'Bruna Suelem')).toBe(true);
        expect(svc.contrapartesDiscordam('PIX IVANA BRAGA DEMIER', 'Ivana Braga Demier')).toBe(false);
        expect(svc.contrapartesDiscordam('', 'Fulano')).toBe(false);
        expect(svc.contrapartesDiscordam('Texto', '')).toBe(false);
        // Nome só de palavras curtas não gera veredito.
        expect(svc.contrapartesDiscordam('QUALQUER', 'A B C')).toBe(false);
    });
});
