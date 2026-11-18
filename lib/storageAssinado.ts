/**
 * Arquivo de bucket PRIVADO: URL assinada na hora de usar, nunca URL pública.
 *
 * `documents` e `organization-assets` eram públicos — quem tinha o caminho
 * baixava sem login (achados F8/F9 da varredura de 15/11/2026). Agora são
 * privados: a leitura passa pela RLS do Storage (sessão de quem chama) ou, nos
 * portais sem sessão de membro, pela Edge Function `portal-documentos-download`.
 *
 * Regras que este módulo faz valer — e que motivaram a tentativa anterior a ser
 * recusada na revisão:
 *  • a ABA abre no clique, ANTES do `await` da assinatura: aberta depois, o
 *    bloqueador de pop-up (Safari do iPhone, sobretudo) a recusa;
 *  • a aba aberta perde o `opener` na hora (a página baixada não alcança o app);
 *    URL externa abre com `noopener,noreferrer`;
 *  • a coluna pode guardar a URL pública antiga INTEIRA ou só o caminho —
 *    `caminhoNoBucket` aceita os dois. Escritor novo grava só o caminho.
 *
 * `getPublicUrl` nestes buckets é proibido: `__tests__/storagePrivadoSemUrlPublica.test.ts`.
 */
import { supabase } from './supabase';
import { caminhoNoBucket, ehUrlExterna } from '../supabase/functions/_shared/caminhoNoBucket';

export { caminhoNoBucket, ehUrlExterna };

/** Minutas, aditivos, NF e anexos de medição, relatórios e galeria do investidor. */
export const BUCKET_DOCUMENTOS = 'documents';
/** Foto, documento, anexo salarial, atestado e certificado de colaborador; foto de ativo. */
export const BUCKET_ARQUIVOS_DA_ORGANIZACAO = 'organization-assets';

/** Buckets que o app só lê por URL assinada. A trava do `getPublicUrl` lê esta lista. */
export const BUCKETS_PRIVADOS = [BUCKET_DOCUMENTOS, BUCKET_ARQUIVOS_DA_ORGANIZACAO] as const;

/** Abrir em nova aba: o navegador baixa na sequência. */
export const TTL_ABRIR_SEGUNDOS = 60 * 15;
/** `<img>`/`<video>`: dura a sessão de tela; o cache em memória renova antes de vencer. */
export const TTL_EXIBIR_SEGUNDOS = 60 * 60;

function mensagemDoStorage(erro: unknown): string {
    const msg = erro && typeof erro === 'object' && 'message' in erro ? String((erro as { message: unknown }).message) : '';
    if (/not.?found|does not exist|404/i.test(msg)) return 'Arquivo não encontrado.';
    if (/row-level|policy|unauthori[sz]ed|permission|403/i.test(msg)) return 'Sem permissão para abrir este arquivo.';
    return msg ? `Não foi possível abrir o arquivo: ${msg}` : 'Não foi possível abrir o arquivo.';
}

/**
 * URL assinada para o valor gravado (URL antiga inteira ou caminho).
 * URL externa (outro bucket, ZapSign, link colado) volta como está.
 * `null` para valor vazio; erro para referência inválida ou assinatura recusada.
 */
export async function urlAssinada(
    bucket: string,
    valor: string | null | undefined,
    ttlSegundos = TTL_ABRIR_SEGUNDOS,
): Promise<string | null> {
    const v = (valor ?? '').trim();
    if (!v) return null;
    if (ehUrlExterna(v, bucket)) return v;
    const caminho = caminhoNoBucket(v, bucket);
    if (!caminho) throw new Error('Referência de arquivo inválida.');
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(caminho, ttlSegundos);
    if (error || !data?.signedUrl) throw new Error(mensagemDoStorage(error));
    return data.signedUrl;
}

function escreverNaAba(aba: Window, texto: string) {
    try {
        aba.document.title = texto;
        // textContent, nunca HTML: a mensagem pode trazer texto do servidor.
        aba.document.body.textContent = texto;
    } catch {
        // Aba já navegou ou o navegador não deixa tocar nela — nada a fazer.
    }
}

/**
 * Abre uma aba AGORA (dentro do clique) e só depois resolve a URL.
 *
 * Erro: a aba mostra o motivo (em vez de ficar em branco) e a promessa rejeita
 * — quem chama decide se também avisa na tela.
 */
export function abrirEmNovaAba(obterUrl: () => Promise<string | null>): Promise<void> {
    let aba: Window | null = null;
    try {
        aba = window.open('', '_blank');
    } catch {
        aba = null;
    }
    if (aba) {
        try {
            aba.opener = null;
        } catch {
            /* alguns navegadores não deixam: a aba nasce sem opener de qualquer jeito */
        }
        escreverNaAba(aba, 'Abrindo o arquivo…');
    }

    return obterUrl().then(
        url => {
            if (!url) throw new Error('Arquivo indisponível.');
            if (aba && !aba.closed) {
                aba.location.replace(url);
                return;
            }
            // Pop-up bloqueado no clique: última tentativa (pode ser bloqueada de novo).
            const segunda = window.open(url, '_blank', 'noopener,noreferrer');
            if (!segunda) throw new Error('O navegador bloqueou a nova aba. Libere pop-ups para este site e tente de novo.');
        },
        (erro: unknown) => {
            const texto = erro instanceof Error ? erro.message : 'Não foi possível abrir o arquivo.';
            if (aba && !aba.closed) escreverNaAba(aba, `${texto} Pode fechar esta aba.`);
            throw erro instanceof Error ? erro : new Error(texto);
        },
    );
}

/** Abre o arquivo do bucket privado com a sessão de quem clicou. */
export function abrirArquivoAssinado(bucket: string, valor: string | null | undefined): Promise<void> {
    const v = (valor ?? '').trim();
    if (v && ehUrlExterna(v, bucket)) {
        window.open(v, '_blank', 'noopener,noreferrer');
        return Promise.resolve();
    }
    return abrirEmNovaAba(() => urlAssinada(bucket, v));
}

/** Baixa o arquivo como Blob (ex.: PDF que segue para a ZapSign). */
export async function baixarArquivoAssinado(bucket: string, valor: string | null | undefined): Promise<Blob> {
    const url = await urlAssinada(bucket, valor);
    if (!url) throw new Error('Arquivo indisponível.');
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error(`Não foi possível baixar o arquivo (HTTP ${resposta.status}).`);
    return resposta.blob();
}

export type PortalDeDocumento = 'cliente' | 'parceiro' | 'investidor';

/**
 * Documento do bucket `documents` aberto por um PORTAL.
 *
 * Sessão de portal não é membro da organização — não assina pela RLS do
 * Storage. Com token (link ou login por e-mail, que usa a casca do link) ou
 * parceiro logado (workspace), quem assina é a Edge Function
 * `portal-documentos-download`: ela chama a MESMA RPC que o portal usou e só
 * assina o que aparece na resposta. Sem token nem workspace é a
 * pré-visualização de um membro — assina com a própria sessão.
 */
export function abrirDocumentoDoPortal(p: {
    portal: PortalDeDocumento;
    token?: string | null;
    workspaceId?: string | null;
    contratoId?: string | null;
    referencia: string | null | undefined;
}): Promise<void> {
    const referencia = (p.referencia ?? '').trim();
    if (referencia && ehUrlExterna(referencia, BUCKET_DOCUMENTOS)) {
        window.open(referencia, '_blank', 'noopener,noreferrer');
        return Promise.resolve();
    }
    const pelaFunction = !!p.token || (p.portal === 'parceiro' && !!p.workspaceId);
    if (!pelaFunction) return abrirArquivoAssinado(BUCKET_DOCUMENTOS, referencia);

    return abrirEmNovaAba(async () => {
        if (!referencia) return null;
        const { data, error } = await supabase.functions.invoke('portal-documentos-download', {
            body: {
                portal: p.portal,
                token: p.token || undefined,
                workspaceId: p.token ? undefined : (p.workspaceId || undefined),
                contratoId: p.contratoId || undefined,
                referencia,
            },
        });
        if (error) {
            // FunctionsHttpError traz o corpo com o motivo; sem ele, mensagem genérica.
            const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
            throw new Error(corpo?.error || 'Não foi possível abrir o documento.');
        }
        if (!data?.url) throw new Error(data?.error || 'Não foi possível abrir o documento.');
        return data.url as string;
    });
}
