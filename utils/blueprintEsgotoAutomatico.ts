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
 *   7. JUNÇÃO 45° (27/09/2026, pedido com print de isométrico): na árvore que
 *      vai à CI (ou ao tubo de queda), o ramal pode entrar NO MEIO de um trecho
 *      já traçado, no ponto em que chega a 45° a favor do fluxo — o trecho é
 *      partido ali e o encontro vira a junção em Y da NBR 8160, não um tê de
 *      90° nem um ângulo qualquer. Na caixa sifonada e na de gordura cada
 *      aparelho entra direto na caixa (é para isso que ela existe).
 *
 * Idempotente: ponto que já tem trecho de esgoto na sua posição está ligado.
 * Relançar apaga os sugeridos da rede da CI; refazer apaga tudo. Não há
 * desvio de fundação, viga ou laje — o desenho não os conhece. É
 * pré-dimensionamento; o executivo é do projetista.
 */
import { dnDoRamalDeEsgoto, dnDoSubcoletor, dnDoTuboDeQueda, type PapelNoEsgoto } from './blueprintNbr8160';
import type { BlueprintModel, Command, ObjectId, Space, Terminal, TipoDePontoHidraulico } from './blueprintKernel';
import { CATALOGO_DE_COMPONENTES, applyBatch, pointInPolygon } from './blueprintKernel';
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
import { pontosDaLouca } from './blueprintPontosHidraulicos';

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

const COLETORES: TipoDePontoHidraulico[] = ['CAIXA_SIFONADA', 'RALO_SIFONADO', 'RALO_LINEAR'];

/** Afastamento mínimo da junção às pontas do trecho partido, e do ramal ao trecho, mm. */
export const FOLGA_DA_JUNCAO_MM = 150;
/**
 * A junção ganha do nó existente se o ramal dela não passar de 1,25 × o ramal
 * até o nó: o Y a 45° é a ligação certa no esgoto (NBR 8160), e pendurar o
 * ramal no ponto de outro aparelho é o que fazia os ângulos tortos.
 */
export const PREFERENCIA_DA_JUNCAO = 1.25;

/** Aresta dirigida em planta: `de` é JUSANTE (rumo à caixa), `para` é MONTANTE. */
export interface ArestaDeEsgoto {
  de: Ponto2;
  para: Ponto2;
}

/**
 * A árvore da caixa de inspeção COM JUNÇÕES A 45° — como se traça à mão:
 *
 *   1. o TRONCO sai do aparelho MAIS DISTANTE da raiz, reto até ela;
 *   2. cada um dos outros, do mais distante ao mais perto, entra num trecho já
 *      traçado por uma junção a 45° a favor do fluxo, ou direto na raiz (a caixa
 *      recebe várias entradas) — o que for mais curto, com a junção valendo
 *      `PREFERENCIA_DA_JUNCAO` × e a rota limitada (`limite` × a reta) valendo
 *      para as duas;
 *   3. aparelho EM CIMA de um trecho (a menos de `FOLGA_DA_JUNCAO_MM` da reta)
 *      parte o trecho ali: o tubo passa por ele.
 *
 * Nunca pendura um ramal no ponto de OUTRO aparelho nem numa caixa
 * intermediária: era isso que fazia os ângulos tortos (e o vaso entrando pela
 * caixa sifonada). A junção Q: com `h` a distância de P à reta do trecho e `s`
 * a projeção de P a partir da ponta de MONTANTE, Q fica a `s + h` dela — o
 * ramal anda `h` para o lado e `h` a favor do fluxo; Q cai dentro do trecho, a
 * `FOLGA_DA_JUNCAO_MM` das pontas. Determinístico.
 */
export function arvoreComJuncoes45(opts: {
  raiz: Ponto2;
  pendentes: readonly Ponto2[];
  limite: number | null;
}): ArestaDeEsgoto[] {
  const k = (p: Ponto2) => `${p.x},${p.y}`;
  const arestas: ArestaDeEsgoto[] = [];
  /** Caminho em planta de cada nó até a raiz, mm. */
  const rota = new Map<string, number>([[k(opts.raiz), 0]]);
  const ordem = [...new Map(opts.pendentes.map((p) => [k(p), p])).values()]
    .filter((p) => k(p) !== k(opts.raiz))
    .sort((p, q) => distancia(q, opts.raiz) - distancia(p, opts.raiz) || p.x - q.x || p.y - q.y);
  for (const p of ordem) {
    const reta = distancia(p, opts.raiz);
    const cabe = (r: number) => opts.limite == null || r <= opts.limite * reta + 1;
    // Direto na raiz: sempre cabe.
    let melhor: { custo: number; rota: number; parte: { aresta: number; q: Ponto2 } | null } = { custo: reta, rota: reta, parte: null };
    arestas.forEach((a, ia) => {
      const L = distancia(a.de, a.para);
      if (L < 2 * FOLGA_DA_JUNCAO_MM) return;
      const f = { x: (a.de.x - a.para.x) / L, y: (a.de.y - a.para.y) / L };
      const w = { x: p.x - a.para.x, y: p.y - a.para.y };
      const s = w.x * f.x + w.y * f.y;
      const h = Math.abs(w.x * f.y - w.y * f.x);
      const rotaDe = rota.get(k(a.de)) ?? Infinity;
      if (h < FOLGA_DA_JUNCAO_MM) {
        // Em cima do trecho: o tubo passa pelo aparelho (ou pela projeção dele).
        if (s < FOLGA_DA_JUNCAO_MM || s > L - FOLGA_DA_JUNCAO_MM) return;
        const q = h <= 1 ? p : { x: Math.round(a.para.x + s * f.x), y: Math.round(a.para.y + s * f.y) };
        const r = rotaDe + (L - s) + h;
        if (cabe(r) && h < melhor.custo) melhor = { custo: h, rota: r, parte: { aresta: ia, q } };
        return;
      }
      const t = s + h;
      if (t < FOLGA_DA_JUNCAO_MM || t > L - FOLGA_DA_JUNCAO_MM) return;
      const q = { x: Math.round(a.para.x + t * f.x), y: Math.round(a.para.y + t * f.y) };
      if (rota.has(k(q))) return;
      const d = distancia(p, q);
      const r = rotaDe + (L - t) + d;
      if (cabe(r) && d / PREFERENCIA_DA_JUNCAO < melhor.custo) melhor = { custo: d / PREFERENCIA_DA_JUNCAO, rota: r, parte: { aresta: ia, q } };
    });
    if (!melhor.parte) {
      arestas.push({ de: opts.raiz, para: p });
    } else {
      const { aresta, q } = melhor.parte;
      const a = arestas[aresta];
      arestas.splice(aresta, 1, { de: a.de, para: q }, { de: q, para: a.para });
      rota.set(k(q), (rota.get(k(a.de)) ?? 0) + distancia(a.de, q));
      if (k(q) !== k(p)) arestas.push({ de: q, para: p });
    }
    rota.set(k(p), melhor.rota);
  }
  return arestas;
}
const APARELHOS_DO_COLETOR: TipoDePontoHidraulico[] = ['LAVATORIO', 'CHUVEIRO', 'RALO_SECO', 'TANQUE', 'MAQUINA_LAVAR', 'DUCHA_HIGIENICA', 'TORNEIRA', 'BIDE', 'BANHEIRA'];

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
  // A ligação à rede pública (E5.3) é destino, não fonte.
  return (model.terminais ?? []).filter((t) => t.disciplina === 'ESGOTO' && t.tipoHidraulico != null && t.tipoHidraulico !== 'CAIXA_INSPECAO' && t.tipoHidraulico !== 'LIGACAO_ESGOTO');
}

export function caixasDeInspecao(model: BlueprintModel): Terminal[] {
  return (model.terminais ?? []).filter((t) => t.disciplina === 'ESGOTO' && t.tipoHidraulico === 'CAIXA_INSPECAO');
}

/**
 * O PLANO DO ESGOTO, já com os DN das TABELAS da NBR 8160 (E5.1, 29/09/2026).
 *
 * O traçado (abaixo, `planejarEsgotoTracado`) escolhe os DN pelo degrau do
 * ramal; aqui o plano é aplicado numa cópia, o cálculo por PAPEL
 * (`esgotoTrechoATrecho`: tubo de queda pela tabela 6, subcoletor pela 7, DN
 * mínimo 100) diz onde falta diâmetro, e o DN é corrigido NO PRÓPRIO
 * `AddTrecho` — sem depender dos ids que o kernel dará (relançar apaga antes).
 */
export function planejarEsgoto(model: BlueprintModel, hip: HipotesesDeEsgoto = HIPOTESES_ESGOTO_PADRAO): PlanoDeEsgoto {
  const plano = planejarEsgotoTracado(model, hip);
  const indices = plano.comandos.map((c, i) => (c.type === 'AddTrecho' ? i : -1)).filter((i) => i >= 0);
  if (indices.length === 0) return plano;
  let aplicado: BlueprintModel;
  let criados: string[];
  try {
    const r = applyBatch(model, plano.comandos);
    aplicado = r.model;
    criados = r.diff.created.filter((id) => (aplicado.trechos ?? []).some((t) => t.id === id));
  } catch {
    return plano;
  }
  if (criados.length !== indices.length) return plano;
  const indiceDoTrecho = new Map(criados.map((id, k) => [id, indices[k]]));
  const novoDn = new Map<number, number>();
  for (const c of esgotoTrechoATrecho(aplicado, hip)) {
    const i = indiceDoTrecho.get(c.trechoId);
    if (i != null && c.dnAtualMm < c.dnNecessarioMm) novoDn.set(i, c.dnNecessarioMm);
  }
  if (novoDn.size === 0) return plano;
  const comandos = plano.comandos.map((c, i) => (novoDn.has(i) && c.type === 'AddTrecho' ? { ...c, bitolaMm: novoDn.get(i)! } : c));
  return {
    ...plano,
    comandos,
    dnMaximoMm: Math.max(plano.dnMaximoMm, ...novoDn.values()),
    avisos: [...plano.avisos, `${novoDn.size} trecho(s) com o DN pelas tabelas da NBR 8160 (tubo de queda, subcoletor)`],
  };
}

/** O TRAÇADO do esgoto (antes de E5.1, `planejarEsgoto`): caminhos, cotas e o DN pelo degrau do ramal. */
function planejarEsgotoTracado(model: BlueprintModel, hip: HipotesesDeEsgoto): PlanoDeEsgoto {
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
  // O motivo diz O QUE FAZER, não só o que falta. Os casos comuns: a LOUÇA
  // desenhada sem ponto (desenhada antes de 27/09/2026, quando a peça passou a
  // lançar os seus), o aparelho só na água fria (cada rede tem o seu ponto) e o
  // ponto sem tipo.
  const loucasSemEsgoto = (model.componentes ?? [])
    .filter((c) => (indice.get(c.levelId) ?? 0) >= idxDestino && pontosDaLouca(model, c).some((p) => p.disciplina === 'ESGOTO'));
  const nomesDasLoucas = [...new Set(loucasSemEsgoto.map((c) => c.rotulo || CATALOGO_DE_COMPONENTES[c.tipoId].rotulo))].join(', ');
  if (todas.length === 0) return vazio(loucasSemEsgoto.length > 0
    ? `${loucasSemEsgoto.length === 1 ? 'a louça desenhada' : `${loucasSemEsgoto.length} louças desenhadas`} (${nomesDasLoucas}) ainda sem ponto de esgoto — selecione a peça e clique em "Lançar os pontos"`
    : 'coloque os aparelhos na rede de esgoto — no menu Hidráulica, os itens "· esgoto" (Vaso sanitário · esgoto, Chuveiro · esgoto…); o mesmo aparelho na água fria, ou o ponto de esgoto sem tipo, não conta', { sugeridos, trechosDaRede: rede.length, destinoId: cisDoTerreo[0].id });

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
    // 2) Árvore principal: raiz ← intermediários + diretas, com JUNÇÕES A 45°.
    const diretas = doNivel.filter((f) => f.destino == null || !doNivel.some((g) => g.terminal.id === f.destino!.id));
    const pend = new Map<string, Ponto2>();
    for (const f of diretas) if (k2(levelId, f.terminal.at) !== raizKey) pend.set(k2(levelId, f.terminal.at), f.terminal.at);
    for (const a of arvoreComJuncoes45({ raiz, pendentes: [...pend.values()], limite: hip.rotaMaximaVezes })) ligarEmPlanta(a.de, a.para);

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
        // Para CIMA (28/09/2026, achado pelo memorial E3.1): com `round`, 0,72 m a 2 % davam
        // 14 mm de queda = 1,94 % — abaixo da mínima que o próprio lançamento promete.
        const queda = Math.max(1, Math.ceil((distancia(d.de, d.para) * caimentoPct(dn, hip)) / 100 - 1e-9));
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

/**
 * E5.2: os trechos de esgoto (fora a ventilação) que NÃO chegam a nenhuma caixa
 * de inspeção — o esgoto deles não tem para onde ir.
 */
export function trechosDeEsgotoSemDestino(model: BlueprintModel): string[] {
  const raizes = [...(model.terminais ?? []).filter((t) => t.disciplina === 'ESGOTO' && t.tipoHidraulico === 'LIGACAO_ESGOTO'), ...caixasDeInspecao(model)];
  const ligados = new Set(raizes.flatMap((ci) => redeDaOrigem(model, ci, 'ESGOTO')).map((t) => t.id));
  return (model.trechos ?? [])
    .filter((t) => t.disciplina === 'ESGOTO' && t.rotulo !== 'Ventilação' && !ligados.has(t.id))
    .map((t) => t.id)
    .sort();
}

// ─── VERIFICAÇÃO DO DN (28/09/2026, Etapa 0.1 do roadmap hidrossanitário) ────

export interface DnForaDoNecessario {
  trechoId: ObjectId;
  levelId: ObjectId;
  /** O meio do trecho em planta — onde o desenho escreve o aviso. */
  meio: { x: number; y: number };
  dnAtualMm: number;
  dnNecessarioMm: number;
  uhc: number;
  tipo: 'MENOR' | 'MAIOR';
}

/**
 * O DN de CADA trecho da rede de esgoto — inclusive o desenhado à mão — contra
 * o que ele recebe: as UHC acumuladas a montante (NBR 8160) e o maior ramal de
 * descarga que passa por ele (vaso 100…), pela MESMA regra do lançamento
 * (`dnPorUhc` + ficha). Antes só a água avisava, e só DN menor em trecho
 * confirmado ("Aviso de diâmetro inferior ou superior ao necessário", E).
 *
 * A montante é o lado mais longe da caixa de inspeção pela rede (BFS a partir
 * dela). O tubo de queda passa DN ≥ 100 adiante (é o que o lançamento faz) e
 * nunca é "maior que o necessário"; trecho sem UHC a montante (ventilação,
 * ponta morta) não é avaliado.
 */
export function verificarDnDoEsgoto(model: BlueprintModel, hip: HipotesesDeEsgoto = HIPOTESES_ESGOTO_PADRAO): DnForaDoNecessario[] {
  return esgotoTrechoATrecho(model, hip)
    .filter((c) => c.tipo !== null)
    .map((c) => ({ trechoId: c.trechoId, levelId: c.levelId, meio: c.meio, dnAtualMm: c.dnAtualMm, dnNecessarioMm: c.dnNecessarioMm, uhc: c.uhc, tipo: c.tipo! }));
}

/**
 * O CÁLCULO do esgoto trecho a trecho (E3.1, 28/09/2026): o mesmo percurso da
 * verificação acima — UHC acumuladas a montante, DN necessário, o que o trecho
 * tem — mais a declividade e as cotas, para o memorial de cálculo. A
 * verificação é este cálculo filtrado; os dois não podem divergir.
 */
export interface TrechoDeEsgotoCalculado extends Omit<DnForaDoNecessario, 'tipo'> {
  tipo: DnForaDoNecessario['tipo'] | null;
  /** A caixa de inspeção a que o trecho leva. */
  caixaId: ObjectId;
  rotulo: string | null;
  comprimentoM: number;
  /** Cotas (relativas ao pavimento) da ponta de montante e da de jusante, mm. */
  cotaMontanteMm: number;
  cotaJusanteMm: number;
  /** Declividade do trecho, % (null na prumada). */
  declividadePct: number | null;
  declividadeMinimaPct: number;
  /** O papel na árvore (E5.1) — decide a tabela da NBR 8160. */
  papel: PapelNoEsgoto;
  /**
   * E5.2: a água SOBE para chegar à caixa — a ponta de jusante (pela árvore até a
   * CI) está mais alta que a de montante. O sentido não se grava: é o da árvore.
   */
  contrafluxo: boolean;
  /** E5.2: o maior DN dos trechos que chegam à ponta de montante (sem a ventilação); `null` sem nenhum. */
  dnMontanteMaxMm: number | null;
}

export function esgotoTrechoATrecho(model: BlueprintModel, hip: HipotesesDeEsgoto = HIPOTESES_ESGOTO_PADRAO): TrechoDeEsgotoCalculado[] {
  const chave = fazerChave(model.levels);
  // O que chega a cada nó (E5.1): UHC, o maior DN de aparelho, quantas fontes, de
  // quais ambientes e quanta UHC por pavimento — é o que decide o PAPEL do trecho.
  type Carga = { uhc: number; dn: number; fontes: number; ambientes: Set<string>; porNivel: Map<ObjectId, number>; temTQ: boolean };
  const nova = (): Carga => ({ uhc: 0, dn: 40, fontes: 0, ambientes: new Set(), porNivel: new Map(), temTQ: false });
  const fontes = new Map<string, Carga>();
  for (const f of fontesDeEsgoto(model)) {
    const k = chave(f.levelId, f.at.x, f.at.y, f.cotaMm);
    const atual = fontes.get(k) ?? nova();
    atual.uhc += uhcDe(f);
    atual.dn = Math.max(atual.dn, dnFichaDe(f));
    atual.fontes += 1;
    atual.ambientes.add(espacoDe(model, f)?.id ?? `fora|${f.levelId}`);
    atual.porNivel.set(f.levelId, (atual.porNivel.get(f.levelId) ?? 0) + uhcDe(f));
    fontes.set(k, atual);
  }
  const pavimentos = model.levels.length;
  const saida: TrechoDeEsgotoCalculado[] = [];
  const vistos = new Set<ObjectId>();
  // E5.3: a LIGAÇÃO à rede pública é a primeira raiz — o sentido vai até a rede,
  // passando pelas caixas; sem ela, cada CI é raiz como antes.
  const ligacoes = (model.terminais ?? []).filter((t) => t.disciplina === 'ESGOTO' && t.tipoHidraulico === 'LIGACAO_ESGOTO');
  const nosDeCaixa = new Set(caixasDeInspecao(model).map((c) => chave(c.levelId, c.at.x, c.at.y, c.cotaMm)));
  for (const ci of [...ligacoes, ...caixasDeInspecao(model)]) {
    // A VENTILAÇÃO não leva esgoto (E5.4): fora da árvore do fluxo — uma coluna que
    // atravessa o andar de cima criaria um atalho e trocaria o sentido dos ramais.
    const rede = redeDaOrigem(model, ci, 'ESGOTO').filter((t) => t.rotulo !== 'Ventilação');
    const adj = new Map<string, { t: (typeof rede)[number]; outro: string }[]>();
    for (const t of rede) {
      const a = chave(t.levelId, t.a.x, t.a.y, t.cotaAMm);
      const b = chave(t.levelId, t.b.x, t.b.y, t.cotaBMm);
      adj.set(a, [...(adj.get(a) ?? []), { t, outro: b }]);
      adj.set(b, [...(adj.get(b) ?? []), { t, outro: a }]);
    }
    const raiz = chave(ci.levelId, ci.at.x, ci.at.y, ci.cotaMm);
    const filhos = new Map<string, { t: (typeof rede)[number]; filho: string }[]>();
    const visitados = new Set<string>([raiz]);
    const fila = [raiz];
    while (fila.length > 0) {
      const n = fila.shift()!;
      for (const { t, outro } of adj.get(n) ?? []) {
        if (visitados.has(outro)) continue;
        visitados.add(outro);
        filhos.set(n, [...(filhos.get(n) ?? []), { t, filho: outro }]);
        fila.push(outro);
      }
    }
    const acumular = (n: string): Carga => {
      const base = fontes.get(n);
      const soma: Carga = base
        ? { ...base, ambientes: new Set(base.ambientes), porNivel: new Map(base.porNivel) }
        : nova();
      for (const { t, filho } of filhos.get(n) ?? []) {
        const sub = acumular(filho);
        const ehTQ = t.rotulo === 'TQ';
        const passa = ehTQ ? Math.max(sub.dn, hip.dnTuboQuedaMm) : sub.dn;
        if (sub.uhc > 0 && !vistos.has(t.id)) {
          vistos.add(t.id);
          const plantaMm = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
          const montanteA = chave(t.levelId, t.a.x, t.a.y, t.cotaAMm) === filho;
          const decl = plantaMm < 1 ? null : (((montanteA ? t.cotaAMm : t.cotaBMm) - (montanteA ? t.cotaBMm : t.cotaAMm)) / plantaMm) * 100;
          // O PAPEL (E5.1) e a tabela da NBR 8160 que vale para ele.
          const papel: PapelNoEsgoto = ehTQ
            ? 'TUBO_DE_QUEDA'
            : t.rotulo === 'Coletor predial'
              ? 'COLETOR_PREDIAL'
            : sub.temTQ || n === raiz || nosDeCaixa.has(n) || sub.ambientes.size >= 2
              ? 'SUBCOLETOR'
              : sub.fontes <= 1
                ? 'RAMAL_DE_DESCARGA'
                : 'RAMAL_DE_ESGOTO';
          const daTabela =
            papel === 'TUBO_DE_QUEDA'
              ? dnDoTuboDeQueda(sub.uhc, Math.max(0, ...sub.porNivel.values()), pavimentos)
              : papel === 'SUBCOLETOR' || papel === 'COLETOR_PREDIAL'
                ? dnDoSubcoletor(sub.uhc, decl)
                : papel === 'RAMAL_DE_ESGOTO'
                  ? dnDoRamalDeEsgoto(sub.uhc)
                  : 0; // ramal de descarga: o DN do aparelho (`passa`)
          const necessario = Math.max(daTabela, passa);
          const tipo = t.bitolaMm < necessario ? 'MENOR' : t.bitolaMm > necessario && t.rotulo !== 'TQ' ? 'MAIOR' : null;
          // Montante = a ponta do FILHO (mais longe da caixa); jusante = a do nó `n`.
          const montanteEhA = chave(t.levelId, t.a.x, t.a.y, t.cotaAMm) === filho;
          const cotaMontanteMm = montanteEhA ? t.cotaAMm : t.cotaBMm;
          const cotaJusanteMm = montanteEhA ? t.cotaBMm : t.cotaAMm;
          const planta = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
          const acima = (filhos.get(filho) ?? []).filter((x) => x.t.rotulo !== 'Ventilação').map((x) => x.t.bitolaMm);
          saida.push({
            contrafluxo: cotaMontanteMm < cotaJusanteMm,
            dnMontanteMaxMm: acima.length ? Math.max(...acima) : null,
            trechoId: t.id, levelId: t.levelId, meio: { x: (t.a.x + t.b.x) / 2, y: (t.a.y + t.b.y) / 2 },
            dnAtualMm: t.bitolaMm, dnNecessarioMm: necessario, uhc: sub.uhc, tipo,
            caixaId: ci.id, rotulo: t.rotulo ?? null,
            comprimentoM: Math.hypot(planta, t.cotaBMm - t.cotaAMm) / 1000,
            cotaMontanteMm, cotaJusanteMm,
            declividadePct: planta < 1 ? null : ((cotaMontanteMm - cotaJusanteMm) / planta) * 100,
            declividadeMinimaPct: caimentoPct(t.bitolaMm, hip),
            papel,
          });
        }
        soma.uhc += sub.uhc;
        soma.dn = Math.max(soma.dn, passa);
        soma.fontes += sub.fontes;
        for (const a of sub.ambientes) soma.ambientes.add(a);
        for (const [l, u] of sub.porNivel) soma.porNivel.set(l, (soma.porNivel.get(l) ?? 0) + u);
        soma.temTQ = soma.temTQ || sub.temTQ || ehTQ;
      }
      return soma;
    };
    acumular(raiz);
  }
  return saida.sort((x, y) => x.trechoId.localeCompare(y.trechoId));
}
