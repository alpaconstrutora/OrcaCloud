import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  FileText, CheckCircle, XCircle, Clock, ExternalLink,
  Search, LayoutGrid, List, RotateCcw, DollarSign,
  Calendar, User, ChevronUp, ChevronDown, ChevronsUpDown,
  Shield,
} from 'lucide-react';
import { servicesCommercialService, ServiceContract } from '../../services/servicesCommercialService';
import { ServicesView } from '../ServicesCommercialModule';

interface Props {
  organizationId: string | null;
  onNavigate: (view: ServicesView, opportunityId?: string, opportunityOrgId?: string) => void;
  onGoToContract: (contractId: string, contractOrgId?: string) => void;
}

const STATUS_LABELS: Record<ServiceContract['status'], string> = {
  draft: 'Rascunho', active: 'Ativo', completed: 'Concluído', cancelled: 'Cancelado',
};

const STATUS_COLORS: Record<ServiceContract['status'], string> = {
  draft: 'bg-gray-100 text-gray-800',
  active: 'bg-green-100 text-green-800',
  completed: 'bg-blue-100 text-blue-800',
  cancelled: 'bg-red-100 text-red-800',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : 'Indeterminado';

type ContractWithRich = ServiceContract & { rich_contract_id: string | null };

const STAT_ICON_CLS: Record<string, string> = {
  blue:   'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white',
  green:  'bg-green-50 text-green-600 group-hover:bg-green-600 group-hover:text-white',
  indigo: 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white',
  amber:  'bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white',
};
const STAT_BG_CLS: Record<string, string> = {
  blue:   'bg-blue-500/5',
  green:  'bg-green-500/5',
  indigo: 'bg-indigo-500/5',
  amber:  'bg-amber-500/5',
};

const StatusBadge = ({ status }: { status: ServiceContract['status'] }) => (
  <span className={`px-2 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${STATUS_COLORS[status]}`}>
    {STATUS_LABELS[status]}
  </span>
);

const ServicesContracts: React.FC<Props> = ({ organizationId, onNavigate, onGoToContract }) => {
  const [contracts, setContracts] = useState<ContractWithRich[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ServiceContract['status'] | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortBy, setSortBy] = useState('date-desc');

  const load = useCallback(() => {
    setLoading(true);
    servicesCommercialService.listContracts(organizationId)
      .then(data => setContracts(data as ContractWithRich[]))
      .finally(() => setLoading(false));
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (field: string) => {
    setSortBy(prev => {
      const [f, dir] = prev.split('-');
      if (f === field) return `${field}-${dir === 'asc' ? 'desc' : 'asc'}`;
      return `${field}-asc`;
    });
  };

  const SortIcon = ({ field }: { field: string }) => {
    const [f, dir] = sortBy.split('-');
    if (f !== field) return <ChevronsUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return dir === 'asc'
      ? <ChevronUp className="w-3 h-3 ml-1 text-blue-500" />
      : <ChevronDown className="w-3 h-3 ml-1 text-blue-500" />;
  };

  const filtered = useMemo(() => {
    const [field, dir] = sortBy.split('-');
    return contracts
      .filter(c => statusFilter === 'all' || c.status === statusFilter)
      .filter(c =>
        !search ||
        c.contract_number.toLowerCase().includes(search.toLowerCase()) ||
        c.client_name.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => {
        let cmp = 0;
        if (field === 'number') cmp = a.contract_number.localeCompare(b.contract_number, undefined, { numeric: true });
        if (field === 'client') cmp = a.client_name.localeCompare(b.client_name);
        if (field === 'value')  cmp = a.total_value - b.total_value;
        if (field === 'status') cmp = a.status.localeCompare(b.status);
        if (field === 'date')   cmp = new Date(a.start_date ?? '').getTime() - new Date(b.start_date ?? '').getTime();
        return dir === 'asc' ? cmp : -cmp;
      });
  }, [contracts, search, statusFilter, sortBy]);

  const stats = {
    total: contracts.length,
    active: contracts.filter(c => c.status === 'active').length,
    totalValue: contracts.reduce((s, c) => s + c.total_value, 0),
    completed: contracts.filter(c => c.status === 'completed').length,
  };

  const handleRowClick = (c: ContractWithRich) => {
    if (c.rich_contract_id) {
      onGoToContract(c.rich_contract_id, c.organization_id);
    } else if (c.opportunity_id) {
      onNavigate('opportunity', c.opportunity_id, c.organization_id);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-gray-400 font-medium animate-pulse uppercase tracking-widest text-xs">Carregando Contratos...</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium text-gray-900 tracking-tight">Contratos de Serviço</h1>
          <p className="text-gray-400 text-sm mt-1.5 font-medium">Contratos gerados a partir de oportunidades fechadas.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm mr-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                : 'text-gray-400 hover:text-gray-600'}`}
              title="Visualização em Grade"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2.5 rounded-xl transition-all ${viewMode === 'list'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                : 'text-gray-400 hover:text-gray-600'}`}
              title="Visualização em Lista"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={load}
            className="p-4 bg-white border border-gray-100 rounded-2xl text-gray-400 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm active:scale-95 group"
            title="Recarregar"
          >
            <RotateCcw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total de Contratos',  value: stats.total,                                                                                     icon: FileText,    color: 'blue' },
          { label: 'Contratos Ativos',    value: stats.active,                                                                                    icon: Shield,      color: 'green' },
          { label: 'Valor Total',         value: fmt(stats.totalValue),                                                                           icon: DollarSign,  color: 'indigo' },
          { label: 'Concluídos',          value: stats.completed,                                                                                 icon: CheckCircle, color: 'amber' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all group overflow-hidden relative">
            <div className={`absolute top-0 right-0 w-24 h-24 rounded-full -mr-8 -mt-8 group-hover:scale-150 transition-transform duration-500 ${STAT_BG_CLS[stat.color]}`} />
            <div className="flex items-start justify-between relative z-10">
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">{stat.label}</p>
                <h3 className="text-xl font-medium text-gray-900 tracking-tight">{stat.value}</h3>
              </div>
              <div className={`p-3 rounded-2xl transition-all duration-300 ${STAT_ICON_CLS[stat.color]}`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
          <input
            type="text"
            placeholder="Buscar por número ou cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white border border-gray-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all shadow-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as ServiceContract['status'] | 'all')}
          className="px-6 py-4 bg-white border border-gray-100 rounded-2xl text-xs font-medium text-gray-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 shadow-sm cursor-pointer hover:bg-gray-50 transition-all uppercase tracking-widest"
        >
          <option value="all">Todos os Status</option>
          <option value="active">Ativo</option>
          <option value="draft">Rascunho</option>
          <option value="completed">Concluído</option>
          <option value="cancelled">Cancelado</option>
        </select>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-[40px] p-20 text-center border-2 border-dashed border-gray-100">
          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <FileText className="w-10 h-10 text-gray-200" />
          </div>
          <h3 className="text-xl font-medium text-gray-900 tracking-tight">Nenhum contrato encontrado</h3>
          <p className="text-gray-400 text-sm mt-2 font-medium max-w-xs mx-auto">
            {contracts.length === 0
              ? 'Feche uma oportunidade para gerar o primeiro contrato.'
              : 'Nenhum resultado para os filtros aplicados.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(c => (
            <div
              key={c.id}
              onClick={() => handleRowClick(c)}
              className="bg-white rounded-[32px] border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-blue-900/5 transition-all group overflow-hidden flex flex-col p-8 cursor-pointer"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="p-4 bg-blue-50 rounded-2xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all duration-500">
                  <FileText className="w-6 h-6" />
                </div>
                <StatusBadge status={c.status} />
              </div>

              <div className="space-y-1 mb-6">
                <p className="text-xs font-medium text-blue-500 uppercase tracking-widest">{c.contract_number}</p>
                <h3 className="text-lg font-medium text-gray-900 tracking-tight leading-tight group-hover:text-blue-600 transition-colors uppercase">{c.client_name}</h3>
              </div>

              <div className="space-y-4 mb-8 flex-1">
                <div className="flex items-center gap-3 text-gray-500">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-medium truncate">{c.client_name}</span>
                </div>
                <div className="flex items-center gap-3 text-gray-500">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-medium">
                    {fmtDate(c.start_date)} a {fmtDate(c.end_date)}
                  </span>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-50 mt-auto">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">Valor Total</p>
                    <p className="text-xl font-medium text-gray-900 tracking-tighter">{fmt(c.total_value)}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all duration-500">
                    <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50">
                  {[
                    { label: 'Número',   field: 'number', align: '' },
                    { label: 'Cliente',  field: 'client', align: '' },
                    { label: 'Vigência', field: 'date',   align: '' },
                    { label: 'Status',   field: 'status', align: '' },
                    { label: 'Valor Total', field: 'value', align: 'text-right' },
                  ].map(col => (
                    <th
                      key={col.field}
                      onClick={() => handleSort(col.field)}
                      className={`px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-widest cursor-pointer select-none hover:text-blue-500 transition-colors ${col.align}`}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        {col.label}
                        <SortIcon field={col.field} />
                      </span>
                    </th>
                  ))}
                  <th className="px-6 py-4 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(c => (
                  <tr
                    key={c.id}
                    onClick={() => handleRowClick(c)}
                    className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-5">
                      <span className="text-xs font-medium text-blue-500 uppercase tracking-widest">{c.contract_number}</span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-medium text-gray-900 group-hover:text-blue-600 transition-colors uppercase">{c.client_name}</p>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2 text-gray-500">
                        <Calendar className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">{fmtDate(c.start_date)} a {fmtDate(c.end_date)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-6 py-5 text-right font-medium text-gray-900 tracking-tighter text-xs">
                      {fmt(c.total_value)}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        {c.rich_contract_id ? (
                          <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                            <ExternalLink className="w-4 h-4" />
                          </div>
                        ) : c.opportunity_id ? (
                          <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                            <ExternalLink className="w-4 h-4" />
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicesContracts;
