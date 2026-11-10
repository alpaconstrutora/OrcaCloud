import { describe, it, expect, vi, beforeEach } from 'vitest';

// Banco falso: cada tabela devolve suas linhas, com `.in`/`.eq`/`.neq`
// aplicados de verdade — é o filtro por Centro de Custo que está em teste.
const tabelas: Record<string, Record<string, unknown>[]> = {};

vi.mock('../lib/supabase', () => {
    const builder = (linhas: Record<string, unknown>[]) => {
        let rows = [...linhas];
        const q: Record<string, unknown> = {};
        const self = () => q;
        q.select = self; q.order = self; q.gte = self; q.lte = self;
        q.eq = (col: string, v: unknown) => { rows = rows.filter(r => r[col] === v); return q; };
        q.neq = (col: string, v: unknown) => { rows = rows.filter(r => r[col] !== v); return q; };
        q.in = (col: string, vs: unknown[]) => { rows = rows.filter(r => vs.includes(r[col])); return q; };
        q.range = (a: number, b: number) => Promise.resolve({ data: rows.slice(a, b + 1), error: null });
        q.then = (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) =>
            Promise.resolve({ data: rows, error: null }).then(ok, ko);
        return q;
    };
    return { supabase: { from: (t: string) => builder(tabelas[t] ?? []) } };
});

vi.mock('../services/empreendimentoService', () => ({
    empreendimentoService: {
        mapObrasToEmpreendimentos: vi.fn(async () => ({ 'obra-9': { id: 'emp-2', name: 'Pela obra' } })),
        mapPropertiesToEmpreendimentos: vi.fn(async () => ({
            'u-1': { id: 'emp-1', name: 'Galeria' },
            'u-2': { id: 'emp-1', name: 'Galeria' },
            'u-3': { id: 'emp-2', name: 'Pela obra' },
        })),
    },
}));

import { rentalNoiService } from '../services/rentalNoiService';

const carteira = [
    { id: 'u-1', parent_id: null, price: 100_000, purpose: 'RENTAL', private_area: 40 },
    { id: 'u-2', parent_id: null, price: 100_000, purpose: 'RENTAL', private_area: 60 },
    { id: 'u-3', parent_id: null, price: 100_000, purpose: 'RENTAL' },
];

describe('rentalNoiService — despesa pelo Centro de Custo do empreendimento', () => {
    beforeEach(() => {
        tabelas.cost_centers_v2 = [
            { id: 'cc-direto', empreendimento_id: 'emp-1', project_id: null, organization_id: 'org' },
            { id: 'cc-obra', empreendimento_id: null, project_id: 'obra-9', organization_id: 'org' },
            { id: 'cc-solto', empreendimento_id: null, project_id: null, organization_id: 'org' },
        ];
        tabelas.vw_payables = [
            { id: '1', cost_center_id: 'cc-direto', amount: 1_000, effective_status: 'PAGO', organization_id: 'org' },
            { id: '2', cost_center_id: 'cc-direto', amount: 500, effective_status: 'CANCELADO', organization_id: 'org' },
            { id: '3', cost_center_id: 'cc-obra', amount: 300, effective_status: 'PREVISTO', organization_id: 'org' },
            { id: '4', cost_center_id: 'cc-solto', amount: 9_999, effective_status: 'PREVISTO', organization_id: 'org' },
            { id: '5', cost_center_id: null, amount: 7_777, effective_status: 'PREVISTO', organization_id: 'org' },
        ];
        tabelas.commercial_deals = [
            { id: 'd1', value: 2_000, installment_value: 2_000, status: 'COMPLETED', type: 'RENTAL', property_id: 'u-1', organization_id: 'org' },
        ];
    });

    it('soma só a despesa de Centro de Custo com empreendimento (direto ou pela obra), sem cancelado', async () => {
        const m = await rentalNoiService.getNoiMetrics('org', '2026-01-01', '2026-01-28', carteira, { throwOnError: true });
        expect(m).not.toBeNull();
        expect(m!.expense).toBe(1_300);
        expect(m!.revenue).toBe(2_000);
        expect(m!.noi).toBe(700);
        // Galeria (emp-1): 1.000 rateados 40/60 pela área; emp-2 inteiro em u-3.
        expect(m!.byProperty.get('u-1')!.expense).toBe(400);
        expect(m!.byProperty.get('u-2')!.expense).toBe(600);
        expect(m!.byProperty.get('u-3')!.expense).toBe(300);
    });

    it('sem Centro de Custo vinculado a empreendimento, a despesa é zero (NOI = receita, a tela mostra "—")', async () => {
        tabelas.cost_centers_v2 = [{ id: 'cc-solto', empreendimento_id: null, project_id: null, organization_id: 'org' }];
        const m = await rentalNoiService.getNoiMetrics('org', '2026-01-01', '2026-01-28', carteira, { throwOnError: true });
        expect(m!.expense).toBe(0);
    });
});
