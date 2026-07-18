import React from 'react';
import { seroCalculator } from '../services/seroCalculator';
import { cnoService } from '../services/cnoService';
import { Calculator, ArrowRight, TrendingDown, Percent, Info } from 'lucide-react';
import { OpuraCnoRegistration, OpuraCnoArea, OpuraCnoReduction } from '../types';

interface SeroMemorySimulatorProps {
  registration: OpuraCnoRegistration | null;
}

export const SeroMemorySimulator: React.FC<SeroMemorySimulatorProps> = ({ registration }) => {
  const [areas, setAreas] = React.useState<OpuraCnoArea[]>([]);
  const [reductions, setReductions] = React.useState<OpuraCnoReduction[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (registration?.id) {
      setLoading(true);
      Promise.all([
        cnoService.listAreas(registration.id),
        cnoService.listReductions(registration.id)
      ]).then(([resAreas, resReds]) => {
        setAreas(resAreas);
        setReductions(resReds);
      }).catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [registration]);

  if (!registration) {
    return (
      <div className="bg-amber-50 p-6 rounded-3xl border border-amber-200 mt-6">
        <p className="text-amber-800 font-semibold">Preencha e salve o Cadastro do CNO para habilitar a Memória de Cálculo SERO.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="text-gray-400 text-sm py-4">Carregando dados da aferição...</div>;
  }

  const calculation = seroCalculator.calculate({
    category: registration.sero_category || 'obra_nova',
    type: registration.sero_type || 'alvenaria',
    vauValue: registration.vau_value || 0,
    usedPreMixedConcrete: registration.used_pre_mixed_concrete || false,
    areas,
    reductions
  });

  return (
    <div className="bg-gradient-to-br from-gray-900 to-indigo-950 p-8 rounded-3xl text-white shadow-xl mt-6 relative overflow-hidden">
      {/* Decal de fundo */}
      <div className="absolute -right-20 -bottom-20 opacity-5">
        <Calculator className="w-96 h-96" />
      </div>

      <div className="relative z-10">
        <div className="mb-8">
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            Memória de Cálculo (SERO 3.0)
          </h2>
          <p className="text-indigo-200 text-sm">Aferição Indireta com base nas áreas, redutores e VAU cadastrados.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/10 p-5 rounded-2xl border border-white/10 backdrop-blur-sm">
            <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider mb-1">Equivalência Sero</p>
            <h4 className="text-2xl font-black text-white">{calculation.areaEquivalenteTotal.toFixed(2)} m²</h4>
            <div className="text-xs text-indigo-300 mt-2 space-y-1">
              <div>Principal: {calculation.areaEquivalentePrincipal.toFixed(2)} m²</div>
              <div>Complementar: {calculation.areaEquivalenteComplementar.toFixed(2)} m²</div>
            </div>
          </div>

          <div className="bg-white/10 p-5 rounded-2xl border border-white/10 backdrop-blur-sm">
            <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider mb-1">Custo da Obra (COD)</p>
            <h4 className="text-2xl font-black text-white">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculation.custoDaObra)}
            </h4>
            <div className="text-xs text-indigo-300 mt-2">
              VAU Aplicado: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(registration.vau_value || 0)}
            </div>
          </div>

          <div className="bg-white/10 p-5 rounded-2xl border border-white/10 backdrop-blur-sm">
            <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider mb-1">RMT (Apurada)</p>
            <h4 className="text-2xl font-black text-white">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculation.rmtApurada)}
            </h4>
            <div className="text-xs text-indigo-300 mt-2 space-y-1">
              {calculation.reducaoConcreto > 0 && <div>- Concreto: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculation.reducaoConcreto)}</div>}
              {calculation.reducaoPreMoldado > 0 && <div>- Pré-moldado: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculation.reducaoPreMoldado)}</div>}
            </div>
          </div>

          <div className="bg-indigo-600 p-5 rounded-2xl border border-indigo-400/30 shadow-inner">
            <p className="text-indigo-100 text-xs font-bold uppercase tracking-wider mb-1">Total a Recolher (INSS)</p>
            <h4 className="text-2xl font-black text-white">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculation.debitoTotal)}
            </h4>
            <div className="text-xs text-indigo-200 mt-2 font-semibold">
              Taxa Global de 36.8% s/ RMT
            </div>
          </div>
        </div>

        <div className="bg-black/20 rounded-2xl p-6 border border-white/10">
          <h5 className="text-sm font-bold text-white mb-4 flex items-center gap-2 uppercase tracking-widest">
            <Percent className="w-4 h-4" /> Distribuição de Débitos por Destinação (CR)
          </h5>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-400">Patronal (20%)</p>
              <p className="text-sm font-bold text-white">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculation.debitoPatronal)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Segurados (8%)</p>
              <p className="text-sm font-bold text-white">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculation.debitoSegurados)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">RAT (3%)</p>
              <p className="text-sm font-bold text-white">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculation.debitoRat)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Terceiros (5.8%)</p>
              <p className="text-sm font-bold text-white">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculation.debitoTerceiros)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
