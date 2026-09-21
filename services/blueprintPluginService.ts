/**
 * PLUGINS DA PLANTA (21/09/2026, backlog P2): o cadastro por organização em
 * `blueprint_plugins` (RLS `is_org_member`). Só cadastro — quem executa é o
 * editor, num iframe com sandbox (`utils/blueprintPlugins`).
 */
import { supabase } from '../lib/supabase';
import type { NovoPlugin, PermissaoDePlugin, PluginDaPlanta } from '../utils/blueprintPlugins';

const COLS = 'id, organization_id, nome, url, descricao, permissoes, active, created_at';

function fail(op: string, e: { message: string }): never {
  throw new Error(`blueprintPlugin/${op}: ${e.message}`);
}

function mapear(r: Record<string, unknown>): PluginDaPlanta {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    nome: String(r.nome),
    url: String(r.url),
    descricao: String(r.descricao ?? ''),
    permissoes: (Array.isArray(r.permissoes) ? r.permissoes : ['ler']) as PermissaoDePlugin[],
    active: Boolean(r.active),
    createdAt: String(r.created_at),
  };
}

export const blueprintPluginService = {
  /** `organizationId` nulo (topo em "Todas") = de todas as organizações do usuário; a RLS filtra. */
  async list(organizationId: string | null): Promise<PluginDaPlanta[]> {
    let q = supabase.from('blueprint_plugins').select(COLS).order('nome');
    if (organizationId) q = q.eq('organization_id', organizationId);
    const { data, error } = await q;
    if (error) fail('list', error);
    return (data ?? []).map((r) => mapear(r as Record<string, unknown>));
  },

  async create(organizationId: string, p: NovoPlugin): Promise<PluginDaPlanta> {
    const { data, error } = await supabase
      .from('blueprint_plugins')
      .insert({ organization_id: organizationId, nome: p.nome.trim(), url: p.url.trim(), descricao: (p.descricao ?? '').trim(), permissoes: p.permissoes, active: p.active ?? true })
      .select(COLS)
      .single();
    if (error) fail('create', error);
    return mapear(data as Record<string, unknown>);
  },

  async update(id: string, p: Partial<NovoPlugin>): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (p.nome !== undefined) patch.nome = p.nome.trim();
    if (p.url !== undefined) patch.url = p.url.trim();
    if (p.descricao !== undefined) patch.descricao = p.descricao.trim();
    if (p.permissoes !== undefined) patch.permissoes = p.permissoes;
    if (p.active !== undefined) patch.active = p.active;
    const { error } = await supabase.from('blueprint_plugins').update(patch).eq('id', id);
    if (error) fail('update', error);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('blueprint_plugins').delete().eq('id', id);
    if (error) fail('remove', error);
  },
};
