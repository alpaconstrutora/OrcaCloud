import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Building2, TrendingUp, BarChart, Calendar, ChevronRight, AlertCircle, RefreshCw, LayoutDashboard, Table2, Landmark, Percent } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { ImovibStudy } from '../types';
import { imovibService } from '../services/imovibService';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import { InlineDisclosureMenu } from './ui/inline-disclosure-menu';
import { KpiCard } from './ui/KpiCard';
import { formatMoney, formatDateBR, formatPercent, Money } from './ui/Format';
import { computeImovibMath, ImovibMathResult } from '../hooks/useImovibMath';
import { useConfirm } from './ui/confirm';

interface ImovibDashboardProps {
    organizationId?: string;
    onNewStudy: () => void;
    onViewStudy: (id: string) => void;
}

// Todas as colunas disponíveis (16) — passadas ao ColumnConfigButton e ao loop de render.
const IMOVIB_COLUMNS: ColumnConfig[] = [
    { key: 'name', label: 'Estudo', sortable: true },
    { key: 'developer', label: 'Incorporadora', sortable: true },
    { key: 'segment', label: 'Segmento', sortable: true },
    { key: 'phase', label: 'Fase', sortable: true },
    { key: 'development_modality', label: 'Modalidade', sortable: true },
    { key: 'zoning', label: 'Zoneamento', sortable: true },
    { key: 'version', label: 'Versão', sortable: true },
    { key: 'vgv', label: 'VGV', sortable: true },
    { key: 'netVgv', label: 'VGV líquido', sortable: true },
    { key: 'cost', label: 'Custo total', sortable: true },
    { key: 'vpl', label: 'VPL', sortable: true },
    { key: 'irr', label: 'TIR (a.a.)', sortable: true },
    { key: 'margin', label: 'Margem', sortable: true },
    { key: 'exposure', label: 'Exposição máx.', sortable: true },
    { key: 'created_at', label: 'Criado em', sortable: true },
    { key: 'updated_at', label: 'Atualizado em', sortable: true },
];

// Subconjunto visível por padrão — as 16 colunas ficam disponíveis no ColumnConfigButton,
// mas a tabela abre curada (senão a régua nasce ilegível). useTableColumns deriva as
// colunas visíveis default deste array; resetColumns() volta pra ele.
const DEFAULT_VISIBLE_KEYS = ['name', 'developer', 'phase', 'vgv', 'vpl', 'irr', 'margin', 'created_at'];
const DEFAULT_COLUMNS = IMOVIB_COLUMNS.filter(c => DEFAULT_VISIBLE_KEYS.includes(c.key));

// Fase é texto livre; cores conhecidas mapeadas, resto cai no cinza. §8: texto colorido puro.
const PHASE_COLORS: Record<string, string> = {
    'Estudo Inicial': 'text-gray-600',
    'Prospecção': 'text-blue-700',
    'Viabilidade': 'text-indigo-700',
    'Aprovado': 'text-emerald-700',
    'Em Análise': 'text-amber-700',
    'Reprovado': 'text-red-600',
    'Standby': 'text-gray-500',
};

const PhaseLabel: React.FC<{ phase?: string }> = ({ phase }) => (
    <span className={`text-sm font-normal ${phase ? (PHASE_COLORS[phase] || 'text-gray-700') : 'text-gray-400'}`}>
        {phase || 'Estudo Inicial'}
    </span>
);

interface StudyRow {
    study: ImovibStudy;
    m: ImovibMathResult;
    cost: number;
    margin: number; // pontos percentuais; NaN quando VGV = 0
}

const ImovibDashboard: React.FC<ImovibDashboardProps> = ({ organizationId, onNewStudy, onViewStudy }) => {
    const [studies, setStudies] = useState<ImovibStudy[]>([]);
    const [loading, setLoading] = useState(true);
    // F2: filtros/visão sobrevivem a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState('imovibDashboardFilters:search', '');
    const [viewMode, setViewMode] = usePersistedState<'list' | 'grid'>('imovibDashboardFilters:viewMode', 'list');
    const tableColumns = useTableColumns(DEFAULT_COLUMNS, 'imovibDashboardColumns');
    const confirm = useConfirm();
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const loadStudies = async () => {
        try {
            setLoading(true);
            const data = await imovibService.getStudiesWithMetrics(organizationId);
            setStudies(data);
        } catch (error) {
            console.error('Error loading studies:', error);
            notify('Erro ao carregar estudos.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStudies();
    }, [organizationId]);

    const handleDeleteStudy = async (id: string, name: string) => {
        const ok = await confirm({
            title: 'Excluir estudo?',
            message: `Tem certeza que deseja excluir o estudo "${name}"? Esta ação não pode ser desfeita.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await imovibService.deleteStudy(id);
            notify('Estudo excluído com sucesso.');
            loadStudies();
        } catch (error) {
            console.error('Error deleting study:', error);
            notify('Erro ao excluir estudo.', 'error');
        }
    };

    // Motor financeiro por estudo — mesmo cálculo do Resumo Executivo (computeImovibMath).
    const rows = useMemo<StudyRow[]>(() => studies.map(study => {
        const m = computeImovibMath(study);
        const totalNetProfit = m.monthlyFlows.reduce((acc, f) => acc + f.net, 0);
        const margin = m.vgvTotal > 0 ? (totalNetProfit / m.vgvTotal) * 100 : NaN;
        return { study, m, cost: m.constCostTotal + m.landCost, margin };
    }), [studies]);

    const filteredRows = useMemo(() => {
        const term = searchTerm.toLowerCase();
        const result = rows.filter(({ study }) =>
            study.name.toLowerCase().includes(term) ||
            (study.developer && study.developer.toLowerCase().includes(term))
        );

        const { sortColumn, sortDirection } = tableColumns;
        if (!sortColumn) return result; // sem coluna: mantém ordem do service (created_at desc)

        const dir = sortDirection === 'asc' ? 1 : -1;
        const txt = (v?: string) => (v || '');
        // NaN (TIR/margem sem dados) sempre no fim, independente da direção.
        const num = (a: number, b: number) => {
            const an = Number.isNaN(a) ? -Infinity : a;
            const bn = Number.isNaN(b) ? -Infinity : b;
            return (an - bn) * dir;
        };

        return [...result].sort((ra, rb) => {
            const a = ra.study, b = rb.study;
            switch (sortColumn) {
                case 'name': return txt(a.name).localeCompare(txt(b.name), 'pt-BR') * dir;
                case 'developer': return txt(a.developer).localeCompare(txt(b.developer), 'pt-BR') * dir;
                case 'segment': return txt(a.segment).localeCompare(txt(b.segment), 'pt-BR') * dir;
                case 'phase': return txt(a.phase).localeCompare(txt(b.phase), 'pt-BR') * dir;
                case 'development_modality': return txt(a.development_modality).localeCompare(txt(b.development_modality), 'pt-BR') * dir;
                case 'zoning': return txt(a.zoning).localeCompare(txt(b.zoning), 'pt-BR') * dir;
                case 'version': return txt(a.version).localeCompare(txt(b.version), 'pt-BR', { numeric: true }) * dir;
                case 'vgv': return num(ra.m.vgvTotal, rb.m.vgvTotal);
                case 'netVgv': return num(ra.m.netVgvTotal, rb.m.netVgvTotal);
                case 'cost': return num(ra.cost, rb.cost);
                case 'vpl': return num(ra.m.vpl, rb.m.vpl);
                case 'irr': return num(ra.m.annualIrr, rb.m.annualIrr);
                case 'margin': return num(ra.margin, rb.margin);
                case 'exposure': return num(ra.m.maxExposure, rb.m.maxExposure);
                case 'created_at': return txt(a.created_at).localeCompare(txt(b.created_at)) * dir;
                case 'updated_at': return txt(a.updated_at).localeCompare(txt(b.updated_at)) * dir;
                default: return 0;
            }
        });
    }, [rows, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection]);

    const kpis = useMemo(() => {
        const validIrr = rows.map(r => r.m.annualIrr).filter(v => !Number.isNaN(v) && Number.isFinite(v));
        return {
            total: rows.length,
            vgv: rows.reduce((s, r) => s + r.m.vgvTotal, 0),
            vpl: rows.reduce((s, r) => s + r.m.vpl, 0),
            irrAvg: validIrr.length ? validIrr.reduce((s, v) => s + v, 0) / validIrr.length : NaN,
        };
    }, [rows]);

    const visible = tableColumns.visibleColumns;

    return (
        <div className="space-y-6">
            {/* Header — §20 (flat, sem hero) */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Estudos de Viabilidade</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Análise de viabilidade econômico-financeira de empreendimentos.</p>
            </div>

            {/* KPIs — §4.2 (total em destaque + decomposição da carteira) */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <KpiCard shadow={false} size="lg" className="col-span-2" label="Total de estudos" value={kpis.total} icon={<BarChart className="w-4 h-4" />} color="blue" />
                <KpiCard shadow={false} size="sm" label="VGV da carteira" value={formatMoney(kpis.vgv)} icon={<Landmark className="w-4 h-4" />} color="indigo" />
                <KpiCard shadow={false} size="sm" label="VPL da carteira" value={formatMoney(kpis.vpl)} icon={<TrendingUp className="w-4 h-4" />} color="emerald" />
                <KpiCard shadow={false} size="sm" label="TIR média (a.a.)" value={formatPercent(kpis.irrAvg, { asPoints: true, decimals: 1 })} icon={<Percent className="w-4 h-4" />} color="amber" />
            </div>

            {/* Toolbar acoplada à tabela (§5.2, padrão OpuraDocsModule/GED): toolbar e
                conteúdo dividem um único bloco — border/rounded/shadow ficam só no
                container pai, a única costura visível é o border-b da toolbar, sem
                bordas duplicadas entre a régua e a tabela/grade abaixo. */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-white">
            <div className="flex flex-col md:flex-row gap-2.5 items-center">
                <div className="flex-1 relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar estudo ou incorporadora..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>

                <button
                    onClick={loadStudies}
                    className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                    title="Atualizar"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>

                {/* Separador entre grupo "filtrar" e grupo "visualizar" */}
                <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                    {viewMode === 'list' && (
                        <>
                            <ColumnConfigButton
                                columns={IMOVIB_COLUMNS}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                            <div className="w-px h-5 bg-gray-200 mx-0.5"></div>
                        </>
                    )}
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}
                        title="Visualização em Blocos"
                    >
                        <LayoutDashboard className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}
                        title="Visualização em Linhas"
                    >
                        <Table2 className="w-4 h-4" />
                    </button>
                </div>

                {/* CTA primário compacto (§17) — dentro da régua, criação é ação esporádica */}
                <button
                    onClick={onNewStudy}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Plus className="w-[15px] h-[15px]" />
                    Novo estudo
                </button>
            </div>
            </div>

            {loading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando estudos...</p>
                </div>
            ) : filteredRows.length === 0 ? (
                <div className="text-center py-12">
                    <BarChart className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum estudo encontrado</h3>
                    <p className="text-sm text-gray-500 mb-6">
                        {searchTerm
                            ? 'Nenhum estudo corresponde à sua busca. Tente outro termo.'
                            : 'Você ainda não possui nenhum estudo de viabilidade. Clique abaixo para iniciar sua primeira análise financeira paramétrica.'}
                    </p>
                    {searchTerm ? (
                        <button onClick={() => setSearchTerm('')} className="text-blue-600 font-medium hover:underline">
                            Limpar busca
                        </button>
                    ) : (
                        <button onClick={onNewStudy} className="text-blue-600 font-medium hover:underline">
                            Criar primeiro estudo
                        </button>
                    )}
                </div>
            ) : viewMode === 'list' ? (
                <div className="overflow-auto max-h-[70vh]">
                    <table className="w-full text-left border-collapse">
                            {/* thead sentence case (§6.2) — sticky (§6.5), uppercase={false} nos SortableHeader */}
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {IMOVIB_COLUMNS.filter(c => visible.includes(c.key)).map(col => (
                                        <SortableHeader
                                            key={col.key}
                                            colKey={col.key}
                                            label={col.label}
                                            sortable={col.sortable}
                                            uppercase={false}
                                            sortColumn={tableColumns.sortColumn}
                                            sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort}
                                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap"
                                        />
                                    ))}
                                    <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredRows.map(({ study, m, cost, margin }) => (
                                    <tr
                                        key={study.id}
                                        onClick={() => onViewStudy(study.id)}
                                        className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                    >
                                        {visible.includes('name') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <span className="text-sm font-normal text-gray-700 group-hover:text-blue-700 transition-colors">{study.name}</span>
                                            </td>
                                        )}
                                        {visible.includes('developer') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                {study.developer || '—'}
                                            </td>
                                        )}
                                        {visible.includes('segment') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                {study.segment || '—'}
                                            </td>
                                        )}
                                        {visible.includes('phase') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <PhaseLabel phase={study.phase} />
                                            </td>
                                        )}
                                        {visible.includes('development_modality') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                {study.development_modality || '—'}
                                            </td>
                                        )}
                                        {visible.includes('zoning') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                {study.zoning || '—'}
                                            </td>
                                        )}
                                        {visible.includes('version') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                v{study.version}
                                            </td>
                                        )}
                                        {visible.includes('vgv') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-gray-800">
                                                {formatMoney(m.vgvTotal)}
                                            </td>
                                        )}
                                        {visible.includes('netVgv') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-gray-800">
                                                {formatMoney(m.netVgvTotal)}
                                            </td>
                                        )}
                                        {visible.includes('cost') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-gray-800">
                                                {formatMoney(cost)}
                                            </td>
                                        )}
                                        {visible.includes('vpl') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium">
                                                <Money value={m.vpl} signColor />
                                            </td>
                                        )}
                                        {visible.includes('irr') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-gray-800">
                                                {Number.isNaN(m.annualIrr) ? '—' : formatPercent(m.annualIrr, { asPoints: true, decimals: 1 })}
                                            </td>
                                        )}
                                        {visible.includes('margin') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-gray-800">
                                                {Number.isNaN(margin) ? '—' : formatPercent(margin, { asPoints: true, decimals: 1 })}
                                            </td>
                                        )}
                                        {visible.includes('exposure') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-gray-800">
                                                {formatMoney(m.maxExposure)}
                                            </td>
                                        )}
                                        {visible.includes('created_at') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 whitespace-nowrap">
                                                {formatDateBR(study.created_at)}
                                            </td>
                                        )}
                                        {visible.includes('updated_at') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 whitespace-nowrap">
                                                {formatDateBR(study.updated_at)}
                                            </td>
                                        )}
                                        {/* Ações — abrir estudo é a ação dominante (clique na linha); kebab só isola Excluir (§9.1) */}
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                                                <InlineDisclosureMenu showDelete onDelete={() => handleDeleteStudy(study.id, study.name)} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                    {filteredRows.map(({ study, m }) => (
                        <div
                            key={study.id}
                            onClick={() => onViewStudy(study.id)}
                            className="group bg-white border border-gray-100 rounded-[10px] p-6 hover:border-blue-200 hover:shadow-lg transition-all cursor-pointer flex flex-col h-full relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                <Building2 className="w-24 h-24 text-indigo-900" />
                            </div>

                            <div className="flex items-start justify-between mb-4 relative z-10">
                                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-[10px] group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                    <TrendingUp className="w-6 h-6" />
                                </div>
                                <div className="flex flex-col items-end">
                                    <PhaseLabel phase={study.phase} />
                                    <span className="text-xs font-normal text-gray-400 mt-1">v{study.version}</span>
                                </div>
                            </div>

                            <div className="flex-1 relative z-10">
                                <h3 className="text-lg font-bold text-gray-900 leading-tight mb-2 group-hover:text-indigo-600 transition-colors">
                                    {study.name}
                                </h3>
                                <p className="text-sm text-gray-500 line-clamp-2">
                                    {study.developer || 'Incorporadora não informada'}
                                </p>
                            </div>

                            {/* VGV / TIR — números agora disponíveis via computeImovibMath */}
                            <div className="grid grid-cols-2 gap-3 mt-6 relative z-10">
                                <div>
                                    <p className="text-xs font-normal text-gray-400">VGV</p>
                                    <p className="text-sm font-medium text-gray-800">{formatMoney(m.vgvTotal)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-normal text-gray-400">TIR (a.a.)</p>
                                    <p className="text-sm font-medium text-gray-800">
                                        {Number.isNaN(m.annualIrr) ? '—' : formatPercent(m.annualIrr, { asPoints: true, decimals: 1 })}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-6 pt-6 border-t border-gray-50 flex items-center justify-between relative z-10">
                                <div className="flex items-center gap-2 text-gray-400">
                                    <Calendar className="w-4 h-4" />
                                    <span className="text-xs font-normal">{formatDateBR(study.created_at)}</span>
                                </div>
                                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                                    <ActionIconButton kind="delete" title="Excluir Estudo" onClick={() => handleDeleteStudy(study.id, study.name)} />
                                    <div className="flex items-center gap-1 text-indigo-600 font-medium text-xs group-hover:gap-2 transition-all">
                                        Ver dados
                                        <ChevronRight className="w-4 h-4" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            </div>

            {/* Toast — §13 */}
            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default ImovibDashboard;
