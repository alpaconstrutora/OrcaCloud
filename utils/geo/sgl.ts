/**
 * SISTEMA GEODÉSICO LOCAL — SGL / PTL (fase A0).
 *
 * POR QUE ELE EXISTE, e por que o proj4 não resolve: a área de um imóvel medida
 * em coordenadas UTM **não é a área do terreno**. A projeção encolhe tudo por
 * 0,9996 no meridiano central e estica nas bordas do fuso, e a área varia com o
 * quadrado desse fator — 0,08% de erro, que numa gleba de 100 hectares são 800
 * m². É por isso que o INCRA calcula a área no Sistema Geodésico Local e a NBR
 * 14166 define o Plano Topográfico Local para o cadastro urbano.
 *
 * O SGL é um plano tangente ao elipsoide na ORIGEM escolhida, com o eixo Y no
 * norte geográfico. Nele a distância é a do terreno: não há fator de escala.
 *
 * ⚠️ Ele vale numa vizinhança da origem. A NBR 14166 limita o PTL a um raio de
 * cerca de 50 km, onde o afastamento entre o plano e o elipsoide fica abaixo da
 * precisão do cadastro. Além disso o erro cresce com o quadrado da distância, e
 * `avisoDoAlcance` diz quando se passou do limite em vez de devolver um número
 * errado calado.
 */
import type { LatLon } from './projecao';

/** Raio máximo recomendado pela NBR 14166 para o plano topográfico local. */
export const ALCANCE_DO_PTL_M = 50_000;

const A_GRS80 = 6378137;
const F_GRS80 = 1 / 298.257222101;
const E2 = F_GRS80 * (2 - F_GRS80);

export interface OrigemDoSgl {
  /** O ponto de tangência: onde o plano encosta no elipsoide. */
  origem: LatLon;
  /**
   * Altitude da origem, em metros. Entra porque o plano topográfico fica na
   * altitude do terreno, não no elipsoide: ignorá-la encolhe todas as
   * distâncias por h/R — 1,5 cm por km a 100 m de altitude.
   */
  altitudeM?: number;
  /**
   * Constantes que afastam a origem do zero, para não haver coordenada
   * negativa (é o que a NBR 14166 chama de origem deslocada). Em metros.
   */
  falsoEsteM?: number;
  falsoNorteM?: number;
}

/** Raio de curvatura na direção do meridiano (norte-sul), na latitude dada. */
function raioMeridiano(latRad: number): number {
  return (A_GRS80 * (1 - E2)) / Math.pow(1 - E2 * Math.sin(latRad) ** 2, 1.5);
}

/** Raio da seção normal na direção leste-oeste (a grande normal). */
function raioNormal(latRad: number): number {
  return A_GRS80 / Math.sqrt(1 - E2 * Math.sin(latRad) ** 2);
}

/**
 * Geográficas → SGL.
 *
 * As distâncias saem no plano topográfico, na altitude da origem: é a medida
 * que o topógrafo obtém com a trena e a estação total.
 */
export function geoParaSgl(ponto: LatLon, sgl: OrigemDoSgl): { este: number; norte: number } {
  const lat0 = (sgl.origem.lat * Math.PI) / 180;
  const dLat = ((ponto.lat - sgl.origem.lat) * Math.PI) / 180;
  const dLon = ((ponto.lon - sgl.origem.lon) * Math.PI) / 180;
  const h = sgl.altitudeM ?? 0;

  // O arco no elipsoide, mais a correção de altitude: o plano do terreno é
  // maior que o do elipsoide na razão (R + h) / R.
  const M = raioMeridiano(lat0);
  const N = raioNormal(lat0);
  const norte = dLat * (M + h);
  const este = dLon * (N + h) * Math.cos(lat0);

  return {
    este: este + (sgl.falsoEsteM ?? 0),
    norte: norte + (sgl.falsoNorteM ?? 0),
  };
}

/** SGL → geográficas. A inversa exata da de cima. */
export function sglParaGeo(p: { este: number; norte: number }, sgl: OrigemDoSgl): LatLon {
  const lat0 = (sgl.origem.lat * Math.PI) / 180;
  const h = sgl.altitudeM ?? 0;
  const M = raioMeridiano(lat0);
  const N = raioNormal(lat0);
  const este = p.este - (sgl.falsoEsteM ?? 0);
  const norte = p.norte - (sgl.falsoNorteM ?? 0);

  const dLat = norte / (M + h);
  const dLon = este / ((N + h) * Math.cos(lat0));
  return {
    lat: sgl.origem.lat + (dLat * 180) / Math.PI,
    lon: sgl.origem.lon + (dLon * 180) / Math.PI,
  };
}

/**
 * ⚠️ O aviso de alcance. Fora do raio da NBR 14166 o plano deixa de representar
 * o elipsoide na precisão do cadastro, e o número continua saindo — é esse
 * silêncio que o aviso quebra.
 */
export function avisoDoAlcance(p: { este: number; norte: number }, sgl: OrigemDoSgl): string | null {
  const dx = p.este - (sgl.falsoEsteM ?? 0);
  const dy = p.norte - (sgl.falsoNorteM ?? 0);
  const r = Math.hypot(dx, dy);
  if (r <= ALCANCE_DO_PTL_M) return null;
  return `Ponto a ${(r / 1000).toFixed(1)} km da origem do plano topográfico local — além dos ${ALCANCE_DO_PTL_M / 1000} km que a NBR 14166 recomenda. Use outra origem, ou trabalhe em UTM aceitando o fator de escala.`;
}

/**
 * A ÁREA no plano topográfico, em m², a partir de um anel em coordenadas SGL.
 *
 * É esta a área que vai à matrícula e ao SIGEF — não a medida em UTM.
 */
export function areaNoSgl(anel: { este: number; norte: number }[]): number {
  if (anel.length < 3) return 0;
  let dobro = 0;
  for (let i = 0; i < anel.length; i += 1) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    dobro += a.este * b.norte - b.este * a.norte;
  }
  return Math.abs(dobro) / 2;
}

/**
 * A diferença entre a área medida em UTM e a área real, em porcentagem.
 *
 * Serve para a tela dizer quanto se está perdendo ao usar UTM — e é sempre
 * NEGATIVA perto do meridiano central (a projeção encolhe) e positiva nas
 * bordas do fuso.
 */
export function desvioDaAreaEmUtm(fatorDeEscalaNoPonto: number): number {
  // A área varia com o quadrado do fator linear.
  return (fatorDeEscalaNoPonto ** 2 - 1) * 100;
}
