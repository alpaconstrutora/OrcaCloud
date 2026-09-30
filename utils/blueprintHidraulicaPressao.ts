/**
 * A FÍSICA DA ÁGUA NO CANO (28/09/2026, Etapa 1 do roadmap hidrossanitário —
 * `docs/planos/2026-09-28-hidrossanitario-roadmap.md`).
 *
 * E1.1 — materiais e PERDA DISTRIBUÍDA. A NBR 5626:2020 aceita a fórmula
 * UNIVERSAL (Darcy-Weisbach) para qualquer material:
 *
 *     hf = f · (L / D) · V² / (2g)
 *
 * com o fator de atrito `f` de SWAMEE-JAIN (a forma explícita de Colebrook,
 * erro < 1 % para 5·10³ < Re < 10⁸ e 10⁻⁶ < ε/D < 10⁻²):
 *
 *     f = 0,25 / [ log10( ε/(3,7·D) + 5,74/Re^0,9 ) ]²
 *
 * e 64/Re no regime laminar (Re < 2300). É a fórmula que leva em conta a
 * RUGOSIDADE do material — o item "cálculo considerando rugosidade" do AltoQi.
 *
 * Unidades: vazão em L/s, diâmetro em mm, comprimento em m, perda em metros de
 * coluna d'água (mca). 1 mca = 9,80665 kPa.
 */
import type { MaterialDeTubo } from './blueprintKernel';

export const G = 9.80665;
/** kPa por metro de coluna d'água. */
export const KPA_POR_MCA = 9.80665;

/**
 * Viscosidade cinemática da água, m²/s — tabela de propriedades da água à
 * pressão atmosférica (20 °C: 1,004·10⁻⁶; 60 °C: 0,474·10⁻⁶). A quente escorre
 * "mais fácil": ignorar isso superestimaria a perda da rede de água quente.
 */
export const VISCOSIDADE_20C = 1.004e-6;
export const VISCOSIDADE_60C = 0.474e-6;

export interface FichaDoMaterial {
  rotulo: string;
  /** Rugosidade absoluta equivalente ε, mm. */
  rugosidadeMm: number;
  /** DN comercial → diâmetro INTERNO, mm. */
  diametros: { dn: number; internoMm: number }[];
  /**
   * Coeficiente C de Hazen-Williams (incêndio E1.2): é a fórmula das normas de
   * hidrantes e sprinklers. Valores usuais de tubo em serviço — CONFERIR NA
   * NBR 10897/13714 antes de emitir.
   */
  cHazenWilliams: number;
  fonte: string;
}

/**
 * Diâmetros internos da série SCH 40 (NBR 5590 / ASTM A53), DN 15…150 — o tubo
 * de aço da rede de incêndio. O galvanizado da NBR 5580 classe média tem
 * interno um pouco MAIOR; usar o SCH 40 fica a favor da segurança (mais perda).
 */
const SCH40 = [
  { dn: 15, internoMm: 15.8 },
  { dn: 20, internoMm: 20.9 },
  { dn: 25, internoMm: 26.6 },
  { dn: 32, internoMm: 35.1 },
  { dn: 40, internoMm: 40.9 },
  { dn: 50, internoMm: 52.5 },
  { dn: 65, internoMm: 62.7 },
  { dn: 80, internoMm: 77.9 },
  { dn: 100, internoMm: 102.3 },
  { dn: 125, internoMm: 128.2 },
  { dn: 150, internoMm: 154.1 },
];

/**
 * Os MATERIAIS. Diâmetros internos dos catálogos usuais das normas de produto;
 * rugosidade dos valores tabelados para tubo liso (plástico e cobre trefilado
 * — faixa usual 0,0015 a 0,01 mm; usa-se o limite de CIMA, a favor da
 * segurança, nos plásticos).
 */
export const FICHA_DO_MATERIAL: Record<MaterialDeTubo, FichaDoMaterial> = {
  PVC_SOLDAVEL: {
    rotulo: 'PVC soldável',
    rugosidadeMm: 0.01,
    diametros: [
      { dn: 20, internoMm: 17 },
      { dn: 25, internoMm: 21.6 },
      { dn: 32, internoMm: 27.8 },
      { dn: 40, internoMm: 35.2 },
      { dn: 50, internoMm: 44 },
      { dn: 60, internoMm: 53.4 },
      { dn: 75, internoMm: 66.6 },
      { dn: 85, internoMm: 75.6 },
      { dn: 110, internoMm: 97.8 },
    ],
    cHazenWilliams: 150,
    fonte: 'NBR 5648 (tubo PVC soldável para água fria); ε de tubo plástico liso',
  },
  CPVC: {
    rotulo: 'CPVC',
    rugosidadeMm: 0.01,
    diametros: [
      { dn: 15, internoMm: 12.6 },
      { dn: 22, internoMm: 18.4 },
      { dn: 28, internoMm: 23.8 },
      { dn: 35, internoMm: 29.8 },
      { dn: 42, internoMm: 35.6 },
      { dn: 54, internoMm: 46 },
      { dn: 73, internoMm: 62 },
      { dn: 89, internoMm: 76 },
    ],
    cHazenWilliams: 150,
    fonte: 'NBR 15884 (CPVC para água quente); ε de tubo plástico liso',
  },
  PPR: {
    rotulo: 'PPR (PN 20)',
    rugosidadeMm: 0.01,
    diametros: [
      { dn: 20, internoMm: 13.2 },
      { dn: 25, internoMm: 16.6 },
      { dn: 32, internoMm: 21.2 },
      { dn: 40, internoMm: 26.6 },
      { dn: 50, internoMm: 33.4 },
      { dn: 63, internoMm: 42 },
      { dn: 75, internoMm: 50 },
    ],
    cHazenWilliams: 150,
    fonte: 'NBR 15813 / DIN 8077 PN 20 (SDR 6); ε de tubo plástico liso',
  },
  COBRE: {
    rotulo: 'Cobre (classe E)',
    rugosidadeMm: 0.0015,
    diametros: [
      { dn: 15, internoMm: 14 },
      { dn: 22, internoMm: 20.8 },
      { dn: 28, internoMm: 26.8 },
      { dn: 35, internoMm: 33.6 },
      { dn: 42, internoMm: 40.4 },
      { dn: 54, internoMm: 52.2 },
      { dn: 66, internoMm: 64.7 },
    ],
    cHazenWilliams: 150,
    fonte: 'NBR 13206 classe E; ε de cobre trefilado',
  },
  // ─── Incêndio E1.2 (30/09/2026) ─────────────────────────────────────────
  ACO_GALVANIZADO: {
    rotulo: 'Aço galvanizado',
    // ε de aço galvanizado (tabela de Moody): 0,15 mm.
    rugosidadeMm: 0.15,
    diametros: SCH40,
    cHazenWilliams: 120,
    fonte: 'NBR 5580/5590 (interno SCH 40, a favor da segurança); ε de aço galvanizado; C 120 — CONFERIR NA NORMA',
  },
  ACO_CARBONO: {
    rotulo: 'Aço carbono SCH 40',
    // ε de aço comercial (tabela de Moody): 0,046 mm; em serviço molhado usa-se C 120.
    rugosidadeMm: 0.046,
    diametros: SCH40,
    cHazenWilliams: 120,
    fonte: 'NBR 5590 SCH 40; ε de aço comercial; C 120 — CONFERIR NA NORMA',
  },
  CPVC_INCENDIO: {
    rotulo: 'CPVC para sprinkler (SDR 13,5)',
    rugosidadeMm: 0.0015,
    diametros: [
      { dn: 20, internoMm: 22.7 },
      { dn: 25, internoMm: 28.4 },
      { dn: 32, internoMm: 36.0 },
      { dn: 40, internoMm: 41.1 },
      { dn: 50, internoMm: 51.4 },
      { dn: 65, internoMm: 62.2 },
      { dn: 80, internoMm: 75.7 },
    ],
    cHazenWilliams: 150,
    fonte: 'ASTM F442 SDR 13,5 (CPVC de sprinkler, só em risco leve); ε de plástico liso — CONFERIR NA NORMA',
  },
};

/**
 * O diâmetro INTERNO de um DN no material. DN fora da tabela (desenhado à mão
 * com bitola livre) usa o DN nominal com a mesma razão interno/nominal do DN
 * tabelado mais próximo — nunca o nominal cru, que subestimaria a perda.
 */
export function diametroInternoMm(material: MaterialDeTubo, dn: number): number {
  const linhas = FICHA_DO_MATERIAL[material].diametros;
  const exato = linhas.find((l) => l.dn === dn);
  if (exato) return exato.internoMm;
  const perto = [...linhas].sort((a, b) => Math.abs(a.dn - dn) - Math.abs(b.dn - dn))[0];
  return (dn * perto.internoMm) / perto.dn;
}

export interface PerdaDistribuida {
  velocidadeMs: number;
  reynolds: number;
  fatorDeAtrito: number;
  /** Perda unitária J, m/m. */
  perdaUnitariaMpm: number;
  /** Perda no comprimento, mca. */
  perdaMca: number;
}

/** Fator de atrito: 64/Re no laminar, Swamee-Jain acima. */
export function fatorDeAtrito(reynolds: number, rugosidadeMm: number, internoMm: number): number {
  if (reynolds <= 0) return 0;
  if (reynolds < 2300) return 64 / reynolds;
  const termo = rugosidadeMm / (3.7 * internoMm) + 5.74 / reynolds ** 0.9;
  return 0.25 / Math.log10(termo) ** 2;
}

/** A PERDA DISTRIBUÍDA de `comprimentoM` de tubo — Darcy-Weisbach com Swamee-Jain. */
export function perdaDistribuida(
  vazaoLs: number,
  material: MaterialDeTubo,
  dn: number,
  comprimentoM: number,
  viscosidade = VISCOSIDADE_20C,
): PerdaDistribuida {
  const d = diametroInternoMm(material, dn) / 1000;
  const q = Math.max(0, vazaoLs) / 1000;
  const v = q / (Math.PI * (d / 2) ** 2);
  const re = (v * d) / viscosidade;
  const f = fatorDeAtrito(re, FICHA_DO_MATERIAL[material].rugosidadeMm, d * 1000);
  const j = v === 0 ? 0 : (f * v * v) / (d * 2 * G);
  return { velocidadeMs: v, reynolds: re, fatorDeAtrito: f, perdaUnitariaMpm: j, perdaMca: j * comprimentoM };
}

// ─── E1.2 — PERDAS LOCALIZADAS ───────────────────────────────────────────────

/** As peças que perdem carga no caminho da água. */
export type PecaDePerda =
  | 'JOELHO_90'
  | 'JOELHO_45'
  | 'TE_PASSAGEM'
  | 'TE_LATERAL'
  | 'LUVA'
  | 'REDUCAO'
  | 'REGISTRO_GAVETA'
  | 'REGISTRO_PRESSAO'
  | 'REGISTRO_ESFERA'
  | 'VALVULA_RETENCAO'
  | 'ENTRADA'
  | 'SAIDA';

/** Os DN da tabela de comprimentos equivalentes, mm. */
const DN_DA_TABELA = [20, 25, 32, 40, 50, 60, 75];

/**
 * COMPRIMENTO EQUIVALENTE, em metros de tubo do mesmo DN — tabela usual de
 * PVC rígido (anexo da NBR 5626:1998 e catálogos técnicos de fabricante), por
 * DN 20…75. Aplicada a todos os materiais: a tabela de metal é um pouco maior,
 * e a aproximação fica declarada aqui e no memorial. O TÊ distingue passagem
 * direta de saída lateral (a geometria do nó diz qual); a REDUÇÃO usa o joelho
 * de 45° (ordem de grandeza da transição gradual); a LUVA não perde (emenda
 * alinhada). ENTRADA é a saída do reservatório para o tubo; SAÍDA, a do tubo.
 */
export const COMPRIMENTO_EQUIVALENTE_M: Record<PecaDePerda, number[]> = {
  JOELHO_90: [1.1, 1.2, 1.5, 2.0, 3.2, 3.4, 3.7],
  JOELHO_45: [0.4, 0.5, 0.7, 1.0, 1.3, 1.5, 1.7],
  TE_PASSAGEM: [0.7, 0.8, 0.9, 1.5, 2.2, 2.3, 2.4],
  TE_LATERAL: [2.3, 2.4, 3.1, 4.6, 7.3, 7.6, 7.8],
  LUVA: [0, 0, 0, 0, 0, 0, 0],
  REDUCAO: [0.4, 0.5, 0.7, 1.0, 1.3, 1.5, 1.7],
  REGISTRO_GAVETA: [0.1, 0.2, 0.3, 0.4, 0.7, 0.8, 0.9],
  REGISTRO_PRESSAO: [11.1, 11.4, 15.0, 22.0, 35.8, 37.9, 38.0],
  REGISTRO_ESFERA: [0.1, 0.2, 0.3, 0.4, 0.7, 0.8, 0.9],
  VALVULA_RETENCAO: [2.5, 2.7, 3.8, 4.9, 6.8, 7.1, 8.2],
  ENTRADA: [0.3, 0.4, 0.5, 0.6, 1.0, 1.5, 1.6],
  SAIDA: [0.8, 0.9, 1.3, 1.4, 3.2, 3.3, 3.5],
};

/** Os DN da tabela de comprimentos equivalentes do AÇO (incêndio E1.2), mm. */
const DN_DA_TABELA_ACO = [20, 25, 32, 40, 50, 65, 80, 100, 125, 150];

const PES = 0.3048;
/**
 * COMPRIMENTO EQUIVALENTE do AÇO (incêndio E1.2, achado 2 do benchmark): a
 * tabela de PVC para no DN 75, e a rede de incêndio vai a DN 150. Valores da
 * tabela de comprimentos equivalentes para aço SCH 40 com C = 120 (NFPA 13),
 * convertidos de pés — CONFERIR com a NBR 10897/13714 antes de emitir. Na
 * passagem direta do tê a NFPA não soma perda; registro de pressão não existe
 * na rede de incêndio (usa-se o de gaveta).
 */
export const COMPRIMENTO_EQUIVALENTE_ACO_M: Record<PecaDePerda, number[]> = {
  JOELHO_90: [2, 2, 3, 4, 5, 6, 7, 10, 12, 14].map((p) => p * PES),
  JOELHO_45: [1, 1, 1, 2, 2, 3, 3, 4, 5, 7].map((p) => p * PES),
  TE_PASSAGEM: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  TE_LATERAL: [4, 5, 6, 8, 10, 12, 15, 20, 25, 30].map((p) => p * PES),
  LUVA: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  REDUCAO: [1, 1, 1, 2, 2, 3, 3, 4, 5, 7].map((p) => p * PES),
  REGISTRO_GAVETA: [1, 1, 1, 1, 1, 1, 1, 2, 2, 3].map((p) => p * PES),
  REGISTRO_PRESSAO: [1, 1, 1, 1, 1, 1, 1, 2, 2, 3].map((p) => p * PES),
  REGISTRO_ESFERA: [1, 1, 1, 1, 1, 1, 1, 2, 2, 3].map((p) => p * PES),
  VALVULA_RETENCAO: [4, 5, 7, 9, 11, 14, 16, 22, 27, 32].map((p) => p * PES),
  ENTRADA: [1, 1, 2, 2, 3, 3, 4, 5, 6, 7].map((p) => p * PES),
  SAIDA: [2, 2, 3, 4, 5, 6, 7, 10, 12, 14].map((p) => p * PES),
};

const METAL: readonly MaterialDeTubo[] = ['ACO_GALVANIZADO', 'ACO_CARBONO'];

/** Interpola `v` (indexado por `dns`) no DN; fora das pontas, proporcional ao DN. */
function interpolarPorDn(v: number[], dns: number[], dn: number): number {
  if (dn <= dns[0]) return (v[0] * dn) / dns[0];
  for (let i = 1; i < dns.length; i++) {
    if (dn <= dns[i]) {
      const t = (dn - dns[i - 1]) / (dns[i] - dns[i - 1]);
      return v[i - 1] + t * (v[i] - v[i - 1]);
    }
  }
  const n = dns.length - 1;
  return (v[n] * dn) / dns[n];
}

/**
 * Comprimento equivalente no DN — interpolado entre os DN da tabela (CPVC 22,
 * 28…). Sem `material`, ou com material que não é aço, é a tabela de PVC (a de
 * sempre, até DN 75); com AÇO (incêndio E1.2), a tabela de aço até DN 150.
 */
export function comprimentoEquivalenteM(peca: PecaDePerda, dn: number, material?: MaterialDeTubo | null): number {
  if (material && METAL.includes(material)) return interpolarPorDn(COMPRIMENTO_EQUIVALENTE_ACO_M[peca], DN_DA_TABELA_ACO, dn);
  return interpolarPorDn(COMPRIMENTO_EQUIVALENTE_M[peca], DN_DA_TABELA, dn);
}

/** A perda de UMA peça, mca: a perda distribuída do seu comprimento equivalente. */
export function perdaLocalizadaMca(peca: PecaDePerda, vazaoLs: number, material: MaterialDeTubo, dn: number, viscosidade = VISCOSIDADE_20C): number {
  return perdaDistribuida(vazaoLs, material, dn, comprimentoEquivalenteM(peca, dn, material), viscosidade).perdaMca;
}

/**
 * A perda no HIDRÔMETRO, kPa — NBR 5626 (anexo): Δh = (36·Q)² · Qmáx⁻², com Q em
 * L/s e Qmáx em m³/h. Na vazão máxima a perda é 100 kPa (10 mca), que é como o
 * hidrômetro é especificado.
 */
export function perdaNoHidrometroKpa(vazaoLs: number, qMaxM3h: number): number {
  return ((36 * Math.max(0, vazaoLs)) ** 2) / qMaxM3h ** 2;
}
