/**
 * LINHA FRIGORÍGENA E DRENO (05/10/2026, E5 do roadmap de climatização).
 *
 * Para cada evaporadora com SISTEMA (condensadora ligada, E3/E4):
 *  - E5.1 a LINHA: da evaporadora à condensadora pelo eixo das paredes
 *    (`arvorePelasParedes`, com o pilar como custo — o mesmo molde do eletroduto
 *    e do alimentador), na cota da linha; sobe da peça à cota da linha, corre,
 *    desce à cota da condensadora e sai para ela. UM trecho FRIGORIGENA com dois
 *    diâmetros (líquido = `bitolaMm`, sucção = `bitolaSuccaoMm`) e isolamento.
 *  - E5.2 o DIMENSIONAMENTO pela capacidade: `FAIXAS_DA_LINHA` (diâmetros,
 *    comprimento e desnível máximos, gás adicional por metro) — TABELA DE
 *    FABRICANTE, hipótese de pré-projeto, CONFERIR com o modelo real.
 *  - E5.3 as CURVAS: em cobre a mudança de direção é tubo CURVADO, não joelho —
 *    a conferência conta as curvas da linha e diz o raio mínimo por diâmetro
 *    (`RAIO_MINIMO_DA_CURVA`), sem campo novo no kernel: o raio é regra da
 *    dobra, e a dobra mora no NÓ entre dois trechos retos, não no trecho.
 *  - E5.4 o DRENO: da evaporadora ao PONTO DE DRENO mais próximo (ou a um ponto
 *    novo na fachada, junto da condensadora), por gravidade com a declividade
 *    mínima; quando o descarte fica ALTO demais para a queda, a BOMBA DE DRENO
 *    nasce junto da evaporadora e o dreno vira recalque (sem cobrança de
 *    declividade).
 *
 * Tudo nasce `sugerido`; relançar apaga as sugestões anteriores da linha e do
 * dreno no mesmo lote; aceitar fixa. Um lote = um Ctrl+Z.
 *
 * ⚠️ As pontas têm de cair EXATAMENTE em `(peça.at, peça.cotaMm)`: o nó da rede
 * é por coincidência exata (`conexoes.ts`), e é assim que a evaporadora conta
 * como peça no fim da linha (FRIGORIGENA) e do dreno (DRENO_AC).
 */
import type { BlueprintModel, Command, ObjectId, Point, Terminal, Trecho } from './blueprintKernel';
import { TIPOS_DE_CONDENSADORA, TIPOS_DE_EVAPORADORA, applyBatch } from './blueprintKernel';
import { conexoesDerivadas } from './blueprintKernel/conexoes';
import { comprimentoMm, fazerChave, menorCaminhoEntre, type Aresta, type No } from './blueprintGrafoDeRede';
import { arvorePelasParedes, chaveP, type P2 } from './blueprintRotaPelasParedes';
import { desvioDoPilar, pegadasDePilares } from './blueprintObstaculosEstruturais';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import type { HipotesesDaLinha } from './blueprintClimatizacao';
import type { ItemConferido } from './blueprintConferenciaClimatizacao';

// ─── E5.2: a tabela por capacidade (HIPÓTESE de fabricante) ──────────────────

export interface FaixaDaLinha {
  /** Capacidade máxima da faixa, BTU/h. */
  ateBtuH: number;
  /** Diâmetros de líquido e sucção, mm inteiros (1/4" = 6, 3/8" = 10, 1/2" = 13, 5/8" = 16, 3/4" = 19). */
  liquidoMm: number;
  succaoMm: number;
  /** Comprimento máximo da linha, m, e desnível máximo entre as unidades, m. */
  comprimentoMaxM: number;
  desnivelMaxM: number;
  /** Carga adicional de gás além da pré-carga, g por metro. */
  gasAdicionalGPorM: number;
}

/** Valores típicos de split hi-wall R-410A, transcritos de memória — CONFERIR com o catálogo do fabricante. */
export const FAIXAS_DA_LINHA: readonly FaixaDaLinha[] = [
  { ateBtuH: 12000, liquidoMm: 6, succaoMm: 10, comprimentoMaxM: 15, desnivelMaxM: 7, gasAdicionalGPorM: 15 },
  { ateBtuH: 18000, liquidoMm: 6, succaoMm: 13, comprimentoMaxM: 20, desnivelMaxM: 10, gasAdicionalGPorM: 20 },
  { ateBtuH: 24000, liquidoMm: 6, succaoMm: 16, comprimentoMaxM: 25, desnivelMaxM: 15, gasAdicionalGPorM: 30 },
  { ateBtuH: 36000, liquidoMm: 10, succaoMm: 16, comprimentoMaxM: 30, desnivelMaxM: 20, gasAdicionalGPorM: 35 },
  { ateBtuH: 60000, liquidoMm: 10, succaoMm: 19, comprimentoMaxM: 50, desnivelMaxM: 30, gasAdicionalGPorM: 50 },
];
export const FONTE_DAS_FAIXAS = 'Diâmetros, comprimentos, desníveis e carga de gás típicos de split R-410A, transcritos de memória — HIPÓTESE. CONFERIR com o catálogo do fabricante do modelo escolhido.';

/** A faixa da capacidade (a última cobre o que passar dela, com aviso de quem lê). */
export function faixaDaLinha(capacidadeBtuH: number | null | undefined): FaixaDaLinha {
  const cap = capacidadeBtuH ?? 0;
  return FAIXAS_DA_LINHA.find((f) => cap <= f.ateBtuH) ?? FAIXAS_DA_LINHA[FAIXAS_DA_LINHA.length - 1];
}

/** E5.3: raio mínimo de curvamento do cobre recozido, mm, por diâmetro externo — HIPÓTESE (≈ 4 × D). CONFERIR. */
export const RAIO_MINIMO_DA_CURVA: Record<number, number> = { 6: 30, 10: 40, 13: 50, 16: 65, 19: 80 };
export const raioMinimoDaCurvaMm = (dnMm: number): number => RAIO_MINIMO_DA_CURVA[dnMm] ?? Math.round(dnMm * 4);

export const isolamentoDaLinhaMm = (capacidadeBtuH: number | null | undefined, hip: HipotesesDaLinha): number => ((capacidadeBtuH ?? 0) <= 24000 ? hip.isolamentoAte24kMm : hip.isolamentoAcimaMm);

// ─── O sistema (evaporadora → condensadora) ──────────────────────────────────

export interface SistemaSplit {
  evaporadora: Terminal;
  condensadora: Terminal;
}

/**
 * E6 (05/10/2026): o rótulo dos trechos da árvore do VRF. Cada planejador só apaga
 * o que é SEU ao relançar — a linha do split não pode levar junto a árvore do VRF.
 */
export const ROTULO_DA_LINHA_VRF = 'Linha VRF';
const ehDoVrf = (t: Pick<Trecho, 'rotulo'>) => t.rotulo === ROTULO_DA_LINHA_VRF;

/** O sistema é de SPLIT (uma evaporadora, uma condensadora, uma linha). O VRF é a E6. */
export const ehSplit = (s: SistemaSplit) => s.condensadora.tipoHidraulico !== 'CONDENSADORA_VRF';

/** As evaporadoras do pavimento com condensadora (no mesmo pavimento — a prumada entre pavimentos é backlog). */
export function sistemasDoNivel(model: BlueprintModel, levelId: ObjectId): SistemaSplit[] {
  const porId = new Map((model.terminais ?? []).map((t) => [t.id, t]));
  return (model.terminais ?? [])
    .filter((t) => t.levelId === levelId && !!t.tipoHidraulico && (TIPOS_DE_EVAPORADORA as readonly string[]).includes(t.tipoHidraulico) && !!t.condensadoraId)
    .map((e) => ({ evaporadora: e, condensadora: porId.get(e.condensadoraId!)! }))
    .filter((s) => !!s.condensadora && s.condensadora.levelId === levelId && !!s.condensadora.tipoHidraulico && (TIPOS_DE_CONDENSADORA as readonly string[]).includes(s.condensadora.tipoHidraulico))
    .sort((a, b) => a.evaporadora.id.localeCompare(b.evaporadora.id));
}

/** As arestas (grafo) dos trechos existentes de uma disciplina. */
function arestasDe(model: BlueprintModel, disciplina: Trecho['disciplina']): Aresta[] {
  const chave = fazerChave(model.levels);
  return (model.trechos ?? [])
    .filter((t) => t.disciplina === disciplina)
    .map((t) => ({ ref: { existente: t.id } as const, de: chave(t.levelId, t.a.x, t.a.y, t.cotaAMm), para: chave(t.levelId, t.b.x, t.b.y, t.cotaBMm), mm: comprimentoMm(t) }));
}

const noDe = (model: BlueprintModel, t: Pick<Terminal, 'levelId' | 'at' | 'cotaMm'>): No => fazerChave(model.levels)(t.levelId, t.at.x, t.at.y, t.cotaMm);

/** A linha existente entre a evaporadora e a condensadora: comprimento, trechos e se algum é sugerido. */
export function linhaExistente(model: BlueprintModel, s: SistemaSplit): { mm: number; trechoIds: ObjectId[]; sugerida: boolean } | null {
  const arestas = arestasDe(model, 'FRIGORIGENA');
  const caminho = menorCaminhoEntre(noDe(model, s.evaporadora), noDe(model, s.condensadora), arestas);
  if (!caminho) return null;
  const ids = caminho.arestas.map((i) => (arestas[i].ref as { existente: ObjectId }).existente);
  const porId = new Map((model.trechos ?? []).map((t) => [t.id, t]));
  return { mm: caminho.mm, trechoIds: ids, sugerida: ids.some((id) => !!porId.get(id)?.sugerido) };
}

// ─── E5.1 + E5.4: o plano ────────────────────────────────────────────────────

export interface LinhaPlanejada {
  evaporadoraId: ObjectId;
  condensadoraId: ObjectId;
  nome: string;
  /** E6: `false` quando só o DRENO foi planejado (evaporadora de VRF, ou linha já confirmada). */
  linha: boolean;
  faixa: FaixaDaLinha;
  comprimentoMm: number;
  desnivelMm: number;
  /** O dreno: até onde, com bomba ou por gravidade. */
  dreno: { destino: 'PONTO_EXISTENTE' | 'PONTO_NOVO_NA_FACHADA'; comBomba: boolean; comprimentoMm: number } | null;
  avisos: string[];
}

export interface PlanoDaLinha {
  comandos: Command[];
  aCriar: LinhaPlanejada[];
  /** Sistemas cuja linha já existe CONFIRMADA (o planejador não mexe). */
  jaLigados: string[];
  semLugar: { nome: string; motivo: string }[];
  apagados: number;
  motivo: string | null;
  resumo: string[];
}

const mesmoP = (a: P2, b: P2) => a.x === b.x && a.y === b.y;

/** Um planejador de trechos com deduplicação por nó (o mesmo `addTrecho` do eletroduto). A E6 (VRF) usa o mesmo. */
export function lote(model: BlueprintModel) {
  const chave = fazerChave(model.levels);
  const comandos: Command[] = [];
  const arestas: Aresta[] = [];
  const vistas = new Set<string>();
  const add = (base: Omit<Extract<Command, { type: 'AddTrecho' }>, 'type' | 'a' | 'b' | 'cotaAMm' | 'cotaBMm'>, a: P2, cotaA: number, b: P2, cotaB: number) => {
    if (mesmoP(a, b) && cotaA === cotaB) return;
    const de = chave(base.levelId, a.x, a.y, cotaA);
    const para = chave(base.levelId, b.x, b.y, cotaB);
    const k = [de, para].sort().join('>');
    if (vistas.has(k)) return;
    vistas.add(k);
    comandos.push({ type: 'AddTrecho', ...base, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, cotaAMm: cotaA, cotaBMm: cotaB } as Command);
    arestas.push({ ref: { novo: comandos.length - 1 }, de, para, mm: comprimentoMm({ a, b, cotaAMm: cotaA, cotaBMm: cotaB }) });
  };
  return { comandos, arestas, add };
}

/** A polilinha em planta da peça `de` à peça `para`, pelo eixo das paredes; reta (com desvio de pilar) quando não há parede perto. */
function caminhoEmPlanta(model: BlueprintModel, levelId: ObjectId, de: P2, para: P2, hip: HipotesesDaLinha): { pontos: P2[]; pelaParede: boolean } {
  const paredes = model.walls.filter((w) => w.levelId === levelId);
  const pegadas = pegadasDePilares(model, levelId);
  const reta = (): P2[] => {
    const desvio = desvioDoPilar(de, para, pegadas) ?? [];
    return [de, ...desvio, para];
  };
  if (paredes.length === 0) return { pontos: reta(), pelaParede: false };
  const arvore = arvorePelasParedes({ paredes, raiz: de, pendentes: [para], raioDeEncaixeMm: hip.raioDeEncaixeMm, obstaculos: pegadas });
  const q1 = arvore.encaixe.get(chaveP(para));
  if (!arvore.raiz || !q1) return { pontos: reta(), pelaParede: false };
  // As duas peças diante do MESMO ponto da parede (a condensadora logo atrás da
  // evaporadora): o caminho fura a parede ali — peça → eixo → peça.
  if (arvore.arestas.length === 0) {
    if (!mesmoP(arvore.raiz, q1)) return { pontos: reta(), pelaParede: false };
    const pontos: P2[] = [de];
    if (!mesmoP(de, arvore.raiz)) pontos.push(arvore.raiz);
    if (!mesmoP(q1, para)) pontos.push(para);
    return { pontos, pelaParede: true };
  }
  // Encadeia as arestas da raiz ao encaixe do destino (a árvore tem um pendente só: é um caminho).
  const pontos: P2[] = [de];
  if (!mesmoP(de, arvore.raiz)) pontos.push(arvore.raiz);
  let atual = arvore.raiz;
  const restantes = [...arvore.arestas];
  for (let guarda = 0; guarda < 10_000 && restantes.length > 0 && !mesmoP(atual, q1); guarda++) {
    const i = restantes.findIndex((a) => mesmoP(a.de, atual) || mesmoP(a.para, atual));
    if (i < 0) break;
    const a = restantes.splice(i, 1)[0];
    atual = mesmoP(a.de, atual) ? a.para : a.de;
    pontos.push(atual);
  }
  if (!mesmoP(atual, q1)) return { pontos: reta(), pelaParede: false };
  if (!mesmoP(q1, para)) pontos.push(para);
  return { pontos, pelaParede: true };
}

/** O ponto de dreno (DRENO_AC) mais perto da evaporadora, no pavimento. */
function pontoDeDrenoMaisPerto(model: BlueprintModel, evap: Terminal): Terminal | null {
  const pontos = (model.terminais ?? []).filter((t) => t.levelId === evap.levelId && t.disciplina === 'DRENO_AC' && t.tipoHidraulico === 'PONTO_DRENO' && !t.sugerida);
  if (pontos.length === 0) return null;
  return pontos.reduce((m, t) => (Math.hypot(t.at.x - evap.at.x, t.at.y - evap.at.y) < Math.hypot(m.at.x - evap.at.x, m.at.y - evap.at.y) ? t : m));
}

/** O dreno da evaporadora já chega a um ponto de dreno ou a uma bomba de dreno pela rede DRENO_AC? */
function drenoDaEvaporadora(model: BlueprintModel, e: Terminal): boolean {
  const arestas = arestasDe(model, 'DRENO_AC');
  if (arestas.length === 0) return false;
  const de = noDe(model, e);
  return (model.terminais ?? [])
    .filter((t) => t.levelId === e.levelId && (t.tipoHidraulico === 'PONTO_DRENO' || t.tipoHidraulico === 'BOMBA_DRENO'))
    .some((t) => !!menorCaminhoEntre(de, noDe(model, t), arestas));
}

/** O plano da linha e do dreno de todos os sistemas do pavimento. */
export function planejarLinhasFrigorigenas(model: BlueprintModel, levelId: ObjectId, hip: HipotesesDaLinha): PlanoDaLinha {
  const vazio = (motivo: string, apagar: Command[] = []): PlanoDaLinha => ({ comandos: apagar, aCriar: [], jaLigados: [], semLugar: [], apagados: apagar.length, motivo, resumo: [] });
  // Relançar apaga o que este planejador sugeriu antes: trechos da linha do SPLIT e do dreno e as peças de
  // dreno sugeridas. A árvore do VRF (rótulo próprio) é da E6 e fica.
  const sugeridos = (model.trechos ?? []).filter((t) => t.levelId === levelId && !!t.sugerido && ((t.disciplina === 'FRIGORIGENA' && !ehDoVrf(t)) || t.disciplina === 'DRENO_AC'));
  const pecasSugeridas = (model.terminais ?? []).filter((t) => t.levelId === levelId && !!t.sugerida && t.disciplina === 'DRENO_AC' && (t.tipoHidraulico === 'PONTO_DRENO' || t.tipoHidraulico === 'BOMBA_DRENO'));
  const apagar: Command[] = [
    ...sugeridos.map((t) => ({ type: 'DeleteTrecho', trechoId: t.id }) as Command),
    ...pecasSugeridas.map((t) => ({ type: 'DeleteTerminal', terminalId: t.id }) as Command),
  ];
  const sistemas = sistemasDoNivel(model, levelId);
  if (sistemas.length === 0) return vazio('nenhuma evaporadora com condensadora ligada neste pavimento — lance o split (Seleção e posição) ou ligue o sistema no painel da peça', apagar);

  // O modelo SEM as sugestões anteriores é o que decide "já ligado" e por onde a nova linha passa.
  const idsApagados = new Set([...sugeridos.map((t) => t.id), ...pecasSugeridas.map((t) => t.id)]);
  const base: BlueprintModel = { ...model, trechos: (model.trechos ?? []).filter((t) => !idsApagados.has(t.id)), terminais: (model.terminais ?? []).filter((t) => !idsApagados.has(t.id)) };

  const l = lote(base);
  const aCriar: LinhaPlanejada[] = [];
  const jaLigados: string[] = [];
  const semLugar: { nome: string; motivo: string }[] = [];
  /** Peças novas (ponto de dreno / bomba) na ordem em que entram no lote. */
  const pecas: Command[] = [];
  const dnDreno = Math.round(hip.dnDrenoMm);
  const medCond = FICHA_DO_PONTO_HIDRAULICO.CONDENSADORA_SPLIT.medidasMm ?? { larguraMm: 850, profundidadeMm: 330, alturaMm: 700 };

  for (const s of sistemas) {
    const nome = `${s.evaporadora.tipo}`;
    const e = s.evaporadora;
    const c = s.condensadora;
    // E6: a LINHA é só do split (o VRF tem a árvore da E6); o DRENO é de TODA evaporadora com
    // sistema. Cada um só é planejado se ainda não existe confirmado — `base` já não tem sugeridos.
    const precisaLinha = ehSplit(s) && !linhaExistente(base, s);
    const precisaDreno = !drenoDaEvaporadora(base, e);
    if (!precisaLinha && !precisaDreno) {
      jaLigados.push(nome);
      continue;
    }
    const faixa = faixaDaLinha(s.evaporadora.capacidadeBtuH ?? s.condensadora.capacidadeBtuH);
    const isolamentoMm = isolamentoDaLinhaMm(s.evaporadora.capacidadeBtuH ?? s.condensadora.capacidadeBtuH, hip);
    const avisos: string[] = [];
    const cotaLinha = Math.round(hip.cotaDaLinhaMm);
    let comprimento = 0;
    const desnivel = Math.abs(e.cotaMm - c.cotaMm);
    if (precisaLinha) {
      const caminho = caminhoEmPlanta(base, levelId, s.evaporadora.at, s.condensadora.at, hip);
      if (!caminho.pelaParede) avisos.push('sem parede ao alcance: a linha vai em reta (desviando de pilar)');
      const baseLinha = { levelId, disciplina: 'FRIGORIGENA' as const, bitolaMm: faixa.liquidoMm, bitolaSuccaoMm: faixa.succaoMm, isolamentoMm, sugerido: true };
      // Sobe da evaporadora à cota da linha, corre, desce à condensadora.
      const p = caminho.pontos;
      const antes = l.comandos.length;
      l.add(baseLinha, e.at, e.cotaMm, e.at, cotaLinha);
      for (let i = 0; i + 1 < p.length; i++) l.add(baseLinha, p[i], cotaLinha, p[i + 1], cotaLinha);
      l.add(baseLinha, c.at, cotaLinha, c.at, c.cotaMm);
      comprimento = l.arestas.slice(antes).reduce((acc, a) => acc + a.mm, 0);
    }
    if (!precisaDreno) {
      aCriar.push({ evaporadoraId: e.id, condensadoraId: c.id, nome, linha: precisaLinha, faixa, comprimentoMm: comprimento, desnivelMm: desnivel, dreno: null, avisos });
      continue;
    }
    // E5.4 — o DRENO: ao ponto de dreno existente mais perto, senão a um ponto novo na fachada, junto da condensadora.
    const existentePonto = pontoDeDrenoMaisPerto(base, e);
    let destinoAt: P2;
    let destinoCota: number;
    let destino: 'PONTO_EXISTENTE' | 'PONTO_NOVO_NA_FACHADA';
    if (existentePonto) {
      destinoAt = existentePonto.at;
      destinoCota = existentePonto.cotaMm;
      destino = 'PONTO_EXISTENTE';
    } else {
      // Ao LADO da condensadora (meia largura + 200 mm ao longo da parede — a mesma distância da
      // parede que ela, para a rota ainda encaixar no eixo), no piso.
      const dx = c.at.x - e.at.x;
      const dy = c.at.y - e.at.y;
      const d = Math.hypot(dx, dy) || 1;
      const lateral = medCond.larguraMm / 2 + 200;
      destinoAt = { x: Math.round(c.at.x + (-dy / d) * lateral), y: Math.round(c.at.y + (dx / d) * lateral) };
      destinoCota = 0;
      destino = 'PONTO_NOVO_NA_FACHADA';
      pecas.push({ type: 'AddTerminal', levelId, disciplina: 'DRENO_AC', tipo: 'Ponto de dreno', tipoHidraulico: 'PONTO_DRENO', at: destinoAt, cotaMm: 0, sugerida: true } as Command);
    }
    const caminhoDreno = caminhoEmPlanta(base, levelId, e.at, destinoAt, hip);
    const pontosD = caminhoDreno.pontos;
    // A queda de CADA lance arredondada para cima (mm inteiros): assim nenhum lance fica abaixo da
    // declividade por arredondamento, e a soma é a queda que o descarte precisa oferecer.
    const lances = pontosD.slice(1).map((q, i) => Math.hypot(q.x - pontosD[i].x, q.y - pontosD[i].y));
    const quedas = lances.map((l) => Math.ceil((l * hip.declividadeDrenoPct) / 100));
    const quedaNecessaria = quedas.reduce((acc, q) => acc + q, 0);
    // A base da evaporadora é por onde o condensado sai; a ponta do dreno fica no nó da peça (coincidência exata).
    const cotaSaida = e.cotaMm;
    const comBomba = cotaSaida - quedaNecessaria < destinoCota;
    const baseDreno = { levelId, disciplina: 'DRENO_AC' as const, bitolaMm: dnDreno, sugerido: true };
    const antesD = l.comandos.length;
    if (comBomba) {
      // Recalque: a bomba junto da evaporadora (30 cm ao longo do primeiro lance), e o dreno sobe o que precisar.
      const q0 = pontosD.length > 1 ? pontosD[1] : destinoAt;
      const dd = Math.hypot(q0.x - e.at.x, q0.y - e.at.y) || 1;
      const bombaAt = { x: Math.round(e.at.x + ((q0.x - e.at.x) / dd) * Math.min(300, dd)), y: Math.round(e.at.y + ((q0.y - e.at.y) / dd) * Math.min(300, dd)) };
      pecas.push({ type: 'AddTerminal', levelId, disciplina: 'DRENO_AC', tipo: 'Bomba de dreno', tipoHidraulico: 'BOMBA_DRENO', at: bombaAt, cotaMm: cotaSaida, sugerida: true } as Command);
      l.add(baseDreno, e.at, cotaSaida, bombaAt, cotaSaida);
      let atual: P2 = bombaAt;
      let cota = cotaSaida;
      // Sobe/desce em linha até a cota do destino ao longo do caminho (recalque não tem declividade).
      const resto = [...pontosD.slice(1)];
      const total = resto.reduce((acc, q, i) => acc + Math.hypot(q.x - (i === 0 ? bombaAt : resto[i - 1]).x, q.y - (i === 0 ? bombaAt : resto[i - 1]).y), 0) || 1;
      let andado = 0;
      for (const q of resto) {
        andado += Math.hypot(q.x - atual.x, q.y - atual.y);
        const cotaQ = mesmoP(q, destinoAt) ? destinoCota : Math.round(cotaSaida + ((destinoCota - cotaSaida) * andado) / total);
        l.add(baseDreno, atual, cota, q, cotaQ);
        atual = q;
        cota = cotaQ;
      }
      avisos.push('descarte acima da queda possível: bomba de dreno junto da evaporadora (recalque)');
    } else {
      // Gravidade: cada lance desce a sua queda; o último cai na cota do destino (que está abaixo, pela conta acima).
      let atual: P2 = e.at;
      let cota = cotaSaida;
      pontosD.slice(1).forEach((q, i, arr) => {
        const ultimo = i === arr.length - 1;
        const cotaQ = ultimo ? destinoCota : cota - quedas[i];
        l.add(baseDreno, atual, cota, q, cotaQ);
        atual = q;
        cota = cotaQ;
      });
    }
    const comprimentoDreno = l.arestas.slice(antesD).reduce((acc, a) => acc + a.mm, 0);
    aCriar.push({ evaporadoraId: e.id, condensadoraId: c.id, nome, linha: precisaLinha, faixa, comprimentoMm: comprimento, desnivelMm: desnivel, dreno: { destino, comBomba, comprimentoMm: comprimentoDreno }, avisos });
  }

  if (aCriar.length === 0) {
    const motivo = jaLigados.length ? 'todas as evaporadoras já têm linha (split) e dreno confirmados' : null;
    return { comandos: apagar, aCriar: [], jaLigados, semLugar, apagados: apagar.length, motivo, resumo: [] };
  }
  // Prova na cópia: o lote aplica?
  const comandos = [...apagar, ...pecas, ...l.comandos];
  try {
    applyBatch(model, comandos);
  } catch (err) {
    return vazio(`o plano não aplica: ${err instanceof Error ? err.message : String(err)}`, apagar);
  }
  const m1 = (mm: number) => (mm / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const resumo = aCriar.map((x) => {
    const linha = x.linha ? `linha ${m1(x.comprimentoMm)} m (Ø ${x.faixa.liquidoMm}/${x.faixa.succaoMm} mm, máx. ${x.faixa.comprimentoMaxM} m)` : '';
    const dreno = x.dreno ? `dreno ${m1(x.dreno.comprimentoMm)} m ${x.dreno.comBomba ? 'com bomba' : 'por gravidade'} ${x.dreno.destino === 'PONTO_EXISTENTE' ? 'ao ponto de dreno' : 'a um ponto novo na fachada'}` : '';
    return `${x.nome}: ${[linha, dreno].filter(Boolean).join(' · ')}${x.avisos.length ? ` — ${x.avisos.join('; ')}` : ''}`;
  });
  return { comandos, aCriar, jaLigados, semLugar, apagados: apagar.length, motivo: null, resumo };
}

// ─── E5.2 + E5.3: a conferência da linha ─────────────────────────────────────

export interface LinhaConferida {
  evaporadoraId: ObjectId;
  condensadoraId: ObjectId;
  nome: string;
  capacidadeBtuH: number | null;
  faixa: FaixaDaLinha;
  comprimentoM: number | null;
  desnivelM: number;
  /** Diâmetros encontrados na linha (líquido / sucção), e os que a faixa pede. */
  dnLiquidoMm: number[];
  dnSuccaoMm: number[];
  isolamentoMinMm: number | null;
  gasAdicionalG: number | null;
  curvas: number;
  raioMinimoMm: number;
  pendencias: string[];
}

/** Cada sistema do pavimento conferido contra a faixa da capacidade. */
export function linhasConferidas(model: BlueprintModel, levelId: ObjectId, hip: HipotesesDaLinha): LinhaConferida[] {
  const porId = new Map((model.trechos ?? []).map((t) => [t.id, t]));
  const cx = conexoesDerivadas(model);
  // E6: só os sistemas de SPLIT — a árvore do VRF tem a sua conferência (`blueprintVrf.ts`).
  return sistemasDoNivel(model, levelId).filter(ehSplit).map((s) => {
    const cap = s.evaporadora.capacidadeBtuH ?? s.condensadora.capacidadeBtuH ?? null;
    const faixa = faixaDaLinha(cap);
    const linha = linhaExistente(model, s);
    const trechos = linha ? linha.trechoIds.map((id) => porId.get(id)!).filter(Boolean) : [];
    const pend: string[] = [];
    if (!linha) pend.push('sem linha entre a evaporadora e a condensadora');
    const comprimentoM = linha ? linha.mm / 1000 : null;
    if (comprimentoM != null && comprimentoM > faixa.comprimentoMaxM) pend.push(`linha de ${comprimentoM.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m acima do máximo de ${faixa.comprimentoMaxM} m da faixa`);
    const desnivelM = Math.abs(s.evaporadora.cotaMm - s.condensadora.cotaMm) / 1000;
    if (desnivelM > faixa.desnivelMaxM) pend.push(`desnível de ${desnivelM.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m acima do máximo de ${faixa.desnivelMaxM} m`);
    const dnLiquidoMm = [...new Set(trechos.map((t) => t.bitolaMm))].sort((a, b) => a - b);
    const dnSuccaoMm = [...new Set(trechos.map((t) => t.bitolaSuccaoMm ?? t.bitolaMm))].sort((a, b) => a - b);
    if (trechos.length && (dnLiquidoMm.some((d) => d < faixa.liquidoMm) || dnSuccaoMm.some((d) => d < faixa.succaoMm))) pend.push(`diâmetros abaixo da faixa (pede ${faixa.liquidoMm}/${faixa.succaoMm} mm)`);
    const isolamentoMinMm = trechos.length ? Math.min(...trechos.map((t) => t.isolamentoMm ?? 0)) : null;
    const isolamentoPedido = isolamentoDaLinhaMm(cap, hip);
    if (isolamentoMinMm != null && isolamentoMinMm < isolamentoPedido) pend.push(`isolamento de ${isolamentoMinMm} mm abaixo de ${isolamentoPedido} mm`);
    const gasAdicionalG = comprimentoM == null ? null : Math.round(Math.max(0, comprimentoM - hip.preCargaM) * faixa.gasAdicionalGPorM);
    const ids = new Set(trechos.map((t) => t.id));
    const curvas = cx.conexoes.filter((c) => c.disciplina === 'FRIGORIGENA' && (c.tipo === 'JOELHO_90' || c.tipo === 'JOELHO_45') && c.trechoIds.every((id) => ids.has(id))).length;
    const raioMinimoMm = raioMinimoDaCurvaMm(Math.max(faixa.succaoMm, ...dnSuccaoMm));
    if (cap == null) pend.push('capacidade não declarada — a faixa usada é a menor');
    return { evaporadoraId: s.evaporadora.id, condensadoraId: s.condensadora.id, nome: s.evaporadora.tipo, capacidadeBtuH: cap, faixa, comprimentoM, desnivelM, dnLiquidoMm, dnSuccaoMm, isolamentoMinMm, gasAdicionalG, curvas, raioMinimoMm, pendencias: pend };
  });
}

/** O dreno de cada evaporadora: chega a um ponto de dreno? por gravidade ou bomba? */
export function drenosConferidos(model: BlueprintModel, levelId: ObjectId): { evaporadoraId: ObjectId; nome: string; chega: boolean; comBomba: boolean }[] {
  const arestas = arestasDe(model, 'DRENO_AC');
  const pontos = (model.terminais ?? []).filter((t) => t.levelId === levelId && t.tipoHidraulico === 'PONTO_DRENO');
  const bombas = (model.terminais ?? []).filter((t) => t.levelId === levelId && t.tipoHidraulico === 'BOMBA_DRENO');
  return (model.terminais ?? [])
    .filter((t) => t.levelId === levelId && !!t.tipoHidraulico && (TIPOS_DE_EVAPORADORA as readonly string[]).includes(t.tipoHidraulico))
    .map((e) => {
      const de = noDe(model, e);
      const chega = pontos.some((p) => !!menorCaminhoEntre(de, noDe(model, p), arestas));
      const comBomba = bombas.some((b) => !!menorCaminhoEntre(de, noDe(model, b), arestas));
      return { evaporadoraId: e.id, nome: e.tipo, chega, comBomba };
    });
}

/** A conferência em 3 estados (mesmo molde da carga e da seleção). */
export function conferenciaDaLinha(model: BlueprintModel, levelId: ObjectId, hip: HipotesesDaLinha): ItemConferido[] {
  const linhas = linhasConferidas(model, levelId, hip);
  const drenos = drenosConferidos(model, levelId);
  const itens: ItemConferido[] = [];
  const nomes = (xs: { nome: string }[]) => xs.map((x) => x.nome).join(', ');
  if (linhas.length === 0) {
    itens.push({ codigo: 'LINHA', item: 'Linha frigorígena entre cada evaporadora e sua condensadora', estado: 'NAO_AVALIADO', obtido: 'nenhum sistema (evaporadora com condensadora) no pavimento', spaceIds: [] });
    return itens;
  }
  const semLinha = linhas.filter((l) => l.comprimentoM == null);
  itens.push({ codigo: 'LINHA', item: 'Linha frigorígena entre cada evaporadora e sua condensadora', estado: semLinha.length ? 'FALTA' : 'OK', obtido: semLinha.length ? `sem linha: ${nomes(semLinha)}` : `${linhas.length} linha(s)`, spaceIds: [] });
  const comLinha = linhas.filter((l) => l.comprimentoM != null);
  const longas = comLinha.filter((l) => l.comprimentoM! > l.faixa.comprimentoMaxM);
  const altas = linhas.filter((l) => l.desnivelM > l.faixa.desnivelMaxM);
  itens.push({ codigo: 'LIMITES', item: 'Comprimento e desnível dentro da faixa do fabricante (hipótese — CONFERIR)', estado: comLinha.length === 0 ? 'NAO_AVALIADO' : longas.length || altas.length ? 'FALTA' : 'OK', obtido: comLinha.length === 0 ? 'sem linha a medir' : [longas.length ? `acima do comprimento: ${nomes(longas)}` : '', altas.length ? `acima do desnível: ${nomes(altas)}` : ''].filter(Boolean).join('; ') || comLinha.map((l) => `${l.nome} ${l.comprimentoM!.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m / ${l.faixa.comprimentoMaxM} m`).join('; '), spaceIds: [] });
  const finas = comLinha.filter((l) => l.pendencias.some((p) => /diâmetros abaixo/.test(p)));
  const pouco = comLinha.filter((l) => l.pendencias.some((p) => /isolamento/.test(p)));
  itens.push({ codigo: 'DIAMETROS', item: 'Diâmetros de líquido/sucção e isolamento pela capacidade', estado: comLinha.length === 0 ? 'NAO_AVALIADO' : finas.length ? 'FALTA' : pouco.length ? 'AVISO' : 'OK', obtido: comLinha.length === 0 ? 'sem linha' : [finas.length ? `diâmetro abaixo: ${nomes(finas)}` : '', pouco.length ? `isolamento abaixo: ${nomes(pouco)}` : ''].filter(Boolean).join('; ') || comLinha.map((l) => `${l.nome} Ø ${l.dnLiquidoMm.join('/')}·${l.dnSuccaoMm.join('/')} mm, isol. ${l.isolamentoMinMm} mm`).join('; '), spaceIds: [] });
  const gas = comLinha.reduce((acc, l) => acc + (l.gasAdicionalG ?? 0), 0);
  itens.push({ codigo: 'GAS', item: `Carga adicional de gás além dos ${hip.preCargaM} m de pré-carga`, estado: comLinha.length === 0 ? 'NAO_AVALIADO' : 'OK', obtido: comLinha.length === 0 ? 'sem linha' : gas > 0 ? `${gas.toLocaleString('pt-BR')} g no total (${comLinha.map((l) => `${l.nome} ${l.gasAdicionalG} g`).join('; ')})` : 'dentro da pré-carga', spaceIds: [] });
  const curvas = comLinha.reduce((acc, l) => acc + l.curvas, 0);
  itens.push({ codigo: 'CURVAS', item: 'Curvas da linha (cobre curvado, não joelho) com raio mínimo por diâmetro', estado: comLinha.length === 0 ? 'NAO_AVALIADO' : curvas > 0 ? 'AVISO' : 'OK', obtido: comLinha.length === 0 ? 'sem linha' : curvas > 0 ? `${curvas} curva(s); raio mínimo ${comLinha.map((l) => `${l.nome} ${l.raioMinimoMm} mm`).join('; ')} — HIPÓTESE, CONFERIR` : 'sem mudança de direção', spaceIds: [] });
  const semDreno = drenos.filter((d) => !d.chega);
  itens.push({ codigo: 'DRENO', item: 'Dreno de condensado de cada evaporadora até um ponto de dreno', estado: drenos.length === 0 ? 'NAO_AVALIADO' : semDreno.length ? 'FALTA' : 'OK', obtido: drenos.length === 0 ? 'nenhuma evaporadora' : semDreno.length ? `sem dreno: ${nomes(semDreno)}` : `${drenos.length} dreno(s)${drenos.some((d) => d.comBomba) ? ` — ${drenos.filter((d) => d.comBomba).length} com bomba` : ''}`, spaceIds: [] });
  return itens;
}

// ─── E5.4: a declividade do dreno, trecho a trecho (para a verificação) ──────

export interface TrechoDeDrenoCalculado {
  trechoId: ObjectId;
  levelId: ObjectId;
  /** `null` na prumada (sem comprimento em planta) e na rede com bomba (recalque). */
  declividadePct: number | null;
  declividadeMinimaPct: number;
}

/** Declividade mínima do dreno por gravidade, % — HIPÓTESE (CONFERIR com a boa prática do fabricante). */
export const DECLIVIDADE_MINIMA_DO_DRENO_PCT = 1;

/**
 * Cada trecho DRENO_AC com a declividade real (|Δcota| / planta) e a mínima; a
 * rede que tem BOMBA_DRENO ligada é recalque e não tem declividade a cobrar.
 */
export function drenosTrechoATrecho(model: BlueprintModel, minimaPct = DECLIVIDADE_MINIMA_DO_DRENO_PCT): TrechoDeDrenoCalculado[] {
  const drenos = (model.trechos ?? []).filter((t) => t.disciplina === 'DRENO_AC');
  if (drenos.length === 0) return [];
  const arestas = arestasDe(model, 'DRENO_AC');
  const chave = fazerChave(model.levels);
  const nosComBomba = (model.terminais ?? []).filter((t) => t.tipoHidraulico === 'BOMBA_DRENO').map((b) => noDe(model, b));
  return drenos.map((t) => {
    const de = chave(t.levelId, t.a.x, t.a.y, t.cotaAMm);
    const recalque = nosComBomba.some((b) => !!menorCaminhoEntre(de, b, arestas));
    const planta = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
    const declividadePct = recalque || planta < 1 ? null : (Math.abs(t.cotaAMm - t.cotaBMm) / planta) * 100;
    return { trechoId: t.id, levelId: t.levelId, declividadePct, declividadeMinimaPct: minimaPct };
  });
}

export type { Point };
