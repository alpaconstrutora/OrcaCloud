import { supabase } from '../lib/supabase';
import { PlantScenario, PlantStudy } from '../types/plantaAi';
import { commercialService } from './commercialService';
import { PropertyStatus } from '../types/imovib';

export class PlantaAiIntegration {
  /**
   * Envia ou Atualiza o cenário selecionado no módulo de Viabilidade (Imovib).
   * Fase 1: Sandbox Iterativo (Loop Planta AI <-> Viabilidade)
   */
  static async sendToViabilidade(studyId: string, scenarioId: string): Promise<{ success: boolean; imovibStudyId?: string; error?: string }> {
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

      // 3. Verifica se já existe um estudo de viabilidade vinculado
      const { data: existingImovib } = await supabase
        .from('imovib_studies')
        .select('id')
        .eq('planta_ai_study_id', studyId)
        .maybeSingle();

      let imovibStudyId = existingImovib?.id;
      const salesPriceSqm = scenario.total_private_area > 0 ? scenario.estimated_vgv / scenario.total_private_area : 0;
      const costPriceSqm = scenario.total_built_area > 0 ? scenario.estimated_cost / scenario.total_built_area : 0;

      if (imovibStudyId) {
        // UPDATE (Iteração rápida)
        const { error: updateErr } = await supabase
          .from('imovib_studies')
          .update({
            capex_simplified_area_sqm: scenario.total_built_area,
            capex_simplified_cost_sqm: costPriceSqm
          })
          .eq('id', imovibStudyId);
        
        if (updateErr) throw new Error(`Erro ao atualizar viabilidade: ${updateErr.message}`);

        // Deleta os blocos antigos para recriar com a nova volumetria
        await supabase.from('imovib_blocks').delete().eq('study_id', imovibStudyId);
      } else {
        // INSERT (Primeira vez)
        const { data: newImovib, error: insertErr } = await supabase
          .from('imovib_studies')
          .insert({
            organization_id: study.organization_id,
            name: `${study.name} - Viabilidade`,
            planta_ai_study_id: studyId,
            version: '1.0.0',
            terreno_area: terrain ? terrain.area : null,
            phase: 'Estudo Preliminar',
            capex_mode: 'simplified',
            capex_simplified_area_sqm: scenario.total_built_area,
            capex_simplified_cost_sqm: costPriceSqm
          })
          .select()
          .single();
          
        if (insertErr) throw new Error(`Erro ao criar estudo imovib: ${insertErr.message}`);
        imovibStudyId = newImovib.id;
      }

      // Recria o Bloco e Tipologia de Unidade para preencher o VGV e Custos detalhados
      const { data: block, error: blockErr } = await supabase
        .from('imovib_blocks')
        .insert({
          study_id: imovibStudyId,
          name: 'Bloco Único (Planta AI)',
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

      // Atualiza o status do estudo original
      await supabase
        .from('plant_studies')
        .update({ 
          status: 'Enviado para viabilidade', 
          selected_scenario_id: scenarioId 
        })
        .eq('id', studyId);

      return { success: true, imovibStudyId };

    } catch (error: any) {
      console.error('Erro na integração com viabilidade:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Fase 2: Lançamento do Produto Final
   * Gera o Prédio Físico no Módulo Comercial com todas as unidades exatas e cria a Oportunidade.
   */
  static async publishToCommercialInventory(studyId: string, scenarioId: string): Promise<{ success: boolean; propertyId?: string; opportunityId?: string; error?: string }> {
    try {
      const { data: study } = await supabase.from('plant_studies').select('*').eq('id', studyId).single();
      const { data: scenario } = await supabase.from('plant_scenarios').select('*').eq('id', scenarioId).single();
      
      if (!study || !scenario) throw new Error('Estudo ou Cenário não encontrado');

      // 1. Cria o Empreendimento (BUILDING) no Módulo Comercial
      const buildingData = {
        organization_id: study.organization_id,
        name: study.name,
        type: 'BUILDING',
        purpose: 'SALE',
        address: study.address || `${study.neighborhood || ''}, ${study.city || ''} - ${study.state || ''}`,
        city: study.city,
        state: study.state,
        neighborhood: study.neighborhood,
        area: scenario.total_built_area,
        total_area: scenario.total_built_area,
        status: PropertyStatus.STUDY,
        planta_ai_study_id: studyId,
        price: scenario.estimated_vgv,
        initial_price: scenario.estimated_vgv
      };

      const savedBuilding = await commercialService.saveProperty(buildingData as any);
      if (!savedBuilding.id) throw new Error('Falha ao criar Empreendimento no Comercial');

      // 2. Cria as Unidades Individuais (APARTMENT) com numeração linear
      if (scenario.total_units && scenario.floors_count && scenario.units_per_floor) {
        const units = [];
        const unitPrice = scenario.estimated_vgv / scenario.total_units; // Divisão direta conforme solicitado
        const unitPrivArea = scenario.total_private_area / scenario.total_units;
        const unitCommArea = scenario.total_common_area / scenario.total_units;
        
        for (let f = 1; f <= scenario.floors_count; f++) {
            for (let u = 1; u <= scenario.units_per_floor; u++) {
                // Se exceder o total (caso a conta não seja exata), ignora
                if (units.length >= scenario.total_units) break;
                
                const unitNumber = (f * 100) + u;
                
                units.push({
                    organization_id: study.organization_id,
                    parent_id: savedBuilding.id,
                    name: `Apto ${unitNumber}`,
                    type: 'APARTMENT',
                    purpose: 'SALE',
                    address: buildingData.address,
                    floor: f,
                    number: String(unitNumber),
                    block: 'Torre Única',
                    private_area: unitPrivArea,
                    common_area: unitCommArea,
                    total_area: unitPrivArea + unitCommArea,
                    price: unitPrice,
                    initial_price: unitPrice,
                    status: PropertyStatus.STUDY,
                    planta_ai_study_id: studyId
                });
            }
        }

        if (units.length > 0) {
            await commercialService.savePropertiesBatch(units as any);
        }
      }

      // 3. Cria a Oportunidade de Investimento vinculada ao Prédio
      let imovibStudyId = null;
      const { data: imovibMatch } = await supabase.from('imovib_studies').select('id').eq('planta_ai_study_id', studyId).maybeSingle();
      if (imovibMatch) imovibStudyId = imovibMatch.id;

      const { data: opportunity, error: oppErr } = await supabase
        .from('investor_opportunities')
        .insert({
          organization_id: study.organization_id,
          project_id: study.project_id,
          imovib_study_id: imovibStudyId, // vincula a viabilidade (se existir)
          property_id: savedBuilding.id, // vincula ao prédio no Comercial
          title: `${study.name} - Captação`,
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

      if (oppErr) console.error("Erro ao criar oportunidade investidor", oppErr);

      // 4. Marca o estudo da Planta AI como Produto Final publicado
      await supabase
        .from('plant_studies')
        .update({ status: 'Cenário selecionado' }) // O cenário virou produto
        .eq('id', studyId);

      return { success: true, propertyId: savedBuilding.id, opportunityId: opportunity?.id };

    } catch (error: any) {
      console.error('Erro ao publicar no Comercial:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Fase 3: Caminho Reverso (Imovib -> Planta AI)
   * Cria um estudo de arquitetura a partir de um estudo de viabilidade puramente financeiro.
   */
  static async createPlantaAiFromImovib(imovibStudyId: string, orgId: string, studyName: string): Promise<{ success: boolean; plantaAiStudyId?: string; error?: string }> {
    try {
      // 1. Cria o estudo no Planta AI
      const { data: newPlantStudy, error: insertErr } = await supabase
        .from('plant_studies')
        .insert({
          organization_id: orgId,
          name: `${studyName} (Arquitetura)`,
          status: 'Rascunho'
        })
        .select()
        .single();
        
      if (insertErr || !newPlantStudy) throw new Error(`Erro ao criar estudo Planta AI: ${insertErr?.message}`);

      // 2. Vincula no IMOVIB
      const { error: updateErr } = await supabase
        .from('imovib_studies')
        .update({ planta_ai_study_id: newPlantStudy.id })
        .eq('id', imovibStudyId);
        
      if (updateErr) throw new Error(`Erro ao vincular Planta AI ao Imovib: ${updateErr.message}`);

      return { success: true, plantaAiStudyId: newPlantStudy.id };

    } catch (error: any) {
      console.error('Erro ao criar Planta AI a partir do Imovib:', error);
      return { success: false, error: error.message };
    }
  }
}
