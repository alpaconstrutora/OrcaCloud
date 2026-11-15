import React from 'react'
import { financialReportService } from '../services/financialReportService'
import type { BalanceteLine, DREGroup } from '../types/financial'
import { useToast } from '../hooks/useToast'
import { formatMoney } from './ui/Format'
import { useResizableColumns } from './ui/TableUtils'
import { MoveHorizontal, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { useCargaVigente } from '../hooks/useCargaVigente'
import { motivoPeriodoInvalido } from '../utils/periodoControladoria'
import { FalhaDeCarga, PeriodoInvalido } from './controladoria/EstadosDaCarga'
import { BarraDeEscopo, BOTAO_DA_BARRA } from './controladoria/BarraDeEscopo'
import type { EscopoControladoria } from './controladoria/escopo'
import { baixarCSV } from './controladoria/csv'
import { AvisoSemClassificacao } from './controladoria/SemClassificacao'

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
    return 'text-gray-500 font-normal'
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
    escopo: EscopoControladoria
}

const BalanceteReport: React.FC<Props> = ({ organizationId, escopo }) => {
    const { showToast } = useToast()
    const { de: dateFrom, ate: dateTo, regime, obraId } = escopo
    const [lines, setLines] = React.useState<BalanceteLine[]>([])
    const [loading, setLoading] = React.useState(false)
    const [falhou, setFalhou] = React.useState(false)
    const [expanded, setExpanded] = React.useState<Set<DREGroup>>(new Set(GROUP_ORDER))
    const cols = useResizableColumns(BALANCETE_COL_WIDTHS, 'balanceteReportColWidths')
    const novaCarga = useCargaVigente()
    const motivoPeriodo = motivoPeriodoInvalido(dateFrom, dateTo)

    const load = React.useCallback(async () => {
        const vigente = novaCarga()
        if (motivoPeriodoInvalido(dateFrom, dateTo)) {
            setLines([]); setFalhou(false); setLoading(false)
            return
        }
        setLoading(true)
        setFalhou(false)
        try {
            const data = await financialReportService.getBalancete(organizationId, dateFrom, dateTo, obraId || undefined, regime)
            if (vigente()) setLines(data)
        } catch (e: unknown) {
            if (!vigente()) return
            setLines([])
            setFalhou(true)
            showToast('Erro ao carregar balancete', 'error')
            console.error('[Balancete]', e)
        } finally {
            if (vigente()) setLoading(false)
        }
    }, [novaCarga, organizationId, dateFrom, dateTo, obraId, regime, showToast])

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

    // Totais globais. `n` = TÍTULOS: a parcela com juros aparece em duas categorias
    // (venda + Receita Financeira) e contaria 2× — desconta a parte de juros. O
    // subtotal do grupo (abaixo) continua por categoria, como a própria linha.
    const totals = React.useMemo(() => lines.reduce(
        (acc, l) => ({
            creditos: acc.creditos + l.creditos,
            debitos:  acc.debitos  + l.debitos,
            saldo:    acc.saldo    + l.saldo_liquido,
            n:        acc.n        + l.n_transacoes - (l.n_partes_juros ?? 0),
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
        <div className="space-y-6">
            <BarraDeEscopo escopo={escopo} aplica={{ periodo: true, regime: null, obra: null }}>
                {lines.length > 0 && (
                    <span className="text-xs text-gray-600 pb-2.5">
                        {lines.length} contas · {totals.n.toLocaleString('pt-BR')} lançamentos
                    </span>
                )}
                <button type="button" disabled={lines.length === 0}
                    title={lines.length ? 'Baixar o balancete em CSV' : 'Sem contas para exportar'}
                    onClick={() => baixarCSV(`Balancete_${dateFrom}_${dateTo}.csv`,
                        ['Grupo', 'Conta', 'Créditos', 'Débitos', 'Saldo líquido', 'Lançamentos'],
                        lines.map(l => [GROUP_LABEL[l.dre_group as DREGroup] ?? l.dre_group, l.category_name, l.creditos, l.debitos, l.saldo_liquido, l.n_transacoes]))}
                    className={`${BOTAO_DA_BARRA} disabled:opacity-40 disabled:cursor-not-allowed`}>
                    <Download className="w-4 h-4" aria-hidden="true" /> CSV
                </button>
            </BarraDeEscopo>

            {/* Mesmo aviso da DRE: o grupo Sem Classificação leva aos lançamentos. */}
            {!motivoPeriodo && !loading && !falhou && (
                <AvisoSemClassificacao organizationId={organizationId} escopo={escopo}
                    realizado={(grouped.get('SEM_CLASSIFICACAO') ?? []).reduce((s, l) => s + l.saldo_liquido, 0)} />
            )}

            {/* Tabela */}
            {motivoPeriodo ? (
                <PeriodoInvalido motivo={motivoPeriodo} />
            ) : loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : falhou ? (
                <FalhaDeCarga oQue="o balancete" onRetry={load} />
            ) : lines.length === 0 ? (
                <div className="text-center py-20 text-slate-600 text-sm">
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
                    <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', minWidth: '100%', width: Object.keys(BALANCETE_COL_WIDTHS).reduce((s, k) => s + cols.getWidth(k), 0) }}>
                        <colgroup>
                            {Object.keys(BALANCETE_COL_WIDTHS).map(k => <col key={k} data-col-key={k} style={{ width: `${cols.getWidth(k)}px` }} />)}
                            <col />
                        </colgroup>
                        <thead>
                            <tr className="bg-white text-gray-700 border-b border-gray-200 text-xs font-semibold">
                                <th className="px-6 py-2 border-r border-gray-100 relative overflow-hidden">Conta / Categoria<cols.ResizeHandle colKey="conta" /></th>
                                <th className="px-6 py-2 border-r border-gray-100 text-right relative overflow-hidden">Créditos<cols.ResizeHandle colKey="creditos" /></th>
                                <th className="px-6 py-2 border-r border-gray-100 text-right relative overflow-hidden">Débitos<cols.ResizeHandle colKey="debitos" /></th>
                                <th className="px-6 py-2 border-r border-gray-100 text-right relative overflow-hidden">Saldo líquido<cols.ResizeHandle colKey="saldo" /></th>
                                <th className="px-6 py-2 border-r border-gray-100 text-right relative overflow-hidden">Lançamentos<cols.ResizeHandle colKey="lancamentos" /></th>
                                <th aria-hidden="true" />
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
                                            className="bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                                            onClick={() => toggleGroup(grp)}
                                            tabIndex={0}
                                            role="button"
                                            aria-expanded={open}
                                            onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleGroup(grp) } }}
                                        >
                                            <td className="px-6 py-2.5 border-r border-gray-100">
                                                <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                                                    {open
                                                        ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden="true" />
                                                        : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden="true" />}
                                                    {GROUP_LABEL[grp]}
                                                </span>
                                            </td>
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-right text-gray-800 tabular-nums">
                                                {fmt(sub.creditos)}
                                            </td>
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-right text-gray-800 tabular-nums">
                                                {fmt(sub.debitos)}
                                            </td>
                                            <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums ${colorSaldo(sub.saldo)}`}>
                                                {fmt(sub.saldo)}
                                            </td>
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-right text-gray-600 tabular-nums">
                                                {sub.n.toLocaleString('pt-BR')}
                                            </td>
                                            <td aria-hidden="true"></td>
                                        </tr>

                                        {/* Linhas de detalhe */}
                                        {open && grpLines.map((l, i) => (
                                            <tr key={l.category_id ?? `${grp}-${i}`}
                                                className="hover:bg-blue-50/30 transition-colors">
                                                <td className="px-6 py-2.5 pl-12 border-r border-gray-100 text-sm font-normal text-gray-700">
                                                    {l.category_name}
                                                </td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-right text-gray-800 tabular-nums">
                                                    {fmt(l.creditos)}
                                                </td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-right text-gray-800 tabular-nums">
                                                    {fmt(l.debitos)}
                                                </td>
                                                <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums ${colorSaldo(l.saldo_liquido)}`}>
                                                    {fmt(l.saldo_liquido)}
                                                </td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-right text-gray-600 tabular-nums">
                                                    {l.n_transacoes.toLocaleString('pt-BR')}
                                                </td>
                                                <td aria-hidden="true"></td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                )
                            })}
                        </tbody>

                        {/* Totais */}
                        <tfoot>
                            <tr className="border-t-2 border-gray-200 bg-gray-50">
                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-gray-900">
                                    Total geral
                                </td>
                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-right text-gray-900 tabular-nums">
                                    {fmt(totals.creditos)}
                                </td>
                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-right text-gray-900 tabular-nums">
                                    {fmt(totals.debitos)}
                                </td>
                                <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums ${colorSaldo(totals.saldo)}`}>
                                    {fmt(totals.saldo)}
                                </td>
                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-right text-gray-700 tabular-nums">
                                    {totals.n.toLocaleString('pt-BR')}
                                </td>
                                <td aria-hidden="true"></td>
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
