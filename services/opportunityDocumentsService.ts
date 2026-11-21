/**
 * Data Room da oportunidade PELO GED (plano docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md,
 * Fase 3; decisão D1: o arquivo mora só no GED, do empreendimento).
 *
 * Antes: tabela opportunity_documents + bucket opportunity-dataroom (um segundo lugar para a matrícula,
 * o memorial...). Agora a oportunidade só COMPARTILHA documentos do GED (opura_document_portal_shares,
 * audiência 'investidor'). O investidor vê a versão FIXADA no compartilhamento (Fase 7.9, D8): versão nova no
 * GED não aparece para ele até o gestor "Atualizar" — o gestor vê `versao_atual` > `version_number`.
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
    /** Caminho, no bucket opura-docs, da versão que o investidor vê (a fixada). */
    file_path: string | null;
    /** Número da versão que o investidor vê. */
    version_number?: number | null;
    /** Só o gestor: versão ativa do documento no GED, e o id dela (para "Atualizar"). */
    versao_atual?: number | null;
    versao_atual_id?: string | null;
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

type VersaoLida = { id: string; version_number: number | null; storage_path: string | null; tamanho: number | null; mime_type: string | null };
export type LinhaDoCompartilhamento = {
    shared_at: string;
    versao: VersaoLida | null;
    document: (Pick<OpuraDocument, 'id' | 'nome' | 'descricao' | 'categoria'> & { active_version?: VersaoLida | null }) | null;
};

/** O investidor vê a versão fixada; sem ela (apagada, ou compartilhamento antigo), a ativa — igual à RPC. */
export function documentoDoCompartilhamento(l: LinhaDoCompartilhamento): DocumentoDoDataRoom | null {
    if (!l.document) return null;
    const ativa = l.document.active_version ?? null;
    const vista = l.versao ?? ativa;
    return {
        id: l.document.id,
        name: l.document.nome,
        description: l.document.descricao ?? null,
        file_path: vista?.storage_path ?? null,
        file_size: vista?.tamanho ?? null,
        mime_type: vista?.mime_type ?? null,
        version_number: vista?.version_number ?? null,
        versao_atual: ativa?.version_number ?? null,
        versao_atual_id: ativa?.id ?? null,
        category: l.document.categoria,
        created_at: l.shared_at,
    };
}

/** Há versão mais nova no GED do que a que o investidor vê. */
export const temVersaoNova = (d: DocumentoDoDataRoom): boolean =>
    d.versao_atual != null && d.version_number != null && d.versao_atual > d.version_number;

export const opportunityDocumentsService = {
    /** Gestor: o que está compartilhado com esta oportunidade. */
    async listar(opportunityId: string): Promise<DocumentoDoDataRoom[]> {
        const { data, error } = await supabase
            .from('opura_document_portal_shares')
            .select('shared_at, versao:opura_document_versions!version_id(id, version_number, storage_path, tamanho, mime_type), document:opura_documents(id, nome, descricao, categoria, active_version:opura_document_versions!fk_active_version(id, version_number, storage_path, tamanho, mime_type))')
            .eq('audience', 'investidor')
            .eq('opportunity_id', opportunityId)
            .order('shared_at', { ascending: false });
        if (error) throw new Error(`Falha ao ler o Data Room: ${error.message}`);
        return ((data ?? []) as unknown as LinhaDoCompartilhamento[])
            .map(documentoDoCompartilhamento)
            .filter((d): d is DocumentoDoDataRoom => d !== null);
    },

    /** Gestor: o investidor passa a ver a versão ativa de hoje. */
    async atualizarVersao(documentId: string, opportunityId: string, versionId: string): Promise<void> {
        const { data, error } = await supabase
            .from('opura_document_portal_shares')
            .update({ version_id: versionId })
            .eq('audience', 'investidor')
            .eq('opportunity_id', opportunityId)
            .eq('document_id', documentId)
            .select('document_id');
        if (error) throw new Error(error.message);
        if (!data?.length) throw new Error('Sem permissão para alterar este compartilhamento.');
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
