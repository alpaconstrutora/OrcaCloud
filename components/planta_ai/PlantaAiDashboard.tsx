import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { PlantStudy } from '../../types/plantaAi';
import PlantaAiStudyDetail from './PlantaAiStudyDetail';
import { Plus } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useStore } from '../../store/useStore';

export default function PlantaAiDashboard() {
  const { activeOrganizationId } = useStore();
  const [studies, setStudies] = useState<PlantStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null);

  useEffect(() => {
    fetchStudies();
    
    // Check URL for deep link
    const hash = window.location.hash;
    if (hash.includes('?')) {
      const queryString = hash.split('?')[1];
      const params = new URLSearchParams(queryString);
      const studyIdParam = params.get('studyId');
      if (studyIdParam) {
        setSelectedStudyId(studyIdParam);
      }
    }
  }, []);

  async function fetchStudies() {
    setLoading(true);
    const { data, error } = await supabase
      .from('plant_studies')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) {
      setStudies(data as PlantStudy[]);
    } else if (error) {
      console.error('Error fetching plant studies:', error);
    }
    setLoading(false);
  }

  async function createNewStudy() {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      alert("Usuário não autenticado.");
      return;
    }
    if (!activeOrganizationId) {
      alert("Nenhuma organização ativa selecionada.");
      return;
    }
    
    const { data, error } = await supabase
      .from('plant_studies')
      .insert({
        organization_id: activeOrganizationId,
        name: 'Novo Estudo ' + new Date().toLocaleDateString(),
        status: 'Rascunho'
      })
      .select()
      .single();
      
    if (error) {
      console.error('Error creating plant study:', error);
      alert('Erro ao criar estudo: ' + error.message);
      return;
    }
      
    if (data) {
      setStudies([data as PlantStudy, ...studies]);
      setSelectedStudyId(data.id);
    }
  }

  async function deleteStudy(id: string) {
    if (!confirm('Tem certeza que deseja excluir este estudo? Isso o desvinculará da Viabilidade e do Comercial (se existir).')) return;
    
    const { error } = await supabase.from('plant_studies').delete().eq('id', id);
    if (error) {
      alert('Erro ao excluir: ' + error.message);
    } else {
      setStudies(studies.filter(s => s.id !== id));
    }
  }

  if (selectedStudyId) {
    return (
      <PlantaAiStudyDetail 
        studyId={selectedStudyId} 
        onBack={() => {
          setSelectedStudyId(null);
          fetchStudies();
        }} 
      />
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estudos de Viabilidade (ÒPURA Planta AI)</h1>
          <p className="text-sm text-gray-500">Gerador inteligente de implantação e quadro de áreas.</p>
        </div>
        <button 
          onClick={createNewStudy}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          <Plus className="w-5 h-5" />
          Novo Estudo
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {studies.map((study) => (
            <li key={study.id}>
              <div className="px-4 py-4 sm:px-6 hover:bg-gray-50 flex justify-between items-center">
                {/* min-w-0: sem isso o truncate do <p> não tem contra o que truncar —
                    o wrapper (item flex da linha) recusa encolher abaixo do texto
                    inteiro e empurra os botões de ação para fora do card. */}
                <div className="flex flex-col min-w-0">
                  <p className="text-sm font-medium text-indigo-600 truncate">{study.name}</p>
                  <p className="text-xs text-gray-500">{study.city} {study.state ? `- ${study.state}` : ''}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    study.status === 'Cenário selecionado' ? 'bg-green-100 text-green-800' :
                    study.status === 'Rascunho' ? 'bg-gray-100 text-gray-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {study.status}
                  </span>
                  <ActionIconButton kind="view" title="Ver Estudo" onClick={() => setSelectedStudyId(study.id)} />
                  <ActionIconButton
                    kind="delete"
                    title="Excluir Estudo"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteStudy(study.id);
                    }}
                  />
                </div>
              </div>
            </li>
          ))}
          {studies.length === 0 && !loading && (
            <li className="px-4 py-8 text-center text-gray-500">Nenhum estudo encontrado.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
