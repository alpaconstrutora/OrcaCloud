import { supabase } from '../lib/supabase';
import { COLOR_OPTIONS, colorClasses } from './obraTypeService';

// A "categoria do motor" (vertical/horizontal/misto/comercial) saiu em 14/10/2026: só o Motor de
// Áreas NBR 12721 antigo a lia, e ele foi removido (Fase 10 do plano
// docs/planos/2026-10-13-areas-nbr12721-na-planta.md). A coluna `motor_category` cai na migration
// de DROP; até lá tem DEFAULT 'vertical' e ninguém a grava.

export interface EmpreendimentoTypeRecord {
  id: string;
  organization_id: string | null;
  name: string;
  slug: string;
  color: string;
  description: string | null;
  is_system: boolean;
  active: boolean;
  sort_order: number;
  created_at: string;
}

export type EmpreendimentoTypeInsert = Pick<EmpreendimentoTypeRecord, 'name' | 'color' | 'description'> & {
  organization_id: string;
  slug?: string;
};

export { COLOR_OPTIONS, colorClasses };

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

export const empreendimentoTypeService = {
  /**
   * Tipos do sistema (organization_id null) + os da organização informada.
   * Sem organizationId, retorna o que a RLS liberar (útil só como fallback).
   */
  async list(organizationId?: string): Promise<EmpreendimentoTypeRecord[]> {
    let query = supabase
      .from('empreendimento_types')
      .select('id, organization_id, name, slug, color, description, is_system, active, sort_order, created_at')
      .eq('active', true);

    query = organizationId
      ? query.or(`organization_id.is.null,organization_id.eq.${organizationId}`)
      : query;

    const { data, error } = await query.order('sort_order').order('name');
    if (error) throw error;
    return (data || []) as EmpreendimentoTypeRecord[];
  },

  async create(payload: EmpreendimentoTypeInsert): Promise<EmpreendimentoTypeRecord> {
    if (!payload.organization_id) throw new Error('Selecione uma organização ativa para gerenciar tipos de empreendimento.');
    const slug = payload.slug || slugify(payload.name);
    const { data, error } = await supabase
      .from('empreendimento_types')
      .insert({ ...payload, slug, is_system: false })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<Pick<EmpreendimentoTypeRecord, 'name' | 'color' | 'description' | 'active'>>): Promise<EmpreendimentoTypeRecord> {
    const { data, error } = await supabase
      .from('empreendimento_types')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async duplicate(type: EmpreendimentoTypeRecord, organizationId: string): Promise<EmpreendimentoTypeRecord> {
    return this.create({
      name: `${type.name} (Cópia)`,
      color: type.color,
      description: type.description,
      organization_id: organizationId,
    });
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('empreendimento_types')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};
