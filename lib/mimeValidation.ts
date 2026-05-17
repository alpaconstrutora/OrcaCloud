/**
 * Validação de MIME type para uploads de documentos de colaboradores.
 *
 * Estratégia de defesa em profundidade:
 *  1. Extensão deve estar no allowlist (bloqueia .exe, .sh, .php, etc.)
 *  2. MIME type declarado pelo browser deve corresponder à extensão
 *     (bloqueia renomeação: virus.exe → virus.pdf)
 *  3. Arquivo não pode estar vazio nem exceder 10 MB
 *
 * Nota: `file.type` é preenchido pelo browser via MIME sniffing — não é
 * confiável isoladamente, mas combinado com a extensão fornece proteção adequada
 * no client. O servidor (Supabase Storage) é a última linha de defesa.
 */

export interface MimeValidationResult {
    valid: boolean;
    error?: string;
}

/** Mapa canônico: extensão → MIME types aceitáveis */
const ALLOWED_TYPES: Readonly<Record<string, string[]>> = {
    pdf:  ['application/pdf'],
    jpg:  ['image/jpeg'],
    jpeg: ['image/jpeg'],
    png:  ['image/png'],
};

export const ACCEPTED_EXTENSIONS = Object.keys(ALLOWED_TYPES);
export const ACCEPTED_MIMES     = [...new Set(Object.values(ALLOWED_TYPES).flat())];

/** Accept string para uso em <input type="file"> */
export const DOCUMENT_ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function validateDocumentFile(file: File): MimeValidationResult {
    // ── 1. Arquivo não pode estar vazio ─────────────────────────────────────
    if (file.size === 0) {
        return { valid: false, error: 'O arquivo está vazio.' };
    }

    // ── 2. Tamanho máximo ────────────────────────────────────────────────────
    if (file.size > MAX_FILE_SIZE) {
        return { valid: false, error: 'O arquivo excede o limite de 10 MB.' };
    }

    // ── 3. Extensão — bloqueia nomes sem ponto e extensões não permitidas ───
    const parts = file.name.toLowerCase().split('.');
    if (parts.length < 2 || parts[parts.length - 1] === '') {
        return { valid: false, error: 'O arquivo não possui extensão. Apenas PDF, JPG e PNG são aceitos.' };
    }
    const ext = parts[parts.length - 1];

    if (!ALLOWED_TYPES[ext]) {
        return {
            valid: false,
            error: `Extensão ".${ext}" não é permitida. Apenas PDF, JPG e PNG são aceitos.`,
        };
    }

    // ── 4. MIME type deve estar presente ────────────────────────────────────
    if (!file.type) {
        return {
            valid: false,
            error: 'Não foi possível identificar o tipo do arquivo. Verifique se é um PDF, JPG ou PNG válido.',
        };
    }

    // ── 5. MIME deve corresponder à extensão (anti-renomeação) ───────────────
    const allowedMimesForExt = ALLOWED_TYPES[ext];
    if (!allowedMimesForExt.includes(file.type)) {
        return {
            valid: false,
            error: `O arquivo "${file.name}" parece não ser um ${ext.toUpperCase()} válido (tipo detectado: ${file.type}).`,
        };
    }

    return { valid: true };
}
