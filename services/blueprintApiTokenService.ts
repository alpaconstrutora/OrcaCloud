/**
 * Tokens da API pública da Planta Inteligente (20/09/2026, E9.2).
 *
 * A tabela `blueprint_api_tokens` só é LIDA pelo app (RLS por organização);
 * criar e revogar passam pelas RPCs `blueprint_api_token_create/revoke`, que
 * conferem no banco que quem pede é membro da organização. O texto do token
 * volta UMA vez, na criação — nem o banco o tem depois (só o SHA-256).
 */
import { supabase } from '../lib/supabase';

export interface TokenDaApi {
  id: string;
  organizationId: string;
  nome: string;
  /** "opk_1a2b3c4d" — para reconhecer o token na lista. */
  prefixo: string;
  escopos: string[];
  active: boolean;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  usos: number;
  revokedAt: string | null;
}

export interface TokenCriado {
  id: string;
  /** O token completo. Mostrar uma vez; não é recuperável. */
  token: string;
  prefixo: string;
}

const COLS = 'id, organization_id, nome, prefixo, escopos, active, created_at, expires_at, last_used_at, usos, revoked_at';

function fail(op: string, e: { message: string }): never {
  throw new Error(`blueprintApiToken/${op}: ${e.message}`);
}

function mapear(r: Record<string, unknown>): TokenDaApi {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    nome: String(r.nome),
    prefixo: String(r.prefixo),
    escopos: Array.isArray(r.escopos) ? (r.escopos as string[]) : ['leitura'],
    active: Boolean(r.active),
    createdAt: String(r.created_at),
    expiresAt: (r.expires_at as string | null) ?? null,
    lastUsedAt: (r.last_used_at as string | null) ?? null,
    usos: Number(r.usos ?? 0),
    revokedAt: (r.revoked_at as string | null) ?? null,
  };
}

/** A URL base da API pública — a mesma para todas as organizações; o token é que escopa. */
export function urlBaseDaApi(): string {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
  return `${base.replace(/\/$/, '')}/functions/v1/planta-api`;
}

export const blueprintApiTokenService = {
  /** `organizationId` nulo (topo em "Todas") = os de todas as organizações do usuário; a RLS filtra. */
  async list(organizationId: string | null): Promise<TokenDaApi[]> {
    let q = supabase.from('blueprint_api_tokens').select(COLS).order('created_at', { ascending: false });
    if (organizationId) q = q.eq('organization_id', organizationId);
    const { data, error } = await q;
    if (error) fail('list', error);
    return (data ?? []).map((r) => mapear(r as Record<string, unknown>));
  },

  async create(organizationId: string, nome: string, expiresAt: string | null): Promise<TokenCriado> {
    const { data, error } = await supabase.rpc('blueprint_api_token_create', {
      p_organization_id: organizationId,
      p_nome: nome,
      p_expires_at: expiresAt,
    });
    if (error) fail('create', error);
    const linha = (Array.isArray(data) ? data[0] : data) as { id: string; token: string; prefixo: string } | undefined;
    if (!linha?.token) throw new Error('blueprintApiToken/create: a RPC não devolveu o token');
    return { id: linha.id, token: linha.token, prefixo: linha.prefixo };
  },

  async revoke(id: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('blueprint_api_token_revoke', { p_id: id });
    if (error) fail('revoke', error);
    return Boolean(data);
  },
};
