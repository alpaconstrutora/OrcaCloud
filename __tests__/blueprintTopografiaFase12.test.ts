/**
 * Fase 12: o mapa de curvas como o Contour Map Creator (contourmapcreator.urgr8.ch)
 * — rampa arco-íris `value2RGB`, níveis por número / lista, hipsometria
 * contínua, curvas coloridas, exportação com células, cores e legenda.
 */
import { describe, expect, it } from 'vitest';
import type { Point } from '../utils/blueprintKernel';
import { fonteDeElevacao } from '../utils/blueprintElevacaoProvedores';
import {
  amostrarPontosCotados,
  equidistanciaEquivalente,
  estatisticasDoTerreno,
  faixaDeCotas,
  gerarCurvas,
  gerarCurvasNosNiveis,
  hashDaEntrada,
  lerListaDeNiveis,
  niveisPersonalizados,
  niveisPorNumero,
  nosDaGrade,
  planejarGrade,
  type GradeDeElevacao,
} from '../utils/blueprintTopografia';
import { corArcoIris, corArcoIrisDaCota, hipsometriaDaGrade, rgbArcoIris } from '../utils/blueprintTopografiaAnalises';
import { corKml, kmlDasCurvas, svgDasCurvas, type ProvenienciaDaVersao } from '../utils/blueprintTopografiaExport';

const LOTE: Point[] = [
  { x: 0, y: 0 },
  { x: 12000, y: 0 },
  { x: 12000, y: 30000 },
  { x: 0, y: 30000 },
];

function gradeDe(fn: (x: number, y: number) => number | null, esp = 1000): GradeDeElevacao {
  const grade = planejarGrade(LOTE, esp);
  return { ...grade, cotasM: nosDaGrade(grade).map((n) => fn(n.x, n.y)) };
}

describe('rampa arco-íris (value2RGB do Contour Map Creator)', () => {
  it('os cinco pontos de referência e a saturação fora da faixa', () => {
    expect(rgbArcoIris(0)).toEqual([0, 0, 255]);
    expect(rgbArcoIris(0.25)).toEqual([0, 255, 255]);
    expect(rgbArcoIris(0.5)).toEqual([0, 255, 0]);
    expect(rgbArcoIris(0.75)).toEqual([255, 255, 0]);
    expect(rgbArcoIris(1)).toEqual([255, 0, 0]);
    expect(rgbArcoIris(-0.1)).toEqual([0, 0, 255]);
    expect(rgbArcoIris(1.1)).toEqual([255, 0, 0]);
    expect(corArcoIris(0)).toBe('#0000ff');
    expect(corArcoIris(1)).toBe('#ff0000');
    // Normalizada pelo primeiro e último NÍVEL, como lá (value2RGB(level, levels[0], levels[last])).
    expect(corArcoIrisDaCota(886, 886, 906)).toBe('#0000ff');
    expect(corArcoIrisDaCota(906, 886, 906)).toBe('#ff0000');
    expect(corArcoIrisDaCota(896, 886, 906)).toBe('#00ff00');
    expect(corArcoIrisDaCota(880, 886, 906)).toBe('#0000ff');
  });

  it('é monótona no matiz: R nunca cai e B nunca sobe ao longo de t', () => {
    let r0 = 0;
    let b0 = 255;
    for (let i = 0; i <= 200; i++) {
      const [r, , b] = rgbArcoIris(i / 200);
      expect(r).toBeGreaterThanOrEqual(r0);
      expect(b).toBeLessThanOrEqual(b0);
      r0 = r;
      b0 = b;
    }
  });
});

describe('níveis por número e por lista', () => {
  it('N níveis igualmente espaçados, estritamente dentro (a conta do site: passo = (max − min)/(N + 1))', () => {
    expect(niveisPorNumero(886, 906, 7)).toEqual([888.5, 891, 893.5, 896, 898.5, 901, 903.5]);
    expect(niveisPorNumero(100, 101, 1)).toEqual([100.5]);
    expect(niveisPorNumero(100, 100, 7)).toEqual([]);
    expect(niveisPorNumero(0, 10, 500)).toHaveLength(200); // teto MAX_NIVEIS
  });

  it('lista personalizada: só o que cai dentro, sem repetição, crescente', () => {
    expect(niveisPersonalizados([420, 380, 400, 400, 999, -1], 370, 430)).toEqual([380, 400, 420]);
    expect(niveisPersonalizados([380], 390, 430)).toEqual([]);
  });

  it('lerListaDeNiveis aceita vírgula, ponto e vírgula, espaço e vírgula decimal', () => {
    expect(lerListaDeNiveis('380, 400, 420')).toEqual([380, 400, 420]);
    expect(lerListaDeNiveis('380;400;420')).toEqual([380, 400, 420]);
    expect(lerListaDeNiveis('101,5 102,0 102,5')).toEqual([101.5, 102, 102.5]);
    expect(lerListaDeNiveis('101.5,102')).toEqual([101.5, 102]);
    expect(lerListaDeNiveis('')).toEqual([]);
  });

  it('equidistância equivalente: o menor passo entre níveis', () => {
    expect(equidistanciaEquivalente([380, 400, 425], 370, 430)).toBe(20);
    expect(equidistanciaEquivalente([400], 370, 430)).toBe(30); // (430 − 370) / 2
  });

  it('gerarCurvasNosNiveis: as curvas saem exatamente nos níveis pedidos e todas mestras', () => {
    const g = gradeDe((x) => 100 + x / 1000, 500); // 100 a 112 m no eixo x
    const faixa = faixaDeCotas(g, LOTE)!;
    expect(faixa.minM).toBeCloseTo(100, 6);
    expect(faixa.maxM).toBeCloseTo(112, 6);
    const niveis = niveisPorNumero(faixa.minM, faixa.maxM, 3); // 103, 106, 109
    const curvas = gerarCurvasNosNiveis(g, LOTE, niveis, () => true);
    expect(new Set(curvas.map((c) => c.cotaM))).toEqual(new Set([103, 106, 109]));
    expect(curvas.every((c) => c.mestra)).toBe(true);
    // A de 103 m é a reta x = 3 m.
    const c103 = curvas.find((c) => c.cotaM === 103)!;
    expect(c103.pontos.every((p) => Math.abs(p.x - 3000) < 1)).toBe(true);
    // Equidistância continua igual ao de sempre.
    const antigas = gerarCurvas(g, LOTE, 2);
    expect(new Set(antigas.map((c) => c.cotaM))).toEqual(new Set([102, 104, 106, 108, 110]));
  });

  it('o hash da entrada muda com o modo e os níveis', () => {
    const base = { fonteCodigo: 'PONTOS_COTADOS', datasetVersao: 'x', anel: LOTE, georreferencia: null, espacamentoMm: 500, equidistanciaM: 1, pontosCotados: [] };
    const h1 = hashDaEntrada(base);
    const h2 = hashDaEntrada({ ...base, modoNiveis: 'NUMERO', niveisM: [103, 106, 109] });
    const h3 = hashDaEntrada({ ...base, modoNiveis: 'NUMERO', niveisM: [103, 106] });
    expect(h1).not.toBe(h2);
    expect(h2).not.toBe(h3);
  });
});

describe('hipsometria contínua', () => {
  it('48 bandas na rampa entre os níveis; abaixo satura em azul e acima em vermelho', () => {
    const g = gradeDe((x) => 100 + x / 1000, 500);
    const h = hipsometriaDaGrade(g, LOTE, { modo: 'CONTINUO', deM: 103, ateM: 109, bandas: 48 });
    expect(h.classes).toHaveLength(48);
    expect(h.classes[0].deM).toBe(103);
    expect(h.classes[47].ateM).toBeCloseTo(109, 6);
    expect(h.classes[0].cor).toBe(corArcoIris(0.5 / 48));
    expect(h.classes[47].cor).toBe(corArcoIris(47.5 / 48));
    // A célula mais a oeste (x ≈ 0,25 m → 100,25 m) está abaixo de 103: classe 0.
    expect(h.classeDaCelula[0]).toBe(0);
    // A mais a leste (≈ 112 m) está acima de 109: última classe.
    const ultimaColuna = g.colunas - 2;
    expect(h.classeDaCelula[ultimaColuna]).toBe(47);
    // A área total continua a do lote.
    expect(h.classes.reduce((s, c) => s + c.areaM2, 0)).toBeCloseTo(360, 0);
    // Sem faixa informada, vai do mínimo ao máximo do terreno.
    const h2 = hipsometriaDaGrade(g, LOTE, { modo: 'CONTINUO' });
    expect(h2.classes[0].deM).toBeCloseTo(h2.minM, 6);
  });
});

describe('exportação colorida', () => {
  const g = gradeDe((x) => 100 + x / 1000, 1000);
  const curvas = gerarCurvasNosNiveis(g, LOTE, [103, 106, 109]);
  const prov: ProvenienciaDaVersao = {
    nomeDoEstudo: 'E', versao: 1, fonte: fonteDeElevacao('PONTOS_COTADOS'), classe: 'LEVANTAMENTO_IMPORTADO',
    equidistanciaM: 3, geradoEm: '2026-09-12', hashResultado: 'h', estatisticas: estatisticasDoTerreno(g, LOTE, curvas), georreferencia: null,
  };
  const cores = { corDaCota: (c: number) => corArcoIrisDaCota(c, 103, 109), niveis: [103, 106, 109], casas: 0 };

  it('SVG: células pintadas, curvas na cor do nível e legenda com um quadrado por nível', () => {
    const svg = svgDasCurvas(curvas, LOTE, prov, { cores: { ...cores, grade: g } });
    expect(svg).toContain('<g class="celulas"');
    expect((svg.match(/<rect x=/g) ?? []).length).toBeGreaterThan(12 * 30 * 0.8);
    expect(svg).toContain('data-cota="103"');
    expect(svg).toMatch(/data-cota="103"[^>]*stroke="#0000ff"/);
    expect(svg).toMatch(/data-cota="109"[^>]*stroke="#ff0000"/);
    expect(svg).toMatch(/data-cota="106"[^>]*stroke="#00ff00"/);
    expect(svg).toContain('<g class="legenda">');
    expect(svg).toContain('>109 m</text>');
    expect(svg).toContain('>103 m</text>');
    // Sem cores, nada disso — e o marrom de sempre.
    const simples = svgDasCurvas(curvas, LOTE, prov);
    expect(simples).not.toContain('class="celulas"');
    expect(simples).not.toContain('class="legenda"');
    expect(simples).toMatch(/data-cota="103"[^>]*stroke="#92400e"/);
  });

  it('KML: um estilo por nível na cor da cota (aabbggrr)', () => {
    expect(corKml('#ff0000')).toBe('ff0000ff');
    expect(corKml('#0000ff')).toBe('ffff0000');
    const geo = { latitude: -22.6, longitude: -46.05, elevacaoM: null, rotacaoNorteDeg: 0 };
    const kml = kmlDasCurvas(curvas, LOTE, { ...prov, georreferencia: geo }, [], { cores });
    expect(kml).toContain('<Style id="nivel-0"><LineStyle><color>ffff0000</color>');
    expect(kml).toContain('<styleUrl>#nivel-0</styleUrl>');
    expect(kml).toContain('<color>ff0000ff</color>');
    const sem = kmlDasCurvas(curvas, LOTE, { ...prov, georreferencia: geo });
    expect(sem).not.toContain('nivel-0');
  });
});

describe('ida e volta com pontos cotados reais', () => {
  it('sete níveis entre o mínimo e o máximo de um lote inclinado, todos com curva', () => {
    const pontos = [{ x: 0, y: 0, cotaM: 100 }, { x: 12000, y: 0, cotaM: 100.6 }, { x: 12000, y: 30000, cotaM: 103.4 }, { x: 0, y: 30000, cotaM: 102.5 }];
    const g = amostrarPontosCotados(planejarGrade(LOTE, 750), pontos);
    const faixa = faixaDeCotas(g, LOTE)!;
    const niveis = niveisPorNumero(faixa.minM, faixa.maxM, 7);
    const curvas = gerarCurvasNosNiveis(g, LOTE, niveis);
    expect(new Set(curvas.map((c) => c.cotaM)).size).toBe(7);
  });
});
