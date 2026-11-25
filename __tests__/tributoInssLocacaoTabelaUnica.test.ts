/**
 * INSS da locação pela tabela ÚNICA de INSS (a da folha, `inss_brackets`, por
 * vigência em datas) — plano docs/planos/2026-11-24-tributos-um-lugar-so.md.
 *
 * Até 24/11/2026 a locação lia uma segunda tabela (`tax_inss_brackets`, por ano,
 * alíquota em %), com as mesmas faixas da folha. Ela começava em 2024: parcela
 * de 2023 não tinha INSS. A tabela da folha começa em 2023 — o corte em
 * 01/01/2024 mantém o resultado de hoje (36 parcelas de 2023, todas pagas, não
 * ganham INSS novo "a pagar" ao regerar).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Resposta = { data: unknown; error: unknown };
const upserts: Record<string, unknown>[][] = [];
const datasConsultadas: string[] = [];

const PARCELAS = [
    { id: 'p2025', reference_id: 'tx-DEAL-p1', amount: 1000, due_date: '2025-03-10', status: 'PENDING', business_status: 'PREVISTO' },
    { id: 'p2023', reference_id: 'tx-DEAL-p2', amount: 1000, due_date: '2023-05-10', status: 'CONCILIATED', business_status: 'RECEBIDO' },
    { id: 'pAlta', reference_id: 'tx-DEAL-p3', amount: 9000, due_date: '2025-04-10', status: 'PENDING', business_status: 'PREVISTO' },
];

function consulta(tabela: string) {
    const filtros: Record<string, unknown> = {};
    let op: 'select' | 'delete' | 'upsert' = 'select';
    const q: Record<string, unknown> = {};
    const encadear = (nome: string) => (...args: unknown[]) => { filtros[nome] = args; return q; };
    for (const m of ['select', 'eq', 'like', 'or', 'in', 'order', 'limit']) q[m] = encadear(m);
    q.delete = () => { op = 'delete'; return q; };
    q.upsert = (rows: Record<string, unknown>[]) => { op = 'upsert'; upserts.push(rows); return q; };
    const responder = (): Resposta => {
        if (op !== 'select') return { data: null, error: null };
        if (tabela === 'commercial_deals') return { data: { contract_number: 'CTL-1', code: null, tributos_retidos: [], locador_client_id: null }, error: null };
        if (tabela === 'contracts') return { data: [], error: null };
        if (tabela === 'internal_transactions') {
            if (JSON.stringify(filtros).includes('"direction","CREDIT"')) return { data: PARCELAS, error: null };
            return { data: [], error: null };
        }
        return { data: null, error: null };
    };
    q.maybeSingle = () => Promise.resolve(responder());
    q.then = (ok: (r: Resposta) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(responder()).then(ok, erro);
    return q;
}

vi.mock('../lib/supabase', () => ({ supabase: { from: (t: string) => consulta(t), rpc: vi.fn() } }));
vi.mock('../services/financialCategoryResolver', async (orig) => ({
    ...(await orig<typeof import('../services/financialCategoryResolver')>()),
    resolverCategoriaPorNomes: vi.fn(async (_org: string, nomes: string[]) => ({ category_id: null, category: nomes[0] })),
}));
vi.mock('../services/pisRatesService', () => ({
    pisRatesService: { list: vi.fn(async () => [{ id: 'p', exercicio: 2020, regime_tributario: 'Lucro Presumido', aliquota: 0.65 }]) },
}));
vi.mock('../services/cofinsRatesService', () => ({
    cofinsRatesService: { list: vi.fn(async () => [{ id: 'c', exercicio: 2020, regime_tributario: 'Lucro Presumido', aliquota: 3 }]) },
}));
// Tabela da folha: alíquota em FRAÇÃO. Mesmas faixas em 2023 e 2025 — o corte é por data.
const FAIXAS = [
    { valid_from: '2023-01-01', valid_to: null, min_value: 0, max_value: 1518, rate: 0.075, deduction: 0 },
    { valid_from: '2023-01-01', valid_to: null, min_value: 1518.01, max_value: 2793.88, rate: 0.09, deduction: 0 },
    { valid_from: '2023-01-01', valid_to: null, min_value: 4190.84, max_value: 8157.41, rate: 0.14, deduction: 0 },
];
vi.mock('../services/fiscalService', () => ({
    fiscalService: {
        getINSSBrackets: vi.fn(async (data: string) => { datasConsultadas.push(data); return FAIXAS; }),
        getIRRFBrackets: vi.fn(async () => []),
    },
}));

import { taxPayableService } from '../services/taxPayableService';

const inssDe = (parcelaId: string) =>
    upserts.flat().find(r => r.parcela_id === parcelaId && r.party_name === 'INSS')?.amount;

describe('generateForDeal (Locação) — INSS pela tabela única', () => {
    beforeEach(async () => {
        upserts.length = 0;
        datasConsultadas.length = 0;
        vi.spyOn(taxPayableService, 'resolveRentalRegime').mockResolvedValue('lucro_presumido');
        await taxPayableService.generateForDeal({ id: 'DEAL', type: 'RENTAL', property_id: 'prop' } as never, 'org-1', 'CAIXA');
    });

    it('parcela de 2025 de R$ 1.000: 7,5% da faixa da tabela da folha (fração → %)', () => {
        expect(inssDe('p2025')).toBe(75);
    });

    it('busca as faixas pela DATA da parcela (vigência), não pelo ano', () => {
        expect(datasConsultadas).toContain('2025-03-10');
    });

    it('acima da última faixa: alíquota da faixa de maior teto, como antes', () => {
        expect(inssDe('pAlta')).toBe(1260); // 9.000 × 14%
    });

    it('parcela de 2023: sem INSS (a tabela da locação começava em 2024)', () => {
        expect(inssDe('p2023')).toBeUndefined();
    });

    it('PIS/COFINS seguem iguais', () => {
        const linhas = upserts.flat().filter(r => r.parcela_id === 'p2025');
        expect(linhas.find(r => r.party_name === 'PIS')?.amount).toBe(6.5);
        expect(linhas.find(r => r.party_name === 'COFINS')?.amount).toBe(30);
    });
});
