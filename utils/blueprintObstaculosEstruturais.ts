/**
 * E5.5 — O TRAÇADO AUTOMÁTICO DESVIA DA ESTRUTURA (29/09/2026, roadmap
 * hidrossanitário).
 *
 * O que o traçado da água (pelas paredes) passa a respeitar:
 *  - PILAR: aresta do grafo que entra na pegada de um pilar custa como 10 m de
 *    tubo a mais — a rota contorna por outras paredes quando o desvio é menor
 *    que isso e só atravessa quando não há outro caminho (os pilares costumam
 *    estar NOS encontros das paredes: proibir tornaria quase todo canto
 *    inútil). Multiplicar o comprimento não serviria: 10× de um pilar de 20 cm
 *    são 1,8 m, e o desvio de verdade é de metros. A COLUNA de água que cairia
 *    dentro de um pilar escorrega pela parede até logo fora dele.
 *  - VIGA: o barrilete desce para 10 cm abaixo do fundo da viga mais baixa do
 *    teto do pavimento, em vez de correr dentro dela.
 *
 * O que continua como verificação (marca no desenho e item da conferência): o
 * tubo que atravessa um pilar (o desvio do esgoto é backlog) e o que cruza uma
 * viga (furo em viga é decisão do projeto estrutural).
 */
import type { BlueprintModel, ObjectId, Point, Structural, Wall } from './blueprintKernel';
import { pegadaEmPlanta, pointInPolygon } from './blueprintKernel';

type P2 = { x: number; y: number };

/** O que custa, em mm de tubo, a aresta que entra num pilar. */
export const PENALIDADE_DO_PILAR_MM = 10_000;
/** Folga entre a face do pilar e o tubo que escorregou para fora dele. */
export const FOLGA_DO_PILAR_MM = 50;
/** Quanto o barrilete fica abaixo do fundo da viga mais baixa. */
export const ABAIXO_DA_VIGA_MM = 100;
/** A viga "de teto": o topo dela a menos disto do teto do pavimento. */
const VIGA_DE_TETO_MM = 200;

/** As pegadas em planta dos pilares do pavimento. */
export function pegadasDePilares(model: BlueprintModel, levelId: ObjectId): Point[][] {
  return (model.structures ?? []).filter((s) => s.kind === 'PILAR' && s.levelId === levelId).map((s) => pegadaEmPlanta(s));
}

const dentroDeAlguma = (pegadas: readonly Point[][], p: P2) => pegadas.some((g) => pointInPolygon(g, p as Point));

/** A fração (0–1) do segmento que corre DENTRO de alguma pegada (amostragem a cada ~50 mm). */
export function fracaoDentro(a: P2, b: P2, pegadas: readonly Point[][]): number {
  if (pegadas.length === 0) return 0;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(2, Math.ceil(L / 50));
  let dentro = 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    if (dentroDeAlguma(pegadas, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) dentro++;
  }
  return dentro / n;
}

/** O custo de uma aresta: o comprimento, mais `PENALIDADE_DO_PILAR_MM` se ela entra num pilar. */
export function custoComPilares(a: P2, b: P2, pegadas: readonly Point[][]): number {
  return Math.hypot(b.x - a.x, b.y - a.y) + (fracaoDentro(a, b, pegadas) > 0 ? PENALIDADE_DO_PILAR_MM : 0);
}

/**
 * O ponto `p` (sobre o eixo da parede `w`) fora de qualquer pilar: se cair
 * dentro de um, escorrega pelo eixo — para o lado mais perto — até
 * `FOLGA_DO_PILAR_MM` além da face. Sem saída dentro da parede, fica onde está.
 */
export function foraDoPilar(p: P2, w: Pick<Wall, 'a' | 'b'>, pegadas: readonly Point[][]): P2 {
  if (!dentroDeAlguma(pegadas, p)) return p;
  const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  if (L === 0) return p;
  const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
  const t0 = (p.x - w.a.x) * u.x + (p.y - w.a.y) * u.y;
  const em = (s: number) => ({ x: Math.round(w.a.x + u.x * s), y: Math.round(w.a.y + u.y * s) });
  for (let d = 1; d <= L; d++) {
    for (const s of [t0 - d, t0 + d]) {
      if (s < 0 || s > L || dentroDeAlguma(pegadas, em(s))) continue;
      const comFolga = Math.max(0, Math.min(L, s + (s < t0 ? -FOLGA_DO_PILAR_MM : FOLGA_DO_PILAR_MM)));
      return dentroDeAlguma(pegadas, em(comFolga)) ? em(s) : em(comFolga);
    }
  }
  return p;
}

/** Afastamento dos cantos do pilar que o eletroduto contorna (E6.3), mm. */
export const AFASTAMENTO_DO_CONTORNO_MM = 100;

/**
 * E6.3 — O CONTORNO DO PILAR (29/09/2026, roadmap elétrico): o segmento a→b
 * (em linha reta, na cota da rede) atravessa um pilar? Devolve os pontos de
 * passagem que o levam por FORA — um canto do retângulo envolvente de um pilar
 * atravessado, afastado `AFASTAMENTO_DO_CONTORNO_MM`; sem um canto que resolva,
 * dois cantos do mesmo pilar. O mais curto; empate pela ordem dos cantos.
 * `[]` = não atravessa (reta serve); `null` = não há contorno por cantos
 * (pilares encostados) — quem chama avisa e segue reto.
 */
export function desvioDoPilar(a: P2, b: P2, pegadas: readonly Point[][]): P2[] | null {
  if (fracaoDentro(a, b, pegadas) === 0) return [];
  const livre = (p: P2, q: P2) => fracaoDentro(p, q, pegadas) === 0 && !dentroDeAlguma(pegadas, p) && !dentroDeAlguma(pegadas, q);
  const d = (p: P2, q: P2) => Math.hypot(q.x - p.x, q.y - p.y);
  const atravessados = pegadas.filter((g) => fracaoDentro(a, b, [g]) > 0);
  const cantosDe = (g: readonly Point[]): P2[] => {
    const xs = g.map((p) => p.x);
    const ys = g.map((p) => p.y);
    const f = AFASTAMENTO_DO_CONTORNO_MM;
    const [x0, x1, y0, y1] = [Math.min(...xs) - f, Math.max(...xs) + f, Math.min(...ys) - f, Math.max(...ys) + f].map(Math.round);
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  };
  const cantos = atravessados.flatMap(cantosDe);
  let melhor: { pts: P2[]; mm: number } | null = null;
  for (const w of cantos) {
    if (!livre(a, w) || !livre(w, b)) continue;
    const mm = d(a, w) + d(w, b);
    if (!melhor || mm < melhor.mm - 1e-9) melhor = { pts: [w], mm };
  }
  if (melhor) return melhor.pts;
  for (const g of atravessados) {
    const cs = cantosDe(g);
    for (const w1 of cs) {
      for (const w2 of cs) {
        if (w1 === w2 || !livre(a, w1) || !livre(w1, w2) || !livre(w2, b)) continue;
        const mm = d(a, w1) + d(w1, w2) + d(w2, b);
        if (!melhor || mm < melhor.mm - 1e-9) melhor = { pts: [w1, w2], mm };
      }
    }
  }
  return melhor ? melhor.pts : null;
}

/**
 * O fundo da viga de teto mais baixa do pavimento (cota relativa ao piso), ou
 * `null` sem viga de teto. Viga de teto: o topo dela chega a menos de 20 cm do
 * teto — a verga baixa no meio da parede não conta.
 */
export function fundoDaVigaMaisBaixaMm(model: BlueprintModel, levelId: ObjectId, tetoMm: number): number | null {
  const vigas = (model.structures ?? []).filter((s) => s.kind === 'VIGA' && s.levelId === levelId && s.baseMm + s.alturaMm >= tetoMm - VIGA_DE_TETO_MM && s.baseMm < tetoMm);
  return vigas.length === 0 ? null : Math.min(...vigas.map((v) => v.baseMm));
}

/**
 * F8b da casa automática — O ANEL DO PILAR (15/10/2026).
 *
 * Na casa com pilar em TODO encontro de paredes, a penalidade de 10 m não desvia nada: não há "outro
 * caminho" que não passe por um encontro. O anel resolve no GRAFO: a pegada do pilar crescida de
 * `afastamentoMm` (o tubo corre a essa distância da face) tira do grafo tudo o que está dentro dela, e
 * o perímetro do anel liga as paredes que chegavam ali. A curva do ramal no canto vira duas curvas em
 * volta do pilar — por fora dele, colada à face.
 *
 * O afastamento é menor que `FOLGA_DO_PILAR_MM`: o ponto que `foraDoPilar` escorregou fica FORA do anel.
 */
export const CONTORNO_DO_PILAR_MM = 40;
/**
 * O que custa, em mm de tubo, cada lado do anel: contornar o pilar tira o tubo da parede, então a rota dá a
 * volta POR DENTRO das paredes quando isso custa menos — e só contorna quando não há (a casa com pilar em
 * todo encontro). Metade da penalidade de atravessar.
 */
export const PENALIDADE_DO_ANEL_MM = PENALIDADE_DO_PILAR_MM / 2;

/** A pegada (convexa) crescida de `f` mm, com os cantos ao mm. A não convexa sai como veio. */
export function anelDoPilar(pegada: readonly Point[], f: number): P2[] {
  const n = pegada.length;
  if (n < 3) return pegada.map((p) => ({ x: p.x, y: p.y }));
  const cx = pegada.reduce((s, p) => s + p.x, 0) / n;
  const cy = pegada.reduce((s, p) => s + p.y, 0) / n;
  // A normal de FORA de cada lado i → i+1.
  const normais = pegada.map((a, i) => {
    const b = pegada[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = (b.y - a.y) / L;
    let ny = -(b.x - a.x) / L;
    if (nx * ((a.x + b.x) / 2 - cx) + ny * ((a.y + b.y) / 2 - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { x: nx, y: ny };
  });
  return pegada.map((v, i) => {
    const n1 = normais[(i - 1 + n) % n];
    const n2 = normais[i];
    const k = 1 + n1.x * n2.x + n1.y * n2.y;
    const s = k < 1e-6 ? f : f / k;
    return { x: Math.round(v.x + (n1.x + n2.x) * s), y: Math.round(v.y + (n1.y + n2.y) * s) };
  });
}

/**
 * O intervalo de `t` (0–1) em que o segmento a→b corre DENTRO do anel convexo (Cyrus–Beck), ou `null`.
 * Encostar num canto ou correr sobre um lado não conta.
 */
export function dentroDoAnel(a: P2, b: P2, anel: readonly P2[]): [number, number] | null {
  const n = anel.length;
  if (n < 3) return null;
  const cx = anel.reduce((s, p) => s + p.x, 0) / n;
  const cy = anel.reduce((s, p) => s + p.y, 0) / n;
  const d = { x: b.x - a.x, y: b.y - a.y };
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < n; i++) {
    const p = anel[i];
    const q = anel[(i + 1) % n];
    let nx = q.y - p.y;
    let ny = -(q.x - p.x);
    if (nx * ((p.x + q.x) / 2 - cx) + ny * ((p.y + q.y) / 2 - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const L = Math.hypot(nx, ny) || 1;
    nx /= L;
    ny /= L;
    const num = (p.x - a.x) * nx + (p.y - a.y) * ny; // > 0: `a` do lado de dentro deste lado
    const den = d.x * nx + d.y * ny;
    if (Math.abs(den) < 1e-12) {
      if (num <= 0.5) return null;
      continue;
    }
    const t = num / den;
    if (den < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  const comprimento = Math.hypot(d.x, d.y);
  return (t1 - t0) * comprimento > 1 ? [t0, t1] : null;
}

/** O ponto estritamente dentro do anel convexo (meio mm de tolerância)? */
export function noAnel(p: P2, anel: readonly P2[]): boolean {
  const n = anel.length;
  if (n < 3) return false;
  const cx = anel.reduce((s, q) => s + q.x, 0) / n;
  const cy = anel.reduce((s, q) => s + q.y, 0) / n;
  for (let i = 0; i < n; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % n];
    let nx = b.y - a.y;
    let ny = -(b.x - a.x);
    if (nx * ((a.x + b.x) / 2 - cx) + ny * ((a.y + b.y) / 2 - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const L = Math.hypot(nx, ny) || 1;
    if (((p.x - a.x) * nx + (p.y - a.y) * ny) / L > -0.5) return false;
  }
  return true;
}

/**
 * O grafo (arestas em planta; o terceiro campo diz se é lado de anel) refeito em volta dos anéis: o pedaço de aresta dentro de um anel some, e
 * o anel ganha nós nos pontos de entrada e nos cantos (os que não caem dentro de OUTRO anel) — os nós
 * do perímetro, em ordem de ângulo, ligam-se dois a dois. Determinístico (ordem das arestas e dos anéis).
 */
export function grafoEmVoltaDosAneis(arestas: readonly [P2, P2][], aneis: readonly P2[][]): [P2, P2, boolean][] {
  if (aneis.length === 0) return arestas.map(([a, b]) => [a, b, false]);
  const saida: [P2, P2, boolean][] = [];
  const nosDoAnel = aneis.map((anel) => anel.filter((c) => !aneis.some((o) => o !== anel && noAnel(c, o))));
  const em = (a: P2, b: P2, t: number): P2 => ({ x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t) });
  for (const [a, b] of arestas) {
    const cortes: { t0: number; t1: number; i: number }[] = [];
    aneis.forEach((anel, i) => {
      const r = dentroDoAnel(a, b, anel);
      if (r) cortes.push({ t0: r[0], t1: r[1], i });
    });
    if (cortes.length === 0) {
      saida.push([a, b, false]);
      continue;
    }
    cortes.sort((x, y) => x.t0 - y.t0 || x.i - y.i);
    // Junta os cortes que se sobrepõem (anéis encostados): a entrada é do primeiro, a saída do último.
    const juntos: { t0: number; i0: number; t1: number; i1: number }[] = [];
    for (const c of cortes) {
      const u = juntos[juntos.length - 1];
      if (u && c.t0 <= u.t1 + 1e-9) {
        if (c.t1 > u.t1) {
          u.t1 = c.t1;
          u.i1 = c.i;
        }
      } else juntos.push({ t0: c.t0, i0: c.i, t1: c.t1, i1: c.i });
    }
    let desde = 0;
    for (const j of juntos) {
      const entrada = em(a, b, j.t0);
      const saidaP = em(a, b, j.t1);
      if (j.t0 > 1e-9) {
        saida.push([em(a, b, desde), entrada, false]);
        nosDoAnel[j.i0].push(entrada);
      }
      if (j.t1 < 1 - 1e-9) nosDoAnel[j.i1].push(saidaP);
      desde = j.t1;
    }
    if (desde < 1 - 1e-9) saida.push([em(a, b, desde), b, false]);
  }
  // O perímetro de cada anel.
  aneis.forEach((anel, i) => {
    const cx = anel.reduce((s, p) => s + p.x, 0) / anel.length;
    const cy = anel.reduce((s, p) => s + p.y, 0) / anel.length;
    const vistos = new Map<string, P2>();
    for (const p of nosDoAnel[i]) vistos.set(`${p.x},${p.y}`, p);
    const nos = [...vistos.values()].sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx) || p.x - q.x || p.y - q.y);
    if (nos.length < 2) return;
    for (let k = 0; k < nos.length; k++) {
      const p = nos[k];
      const q = nos[(k + 1) % nos.length];
      if (nos.length === 2 && k === 1) break;
      saida.push([p, q, true]);
    }
  });
  return saida.filter(([a, b]) => a.x !== b.x || a.y !== b.y);
}

/** F8b: o eixo do barrilete SOBRE a laje fica a isto do topo dela (o tubo deitado na laje, com o apoio). */
export const SOBRE_A_LAJE_MM = 150;

/**
 * F8b: o topo da laje que cobre o pavimento (cota relativa ao piso dele), ou `null` sem laje de teto.
 * Laje de teto: a base dela a menos de 20 cm do teto, para baixo ou para cima.
 */
export function topoDaLajeDoTetoMm(model: BlueprintModel, levelId: ObjectId, tetoMm: number): number | null {
  const lajes = (model.structures ?? []).filter((s) => s.kind === 'LAJE' && s.levelId === levelId && Math.abs(s.baseMm - tetoMm) <= VIGA_DE_TETO_MM);
  return lajes.length === 0 ? null : Math.max(...lajes.map((l) => l.baseMm + l.alturaMm));
}

/** F8b: o vão mínimo entre o ramal e o fundo da viga para o barrilete correr entre os dois. */
export const VAO_MINIMO_ABAIXO_DA_VIGA_MM = 50;

/** F8b: o eixo da coluna que desce rente à viga fica a isto da face dela (o raio do tubo e a folga). */
export const FOLGA_DA_VIGA_MM = 30;

/**
 * F8b — A PRUMADA FORA DA VIGA: a coluna posta no eixo da parede desce DENTRO da viga que corre sobre ela.
 * Aqui ela desce rente à face da viga, do lado de `lado` (o cômodo que atende): o eixo do tubo a `folga`
 * além da face. Se desse lado cai noutra viga ou num pilar, tenta o outro; sem saída, fica onde está (e a
 * verificação acusa o furo). `vigas`: as que a prumada cruza em altura — quem chama filtra.
 */
export function foraDaViga(p: P2, vigas: readonly Structural[], lado: P2, pilares: readonly Point[][], folga: number = FOLGA_DA_VIGA_MM): P2 {
  const dentro = (q: P2) => vigas.find((v) => pointInPolygon(pegadaEmPlanta(v), q as Point));
  const v = dentro(p);
  if (!v || v.pontos.length < 2) return p;
  const [a, b] = v.pontos;
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
  const d = (p.x - a.x) * n.x + (p.y - a.y) * n.y;
  const ladoDoAlvo = (lado.x - a.x) * n.x + (lado.y - a.y) * n.y >= 0 ? 1 : -1;
  for (const s of [ladoDoAlvo, -ladoDoAlvo]) {
    const alvo = s * (v.larguraMm / 2 + folga);
    const q = { x: Math.round(p.x + n.x * (alvo - d)), y: Math.round(p.y + n.y * (alvo - d)) };
    if (!dentro(q) && !dentroDeAlguma(pilares, q)) return q;
  }
  return p;
}
