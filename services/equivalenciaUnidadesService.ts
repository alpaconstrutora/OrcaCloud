import { supabase } from '../lib/supabase';
import { identidadeDaUnidade } from '../lib/unidadeDeMedida';
import type { EquivalenciaDeUnidade } from '../utils/equivalenciaUnidades';

/**
 * Cadastro GLOBAL de equivalência de unidades (`item_unit_equivalences`).
 * Leitura: qualquer autenticado. Escrita: só superadmin (a RLS confere).
 * Não filtra por organização de propósito — o cadastro é do sistema.
 * Plano: docs/planos/2026-11-21-equivalencia-unidades.md.
 */
interface Linha {
    id: string;
    item_code: string;
    unidade_base: string;
    unidade: string;
    fator: number | string;
    observacao: string | null;
}

const doBanco = (r: Linha): EquivalenciaDeUnidade => ({
    id: r.id,
    itemCode: r.item_code,
    unidadeBase: r.unidade_base,
    unidade: r.unidade,
    fator: Number(r.fator),
    observacao: r.observacao,
});

/** Por código: a lista (vazia = já lida, sem equivalência). */
const cache = new Map<string, EquivalenciaDeUnidade[]>();
let emVoo: Promise<void> | null = null;
const LOTE = 200;

const tabelaAusente = (e: { code?: string } | null) => e?.code === '42P01' || e?.code === 'PGRST205';

async function buscar(codes: string[]): Promise<void> {
    for (let i = 0; i < codes.length; i += LOTE) {
        const lote = codes.slice(i, i + LOTE);
        const { data, error } = await supabase
            .from('item_unit_equivalences')
            .select('id, item_code, unidade_base, unidade, fator, observacao')
            .in('item_code', lote);
        if (error) {
            if (tabelaAusente(error)) {
                console.warn('[equivalenciaUnidades] tabela item_unit_equivalences ausente — sem conversão');
                lote.forEach(c => cache.set(c, []));
                continue;
            }
            throw error;
        }
        lote.forEach(c => cache.set(c, []));
        for (const r of (data ?? []) as Linha[]) cache.get(r.item_code)!.push(doBanco(r));
    }
}

export const equivalenciaUnidadesService = {
    /** Equivalências dos códigos pedidos, agrupadas por código. Cacheado na sessão. */
    async listarPorCodigos(codes: readonly string[]): Promise<Map<string, EquivalenciaDeUnidade[]>> {
        const unicos = [...new Set(codes.filter(Boolean))];
        // espera quem já está buscando, para não pedir os mesmos códigos duas vezes
        if (emVoo) await emVoo.catch(() => undefined);
        const faltam = unicos.filter(c => !cache.has(c));
        if (faltam.length > 0) {
            emVoo = buscar(faltam);
            try { await emVoo; } finally { emVoo = null; }
        }
        const out = new Map<string, EquivalenciaDeUnidade[]>();
        for (const c of unicos) {
            const l = cache.get(c);
            if (l && l.length > 0) out.set(c, l);
        }
        return out;
    },

    /** Grava (cria ou atualiza pela chave item+base+unidade). Só superadmin passa na RLS. */
    async salvar(eq: EquivalenciaDeUnidade): Promise<EquivalenciaDeUnidade> {
        const unidadeBase = identidadeDaUnidade(eq.unidadeBase);
        const unidade = identidadeDaUnidade(eq.unidade);
        if (!unidadeBase || !unidade) throw new Error('Unidade inválida.');
        if (unidade === unidadeBase) throw new Error('A unidade equivalente precisa ser diferente da unidade do item.');
        if (!(eq.fator > 0)) throw new Error('O fator precisa ser maior que zero.');
        const { data, error } = await supabase
            .from('item_unit_equivalences')
            .upsert({
                item_code: eq.itemCode,
                unidade_base: unidadeBase,
                unidade,
                fator: eq.fator,
                observacao: eq.observacao?.trim() || null,
            }, { onConflict: 'item_code,unidade_base,unidade' })
            .select('id, item_code, unidade_base, unidade, fator, observacao')
            .single();
        if (error) throw error;
        cache.delete(eq.itemCode);
        return doBanco(data as Linha);
    },

    async excluir(eq: Pick<EquivalenciaDeUnidade, 'id' | 'itemCode'>): Promise<void> {
        // A RLS recusa DELETE em silêncio (0 linhas, sem erro): conferir quantas saíram.
        const { data, error } = await supabase.from('item_unit_equivalences').delete().eq('id', eq.id!).select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Equivalência não excluída: só o superadministrador altera este cadastro.');
        cache.delete(eq.itemCode);
    },

    /** Só para testes. */
    _limparCache() { cache.clear(); },
};
