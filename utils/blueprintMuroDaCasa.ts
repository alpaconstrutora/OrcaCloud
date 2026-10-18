/**
 * F26 da casa automática (decisões do usuário, 16/10/2026: "muro + portão + calçada"; 18/10/2026: "família nova no
 * kernel") — o MURO do lote, os PORTÕES e as CALÇADAS internas, como comandos do kernel 0.104.0.
 *
 * - O muro corre DENTRO do lote, na divisa (o eixo à meia espessura dela): a FRENTE (as divisas marcadas FRENTE) no
 *   tipo da frente (mureta com grade, por padrão), as laterais e os fundos no tipo das divisas (alvenaria).
 * - Os portões são vãos da frente: o de pedestre diante da porta de entrada, o de garagem diante da garagem (ou das vagas
 *   descobertas). Encostando um no outro, o de pedestre vai para o lado que tem lugar.
 * - A base acompanha o TERRENO: com a cota do terreno, um vértice a cada `passoDaBaseMm` e a cota da base em cada um.
 * - As calçadas são sub-regiões: a da entrada (do muro à escada de acesso, ou à fachada) e o acesso da garagem.
 *
 * Puro: recebe o lote, a frente, a porta e a garagem (no quadro da frente: x ao longo da frente, y para os fundos) e
 * devolve os comandos e as pendências; quem chama aplica.
 */
import { FICHA_DO_MATERIAL_DE_SUB_REGIAO, type Boundary, type Command, type MaterialDeSubRegiao, type ObjectId, type Point, type PortaoDoMuro, type TipoDeMuro } from './blueprintKernel';
import type { PendenciaDoPpci } from './blueprintGeradorPpci';

export interface HipotesesDoMuroDaCasa {
  lancar: boolean;
  /** O muro da frente (padrão: mureta com grade). */
  tipoDaFrente: TipoDeMuro;
  alturaDaFrenteMm: number;
  /** Só na mureta com grade. */
  alturaDaMuretaMm: number;
  /** O muro das laterais e dos fundos (padrão: alvenaria). */
  tipoDasDivisas: TipoDeMuro;
  alturaDasDivisasMm: number;
  espessuraMm: number;
  larguraDoPortaoDePedestreMm: number;
  larguraDoPortaoDeGaragemMm: number;
  /** Folga do portão até a ponta do muro e até o outro portão. */
  folgaDoPortaoMm: number;
  /** No terreno inclinado, um vértice a cada este tanto — a base acompanha o terreno. */
  passoDaBaseMm: number;
  calcadas: boolean;
  materialDaCalcada: MaterialDeSubRegiao;
  materialDoAcessoDaGaragem: MaterialDeSubRegiao;
  larguraDaCalcadaMm: number;
  /** O resto do lote (dentro do muro, fora da casa e das calçadas) — a área permeável desenhada. */
  materialDoJardim: MaterialDeSubRegiao;
}

export const HIPOTESES_DO_MURO_DA_CASA_PADRAO: HipotesesDoMuroDaCasa = {
  lancar: true,
  tipoDaFrente: 'MURETA_COM_GRADE',
  alturaDaFrenteMm: 1800,
  alturaDaMuretaMm: 600,
  tipoDasDivisas: 'ALVENARIA',
  alturaDasDivisasMm: 1800,
  espessuraMm: 150,
  larguraDoPortaoDePedestreMm: 1000,
  larguraDoPortaoDeGaragemMm: 3000,
  folgaDoPortaoMm: 300,
  passoDaBaseMm: 3000,
  calcadas: true,
  materialDaCalcada: 'CONCRETO',
  materialDoAcessoDaGaragem: 'INTERTRAVADO',
  larguraDaCalcadaMm: 1200,
  materialDoJardim: 'GRAMA',
};

/** O quadro da frente: `ex` ao longo dela, `ey` para os fundos (o mesmo de `quadroDaFrente` da casa). */
export interface QuadroDoMuro {
  ex: Point;
  ey: Point;
}
interface Faixa {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface EntradaDoMuroDaCasa {
  levelId: ObjectId;
  /** O anel do lote, no mundo. */
  anelDoLote: readonly Point[];
  limites: readonly Boundary[];
  quadro: QuadroDoMuro;
  /** O meio da porta de entrada, x no quadro da frente; null = sem porta na frente. */
  portaX: number | null;
  /** A face da fachada da frente, y no quadro. */
  faceDaFachadaY: number;
  /** Onde a escada de acesso começa do lado da rua, y no quadro; null = sem escada. */
  inicioDaEscadaY: number | null;
  /** A projeção da casa (o anel dos EIXOS das paredes externas), no mundo — fora do jardim. */
  casaNoMundo: readonly Point[];
  /** Meia espessura da parede externa: a face da casa fica a ela do eixo. */
  meiaParedeMm: number;
  /** O que mais ocupa o chão do lote (a escada de acesso, a rampa), no quadro — fora do jardim. */
  obstaculos: readonly Faixa[];
  /** O acesso da garagem (a largura dela e até onde vai), no quadro; null = sem garagem coberta. */
  garagem: { x0: number; x1: number; yFim: number } | null;
  /** As vagas descobertas, no quadro; null = nenhuma. */
  vagasDescobertas: Faixa | null;
  /** A cota do terreno no ponto do mundo, mm do zero do desenho; null = sem terreno (a base no piso). */
  cotaDoTerreno: ((p: Point) => number | null) | null;
}

export interface PlanoDoMuroDaCasa {
  comandos: Command[];
  pendencias: PendenciaDoPpci[];
  resumo: {
    frenteM: number;
    divisasM: number;
    portoesDePedestre: number;
    portoesDeGaragem: number;
    /** Área das calçadas e do acesso da garagem, m²; e quanto dela é impermeável. */
    calcadasM2: number;
    impermeavelM2: number;
    /** O jardim (o resto do lote dentro do muro), m². */
    jardimM2: number;
  };
}

const paraLocal = (q: QuadroDoMuro, p: Point): Point => ({ x: p.x * q.ex.x + p.y * q.ex.y, y: p.x * q.ey.x + p.y * q.ey.y });
const paraMundo = (q: QuadroDoMuro, p: Point): Point => ({ x: p.x * q.ex.x + p.y * q.ey.x, y: p.x * q.ex.y + p.y * q.ey.y });
const inteiro = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });
const f2 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

function areaComSinal(anel: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** O anel deslocado `d` para DENTRO (anel anti-horário): cada vértice no encontro das duas arestas deslocadas. */
function anelParaDentro(anel: readonly Point[], d: number): Point[] {
  const n = anel.length;
  const linha = (i: number) => {
    const a = anel[i];
    const b = anel[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / L;
    const ny = (b.x - a.x) / L;
    return { a: { x: a.x + nx * d, y: a.y + ny * d }, u: { x: (b.x - a.x) / L, y: (b.y - a.y) / L } };
  };
  return anel.map((_, i) => {
    const l1 = linha((i - 1 + n) % n);
    const l2 = linha(i);
    const den = l1.u.x * l2.u.y - l1.u.y * l2.u.x;
    if (Math.abs(den) < 1e-9) return { x: anel[i].x + (l2.a.x - anel[i].x), y: anel[i].y + (l2.a.y - anel[i].y) };
    const t = ((l2.a.x - l1.a.x) * l2.u.y - (l2.a.y - l1.a.y) * l2.u.x) / den;
    return { x: l1.a.x + l1.u.x * t, y: l1.a.y + l1.u.y * t };
  });
}

/** A aresta do lote (no mundo) é da FRENTE? — pela divisa TERRENO marcada FRENTE que a contém. */
function ehDaFrente(a: Point, b: Point, limites: readonly Boundary[]): boolean {
  const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return limites.some((l) => {
    if (l.kind !== 'TERRENO' || l.papel !== 'FRENTE') return false;
    const L = Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);
    if (L < 1) return false;
    const t = ((meio.x - l.a.x) * (l.b.x - l.a.x) + (meio.y - l.a.y) * (l.b.y - l.a.y)) / (L * L);
    const px = l.a.x + (l.b.x - l.a.x) * t;
    const py = l.a.y + (l.b.y - l.a.y) * t;
    return t > -1e-6 && t < 1 + 1e-6 && Math.hypot(meio.x - px, meio.y - py) < 5;
  });
}

/** A polilinha com um vértice a cada `passo` (no máximo) — para a base seguir o terreno. */
function subdividir(pontos: readonly Point[], passo: number): Point[] {
  const saida: Point[] = [pontos[0]];
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1];
    const b = pontos[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(L / passo));
    for (let k = 1; k <= n; k++) saida.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return saida;
}

/** A distância, ao longo do percurso, do ponto da polilinha mais perto de `p`. */
function distanciaAoLongo(pontos: readonly Point[], p: Point): number {
  let melhor = { d2: Infinity, s: 0 };
  let acumulado = 0;
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1];
    const b = pontos[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (L * L)));
    const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const d2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d2 < melhor.d2) melhor = { d2, s: acumulado + L * t };
    acumulado += L;
  }
  return melhor.s;
}
const comprimento = (pontos: readonly Point[]) => pontos.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pontos[i].x, p.y - pontos[i].y), 0);

/**
 * O JARDIM em pedaços: o `dominio` (o lote dentro do muro, qualquer anel) menos os `obstaculos` (anéis ortogonais no
 * quadro: a casa, as calçadas), por FAIXAS horizontais — os cortes nas cotas y de todos os vértices. Em cada faixa, o
 * domínio é um ou mais trapézios (as arestas dele são retas dentro da faixa) e os obstáculos são intervalos fixos de x;
 * o que sobra vira polígono. Pedaços de faixas vizinhas com os mesmos lados se juntam num só.
 */
export function jardimDoLote(dominio: readonly Point[], obstaculos: readonly (readonly Point[])[]): Point[][] {
  const ys = [...new Set([...dominio, ...obstaculos.flat()].map((p) => Math.round(p.y)))].sort((a, b) => a - b);
  type Lado = { tipo: 'aresta'; i: number } | { tipo: 'x'; x: number };
  const nD = dominio.length;
  const xDaAresta = (i: number, y: number) => {
    const a = dominio[i];
    const b = dominio[(i + 1) % nD];
    return a.y === b.y ? a.x : a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
  };
  const xDe = (l: Lado, y: number) => (l.tipo === 'x' ? l.x : xDaAresta(l.i, y));
  const mesmo = (a: Lado, b: Lado) => (a.tipo === 'x' && b.tipo === 'x' ? Math.abs(a.x - b.x) < 0.5 : a.tipo === 'aresta' && b.tipo === 'aresta' && a.i === b.i);
  const intervalos = (anel: readonly Point[], y: number) => {
    const xs: { x: number; i: number }[] = [];
    for (let i = 0; i < anel.length; i++) {
      const a = anel[i];
      const b = anel[(i + 1) % anel.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push({ x: a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x), i });
    }
    xs.sort((p, r) => p.x - r.x);
    const pares: [{ x: number; i: number }, { x: number; i: number }][] = [];
    for (let k = 0; k + 1 < xs.length; k += 2) pares.push([xs[k], xs[k + 1]]);
    return pares;
  };
  const pecas: { esq: Lado; dir: Lado; y0: number; y1: number }[] = [];
  const abertas: { esq: Lado; dir: Lado; y0: number; y1: number }[] = [];
  for (let k = 0; k + 1 < ys.length; k++) {
    const y0 = ys[k];
    const y1 = ys[k + 1];
    if (y1 - y0 < 1) continue;
    const ym = (y0 + y1) / 2;
    const tiras: { esq: Lado; dir: Lado }[] = [];
    for (const [a, b] of intervalos(dominio, ym)) {
      // O trapézio do domínio, menos os intervalos dos obstáculos (fixos na faixa: os lados deles são verticais).
      let atual: { esq: Lado; dir: Lado }[] = [{ esq: { tipo: 'aresta', i: a.i }, dir: { tipo: 'aresta', i: b.i } }];
      for (const o of obstaculos) {
        for (const [c, d] of intervalos(o, ym)) {
          const proximo: { esq: Lado; dir: Lado }[] = [];
          for (const t of atual) {
            const xe = xDe(t.esq, ym);
            const xd = xDe(t.dir, ym);
            if (d.x <= xe || c.x >= xd) {
              proximo.push(t);
              continue;
            }
            if (c.x > xe) proximo.push({ esq: t.esq, dir: { tipo: 'x', x: c.x } });
            if (d.x < xd) proximo.push({ esq: { tipo: 'x', x: d.x }, dir: t.dir });
          }
          atual = proximo;
        }
      }
      tiras.push(...atual);
    }
    // Junta com a peça aberta da faixa de baixo que tem os mesmos lados; o resto fecha.
    const novas: typeof abertas = [];
    for (const t of tiras) {
      const k2 = abertas.findIndex((p) => p.y1 === y0 && mesmo(p.esq, t.esq) && mesmo(p.dir, t.dir));
      if (k2 >= 0) {
        const p = abertas.splice(k2, 1)[0];
        novas.push({ ...p, y1 });
      } else novas.push({ esq: t.esq, dir: t.dir, y0, y1 });
    }
    pecas.push(...abertas);
    abertas.length = 0;
    abertas.push(...novas);
  }
  pecas.push(...abertas);
  return pecas
    .map((p) => [
      { x: xDe(p.esq, p.y0), y: p.y0 },
      { x: xDe(p.dir, p.y0), y: p.y0 },
      { x: xDe(p.dir, p.y1), y: p.y1 },
      { x: xDe(p.esq, p.y1), y: p.y1 },
    ])
    .filter((r) => Math.min(r[1].x - r[0].x, r[2].x - r[3].x) > -1e-6 && Math.max(r[1].x - r[0].x, r[2].x - r[3].x) >= 100);
}

export function planejarMuroDaCasa(e: EntradaDoMuroDaCasa, hip: HipotesesDoMuroDaCasa): PlanoDoMuroDaCasa {
  const pendencias: PendenciaDoPpci[] = [];
  const comandos: Command[] = [];
  const resumo: PlanoDoMuroDaCasa['resumo'] = { frenteM: 0, divisasM: 0, portoesDePedestre: 0, portoesDeGaragem: 0, calcadasM2: 0, impermeavelM2: 0, jardimM2: 0 };
  if (e.anelDoLote.length < 3) return { comandos, pendencias: [{ grupo: 'PREMISSA', texto: 'Muro: o lote não está fechado — sem muro.' }], resumo };

  // ── O muro: o anel do lote (anti-horário) para dentro pela meia espessura, partido em frente × divisas ──
  const anel = areaComSinal(e.anelDoLote) >= 0 ? [...e.anelDoLote] : [...e.anelDoLote].reverse();
  const n = anel.length;
  const frente = anel.map((a, i) => ehDaFrente(a, anel[(i + 1) % n], e.limites));
  if (!frente.some(Boolean)) return { comandos, pendencias: [{ grupo: 'PREMISSA', texto: 'Muro: nenhuma divisa marcada FRENTE — sem muro.' }], resumo };
  const dentro = anelParaDentro(anel, hip.espessuraMm / 2);
  // As cadeias de arestas da mesma classe, começando numa troca de classe (a frente fica inteira numa só).
  const inicio = frente.every(Boolean) ? 0 : frente.findIndex((f, i) => f !== frente[(i - 1 + n) % n]);
  const cadeias: { frente: boolean; pontos: Point[] }[] = [];
  for (let k = 0; k < n; k++) {
    const i = (inicio + k) % n;
    const ultima = cadeias[cadeias.length - 1];
    if (ultima && ultima.frente === frente[i]) ultima.pontos.push(dentro[(i + 1) % n]);
    else cadeias.push({ frente: frente[i], pontos: [dentro[i], dentro[(i + 1) % n]] });
  }
  if (frente.every(Boolean)) cadeias[0].pontos.push(dentro[0]);

  const cotas = (pontos: Point[]): number[] | null => {
    if (!e.cotaDoTerreno) return null;
    const c = pontos.map((p) => e.cotaDoTerreno!(p));
    return c.every((x): x is number => x != null && Number.isFinite(x)) ? c.map((x) => Math.round(x)) : null;
  };
  let semTerreno = false;
  const lancarMuro = (pontosBrutos: Point[], tipo: TipoDeMuro, alturaMm: number, portoes: PortaoDoMuro[], rotulo: string) => {
    const pontos = (e.cotaDoTerreno ? subdividir(pontosBrutos, hip.passoDaBaseMm) : pontosBrutos).map(inteiro).filter((p, i, a) => i === 0 || p.x !== a[i - 1].x || p.y !== a[i - 1].y);
    if (pontos.length < 2) return;
    const base = cotas(pontos);
    if (e.cotaDoTerreno && !base) semTerreno = true;
    comandos.push({
      type: 'AddMuro',
      levelId: e.levelId,
      pontos,
      tipo,
      alturaMm,
      espessuraMm: hip.espessuraMm,
      ...(tipo === 'MURETA_COM_GRADE' ? { alturaDaMuretaMm: Math.min(hip.alturaDaMuretaMm, alturaMm - 1) } : {}),
      ...(base ? { cotasDaBaseMm: base } : {}),
      portoes,
      rotulo,
    });
  };

  // ── Os portões, na frente ──
  const q = e.quadro;
  const loteLocal = anel.map((p) => paraLocal(q, p));
  const yFrente = Math.min(...loteLocal.map((p) => p.y));
  const yDentroDoMuro = yFrente + hip.espessuraMm;
  const cadeiaDaFrente = cadeias.find((c) => c.frente)!;
  const pontosDaFrente = cadeiaDaFrente.pontos;
  const Lf = comprimento(pontosDaFrente);
  const folga = hip.folgaDoPortaoMm;
  const vao = (xCentro: number, largura: number) => {
    const s = distanciaAoLongo(pontosDaFrente, paraMundo(q, { x: xCentro, y: yFrente + hip.espessuraMm / 2 }));
    const w = Math.min(largura, Math.max(0, Lf - 2 * folga));
    return { ini: Math.round(Math.max(folga, Math.min(Lf - folga - w, s - w / 2))), w: Math.round(w) };
  };
  const portoes: PortaoDoMuro[] = [];
  const acessoDaGaragem: Faixa | null = e.garagem
    ? { x0: e.garagem.x0, x1: e.garagem.x1, y0: yDentroDoMuro, y1: e.garagem.yFim }
    : e.vagasDescobertas
      ? { ...e.vagasDescobertas, y0: Math.max(yDentroDoMuro, e.vagasDescobertas.y0) }
      : null;
  if (acessoDaGaragem) {
    const g = vao((acessoDaGaragem.x0 + acessoDaGaragem.x1) / 2, Math.min(hip.larguraDoPortaoDeGaragemMm, acessoDaGaragem.x1 - acessoDaGaragem.x0));
    if (g.w >= 2000) portoes.push({ tipo: 'GARAGEM', offsetMm: g.ini, larguraMm: g.w });
    else pendencias.push({ grupo: 'VERIFICACAO', texto: `Muro: o portão de garagem não cabe na frente (${f2(g.w / 1000)} m) — desenhe-o à mão.` });
  }
  let portaoX: number | null = null;
  if (e.portaX != null) {
    let p = vao(e.portaX, hip.larguraDoPortaoDePedestreMm);
    const gar = portoes.find((x) => x.tipo === 'GARAGEM');
    if (gar && p.ini < gar.offsetMm + gar.larguraMm + folga && p.ini + p.w + folga > gar.offsetMm) {
      // Encostou no de garagem: vai para o lado que tem lugar (o mais perto da porta).
      const antes = gar.offsetMm - folga - p.w;
      const depois = gar.offsetMm + gar.larguraMm + folga;
      const cabeAntes = antes >= folga;
      const cabeDepois = depois + p.w <= Lf - folga;
      const sPorta = p.ini + p.w / 2;
      const escolha = cabeAntes && cabeDepois ? (Math.abs(antes + p.w / 2 - sPorta) <= Math.abs(depois + p.w / 2 - sPorta) ? antes : depois) : cabeAntes ? antes : cabeDepois ? depois : null;
      if (escolha == null) {
        pendencias.push({ grupo: 'VERIFICACAO', texto: 'Muro: o portão de pedestre não cabe ao lado do de garagem — a entrada é pelo portão de garagem.' });
        p = { ini: -1, w: 0 };
      } else {
        p = { ini: Math.round(escolha), w: p.w };
        pendencias.push({ grupo: 'CONFERIR', texto: 'Muro: o portão de pedestre foi para o lado do de garagem (diante da porta não cabia).' });
      }
    }
    if (p.ini >= 0 && p.w > 0) {
      portoes.push({ tipo: 'PEDESTRE', offsetMm: p.ini, larguraMm: p.w });
      // O x (no quadro) do meio do portão de pedestre — a calçada sai dele.
      const meio = p.ini + p.w / 2;
      let acc = 0;
      for (let i = 1; i < pontosDaFrente.length; i++) {
        const L = Math.hypot(pontosDaFrente[i].x - pontosDaFrente[i - 1].x, pontosDaFrente[i].y - pontosDaFrente[i - 1].y);
        if (acc + L >= meio) {
          const t = (meio - acc) / (L || 1);
          portaoX = paraLocal(q, { x: pontosDaFrente[i - 1].x + (pontosDaFrente[i].x - pontosDaFrente[i - 1].x) * t, y: pontosDaFrente[i - 1].y + (pontosDaFrente[i].y - pontosDaFrente[i - 1].y) * t }).x;
          break;
        }
        acc += L;
      }
    }
  } else pendencias.push({ grupo: 'NAO_DECIDIDO', texto: 'Muro: a porta de entrada não está na fachada da frente — o portão de pedestre fica à mão.' });
  portoes.sort((a, b) => a.offsetMm - b.offsetMm);

  for (const c of cadeias) {
    if (c.frente) lancarMuro(c.pontos, hip.tipoDaFrente, hip.alturaDaFrenteMm, c === cadeiaDaFrente ? portoes : [], 'Muro da frente');
    else lancarMuro(c.pontos, hip.tipoDasDivisas, hip.alturaDasDivisasMm, [], 'Muro de divisa');
    if (c.frente) resumo.frenteM += comprimento(c.pontos) / 1000;
    else resumo.divisasM += comprimento(c.pontos) / 1000;
  }
  resumo.frenteM = Math.round(resumo.frenteM * 100) / 100;
  resumo.divisasM = Math.round(resumo.divisasM * 100) / 100;
  resumo.portoesDePedestre = portoes.filter((g) => g.tipo === 'PEDESTRE').length;
  resumo.portoesDeGaragem = portoes.filter((g) => g.tipo === 'GARAGEM').length;
  if (semTerreno) pendencias.push({ grupo: 'PREMISSA', texto: 'Muro: a topografia não cobre o lote inteiro — o pé do muro ficou no piso do térreo; confira.' });

  // ── As calçadas ──
  if (hip.calcadas) {
    const ocupado: Point[][] = [];
    const regiao = (f: Faixa, material: MaterialDeSubRegiao, nome: string) => {
      if (f.x1 - f.x0 < 300 || f.y1 - f.y0 < 300) return;
      ocupado.push([{ x: f.x0, y: f.y0 }, { x: f.x1, y: f.y0 }, { x: f.x1, y: f.y1 }, { x: f.x0, y: f.y1 }]);
      const pontos = [
        { x: f.x0, y: f.y0 },
        { x: f.x1, y: f.y0 },
        { x: f.x1, y: f.y1 },
        { x: f.x0, y: f.y1 },
      ].map((p) => inteiro(paraMundo(q, p)));
      comandos.push({ type: 'AddSubRegiao', levelId: e.levelId, material, pontos, nome });
      const m2 = ((f.x1 - f.x0) * (f.y1 - f.y0)) / 1e6;
      resumo.calcadasM2 += m2;
      if (!FICHA_DO_MATERIAL_DE_SUB_REGIAO[material].permeavel) resumo.impermeavelM2 += m2;
    };
    if (acessoDaGaragem) regiao(acessoDaGaragem, hip.materialDoAcessoDaGaragem, e.garagem ? 'Acesso da garagem' : 'Vagas descobertas');
    if (portaoX != null) {
      const fim = e.inicioDaEscadaY ?? e.faceDaFachadaY;
      const w = hip.larguraDaCalcadaMm;
      const f: Faixa = { x0: portaoX - w / 2, x1: portaoX + w / 2, y0: yDentroDoMuro, y1: fim };
      const sobre = acessoDaGaragem && f.x0 < acessoDaGaragem.x1 && f.x1 > acessoDaGaragem.x0;
      if (!sobre) regiao(f, hip.materialDaCalcada, 'Calçada da entrada');
    }
    resumo.calcadasM2 = Math.round(resumo.calcadasM2 * 100) / 100;
    resumo.impermeavelM2 = Math.round(resumo.impermeavelM2 * 100) / 100;

    // O JARDIM: o lote dentro do muro, fora da casa (a face externa), das calçadas e do que mais ocupa o chão. Sem ele, a
    // permeabilidade DESENHADA (as sub-regiões) seria só a das calçadas — zero — e a regra da zona acusaria em falso.
    const dominio = anelParaDentro(anel, hip.espessuraMm).map((p) => paraLocal(q, p));
    const casaLocal = e.casaNoMundo.map((p) => paraLocal(q, p));
    const casa = casaLocal.length >= 3 ? anelParaDentro(areaComSinal(casaLocal) >= 0 ? casaLocal : [...casaLocal].reverse(), -e.meiaParedeMm) : [];
    const obst = [...(casa.length ? [casa] : []), ...ocupado, ...e.obstaculos.map((f) => [{ x: f.x0, y: f.y0 }, { x: f.x1, y: f.y0 }, { x: f.x1, y: f.y1 }, { x: f.x0, y: f.y1 }])];
    for (const peca of jardimDoLote(dominio, obst)) {
      const pontos = peca.map((p) => inteiro(paraMundo(q, p))).filter((p, i, a) => i === 0 || p.x !== a[i - 1].x || p.y !== a[i - 1].y);
      if (pontos.length < 3) continue;
      const area = Math.abs(areaComSinal(pontos)) / 1e6;
      if (area < 0.05) continue;
      comandos.push({ type: 'AddSubRegiao', levelId: e.levelId, material: hip.materialDoJardim, pontos, nome: 'Jardim' });
      resumo.jardimM2 += area;
    }
    resumo.jardimM2 = Math.round(resumo.jardimM2 * 100) / 100;
  }
  return { comandos, pendencias, resumo };
}
