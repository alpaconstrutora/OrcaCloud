/**
 * CONVERSÃO DE COORDENADAS (fase A0).
 *
 * Duas famílias de conta, e é importante não confundi-las:
 *
 *   • PROJEÇÃO — latitude/longitude ↔ E/N, dentro do MESMO datum. É geometria
 *     pura, exata até o milímetro.
 *   • TRANSFORMAÇÃO DE DATUM — SAD 69 → SIRGAS 2000, por exemplo. Muda o
 *     referencial, desloca o ponto em dezenas de metros e tem precisão limitada
 *     pelos parâmetros usados.
 *
 * Misturar as duas é o que faz alguém achar que "converteu de UTM para
 * lat/long" e, sem perceber, ter mudado de datum. Por isso cada função diz, no
 * nome e no retorno, o que fez.
 *
 * A conta é do `proj4`, com os parâmetros do catálogo. O que este arquivo
 * acrescenta é o vocabulário do projeto e as GUARDAS — fuso errado, valor fora
 * de faixa, datum trocado em silêncio.
 */
import proj4 from 'proj4';
import {
  CATALOGO_DE_CRS,
  SIRGAS2000_GEO,
  conferirFuso,
  meridianoCentral,
  registrar,
  utmSirgasDaLongitude,
  type DefinicaoDeCrs,
} from './crs';

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Projetada {
  /** Leste, em metros. */
  este: number;
  /** Norte, em metros. */
  norte: number;
}

export interface ResultadoDaConversao<T> {
  valor: T;
  /** O que o usuário precisa saber: fuso suspeito, datum trocado, extrapolação. */
  avisos: string[];
}

/** O fator de escala do UTM no meridiano central — a definição da projeção. */
export const K0_UTM = 0.9996;

/** Faixa em que o E do UTM é confiável: 100 km a 900 km do falso leste. */
const ESTE_MINIMO = 100_000;
const ESTE_MAXIMO = 900_000;

function avisosDoDatum(de: DefinicaoDeCrs, para: DefinicaoDeCrs): string[] {
  if (de.datum === para.datum) return [];
  // SIRGAS 2000 e WGS 84 são coincidentes para cadastro: a diferença é
  // centimétrica e depende da época. Avisar a cada conversão seria ruído.
  const coincidentes = new Set(['SIRGAS2000', 'WGS84']);
  if (coincidentes.has(de.datum) && coincidentes.has(para.datum)) return [];
  return [
    `Mudança de referencial: ${de.datum.replace('_', ' ')} → ${para.datum.replace('_', ' ')}. O ponto se desloca dezenas de metros, e a precisão é a dos parâmetros oficiais de transformação — não é conversão exata.`,
  ];
}

/** Converte entre dois sistemas do catálogo. É a porta única deste módulo. */
export function converter(
  de: DefinicaoDeCrs,
  para: DefinicaoDeCrs,
  x: number,
  y: number,
): ResultadoDaConversao<{ x: number; y: number }> {
  registrar(de);
  registrar(para);
  const [rx, ry] = proj4(de.codigo, para.codigo, [x, y]);
  return { valor: { x: rx, y: ry }, avisos: avisosDoDatum(de, para) };
}

/**
 * LATITUDE/LONGITUDE → E/N.
 *
 * Sem CRS de destino, escolhe o UTM SIRGAS do fuso que contém a longitude — que
 * é o que um topógrafo faria. A escolha vai no retorno, para a tela mostrar
 * qual fuso foi usado em vez de deixar o usuário adivinhar.
 */
export function geoParaProjetado(
  ponto: LatLon,
  destino?: DefinicaoDeCrs,
  origem: DefinicaoDeCrs = SIRGAS2000_GEO,
): ResultadoDaConversao<Projetada & { crs: DefinicaoDeCrs }> {
  const alvo = destino ?? utmSirgasDaLongitude(ponto.lon);
  if (!alvo) {
    throw new Error(`Longitude ${ponto.lon}° fora dos fusos que o catálogo cobre (18 a 25, o Brasil).`);
  }
  const { valor, avisos } = converter(origem, alvo, ponto.lon, ponto.lat);
  const aviso = conferirFuso(alvo, ponto.lon);
  return {
    valor: { este: valor.x, norte: valor.y, crs: alvo },
    avisos: aviso ? [...avisos, aviso] : avisos,
  };
}

/** E/N → latitude/longitude. */
export function projetadoParaGeo(
  p: Projetada,
  origem: DefinicaoDeCrs,
  destino: DefinicaoDeCrs = SIRGAS2000_GEO,
): ResultadoDaConversao<LatLon> {
  const avisos: string[] = [];
  if (origem.tipo !== 'PROJETADO') throw new Error(`${origem.nome} não é um sistema projetado.`);
  if (p.este < ESTE_MINIMO || p.este > ESTE_MAXIMO) {
    avisos.push(
      `Leste ${Math.round(p.este)} m está fora da faixa usual do fuso (${ESTE_MINIMO / 1000} km a ${ESTE_MAXIMO / 1000} km). Confira se o fuso é mesmo o ${origem.zona}.`,
    );
  }
  const { valor, avisos: doDatum } = converter(origem, destino, p.este, p.norte);
  return { valor: { lat: valor.y, lon: valor.x }, avisos: [...avisos, ...doDatum] };
}

/** Transformação de datum entre sistemas GEOGRÁFICOS, sem passar por projeção. */
export function transformarDatum(ponto: LatLon, de: DefinicaoDeCrs, para: DefinicaoDeCrs): ResultadoDaConversao<LatLon> {
  if (de.tipo !== 'GEOGRAFICO' || para.tipo !== 'GEOGRAFICO') {
    throw new Error('transformarDatum trabalha entre sistemas geográficos. Para E/N, use converter().');
  }
  const { valor, avisos } = converter(de, para, ponto.lon, ponto.lat);
  return { valor: { lat: valor.y, lon: valor.x }, avisos };
}

/**
 * CONVERGÊNCIA MERIDIANA: o ângulo entre o norte da QUADRÍCULA (o Y do UTM) e o
 * norte VERDADEIRO (o meridiano do lugar), em graus.
 *
 * Por que importa: o azimute que se mede no desenho é de quadrícula; o que vai
 * no memorial e no SIGEF é o verdadeiro. A diferença chega a 2° nas bordas do
 * fuso — meio grau já é metros de erro numa divisa longa.
 *
 * Positivo a leste do meridiano central, no hemisfério sul.
 */
export function convergenciaMeridiana(ponto: LatLon, zona?: number): number {
  const fuso = zona ?? Math.floor((ponto.lon + 180) / 6) + 1;
  const lon0 = meridianoCentral(fuso);
  const dl = ((ponto.lon - lon0) * Math.PI) / 180;
  const phi = (ponto.lat * Math.PI) / 180;
  // Série de primeira ordem: γ ≈ Δλ · sen(φ). O termo seguinte é da ordem de
  // 10⁻⁵ grau no Brasil — abaixo do que qualquer memorial registra.
  const gamma = Math.atan(Math.tan(dl) * Math.sin(phi));
  return (gamma * 180) / Math.PI;
}

/**
 * FATOR DE ESCALA no ponto: quanto a projeção estica a distância ali.
 *
 * No meridiano central vale 0,9996 (encolhe); cresce para as bordas do fuso e
 * passa de 1 a cerca de 180 km dele. Uma divisa de 1 km medida no desenho pode
 * diferir de decímetros da medida no terreno — é por isso que o memorial do
 * INCRA distingue distância de quadrícula de distância no elipsoide.
 */
export function fatorDeEscala(ponto: LatLon, zona?: number): number {
  const fuso = zona ?? Math.floor((ponto.lon + 180) / 6) + 1;
  const lon0 = meridianoCentral(fuso);
  const dl = ((ponto.lon - lon0) * Math.PI) / 180;
  const phi = (ponto.lat * Math.PI) / 180;
  const a = 6378137;
  const f = 1 / 298.257222101;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const cos = Math.cos(phi);
  const T = Math.tan(phi) ** 2;
  const C = ep2 * cos * cos;
  const A = dl * cos;
  // Snyder 8-11, até a 4ª ordem.
  return K0_UTM * (1 + ((1 + C) * A * A) / 2 + ((5 - 4 * T + 42 * C + 13 * C * C - 28 * ep2) * A ** 4) / 24);
}

/**
 * A distância no ELIPSOIDE a partir da distância medida na quadrícula.
 * É o que o memorial registra: o que se mede no terreno, não no papel.
 */
export function distanciaNoElipsoide(distanciaDaQuadricula: number, ponto: LatLon, zona?: number): number {
  return distanciaDaQuadricula / fatorDeEscala(ponto, zona);
}

/** O CRS do catálogo com este código, ou null. */
export function crsPorCodigo(codigo: string): DefinicaoDeCrs | null {
  return CATALOGO_DE_CRS.find((c) => c.codigo.toUpperCase() === codigo.toUpperCase()) ?? null;
}
