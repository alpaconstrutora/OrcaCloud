import React, { useState } from 'react';
import { Search, Filter, Edit3, UserMinus, UserCheck, Building2, Briefcase, DollarSign, Clock, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Employee, ContractType, EmployeeStatus, laborService } from '../services/laborService';

interface LaborEmployeeListProps {
    employees: Employee[];
    projects: any[];
    organizations?: any[];
    onEdit: (emp: Employee) => void;
    onRefresh: () => void;
}

const CONTRACT_LABELS: Record<ContractType, string> = {
    CLT: 'CLT', PJ: 'PJ', DIARISTA: 'Diarista', EMPREITEIRO: 'Empreiteiro', ESTAGIARIO: 'Estágio'
};
const CONTRACT_COLORS: Record<ContractType, string> = {
    CLT: 'bg-blue-100 text-blue-700',
    PJ: 'bg-purple-100 text-purple-700',
    DIARISTA: 'bg-amber-100 text-amber-700',
    EMPREITEIRO: 'bg-orange-100 text-orange-700',
    ESTAGIARIO: 'bg-teal-100 text-teal-700',
};
const STATUS_COLORS: Record<EmployeeStatus, string> = {
    ATIVO: 'bg-emerald-100 text-emerald-700',
    INATIVO: 'bg-slate-100 text-slate-500',
    AFASTADO: 'bg-amber-100 text-amber-700',
    DESLIGADO: 'bg-red-100 text-red-700',
};

const LaborEmployeeList: React.FC<LaborEmployeeListProps> = ({ employees, organizations = [], onEdit, onRefresh }) => {
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<EmployeeStatus | 'ALL'>('ATIVO');
    const [filterContract, setFilterContract] = useState<ContractType | 'ALL'>('ALL');
    const [sortBy, setSortBy] = useState<'name' | 'cost'>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const filtered = employees
        .filter(e => filterStatus === 'ALL' || e.status === filterStatus)
        .filter(e => filterContract === 'ALL' || e.contract_type === filterContract)
        .filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.role.toLowerCase().includes(search.toLowerCase()) || (e.cpf || '').replace(/\D/g, '').includes(search.replace(/\D/g, '')))
        .sort((a, b) => {
            let cmp = 0;
            if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
            else cmp = (a.daily_cost || 0) - (b.daily_cost || 0);
            return sortDir === 'asc' ? cmp : -cmp;
        });

    const handleToggleStatus = async (emp: Employee) => {
        try {
            const newStatus: EmployeeStatus = emp.status === 'ATIVO' ? 'INATIVO' : 'ATIVO';
            await laborService.updateEmployee(emp.id, { status: newStatus });
            onRefresh();
        } catch (err) {
            alert('Erro ao alterar status do colaborador.');
        }
    };
    
    const handleDeleteEmployee = async (emp: Employee) => {
        if (!confirm(`Deseja realmente excluir permanentemente o colaborador ${emp.name}? Esta ação não pode ser desfeita e pode falhar se houver registros vinculados.`)) return;
        try {
            await laborService.removeEmployee(emp.id);
            onRefresh();
        } catch (err: any) {
            console.error('Erro ao excluir colaborador:', err);
            if (err.code === '23503') {
                alert('Não é possível excluir este colaborador pois existem registros vinculados (pontos, alocações, etc). Considere inativá-lo em vez de excluir.');
            } else {
                alert('Erro ao excluir colaborador: ' + (err.message || 'Tente novamente'));
            }
        }
    };

    const handleSort = (col: 'name' | 'cost') => {
        if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortBy(col); setSortDir('asc'); }
    };

    const SortIcon = ({ col }: { col: 'name' | 'cost' }) => sortBy === col
        ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
        : <ChevronDown className="w-3 h-3 opacity-30" />;

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        placeholder="Buscar colaborador ou função..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Filter className="w-4 h-4 text-slate-400" />
                    {(['ATIVO', 'INATIVO', 'AFASTADO', 'ALL'] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setFilterStatus(s)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterStatus === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                            {s === 'ALL' ? 'Todos' : s.charAt(0) + s.slice(1).toLowerCase()}
                        </button>
                    ))}
                    <select
                        value={filterContract}
                        onChange={e => setFilterContract(e.target.value as any)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 outline-none"
                    >
                        <option value="ALL">Todos os vínculos</option>
                        {Object.entries(CONTRACT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full">
                    <thead className="bg-slate-50/80 border-b border-slate-100">
                        <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            <th className="px-6 py-4 text-left">
                                <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">
                                    Colaborador <SortIcon col="name" />
                                </button>
                            </th>
                            <th className="px-4 py-4 text-left">Função</th>
                            {organizations.length > 1 && <th className="px-4 py-4 text-left">Organização</th>}
                            <th className="px-4 py-4 text-left">Vínculo</th>
                            <th className="px-4 py-4 text-left">Status</th>
                            <th className="px-4 py-4 text-right">Salário Base</th>
                            <th className="px-4 py-4 text-right">
                                <button onClick={() => handleSort('cost')} className="flex items-center gap-1 ml-auto hover:text-slate-700 transition-colors">
                                    Custo/Dia <SortIcon col="cost" />
                                </button>
                            </th>
                            <th className="px-6 py-4 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={organizations.length > 1 ? 9 : 8} className="px-6 py-16 text-center text-slate-400">
                                    <div className="flex flex-col items-center gap-2">
                                        <Briefcase className="w-10 h-10 opacity-20" />
                                        <p className="font-medium">Nenhum colaborador encontrado</p>
                                        <p className="text-xs">Cadastre o primeiro colaborador usando o botão "Novo Colaborador"</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                        {filtered.map(emp => (
                            <tr key={emp.id} className="group hover:bg-slate-50/50 transition-all">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-sm">
                                            {emp.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">{emp.name}</p>
                                            {emp.cpf && <p className="text-[10px] text-slate-400">{emp.cpf}</p>}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-4">
                                    <span className="text-xs font-bold text-slate-600">{emp.role}</span>
                                </td>
                                {organizations.length > 1 && (
                                    <td className="px-4 py-4">
                                        <div className="flex items-center gap-1.5 min-w-[120px]">
                                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                            <span className="text-[10px] font-bold text-slate-500 truncate" title={organizations.find(o => o.id === emp.org_id)?.name || 'Desconhecida'}>
                                                {organizations.find(o => o.id === emp.org_id)?.name || 'Desconhecida'}
                                            </span>
                                        </div>
                                    </td>
                                )}
                                <td className="px-4 py-4">
                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${CONTRACT_COLORS[emp.contract_type]}`}>
                                        {CONTRACT_LABELS[emp.contract_type]}
                                    </span>
                                </td>
                                <td className="px-4 py-4">
                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${STATUS_COLORS[emp.status]}`}>
                                        {emp.status}
                                    </span>
                                </td>
                                <td className="px-4 py-4 text-right">
                                    {emp.base_salary > 0 ? (
                                        <span className="text-xs font-black text-slate-900">
                                            R$ {emp.base_salary.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] text-slate-300 font-bold">—</span>
                                    )}
                                </td>
                                <td className="px-4 py-4 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        <DollarSign className="w-3 h-3 text-slate-400" />
                                        <span className="text-xs font-black text-slate-900">
                                            {(emp.daily_cost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    {emp.hourly_cost > 0 && (
                                        <div className="flex items-center justify-end gap-1 mt-0.5">
                                            <Clock className="w-3 h-3 text-slate-300" />
                                            <span className="text-[10px] text-slate-400">
                                                {(emp.hourly_cost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/h
                                            </span>
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => onEdit(emp)}
                                            className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
                                            title="Editar"
                                        >
                                            <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => handleToggleStatus(emp)}
                                            className={`p-1.5 rounded-lg transition-colors ${emp.status === 'ATIVO' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                                            title={emp.status === 'ATIVO' ? 'Inativar' : 'Reativar'}
                                        >
                                            {emp.status === 'ATIVO' ? <UserMinus className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                                        </button>
                                        <button
                                            onClick={() => handleDeleteEmployee(emp)}
                                            className="p-1.5 bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors"
                                            title="Excluir Permanentemente"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filtered.length > 0 && (
                    <div className="px-6 py-3 bg-slate-50/80 border-t border-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center justify-between">
                        <span>{filtered.length} colaboradores</span>
                        <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {employees.filter(e => e.status === 'ATIVO').length} ativos
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LaborEmployeeList;
