// services/blueprintProjetoExecutivoService.ts
//
// A emissão do projeto executivo (fase 17 da topografia): o rascunho
// (responsável e sondagem, editável) e as emissões (imutáveis). Ida e volta
// ao Supabase, e só — as verificações e o memorial estão em
// `utils/blueprintTopografiaExecutivo.ts`, puros.

import { supabase } from '../lib/supabase';
import type { BlueprintProjetoExecutivoRow } from '../types/blueprint';
import type { ResponsavelTecnico, Sondagem, VerificacaoExecutiva } from '../utils/blueprintTopografiaExecutivo';

const COLS =
  'id, study_id, organization_id, status, disciplina, responsavel, sondagem, topografia_id, topografia_versao, ' +
  'topografia_hash, hash_da_base, verificacoes, memorial, emitido_em, created_by, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintProjetoExecutivo/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

/**
 * Qual projeto executivo a linha emite. Uma tabela, N disciplinas (decisão
 * de 13/09/2026): a elétrica reusa o fluxo da topografia — `topografia_*`
 * ficam nulos nela, e `hash_da_base` amarra desenho + hipóteses.
 */
export type DisciplinaExecutiva = 'TERRAPLENAGEM' | 'ELETRICA';

export interface DadosDaEmissao {
  topografia_id: string | null;
  topografia_versao: number | null;
  topografia_hash: string | null;
  hash_da_base: string;
  verificacoes: VerificacaoExecutiva[] | VerificacaoGenerica[];
  memorial: string;
  emitido_em: string;
}

/** A forma comum a toda verificação gravada — a elétrica tem grupos próprios. */
export interface VerificacaoGenerica {
  grupo: string;
  item: string;
  norma: string;
  exigido: string;
  obtido: string;
  atende: boolean;
}

export const blueprintProjetoExecutivoService = {
  /** Rascunho e emissões do estudo NA DISCIPLINA, da mais nova para a mais antiga. */
  async listar(studyId: string, disciplina: DisciplinaExecutiva = 'TERRAPLENAGEM'): Promise<BlueprintProjetoExecutivoRow[]> {
    const { data, error } = await supabase
      .from('blueprint_study_projeto_executivo')
      .select(COLS)
      .eq('study_id', studyId)
      .eq('disciplina', disciplina)
      .order('created_at', { ascending: false });
    if (error) fail('listar', error);
    return (data ?? []) as unknown as BlueprintProjetoExecutivoRow[];
  },

  async criarRascunho(
    studyId: string,
    organizationId: string,
    responsavel: ResponsavelTecnico,
    sondagem: Sondagem,
    disciplina: DisciplinaExecutiva = 'TERRAPLENAGEM',
  ): Promise<BlueprintProjetoExecutivoRow> {
    const { data, error } = await supabase
      .from('blueprint_study_projeto_executivo')
      .insert({ study_id: studyId, organization_id: organizationId, status: 'RASCUNHO', disciplina, responsavel, sondagem })
      .select(COLS)
      .single();
    if (error) fail('criarRascunho', error);
    return data as unknown as BlueprintProjetoExecutivoRow;
  },

  async atualizarRascunho(id: string, patch: { responsavel?: ResponsavelTecnico; sondagem?: Sondagem }): Promise<void> {
    const { error } = await supabase.from('blueprint_study_projeto_executivo').update(patch).eq('id', id).eq('status', 'RASCUNHO');
    if (error) fail('atualizarRascunho', error);
  },

  /** O rascunho vira EMITIDO — a partir daí a linha é imutável (trigger + policy). */
  async emitir(id: string, dados: DadosDaEmissao): Promise<BlueprintProjetoExecutivoRow> {
    const { data, error } = await supabase
      .from('blueprint_study_projeto_executivo')
      .update({ ...dados, status: 'EMITIDO' })
      .eq('id', id)
      .eq('status', 'RASCUNHO')
      .select(COLS)
      .single();
    if (error) fail('emitir', error);
    return data as unknown as BlueprintProjetoExecutivoRow;
  },

  async apagarRascunho(id: string): Promise<void> {
    const { error } = await supabase.from('blueprint_study_projeto_executivo').delete().eq('id', id).eq('status', 'RASCUNHO');
    if (error) fail('apagarRascunho', error);
  },
};
