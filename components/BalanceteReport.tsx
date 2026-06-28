import React from 'react'
import { financialReportService } from '../services/financialReportService'
import type { BalanceteLine, DREGroup, RegimeContabil } from '../types/financial'
import { useToast } from '../hooks/useToast'

// ── Labels ────────────────────────────────────────────────────────────────────

const GROUP_LABEL: Record<DREGroup, string> = {
    RECEITA_BRUTA:       'Receita Bruta',
    DEDUCOES:            'Deduções',
    CUSTO_OBRA:          'Custos de Obra',
    CUSTO_SERVICO:       'Custos de Serviço',
    DESPESA_ADM:         'Despesas Administrativas',
    DESPESA_COMERCIAL:   'Despesas Comerciais',
    FINANCEIRO:          'Resultado Financeiro',
    IMPOSTOS:            'Impostos sobre o Resultado',
    NAO_OPERACIONAL:     'Não Operacional',
    SEM_CLASSIFICACAO:   'Sem Classificação',
}

const GROUP_ORDER: DREGroup[] = [
    'RECEITA_BRUTA', 'DEDUCOES', 'CUSTO_OBRA', 'CUSTO_SERVICO',
    'DESPESA_ADM', 'DESPESA_COMERCIAL', 'FINANCEIRO',
    'IMPOSTOS', 'NAO_OPERACIONAL', 'SEM_CLASSIFICACAO',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function colorSaldo(v: number) {
    if (v > 0) return 'text-emerald-700 font-semibold'
    if (v < 0) return 'text-red-600 font-semibold'
    return 'text-slate-400'
}

// ── Tipos internos ────────────────────────────────────────────────────────────

interface GroupSubtotal {
    creditos: number
    debitos: number
    saldo: number
    n: number
}

// ── Componente ────────────────────────────────────────────────────────────────

interface Props {
    organizationId: string
}

const BalanceteReport: React.FC<Props> = ({ organizationId }) => {
    const { showToast } = useToast()
    const now = new Date()
    const [dateFrom, setDateFrom] = React.useState(`${now.getFullYear()}-01-01`)
    const [dateTo,   setDateTo]   = React.useState(`${now.getFullYear()}-12-31`)
    const [regime,   setRegime]   = React.useState<RegimeContabil>('CAIXA')
    const [lines, setLines] = React.useState<BalanceteLine[]>([])
    const [loading, setLoading] = React.useState(false)
    const [expanded, setExpanded] = React.useState<Set<DREGroup>>(new Set(GROUP_ORDER))

    const load = React.useCallback(async () => {
        if (!organizationId) return
        setLoading(true)
        try {
            const data = await financialReportService.getBalancete(organizationId, dateFrom, dateTo, undefined, regime)
            setLines(data)
        } catch (e: unknown) {
            showToast('Erro ao carregar balancete', 'error')
            console.error('[Balancete]', e)
        } finally {
            setLoading(false)
        }
    }, [organizationId, dateFrom, dateTo, regime, showToast])

    React.useEffect(() => { load() }, [load])

    // Agrupar por dre_group
    const grouped = React.useMemo(() => {
        const map = new Map<DREGroup, BalanceteLine[]>()
        for (const line of lines) {
            const g = line.dre_group as DREGroup
            if (!map.has(g)) map.set(g, [])
            map.get(g)!.push(line)
        }
        return map
    }, [lines])

    // Totais globais
    const totals = React.useMemo(() => lines.reduce(
        (acc, l) => ({
            creditos: acc.creditos + l.creditos,
            debitos:  acc.debitos  + l.debitos,
            saldo:    acc.saldo    + l.saldo_liquido,
            n:        acc.n        + l.n_transacoes,
        }),
        { creditos: 0, debitos: 0, saldo: 0, n: 0 }
    ), [lines])

    const toggleGroup = (g: DREGroup) =>
        setExpanded(prev => {
            const next = new Set(prev)
            next.has(g) ? next.delete(g) : next.add(g)
            return next
        })

    const subtotal = (grpLines: BalanceteLine[]): GroupSubtotal =>
        grpLines.reduce(
            (acc, l) => ({
                creditos: acc.creditos + l.creditos,
                debitos:  acc.debitos  + l.debitos,
                saldo:    acc.saldo    + l.saldo_liquido,
                n:        acc.n        + l.n_transacoes,
            }),
            { creditos: 0, debitos: 0, saldo: 0, n: 0 }
        )

    return (
        <div className="space-y-4 px-1">
            {/* Filtros */}
            <div className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">De</label>
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Até</label>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Regime</label>
                    <select
                        value={regime}
                        onChange={e => setRegime(e.target.value as RegimeContabil)}
                        className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="CAIXA">Caixa</option>
                        <option value="COMPETENCIA">Competência</option>
                    </select>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-button font-black uppercase tracking-widest rounded-xl transition-colors"
                >
                    {loading ? 'Carregando…' : 'Atualizar'}
                </button>
                {lines.length > 0 && (
                    <span className="ml-auto text-xs text-slate-400">
                        {lines.length} contas · {totals.n.toLocaleString('pt-BR')} lançamentos
                    </span>
                )}
            </div>

            {/* Tabela */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : lines.length === 0 ? (
                <div className="text-center py-20 text-slate-400 text-sm">
                    Nenhum lançamento encontrado para o período selecionado.
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                <th className="px-5 py-3">Conta / Categoria</th>
                                <th className="px-4 py-3 text-right">Créditos</th>
                                <th className="px-4 py-3 text-right">Débitos</th>
                                <th className="px-4 py-3 text-right">Saldo Líquido</th>
                                <th className="px-4 py-3 text-right">Lançamentos</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {GROUP_ORDER.map(grp => {
                                const grpLines = grouped.get(grp)
                                if (!grpLines) return null
                                const sub = subtotal(grpLines)
                                const open = expanded.has(grp)
                                return (
                                    <React.Fragment key={grp}>
                                        {/* Linha de grupo */}
                                        <tr
                                            className="bg-slate-50/80 cursor-pointer hover:bg-slate-100 transition-colors"
                                            onClick={() => toggleGroup(grp)}
                                        >
                                            <td className="px-5 py-2.5 flex items-center gap-2">
                                                <span className="text-slate-400 text-xs select-none">
                                                    {open ? '▾' : '▸'}
                                                </span>
                                                <span className="text-xs font-black text-slate-600 uppercase tracking-wider">
                                                    {GROUP_LABEL[grp]}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-table-body text-right text-slate-500 tabular-nums">
                                                {fmt(sub.creditos)}
                                            </td>
                                            <td className="px-4 py-2.5 text-table-body text-right text-slate-500 tabular-nums">
                                                {fmt(sub.debitos)}
                                            </td>
                                            <td className={`px-4 py-2.5 text-form-label text-right tabular-nums ${colorSaldo(sub.saldo)}`}>
                                                {fmt(sub.saldo)}
                                            </td>
                                            <td className="px-4 py-2.5 text-table-body text-right text-slate-400">
                                                {sub.n.toLocaleString('pt-BR')}
                                            </td>
                                        </tr>

                                        {/* Linhas de detalhe */}
                                        {open && grpLines.map((l, i) => (
                                            <tr key={l.category_id ?? `${grp}-${i}`}
                                                className="hover:bg-blue-50/30 transition-colors">
                                                <td className="px-5 py-2 pl-11 text-sm text-slate-700">
                                                    {l.category_name}
                                                </td>
                                                <td className="px-4 py-2 text-sm text-right text-slate-600 tabular-nums">
                                                    {fmt(l.creditos)}
                                                </td>
                                                <td className="px-4 py-2 text-sm text-right text-slate-600 tabular-nums">
                                                    {fmt(l.debitos)}
                                                </td>
                                                <td className={`px-4 py-2 text-sm text-right tabular-nums ${colorSaldo(l.saldo_liquido)}`}>
                                                    {fmt(l.saldo_liquido)}
                                                </td>
                                                <td className="px-4 py-2 text-sm text-right text-slate-400 tabular-nums">
                                                    {l.n_transacoes.toLocaleString('pt-BR')}
                                                </td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                )
                            })}
                        </tbody>

                        {/* Totais */}
                        <tfoot>
                            <tr className="border-t-2 border-slate-200 bg-slate-50">
                                <td className="px-5 py-3 text-table-body font-black text-slate-700 uppercase tracking-widest">
                                    Total Geral
                                </td>
                                <td className="px-4 py-3 text-sm font-bold text-right text-slate-700 tabular-nums">
                                    {fmt(totals.creditos)}
                                </td>
                                <td className="px-4 py-3 text-sm font-bold text-right text-slate-700 tabular-nums">
                                    {fmt(totals.debitos)}
                                </td>
                                <td className={`px-4 py-3 text-sm text-right tabular-nums font-black ${colorSaldo(totals.saldo)}`}>
                                    {fmt(totals.saldo)}
                                </td>
                                <td className="px-4 py-3 text-sm font-bold text-right text-slate-500 tabular-nums">
                                    {totals.n.toLocaleString('pt-BR')}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    )
}

export default BalanceteReport
