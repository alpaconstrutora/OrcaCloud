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

      // 3. Busca regras urbanísticas e briefing
      const { data: ruleset } = await supabase.from('plant_urban_rulesets').select('*').eq('study_id', studyId).maybeSingle();
      const { data: briefing } = await supabase.from('plant_briefings').select('*').eq('study_id', studyId).maybeSingle();

      // 4. Verifica se já existe um estudo de viabilidade vinculado
      const { data: existingImovib } = await supabase
        .from('imovib_studies')
        .select('id')
        .eq('planta_ai_study_id', studyId)
        .maybeSingle();

      let imovibStudyId = existingImovib?.id;
      const salesPriceSqm = scenario.total_private_area > 0 ? scenario.estimated_vgv / scenario.total_private_area : 0;
      const costPriceSqm = scenario.total_built_area > 0 ? scenario.estimated_cost / scenario.total_built_area : 0;

      const imovibSyncData = {
        terreno_area: terrain?.area || 0,
        terreno_frente: terrain?.frontage || 0,
        terreno_fundos: terrain?.depth || 0,
        land_frontage: terrain?.frontage || 0,
        location_macro: study.city ? `${study.city} - ${study.state || ''}` : '',
        location_micro: study.neighborhood || study.address || '',
        ca_basic: ruleset?.floor_area_ratio_basic || 0,
        ca_max: ruleset?.floor_area_ratio_max || 0,
        occupancy_rate_max: ruleset?.occupancy_rate || 0,
        occupancy_rate: ruleset?.occupancy_rate || 0,
        zoning: ruleset?.zone_name || '',
        zoning_info: ruleset?.allowed_use || '',
        segment: briefing?.development_type || '',
        sub_classification: briefing?.product_standard || '',
        capex_simplified_area_sqm: scenario.total_built_area || 0,
        capex_simplified_cost_sqm: costPriceSqm
      };

      if (imovibStudyId) {
        // UPDATE (Iteração rápida)
        const { error: updateErr } = await supabase
          .from('imovib_studies')
          .update(imovibSyncData)
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
            phase: 'Estudo Preliminar',
            capex_mode: 'simplified',
            ...imovibSyncData
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
      // 1. Busca os dados completos do IMOVIB
      const { data: imovib, error: imovibErr } = await supabase
        .from('imovib_studies')
        .select('*')
        .eq('id', imovibStudyId)
        .single();
        
      if (imovibErr || !imovib) throw new Error(`Estudo Imovib não encontrado: ${imovibErr?.message}`);

      // Busca a zona urbanística se existir
      const { data: zone } = await supabase
        .from('imovib_regulatory_zones')
        .select('*')
        .eq('study_id', imovibStudyId)
        .maybeSingle();

      // 2. Cria o estudo no Planta AI mapeando cidade e endereço
      const { data: newPlantStudy, error: insertErr } = await supabase
        .from('plant_studies')
        .insert({
          organization_id: orgId,
          name: `${studyName} (Arquitetura)`,
          status: 'Rascunho',
          city: imovib.location_macro,
          state: imovib.location_macro, // Simplificação se o macro tiver a cidade/estado
          neighborhood: imovib.location_micro,
          address: imovib.location_micro
        })
        .select()
        .single();
        
      if (insertErr || !newPlantStudy) throw new Error(`Erro ao criar estudo Planta AI: ${insertErr?.message}`);

      // 3. Cria o Terreno
      await supabase.from('plant_terrains').insert({
        study_id: newPlantStudy.id,
        terrain_type: 'Plano',
        area: imovib.terreno_area || 0,
        frontage: imovib.terreno_frente || imovib.land_frontage || 0,
        depth: Math.max(imovib.terreno_lateral_direita || 0, imovib.terreno_lateral_esquerda || 0) || imovib.terreno_fundos || 0,
        is_corner: false,
        slope_type: 'Plano'
      });

      // 4. Cria as Regras Urbanísticas
      await supabase.from('plant_urban_rulesets').insert({
        study_id: newPlantStudy.id,
        allowed_use: imovib.zoning_info || 'Residencial',
        zone_name: imovib.zoning,
        occupancy_rate: imovib.occupancy_rate_max || imovib.occupancy_rate || 0,
        floor_area_ratio_basic: imovib.ca_basic || 0,
        floor_area_ratio_max: imovib.ca_max || 0,
        permeability_rate: zone?.taxa_permeabilidade_minima ? parseFloat(zone.taxa_permeabilidade_minima) : 0,
        max_height: zone?.gabarito_altura_maxima ? parseFloat(zone.gabarito_altura_maxima) : 0,
        confidence_level: 'Baixo'
      });

      // 5. Cria o Briefing
      await supabase.from('plant_briefings').insert({
        study_id: newPlantStudy.id,
        development_type: imovib.segment || 'Residencial',
        product_standard: imovib.sub_classification || 'Médio',
        main_objective: 'Maximizar VGV',
        has_elevator: 'Sim',
        has_balcony: 'Sim',
        has_suite: 'Sim',
        notes: imovib.committee_notes || ''
      });

      // 6. Vincula no IMOVIB
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

  /**
   * Sincroniza dados atualizados do Imovib para o Planta AI existente.
   */
  static async updatePlantaAiFromImovib(imovibStudyId: string, plantaAiStudyId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: imovib, error: imovibErr } = await supabase
        .from('imovib_studies')
        .select('*')
        .eq('id', imovibStudyId)
        .single();
        
      if (imovibErr || !imovib) throw new Error(`Estudo Imovib não encontrado: ${imovibErr?.message}`);

      const { data: zone } = await supabase
        .from('imovib_regulatory_zones')
        .select('*')
        .eq('study_id', imovibStudyId)
        .maybeSingle();

      // Atualiza Terreno
      await supabase.from('plant_terrains')
        .update({
          area: imovib.terreno_area || 0,
          frontage: imovib.terreno_frente || imovib.land_frontage || 0,
          depth: Math.max(imovib.terreno_lateral_direita || 0, imovib.terreno_lateral_esquerda || 0) || imovib.terreno_fundos || 0,
        })
        .eq('study_id', plantaAiStudyId);

      // Atualiza Regras Urbanísticas
      await supabase.from('plant_urban_rulesets')
        .update({
          allowed_use: imovib.zoning_info || 'Residencial',
          zone_name: imovib.zoning,
          occupancy_rate: imovib.occupancy_rate_max || imovib.occupancy_rate || 0,
          floor_area_ratio_basic: imovib.ca_basic || 0,
          floor_area_ratio_max: imovib.ca_max || 0,
          permeability_rate: zone?.taxa_permeabilidade_minima ? parseFloat(zone.taxa_permeabilidade_minima) : 0,
          max_height: zone?.gabarito_altura_maxima ? parseFloat(zone.gabarito_altura_maxima) : 0,
        })
        .eq('study_id', plantaAiStudyId);

      // Atualiza Briefing
      await supabase.from('plant_briefings')
        .update({
          development_type: imovib.segment || 'Residencial',
          product_standard: imovib.sub_classification || 'Médio',
          notes: imovib.committee_notes || ''
        })
        .eq('study_id', plantaAiStudyId);

      return { success: true };
    } catch (error: any) {
      console.error('Erro ao atualizar Planta AI a partir do Imovib:', error);
      return { success: false, error: error.message };
    }
  }
}
