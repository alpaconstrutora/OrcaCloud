import { supabase } from '../lib/supabase';
import {
    ContractDocumentVersion, DocumentKind, DocumentOwnerType, DocumentSource, MinutaVersion,
} from '../types';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Versões de documento de contrato e de aditivo
 * ─────────────────────────────────────────────────────────────────────────
 * Fonte da verdade: tabela `contract_document_versions` (migration
 * 20270828000001), com owner polimórfico (contrato OU aditivo).
 *
 * `contracts.minuta_versions` (JSONB) continua existindo, mas virou
 * **projeção**: `_syncMinutaMirror` é o ÚNICO escritor dela. O Portal do
 * Cliente lê o JSONB (`components/ClientArea.tsx`), então mantê-lo em dia é o
 * que evita o portal ficar desatualizado — e ter um escritor só é o que evita
 * drift entre as duas representações.
 */

const COLS =
    'id, organization_id, contract_id, owner_type, owner_id, v, kind, name, notes, url, ' +
    'storage_path, mime_type, size_bytes, source, template_id, emitted, emitted_at, ' +
    'signature_status, signature_token, signature_url, signature_completed_at, signed_file_url, ' +
    'signature_provider, assinatura_envelope_id, ' +
    'created_by, created_at, updated_at';

const BUCKET = 'documents';

/**
 * Bucket PRIVADO: `url` passa a guardar o CAMINHO (igual a `storage_path`).
 * Linhas antigas guardam a URL pública inteira — todo leitor resolve as duas
 * formas com URL assinada (lib/storageAssinado.ts: `abrirArquivoAssinado`,
 * `caminhoNoBucket`; nos portais, a Edge Function `portal-documentos-download`).
 */

/** Caminho no bucket. Mantém o prefixo do contrato — é dele que a policy do bucket tira a organização. */
const storagePathFor = (ownerType: DocumentOwnerType, ownerId: string, fileName: string) =>
    ownerType === 'ADDENDUM'
        ? `contract-addendums/${ownerId}/${Date.now()}-${fileName.replace(/\s+/g, '_')}`
        : `contract-minutas/${ownerId}/${Date.now()}-${fileName.replace(/\s+/g, '_')}`;

const rows = (data: unknown): ContractDocumentVersion[] =>
    (data ?? []) as unknown as ContractDocumentVersion[];

const ROTULO_ASSINATURA: Record<string, { texto: string; cor: string }> = {
    PENDING: { texto: 'Pendente', cor: 'text-amber-600' },
    SENT: { texto: 'Aguardando', cor: 'text-amber-600' },
    SIGNED: { texto: 'Assinada', cor: 'text-emerald-600' },
    EXPIRED: { texto: 'Prazo vencido', cor: 'text-red-600' },
    CANCELLED: { texto: 'Cancelada', cor: 'text-gray-500' },
};

/** Status da assinatura da versão em texto (§8) e por onde ela corre — `null` sem assinatura. */
export const assinaturaDaVersao = (v: ContractDocumentVersion) => {
    if (!v.signature_status) return null;
    const r = ROTULO_ASSINATURA[v.signature_status] ?? { texto: v.signature_status, cor: 'text-gray-600' };
    const onde = v.signature_provider === 'PORTAL' || v.assinatura_envelope_id ? 'portal' : 'ZapSign';
    return { ...r, texto: `${r.texto} (${onde})` };
};

/** O arquivo que "Abrir documento" mostra: a via ASSINADA quando existe (portal ou
 *  ZapSign) — depois de assinada, o original sem assinatura confundia ("o contrato
 *  não está assinado", 23/11/2026). Mesmo critério de DocumentosDaNegociacaoPanel. */
export const arquivoDaVersao = (v: Pick<ContractDocumentVersion, 'signature_status' | 'signed_file_url' | 'storage_path' | 'url'>) => {
    const assinada = v.signature_status === 'SIGNED' && !!v.signed_file_url;
    return { caminho: assinada ? v.signed_file_url! : (v.storage_path || v.url), assinada };
};

/** Por que a versão não pode ir para a assinatura no portal — `null` quando pode.
 *  Uma regra só para a Emissão e para a negociação (DealSignaturePanel). */
export const motivoNaoEnviaAoPortal = (v: ContractDocumentVersion): string | null => {
    if (!v.emitted) return 'Emita a versão antes de enviar para assinatura';
    if (v.signature_status === 'SIGNED') return 'Versão já assinada';
    if (v.signature_token && (v.signature_status === 'SENT' || v.signature_status === 'PENDING')) return 'Versão enviada ao ZapSign';
    if (v.assinatura_envelope_id && v.signature_status === 'SENT') return 'Assinatura no portal em andamento';
    return null;
};

export const contractDocumentVersionService = {
    /**
     * Todas as versões do contrato E dos seus aditivos, mais recentes primeiro.
     * REGRA #5: não exige organizationId — a RLS já recorta por contrato.
     */
    list: async (contractId: string): Promise<ContractDocumentVersion[]> => {
        const { data, error } = await supabase
            .from('contract_document_versions')
            .select(COLS)
            .eq('contract_id', contractId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return rows(data);
    },

    listByOwner: async (ownerType: DocumentOwnerType, ownerId: string): Promise<ContractDocumentVersion[]> => {
        const { data, error } = await supabase
            .from('contract_document_versions')
            .select(COLS)
            .eq('owner_type', ownerType)
            .eq('owner_id', ownerId)
            .order('v', { ascending: false });
        if (error) throw error;
        return rows(data);
    },

    /** Próximo `v` do owner. `uq_cdv_owner_v` é a rede contra corrida. */
    nextVersion: async (ownerType: DocumentOwnerType, ownerId: string): Promise<number> => {
        const { data } = await supabase
            .from('contract_document_versions')
            .select('v')
            .eq('owner_type', ownerType)
            .eq('owner_id', ownerId)
            .order('v', { ascending: false })
            .limit(1)
            .maybeSingle();
        return ((data?.v as number) ?? 0) + 1;
    },

    /** Upload de arquivo escolhido pelo usuário. Entra como RASCUNHO (não emitido). */
    addVersion: async (input: {
        ownerType: DocumentOwnerType;
        ownerId: string;
        contractId: string;
        organizationId?: string | null;
        file: File;
        name?: string;
        notes?: string;
        kind?: DocumentKind;
    }): Promise<ContractDocumentVersion> => {
        const path = storagePathFor(input.ownerType, input.ownerId, input.file.name);
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, input.file, { upsert: true });
        if (upErr) throw upErr;

        return contractDocumentVersionService._insert({
            ...input,
            url: path,
            storagePath: path,
            mimeType: input.file.type,
            sizeBytes: input.file.size,
            source: 'UPLOAD',
            name: input.name || input.file.name.replace(/\.[^.]+$/, ''),
        });
    },

    /** Salva um documento GERADO (ex.: .docx de template) como versão. */
    addVersionFromBlob: async (input: {
        ownerType: DocumentOwnerType;
        ownerId: string;
        contractId: string;
        organizationId?: string | null;
        blob: Blob;
        fileName: string;
        templateId?: string;
        source?: DocumentSource;
        name?: string;
        notes?: string;
        kind?: DocumentKind;
    }): Promise<ContractDocumentVersion> => {
        const path = storagePathFor(input.ownerType, input.ownerId, input.fileName);
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, input.blob, { upsert: true });
        if (upErr) throw upErr;

        return contractDocumentVersionService._insert({
            ...input,
            url: path,
            storagePath: path,
            mimeType: input.blob.type,
            sizeBytes: input.blob.size,
            source: input.source ?? 'TEMPLATE_DOCX',
            name: input.name || input.fileName.replace(/\.[^.]+$/, ''),
        });
    },

    _insert: async (input: {
        ownerType: DocumentOwnerType; ownerId: string; contractId: string;
        organizationId?: string | null; url: string; storagePath?: string;
        mimeType?: string; sizeBytes?: number; source: DocumentSource;
        templateId?: string; name?: string; notes?: string; kind?: DocumentKind;
    }): Promise<ContractDocumentVersion> => {
        const v = await contractDocumentVersionService.nextVersion(input.ownerType, input.ownerId);
        const payload = {
            organization_id: input.organizationId ?? null,
            contract_id: input.contractId,
            owner_type: input.ownerType,
            owner_id: input.ownerId,
            v,
            kind: input.kind ?? (input.ownerType === 'ADDENDUM' ? 'ADITIVO' : 'MINUTA'),
            name: input.name ?? null,
            notes: input.notes ?? '',
            url: input.url,
            storage_path: input.storagePath ?? null,
            mime_type: input.mimeType ?? null,
            size_bytes: input.sizeBytes ?? null,
            source: input.source,
            template_id: input.templateId ?? null,
            emitted: false,
        };
        const { data, error } = await supabase
            .from('contract_document_versions')
            .insert(payload)
            .select(COLS)
            .single();
        if (error) throw error;

        await contractDocumentVersionService._syncMinutaMirror(input.contractId);
        return data as unknown as ContractDocumentVersion;
    },

    update: async (id: string, patch: { name?: string; notes?: string }): Promise<void> => {
        const { data, error } = await supabase
            .from('contract_document_versions')
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('contract_id')
            .maybeSingle();
        if (error) throw error;
        if (data?.contract_id) await contractDocumentVersionService._syncMinutaMirror(data.contract_id as string);
    },

    /** Emitir = liberar a versão no Portal do Cliente. */
    emit: async (id: string): Promise<void> => {
        const { data, error } = await supabase
            .from('contract_document_versions')
            .update({ emitted: true, emitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('contract_id')
            .maybeSingle();
        if (error) throw error;
        if (data?.contract_id) await contractDocumentVersionService._syncMinutaMirror(data.contract_id as string);
    },

    remove: async (id: string): Promise<void> => {
        const { data: ver } = await supabase
            .from('contract_document_versions')
            .select('id, contract_id, emitted, signature_token, assinatura_envelope_id, storage_path')
            .eq('id', id)
            .maybeSingle();
        if (!ver) return;
        if (ver.emitted) throw new Error('Não é possível excluir uma versão já emitida ao cliente.');
        // ZapSign (signature_token) ou assinatura interna (envelope): a versão é a prova do que foi assinado.
        if (ver.signature_token || ver.assinatura_envelope_id) throw new Error('Esta versão foi enviada para assinatura e não pode ser excluída.');

        const { error } = await supabase.from('contract_document_versions').delete().eq('id', id);
        if (error) throw error;
        // Arquivo no storage: remoção best-effort — falhar aqui não pode
        // impedir a exclusão do registro (o órfão é inofensivo).
        if (ver.storage_path) {
            try { await supabase.storage.from(BUCKET).remove([ver.storage_path as string]); } catch { /* ignora */ }
        }
        await contractDocumentVersionService._syncMinutaMirror(ver.contract_id as string);
    },

    /** Envia a versão para assinatura eletrônica (ZapSign). */
    sendForSignature: async (
        id: string,
        organizationId: string,
        documentBase64: string,
        documentName: string,
        signers: { name: string; email: string; phone?: string }[],
    ): Promise<{ token: string; sign_url: string }> => {
        const { data, error } = await supabase.functions.invoke('sign-contract', {
            body: { action: 'send', documentVersionId: id, organizationId, documentBase64, documentName, signers },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        return { token: data.token, sign_url: data.sign_url };
    },

    /**
     * Consulta o ZapSign e persiste o status.
     *
     * A função de contrato equivalente só consulta e depende do webhook para
     * gravar — aqui gravamos, porque o botão "Atualizar status" que não atualiza
     * nada é exatamente o tipo de coisa que faz o usuário achar que quebrou.
     */
    refreshSignatureStatus: async (id: string): Promise<void> => {
        const { data: ver } = await supabase
            .from('contract_document_versions')
            .select('id, contract_id, organization_id, signature_token')
            .eq('id', id)
            .maybeSingle();
        if (!ver?.signature_token) return;

        const { data, error } = await supabase.functions.invoke('sign-contract', {
            body: {
                action: 'status',
                documentVersionId: id,
                organizationId: ver.organization_id,
                signatureToken: ver.signature_token,
            },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const isSigned = data?.status === 'finished';
        await supabase
            .from('contract_document_versions')
            .update({
                signature_status: isSigned ? 'SIGNED' : 'SENT',
                ...(isSigned ? { signature_completed_at: new Date().toISOString() } : {}),
                ...(isSigned && data?.signed_file ? { signed_file_url: data.signed_file } : {}),
                updated_at: new Date().toISOString(),
            })
            .eq('id', id);
    },

    /**
     * Reconstrói `contracts.minuta_versions` a partir da tabela — único escritor.
     *
     * Projeta as versões EMITIDAS do contrato e dos seus aditivos (é o que o
     * Portal do Cliente mostra). O `v` do JSONB é ordem de exibição; o `v`
     * canônico, por owner, vive na tabela.
     */
    _syncMinutaMirror: async (contractId: string): Promise<void> => {
        try {
            const { data } = await supabase
                .from('contract_document_versions')
                .select('v, kind, name, notes, url, emitted, emitted_at, created_at, owner_type, owner_id')
                .eq('contract_id', contractId)
                .eq('emitted', true)
                .order('created_at', { ascending: true });

            const numeroAditivo = new Map<string, string>();
            const idsAditivo = [...new Set((data ?? [])
                .filter(r => r.owner_type === 'ADDENDUM')
                .map(r => r.owner_id as string))];
            if (idsAditivo.length > 0) {
                const { data: adds } = await supabase
                    .from('contract_addendums')
                    .select('id, number')
                    .in('id', idsAditivo);
                (adds ?? []).forEach(a => numeroAditivo.set(a.id as string, a.number as string));
            }

            const mirror: MinutaVersion[] = (data ?? []).map((r, i) => ({
                v: i + 1,
                url: r.url as string,
                name: (r.name as string) || (r.owner_type === 'ADDENDUM'
                    ? `Aditivo ${numeroAditivo.get(r.owner_id as string) ?? ''} v${r.v}`.trim()
                    : `Minuta v${r.v}`),
                notes: (r.notes as string) || '',
                emitted: true,
                emitted_at: (r.emitted_at as string) ?? undefined,
                created_at: (r.created_at as string) ?? new Date().toISOString(),
            }));

            await supabase.from('contracts').update({ minuta_versions: mirror }).eq('id', contractId);
        } catch (e) {
            // Falha na projeção não pode derrubar a escrita principal: a tabela
            // já tem o dado, e o mirror se refaz na próxima operação.
            console.error('[DOCS] Erro ao sincronizar minuta_versions:', e);
        }
    },
};
