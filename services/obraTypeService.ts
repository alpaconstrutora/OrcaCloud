import { supabase } from '../lib/supabase';

export interface ObraType {
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

export type ObraTypeInsert = Pick<ObraType, 'name' | 'slug' | 'color' | 'description' | 'sort_order'> & {
  organization_id: string;
};

export const COLOR_OPTIONS: { key: string; label: string; classes: string }[] = [
  { key: 'blue',    label: 'Azul',     classes: 'bg-blue-100 text-blue-700 border-blue-200' },
  { key: 'emerald', label: 'Verde',    classes: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { key: 'orange',  label: 'Laranja',  classes: 'bg-orange-100 text-orange-700 border-orange-200' },
  { key: 'purple',  label: 'Roxo',     classes: 'bg-purple-100 text-purple-700 border-purple-200' },
  { key: 'amber',   label: 'Âmbar',    classes: 'bg-amber-100 text-amber-700 border-amber-200' },
  { key: 'rose',    label: 'Rosa',     classes: 'bg-rose-100 text-rose-700 border-rose-200' },
  { key: 'indigo',  label: 'Índigo',   classes: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { key: 'teal',    label: 'Teal',     classes: 'bg-teal-100 text-teal-700 border-teal-200' },
  { key: 'gray',    label: 'Cinza',    classes: 'bg-gray-100 text-gray-600 border-gray-200' },
];

export function colorClasses(colorKey: string): string {
  return COLOR_OPTIONS.find(c => c.key === colorKey)?.classes ?? 'bg-gray-100 text-gray-600 border-gray-200';
}

export const obraTypeService = {
  async list(organizationId: string): Promise<ObraType[]> {
    const { data, error } = await supabase
      .from('obra_types')
      .select('id, organization_id, name, slug, color, description, is_system, active, sort_order, created_at')
      .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
      .eq('active', true)
      .order('is_system', { ascending: false })
      .order('sort_order')
      .order('name');

    if (error) throw error;
    return data ?? [];
  },

  async create(payload: ObraTypeInsert): Promise<ObraType> {
    const slug = payload.slug || slugify(payload.name);
    const { data, error } = await supabase
      .from('obra_types')
      .insert({ ...payload, slug, is_system: false })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<Pick<ObraType, 'name' | 'slug' | 'color' | 'description' | 'sort_order' | 'active'>>): Promise<ObraType> {
    const { data, error } = await supabase
      .from('obra_types')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('obra_types')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}
