/**
 * Cliente IMAP da captura de boletos por e-mail (imapflow sobre o Edge Runtime).
 *
 * Usado por `email-capture-accounts` (testar a senha antes de guardar) e por
 * `email-capture-sync` (ler a caixa). Plano:
 * docs/planos/2026-10-15-captura-boletos-por-email.md (Fase 3).
 *
 * Por que imapflow e não Gmail API: a caixa é Gmail COMUM (@gmail.com), e o
 * escopo gmail.readonly exige app OAuth "External" verificado pelo Google
 * (em "Testing" o refresh token expira em 7 dias). IMAP com SENHA DE APP não
 * passa por verificação nenhuma. Spike de 15/10/2026: imapflow 1.0.164 roda no
 * Deno 2.1 com rede liberada e chega ao LOGIN do imap.gmail.com.
 */
// @ts-ignore — pacote npm sem tipos no Deno
import { ImapFlow } from "npm:imapflow@1.0.164";

export interface CredenciaisImap {
    host: string;
    porta: number;
    usuario: string;
    senha: string;
}

// deno-lint-ignore no-explicit-any
export type ClienteImap = any;

export function novoClienteImap(c: CredenciaisImap): ClienteImap {
    return new ImapFlow({
        host: c.host,
        port: c.porta,
        secure: true,
        auth: { user: c.usuario, pass: c.senha },
        logger: false,
        // Teto de cada etapa: a Edge Function tem tempo limitado e uma caixa
        // pendurada não pode consumir a execução inteira.
        connectionTimeout: 20_000,
        greetingTimeout: 15_000,
        socketTimeout: 60_000,
    });
}

/** O servidor recusou usuário/senha (senha de app errada ou revogada). */
export function falhaDeAutenticacao(e: unknown): boolean {
    const err = e as { authenticationFailed?: boolean; serverResponseCode?: string } | null;
    return err?.authenticationFailed === true || err?.serverResponseCode === 'AUTHENTICATIONFAILED';
}

export function mensagemDeErroImap(e: unknown): string {
    if (falhaDeAutenticacao(e)) {
        return 'O Gmail recusou o usuário ou a senha de app. Gere uma nova senha de app (Conta Google › Segurança › Senhas de app) e reconecte.';
    }
    const err = e as { message?: string; code?: string } | null;
    if (err?.code === 'ENOTFOUND') return 'Servidor IMAP não encontrado — confira o endereço.';
    if (err?.code === 'ETIMEDOUT' || /timeout/i.test(err?.message ?? '')) return 'O servidor IMAP não respondeu a tempo.';
    return err?.message ? `Falha no IMAP: ${err.message}` : 'Falha desconhecida no IMAP.';
}

/** Conecta, autentica e sai. Não lê mensagem nenhuma. */
export async function testarLoginImap(c: CredenciaisImap): Promise<{ ok: true } | { ok: false; motivo: string; autenticacao: boolean }> {
    const cliente = novoClienteImap(c);
    try {
        await cliente.connect();
        await cliente.logout().catch(() => undefined);
        return { ok: true };
    } catch (e) {
        try { cliente.close(); } catch { /* já fechado */ }
        return { ok: false, motivo: mensagemDeErroImap(e), autenticacao: falhaDeAutenticacao(e) };
    }
}

/** Lê um stream (Node Readable ou async iterable) inteiro, com teto de bytes. */
export async function lerTudo(stream: AsyncIterable<Uint8Array | string>, limite: number): Promise<Uint8Array> {
    const pedacos: Uint8Array[] = [];
    let total = 0;
    for await (const ch of stream) {
        const b = typeof ch === 'string' ? new TextEncoder().encode(ch) : ch;
        total += b.byteLength;
        if (total > limite) throw new Error(`Anexo maior que ${Math.round(limite / 1024 / 1024)} MB.`);
        pedacos.push(b);
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of pedacos) { out.set(p, off); off += p.byteLength; }
    return out;
}
