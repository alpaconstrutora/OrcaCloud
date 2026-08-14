// components/condominio/ManutencaoTab.tsx
// Manutenção predial NBR 5674 — ÒPURA Pós-Entrega, F1.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// A tela existe para responder UMA pergunta: o que está vencido ou vence
// agora. Por isso o plano abre ordenado por vencimento (não por cadastro) e o
// KPI de vencidos é o primeiro. Listar manutenção em ordem alfabética é a
// forma mais eficiente de um plano de manutenção morrer sem ninguém notar.
import React from 'react';
import {
    AlertTriangle, CalendarClock, ClipboardList, Wrench, Search, RefreshCw, Plus, CheckCircle2,
} from 'lucide-react';
import {
    ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState,
} from '../ui/TableUtils';
import { KpiCard } from '../ui/KpiCard';
import ActionIconButton from '../ui/ActionIconButton';
import { InlineDisclosureMenu } from '../ui/inline-disclosure-menu';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import {
    maintenanceService, formatarPeriodicidade, diasParaVencer,
} from '../../services/maintenanceService';
import type {
    BuildingSystem, MaintenanceOrderRow, MaintenanceOrderType, MaintenancePlan,
    MaintenancePlanItemRow, MaintenanceResponsibleType, PeriodicityUnit,
} from '../../types/condominio';
import type { Empreendimento } from '../../types/empreendimento';

const ITEM_COLUMNS: ColumnConfig[] = [
    { key: 'sistema', label: 'Sistema', sortable: true },
    { key: 'servico', label: 'Serviço', sortable: true },
    { key: 'periodicidade', label: 'Periodicidade', sortable: true },
    { key: 'responsavel', label: 'Responsável', sortable: true },
    { key: 'ultima', label: 'Última execução', sortable: true },
    { key: 'proxima', label: 'Próximo vencimento', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const ORDER_COLUMNS: ColumnConfig[] = [
    { key: 'sistema', label: 'Sistema', sortable: true },
    { key: 'descricao', label: 'Descrição', sortable: true },
    { key: 'tipo', label: 'Tipo', sortable: true },
    { key: 'prioridade', label: 'Prioridade', sortable: true },
    { key: 'agendada', label: 'Agendada', sortable: true },
    { key: 'executada', label: 'Executada', sortable: true },
    { key: 'situacao', label: 'Situação', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const RESPONSAVEL_LABELS: Record<MaintenanceResponsibleType, string> = {
    EQUIPE_LOCAL: 'Equipe local',
    EMPRESA_ESPECIALIZADA: 'Empresa especializada',
    FABRICANTE: 'Fabricante',
    ORGAO_PUBLICO: 'Órgão público',
};

const TIPO_LABELS: Record<MaintenanceOrderType, string> = {
    PREVENTIVA: 'Preventiva',
    CORRETIVA: 'Corretiva',
    INSPECAO: 'Inspeção',
};

// Texto colorido, sem pílula/fundo/uppercase (§8).
const SITUACAO_COLOR: Record<string, string> = {
    ABERTA: 'text-amber-600',
    AGENDADA: 'text-blue-600',
    EM_EXECUCAO: 'text-indigo-600',
    CONCLUIDA: 'text-emerald-600',
    CANCELADA: 'text-gray-500',
};
const SITUACAO_LABELS: Record<string, string> = {
    ABERTA: 'Aberta', AGENDADA: 'Agendada', EM_EXECUCAO: 'Em execução',
    CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada',
};
const PRIORIDADE_COLOR: Record<string, string> = {
    BAIXA: 'text-gray-500', NORMAL: 'text-gray-700',
    ALTA: 'text-amber-600', EMERGENCIA: 'text-red-600',
};
const PRIORIDADE_LABELS: Record<string, string> = {
    BAIXA: 'Baixa', NORMAL: 'Normal', ALTA: 'Alta', EMERGENCIA: 'Emergência',
};

/** Data do banco é 'YYYY-MM-DD'. Nunca `new Date(iso)` — o fuso come um dia. */
function formatarData(iso?: string | null): string {
    if (!iso) return '—';
    const [a, m, d] = iso.slice(0, 10).split('-');
    return d && m && a ? `${d}/${m}/${a}` : '—';
}
function hojeISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** O vencimento é o dado que a tela existe para mostrar — cor carrega o significado. */
function textoVencimento(dias: number | null, proxima?: string | null): { texto: string; cor: string } {
    if (dias == null) return { texto: 'Nunca executado', cor: 'text-gray-400' };
    if (dias < 0) return { texto: `${formatarData(proxima)} · vencido há ${Math.abs(dias)}d`, cor: 'text-red-600' };
    if (dias <= 30) return { texto: `${formatarData(proxima)} · em ${dias}d`, cor: 'text-amber-600' };
    return { texto: formatarData(proxima), cor: 'text-gray-600' };
}

type Aba = 'plano' | 'ordens';

interface Props { empreendimento: Empreendimento }

const ManutencaoTab: React.FC<Props> = ({ empreendimento }) => {
    const confirm = useConfirm();
    const orgId = empreendimento.organization_id;

    const [aba, setAba] = usePersistedState<Aba>('condominio:manutencao:aba', 'plano');
    const [searchTerm, setSearchTerm] = usePersistedState<string>('condominio:manutencao:search', '');
    const itemColumns = useTableColumns(ITEM_COLUMNS, 'manutencaoItemColumns');
    const orderColumns = useTableColumns(ORDER_COLUMNS, 'manutencaoOrderColumns');

    const [sistemas, setSistemas] = React.useState<BuildingSystem[]>([]);
    const [plano, setPlano] = React.useState<MaintenancePlan | null>(null);
    const [itens, setItens] = React.useState<MaintenancePlanItemRow[]>([]);
    const [ordens, setOrdens] = React.useState<MaintenanceOrderRow[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const [sheetItem, setSheetItem] = React.useState(false);
    const [sheetOrdem, setSheetOrdem] = React.useState(false);
    const [salvando, setSalvando] = React.useState(false);

    const [formItem, setFormItem] = React.useState<{
        building_system_id: string; description: string;
        periodicity_value: number; periodicity_unit: PeriodicityUnit;
        responsible_type: MaintenanceResponsibleType; next_due_date: string;
    }>({
        building_system_id: '', description: '', periodicity_value: 3,
        periodicity_unit: 'MES', responsible_type: 'EQUIPE_LOCAL', next_due_date: hojeISO(),
    });

    const [formOrdem, setFormOrdem] = React.useState<{
        plan_item_id: string; building_system_id: string; description: string;
        type: MaintenanceOrderType; priority: string; scheduled_date: string;
    }>({
        plan_item_id: '', building_system_id: '', description: '',
        type: 'CORRETIVA', priority: 'NORMAL', scheduled_date: hojeISO(),
    });

    const carregar = React.useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            const sys = await maintenanceService.listSystems(orgId);
            setSistemas(sys);

            const planos = await maintenanceService.listPlans(empreendimento.id);
            const vigente = planos.find(p => p.status === 'VIGENTE') || planos[0] || null;
            setPlano(vigente);

            setItens(vigente ? await maintenanceService.listPlanItems(vigente.id, sys) : []);
            setOrdens(await maintenanceService.listOrders(empreendimento.id, sys));
        } catch (e: any) {
            setErro(e?.message || 'Erro ao carregar a manutenção.');
        } finally {
            setLoading(false);
        }
    }, [empreendimento.id, orgId]);

    React.useEffect(() => { carregar(); }, [carregar]);

    const kpis = React.useMemo(() => {
        const ativos = itens.filter(i => i.is_active);
        return {
            vencidos: ativos.filter(i => i._dias_para_vencer != null && i._dias_para_vencer < 0).length,
            proximos: ativos.filter(i => i._dias_para_vencer != null && i._dias_para_vencer >= 0 && i._dias_para_vencer <= 30).length,
            itens: ativos.length,
            abertas: ordens.filter(o => o.status !== 'CONCLUIDA' && o.status !== 'CANCELADA').length,
        };
    }, [itens, ordens]);

    const itensFiltrados = React.useMemo(() => {
        const t = searchTerm.trim().toLowerCase();
        if (!t) return itens;
        return itens.filter(i =>
            i.description.toLowerCase().includes(t) || i._system_name.toLowerCase().includes(t));
    }, [itens, searchTerm]);

    const ordensFiltradas = React.useMemo(() => {
        const t = searchTerm.trim().toLowerCase();
        if (!t) return ordens;
        return ordens.filter(o =>
            o.description.toLowerCase().includes(t) || o._system_name.toLowerCase().includes(t));
    }, [ordens, searchTerm]);

    const criarPlano = async () => {
        try {
            const novo = await maintenanceService.createPlan({
                empreendimento_id: empreendimento.id,
                organization_id: orgId,
                name: `Plano de Manutenção — ${empreendimento.name}`,
                status: 'VIGENTE',
                valid_from: hojeISO(),
            });
            setPlano(novo);
            setItens([]);
            notify('Plano criado e colocado em vigor.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao criar o plano.', 'error');
        }
    };

    const salvarItem = async () => {
        if (!plano) return;
        if (!formItem.description.trim()) { notify('Descreva o serviço.', 'error'); return; }
        setSalvando(true);
        try {
            const criado = await maintenanceService.createPlanItem({
                plan_id: plano.id,
                organization_id: orgId,
                building_system_id: formItem.building_system_id || null,
                asset_id: null,
                description: formItem.description.trim(),
                periodicity_value: formItem.periodicity_value,
                periodicity_unit: formItem.periodicity_unit,
                responsible_type: formItem.responsible_type,
                is_active: true,
                // Item nunca executado precisa de uma primeira data, senão nasce
                // fora de qualquer alerta e ninguém nunca o executa.
                next_due_date: formItem.next_due_date || null,
            });
            // §22 — atualiza o array local, sem recarregar a aba.
            setItens(prev => [{
                ...criado,
                _system_name: sistemas.find(s => s.id === criado.building_system_id)?.name || '—',
                _dias_para_vencer: diasParaVencer(criado.next_due_date),
            }, ...prev]);
            setSheetItem(false);
            setFormItem(f => ({ ...f, description: '' }));
            notify('Item incluído no plano.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao salvar o item.', 'error');
        } finally { setSalvando(false); }
    };

    const salvarOrdem = async () => {
        if (!formOrdem.description.trim()) { notify('Descreva o serviço.', 'error'); return; }
        setSalvando(true);
        try {
            const criada = await maintenanceService.createOrder({
                empreendimento_id: empreendimento.id,
                organization_id: orgId,
                plan_item_id: formOrdem.plan_item_id || null,
                building_system_id: formOrdem.building_system_id || null,
                asset_id: null,
                unit_id: null,
                code: null,
                type: formOrdem.type,
                priority: formOrdem.priority as any,
                status: 'AGENDADA',
                description: formOrdem.description.trim(),
                scheduled_date: formOrdem.scheduled_date || null,
                executed_date: null,
                supplier_id: null,
                executed_by: null,
                findings: null,
            });
            setOrdens(prev => [{
                ...criada,
                _system_name: sistemas.find(s => s.id === criada.building_system_id)?.name || '—',
            }, ...prev]);
            setSheetOrdem(false);
            setFormOrdem(f => ({ ...f, description: '' }));
            notify('Ordem de serviço aberta.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao abrir a ordem.', 'error');
        } finally { setSalvando(false); }
    };

    const concluirOrdem = async (o: MaintenanceOrderRow) => {
        const doPlano = !!o.plan_item_id;
        const ok = await confirm({
            title: 'Concluir a ordem?',
            message: doPlano
                ? 'A data de hoje será registrada como execução, e o próximo vencimento do item no plano é recalculado a partir dela.'
                : 'A data de hoje será registrada como execução. Esta ordem não veio do plano, então nenhum vencimento é recalculado.',
            variant: 'default',
            confirmLabel: 'Concluir ordem',
        });
        if (!ok) return;
        try {
            const atualizada = await maintenanceService.concluirOrder(o.id, hojeISO());
            setOrdens(prev => prev.map(x => (x.id === o.id ? { ...x, ...atualizada } : x)));
            // O ciclo é recalculado por trigger no banco: só o servidor sabe a
            // nova data, então aqui é releitura, não cálculo repetido no client.
            if (doPlano && plano) setItens(await maintenanceService.listPlanItems(plano.id, sistemas));
            notify(doPlano ? 'Ordem concluída e próximo vencimento recalculado.' : 'Ordem concluída.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao concluir a ordem.', 'error');
        }
    };

    const excluirItem = async (i: MaintenancePlanItemRow) => {
        const ok = await confirm({
            title: 'Remover do plano?',
            message: `"${i.description}" deixa de ser exigido pelo plano. As ordens já executadas continuam no histórico.`,
            variant: 'danger', confirmLabel: 'Remover',
        });
        if (!ok) return;
        try {
            await maintenanceService.removePlanItem(i.id);
            setItens(prev => prev.filter(x => x.id !== i.id));
            notify('Item removido do plano.');
        } catch (e: any) { notify(e?.message || 'Erro ao remover.', 'error'); }
    };

    const iv = itemColumns.visibleColumns;
    const ov = orderColumns.visibleColumns;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                <KpiCard
                    label="VENCIDOS" value={kpis.vencidos}
                    sub={kpis.vencidos > 0 ? 'Exigem ação imediata' : undefined}
                    icon={<AlertTriangle className="w-5 h-5" />}
                    color={kpis.vencidos > 0 ? 'red' : 'gray'}
                />
                <KpiCard
                    label="VENCEM EM 30 DIAS" value={kpis.proximos}
                    icon={<CalendarClock className="w-5 h-5" />}
                    color={kpis.proximos > 0 ? 'amber' : 'gray'}
                />
                <KpiCard label="ITENS NO PLANO" value={kpis.itens} icon={<ClipboardList className="w-5 h-5" />} color="blue" />
                <KpiCard label="ORDENS ABERTAS" value={kpis.abertas} icon={<Wrench className="w-5 h-5" />} color="indigo" />
            </div>

            {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm">{erro}</div>
            )}

            {/* Sub-abas §19.1 — card branco + trilho bg-gray-50 */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {([['plano', 'Plano de manutenção'], ['ordens', 'Ordens de serviço']] as [Aba, string][]).map(([id, label]) => (
                        <button
                            key={id}
                            onClick={() => setAba(id)}
                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                aba === id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder={aba === 'plano' ? 'Buscar por serviço ou sistema...' : 'Buscar por descrição ou sistema...'}
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
                            {aba === 'plano' ? (
                                <ColumnConfigButton
                                    columns={ITEM_COLUMNS.filter(c => c.key !== 'actions')}
                                    visibleColumns={itemColumns.visibleColumns}
                                    showColumnConfig={itemColumns.showColumnConfig}
                                    onToggleShow={() => itemColumns.setShowColumnConfig(!itemColumns.showColumnConfig)}
                                    onToggleColumn={itemColumns.toggleColumn}
                                    onReset={itemColumns.resetColumns}
                                />
                            ) : (
                                <ColumnConfigButton
                                    columns={ORDER_COLUMNS.filter(c => c.key !== 'actions')}
                                    visibleColumns={orderColumns.visibleColumns}
                                    showColumnConfig={orderColumns.showColumnConfig}
                                    onToggleShow={() => orderColumns.setShowColumnConfig(!orderColumns.showColumnConfig)}
                                    onToggleColumn={orderColumns.toggleColumn}
                                    onReset={orderColumns.resetColumns}
                                />
                            )}
                        </div>
                        {aba === 'plano' ? (
                            plano && (
                                <button
                                    onClick={() => setSheetItem(true)}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                                >
                                    <Plus className="w-[15px] h-[15px]" /> Novo item
                                </button>
                            )
                        ) : (
                            <button
                                onClick={() => setSheetOrdem(true)}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                            >
                                <Plus className="w-[15px] h-[15px]" /> Nova ordem
                            </button>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : aba === 'plano' && !plano ? (
                    <div className="text-center py-12">
                        <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum plano de manutenção</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            A NBR 5674 exige plano com periodicidade definida. Sem ele, manutenção vira lista de tarefas avulsas.
                        </p>
                        <button
                            onClick={criarPlano}
                            className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                        >
                            <Plus className="w-[15px] h-[15px]" /> Criar plano de manutenção
                        </button>
                    </div>
                ) : aba === 'plano' ? (
                    itensFiltrados.length === 0 ? (
                        <div className="text-center py-12">
                            <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Plano sem itens</h3>
                            <p className="text-sm text-gray-500">Cada item diz o que fazer, de quanto em quanto tempo e quem faz.</p>
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[70vh]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        {iv.includes('sistema') && <SortableHeader colKey="sistema" label="Sistema" uppercase={false} sortColumn={itemColumns.sortColumn} sortDirection={itemColumns.sortDirection} onSort={itemColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                        {iv.includes('servico') && <SortableHeader colKey="servico" label="Serviço" uppercase={false} sortColumn={itemColumns.sortColumn} sortDirection={itemColumns.sortDirection} onSort={itemColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                        {iv.includes('periodicidade') && <SortableHeader colKey="periodicidade" label="Periodicidade" uppercase={false} sortColumn={itemColumns.sortColumn} sortDirection={itemColumns.sortDirection} onSort={itemColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                        {iv.includes('responsavel') && <SortableHeader colKey="responsavel" label="Responsável" uppercase={false} sortColumn={itemColumns.sortColumn} sortDirection={itemColumns.sortDirection} onSort={itemColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                        {iv.includes('ultima') && <SortableHeader colKey="ultima" label="Última execução" uppercase={false} sortColumn={itemColumns.sortColumn} sortDirection={itemColumns.sortDirection} onSort={itemColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                        {iv.includes('proxima') && <SortableHeader colKey="proxima" label="Próximo vencimento" uppercase={false} sortColumn={itemColumns.sortColumn} sortDirection={itemColumns.sortDirection} onSort={itemColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                        {iv.includes('actions') && <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {itensFiltrados.map(i => {
                                        const venc = textoVencimento(i._dias_para_vencer, i.next_due_date);
                                        return (
                                            <tr key={i.id} className="hover:bg-blue-50/50 transition-colors group">
                                                {iv.includes('sistema') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{i._system_name}</td>}
                                                {iv.includes('servico') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{i.description}</td>}
                                                {iv.includes('periodicidade') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{formatarPeriodicidade(i.periodicity_value, i.periodicity_unit)}</td>}
                                                {iv.includes('responsavel') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{RESPONSAVEL_LABELS[i.responsible_type]}</td>}
                                                {iv.includes('ultima') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{formatarData(i.last_executed_at)}</td>}
                                                {iv.includes('proxima') && (
                                                    <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                        <span className={`text-sm font-normal ${venc.cor}`}>{venc.texto}</span>
                                                    </td>
                                                )}
                                                {iv.includes('actions') && (
                                                    <td className="px-6 py-2.5 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <ActionIconButton
                                                                kind="edit"
                                                                title="Abrir ordem para este item"
                                                                icon={<Wrench className="w-4 h-4" />}
                                                                onClick={() => {
                                                                    setFormOrdem({
                                                                        plan_item_id: i.id,
                                                                        building_system_id: i.building_system_id || '',
                                                                        description: i.description,
                                                                        type: 'PREVENTIVA',
                                                                        priority: 'NORMAL',
                                                                        scheduled_date: i.next_due_date || hojeISO(),
                                                                    });
                                                                    setSheetOrdem(true);
                                                                }}
                                                            />
                                                            <InlineDisclosureMenu showDelete onDelete={() => excluirItem(i)} />
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )
                ) : ordensFiltradas.length === 0 ? (
                    <div className="text-center py-12">
                        <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma ordem de serviço</h3>
                        <p className="text-sm text-gray-500">Ordens preventivas nascem do plano; corretivas, de um problema.</p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {ov.includes('sistema') && <SortableHeader colKey="sistema" label="Sistema" uppercase={false} sortColumn={orderColumns.sortColumn} sortDirection={orderColumns.sortDirection} onSort={orderColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {ov.includes('descricao') && <SortableHeader colKey="descricao" label="Descrição" uppercase={false} sortColumn={orderColumns.sortColumn} sortDirection={orderColumns.sortDirection} onSort={orderColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {ov.includes('tipo') && <SortableHeader colKey="tipo" label="Tipo" uppercase={false} sortColumn={orderColumns.sortColumn} sortDirection={orderColumns.sortDirection} onSort={orderColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {ov.includes('prioridade') && <SortableHeader colKey="prioridade" label="Prioridade" uppercase={false} sortColumn={orderColumns.sortColumn} sortDirection={orderColumns.sortDirection} onSort={orderColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {ov.includes('agendada') && <SortableHeader colKey="agendada" label="Agendada" uppercase={false} sortColumn={orderColumns.sortColumn} sortDirection={orderColumns.sortDirection} onSort={orderColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {ov.includes('executada') && <SortableHeader colKey="executada" label="Executada" uppercase={false} sortColumn={orderColumns.sortColumn} sortDirection={orderColumns.sortDirection} onSort={orderColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {ov.includes('situacao') && <SortableHeader colKey="situacao" label="Situação" uppercase={false} sortColumn={orderColumns.sortColumn} sortDirection={orderColumns.sortDirection} onSort={orderColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {ov.includes('actions') && <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {ordensFiltradas.map(o => (
                                    <tr key={o.id} className="hover:bg-blue-50/50 transition-colors group">
                                        {ov.includes('sistema') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{o._system_name}</td>}
                                        {ov.includes('descricao') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{o.description}</td>}
                                        {ov.includes('tipo') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{TIPO_LABELS[o.type]}</td>}
                                        {ov.includes('prioridade') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <span className={`text-sm font-normal ${PRIORIDADE_COLOR[o.priority]}`}>{PRIORIDADE_LABELS[o.priority]}</span>
                                            </td>
                                        )}
                                        {ov.includes('agendada') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{formatarData(o.scheduled_date)}</td>}
                                        {ov.includes('executada') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{formatarData(o.executed_date)}</td>}
                                        {ov.includes('situacao') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <span className={`text-sm font-normal ${SITUACAO_COLOR[o.status]}`}>{SITUACAO_LABELS[o.status]}</span>
                                            </td>
                                        )}
                                        {ov.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {o.status !== 'CONCLUIDA' && o.status !== 'CANCELADA' && (
                                                        <ActionIconButton
                                                            kind="edit"
                                                            title="Concluir ordem"
                                                            icon={<CheckCircle2 className="w-4 h-4" />}
                                                            onClick={() => concluirOrdem(o)}
                                                        />
                                                    )}
                                                    <InlineDisclosureMenu
                                                        showDelete
                                                        onDelete={async () => {
                                                            await maintenanceService.removeOrder(o.id);
                                                            setOrdens(prev => prev.filter(x => x.id !== o.id));
                                                        }}
                                                    />
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Novo item do plano */}
            <Sheet open={sheetItem} onClose={() => setSheetItem(false)} size="lg">
                <SheetHeader onClose={() => setSheetItem(false)}>
                    <SheetTitle>Novo item do plano</SheetTitle>
                    <SheetDescription>{plano?.name}</SheetDescription>
                </SheetHeader>
                <SheetPanel>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Sistema predial</label>
                            <select
                                value={formItem.building_system_id}
                                onChange={e => setFormItem(f => ({ ...f, building_system_id: e.target.value }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            >
                                <option value="">Sem sistema definido</option>
                                {sistemas.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            {sistemas.length === 0 && (
                                <p className="text-xs text-amber-600 mt-1">
                                    Nenhum sistema cadastrado. O bloco 9 da migration tem a semente da NBR 14037 pronta para rodar.
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Serviço</label>
                            <input
                                type="text"
                                value={formItem.description}
                                onChange={e => setFormItem(f => ({ ...f, description: e.target.value }))}
                                placeholder="Ex: Limpeza e desinfecção do reservatório"
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">A cada</label>
                                <input
                                    type="number" min={1}
                                    value={formItem.periodicity_value}
                                    onChange={e => setFormItem(f => ({ ...f, periodicity_value: Number(e.target.value) }))}
                                    className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Unidade</label>
                                <select
                                    value={formItem.periodicity_unit}
                                    onChange={e => setFormItem(f => ({ ...f, periodicity_unit: e.target.value as PeriodicityUnit }))}
                                    className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                >
                                    <option value="DIA">Dias</option>
                                    <option value="SEMANA">Semanas</option>
                                    <option value="MES">Meses</option>
                                    <option value="ANO">Anos</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Responsável</label>
                            <select
                                value={formItem.responsible_type}
                                onChange={e => setFormItem(f => ({ ...f, responsible_type: e.target.value as MaintenanceResponsibleType }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            >
                                {(Object.keys(RESPONSAVEL_LABELS) as MaintenanceResponsibleType[]).map(r => (
                                    <option key={r} value={r}>{RESPONSAVEL_LABELS[r]}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Primeiro vencimento</label>
                            <input
                                type="date"
                                value={formItem.next_due_date}
                                onChange={e => setFormItem(f => ({ ...f, next_due_date: e.target.value }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                            <p className="text-xs text-gray-400 mt-1">
                                Depois disso a data anda sozinha: concluir a ordem recalcula o próximo vencimento pela periodicidade.
                            </p>
                        </div>
                    </div>
                </SheetPanel>
                <SheetFooter>
                    <button onClick={() => setSheetItem(false)} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">Cancelar</button>
                    <button onClick={salvarItem} disabled={salvando} className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                        {salvando ? 'Salvando...' : 'Salvar item'}
                    </button>
                </SheetFooter>
            </Sheet>

            {/* Nova ordem */}
            <Sheet open={sheetOrdem} onClose={() => setSheetOrdem(false)} size="lg">
                <SheetHeader onClose={() => setSheetOrdem(false)}>
                    <SheetTitle>Nova ordem de serviço</SheetTitle>
                    <SheetDescription>{empreendimento.name}</SheetDescription>
                </SheetHeader>
                <SheetPanel>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Tipo</label>
                            <select
                                value={formOrdem.type}
                                onChange={e => setFormOrdem(f => ({ ...f, type: e.target.value as MaintenanceOrderType }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            >
                                <option value="PREVENTIVA">Preventiva</option>
                                <option value="CORRETIVA">Corretiva</option>
                                <option value="INSPECAO">Inspeção</option>
                            </select>
                            <p className="text-xs text-gray-400 mt-1">
                                {formOrdem.plan_item_id
                                    ? 'Ligada a um item do plano: concluir recalcula o próximo vencimento.'
                                    : 'Sem item do plano — nenhum vencimento é recalculado ao concluir.'}
                            </p>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Sistema predial</label>
                            <select
                                value={formOrdem.building_system_id}
                                onChange={e => setFormOrdem(f => ({ ...f, building_system_id: e.target.value }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            >
                                <option value="">Sem sistema definido</option>
                                {sistemas.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Descrição</label>
                            <textarea
                                value={formOrdem.description}
                                onChange={e => setFormOrdem(f => ({ ...f, description: e.target.value }))}
                                rows={3}
                                className="mt-1 w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Prioridade</label>
                                <select
                                    value={formOrdem.priority}
                                    onChange={e => setFormOrdem(f => ({ ...f, priority: e.target.value }))}
                                    className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                >
                                    <option value="BAIXA">Baixa</option>
                                    <option value="NORMAL">Normal</option>
                                    <option value="ALTA">Alta</option>
                                    <option value="EMERGENCIA">Emergência</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Agendada para</label>
                                <input
                                    type="date"
                                    value={formOrdem.scheduled_date}
                                    onChange={e => setFormOrdem(f => ({ ...f, scheduled_date: e.target.value }))}
                                    className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>
                </SheetPanel>
                <SheetFooter>
                    <button onClick={() => setSheetOrdem(false)} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">Cancelar</button>
                    <button onClick={salvarOrdem} disabled={salvando} className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                        {salvando ? 'Salvando...' : 'Abrir ordem'}
                    </button>
                </SheetFooter>
            </Sheet>

            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default ManutencaoTab;
