// Regras PURAS da Edge `sindico-portal-documentos`. Sem Deno e sem import por URL de
// propósito: o Vitest importa este arquivo (`__tests__/sindicoPortalDocumentosRegras.test.ts`).
// Plano: docs/planos/2026-11-25-condominio-assembleias-votacoes.md (Fase B, Task B1).
//
// Quem decide se o SÍNDICO pode enviar é o banco
// (`sindico_portal_assembleia_autorizar_documento`: sessão do síndico + mandato vigente
// naquele condomínio); aqui só se confere a forma do pedido e se monta o caminho.
//
// G5 (26/11/2026, docs/planos/2026-10-24-portal-sindico-gestao-completa.md): a mesma função
// serve à aba Documentos do portal — `finalidade: 'documento'`, as 7 categorias do
// condomínio, visibilidade escolhida, autorização por `sindico_portal_documento_autorizar`
// (síndico logado OU a administradora pelo app) — e REMOVE o arquivo (JSON
// `{ acao: 'remover' }`): o Storage não deixa apagar objeto por SQL (`protect_objects_delete`),
// então o banco apaga a linha e devolve o caminho, e só então a service_role tira o arquivo.
// Sem `finalidade`, tudo segue como a assembleia (fase B).

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

/**
 * Teto do CORPO do pedido: o arquivo (50 MB) + 1 MB de folga para os campos e as fronteiras
 * do multipart. Conferido pelo `Content-Length` ANTES de `req.formData()` — sem isso a
 * função leria o corpo inteiro na memória só para recusar depois (M2 da revisão final da B).
 */
export const TETO_DO_CORPO_BYTES = TAMANHO_MAXIMO_BYTES + 1048576;

/**
 * 413 quando o `Content-Length` declarado passa do teto do corpo; `null` = segue. Sem o
 * cabeçalho (ou com lixo nele) segue como antes: o tamanho do arquivo é conferido em
 * `validarPedido`, e o gateway da Supabase tem o próprio teto.
 */
export function recusaPeloTamanhoDoCorpo(contentLength: string | null): { status: 413; erro: string } | null {
    const bruto = (contentLength ?? '').trim();
    if (!/^\d+$/.test(bruto)) return null;
    if (Number(bruto) <= TETO_DO_CORPO_BYTES) return null;
    return { status: 413, erro: `O arquivo passa do limite de ${TAMANHO_MAXIMO_BYTES / 1048576} MB.` };
}

/** Pela assembleia, o síndico só envia a ATA e a procuração (OUTRO). */
export const CATEGORIAS = ['ATA', 'OUTRO'] as const;
/** Pela aba Documentos (G5): as 7 do CHECK de `condominio_documentos.categoria`. */
export const CATEGORIAS_DOCUMENTO = ['CONVENCAO', 'REGULAMENTO', 'ATA', 'MANUAL', 'LAUDO', 'SEGURO', 'OUTRO'] as const;
export type CategoriaDoSindico = typeof CATEGORIAS_DOCUMENTO[number];

/** `assembleia` (ata/procuração, fase B) ou `documento` (aba Documentos, G5). */
export const FINALIDADES = ['assembleia', 'documento'] as const;
export type Finalidade = typeof FINALIDADES[number];

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
    finalidade?: unknown;
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
    finalidade: Finalidade;
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
    const finalidadeCrua = texto(campos.finalidade).toLowerCase() || 'assembleia';
    if (!(FINALIDADES as readonly string[]).includes(finalidadeCrua)) {
        return { ok: false, status: 400, erro: 'Finalidade inválida.' };
    }
    const finalidade = finalidadeCrua as Finalidade;
    const categoria = texto(campos.categoria).toUpperCase();
    if (finalidade === 'assembleia' && !(CATEGORIAS as readonly string[]).includes(categoria)) {
        return { ok: false, status: 400, erro: 'Categoria inválida: o síndico envia a ata (ATA) ou a procuração (OUTRO).' };
    }
    if (finalidade === 'documento' && !(CATEGORIAS_DOCUMENTO as readonly string[]).includes(categoria)) {
        return { ok: false, status: 400, erro: 'Categoria inválida.' };
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
            // Procuração (OUTRO, pela assembleia) NUNCA vai ao portal: tem dados pessoais do
            // proprietário e de quem o representa. O servidor força — o pedido não decide (M1
            // da revisão final da B). Pela aba Documentos, OUTRO é um documento qualquer.
            visivelPortal: finalidade === 'assembleia' && categoria === 'OUTRO' ? false : booleano(campos.visivelPortal),
            tipo,
            finalidade,
        },
    };
}

/**
 * Texto de `condominio_documentos.descricao`: quem enviou e quando, para a administradora
 * saber que o documento veio do síndico pelo portal (M3 da revisão final da B). A hora é a
 * de Brasília (America/Sao_Paulo), nunca a do servidor (UTC).
 */
export function descricaoDoEnvio(nomeDoSindico: string | null | undefined, quando: Date, autor?: { administradora?: boolean }): string {
    const partes = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(quando);
    const p = (tipo: string) => partes.find(x => x.type === tipo)?.value ?? '';
    const nome = (nomeDoSindico ?? '').trim();
    // A administradora pelo app (G5): o banco já devolve "Fulano (administradora)".
    const quem = autor?.administradora
        ? (nome ? `Enviado por ${nome}` : 'Enviado pela administradora')
        : (nome ? `Enviado pelo síndico ${nome}` : 'Enviado pelo síndico');
    return `${quem} pelo Portal do Síndico em ${p('day')}/${p('month')}/${p('year')} às ${p('hour')}:${p('minute')} (horário de Brasília)`;
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

export interface PedidoDeRemocao {
    token: string | null;
    clientId: string | null;
    empreendimentoId: string;
    documentoId: string;
}

/** Corpo JSON `{ acao: 'remover', token?, clientId?, empreendimentoId, documentoId }` (G5). */
export function validarRemocao(corpo: unknown): { ok: true; pedido: PedidoDeRemocao } | { ok: false; status: 400; erro: string } {
    const c = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>;
    if (texto(c.acao) !== 'remover') return { ok: false, status: 400, erro: 'Ação inválida.' };
    const empreendimentoId = texto(c.empreendimentoId).toLowerCase();
    if (!UUID.test(empreendimentoId)) return { ok: false, status: 400, erro: 'Informe o condomínio (empreendimentoId).' };
    const documentoId = texto(c.documentoId).toLowerCase();
    if (!UUID.test(documentoId)) return { ok: false, status: 400, erro: 'Informe o documento (documentoId).' };
    const token = texto(c.token) || null;
    const clientIdCru = texto(c.clientId).toLowerCase() || null;
    if (!token && !clientIdCru) return { ok: false, status: 400, erro: 'Informe o acesso do síndico (token ou clientId).' };
    if (!token && clientIdCru && !UUID.test(clientIdCru)) return { ok: false, status: 400, erro: 'clientId inválido.' };
    return { ok: true, pedido: { token, clientId: token ? null : clientIdCru, empreendimentoId, documentoId } };
}
