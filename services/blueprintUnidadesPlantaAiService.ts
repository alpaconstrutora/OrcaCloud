/**
 * PONTE Planta Inteligente ← Planta AI (18/09/2026, E2.2).
 *
 * O estudo conhece o empreendimento (zona urbanística); o empreendimento tem
 * torres com `planta_ai_scenario_id`; o cenário materializado tem
 * `plant_floors`/`plant_units`. Só LEITURA: quem cria as unidades na planta é
 * o kernel (`comandosDeImportacaoDoPlantaAi`), com Ctrl+Z.
 */
import { empreendimentoService } from './empreendimentoService';
import { plantaAiMaterializeService } from './plantaAiMaterializeService';
import { unidadeExternaDoPlantaAi, type UnidadeExterna } from '../utils/blueprintUnidades';

export const blueprintUnidadesPlantaAiService = {
  async listar(empreendimentoId: string): Promise<{ unidades: UnidadeExterna[]; cenarios: number }> {
    const torres = await empreendimentoService.listTowers(empreendimentoId);
    const cenarios = [...new Set(torres.map((t) => t.planta_ai_scenario_id).filter((c): c is string => typeof c === 'string' && c.length > 0))];
    const unidades: UnidadeExterna[] = [];
    for (const c of cenarios) {
      const lidas = await plantaAiMaterializeService.listUnitsForScenario(c);
      for (const u of lidas) {
        const e = unidadeExternaDoPlantaAi(u);
        if (e) unidades.push(e);
      }
    }
    return { unidades, cenarios: cenarios.length };
  },
};
