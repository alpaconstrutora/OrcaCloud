import { identidadeDaUnidade } from '../lib/unidadeDeMedida';
import type { UnidadeInformada } from '../types/budget';

export type { UnidadeInformada };

/**
 * EQUIVALÊNCIA DE UNIDADES (21/11/2026) — a conta, num lugar só.
 * Plano: docs/planos/2026-11-21-equivalencia-unidades.md.
 *
 * Cadastro global (`item_unit_equivalences`): 1 `unidade` = `fator` × `unidadeBase`.
 * Ex.: insumo 32 (aço CA-50 6,3 mm, KG) → 1 M = 0,245 KG; 1 BR = 2,94 KG.
 *
 * A linha só vale quando a unidade ATUAL do item é a `unidadeBase` gravada: item
 * que mudou de unidade (outra competência SINAPI, ou a base própria sobrepondo o
 * código com outra unidade) fica SEM conversão — nunca com a errada.
 */
export interface EquivalenciaDeUnidade {
    id?: string;
    itemCode: string;
    unidadeBase: string;
    unidade: string;
    fator: number;
    observacao?: string | null;
}

/** Equivalências agrupadas pelo código do item. */
export type EquivalenciasPorItem = ReadonlyMap<string, readonly EquivalenciaDeUnidade[]>;

/** As linhas que valem para o item NA UNIDADE EM QUE ELE ESTÁ AGORA. */
export function equivalenciasValidas(
    code: string,
    unidadeDoItem: string | null | undefined,
    eqs: EquivalenciasPorItem,
): EquivalenciaDeUnidade[] {
    const base = identidadeDaUnidade(unidadeDoItem);
    if (!base) return [];
    return (eqs.get(code) ?? []).filter(e => e.unidadeBase === base && e.fator > 0);
}

/**
 * Unidades em que o item pode ser expresso — a dele primeiro. `null` quando não
 * há equivalência válida (a tela mostra a unidade crua, como sempre mostrou).
 */
export function unidadesDoItem(
    code: string,
    unidadeDoItem: string | null | undefined,
    eqs: EquivalenciasPorItem,
): string[] | null {
    const validas = equivalenciasValidas(code, unidadeDoItem, eqs);
    if (validas.length === 0) return null;
    return [identidadeDaUnidade(unidadeDoItem)!, ...validas.map(e => e.unidade)];
}

/**
 * Quantas `para` cabem em 1 `de`: qtd_para = qtd_de × fator.
 * 1 quando são a mesma unidade; `null` quando não há caminho (sem chutar).
 * Duas alternativas convertem pela base: BR→M = 2,94 / 0,245 = 12.
 */
export function fatorEntre(
    code: string,
    unidadeDoItem: string | null | undefined,
    de: string | null | undefined,
    para: string | null | undefined,
    eqs: EquivalenciasPorItem,
): number | null {
    const d = identidadeDaUnidade(de);
    const p = identidadeDaUnidade(para);
    if (!d || !p) return null;
    if (d === p) return 1;
    const base = identidadeDaUnidade(unidadeDoItem);
    if (!base) return null;
    const validas = equivalenciasValidas(code, unidadeDoItem, eqs);
    // quanto vale 1 unidade em unidade-base
    const emBase = (u: string): number | null =>
        u === base ? 1 : validas.find(e => e.unidade === u)?.fator ?? null;
    const fd = emBase(d);
    const fp = emBase(p);
    if (fd == null || fp == null) return null;
    return fd / fp;
}

const arred = (n: number, casas: number) => {
    const f = 10 ** casas;
    return Math.round(n * f) / f;
};

/** Quantidade na unidade de destino (fator de `fatorEntre`). 6 casas. */
export const converterQuantidade = (quantidade: number, fator: number) => arred(quantidade * fator, 6);

/** Preço por unidade de destino: o total (q × p) se conserva. 4 casas. */
export const converterPreco = (preco: number, fator: number) => arred(preco / fator, 4);

/**
 * A unidade informada de um lançamento só vale se a base gravada for a unidade
 * do item: se alguém trocou a unidade do item depois, a tela volta para a do item.
 */
export function unidadeInformadaValida(
    unidadeDoItem: string | null | undefined,
    informada: UnidadeInformada | null | undefined,
): UnidadeInformada | null {
    if (!informada || !(informada.fator > 0)) return null;
    const base = identidadeDaUnidade(unidadeDoItem);
    if (!base || informada.unidadeBase !== base || informada.unidade === base) return null;
    return informada;
}
