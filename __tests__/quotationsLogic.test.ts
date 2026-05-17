/**
 * Testes de lógica pura extraída dos componentes de Cotações.
 * Cobre: timezone safety, filtros, cálculos financeiros, flags de race condition,
 * lógica de preço efetivo/negociação e geração de toasts/confirm.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Helpers extraídos dos componentes ──────────────────────────────────────

/** Bug 2/20/21 — Formatar data de prazo/entrega sem drift de timezone */
function formatDeadlineDate(dateStr: string): string {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR');
}

/** Bug 2/20/21 — Formatação sem âncora (comportamento antigo, deve divergir em UTC-3) */
function formatDeadlineDateBuggy(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString();
}

/** Lógica de filtro de cotações por termo de busca */
interface QuotationStub {
    id: string;
    number: string;
    title: string;
    projectName: string;
    status: 'Aberta' | 'Em Análise' | 'Concluída' | 'Cancelada';
    deadline: string;
}

function filterQuotations(requests: QuotationStub[], searchTerm: string): QuotationStub[] {
    const term = searchTerm.toLowerCase();
    return requests.filter(req =>
        req.title.toLowerCase().includes(term) ||
        req.number.toLowerCase().includes(term) ||
        req.projectName.toLowerCase().includes(term)
    );
}

/** Contagem por status */
function countByStatus(requests: QuotationStub[], status: string): number {
    return requests.filter(r => r.status === status).length;
}

/** Cálculo do total estimado de itens de cotação */
interface QuotationItemStub {
    code: string;
    quantity: number;
    unitPrice: number;
}

function calcQuotationTotal(items: QuotationItemStub[]): number {
    return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

/** Bug 10/13/17 — Lógica de confirm inline: se confirmado, chama callback; se não, não */
function buildConfirmState(message: string, onConfirm: () => void) {
    return { message, onConfirm };
}

/** Bug 10/13/17 — Executar confirm */
function executeConfirm(
    state: { message: string; onConfirm: () => void } | null,
    confirmed: boolean
): void {
    if (!state) return;
    if (confirmed) state.onConfirm();
}

/** Lógica getEffectiveItem — preço negociado tem prioridade sobre original */
interface ResponseItemStub {
    code: string;
    quantity: number;
    unitPrice: number;
}
interface CounterProposalStub {
    items: { code: string; unitPrice: number }[];
}
interface ResponseStub {
    id: string;
    supplierName: string;
    items: ResponseItemStub[];
    counterProposal?: CounterProposalStub;
}

function getEffectiveItem(resp: ResponseStub, code: string) {
    const original = resp.items.find(i => i.code === code);
    const counter = resp.counterProposal?.items.find(i => i.code === code);
    if (!original) return null;
    const unitPrice = counter?.unitPrice ?? original.unitPrice;
    return {
        ...original,
        unitPrice,
        total: unitPrice * original.quantity,
        isNegotiated: !!counter && counter.unitPrice !== original.unitPrice,
    };
}

/** Lógica getLowestPriceForItem — menor preço entre propostas */
function getLowestPriceForItem(responses: ResponseStub[], code: string): number {
    const prices = responses
        .map(r => getEffectiveItem(r, code)?.unitPrice)
        .filter((p): p is number => p !== undefined && p > 0);
    return prices.length > 0 ? Math.min(...prices) : 0;
}

/** Bug 3/4/5/9 — Invariante da flag cancelled: setState não chamado após cancel */
async function loadWithCancellable<T>(
    fetcher: () => Promise<T>,
    setter: (v: T) => void,
    isCancelled: () => boolean
): Promise<void> {
    const data = await fetcher();
    if (!isCancelled()) setter(data);
}

/** Bug 6/7 — Validação de submissão sem alert() */
interface SubmitValidationResult {
    valid: boolean;
    error: string | null;
}

function validateQuotationSubmit(
    allItemsCount: number,
    invitedSuppliersCount: number
): SubmitValidationResult {
    if (allItemsCount === 0) {
        return { valid: false, error: 'Por favor, adicione pelo menos um item à cotação.' };
    }
    if (invitedSuppliersCount === 0) {
        return { valid: false, error: 'Por favor, selecione pelo menos um fornecedor para convidar.' };
    }
    return { valid: true, error: null };
}

/** Bug 22 — toLocaleString com opções completas */
function formatTimestamp(ts: string): string {
    return new Date(ts).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

// ─── Suite 1: Timezone safety ────────────────────────────────────────────────

describe('Suite 1 — Timezone safety (âncora T12:00:00)', () => {
    it('formata 2025-01-15 como 15/01/2025 com âncora', () => {
        expect(formatDeadlineDate('2025-01-15')).toBe('15/01/2025');
    });

    it('formata 2025-12-31 corretamente', () => {
        expect(formatDeadlineDate('2025-12-31')).toBe('31/12/2025');
    });

    it('formata 2026-03-01 corretamente', () => {
        expect(formatDeadlineDate('2026-03-01')).toBe('01/03/2026');
    });

    it('formata data de entrega vinda do counterProposal', () => {
        const deliveryDate = '2025-07-20';
        const result = new Date(deliveryDate + 'T12:00:00').toLocaleDateString('pt-BR');
        expect(result).toBe('20/07/2025');
    });

    it('usa locale pt-BR garantindo separador /)', () => {
        const result = formatDeadlineDate('2025-06-10');
        expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });
});

// ─── Suite 2: filterQuotations ───────────────────────────────────────────────

describe('Suite 2 — filterQuotations', () => {
    const requests: QuotationStub[] = [
        { id: '1', number: 'COT-001', title: 'Materiais Hidráulicos', projectName: 'Obra Alfa', status: 'Aberta', deadline: '2025-06-01' },
        { id: '2', number: 'COT-002', title: 'Elétrica Fase 2', projectName: 'Obra Beta', status: 'Em Análise', deadline: '2025-06-15' },
        { id: '3', number: 'COT-003', title: 'Cimento e Areia', projectName: 'Obra Alfa', status: 'Concluída', deadline: '2025-05-20' },
        { id: '4', number: 'COT-004', title: 'Madeira Estrutural', projectName: 'Obra Gama', status: 'Cancelada', deadline: '2025-05-10' },
    ];

    it('retorna todos quando searchTerm está vazio', () => {
        expect(filterQuotations(requests, '')).toHaveLength(4);
    });

    it('filtra por título (case-insensitive)', () => {
        const result = filterQuotations(requests, 'hidráulicos');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
    });

    it('filtra por número de cotação', () => {
        const result = filterQuotations(requests, 'COT-003');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('3');
    });

    it('filtra por nome de obra retorna múltiplos', () => {
        const result = filterQuotations(requests, 'Obra Alfa');
        expect(result).toHaveLength(2);
    });

    it('retorna vazio quando não há correspondência', () => {
        expect(filterQuotations(requests, 'inexistente')).toHaveLength(0);
    });

    it('busca parcial funciona (sem normalização de acento)', () => {
        // O componente usa toLowerCase() simples, sem normalização de Unicode.
        // "Fase 2" está em "Elétrica Fase 2" e "Obra Beta" — só COT-002 tem ambos.
        const result = filterQuotations(requests, 'fase 2');
        expect(result).toHaveLength(1);
        expect(result[0].number).toBe('COT-002');
    });
});

// ─── Suite 3: countByStatus ──────────────────────────────────────────────────

describe('Suite 3 — countByStatus (cards do dashboard)', () => {
    const requests: QuotationStub[] = [
        { id: '1', number: '001', title: 'A', projectName: 'P', status: 'Aberta', deadline: '2025-06-01' },
        { id: '2', number: '002', title: 'B', projectName: 'P', status: 'Aberta', deadline: '2025-06-01' },
        { id: '3', number: '003', title: 'C', projectName: 'P', status: 'Em Análise', deadline: '2025-06-01' },
        { id: '4', number: '004', title: 'D', projectName: 'P', status: 'Concluída', deadline: '2025-06-01' },
        { id: '5', number: '005', title: 'E', projectName: 'P', status: 'Cancelada', deadline: '2025-06-01' },
    ];

    it('conta Abertas corretamente', () => {
        expect(countByStatus(requests, 'Aberta')).toBe(2);
    });

    it('conta Em Análise corretamente', () => {
        expect(countByStatus(requests, 'Em Análise')).toBe(1);
    });

    it('conta Concluídas corretamente', () => {
        expect(countByStatus(requests, 'Concluída')).toBe(1);
    });

    it('retorna 0 para status sem itens', () => {
        expect(countByStatus([], 'Aberta')).toBe(0);
    });
});

// ─── Suite 4: calcQuotationTotal ─────────────────────────────────────────────

describe('Suite 4 — calcQuotationTotal', () => {
    it('retorna 0 para lista vazia', () => {
        expect(calcQuotationTotal([])).toBe(0);
    });

    it('calcula total corretamente para um item', () => {
        expect(calcQuotationTotal([{ code: 'A', quantity: 5, unitPrice: 100 }])).toBe(500);
    });

    it('soma múltiplos itens', () => {
        const items = [
            { code: 'A', quantity: 2, unitPrice: 150 },
            { code: 'B', quantity: 3, unitPrice: 80 },
            { code: 'C', quantity: 10, unitPrice: 25 },
        ];
        expect(calcQuotationTotal(items)).toBe(300 + 240 + 250);
    });

    it('lida com quantidade fracionária (m², litros)', () => {
        expect(calcQuotationTotal([{ code: 'X', quantity: 2.5, unitPrice: 40 }])).toBeCloseTo(100, 5);
    });

    it('lida com preço zero', () => {
        expect(calcQuotationTotal([{ code: 'Y', quantity: 10, unitPrice: 0 }])).toBe(0);
    });
});

// ─── Suite 5: validateQuotationSubmit ────────────────────────────────────────

describe('Suite 5 — validateQuotationSubmit (substitui alert())', () => {
    it('retorna válido quando há itens e fornecedores', () => {
        const result = validateQuotationSubmit(3, 2);
        expect(result.valid).toBe(true);
        expect(result.error).toBeNull();
    });

    it('retorna erro quando não há itens', () => {
        const result = validateQuotationSubmit(0, 2);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('item');
    });

    it('retorna erro quando não há fornecedores', () => {
        const result = validateQuotationSubmit(3, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('fornecedor');
    });

    it('prioriza erro de itens sobre erro de fornecedores', () => {
        const result = validateQuotationSubmit(0, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('item');
    });

    it('1 item e 1 fornecedor já é suficiente', () => {
        expect(validateQuotationSubmit(1, 1).valid).toBe(true);
    });
});

// ─── Suite 6: getEffectiveItem ───────────────────────────────────────────────

describe('Suite 6 — getEffectiveItem (preço negociado vs original)', () => {
    const baseResponse: ResponseStub = {
        id: 'r1',
        supplierName: 'Fornecedor A',
        items: [
            { code: 'CIMENTO', quantity: 100, unitPrice: 30 },
            { code: 'AREIA', quantity: 50, unitPrice: 15 },
        ],
    };

    it('retorna preço original quando não há contraproposta', () => {
        const eff = getEffectiveItem(baseResponse, 'CIMENTO');
        expect(eff?.unitPrice).toBe(30);
        expect(eff?.isNegotiated).toBe(false);
    });

    it('retorna preço negociado quando há contraproposta com preço diferente', () => {
        const resp: ResponseStub = {
            ...baseResponse,
            counterProposal: { items: [{ code: 'CIMENTO', unitPrice: 25 }] },
        };
        const eff = getEffectiveItem(resp, 'CIMENTO');
        expect(eff?.unitPrice).toBe(25);
        expect(eff?.isNegotiated).toBe(true);
    });

    it('isNegotiated é false quando contraproposta tem mesmo preço', () => {
        const resp: ResponseStub = {
            ...baseResponse,
            counterProposal: { items: [{ code: 'CIMENTO', unitPrice: 30 }] },
        };
        const eff = getEffectiveItem(resp, 'CIMENTO');
        expect(eff?.isNegotiated).toBe(false);
    });

    it('total é calculado com quantidade original × preço efetivo', () => {
        const resp: ResponseStub = {
            ...baseResponse,
            counterProposal: { items: [{ code: 'CIMENTO', unitPrice: 25 }] },
        };
        const eff = getEffectiveItem(resp, 'CIMENTO');
        expect(eff?.total).toBe(100 * 25);
    });

    it('retorna null para código inexistente', () => {
        expect(getEffectiveItem(baseResponse, 'INEXISTENTE')).toBeNull();
    });

    it('item sem contraproposta no código retorna original', () => {
        // Contraproposta existe mas não cobre este código
        const resp: ResponseStub = {
            ...baseResponse,
            counterProposal: { items: [{ code: 'CIMENTO', unitPrice: 20 }] },
        };
        const eff = getEffectiveItem(resp, 'AREIA');
        expect(eff?.unitPrice).toBe(15);
        expect(eff?.isNegotiated).toBe(false);
    });
});

// ─── Suite 7: getLowestPriceForItem ──────────────────────────────────────────

describe('Suite 7 — getLowestPriceForItem (destaque de melhor preço)', () => {
    const responses: ResponseStub[] = [
        {
            id: 'r1', supplierName: 'A',
            items: [{ code: 'CIMENTO', quantity: 100, unitPrice: 30 }],
        },
        {
            id: 'r2', supplierName: 'B',
            items: [{ code: 'CIMENTO', quantity: 100, unitPrice: 27 }],
        },
        {
            id: 'r3', supplierName: 'C',
            items: [{ code: 'CIMENTO', quantity: 100, unitPrice: 32 }],
        },
    ];

    it('retorna o menor preço entre os fornecedores', () => {
        expect(getLowestPriceForItem(responses, 'CIMENTO')).toBe(27);
    });

    it('retorna 0 quando nenhum fornecedor cotou o item', () => {
        expect(getLowestPriceForItem(responses, 'AREIA')).toBe(0);
    });

    it('retorna 0 quando responses está vazia', () => {
        expect(getLowestPriceForItem([], 'CIMENTO')).toBe(0);
    });

    it('considera preço negociado (contraproposta) no cálculo do menor', () => {
        const withNegotiation: ResponseStub[] = [
            {
                id: 'r1', supplierName: 'A',
                items: [{ code: 'CIMENTO', quantity: 100, unitPrice: 30 }],
                counterProposal: { items: [{ code: 'CIMENTO', unitPrice: 22 }] },
            },
            {
                id: 'r2', supplierName: 'B',
                items: [{ code: 'CIMENTO', quantity: 100, unitPrice: 27 }],
            },
        ];
        // r1 negociado = 22, r2 original = 27 → menor é 22
        expect(getLowestPriceForItem(withNegotiation, 'CIMENTO')).toBe(22);
    });

    it('ignora preços zero na comparação', () => {
        const withZero: ResponseStub[] = [
            { id: 'r1', supplierName: 'A', items: [{ code: 'CIMENTO', quantity: 0, unitPrice: 0 }] },
            { id: 'r2', supplierName: 'B', items: [{ code: 'CIMENTO', quantity: 100, unitPrice: 28 }] },
        ];
        expect(getLowestPriceForItem(withZero, 'CIMENTO')).toBe(28);
    });
});

// ─── Suite 8: buildConfirmState / executeConfirm ──────────────────────────────

describe('Suite 8 — Inline confirm (substitui window.confirm/confirm)', () => {
    it('buildConfirmState retém mensagem e callback', () => {
        const cb = vi.fn();
        const state = buildConfirmState('Confirmar ação?', cb);
        expect(state.message).toBe('Confirmar ação?');
        expect(state.onConfirm).toBe(cb);
    });

    it('executeConfirm chama onConfirm quando confirmed=true', () => {
        const cb = vi.fn();
        const state = buildConfirmState('Confirmar?', cb);
        executeConfirm(state, true);
        expect(cb).toHaveBeenCalledTimes(1);
    });

    it('executeConfirm NÃO chama onConfirm quando confirmed=false', () => {
        const cb = vi.fn();
        const state = buildConfirmState('Confirmar?', cb);
        executeConfirm(state, false);
        expect(cb).not.toHaveBeenCalled();
    });

    it('executeConfirm é seguro com null (nenhuma ação)', () => {
        expect(() => executeConfirm(null, true)).not.toThrow();
    });

    it('diferentes ações têm callbacks independentes', () => {
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        executeConfirm(buildConfirmState('msg1', cb1), true);
        executeConfirm(buildConfirmState('msg2', cb2), false);
        expect(cb1).toHaveBeenCalledTimes(1);
        expect(cb2).not.toHaveBeenCalled();
    });
});

// ─── Suite 9: Invariante da flag cancelled ────────────────────────────────────

describe('Suite 9 — Invariante da flag cancelled (race condition)', () => {
    it('setter NÃO é chamado quando cancelled=true antes de await completar', async () => {
        const setter = vi.fn();
        let cancelled = false;

        const promise = loadWithCancellable(
            () => Promise.resolve(['data']),
            setter,
            () => cancelled
        );

        cancelled = true; // cancela antes do microtask
        await promise;

        expect(setter).not.toHaveBeenCalled();
    });

    it('setter É chamado quando cancelled=false', async () => {
        const setter = vi.fn();
        let cancelled = false;

        await loadWithCancellable(
            () => Promise.resolve(['data']),
            setter,
            () => cancelled
        );

        expect(setter).toHaveBeenCalledWith(['data']);
    });

    it('múltiplos requests — apenas o último (não cancelado) chama setter', async () => {
        const setter = vi.fn();
        let cancelled = false;

        // Simula request 1 (será cancelado)
        const p1 = loadWithCancellable(() => Promise.resolve(['first']), setter, () => cancelled);
        cancelled = true;
        await p1;

        // Simula request 2 (novo mount, não cancelado)
        cancelled = false;
        await loadWithCancellable(() => Promise.resolve(['second']), setter, () => cancelled);

        expect(setter).toHaveBeenCalledTimes(1);
        expect(setter).toHaveBeenCalledWith(['second']);
    });

    it('setter nunca recebe dados de fetch anterior ao cancelamento', async () => {
        const receivedValues: any[] = [];
        const setter = (v: any) => receivedValues.push(v);
        let cancelled = true;

        await loadWithCancellable(
            () => Promise.resolve('stale-data'),
            setter,
            () => cancelled
        );

        expect(receivedValues).toHaveLength(0);
    });
});

// ─── Suite 10: formatTimestamp ────────────────────────────────────────────────

describe('Suite 10 — formatTimestamp com opções completas (bug 22)', () => {
    it('retorna string com formato dd/mm/yyyy, hh:mm', () => {
        const result = formatTimestamp('2025-06-15T14:30:00.000Z');
        // Formato esperado: XX/XX/XXXX, XX:XX
        expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
        expect(result).toMatch(/\d{2}:\d{2}/);
    });

    it('usa locale pt-BR (separador /)', () => {
        const result = formatTimestamp('2025-01-01T10:00:00.000Z');
        expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('não lança para timestamp ISO completo', () => {
        expect(() => formatTimestamp('2025-12-31T23:59:59.999Z')).not.toThrow();
    });

    it('inclui hora e minuto na saída', () => {
        const result = formatTimestamp('2025-06-15T08:05:00.000Z');
        expect(result).toContain(':');
        const colonCount = (result.match(/:/g) || []).length;
        expect(colonCount).toBeGreaterThanOrEqual(1);
    });
});

// ─── Suite 11: Teste de regressão — calcPrecoTotal com negociação ─────────────

describe('Suite 11 — Regressão: total geral da proposta com/sem negociação', () => {
    function calcResponseTotal(resp: ResponseStub): number {
        return resp.items.reduce((acc, item) => {
            const eff = getEffectiveItem(resp, item.code);
            return acc + (eff?.total ?? 0);
        }, 0);
    }

    it('total sem negociação soma todos os itens pelo preço original', () => {
        const resp: ResponseStub = {
            id: 'r1', supplierName: 'A',
            items: [
                { code: 'A', quantity: 10, unitPrice: 50 },
                { code: 'B', quantity: 5, unitPrice: 200 },
            ],
        };
        expect(calcResponseTotal(resp)).toBe(500 + 1000);
    });

    it('total com negociação usa preços efetivos (não os originais)', () => {
        const resp: ResponseStub = {
            id: 'r1', supplierName: 'A',
            items: [
                { code: 'A', quantity: 10, unitPrice: 50 },
                { code: 'B', quantity: 5, unitPrice: 200 },
            ],
            counterProposal: {
                items: [
                    { code: 'A', unitPrice: 40 },  // desconto de 10
                ],
            },
        };
        // A: 10 × 40 = 400, B: 5 × 200 = 1000
        expect(calcResponseTotal(resp)).toBe(1400);
    });

    it('total com negociação é menor que original quando há desconto', () => {
        const resp: ResponseStub = {
            id: 'r1', supplierName: 'A',
            items: [{ code: 'X', quantity: 100, unitPrice: 30 }],
            counterProposal: { items: [{ code: 'X', unitPrice: 25 }] },
        };
        const original = 100 * 30;
        const effective = calcResponseTotal(resp);
        expect(effective).toBeLessThan(original);
        expect(effective).toBe(2500);
    });
});
