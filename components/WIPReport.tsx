import React from 'react'
import { financialReportService } from '../services/financialReportService'
import type { WIPLine } from '../types/financial'
import { useToast } from '../hooks/useToast'
import { TrendingUp, TrendingDown, AlertTriangle, MoveHorizontal } from 'lucide-react'
import { formatMoney, formatPercent } from './ui/Format'
import { useResizableColumns } from './ui/TableUtils'
import { useCargaVigente } from '../hooks/useCargaVigente'
import { motivoDataInvalida } from '../utils/periodoControladoria'
import { FalhaDeCarga, PeriodoInvalido } from './controladoria/EstadosDaCarga'
import { BarraDeEscopo } from './controladoria/BarraDeEscopo'
import type { EscopoControladoria } from './controladoria/escopo'

const WIP_COL_WIDTHS: Record<string, number> = {
    project_name: 220, empresa_nome: 160, contrato_valor: 150, receita_reconhecida: 160,
    custo_incorrido: 150, margem_bruta: 150, saldo_contrato: 150,
}

const fmt = formatMoney
const fmtPct = (v: number | null) => formatPercent(v, { asPoints: true, decimals: 1 })

function KPI({ label, value, sub, variant = 'neutral' }: {
    label: string
    value: string
    sub?: string
    variant?: 'positive' | 'negative' | 'neutral' | 'warning'
}) {
    const colors = {
        positive: 'text-emerald-700',
        negative: 'text-red-600',
        warning:  'text-amber-600',
        neutral:  'text-slate-800',
    }
    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{label}</p>
            <p className={`text-xl font-black mt-1 ${colors[variant]}`}>{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
    )
}

interface Props {
    organizationId: string | null
    escopo: EscopoControladoria
    /** Abre a DRE filtrada pela obra (aba DRE do mesmo módulo). */
    onVerDREDaObra?: (projectId: string) => void
}

const WIPReport: React.FC<Props> = ({ organizationId, escopo, onVerDREDaObra }) => {
    const { showToast } = useToast()
    // O WIP é uma POSIÇÃO: tudo até a data final do período da Controladoria.
    const dateTo = escopo.ate
    const [rows, setRows] = React.useState<WIPLine[]>([])
    const [loading, setLoading] = React.useState(false)
    const [falhou, setFalhou] = React.useState(false)
    const [sortKey, setSortKey] = React.useState<keyof WIPLine>('receita_reconhecida')
    const [sortAsc, setSortAsc] = React.useState(false)
    const cols = useResizableColumns(WIP_COL_WIDTHS, 'wipReportColWidths')
    const novaCarga = useCargaVigente()
    const motivoPeriodo = motivoDataInvalida(dateTo)

    const load = React.useCallback(async () => {
        const vigente = novaCarga()
        if (motivoDataInvalida(dateTo)) {
            setRows([]); setFalhou(false); setLoading(false)
            return
        }
        setLoading(true)
        setFalhou(false)
        try {
            const data = await financialReportService.getProjectWIP(organizationId, dateTo)
            if (vigente()) setRows(data)
        } catch (e: unknown) {
            if (!vigente()) return
            setRows([])
            setFalhou(true)
            showToast('Erro ao carregar WIP', 'error')
            console.error('[WIP]', e)
        } finally {
            if (vigente()) setLoading(false)
        }
    }, [novaCarga, organizationId, dateTo, showToast])

    React.useEffect(() => { load() }, [load])

    const sorted = React.useMemo(() => {
        return [...rows].sort((a, b) => {
            const av = a[sortKey] ?? 0
            const bv = b[sortKey] ?? 0
            const diff = typeof av === 'number' && typeof bv === 'number'
                ? av - bv
                : String(av).localeCompare(String(bv))
            return sortAsc ? diff : -diff
        })
    }, [rows, sortKey, sortAsc])

    const totals = React.useMemo(() => rows.reduce((acc, r) => ({
        contrato_valor:       acc.contrato_valor       + r.contrato_valor,
        custo_incorrido:      acc.custo_incorrido      + r.custo_incorrido,
        receita_reconhecida:  acc.receita_reconhecida  + r.receita_reconhecida,
        custos_pendentes:     acc.custos_pendentes     + r.custos_pendentes,
        receitas_pendentes:   acc.receitas_pendentes   + r.receitas_pendentes,
        saldo_contrato:       acc.saldo_contrato       + r.saldo_contrato,
        margem_bruta:         acc.margem_bruta         + r.margem_bruta,
    }), {
        contrato_valor: 0, custo_incorrido: 0, receita_reconhecida: 0,
        custos_pendentes: 0, receitas_pendentes: 0, saldo_contrato: 0, margem_bruta: 0,
    }), [rows])

    const totalMargem = totals.receita_reconhecida
        ? (totals.margem_bruta / totals.receita_reconhecida * 100)
        : null

    const handleSort = (key: keyof WIPLine) => {
        if (sortKey === key) setSortAsc(v => !v)
        else { setSortKey(key); setSortAsc(false) }
    }

    const SortIcon = ({ k }: { k: keyof WIPLine }) => {
        if (sortKey !== k) return <span className="text-slate-300 ml-1">↕</span>
        return <span className="text-blue-500 ml-1">{sortAsc ? '↑' : '↓'}</span>
    }

    const Th = ({ label, k, right }: { label: string; k: keyof WIPLine; right?: boolean }) => (
        <th
            className={`px-6 py-2 border-r border-gray-100 last:border-r-0 cursor-pointer select-none hover:bg-slate-100 transition-colors text-xs font-semibold text-slate-500 relative overflow-hidden ${right ? 'text-right' : ''}`}
            onClick={() => handleSort(k)}
        >
            {label}<SortIcon k={k} />
            <cols.ResizeHandle colKey={k} />
        </th>
    )

    return (
        <div className="space-y-6">
            <BarraDeEscopo escopo={escopo}
                aplica={{
                    periodo: false,
                    regime: 'O WIP mostra o recebido e o pago até a data, com o pendente à parte: não muda com o regime.',
                    obra: 'O WIP já mostra uma linha por obra: o filtro de obra não se aplica.',
                }}>
                {rows.length > 0 && (
                    <span className="text-xs text-gray-600 pb-2.5">
                        {rows.length} obra{rows.length !== 1 ? 's' : ''} com movimentação
                    </span>
                )}
            </BarraDeEscopo>

            {/* KPIs */}
            {rows.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KPI
                        label="Receita recebida"
                        value={fmt(totals.receita_reconhecida)}
                        sub={`+ ${fmt(totals.receitas_pendentes)} pendente`}
                        variant="positive"
                    />
                    <KPI
                        label="Custo pago"
                        value={fmt(totals.custo_incorrido)}
                        sub={`+ ${fmt(totals.custos_pendentes)} pendente`}
                        variant="negative"
                    />
                    <KPI
                        label="Recebido − pago"
                        value={fmt(totals.margem_bruta)}
                        sub={fmtPct(totalMargem)}
                        variant={totals.margem_bruta >= 0 ? 'positive' : 'negative'}
                    />
                    <KPI
                        label="Saldo de contrato"
                        value={fmt(totals.saldo_contrato)}
                        sub="valor contratado não recebido"
                        variant={totals.saldo_contrato >= 0 ? 'neutral' : 'warning'}
                    />
                </div>
            )}

            {/* Tabela */}
            {motivoPeriodo ? (
                <PeriodoInvalido motivo={motivoPeriodo} />
            ) : loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : falhou ? (
                <FalhaDeCarga oQue="o WIP" onRetry={load} />
            ) : rows.length === 0 ? (
                <div className="text-center py-20 text-slate-600 text-sm">
                    Nenhuma obra com movimentação financeira encontrada.
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-[10px] shadow-sm overflow-hidden">
                    <div className="flex justify-end p-2 border-b border-slate-100">
                        <button onClick={() => cols.autoFit()} className="p-1.5 rounded-[6px] text-slate-400 hover:text-slate-600 transition-all" title="Ajustar largura das colunas ao conteúdo">
                            <MoveHorizontal className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                    <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: Object.keys(WIP_COL_WIDTHS).reduce((s, k) => s + cols.getWidth(k), 0) }}>
                        <colgroup>
                            {Object.keys(WIP_COL_WIDTHS).map(k => <col key={k} data-col-key={k} style={{ width: `${cols.getWidth(k)}px` }} />)}
                        </colgroup>
                        <thead>
                            <tr className="bg-gray-50 text-gray-500 border-b border-gray-200">
                                <Th label="Obra" k="project_name" />
                                <Th label="Empresa" k="empresa_nome" />
                                <Th label="Valor do contrato" k="contrato_valor" right />
                                <Th label="Receita recebida" k="receita_reconhecida" right />
                                <Th label="Custo pago" k="custo_incorrido" right />
                                <Th label="Recebido − pago" k="margem_bruta" right />
                                <Th label="Saldo de contrato" k="saldo_contrato" right />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {sorted.map(r => {
                                const margem = r.margem_bruta
                                const isNegMargem = margem < 0
                                return (
                                    <tr key={r.project_id} className="hover:bg-blue-50/30 transition-colors">
                                        <td className="px-4 py-3">
                                            {/* O número que preocupa (margem negativa) leva à DRE da obra,
                                                onde se vê de que linha vem o custo (princípio 5). */}
                                            {onVerDREDaObra ? (
                                                <button type="button" onClick={() => onVerDREDaObra(r.project_id)}
                                                    title={`Ver a DRE de ${r.project_name}`}
                                                    className="text-left text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                                                    {r.project_name}
                                                </button>
                                            ) : (
                                                <p className="text-sm font-semibold text-slate-800">{r.project_name}</p>
                                            )}
                                            {r.project_code && (
                                                <p className="text-xs text-slate-500">{r.project_code}</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-500">
                                            {r.empresa_nome ?? '—'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right tabular-nums text-slate-600">
                                            {r.contrato_valor > 0 ? fmt(r.contrato_valor) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right tabular-nums text-emerald-700 font-semibold">
                                            {fmt(r.receita_reconhecida)}
                                            {r.receitas_pendentes > 0 && (
                                                <span className="block text-xs font-normal text-slate-400">
                                                    +{fmt(r.receitas_pendentes)} pend.
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right tabular-nums text-red-600">
                                            {fmt(r.custo_incorrido)}
                                            {r.custos_pendentes > 0 && (
                                                <span className="block text-xs font-normal text-slate-400">
                                                    +{fmt(r.custos_pendentes)} pend.
                                                </span>
                                            )}
                                        </td>
                                        <td className={`px-4 py-3 text-sm text-right tabular-nums font-semibold ${isNegMargem ? 'text-red-600' : 'text-emerald-700'}`}>
                                            <span className="flex items-center justify-end gap-1">
                                                {isNegMargem
                                                    ? <AlertTriangle className="w-3 h-3 shrink-0" />
                                                    : r.margem_pct !== null && r.margem_pct > 20
                                                        ? <TrendingUp className="w-3 h-3 shrink-0" />
                                                        : <TrendingDown className="w-3 h-3 shrink-0" />
                                                }
                                                {fmt(margem)}
                                            </span>
                                            <span className={`block text-xs font-normal ${isNegMargem ? 'text-red-500' : 'text-slate-400'}`}>
                                                {fmtPct(r.margem_pct)}
                                            </span>
                                        </td>
                                        <td className={`px-4 py-3 text-sm text-right tabular-nums ${r.saldo_contrato < 0 ? 'text-amber-600 font-semibold' : 'text-slate-600'}`}>
                                            {r.contrato_valor > 0 ? fmt(r.saldo_contrato) : '—'}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-slate-200 bg-slate-50">
                                <td colSpan={2} className="px-4 py-3 text-sm font-medium text-slate-600">
                                    Total ({rows.length} {rows.length === 1 ? 'obra' : 'obras'})
                                </td>
                                <td className="px-4 py-3 text-sm font-medium text-right tabular-nums text-slate-700">
                                    {fmt(totals.contrato_valor)}
                                </td>
                                <td className="px-4 py-3 text-sm font-medium text-right tabular-nums text-emerald-700">
                                    {fmt(totals.receita_reconhecida)}
                                </td>
                                <td className="px-4 py-3 text-sm font-medium text-right tabular-nums text-red-600">
                                    {fmt(totals.custo_incorrido)}
                                </td>
                                <td className={`px-4 py-3 text-sm font-medium text-right tabular-nums ${totals.margem_bruta >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                    {fmt(totals.margem_bruta)}
                                    <span className="block text-xs font-normal text-slate-400">{fmtPct(totalMargem)}</span>
                                </td>
                                <td className="px-4 py-3 text-sm font-medium text-right tabular-nums text-slate-700">
                                    {fmt(totals.saldo_contrato)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                    </div>
                </div>
            )}
        </div>
    )
}

export default WIPReport
