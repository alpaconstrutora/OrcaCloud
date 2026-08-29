import React from 'react';
import { TrendingUp, TrendingDown, Download, ChevronDown, ChevronRight, Building2, MoveHorizontal } from 'lucide-react';
import { financialReportService } from '../services/financialReportService';
import { useToast } from '../hooks/useToast';
import type { DRESummary, DRELine, DREGroup, DREProjectSummary, RegimeContabil } from '../types/financial';
import Button from './ui/Button';
import { useResizableColumns } from './ui/TableUtils';

// §6.3 — as linhas do DRE/comparativo têm ordem contábil fixa (Receita → Deduções →
// Resultado), não fazem sentido reordenadas por clique de coluna; por isso as tabelas
// abaixo usam <th> simples (sem SortableHeader), mas ganham resize+autofit (§6.1/§6.1.2).
const DRE_COL_WIDTHS: Record<string, number> = { linha: 260, realizado: 180, previsto: 180 };
const PROJECT_COL_WIDTHS: Record<string, number> = { obra: 220, receita: 150, custo: 150, margem: 150, margem_pct: 110 };

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
    PASSIVO:             'Movimento de Passivo',
    ATIVO:               'Movimento de Ativo',
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
    '(+/-) Resultado Não Operacional',
    '= Resultado Líquido',
    // Linha memo: sai do resultado (é redução de dívida, não despesa) mas
    // continua visível — é saída de caixa real, e sem ela a DRE não concilia
    // com o fluxo. Criada em aplicar_20270915000003.
    '(o) Amortização de Principal',
    '(!) Sem Classificação',
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
    const isUnclassified = linha.startsWith('(!)');

    // Linha informativa de Sem Classificação — destaque âmbar, fora do total
    if (isUnclassified) {
        const hasValue = realizado !== 0 || previsto !== 0;
        return (
            <tr className={`border-t-2 border-gray-100 ${hasValue ? 'bg-amber-50' : ''}`}>
                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-amber-700 pl-8" title="Lançamentos sem categoria mapeada no plano de contas — não entram no Resultado Líquido. Classifique-os no Plano de Contas.">
                    ⚠ {linha.replace('(!) ', '')}
                </td>
                <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium ${realizado < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                    {formatBRL(realizado)}
                </td>
                <td className="px-6 py-2.5 text-sm text-right tabular-nums font-normal text-amber-500">
                    {formatBRL(previsto)}
                </td>
            </tr>
        );
    }

    return (
        <tr className={`${isTotal ? 'bg-gray-50 border-t-2 border-gray-200' : ''} border-b border-gray-100 last:border-0`}>
            <td className={`px-6 py-2.5 border-r border-gray-100 text-sm ${isTotal ? 'text-gray-900 font-medium' : isDeduction ? 'text-red-600 font-normal pl-8' : 'text-gray-700 font-normal pl-8'}`}>
                {linha}
            </td>
            <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium ${realizado < 0 ? 'text-red-600' : isTotal ? 'text-gray-900' : 'text-gray-700'}`}>
                {formatBRL(realizado)}
            </td>
            <td className={`px-6 py-2.5 text-sm text-right tabular-nums font-normal ${previsto < 0 ? 'text-red-500' : 'text-gray-400'}`}>
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
                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-gray-800 flex items-center gap-2">
                    {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                    {DRE_GROUP_LABELS[group]}
                </td>
                <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right font-medium tabular-nums ${total < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {formatBRL(total)}
                </td>
                <td className="px-6 py-2.5 text-sm text-right text-gray-400 tabular-nums font-normal">
                    {formatBRL(lines.reduce((s, l) => s + l.pending_credit - l.pending_debit, 0))}
                </td>
            </tr>
            {open && lines.map(l => (
                <tr key={l.category_name} className="bg-gray-50/50 border-b border-gray-50">
                    <td className="px-6 py-2 border-r border-gray-100 pl-12 text-sm font-normal text-gray-500">{l.category_name}</td>
                    <td className={`px-6 py-2 border-r border-gray-100 text-sm text-right tabular-nums font-normal ${l.net < 0 ? 'text-red-500' : 'text-gray-700'}`}>
                        {formatBRL(l.net)}
                    </td>
                    <td className="px-6 py-2 text-sm text-right tabular-nums font-normal text-gray-400">
                        {formatBRL(l.pending_credit - l.pending_debit)}
                    </td>
                </tr>
            ))}
        </>
    );
}

// ── Comparativo por Obra ──────────────────────────────────────────────────────

function ProjectComparisonTable({ projects, onSelect }: { projects: DREProjectSummary[]; onSelect: (projectId: string) => void }) {
    const cols = useResizableColumns(PROJECT_COL_WIDTHS, 'dreProjectComparisonColWidths');

    if (projects.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">
                Nenhuma obra com movimentação financeira no período.
            </div>
        );
    }

    const totals = projects.reduce(
        (acc, p) => ({ receita: acc.receita + p.receita, custo: acc.custo + p.custo, margem: acc.margem + p.margem }),
        { receita: 0, custo: 0, margem: 0 },
    );
    const tableWidth = Object.keys(PROJECT_COL_WIDTHS).reduce((s, k) => s + cols.getWidth(k), 0);

    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex justify-end p-2 border-b border-gray-100">
                <button onClick={() => cols.autoFit()} className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all" title="Ajustar largura das colunas ao conteúdo">
                    <MoveHorizontal className="w-4 h-4" />
                </button>
            </div>
            <div className="overflow-x-auto">
            <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableWidth }}>
                <colgroup>
                    <col data-col-key="obra" style={{ width: `${cols.getWidth('obra')}px` }} />
                    <col data-col-key="receita" style={{ width: `${cols.getWidth('receita')}px` }} />
                    <col data-col-key="custo" style={{ width: `${cols.getWidth('custo')}px` }} />
                    <col data-col-key="margem" style={{ width: `${cols.getWidth('margem')}px` }} />
                    <col data-col-key="margem_pct" style={{ width: `${cols.getWidth('margem_pct')}px` }} />
                </colgroup>
                <thead>
                    <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                        <th className="px-6 py-2 text-left border-r border-gray-100 relative overflow-hidden">Obra<cols.ResizeHandle colKey="obra" /></th>
                        <th className="px-6 py-2 text-right border-r border-gray-100 relative overflow-hidden">Receita<cols.ResizeHandle colKey="receita" /></th>
                        <th className="px-6 py-2 text-right border-r border-gray-100 relative overflow-hidden">Custo<cols.ResizeHandle colKey="custo" /></th>
                        <th className="px-6 py-2 text-right border-r border-gray-100 relative overflow-hidden">Margem<cols.ResizeHandle colKey="margem" /></th>
                        <th className="px-6 py-2 text-right relative overflow-hidden">Margem %<cols.ResizeHandle colKey="margem_pct" /></th>
                    </tr>
                </thead>
                <tbody>
                    {projects.map(p => (
                        <tr key={p.project_id}
                            className="cursor-pointer hover:bg-blue-50/40 border-b border-gray-100 last:border-0"
                            onClick={() => onSelect(p.project_id)}
                            title="Ver DRE desta obra"
                        >
                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700 flex items-center gap-2">
                                <Building2 className="w-3.5 h-3.5 text-gray-300" /> {p.project_name}
                            </td>
                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium text-gray-700">{formatBRL(p.receita)}</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium text-red-600">{formatBRL(p.custo)}</td>
                            <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right font-medium tabular-nums ${p.margem < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                {formatBRL(p.margem)}
                            </td>
                            <td className={`px-6 py-2.5 text-sm text-right tabular-nums font-normal ${(p.margem_pct ?? 0) < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                {formatPct(p.margem_pct)}
                            </td>
                        </tr>
                    ))}
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-gray-900">Total</td>
                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium text-gray-900">{formatBRL(totals.receita)}</td>
                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium text-red-600">{formatBRL(totals.custo)}</td>
                        <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium ${totals.margem < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                            {formatBRL(totals.margem)}
                        </td>
                        <td className="px-6 py-2.5 text-sm text-right tabular-nums font-normal text-gray-500">
                            {formatPct(totals.receita ? totals.margem / totals.receita * 100 : null)}
                        </td>
                    </tr>
                </tbody>
            </table>
            </div>
        </div>
    );
}

// ── Componente Principal ──────────────────────────────────────────────────────

interface DREReportProps {
    organizationId: string | null;
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
    const [projects, setProjects] = React.useState<DREProjectSummary[]>([]);
    const [obras, setObras] = React.useState<{ project_id: string; project_name: string; code: string | null }[]>([]);
    const [projectId, setProjectId] = React.useState<string>('');   // '' = todas as obras
    const [regime, setRegime]       = React.useState<RegimeContabil>('CAIXA');
    const [loading, setLoading] = React.useState(false);
    const [viewMode, setViewMode] = React.useState<'resumo' | 'detalhe' | 'por_obra'>('resumo');
    const dreCols = useResizableColumns(DRE_COL_WIDTHS, 'dreSummaryColWidths');

    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            const [s, p] = await Promise.all([
                financialReportService.getDRESummary(organizationId, dateFrom, dateTo, projectId || undefined, regime),
                financialReportService.getDREByProject(organizationId, dateFrom, dateTo),
            ]);
            setSummary(s);
            setProjects(p);
        } catch (e: unknown) {
            showToast('Erro ao carregar DRE', 'error');
            console.error('[DRE]', e);
        } finally {
            setLoading(false);
        }
    }, [organizationId, dateFrom, dateTo, projectId, regime, showToast]);

    // Lista de obras para o filtro (independe do período) — todas as obras
    React.useEffect(() => {
        financialReportService.listObras(organizationId)
            .then(setObras)
            .catch(e => console.error('[DRE] obras', e));
    }, [organizationId]);

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
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">
                        Demonstrativo de Resultado do Exercício
                    </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    <span className="text-gray-400 text-sm">até</span>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    <div className="relative">
                        <Building2 className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <select value={projectId} onChange={e => setProjectId(e.target.value)}
                            className="border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white max-w-[200px]">
                            <option value="">Todas as obras</option>
                            {obras.map(o => (
                                <option key={o.project_id} value={o.project_id}>
                                    {o.code ? `${o.code} · ${o.project_name}` : o.project_name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <select value={regime} onChange={e => setRegime(e.target.value as RegimeContabil)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white">
                        <option value="CAIXA">Caixa</option>
                        <option value="COMPETENCIA">Competência</option>
                    </select>
                    <Button variant="primary" onClick={load}>
                        Atualizar
                    </Button>
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

                    {/* Toggle resumo / detalhe / por obra */}
                    <div className="flex gap-2">
                        {(['resumo', 'detalhe', 'por_obra'] as const).map(m => (
                            <button key={m} onClick={() => setViewMode(m)}
                                className={`h-8 px-3 rounded-[6px] text-sm font-medium transition-all ${
                                    viewMode === m ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-blue-300'
                                }`}
                            >
                                {m === 'resumo' ? 'Resumo' : m === 'detalhe' ? 'Por Categoria' : 'Por Obra'}
                            </button>
                        ))}
                    </div>

                    {/* Tabela */}
                    {viewMode === 'por_obra' ? (
                        <ProjectComparisonTable projects={projects} onSelect={pid => { setProjectId(pid); setViewMode('resumo'); }} />
                    ) : (
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                        <div className="flex justify-end p-2 border-b border-gray-100">
                            <button onClick={() => dreCols.autoFit()} className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all" title="Ajustar largura das colunas ao conteúdo">
                                <MoveHorizontal className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                        <table ref={dreCols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: Object.keys(DRE_COL_WIDTHS).reduce((s, k) => s + dreCols.getWidth(k), 0) }}>
                            <colgroup>
                                <col data-col-key="linha" style={{ width: `${dreCols.getWidth('linha')}px` }} />
                                <col data-col-key="realizado" style={{ width: `${dreCols.getWidth('realizado')}px` }} />
                                <col data-col-key="previsto" style={{ width: `${dreCols.getWidth('previsto')}px` }} />
                            </colgroup>
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className="px-6 py-2 text-left border-r border-gray-100 relative overflow-hidden">Linha<dreCols.ResizeHandle colKey="linha" /></th>
                                    <th className="px-6 py-2 text-right border-r border-gray-100 relative overflow-hidden">Realizado<dreCols.ResizeHandle colKey="realizado" /></th>
                                    <th className="px-6 py-2 text-right relative overflow-hidden">Previsto<dreCols.ResizeHandle colKey="previsto" /></th>
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
                    </div>
                    )}

                    {/* Nota de rodapé */}
                    <p className="text-xs text-gray-400 text-center">
                        {regime === 'CAIXA'
                            ? 'Realizado = transações conciliadas · Previsto = transações pendentes'
                            : 'Regime de Competência: realizado = todos os lançamentos incorridos/auferidos no período (pela data de competência)'
                        } · Período: {
                            new Date(dateFrom + 'T00:00:00').toLocaleDateString('pt-BR')
                        } a {new Date(dateTo + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </p>
                </>
            )}
        </div>
    );
};

export default DREReport;
