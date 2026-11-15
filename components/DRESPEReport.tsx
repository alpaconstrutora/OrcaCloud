import React from 'react'
import { financialReportService } from '../services/financialReportService'
import type { DRESPELine } from '../types/financial'
import { useToast } from '../hooks/useToast'
import { Download } from 'lucide-react'
import { useResizableColumns } from './ui/TableUtils'
import { useCargaVigente } from '../hooks/useCargaVigente'
import { motivoPeriodoInvalido } from '../utils/periodoControladoria'
import { FalhaDeCarga, PeriodoInvalido } from './controladoria/EstadosDaCarga'
import { BarraDeEscopo, BOTAO_DA_BARRA, BotaoAutoAjuste } from './controladoria/BarraDeEscopo'
import type { EscopoControladoria } from './controladoria/escopo'
import { baixarCSV } from './controladoria/csv'
import { tomDoResultado } from './controladoria/indicadores'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (v: number | null) => v === null ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

/** Toda SPE com movimento, mas tudo zero? Em Caixa isso quase sempre é "nada conciliado". */
function semResultadoNoPeriodo(data: DRESPELine[]): boolean {
    return data.length > 0 && data.every(spe =>
        COLS.every(c => (spe[c.key] as number) === 0))
}

interface Props {
    organizationId: string | null
    escopo: EscopoControladoria
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

const DRESPEReport: React.FC<Props> = ({ organizationId, escopo }) => {
    const { showToast } = useToast()
    const { de: dateFrom, ate: dateTo, regime } = escopo
    const [data, setData]         = React.useState<DRESPELine[]>([])
    const [loading, setLoading]   = React.useState(false)
    const [falhou, setFalhou]     = React.useState(false)
    // §6.1 — colunas dinâmicas (1 por SPE); largura padrão 180px, ajustável por empresa.
    const cols = useResizableColumns({}, 'drespeReportColWidths', { min: 140, max: 400 })
    const novaCarga = useCargaVigente()
    const motivoPeriodo = motivoPeriodoInvalido(dateFrom, dateTo)

    const load = React.useCallback(async () => {
        const vigente = novaCarga()
        if (motivoPeriodoInvalido(dateFrom, dateTo)) {
            setData([]); setFalhou(false); setLoading(false)
            return
        }
        setLoading(true)
        setFalhou(false)
        try {
            const rows = await financialReportService.getDRESPESummary(organizationId, dateFrom, dateTo, regime)
            if (vigente()) setData(rows)
        } catch (e: unknown) {
            if (!vigente()) return
            setData([])
            setFalhou(true)
            showToast('Erro ao carregar DRE por SPE', 'error')
            console.error('[DRE SPE]', e)
        } finally {
            if (vigente()) setLoading(false)
        }
    }, [novaCarga, organizationId, dateFrom, dateTo, regime, showToast])

    React.useEffect(() => { load() }, [load])

    const isTotal = (col: keyof DRESPELine) => String(col).includes('liquida') || col === 'lucro_bruto' || col === 'ebitda' || col === 'resultado_liquido'
    const isDeduction = (col: keyof DRESPELine) => String(col).startsWith('deducoes') || String(col).startsWith('custos') || String(col).startsWith('despesas') || String(col).startsWith('impostos') || String(col).startsWith('resultado_financeiro')

    return (
        <div className="space-y-6">
            <BarraDeEscopo escopo={escopo}
                aplica={{ periodo: true, regime: null, obra: 'A DRE por SPE já separa o resultado por empresa: o filtro de obra não se aplica.' }}>
                {data.length > 0 && (
                    <span className="text-xs text-gray-600 pb-2.5">
                        {data.length} empresa{data.length !== 1 ? 's' : ''} com movimentação
                    </span>
                )}
                <button type="button" disabled={data.length === 0}
                    title={data.length ? 'Baixar a DRE por SPE em CSV' : 'Sem empresas para exportar'}
                    onClick={() => baixarCSV(`DRE_SPE_${dateFrom}_${dateTo}.csv`,
                        ['Linha', ...data.map(spe => spe.empresa_nome)],
                        COLS.map(c => [c.label, ...data.map(spe => spe[c.key] as number)]))}
                    className={`${BOTAO_DA_BARRA} disabled:opacity-40 disabled:cursor-not-allowed`}>
                    <Download className="w-4 h-4" aria-hidden="true" /> CSV
                </button>
            </BarraDeEscopo>

            {/* Tabela comparativa */}
            {motivoPeriodo ? (
                <PeriodoInvalido motivo={motivoPeriodo} />
            ) : loading ? (
                <div className="flex items-center justify-center py-20" role="status" aria-label="Carregando">
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                </div>
            ) : falhou ? (
                <FalhaDeCarga oQue="a DRE por SPE" onRetry={load} />
            ) : data.length === 0 ? (
                <div className="text-center py-20 text-gray-600 text-sm">
                    Nenhuma empresa com movimentação financeira vinculada a obras no período.
                    <p className="mt-2 text-xs text-gray-500">Certifique-se de que os projetos têm uma empresa/SPE associada.</p>
                </div>
            ) : (
                <>
                {/* Explica o "tudo zero" em vez de deixar a SPE parecer errada ao lado da DRE. */}
                {semResultadoNoPeriodo(data) && (
                    <p role="status" className="text-sm text-gray-600 bg-white border border-gray-100 rounded-[10px] px-4 py-3">
                        {regime === 'CAIXA'
                            ? 'Nenhum lançamento conciliado nas obras das SPEs neste período: no regime de Caixa só entra o que já foi conciliado. Em Competência, os lançamentos contam pela data de competência.'
                            : 'Os lançamentos das SPEs neste período não têm valor na DRE (sem categoria de resultado ou só movimento de passivo/ativo).'}
                        {' '}A DRE geral também soma obras sem SPE e lançamentos sem obra.
                    </p>
                )}
                <div className="bg-white border border-gray-200 rounded-[10px] shadow-sm overflow-hidden">
                    <div className="flex justify-end p-2 border-b border-gray-100">
                        <BotaoAutoAjuste onClick={() => cols.autoFit()} />
                    </div>
                    <div className="overflow-x-auto">
                    <table
                        ref={cols.tableRef}
                        className="text-left border-collapse"
                        style={{ tableLayout: 'fixed', minWidth: '100%', width: 220 + data.reduce((s, spe) => s + cols.getWidth(spe.empresa_id), 0) }}
                    >
                        <colgroup>
                            <col style={{ width: '220px' }} />
                            {data.map(spe => <col key={spe.empresa_id} data-col-key={spe.empresa_id} style={{ width: `${cols.getWidth(spe.empresa_id)}px` }} />)}
                            <col />
                        </colgroup>
                        <thead>
                            <tr className="bg-white border-b border-gray-200">
                                <th className="px-6 py-2 border-r border-gray-100 text-xs font-semibold text-gray-700 sticky left-0 bg-white">
                                    Linha da DRE
                                </th>
                                {data.map(spe => (
                                    <th key={spe.empresa_id} className="px-6 py-2 border-r border-gray-100 text-xs font-semibold text-gray-700 text-right relative overflow-hidden">
                                        {spe.empresa_nome}
                                        <span className="block text-gray-500 font-normal">
                                            {spe.n_transacoes} lançamentos
                                        </span>
                                        <cols.ResizeHandle colKey={spe.empresa_id} />
                                    </th>
                                ))}
                                <th aria-hidden="true" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {COLS.map(col => {
                                const pctKey = PCT_MAP[col.key]
                                const isTotalRow = isTotal(col.key)
                                return (
                                    <tr key={col.key} className={isTotalRow ? 'bg-gray-50' : 'hover:bg-blue-50/20'}>
                                        <td className={`px-6 py-2.5 border-r border-gray-100 sticky left-0 text-sm ${isTotalRow ? 'bg-gray-50 font-medium text-gray-900' : 'bg-white'} ${!isTotalRow && isDeduction(col.key) ? 'text-gray-700 pl-10 font-normal' : !isTotalRow ? 'font-normal text-gray-700' : ''}`}>
                                            {col.label}
                                        </td>
                                        {data.map(spe => {
                                            const v = spe[col.key] as number
                                            const pct = pctKey ? spe[pctKey] as number | null : null
                                            // Cor por estado (§4.5): vermelho só no TOTAL abaixo do limiar;
                                            // dedução e custo negativos são o normal, não alarme. Sem seta:
                                            // margem é posição, não tendência.
                                            const alerta = isTotalRow && tomDoResultado(v) === 'alerta'
                                            return (
                                                <td key={spe.empresa_id} className="px-6 py-2.5 border-r border-gray-100 text-right tabular-nums">
                                                    <span className={`text-sm font-medium ${alerta ? 'text-red-700' : isTotalRow ? 'text-gray-900' : 'text-gray-800'}`}>
                                                        {fmt(v)}
                                                    </span>
                                                    {pct !== null && (
                                                        <span className={`block text-xs font-normal ${pct < 0 ? 'text-red-700' : 'text-gray-600'}`}>
                                                            {fmtPct(pct)}
                                                        </span>
                                                    )}
                                                </td>
                                            )
                                        })}
                                        <td aria-hidden="true"></td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                    </div>
                </div>
                </>
            )}
        </div>
    )
}

export default DRESPEReport
