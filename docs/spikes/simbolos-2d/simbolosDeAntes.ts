/**
 * O desenho de ANTES da F16 (cópia fiel de `tracosDoSimbolo`/`tracosDoComponente` de utils/blueprintHumanizada.ts,
 * removidos em 12/10/2026) — só para a prancha de comparação continuar gerável.
 */
import { CATALOGO_DE_COMPONENTES, type TipoDeComponente } from '../../../utils/blueprintKernel';

export type TracoDoSimbolo =
  | { tipo: 'linha'; a: [number, number]; b: [number, number] }
  | { tipo: 'poli'; pontos: [number, number][] }
  /** Centro e raio em FRAÇÃO do menor lado. */
  | { tipo: 'circulo'; c: [number, number]; r: number }
  /** Centro e raios em fração da largura (rx) e da profundidade (ry). */
  | { tipo: 'elipse'; c: [number, number]; rx: number; ry: number };

/**
 * O símbolo de cada peça no espaço LOCAL (x ao longo da largura, y da frente
 * ao encosto, ambos 0..1) — o mesmo desenho do canvas, em forma de dados, para
 * o PDF humanizado desenhar a mesma coisa.
 */
export function tracosDoSimbolo(simbolo: (typeof CATALOGO_DE_COMPONENTES)[keyof typeof CATALOGO_DE_COMPONENTES]['simbolo']): TracoDoSimbolo[] {
  switch (simbolo) {
    case 'CAMA':
      return [
        { tipo: 'linha', a: [0, 0.85], b: [1, 0.85] },
        { tipo: 'poli', pontos: [[0.08, 0.7], [0.46, 0.7], [0.46, 0.82], [0.08, 0.82]] },
        { tipo: 'poli', pontos: [[0.54, 0.7], [0.92, 0.7], [0.92, 0.82], [0.54, 0.82]] },
        { tipo: 'linha', a: [0, 0.55], b: [1, 0.55] },
      ];
    case 'SOFA':
      return [
        { tipo: 'linha', a: [0, 0.75], b: [1, 0.75] },
        { tipo: 'linha', a: [0.12, 0], b: [0.12, 0.75] },
        { tipo: 'linha', a: [0.88, 0], b: [0.88, 0.75] },
      ];
    case 'MESA':
      return [{ tipo: 'poli', pontos: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]] }];
    case 'VASO':
      return [
        { tipo: 'elipse', c: [0.5, 0.4], rx: 0.4, ry: 0.32 },
        { tipo: 'poli', pontos: [[0.1, 0.78], [0.9, 0.78], [0.9, 1], [0.1, 1]] },
      ];
    case 'LAVATORIO':
      return [{ tipo: 'elipse', c: [0.5, 0.5], rx: 0.36, ry: 0.34 }];
    case 'BOX':
      return [
        { tipo: 'linha', a: [0, 0], b: [1, 1] },
        { tipo: 'linha', a: [0.42, 0.5], b: [0.58, 0.5] },
      ];
    case 'PIA':
      return [{ tipo: 'poli', pontos: [[0.1, 0.2], [0.42, 0.2], [0.42, 0.8], [0.1, 0.8]] }];
    case 'FOGAO':
      return [
        { tipo: 'circulo', c: [0.28, 0.3], r: 0.14 },
        { tipo: 'circulo', c: [0.72, 0.3], r: 0.14 },
        { tipo: 'circulo', c: [0.28, 0.7], r: 0.14 },
        { tipo: 'circulo', c: [0.72, 0.7], r: 0.14 },
      ];
    case 'GELADEIRA':
      return [{ tipo: 'linha', a: [0, 0.6], b: [1, 0.6] }];
    case 'TANQUE':
      return [{ tipo: 'poli', pontos: [[0.15, 0.15], [0.85, 0.15], [0.85, 0.85], [0.15, 0.85]] }];
    case 'MAQUINA':
      return [{ tipo: 'circulo', c: [0.5, 0.5], r: 0.3 }];
    case 'ARMARIO':
      return [
        { tipo: 'linha', a: [0, 0], b: [1, 1] },
        { tipo: 'linha', a: [1, 0], b: [0, 1] },
      ];
    case 'CADEIRA':
      return [{ tipo: 'linha', a: [0, 0.8], b: [1, 0.8] }];
    // HVAC (E11.1): os mesmos traços do canvas técnico.
    case 'CONDENSADORA':
      return [
        { tipo: 'circulo', c: [0.5, 0.5], r: 0.38 },
        { tipo: 'linha', a: [0.5, 0.5], b: [0.5, 0.12] },
        { tipo: 'linha', a: [0.5, 0.5], b: [0.83, 0.69] },
        { tipo: 'linha', a: [0.5, 0.5], b: [0.17, 0.69] },
      ];
    case 'EVAPORADORA':
      return [
        { tipo: 'linha', a: [0.08, 0.35], b: [0.92, 0.35] },
        { tipo: 'linha', a: [0.08, 0.2], b: [0.92, 0.2] },
      ];
    case 'EXAUSTOR':
      return [
        { tipo: 'circulo', c: [0.5, 0.5], r: 0.4 },
        { tipo: 'linha', a: [0.2, 0.2], b: [0.8, 0.8] },
        { tipo: 'linha', a: [0.8, 0.2], b: [0.2, 0.8] },
      ];
    case 'RESERVA':
      return [
        { tipo: 'linha', a: [0, 0.5], b: [0.5, 0] },
        { tipo: 'linha', a: [0, 1], b: [1, 0] },
        { tipo: 'linha', a: [0.5, 1], b: [1, 0.5] },
      ];
    default:
      return [];
  }
}

/**
 * O símbolo de UM componente já no MUNDO (mm de modelo): contorno + traços em
 * segmentos e polilinhas (círculos e elipses viram polígonos de 24 lados). É
 * o que o PDF desenha; o canvas continua com arcos verdadeiros.
 */
/**
 * O SÍMBOLO POR TIPO (F9, 11/10/2026 — "símbolos 2D por tipo mais fiéis"): o do `simbolo` da
 * ficha, mais o detalhe que distingue as peças que dividem símbolo — o sofá ganha os assentos, a
 * cama de solteiro um travesseiro só, a mesa as cadeiras, o rack a TV, a estante as prateleiras, o
 * criado e a escrivaninha a gaveta. FONTE ÚNICA: o canvas, os dois PDFs e a miniatura da biblioteca
 * leem daqui (antes o canvas tinha um `switch` próprio, cópia deste).
 */
export function tracosDoComponente(tipoId: TipoDeComponente): TracoDoSimbolo[] {
  const ficha = CATALOGO_DE_COMPONENTES[tipoId];
  if (!ficha) return [];
  switch (tipoId) {
    case 'CAMA_SOLTEIRO':
      return [
        { tipo: 'linha', a: [0, 0.85], b: [1, 0.85] },
        { tipo: 'poli', pontos: [[0.15, 0.7], [0.85, 0.7], [0.85, 0.82], [0.15, 0.82]] },
        { tipo: 'linha', a: [0, 0.55], b: [1, 0.55] },
      ];
    case 'SOFA':
      return [...tracosDoSimbolo('SOFA'), { tipo: 'linha', a: [0.37, 0], b: [0.37, 0.75] }, { tipo: 'linha', a: [0.63, 0], b: [0.63, 0.75] }];
    case 'MESA_JANTAR':
      return [
        { tipo: 'poli', pontos: [[0.05, 0.18], [0.95, 0.18], [0.95, 0.82], [0.05, 0.82]] },
        { tipo: 'poli', pontos: [[0.2, 0], [0.38, 0], [0.38, 0.14], [0.2, 0.14]] },
        { tipo: 'poli', pontos: [[0.62, 0], [0.8, 0], [0.8, 0.14], [0.62, 0.14]] },
        { tipo: 'poli', pontos: [[0.2, 0.86], [0.38, 0.86], [0.38, 1], [0.2, 1]] },
        { tipo: 'poli', pontos: [[0.62, 0.86], [0.8, 0.86], [0.8, 1], [0.62, 1]] },
      ];
    case 'CADEIRA':
      return [{ tipo: 'linha', a: [0, 0.8], b: [1, 0.8] }, { tipo: 'poli', pontos: [[0.12, 0.08], [0.88, 0.08], [0.88, 0.72], [0.12, 0.72]] }];
    case 'RACK':
      return [{ tipo: 'linha', a: [0, 0.5], b: [1, 0.5] }, { tipo: 'poli', pontos: [[0.2, 0.62], [0.8, 0.62], [0.8, 0.78], [0.2, 0.78]] }];
    case 'ESTANTE':
      return [{ tipo: 'linha', a: [0.33, 0], b: [0.33, 1] }, { tipo: 'linha', a: [0.67, 0], b: [0.67, 1] }, { tipo: 'linha', a: [0, 0.1], b: [1, 0.1] }];
    case 'CRIADO':
      return [{ tipo: 'linha', a: [0, 0.5], b: [1, 0.5] }, { tipo: 'linha', a: [0.42, 0.25], b: [0.58, 0.25] }];
    case 'ESCRIVANINHA':
      return [{ tipo: 'poli', pontos: [[0.68, 0.08], [0.95, 0.08], [0.95, 0.92], [0.68, 0.92]] }, { tipo: 'linha', a: [0.68, 0.5], b: [0.95, 0.5] }];
    case 'BANCADA_SECA':
      return [{ tipo: 'linha', a: [0, 0.85], b: [1, 0.85] }];
    case 'GELADEIRA':
      return [...tracosDoSimbolo('GELADEIRA'), { tipo: 'linha', a: [0.85, 0.1], b: [0.85, 0.5] }];
    default:
      return tracosDoSimbolo(ficha.simbolo);
  }
}
