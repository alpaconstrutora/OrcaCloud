import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { PlantBriefing } from '../../../types/plantaAi';

interface Props {
  studyId: string;
}

export default function BriefingForm({ studyId }: Props) {
  const [briefing, setBriefing] = useState<Partial<PlantBriefing>>({
    study_id: studyId,
    development_type: 'Residencial Vertical',
    product_standard: 'Médio',
    main_objective: 'Equilibrar resultado',
    target_unit_area_min: 45,
    target_unit_area_max: 65,
    desired_units_per_floor: 4,
    desired_floors: 10,
    has_elevator: 'Sim',
    has_balcony: 'Sim',
    has_suite: 'Sim'
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchData();
  }, [studyId]);

  async function fetchData() {
    const { data } = await supabase.from('plant_briefings').select('*').eq('study_id', studyId).single();
    if (data) setBriefing(data as PlantBriefing);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    
    const payload = { ...briefing, study_id: studyId };

    if (briefing.id) {
      await supabase.from('plant_briefings').update(payload).eq('id', briefing.id);
    } else {
      const { data } = await supabase.from('plant_briefings').insert(payload).select().single();
      if (data) setBriefing(data);
    }
    
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
      <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
        
        {/* Estratégia e Produto */}
        <div className="sm:col-span-6"><h3 className="text-lg font-medium text-gray-900 border-b pb-2">Estratégia e Padrão</h3></div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Tipo de Empreendimento</label>
          <div className="mt-1">
            <select
              value={briefing.development_type}
              onChange={e => setBriefing({ ...briefing, development_type: e.target.value })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            >
              <option>Residencial Vertical</option>
            </select>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Padrão do Produto</label>
          <div className="mt-1">
            <select
              value={briefing.product_standard}
              onChange={e => setBriefing({ ...briefing, product_standard: e.target.value as any })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            >
              <option>Econômico</option>
              <option>Médio</option>
              <option>Alto</option>
              <option>Premium</option>
            </select>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Objetivo Principal</label>
          <div className="mt-1">
            <select
              value={briefing.main_objective}
              onChange={e => setBriefing({ ...briefing, main_objective: e.target.value as any })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            >
              <option>Maximizar VGV</option>
              <option>Maximizar número de unidades</option>
              <option>Maximizar área privativa</option>
              <option>Maximizar liquidez</option>
              <option>Reduzir custo</option>
              <option>Equilibrar resultado</option>
            </select>
          </div>
        </div>

        {/* Premissas Arquitetônicas */}
        <div className="sm:col-span-6"><h3 className="text-lg font-medium text-gray-900 border-b pb-2 mt-4">Premissas Arquitetônicas</h3></div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Unidades p/ Andar (Desejado)</label>
          <div className="mt-1">
            <input
              type="number"
              value={briefing.desired_units_per_floor || ''}
              onChange={e => setBriefing({ ...briefing, desired_units_per_floor: parseInt(e.target.value) })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Área Priv. Mínima (m²)</label>
          <div className="mt-1">
            <input
              type="number" step="0.1"
              value={briefing.target_unit_area_min || ''}
              onChange={e => setBriefing({ ...briefing, target_unit_area_min: parseFloat(e.target.value) })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Área Priv. Máxima (m²)</label>
          <div className="mt-1">
            <input
              type="number" step="0.1"
              value={briefing.target_unit_area_max || ''}
              onChange={e => setBriefing({ ...briefing, target_unit_area_max: parseFloat(e.target.value) })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Terá Elevador?</label>
          <div className="mt-1">
            <select
              value={briefing.has_elevator}
              onChange={e => setBriefing({ ...briefing, has_elevator: e.target.value })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            >
              <option>Sim</option>
              <option>Não</option>
              <option>Opcional</option>
            </select>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Terá Varanda?</label>
          <div className="mt-1">
            <select
              value={briefing.has_balcony}
              onChange={e => setBriefing({ ...briefing, has_balcony: e.target.value })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            >
              <option>Sim</option>
              <option>Não</option>
              <option>Opcional</option>
            </select>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Terá Suíte?</label>
          <div className="mt-1">
            <select
              value={briefing.has_suite}
              onChange={e => setBriefing({ ...briefing, has_suite: e.target.value })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            >
              <option>Sim</option>
              <option>Não</option>
              <option>Opcional</option>
            </select>
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
          {loading ? 'Salvando...' : 'Salvar Briefing'}
        </button>
      </div>
    </form>
  );
}
