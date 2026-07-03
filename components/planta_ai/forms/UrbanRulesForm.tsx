import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { PlantUrbanRuleset } from '../../../types/plantaAi';

interface Props {
  studyId: string;
}

export default function UrbanRulesForm({ studyId }: Props) {
  const [rules, setRules] = useState<Partial<PlantUrbanRuleset>>({
    study_id: studyId,
    allowed_use: 'Residencial Multifamiliar',
    occupancy_rate: 50,
    floor_area_ratio_basic: 1.0,
    floor_area_ratio_max: 2.0,
    permeability_rate: 20,
    front_setback: 5,
    left_setback: 1.5,
    right_setback: 1.5,
    rear_setback: 3,
    max_floors: 10,
    confidence_level: 'Médio'
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchData();
  }, [studyId]);

  async function fetchData() {
    const { data } = await supabase.from('plant_urban_rulesets').select('*').eq('study_id', studyId).single();
    if (data) setRules(data as PlantUrbanRuleset);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    
    const payload = { ...rules, study_id: studyId };

    if (rules.id) {
      await supabase.from('plant_urban_rulesets').update(payload).eq('id', rules.id);
    } else {
      const { data } = await supabase.from('plant_urban_rulesets').insert(payload).select().single();
      if (data) setRules(data);
    }
    
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
      <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
        
        {/* Usos e Zonas */}
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Zona Urbanística</label>
          <div className="mt-1">
            <input
              type="text"
              value={rules.zone_name || ''}
              onChange={e => setRules({ ...rules, zone_name: e.target.value })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Uso Permitido</label>
          <div className="mt-1">
            <select
              value={rules.allowed_use}
              onChange={e => setRules({ ...rules, allowed_use: e.target.value })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            >
              <option>Residencial Multifamiliar</option>
              <option>Comercial / Serviços</option>
              <option>Uso Misto</option>
            </select>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Confiabilidade do Dado</label>
          <div className="mt-1">
            <select
              value={rules.confidence_level}
              onChange={e => setRules({ ...rules, confidence_level: e.target.value as any })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            >
              <option>Baixo</option>
              <option>Médio</option>
              <option>Alto</option>
              <option>Validado por profissional</option>
              <option>Validado na prefeitura</option>
            </select>
          </div>
        </div>

        {/* Índices Urbanísticos Básicos */}
        <div className="sm:col-span-6"><h3 className="text-lg font-medium text-gray-900 border-b pb-2">Índices Construtivos</h3></div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Taxa de Ocupação (%)</label>
          <div className="mt-1">
            <input
              type="number" step="0.1"
              value={rules.occupancy_rate || ''}
              onChange={e => setRules({ ...rules, occupancy_rate: parseFloat(e.target.value) })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">CA Básico</label>
          <div className="mt-1">
            <input
              type="number" step="0.1"
              value={rules.floor_area_ratio_basic || ''}
              onChange={e => setRules({ ...rules, floor_area_ratio_basic: parseFloat(e.target.value) })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">CA Máximo</label>
          <div className="mt-1">
            <input
              type="number" step="0.1"
              value={rules.floor_area_ratio_max || ''}
              onChange={e => setRules({ ...rules, floor_area_ratio_max: parseFloat(e.target.value) })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        {/* Recuos e Limites */}
        <div className="sm:col-span-6"><h3 className="text-lg font-medium text-gray-900 border-b pb-2 mt-4">Recuos e Gabarito (em metros)</h3></div>

        <div className="sm:col-span-3 lg:col-span-1">
          <label className="block text-sm font-medium text-gray-700">Frontal</label>
          <div className="mt-1">
            <input
              type="number" step="0.1"
              value={rules.front_setback || ''}
              onChange={e => setRules({ ...rules, front_setback: parseFloat(e.target.value) })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-3 lg:col-span-1">
          <label className="block text-sm font-medium text-gray-700">Lateral Esq.</label>
          <div className="mt-1">
            <input
              type="number" step="0.1"
              value={rules.left_setback || ''}
              onChange={e => setRules({ ...rules, left_setback: parseFloat(e.target.value) })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-3 lg:col-span-1">
          <label className="block text-sm font-medium text-gray-700">Lateral Dir.</label>
          <div className="mt-1">
            <input
              type="number" step="0.1"
              value={rules.right_setback || ''}
              onChange={e => setRules({ ...rules, right_setback: parseFloat(e.target.value) })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-3 lg:col-span-1">
          <label className="block text-sm font-medium text-gray-700">Fundos</label>
          <div className="mt-1">
            <input
              type="number" step="0.1"
              value={rules.rear_setback || ''}
              onChange={e => setRules({ ...rules, rear_setback: parseFloat(e.target.value) })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-3 lg:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Max. Pavimentos</label>
          <div className="mt-1">
            <input
              type="number"
              value={rules.max_floors || ''}
              onChange={e => setRules({ ...rules, max_floors: parseInt(e.target.value) })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>
        
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        {saved && <span className="text-sm text-green-600 self-center">Salvo com sucesso!</span>}
        <button
          type="submit"
          disabled={loading}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
        >
          {loading ? 'Salvando...' : 'Salvar Regras'}
        </button>
      </div>
    </form>
  );
}
