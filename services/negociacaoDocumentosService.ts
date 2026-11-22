import { supabase } from '../lib/supabase';

/**
 * Documentos da NEGOCIAÇÃO (proposta, reserva, ficha, vistoria, distrato) —
 * tabela `commercial_deal_documents`, bucket privado `documents` na pasta
 * `<org>/negociacoes/<deal>/`. Só PDF (é o que se assina).
 * A versão (`v`) por tipo, a org = org da negociação e a projeção da assinatura
 * são do banco (gatilho `commercial_deal_documents_coerencia`).
 * Plano: docs/planos/2026-11-21-assinatura-eletronica-interna.md (F5).
 */

export type TipoDocumentoNegociacao = 'PROPOSTA' | 'RESERVA' | 'FICHA' | 'VISTORIA' | 'DISTRATO' | 'OUTRO';

export const ROTULO_TIPO_DOCUMENTO: Record<TipoDocumentoNegociacao, string> = {
    PROPOSTA: 'Proposta',
    RESERVA: 'Reserva',
    FICHA: 'Ficha cadastral',
    VISTORIA: 'Termo de vistoria',
    DISTRATO: 'Distrato',
    OUTRO: 'Outro',
};

export interface DocumentoDaNegociacao {
    id: string;
    organization_id: string;
    deal_id: string;
    kind: TipoDocumentoNegociacao;
    v: number;
    nome: string;
    notas: string | null;
    storage_path: string;
    size_bytes: number | null;
    source: 'UPLOAD' | 'SISTEMA';
    assinatura_envelope_id: string | null;
    signature_status: 'SENT' | 'SIGNED' | 'CANCELLED' | 'EXPIRED' | null;
    signed_path: string | null;
    signed_at: string | null;
    created_at: string;
}

const BUCKET = 'documents';
const COLS = 'id, organization_id, deal_id, kind, v, nome, notas, storage_path, size_bytes, source, assinatura_envelope_id, signature_status, signed_path, signed_at, created_at';

const nomeSeguro = (nome: string) =>
    nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80) || 'documento.pdf';

export const negociacaoDocumentosService = {
    async listar(dealId: string): Promise<DocumentoDaNegociacao[]> {
        const { data, error } = await supabase
            .from('commercial_deal_documents')
            .select(COLS)
            .eq('deal_id', dealId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []) as DocumentoDaNegociacao[];
    },

    /** Sobe o PDF e cria o registro. Falhou o registro: o arquivo sai junto. */
    async subir(p: {
        organizationId: string;
        dealId: string;
        kind: TipoDocumentoNegociacao;
        nome: string;
        notas?: string;
        arquivo: Blob;
        nomeArquivo: string;
        source?: 'UPLOAD' | 'SISTEMA';
    }): Promise<DocumentoDaNegociacao> {
        if (p.arquivo.type && p.arquivo.type !== 'application/pdf') throw new Error('Só PDF pode ser enviado para assinatura.');
        const caminho = `${p.organizationId}/negociacoes/${p.dealId}/${Date.now()}-${nomeSeguro(p.nomeArquivo)}`;
        const { error: erroUp } = await supabase.storage.from(BUCKET).upload(caminho, p.arquivo, { contentType: 'application/pdf', upsert: false });
        if (erroUp) throw erroUp;
        const { data, error } = await supabase
            .from('commercial_deal_documents')
            .insert({
                organization_id: p.organizationId, deal_id: p.dealId, kind: p.kind, nome: p.nome.trim(),
                notas: p.notas?.trim() || null, storage_path: caminho, mime_type: 'application/pdf',
                size_bytes: p.arquivo.size, source: p.source ?? 'UPLOAD',
            })
            .select(COLS)
            .single();
        if (error) {
            await supabase.storage.from(BUCKET).remove([caminho]).catch(() => undefined);
            throw error;
        }
        return data as DocumentoDaNegociacao;
    },

    async renomear(id: string, nome: string, notas: string | null): Promise<void> {
        const { error } = await supabase.from('commercial_deal_documents').update({ nome: nome.trim(), notas: notas?.trim() || null }).eq('id', id);
        if (error) throw error;
    },

    /** Documento que foi para assinatura não se exclui (o banco também recusa). */
    async excluir(doc: DocumentoDaNegociacao): Promise<void> {
        if (doc.assinatura_envelope_id) throw new Error('Documento que foi enviado para assinatura não se exclui — ele é a prova do que foi assinado.');
        const { error } = await supabase.from('commercial_deal_documents').delete().eq('id', doc.id);
        if (error) throw error;
        await supabase.storage.from(BUCKET).remove([doc.storage_path]).catch(() => undefined);
    },
};
