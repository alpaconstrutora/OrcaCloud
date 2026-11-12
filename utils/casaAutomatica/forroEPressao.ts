/**
 * Casa automática — parte `forroEPressao` do motor (etapa D2, 11/11/2026: `utils/blueprintCasaAutomatica.ts` dividido sem mudar
 * o que gera; o marco das casas de referência prova). Ver o cabeçalho de `orquestrador.ts`.
 */
import { applyBatch, point } from '../blueprintKernel';
import type { BlueprintModel, Boundary, Command, Point } from '../blueprintKernel';
import type { HipotesesHidro } from '../blueprintMemorialHidro';
import { planejarAguaCompleta } from '../blueprintAguaCompleta';
import type { LeitorDoTerreno } from '../blueprintAncorasHidro';
import { medirTerreno } from '../blueprintTerreno';
import { pressoesDoModelo } from '../blueprintPressaoDaRede';
import type { HipotesesDePressao } from '../blueprintPressaoDaRede';
import { KPA_POR_MCA } from '../blueprintHidraulicaPressao';
import type { FaixaDoForro } from '../blueprintRotaPeloForro';
import type { HipotesesDeAgua } from '../blueprintAguaAutomatica';
import { HIPOTESES_DO_SOBRADO_PADRAO } from '../blueprintSobrado';
import { HIPOTESES_DO_FORRO_DA_CASA_PADRAO, FAIXAS_DO_FORRO, RAIO_NO_PLENUM_MM, HIPOTESES_DA_CASA_PADRAO } from './hipoteses';
import type { HipotesesDaCasa, HipotesesDoForroDaCasa, HipotesesDaPressaoDaCasa } from './hipoteses';
import { quadroDaFrente, paraMundo } from './quadroEImplantacao';

/**
 * O grupo do forro COMPLETO (cada faixa campo a campo sobre o padrão) — o mesmo que `planejarCasa` usa. Correção 3 dos
 * eletrodutos (24/10/2026): exportado para o editor montar o forro elétrico das premissas sem copiar valores.
 */
export function hipotesesDoForroDaCasa(parcial: Partial<HipotesesDoForroDaCasa> = {}): HipotesesDoForroDaCasa {
  return {
    ...HIPOTESES_DO_FORRO_DA_CASA_PADRAO,
    ...parcial,
    ...Object.fromEntries(FAIXAS_DO_FORRO.map((k) => [k, { ...HIPOTESES_DO_FORRO_DA_CASA_PADRAO[k], ...(parcial[k] ?? {}) }])),
  };
}

/** O forro da REDE ELÉTRICA (a faixa do eletroduto e a folga sob a viga), como a casa passa ao motor dos eletrodutos. */
export function forroDaEletrica(f: HipotesesDoForroDaCasa): { faixa: FaixaDoForro; folgaSobAVigaMm: number } {
  return { faixa: f.eletrica, folgaSobAVigaMm: f.folgaSobAVigaMm };
}

/**
 * Correção 3 dos eletrodutos (24/10/2026, pedido literal: *"então verifique pois alterei e não ficou disponível para
 * relançamento"*): o forro elétrico com que a casa lança a rede, a partir das hipóteses parciais do estudo
 * (`hipotesesDasPremissas`). `null` com o forro desligado. O editor passa isto ao painel dos eletrodutos para relançar
 * NO FORRO a rede antiga (sem registro do lançamento).
 */
export function forroEletricoDaCasa(hipParcial: Partial<HipotesesDaCasa>): { faixa: FaixaDoForro; folgaSobAVigaMm: number; rebaixoMm: number } | null {
  const f = hipotesesDoForroDaCasa(hipParcial.forro ?? {});
  // Correção 2 da F3: o REBAIXO vai junto — é parte da assinatura da casa (`temAssinaturaDaCasa`).
  return f.lancar ? { ...forroDaEletrica(f), rebaixoMm: rebaixoDoForroMm(f) } : null;
}

/**
 * O forro da ÁGUA da casa — o `agua.noForro` com que a etapa ÁGUA lança (as faixas da fria e da quente e a folga sob a
 * viga) —, ou `null` com o forro desligado. O irmão de `forroEletricoDaCasa` (F3 do relançar, 24/10/2026): a casa lança
 * com ele, e o editor monta com ele, das premissas do estudo, o forro da água antiga lançada antes do registro.
 */
export function forroDaAguaDaCasa(hipParcial: Partial<HipotesesDaCasa>): (NonNullable<HipotesesDeAgua['noForro']> & { rebaixoMm: number }) | null {
  const f = hipotesesDoForroDaCasa(hipParcial.forro ?? {});
  // Correção 2 da F3: o REBAIXO vai junto — é parte da assinatura da casa (`temAssinaturaDaCasa`).
  return f.lancar ? { aguaFria: f.aguaFria, aguaQuente: f.aguaQuente, folgaSobAVigaMm: f.folgaSobAVigaMm, rebaixoMm: rebaixoDoForroMm(f) } : null;
}

/**
 * A FAIXA DA ÁGUA QUENTE da casa no mundo (F14a: o deslocamento (d, d) no quadro da frente do lote — o mesmo
 * `faixaNoMundo` da etapa ÁGUA), ou `null` sem a frente marcada. Correção 2 da F3 (24/10/2026): a água antiga relançada
 * sem registro refaz a quente na faixa dela — pelo eixo das paredes, cruzava a fria e a estrutura.
 */
export function faixaDaAguaQuenteDaCasa(hipParcial: Partial<HipotesesDaCasa>, limites: readonly Boundary[], anelDoLote: readonly Point[]): Point | null {
  return faixaDaCasa({ ...HIPOTESES_DA_CASA_PADRAO.faixas, ...(hipParcial.faixas ?? {}) }.aguaQuenteMm, limites, anelDoLote);
}

/** A faixa (d, d) do quadro da frente do lote levada ao mundo — a conta do `faixaNoMundo` da casa. */
export function faixaDaCasa(d: number, limites: readonly Boundary[], anelDoLote: readonly Point[]): Point | null {
  const q = quadroDaFrente(limites, anelDoLote);
  if (!q) return null;
  const v = paraMundo(q, { x: d, y: d });
  return { x: Math.round(v.x), y: Math.round(v.y) };
}

/**
 * Correção 3 da F3 (24/10/2026, re-revisão): a faixa da quente pelo LOTE do modelo — os limites do pavimento que tem a
 * divisa da FRENTE (a casa se implanta por ela), nunca os do pavimento ativo no editor. No sobrado o lote só existe no
 * térreo: com o pavimento de cima ativo, a faixa saía `null`, a quente refeita cruzava a fria (+18 conflitos de rede) e o
 * registro perpetuava isso.
 */
export function faixaDaAguaQuenteDaCasaNoModelo(hipParcial: Partial<HipotesesDaCasa>, model: Pick<BlueprintModel, 'boundaries'>): Point | null {
  return faixaDaCasaNoModelo({ ...HIPOTESES_DA_CASA_PADRAO.faixas, ...(hipParcial.faixas ?? {}) }.aguaQuenteMm, model);
}

/** A faixa (d, d) pelo LOTE do modelo (o pavimento da divisa da frente), nunca o pavimento ativo. */
export function faixaDaCasaNoModelo(d: number, model: Pick<BlueprintModel, 'boundaries'>): Point | null {
  const frente = model.boundaries.find((b) => b.kind === 'TERRENO' && b.papel === 'FRENTE');
  if (!frente) return null;
  const limites = model.boundaries.filter((b) => b.levelId === frente.levelId);
  const terreno = medirTerreno(limites);
  return terreno ? faixaDaCasa(d, limites, terreno.anel) : null;
}

/**
 * F4 do relançar (24/10/2026): o que a casa decide no ESGOTO e o estudo não tem — a FAIXA do esgoto no mundo (F14a: o
 * mesmo quadro da frente do lote, com `faixas.esgotoMm`) e, no sobrado (mais de um pavimento no modelo), um tubo de
 * queda por GRUPO de peças e o raio do shaft da casa (F14c). A etapa ESGOTO lança com isto; o editor o passa ao esgoto
 * antigo (sem registro) de uma casa, para relançar sem tirar o tubo de queda e a ventilação do lugar.
 */
export function esgotoDaCasaNoModelo(
  hipParcial: Partial<HipotesesDaCasa>,
  model: Pick<BlueprintModel, 'boundaries' | 'terminais'>,
): { faixa: Point | null; tuboDeQuedaPorGrupoMm: number | null; raioDoShaftMm: number | null } {
  const sobrado = { ...HIPOTESES_DO_SOBRADO_PADRAO, ...(hipParcial.sobrado ?? {}) };
  // Correção 1 da F4 (menor 2): o critério da casa (`niveis.length > 1` — os pavimentos DELA, não os do estudo): as
  // premissas de pavimentos quando dizem quantos; no "Automático", os pavimentos com peça de esgoto (a casa lança as
  // louças em cada pavimento dela — um pavimento do estudo sem casa não conta).
  const pav = hipParcial.pavimentos;
  const varios = typeof pav === 'number' ? pav > 1 : new Set((model.terminais ?? []).filter((t) => t.disciplina === 'ESGOTO').map((t) => t.levelId)).size > 1;
  return {
    faixa: faixaDaCasaNoModelo({ ...HIPOTESES_DA_CASA_PADRAO.faixas, ...(hipParcial.faixas ?? {}) }.esgotoMm, model),
    tuboDeQuedaPorGrupoMm: varios ? sobrado.grupoDoTuboDeQuedaMm : null,
    raioDoShaftMm: varios ? sobrado.tuboDeQuedaAteOShaftMm : null,
  };
}

/** O rebaixo do forro (da laje à face de cima dele): a faixa mais baixa, o raio do tubo e a folga. */
export function rebaixoDoForroMm(f: HipotesesDoForroDaCasa): number {
  return Math.max(...FAIXAS_DO_FORRO.map((k) => f[k].abaixoDoTetoMm)) + RAIO_NO_PLENUM_MM + f.folgaSobAFaixaMm;
}

/** O maior déficit de pressão entre os pontos de água (fria e quente), em metros de coluna; 0 = todos atendidos. */
export function deficitDePressaoM(model: BlueprintModel, hip?: HipotesesDePressao): number {
  let d = 0;
  for (const r of pressoesDoModelo(model, hip)) for (const p of r.pontos) if (p.estado === 'INSUFICIENTE' && p.disponivelKpa != null) d = Math.max(d, (p.minimaKpa - p.disponivelKpa) / KPA_POR_MCA);
  return d;
}

/** Folga sobre o déficit ao elevar a caixa, e o passo da elevação, mm. */
export const FOLGA_DA_ELEVACAO_MM = 100;

export const PASSO_DA_ELEVACAO_MM = 50;

/** Onde o pressurizador fica em relação à caixa (fora do tubo de saída, dentro do raio que o cálculo reconhece), mm. */
export const PRESSURIZADOR_AO_LADO_DA_CAIXA_MM = 400;

export interface DecisaoDaPressao {
  solucao: 'NENHUMA' | 'CAIXA_ELEVADA' | 'PRESSURIZADOR';
  comandos: Command[];
  /** O déficit antes, e o que sobra depois (m de coluna). */
  deficitM: number;
  restanteM: number;
  elevacaoMm: number;
  /** O plano da água JÁ traçado sobre o modelo com estes comandos (a última simulação) — a etapa ÁGUA o reaproveita. */
  plano: ReturnType<typeof planejarAguaCompleta> | null;
}

/**
 * F13 — A PRESSÃO POR CASO: simula a água como o lançamento vai fazê-la e mede o maior déficit; se elevar a caixa
 * (em passos de 50 mm, com folga) até `caixaElevadaAteMm` resolve, eleva; senão, põe o PRESSURIZADOR na saída dela
 * (a bomba a 40 cm da caixa — o cálculo de pressão soma o ganho dele). Os comandos vão ANTES do traçado da água, que
 * então ajusta os diâmetros já contando com a solução.
 */
export function decidirPressao(model: BlueprintModel, hidro: HipotesesHidro, terreno: LeitorDoTerreno | null, hip: HipotesesDaPressaoDaCasa): DecisaoDaPressao {
  const nada: DecisaoDaPressao = { solucao: 'NENHUMA', comandos: [], deficitM: 0, restanteM: 0, elevacaoMm: 0, plano: null };
  const caixa = (model.terminais ?? []).find((t) => t.tipoHidraulico === 'RESERVATORIO' && t.disciplina === 'AGUA_FRIA' && t.papelReservatorio !== 'INFERIOR');
  if (!caixa || !hip.resolver) return nada;
  const simular = (cmds: Command[]) => {
    const m1 = cmds.length ? applyBatch(model, cmds).model : model;
    const plano = planejarAguaCompleta(m1, hidro, terreno);
    return { deficit: deficitDePressaoM(plano.comandos.length ? applyBatch(m1, plano.comandos).model : m1, hidro.pressao), plano };
  };
  const inicial = simular([]);
  const deficitM = inicial.deficit;
  if (deficitM <= 0) return { ...nada, deficitM, plano: inicial.plano };
  const passo = (mm: number) => Math.ceil(mm / PASSO_DA_ELEVACAO_MM) * PASSO_DA_ELEVACAO_MM;
  // Subir a caixa 1 m rende no máximo 1 m (medido: ~0,9 — o ajuste de diâmetro muda junto): com o déficit acima do
  // limite, nem tenta. Senão, sobe pelo déficit e confere; o que sobrar entra na próxima (a última, no limite).
  let subir = passo(deficitM * 1000 + FOLGA_DA_ELEVACAO_MM);
  if (subir <= hip.caixaElevadaAteMm) {
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const alvo = Math.min(subir, hip.caixaElevadaAteMm);
      const cmd: Command = { type: 'SetTerminalProps', terminalId: caixa.id, cotaMm: caixa.cotaMm + alvo } as Command;
      const r = simular([cmd]);
      if (r.deficit <= 0) return { solucao: 'CAIXA_ELEVADA', comandos: [cmd], deficitM, restanteM: 0, elevacaoMm: alvo, plano: r.plano };
      if (alvo >= hip.caixaElevadaAteMm) break;
      subir = passo(alvo + r.deficit * 1000 + FOLGA_DA_ELEVACAO_MM);
    }
  }
  const bomba: Command = {
    type: 'AddTerminal', levelId: caixa.levelId, disciplina: 'AGUA_FRIA', tipo: 'Pressurizador', at: point(caixa.at.x + PRESSURIZADOR_AO_LADO_DA_CAIXA_MM, caixa.at.y),
    cotaMm: caixa.cotaMm, tipoHidraulico: 'BOMBA', rotulo: 'Pressurizador', sugerida: true,
  } as Command;
  const comBomba = simular([bomba]);
  if (comBomba.deficit <= 0) return { solucao: 'PRESSURIZADOR', comandos: [bomba], deficitM, restanteM: 0, elevacaoMm: 0, plano: comBomba.plano };
  // F14c: o pressurizador sozinho não basta (sobrado: a quente do chuveiro de cima sai do aquecedor do térreo por um
  // caminho longo) — com ele, a caixa também sobe, até o limite; o que ainda faltar fica dito na verificação.
  let melhor = { comandos: [bomba] as Command[], restanteM: comBomba.deficit, elevacaoMm: 0, plano: comBomba.plano };
  let subirJunto = passo(comBomba.deficit * 1000 + FOLGA_DA_ELEVACAO_MM);
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const alvo = Math.min(subirJunto, hip.caixaElevadaAteMm);
    const cmd: Command = { type: 'SetTerminalProps', terminalId: caixa.id, cotaMm: caixa.cotaMm + alvo } as Command;
    const junto = { ...bomba, cotaMm: caixa.cotaMm + alvo } as Command;
    const r = simular([cmd, junto]);
    if (r.deficit < melhor.restanteM) melhor = { comandos: [cmd, junto], restanteM: r.deficit, elevacaoMm: alvo, plano: r.plano };
    if (r.deficit <= 0 || alvo >= hip.caixaElevadaAteMm) break;
    subirJunto = passo(alvo + r.deficit * 1000 + FOLGA_DA_ELEVACAO_MM);
  }
  return { solucao: 'PRESSURIZADOR', comandos: melhor.comandos, deficitM, restanteM: Math.max(0, melhor.restanteM), elevacaoMm: melhor.elevacaoMm, plano: melhor.plano };
}
