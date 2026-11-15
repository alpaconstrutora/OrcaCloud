import React from 'react';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Download } from 'lucide-react';
import { KpiCard } from './ui/KpiCard';
import { GRADE_DE_INDICADORES, tomDoSaldo } from './controladoria/indicadores';
import { baixarCSV } from './controladoria/csv';
import { financialReportService } from '../services/financialReportService';
import { useToast } from '../hooks/useToast';
import { useResizableColumns } from './ui/TableUtils';
import type { CashFlowSummary, CashFlowGranularity } from '../types/financial';
import { useCargaVigente } from '../hooks/useCargaVigente';
import { motivoPeriodoInvalido } from '../utils/periodoControladoria';
import { FalhaDeCarga, PeriodoInvalido } from './controladoria/EstadosDaCarga';
import { BarraDeEscopo, BOTAO_DA_BARRA, BotaoAutoAjuste } from './controladoria/BarraDeEscopo';
import type { EscopoControladoria } from './controladoria/escopo';

const CASHFLOW_COL_WIDTHS: Record<string, number> = { periodo: 160, entradas: 150, saidas: 150, saldo: 150, acumulado: 150 };

function formatBRL(v: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

/** Eixo em unidade compacta (§28.2): "R$ 12 mil", "R$ 1,2 mi". O valor exato fica
 *  no tooltip e na tabela. */
function formatBRLCompacto(v: number): string {
    const a = Math.abs(v);
    const sinal = v < 0 ? '-' : '';
    if (a >= 1_000_000) return `${sinal}R$ ${(a / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (a >= 1_000)     return `${sinal}R$ ${(a / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
    return formatBRL(v);
}

// Gráficos no vocabulário do §28: grade hairline sólida, eixos em #64748b, linhas de
// 2 px retas (curva suavizada inventa valores entre os períodos), colunas ≤ 24 px,
// legenda em HTML, ênfase de UM matiz (#3b82f6) + contexto cinza (#94a3b8, §28.4).
const COR = { principal: '#3b82f6', contexto: '#94a3b8', grade: '#f1f5f9', eixo: '#64748b' } as const;
const EIXO = { fontSize: 11, fill: COR.eixo };

const Dica = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-gray-200 rounded-[10px] shadow-lg px-3 py-2 text-xs space-y-1 min-w-[180px]">
            <p className="text-gray-500">{label}</p>
            {payload.map(p => (
                <div key={p.name} className="flex justify-between gap-4">
                    <span className="text-gray-500">{p.name}</span>
                    <span className="font-medium text-gray-800 tabular-nums">{formatBRL(p.value)}</span>
                </div>
            ))}
        </div>
    );
};

const Legenda: React.FC<{ itens: { nome: string; cor: string }[] }> = ({ itens }) => (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2" aria-hidden="true">
        {itens.map(i => (
            <span key={i.nome} className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: i.cor }} />
                {i.nome}
            </span>
        ))}
    </div>
);

interface CashFlowDashboardProps {
    organizationId: string | null;
    escopo: EscopoControladoria;
}

const CashFlowDashboard: React.FC<CashFlowDashboardProps> = ({ organizationId, escopo }) => {
    const { showToast } = useToast();
    const { de: dateFrom, ate: dateTo } = escopo;
    const idGranularidade = React.useId();
    const [granularity, setGranularity] = React.useState<CashFlowGranularity>('month');
    const [data, setData]   = React.useState<CashFlowSummary | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [falhou, setFalhou] = React.useState(false);
    const [chartMode, setChartMode] = React.useState<'acumulado' | 'periodo'>('acumulado');
    const cols = useResizableColumns(CASHFLOW_COL_WIDTHS, 'cashFlowReportColWidths');
    const novaCarga = useCargaVigente();
    const motivoPeriodo = motivoPeriodoInvalido(dateFrom, dateTo);

    const load = React.useCallback(async () => {
        const vigente = novaCarga();
        if (motivoPeriodoInvalido(dateFrom, dateTo)) {
            setData(null); setFalhou(false); setLoading(false);
            return;
        }
        setLoading(true);
        setFalhou(false);
        try {
            const d = await financialReportService.getCashFlow(organizationId, dateFrom, dateTo, granularity);
            if (vigente()) setData(d);
        } catch (e: unknown) {
            if (!vigente()) return;
            setData(null);
            setFalhou(true);
            showToast('Erro ao carregar fluxo de caixa', 'error');
            console.error('[CashFlow]', e);
        } finally {
            if (vigente()) setLoading(false);
        }
    }, [novaCarga, organizationId, dateFrom, dateTo, granularity, showToast]);

    React.useEffect(() => { load(); }, [load]);

    const chartData = React.useMemo(() => {
        if (!data) return [];
        return data.points.map(p => ({
            name:           p.period_label,
            'Entradas':     p.credit_real,
            'Saídas':       -p.debit_real,
            // Colunas lado a lado, as duas para cima: a altura compara o tamanho.
            SaidasPositivas: p.debit_real,
            'Saldo':        p.saldo_real,
            'Acumulado':    p.saldo_acumulado,
        }));
    }, [data]);

    const exportCSV = () => {
        if (!data) return;
        baixarCSV(`FluxoCaixa_${dateFrom}_${dateTo}.csv`,
            ['Período', 'Entradas', 'Saídas', 'Saldo', 'Acumulado', 'Pendente do período'],
            data.points.map(p => [p.period_label, p.credit_real, p.debit_real, p.saldo_real, p.saldo_acumulado, p.saldo_prev]));
    };

    return (
        <div className="space-y-6">
            <BarraDeEscopo escopo={escopo}
                aplica={{
                    periodo: true,
                    regime: 'O fluxo de caixa é sempre pelo caixa: realizado = conciliado, previsto = pendente.',
                    obra: 'O fluxo de caixa é da organização inteira: a consulta não separa por obra.',
                }}>
                <div className="space-y-1.5">
                    <label htmlFor={idGranularidade} className="block text-xs font-semibold text-slate-500">Agrupar por</label>
                    <select id={idGranularidade}
                        value={granularity}
                        onChange={e => setGranularity(e.target.value as CashFlowGranularity)}
                        className="h-9 px-3 pr-8 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="day">Dia</option>
                        <option value="week">Semana</option>
                        <option value="month">Mês</option>
                    </select>
                </div>
                <button type="button" onClick={exportCSV} disabled={!data}
                    title={data ? 'Baixar o fluxo de caixa em CSV' : 'Sem fluxo carregado para exportar'}
                    className={`${BOTAO_DA_BARRA} disabled:opacity-40 disabled:cursor-not-allowed`}>
                    <Download className="w-4 h-4" aria-hidden="true" /> CSV
                </button>
            </BarraDeEscopo>

            {motivoPeriodo ? (
                <PeriodoInvalido motivo={motivoPeriodo} />
            ) : loading ? (
                <div role="status" className="flex items-center justify-center h-40 text-sm text-gray-600">Carregando fluxo de caixa…</div>
            ) : falhou ? (
                <FalhaDeCarga oQue="o fluxo de caixa" onRetry={load} />
            ) : !data ? null : (
                <>
                    {/* Indicadores (§4.5): entradas e saídas neutras; saldo em alerta só abaixo
                        do limiar (LIMIAR.saldoAlerta). */}
                    <div className={GRADE_DE_INDICADORES}>
                        <KpiCard destaque label="Entradas" value={formatBRL(data.total_entradas)} sub="Conciliadas no período" />
                        <KpiCard destaque label="Saídas" value={formatBRL(data.total_saidas)} sub="Conciliadas no período" />
                        <KpiCard destaque label="Saldo realizado" value={formatBRL(data.saldo_final)}
                            sub="Entradas − saídas" tom={tomDoSaldo(data.saldo_final)} />
                        <KpiCard destaque label="Saldo com o previsto" value={formatBRL(data.saldo_previsto_final)}
                            sub="Realizado + pendentes do período" tom={tomDoSaldo(data.saldo_previsto_final)} />
                    </div>

                    {/* Gráfico (§28) */}
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-semibold text-gray-700">
                                    {chartMode === 'acumulado' ? 'Saldo acumulado' : 'Entradas e saídas por período'}
                                </h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {chartMode === 'acumulado'
                                        ? 'Entradas menos saídas conciliadas, somadas período a período. Os pendentes estão em "Saldo com o previsto".'
                                        : 'Valores conciliados em cada período.'}
                                </p>
                            </div>
                            <div className="flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1" role="group" aria-label="Forma do gráfico">
                                {(['acumulado', 'periodo'] as const).map(m => (
                                    <button key={m} type="button" onClick={() => setChartMode(m)} aria-pressed={chartMode === m}
                                        className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                            chartMode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}>
                                        {m === 'acumulado' ? 'Saldo acumulado' : 'Por período'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {chartData.length < 3 ? (
                            // Poucos pontos viram frase (§28.5): um ou dois períodos não fazem tendência.
                            <p className="min-h-[160px] flex items-center justify-center text-sm text-gray-500 text-center">
                                {chartData.length === 0
                                    ? 'Nenhuma movimentação no período.'
                                    : 'Poucos períodos para um gráfico: os valores estão na tabela abaixo.'}
                            </p>
                        ) : (
                            <>
                                {/* Série única (acumulado) não tem legenda: o título a nomeia (§28.3). */}
                                {chartMode === 'periodo' && (
                                    <Legenda itens={[{ nome: 'Entradas', cor: COR.principal }, { nome: 'Saídas', cor: COR.contexto }]} />
                                )}
                                <div className="mt-3" style={{ height: 280 }} role="img"
                                    aria-label={chartMode === 'acumulado'
                                        ? `Saldo acumulado: de ${formatBRL(chartData[0].Acumulado)} em ${chartData[0].name} a ${formatBRL(chartData[chartData.length - 1].Acumulado)} em ${chartData[chartData.length - 1].name}.`
                                        : `Entradas e saídas em ${chartData.length} períodos: ${formatBRL(data.total_entradas)} de entradas e ${formatBRL(data.total_saidas)} de saídas.`}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        {chartMode === 'acumulado' ? (
                                            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}>
                                                <CartesianGrid vertical={false} stroke={COR.grade} />
                                                <XAxis dataKey="name" tick={EIXO} tickLine={false} axisLine={false} />
                                                <YAxis tickFormatter={formatBRLCompacto} tick={EIXO} tickLine={false} axisLine={false} width={96} />
                                                <ReferenceLine y={0} stroke="#cbd5e1" />
                                                <Tooltip content={<Dica />} cursor={{ stroke: '#e2e8f0' }} />
                                                <Line type="linear" dataKey="Acumulado" stroke={COR.principal} strokeWidth={2} dot={false} isAnimationActive={false} />
                                            </LineChart>
                                        ) : (
                                            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}>
                                                <CartesianGrid vertical={false} stroke={COR.grade} />
                                                <XAxis dataKey="name" tick={EIXO} tickLine={false} axisLine={false} />
                                                <YAxis tickFormatter={formatBRLCompacto} tick={EIXO} tickLine={false} axisLine={false} width={96} />
                                                <Tooltip content={<Dica />} cursor={{ fill: '#f8fafc' }} />
                                                <Bar dataKey="Entradas" fill={COR.principal} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                                                <Bar dataKey="SaidasPositivas" name="Saídas" fill={COR.contexto} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                                            </BarChart>
                                        )}
                                    </ResponsiveContainer>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Tabela de períodos */}
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                            <h2 className="text-sm font-semibold text-gray-700">Detalhamento por período</h2>
                            <BotaoAutoAjuste onClick={() => cols.autoFit()} />
                        </div>
                        <div className="overflow-x-auto">
                            <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', minWidth: '100%', width: Object.keys(CASHFLOW_COL_WIDTHS).reduce((s, k) => s + cols.getWidth(k), 0) }}>
                                <colgroup>
                                    {Object.keys(CASHFLOW_COL_WIDTHS).map(k => <col key={k} data-col-key={k} style={{ width: `${cols.getWidth(k)}px` }} />)}
                                    <col />
                                </colgroup>
                                <thead>
                                    <tr className="bg-white text-gray-700 border-b border-gray-200 text-xs font-semibold">
                                        <th className="px-6 py-2 text-left border-r border-gray-100 relative overflow-hidden">Período<cols.ResizeHandle colKey="periodo" /></th>
                                        <th className="px-6 py-2 text-right border-r border-gray-100 relative overflow-hidden">Entradas<cols.ResizeHandle colKey="entradas" /></th>
                                        <th className="px-6 py-2 text-right border-r border-gray-100 relative overflow-hidden">Saídas<cols.ResizeHandle colKey="saidas" /></th>
                                        <th className="px-6 py-2 text-right border-r border-gray-100 relative overflow-hidden">Saldo<cols.ResizeHandle colKey="saldo" /></th>
                                        <th className="px-6 py-2 text-right border-r border-gray-100 relative overflow-hidden">Acumulado<cols.ResizeHandle colKey="acumulado" /></th>
                                        <th aria-hidden="true" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {data.points.map(p => (
                                        <tr key={p.period_label} className="hover:bg-blue-50/50 transition-colors">
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">{p.period_label}</td>
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums text-gray-800 font-medium">{formatBRL(p.credit_real)}</td>
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums text-gray-800 font-medium">{formatBRL(p.debit_real)}</td>
                                            <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium ${p.saldo_real >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                                                {formatBRL(p.saldo_real)}
                                            </td>
                                            <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium ${p.saldo_acumulado >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                                                {formatBRL(p.saldo_acumulado)}
                                            </td>
                                            <td aria-hidden="true"></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default CashFlowDashboard;
