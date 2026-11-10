import { SinapiCategory, SinapiType, type BudgetEntry, type CompositionComponent } from '../types/budget';

/**
 * Linhas do orçamento da obra para os seletores de Suprimentos.
 *
 * Composição aparece ela mesma E desdobrada nos seus insumos logo abaixo —
 * qtd sugerida = coeficiente × quantidade orçada. Desdobra na própria lista em
 * vez de abrir uma janela de insumos por cima do painel (UI_PATTERNS §4).
 *
 * Preço: o do mapa `preco` (SINAPI atual da UF da obra) quando houver, senão o
 * gravado no orçamento.
 */
export interface LinhaDoOrcamento {
    key: string;
    code: string;
    description: string;
    unit: string;
    quantity: number;
    price: number;
    origem: string;
    type: SinapiType;
    budgetItemId: string;
    budgetItemCode: string;
    budgetItemDescription: string;
    compositionCode?: string;
}

const TIPO: Record<string, string> = {
    [SinapiType.COMPOSITION]: 'Composição',
    [SinapiType.INPUT]: 'Insumo',
    [SinapiType.SERVICE]: 'Serviço',
};

const quatroCasas = (n: number) => Math.round(n * 10000) / 10000;

export function montarLinhas(budget: BudgetEntry[], preco: Map<string, number>): LinhaDoOrcamento[] {
    const linhas: LinhaDoOrcamento[] = [];
    for (const e of budget) {
        const s = e.sinapiItem;
        if (!s) continue;
        const base = { budgetItemId: e.id, budgetItemCode: s.code, budgetItemDescription: s.description };
        linhas.push({
            key: e.id, code: s.code, description: s.description, unit: s.unit,
            quantity: Number(e.quantity) || 0,
            price: preco.get(s.code) ?? (Number(s.price) || 0),
            origem: `${TIPO[s.type] ?? 'Item'} do orçamento`,
            type: s.type,
            ...base,
        });
        if (s.type === SinapiType.COMPOSITION) {
            for (const c of s.composition ?? []) {
                linhas.push({
                    key: `${e.id}:${c.code}`, code: c.code, description: c.description, unit: c.unit,
                    quantity: quatroCasas((Number(c.quantity) || 0) * (Number(e.quantity) || 0)),
                    price: preco.get(c.code) ?? (Number(c.price) || 0),
                    origem: `Insumo de ${s.code}`,
                    type: c.type,
                    compositionCode: s.code,
                    ...base,
                });
            }
        }
    }
    return linhas;
}

/**
 * Pedido de Compra › "+ Item do orçamento" (10/11/2026): as linhas acima, sem
 * SERVIÇO de topo (pedido de compra não compra serviço — mesma regra da antiga
 * "Seleção de materiais da obra"), com o quanto já foi comprado na obra.
 *
 * - `titulo`: a linha da própria composição — guia os insumos abaixo, não se
 *   marca (o pedido compra o insumo, como na janela de insumos de antes).
 * - `jaNoPedido`: o código já está neste pedido — editar a quantidade é na
 *   tabela "Itens do pedido", não incluir de novo.
 * - `aComprar`: orçada − comprada, nunca negativa.
 * - Pedido de compra é SÓ material (pedido do usuário em 10/11/2026): mão de
 *   obra (Servente, Carpinteiro…), hora de equipamento (escavadeira, caminhão)
 *   e serviço ficam de fora — são contratados em Suprimentos › Contratos. A
 *   composição interna (serviço) é aberta até o material — ver
 *   `materiaisDaComposicao`. Composição sem nenhum material some junto.
 */
export interface LinhaDoOrcamentoNoPedido extends LinhaDoOrcamento {
    comprada: number;
    aComprar: number;
    titulo: boolean;
    jaNoPedido: boolean;
}

/**
 * Insumo de mão de obra. Nas composições gravadas no orçamento a `category`
 * vem vazia; o que marca a mão de obra SINAPI é a unidade H (hora) — "SERVENTE
 * COM ENCARGOS COMPLEMENTARES", "CARPINTEIRO DE FORMAS…".
 */
export function ehMaoDeObra(item: { unit?: string; category?: string }): boolean {
    return item.category === SinapiCategory.MAO_DE_OBRA || (item.unit ?? '').trim().toUpperCase() === 'H';
}

/**
 * Hora de equipamento: custo horário SINAPI — CHP (produtivo) e CHI
 * (improdutivo) — "ESCAVADEIRA HIDRÁULICA…", "CAMINHÃO BASCULANTE…".
 */
export function ehHoraDeEquipamento(item: { unit?: string; category?: string }): boolean {
    const un = (item.unit ?? '').trim().toUpperCase();
    return item.category === SinapiCategory.EQUIPAMENTO || un === 'CHP' || un === 'CHI';
}

/** Não entra em pedido de compra: mão de obra ou hora de equipamento. */
export const naoEMaterial = (item: { unit?: string; category?: string }) => ehMaoDeObra(item) || ehHoraDeEquipamento(item);

/**
 * Composição de composição (10/11/2026): no orçamento gravado, a composição
 * INTERNA vem sem os próprios insumos — "ARMAÇÃO DE PILAR" (92759) não traz o
 * aço, "ARGAMASSA TRAÇO 1:3" (87298) não traz cimento e areia. Esconder a
 * interna (é serviço) sumiria com o material; o certo é DESCER até ele.
 * `sub` = composição de cada código interno, lida da base SINAPI
 * (`sinapiService.getItemsByCodes`) por quem chama.
 */
export type SubComposicoes = Map<string, CompositionComponent[]>;

const PROFUNDIDADE_MAXIMA = 5;

interface MaterialDaComposicao {
    item: CompositionComponent;
    /** Coeficiente acumulado: quanto deste material por 1 unidade da composição de topo. */
    coef: number;
    /** Composição interna sem detalhamento na base: fica como está, para nada sumir calado. */
    semDetalhe: boolean;
}

/** Desce nas composições internas até o material; mão de obra e hora de equipamento ficam de fora. */
export function materiaisDaComposicao(componentes: CompositionComponent[], sub: SubComposicoes): MaterialDaComposicao[] {
    const porCodigo = new Map<string, MaterialDaComposicao>();
    const descer = (lista: CompositionComponent[], fator: number, caminho: Set<string>) => {
        for (const c of lista) {
            if (naoEMaterial(c)) continue;
            const coef = fator * (Number(c.quantity) || 0);
            const filhos = c.type === SinapiType.COMPOSITION ? sub.get(c.code) : undefined;
            if (c.type === SinapiType.COMPOSITION && filhos?.length && !caminho.has(c.code) && caminho.size < PROFUNDIDADE_MAXIMA) {
                descer(filhos, coef, new Set(caminho).add(c.code));
                continue;
            }
            const semDetalhe = c.type === SinapiType.COMPOSITION;
            const atual = porCodigo.get(c.code);
            if (atual) atual.coef += coef;
            else porCodigo.set(c.code, { item: c, coef, semDetalhe });
        }
    };
    descer(componentes, 1, new Set());
    return [...porCodigo.values()];
}

/** Códigos de composição interna ainda sem detalhamento em `sub` — o que buscar na base SINAPI. */
export function composicoesInternasAResolver(budget: BudgetEntry[], sub: SubComposicoes): string[] {
    const faltam = new Set<string>();
    const olhar = (lista: CompositionComponent[] | undefined) => lista?.forEach(c => {
        if (naoEMaterial(c) || c.type !== SinapiType.COMPOSITION) return;
        if (!sub.has(c.code)) faltam.add(c.code);
    });
    budget.forEach(e => olhar(e.sinapiItem?.composition));
    sub.forEach(lista => olhar(lista));
    return [...faltam];
}

export function linhasDoOrcamentoParaPedido(
    budget: BudgetEntry[],
    preco: Map<string, number>,
    compradas: Map<string, number>,
    noPedido: Set<string>,
    sub: SubComposicoes = new Map(),
): LinhaDoOrcamentoNoPedido[] {
    const linhas: LinhaDoOrcamento[] = [];
    for (const e of budget) {
        const s = e.sinapiItem;
        if (!s || s.type === SinapiType.SERVICE) continue;
        const base = { budgetItemId: e.id, budgetItemCode: s.code, budgetItemDescription: s.description };
        if (s.type !== SinapiType.COMPOSITION) {
            if (naoEMaterial(s)) continue;
            linhas.push({
                key: e.id, code: s.code, description: s.description, unit: s.unit,
                quantity: Number(e.quantity) || 0,
                price: preco.get(s.code) ?? (Number(s.price) || 0),
                origem: 'Insumo do orçamento', type: s.type, ...base,
            });
            continue;
        }
        const materiais = materiaisDaComposicao(s.composition ?? [], sub);
        // Composição sem nenhum material: o título ficaria sozinho.
        if (materiais.length === 0) continue;
        linhas.push({
            key: e.id, code: s.code, description: s.description, unit: s.unit,
            quantity: Number(e.quantity) || 0,
            price: preco.get(s.code) ?? (Number(s.price) || 0),
            origem: 'Composição do orçamento', type: s.type, ...base,
        });
        for (const { item: c, coef, semDetalhe } of materiais) {
            linhas.push({
                key: `${e.id}:${c.code}`, code: c.code, description: c.description, unit: c.unit,
                quantity: quatroCasas(coef * (Number(e.quantity) || 0)),
                price: preco.get(c.code) ?? (Number(c.price) || 0),
                origem: semDetalhe ? `Composição de ${s.code} (sem detalhamento)` : `Insumo de ${s.code}`,
                type: c.type, compositionCode: s.code, ...base,
            });
        }
    }
    return linhas.map(l => {
        const titulo = !l.compositionCode && l.type === SinapiType.COMPOSITION;
        const comprada = titulo ? 0 : (compradas.get(l.code) ?? 0);
        return {
            ...l,
            comprada,
            aComprar: titulo ? 0 : Math.max(quatroCasas(l.quantity - comprada), 0),
            titulo,
            jaNoPedido: !titulo && noPedido.has(l.code),
        };
    });
}
