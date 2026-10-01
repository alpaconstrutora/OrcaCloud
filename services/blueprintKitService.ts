// services/blueprintKitService.ts
//
// KITS DE INSERÇÃO (F2 do backlog de incêndio pós-roadmap, 01/10/2026) — a tabela
// `blueprint_kits_de_insercao` da organização: peça principal (disciplina + tipo)
// → N peças com deslocamento. Quem expande é o editor, ao inserir a principal
// (`kitDaPeca`); aqui é só o cadastro. Espelha `blueprintComposicaoService`.
//
// ─── REGRA OBRIGATÓRIA #5 ──────────────────────────────────────────────────────
// Ler: a organização DO ESTUDO (o kit é de quem desenha aquela planta).
// Gravar exige org explícita; quem a escolhe é a tela.

import { supabase } from '../lib/supabase';
import { itensDoKit, type KitDeInsercao } from '../utils/blueprintKitsDeInsercao';

export interface KitDaOrganizacao extends KitDeInsercao {
  id: string;
  organizationId: string;
  active: boolean;
}

/** Colunas nomeadas, nunca `select('*')`. */
const COLS = 'id, organization_id, nome, disciplina, tipo, itens, active';

function mapear(row: Record<string, unknown>): KitDaOrganizacao {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    nome: row.nome as string,
    disciplina: row.disciplina as string,
    tipo: row.tipo as string,
    // O JSONB não é confiável para o kernel: o item que não vira `AddTerminal` fica de fora.
    itens: itensDoKit(row.itens),
    active: row.active as boolean,
  };
}

function fail(contexto: string, error: { message: string } | null): never {
  throw new Error(`blueprintKit/${contexto}: ${error?.message ?? 'erro desconhecido'}`);
}

/** Os kits ATIVOS da organização. */
export async function listarKits(organizationId: string): Promise<KitDaOrganizacao[]> {
  const { data, error } = await supabase
    .from('blueprint_kits_de_insercao')
    .select(COLS)
    .eq('organization_id', organizationId)
    .eq('active', true)
    .order('disciplina')
    .order('tipo')
    .order('nome');
  if (error) fail('listar', error);
  return (data ?? []).map((r) => mapear(r as Record<string, unknown>));
}

/** Cria o kit (a chave é organização + disciplina + tipo + nome: o mesmo nome repetido é recusado pelo banco). */
export async function salvarKit(organizationId: string, k: KitDeInsercao): Promise<KitDaOrganizacao> {
  const linha = {
    organization_id: organizationId,
    nome: k.nome.trim(),
    disciplina: k.disciplina,
    tipo: k.tipo,
    itens: k.itens,
    active: true,
  };
  const consulta = k.id
    ? supabase.from('blueprint_kits_de_insercao').update(linha).eq('id', k.id).eq('organization_id', organizationId)
    : supabase.from('blueprint_kits_de_insercao').insert(linha);
  const { data, error } = await consulta.select(COLS).single();
  if (error) fail('salvar', error);
  return mapear(data as Record<string, unknown>);
}

export async function apagarKit(id: string, organizationId: string): Promise<void> {
  const { error } = await supabase.from('blueprint_kits_de_insercao').delete().eq('id', id).eq('organization_id', organizationId);
  if (error) fail('apagar', error);
}
