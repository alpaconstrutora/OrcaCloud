import React, { useEffect, useState } from 'react';
import { TrendingUp, Users, Send, DollarSign, Percent } from 'lucide-react';
import { servicesCommercialService } from '../../services/servicesCommercialService';
import { ServicesView } from '../ServicesCommercialModule';

interface Props {
  organizationId: string;
  onNavigate: (view: ServicesView, opportunityId?: string) => void;
}

interface KPIs {
  activeLeads: number;
  proposalsSent: number;
  inNegotiation: number;
  conversionRate: number;
}

const KPICard: React.FC<{ icon: React.ReactNode; label: string; value: string; color: string }> = ({ icon, label, value, color }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
    <div className="flex items-center gap-3 mb-3">
      <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
    </div>
    <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
  </div>
);

const ServicesDashboard: React.FC<Props> = ({ organizationId, onNavigate }) => {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    servicesCommercialService.getKPIs(organizationId)
      .then(setKpis)
      .finally(() => setLoading(false));
  }, [organizationId]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Comercial — Serviços</h2>
        <button
          onClick={() => onNavigate('pipeline')}
          className="text-sm text-blue-600 hover:underline"
        >
          Ver pipeline →
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : kpis ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard
            icon={<Users size={18} className="text-blue-600" />}
            label="Leads ativos"
            value={String(kpis.activeLeads)}
            color="bg-blue-50 dark:bg-blue-900/30"
          />
          <KPICard
            icon={<Send size={18} className="text-purple-600" />}
            label="Propostas enviadas"
            value={String(kpis.proposalsSent)}
            color="bg-purple-50 dark:bg-purple-900/30"
          />
          <KPICard
            icon={<DollarSign size={18} className="text-green-600" />}
            label="Em negociação"
            value={fmt(kpis.inNegotiation)}
            color="bg-green-50 dark:bg-green-900/30"
          />
          <KPICard
            icon={<Percent size={18} className="text-orange-600" />}
            label="Taxa de conversão"
            value={`${kpis.conversionRate}%`}
            color="bg-orange-50 dark:bg-orange-900/30"
          />
        </div>
      ) : null}

      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 text-center text-gray-400 text-sm">
        Gráfico de pipeline — próxima iteração
      </div>
    </div>
  );
};

export default ServicesDashboard;
