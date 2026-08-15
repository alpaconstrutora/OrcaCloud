// components/condominio/AtivosTab.tsx
// Ativos instalados do edifício e a garantia do FORNECEDOR — F2.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// A garantia daqui não é a de `warranty_terms`: aquela é da CONSTRUTORA ao
// comprador, com prazo contado da entrega do imóvel. Esta é do FORNECEDOR do
// equipamento, corre da instalação e é contra quem vendeu a bomba. Confundi-las
// faz o condomínio cobrar da parte errada e descobrir tarde que o prazo da
// certa já venceu — por isso a coluna de garantia mostra os dias, não só a data.
import React from 'react';
import { Package, ShieldCheck, ShieldAlert, Search, RefreshCw, Plus, AlertCircle } from 'lucide-react';
import {
    ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState,
} from '../ui/TableUtils';
import { KpiCard } from '../ui/KpiCard';
import { InlineDisclosureMenu } from '../ui/inline-disclosure-menu';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import { buildingAssetService, type BuildingAssetRow } from '../../services/buildingAssetService';
import { maintenanceService } from '../../services/maintenanceService';
import type { BuildingSystem } from '../../types/condominio';
import type { Empreendimento } from '../../types/empreendimento';

const COLUMNS: ColumnConfig[] = [
    { key: 'codigo', label: 'Código', sortable: true },
    { key: 'nome', label: 'Equipamento', sortable: true },
    { key: 'sistema', label: 'Sistema', sortable: true },
    { key: 'marca', label: 'Marca / modelo', sortable: true },
    { key: 'serie', label: 'Nº de série', sortable: true },
    { key: 'instalacao', label: 'Instalação', sortable: true },
    { key: 'garantia', label: 'Garantia do fornecedor', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

function formatarData(iso?: string | null): string {
    if (!iso) return '—';
    const [a, m, d] = iso.slice(0, 10).split('-');
    return d && m && a ? `${d}/${m}/${a}` : '—';
}
function hojeISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A garantia é o dado que a tela existe para vigiar — a cor carrega o sentido. */
function textoGarantia(dias: number | null, ate?: string | null): { texto: string; cor: string } {
    if (dias == null) return { texto: 'Não informada', cor: 'text-gray-400' };
    if (dias < 0) return { texto: `${formatarData(ate)} · vencida`, cor: 'text-red-600' };
    if (dias <= 90) return { texto: `${formatarData(ate)} · vence em ${dias}d`, cor: 'text-amber-600' };
    return { texto: formatarData(ate), cor: 'text-emerald-600' };
}

interface Props { empreendimento: Empreendimento }

const AtivosTab: React.FC<Props> = ({ empreendimento }) => {
    const confirm = useConfirm();
    const orgId = empreendimento.organization_id;

    const [searchTerm, setSearchTerm] = usePersistedState<string>('condominio:ativos:search', '');
    const tableColumns = useTableColumns(COLUMNS, 'ativosPrediaisColumns');

    const [ativos, setAtivos] = React.useState<BuildingAssetRow[]>([]);
    const [sistemas, setSistemas] = React.useState<BuildingSystem[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [sheetAberto, setSheetAberto] = React.useState(false);
    const [salvando, setSalvando] = React.useState(false);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const [form, setForm] = React.useState({
        name: '', building_system_id: '', brand: '', model: '', serial_number: '',
        purchase_date: hojeISO(), supplier_warranty_until: '', notes: '',
    });

    const carregar = React.useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            const sys = await maintenanceService.listSystems(orgId);
            setSistemas(sys);
            setAtivos(await buildingAssetService.listByEmpreendimento(empreendimento.id, sys));
        } catch (e: any) {
            setErro(e?.message || 'Erro ao carregar os ativos.');
        } finally {
            setLoading(false);
        }
    }, [empreendimento.id, orgId]);

    React.useEffect(() => { carregar(); }, [carregar]);

    const kpis = React.useMemo(() => ({
        total: ativos.length,
        vencidas: ativos.filter(a => a._dias_garantia != null && a._dias_garantia < 0).length,
        vencendo: ativos.filter(a => a._dias_garantia != null && a._dias_garantia >= 0 && a._dias_garantia <= 90).length,
        semGarantia: ativos.filter(a => !a.supplier_warranty_until).length,
    }), [ativos]);

    const filtrados = React.useMemo(() => {
        const t = searchTerm.trim().toLowerCase();
        const base = t
            ? ativos.filter(a =>
                a.name.toLowerCase().includes(t)
                || a.code.toLowerCase().includes(t)
                || a._system_name.toLowerCase().includes(t)
                || (a.brand || '').toLowerCase().includes(t)
                || (a.serial_number || '').toLowerCase().includes(t))
            : ativos;

        const valor = (a: BuildingAssetRow, col: string): string | number => {
            switch (col) {
                case 'codigo': return a.code;
                case 'nome': return a.name;
                case 'sistema': return a._system_name;
                case 'marca': return `${a.brand || ''} ${a.model || ''}`.trim();
                case 'serie': return a.serial_number || '';
                case 'instalacao': return a.purchase_date || '';
                case 'garantia': return a._dias_garantia ?? 999999;
                default: return '';
            }
        };

        return [...base].sort((a, b) => {
            if (tableColumns.sortColumn) {
                const va = valor(a, tableColumns.sortColumn);
                const vb = valor(b, tableColumns.sortColumn);
                const cmp = typeof va === 'number' && typeof vb === 'number'
                    ? va - vb
                    : String(va).localeCompare(String(vb), 'pt-BR');
                return tableColumns.sortDirection === 'desc' ? -cmp : cmp;
            }
            return a.name.localeCompare(b.name, 'pt-BR', { numeric: true });
        });
    }, [ativos, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection]);

    const salvar = async () => {
        if (!form.name.trim()) { notify('Informe o nome do equipamento.', 'error'); return; }
        setSalvando(true);
        try {
            const criado = await buildingAssetService.create({
                organization_id: orgId,
                empreendimento_id: empreendimento.id,
                name: form.name.trim(),
                building_system_id: form.building_system_id || null,
                brand: form.brand || null,
                model: form.model || null,
                serial_number: form.serial_number || null,
                purchase_date: form.purchase_date || null,
                supplier_warranty_until: form.supplier_warranty_until || null,
                notes: form.notes || null,
            });
            // §22 — atualiza o array local, sem recarregar a aba.
            setAtivos(prev => [{
                ...criado,
                _system_name: sistemas.find(s => s.id === criado.building_system_id)?.name || '—',
                _dias_garantia: criado.supplier_warranty_until
                    ? Math.round((Date.parse(criado.supplier_warranty_until) - Date.now()) / 86400000)
                    : null,
            } as BuildingAssetRow, ...prev]);
            setSheetAberto(false);
            setForm(f => ({ ...f, name: '', serial_number: '', supplier_warranty_until: '' }));
            notify(`${criado.name} cadastrado como ${criado.code}.`);
        } catch (e: any) {
            notify(e?.message || 'Erro ao cadastrar o ativo.', 'error');
        } finally {
            setSalvando(false);
        }
    };

    const excluir = async (a: BuildingAssetRow) => {
        const ok = await confirm({
            title: 'Excluir o equipamento?',
            message: `${a.name} (${a.code}) sai do cadastro do edifício. O histórico técnico dele — manutenções e ordens ligadas — perde a âncora.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await buildingAssetService.remove(a.id);
            setAtivos(prev => prev.filter(x => x.id !== a.id));
            notify('Equipamento excluído.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao excluir.', 'error');
        }
    };

    const v = tableColumns.visibleColumns;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                <KpiCard label="EQUIPAMENTOS" value={kpis.total} icon={<Package className="w-5 h-5" />} color="blue" />
                <KpiCard
                    label="GARANTIA VENCIDA" value={kpis.vencidas}
                    sub={kpis.vencidas > 0 ? 'Conserto passa a ser custo do condomínio' : undefined}
                    icon={<ShieldAlert className="w-5 h-5" />}
                    color={kpis.vencidas > 0 ? 'red' : 'gray'}
                />
                <KpiCard
                    label="VENCE EM 90 DIAS" value={kpis.vencendo}
                    icon={<ShieldAlert className="w-5 h-5" />}
                    color={kpis.vencendo > 0 ? 'amber' : 'gray'}
                />
                <KpiCard
                    label="SEM GARANTIA INFORMADA" value={kpis.semGarantia}
                    icon={<ShieldCheck className="w-5 h-5" />}
                    color={kpis.semGarantia > 0 ? 'indigo' : 'gray'}
                />
            </div>

            {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm">{erro}</div>
            )}

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por equipamento, código, sistema, marca ou série..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button
                            onClick={carregar}
                            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                            title="Recarregar"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={COLUMNS.filter(c => c.key !== 'actions')}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                        </div>
                        <button
                            onClick={() => setSheetAberto(true)}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                        >
                            <Plus className="w-[15px] h-[15px]" /> Novo equipamento
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtrados.length === 0 ? (
                    <div className="text-center py-12">
                        <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">
                            {ativos.length === 0 ? 'Nenhum equipamento cadastrado' : 'Nenhum resultado'}
                        </h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                            {ativos.length === 0
                                ? 'Elevador, bomba, gerador e portão são ativos do edifício. Cadastrá-los é o que dá ao plano de manutenção um alvo concreto — e o que faz a garantia do fornecedor ser cobrável.'
                                : 'Tente ajustar a busca.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {v.includes('codigo') && <SortableHeader colKey="codigo" label="Código" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('nome') && <SortableHeader colKey="nome" label="Equipamento" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('sistema') && <SortableHeader colKey="sistema" label="Sistema" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('marca') && <SortableHeader colKey="marca" label="Marca / modelo" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('serie') && <SortableHeader colKey="serie" label="Nº de série" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('instalacao') && <SortableHeader colKey="instalacao" label="Instalação" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('garantia') && <SortableHeader colKey="garantia" label="Garantia do fornecedor" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('actions') && <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtrados.map(a => {
                                    const g = textoGarantia(a._dias_garantia, a.supplier_warranty_until);
                                    return (
                                        <tr key={a.id} className="hover:bg-blue-50/50 transition-colors group">
                                            {v.includes('codigo') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{a.code}</td>}
                                            {v.includes('nome') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{a.name}</td>}
                                            {v.includes('sistema') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{a._system_name}</td>}
                                            {v.includes('marca') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{[a.brand, a.model].filter(Boolean).join(' ') || '—'}</td>}
                                            {v.includes('serie') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{a.serial_number || '—'}</td>}
                                            {v.includes('instalacao') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{formatarData(a.purchase_date)}</td>}
                                            {v.includes('garantia') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    <span className={`text-sm font-normal ${g.cor}`}>{g.texto}</span>
                                                </td>
                                            )}
                                            {v.includes('actions') && (
                                                <td className="px-6 py-2.5 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <InlineDisclosureMenu showDelete onDelete={() => excluir(a)} />
                                                    </div>
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

            <Sheet open={sheetAberto} onClose={() => setSheetAberto(false)} size="lg">
                <SheetHeader onClose={() => setSheetAberto(false)}>
                    <SheetTitle>Novo equipamento</SheetTitle>
                    <SheetDescription>{empreendimento.name}</SheetDescription>
                </SheetHeader>
                <SheetPanel>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Equipamento</label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="Ex: Elevador social — torre A"
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Sistema predial</label>
                            <select
                                value={form.building_system_id}
                                onChange={e => setForm(f => ({ ...f, building_system_id: e.target.value }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            >
                                <option value="">Sem sistema definido</option>
                                {sistemas.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Marca</label>
                                <input
                                    type="text" value={form.brand}
                                    onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                                    className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Modelo</label>
                                <input
                                    type="text" value={form.model}
                                    onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                                    className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Nº de série</label>
                            <input
                                type="text" value={form.serial_number}
                                onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Instalação</label>
                                <input
                                    type="date" value={form.purchase_date}
                                    onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))}
                                    className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Garantia do fornecedor até</label>
                                <input
                                    type="date" value={form.supplier_warranty_until}
                                    onChange={e => setForm(f => ({ ...f, supplier_warranty_until: e.target.value }))}
                                    className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                />
                            </div>
                        </div>
                        <p className="text-xs text-gray-400">
                            Esta é a garantia de quem VENDEU o equipamento, contada da instalação —
                            diferente da garantia da construtora ao comprador, que corre da entrega do imóvel.
                        </p>

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Observações</label>
                            <textarea
                                value={form.notes} rows={3}
                                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                className="mt-1 w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>
                    </div>
                </SheetPanel>
                <SheetFooter>
                    <button onClick={() => setSheetAberto(false)} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">Cancelar</button>
                    <button onClick={salvar} disabled={salvando} className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                        {salvando ? 'Salvando...' : 'Salvar equipamento'}
                    </button>
                </SheetFooter>
            </Sheet>

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

export default AtivosTab;
