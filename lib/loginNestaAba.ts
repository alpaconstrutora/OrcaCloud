/**
 * "O login desta sessão foi feito NESTA aba — e por ESTA pessoa?"
 *
 * As abas do mesmo navegador compartilham a sessão do Supabase (localStorage),
 * mas cada aba tem o seu portal escolhido. Até 03/10/2026, quando a sessão de
 * uma aba não combinava com o portal de OUTRA aba, essa outra aba desconectava
 * a conta inteira (`signOut`, escopo global) — e a aba onde a pessoa tinha
 * acabado de entrar caía junto ("entra e cai").
 *
 * Regra: só a aba que fez o login DAQUELA pessoa pode desconectar por "portal
 * não combina". A marca guarda o e-mail de quem entrou, no sessionStorage (por
 * aba, sobrevive ao recarregar). Guardar só "1" não bastava: a aba do
 * desenvolvedor, marcada pelo login dele, recebia a sessão do parceiro que
 * abriu o link de convite em outra aba, achava que o login era dela e
 * desconectava o parceiro (medido no navegador, 03/10/2026).
 *
 * Marcada ao enviar o login (Auth) e quando a sessão do link de convite /
 * redefinição chega; limpa quando a sessão termina.
 *
 * Sem sessionStorage (navegador bloqueando armazenamento), a resposta é "sim" —
 * mantém o comportamento antigo em vez de nunca recusar ninguém.
 */
const CHAVE = 'orca_loginNestaAba';

const normalizar = (email: string | null | undefined) => (email || '').trim().toLowerCase();

export function marcarLoginNestaAba(email: string | null | undefined): void {
    try { sessionStorage.setItem(CHAVE, normalizar(email)); } catch { /* sem armazenamento */ }
}

export function limparLoginNestaAba(): void {
    try { sessionStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ }
}

/** A sessão de `email` foi aberta nesta aba? */
export function loginFeitoNestaAba(email: string | null | undefined): boolean {
    try {
        const marcado = sessionStorage.getItem(CHAVE);
        return !!marcado && marcado === normalizar(email);
    } catch {
        return true;
    }
}
