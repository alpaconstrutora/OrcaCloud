// Regras PURAS da Edge `sindico-portal-documentos`. Sem Deno e sem import por URL de
// propósito: o Vitest importa este arquivo (`__tests__/sindicoPortalDocumentosRegras.test.ts`).
// Plano: docs/planos/2026-11-25-condominio-assembleias-votacoes.md (Fase B, Task B1).
//
// Quem decide se o SÍNDICO pode enviar é o banco
// (`sindico_portal_assembleia_autorizar_documento`: sessão do síndico + mandato vigente
// naquele condomínio); aqui só se confere a forma do pedido e se monta o caminho.

/** Bucket PRIVADO dos documentos do condomínio (o mesmo de `condominioComunicacaoService`). */
export const BUCKET = 'condominio-documentos';

/** Espelha `MIME_PERMITIDOS` de services/condominioComunicacaoService.ts (= allowed_mime_types do bucket). */
export const MIME_PERMITIDOS: readonly string[] = [
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/** Igual a `TAMANHO_MAXIMO_BYTES` do serviço (= file_size_limit do bucket): 50 MB. */
export const TAMANHO_MAXIMO_BYTES = 52428800;

/** O síndico só envia a ATA da assembleia e a procuração (OUTRO). */
export const CATEGORIAS = ['ATA', 'OUTRO'] as const;
export type CategoriaDoSindico = typeof CATEGORIAS[number];

/** Teto do título (a tela monta "Ata da AGE — <título da assembleia>"). */
export const MAX_TITULO = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CamposRecebidos {
    token?: unknown;
    clientId?: unknown;
    empreendimentoId?: unknown;
    categoria?: unknown;
    titulo?: unknown;
    visivelPortal?: unknown;
}

export interface ArquivoRecebido {
    name: string;
    type: string;
    size: number;
}

export interface PedidoDeDocumento {
    /** Pelo link: o token vai para o banco e o clientId não (como o sindico-portal-financeiro). */
    token: string | null;
    clientId: string | null;
    empreendimentoId: string;
    categoria: CategoriaDoSindico;
    titulo: string;
    visivelPortal: boolean;
    tipo: string;
}

export type ResultadoValidacao =
    | { ok: true; pedido: PedidoDeDocumento }
    | { ok: false; status: 400 | 413 | 415; erro: string };

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** FormData manda texto: 'true' / '1' / 'on' liga; o resto desliga. */
function booleano(v: unknown): boolean {
    return ['true', '1', 'on', 'sim'].includes(texto(v).toLowerCase());
}

export function validarPedido(campos: CamposRecebidos, arquivo: ArquivoRecebido | null): ResultadoValidacao {
    const empreendimentoId = texto(campos.empreendimentoId).toLowerCase();
    if (!UUID.test(empreendimentoId)) {
        return { ok: false, status: 400, erro: 'Informe o condomínio (empreendimentoId).' };
    }
    const token = texto(campos.token) || null;
    const clientIdCru = texto(campos.clientId).toLowerCase() || null;
    if (!token && !clientIdCru) {
        return { ok: false, status: 400, erro: 'Informe o acesso do síndico (token ou clientId).' };
    }
    if (!token && clientIdCru && !UUID.test(clientIdCru)) {
        return { ok: false, status: 400, erro: 'clientId inválido.' };
    }
    const categoria = texto(campos.categoria).toUpperCase();
    if (!(CATEGORIAS as readonly string[]).includes(categoria)) {
        return { ok: false, status: 400, erro: 'Categoria inválida: o síndico envia a ata (ATA) ou a procuração (OUTRO).' };
    }
    const titulo = texto(campos.titulo);
    if (!titulo) return { ok: false, status: 400, erro: 'Informe o título do documento.' };
    if (titulo.length > MAX_TITULO) {
        return { ok: false, status: 400, erro: `O título tem ${titulo.length} caracteres: use até ${MAX_TITULO}.` };
    }
    if (!arquivo || typeof arquivo.size !== 'number' || arquivo.size <= 0) {
        return { ok: false, status: 400, erro: 'Envie o arquivo.' };
    }
    const tipo = (arquivo.type || '').toLowerCase();
    if (!MIME_PERMITIDOS.includes(tipo)) {
        return { ok: false, status: 415, erro: 'Tipo de arquivo não aceito. Aceitos: PDF, Word, Excel e imagem.' };
    }
    if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
        return {
            ok: false, status: 413,
            erro: `O arquivo tem ${(arquivo.size / 1048576).toFixed(1)} MB e o limite é ${TAMANHO_MAXIMO_BYTES / 1048576} MB.`,
        };
    }
    return {
        ok: true,
        pedido: {
            token,
            clientId: token ? null : clientIdCru,
            empreendimentoId,
            categoria: categoria as CategoriaDoSindico,
            titulo,
            visivelPortal: booleano(campos.visivelPortal),
            tipo,
        },
    };
}

/** `Convencao 2026.PDF` → `pdf`. Vazio quando o nome não tem extensão (= `extensaoDe` do serviço). */
export function extensaoDe(nome: string): string {
    const partes = (nome || '').split('.');
    return partes.length > 1 ? partes.pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

/**
 * `{org}/{empreendimento}/{uuid}.{ext}` — o MESMO caminho de `uploadDocumento`: o primeiro
 * segmento é a ORGANIZAÇÃO do condomínio, que é o que as policies do bucket leem.
 * Montado só com o que o servidor conferiu (org do banco, UUIDs); o nome do arquivo
 * entra só como extensão saneada.
 */
export function caminhoDoDocumento(org: string, empreendimentoId: string, id: string, nomeDoArquivo: string): string {
    if (!UUID.test(org) || !UUID.test(empreendimentoId) || !UUID.test(id)) {
        throw new Error('caminhoDoDocumento: org, empreendimento e id têm de ser UUID.');
    }
    const ext = extensaoDe(nomeDoArquivo);
    return `${org}/${empreendimentoId}/${id}${ext ? `.${ext}` : ''}`;
}
