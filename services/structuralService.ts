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
} from '../types/structural'

// ============================================================
// Módulo Estrutural / Ferragem Armada — acesso a dados
// CRUD via Supabase. RLS cuida do isolamento por org.
// ============================================================

export const structuralService = {

  // ── Catálogo de aço ───────────────────────────────────────
  // Traz o catálogo base global (org_id NULL) + o da própria org.
  async listSteelCatalog(orgId: string): Promise<SteelCatalogItem[]> {
    const { data, error } = await supabase
      .from('structural_steel_catalog')
      .select('*')
      .or(`org_id.is.null,org_id.eq.${orgId}`)
      .order('bitola_mm', { ascending: true })

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
      .select('*')
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
      .select('*')
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
      .select('*')
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
}
