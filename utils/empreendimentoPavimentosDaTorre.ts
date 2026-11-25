/**
 * Quantos pavimentos o card da torre mostra (Torres & Unidades › Torres). Até 25/11/2026 o card lia só o
 * "Nº de pavimentos" do cadastro da torre: vazio, dizia "sem pavimentos" mesmo com o cadastro de pavimentos
 * preenchido (Torre A do Garden: 6 andares) — docs/planos/2026-11-25-torre-card-pavimentos.md.
 *
 * Ordem: o número da torre, quando há; senão o cadastro de pavimentos (a mesma conta da seção Pavimentos:
 * soma das repetições); senão os andares distintos das unidades. Nada disso → `null` ("sem pavimentos").
 */
export type FonteDosPavimentos = 'TORRE' | 'CADASTRO' | 'UNIDADES';

export function pavimentosDaTorre(
    floorsCount: number | null | undefined,
    pavimentos: readonly { repeat_count: number }[] | undefined,
    unidades: readonly { floor?: number | null }[] | undefined,
): { n: number; fonte: FonteDosPavimentos } | null {
    if (floorsCount != null && floorsCount > 0) return { n: floorsCount, fonte: 'TORRE' };
    const doCadastro = (pavimentos ?? []).reduce((s, p) => s + (Number(p.repeat_count) || 0), 0);
    if (doCadastro > 0) return { n: doCadastro, fonte: 'CADASTRO' };
    const andares = new Set((unidades ?? []).map(u => u.floor).filter((f): f is number => f != null && Number.isFinite(f)));
    return andares.size > 0 ? { n: andares.size, fonte: 'UNIDADES' } : null;
}

/** A dica do número: de onde ele veio quando não é o da torre. */
export const ORIGEM_DOS_PAVIMENTOS: Record<FonteDosPavimentos, string | undefined> = {
    TORRE: undefined,
    CADASTRO: 'Contados pelo cadastro de pavimentos — o Nº de pavimentos da torre está vazio',
    UNIDADES: 'Contados pelos andares das unidades — a torre não tem Nº de pavimentos nem cadastro de pavimentos',
};
