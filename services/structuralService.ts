import { supabase } from '../lib/supabase'
import type {
  SteelCatalogItem,
  StructuralAssembly,
  StructuralElement,
  Rebar,
  UpsertSteelInput,
  UpsertAssemblyInput,
  UpsertElementInput,
  UpsertRebarInput,
  AssemblyWithElements,
  OpuraStructuralProject,
  OpuraStructuralDimensionElement,
  OpuraStructuralCalculationRevision,
  UpsertStructuralProjectInput,
  UpsertStructuralDimensionElementInput,
} from '../types/structural'


// ============================================================
// Módulo Estrutural / Ferragem Armada — acesso a dados
// CRUD via Supabase. RLS cuida do isolamento por org.
// ============================================================

export const structuralService = {

  // ── Catálogo de aço ───────────────────────────────────────
  // Traz o catálogo base global (org_id NULL) + o da própria org.
  async listSteelCatalog(orgId?: string): Promise<SteelCatalogItem[]> {
    const query = supabase.from('structural_steel_catalog').select('id, org_id, tipo, bitola_mm, peso_linear_kg_m, comprimento_barra_m, fabricante, custo_kg, custo_barra, perda_pct_padrao, created_at, created_by, updated_at')
    const filtered = orgId
      ? query.or(`org_id.is.null,org_id.eq.${orgId}`)
      : query.is('org_id', null)   // sem org → só catálogo global NBR 7480
    const { data, error } = await filtered.order('bitola_mm', { ascending: true })
    if (error) throw error
    return (data ?? []) as SteelCatalogItem[]
  },

  async upsertSteel(input: UpsertSteelInput): Promise<SteelCatalogItem> {
    const payload: Record<string, unknown> = {
      org_id: input.orgId,
      tipo: input.tipo,
      bitola_mm: input.bitolaMm,
      peso_linear_kg_m: input.pesoLinearKgM,
      comprimento_barra_m: input.comprimentoBarraM ?? 12,
      fabricante: input.fabricante ?? null,
      custo_kg: input.custoKg ?? null,
      custo_barra: input.custoBarra ?? null,
      perda_pct_padrao: input.perdaPctPadrao ?? 10,
    }
    if (input.id) payload.id = input.id

    const { data, error } = await supabase
      .from('structural_steel_catalog')
      .upsert(payload)
      .select()
      .single()

    if (error) throw error
    return data as SteelCatalogItem
  },

  async deleteSteel(id: string): Promise<void> {
    const { error } = await supabase.from('structural_steel_catalog').delete().eq('id', id)
    if (error) throw error
  },

  // ── Estruturas (assemblies) ───────────────────────────────
  async listAssemblies(projectId: string): Promise<StructuralAssembly[]> {
    const { data, error } = await supabase
      .from('structural_assemblies')
      .select('id, org_id, project_id, nome, tipo, created_at, created_by, updated_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data ?? []) as StructuralAssembly[]
  },

  async upsertAssembly(input: UpsertAssemblyInput): Promise<StructuralAssembly> {
    const payload: Record<string, unknown> = {
      org_id: input.orgId,
      project_id: input.projectId,
      nome: input.nome,
      tipo: input.tipo ?? null,
    }
    if (input.id) payload.id = input.id

    const { data, error } = await supabase
      .from('structural_assemblies')
      .upsert(payload)
      .select()
      .single()

    if (error) throw error
    return data as StructuralAssembly
  },

  async deleteAssembly(id: string): Promise<void> {
    const { error } = await supabase.from('structural_assemblies').delete().eq('id', id)
    if (error) throw error
  },

  // ── Elementos ─────────────────────────────────────────────
  async listElements(assemblyId: string): Promise<StructuralElement[]> {
    const { data, error } = await supabase
      .from('structural_elements')
      .select('id, org_id, assembly_id, tipo, nome, quantidade, geometria, cobrimento_cm, created_at, created_by, updated_at')
      .eq('assembly_id', assemblyId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data ?? []) as StructuralElement[]
  },

  async upsertElement(input: UpsertElementInput): Promise<StructuralElement> {
    const payload: Record<string, unknown> = {
      org_id: input.orgId,
      assembly_id: input.assemblyId,
      tipo: input.tipo,
      nome: input.nome,
      quantidade: input.quantidade ?? 1,
      geometria: input.geometria ?? {},
      cobrimento_cm: input.cobrimentoCm ?? 3,
    }
    if (input.id) payload.id = input.id

    const { data, error } = await supabase
      .from('structural_elements')
      .upsert(payload)
      .select()
      .single()

    if (error) throw error
    return data as StructuralElement
  },

  async deleteElement(id: string): Promise<void> {
    const { error } = await supabase.from('structural_elements').delete().eq('id', id)
    if (error) throw error
  },

  // ── Armaduras ─────────────────────────────────────────────
  async listRebars(elementId: string): Promise<Rebar[]> {
    const { data, error } = await supabase
      .from('structural_rebars')
      .select('id, org_id, element_id, bitola_id, funcao, posicao, quantidade, espacamento_cm, comprimento_unit_cm, formato_dobra, dobras, created_at, created_by, updated_at')
      .eq('element_id', elementId)
      .order('posicao', { ascending: true, nullsFirst: false })

    if (error) throw error
    return (data ?? []) as Rebar[]
  },

  async upsertRebar(input: UpsertRebarInput): Promise<Rebar> {
    const payload: Record<string, unknown> = {
      org_id: input.orgId,
      element_id: input.elementId,
      bitola_id: input.bitolaId,
      funcao: input.funcao,
      posicao: input.posicao ?? null,
      quantidade: input.quantidade,
      espacamento_cm: input.espacamentoCm ?? null,
      comprimento_unit_cm: input.comprimentoUnitCm ?? null,
      formato_dobra: input.formatoDobra ?? 'reta',
      dobras: input.dobras ?? [],
    }
    if (input.id) payload.id = input.id

    const { data, error } = await supabase
      .from('structural_rebars')
      .upsert(payload)
      .select()
      .single()

    if (error) throw error
    return data as Rebar
  },

  async deleteRebar(id: string): Promise<void> {
    const { error } = await supabase.from('structural_rebars').delete().eq('id', id)
    if (error) throw error
  },

  // ── Carga completa para tabela de corte/dobra ─────────────
  // Uma única query com joins aninhados: assemblies → elements → rebars.
  async loadProjectStructure(projectId: string): Promise<AssemblyWithElements[]> {
    const { data, error } = await supabase
      .from('structural_assemblies')
      .select(`
        *,
        elements:structural_elements(
          *,
          rebars:structural_rebars(*)
        )
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data ?? []) as AssemblyWithElements[]
  },

  // ── Dimensionamento Estrutural ÒPURA (v1.0) ─────────────────
  async listStructuralProjects(organizationId?: string): Promise<OpuraStructuralProject[]> {
    let query = supabase.from('opura_structural_projects').select('*')
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as OpuraStructuralProject[]
  },

  async getStructuralProjectById(id: string): Promise<OpuraStructuralProject | null> {
    const { data, error } = await supabase
      .from('opura_structural_projects')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return data as OpuraStructuralProject | null
  },

  async upsertStructuralProject(input: UpsertStructuralProjectInput): Promise<OpuraStructuralProject> {
    const payload: Record<string, unknown> = {
      organization_id: input.organizationId,
      nome: input.nome,
      responsavel_tecnico: input.responsavelTecnico,
      numero_art: input.numeroArt ?? null,
      caa: input.caa,
      norma: input.norma ?? 'ABNT NBR 6118:2023',
      status: input.status ?? 'EM_ANDAMENTO',
      revisao_atual: input.revisaoAtual ?? 0,
    }
    if (input.id) payload.id = input.id

    const { data, error } = await supabase
      .from('opura_structural_projects')
      .upsert(payload)
      .select()
      .single()

    if (error) throw error
    return data as OpuraStructuralProject
  },

  async deleteStructuralProject(id: string): Promise<void> {
    const { error } = await supabase.from('opura_structural_projects').delete().eq('id', id)
    if (error) throw error
  },

  async listStructuralDimensionElements(projectId: string): Promise<OpuraStructuralDimensionElement[]> {
    const { data, error } = await supabase
      .from('opura_structural_dimension_elements')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data ?? []) as OpuraStructuralDimensionElement[]
  },

  async upsertStructuralDimensionElement(input: UpsertStructuralDimensionElementInput): Promise<OpuraStructuralDimensionElement> {
    const payload: Record<string, unknown> = {
      organization_id: input.organizationId,
      project_id: input.projectId,
      tipo: input.tipo,
      pavimento: input.pavimento,
      tag: input.tag,
      geometria: input.geometria,
      cargas: input.cargas,
      resultado_calculo: input.resultadoCalculo ?? null,
      status_verificacao: input.statusVerificacao ?? 'NAO_CALCULADO',
      structural_element_id: input.structuralElementId ?? null,
    }
    if (input.id) payload.id = input.id

    const { data, error } = await supabase
      .from('opura_structural_dimension_elements')
      .upsert(payload)
      .select()
      .single()

    if (error) throw error
    return data as OpuraStructuralDimensionElement
  },

  async deleteStructuralDimensionElement(id: string): Promise<void> {
    const { error } = await supabase.from('opura_structural_dimension_elements').delete().eq('id', id)
    if (error) throw error
  },

  async listCalculationRevisions(projectId: string): Promise<OpuraStructuralCalculationRevision[]> {
    const { data, error } = await supabase
      .from('opura_structural_calculation_revisions')
      .select('*')
      .eq('project_id', projectId)
      .order('calculado_em', { ascending: false })

    if (error) throw error
    return (data ?? []) as OpuraStructuralCalculationRevision[]
  },

  async createCalculationRevision(revision: Omit<OpuraStructuralCalculationRevision, 'id' | 'calculado_em'>): Promise<OpuraStructuralCalculationRevision> {
    const { data, error } = await supabase
      .from('opura_structural_calculation_revisions')
      .insert({
        organization_id: revision.organization_id,
        project_id: revision.project_id,
        revisao: revision.revisao,
        elemento_tag: revision.elemento_tag,
        tipo_elemento: revision.tipo_elemento,
        geometria_calculada: revision.geometria_calculada,
        cargas_calculadas: revision.cargas_calculadas,
        resultado_verificacao: revision.resultado_verificacao,
        armadura_calculada: revision.armadura_calculada,
        calculado_por: revision.calculado_por,
      })
      .select()
      .single()

    if (error) throw error
    return data as OpuraStructuralCalculationRevision
  },
}

