/**
 * Links de portal gravados pelo app logado (Portal do Cliente `client_portal_tokens`, Portal do
 * Colaborador `portal_tokens`): gerar, revogar e apagar é só de owner/admin da organização — a RPC
 * de gerar recusa com 42501 e a RLS (aplicar_20271125913700) faz o UPDATE de quem não é gestor não
 * alterar NENHUMA linha, sem erro. Quem grava confere as linhas devolvidas e usa esta mensagem, para
 * a tela nunca dizer "revogado" sem ter revogado.
 */
export const MSG_LINK_PORTAL_SO_GESTOR =
  'Só owner ou admin da organização pode gerar ou revogar o link do portal.'

/** Erro do Supabase → `Error` com a mensagem de permissão se for 42501; senão, o próprio erro. */
export function erroDoLinkDePortal(error: unknown): unknown {
  const codigo = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined
  return codigo === '42501' ? new Error(MSG_LINK_PORTAL_SO_GESTOR) : error
}
