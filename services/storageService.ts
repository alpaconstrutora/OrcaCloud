
import { supabase } from '../lib/supabase';

export const storageService = {
    async uploadFile(bucket: string, path: string, file: File) {
        const { data, error } = await supabase.storage
            .from(bucket)
            .upload(path, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) throw error;
        return data;
    },

    getPublicUrl(bucket: string, path: string) {
        const { data } = supabase.storage
            .from(bucket)
            .getPublicUrl(path);

        return data.publicUrl;
    },

    /** Upload com upsert (sobrescreve se o path já existir). */
    async upsertFile(bucket: string, path: string, file: File | Blob, contentType?: string) {
        const { data, error } = await supabase.storage
            .from(bucket)
            .upload(path, file, { cacheControl: '3600', upsert: true, contentType });

        if (error) throw error;
        return data;
    },

    /** Baixa um arquivo de um bucket privado como Blob. */
    async download(bucket: string, path: string): Promise<Blob> {
        const { data, error } = await supabase.storage
            .from(bucket)
            .download(path);

        if (error) throw error;
        return data;
    },

    /** Gera URL assinada temporária para um arquivo em bucket privado. */
    async createSignedUrl(bucket: string, path: string, expiresInSeconds = 3600) {
        const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(path, expiresInSeconds);

        if (error) throw error;
        return data.signedUrl;
    },

    async remove(bucket: string, paths: string[]) {
        const { error } = await supabase.storage.from(bucket).remove(paths);
        if (error) throw error;
    }
};
