// services/blueprintWallTypeService.ts
//
// Tipos de parede — composições de camadas salvas por organização.
//
// Montar "bloco 140 + reboco 25 nas duas faces" é o gesto que se repete em toda
// parede externa de toda planta. Sem um lugar para guardar a composição, o
// usuário a remonta parede a parede, e uma delas sai com 20 em vez de 25 sem que
// nada acuse.
//
// ─── É CONFIGURAÇÃO, NÃO VERDADE ───────────────────────────────────────────────
//
// A composição de uma parede desenhada vive dentro do PAYLOAD CANÔNICO dela, não
// aqui. Esta tabela é só o molde: apagar um tipo não mexe em nenhuma planta que
// já o usou, e editar um tipo não reescreve desenho nenhum. É de propósito —
// tipo que reescrevesse plantas antigas mudaria quantitativo publicado.
//
// ─── REGRA OBRIGATÓRIA #5 ──────────────────────────────────────────────────────
//
// `organizationId` é `string | null`, e `null` significa "Todas as organizações"
// — não "nenhuma". O `.eq()` só entra quando há org, e a RLS recorta o resto.
// Nada de `if (!organizationId) return []`, que deixaria a lista vazia em
// "Todas", nem de `organizations[0]`.

import { supabase } from '../lib/supabase';
import type { CamadaParede } from '../utils/blueprintKernel';

export interface TipoDeParede {
  id: string;
  organizationId: string;
  nome: string;
  /** Da face esquerda para a direita, como em `Wall.camadas`. */
  camadas: CamadaParede[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Colunas nomeadas, nunca `select('*')`. */
const COLS = 'id, organization_id, nome, camadas, active, created_at, updated_at';

function mapear(row: Record<string, unknown>): TipoDeParede {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    nome: row.nome as string,
    // O banco guarda JSONB; a forma é a mesma de `CamadaParede`. Não se valida
    // aqui de propósito: quem recusa composição inválida é o kernel, ao aplicar
    // (`SetWallLayers` + invariantes). Uma segunda validação nesta borda seria a
    // segunda cópia da mesma regra.
    camadas: (row.camadas ?? []) as CamadaParede[],
    active: row.active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function fail(contexto: string, error: { message: string } | null): never {
  throw new Error(`blueprintWallType/${contexto}: ${error?.message ?? 'erro desconhecido'}`);
}

/** `organizationId` nulo = "Todas": lista o que a RLS deixar ver. */
export async function listWallTypes(
  organizationId: string | null,
  activeOnly = true,
): Promise<TipoDeParede[]> {
  let query = supabase.from('blueprint_wall_types').select(COLS).order('nome');
  if (organizationId) query = query.eq('organization_id', organizationId);
  if (activeOnly) query = query.eq('active', true);

  const { data, error } = await query;
  if (error) fail('listWallTypes', error);
  return (data ?? []).map((r) => mapear(r as Record<string, unknown>));
}

/**
 * Cria ou renomeia um tipo NUMA organização.
 *
 * `organizationId` é obrigatório aqui, e não opcional como na leitura: gravar
 * exige saber onde. Quem resolve "qual organização" quando o topo está em
 * "Todas" é `useOrgWriteTarget`/`forEachTargetOrg`, na tela — este service
 * recebe a decisão já tomada, uma organização por chamada.
 */
export async function saveWallType(
  organizationId: string,
  nome: string,
  camadas: CamadaParede[],
): Promise<TipoDeParede> {
  const { data, error } = await supabase
    .from('blueprint_wall_types')
    .upsert(
      {
        organization_id: organizationId,
        nome: nome.trim(),
        camadas,
        active: true,
        updated_at: new Date().toISOString(),
      },
      // Salvar de novo com o mesmo nome SOBRESCREVE em vez de falhar no UNIQUE:
      // "salvar como tipo" repetido é a operação normal de quem está afinando a
      // composição, e um erro de chave duplicada ali só ensinaria o usuário a
      // inventar "Externa 190 v2".
      { onConflict: 'organization_id,nome' },
    )
    .select(COLS)
    .single();

  if (error) fail('saveWallType', error);
  return mapear(data as Record<string, unknown>);
}

export async function deleteWallType(id: string): Promise<void> {
  const { error } = await supabase.from('blueprint_wall_types').delete().eq('id', id);
  if (error) fail('deleteWallType', error);
}
