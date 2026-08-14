// services/condominioComunicacaoService.ts
// Avisos e documentos do condomínio — o lado ADMIN do que o Portal do Condômino
// exibe. Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md (F3)
//
// Estas tabelas não reusam `communications` (RH/obra) nem
// `investor_announcements` (investidor): públicos diferentes, ciclos diferentes.
// Misturar comunicado de obra com aviso de síndico na mesma caixa seria pior
// que duplicar a estrutura.
//
// O portal LÊ por RPC SECURITY DEFINER (roda sem sessão); estas funções são o
// caminho autenticado, que passa pela RLS normal.

import { supabase } from '../lib/supabase';

export type AvisoCategoria = 'AVISO' | 'URGENTE' | 'MANUTENCAO' | 'ASSEMBLEIA' | 'OBRA';
export type DocumentoCategoria =
    'CONVENCAO' | 'REGULAMENTO' | 'ATA' | 'MANUAL' | 'LAUDO' | 'SEGURO' | 'OUTRO';

export interface CondominioAviso {
    id: string;
    empreendimento_id: string;
    organization_id: string;
    titulo: string;
    corpo: string;
    categoria: AvisoCategoria;
    /** Nulo = sem prazo. Vencido some do portal, mas continua no histórico. */
    valido_ate?: string | null;
    publicado_em: string;
    publicado_por?: string | null;
    created_at: string;
    updated_at: string;
}

export interface AvisoRow extends CondominioAviso {
    /** Quantos condôminos confirmaram leitura — a razão de o mural existir. */
    _leituras: number;
}

export interface CondominioDocumento {
    id: string;
    empreendimento_id: string;
    organization_id: string;
    titulo: string;
    categoria: DocumentoCategoria;
    url: string;
    descricao?: string | null;
    visivel_portal: boolean;
    created_at: string;
    updated_at: string;
}

const AVISO_COLS =
    'id, empreendimento_id, organization_id, titulo, corpo, categoria, valido_ate, publicado_em, publicado_por, created_at, updated_at';
const DOC_COLS =
    'id, empreendimento_id, organization_id, titulo, categoria, url, descricao, visivel_portal, created_at, updated_at';

export const condominioComunicacaoService = {
    // ── Avisos ───────────────────────────────────────────────────────────────
    async listAvisos(empreendimentoId: string): Promise<AvisoRow[]> {
        const { data, error } = await supabase
            .from('condominio_avisos')
            .select(AVISO_COLS)
            .eq('empreendimento_id', empreendimentoId)
            .order('publicado_em', { ascending: false })
            // Desempate determinístico: publicados no mesmo instante empatam e a
            // ordem oscila entre carregamentos.
            .order('id', { ascending: false });
        if (error) throw new Error(`Falha ao carregar os avisos: ${error.message}`);

        const avisos = (data || []) as CondominioAviso[];
        if (avisos.length === 0) return [];

        // Contagem de leitura numa consulta só — uma por aviso viraria N+1.
        const { data: leituras } = await supabase
            .from('condominio_aviso_leituras')
            .select('aviso_id')
            .in('aviso_id', avisos.map(a => a.id));

        const porAviso = new Map<string, number>();
        for (const l of leituras || []) {
            porAviso.set(l.aviso_id, (porAviso.get(l.aviso_id) || 0) + 1);
        }
        return avisos.map(a => ({ ...a, _leituras: porAviso.get(a.id) || 0 }));
    },

    async createAviso(payload: {
        empreendimento_id: string; organization_id: string;
        titulo: string; corpo: string; categoria: AvisoCategoria;
        valido_ate?: string | null; publicado_por?: string | null;
    }): Promise<CondominioAviso> {
        const { data, error } = await supabase
            .from('condominio_avisos').insert(payload).select(AVISO_COLS).single();
        if (error) throw new Error(`Falha ao publicar o aviso: ${error.message}`);
        return data as CondominioAviso;
    },

    async removeAviso(id: string): Promise<void> {
        const { error } = await supabase.from('condominio_avisos').delete().eq('id', id);
        if (error) throw new Error(`Falha ao excluir o aviso: ${error.message}`);
    },

    // ── Documentos ───────────────────────────────────────────────────────────
    async listDocumentos(empreendimentoId: string): Promise<CondominioDocumento[]> {
        const { data, error } = await supabase
            .from('condominio_documentos')
            .select(DOC_COLS)
            .eq('empreendimento_id', empreendimentoId)
            .order('categoria', { ascending: true })
            .order('titulo', { ascending: true });
        if (error) throw new Error(`Falha ao carregar os documentos: ${error.message}`);
        return (data || []) as CondominioDocumento[];
    },

    async createDocumento(payload: {
        empreendimento_id: string; organization_id: string;
        titulo: string; categoria: DocumentoCategoria; url: string;
        descricao?: string | null; visivel_portal?: boolean;
    }): Promise<CondominioDocumento> {
        const { data, error } = await supabase
            .from('condominio_documentos').insert(payload).select(DOC_COLS).single();
        if (error) throw new Error(`Falha ao cadastrar o documento: ${error.message}`);
        return data as CondominioDocumento;
    },

    async setVisibilidade(id: string, visivel: boolean): Promise<CondominioDocumento> {
        const { data, error } = await supabase
            .from('condominio_documentos')
            .update({ visivel_portal: visivel })
            .eq('id', id).select(DOC_COLS).single();
        if (error) throw new Error(`Falha ao alterar a visibilidade: ${error.message}`);
        return data as CondominioDocumento;
    },

    async removeDocumento(id: string): Promise<void> {
        const { error } = await supabase.from('condominio_documentos').delete().eq('id', id);
        if (error) throw new Error(`Falha ao excluir o documento: ${error.message}`);
    },
};
