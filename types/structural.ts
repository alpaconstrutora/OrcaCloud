// ============================================================
// Módulo Estrutural / Ferragem Armada — tipos
// Espelha as tabelas de 20260707000000_create_structural_module.sql
// Princípio: quantificar, não dimensionar.
// ============================================================

export type SteelType = 'CA-50' | 'CA-60' | 'tela' | 'trelica'

export type ElementType =
  | 'viga' | 'pilar' | 'sapata' | 'bloco' | 'radier'
  | 'laje' | 'escada' | 'muro' | 'baldrame'

export type RebarFunction =
  | 'longitudinal' | 'estribo' | 'porta_estribo' | 'distribuicao' | 'ancoragem'

export const ELEMENT_TYPES: { value: ElementType; label: string }[] = [
  { value: 'viga',     label: 'Viga' },
  { value: 'pilar',    label: 'Pilar' },
  { value: 'sapata',   label: 'Sapata' },
  { value: 'bloco',    label: 'Bloco' },
  { value: 'radier',   label: 'Radier' },
  { value: 'laje',     label: 'Laje' },
  { value: 'escada',   label: 'Escada' },
  { value: 'muro',     label: 'Muro' },
  { value: 'baldrame', label: 'Baldrame' },
]

/** Cobrimento default por elemento (cm), NBR 6118 Tab. 7.2 (CAA II) — editável */
export const DEFAULT_COVER_CM: Record<ElementType, number> = {
  viga: 3, pilar: 3, laje: 2.5,
  sapata: 4, bloco: 4, radier: 4, baldrame: 4, muro: 3, escada: 2.5,
}

// ── Geometria (cm) ───────────────────────────────────────────
export interface ElementGeometry {
  b?: number            // largura (cm)
  h?: number            // altura (cm)
  comprimento?: number  // comprimento/vão (cm)
  [key: string]: number | undefined
}

// ── Trecho de dobra ──────────────────────────────────────────
export interface BendSegment {
  tipo: 'reta' | 'dobra'
  cm?: number    // comprimento do trecho reto
  ang?: number   // ângulo da dobra (graus)
}

// ── Linhas (row) ─────────────────────────────────────────────
export interface SteelCatalogItem {
  id: string
  org_id: string | null
  tipo: SteelType
  bitola_mm: number
  peso_linear_kg_m: number
  comprimento_barra_m: number
  fabricante: string | null
  custo_kg: number | null
  custo_barra: number | null
  perda_pct_padrao: number
  created_at: string
  created_by: string | null
  updated_at: string
}

export interface StructuralAssembly {
  id: string
  org_id: string
  project_id: string
  nome: string
  tipo: string | null
  created_at: string
  created_by: string | null
  updated_at: string
}

export interface StructuralElement {
  id: string
  org_id: string
  assembly_id: string
  tipo: ElementType
  nome: string
  quantidade: number
  geometria: ElementGeometry
  cobrimento_cm: number
  created_at: string
  created_by: string | null
  updated_at: string
}

export interface Rebar {
  id: string
  org_id: string
  element_id: string
  bitola_id: string
  funcao: RebarFunction
  posicao: number | null
  quantidade: number
  espacamento_cm: number | null
  comprimento_unit_cm: number | null
  formato_dobra: string
  dobras: BendSegment[]
  created_at: string
  created_by: string | null
  updated_at: string
}

// ── Inputs de mutação (camelCase) ────────────────────────────
export interface UpsertSteelInput {
  id?: string
  orgId: string
  tipo: SteelType
  bitolaMm: number
  pesoLinearKgM: number
  comprimentoBarraM?: number
  fabricante?: string | null
  custoKg?: number | null
  custoBarra?: number | null
  perdaPctPadrao?: number
}

export interface UpsertAssemblyInput {
  id?: string
  orgId: string
  projectId: string
  nome: string
  tipo?: string | null
}

export interface UpsertElementInput {
  id?: string
  orgId: string
  assemblyId: string
  tipo: ElementType
  nome: string
  quantidade?: number
  geometria?: ElementGeometry
  cobrimentoCm?: number
}

export interface UpsertRebarInput {
  id?: string
  orgId: string
  elementId: string
  bitolaId: string
  funcao: RebarFunction
  posicao?: number | null
  quantidade: number
  espacamentoCm?: number | null
  comprimentoUnitCm?: number | null
  formatoDobra?: string
  dobras?: BendSegment[]
}

// ── Nested (carregado via join para corte/dobra) ─────────────
export interface ElementWithRebars extends StructuralElement {
  rebars: Rebar[]
}

export interface AssemblyWithElements extends StructuralAssembly {
  elements: ElementWithRebars[]
}

// ── Derivados (calculados no client; não persistidos no MVP) ──
export interface CutPiece {
  rebarId: string
  posicao: number | null
  bitolaMm: number
  formato: string
  comprimentoCm: number
  quantidade: number
  pesoKg: number
}

export interface QuantitativeRow {
  bitolaMm: number
  tipo: SteelType
  pesoKg: number
  pesoComPerdaKg: number
  custo: number | null
}
