import React, { useEffect, useState, useCallback } from 'react';
import { FileText, CheckCircle, XCircle, Clock, ExternalLink } from 'lucide-react';
import { servicesCommercialService, ServiceContract } from '../../services/servicesCommercialService';
import { ServicesView } from '../ServicesCommercialModule';

interface Props {
  organizationId: string;
  onNavigate: (view: ServicesView, opportunityId?: string) => void;
  onGoToContract: (contractId: string) => void;
}

const STATUS_LABELS: Record<ServiceContract['status'], string> = {
  draft: 'Rascunho', active: 'Ativo', completed: 'Concluído', cancelled: 'Cancelado',
};

const STATUS_STYLE: Record<ServiceContract['status'], string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_ICON: Record<ServiceContract['status'], React.ReactNode> = {
  draft: <Clock size={13} />,
  active: <CheckCircle size={13} />,
  completed: <CheckCircle size={13} />,
  cancelled: <XCircle size={13} />,
};

const fmt = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

type ContractWithRich = ServiceContract & { rich_contract_id: string | null };

const ServicesContracts: React.FC<Props> = ({ organizationId, onNavigate, onGoToContract }) => {
  const [contracts, setContracts] = useState<ContractWithRich[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ServiceContract['status'] | 'all'>('all');

  const load = useCallback(() => {
    setLoading(true);
    servicesCommercialService.listContracts(organizationId)
      .then(data => setContracts(data as ContractWithRich[]))
      .finally(() => setLoading(false));
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const filtered = contracts.filter(c => {
    const matchSearch = !search ||
      c.contract_number.toLowerCase().includes(search.toLowerCase()) ||
      c.client_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalActive = contracts.filter(c => c.status === 'active').reduce((s, c) => s + c.total_value, 0);

  const handleRowClick = (c: ContractWithRich) => {
    if (c.rich_contract_id) {
      onGoToContract(c.rich_contract_id);
    } else if (c.opportunity_id) {
      onNavigate('opportunity', c.opportunity_id);
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex-1">Contratos</h2>
        {!loading && (
          <span className="text-xs text-gray-400">
            {contracts.length} contrato{contracts.length !== 1 ? 's' : ''} · Ativos: {fmt(totalActive)}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por número ou cliente..."
          className="flex-1 min-w-48 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-1">
          {(['all', 'draft', 'active', 'completed', 'cancelled'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
              }`}
            >
              {s === 'all' ? 'Todos' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="space-y-px">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-50 dark:bg-gray-700/50 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
            <FileText size={32} strokeWidth={1} />
            <p className="text-sm">
              {contracts.length === 0
                ? 'Nenhum contrato gerado ainda. Feche uma oportunidade para criar um contrato.'
                : 'Nenhum resultado para os filtros aplicados.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Número</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Início</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {filtered.map(c => (
                <tr
                  key={c.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                  onClick={() => handleRowClick(c)}
                >
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-700 dark:text-blue-400">
                    {c.contract_number}
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{c.client_name}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-600 dark:text-green-400">
                    {fmt(c.total_value)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[c.status]}`}>
                      {STATUS_ICON[c.status]} {STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {c.start_date ? new Date(c.start_date).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.rich_contract_id ? (
                      <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                        <ExternalLink size={12} /> Ver contrato
                      </span>
                    ) : c.opportunity_id ? (
                      <span className="text-gray-400">Ver oportunidade →</span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ServicesContracts;
