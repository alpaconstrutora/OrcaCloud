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
import type { BlueprintModel, Command, ObjectId, Point, Wall } from './blueprintKernel';
import { applyBatch, contornoDoComponente, point, pointInPolygon, signedArea, uidDeterministico } from './blueprintKernel';
import { semEspiculas } from './blueprintDistribuicao';
import { HIPOTESES_PILARES_PADRAO, idsPrevistosDeEstrutura, pilaresExistentesNoNivel, planejarPilares, proximoNumeroDePilar, proximoNumeroDoRotulo, type HipotesesDePilares } from './blueprintPilaresAutomaticos';
import { alturaDaViga, HIPOTESES_VIGAS_PADRAO, type HipotesesDeVigas } from './blueprintVigasLajesAutomaticas';
import { HIPOTESES_DE_GUARDA_CORPO_PADRAO, sugerirGuardaCorpos } from './blueprintGuardaCorpo';
import { usoDoNome, type Programa, type UsoDoAmbiente } from './blueprintPrograma';
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
  /** F12c: o lado do shaft das instalações junto do banheiro de cima, mm. */
  shaftMm: number;
  /** F14c: as peças de cima a até isto umas das outras descem pelo mesmo tubo de queda (um TQ por banheiro), mm. */
  grupoDoTuboDeQuedaMm: number;
  /** F14c: o shaft fica a até isto do centro das peças que despejam nele; mais longe, ganha um shaft junto delas, mm. */
  shaftAteAsPecasMm: number;
  /**
   * F14c (decisão do usuário, 16/10/2026: "laje rebaixada"): quanto a laje sob cada banheiro de cima desce, mm — o
   * esgoto dele corre no enchimento do piso até o tubo de queda, sem entrar no forro do térreo. 0 = sem rebaixo.
   * 22 cm: a laje rebaixada ainda fica ACIMA do forro do térreo (2,567 m com o padrão), que não precisa descer — nem
   * sob a cozinha, de 2,50 m; o tubo de queda colado nas peças deixa o ramal curto o bastante para o enchimento.
   */
  rebaixoDaLajeDoBanheiroMm: number;
  /**
   * F14c: o rebaixo cobre só a ÁREA MOLHADA — o retângulo das peças de esgoto do grupo mais esta margem (o shaft colado
   * nelas e o caimento do ramal), recortado pelo banheiro. Sob o banheiro inteiro, o rebaixo tirava do térreo faixas
   * de forro onde a água precisava passar (o banheiro da suíte cobria os fundos da casa e o aquecedor). mm.
   */
  margemDoRebaixoMm: number;
  /**
   * F14c: até onde o esgoto de cima busca o shaft para o tubo de queda, mm. O shaft junto das peças fica onde a parede
   * e os móveis deixam (no banheiro da suíte, comprido, o vaso e o lavatório tomam a ponta: 3,5 m) — com os 3 m de
   * antes, o tubo de queda descia no vaso, pelo meio da cozinha de baixo.
   */
  tuboDeQuedaAteOShaftMm: number;
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
  shaftMm: 400,
  grupoDoTuboDeQuedaMm: 2500,
  shaftAteAsPecasMm: 2000,
  rebaixoDaLajeDoBanheiroMm: 220,
  margemDoRebaixoMm: 600,
  tuboDeQuedaAteOShaftMm: 4000,
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
      // F22: com o peitoril (0) — sem ele, a conferência de vão comparava cotas com `undefined` e acusava o barrilete que
      // corre sobre a laje, 3 m acima da porta (sobrado 10 × 30).
      aberturas.push({ wallId: '', wallUid: alvo.uid, kind: 'door', offsetMm: alvo.offsetMm, widthMm: w, heightMm: hip.alturaDaPortaMm, sillMm: 0 } as AberturaLocal);
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

// ─── F12b: a estrutura dos dois pavimentos ─────────────────────────────────

/** Folga além da meia espessura para um ponto contar como "sobre a parede". */
const FOLGA_SOBRE_PAREDE_MM = 5;
/** Folga entre a face do pilar e a lateral de uma porta ou janela. */
const FOLGA_DA_ABERTURA_MM = 50;

function projetar(p: Point, a: Point, b: Point): { t: number; L: number; d: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1) return { t: 0, L: 0, d: Math.hypot(p.x - a.x, p.y - a.y) };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L;
  return { t, L, d: Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / L };
}

/**
 * A parede do pavimento que tem o ponto no corpo (eixo a menos de meia espessura), longe das portas e janelas dela
 * (`meioComprimentoMm` = meia peça ao longo da parede + folga). `null` = não há onde a peça apoiar.
 */
export function paredeSobOPonto(model: BlueprintModel, levelId: ObjectId, p: Point, meioComprimentoMm = 0, ignorarAberturas = false): Wall | null {
  for (const w of model.walls) {
    if (w.levelId !== levelId) continue;
    const pr = projetar(p, w.a, w.b);
    if (pr.L < 1 || pr.t < -1 || pr.t > pr.L + 1 || pr.d > w.thicknessMm / 2 + FOLGA_SOBRE_PAREDE_MM) continue;
    const naAbertura = model.openings.some((o) => o.wallId === w.id && pr.t > o.offsetMm - meioComprimentoMm - FOLGA_DA_ABERTURA_MM && pr.t < o.offsetMm + o.widthMm + meioComprimentoMm + FOLGA_DA_ABERTURA_MM);
    if (!naAbertura || ignorarAberturas) return w;
  }
  return null;
}

const pilarPerto = (model: BlueprintModel, levelId: ObjectId, p: Point, mm: number) =>
  pilaresExistentesNoNivel(model, levelId).some((x) => Math.hypot(x.pontos[0].x - p.x, x.pontos[0].y - p.y) <= mm);

export interface PilaresDoSobrado {
  comandos: Command[];
  motivo: string | null;
  avisos: string[];
  foraDoPlano: string[];
  /** Pilares novos no térreo (do planejador + os que descem do superior). */
  terreo: number;
  /** Pilares novos no superior (os que sobem do térreo + os do planejador que têm apoio). */
  superior: number;
  /** Do térreo que continuam no superior (há parede em cima). */
  sobem: number;
  /** Do superior que descem ao térreo (há parede embaixo, fora de porta e janela). */
  descem: number;
  /** Do superior que nascem numa viga de transição do térreo (sem parede embaixo, mas com a viga). */
  nascemEmViga: number;
  /** Do superior que ficaram fora: sem parede nem viga de transição embaixo, o pilar nasceria no meio de um cômodo. */
  semApoio: number;
  /** Onde ficaram os que saíram. */
  semApoioEm: Point[];
  /** Dos que saíram, quantos caíam sobre porta ou janela do térreo (a parede está lá, aberta). */
  sobreAbertura: number;
}

/**
 * Os pilares do sobrado, ALINHADOS: um pilar é uma prumada. O térreo pelo planejador de sempre; cada pilar do térreo
 * que tem parede do superior em cima CONTINUA no superior (a mesma seção, no mesmo ponto); o planejador do superior
 * completa o que falta (encontros e vãos), e cada pilar novo dele DESCE ao térreo quando há parede embaixo fora de
 * porta e janela. O que não tem parede embaixo sai: um pilar não nasce no meio do cômodo de baixo sem viga de
 * transição — fica dito, e a viga do superior vence o vão maior.
 */
export function pilaresDoSobrado(
  model: BlueprintModel,
  T: ObjectId,
  S: ObjectId,
  hip: HipotesesDePilares = HIPOTESES_PILARES_PADRAO,
  transicao: readonly TrechoDeTransicao[] = [],
): PilaresDoSobrado {
  const comandos: Command[] = [];
  const cedem = new Set<ObjectId>();
  let m = model;
  const lancar = (lote: Command[]) => {
    if (!lote.length) return;
    m = applyBatch(m, lote).model;
    comandos.push(...lote);
  };
  const ceder = (w: Wall, lote: Command[]) => {
    if (w.cedeSobreposicao === true || cedem.has(w.id)) return;
    cedem.add(w.id);
    lote.push({ type: 'SetCedeSobreposicao', id: w.id, cede: true });
  };
  const altura = (id: ObjectId) => m.levels.find((l) => l.id === id)?.defaultHeightMm ?? 2800;
  const copia = (x: { at: Point; larguraMm: number; profundidadeMm: number; circular: boolean; rotacaoDeg: number; rotulo: string | null }, levelId: ObjectId): Command => ({
    type: 'AddStructural',
    levelId,
    kind: 'PILAR',
    pontos: [x.at],
    larguraMm: x.larguraMm,
    profundidadeMm: x.profundidadeMm,
    alturaMm: altura(levelId),
    baseMm: 0,
    circular: x.circular,
    rotacaoDeg: x.rotacaoDeg,
    rotulo: x.rotulo,
  });
  const meio = (x: { larguraMm: number; profundidadeMm: number }) => Math.max(x.larguraMm, x.profundidadeMm) / 2;

  // 1. O térreo.
  const pT = planejarPilares(m, T, hip);
  lancar(pT.comandos);
  const terreoDoPlanejador = pT.pilares.length;

  // 2. Os do térreo que sobem.
  const sobem: Command[] = [];
  for (const x of pilaresExistentesNoNivel(m, T)) {
    const at = x.pontos[0];
    const w = paredeSobOPonto(m, S, at, meio(x));
    if (!w || pilarPerto(m, S, at, meio(x))) continue;
    sobem.push(copia({ at, larguraMm: x.larguraMm, profundidadeMm: x.profundidadeMm, circular: x.circular, rotacaoDeg: x.rotacaoDeg, rotulo: x.rotulo ?? null }, S));
    ceder(w, sobem);
  }
  lancar(sobem);
  const nSobem = sobem.filter((c) => c.type === 'AddStructural').length;

  // 3. O superior completa; cada novo desce ou sai.
  const pS = planejarPilares(m, S, hip);
  const manter: Command[] = [];
  const descer: Command[] = [];
  let semApoio = 0;
  const semApoioEm: Point[] = [];
  let nascemEmViga = 0;
  let n = proximoNumeroDePilar(m);
  for (const x of pS.pilares) {
    const embaixo = paredeSobOPonto(m, T, x.at, meio(x));
    const naViga = !embaixo && sobreAlgumTrecho(transicao, x.at);
    if (!embaixo && !naViga) {
      semApoio++;
      semApoioEm.push(x.at);
      continue;
    }
    const rotulo = `P${n++}`;
    manter.push(copia({ at: x.at, larguraMm: x.larguraMm, profundidadeMm: x.profundidadeMm, circular: false, rotacaoDeg: x.rotacaoDeg, rotulo }, S));
    for (const id of x.wallIds) {
      const w = m.walls.find((y) => y.id === id);
      if (w) ceder(w, manter);
    }
    if (naViga) {
      nascemEmViga++;
      continue;
    }
    if (embaixo && !pilarPerto(m, T, x.at, meio(x))) {
      descer.push(copia({ at: x.at, larguraMm: x.larguraMm, profundidadeMm: x.profundidadeMm, circular: false, rotacaoDeg: x.rotacaoDeg, rotulo }, T));
      ceder(embaixo, descer);
    }
  }
  lancar(manter);
  lancar(descer);
  const nManter = manter.filter((c) => c.type === 'AddStructural').length;
  const nDescer = descer.filter((c) => c.type === 'AddStructural').length;

  const foraDoPlano = [...pT.foraDoPlano.map((f) => `térreo: ${f.motivo}`), ...pS.foraDoPlano.map((f) => `superior: ${f.motivo}`)];
  const sobreAbertura = semApoioEm.filter((p) => paredeSobOPonto(m, T, p, 0, true)).length;
  const noVazio = semApoio - sobreAbertura;
  if (sobreAbertura) foraDoPlano.push(`${sobreAbertura} pilar(es) do superior cairiam sobre porta ou janela do térreo e ficaram fora — a viga do superior vence o vão maior; confira com o calculista (ou mude a abertura)`);
  if (noVazio) foraDoPlano.push(`${noVazio} pilar(es) do superior sem parede nem viga embaixo ficaram fora (nasceriam no meio de um cômodo do térreo) — a viga do superior vence o vão maior; confira com o calculista`);
  return {
    comandos,
    motivo: comandos.length ? null : (pT.motivo ?? pS.motivo),
    avisos: [...pT.avisos.map((a) => `térreo: ${a}`), ...pS.avisos.map((a) => `superior: ${a}`)],
    foraDoPlano,
    terreo: terreoDoPlanejador + nDescer,
    superior: nSobem + nManter,
    sobem: nSobem,
    descem: nDescer,
    nascemEmViga,
    semApoio,
    semApoioEm,
    sobreAbertura,
  };
}

/** Um trecho de parede do superior sem parede embaixo: onde a viga de transição do térreo passa. */
export interface TrechoDeTransicao {
  a: Point;
  b: Point;
  larguraMm: number;
}

const apoiadaEmBaixo = (p: Point, debaixo: readonly Wall[]) =>
  debaixo.some((d) => {
    const pr = projetar(p, d.a, d.b);
    return pr.L >= 1 && pr.t >= -1 && pr.t <= pr.L + 1 && pr.d <= d.thicknessMm / 2 + FOLGA_SOBRE_PAREDE_MM;
  });

function sobreAlgumTrecho(trechos: readonly TrechoDeTransicao[], p: Point): boolean {
  return trechos.some((t) => {
    const pr = projetar(p, t.a, t.b);
    return pr.L >= 1 && pr.t >= -t.larguraMm && pr.t <= pr.L + t.larguraMm && pr.d <= t.larguraMm / 2 + FOLGA_SOBRE_PAREDE_MM;
  });
}

/**
 * Os trechos das paredes do superior que não têm parede do térreo embaixo, de face a face das paredes do térreo
 * que cruzam (cada uma é um apoio), emendados quando colineares. Abaixo de `minimoMm` não vira viga.
 */
export function trechosDeTransicao(model: BlueprintModel, T: ObjectId, S: ObjectId, minimoMm = 300, passoMm = 50): TrechoDeTransicao[] {
  const debaixo = model.walls.filter((w) => w.levelId === T);
  const brutos: TrechoDeTransicao[] = [];
  for (const w of model.walls) {
    if (w.levelId !== S) continue;
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const n = Math.max(1, Math.round(L / passoMm));
    const em = (t: number) => point(Math.round(w.a.x + (w.b.x - w.a.x) * t), Math.round(w.a.y + (w.b.y - w.a.y) * t));
    let ini: number | null = null;
    for (let k = 0; k <= n; k++) {
      const solta = k < n && !apoiadaEmBaixo({ x: w.a.x + ((w.b.x - w.a.x) * (k + 0.5)) / n, y: w.a.y + ((w.b.y - w.a.y) * (k + 0.5)) / n }, debaixo);
      if (solta && ini === null) ini = k;
      if (!solta && ini !== null) {
        brutos.push({ a: em(ini / n), b: em(k / n), larguraMm: w.thicknessMm });
        ini = null;
      }
    }
  }
  // Emendar os colineares que se tocam (a parede do superior partida em duas no encontro em T).
  const out = brutos.map((t) => ({ ...t }));
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (let i = 0; i < out.length && !mudou; i++) {
      for (let j = i + 1; j < out.length && !mudou; j++) {
        const p = out[i];
        const q = out[j];
        const ux = p.b.x - p.a.x;
        const uy = p.b.y - p.a.y;
        const col = (r: Point) => Math.abs(ux * (r.y - p.a.y) - uy * (r.x - p.a.x)) / (Math.hypot(ux, uy) || 1) < 1;
        if (!col(q.a) || !col(q.b)) continue;
        const pontas = [p.a, p.b, q.a, q.b];
        const toca = [p.a, p.b].some((x) => [q.a, q.b].some((y) => Math.hypot(x.x - y.x, x.y - y.y) <= 2));
        if (!toca) continue;
        const L = Math.hypot(ux, uy) || 1;
        const t = (r: Point) => ((r.x - p.a.x) * ux + (r.y - p.a.y) * uy) / L;
        const ord = pontas.slice().sort((x, y) => t(x) - t(y));
        out[i] = { a: ord[0], b: ord[3], larguraMm: Math.max(p.larguraMm, q.larguraMm) };
        out.splice(j, 1);
        mudou = true;
      }
    }
  }
  return out.filter((t) => Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) >= minimoMm).sort((p, q) => p.a.x - q.a.x || p.a.y - q.a.y || p.b.x - q.b.x || p.b.y - q.b.y);
}

/**
 * As VIGAS DE TRANSIÇÃO: no térreo, sob cada trecho de parede do superior sem parede embaixo — de apoio a apoio
 * (as paredes do térreo que ela cruza, com a viga delas). O mesmo pré-dimensionamento das vigas automáticas (vão ÷
 * divisor, mínimo, largura da parede), topo no pé-direito do térreo; cede o volume como as outras.
 */
export function vigasDeTransicao(
  model: BlueprintModel,
  T: ObjectId,
  trechos: readonly TrechoDeTransicao[],
  hip: HipotesesDeVigas = HIPOTESES_VIGAS_PADRAO,
): { comandos: Command[]; vigas: number; metros: number; maiorVaoMm: number; motivo: string | null; foraDoPlano: { motivo: string }[] } {
  const nivel = model.levels.find((l) => l.id === T);
  if (!nivel || trechos.length === 0) return { comandos: [], vigas: 0, metros: 0, maiorVaoMm: 0, motivo: null, foraDoPlano: [] };
  const n0 = proximoNumeroDoRotulo(model, 'V');
  const ids = idsPrevistosDeEstrutura(model, trechos.length);
  const comandos: Command[] = [];
  let mm = 0;
  let maior = 0;
  trechos.forEach((t, k) => {
    const L = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
    mm += L;
    maior = Math.max(maior, L);
    const h = alturaDaViga(L, hip);
    comandos.push({ type: 'AddStructural', levelId: T, kind: 'VIGA', pontos: [t.a, t.b], larguraMm: Math.max(hip.larguraMinimaMm, t.larguraMm), alturaMm: h, baseMm: nivel.defaultHeightMm - h, rotulo: `V${n0 + k}` });
  });
  comandos.push(...ids.map((id): Command => ({ type: 'SetCedeSobreposicao', id, cede: true })));
  return { comandos, vigas: trechos.length, metros: Math.round(mm / 100) / 10, maiorVaoMm: Math.round(maior), motivo: null, foraDoPlano: [] };
}

/**
 * O guarda-corpo e os corrimãos da escada em U do núcleo. Corrimão dos dois lados dos LANCES (o sugeridor do app;
 * o segmento da virada fica de fora — o corrimão dele atravessaria os lances). Guarda-corpo no superior, na borda do
 * furo sobre o primeiro lance: quem chega ao patamar de cima tem o vão do lance que sai do térreo ao lado.
 */
export function guardaCorpoDaEscada(model: BlueprintModel, T: ObjectId, S: ObjectId): Command[] {
  const e = (model.stairs ?? []).find((x) => x.levelId === T && x.pontos.length === 4);
  if (!e) return [];
  const corrimaos = sugerirGuardaCorpos(model, T, HIPOTESES_DE_GUARDA_CORPO_PADRAO)
    .sugestoes.filter((x) => x.origem === 'ESCADA' && x.origemId === e.id && !/lance 2$/.test(x.rotulo))
    .map((x) => x.comando);
  const [p0, , , p3] = e.pontos;
  const L = Math.hypot(p0.x - p3.x, p0.y - p3.y) || 1;
  const u = { x: (p0.x - p3.x) / L, y: (p0.y - p3.y) / L };
  const meio = point(Math.round((p0.x + p3.x) / 2), Math.round((p0.y + p3.y) / 2));
  const fora = point(Math.round(p0.x + (u.x * e.larguraMm) / 2), Math.round(p0.y + (u.y * e.larguraMm) / 2));
  return [
    ...corrimaos,
    { type: 'AddGuardaCorpo', levelId: S, tipo: 'GUARDA_CORPO', pontos: [meio, fora], alturaMm: HIPOTESES_DE_GUARDA_CORPO_PADRAO.alturaGuardaCorpoMm, material: 'METALICO', rotulo: `${e.rotulo || 'Escada'} · guarda-corpo do furo`, sugerido: true },
  ];
}

// ─── F12c: o SHAFT das instalações ─────────────────────────────────────────

/** Onde o shaft prefere cair no térreo (o primeiro que serve vence): área molhada e de serviço antes de sala. */
const PREFERENCIA_DO_SHAFT_NO_TERREO: string[] = ['AREA_DE_SERVICO', 'LAVABO', 'COZINHA', 'GARAGEM', 'ESCRITORIO', 'VARANDA', 'SALA'];
/** F14c: onde o shaft pode ser CAIXA no canto do cômodo de baixo (sem parede do térreo sob a face). */
const USOS_QUE_ACEITAM_CAIXA_DE_SHAFT = new Set(['AREA_DE_SERVICO', 'GARAGEM', 'CIRCULACAO', 'BANHEIRO', 'LAVABO', 'DEPOSITO']);

export interface ShaftDoSobrado {
  ring: Point[];
  /** O banheiro de cima que ele atende e o cômodo do térreo onde ele desce. */
  banheiro: string;
  noTerreo: string | null;
}

/**
 * O SHAFT de cada banheiro do superior (o tubo de queda e as colunas de água descem por ele — `shaftPreferido` do
 * esgoto e da água, num raio de 3 m): um quadrado de `ladoMm` dentro do banheiro, encostado numa parede que TEM
 * parede do térreo embaixo, fora de porta e janela (nos dois pavimentos), de pilar e do núcleo da escada. No
 * térreo ele vira um enchimento junto da mesma parede — no cômodo de serviço antes da sala. Um shaft a até
 * `raioMm` de outro banheiro já o atende.
 */
export function shaftsDoSobrado(model: BlueprintModel, T: ObjectId, S: ObjectId, nucleo: Point[] | null, ladoMm = 400, raioMm = 2500): ShaftDoSobrado[] {
  const banheiros = model.spaces
    .filter((x) => x.levelId === S && usoDoNome(x.name) === 'BANHEIRO' && x.ring.length >= 3)
    .sort((a, b) => b.areaMm2 - a.areaMm2);
  const saida: ShaftDoSobrado[] = [];
  for (const ban of banheiros) {
    const cb = centroDoAnel(ban.ring);
    if (saida.some((x) => Math.hypot(centroDoAnel(x.ring).x - cb.x, centroDoAnel(x.ring).y - cb.y) <= raioMm)) continue;
    const melhor = lugarDoShaft(model, T, S, ban.ring, nucleo, ladoMm, (c, embaixo) => {
      const pref = embaixo ? PREFERENCIA_DO_SHAFT_NO_TERREO.indexOf(usoDoNome(embaixo.name) ?? '') : -1;
      return (pref < 0 ? 50 : pref * 5) + Math.hypot(c.x - cb.x, c.y - cb.y) / 1000;
    });
    if (melhor) saida.push({ ring: melhor.ring, banheiro: ban.name ?? 'Banheiro', noTerreo: melhor.noTerreo });
  }
  return saida;
}

const distanciaAoLado = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

const centroDoAnel = (r: readonly Point[]) => ({ x: r.reduce((a, p) => a + p.x, 0) / r.length, y: r.reduce((a, p) => a + p.y, 0) / r.length });

/**
 * O melhor lugar de um shaft (quadrado de `ladoMm`) encostado numa parede de dentro do `anel` do pavimento de cima —
 * pelo `custo` (menor ganha). Duas passadas (F14c, 16/10/2026): a 1ª exige parede do térreo embaixo da face; sem lugar
 * assim (o banheiro da suíte sobre a área de serviço ficava SEM shaft e despejava a 7 m), a 2ª aceita o shaft como
 * CAIXA no canto do cômodo de baixo, se ele não for de permanência (garagem, serviço, circulação, banheiro, depósito).
 */
function lugarDoShaft(
  model: BlueprintModel,
  T: ObjectId,
  S: ObjectId,
  anel: readonly Point[],
  nucleo: Point[] | null,
  ladoMm: number,
  custo: (c: { x: number; y: number }, embaixo: BlueprintModel['spaces'][number] | null) => number,
): { ring: Point[]; custo: number; noTerreo: string | null } | null {
  const pilares = (model.structures ?? []).filter((x) => x.kind === 'PILAR' && (x.levelId === T || x.levelId === S));
  const shafts = (model.nucleos ?? []).filter((n) => n.tipo === 'SHAFT');
  // F14c: as peças já postas nos dois pavimentos (louças, aquecedor, caixa sifonada, móveis) — o shaft junto das peças,
  // que nasce depois delas, cobria o aquecedor do térreo e a caixa sifonada de cima (sobrado a 30°). Só a peça DENTRO
  // do shaft o recusa: encostada do lado de fora é o bom, o vaso despeja direto no tubo de queda (com 2 cm de folga, o
  // ralo do vaso a 5 mm da face deixava o banheiro da suíte sem shaft e o tubo de queda descia no meio da cozinha).
  const pecas = (model.terminais ?? []).filter((x) => x.levelId === T || x.levelId === S).map((x) => x.at);
  const moveis = (model.componentes ?? []).filter((x) => x.levelId === T || x.levelId === S).map((x) => contornoDoComponente(x));
  const cobrePeca = (ring: Point[]) => {
    if (pecas.some((p) => pointInPolygon(ring, p))) return true;
    const c = centroDoAnel(ring) as Point;
    return moveis.some((m) => pointInPolygon(m, c) || ring.some((q) => pointInPolygon(m, q)) || m.some((q) => pointInPolygon(ring, q)));
  };
  let melhor: { ring: Point[]; custo: number; noTerreo: string | null } | null = null;
  for (const exigente of [true, false]) {
    if (melhor) break;
    for (let i = 0; i < anel.length; i++) {
      const a = anel[i];
      const b = anel[(i + 1) % anel.length];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < ladoMm + 400) continue;
      const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
      // A normal para DENTRO do banheiro.
      const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let n = { x: -u.y, y: u.x };
      if (!pointInPolygon(anel as Point[], { x: meio.x + n.x * 50, y: meio.y + n.y * 50 } as Point)) n = { x: u.y, y: -u.x };
      const wS = paredeSobOPonto(model, S, meio, 0, true);
      if (!wS) continue;
      const recuo = wS.thicknessMm / 2;
      for (let t = 200; t + ladoMm <= L - 200; t += 100) {
        const p0 = { x: a.x + u.x * t, y: a.y + u.y * t };
        const p1 = { x: a.x + u.x * (t + ladoMm), y: a.y + u.y * (t + ladoMm) };
        const pm = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
        // Parede do térreo embaixo em toda a face, e nenhuma porta ou janela no trecho — nos dois pavimentos.
        if (exigente && ![p0, pm, p1].every((q) => paredeSobOPonto(model, T, q, 0, true))) continue;
        if ((exigente && !paredeSobOPonto(model, T, pm, ladoMm / 2)) || !paredeSobOPonto(model, S, pm, ladoMm / 2)) continue;
        const ring = [
          { x: p0.x + n.x * recuo, y: p0.y + n.y * recuo },
          { x: p1.x + n.x * recuo, y: p1.y + n.y * recuo },
          { x: p1.x + n.x * (recuo + ladoMm), y: p1.y + n.y * (recuo + ladoMm) },
          { x: p0.x + n.x * (recuo + ladoMm), y: p0.y + n.y * (recuo + ladoMm) },
        ].map((q) => point(Math.round(q.x), Math.round(q.y)));
        const c = centroDoAnel(ring);
        if (!ring.every((q) => pointInPolygon(anel as Point[], q) || Math.hypot(q.x - c.x, q.y - c.y) < 1)) continue;
        if (nucleo && (ring.some((q) => pointInPolygon(nucleo, q)) || pointInPolygon(nucleo, c as Point))) continue;
        if (pilares.some((x) => Math.hypot(x.pontos[0].x - c.x, x.pontos[0].y - c.y) < ladoMm / 2 + Math.max(x.larguraMm, x.profundidadeMm) / 2 + 30)) continue;
        // Não em cima de outro shaft.
        if (shafts.some((sh) => pointInPolygon(sh.ring, c as Point) || ring.some((q) => pointInPolygon(sh.ring, q)))) continue;
        if (cobrePeca(ring)) continue;
        const embaixo = model.spaces.find((x) => x.levelId === T && pointInPolygon(x.ring, c as Point)) ?? null;
        // Na 2ª passada, o shaft é caixa no cômodo de baixo: todo o anel dentro dele, e ele não é de permanência.
        if (!exigente && (!embaixo || !USOS_QUE_ACEITAM_CAIXA_DE_SHAFT.has(usoDoNome(embaixo.name) ?? '') || !ring.every((q) => pointInPolygon(embaixo.ring, q)))) continue;
        const k = custo(c, embaixo);
        if (!melhor || k < melhor.custo) melhor = { ring, custo: k, noTerreo: embaixo?.name ?? null };
      }
    }
  }
  return melhor;
}

/**
 * F14c: o shaft JUNTO DAS PEÇAS de um banheiro de cima — o mais perto de `alvo` (o centro das peças que despejam
 * nele). O shaft do F12c nasce antes do mobiliário e vai para a ponta preferida do banheiro; no banheiro comprido (o
 * da suíte, 6,5 × 1,4 m) as peças ficavam a 5 m dele. `null` = sem lugar.
 */
export function shaftJuntoDasPecas(model: BlueprintModel, T: ObjectId, S: ObjectId, banheiro: readonly Point[], alvo: { x: number; y: number }, nucleo: Point[] | null, ladoMm = 400): ShaftDoSobrado | null {
  const melhor = lugarDoShaft(model, T, S, banheiro, nucleo, ladoMm, (c) => Math.hypot(c.x - alvo.x, c.y - alvo.y));
  return melhor ? { ring: melhor.ring, banheiro: '', noTerreo: melhor.noTerreo } : null;
}

/**
 * F14c: as ÁREAS MOLHADAS de um grupo num banheiro — `zonaMolhadaDoBanheiro`, mas com as peças em volta do shaft
 * repartidas pela FACE dele que cada uma enxerga (a de maior afastamento): uma área por face, cada uma parando nela.
 * No banheiro da suíte do sobrado a 30°, o vaso e o lavatório ficam de um lado e a caixa sifonada de outro, em "L":
 * com uma área só, o shaft ficava dentro dela e a água de baixo não chegava às colunas; assim, as faces sem peça
 * ficam fora do rebaixo.
 */
export function zonasMolhadasDoBanheiro(
  banheiro: readonly Point[],
  pontos: readonly { x: number; y: number }[],
  margemMm: number,
  shaft: readonly Point[] | null,
  caminho: readonly { x: number; y: number }[] = [],
): Point[][] {
  const uma = () => {
    const z = zonaMolhadaDoBanheiro(banheiro, pontos, margemMm, shaft ? [shaft] : [], caminho);
    return z ? [z] : [];
  };
  const b = anelLimpo(banheiro as Point[]);
  if (!shaft || b.length < 3 || pontos.length < 2) return uma();
  const L = Math.hypot(b[1].x - b[0].x, b[1].y - b[0].y) || 1;
  const u = { x: (b[1].x - b[0].x) / L, y: (b[1].y - b[0].y) / L };
  const n = { x: -u.y, y: u.x };
  const em = (p: { x: number; y: number }) => ({ s: p.x * u.x + p.y * u.y, t: p.x * n.x + p.y * n.y });
  const es = shaft.map(em);
  const [a0, a1] = [Math.min(...es.map((q) => q.s)), Math.max(...es.map((q) => q.s))];
  const [b0, b1] = [Math.min(...es.map((q) => q.t)), Math.max(...es.map((q) => q.t))];
  /** A face que o ponto enxerga (0: antes em s, 1: depois em s, 2: antes em t, 3: depois em t), ou −1 (dentro). */
  const face = (p: { x: number; y: number }) => {
    const q = em(p);
    const afast = [a0 - q.s, q.s - a1, b0 - q.t, q.t - b1];
    const k = afast.indexOf(Math.max(...afast));
    return afast[k] >= 0 ? k : -1;
  };
  const fora = pontos.filter((p) => face(p) >= 0);
  const faces = [...new Set(fora.map(face))];
  if (faces.length <= 1) return uma();
  const zonas: Point[][] = [];
  for (const f of faces.sort()) {
    const z = zonaMolhadaDoBanheiro(banheiro, fora.filter((p) => face(p) === f), margemMm, [shaft], caminho.filter((p) => face(p) === f));
    if (z) zonas.push(z);
  }
  return zonas;
}

/**
 * F14c: o shaft que atende um grupo de peças de cima (o banheiro) — decisão do usuário: *"um tubo de queda por
 * banheiro de cima, no shaft colado nele"*. Vale o shaft que já existe DENTRO do banheiro (ou colado nele: um canto a
 * até 5 cm do contorno) a até `ateMm` do centro das peças; senão, um novo junto delas (`novo`). Antes valia qualquer
 * shaft a até 2 m — o de outro banheiro, do outro lado da parede, e o esgoto corria fora da laje rebaixada, no forro de
 * baixo (sobrado a 30°: 2,4 m). A previsão da laje rebaixada e o passo do shaft chamam esta mesma função.
 */
export function shaftDoGrupo(
  model: BlueprintModel,
  T: ObjectId,
  S: ObjectId,
  banheiro: readonly Point[],
  alvo: { x: number; y: number },
  nucleo: Point[] | null,
  ladoMm: number,
  ateMm: number,
): { ring: Point[]; novo: boolean; noTerreo: string | null } | null {
  const doBanheiro = (n: { ring: Point[] }) =>
    n.ring.some((q) => pointInPolygon(banheiro as Point[], q) || banheiro.some((b, i) => distanciaAoLado(q, banheiro[(i + banheiro.length - 1) % banheiro.length], b) <= 50));
  const existente = (model.nucleos ?? [])
    .filter((n) => n.tipo === 'SHAFT' && doBanheiro(n))
    .map((n) => ({ n, d: Math.hypot(centroDoAnel(n.ring).x - alvo.x, centroDoAnel(n.ring).y - alvo.y) }))
    .filter((x) => x.d <= ateMm)
    .sort((a, b) => a.d - b.d)[0];
  if (existente) return { ring: existente.n.ring, novo: false, noTerreo: null };
  const sh = shaftJuntoDasPecas(model, T, S, banheiro, alvo, nucleo, ladoMm);
  return sh ? { ring: sh.ring, novo: true, noTerreo: sh.noTerreo } : null;
}

/**
 * As PRUMADAS que atravessam um cômodo de outro pavimento: trecho vertical que encosta no piso do pavimento (vem de
 * baixo ou desce para baixo), com pelo menos `minimoMm`, fora de parede e de shaft. O que sobra depois do shaft e da
 * parede sobre parede (a ventilação de uma peça do térreo sobe na posição dela) — vira pendência com o cômodo.
 */
/** Até isto além da face, a prumada está rente à parede (no enchimento, e na faixa da disciplina — F14a), não no meio do cômodo. */
const RENTE_A_PAREDE_MM = 100;

export function prumadasPeloMeioDoComodo(model: BlueprintModel, minimoMm = 1500): { disciplina: string; rotulo: string | null; nivel: string; comodo: string }[] {
  const saida: { disciplina: string; rotulo: string | null; nivel: string; comodo: string }[] = [];
  for (const t of model.trechos ?? []) {
    if (Math.abs(t.a.x - t.b.x) >= 1 || Math.abs(t.a.y - t.b.y) >= 1) continue;
    if (Math.min(t.cotaAMm, t.cotaBMm) !== 0 || Math.abs(t.cotaAMm - t.cotaBMm) < minimoMm) continue;
    // Rente à parede conta como na parede (a coluna que desce a 3 cm da face da viga — F8b — fica no enchimento).
    const rente = model.walls.some((w) => {
      if (w.levelId !== t.levelId) return false;
      const pr = projetar(t.a, w.a, w.b);
      return pr.L >= 1 && pr.t >= -1 && pr.t <= pr.L + 1 && pr.d <= w.thicknessMm / 2 + RENTE_A_PAREDE_MM;
    });
    if (rente || (model.nucleos ?? []).some((n) => pointInPolygon(n.ring, t.a))) continue;
    const comodo = model.spaces.find((x) => x.levelId === t.levelId && pointInPolygon(x.ring, t.a));
    if (!comodo) continue;
    saida.push({ disciplina: t.disciplina, rotulo: t.rotulo ?? null, nivel: model.levels.find((l) => l.id === t.levelId)?.name ?? '', comodo: comodo.name ?? 'cômodo sem nome' });
  }
  return saida;
}

// ─── F14c: a laje rebaixada sob os banheiros de cima ─────────────────────────────────────────────────────────────

/** O anel sem pontas repetidas nem vértices colineares, no sentido anti-horário. */
function anelLimpo(anel: readonly Point[]): Point[] {
  let r = semEspiculas(anel).map((p) => ({ x: p.x, y: p.y })) as Point[];
  for (let mudou = true; mudou && r.length > 3; ) {
    mudou = false;
    for (let i = 0; i < r.length && r.length > 3; i++) {
      const a = r[(i + r.length - 1) % r.length];
      const b = r[i];
      const c = r[(i + 1) % r.length];
      const L = Math.hypot(c.x - a.x, c.y - a.y);
      if (L < 1 || Math.abs((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / L <= 2) {
        r.splice(i, 1);
        mudou = true;
        break;
      }
    }
  }
  if (signedArea(r) < 0) r = r.reverse();
  return r;
}

/** O polígono recortado pelo semiplano à ESQUERDA de a→b (`esquerda`) ou à direita (Sutherland–Hodgman). */
function recortarNoSemiplano(poli: readonly Point[], a: Point, b: Point, esquerda: boolean): Point[] {
  const lado = (p: Point) => ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) * (esquerda ? 1 : -1);
  const saida: Point[] = [];
  for (let i = 0; i < poli.length; i++) {
    const p = poli[i];
    const q = poli[(i + 1) % poli.length];
    const lp = lado(p);
    const lq = lado(q);
    if (lp >= 0) saida.push(p);
    if ((lp >= 0) !== (lq >= 0)) {
      const t = lp / (lp - lq);
      saida.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t } as Point);
    }
  }
  return saida;
}

/** O polígono no inteiro do mm, sem repetidos; `null` se sobrar menos que uma faixa útil. */
function pecaValida(poli: readonly Point[], areaMinimaMm2: number): Point[] | null {
  const r: Point[] = [];
  for (const p of poli) {
    const q = point(Math.round(p.x), Math.round(p.y));
    if (!r.length || r[r.length - 1].x !== q.x || r[r.length - 1].y !== q.y) r.push(q);
  }
  while (r.length > 1 && r[0].x === r[r.length - 1].x && r[0].y === r[r.length - 1].y) r.pop();
  if (r.length < 3) return null;
  const limpo = anelLimpo(r);
  return limpo.length >= 3 && Math.abs(signedArea(limpo)) >= areaMinimaMm2 ? limpo : null;
}

/** Abaixo disto a sobra da laje recortada some (a faixa debaixo da parede), mm². */
const AREA_MINIMA_DA_PECA_DE_LAJE_MM2 = 100_000;

/**
 * F14c (decisão do usuário, 16/10/2026: "laje rebaixada"): as lajes do térreo (o piso de cima) recortadas em volta de
 * cada banheiro de cima — a peça sob o banheiro desce `rebaixoMm` (o esgoto dele corre no enchimento do piso até o
 * tubo de queda, fora do forro do térreo), o resto continua no nível. Os banheiros são convexos (retângulos do
 * gerador): a laje fora de cada um sai em até 4 peças sem sobreposição (a de cada lado do banheiro), a de dentro é a
 * rebaixada. As bordas do rebaixo ficam sob as paredes do banheiro (viga ou parede do térreo embaixo — F12b).
 */
export function lajesComRebaixo(cmds: readonly Command[], levelId: ObjectId, banheiros: readonly (readonly Point[])[], rebaixoMm: number): { comandos: Command[]; rebaixadas: number } {
  if (rebaixoMm <= 0 || banheiros.length === 0) return { comandos: [...cmds], rebaixadas: 0 };
  const convexos = banheiros.map((b) => anelLimpo(b as Point[])).filter((b) => b.length >= 3 && b.every((p, i) => {
    const a = b[(i + b.length - 1) % b.length];
    const c = b[(i + 1) % b.length];
    return (p.x - a.x) * (c.y - p.y) - (p.y - a.y) * (c.x - p.x) >= 0;
  }));
  const saida: Command[] = [];
  let rebaixadas = 0;
  for (const c of cmds) {
    const laje = c as Extract<Command, { type: 'AddStructural' }>;
    // A laje sem base explícita (a do kernel por padrão) fica como está: não há de onde descer o rebaixo.
    if (c.type !== 'AddStructural' || laje.kind !== 'LAJE' || laje.levelId !== levelId || laje.baseMm == null) {
      saida.push(c);
      continue;
    }
    const base = laje.baseMm;
    let pecas: { anel: Point[]; rebaixada: boolean }[] = [{ anel: anelLimpo(laje.pontos as Point[]), rebaixada: false }];
    for (const b of convexos) {
      const novas: typeof pecas = [];
      for (const p of pecas) {
        if (p.rebaixada) {
          novas.push(p);
          continue;
        }
        let dentro: Point[] = p.anel;
        for (let i = 0; i < b.length && dentro.length >= 3; i++) dentro = recortarNoSemiplano(dentro, b[i], b[(i + 1) % b.length], true);
        const dentroValida = dentro.length >= 3 ? pecaValida(dentro, AREA_MINIMA_DA_PECA_DE_LAJE_MM2) : null;
        if (!dentroValida) {
          novas.push(p);
          continue;
        }
        // Fora do banheiro: à direita do lado i e à esquerda dos anteriores.
        for (let i = 0; i < b.length; i++) {
          let fora: Point[] = recortarNoSemiplano(p.anel, b[i], b[(i + 1) % b.length], false);
          for (let j = 0; j < i && fora.length >= 3; j++) fora = recortarNoSemiplano(fora, b[j], b[(j + 1) % b.length], true);
          const v = fora.length >= 3 ? pecaValida(fora, AREA_MINIMA_DA_PECA_DE_LAJE_MM2) : null;
          if (v) novas.push({ anel: v, rebaixada: false });
        }
        novas.push({ anel: dentroValida, rebaixada: true });
      }
      pecas = novas;
    }
    if (pecas.length === 1 && !pecas[0].rebaixada) {
      saida.push(c);
      continue;
    }
    pecas.forEach((p, k) => {
      if (p.rebaixada) rebaixadas++;
      saida.push({
        ...laje,
        pontos: p.anel.map((q) => ({ x: q.x, y: q.y })),
        baseMm: p.rebaixada ? base - rebaixoMm : base,
        rotulo: laje.rotulo ? `${laje.rotulo}${p.rebaixada ? 'r' : ''}${String.fromCharCode(97 + k)}` : laje.rotulo,
      } as Command);
    });
  }
  return { comandos: saida, rebaixadas };
}

/**
 * F14c: a ÁREA MOLHADA de um banheiro de cima — o retângulo das peças (no quadro do próprio banheiro: a direção do 1º
 * lado e a normal), aumentado de `margemMm` e recortado pelo banheiro (convexo). `null` se não sobra área.
 *
 * Com os `shafts` para onde o esgoto das peças corre, a área vai ATÉ A FACE de cada um, do lado das peças — o esgoto
 * entra no shaft por ela — e para ali: o shaft fica fora da laje rebaixada, para a água do pavimento de baixo chegar
 * às colunas dele pelo forro (com o shaft dentro, sob a laje rebaixada sobravam 3 cm de plenum e a água ia em reta).
 * O shaft cercado pelas peças (nenhuma face com todas do mesmo lado) entra inteiro. `caminho`: pontos do esgoto até o
 * shaft (a reta de cada peça ao tubo de queda, a parte dentro deste banheiro) — entram no retângulo, não na escolha da
 * face; sem peça no banheiro (o esgoto do vizinho só passa por ele), valem como peças.
 */
export function zonaMolhadaDoBanheiro(
  banheiro: readonly Point[],
  pontos: readonly { x: number; y: number }[],
  margemMm: number,
  shafts: readonly (readonly Point[])[] = [],
  caminho: readonly { x: number; y: number }[] = [],
): Point[] | null {
  const b = anelLimpo(banheiro as Point[]);
  if (pontos.length === 0) [pontos, caminho] = [caminho, []];
  if (b.length < 3 || pontos.length === 0) return null;
  const L = Math.hypot(b[1].x - b[0].x, b[1].y - b[0].y) || 1;
  const u = { x: (b[1].x - b[0].x) / L, y: (b[1].y - b[0].y) / L };
  const n = { x: -u.y, y: u.x };
  const em = (p: { x: number; y: number }) => ({ s: p.x * u.x + p.y * u.y, t: p.x * n.x + p.y * n.y });
  const ss = pontos.map((p) => em(p).s);
  const ts = pontos.map((p) => em(p).t);
  const cs = [...ss, ...caminho.map((p) => em(p).s)];
  const ct = [...ts, ...caminho.map((p) => em(p).t)];
  let [s0, s1, t0, t1] = [Math.min(...cs) - margemMm, Math.max(...cs) + margemMm, Math.min(...ct) - margemMm, Math.max(...ct) + margemMm];
  for (const sh of shafts) {
    // A peça que caiu DENTRO do shaft (sai dele no lançamento) não conta na escolha da face.
    const fora = pontos.filter((p) => !pointInPolygon(sh as Point[], p as Point));
    const fs = (fora.length ? fora : pontos).map((p) => em(p));
    const [ps0, ps1, pt0, pt1] = [Math.min(...fs.map((q) => q.s)), Math.max(...fs.map((q) => q.s)), Math.min(...fs.map((q) => q.t)), Math.max(...fs.map((q) => q.t))];
    const es = sh.map((q) => em(q));
    const [a0, a1] = [Math.min(...es.map((q) => q.s)), Math.max(...es.map((q) => q.s))];
    const [b0, b1] = [Math.min(...es.map((q) => q.t)), Math.max(...es.map((q) => q.t))];
    // A face do shaft que deixa TODAS as peças do outro lado: a área vai até ela e para.
    if (ps1 <= a0) s1 = a0;
    else if (ps0 >= a1) s0 = a1;
    else if (pt1 <= b0) t1 = b0;
    else if (pt0 >= b1) t0 = b1;
    else {
      [s0, s1, t0, t1] = [Math.min(s0, a0), Math.max(s1, a1), Math.min(t0, b0), Math.max(t1, b1)];
      continue;
    }
    // E a área cobre a face inteira na outra direção (o esgoto entra no shaft em qualquer ponto dela).
    if (ps1 <= a0 || ps0 >= a1) [t0, t1] = [Math.min(t0, b0), Math.max(t1, b1)];
    else [s0, s1] = [Math.min(s0, a0), Math.max(s1, a1)];
  }
  const de = (s: number, t: number) => ({ x: s * u.x + t * n.x, y: s * u.y + t * n.y }) as Point;
  let r: Point[] = [de(s0, t0), de(s1, t0), de(s1, t1), de(s0, t1)];
  if (signedArea(r) < 0) r = r.reverse();
  for (let i = 0; i < b.length && r.length >= 3; i++) r = recortarNoSemiplano(r, b[i], b[(i + 1) % b.length], true);
  return r.length >= 3 ? pecaValida(r, AREA_MINIMA_DA_PECA_DE_LAJE_MM2) : null;
}

