import React from 'react'
import { financialReportService } from '../services/financialReportService'
import type { WIPLine } from '../types/financial'
import { useToast } from '../hooks/useToast'
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (v: number | null) => v === null ? '—' : `${v.toFixed(1)}%`

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
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
            <p className={`text-xl font-black mt-1 ${colors[variant]}`}>{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
    )
}

interface Props {
    organizationId: string
}

const WIPReport: React.FC<Props> = ({ organizationId }) => {
    const { showToast } = useToast()
    const today = new Date().toISOString().slice(0, 10)
    const [dateTo, setDateTo] = React.useState(today)
    const [rows, setRows] = React.useState<WIPLine[]>([])
    const [loading, setLoading] = React.useState(false)
    const [sortKey, setSortKey] = React.useState<keyof WIPLine>('receita_reconhecida')
    const [sortAsc, setSortAsc] = React.useState(false)

    const load = React.useCallback(async () => {
        if (!organizationId) return
        setLoading(true)
        try {
            const data = await financialReportService.getProjectWIP(organizationId, dateTo)
            setRows(data)
        } catch (e: unknown) {
            showToast('Erro ao carregar WIP', 'error')
            console.error('[WIP]', e)
        } finally {
            setLoading(false)
        }
    }, [organizationId, dateTo, showToast])

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
            className={`px-4 py-3 cursor-pointer select-none hover:bg-slate-100 transition-colors text-[10px] font-black text-slate-400 uppercase tracking-widest ${right ? 'text-right' : ''}`}
            onClick={() => handleSort(k)}
        >
            {label}<SortIcon k={k} />
        </th>
    )

    return (
        <div className="space-y-4 px-1">
            {/* Filtros */}
            <div className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Posição em</label>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors"
                >
                    {loading ? 'Carregando…' : 'Atualizar'}
                </button>
                {rows.length > 0 && (
                    <span className="ml-auto text-xs text-slate-400">
                        {rows.length} obra{rows.length !== 1 ? 's' : ''} com movimentação
                    </span>
                )}
            </div>

            {/* KPIs */}
            {rows.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KPI
                        label="Receita Reconhecida"
                        value={fmt(totals.receita_reconhecida)}
                        sub={`+ ${fmt(totals.receitas_pendentes)} pendente`}
                        variant="positive"
                    />
                    <KPI
                        label="Custo Incorrido"
                        value={fmt(totals.custo_incorrido)}
                        sub={`+ ${fmt(totals.custos_pendentes)} pendente`}
                        variant="negative"
                    />
                    <KPI
                        label="Margem Bruta Total"
                        value={fmt(totals.margem_bruta)}
                        sub={fmtPct(totalMargem)}
                        variant={totals.margem_bruta >= 0 ? 'positive' : 'negative'}
                    />
                    <KPI
                        label="Saldo de Contrato"
                        value={fmt(totals.saldo_contrato)}
                        sub="valor contratado não recebido"
                        variant={totals.saldo_contrato >= 0 ? 'neutral' : 'warning'}
                    />
                </div>
            )}

            {/* Tabela */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : rows.length === 0 ? (
                <div className="text-center py-20 text-slate-400 text-sm">
                    Nenhuma obra com movimentação financeira encontrada.
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
                    <table className="w-full text-left min-w-[900px]">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <Th label="Obra" k="project_name" />
                                <Th label="Empresa" k="empresa_nome" />
                                <Th label="Valor Contrato" k="contrato_valor" right />
                                <Th label="Receita Recebida" k="receita_reconhecida" right />
                                <Th label="Custo Incorrido" k="custo_incorrido" right />
                                <Th label="Margem" k="margem_bruta" right />
                                <Th label="Saldo Contrato" k="saldo_contrato" right />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {sorted.map(r => {
                                const margem = r.margem_bruta
                                const isNegMargem = margem < 0
                                return (
                                    <tr key={r.project_id} className="hover:bg-blue-50/30 transition-colors">
                                        <td className="px-4 py-3">
                                            <p className="text-sm font-semibold text-slate-800">{r.project_name}</p>
                                            {r.project_code && (
                                                <p className="text-xs text-slate-400">{r.project_code}</p>
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
                                                <span className="block text-[10px] font-normal text-slate-400">
                                                    +{fmt(r.receitas_pendentes)} pend.
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right tabular-nums text-red-600">
                                            {fmt(r.custo_incorrido)}
                                            {r.custos_pendentes > 0 && (
                                                <span className="block text-[10px] font-normal text-slate-400">
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
                                            <span className={`block text-[10px] font-normal ${isNegMargem ? 'text-red-500' : 'text-slate-400'}`}>
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
                                <td colSpan={2} className="px-4 py-3 text-xs font-black text-slate-600 uppercase tracking-widest">
                                    Total ({rows.length} obras)
                                </td>
                                <td className="px-4 py-3 text-sm font-bold text-right tabular-nums text-slate-700">
                                    {fmt(totals.contrato_valor)}
                                </td>
                                <td className="px-4 py-3 text-sm font-bold text-right tabular-nums text-emerald-700">
                                    {fmt(totals.receita_reconhecida)}
                                </td>
                                <td className="px-4 py-3 text-sm font-bold text-right tabular-nums text-red-600">
                                    {fmt(totals.custo_incorrido)}
                                </td>
                                <td className={`px-4 py-3 text-sm font-black text-right tabular-nums ${totals.margem_bruta >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                    {fmt(totals.margem_bruta)}
                                    <span className="block text-[10px] font-normal text-slate-400">{fmtPct(totalMargem)}</span>
                                </td>
                                <td className="px-4 py-3 text-sm font-bold text-right tabular-nums text-slate-700">
                                    {fmt(totals.saldo_contrato)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    )
}

export default WIPReport
