import type { BlueprintModel, Structural, StructuralKind } from './blueprintKernel';
import { FORMA_ESTRUTURAL } from './blueprintKernel';
import { secaoTValida } from './blueprintKernel/secaoT';
import type { QuantidadeEstrutural, Quantitativos } from './blueprintKernel';
import { getCobrimentoNominalCm } from './structuralMath';
import { theoreticalLinearWeight } from './rebarEngine';

/**
 * ARMADURA ESQUEMÁTICA — o pré-quantitativo de aço da Planta (16/09/2026).
 *
 * Pedido: *"implementar armadura em vigas, lajes, pilares, blocos e estacas"*.
 * Decisões com o usuário: taxa de aço por família + armadura esquemática por
 * regra; hipóteses gravadas no ESTUDO; o aço entra no orçamento em kg.
 *
 * ─── O QUE ISTO É, E O QUE NÃO É ───────────────────────────────────────────
 *
 * A Planta não conhece cargas. O que cabe a ela é um PRÉ-QUANTITATIVO: para
 * cada peça, o ESQUEMA pelos mínimos da NBR 6118 (barras, bitola, estribos ou
 * malha) e, por cima dele, um PISO empírico por família (taxa de referência,
 * kg/m³). O kg da peça é `max(kg do esquema × (1 + perda), taxa × volume)`, e a
 * linha diz de onde veio (`origem`). Não é dimensionamento (sem esforço, sem
 * verificação), não é detalhamento (sem dobras, sem lista de barras, sem
 * emenda por posição) e não desenha barra em lugar nenhum — o IFC continua
 * declarando que não contém armadura, porque não contém.
 *
 * O módulo Estrutural fora da planta (`structuralMath.ts`, `rebarEngine.ts`)
 * dimensiona COM cargas e quantifica armadura já definida. Daqui se reutiliza
 * só o que é tabela: o cobrimento por CAA (`getCobrimentoNominalCm`) e o peso
 * linear NBR 7480 (`theoreticalLinearWeight`).
 *
 * ─── AS REGRAS, POR PEÇA (mínimos) ─────────────────────────────────────────
 *
 *  Pilar     As,min = 0,4 % Ac (17.3.5.3.1); ≥ 4 barras (6 na seção circular);
 *            barra = altura + 40 Ø (emenda por pé-direito); estribo Øt,
 *            s = min(20 cm, menor lado, 12 Øl) (18.4.3); perímetro do estribo
 *            = 2(b + h) − 8c + 2 ganchos de 10 Øt.
 *  Viga      ρmin = 0,15 % (fck ≤ 30; +0,008 %/MPa acima — 17.3.5.2.1, a
 *  Baldrame  regra de `structuralMath.dimensionarViga`); inferior ≥ 2 barras;
 *            superior: viga → 2 porta-estribos; baldrame → max(2, ½ As,inf,
 *            As,min) (a baldrame trabalha nos dois sentidos, como em
 *            `dimensionarVigaBaldrame`); barra = L + 2 × 30 Ø (ancoragem);
 *            estribos: Asw/s,min = 0,2 fctm/fywk · bw (17.4.1.1.1), s ≤ min(30
 *            cm, 0,6 d) (18.3.3.2, Vd ≤ 0,67 Vrd2 assumido). Seção T usa a alma.
 *  Laje      malha inferior nas DUAS direções, As,min = 0,15 % · 100 · h por
 *            metro (19.3.3.2, tabela 19.1 simplificada), s ≤ min(20 cm, 2h);
 *            negativos de apoio NÃO entram (o piso da taxa cobre).
 *  Bloco     malha inferior 0,15 % · b · h por direção (≥ 3 barras) com
 *            ganchos de 10 Ø + estribos verticais Ø 8 c/20 pelo perímetro.
 *            Bloco rígido de Bastos leva TIRANTES por carga; sem carga fica o
 *            mínimo, e a taxa de referência cobre o resto.
 *  Estaca    As = 0,5 % Ac no trecho armado (NBR 6122 §8.6 para estaca moldada
 *            in loco), ≥ 6 barras; barra = trecho armado + 40 Ø (arranque no
 *            bloco); espiral Øt com passo 20 cm, perímetro π(Ø − 2c).
 *
 * Ø 5,0 mm é CA-60; as demais bitolas são CA-50 — é como o mercado vende e como
 * o orçamento compra.
 */

export type ClasseDeAgressividade = 'I' | 'II' | 'III' | 'IV';

export interface HipotesesDeArmadura {
  fckMpa: number;
  caa: ClasseDeAgressividade;
  /** Perdas e emendas sobre o esquema, em % (10). */
  perdaPct: number;
  /** Bitola longitudinal por família, em mm. */
  bitolaPilarMm: number;
  bitolaVigaMm: number;
  bitolaLajeMm: number;
  bitolaBlocoMm: number;
  bitolaEstacaMm: number;
  /** Bitola do estribo / espiral, em mm (5,0 = CA-60; 6,3 = CA-50). */
  bitolaEstriboMm: number;
  /** Trecho armado da estaca, em m; `null` = todo o comprimento. */
  trechoArmadoDaEstacaM: number | null;
  /** Taxas de referência — o piso, em kg/m³. `0` desliga o piso da família. */
  taxaPilarKgM3: number;
  taxaVigaKgM3: number;
  taxaLajeKgM3: number;
  taxaBlocoKgM3: number;
  taxaEstacaKgM3: number;
}

export const HIPOTESES_ARMADURA_PADRAO: HipotesesDeArmadura = {
  fckMpa: 25,
  caa: 'II',
  perdaPct: 10,
  bitolaPilarMm: 12.5,
  bitolaVigaMm: 10,
  bitolaLajeMm: 8,
  bitolaBlocoMm: 12.5,
  bitolaEstacaMm: 10,
  bitolaEstriboMm: 5,
  trechoArmadoDaEstacaM: 6,
  taxaPilarKgM3: 100,
  taxaVigaKgM3: 90,
  taxaLajeKgM3: 70,
  taxaBlocoKgM3: 70,
  taxaEstacaKgM3: 50,
};

export const FCKS_MPA = [20, 25, 30, 35, 40] as const;
export const CLASSES_DE_AGRESSIVIDADE: readonly ClasseDeAgressividade[] = ['I', 'II', 'III', 'IV'];
export const BITOLAS_LONGITUDINAIS_MM = [6.3, 8, 10, 12.5, 16, 20] as const;
export const BITOLAS_DE_ESTRIBO_MM = [5, 6.3] as const;
export const PERDAS_PCT = [0, 5, 10, 15] as const;
export const TRECHOS_ARMADOS_DA_ESTACA_M: readonly (number | null)[] = [4, 6, 8, null];

/** O tipo de aço pela bitola: 5,0 mm é CA-60, o resto CA-50. */
export const tipoDeAco = (bitolaMm: number): 'CA-50' | 'CA-60' => (bitolaMm <= 5 ? 'CA-60' : 'CA-50');
/** Peso linear NBR 7480, kg/m. */
export const pesoLinearKgM = (bitolaMm: number) => theoreticalLinearWeight(bitolaMm);
/** Área da barra, cm². */
const areaDaBarraCm2 = (bitolaMm: number) => (Math.PI * (bitolaMm / 10) ** 2) / 4;

const arredonda = (v: number, casas: number) => Math.round(v * 10 ** casas) / 10 ** casas;

/**
 * ρmin de flexão (17.3.5.2.1), como `structuralMath.dimensionarViga`: 0,15 % até
 * fck 30 e +0,008 % por MPa acima.
 */
export function rhoMinDeFlexao(fckMpa: number): number {
  return fckMpa > 30 ? 0.0015 + (fckMpa - 30) * 0.00008 : 0.0015;
}

export interface CamadaDeArmadura {
  /** 'longitudinal' | 'superior' | 'estribo' | 'malha' | 'espiral' | 'tirante' */
  papel: string;
  bitolaMm: number;
  aco: 'CA-50' | 'CA-60';
  /** Número de barras (ou de estribos/voltas). */
  n: number;
  /** Comprimento de cada uma, em m. */
  comprimentoUnitM: number;
  /** Espaçamento, em cm, quando faz sentido (estribo, malha, espiral). */
  espacamentoCm: number | null;
  kg: number;
}

export interface ArmaduraDaPeca {
  structuralId: string;
  uid: string;
  kind: StructuralKind;
  rotulo: string;
  volumeConcretoM3: number;
  camadas: CamadaDeArmadura[];
  /** kg do esquema já com a perda. */
  kgEsquema: number;
  /** taxa de referência × volume. */
  kgPiso: number;
  /** O kg que vale: max(esquema, piso). */
  kg: number;
  origem: 'ESQUEMA' | 'TAXA';
  kgCa50: number;
  kgCa60: number;
  taxaEfetivaKgM3: number;
  /** "4 Ø 12,5 + estribos Ø 5,0 c/15" */
  descricao: string;
  avisos: string[];
  /** Cobrimento nominal usado (mm) — quem desenha a seção precisa dele. */
  cobrimentoMm: number;
}

export interface TotaisDeArmadura {
  pilarKg: number;
  vigaKg: number;
  lajeKg: number;
  fundacaoKg: number;
  totalKg: number;
  ca50Kg: number;
  ca60Kg: number;
  taxaPilarKgM3: number;
  taxaVigaKgM3: number;
  taxaLajeKgM3: number;
  taxaFundacaoKgM3: number;
}

export interface ArmaduraQuantificada {
  pecas: ArmaduraDaPeca[];
  totais: TotaisDeArmadura;
}

const fmtBitola = (mm: number) => mm.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Família de totais e de taxa da peça. */
export function familiaDaPeca(kind: StructuralKind): 'PILAR' | 'VIGA' | 'LAJE' | 'FUNDACAO' {
  if (kind === 'PILAR') return 'PILAR';
  if (kind === 'VIGA') return 'VIGA';
  if (kind === 'LAJE') return 'LAJE';
  return 'FUNDACAO';
}

function taxaDeReferencia(kind: StructuralKind, hip: HipotesesDeArmadura): number {
  switch (kind) {
    case 'PILAR':
      return hip.taxaPilarKgM3;
    case 'VIGA':
    case 'VIGA_FUNDACAO':
      return hip.taxaVigaKgM3;
    case 'LAJE':
      return hip.taxaLajeKgM3;
    case 'BLOCO_COROAMENTO':
      return hip.taxaBlocoKgM3;
    case 'ESTACA':
      return hip.taxaEstacaKgM3;
  }
}

function camada(papel: string, bitolaMm: number, n: number, comprimentoUnitM: number, espacamentoCm: number | null): CamadaDeArmadura {
  const nInt = Math.max(0, Math.round(n));
  return {
    papel,
    bitolaMm,
    aco: tipoDeAco(bitolaMm),
    n: nInt,
    comprimentoUnitM: arredonda(Math.max(0, comprimentoUnitM), 3),
    espacamentoCm,
    kg: arredonda(nInt * Math.max(0, comprimentoUnitM) * pesoLinearKgM(bitolaMm), 3),
  };
}

/** Gancho de estribo por ponta: max(10 Ø, 7,5 cm) — 9.4.5 (`rebarEngine` tem a mesma regra). */
const ganchoCm = (bitolaMm: number) => Math.max(bitolaMm, 7.5);

/**
 * O esquema de UMA peça. `quant` traz o volume LÍQUIDO (já com sobreposição
 * descontada) — é o que o piso multiplica; a geometria do esquema sai da própria
 * peça (b, h, L), que é a forma antes de qualquer desconto.
 */
export function armaduraDaPeca(s: Structural, quant: Pick<QuantidadeEstrutural, 'volumeConcretoM3' | 'comprimentoM' | 'areaPlantaM2'> , hip: HipotesesDeArmadura): ArmaduraDaPeca {
  const forma = FORMA_ESTRUTURAL[s.kind];
  const avisos: string[] = [];
  const camadas: CamadaDeArmadura[] = [];
  const fck = Math.max(15, hip.fckMpa);
  const fctmMpa = 0.3 * fck ** (2 / 3);
  const perda = 1 + Math.max(0, hip.perdaPct) / 100;
  let descricao = '';
  let cobrimentoMm = 0;

  if (s.kind === 'PILAR') {
    const bCm = s.larguraMm / 10;
    const hCm = s.circular ? bCm : s.profundidadeMm / 10;
    const c = getCobrimentoNominalCm(hip.caa, 'pilar');
    cobrimentoMm = c * 10;
    const acCm2 = s.circular ? (Math.PI * bCm ** 2) / 4 : bCm * hCm;
    const asMin = 0.004 * acCm2;
    const bit = hip.bitolaPilarMm;
    const nMin = s.circular ? 6 : 4;
    const n = Math.max(nMin, Math.ceil(asMin / areaDaBarraCm2(bit)));
    const alturaM = s.alturaMm / 1000;
    camadas.push(camada('longitudinal', bit, n, alturaM + (40 * bit) / 1000, null));
    const bt = hip.bitolaEstriboMm;
    const sCm = Math.max(5, Math.floor(Math.min(20, Math.min(bCm, hCm), 1.2 * bit)));
    const nEst = Math.floor((alturaM * 100) / sCm) + 1;
    const perimetroCm = s.circular ? Math.PI * (bCm - 2 * c) : 2 * (bCm + hCm) - 8 * c;
    if (perimetroCm <= 0) avisos.push('seção menor que o cobrimento — estribo não fecha');
    camadas.push(camada('estribo', bt, nEst, (Math.max(0, perimetroCm) + 2 * ganchoCm(bt)) / 100, sCm));
    descricao = `${n} Ø ${fmtBitola(bit)} + estribos Ø ${fmtBitola(bt)} c/${sCm}`;
  } else if (s.kind === 'VIGA' || s.kind === 'VIGA_FUNDACAO') {
    const secaoT = secaoTValida(s);
    const bCm = (secaoT ? secaoT.almaLarguraMm : s.larguraMm) / 10;
    const hCm = s.alturaMm / 10;
    const c = getCobrimentoNominalCm(hip.caa, 'viga');
    cobrimentoMm = c * 10;
    const bit = hip.bitolaVigaMm;
    const bt = hip.bitolaEstriboMm;
    const dCm = hCm - c - bt / 10 - bit / 20;
    const asMin = rhoMinDeFlexao(fck) * bCm * hCm;
    const nInf = Math.max(2, Math.ceil(asMin / areaDaBarraCm2(bit)));
    const LM = quant.comprimentoM;
    const barraM = LM + (2 * 30 * bit) / 1000;
    camadas.push(camada('longitudinal', bit, nInf, barraM, null));
    const nSup = s.kind === 'VIGA_FUNDACAO' ? Math.max(2, Math.ceil(Math.max(0.5 * nInf * areaDaBarraCm2(bit), asMin) / areaDaBarraCm2(bit))) : 2;
    camadas.push(camada('superior', bit, nSup, barraM, null));
    // Estribos: taxa mínima transversal; s pelo Asw de DOIS ramos.
    const aswSMin = (0.2 * fctmMpa * bCm) / 500; // cm²/cm
    const sPorTaxa = (2 * areaDaBarraCm2(bt)) / Math.max(1e-6, aswSMin);
    const sCm = Math.max(5, Math.floor(Math.min(30, 0.6 * Math.max(dCm, 1), sPorTaxa)));
    const nEst = Math.floor((LM * 100) / sCm) + 1;
    const perimetroCm = 2 * (bCm + hCm) - 8 * c;
    if (perimetroCm <= 0) avisos.push('seção menor que o cobrimento — estribo não fecha');
    camadas.push(camada('estribo', bt, nEst, (Math.max(0, perimetroCm) + 2 * ganchoCm(bt)) / 100, sCm));
    descricao = `${nInf} Ø ${fmtBitola(bit)} inf. + ${nSup} Ø ${fmtBitola(bit)} sup. + estribos Ø ${fmtBitola(bt)} c/${sCm}`;
  } else if (s.kind === 'LAJE') {
    const hCm = s.alturaMm / 10;
    cobrimentoMm = getCobrimentoNominalCm(hip.caa, 'laje') * 10;
    const bit = hip.bitolaLajeMm;
    const asMinPorM = rhoMinDeFlexao(fck) * 100 * hCm; // cm²/m por direção
    const sCm = Math.max(5, Math.floor(Math.min(20, 2 * hCm, (areaDaBarraCm2(bit) * 100) / Math.max(1e-6, asMinPorM))));
    const areaM2 = quant.areaPlantaM2;
    // Cada direção: (100 / s) barras por metro de largura, cada uma com 1 m por metro de comprimento → área × 100/s metros.
    const comprimentoPorDirecaoM = (areaM2 * 100) / sCm;
    camadas.push(camada('malha', bit, 2, comprimentoPorDirecaoM, sCm));
    descricao = `malha inferior Ø ${fmtBitola(bit)} c/${sCm} nas duas direções`;
    avisos.push('negativos de apoio fora do esquema — o piso da taxa cobre');
  } else if (s.kind === 'BLOCO_COROAMENTO') {
    const bCm = s.larguraMm / 10;
    const pCm = s.circular ? bCm : s.profundidadeMm / 10;
    const hCm = s.alturaMm / 10;
    const c = getCobrimentoNominalCm(hip.caa, 'sapata');
    cobrimentoMm = c * 10;
    const bit = hip.bitolaBlocoMm;
    const aphi = areaDaBarraCm2(bit);
    // Malha inferior: em cada direção, As,min = 0,15 % × (largura transversal) × h.
    const nAoLongoDeB = Math.max(3, Math.ceil((0.0015 * pCm * hCm) / aphi));
    const nAoLongoDeP = Math.max(3, Math.ceil((0.0015 * bCm * hCm) / aphi));
    const gancho = (10 * bit) / 10; // cm
    camadas.push(camada('malha', bit, nAoLongoDeB, (bCm - 2 * c + 2 * gancho) / 100, null));
    camadas.push(camada('malha', bit, nAoLongoDeP, (pCm - 2 * c + 2 * gancho) / 100, null));
    const bt = 8;
    const sCm = 20;
    const nEst = Math.floor((Math.max(bCm, pCm) * 1) / sCm) + 1;
    const perimetroCm = 2 * (Math.min(bCm, pCm) + hCm) - 8 * c;
    camadas.push(camada('estribo', bt, nEst, (Math.max(0, perimetroCm) + 2 * ganchoCm(bt)) / 100, sCm));
    descricao = `malha inferior ${nAoLongoDeB} + ${nAoLongoDeP} Ø ${fmtBitola(bit)} + estribos Ø ${fmtBitola(bt)} c/${sCm}`;
    avisos.push('tirantes por carga fora do esquema — o piso da taxa cobre');
  } else {
    // ESTACA
    const dCm = s.larguraMm / 10;
    const c = getCobrimentoNominalCm(hip.caa, 'sapata');
    cobrimentoMm = c * 10;
    const bit = hip.bitolaEstacaMm;
    const acCm2 = (Math.PI * dCm ** 2) / 4;
    const as = 0.005 * acCm2;
    const n = Math.max(6, Math.ceil(as / areaDaBarraCm2(bit)));
    const LM = s.alturaMm / 1000;
    const trechoM = hip.trechoArmadoDaEstacaM == null ? LM : Math.min(LM, Math.max(0, hip.trechoArmadoDaEstacaM));
    camadas.push(camada('longitudinal', bit, n, trechoM + (40 * bit) / 1000, null));
    const bt = hip.bitolaEstriboMm;
    const passoCm = 20;
    const voltas = Math.floor((trechoM * 100) / passoCm) + 1;
    const perimetroCm = Math.PI * (dCm - 2 * c);
    if (perimetroCm <= 0) avisos.push('diâmetro menor que o cobrimento — espiral não fecha');
    camadas.push(camada('espiral', bt, voltas, Math.max(0, perimetroCm) / 100, passoCm));
    descricao = `${n} Ø ${fmtBitola(bit)} no trecho armado de ${trechoM.toFixed(1).replace('.', ',')} m + espiral Ø ${fmtBitola(bt)} passo ${passoCm}`;
  }

  const kgBruto = camadas.reduce((acc, cm) => acc + cm.kg, 0);
  const kgEsquema = arredonda(kgBruto * perda, 2);
  const taxa = Math.max(0, taxaDeReferencia(s.kind, hip));
  const volume = Math.max(0, quant.volumeConcretoM3);
  const kgPiso = arredonda(taxa * volume, 2);
  const origem: ArmaduraDaPeca['origem'] = kgPiso > kgEsquema ? 'TAXA' : 'ESQUEMA';
  const kg = origem === 'TAXA' ? kgPiso : kgEsquema;
  if (origem === 'TAXA') avisos.unshift(`piso da taxa (${taxa} kg/m³) acima do esquema mínimo (${kgEsquema.toFixed(1).replace('.', ',')} kg)`);
  // A divisão por tipo de aço segue a proporção do esquema — o piso não sabe de bitola.
  const ca60Bruto = camadas.filter((cm) => cm.aco === 'CA-60').reduce((a, cm) => a + cm.kg, 0);
  const fracaoCa60 = kgBruto > 0 ? ca60Bruto / kgBruto : 0;
  const kgCa60 = arredonda(kg * fracaoCa60, 2);
  const kgCa50 = arredonda(kg - kgCa60, 2);
  return {
    structuralId: s.id,
    uid: s.uid,
    kind: s.kind,
    rotulo: s.rotulo?.trim() ?? '',
    volumeConcretoM3: volume,
    camadas,
    kgEsquema,
    kgPiso,
    kg,
    origem,
    kgCa50,
    kgCa60,
    taxaEfetivaKgM3: volume > 0 ? arredonda(kg / volume, 1) : 0,
    descricao,
    avisos,
    cobrimentoMm,
  };
}

/** A armadura de TODAS as peças do quantitativo, com os totais por família e por aço. */
export function armaduraDoModelo(model: BlueprintModel, quant: Pick<Quantitativos, 'estruturas'>, hip: HipotesesDeArmadura): ArmaduraQuantificada {
  const porId = new Map((model.structures ?? []).map((s) => [s.id, s]));
  const pecas: ArmaduraDaPeca[] = [];
  for (const q of quant.estruturas) {
    const s = porId.get(q.structuralId);
    if (!s) continue;
    pecas.push(armaduraDaPeca(s, q, hip));
  }
  const soma = (f: (p: ArmaduraDaPeca) => boolean, campo: 'kg' | 'volumeConcretoM3' | 'kgCa50' | 'kgCa60') =>
    arredonda(pecas.filter(f).reduce((a, p) => a + p[campo], 0), 3);
  const fam = (nome: ReturnType<typeof familiaDaPeca>) => (p: ArmaduraDaPeca) => familiaDaPeca(p.kind) === nome;
  const taxa = (kg: number, vol: number) => (vol > 0 ? arredonda(kg / vol, 1) : 0);
  const pilarKg = soma(fam('PILAR'), 'kg');
  const vigaKg = soma(fam('VIGA'), 'kg');
  const lajeKg = soma(fam('LAJE'), 'kg');
  const fundacaoKg = soma(fam('FUNDACAO'), 'kg');
  return {
    pecas,
    totais: {
      pilarKg,
      vigaKg,
      lajeKg,
      fundacaoKg,
      totalKg: arredonda(pilarKg + vigaKg + lajeKg + fundacaoKg, 3),
      ca50Kg: soma(() => true, 'kgCa50'),
      ca60Kg: soma(() => true, 'kgCa60'),
      taxaPilarKgM3: taxa(pilarKg, soma(fam('PILAR'), 'volumeConcretoM3')),
      taxaVigaKgM3: taxa(vigaKg, soma(fam('VIGA'), 'volumeConcretoM3')),
      taxaLajeKgM3: taxa(lajeKg, soma(fam('LAJE'), 'volumeConcretoM3')),
      taxaFundacaoKgM3: taxa(fundacaoKg, soma(fam('FUNDACAO'), 'volumeConcretoM3')),
    },
  };
}

/**
 * Completa um JSON parcial (a coluna `hipoteses` do estudo) com o padrão, campo
 * a campo, aceitando só valores válidos — o mesmo molde de
 * `hipotesesDaColuna` da elétrica.
 */
export function hipotesesDeArmaduraDaColuna(raw: unknown): HipotesesDeArmadura {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, padrao: number, min = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= min ? v : padrao);
  const em = <T,>(lista: readonly T[], v: unknown, padrao: T): T => (lista.includes(v as T) ? (v as T) : padrao);
  const P = HIPOTESES_ARMADURA_PADRAO;
  const trecho = r.trechoArmadoDaEstacaM;
  return {
    fckMpa: em(FCKS_MPA, r.fckMpa, P.fckMpa),
    caa: em(CLASSES_DE_AGRESSIVIDADE, r.caa, P.caa),
    perdaPct: num(r.perdaPct, P.perdaPct),
    bitolaPilarMm: em(BITOLAS_LONGITUDINAIS_MM, r.bitolaPilarMm, P.bitolaPilarMm),
    bitolaVigaMm: em(BITOLAS_LONGITUDINAIS_MM, r.bitolaVigaMm, P.bitolaVigaMm),
    bitolaLajeMm: em(BITOLAS_LONGITUDINAIS_MM, r.bitolaLajeMm, P.bitolaLajeMm),
    bitolaBlocoMm: em(BITOLAS_LONGITUDINAIS_MM, r.bitolaBlocoMm, P.bitolaBlocoMm),
    bitolaEstacaMm: em(BITOLAS_LONGITUDINAIS_MM, r.bitolaEstacaMm, P.bitolaEstacaMm),
    bitolaEstriboMm: em(BITOLAS_DE_ESTRIBO_MM, r.bitolaEstriboMm, P.bitolaEstriboMm),
    trechoArmadoDaEstacaM: trecho === null ? null : num(trecho, P.trechoArmadoDaEstacaM ?? 6, 0.5),
    taxaPilarKgM3: num(r.taxaPilarKgM3, P.taxaPilarKgM3),
    taxaVigaKgM3: num(r.taxaVigaKgM3, P.taxaVigaKgM3),
    taxaLajeKgM3: num(r.taxaLajeKgM3, P.taxaLajeKgM3),
    taxaBlocoKgM3: num(r.taxaBlocoKgM3, P.taxaBlocoKgM3),
    taxaEstacaKgM3: num(r.taxaEstacaKgM3, P.taxaEstacaKgM3),
  };
}
