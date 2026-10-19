import { supabase } from '../lib/supabase';
import { storageService } from './storageService';
import { TokenMap } from './docxFieldCatalog';

const BUCKET = 'document-templates';

export interface DocumentTemplate {
    id: string;
    organization_id: string;
    name: string;
    description?: string;
    file_path: string;
    file_name?: string;
    detected_tokens: string[];
    token_map: TokenMap;
    is_active: boolean;
    created_by?: string;
    created_at: string;
    updated_at: string;
}

const SELECT_COLS =
    'id, organization_id, name, description, file_path, file_name, detected_tokens, token_map, is_active, created_by, created_at, updated_at';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Origem do .docx de um modelo novo: um arquivo enviado agora, ou o arquivo de
 *  um modelo existente (Duplicar sem enviar versão revisada). */
export type TemplateFileSource = File | { fromPath: string; fileName: string };

const novoCaminho = (organizationId: string, fileName: string) =>
    `${organizationId}/${Date.now()}_${fileName.replace(/[^\w.\-]+/g, '_')}`;

export const documentTemplateService = {
    async list(organizationId?: string): Promise<DocumentTemplate[]> {
        let q = supabase
            .from('document_templates')
            .select(SELECT_COLS)
            .eq('is_active', true)
            .order('name');
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as DocumentTemplate[];
    },

    async get(id: string): Promise<DocumentTemplate | null> {
        const { data, error } = await supabase
            .from('document_templates')
            .select(SELECT_COLS)
            .eq('id', id)
            .maybeSingle();
        if (error) throw error;
        return data as DocumentTemplate | null;
    },

    /** Cria o registro do modelo. O .docx vem de um upload novo ou é COPIADO do
     *  arquivo de outro modelo (Duplicar) — cópia, não o mesmo `file_path`: cada
     *  modelo é dono do próprio arquivo, e limpar o de um nunca quebra o outro. */
    async create(
        organizationId: string,
        source: TemplateFileSource,
        payload: { name: string; description?: string; detected_tokens: string[]; token_map: TokenMap },
    ): Promise<DocumentTemplate> {
        const fileName = source instanceof File ? source.name : source.fileName;
        const path = novoCaminho(organizationId, fileName);
        if (source instanceof File) {
            await storageService.upsertFile(BUCKET, path, source, DOCX_MIME);
        } else {
            await storageService.copy(BUCKET, source.fromPath, path);
        }

        const { data, error } = await supabase
            .from('document_templates')
            .insert({
                organization_id: organizationId,
                name: payload.name,
                description: payload.description ?? null,
                file_path: path,
                file_name: fileName,
                detected_tokens: payload.detected_tokens,
                token_map: payload.token_map,
            })
            .select(SELECT_COLS)
            .single();
        if (error) throw error;
        return data as DocumentTemplate;
    },

    /** Atualiza nome/descrição/mapeamento. Opcionalmente substitui o arquivo .docx. */
    async update(
        id: string,
        organizationId: string,
        payload: Partial<Pick<DocumentTemplate, 'name' | 'description' | 'detected_tokens' | 'token_map'>>,
        newFile?: File,
    ): Promise<DocumentTemplate> {
        const patch: Record<string, unknown> = { ...payload, updated_at: new Date().toISOString() };

        if (newFile) {
            const path = novoCaminho(organizationId, newFile.name);
            await storageService.upsertFile(BUCKET, path, newFile, DOCX_MIME);
            patch.file_path = path;
            patch.file_name = newFile.name;
        }

        const { data, error } = await supabase
            .from('document_templates')
            .update(patch)
            .eq('id', id)
            .select(SELECT_COLS)
            .single();
        if (error) throw error;
        return data as DocumentTemplate;
    },

    async deactivate(id: string): Promise<void> {
        const { error } = await supabase
            .from('document_templates')
            .update({ is_active: false })
            .eq('id', id);
        if (error) throw error;
    },

    /** Baixa o .docx original do modelo como Blob (para preenchimento). */
    async downloadFile(template: Pick<DocumentTemplate, 'file_path'>): Promise<Blob> {
        return storageService.download(BUCKET, template.file_path);
    },
};
