import { supabase } from '../lib/supabase';

const BUCKET = 'opportunity-dataroom';

export type DocumentCategory =
    | 'evte' | 'sondagem' | 'planta' | 'matricula'
    | 'financeiro' | 'licenca' | 'memorial' | 'outro';

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
    evte:       'EVTE',
    sondagem:   'Sondagem',
    planta:     'Planta',
    matricula:  'Matrícula',
    financeiro: 'Financeiro',
    licenca:    'Licença / Alvará',
    memorial:   'Memorial Descritivo',
    outro:      'Outro',
};

export const DOCUMENT_CATEGORY_ICONS: Record<DocumentCategory, string> = {
    evte:       '📊',
    sondagem:   '🔩',
    planta:     '📐',
    matricula:  '📋',
    financeiro: '💰',
    licenca:    '✅',
    memorial:   '📄',
    outro:      '📎',
};

export interface OpportunityDocument {
    id?: string;
    organization_id: string;
    opportunity_id: string;
    name: string;
    description?: string;
    file_path: string;
    file_size?: number;
    mime_type?: string;
    category: DocumentCategory;
    uploaded_by?: string;
    created_at?: string;
}

const DOC_COLS = 'id, organization_id, opportunity_id, name, description, file_path, file_size, mime_type, category, uploaded_by, created_at';

function buildPath(orgId: string, oppId: string, fileName: string): string {
    const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
    const uuid = crypto.randomUUID();
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
    return `${orgId}/${oppId}/${uuid}-${safe}${ext.startsWith('.') ? '' : ext}`;
}

function fmtFileSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
}

export { fmtFileSize };

export const opportunityDocumentsService = {

    async list(opportunityId: string): Promise<OpportunityDocument[]> {
        const { data, error } = await supabase
            .from('opportunity_documents')
            .select(DOC_COLS)
            .eq('opportunity_id', opportunityId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []) as OpportunityDocument[];
    },

    async upload(
        orgId: string,
        oppId: string,
        file: File,
        meta: { category: DocumentCategory; description?: string; uploadedBy?: string },
        onProgress?: (pct: number) => void,
    ): Promise<OpportunityDocument> {
        const path = buildPath(orgId, oppId, file.name);

        // Upload para o bucket privado
        const { error: upErr } = await supabase.storage
            .from(BUCKET)
            .upload(path, file, { cacheControl: '3600', upsert: false });

        if (upErr) throw upErr;
        onProgress?.(100);

        // Registra na tabela
        const { data, error: dbErr } = await supabase
            .from('opportunity_documents')
            .insert({
                organization_id: orgId,
                opportunity_id:  oppId,
                name:            file.name,
                description:     meta.description ?? null,
                file_path:       path,
                file_size:       file.size,
                mime_type:       file.type || null,
                category:        meta.category,
                uploaded_by:     meta.uploadedBy ?? null,
            })
            .select(DOC_COLS)
            .single();

        if (dbErr) {
            // Limpa o arquivo do storage se a inserção falhou
            await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
            throw dbErr;
        }

        return data as unknown as OpportunityDocument;
    },

    async getSignedUrl(filePath: string, expiresInSeconds = 3600): Promise<string> {
        const { data, error } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(filePath, expiresInSeconds);
        if (error) throw error;
        return data.signedUrl;
    },

    async remove(id: string, filePath: string): Promise<void> {
        // Remove do storage primeiro, depois da tabela
        await supabase.storage.from(BUCKET).remove([filePath]).catch(() => {});
        const { error } = await supabase
            .from('opportunity_documents')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },
};
