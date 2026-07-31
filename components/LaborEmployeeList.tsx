import React, { useState, useMemo } from 'react';
import { Search, UserMinus, UserCheck, Building2, Briefcase, AlertCircle, Users, Wallet, Share2 } from 'lucide-react';
import { Employee, ContractType, EmployeeStatus, laborService } from '../services/laborService';
import LaborEmployeeSharing from './LaborEmployeeSharing';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils';
import { formatMoney } from './ui/Format';
import { KpiCard } from './ui/KpiCard';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';
import LaborScopeBar from './LaborScopeBar';

const LABOR_EMPLOYEE_COLUMNS: ColumnConfig[] = [
    { key: 'name', label: 'Colaborador', sortable: true },
    { key: 'document', label: 'Documento', sortable: true },
    { key: 'role', label: 'Função', sortable: true },
    { key: 'organization', label: 'Organização', sortable: true },
    { key: 'contract', label: 'Vínculo', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'salary', label: 'Salário Base', sortable: true },
    { key: 'cost', label: 'Custo/Dia', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

interface LaborEmployeeListProps {
    employees: Employee[];
    projects: any[];
    organizations?: any[];
    currentUserEmail?: string;
    onEdit: (emp: Employee) => void;
    onNew: () => void;
    onRefresh: () => void;
    selectedOrgId?: string;
    onSelectedOrgIdChange: (orgId: string | undefined) => void;
    isAllOrgsMode: boolean;
}

const CONTRACT_LABELS: Record<ContractType, string> = {
    CLT: 'CLT', PJ: 'PJ', DIARISTA: 'Diarista', EMPREITEIRO: 'Empreiteiro', ESTAGIARIO: 'Estágio'
};
// Texto simples colorido — sem pílula/fundo/uppercase (guia §8).
const CONTRACT_COLORS: Record<ContractType, string> = {
    CLT: 'text-blue-700',
    PJ: 'text-purple-700',
    DIARISTA: 'text-amber-700',
    EMPREITEIRO: 'text-orange-700',
    ESTAGIARIO: 'text-teal-700',
};
const STATUS_LABELS: Record<EmployeeStatus, string> = {
    ATIVO: 'Ativo', INATIVO: 'Inativo', AFASTADO: 'Afastado', DESLIGADO: 'Desligado',
};
const STATUS_COLORS: Record<EmployeeStatus, string> = {
    ATIVO: 'text-emerald-700',
    INATIVO: 'text-slate-500',
    AFASTADO: 'text-amber-700',
    DESLIGADO: 'text-red-600',
};

// F6.3 (rollout do Filtro Avançado — ver PLANO_MODULO_TABELAS.md). Complementa
// busca/status/vínculo já existentes, não os substitui.
const ADVANCED_FILTER_FIELDS: FilterFieldConfig[] = [
    { key: 'name', label: 'Colaborador', type: 'text' },
    { key: 'role', label: 'Função', type: 'text' },
    { key: 'contract', label: 'Vínculo', type: 'select', options: Object.entries(CONTRACT_LABELS).map(([value, label]) => ({ value, label })) },
    { key: 'status', label: 'Status', type: 'select', options: [
        { value: 'ATIVO', label: 'Ativo' }, { value: 'INATIVO', label: 'Inativo' },
        { value: 'AFASTADO', label: 'Afastado' }, { value: 'DESLIGADO', label: 'Desligado' },
    ] },
    { key: 'salary', label: 'Salário Base', type: 'number' },
    { key: 'cost', label: 'Custo/Dia', type: 'number' },
];

function getAdvancedFilterValue(e: Employee, key: string): unknown {
    switch (key) {
        case 'name': return e.name ?? '';
        case 'role': return e.role ?? '';
        case 'contract': return e.contract_type;
        case 'status': return e.status;
        case 'salary': return e.base_salary ?? null;
        case 'cost': return e.daily_cost ?? null;
        default: return null;
    }
}

const LaborEmployeeList: React.FC<LaborEmployeeListProps> = ({ employees, organizations = [], currentUserEmail, onEdit, onNew, onRefresh, selectedOrgId, onSelectedOrgIdChange, isAllOrgsMode }) => {
    // F2: filtros sobrevivem a navegação/reload.
    const [search, setSearch] = usePersistedState('laborEmployeeListFilters:search', '');
    const [filterStatus, setFilterStatus] = usePersistedState<EmployeeStatus | 'ALL'>('laborEmployeeListFilters:status', 'ATIVO');
    const [filterContract, setFilterContract] = usePersistedState<ContractType | 'ALL'>('laborEmployeeListFilters:contract', 'ALL');
    const [sortBy, setSortBy] = usePersistedState<'name' | 'cost'>('laborEmployeeListFilters:sortBy', 'name');
    const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('laborEmployeeListFilters:sortDir', 'asc');
    const [sharingEmployee, setSharingEmployee] = useState<Employee | null>(null);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const tableColumns = useTableColumns(LABOR_EMPLOYEE_COLUMNS, 'laborEmployeeListColumns');
    const advancedFilters = useAdvancedFilters(ADVANCED_FILTER_FIELDS, 'laborEmployeeListFilters:advanced');
    const confirm = useConfirm();

    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const orgName = (id: string) => organizations.find(o => o.id === id)?.name || 'Desconhecida';

    const filtered = useMemo(() => applyFilterRules(
        employees
            .filter(e => filterStatus === 'ALL' || e.status === filterStatus)
            .filter(e => filterContract === 'ALL' || e.contract_type === filterContract)
            .filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.role.toLowerCase().includes(search.toLowerCase()) || (e.cpf || '').replace(/\D/g, '').includes(search.replace(/\D/g, ''))),
        advancedFilters.rules, ADVANCED_FILTER_FIELDS, getAdvancedFilterValue,
    )
        .sort((a, b) => {
            // tableColumns sort takes priority over legacy sort dropdowns
            if (tableColumns.sortColumn) {
                const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
                switch (tableColumns.sortColumn) {
                    case 'name': return dir * a.name.localeCompare(b.name);
                    case 'document': return dir * (a.cpf || '').localeCompare(b.cpf || '');
                    case 'role': return dir * a.role.localeCompare(b.role);
                    case 'organization': return dir * orgName(a.org_id).localeCompare(orgName(b.org_id));
                    case 'contract': return dir * a.contract_type.localeCompare(b.contract_type);
                    case 'status': return dir * a.status.localeCompare(b.status);
                    case 'salary': return dir * ((a.base_salary || 0) - (b.base_salary || 0));
                    case 'cost': return dir * ((a.daily_cost || 0) - (b.daily_cost || 0));
                    default: return 0;
                }
            }
            let cmp = 0;
            if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
            else cmp = (a.daily_cost || 0) - (b.daily_cost || 0);
            return sortDir === 'asc' ? cmp : -cmp;
        }), [employees, organizations, filterStatus, filterContract, search, advancedFilters.rules, sortBy, sortDir, tableColumns.sortColumn, tableColumns.sortDirection]);

    const handleToggleStatus = async (emp: Employee) => {
        try {
            const newStatus: EmployeeStatus = emp.status === 'ATIVO' ? 'INATIVO' : 'ATIVO';
            await laborService.updateEmployee(emp.id, { status: newStatus });
            onRefresh();
            notify(newStatus === 'ATIVO' ? 'Colaborador reativado.' : 'Colaborador inativado.');
        } catch (err) {
            notify('Erro ao alterar status do colaborador.', 'error');
        }
    };

    const handleDeleteEmployee = async (emp: Employee) => {
        const ok = await confirm({
            title: 'Excluir colaborador?',
            message: `Deseja realmente excluir permanentemente "${emp.name}"? Esta ação não pode ser desfeita e pode falhar se houver registros vinculados.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await laborService.removeEmployee(emp.id);
            onRefresh();
            notify('Colaborador excluído.');
        } catch (err: any) {
            console.error('Erro ao excluir colaborador:', err);
            if (err.code === '23503') {
                notify('Não é possível excluir: existem registros vinculados (pontos, alocações, etc). Considere inativar.', 'error');
            } else {
                notify('Erro ao excluir colaborador: ' + (err.message || 'Tente novamente'), 'error');
            }
        }
    };

    const activeCount = employees.filter(e => e.status === 'ATIVO').length;
    const totalDailyCost = employees.filter(e => e.status === 'ATIVO').reduce((s, e) => s + (e.daily_cost || 0), 0);
    const contractCounts = employees.reduce((acc, e) => { acc[e.contract_type] = (acc[e.contract_type] || 0) + 1; return acc; }, {} as Record<string, number>);
    const topContract = Object.entries(contractCounts).sort((a, b) => b[1] - a[1])[0];

    return (
        <div className="space-y-6">
            {/* 1. Título */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Colaboradores</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Cadastro, vínculos e custos da equipe própria.</p>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                <KpiCard label="Colaboradores" value={`${employees.length}`} sub={`${activeCount} ativos`} icon={<Users className="w-5 h-5" />} color="indigo" />
                <KpiCard label="Ativos" value={`${activeCount}`} icon={<UserCheck className="w-5 h-5" />} color="emerald" />
                <KpiCard label="Custo Diário (Ativos)" value={formatMoney(totalDailyCost)} icon={<Wallet className="w-5 h-5" />} color="rose" />
                <KpiCard label="Vínculo Predominante" value={topContract ? CONTRACT_LABELS[topContract[0] as ContractType] : '—'} sub={topContract ? `${topContract[1]} colaboradores` : undefined} icon={<Briefcase className="w-5 h-5" />} color="blue" />
            </div>

            <LaborScopeBar
                organizations={organizations}
                selectedOrgId={selectedOrgId}
                onSelectedOrgIdChange={onSelectedOrgIdChange}
                onRefresh={onRefresh}
            >
                <button
                    onClick={() => {
                        if (isAllOrgsMode) {
                            alert('Para cadastrar um novo colaborador, selecione uma organização específica no filtro acima.');
                            return;
                        }
                        onNew();
                    }}
                    className={`flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 shrink-0
                        ${isAllOrgsMode ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                    title={isAllOrgsMode ? 'Selecione uma organização para cadastrar' : ''}
                >
                    <Users className="w-[15px] h-[15px]" />
                    Novo colaborador
                </button>
            </LaborScopeBar>

            {/* Toolbar acoplada à tabela (§5.2) */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white space-y-3">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                placeholder="Buscar colaborador, função ou CPF..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            {(['ATIVO', 'INATIVO', 'AFASTADO', 'ALL'] as const).map(s => (
                                <button
                                    key={s}
                                    onClick={() => setFilterStatus(s)}
                                    className={`h-9 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${filterStatus === s ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                >
                                    {s === 'ALL' ? 'Todos' : s.charAt(0) + s.slice(1).toLowerCase()}
                                </button>
                            ))}
                            <select
                                value={filterContract}
                                onChange={e => setFilterContract(e.target.value as any)}
                                className="h-9 px-3 rounded-[6px] text-sm font-medium bg-gray-100 text-gray-600 outline-none border border-transparent"
                            >
                                <option value="ALL">Todos os vínculos</option>
                                {Object.entries(CONTRACT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>

                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={LABOR_EMPLOYEE_COLUMNS.filter(c => c.key !== 'organization' || organizations.length > 1)}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                        </div>
                    </div>

                    <AdvancedFilterPanel fields={ADVANCED_FILTER_FIELDS} state={advancedFilters} />
                </div>

                {/* Tabela */}
                <div className="overflow-auto max-h-[70vh]">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                {tableColumns.visibleColumns.includes('name') && (
                                    <SortableHeader label="Colaborador" colKey="name" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                )}
                                {tableColumns.visibleColumns.includes('document') && (
                                    <SortableHeader label="Documento" colKey="document" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                )}
                                {tableColumns.visibleColumns.includes('role') && (
                                    <SortableHeader label="Função" colKey="role" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                )}
                                {organizations.length > 1 && tableColumns.visibleColumns.includes('organization') && (
                                    <SortableHeader label="Organização" colKey="organization" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                )}
                                {tableColumns.visibleColumns.includes('contract') && (
                                    <SortableHeader label="Vínculo" colKey="contract" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                )}
                                {tableColumns.visibleColumns.includes('status') && (
                                    <SortableHeader label="Status" colKey="status" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                )}
                                {tableColumns.visibleColumns.includes('salary') && (
                                    <SortableHeader label="Salário base" colKey="salary" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 text-right" />
                                )}
                                {tableColumns.visibleColumns.includes('cost') && (
                                    <SortableHeader label="Custo/dia" colKey="cost" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 text-right" />
                                )}
                                {tableColumns.visibleColumns.includes('actions') && (
                                    <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={tableColumns.visibleColumns.length} className="px-6 py-16 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <Briefcase className="w-12 h-12 text-gray-300 mb-2" />
                                            <h3 className="text-lg font-bold text-gray-900">Nenhum colaborador encontrado</h3>
                                            <p className="text-sm text-gray-500">Cadastre o primeiro colaborador usando o botão "Novo Colaborador".</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {filtered.map(emp => (
                                <tr key={emp.id} className="hover:bg-blue-50/50 transition-colors group">
                                    {tableColumns.visibleColumns.includes('name') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white font-semibold text-xs shrink-0">
                                                    {emp.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <p className="text-sm font-normal text-gray-700 truncate">{emp.name}</p>
                                                        {(emp.shared_orgs?.length ?? 0) > 0 && (
                                                            <span
                                                                title={`Disponível em ${emp.shared_orgs!.length} organização${emp.shared_orgs!.length > 1 ? 'ões' : ''} adicional${emp.shared_orgs!.length > 1 ? 'is' : ''}`}
                                                                className="flex items-center gap-0.5 text-violet-600 text-xs shrink-0"
                                                            >
                                                                <Share2 className="w-3 h-3" />
                                                                {emp.shared_orgs!.length}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    )}
                                    {tableColumns.visibleColumns.includes('document') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                            {emp.cpf || <span className="text-gray-300">—</span>}
                                        </td>
                                    )}
                                    {tableColumns.visibleColumns.includes('role') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                            {emp.role}
                                        </td>
                                    )}
                                    {organizations.length > 1 && tableColumns.visibleColumns.includes('organization') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                            <div className="flex items-center gap-1.5 min-w-[120px]">
                                                <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                <span className="truncate" title={orgName(emp.org_id)}>{orgName(emp.org_id)}</span>
                                            </div>
                                        </td>
                                    )}
                                    {tableColumns.visibleColumns.includes('contract') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                            <span className={`text-sm font-normal ${CONTRACT_COLORS[emp.contract_type]}`}>
                                                {CONTRACT_LABELS[emp.contract_type]}
                                            </span>
                                        </td>
                                    )}
                                    {tableColumns.visibleColumns.includes('status') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                            <span className={`text-sm font-normal ${STATUS_COLORS[emp.status]}`}>
                                                {STATUS_LABELS[emp.status]}
                                            </span>
                                        </td>
                                    )}
                                    {tableColumns.visibleColumns.includes('salary') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right">
                                            {emp.base_salary > 0 ? (
                                                <span className="text-sm font-medium text-gray-800">{formatMoney(emp.base_salary)}</span>
                                            ) : (
                                                <span className="text-sm font-normal text-gray-400">—</span>
                                            )}
                                        </td>
                                    )}
                                    {tableColumns.visibleColumns.includes('cost') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right">
                                            <span className="text-sm font-medium text-gray-800">
                                                {(emp.daily_cost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                {emp.hourly_cost > 0 && (
                                                    <span className="text-gray-400 font-normal"> / {(emp.hourly_cost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/h</span>
                                                )}
                                            </span>
                                        </td>
                                    )}
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                <ActionIconButton kind="edit" onClick={() => onEdit(emp)} />
                                                {organizations.length > 1 && (
                                                    <ActionIconButton
                                                        kind="share"
                                                        title="Disponibilizar para outras organizações"
                                                        tone={(emp.shared_orgs?.length ?? 0) > 0 ? 'attention' : 'neutral'}
                                                        onClick={() => setSharingEmployee(emp)}
                                                    />
                                                )}
                                                <ActionIconButton
                                                    kind={emp.status === 'ATIVO' ? 'delete' : 'view'}
                                                    icon={emp.status === 'ATIVO' ? <UserMinus className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                                                    title={emp.status === 'ATIVO' ? 'Inativar' : 'Reativar'}
                                                    tone={emp.status === 'ATIVO' ? 'danger' : 'neutral'}
                                                    onClick={() => handleToggleStatus(emp)}
                                                />
                                                <ActionIconButton kind="delete" title="Excluir permanentemente" onClick={() => handleDeleteEmployee(emp)} />
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {filtered.length > 0 && (
                    <div className="px-6 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 font-medium flex items-center justify-between">
                        <span>{filtered.length} colaborador{filtered.length !== 1 ? 'es' : ''}</span>
                        <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {activeCount} ativos
                        </span>
                    </div>
                )}
            </div>

            {sharingEmployee && (
                <LaborEmployeeSharing
                    employee={sharingEmployee}
                    organizations={organizations}
                    currentUserEmail={currentUserEmail}
                    onClose={() => setSharingEmployee(null)}
                    onSaved={() => { setSharingEmployee(null); onRefresh(); }}
                />
            )}

            {/* Toast */}
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

export default LaborEmployeeList;
