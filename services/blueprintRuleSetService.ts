// services/blueprintRuleSetService.ts
//
// Conjuntos de regras de legislação da organização (E3.2). Espelha
// `blueprintElementTypeService`: configuração mutável, JSONB validado pelo
// motor (`problemasDaRegra`) na tela, nunca pelo banco; REGRA OBRIGATÓRIA #5 —
// `organizationId` nulo = "Todas", lista o que a RLS deixar; gravar exige org.

import { supabase } from '../lib/supabase';
import type { Regra } from '../utils/blueprintRegras';

export interface ConjuntoDeRegras {
  id: string;
  organizationId: string;
  nome: string;
  municipio: string | null;
  leiReferencia: string | null;
  regras: Regra[];
  active: boolean;
  updatedAt: string;
}

const COLS = 'id, organization_id, nome, municipio, lei_referencia, regras, active, updated_at';

function mapear(row: Record<string, unknown>): ConjuntoDeRegras {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    nome: row.nome as string,
    municipio: (row.municipio as string | null) ?? null,
    leiReferencia: (row.lei_referencia as string | null) ?? null,
    regras: Array.isArray(row.regras) ? (row.regras as Regra[]) : [],
    active: row.active as boolean,
    updatedAt: row.updated_at as string,
  };
}

function fail(contexto: string, error: { message: string } | null): never {
  throw new Error(`blueprintRuleSet/${contexto}: ${error?.message ?? 'erro desconhecido'}`);
}

export const blueprintRuleSetService = {
  async list(organizationId: string | null): Promise<ConjuntoDeRegras[]> {
    let query = supabase.from('blueprint_rule_sets').select(COLS).eq('active', true).order('nome');
    if (organizationId) query = query.eq('organization_id', organizationId);
    const { data, error } = await query;
    if (error) fail('list', error);
    return (data ?? []).map((r) => mapear(r as Record<string, unknown>));
  },

  /** Cria ou substitui (mesma organização e nome) um conjunto com as regras dadas. */
  async save(organizationId: string, nome: string, regras: Regra[], extras: { municipio?: string | null; leiReferencia?: string | null } = {}): Promise<ConjuntoDeRegras> {
    const { data, error } = await supabase
      .from('blueprint_rule_sets')
      .upsert(
        {
          organization_id: organizationId,
          nome: nome.trim(),
          regras,
          municipio: extras.municipio ?? null,
          lei_referencia: extras.leiReferencia ?? null,
          active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,nome' },
      )
      .select(COLS)
      .single();
    if (error) fail('save', error);
    return mapear(data as Record<string, unknown>);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('blueprint_rule_sets').delete().eq('id', id);
    if (error) fail('remove', error);
  },
};
