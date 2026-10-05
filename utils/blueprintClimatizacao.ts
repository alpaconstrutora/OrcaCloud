/**
 * CLIMATIZAÇÃO — premissas do estudo (04/10/2026, E0.1/E0.2 do roadmap
 * `docs/planos/2026-10-04-climatizacao-benchmark-altoqi-e-roadmap.md`).
 *
 * Só o que o projetista DECIDE mora aqui; a carga térmica, o equipamento e a
 * rede são derivados (E2 em diante). O JSON gravado é parcial e é completado
 * com o padrão na leitura — o mesmo molde de `blueprintIncendioClassificacao`.
 *
 * Três grupos:
 *  - `conforto` (E0.1): condições internas de projeto;
 *  - `clima` (E0.2): a cidade e as condições externas declaradas — o que não
 *    foi declarado é DERIVADO por `condicoesExternas` (cidade do contexto,
 *    capital mais próxima pela georreferência, altitude da georreferência);
 *  - `insolacao` (E0.2, achado 5): data, hora solar, latitude suposta e sol no
 *    3D, que até aqui moravam só no navegador (`blueprint:insolacao`) e faziam
 *    o mesmo estudo calcular diferente em outra máquina.
 *
 * ⚠️ CONFERIR NA NORMA: os padrões de conforto (24 °C, 50 %) e a tabela de
 * condições externas por capital são HIPÓTESE DECLARADA / TRANSCRIÇÃO DE
 * MEMÓRIA, não a tabela da norma. A faixa de conforto é a da NBR 16401-2 e as
 * condições externas de projeto são o Anexo A da NBR 16401-1 — os PDFs não
 * estão no repositório. O valor declarado vale sobre a tabela, sempre.
 */
import { DATAS_DE_REFERENCIA, LATITUDE_PADRAO } from './blueprintInsolacao';
import { ambientesDaColuna, type HipotesesDoAmbiente } from './blueprintClimatizacaoAmbientes';

// ─── Conforto (E0.1) ─────────────────────────────────────────────────────────

/** Condições internas de projeto — valem para todos os ambientes climatizados do estudo. */
export interface HipotesesDeConforto {
  /** Temperatura interna de projeto (bulbo seco), °C. */
  temperaturaInternaC: number;
  /** Umidade relativa interna de projeto, %. */
  umidadeRelativaPct: number;
}

/** Limites do que se aceita como premissa: fora disto é erro de digitação, não projeto. */
export const LIMITES_DE_CONFORTO = {
  temperaturaInternaC: { min: 16, max: 30 },
  umidadeRelativaPct: { min: 30, max: 70 },
} as const;

export const HIPOTESES_DE_CONFORTO_PADRAO: HipotesesDeConforto = { temperaturaInternaC: 24, umidadeRelativaPct: 50 };

/** Fonte declarada de cada padrão — aparece no painel e, depois, no memorial. */
export const FONTE_DO_CONFORTO = 'Hipótese de projeto (verão). CONFERIR NA NORMA: NBR 16401-2.';

// ─── Clima externo (E0.2) ────────────────────────────────────────────────────

/**
 * O que o projetista declara sobre o clima. `null` = derivar: a cidade pelo
 * contexto urbanístico ou pela georreferência; TBS/TBU pela tabela da cidade;
 * a altitude pela georreferência ou pela tabela.
 */
export interface HipotesesDeClima {
  /** Nome da cidade na `CLIMA_POR_CIDADE`; `null` = nenhuma escolhida. */
  cidade: string | null;
  /** Temperatura de bulbo seco externa de projeto (verão), °C. */
  tbsExternaC: number | null;
  /** Temperatura de bulbo úmido externa coincidente, °C. */
  tbuExternaC: number | null;
  /** Altitude do local, m. */
  altitudeM: number | null;
}

export const HIPOTESES_DE_CLIMA_PADRAO: HipotesesDeClima = { cidade: null, tbsExternaC: null, tbuExternaC: null, altitudeM: null };

export const LIMITES_DO_CLIMA = {
  tbsExternaC: { min: 20, max: 48 },
  tbuExternaC: { min: 10, max: 35 },
  altitudeM: { min: -50, max: 4000 },
} as const;

export interface ClimaDaCidade {
  /** TBS de projeto de verão, °C. */
  tbsC: number;
  /** TBU coincidente, °C. */
  tbuC: number;
  altitudeM: number;
  latitude: number;
  longitude: number;
}

/**
 * Condições externas de projeto (verão) por capital — a mesma lista de cidades
 * da tabela de chuvas do pluvial (`INTENSIDADE_POR_CIDADE`), para o estudo
 * escolher UMA cidade e as duas disciplinas concordarem.
 *
 * ⚠️ TRANSCRITA DE MEMÓRIA — CONFERIR NA NORMA (NBR 16401-1, Anexo A, frequência
 * anual de 1 %) antes de emitir. Está num lugar só; na dúvida, declare TBS/TBU
 * no estudo (o declarado vale sobre a tabela). Latitude/longitude são do centro
 * da cidade e servem só para achar a capital mais próxima.
 */
export const CLIMA_POR_CIDADE: Readonly<Record<string, ClimaDaCidade>> = {
  'Belém': { tbsC: 33.4, tbuC: 26.4, altitudeM: 10, latitude: -1.46, longitude: -48.5 },
  'Belo Horizonte': { tbsC: 31.7, tbuC: 21.3, altitudeM: 850, latitude: -19.92, longitude: -43.94 },
  'Cuiabá': { tbsC: 37.3, tbuC: 24.7, altitudeM: 165, latitude: -15.6, longitude: -56.1 },
  'Curitiba': { tbsC: 30.0, tbuC: 21.0, altitudeM: 935, latitude: -25.43, longitude: -49.27 },
  'Florianópolis': { tbsC: 31.6, tbuC: 24.8, altitudeM: 5, latitude: -27.6, longitude: -48.55 },
  'Fortaleza': { tbsC: 32.3, tbuC: 25.6, altitudeM: 20, latitude: -3.72, longitude: -38.54 },
  'Goiânia': { tbsC: 34.1, tbuC: 21.7, altitudeM: 750, latitude: -16.69, longitude: -49.26 },
  'Manaus': { tbsC: 35.3, tbuC: 26.2, altitudeM: 90, latitude: -3.12, longitude: -60.02 },
  'Porto Alegre': { tbsC: 34.4, tbuC: 24.1, altitudeM: 10, latitude: -30.03, longitude: -51.23 },
  'Rio de Janeiro': { tbsC: 35.8, tbuC: 25.2, altitudeM: 5, latitude: -22.91, longitude: -43.17 },
  'Salvador': { tbsC: 32.0, tbuC: 25.1, altitudeM: 50, latitude: -12.97, longitude: -38.51 },
  'São Paulo': { tbsC: 31.9, tbuC: 21.7, altitudeM: 760, latitude: -23.55, longitude: -46.63 },
  'Vitória': { tbsC: 33.6, tbuC: 25.5, altitudeM: 5, latitude: -20.32, longitude: -40.34 },
};

export const FONTE_DO_CLIMA = 'Tabela transcrita de memória. CONFERIR NA NORMA: NBR 16401-1, Anexo A (frequência 1 %).';

/** Quando a capital mais próxima está além disto, a tabela orienta mas não serve de projeto. */
export const DISTANCIA_MAXIMA_DA_CAPITAL_KM = 300;

export type OrigemDoClima = 'DECLARADA' | 'CONTEXTO' | 'MAIS_PROXIMA' | 'TABELA' | 'GEORREFERENCIA' | 'SEM';

export interface ValorComOrigem<T> {
  valor: T | null;
  origem: OrigemDoClima;
}

export interface CondicoesExternas {
  cidade: ValorComOrigem<string> & { naTabela: boolean; distanciaKm: number | null };
  tbsC: ValorComOrigem<number>;
  tbuC: ValorComOrigem<number>;
  altitudeM: ValorComOrigem<number>;
  /** Latitude para a insolação: georreferência > tabela da cidade > nada (o painel usa a manual). */
  latitude: ValorComOrigem<number>;
  /** Algum valor veio da tabela de memória — a tela e o memorial dizem CONFERIR NA NORMA. */
  conferir: boolean;
  /** O que falta para o clima fechar, em frases. */
  pendencias: string[];
}

export interface ContextoDoClima {
  georreferencia?: { latitude: number; longitude: number; elevacaoM?: number | null } | null;
  /** A cidade do contexto urbanístico (empreendimento ou catálogo), quando há. */
  cidadeDoContexto?: string | null;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** O nome da tabela que casa com o texto (sem acento, sem caixa); `null` se não há. */
export function cidadeDaTabela(nome: string | null | undefined): string | null {
  if (!nome) return null;
  const alvo = semAcento(nome);
  return Object.keys(CLIMA_POR_CIDADE).find((c) => semAcento(c) === alvo) ?? null;
}

/** Distância em km pelo grande círculo (haversine) — basta para escolher a capital mais próxima. */
export function distanciaKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}

export function capitalMaisProxima(p: { latitude: number; longitude: number }): { cidade: string; distanciaKm: number } | null {
  let melhor: { cidade: string; distanciaKm: number } | null = null;
  for (const [cidade, c] of Object.entries(CLIMA_POR_CIDADE)) {
    const d = distanciaKm(p, c);
    if (!melhor || d < melhor.distanciaKm) melhor = { cidade, distanciaKm: d };
  }
  return melhor;
}

/**
 * As condições externas em vigor: o declarado vence; o resto é derivado, e cada
 * número diz de onde veio. Nunca inventa: sem cidade e sem declaração, TBS/TBU
 * ficam `null` e a pendência diz o que falta.
 */
export function condicoesExternas(hip: HipotesesDeClima, ctx: ContextoDoClima = {}): CondicoesExternas {
  const pendencias: string[] = [];
  const geo = ctx.georreferencia ?? null;

  // 1. A cidade.
  let cidade: CondicoesExternas['cidade'];
  const declarada = cidadeDaTabela(hip.cidade);
  const doContexto = cidadeDaTabela(ctx.cidadeDoContexto);
  if (hip.cidade && declarada) cidade = { valor: declarada, origem: 'DECLARADA', naTabela: true, distanciaKm: null };
  else if (hip.cidade) cidade = { valor: hip.cidade, origem: 'DECLARADA', naTabela: false, distanciaKm: null };
  else if (doContexto) cidade = { valor: doContexto, origem: 'CONTEXTO', naTabela: true, distanciaKm: null };
  else if (geo) {
    const prox = capitalMaisProxima(geo);
    cidade = prox
      ? { valor: prox.cidade, origem: 'MAIS_PROXIMA', naTabela: true, distanciaKm: prox.distanciaKm }
      : { valor: null, origem: 'SEM', naTabela: false, distanciaKm: null };
    if (prox && prox.distanciaKm > DISTANCIA_MAXIMA_DA_CAPITAL_KM) {
      pendencias.push(`A capital mais próxima (${prox.cidade}) está a ${prox.distanciaKm} km — declare a cidade ou as temperaturas externas.`);
    }
  } else if (ctx.cidadeDoContexto) {
    // Cidade conhecida, mas fora da tabela: não há número para ela.
    cidade = { valor: ctx.cidadeDoContexto, origem: 'CONTEXTO', naTabela: false, distanciaKm: null };
  } else cidade = { valor: null, origem: 'SEM', naTabela: false, distanciaKm: null };

  const tabela = cidade.naTabela && cidade.valor ? CLIMA_POR_CIDADE[cidade.valor] : null;
  if (cidade.valor && !cidade.naTabela) pendencias.push(`"${cidade.valor}" não está na tabela de clima: declare TBS e TBU externas.`);
  if (!cidade.valor) pendencias.push('Sem cidade nem georreferência: escolha a cidade ou declare TBS e TBU externas.');

  // 2. Os números: declarado > tabela (> georreferência, na altitude).
  const tbsC: ValorComOrigem<number> =
    hip.tbsExternaC != null ? { valor: hip.tbsExternaC, origem: 'DECLARADA' } : tabela ? { valor: tabela.tbsC, origem: 'TABELA' } : { valor: null, origem: 'SEM' };
  const tbuC: ValorComOrigem<number> =
    hip.tbuExternaC != null ? { valor: hip.tbuExternaC, origem: 'DECLARADA' } : tabela ? { valor: tabela.tbuC, origem: 'TABELA' } : { valor: null, origem: 'SEM' };
  const altitudeM: ValorComOrigem<number> =
    hip.altitudeM != null
      ? { valor: hip.altitudeM, origem: 'DECLARADA' }
      : geo?.elevacaoM != null
        ? { valor: geo.elevacaoM, origem: 'GEORREFERENCIA' }
        : tabela
          ? { valor: tabela.altitudeM, origem: 'TABELA' }
          : { valor: null, origem: 'SEM' };
  const latitude: ValorComOrigem<number> = geo ? { valor: geo.latitude, origem: 'GEORREFERENCIA' } : tabela ? { valor: tabela.latitude, origem: 'TABELA' } : { valor: null, origem: 'SEM' };

  if (tbsC.valor == null && !pendencias.some((p) => p.includes('TBS'))) pendencias.push('Sem temperatura externa de projeto (TBS).');
  if (tbuC.valor != null && tbsC.valor != null && tbuC.valor > tbsC.valor) pendencias.push('TBU maior que TBS: confira as temperaturas externas.');

  const conferir = [tbsC, tbuC, altitudeM].some((v) => v.origem === 'TABELA');
  return { cidade, tbsC, tbuC, altitudeM, latitude, conferir, pendencias };
}

// ─── Insolação do estudo (E0.2, achado 5) ────────────────────────────────────

/** O que a gaveta de insolação ajusta e que vale para o ESTUDO (os vizinhos têm tabela própria, `blueprint_study_entorno`). */
export interface HipotesesDeInsolacaoDoEstudo {
  /** 'YYYY-MM-DD'. */
  data: string;
  horaSolar: number;
  /** Latitude usada quando o estudo não tem georreferência. */
  latitudeManual: number;
  solNo3d: boolean;
}

export const HIPOTESES_DE_INSOLACAO_DO_ESTUDO_PADRAO: HipotesesDeInsolacaoDoEstudo = {
  data: DATAS_DE_REFERENCIA.INVERNO.data,
  horaSolar: 9,
  latitudeManual: LATITUDE_PADRAO,
  solNo3d: true,
};

/** A chave que o navegador usava antes da E0.2 (e continua usando para os vizinhos legados). */
export const CHAVE_DA_INSOLACAO_NO_NAVEGADOR = 'blueprint:insolacao';

// ─── Hipóteses do MOTOR de carga térmica (E2) ────────────────────────────────

/**
 * Toda folga e todo "valor típico" que o motor usa quando o desenho não
 * declarou — e que o projetista pode trocar. ⚠️ Todos são HIPÓTESE, transcritos
 * de memória — CONFERIR NA NORMA (NBR 16655-3; NBR 16401-1 para ocupação e
 * renovação; NBR 15220 para os U típicos). O declarado no desenho (camadas com
 * λ, vidro) vence sempre; estes só entram onde falta declaração, e a parcela
 * sai marcada "hipótese".
 */
export interface HipotesesDoMotor {
  /** U típico de parede sem camadas/λ declarados, W/m²·K. */
  uParedePadraoWm2K: number;
  /** U típico de cobertura (telha + laje) sem camadas, W/m²·K. */
  uCoberturaPadraoWm2K: number;
  /** U típico de laje (entre pavimentos ou exposta) sem camadas, W/m²·K. */
  uLajePadraoWm2K: number;
  /** U típico de vidro simples com caixilho, W/m²·K. */
  uVidroPadraoWm2K: number;
  /** U típico de porta opaca, W/m²·K. */
  uPortaPadraoWm2K: number;
  /** Fator solar típico de vidro simples incolor. */
  fatorSolarPadrao: number;
  /** Acréscimo de temperatura equivalente da cobertura ao sol, K (temperatura sol-ar simplificada). */
  acrescimoSolarCoberturaK: number;
  /** Acréscimo de temperatura equivalente da parede externa ao sol, K, na orientação mais exposta; as outras seguem `PESO_SOLAR_DA_ORIENTACAO`. */
  acrescimoSolarParedeK: number;
  /** Fração do ΔT externo que vale para ambiente vizinho NÃO climatizado (0–1). */
  fracaoDeltaTNaoClimatizado: number;
  /** Renovação por infiltração, trocas de ar por hora. */
  trocasDeArPorHora: number;
  /** Fator de uso da iluminação e dos equipamentos (0–1). */
  fatorDeUsoInterno: number;
}

export const HIPOTESES_DO_MOTOR_PADRAO: HipotesesDoMotor = {
  uParedePadraoWm2K: 2.5,
  uCoberturaPadraoWm2K: 2.0,
  uLajePadraoWm2K: 3.0,
  uVidroPadraoWm2K: 5.7,
  uPortaPadraoWm2K: 2.0,
  fatorSolarPadrao: 0.87,
  acrescimoSolarCoberturaK: 10,
  acrescimoSolarParedeK: 6,
  fracaoDeltaTNaoClimatizado: 0.5,
  trocasDeArPorHora: 0.5,
  fatorDeUsoInterno: 1,
};

export const LIMITES_DO_MOTOR: Record<keyof HipotesesDoMotor, { min: number; max: number }> = {
  uParedePadraoWm2K: { min: 0.1, max: 10 },
  uCoberturaPadraoWm2K: { min: 0.1, max: 10 },
  uLajePadraoWm2K: { min: 0.1, max: 10 },
  uVidroPadraoWm2K: { min: 0.1, max: 10 },
  uPortaPadraoWm2K: { min: 0.1, max: 10 },
  fatorSolarPadrao: { min: 0.05, max: 1 },
  acrescimoSolarCoberturaK: { min: 0, max: 30 },
  acrescimoSolarParedeK: { min: 0, max: 20 },
  fracaoDeltaTNaoClimatizado: { min: 0, max: 1 },
  trocasDeArPorHora: { min: 0, max: 10 },
  fatorDeUsoInterno: { min: 0, max: 1 },
};

export const FONTE_DO_MOTOR = 'Valores típicos de projeto, transcritos de memória. CONFERIR NA NORMA: NBR 16655-3 (cargas), NBR 16401-1 (ocupação e renovação), NBR 15220 (U típicos).';

export function hipotesesDoMotorDaColuna(raw: unknown): HipotesesDoMotor {
  const r = objeto(raw);
  const saida = { ...HIPOTESES_DO_MOTOR_PADRAO };
  for (const k of Object.keys(HIPOTESES_DO_MOTOR_PADRAO) as (keyof HipotesesDoMotor)[]) saida[k] = numeroNaFaixa(r[k], LIMITES_DO_MOTOR[k], HIPOTESES_DO_MOTOR_PADRAO[k]);
  return saida;
}

// ─── E4.1 (04/10/2026): a SELEÇÃO do equipamento ─────────────────────────────

/**
 * Como a carga vira equipamento (E4.1). FOLGAS de projeto, editáveis — nunca
 * constante escondida: a folga de seleção sobre a carga calculada, o quanto
 * acima dela já é superdimensionado, a eficiência típica para estimar a potência
 * elétrica de quem não tem placa, e o tipo de evaporadora que o planejador
 * prefere. Tabela de fabricante é HIPÓTESE — CONFERIR com o catálogo real.
 */
export interface HipotesesDeSelecao {
  /** Folga sobre a carga calculada, % (necessário = carga × (1 + folga)). */
  folgaPct: number;
  /** Acima de carga × (1 + super) o equipamento é SUPERDIMENSIONADO, %. */
  superPct: number;
  /** Eficiência típica (EER, W/W) para estimar a potência elétrica sem placa. */
  eerWW: number;
  /** O tipo de evaporadora que a seleção automática prefere. */
  tipoPreferido: 'EVAPORADORA_HI_WALL' | 'EVAPORADORA_PISO_TETO' | 'EVAPORADORA_CASSETE' | 'EVAPORADORA_DUTADA';
}

export const HIPOTESES_DE_SELECAO_PADRAO: HipotesesDeSelecao = { folgaPct: 10, superPct: 50, eerWW: 3.0, tipoPreferido: 'EVAPORADORA_HI_WALL' };

export const LIMITES_DE_SELECAO: Record<'folgaPct' | 'superPct' | 'eerWW', { min: number; max: number }> = {
  folgaPct: { min: 0, max: 50 },
  superPct: { min: 10, max: 200 },
  eerWW: { min: 1.5, max: 7 },
};

const TIPOS_PREFERIVEIS: readonly HipotesesDeSelecao['tipoPreferido'][] = ['EVAPORADORA_HI_WALL', 'EVAPORADORA_PISO_TETO', 'EVAPORADORA_CASSETE', 'EVAPORADORA_DUTADA'];

export function hipotesesDeSelecaoDaColuna(raw: unknown): HipotesesDeSelecao {
  const r = objeto(raw);
  const p = HIPOTESES_DE_SELECAO_PADRAO;
  return {
    folgaPct: numeroNaFaixa(r.folgaPct, LIMITES_DE_SELECAO.folgaPct, p.folgaPct),
    superPct: numeroNaFaixa(r.superPct, LIMITES_DE_SELECAO.superPct, p.superPct),
    eerWW: numeroNaFaixa(r.eerWW, LIMITES_DE_SELECAO.eerWW, p.eerWW),
    tipoPreferido: TIPOS_PREFERIVEIS.includes(r.tipoPreferido as HipotesesDeSelecao['tipoPreferido']) ? (r.tipoPreferido as HipotesesDeSelecao['tipoPreferido']) : p.tipoPreferido,
  };
}

// ─── O conjunto e o leitor da coluna ─────────────────────────────────────────

export interface HipotesesClimatizacao {
  conforto: HipotesesDeConforto;
  clima: HipotesesDeClima;
  insolacao: HipotesesDeInsolacaoDoEstudo;
  /** E0.3: o declarado por ambiente, pelo `uid` da etiqueta (ver `blueprintClimatizacaoAmbientes`). */
  ambientes: Record<string, HipotesesDoAmbiente>;
  /** E2: as hipóteses do motor de carga térmica. */
  motor: HipotesesDoMotor;
  /** E4.1: como a carga vira equipamento (folga, superdimensionamento, EER, tipo preferido). */
  selecao: HipotesesDeSelecao;
}

export const HIPOTESES_CLIMATIZACAO_PADRAO: HipotesesClimatizacao = {
  conforto: HIPOTESES_DE_CONFORTO_PADRAO,
  clima: HIPOTESES_DE_CLIMA_PADRAO,
  insolacao: HIPOTESES_DE_INSOLACAO_DO_ESTUDO_PADRAO,
  ambientes: {},
  motor: HIPOTESES_DO_MOTOR_PADRAO,
  selecao: HIPOTESES_DE_SELECAO_PADRAO,
};

const numeroNaFaixa = (x: unknown, faixa: { min: number; max: number }, padrao: number): number =>
  typeof x === 'number' && Number.isFinite(x) && x >= faixa.min && x <= faixa.max ? x : padrao;
const numeroNaFaixaOuNulo = (x: unknown, faixa: { min: number; max: number }): number | null =>
  typeof x === 'number' && Number.isFinite(x) && x >= faixa.min && x <= faixa.max ? x : null;
const objeto = (raw: unknown): Record<string, unknown> => (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

export function hipotesesDeConfortoDaColuna(raw: unknown): HipotesesDeConforto {
  const r = objeto(raw);
  return {
    temperaturaInternaC: numeroNaFaixa(r.temperaturaInternaC, LIMITES_DE_CONFORTO.temperaturaInternaC, HIPOTESES_DE_CONFORTO_PADRAO.temperaturaInternaC),
    umidadeRelativaPct: numeroNaFaixa(r.umidadeRelativaPct, LIMITES_DE_CONFORTO.umidadeRelativaPct, HIPOTESES_DE_CONFORTO_PADRAO.umidadeRelativaPct),
  };
}

export function hipotesesDeClimaDaColuna(raw: unknown): HipotesesDeClima {
  const r = objeto(raw);
  return {
    cidade: typeof r.cidade === 'string' && r.cidade.trim() ? r.cidade.trim() : null,
    tbsExternaC: numeroNaFaixaOuNulo(r.tbsExternaC, LIMITES_DO_CLIMA.tbsExternaC),
    tbuExternaC: numeroNaFaixaOuNulo(r.tbuExternaC, LIMITES_DO_CLIMA.tbuExternaC),
    altitudeM: numeroNaFaixaOuNulo(r.altitudeM, LIMITES_DO_CLIMA.altitudeM),
  };
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const dataValida = (x: unknown): x is string => typeof x === 'string' && DATA_ISO.test(x) && !Number.isNaN(new Date(`${x}T12:00:00Z`).getTime());

export function hipotesesDeInsolacaoDaColuna(raw: unknown): HipotesesDeInsolacaoDoEstudo {
  const r = objeto(raw);
  const p = HIPOTESES_DE_INSOLACAO_DO_ESTUDO_PADRAO;
  return {
    data: dataValida(r.data) ? r.data : p.data,
    horaSolar: numeroNaFaixa(r.horaSolar, { min: 0, max: 24 }, p.horaSolar),
    latitudeManual: numeroNaFaixa(r.latitudeManual, { min: -90, max: 90 }, p.latitudeManual),
    solNo3d: typeof r.solNo3d === 'boolean' ? r.solNo3d : p.solNo3d,
  };
}

/** O JSON gravado, completado com o padrão. Valor de tipo errado ou fora da faixa vira o padrão; nada estranho passa. */
export function hipotesesClimatizacaoDaColuna(raw: unknown): HipotesesClimatizacao {
  const r = objeto(raw);
  return {
    conforto: hipotesesDeConfortoDaColuna(r.conforto),
    clima: hipotesesDeClimaDaColuna(r.clima),
    insolacao: hipotesesDeInsolacaoDaColuna(r.insolacao),
    ambientes: ambientesDaColuna(r.ambientes),
    motor: hipotesesDoMotorDaColuna(r.motor),
    selecao: hipotesesDeSelecaoDaColuna(r.selecao),
  };
}

// ─── O navegador (antes da E0.2) ─────────────────────────────────────────────

/**
 * O que este navegador tinha na chave antiga; `null` se nada. O leitor é
 * injetável para o teste não depender de `localStorage`.
 */
export function insolacaoDoNavegador(ler: (chave: string) => string | null = (k) => (typeof window === 'undefined' ? null : localStorage.getItem(k))): HipotesesDeInsolacaoDoEstudo | null {
  let s: string | null;
  try {
    s = ler(CHAVE_DA_INSOLACAO_NO_NAVEGADOR);
  } catch {
    return null;
  }
  if (!s) return null;
  try {
    return hipotesesDeInsolacaoDaColuna(JSON.parse(s));
  } catch {
    return null;
  }
}

/** Grava na chave antiga SEM apagar os vizinhos legados que ela ainda guarda. */
export function gravarInsolacaoNoNavegador(h: HipotesesDeInsolacaoDoEstudo): void {
  if (typeof window === 'undefined') return;
  try {
    const atual = objeto(JSON.parse(localStorage.getItem(CHAVE_DA_INSOLACAO_NO_NAVEGADOR) ?? '{}'));
    localStorage.setItem(CHAVE_DA_INSOLACAO_NO_NAVEGADOR, JSON.stringify({ ...atual, ...h }));
  } catch {
    // navegador sem armazenamento: vale só na sessão
  }
}
