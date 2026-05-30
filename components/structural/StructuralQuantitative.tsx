import React, { useMemo, useState } from 'react'
import {
  Loader2, FileSpreadsheet, FileText,
  AlertCircle, Calculator, TrendingDown, Package,
} from 'lucide-react'
import { useProjectStructure, useSteelCatalog } from '../../hooks/useStructuralQueries'
import { buildCutTable } from '../../utils/cutTable'
import { buildQuantitative } from '../../utils/cutTable'
import type { QuantRow } from '../../utils/cutTable'

interface Props {
  orgId: string
  projectId: string | null
  projectName: string
}

// ── Export helpers ────────────────────────────────────────────────────────────

async function exportExcel(rows: QuantRow[], projectName: string) {
  const ExcelJS = (await import('exceljs')).default
  const { saveAs } = await import('file-saver')

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Quantitativo de Aço')

  ws.mergeCells('A1:G1')
  const titleCell = ws.getCell('A1')
  titleCell.value = `Quantitativo de Ferragem — ${projectName}`
  titleCell.font = { bold: true, size: 14 }
  titleCell.alignment = { horizontal: 'left' }
  ws.addRow([])

  const headerRow = ws.addRow([
    'Bitola (mm)', 'Tipo', 'Qtd. peças', 'Comp. total (m)',
    'Peso s/ perda (kg)', 'Peso c/ perda (kg)', 'Custo/kg (R$)', 'Custo total (R$)',
  ])
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
    cell.alignment = { horizontal: 'center' }
  })

  ws.columns = [
    { width: 14 }, { width: 10 }, { width: 12 }, { width: 16 },
    { width: 18 }, { width: 18 }, { width: 14 }, { width: 16 },
  ]

  for (const row of rows) {
    ws.addRow([
      row.bitolaMm, row.tipo, row.qtdPecas,
      row.comprimentoTotalM.toFixed(2),
      row.pesoKg.toFixed(3),
      row.pesoComPerdaKg.toFixed(3),
      row.custoKg ?? '—',
      row.custoTotal?.toFixed(2) ?? '—',
    ])
  }

  // Linha de total
  ws.addRow([])
  const totalRow = ws.addRow([
    'TOTAL', '', rows.reduce((s, r) => s + r.qtdPecas, 0),
    rows.reduce((s, r) => s + r.comprimentoTotalM, 0).toFixed(2),
    rows.reduce((s, r) => s + r.pesoKg, 0).toFixed(3),
    rows.reduce((s, r) => s + r.pesoComPerdaKg, 0).toFixed(3),
    '',
    rows.some(r => r.custoTotal != null)
      ? rows.reduce((s, r) => s + (r.custoTotal ?? 0), 0).toFixed(2)
      : '—',
  ])
  totalRow.font = { bold: true }
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }

  const buf = await wb.xlsx.writeBuffer()
  const { saveAs: save } = await import('file-saver')
  save(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `quantitativo-${projectName.replace(/\s+/g, '-')}.xlsx`)
}

async function exportPdf(rows: QuantRow[], projectName: string) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const totalPeso = rows.reduce((s, r) => s + r.pesoComPerdaKg, 0)
  const totalCusto = rows.some(r => r.custoTotal != null)
    ? rows.reduce((s, r) => s + (r.custoTotal ?? 0), 0)
    : null

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.setFontSize(14); doc.setFont('helvetica', 'bold')
  doc.text(`Quantitativo de Ferragem — ${projectName}`, 14, 14)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text(
    `Total c/ perda: ${totalPeso.toFixed(1)} kg` +
    (totalCusto != null ? `  |  Custo estimado: ${totalCusto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''),
    14, 21
  )

  autoTable(doc, {
    startY: 26,
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    head: [['Bitola (mm)', 'Tipo', 'Qtd', 'Comp. (m)', 'Peso (kg)', 'c/ Perda (kg)', 'Custo/kg', 'Total (R$)']],
    body: [
      ...rows.map(r => [
        `Ø${r.bitolaMm}`, r.tipo, r.qtdPecas,
        r.comprimentoTotalM.toFixed(1),
        r.pesoKg.toFixed(2),
        r.pesoComPerdaKg.toFixed(2),
        r.custoKg != null ? `R$ ${r.custoKg.toFixed(2)}` : '—',
        r.custoTotal != null ? `R$ ${r.custoTotal.toFixed(2)}` : '—',
      ]),
      [
        { content: 'TOTAL', styles: { fontStyle: 'bold' } }, '',
        { content: String(rows.reduce((s, r) => s + r.qtdPecas, 0)), styles: { fontStyle: 'bold' } },
        { content: rows.reduce((s, r) => s + r.comprimentoTotalM, 0).toFixed(1), styles: { fontStyle: 'bold' } },
        { content: rows.reduce((s, r) => s + r.pesoKg, 0).toFixed(2), styles: { fontStyle: 'bold' } },
        { content: totalPeso.toFixed(2), styles: { fontStyle: 'bold' } },
        '',
        { content: totalCusto != null ? `R$ ${totalCusto.toFixed(2)}` : '—', styles: { fontStyle: 'bold' } },
      ],
    ],
    columnStyles: {
      0: { halign: 'center' }, 1: { halign: 'center' },
      2: { halign: 'right' }, 3: { halign: 'right' },
      4: { halign: 'right' }, 5: { halign: 'right' },
      6: { halign: 'right' }, 7: { halign: 'right' },
    },
  })

  doc.save(`quantitativo-${projectName.replace(/\s+/g, '-')}.pdf`)
}

// ── Componente ────────────────────────────────────────────────────────────────

const StructuralQuantitative: React.FC<Props> = ({ orgId, projectId, projectName }) => {
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)

  const { data: structure = [], isLoading: loadingStructure } = useProjectStructure(projectId ?? undefined)
  const { data: catalog = [], isLoading: loadingCatalog } = useSteelCatalog(orgId)

  const cutRows = useMemo(() => buildCutTable(structure, catalog), [structure, catalog])
  const quantRows = useMemo(() => buildQuantitative(cutRows, catalog), [cutRows, catalog])

  const isLoading = loadingStructure || loadingCatalog

  const totalPeso = quantRows.reduce((s, r) => s + r.pesoKg, 0)
  const totalComPerda = quantRows.reduce((s, r) => s + r.pesoComPerdaKg, 0)
  const totalCusto = quantRows.some(r => r.custoTotal != null)
    ? quantRows.reduce((s, r) => s + (r.custoTotal ?? 0), 0)
    : null

  const handleExportExcel = async () => {
    setExporting('excel')
    try { await exportExcel(quantRows, projectName) } finally { setExporting(null) }
  }
  const handleExportPdf = async () => {
    setExporting('pdf')
    try { await exportPdf(quantRows, projectName) } finally { setExporting(null) }
  }

  if (!projectId) {
    return (
      <div className="flex flex-col items-center py-16 text-slate-300">
        <Calculator className="w-10 h-10 mb-2 opacity-40" />
        <p className="text-sm font-bold text-slate-400">Selecione uma obra acima para ver o quantitativo</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-black text-slate-900">Quantitativo de Ferragem</h2>
        {quantRows.length > 0 && (
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

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : quantRows.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-slate-300">
          <AlertCircle className="w-10 h-10 mb-2 opacity-40" />
          <p className="text-sm font-bold text-slate-400">Nenhuma armadura cadastrada nesta obra</p>
          <p className="text-xs text-slate-300 mt-1">Cadastre estruturas → elementos → armaduras na aba "Obra & Armaduras".</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-blue-50 rounded-2xl p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-blue-400 flex items-center gap-1">
                <Package className="w-3 h-3" /> Peso líquido
              </p>
              <p className="text-2xl font-black text-blue-900 mt-1">{totalPeso.toFixed(1)} <span className="text-sm font-bold">kg</span></p>
              <p className="text-xs text-blue-300 mt-1">sem perda de processo</p>
            </div>
            <div className="bg-amber-50 rounded-2xl p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-1">
                <TrendingDown className="w-3 h-3" /> Com perdas
              </p>
              <p className="text-2xl font-black text-amber-900 mt-1">{totalComPerda.toFixed(1)} <span className="text-sm font-bold">kg</span></p>
              <p className="text-xs text-amber-400 mt-1">base p/ compra</p>
            </div>
            {totalCusto != null ? (
              <div className="bg-emerald-50 rounded-2xl p-4 sm:col-span-2">
                <p className="text-[11px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1">
                  <Calculator className="w-3 h-3" /> Custo estimado do aço
                </p>
                <p className="text-2xl font-black text-emerald-900 mt-1">
                  {totalCusto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
                <p className="text-xs text-emerald-400 mt-1">baseado no custo/kg do catálogo × peso c/ perda</p>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-2xl p-4 sm:col-span-2 border border-dashed border-slate-200">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                  <Calculator className="w-3 h-3" /> Custo estimado
                </p>
                <p className="text-sm text-slate-400 mt-2 font-medium">
                  Cadastre o custo/kg no Catálogo de Aço para ver o custo estimado.
                </p>
              </div>
            )}
          </div>

          {/* Tabela quantitativa */}
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">Consolidado por bitola</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-3">Bitola</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3 text-right">Qtd peças</th>
                  <th className="px-4 py-3 text-right">Comp. total (m)</th>
                  <th className="px-4 py-3 text-right">Peso s/ perda (kg)</th>
                  <th className="px-4 py-3 text-right">Peso c/ perda (kg)</th>
                  <th className="px-4 py-3 text-right">Custo/kg (R$)</th>
                  <th className="px-4 py-3 text-right">Custo total (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {quantRows.map(row => (
                  <tr key={row.bitolaMm} className="text-slate-700 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-black text-slate-900">Ø {row.bitolaMm} mm</td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700">{row.tipo}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold">{row.qtdPecas}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.comprimentoTotalM.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.pesoKg.toFixed(3)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold">{row.pesoComPerdaKg.toFixed(3)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                      {row.custoKg != null
                        ? row.custoKg.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold">
                      {row.custoTotal != null
                        ? row.custoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : <span className="text-slate-300 font-normal">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-900">
                  <td colSpan={2} className="px-4 py-3 text-xs uppercase tracking-widest text-slate-500">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {quantRows.reduce((s, r) => s + r.qtdPecas, 0)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {quantRows.reduce((s, r) => s + r.comprimentoTotalM, 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {totalPeso.toFixed(3)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {totalComPerda.toFixed(3)}
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums">
                    {totalCusto != null
                      ? totalCusto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Nota de integração com orçamento */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
            <Calculator className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-black text-blue-800">Integração com o Orçamento</p>
              <p className="text-xs text-blue-600 mt-1">
                Exporte este quantitativo em Excel e adicione como insumo no orçamento da obra
                (Engenharia → Orçamentos → BudgetEditor). Use o peso c/ perda como quantidade
                e o custo/kg como preço unitário do item "Aço para armaduras".
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default StructuralQuantitative
