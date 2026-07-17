import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { PlantStudy, PlantScenario } from '../../types/plantaAi';
import { ArrowLeft, Building2, ArrowRight, Link2Off } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { PlantaAiEngine } from '../../services/plantaAiEngine';
import { PlantaAiIntegration } from '../../services/plantaAiIntegration';
import { plantaAiMaterializeService } from '../../services/plantaAiMaterializeService';
import { PlantBriefing } from '../../types/plantaAi';
import { useConfirm } from '../ui/confirm';
import TerrainForm from './forms/TerrainForm';
import UrbanRulesForm from './forms/UrbanRulesForm';
import BriefingForm from './forms/BriefingForm';
import ScenarioVisualizer2D from './ScenarioVisualizer2D';
import FloorViewerTab from './FloorViewerTab';
import View3DTab from './View3DTab';
import PlantaUnidadesTab from './PlantaUnidadesTab';
import { PlantTerrain, PlantUrbanRuleset } from '../../types/plantaAi';

interface Props {
  studyId: string;
  onBack: () => void;
}

export default function PlantaAiStudyDetail({ studyId, onBack }: Props) {
  const [activeTab, setActiveTab] = useState<'Terreno' | 'Regras' | 'Briefing' | 'Cenários' | 'Unidades' | 'Plantas' | '3D'>('Terreno');
  const [study, setStudy] = useState<PlantStudy | null>(null);
  const [scenarios, setScenarios] = useState<PlantScenario[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedScenarioForView, setSelectedScenarioForView] = useState<PlantScenario | null>(null);
  const [terrain, setTerrain] = useState<PlantTerrain | null>(null);
  const [rules, setRules] = useState<PlantUrbanRuleset | null>(null);
  const [briefing, setBriefing] = useState<PlantBriefing | null>(null);
  const [materializingId, setMaterializingId] = useState<string | null>(null);
  // Empreendimento que aponta para este estudo. O vínculo é gravado do lado do
  // Empreendimento (empreendimentos.planta_ai_study_id), então aqui é leitura reversa.
  const [linkedEmp, setLinkedEmp] = useState<{ id: string; name: string } | null>(null);
  const confirm = useConfirm();
  const setActiveView = useStore(s => s.setActiveView);

  useEffect(() => {
    fetchStudy();
    fetchScenarios();
    fetchContext();
    fetchLinkedEmpreendimento();
  }, [studyId]);

  async function fetchLinkedEmpreendimento() {
    const { data } = await supabase
      .from('empreendimentos')
      .select('id, name')
      .eq('planta_ai_study_id', studyId)
      .maybeSingle();
    setLinkedEmp(data ?? null);
  }

  async function fetchContext() {
    const { data: tData } = await supabase.from('plant_terrains').select('*').eq('study_id', studyId).single();
    if (tData) setTerrain(tData as PlantTerrain);
    const { data: rData } = await supabase.from('plant_urban_rulesets').select('*').eq('study_id', studyId).single();
    if (rData) setRules(rData as PlantUrbanRuleset);
    const { data: bData } = await supabase.from('plant_briefings').select('*').eq('study_id', studyId).maybeSingle();
    if (bData) setBriefing(bData as PlantBriefing);
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

  /**
   * Marca o cenário como o escolhido do estudo. Até então isso só acontecia como efeito
   * colateral de "Testar Viabilidade" (sendToViabilidade), o que obrigava a passar pelo Imovib
   * para poder levar um cenário ao Empreendimento — justamente o acoplamento que a ponte direta
   * elimina. (O booleano plant_scenarios.selected existe na tabela mas nada no app o escreve;
   * a escolha vive em plant_studies.selected_scenario_id.)
   */
  async function chooseScenario(scenarioId: string) {
    const { error } = await supabase
      .from('plant_studies')
      .update({ selected_scenario_id: scenarioId, status: 'Cenário selecionado' })
      .eq('id', studyId);
    if (error) { alert('Erro ao escolher cenário: ' + error.message); return; }
    fetchStudy();
  }

  /**
   * Persiste plant_floors/plant_units a partir da geometria do cenário. É o pré-requisito da
   * ponte com o módulo Empreendimentos: sem unidades materializadas não há o que espelhar
   * (a grade do 2D/3D só existia em memória).
   */
  async function materialize(scenario: PlantScenario) {
    if (!terrain || !rules) {
      alert('Preencha Terreno e Regras antes de materializar as unidades.');
      return;
    }
    setMaterializingId(scenario.id);
    try {
      const r = await plantaAiMaterializeService.materializeScenario(scenario, terrain, rules, briefing);
      const parts = [
        `${r.floorsCreated + r.floorsUpdated} pavimento(s)`,
        `${r.unitsCreated + r.unitsUpdated} unidade(s)`,
      ];
      if (r.unitsRemoved || r.floorsRemoved) parts.push(`${r.unitsRemoved} unidade(s) e ${r.floorsRemoved} pavimento(s) obsoletos removidos`);
      alert(`Materializado: ${parts.join(', ')}.` + (r.warnings.length ? `\n\n${r.warnings.join('\n')}` : ''));
      fetchScenarios();
    } catch (err: any) {
      alert('Erro ao materializar: ' + err.message);
    } finally {
      setMaterializingId(null);
    }
  }

  async function publishToCommercial(scenarioId: string) {
    const ok = await confirm({
      title: 'Publicar no Comercial?',
      message: 'Isso criará o prédio e todas as unidades no módulo Comercial (Venda de Ativos), além da oportunidade de investimento.',
      confirmLabel: 'Publicar',
      variant: 'warning',
    });
    if (!ok) return;


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

      {/* Ponte com Empreendimentos. As duas direções do sync vivem no Centro de Sincronização
          do Empreendimento (é lá que mora o dado real), então aqui a tela precisa pelo menos
          dizer que a ponte existe e como chegar — sem isso o fluxo inverso fica invisível para
          quem está no Planta IA. */}
      {linkedEmp ? (
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-blue-50/60 border border-blue-100 rounded-[10px] px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="p-1.5 bg-white text-blue-600 rounded-[6px] border border-blue-100 shrink-0">
              <Building2 className="w-4 h-4" />
            </span>
            <p className="text-sm text-gray-600 truncate">
              Vinculado ao empreendimento <strong className="text-gray-900">{linkedEmp.name}</strong>
            </p>
          </div>
          <button
            onClick={() => setActiveView('empreendimentos')}
            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
            title="Sincronizar o cenário com as torres/unidades, ou enviar o realizado de volta ao cenário"
          >
            Abrir sincronização <ArrowRight className="w-[15px] h-[15px]" />
          </button>
        </div>
      ) : (
        <div className="mb-6 flex items-start gap-2.5 bg-gray-50 border border-dashed border-gray-200 rounded-[10px] px-4 py-3">
          <Link2Off className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
          <p className="text-sm text-gray-500 leading-relaxed">
            Nenhum empreendimento vinculado a este estudo. Para levar o cenário escolhido às torres
            e unidades — e trazer o realizado de volta —, abra <strong className="text-gray-600">Comercial → Empreendimentos</strong>,
            edite o empreendimento e selecione este estudo em <strong className="text-gray-600">Estudo de Arquitetura (Planta IA)</strong>.
          </p>
        </div>
      )}

      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {['Terreno', 'Regras', 'Briefing', 'Cenários', 'Unidades', 'Plantas', '3D'].map((tab) => (
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
                        {/* Escolher = define plant_studies.selected_scenario_id, que é o que a
                            ponte com Empreendimentos lê para saber qual cenário virou torre. */}
                        {sc.id === study.selected_scenario_id ? (
                          <span className="w-full mt-2 py-1.5 text-sm text-center text-green-700 bg-green-100 font-medium rounded">
                            ✓ Cenário escolhido
                          </span>
                        ) : (
                          <button
                            onClick={() => chooseScenario(sc.id)}
                            className="w-full mt-2 py-1.5 text-sm bg-white text-gray-700 border border-gray-300 font-medium rounded hover:bg-gray-50 transition-colors"
                            title="Definir como o cenário escolhido deste estudo"
                          >
                            Escolher este cenário
                          </button>
                        )}
                        {/* Materializar = persistir plant_floors/plant_units a partir da grade
                            do 2D/3D. Pré-requisito do sync com o módulo Empreendimentos. */}
                        <button
                          onClick={() => materialize(sc)}
                          disabled={materializingId === sc.id}
                          className="w-full mt-2 py-1.5 text-sm bg-indigo-600 text-white font-medium rounded hover:bg-indigo-700 disabled:bg-gray-400 transition-colors"
                          title="Persistir os pavimentos e unidades deste cenário para uso no módulo Empreendimentos"
                        >
                          {materializingId === sc.id ? 'Materializando...' : sc.materialized_at ? 'Rematerializar unidades' : 'Materializar unidades'}
                        </button>
                        {sc.materialized_at && (
                          <p className="text-[10px] text-gray-400 text-center -mt-1">
                            Materializado em {new Date(sc.materialized_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                          </p>
                        )}
                        <button
                          onClick={() => publishToCommercial(sc.id)}
                          className="w-full py-1.5 text-sm bg-green-600 text-white font-medium rounded hover:bg-green-700 transition-colors"
                          title="Gerar Prédio e Unidades no Módulo Comercial (Venda de Ativos)"
                        >
                          Publicar no Comercial
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'Unidades' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <PlantaUnidadesTab scenarios={scenarios} selectedScenarioId={study?.selected_scenario_id} />
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

        {activeTab === '3D' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full">
            <View3DTab
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
