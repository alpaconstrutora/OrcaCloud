/**
 * VIAS E GREIDE (C2) — os casos analíticos.
 *
 *  - eixo reto de 200 m em rampa de 1 % sobre terreno plano: 11 estacas, nota
 *    de serviço com a cota do greide certa em cada uma e volumes que fecham
 *    com a fórmula das áreas médias (área = h·w + h²·H no terreno plano);
 *  - estaqueamento com vértice: estaca fracionária no vértice, sem duplicar a
 *    inteira que cai em cima dele;
 *  - curva vertical: no PIV a parábola afasta (g₂ − g₁)·L/8 da tangente;
 *  - seção em corte no plano: crista a h·H do bordo e área simétrica;
 *  - locação: sai no PNEZD que o importador lê de volta, com as mesmas coordenadas.
 */
import { describe, expect, it } from 'vitest';
import {
  comprimentoDoEixoM,
  conferirGreide,
  cotaDoGreide,
  csvDaNotaDeServico,
  csvDeLocacaoDaVia,
  csvDoGreide,
  estaquear,
  greideDoTerreno,
  meiaPlataformaM,
  nomeDaEstaca,
  notaDeServico,
  pontoNaSecao,
  pontosDeLocacaoDaVia,
  rampasDoGreide,
  secaoTransversal,
  secoesTransversais,
  SECAO_TIPO_PADRAO,
  volumesPorAreasMedias,
  type Greide,
} from '../utils/blueprintVias';
import { importarPontos } from '../utils/blueprintTopografiaImportacao';

const plano = (cota: number) => () => cota;
/** Eixo reto de 200 m para o norte (+Y). */
const EIXO = [
  { x: 0, y: 0 },
  { x: 0, y: 200_000 },
];

describe('estaqueamento', () => {
  it('nomeia k+f,ff a partir do passo', () => {
    expect(nomeDaEstaca(0)).toBe('0+0,00');
    expect(nomeDaEstaca(20)).toBe('1+0,00');
    expect(nomeDaEstaca(72.5)).toBe('3+12,50');
    expect(nomeDaEstaca(60.000000001)).toBe('3+0,00');
    expect(nomeDaEstaca(25, 10)).toBe('2+5,00');
  });

  it('eixo reto de 200 m a passo 20 dá 11 estacas, a última no fim, com o azimute do trecho', () => {
    const e = estaquear(EIXO, 20);
    expect(e).toHaveLength(11);
    expect(e[0].nome).toBe('0+0,00');
    expect(e[10].nome).toBe('10+0,00');
    expect(e[10].distM).toBe(200);
    expect(e[10].vertice).toBe(true);
    expect(e[5].y).toBeCloseTo(100_000, 6);
    expect(e[5].azimuteDeg).toBeCloseTo(0, 9);
    expect(comprimentoDoEixoM(EIXO)).toBe(200);
  });

  it('vértice a 50 m: estaca fracionária 2+10,00, e a inteira que cai NO vértice não duplica', () => {
    const eixo = [
      { x: 0, y: 0 },
      { x: 0, y: 50_000 },
      { x: 40_000, y: 50_000 },
    ];
    const e = estaquear(eixo, 20);
    expect(e.map((x) => x.nome)).toEqual(['0+0,00', '1+0,00', '2+0,00', '2+10,00', '3+0,00', '4+0,00', '4+10,00']);
    expect(e[3].vertice).toBe(true);
    expect(e[4].azimuteDeg).toBeCloseTo(90, 9);
    // 4+10,00 = 90 m = fim (50 + 40)
    expect(e[6].distM).toBeCloseTo(90, 9);
    // inteira em cima do vértice: eixo de 40 m → 0, 1, 2 (=vértice) sem repetir
    const e2 = estaquear([{ x: 0, y: 0 }, { x: 0, y: 40_000 }, { x: 0, y: 60_000 }], 20);
    expect(e2.map((x) => x.nome)).toEqual(['0+0,00', '1+0,00', '2+0,00', '3+0,00']);
    expect(e2[2].vertice).toBe(true);
  });
});

describe('greide', () => {
  it('reta entre PIVs; fora do trecho é null; um PIV só é constante', () => {
    const g: Greide = { pontos: [{ distM: 0, cotaM: 100 }, { distM: 200, cotaM: 102 }] };
    expect(cotaDoGreide(g, 0)).toBe(100);
    expect(cotaDoGreide(g, 100)).toBeCloseTo(101, 9);
    expect(cotaDoGreide(g, 200)).toBe(102);
    expect(cotaDoGreide(g, 250)).toBeNull();
    expect(cotaDoGreide({ pontos: [{ distM: 10, cotaM: 5 }] }, 999)).toBe(5);
    expect(rampasDoGreide(g)).toEqual([{ deM: 0, ateM: 200, declividadePct: 1 }]);
  });

  it('curva vertical parabólica: no PIV, afasta (g₂ − g₁)·L/8 da tangente e emenda nas pontas', () => {
    // sobe 4 % até 100 m, desce 2 % depois; curva de 40 m no PIV
    const g: Greide = { pontos: [{ distM: 0, cotaM: 100 }, { distM: 100, cotaM: 104, curvaM: 40 }, { distM: 200, cotaM: 102 }] };
    const g1 = 0.04;
    const g2 = -0.02;
    // nas pontas da curva, cota da tangente
    expect(cotaDoGreide(g, 80)).toBeCloseTo(100 + g1 * 80, 9);
    expect(cotaDoGreide(g, 120)).toBeCloseTo(104 + g2 * 20, 9);
    // no PIV: tangente − |g₂ − g₁|·L/8 (curva convexa)
    expect(cotaDoGreide(g, 100)).toBeCloseTo(104 + ((g2 - g1) * 40) / 8, 9);
    // simétrica em torno do PIV em relação às tangentes
    const dEsq = 100 + g1 * 90 - cotaDoGreide(g, 90)!;
    const dDir = 104 + g2 * 10 - cotaDoGreide(g, 110)!;
    expect(dEsq).toBeCloseTo(dDir, 9);
  });

  it('conferência: rampa acima do máximo e curva que não cabe são DITAS', () => {
    expect(conferirGreide({ pontos: [{ distM: 0, cotaM: 100 }, { distM: 100, cotaM: 115 }] })).toEqual([
      expect.stringMatching(/Rampa de 15,0 %.*acima de 12 %/),
    ]);
    expect(conferirGreide({ pontos: [{ distM: 0, cotaM: 100 }, { distM: 10, cotaM: 100.5, curvaM: 40 }, { distM: 200, cotaM: 102 }] })).toEqual([
      expect.stringMatching(/Curva vertical de 40 m.*não cabe/),
    ]);
    expect(conferirGreide({ pontos: [{ distM: 0, cotaM: 100 }, { distM: 200, cotaM: 102 }] })).toEqual([]);
  });

  it('greide de partida: reta do terreno no início ao terreno no fim', () => {
    const e = estaquear(EIXO, 20);
    const g = greideDoTerreno(e, (p) => 100 + p.y / 100_000);
    expect(g).toEqual({ pontos: [{ distM: 0, cotaM: 100 }, { distM: 200, cotaM: 102 }] });
    expect(greideDoTerreno(e, () => null)).toBeNull();
  });
});

describe('seção transversal', () => {
  const S = SECAO_TIPO_PADRAO; // pista 7, calçada 2 → b = 5,5; taludes 1:1,5
  const e0 = estaquear(EIXO, 20)[0];

  it('a direita de quem caminha para +Y é +X', () => {
    expect(pontoNaSecao(e0, 5.5)).toEqual({ x: 5500, y: 0 });
    const eLeste = estaquear([{ x: 0, y: 0 }, { x: 100_000, y: 0 }], 20)[0];
    const d = pontoNaSecao(eLeste, 3);
    expect(d.x).toBeCloseTo(0, 6);
    expect(d.y).toBeCloseTo(-3000, 6);
  });

  it('aterro de 1 m no plano: bordos a ±5,5, pés a ±7,0 e área = h·w + h²·H', () => {
    const s = secaoTransversal(e0, plano(100), S, 101);
    expect(s.semDados).toBe(false);
    expect(s.diferencaM).toBeCloseTo(1, 9);
    expect(meiaPlataformaM(S)).toBe(5.5);
    expect(s.bordoDir).toEqual({ offsetM: 5.5, cotaM: 101 });
    expect(s.peDir!.offsetM).toBeCloseTo(7, 6);
    expect(s.peDir!.cotaM).toBeCloseTo(100, 6);
    expect(s.peEsq!.offsetM).toBeCloseTo(-7, 6);
    expect(s.areaAterroM2).toBeCloseTo(1 * 11 + 1 * 1 * 1.5, 6);
    expect(s.areaCorteM2).toBeCloseTo(0, 9);
    expect(s.taludeNaoFecha).toBe(false);
  });

  it('corte de 2 m no plano: crista a 2·H do bordo e área = h·w + h²·H', () => {
    const s = secaoTransversal(e0, plano(100), S, 98);
    expect(s.peDir!.offsetM).toBeCloseTo(5.5 + 2 * 1.5, 6);
    expect(s.areaCorteM2).toBeCloseTo(2 * 11 + 4 * 1.5, 6);
    expect(s.areaAterroM2).toBeCloseTo(0, 9);
  });

  it('terreno inclinado na transversal: um lado corta, o outro aterra, e o talude que não alcança é DITO', () => {
    // terreno sobe 20 % para a direita (+X)
    const s = secaoTransversal(e0, (p) => 100 + (p.x / 1000) * 0.2, S, 100);
    expect(s.areaCorteM2).toBeGreaterThan(0);
    expect(s.areaAterroM2).toBeGreaterThan(0);
    expect(s.areaCorteM2).toBeCloseTo(s.areaAterroM2, 6);
    // 1:1,5 (66 %) contra 20 % fecha; talude 1:10 (10 %) contra 20 % nunca alcança o terreno
    const nunca = secaoTransversal(e0, (p) => 100 + (p.x / 1000) * 0.2, { ...S, taludeCorteH: 10, taludeAterroH: 10 }, 100);
    expect(nunca.taludeNaoFecha).toBe(true);
  });

  it('sem cota no eixo ou sem greide: seção vazia, sem número inventado', () => {
    expect(secaoTransversal(e0, () => null, S, 100).semDados).toBe(true);
    expect(secaoTransversal(e0, plano(100), S, null).semDados).toBe(true);
  });
});

describe('a via de 200 m a 1 % sobre terreno plano (o caso de aceite)', () => {
  const S = SECAO_TIPO_PADRAO;
  const estacas = estaquear(EIXO, 20);
  const greide: Greide = { pontos: [{ distM: 0, cotaM: 100 }, { distM: 200, cotaM: 102 }] };
  const secoes = secoesTransversais(estacas, plano(100), S, greide);

  it('nota de serviço simples: 11 estacas com a cota do greide certa e a diferença em aterro', () => {
    const nota = notaDeServico(secoes, 'SIMPLES');
    expect(nota).toHaveLength(11);
    nota.forEach((l, k) => {
      expect(l.estaca).toBe(`${k}+0,00`);
      expect(l.projetoM).toBeCloseTo(100 + 0.2 * k, 9);
      expect(l.diferencaM).toBeCloseTo(0.2 * k, 9);
    });
    const csv = csvDaNotaDeServico(nota);
    expect(csv.split('\n')).toHaveLength(12);
    expect(csv.split('\n')[6]).toBe('5+0,00;100,00;100,000;101,000;1,000;0,000');
  });

  it('volumes por áreas médias fecham com a fórmula fechada', () => {
    const v = volumesPorAreasMedias(secoes, { empolamentoPct: 25, contracaoPct: 10 });
    expect(v.trechos).toHaveLength(10);
    const area = (h: number) => h * 11 + h * h * S.taludeAterroH;
    let esperado = 0;
    for (let k = 0; k < 10; k++) esperado += ((area(0.2 * k) + area(0.2 * (k + 1))) / 2) * 20;
    expect(v.aterroM3).toBeCloseTo(esperado, 6);
    expect(v.corteM3).toBeCloseTo(0, 9);
    expect(v.trechos[9].aterroAcumM3).toBeCloseTo(esperado, 6);
    expect(v.aterroEmBancoM3).toBeCloseTo(esperado * 1.1, 6);
    expect(v.saldoM3).toBeCloseTo(-esperado * 1.1, 6);
    expect(v.trechosSemDados).toBe(0);
  });

  it('mudar uma cota do greide recalcula a nota e o volume', () => {
    const outro: Greide = { pontos: [{ distM: 0, cotaM: 100 }, { distM: 200, cotaM: 100 }] };
    const s2 = secoesTransversais(estacas, plano(100), S, outro);
    expect(volumesPorAreasMedias(s2).aterroM3).toBeCloseTo(0, 9);
    expect(notaDeServico(s2)[10].diferencaM).toBeCloseTo(0, 9);
  });

  it('nota composta traz bordos e pés; o CSV tem 16 colunas', () => {
    const nota = notaDeServico(secoes, 'COMPOSTA');
    expect(nota[5].bordoDir).toEqual({ offsetM: 5.5, cotaM: 101 });
    expect(nota[5].peDir!.offsetM).toBeCloseTo(7, 6);
    const csv = csvDaNotaDeServico(nota, 'COMPOSTA');
    expect(csv.split('\n')[0].split(';')).toHaveLength(16);
    expect(csv.split('\n')[6].split(';')).toHaveLength(16);
    expect(csvDoGreide(estacas, greide).split('\n')[6]).toBe('5+0,00;100,00;101,000');
  });

  it('locação: eixo + 2 bordos + 2 pés por estaca, e o CSV volta pelo importador com as MESMAS coordenadas', () => {
    const pontos = pontosDeLocacaoDaVia(secoes, 'Rua A');
    // estaca 0 tem diferença 0 → pés coincidem com os bordos, mas existem
    expect(pontos).toHaveLength(11 * 5);
    const p5 = pontos.filter((p) => p.nome.endsWith('5+0,00'));
    expect(p5.map((p) => p.nome)).toEqual(['E5+0,00', 'BE5+0,00', 'BD5+0,00', 'PE5+0,00', 'PD5+0,00']);
    expect(p5[2].x).toBeCloseTo(5500, 6);
    expect(p5[2].cotaM).toBe(101);
    const csv = csvDeLocacaoDaVia(pontos);
    expect(csv.split('\n')[0]).toBe('ponto;norte;este;cota;descricao');
    const lido = importarPontos(csv, 'TEXTO', { anel: null, georreferencia: null }, { ancoragem: 'DIRETO', unidade: 'M' });
    expect(lido.pontos).toHaveLength(pontos.length);
    const bd5 = lido.pontos.find((p) => p.nome === 'BD5+0,00')!;
    expect(bd5.x).toBeCloseTo(5500, 0);
    expect(bd5.y).toBeCloseTo(100_000, 0);
    expect(bd5.cotaM).toBeCloseTo(101, 6);
  });
});
