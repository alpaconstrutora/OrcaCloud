// services/blueprintComposicaoService.ts
//
// COMPOSIÇÃO POR PEÇA (E9.2 do roadmap de incêndio, 01/10/2026) — a tabela
// `blueprint_composicoes_de_peca` da organização: disciplina + tipo da peça
// (+ especificação, opcional) → N itens do catálogo com a quantidade por peça.
// Quem expande é o orçamento (`gerarLancamentosDeInstalacoes`); aqui é só o
// cadastro. Espelha `blueprintElementTypeService`.
//
// ─── REGRA OBRIGATÓRIA #5 ──────────────────────────────────────────────────────
// Ler: a organização DO ESTUDO (a composição é de quem orça aquela planta).
// Gravar exige org explícita; quem a escolhe é a tela.

import { supabase } from '../lib/supabase';
import type { ComposicaoDePeca, ItemDaComposicao } from '../utils/blueprintBudget';

export interface ComposicaoDaOrganizacao extends ComposicaoDePeca {
  organizationId: string;
  active: boolean;
}

/** Colunas nomeadas, nunca `select('*')`. */
const COLS = 'id, organization_id, disciplina, tipo, especificacao, itens, active';

/** O JSONB volta como veio; o que não é item válido fica de fora (o orçamento não confia no banco). */
export function itensDaColuna(raw: unknown): ItemDaComposicao[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => x as Record<string, unknown>)
    .filter((x) => typeof x?.codigo === 'string' && x.codigo.trim() !== '' && typeof x.quantidade === 'number' && x.quantidade > 0)
    .map((x) => ({ codigo: (x.codigo as string).trim(), quantidade: x.quantidade as number, descricao: typeof x.descricao === 'string' ? x.descricao : null }));
}

function mapear(row: Record<string, unknown>): ComposicaoDaOrganizacao {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    disciplina: row.disciplina as string,
    tipo: row.tipo as string,
    especificacao: (row.especificacao as string | null) ?? null,
    itens: itensDaColuna(row.itens),
    active: row.active as boolean,
  };
}

function fail(contexto: string, error: { message: string } | null): never {
  throw new Error(`blueprintComposicao/${contexto}: ${error?.message ?? 'erro desconhecido'}`);
}

/** As composições ATIVAS da organização. */
export async function listarComposicoes(organizationId: string): Promise<ComposicaoDaOrganizacao[]> {
  const { data, error } = await supabase
    .from('blueprint_composicoes_de_peca')
    .select(COLS)
    .eq('organization_id', organizationId)
    .eq('active', true)
    .order('disciplina')
    .order('tipo');
  if (error) fail('listar', error);
  return (data ?? []).map((r) => mapear(r as Record<string, unknown>));
}

/** Cria ou substitui a composição da peça (a chave é organização + disciplina + tipo + especificação). */
export async function salvarComposicao(
  organizationId: string,
  c: { id?: string; disciplina: string; tipo: string; especificacao: string | null; itens: ItemDaComposicao[] },
): Promise<ComposicaoDaOrganizacao> {
  const linha = {
    organization_id: organizationId,
    disciplina: c.disciplina,
    tipo: c.tipo,
    especificacao: c.especificacao?.trim() || null,
    itens: c.itens.filter((i) => i.codigo.trim() !== '' && i.quantidade > 0).map((i) => ({ codigo: i.codigo.trim(), quantidade: i.quantidade, descricao: i.descricao?.trim() || null })),
    active: true,
  };
  const consulta = c.id
    ? supabase.from('blueprint_composicoes_de_peca').update(linha).eq('id', c.id).eq('organization_id', organizationId)
    : supabase.from('blueprint_composicoes_de_peca').insert(linha);
  const { data, error } = await consulta.select(COLS).single();
  if (error) fail('salvar', error);
  return mapear(data as Record<string, unknown>);
}

export async function apagarComposicao(id: string, organizationId: string): Promise<void> {
  const { error } = await supabase.from('blueprint_composicoes_de_peca').delete().eq('id', id).eq('organization_id', organizationId);
  if (error) fail('apagar', error);
}
