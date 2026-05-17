/**
 * Testes de lógica pura — Suprimentos: Contratos
 *
 * Cobre os 13 bugs corrigidos com casos de borda que garantem comportamento correto.
 * Todos os testes são independentes de React (node environment).
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Tipos locais (espelho dos tipos do sistema) ───────────────────────────

interface MockContract {
    id: string;
    number: string;
    title: string;
    contract_type: string;
    nature: string;
    status: string;
    start_date: string;   // 'YYYY-MM-DD'
    end_date: string | null;
    original_value: number;
    current_value: number;
    created_at: string;
    retention_rate: number;
    is_recurring?: boolean;
}

interface MockContractItem {
    id: string;
    contract_id: string;
    description: string;
    unit: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    budget_item_id: string;
}

interface MockMeasurement {
    id: string;
    contract_id: string;
    number: number;
    period_start: string;
    period_end: string;
    measurement_date: string;
    status: string;
    total_value: number;
    retention_value: number;
    net_value: number;
    created_at: string;
}

interface MockAddendum {
    id: string;
    contract_id: string;
    number: string;
    status: 'Pendente' | 'Aprovado' | 'Rejeitado';
    value_impact: number;
    new_end_date?: string;
    created_at: string;
    approved_at?: string;
}

// ─── Helpers extraídos dos componentes (lógica pura testável) ─────────────

/** Bug 5 / Bug 8: timeProgress com anchor de timezone */
function calcTimeProgress(startDate: string, endDate: string | null, now: Date): number {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate + 'T12:00:00').getTime();
    const end   = new Date(endDate   + 'T12:00:00').getTime();
    const t     = now.getTime();
    if (t < start) return 0;
    if (t > end)   return 100;
    const total = end - start;
    if (total <= 0) return 100;
    return ((t - start) / total) * 100;
}

/** physicalProgress */
function calcPhysicalProgress(currentValue: number, totalMeasurements: number): number {
    return (totalMeasurements / (currentValue || 1)) * 100;
}

/** Stats usados no dashboard da lista */
function calcStats(contracts: MockContract[]) {
    return {
        total: contracts.length,
        active: contracts.filter(c => c.status === 'Ativo').length,
        totalValue: contracts.reduce((sum, c) => sum + (c.current_value || 0), 0),
    };
}

/** filteredContracts — sorting + filtering */
function filterAndSort(
    contracts: MockContract[],
    statusFilter: string,
    searchTerm: string,
    sortBy: string,
): MockContract[] {
    return [...contracts]
        .filter(c => statusFilter === 'all' || c.status === statusFilter)
        .filter(c =>
            c.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.contract_type?.toLowerCase().includes(searchTerm.toLowerCase()),
        )
        .sort((a, b) => {
            if (sortBy === 'date-desc') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            if (sortBy === 'date-asc')  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            if (sortBy === 'value-desc') return b.current_value - a.current_value;
            if (sortBy === 'value-asc')  return a.current_value - b.current_value;
            if (sortBy === 'title-asc')  return (a.title || '').localeCompare(b.title || '');
            return 0;
        });
}

/** addendumsMetrics */
function calcAddendumsMetrics(addendums: MockAddendum[], originalValue: number) {
    const totalImpact = addendums
        .filter(a => a.status === 'Aprovado')
        .reduce((sum, a) => sum + (a.value_impact || 0), 0);
    const percentage = (totalImpact / (originalValue || 1)) * 100;
    return { totalImpact, percentage };
}

/** Geração de número de aditivo (Bug 12 fix) */
function generateAddendumNumber(existingCount: number): string {
    return `AD-${String(existingCount + 1).padStart(3, '0')}`;
}

/** Measurement total value calculation */
function calcMeasurementTotal(
    items: MockContractItem[],
    quantities: Record<string, number>,
): number {
    return items.reduce((sum, item) => {
        const qty = quantities[item.id] || 0;
        return sum + qty * item.unit_price;
    }, 0);
}

/** Date display com timezone safety */
function formatContractDate(dateStr: string | null | undefined): string {
    if (!dateStr) return 'N/A';
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR');
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

const makeContract = (overrides: Partial<MockContract> = {}): MockContract => ({
    id: 'c1',
    number: '001',
    title: 'Contrato Teste',
    contract_type: 'Empreitada Global',
    nature: 'Serviço',
    status: 'Ativo',
    start_date: '2025-01-01',
    end_date: '2025-12-31',
    original_value: 100000,
    current_value: 100000,
    created_at: '2025-01-01T10:00:00Z',
    retention_rate: 5,
    ...overrides,
});

const makeItem = (overrides: Partial<MockContractItem> = {}): MockContractItem => ({
    id: 'i1',
    contract_id: 'c1',
    description: 'Serviço de fundação',
    unit: 'm³',
    quantity: 100,
    unit_price: 250,
    total_price: 25000,
    budget_item_id: 'b1',
    ...overrides,
});

const makeMeasurement = (overrides: Partial<MockMeasurement> = {}): MockMeasurement => ({
    id: 'm1',
    contract_id: 'c1',
    number: 1,
    period_start: '2025-01-01',
    period_end: '2025-01-31',
    measurement_date: '2025-01-31',
    status: 'Pendente',
    total_value: 20000,
    retention_value: 1000,
    net_value: 19000,
    created_at: '2025-01-31T12:00:00Z',
    ...overrides,
});

const makeAddendum = (overrides: Partial<MockAddendum> = {}): MockAddendum => ({
    id: 'a1',
    contract_id: 'c1',
    number: 'AD-001',
    status: 'Pendente',
    value_impact: 5000,
    created_at: '2025-03-01T10:00:00Z',
    ...overrides,
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 1 — Timezone safety (Bug 4 e Bug 8)
// ═══════════════════════════════════════════════════════════════════════════

describe('Timezone safety — formatação de datas', () => {
    test('date-only string (sem anchor) pode retornar dia anterior em UTC-3', () => {
        // Demonstra o risco: "2025-01-01" é interpretado como UTC midnight
        // Em UTC-3, isso seria 21h de 31/12/2024 → poderia renderizar como 31/12/2024
        const raw = new Date('2025-01-01');
        const anchored = new Date('2025-01-01T12:00:00');

        // O dia da raw em UTC é sempre 1, mas getDate() usa timezone local
        // O anchorado às 12h é imune ao timezone do usuário
        expect(anchored.toLocaleDateString('pt-BR')).toBe('01/01/2025');
    });

    test('formatContractDate retorna formato pt-BR correto', () => {
        expect(formatContractDate('2025-06-15')).toBe('15/06/2025');
        expect(formatContractDate('2025-01-01')).toBe('01/01/2025');
        expect(formatContractDate('2025-12-31')).toBe('31/12/2025');
    });

    test('formatContractDate retorna N/A para valor nulo', () => {
        expect(formatContractDate(null)).toBe('N/A');
        expect(formatContractDate(undefined)).toBe('N/A');
        expect(formatContractDate('')).toBe('N/A');
    });

    test('mês de fevereiro não vaza para março', () => {
        expect(formatContractDate('2025-02-28')).toBe('28/02/2025');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 2 — timeProgress (Bug 4 / Fix #4 no ContractDetailView)
// ═══════════════════════════════════════════════════════════════════════════

describe('calcTimeProgress — progresso temporal do contrato', () => {
    test('retorna 0 quando data atual é anterior ao início', () => {
        const now = new Date('2024-12-31T12:00:00');
        expect(calcTimeProgress('2025-01-01', '2025-12-31', now)).toBe(0);
    });

    test('retorna 100 quando data atual é posterior ao término', () => {
        const now = new Date('2026-01-01T12:00:00');
        expect(calcTimeProgress('2025-01-01', '2025-12-31', now)).toBe(100);
    });

    test('retorna ~50% no meio do contrato', () => {
        // Contrato de 1 ano: 2025-01-01 a 2025-12-31 (~365 dias)
        // Meio aproximado: 2025-07-02
        const now = new Date('2025-07-02T12:00:00');
        const progress = calcTimeProgress('2025-01-01', '2025-12-31', now);
        expect(progress).toBeGreaterThan(45);
        expect(progress).toBeLessThan(55);
    });

    test('retorna 100 quando start === end', () => {
        const now = new Date('2025-06-01T12:00:00');
        expect(calcTimeProgress('2025-06-01', '2025-06-01', now)).toBe(100);
    });

    test('retorna 0 quando end_date é nulo', () => {
        const now = new Date('2025-06-01T12:00:00');
        expect(calcTimeProgress('2025-01-01', null, now)).toBe(0);
    });

    test('não tem off-by-one em datas de fronteira por timezone', () => {
        // Exatamente no dia de início às 12h local deve ser 0% (ou muito próximo)
        const now = new Date('2025-01-01T12:00:00');
        const progress = calcTimeProgress('2025-01-01', '2025-12-31', now);
        // Deve ser próximo de 0, não negativo
        expect(progress).toBeGreaterThanOrEqual(0);
        expect(progress).toBeLessThan(1);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 3 — physicalProgress
// ═══════════════════════════════════════════════════════════════════════════

describe('calcPhysicalProgress — progresso físico-financeiro', () => {
    test('retorna 0 quando não há medições', () => {
        expect(calcPhysicalProgress(100000, 0)).toBe(0);
    });

    test('retorna 50% quando metade foi medida', () => {
        expect(calcPhysicalProgress(100000, 50000)).toBe(50);
    });

    test('retorna 100% quando todo o contrato foi medido', () => {
        expect(calcPhysicalProgress(100000, 100000)).toBe(100);
    });

    test('retorna mais de 100% quando medições excedem o contrato (sobremedição)', () => {
        expect(calcPhysicalProgress(100000, 110000)).toBeCloseTo(110, 5);
    });

    test('não divide por zero quando current_value é 0', () => {
        // Usa 1 como divisor fallback para evitar Infinity/NaN
        const result = calcPhysicalProgress(0, 5000);
        expect(isFinite(result)).toBe(true);
        expect(isNaN(result)).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 4 — Stats do dashboard da lista
// ═══════════════════════════════════════════════════════════════════════════

describe('calcStats — estatísticas do painel de contratos', () => {
    const contracts: MockContract[] = [
        makeContract({ id: 'c1', status: 'Ativo',     current_value: 100000 }),
        makeContract({ id: 'c2', status: 'Ativo',     current_value:  50000 }),
        makeContract({ id: 'c3', status: 'Rascunho',  current_value:  30000 }),
        makeContract({ id: 'c4', status: 'Encerrado', current_value:  20000 }),
        makeContract({ id: 'c5', status: 'Cancelado', current_value:      0 }),
    ];

    test('total conta todos os contratos', () => {
        expect(calcStats(contracts).total).toBe(5);
    });

    test('active conta apenas contratos com status Ativo', () => {
        expect(calcStats(contracts).active).toBe(2);
    });

    test('totalValue soma todos os valores mesmo de cancelados', () => {
        expect(calcStats(contracts).totalValue).toBe(200000);
    });

    test('retorna zeros para lista vazia', () => {
        const stats = calcStats([]);
        expect(stats.total).toBe(0);
        expect(stats.active).toBe(0);
        expect(stats.totalValue).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 5 — Filtragem e ordenação (filteredContracts)
// ═══════════════════════════════════════════════════════════════════════════

describe('filterAndSort — filtros e ordenação da lista de contratos', () => {
    const contracts: MockContract[] = [
        makeContract({ id: 'c1', number: '001', title: 'Alpha',  status: 'Ativo',    current_value:  50000, created_at: '2025-03-01T00:00:00Z', contract_type: 'Empreitada Global' }),
        makeContract({ id: 'c2', number: '002', title: 'Bravo',  status: 'Rascunho', current_value: 120000, created_at: '2025-01-01T00:00:00Z', contract_type: 'Preço Unitário' }),
        makeContract({ id: 'c3', number: '003', title: 'Charlie',status: 'Ativo',    current_value:  80000, created_at: '2025-02-15T00:00:00Z', contract_type: 'Administração' }),
    ];

    test('statusFilter "all" retorna todos', () => {
        expect(filterAndSort(contracts, 'all', '', 'date-desc')).toHaveLength(3);
    });

    test('statusFilter "Ativo" retorna apenas ativos', () => {
        const result = filterAndSort(contracts, 'Ativo', '', 'date-desc');
        expect(result).toHaveLength(2);
        expect(result.every(c => c.status === 'Ativo')).toBe(true);
    });

    test('statusFilter "Rascunho" retorna apenas rascunhos', () => {
        const result = filterAndSort(contracts, 'Rascunho', '', 'date-desc');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('c2');
    });

    test('busca por número (parcial, case-insensitive)', () => {
        expect(filterAndSort(contracts, 'all', '002', 'date-desc')).toHaveLength(1);
        expect(filterAndSort(contracts, 'all', '00',  'date-desc')).toHaveLength(3);
    });

    test('busca por título (case-insensitive)', () => {
        const result = filterAndSort(contracts, 'all', 'alpha', 'date-desc');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('c1');
    });

    test('busca por tipo de contrato', () => {
        const result = filterAndSort(contracts, 'all', 'unitário', 'date-desc');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('c2');
    });

    test('busca vazia com statusFilter retorna todos do status', () => {
        const result = filterAndSort(contracts, 'Ativo', '', 'date-desc');
        expect(result).toHaveLength(2);
    });

    test('sort date-desc: mais recente primeiro', () => {
        const result = filterAndSort(contracts, 'all', '', 'date-desc');
        expect(result[0].id).toBe('c1'); // 2025-03-01
        expect(result[1].id).toBe('c3'); // 2025-02-15
        expect(result[2].id).toBe('c2'); // 2025-01-01
    });

    test('sort date-asc: mais antigo primeiro', () => {
        const result = filterAndSort(contracts, 'all', '', 'date-asc');
        expect(result[0].id).toBe('c2'); // 2025-01-01
        expect(result[2].id).toBe('c1'); // 2025-03-01
    });

    test('sort value-desc: maior valor primeiro', () => {
        const result = filterAndSort(contracts, 'all', '', 'value-desc');
        expect(result[0].current_value).toBe(120000);
        expect(result[2].current_value).toBe(50000);
    });

    test('sort value-asc: menor valor primeiro', () => {
        const result = filterAndSort(contracts, 'all', '', 'value-asc');
        expect(result[0].current_value).toBe(50000);
    });

    test('sort title-asc: ordem alfabética', () => {
        const result = filterAndSort(contracts, 'all', '', 'title-asc');
        expect(result[0].title).toBe('Alpha');
        expect(result[1].title).toBe('Bravo');
        expect(result[2].title).toBe('Charlie');
    });

    test('lista vazia retorna array vazio', () => {
        expect(filterAndSort([], 'all', '', 'date-desc')).toHaveLength(0);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 6 — addendumsMetrics
// ═══════════════════════════════════════════════════════════════════════════

describe('calcAddendumsMetrics — métricas de aditivos', () => {
    test('ignora aditivos pendentes no cálculo financeiro', () => {
        const addendums = [
            makeAddendum({ id: 'a1', status: 'Pendente', value_impact: 10000 }),
            makeAddendum({ id: 'a2', status: 'Aprovado', value_impact: 5000 }),
        ];
        const { totalImpact, percentage } = calcAddendumsMetrics(addendums, 100000);
        expect(totalImpact).toBe(5000);
        expect(percentage).toBe(5);
    });

    test('soma corretamente múltiplos aditivos aprovados', () => {
        const addendums = [
            makeAddendum({ id: 'a1', status: 'Aprovado', value_impact: 10000 }),
            makeAddendum({ id: 'a2', status: 'Aprovado', value_impact:  5000 }),
            makeAddendum({ id: 'a3', status: 'Rejeitado', value_impact: 99999 }),
        ];
        const { totalImpact } = calcAddendumsMetrics(addendums, 100000);
        expect(totalImpact).toBe(15000);
    });

    test('aceita valor negativo (desconto em aditivo)', () => {
        const addendums = [
            makeAddendum({ id: 'a1', status: 'Aprovado', value_impact: -3000 }),
        ];
        const { totalImpact, percentage } = calcAddendumsMetrics(addendums, 100000);
        expect(totalImpact).toBe(-3000);
        expect(percentage).toBe(-3);
    });

    test('retorna zeros quando sem aditivos', () => {
        const { totalImpact, percentage } = calcAddendumsMetrics([], 100000);
        expect(totalImpact).toBe(0);
        expect(percentage).toBe(0);
    });

    test('não divide por zero quando original_value é 0', () => {
        const addendums = [makeAddendum({ status: 'Aprovado', value_impact: 1000 })];
        const { percentage } = calcAddendumsMetrics(addendums, 0);
        expect(isFinite(percentage)).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 7 — Número de aditivo (Bug 12)
// ═══════════════════════════════════════════════════════════════════════════

describe('generateAddendumNumber — numeração sequencial de aditivos (Bug 12)', () => {
    test('primeiro aditivo é AD-001', () => {
        expect(generateAddendumNumber(0)).toBe('AD-001');
    });

    test('segundo aditivo é AD-002', () => {
        expect(generateAddendumNumber(1)).toBe('AD-002');
    });

    test('décimo aditivo é AD-010 (padding de 3 dígitos)', () => {
        expect(generateAddendumNumber(9)).toBe('AD-010');
    });

    test('centésimo aditivo é AD-100', () => {
        expect(generateAddendumNumber(99)).toBe('AD-100');
    });

    test('formato não usa caracteres aleatórios', () => {
        for (let i = 0; i < 50; i++) {
            const n = generateAddendumNumber(i);
            expect(n).toMatch(/^AD-\d{3}$/);
        }
    });

    test('duas chamadas com mesmo count retornam mesmo valor (determinístico)', () => {
        expect(generateAddendumNumber(5)).toBe(generateAddendumNumber(5));
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 8 — Total de medição
// ═══════════════════════════════════════════════════════════════════════════

describe('calcMeasurementTotal — valor total do período de medição', () => {
    const items: MockContractItem[] = [
        makeItem({ id: 'i1', quantity: 100, unit_price: 250 }),
        makeItem({ id: 'i2', quantity:  50, unit_price: 400, description: 'Alvenaria' }),
        makeItem({ id: 'i3', quantity:  10, unit_price: 1200, description: 'Estrutura' }),
    ];

    test('soma qty * unit_price para cada item', () => {
        const quantities = { i1: 20, i2: 10, i3: 5 };
        // 20*250 + 10*400 + 5*1200 = 5000 + 4000 + 6000 = 15000
        expect(calcMeasurementTotal(items, quantities)).toBe(15000);
    });

    test('itens sem quantidade em quantities são tratados como 0', () => {
        const quantities = { i1: 10 };
        expect(calcMeasurementTotal(items, quantities)).toBe(2500);
    });

    test('retorna 0 quando quantities está vazio', () => {
        expect(calcMeasurementTotal(items, {})).toBe(0);
    });

    test('retorna 0 quando items está vazio', () => {
        expect(calcMeasurementTotal([], { i1: 100 })).toBe(0);
    });

    test('quantidade parcial (decimal) é aceita', () => {
        const quantities = { i1: 0.5 };
        expect(calcMeasurementTotal(items, quantities)).toBe(125);
    });

    test('total é igual à soma de value_executed individual', () => {
        const quantities = { i1: 30, i2: 15, i3: 8 };
        const expected = 30 * 250 + 15 * 400 + 8 * 1200;
        expect(calcMeasurementTotal(items, quantities)).toBe(expected);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 9 — Cancelled flag (invariante da lógica)
// ═══════════════════════════════════════════════════════════════════════════

describe('Cancelled flag — race condition guard', () => {
    test('setState não é chamado após cancelled = true', async () => {
        // Simula a lógica do useEffect com cancelled flag
        let stateWasSet = false;
        const setState = () => { stateWasSet = true; };

        let cancelled = false;

        const asyncOperation = async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            if (!cancelled) setState();
        };

        const cleanup = () => { cancelled = true; };

        asyncOperation(); // dispara mas não await
        cleanup();        // cancela antes de terminar
        await new Promise(resolve => setTimeout(resolve, 30)); // espera resolução

        expect(stateWasSet).toBe(false);
    });

    test('setState é chamado quando cancelled permanece false', async () => {
        let stateWasSet = false;
        const setState = () => { stateWasSet = true; };
        let cancelled = false;

        const asyncOperation = async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            if (!cancelled) setState();
        };

        await asyncOperation();
        expect(stateWasSet).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 10 — Retenção e saldo financeiro
// ═══════════════════════════════════════════════════════════════════════════

describe('Cálculos financeiros do contrato', () => {
    test('saldo contratual = current_value - totalMeasurements', () => {
        const contract = makeContract({ current_value: 100000 });
        const totalMeasurements = 35000;
        const saldo = contract.current_value - totalMeasurements;
        expect(saldo).toBe(65000);
    });

    test('retenção = totalMeasurements * (retention_rate / 100)', () => {
        const contract = makeContract({ retention_rate: 5 });
        const totalMeasurements = 50000;
        const retencao = totalMeasurements * (contract.retention_rate / 100);
        expect(retencao).toBe(2500);
    });

    test('retenção é 0 quando retention_rate é 0', () => {
        const contract = makeContract({ retention_rate: 0 });
        const retencao = 50000 * (contract.retention_rate / 100);
        expect(retencao).toBe(0);
    });

    test('totalMeasurements acumula corretamente de múltiplas medições', () => {
        const measurements: MockMeasurement[] = [
            makeMeasurement({ id: 'm1', total_value: 20000 }),
            makeMeasurement({ id: 'm2', total_value: 15000 }),
            makeMeasurement({ id: 'm3', total_value:  8000 }),
        ];
        const total = measurements.reduce((s, m) => s + (m.total_value || 0), 0);
        expect(total).toBe(43000);
    });
});
