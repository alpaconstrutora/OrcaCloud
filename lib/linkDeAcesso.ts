/**
 * Tipo do link de acesso pelo qual a página foi aberta: convite (`invite`) ou
 * redefinição de senha (`recovery`). `null` = carga normal.
 *
 * ⚠️ Capturado na CARGA DO MÓDULO, antes do cliente do Supabase existir. O
 * `createClient` (lib/supabase.ts, que importa este arquivo primeiro) lê o
 * `#access_token=…&type=…` da URL e APAGA o hash logo na inicialização — antes
 * de qualquer efeito do React rodar. Até 03/10/2026 o `useAuthSync` lia o hash
 * num `useEffect` e já o encontrava vazio: o link do convite abria o seletor de
 * portais (ou, com outra aba aberta, a tela de login pedindo e-mail) em vez da
 * tela de criar senha. Reproduzido no navegador.
 *
 * Para redefinição o Supabase ainda emite o evento PASSWORD_RECOVERY; para
 * convite não emite nada específico — este valor é a única pista.
 */
function lerTipo(): 'invite' | 'recovery' | null {
    try {
        const tipo = new URLSearchParams(window.location.hash.slice(1)).get('type');
        return tipo === 'invite' || tipo === 'recovery' ? tipo : null;
    } catch {
        return null;
    }
}

export const tipoDoLinkDeAcesso: 'invite' | 'recovery' | null = typeof window !== 'undefined' ? lerTipo() : null;
