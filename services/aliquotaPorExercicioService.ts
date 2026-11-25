import { supabase } from '../lib/supabase';

/**
 * Alíquotas oficiais por exercício e regime (PIS e COFINS) — globais, iguais para
 * todas as organizações. Leitura aberta; gravar só superadmin (policy com
 * is_superadmin(), plano docs/planos/2026-11-24-tributos-um-lugar-so.md).
 * Usadas pelos tributos de locação (taxPayableService.generateForDeal).
 */
export interface AliquotaPorExercicio {
    id: string;
    exercicio: number;
    regime_tributario: string;
    /** Em %, como na tela (ex.: 0,65). */
    aliquota: number;
}

export type TabelaDeAliquota = 'tax_pis_rates' | 'tax_cofins_rates';
type Campos = Omit<AliquotaPorExercicio, 'id'>;

const COLUNAS = 'id, exercicio, regime_tributario, aliquota';
/** RLS barra a gravação sem erro (0 linhas): sem linha de volta = recusado. */
const RECUSADO = 'O banco recusou a gravação — só o superadmin altera as tabelas oficiais.';

export function servicoDeAliquotaPorExercicio(tabela: TabelaDeAliquota) {
    return {
        async list(): Promise<AliquotaPorExercicio[]> {
            const { data, error } = await supabase
                .from(tabela)
                .select(COLUNAS)
                .order('exercicio', { ascending: false })
                .order('regime_tributario', { ascending: true });
            if (error) throw error;
            return (data ?? []) as AliquotaPorExercicio[];
        },
        async create(campos: Campos): Promise<AliquotaPorExercicio> {
            const { data, error } = await supabase.from(tabela).insert(campos).select(COLUNAS);
            if (error) throw error;
            if (!data?.length) throw new Error(RECUSADO);
            return data[0] as AliquotaPorExercicio;
        },
        async update(id: string, campos: Campos): Promise<AliquotaPorExercicio> {
            const { data, error } = await supabase.from(tabela).update(campos).eq('id', id).select(COLUNAS);
            if (error) throw error;
            if (!data?.length) throw new Error(RECUSADO);
            return data[0] as AliquotaPorExercicio;
        },
        async remove(id: string): Promise<void> {
            const { data, error } = await supabase.from(tabela).delete().eq('id', id).select('id');
            if (error) throw error;
            if (!data?.length) throw new Error(RECUSADO);
        },
    };
}
