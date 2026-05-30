/**
 * Funções puras para geração da tabela de corte e dobra.
 * Entrada: estrutura aninhada da obra + catálogo de aço.
 * Saída: linhas ordenadas no formato padrão de centrais de armação.
 */
import type { AssemblyWithElements, SteelCatalogItem } from '../types/structural'
import { calcRebarResult } from './rebarEngine'

export interface CutTableRow {
  // Identificação
  pos: number | string
  assemblyNome: string
  elementNome: string
  elementTipo: string
  // Dados do aço
  bitolaMm: number
  tipo: string              // CA-50 | CA-60 | tela | treliça
  formatoDobra: string
  // Dimensões (comprimento desenvolvido de UMA peça, em cm)
  comprimentoCm: number
  // Quantidades (já multiplicadas pelo qtd de elementos iguais)
  qtdPecas: number
  // Pesos
  pesoUnitKg: number        // peso de uma peça (sem perda)
  pesoTotalKg: number       // peso total (sem perda)
  pesoComPerdaKg: number    // peso total com perda de processo
}

export interface CutTableSummary {
  totalPesoKg: number
  totalComPerdaKg: number
  byBitola: { bitolaMm: number; tipo: string; qtdPecas: number; pesoKg: number }[]
}

/**
 * Gera as linhas da tabela de corte e dobra para um projeto inteiro.
 *
 * @param assemblies  Resultado de `structuralService.loadProjectStructure(projectId)`
 * @param catalog     Resultado de `structuralService.listSteelCatalog(orgId)`
 */
export function buildCutTable(
  assemblies: AssemblyWithElements[],
  catalog: SteelCatalogItem[],
): CutTableRow[] {
  const catalogMap = new Map(catalog.map(c => [c.id, c]))
  const rows: CutTableRow[] = []

  for (const assembly of assemblies) {
    for (const element of assembly.elements ?? []) {
      for (const rebar of element.rebars ?? []) {
        const catalogItem = catalogMap.get(rebar.bitola_id)
        if (!catalogItem) continue  // bitola removida do catálogo

        const result = calcRebarResult({ rebar, element, catalogItem })
        const pesoUnit = (result.comprimentoUnitCm / 100) * catalogItem.peso_linear_kg_m

        rows.push({
          pos: rebar.posicao ?? '—',
          assemblyNome: assembly.nome,
          elementNome: element.nome,
          elementTipo: element.tipo,
          bitolaMm: catalogItem.bitola_mm,
          tipo: catalogItem.tipo,
          formatoDobra: rebar.formato_dobra,
          comprimentoCm: Math.round(result.comprimentoUnitCm * 10) / 10,
          qtdPecas: result.qtdCalculada * element.quantidade,
          pesoUnitKg: Number(pesoUnit.toFixed(3)),
          pesoTotalKg: result.pesoKg,
          pesoComPerdaKg: result.pesoComPerdaKg,
        })
      }
    }
  }

  // Ordenação padrão de prancha: estrutura → elemento → posição
  return rows.sort((a, b) => {
    if (a.assemblyNome !== b.assemblyNome) return a.assemblyNome.localeCompare(b.assemblyNome, 'pt')
    if (a.elementNome !== b.elementNome)   return a.elementNome.localeCompare(b.elementNome, 'pt')
    const pa = typeof a.pos === 'number' ? a.pos : 9999
    const pb = typeof b.pos === 'number' ? b.pos : 9999
    return pa - pb
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Quantitativo consolidado por bitola
// ─────────────────────────────────────────────────────────────────────────────

export interface QuantRow {
  bitolaMm: number
  tipo: string
  qtdPecas: number
  comprimentoTotalM: number   // comprimento total de todas as peças (m)
  pesoKg: number              // peso sem perda
  pesoComPerdaKg: number      // peso com perda de processo
  custoKg: number | null      // preço unitário do catálogo (R$/kg)
  custoTotal: number | null   // pesoComPerdaKg × custoKg
}

/**
 * Agrega as linhas da tabela de corte em um quantitativo por bitola.
 * Usa o catálogo para obter o preço unitário (R$/kg).
 */
export function buildQuantitative(
  rows: CutTableRow[],
  catalog: SteelCatalogItem[],
): QuantRow[] {
  const catalogByBitola = new Map(catalog.map(c => [c.bitola_mm, c]))
  const map = new Map<number, QuantRow>()

  for (const row of rows) {
    const existing = map.get(row.bitolaMm)
    const comprimento = (row.comprimentoCm / 100) * row.qtdPecas
    if (existing) {
      existing.qtdPecas += row.qtdPecas
      existing.comprimentoTotalM = Number((existing.comprimentoTotalM + comprimento).toFixed(3))
      existing.pesoKg = Number((existing.pesoKg + row.pesoTotalKg).toFixed(3))
      existing.pesoComPerdaKg = Number((existing.pesoComPerdaKg + row.pesoComPerdaKg).toFixed(3))
    } else {
      const cat = catalogByBitola.get(row.bitolaMm)
      map.set(row.bitolaMm, {
        bitolaMm: row.bitolaMm,
        tipo: row.tipo,
        qtdPecas: row.qtdPecas,
        comprimentoTotalM: Number(comprimento.toFixed(3)),
        pesoKg: Number(row.pesoTotalKg.toFixed(3)),
        pesoComPerdaKg: Number(row.pesoComPerdaKg.toFixed(3)),
        custoKg: cat?.custo_kg ?? null,
        custoTotal: null, // calculado abaixo
      })
    }
  }

  // Calcular custo total por bitola com o pesoComPerda final
  const result: QuantRow[] = []
  for (const row of map.values()) {
    row.custoTotal =
      row.custoKg != null
        ? Number((row.pesoComPerdaKg * row.custoKg).toFixed(2))
        : null
    result.push(row)
  }

  return result.sort((a, b) => a.bitolaMm - b.bitolaMm)
}

/** Resumo: totais globais e breakdown por bitola. */
export function summarizeCutTable(rows: CutTableRow[]): CutTableSummary {
  const totalPesoKg = rows.reduce((s, r) => s + r.pesoTotalKg, 0)
  const totalComPerdaKg = rows.reduce((s, r) => s + r.pesoComPerdaKg, 0)

  const bitolaMap = new Map<number, { bitolaMm: number; tipo: string; qtdPecas: number; pesoKg: number }>()
  for (const row of rows) {
    const e = bitolaMap.get(row.bitolaMm)
    if (e) { e.qtdPecas += row.qtdPecas; e.pesoKg += row.pesoTotalKg }
    else bitolaMap.set(row.bitolaMm, { bitolaMm: row.bitolaMm, tipo: row.tipo, qtdPecas: row.qtdPecas, pesoKg: row.pesoTotalKg })
  }

  return {
    totalPesoKg: Number(totalPesoKg.toFixed(3)),
    totalComPerdaKg: Number(totalComPerdaKg.toFixed(3)),
    byBitola: [...bitolaMap.values()].sort((a, b) => a.bitolaMm - b.bitolaMm),
  }
}
