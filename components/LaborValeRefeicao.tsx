import React, { useState, useMemo } from 'react';
import {
    UtensilsCrossed, Plus, Check, Settings,
    CalendarDays, Calculator, Loader2, AlertCircle,
    CheckCheck, X, Save, FileText, Search, Wallet, Users, TrendingDown, TrendingUp, MoveHorizontal,
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { KpiCard } from './ui/KpiCard';
import { useConfirm } from './ui/confirm';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import LaborScopeBar from './LaborScopeBar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vrService, VrRegra, VrFeriado, VrCalculo } from '../services/vrService';
import { laborService, Employee } from '../services/laborService';
import { supabase } from '../lib/supabase';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-[6px] text-sm font-medium outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300 transition-all';
const labelCls = 'text-xs font-semibold text-slate-500';

function mesLabel(iso: string) {
    const [y, m] = iso.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function primeiroDiaMes(year: number, month: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// Texto simples colorido — sem pílula/fundo/uppercase (guia §8).
const STATUS_CFG = {
    rascunho:  { label: 'Rascunho',  color: 'text-slate-600' },
    aprovado:  { label: 'Aprovado',  color: 'text-emerald-700' },
    pago:      { label: 'Pago',      color: 'text-blue-700' },
    cancelado: { label: 'Cancelado', color: 'text-rose-700' },
} as const;

function useToast() {
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };
    const Toast = () => notification ? (
        <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
            notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
            <AlertCircle className="w-4 h-4 shrink-0" />
            {notification.message}
        </div>
    ) : null;
    return { notify, Toast };
}

// ─── Modal de Regra ───────────────────────────────────────────────────────────

interface RegraModalProps {
    regra: Partial<VrRegra> | null;
    orgId: string | null;
    projects: { id: string; name: string }[];
    onClose: () => void;
    onSaved: () => void;
}

const RegraModal: React.FC<RegraModalProps> = ({ regra, orgId, projects, onClose, onSaved }) => {
    const [form, setForm] = useState<Partial<VrRegra>>({
        org_id: orgId ?? undefined,
        nome: '',
        tipo: 'refeicao',
        valor_diario: 30,
        desconto_folha_pct: 0,
        gera_sabado: false,
        gera_domingo: false,
        gera_feriado: false,
        desconta_falta: true,
        desconta_ferias: true,
        desconta_afastamento: true,
        ativo: true,
        ...regra,
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');

    const set = (k: keyof VrRegra, v: any) => setForm(f => ({ ...f, [k]: v }));

    const handleSave = async () => {
        // Escrita exige organização específica (REGRA #5, exceção 4).
        if (!orgId || orgId === 'all') { setErr('Selecione uma organização específica no topo do módulo antes de criar regras.'); return; }
        if (!form.nome?.trim()) { setErr('Nome é obrigatório'); return; }
        if (!form.valor_diario || form.valor_diario <= 0) { setErr('Valor diário deve ser positivo'); return; }
        setSaving(true);
        try {
            await vrService.upsertRegra({ ...form, org_id: orgId } as any);
            onSaved();
        } catch (e: any) {
            setErr(e.message ?? 'Erro ao salvar');
        } finally {
            setSaving(false);
        }
    };

    const Toggle: React.FC<{ label: string; field: keyof VrRegra }> = ({ label, field }) => (
        <label className="flex items-center gap-3 cursor-pointer select-none">
            <button
                type="button"
                onClick={() => set(field, !form[field])}
                className={`relative w-10 h-5 rounded-full transition-colors ${form[field] ? 'bg-orange-500' : 'bg-slate-200'}`}
            >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form[field] ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-slate-700 font-medium">{label}</span>
        </label>
    );

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-lg font-black text-slate-900">{regra?.id ? 'Editar regra' : 'Nova regra de VR'}</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-[6px] transition-colors"><X className="w-4 h-4 text-slate-500" /></button>
                </div>
                <div className="p-6 space-y-4">
                    {err && <div className="p-3 bg-rose-50 border border-rose-200 rounded-[6px] text-rose-700 text-sm font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{err}</div>}

                    <div className="space-y-1.5">
                        <label className={labelCls}>Nome da regra</label>
                        <input className={inputCls} value={form.nome ?? ''} onChange={e => set('nome', e.target.value)} placeholder="Ex: Pedreiros — Obra A" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className={labelCls}>Tipo</label>
                            <select className={inputCls} value={form.tipo} onChange={e => set('tipo', e.target.value as any)}>
                                <option value="refeicao">Refeição</option>
                                <option value="alimentacao">Alimentação</option>
                                <option value="ambos">Ambos</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelCls}>Obra (opcional)</label>
                            <select className={inputCls} value={form.project_id ?? ''} onChange={e => set('project_id', e.target.value || null)}>
                                <option value="">Todas as obras</option>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className={labelCls}>Valor diário (R$)</label>
                            <input
                                className={inputCls}
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={form.valor_diario ?? ''}
                                onChange={e => set('valor_diario', parseFloat(e.target.value) || 0)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelCls}>Desconto em folha (%)</label>
                            <input
                                className={inputCls}
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={form.desconto_folha_pct ?? 0}
                                onChange={e => set('desconto_folha_pct', parseFloat(e.target.value) || 0)}
                            />
                        </div>
                    </div>

                    <div className="bg-slate-50 rounded-[10px] p-4 space-y-3">
                        <p className={`${labelCls} mb-2`}>Dias que geram benefício</p>
                        <Toggle label="Sábados trabalhados" field="gera_sabado" />
                        <Toggle label="Domingos trabalhados" field="gera_domingo" />
                        <Toggle label="Feriados trabalhados" field="gera_feriado" />
                    </div>

                    <div className="bg-slate-50 rounded-[10px] p-4 space-y-3">
                        <p className={`${labelCls} mb-2`}>Desconta benefício em caso de</p>
                        <Toggle label="Faltas" field="desconta_falta" />
                        <Toggle label="Férias" field="desconta_ferias" />
                        <Toggle label="Afastamentos (INSS, licenças)" field="desconta_afastamento" />
                    </div>
                </div>
                <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
                    <button onClick={onClose} className="h-9 px-4 text-slate-600 font-medium text-sm rounded-[6px] hover:bg-slate-100 transition-colors">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 h-9 px-3.5 bg-orange-500 text-white font-medium text-[13px] rounded-[6px] hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-[15px] h-[15px]" />}
                        Salvar regra
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Aba Regras ───────────────────────────────────────────────────────────────

const REGRAS_COLUMNS: ColumnConfig[] = [
    { key: 'nome', label: 'Nome da regra', sortable: true },
    { key: 'tipo', label: 'Tipo', sortable: true },
    { key: 'obra', label: 'Obra', sortable: true },
    { key: 'valor_diario', label: 'Valor/dia', sortable: true },
    { key: 'desconto_folha_pct', label: 'Desconto folha', sortable: true },
    // Combinam múltiplos toggles (sábado/domingo/feriado, faltas/férias/afastamento)
    // numa única célula — sem valor único comparável para ordenar (§6.3).
    { key: 'dias_especiais', label: 'Dias especiais', sortable: false },
    { key: 'descontos', label: 'Desconta em', sortable: false },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const REGRAS_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    nome: { label: 'Nome da regra', className: 'px-3 py-2 border-r border-gray-100 overflow-hidden' },
    tipo: { label: 'Tipo', className: 'px-3 py-2 border-r border-gray-100 overflow-hidden' },
    obra: { label: 'Obra', className: 'px-3 py-2 border-r border-gray-100 overflow-hidden' },
    valor_diario: { label: 'Valor/dia', className: 'px-3 py-2 border-r border-gray-100 text-right overflow-hidden' },
    desconto_folha_pct: { label: 'Desconto folha', className: 'px-3 py-2 border-r border-gray-100 text-right overflow-hidden' },
    dias_especiais: { label: 'Dias especiais', className: 'px-3 py-2 border-r border-gray-100 overflow-hidden', sortable: false },
    descontos: { label: 'Desconta em', className: 'px-3 py-2 border-r border-gray-100 overflow-hidden', sortable: false },
    status: { label: 'Status', className: 'px-3 py-2 border-r border-gray-100 overflow-hidden' },
};

const DEFAULT_REGRAS_COL_WIDTHS: Record<string, number> = {
    nome: 220, tipo: 110, obra: 160, valor_diario: 100, desconto_folha_pct: 120,
    dias_especiais: 200, descontos: 220, status: 90, actions: 70,
};

// Conteúdo de cada <td> por coluna — função pura para o <tbody> mapear
// `tableColumns.orderedVisibleColumns` (ordem arrastável).
function renderRegraCell(key: string, r: VrRegra, projects: { id: string; name: string }[]): React.ReactNode {
    switch (key) {
        case 'nome':
            return <span className="text-sm font-normal text-gray-900">{r.nome}</span>;
        case 'tipo':
            return <span className="text-sm font-normal text-gray-700">{r.tipo === 'refeicao' ? 'Refeição' : r.tipo === 'alimentacao' ? 'Alimentação' : 'Ambos'}</span>;
        case 'obra':
            return <span className="text-sm font-normal text-gray-600">{r.project_id ? (projects.find(p => p.id === r.project_id)?.name ?? '—') : 'Todas as obras'}</span>;
        case 'valor_diario':
            return <span className="text-sm font-medium text-gray-800 whitespace-nowrap">R$ {r.valor_diario.toFixed(2)}</span>;
        case 'desconto_folha_pct':
            return <span className="text-sm font-normal text-gray-600">{r.desconto_folha_pct > 0 ? `${r.desconto_folha_pct}%` : '—'}</span>;
        case 'dias_especiais': {
            const itens = [r.gera_sabado && 'Sábado', r.gera_domingo && 'Domingo', r.gera_feriado && 'Feriado'].filter(Boolean);
            return <span className="text-sm font-normal text-gray-600">{itens.length ? itens.join(', ') : '—'}</span>;
        }
        case 'descontos': {
            const itens = [r.desconta_falta && 'Faltas', r.desconta_ferias && 'Férias', r.desconta_afastamento && 'Afastamentos'].filter(Boolean);
            return <span className="text-sm font-normal text-gray-600">{itens.length ? itens.join(', ') : 'Nenhum'}</span>;
        }
        case 'status':
            return <span className={`text-sm font-normal ${r.ativo ? 'text-emerald-700' : 'text-gray-500'}`}>{r.ativo ? 'Ativa' : 'Inativa'}</span>;
        default:
            return null;
    }
}

const AbaRegras: React.FC<{ orgId: string | null; projects: { id: string; name: string }[] }> = ({ orgId, projects }) => {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const { notify, Toast } = useToast();
    const { data: regras = [], isLoading } = useQuery({
        queryKey: ['vr_regras', orgId],
        queryFn: () => vrService.listRegras(orgId),
    });
    const [modal, setModal] = useState<Partial<VrRegra> | null | false>(false);
    const [search, setSearch] = usePersistedState('vrRegras:search', '');
    const tableColumns = useTableColumns(REGRAS_COLUMNS, 'vrRegrasColumns');
    const cols = useResizableColumns(DEFAULT_REGRAS_COL_WIDTHS, 'vrRegrasColWidths');

    const del = useMutation({
        mutationFn: (id: string) => vrService.deleteRegra(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['vr_regras', orgId] }); notify('Regra excluída.'); },
        onError: () => notify('Erro ao excluir regra.', 'error'),
    });

    const handleDelete = async (r: VrRegra) => {
        const ok = await confirm({
            title: 'Excluir regra?',
            message: `A regra "${r.nome}" será removida permanentemente.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (ok) del.mutate(r.id);
    };

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        const base = !term ? regras : regras.filter(r => r.nome.toLowerCase().includes(term));
        if (!tableColumns.sortColumn) return base;
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...base].sort((a, b) => {
            switch (tableColumns.sortColumn) {
                case 'nome': return dir * a.nome.localeCompare(b.nome);
                case 'tipo': return dir * a.tipo.localeCompare(b.tipo);
                case 'obra': {
                    const oa = a.project_id ? (projects.find(p => p.id === a.project_id)?.name ?? '') : '';
                    const ob = b.project_id ? (projects.find(p => p.id === b.project_id)?.name ?? '') : '';
                    return dir * oa.localeCompare(ob);
                }
                case 'valor_diario': return dir * (a.valor_diario - b.valor_diario);
                case 'desconto_folha_pct': return dir * (a.desconto_folha_pct - b.desconto_folha_pct);
                case 'status': return dir * (Number(a.ativo) - Number(b.ativo));
                default: return 0;
            }
        });
    }, [regras, search, projects, tableColumns.sortColumn, tableColumns.sortDirection]);

    // Largura = SOMA exata das colunas visíveis (§6.1) — nunca w-full com table-layout:fixed.
    const tableTotalWidth = REGRAS_COLUMNS
        .filter(c => c.key !== 'actions')
        .reduce((sum, c) => sum + (tableColumns.visibleColumns.includes(c.key) ? cols.getWidth(c.key) : 0), 0)
        + cols.getWidth('actions');

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black text-slate-900">Regras de benefício</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Defina valor diário, tipo e critérios de elegibilidade por grupo</p>
                </div>
                <button
                    onClick={() => setModal({})}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-orange-500 text-white text-[13px] font-medium rounded-[6px] hover:bg-orange-600 transition-all active:scale-95"
                >
                    <Plus className="w-[15px] h-[15px]" /> Nova regra
                </button>
            </div>

            {/* Toolbar acoplada à tabela (§5.2) */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white space-y-3">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar regra..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                            />
                        </div>
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={REGRAS_COLUMNS.filter(c => c.key !== 'actions')}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
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

                {isLoading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12">
                        <UtensilsCrossed className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">{regras.length === 0 ? 'Nenhuma regra cadastrada' : 'Nenhuma regra encontrada'}</h3>
                        <p className="text-sm text-gray-500">{regras.length === 0 ? 'Crie uma regra para começar a calcular o vale refeição.' : 'Tente ajustar a busca.'}</p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table ref={cols.tableRef} className="text-sm text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                            <colgroup>
                                {tableColumns.orderedVisibleColumns
                                    .filter(key => key !== 'actions')
                                    .map(key => (
                                        <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                                    ))}
                                {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio */}
                                <col />
                                {tableColumns.visibleColumns.includes('actions') && (
                                    <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                                )}
                            </colgroup>
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.orderedVisibleColumns
                                        .filter(key => key !== 'actions')
                                        .map(key => {
                                            const def = REGRAS_COLUMN_HEADERS[key];
                                            if (!def) return null;
                                            return (
                                                <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                    onSort={tableColumns.handleColumnSort}
                                                    onMoveColumn={tableColumns.moveColumn}
                                                    className={def.className}>
                                                    <cols.ResizeHandle colKey={key} />
                                                </SortableHeader>
                                            );
                                        })}
                                    {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-3 py-2 text-right relative overflow-hidden text-sm font-semibold text-gray-500">
                                            Ações
                                            <cols.ResizeHandle colKey="actions" />
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtered.map(r => (
                                    <tr
                                        key={r.id}
                                        onClick={() => setModal(r)}
                                        className="hover:bg-orange-50/40 transition-colors cursor-pointer"
                                    >
                                        {tableColumns.orderedVisibleColumns
                                            .filter(key => key !== 'actions')
                                            .map(key => (
                                                <td key={key} className={`px-3 py-2.5 border-r border-gray-100 ${key === 'valor_diario' || key === 'desconto_folha_pct' ? 'text-right' : ''}`}>
                                                    {renderRegraCell(key, r, projects)}
                                                </td>
                                            ))}
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                                                <ActionIconButton kind="delete" onClick={() => handleDelete(r)} />
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {modal !== false && (
                <RegraModal
                    regra={modal}
                    orgId={orgId}
                    projects={projects}
                    onClose={() => setModal(false)}
                    onSaved={() => { setModal(false); qc.invalidateQueries({ queryKey: ['vr_regras', orgId] }); notify(modal && (modal as VrRegra).id ? 'Regra atualizada.' : 'Regra criada.'); }}
                />
            )}
            <Toast />
        </div>
    );
};

// ─── Aba Calendário (Feriados) ─────────────────────────────────────────────────

// Texto simples colorido — sem pílula/fundo/uppercase (guia §8).
const ESCOPO_CFG: Record<VrFeriado['escopo'], { label: string; color: string }> = {
    nacional:  { label: 'Nacional',  color: 'text-blue-700' },
    estadual:  { label: 'Estadual',  color: 'text-purple-700' },
    municipal: { label: 'Municipal', color: 'text-teal-700' },
    obra:      { label: 'Obra',      color: 'text-orange-700' },
};

const FERIADOS_COLUMNS: ColumnConfig[] = [
    { key: 'data', label: 'Data', sortable: true },
    { key: 'descricao', label: 'Descrição', sortable: true },
    { key: 'escopo', label: 'Escopo', sortable: true },
    { key: 'obra', label: 'Obra', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const FERIADOS_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    data: { label: 'Data', className: 'px-3 py-2 border-r border-gray-100 overflow-hidden' },
    descricao: { label: 'Descrição', className: 'px-3 py-2 border-r border-gray-100 overflow-hidden' },
    escopo: { label: 'Escopo', className: 'px-3 py-2 border-r border-gray-100 overflow-hidden' },
    obra: { label: 'Obra', className: 'px-3 py-2 border-r border-gray-100 overflow-hidden' },
};

const DEFAULT_FERIADOS_COL_WIDTHS: Record<string, number> = {
    data: 150, descricao: 260, escopo: 120, obra: 160, actions: 70,
};

// Conteúdo de cada <td> por coluna — função pura para o <tbody> mapear
// `tableColumns.orderedVisibleColumns` (ordem arrastável).
function renderFeriadoCell(key: string, f: VrFeriado, projects: { id: string; name: string }[]): React.ReactNode {
    switch (key) {
        case 'data':
            return <span className="text-sm font-normal text-gray-700 whitespace-nowrap capitalize">{new Date(f.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</span>;
        case 'descricao':
            return <span className="text-sm font-normal text-gray-900">{f.descricao}</span>;
        case 'escopo':
            return <span className={`text-sm font-normal ${ESCOPO_CFG[f.escopo].color}`}>{ESCOPO_CFG[f.escopo].label}</span>;
        case 'obra':
            return <span className="text-sm font-normal text-gray-600">{f.project_id ? (projects.find(p => p.id === f.project_id)?.name ?? '—') : 'Todas'}</span>;
        default:
            return null;
    }
}

const AbaCalendario: React.FC<{ orgId: string | null; organizations: { id: string; name: string }[]; projects: { id: string; name: string }[] }> = ({ orgId, organizations, projects }) => {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const { notify, Toast } = useToast();
    const anoAtual = new Date().getFullYear();
    const [ano, setAno] = useState(anoAtual);

    const { data: feriados = [], isLoading } = useQuery({
        queryKey: ['vr_feriados', orgId, ano],
        queryFn: () => vrService.listFeriados(orgId, ano),
    });

    const [form, setForm] = useState({ data: '', descricao: '', escopo: 'municipal' as VrFeriado['escopo'], project_id: '' });
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = usePersistedState('vrFeriados:search', '');
    const tableColumns = useTableColumns(FERIADOS_COLUMNS, 'vrFeriadosColumns');
    const cols = useResizableColumns(DEFAULT_FERIADOS_COL_WIDTHS, 'vrFeriadosColWidths');

    const del = useMutation({
        mutationFn: (id: string) => vrService.deleteFeriado(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['vr_feriados', orgId, ano] }); notify('Feriado excluído.'); },
        onError: () => notify('Erro ao excluir feriado.', 'error'),
    });

    const handleDelete = async (f: VrFeriado) => {
        const ok = await confirm({
            title: 'Excluir feriado?',
            message: `"${f.descricao}" será removido do calendário.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (ok) del.mutate(f.id);
    };

    const handleAdd = async () => {
        if (!form.data || !form.descricao.trim()) return;
        setSaving(true);
        try {
            // Modo consolidado → insere em todas as orgs do usuário
            const orgsAlvo = (!orgId || orgId === 'all')
                ? organizations.map(o => o.id)
                : [orgId];

            for (const oid of orgsAlvo) {
                await vrService.upsertFeriado({
                    org_id: oid,
                    data: form.data,
                    descricao: form.descricao,
                    escopo: form.escopo,
                    project_id: form.project_id || null,
                });
            }
            setForm({ data: '', descricao: '', escopo: 'municipal', project_id: '' });
            qc.invalidateQueries({ queryKey: ['vr_feriados', orgId, ano] });
            notify('Feriado adicionado.');
        } catch (e: any) {
            notify('Erro ao adicionar feriado: ' + (e.message ?? e), 'error');
        } finally {
            setSaving(false);
        }
    };

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        const base = !term ? feriados : feriados.filter(f => f.descricao.toLowerCase().includes(term));
        if (!tableColumns.sortColumn) return base;
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...base].sort((a, b) => {
            switch (tableColumns.sortColumn) {
                case 'data': return dir * a.data.localeCompare(b.data);
                case 'descricao': return dir * a.descricao.localeCompare(b.descricao);
                case 'escopo': return dir * ESCOPO_CFG[a.escopo].label.localeCompare(ESCOPO_CFG[b.escopo].label);
                case 'obra': {
                    const oa = a.project_id ? (projects.find(p => p.id === a.project_id)?.name ?? '') : '';
                    const ob = b.project_id ? (projects.find(p => p.id === b.project_id)?.name ?? '') : '';
                    return dir * oa.localeCompare(ob);
                }
                default: return 0;
            }
        });
    }, [feriados, search, projects, tableColumns.sortColumn, tableColumns.sortDirection]);

    // Largura = SOMA exata das colunas visíveis (§6.1) — nunca w-full com table-layout:fixed.
    const tableTotalWidth = FERIADOS_COLUMNS
        .filter(c => c.key !== 'actions')
        .reduce((sum, c) => sum + (tableColumns.visibleColumns.includes(c.key) ? cols.getWidth(c.key) : 0), 0)
        + cols.getWidth('actions');

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black text-slate-900">Feriados e dias não úteis</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Cadastre feriados nacionais, estaduais, municipais ou específicos por obra</p>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 rounded-[10px] p-1">
                    <button onClick={() => setAno(a => a - 1)} className="h-8 px-3 rounded-[6px] text-sm font-medium text-slate-600 hover:bg-white transition-colors">‹</button>
                    <span className="px-3 text-sm font-black text-slate-900">{ano}</span>
                    <button onClick={() => setAno(a => a + 1)} className="h-8 px-3 rounded-[6px] text-sm font-medium text-slate-600 hover:bg-white transition-colors">›</button>
                </div>
            </div>

            {/* Form add feriado */}
            <div className="bg-orange-50 border border-orange-100 rounded-[10px] p-4">
                <p className="text-xs font-semibold text-orange-700 mb-3">Adicionar feriado</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                        <label className={labelCls}>Data</label>
                        <input type="date" className={inputCls} value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
                    </div>
                    <div className="space-y-1 md:col-span-1">
                        <label className={labelCls}>Descrição</label>
                        <input className={inputCls} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Corpus Christi" />
                    </div>
                    <div className="space-y-1">
                        <label className={labelCls}>Escopo</label>
                        <select className={inputCls} value={form.escopo} onChange={e => setForm(f => ({ ...f, escopo: e.target.value as any }))}>
                            <option value="nacional">Nacional</option>
                            <option value="estadual">Estadual</option>
                            <option value="municipal">Municipal</option>
                            <option value="obra">Obra específica</option>
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className={labelCls}>Obra (opcional)</label>
                        <select className={inputCls} value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
                            <option value="">Todas</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                </div>
                <div className="flex justify-end mt-3">
                    <button onClick={handleAdd} disabled={saving || !form.data || !form.descricao.trim()} className="flex items-center gap-1.5 h-9 px-3.5 bg-orange-500 text-white text-[13px] font-medium rounded-[6px] hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-40">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-[15px] h-[15px]" />}
                        Adicionar
                    </button>
                </div>
            </div>

            {/* Toolbar acoplada à tabela (§5.2) */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white space-y-3">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar feriado..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                            />
                        </div>
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={FERIADOS_COLUMNS.filter(c => c.key !== 'actions')}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
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

                {isLoading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12">
                        <CalendarDays className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">{feriados.length === 0 ? `Nenhum feriado cadastrado para ${ano}` : 'Nenhum feriado encontrado'}</h3>
                        <p className="text-sm text-gray-500">{feriados.length === 0 ? '' : 'Tente ajustar a busca.'}</p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table ref={cols.tableRef} className="text-sm text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                            <colgroup>
                                {tableColumns.orderedVisibleColumns
                                    .filter(key => key !== 'actions')
                                    .map(key => (
                                        <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                                    ))}
                                {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio */}
                                <col />
                                {tableColumns.visibleColumns.includes('actions') && (
                                    <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                                )}
                            </colgroup>
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.orderedVisibleColumns
                                        .filter(key => key !== 'actions')
                                        .map(key => {
                                            const def = FERIADOS_COLUMN_HEADERS[key];
                                            if (!def) return null;
                                            return (
                                                <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                    onSort={tableColumns.handleColumnSort}
                                                    onMoveColumn={tableColumns.moveColumn}
                                                    className={def.className}>
                                                    <cols.ResizeHandle colKey={key} />
                                                </SortableHeader>
                                            );
                                        })}
                                    {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-3 py-2 text-right relative overflow-hidden text-sm font-semibold text-gray-500">
                                            Ações
                                            <cols.ResizeHandle colKey="actions" />
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtered.map(f => (
                                    <tr key={f.id} className="hover:bg-orange-50/40 transition-colors">
                                        {tableColumns.orderedVisibleColumns
                                            .filter(key => key !== 'actions')
                                            .map(key => (
                                                <td key={key} className="px-3 py-2.5 border-r border-gray-100">
                                                    {renderFeriadoCell(key, f, projects)}
                                                </td>
                                            ))}
                                        {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                        <td aria-hidden="true"></td>
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-3 py-2.5 text-right">
                                                <ActionIconButton kind="delete" onClick={() => handleDelete(f)} />
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            <Toast />
        </div>
    );
};

// ─── Aba Cálculo Mensal ───────────────────────────────────────────────────────

const CALCULO_COLUMNS: ColumnConfig[] = [
    { key: 'employee', label: 'Colaborador', sortable: true },
    { key: 'project', label: 'Obra', sortable: true },
    { key: 'dias_uteis', label: 'Dias úteis', sortable: true },
    { key: 'faltas', label: 'Faltas', sortable: true },
    { key: 'ferias', label: 'Férias', sortable: true },
    { key: 'afastamento', label: 'Afastam.', sortable: true },
    { key: 'elegiveis', label: 'Elegíveis', sortable: true },
    { key: 'valor_dia', label: 'Valor/dia', sortable: true },
    { key: 'bruto', label: 'Bruto', sortable: true },
    { key: 'desconto', label: 'Desconto', sortable: true },
    { key: 'liquido', label: 'Líquido', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX. 'actions' não entra (renderizada fixa fora do drag).
const CALCULO_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    employee: { label: 'Colaborador', className: 'px-3 py-2 border-r border-gray-100 overflow-hidden' },
    project: { label: 'Obra', className: 'px-3 py-2 border-r border-gray-100 overflow-hidden' },
    dias_uteis: { label: 'Dias úteis', className: 'px-3 py-2 border-r border-gray-100 text-center overflow-hidden' },
    faltas: { label: 'Faltas', className: 'px-3 py-2 border-r border-gray-100 text-center overflow-hidden' },
    ferias: { label: 'Férias', className: 'px-3 py-2 border-r border-gray-100 text-center overflow-hidden' },
    afastamento: { label: 'Afastam.', className: 'px-3 py-2 border-r border-gray-100 text-center overflow-hidden' },
    elegiveis: { label: 'Elegíveis', className: 'px-3 py-2 border-r border-gray-100 text-center overflow-hidden' },
    valor_dia: { label: 'Valor/dia', className: 'px-3 py-2 border-r border-gray-100 text-right overflow-hidden' },
    bruto: { label: 'Bruto', className: 'px-3 py-2 border-r border-gray-100 text-right overflow-hidden' },
    desconto: { label: 'Desconto', className: 'px-3 py-2 border-r border-gray-100 text-right overflow-hidden' },
    liquido: { label: 'Líquido', className: 'px-3 py-2 border-r border-gray-100 text-right overflow-hidden' },
    status: { label: 'Status', className: 'px-3 py-2 border-r border-gray-100 overflow-hidden' },
};

const DEFAULT_CALCULO_COL_WIDTHS: Record<string, number> = {
    employee: 170, project: 140, dias_uteis: 90, faltas: 80, ferias: 80, afastamento: 90,
    elegiveis: 90, valor_dia: 100, bruto: 100, desconto: 100, liquido: 100, status: 90, actions: 200,
};

interface CalculoCellCtx {
    isEdit: boolean;
    editDias: number;
    setEditDias: (n: number) => void;
}

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna.
function renderCalculoCell(key: string, c: VrCalculo, ctx: CalculoCellCtx): React.ReactNode {
    switch (key) {
        case 'employee':
            return <span className="text-sm font-normal text-gray-900 whitespace-nowrap">{c.employee_name}</span>;
        case 'project':
            return <span className="text-sm font-normal text-gray-500 whitespace-nowrap">{c.project_name || '—'}</span>;
        case 'dias_uteis':
            return <span className="text-sm font-normal text-gray-700">{c.dias_uteis}</span>;
        case 'faltas':
            return <span className="text-sm font-normal text-rose-600">{c.dias_faltas || '—'}</span>;
        case 'ferias':
            return <span className="text-sm font-normal text-indigo-600">{c.dias_ferias || '—'}</span>;
        case 'afastamento':
            return <span className="text-sm font-normal text-amber-600">{c.dias_afastamento || '—'}</span>;
        case 'elegiveis':
            return ctx.isEdit ? (
                <input
                    type="number"
                    min="0"
                    className="w-16 px-2 py-1 border border-orange-300 rounded-[6px] text-center text-sm font-normal"
                    value={ctx.editDias}
                    onChange={e => ctx.setEditDias(parseInt(e.target.value) || 0)}
                />
            ) : (
                <span className="text-sm font-normal text-emerald-700">{c.dias_elegiveis}</span>
            );
        case 'valor_dia':
            return <span className="text-sm font-medium text-gray-700 whitespace-nowrap">R$ {c.valor_diario.toFixed(2)}</span>;
        case 'bruto':
            return <span className="text-sm font-medium text-gray-800 whitespace-nowrap">R$ {c.valor_bruto.toFixed(2)}</span>;
        case 'desconto':
            return <span className="text-sm font-medium text-rose-600 whitespace-nowrap">{c.desconto_folha > 0 ? `- R$ ${c.desconto_folha.toFixed(2)}` : '—'}</span>;
        case 'liquido':
            return <span className="text-sm font-medium text-emerald-700 whitespace-nowrap">R$ {c.valor_liquido.toFixed(2)}</span>;
        case 'status':
            return <span className={`text-sm font-normal ${STATUS_CFG[c.status].color}`}>{STATUS_CFG[c.status].label}</span>;
        default:
            return null;
    }
}

const AbaCalculo: React.FC<{ orgId: string | null; employees: Employee[]; projects: { id: string; name: string }[] }> = ({ orgId, employees, projects }) => {
    const qc = useQueryClient();
    const { notify, Toast } = useToast();
    const hoje = new Date();
    const [ano, setAno] = useState(hoje.getFullYear());
    const [mes, setMes] = useState(hoje.getMonth());
    const mesIso = primeiroDiaMes(ano, mes);

    const [search, setSearch] = usePersistedState('vrCalculo:search', '');
    const [selectedRegra, setSelectedRegra] = useState('');
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [editId, setEditId] = useState<string | null>(null);
    const [editMotivo, setEditMotivo] = useState('');
    const [editDias, setEditDias] = useState(0);
    const [gerandoAll, setGerandoAll] = useState(false);
    const tableColumns = useTableColumns(CALCULO_COLUMNS, 'vrCalculoColumns');
    const cols = useResizableColumns(DEFAULT_CALCULO_COL_WIDTHS, 'vrCalculoColWidths');

    const { data: regras = [] } = useQuery({ queryKey: ['vr_regras', orgId], queryFn: () => vrService.listRegras(orgId) });
    const { data: feriados = [] } = useQuery({ queryKey: ['vr_feriados', orgId, ano], queryFn: () => vrService.listFeriados(orgId, ano) });
    const { data: calculos = [], isLoading, refetch } = useQuery({
        queryKey: ['vr_calculos', orgId, mesIso],
        queryFn: () => vrService.listCalculos(orgId, mesIso),
    });

    const feriadosSet = useMemo(() => new Set(feriados.map(f => f.data)), [feriados]);
    const regra = useMemo(() => regras.find(r => r.id === selectedRegra), [regras, selectedRegra]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        const base = !term ? calculos : calculos.filter(c => (c.employee_name || '').toLowerCase().includes(term) || (c.project_name || '').toLowerCase().includes(term));
        if (!tableColumns.sortColumn) return base;
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...base].sort((a, b) => {
            switch (tableColumns.sortColumn) {
                case 'employee': return dir * (a.employee_name || '').localeCompare(b.employee_name || '');
                case 'project': return dir * (a.project_name || '').localeCompare(b.project_name || '');
                case 'dias_uteis': return dir * (a.dias_uteis - b.dias_uteis);
                case 'faltas': return dir * ((a.dias_faltas || 0) - (b.dias_faltas || 0));
                case 'ferias': return dir * ((a.dias_ferias || 0) - (b.dias_ferias || 0));
                case 'afastamento': return dir * ((a.dias_afastamento || 0) - (b.dias_afastamento || 0));
                case 'elegiveis': return dir * (a.dias_elegiveis - b.dias_elegiveis);
                case 'valor_dia': return dir * (a.valor_diario - b.valor_diario);
                case 'bruto': return dir * (a.valor_bruto - b.valor_bruto);
                case 'desconto': return dir * (a.desconto_folha - b.desconto_folha);
                case 'liquido': return dir * (a.valor_liquido - b.valor_liquido);
                case 'status': return dir * a.status.localeCompare(b.status);
                default: return 0;
            }
        });
    }, [calculos, search, tableColumns.sortColumn, tableColumns.sortDirection]);

    const toggleSel = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        const rascunhos = filtered.filter(c => c.status === 'rascunho').map(c => c.id);
        if (selectedIds.size === rascunhos.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(rascunhos));
    };

    const handleGerarTodos = async () => {
        if (!orgId || orgId === 'all') { notify('Selecione uma organização específica no topo do módulo antes de gerar o cálculo.', 'error'); return; }
        if (!regra) { notify('Selecione uma regra antes de gerar o cálculo.', 'error'); return; }
        const ativos = employees.filter(e => e.status === 'ATIVO');
        if (ativos.length === 0) { notify('Nenhum colaborador ativo.', 'error'); return; }

        setGerandoAll(true);
        try {
            // Busca ausências do mês para todos os funcionários
            const { data: ausencias } = await supabase
                .from('absences')
                .select('employee_id,tipo,data_inicio,data_fim,status')
                .eq('org_id', orgId)
                .gte('data_fim', mesIso)
                .lte('data_inicio', `${ano}-${String(mes + 1).padStart(2, '0')}-${new Date(ano, mes + 1, 0).getDate()}`);

            const ausMap: Record<string, any[]> = {};
            (ausencias ?? []).forEach((a: any) => {
                if (!ausMap[a.employee_id]) ausMap[a.employee_id] = [];
                ausMap[a.employee_id].push(a);
            });

            for (const emp of ativos) {
                await vrService.gerarCalculoMensal({
                    orgId,
                    regraId: regra.id,
                    employeeId: emp.id,
                    projectId: selectedProject || null,
                    mesReferencia: new Date(ano, mes, 1),
                    feriados: Array.from(feriadosSet),
                    ausencias: ausMap[emp.id] ?? [],
                    admissao: (emp as any).hire_date || undefined,
                    desligamento: (emp as any).termination_date || undefined,
                });
            }
            await refetch();
            notify('Cálculo gerado com sucesso.');
        } catch (e: any) {
            notify('Erro ao gerar: ' + e.message, 'error');
        } finally {
            setGerandoAll(false);
        }
    };

    const handleAprovarLote = async () => {
        if (selectedIds.size === 0) return;
        try {
            await vrService.aprovarLote(Array.from(selectedIds));
            setSelectedIds(new Set());
            refetch();
            notify('Selecionados aprovados.');
        } catch (e: any) {
            notify('Erro: ' + e.message, 'error');
        }
    };

    const handleAjuste = async () => {
        if (!editId || !editMotivo.trim()) return;
        try {
            await vrService.ajustarCalculo(editId, 'dias_elegiveis', editDias, editMotivo);
            setEditId(null);
            refetch();
            notify('Ajuste salvo.');
        } catch (e: any) {
            notify('Erro: ' + e.message, 'error');
        }
    };

    const rascunhos = filtered.filter(c => c.status === 'rascunho');
    const aprovadosOuPagos = calculos.filter(c => c.status === 'aprovado' || c.status === 'pago');
    const totalLiquido = aprovadosOuPagos.reduce((s, c) => s + c.valor_liquido, 0);
    const totalBruto = calculos.reduce((s, c) => s + c.valor_bruto, 0);
    const mediaDias = calculos.length ? (calculos.reduce((s, c) => s + c.dias_elegiveis, 0) / calculos.length) : 0;

    // Largura = SOMA exata das colunas visíveis + checkbox fixo de 40px (§6.1).
    const tableTotalWidth = 40
        + CALCULO_COLUMNS.filter(c => c.key !== 'actions')
            .reduce((sum, c) => sum + (tableColumns.visibleColumns.includes(c.key) ? cols.getWidth(c.key) : 0), 0)
        + cols.getWidth('actions');

    return (
        <div className="space-y-5">
            {/* Navegação de mês + geração */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 bg-slate-100 rounded-[10px] p-1">
                    <button onClick={() => { if (mes === 0) { setMes(11); setAno(a => a - 1); } else setMes(m => m - 1); }} className="h-8 px-3 rounded-[6px] text-sm font-medium text-slate-600 hover:bg-white transition-colors">‹</button>
                    <span className="px-3 text-sm font-black text-slate-900 min-w-[120px] text-center">{MESES[mes]}/{ano}</span>
                    <button onClick={() => { if (mes === 11) { setMes(0); setAno(a => a + 1); } else setMes(m => m + 1); }} className="h-8 px-3 rounded-[6px] text-sm font-medium text-slate-600 hover:bg-white transition-colors">›</button>
                </div>
                <select className="h-9 px-3 bg-white border border-slate-200 rounded-[6px] text-sm font-medium outline-none" value={selectedRegra} onChange={e => setSelectedRegra(e.target.value)}>
                    <option value="">Selecionar regra...</option>
                    {regras.map(r => <option key={r.id} value={r.id}>{r.nome} — R$ {r.valor_diario.toFixed(2)}/dia</option>)}
                </select>
                <select className="h-9 px-3 bg-white border border-slate-200 rounded-[6px] text-sm font-medium outline-none" value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
                    <option value="">Todas as obras</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button
                    onClick={handleGerarTodos}
                    disabled={gerandoAll || !selectedRegra}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-orange-500 text-white text-[13px] font-medium rounded-[6px] hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-40 ml-auto"
                >
                    {gerandoAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-[15px] h-[15px]" />}
                    Gerar / recalcular
                </button>
            </div>

            {/* KPIs */}
            {calculos.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KpiCard label="Colaboradores" value={`${calculos.length}`} icon={<Users className="w-5 h-5" />} color="gray" />
                    <KpiCard label="Dias Elegíveis (Média)" value={mediaDias.toFixed(1)} icon={<CalendarDays className="w-5 h-5" />} color="orange" />
                    <KpiCard label="Total Bruto" value={`R$ ${totalBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<Wallet className="w-5 h-5" />} color="blue" />
                    <KpiCard label="Total Líquido (Aprovados)" value={`R$ ${totalLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<CheckCheck className="w-5 h-5" />} color="emerald" />
                </div>
            )}

            {/* Toolbar acoplada à tabela (§5.2) */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white space-y-3">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar colaborador ou obra..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                            />
                        </div>
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={CALCULO_COLUMNS.filter(c => c.key !== 'actions')}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
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

                {isLoading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12">
                        <Calculator className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum cálculo para {MESES[mes]}/{ano}</h3>
                        <p className="text-sm text-gray-500">Selecione uma regra e clique em "Gerar / recalcular".</p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table ref={cols.tableRef} className="text-sm text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                            <colgroup>
                                {/* checkbox — largura fixa, fora do redimensionamento */}
                                <col style={{ width: '40px' }} />
                                {tableColumns.orderedVisibleColumns
                                    .filter(key => key !== 'actions')
                                    .map(key => (
                                        <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                                    ))}
                                {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio */}
                                <col />
                                {tableColumns.visibleColumns.includes('actions') && (
                                    <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                                )}
                            </colgroup>
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
                                        <input type="checkbox" onChange={toggleAll} checked={rascunhos.length > 0 && selectedIds.size === rascunhos.length} className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer" />
                                    </th>
                                    {tableColumns.orderedVisibleColumns
                                        .filter(key => key !== 'actions')
                                        .map(key => {
                                            const def = CALCULO_COLUMN_HEADERS[key];
                                            if (!def) return null;
                                            return (
                                                <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                    onSort={tableColumns.handleColumnSort}
                                                    onMoveColumn={tableColumns.moveColumn}
                                                    className={def.className}>
                                                    <cols.ResizeHandle colKey={key} />
                                                </SortableHeader>
                                            );
                                        })}
                                    {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-3 py-2 text-right relative overflow-hidden text-sm font-semibold text-gray-500">
                                            Ações
                                            <cols.ResizeHandle colKey="actions" />
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtered.map(c => {
                                    const isEdit = editId === c.id;
                                    return (
                                        <tr key={c.id} className="hover:bg-orange-50/40 transition-colors">
                                            <td className="px-4 py-2.5 border-r border-gray-100 text-center">
                                                {c.status === 'rascunho' && (
                                                    <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSel(c.id)} className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer" />
                                                )}
                                            </td>
                                            {tableColumns.orderedVisibleColumns
                                                .filter(key => key !== 'actions')
                                                .map(key => (
                                                    <td key={key} className={`px-3 py-2.5 border-r border-gray-100 ${key === 'dias_uteis' || key === 'faltas' || key === 'ferias' || key === 'afastamento' || key === 'elegiveis' ? 'text-center' : ''} ${key === 'valor_dia' || key === 'bruto' || key === 'desconto' || key === 'liquido' ? 'text-right' : ''}`}>
                                                        {renderCalculoCell(key, c, { isEdit, editDias, setEditDias })}
                                                    </td>
                                                ))}
                                            {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                            <td aria-hidden="true"></td>
                                            {tableColumns.visibleColumns.includes('actions') && (
                                                <td className="px-3 py-2.5 text-right">
                                                    {c.status === 'rascunho' && !isEdit && (
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <ActionIconButton kind="edit" title="Ajustar dias elegíveis" onClick={() => { setEditId(c.id); setEditDias(c.dias_elegiveis); setEditMotivo(''); }} />
                                                            <ActionIconButton kind="edit" icon={<Check className="w-4 h-4" />} title="Aprovar" onClick={async () => { await vrService.aprovarLote([c.id]); refetch(); notify('Aprovado.'); }} />
                                                        </div>
                                                    )}
                                                    {isEdit && (
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <input
                                                                className="w-32 h-8 px-2 border border-gray-200 rounded-[6px] text-xs"
                                                                placeholder="Motivo do ajuste*"
                                                                value={editMotivo}
                                                                onChange={e => setEditMotivo(e.target.value)}
                                                            />
                                                            <button onClick={handleAjuste} disabled={!editMotivo.trim()} className="h-8 w-8 flex items-center justify-center bg-emerald-500 text-white rounded-[6px] disabled:opacity-40">
                                                                <Save className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button onClick={() => setEditId(null)} className="h-8 w-8 flex items-center justify-center bg-gray-100 text-gray-600 rounded-[6px]">
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Barra de ações em lote (fixa, §10) */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-orange-600 text-white rounded-2xl shadow-lg shadow-orange-900/20">
                    <span className="text-sm font-bold whitespace-nowrap">{selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}</span>
                    <button onClick={handleAprovarLote} className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-orange-700 text-[13px] font-medium rounded-[6px] hover:bg-orange-50 transition-all active:scale-95">
                        <CheckCheck className="w-[15px] h-[15px]" /> Aprovar selecionados
                    </button>
                    <button onClick={() => setSelectedIds(new Set())} className="h-9 px-3 text-sm font-medium text-white/80 hover:text-white">
                        Limpar
                    </button>
                </div>
            )}
            <Toast />
        </div>
    );
};

// ─── Aba Aprovados ────────────────────────────────────────────────────────────

const APROVADOS_COLUMNS: ColumnConfig[] = [
    { key: 'employee', label: 'Colaborador', sortable: true },
    { key: 'project', label: 'Obra', sortable: true },
    { key: 'elegiveis', label: 'Elegíveis', sortable: true },
    { key: 'valor_dia', label: 'Valor/dia', sortable: true },
    { key: 'bruto', label: 'Bruto', sortable: true },
    { key: 'desconto', label: 'Desconto', sortable: true },
    { key: 'liquido', label: 'Líquido', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
];

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX.
const APROVADOS_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    employee: { label: 'Colaborador', className: 'px-4 py-2 border-r border-gray-100 overflow-hidden' },
    project: { label: 'Obra', className: 'px-3 py-2 border-r border-gray-100 overflow-hidden' },
    elegiveis: { label: 'Elegíveis', className: 'px-3 py-2 border-r border-gray-100 text-center overflow-hidden' },
    valor_dia: { label: 'Valor/dia', className: 'px-3 py-2 border-r border-gray-100 text-right overflow-hidden' },
    bruto: { label: 'Bruto', className: 'px-3 py-2 border-r border-gray-100 text-right overflow-hidden' },
    desconto: { label: 'Desconto', className: 'px-3 py-2 border-r border-gray-100 text-right overflow-hidden' },
    liquido: { label: 'Líquido', className: 'px-3 py-2 border-r border-gray-100 text-right overflow-hidden' },
    status: { label: 'Status', className: 'px-4 py-2 overflow-hidden' },
};

const DEFAULT_APROVADOS_COL_WIDTHS: Record<string, number> = {
    employee: 180, project: 150, elegiveis: 90, valor_dia: 100, bruto: 100, desconto: 100, liquido: 100, status: 100,
};

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna.
function renderAprovadosCell(key: string, c: VrCalculo): React.ReactNode {
    switch (key) {
        case 'employee':
            return <span className="text-sm font-normal text-gray-900 whitespace-nowrap">{c.employee_name}</span>;
        case 'project':
            return <span className="text-sm font-normal text-gray-500 whitespace-nowrap">{c.project_name || '—'}</span>;
        case 'elegiveis':
            return <span className="text-sm font-normal text-emerald-700">{c.dias_elegiveis}</span>;
        case 'valor_dia':
            return <span className="text-sm font-medium text-gray-700 whitespace-nowrap">R$ {c.valor_diario.toFixed(2)}</span>;
        case 'bruto':
            return <span className="text-sm font-medium text-gray-800 whitespace-nowrap">R$ {c.valor_bruto.toFixed(2)}</span>;
        case 'desconto':
            return <span className="text-sm font-medium text-rose-600 whitespace-nowrap">{c.desconto_folha > 0 ? `- R$ ${c.desconto_folha.toFixed(2)}` : '—'}</span>;
        case 'liquido':
            return <span className="text-sm font-medium text-emerald-700 whitespace-nowrap">R$ {c.valor_liquido.toFixed(2)}</span>;
        case 'status':
            return <span className={`text-sm font-normal ${STATUS_CFG[c.status].color}`}>{STATUS_CFG[c.status].label}</span>;
        default:
            return null;
    }
}

const AbaAprovados: React.FC<{ orgId: string | null }> = ({ orgId }) => {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const { notify, Toast } = useToast();
    const hoje = new Date();
    const [ano, setAno] = useState(hoje.getFullYear());
    const [mes, setMes] = useState(hoje.getMonth());
    const mesIso = primeiroDiaMes(ano, mes);
    const [search, setSearch] = usePersistedState('vrAprovados:search', '');
    const tableColumns = useTableColumns(APROVADOS_COLUMNS, 'vrAprovadosColumns');
    const cols = useResizableColumns(DEFAULT_APROVADOS_COL_WIDTHS, 'vrAprovadosColWidths');

    const { data: calculos = [], isLoading } = useQuery({
        queryKey: ['vr_calculos', orgId, mesIso],
        queryFn: () => vrService.listCalculos(orgId, mesIso),
    });

    const enviarFolha = useMutation({
        mutationFn: () => vrService.enviarLoteParaFolha(orgId!, mesIso),
        onSuccess: (r) => {
            qc.invalidateQueries({ queryKey: ['vr_calculos', orgId, mesIso] });
            if (r.colaboradores === 0) notify('Nenhum benefício aprovado para enviar neste mês.', 'error');
            else notify(`Enviado à folha: ${r.colaboradores} colaborador(es), ${r.descontos} desconto(s) e ${r.informativos} informativo(s).`);
        },
        onError: (e: any) => notify('Erro ao enviar para a folha: ' + (e.message ?? e), 'error'),
    });

    const handleEnviarFolha = async () => {
        // Envio à folha grava: exige organização específica (REGRA #5, exceção 4).
        if (!orgId || orgId === 'all') { notify('Selecione uma organização específica no topo do módulo antes de enviar à folha.', 'error'); return; }
        const ok = await confirm({
            title: 'Enviar lote para a folha?',
            message: `Os benefícios aprovados de ${MESES[mes]}/${ano} serão lançados na folha (desconto da coparticipação + valor informativo) e marcados como "Pago". A ação pode ser repetida sem duplicar.`,
            confirmLabel: 'Enviar para folha',
        });
        if (ok) enviarFolha.mutate();
    };

    const aprovados = useMemo(
        () => calculos.filter(c => c.status === 'aprovado' || c.status === 'pago'),
        [calculos]
    );

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        const base = !term ? aprovados : aprovados.filter(c => (c.employee_name || '').toLowerCase().includes(term) || (c.project_name || '').toLowerCase().includes(term));
        if (!tableColumns.sortColumn) return base;
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...base].sort((a, b) => {
            switch (tableColumns.sortColumn) {
                case 'employee': return dir * (a.employee_name || '').localeCompare(b.employee_name || '');
                case 'project': return dir * (a.project_name || '').localeCompare(b.project_name || '');
                case 'elegiveis': return dir * (a.dias_elegiveis - b.dias_elegiveis);
                case 'valor_dia': return dir * (a.valor_diario - b.valor_diario);
                case 'bruto': return dir * (a.valor_bruto - b.valor_bruto);
                case 'desconto': return dir * (a.desconto_folha - b.desconto_folha);
                case 'liquido': return dir * (a.valor_liquido - b.valor_liquido);
                case 'status': return dir * a.status.localeCompare(b.status);
                default: return 0;
            }
        });
    }, [aprovados, search, tableColumns.sortColumn, tableColumns.sortDirection]);

    const totalLiquido = aprovados.reduce((s, c) => s + c.valor_liquido, 0);
    const totalBruto = aprovados.reduce((s, c) => s + c.valor_bruto, 0);
    const totalDesconto = aprovados.reduce((s, c) => s + c.desconto_folha, 0);

    // Largura = SOMA exata das colunas visíveis (§6.1) — esta tabela não tem coluna de ações.
    const tableTotalWidth = APROVADOS_COLUMNS
        .reduce((sum, c) => sum + (tableColumns.visibleColumns.includes(c.key) ? cols.getWidth(c.key) : 0), 0);

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black text-slate-900">Aprovados</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Relação de colaboradores com benefício aprovado e valor total do lote</p>
                </div>
                <div className="flex items-center gap-3">
                <button
                    onClick={handleEnviarFolha}
                    disabled={enviarFolha.isPending || aprovados.length === 0}
                    title={aprovados.length === 0 ? 'Aprove cálculos na aba "Cálculo Mensal" para habilitar o envio' : 'Lança desconto e informativo na folha do mês'}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-orange-500 text-white text-[13px] font-medium rounded-[6px] hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-40"
                >
                    {enviarFolha.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-[15px] h-[15px]" />}
                    Enviar p/ folha
                </button>
                <div className="flex items-center gap-1 bg-slate-100 rounded-[10px] p-1">
                    <button onClick={() => { if (mes === 0) { setMes(11); setAno(a => a - 1); } else setMes(m => m - 1); }} className="h-8 px-3 rounded-[6px] text-sm font-medium text-slate-600 hover:bg-white transition-colors">‹</button>
                    <span className="px-3 text-sm font-black text-slate-900 min-w-[120px] text-center">{MESES[mes]}/{ano}</span>
                    <button onClick={() => { if (mes === 11) { setMes(0); setAno(a => a + 1); } else setMes(m => m + 1); }} className="h-8 px-3 rounded-[6px] text-sm font-medium text-slate-600 hover:bg-white transition-colors">›</button>
                </div>
                </div>
            </div>

            {aprovados.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KpiCard label="Colaboradores Aprovados" value={`${aprovados.length}`} icon={<Users className="w-5 h-5" />} color="gray" />
                    <KpiCard label="Total Bruto" value={`R$ ${totalBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<TrendingUp className="w-5 h-5" />} color="blue" />
                    <KpiCard label="Total Descontos" value={`R$ ${totalDesconto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<TrendingDown className="w-5 h-5" />} color="rose" />
                    <KpiCard label="Total Líquido" value={`R$ ${totalLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<Wallet className="w-5 h-5" />} color="emerald" />
                </div>
            )}

            {/* Toolbar acoplada à tabela (§5.2) */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white space-y-3">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar colaborador ou obra..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                            />
                        </div>
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={APROVADOS_COLUMNS}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
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

                {isLoading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12">
                        <CheckCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum benefício aprovado em {MESES[mes]}/{ano}</h3>
                        <p className="text-sm text-gray-500">Aprove os cálculos na aba "Cálculo Mensal" para vê-los aqui.</p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table ref={cols.tableRef} className="text-sm text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                            <colgroup>
                                {tableColumns.orderedVisibleColumns.map(key => (
                                    <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                                ))}
                            </colgroup>
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.orderedVisibleColumns.map(key => {
                                        const def = APROVADOS_COLUMN_HEADERS[key];
                                        if (!def) return null;
                                        return (
                                            <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                onMoveColumn={tableColumns.moveColumn}
                                                className={def.className}>
                                                <cols.ResizeHandle colKey={key} />
                                            </SortableHeader>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtered.map(c => {
                                    return (
                                        <tr key={c.id} className="hover:bg-orange-50/40 transition-colors">
                                            {tableColumns.orderedVisibleColumns.map(key => (
                                                <td key={key} className={`px-3 py-2.5 border-r border-gray-100 last:border-r-0 ${key === 'employee' ? 'px-4' : ''} ${key === 'elegiveis' ? 'text-center' : ''} ${key === 'valor_dia' || key === 'bruto' || key === 'desconto' || key === 'liquido' ? 'text-right' : ''} ${key === 'status' ? 'px-4' : ''}`}>
                                                    {renderAprovadosCell(key, c)}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-gray-50 border-t-2 border-gray-200">
                                    <td colSpan={tableColumns.visibleColumns.filter(k => k !== 'liquido' && k !== 'status').length} className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Total do lote</td>
                                    {tableColumns.visibleColumns.includes('liquido') && (
                                        <td className="px-3 py-2.5 text-right text-sm font-semibold text-emerald-700 whitespace-nowrap">R$ {totalLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    )}
                                    {tableColumns.visibleColumns.includes('status') && <td></td>}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
            <Toast />
        </div>
    );
};

// ─── Aba Histórico ────────────────────────────────────────────────────────────

const HISTORICO_COLUMNS: ColumnConfig[] = [
    { key: 'mes', label: 'Mês', sortable: true },
    { key: 'employee', label: 'Colaborador', sortable: true },
    { key: 'project', label: 'Obra', sortable: true },
    { key: 'elegiveis', label: 'Dias elegíveis', sortable: true },
    { key: 'liquido', label: 'Líquido', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
];

const HISTORICO_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    mes: { label: 'Mês', className: 'px-4 py-2 border-r border-gray-100 overflow-hidden' },
    employee: { label: 'Colaborador', className: 'px-3 py-2 border-r border-gray-100 overflow-hidden' },
    project: { label: 'Obra', className: 'px-3 py-2 border-r border-gray-100 overflow-hidden' },
    elegiveis: { label: 'Dias elegíveis', className: 'px-3 py-2 border-r border-gray-100 text-center overflow-hidden' },
    liquido: { label: 'Líquido', className: 'px-3 py-2 border-r border-gray-100 text-right overflow-hidden' },
    status: { label: 'Status', className: 'px-4 py-2 overflow-hidden' },
};

const DEFAULT_HISTORICO_COL_WIDTHS: Record<string, number> = {
    mes: 130, employee: 180, project: 150, elegiveis: 120, liquido: 100, status: 100,
};

// Conteúdo de cada <td> por coluna — função pura para o <tbody> mapear
// `tableColumns.orderedVisibleColumns` (ordem arrastável).
function renderHistoricoCell(key: string, c: VrCalculo): React.ReactNode {
    switch (key) {
        case 'mes': {
            const label = mesLabel(c.mes_referencia);
            return <span className="text-sm font-normal text-gray-900 whitespace-nowrap">{label.charAt(0).toUpperCase() + label.slice(1)}</span>;
        }
        case 'employee':
            return <span className="text-sm font-normal text-gray-900 whitespace-nowrap">{c.employee_name}</span>;
        case 'project':
            return <span className="text-sm font-normal text-gray-500 whitespace-nowrap">{c.project_name || '—'}</span>;
        case 'elegiveis':
            return <span className="text-sm font-normal text-emerald-700">{c.dias_elegiveis}</span>;
        case 'liquido':
            return <span className="text-sm font-medium text-emerald-700 whitespace-nowrap">R$ {c.valor_liquido.toFixed(2)}</span>;
        case 'status':
            return <span className={`text-sm font-normal ${STATUS_CFG[c.status].color}`}>{STATUS_CFG[c.status].label}</span>;
        default:
            return null;
    }
}

const AbaHistorico: React.FC<{ orgId: string | null }> = ({ orgId }) => {
    const [search, setSearch] = usePersistedState('vrHistorico:search', '');
    const tableColumns = useTableColumns(HISTORICO_COLUMNS, 'vrHistoricoColumns');
    const cols = useResizableColumns(DEFAULT_HISTORICO_COL_WIDTHS, 'vrHistoricoColWidths');
    const { data: calculos = [], isLoading } = useQuery({
        queryKey: ['vr_calculos_hist', orgId],
        queryFn: () => vrService.listCalculos(orgId),
    });

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        const base = !term ? calculos : calculos.filter(c => (c.employee_name || '').toLowerCase().includes(term) || (c.project_name || '').toLowerCase().includes(term));
        const dir = tableColumns.sortColumn ? (tableColumns.sortDirection === 'asc' ? 1 : -1) : 1;
        return [...base].sort((a, b) => {
            switch (tableColumns.sortColumn) {
                case 'mes': return dir * a.mes_referencia.localeCompare(b.mes_referencia);
                case 'employee': return dir * (a.employee_name || '').localeCompare(b.employee_name || '');
                case 'project': return dir * (a.project_name || '').localeCompare(b.project_name || '');
                case 'elegiveis': return dir * (a.dias_elegiveis - b.dias_elegiveis);
                case 'liquido': return dir * (a.valor_liquido - b.valor_liquido);
                case 'status': return dir * a.status.localeCompare(b.status);
                // Sem coluna selecionada: mês mais recente primeiro, colaborador A-Z como desempate (§6.4).
                default: return b.mes_referencia.localeCompare(a.mes_referencia) || (a.employee_name || '').localeCompare(b.employee_name || '');
            }
        });
    }, [calculos, search, tableColumns.sortColumn, tableColumns.sortDirection]);

    // Largura = SOMA exata das colunas visíveis (§6.1) — esta tabela não tem coluna de ações.
    const tableTotalWidth = HISTORICO_COLUMNS
        .reduce((sum, c) => sum + (tableColumns.visibleColumns.includes(c.key) ? cols.getWidth(c.key) : 0), 0);

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-sm font-black text-slate-900">Histórico de cálculos</h3>
                <p className="text-xs text-slate-500 mt-0.5">Todos os cálculos mensais registrados</p>
            </div>

            {/* Toolbar acoplada à tabela (§5.2) */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white space-y-3">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar colaborador ou obra..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                            />
                        </div>
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={HISTORICO_COLUMNS}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
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

                {isLoading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12">
                        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum histórico encontrado</h3>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table ref={cols.tableRef} className="text-sm text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                            <colgroup>
                                {tableColumns.orderedVisibleColumns.map(key => (
                                    <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                                ))}
                            </colgroup>
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.orderedVisibleColumns.map(key => {
                                        const def = HISTORICO_COLUMN_HEADERS[key];
                                        if (!def) return null;
                                        return (
                                            <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                onMoveColumn={tableColumns.moveColumn}
                                                className={def.className}>
                                                <cols.ResizeHandle colKey={key} />
                                            </SortableHeader>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtered.map(c => (
                                    <tr key={c.id} className="hover:bg-orange-50/40 transition-colors">
                                        {tableColumns.orderedVisibleColumns.map(key => (
                                            <td key={key} className={`px-3 py-2.5 border-r border-gray-100 last:border-r-0 ${key === 'mes' || key === 'status' ? 'px-4' : ''} ${key === 'elegiveis' ? 'text-center' : ''} ${key === 'liquido' ? 'text-right' : ''}`}>
                                                {renderHistoricoCell(key, c)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

type VrTab = 'regras' | 'calendario' | 'calculo' | 'aprovados' | 'historico';

interface LaborValeRefeicaoProps {
    orgId: string | null;
    organizations: { id: string; name: string }[];
    employees: Employee[];
    projects: { id: string; name: string }[];
    onRefresh: () => void;
}

const TABS: { id: VrTab; label: string; icon: React.ElementType }[] = [
    { id: 'regras',     label: 'Regras',         icon: Settings },
    { id: 'calendario', label: 'Feriados',        icon: CalendarDays },
    { id: 'calculo',    label: 'Cálculo Mensal',  icon: Calculator },
    { id: 'aprovados',  label: 'Aprovados',       icon: CheckCheck },
    { id: 'historico',  label: 'Histórico',       icon: FileText },
];

const LaborValeRefeicao: React.FC<LaborValeRefeicaoProps> = ({ orgId, organizations, employees, projects, onRefresh }) => {
    const [tab, setTab] = usePersistedState<VrTab>('laborValeRefeicao:tab', 'calculo');

    return (
        <div className="space-y-6">
            {/* Cabeçalho de tela (§20) */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Vale Refeição / Alimentação</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Cálculo automático mensal por dias elegíveis trabalhados.</p>
            </div>

            <LaborScopeBar
                onRefresh={onRefresh}
            />

            {/* Abas */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-[10px] w-fit overflow-x-auto">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 h-9 px-3.5 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${tab === t.id ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <t.icon className="w-4 h-4" />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            {tab === 'regras'     && <AbaRegras orgId={orgId} projects={projects} />}
            {tab === 'calendario' && <AbaCalendario orgId={orgId} organizations={organizations} projects={projects} />}
            {tab === 'calculo'    && <AbaCalculo orgId={orgId} employees={employees} projects={projects} />}
            {tab === 'aprovados'  && <AbaAprovados orgId={orgId} />}
            {tab === 'historico'  && <AbaHistorico orgId={orgId} />}
        </div>
    );
};

export default LaborValeRefeicao;
