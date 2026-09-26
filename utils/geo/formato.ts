/**
 * O VOCABULÁRIO ANGULAR DO MEMORIAL (fase A0): graus/minutos/segundos, azimute,
 * rumo e as contas entre dois vértices.
 *
 * Não é formatação: é a forma como a peça técnica se escreve, e errar aqui sai
 * em papel assinado. Dois pontos que custam:
 *
 *  1. O AZIMUTE se conta a partir do NORTE, no sentido horário, de 0° a 360°.
 *     `Math.atan2` devolve a partir do LESTE, anti-horário — usar o valor cru
 *     gira a divisa em 90° e inverte o sentido, sem nenhum erro aparente.
 *  2. O RUMO é o mesmo ângulo dito de outro jeito: 0° a 90° medidos do norte
 *     OU do sul, com a letra do quadrante. Azimute 135° é rumo "45°00'00\" SE".
 */

/** Graus, minutos e segundos — a forma do memorial. */
export interface Gms {
  graus: number;
  minutos: number;
  segundos: number;
  /** −1 quando o ângulo é negativo (latitude sul, longitude oeste). */
  sinal: 1 | -1;
}

/**
 * Decimal → GMS.
 *
 * ⚠️ O arredondamento dos segundos pode estourar para 60: 0,99999° vira
 * 0°59'60", que é escrita inválida. O transbordo sobe para o minuto e, dele,
 * para o grau. Sem isso, um memorial em 100 lotes mostra a aberração em alguns.
 */
export function paraGms(decimal: number, casasDoSegundo = 3): Gms {
  const sinal: 1 | -1 = decimal < 0 ? -1 : 1;
  const abs = Math.abs(decimal);
  let graus = Math.floor(abs);
  let minutos = Math.floor((abs - graus) * 60);
  let segundos = Number((((abs - graus) * 60 - minutos) * 60).toFixed(casasDoSegundo));
  if (segundos >= 60) {
    segundos = 0;
    minutos += 1;
  }
  if (minutos >= 60) {
    minutos = 0;
    graus += 1;
  }
  return { graus, minutos, segundos, sinal };
}

/** GMS → decimal. */
export function deGms(g: Gms): number {
  return g.sinal * (g.graus + g.minutos / 60 + g.segundos / 3600);
}

/** `-19°55'12,345"` — o formato que o memorial imprime. */
export function gmsTexto(decimal: number, casasDoSegundo = 3): string {
  const g = paraGms(decimal, casasDoSegundo);
  const seg = g.segundos.toFixed(casasDoSegundo).replace('.', ',');
  // ⚠️ A largura do segundo é 2 dígitos + (vírgula + casas) quando há casas.
  // Pedir `casas + 3` com ZERO casas produzia "000" no lugar de "00".
  const largura = casasDoSegundo > 0 ? casasDoSegundo + 3 : 2;
  return `${g.sinal < 0 ? '-' : ''}${g.graus}°${String(g.minutos).padStart(2, '0')}'${seg.padStart(largura, '0')}"`;
}

/** Latitude com a letra do hemisfério, como o SIGEF escreve. */
export function latitudeTexto(lat: number, casasDoSegundo = 3): string {
  return `${gmsTexto(Math.abs(lat), casasDoSegundo)} ${lat < 0 ? 'S' : 'N'}`;
}

/** Longitude com a letra, idem. */
export function longitudeTexto(lon: number, casasDoSegundo = 3): string {
  return `${gmsTexto(Math.abs(lon), casasDoSegundo)} ${lon < 0 ? 'W' : 'E'}`;
}

export interface Ponto2d {
  /** Leste, em metros (ou mm — a unidade só precisa ser a mesma nos dois). */
  x: number;
  /** Norte, na mesma unidade. */
  y: number;
}

/**
 * AZIMUTE de A para B: 0° no norte, crescendo no sentido horário.
 *
 * `atan2(dx, dy)` — nesta ordem, e não a usual `(dy, dx)`. É o que faz o zero
 * cair no norte em vez do leste.
 */
export function azimute(de: Ponto2d, para: Ponto2d): number {
  const dx = para.x - de.x;
  const dy = para.y - de.y;
  const g = (Math.atan2(dx, dy) * 180) / Math.PI;
  return (g + 360) % 360;
}

/** A distância entre dois vértices, na unidade deles. */
export function distancia(de: Ponto2d, para: Ponto2d): number {
  return Math.hypot(para.x - de.x, para.y - de.y);
}

export type Quadrante = 'NE' | 'SE' | 'SW' | 'NW';

export interface Rumo {
  /** 0° a 90°, sempre. */
  angulo: number;
  quadrante: Quadrante;
}

/** Azimute → rumo. */
export function azimuteParaRumo(az: number): Rumo {
  const a = ((az % 360) + 360) % 360;
  if (a <= 90) return { angulo: a, quadrante: 'NE' };
  if (a <= 180) return { angulo: 180 - a, quadrante: 'SE' };
  if (a <= 270) return { angulo: a - 180, quadrante: 'SW' };
  return { angulo: 360 - a, quadrante: 'NW' };
}

/** Rumo → azimute. */
export function rumoParaAzimute(r: Rumo): number {
  switch (r.quadrante) {
    case 'NE':
      return r.angulo;
    case 'SE':
      return 180 - r.angulo;
    case 'SW':
      return 180 + r.angulo;
    case 'NW':
      return 360 - r.angulo;
  }
}

/** `45°30'00" SE` — o rumo como o memorial o escreve. */
export function rumoTexto(az: number, casasDoSegundo = 0): string {
  const r = azimuteParaRumo(az);
  return `${gmsTexto(r.angulo, casasDoSegundo)} ${r.quadrante}`;
}

/** `135°30'00"` — o azimute escrito. */
export function azimuteTexto(az: number, casasDoSegundo = 0): string {
  return gmsTexto(((az % 360) + 360) % 360, casasDoSegundo);
}

/**
 * O azimute VERDADEIRO a partir do de quadrícula.
 *
 * O desenho mede o azimute contra o Y da projeção (o norte da quadrícula). O
 * memorial e o SIGEF querem o verdadeiro, que difere pela convergência
 * meridiana — até 2° nas bordas do fuso.
 */
export function azimuteVerdadeiro(azimuteDeQuadricula: number, convergenciaEmGraus: number): number {
  return (((azimuteDeQuadricula + convergenciaEmGraus) % 360) + 360) % 360;
}
