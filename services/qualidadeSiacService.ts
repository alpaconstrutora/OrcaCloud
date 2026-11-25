import { supabase } from '../lib/supabase';
import type {
  ItemControlado,
  NivelSiac,
  ProcedimentoResumo,
  RegistroTreinamento,
} from '../types/qualidadeSiac';
import { ANEXO4_SERVICOS, SUGESTAO_MATERIAIS } from '../utils/qualidadeSiac';

/**
 * Módulo Qualidade (SiAC) — acesso a dados.
 * Tabelas: supabase/migrations/aplicar_20271125600000_qualidade_siac_base.sql.
 *
 * Organização (REGRA #5): leitura recebe `organizationId?: string | null`;
 * `null`/ausente = "Todas" e a RLS recorta. Escrita recebe a org EXPLÍCITA.
 * Todo erro do supabase sobe como `Error(message)` — nunca vira lista vazia calada.
 */

type ErroSupabase = { message: string } | null;

function ok<T>(res: { data: T; error: ErroSupabase }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Embed do PostgREST pode vir como array, objeto ou null conforme a cardinalidade da FK. */
function umOuNulo<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function listaDe<T>(v: T | T[] | null | undefined): T[] {
  if (Array.isArray(v)) return v;
  return v ? [v] : [];
}

const COLUNAS_ITEM =
  'id, organization_id, tipo, nome, etapa, origem, anexo4_numero, chave_padrao, substitui_item_id, situacao, justificativa, procedure_document_id, training_course_id, ordem, codigos:quality_controlled_item_codes(item_code)';

const ON_CONFLICT_PADRAO = { onConflict: 'organization_id,chave_padrao', ignoreDuplicates: true } as const;

type LinhaItem = Omit<ItemControlado, 'codigos'> & {
  codigos: { item_code: string } | Array<{ item_code: string }> | null;
};

async function carregarLinhas(linhas: Array<Record<string, unknown>>): Promise<number> {
  const data = ok(
    await supabase
      .from('quality_controlled_items')
      .upsert(linhas, ON_CONFLICT_PADRAO)
      .select('id') as unknown as { data: Array<{ id: string }> | null; error: ErroSupabase },
  );
  return (data ?? []).length;
}

export const qualidadeSiacService = {
  async listarItens(organizationId?: string | null): Promise<ItemControlado[]> {
    let q = supabase.from('quality_controlled_items').select(COLUNAS_ITEM);
    if (organizationId) q = q.eq('organization_id', organizationId);
    const data = ok(
      await q.order('tipo', { ascending: true }).order('ordem', { ascending: true }) as unknown as {
        data: LinhaItem[] | null;
        error: ErroSupabase;
      },
    );
    return (data ?? []).map((l) => ({
      ...l,
      codigos: listaDe(l.codigos).map((c) => c.item_code),
    }));
  },

  /** Carrega os 27 serviços do Anexo 4; o que já existe não é sobrescrito. Devolve quantos entraram. */
  carregarAnexo4(organizationId: string): Promise<number> {
    return carregarLinhas(
      ANEXO4_SERVICOS.map((s) => ({
        organization_id: organizationId,
        tipo: 'SERVICO',
        nome: s.nome,
        etapa: s.etapa,
        origem: 'ANEXO4',
        anexo4_numero: s.numero,
        chave_padrao: s.chave,
        ordem: s.numero,
      })),
    );
  },

  carregarSugestaoMateriais(organizationId: string): Promise<number> {
    return carregarLinhas(
      SUGESTAO_MATERIAIS.map((m, i) => ({
        organization_id: organizationId,
        tipo: 'MATERIAL',
        nome: m.nome,
        origem: 'PROPRIO',
        chave_padrao: m.chave,
        ordem: i + 1,
      })),
    );
  },

  async criarItem(
    organizationId: string,
    input: Pick<ItemControlado, 'tipo' | 'nome' | 'etapa' | 'origem'>,
  ): Promise<ItemControlado> {
    const data = ok(
      await supabase
        .from('quality_controlled_items')
        .insert({ organization_id: organizationId, ...input })
        .select(COLUNAS_ITEM)
        .single() as unknown as { data: LinhaItem; error: ErroSupabase },
    );
    return { ...data, codigos: listaDe(data.codigos).map((c) => c.item_code) };
  },

  async atualizarItem(
    id: string,
    patch: Partial<
      Pick<
        ItemControlado,
        'nome' | 'etapa' | 'origem' | 'substitui_item_id' | 'situacao' | 'justificativa' | 'procedure_document_id' | 'training_course_id'
      >
    >,
  ): Promise<void> {
    ok(await supabase.from('quality_controlled_items').update(patch).eq('id', id));
  },

  /** Deixa o item com exatamente estes códigos: apaga os ausentes e insere só os novos. */
  async definirCodigos(itemId: string, codigos: string[]): Promise<void> {
    const desejados = [...new Set(codigos.map((c) => c.trim()).filter((c) => c !== ''))];
    const existentes = (
      ok(
        await supabase.from('quality_controlled_item_codes').select('item_code').eq('item_id', itemId) as unknown as {
          data: Array<{ item_code: string }> | null;
          error: ErroSupabase;
        },
      ) ?? []
    ).map((r) => r.item_code);

    const ausentes = existentes.filter((c) => !desejados.includes(c));
    const novos = desejados.filter((c) => !existentes.includes(c));

    if (ausentes.length > 0) {
      ok(
        await supabase
          .from('quality_controlled_item_codes')
          .delete()
          .eq('item_id', itemId)
          .in('item_code', ausentes),
      );
    }
    if (novos.length > 0) {
      ok(
        await supabase
          .from('quality_controlled_item_codes')
          .insert(novos.map((item_code) => ({ item_id: itemId, item_code }))),
      );
    }
  },

  /** Org sem linha = 'B' (quem chama completa o padrão). */
  async listarNiveis(organizationId?: string | null): Promise<Record<string, NivelSiac>> {
    let q = supabase.from('quality_settings').select('organization_id, nivel_alvo');
    if (organizationId) q = q.eq('organization_id', organizationId);
    const data = ok(
      await q as unknown as {
        data: Array<{ organization_id: string; nivel_alvo: NivelSiac }> | null;
        error: ErroSupabase;
      },
    );
    const mapa: Record<string, NivelSiac> = {};
    for (const l of data ?? []) mapa[l.organization_id] = l.nivel_alvo;
    return mapa;
  },

  async definirNivel(organizationId: string, nivel: NivelSiac): Promise<void> {
    ok(
      await supabase
        .from('quality_settings')
        .upsert({ organization_id: organizationId, nivel_alvo: nivel }, { onConflict: 'organization_id' }),
    );
  },

  async resumirProcedimentos(documentIds: string[]): Promise<Record<string, ProcedimentoResumo>> {
    if (documentIds.length === 0) return {};
    const data = ok(
      await supabase
        .from('opura_documents')
        .select('id, nome, revisao, approval_status, active_version:opura_document_versions!fk_active_version(created_at)')
        .in('id', documentIds) as unknown as {
        data: Array<{
          id: string;
          nome: string;
          revisao: string | null;
          approval_status: string;
          active_version: { created_at: string | null } | Array<{ created_at: string | null }> | null;
        }> | null;
        error: ErroSupabase;
      },
    );
    const mapa: Record<string, ProcedimentoResumo> = {};
    for (const d of data ?? []) {
      mapa[d.id] = {
        id: d.id,
        nome: d.nome,
        revisao: d.revisao ?? null,
        approval_status: d.approval_status,
        versao_ativa_em: umOuNulo(d.active_version)?.created_at ?? null,
      };
    }
    return mapa;
  },

  async listarTreinamentos(courseIds: string[]): Promise<Record<string, RegistroTreinamento[]>> {
    if (courseIds.length === 0) return {};
    type Emp = { contract_type: string | null; academy_externo: boolean | null };
    const data = ok(
      await supabase
        .from('employee_trainings')
        .select('course_id, employee_id, data_realizacao, aprovado, employees(contract_type, academy_externo)')
        .in('course_id', courseIds) as unknown as {
        data: Array<{
          course_id: string;
          employee_id: string;
          data_realizacao: string;
          aprovado: boolean;
          employees: Emp | Emp[] | null;
        }> | null;
        error: ErroSupabase;
      },
    );
    const porCurso: Record<string, RegistroTreinamento[]> = {};
    for (const t of data ?? []) {
      const emp = umOuNulo(t.employees);
      const externo = emp?.academy_externo === true || emp?.contract_type === 'EMPREITEIRO';
      (porCurso[t.course_id] ??= []).push({
        employee_id: t.employee_id,
        data_realizacao: t.data_realizacao,
        aprovado: t.aprovado,
        externo,
      });
    }
    return porCurso;
  },

  async listarExclusoes(projectId: string): Promise<Array<{ item_id: string; motivo: string }>> {
    const data = ok(
      await supabase
        .from('quality_project_exclusions')
        .select('item_id, motivo')
        .eq('project_id', projectId) as unknown as {
        data: Array<{ item_id: string; motivo: string }> | null;
        error: ErroSupabase;
      },
    );
    return data ?? [];
  },

  async excluirDaObra(projectId: string, itemId: string, motivo: string): Promise<void> {
    ok(await supabase.from('quality_project_exclusions').insert({ project_id: projectId, item_id: itemId, motivo }));
  },

  async reincluirNaObra(projectId: string, itemId: string): Promise<void> {
    ok(
      await supabase
        .from('quality_project_exclusions')
        .delete()
        .eq('project_id', projectId)
        .eq('item_id', itemId),
    );
  },

  /** A RPC confere a org, normaliza o CPF e recusa lista final de pessoas vazia (22023). */
  async registrarTreinamentoEmObra(input: {
    organizationId: string;
    courseId: string;
    data: string;
    instrutor: string;
    local: string;
    employeeIds: string[];
    novosTerceiros: Array<{ nome: string; cpf?: string; empreiteira?: string }>;
  }): Promise<number> {
    const data = ok(
      await supabase.rpc('quality_registrar_treinamento_em_obra', {
        p_org: input.organizationId,
        p_course_id: input.courseId,
        p_data: input.data,
        p_instrutor: input.instrutor,
        p_local: input.local,
        p_employee_ids: input.employeeIds,
        p_novos_terceiros: input.novosTerceiros,
      }) as unknown as { data: number | null; error: ErroSupabase },
    );
    return data ?? 0;
  },
};
