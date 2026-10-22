import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle, Award, BarChart3, BookOpen, Clock, Loader2, ShieldAlert, Users, MoveHorizontal } from 'lucide-react';
import { KpiCard } from '../ui/KpiCard';
import {
    ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns,
} from '../ui/TableUtils';
import { academyService } from '../../services/academyService';
import type { AcademyHrKpis, AcademyManagerRow } from '../../types/academy';
import { agruparLinhas, chavePorNome, entradasDaPagina, type EntradaDaTela } from '../../utils/agruparLinhas';
import { useAgrupamento } from '../../hooks/useAgrupamento';
import { AgruparControles, LinhaDeGrupo } from '../ui/Agrupamento';

/**
 * Painéis de gestor e RH.
 *
 * Gestor: uma linha por pessoa, ordenada por quem está pior (atrasados
 * primeiro) — a tela existe para agir, não para admirar médias.
 * RH: cobertura da organização e conformidade de NR.
 */

type Visao = 'gestor' | 'rh';

const COLUMNS: ColumnConfig[] = [
    { key: 'colaborador', label: 'Colaborador', sortable: true },
    { key: 'cargo',       label: 'Cargo',       sortable: true },
    { key: 'total',       label: 'Atribuídos',  sortable: true },
    { key: 'concluidos',  label: 'Concluídos',  sortable: true },
    { key: 'pendentes',   label: 'Pendentes',   sortable: true },
    { key: 'atrasados',   label: 'Em atraso',   sortable: true },
    { key: 'aderencia',   label: 'Aderência',   sortable: true },
];

// "Agrupar" dos colaboradores (guia de UI §6.12) — uma linha por pessoa, então o
// único campo com o que agrupar é o Cargo. Só contagem.
type CampoAgruparPainel = 'cargo';
const OPCOES_AGRUPAR_PAINEL: { value: CampoAgruparPainel; label: string }[] = [{ value: 'cargo', label: 'Cargo' }];

const PANELS_TH_CLASS = 'px-6 py-2 border-r border-gray-100';
const PANELS_TD_CLASS = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `colunas.orderedVisibleColumns` (ordem que o usuário arrasta), em vez da
// sequência fixa derivada de `COLUMNS.filter(...)` no JSX original.
const PANELS_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    colaborador: { label: 'Colaborador', className: PANELS_TH_CLASS },
    cargo: { label: 'Cargo', className: PANELS_TH_CLASS },
    total: { label: 'Atribuídos', className: PANELS_TH_CLASS },
    concluidos: { label: 'Concluídos', className: PANELS_TH_CLASS },
    pendentes: { label: 'Pendentes', className: PANELS_TH_CLASS },
    atrasados: { label: 'Em atraso', className: PANELS_TH_CLASS },
    aderencia: { label: 'Aderência', className: PANELS_TH_CLASS },
};

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `colunas.orderedVisibleColumns` (ordem arrastável) em vez de repetir
// um bloco condicional fixo por coluna.
function renderPanelCell(key: string, r: AcademyManagerRow): React.ReactNode {
    switch (key) {
        case 'colaborador':
            return <span className="text-gray-900">{r.employee_name}</span>;
        case 'cargo':
            return <span className="text-gray-500">{r.employee_role || '—'}</span>;
        case 'total':
            return <span className="text-gray-600">{r.total}</span>;
        case 'concluidos':
            return <span className="text-emerald-700">{r.concluidos}</span>;
        case 'pendentes':
            return <span className="text-gray-600">{r.pendentes}</span>;
        case 'atrasados':
            return (
                <span className={r.atrasados > 0 ? 'text-rose-700' : 'text-gray-400'}>
                    {r.atrasados}
                </span>
            );
        case 'aderencia':
            return (
                <span className={
                    r.aderencia_pct >= 80 ? 'text-emerald-700'
                        : r.aderencia_pct >= 50 ? 'text-amber-700' : 'text-rose-700'
                }>
                    {r.aderencia_pct}%
                </span>
            );
        default:
            return null;
    }
}

interface Props {
    orgId?: string | null;
}

const AcademyPanels: React.FC<Props> = ({ orgId }) => {
    const [visao, setVisao] = usePersistedState<Visao>('academyPanels:visao', 'gestor');
    const colunas = useTableColumns(COLUMNS, 'academyPanelsColumns');
    const agrupamento = useAgrupamento<CampoAgruparPainel>('academyPanels:groupBy');
    // §6.1 — larguras iniciais; arrastar a borda e o autofit ajustam a partir daqui.
    const cols = useResizableColumns({ colaborador: 240, cargo: 180, total: 110, concluidos: 110, pendentes: 110, atrasados: 110, aderencia: 130 }, 'academyPanelsColWidths');
    // Largura = SOMA exata das colunas visíveis (§6.1) — nunca w-full com table-layout: fixed.
    const tableTotalWidth = colunas.orderedVisibleColumns.reduce((sum, key) => sum + cols.getWidth(key), 0);

    const [linhas, setLinhas] = useState<AcademyManagerRow[]>([]);
    const [kpis, setKpis] = useState<AcademyHrKpis | null>(null);
    const [carregando, setCarregando] = useState(true);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const [rows, k] = await Promise.all([
                academyService.getManagerPanel({ orgId }),
                academyService.getHrKpis(orgId),
            ]);
            setLinhas(rows);
            setKpis(k);
        } finally {
            setCarregando(false);
        }
    }, [orgId]);

    useEffect(() => { void carregar(); }, [carregar]);

    const ordenadas = useMemo(() => {
        if (!colunas.sortColumn) return linhas;
        const dir = colunas.sortDirection === 'asc' ? 1 : -1;
        return [...linhas].sort((a, b) => {
            switch (colunas.sortColumn) {
                case 'colaborador': return dir * a.employee_name.localeCompare(b.employee_name);
                case 'cargo':       return dir * (a.employee_role || '').localeCompare(b.employee_role || '');
                case 'total':       return dir * (a.total - b.total);
                case 'concluidos':  return dir * (a.concluidos - b.concluidos);
                case 'pendentes':   return dir * (a.pendentes - b.pendentes);
                case 'atrasados':   return dir * (a.atrasados - b.atrasados);
                case 'aderencia':   return dir * (a.aderencia_pct - b.aderencia_pct);
                default: return 0;
            }
        });
    }, [linhas, colunas.sortColumn, colunas.sortDirection]);

    const grupos = useMemo(() => (agrupamento.campo === 'none' ? [] : agruparLinhas(ordenadas, {
        chave: r => chavePorNome(r.employee_role),
        semRotulo: 'Sem cargo',
        direcao: agrupamento.direcao,
    })), [ordenadas, agrupamento.campo, agrupamento.direcao]);
    const entradas: EntradaDaTela<AcademyManagerRow>[] = useMemo(
        () => (agrupamento.agrupando
            ? entradasDaPagina(grupos, agrupamento.recolhidos)
            : ordenadas.map((item, indice) => ({ tipo: 'linha' as const, item, indice }))),
        [agrupamento.agrupando, grupos, agrupamento.recolhidos, ordenadas],
    );

    if (carregando) {
        return (
            <div className="text-center py-12">
                <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                <p className="mt-2 text-gray-500">Carregando indicadores...</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Sub-toggle do painel (§19.1) */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {([['gestor', 'Equipe'], ['rh', 'RH / SESMT']] as Array<[Visao, string]>).map(([id, label]) => (
                        <button
                            key={id}
                            onClick={() => setVisao(id)}
                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                visao === id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {visao === 'rh' && kpis && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                        <KpiCard label="Aderência" value={`${kpis.aderencia_pct}%`}
                            sub={`${kpis.concluidas} de ${kpis.matriculas} matrículas`}
                            icon={<BarChart3 className="w-5 h-5" />} color="blue" />
                        <KpiCard label="Em Atraso" value={`${kpis.atrasadas}`}
                            icon={<Clock className="w-5 h-5" />} color="rose" />
                        <KpiCard label="NRs Vencendo 30d" value={`${kpis.nr_vencendo_30d}`}
                            icon={<AlertTriangle className="w-5 h-5" />} color="amber" />
                        <KpiCard label="NRs Vencidas" value={`${kpis.nr_vencidas}`}
                            icon={<ShieldAlert className="w-5 h-5" />} color="red" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                        <KpiCard label="Em Andamento" value={`${kpis.em_andamento}`}
                            icon={<BookOpen className="w-5 h-5" />} color="indigo" />
                        <KpiCard label="Colaboradores Alcançados" value={`${kpis.colaboradores_alcancados}`}
                            icon={<Users className="w-5 h-5" />} color="violet" />
                        <KpiCard label="Horas de Treinamento" value={`${Math.round(kpis.horas_treinamento)}h`}
                            icon={<Clock className="w-5 h-5" />} color="teal" />
                        <KpiCard label="Concluídas" value={`${kpis.concluidas}`}
                            icon={<Award className="w-5 h-5" />} color="emerald" />
                    </div>
                </>
            )}

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-gray-500">
                        {visao === 'gestor'
                            ? 'Aderência por colaborador — quem está em atraso aparece primeiro'
                            : 'Cobertura por colaborador na organização'}
                    </p>
                    {/* Sem toolbar de filtros: o "Agrupar" fica junto dos outros controles da tabela (§5.2/§6.12). */}
                    <div className="flex items-center gap-2.5">
                        <AgruparControles
                            opcoes={OPCOES_AGRUPAR_PAINEL}
                            campo={agrupamento.campo}
                            onCampo={agrupamento.setCampo}
                            direcao={agrupamento.direcao}
                            onDirecao={agrupamento.setDirecao}
                            chavesDosGrupos={grupos.map(g => g.key)}
                            algumRecolhido={agrupamento.recolhidos.size > 0}
                            onAlternarTodos={agrupamento.alternarTodos}
                            title="Agrupar os colaboradores"
                        />
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={COLUMNS}
                                visibleColumns={colunas.visibleColumns}
                                showColumnConfig={colunas.showColumnConfig}
                                onToggleShow={() => colunas.setShowColumnConfig(!colunas.showColumnConfig)}
                                onToggleColumn={colunas.toggleColumn}
                                onReset={colunas.resetColumns}
                            />
                            {/* Autofit sob comando explícito, nunca automático (§6.1.2) */}
                            <button
                                onClick={() => cols.autoFit()}
                                className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                title="Ajustar largura das colunas ao conteúdo"
                            >
                                <MoveHorizontal className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {ordenadas.length === 0 ? (
                    <div className="text-center py-12">
                        <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma matrícula ainda</h3>
                        <p className="text-sm text-gray-500">
                            Crie uma atribuição para que os colaboradores apareçam aqui.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                            <colgroup>
                                {colunas.orderedVisibleColumns.map(key => (
                                    <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                                ))}
                                {/* espaçador: absorve a folga no fim (sem coluna de Ações nesta tabela) */}
                                <col />
                            </colgroup>
                            <thead>
                                <tr className="sticky top-0 z-10 bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                    {colunas.orderedVisibleColumns.map(key => {
                                        const def = PANELS_COLUMN_HEADERS[key];
                                        if (!def) return null;
                                        return (
                                            <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                sortColumn={colunas.sortColumn} sortDirection={colunas.sortDirection}
                                                onSort={colunas.handleColumnSort}
                                                onMoveColumn={colunas.moveColumn}
                                                className={`${def.className} overflow-hidden`}>
                                                <cols.ResizeHandle colKey={key} />
                                            </SortableHeader>
                                        );
                                    })}
                                    <th aria-hidden="true" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {entradas.map(e => {
                                    // dados + espaçador (sem checkbox nem Ações).
                                    if (e.tipo === 'grupo') return (
                                        <LinhaDeGrupo key={`grupo:${e.grupo.key}`} grupo={e.grupo} recolhido={e.recolhido} continua={e.continua}
                                            colSpan={colunas.orderedVisibleColumns.length + 1} onAlternar={agrupamento.alternar} semTotal />
                                    );
                                    const r = e.item;
                                    return (
                                    <tr key={r.employee_id} className="hover:bg-blue-50/50 transition-colors">
                                        {colunas.orderedVisibleColumns.map(key => (
                                            <td key={key} className={PANELS_TD_CLASS}>
                                                {renderPanelCell(key, r)}
                                            </td>
                                        ))}
                                        <td aria-hidden="true"></td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AcademyPanels;
