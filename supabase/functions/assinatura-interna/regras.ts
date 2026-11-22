// Regras PURAS da Edge `assinatura-interna` (assinatura eletrônica sem certificado).
// Sem Deno e sem import por URL de propósito: o Vitest importa este arquivo
// (`__tests__/assinaturaInternaRegras.test.ts`). Quem decide QUEM pode assinar
// e em que estado o envelope está é o banco (RPCs `assinatura_*`, migration
// aplicar_20271122100000_assinatura_interna.sql); aqui só se confere a forma do
// pedido, se monta texto (termo, manifesto) e se mapeiam erros.
// Plano: docs/planos/2026-11-21-assinatura-eletronica-interna.md

/** Versão do termo gravada em cada assinatura — mudou o texto, muda a versão. */
export const TERMO_VERSAO = '2026-11-21.1';

/**
 * Declaração que o signatário marca antes de assinar. ⚠️ Revisão jurídica antes
 * de liberar o envio (F4). Mudar o texto = subir TERMO_VERSAO.
 */
export const TERMO_DE_ACEITE =
    'Declaro que li integralmente o documento acima, que concordo com o seu conteúdo e que ' +
    'esta assinatura eletrônica — confirmada pelo código enviado ao meu e-mail e pelo meu CPF — ' +
    'expressa a minha vontade e me identifica como signatário, nos termos do art. 10, § 2º, da ' +
    'MP nº 2.200-2/2001 e da Lei nº 14.063/2020.';

export const CANAIS = ['PORTAL_CLIENTE', 'MEMBRO', 'PORTAL_CORRETOR', 'LINK'] as const;
export type Canal = typeof CANAIS[number];

export const ROTULO_DO_PAPEL: Record<string, string> = {
    PARTE: 'Parte',
    REPRESENTANTE: 'Representante da empresa',
    TESTEMUNHA: 'Testemunha',
    CORRETOR: 'Corretor',
};

export const ROTULO_DO_CANAL: Record<string, string> = {
    PORTAL_CLIENTE: 'Portal do Cliente',
    MEMBRO: 'Aplicativo (usuário da empresa)',
    PORTAL_CORRETOR: 'Portal do Corretor',
    LINK: 'Link pessoal enviado por e-mail',
};

export const MAX_SIGNATARIOS = 12;
export const MAX_TITULO = 200;
export const MAX_BYTES_PDF = 20 * 1024 * 1024;

export type SignatarioPedido =
    | { canal: 'PORTAL_CLIENTE'; client_id: string }
    | { canal: 'MEMBRO'; user_id: string; cpf?: string }
    | { canal: 'PORTAL_CORRETOR'; broker_id: string }
    | { canal: 'LINK'; nome: string; email: string; cpf: string };

export type Pedido =
    | { acao: 'criar'; origem_tipo: 'CDV' | 'DEAL_DOC'; origem_id: string; titulo: string | null; signatarios: SignatarioPedido[]; expira_dias: number | null }
    | { acao: 'ver' | 'pedir_codigo'; signatario_id: string; canal: Canal; credencial: string | null }
    | { acao: 'assinar'; signatario_id: string; canal: Canal; credencial: string | null; codigo: string; cpf: string; aceite: true; termo_versao: string }
    | { acao: 'finalizar'; envelope_id: string }
    | { acao: 'cancelar'; envelope_id: string; motivo: string | null };

export type ResultadoValidacao = { ok: true; pedido: Pedido } | { ok: false; erro: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const texto = (v: unknown, max: number): string | null =>
    typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null;
const recusa = (erro: string): ResultadoValidacao => ({ ok: false, erro });

export const digitosCpf = (v: unknown): string => (typeof v === 'string' ? v.replace(/\D/g, '') : '');

/** CPF com dígitos verificadores corretos (mesma conta de `_assinatura_cpf_valido`). */
export function cpfValido(v: unknown): boolean {
    const c = digitosCpf(v);
    if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
    const dv = (n: number) => {
        let s = 0;
        for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
        const r = (s * 10) % 11;
        return r === 10 ? 0 : r;
    };
    return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

export function formatarCpf(v: unknown): string {
    const c = digitosCpf(v);
    return c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c;
}

/** `***.456.789-**` — igual a `_assinatura_cpf_mascarado` no banco. */
export function mascararCpf(v: unknown): string {
    const c = digitosCpf(v);
    return c.length === 11 ? `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**` : '***';
}

function validarSignatario(v: unknown): SignatarioPedido | string {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return 'Signatário inválido.';
    const s = v as Record<string, unknown>;
    switch (s.canal) {
        case 'PORTAL_CLIENTE':
            return ehUuid(s.client_id) ? { canal: 'PORTAL_CLIENTE', client_id: s.client_id } : 'Cliente inválido.';
        case 'MEMBRO': {
            if (!ehUuid(s.user_id)) return 'Representante inválido.';
            const cpf = digitosCpf(s.cpf);
            return cpf ? { canal: 'MEMBRO', user_id: s.user_id, cpf } : { canal: 'MEMBRO', user_id: s.user_id };
        }
        case 'PORTAL_CORRETOR':
            return ehUuid(s.broker_id) ? { canal: 'PORTAL_CORRETOR', broker_id: s.broker_id } : 'Corretor inválido.';
        case 'LINK': {
            const nome = texto(s.nome, 200);
            const email = texto(s.email, 254)?.toLowerCase() ?? null;
            if (!nome) return 'Informe o nome da testemunha.';
            if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return `E-mail inválido para ${nome}.`;
            if (!cpfValido(s.cpf)) return `CPF inválido para ${nome}.`;
            return { canal: 'LINK', nome, email, cpf: digitosCpf(s.cpf) };
        }
        default:
            return 'Canal de signatário inválido.';
    }
}

export function validarPedido(body: unknown): ResultadoValidacao {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return recusa('Corpo inválido.');
    const b = body as Record<string, unknown>;

    switch (b.acao) {
        case 'criar': {
            if (b.origem_tipo !== 'CDV' && b.origem_tipo !== 'DEAL_DOC') return recusa('Origem inválida.');
            if (!ehUuid(b.origem_id)) return recusa('Documento inválido.');
            if (!Array.isArray(b.signatarios) || b.signatarios.length === 0) return recusa('Informe ao menos um signatário.');
            if (b.signatarios.length > MAX_SIGNATARIOS) return recusa(`No máximo ${MAX_SIGNATARIOS} signatários por documento.`);
            const signatarios: SignatarioPedido[] = [];
            for (const s of b.signatarios) {
                const r = validarSignatario(s);
                if (typeof r === 'string') return recusa(r);
                signatarios.push(r);
            }
            const dias = typeof b.expira_dias === 'number' && Number.isInteger(b.expira_dias)
                ? Math.min(90, Math.max(1, b.expira_dias)) : null;
            return {
                ok: true,
                pedido: { acao: 'criar', origem_tipo: b.origem_tipo, origem_id: b.origem_id, titulo: texto(b.titulo, MAX_TITULO), signatarios, expira_dias: dias },
            };
        }
        case 'ver':
        case 'pedir_codigo':
        case 'assinar': {
            if (!ehUuid(b.signatario_id)) return recusa('Assinatura inválida.');
            if (typeof b.canal !== 'string' || !(CANAIS as readonly string[]).includes(b.canal)) return recusa('Canal inválido.');
            const canal = b.canal as Canal;
            const credencial = canal === 'MEMBRO' ? null : texto(b.credencial, 200);
            if (canal !== 'MEMBRO' && !credencial) return recusa('Acesso inválido.');
            if (b.acao !== 'assinar') return { ok: true, pedido: { acao: b.acao, signatario_id: b.signatario_id, canal, credencial } };
            if (typeof b.codigo !== 'string' || !/^\d{6}$/.test(b.codigo.trim())) return recusa('Informe o código de 6 dígitos.');
            if (digitosCpf(b.cpf).length !== 11) return recusa('Informe o seu CPF.');
            if (b.aceite !== true) return recusa('Marque a declaração de aceite para assinar.');
            const termo = texto(b.termo_versao, 40);
            if (!termo) return recusa('Versão do termo ausente.');
            return {
                ok: true,
                pedido: { acao: 'assinar', signatario_id: b.signatario_id, canal, credencial, codigo: b.codigo.trim(), cpf: digitosCpf(b.cpf), aceite: true, termo_versao: termo },
            };
        }
        case 'finalizar':
            return ehUuid(b.envelope_id) ? { ok: true, pedido: { acao: 'finalizar', envelope_id: b.envelope_id } } : recusa('Envelope inválido.');
        case 'cancelar':
            return ehUuid(b.envelope_id)
                ? { ok: true, pedido: { acao: 'cancelar', envelope_id: b.envelope_id, motivo: texto(b.motivo, 500) } }
                : recusa('Envelope inválido.');
        default:
            return recusa('Ação desconhecida.');
    }
}

/** Erro de RPC → status HTTP. 42501 = sem permissão (mesma resposta para "não existe"). */
export function respostaDoErroDaRpc(erro: { code?: string; message?: string } | null | undefined): { status: number; erro: string } {
    const code = erro?.code ?? '';
    const msg = (erro?.message ?? '').trim();
    if (code === '42501') return { status: 403, erro: 'Assinatura não encontrada ou sem permissão.' };
    if (code === '54000') return { status: 429, erro: msg || 'Muitas tentativas. Tente de novo mais tarde.' };
    if (code === '22023') return { status: 400, erro: msg || 'Pedido inválido.' };
    if (code === 'P0002') return { status: 404, erro: 'Não encontrado.' };
    return { status: 500, erro: 'Não foi possível concluir agora. Tente de novo.' };
}

/** 6 dígitos a partir de um inteiro aleatório (o chamador usa crypto.getRandomValues). */
export function codigoDeSeisDigitos(aleatorio: number): string {
    return String(Math.abs(Math.trunc(aleatorio)) % 1_000_000).padStart(6, '0');
}

/** O que vai para o hash do código: o id do signatário amarra o código a ele. */
export const materialDoCodigo = (signatarioId: string, codigo: string) => `${signatarioId}:${codigo}`;

export function hexDe(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(dados: string | Uint8Array): Promise<string> {
    const bytes = typeof dados === 'string' ? new TextEncoder().encode(dados) : dados;
    return hexDe(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
}

/** IP de quem chamou (o gateway põe o do cliente no 1º item de x-forwarded-for). */
export function ipDoPedido(headers: { get(nome: string): string | null }): string | null {
    const xff = headers.get('x-forwarded-for');
    const ip = (xff ? xff.split(',')[0] : headers.get('cf-connecting-ip') ?? headers.get('x-real-ip') ?? '')?.trim();
    return ip ? ip.slice(0, 100) : null;
}

/** Bytes começam com `%PDF-` (o bucket já recusa outro MIME; isto confere o conteúdo). */
export function pareceUmPdf(bytes: Uint8Array): boolean {
    return bytes.length > 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

export interface OrigemDoArquivo {
    origem_tipo: 'CDV' | 'DEAL_DOC';
    organization_id: string;
    contract_id?: string | null;
    owner_type?: 'CONTRACT' | 'ADDENDUM' | null;
    owner_id?: string | null;
    deal_id?: string | null;
}

/** Pasta onde o arquivo da origem TEM de estar (bucket `documents`). */
export function pastaDaOrigem(o: OrigemDoArquivo): string | null {
    if (o.origem_tipo === 'DEAL_DOC') return o.deal_id ? `${o.organization_id}/negociacoes/${o.deal_id}/` : null;
    if (o.owner_type === 'ADDENDUM') return o.owner_id ? `contract-addendums/${o.owner_id}/` : null;
    return o.contract_id ? `contract-minutas/${o.contract_id}/` : null;
}

/** Onde a cópia ASSINADA fica no bucket `documents` (a mesma pasta da origem). */
export function caminhoDoAssinado(o: OrigemDoArquivo, envelopeId: string): string | null {
    const pasta = pastaDaOrigem(o);
    return pasta ? `${pasta}assinado-${envelopeId}.pdf` : null;
}

/** Link que o e-mail de convite leva, por canal (o token do link vai no fragmento). */
export function linkParaAssinar(
    frontend: string,
    canal: Canal,
    signatarioId: string,
    credencial: string | null,
): string {
    const base = frontend.replace(/\/+$/, '');
    const sig = encodeURIComponent(signatarioId);
    switch (canal) {
        case 'PORTAL_CLIENTE': return `${base}/portal-cliente?token=${encodeURIComponent(credencial ?? '')}&assinar=${sig}`;
        case 'PORTAL_CORRETOR': return `${base}/portal-corretor?token=${encodeURIComponent(credencial ?? '')}&assinar=${sig}`;
        case 'MEMBRO': return `${base}/?assinar=${sig}`;
        case 'LINK': return `${base}/assinar#s=${sig}&t=${encodeURIComponent(credencial ?? '')}`;
    }
}

export const urlDeValidacao = (frontend: string, envelopeId: string) =>
    `${frontend.replace(/\/+$/, '')}/publico/validar-assinatura/${envelopeId}`;

/**
 * As fontes padrão do PDF (Helvetica, WinAnsi) não desenham fora do Latin-1:
 * troca aspas/traços tipográficos e descarta o resto, para o carimbo não quebrar
 * com um nome ou título colado de outro lugar.
 */
export function sanitizarWinAnsi(texto: string): string {
    return texto
        .replace(/[‘’‚′]/g, "'")
        .replace(/[“”„″]/g, '"')
        .replace(/[–—−]/g, '-')
        .replace(/…/g, '...')
        .replace(/[   ]/g, ' ')
        .replace(/[^\x20-\x7E\xA1-\xFF]/g, '');
}

export function dataHoraBrasilia(iso: string | null | undefined): string {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    const partes = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(d);
    return `${partes.replace(',', '')} (horário de Brasília)`;
}

export interface EnvelopeDoManifesto {
    id: string;
    titulo: string;
    emitente: string;
    criado_em: string;
    concluido_em: string | null;
    paginas: number | null;
    original_sha256: string;
}

export interface SignatarioDoManifesto {
    nome: string;
    representa: string | null;
    papel: string;
    canal: string;
    email: string;
    cpf: string;
    assinado_em: string | null;
    ip: string | null;
    user_agent: string | null;
    termo_versao: string | null;
}

export interface BlocoDoManifesto { titulo: string; linhas: string[] }

/** Conteúdo da página de manifesto, já em texto que a fonte do PDF desenha. */
export function blocosDoManifesto(
    env: EnvelopeDoManifesto,
    signatarios: SignatarioDoManifesto[],
    urlValidacao: string,
): BlocoDoManifesto[] {
    const s = sanitizarWinAnsi;
    const blocos: BlocoDoManifesto[] = [{
        titulo: 'Documento',
        linhas: [
            `Título: ${s(env.titulo)}`,
            `Emitente: ${s(env.emitente)}`,
            `Envelope: ${env.id}`,
            `Enviado para assinatura em: ${dataHoraBrasilia(env.criado_em)}`,
            `Concluído em: ${dataHoraBrasilia(env.concluido_em)}`,
            `Páginas do documento original: ${env.paginas ?? '-'}`,
            `SHA-256 do documento original: ${env.original_sha256}`,
        ],
    }];
    signatarios.forEach((g, i) => {
        blocos.push({
            titulo: `${i + 1}. ${s(g.nome)}${g.representa ? ` (por ${s(g.representa)})` : ''} - ${ROTULO_DO_PAPEL[g.papel] ?? g.papel}`,
            linhas: [
                `CPF: ${formatarCpf(g.cpf)}   E-mail: ${s(g.email)}`,
                `Assinou em: ${dataHoraBrasilia(g.assinado_em)}`,
                `Meio: ${ROTULO_DO_CANAL[g.canal] ?? g.canal}; código de 6 dígitos enviado ao e-mail, CPF e aceite do termo v${s(g.termo_versao ?? '-')}`,
                `IP: ${s(g.ip ?? '-')}   Dispositivo: ${s((g.user_agent ?? '-').slice(0, 110))}`,
            ],
        });
    });
    blocos.push({
        titulo: 'Declaração aceita por cada signatário',
        linhas: [s(TERMO_DE_ACEITE)],
    });
    blocos.push({
        titulo: 'Validação',
        linhas: [
            'A autenticidade e a integridade deste documento podem ser conferidas em:',
            urlValidacao,
            'Assinatura eletrônica avançada sem certificado ICP-Brasil (MP 2.200-2/2001, art. 10, § 2º; Lei 14.063/2020).',
            'Os registros de cada etapa (envio, visualização, código, assinatura) ficam guardados em trilha imutável.',
        ],
    });
    return blocos;
}

/** Quebra um texto em linhas que cabem na largura, medindo com a função da fonte. */
export function quebrarLinhas(texto: string, larguraMax: number, medir: (t: string) => number): string[] {
    const palavras = texto.split(/\s+/).filter(Boolean);
    const linhas: string[] = [];
    let atual = '';
    for (const p of palavras) {
        const tentativa = atual ? `${atual} ${p}` : p;
        if (medir(tentativa) <= larguraMax) { atual = tentativa; continue; }
        if (atual) linhas.push(atual);
        if (medir(p) <= larguraMax) { atual = p; continue; }
        // Palavra maior que a linha (hash, URL): corta por caractere.
        let pedaco = '';
        for (const c of p) {
            if (medir(pedaco + c) > larguraMax && pedaco) { linhas.push(pedaco); pedaco = c; } else pedaco += c;
        }
        atual = pedaco;
    }
    if (atual) linhas.push(atual);
    return linhas;
}
