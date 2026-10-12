/**
 * Mapa de fundo da planta (12/10/2026): Mercator, nível de zoom, ladrilhos da
 * área visível, posição do ladrilho no desenho e o estado das linhas do painel.
 */
import { describe, expect, it } from 'vitest';
import {
  afimDoLadrilho,
  estiloDaGrade,
  algumMapaAVista,
  alternarMeioTomDoMapa,
  alternarOlhoDoMapa,
  geoDoLadrilho,
  ladrilhoFracionario,
  ladrilhosDaArea,
  MAPA_OCULTO,
  sanearEstadosDoMapa,
  urlDoLadrilho,
  zoomDoLadrilho,
} from '../utils/blueprintMapaDeFundo';
import { geoParaLocal, localParaGeo } from '../utils/blueprintTopografia';

const GEO = { latitude: -22.6164, longitude: -46.0412 };

describe('Web Mercator', () => {
  it('Chicago no zoom 10 é o ladrilho 262/380 (exemplo da wiki do OpenStreetMap, "Slippy map tilenames")', () => {
    const f = ladrilhoFracionario({ lat: 41.85, lon: -87.65 }, 10);
    expect(Math.floor(f.x)).toBe(262);
    expect(Math.floor(f.y)).toBe(380);
  });

  it('ida e volta exata', () => {
    for (const p of [{ lat: -22.6164, lon: -46.0412 }, { lat: 48.2, lon: 16.37 }, { lat: -0.001, lon: 179.9 }]) {
      const f = ladrilhoFracionario(p, 17);
      const g = geoDoLadrilho(f.x, f.y, 17);
      expect(g.lat).toBeCloseTo(p.lat, 9);
      expect(g.lon).toBeCloseTo(p.lon, 9);
    }
  });
});

describe('zoomDoLadrilho', () => {
  it('1 px de tela ≈ 0,55 m perto de −22,6° → zoom 18 (resolução do 18 = 0,551 m/px)', () => {
    expect(zoomDoLadrilho(1 / 551, -22.6, 19)).toBe(18);
  });
  it('limita ao nativo do servidor (relevo vai só ao 17) e não fica negativo', () => {
    expect(zoomDoLadrilho(1 / 551, -22.6, 17)).toBe(17);
    expect(zoomDoLadrilho(1 / 50, -22.6, 19)).toBe(19);
    expect(zoomDoLadrilho(1e-9, -22.6, 19)).toBe(0);
  });
});

describe('ladrilhosDaArea', () => {
  // A tela mostrando ~400 × 300 m em volta da origem.
  const tela = [
    { x: -200_000, y: -150_000 },
    { x: 200_000, y: -150_000 },
    { x: 200_000, y: 150_000 },
    { x: -200_000, y: 150_000 },
  ];

  it('cobre a área visível: todo canto da tela está dentro de algum ladrilho', () => {
    const ts = ladrilhosDaArea(tela, GEO, 17);
    expect(ts.length).toBeGreaterThan(0);
    expect(ts.every((t) => t.z === 17)).toBe(true);
    for (const p of [...tela, { x: 0, y: 0 }]) {
      const f = ladrilhoFracionario(localParaGeo(p, GEO), 17);
      expect(ts.some((t) => t.x === Math.floor(f.x) && t.y === Math.floor(f.y))).toBe(true);
    }
  });

  it('recua o nível quando passaria do máximo de ladrilhos', () => {
    const ts = ladrilhosDaArea(tela, GEO, 19, 16);
    expect(ts.length).toBeLessThanOrEqual(16);
    expect(ts[0].z).toBeLessThan(19);
  });

  it('com o giro do norte, a área no mundo gira junto (mais ladrilhos no 45°)', () => {
    const reto = ladrilhosDaArea([{ x: -300_000, y: -20_000 }, { x: 300_000, y: -20_000 }, { x: 300_000, y: 20_000 }, { x: -300_000, y: 20_000 }], GEO, 18);
    const girado = ladrilhosDaArea([{ x: -300_000, y: -20_000 }, { x: 300_000, y: -20_000 }, { x: 300_000, y: 20_000 }, { x: -300_000, y: 20_000 }], { ...GEO, rotacaoNorteDeg: 45 }, 18);
    const linhas = (ts: { y: number }[]) => new Set(ts.map((t) => t.y)).size;
    expect(linhas(girado)).toBeGreaterThan(linhas(reto));
  });
});

describe('afimDoLadrilho', () => {
  it('o centro do ladrilho pela afim cai onde geoParaLocal manda (< 1 cm no zoom 17)', () => {
    const f = ladrilhoFracionario({ lat: GEO.latitude, lon: GEO.longitude }, 17);
    const t = { z: 17, x: Math.floor(f.x), y: Math.floor(f.y) };
    const a = afimDoLadrilho(t, GEO);
    const pelaAfim = { x: a.origem.x + 128 * a.porPxX.x + 128 * a.porPxY.x, y: a.origem.y + 128 * a.porPxX.y + 128 * a.porPxY.y };
    const exato = geoParaLocal(geoDoLadrilho(t.x + 0.5, t.y + 0.5, 17), GEO);
    expect(Math.hypot(pelaAfim.x - exato.x, pelaAfim.y - exato.y)).toBeLessThan(10); // mm
  });

  it('norte para cima: x do ladrilho vai para +x do desenho, y do ladrilho para −y; 1 px ≈ 1,1 m no zoom 17', () => {
    const a = afimDoLadrilho({ z: 17, x: 48_772, y: 74_472 }, GEO);
    expect(a.porPxX.x).toBeGreaterThan(1000);
    expect(Math.abs(a.porPxX.y)).toBeLessThan(1);
    expect(a.porPxY.y).toBeLessThan(-1000);
    expect(a.porPxX.x / 1000).toBeCloseTo(1.102, 2);
  });
});

describe('estado das linhas do mapa', () => {
  it('começa oculto; saneia lixo do navegador', () => {
    expect(sanearEstadosDoMapa(null)).toEqual(MAPA_OCULTO);
    expect(sanearEstadosDoMapa({ RUAS: 'VISIVEL', RELEVO: 'qualquer', OUTRO: 1 })).toEqual({ RUAS: 'VISIVEL', RELEVO: 'OCULTA' });
  });
  it('olho e meio-tom com a mesma regra das camadas', () => {
    const v = alternarOlhoDoMapa(MAPA_OCULTO, 'RUAS');
    expect(v).toEqual({ RUAS: 'VISIVEL', RELEVO: 'OCULTA' });
    expect(alternarOlhoDoMapa(v, 'RUAS').RUAS).toBe('OCULTA');
    expect(alternarMeioTomDoMapa(MAPA_OCULTO, 'RELEVO').RELEVO).toBe('ATENUADA');
    expect(alternarMeioTomDoMapa({ RUAS: 'OCULTA', RELEVO: 'ATENUADA' }, 'RELEVO').RELEVO).toBe('VISIVEL');
    expect(alternarOlhoDoMapa({ RUAS: 'ATENUADA', RELEVO: 'OCULTA' }, 'RUAS').RUAS).toBe('OCULTA');
    expect(algumMapaAVista(MAPA_OCULTO)).toBe(false);
    expect(algumMapaAVista({ RUAS: 'OCULTA', RELEVO: 'ATENUADA' })).toBe(true);
  });
  it('URL com subdomínio e o ladrilho', () => {
    expect(urlDoLadrilho('RUAS', { z: 17, x: 48_772, y: 74_472 })).toMatch(/^https:\/\/[abc]\.tile\.openstreetmap\.org\/17\/48772\/74472\.png$/);
    expect(urlDoLadrilho('RELEVO', { z: 17, x: 1, y: 1 })).toMatch(/^https:\/\/[abc]\.tile\.opentopomap\.org\/17\/1\/1\.png$/);
  });
});

describe('estiloDaGrade (12/10/2026: a grade lavava o mapa)', () => {
  it('sem mapa: a grade de sempre (cinza claro opaco, finas a partir de 6 px)', () => {
    expect(estiloDaGrade(false, 10)).toEqual({ cor: '#e2e8f0', corForte: '#cbd5e1', soFortes: false });
    expect(estiloDaGrade(false, 5).soFortes).toBe(true);
  });
  it('sobre o mapa: escurece (ardósia translúcida, nunca branco) e as finas só com 12 px', () => {
    const g = estiloDaGrade(true, 10);
    expect(g.cor).toMatch(/^rgba\(15, 23, 42, 0\.\d+\)$/);
    expect(g.corForte).toMatch(/^rgba\(15, 23, 42, 0\.\d+\)$/);
    expect(g.soFortes).toBe(true);
    expect(estiloDaGrade(true, 12).soFortes).toBe(false);
  });
});
