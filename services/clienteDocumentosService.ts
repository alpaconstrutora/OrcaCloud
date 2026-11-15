// services/clienteDocumentosService.ts
// Documentos do cliente — Meus Clientes › aba Documentos e checklist da
// negociação (DealModal), 15/11/2026.
// Plano: docs/planos/2026-11-15-cliente-aba-documentos.md
//
// O arquivo mora SÓ no GED (opura_documents com client_id + bucket opura-docs).
// Este serviço não sobe arquivo por conta própria: delega a documentService
// (versionamento, auditoria, URL assinada) — mesmo molde de
// empreendimentoDocumentosService. Ler nunca grava nada.
import { supabase } from '../lib/supabase';
import { documentService } from './documentService';
import { EXTENSOES_ACEITAS, TAMANHO_MAXIMO_BYTES } from './empreendimentoDocumentosService';
import type { OpuraDocument } from '../types/documents';
import {
    payloadDoDocumentoCliente, tipoDocumentoNoGed, type MetaDocumentoCliente,
} from '../types/clienteDocumentos';

export { EXTENSOES_ACEITAS, TAMANHO_MAXIMO_BYTES };

const COM_VERSAO = '*, active_version:opura_document_versions!fk_active_version(*)';

/** Devolve a mensagem do problema, ou `null` se o arquivo serve. */
export function erroDoArquivo(arquivo: File): string | null {
    if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
        return `O arquivo tem ${(arquivo.size / 1048576).toFixed(1)} MB — o limite é ${TAMANHO_MAXIMO_BYTES / 1048576} MB.`;
    }
    const ext = arquivo.name.includes('.') ? `.${arquivo.name.split('.').pop()!.toLowerCase()}` : '';
    if (!EXTENSOES_ACEITAS.split(',').includes(ext)) {
        return `Tipo de arquivo não aceito (${ext || 'sem extensão'}). Aceitos: ${EXTENSOES_ACEITAS.replace(/,/g, ', ')}.`;
    }
    return null;
}

function validarArquivo(arquivo: File) {
    const problema = erroDoArquivo(arquivo);
    if (problema) throw new Error(problema);
}

async function emailDoUsuario(): Promise<string | undefined> {
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? undefined;
}

export const clienteDocumentosService = {
    /**
     * Documentos do GED destes clientes, mais recentes primeiro. Uma consulta só
     * para vários clientes (negociação com mais de um comprador).
     */
    async listar(clientIds: string[]): Promise<OpuraDocument[]> {
        const ids = Array.from(new Set(clientIds.filter(Boolean)));
        if (ids.length === 0) return [];
        const { data, error } = await supabase
            .from('opura_documents')
            .select(COM_VERSAO)
            .in('client_id', ids)
            .order('created_at', { ascending: false });
        if (error) throw new Error(`Erro ao carregar os documentos do cliente: ${error.message}`);
        return (data ?? []) as OpuraDocument[];
    },

    /** Envia um documento novo do cliente ao GED (V1). */
    async enviar(
        cliente: { id: string; organization_id: string },
        arquivo: File,
        meta: MetaDocumentoCliente,
    ): Promise<OpuraDocument> {
        validarArquivo(arquivo);
        if (!meta.nome.trim()) throw new Error('Dê um nome ao documento.');
        const { doc, metadados } = payloadDoDocumentoCliente(cliente, meta);
        return documentService.uploadNewDocument(
            doc as Parameters<typeof documentService.uploadNewDocument>[0],
            arquivo,
            await emailDoUsuario(),
            { metadados },
        );
    },

    /**
     * Edita os dados do documento. Com `arquivo`, sobe antes uma NOVA VERSÃO (o
     * GED guarda a anterior). UPDATE direto porque `OpuraDocumentUpdate` não
     * aceita `null` nas datas, e o supabase-js omite campo `undefined` — limpar a
     * validade por ele não limparia nada.
     */
    async atualizar(doc: OpuraDocument, meta: MetaDocumentoCliente, arquivo?: File | null): Promise<OpuraDocument> {
        if (!meta.nome.trim()) throw new Error('Dê um nome ao documento.');
        if (arquivo) {
            validarArquivo(arquivo);
            const { data: versoes, error } = await supabase
                .from('opura_document_versions')
                .select('version_number')
                .eq('document_id', doc.id)
                .order('version_number', { ascending: false })
                .limit(1);
            if (error) throw new Error(`Erro ao ler as versões do documento: ${error.message}`);
            const proxima = ((versoes?.[0]?.version_number as number | undefined) ?? 0) + 1;
            await documentService.uploadNewVersion(doc.id, doc.organization_id, proxima, arquivo, (await emailDoUsuario()) || 'sistema');
        }
        const { data, error } = await supabase
            .from('opura_documents')
            .update({
                nome: meta.nome.trim(),
                tipo_documento: tipoDocumentoNoGed(meta),
                data_validade: meta.data_validade || null,
                // Mescla: não apaga outras chaves que o GED ou outro módulo tenham gravado.
                metadados: { ...(doc.metadados ?? {}), documento_cliente: meta.tipo },
            })
            .eq('id', doc.id)
            .select(COM_VERSAO)
            .single();
        if (error) throw new Error(`Erro ao salvar o documento: ${error.message}`);
        return data as OpuraDocument;
    },

    /** Apaga do GED (todas as versões e arquivos). O GED recusa documento congelado. */
    async excluir(doc: Pick<OpuraDocument, 'id' | 'organization_id'>): Promise<void> {
        await documentService.deleteDocument(doc.id, doc.organization_id);
    },

    /** URL assinada (15 min), com registro de download na auditoria do GED. */
    async urlDoArquivo(doc: Pick<OpuraDocument, 'id' | 'organization_id' | 'active_version'>): Promise<string> {
        const path = doc.active_version?.storage_path;
        if (!path) throw new Error('Este documento não tem arquivo.');
        return documentService.generateDownloadUrl(path, doc.organization_id, doc.id, await emailDoUsuario());
    },
};
