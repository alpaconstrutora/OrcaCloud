import { supabase } from '../lib/supabase';
import { PlantScenario, PlantStudy } from '../types/plantaAi';

export class PlantaAiIntegration {
  /**
   * Envia o cenário selecionado para o módulo de Viabilidade (Imovib / Opportunities)
   */
  static async sendToViabilidade(studyId: string, scenarioId: string): Promise<{ success: boolean; opportunityId?: string; error?: string }> {
    try {
      // 1. Busca os dados do Estudo e do Cenário
      const { data: study, error: studyErr } = await supabase
        .from('plant_studies')
        .select('*')
        .eq('id', studyId)
        .single();
        
      if (studyErr || !study) throw new Error('Estudo não encontrado');

      const { data: scenario, error: scenarioErr } = await supabase
        .from('plant_scenarios')
        .select('*')
        .eq('id', scenarioId)
        .single();
        
      if (scenarioErr || !scenario) throw new Error('Cenário não encontrado');

      // 2. Busca Terreno para ter a área
      const { data: terrain } = await supabase
        .from('plant_terrains')
        .select('*')
        .eq('study_id', studyId)
        .single();

      // 3. Cria o registro base em imovib_studies (Sistema de Registro de Viabilidade)
      const { data: imovibStudy, error: imovibErr } = await supabase
        .from('imovib_studies')
        .insert({
          organization_id: study.organization_id,
          name: `${study.name} - Viabilidade (${scenario.name})`,
          version: '1.0.0',
          terreno_area: terrain ? terrain.area : null,
          phase: 'Estudo Preliminar',
          capex_mode: 'simplified',
          capex_simplified_area_sqm: scenario.total_built_area,
          capex_simplified_cost_sqm: scenario.total_built_area > 0 ? scenario.estimated_cost / scenario.total_built_area : 0
        })
        .select()
        .single();

      if (imovibErr) throw new Error(`Erro ao criar estudo imovib: ${imovibErr.message}`);

      // 3.1 Cria um Bloco e Tipologia de Unidade para preencher o VGV e Custos detalhados
      const salesPriceSqm = scenario.total_private_area > 0 ? scenario.estimated_vgv / scenario.total_private_area : 0;
      const costPriceSqm = scenario.total_built_area > 0 ? scenario.estimated_cost / scenario.total_built_area : 0;

      const { data: block, error: blockErr } = await supabase
        .from('imovib_blocks')
        .insert({
          study_id: imovibStudy.id,
          name: 'Bloco Único',
          construction_cost_sqm: costPriceSqm,
          sales_price_sqm: salesPriceSqm
        })
        .select()
        .single();

      if (!blockErr && block) {
        const privAreaPerUnit = scenario.total_units > 0 ? scenario.total_private_area / scenario.total_units : 0;
        const commAreaPerUnit = scenario.total_units > 0 ? scenario.total_common_area / scenario.total_units : 0;
        
        await supabase.from('imovib_units').insert({
            block_id: block.id,
            name: 'Apartamento Padrão',
            quantity: scenario.total_units,
            private_area: privAreaPerUnit,
            common_area: commAreaPerUnit,
            pavimentos: scenario.floors_count,
            is_vendavel: true
        });
      }

      // 4. Cria a oportunidade de investimento vinculada
      const { data: opportunity, error: oppErr } = await supabase
        .from('investor_opportunities')
        .insert({
          organization_id: study.organization_id,
          project_id: study.project_id,
          imovib_study_id: imovibStudy.id,
          title: `${study.name} - Oportunidade de Incorporação`,
          status: 'estudo',
          opportunity_type: 'incorporacao',
          location_city: study.city,
          location_state: study.state,
          built_area_m2: scenario.total_built_area,
          floors: scenario.floors_count,
          vgv: scenario.estimated_vgv,
          cost_estimate: scenario.estimated_cost,
          is_published: false
        })
        .select()
        .single();

      if (oppErr) throw new Error(`Erro ao criar oportunidade: ${oppErr.message}`);

      // 5. Atualiza o status do estudo original
      await supabase
        .from('plant_studies')
        .update({ 
          status: 'Enviado para viabilidade', 
          selected_scenario_id: scenarioId 
        })
        .eq('id', studyId);

      return { success: true, opportunityId: opportunity.id };

    } catch (error: any) {
      console.error('Erro na integração com viabilidade:', error);
      return { success: false, error: error.message };
    }
  }
}
