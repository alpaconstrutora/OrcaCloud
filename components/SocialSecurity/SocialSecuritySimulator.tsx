import React, { useState, useEffect } from 'react';
import { ConstructionSocialSecurityRecord, ConstructionSocialSecuritySimulation } from '../../types';
import Button from '../ui/Button';
import { socialSecurityService } from '../../services/socialSecurityService';

interface Props {
  record: ConstructionSocialSecurityRecord | null;
}

export default function SocialSecuritySimulator({ record }: Props) {
  const [simulations, setSimulations] = useState<ConstructionSocialSecuritySimulation[]>([]);
  const [loading, setLoading] = useState(false);
  const [scenarioName, setScenarioName] = useState('Simulação Inicial');
  const [estimatedValue, setEstimatedValue] = useState('');

  useEffect(() => {
    if (record?.id) {
      socialSecurityService.getSimulations(record.id).then(setSimulations);
    }
  }, [record?.id]);

  const handleSimulate = async () => {
    if (!record?.id) {
      alert('Por favor, salve os dados gerais do CNO primeiro.');
      return;
    }
    
    if (!estimatedValue || Number(estimatedValue) <= 0) {
      alert('Por favor, insira o valor estimado da obra.');
      return;
    }

    setLoading(true);
    try {
      const val = Number(estimatedValue);
      // Dummy calc based on 20% labor and 20% tax
      const maoObra = val * 0.20;
      const inss = maoObra * 0.20;

      const sim = await socialSecurityService.saveSimulation({
        record_id: record.id,
        scenario: scenarioName,
        gross_estimated_amount: maoObra,
        net_estimated_amount: inss,
        credit_estimated_amount: 0,
      });

      setSimulations(prev => [sim, ...prev]);
      alert('Simulação realizada e salva com sucesso!');
    } catch (e: any) {
      alert('Erro ao realizar simulação: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
      <h3 className="text-lg font-medium mb-4">Simulador SERO / CUB</h3>
      <p className="text-sm text-slate-500 mb-6">Simule o valor devido de INSS da sua obra.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4 max-w-sm">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Nome do Cenário</label>
            <input 
              value={scenarioName} 
              onChange={e => setScenarioName(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm" 
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Custo Total Estimado da Obra (R$)</label>
            <input 
              type="number"
              value={estimatedValue} 
              onChange={e => setEstimatedValue(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm" 
              placeholder="0,00"
            />
          </div>
          <div className="pt-2">
            <Button onClick={handleSimulate} variant="primary" disabled={loading}>
              {loading ? 'Calculando...' : 'Calcular Simulação'}
            </Button>
          </div>
        </div>

        <div>
          <h4 className="font-medium mb-3 text-slate-700">Histórico de Simulações</h4>
          <div className="space-y-3">
            {simulations.map(sim => (
              <div key={sim.id} className="p-3 border border-slate-200 rounded text-sm bg-slate-50">
                <div className="flex justify-between font-bold mb-1">
                  <span>{sim.scenario}</span>
                  {sim.id && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">Ativa</span>}
                </div>
                <div className="text-slate-600 flex justify-between">
                  <span>Base Cálculo (Mão de Obra):</span>
                  <span>R$ {(sim.gross_estimated_amount || 0).toLocaleString('pt-BR')}</span>
                </div>
                <div className="text-slate-600 flex justify-between">
                  <span>INSS Estimado:</span>
                  <span className="font-medium text-red-600">R$ {(sim.net_estimated_amount || 0).toLocaleString('pt-BR')}</span>
                </div>
              </div>
            ))}
            {simulations.length === 0 && (
              <div className="text-sm text-slate-500 text-center py-4">Nenhuma simulação realizada.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
