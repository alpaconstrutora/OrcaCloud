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
  fonte: string;
}

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
    fonte: 'NBR 13206 classe E; ε de cobre trefilado',
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
