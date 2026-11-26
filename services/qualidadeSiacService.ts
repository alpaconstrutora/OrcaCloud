import { supabase } from '../lib/supabase';
import type {
  ExecutorDaInspecao,
  InspecaoAprovada,
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
  'id, organization_id, tipo, nome, etapa, origem, anexo4_numero, chave_padrao, substitui_item_id, situacao, justificativa, procedure_document_id, training_course_id, checklist_template_id, ordem, codigos:quality_controlled_item_codes(item_code)';

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
        | 'nome' | 'etapa' | 'origem' | 'substitui_item_id' | 'situacao' | 'justificativa' | 'procedure_document_id'
        | 'training_course_id' | 'checklist_template_id'
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

  /**
   * Resumo dos procedimentos vinculados, com a data da última aprovação no GED. A aprovação é do
   * documento (`approval_status`), não da versão: `documentService.uploadNewVersion` troca
   * `active_version_id` sem mexer nela. `approveDocument` grava `updated_at` na linha de
   * `opura_document_approvals` ao aprovar — é essa a data que vale (`aprovado_em`).
   */
  async resumirProcedimentos(documentIds: string[]): Promise<Record<string, ProcedimentoResumo>> {
    if (documentIds.length === 0) return {};
    const [docs, aprovacoes] = await Promise.all([
      supabase
        .from('opura_documents')
        .select('id, nome, revisao, status, approval_status, active_version:opura_document_versions!fk_active_version(created_at)')
        .in('id', documentIds) as unknown as Promise<{
        data: Array<{
          id: string;
          nome: string;
          revisao: string | null;
          status: string;
          approval_status: string;
          active_version: { created_at: string | null } | Array<{ created_at: string | null }> | null;
        }> | null;
        error: ErroSupabase;
      }>,
      supabase
        .from('opura_document_approvals')
        .select('document_id, updated_at')
        .eq('status', 'aprovado')
        .in('document_id', documentIds) as unknown as Promise<{
        data: Array<{ document_id: string; updated_at: string | null }> | null;
        error: ErroSupabase;
      }>,
    ]);
    const data = ok(docs);
    const ultimaAprovacao: Record<string, string> = {};
    for (const a of ok(aprovacoes) ?? []) {
      if (!a.updated_at) continue;
      const atual = ultimaAprovacao[a.document_id];
      if (atual === undefined || Date.parse(a.updated_at) > Date.parse(atual)) ultimaAprovacao[a.document_id] = a.updated_at;
    }
    const mapa: Record<string, ProcedimentoResumo> = {};
    for (const d of data ?? []) {
      mapa[d.id] = {
        id: d.id,
        nome: d.nome,
        revisao: d.revisao ?? null,
        status: d.status,
        approval_status: d.approval_status,
        versao_ativa_em: umOuNulo(d.active_version)?.created_at ?? null,
        aprovado_em: ultimaAprovacao[d.id] ?? null,
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
        .select('course_id, employee_id, data_realizacao, aprovado, created_at, data_validade, employees(contract_type, academy_externo)')
        .in('course_id', courseIds) as unknown as {
        data: Array<{
          course_id: string;
          employee_id: string;
          data_realizacao: string;
          aprovado: boolean;
          created_at?: string | null;
          data_validade?: string | null;
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
        registrado_em: t.created_at ?? null,
        data_validade: t.data_validade ?? null,
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

  // ─── Fase 2: SGQ da organização e serviço controlado na OE ───────────────

  /**
   * Organização dona do sistema da qualidade que vale para `orgId` (`_qualidade_sgq_da_org`:
   * `quality_settings.sgq_organization_id`, ou a própria). O banco devolve NULL a quem não é membro
   * da org nem do SGQ dela — aí fica a própria (a leitura seguinte é recortada pela RLS).
   */
  async sgqDaOrganizacao(orgId: string): Promise<string> {
    const data = ok(
      await supabase.rpc('_qualidade_sgq_da_org', { p_org: orgId }) as unknown as {
        data: string | null;
        error: ErroSupabase;
      },
    );
    return data ?? orgId;
  },

  /**
   * Organização DONA do serviço controlado (`quality_controlled_items.organization_id`) — onde o banco
   * confere `canInspectQualitySystem`/`canReleaseQualitySystem` de uma OE controlada (não no SGQ atual da
   * org da OE: desfazer o SGQ da SPE não muda de quem é a permissão sobre o serviço da Alpa).
   * `null` = a RLS esconde o serviço (quem chama não é membro da org dona dele → sem permissão).
   */
  async orgDoServicoControlado(itemId: string): Promise<string | null> {
    const data = ok(
      await supabase
        .from('quality_controlled_items')
        .select('organization_id')
        .eq('id', itemId)
        .maybeSingle() as unknown as { data: { organization_id: string } | null; error: ErroSupabase },
    );
    return data?.organization_id ?? null;
  },

  /**
   * Aponta (ou, com `null`, desfaz) a organização dona do SGQ de `orgId`. Só dono/admin das duas
   * organizações (ou superadmin) — o banco recusa os demais com 42501; sem cadeia (22023).
   */
  async definirSgq(orgId: string, sgqOrgId: string | null): Promise<void> {
    ok(
      await supabase
        .from('quality_settings')
        .upsert({ organization_id: orgId, sgq_organization_id: sgqOrgId }, { onConflict: 'organization_id' }),
    );
  },

  /**
   * Cria a ficha modelo de um serviço controlado: modelo ATIVO de checklist do Controle Operacional
   * (`oe_checklist_templates`) na organização do item, com o nome do serviço. Devolve o id — quem
   * chama grava `checklist_template_id` no item (o banco exige modelo da mesma organização, 42501).
   */
  async criarFichaModelo(organizationId: string, nome: string, tipoDeServico: string | null): Promise<string> {
    const data = ok(
      await supabase
        .from('oe_checklist_templates')
        .insert({ org_id: organizationId, name: nome, service_type: tipoDeServico, active: true })
        .select('id')
        .single() as unknown as { data: { id: string }; error: ErroSupabase },
    );
    return data.id;
  },

  /** Serviços ATIVOS do SGQ da organização da OE que a obra não excluiu — a lista do campo da OE. */
  async servicosParaOE(orgDaOE: string, projectId: string): Promise<ItemControlado[]> {
    const sgq = await qualidadeSiacService.sgqDaOrganizacao(orgDaOE);
    const [itens, exclusoes] = await Promise.all([
      qualidadeSiacService.listarItens(sgq),
      qualidadeSiacService.listarExclusoes(projectId),
    ]);
    const excluidos = new Set(exclusoes.map((e) => e.item_id));
    return itens.filter((i) => i.tipo === 'SERVICO' && i.situacao === 'ATIVO' && !excluidos.has(i.id));
  },

  /**
   * O usuário lê o sistema da qualidade `sgqOrgId`? A RLS dos itens controlados é por
   * `minhas_orgs_membro()` (sem exceção para superadmin) — então legível = membro dele.
   * Serve para explicar a lista vazia do campo da OE ("vem de outra organização, que você não acessa").
   */
  async sgqLegivel(sgqOrgId: string): Promise<boolean> {
    const data = ok(
      await supabase.rpc('minhas_orgs_membro') as unknown as { data: string[] | null; error: ErroSupabase },
    );
    return (data ?? []).includes(sgqOrgId);
  },

  /**
   * A OE já tem registro de inspeção (`_qualidade_oe_tem_registro`: resposta, histórico de resposta,
   * NC, validação ou histórico de validação)? É a mesma régua dos gatilhos que recusam trocar o serviço
   * controlado e a ficha — o formulário desliga os dois campos com o motivo.
   */
  async oeTemRegistro(workOrderId: string): Promise<boolean> {
    const data = ok(
      await supabase.rpc('_qualidade_oe_tem_registro', { p_work_order_id: workOrderId }) as unknown as {
        data: boolean | null;
        error: ErroSupabase;
      },
    );
    return data === true;
  },

  /**
   * Inspeções aprovadas (`work_order_validations` inspection/approved) das OEs cujo serviço
   * controlado é do SGQ `sgqOrgId` — da própria e das organizações que apontam para ele HOJE —, só
   * com o que se conta (serviço, data, obra em andamento, executores/treinados).
   *
   * Lê pela RPC `quality_inspecoes_aprovadas_do_sgq` (SECURITY DEFINER, migration
   * aplicar_20271126140000): o membro só do SGQ conta as OEs das SPEs que apontam para ele — pela
   * RLS ele não as via e o painel contava menos, calado, conforme quem olhava. Não membro → 42501
   * (sobe). Se a RPC ainda não existe no banco (app publicado antes da migration: PGRST202, ou
   * 42883 com o nome dela), volta para a leitura antiga pela RLS — o painel segue como antes.
   */
  async inspecoesAprovadas(sgqOrgId: string): Promise<InspecaoAprovada[]> {
    const { data, error } = await supabase.rpc('quality_inspecoes_aprovadas_do_sgq', { p_sgq: sgqOrgId }) as {
      data: Array<{
        controlled_item_id: string;
        aprovado_em: string;
        obra_em_andamento: boolean | null;
        executores_total: number | null;
        executores_treinados: number | null;
      }> | null;
      error: { message: string; code?: string } | null;
    };
    if (error) {
      // Só "a PRÓPRIA RPC não existe": PGRST202 (cache do PostgREST), ou 42883 citando o nome dela.
      // Um 42883 de função chamada por DENTRO dela que sumiu sobe — não vira contagem menor calada.
      const rpcAusente = error.code === 'PGRST202'
        || (error.code === '42883' && (error.message ?? '').includes('quality_inspecoes_aprovadas_do_sgq'));
      if (rpcAusente) return qualidadeSiacService._inspecoesAprovadasPelaRls(sgqOrgId);
      throw new Error(error.message);
    }
    return (data ?? []).map((r) => ({
      controlled_item_id: r.controlled_item_id,
      aprovado_em: r.aprovado_em,
      obra_em_andamento: r.obra_em_andamento === true,
      executores_total: Number(r.executores_total ?? 0),
      executores_treinados: Number(r.executores_treinados ?? 0),
    }));
  },

  /**
   * Leitura antiga, pela RLS de quem olha (OE de SPE só aparece para quem é membro dela) — só para
   * o banco sem a RPC da 140000. Devolve o mesmo formato de contagem.
   */
  async _inspecoesAprovadasPelaRls(sgqOrgId: string): Promise<InspecaoAprovada[]> {
    type Obra = { obra_status: string | null };
    type OE = { controlled_item_id: string; projects: Obra | Obra[] | null };
    const data = ok(
      await supabase
        .from('work_order_validations')
        .select(
          'work_order_id, liberado_em, created_at, executores, '
            + 'work_orders!inner(controlled_item_id, projects(obra_status:settings->>obraStatus), '
            + 'quality_controlled_items!inner(organization_id))',
        )
        .eq('type', 'inspection')
        .eq('status', 'approved')
        .eq('work_orders.quality_controlled_items.organization_id', sgqOrgId) as unknown as {
        data: Array<{
          work_order_id: string;
          liberado_em: string | null;
          created_at: string;
          executores: ExecutorDaInspecao[] | null;
          work_orders: OE | OE[] | null;
        }> | null;
        error: ErroSupabase;
      },
    );
    const lista: InspecaoAprovada[] = [];
    for (const v of data ?? []) {
      const oe = umOuNulo(v.work_orders);
      if (!oe?.controlled_item_id) continue;
      const executores = Array.isArray(v.executores) ? v.executores : [];
      lista.push({
        controlled_item_id: oe.controlled_item_id,
        aprovado_em: v.liberado_em ?? v.created_at,
        obra_em_andamento: umOuNulo(oe.projects)?.obra_status === 'Em andamento',
        executores_total: executores.length,
        executores_treinados: executores.filter((e) => e?.treinado === true).length,
      });
    }
    return lista;
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
