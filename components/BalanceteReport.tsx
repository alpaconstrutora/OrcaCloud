import React from 'react'
import { financialReportService } from '../services/financialReportService'
import type { BalanceteLine, DREGroup, RegimeContabil } from '../types/financial'
import { useToast } from '../hooks/useToast'
import Button from './ui/Button'
import { formatMoney } from './ui/Format'
import { useResizableColumns } from './ui/TableUtils'
import { MoveHorizontal } from 'lucide-react'

const BALANCETE_COL_WIDTHS: Record<string, number> = { conta: 260, creditos: 150, debitos: 150, saldo: 150, lancamentos: 130 }

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
    // Movimento patrimonial. No balancete ELES APARECEM (é a natureza do
    // relatório mostrar movimento de passivo/ativo) — o que foi corrigido em
    // aplicar_20270915000003 é a DRE, que não pode contá-los como resultado.
    PASSIVO:             'Movimento de Passivo',
    ATIVO:               'Movimento de Ativo',
    SEM_CLASSIFICACAO:   'Sem Classificação',
}

const GROUP_ORDER: DREGroup[] = [
    'RECEITA_BRUTA', 'DEDUCOES', 'CUSTO_OBRA', 'CUSTO_SERVICO',
    'DESPESA_ADM', 'DESPESA_COMERCIAL', 'FINANCEIRO',
    'IMPOSTOS', 'NAO_OPERACIONAL', 'PASSIVO', 'ATIVO', 'SEM_CLASSIFICACAO',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = formatMoney

function colorSaldo(v: number) {
    if (v > 0) return 'text-emerald-700 font-medium'
    if (v < 0) return 'text-red-600 font-medium'
    return 'text-slate-400 font-normal'
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
    organizationId: string | null
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
    const cols = useResizableColumns(BALANCETE_COL_WIDTHS, 'balanceteReportColWidths')

    const load = React.useCallback(async () => {
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
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">De</label>
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Até</label>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Regime</label>
                    <select
                        value={regime}
                        onChange={e => setRegime(e.target.value as RegimeContabil)}
                        className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="CAIXA">Caixa</option>
                        <option value="COMPETENCIA">Competência</option>
                    </select>
                </div>
                <Button
                    onClick={load}
                    disabled={loading}
                >
                    {loading ? 'Carregando…' : 'Atualizar'}
                </Button>
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
                <div className="bg-white border border-slate-200 rounded-[10px] shadow-sm overflow-hidden">
                    <div className="flex justify-end p-2 border-b border-slate-100">
                        <button onClick={() => cols.autoFit()} className="p-1.5 rounded-[6px] text-slate-400 hover:text-slate-600 transition-all" title="Ajustar largura das colunas ao conteúdo">
                            <MoveHorizontal className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                    <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: Object.keys(BALANCETE_COL_WIDTHS).reduce((s, k) => s + cols.getWidth(k), 0) }}>
                        <colgroup>
                            {Object.keys(BALANCETE_COL_WIDTHS).map(k => <col key={k} data-col-key={k} style={{ width: `${cols.getWidth(k)}px` }} />)}
                        </colgroup>
                        <thead>
                            <tr className="bg-gray-50 text-gray-500 border-b border-gray-200 text-xs font-semibold">
                                <th className="px-6 py-2 border-r border-gray-100 relative overflow-hidden">Conta / Categoria<cols.ResizeHandle colKey="conta" /></th>
                                <th className="px-6 py-2 border-r border-gray-100 text-right relative overflow-hidden">Créditos<cols.ResizeHandle colKey="creditos" /></th>
                                <th className="px-6 py-2 border-r border-gray-100 text-right relative overflow-hidden">Débitos<cols.ResizeHandle colKey="debitos" /></th>
                                <th className="px-6 py-2 border-r border-gray-100 text-right relative overflow-hidden">Saldo Líquido<cols.ResizeHandle colKey="saldo" /></th>
                                <th className="px-6 py-2 text-right relative overflow-hidden">Lançamentos<cols.ResizeHandle colKey="lancamentos" /></th>
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
                                                <span className="text-sm font-medium text-slate-600">
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
                                <td className="px-5 py-3 text-sm font-medium text-slate-700">
                                    Total Geral
                                </td>
                                <td className="px-4 py-3 text-sm font-medium text-right text-slate-700 tabular-nums">
                                    {fmt(totals.creditos)}
                                </td>
                                <td className="px-4 py-3 text-sm font-medium text-right text-slate-700 tabular-nums">
                                    {fmt(totals.debitos)}
                                </td>
                                <td className={`px-4 py-3 text-sm text-right tabular-nums ${colorSaldo(totals.saldo)}`}>
                                    {fmt(totals.saldo)}
                                </td>
                                <td className="px-4 py-3 text-sm font-medium text-right text-slate-500 tabular-nums">
                                    {totals.n.toLocaleString('pt-BR')}
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

export default BalanceteReport
