/**
 * syncPayrollToFinance (21/10/2026) — plano docs/planos/2026-10-21-folha-encargos-em-tributos-a-pagar.md
 *
 * Até aqui o sync APAGAVA todo `labor-{folha}-%` antes de regravar: título
 * conciliado ia junto (o CASCADE levava o vínculo do extrato) e membro de DARF
 * travava o delete em silêncio. E gravava um "Encargos Patronais" só, com FGTS +
 * todos os descontos dentro. Aqui, com um banco falso:
 *   • o conciliado e o do DARF não são apagados nem regravados;
 *   • o "-encargos" antigo (pendente) é apagado DEPOIS de gravar os novos;
 *   • FGTS/INSS/CPP/RAT/terceiros saem como TAX, vencendo no dia 20;
 *   • erro do upsert vira exceção (antes: só console).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Resposta = { data: unknown; error: unknown };
const ops: { op: string; tabela: string; rows?: Record<string, unknown>[]; ids?: string[] }[] = [];
let falharUpsert = false;
let tipoDaFolha: string | undefined;

const RUN = '11111111-1111-1111-1111-111111111111';
const EMP = '22222222-2222-2222-2222-222222222222';
const P = `labor-${RUN}-`;

const EXISTENTES = [
    { id: 'old-enc', reference_id: `${P}unallocated-encargos`, description: 'Encargos Patronais - Não Alocado', amount: 3513.52, status: 'PENDING', business_status: 'PREVISTO', darf_id: null },
    { id: 'old-sal', reference_id: `${P}unallocated-salario`, description: 'Salários', amount: 1873.82, status: 'PENDING', business_status: 'PREVISTO', darf_id: null },
    { id: 'conc', reference_id: `${P}indiv-ADIANTAMENTO-${EMP}`, description: 'Adiantamento', amount: 1618.40, status: 'PENDING', business_status: 'PREVISTO', darf_id: null },
    { id: 'darf', reference_id: `${P}unallocated-fgts`, description: 'FGTS', amount: 400, status: 'PENDING', business_status: 'PREVISTO', darf_id: 'd1' },
];

function dados(tabela: string, filtros: Record<string, unknown[]>): unknown {
    switch (tabela) {
        case 'payroll_runs': return { id: RUN, type: tipoDaFolha, org_id: 'org', start_date: '2026-06-01', end_date: '2026-06-30', cost_center_id: 'cc', plano_de_contas_id: null };
        case 'payroll_results': return [{ employee_id: EMP, net: 3492.22, gross: 5667, employer_cost: 6120.36, base_inss: 5667, employee: { name: 'Fulano' } }];
        case 'employees': return [{ id: EMP, name: 'Fulano', cost_center_id: null, plano_de_contas_id: null }];
        case 'employee_cost_splits': return [];
        case 'employee_allocations': return [];
        case 'payroll_items': return [
            { id: 'i1', employee_id: EMP, code: 'SALARIO', type: 'provento', amount: 5667 },
            { id: 'i2', employee_id: EMP, code: 'ADIANTAMENTO', type: 'desconto', amount: 1618.40 },
            { id: 'i3', employee_id: EMP, code: 'INSS', type: 'desconto', amount: 495.69 },
            { id: 'i4', employee_id: EMP, code: 'CONTRIBUIÇÃO ASSISTENCIAL', type: 'desconto', amount: 60.69 },
            { id: 'i5', employee_id: EMP, code: 'FGTS', type: 'encargo', amount: 453.36 },
        ];
        case 'rubrics': return [
            { code: 'ADIANTAMENTO', name: 'Adiantamento', organization_id: 'org', lancamento_individualizado: true, dia_lancamento: 20, repasse_terceiros: false },
            { code: 'CONTRIBUIÇÃO ASSISTENCIAL', name: 'Contribuição Assistencial', organization_id: 'org', lancamento_individualizado: false, dia_lancamento: null, repasse_terceiros: true },
        ];
        case 'payroll_encargos_config': return null;
        case 'companies': return { regime_tributario: 'lucro_presumido', simples_anexo_iv: false, cprb: false };
        case 'internal_transactions': return EXISTENTES;
        case 'reconciliation_matches': return (filtros.in?.[1] as string[]).includes('conc') ? [{ internal_transaction_id: 'conc' }] : [];
        case 'supplier_payments': return [];
        default: return [];
    }
}

function consulta(tabela: string) {
    const filtros: Record<string, unknown[]> = {};
    let op: 'select' | 'delete' | 'upsert' = 'select';
    const q: Record<string, unknown> = {};
    const encadear = (nome: string) => (...args: unknown[]) => { filtros[nome] = args; return q; };
    for (const m of ['select', 'eq', 'like', 'or', 'in', 'order', 'limit', 'is']) q[m] = encadear(m);
    q.delete = () => { op = 'delete'; return q; };
    q.upsert = (rows: Record<string, unknown>[]) => { op = 'upsert'; ops.push({ op: 'upsert', tabela, rows }); return q; };
    const responder = (): Resposta => {
        if (op === 'delete') { ops.push({ op: 'delete', tabela, ids: (filtros.in?.[1] as string[]) ?? [] }); return { data: null, error: null }; }
        if (op === 'upsert') return { data: null, error: falharUpsert ? { message: 'Período 06/2026 fechado' } : null };
        return { data: dados(tabela, filtros), error: null };
    };
    q.range = () => Promise.resolve(responder());
    q.single = () => Promise.resolve(responder());
    q.maybeSingle = () => Promise.resolve(responder());
    q.then = (ok: (r: Resposta) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(responder()).then(ok, erro);
    return q;
}

vi.mock('../lib/supabase', () => ({ supabase: { from: (t: string) => consulta(t), rpc: vi.fn(), auth: { getUser: vi.fn(async () => ({ data: { user: null } })) } } }));
vi.mock('../services/projectService', () => ({ projectService: { loadProject: vi.fn(async () => null), saveProject: vi.fn() } }));

import { payrollService } from '../services/payrollService';

const gravados = () => ops.filter(o => o.op === 'upsert').flatMap(o => o.rows ?? []);
const porRef = (sufixo: string) => gravados().find(r => r.reference_id === `${P}${sufixo}`);

describe('syncPayrollToFinance — preserva e separa os tributos', () => {
    beforeEach(() => { ops.length = 0; falharUpsert = false; tipoDaFolha = undefined; });

    it('não apaga nem regrava o conciliado e o do DARF', async () => {
        const r = await payrollService.syncPayrollToFinance(RUN);
        const apagados = ops.filter(o => o.op === 'delete').flatMap(o => o.ids ?? []);
        expect(apagados).not.toContain('conc');
        expect(apagados).not.toContain('darf');
        expect(porRef(`indiv-ADIANTAMENTO-${EMP}`)).toBeUndefined();
        expect(porRef('unallocated-fgts')).toBeUndefined();
        expect(r.preservados).toBe(2);
        // o FGTS do DARF (400) diverge do novo cálculo (453,36): avisa
        expect(r.avisos.join(' ')).toMatch(/FGTS.*400,00.*453,36/);
    });

    it('apaga o "-encargos" de cálculo antigo, e só depois de gravar os novos', async () => {
        await payrollService.syncPayrollToFinance(RUN);
        const iUpsert = ops.findIndex(o => o.op === 'upsert');
        const iDelete = ops.findIndex(o => o.op === 'delete');
        expect(iUpsert).toBeGreaterThanOrEqual(0);
        expect(iDelete).toBeGreaterThan(iUpsert);
        expect(ops[iDelete].ids).toEqual(['old-enc']);
        // o salário é regravado no MESMO reference_id, com o líquido certo
        expect(porRef('unallocated-salario')?.amount).toBe(3492.22);
    });

    it('INSS, CPP, RAT e terceiros saem como TAX, vencendo no dia 20; o repasse não', async () => {
        await payrollService.syncPayrollToFinance(RUN);
        const inss = porRef('unallocated-inss')!;
        expect(inss).toMatchObject({ party_type: 'TAX', party_name: 'INSS (segurados)', amount: 495.69, due_date: '2026-07-20', business_status: 'PREVISTO' });
        expect(porRef('unallocated-cpp')).toMatchObject({ party_type: 'TAX', amount: 1133.4 });
        expect(porRef('unallocated-rat')).toMatchObject({ party_type: 'TAX', amount: 170.01 });
        expect(porRef('unallocated-terceiros')).toMatchObject({ party_type: 'TAX', amount: 328.69 });
        const rep = gravados().find(r => String(r.reference_id).includes('rep-CONTRIBUICAO_ASSISTENCIAL'))!;
        expect(rep).toMatchObject({ party_type: 'GOVERNMENT', amount: 60.69, due_date: '2026-07-05' });
        // todas as linhas do upsert têm as mesmas chaves (o PostgREST usa a união)
        const chaves = new Set(gravados().map(r => Object.keys(r).sort().join(',')));
        expect(chaves.size).toBe(1);
    });

    it('erro na gravação vira exceção e nada é apagado', async () => {
        falharUpsert = true;
        await expect(payrollService.syncPayrollToFinance(RUN)).rejects.toThrow(/Período 06\/2026 fechado/);
        expect(ops.some(o => o.op === 'delete')).toBe(false);
    });

    it('folha de ADIANTAMENTO não gera financeiro: o adiantamento já sai da mensal (rubrica individualizada)', async () => {
        // 22/10/2026: as duas folhas de adiantamento de 05/2026 foram calculadas antes do
        // processAdvance existir e carregam INSS/FGTS. Fechá-las gravaria INSS, CPP, RAT,
        // terceiros e FGTS em dobro com a mensal — e o próprio adiantamento, duas vezes.
        tipoDaFolha = 'adiantamento';
        const r = await payrollService.syncPayrollToFinance(RUN);
        expect(ops.filter(o => o.op === 'upsert' || o.op === 'delete')).toEqual([]);
        expect(r.count).toBe(0);
        expect(r.avisos.join(' ')).toMatch(/adiantamento/i);
    });
});
