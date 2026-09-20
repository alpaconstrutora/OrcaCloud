// services/blueprintElementTypeService.ts
//
// Tipos de elemento — o catálogo genérico da organização (estrutura, ponto de
// instalação, escada, telhado). Espelha `blueprintWallTypeService` e
// `blueprintOpeningTypeService`, decisão por decisão:
//
// ─── É CONFIGURAÇÃO, NÃO VERDADE ───────────────────────────────────────────────
// A peça desenhada carrega as propriedades COPIADAS no payload canônico; esta
// tabela é só o molde. Apagar um tipo não mexe em planta nenhuma, e editar um
// tipo não reescreve desenho nenhum. A forma das propriedades de cada família
// é de `utils/blueprintTipos.ts` — o banco guarda JSONB e não valida.
//
// ─── REGRA OBRIGATÓRIA #5 ──────────────────────────────────────────────────────
// `organizationId` nulo = "Todas as organizações": o `.eq()` só entra quando há
// org, e a RLS recorta o resto. Gravar exige org; quem resolve qual é
// `useOrgWriteTarget`/`forEachTargetOrg`, na tela.

import { supabase } from '../lib/supabase';
import type { FamiliaDeTipo, PropriedadesDoTipo } from '../utils/blueprintTipos';

export interface TipoDeElemento {
  id: string;
  organizationId: string;
  familia: FamiliaDeTipo;
  nome: string;
  propriedades: PropriedadesDoTipo;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Colunas nomeadas, nunca `select('*')`. */
const COLS = 'id, organization_id, familia, nome, propriedades, active, created_at, updated_at';

function mapear(row: Record<string, unknown>): TipoDeElemento {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    familia: row.familia as FamiliaDeTipo,
    nome: row.nome as string,
    propriedades: (row.propriedades ?? {}) as PropriedadesDoTipo,
    active: row.active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function fail(contexto: string, error: { message: string } | null): never {
  throw new Error(`blueprintElementType/${contexto}: ${error?.message ?? 'erro desconhecido'}`);
}

/** `organizationId` nulo = "Todas": lista o que a RLS deixar ver. */
export async function listElementTypes(
  organizationId: string | null,
  familia: FamiliaDeTipo,
  activeOnly = true,
): Promise<TipoDeElemento[]> {
  let query = supabase.from('blueprint_element_types').select(COLS).eq('familia', familia).order('nome');
  if (organizationId) query = query.eq('organization_id', organizationId);
  if (activeOnly) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) fail('listElementTypes', error);
  return (data ?? []).map((r) => mapear(r as Record<string, unknown>));
}

/** Cria ou substitui (mesma organização, família e nome) um tipo. */
export async function saveElementType(
  organizationId: string,
  nome: string,
  propriedades: PropriedadesDoTipo,
): Promise<TipoDeElemento> {
  const { data, error } = await supabase
    .from('blueprint_element_types')
    .upsert(
      {
        organization_id: organizationId,
        familia: propriedades.familia,
        nome: nome.trim(),
        propriedades,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,familia,nome' },
    )
    .select(COLS)
    .single();
  if (error) fail('saveElementType', error);
  return mapear(data as Record<string, unknown>);
}

export async function deleteElementType(id: string): Promise<void> {
  const { error } = await supabase.from('blueprint_element_types').delete().eq('id', id);
  if (error) fail('deleteElementType', error);
}

// ─── CATÁLOGO (P2.3, 20/09/2026): todas as famílias, inativos inclusive; renomear, ativar, copiar ───

/** Todos os tipos da organização (ou o que a RLS deixar ver com "Todas"), inativos inclusive. */
export async function listAllElementTypes(organizationId: string | null): Promise<TipoDeElemento[]> {
  let query = supabase.from('blueprint_element_types').select(COLS).order('familia').order('nome');
  if (organizationId) query = query.eq('organization_id', organizationId);
  const { data, error } = await query;
  if (error) fail('listAllElementTypes', error);
  return (data ?? []).map((r) => mapear(r as Record<string, unknown>));
}

export async function renameElementType(id: string, nome: string): Promise<TipoDeElemento> {
  const { data, error } = await supabase
    .from('blueprint_element_types')
    .update({ nome: nome.trim(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(COLS)
    .single();
  if (error) fail('renameElementType', error);
  return mapear(data as Record<string, unknown>);
}

export async function setElementTypeActive(id: string, active: boolean): Promise<TipoDeElemento> {
  const { data, error } = await supabase
    .from('blueprint_element_types')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(COLS)
    .single();
  if (error) fail('setElementTypeActive', error);
  return mapear(data as Record<string, unknown>);
}

/** Grava uma lista (sementes ou cópia de outra organização) numa organização: upsert por (org, família, nome). */
export async function upsertElementTypes(organizationId: string, lista: readonly { nome: string; propriedades: PropriedadesDoTipo }[]): Promise<number> {
  if (lista.length === 0) return 0;
  const { data, error } = await supabase
    .from('blueprint_element_types')
    .upsert(
      lista.map((t) => ({ organization_id: organizationId, familia: t.propriedades.familia, nome: t.nome.trim(), propriedades: t.propriedades, active: true, updated_at: new Date().toISOString() })),
      { onConflict: 'organization_id,familia,nome' },
    )
    .select('id');
  if (error) fail('upsertElementTypes', error);
  return (data ?? []).length;
}
