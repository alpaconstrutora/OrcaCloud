/**
 * `financialService.syncMeasurementToFinance` — o produtor do título de medição.
 * Pedido de 09/09/2026, docs/planos/2026-09-09-partner-financeiro-defeitos-*.md
 *
 * Até aqui ele gravava `source_system='PROJECT'` com `reference_id` = uuid do
 * lançamento no JSON do projeto: um id que NENHUM consumidor conhecia. Efeito
 * medido em produção — aprovar uma medição de R$ 1,00 gerou 24 lançamentos e
 * NENHUM apareceu, nem no Portal do Parceiro nem na aba Financeiro do contrato.
 *
 * O que estes casos travam é o contrato entre produtor e consumidor: origem
 * carimbada como CONTRACT_MEASUREMENT e `reference_id` com o CONTRATO no
 * prefixo — que é por onde as consultas casam (`LIKE contract_id || '%'`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { measurementRef, originIdFromRef, measurementIdFromRef } from '../lib/receivableRef';

const CONTRATO = '389bc525-81b9-4d92-a6bf-1044f43794ee';
const MEDICAO = '6bacbb6d-27a4-4f1b-8496-a8056012a75d';
const PROJETO = 'a004fa6d-bf50-4424-b9d4-d6ed3f68c392';

/** Lançamentos que o service mandou para `internal_transactions`. */
const inseridos: Record<string, unknown>[] = [];

/** Contrato devolvido pelo mock — mutável para cobrir os DOIS caminhos de
 *  geração (cronograma próprio e divisão igual), que são trechos distintos. */
const contrato: Record<string, unknown> = {};
const CONTRATO_BASE = {
    id: '389bc525-81b9-4d92-a6bf-1044f43794ee',
    organization_id: 'org1',
    project_id: 'a004fa6d-bf50-4424-b9d4-d6ed3f68c392',
    supplier_id: 'sup1', number: '010', title: 'Assistencia Administrativa',
    payment_term_type: 'Parcelado', payment_installments: 3,
    payment_days: 30, payment_method: 'Pix', direction: 'OUTGOING',
};

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (tabela: string) => ({
            select: () => ({
                eq: () => ({
                    single: async () => {
                        if (tabela === 'contract_measurements') {
                            return {
                                data: {
                                    id: MEDICAO, contract_id: CONTRATO, number: 999,
                                    period_start: '2026-09-01', period_end: '2026-09-09',
                                    measurement_date: '2026-09-09', status: 'Processada',
                                    total_value: 1, retention_value: 0, net_value: 1,
                                    notes: null, invoice_url: null, created_at: null,
                                },
                                error: null,
                            };
                        }
                        if (tabela === 'contracts') return { data: { ...contrato }, error: null };
                        if (tabela === 'suppliers') return { data: { name: 'Bruna Suelem' }, error: null };
                        return { data: null, error: null };
                    },
                }),
            }),
            insert: async (linha: Record<string, unknown>) => {
                if (tabela === 'internal_transactions') inseridos.push(linha);
                return { error: null };
            },
        }),
    },
}));

vi.mock('../services/projectService', () => ({
    projectService: {
        loadProject: async () => ({
            id: PROJETO,
            name: 'Obra teste',
            settings: { organizationId: 'org1', financialInfo: { transactions: [] } },
        }),
        saveProject: async (p: unknown) => p,
    },
}));

vi.mock('../services/invoiceService', () => ({ invoiceService: {} }));
vi.mock('../utils/systemProjects', () => ({ isSystemProject: () => false }));

import { financialService } from '../services/financialService';

describe('syncMeasurementToFinance · o título precisa ser ACHÁVEL', () => {
    beforeEach(() => {
        inseridos.length = 0;
        Object.keys(contrato).forEach(k => delete contrato[k]);
        Object.assign(contrato, CONTRATO_BASE);
    });

    it('gera uma linha por parcela do contrato', async () => {
        await financialService.syncMeasurementToFinance(MEDICAO);
        expect(inseridos).toHaveLength(3);
    });

    it('carimba a origem como CONTRACT_MEASUREMENT, não PROJECT', async () => {
        await financialService.syncMeasurementToFinance(MEDICAO);
        expect(inseridos.map(l => l.source_system)).toEqual(
            ['CONTRACT_MEASUREMENT', 'CONTRACT_MEASUREMENT', 'CONTRACT_MEASUREMENT'],
        );
    });

    it('grava reference_id com o CONTRATO no prefixo — é como o consumidor casa', async () => {
        await financialService.syncMeasurementToFinance(MEDICAO);
        const refs = inseridos.map(l => String(l.reference_id));
        expect(refs).toEqual([
            measurementRef(CONTRATO, MEDICAO, 1),
            measurementRef(CONTRATO, MEDICAO, 2),
            measurementRef(CONTRATO, MEDICAO, 3),
        ]);
        // O que o SQL faz: reference_id LIKE contract_id || '%'
        refs.forEach(r => expect(r.startsWith(CONTRATO)).toBe(true));
        refs.forEach(r => expect(originIdFromRef(r)).toBe(CONTRATO));
        refs.forEach(r => expect(measurementIdFromRef(r)).toBe(MEDICAO));
    });

    it('reference_id é único por parcela — o UNIQUE do banco barraria repetido', async () => {
        await financialService.syncMeasurementToFinance(MEDICAO);
        const refs = inseridos.map(l => String(l.reference_id));
        expect(new Set(refs).size).toBe(refs.length);
    });

    it('sincronizar duas vezes produz os MESMOS reference_id (idempotente)', async () => {
        await financialService.syncMeasurementToFinance(MEDICAO);
        const primeira = inseridos.map(l => String(l.reference_id));
        inseridos.length = 0;
        await financialService.syncMeasurementToFinance(MEDICAO);
        expect(inseridos.map(l => String(l.reference_id))).toEqual(primeira);
    });
});

/**
 * O outro caminho: contrato com cronograma próprio (`payment_schedule`). É um
 * trecho SEPARADO do service, com `return` próprio — corrigir só o de baixo
 * deixaria metade dos contratos ainda gerando título invisível.
 */
describe('syncMeasurementToFinance · caminho do cronograma próprio', () => {
    beforeEach(() => {
        inseridos.length = 0;
        Object.keys(contrato).forEach(k => delete contrato[k]);
        Object.assign(contrato, CONTRATO_BASE, {
            payment_schedule: [
                { date: '2026-10-10', value: 600 },
                { date: '2026-11-10', value: 400 },
            ],
        });
    });

    it('usa o cronograma (2 parcelas), não a divisão igual (3)', async () => {
        await financialService.syncMeasurementToFinance(MEDICAO);
        expect(inseridos).toHaveLength(2);
    });

    it('carimba origem e reference_id iguais ao outro caminho', async () => {
        await financialService.syncMeasurementToFinance(MEDICAO);
        expect(inseridos.map(l => l.source_system))
            .toEqual(['CONTRACT_MEASUREMENT', 'CONTRACT_MEASUREMENT']);
        expect(inseridos.map(l => String(l.reference_id))).toEqual([
            measurementRef(CONTRATO, MEDICAO, 1),
            measurementRef(CONTRATO, MEDICAO, 2),
        ]);
    });
});
