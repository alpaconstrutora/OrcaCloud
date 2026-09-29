/**
 * AQUECEDOR DE PASSAGEM (29/09/2026, E8.1 do roadmap hidrossanitário, NBR 5626:2020).
 *
 * Para cada aquecedor (a origem da rede quente):
 *
 *   - os PONTOS QUENTES que ele serve: os ligados à rede quente dele; com um
 *     aquecedor só, todos os pontos quentes do desenho (a rede pode ainda não
 *     ter sido lançada); com vários, o solto vai para o mais perto;
 *   - a VAZÃO SIMULTÂNEA da rede quente pelo mesmo método da distribuição:
 *     Q = 0,3·√ΣP (L/s, pesos da NBR 5626);
 *   - a CAPACIDADE: o aquecedor de passagem é vendido pela vazão que aquece
 *     20 °C (a "nominal"). Para levar Q da água fria à temperatura de uso, a
 *     nominal precisa ser Q·ΔT/20 — e o modelo é o menor da lista que dá conta;
 *     nenhum dá: aviso (dois aquecedores ou acumulação);
 *   - a PRESSÃO na entrada: a que a rede fria entrega no ponto de água fria do
 *     aquecedor (E1.3), contra a mínima de funcionamento do aparelho (premissa;
 *     o de passagem a gás costuma pedir 20 kPa).
 *
 * As capacidades da lista são as faixas comerciais usuais (15 a 43 L/min),
 * não de um fabricante — o modelo real é do catálogo de quem compra.
 */
import type { BlueprintModel, ObjectId, Terminal } from './blueprintKernel';
import { fazerChave } from './blueprintGrafoDeRede';
import { FICHA_DO_PONTO_HIDRAULICO, ehPontoDeConsumo } from './blueprintHidraulica';
import { redeDaOrigem } from './blueprintAguaAutomatica';
import type { PressoesDaRede } from './blueprintPressaoDaRede';

export interface HipotesesDeAquecedor {
  /** Temperatura de uso da água quente, °C. */
  temperaturaDeUsoC: number;
  /** Temperatura da água fria que entra, °C. */
  temperaturaDaAguaFriaC: number;
  /** Pressão dinâmica mínima na entrada do aquecedor, kPa. */
  pressaoMinimaKpa: number;
}
export const HIPOTESES_AQUECEDOR_PADRAO: HipotesesDeAquecedor = { temperaturaDeUsoC: 40, temperaturaDaAguaFriaC: 20, pressaoMinimaKpa: 20 };

/** As capacidades nominais usuais (L/min a ΔT 20 °C) dos aquecedores de passagem. */
export const CAPACIDADES_DE_AQUECEDOR_LMIN = [15, 20, 27, 33, 43] as const;
const DELTA_T_NOMINAL_C = 20;

export interface AquecedorDimensionado {
  aquecedorId: ObjectId;
  levelId: ObjectId;
  pontos: number;
  somaDePesos: number;
  /** Q = 0,3·√ΣP, em L/min. */
  vazaoLMin: number;
  deltaTC: number;
  /** A nominal (ΔT 20 °C) que leva Q com o ΔT das premissas. */
  capacidadeNecessariaLMin: number;
  /** O menor modelo da lista que dá conta; `null` se nenhum. */
  modeloLMin: number | null;
  /** A pressão dinâmica na entrada (a rede fria no aquecedor); `null` sem rede fria calculada. */
  pressaoNaEntradaKpa: number | null;
  pressaoOk: boolean;
  atende: boolean;
  avisos: string[];
}

export function dimensionarAquecedores(model: BlueprintModel, hip: HipotesesDeAquecedor, pressoes: readonly PressoesDaRede[]): AquecedorDimensionado[] {
  const terminais = model.terminais ?? [];
  const aquecedores = terminais.filter((t) => t.tipoHidraulico === 'AQUECEDOR' && t.disciplina === 'AGUA_QUENTE').sort((a, b) => a.id.localeCompare(b.id));
  if (aquecedores.length === 0) return [];
  const quentes = terminais.filter((t) => t.disciplina === 'AGUA_QUENTE' && ehPontoDeConsumo(t.tipoHidraulico));
  const chave = fazerChave(model.levels);
  const noDo = (t: Terminal) => chave(t.levelId, t.at.x, t.at.y, t.cotaMm);
  // Quem serve cada ponto: o aquecedor cuja rede chega nele; senão (ou com um só aquecedor), o mais perto.
  const donos = new Map<ObjectId, ObjectId>();
  for (const aq of aquecedores) {
    const nos = new Set(redeDaOrigem(model, aq, 'AGUA_QUENTE').flatMap((t) => [chave(t.levelId, t.a.x, t.a.y, t.cotaAMm), chave(t.levelId, t.b.x, t.b.y, t.cotaBMm)]));
    for (const p of quentes) if (!donos.has(p.id) && nos.has(noDo(p))) donos.set(p.id, aq.id);
  }
  for (const p of quentes) {
    if (donos.has(p.id)) continue;
    const perto = [...aquecedores].sort((a, b) => Math.hypot(a.at.x - p.at.x, a.at.y - p.at.y) - Math.hypot(b.at.x - p.at.x, b.at.y - p.at.y) || a.id.localeCompare(b.id))[0];
    donos.set(p.id, perto.id);
  }
  const deltaTC = Math.max(1, hip.temperaturaDeUsoC - hip.temperaturaDaAguaFriaC);
  const entradas = pressoes.filter((r) => r.disciplina === 'AGUA_FRIA').flatMap((r) => r.pontos);
  return aquecedores.map((aq) => {
    const seus = quentes.filter((p) => donos.get(p.id) === aq.id);
    const somaDePesos = seus.reduce((s, p) => s + (FICHA_DO_PONTO_HIDRAULICO[p.tipoHidraulico!].pesoNbr5626 ?? 0), 0);
    const vazaoLMin = 0.3 * Math.sqrt(somaDePesos) * 60;
    const capacidadeNecessariaLMin = (vazaoLMin * deltaTC) / DELTA_T_NOMINAL_C;
    const modeloLMin = CAPACIDADES_DE_AQUECEDOR_LMIN.find((c) => c + 1e-9 >= capacidadeNecessariaLMin) ?? null;
    // A entrada: o ponto de água fria do aquecedor (o terminal AQUECEDOR da fria a até 600 mm deste).
    const fria = terminais.find((t) => t.tipoHidraulico === 'AQUECEDOR' && t.disciplina === 'AGUA_FRIA' && t.levelId === aq.levelId && Math.hypot(t.at.x - aq.at.x, t.at.y - aq.at.y) <= 600);
    const naEntrada = fria ? entradas.find((p) => p.terminalId === fria.id) : undefined;
    const pressaoNaEntradaKpa = naEntrada?.disponivelKpa ?? null;
    const pressaoOk = pressaoNaEntradaKpa != null && pressaoNaEntradaKpa + 1e-9 >= hip.pressaoMinimaKpa;
    const avisos: string[] = [];
    if (seus.length === 0) avisos.push('Nenhum ponto de água quente para este aquecedor.');
    if (modeloLMin == null) avisos.push(`${Math.round(capacidadeNecessariaLMin)} L/min passa do maior aquecedor de passagem da lista — divida em dois aquecedores ou use acumulação.`);
    if (!fria) avisos.push('O aquecedor não tem o ponto de água fria (a entrada) a até 60 cm — a pressão na entrada não é avaliada.');
    else if (pressaoNaEntradaKpa == null) avisos.push('A rede de água fria ainda não chega ao aquecedor — a pressão na entrada não é avaliada.');
    return {
      aquecedorId: aq.id,
      levelId: aq.levelId,
      pontos: seus.length,
      somaDePesos,
      vazaoLMin,
      deltaTC,
      capacidadeNecessariaLMin,
      modeloLMin,
      pressaoNaEntradaKpa,
      pressaoOk,
      atende: seus.length > 0 && modeloLMin != null && pressaoOk,
      avisos,
    };
  });
}
