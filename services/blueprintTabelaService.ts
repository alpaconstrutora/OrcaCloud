// services/blueprintTabelaService.ts
//
// TABELAS PERSONALIZADAS por organização (21/09/2026, P2.16) — ida e volta ao
// Supabase, e só. O que é a definição, a sanitização e a montagem da tabela
// estão em `utils/blueprintTabelas.ts`. REGRA #5: org nula na leitura =
// "Todas" (a RLS recorta); gravar exige org (quem resolve é a tela).

import { supabase } from '../lib/supabase';
import { definicaoDaColuna, type DefinicaoDeTabela, type TabelaSalva } from '../utils/blueprintTabelas';

const COLS = 'id, organization_id, nome, definicao, active, created_at, updated_at';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintTabela/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

function mapear(r: Record<string, unknown>): TabelaSalva {
  return { ...definicaoDaColuna(r.definicao, r.nome as string), nome: r.nome as string, id: r.id as string, organizationId: r.organization_id as string, active: r.active as boolean };
}

const semId = (d: DefinicaoDeTabela): DefinicaoDeTabela => ({ nome: d.nome.trim(), familia: d.familia, colunas: d.colunas, filtro: d.filtro, agruparPor: d.agruparPor, ordenarPor: d.ordenarPor, ordem: d.ordem });

export const blueprintTabelaService = {
  async list(organizationId: string | null): Promise<TabelaSalva[]> {
    let q = supabase.from('blueprint_table_definitions').select(COLS).eq('active', true).order('nome');
    if (organizationId) q = q.eq('organization_id', organizationId);
    const { data, error } = await q;
    if (error) fail('list', error);
    return (data ?? []).map((r) => mapear(r as Record<string, unknown>));
  },
  async create(organizationId: string, d: DefinicaoDeTabela): Promise<TabelaSalva> {
    const { data, error } = await supabase.from('blueprint_table_definitions').insert({ organization_id: organizationId, nome: d.nome.trim(), definicao: semId(d) }).select(COLS).single();
    if (error) fail('create', error);
    return mapear(data as Record<string, unknown>);
  },
  async update(id: string, d: DefinicaoDeTabela): Promise<TabelaSalva> {
    const { data, error } = await supabase.from('blueprint_table_definitions').update({ nome: d.nome.trim(), definicao: semId(d) }).eq('id', id).select(COLS).single();
    if (error) fail('update', error);
    return mapear(data as Record<string, unknown>);
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('blueprint_table_definitions').update({ active: false }).eq('id', id);
    if (error) fail('remove', error);
  },
};
