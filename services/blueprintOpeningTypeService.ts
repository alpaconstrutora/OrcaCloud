// services/blueprintOpeningTypeService.ts
//
// Tipos de esquadria — o catálogo de portas e janelas por organização.
//
// "P1 — porta de madeira semi-oca 80×210 — item 90843" é o que se repete em
// toda porta interna de toda planta. Sem um lugar para guardar, o usuário
// redigita largura, altura e item porta a porta, e uma sai 80×200 sem que nada
// acuse.
//
// ─── É CONFIGURAÇÃO, NÃO VERDADE ───────────────────────────────────────────────
//
// O tipo de uma abertura desenhada vive COPIADO dentro do payload canônico dela
// (`Opening.esquadria`), não aqui. Esta tabela é só o molde: apagar um tipo não
// mexe em nenhuma planta que já o usou, e editar um tipo não reescreve desenho
// nenhum. Espelho de `blueprintWallTypeService.ts`, decisão por decisão.
//
// ─── REGRA OBRIGATÓRIA #5 ──────────────────────────────────────────────────────
//
// `organizationId` é `string | null`, e `null` significa "Todas as organizações"
// — não "nenhuma". O `.eq()` só entra quando há org, e a RLS recorta o resto.

import { supabase } from '../lib/supabase';
import type { Opening } from '../utils/blueprintKernel';

export interface TipoDeEsquadria {
  id: string;
  organizationId: string;
  /** "P1", "J3" — como o projeto chama. */
  nome: string;
  /** Vão livre não entra: não há caixilho a catalogar. */
  kind: Exclude<Opening['kind'], 'passage'>;
  widthMm: number;
  heightMm: number;
  sillMm: number;
  /** Só faz sentido em `sliding`. */
  embutida: boolean;
  /** Item de catálogo. `''` = tipo nomeado antes de escolher o item. */
  itemCode: string;
  descricao: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** O que se grava — sem id, sem carimbos. */
export type DadosDoTipoDeEsquadria = Pick<
  TipoDeEsquadria,
  'nome' | 'kind' | 'widthMm' | 'heightMm' | 'sillMm' | 'embutida' | 'itemCode' | 'descricao'
>;

/** Colunas nomeadas, nunca `select('*')`. */
const COLS =
  'id, organization_id, nome, kind, width_mm, height_mm, sill_mm, embutida, item_code, descricao, active, created_at, updated_at';

function mapear(row: Record<string, unknown>): TipoDeEsquadria {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    nome: row.nome as string,
    kind: row.kind as TipoDeEsquadria['kind'],
    widthMm: row.width_mm as number,
    heightMm: row.height_mm as number,
    sillMm: (row.sill_mm as number) ?? 0,
    embutida: Boolean(row.embutida),
    itemCode: (row.item_code as string) ?? '',
    descricao: (row.descricao as string) ?? '',
    active: row.active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function fail(contexto: string, error: { message: string } | null): never {
  throw new Error(`blueprintOpeningType/${contexto}: ${error?.message ?? 'erro desconhecido'}`);
}

/** `organizationId` nulo = "Todas": lista o que a RLS deixar ver. */
export async function listOpeningTypes(
  organizationId: string | null,
  activeOnly = true,
): Promise<TipoDeEsquadria[]> {
  let query = supabase.from('blueprint_opening_types').select(COLS).order('nome');
  if (organizationId) query = query.eq('organization_id', organizationId);
  if (activeOnly) query = query.eq('active', true);

  const { data, error } = await query;
  if (error) fail('listOpeningTypes', error);
  return (data ?? []).map((r) => mapear(r as Record<string, unknown>));
}

/**
 * Cria ou sobrescreve um tipo NUMA organização.
 *
 * `organizationId` é obrigatório aqui, e não opcional como na leitura: gravar
 * exige saber onde. Quem resolve "qual organização" quando o topo está em
 * "Todas" é `useOrgWriteTarget`/`forEachTargetOrg`, na tela.
 *
 * Salvar de novo com o mesmo nome SOBRESCREVE em vez de falhar no UNIQUE —
 * "salvar como tipo" repetido é a operação normal de quem está afinando a P1,
 * e um erro de chave duplicada só ensinaria a inventar "P1 v2".
 */
export async function saveOpeningType(
  organizationId: string,
  dados: DadosDoTipoDeEsquadria,
): Promise<TipoDeEsquadria> {
  const { data, error } = await supabase
    .from('blueprint_opening_types')
    .upsert(
      {
        organization_id: organizationId,
        nome: dados.nome.trim(),
        kind: dados.kind,
        width_mm: Math.round(dados.widthMm),
        height_mm: Math.round(dados.heightMm),
        sill_mm: Math.round(dados.sillMm),
        embutida: dados.embutida,
        item_code: dados.itemCode.trim(),
        descricao: dados.descricao,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,nome' },
    )
    .select(COLS)
    .single();

  if (error) fail('saveOpeningType', error);
  return mapear(data as Record<string, unknown>);
}

export async function deleteOpeningType(id: string): Promise<void> {
  const { error } = await supabase.from('blueprint_opening_types').delete().eq('id', id);
  if (error) fail('deleteOpeningType', error);
}
