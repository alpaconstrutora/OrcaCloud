/**
 * ANÁLISES sobre a grade de elevação — declividade, corte e aterro, e a curva
 * sob o cursor.
 *
 * ─── POR QUE UM ARQUIVO À PARTE ─────────────────────────────────────────────
 *
 * `blueprintTopografia.ts` produz a grade e as curvas; este consome a grade e
 * devolve LEITURAS de engenharia. São fases diferentes do PRD (a primeira é
 * "leitura preliminar do relevo", a segunda "análise de engenharia", §27) e
 * têm vidas diferentes: a grade é imutável por versão, a análise muda quando
 * alguém digita outra cota de platô.
 *
 * ─── PURO, COMO O RESTO ──────────────────────────────────────────────────────
 *
 * Números entram, números saem. A tela e o canvas só pintam.
 *
 * ─── O QUE É "PRELIMINAR" AQUI ──────────────────────────────────────────────
 *
 * Corte e aterro por CÉLULA da grade, contra um platô de cota ÚNICA: sem
 * talude, sem empolamento, sem compactação, sem via de acesso. É a conta de
 * viabilidade — "o terreno pede 300 m³ de corte" — e não o projeto de
 * terraplenagem, que exige levantamento validado e responsabilidade técnica
 * (§5.3 do PRD). A tela diz isso.
 */

import { pointInPolygon, type Point } from './blueprintKernel';
import type { CurvaDeNivel, GradeDeElevacao } from './blueprintTopografia';

// ── Declividade ───────────────────────────────────────────────────────────

export interface FaixaDeDeclividade {
  /** Limite superior, em %. A última é `Infinity`. */
  ateP: number;
  rotulo: string;
  /** Cor de referência para a legenda e o canvas. */
  cor: string;
}

/**
 * As faixas de uso corrente em viabilidade urbana: até 5 % é plano, 5–15 %
 * pede pouco movimento de terra, 15–30 % pede contenção ou platôs, acima de
 * 30 % é a faixa que a lei de parcelamento (Lei 6.766) trata como restrição.
 */
export const FAIXAS_DE_DECLIVIDADE: readonly FaixaDeDeclividade[] = [
  { ateP: 5, rotulo: '0–5 %', cor: '#bbf7d0' },
  { ateP: 15, rotulo: '5–15 %', cor: '#fde68a' },
  { ateP: 30, rotulo: '15–30 %', cor: '#fdba74' },
  { ateP: Infinity, rotulo: '> 30 %', cor: '#fca5a5' },
];

export interface Declividade {
  /** Uma por célula, `(linhas − 1) × (colunas − 1)`, row-major; `null` = nodata. */
  celulasP: (number | null)[];
  /** Índice da faixa por célula; `null` onde não há dado. */
  faixaDaCelula: (number | null)[];
  /** Área dentro do lote por faixa, em m², na ordem de `FAIXAS_DE_DECLIVIDADE`. */
  areaPorFaixaM2: number[];
  areaAnalisadaM2: number;
  mediaP: number;
  maximaP: number;
}

/** Índice da faixa de uma declividade em %. */
export function faixaDe(declividadeP: number): number {
  for (let i = 0; i < FAIXAS_DE_DECLIVIDADE.length; i++) {
    if (declividadeP <= FAIXAS_DE_DECLIVIDADE[i].ateP) return i;
  }
  return FAIXAS_DE_DECLIVIDADE.length - 1;
}

/**
 * Declividade por célula: o gradiente do plano que passa pelos quatro cantos,
 * em porcentagem (Δz / Δxy × 100). Célula com canto sem cota fica `null`.
 *
 * As áreas por faixa contam só as células cujo CENTRO cai dentro do lote:
 * a grade tem uma célula de folga em volta, que não é terreno de ninguém.
 */
export function declividadeDaGrade(grade: GradeDeElevacao, anel: Point[]): Declividade {
  const { origem, espacamentoMm: esp, colunas, linhas, cotasM } = grade;
  const espM = esp / 1000;
  const areaCelM2 = espM * espM;
  const celulasP: (number | null)[] = [];
  const faixaDaCelula: (number | null)[] = [];
  const areaPorFaixaM2 = FAIXAS_DE_DECLIVIDADE.map(() => 0);
  let soma = 0;
  let n = 0;
  let maxima = 0;

  for (let l = 0; l + 1 < linhas; l++) {
    for (let c = 0; c + 1 < colunas; c++) {
      const v00 = cotasM[l * colunas + c];
      const v10 = cotasM[l * colunas + c + 1];
      const v01 = cotasM[(l + 1) * colunas + c];
      const v11 = cotasM[(l + 1) * colunas + c + 1];
      if (v00 === null || v10 === null || v01 === null || v11 === null) {
        celulasP.push(null);
        faixaDaCelula.push(null);
        continue;
      }
      // Gradiente médio das duas arestas em cada direção.
      const dzdx = ((v10 - v00 + (v11 - v01)) / 2) / espM;
      const dzdy = ((v01 - v00 + (v11 - v10)) / 2) / espM;
      const p = Math.hypot(dzdx, dzdy) * 100;
      celulasP.push(p);
      const faixa = faixaDe(p);
      faixaDaCelula.push(faixa);

      const centro = { x: origem.x + (c + 0.5) * esp, y: origem.y + (l + 0.5) * esp };
      if (anel.length >= 3 && !pointInPolygon(anel, centro)) continue;
      areaPorFaixaM2[faixa] += areaCelM2;
      soma += p;
      n++;
      if (p > maxima) maxima = p;
    }
  }

  return {
    celulasP,
    faixaDaCelula,
    areaPorFaixaM2,
    areaAnalisadaM2: areaPorFaixaM2.reduce((a, b) => a + b, 0),
    mediaP: n > 0 ? soma / n : 0,
    maximaP: maxima,
  };
}

// ── Corte e aterro ────────────────────────────────────────────────────────

export type LadoDaTerraplenagem = 'CORTE' | 'ATERRO';

export interface Terraplenagem {
  cotaPlatoM: number;
  corteM3: number;
  aterroM3: number;
  /** `aterro − corte`: positivo = falta terra, negativo = sobra. */
  saldoM3: number;
  areaPlatoM2: number;
  alturaMaxCorteM: number;
  alturaMaxAterroM: number;
  /** Uma por célula (mesmo índice de `declividadeDaGrade`); `null` = fora do platô ou sem cota. */
  ladoDaCelula: (LadoDaTerraplenagem | null)[];
  /** Δ por célula (platô − terreno), em m; `null` fora do platô. */
  deltaDaCelulaM: (number | null)[];
  celulasSemCota: number;
}

/** Cota média do terreno em cada célula do platô, ou `null`. */
function cotaMediaDaCelula(grade: GradeDeElevacao, l: number, c: number): number | null {
  const { colunas, cotasM } = grade;
  const v00 = cotasM[l * colunas + c];
  const v10 = cotasM[l * colunas + c + 1];
  const v01 = cotasM[(l + 1) * colunas + c];
  const v11 = cotasM[(l + 1) * colunas + c + 1];
  if (v00 === null || v10 === null || v01 === null || v11 === null) return null;
  return (v00 + v10 + v01 + v11) / 4;
}

function celulasDoPlato(grade: GradeDeElevacao, anelPlato: Point[]): { l: number; c: number }[] {
  const { origem, espacamentoMm: esp, colunas, linhas } = grade;
  const dentro: { l: number; c: number }[] = [];
  if (anelPlato.length < 3) return dentro;
  for (let l = 0; l + 1 < linhas; l++) {
    for (let c = 0; c + 1 < colunas; c++) {
      const centro = { x: origem.x + (c + 0.5) * esp, y: origem.y + (l + 0.5) * esp };
      if (pointInPolygon(anelPlato, centro)) dentro.push({ l, c });
    }
  }
  return dentro;
}

/**
 * A cota que EQUILIBRA corte e aterro: a média do terreno sobre o platô.
 *
 * Com células de área igual, cortar acima da média e aterrar abaixo dela dá
 * volumes iguais por construção. É a sugestão que a tela oferece; a cota que
 * o projeto quer (nível da rua, do acesso) é outra decisão e é digitada.
 */
export function cotaDeEquilibrio(grade: GradeDeElevacao, anelPlato: Point[]): number | null {
  let soma = 0;
  let n = 0;
  for (const { l, c } of celulasDoPlato(grade, anelPlato)) {
    const v = cotaMediaDaCelula(grade, l, c);
    if (v === null) continue;
    soma += v;
    n++;
  }
  return n > 0 ? soma / n : null;
}

/** Corte e aterro de um platô plano na cota dada, célula a célula. */
export function terraplenagemPreliminar(
  grade: GradeDeElevacao,
  anelPlato: Point[],
  cotaPlatoM: number,
): Terraplenagem {
  const { espacamentoMm: esp, colunas, linhas } = grade;
  const areaCelM2 = (esp / 1000) ** 2;
  const total = (linhas - 1) * (colunas - 1);
  const ladoDaCelula = new Array<LadoDaTerraplenagem | null>(total).fill(null);
  const deltaDaCelulaM = new Array<number | null>(total).fill(null);
  let corte = 0;
  let aterro = 0;
  let area = 0;
  let maxCorte = 0;
  let maxAterro = 0;
  let semCota = 0;

  for (const { l, c } of celulasDoPlato(grade, anelPlato)) {
    const i = l * (colunas - 1) + c;
    const v = cotaMediaDaCelula(grade, l, c);
    if (v === null) {
      semCota++;
      continue;
    }
    const delta = cotaPlatoM - v;
    deltaDaCelulaM[i] = delta;
    area += areaCelM2;
    if (delta > 0) {
      aterro += delta * areaCelM2;
      ladoDaCelula[i] = 'ATERRO';
      if (delta > maxAterro) maxAterro = delta;
    } else if (delta < 0) {
      corte += -delta * areaCelM2;
      ladoDaCelula[i] = 'CORTE';
      if (-delta > maxCorte) maxCorte = -delta;
    }
  }

  return {
    cotaPlatoM,
    corteM3: corte,
    aterroM3: aterro,
    saldoM3: aterro - corte,
    areaPlatoM2: area,
    alturaMaxCorteM: maxCorte,
    alturaMaxAterroM: maxAterro,
    ladoDaCelula,
    deltaDaCelulaM,
    celulasSemCota: semCota,
  };
}

// ── Curva sob o cursor ────────────────────────────────────────────────────

function distanciaAoSegmento(a: Point, b: Point, p: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Qual curva está a menos de `toleranciaMm` do ponto — a mais próxima. `null`
 * se nenhuma. Percorre todas: com dezenas de curvas e centenas de pontos cada,
 * é uma conta por clique, não por quadro.
 */
export function curvaSob(curvas: CurvaDeNivel[], p: Point, toleranciaMm: number): number | null {
  let melhor: number | null = null;
  let menor = toleranciaMm;
  curvas.forEach((c, i) => {
    for (let k = 0; k + 1 < c.pontos.length; k++) {
      const d = distanciaAoSegmento(c.pontos[k], c.pontos[k + 1], p);
      if (d <= menor) {
        menor = d;
        melhor = i;
      }
    }
  });
  return melhor;
}

/** Comprimento de uma curva, em metros. */
export function comprimentoDaCurvaM(curva: CurvaDeNivel): number {
  let total = 0;
  for (let k = 0; k + 1 < curva.pontos.length; k++) {
    total += Math.hypot(
      curva.pontos[k + 1].x - curva.pontos[k].x,
      curva.pontos[k + 1].y - curva.pontos[k].y,
    );
  }
  return total / 1000;
}
