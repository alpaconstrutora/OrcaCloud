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
 *    (`raioMinimoDaCurvaMm`; F1, 10/10/2026: em DIÂMETROS, premissa editável
 *    `raioDaCurvaEmDiametros`), sem campo novo no kernel: o raio é regra da
 *    dobra, e a dobra mora no NÓ entre dois trechos retos, não no trecho.
 *  - E5.4 o DRENO: da evaporadora ao PONTO DE DRENO mais próximo (ou a um ponto
 *    novo na fachada, junto da condensadora), por gravidade com a declividade
 *    mínima; quando o descarte fica ALTO demais para a queda, a BOMBA DE DRENO
 *    nasce junto da evaporadora e o dreno vira recalque (sem cobrança de
 *    declividade).
 *
 * Pendências C1/C5/C6 (10/10/2026):
 *  - C1 a PRUMADA: a condensadora em OUTRO pavimento (a do split na cobertura) —
 *    a linha corre no pavimento da evaporadora até a prumada (num shaft perto da
 *    condensadora, ou sob/sobre ela) e sobe ou desce por ela
 *    (`blueprintPrumadaClimatizacao.ts`). Relançar apaga a linha sugerida do
 *    pavimento ONDE ela estiver: o grupo de trechos que toca a evaporadora daqui.
 *  - C5 o DN do dreno pela VAZÃO de condensado: a capacidade de cada evaporadora
 *    a montante × `condensadoLhPorKbtu`, pela tabela `DN_DO_DRENO_PELA_VAZAO`
 *    (HIPÓTESE, CONFERIR), nunca abaixo do DN mínimo das premissas.
 *  - C6 o SIFÃO: no dreno por gravidade, a `distanciaDoSifaoMm` da saída da
 *    evaporadora (a bomba de dreno tem o dela).
 *
 * Tudo nasce `sugerido`; relançar apaga as sugestões anteriores da linha e do
 * dreno no mesmo lote; aceitar fixa. Um lote = um Ctrl+Z.
 *
 * ⚠️ As pontas têm de cair EXATAMENTE em `(peça.at, peça.cotaMm)`: o nó da rede
 * é por coincidência exata (`conexoes.ts`), e é assim que a evaporadora conta
 * como peça no fim da linha (FRIGORIGENA) e do dreno (DRENO_AC).
 */
import type { BlueprintModel, Command, ObjectId, Point, Terminal, Trecho, Wall } from './blueprintKernel';
import { TIPOS_DE_CONDENSADORA, TIPOS_DE_EVAPORADORA, applyBatch, envelopeDoTrecho, pointInPolygon } from './blueprintKernel';
import { conexoesDerivadas } from './blueprintKernel/conexoes';
import { comprimentoMm, fazerChave, menorCaminhoEntre, type Aresta, type No } from './blueprintGrafoDeRede';
import { arvorePelasParedes, chaveP, encaixarNaParede, type P2 } from './blueprintRotaPelasParedes';
import { ABAIXO_DA_VIGA_MM, CONTORNO_DO_PILAR_MM, desvioDoPilar, fundoDaVigaMaisBaixaMm, pegadasDePilares } from './blueprintObstaculosEstruturais';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { componentesSugeridos, lancesDaPrumada, pavimentosEntre, pontoDaPrumada } from './blueprintPrumadaClimatizacao';
import { HIPOTESES_DA_LINHA_PADRAO, type HipotesesDaLinha } from './blueprintClimatizacao';
import { PENALIDADE_DO_CONTORNO_NO_FORRO_MM, cotaDaFaixa, encaixaNoAnel, fundoDaVigaSobre, paredesDoForro, prumadasQueCruzam, type FaixaDoForro } from './blueprintRotaPeloForro';
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
/**
 * F1 (10/10/2026): o raio mínimo = o diâmetro × `emDiametros` (premissa da linha,
 * 4 de partida — HIPÓTESE, CONFERIR com o fabricante do curvador), arredondado
 * para cima de 5 em 5 mm. Antes era uma tabela fixa no código.
 */
export const raioMinimoDaCurvaMm = (dnMm: number, emDiametros: number = HIPOTESES_DA_LINHA_PADRAO.raioDaCurvaEmDiametros): number => Math.ceil((dnMm * emDiametros) / 5) * 5;

export const isolamentoDaLinhaMm = (capacidadeBtuH: number | null | undefined, hip: HipotesesDaLinha): number => ((capacidadeBtuH ?? 0) <= 24000 ? hip.isolamentoAte24kMm : hip.isolamentoAcimaMm);

/**
 * C5 (10/10/2026): o DN do dreno de condensado pela vazão que passa no trecho,
 * L/h — valores típicos para tubo de PVC com a declividade mínima, transcritos de
 * memória: HIPÓTESE, CONFERIR. O DN mínimo das premissas vale por cima.
 */
export const DN_DO_DRENO_PELA_VAZAO: readonly { ateLh: number; dnMm: number }[] = [
  { ateLh: 10, dnMm: 20 },
  { ateLh: 30, dnMm: 25 },
  { ateLh: 70, dnMm: 32 },
  { ateLh: 150, dnMm: 40 },
  { ateLh: Infinity, dnMm: 50 },
];
export const FONTE_DO_DN_DO_DRENO = 'DN do dreno pela vazão de condensado (L/h por 1.000 BTU/h das evaporadoras a montante) — tabela típica transcrita de memória: HIPÓTESE, CONFERIR. O DN mínimo das premissas vale por cima.';

/** A vazão de condensado de uma evaporadora, L/h (sem capacidade declarada = 0: o DN sai pelo mínimo). */
export const condensadoDaEvaporadoraLh = (e: Pick<Terminal, 'capacidadeBtuH'>, hip: HipotesesDaLinha): number => ((e.capacidadeBtuH ?? 0) / 1000) * hip.condensadoLhPorKbtu;

/** O DN do dreno para a vazão, nunca abaixo do mínimo das premissas. */
export function dnDoDrenoMm(vazaoLh: number, hip: HipotesesDaLinha): number {
  const pela = (DN_DO_DRENO_PELA_VAZAO.find((f) => vazaoLh <= f.ateLh) ?? DN_DO_DRENO_PELA_VAZAO[DN_DO_DRENO_PELA_VAZAO.length - 1]).dnMm;
  return Math.max(Math.round(hip.dnDrenoMm), pela);
}

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

/**
 * As evaporadoras do pavimento com condensadora. C1 (10/10/2026): a condensadora
 * pode estar em OUTRO pavimento — a linha sobe/desce pela prumada.
 */
export function sistemasDoNivel(model: BlueprintModel, levelId: ObjectId): SistemaSplit[] {
  const porId = new Map((model.terminais ?? []).map((t) => [t.id, t]));
  return (model.terminais ?? [])
    .filter((t) => t.levelId === levelId && !!t.tipoHidraulico && (TIPOS_DE_EVAPORADORA as readonly string[]).includes(t.tipoHidraulico) && !!t.condensadoraId)
    .map((e) => ({ evaporadora: e, condensadora: porId.get(e.condensadoraId!)! }))
    .filter((s) => !!s.condensadora && !!s.condensadora.tipoHidraulico && (TIPOS_DE_CONDENSADORA as readonly string[]).includes(s.condensadora.tipoHidraulico))
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

/** C1: o desnível entre as duas peças em cota de MUNDO (elevação do pavimento + cota), mm. */
export function desnivelDoSistemaMm(model: BlueprintModel, s: SistemaSplit): number {
  const elevacao = (id: ObjectId) => model.levels.find((l) => l.id === id)?.elevationMm ?? 0;
  return Math.abs(elevacao(s.evaporadora.levelId) + s.evaporadora.cotaMm - (elevacao(s.condensadora.levelId) + s.condensadora.cotaMm));
}

/**
 * C1: os trechos sugeridos da linha do SPLIT que são deste pavimento — o grupo
 * conexo (pela chave de mundo) que toca uma evaporadora DAQUI, onde quer que os
 * trechos estejam (a prumada atravessa outros pavimentos), e os grupos sem
 * evaporadora nenhuma que têm um trecho aqui. O grupo de uma evaporadora de
 * OUTRO pavimento fica, mesmo com trecho aqui: é a linha dela.
 */
export function linhaSugeridaDoNivel(model: BlueprintModel, levelId: ObjectId): Trecho[] {
  const candidatos = (model.trechos ?? []).filter((t) => !!t.sugerido && t.disciplina === 'FRIGORIGENA' && !ehDoVrf(t));
  if (candidatos.length === 0) return [];
  const evaporadoras = (model.terminais ?? []).filter((t) => !!t.tipoHidraulico && (TIPOS_DE_EVAPORADORA as readonly string[]).includes(t.tipoHidraulico));
  const nivelDoNo = new Map<No, Set<ObjectId>>();
  for (const e of evaporadoras) {
    const k = noDe(model, e);
    nivelDoNo.set(k, new Set([...(nivelDoNo.get(k) ?? []), e.levelId]));
  }
  return componentesSugeridos(model, candidatos).flatMap((g) => {
    const donos = new Set([...g.nos].flatMap((n) => [...(nivelDoNo.get(n) ?? [])]));
    const doNivel = donos.has(levelId) || (donos.size === 0 && g.trechos.some((t) => t.levelId === levelId));
    return doNivel ? g.trechos : [];
  });
}

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
  dreno: { destino: 'PONTO_EXISTENTE' | 'PONTO_NOVO_NA_FACHADA'; comBomba: boolean; comprimentoMm: number; /** C6. */ comSifao: boolean } | null;
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

/**
 * Um planejador de trechos com deduplicação por nó (o mesmo `addTrecho` do
 * eletroduto). A E6 (VRF) usa o mesmo. C5: `add` devolve o índice do comando
 * (o já existente, quando o trecho repete) — é por ele que o dreno compartilhado
 * soma a vazão de quem passa; `null` para trecho de comprimento zero.
 */
export function lote(model: BlueprintModel) {
  const chave = fazerChave(model.levels);
  const comandos: Command[] = [];
  const arestas: Aresta[] = [];
  const vistas = new Map<string, number>();
  const add = (base: Omit<Extract<Command, { type: 'AddTrecho' }>, 'type' | 'a' | 'b' | 'cotaAMm' | 'cotaBMm'>, a: P2, cotaA: number, b: P2, cotaB: number): number | null => {
    if (mesmoP(a, b) && cotaA === cotaB) return null;
    const de = chave(base.levelId, a.x, a.y, cotaA);
    const para = chave(base.levelId, b.x, b.y, cotaB);
    const k = [de, para].sort().join('>');
    const ja = vistas.get(k);
    if (ja != null) return ja;
    comandos.push({ type: 'AddTrecho', ...base, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, cotaAMm: cotaA, cotaBMm: cotaB } as Command);
    vistas.set(k, comandos.length - 1);
    arestas.push({ ref: { novo: comandos.length - 1 }, de, para, mm: comprimentoMm({ a, b, cotaAMm: cotaA, cotaBMm: cotaB }) });
    return comandos.length - 1;
  };
  return { comandos, arestas, add };
}

/**
 * C6: o caminho com um vértice a `distanciaMm` do começo (no máximo na metade do
 * caminho) — o lugar do sifão. Devolve os pontos e o índice do vértice (`-1` num
 * caminho curto demais). Coordenadas em mm inteiros.
 */
export function verticeNoCaminho(pontos: readonly P2[], distanciaMm: number): { pontos: P2[]; indice: number } {
  const lances = pontos.slice(1).map((q, i) => Math.hypot(q.x - pontos[i].x, q.y - pontos[i].y));
  const total = lances.reduce((s, l) => s + l, 0);
  if (pontos.length < 2 || total < 2) return { pontos: [...pontos], indice: -1 };
  const d = Math.min(distanciaMm, total / 2);
  let andado = 0;
  for (let i = 0; i < lances.length; i++) {
    if (andado + lances[i] >= d) {
      const f = lances[i] > 0 ? (d - andado) / lances[i] : 0;
      const p = { x: Math.round(pontos[i].x + (pontos[i + 1].x - pontos[i].x) * f), y: Math.round(pontos[i].y + (pontos[i + 1].y - pontos[i].y) * f) };
      if (mesmoP(p, pontos[i])) return { pontos: [...pontos], indice: i === 0 ? -1 : i };
      if (mesmoP(p, pontos[i + 1])) return { pontos: [...pontos], indice: i + 1 === pontos.length - 1 ? -1 : i + 1 };
      return { pontos: [...pontos.slice(0, i + 1), p, ...pontos.slice(i + 1)], indice: i + 1 };
    }
    andado += lances[i];
  }
  return { pontos: [...pontos], indice: -1 };
}

/** A polilinha em planta da peça `de` à peça `para`, pelo eixo das paredes; reta (com desvio de pilar) quando não há parede perto. */
function caminhoEmPlanta(model: BlueprintModel, levelId: ObjectId, de: P2, para: P2, hip: HipotesesDaLinha, paredesDaRota?: readonly Wall[], obstaculosExtras: readonly Point[][] = []): { pontos: P2[]; pelaParede: boolean } {
  const paredes = paredesDaRota ?? model.walls.filter((w) => w.levelId === levelId);
  const pegadas = [...pegadasDePilares(model, levelId), ...obstaculosExtras];
  const reta = (): P2[] => {
    const desvio = desvioDoPilar(de, para, pegadas) ?? [];
    return [de, ...desvio, para];
  };
  if (paredes.length === 0) return { pontos: reta(), pelaParede: false };
  // F9 da casa automática (15/10/2026): com pilar em todo encontro de paredes, a penalidade não desvia — o pilar
  // vira ANEL no grafo (como a água e o alimentador na F8b).
  const arvore = arvorePelasParedes({ paredes, raiz: de, pendentes: [para], raioDeEncaixeMm: hip.raioDeEncaixeMm, obstaculos: pegadas, contornoDoPilarMm: CONTORNO_DO_PILAR_MM, encaixarEm: encaixaNoAnel, ...(paredesDaRota ? { penalidadeDoAnelMm: PENALIDADE_DO_CONTORNO_NO_FORRO_MM } : {}) });
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

/**
 * F24: o topo mais alto das aberturas por onde o caminho (em planta, pelo eixo das paredes) passa e que alcançam a cota
 * `cota` (± `raio`) — `null` se nenhuma. Amostra a cada 50 mm; a abertura conta a ±30 mm do vão e da face da parede.
 */
function topoDasAberturasNoCaminho(model: BlueprintModel, levelId: ObjectId, pontos: readonly P2[], cota: number, raio: number): number | null {
  let topo: number | null = null;
  const paredes = new Map(model.walls.filter((w) => w.levelId === levelId).map((w) => [w.id, w]));
  const aberturas = model.openings.filter((o) => paredes.has(o.wallId) && o.sillMm < cota + raio && o.sillMm + o.heightMm > cota - raio);
  if (!aberturas.length) return null;
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1];
    const b = pontos[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 50));
    for (let k = 0; k <= n; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
      for (const o of aberturas) {
        const w = paredes.get(o.wallId)!;
        const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
        const t = ((p.x - w.a.x) * (w.b.x - w.a.x) + (p.y - w.a.y) * (w.b.y - w.a.y)) / L;
        const d = Math.abs(((p.x - w.a.x) * (w.b.y - w.a.y) - (p.y - w.a.y) * (w.b.x - w.a.x)) / L);
        if (d <= w.thicknessMm / 2 + 30 && t >= o.offsetMm - 30 && t <= o.offsetMm + o.widthMm + 30) topo = Math.max(topo ?? -Infinity, o.sillMm + o.heightMm);
      }
    }
  }
  return topo;
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

/**
 * 11/10/2026 (teste do usuário no app real: "a linha de dreno e a alimentação não acompanham a
 * nova posição"): o que REFAZER quando a peça do sistema anda — a linha frigorígena entre a
 * evaporadora e a condensadora (`linha`) e, com `dreno`, o caminho do dreno da evaporadora até o
 * ponto de dreno/bomba mais perto pela rede, com os sifões nele. Aceitos ou sugeridos (decisão
 * do usuário: "refazer sempre"). O dreno COMPARTILHADO (o caminho de outra evaporadora passa
 * por um trecho dele) fica: apagá-lo cortaria o dreno da outra. O DESTINO (ponto de dreno ou
 * bomba) sai junto quando só este dreno chega a ele — foi posto para a posição antiga, e
 * mantê-lo levava o dreno novo a dar a volta na sala até lá; servindo a outro dreno, fica.
 */
export function pecasDoSistemaParaRefazer(model: BlueprintModel, s: SistemaSplit, opts: { linha: boolean; dreno: boolean }): { trechos: ObjectId[]; terminais: ObjectId[] } {
  const trechos = new Set<ObjectId>();
  const terminais = new Set<ObjectId>();
  if (opts.linha && ehSplit(s)) for (const id of linhaExistente(model, s)?.trechoIds ?? []) trechos.add(id);
  if (opts.dreno) {
    const arestas = arestasDe(model, 'DRENO_AC');
    const destinos = (model.terminais ?? []).filter((t) => t.levelId === s.evaporadora.levelId && (t.tipoHidraulico === 'PONTO_DRENO' || t.tipoHidraulico === 'BOMBA_DRENO'));
    const rotaDe = (e: Terminal): { ids: ObjectId[]; destino: Terminal } | null => {
      const de = noDe(model, e);
      const melhor = destinos
        .map((d) => ({ d, c: menorCaminhoEntre(de, noDe(model, d), arestas) }))
        .filter((x): x is { d: Terminal; c: NonNullable<typeof x.c> } => !!x.c)
        .sort((a, b) => a.c.mm - b.c.mm)[0];
      return melhor ? { ids: melhor.c.arestas.map((i) => (arestas[i].ref as { existente: ObjectId }).existente), destino: melhor.d } : null;
    };
    const caminhoDe = (e: Terminal): ObjectId[] | null => rotaDe(e)?.ids ?? null;
    const rota = rotaDe(s.evaporadora);
    const meu = rota?.ids ?? null;
    if (meu && meu.length) {
      const outras = (model.terminais ?? []).filter((t) => t.id !== s.evaporadora.id && t.levelId === s.evaporadora.levelId && !!t.tipoHidraulico && (TIPOS_DE_EVAPORADORA as readonly string[]).includes(t.tipoHidraulico));
      const deOutra = new Set(outras.flatMap((o) => caminhoDe(o) ?? []));
      if (!meu.some((id) => deOutra.has(id))) {
        for (const id of meu) trechos.add(id);
        const porId = new Map((model.trechos ?? []).map((t) => [t.id, t]));
        const chave = fazerChave(model.levels);
        const nos = new Set(meu.flatMap((id) => {
          const t = porId.get(id)!;
          return [chave(t.levelId, t.a.x, t.a.y, t.cotaAMm), chave(t.levelId, t.b.x, t.b.y, t.cotaBMm)];
        }));
        for (const t of model.terminais ?? []) if (t.tipoHidraulico === 'SIFAO_DRENO' && nos.has(noDe(model, t))) terminais.add(t.id);
        // O destino só deste dreno: nenhum outro trecho de dreno chega a ele.
        const noDoDestino = noDe(model, rota!.destino);
        const meus = new Set(meu);
        const outroChega = (model.trechos ?? []).some(
          (t) => t.disciplina === 'DRENO_AC' && !meus.has(t.id) && (chave(t.levelId, t.a.x, t.a.y, t.cotaAMm) === noDoDestino || chave(t.levelId, t.b.x, t.b.y, t.cotaBMm) === noDoDestino),
        );
        if (!outroChega) terminais.add(rota!.destino.id);
      }
    }
  }
  return { trechos: [...trechos], terminais: [...terminais] };
}

/**
 * O que a linha e o dreno DESTE pavimento sugeriram: a linha do split onde
 * estiver (C1), o dreno e as peças de dreno sugeridas (ponto, bomba, sifão).
 * É o que relançar apaga e o que aceitar fixa.
 */
export function sugeridosDaLinha(model: BlueprintModel, levelId: ObjectId): { trechos: ObjectId[]; terminais: ObjectId[] } {
  return {
    trechos: [...linhaSugeridaDoNivel(model, levelId), ...(model.trechos ?? []).filter((t) => t.levelId === levelId && !!t.sugerido && t.disciplina === 'DRENO_AC')].map((t) => t.id),
    terminais: (model.terminais ?? []).filter((t) => t.levelId === levelId && !!t.sugerida && t.disciplina === 'DRENO_AC' && (t.tipoHidraulico === 'PONTO_DRENO' || t.tipoHidraulico === 'BOMBA_DRENO' || t.tipoHidraulico === 'SIFAO_DRENO')).map((t) => t.id),
  };
}

/** O plano da linha e do dreno de todos os sistemas do pavimento. */
/**
 * F14b da casa automática (16/10/2026, "forro com faixas" + "manter 2,80 m, furar vigas"): a linha NO FORRO — na cota
 * da faixa dela e pelos anéis dos cômodos (`paredesDoForro`, afastada da face; nunca dentro da viga); sai da
 * evaporadora para o lado do cômodo e sobe junto da parede ao forro. O dreno não muda (F14d).
 */
export interface LinhaNoForro {
  faixa: FaixaDoForro;
  folgaSobAVigaMm: number;
}

/** F14d: a distância entre a linha e o dreno que saem juntos pela parede, mm (eixo a eixo). */
const DRENO_AO_LADO_DA_LINHA_MM = 120;
/** F14d: quanto a linha e o dreno se afastam da face externa da parede ao descer pela fachada, mm. */
const AFASTAMENTO_NA_FACHADA_MM = 150;
/** F14d: até onde, além da ponta da evaporadora, a saída dos tubos pode ficar ("ao lado dela"), mm. */
const SAIDA_ALEM_DA_PONTA_MM = 400;
/** F14d: o dreno sai da evaporadora DESCENDO isto antes de ir para a parede (a linha sai na cota dela), mm. */
const DRENO_ABAIXO_DA_LINHA_MM = 80;
/** F19: entre as geratrizes da linha e do dreno na travessia da saída direta, mm (padrão de `folgaEntreLinhaEDrenoNaSaidaMm`). */
const FOLGA_ENTRE_LINHA_E_DRENO_NA_SAIDA_MM = 20;
/** F19: o raio presumido do eletroduto que ainda descerá até um ponto elétrico (DN 25 com folga), mm. */
const RAIO_DO_ELETRODUTO_FUTURO_MM = 16;
/** F19: o padrão de `HipotesesDaLinha.saidaAoLadoAteMm`. */
const SAIDA_AO_LADO_ATE_MM = 2500;
/** F19: o padrão de `HipotesesDaLinha.folgaSobAVigaNaSaidaMm`. */
const FOLGA_SOB_A_VIGA_NA_SAIDA_MM = 20;
/** F19: na saída direta com a linha rebaixada sob a viga, a distância entre a descida dela e a do dreno (no nó), mm. */
const SEPARACAO_DAS_DESCIDAS_NA_SAIDA_MM = 60;
/** F14d: a condensadora a até isto da face externa da parede da evaporadora (perpendicular) para a saída direta, mm. */
const CONDENSADORA_ATRAS_ATE_MM = 1500;

export interface SaidaPelaParede {
  /**
   * F19: diante da travessia, do lado de dentro, na profundidade do nó da evaporadora — os tubos correm paralelos à
   * parede até ali e a atravessam de frente. Em diagonal, saindo além do batente, entravam na espessura da parede ainda
   * dentro do vão (sobrado, 13 cm). Igual a `e.at` quando a travessia fica atrás dela.
   */
  linhaDentro: P2;
  drenoDentro: P2;
  /**
   * F19: com a linha rebaixada sob a viga, onde ela desce — um passo atrás do nó, na perpendicular, rumo à parede (o
   * dreno desce no próprio nó); `linhaDentro` fica então na profundidade desse passo. `null` = a linha não desce.
   */
  linhaPasso: P2 | null;
  /** No eixo da parede e do lado de fora (face + afastamento), a linha e o dreno. */
  linhaNoEixo: P2;
  linhaFora: P2;
  drenoNoEixo: P2;
  drenoFora: P2;
  /** Onde descem pela fachada: o mesmo ponto de fora, ou além do batente quando saem acima da janela. */
  linhaDesce: P2;
  drenoDesce: P2;
  /**
   * F19: as cotas em que a linha e o dreno atravessam a parede — abaixo do fundo da viga sobre ela, e o dreno abaixo
   * da linha (ver `TravessiaDaSaida`).
   */
  cotaLinhaMm: number;
  cotaDrenoMm: number;
}

/** F19: o que decide as cotas da travessia na saída direta. Ausente = os dois na cota de antes (sem viga). */
export interface TravessiaDaSaida {
  raioLinhaMm: number;
  /** O raio do FEIXE da linha em planta (líquido e sucção lado a lado — `envelopeDoTrecho`), mm. Ausente = `raioLinhaMm`. */
  raioLinhaPlantaMm?: number;
  raioDrenoMm: number;
  /** Entre a geratriz do tubo e o fundo da viga, mm (padrão 20). */
  folgaSobAVigaMm?: number;
  /** Entre as geratrizes da linha e do dreno, mm (padrão 20). */
  folgaEntreMm?: number;
  /** Até onde, além da ponta da evaporadora, a travessia pode ir quando não há ponto livre perto, mm (padrão 2500). */
  alcanceAoLadoMm?: number;
}

/**
 * F14d da casa automática (decisão do usuário, 16/10/2026: "Evaporadora na parede externa"): a evaporadora encostada
 * numa parede externa com a condensadora do outro lado dela — a linha e o dreno saem JUNTOS pela parede, atrás da
 * evaporadora ou ao lado dela (até `SAIDA_ALEM_DA_PONTA_MM` além da ponta), sobre parede cheia ou acima da verga, a
 * `DRENO_AO_LADO_DA_LINHA_MM` um do outro, fora de pilar e longe das prumadas das outras redes; por fora, descem lado a
 * lado pela fachada — além do batente, se saíram acima da janela. `null` = não há a saída direta (a evaporadora em
 * parede interna, a condensadora longe ou em outro pavimento, ou nenhum ponto livre).
 */
export function saidaPelaParede(model: BlueprintModel, e: Terminal, c: Terminal, travessia?: TravessiaDaSaida): SaidaPelaParede | null {
  if (c.levelId !== e.levelId) return null;
  const meiaProf = (e.profundidadeMm ?? 220) / 2;
  const meiaLarg = (e.larguraMm ?? 900) / 2;
  let melhor: { w: Wall; u: P2; n: P2; te: number; tc: number; L: number; d: number } | null = null;
  for (const w of model.walls) {
    if (w.levelId !== e.levelId) continue;
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (L < 1) continue;
    const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
    const lado = (p: P2) => (p.x - w.a.x) * u.y - (p.y - w.a.y) * u.x;
    const te = (e.at.x - w.a.x) * u.x + (e.at.y - w.a.y) * u.y;
    const tc = (c.at.x - w.a.x) * u.x + (c.at.y - w.a.y) * u.y;
    const de = lado(e.at);
    const dc = lado(c.at);
    if (te < 0 || te > L || Math.abs(de) > w.thicknessMm / 2 + meiaProf + 60) continue;
    if (Math.sign(de) === Math.sign(dc) || Math.abs(dc) > w.thicknessMm / 2 + CONDENSADORA_ATRAS_ATE_MM || tc < -500 || tc > L + 500) continue;
    // A normal para FORA (o lado da condensadora).
    const n = dc > 0 ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x };
    if (!melhor || Math.abs(de) < melhor.d) melhor = { w, u, n, te, tc, L, d: Math.abs(de) };
  }
  if (!melhor) return null;
  const { w, u, n, te, tc, L } = melhor;
  const vaos = model.openings.filter((o) => o.wallId === w.id);
  const raio = 40;
  const noEixo = (t: number) => ({ x: Math.round(w.a.x + u.x * t), y: Math.round(w.a.y + u.y * t) });
  // Do lado de dentro, na profundidade do nó da evaporadora (o mesmo afastamento do eixo que ele tem).
  const dentro = (t: number): P2 => (Math.abs(t - te) < 1 ? { x: e.at.x, y: e.at.y } : { x: Math.round(e.at.x + u.x * (t - te)), y: Math.round(e.at.y + u.y * (t - te)) });
  // O passo da descida da linha: na perpendicular, do nó rumo ao eixo da parede.
  const perp = { x: w.a.x + u.x * te - e.at.x, y: w.a.y + u.y * te - e.at.y };
  const dPerp = Math.hypot(perp.x, perp.y) || 1;
  const passo = Math.min(SEPARACAO_DAS_DESCIDAS_NA_SAIDA_MM, dPerp / 2) / dPerp;
  const comPasso = (q: P2): P2 => ({ x: Math.round(q.x + perp.x * passo), y: Math.round(q.y + perp.y * passo) });
  /** O caminho em planta da evaporadora ao eixo da parede em `t` — o da linha desce (`desce`) no passo e corre ali. */
  const caminhoAte = (t: number, desce: boolean): P2[] => {
    const pts = desce ? [e.at, comPasso(e.at), comPasso(dentro(t)), noEixo(t)] : [e.at, dentro(t), noEixo(t)];
    return pts.filter((q, i) => i === 0 || !mesmoP(q, pts[i - 1]));
  };
  const fora = (p: P2, mais = 0) => ({ x: Math.round(p.x + n.x * (w.thicknessMm / 2 + AFASTAMENTO_NA_FACHADA_MM + mais)), y: Math.round(p.y + n.y * (w.thicknessMm / 2 + AFASTAMENTO_NA_FACHADA_MM + mais)) });
  // Os obstáculos: o vão na cota da saída, o pilar, e as prumadas das outras redes que passam nessa cota.
  const pilares = pegadasDePilares(model, e.levelId);
  const prumadas = (model.trechos ?? []).filter(
    (t) => t.levelId === e.levelId && t.a.x === t.b.x && t.a.y === t.b.y && t.disciplina !== 'FRIGORIGENA' && t.disciplina !== 'DRENO_AC' && Math.min(t.cotaAMm, t.cotaBMm) < e.cotaMm + 100 && Math.max(t.cotaAMm, t.cotaBMm) > e.cotaMm - 200,
  );
  const distSeg = (p: P2, a: P2, b: P2) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    const k = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
    return Math.hypot(p.x - (a.x + k * dx), p.y - (a.y + k * dy));
  };
  const longeDasPrumadas = (a: P2, b: P2) => prumadas.every((t) => distSeg(t.a, a, b) > raio + t.bitolaMm / 2 + 20);
  // F19: as cotas da travessia em cada ponto candidato — a linha abaixo da viga sobre ele; o dreno 80 mm abaixo da
  // evaporadora, abaixo da viga e abaixo da linha. O vão confere-se NESSAS cotas: com a linha rebaixada sob a viga, o
  // dreno passava dentro da janela larga (R1-A, topo a 2,20 m e a viga logo acima).
  const rL = travessia?.raioLinhaMm ?? raio;
  const rLp = travessia?.raioLinhaPlantaMm ?? rL;
  const rD = travessia?.raioDrenoMm ?? raio;
  const folgaViga = travessia?.folgaSobAVigaMm ?? FOLGA_SOB_A_VIGA_NA_SAIDA_MM;
  const sobAViga = (t: number, cota: number, r: number) => {
    const fundo = travessia ? fundoDaVigaSobre(model, e.levelId, noEixo(t), r) : null;
    return fundo == null ? cota : Math.min(cota, Math.round(fundo - r - folgaViga));
  };
  const cotaLinhaEm = (tl: number) => sobAViga(tl, e.cotaMm, rL);
  const cotaDrenoEm = (td: number, cotaL: number) =>
    travessia
      ? // Abaixo da linha pelo FEIXE dela (o detector de encontros mede o maior dos raios — sobrado, 4 cm).
        Math.min(sobAViga(td, e.cotaMm - DRENO_ABAIXO_DA_LINHA_MM, rD), Math.round(cotaL - rLp - rD - (travessia.folgaEntreMm ?? FOLGA_ENTRE_LINHA_E_DRENO_NA_SAIDA_MM)))
      : e.cotaMm - DRENO_ABAIXO_DA_LINHA_MM;
  // F19: os pontos elétricos abaixo da travessia são as prumadas que AINDA VIRÃO — o eletroduto desce do teto na vertical
  // até cada um (planejado depois da climatização) e cruzava a linha que corre paralela à parede (o ponto de força do
  // próprio aparelho, sobrado).
  const pontosEletricos = (model.terminais ?? []).filter((t) => t.levelId === e.levelId && t.disciplina === 'ELETRICA');
  const longeDosPontos = (a: P2, b: P2, cota: number, rp: number) =>
    pontosEletricos.every((t) => t.cotaMm > cota + rp || distSeg(t.at, a, b) > rp + RAIO_DO_ELETRODUTO_FUTURO_MM + 20);
  const livre = (t: number, cota: number, r: number, rp: number, caminho: P2[]) => {
    if (t < 0 || t > L) return false;
    if (!vaos.every((o) => t < o.offsetMm - r || t > o.offsetMm + o.widthMm + r || cota - r > o.sillMm + o.heightMm || cota + r < o.sillMm)) return false;
    const p = noEixo(t);
    const q = fora(p);
    if (pilares.some((g) => pointInPolygon(g, p as Point) || pointInPolygon(g, q as Point) || g.some((v, i) => distSeg(p, g[(i + g.length - 1) % g.length], v) < raio))) return false;
    // E o caminho da evaporadora até ali (paralelo à parede, depois de frente) não corta o pilar (o do canto, na térrea a 0°).
    // F19: o caminho que o tubo vai PERCORRER (o da linha, no passo da descida dela) — conferido na profundidade do nó,
    // a linha que corria 6 cm mais perto da parede passava sobre o ponto de força e a coluna de água quente (sobrado).
    const lances = caminho.slice(1).map((b, i) => [caminho[i], b] as [P2, P2]);
    for (const [a, b] of lances) {
      for (let k = 1; k < 20; k++) {
        const r = { x: a.x + ((b.x - a.x) * k) / 20, y: a.y + ((b.y - a.y) * k) / 20 };
        if (pilares.some((g) => pointInPolygon(g, r as Point) || g.some((v, i) => distSeg(r, g[(i + g.length - 1) % g.length], v) < raio))) return false;
      }
    }
    return longeDasPrumadas(p, q) && lances.every(([a, b]) => longeDasPrumadas(a, b) && longeDosPontos(a, b, cota, rp));
  };
  // F24 da casa automática (17/10/2026): por fora, a travessia e a descida não caem no corpo de OUTRA parede — no canto
  // de dentro da casa em L, o dreno descia dentro da parede do anexo.
  const outras = model.walls.filter((x) => x.levelId === e.levelId && x.id !== w.id);
  const foraLivre = (t: number, mais: number, r: number) => {
    const q = fora(noEixo(t), mais);
    return outras.every((x) => distSeg(q, x.a, x.b) > x.thicknessMm / 2 + r + 20);
  };
  // Por fora, a descida não passa diante de janela — saindo acima dela, os dois correm até além do batente.
  const diante = (t: number) => vaos.some((o) => o.kind === 'window' && o.sillMm < e.cotaMm && t > o.offsetMm - 60 && t < o.offsetMm + o.widthMm + 60);
  // F24: e onde a descida cabe por fora (não no corpo de outra parede — o canto de dentro da casa em L). Guardado por
  // posição: o deslocamento varre a parede de 10 em 10 mm para cada candidato.
  const jaVisto = new Map<number, boolean>();
  const cabe = (x: number) => {
    const k = Math.round(x);
    let v = jaVisto.get(k);
    if (v === undefined) {
      v = !diante(x) && foraLivre(x, 0, rL) && foraLivre(x - DRENO_AO_LADO_DA_LINHA_MM, DRENO_AO_LADO_DA_LINHA_MM, rD) && foraLivre(x + DRENO_AO_LADO_DA_LINHA_MM, DRENO_AO_LADO_DA_LINHA_MM, rD);
      jaVisto.set(k, v);
    }
    return v;
  };
  const deslocamento = (tl: number): number | null => {
    if (!diante(tl)) return 0;
    for (let k = 10; k <= L; k += 10) for (const sinal of tc >= tl ? [1, -1] : [-1, 1]) if (tl + sinal * k >= 0 && tl + sinal * k <= L && cabe(tl + sinal * k)) return sinal * k;
    return null;
  };
  // O ponto livre mais perto do meio da evaporadora; o dreno a `DRENO_AO_LADO_DA_LINHA_MM` da linha, do lado OPOSTO
  // ao da condensadora (contado de onde a linha desce) — a linha volta pela fachada até ela e passava rente à descida
  // do dreno.
  // F19: do mais perto para o mais longe; até `SAIDA_ALEM_DA_PONTA_MM` além da ponta e, sem ponto livre ali (a janela
  // larga atrás dela, com a viga logo acima), até `alcanceAoLadoMm` — os tubos correm paralelos à parede, por dentro.
  const alcance = Math.max(SAIDA_ALEM_DA_PONTA_MM, travessia?.alcanceAoLadoMm ?? SAIDA_AO_LADO_ATE_MM);
  const candidatos: number[] = [te];
  for (let k = 10; k <= meiaLarg + alcance; k += 10) candidatos.push(te - k, te + k);
  let escolha: { tl: number; td: number; delta: number; d: number; cotaL: number; cotaD: number } | null = null;
  for (const tl of candidatos) {
    if (escolha) break;
    const d = Math.abs(tl - te);
    const cotaL = cotaLinhaEm(tl);
    if (!livre(tl, cotaL, rL, rLp, caminhoAte(tl, cotaL !== e.cotaMm))) continue;
    const delta = deslocamento(tl);
    if (delta == null) continue;
    // F18: deslocados além do batente, o dreno fica de preferência ATRÁS da linha no sentido em que os dois andam — à
    // frente, o trecho dele que atravessa a parede passava rente à descida dela (R1-B, 1 cm).
    for (const sentido of delta !== 0 ? [-Math.sign(delta), Math.sign(delta)] : tc >= tl ? [-1, 1] : [1, -1]) {
      const td = tl + sentido * DRENO_AO_LADO_DA_LINHA_MM;
      // À frente, a descida da linha (em tl + delta) tem de passar ALÉM da travessia do dreno (em td): o deslocamento
      // cresce até 2 × o afastamento entre os dois.
      const aFrente = delta !== 0 && Math.sign(sentido) === Math.sign(delta);
      const d2 = aFrente && Math.abs(delta) < 2 * DRENO_AO_LADO_DA_LINHA_MM ? Math.sign(delta) * 2 * DRENO_AO_LADO_DA_LINHA_MM : delta;
      const cotaD = cotaDrenoEm(td, cotaL);
      if (!livre(td, cotaD, rD, rD, caminhoAte(td, false)) || diante(td + d2) || diante(tl + d2) || tl + d2 < 0 || tl + d2 > L || td + d2 < 0 || td + d2 > L) continue;
      if (!foraLivre(tl, 0, rL) || !foraLivre(tl + d2, 0, rL) || !foraLivre(td, DRENO_AO_LADO_DA_LINHA_MM, rD) || !foraLivre(td + d2, DRENO_AO_LADO_DA_LINHA_MM, rD)) continue;
      escolha = { tl, td, delta: d2, d, cotaL, cotaD };
      break;
    }
  }
  if (!escolha) return null;
  const { tl, td, delta, cotaL, cotaD } = escolha;
  const linhaNoEixo = noEixo(tl);
  const drenoNoEixo = noEixo(td);
  return {
    linhaDentro: cotaL !== e.cotaMm ? comPasso(dentro(tl)) : dentro(tl),
    drenoDentro: dentro(td),
    linhaPasso: cotaL !== e.cotaMm ? comPasso(e.at) : null,
    linhaNoEixo,
    linhaFora: fora(linhaNoEixo),
    drenoNoEixo,
    // Por fora, o dreno corre um passo MAIS AFASTADO da fachada que a linha: deslocados além do batente, o dreno que corria
    // na mesma linha passava pela descida dela.
    drenoFora: fora(drenoNoEixo, DRENO_AO_LADO_DA_LINHA_MM),
    linhaDesce: fora(noEixo(tl + delta)),
    drenoDesce: fora(noEixo(td + delta), DRENO_AO_LADO_DA_LINHA_MM),
    cotaLinhaMm: cotaL,
    cotaDrenoMm: cotaD,
  };
}

export function planejarLinhasFrigorigenas(
  model: BlueprintModel,
  levelId: ObjectId,
  hip: HipotesesDaLinha,
  opcoes: { noForro?: LinhaNoForro | null; pelaParedeExterna?: boolean } = {},
): PlanoDaLinha {
  const noForro = opcoes.noForro ?? null;
  const vazio = (motivo: string, apagar: Command[] = []): PlanoDaLinha => ({ comandos: apagar, aCriar: [], jaLigados: [], semLugar: [], apagados: apagar.length, motivo, resumo: [] });
  // Relançar apaga o que este planejador sugeriu antes: a linha do SPLIT deste pavimento (C1: onde
  // quer que esteja — a prumada atravessa outros), o dreno e as peças de dreno sugeridas. A árvore do
  // VRF (rótulo próprio) é da E6 e fica.
  const sug = sugeridosDaLinha(model, levelId);
  const apagar: Command[] = [
    ...sug.trechos.map((trechoId) => ({ type: 'DeleteTrecho', trechoId }) as Command),
    ...sug.terminais.map((terminalId) => ({ type: 'DeleteTerminal', terminalId }) as Command),
  ];
  const sistemas = sistemasDoNivel(model, levelId);
  if (sistemas.length === 0) return vazio('nenhuma evaporadora com condensadora ligada neste pavimento — lance o split (Seleção e posição) ou ligue o sistema no painel da peça', apagar);

  // O modelo SEM as sugestões anteriores é o que decide "já ligado" e por onde a nova linha passa.
  const idsApagados = new Set([...sug.trechos, ...sug.terminais]);
  const base: BlueprintModel = { ...model, trechos: (model.trechos ?? []).filter((t) => !idsApagados.has(t.id)), terminais: (model.terminais ?? []).filter((t) => !idsApagados.has(t.id)) };

  const l = lote(base);
  const aCriar: LinhaPlanejada[] = [];
  const jaLigados: string[] = [];
  const semLugar: { nome: string; motivo: string }[] = [];
  /** Peças novas (ponto de dreno / bomba) na ordem em que entram no lote; o sifão, sobre o trecho, entra depois dos trechos. */
  const pecas: Command[] = [];
  const sifoes: Command[] = [];
  /** C5: a vazão de condensado que passa em cada trecho novo de dreno (índice do comando → L/h). */
  const vazaoNoTrecho = new Map<number, number>();
  const medCond = FICHA_DO_PONTO_HIDRAULICO.CONDENSADORA_SPLIT.medidasMm ?? { larguraMm: 850, profundidadeMm: 330, alturaMm: 700 };
  const nomeDoNivel = (id: ObjectId) => base.levels.find((x) => x.id === id)?.name ?? id;

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
    // F9 da casa automática (15/10/2026): a linha não corre DENTRO da viga do teto — com a viga abaixo da cota da
    // linha, ela corre 10 cm abaixo do fundo dela (a regra do eletroduto e do barrilete), com aviso.
    const nivelDaEvap = base.levels.find((x) => x.id === e.levelId);
    const fundoDaViga = nivelDaEvap ? fundoDaVigaMaisBaixaMm(base, e.levelId, nivelDaEvap.defaultHeightMm) : null;
    const cotaLinha = noForro && nivelDaEvap
      ? cotaDaFaixa(nivelDaEvap.defaultHeightMm, noForro.faixa)
      : fundoDaViga != null && fundoDaViga - ABAIXO_DA_VIGA_MM < hip.cotaDaLinhaMm ? Math.round(fundoDaViga - ABAIXO_DA_VIGA_MM) : Math.round(hip.cotaDaLinhaMm);
    if (!noForro && cotaLinha !== Math.round(hip.cotaDaLinhaMm)) avisos.push(`linha a ${(cotaLinha / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m do piso — 10 cm abaixo da viga mais baixa do teto`);
    let comprimento = 0;
    const desnivel = desnivelDoSistemaMm(base, s);
    // C1: a condensadora em OUTRO pavimento — a linha vai até a PRUMADA e sobe/desce por ela.
    const outroNivel = c.levelId !== e.levelId;
    const prumada = outroNivel ? pontoDaPrumada(base, c.at, pavimentosEntre(base, e.levelId, c.levelId).map((x) => x.id), hip.raioDoShaftMm) : null;
    /** Onde a linha sai deste pavimento: a prumada, ou a própria condensadora. */
    const saidaAt = prumada?.at ?? c.at;
    // F14d: a saída direta pela parede externa (linha e dreno juntos, lado a lado pela fachada).
    // F19: as cotas da travessia (abaixo da viga sobre a parede; o dreno abaixo da linha) e o vão conferido nelas.
    const travessia: TravessiaDaSaida = {
      raioLinhaMm: faixa.succaoMm / 2 + isolamentoMm,
      raioLinhaPlantaMm: envelopeDoTrecho({ disciplina: 'FRIGORIGENA', bitolaMm: faixa.liquidoMm, bitolaSuccaoMm: faixa.succaoMm, isolamentoMm }).raioPlantaMm,
      raioDrenoMm: hip.dnDrenoMm / 2,
      folgaSobAVigaMm: hip.folgaSobAVigaNaSaidaMm,
      folgaEntreMm: hip.folgaEntreLinhaEDrenoNaSaidaMm,
      alcanceAoLadoMm: hip.saidaAoLadoAteMm,
    };
    const direta = opcoes.pelaParedeExterna && !outroNivel ? saidaPelaParede(base, e, c, travessia) : null;
    if (precisaLinha && direta) {
      const baseLinha = { levelId, disciplina: 'FRIGORIGENA' as const, bitolaMm: faixa.liquidoMm, bitolaSuccaoMm: faixa.succaoMm, isolamentoMm, sugerido: true };
      const antes = l.comandos.length;
      // Da evaporadora ao eixo da parede atrás dela, para fora, desce pela fachada e entra na condensadora por baixo.
      // F19: a travessia da parede fica ABAIXO da viga sobre ela — com a evaporadora subida acima da janela (2,35 m), a
      // linha saía na base da viga (R1-N 12 × 30).
      const cotaT = direta.cotaLinhaMm;
      // F19: paralela à parede até diante da travessia, e de frente para ela.
      if (cotaT !== e.cotaMm) {
        // Desce um passo ATRÁS do nó, na perpendicular, rumo à parede (escondido pelo aparelho): o dreno desce no próprio
        // nó. Rumo à travessia, com ela 2 cm ao lado, as duas descidas ficavam a 1 cm (10 × 30, 4 dorm.).
        const p1 = direta.linhaPasso ?? e.at;
        const q1 = direta.linhaDentro;
        l.add(baseLinha, e.at, e.cotaMm, p1, e.cotaMm);
        l.add(baseLinha, p1, e.cotaMm, p1, cotaT);
        if (!mesmoP(p1, q1)) l.add(baseLinha, p1, cotaT, q1, cotaT);
        l.add(baseLinha, q1, cotaT, direta.linhaNoEixo, cotaT);
      } else {
        if (!mesmoP(direta.linhaDentro, e.at)) l.add(baseLinha, e.at, cotaT, direta.linhaDentro, cotaT);
        l.add(baseLinha, direta.linhaDentro, cotaT, direta.linhaNoEixo, cotaT);
      }
      l.add(baseLinha, direta.linhaNoEixo, cotaT, direta.linhaFora, cotaT);
      if (!mesmoP(direta.linhaFora, direta.linhaDesce)) l.add(baseLinha, direta.linhaFora, cotaT, direta.linhaDesce, cotaT);
      l.add(baseLinha, direta.linhaDesce, cotaT, direta.linhaDesce, c.cotaMm);
      l.add(baseLinha, direta.linhaDesce, c.cotaMm, c.at, c.cotaMm);
      comprimento = l.arestas.slice(antes).reduce((acc, a) => acc + a.mm, 0);
    } else if (precisaLinha) {
      const paredesDaRota = noForro ? paredesDoForro(base, levelId, noForro.faixa.afastamentoDaFaceMm) : undefined;
      // F14b: as prumadas das outras redes (as colunas de água) que cruzam a faixa da linha são obstáculo.
      const prumadas = noForro ? prumadasQueCruzam(base, levelId, cotaLinha, 'FRIGORIGENA', 2 * (faixa.succaoMm / 2 + isolamentoMm) + 5) : [];
      const caminho = caminhoEmPlanta(base, levelId, s.evaporadora.at, saidaAt, hip, paredesDaRota, prumadas);
      if (!caminho.pelaParede) avisos.push('sem parede ao alcance: a linha vai em reta (desviando de pilar)');
      const baseLinha = { levelId, disciplina: 'FRIGORIGENA' as const, bitolaMm: faixa.liquidoMm, bitolaSuccaoMm: faixa.succaoMm, isolamentoMm, sugerido: true };
      // Sobe da evaporadora à cota da linha, corre, desce à condensadora.
      const p = caminho.pontos;
      const antes = l.comandos.length;
      if (noForro && caminho.pelaParede && p.length >= 2) {
        // F14b: sai da evaporadora para o anel do forro na cota dela e sobe ali (junto da parede, no caixote).
        // F18: sobe a pelo menos `DRENO_AO_LADO_DA_LINHA_MM` da evaporadora — o dreno desce no nó dela, e a 3 cm as duas
        // verticais se encostavam (R1-A). Até lá, corre pelo anel na cota do aparelho (atrás dele).
        const dist = (q: P2) => Math.hypot(q.x - e.at.x, q.y - e.at.y);
        let sobe = 1;
        let ponto: P2 = p[1];
        if (dist(p[1]) < DRENO_AO_LADO_DA_LINHA_MM) {
          for (let i = 1; i + 1 < p.length; i++) {
            const [a, b] = [p[i], p[i + 1]];
            const L = Math.hypot(b.x - a.x, b.y - a.y);
            const k = [...Array(Math.max(1, Math.ceil(L / 10)))].map((_, j) => (j + 1) / Math.max(1, Math.ceil(L / 10))).find((f) => dist({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }) >= DRENO_AO_LADO_DA_LINHA_MM);
            if (k != null) {
              ponto = { x: Math.round(a.x + (b.x - a.x) * k), y: Math.round(a.y + (b.y - a.y) * k) };
              sobe = i;
              break;
            }
          }
        }
        if (mesmoP(ponto, p[1])) l.add(baseLinha, e.at, e.cotaMm, p[1], e.cotaMm);
        // Direto do nó da evaporadora ao ponto da subida (atrás do aparelho): pelo ponto do anel colado a ela, a linha
        // passava a 3 cm do começo do dreno.
        else l.add(baseLinha, e.at, e.cotaMm, ponto, e.cotaMm);
        l.add(baseLinha, ponto, e.cotaMm, ponto, cotaLinha);
        if (!mesmoP(ponto, p[sobe]) && sobe + 1 < p.length) l.add(baseLinha, ponto, cotaLinha, p[sobe + 1], cotaLinha);
        for (let i = mesmoP(ponto, p[sobe]) ? sobe : sobe + 1; i + 1 < p.length; i++) l.add(baseLinha, p[i], cotaLinha, p[i + 1], cotaLinha);
      } else {
        l.add(baseLinha, e.at, e.cotaMm, e.at, cotaLinha);
        for (let i = 0; i + 1 < p.length; i++) l.add(baseLinha, p[i], cotaLinha, p[i + 1], cotaLinha);
      }
      if (!prumada) {
        l.add(baseLinha, c.at, cotaLinha, c.at, c.cotaMm);
      } else {
        // A prumada chega direto à condensadora quando corre sob/sobre ela; num shaft, chega à cota
        // da linha e corre no pavimento dela até a peça.
        const direto = mesmoP(prumada.at, c.at);
        for (const lance of lancesDaPrumada(base, { levelId: e.levelId, cotaMm: cotaLinha }, { levelId: c.levelId, cotaMm: direto ? c.cotaMm : cotaLinha })) {
          l.add({ ...baseLinha, levelId: lance.levelId }, prumada.at, lance.cotaAMm, prumada.at, lance.cotaBMm);
        }
        if (!direto) {
          const noDestino = caminhoEmPlanta(base, c.levelId, prumada.at, c.at, hip, noForro ? paredesDoForro(base, c.levelId, noForro.faixa.afastamentoDaFaceMm) : undefined);
          if (!noDestino.pelaParede) avisos.push(`em ${nomeDoNivel(c.levelId)}, sem parede ao alcance: a linha vai em reta do shaft à condensadora`);
          const q = noDestino.pontos;
          for (let i = 0; i + 1 < q.length; i++) l.add({ ...baseLinha, levelId: c.levelId }, q[i], cotaLinha, q[i + 1], cotaLinha);
          l.add({ ...baseLinha, levelId: c.levelId }, c.at, cotaLinha, c.at, c.cotaMm);
        }
        avisos.push(`a condensadora está em ${nomeDoNivel(c.levelId)}: a linha ${prumada.shaft ? 'sobe/desce pelo shaft' : 'sobe/desce numa prumada na posição dela (sem shaft ao alcance)'}`);
      }
      comprimento = l.arestas.slice(antes).reduce((acc, a) => acc + a.mm, 0);
    }
    if (!precisaDreno) {
      aCriar.push({ evaporadoraId: e.id, condensadoraId: c.id, nome, linha: precisaLinha, faixa, comprimentoMm: comprimento, desnivelMm: desnivel, dreno: null, avisos });
      continue;
    }
    // E5.4 — o DRENO: ao ponto de dreno existente mais perto, senão a um ponto novo na fachada, junto da
    // condensadora (C1: com ela em outro pavimento, junto da prumada).
    const existentePonto = pontoDeDrenoMaisPerto(base, e);
    let destinoAt: P2;
    let destinoCota: number;
    let destino: 'PONTO_EXISTENTE' | 'PONTO_NOVO_NA_FACHADA';
    if (direta && !existentePonto) {
      // F14d: ao pé da fachada, sob a saída do dreno — ele desce ao lado da linha.
      destinoAt = direta.drenoDesce;
      destinoCota = 0;
      destino = 'PONTO_NOVO_NA_FACHADA';
      pecas.push({ type: 'AddTerminal', levelId, disciplina: 'DRENO_AC', tipo: 'Ponto de dreno', tipoHidraulico: 'PONTO_DRENO', at: destinoAt, cotaMm: 0, sugerida: true } as Command);
    } else if (existentePonto) {
      destinoAt = existentePonto.at;
      destinoCota = existentePonto.cotaMm;
      destino = 'PONTO_EXISTENTE';
    } else {
      // Ao LADO da condensadora (meia largura + 200 mm ao longo da parede — a mesma distância da
      // parede que ela, para a rota ainda encaixar no eixo), no piso.
      // ⚠️ 11/10/2026 (teste no app real): "ao longo da parede" era a perpendicular de
      // evaporadora→condensadora — certo só com a condensadora EM FRENTE à evaporadora. Deslocada
      // ao longo da fachada, o ponto caía longe dela e o dreno saía na diagonal. Agora é a direção
      // da PAREDE mais perto da condensadora, para o lado da evaporadora (o dreno mais curto).
      const lateral = medCond.larguraMm / 2 + 200;
      const paredeDaCond = encaixarNaParede(saidaAt, base.walls.filter((w) => w.levelId === levelId), hip.raioDeEncaixeMm + medCond.profundidadeMm)?.parede;
      if (paredeDaCond) {
        const L = Math.hypot(paredeDaCond.b.x - paredeDaCond.a.x, paredeDaCond.b.y - paredeDaCond.a.y) || 1;
        const u = { x: (paredeDaCond.b.x - paredeDaCond.a.x) / L, y: (paredeDaCond.b.y - paredeDaCond.a.y) / L };
        const paraEvap = (e.at.x - saidaAt.x) * u.x + (e.at.y - saidaAt.y) * u.y;
        const k = paraEvap < 0 ? -1 : 1;
        destinoAt = { x: Math.round(saidaAt.x + u.x * lateral * k), y: Math.round(saidaAt.y + u.y * lateral * k) };
      } else {
        const dx = saidaAt.x - e.at.x;
        const dy = saidaAt.y - e.at.y;
        const d = Math.hypot(dx, dy) || 1;
        destinoAt = { x: Math.round(saidaAt.x + (-dy / d) * lateral), y: Math.round(saidaAt.y + (dx / d) * lateral) };
      }
      destinoCota = 0;
      destino = 'PONTO_NOVO_NA_FACHADA';
      pecas.push({ type: 'AddTerminal', levelId, disciplina: 'DRENO_AC', tipo: 'Ponto de dreno', tipoHidraulico: 'PONTO_DRENO', at: destinoAt, cotaMm: 0, sugerida: true } as Command);
    }
    // F14c: no forro, o dreno (no eixo da parede, junto do teto) desvia das prumadas das outras redes — a descida da
    // água fria dentro da parede, do forro ao ponto, cruzava o dreno que corria na mesma parede (térrea a 30°).
    // F14d: na saída direta, atrás da evaporadora → para fora → e o último lance, de comprimento zero em planta, é a
    // descida pela fachada até o ponto (o laço da gravidade dá a ele a cota do destino).
    const caminhoDreno =
      direta && !existentePonto
        ? { pontos: [e.at, ...(mesmoP(direta.drenoDentro, e.at) ? [] : [direta.drenoDentro]), direta.drenoNoEixo, direta.drenoFora, ...(mesmoP(direta.drenoFora, direta.drenoDesce) ? [] : [direta.drenoDesce]), direta.drenoDesce], pelaParede: true }
        : caminhoEmPlanta(base, levelId, e.at, destinoAt, hip, undefined, noForro ? prumadasQueCruzam(base, levelId, e.cotaMm, 'DRENO_AC', hip.dnDrenoMm / 2, 10, false) : []);
    // F18: pelo caminho antigo até um ponto novo na fachada, o último lance era uma DIAGONAL do eixo da parede até o
    // chão lá fora — cortava a parede abaixo do topo da janela. Agora atravessa a parede com a declividade e desce na
    // vertical, por fora.
    const pontosD = !direta && destino === 'PONTO_NOVO_NA_FACHADA' && !mesmoP(caminhoDreno.pontos[caminhoDreno.pontos.length - 2] ?? destinoAt, destinoAt) ? [...caminhoDreno.pontos, destinoAt] : caminhoDreno.pontos;
    // C6: o caminho por gravidade já com o vértice do SIFÃO (colinear: não muda o comprimento).
    const comSifao = verticeNoCaminho(pontosD, hip.distanciaDoSifaoMm);
    const pontosG = comSifao.pontos;
    // A queda de CADA lance arredondada para cima (mm inteiros): assim nenhum lance fica abaixo da
    // declividade por arredondamento, e a soma é a queda que o descarte precisa oferecer.
    const lances = pontosG.slice(1).map((q, i) => Math.hypot(q.x - pontosG[i].x, q.y - pontosG[i].y));
    const quedas = lances.map((x) => Math.ceil((x * hip.declividadeDrenoPct) / 100));
    const quedaNecessaria = quedas.reduce((acc, q) => acc + q, 0);
    // A base da evaporadora é por onde o condensado sai; a ponta do dreno fica no nó da peça (coincidência exata).
    const cotaSaida = e.cotaMm;
    // F18: o dreno desce `DRENO_ABAIXO_DA_LINHA_MM` sob a evaporadora antes de sair (em todo caminho por gravidade).
    const comBomba = cotaSaida - DRENO_ABAIXO_DA_LINHA_MM - quedaNecessaria < destinoCota;
    const baseDreno = { levelId, disciplina: 'DRENO_AC' as const, bitolaMm: Math.round(hip.dnDrenoMm), sugerido: true };
    const antesD = l.comandos.length;
    /** C5: os trechos (índices) por onde o condensado DESTA evaporadora passa. */
    const doDreno: number[] = [];
    const addDreno = (a: P2, cotaA: number, b: P2, cotaB: number) => {
      const i = l.add(baseDreno, a, cotaA, b, cotaB);
      if (i != null) doDreno.push(i);
    };
    // F18 (decisão da F14d: "cômodo sem parede externa cai na bomba de dreno"): sem a saída direta, com forro e um
    // ponto novo na fachada, a bomba fica junto da evaporadora e o dreno corre pelas paredes SEM declividade, logo abaixo
    // dela (acima do topo das portas), até a fachada, e desce por fora. Por gravidade ele descia ao longo do caminho e
    // passava pelo topo das portas (o escritório do R1-A); no forro, cruzava a linha nas esquinas dos anéis.
    const peloForro = !direta && !!noForro && !existentePonto && destino === 'PONTO_NOVO_NA_FACHADA';
    if (peloForro) {
      // F24: logo abaixo da evaporadora fica acima do topo das PORTAS, não das janelas (2,12 m × 2,20 m): o caminho que
      // passa por uma janela que alcança essa cota corre acima dela — a bomba recalca, a cota pode subir.
      const rD = hip.dnDrenoMm / 2;
      const abaixo = cotaSaida - DRENO_ABAIXO_DA_LINHA_MM;
      const topo = topoDasAberturasNoCaminho(base, levelId, pontosD, abaixo, rD);
      const cotaDoDreno = topo == null ? abaixo : Math.round(topo + rD + (hip.folgaDoDrenoSobreAberturaMm ?? HIPOTESES_DA_LINHA_PADRAO.folgaDoDrenoSobreAberturaMm));
      const q0 = pontosD.length > 1 ? pontosD[1] : destinoAt;
      const dd = Math.hypot(q0.x - e.at.x, q0.y - e.at.y) || 1;
      const bombaAt = { x: Math.round(e.at.x + ((q0.x - e.at.x) / dd) * Math.min(300, dd)), y: Math.round(e.at.y + ((q0.y - e.at.y) / dd) * Math.min(300, dd)) };
      // A saída DESCE (a linha sobe no mesmo ponto); se o dreno corre acima da janela, quem sobe é a bomba.
      pecas.push({ type: 'AddTerminal', levelId, disciplina: 'DRENO_AC', tipo: 'Bomba de dreno', tipoHidraulico: 'BOMBA_DRENO', at: bombaAt, cotaMm: abaixo, sugerida: true } as Command);
      addDreno(e.at, cotaSaida, e.at, abaixo);
      addDreno(e.at, abaixo, bombaAt, abaixo);
      if (cotaDoDreno !== abaixo) addDreno(bombaAt, abaixo, bombaAt, cotaDoDreno);
      let atual: P2 = bombaAt;
      for (const q of pontosD.slice(1)) {
        if (mesmoP(q, atual)) continue;
        addDreno(atual, cotaDoDreno, q, cotaDoDreno);
        atual = q;
      }
      addDreno(atual, cotaDoDreno, atual, destinoCota);
      avisos.push('cômodo sem parede externa: bomba de dreno junto da evaporadora — o dreno corre pelas paredes logo abaixo dela até a fachada');
    } else if (comBomba) {
      // Recalque: a bomba junto da evaporadora (30 cm ao longo do primeiro lance), e o dreno sobe o que precisar.
      const q0 = pontosD.length > 1 ? pontosD[1] : destinoAt;
      const dd = Math.hypot(q0.x - e.at.x, q0.y - e.at.y) || 1;
      const bombaAt = { x: Math.round(e.at.x + ((q0.x - e.at.x) / dd) * Math.min(300, dd)), y: Math.round(e.at.y + ((q0.y - e.at.y) / dd) * Math.min(300, dd)) };
      pecas.push({ type: 'AddTerminal', levelId, disciplina: 'DRENO_AC', tipo: 'Bomba de dreno', tipoHidraulico: 'BOMBA_DRENO', at: bombaAt, cotaMm: cotaSaida, sugerida: true } as Command);
      addDreno(e.at, cotaSaida, bombaAt, cotaSaida);
      let atual: P2 = bombaAt;
      let cota = cotaSaida;
      // Sobe/desce em linha até a cota do destino ao longo do caminho (recalque não tem declividade).
      const resto = [...pontosD.slice(1)];
      const total = resto.reduce((acc, q, i) => acc + Math.hypot(q.x - (i === 0 ? bombaAt : resto[i - 1]).x, q.y - (i === 0 ? bombaAt : resto[i - 1]).y), 0) || 1;
      let andado = 0;
      for (const q of resto) {
        andado += Math.hypot(q.x - atual.x, q.y - atual.y);
        const cotaQ = mesmoP(q, destinoAt) ? destinoCota : Math.round(cotaSaida + ((destinoCota - cotaSaida) * andado) / total);
        addDreno(atual, cota, q, cotaQ);
        atual = q;
        cota = cotaQ;
      }
      avisos.push('descarte acima da queda possível: bomba de dreno junto da evaporadora (recalque)');
    } else {
      // Gravidade: cada lance desce a sua queda; o último cai na cota do destino (que está abaixo, pela conta acima).
      let atual: P2 = e.at;
      let cota = cotaSaida;
      // F14d: na saída direta, o dreno desce primeiro sob a evaporadora — a linha sai na cota dela, ao lado; saindo do
      // mesmo nó quase na mesma direção, os dois se encostavam (25 mm).
      // F18: e também no caminho pelo forro — a linha sobe ali do lado, e o dreno saía na cota dela (R1-A, 3 cm).
      {
        // F19: na saída direta, também abaixo da viga E da linha — a linha desce atrás até a travessia (ver acima) e o
        // dreno, saindo do nó rumo à parede, cruzava por cima dela (R1-A, 4 cm entre eixos).
        const abaixo = direta && !existentePonto ? direta.cotaDrenoMm : cota - DRENO_ABAIXO_DA_LINHA_MM;
        addDreno(e.at, cota, e.at, abaixo);
        cota = abaixo;
      }
      pontosG.slice(1).forEach((q, i, arr) => {
        const ultimo = i === arr.length - 1;
        const cotaQ = ultimo ? destinoCota : cota - quedas[i];
        addDreno(atual, cota, q, cotaQ);
        if (i + 1 === comSifao.indice) sifoes.push({ type: 'AddTerminal', levelId, disciplina: 'DRENO_AC', tipo: 'Sifão do dreno', tipoHidraulico: 'SIFAO_DRENO', at: { x: q.x, y: q.y }, cotaMm: cotaQ, sugerida: true } as Command);
        atual = q;
        cota = cotaQ;
      });
    }
    const sifaoNoDreno = !comBomba && comSifao.indice > 0;
    const vazao = condensadoDaEvaporadoraLh(e, hip);
    for (const i of new Set(doDreno)) vazaoNoTrecho.set(i, (vazaoNoTrecho.get(i) ?? 0) + vazao);
    const comprimentoDreno = l.arestas.slice(antesD).reduce((acc, a) => acc + a.mm, 0);
    aCriar.push({ evaporadoraId: e.id, condensadoraId: c.id, nome, linha: precisaLinha, faixa, comprimentoMm: comprimento, desnivelMm: desnivel, dreno: { destino, comBomba, comprimentoMm: comprimentoDreno, comSifao: sifaoNoDreno }, avisos });
  }

  if (aCriar.length === 0) {
    const motivo = jaLigados.length ? 'todas as evaporadoras já têm linha (split) e dreno confirmados' : null;
    return { comandos: apagar, aCriar: [], jaLigados, semLugar, apagados: apagar.length, motivo, resumo: [] };
  }
  // C5: o DN de cada trecho novo de dreno pela vazão de quem passa nele (o compartilhado soma).
  for (const [i, vazao] of vazaoNoTrecho) {
    const cmd = l.comandos[i] as Extract<Command, { type: 'AddTrecho' }>;
    cmd.bitolaMm = dnDoDrenoMm(vazao, hip);
  }
  // Prova na cópia: o lote aplica?
  const comandos = [...apagar, ...pecas, ...l.comandos, ...sifoes];
  try {
    applyBatch(model, comandos);
  } catch (err) {
    return vazio(`o plano não aplica: ${err instanceof Error ? err.message : String(err)}`, apagar);
  }
  const m1 = (mm: number) => (mm / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const resumo = aCriar.map((x) => {
    const linha = x.linha ? `linha ${m1(x.comprimentoMm)} m (Ø ${x.faixa.liquidoMm}/${x.faixa.succaoMm} mm, máx. ${x.faixa.comprimentoMaxM} m)` : '';
    const dreno = x.dreno ? `dreno ${m1(x.dreno.comprimentoMm)} m ${x.dreno.comBomba ? 'com bomba' : x.dreno.comSifao ? 'por gravidade, com sifão' : 'por gravidade'} ${x.dreno.destino === 'PONTO_EXISTENTE' ? 'ao ponto de dreno' : 'a um ponto novo na fachada'}` : '';
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
/**
 * 11/10/2026 (teste do usuário no app real): a linha do split JÁ existente acompanha a
 * capacidade — a evaporadora ganhou 24.000 BTU/h depois de a linha ter saído na faixa
 * menor (sem capacidade). Sobe o diâmetro (líquido/sucção) e o isolamento para os da
 * faixa pedida, MAS só onde o valor do trecho ainda é um AUTOMÁTICO (o par de uma das
 * faixas; um dos isolamentos das premissas) e está ABAIXO do pedido. O que o
 * projetista digitou, e o que já passa do pedido, fica. Um comando por trecho mudado.
 */
export function comandosDaLinhaPelaCapacidade(model: BlueprintModel, levelId: ObjectId, hip: HipotesesDaLinha): Command[] {
  const porId = new Map((model.trechos ?? []).map((t) => [t.id, t]));
  const paresAutomaticos = FAIXAS_DA_LINHA.map((f) => `${f.liquidoMm}/${f.succaoMm}`);
  const isolamentosAutomaticos = [hip.isolamentoAte24kMm, hip.isolamentoAcimaMm];
  const cmds: Command[] = [];
  for (const s of sistemasDoNivel(model, levelId).filter(ehSplit)) {
    const linha = linhaExistente(model, s);
    if (!linha) continue;
    const cap = s.evaporadora.capacidadeBtuH ?? s.condensadora.capacidadeBtuH ?? null;
    if (cap == null) continue;
    const f = faixaDaLinha(cap);
    const iso = isolamentoDaLinhaMm(cap, hip);
    for (const id of linha.trechoIds) {
      const t = porId.get(id);
      if (!t) continue;
      const succao = t.bitolaSuccaoMm ?? t.bitolaMm;
      const mudar: { bitolaMm?: number; bitolaSuccaoMm?: number; isolamentoMm?: number } = {};
      if (paresAutomaticos.includes(`${t.bitolaMm}/${succao}`) && (t.bitolaMm < f.liquidoMm || succao < f.succaoMm)) {
        mudar.bitolaMm = Math.max(t.bitolaMm, f.liquidoMm);
        mudar.bitolaSuccaoMm = Math.max(succao, f.succaoMm);
      }
      if (t.isolamentoMm != null && isolamentosAutomaticos.includes(t.isolamentoMm) && t.isolamentoMm < iso) mudar.isolamentoMm = iso;
      if (Object.keys(mudar).length) cmds.push({ type: 'SetTrechoProps', trechoId: t.id, ...mudar } as Command);
    }
  }
  return cmds;
}

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
    // C1: em cota de MUNDO — a condensadora pode estar em outro pavimento.
    const desnivelM = desnivelDoSistemaMm(model, s) / 1000;
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
    const raioMinimoMm = raioMinimoDaCurvaMm(Math.max(faixa.succaoMm, ...dnSuccaoMm), hip.raioDaCurvaEmDiametros);
    if (cap == null) pend.push('capacidade não declarada — a faixa usada é a menor');
    return { evaporadoraId: s.evaporadora.id, condensadoraId: s.condensadora.id, nome: s.evaporadora.tipo, capacidadeBtuH: cap, faixa, comprimentoM, desnivelM, dnLiquidoMm, dnSuccaoMm, isolamentoMinMm, gasAdicionalG, curvas, raioMinimoMm, pendencias: pend };
  });
}

/** O dreno de cada evaporadora: chega a um ponto de dreno? por gravidade ou bomba? C6: com sifão no caminho? */
export function drenosConferidos(model: BlueprintModel, levelId: ObjectId): { evaporadoraId: ObjectId; nome: string; chega: boolean; comBomba: boolean; comSifao: boolean }[] {
  const arestas = arestasDe(model, 'DRENO_AC');
  const pontos = (model.terminais ?? []).filter((t) => t.levelId === levelId && t.tipoHidraulico === 'PONTO_DRENO');
  const bombas = (model.terminais ?? []).filter((t) => t.levelId === levelId && t.tipoHidraulico === 'BOMBA_DRENO');
  const sifoes = new Set((model.terminais ?? []).filter((t) => t.levelId === levelId && t.tipoHidraulico === 'SIFAO_DRENO').map((t) => noDe(model, t)));
  return (model.terminais ?? [])
    .filter((t) => t.levelId === levelId && !!t.tipoHidraulico && (TIPOS_DE_EVAPORADORA as readonly string[]).includes(t.tipoHidraulico))
    .map((e) => {
      const de = noDe(model, e);
      const caminhos = pontos.map((p) => menorCaminhoEntre(de, noDe(model, p), arestas)).filter((c): c is NonNullable<typeof c> => !!c);
      const chega = caminhos.length > 0;
      const comBomba = bombas.some((b) => !!menorCaminhoEntre(de, noDe(model, b), arestas));
      const comSifao = caminhos.some((c) => c.arestas.some((i) => sifoes.has(arestas[i].de) || sifoes.has(arestas[i].para)));
      return { evaporadoraId: e.id, nome: e.tipo, chega, comBomba, comSifao };
    });
}

export interface DrenoPorVazao {
  trechoId: ObjectId;
  vazaoLh: number;
  pedeMm: number;
  bitolaMm: number;
}

/**
 * C5: cada trecho de dreno do pavimento com a vazão de condensado que passa nele
 * (as evaporadoras cujo caminho até o ponto de dreno — ou a bomba — o usa) e o DN
 * que essa vazão pede.
 */
export function drenosPorVazao(model: BlueprintModel, levelId: ObjectId, hip: HipotesesDaLinha): DrenoPorVazao[] {
  const arestas = arestasDe(model, 'DRENO_AC');
  if (arestas.length === 0) return [];
  const destinos = (model.terminais ?? []).filter((t) => t.levelId === levelId && (t.tipoHidraulico === 'PONTO_DRENO' || t.tipoHidraulico === 'BOMBA_DRENO'));
  const vazao = new Map<ObjectId, number>();
  for (const e of (model.terminais ?? []).filter((t) => t.levelId === levelId && !!t.tipoHidraulico && (TIPOS_DE_EVAPORADORA as readonly string[]).includes(t.tipoHidraulico))) {
    const de = noDe(model, e);
    const caminho = destinos
      .map((d) => menorCaminhoEntre(de, noDe(model, d), arestas))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .sort((a, b) => a.mm - b.mm)[0];
    if (!caminho) continue;
    const q = condensadoDaEvaporadoraLh(e, hip);
    for (const i of new Set(caminho.arestas)) {
      const id = (arestas[i].ref as { existente: ObjectId }).existente;
      vazao.set(id, (vazao.get(id) ?? 0) + q);
    }
  }
  const porId = new Map((model.trechos ?? []).map((t) => [t.id, t]));
  return [...vazao.entries()]
    .filter(([id]) => porId.get(id)?.levelId === levelId)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([trechoId, vazaoLh]) => ({ trechoId, vazaoLh, pedeMm: dnDoDrenoMm(vazaoLh, hip), bitolaMm: porId.get(trechoId)!.bitolaMm }));
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
  // C5: o DN de cada trecho de dreno pela vazão de condensado de quem passa nele.
  const porVazao = drenosPorVazao(model, levelId, hip);
  const finos = porVazao.filter((d) => d.bitolaMm < d.pedeMm);
  const maiorVazao = porVazao.reduce((m, d) => Math.max(m, d.vazaoLh), 0);
  const l1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  itens.push({
    codigo: 'DN_DRENO',
    item: 'DN do dreno pela vazão de condensado (hipótese — CONFERIR)',
    estado: porVazao.length === 0 ? 'NAO_AVALIADO' : finos.length ? 'FALTA' : 'OK',
    obtido: porVazao.length === 0 ? 'nenhum dreno ligado a evaporadora' : finos.length ? `${finos.length} trecho(s) abaixo do DN pedido (${finos.map((d) => `${l1(d.vazaoLh)} L/h pede DN ${d.pedeMm}, tem ${d.bitolaMm}`).join('; ')})` : `${porVazao.length} trecho(s) ok; maior vazão ${l1(maiorVazao)} L/h`,
    spaceIds: [],
  });
  // C6: o sifão no dreno por gravidade (a bomba tem o dela).
  const porGravidade = drenos.filter((d) => d.chega && !d.comBomba);
  const semSifao = porGravidade.filter((d) => !d.comSifao);
  itens.push({
    codigo: 'SIFAO',
    item: 'Sifão no dreno por gravidade',
    estado: porGravidade.length === 0 ? 'NAO_AVALIADO' : semSifao.length ? 'AVISO' : 'OK',
    obtido: porGravidade.length === 0 ? 'nenhum dreno por gravidade' : semSifao.length ? `sem sifão: ${nomes(semSifao)}` : `${porGravidade.length} dreno(s) com sifão`,
    spaceIds: [],
  });
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
