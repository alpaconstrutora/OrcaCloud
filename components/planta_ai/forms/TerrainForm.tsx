import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { PlantTerrain } from '../../../types/plantaAi';

interface Props {
  studyId: string;
}

export default function TerrainForm({ studyId }: Props) {
  const [terrain, setTerrain] = useState<Partial<PlantTerrain>>({
    study_id: studyId,
    terrain_type: 'Regular (Retangular)',
    area: 0,
    frontage: 0,
    depth: 0,
    is_corner: false,
    slope_type: 'Plano (até 5%)'
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchData();
  }, [studyId]);

  async function fetchData() {
    const { data } = await supabase.from('plant_terrains').select('*').eq('study_id', studyId).single();
    if (data) {
      setTerrain(data as PlantTerrain);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    
    // Auto-calcula área se testada e profundidade forem preenchidas (apenas para terreno regular)
    let finalArea = terrain.area;
    if (terrain.terrain_type === 'Regular (Retangular)' && terrain.frontage && terrain.depth && !finalArea) {
      finalArea = terrain.frontage * terrain.depth;
    }

    const payload = { ...terrain, area: finalArea, study_id: studyId };

    if (terrain.id) {
      await supabase.from('plant_terrains').update(payload).eq('id', terrain.id);
    } else {
      const { data } = await supabase.from('plant_terrains').insert(payload).select().single();
      if (data) setTerrain(data);
    }
    
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
      <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
        
        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-gray-700">Tipo de Terreno</label>
          <div className="mt-1">
            <select
              value={terrain.terrain_type}
              onChange={e => setTerrain({ ...terrain, terrain_type: e.target.value })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            >
              <option>Regular (Retangular)</option>
              <option>Irregular (Geometria complexa)</option>
            </select>
          </div>
        </div>

        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-gray-700">Área Total (m²)</label>
          <div className="mt-1">
            <input
              type="number" step="0.01"
              value={terrain.area || ''}
              onChange={e => setTerrain({ ...terrain, area: parseFloat(e.target.value) })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-gray-700">Testada (m) - Frente</label>
          <div className="mt-1">
            <input
              type="number" step="0.01"
              value={terrain.frontage || ''}
              onChange={e => setTerrain({ ...terrain, frontage: parseFloat(e.target.value) })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-gray-700">Profundidade (m)</label>
          <div className="mt-1">
            <input
              type="number" step="0.01"
              value={terrain.depth || ''}
              onChange={e => setTerrain({ ...terrain, depth: parseFloat(e.target.value) })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-gray-700">Topografia (Aclive/Declive)</label>
          <div className="mt-1">
            <select
              value={terrain.slope_type}
              onChange={e => setTerrain({ ...terrain, slope_type: e.target.value })}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            >
              <option>Plano (até 5%)</option>
              <option>Aclive suave (5% a 15%)</option>
              <option>Aclive acentuado (acima 15%)</option>
              <option>Declive suave (5% a 15%)</option>
              <option>Declive acentuado (acima 15%)</option>
            </select>
          </div>
        </div>

        <div className="sm:col-span-3 flex items-center pt-6">
          <input
            type="checkbox" id="is_corner"
            checked={terrain.is_corner || false}
            onChange={e => setTerrain({ ...terrain, is_corner: e.target.checked })}
            className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
          />
          <label htmlFor="is_corner" className="ml-2 block text-sm text-gray-900">
            Terreno de Esquina
          </label>
        </div>

      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        {saved && <span className="text-sm text-green-600 self-center">Salvo com sucesso!</span>}
        <button
          type="submit"
          disabled={loading}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
        >
          {loading ? 'Salvando...' : 'Salvar Terreno'}
        </button>
      </div>
    </form>
  );
}
