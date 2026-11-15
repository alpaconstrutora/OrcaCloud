import React from 'react'
import { financialReportService } from '../services/financialReportService'
import type { WIPLine } from '../types/financial'
import { useToast } from '../hooks/useToast'
import { TrendingUp, TrendingDown, AlertTriangle, Download } from 'lucide-react'
import { formatMoney, formatPercent } from './ui/Format'
import { useResizableColumns, SortableHeader } from './ui/TableUtils'
import { useCargaVigente } from '../hooks/useCargaVigente'
import { motivoDataInvalida } from '../utils/periodoControladoria'
import { FalhaDeCarga, PeriodoInvalido } from './controladoria/EstadosDaCarga'
import { BarraDeEscopo, BOTAO_DA_BARRA, BotaoAutoAjuste } from './controladoria/BarraDeEscopo'
import type { EscopoControladoria } from './controladoria/escopo'
import { KpiCard } from './ui/KpiCard'
import { GRADE_DE_INDICADORES, pctBR, tomDoResultado } from './controladoria/indicadores'
import { baixarCSV } from './controladoria/csv'

const WIP_COL_WIDTHS: Record<string, number> = {
    // Soma 1.100 px: cabe na área de 1.124 px a 1440 (sidebar aberta) sem rolar.
    project_name: 220, empresa_nome: 150, contrato_valor: 140, receita_reconhecida: 150,
    custo_incorrido: 140, margem_bruta: 150, saldo_contrato: 150,
}

const fmt = formatMoney
const fmtPct = (v: number | null) => formatPercent(v, { asPoints: true, decimals: 1 })

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

    // Cabeçalho ordenável = o SortableHeader do app (§6.8): botão no <th> (Tab, Enter,
    // Espaço), aria-sort, ícone desenhado. Antes era <th onClick> com setas "↕" em texto
    // a 1,42:1 — só o mouse ordenava e o leitor de tela não sabia a ordem.
    // Função, não componente: um componente declarado aqui dentro seria um TIPO novo a
    // cada render — o React remontaria o <th> ao ordenar e o foco do teclado se perderia.
    const th = (label: string, k: keyof WIPLine, right?: boolean) => (
        <SortableHeader
            key={k}
            label={label}
            colKey={k}
            uppercase={false}
            sortColumn={sortKey}
            sortDirection={sortAsc ? 'asc' : 'desc'}
            onSort={key => handleSort(key as keyof WIPLine)}
            className={`px-6 py-2 border-r border-gray-100 text-xs overflow-hidden ${right ? '[&>button]:justify-end' : ''}`}
        >
            <cols.ResizeHandle colKey={k} />
        </SortableHeader>
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
                <button type="button" disabled={rows.length === 0}
                    title={rows.length ? 'Baixar o WIP em CSV' : 'Sem obras para exportar'}
                    onClick={() => baixarCSV(`WIP_${dateTo}.csv`,
                        ['Obra', 'Código', 'Empresa', 'Valor do contrato', 'Receita recebida', 'Receita pendente', 'Custo pago', 'Custo pendente', 'Recebido − pago', 'Saldo de contrato'],
                        sorted.map(r => [r.project_name, r.project_code, r.empresa_nome, r.contrato_valor, r.receita_reconhecida, r.receitas_pendentes, r.custo_incorrido, r.custos_pendentes, r.margem_bruta, r.saldo_contrato]))}
                    className={`${BOTAO_DA_BARRA} disabled:opacity-40 disabled:cursor-not-allowed`}>
                    <Download className="w-4 h-4" aria-hidden="true" /> CSV
                </button>
            </BarraDeEscopo>

            {/* Indicadores (§4.5): neutros; alerta só por limiar (LIMIAR). */}
            {rows.length > 0 && (
                <div className={GRADE_DE_INDICADORES}>
                    <KpiCard destaque label="Receita recebida" value={fmt(totals.receita_reconhecida)}
                        sub={`+ ${fmt(totals.receitas_pendentes)} pendente`} />
                    <KpiCard destaque label="Custo pago" value={fmt(totals.custo_incorrido)}
                        sub={`+ ${fmt(totals.custos_pendentes)} pendente`} />
                    <KpiCard destaque label="Recebido − pago" value={fmt(totals.margem_bruta)}
                        sub={totalMargem === null ? 'Sem receita recebida: sem margem' : `Margem ${pctBR(totalMargem)}`}
                        tom={tomDoResultado(totals.margem_bruta)} />
                    <KpiCard destaque label="Saldo de contrato" value={fmt(totals.saldo_contrato)}
                        sub="Contratado ainda não recebido"
                        tom={totals.saldo_contrato < 0 ? 'atencao' : 'neutro'}
                        title={totals.saldo_contrato < 0 ? 'Recebido acima do valor do contrato: confira o contrato ou os recebimentos' : undefined} />
                </div>
            )}

            {/* Tabela */}
            {motivoPeriodo ? (
                <PeriodoInvalido motivo={motivoPeriodo} />
            ) : loading ? (
                <div className="flex items-center justify-center py-20" role="status" aria-label="Carregando">
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
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
                        <BotaoAutoAjuste onClick={() => cols.autoFit()} />
                    </div>
                    <div className="overflow-x-auto">
                    <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', minWidth: '100%', width: Object.keys(WIP_COL_WIDTHS).reduce((s, k) => s + cols.getWidth(k), 0) }}>
                        <colgroup>
                            {Object.keys(WIP_COL_WIDTHS).map(k => <col key={k} data-col-key={k} style={{ width: `${cols.getWidth(k)}px` }} />)}
                            <col />
                        </colgroup>
                        <thead>
                            <tr className="bg-white text-gray-700 border-b border-gray-200">
                                {th('Obra', 'project_name')}
                                {th('Empresa', 'empresa_nome')}
                                {th('Valor do contrato', 'contrato_valor', true)}
                                {th('Receita recebida', 'receita_reconhecida', true)}
                                {th('Custo pago', 'custo_incorrido', true)}
                                {th('Recebido − pago', 'margem_bruta', true)}
                                {th('Saldo de contrato', 'saldo_contrato', true)}
                                <th aria-hidden="true" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {sorted.map(r => {
                                const margem = r.margem_bruta
                                const isNegMargem = margem < 0
                                return (
                                    <tr key={r.project_id} className="hover:bg-blue-50/30 transition-colors">
                                        <td className="px-6 py-2.5 border-r border-gray-100">
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
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-slate-500">
                                            {r.empresa_nome ?? '—'}
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums text-slate-600">
                                            {r.contrato_valor > 0 ? fmt(r.contrato_valor) : '—'}
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums text-emerald-700 font-semibold">
                                            {fmt(r.receita_reconhecida)}
                                            {r.receitas_pendentes > 0 && (
                                                <span className="block text-xs font-normal text-gray-500">
                                                    +{fmt(r.receitas_pendentes)} pend.
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums text-red-600">
                                            {fmt(r.custo_incorrido)}
                                            {r.custos_pendentes > 0 && (
                                                <span className="block text-xs font-normal text-gray-500">
                                                    +{fmt(r.custos_pendentes)} pend.
                                                </span>
                                            )}
                                        </td>
                                        <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-semibold ${isNegMargem ? 'text-red-600' : 'text-emerald-700'}`}>
                                            <span className="flex items-center justify-end gap-1">
                                                {isNegMargem
                                                    ? <AlertTriangle className="w-3 h-3 shrink-0" />
                                                    : r.margem_pct !== null && r.margem_pct > 20
                                                        ? <TrendingUp className="w-3 h-3 shrink-0" />
                                                        : <TrendingDown className="w-3 h-3 shrink-0" />
                                                }
                                                {fmt(margem)}
                                            </span>
                                            <span className={`block text-xs font-normal ${isNegMargem ? 'text-red-500' : 'text-gray-500'}`}>
                                                {fmtPct(r.margem_pct)}
                                            </span>
                                        </td>
                                        <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums ${r.saldo_contrato < 0 ? 'text-amber-600 font-semibold' : 'text-slate-600'}`}>
                                            {r.contrato_valor > 0 ? fmt(r.saldo_contrato) : '—'}
                                        </td>
                                        <td aria-hidden="true"></td>
                                    </tr>
                                )
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-slate-200 bg-gray-50">
                                <td colSpan={2} className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-slate-600">
                                    Total ({rows.length} {rows.length === 1 ? 'obra' : 'obras'})
                                </td>
                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-right tabular-nums text-slate-700">
                                    {fmt(totals.contrato_valor)}
                                </td>
                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-right tabular-nums text-emerald-700">
                                    {fmt(totals.receita_reconhecida)}
                                </td>
                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-right tabular-nums text-red-600">
                                    {fmt(totals.custo_incorrido)}
                                </td>
                                <td className={`px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-right tabular-nums ${totals.margem_bruta >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                    {fmt(totals.margem_bruta)}
                                    <span className="block text-xs font-normal text-gray-500">{fmtPct(totalMargem)}</span>
                                </td>
                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-right tabular-nums text-slate-700">
                                    {fmt(totals.saldo_contrato)}
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

export default WIPReport
