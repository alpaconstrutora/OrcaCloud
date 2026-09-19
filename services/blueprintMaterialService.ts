// services/blueprintMaterialService.ts
//
// BIBLIOTECA DE MATERIAIS da organização (19/09/2026, E7.4) — ida e volta ao
// Supabase, e só. O que é material, como se valida e como se resolve um código
// mora em `utils/blueprintMateriais.ts`.
//
// ─── REGRA OBRIGATÓRIA #5 ──────────────────────────────────────────────────────
// `organizationId` nulo na leitura = "Todas as organizações": o `.eq()` só entra
// quando há org; a RLS recorta o resto. Gravar exige org — quem resolve "qual"
// quando o topo está em Todas é `useOrgWriteTarget`, na tela.

import { supabase } from '../lib/supabase';
import type { BlueprintMaterialRow } from '../types/blueprint';
import { materialDaLinha, type Material } from '../utils/blueprintMateriais';

const COLS = 'id, organization_id, codigo, nome, fonte, unidade, custo, fabricante, densidade_kg_m3, condutividade_w_mk, cor, funcao, espessura_padrao_mm, propriedades, active, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintMaterial/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export type NovoMaterial = Omit<Material, 'id' | 'organizationId' | 'active' | 'createdAt' | 'updatedAt'>;

function paraColunas(m: Partial<NovoMaterial>) {
  return {
    ...(m.codigo !== undefined ? { codigo: m.codigo.trim() } : {}),
    ...(m.nome !== undefined ? { nome: m.nome.trim() } : {}),
    ...(m.fonte !== undefined ? { fonte: m.fonte } : {}),
    ...(m.unidade !== undefined ? { unidade: m.unidade.trim() } : {}),
    ...(m.custo !== undefined ? { custo: m.custo } : {}),
    ...(m.fabricante !== undefined ? { fabricante: m.fabricante?.trim() || null } : {}),
    ...(m.densidadeKgM3 !== undefined ? { densidade_kg_m3: m.densidadeKgM3 } : {}),
    ...(m.condutividadeWmK !== undefined ? { condutividade_w_mk: m.condutividadeWmK } : {}),
    ...(m.cor !== undefined ? { cor: m.cor } : {}),
    ...(m.funcao !== undefined ? { funcao: m.funcao } : {}),
    ...(m.espessuraPadraoMm !== undefined ? { espessura_padrao_mm: m.espessuraPadraoMm } : {}),
    ...(m.propriedades !== undefined ? { propriedades: m.propriedades } : {}),
  };
}

export const blueprintMaterialService = {
  /** `organizationId` nulo = "Todas": lista o que a RLS deixar ver. */
  async list(organizationId: string | null, activeOnly = true): Promise<Material[]> {
    let q = supabase.from('blueprint_materials').select(COLS).order('nome');
    if (organizationId) q = q.eq('organization_id', organizationId);
    if (activeOnly) q = q.eq('active', true);
    const { data, error } = await q;
    if (error) fail('list', error);
    return ((data ?? []) as BlueprintMaterialRow[]).map(materialDaLinha);
  },

  /** Os materiais destes códigos (ativos ou não — o desenho pode citar um desativado). */
  async byCodigos(organizationId: string | null, codigos: string[]): Promise<Material[]> {
    const unicos = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))];
    if (unicos.length === 0) return [];
    let q = supabase.from('blueprint_materials').select(COLS).in('codigo', unicos);
    if (organizationId) q = q.eq('organization_id', organizationId);
    const { data, error } = await q;
    if (error) fail('byCodigos', error);
    return ((data ?? []) as BlueprintMaterialRow[]).map(materialDaLinha);
  },

  async create(organizationId: string, m: NovoMaterial): Promise<Material> {
    const { data, error } = await supabase
      .from('blueprint_materials')
      .insert({ organization_id: organizationId, ...paraColunas(m) })
      .select(COLS)
      .single();
    if (error) fail('create', error);
    return materialDaLinha(data as BlueprintMaterialRow);
  },

  async update(id: string, m: Partial<NovoMaterial> & { active?: boolean }): Promise<Material> {
    const { active, ...resto } = m;
    const { data, error } = await supabase
      .from('blueprint_materials')
      .update({ ...paraColunas(resto), ...(active !== undefined ? { active } : {}) })
      .eq('id', id)
      .select(COLS)
      .single();
    if (error) fail('update', error);
    return materialDaLinha(data as BlueprintMaterialRow);
  },

  /** Desativa — o código continua resolvível para as plantas que o citam. */
  async deactivate(id: string): Promise<void> {
    const { error } = await supabase.from('blueprint_materials').update({ active: false }).eq('id', id);
    if (error) fail('deactivate', error);
  },
};
