/**
 * Fase 5 da topografia: concordância do talude nos cantos entre lados com h
 * diferentes, canaleta de banqueta medida no eixo do patamar completo, e
 * várias linhas de perfil por estudo (leitura da coluna nas duas formas).
 */
import { describe, expect, it } from 'vitest';
import { linhasDoPerfilDaColuna } from '../hooks/useBlueprintTerraplenagem';
import type { Point } from '../utils/blueprintKernel';
import { nosDaGrade, planejarGrade, type GradeDeElevacao } from '../utils/blueprintTopografia';
import {
  distanciaAoAnelComAresta,
  PARAMETROS_PADRAO,
  superficieDeProjeto,
  taludeNoPonto,
  terraplenagemComTalude,
} from '../utils/blueprintTopografiaAnalises';

const LOTE: Point[] = [
  { x: 0, y: 0 },
  { x: 40000, y: 0 },
  { x: 40000, y: 40000 },
  { x: 0, y: 40000 },
];
/** Platô 20 × 20 m, anti-horário no sistema do desenho. Aresta 0 = sul, 1 = leste, 2 = norte, 3 = oeste. */
const PLATO: Point[] = [
  { x: 10000, y: 10000 },
  { x: 30000, y: 10000 },
  { x: 30000, y: 30000 },
  { x: 10000, y: 30000 },
];

function gradeDe(fn: (x: number, y: number) => number | null, esp = 1000): GradeDeElevacao {
  const grade = planejarGrade(LOTE, esp);
  return { ...grade, cotasM: nosDaGrade(grade).map((n) => fn(n.x, n.y)) };
}

describe('concordância nos cantos', () => {
  it('em frente a um lado a proximidade é só daquele lado; no canto, as duas arestas com peso', () => {
    const lado = distanciaAoAnelComAresta({ x: 35000, y: 20000 }, PLATO);
    expect(lado).toEqual({ dMm: 5000, aresta: 1, arestaB: null, peso: 0 });
    // Diagonal exata do canto sudeste (30000,10000): metade de cada.
    const canto = distanciaAoAnelComAresta({ x: 33000, y: 7000 }, PLATO);
    expect(canto.dMm).toBeCloseTo(Math.hypot(3000, 3000), 6);
    expect(canto.aresta).toBe(0);
    expect(canto.arestaB).toBe(1);
    expect(canto.peso).toBeCloseTo(0.5, 6);
    // Quase na normal do lado sul (para baixo): peso ~0; quase na do leste: ~1.
    expect(distanciaAoAnelComAresta({ x: 30100, y: 5000 }, PLATO).peso).toBeLessThan(0.05);
    expect(distanciaAoAnelComAresta({ x: 35000, y: 9900 }, PLATO).peso).toBeGreaterThan(0.95);
  });

  it('o h gira aos poucos de um lado ao outro do canto', () => {
    const p = { ...PARAMETROS_PADRAO, taludePorAresta: [{ corteH: 1 }, { corteH: 3 }, null, null] };
    const meio = taludeNoPonto(p, distanciaAoAnelComAresta({ x: 33000, y: 7000 }, PLATO));
    expect(meio.corteH).toBeCloseTo(2, 6);
    expect(meio.aterroH).toBeCloseTo(1.5, 6); // aterro não tem valor por aresta: herda
    const quaseSul = taludeNoPonto(p, distanciaAoAnelComAresta({ x: 30100, y: 5000 }, PLATO));
    expect(quaseSul.corteH).toBeLessThan(1.1);
    // A superfície de projeto aceita a proximidade inteira.
    const prox = distanciaAoAnelComAresta({ x: 33000, y: 7000 }, PLATO);
    const s = superficieDeProjeto(100, prox.dMm, prox, p);
    expect(s.corteM).toBeCloseTo(100 + prox.dMm / 1000 / 2, 6);
  });

  it('a faixa de talude é contínua no canto: sem degrau na bissetriz', () => {
    const g = gradeDe(() => 96, 500);
    const t = terraplenagemComTalude(g, PLATO, 100, {
      ...PARAMETROS_PADRAO,
      taludePorAresta: [{ aterroH: 1 }, { aterroH: 4 }, null, null],
    });
    // Alcance do talude ao longo da diagonal do canto sudeste, medido em raios
    // sucessivos: a distância em que ele termina deve crescer monotonamente
    // do lado sul (1:1 → 4 m) ao lado leste (1:4 → 16 m).
    const { origem, espacamentoMm: esp, colunas } = g;
    const alcanceNoAngulo = (ang: number) => {
      let ultimo = 0;
      for (let r = 250; r < 25000; r += 250) {
        const p = { x: 30000 + Math.cos(ang) * r, y: 10000 - Math.sin(ang) * r };
        const c = Math.floor((p.x - origem.x) / esp);
        const l = Math.floor((p.y - origem.y) / esp);
        if (t.ladoDaCelula[l * (colunas - 1) + c] === 'TALUDE_ATERRO') ultimo = r;
      }
      return ultimo;
    };
    const alcances = [90, 70, 50, 30, 10].map((deg) => alcanceNoAngulo((deg * Math.PI) / 180));
    for (let i = 1; i < alcances.length; i++) expect(alcances[i]).toBeGreaterThanOrEqual(alcances[i - 1]);
    expect(alcances[0]).toBeLessThan(6000);
    expect(alcances[alcances.length - 1]).toBeGreaterThan(12000);
  });
});

describe('canaleta de banqueta no eixo do patamar', () => {
  it('terreno plano bem acima: cada lance completo dá um anel de banqueta, cantos em arco', () => {
    // Platô a 100, terreno a 104,5, lance 2 m, banqueta 1 m, corte 1:1 →
    // patamares a 2 m (completo) e 4 m (o talude segue 0,5 m acima: completo).
    const g = gradeDe(() => 104.5, 250);
    const p = { ...PARAMETROS_PADRAO, taludeCorteH: 1, alturaDoLanceM: 2, larguraDaBanquetaM: 1 };
    const t = terraplenagemComTalude(g, PLATO, 100, p);
    // Anel 1: eixo a d = 2·1 + 0,5 = 2,5 m → 4 lados de 20 m + círculo de raio 2,5 m.
    // Anel 2: eixo a d = 4·1 + 1,5 = 5,5 m → 80 m + 2π·5,5.
    const esperado = 80 + 2 * Math.PI * 2.5 + (80 + 2 * Math.PI * 5.5);
    expect(t.canaletaDeBanquetaM).toBeGreaterThan(esperado * 0.9);
    expect(t.canaletaDeBanquetaM).toBeLessThan(esperado * 1.1);
  });

  it('o patamar em que o terreno é encontrado não conta como plataforma', () => {
    // Terreno a 102,0 exato: o talude chega ao terreno no INÍCIO do 1º patamar → nada.
    const g = gradeDe(() => 102, 250);
    const p = { ...PARAMETROS_PADRAO, taludeCorteH: 1, alturaDoLanceM: 2, larguraDaBanquetaM: 1 };
    expect(terraplenagemComTalude(g, PLATO, 100, p).canaletaDeBanquetaM).toBe(0);
    // Terreno a 102,2: o talude passa o patamar e sobe mais 0,2 m → 1 anel completo.
    const t = terraplenagemComTalude(gradeDe(() => 102.2, 250), PLATO, 100, p);
    const anel1 = 80 + 2 * Math.PI * 2.5;
    expect(t.canaletaDeBanquetaM).toBeGreaterThan(anel1 * 0.9);
    expect(t.canaletaDeBanquetaM).toBeLessThan(anel1 * 1.1);
  });

  it('sem banqueta, zero', () => {
    const t = terraplenagemComTalude(gradeDe(() => 106), PLATO, 100, { ...PARAMETROS_PADRAO, alturaDoLanceM: 0 });
    expect(t.canaletaDeBanquetaM).toBe(0);
    expect(t.areaBanquetasM2).toBe(0);
  });
});

describe('linhas do perfil na coluna', () => {
  it('lê a forma da fase 4 (uma linha) e a da fase 5 (lista); descarta lixo', () => {
    const a = { x: 1, y: 2 };
    const b = { x: 3, y: 4 };
    expect(linhasDoPerfilDaColuna(null)).toEqual([]);
    expect(linhasDoPerfilDaColuna([])).toEqual([]);
    expect(linhasDoPerfilDaColuna([a, b])).toEqual([[a, b]]);
    expect(linhasDoPerfilDaColuna([[a, b], [b, a, a]])).toEqual([[a, b], [b, a, a]]);
    expect(linhasDoPerfilDaColuna([[a], [a, b], 'x', [{ x: 'a' }, b]])).toEqual([[a, b]]);
  });
});
