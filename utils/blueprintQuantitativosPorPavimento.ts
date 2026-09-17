/**
 * QUANTITATIVOS POR PAVIMENTO (17/09/2026: *"incluir pavimentos em
 * quantitativos"*).
 *
 * `computeQuantities` devolve as entidades sem dizer de que pavimento são —
 * o payload é por elemento, e o pavimento se lê no modelo. Aqui se faz a
 * junção: cada ambiente, parede, abertura e peça estrutural é atribuído ao
 * seu nível, e os totais por pavimento saem das MESMAS somas que os totais
 * gerais (`areaPisoM2` = soma dos ambientes, `areaParedeDuasFacesM2` = 2 ×
 * face líquida, alvenaria = soma dos volumes das paredes…), para a soma das
 * linhas fechar com a linha de total. Regra pura, sem React.
 */
import type { BlueprintModel, computeQuantities } from './blueprintKernel';
import { areaConstruidaMm2 } from './blueprintKernel';
import type { ArmaduraQuantificada } from './blueprintArmadura';

type Quant = ReturnType<typeof computeQuantities>;

export interface QuantitativoDoPavimento {
  levelId: string;
  nome: string;
  elevationMm: number;
  ambientes: number;
  areaConstruidaM2: number;
  areaPisoM2: number;
  areaParedeDuasFacesM2: number;
  volumeAlvenariaM3: number;
  comprimentoRodapeM: number;
  portas: number;
  janelas: number;
  areaAberturasM2: number;
  pecas: number;
  volumeConcretoM3: number;
  areaFormaM2: number;
  acoKg: number;
}

/** Mapa id → levelId para tudo o que o quantitativo lista. Abertura herda o da parede. */
export function pavimentoDasEntidades(model: BlueprintModel): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of model.spaces) m.set(s.id, s.levelId);
  for (const w of model.walls) m.set(w.id, w.levelId);
  for (const o of model.openings) {
    const nivel = m.get(o.wallId);
    if (nivel) m.set(o.id, nivel);
  }
  for (const s of model.structures) m.set(s.id, s.levelId);
  return m;
}

/** O nome do pavimento de uma entidade, ou '' quando não se sabe. */
export function nomeDoPavimento(model: BlueprintModel, mapa: Map<string, string>, id: string): string {
  const levelId = mapa.get(id);
  return model.levels.find((l) => l.id === levelId)?.name ?? '';
}

export function quantitativosPorPavimento(
  model: BlueprintModel,
  quant: Quant,
  armadura?: ArmaduraQuantificada,
): QuantitativoDoPavimento[] {
  const mapa = pavimentoDasEntidades(model);
  const acoPorPeca = new Map((armadura?.pecas ?? []).map((p) => [p.structuralId, p.kg]));
  // Na ordem de COTA, de baixo para cima: é como se lê um prédio.
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  return niveis.map((nivel) => {
    const no = (id: string) => mapa.get(id) === nivel.id;
    const ambientes = quant.ambientes.filter((a) => no(a.spaceId));
    const paredes = quant.paredes.filter((p) => no(p.wallId));
    const aberturas = quant.aberturas.filter((o) => no(o.openingId));
    const estruturas = quant.estruturas.filter((e) => no(e.structuralId));
    return {
      levelId: nivel.id,
      nome: nivel.name,
      elevationMm: nivel.elevationMm,
      ambientes: ambientes.length,
      areaConstruidaM2: areaConstruidaMm2(model, nivel) / 1_000_000,
      areaPisoM2: ambientes.reduce((s, a) => s + a.areaPisoM2, 0),
      areaParedeDuasFacesM2: paredes.reduce((s, p) => s + p.areaFaceLiquidaM2, 0) * 2,
      volumeAlvenariaM3: paredes.reduce((s, p) => s + p.volumeM3, 0),
      comprimentoRodapeM: ambientes.reduce((s, a) => s + a.comprimentoRodapeM, 0),
      portas: aberturas.filter((o) => o.tipo === 'door').length,
      janelas: aberturas.filter((o) => o.tipo === 'window').length,
      areaAberturasM2: aberturas.reduce((s, o) => s + o.areaM2, 0),
      pecas: estruturas.length,
      volumeConcretoM3: estruturas.reduce((s, e) => s + e.volumeConcretoM3, 0),
      areaFormaM2: estruturas.reduce((s, e) => s + e.areaFormaM2, 0),
      acoKg: estruturas.reduce((s, e) => s + (acoPorPeca.get(e.structuralId) ?? 0), 0),
    };
  });
}
