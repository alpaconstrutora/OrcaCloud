/**
 * Data Room da oportunidade PELO GED (plano docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md,
 * Fase 3; decisão D1: o arquivo mora só no GED, do empreendimento).
 *
 * Antes: tabela opportunity_documents + bucket opportunity-dataroom (um segundo lugar para a matrícula,
 * o memorial...). Agora a oportunidade só COMPARTILHA documentos do GED (opura_document_portal_shares,
 * audiência 'investidor'); o investidor vê a versão ATIVA.
 *
 * - Gestor: lê pela RLS (herdada de opura_documents) e assina com a própria sessão (documentService).
 * - Investidor pelo link: lista pela RPC do token (fn_investor_portal_get_dataroom) e baixa pela Edge
 *   Function investor-portal-dataroom-download, que só assina o que a RPC listou (bucket opura-docs).
 */
import { supabase } from '../lib/supabase';
import { documentService } from './documentService';
import { empreendimentoDocumentosService } from './empreendimentoDocumentosService';
import type { OpuraDocument } from '../types/documents';

/** Rótulos das categorias do GED (as do Data Room desde a Fase 3). */
export const CATEGORIA_DO_GED: Record<string, string> = {
    juridico: 'Jurídico',
    engenharia: 'Engenharia',
    compliance: 'Compliance',
    financeiro: 'Financeiro',
    comercial: 'Comercial',
    normas: 'Normas',
};

/** Um documento do Data Room — as mesmas chaves para o gestor e para o link (RPC). */
export interface DocumentoDoDataRoom {
    /** id do documento no GED. */
    id: string;
    name: string;
    description?: string | null;
    /** Caminho da versão ATIVA no bucket opura-docs. */
    file_path: string | null;
    file_size?: number | null;
    mime_type?: string | null;
    category: string;
    created_at?: string;
}

export function fmtFileSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
}

type LinhaDoCompartilhamento = {
    shared_at: string;
    document: (Pick<OpuraDocument, 'id' | 'nome' | 'descricao' | 'categoria'> & {
        active_version?: { storage_path: string | null; tamanho: number | null; mime_type: string | null } | null;
    }) | null;
};

export const opportunityDocumentsService = {
    /** Gestor: o que está compartilhado com esta oportunidade. */
    async listar(opportunityId: string): Promise<DocumentoDoDataRoom[]> {
        const { data, error } = await supabase
            .from('opura_document_portal_shares')
            .select('shared_at, document:opura_documents(id, nome, descricao, categoria, active_version:opura_document_versions!fk_active_version(storage_path, tamanho, mime_type))')
            .eq('audience', 'investidor')
            .eq('opportunity_id', opportunityId)
            .order('shared_at', { ascending: false });
        if (error) throw new Error(`Falha ao ler o Data Room: ${error.message}`);
        return ((data ?? []) as unknown as LinhaDoCompartilhamento[])
            .filter(l => l.document)
            .map(l => ({
                id: l.document!.id,
                name: l.document!.nome,
                description: l.document!.descricao ?? null,
                file_path: l.document!.active_version?.storage_path ?? null,
                file_size: l.document!.active_version?.tamanho ?? null,
                mime_type: l.document!.active_version?.mime_type ?? null,
                category: l.document!.categoria,
                created_at: l.shared_at,
            }));
    },

    /** Gestor: documentos do GED do empreendimento ainda não compartilhados (integrados não se compartilham). */
    async candidatos(empreendimentoId: string, jaNoDataRoom: string[]): Promise<OpuraDocument[]> {
        const docs = await empreendimentoDocumentosService.listarDoGed(empreendimentoId);
        const ja = new Set(jaNoDataRoom);
        return docs.filter(d => !ja.has(d.id) && !d.is_integrated && !!d.active_version_id);
    },

    async compartilhar(documentIds: string[], opportunityId: string, email: string): Promise<void> {
        await documentService.sharePortalDocumentsBatch(documentIds, { audience: 'investidor', opportunityId }, email);
    },

    async descompartilhar(documentIds: string[], opportunityId: string): Promise<void> {
        await documentService.unsharePortalDocumentsBatch({ audience: 'investidor', opportunityId }, documentIds);
    },

    /** Gestor: URL assinada pela própria sessão (a policy de opura-docs libera membro da org). */
    async getSignedUrl(filePath: string): Promise<string> {
        return documentService.generateDownloadUrl(filePath);
    },

    // ── Pelo link do Portal do Investidor (sessão anônima) ──────────────────────

    async listByToken(token: string, opportunityId: string): Promise<DocumentoDoDataRoom[]> {
        const { data, error } = await supabase.rpc('fn_investor_portal_get_dataroom', { p_token: token, p_opportunity_id: opportunityId });
        if (error) throw new Error(error.message);
        const r = data as { valid?: boolean; error?: string; documents?: DocumentoDoDataRoom[] } | null;
        if (!r?.valid) {
            throw new Error(r?.error === 'unauthorized'
                ? 'O link do portal venceu ou foi desativado.'
                : 'Esta oportunidade não está mais publicada.');
        }
        return r.documents ?? [];
    },

    async getSignedUrlByToken(token: string, opportunityId: string, filePath: string): Promise<string> {
        const { data, error } = await supabase.functions.invoke('investor-portal-dataroom-download', {
            body: { token, opportunityId, filePaths: [filePath] },
        });
        if (error) throw new Error(error.message);
        const url = (data as { urls?: Record<string, string> } | null)?.urls?.[filePath];
        if (!url) throw new Error('Arquivo não disponível para este acesso.');
        return url;
    },
};
