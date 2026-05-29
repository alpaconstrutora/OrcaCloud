import React, { useEffect, useState } from 'react';
import { TrendingUp, Users, Send, DollarSign, Percent } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
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

const STAGE_META: Record<string, { label: string; color: string }> = {
  lead:     { label: 'Lead',     color: '#6b7280' },
  visit:    { label: 'Visita',   color: '#3b82f6' },
  budget:   { label: 'Orçamento', color: '#f59e0b' },
  proposal: { label: 'Proposta', color: '#8b5cf6' },
  won:      { label: 'Ganho',    color: '#10b981' },
  lost:     { label: 'Perdido',  color: '#ef4444' },
};

const KPICard: React.FC<{ icon: React.ReactNode; label: string; value: string; color: string }> = ({ icon, label, value, color }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
    <div className="flex items-center gap-3 mb-3">
      <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
    </div>
    <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
  </div>
);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const fmt = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-gray-900 dark:text-white mb-1">{STAGE_META[label]?.label ?? label}</p>
      <p className="text-gray-600 dark:text-gray-300">{payload[0]?.value} oportunidade{payload[0]?.value !== 1 ? 's' : ''}</p>
      {payload[1]?.value > 0 && (
        <p className="text-green-600 dark:text-green-400">{fmt(payload[1].value)}</p>
      )}
    </div>
  );
};

const ServicesDashboard: React.FC<Props> = ({ organizationId, onNavigate }) => {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [stageCounts, setStageCounts] = useState<{ stage: string; count: number; value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      servicesCommercialService.getKPIs(organizationId),
      servicesCommercialService.getStageCounts(organizationId),
    ]).then(([k, s]) => {
      setKpis(k);
      setStageCounts(s);
    }).finally(() => setLoading(false));
  }, [organizationId]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Comercial — Serviços</h2>
        <div className="flex gap-3">
          <button onClick={() => onNavigate('contracts' as ServicesView)} className="text-sm text-gray-500 hover:text-blue-600">
            Contratos →
          </button>
          <button onClick={() => onNavigate('pipeline')} className="text-sm text-blue-600 hover:underline">
            Ver pipeline →
          </button>
        </div>
      </div>

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : kpis ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard icon={<Users size={18} className="text-blue-600" />} label="Leads ativos" value={String(kpis.activeLeads)} color="bg-blue-50 dark:bg-blue-900/30" />
          <KPICard icon={<Send size={18} className="text-purple-600" />} label="Propostas enviadas" value={String(kpis.proposalsSent)} color="bg-purple-50 dark:bg-purple-900/30" />
          <KPICard icon={<DollarSign size={18} className="text-green-600" />} label="Em negociação" value={fmt(kpis.inNegotiation)} color="bg-green-50 dark:bg-green-900/30" />
          <KPICard icon={<Percent size={18} className="text-orange-600" />} label="Taxa de conversão" value={`${kpis.conversionRate}%`} color="bg-orange-50 dark:bg-orange-900/30" />
        </div>
      ) : null}

      {/* Pipeline chart */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Distribuição do Pipeline</h3>
        {loading ? (
          <div className="h-48 bg-gray-50 dark:bg-gray-700 rounded-lg animate-pulse" />
        ) : stageCounts.every(s => s.count === 0) ? (
          <div className="h-48 flex items-center justify-center text-sm text-gray-400">
            Sem oportunidades ainda.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stageCounts} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <XAxis
                dataKey="stage"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => STAGE_META[v]?.label ?? v}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={24}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48}>
                {stageCounts.map((entry) => (
                  <Cell key={entry.stage} fill={STAGE_META[entry.stage]?.color ?? '#6b7280'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default ServicesDashboard;
