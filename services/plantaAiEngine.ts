import { supabase } from '../lib/supabase';
import { PlantTerrain, PlantUrbanRuleset, PlantBriefing, PlantScenario, PlantFloor, PlantUnit, PlantValidation } from '../types/plantaAi';

export interface EnvelopeCalcResult {
  grossArea: number;
  maxOccupancyArea: number;
  areaAfterSetbacks: number;
  maxComputableArea: number;
  maxFloors: number;
  avgAreaPerFloor: number;
  geometryData: {
    terrainWidth: number;
    terrainDepth: number;
    buildingWidth: number;
    buildingDepth: number;
    frontSetback: number;
    leftSetback: number;
  };
}

export class PlantaAiEngine {
  /**
   * Calcula o envelope construtivo com base no terreno e regras urbanísticas
   */
  static calculateEnvelope(terrain: PlantTerrain, rules: PlantUrbanRuleset): EnvelopeCalcResult {
    const grossArea = terrain.area;
    const maxOccupancyArea = grossArea * ((rules.occupancy_rate || 100) / 100);
    
    const usefulFrontage = terrain.frontage - (rules.left_setback || 0) - (rules.right_setback || 0);
    const usefulDepth = terrain.depth - (rules.front_setback || 0) - (rules.rear_setback || 0);
    const areaAfterSetbacks = usefulFrontage > 0 && usefulDepth > 0 ? usefulFrontage * usefulDepth : 0;
    
    const maxComputableArea = grossArea * (rules.floor_area_ratio_max || rules.floor_area_ratio_basic || 1);
    
    // O número de pavimentos pode ser restrito pelo máximo da lei, 
    // ou pelo CA dividido pela área após recuos (ou área de ocupação)
    const effectiveFloorArea = Math.min(areaAfterSetbacks, maxOccupancyArea);
    
    let maxFloors = rules.max_floors || 999;
    if (effectiveFloorArea > 0) {
      const theoreticalFloors = Math.floor(maxComputableArea / effectiveFloorArea);
      if (theoreticalFloors < maxFloors) {
        maxFloors = theoreticalFloors;
      }
    }

    return {
      grossArea,
      maxOccupancyArea,
      areaAfterSetbacks,
      maxComputableArea,
      maxFloors,
      avgAreaPerFloor: effectiveFloorArea,
      geometryData: {
        terrainWidth: terrain.frontage,
        terrainDepth: terrain.depth,
        buildingWidth: usefulFrontage > 0 ? usefulFrontage : terrain.frontage * Math.sqrt((rules.occupancy_rate || 50)/100),
        buildingDepth: usefulDepth > 0 ? usefulDepth : terrain.depth * Math.sqrt((rules.occupancy_rate || 50)/100),
        frontSetback: rules.front_setback || 0,
        leftSetback: rules.left_setback || 0
      }
    };
  }

  /**
   * Recalcula a geometria de um cenário salvo no frontend.
   */
  static getScenarioGeometry(scenario: PlantScenario, terrain: PlantTerrain, rules: PlantUrbanRuleset) {
    const env = this.calculateEnvelope(terrain, rules);
    const floors = scenario.floors_count || 1;
    const footprint = (scenario.total_built_area || 0) / floors;
    const maxFootprint = (env.geometryData.buildingWidth || 1) * (env.geometryData.buildingDepth || 1);
    
    // Scale factor to reduce the building if the scenario uses less than 100% of the max footprint
    const scale = Math.sqrt(Math.min(1, footprint / maxFootprint));

    return {
      terrainWidth: env.geometryData.terrainWidth,
      terrainDepth: env.geometryData.terrainDepth,
      frontSetback: env.geometryData.frontSetback,
      leftSetback: env.geometryData.leftSetback,
      buildingWidth: Math.max(5, env.geometryData.buildingWidth * scale),
      buildingDepth: Math.max(5, env.geometryData.buildingDepth * scale),
    };
  }

  /**
   * Gera os cenários base (Conservador, Equilibrado, Máximo)
   */
  static async generateScenarios(
    studyId: string, 
    terrain: PlantTerrain, 
    rules: PlantUrbanRuleset, 
    briefing: PlantBriefing
  ): Promise<PlantScenario[]> {
    const envelope = this.calculateEnvelope(terrain, rules);
    
    const scenariosToGenerate = [
      { name: 'Cenário Conservador', type: 'Conservador', unitMultiplier: 0.8, areaMultiplier: 1.2 },
      { name: 'Cenário Equilibrado', type: 'Equilibrado', unitMultiplier: 1.0, areaMultiplier: 1.0 },
      { name: 'Cenário Máximo', type: 'Máximo aproveitamento', unitMultiplier: 1.3, areaMultiplier: 0.8 }
    ] as const;

    const baseUnitsPerFloor = briefing.desired_units_per_floor || 4;
    const targetArea = (briefing.target_unit_area_max || briefing.target_unit_area_min || 60);
    
    const generatedScenarios: (PlantScenario & { geometryData?: any })[] = [];

    for (const conf of scenariosToGenerate) {
      // Simulação paramétrica simplificada para o MVP
      const unitsPerFloor = Math.max(1, Math.round(baseUnitsPerFloor * conf.unitMultiplier));
      const avgUnitArea = targetArea * conf.areaMultiplier;
      
      const floorsCount = Math.max(1, Math.min(briefing.desired_floors || envelope.maxFloors, envelope.maxFloors));
      const totalUnits = unitsPerFloor * floorsCount;
      
      const totalPrivateArea = totalUnits * avgUnitArea;
      const commonAreaRatio = 0.2; // 20% de área comum
      const totalCommonArea = totalPrivateArea * commonAreaRatio;
      const totalBuiltArea = totalPrivateArea + totalCommonArea;

      // Restringir a área construída ao máximo computável + comum
      // Num caso real descontaríamos áreas não computáveis
      const adjustedBuiltArea = Math.min(totalBuiltArea, envelope.maxComputableArea * 1.2);
      
      // Atualizando métricas com base no envelope ajustado
      const adjustedPrivateArea = adjustedBuiltArea / (1 + commonAreaRatio);

      // Quantas unidades do tamanho-alvo cabem na área que o envelope permite.
      const unitsThatFit = Math.max(1, Math.floor(adjustedPrivateArea / avgUnitArea));

      // A GRADE é a verdade física do prédio: floorsCount andares × N unidades por andar.
      // O total tem que ser derivado dela, não calculado em paralelo — antes gravávamos
      // total_units=38 junto com 6 andares × 6 un/andar (=36), números que não fecham e que
      // nenhum prédio realiza (6,33 unidades por andar não existe). Quem consome isso depois
      // — planta 2D/3D, materialização, Empreendimento — precisa de um número só.
      // `floor` (não `round`): arredondar para cima estouraria o envelope construtivo.
      const actualUnitsPerFloor = Math.max(1, Math.floor(unitsThatFit / floorsCount));
      const actualUnits = actualUnitsPerFloor * floorsCount;
      // Áreas continuam vindo do envelope: a mesma metragem é fatiada entre menos unidades,
      // então cada uma fica um pouco maior que o alvo do briefing — o terreno é o limite real.
      // Estimativas
      const estimatedVgv = adjustedPrivateArea * 12000; // Mock: R$ 12k/m²
      const estimatedCost = adjustedBuiltArea * 4500;  // Mock: R$ 4.5k/m²
      const generalScore = conf.type === 'Equilibrado' ? 88 : (conf.type === 'Conservador' ? 82 : 74);

      const validations: any[] = [];
      if (rules.max_floors && floorsCount >= rules.max_floors) {
        validations.push({
          validation_type: 'Urbanístico',
          severity: 'Informativa',
          title: 'Gabarito Máximo',
          message: `O cenário atingiu o limite de ${rules.max_floors} pavimentos definido no Plano Diretor.`,
          status: 'Ativo'
        });
      }
      if (envelope.maxComputableArea > 0 && adjustedBuiltArea >= envelope.maxComputableArea * 0.95) {
        validations.push({
          validation_type: 'Urbanístico',
          severity: 'Média',
          title: 'CA Máximo',
          message: `O cenário está utilizando mais de 95% do potencial construtivo.`,
          status: 'Ativo'
        });
      }
      const expectedParking = actualUnits * (rules.parking_spaces_per_unit || 1);
      const desiredParking = actualUnits * (briefing.parking_per_unit || 0);
      if (desiredParking > expectedParking) {
        validations.push({
          validation_type: 'Arquitetônico',
          severity: 'Alta',
          title: 'Vagas Desejadas vs Exigidas',
          message: `O briefing pede ${desiredParking} vagas (total), mas a exigência urbanística requer apenas ${expectedParking}. Avaliar o custo extra de subsolos adicionais.`,
          status: 'Ativo'
        });
      }

      generatedScenarios.push({
        id: crypto.randomUUID(), // Temporário antes de inserir no banco
        study_id: studyId,
        name: conf.name,
        scenario_type: conf.type,
        status: 'Gerado',
        generation_method: 'Template Paramétrico',
        floors_count: floorsCount,
        units_per_floor: actualUnitsPerFloor,
        total_units: actualUnits,
        total_built_area: adjustedBuiltArea,
        total_private_area: adjustedPrivateArea,
        total_common_area: adjustedBuiltArea - adjustedPrivateArea,
        estimated_vgv: estimatedVgv,
        estimated_cost: estimatedCost,
        general_score: generalScore,
        efficiency_ratio: adjustedBuiltArea > 0 ? (adjustedPrivateArea / adjustedBuiltArea) * 100 : 0,
        selected: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        geometryData: {
          terrainWidth: envelope.geometryData.terrainWidth,
          terrainDepth: envelope.geometryData.terrainDepth,
          frontSetback: envelope.geometryData.frontSetback,
          leftSetback: envelope.geometryData.leftSetback,
          buildingWidth: Math.max(5, envelope.geometryData.buildingWidth * Math.sqrt(Math.min(1, (adjustedBuiltArea / floorsCount) / (envelope.geometryData.buildingWidth * envelope.geometryData.buildingDepth || 1)))),
          buildingDepth: Math.max(5, envelope.geometryData.buildingDepth * Math.sqrt(Math.min(1, (adjustedBuiltArea / floorsCount) / (envelope.geometryData.buildingWidth * envelope.geometryData.buildingDepth || 1))))
        },
        validations
      });
    }

    return generatedScenarios;
  }
}
