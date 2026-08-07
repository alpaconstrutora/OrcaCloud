/**
 * Rateio de despesa entre imóveis — puro, sem I/O.
 *
 * O invariante que este módulo existe para garantir:
 *
 *     soma das parcelas === valor do lançamento, SEMPRE
 *
 * Rateio que não fecha inventa ou some com despesa no NOI consolidado, em
 * silêncio. Um centavo por unidade, em 200 unidades, são R$ 2 por lançamento
 * que ninguém enxerga na tela — só aparece no fechamento do mês, quando já é
 * caro de investigar.
 *
 * A RPC `fn_set_property_allocations` revalida a soma no servidor e RECUSA o
 * que não fecha. Esta é a camada testável; aquela é a que impede um cliente com
 * bug de corromper o razão.
 */

export type AllocationBasis = 'DIRECT' | 'PRIVATE_AREA' | 'EQUAL' | 'MANUAL';

export interface AllocationTarget {
    id: string;
    /** Base do rateio proporcional. `null`/0 = sem área cadastrada. */
    private_area?: number | null;
    /** Fallback quando `private_area` não existe. */
    area?: number | null;
}

export interface Allocation {
    property_id: string;
    amount: number;
    basis: AllocationBasis;
    basis_value?: number;
}

export interface AllocationResult {
    allocations: Allocation[];
    /**
     * Quando o rateio caiu para divisão igualitária por falta de área
     * cadastrada. A tela PRECISA avisar: dividir igual entre uma quitinete e
     * uma cobertura é uma decisão, não um detalhe técnico — e o usuário tem de
     * saber que foi tomada por ele.
     */
    fellBackToEqual: boolean;
}

/** Centavos, para não somar float. `0.1 + 0.2 !== 0.3` destruiria o invariante. */
const toCents = (value: number): number => Math.round(value * 100);
const fromCents = (cents: number): number => cents / 100;

const areaOf = (target: AllocationTarget): number => {
    const area = target.private_area ?? target.area ?? 0;
    const numeric = Number(area);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

/**
 * Despesa inteira num único imóvel.
 */
export const allocateDirect = (propertyId: string, amount: number): AllocationResult => ({
    allocations: [{ property_id: propertyId, amount: fromCents(toCents(amount)), basis: 'DIRECT' }],
    fellBackToEqual: false,
});

/**
 * Rateia entre as unidades, proporcional à área privativa.
 *
 * O resto da divisão vai para a MAIOR parcela — método do maior resto,
 * simplificado. Distribuir o resto em vez de descartá-lo é o que faz a soma
 * fechar exatamente, inclusive com dízima (R$ 100 entre 3 unidades iguais =
 * 33,34 + 33,33 + 33,33).
 *
 * Sem NENHUMA área cadastrada, cai para divisão igualitária e sinaliza — nunca
 * divide em silêncio, e nunca devolve lista vazia deixando a despesa órfã.
 */
export const allocateProrated = (
    targets: AllocationTarget[],
    amount: number
): AllocationResult => {
    if (targets.length === 0) return { allocations: [], fellBackToEqual: false };

    const totalCents = toCents(amount);
    const areas = targets.map(areaOf);
    const totalArea = areas.reduce((sum, a) => sum + a, 0);
    const fellBackToEqual = totalArea <= 0;

    // Peso igual quando não há área: a alternativa seria não ratear, e aí a
    // despesa ficaria presa no edifício sem o usuário ter pedido isso.
    const weights = fellBackToEqual ? targets.map(() => 1) : areas;
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    // Piso de cada parcela, em centavos. Sempre <= a parte exata, então o resto
    // a distribuir é >= 0 — nunca negativo, nunca some centavo.
    const floors = weights.map(w => Math.floor((totalCents * w) / totalWeight));
    const distributed = floors.reduce((sum, c) => sum + c, 0);
    let remainder = totalCents - distributed;

    const cents = [...floors];
    // Ordem decrescente de peso: o resto (poucos centavos) cai em quem tem a
    // maior participação, que é onde ele menos distorce proporcionalmente.
    const order = targets
        .map((_, index) => index)
        .sort((a, b) => weights[b] - weights[a]);

    let cursor = 0;
    while (remainder > 0 && order.length > 0) {
        cents[order[cursor % order.length]] += 1;
        remainder -= 1;
        cursor += 1;
    }

    return {
        allocations: targets.map((target, index) => ({
            property_id: target.id,
            amount: fromCents(cents[index]),
            basis: fellBackToEqual ? 'EQUAL' : 'PRIVATE_AREA',
            basis_value: fellBackToEqual ? undefined : areas[index],
        })),
        fellBackToEqual,
    };
};

/**
 * Confere o invariante. A UI usa isto para nunca mostrar uma prévia que a RPC
 * vai recusar — falhar antes de salvar é muito melhor que depois.
 */
export const allocationsBalance = (allocations: Allocation[], amount: number): boolean =>
    allocations.reduce((sum, a) => sum + toCents(a.amount), 0) === toCents(amount);
