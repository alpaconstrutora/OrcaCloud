/**
 * As árvores da Maquete (25/11/2026): cada pixel de mata do WorldCover vira 1–2 árvores no desenho,
 * sempre as mesmas para a mesma cobertura, fora dos prédios, do que o estudo desenhou e do relevo.
 */
import { describe, expect, it } from 'vitest';
import { aleatorioDe, arvoresDaCobertura } from '../utils/blueprintMaqueteArvores';
import { CLASSE_ARVORE, PIXELS_POR_GRAU, type GradeDeCobertura } from '../utils/geo/coberturaDoSolo';
import { geoParaLocal } from '../utils/blueprintTopografia';

const GEO = { latitude: -22.9, longitude: -47.06 };
/** 20 × 20 pixels de ~9 m com canto NO um pouco a noroeste da origem do desenho. */
const col0 = Math.round(-47.0608 * PIXELS_POR_GRAU);
const lin0 = Math.round(-22.8992 * PIXELS_POR_GRAU);
function grade(classe: (r: number, k: number) => number): GradeDeCobertura {
  const classes = new Uint8Array(400);
  for (let r = 0; r < 20; r++) for (let k = 0; k < 20; k++) classes[r * 20 + k] = classe(r, k);
  return { oeste: col0 / PIXELS_POR_GRAU, norte: lin0 / PIXELS_POR_GRAU, passoGraus: 1 / PIXELS_POR_GRAU, colunas: 20, linhas: 20, classes };
}
const tudoMata = grade(() => CLASSE_ARVORE);
const plano = () => 700;

describe('arvoresDaCobertura', () => {
  it('só os pixels de classe 10 dão árvore; 1 ou 2 por pixel, dentro do pixel, no chão do relevo', () => {
    const metade = grade((_, k) => (k < 10 ? CLASSE_ARVORE : 30));
    const a = arvoresDaCobertura(metade, GEO, plano);
    expect(a.length).toBeGreaterThanOrEqual(200);
    expect(a.length).toBeLessThanOrEqual(400);
    // A coluna 10 (a primeira de pasto) começa a leste de todas as árvores.
    const limite = geoParaLocal({ lat: GEO.latitude, lon: (col0 + 10) / PIXELS_POR_GRAU }, GEO).x;
    expect(a.every((t) => t.x < limite + 1)).toBe(true);
    expect(a.every((t) => t.baseM === 700 && t.alturaM >= 5 && t.alturaM <= 12 && t.copaM > 0)).toBe(true);
  });

  it('determinístico: a mesma cobertura dá as mesmas árvores', () => {
    expect(arvoresDaCobertura(tudoMata, GEO, plano)).toEqual(arvoresDaCobertura(tudoMata, GEO, plano));
  });

  it('fora do relevo, dentro de prédio do OSM ou sobre o que o estudo desenhou: sem árvore', () => {
    const todas = arvoresDaCobertura(tudoMata, GEO, plano);
    // Relevo só a leste de x = 0.
    const soLeste = arvoresDaCobertura(tudoMata, GEO, (p) => (p.x >= 0 ? 700 : null));
    expect(soLeste.length).toBeLessThan(todas.length);
    expect(soLeste.every((t) => t.x >= 0)).toBe(true);
    // Um prédio e uma área construída cobrindo partes diferentes.
    const xs = todas.map((t) => t.x);
    const ys = todas.map((t) => t.y);
    const meioX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const meioY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const predio = [
      { x: Math.min(...xs) - 1, y: Math.min(...ys) - 1 },
      { x: meioX, y: Math.min(...ys) - 1 },
      { x: meioX, y: meioY },
      { x: Math.min(...xs) - 1, y: meioY },
    ];
    const construido = { minX: meioX, minY: meioY, maxX: Math.max(...xs) + 1, maxY: Math.max(...ys) + 1 };
    const sobra = arvoresDaCobertura(tudoMata, GEO, plano, { predios: [predio], construido: [construido] });
    expect(sobra.some((t) => t.x < meioX && t.y < meioY)).toBe(false);
    expect(sobra.some((t) => t.x > meioX && t.y > meioY)).toBe(false);
    expect(sobra.length).toBeGreaterThan(0);
  });

  it('acima do teto, a mata rareia por igual (não corta um lado)', () => {
    const todas = arvoresDaCobertura(tudoMata, GEO, plano);
    const poucas = arvoresDaCobertura(tudoMata, GEO, plano, {}, 100);
    expect(poucas.length).toBeGreaterThan(50);
    expect(poucas.length).toBeLessThan(160);
    const xs = todas.map((t) => t.x);
    const meio = (Math.min(...xs) + Math.max(...xs)) / 2;
    const oeste = poucas.filter((t) => t.x < meio).length;
    expect(oeste / poucas.length).toBeGreaterThan(0.3);
    expect(oeste / poucas.length).toBeLessThan(0.7);
  });

  it('aleatorioDe fica em [0, 1)', () => {
    for (let s = -1000; s < 1000; s += 7) {
      const v = aleatorioDe(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
