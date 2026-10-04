import { supabase } from '../lib/supabase';
import type { Portal, HelpKind, PortalHelpRow } from '../utils/portalHelpDefaults';

/**
 * Ajuda dos portais externos — leitura pelos portais (RPC) e edição pela
 * construtora (tabela sob RLS, só owner/admin). Ver utils/portalHelpDefaults.ts.
 */

export interface PortalHelpContact {
  name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
}

export interface PortalHelpPayload {
  org_id: string;
  contact: PortalHelpContact | null;
  items: PortalHelpRow[];
}

export interface PortalHelpMine {
  orgs: { id: string; name: string }[];
  help: PortalHelpPayload | null;
}

/** Linha completa da tabela (editor). */
export interface PortalHelpRecord extends PortalHelpRow {
  organization_id: string;
  portal: Portal;
  default_hash: string | null;
  created_by: string | null;
  created_at: string;
}

const RPC_POR_PORTAL: Record<Portal, string> = {
  parceiro: 'partner_portal_help_get',
  fornecedor: 'supplier_portal_help_get',
  corretor: 'broker_portal_help_get',
};

const COLS = 'id, organization_id, portal, kind, default_key, section, title, body_html, sort_order, is_published, default_hash, created_by, created_at, updated_at, anchor, tour_id';

export const portalHelpService = {
  /** Acesso pelo link: a org vem do token. `null` = token inválido/vencido. */
  async getByToken(portal: Portal, token: string): Promise<PortalHelpPayload | null> {
    const { data, error } = await supabase.rpc(RPC_POR_PORTAL[portal], { p_token: token });
    if (error) throw error;
    if (!data?.valid) return null;
    return { org_id: data.org_id, contact: data.contact ?? null, items: data.items ?? [] };
  },

  /** Externo logado (ou membro interno, para prévia). */
  async getMine(portal: Portal, orgId?: string | null): Promise<PortalHelpMine> {
    const { data, error } = await supabase.rpc('portal_help_get_mine', { p_portal: portal, p_org: orgId ?? null });
    if (error) throw error;
    return { orgs: data?.orgs ?? [], help: data?.help ?? null };
  },

  // ── Editor (RLS: owner/admin da organização) ─────────────────────────────

  /** `orgId` null = todas as organizações que o usuário gerencia (REGRA #5). */
  async list(orgId: string | null, portal?: Portal): Promise<PortalHelpRecord[]> {
    let q = supabase.from('portal_help_items').select(COLS).order('sort_order').order('created_at');
    if (orgId) q = q.eq('organization_id', orgId);
    if (portal) q = q.eq('portal', portal);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PortalHelpRecord[];
  },

  /** Sobrescreve um item padrão (cria ou atualiza pela chave). */
  async saveOverride(input: {
    organization_id: string; portal: Portal; kind: HelpKind; default_key: string;
    section: string | null; title: string; body_html: string; is_published: boolean;
    sort_order?: number; default_hash?: string | null; created_by?: string | null;
  }): Promise<PortalHelpRecord> {
    const { data, error } = await supabase
      .from('portal_help_items')
      .upsert({ sort_order: 0, ...input }, { onConflict: 'organization_id,portal,default_key' })
      .select(COLS)
      .single();
    if (error) throw error;
    return data as PortalHelpRecord;
  },

  /** Item próprio: artigo, pergunta ou passo de tour (este exige `anchor`). */
  async createCustom(input: {
    organization_id: string; portal: Portal; kind: 'artigo' | 'faq' | 'tour';
    section: string | null; title: string; body_html: string; is_published?: boolean;
    sort_order?: number; created_by?: string | null;
    anchor?: string | null; tour_id?: string | null;
  }): Promise<PortalHelpRecord> {
    const { data, error } = await supabase
      .from('portal_help_items')
      .insert({ is_published: true, sort_order: 0, ...input, default_key: null })
      .select(COLS)
      .single();
    if (error) throw error;
    return data as PortalHelpRecord;
  },

  async update(id: string, patch: Partial<Pick<PortalHelpRecord, 'section' | 'title' | 'body_html' | 'is_published' | 'sort_order' | 'anchor' | 'tour_id'>>): Promise<PortalHelpRecord> {
    const { data, error } = await supabase
      .from('portal_help_items')
      .update(patch)
      .eq('id', id)
      .select(COLS)
      .single();
    if (error) throw error;
    return data as PortalHelpRecord;
  },

  /** Apaga uma linha: sobrescrita (= volta ao padrão) ou item próprio. */
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('portal_help_items').delete().eq('id', id);
    if (error) throw error;
  },

  /** Apaga todas as sobrescritas de um portal numa org (itens próprios ficam). */
  async restoreAllDefaults(orgId: string, portal: Portal): Promise<void> {
    const { error } = await supabase
      .from('portal_help_items')
      .delete()
      .eq('organization_id', orgId)
      .eq('portal', portal)
      .not('default_key', 'is', null);
    if (error) throw error;
  },
};
