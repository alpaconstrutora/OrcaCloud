import React from 'react';
import { TrendingUp, TrendingDown, Download, ChevronDown, ChevronRight, Building2, MoveHorizontal, AlertTriangle } from 'lucide-react';
import { financialReportService } from '../services/financialReportService';
import { useToast } from '../hooks/useToast';
import type { DRESummary, DRELine, DREGroup, DREProjectSummary } from '../types/financial';
import { useResizableColumns } from './ui/TableUtils';
import { useCargaVigente } from '../hooks/useCargaVigente';
import { motivoPeriodoInvalido } from '../utils/periodoControladoria';
import { FalhaDeCarga, PeriodoInvalido } from './controladoria/EstadosDaCarga';
import { BarraDeEscopo, BOTAO_DA_BARRA } from './controladoria/BarraDeEscopo';
import type { EscopoControladoria } from './controladoria/escopo';
import { AvisoSemClassificacao } from './controladoria/SemClassificacao';

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

// O banco devolve as linhas com o prefixo contábil ('(o)', '(!)'); estes dois não são
// vocabulário de quem lê a DRE — a tela diz o que a linha É.
const ROTULO_DA_LINHA: Record<string, string> = {
    '(o) Amortização de Principal': 'Amortização de principal (fora do resultado)',
    '(!) Sem Classificação':        'Sem classificação (fora do resultado)',
};

function formatBRL(v: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

/** "-50,0%" em pt-BR (era `toFixed`, que escrevia "-50.0%"). */
function formatPct(v: number | null): string {
    if (v === null) return '—';
    return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KPICard({ label, value, pct }: { label: string; value: number; pct?: number | null }) {
    const isPos = value >= 0;
    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
            <p className={`text-2xl font-black mt-1 ${isPos ? 'text-gray-900' : 'text-red-600'}`}>
                {formatBRL(value)}
            </p>
            {pct !== undefined && (pct === null ? (
                // Sem receita líquida não há margem: nem seta, nem cor de "piorou".
                <p className="text-xs mt-0.5 font-semibold text-gray-500" title="Sem receita líquida no período, não há base para a margem">
                    Margem: —
                </p>
            ) : (
                <p className={`text-xs mt-0.5 font-semibold flex items-center gap-1 ${pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {pct >= 0 ? <TrendingUp className="w-3 h-3" aria-hidden="true" /> : <TrendingDown className="w-3 h-3" aria-hidden="true" />}
                    Margem: {formatPct(pct)}
                </p>
            ))}
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
                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-amber-800 pl-8">
                    <span className="flex items-center gap-1.5">
                        {hasValue && <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-700" aria-hidden="true" />}
                        {ROTULO_DA_LINHA[linha] ?? linha}
                    </span>
                </td>
                <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium ${realizado < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                    {formatBRL(realizado)}
                </td>
                <td className="px-6 py-2.5 text-sm text-right tabular-nums font-normal text-amber-800">
                    {formatBRL(previsto)}
                </td>
            </tr>
        );
    }

    return (
        <tr className={`${isTotal ? 'bg-gray-50 border-t-2 border-gray-200' : ''} border-b border-gray-100 last:border-0`}>
            <td className={`px-6 py-2.5 border-r border-gray-100 text-sm ${isTotal ? 'text-gray-900 font-medium' : isDeduction ? 'text-red-600 font-normal pl-8' : 'text-gray-700 font-normal pl-8'}`}>
                {ROTULO_DA_LINHA[linha] ?? linha}
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

// "Receita" = Receita Bruta; "Custos e despesas" = tudo o que sai da receita até o
// resultado; "Resultado" = Resultado Líquido. A última linha, "Sem obra", junta o que
// não tem obra — com ela, o Total fecha com o Resumo (receita e resultado).
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
        (acc, p) => ({
            receita: acc.receita + p.receita, custo: acc.custo + p.custo, margem: acc.margem + p.margem,
            receitaLiquida: acc.receitaLiquida + p.receita_liquida,
        }),
        { receita: 0, custo: 0, margem: 0, receitaLiquida: 0 },
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
                    <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                        <th className="px-6 py-2 text-left border-r border-gray-100 relative overflow-hidden">Obra<cols.ResizeHandle colKey="obra" /></th>
                        <th className="px-6 py-2 text-right border-r border-gray-100 relative overflow-hidden">Receita<cols.ResizeHandle colKey="receita" /></th>
                        <th className="px-6 py-2 text-right border-r border-gray-100 relative overflow-hidden">Custos e despesas<cols.ResizeHandle colKey="custo" /></th>
                        <th className="px-6 py-2 text-right border-r border-gray-100 relative overflow-hidden">Resultado<cols.ResizeHandle colKey="margem" /></th>
                        <th className="px-6 py-2 text-right relative overflow-hidden" title="Resultado sobre a receita líquida">Margem %<cols.ResizeHandle colKey="margem_pct" /></th>
                    </tr>
                </thead>
                <tbody>
                    {projects.map(p => {
                        const obraId = p.project_id;
                        return (
                        <tr key={obraId ?? 'sem-obra'}
                            className={`${obraId ? 'cursor-pointer hover:bg-blue-50/40' : ''} border-b border-gray-100 last:border-0`}
                            onClick={obraId ? () => onSelect(obraId) : undefined}
                            title={obraId ? 'Ver DRE desta obra' : 'Lançamentos sem obra (administrativo, comercial, sem projeto)'}
                        >
                            <td className={`px-6 py-2.5 border-r border-gray-100 text-sm font-normal flex items-center gap-2 ${obraId ? 'text-gray-700' : 'text-gray-600 italic'}`}>
                                <Building2 className="w-3.5 h-3.5 text-gray-300" aria-hidden="true" /> {p.project_name}
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
                        );
                    })}
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-gray-900">Total</td>
                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium text-gray-900">{formatBRL(totals.receita)}</td>
                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium text-red-600">{formatBRL(totals.custo)}</td>
                        <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium ${totals.margem < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                            {formatBRL(totals.margem)}
                        </td>
                        <td className="px-6 py-2.5 text-sm text-right tabular-nums font-normal text-gray-500">
                            {formatPct(totals.receitaLiquida > 0 ? totals.margem / totals.receitaLiquida * 100 : null)}
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
    /** Período, regime e obra — o escopo único da Controladoria (ControladoriaModule). */
    escopo: EscopoControladoria;
}

const DREReport: React.FC<DREReportProps> = ({ organizationId, escopo }) => {
    const { showToast } = useToast();
    const { de: dateFrom, ate: dateTo, regime, obraId: projectId, setObra: setProjectId } = escopo;
    const [summary, setSummary] = React.useState<DRESummary | null>(null);
    const [projects, setProjects] = React.useState<DREProjectSummary[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [falhou, setFalhou] = React.useState(false);
    const [viewMode, setViewMode] = React.useState<'resumo' | 'detalhe' | 'por_obra'>('resumo');
    const dreCols = useResizableColumns(DRE_COL_WIDTHS, 'dreSummaryColWidths');
    const novaCarga = useCargaVigente();
    const motivoPeriodo = motivoPeriodoInvalido(dateFrom, dateTo);

    const load = React.useCallback(async () => {
        // Toda carga — inclusive a que não vai acontecer — invalida a anterior: uma
        // resposta antiga não pode pousar depois que o período mudou.
        const vigente = novaCarga();
        if (motivoPeriodoInvalido(dateFrom, dateTo)) {
            setSummary(null);
            setProjects([]);
            setFalhou(false);
            setLoading(false);
            return;
        }
        setLoading(true);
        setFalhou(false);
        try {
            const [s, p] = await Promise.all([
                financialReportService.getDRESummary(organizationId, dateFrom, dateTo, projectId || undefined, regime),
                financialReportService.getDREByProject(organizationId, dateFrom, dateTo, regime),
            ]);
            if (!vigente()) return;
            setSummary(s);
            setProjects(p);
        } catch (e: unknown) {
            if (!vigente()) return;
            // Sem número velho na tela: a falha substitui os dados.
            setSummary(null);
            setProjects([]);
            setFalhou(true);
            showToast('Erro ao carregar DRE', 'error');
            console.error('[DRE]', e);
        } finally {
            if (vigente()) setLoading(false);
        }
    }, [novaCarga, organizationId, dateFrom, dateTo, projectId, regime, showToast]);

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
            <BarraDeEscopo escopo={escopo} aplica={{ periodo: true, regime: null, obra: null }}>
                <button
                    type="button"
                    disabled={!summary}
                    title={summary ? 'Baixar o resumo da DRE em CSV' : 'Sem DRE carregada para exportar'}
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
                    className={`${BOTAO_DA_BARRA} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                    <Download className="w-4 h-4" aria-hidden="true" /> CSV
                </button>
            </BarraDeEscopo>

            {motivoPeriodo ? (
                <PeriodoInvalido motivo={motivoPeriodo} />
            ) : loading ? (
                <div className="flex items-center justify-center h-40 text-sm text-gray-500">Carregando DRE...</div>
            ) : falhou ? (
                <FalhaDeCarga oQue="a DRE" onRetry={load} />
            ) : !summary ? null : (
                <>
                    {/* Sem Classificação no topo, com o caminho (antes: última linha da tabela). */}
                    {(() => {
                        const sc = summary.lines.find(l => l.linha === '(!) Sem Classificação');
                        return (
                            <AvisoSemClassificacao organizationId={organizationId} escopo={escopo}
                                realizado={sc?.valor_realizado ?? 0} previsto={sc?.valor_previsto ?? 0} />
                        );
                    })()}

                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <KPICard label="Receita Bruta"     value={summary.receita_bruta} />
                        <KPICard label="Receita Líquida"   value={summary.receita_liquida} />
                        <KPICard label="Lucro Bruto"       value={summary.lucro_bruto}      pct={summary.margem_bruta_pct} />
                        <KPICard label="EBITDA"            value={summary.ebitda}           pct={summary.margem_ebitda_pct} />
                        <KPICard label="Resultado Líquido" value={summary.resultado_liquido} pct={summary.margem_liquida_pct} />
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
                                <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                    <th className="px-6 py-2 text-left border-r border-gray-100 relative overflow-hidden">Linha<dreCols.ResizeHandle colKey="linha" /></th>
                                    <th className="px-6 py-2 text-right border-r border-gray-100 relative overflow-hidden">{regime === 'CAIXA' ? 'Realizado (conciliado)' : 'Realizado'}<dreCols.ResizeHandle colKey="realizado" /></th>
                                    <th className="px-6 py-2 text-right relative overflow-hidden">{regime === 'CAIXA' ? 'Previsto (pendente)' : 'Previsto'}<dreCols.ResizeHandle colKey="previsto" /></th>
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
                    <p className="text-xs text-gray-500 text-center">
                        {regime === 'CAIXA'
                            ? 'Caixa: realizado = lançamentos conciliados; previsto = pendentes'
                            : 'Competência: realizado = tudo o que foi lançado no período, pela data de competência'
                        } · Margens sobre a receita líquida · Período: {
                            new Date(dateFrom + 'T00:00:00').toLocaleDateString('pt-BR')
                        } a {new Date(dateTo + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </p>
                </>
            )}
        </div>
    );
};

export default DREReport;
