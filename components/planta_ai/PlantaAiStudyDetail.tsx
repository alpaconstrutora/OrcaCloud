import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { PlantStudy, PlantScenario } from '../../types/plantaAi';
import { ArrowLeft } from 'lucide-react';
import { PlantaAiEngine } from '../../services/plantaAiEngine';
import { PlantaAiIntegration } from '../../services/plantaAiIntegration';
import TerrainForm from './forms/TerrainForm';
import UrbanRulesForm from './forms/UrbanRulesForm';
import BriefingForm from './forms/BriefingForm';
import ScenarioVisualizer2D from './ScenarioVisualizer2D';
import FloorViewerTab from './FloorViewerTab';
import { PlantTerrain, PlantUrbanRuleset } from '../../types/plantaAi';

interface Props {
  studyId: string;
  onBack: () => void;
}

export default function PlantaAiStudyDetail({ studyId, onBack }: Props) {
  const [activeTab, setActiveTab] = useState<'Terreno' | 'Regras' | 'Briefing' | 'Cenários' | 'Plantas'>('Terreno');
  const [study, setStudy] = useState<PlantStudy | null>(null);
  const [scenarios, setScenarios] = useState<PlantScenario[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedScenarioForView, setSelectedScenarioForView] = useState<PlantScenario | null>(null);
  const [terrain, setTerrain] = useState<PlantTerrain | null>(null);
  const [rules, setRules] = useState<PlantUrbanRuleset | null>(null);

  useEffect(() => {
    fetchStudy();
    fetchScenarios();
    fetchContext();
  }, [studyId]);

  async function fetchContext() {
    const { data: tData } = await supabase.from('plant_terrains').select('*').eq('study_id', studyId).single();
    if (tData) setTerrain(tData as PlantTerrain);
    const { data: rData } = await supabase.from('plant_urban_rulesets').select('*').eq('study_id', studyId).single();
    if (rData) setRules(rData as PlantUrbanRuleset);
  }

  async function fetchStudy() {
    const { data } = await supabase.from('plant_studies').select('*').eq('id', studyId).single();
    if (data) setStudy(data as PlantStudy);
  }

  async function fetchScenarios() {
    const { data } = await supabase.from('plant_scenarios').select('*').eq('study_id', studyId);
    if (data) {
      const scenarioIds = data.map(s => s.id);
      const { data: vals } = await supabase.from('plant_validations').select('*').in('scenario_id', scenarioIds);
      
      const mapped = data.map(s => ({
        ...s,
        validations: vals?.filter(v => v.scenario_id === s.id) || []
      }));
      setScenarios(mapped as PlantScenario[]);
    }
  }

  async function generateScenarios() {
    setIsGenerating(true);
    // Busca dados para o motor
    const { data: terrain } = await supabase.from('plant_terrains').select('*').eq('study_id', studyId).single();
    const { data: rules } = await supabase.from('plant_urban_rulesets').select('*').eq('study_id', studyId).single();
    const { data: briefing } = await supabase.from('plant_briefings').select('*').eq('study_id', studyId).single();
    
    if (!terrain || !rules || !briefing) {
      alert("Preencha o terreno, regras e briefing antes de gerar os cenários.");
      setIsGenerating(false);
      return;
    }

    const generated = await PlantaAiEngine.generateScenarios(studyId, terrain, rules, briefing);
    
    const { data, error } = await supabase.from('plant_scenarios').insert(
      generated.map(g => {
        const { id, geometryData, validations, ...rest } = g as any;
        return rest;
      })
    ).select();

    if (error) {
      console.error('Erro detalhado:', error);
      alert("Erro ao salvar cenários: " + (error.message || JSON.stringify(error)));
    } else {
      // Insere validações associadas aos novos cenários gerados
      const validationsToInsert: any[] = [];
      (data as PlantScenario[]).forEach((insertedScenario, index) => {
        const original = generated[index] as any;
        if (original.validations && original.validations.length > 0) {
          original.validations.forEach((v: any) => {
            validationsToInsert.push({ ...v, scenario_id: insertedScenario.id });
          });
        }
      });

      if (validationsToInsert.length > 0) {
        const { error: valError } = await supabase.from('plant_validations').insert(validationsToInsert);
        if (valError) console.error("Erro ao salvar validações:", valError);
      }

      setScenarios(data as PlantScenario[]);
      setActiveTab('Cenários');
    }
    setIsGenerating(false);
  }

  async function sendToViabilidade(scenarioId: string) {
    const res = await PlantaAiIntegration.sendToViabilidade(studyId, scenarioId);
    if (res.success) {
      alert("Enviado com sucesso para Viabilidade!");
      fetchStudy();
      fetchScenarios();
    } else {
      alert("Erro: " + res.error);
    }
  }

  async function publishToCommercial(scenarioId: string) {
    if (!confirm("Isso criará o Empreendimento Final no Comercial com todas as unidades. Deseja continuar?")) return;
    
    const res = await PlantaAiIntegration.publishToCommercialInventory(studyId, scenarioId);
    
    if (res.success) {
      alert("Empreendimento Lançado com Sucesso no Módulo Comercial!");
      fetchStudy();
      fetchScenarios();
    } else {
      alert("Erro ao lançar: " + res.error);
    }
  }

  if (!study) return <div>Carregando...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{study.name}</h1>
          <p className="text-sm text-gray-500">Status: {study.status}</p>
        </div>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {['Terreno', 'Regras', 'Briefing', 'Cenários', 'Plantas'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`
                whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm
                ${activeTab === tab 
                  ? 'border-indigo-500 text-indigo-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      <div className="bg-white p-6 shadow sm:rounded-md min-h-[400px]">
        {activeTab === 'Terreno' && <TerrainForm studyId={studyId} />}
        {activeTab === 'Regras' && <UrbanRulesForm studyId={studyId} />}
        {activeTab === 'Briefing' && <BriefingForm studyId={studyId} />}
        
        {activeTab === 'Cenários' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">Cenários Gerados</h2>
              <button 
                onClick={generateScenarios}
                disabled={isGenerating}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400"
              >
                {isGenerating ? 'Gerando...' : 'Gerar / Atualizar Cenários'}
              </button>
            </div>
            
            {scenarios.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Nenhum cenário gerado ainda.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {scenarios.map(sc => {
                  let geometryData = undefined;
                  if (terrain && rules) {
                    geometryData = PlantaAiEngine.calculateEnvelope(terrain, rules).geometryData;
                  }
                  
                  return (
                    <div key={sc.id} className={`border rounded-lg overflow-hidden flex flex-col ${sc.id === study.selected_scenario_id ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                      <ScenarioVisualizer2D geometryData={geometryData} />
                      
                      <div className="p-4 flex-1">
                        <h3 className="font-bold text-gray-800">{sc.name}</h3>
                        <div className="mt-4 space-y-2 text-sm text-gray-600">
                          <p><strong>Unidades:</strong> {sc.total_units} ({sc.units_per_floor} p/andar)</p>
                          <p><strong>Andares:</strong> {sc.floors_count}</p>
                          <p><strong>Área Privativa:</strong> {Math.round(sc.total_private_area || 0)} m²</p>
                          <p><strong>VGV Est.:</strong> R$ {(sc.estimated_vgv || 0).toLocaleString('pt-BR')}</p>
                          <p><strong>Score:</strong> {sc.general_score}/100</p>
                        </div>

                        {sc.validations && sc.validations.length > 0 && (
                          <div className="mt-4 space-y-2">
                            {sc.validations.map((val: any) => (
                              <div key={val.id || val.title} className={`p-2 text-xs rounded border ${val.severity === 'Alta' || val.severity === 'Bloqueante' ? 'bg-red-50 border-red-200 text-red-700' : val.severity === 'Média' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                                <strong>{val.title}:</strong> {val.message}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex flex-col gap-2 mt-auto">
                        <div className="flex justify-between w-full">
                            <button 
                              onClick={() => {
                                setSelectedScenarioForView(sc);
                                setActiveTab('Plantas');
                              }}
                              className="text-sm text-indigo-600 font-medium hover:underline"
                            >
                              Ver Plantas
                            </button>
                            <button 
                              onClick={() => sendToViabilidade(sc.id)}
                              className="text-sm text-blue-600 font-medium hover:underline"
                              title="Atualizar dados no Módulo IMOVIB"
                            >
                              Testar Viabilidade
                            </button>
                        </div>
                        <button 
                          onClick={() => publishToCommercial(sc.id)}
                          className="w-full mt-2 py-1.5 text-sm bg-green-600 text-white font-medium rounded hover:bg-green-700 transition-colors"
                          title="Gerar Prédio e Unidades no Módulo Comercial"
                        >
                          Lançar Empreendimento
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'Plantas' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full">
            <FloorViewerTab
              scenario={selectedScenarioForView}
              terrain={terrain}
              rules={rules}
            />
          </div>
        )}
      </div>
    </div>
  );
}
