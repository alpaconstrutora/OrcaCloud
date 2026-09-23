import { supabase } from '../lib/supabase';

/**
 * Mídia do Diário de Obras (fotos, vídeos, documentos) no bucket privado
 * `diario-midia`.
 *
 * O registro do diário continua sendo JSONB em `projects.settings.diaryEntries`
 * — `images: string[]`, `videos: string[]`, `documents[].url` — mas o que vai
 * dentro desses campos passa a ser o CAMINHO do objeto no bucket
 * (`{org}/{projeto}/{uuid}.{ext}`), não mais o conteúdo em base64.
 *
 * Duas regras que este módulo faz valer:
 *
 *  1. **URL assinada nunca é persistida.** Ela expira; o que se grava é o
 *     path, e `signDiaryMediaUrls` resolve na leitura. (Armadilha F0/F1 da
 *     privatização de storage: URL pública gravada no banco em quatro tabelas.)
 *  2. **Data URL antiga continua valendo.** Tudo o que não é path (`data:`,
 *     `http(s):`, `blob:`) passa direto — registros de antes desta mudança e
 *     diários importados seguem abrindo.
 *
 * O primeiro segmento do path é a ORGANIZAÇÃO porque é isso que as policies do
 * bucket leem (`is_org_member(foldername(name)[1])`). Inverter a ordem cega a
 * RLS — foi o defeito do `blueprint_underlays`.
 */

export const DIARY_MEDIA_BUCKET = 'diario-midia';

/** 1 h: a foto fica na tela aberta; 15 min (padrão dos downloads) expirava com o relatório ainda na impressora. */
const TTL_PADRAO_SEGUNDOS = 60 * 60;

/** `true` para o que precisa de assinatura; `false` para data URL, http(s) e blob. */
export function isDiaryStoragePath(ref: string | null | undefined): ref is string {
    if (!ref) return false;
    const r = ref.trim();
    if (r === '') return false;
    if (/^(data|https?|blob):/i.test(r)) return false;
    return true;
}

const EXT_POR_MIME: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

/** Extensão pelo MIME; se o navegador não informar, pelo nome; senão `bin`. */
export function diaryMediaExtension(file: { name?: string; type?: string }): string {
    const porMime = file.type ? EXT_POR_MIME[file.type.toLowerCase()] : undefined;
    if (porMime) return porMime;
    const m = /\.([a-z0-9]{1,5})$/i.exec(file.name || '');
    return m ? m[1].toLowerCase() : 'bin';
}

export function buildDiaryMediaPath(orgId: string, projectId: string, ext: string, id: string = crypto.randomUUID()): string {
    return `${orgId}/${projectId}/${id}.${ext}`;
}

export interface UploadDiaryMediaArgs {
    orgId: string;
    projectId: string;
    file: File;
}

/** Envia o arquivo e devolve o PATH (o que se grava no registro). */
export async function uploadDiaryMedia({ orgId, projectId, file }: UploadDiaryMediaArgs): Promise<string> {
    if (!orgId) throw new Error('Diário sem organização: não há onde guardar o arquivo.');
    if (!projectId) throw new Error('Diário sem projeto: não há onde guardar o arquivo.');
    const path = buildDiaryMediaPath(orgId, projectId, diaryMediaExtension(file));
    const { error } = await supabase.storage
        .from(DIARY_MEDIA_BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
    if (error) throw error;
    return path;
}

export interface SignDiaryMediaOptions {
    /** Link público do Portal do Cliente: sem sessão, assina pela edge function. */
    portalToken?: string;
    ttlSeconds?: number;
}

/**
 * Resolve referências (path, data URL ou URL) para algo que `<img src>` abre.
 * Devolve um mapa `ref → url`; o que não é path volta igual. Path que não pôde
 * ser assinado (objeto apagado, sem permissão) fica FORA do mapa — a tela
 * decide o que mostrar no lugar.
 */
export async function signDiaryMediaUrls(refs: readonly string[], opts: SignDiaryMediaOptions = {}): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const paths: string[] = [];
    for (const ref of refs) {
        if (!ref) continue;
        if (isDiaryStoragePath(ref)) { if (!paths.includes(ref)) paths.push(ref); }
        else out[ref] = ref;
    }
    if (paths.length === 0) return out;

    if (opts.portalToken) {
        const { data, error } = await supabase.functions.invoke('client-portal-diary-download', {
            body: { token: opts.portalToken, storagePaths: paths },
        });
        if (error) throw error;
        const urls = (data?.urls ?? {}) as Record<string, string>;
        for (const p of paths) if (urls[p]) out[p] = urls[p];
        return out;
    }

    const { data, error } = await supabase.storage
        .from(DIARY_MEDIA_BUCKET)
        .createSignedUrls(paths, opts.ttlSeconds ?? TTL_PADRAO_SEGUNDOS);
    if (error) throw error;
    for (const item of data ?? []) {
        if (item.path && item.signedUrl && !item.error) out[item.path] = item.signedUrl;
    }
    return out;
}

/** Tudo o que um registro referencia (fotos, vídeos, documentos) — para diff de órfãos. */
export function diaryEntryMediaRefs(e: { images?: string[]; videos?: string[]; documents?: { url: string }[] } | null | undefined): string[] {
    if (!e) return [];
    return [...(e.images || []), ...(e.videos || []), ...(e.documents || []).map(d => d.url)].filter(Boolean);
}

/** Best-effort: remove objetos que deixaram de ser referenciados. Ignora o que não é path. */
export async function removeDiaryMedia(refs: readonly string[]): Promise<void> {
    const paths = refs.filter(isDiaryStoragePath);
    if (paths.length === 0) return;
    const { error } = await supabase.storage.from(DIARY_MEDIA_BUCKET).remove(paths);
    if (error) console.warn('[diaryMedia] falha ao remover objetos:', error.message);
}
