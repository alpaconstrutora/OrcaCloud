import React from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, FileSearch,
  Filter, Loader2, Plus, Search, Shield, XCircle,
  ChevronDown, BarChart3, Gavel
} from 'lucide-react';
import { qualityConditionService } from '../services/qualityConditionService';
import type {
  ConstructionCondition, ConditionState, Severity, ConditionFilters
} from '../types/quality';
import DetectConditionModal from './quality/DetectConditionModal';
import ConditionDetailPanel from './quality/ConditionDetailPanel';

interface ObraRef { id: string; name: string; }

interface QualityModuleProps {
  organizationId: string;
  userId: string;
  userName: string;
  userRole?: string;
  obras?: ObraRef[];
}

// ────────────────────────────────────────────────────────────
// Helpers visuais
// ────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; bg: string }> = {
  baixa:   { label: 'Baixa',   color: 'text-green-700',  bg: 'bg-green-100' },
  media:   { label: 'Média',   color: 'text-yellow-700', bg: 'bg-yellow-100' },
  alta:    { label: 'Alta',    color: 'text-orange-700', bg: 'bg-orange-100' },
  critica: { label: 'Crítica', color: 'text-red-700',    bg: 'bg-red-100' },
};

const STATE_CONFIG: Record<ConditionState, { label: string; icon: React.ReactNode; color: string }> = {
  DETECTED:        { label: 'Detectada',       icon: <FileSearch className="w-3 h-3" />, color: 'text-gray-600' },
  CLASSIFIED:      { label: 'Classificada',    icon: <Filter className="w-3 h-3" />,     color: 'text-blue-600' },
  ACTION_REQUIRED: { label: 'Ação necessária', icon: <AlertTriangle className="w-3 h-3" />, color: 'text-orange-600' },
  IN_REPAIR:       { label: 'Em reparo',       icon: <Clock className="w-3 h-3" />,      color: 'text-blue-600' },
  REPAIRED:        { label: 'Reparada',        icon: <CheckCircle2 className="w-3 h-3" />, color: 'text-teal-600' },
  VALIDATED:       { label: 'Validada',        icon: <Shield className="w-3 h-3" />,     color: 'text-green-600' },
  CONTESTED:       { label: 'Contestada',      icon: <XCircle className="w-3 h-3" />,    color: 'text-red-600' },
  ESCALATED:       { label: 'Escalada',        icon: <Gavel className="w-3 h-3" />,      color: 'text-purple-600' },
  REOPENED:        { label: 'Reaberta',        icon: <AlertTriangle className="w-3 h-3" />, color: 'text-orange-600' },
  CLOSED:          { label: 'Encerrada',       icon: <CheckCircle2 className="w-3 h-3" />, color: 'text-gray-400' },
};

function SeverityBadge({ severity }: { severity: Severity }) {
  const cfg = SEVERITY_CONFIG[severity];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function StateBadge({ state }: { state: ConditionState }) {
  const cfg = STATE_CONFIG[state];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function QualityScoreBar({ score }: { score?: number }) {
  if (score === undefined) return <span className="text-gray-400 text-xs">—</span>;
  const color = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-gray-600 w-7 text-right">{score}</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Componente principal
// ────────────────────────────────────────────────────────────

const QualityModule: React.FC<QualityModuleProps> = ({
  organizationId, userId, userName, userRole, obras = []
}) => {
  const [conditions, setConditions]         = React.useState<ConstructionCondition[]>([]);
  const [isLoading, setIsLoading]           = React.useState(true);
  const [searchTerm, setSearchTerm]         = React.useState('');
  const [stateFilter, setStateFilter]       = React.useState<ConditionState | 'all'>('all');
  const [severityFilter, setSeverityFilter] = React.useState<Severity | 'all'>('all');
  const [isDetectOpen, setIsDetectOpen]     = React.useState(false);
  const [selectedId, setSelectedId]         = React.useState<string | null>(null);
  const [error, setError]                   = React.useState<string | null>(null);

  const currentActor = React.useMemo(() => ({
    actorId:   userId,
    actorType: 'user' as const,
    name:      userName,
    roleAtTime: userRole,
  }), [userId, userName, userRole]);

  const loadConditions = React.useCallback(async () => {
    if (!organizationId) {
      setConditions([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const filters: ConditionFilters = {
        organizationId,
        ...(stateFilter !== 'all'    && { state: [stateFilter] }),
        ...(severityFilter !== 'all' && { severity: [severityFilter] }),
      };
      const data = await qualityConditionService.list(filters);
      setConditions(data);
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar condições');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, stateFilter, severityFilter]);

  React.useEffect(() => {
    loadConditions();
  }, [loadConditions]);

  // Filtro de busca local (por id ou taxonomy)
  const filtered = React.useMemo(() => {
    if (!searchTerm.trim()) return conditions;
    const q = searchTerm.toLowerCase();
    return conditions.filter(c =>
      c.id.toLowerCase().includes(q) ||
      c.taxonomy?.pathologyCode?.toLowerCase().includes(q) ||
      c.taxonomy?.systemCode?.toLowerCase().includes(q) ||
      c.provisionalTaxonomy?.pathologyCode?.toLowerCase().includes(q)
    );
  }, [conditions, searchTerm]);

  // KPIs de topo
  const kpis = React.useMemo(() => ({
    total:    conditions.length,
    criticas: conditions.filter(c => c.severity === 'critica' && c.state !== 'CLOSED').length,
    abertas:  conditions.filter(c => !['CLOSED', 'VALIDATED'].includes(c.state)).length,
    escaladas: conditions.filter(c => c.state === 'ESCALATED').length,
  }), [conditions]);

  const selectedCondition = conditions.find(c => c.id === selectedId) ?? null;

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Qualidade & Entrega</h1>
            <p className="text-sm text-gray-500 mt-0.5">Registro e acompanhamento de condições construtivas</p>
          </div>
          <button
            onClick={() => setIsDetectOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova condição
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          <KpiCard label="Total" value={kpis.total} icon={<BarChart3 className="w-4 h-4 text-gray-400" />} />
          <KpiCard label="Abertas" value={kpis.abertas} icon={<Clock className="w-4 h-4 text-orange-400" />} color="orange" />
          <KpiCard label="Críticas" value={kpis.criticas} icon={<AlertTriangle className="w-4 h-4 text-red-400" />} color="red" />
          <KpiCard label="Escaladas" value={kpis.escaladas} icon={<Gavel className="w-4 h-4 text-purple-400" />} color="purple" />
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por código ou patologia..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <StateFilter value={stateFilter} onChange={setStateFilter} />
        <SeverityFilter value={severityFilter} onChange={setSeverityFilter} />

        {(stateFilter !== 'all' || severityFilter !== 'all') && (
          <button
            onClick={() => { setStateFilter('all'); setSeverityFilter('all'); }}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex flex-1 overflow-hidden">

        {/* Lista */}
        <div className={`flex flex-col overflow-hidden transition-all ${selectedId ? 'w-2/5' : 'w-full'}`}>
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">{error}</p>
                <button onClick={loadConditions} className="mt-3 text-sm text-blue-600 hover:underline">
                  Tentar novamente
                </button>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <FileSearch className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-medium">Nenhuma condição encontrada</p>
                <p className="text-xs mt-1">
                  {searchTerm || stateFilter !== 'all' || severityFilter !== 'all'
                    ? 'Tente ajustar os filtros'
                    : 'Registre a primeira condição com o botão acima'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Condição</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Estado</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Severidade</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs w-32">Qualidade</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Detectada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(c => (
                    <ConditionRow
                      key={c.id}
                      condition={c}
                      selected={c.id === selectedId}
                      onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Painel de detalhe */}
        {selectedId && selectedCondition && (
          <div className="w-3/5 border-l border-gray-200 bg-white overflow-y-auto">
            <ConditionDetailPanel
              condition={selectedCondition}
              currentActor={currentActor}
              organizationId={organizationId}
              onClose={() => setSelectedId(null)}
              onRefresh={loadConditions}
            />
          </div>
        )}
      </div>

      {/* Modal de detecção */}
      {isDetectOpen && (
        <DetectConditionModal
          organizationId={organizationId}
          obras={obras}
          currentActor={currentActor}
          onClose={() => setIsDetectOpen(false)}
          onCreated={(id) => {
            setIsDetectOpen(false);
            loadConditions().then(() => setSelectedId(id));
          }}
        />
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// Sub-componentes
// ────────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon, color = 'gray'
}: { label: string; value: number; icon: React.ReactNode; color?: string }) {
  const bg = color === 'orange' ? 'bg-orange-50' :
             color === 'red'    ? 'bg-red-50'    :
             color === 'purple' ? 'bg-purple-50' : 'bg-gray-50';
  const text = color === 'orange' ? 'text-orange-700' :
               color === 'red'    ? 'text-red-700'    :
               color === 'purple' ? 'text-purple-700' : 'text-gray-700';

  return (
    <div className={`${bg} rounded-lg px-4 py-3 flex items-center gap-3`}>
      {icon}
      <div>
        <div className={`text-2xl font-bold ${text}`}>{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}

function ConditionRow({
  condition, selected, onClick
}: { condition: ConstructionCondition; selected: boolean; onClick: () => void }) {
  const taxonomy = condition.taxonomy ?? condition.provisionalTaxonomy;
  const date = new Date(condition.detectedAt).toLocaleDateString('pt-BR');

  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer transition-colors ${
        selected ? 'bg-blue-50' : 'hover:bg-gray-50'
      }`}
    >
      <td className="px-4 py-3">
        <div className="font-mono text-xs text-gray-400">{condition.id.slice(0, 8)}…</div>
        <div className="text-sm font-medium text-gray-800 mt-0.5">
          {taxonomy?.pathologyCode ?? taxonomy?.systemCode ?? '—'}
        </div>
        {!condition.taxonomy && condition.provisionalTaxonomy && (
          <span className="text-xs text-yellow-600 italic">provisional</span>
        )}
      </td>
      <td className="px-4 py-3">
        <StateBadge state={condition.state} />
      </td>
      <td className="px-4 py-3">
        <SeverityBadge severity={condition.severity} />
      </td>
      <td className="px-4 py-3">
        <QualityScoreBar score={condition.qualityScore?.value} />
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">{date}</td>
    </tr>
  );
}

function StateFilter({
  value, onChange
}: { value: ConditionState | 'all'; onChange: (v: ConditionState | 'all') => void }) {
  const options: { value: ConditionState | 'all'; label: string }[] = [
    { value: 'all',            label: 'Todos os estados' },
    { value: 'DETECTED',       label: 'Detectada' },
    { value: 'CLASSIFIED',     label: 'Classificada' },
    { value: 'ACTION_REQUIRED', label: 'Ação necessária' },
    { value: 'IN_REPAIR',      label: 'Em reparo' },
    { value: 'REPAIRED',       label: 'Reparada' },
    { value: 'VALIDATED',      label: 'Validada' },
    { value: 'CONTESTED',      label: 'Contestada' },
    { value: 'ESCALATED',      label: 'Escalada' },
    { value: 'CLOSED',         label: 'Encerrada' },
  ];

  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value as ConditionState | 'all')}
        className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
    </div>
  );
}

function SeverityFilter({
  value, onChange
}: { value: Severity | 'all'; onChange: (v: Severity | 'all') => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value as Severity | 'all')}
        className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        <option value="all">Todas as severidades</option>
        <option value="baixa">Baixa</option>
        <option value="media">Média</option>
        <option value="alta">Alta</option>
        <option value="critica">Crítica</option>
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
    </div>
  );
}

export default QualityModule;
