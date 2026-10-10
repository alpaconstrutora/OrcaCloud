import { supabase } from '../lib/supabase';
import type { DocGenBloco, DocTipTap } from '../types/docGen';

/**
 * Biblioteca de blocos (Documentos › Ofícios › Blocos — F6). Trechos prontos da
 * organização que o editor insere (copiando) no modelo ou na redação do ofício.
 * REGRA #5: `list(orgId)` só aplica `.eq` quando há organização.
 */
const COLUNAS = 'id, organization_id, nome, descricao, conteudo, created_by, created_at, updated_at';

async function emailDaSessao(): Promise<string | null> {
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? null;
}

export const docGenBlocoService = {
    async list(organizationId?: string | null): Promise<DocGenBloco[]> {
        let q = supabase.from('doc_gen_blocos').select(COLUNAS).order('nome');
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as DocGenBloco[];
    },

    async create(b: { organization_id: string; nome: string; descricao?: string | null; conteudo: DocTipTap }): Promise<DocGenBloco> {
        const { data, error } = await supabase.from('doc_gen_blocos')
            .insert({ ...b, nome: b.nome.trim(), descricao: b.descricao?.trim() || null, created_by: await emailDaSessao() })
            .select(COLUNAS).single();
        if (error) throw error;
        return data as DocGenBloco;
    },

    async update(id: string, patch: { nome?: string; descricao?: string | null; conteudo?: DocTipTap }): Promise<DocGenBloco> {
        const { data, error } = await supabase.from('doc_gen_blocos')
            .update({ ...patch, ...(patch.nome !== undefined ? { nome: patch.nome.trim() } : {}) })
            .eq('id', id).select(COLUNAS).single();
        if (error) throw error;
        return data as DocGenBloco;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('doc_gen_blocos').delete().eq('id', id);
        if (error) throw error;
    },
};
