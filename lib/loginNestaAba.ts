/**
 * "O login desta sessão foi feito NESTA aba?"
 *
 * As abas do mesmo navegador compartilham a sessão do Supabase (localStorage),
 * mas cada aba tem o seu portal escolhido. Até 03/10/2026, quando a sessão de
 * uma aba não combinava com o portal de OUTRA aba, essa outra aba desconectava
 * a conta inteira (`signOut`, escopo global) — e a aba onde a pessoa tinha
 * acabado de entrar caía junto ("entra e cai"). Reproduzido: aba parada em
 * /portal-parceiro (link do convite) + login pela Área do Desenvolvedor em
 * outra aba → a primeira recusa a sessão como parceiro e derruba as duas.
 *
 * Regra: só a aba que fez o login pode desconectar por "portal não combina".
 * A marca fica no sessionStorage, que é por aba e sobrevive ao recarregar a
 * página. Marcada ao enviar o login (Auth) e ao chegar pelo link de convite /
 * redefinição de senha; limpa quando a sessão termina.
 *
 * Sem sessionStorage (navegador bloqueando armazenamento), a resposta é "sim" —
 * mantém o comportamento antigo em vez de nunca recusar ninguém.
 */
const CHAVE = 'orca_loginNestaAba';

export function marcarLoginNestaAba(): void {
    try { sessionStorage.setItem(CHAVE, '1'); } catch { /* sem armazenamento */ }
}

export function limparLoginNestaAba(): void {
    try { sessionStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ }
}

export function loginFeitoNestaAba(): boolean {
    try { return sessionStorage.getItem(CHAVE) === '1'; } catch { return true; }
}
