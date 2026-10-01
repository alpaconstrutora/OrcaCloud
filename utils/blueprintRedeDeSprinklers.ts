/**
 * A REDE DE SPRINKLERS (01/10/2026, E5.4 do roadmap de incêndio): o traçado
 * automático da tubulação, o método das tabelas e a VGA. Tudo derivado; o
 * traçado vira comandos só no clique (um lote, um Ctrl+Z).
 *
 *  - TRAÇADO: dos ramais da distribuição (E5.3) — espinha alimentada pela PONTA,
 *    espinha alimentada pelo CENTRO (o subgeral corta os ramais ao meio) ou
 *    GRELHA (subgeral nas duas pontas: os ramais fecham laços, que o solver da
 *    E2 resolve). O GERAL liga o subgeral ao nó mais próximo da rede de incêndio
 *    que já existe no pavimento, em L, na cota dos ramais (desce ou sobe no fim).
 *  - MÉTODO DAS TABELAS: o DN de cada trecho pelo número de sprinklers a
 *    jusante — só em árvore (na grelha e na malha não vale; é o cálculo).
 *  - VGA: os sprinklers a jusante de cada VGA são DERIVADOS (os que a rede só
 *    alcança passando por ela).
 *
 * ⚠️ NORMA (CONFERIR NA NBR 10897): a tabela de DN × sprinklers é a do método
 * das tabelas para tubo de aço (pipe schedule da NFPA 13), transcrita de
 * memória — vale só para risco leve e ordinário; no extraordinário a norma
 * exige o cálculo hidráulico.
 */
import type { BlueprintModel, Command, ObjectId, Point, RiscoDeSprinkler } from './blueprintKernel';
import { redeDeIncendio } from './blueprintCalculoIncendio';
import type { AlternativaDeDistribuicao, PlanoDeSprinklers } from './blueprintDistribuicaoSprinklers';

// ─── Método das tabelas ──────────────────────────────────────────────────────

/** [DN, máximo de sprinklers a jusante] — aço, CONFERIR NA NORMA. */
const TABELA_LEVE: readonly [number, number][] = [[25, 2], [32, 3], [40, 5], [50, 10], [65, 30], [80, 60], [100, Infinity]];
const TABELA_ORDINARIO: readonly [number, number][] = [[25, 2], [32, 3], [40, 5], [50, 10], [65, 20], [80, 40], [90, 65], [100, 100], [125, 160], [150, 275]];

/** O DN pelo número de sprinklers a jusante; `null` = a tabela não vale (extraordinário, ou mais que a tabela cobre). */
export function dnPeloMetodoDasTabelas(n: number, risco: RiscoDeSprinkler): number | null {
  if (risco === 'EXTRA_1' || risco === 'EXTRA_2') return null;
  const tabela = risco === 'LEVE' ? TABELA_LEVE : TABELA_ORDINARIO;
  return tabela.find(([, max]) => n <= max)?.[0] ?? null;
}

export interface TrechoPelasTabelas {
  trechoId: ObjectId;
  aJusante: number;
  dnExigido: number | null;
  dnDesenhado: number;
  atende: boolean | null;
}

export interface MetodoDasTabelas {
  /** `false` = a rede tem laço (grelha/malha) ou o risco é extraordinário: vale o cálculo. */
  aplicavel: boolean;
  motivo: string | null;
  trechos: TrechoPelasTabelas[];
}

/** Os sprinklers a jusante de cada trecho da árvore a partir da fonte; `null` se a rede tem laço. */
function aJusanteNaArvore(model: BlueprintModel): Map<ObjectId, number> | null {
  const rede = redeDeIncendio(model);
  if (!rede.noDaFonte) return new Map();
  const adj = new Map<string, { id: ObjectId; outro: string }[]>();
  for (const x of rede.tubos) {
    adj.set(x.de, [...(adj.get(x.de) ?? []), { id: x.trecho.id, outro: x.para }]);
    adj.set(x.para, [...(adj.get(x.para) ?? []), { id: x.trecho.id, outro: x.de }]);
  }
  const pai = new Map<string, { id: ObjectId; de: string }>();
  const ordem: string[] = [];
  const vistos = new Set([rede.noDaFonte]);
  const fila = [rede.noDaFonte];
  let arestasNaArvore = 0;
  const alcancadas = new Set<ObjectId>();
  while (fila.length) {
    const u = fila.shift()!;
    ordem.push(u);
    for (const e of adj.get(u) ?? []) {
      alcancadas.add(e.id);
      if (vistos.has(e.outro)) continue;
      vistos.add(e.outro);
      pai.set(e.outro, { id: e.id, de: u });
      arestasNaArvore++;
      fila.push(e.outro);
    }
  }
  // Laço: alguma aresta alcançada não entrou na árvore.
  if (alcancadas.size > arestasNaArvore) return null;
  const spkNoNo = new Map<string, number>();
  for (const t of model.terminais ?? []) {
    if (t.tipoHidraulico !== 'SPRINKLER') continue;
    const no = rede.noDoTerminal.get(t.id);
    if (no) spkNoNo.set(no, (spkNoNo.get(no) ?? 0) + 1);
  }
  const abaixo = new Map<string, number>();
  const porTrecho = new Map<ObjectId, number>();
  for (const no of [...ordem].reverse()) {
    const total = (abaixo.get(no) ?? 0) + (spkNoNo.get(no) ?? 0);
    const p = pai.get(no);
    if (!p) continue;
    porTrecho.set(p.id, total);
    abaixo.set(p.de, (abaixo.get(p.de) ?? 0) + total);
  }
  return porTrecho;
}

/** O método das tabelas sobre a rede desenhada: o DN exigido por trecho × o desenhado. */
export function metodoDasTabelas(model: BlueprintModel, risco: RiscoDeSprinkler | null): MetodoDasTabelas {
  if (!risco) return { aplicavel: false, motivo: 'sem o risco dos sprinklers', trechos: [] };
  if (risco === 'EXTRA_1' || risco === 'EXTRA_2') return { aplicavel: false, motivo: 'no risco extraordinário a norma exige o cálculo hidráulico', trechos: [] };
  const n = aJusanteNaArvore(model);
  if (!n) return { aplicavel: false, motivo: 'a rede tem laço (grelha ou malha) — vale o cálculo hidráulico', trechos: [] };
  const porId = new Map((model.trechos ?? []).map((t) => [t.id, t]));
  const trechos = [...n]
    .filter(([, k]) => k > 0)
    .map(([trechoId, aJusante]) => {
      const dnExigido = dnPeloMetodoDasTabelas(aJusante, risco);
      const dnDesenhado = porId.get(trechoId)!.bitolaMm;
      return { trechoId, aJusante, dnExigido, dnDesenhado, atende: dnExigido == null ? null : dnDesenhado >= dnExigido };
    });
  return { aplicavel: true, motivo: null, trechos };
}

/** Sobe ao DN da tabela os trechos abaixo dela (um lote, um Ctrl+Z). */
export function ajustarDnPelasTabelas(m: MetodoDasTabelas): Command[] {
  return m.trechos.filter((t) => t.atende === false).map((t) => ({ type: 'SetTrechoProps', trechoId: t.trechoId, bitolaMm: t.dnExigido! }) as Command);
}

// ─── VGA ─────────────────────────────────────────────────────────────────────

export interface VgaDaRede {
  vgaId: ObjectId;
  /** Os sprinklers que a rede só alcança passando pela VGA. */
  sprinklers: ObjectId[];
}

/** As VGAs da rede e os sprinklers a jusante de cada uma; e os sprinklers ligados que nenhuma protege. */
export function vgasDaRede(model: BlueprintModel): { vgas: VgaDaRede[]; semVga: ObjectId[] } {
  const rede = redeDeIncendio(model);
  const spk = (model.terminais ?? []).filter((t) => t.tipoHidraulico === 'SPRINKLER' && rede.noDoTerminal.has(t.id));
  if (!rede.noDaFonte) return { vgas: [], semVga: [] };
  const adj = new Map<string, string[]>();
  for (const x of rede.tubos) {
    adj.set(x.de, [...(adj.get(x.de) ?? []), x.para]);
    adj.set(x.para, [...(adj.get(x.para) ?? []), x.de]);
  }
  const alcanca = (bloqueado: string | null) => {
    const vistos = new Set([rede.noDaFonte!]);
    const fila = [rede.noDaFonte!];
    while (fila.length) {
      const u = fila.shift()!;
      for (const v of adj.get(u) ?? []) {
        if (v === bloqueado || vistos.has(v)) continue;
        vistos.add(v);
        fila.push(v);
      }
    }
    return vistos;
  };
  const todos = alcanca(null);
  const vgas = (model.terminais ?? [])
    .filter((t) => t.tipoHidraulico === 'VGA' && rede.noDoTerminal.has(t.id))
    .map((v) => {
      const sem = alcanca(rede.noDoTerminal.get(v.id)!);
      return { vgaId: v.id, sprinklers: spk.filter((t) => todos.has(rede.noDoTerminal.get(t.id)!) && !sem.has(rede.noDoTerminal.get(t.id)!)).map((t) => t.id) };
    });
  const protegidos = new Set(vgas.flatMap((v) => v.sprinklers));
  return { vgas, semVga: spk.filter((t) => todos.has(rede.noDoTerminal.get(t.id)!) && !protegidos.has(t.id)).map((t) => t.id) };
}

// ─── O traçado ───────────────────────────────────────────────────────────────

export type TipoDeTracado = 'PONTA' | 'CENTRO' | 'GRELHA';
export const ROTULO_DO_TRACADO: Record<TipoDeTracado, string> = { PONTA: 'Espinha pela ponta', CENTRO: 'Espinha pelo centro', GRELHA: 'Grelha' };

export interface TracadoDeSprinklers {
  comandos: Command[];
  /** Onde o subgeral recebe a água (o começo do geral). */
  alimentacao: Point | null;
  /** O nó da rede existente a que o geral liga; `null` = não há rede no pavimento (ligar à mão). */
  ligadoA: Point | null;
  comprimentoM: number;
  motivo: string | null;
}

interface Seg {
  a: Point;
  b: Point;
  cotaA: number;
  cotaB: number;
}

const k = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;

/**
 * O traçado dos ramais da alternativa (os sprinklers já lançados nas posições
 * dela, ou lançados no mesmo lote). Os DN saem do método das tabelas sobre a
 * árvore planejada (na grelha, a árvore da busca a partir da alimentação — é
 * ponto de partida: o DN final é o do cálculo, "Ajustar DN pela velocidade").
 */
export function tracarRedeDeSprinklers(model: BlueprintModel, plano: PlanoDeSprinklers, alt: AlternativaDeDistribuicao, tipo: TipoDeTracado, risco: RiscoDeSprinkler): TracadoDeSprinklers {
  const nada = (motivo: string): TracadoDeSprinklers => ({ comandos: [], alimentacao: null, ligadoA: null, comprimentoM: 0, motivo });
  const linhas = alt.linhas.filter((l) => l.length > 0);
  if (linhas.length === 0) return nada('a alternativa não tem ramais');
  // Referencial do ramal (u ao longo, v através) — o mesmo da distribuição.
  const ida = alt.sentido === 'X' ? (p: Point) => p : (p: Point) => ({ x: p.y, y: p.x });
  const volta = ida;
  const L = linhas.map((l) => l.map(ida));
  const c = plano.cotaMm;
  const recuo = Math.min(alt.espacamentoNoRamalMm / 4, 500);
  const segs: Seg[] = [];
  const add = (a: Point, b: Point, cotaA = c, cotaB = c) => {
    if (Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y) && cotaA === cotaB) return;
    segs.push({ a: { x: Math.round(a.x), y: Math.round(a.y) }, b: { x: Math.round(b.x), y: Math.round(b.y) }, cotaA, cotaB });
  };
  const ramal = (l: Point[]) => l.slice(1).forEach((p, i) => add(l[i], p));
  const subgeral = (u: number) => {
    const vs = [...new Set(L.map((l) => l[0].y))].sort((a, b) => a - b);
    vs.slice(1).forEach((v, i) => add({ x: u, y: vs[i] }, { x: u, y: v }));
  };
  const minU = Math.min(...L.map((l) => l[0].x)) - recuo;
  const maxU = Math.max(...L.map((l) => l[l.length - 1].x)) + recuo;
  let alimentacao: Point;
  if (tipo === 'CENTRO') {
    // O subgeral passa entre dois sprinklers, perto do meio do ramal mais longo.
    const longo = L.reduce((a, b) => (b.length > a.length ? b : a));
    const i = Math.max(0, Math.floor((longo.length - 1) / 2));
    const us = longo.length > 1 ? (longo[i].x + longo[i + 1].x) / 2 : longo[0].x - recuo;
    for (const l of L) {
      const esq = l.filter((p) => p.x < us);
      const dir = l.filter((p) => p.x > us);
      ramal(esq);
      ramal(dir);
      if (esq.length) add({ x: us, y: l[0].y }, esq[esq.length - 1]);
      if (dir.length) add({ x: us, y: l[0].y }, dir[0]);
    }
    subgeral(us);
    alimentacao = { x: us, y: Math.min(...L.map((l) => l[0].y)) };
  } else {
    for (const l of L) {
      ramal(l);
      add({ x: minU, y: l[0].y }, l[0]);
      if (tipo === 'GRELHA') add(l[l.length - 1], { x: maxU, y: l[0].y });
    }
    subgeral(minU);
    if (tipo === 'GRELHA') subgeral(maxU);
    alimentacao = { x: minU, y: Math.min(...L.map((l) => l[0].y)) };
  }
  // De volta ao referencial da planta.
  const planta = segs.map((s) => ({ ...s, a: volta(s.a), b: volta(s.b) }));
  const F = volta(alimentacao);

  // O geral: ao nó mais próximo da rede de incêndio que já existe no pavimento.
  const existentes = (model.trechos ?? []).filter((t) => t.disciplina === 'INCENDIO' && t.levelId === plano.levelId);
  const nos = existentes.flatMap((t) => [
    { p: t.a, cota: t.cotaAMm },
    { p: t.b, cota: t.cotaBMm },
  ]);
  let ligadoA: Point | null = null;
  if (nos.length) {
    // Em 3D: na prumada os dois nós têm o mesmo x,y — o geral liga no da cota dos ramais, não desce por cima do tubo que já existe.
    const dist = (n: { p: Point; cota: number }) => Math.hypot(n.p.x - F.x, n.p.y - F.y, n.cota - c);
    const alvo = nos.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    const canto = { x: alvo.p.x, y: F.y };
    planta.push({ a: F, b: canto, cotaA: c, cotaB: c }, { a: canto, b: { ...alvo.p }, cotaA: c, cotaB: c });
    if (alvo.cota !== c) planta.push({ a: { ...alvo.p }, b: { ...alvo.p }, cotaA: c, cotaB: alvo.cota });
    ligadoA = { ...alvo.p };
  }
  const limpos = planta.filter((s) => !(s.a.x === s.b.x && s.a.y === s.b.y && s.cotaA === s.cotaB));

  // DN pelo método das tabelas na árvore planejada a partir da alimentação (ou do nó ligado).
  const spk = new Set(alt.pontos.map(k));
  const adj = new Map<string, { i: number; outro: string }[]>();
  limpos.forEach((s, i) => {
    const ka = `${k(s.a)}|${s.cotaA}`;
    const kb = `${k(s.b)}|${s.cotaB}`;
    adj.set(ka, [...(adj.get(ka) ?? []), { i, outro: kb }]);
    adj.set(kb, [...(adj.get(kb) ?? []), { i, outro: ka }]);
  });
  const raiz = ligadoA ? [...adj.keys()].find((x) => x.startsWith(`${k(ligadoA!)}|`)) ?? `${k(F)}|${c}` : `${k(F)}|${c}`;
  const pai = new Map<string, { i: number; de: string }>();
  const ordem: string[] = [];
  const vistos = new Set([raiz]);
  const fila = [raiz];
  while (fila.length) {
    const u = fila.shift()!;
    ordem.push(u);
    for (const e of adj.get(u) ?? []) {
      if (vistos.has(e.outro)) continue;
      vistos.add(e.outro);
      pai.set(e.outro, { i: e.i, de: u });
      fila.push(e.outro);
    }
  }
  const abaixo = new Map<string, number>();
  const nDoSeg = new Map<number, number>();
  for (const no of [...ordem].reverse()) {
    const [xy, cota] = no.split('|');
    const proprio = Number(cota) === c && spk.has(xy) ? 1 : 0;
    const total = (abaixo.get(no) ?? 0) + proprio;
    const p = pai.get(no);
    if (!p) continue;
    nDoSeg.set(p.i, total);
    abaixo.set(p.de, (abaixo.get(p.de) ?? 0) + total);
  }
  const dnPadrao = (n: number) => dnPeloMetodoDasTabelas(Math.max(1, n), risco) ?? 25;
  const comandos = limpos.map(
    (s, i) =>
      ({
        type: 'AddTrecho',
        levelId: plano.levelId,
        disciplina: 'INCENDIO',
        a: s.a,
        b: s.b,
        cotaAMm: s.cotaA,
        cotaBMm: s.cotaB,
        bitolaMm: dnPadrao(nDoSeg.get(i) ?? 1),
      }) as Command,
  );
  const comprimentoM = limpos.reduce((t, s) => t + Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) + Math.abs(s.cotaB - s.cotaA), 0) / 1000;
  return { comandos, alimentacao: F, ligadoA, comprimentoM, motivo: ligadoA ? null : 'não há rede de incêndio no pavimento — ligue o geral à mão' };
}
