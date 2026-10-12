/**
 * MAPA DE FUNDO DA PLANTA (12/10/2026) — a parte PURA.
 *
 * Pedido: *"nao seria melhor no painel lateral … camada terreno trazer as duas
 * camadas (relevo e ruas)"*. As ruas (OpenStreetMap) e o relevo (OpenTopoMap)
 * aparecem por baixo da planta, como camadas do Terreno no painel. Plano:
 * docs/planos/2026-10-12-camadas-mapa-de-fundo.md.
 *
 * O desenho está em milímetros num plano tangente ("Onde fica" = a origem); o
 * mapa está em ladrilhos Web Mercator. Cada ladrilho entra pela composição
 * pixel do ladrilho → lat/lon (Mercator inverso, exato) → mm (`geoParaLocal`,
 * com o giro do norte). Num ladrilho de zoom ≥ 12 a curvatura da Mercator
 * dentro dele é desprezível: três cantos definem a afim.
 *
 * Por que estado PRÓPRIO e não um `Camada` a mais: as camadas são de PEÇAS
 * (`classificarPecas`), e o grupo "TERRENO" tem o mesmo id da camada
 * "TERRENO" — uma subcamada nova exigiria renomear e mexeria em estado gravado.
 */
import type { Georreferencia, Point } from './blueprintKernel';
import { geoParaLocal, localParaGeo, type LatLon } from './blueprintTopografia';
import type { EstadoDaCamada } from './blueprintCamadasPorDisciplina';

export type FonteDoMapa = 'RUAS' | 'RELEVO';
/** Ruas embaixo, relevo por cima — a ordem de desenho. */
export const FONTES_DO_MAPA: readonly FonteDoMapa[] = ['RUAS', 'RELEVO'];

export interface DefinicaoDaFonteDoMapa {
  rotulo: string;
  ajuda: string;
  /** Modelo do Leaflet: `{s}` subdomínio, `{z}/{x}/{y}` o ladrilho. */
  url: string;
  subdominios: readonly string[];
  /** Até onde o servidor tem ladrilho; acima disso, amplia-se o último. */
  maxNativeZoom: number;
  /** Atribuição exigida pela licença, em HTML (o Leaflet) e em texto (o canvas). */
  atribuicaoHtml: string;
  atribuicaoTexto: string;
}

export const FONTE_DO_MAPA: Record<FonteDoMapa, DefinicaoDaFonteDoMapa> = {
  RUAS: {
    rotulo: 'Mapa: ruas',
    ajuda: 'Ruas, rios e quadras do OpenStreetMap por baixo da planta, no lugar de "Onde fica". Referência, não levantamento: em área rural o traçado pode estar alguns metros fora.',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdominios: ['a', 'b', 'c'],
    maxNativeZoom: 19,
    atribuicaoHtml: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    atribuicaoTexto: '© OpenStreetMap',
  },
  RELEVO: {
    rotulo: 'Mapa: relevo',
    ajuda: 'Relevo sombreado com curvas do OpenTopoMap (SRTM) por baixo da planta. O servidor vai até o zoom 17; mais perto, a imagem é ampliada.',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdominios: ['a', 'b', 'c'],
    maxNativeZoom: 17,
    atribuicaoHtml:
      'Mapa: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM · Estilo: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    atribuicaoTexto: '© OpenStreetMap, SRTM · OpenTopoMap (CC-BY-SA)',
  },
};

// ── Estado (o painel) ───────────────────────────────────────────────────────

export type EstadosDoMapa = Record<FonteDoMapa, EstadoDaCamada>;

/** Ocultos por padrão: o mapa baixa imagem da internet e não liga sozinho. */
export const MAPA_OCULTO: EstadosDoMapa = { RUAS: 'OCULTA', RELEVO: 'OCULTA' };

/** Meio-tom do mapa: claro o bastante para o desenho e as curvas lerem por cima. */
export const OPACIDADE_DO_MAPA: Record<EstadoDaCamada, number> = { VISIVEL: 1, ATENUADA: 0.45, OCULTA: 0 };

export function sanearEstadosDoMapa(raw: unknown): EstadosDoMapa {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const ok = (v: unknown): v is EstadoDaCamada => v === 'VISIVEL' || v === 'ATENUADA' || v === 'OCULTA';
  return { RUAS: ok(o.RUAS) ? o.RUAS : 'OCULTA', RELEVO: ok(o.RELEVO) ? o.RELEVO : 'OCULTA' };
}

/** O olho: oculto → visível; qualquer outro → oculto (a mesma regra das camadas). */
export function alternarOlhoDoMapa(e: EstadosDoMapa, f: FonteDoMapa): EstadosDoMapa {
  return { ...e, [f]: e[f] === 'OCULTA' ? 'VISIVEL' : 'OCULTA' };
}

/** O meio-tom: atenuado → visível; senão → atenuado (inclusive o oculto, que volta em meio-tom). */
export function alternarMeioTomDoMapa(e: EstadosDoMapa, f: FonteDoMapa): EstadosDoMapa {
  return { ...e, [f]: e[f] === 'ATENUADA' ? 'VISIVEL' : 'ATENUADA' };
}

export const algumMapaAVista = (e: EstadosDoMapa) => FONTES_DO_MAPA.some((f) => e[f] !== 'OCULTA');

// ── Ladrilhos (o canvas) ────────────────────────────────────────────────────

export interface Ladrilho {
  z: number;
  x: number;
  y: number;
}

const RAIO_DA_TERRA_M = 6378137;
/** Metros por pixel no equador, zoom 0, ladrilho de 256 px. */
const M_POR_PX_Z0 = (2 * Math.PI * RAIO_DA_TERRA_M) / 256;
/** Mais que isso por fonte e o nível de zoom recua: cada ladrilho é uma imagem baixada. */
export const MAX_LADRILHOS_POR_FONTE = 64;

/** lat/lon → ladrilho fracionário (Web Mercator). */
export function ladrilhoFracionario(p: LatLon, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const lat = Math.max(-85.05112878, Math.min(85.05112878, p.lat));
  const r = (lat * Math.PI) / 180;
  return { x: ((p.lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
}

/** Ladrilho fracionário → lat/lon (o inverso exato). */
export function geoDoLadrilho(x: number, y: number, z: number): LatLon {
  const n = 2 ** z;
  return { lon: (x / n) * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI };
}

/**
 * O nível cuja resolução mais se aproxima do metro por pixel da tela,
 * limitado ao nativo do servidor (acima, o canvas amplia o ladrilho).
 */
export function zoomDoLadrilho(escalaPxPorMm: number, latitude: number, maxNativeZoom: number): number {
  const mPorPxTela = 1 / (escalaPxPorMm * 1000);
  const z = Math.round(Math.log2((M_POR_PX_Z0 * Math.cos((latitude * Math.PI) / 180)) / mPorPxTela));
  return Math.max(0, Math.min(maxNativeZoom, z));
}

/**
 * Os ladrilhos que cobrem a área visível (os QUATRO cantos da tela em mm — com
 * o giro do norte a área no mundo não é um retângulo alinhado). Se passar de
 * `max`, o nível recua: melhor um mapa menos nítido que cem imagens baixadas.
 */
export function ladrilhosDaArea(cantosMm: readonly Point[], geo: Georreferencia, zDesejado: number, max = MAX_LADRILHOS_POR_FONTE): Ladrilho[] {
  const cantos = cantosMm.map((p) => localParaGeo(p, geo));
  for (let z = zDesejado; z >= 0; z--) {
    const fr = cantos.map((c) => ladrilhoFracionario(c, z));
    const n = 2 ** z;
    const x0 = Math.max(0, Math.floor(Math.min(...fr.map((f) => f.x))));
    const x1 = Math.min(n - 1, Math.floor(Math.max(...fr.map((f) => f.x))));
    const y0 = Math.max(0, Math.floor(Math.min(...fr.map((f) => f.y))));
    const y1 = Math.min(n - 1, Math.floor(Math.max(...fr.map((f) => f.y))));
    const total = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (total > max && z > 0) continue;
    const saida: Ladrilho[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) saida.push({ z, x, y });
    return saida;
  }
  return [];
}

/**
 * Onde o ladrilho cai no desenho: o canto NO e os vetores de UM pixel do
 * ladrilho em x e em y, em mm. É a afim que o canvas compõe com `paraTela`.
 */
export function afimDoLadrilho(t: Ladrilho, geo: Georreferencia): { origem: Point; porPxX: Point; porPxY: Point } {
  const no = geoParaLocal(geoDoLadrilho(t.x, t.y, t.z), geo);
  const ne = geoParaLocal(geoDoLadrilho(t.x + 1, t.y, t.z), geo);
  const so = geoParaLocal(geoDoLadrilho(t.x, t.y + 1, t.z), geo);
  return {
    origem: no,
    porPxX: { x: (ne.x - no.x) / 256, y: (ne.y - no.y) / 256 },
    porPxY: { x: (so.x - no.x) / 256, y: (so.y - no.y) / 256 },
  };
}

// ── A grade por cima do mapa (12/10/2026) ───────────────────────────────────

/**
 * Cores e densidade da grade. Sem mapa, a de sempre: cinza claro opaco no
 * fundo branco. COM mapa, aquele cinza claro vira um quadriculado BRANCO sobre
 * as cores e lava o mapa inteiro (print do usuário, 12/10/2026) — então a
 * grade passa a ESCURECER de leve (ardósia translúcida), e as linhas finas só
 * entram com folga (célula ≥ 12 px), senão a trama cobre o mapa.
 */
export function estiloDaGrade(sobreMapa: boolean, passoTelaPx: number): { cor: string; corForte: string; soFortes: boolean } {
  if (!sobreMapa) return { cor: '#e2e8f0', corForte: '#cbd5e1', soFortes: passoTelaPx < 6 };
  return { cor: 'rgba(15, 23, 42, 0.07)', corForte: 'rgba(15, 23, 42, 0.16)', soFortes: passoTelaPx < 12 };
}

export function urlDoLadrilho(f: FonteDoMapa, t: Ladrilho): string {
  const d = FONTE_DO_MAPA[f];
  const s = d.subdominios[(t.x + t.y) % d.subdominios.length];
  return d.url.replace('{s}', s).replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y));
}
