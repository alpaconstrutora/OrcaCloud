// supabase/functions/_shared/resend.ts — envio de e-mail pelo Resend.
// Secrets: RESEND_API_KEY e REPORT_FROM_EMAIL (o remetente verificado).

declare const Deno: { env: { get(key: string): string | undefined } };

export interface Anexo { nome: string; conteudoBase64: string }

export interface EmailParaEnviar {
    para: string;
    assunto: string;
    html: string;
    anexos?: Anexo[];
}

export type ResultadoDoEnvio = { ok: true } | { ok: false; erro: string };

export async function enviarEmail(e: EmailParaEnviar): Promise<ResultadoDoEnvio> {
    const chave = Deno.env.get('RESEND_API_KEY');
    const de = Deno.env.get('REPORT_FROM_EMAIL') ?? 'notificacoes@opura.com.br';
    if (!chave) return { ok: false, erro: 'Envio de e-mail não configurado (RESEND_API_KEY).' };

    const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` },
        body: JSON.stringify({
            from: de,
            to: [e.para],
            subject: e.assunto,
            html: e.html,
            ...(e.anexos?.length ? { attachments: e.anexos.map(a => ({ filename: a.nome, content: a.conteudoBase64 })) } : {}),
        }),
    });
    if (!resp.ok) {
        const corpo = await resp.text().catch(() => '');
        console.error('[resend] recusou', resp.status, corpo.slice(0, 300));
        return { ok: false, erro: 'O provedor de e-mail recusou o envio.' };
    }
    return { ok: true };
}

/** Bytes → base64 sem estourar a pilha em arquivo grande. */
export function base64DeBytes(bytes: Uint8Array): string {
    let binario = '';
    const PASSO = 0x8000;
    for (let i = 0; i < bytes.length; i += PASSO) {
        binario += String.fromCharCode(...bytes.subarray(i, i + PASSO));
    }
    return btoa(binario);
}
