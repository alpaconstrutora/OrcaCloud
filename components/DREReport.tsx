import React from 'react';
import { TrendingUp, TrendingDown, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { financialReportService } from '../services/financialReportService';
import { useToast } from '../hooks/useToast';
import type { DRESummary, DRELine, DREGroup } from '../types/financial';

// ── Labels e ordem dos grupos ─────────────────────────────────────────────────

const DRE_GROUP_LABELS: Record<DREGroup, string> = {
    RECEITA_BRUTA:       'Receita Bruta',
    DEDUCOES:            'Deduções',
    CUSTO_OBRA:          'Custos de Obra',
    CUSTO_SERVICO:       'Custos de Serviços',
    DESPESA_ADM:         'Despesas Administrativas',
    DESPESA_COMERCIAL:   'Despesas Comerciais',
    FINANCEIRO:          'Resultado Financeiro',
    IMPOSTOS:            'Impostos s/ Resultado',
    NAO_OPERACIONAL:     'Não Operacional',
    SEM_CLASSIFICACAO:   'Sem Classificação',
};

const DRE_LINE_ORDER = [
    'Receita Bruta',
    '(-) Deduções',
    '= Receita Líquida',
    '(-) Custos Diretos',
    '= Lucro Bruto',
    '(-) Despesas Operacionais',
    '= EBITDA',
    '(-) Resultado Financeiro',
    '(-) Impostos sobre Resultado',
    '= Resultado Líquido',
];

function formatBRL(v: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function formatPct(v: number | null): string {
    if (v === null) return '—';
    return `${v.toFixed(1)}%`;
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KPICard({ label, value, pct, positive }: { label: string; value: number; pct?: number | null; positive?: boolean }) {
    const isPos = positive !== undefined ? positive : value >= 0;
    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
            <p className={`text-2xl font-black mt-1 ${isPos ? 'text-gray-900' : 'text-red-600'}`}>
                {formatBRL(value)}
            </p>
            {pct !== undefined && (
                <p className={`text-xs mt-0.5 font-semibold flex items-center gap-1 ${isPos ? 'text-green-600' : 'text-red-500'}`}>
                    {isPos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    Margem: {formatPct(pct)}
                </p>
            )}
        </div>
    );
}

// ── Linha do DRE ──────────────────────────────────────────────────────────────

function SummaryRow({ linha, realizado, previsto }: { linha: string; realizado: number; previsto: number }) {
    const isTotal = linha.startsWith('=');
    const isDeduction = linha.startsWith('(-)');

    return (
        <tr className={`${isTotal ? 'bg-gray-50 font-black' : ''} border-b border-gray-100 last:border-0`}>
            <td className={`px-4 py-2.5 text-sm ${isTotal ? 'text-gray-900 font-black' : isDeduction ? 'text-red-600 font-semibold pl-8' : 'text-gray-700 font-semibold pl-8'}`}>
                {linha}
            </td>
            <td className={`px-4 py-2.5 text-sm text-right tabular-nums ${realizado < 0 ? 'text-red-600' : isTotal ? 'text-gray-900 font-black' : 'text-gray-700'}`}>
                {formatBRL(realizado)}
            </td>
            <td className={`px-4 py-2.5 text-sm text-right tabular-nums ${previsto < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                {formatBRL(previsto)}
            </td>
        </tr>
    );
}

// ── Detalhe expansível por grupo ──────────────────────────────────────────────

function DetailGroup({ group, lines }: { group: DREGroup; lines: DRELine[] }) {
    const [open, setOpen] = React.useState(false);
    const total = lines.reduce((s, l) => s + l.net, 0);

    return (
        <>
            <tr
                className="cursor-pointer hover:bg-gray-50 border-b border-gray-100"
                onClick={() => setOpen(o => !o)}
            >
                <td className="px-4 py-2.5 text-sm font-bold text-gray-800 flex items-center gap-2">
                    {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                    {DRE_GROUP_LABELS[group]}
                </td>
                <td className={`px-4 py-2.5 text-sm text-right font-bold tabular-nums ${total < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {formatBRL(total)}
                </td>
                <td className="px-4 py-2.5 text-sm text-right text-gray-400 tabular-nums">
                    {formatBRL(lines.reduce((s, l) => s + l.pending_credit - l.pending_debit, 0))}
                </td>
            </tr>
            {open && lines.map(l => (
                <tr key={l.category_name} className="bg-gray-50/50 border-b border-gray-50">
                    <td className="px-4 py-2 pl-12 text-xs text-gray-500">{l.category_name}</td>
                    <td className={`px-4 py-2 text-xs text-right tabular-nums ${l.net < 0 ? 'text-red-500' : 'text-gray-700'}`}>
                        {formatBRL(l.net)}
                    </td>
                    <td className="px-4 py-2 text-xs text-right tabular-nums text-gray-400">
                        {formatBRL(l.pending_credit - l.pending_debit)}
                    </td>
                </tr>
            ))}
        </>
    );
}

// ── Componente Principal ──────────────────────────────────────────────────────

interface DREReportProps {
    organizationId: string;
}

const DREReport: React.FC<DREReportProps> = ({ organizationId }) => {
    const { showToast } = useToast();
    const now = new Date();
    const [dateFrom, setDateFrom] = React.useState(
        `${now.getFullYear()}-01-01`
    );
    const [dateTo, setDateTo] = React.useState(
        `${now.getFullYear()}-12-31`
    );
    const [summary, setSummary] = React.useState<DRESummary | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [viewMode, setViewMode] = React.useState<'resumo' | 'detalhe'>('resumo');

    const load = React.useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const s = await financialReportService.getDRESummary(organizationId, dateFrom, dateTo);
            setSummary(s);
        } catch (e: unknown) {
            showToast('Erro ao carregar DRE', 'error');
            console.error('[DRE]', e);
        } finally {
            setLoading(false);
        }
    }, [organizationId, dateFrom, dateTo, showToast]);

    React.useEffect(() => { load(); }, [load]);

    // Agrupar detalhe por dre_group
    const grouped = React.useMemo(() => {
        if (!summary) return {} as Record<string, DRELine[]>;
        return summary.detail.reduce<Record<string, DRELine[]>>((acc, l) => {
            const k = l.dre_group;
            if (!acc[k]) acc[k] = [];
            acc[k].push(l);
            return acc;
        }, {});
    }, [summary]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">DRE</h1>
                    <p className="text-gray-400 text-sm mt-1 font-medium">
                        Demonstrativo de Resultado do Exercício
                    </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    <span className="text-gray-400 text-sm">até</span>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    <button onClick={load}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all">
                        Atualizar
                    </button>
                    <button
                        onClick={() => {
                            if (!summary) return;
                            const csv = [
                                'Linha,Realizado,Previsto',
                                ...DRE_LINE_ORDER.map(l => {
                                    const row = summary.lines.find(r => r.linha === l);
                                    return `"${l}",${row?.valor_realizado ?? 0},${row?.valor_previsto ?? 0}`;
                                })
                            ].join('\n');
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
                            a.download = `DRE_${dateFrom}_${dateTo}.csv`;
                            a.click();
                        }}
                        className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 flex items-center gap-2 transition-all"
                    >
                        <Download className="w-4 h-4" /> CSV
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-40 text-sm text-gray-400">Carregando DRE...</div>
            ) : !summary ? null : (
                <>
                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <KPICard label="Receita Bruta"     value={summary.receita_bruta}    positive={true} />
                        <KPICard label="Receita Líquida"   value={summary.receita_liquida}  positive={true} />
                        <KPICard label="Lucro Bruto"       value={summary.lucro_bruto}      pct={summary.margem_bruta_pct}  positive={summary.lucro_bruto >= 0} />
                        <KPICard label="EBITDA"            value={summary.ebitda}           pct={summary.margem_ebitda_pct} positive={summary.ebitda >= 0} />
                        <KPICard label="Resultado Líquido" value={summary.resultado_liquido} pct={summary.margem_liquida_pct} positive={summary.resultado_liquido >= 0} />
                    </div>

                    {/* Toggle resumo / detalhe */}
                    <div className="flex gap-2">
                        {(['resumo', 'detalhe'] as const).map(m => (
                            <button key={m} onClick={() => setViewMode(m)}
                                className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize transition-all ${
                                    viewMode === m ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-blue-300'
                                }`}
                            >
                                {m === 'resumo' ? 'Resumo' : 'Por Categoria'}
                            </button>
                        ))}
                    </div>

                    {/* Tabela */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50/80 border-b border-gray-100">
                                    <th className="px-4 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-wider">Linha</th>
                                    <th className="px-4 py-3 text-right text-xs font-black text-gray-400 uppercase tracking-wider">Realizado</th>
                                    <th className="px-4 py-3 text-right text-xs font-black text-gray-400 uppercase tracking-wider">Previsto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {viewMode === 'resumo'
                                    ? DRE_LINE_ORDER.map(linha => {
                                        const row = summary.lines.find(l => l.linha === linha);
                                        return (
                                            <SummaryRow
                                                key={linha}
                                                linha={linha}
                                                realizado={row?.valor_realizado ?? 0}
                                                previsto={row?.valor_previsto ?? 0}
                                            />
                                        );
                                    })
                                    : Object.entries(grouped).map(([group, lines]) => (
                                        <DetailGroup key={group} group={group as DREGroup} lines={lines} />
                                    ))
                                }
                            </tbody>
                        </table>
                    </div>

                    {/* Nota de rodapé */}
                    <p className="text-xs text-gray-400 text-center">
                        Realizado = transações conciliadas · Previsto = transações pendentes · Período: {
                            new Date(dateFrom + 'T00:00:00').toLocaleDateString('pt-BR')
                        } a {new Date(dateTo + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </p>
                </>
            )}
        </div>
    );
};

export default DREReport;
