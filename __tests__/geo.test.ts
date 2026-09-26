/**
 * MÓDULO GEODÉSICO (A0) — projeção, datum, convergência, SGL e o vocabulário
 * angular do memorial.
 *
 * ⚠️ COMO ESTE ARQUIVO PROVA O QUE PROVA, e o que ele NÃO prova.
 *
 * Não há aqui coordenadas "oficiais" copiadas de uma estação da RBMC: eu não
 * tenho como conferir esse número, e um valor inventado com cara de oficial
 * seria pior que nenhum. O que se afirma é o que dá para verificar:
 *
 *  1. EQUIVALÊNCIA com `utmParaLatLon`, a implementação própria que já está em
 *     produção desde 11/09/2026 e foi validada contra levantamentos reais. Se o
 *     proj4 discordar dela, um dos dois está errado — e é isso que se quer
 *     saber ANTES de trocar.
 *  2. IDA E VOLTA no milímetro: converter e desconverter tem de devolver o
 *     mesmo ponto.
 *  3. PROPRIEDADES da projeção que são definição, não medição: fator 0,9996 e
 *     convergência zero no meridiano central, sinais nos dois lados dele.
 *  4. ORDEM DE GRANDEZA do deslocamento SAD 69 → SIRGAS 2000: dezenas de
 *     metros no Brasil. Um valor de centímetros ou de quilômetros denuncia
 *     parâmetro errado.
 */
import { describe, expect, it } from 'vitest';
import {
  lerCrs,
  crsPorCodigo,
  conferirFuso,
  zonaDaLongitude,
  meridianoCentral,
  utmSirgasDaLongitude,
  SIRGAS2000_GEO,
  SAD69_GEO,
  WGS84_GEO,
  CATALOGO_DE_CRS,
  geoParaProjetado,
  projetadoParaGeo,
  transformarDatum,
  convergenciaMeridiana,
  fatorDeEscala,
  distanciaNoElipsoide,
  K0_UTM,
  paraGms,
  deGms,
  gmsTexto,
  latitudeTexto,
  longitudeTexto,
  azimute,
  azimuteParaRumo,
  rumoParaAzimute,
  rumoTexto,
  azimuteTexto,
  azimuteVerdadeiro,
  geoParaSgl,
  sglParaGeo,
  areaNoSgl,
  avisoDoAlcance,
  desvioDaAreaEmUtm,
  ALCANCE_DO_PTL_M,
} from '../utils/geo';
import { utmParaLatLon } from '../utils/blueprintTopografiaImportacao';

/** Pontos espalhados pelo Brasil, cobrindo cinco fusos. */
const PONTOS = [
  { nome: 'Belo Horizonte', lat: -19.9167, lon: -43.9345, zona: 23 },
  { nome: 'São Paulo', lat: -23.5505, lon: -46.6333, zona: 23 },
  { nome: 'Brasília', lat: -15.7939, lon: -47.8828, zona: 23 },
  { nome: 'Recife', lat: -8.0476, lon: -34.877, zona: 25 },
  { nome: 'Manaus', lat: -3.119, lon: -60.0217, zona: 20 },
  { nome: 'Porto Alegre', lat: -30.0346, lon: -51.2177, zona: 22 },
  { nome: 'Cuiabá', lat: -15.6014, lon: -56.0979, zona: 21 },
];

describe('catálogo de sistemas', () => {
  it('o fuso sai da longitude, e o meridiano central do fuso', () => {
    expect(zonaDaLongitude(-43.9345)).toBe(23);
    expect(zonaDaLongitude(-60.0217)).toBe(20);
    expect(meridianoCentral(23)).toBe(-45);
    expect(meridianoCentral(20)).toBe(-63);
  });

  it('cada ponto do Brasil cai no fuso que a tabela diz', () => {
    for (const p of PONTOS) expect(zonaDaLongitude(p.lon)).toBe(p.zona);
  });

  it('lê o código, o nome e a forma curta do topógrafo', () => {
    expect(lerCrs('EPSG:31983').crs?.nome).toBe('SIRGAS 2000 / UTM 23S');
    expect(lerCrs('31983').crs?.codigo).toBe('EPSG:31983');
    expect(lerCrs('SIRGAS 2000 / UTM 23S').crs?.codigo).toBe('EPSG:31983');

    // A forma curta assume SIRGAS — e DIZ que assumiu.
    const curta = lerCrs('UTM 23S');
    expect(curta.crs?.codigo).toBe('EPSG:31983');
    expect(curta.assumido).toMatch(/SIRGAS 2000/);
  });

  it('recusa com motivo o que não está no catálogo', () => {
    expect(lerCrs('EPSG:99999').crs).toBeNull();
    expect(lerCrs('99999').motivo).toMatch(/não está no catálogo/i);
    expect(lerCrs('UTM 23N').motivo).toMatch(/hemisfério norte/i);
    expect(lerCrs('UTM 40S').motivo).toMatch(/fora dos que cobrem o Brasil/i);
    expect(lerCrs('').crs).toBeNull();
  });

  it('SAD 69 e Córrego Alegre entram como HERDADOS — origem, nunca destino', () => {
    expect(crsPorCodigo('EPSG:29193')?.herdado).toBe(true);
    expect(crsPorCodigo('EPSG:22523')?.herdado).toBe(true);
    expect(crsPorCodigo('EPSG:31983')?.herdado).toBeUndefined();
    // O catálogo cobre os 8 fusos do Brasil em SIRGAS.
    expect(CATALOGO_DE_CRS.filter((c) => c.datum === 'SIRGAS2000' && c.zona != null)).toHaveLength(8);
  });

  it('⚠️ avisa quando o fuso escolhido não contém a longitude', () => {
    const fuso23 = crsPorCodigo('EPSG:31983')!;
    expect(conferirFuso(fuso23, -43.93)).toBeNull();
    // Manaus (-60°) está no fuso 20: converter no 23 desloca centenas de km.
    const aviso = conferirFuso(fuso23, -60.02);
    expect(aviso).toMatch(/fuso 20/);
    expect(aviso).toMatch(/centenas de quilômetros/);
  });
});

describe('projeção — a conta que não pode divergir', () => {
  it('⚠️ o proj4 concorda com a implementação PRÓPRIA em produção (< 1 mm)', () => {
    for (const p of PONTOS) {
      const crs = utmSirgasDaLongitude(p.lon)!;
      const { valor } = geoParaProjetado({ lat: p.lat, lon: p.lon }, crs);

      // A implementação antiga, que já roda: a inversa a partir do mesmo E/N.
      const antiga = utmParaLatLon(valor.este, valor.norte, crs.zona!, 'S');
      // 1e-8 grau ≈ 1 mm. Discordância maior significa que um dos dois erra.
      expect(antiga.lat).toBeCloseTo(p.lat, 8);
      expect(antiga.lon).toBeCloseTo(p.lon, 8);
    }
  });

  it('ida e volta devolve o mesmo ponto', () => {
    for (const p of PONTOS) {
      const crs = utmSirgasDaLongitude(p.lon)!;
      const ida = geoParaProjetado({ lat: p.lat, lon: p.lon }, crs).valor;
      const volta = projetadoParaGeo({ este: ida.este, norte: ida.norte }, crs).valor;
      expect(volta.lat).toBeCloseTo(p.lat, 9);
      expect(volta.lon).toBeCloseTo(p.lon, 9);
    }
  });

  it('sem destino, escolhe o fuso da longitude e diz qual usou', () => {
    const r = geoParaProjetado({ lat: -3.119, lon: -60.0217 });
    expect(r.valor.crs.codigo).toBe('EPSG:31980'); // fuso 20
    expect(r.valor.este).toBeGreaterThan(100_000);
    expect(r.valor.este).toBeLessThan(900_000);
    // Hemisfério sul: o norte anda perto de 10 milhões.
    expect(r.valor.norte).toBeGreaterThan(9_000_000);
  });

  it('avisa quando o leste está fora da faixa do fuso', () => {
    const crs = crsPorCodigo('EPSG:31983')!;
    const { avisos } = projetadoParaGeo({ este: 950_000, norte: 7_800_000 }, crs);
    expect(avisos.some((a) => /fora da faixa usual/i.test(a))).toBe(true);
  });
});

describe('transformação de datum', () => {
  it('⚠️ SAD 69 → SIRGAS 2000 desloca DEZENAS de metros — não centímetros nem km', () => {
    const ponto = { lat: -19.9167, lon: -43.9345 };
    const { valor, avisos } = transformarDatum(ponto, SAD69_GEO, SIRGAS2000_GEO);

    // Grau de latitude ≈ 111 km; converto a diferença para metros.
    const dNorte = Math.abs(valor.lat - ponto.lat) * 111_320;
    const dLeste = Math.abs(valor.lon - ponto.lon) * 111_320 * Math.cos((ponto.lat * Math.PI) / 180);
    const desloc = Math.hypot(dNorte, dLeste);

    expect(desloc).toBeGreaterThan(10);
    expect(desloc).toBeLessThan(200);
    // E a mudança de referencial é DITA, não silenciosa.
    expect(avisos.some((a) => /Mudança de referencial/i.test(a))).toBe(true);
  });

  it('SIRGAS e WGS 84 são tratados como coincidentes, sem ruído de aviso', () => {
    const ponto = { lat: -19.9167, lon: -43.9345 };
    const { valor, avisos } = transformarDatum(ponto, WGS84_GEO, SIRGAS2000_GEO);
    expect(valor.lat).toBeCloseTo(ponto.lat, 7);
    expect(avisos).toHaveLength(0);
  });
});

describe('convergência meridiana e fator de escala', () => {
  it('no meridiano central a convergência é zero e o fator é 0,9996', () => {
    const noMc = { lat: -20, lon: meridianoCentral(23) };
    expect(convergenciaMeridiana(noMc, 23)).toBeCloseTo(0, 10);
    expect(fatorDeEscala(noMc, 23)).toBeCloseTo(K0_UTM, 9);
  });

  it('o sinal da convergência acompanha o lado do MC — e o HEMISFÉRIO', () => {
    // γ = Δλ · sen(φ). No hemisfério SUL o seno é negativo, então a leste do
    // meridiano central a convergência é NEGATIVA — o contrário do que a
    // intuição do hemisfério norte sugere, e a razão de o azimute verdadeiro
    // ser menor que o de quadrícula no leste do fuso.
    expect(convergenciaMeridiana({ lat: -20, lon: -43 }, 23)).toBeLessThan(0);
    expect(convergenciaMeridiana({ lat: -20, lon: -47 }, 23)).toBeGreaterThan(0);
    // No hemisfério norte o sinal se inverte.
    expect(convergenciaMeridiana({ lat: 20, lon: -43 }, 23)).toBeGreaterThan(0);
    // E a grandeza fica abaixo de 2° dentro do fuso.
    expect(Math.abs(convergenciaMeridiana({ lat: -20, lon: -42 }, 23))).toBeLessThan(2);
  });

  it('o fator passa de 1 longe do meridiano central', () => {
    // A ~180 km do MC a projeção deixa de encolher e passa a esticar.
    expect(fatorDeEscala({ lat: -20, lon: -45 }, 23)).toBeLessThan(1);
    expect(fatorDeEscala({ lat: -20, lon: -42 }, 23)).toBeGreaterThan(1);
  });

  it('a distância no elipsoide desfaz o fator de escala', () => {
    const p = { lat: -20, lon: -45 };
    const naQuadricula = 1000;
    const real = distanciaNoElipsoide(naQuadricula, p, 23);
    // No meridiano central a quadrícula ENCOLHE: a real é maior.
    expect(real).toBeGreaterThan(naQuadricula);
    expect(real).toBeCloseTo(naQuadricula / K0_UTM, 6);
  });
});

describe('vocabulário angular do memorial', () => {
  it('decimal ↔ GMS, ida e volta', () => {
    expect(paraGms(-19.9167)).toMatchObject({ graus: 19, minutos: 55, sinal: -1 });
    expect(deGms(paraGms(-19.9167))).toBeCloseTo(-19.9167, 9);
    expect(deGms(paraGms(45.5))).toBeCloseTo(45.5, 9);
  });

  it('⚠️ o segundo que arredonda para 60 sobe para o minuto, e o minuto para o grau', () => {
    // 0,99999999° → 0°59'60" seria escrita inválida.
    const g = paraGms(0.99999999, 3);
    expect(g.segundos).toBeLessThan(60);
    expect(g.minutos).toBeLessThan(60);
    expect(deGms(g)).toBeCloseTo(1, 6);

    // E no limite do grau inteiro.
    const h = paraGms(1.9999999999, 3);
    expect(h.graus).toBe(2);
    expect(h.minutos).toBe(0);
    expect(h.segundos).toBe(0);
  });

  it('a latitude e a longitude saem com a letra do hemisfério', () => {
    expect(latitudeTexto(-19.9167)).toMatch(/S$/);
    expect(longitudeTexto(-43.9345)).toMatch(/W$/);
    expect(gmsTexto(45.5, 0)).toBe('45°30\'00"');
  });

  it('⚠️ o azimute conta do NORTE, no sentido horário', () => {
    const origem = { x: 0, y: 0 };
    expect(azimute(origem, { x: 0, y: 10 })).toBeCloseTo(0, 9); // norte
    expect(azimute(origem, { x: 10, y: 0 })).toBeCloseTo(90, 9); // leste
    expect(azimute(origem, { x: 0, y: -10 })).toBeCloseTo(180, 9); // sul
    expect(azimute(origem, { x: -10, y: 0 })).toBeCloseTo(270, 9); // oeste
    expect(azimute(origem, { x: 10, y: 10 })).toBeCloseTo(45, 9);
  });

  it('azimute ↔ rumo nos quatro quadrantes', () => {
    expect(azimuteParaRumo(45)).toEqual({ angulo: 45, quadrante: 'NE' });
    expect(azimuteParaRumo(135)).toEqual({ angulo: 45, quadrante: 'SE' });
    expect(azimuteParaRumo(225)).toEqual({ angulo: 45, quadrante: 'SW' });
    expect(azimuteParaRumo(315)).toEqual({ angulo: 45, quadrante: 'NW' });
    for (const az of [0, 30, 95, 180, 200, 275, 359]) {
      expect(rumoParaAzimute(azimuteParaRumo(az))).toBeCloseTo(az, 9);
    }
    expect(rumoTexto(135)).toBe('45°00\'00" SE');
  });

  it('o azimute verdadeiro é o de quadrícula mais a convergência', () => {
    expect(azimuteVerdadeiro(90, 0.5)).toBeCloseTo(90.5, 9);
    // E fecha o círculo em vez de passar de 360.
    expect(azimuteVerdadeiro(359.8, 0.5)).toBeCloseTo(0.3, 9);
  });
});

describe('Sistema Geodésico Local (NBR 14166)', () => {
  const ORIGEM = { origem: { lat: -19.9167, lon: -43.9345 }, altitudeM: 850 };

  it('ida e volta no milímetro', () => {
    const ponto = { lat: -19.92, lon: -43.93 };
    const sgl = geoParaSgl(ponto, ORIGEM);
    const volta = sglParaGeo(sgl, ORIGEM);
    expect(volta.lat).toBeCloseTo(ponto.lat, 10);
    expect(volta.lon).toBeCloseTo(ponto.lon, 10);
  });

  it('a origem fica no zero, e as constantes a deslocam', () => {
    expect(geoParaSgl(ORIGEM.origem, ORIGEM)).toEqual({ este: 0, norte: 0 });
    const deslocado = geoParaSgl(ORIGEM.origem, { ...ORIGEM, falsoEsteM: 150_000, falsoNorteM: 250_000 });
    expect(deslocado).toEqual({ este: 150_000, norte: 250_000 });
  });

  it('⚠️ a ÁREA no SGL é maior que a medida em UTM — é a diferença que vai à matrícula', () => {
    // Um quadrado de 100 m de lado perto do meridiano central.
    const lado = 100;
    const areaReal = areaNoSgl([
      { este: 0, norte: 0 },
      { este: lado, norte: 0 },
      { este: lado, norte: lado },
      { este: 0, norte: lado },
    ]);
    expect(areaReal).toBeCloseTo(10_000, 6);

    // Em UTM, perto do MC, a mesma área sai encolhida por k² ≈ 0,9992.
    const desvio = desvioDaAreaEmUtm(fatorDeEscala({ lat: -20, lon: -45 }, 23));
    expect(desvio).toBeLessThan(0);
    expect(Math.abs(desvio)).toBeGreaterThan(0.07); // ~0,08%
    // Numa gleba de 100 ha isso passa de 800 m².
    expect((Math.abs(desvio) / 100) * 1_000_000).toBeGreaterThan(700);
  });

  it('avisa além do alcance da NBR 14166, e cala dentro dele', () => {
    expect(avisoDoAlcance({ este: 10_000, norte: 10_000 }, ORIGEM)).toBeNull();
    const longe = avisoDoAlcance({ este: 60_000, norte: 0 }, ORIGEM);
    expect(longe).toMatch(new RegExp(`${ALCANCE_DO_PTL_M / 1000} km`));
    expect(longe).toMatch(/NBR 14166/);
  });

  it('a altitude entra: ignorá-la encolhe as distâncias', () => {
    const ponto = { lat: -19.9, lon: -43.9345 };
    const comAltitude = geoParaSgl(ponto, ORIGEM);
    const semAltitude = geoParaSgl(ponto, { ...ORIGEM, altitudeM: 0 });
    expect(Math.abs(comAltitude.norte)).toBeGreaterThan(Math.abs(semAltitude.norte));
    // 850 m de altitude sobre ~6.371 km de raio: ~13 cm por km.
    const razao = comAltitude.norte / semAltitude.norte;
    expect(razao).toBeCloseTo(1 + 850 / 6_371_000, 5);
  });
});

describe('azimute que arredonda para 360 (achado do harness da A1)', () => {
  it('359,99999° escreve 0°00\'00", e o rumo é NE — não 360° nem NW', () => {
    expect(azimuteTexto(359.99999)).toBe('0°00\'00"');
    expect(rumoTexto(359.99999)).toBe('0°00\'00" NE');
    // e um norte de verdade continua norte
    expect(azimuteTexto(0)).toBe('0°00\'00"');
    // sem estragar quem NÃO arredonda para 360
    expect(azimuteTexto(359.5, 0)).toBe('359°30\'00"');
  });
});
