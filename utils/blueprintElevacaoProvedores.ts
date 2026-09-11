/**
 * FONTES DE ELEVAÇÃO — de onde a cota vem, com a proveniência que o PRD exige.
 *
 * ─── POR QUE UM REGISTRO, E NÃO UM `fetch` SOLTO NO HOOK ────────────────────
 *
 * RF-007 pede que cada fonte publique resolução, referência vertical, dataset,
 * licença e atribuição — e que isso apareça ANTES de gerar e DENTRO de toda
 * versão gravada. Se a escolha da fonte morasse no hook, a proveniência seria
 * texto copiado à mão, e a próxima fonte (SRTM 30 m atrás de uma Edge Function)
 * nasceria sem ela. Aqui a fonte É o registro; o hook só escolhe pelo código.
 *
 * ─── AS DUAS FONTES DESTA FATIA ─────────────────────────────────────────────
 *
 * `PONTOS_COTADOS` — o levantamento do topógrafo, digitado. É a fonte que serve
 * LOTE: um DEM público de 30–90 m mede a gleba, não o terreno de 12 × 30 m.
 *
 * `OPEN_METEO_GLO90` — Copernicus DEM GLO-90, servido pela API do Open-Meteo.
 * É a única fonte remota chamável DO NAVEGADOR hoje (medido em 10/09/2026:
 * responde com `access-control-allow-origin: *`; o OpenTopoData, que tem SRTM
 * 30 m, responde sem CORS). ⚠️ Licença: o DADO é livre com atribuição; a API é
 * gratuita para uso NÃO comercial — uso comercial exige assinatura. Decisão
 * jurídica pendente (emenda E-12 da reconciliação de 30/08); o piloto é interno.
 *
 * ─── ESTE MÓDULO NÃO CONHECE A GRADE ────────────────────────────────────────
 *
 * Recebe coordenadas, devolve cotas na mesma ordem. Quem sabe onde os nós estão
 * e o que fazer com `null` é `blueprintTopografia.ts`.
 */

import type { ClasseDeQualidade, LatLon } from './blueprintTopografia';

export type CodigoDaFonte = 'PONTOS_COTADOS' | 'OPEN_METEO_GLO90' | 'OPENTOPODATA_SRTM30';

export interface FonteDeElevacao {
  codigo: CodigoDaFonte;
  nome: string;
  /**
   * `API_PONTUAL`: chamada direta do navegador (o provedor tem CORS).
   * `API_FUNCTION`: atrás de uma Edge Function nossa (`funcao`), porque o
   * provedor não tem CORS — fase 8, SRTM 30 m pelo OpenTopoData.
   */
  tipo: 'LOCAL' | 'API_PONTUAL' | 'API_FUNCTION';
  funcao?: string;
  /** `null` = a precisão é a do levantamento, não uma célula. */
  resolucaoNominalM: number | null;
  /** Como o provedor declara; `null` = "não informada" (RF-007 / §15.4). */
  referenciaVertical: string | null;
  datasetVersao: string;
  licenca: string;
  atribuicao: string;
  classe: ClasseDeQualidade;
  /** Quantas coordenadas cabem numa requisição. Irrelevante para LOCAL. */
  maxPontosPorRequisicao: number;
  exigeGeorreferencia: boolean;
  /** O que a tela diz antes de gerar. */
  descricao: string;
}

export const FONTES: readonly FonteDeElevacao[] = [
  {
    codigo: 'PONTOS_COTADOS',
    nome: 'Pontos cotados do levantamento',
    tipo: 'LOCAL',
    resolucaoNominalM: null,
    referenciaVertical: null,
    datasetVersao: 'informado pelo usuário',
    licenca: 'do levantamento de origem',
    atribuicao: 'levantamento topográfico do próprio projeto',
    classe: 'LEVANTAMENTO_IMPORTADO',
    maxPontosPorRequisicao: Number.POSITIVE_INFINITY,
    exigeGeorreferencia: false,
    descricao:
      'Cotas digitadas em pontos do desenho (vértices do lote, pontos do levantamento). ' +
      'Entre os pontos o terreno é tomado como plano — é o que o topógrafo entrega.',
  },
  {
    codigo: 'OPEN_METEO_GLO90',
    nome: 'Copernicus DEM GLO-90 (Open-Meteo)',
    tipo: 'API_PONTUAL',
    resolucaoNominalM: 90,
    referenciaVertical: 'EGM2008 (declarada pelo Copernicus DEM)',
    datasetVersao: 'Copernicus DEM 2021 GLO-90',
    licenca:
      'Dado: Copernicus DEM, livre com atribuição. API Open-Meteo: CC BY 4.0, ' +
      'gratuita para uso não comercial — uso comercial exige assinatura.',
    atribuicao: 'Copernicus DEM © ESA / Open-Meteo.com',
    classe: 'PRELIMINAR_REMOTO',
    maxPontosPorRequisicao: 100,
    exigeGeorreferencia: true,
    descricao:
      'Modelo digital de elevação público com célula de 90 m. Serve gleba e loteamento; ' +
      'num lote urbano cabe inteiro dentro de uma célula e a fonte é recusada.',
  },
  {
    codigo: 'OPENTOPODATA_SRTM30',
    nome: 'SRTM 30 m (OpenTopoData)',
    tipo: 'API_FUNCTION',
    funcao: 'topografia-elevacao',
    resolucaoNominalM: 30,
    referenciaVertical: 'EGM96 (declarada pelo SRTM)',
    datasetVersao: 'SRTM 1 arc-second global (v3), via OpenTopoData srtm30m',
    licenca:
      'Dado: SRTM, domínio público (NASA/USGS). API OpenTopoData: uso livre com limite de taxa ' +
      '(1 requisição/s, 1000/dia no plano público) — passa pela nossa Edge Function porque o provedor não tem CORS.',
    atribuicao: 'SRTM (NASA/USGS) via OpenTopoData',
    classe: 'PRELIMINAR_REMOTO',
    maxPontosPorRequisicao: 100,
    exigeGeorreferencia: true,
    descricao:
      'Modelo digital de elevação público com célula de 30 m, três vezes mais fino que o GLO-90. ' +
      'Serve gleba grande; num lote urbano ainda é recusado (lado menor < 90 m).',
  },
];

export function fonteDeElevacao(codigo: CodigoDaFonte): FonteDeElevacao {
  const f = FONTES.find((x) => x.codigo === codigo);
  if (!f) throw new Error(`fonte de elevação desconhecida: ${codigo}`);
  return f;
}

/** O provedor não respondeu, ou respondeu algo que não é uma lista de cotas. */
export class FonteIndisponivel extends Error {
  constructor(
    readonly fonte: CodigoDaFonte,
    readonly causa: string,
  ) {
    super(`A fonte ${fonte} não respondeu como esperado: ${causa}`);
    this.name = 'FonteIndisponivel';
  }
}

const URL_OPEN_METEO = 'https://api.open-meteo.com/v1/elevation';

/**
 * Cotas para as coordenadas, na mesma ordem, em lotes do tamanho que a fonte
 * aceita. `fetchFn` é injetável para o teste não sair para a rede.
 *
 * ⚠️ Falha vira exceção, nunca zero: uma requisição que falhou no meio deixaria
 * metade da grade em cota 0 e a curva de nível desceria um penhasco inexistente.
 * Quem chama decide se tenta de novo (CA-009).
 */
/**
 * Chama uma Edge Function nossa e devolve o corpo. Injetável: o teste não sai
 * para a rede, e o hook passa `supabase.functions.invoke`.
 */
export type InvocarFuncao = (nome: string, corpo: unknown) => Promise<{ data: unknown; error: { message: string } | null }>;

/** Entre lotes de uma fonte atrás de function: o provedor público limita a 1 req/s. */
const RESPIRO_ENTRE_LOTES_MS = 1100;

export async function amostrarRemoto(
  fonte: FonteDeElevacao,
  coordenadas: LatLon[],
  fetchFn: typeof fetch = fetch,
  invocar?: InvocarFuncao,
  esperar: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<(number | null)[]> {
  if (fonte.tipo !== 'API_PONTUAL' && fonte.tipo !== 'API_FUNCTION') {
    throw new Error(`a fonte ${fonte.codigo} não é remota`);
  }
  if (fonte.tipo === 'API_FUNCTION' && !invocar) {
    throw new Error(`a fonte ${fonte.codigo} precisa de uma function para ser chamada`);
  }
  const saida: (number | null)[] = [];
  const tamanho = fonte.maxPontosPorRequisicao;

  for (let i = 0; i < coordenadas.length; i += tamanho) {
    const lote = coordenadas.slice(i, i + tamanho);
    if (fonte.tipo === 'API_FUNCTION') {
      if (i > 0) await esperar(RESPIRO_ENTRE_LOTES_MS);
      saida.push(...(await loteFuncao(fonte, lote, invocar!)));
    } else {
      saida.push(...(await loteOpenMeteo(fonte, lote, fetchFn)));
    }
  }
  return saida;
}

async function loteFuncao(fonte: FonteDeElevacao, lote: LatLon[], invocar: InvocarFuncao): Promise<(number | null)[]> {
  let resposta: { data: unknown; error: { message: string } | null };
  try {
    resposta = await invocar(fonte.funcao ?? '', { coordenadas: lote.map((c) => ({ lat: c.lat, lon: c.lon })) });
  } catch (e) {
    throw new FonteIndisponivel(fonte.codigo, e instanceof Error ? e.message : String(e));
  }
  if (resposta.error) throw new FonteIndisponivel(fonte.codigo, resposta.error.message);
  const elevation = (resposta.data as { elevation?: unknown; error?: unknown })?.elevation;
  if (!Array.isArray(elevation) || elevation.length !== lote.length) {
    const erro = (resposta.data as { error?: unknown })?.error;
    throw new FonteIndisponivel(
      fonte.codigo,
      typeof erro === 'string' ? erro : `esperava ${lote.length} cotas, veio ${Array.isArray(elevation) ? elevation.length : 'nada'}`,
    );
  }
  return elevation.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null));
}

async function loteOpenMeteo(
  fonte: FonteDeElevacao,
  lote: LatLon[],
  fetchFn: typeof fetch,
): Promise<(number | null)[]> {
  const lat = lote.map((c) => c.lat.toFixed(6)).join(',');
  const lon = lote.map((c) => c.lon.toFixed(6)).join(',');
  const url = `${URL_OPEN_METEO}?latitude=${lat}&longitude=${lon}`;

  let resposta: Response;
  try {
    resposta = await fetchFn(url);
  } catch (e) {
    throw new FonteIndisponivel(fonte.codigo, e instanceof Error ? e.message : String(e));
  }
  if (!resposta.ok) throw new FonteIndisponivel(fonte.codigo, `HTTP ${resposta.status}`);

  let corpo: unknown;
  try {
    corpo = await resposta.json();
  } catch {
    throw new FonteIndisponivel(fonte.codigo, 'resposta não é JSON');
  }
  const elevation = (corpo as { elevation?: unknown })?.elevation;
  if (!Array.isArray(elevation) || elevation.length !== lote.length) {
    throw new FonteIndisponivel(
      fonte.codigo,
      `esperava ${lote.length} cotas, veio ${Array.isArray(elevation) ? elevation.length : 'nada'}`,
    );
  }
  return elevation.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null));
}
