import React, { useMemo, useState } from 'react'
import { Loader2, FileSpreadsheet, FileText, AlertCircle, Table2, Scissors } from 'lucide-react'
import { useProjectStructure, useSteelCatalog } from '../../hooks/useStructuralQueries'
import { buildCutTable, summarizeCutTable } from '../../utils/cutTable'
import { buildProjectBarPlan } from '../../utils/cuttingStock'
import type { CutTableRow } from '../../utils/cutTable'
import StructuralBarPlan from './StructuralBarPlan'

interface Props {
  orgId: string
  projectId: string | null
  projectName: string
}

// ── Export helpers ────────────────────────────────────────────────────────────

async function exportExcel(rows: CutTableRow[], projectName: string) {
  const ExcelJS = (await import('exceljs')).default
  const { saveAs } = await import('file-saver')

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Corte e Dobra')

  // Cabeçalho do arquivo
  ws.mergeCells('A1:J1')
  const titleCell = ws.getCell('A1')
  titleCell.value = `Tabela de Corte e Dobra — ${projectName}`
  titleCell.font = { bold: true, size: 13 }
  titleCell.alignment = { horizontal: 'left' }

  ws.addRow([]) // linha vazia

  // Colunas
  const headers = [
    'Pos.', 'Estrutura', 'Elemento', 'Tipo',
    'Bitola (mm)', 'Tipo Aço', 'Formato',
    'Comp. unit. (cm)', 'Qtd peças', 'Peso total (kg)',
  ]
  const headerRow = ws.addRow(headers)
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
    cell.alignment = { horizontal: 'center' }
  })

  ws.columns = [
    { key: 'pos',            width: 7 },
    { key: 'assemblyNome',   width: 20 },
    { key: 'elementNome',    width: 12 },
    { key: 'elementTipo',    width: 12 },
    { key: 'bitolaMm',       width: 12 },
    { key: 'tipo',           width: 10 },
    { key: 'formatoDobra',   width: 14 },
    { key: 'comprimentoCm',  width: 14 },
    { key: 'qtdPecas',       width: 11 },
    { key: 'pesoTotalKg',    width: 14 },
  ]

  let prevAssembly = ''
  for (const row of rows) {
    const dataRow = ws.addRow([
      row.pos, row.assemblyNome, row.elementNome, row.elementTipo,
      row.bitolaMm, row.tipo, row.formatoDobra,
      row.comprimentoCm, row.qtdPecas, row.pesoTotalKg,
    ])
    // Linha de separação entre estruturas
    if (row.assemblyNome !== prevAssembly && prevAssembly !== '') {
      dataRow.eachCell(cell => {
        cell.border = { top: { style: 'medium', color: { argb: 'FF94A3B8' } } }
      })
    }
    prevAssembly = row.assemblyNome
  }

  const buf = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `corte-dobra-${projectName.replace(/\s+/g, '-')}.xlsx`)
}

async function exportPdf(rows: CutTableRow[], summary: ReturnType<typeof summarizeCutTable>, projectName: string) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(`Tabela de Corte e Dobra — ${projectName}`, 14, 14)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Total: ${summary.totalPesoKg.toFixed(1)} kg  |  Com perda: ${summary.totalComPerdaKg.toFixed(1)} kg`, 14, 20)

  autoTable(doc, {
    startY: 25,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    head: [['Pos.', 'Estrutura', 'Elemento', 'Tipo', 'Ø (mm)', 'Tipo Aço', 'Formato', 'Comp. (cm)', 'Qtd', 'Peso (kg)']],
    body: rows.map(r => [
      r.pos, r.assemblyNome, r.elementNome, r.elementTipo,
      r.bitolaMm, r.tipo, r.formatoDobra,
      r.comprimentoCm.toFixed(1), r.qtdPecas,
      r.pesoTotalKg.toFixed(3),
    ]),
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      4: { halign: 'center', cellWidth: 14 },
      7: { halign: 'right', cellWidth: 18 },
      8: { halign: 'center', cellWidth: 12 },
      9: { halign: 'right', cellWidth: 18 },
    },
  })

  doc.save(`corte-dobra-${projectName.replace(/\s+/g, '-')}.pdf`)
}

// ── Componente ────────────────────────────────────────────────────────────────

type CorteSubTab = 'tabela' | 'plano'

const StructuralCutTable: React.FC<Props> = ({ orgId, projectId, projectName }) => {
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)
  const [subTab, setSubTab] = useState<CorteSubTab>('tabela')

  const { data: structure = [], isLoading: loadingStructure } = useProjectStructure(projectId ?? undefined)
  const { data: catalog = [], isLoading: loadingCatalog } = useSteelCatalog(orgId)

  const rows = useMemo(() => buildCutTable(structure, catalog), [structure, catalog])
  const summary = useMemo(() => summarizeCutTable(rows), [rows])
  const barPlan = useMemo(() => buildProjectBarPlan(rows, catalog), [rows, catalog])

  const isLoading = loadingStructure || loadingCatalog

  const handleExportExcel = async () => {
    setExporting('excel')
    try { await exportExcel(rows, projectName) }
    finally { setExporting(null) }
  }

  const handleExportPdf = async () => {
    setExporting('pdf')
    try { await exportPdf(rows, summary, projectName) }
    finally { setExporting(null) }
  }

  if (!projectId) {
    return (
      <div className="flex flex-col items-center py-16 text-slate-300">
        <Scissors className="w-10 h-10 mb-2 opacity-40" />
        <p className="text-sm font-bold text-slate-400">Selecione uma obra acima para gerar a tabela</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-black text-slate-900">Corte & Dobra</h2>

        {rows.length > 0 && subTab === 'tabela' && (
          <div className="flex items-center gap-2">
            <button onClick={handleExportExcel} disabled={exporting !== null}
              className="flex items-center gap-2 bg-emerald-600 disabled:bg-slate-300 text-white rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-widest hover:bg-emerald-700">
              {exporting === 'excel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Excel
            </button>
            <button onClick={handleExportPdf} disabled={exporting !== null}
              className="flex items-center gap-2 bg-red-600 disabled:bg-slate-300 text-white rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-widest hover:bg-red-700">
              {exporting === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              PDF
            </button>
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      {rows.length > 0 && (
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          <button onClick={() => setSubTab('tabela')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all
              ${subTab === 'tabela' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <Table2 className="w-3.5 h-3.5" /> Tabela
          </button>
          <button onClick={() => setSubTab('plano')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all
              ${subTab === 'plano' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <Scissors className="w-3.5 h-3.5" /> Plano de Corte
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-slate-300">
          <AlertCircle className="w-10 h-10 mb-2 opacity-40" />
          <p className="text-sm font-bold text-slate-400">Nenhuma armadura cadastrada nesta obra</p>
          <p className="text-xs text-slate-300 mt-1">Cadastre estruturas → elementos → armaduras na aba "Obra & Armaduras".</p>
        </div>
      ) : subTab === 'plano' ? (
        <StructuralBarPlan
          plans={barPlan.bitolaPlans}
          totalBars={barPlan.totalBars}
          overallUsagePct={barPlan.overallUsagePct}
          totalWasteKg={barPlan.totalWasteKg}
          totalWasteCostBrl={barPlan.totalWasteCostBrl}
        />
      ) : (
        <>
          {/* Resumo por bitola */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-blue-50 rounded-2xl p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-blue-400">Peso total</p>
              <p className="text-2xl font-black text-blue-900 mt-1">{summary.totalPesoKg.toFixed(1)} <span className="text-sm font-bold">kg</span></p>
            </div>
            <div className="bg-amber-50 rounded-2xl p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-amber-500">Com perdas</p>
              <p className="text-2xl font-black text-amber-900 mt-1">{summary.totalComPerdaKg.toFixed(1)} <span className="text-sm font-bold">kg</span></p>
            </div>
            {summary.byBitola.slice(0, 2).map(b => (
              <div key={b.bitolaMm} className="bg-slate-50 rounded-2xl p-4">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Ø{b.bitolaMm} mm ({b.tipo})</p>
                <p className="text-2xl font-black text-slate-900 mt-1">{b.pesoKg.toFixed(1)} <span className="text-sm font-bold">kg</span></p>
              </div>
            ))}
          </div>

          {/* Tabela principal */}
          <div className="bg-white rounded-2xl border border-slate-100 overflow-auto shadow-sm">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-left text-[11px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 bg-slate-50">
                  <th className="px-3 py-3">Pos.</th>
                  <th className="px-3 py-3">Estrutura</th>
                  <th className="px-3 py-3">Elemento</th>
                  <th className="px-3 py-3">Tipo</th>
                  <th className="px-3 py-3">Bitola</th>
                  <th className="px-3 py-3">Tipo Aço</th>
                  <th className="px-3 py-3">Formato</th>
                  <th className="px-3 py-3 text-right">Comp. (cm)</th>
                  <th className="px-3 py-3 text-right">Qtd</th>
                  <th className="px-3 py-3 text-right">Peso (kg)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const prevAssembly = i > 0 ? rows[i - 1].assemblyNome : ''
                  const isSectionBorder = row.assemblyNome !== prevAssembly && i > 0
                  return (
                    <tr key={i}
                      className={`text-slate-700 hover:bg-slate-50/60 transition-colors
                        ${isSectionBorder ? 'border-t-2 border-slate-200' : 'border-t border-slate-50'}`}>
                      <td className="px-3 py-2.5 font-bold text-slate-500">{row.pos}</td>
                      <td className="px-3 py-2.5 text-slate-500 text-xs">{row.assemblyNome}</td>
                      <td className="px-3 py-2.5 font-bold">{row.elementNome}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-[11px] font-black px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">
                          {row.elementTipo}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-bold">Ø {row.bitolaMm}</td>
                      <td className="px-3 py-2.5 text-slate-500 text-xs">{row.tipo}</td>
                      <td className="px-3 py-2.5 text-slate-500 text-xs">{row.formatoDobra}</td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums">{row.comprimentoCm.toFixed(1)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{row.qtdPecas}</td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums">{row.pesoTotalKg.toFixed(3)}</td>
                    </tr>
                  )
                })}
                {/* Totais */}
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-900">
                  <td colSpan={8} className="px-3 py-3 text-right text-xs uppercase tracking-widest text-slate-500">Total</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {rows.reduce((s, r) => s + r.qtdPecas, 0)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {summary.totalPesoKg.toFixed(3)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Breakdown por bitola */}
          {summary.byBitola.length > 2 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Resumo por bitola</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {summary.byBitola.map(b => (
                  <div key={b.bitolaMm} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                    <span className="text-sm font-black text-slate-700">Ø{b.bitolaMm}</span>
                    <span className="text-sm font-bold text-slate-500">{b.pesoKg.toFixed(1)} kg</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default StructuralCutTable
