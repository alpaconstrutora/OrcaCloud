// services/blueprintViewTemplateService.ts
//
// TEMPLATES DE VISTA por organização (19/09/2026, E8.2) — ida e volta ao
// Supabase, e só. O que é a configuração, como se sanitiza e o diff estão em
// `utils/blueprintTemplatesDeVista.ts`. REGRA #5: org nula na leitura =
// "Todas" (a RLS recorta); gravar exige org (quem resolve é a tela).

import { supabase } from '../lib/supabase';
import { configuracaoDaColuna, type ConfiguracaoDeVista, type TemplateDeVista } from '../utils/blueprintTemplatesDeVista';

const COLS = 'id, organization_id, nome, config, active, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintViewTemplate/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

function mapear(r: Record<string, unknown>): TemplateDeVista {
  return { id: r.id as string, organizationId: r.organization_id as string, nome: r.nome as string, config: configuracaoDaColuna(r.config), active: r.active as boolean };
}

export const blueprintViewTemplateService = {
  async list(organizationId: string | null): Promise<TemplateDeVista[]> {
    let q = supabase.from('blueprint_view_templates').select(COLS).eq('active', true).order('nome');
    if (organizationId) q = q.eq('organization_id', organizationId);
    const { data, error } = await q;
    if (error) fail('list', error);
    return (data ?? []).map((r) => mapear(r as Record<string, unknown>));
  },
  async create(organizationId: string, nome: string, config: ConfiguracaoDeVista): Promise<TemplateDeVista> {
    const { data, error } = await supabase.from('blueprint_view_templates').insert({ organization_id: organizationId, nome: nome.trim(), config }).select(COLS).single();
    if (error) fail('create', error);
    return mapear(data as Record<string, unknown>);
  },
  async update(id: string, patch: { nome?: string; config?: ConfiguracaoDeVista }): Promise<TemplateDeVista> {
    const { data, error } = await supabase.from('blueprint_view_templates').update({ ...(patch.nome !== undefined ? { nome: patch.nome.trim() } : {}), ...(patch.config !== undefined ? { config: patch.config } : {}) }).eq('id', id).select(COLS).single();
    if (error) fail('update', error);
    return mapear(data as Record<string, unknown>);
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('blueprint_view_templates').update({ active: false }).eq('id', id);
    if (error) fail('remove', error);
  },
};
