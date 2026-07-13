import React from 'react'
import { financialReportService } from '../services/financialReportService'
import type { DRESPELine, RegimeContabil } from '../types/financial'
import { useToast } from '../hooks/useToast'
import { TrendingUp, TrendingDown } from 'lucide-react'
import Button from './ui/Button'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (v: number | null) => v === null ? '—' : `${v.toFixed(1)}%`

interface Props {
    organizationId: string | null
}

const COLS: { label: string; key: keyof DRESPELine; help?: string }[] = [
    { label: 'Receita Bruta',         key: 'receita_bruta' },
    { label: '(-) Deduções',          key: 'deducoes' },
    { label: '= Receita Líquida',     key: 'receita_liquida' },
    { label: '(-) Custos Diretos',    key: 'custos_diretos' },
    { label: '= Lucro Bruto',         key: 'lucro_bruto',        help: 'Margem Bruta %' },
    { label: '(-) Desp. Operac.',     key: 'despesas_operacionais' },
    { label: '= EBITDA',              key: 'ebitda',              help: 'Margem EBITDA %' },
    { label: '(-) Res. Financeiro',   key: 'resultado_financeiro' },
    { label: '(-) Impostos',          key: 'impostos' },
    { label: '= Resultado Líquido',   key: 'resultado_liquido',   help: 'Margem Líquida %' },
]

const PCT_MAP: Partial<Record<keyof DRESPELine, keyof DRESPELine>> = {
    lucro_bruto:        'margem_bruta_pct',
    ebitda:             'margem_ebitda_pct',
    resultado_liquido:  'margem_liquida_pct',
}

const DRESPEReport: React.FC<Props> = ({ organizationId }) => {
    const { showToast } = useToast()
    const now = new Date()
    const [dateFrom, setDateFrom] = React.useState(`${now.getFullYear()}-01-01`)
    const [dateTo,   setDateTo]   = React.useState(`${now.getFullYear()}-12-31`)
    const [regime, setRegime]     = React.useState<RegimeContabil>('CAIXA')
    const [data, setData]         = React.useState<DRESPELine[]>([])
    const [loading, setLoading]   = React.useState(false)

    const load = React.useCallback(async () => {
        setLoading(true)
        try {
            const rows = await financialReportService.getDRESPESummary(organizationId, dateFrom, dateTo, regime)
            setData(rows)
        } catch (e: unknown) {
            showToast('Erro ao carregar DRE por SPE', 'error')
            console.error('[DRE SPE]', e)
        } finally {
            setLoading(false)
        }
    }, [organizationId, dateFrom, dateTo, regime, showToast])

    React.useEffect(() => { load() }, [load])

    const isTotal = (col: keyof DRESPELine) => String(col).includes('liquida') || col === 'lucro_bruto' || col === 'ebitda' || col === 'resultado_liquido'
    const isDeduction = (col: keyof DRESPELine) => String(col).startsWith('deducoes') || String(col).startsWith('custos') || String(col).startsWith('despesas') || String(col).startsWith('impostos') || String(col).startsWith('resultado_financeiro')

    return (
        <div className="space-y-4 px-1">
            {/* Filtros */}
            <div className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">De</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Até</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                        className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Regime</label>
                    <select value={regime} onChange={e => setRegime(e.target.value as RegimeContabil)}
                        className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="CAIXA">Regime de Caixa</option>
                        <option value="COMPETENCIA">Regime de Competência</option>
                    </select>
                </div>
                <Button variant="primary" onClick={load} disabled={loading}>
                    {loading ? 'Carregando…' : 'Atualizar'}
                </Button>
                {data.length > 0 && (
                    <span className="ml-auto text-xs text-slate-400">
                        {data.length} empresa{data.length !== 1 ? 's' : ''} com movimentação
                    </span>
                )}
            </div>

            {/* Tabela comparativa */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : data.length === 0 ? (
                <div className="text-center py-20 text-slate-400 text-sm">
                    Nenhuma empresa com movimentação financeira vinculada a obras no período.
                    <p className="mt-2 text-xs">Certifique-se de que os projetos têm uma empresa/SPE associada.</p>
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-widest sticky left-0 bg-slate-50 min-w-[180px]">
                                    Linha DRE
                                </th>
                                {data.map(spe => (
                                    <th key={spe.empresa_id} className="px-4 py-3 text-xs font-black text-slate-600 uppercase tracking-widest text-right min-w-[160px]">
                                        {spe.empresa_nome}
                                        <span className="block text-slate-400 font-normal normal-case tracking-normal">
                                            {spe.n_transacoes} lançamentos
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {COLS.map(col => {
                                const pctKey = PCT_MAP[col.key]
                                const isTotalRow = isTotal(col.key)
                                return (
                                    <tr key={col.key} className={isTotalRow ? 'bg-slate-50/70' : 'hover:bg-blue-50/20'}>
                                        <td className={`px-5 py-2.5 sticky left-0 ${isTotalRow ? 'bg-slate-50/70' : 'bg-white'} text-form-label ${isTotalRow ? 'font-black text-slate-700' : isDeduction(col.key) ? 'text-slate-500 pl-8' : 'font-semibold text-slate-600'}`}>
                                            {col.label}
                                        </td>
                                        {data.map(spe => {
                                            const v = spe[col.key] as number
                                            const pct = pctKey ? spe[pctKey] as number | null : null
                                            const isNeg = v < 0
                                            return (
                                                <td key={spe.empresa_id} className="px-4 py-2.5 text-right tabular-nums">
                                                    <span className={`text-sm ${isTotalRow ? 'font-black' : 'font-medium'} ${isNeg ? 'text-red-600' : v > 0 && isTotalRow ? 'text-emerald-700' : 'text-slate-700'}`}>
                                                        {fmt(v)}
                                                    </span>
                                                    {pct !== null && (
                                                        <span className={`ml-2 text-xs font-semibold flex items-center justify-end gap-0.5 ${pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                            {pct >= 0
                                                                ? <TrendingUp className="w-3 h-3" />
                                                                : <TrendingDown className="w-3 h-3" />
                                                            }
                                                            {fmtPct(pct)}
                                                        </span>
                                                    )}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

export default DRESPEReport
