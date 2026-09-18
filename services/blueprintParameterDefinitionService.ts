// services/blueprintParameterDefinitionService.ts
//
// Definições de parâmetro personalizado (E1.2). O VALOR mora na peça, no
// payload canônico; aqui só o significado da chave (nome, tipo, unidade,
// opções, se sai no IFC/planilha). Ver o cabeçalho da migration.
//
// REGRA #5: `organizationId` nulo = "Todas"; o `.eq()` só entra com org.

import { supabase } from '../lib/supabase';
import type { FamiliaComParametros } from '../utils/blueprintKernel';

export type TipoDeParametro = 'NUMERO' | 'TEXTO' | 'BOOLEANO' | 'LISTA';

export interface DefinicaoDeParametro {
  id: string;
  organizationId: string;
  chave: string;
  nome: string;
  /** `null` = todas as famílias. */
  familia: FamiliaComParametros | null;
  tipo: TipoDeParametro;
  unidade: string;
  opcoes: string[];
  compartilhado: boolean;
  /** Reservado (E1.3). */
  formula: string;
  active: boolean;
}

export type DadosDaDefinicao = Pick<DefinicaoDeParametro, 'chave' | 'nome' | 'familia' | 'tipo' | 'unidade' | 'opcoes' | 'compartilhado'>;

const COLS = 'id, organization_id, chave, nome, familia, tipo, unidade, opcoes, compartilhado, formula, active';

function mapear(row: Record<string, unknown>): DefinicaoDeParametro {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    chave: row.chave as string,
    nome: row.nome as string,
    familia: (row.familia as FamiliaComParametros | null) ?? null,
    tipo: row.tipo as TipoDeParametro,
    unidade: (row.unidade as string) ?? '',
    opcoes: Array.isArray(row.opcoes) ? (row.opcoes as string[]) : [],
    compartilhado: row.compartilhado !== false,
    formula: (row.formula as string) ?? '',
    active: row.active as boolean,
  };
}

function fail(contexto: string, error: { message: string } | null): never {
  throw new Error(`blueprintParameterDefinition/${contexto}: ${error?.message ?? 'erro desconhecido'}`);
}

export async function listParameterDefinitions(organizationId: string | null): Promise<DefinicaoDeParametro[]> {
  let query = supabase.from('blueprint_parameter_definitions').select(COLS).eq('active', true).order('nome');
  if (organizationId) query = query.eq('organization_id', organizationId);
  const { data, error } = await query;
  if (error) fail('list', error);
  return (data ?? []).map((r) => mapear(r as Record<string, unknown>));
}

export async function saveParameterDefinition(organizationId: string, d: DadosDaDefinicao): Promise<DefinicaoDeParametro> {
  const { data, error } = await supabase
    .from('blueprint_parameter_definitions')
    .upsert(
      {
        organization_id: organizationId,
        chave: d.chave,
        nome: d.nome.trim(),
        familia: d.familia,
        tipo: d.tipo,
        unidade: d.unidade.trim(),
        opcoes: d.tipo === 'LISTA' ? d.opcoes.map((o) => o.trim()).filter(Boolean) : [],
        compartilhado: d.compartilhado,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,chave' },
    )
    .select(COLS)
    .single();
  if (error) fail('save', error);
  return mapear(data as Record<string, unknown>);
}

export async function deleteParameterDefinition(id: string): Promise<void> {
  const { error } = await supabase.from('blueprint_parameter_definitions').delete().eq('id', id);
  if (error) fail('delete', error);
}

/** "Fabricante (país)" → "fabricante_pais". A chave é de programa; o nome, de gente. */
export function chaveDeParametroDoNome(nome: string): string {
  const semAcento = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const base = semAcento
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  const comLetra = /^[a-z]/.test(base) ? base : `p_${base}`.slice(0, 40);
  return comLetra.replace(/_+$/g, '') || 'parametro';
}
