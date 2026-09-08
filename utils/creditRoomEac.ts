/**
 * EAC — Estimate at Completion (PRD §22).
 *
 * É o número com que o PRD vende o produto (§124): o banco não vê "um
 * orçamento.pdf", vê orçado → contratado → a contratar → EAC → desvio.
 *
 * ── Por que a conta ingênua não serve ───────────────────────────────────────
 *
 *     EAC = contratado + (orçado − contratado) = orçado
 *
 * Ela se anula. Um "EAC" que sempre devolve o orçamento não informa nada — e
 * pior, passa a impressão de rigor onde não há nenhum.
 *
 * O valor está em projetar para o que FALTA o desvio já observado no que foi
 * contratado:
 *
 *     fator       = Σ contratado(itens contratados) ÷ Σ orçado(esses itens)
 *     a_contratar = orçado_total − orçado(itens contratados)
 *     EAC         = contratado_total + a_contratar × fator
 *
 * Com `fator > 1` (contratou acima do orçado), o EAC fica ACIMA do orçamento —
 * que é exatamente o alerta que o financiador quer enxergar antes de liberar a
 * próxima parcela.
 *
 * O denominador só é conhecível porque `contract_items.budget_item_id` liga
 * cada item contratado ao item do orçamento. Medido em 07/09: 45 de 45
 * preenchidos.
 */

import { round2 } from './financialMath';


/** De onde saiu o custo total da obra — o rótulo viaja com o número. */
export type OrigemCusto = 'ORCAMENTO_DETALHADO' | 'VALOR_ESTIMADO' | 'AUSENTE';

export interface CustoTotal {
    valor: number | null;
    origem: OrigemCusto;
    /** O outro candidato, para a tela poder mostrar os dois quando divergem. */
    orcadoDetalhado: number;
    valorEstimado: number | null;
}

/**
 * Qual número serve de "custo total da obra" — o denominador do LTC e do equity.
 *
 * ── Por que não basta somar o orçamento ─────────────────────────────────────
 *
 * Medido em 07/09/2026 no `Garden Cambuhy`: o orçamento detalhado tem **2
 * itens, R$ 173.650** (escavação e armadura de estacas), enquanto a obra
 * declara `valorEstimado: R$ 18.000.000`. Usar os R$ 173 mil daria um LTC de
 * milhares por cento — o mesmo absurdo que já apareceu na demonstração.
 *
 * ── A regra, e por que ela é defensável ─────────────────────────────────────
 *
 * A empresa declara uma estimativa para a obra INTEIRA. Um orçamento detalhado
 * **abaixo** dessa estimativa significa orçamento inacabado, não obra mais
 * barata — ninguém estima 18 milhões e orça 173 mil como o todo. Quando o
 * detalhado alcança ou passa a estimativa, ele é a fonte melhor (e mais
 * conservadora), e vence.
 *
 * ⚠️ **A origem é tão importante quanto o valor.** "Orçamento detalhado de
 * R$ 18M" e "estimativa declarada de R$ 18M" são afirmações diferentes para um
 * analista de crédito, e ele precisa saber qual está lendo. Por isso `origem`
 * não é opcional e a tela é obrigada a mostrá-la.
 */
export function escolherCustoTotal(
    orcadoDetalhado: number,
    valorEstimado: number | null | undefined,
): CustoTotal {
    const est = valorEstimado != null && Number(valorEstimado) > 0 ? Number(valorEstimado) : null;
    const det = Number(orcadoDetalhado) || 0;

    if (det <= 0 && est == null) {
        return { valor: null, origem: 'AUSENTE', orcadoDetalhado: det, valorEstimado: est };
    }
    if (est == null) {
        return { valor: det, origem: 'ORCAMENTO_DETALHADO', orcadoDetalhado: det, valorEstimado: null };
    }
    if (det >= est) {
        return { valor: det, origem: 'ORCAMENTO_DETALHADO', orcadoDetalhado: det, valorEstimado: est };
    }
    return { valor: est, origem: 'VALOR_ESTIMADO', orcadoDetalhado: det, valorEstimado: est };
}

/** Item do orçamento como `projects.budget` o guarda. */
export interface ItemOrcado {
    id: string;
    quantity?: number;
    bdi?: number;
    sinapiItem?: { price?: number };
}

/** Item contratado, de `contract_items`. */
export interface ItemContratado {
    budgetItemId: string;
    totalPrice: number;
}

export interface ResultadoEac {
    /** Σ do orçamento inteiro (fórmula canônica qty·preço·(1+bdi)). */
    orcado: number;
    /** Σ do que já virou contrato. */
    contratado: number;
    /** Σ orçado APENAS dos itens que já têm contrato — o denominador do fator. */
    orcadoDosContratados: number;
    /** Orçado que ainda não virou contrato. */
    aContratar: number;
    /**
     * Contratado ÷ orçado dos mesmos itens. `null` quando nada foi contratado
     * (ou quando o orçado desses itens é zero) — e aí não há desvio observado
     * para projetar, então o EAC não pode ser melhor que o próprio orçamento.
     */
    fator: number | null;
    /** `null` sem orçamento: um EAC de R$ 0,00 seria pior que admitir a falta. */
    eac: number | null;
    /** EAC ÷ orçado − 1, em %. Positivo = estouro projetado. */
    desvioPct: number | null;
    /**
     * Itens contratados cujo `budget_item_id` não existe no orçamento atual.
     * Não entram no fator (falta o denominador) mas entram no contratado — e
     * a tela precisa poder dizer isso, porque um fator calculado sobre metade
     * dos contratos não é o mesmo número.
     */
    contratadosSemOrcamento: number;
}

/** Σ qty·preço·(1+bdi/100) de um item — a fórmula canônica de `CentralObra`. */
const valorOrcado = (item: ItemOrcado, bdiPadrao: number): number => {
    const preco = item.sinapiItem?.price || 0;
    const qtd = item.quantity || 0;
    const bdi = item.bdi ?? bdiPadrao;
    return qtd * preco * (1 + bdi / 100);
};

export function calcularEac(
    orcamento: ItemOrcado[] | null | undefined,
    contratados: ItemContratado[] | null | undefined,
    bdiPadrao = 0,
): ResultadoEac {
    const itens = Array.isArray(orcamento) ? orcamento : [];
    const contratos = Array.isArray(contratados) ? contratados : [];

    const orcadoPorItem = new Map<string, number>();
    for (const it of itens) {
        if (!it?.id) continue;
        orcadoPorItem.set(it.id, (orcadoPorItem.get(it.id) ?? 0) + valorOrcado(it, bdiPadrao));
    }
    const orcado = round2([...orcadoPorItem.values()].reduce((a, v) => a + v, 0));

    let contratado = 0;
    let contratadosSemOrcamento = 0;
    const idsContratados = new Set<string>();
    for (const c of contratos) {
        const v = Number(c?.totalPrice) || 0;
        contratado += v;
        if (c?.budgetItemId && orcadoPorItem.has(c.budgetItemId)) idsContratados.add(c.budgetItemId);
        else contratadosSemOrcamento += v;
    }
    contratado = round2(contratado);
    contratadosSemOrcamento = round2(contratadosSemOrcamento);

    const orcadoDosContratados = round2(
        [...idsContratados].reduce((a, id) => a + (orcadoPorItem.get(id) ?? 0), 0),
    );
    const aContratar = round2(Math.max(0, orcado - orcadoDosContratados));

    if (orcado <= 0) {
        return {
            orcado, contratado, orcadoDosContratados, aContratar,
            fator: null, eac: null, desvioPct: null, contratadosSemOrcamento,
        };
    }

    // O fator só considera o que TEM os dois lados: contratado com orçado
    // conhecido. Misturar o contratado sem vínculo inflaria o numerador contra
    // um denominador que não o inclui.
    const contratadoComVinculo = round2(contratado - contratadosSemOrcamento);
    const fator = orcadoDosContratados > 0
        ? round2(contratadoComVinculo / orcadoDosContratados)
        : null;

    // Sem desvio observado, o melhor palpite para o que falta é o próprio
    // orçamento — fator 1. Não é otimismo: é dizer "ainda não há evidência".
    const eac = round2(contratado + aContratar * (fator ?? 1));
    const desvioPct = round2((eac / orcado - 1) * 100);

    return { orcado, contratado, orcadoDosContratados, aContratar, fator, eac, desvioPct, contratadosSemOrcamento };
}
