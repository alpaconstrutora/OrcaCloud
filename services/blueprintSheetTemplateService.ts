// services/blueprintSheetTemplateService.ts
//
// TEMPLATES DE PRANCHA por organização (20/09/2026, E8.3) — ida e volta ao
// Supabase, e só. Forma, sanitização e plano do conjunto em
// `utils/blueprintPranchas.ts`. REGRA #5: org nula na leitura = "Todas".

import { supabase } from '../lib/supabase';
import { templateDePranchaDaColuna, type TemplateDePrancha, type TemplateDePranchaSalvo } from '../utils/blueprintPranchas';

const COLS = 'id, organization_id, nome, template, active, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintSheetTemplate/${context}: ${error?.message ?? 'erro desconhecido'}`);
}
function mapear(r: Record<string, unknown>): TemplateDePranchaSalvo {
  return { id: r.id as string, organizationId: r.organization_id as string, nome: r.nome as string, template: templateDePranchaDaColuna(r.template), active: r.active as boolean };
}

export const blueprintSheetTemplateService = {
  async list(organizationId: string | null): Promise<TemplateDePranchaSalvo[]> {
    let q = supabase.from('blueprint_sheet_templates').select(COLS).eq('active', true).order('nome');
    if (organizationId) q = q.eq('organization_id', organizationId);
    const { data, error } = await q;
    if (error) fail('list', error);
    return (data ?? []).map((r) => mapear(r as Record<string, unknown>));
  },
  async create(organizationId: string, nome: string, template: TemplateDePrancha): Promise<TemplateDePranchaSalvo> {
    const { data, error } = await supabase.from('blueprint_sheet_templates').insert({ organization_id: organizationId, nome: nome.trim(), template }).select(COLS).single();
    if (error) fail('create', error);
    return mapear(data as Record<string, unknown>);
  },
  async update(id: string, patch: { nome?: string; template?: TemplateDePrancha }): Promise<TemplateDePranchaSalvo> {
    const { data, error } = await supabase.from('blueprint_sheet_templates').update({ ...(patch.nome !== undefined ? { nome: patch.nome.trim() } : {}), ...(patch.template !== undefined ? { template: patch.template } : {}) }).eq('id', id).select(COLS).single();
    if (error) fail('update', error);
    return mapear(data as Record<string, unknown>);
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('blueprint_sheet_templates').update({ active: false }).eq('id', id);
    if (error) fail('remove', error);
  },
};
