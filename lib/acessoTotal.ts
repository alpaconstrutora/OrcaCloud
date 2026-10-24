/**
 * Contas com acesso a absolutamente tudo do app: todos os módulos, em todas as
 * organizações (regra do usuário, 24/10/2026).
 *
 * Esta lista é só o atalho de INTERFACE (menu, guard de rota, gates de edição).
 * Quem libera os DADOS é o banco: as mesmas contas estão em `public.superadmins`,
 * e a migration aplicar_20271024900000 as põe como `owner` em toda organização e
 * em todo espaço de tarefas — inclusive os criados depois. Conta nova aqui precisa
 * entrar lá também, senão vê o menu inteiro e as telas vazias.
 */
export const EMAILS_ACESSO_TOTAL: readonly string[] = [
  'altair.rosa@alpaconstrutora.com.br',
  'desenvolvedor@alpaconstrutora.com.br',
];

export function temAcessoTotal(email: string | null | undefined): boolean {
  return !!email && EMAILS_ACESSO_TOTAL.includes(email.trim().toLowerCase());
}
