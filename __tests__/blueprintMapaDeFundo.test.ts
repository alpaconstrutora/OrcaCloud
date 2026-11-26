/**
 * Mapa de fundo da planta (12/10/2026): Mercator, nível de zoom, ladrilhos da
 * área visível, posição do ladrilho no desenho e o estado das linhas do painel.
 */
import { describe, expect, it } from 'vitest';
import {
  afimDoLadrilho,
  planoDaTexturaDoMapa,
  uvNaCaixa,
  type CamadaDaTexturaDoMapa,
  type EstadosDoMapa,
  estiloDaGrade,
  algumMapaAVista,
  alternarMeioTomDoMapa,
  alternarOlhoDoMapa,
  geoDoLadrilho,
  ladrilhoFracionario,
  ladrilhosDaArea,
  FONTE_DO_MAPA,
  FONTES_DO_MAPA,
  ladrilhoAcima,
  MAPA_OCULTO,
  motivoDaFonteIndisponivel,
  sanearEstadosDoMapa,
  urlDaFonte,
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
    expect(sanearEstadosDoMapa({ RUAS: 'VISIVEL', RELEVO: 'qualquer', OUTRO: 1 })).toEqual({ SATELITE: 'OCULTA', RUAS: 'VISIVEL', RELEVO: 'OCULTA' });
  });
  it('olho e meio-tom com a mesma regra das camadas', () => {
    const v = alternarOlhoDoMapa(MAPA_OCULTO, 'RUAS');
    expect(v).toEqual({ SATELITE: 'OCULTA', RUAS: 'VISIVEL', RELEVO: 'OCULTA' });
    expect(alternarOlhoDoMapa(v, 'RUAS').RUAS).toBe('OCULTA');
    expect(alternarMeioTomDoMapa(MAPA_OCULTO, 'RELEVO').RELEVO).toBe('ATENUADA');
    expect(alternarMeioTomDoMapa({ RUAS: 'OCULTA', RELEVO: 'ATENUADA' }, 'RELEVO').RELEVO).toBe('VISIVEL');
    expect(alternarOlhoDoMapa({ RUAS: 'ATENUADA', RELEVO: 'OCULTA' }, 'RUAS').RUAS).toBe('OCULTA');
    expect(algumMapaAVista(MAPA_OCULTO)).toBe(false);
    expect(algumMapaAVista({ RUAS: 'OCULTA', RELEVO: 'ATENUADA' })).toBe(true);
  });
  // 26/11/2026: os mapas são opacos — ruas e relevo ligados escondiam o satélite por baixo. Um por vez.
  it('um mapa de fundo por vez: ligar um (olho ou meio-tom) desliga os outros', () => {
    const tudo: EstadosDoMapa = { SATELITE: 'OCULTA', RUAS: 'VISIVEL', RELEVO: 'ATENUADA' };
    expect(alternarOlhoDoMapa(tudo, 'SATELITE')).toEqual({ SATELITE: 'VISIVEL', RUAS: 'OCULTA', RELEVO: 'OCULTA' });
    expect(alternarMeioTomDoMapa(tudo, 'SATELITE')).toEqual({ SATELITE: 'ATENUADA', RUAS: 'OCULTA', RELEVO: 'OCULTA' });
    // Desligar não liga nada.
    expect(alternarOlhoDoMapa({ SATELITE: 'VISIVEL', RUAS: 'OCULTA', RELEVO: 'OCULTA' }, 'SATELITE')).toEqual(MAPA_OCULTO);
  });
  it('o salvo com mais de um mapa ligado fica só com o de cima (o último desenhado), que é o que já se via', () => {
    expect(sanearEstadosDoMapa({ SATELITE: 'VISIVEL', RUAS: 'VISIVEL', RELEVO: 'VISIVEL' })).toEqual({ SATELITE: 'OCULTA', RUAS: 'OCULTA', RELEVO: 'VISIVEL' });
    expect(sanearEstadosDoMapa({ SATELITE: 'VISIVEL', RUAS: 'ATENUADA' })).toEqual({ SATELITE: 'OCULTA', RUAS: 'ATENUADA', RELEVO: 'OCULTA' });
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

describe('planoDaTexturaDoMapa (o mapa sobre o relevo no 3D, 12/10/2026)', () => {
  // A caixa do relevo do pedido: ~346 × 344 m em volta da origem.
  const caixa = { minX: -173_000, minY: -172_000, maxX: 173_000, maxY: 172_000 };

  it('proporção da caixa, com o lado maior no teto', () => {
    const p = planoDaTexturaDoMapa(caixa, GEO, [{ fonte: 'RUAS', opacidade: 1 }], 2048)!;
    expect(p.larguraPx).toBe(2048);
    expect(p.alturaPx).toBe(Math.round((2048 * 344) / 346));
    const alta = planoDaTexturaDoMapa({ minX: 0, minY: 0, maxX: 100_000, maxY: 200_000 }, GEO, [{ fonte: 'RUAS', opacidade: 1 }], 1000)!;
    expect([alta.larguraPx, alta.alturaPx]).toEqual([500, 1000]);
  });

  it('sem fonte, ou caixa degenerada: null', () => {
    expect(planoDaTexturaDoMapa(caixa, GEO, [])).toBeNull();
    expect(planoDaTexturaDoMapa({ ...caixa, maxX: caixa.minX }, GEO, [{ fonte: 'RUAS', opacidade: 1 }])).toBeNull();
  });

  it('um ponto do mundo cai no mesmo pixel pela matriz do ladrilho e pela conta direta (< 0,5 px); a UV da malha aponta para lá', () => {
    const p = planoDaTexturaDoMapa(caixa, GEO, [{ fonte: 'RELEVO', opacidade: 0.45 }], 2048)!;
    const camada = p.camadas[0];
    expect(camada.opacidade).toBe(0.45);
    for (const ponto of [{ lat: -22.6153, lon: -46.0426 }, { lat: -22.6175, lon: -46.0398 }, { lat: GEO.latitude, lon: GEO.longitude }]) {
      // Direto: lat/lon → mm → pixel da textura (norte em cima).
      const mm = geoParaLocal(ponto, GEO);
      const direto = { x: ((mm.x - caixa.minX) / (caixa.maxX - caixa.minX)) * p.larguraPx, y: ((caixa.maxY - mm.y) / (caixa.maxY - caixa.minY)) * p.alturaPx };
      // Pela matriz: o ladrilho que contém o ponto, no zoom que o plano escolheu.
      const z = Number(camada.ladrilhos[0].url.split('/')[3]);
      const f = ladrilhoFracionario(ponto, z);
      const t = camada.ladrilhos.find((l) => l.url.endsWith(`/${z}/${Math.floor(f.x)}/${Math.floor(f.y)}.png`))!;
      expect(t).toBeTruthy();
      const [a, b, c, d, e, g] = t.matriz;
      const px = (f.x - Math.floor(f.x)) * 256;
      const py = (f.y - Math.floor(f.y)) * 256;
      const pelaMatriz = { x: a * px + c * py + e, y: b * px + d * py + g };
      expect(Math.hypot(pelaMatriz.x - direto.x, pelaMatriz.y - direto.y)).toBeLessThan(0.5);
      // A UV da malha (v com o flipY do three: v = 0 embaixo) aponta para o mesmo pixel.
      const [u, v] = uvNaCaixa(p.caixa, mm.x, mm.y);
      expect(u * p.larguraPx).toBeCloseTo(direto.x, 6);
      expect((1 - v) * p.alturaPx).toBeCloseTo(direto.y, 6);
    }
  });

  it('o zoom acompanha a resolução da textura (346 m em 2048 px ≈ 0,17 m/px → o nativo do servidor)', () => {
    const p = planoDaTexturaDoMapa(caixa, GEO, [{ fonte: 'RUAS', opacidade: 1 }, { fonte: 'RELEVO', opacidade: 1 }], 2048)!;
    const zDe = (c: CamadaDaTexturaDoMapa) => Number(c.ladrilhos[0].url.split('/')[3]);
    expect(zDe(p.camadas[1])).toBe(17); // relevo: teto 17
    expect(zDe(p.camadas[0])).toBeGreaterThanOrEqual(17);
    expect(p.camadas.every((c) => c.ladrilhos.length > 0 && c.ladrilhos.length <= 64)).toBe(true);
  });
});

/**
 * MAPA: SATÉLITE (26/11/2026) — pergunta: *"é possivel inserirnos visão via satelite? estamos usando o open street
 * maps e ele nao tem imagem por satelite?"* → *"siga com a Esri"*. World Imagery da Esri pelo serviço COM chave
 * (`ibasemaps-api`, ArcGIS Location Platform — uso comercial com a chave; CORS `*`, serve de textura no 3D). A chave
 * vem de `VITE_ARCGIS_API_KEY`; sem ela, a camada fica indisponível e diz por quê.
 */
describe('Mapa: satélite (Esri World Imagery)', () => {
  it('⚠️ PRONTO QUANDO: é uma fonte do mapa, por BAIXO de ruas e relevo, oculta por padrão', () => {
    expect(FONTES_DO_MAPA).toEqual(['SATELITE', 'RUAS', 'RELEVO']);
    expect(MAPA_OCULTO.SATELITE).toBe('OCULTA');
    expect(sanearEstadosDoMapa({ SATELITE: 'ATENUADA' }).SATELITE).toBe('ATENUADA');
    expect(FONTE_DO_MAPA.SATELITE.rotulo).toBe('Mapa: satélite');
  });

  it('o ladrilho é o World Imagery com a chave (ordem z/y/x da Esri)', () => {
    const url = urlDoLadrilho('SATELITE', { z: 17, x: 48_000, y: 73_000 }, 'CHAVE-TESTE');
    expect(url).toBe('https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/17/73000/48000?blankTile=false&token=CHAVE-TESTE');
    // O Leaflet (Desenhar no mapa) recebe o modelo já com a chave.
    expect(urlDaFonte('SATELITE', 'K')).toBe('https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?blankTile=false&token=K');
    // As outras fontes não mudam.
    expect(urlDoLadrilho('RUAS', { z: 3, x: 1, y: 2 })).toBe('https://a.tile.openstreetmap.org/3/1/2.png');
  });

  it('a atribuição exigida pela Esri: "Powered by Esri" + os créditos do item World Imagery', () => {
    expect(FONTE_DO_MAPA.SATELITE.atribuicaoTexto).toBe('Powered by Esri · Esri, Vantor, Earthstar Geographics, and the GIS User Community');
  });

  it('sem chave, indisponível — e diz por quê; com chave (ou outra fonte), disponível', () => {
    expect(motivoDaFonteIndisponivel('SATELITE', '')).toMatch(/chave da Esri/i);
    expect(motivoDaFonteIndisponivel('SATELITE', 'K')).toBeNull();
    expect(motivoDaFonteIndisponivel('RUAS', '')).toBeNull();
  });
});

/**
 * O RECUO DO LADRILHO (26/11/2026): a Esri não tem imagem no zoom 19 (e às vezes 18) fora das cidades — medido: em MT,
 * BA e AM só até o 17; em Campinas, até o 19. Com `blankTile=false` o servidor responde 404 no lugar do ladrilho
 * "Map data not yet available", e quem desenha cai para o PAI (o recorte dele que cobre o ladrilho), até 3 níveis.
 */
describe('ladrilhoAcima (recuo para o pai quando falta imagem)', () => {
  it('n = 0: o próprio ladrilho, inteiro', () => {
    expect(ladrilhoAcima({ z: 19, x: 10, y: 6 }, 0)).toEqual({ pai: { z: 19, x: 10, y: 6 }, recorte: { sx: 0, sy: 0, lado: 256 } });
  });
  it('n = 1: o pai e o quarto dele (x ímpar, y par → canto de cima à direita)', () => {
    expect(ladrilhoAcima({ z: 19, x: 11, y: 6 }, 1)).toEqual({ pai: { z: 18, x: 5, y: 3 }, recorte: { sx: 128, sy: 0, lado: 128 } });
  });
  it('n = 2: o avô e o 1/16 dele', () => {
    expect(ladrilhoAcima({ z: 19, x: 7, y: 5 }, 2)).toEqual({ pai: { z: 17, x: 1, y: 1 }, recorte: { sx: 192, sy: 64, lado: 64 } });
  });
  it('a URL do satélite pede 404 no lugar do ladrilho vazio (blankTile=false)', () => {
    expect(urlDoLadrilho('SATELITE', { z: 19, x: 1, y: 2 }, 'K')).toContain('blankTile=false');
  });
});

