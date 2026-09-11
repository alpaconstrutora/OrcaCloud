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

/**
 * `CORTE`/`ATERRO` dentro do platô; `TALUDE_*` na faixa fora dele, onde a
 * superfície de projeto desce (ou sobe) até encontrar o terreno natural.
 */
export type LadoDaTerraplenagem = 'CORTE' | 'ATERRO' | 'TALUDE_CORTE' | 'TALUDE_ATERRO';

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

// ── Talude, empolamento e contração (fase 3) ──────────────────────────────

/**
 * Os parâmetros de PROJETO da terraplenagem. Padrões de solo comum; a tela
 * os mostra como premissa editável, nunca como fato do terreno.
 */
export interface ParametrosDeTerraplenagem {
  /** Talude de corte 1:h — h metros na horizontal para 1 na vertical. */
  taludeCorteH: number;
  taludeAterroH: number;
  /** Empolamento do material escavado, em %: banco → solto (transporte). */
  empolamentoPct: number;
  /** Contração do aterro compactado, em %: banco necessário = aterro × (1 + c). */
  contracaoPct: number;
}

export const PARAMETROS_PADRAO: ParametrosDeTerraplenagem = {
  taludeCorteH: 1.5,
  taludeAterroH: 1.5,
  empolamentoPct: 25,
  contracaoPct: 15,
};

/** Distância de um ponto ao contorno do anel (zero dentro dele). */
export function distanciaAoAnel(p: Point, anel: Point[]): number {
  if (anel.length >= 3 && pointInPolygon(anel, p)) return 0;
  let menor = Infinity;
  for (let i = 0; i < anel.length; i++) {
    const d = distanciaAoSegmento(anel[i], anel[(i + 1) % anel.length], p);
    if (d < menor) menor = d;
  }
  return menor;
}

export interface TerraplenagemComTalude extends Terraplenagem {
  parametros: ParametrosDeTerraplenagem;
  /** Volumes na FAIXA de talude, fora do platô. */
  taludeCorteM3: number;
  taludeAterroM3: number;
  areaTaludeM2: number;
  /** Platô + talude, em banco (medido no terreno). */
  corteTotalM3: number;
  aterroTotalM3: number;
  /** Corte em banco × (1 + empolamento): o que se transporta. */
  corteSoltoM3: number;
  /** Aterro compactado × (1 + contração): o banco que ele consome. */
  aterroEmBancoM3: number;
  /** `corteTotal − aterroEmBanco`: positivo sobra (bota-fora), negativo falta (empréstimo). */
  saldoEmBancoM3: number;
  botaForaM3: number;
  emprestimoM3: number;
}

/**
 * Corte e aterro COM talude, empolamento e contração — a conta de projeto.
 *
 * Dentro do platô é `terraplenagemPreliminar`. Fora dele, a superfície de
 * projeto sai da borda do platô inclinada: sobe a `1:h_corte` quando o terreno
 * está acima (corte) e desce a `1:h_aterro` quando está abaixo (aterro), até
 * ENCONTRAR o terreno natural — a célula em que nenhuma das duas superfícies
 * cruza o terreno não é tocada. É o offset de talude célula a célula, sem
 * banqueta nem canaleta: continua sendo estimativa, mas agora é a estimativa
 * que o orçamentista faz.
 */
export function terraplenagemComTalude(
  grade: GradeDeElevacao,
  anelPlato: Point[],
  cotaPlatoM: number,
  parametros: ParametrosDeTerraplenagem = PARAMETROS_PADRAO,
): TerraplenagemComTalude {
  const base = terraplenagemPreliminar(grade, anelPlato, cotaPlatoM);
  const { origem, espacamentoMm: esp, colunas, linhas } = grade;
  const areaCelM2 = (esp / 1000) ** 2;
  const hc = Math.max(0.01, parametros.taludeCorteH);
  const ha = Math.max(0.01, parametros.taludeAterroH);

  let taludeCorte = 0;
  let taludeAterro = 0;
  let areaTalude = 0;
  const ladoDaCelula = [...base.ladoDaCelula];
  const deltaDaCelulaM = [...base.deltaDaCelulaM];

  if (anelPlato.length >= 3) {
    for (let l = 0; l + 1 < linhas; l++) {
      for (let c = 0; c + 1 < colunas; c++) {
        const i = l * (colunas - 1) + c;
        if (base.deltaDaCelulaM[i] !== null) continue; // dentro do platô
        const centro = { x: origem.x + (c + 0.5) * esp, y: origem.y + (l + 0.5) * esp };
        if (pointInPolygon(anelPlato, centro)) continue; // dentro sem cota
        const terreno = cotaMediaDaCelula(grade, l, c);
        if (terreno === null) continue;
        const dM = distanciaAoAnel(centro, anelPlato) / 1000;
        const superficieCorte = cotaPlatoM + dM / hc;
        const superficieAterro = cotaPlatoM - dM / ha;
        if (terreno > superficieCorte) {
          const h = terreno - superficieCorte;
          taludeCorte += h * areaCelM2;
          areaTalude += areaCelM2;
          ladoDaCelula[i] = 'TALUDE_CORTE';
          deltaDaCelulaM[i] = -h;
        } else if (terreno < superficieAterro) {
          const h = superficieAterro - terreno;
          taludeAterro += h * areaCelM2;
          areaTalude += areaCelM2;
          ladoDaCelula[i] = 'TALUDE_ATERRO';
          deltaDaCelulaM[i] = h;
        }
      }
    }
  }

  const corteTotal = base.corteM3 + taludeCorte;
  const aterroTotal = base.aterroM3 + taludeAterro;
  const corteSolto = corteTotal * (1 + parametros.empolamentoPct / 100);
  const aterroEmBanco = aterroTotal * (1 + parametros.contracaoPct / 100);
  const saldo = corteTotal - aterroEmBanco;

  return {
    ...base,
    ladoDaCelula,
    deltaDaCelulaM,
    parametros,
    taludeCorteM3: taludeCorte,
    taludeAterroM3: taludeAterro,
    areaTaludeM2: areaTalude,
    corteTotalM3: corteTotal,
    aterroTotalM3: aterroTotal,
    corteSoltoM3: corteSolto,
    aterroEmBancoM3: aterroEmBanco,
    saldoEmBancoM3: saldo,
    botaForaM3: Math.max(0, saldo),
    emprestimoM3: Math.max(0, -saldo),
  };
}

// ── Perfil altimétrico (fase 3) ───────────────────────────────────────────

export interface PontoDoPerfil {
  /** Distância acumulada ao longo da linha, em metros. */
  distM: number;
  cotaM: number | null;
  x: number;
  y: number;
}

/**
 * O perfil do terreno ao longo de uma POLILINHA, amostrado a `passoMm` e
 * passando exatamente pelos vértices. `null` onde a grade não tem cota — o
 * gráfico quebra ali, não interpola.
 */
export function perfilAoLongo(
  cotaEmM: (p: Point) => number | null,
  vertices: Point[],
  passoMm = 250,
): PontoDoPerfil[] {
  const passo = Math.max(50, passoMm);
  const saida: PontoDoPerfil[] = [];
  if (vertices.length === 0) return saida;
  let acumulado = 0;
  const empurrar = (p: Point, dist: number) =>
    saida.push({ distM: dist / 1000, cotaM: cotaEmM(p), x: p.x, y: p.y });
  empurrar(vertices[0], 0);
  for (let i = 0; i + 1 < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[i + 1];
    const comp = Math.hypot(b.x - a.x, b.y - a.y);
    if (comp === 0) continue;
    for (let s = passo; s < comp; s += passo) {
      const t = s / comp;
      empurrar({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, acumulado + s);
    }
    acumulado += comp;
    empurrar(b, acumulado);
  }
  return saida;
}

export interface EstatisticasDoPerfil {
  comprimentoM: number;
  cotaInicioM: number | null;
  cotaFimM: number | null;
  cotaMinM: number | null;
  cotaMaxM: number | null;
  /** Fim − início. */
  desnivelM: number | null;
  /** Somas dos trechos que sobem e dos que descem. */
  subidaM: number;
  descidaM: number;
  /** |desnível| ÷ comprimento, em %. */
  declividadeMediaP: number | null;
  /** A maior entre trechos consecutivos com cota, em %. */
  declividadeMaxP: number;
  pontosSemCota: number;
}

export function estatisticasDoPerfil(perfil: PontoDoPerfil[]): EstatisticasDoPerfil {
  const comCota = perfil.filter((p) => p.cotaM !== null) as (PontoDoPerfil & { cotaM: number })[];
  const comprimentoM = perfil.length > 0 ? perfil[perfil.length - 1].distM : 0;
  let subida = 0;
  let descida = 0;
  let maxP = 0;
  for (let i = 0; i + 1 < perfil.length; i++) {
    const a = perfil[i];
    const b = perfil[i + 1];
    if (a.cotaM === null || b.cotaM === null) continue;
    const dz = b.cotaM - a.cotaM;
    const dd = b.distM - a.distM;
    if (dz > 0) subida += dz;
    else descida += -dz;
    if (dd > 0) maxP = Math.max(maxP, (Math.abs(dz) / dd) * 100);
  }
  // Início e fim são o PRIMEIRO e o ÚLTIMO ponto com cota, não as pontas da
  // linha: o corte quase sempre passa além do lote, e as pontas caem fora da
  // grade. Com as pontas cruas, desnível e declividade saíam vazios em toda
  // linha desenhada com folga — que é como toda linha de corte é desenhada.
  const primeiro = comCota[0] ?? null;
  const ultimo = comCota[comCota.length - 1] ?? null;
  const inicio = primeiro?.cotaM ?? null;
  const fim = ultimo?.cotaM ?? null;
  const desnivel = inicio !== null && fim !== null ? fim - inicio : null;
  const trechoComCotaM = primeiro && ultimo ? ultimo.distM - primeiro.distM : 0;
  return {
    comprimentoM,
    cotaInicioM: inicio,
    cotaFimM: fim,
    cotaMinM: comCota.length ? Math.min(...comCota.map((p) => p.cotaM)) : null,
    cotaMaxM: comCota.length ? Math.max(...comCota.map((p) => p.cotaM)) : null,
    desnivelM: desnivel,
    subidaM: subida,
    descidaM: descida,
    declividadeMediaP:
      desnivel !== null && trechoComCotaM > 0 ? (Math.abs(desnivel) / trechoComCotaM) * 100 : null,
    declividadeMaxP: maxP,
    pontosSemCota: perfil.length - comCota.length,
  };
}

// ── Hipsometria (fase 3) ──────────────────────────────────────────────────

/** Rampa clássica de 8 classes, do vale (verde) ao topo (vermelho). */
export const CORES_HIPSOMETRICAS: readonly string[] = [
  '#1a9850',
  '#66bd63',
  '#a6d96a',
  '#d9ef8b',
  '#fee08b',
  '#fdae61',
  '#f46d43',
  '#d73027',
];

export interface ClasseHipsometrica {
  deM: number;
  ateM: number;
  cor: string;
  areaM2: number;
}

export interface Hipsometria {
  classeDaCelula: (number | null)[];
  classes: ClasseHipsometrica[];
  minM: number;
  maxM: number;
}

/**
 * Classes de cota em intervalos iguais entre o mínimo e o máximo DENTRO do
 * lote. A célula vale pela cota média dos quatro cantos; a área conta só as
 * células com centro no lote (a folga da grade não é terreno de ninguém).
 */
export function hipsometriaDaGrade(grade: GradeDeElevacao, anel: Point[], nClasses = 8): Hipsometria {
  const { origem, espacamentoMm: esp, colunas, linhas } = grade;
  const areaCelM2 = (esp / 1000) ** 2;
  const n = Math.max(1, Math.min(nClasses, CORES_HIPSOMETRICAS.length));
  const cotas: (number | null)[] = [];
  const dentro: boolean[] = [];
  let min = Infinity;
  let max = -Infinity;
  for (let l = 0; l + 1 < linhas; l++) {
    for (let c = 0; c + 1 < colunas; c++) {
      const v = cotaMediaDaCelula(grade, l, c);
      cotas.push(v);
      const centro = { x: origem.x + (c + 0.5) * esp, y: origem.y + (l + 0.5) * esp };
      const noLote = anel.length < 3 || pointInPolygon(anel, centro);
      dentro.push(noLote);
      if (v !== null && noLote) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  if (!Number.isFinite(min)) return { classeDaCelula: cotas.map(() => null), classes: [], minM: 0, maxM: 0 };
  const largura = (max - min) / n;
  // Os índices de cor cobrem a rampa inteira mesmo com menos classes.
  const cor = (i: number) => CORES_HIPSOMETRICAS[Math.round((i / Math.max(1, n - 1)) * (CORES_HIPSOMETRICAS.length - 1))];
  const classes: ClasseHipsometrica[] = Array.from({ length: n }, (_, i) => ({
    deM: min + i * largura,
    ateM: i === n - 1 ? max : min + (i + 1) * largura,
    cor: cor(i),
    areaM2: 0,
  }));
  const classeDaCelula = cotas.map((v, i) => {
    if (v === null) return null;
    const k = largura > 0 ? Math.min(n - 1, Math.max(0, Math.floor((v - min) / largura))) : 0;
    if (dentro[i]) classes[k].areaM2 += areaCelM2;
    return k;
  });
  return { classeDaCelula, classes, minM: min, maxM: max };
}
