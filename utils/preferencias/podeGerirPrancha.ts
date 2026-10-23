/**
 * Quem pode mudar o padrão da PRANCHA da empresa na tela de Preferências (23/10/2026).
 *
 * Regra só de TELA: o botão diz o motivo antes de a pessoa tentar. A trava final é o banco
 * (RLS de `user_preferences` aceita `ORGANIZACAO` só de quem é owner/admin da organização).
 *
 *  - Topo em "Todas as organizações": o padrão da prancha é de UMA empresa — não há onde gravar.
 *    (Exceção da REGRA #5 item 4: escolha de uma organização só, por natureza.)
 *  - Membros da organização ainda não carregados no store: trava. Liberar "por engano" faria o
 *    botão gravar e o banco recusar; travar só atrasa a escolha até a lista chegar.
 *  - Não é membro, ou o papel não é owner/admin: trava.
 *
 * Puro: sem React, sem Supabase.
 */

export const MOTIVO_PRANCHA_SO_GESTOR = 'Só quem administra a organização muda o padrão da prancha.';
export const MOTIVO_PRANCHA_TODAS = 'O padrão da prancha é de UMA empresa — escolha a organização no topo.';

export type PodeGerirPrancha = { pode: true } | { pode: false; motivo: string };

export function podeGerirPrancha(args: {
  isAllOrgs: boolean;
  membro: { role?: string | null } | null;
  membrosCarregados: boolean;
}): PodeGerirPrancha {
  if (args.isAllOrgs) return { pode: false, motivo: MOTIVO_PRANCHA_TODAS };
  if (!args.membrosCarregados || !args.membro) return { pode: false, motivo: MOTIVO_PRANCHA_SO_GESTOR };
  // Mesmos papéis de `is_org_manager()` no banco: ARRAY['owner','admin'].
  if (args.membro.role === 'owner' || args.membro.role === 'admin') return { pode: true };
  return { pode: false, motivo: MOTIVO_PRANCHA_SO_GESTOR };
}
