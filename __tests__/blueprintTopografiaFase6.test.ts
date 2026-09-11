/**
 * Fase 6 da topografia: contenção (muro de arrimo por lado do platô) e
 * drenagem traçada sobre a superfície de projeto.
 */
import { describe, expect, it } from 'vitest';
import { drenagemDaColuna } from '../hooks/useBlueprintTerraplenagem';
import type { Point } from '../utils/blueprintKernel';
import { nosDaGrade, planejarGrade, type GradeDeElevacao } from '../utils/blueprintTopografia';
import {
  analisarDrenagem,
  canaletasDoPlato,
  cotaDeProjeto,
  distanciaAoAnelComAresta,
  murosDeArrimo,
  PARAMETROS_PADRAO,
  pontoAtrasDeMuro,
  superficieDeProjeto,
  taludeNoPonto,
  terraplenagemComTalude,
  type ParametrosDeTerraplenagem,
} from '../utils/blueprintTopografiaAnalises';

const LOTE: Point[] = [
  { x: 0, y: 0 },
  { x: 40000, y: 0 },
  { x: 40000, y: 40000 },
  { x: 0, y: 40000 },
];
/** Platô 20 × 20 m. Aresta 0 = sul, 1 = leste, 2 = norte, 3 = oeste. */
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

const MURO_LESTE: ParametrosDeTerraplenagem = { ...PARAMETROS_PADRAO, taludePorAresta: [null, { muro: true }, null, null] };

describe('muro de arrimo por lado', () => {
  it('atrás do muro nada é tocado; nos outros lados o talude continua', () => {
    const g = gradeDe(() => 104);
    const sem = terraplenagemComTalude(g, PLATO, 100, PARAMETROS_PADRAO);
    const com = terraplenagemComTalude(g, PLATO, 100, MURO_LESTE);
    const { origem, espacamentoMm: esp, colunas } = g;
    const ladoEm = (t: typeof com, p: Point) =>
      t.ladoDaCelula[Math.floor((p.y - origem.y) / esp) * (colunas - 1) + Math.floor((p.x - origem.x) / esp)];
    // A leste do platô (lado 1): sem muro é talude de corte; com muro, nada.
    expect(ladoEm(sem, { x: 32500, y: 20500 })).toBe('TALUDE_CORTE');
    expect(ladoEm(com, { x: 32500, y: 20500 })).toBeNull();
    // A oeste (lado 3) segue igual.
    expect(ladoEm(com, { x: 7500, y: 20500 })).toBe('TALUDE_CORTE');
    expect(com.taludeCorteM3).toBeLessThan(sem.taludeCorteM3);
    expect(com.areaTaludeM2).toBeLessThan(sem.areaTaludeM2);
    // O platô em si não muda.
    expect(com.corteM3).toBeCloseTo(sem.corteM3, 9);
  });

  it('o muro mede comprimento, altura e face contra o terreno', () => {
    const g = gradeDe(() => 104);
    const t = terraplenagemComTalude(g, PLATO, 100, MURO_LESTE);
    expect(t.muros).toHaveLength(1);
    const m = t.muros[0];
    expect(m.aresta).toBe(1);
    expect(m.comprimentoM).toBeCloseTo(20, 9);
    expect(m.lado).toBe('CORTE');
    expect(m.alturaMaxCorteM).toBeCloseTo(4, 6);
    expect(m.alturaMaxAterroM).toBe(0);
    expect(m.areaDeFaceM2).toBeCloseTo(80, 1); // 20 m × 4 m
    expect(m.normal.x).toBeCloseTo(1, 9); // para fora, a leste
    expect(t.murosComprimentoM).toBeCloseTo(20, 9);
    expect(t.murosAreaDeFaceM2).toBeCloseTo(80, 1);
  });

  it('platô igual ao lote: a aresta do muro é a borda da grade e ainda assim mede', () => {
    // Achado do passeio em produção (11/09): amostra exata na borda dava null → face 0.
    const g = gradeDe((_x, y) => 100 + y / 10000); // 100 a 104 de sul a norte
    const muroLeste = { ...PARAMETROS_PADRAO, taludePorAresta: [null, { muro: true }, null, null] };
    const [m] = murosDeArrimo(g, LOTE, 102, muroLeste); // lado 1 = x = 40 m, de y 0 a 40
    expect(m).toBeDefined();
    expect(m.comprimentoM).toBeCloseTo(40, 9);
    expect(m.lado).toBe('MISTO');
    expect(m.alturaMaxCorteM).toBeGreaterThan(1.8);
    expect(m.alturaMaxAterroM).toBeGreaterThan(1.8);
    expect(m.areaDeFaceM2).toBeCloseTo(40, 0); // dois triângulos de 20 m × 2 m / 2
  });

  it('terreno abaixo do platô: o muro contém o aterro; rampa cruzando a cota: misto', () => {
    const baixo = murosDeArrimo(gradeDe(() => 97), PLATO, 100, MURO_LESTE)[0];
    expect(baixo.lado).toBe('ATERRO');
    expect(baixo.alturaMaxAterroM).toBeCloseTo(3, 6);
    const misto = murosDeArrimo(gradeDe((_x, y) => 98 + y / 10000), PLATO, 100, MURO_LESTE)[0]; // 99 a 101 ao longo do lado leste
    expect(misto.lado).toBe('MISTO');
  });

  it('no canto entre muro e talude, o leque é do talude (sem mistura); entre dois muros, muro', () => {
    // Canto sudeste (30000,10000): lado 0 (sul, talude) e lado 1 (leste, muro).
    const prox = distanciaAoAnelComAresta({ x: 33000, y: 7000 }, PLATO);
    expect(prox.arestaB).toBe(1);
    expect(pontoAtrasDeMuro(MURO_LESTE, prox)).toBe(false);
    const h = taludeNoPonto({ ...MURO_LESTE, taludePorAresta: [{ corteH: 1 }, { muro: true }, null, null] }, prox);
    expect(h.corteH).toBe(1);
    expect(superficieDeProjeto(100, prox.dMm, prox, MURO_LESTE).muro).toBe(false);
    const doisMuros = { ...PARAMETROS_PADRAO, taludePorAresta: [{ muro: true }, { muro: true }, null, null] };
    expect(pontoAtrasDeMuro(doisMuros, prox)).toBe(true);
    expect(superficieDeProjeto(100, prox.dMm, prox, doisMuros).muro).toBe(true);
    // Em frente ao lado com muro.
    expect(superficieDeProjeto(100, 3000, 1, MURO_LESTE).muro).toBe(true);
    expect(superficieDeProjeto(100, 3000, 0, MURO_LESTE).muro).toBe(false);
  });
});

describe('superfície de projeto e drenagem', () => {
  it('cotaDeProjeto: platô na cota, talude onde corta, terreno no resto e atrás do muro', () => {
    const g = gradeDe(() => 104);
    const cota = cotaDeProjeto(g, PLATO, 100, MURO_LESTE);
    expect(cota({ x: 20000, y: 20000 })).toBe(100); // dentro do platô
    expect(cota({ x: 7000, y: 20000 })).toBeCloseTo(102, 6); // 3 m a oeste, 1:1,5 → +2 m
    expect(cota({ x: 33000, y: 20000 })).toBe(104); // atrás do muro: terreno
    expect(cota({ x: 1000, y: 20000 })).toBe(104); // longe: terreno
    // Sem platô, é o terreno.
    expect(cotaDeProjeto(g, null, null, PARAMETROS_PADRAO)({ x: 20000, y: 20000 })).toBe(104);
  });

  it('canaleta descendo uma rampa escoa; a mesma linha ao contrário não', () => {
    const g = gradeDe((x) => 100 + x / 1000); // sobe 1 m por metro em x
    const cota = cotaDeProjeto(g, null, null, PARAMETROS_PADRAO);
    const desce = analisarDrenagem({ id: 'a', nome: 'A', tipo: 'CANALETA', pontos: [{ x: 30000, y: 20000 }, { x: 10000, y: 20000 }] }, cota, 0.5);
    expect(desce.comprimentoM).toBeCloseTo(20, 9);
    expect(desce.cotaInicioM).toBeCloseTo(130, 6);
    expect(desce.cotaFimM).toBeCloseTo(110, 6);
    expect(desce.caimentoMedioP).toBeCloseTo(100, 6);
    expect(desce.contraCaimentoM).toBe(0);
    // A superfície desce mais que o mínimo: o fundo acompanha, profundidade zero.
    expect(desce.profundidadeMaxM).toBeCloseTo(0, 9);
    expect(desce.quedaDeExecucaoM).toBeCloseTo(20, 6);
    expect(desce.atende).toBe(true);
    expect(desce.desague).toEqual({ x: 10000, y: 20000, cotaM: 110 });
    const sobe = analisarDrenagem({ id: 'b', nome: 'B', tipo: 'CANALETA', pontos: [{ x: 10000, y: 20000 }, { x: 30000, y: 20000 }] }, cota, 0.5);
    expect(sobe.caimentoMedioP).toBeCloseTo(-100, 6);
    expect(sobe.contraCaimentoM).toBeCloseTo(20, 6);
    // Subindo 20 m, o fundo teria de estar 20,1 m abaixo da superfície na saída.
    expect(sobe.profundidadeNaSaidaM).toBeCloseTo(20.1, 6);
    expect(sobe.atende).toBe(false);
  });

  it('nivelada ou com caimento fraco, escoa pela queda de execução até o limite de profundidade', () => {
    const plana = cotaDeProjeto(gradeDe(() => 100), null, null, PARAMETROS_PADRAO);
    const nivelada = analisarDrenagem({ id: 'n', nome: 'N', tipo: 'CANALETA', pontos: [{ x: 30000, y: 20000 }, { x: 10000, y: 20000 }] }, plana, 0.5);
    expect(nivelada.caimentoMedioP).toBeCloseTo(0, 9);
    expect(nivelada.quedaDeExecucaoM).toBeCloseTo(0.1, 6); // 20 m × 0,5 %
    expect(nivelada.profundidadeNaSaidaM).toBeCloseTo(0.1, 6);
    expect(nivelada.profundidadeLimiteM).toBe(0.6);
    expect(nivelada.atende).toBe(true);
    // 150 m nivelados a 0,5 % pedem 0,75 m de fundo: canaleta não; tubo (1,5 m) sim.
    const longa = { id: 'l', nome: 'L', tipo: 'CANALETA' as const, pontos: [{ x: 0, y: 20000 }, { x: 150000, y: 20000 }] };
    const planaLarga = cotaDeProjeto({ ...gradeDe(() => 100), }, null, null, PARAMETROS_PADRAO);
    const grande = (p: Point) => (p.x >= 0 && p.x <= 150000 ? 100 : planaLarga(p));
    expect(analisarDrenagem(longa, grande, 0.5).atende).toBe(false);
    expect(analisarDrenagem({ ...longa, tipo: 'TUBO' }, grande, 0.5).atende).toBe(true);
    // Caimento fraco (0,1 %) com mínimo 0,5 %: o fundo desce 0,5 %, a superfície 0,1 % → 0,08 m na saída.
    const fraca = cotaDeProjeto(gradeDe((x) => 100 + x / 1_000_000), null, null, PARAMETROS_PADRAO);
    const f = analisarDrenagem({ id: 'c', nome: 'C', tipo: 'CANALETA', pontos: [{ x: 30000, y: 20000 }, { x: 10000, y: 20000 }] }, fraca, 0.5);
    expect(f.caimentoMedioP).toBeCloseTo(0.1, 6);
    expect(f.profundidadeNaSaidaM).toBeCloseTo(0.08, 6);
    expect(f.atende).toBe(true);
    // Vale no meio (desce 15 m, sobe 15 m): a subida enterra o fundo 15 m — não escoa.
    const vale = cotaDeProjeto(gradeDe((x) => 100 + Math.abs(x - 20000) / 1000), null, null, PARAMETROS_PADRAO);
    const cruza = analisarDrenagem({ id: 'd', nome: 'D', tipo: 'CANALETA', pontos: [{ x: 35000, y: 20000 }, { x: 5000, y: 20000 }] }, vale, 0.5);
    expect(cruza.contraCaimentoM).toBeCloseTo(15, 3);
    expect(cruza.profundidadeMaxM).toBeGreaterThan(15);
    expect(cruza.atende).toBe(false);
  });

  it('gerar do platô: uma canaleta por lado com talude (não por lado com muro), orientada para baixo', () => {
    const g = gradeDe((_x, y) => 104 + y / 10000); // sobe para o norte: talude de corte em volta
    const t = terraplenagemComTalude(g, PLATO, 100, MURO_LESTE);
    const cota = cotaDeProjeto(g, PLATO, 100, MURO_LESTE);
    let n = 0;
    const linhas = canaletasDoPlato(t, g, PLATO, MURO_LESTE, cota, () => `id${++n}`);
    expect(linhas.map((l) => l.id)).toEqual(['id1', 'id2', 'id3']);
    expect(linhas.every((l) => l.tipo === 'CANALETA')).toBe(true);
    expect(linhas.map((l) => l.nome)).toEqual(['Pé de corte · lado 1', 'Pé de corte · lado 3', 'Pé de corte · lado 4']);
    // Lado 4 (oeste, de (10000,30000) a (10000,10000)) sobe para o norte → a canaleta
    // começa no norte e termina no sul, afastada 0,75 m para fora (x = 9250).
    const oeste = linhas[2];
    expect(oeste.pontos[0].x).toBe(9250);
    expect(oeste.pontos[0].y).toBeGreaterThan(oeste.pontos[1].y);
    for (const l of linhas) {
      const a = analisarDrenagem(l, cota, 0.5);
      expect(a.contraCaimentoM).toBe(0);
      expect(a.atende).toBe(true);
    }
  });

  it('a coluna gravada é lida com tolerância', () => {
    const p = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
    expect(drenagemDaColuna(null)).toEqual([]);
    expect(drenagemDaColuna([{ id: 'a', nome: 'A', tipo: 'TUBO', pontos: p }])).toEqual([{ id: 'a', nome: 'A', tipo: 'TUBO', pontos: p }]);
    expect(drenagemDaColuna([{ id: 'b', tipo: 'X', pontos: p }])).toEqual([{ id: 'b', nome: 'Canaleta 1', tipo: 'CANALETA', pontos: p }]);
    expect(drenagemDaColuna([{ id: 'c', pontos: [p[0]] }, 'lixo', { pontos: p }])).toEqual([]);
  });
});
