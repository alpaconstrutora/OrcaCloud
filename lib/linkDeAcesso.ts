/**
 * Link de acesso pelo qual a página foi aberta (convite / redefinição de senha).
 *
 * ⚠️ Capturado na CARGA DO MÓDULO, antes do cliente do Supabase existir. O
 * `createClient` (lib/supabase.ts, que importa este arquivo primeiro) lê o
 * `#access_token=…&type=…` da URL e APAGA o hash logo na inicialização — antes
 * de qualquer efeito do React rodar. Até 03/10/2026 o `useAuthSync` lia o hash
 * num `useEffect` e já o encontrava vazio: o link do convite não abria a tela de
 * criar senha. Reproduzido no navegador.
 *
 * Também guarda o E-MAIL de quem o link identifica (claim `email` do access
 * token). As abas do navegador compartilham UMA sessão: se outra aba entrar ou
 * renovar a sessão de outra conta enquanto a tela de criar senha está aberta, a
 * sessão corrente vira a dessa outra conta — e a tela gravaria a senha NELA.
 * Aconteceu em 03/10/2026: a tela do convite mostrou o e-mail do desenvolvedor.
 * A tela de senha só grava se a conta logada for a do link.
 *
 * E guarda o erro que o servidor manda quando o link já foi usado ou venceu
 * (`#error=access_denied&error_code=otp_expired…` — esse retorno NÃO traz `type`).
 */
export interface LinkDeAcesso {
    tipo: 'invite' | 'recovery' | null;
    /** E-mail da conta que o link identifica (minúsculo), quando há access_token. */
    email: string | null;
    /** Código do erro do servidor (ex.: `otp_expired`), quando o link não valeu. */
    erro: string | null;
}

function emailDoToken(token: string | null): string | null {
    if (!token) return null;
    try {
        const parte = token.split('.')[1];
        if (!parte) return null;
        const json = JSON.parse(atob(parte.replace(/-/g, '+').replace(/_/g, '/')));
        return typeof json.email === 'string' ? json.email.trim().toLowerCase() : null;
    } catch {
        return null;
    }
}

export function lerLinkDeAcesso(hash: string): LinkDeAcesso {
    try {
        const p = new URLSearchParams(hash.replace(/^#/, ''));
        const tipo = p.get('type');
        return {
            tipo: tipo === 'invite' || tipo === 'recovery' ? tipo : null,
            email: emailDoToken(p.get('access_token')),
            erro: p.get('error_code') || p.get('error'),
        };
    } catch {
        return { tipo: null, email: null, erro: null };
    }
}

export const linkDeAcesso: LinkDeAcesso = typeof window !== 'undefined'
    ? lerLinkDeAcesso(window.location.hash)
    : { tipo: null, email: null, erro: null };

/** Mantido para quem já usa: o tipo do link (convite / redefinição). */
export const tipoDoLinkDeAcesso = linkDeAcesso.tipo;
