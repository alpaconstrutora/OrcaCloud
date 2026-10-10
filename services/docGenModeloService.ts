import { supabase } from '../lib/supabase';
import {
    DOC_TIPTAP_VAZIO, LAYOUT_PADRAO,
    type DocGenModelo, type DocGenModeloInsert, type DocGenModeloUpdate, type DocGenModeloVersao, type LayoutModelo,
} from '../types/docGen';

/**
 * Modelos do motor de documentos (Documentos › Ofícios › Modelos).
 * Plano: docs/planos/2026-10-07-gerador-de-oficios.md (F1).
 *
 * REGRA #5: `list(orgId)` só aplica `.eq('organization_id')` quando há
 * organização; com "Todas" a RLS recorta pelas organizações do usuário.
 */
const COLUNAS = 'id, organization_id, nome, descricao, tipo_documental, categoria_ged, department_id, status, conteudo, layout, campos_obrigatorios, signatario_member_id, responsavel_email, exige_aprovacao, exige_assinatura, versao, created_by, created_at, updated_at';

/** Layout gravado pode vir de versão anterior do app: completa com o padrão, campo a campo. */
export function normalizarLayout(l: Partial<LayoutModelo> | null | undefined): LayoutModelo {
    return {
        ...LAYOUT_PADRAO,
        ...(l ?? {}),
        margens: { ...LAYOUT_PADRAO.margens, ...(l?.margens ?? {}) },
        cabecalho: { ...LAYOUT_PADRAO.cabecalho, ...(l?.cabecalho ?? {}) },
        rodape: { ...LAYOUT_PADRAO.rodape, ...(l?.rodape ?? {}) },
    };
}

function normalizar(row: Record<string, unknown>): DocGenModelo {
    const conteudo = row.conteudo as DocGenModelo['conteudo'] | null;
    return {
        ...(row as unknown as DocGenModelo),
        descricao: (row.descricao as string | null) ?? null,
        department_id: (row.department_id as string | null) ?? null,
        signatario_member_id: (row.signatario_member_id as string | null) ?? null,
        responsavel_email: (row.responsavel_email as string | null) ?? null,
        conteudo: conteudo && conteudo.type === 'doc' ? conteudo : DOC_TIPTAP_VAZIO,
        layout: normalizarLayout(row.layout as Partial<LayoutModelo> | null),
        campos_obrigatorios: Array.isArray(row.campos_obrigatorios) ? (row.campos_obrigatorios as string[]) : [],
    };
}

async function emailDaSessao(): Promise<string | null> {
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? null;
}

export const docGenModeloService = {
    async list(organizationId?: string | null, opts?: { status?: DocGenModelo['status'] }): Promise<DocGenModelo[]> {
        let q = supabase.from('doc_gen_modelos').select(COLUNAS).order('nome');
        if (organizationId) q = q.eq('organization_id', organizationId);
        if (opts?.status) q = q.eq('status', opts.status);
        const { data, error } = await q;
        if (error) throw error;
        return ((data ?? []) as Record<string, unknown>[]).map(normalizar);
    },

    async get(id: string): Promise<DocGenModelo | null> {
        const { data, error } = await supabase.from('doc_gen_modelos').select(COLUNAS).eq('id', id).maybeSingle();
        if (error) throw error;
        return data ? normalizar(data as Record<string, unknown>) : null;
    },

    async create(input: DocGenModeloInsert): Promise<DocGenModelo> {
        const created_by = await emailDaSessao();
        const { data, error } = await supabase
            .from('doc_gen_modelos')
            .insert({ ...input, created_by })
            .select(COLUNAS)
            .single();
        if (error) throw error;
        return normalizar(data as Record<string, unknown>);
    },

    /**
     * Grava o modelo e sobe `versao`. A cópia que ficou para trás vai para
     * `doc_gen_modelo_versoes` — só quando conteúdo ou layout mudaram; trocar o
     * status ou a descrição não gera versão.
     */
    async update(atual: DocGenModelo, patch: DocGenModeloUpdate): Promise<DocGenModelo> {
        const mudouDocumento = (patch.conteudo !== undefined && JSON.stringify(patch.conteudo) !== JSON.stringify(atual.conteudo))
            || (patch.layout !== undefined && JSON.stringify(patch.layout) !== JSON.stringify(atual.layout));
        const email = await emailDaSessao();

        if (mudouDocumento) {
            const { error: errVersao } = await supabase.from('doc_gen_modelo_versoes').insert({
                modelo_id: atual.id,
                organization_id: atual.organization_id,
                versao: atual.versao,
                conteudo: atual.conteudo,
                layout: atual.layout,
                created_by: email,
            });
            // Versão duplicada (gravação repetida do mesmo número) não impede a edição.
            if (errVersao && errVersao.code !== '23505') throw errVersao;
        }

        const { data, error } = await supabase
            .from('doc_gen_modelos')
            .update({ ...patch, ...(mudouDocumento ? { versao: atual.versao + 1 } : {}) })
            .eq('id', atual.id)
            .select(COLUNAS)
            .single();
        if (error) throw error;
        return normalizar(data as Record<string, unknown>);
    },

    async setStatus(id: string, status: DocGenModelo['status']): Promise<DocGenModelo> {
        const { data, error } = await supabase.from('doc_gen_modelos').update({ status }).eq('id', id).select(COLUNAS).single();
        if (error) throw error;
        return normalizar(data as Record<string, unknown>);
    },

    async duplicate(modelo: DocGenModelo): Promise<DocGenModelo> {
        return this.create({
            organization_id: modelo.organization_id,
            nome: `${modelo.nome} (cópia)`,
            descricao: modelo.descricao,
            tipo_documental: modelo.tipo_documental,
            categoria_ged: modelo.categoria_ged,
            department_id: modelo.department_id,
            status: 'rascunho',
            conteudo: modelo.conteudo,
            layout: modelo.layout,
            campos_obrigatorios: modelo.campos_obrigatorios,
            signatario_member_id: modelo.signatario_member_id,
            responsavel_email: modelo.responsavel_email,
            exige_aprovacao: modelo.exige_aprovacao,
            exige_assinatura: modelo.exige_assinatura,
        });
    },

    /** Só modelo em rascunho e sem documento emitido pode ser apagado (F3 trava pelo FK). */
    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('doc_gen_modelos').delete().eq('id', id);
        if (error) throw error;
    },

    async listVersoes(modeloId: string): Promise<DocGenModeloVersao[]> {
        const { data, error } = await supabase
            .from('doc_gen_modelo_versoes')
            .select('id, modelo_id, organization_id, versao, conteudo, layout, created_by, created_at')
            .eq('modelo_id', modeloId)
            .order('versao', { ascending: false });
        if (error) throw error;
        return (data ?? []) as DocGenModeloVersao[];
    },
};
