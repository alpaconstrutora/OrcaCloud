/**
 * O SOBRADO DA CASA AUTOMÁTICA (F12a, 15/10/2026) — a arquitetura dos dois pavimentos e a escada que os liga.
 *
 * O gerador E6.2 faz UM pavimento por chamada, não aceita cômodo fixo nem furo e não conhece escada. Medido em
 * 15/10: reservar o núcleo da escada como um ENTALHE no contorno antes de gerar desarruma o pavimento de cima
 * (sem quartos na frente, o corredor vai para a fachada e o entalhe come a repartição). O que funciona é o que um
 * projetista faz:
 *
 *  1. o PROGRAMA dividido: o térreo leva o social, o serviço, o lavabo e a garagem; o superior, os dormitórios,
 *     as suítes, os banhos e a circulação. No superior, os DORMITÓRIOS vão para a faixa da frente (a privacidade
 *     só para o zoneamento do gerador) — o corredor fica no MEIO, de lado a lado, e a suíte nos fundos;
 *  2. os dois pavimentos gerados no MESMO retângulo;
 *  3. o NÚCLEO recortado DEPOIS, na ponta do corredor de cima, encostado na fachada lateral: as paredes do gerador
 *     que o atravessam são cortadas na borda dele (as aberturas que caíam no trecho cortado saem), o núcleo ganha
 *     as suas paredes, e as portas: no superior, do patamar para o corredor; no térreo, para o melhor vizinho;
 *  4. a ESCADA em U dentro do núcleo: o patamar de partida/chegada (1,0 m) alinhado com o corredor de cima, os dois
 *     lances lado a lado e a virada do outro lado. O núcleo cresce para os fundos ou para a frente a partir do
 *     corredor — vale o lado que parte menos cômodos do térreo.
 *
 * Tudo no QUADRO LOCAL da frente (o mesmo do gerador): quem chama leva ao mundo com `comandosNoMundoDe`.
 */
import type { Command, ObjectId, Point } from './blueprintKernel';
import { point, uidDeterministico } from './blueprintKernel';
import type { Programa, UsoDoAmbiente } from './blueprintPrograma';
import type { AmbienteGerado, Retangulo } from './blueprintGerador';

/** O que vai para o térreo; o resto (dormitórios, suítes, banhos, circulação) sobe. */
export const USOS_DO_TERREO: ReadonlySet<string> = new Set<UsoDoAmbiente>(['SALA', 'COZINHA', 'AREA_DE_SERVICO', 'LAVABO', 'VARANDA', 'GARAGEM', 'ESCRITORIO'] as UsoDoAmbiente[]);

export interface HipotesesDoSobrado {
  /** Espessura da laje entre os pavimentos — o superior fica em pé-direito + laje. */
  lajeEntrePavimentosMm: number;
  /** O núcleo da escada (eixos das paredes): largura ao longo da fachada lateral × profundidade. */
  nucleoLarguraMm: number;
  nucleoProfundidadeMm: number;
  /** Espessura das paredes do núcleo. */
  paredeDoNucleoMm: number;
  /** A faixa do patamar de partida e chegada (alinhada com o corredor de cima). */
  patamarMm: number;
  /** Cada lance da escada em U (ao longo da profundidade do núcleo). */
  lanceMm: number;
  larguraDaEscadaMm: number;
  alvoEspelhoMm: number;
  larguraDaPortaMm: number;
  alturaDaPortaMm: number;
  /** Abaixo disto (% da área gerada) o ambiente que o núcleo come conta como PERDIDO na escolha do núcleo. */
  sobraMinimaDoAmbientePct: number;
}

export const HIPOTESES_DO_SOBRADO_PADRAO: HipotesesDoSobrado = {
  lajeEntrePavimentosMm: 100,
  nucleoLarguraMm: 2400,
  nucleoProfundidadeMm: 3600,
  paredeDoNucleoMm: 150,
  patamarMm: 1000,
  lanceMm: 1820,
  larguraDaEscadaMm: 1000,
  alvoEspelhoMm: 175,
  larguraDaPortaMm: 900,
  alturaDaPortaMm: 2100,
  sobraMinimaDoAmbientePct: 50,
};

/** O programa repartido pelos pavimentos (as relações ficam só entre itens do mesmo pavimento). */
export function dividirPrograma(p: Programa): { terreo: Programa; superior: Programa } {
  const embaixo = p.itens.filter((i) => USOS_DO_TERREO.has(i.uso));
  // No superior, os dormitórios na faixa da FRENTE: o zoneamento do gerador põe o íntimo ao fundo e o resto à
  // frente; com tudo íntimo, o corredor iria para a fachada. Só o zoneamento muda — o item continua dormitório.
  const emCima = p.itens.filter((i) => !USOS_DO_TERREO.has(i.uso)).map((i) => (i.uso === 'DORMITORIO' ? { ...i, privacidade: 'SOCIAL' as const } : i));
  const so = (itens: typeof p.itens) => {
    const ids = new Set(itens.map((i) => i.id));
    return { ...p, itens, relacoes: p.relacoes.filter((r) => ids.has(r.a) && ids.has(r.b)) };
  };
  return { terreo: so(embaixo), superior: so(emCima) };
}

export interface NucleoDaEscada {
  ret: Retangulo;
  /** Em que fachada lateral o núcleo encosta. */
  lado: 'DIREITA' | 'ESQUERDA';
  /** `true` = a escada sobe para os fundos (o patamar na frente do núcleo, junto do corredor). */
  paraOsFundos: boolean;
  /** Ambientes (dos dois pavimentos) que o núcleo PARTE em dois. */
  partidos: string[];
  /** Ambientes que ficam abaixo da área mínima com o núcleo. */
  perdidos: string[];
  /** A pontuação da escolha (menor é melhor) — perdidos pesam 100; partidos, 10; o resto, a fração comida. */
  custo: number;
}

const areaDe = (r: Retangulo) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
const sobreposicao = (a: Retangulo, b: Retangulo) => areaDe({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
/** O núcleo PARTE o ambiente em dois (a faixa dele atravessa o ambiente de um lado ao outro)? */
const parte = (n: Retangulo, a: Retangulo) => sobreposicao(n, a) > 0 && ((a.y0 < n.y0 && a.y1 > n.y1) || (a.x0 < n.x0 && a.x1 > n.x1));

/** Os pedaços de `a` fora do núcleo (até 4: à esquerda, à direita, à frente e aos fundos dele), o maior primeiro. */
export function pedacosFora(a: Retangulo, n: Retangulo): Retangulo[] {
  if (sobreposicao(a, n) <= 0) return [a];
  const ps: Retangulo[] = [
    { x0: a.x0, y0: a.y0, x1: Math.min(a.x1, n.x0), y1: a.y1 },
    { x0: Math.max(a.x0, n.x1), y0: a.y0, x1: a.x1, y1: a.y1 },
    { x0: Math.max(a.x0, n.x0), y0: a.y0, x1: Math.min(a.x1, n.x1), y1: Math.min(a.y1, n.y0) },
    { x0: Math.max(a.x0, n.x0), y0: Math.max(a.y0, n.y1), x1: Math.min(a.x1, n.x1), y1: a.y1 },
  ];
  return ps.filter((r) => r.x1 - r.x0 > 1 && r.y1 - r.y0 > 1).sort((p, q) => areaDe(q) - areaDe(p));
}

/**
 * Onde o núcleo fica: encostado numa fachada lateral (direita ou esquerda) do retângulo da casa, com o patamar sobre o
 * corredor de cima; cresce para os fundos ou para a frente. Das 4 opções, a que menos estraga os DOIS pavimentos: um
 * ambiente que fica abaixo da área mínima pesa 100; um partido em dois, 10; o resto, a fração comida (empate: direita, fundos).
 * `null` sem corredor no superior ou sem espaço.
 */
export function escolherNucleo(
  casa: Retangulo,
  corredor: Retangulo | null,
  terreo: readonly AmbienteGerado[],
  superior: readonly AmbienteGerado[],
  hip: HipotesesDoSobrado = HIPOTESES_DO_SOBRADO_PADRAO,
): NucleoDaEscada | null {
  if (!corredor) return null;
  const cw = hip.nucleoLarguraMm;
  const cd = hip.nucleoProfundidadeMm;
  if (casa.x1 - casa.x0 < cw + 3000) return null;
  const opcoes: NucleoDaEscada[] = [];
  for (const lado of ['DIREITA', 'ESQUERDA'] as const) {
    const x0 = lado === 'DIREITA' ? casa.x1 - cw : casa.x0;
    for (const paraOsFundos of [true, false]) {
      const y0 = paraOsFundos ? corredor.y0 : corredor.y1 - cd;
      const ret = { x0, y0, x1: x0 + cw, y1: y0 + cd };
      if (ret.y0 < casa.y0 || ret.y1 > casa.y1) continue;
      const partidos: string[] = [];
      const perdidos: string[] = [];
      let custo = 0;
      for (const a of [...terreo, ...superior]) {
        if (a.item.uso === 'CIRCULACAO') continue;
        const ov = sobreposicao(ret, a.ret);
        if (ov <= 0) continue;
        // Partido, só o maior pedaço continua sendo o ambiente; senão, o que sobra em volta do núcleo.
        const partido = parte(ret, a.ret);
        const resto = partido ? areaDe(pedacosFora(a.ret, ret)[0] ?? { x0: 0, y0: 0, x1: 0, y1: 0 }) : areaDe(a.ret) - ov;
        if (resto < Math.max(a.item.areaMinM2 * 1e6, (areaDe(a.ret) * hip.sobraMinimaDoAmbientePct) / 100)) {
          perdidos.push(a.nome);
          custo += 100;
        } else if (partido) {
          partidos.push(a.nome);
          custo += 10;
        } else custo += ov / areaDe(a.ret);
      }
      opcoes.push({ ret, lado, paraOsFundos, partidos, perdidos, custo });
    }
  }
  return opcoes.sort((a, b) => a.custo - b.custo)[0] ?? null;
}

type ParedeLocal = Extract<Command, { type: 'AddWalls' }>['walls'][number];
type AberturaLocal = Extract<Command, { type: 'AddOpenings' }>['openings'][number];

/** O intervalo de t (0–1) do segmento a→b DENTRO do retângulo aberto (encostar na borda não conta). */
function dentro(a: Point, b: Point, r: Retangulo): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const d = { x: b.x - a.x, y: b.y - a.y };
  const lados: [number, number, number][] = [
    [-d.x, a.x - r.x0, 0],
    [d.x, r.x1 - a.x, 0],
    [-d.y, a.y - r.y0, 0],
    [d.y, r.y1 - a.y, 0],
  ];
  for (const [p, q] of lados) {
    if (Math.abs(p) < 1e-9) {
      if (q <= 0.5) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  const L = Math.hypot(d.x, d.y);
  return (t1 - t0) * L > 1 ? [t0, t1] : null;
}

/**
 * As paredes e aberturas do pavimento com o núcleo recortado: a parede que o atravessa vira um ou dois pedaços (o
 * segundo com uid novo, derivado do antigo); a abertura que caía no trecho cortado sai; a do segundo pedaço é
 * re-ancorada (uid e offset).
 */
export function recortarNucleo(cmds: readonly Command[], nucleo: Retangulo): Command[] {
  const novasParedes: ParedeLocal[] = [];
  const reancora = new Map<string, { inicio: number; fim: number; uid: string; deslocamento: number }[]>();
  for (const c of cmds) {
    if (c.type !== 'AddWalls') continue;
    for (const w of c.walls) {
      const r = dentro(w.a, w.b, nucleo);
      if (!r) {
        novasParedes.push(w);
        continue;
      }
      const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      const em = (t: number) => point(Math.round(w.a.x + (w.b.x - w.a.x) * t), Math.round(w.a.y + (w.b.y - w.a.y) * t));
      const pedacos: { inicio: number; fim: number; uid: string; deslocamento: number }[] = [];
      if (r[0] * L > 1) {
        novasParedes.push({ ...w, b: em(r[0]) });
        pedacos.push({ inicio: 0, fim: r[0] * L, uid: w.uid ?? '', deslocamento: 0 });
      }
      if ((1 - r[1]) * L > 1) {
        const uid = w.uid ? uidDeterministico(`${w.uid}:alem-do-nucleo`) : undefined;
        novasParedes.push({ ...w, a: em(r[1]), uid });
        pedacos.push({ inicio: r[1] * L, fim: L, uid: uid ?? '', deslocamento: r[1] * L });
      }
      if (w.uid) reancora.set(w.uid, pedacos);
    }
  }
  const novasAberturas: AberturaLocal[] = [];
  for (const c of cmds) {
    if (c.type !== 'AddOpenings') continue;
    for (const o of c.openings) {
      const pedacos = o.wallUid ? reancora.get(o.wallUid) : undefined;
      if (!pedacos) {
        novasAberturas.push(o);
        continue;
      }
      const p = pedacos.find((x) => o.offsetMm >= x.inicio - 0.5 && o.offsetMm + o.widthMm <= x.fim + 0.5);
      if (p) novasAberturas.push({ ...o, wallUid: p.uid, offsetMm: Math.round(o.offsetMm - p.deslocamento) });
    }
  }
  const out: Command[] = [];
  for (const c of cmds) {
    if (c.type === 'AddWalls') out.push({ type: 'AddWalls', walls: novasParedes });
    else if (c.type === 'AddOpenings') out.push({ type: 'AddOpenings', openings: novasAberturas });
    else out.push(c);
  }
  return out;
}

/** Os trechos da linha [de, ate] (ao longo de um eixo) que nenhuma parede colinear já cobre. */
function descobertos(paredes: readonly ParedeLocal[], fixo: 'x' | 'y', valor: number, de: number, ate: number): [number, number][] {
  const ao = fixo === 'x' ? 'y' : 'x';
  const cobertos = paredes
    .filter((w) => Math.abs(w.a[fixo] - valor) < 1 && Math.abs(w.b[fixo] - valor) < 1)
    .map((w) => [Math.min(w.a[ao], w.b[ao]), Math.max(w.a[ao], w.b[ao])] as [number, number])
    .sort((p, q) => p[0] - q[0]);
  const livres: [number, number][] = [];
  let cur = de;
  for (const [s, e] of cobertos) {
    if (e <= cur || s >= ate) continue;
    if (s > cur + 1) livres.push([cur, Math.min(s, ate)]);
    cur = Math.max(cur, e);
  }
  if (cur < ate - 1) livres.push([cur, ate]);
  return livres;
}

/** A parede colinear que contém o trecho [p0, p1] da linha, e o offset do começo do trecho medido do `a` dela. */
function paredeQueContem(paredes: readonly ParedeLocal[], fixo: 'x' | 'y', valor: number, p0: number, p1: number): { uid: string; offsetMm: number } | null {
  const ao = fixo === 'x' ? 'y' : 'x';
  for (const w of paredes) {
    if (Math.abs(w.a[fixo] - valor) >= 1 || Math.abs(w.b[fixo] - valor) >= 1 || !w.uid) continue;
    const lo = Math.min(w.a[ao], w.b[ao]);
    const hi = Math.max(w.a[ao], w.b[ao]);
    if (p0 < lo - 0.5 || p1 > hi + 0.5) continue;
    const crescente = w.b[ao] >= w.a[ao];
    return { uid: w.uid, offsetMm: Math.round(crescente ? p0 - w.a[ao] : w.a[ao] - p1) };
  }
  return null;
}

/** Os vizinhos preferidos para a porta do núcleo no térreo (o primeiro que encosta vence). */
const PREFERENCIA_NO_TERREO: string[] = ['SALA', 'VARANDA', 'COZINHA', 'ESCRITORIO', 'AREA_DE_SERVICO', 'GARAGEM', 'LAVABO'];

export interface PavimentoDoSobrado {
  /** Os comandos do pavimento, no quadro local, com o núcleo recortado, as paredes e a porta dele. */
  comandos: Command[];
  /** Onde ficou a porta do núcleo (`null` = nenhum vizinho servia — vira pendência). */
  porta: { vizinho: string; lado: 'DENTRO' | 'FRENTE' | 'FUNDOS' } | null;
}

/**
 * O pavimento com o núcleo: recorta, fecha os lados do núcleo que nenhuma parede cobre e abre a porta. No superior
 * (`corredor` dado), a porta é do patamar para o corredor, na parede de dentro; no térreo, para o melhor vizinho do
 * patamar (sala antes de tudo), na parede de dentro ou na face do patamar.
 */
export function pavimentoComNucleo(
  cmds: readonly Command[],
  levelId: ObjectId,
  n: NucleoDaEscada,
  ambientes: readonly AmbienteGerado[],
  chaveDoPavimento: string,
  alturaDaParedeMm: number,
  hip: HipotesesDoSobrado = HIPOTESES_DO_SOBRADO_PADRAO,
  corredor: Retangulo | null = null,
): PavimentoDoSobrado {
  const r = n.ret;
  // As etiquetas: a do ambiente cujo centro caiu no núcleo (ou nas paredes dele — o kernel a daria ao núcleo) vai
  // para o maior pedaço que sobrou dele; o núcleo ganha a sua.
  const f = hip.paredeDoNucleoMm;
  const realocadas = cmds.map((c) => {
    if (c.type !== 'PlaceSpaceLabels') return c;
    return {
      ...c,
      labels: [
        ...c.labels.map((l) => {
          if (!(l.at.x > r.x0 - f && l.at.x < r.x1 + f && l.at.y > r.y0 - f && l.at.y < r.y1 + f)) return l;
          const a = ambientes.find((x) => x.nome === l.name);
          const pedaco = a ? pedacosFora(a.ret, r)[0] : undefined;
          return pedaco ? { ...l, at: point(Math.round((pedaco.x0 + pedaco.x1) / 2), Math.round((pedaco.y0 + pedaco.y1) / 2)) } : l;
        }),
        { levelId, at: point(Math.round((r.x0 + r.x1) / 2), Math.round((r.y0 + r.y1) / 2)), name: 'Escada', uso: 'CIRCULACAO' },
      ],
    } as Command;
  });
  const recortado = recortarNucleo(realocadas, r);
  const existentes = recortado.flatMap((c) => (c.type === 'AddWalls' ? c.walls : []));
  // Os lados do núcleo (a fachada lateral já é a parede externa): o de dentro, frente e fundos — só o que falta.
  const xDentro = n.lado === 'DIREITA' ? r.x0 : r.x1;
  const novas: ParedeLocal[] = [];
  const lados: { fixo: 'x' | 'y'; valor: number; de: number; ate: number; nome: string }[] = [
    { fixo: 'x', valor: xDentro, de: r.y0, ate: r.y1, nome: 'esq' },
    { fixo: 'y', valor: r.y0, de: r.x0, ate: r.x1, nome: 'fre' },
    { fixo: 'y', valor: r.y1, de: r.x0, ate: r.x1, nome: 'fun' },
  ];
  for (const l of lados) {
    for (const [s, e] of descobertos(existentes, l.fixo, l.valor, l.de, l.ate)) {
      const a = l.fixo === 'x' ? point(l.valor, s) : point(s, l.valor);
      const b = l.fixo === 'x' ? point(l.valor, e) : point(e, l.valor);
      novas.push({ levelId, a, b, thicknessMm: hip.paredeDoNucleoMm, heightMm: alturaDaParedeMm, uid: uidDeterministico(`nucleo:${chaveDoPavimento}:${l.nome}:${s}`) } as ParedeLocal);
    }
  }
  const todas = [...existentes, ...novas];
  // A faixa do patamar: a ponta do núcleo junto do corredor.
  const patamar = n.paraOsFundos ? { y0: r.y0, y1: r.y0 + hip.patamarMm } : { y0: r.y1 - hip.patamarMm, y1: r.y1 };
  const w = hip.larguraDaPortaMm;
  const meio = Math.round((patamar.y0 + patamar.y1) / 2);
  const candidatas: { lado: 'DENTRO' | 'FRENTE' | 'FUNDOS'; fixo: 'x' | 'y'; valor: number; p0: number; p1: number; sonda: Point }[] = [
    { lado: 'DENTRO', fixo: 'x', valor: xDentro, p0: meio - w / 2, p1: meio + w / 2, sonda: point(n.lado === 'DIREITA' ? xDentro - 300 : xDentro + 300, meio) },
  ];
  // No térreo, a face do patamar (frente ou fundos do núcleo), na metade de cima da escada (a partida).
  if (!corredor) {
    // A partida da escada é a metade da FACHADA (ver `comandoDaEscada`).
    const xm = n.lado === 'DIREITA' ? Math.round(r.x1 - hip.paredeDoNucleoMm / 2 - hip.larguraDaEscadaMm / 2) : Math.round(r.x0 + hip.paredeDoNucleoMm / 2 + hip.larguraDaEscadaMm / 2);
    const yFace = n.paraOsFundos ? r.y0 : r.y1;
    candidatas.push({ lado: n.paraOsFundos ? 'FRENTE' : 'FUNDOS', fixo: 'y', valor: yFace, p0: xm - w / 2, p1: xm + w / 2, sonda: point(xm, n.paraOsFundos ? yFace - 300 : yFace + 300) });
  }
  const vizinhoEm = (p: Point) => ambientes.find((a) => p.x > a.ret.x0 && p.x < a.ret.x1 && p.y > a.ret.y0 && p.y < a.ret.y1) ?? null;
  const ordem = (a: AmbienteGerado | null) => (a ? (corredor ? (a.item.uso === 'CIRCULACAO' ? 0 : 99) : (PREFERENCIA_NO_TERREO.indexOf(a.item.uso) + 1 || 99)) : 999);
  const melhor = candidatas.map((c) => ({ c, viz: vizinhoEm(c.sonda) })).sort((a, b) => ordem(a.viz) - ordem(b.viz))[0];
  let porta: PavimentoDoSobrado['porta'] = null;
  const aberturas: AberturaLocal[] = [];
  if (melhor && melhor.viz && ordem(melhor.viz) < 99) {
    const alvo = paredeQueContem(todas, melhor.c.fixo, melhor.c.valor, melhor.c.p0, melhor.c.p1);
    if (alvo) {
      aberturas.push({ wallId: '', wallUid: alvo.uid, kind: 'door', offsetMm: alvo.offsetMm, widthMm: w, heightMm: hip.alturaDaPortaMm } as AberturaLocal);
      porta = { vizinho: melhor.viz.nome, lado: melhor.c.lado };
    }
  }
  const out: Command[] = [];
  for (const c of recortado) {
    if (c.type === 'AddWalls') out.push({ type: 'AddWalls', walls: todas });
    else if (c.type === 'AddOpenings') out.push({ type: 'AddOpenings', openings: [...c.openings, ...aberturas] });
    else out.push(c);
  }
  if (!recortado.some((c) => c.type === 'AddOpenings') && aberturas.length) out.splice(1, 0, { type: 'AddOpenings', openings: aberturas });
  return { comandos: out, porta };
}

/**
 * A escada em U do núcleo (no térreo; chega no pavimento de cima): o primeiro lance na metade da fachada, saindo do
 * patamar; a virada no outro extremo; o segundo lance na metade de dentro, chegando ao patamar de cima — que fica
 * sobre o corredor.
 */
export function comandoDaEscada(levelId: ObjectId, n: NucleoDaEscada, hip: HipotesesDoSobrado = HIPOTESES_DO_SOBRADO_PADRAO): Command {
  const r = n.ret;
  const meiaParede = hip.paredeDoNucleoMm / 2;
  const meia = hip.larguraDaEscadaMm / 2;
  const xFora = n.lado === 'DIREITA' ? r.x1 - meiaParede - meia : r.x0 + meiaParede + meia;
  const xDentro = n.lado === 'DIREITA' ? r.x0 + meiaParede + meia : r.x1 - meiaParede - meia;
  const s = n.paraOsFundos ? 1 : -1;
  const yPartida = n.paraOsFundos ? r.y0 + hip.patamarMm : r.y1 - hip.patamarMm;
  const yVirada = yPartida + s * hip.lanceMm;
  return {
    type: 'AddEscada',
    levelId,
    pontos: [point(xFora, yPartida), point(xFora, yVirada), point(xDentro, yVirada), point(xDentro, yPartida)],
    larguraMm: hip.larguraDaEscadaMm,
    alvoEspelhoMm: hip.alvoEspelhoMm,
    rotulo: 'Escada',
  } as Command;
}

/** Os uids das paredes (e das aberturas que as referenciam) trocados por uids do pavimento — o gerador repete os seus. */
export function comUidsDoPavimento(cmds: readonly Command[], chave: string): Command[] {
  const novo = (uid: string | undefined | null) => (uid ? uidDeterministico(`${uid}:${chave}`) : uid);
  return cmds.map((c) =>
    c.type === 'AddWalls'
      ? { ...c, walls: c.walls.map((w) => ({ ...w, uid: novo(w.uid) ?? undefined })) }
      : c.type === 'AddOpenings'
        ? { ...c, openings: c.openings.map((o) => ({ ...o, wallUid: novo(o.wallUid) ?? undefined })) }
        : c,
  ) as Command[];
}

/** Sem a porta de ENTRADA (porta em parede externa do retângulo): o superior não tem porta para a rua. */
export function semPortaDeEntrada(cmds: readonly Command[], casa: Retangulo): Command[] {
  const naBorda = (w: ParedeLocal) =>
    (w.a.x === w.b.x && (w.a.x === casa.x0 || w.a.x === casa.x1)) || (w.a.y === w.b.y && (w.a.y === casa.y0 || w.a.y === casa.y1));
  const externas = new Set(cmds.flatMap((c) => (c.type === 'AddWalls' ? c.walls.filter(naBorda).map((w) => w.uid) : [])));
  return cmds.map((c) => (c.type === 'AddOpenings' ? { ...c, openings: c.openings.filter((o) => !((o.kind === 'door' || o.kind === 'sliding') && externas.has(o.wallUid ?? undefined))) } : c)) as Command[];
}
