import { supabase } from '../lib/supabase';
import { COLOR_OPTIONS, colorClasses } from './obraTypeService';

export type EmpreendimentoMotorCategory = 'vertical' | 'horizontal' | 'mixed' | 'commercial';

export interface EmpreendimentoTypeRecord {
  id: string;
  organization_id: string | null;
  name: string;
  slug: string;
  motor_category: EmpreendimentoMotorCategory;
  color: string;
  description: string | null;
  is_system: boolean;
  active: boolean;
  sort_order: number;
  created_at: string;
}

export type EmpreendimentoTypeInsert = Pick<EmpreendimentoTypeRecord, 'name' | 'motor_category' | 'color' | 'description'> & {
  organization_id: string;
  slug?: string;
};

export { COLOR_OPTIONS, colorClasses };

export const MOTOR_CATEGORY_OPTIONS: { value: EmpreendimentoMotorCategory; label: string }[] = [
  { value: 'vertical', label: 'Vertical' },
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'mixed', label: 'Misto' },
  { value: 'commercial', label: 'Comercial' },
];

// Fallback de segurança: mesma regra que existia hardcoded em areaEngineService antes
// deste catálogo. Só é usado se o slug não for encontrado na tabela (ex: RLS bloqueou,
// tipo foi excluído, ou é um valor legado fora dos 5 originais).
function legacyMotorCategory(slug?: string | null): EmpreendimentoMotorCategory {
  switch (slug) {
    case 'HORIZONTAL': return 'horizontal';
    case 'MISTO': return 'mixed';
    case 'COND_LOGISTICO':
    case 'COND_INDUSTRIAL': return 'commercial';
    case 'VERTICAL':
    default: return 'vertical';
  }
}

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
      .select('id, organization_id, name, slug, motor_category, color, description, is_system, active, sort_order, created_at')
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

  async update(id: string, updates: Partial<Pick<EmpreendimentoTypeRecord, 'name' | 'motor_category' | 'color' | 'description' | 'active'>>): Promise<EmpreendimentoTypeRecord> {
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
      motor_category: type.motor_category,
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

  /** Categoria do motor de Áreas NBR 12721 para um slug de tipo — com fallback legado. */
  async getMotorCategory(slug: string | null | undefined, organizationId?: string): Promise<EmpreendimentoMotorCategory> {
    if (!slug) return 'vertical';
    try {
      const types = await this.list(organizationId);
      const found = types.find(t => t.slug === slug);
      return found?.motor_category ?? legacyMotorCategory(slug);
    } catch {
      return legacyMotorCategory(slug);
    }
  },
};
