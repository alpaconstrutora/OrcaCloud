import React from 'react';
import { Download, ChevronDown, ChevronRight, Building2, AlertTriangle } from 'lucide-react';
import { financialReportService } from '../services/financialReportService';
import { useToast } from '../hooks/useToast';
import type { DRESummary, DRELine, DREGroup, DREProjectSummary } from '../types/financial';
import { useResizableColumns } from './ui/TableUtils';
import { useCargaVigente } from '../hooks/useCargaVigente';
import { useStore } from '../store/useStore';
import { motivoPeriodoInvalido } from '../utils/periodoControladoria';
import { FalhaDeCarga, PeriodoInvalido } from './controladoria/EstadosDaCarga';
import { BarraDeEscopo, BOTAO_DA_BARRA, BotaoAutoAjuste } from './controladoria/BarraDeEscopo';
import type { EscopoControladoria } from './controladoria/escopo';
import { AvisoSemClassificacao } from './controladoria/SemClassificacao';
import { KpiCard } from './ui/KpiCard';
import { GRADE_DE_INDICADORES, tomDoResultado } from './controladoria/indicadores';
import { baixarCSV } from './controladoria/csv';

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

// ── Indicadores ───────────────────────────────────────────────────────────────

/** Legenda de margem: a base (receita líquida) dita, e sem base não há margem. */
/** Sinal ÚNICO na DRE (2ª crítica, 15/11/2026): o que sai do resultado aparece
 *  NEGATIVO, no Resumo e no Por Categoria. O banco devolve as linhas "(-)" e
 *  "(o)" já invertidas (custo 6.000 positivo, rótulo "(-)"), e o Por Categoria
 *  mostrava o mesmo custo como −6.000 — dois sinais para o mesmo número. */
function valorExibido(linha: string, v: number): number {
    return linha.startsWith('(-)') || linha.startsWith('(o)') ? (v === 0 ? 0 : -v) : v; // sem −0 ("-R$ 0,00")
}

function legendaDeMargem(pct: number | null): string {
    return pct === null ? 'Sem margem: não há receita líquida no período' : `Margem ${formatPct(pct)}`;
}

// Coluna espaçadora (§6.1.1): a tabela estica até a largura do card e a folga fica
// NELA, não espalhada entre as colunas de dado nem como faixa branca fora da tabela.
const Espaco = () => <td aria-hidden="true"></td>;

// ── Linha do DRE ──────────────────────────────────────────────────────────────

// `comPrevisto`: só no Caixa. Em Competência o "previsto" repetia o realizado (todo
// lançamento do período já é realizado) e a coluna só dobrava os números.
function SummaryRow({ linha, realizado, previsto, comPrevisto }: { linha: string; realizado: number; previsto: number; comPrevisto: boolean }) {
    const isTotal = linha.startsWith('=');
    const isUnclassified = linha.startsWith('(!)');

    // Linha informativa de Sem Classificação — destaque âmbar, fora do total
    if (isUnclassified) {
        const hasValue = realizado !== 0 || (comPrevisto && previsto !== 0);
        return (
            <tr className={`border-t-2 border-gray-100 ${hasValue ? 'bg-amber-50' : ''}`}>
                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-amber-800 pl-8">
                    <span className="flex items-center gap-1.5">
                        {hasValue && <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-700" aria-hidden="true" />}
                        {ROTULO_DA_LINHA[linha] ?? linha}
                    </span>
                </td>
                <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium text-amber-800`}>
                    {formatBRL(realizado)}
                </td>
                {comPrevisto && (
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-normal text-amber-800">
                        {formatBRL(previsto)}
                    </td>
                )}
                <Espaco />
            </tr>
        );
    }

    // Cor por ESTADO, não por sinal (§4.5): rótulo neutro; vermelho só no TOTAL
    // abaixo do limiar. Custo negativo é o normal de um custo, não um alarme.
    const real = valorExibido(linha, realizado);
    const prev = valorExibido(linha, previsto);
    const alertaReal = isTotal && tomDoResultado(real) === 'alerta';
    const alertaPrev = isTotal && tomDoResultado(prev) === 'alerta';
    return (
        <tr className={`${isTotal ? 'bg-gray-50 border-t-2 border-gray-200' : ''} border-b border-gray-100 last:border-0`}>
            <td className={`px-6 py-2.5 border-r border-gray-100 text-sm ${isTotal ? 'text-gray-900 font-medium' : 'text-gray-700 font-normal pl-8'}`}>
                {ROTULO_DA_LINHA[linha] ?? linha}
            </td>
            <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium ${alertaReal ? 'text-red-700' : isTotal ? 'text-gray-900' : 'text-gray-700'}`}>
                {formatBRL(real)}
            </td>
            {comPrevisto && (
                <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-normal ${alertaPrev ? 'text-red-700' : 'text-gray-600'}`}>
                    {formatBRL(prev)}
                </td>
            )}
            <Espaco />
        </tr>
    );
}

// ── Detalhe expansível por grupo ──────────────────────────────────────────────

function DetailGroup({ group, lines, comPrevisto }: { group: DREGroup; lines: DRELine[]; comPrevisto: boolean }) {
    const [open, setOpen] = React.useState(false);
    const total = lines.reduce((s, l) => s + l.net, 0);

    return (
        <>
            <tr
                className="cursor-pointer hover:bg-gray-50 border-b border-gray-100"
                onClick={() => setOpen(o => !o)}
            >
                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-gray-800">
                    {/* Botão sem onClick próprio: clique, Enter e Espaço sobem até a linha
                        (o padrão do SortableHeader). Antes só o mouse abria o grupo. */}
                    <button type="button" aria-expanded={open}
                        className="flex items-center gap-2 text-left rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                        {open
                            ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden="true" />
                            : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden="true" />}
                        {DRE_GROUP_LABELS[group]}
                    </button>
                </td>
                <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-right font-medium tabular-nums text-gray-900">
                    {formatBRL(total)}
                </td>
                {comPrevisto && (
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-right text-gray-600 tabular-nums font-normal">
                        {formatBRL(lines.reduce((s, l) => s + l.pending_credit - l.pending_debit, 0))}
                    </td>
                )}
                <Espaco />
            </tr>
            {open && lines.map(l => (
                <tr key={l.category_name} className="bg-gray-50/50 border-b border-gray-50">
                    <td className="px-6 py-2 border-r border-gray-100 pl-12 text-sm font-normal text-gray-500">{l.category_name}</td>
                    <td className="px-6 py-2 border-r border-gray-100 text-sm text-right tabular-nums font-normal text-gray-700">
                        {formatBRL(l.net)}
                    </td>
                    {comPrevisto && (
                        <td className="px-6 py-2 border-r border-gray-100 text-sm text-right tabular-nums font-normal text-gray-600">
                            {formatBRL(l.pending_credit - l.pending_debit)}
                        </td>
                    )}
                    <Espaco />
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
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-600">
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
                <BotaoAutoAjuste onClick={() => cols.autoFit()} />
            </div>
            <div className="overflow-x-auto">
            <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableWidth, minWidth: '100%' }}>
                <colgroup>
                    <col data-col-key="obra" style={{ width: `${cols.getWidth('obra')}px` }} />
                    <col data-col-key="receita" style={{ width: `${cols.getWidth('receita')}px` }} />
                    <col data-col-key="custo" style={{ width: `${cols.getWidth('custo')}px` }} />
                    <col data-col-key="margem" style={{ width: `${cols.getWidth('margem')}px` }} />
                    <col data-col-key="margem_pct" style={{ width: `${cols.getWidth('margem_pct')}px` }} />
                    <col />
                </colgroup>
                <thead>
                    <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                        <th className="px-6 py-2 text-left border-r border-gray-100 relative overflow-hidden">Obra<cols.ResizeHandle colKey="obra" /></th>
                        <th className="px-6 py-2 text-right border-r border-gray-100 relative overflow-hidden">Receita<cols.ResizeHandle colKey="receita" /></th>
                        <th className="px-6 py-2 text-right border-r border-gray-100 relative overflow-hidden">Custos e despesas<cols.ResizeHandle colKey="custo" /></th>
                        <th className="px-6 py-2 text-right border-r border-gray-100 relative overflow-hidden">Resultado<cols.ResizeHandle colKey="margem" /></th>
                        <th className="px-6 py-2 text-right border-r border-gray-100 relative overflow-hidden" title="Resultado sobre a receita líquida">Margem %<cols.ResizeHandle colKey="margem_pct" /></th>
                        <th aria-hidden="true" />
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
                            <td className={`px-6 py-2.5 border-r border-gray-100 text-sm font-normal ${obraId ? 'text-gray-700' : 'text-gray-600 italic'}`}>
                                {obraId ? (
                                    // Clique, Enter e Espaço sobem até a linha, que abre a DRE da obra.
                                    <button type="button" aria-label={`Ver a DRE de ${p.project_name}`}
                                        className="flex items-center gap-2 text-left text-blue-700 hover:underline rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                                        <Building2 className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden="true" /> {p.project_name}
                                    </button>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <Building2 className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden="true" /> {p.project_name}
                                    </span>
                                )}
                            </td>
                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium text-gray-700">{formatBRL(p.receita)}</td>
                            {/* Cor por estado (§4.5): custo é custo, não alarme; vermelho só na margem abaixo do limiar. */}
                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium text-gray-700">{formatBRL(p.custo)}</td>
                            <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right font-medium tabular-nums ${tomDoResultado(p.margem) === 'alerta' ? 'text-red-700' : 'text-gray-900'}`}>
                                {formatBRL(p.margem)}
                            </td>
                            <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-normal ${(p.margem_pct ?? 0) < 0 ? 'text-red-700' : 'text-gray-600'}`}>
                                {formatPct(p.margem_pct)}
                            </td>
                            <Espaco />
                        </tr>
                        );
                    })}
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-gray-900">Total</td>
                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium text-gray-900">{formatBRL(totals.receita)}</td>
                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium text-gray-900">{formatBRL(totals.custo)}</td>
                        <td className={`px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-medium ${tomDoResultado(totals.margem) === 'alerta' ? 'text-red-700' : 'text-gray-900'}`}>
                            {formatBRL(totals.margem)}
                        </td>
                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-right tabular-nums font-normal text-gray-600">
                            {formatPct(totals.receitaLiquida > 0 ? totals.margem / totals.receitaLiquida * 100 : null)}
                        </td>
                        <Espaco />
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
    const setActiveView = useStore(s => s.setActiveView);
    const { de: dateFrom, ate: dateTo, regime, obraId: projectId, setObra: setProjectId } = escopo;
    const [summary, setSummary] = React.useState<DRESummary | null>(null);
    const [projects, setProjects] = React.useState<DREProjectSummary[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [falhou, setFalhou] = React.useState(false);
    const [viewMode, setViewMode] = React.useState<'resumo' | 'detalhe' | 'por_obra'>('resumo');
    const dreCols = useResizableColumns(DRE_COL_WIDTHS, 'dreSummaryColWidths');
    const novaCarga = useCargaVigente();
    const comPrevisto = regime === 'CAIXA';
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
                        baixarCSV(`DRE_${dateFrom}_${dateTo}.csv`, ['Linha', 'Realizado', 'Previsto'],
                            DRE_LINE_ORDER.map(l => {
                                const row = summary.lines.find(r => r.linha === l);
                                return [ROTULO_DA_LINHA[l] ?? l, valorExibido(l, row?.valor_realizado ?? 0), valorExibido(l, row?.valor_previsto ?? 0)];
                            }));
                    }}
                    className={`${BOTAO_DA_BARRA} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                    <Download className="w-4 h-4" aria-hidden="true" /> CSV
                </button>
            </BarraDeEscopo>

            {motivoPeriodo ? (
                <PeriodoInvalido motivo={motivoPeriodo} />
            ) : loading ? (
                <div role="status" className="flex items-center justify-center h-40 text-sm text-gray-600">Carregando DRE…</div>
            ) : falhou ? (
                <FalhaDeCarga oQue="a DRE" onRetry={load} />
            ) : !summary ? null : (
                <>
                    {/* Sem Classificação no topo, com o caminho (antes: última linha da tabela). */}
                    {(() => {
                        const sc = summary.lines.find(l => l.linha === '(!) Sem Classificação');
                        return (
                            <AvisoSemClassificacao organizationId={organizationId} escopo={escopo}
                                realizado={sc?.valor_realizado ?? 0} previsto={comPrevisto ? (sc?.valor_previsto ?? 0) : 0} />
                        );
                    })()}

                    {/* Indicadores (§4.5): quatro, não cinco — a receita bruta é a base da
                        líquida e mora na legenda dela. Cor só por limiar (LIMIAR). */}
                    {(() => {
                        // Caixa conta só o CONCILIADO. Sem o pendente à vista, a diretoria lia
                        // "prejuízo de −125%" onde havia atraso de conciliação (2ª crítica,
                        // 15/11/2026; decisão do usuário: "Caixa + pendente visível").
                        const pendente = (linha: string) => comPrevisto ? (summary.lines.find(l => l.linha === linha)?.valor_previsto ?? 0) : 0;
                        const comPendente = (base: string, valor: number, linha: string) => {
                            const p = pendente(linha);
                            return p ? `Com o pendente: ${formatBRL(valor + p)} · ${base.charAt(0).toLowerCase()}${base.slice(1)}` : base;
                        };
                        const pendenteResultado = pendente('= Resultado Líquido');
                        return (
                            <div className={GRADE_DE_INDICADORES}>
                                <KpiCard destaque label="Receita líquida" value={formatBRL(summary.receita_liquida)}
                                    sub={comPendente(`Receita bruta ${formatBRL(summary.receita_bruta)}`, summary.receita_liquida, '= Receita Líquida')} />
                                <KpiCard destaque label="Lucro bruto" value={formatBRL(summary.lucro_bruto)}
                                    sub={comPendente(legendaDeMargem(summary.margem_bruta_pct), summary.lucro_bruto, '= Lucro Bruto')} tom={tomDoResultado(summary.lucro_bruto)} />
                                <KpiCard destaque label="EBITDA" value={formatBRL(summary.ebitda)}
                                    sub={comPendente(legendaDeMargem(summary.margem_ebitda_pct), summary.ebitda, '= EBITDA')} tom={tomDoResultado(summary.ebitda)} />
                                <KpiCard destaque label="Resultado líquido" value={formatBRL(summary.resultado_liquido)}
                                    sub={comPendente(legendaDeMargem(summary.margem_liquida_pct), summary.resultado_liquido, '= Resultado Líquido')}
                                    tom={tomDoResultado(summary.resultado_liquido)}
                                    acao={pendenteResultado ? { label: 'Conciliar lançamentos', onClick: () => setActiveView('bank-reconciliation') } : undefined} />
                            </div>
                        );
                    })()}

                    {/* Toggle resumo / detalhe / por obra */}
                    <div className="flex gap-2" role="group" aria-label="Forma da tabela">
                        {(['resumo', 'detalhe', 'por_obra'] as const).map(m => (
                            <button key={m} type="button" onClick={() => setViewMode(m)} aria-pressed={viewMode === m}
                                className={`h-8 px-3 rounded-[6px] text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                                    viewMode === m ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:border-blue-300'
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
                            <BotaoAutoAjuste onClick={() => dreCols.autoFit()} />
                        </div>
                        <div className="overflow-x-auto">
                        <table ref={dreCols.tableRef} className="text-left border-collapse"
                            style={{ tableLayout: 'fixed', minWidth: '100%', width: dreCols.getWidth('linha') + dreCols.getWidth('realizado') + (comPrevisto ? dreCols.getWidth('previsto') : 0) }}>
                            <colgroup>
                                <col data-col-key="linha" style={{ width: `${dreCols.getWidth('linha')}px` }} />
                                <col data-col-key="realizado" style={{ width: `${dreCols.getWidth('realizado')}px` }} />
                                {comPrevisto && <col data-col-key="previsto" style={{ width: `${dreCols.getWidth('previsto')}px` }} />}
                                <col />
                            </colgroup>
                            <thead>
                                <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                    <th className="px-6 py-2 text-left border-r border-gray-100 relative overflow-hidden">Linha<dreCols.ResizeHandle colKey="linha" /></th>
                                    <th className="px-6 py-2 text-right border-r border-gray-100 relative overflow-hidden">{regime === 'CAIXA' ? 'Realizado (conciliado)' : 'Realizado'}<dreCols.ResizeHandle colKey="realizado" /></th>
                                    {comPrevisto && <th className="px-6 py-2 text-right border-r border-gray-100 relative overflow-hidden">Previsto (pendente)<dreCols.ResizeHandle colKey="previsto" /></th>}
                                    <th aria-hidden="true" />
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
                                                comPrevisto={comPrevisto}
                                            />
                                        );
                                    })
                                    // Ordem contábil (a do DRE_GROUP_LABELS), não a de chegada do banco.
                                    : (Object.keys(DRE_GROUP_LABELS) as DREGroup[]).filter(g => grouped[g]).map(g => [g, grouped[g]] as const).map(([group, lines]) => (
                                        <DetailGroup key={group} group={group as DREGroup} lines={lines} comPrevisto={comPrevisto} />
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
