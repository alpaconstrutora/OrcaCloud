/**
 * ÒPURA Pro público — regra de endereço e de isolamento na tela.
 *
 * Desde 14/11/2026 (docs/planos/2026-11-14-opura-pro-publico.md): o Pro é oferecido de
 * graça a autônomos de FORA, e só o Pro. O banco já isola (pro_* por auth.uid(); o resto
 * por organization_members, que essa conta não tem). Aqui fica o isolamento da TELA:
 *  - `/pro` monta a casca do Pro, nunca o <Layout> do ÒPURA;
 *  - conta criada pelo Pro (`user_metadata.origem = 'pro'`) que abrir outro endereço
 *    volta para `/pro` — ela não tem nada a fazer no resto do app.
 * Conta interna (Alpa) pode usar o `/pro` E o app; nunca é redirecionada.
 *
 * Testes: `__tests__/proPublico.test.ts`.
 */

export const ORIGEM_PRO = 'pro';
export const ENDERECO_PRO = '/pro';

// A sessão do App.tsx tem tipo próprio (`[key: string]: unknown`): aceitar qualquer forma e ler com cuidado.
type UsuarioComMetadados = { user_metadata?: unknown; [chave: string]: unknown } | null | undefined;

/** `/pro`, `/pro/` e `/pro/...` — e não `/proposta`, `/produtos`… */
export function ehEnderecoDoPro(pathname: string): boolean {
  return pathname === ENDERECO_PRO || pathname.startsWith(`${ENDERECO_PRO}/`);
}

export function contaSoPro(usuario: UsuarioComMetadados): boolean {
  const meta = usuario?.user_metadata;
  return !!meta && typeof meta === 'object' && (meta as Record<string, unknown>).origem === ORIGEM_PRO;
}

/** Para onde mandar uma conta só-Pro que abriu `pathname`; `null` = fica. */
export function destinoDaContaSoPro(pathname: string, usuario: UsuarioComMetadados): string | null {
  if (!contaSoPro(usuario)) return null;
  return ehEnderecoDoPro(pathname) ? null : ENDERECO_PRO;
}
