import { supabase } from '../../lib/supabase'

/**
 * Link do celular (`/celular?token=`) — rota, sessão do token e gestão do link.
 *
 *  - `tokenDoCelularDaUrl` / `urlDoLinkCelular`: o endereço do link;
 *  - `celularSessao`: quem é o dono do link e em qual organização (anônimo, só com o token);
 *  - `gerarLinkCelular` / `copiarLinkCelular` / `revogarLinkCelular` / `statusLinkCelular`: gestão
 *    pelo app logado (RPCs `mobile_link_*`, autorizadas no banco: gestor da org, ou a própria pessoa).
 *
 * O banco confere o link pelo hash; desde 25/11/2026 guarda também o token em claro, numa tabela sem
 * acesso pela API, para "Copiar link" (`mobile_link_copiar`). Link revogado perde o token guardado.
 */

/** Token válido: base64url (o banco gera 43 caracteres); 20 é o piso para barrar lixo sem RPC. */
const TOKEN_VALIDO = /^[A-Za-z0-9_-]{20,}$/

/**
 * Token do link, ou `null`. Só vale em `/celular` ou `/celular/`. Aparado e conferido
 * ANTES de qualquer RPC: vazio, com espaço no meio, `<script>`, `=` ou curto demais
 * nunca chega ao banco (a tela mostra a recusa).
 */
export function tokenDoCelularDaUrl(pathname: string, search: string): string | null {
  if (pathname !== '/celular' && pathname !== '/celular/') return null
  const token = new URLSearchParams(search).get('token')?.trim() ?? ''
  return TOKEN_VALIDO.test(token) ? token : null
}

/** Endereço do link do celular para o token em claro. */
export function urlDoLinkCelular(token: string, origin?: string): string {
  return `${origin ?? window.location.origin}/celular?token=${token}`
}

export interface SessaoCelular {
  user_id: string
  nome: string
  org_id: string
  org_nome: string
  /** Se o dono do link aprova registro do Diário NA ORG DO LINK. O Diário pelo link não usa mais:
   *  aprovar segue a org do diário aberto (`celular_diario_abrir` → `pode_aprovar`, 27/11/2026). */
  pode_aprovar_diario: boolean
  /** Organizações de que o dono do link é membro — o link vale para todas (27/11/2026). */
  orgs?: { id: string; name: string }[]
}

/** Recusa do banco para token inválido, vencido, revogado ou de ex-membro. */
const RECUSA_DO_LINK = '42501'

/**
 * Dono e organização do link. `null` = o banco recusou o token (42501).
 * Qualquer outro erro (rede, 5xx) é lançado — a tela diferencia "link inválido" de "sem conexão".
 */
export async function celularSessao(token: string): Promise<SessaoCelular | null> {
  const { data, error } = await supabase.rpc('celular_sessao', { p_token: token })
  if (error) {
    if (error.code === RECUSA_DO_LINK) return null
    throw error
  }
  if (!data) return null
  return data as SessaoCelular
}

/** Gera (ou renova) o link da pessoa na organização e devolve a URL completa. */
export async function gerarLinkCelular(userId: string, orgId: string): Promise<string> {
  const { data, error } = await supabase.rpc('mobile_link_generate', { p_user_id: userId, p_org_id: orgId })
  if (error) throw error
  if (!data || typeof data !== 'string') throw new Error('Não foi possível gerar o link do celular.')
  return urlDoLinkCelular(data)
}

/**
 * URL do link ATIVO, para copiar de novo. `null` = sem link ativo, ou link gerado antes de o endereço
 * ficar guardado (só gerando um novo). Recusa de permissão chega como 42501.
 */
export async function copiarLinkCelular(userId: string, orgId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('mobile_link_copiar', { p_user_id: userId, p_org_id: orgId })
  if (error) throw error
  return typeof data === 'string' && data ? urlDoLinkCelular(data) : null
}

export async function revogarLinkCelular(userId: string, orgId: string): Promise<void> {
  const { error } = await supabase.rpc('mobile_link_revoke', { p_user_id: userId, p_org_id: orgId })
  if (error) throw error
}

export interface StatusLinkCelular {
  existe: boolean
  expires_at: string | null
  last_used_at: string | null
  revogado: boolean
  /** Há endereço guardado do link ativo (`mobile_link_copiar` devolve). Ausente = banco antigo → `false`. */
  copiavel?: boolean
}

export async function statusLinkCelular(userId: string, orgId: string): Promise<StatusLinkCelular> {
  const { data, error } = await supabase.rpc('mobile_link_status', { p_user_id: userId, p_org_id: orgId })
  if (error) throw error
  return data as StatusLinkCelular
}
