/**
 * ESGOTO AUTOMÁTICO (18/09/2026, F5 da hidráulica: *"esgoto: pontos → caixa de
 * inspeção"*).
 *
 * ─── O MODELO DE REDE ────────────────────────────────────────────────────────
 *
 *   1. o DESTINO é a CAIXA DE INSPEÇÃO (`CAIXA_INSPECAO`) do pavimento mais
 *      baixo — a mais próxima, em planta, de cada ponto. Sem CI não há rede.
 *   2. a TOPOLOGIA é a de uma casa comum:
 *        - lavatório, chuveiro, ralo, tanque e máquina → o COLETOR do próprio
 *          ambiente (caixa sifonada; senão ralo sifonado); sem coletor, vão
 *          direto ao destino, com aviso;
 *        - vaso sanitário → DIRETO ao destino (DN 100), nunca pela caixa sifonada;
 *        - pia de cozinha → CAIXA DE GORDURA mais próxima do pavimento → destino;
 *          sem caixa de gordura, direto, com aviso;
 *        - coletores e caixa de gordura → destino.
 *   3. cada ramal corre SOB O PISO (`cotaMinimaSobPisoMm`, −150) e DESCE com o
 *      caimento da NBR 8160 — 2 % até DN 75, 1 % em DN 100 —, das folhas para
 *      a raiz: a cota de um nó é a menor das chegadas, e o trecho seguinte
 *      parte dela. Do aparelho ao ramal, uma prumada na posição dele.
 *   4. o DN de cada trecho sai das UHC (unidades Hunter de contribuição, NBR
 *      8160) acumuladas a montante: ≤3 → 40, ≤6 → 50, ≤20 → 75, mais → 100 —
 *      nunca abaixo do ramal de descarga do aparelho (ficha: vaso 100, pia 50…).
 *   5. PAVIMENTO SUPERIOR: os ramais do andar correm sob o piso dele (que é o
 *      teto do térreo — a chave do nó já enxerga isso) até um TUBO DE QUEDA
 *      (DN 100) na posição do ponto de maior UHC do andar (o vaso, em geral);
 *      o TQ desce pelo térreo até a cota do ramal ali e entra na árvore do
 *      térreo como uma fonte; uma COLUNA DE VENTILAÇÃO (DN 50) sobe do TQ ao
 *      teto do andar.
 *   6. chegada na CI abaixo do FUNDO declarado dela → aviso "aprofundar".
 *
 * Idempotente: ponto que já tem trecho de esgoto na sua posição está ligado.
 * Relançar apaga os sugeridos da rede da CI; refazer apaga tudo. Não há
 * desvio de fundação, viga ou laje — o desenho não os conhece. É
 * pré-dimensionamento; o executivo é do projetista.
 */
import type { BlueprintModel, Command, ObjectId, Space, Terminal, TipoDePontoHidraulico } from './blueprintKernel';
import { pointInPolygon } from './blueprintKernel';
import {
  arvoreComRotaLimitada,
  comprimentoMm,
  fazerChave,
  type Aresta,
  type No,
  type Ponto2,
} from './blueprintGrafoDeRede';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { shaftPreferido } from './blueprintNucleoVertical';
import { redeDaOrigem } from './blueprintAguaAutomatica';

export interface HipotesesDeEsgoto {
  /** Caimento mínimo, em %, para DN até 75 e para DN 100 ou mais (NBR 8160). */
  caimentoPctAte75: number;
  caimentoPctDe100: number;
  /** Cota em que o ramal começa sob o piso, mm (negativa). */
  cotaMinimaSobPisoMm: number;
  dnTuboQuedaMm: number;
  dnVentilacaoMm: number;
  rotaMaximaVezes: number | null;
  /** Raio em que um SHAFT (E2.4) atrai o tubo de queda. Ausente = 3000. */
  raioDoShaftMm?: number;
}

export const HIPOTESES_ESGOTO_PADRAO: HipotesesDeEsgoto = {
  caimentoPctAte75: 2,
  caimentoPctDe100: 1,
  cotaMinimaSobPisoMm: -150,
  dnTuboQuedaMm: 100,
  dnVentilacaoMm: 50,
  rotaMaximaVezes: 1.5,
  raioDoShaftMm: 3000,
};

/** DN do ramal pelas UHC acumuladas (NBR 8160, simplificado). */
export function dnPorUhc(uhc: number): number {
  if (uhc <= 3) return 40;
  if (uhc <= 6) return 50;
  if (uhc <= 20) return 75;
  return 100;
}

export const caimentoPct = (dn: number, hip: HipotesesDeEsgoto) => (dn >= 100 ? hip.caimentoPctDe100 : hip.caimentoPctAte75);

export interface PavimentoDoPlanoDeEsgoto {
  levelId: ObjectId;
  nome: string;
  fontes: number;
  ligadas: number;
  aLigar: number;
  tuboDeQueda: boolean;
}

export interface PlanoDeEsgoto {
  destinoId: ObjectId | null;
  pavimentos: PavimentoDoPlanoDeEsgoto[];
  fontes: number;
  ligadas: number;
  aLigar: number;
  uhcTotal: number;
  dnMaximoMm: number;
  /** A cota (mm, do piso do térreo) em que a rede chega à CI. */
  cotaDeChegadaMm: number | null;
  sugeridos: number;
  trechosDaRede: number;
  comandos: Command[];
  metrosPrevistos: number;
  avisos: string[];
  motivo: string | null;
}

type Fonte = {
  terminal: Terminal;
  uhc: number;
  dnMinimo: number;
  destino: Terminal | null;
  /** A prumada da fonte até o ramal leva este rótulo/DN — é como o tubo de queda entra no térreo. */
  prumada?: { rotulo: string; dnMm: number };
};

const COLETORES: TipoDePontoHidraulico[] = ['CAIXA_SIFONADA', 'RALO_SIFONADO'];
const APARELHOS_DO_COLETOR: TipoDePontoHidraulico[] = ['LAVATORIO', 'CHUVEIRO', 'RALO_SECO', 'TANQUE', 'MAQUINA_LAVAR', 'DUCHA_HIGIENICA', 'TORNEIRA'];

const uhcDe = (t: Terminal) => (t.tipoHidraulico ? (FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico].uhcNbr8160 ?? 0) : 0);
const dnFichaDe = (t: Terminal) => (t.tipoHidraulico ? (FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico].dnMinimoMm.ESGOTO ?? 40) : 40);
const distancia = (a: Ponto2, b: Ponto2) => Math.hypot(a.x - b.x, a.y - b.y);

function espacoDe(model: BlueprintModel, t: Terminal): Space | null {
  return (
    model.spaces.find((s) => s.levelId === t.levelId && pointInPolygon(s.ring, t.at) && !s.holes.some((h) => pointInPolygon(h, t.at))) ?? null
  );
}

/** Os pontos de esgoto tipados do desenho (fora as caixas de inspeção). */
export function fontesDeEsgoto(model: BlueprintModel): Terminal[] {
  return (model.terminais ?? []).filter((t) => t.disciplina === 'ESGOTO' && t.tipoHidraulico != null && t.tipoHidraulico !== 'CAIXA_INSPECAO');
}

export function caixasDeInspecao(model: BlueprintModel): Terminal[] {
  return (model.terminais ?? []).filter((t) => t.disciplina === 'ESGOTO' && t.tipoHidraulico === 'CAIXA_INSPECAO');
}

export function planejarEsgoto(model: BlueprintModel, hip: HipotesesDeEsgoto = HIPOTESES_ESGOTO_PADRAO): PlanoDeEsgoto {
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const indice = new Map(niveis.map((l, i) => [l.id, i]));
  const cis = caixasDeInspecao(model);
  const avisos: string[] = [];
  const vazio = (motivo: string | null, extra: Partial<PlanoDeEsgoto> = {}): PlanoDeEsgoto => ({
    destinoId: null, pavimentos: [], fontes: 0, ligadas: 0, aLigar: 0, uhcTotal: 0, dnMaximoMm: 0, cotaDeChegadaMm: null,
    sugeridos: 0, trechosDaRede: 0, comandos: [], metrosPrevistos: 0, avisos, motivo, ...extra,
  });
  if (cis.length === 0) return vazio('coloque uma caixa de inspeção (Hidráulica › esgoto) — é o destino da rede');
  // O destino fica no pavimento mais baixo que tem CI.
  const nivelDoDestino = niveis.find((l) => cis.some((c) => c.levelId === l.id))!;
  const cisDoTerreo = cis.filter((c) => c.levelId === nivelDoDestino.id);
  const idxDestino = indice.get(nivelDoDestino.id) ?? 0;
  const rede = cisDoTerreo.flatMap((ci) => redeDaOrigem(model, ci, 'ESGOTO'));
  const sugeridos = rede.filter((t) => t.sugerido).length;

  const todas = fontesDeEsgoto(model).filter((t) => (indice.get(t.levelId) ?? 0) >= idxDestino);
  if (todas.length === 0) return vazio('nenhum ponto de esgoto tipado', { sugeridos, trechosDaRede: rede.length, destinoId: cisDoTerreo[0].id });

  // Ligados: já há trecho de esgoto encostando na posição.
  const pontas = new Map<ObjectId, Set<string>>();
  for (const t of (model.trechos ?? []).filter((x) => x.disciplina === 'ESGOTO')) {
    const s = pontas.get(t.levelId) ?? new Set<string>();
    s.add(`${t.a.x},${t.a.y}`);
    s.add(`${t.b.x},${t.b.y}`);
    pontas.set(t.levelId, s);
  }
  const ligada = (t: Terminal) => pontas.get(t.levelId)?.has(`${t.at.x},${t.at.y}`) ?? false;

  // ── Quem vai para onde ────────────────────────────────────────────────────
  const coletores = todas.filter((t) => COLETORES.includes(t.tipoHidraulico!));
  const gorduras = todas.filter((t) => t.tipoHidraulico === 'CAIXA_GORDURA');
  const maisProxima = (de: Terminal, entre: Terminal[]) =>
    entre.filter((x) => x.levelId === de.levelId && x.id !== de.id).sort((a, b) => distancia(a.at, de.at) - distancia(b.at, de.at))[0] ?? null;
  const fontes: Fonte[] = todas.map((t) => {
    const tipo = t.tipoHidraulico!;
    let destino: Terminal | null = null;
    if (APARELHOS_DO_COLETOR.includes(tipo)) {
      const espaco = espacoDe(model, t);
      const noAmbiente = coletores.filter((c) => c.id !== t.id && (espaco ? pointInPolygon(espaco.ring, c.at) && c.levelId === t.levelId : false));
      const caixa = noAmbiente.find((c) => c.tipoHidraulico === 'CAIXA_SIFONADA') ?? noAmbiente[0] ?? null;
      if (caixa) destino = caixa;
      else avisos.push(`${FICHA_DO_PONTO_HIDRAULICO[tipo].rotulo} em ${espaco?.name ?? 'ambiente sem nome'} sem caixa sifonada — ligado direto à caixa de inspeção`);
    } else if (tipo === 'PIA_COZINHA') {
      const cg = maisProxima(t, gorduras);
      if (cg) destino = cg;
      else avisos.push('pia de cozinha sem caixa de gordura — ligada direto à caixa de inspeção');
    }
    return { terminal: t, uhc: uhcDe(t), dnMinimo: dnFichaDe(t), destino };
  });

  // ── Pavimentos, TQ e a árvore de cada um ─────────────────────────────────
  const chave = fazerChave(model.levels);
  const novos: Extract<Command, { type: 'AddTrecho' }>[] = [];
  const arestas: Aresta[] = [];
  /** Aresta dirigida do grafo em planta: `de` é jusante (rumo à CI), `para` é montante. */
  const dirigidas: { levelId: ObjectId; de: Ponto2; para: Ponto2; deKey: string; paraKey: string }[] = [];
  const k2 = (levelId: ObjectId, p: Ponto2) => `${levelId}|${p.x},${p.y}`;
  const pendentesPorNivel = new Map<ObjectId, Fonte[]>();
  for (const f of fontes) pendentesPorNivel.set(f.terminal.levelId, [...(pendentesPorNivel.get(f.terminal.levelId) ?? []), f]);

  const pavimentos: PavimentoDoPlanoDeEsgoto[] = [];
  /** As fontes que entram na árvore do térreo vindas de cima: o TQ de cada andar (posição, UHC, DN, cota do topo no térreo). */
  const chegadasDeCima: { pos: Ponto2; uhc: number; dnMinimo: number; topoNoTerreoMm: number }[] = [];
  const cotaPorNo = new Map<string, number>();
  const uhcPorNo = new Map<string, number>();
  const dnMinPorNo = new Map<string, number>();
  let dnMaximoMm = 0;

  const construirArvoreDoNivel = (
    levelId: ObjectId,
    raiz: Ponto2,
    doNivel: Fonte[],
    cotaDaRaizMinima: number | null,
  ): { cotaRaiz: number; uhc: number; dnMinimo: number } => {
    const raizKey = k2(levelId, raiz);
    // 1) Subárvores dos destinos intermediários (coletor, caixa de gordura).
    const intermediarios = doNivel.filter((f) => doNivel.some((g) => g.destino?.id === f.terminal.id));
    const ligarEmPlanta = (de: Ponto2, para: Ponto2) => {
      dirigidas.push({ levelId, de, para, deKey: k2(levelId, de), paraKey: k2(levelId, para) });
    };
    for (const inter of intermediarios) {
      const filhas = doNivel.filter((f) => f.destino?.id === inter.terminal.id);
      const alcancados = new Map<No, Ponto2>([[k2(levelId, inter.terminal.at), inter.terminal.at]]);
      const rota = new Map<No, number>([[k2(levelId, inter.terminal.at), 0]]);
      const pend = new Map<No, Ponto2>(filhas.filter((f) => f.terminal.id !== inter.terminal.id).map((f) => [k2(levelId, f.terminal.at), f.terminal.at]));
      arvoreComRotaLimitada({ alcancados, rota, pendentes: pend, retaAteRaiz: (p) => distancia(p, inter.terminal.at), limite: hip.rotaMaximaVezes, ligar: (de, para) => ligarEmPlanta(de.pos, para.pos) });
    }
    // 2) Árvore principal: raiz ← intermediários + diretas.
    const diretas = doNivel.filter((f) => f.destino == null || !doNivel.some((g) => g.terminal.id === f.destino!.id));
    const alcancados = new Map<No, Ponto2>([[raizKey, raiz]]);
    const rota = new Map<No, number>([[raizKey, 0]]);
    const pend = new Map<No, Ponto2>();
    for (const f of diretas) if (k2(levelId, f.terminal.at) !== raizKey) pend.set(k2(levelId, f.terminal.at), f.terminal.at);
    arvoreComRotaLimitada({ alcancados, rota, pendentes: pend, retaAteRaiz: (p) => distancia(p, raiz), limite: hip.rotaMaximaVezes, ligar: (de, para) => ligarEmPlanta(de.pos, para.pos) });

    // 3) UHC e DN mínimo a montante de cada nó (recursão da raiz para as folhas).
    const filhosDe = new Map<string, typeof dirigidas>();
    for (const d of dirigidas.filter((x) => x.levelId === levelId)) filhosDe.set(d.deKey, [...(filhosDe.get(d.deKey) ?? []), d]);
    const proprio = (key: string) => {
      let uhc = 0;
      let dn = 40;
      for (const f of doNivel) {
        if (k2(levelId, f.terminal.at) !== key) continue;
        uhc += f.uhc;
        dn = Math.max(dn, f.dnMinimo);
      }
      return { uhc, dn };
    };
    const acumular = (key: string): { uhc: number; dn: number } => {
      const memo = uhcPorNo.get(key);
      if (memo != null) return { uhc: memo, dn: dnMinPorNo.get(key) ?? 40 };
      let { uhc, dn } = proprio(key);
      for (const d of filhosDe.get(key) ?? []) {
        const sub = acumular(d.paraKey);
        uhc += sub.uhc;
        dn = Math.max(dn, sub.dn);
      }
      uhcPorNo.set(key, uhc);
      dnMinPorNo.set(key, dn);
      return { uhc, dn };
    };
    const total = acumular(raizKey);

    // 4) Cotas das folhas para a raiz: cada trecho desce com o caimento do seu DN.
    const dnDaAresta = (d: (typeof dirigidas)[number]) => Math.max(dnPorUhc(uhcPorNo.get(d.paraKey) ?? 0), dnMinPorNo.get(d.paraKey) ?? 40);
    const cotaDe = (key: string): number => {
      const memo = cotaPorNo.get(key);
      if (memo != null) return memo;
      let cota = hip.cotaMinimaSobPisoMm;
      for (const d of filhosDe.get(key) ?? []) {
        const dn = dnDaAresta(d);
        const queda = Math.max(1, Math.round((distancia(d.de, d.para) * caimentoPct(dn, hip)) / 100));
        cota = Math.min(cota, cotaDe(d.paraKey) - queda);
      }
      if (key === raizKey && cotaDaRaizMinima != null) cota = Math.min(cota, cotaDaRaizMinima);
      cotaPorNo.set(key, cota);
      return cota;
    };
    const cotaRaiz = cotaDe(raizKey);

    // 5) Os comandos: trechos em planta com as cotas, e a prumada de cada fonte até o seu nó.
    const addTrecho = (a: Ponto2, cotaA: number, b: Ponto2, cotaB: number, bitolaMm: number, rotulo?: string) => {
      const de = chave(levelId, a.x, a.y, cotaA);
      const para = chave(levelId, b.x, b.y, cotaB);
      if (de === para) return;
      if (arestas.some((x) => (x.de === de && x.para === para) || (x.de === para && x.para === de))) return;
      novos.push({ type: 'AddTrecho', levelId, disciplina: 'ESGOTO', a: { ...a }, b: { ...b }, cotaAMm: cotaA, cotaBMm: cotaB, bitolaMm, sugerido: true, ...(rotulo ? { rotulo } : {}) });
      arestas.push({ ref: { novo: novos.length - 1 }, de, para, mm: comprimentoMm({ a, b, cotaAMm: cotaA, cotaBMm: cotaB }) });
      dnMaximoMm = Math.max(dnMaximoMm, bitolaMm);
    };
    for (const d of dirigidas.filter((x) => x.levelId === levelId)) {
      const dn = dnDaAresta(d);
      // De montante (para) para jusante (de): a cota cai no sentido do fluxo.
      addTrecho(d.para, cotaDe(d.paraKey), d.de, cotaDe(d.deKey), dn);
    }
    for (const f of doNivel) {
      const key = k2(levelId, f.terminal.at);
      const cotaNo = cotaDe(key);
      if (f.terminal.cotaMm !== cotaNo) {
        addTrecho(f.terminal.at, f.terminal.cotaMm, f.terminal.at, cotaNo, f.prumada?.dnMm ?? Math.max(f.dnMinimo, dnPorUhc(f.uhc)), f.prumada?.rotulo);
      }
    }
    return { cotaRaiz, uhc: total.uhc, dnMinimo: total.dn };
  };

  // Pavimentos de cima para baixo: o TQ de cada andar vira chegada no térreo.
  const niveisComFontes = niveis.filter((l) => (pendentesPorNivel.get(l.id) ?? []).length > 0 && (indice.get(l.id) ?? 0) > idxDestino).reverse();
  for (const nivel of niveisComFontes) {
    const doNivel = (pendentesPorNivel.get(nivel.id) ?? []).filter((f) => !ligada(f.terminal));
    const todasDoNivel = pendentesPorNivel.get(nivel.id) ?? [];
    if (doNivel.length === 0) {
      pavimentos.push({ levelId: nivel.id, nome: nivel.name, fontes: todasDoNivel.length, ligadas: todasDoNivel.length, aLigar: 0, tuboDeQueda: false });
      continue;
    }
    // O TQ na posição do ponto de maior UHC do andar (o vaso, em geral); um TQ já
    // desenhado (rótulo "TQ") na mesma posição é reaproveitado pela idempotência.
    const maior = [...doNivel].sort((a, b) => b.uhc - a.uhc || a.terminal.at.x - b.terminal.at.x || a.terminal.at.y - b.terminal.at.y)[0];
    // NÚCLEO VERTICAL (E2.4): com um shaft ao alcance, o TQ desce por ele.
    const tq = shaftPreferido(model, { x: maior.terminal.at.x, y: maior.terminal.at.y }, nivel.id, hip.raioDoShaftMm ?? 3000) ?? { x: maior.terminal.at.x, y: maior.terminal.at.y };
    const { cotaRaiz, uhc, dnMinimo } = construirArvoreDoNivel(nivel.id, tq, doNivel, null);
    // Ventilação: do nó do TQ ao teto do andar.
    novos.push({ type: 'AddTrecho', levelId: nivel.id, disciplina: 'ESGOTO', a: { ...tq }, b: { ...tq }, cotaAMm: cotaRaiz, cotaBMm: nivel.defaultHeightMm, bitolaMm: hip.dnVentilacaoMm, sugerido: true, rotulo: 'Ventilação' });
    arestas.push({ ref: { novo: novos.length - 1 }, de: chave(nivel.id, tq.x, tq.y, cotaRaiz), para: chave(nivel.id, tq.x, tq.y, nivel.defaultHeightMm), mm: nivel.defaultHeightMm - cotaRaiz });
    // A chegada no pavimento de baixo: o TQ começa onde o ramal do andar termina
    // (sob o piso dele = teto do de baixo + cotaRaiz, negativa) e desce até o
    // ramal do térreo — a árvore do térreo o recebe como fonte na posição do TQ.
    const abaixo = niveis[(indice.get(nivel.id) ?? 1) - 1];
    chegadasDeCima.push({ pos: tq, uhc, dnMinimo: Math.max(dnMinimo, hip.dnTuboQuedaMm), topoNoTerreoMm: abaixo.defaultHeightMm + cotaRaiz });
    pavimentos.push({ levelId: nivel.id, nome: nivel.name, fontes: todasDoNivel.length, ligadas: todasDoNivel.length - doNivel.length, aLigar: doNivel.length, tuboDeQueda: true });
  }

  // O térreo: destino = CI mais próxima do conjunto (uma CI por plano; a mais central).
  const doTerreo = (pendentesPorNivel.get(nivelDoDestino.id) ?? []).filter((f) => !ligada(f.terminal));
  const todasDoTerreo = pendentesPorNivel.get(nivelDoDestino.id) ?? [];
  const candidatos = [...doTerreo.map((f) => f.terminal.at), ...chegadasDeCima.map((c) => c.pos)];
  const centro = candidatos.length > 0
    ? { x: candidatos.reduce((s, p) => s + p.x, 0) / candidatos.length, y: candidatos.reduce((s, p) => s + p.y, 0) / candidatos.length }
    : cisDoTerreo[0].at;
  const ci = [...cisDoTerreo].sort((a, b) => distancia(a.at, centro) - distancia(b.at, centro))[0];
  const fontesDoTerreo: Fonte[] = [
    ...doTerreo,
    // As chegadas de cima entram como fontes "virtuais" na posição do TQ: a
    // prumada delas até o ramal É o tubo de queda.
    ...chegadasDeCima.map<Fonte>((c) => ({
      terminal: { ...ci, id: `tq-${c.pos.x}-${c.pos.y}`, at: c.pos, cotaMm: c.topoNoTerreoMm, tipoHidraulico: null } as Terminal,
      uhc: c.uhc, dnMinimo: c.dnMinimo, destino: null,
      prumada: { rotulo: 'TQ', dnMm: Math.max(hip.dnTuboQuedaMm, c.dnMinimo) },
    })),
  ];
  let cotaDeChegadaMm: number | null = null;
  if (fontesDoTerreo.length > 0) {
    const { cotaRaiz } = construirArvoreDoNivel(nivelDoDestino.id, ci.at, fontesDoTerreo, null);
    cotaDeChegadaMm = cotaRaiz;
    // Da chegada ao fundo da CI: a prumada final até a cota da peça.
    if (cotaRaiz !== ci.cotaMm) {
      const dn = Math.max(dnPorUhc(uhcPorNo.get(k2(nivelDoDestino.id, ci.at)) ?? 0), dnMinPorNo.get(k2(nivelDoDestino.id, ci.at)) ?? 40);
      novos.push({ type: 'AddTrecho', levelId: nivelDoDestino.id, disciplina: 'ESGOTO', a: { ...ci.at }, b: { ...ci.at }, cotaAMm: cotaRaiz, cotaBMm: ci.cotaMm, bitolaMm: dn, sugerido: true });
      dnMaximoMm = Math.max(dnMaximoMm, dn);
    }
    if (cotaRaiz < ci.cotaMm) avisos.push(`a rede chega à caixa de inspeção a ${cotaRaiz} mm, abaixo do fundo declarado (${ci.cotaMm} mm) — aprofunde a caixa`);
  }
  pavimentos.push({ levelId: nivelDoDestino.id, nome: nivelDoDestino.name, fontes: todasDoTerreo.length, ligadas: todasDoTerreo.length - doTerreo.length, aLigar: doTerreo.length, tuboDeQueda: false });
  pavimentos.reverse();

  const aLigar = pavimentos.reduce((n, p) => n + p.aLigar, 0);
  const ligadas = pavimentos.reduce((n, p) => n + p.ligadas, 0);
  const uhcTotal = fontes.reduce((s, f) => s + f.uhc, 0);
  const comandos: Command[] = novos;
  if (comandos.length === 0) return vazio('todos os pontos de esgoto já estão ligados', { destinoId: ci.id, pavimentos, fontes: todas.length, ligadas, sugeridos, trechosDaRede: rede.length, uhcTotal });
  const metros = novos.reduce((s, c) => s + comprimentoMm(c), 0);
  return {
    destinoId: ci.id, pavimentos, fontes: todas.length, ligadas, aLigar, uhcTotal, dnMaximoMm, cotaDeChegadaMm,
    sugeridos, trechosDaRede: rede.length, comandos, metrosPrevistos: Math.round(metros / 100) / 10, avisos, motivo: null,
  };
}

/** RELANÇAR: apaga os trechos SUGERIDOS ligados às caixas de inspeção e refaz. */
export function relancarEsgoto(model: BlueprintModel, hip: HipotesesDeEsgoto = HIPOTESES_ESGOTO_PADRAO): PlanoDeEsgoto {
  const sugeridos = caixasDeInspecao(model).flatMap((ci) => redeDaOrigem(model, ci, 'ESGOTO')).filter((t) => t.sugerido);
  const ids = new Set(sugeridos.map((t) => t.id));
  if (ids.size === 0) return planejarEsgoto(model, hip);
  const plano = planejarEsgoto({ ...model, trechos: (model.trechos ?? []).filter((t) => !ids.has(t.id)) }, hip);
  const remocoes: Command[] = [...ids].map((id) => ({ type: 'DeleteTrecho', trechoId: id }));
  return { ...plano, sugeridos: 0, comandos: [...remocoes, ...plano.comandos], motivo: null };
}

/** REFAZER: apaga TODA a rede de esgoto ligada às caixas de inspeção e lança de novo. */
export function refazerEsgoto(model: BlueprintModel, hip: HipotesesDeEsgoto = HIPOTESES_ESGOTO_PADRAO): PlanoDeEsgoto {
  const daRede = caixasDeInspecao(model).flatMap((ci) => redeDaOrigem(model, ci, 'ESGOTO'));
  const ids = new Set(daRede.map((t) => t.id));
  if (ids.size === 0) return planejarEsgoto(model, hip);
  const plano = planejarEsgoto({ ...model, trechos: (model.trechos ?? []).filter((t) => !ids.has(t.id)) }, hip);
  const remocoes: Command[] = [...ids].map((id) => ({ type: 'DeleteTrecho', trechoId: id }));
  return { ...plano, sugeridos: 0, trechosDaRede: 0, comandos: [...remocoes, ...plano.comandos], motivo: null };
}
