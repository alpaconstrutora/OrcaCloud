/**
 * MOVER a peça de climatização leva o SISTEMA junto (11/10/2026, teste do usuário no
 * app real: "o comando mover funciona, porém a linha de dreno e a alimentação elétrica
 * não acompanham a nova posição").
 *
 * O kernel arrasta só as PONTAS de trecho presas à peça (`pontasPresasAsPecas`): a
 * linha e o dreno esticavam na diagonal do lugar antigo até o novo, e o ponto de força
 * ficava para trás. Depois do `TranslateEntities` do gesto, no MESMO lote (um Ctrl+Z):
 *
 *  1. a evaporadora de PAREDE que parou perto de uma parede encosta nela e gira para
 *     soprar para dentro (a regra da inserção, `encostoNaParede`);
 *  2. o ponto de força dela (o que a servia ANTES) vai para onde um ponto novo nasceria
 *     — na face, ao lado do aparelho (`pontoEletricoDaEvaporadora`);
 *  3. a linha frigorígena e o dreno do sistema (evaporadora OU condensadora movida — o
 *     ponto de dreno novo nasce junto da condensadora, então mover só ela também muda o
 *     dreno) são apagados — aceitos ou sugeridos: decisão do usuário, "refazer sempre" — e o
 *     planejador da linha os retraça a partir da posição nova (sugeridos). O que a seleção levou inteiro junto (o trecho selecionado) não é
 *     refeito: quem arrastou o conjunto manteve o traçado.
 *
 *  4. (11/10/2026, pendência 1) o ELETRODUTO do ponto de força que andou: o ramal dele — do
 *     ponto até a primeira derivação, outra peça ou o quadro — sai, e a rede do quadro do
 *     circuito é relançada (`relancarEletrodutos`: refaz os sugeridos e liga o ponto pelo
 *     caminho de agora). Os outros eletrodutos aceitos ficam. Sem as premissas da elétrica
 *     (quem chama não as tem), o eletroduto segue só pela ponta presa, como antes.
 *
 * Puro: devolve os comandos a aplicar sobre `depois` (o modelo já com o gesto).
 */
import type { BlueprintModel, Command, ObjectId, Terminal } from './blueprintKernel';
import { TIPOS_DE_CONDENSADORA, TIPOS_DE_EVAPORADORA, applyBatch } from './blueprintKernel';
import { ehEvaporadoraDeParede, encostoNaParede, estaEncostada } from './blueprintEncostoNaParede';
import { pontoEletricoDaEvaporadora, pontoEletricoDaEvaporadoraExistente } from './blueprintPontosHidraulicos';
import { pecasDoSistemaParaRefazer, planejarLinhasFrigorigenas, sistemasDoNivel } from './blueprintLinhaFrigorigena';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import type { HipotesesDaLinha } from './blueprintClimatizacao';
import { relancarEletrodutos, type HipotesesDeEletroduto } from './blueprintEletrodutos';
import type { HipotesesEletricas } from './blueprintEletricaDimensionamento';

/**
 * O RAMAL do ponto: os eletrodutos que saem dele (em planta, no mesmo pavimento) e seguem
 * enquanto o caminho não se divide — para na derivação, em outra peça elétrica ou no quadro.
 * Por todas as saídas do ponto (o ponto no meio de uma corrida tem duas).
 */
export function ramalDoPonto(model: BlueprintModel, ponto: Pick<Terminal, 'id' | 'levelId' | 'at'>): ObjectId[] {
  const eletrodutos = (model.trechos ?? []).filter((t) => t.disciplina === 'ELETRICA' && t.levelId === ponto.levelId);
  const k = (p: { x: number; y: number }) => `${p.x},${p.y}`;
  const porNo = new Map<string, typeof eletrodutos>();
  for (const t of eletrodutos) for (const p of [t.a, t.b]) porNo.set(k(p), [...(porNo.get(k(p)) ?? []), t]);
  const pecas = new Set([
    ...(model.terminais ?? []).filter((t) => t.levelId === ponto.levelId && t.id !== ponto.id && t.disciplina === 'ELETRICA').map((t) => k(t.at)),
    ...(model.quadros ?? []).filter((q) => q.levelId === ponto.levelId).map((q) => k(q.at)),
  ]);
  const ramal = new Set<ObjectId>();
  for (const inicio of porNo.get(k(ponto.at)) ?? []) {
    let atual = inicio;
    let no = k(atual.a) === k(ponto.at) ? k(atual.b) : k(atual.a);
    for (let guarda = 0; guarda < 1000 && !ramal.has(atual.id); guarda++) {
      ramal.add(atual.id);
      const seguintes = (porNo.get(no) ?? []).filter((t) => t.id !== atual.id);
      if (seguintes.length !== 1 || pecas.has(no) || no === k(ponto.at)) break;
      atual = seguintes[0];
      no = k(atual.a) === no ? k(atual.b) : k(atual.a);
    }
  }
  return [...ramal];
}

const ehEvaporadora = (t: Pick<Terminal, 'tipoHidraulico'>) => !!t.tipoHidraulico && (TIPOS_DE_EVAPORADORA as readonly string[]).includes(t.tipoHidraulico);
const ehCondensadora = (t: Pick<Terminal, 'tipoHidraulico'>) => !!t.tipoHidraulico && (TIPOS_DE_CONDENSADORA as readonly string[]).includes(t.tipoHidraulico);

/** Algum dos terminais movidos é peça de climatização (evaporadora ou condensadora)? */
export function moveuClimatizacao(model: BlueprintModel, terminalIds: readonly ObjectId[]): boolean {
  const ids = new Set(terminalIds);
  return (model.terminais ?? []).some((t) => ids.has(t.id) && (ehEvaporadora(t) || ehCondensadora(t)));
}

export function comandosAoMoverClimatizacao(
  antes: BlueprintModel,
  depois: BlueprintModel,
  movidos: { terminalIds: readonly ObjectId[]; trechoIds: readonly ObjectId[] },
  hip: HipotesesDaLinha,
  eletrica?: { eletroduto: HipotesesDeEletroduto; eletricas: HipotesesEletricas } | null,
): Command[] {
  const lote: Command[] = [];
  let m = depois;
  const aplicar = (cs: Command[]) => {
    if (!cs.length) return;
    m = applyBatch(m, cs).model;
    lote.push(...cs);
  };
  const terminaisMovidos = new Set(movidos.terminalIds);
  const trechosMovidos = new Set(movidos.trechoIds);
  const antesPorId = new Map((antes.terminais ?? []).map((t) => [t.id, t]));
  /** Os pontos de força que andaram (com a evaporadora ou pelo passo 2) — o eletroduto deles é refeito no passo 4. */
  const pontosQueAndaram = new Set<ObjectId>();
  const agora = (id: ObjectId) => (m.terminais ?? []).find((t) => t.id === id);

  // ── 1 e 2: a evaporadora encosta; o ponto de força dela vai junto ─────────────
  for (const id of movidos.terminalIds) {
    const evap = agora(id);
    if (!evap || !ehEvaporadora(evap)) continue;
    const evapAntes = antesPorId.get(id);
    const ponto = evapAntes ? pontoEletricoDaEvaporadoraExistente(antes, evapAntes) : null;
    if (ehEvaporadoraDeParede(evap.tipoHidraulico)) {
      const ficha = FICHA_DO_PONTO_HIDRAULICO[evap.tipoHidraulico!]?.medidasMm;
      const enc = encostoNaParede(m, evap.levelId, evap.at, evap.profundidadeMm ?? ficha?.profundidadeMm ?? 220);
      if (enc && !estaEncostada(evap.at, evap.rotacaoGraus, enc)) {
        const delta = { x: enc.at.x - evap.at.x, y: enc.at.y - evap.at.y };
        aplicar([
          ...(delta.x || delta.y ? [{ type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], terminalIds: [evap.id], delta, manterJuncoes: false } as Command] : []),
          { type: 'SetTerminalProps', terminalId: evap.id, rotacaoGraus: enc.rotacaoGraus },
        ]);
      }
    }
    if (ponto && !terminaisMovidos.has(ponto.id)) {
      const pontoAgora = agora(ponto.id);
      const evapAgora = agora(id)!;
      // Onde um ponto NOVO nasceria para a evaporadora na posição nova (sem o antigo no desenho).
      const semOPonto: BlueprintModel = { ...m, terminais: (m.terminais ?? []).filter((t) => t.id !== ponto.id) };
      const destino = pontoEletricoDaEvaporadora(semOPonto, evapAgora, 3)[0]?.at;
      if (pontoAgora && destino && (destino.x !== pontoAgora.at.x || destino.y !== pontoAgora.at.y)) {
        aplicar([{ type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], terminalIds: [ponto.id], delta: { x: destino.x - pontoAgora.at.x, y: destino.y - pontoAgora.at.y }, manterJuncoes: false }]);
      }
    }
    if (ponto) pontosQueAndaram.add(ponto.id);
  }

  // ── 4: o eletroduto do ponto de força que andou ───────────────────────────────
  if (eletrica) {
    for (const id of pontosQueAndaram) {
      const p = agora(id);
      if (!p) continue;
      const ramal = ramalDoPonto(m, p);
      // Sem eletroduto, ou o ramal arrastado inteiro junto com a seleção: nada a refazer.
      if (ramal.length === 0 || ramal.every((t) => trechosMovidos.has(t))) continue;
      const circuito = (m.circuitos ?? []).find((c) => c.id === p.circuitoId);
      const quadro = circuito ? (m.quadros ?? []).find((q) => q.id === circuito.quadroId) : undefined;
      aplicar(ramal.map((trechoId) => ({ type: 'DeleteTrecho', trechoId }) as Command));
      if (quadro) aplicar(relancarEletrodutos(m, quadro, eletrica.eletroduto, eletrica.eletricas).comandos);
    }
  }

  // ── 3: a linha e o dreno do sistema, refeitos da posição nova ─────────────────
  const niveis = new Set((m.terminais ?? []).filter((t) => terminaisMovidos.has(t.id)).map((t) => t.levelId));
  for (const levelId of niveis) {
    const sistemas = sistemasDoNivel(m, levelId).filter((s) => terminaisMovidos.has(s.evaporadora.id) || terminaisMovidos.has(s.condensadora.id));
    if (sistemas.length === 0) continue;
    const trechos = new Set<ObjectId>();
    const terminais = new Set<ObjectId>();
    for (const s of sistemas) {
      const pecas = pecasDoSistemaParaRefazer(m, s, { linha: true, dreno: true });
      // A seleção levou o traçado inteiro junto: quem arrastou o conjunto manteve o caminho.
      if (pecas.trechos.length && pecas.trechos.every((id) => trechosMovidos.has(id))) continue;
      for (const id of pecas.trechos) if (!trechosMovidos.has(id)) trechos.add(id);
      for (const id of pecas.terminais) if (!terminaisMovidos.has(id)) terminais.add(id);
    }
    if (trechos.size === 0 && terminais.size === 0) continue;
    aplicar([
      ...[...terminais].map((terminalId) => ({ type: 'DeleteTerminal', terminalId }) as Command),
      ...[...trechos].map((trechoId) => ({ type: 'DeleteTrecho', trechoId }) as Command),
    ]);
    aplicar(planejarLinhasFrigorigenas(m, levelId, hip).comandos);
  }
  return lote;
}
