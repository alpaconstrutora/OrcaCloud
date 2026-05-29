import React, { useEffect, useState, useMemo } from 'react';
import { X, Search, Calculator, Calendar } from 'lucide-react';
import {
  servicesCommercialService,
  EngineeringProjectSummary,
} from '../../services/servicesCommercialService';

interface Props {
  organizationId: string;
  onClose: () => void;
  onSelect: (project: EngineeringProjectSummary) => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

const ServicesEngineeringPicker: React.FC<Props> = ({ organizationId, onClose, onSelect }) => {
  const [projects, setProjects] = useState<EngineeringProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    servicesCommercialService.listEngineeringProjects(organizationId)
      .then(setProjects)
      .finally(() => setLoading(false));
  }, [organizationId]);

  const filtered = useMemo(() =>
    projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase())),
    [projects, search]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Vincular orçamento da Engenharia
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-700">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              placeholder="Buscar orçamento por nome..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-2 py-2">
          {loading ? (
            <div className="text-center text-sm text-gray-400 py-8">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-8">
              {projects.length === 0
                ? 'Nenhum orçamento de engenharia disponível nesta organização.'
                : 'Nenhum resultado para a busca.'}
            </div>
          ) : (
            filtered.map(p => (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                className="w-full text-left px-4 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors mb-1"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Calculator size={11} /> BDI {p.bdi_pct}%
                      </span>
                      {p.updated_at && (
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          {new Date(p.updated_at).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-green-600 shrink-0">{fmt(p.total)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ServicesEngineeringPicker;
