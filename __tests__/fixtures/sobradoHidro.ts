/**
 * O SOBRADO HIDROSSANITÁRIO de prova (28/09/2026): o banheiro repetido nos dois
 * andares, caixa d'água no teto do superior, CI no térreo — água e esgoto
 * lançados pelos PLANEJADORES, como o usuário faz. Usado pelo esquema vertical
 * (E2.3) e pelos memoriais (E3).
 */
import { applyBatch, applyCommand, emptyModel, point, recomputeSpaces, type BlueprintModel, type Command, type TipoDePontoHidraulico } from '../../utils/blueprintKernel';
import { planejarAgua } from '../../utils/blueprintAguaAutomatica';
import { HIPOTESES_ESGOTO_PADRAO, planejarEsgoto } from '../../utils/blueprintEsgotoAutomatico';
import { planejarColetorPredial } from '../../utils/blueprintColetorPredial';
import { planejarVentilacao } from '../../utils/blueprintVentilacao';
import { comAjusteDePressao } from '../../utils/blueprintPressaoDaRede';
import { HIPOTESES_ALIMENTACAO_PADRAO, planejarAlimentador } from '../../utils/blueprintAlimentador';
import { HIPOTESES_RESERVATORIO_PADRAO } from '../../utils/blueprintReservacao';
import { planejarPecasDaCaixa } from '../../utils/blueprintPecasDaCaixa';

/**
 * O banheiro repetido nos dois andares; caixa d'água no teto do superior (ou
 * `cotaDaCaixaMm` acima do piso dele — a caixa elevada da E3.3); CI no térreo.
 * `comAjuste`: a água sai com o DN ajustado pela pressão, como no editor.
 */
export function sobrado(doisAndares = true, opcoes: { cotaDaCaixaMm?: number; comAjuste?: boolean; volumeDaCaixaL?: number; alimentador?: boolean; ligacao?: boolean; ventilacao?: boolean; estrutura?: (niveis: string[]) => Command[]; aguaQuente?: boolean } = {}): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  if (doisAndares) m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 }).model;
  const niveis = m.levels.map((l) => l.id);
  const paredes = (levelId: string): Command[] =>
    [[0, 0, 4500, 0], [4500, 0, 4500, 3000], [4500, 3000, 0, 3000], [0, 3000, 0, 0], [2000, 0, 2000, 3000]].map(([ax, ay, bx, by]) => ({
      type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
    }) as Command);
  const ponto = (levelId: string, disciplina: 'AGUA_FRIA' | 'AGUA_QUENTE' | 'ESGOTO', tipo: TipoDePontoHidraulico, x: number, y: number, cota: number): Command =>
    ({ type: 'AddTerminal', levelId, disciplina, tipo, at: point(x, y), cotaMm: cota, tipoHidraulico: tipo }) as Command;
  const banheiro = (l: string): Command[] => [
    ponto(l, 'AGUA_FRIA', 'LAVATORIO', 75, 2500, 600),
    ponto(l, 'AGUA_FRIA', 'CHUVEIRO', 1500, 2925, 2100),
    ponto(l, 'AGUA_FRIA', 'VASO_SANITARIO', 75, 800, 300),
    ponto(l, 'ESGOTO', 'VASO_SANITARIO', 600, 800, 0),
    ponto(l, 'ESGOTO', 'LAVATORIO', 600, 2500, 500),
    ponto(l, 'ESGOTO', 'CHUVEIRO', 1500, 2500, 0),
    ponto(l, 'ESGOTO', 'CAIXA_SIFONADA', 1200, 2100, 0),
  ];
  m = applyBatch(m, [
    ...niveis.flatMap(paredes),
    { type: 'AddTerminal', levelId: niveis[niveis.length - 1], disciplina: 'AGUA_FRIA', tipo: "Caixa d'água", at: point(4500, 0), cotaMm: opcoes.cotaDaCaixaMm ?? 2800, tipoHidraulico: 'RESERVATORIO' } as Command,
    ...niveis.flatMap(banheiro),
    ponto(niveis[0], 'ESGOTO', 'CAIXA_INSPECAO', 6000, -1500, -700),
    // E5.5: pilares e vigas ANTES dos planejadores — o traçado desvia deles.
    ...(opcoes.estrutura?.(niveis) ?? []),
    // E8.1: o aquecedor de passagem no térreo (entrada fria e saída quente no mesmo lugar)
    // e o chuveiro e o lavatório quentes em cada andar.
    ...(opcoes.aguaQuente
      ? [
          ({ type: 'AddTerminal', levelId: niveis[0], disciplina: 'AGUA_FRIA', tipo: 'Aquecedor', at: point(4425, 1500), cotaMm: 1600, tipoHidraulico: 'AQUECEDOR' }) as Command,
          ({ type: 'AddTerminal', levelId: niveis[0], disciplina: 'AGUA_QUENTE', tipo: 'Aquecedor', at: point(4425, 1500), cotaMm: 1600, tipoHidraulico: 'AQUECEDOR' }) as Command,
          ...niveis.flatMap((l) => [
            ponto(l, 'AGUA_QUENTE', 'CHUVEIRO', 1600, 2925, 2100),
            ponto(l, 'AGUA_QUENTE', 'LAVATORIO', 75, 2400, 600),
          ]),
        ]
      : []),
  ]).model;
  m = recomputeSpaces(m);
  // E4.1: os ambientes com nome — o banheiro à esquerda e um QUARTO à direita (população pelos dormitórios).
  for (const e of m.spaces) {
    m = applyCommand(m, { type: 'NameSpace', spaceId: e.id, name: e.ring.every((p) => p.x <= 2000) ? 'Banheiro' : 'Quarto' } as Command).model;
  }
  if (opcoes.volumeDaCaixaL) {
    const cx = m.terminais!.find((t) => t.tipoHidraulico === 'RESERVATORIO')!;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: cx.id, volumeL: opcoes.volumeDaCaixaL } as Command).model;
  }
  const plano = planejarAgua(m, m.terminais!.find((t) => t.tipoHidraulico === 'RESERVATORIO')!);
  m = applyBatch(m, (opcoes.comAjuste ? comAjusteDePressao(m, plano) : plano).comandos).model;
  if (opcoes.aguaQuente) m = applyBatch(m, planejarAgua(m, m.terminais!.find((t) => t.tipoHidraulico === 'AQUECEDOR' && t.disciplina === 'AGUA_QUENTE')!).comandos).model;
  m = applyBatch(m, planejarEsgoto(m).comandos).model;
  // E5.4: a ventilação lançada (colunas dos desconectores e o prolongamento acima da cobertura).
  if (opcoes.ventilacao) m = applyBatch(m, planejarVentilacao(m).comandos).model;
  // E5.3: a ligação à rede pública 4,5 m além da CI (rede a −0,80) e o coletor predial.
  if (opcoes.ligacao) {
    m = applyCommand(m, { type: 'AddTerminal', levelId: niveis[0], disciplina: 'ESGOTO', tipo: 'Ligação', at: point(6000, -6000), cotaMm: -800, tipoHidraulico: 'LIGACAO_ESGOTO' } as Command).model;
    m = applyBatch(m, planejarColetorPredial(m, HIPOTESES_ESGOTO_PADRAO).comandos).model;
  }
  // E4.3: o hidrômetro no limite do lote (6 m à direita, térreo) e o alimentador até a caixa.
  if (opcoes.alimentador) {
    // As peças da caixa primeiro (E4.2): o alimentador chega à torneira de boia.
    m = applyBatch(m, planejarPecasDaCaixa(m, m.terminais!.find((t) => t.tipoHidraulico === 'RESERVATORIO')!).comandos).model;
    m = applyCommand(m, { type: 'AddTerminal', levelId: niveis[0], disciplina: 'AGUA_FRIA', tipo: 'Hidrômetro', at: point(6000, 1500), cotaMm: 600, tipoHidraulico: 'HIDROMETRO' } as Command).model;
    m = applyBatch(m, planejarAlimentador(m, HIPOTESES_ALIMENTACAO_PADRAO, HIPOTESES_RESERVATORIO_PADRAO, 3).comandos).model;
  }
  return m;
}
