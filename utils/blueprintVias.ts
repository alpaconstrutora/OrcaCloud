/**
 * VIAS E GREIDE (C2, 26/09/2026) — eixo, estaqueamento, greide, seções
 * transversais, volumes por áreas médias e nota de serviço.
 *
 * O que a terraplenagem de um platô não cobre é a RUA: um eixo que sobe e
 * desce, com plataforma de largura fixa e talude dos dois lados. A conta é a
 * clássica do projeto geométrico:
 *
 *   eixo (polilinha)  →  estacas a cada `passo`   →  perfil do terreno no eixo
 *                     →  greide (PIVs + curvas verticais parabólicas)
 *                     →  seção transversal por estaca (terreno × projeto)
 *                     →  volumes por áreas médias entre estacas
 *                     →  nota de serviço (simples: eixo; composta: + bordos e pés)
 *
 * Tudo PURO e DERIVADO: o que se grava é o eixo, o passo, os PIVs e a seção
 * tipo (`blueprint_study_vias`); estacas, seções, volumes e nota nascem na tela
 * a cada abertura, contra a versão de topografia exibida.
 *
 * Convenções:
 *  - distâncias e cotas em METROS; pontos do eixo em mm do desenho (o kernel);
 *  - estaca = `k+f,ff`: `k` estacas inteiras de `passo` m e a fração `f` em m
 *    ("3+12,50" = 3 × 20 + 12,50 = 72,50 m para passo 20);
 *  - offset transversal POSITIVO à DIREITA de quem caminha no sentido do eixo;
 *  - diferença projeto − terreno POSITIVA = aterro, NEGATIVA = corte.
 */
import type { Point } from './blueprintKernel';
import { numeroBr } from './blueprintMemorialLote';

// ─── Estaqueamento ───────────────────────────────────────────────────────────

export interface Estaca {
  /** Posição na lista (0 = início). */
  indice: number;
  /** "3+12,50". */
  nome: string;
  /** Distância acumulada ao longo do eixo, em m. */
  distM: number;
  x: number;
  y: number;
  /** Direção do eixo NA estaca, em graus de desenho (0 = +Y, horário). No vértice, a do trecho que chega. */
  azimuteDeg: number;
  /** Estaca fracionária num vértice do eixo (ou no fim). */
  vertice: boolean;
}

export const PASSO_PADRAO_M = 20;

/** "3+12,50" para 72,5 m a passo 20. */
export function nomeDaEstaca(distM: number, passoM = PASSO_PADRAO_M): string {
  const passo = passoM > 0 ? passoM : PASSO_PADRAO_M;
  // Arredonda ao cm antes de dividir: 60,000000001 m não é "2+20,00".
  const cm = Math.round(distM * 100);
  const passoCm = Math.round(passo * 100);
  const k = Math.floor(cm / passoCm);
  const fracaoCm = cm - k * passoCm;
  return `${k}+${numeroBr(fracaoCm / 100)}`;
}

function azimuteDeDesenho(a: Point, b: Point): number {
  const az = (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI;
  return ((az % 360) + 360) % 360;
}

/**
 * As estacas do eixo: inteiras a cada `passo`, mais uma fracionária em cada
 * vértice e no fim (é onde o alinhamento muda — a seção ali é obrigatória).
 * Uma estaca inteira que cai em cima de um vértice não é duplicada.
 */
export function estaquear(eixo: Point[], passoM = PASSO_PADRAO_M): Estaca[] {
  const passo = passoM > 0 ? passoM : PASSO_PADRAO_M;
  const saida: Estaca[] = [];
  if (eixo.length === 0) return saida;
  const empurrar = (p: Point, distM: number, azimuteDeg: number, vertice: boolean) => {
    const anterior = saida[saida.length - 1];
    if (anterior && Math.abs(anterior.distM - distM) < 0.005) {
      // Coincidiu com a anterior: fica a inteira, mas marcada como vértice.
      anterior.vertice = anterior.vertice || vertice;
      return;
    }
    saida.push({ indice: saida.length, nome: nomeDaEstaca(distM, passo), distM, x: p.x, y: p.y, azimuteDeg, vertice });
  };
  const az0 = eixo.length > 1 ? azimuteDeDesenho(eixo[0], eixo[1]) : 0;
  empurrar(eixo[0], 0, az0, true);
  let acumuladoM = 0;
  let proximaInteiraM = passo;
  for (let i = 0; i + 1 < eixo.length; i++) {
    const a = eixo[i];
    const b = eixo[i + 1];
    const compM = Math.hypot(b.x - a.x, b.y - a.y) / 1000;
    if (compM === 0) continue;
    const az = azimuteDeDesenho(a, b);
    while (proximaInteiraM < acumuladoM + compM - 1e-9) {
      const t = (proximaInteiraM - acumuladoM) / compM;
      empurrar({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, proximaInteiraM, az, false);
      proximaInteiraM += passo;
    }
    acumuladoM += compM;
    empurrar(b, acumuladoM, az, true);
    if (Math.abs(proximaInteiraM - acumuladoM) < 0.005) proximaInteiraM += passo;
  }
  return saida;
}

/** Comprimento do eixo, em m. */
export function comprimentoDoEixoM(eixo: Point[]): number {
  let s = 0;
  for (let i = 0; i + 1 < eixo.length; i++) s += Math.hypot(eixo[i + 1].x - eixo[i].x, eixo[i + 1].y - eixo[i].y);
  return s / 1000;
}

// ─── Greide ──────────────────────────────────────────────────────────────────

/** Um PIV (ponto de interseção vertical) do greide. */
export interface PontoDoGreide {
  distM: number;
  cotaM: number;
  /** Comprimento da curva vertical parabólica centrada neste PIV, em m (0 = quebra seca). */
  curvaM?: number;
}

export interface Greide {
  pontos: PontoDoGreide[];
}

/** Rampa máxima de referência para o aviso — via local urbana. */
export const RAMPA_MAX_PCT = 12;

function pivsOrdenados(greide: Greide): PontoDoGreide[] {
  return [...greide.pontos].sort((a, b) => a.distM - b.distM);
}

/**
 * A cota do greide numa distância: reta entre PIVs, com a parábola simétrica
 * (tangentes iguais) onde o PIV tem `curvaM`. Fora do trecho coberto, `null`
 * — o greide não é extrapolado. Um PIV só = cota constante.
 */
export function cotaDoGreide(greide: Greide, distM: number): number | null {
  const p = pivsOrdenados(greide);
  if (p.length === 0) return null;
  if (p.length === 1) return p[0].cotaM;
  if (distM < p[0].distM - 1e-9 || distM > p[p.length - 1].distM + 1e-9) return null;
  // Curva vertical: o PIV interno i com L > 0 cobre [x_i − L/2, x_i + L/2].
  for (let i = 1; i + 1 < p.length; i++) {
    const L = p[i].curvaM ?? 0;
    if (L <= 0) continue;
    const x0 = p[i].distM - L / 2;
    const x1 = p[i].distM + L / 2;
    if (distM >= x0 && distM <= x1) {
      const g1 = (p[i].cotaM - p[i - 1].cotaM) / (p[i].distM - p[i - 1].distM);
      const g2 = (p[i + 1].cotaM - p[i].cotaM) / (p[i + 1].distM - p[i].distM);
      const yTangente = p[i].cotaM + g1 * (distM - p[i].distM);
      const dx = distM - x0;
      return yTangente + ((g2 - g1) / (2 * L)) * dx * dx;
    }
  }
  for (let i = 0; i + 1 < p.length; i++) {
    if (distM >= p[i].distM - 1e-9 && distM <= p[i + 1].distM + 1e-9) {
      const t = (distM - p[i].distM) / (p[i + 1].distM - p[i].distM);
      return p[i].cotaM + (p[i + 1].cotaM - p[i].cotaM) * t;
    }
  }
  return null;
}

export interface Rampa {
  deM: number;
  ateM: number;
  /** Positiva sobe no sentido do eixo. */
  declividadePct: number;
}

/** As rampas entre PIVs consecutivos. */
export function rampasDoGreide(greide: Greide): Rampa[] {
  const p = pivsOrdenados(greide);
  const saida: Rampa[] = [];
  for (let i = 0; i + 1 < p.length; i++) {
    const d = p[i + 1].distM - p[i].distM;
    if (d <= 0) continue;
    saida.push({ deM: p[i].distM, ateM: p[i + 1].distM, declividadePct: ((p[i + 1].cotaM - p[i].cotaM) / d) * 100 });
  }
  return saida;
}

/** Avisos do greide: rampa acima do máximo, curva que invade a vizinha, PIV repetido. */
export function conferirGreide(greide: Greide, rampaMaxPct = RAMPA_MAX_PCT): string[] {
  const avisos: string[] = [];
  const p = pivsOrdenados(greide);
  for (let i = 0; i + 1 < p.length; i++) {
    if (Math.abs(p[i + 1].distM - p[i].distM) < 1e-9) avisos.push(`Dois PIVs na mesma estaca (${numeroBr(p[i].distM)} m).`);
  }
  for (const r of rampasDoGreide(greide)) {
    if (Math.abs(r.declividadePct) > rampaMaxPct + 1e-9) {
      avisos.push(`Rampa de ${numeroBr(r.declividadePct, 1)} % entre ${numeroBr(r.deM)} m e ${numeroBr(r.ateM)} m — acima de ${numeroBr(rampaMaxPct, 0)} %.`);
    }
  }
  for (let i = 1; i + 1 < p.length; i++) {
    const L = p[i].curvaM ?? 0;
    if (L <= 0) continue;
    const antes = p[i].distM - p[i - 1].distM;
    const depois = p[i + 1].distM - p[i].distM;
    const Lant = i - 1 >= 1 ? (p[i - 1].curvaM ?? 0) / 2 : 0;
    const Ldep = i + 1 < p.length - 1 ? (p[i + 1].curvaM ?? 0) / 2 : 0;
    if (L / 2 + Lant > antes + 1e-9 || L / 2 + Ldep > depois + 1e-9) {
      avisos.push(`Curva vertical de ${numeroBr(L, 0)} m no PIV a ${numeroBr(p[i].distM)} m não cabe entre os PIVs vizinhos.`);
    }
  }
  return avisos;
}

/** Um greide de partida: reta do terreno no início ao terreno no fim. `null` sem cota nas pontas. */
export function greideDoTerreno(estacas: Estaca[], cotaEmM: (p: Point) => number | null): Greide | null {
  if (estacas.length < 2) return null;
  const a = estacas[0];
  const b = estacas[estacas.length - 1];
  const ca = cotaEmM({ x: a.x, y: a.y });
  const cb = cotaEmM({ x: b.x, y: b.y });
  if (ca === null || cb === null) return null;
  return { pontos: [{ distM: a.distM, cotaM: ca }, { distM: b.distM, cotaM: cb }] };
}

// ─── Seção tipo e seções transversais ────────────────────────────────────────

export interface SecaoTipo {
  /** Largura da pista, em m (total). */
  pistaM: number;
  /** Largura de CADA calçada, em m. */
  calcadaM: number;
  /** Talude de corte 1:h. */
  taludeCorteH: number;
  /** Talude de aterro 1:h. */
  taludeAterroH: number;
}

export const SECAO_TIPO_PADRAO: SecaoTipo = { pistaM: 7, calcadaM: 2, taludeCorteH: 1.5, taludeAterroH: 1.5 };

/** Meia largura da plataforma (pista/2 + calçada). */
export function meiaPlataformaM(s: SecaoTipo): number {
  return Math.max(0, s.pistaM) / 2 + Math.max(0, s.calcadaM);
}

export interface PontoDaSecao {
  offsetM: number;
  terrenoM: number | null;
  /** Cota do projeto neste offset; `null` onde o projeto já se confunde com o terreno (além do pé/crista). */
  projetoM: number | null;
}

export interface PontoNotavel {
  offsetM: number;
  cotaM: number;
}

export interface SecaoTransversal {
  estaca: Estaca;
  cotaTerrenoM: number | null;
  cotaProjetoM: number | null;
  /** projeto − terreno no eixo: + aterro, − corte. */
  diferencaM: number | null;
  pontos: PontoDaSecao[];
  areaCorteM2: number;
  areaAterroM2: number;
  bordoEsq: PontoNotavel | null;
  bordoDir: PontoNotavel | null;
  /** Onde o talude encontra o terreno (pé do aterro ou crista do corte); `null` se não encontra no alcance. */
  peEsq: PontoNotavel | null;
  peDir: PontoNotavel | null;
  /** O talude não alcançou o terreno dentro do alcance de um lado. */
  taludeNaoFecha: boolean;
  /** Sem cota de terreno ou de greide no eixo: a seção não se calcula. */
  semDados: boolean;
}

export interface OpcoesDaSecao {
  /** Até onde a seção vai para cada lado do eixo, em m. */
  alcanceM?: number;
  /** Passo da amostragem transversal, em m. */
  passoM?: number;
}

/** Vetor unitário à DIREITA de quem caminha no azimute (de desenho). */
function direitaDo(azimuteDeg: number): { x: number; y: number } {
  const az = (azimuteDeg * Math.PI) / 180;
  // sentido (sen az, cos az); direita = giro horário de 90° → (cos az, −sen az)
  return { x: Math.cos(az), y: -Math.sin(az) };
}

/** O ponto (mm) a `offsetM` da estaca, transversalmente. */
export function pontoNaSecao(estaca: Estaca, offsetM: number): Point {
  const d = direitaDo(estaca.azimuteDeg);
  return { x: estaca.x + d.x * offsetM * 1000, y: estaca.y + d.y * offsetM * 1000 };
}

/**
 * A seção transversal numa estaca: plataforma horizontal na cota do greide
 * (pista + calçadas), talude de cada lado até encontrar o terreno. A área de
 * corte/aterro é a integral trapezoidal de (projeto − terreno) sobre o
 * offset, com o pé do talude inserido EXATAMENTE (senão o trapézio corta o
 * triângulo do talude e o volume sai menor).
 */
export function secaoTransversal(
  estaca: Estaca,
  cotaEmM: (p: Point) => number | null,
  secao: SecaoTipo,
  cotaProjetoM: number | null,
  opcoes: OpcoesDaSecao = {},
): SecaoTransversal {
  const alcance = Math.max(1, opcoes.alcanceM ?? 15);
  const passo = Math.max(0.1, opcoes.passoM ?? 0.5);
  const terrenoEm = (offsetM: number) => cotaEmM(pontoNaSecao(estaca, offsetM));
  const cotaTerrenoM = terrenoEm(0);
  const vazia: SecaoTransversal = {
    estaca,
    cotaTerrenoM,
    cotaProjetoM,
    diferencaM: null,
    pontos: [],
    areaCorteM2: 0,
    areaAterroM2: 0,
    bordoEsq: null,
    bordoDir: null,
    peEsq: null,
    peDir: null,
    taludeNaoFecha: false,
    semDados: true,
  };
  if (cotaTerrenoM === null || cotaProjetoM === null) return vazia;
  const b = meiaPlataformaM(secao);

  // Cada lado: procura o pé do talude com passo fino e interpola.
  const pe = (sinal: 1 | -1): { pe: PontoNotavel | null; fecha: boolean } => {
    const tBordo = terrenoEm(sinal * b);
    if (tBordo === null) return { pe: null, fecha: false };
    const aterro = tBordo < cotaProjetoM;
    const h = aterro ? Math.max(1e-6, secao.taludeAterroH) : Math.max(1e-6, secao.taludeCorteH);
    const projetoEm = (o: number) => cotaProjetoM + (aterro ? -1 : 1) * ((Math.abs(o) - b) / h);
    let oAnt = sinal * b;
    let dAnt = projetoEm(oAnt) - tBordo; // + acima do terreno
    if (Math.abs(dAnt) < 1e-9) return { pe: { offsetM: oAnt, cotaM: tBordo }, fecha: true };
    const fino = Math.min(passo, 0.25);
    for (let s = fino; Math.abs(oAnt) + fino <= alcance + 1e-9; s += fino) {
      const o = sinal * (b + s);
      const t = terrenoEm(o);
      if (t === null) return { pe: null, fecha: false };
      const d = projetoEm(o) - t;
      if ((dAnt > 0 && d <= 0) || (dAnt < 0 && d >= 0)) {
        const f = dAnt / (dAnt - d);
        const oPe = oAnt + (o - oAnt) * f;
        return { pe: { offsetM: oPe, cotaM: projetoEm(oPe) }, fecha: true };
      }
      oAnt = o;
      dAnt = d;
    }
    return { pe: null, fecha: false };
  };
  const dir = pe(1);
  const esq = pe(-1);

  // Offsets amostrados: regulares + bordos + pés, ordenados e sem repetição.
  const offsets = new Set<number>();
  for (let o = -alcance; o <= alcance + 1e-9; o += passo) offsets.add(Math.round(o * 1000) / 1000);
  offsets.add(-b);
  offsets.add(b);
  offsets.add(0);
  if (dir.pe) offsets.add(Math.round(dir.pe.offsetM * 1e6) / 1e6);
  if (esq.pe) offsets.add(Math.round(esq.pe.offsetM * 1e6) / 1e6);
  const lista = [...offsets].sort((p, q) => p - q);

  const projetoNo = (o: number): number | null => {
    if (Math.abs(o) <= b + 1e-9) return cotaProjetoM;
    const lado = o > 0 ? dir : esq;
    if (!lado.pe) return null;
    if (Math.abs(o) > Math.abs(lado.pe.offsetM) + 1e-9) return null;
    const tBordo = terrenoEm(Math.sign(o) * b);
    if (tBordo === null) return null;
    const aterro = tBordo < cotaProjetoM;
    const h = aterro ? Math.max(1e-6, secao.taludeAterroH) : Math.max(1e-6, secao.taludeCorteH);
    return cotaProjetoM + (aterro ? -1 : 1) * ((Math.abs(o) - b) / h);
  };

  const pontos: PontoDaSecao[] = lista.map((o) => ({ offsetM: o, terrenoM: terrenoEm(o), projetoM: projetoNo(o) }));
  let corte = 0;
  let aterro = 0;
  for (let i = 0; i + 1 < pontos.length; i++) {
    const p = pontos[i];
    const q = pontos[i + 1];
    if (p.terrenoM === null || q.terrenoM === null) continue;
    const dp = (p.projetoM ?? p.terrenoM) - p.terrenoM;
    const dq = (q.projetoM ?? q.terrenoM) - q.terrenoM;
    const w = q.offsetM - p.offsetM;
    if (w <= 0) continue;
    if (dp >= 0 && dq >= 0) aterro += ((dp + dq) / 2) * w;
    else if (dp <= 0 && dq <= 0) corte += ((-dp - dq) / 2) * w;
    else {
      // Troca de sinal dentro do trapézio: parte em cada conta.
      const f = dp / (dp - dq);
      const wa = w * f;
      if (dp > 0) {
        aterro += (dp / 2) * wa;
        corte += (-dq / 2) * (w - wa);
      } else {
        corte += (-dp / 2) * wa;
        aterro += (dq / 2) * (w - wa);
      }
    }
  }
  return {
    estaca,
    cotaTerrenoM,
    cotaProjetoM,
    diferencaM: cotaProjetoM - cotaTerrenoM,
    pontos,
    areaCorteM2: corte,
    areaAterroM2: aterro,
    bordoEsq: { offsetM: -b, cotaM: cotaProjetoM },
    bordoDir: { offsetM: b, cotaM: cotaProjetoM },
    peEsq: esq.pe,
    peDir: dir.pe,
    taludeNaoFecha: !dir.fecha || !esq.fecha,
    semDados: false,
  };
}

export function secoesTransversais(
  estacas: Estaca[],
  cotaEmM: (p: Point) => number | null,
  secao: SecaoTipo,
  greide: Greide,
  opcoes: OpcoesDaSecao = {},
): SecaoTransversal[] {
  return estacas.map((e) => secaoTransversal(e, cotaEmM, secao, cotaDoGreide(greide, e.distM), opcoes));
}

// ─── Volumes por áreas médias ────────────────────────────────────────────────

export interface TrechoDeVolume {
  de: Estaca;
  ate: Estaca;
  compM: number;
  corteM3: number;
  aterroM3: number;
  corteAcumM3: number;
  aterroAcumM3: number;
}

export interface VolumesDaVia {
  trechos: TrechoDeVolume[];
  corteM3: number;
  aterroM3: number;
  /** Corte × (1 + empolamento): o que se transporta. */
  corteSoltoM3: number;
  /** Aterro × (1 + contração): o que se compra em banco. */
  aterroEmBancoM3: number;
  /** corte − aterro em banco: + bota-fora, − empréstimo. */
  saldoM3: number;
  /** Trechos pulados por falta de dados numa das seções. */
  trechosSemDados: number;
}

/** Método das áreas médias: V = (A₁ + A₂) / 2 × L, trecho a trecho. */
export function volumesPorAreasMedias(
  secoes: SecaoTransversal[],
  material: { empolamentoPct?: number; contracaoPct?: number } = {},
): VolumesDaVia {
  const trechos: TrechoDeVolume[] = [];
  let corte = 0;
  let aterro = 0;
  let semDados = 0;
  for (let i = 0; i + 1 < secoes.length; i++) {
    const a = secoes[i];
    const b = secoes[i + 1];
    if (a.semDados || b.semDados) {
      semDados++;
      continue;
    }
    const L = b.estaca.distM - a.estaca.distM;
    const c = ((a.areaCorteM2 + b.areaCorteM2) / 2) * L;
    const t = ((a.areaAterroM2 + b.areaAterroM2) / 2) * L;
    corte += c;
    aterro += t;
    trechos.push({ de: a.estaca, ate: b.estaca, compM: L, corteM3: c, aterroM3: t, corteAcumM3: corte, aterroAcumM3: aterro });
  }
  const solto = corte * (1 + (material.empolamentoPct ?? 0) / 100);
  const banco = aterro * (1 + (material.contracaoPct ?? 0) / 100);
  return { trechos, corteM3: corte, aterroM3: aterro, corteSoltoM3: solto, aterroEmBancoM3: banco, saldoM3: corte - banco, trechosSemDados: semDados };
}

// ─── Nota de serviço ─────────────────────────────────────────────────────────

export type ModoDaNota = 'SIMPLES' | 'COMPOSTA';

export interface LinhaDaNota {
  estaca: string;
  distM: number;
  terrenoM: number | null;
  projetoM: number | null;
  /** + aterro, − corte (no eixo). */
  diferencaM: number | null;
  /** Composta: bordos e pés/cristas com offset e cota. */
  bordoEsq?: PontoNotavel | null;
  bordoDir?: PontoNotavel | null;
  peEsq?: PontoNotavel | null;
  peDir?: PontoNotavel | null;
  areaCorteM2?: number;
  areaAterroM2?: number;
}

export function notaDeServico(secoes: SecaoTransversal[], modo: ModoDaNota = 'SIMPLES'): LinhaDaNota[] {
  return secoes.map((s) => {
    const base: LinhaDaNota = {
      estaca: s.estaca.nome,
      distM: s.estaca.distM,
      terrenoM: s.cotaTerrenoM,
      projetoM: s.cotaProjetoM,
      diferencaM: s.diferencaM,
    };
    if (modo === 'SIMPLES') return base;
    return { ...base, bordoEsq: s.bordoEsq, bordoDir: s.bordoDir, peEsq: s.peEsq, peDir: s.peDir, areaCorteM2: s.areaCorteM2, areaAterroM2: s.areaAterroM2 };
  });
}

const n2 = (v: number | null | undefined) => (v === null || v === undefined ? '' : numeroBr(v, 2));
const n3 = (v: number | null | undefined) => (v === null || v === undefined ? '' : numeroBr(v, 3));

/** CSV (`;`) da nota de serviço — o que vai para a planilha e para o campo. */
export function csvDaNotaDeServico(nota: LinhaDaNota[], modo: ModoDaNota = 'SIMPLES'): string {
  const cab =
    modo === 'SIMPLES'
      ? ['estaca', 'distancia_m', 'cota_terreno_m', 'cota_projeto_m', 'aterro_m', 'corte_m']
      : [
          'estaca',
          'distancia_m',
          'cota_terreno_m',
          'cota_projeto_m',
          'aterro_m',
          'corte_m',
          'bordo_esq_offset_m',
          'bordo_esq_cota_m',
          'bordo_dir_offset_m',
          'bordo_dir_cota_m',
          'pe_esq_offset_m',
          'pe_esq_cota_m',
          'pe_dir_offset_m',
          'pe_dir_cota_m',
          'area_corte_m2',
          'area_aterro_m2',
        ];
  const linhas = [cab.join(';')];
  for (const l of nota) {
    const aterro = l.diferencaM !== null && l.diferencaM > 0 ? l.diferencaM : l.diferencaM === null ? null : 0;
    const corte = l.diferencaM !== null && l.diferencaM < 0 ? -l.diferencaM : l.diferencaM === null ? null : 0;
    const base = [l.estaca, n2(l.distM), n3(l.terrenoM), n3(l.projetoM), n3(aterro), n3(corte)];
    if (modo === 'SIMPLES') {
      linhas.push(base.join(';'));
      continue;
    }
    linhas.push(
      [
        ...base,
        n2(l.bordoEsq?.offsetM),
        n3(l.bordoEsq?.cotaM),
        n2(l.bordoDir?.offsetM),
        n3(l.bordoDir?.cotaM),
        n2(l.peEsq?.offsetM),
        n3(l.peEsq?.cotaM),
        n2(l.peDir?.offsetM),
        n3(l.peDir?.cotaM),
        n2(l.areaCorteM2),
        n2(l.areaAterroM2),
      ].join(';'),
    );
  }
  return linhas.join('\n');
}

/** CSV das cotas do greide por estaca. */
export function csvDoGreide(estacas: Estaca[], greide: Greide): string {
  const linhas = ['estaca;distancia_m;cota_greide_m'];
  for (const e of estacas) linhas.push(`${e.nome};${numeroBr(e.distM)};${n3(cotaDoGreide(greide, e.distM))}`);
  return linhas.join('\n');
}

// ─── Locação ─────────────────────────────────────────────────────────────────

export interface PontoDeLocacaoDaVia {
  nome: string;
  /** mm do desenho. */
  x: number;
  y: number;
  cotaM: number;
  descricao: string;
}

/**
 * Os pontos para levar a campo: eixo, bordos e pés de cada estaca, com a cota
 * de PROJETO. Nome `E<estaca>`, `BE`/`BD` (bordo), `PE`/`PD` (pé/crista).
 */
export function pontosDeLocacaoDaVia(secoes: SecaoTransversal[], nomeDaVia = 'Via'): PontoDeLocacaoDaVia[] {
  const saida: PontoDeLocacaoDaVia[] = [];
  for (const s of secoes) {
    if (s.semDados || s.cotaProjetoM === null) continue;
    const e = s.estaca;
    saida.push({ nome: `E${e.nome}`, x: e.x, y: e.y, cotaM: s.cotaProjetoM, descricao: `${nomeDaVia} · eixo · estaca ${e.nome}` });
    const lados: [string, PontoNotavel | null, string][] = [
      ['BE', s.bordoEsq, 'bordo esquerdo'],
      ['BD', s.bordoDir, 'bordo direito'],
      ['PE', s.peEsq, 'pé/crista esquerdo'],
      ['PD', s.peDir, 'pé/crista direito'],
    ];
    for (const [sufixo, p, rotulo] of lados) {
      if (!p) continue;
      const q = pontoNaSecao(e, p.offsetM);
      saida.push({ nome: `${sufixo}${e.nome}`, x: q.x, y: q.y, cotaM: p.cotaM, descricao: `${nomeDaVia} · ${rotulo} · estaca ${e.nome} · offset ${numeroBr(p.offsetM)} m` });
    }
  }
  return saida;
}

/**
 * O CSV de locação no MESMO formato do loteamento (`ponto;norte;este;cota;descricao`,
 * metros) — o PNEZD que o importador de levantamento lê de volta.
 * ⚠️ NORTE é o Y e ESTE é o X.
 */
export function csvDeLocacaoDaVia(pontos: PontoDeLocacaoDaVia[]): string {
  const linhas = ['ponto;norte;este;cota;descricao'];
  for (const p of pontos) linhas.push(`${p.nome};${numeroBr(p.y / 1000, 3)};${numeroBr(p.x / 1000, 3)};${numeroBr(p.cotaM, 3)};${p.descricao}`);
  return linhas.join('\n');
}

// ─── SVG: perfil longitudinal e seção transversal ────────────────────────────

function fmtM(v: number, casas = 2): string {
  return numeroBr(v, casas);
}

/**
 * O perfil longitudinal da via: terreno natural (marrom) × greide (azul), com
 * os PIVs marcados e as estacas no eixo horizontal. Mesma escala de exagero
 * vertical automático do `svgDoPerfil`.
 */
export function svgDoPerfilDaVia(
  secoes: SecaoTransversal[],
  greide: Greide,
  opcoes: { titulo?: string; largura?: number; altura?: number } = {},
): string {
  const W = opcoes.largura ?? 640;
  const H = opcoes.altura ?? 220;
  const mE = 44;
  const mD = 26;
  const mT = opcoes.titulo ? 22 : 10;
  const mB = 28;
  const compM = Math.max(1e-6, secoes.length > 0 ? secoes[secoes.length - 1].estaca.distM : 1);
  const cotas = secoes.flatMap((s) => [s.cotaTerrenoM, s.cotaProjetoM]).filter((c): c is number => c !== null);
  const min = cotas.length > 0 ? Math.min(...cotas) : 0;
  const max = cotas.length > 0 ? Math.max(...cotas) : min + 1;
  const faixa = Math.max(0.5, max - min);
  const folga = faixa * 0.1;
  const y0 = min - folga;
  const y1 = max + folga;
  const sx = (d: number) => mE + (d / compM) * (W - mE - mD);
  const sy = (c: number) => mT + (1 - (c - y0) / (y1 - y0)) * (H - mT - mB);
  const partes: string[] = [];
  partes.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="sans-serif" font-size="10">`);
  partes.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
  if (opcoes.titulo) partes.push(`<text x="${mE}" y="14" font-size="11" fill="#334155">${escapar(opcoes.titulo)}</text>`);
  // eixo vertical: 3 cotas
  for (const c of [y0 + folga, (y0 + y1) / 2, y1 - folga]) {
    partes.push(`<line x1="${mE}" x2="${W - mD}" y1="${sy(c).toFixed(1)}" y2="${sy(c).toFixed(1)}" stroke="#e2e8f0"/>`);
    partes.push(`<text x="${mE - 4}" y="${(sy(c) + 3).toFixed(1)}" text-anchor="end" fill="#64748b">${fmtM(c)}</text>`);
  }
  // estacas no eixo horizontal (só as inteiras, e no máximo ~12 rótulos)
  const inteiras = secoes.filter((s) => s.estaca.nome.endsWith('+0,00'));
  const cada = Math.max(1, Math.ceil(inteiras.length / 12));
  inteiras.forEach((s, i) => {
    const x = sx(s.estaca.distM);
    partes.push(`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${H - mB}" y2="${H - mB + 4}" stroke="#94a3b8"/>`);
    if (i % cada === 0) partes.push(`<text x="${x.toFixed(1)}" y="${H - mB + 15}" text-anchor="middle" fill="#64748b">${s.estaca.nome.replace('+0,00', '')}</text>`);
  });
  // terreno
  const terreno = secoes.filter((s) => s.cotaTerrenoM !== null).map((s) => `${sx(s.estaca.distM).toFixed(1)},${sy(s.cotaTerrenoM!).toFixed(1)}`);
  if (terreno.length >= 2) partes.push(`<polyline points="${terreno.join(' ')}" fill="none" stroke="#92400e" stroke-width="1.5"/>`);
  // greide (amostrado fino para a parábola aparecer curva)
  const pontosG: string[] = [];
  const n = 120;
  for (let i = 0; i <= n; i++) {
    const d = (compM * i) / n;
    const c = cotaDoGreide(greide, d);
    if (c !== null) pontosG.push(`${sx(d).toFixed(1)},${sy(c).toFixed(1)}`);
  }
  if (pontosG.length >= 2) partes.push(`<polyline points="${pontosG.join(' ')}" fill="none" stroke="#1d4ed8" stroke-width="2"/>`);
  for (const p of greide.pontos) {
    if (p.distM < 0 || p.distM > compM) continue;
    partes.push(`<circle cx="${sx(p.distM).toFixed(1)}" cy="${sy(p.cotaM).toFixed(1)}" r="3" fill="#1d4ed8"/>`);
  }
  partes.push(`<text x="${W - mD}" y="${mT + 10}" text-anchor="end" fill="#92400e">terreno</text>`);
  partes.push(`<text x="${W - mD}" y="${mT + 22}" text-anchor="end" fill="#1d4ed8">greide</text>`);
  partes.push('</svg>');
  return partes.join('');
}

/** A seção transversal numa estaca: terreno (marrom), plataforma e taludes (azul), com os offsets. */
export function svgDaSecao(secao: SecaoTransversal, opcoes: { largura?: number; altura?: number } = {}): string {
  const W = opcoes.largura ?? 320;
  const H = opcoes.altura ?? 140;
  const m = { e: 36, d: 10, t: 10, b: 22 };
  const pts = secao.pontos.filter((p) => p.terrenoM !== null);
  const partes: string[] = [];
  partes.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="sans-serif" font-size="9">`);
  partes.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
  if (secao.semDados || pts.length < 2) {
    partes.push(`<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#64748b">sem dados nesta estaca</text></svg>`);
    return partes.join('');
  }
  const oMin = pts[0].offsetM;
  const oMax = pts[pts.length - 1].offsetM;
  const cotas = pts.flatMap((p) => [p.terrenoM!, p.projetoM ?? p.terrenoM!]);
  const min = Math.min(...cotas);
  const max = Math.max(...cotas);
  const faixa = Math.max(0.5, max - min);
  const y0 = min - faixa * 0.15;
  const y1 = max + faixa * 0.15;
  const sx = (o: number) => m.e + ((o - oMin) / (oMax - oMin)) * (W - m.e - m.d);
  const sy = (c: number) => m.t + (1 - (c - y0) / (y1 - y0)) * (H - m.t - m.b);
  // preenchimento corte (vermelho) / aterro (azul) entre as duas linhas
  const proj = pts.map((p) => ({ o: p.offsetM, c: p.projetoM ?? p.terrenoM! }));
  const area = [...proj.map((p) => `${sx(p.o).toFixed(1)},${sy(p.c).toFixed(1)}`), ...[...pts].reverse().map((p) => `${sx(p.offsetM).toFixed(1)},${sy(p.terrenoM!).toFixed(1)}`)];
  const tom = secao.areaAterroM2 >= secao.areaCorteM2 ? 'rgba(59,130,246,0.25)' : 'rgba(239,68,68,0.25)';
  partes.push(`<polygon points="${area.join(' ')}" fill="${tom}" stroke="none"/>`);
  partes.push(`<polyline points="${pts.map((p) => `${sx(p.offsetM).toFixed(1)},${sy(p.terrenoM!).toFixed(1)}`).join(' ')}" fill="none" stroke="#92400e" stroke-width="1.5"/>`);
  partes.push(`<polyline points="${proj.map((p) => `${sx(p.o).toFixed(1)},${sy(p.c).toFixed(1)}`).join(' ')}" fill="none" stroke="#1d4ed8" stroke-width="2"/>`);
  // eixo e bordos
  const marca = (o: number, rotulo: string) =>
    partes.push(`<line x1="${sx(o).toFixed(1)}" x2="${sx(o).toFixed(1)}" y1="${m.t}" y2="${H - m.b}" stroke="#cbd5e1" stroke-dasharray="3 3"/><text x="${sx(o).toFixed(1)}" y="${H - m.b + 12}" text-anchor="middle" fill="#64748b">${rotulo}</text>`);
  marca(0, 'eixo');
  if (secao.bordoEsq) marca(secao.bordoEsq.offsetM, fmtM(secao.bordoEsq.offsetM, 1));
  if (secao.bordoDir) marca(secao.bordoDir.offsetM, fmtM(secao.bordoDir.offsetM, 1));
  for (const c of [min, max]) partes.push(`<text x="${m.e - 3}" y="${(sy(c) + 3).toFixed(1)}" text-anchor="end" fill="#64748b">${fmtM(c)}</text>`);
  partes.push(`<text x="${W - m.d}" y="${m.t + 9}" text-anchor="end" fill="#334155">${escapar(secao.estaca.nome)} · corte ${fmtM(secao.areaCorteM2)} m² · aterro ${fmtM(secao.areaAterroM2)} m²</text>`);
  partes.push('</svg>');
  return partes.join('');
}

function escapar(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
