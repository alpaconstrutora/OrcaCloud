/**
 * CAR — Cadastro Ambiental Rural (A5, 26/09/2026): o que o SICAR pede do
 * imóvel, saído do desenho.
 *
 * Os TEMAS são as áreas da família "área" com tipo ambiental (kernel 0.61.0):
 * APP, Reserva Legal, remanescente de vegetação nativa, área consolidada,
 * servidão administrativa e hidrografia; a ÁREA DO IMÓVEL é o contorno do lote
 * (as divisas TERRENO). O software não inscreve nada: gera os arquivos por tema
 * para o responsável carregar no módulo de cadastro do SICAR.
 *
 *  - SHP por tema, em SIRGAS 2000 GEOGRÁFICO (EPSG:4674, latitude/longitude) —
 *    o sistema do SICAR — com TEMA, NOME, AREA_HA e PERIM_M;
 *  - KML com uma pasta por tema; CSV das coordenadas vértice a vértice;
 *  - quadro de áreas e perímetros no plano topográfico local (a medida do
 *    terreno) e o percentual sobre o imóvel;
 *  - APOIO à Reserva Legal: o percentual mínimo do Código Florestal (Lei
 *    12.651/2012, art. 12) pelo bioma/região informado contra a RL desenhada.
 *    É apoio: o art. 15 (APP no cômputo da RL), o art. 67 (imóvel de até 4
 *    módulos fiscais) e a compensação não são decididos aqui — são ditos.
 */
import type { BlueprintModel, Georreferencia, Point, TipoAmbiental } from './blueprintKernel';
import { FICHA_DA_AREA_PUBLICA, pointInPolygon, TIPOS_AMBIENTAIS } from './blueprintKernel';
import { medirTerreno } from './blueprintTerreno';
import { localParaGeo } from './blueprintTopografia';
import { areaNoSgl, geoParaSgl } from './geo/sgl';
import type { CamadaShp } from './geo/shapefile';

export type TemaDoCar = 'AREA_IMOVEL' | TipoAmbiental;

/** O nome da camada no SICAR (o do arquivo .shp). */
export const CAMADA_DO_SICAR: Record<TemaDoCar, string> = {
  AREA_IMOVEL: 'AREA_IMOVEL',
  APP: 'APP',
  RESERVA_LEGAL: 'RESERVA_LEGAL',
  VEGETACAO_NATIVA: 'VEGETACAO_NATIVA',
  AREA_CONSOLIDADA: 'AREA_CONSOLIDADA',
  SERVIDAO: 'SERVIDAO_ADMINISTRATIVA',
  HIDROGRAFIA: 'HIDROGRAFIA',
};

export function rotuloDoTema(t: TemaDoCar): string {
  return t === 'AREA_IMOVEL' ? 'Área do imóvel' : FICHA_DA_AREA_PUBLICA[t].rotulo;
}

export interface PoligonoDoCar {
  tema: TemaDoCar;
  nome: string;
  /** mm do desenho. */
  anel: Point[];
  /** Latitude/longitude SIRGAS 2000, quando há georreferência. */
  geo: { lat: number; lon: number }[] | null;
  areaM2: number;
  perimetroM: number;
}

export interface CarDoImovel {
  poligonos: PoligonoDoCar[];
  areaDoImovelM2: number;
  georreferenciado: boolean;
  avisos: string[];
}

function medir(anel: Point[], geo: Georreferencia | null, origem: { lat: number; lon: number } | null): { areaM2: number; perimetroM: number; ll: { lat: number; lon: number }[] | null } {
  if (geo && origem) {
    const ll = anel.map((p) => localParaGeo(p, geo));
    const sgl = ll.map((q) => geoParaSgl(q, { origem, altitudeM: geo.elevacaoM ?? 0 }));
    let per = 0;
    for (let i = 0; i < sgl.length; i++) {
      const a = sgl[i];
      const b = sgl[(i + 1) % sgl.length];
      per += Math.hypot(b.este - a.este, b.norte - a.norte);
    }
    return { areaM2: Math.abs(areaNoSgl(sgl)), perimetroM: per, ll };
  }
  let dobro = 0;
  let per = 0;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    dobro += a.x * b.y - b.x * a.y;
    per += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return { areaM2: Math.abs(dobro) / 2 / 1e6, perimetroM: per / 1000, ll: null };
}

/**
 * Os polígonos do CAR: o imóvel (as divisas TERRENO) e as áreas ambientais,
 * medidos no SGL quando georreferenciado. Avisos: sem georreferência (o SICAR
 * exige coordenadas), sem imóvel fechado, tema com vértice fora do imóvel.
 */
export function carDoImovel(model: BlueprintModel): CarDoImovel {
  const geo = model.georreferencia && Number.isFinite(model.georreferencia.latitude) && !(model.georreferencia.latitude === 0 && model.georreferencia.longitude === 0) ? model.georreferencia : null;
  const avisos: string[] = [];
  const terreno = medirTerreno(model.boundaries ?? []);
  const imovel = terreno?.fechado ? terreno.anel : null;
  const origem = geo ? { lat: geo.latitude, lon: geo.longitude } : null;
  const poligonos: PoligonoDoCar[] = [];
  if (!imovel) avisos.push('Sem o contorno do imóvel fechado (ferramenta Terreno): o SICAR precisa da ÁREA DO IMÓVEL.');
  if (!geo) avisos.push('Sem georreferência ("Onde fica"): o SICAR recebe latitude/longitude em SIRGAS 2000 — o quadro sai em medidas do desenho e os arquivos não saem.');
  if (imovel) {
    const m = medir(imovel, geo, origem);
    poligonos.push({ tema: 'AREA_IMOVEL', nome: 'Área do imóvel', anel: imovel, geo: m.ll, areaM2: m.areaM2, perimetroM: m.perimetroM });
  }
  for (const a of model.areasPublicas ?? []) {
    if (!(TIPOS_AMBIENTAIS as readonly string[]).includes(a.tipo)) continue;
    const tema = a.tipo as TipoAmbiental;
    const m = medir(a.pontos, geo, origem);
    const nome = a.nome ?? FICHA_DA_AREA_PUBLICA[tema].rotulo;
    poligonos.push({ tema, nome, anel: a.pontos, geo: m.ll, areaM2: m.areaM2, perimetroM: m.perimetroM });
    if (imovel && a.pontos.some((p) => !pointInPolygon(imovel, p) && !naBorda(imovel, p))) {
      avisos.push(`"${nome}" (${FICHA_DA_AREA_PUBLICA[tema].rotulo}) tem vértice FORA do imóvel — o SICAR recusa tema que extrapola a área do imóvel.`);
    }
  }
  return { poligonos, areaDoImovelM2: poligonos.find((p) => p.tema === 'AREA_IMOVEL')?.areaM2 ?? 0, georreferenciado: !!geo, avisos };
}

function naBorda(anel: Point[], p: Point, tolMm = 5): boolean {
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
    if (Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) <= tolMm) return true;
  }
  return false;
}

// ── Quadro ───────────────────────────────────────────────────────────────────

export interface LinhaDoQuadroDoCar {
  tema: TemaDoCar;
  rotulo: string;
  quantidade: number;
  areaHa: number;
  /** Sobre a área do imóvel; o próprio imóvel = 100. */
  percentual: number | null;
  perimetroM: number;
}

export function quadroDoCar(car: CarDoImovel): LinhaDoQuadroDoCar[] {
  const temas: TemaDoCar[] = ['AREA_IMOVEL', ...TIPOS_AMBIENTAIS];
  return temas
    .map((tema) => {
      const ps = car.poligonos.filter((p) => p.tema === tema);
      const area = ps.reduce((s, p) => s + p.areaM2, 0);
      return {
        tema,
        rotulo: rotuloDoTema(tema),
        quantidade: ps.length,
        areaHa: area / 10_000,
        percentual: car.areaDoImovelM2 > 0 ? (area / car.areaDoImovelM2) * 100 : null,
        perimetroM: ps.reduce((s, p) => s + p.perimetroM, 0),
      };
    })
    .filter((l) => l.quantidade > 0);
}

// ── Reserva Legal ────────────────────────────────────────────────────────────

/** Código Florestal (Lei 12.651/2012), art. 12: o mínimo de RL pela localização do imóvel. */
export const BIOMAS_DA_RESERVA_LEGAL = {
  AMAZONIA_FLORESTA: { rotulo: 'Amazônia Legal — área de floresta', pct: 80 },
  AMAZONIA_CERRADO: { rotulo: 'Amazônia Legal — área de cerrado', pct: 35 },
  AMAZONIA_CAMPOS: { rotulo: 'Amazônia Legal — campos gerais', pct: 20 },
  DEMAIS_REGIOES: { rotulo: 'Demais regiões do país', pct: 20 },
} as const;
export type BiomaDaReservaLegal = keyof typeof BIOMAS_DA_RESERVA_LEGAL;

export interface ApoioAReservaLegal {
  exigidaPct: number;
  exigidaHa: number;
  declaradaHa: number;
  declaradaPct: number;
  /** declarada − exigida: negativo = falta. */
  saldoHa: number;
  appHa: number;
  notas: string[];
}

export function apoioAReservaLegal(car: CarDoImovel, bioma: BiomaDaReservaLegal): ApoioAReservaLegal {
  const imovelHa = car.areaDoImovelM2 / 10_000;
  const exigidaPct = BIOMAS_DA_RESERVA_LEGAL[bioma].pct;
  const exigidaHa = (imovelHa * exigidaPct) / 100;
  const declaradaHa = car.poligonos.filter((p) => p.tema === 'RESERVA_LEGAL').reduce((s, p) => s + p.areaM2, 0) / 10_000;
  const appHa = car.poligonos.filter((p) => p.tema === 'APP').reduce((s, p) => s + p.areaM2, 0) / 10_000;
  const saldoHa = declaradaHa - exigidaHa;
  const notas = [
    'Apoio ao cálculo, não a análise do órgão ambiental: o percentual sai da localização informada (art. 12).',
    'A APP pode entrar no cômputo da Reserva Legal nas condições do art. 15 — não somada aqui.',
    'Imóvel de até 4 módulos fiscais com vegetação remanescente em 22/07/2008 inferior ao mínimo tem regra própria (art. 67).',
  ];
  if (saldoHa < 0 && appHa > 0) notas.push(`Com a APP (${appHa.toFixed(4).replace('.', ',')} ha), se o art. 15 se aplicar, o total chega a ${(declaradaHa + appHa).toFixed(4).replace('.', ',')} ha.`);
  return { exigidaPct, exigidaHa, declaradaHa, declaradaPct: imovelHa > 0 ? (declaradaHa / imovelHa) * 100 : 0, saldoHa, appHa, notas };
}

// ── Arquivos ─────────────────────────────────────────────────────────────────

/** WKT do ESRI para SIRGAS 2000 geográfico (EPSG:4674). */
export const PRJ_SIRGAS_2000_GEO =
  'GEOGCS["GCS_SIRGAS_2000",DATUM["D_SIRGAS_2000",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

/** Uma camada por tema presente, em longitude/latitude SIRGAS 2000. Exige georreferência. */
export function camadasDoCar(car: CarDoImovel): CamadaShp[] {
  if (!car.georreferenciado) throw new Error('Os arquivos do CAR saem em latitude/longitude: informe a georreferência do imóvel ("Onde fica").');
  const temas = [...new Set(car.poligonos.map((p) => p.tema))];
  return temas.map((tema) => ({
    nome: CAMADA_DO_SICAR[tema],
    tipo: 'POLIGONO' as const,
    prj: PRJ_SIRGAS_2000_GEO,
    feicoes: car.poligonos
      .filter((p) => p.tema === tema)
      .map((p) => ({
        partes: [p.geo!.map((q) => ({ x: q.lon, y: q.lat }))],
        atributos: { tema: CAMADA_DO_SICAR[tema], nome: p.nome, area_ha: Math.round((p.areaM2 / 10_000) * 10_000) / 10_000, perim_m: Math.round(p.perimetroM * 100) / 100 },
      })),
  }));
}

const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function corKmlDe(hex: string, alfa = '99'): string {
  const h = hex.replace('#', '');
  return `${alfa}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`;
}

/** KML com uma pasta por tema (polígono preenchido na cor do tema). */
export function kmlDoCar(car: CarDoImovel, titulo: string): string {
  if (!car.georreferenciado) throw new Error('O KML precisa da georreferência do imóvel.');
  const temas = [...new Set(car.poligonos.map((p) => p.tema))];
  const estilos = temas
    .map((t) => {
      const cor = t === 'AREA_IMOVEL' ? '#15803d' : FICHA_DA_AREA_PUBLICA[t].cor;
      return `<Style id="${t}"><LineStyle><color>ff${corKmlDe(cor).slice(2)}</color><width>2</width></LineStyle><PolyStyle><color>${t === 'AREA_IMOVEL' ? '00ffffff' : corKmlDe(cor)}</color></PolyStyle></Style>`;
    })
    .join('');
  const pastas = temas
    .map((t) => {
      const marcas = car.poligonos
        .filter((p) => p.tema === t)
        .map((p) => {
          const coords = [...p.geo!, p.geo![0]].map((q) => `${q.lon.toFixed(8)},${q.lat.toFixed(8)},0`).join(' ');
          return `<Placemark><name>${xml(p.nome)}</name><description>${xml(`${rotuloDoTema(t)} · ${(p.areaM2 / 10_000).toFixed(4).replace('.', ',')} ha`)}</description><styleUrl>#${t}</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
        })
        .join('');
      return `<Folder><name>${xml(rotuloDoTema(t))}</name>${marcas}</Folder>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(titulo)}</name>${estilos}${pastas}</Document></kml>`;
}

/** CSV das coordenadas: tema;nome;vertice;longitude;latitude (graus decimais, SIRGAS 2000). */
export function csvDeCoordenadasDoCar(car: CarDoImovel): string {
  const linhas = ['tema;nome;vertice;longitude;latitude'];
  for (const p of car.poligonos) {
    (p.geo ?? []).forEach((q, i) => linhas.push([CAMADA_DO_SICAR[p.tema], p.nome.replace(/;/g, ','), i + 1, q.lon.toFixed(8), q.lat.toFixed(8)].join(';')));
  }
  return linhas.join('\n');
}
