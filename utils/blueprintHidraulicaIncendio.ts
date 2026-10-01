/**
 * O MOTOR HIDRÁULICO DE INCÊNDIO (30/09/2026, E2.1/E2.2 do roadmap
 * `docs/planos/2026-09-29-incendio-benchmark-altoqi-e-roadmap.md`).
 *
 * Duas peças puras, sem modelo de desenho:
 *
 * 1. As FÓRMULAS de perda de carga que o AltoQi oferece, à escolha:
 *    - Hazen-Williams, a das normas de hidrante e sprinkler:
 *        J = 10,67 · Q^1,852 / (C^1,852 · D^4,87)        (Q m³/s, D m, J m/m)
 *    - a UNIVERSAL (Darcy-Weisbach + Swamee-Jain), a mesma da água fria
 *      (`blueprintHidraulicaPressao.perdaDistribuida`);
 *    - Fair-Whipple-Hsiao, a do anexo antigo da NBR 5626:
 *        aço galvanizado  J = 0,002021 · Q^1,88 / D^4,88
 *        plástico e cobre J = 0,0008695 · Q^1,75 / D^4,75
 *    D é sempre o diâmetro INTERNO do material (`FICHA_DO_MATERIAL`).
 *
 * 2. O SOLVER DE MALHA. O motor da água (`blueprintPressaoDaRede`) anda numa
 *    ÁRVORE e descarta a aresta que fecha um anel (achado 1 do benchmark). A
 *    rede de incêndio é anel e grelha por natureza, então aqui é o método do
 *    GRADIENTE (Todini-Pilati, o do EPANET): Newton sobre as cargas dos nós e
 *    as vazões dos elos ao mesmo tempo. Cada elo diz h(Q) e dh/dQ; a árvore é
 *    só o caso particular sem laço.
 *
 *    Unidades internas: vazão em m³/s, carga em metros de coluna d'água (a
 *    carga TOTAL: cota + pressão). Elo de `de` para `para`: h(Q) = H_de − H_para.
 *    Nó FIXO tem a carga conhecida (a bomba, a atmosfera do esguicho aberto);
 *    os demais são incógnitas, com a vazão consumida em `demanda` (m³/s).
 *
 *    O EMISSOR — sprinkler e esguicho — é um elo até um nó fixo na própria
 *    cota (pressão zero): Q = K·√P vira h = (Q/K')², com K' nas unidades
 *    internas. É assim que o EPANET trata emissores, e é o que dá o PONTO DE
 *    EQUILÍBRIO sem iteração por fora: o hidrante mais perto recebe mais água
 *    porque tem mais pressão, e o solver acha isso sozinho.
 */
import type { MaterialDeTubo } from './blueprintKernel';
import { FICHA_DO_MATERIAL, diametroInternoMm, perdaDistribuida } from './blueprintHidraulicaPressao';

export const FORMULAS_DE_PERDA = ['HAZEN_WILLIAMS', 'UNIVERSAL', 'FAIR_WHIPPLE_HSIAO'] as const;
export type FormulaDePerda = (typeof FORMULAS_DE_PERDA)[number];

export const ROTULO_DA_FORMULA: Record<FormulaDePerda, string> = {
  HAZEN_WILLIAMS: 'Hazen-Williams',
  UNIVERSAL: 'Fórmula universal (Darcy-Weisbach)',
  FAIR_WHIPPLE_HSIAO: 'Fair-Whipple-Hsiao',
};

/** 1 bar em metros de coluna d'água (100 kPa / 9,80665 kPa por mca). */
export const MCA_POR_BAR = 100 / 9.80665;
export const KPA_POR_MCA_INC = 9.80665;

const METAL: readonly MaterialDeTubo[] = ['ACO_GALVANIZADO', 'ACO_CARBONO'];

/**
 * Perda unitária J (m/m) e a derivada dJ/dQ, para a vazão `q` em m³/s (o sinal
 * não importa: a perda é do módulo). `dInternoM` em metros.
 */
export function perdaUnitaria(formula: FormulaDePerda, material: MaterialDeTubo, dn: number, q: number): { j: number; dj: number } {
  const Q = Math.abs(q);
  const D = diametroInternoMm(material, dn) / 1000;
  if (formula === 'HAZEN_WILLIAMS') {
    const C = FICHA_DO_MATERIAL[material].cHazenWilliams;
    const k = 10.67 / (Math.pow(C, 1.852) * Math.pow(D, 4.87));
    return { j: k * Math.pow(Q, 1.852), dj: 1.852 * k * Math.pow(Q, 0.852) };
  }
  if (formula === 'FAIR_WHIPPLE_HSIAO') {
    const [a, n, m] = METAL.includes(material) ? [0.002021, 1.88, 4.88] : [0.0008695, 1.75, 4.75];
    const k = a / Math.pow(D, m);
    return { j: k * Math.pow(Q, n), dj: n * k * Math.pow(Q, n - 1) };
  }
  // UNIVERSAL: Darcy-Weisbach por 1 m; a derivada por diferença finita (f varia com Re).
  const j = (qq: number) => (qq <= 0 ? 0 : perdaDistribuida(qq * 1000, material, dn, 1).perdaMca);
  const dq = Math.max(Q * 1e-4, 1e-9);
  return { j: j(Q), dj: (j(Q + dq) - j(Math.max(Q - dq, 0))) / (Q + dq - Math.max(Q - dq, 0)) };
}

/** Perda de carga (mca) num comprimento `lM`, e a velocidade (m/s). `q` em m³/s. */
export function perdaNoTubo(formula: FormulaDePerda, material: MaterialDeTubo, dn: number, q: number, lM: number): { hfMca: number; velocidadeMs: number; jMpm: number } {
  const { j } = perdaUnitaria(formula, material, dn, q);
  const D = diametroInternoMm(material, dn) / 1000;
  return { hfMca: j * lM, jMpm: j, velocidadeMs: Math.abs(q) / ((Math.PI * D * D) / 4) };
}

/**
 * A constante do EMISSOR nas unidades internas: Q (m³/s) = kInterno · √h (m).
 * `kLminBar` é o K de catálogo, Q (L/min) = K · √P (bar).
 */
export function kInternoDoEmissor(kLminBar: number): number {
  return kLminBar / 60000 / Math.sqrt(MCA_POR_BAR);
}

// ─── O solver de malha ───────────────────────────────────────────────────────

export interface NoHidraulico {
  id: string;
  /** Cota do nó, m. */
  zM: number;
  /** Carga total fixa (m), quando o nó é fonte ou atmosfera. Ausente = incógnita. */
  cargaFixaM?: number;
  /** Vazão consumida no nó, m³/s (≥ 0). */
  demanda?: number;
}

export interface EloHidraulico {
  id: string;
  de: string;
  para: string;
  /** h(Q) = H_de − H_para, e dh/dQ, para Q em m³/s com sinal (positivo = de → para). */
  perda: (q: number) => { h: number; dh: number };
}

export interface SolucaoDaRede {
  convergiu: boolean;
  iteracoes: number;
  /** Carga total por nó (m). */
  carga: Map<string, number>;
  /** Vazão por elo (m³/s), positiva de `de` para `para`. */
  vazao: Map<string, number>;
  /** Por que não resolveu, quando não resolveu. */
  motivo: string | null;
  /** Nós sem caminho até nenhum nó fixo — ficam fora da solução. */
  isolados: string[];
}

/** Elo de tubo: perda simétrica, crescente com |Q|. */
export function eloDeTubo(id: string, de: string, para: string, j: (q: number) => { j: number; dj: number }, lM: number): EloHidraulico {
  return {
    id,
    de,
    para,
    perda: (q) => {
      const r = j(q);
      return { h: Math.sign(q) * r.j * lM, dh: r.dj * lM };
    },
  };
}

/** Elo de emissor (sprinkler, esguicho): h = (Q/k)·|Q/k|, k interno. */
export function eloDeEmissor(id: string, de: string, para: string, kInterno: number): EloHidraulico {
  return { id, de, para, perda: (q) => ({ h: (q / kInterno) * Math.abs(q / kInterno), dh: (2 * Math.abs(q)) / (kInterno * kInterno) }) };
}

/** Eliminação de Gauss com pivô parcial; `null` se singular. */
function resolverLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((l, i) => [...l, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/**
 * Resolve a rede pelo método do GRADIENTE. Converge quando a maior correção de
 * vazão fica abaixo de `tolerancia` (m³/s — 1e-7 ≈ 0,006 L/min).
 */
export function resolverRede(nos: readonly NoHidraulico[], elos: readonly EloHidraulico[], opcoes: { tolerancia?: number; maxIteracoes?: number } = {}): SolucaoDaRede {
  const tol = opcoes.tolerancia ?? 1e-7;
  const maxIt = opcoes.maxIteracoes ?? 100;
  const porId = new Map(nos.map((n) => [n.id, n]));
  for (const e of elos) {
    if (!porId.has(e.de) || !porId.has(e.para)) throw new Error(`elo ${e.id} liga nó inexistente`);
  }

  // Só entra quem alcança algum nó fixo — o resto deixaria a matriz singular.
  const vizinhos = new Map<string, string[]>();
  for (const e of elos) {
    vizinhos.set(e.de, [...(vizinhos.get(e.de) ?? []), e.para]);
    vizinhos.set(e.para, [...(vizinhos.get(e.para) ?? []), e.de]);
  }
  const alcancados = new Set(nos.filter((n) => n.cargaFixaM != null).map((n) => n.id));
  const fila = [...alcancados];
  while (fila.length) {
    const a = fila.pop()!;
    for (const b of vizinhos.get(a) ?? []) if (!alcancados.has(b)) (alcancados.add(b), fila.push(b));
  }
  const isolados = nos.filter((n) => !alcancados.has(n.id)).map((n) => n.id);
  const ativos = elos.filter((e) => alcancados.has(e.de) && alcancados.has(e.para));
  const incognitas = nos.filter((n) => alcancados.has(n.id) && n.cargaFixaM == null);
  const indice = new Map(incognitas.map((n, i) => [n.id, i]));

  const fixas = nos.filter((n) => n.cargaFixaM != null).map((n) => n.cargaFixaM!);
  const cargaInicial = fixas.length ? Math.max(...fixas) : 0;
  const H = new Map<string, number>(nos.filter((n) => alcancados.has(n.id)).map((n) => [n.id, n.cargaFixaM ?? cargaInicial]));
  const Q = new Map<string, number>(ativos.map((e) => [e.id, 1e-3]));

  if (incognitas.length === 0) {
    return { convergiu: true, iteracoes: 0, carga: H, vazao: Q, motivo: null, isolados };
  }

  // Derivada mínima: perto de Q = 0 a dh/dQ das fórmulas tende a zero e a matriz degenera.
  const G_MIN = 1e-6;
  let it = 0;
  for (; it < maxIt; it++) {
    const n = incognitas.length;
    const J = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const rhs = new Array<number>(n).fill(0);
    const G = new Map<string, number>();
    const R1 = new Map<string, number>();
    for (const e of ativos) {
      const { h, dh } = e.perda(Q.get(e.id)!);
      const g = Math.max(dh, G_MIN);
      G.set(e.id, g);
      // Resíduo do elo: h(Q) − (H_de − H_para).
      R1.set(e.id, h - (H.get(e.de)! - H.get(e.para)!));
    }
    // Balanço: o que sai do nó (elos com `de` nele) menos o que entra, mais a demanda = 0.
    const R2 = new Array<number>(n).fill(0);
    for (const nn of incognitas) R2[indice.get(nn.id)!] += nn.demanda ?? 0;
    for (const e of ativos) {
      const q = Q.get(e.id)!;
      const i = indice.get(e.de);
      const j = indice.get(e.para);
      if (i != null) R2[i] += q;
      if (j != null) R2[j] -= q;
    }
    // ΔQ = (A·ΔH − R1)/G, com A·ΔH = ΔH_de − ΔH_para; o balanço linearizado dá J·ΔH = Σ R1/G − R2 (com sinal).
    for (const e of ativos) {
      const g = G.get(e.id)!;
      const i = indice.get(e.de);
      const j = indice.get(e.para);
      const r = R1.get(e.id)! / g;
      if (i != null) {
        J[i][i] += 1 / g;
        rhs[i] += r;
      }
      if (j != null) {
        J[j][j] += 1 / g;
        rhs[j] -= r;
      }
      if (i != null && j != null) {
        J[i][j] -= 1 / g;
        J[j][i] -= 1 / g;
      }
    }
    for (let k = 0; k < n; k++) rhs[k] -= R2[k];
    const dH = resolverLinear(J, rhs);
    if (!dH) return { convergiu: false, iteracoes: it, carga: H, vazao: Q, motivo: 'a matriz da rede é singular (nó sem saída de água?)', isolados };
    for (const nn of incognitas) H.set(nn.id, H.get(nn.id)! + dH[indice.get(nn.id)!]);
    let maior = 0;
    for (const e of ativos) {
      const g = G.get(e.id)!;
      const dHde = indice.has(e.de) ? dH[indice.get(e.de)!] : 0;
      const dHpara = indice.has(e.para) ? dH[indice.get(e.para)!] : 0;
      const dQ = (dHde - dHpara - R1.get(e.id)!) / g;
      Q.set(e.id, Q.get(e.id)! + dQ);
      maior = Math.max(maior, Math.abs(dQ));
    }
    if (maior < tol) {
      it++;
      return { convergiu: true, iteracoes: it, carga: H, vazao: Q, motivo: null, isolados };
    }
  }
  return { convergiu: false, iteracoes: it, carga: H, vazao: Q, motivo: `não convergiu em ${maxIt} iterações`, isolados };
}
