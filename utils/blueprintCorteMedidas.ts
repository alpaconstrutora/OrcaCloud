/**
 * AS MEDIDAS DO CORTE DO TERRENO (13/10/2026) — plano docs/planos/2026-10-13-corte-medidas.md.
 *
 * O corte de um estudo de implantação mostra o terreno natural, o platô e os
 * taludes, mas não dizia NENHUM número: quanto corta, quanto aterra, qual a
 * cota do platô, quanto mede cada trecho. Esta função lê a projeção
 * (`projetarCorte`) e devolve o que cotar; o canvas só pinta — e a prancha
 * pode reusar a mesma conta.
 *
 * Tudo em mm do corte (`u` ao longo do plano, `v` acima do zero do desenho),
 * menos `cotaM` (absoluta, metro). Sem `cotaZeroM` (corte sem terreno) não há
 * cota de nível — só as distâncias.
 */
import type { PontoDoPlatoNoCorte, ProjecaoCorte } from './blueprintCorte';

export interface MarcaDeNivel {
  u: number;
  v: number;
  cotaM: number;
  tipo: 'TERRENO' | 'PLATO' | 'PISO';
  rotulo: string;
}

/** Uma cota vertical no `u`, de `vDe` a `vAte` (mm). */
export interface CotaVerticalDoCorte {
  u: number;
  vDe: number;
  vAte: number;
  tipo: 'CORTE' | 'ATERRO' | 'TALUDE' | 'MURO';
  rotulo: string;
}

/** Uma cota horizontal de `uDe` a `uAte`; `linha` 0 = trechos do projeto, 1 = o perfil inteiro. */
export interface CotaHorizontalDoCorte {
  uDe: number;
  uAte: number;
  linha: 0 | 1;
  tipo: 'PLATO' | 'TALUDE' | 'PERFIL';
  rotulo: string;
}

export interface MedidasDoCorte {
  niveis: MarcaDeNivel[];
  verticais: CotaVerticalDoCorte[];
  horizontais: CotaHorizontalDoCorte[];
  /** O `v` mais baixo desenhado (terreno ou projeto) — a cadeia horizontal vai abaixo dele. */
  vMinimo: number | null;
}

/** Diferença menor que isto não vira cota de corte/aterro/talude: é ruído da grade, não projeto. */
export const DESNIVEL_MINIMO_MM = 50;

/** `887,94` — a cota absoluta, sempre com duas casas e vírgula. */
export const formatarCota = (m: number) => (Math.round(m * 100) / 100 + 0).toFixed(2).replace('.', ',');
/** `2,35 m` */
export const formatarMetros = (mm: number) => `${formatarCota(mm / 1000)} m`;

type Pt = { u: number; v: number };

/** O terreno no `u`, interpolado no pedaço do perfil que o contém (`null` fora dele). */
function terrenoEm(perfil: readonly Pt[][], u: number): number | null {
  for (const p of perfil) {
    if (p.length < 2 || u < p[0].u || u > p[p.length - 1].u) continue;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1];
      const b = p[i];
      if (u >= a.u && u <= b.u) return b.u === a.u ? a.v : a.v + ((u - a.u) / (b.u - a.u)) * (b.v - a.v);
    }
  }
  return null;
}

/** Os trechos consecutivos do mesmo tipo dentro de um pedaço: `[início, fim]` (índices). */
function trechos(pedaco: readonly PontoDoPlatoNoCorte[], tipo: PontoDoPlatoNoCorte['trecho']): [number, number][] {
  const r: [number, number][] = [];
  let ini = -1;
  for (let i = 0; i <= pedaco.length; i++) {
    const dele = i < pedaco.length && pedaco[i].trecho === tipo;
    if (dele && ini < 0) ini = i;
    if (!dele && ini >= 0) {
      r.push([ini, i - 1]);
      ini = -1;
    }
  }
  return r;
}

/**
 * O PÉ do talude onde a rampa encontra o terreno. A linha do projeto é amostrada
 * no passo e para no último ponto ainda acima (corte) ou abaixo (aterro) do chão
 * — medir por ele encurtaria o talude em até um passo. A rampa continua com a
 * inclinação dos dois últimos pontos, e a bissecção acha o cruzamento com o
 * perfil no passo seguinte (`sentido` = para onde o talude se afasta do platô).
 */
function peNoTerreno(pedaco: readonly Pt[], k: number, sentido: 1 | -1, passo: number, perfil: readonly Pt[][]): Pt {
  const ultimo = pedaco[k];
  const anterior = pedaco[k - sentido];
  if (!anterior || anterior.u === ultimo.u || passo <= 0) return ultimo;
  const inclinacao = (ultimo.v - anterior.v) / (ultimo.u - anterior.u);
  const diferenca = (u: number) => {
    const t = terrenoEm(perfil, u);
    return t === null ? null : ultimo.v + inclinacao * (u - ultimo.u) - t;
  };
  // Até DOIS passos: os `v` vêm arredondados ao mm, e o cruzamento que cai exatamente
  // no passo seguinte pode sair 0,3 mm do lado errado com um passo só.
  const d0 = diferenca(ultimo.u);
  const d1 = diferenca(ultimo.u + 2 * sentido * passo);
  if (d0 === null || d1 === null || d0 === 0 || Math.sign(d0) === Math.sign(d1)) return ultimo;
  let a = ultimo.u;
  let b = ultimo.u + 2 * sentido * passo;
  for (let n = 0; n < 30; n++) {
    const m = (a + b) / 2;
    const dm = diferenca(m)!;
    if (Math.sign(dm) === Math.sign(d0)) a = m;
    else b = m;
  }
  const u = (a + b) / 2;
  return { u: Math.round(u), v: Math.round(terrenoEm(perfil, u)!) };
}

export function medidasDoCorte(
  proj: Pick<ProjecaoCorte, 'perfilDoTerreno' | 'platoNoCorte' | 'bordasDoPlato' | 'cotaZeroM' | 'linhaDoSolo'>,
): MedidasDoCorte {
  const perfil = (proj.perfilDoTerreno ?? []).filter((p) => p.length >= 2);
  const plato = (proj.platoNoCorte ?? []).filter((p) => p.length >= 1);
  const bordas = proj.bordasDoPlato ?? [];
  const z = proj.cotaZeroM;
  const niveis: MarcaDeNivel[] = [];
  const verticais: CotaVerticalDoCorte[] = [];
  const horizontais: CotaHorizontalDoCorte[] = [];
  const todos = [...perfil.flat(), ...plato.flat()];
  if (todos.length === 0) return { niveis, verticais, horizontais, vMinimo: null };
  const vMinimo = Math.min(...todos.map((p) => p.v));
  const cotaDe = (v: number) => (z ?? 0) + v / 1000;

  // ── 1 · NÍVEIS ───────────────────────────────────────────────────────────
  if (z !== undefined && perfil.length > 0) {
    const pts = perfil.flat();
    const extensao = Math.max(...pts.map((p) => p.u)) - Math.min(...pts.map((p) => p.u));
    // Duas marcas do terreno mais perto que isto viram uma (a primeira, na ordem de importância).
    const separacao = Math.max(500, extensao * 0.04);
    const alto = pts.reduce((m, p) => (p.v > m.v ? p : m));
    const baixo = pts.reduce((m, p) => (p.v < m.v ? p : m));
    const candidatos = [alto, baixo, ...perfil.flatMap((p) => [p[0], p[p.length - 1]])];
    for (const c of candidatos) {
      if (niveis.some((n) => Math.abs(n.u - c.u) < separacao)) continue;
      niveis.push({ u: c.u, v: c.v, cotaM: cotaDe(c.v), tipo: 'TERRENO', rotulo: formatarCota(cotaDe(c.v)) });
    }
  }
  if (z !== undefined) {
    for (const pedaco of plato) {
      for (const [i, j] of trechos(pedaco, 'PLATO')) {
        const a = pedaco[i];
        const b = pedaco[j];
        // Plano: um rótulo no meio. Inclinado (C1): um em cada ponta — a cota muda ao longo dele.
        const pontas = Math.abs(b.v - a.v) < 10 ? [pedaco[Math.floor((i + j) / 2)]] : [a, b];
        for (const p of pontas) niveis.push({ u: p.u, v: p.v, cotaM: cotaDe(p.v), tipo: 'PLATO', rotulo: formatarCota(cotaDe(p.v)) });
      }
    }
    if (proj.linhaDoSolo && perfil.length > 0) {
      const uEsq = Math.min(...perfil.flat().map((p) => p.u));
      const v = proj.linhaDoSolo.v;
      niveis.push({ u: uEsq, v, cotaM: cotaDe(v), tipo: 'PISO', rotulo: `piso ${formatarCota(cotaDe(v))}` });
    }
  }

  // ── 2 · CORTE, ATERRO, TALUDE, MURO ─────────────────────────────────────
  let maiorCorte: { u: number; vp: number; vt: number } | null = null;
  let maiorAterro: { u: number; vp: number; vt: number } | null = null;
  for (const p of plato.flat()) {
    if (p.trecho !== 'PLATO') continue;
    const vt = terrenoEm(perfil, p.u);
    if (vt === null) continue;
    const d = vt - p.v;
    if (d > 0 && (!maiorCorte || d > maiorCorte.vt - maiorCorte.vp)) maiorCorte = { u: p.u, vp: p.v, vt };
    if (d < 0 && (!maiorAterro || d < maiorAterro.vt - maiorAterro.vp)) maiorAterro = { u: p.u, vp: p.v, vt };
  }
  if (maiorCorte && maiorCorte.vt - maiorCorte.vp >= DESNIVEL_MINIMO_MM)
    verticais.push({ u: maiorCorte.u, vDe: maiorCorte.vp, vAte: Math.round(maiorCorte.vt), tipo: 'CORTE', rotulo: `corte ${formatarMetros(maiorCorte.vt - maiorCorte.vp)}` });
  if (maiorAterro && maiorAterro.vp - maiorAterro.vt >= DESNIVEL_MINIMO_MM)
    verticais.push({ u: maiorAterro.u, vDe: Math.round(maiorAterro.vt), vAte: maiorAterro.vp, tipo: 'ATERRO', rotulo: `aterro ${formatarMetros(maiorAterro.vp - maiorAterro.vt)}` });

  // A borda exata do platô (interseção da linha com o anel) no lugar do ponto amostrado.
  const passoDe = (pedaco: readonly Pt[]) => (pedaco.length >= 2 ? Math.abs(pedaco[1].u - pedaco[0].u) : 0);
  const naBorda = (u: number, passo: number) => {
    let melhor = u;
    let dist = passo + 1;
    for (const b of bordas) {
      const d = Math.abs(b - u);
      if (d <= passo && d < dist) {
        melhor = b;
        dist = d;
      }
    }
    return melhor;
  };

  for (const pedaco of plato) {
    const passo = passoDe(pedaco);
    for (const [i, j] of trechos(pedaco, 'TALUDE')) {
      // A crista é o ponto de platô colado ao talude; o pé, a outra ponta (onde encontrou o terreno).
      const antes = i > 0 && pedaco[i - 1].trecho === 'PLATO' ? pedaco[i - 1] : null;
      const depois = j < pedaco.length - 1 && pedaco[j + 1].trecho === 'PLATO' ? pedaco[j + 1] : null;
      const crista = antes ?? depois ?? pedaco[i];
      const pe = antes || depois ? peNoTerreno(pedaco, antes ? j : i, antes ? 1 : -1, passo, perfil) : pedaco[j];
      const uCrista = antes || depois ? naBorda(crista.u, passo) : crista.u;
      const h = Math.abs(pe.v - crista.v);
      const l = Math.abs(pe.u - uCrista);
      if (h < DESNIVEL_MINIMO_MM || l <= 0) continue;
      verticais.push({ u: pe.u, vDe: Math.min(pe.v, crista.v), vAte: Math.max(pe.v, crista.v), tipo: 'TALUDE', rotulo: `h ${formatarMetros(h)}` });
      horizontais.push({
        uDe: Math.min(uCrista, pe.u),
        uAte: Math.max(uCrista, pe.u),
        linha: 0,
        tipo: 'TALUDE',
        rotulo: `talude ${formatarMetros(l)} · 1:${(l / h).toFixed(1).replace('.', ',')}`,
      });
    }
    // Muro de arrimo: a face é vertical — o ponto MURO e o de platô vizinho têm o mesmo `u`.
    pedaco.forEach((m, k) => {
      if (m.trecho !== 'MURO') return;
      const vizinho = [pedaco[k - 1], pedaco[k + 1]].find((p) => p && p.trecho === 'PLATO' && Math.abs(p.u - m.u) <= passo);
      if (!vizinho) return;
      const h = Math.abs(m.v - vizinho.v);
      if (h >= DESNIVEL_MINIMO_MM) verticais.push({ u: m.u, vDe: Math.min(m.v, vizinho.v), vAte: Math.max(m.v, vizinho.v), tipo: 'MURO', rotulo: `muro ${formatarMetros(h)}` });
    });
    // ── 3 · COMPRIMENTOS do platô (bordas exatas) ──────────────────────────
    for (const [i, j] of trechos(pedaco, 'PLATO')) {
      const uDe = naBorda(pedaco[i].u, passo);
      const uAte = naBorda(pedaco[j].u, passo);
      if (uAte - uDe >= 100) horizontais.push({ uDe, uAte, linha: 0, tipo: 'PLATO', rotulo: `platô ${formatarMetros(uAte - uDe)}` });
    }
  }

  if (perfil.length > 0) {
    const us = perfil.flat().map((p) => p.u);
    const uDe = Math.min(...us);
    const uAte = Math.max(...us);
    if (uAte > uDe) horizontais.push({ uDe, uAte, linha: 1, tipo: 'PERFIL', rotulo: `perfil ${formatarMetros(uAte - uDe)}` });
  }
  horizontais.sort((a, b) => a.linha - b.linha || a.uDe - b.uDe);

  return { niveis, verticais, horizontais, vMinimo };
}

// ── 4 · RÉGUA VERTICAL E ESCALA GRÁFICA (13/10/2026) ─────────────────────────

export interface MarcaDaRegua {
  /** mm acima do zero do desenho. */
  v: number;
  rotulo: string;
  /** Marca principal: traço maior e linha de nível mais forte. */
  principal: boolean;
}

/** Passos "redondos" da régua, em metro — o zoom escolhe o primeiro que cabe. */
const PASSOS_DA_REGUA_M = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 500];

function numeroCurto(m: number, casas: number): string {
  return (Math.round(m * 10 ** casas) / 10 ** casas + 0).toFixed(casas).replace('.', ',');
}

/**
 * As marcas da régua entre `vDe` e `vAte` (mm, a faixa VISÍVEL), espaçadas ao
 * menos `minPx` na tela. Com `cotaZeroM` (corte com terreno), as marcas caem em
 * cotas ABSOLUTAS redondas (885, 885,5…) e dizem a cota; sem ela (elevação),
 * são relativas ao zero do desenho (±0, +3, −1,5).
 */
export function marcasDaRegua(vDe: number, vAte: number, pxPorMm: number, cotaZeroM?: number, minPx = 36): { passoM: number; marcas: MarcaDaRegua[] } {
  const passoM = PASSOS_DA_REGUA_M.find((p) => p * 1000 * pxPorMm >= minPx) ?? PASSOS_DA_REGUA_M[PASSOS_DA_REGUA_M.length - 1];
  const z = cotaZeroM ?? 0;
  const lo = z + Math.min(vDe, vAte) / 1000;
  const hi = z + Math.max(vDe, vAte) / 1000;
  const kDe = Math.ceil(lo / passoM - 1e-9);
  const kAte = Math.floor(hi / passoM + 1e-9);
  const casas = passoM < 0.1 ? 2 : passoM < 1 ? (passoM === 0.25 ? 2 : 1) : passoM === 2.5 ? 1 : 0;
  // A cada 5 marcas (ou 4, nos passos de 2,5): 1 m, 5 m, 10 m… — a leitura de régua.
  const cadaPrincipal = [0.25, 2.5, 25].includes(passoM) ? 4 : 5;
  const marcas: MarcaDaRegua[] = [];
  if (kAte - kDe > 500) return { passoM, marcas };
  for (let k = kDe; k <= kAte; k++) {
    const cota = k * passoM;
    const v = Math.round((cota - z) * 1000);
    const rel = cota - z;
    const rotulo =
      cotaZeroM !== undefined
        ? numeroCurto(cota, casas)
        : Math.abs(rel) < 1e-9
          ? '±0'
          : `${rel > 0 ? '+' : '−'}${numeroCurto(Math.abs(rel), casas)}`;
    marcas.push({ v, rotulo, principal: k % cadaPrincipal === 0 });
  }
  return { passoM, marcas };
}

/** A barra da escala gráfica: o comprimento redondo mais perto de `alvoPx` na tela. */
export function escalaGrafica(pxPorMm: number, alvoPx = 120): { comprimentoM: number; px: number; rotulo: string } {
  const opcoes = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  let melhor = opcoes[0];
  for (const m of opcoes) if (Math.abs(m * 1000 * pxPorMm - alvoPx) < Math.abs(melhor * 1000 * pxPorMm - alvoPx)) melhor = m;
  return { comprimentoM: melhor, px: melhor * 1000 * pxPorMm, rotulo: `${numeroCurto(melhor, melhor < 1 ? 1 : 0)} m` };
}

// ── 5 · MEDIR NA VISTA (13/10/2026) ───────────────────────────────────────────

export interface PontoDaVista {
  u: number;
  v: number;
}

/**
 * Onde o clique de medir POUSA: no vértice mais perto (canto de parede, ponta de
 * platô/talude, marca de nível) dentro de `tolMm`; senão no ponto mais perto de
 * uma das linhas (o terreno, o platô); senão onde o mouse está.
 */
export function encaixarNaVista(
  p: PontoDaVista,
  vertices: readonly PontoDaVista[],
  linhas: readonly (readonly PontoDaVista[])[],
  tolMm: number,
): { ponto: PontoDaVista; tipo: 'VERTICE' | 'LINHA' | 'LIVRE' } {
  let melhor: PontoDaVista | null = null;
  let dist = tolMm;
  for (const q of vertices) {
    const d = Math.hypot(q.u - p.u, q.v - p.v);
    if (d <= dist) {
      melhor = q;
      dist = d;
    }
  }
  if (melhor) return { ponto: { u: melhor.u, v: melhor.v }, tipo: 'VERTICE' };
  dist = tolMm;
  for (const linha of linhas) {
    for (let i = 1; i < linha.length; i++) {
      const a = linha[i - 1];
      const b = linha[i];
      const du = b.u - a.u;
      const dv = b.v - a.v;
      const l2 = du * du + dv * dv;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.u - a.u) * du + (p.v - a.v) * dv) / l2));
      const q = { u: a.u + t * du, v: a.v + t * dv };
      const d = Math.hypot(q.u - p.u, q.v - p.v);
      if (d <= dist) {
        melhor = q;
        dist = d;
      }
    }
  }
  return melhor ? { ponto: { u: Math.round(melhor.u), v: Math.round(melhor.v) }, tipo: 'LINHA' } : { ponto: p, tipo: 'LIVRE' };
}

export interface MedicaoNaVista {
  horizontalMm: number;
  verticalMm: number;
  distanciaMm: number;
  /** Desnível ÷ distância horizontal, em %; `null` na vertical pura. */
  inclinacaoPct: number | null;
  rotuloHorizontal: string;
  rotuloVertical: string;
  rotuloDistancia: string;
  /** As cotas absolutas dos dois pontos (só com `cotaZeroM`). */
  rotuloCotaA?: string;
  rotuloCotaB?: string;
}

/** A medida entre dois pontos da vista: horizontal, vertical, inclinada e a inclinação. */
export function medicaoNaVista(a: PontoDaVista, b: PontoDaVista, cotaZeroM?: number): MedicaoNaVista {
  const horizontalMm = Math.abs(b.u - a.u);
  const verticalMm = Math.abs(b.v - a.v);
  const distanciaMm = Math.hypot(horizontalMm, verticalMm);
  const inclinacaoPct = horizontalMm > 0 ? (verticalMm / horizontalMm) * 100 : null;
  return {
    horizontalMm,
    verticalMm,
    distanciaMm,
    inclinacaoPct,
    rotuloHorizontal: formatarMetros(horizontalMm),
    rotuloVertical: formatarMetros(verticalMm),
    rotuloDistancia:
      inclinacaoPct === null || verticalMm === 0
        ? formatarMetros(distanciaMm)
        : `${formatarMetros(distanciaMm)} · ${numeroCurto(inclinacaoPct, 1)}%`,
    ...(cotaZeroM !== undefined
      ? { rotuloCotaA: formatarCota(cotaZeroM + a.v / 1000), rotuloCotaB: formatarCota(cotaZeroM + b.v / 1000) }
      : {}),
  };
}
