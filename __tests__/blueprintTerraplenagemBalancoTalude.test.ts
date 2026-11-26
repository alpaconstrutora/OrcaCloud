/**
 * MODO DO BALANÇO DE MASSA + TALUDE SUAVE (25/11/2026, reel da Hektar — "Mass balance: Cut / Cut & Fill / Fill" e
 * "Side slope: Smooth / Straight"). Pedido: *"implemente e ou aprimore o painel de visualizacao lateral como no
 * video"*; escopo escolhido pelo usuário: "Painel + os dois".
 *
 *   - CORTE: só rebaixa o que está ACIMA da cota (o que está abaixo fica natural — sem aterro);
 *   - ATERRO: só enche o que está ABAIXO (o que está acima fica natural — sem corte);
 *   - CORTE_E_ATERRO (padrão): nivela, como sempre foi.
 *   - Talude SUAVE: largura L em planta; a cota vai da borda ao terreno por uma curva suave (smoothstep).
 * A conta (`terraplenagemComTalude`), a superfície de projeto (`cotaDeProjeto`/`gradeDeProjeto`) e o corte 2D usam a
 * MESMA decisão ponto a ponto (`projetoForaDoPlato` / `cotaDentroDoPlato`).
 */
import { describe, expect, it } from 'vitest';
import {
  cotaDeProjeto,
  cotaDentroDoPlato,
  cotaNoTaludeSuave,
  gradeDeProjeto,
  PARAMETROS_PADRAO,
  terraplenagemComTalude,
  volumeEntreSuperficies,
  type ParametrosDeTerraplenagem,
} from '../utils/blueprintTopografiaAnalises';
import type { GradeDeElevacao } from '../utils/blueprintTopografia';

/** Plano inclinado 100 + x/10 m (x em m), 61 × 61 nós a 1 m (−30…30 m). */
function rampa(): GradeDeElevacao {
  const n = 61;
  const cotasM: number[] = [];
  for (let l = 0; l < n; l++) for (let c = 0; c < n; c++) cotasM.push(100 + (c - 30) / 10);
  return { origem: { x: -30_000, y: -30_000 }, espacamentoMm: 1000, colunas: n, linhas: n, cotasM };
}
const ANEL = [
  { x: -8000, y: -8000 },
  { x: 8000, y: -8000 },
  { x: 8000, y: 8000 },
  { x: -8000, y: 8000 },
];
// Sem banqueta: o caso fica limpo para comparar os modos.
const BASE: ParametrosDeTerraplenagem = { ...PARAMETROS_PADRAO, alturaDoLanceM: 0, larguraDaBanquetaM: 0 };
const COTA = 100; // a cota do terreno no centro: metade do platô corta, metade aterra

describe('modo do balanço de massa', () => {
  const nivela = terraplenagemComTalude(rampa(), ANEL, COTA, BASE);

  it('CORTE_E_ATERRO explícito = o de sempre (regressão)', () => {
    const r = terraplenagemComTalude(rampa(), ANEL, COTA, { ...BASE, modoDoBalanco: 'CORTE_E_ATERRO' });
    expect(r.corteTotalM3).toBeCloseTo(nivela.corteTotalM3, 6);
    expect(r.aterroTotalM3).toBeCloseTo(nivela.aterroTotalM3, 6);
    expect(nivela.corteTotalM3).toBeGreaterThan(0);
    expect(nivela.aterroTotalM3).toBeGreaterThan(0);
  });

  it('⚠️ PRONTO QUANDO: CORTE não aterra nada — e o corte do platô é o mesmo de nivelar', () => {
    const r = terraplenagemComTalude(rampa(), ANEL, COTA, { ...BASE, modoDoBalanco: 'CORTE' });
    expect(r.aterroTotalM3).toBe(0);
    expect(r.aterroM3).toBe(0);
    expect(r.taludeAterroM3).toBe(0);
    expect(r.corteM3).toBeCloseTo(nivela.corteM3, 6);
    expect(r.ladoDaCelula.some((l) => l === 'ATERRO' || l === 'TALUDE_ATERRO' || l === 'VIA_ATERRO')).toBe(false);
  });

  it('ATERRO não corta nada — e o aterro do platô é o mesmo de nivelar', () => {
    const r = terraplenagemComTalude(rampa(), ANEL, COTA, { ...BASE, modoDoBalanco: 'ATERRO' });
    expect(r.corteTotalM3).toBe(0);
    expect(r.aterroM3).toBeCloseTo(nivela.aterroM3, 6);
    expect(r.ladoDaCelula.some((l) => l === 'CORTE' || l === 'TALUDE_CORTE' || l === 'VIA_CORTE')).toBe(false);
  });

  it('cotaDentroDoPlato: CORTE deixa natural o que está abaixo; ATERRO, o que está acima', () => {
    expect(cotaDentroDoPlato(100, 98, { ...BASE, modoDoBalanco: 'CORTE' })).toBeNull();
    expect(cotaDentroDoPlato(100, 102, { ...BASE, modoDoBalanco: 'CORTE' })).toBe(100);
    expect(cotaDentroDoPlato(100, 102, { ...BASE, modoDoBalanco: 'ATERRO' })).toBeNull();
    expect(cotaDentroDoPlato(100, 98, { ...BASE, modoDoBalanco: 'ATERRO' })).toBe(100);
    expect(cotaDentroDoPlato(100, 98, BASE)).toBe(100);
  });

  it('a superfície de projeto respeita o modo: em CORTE nunca fica acima do terreno', () => {
    const t = rampa();
    const p = gradeDeProjeto(t, ANEL, COTA, { ...BASE, modoDoBalanco: 'CORTE' }, null);
    for (let i = 0; i < t.cotasM.length; i++) expect(p.cotasM[i]!).toBeLessThanOrEqual(t.cotasM[i]! + 1e-9);
    // No lado baixo do platô (x = −5 m, terreno 99,5), fica o natural.
    expect(cotaDeProjeto(t, ANEL, COTA, { ...BASE, modoDoBalanco: 'CORTE' })({ x: -5000, y: 0 })).toBeCloseTo(99.5, 6);
  });
});

describe('talude suave', () => {
  it('cotaNoTaludeSuave: na borda é a cota do platô; a L/2, o meio; a partir de L, o terreno', () => {
    expect(cotaNoTaludeSuave(100, 104, 0, 5)).toBe(100);
    expect(cotaNoTaludeSuave(100, 104, 2.5, 5)).toBeCloseTo(102, 9);
    expect(cotaNoTaludeSuave(100, 104, 5, 5)).toBe(104);
    expect(cotaNoTaludeSuave(100, 104, 9, 5)).toBe(104);
    // Suave: começa e termina na horizontal (derivada zero nas pontas) — perto da borda anda pouco.
    expect(cotaNoTaludeSuave(100, 104, 0.25, 5) - 100).toBeLessThan(0.05 * 4);
  });

  it('⚠️ PRONTO QUANDO: o talude suave só mexe até L da borda, e há corte e aterro', () => {
    const L = 5;
    const r = terraplenagemComTalude(rampa(), ANEL, COTA, { ...BASE, formaDoTalude: 'SUAVE', larguraDoTaludeSuaveM: L });
    const g = rampa();
    const cols = g.colunas - 1;
    let maisLonge = 0;
    for (let i = 0; i < r.ladoDaCelula.length; i++) {
      const lado = r.ladoDaCelula[i];
      if (lado !== 'TALUDE_CORTE' && lado !== 'TALUDE_ATERRO') continue;
      const cx = g.origem.x + ((i % cols) + 0.5) * 1000;
      const cy = g.origem.y + (Math.floor(i / cols) + 0.5) * 1000;
      const d = Math.max(Math.abs(cx) - 8000, Math.abs(cy) - 8000, 0) / 1000;
      expect(d).toBeLessThan(L + 1e-9);
      maisLonge = Math.max(maisLonge, d);
    }
    // O suave vai até perto de L (aqui o reto a 1:1,5 para em ~1,4 m — não é ele que está sendo medido).
    expect(maisLonge).toBeGreaterThan(3);
    expect(r.taludeCorteM3).toBeGreaterThan(0);
    expect(r.taludeAterroM3).toBeGreaterThan(0);
  });

  it('a conta e a superfície de projeto concordam (volume pela grade ≈ volume da conta)', () => {
    const t = rampa();
    const p: ParametrosDeTerraplenagem = { ...BASE, formaDoTalude: 'SUAVE', larguraDoTaludeSuaveM: 6 };
    const conta = terraplenagemComTalude(t, ANEL, 102, p);
    const pelaGrade = volumeEntreSuperficies(t, gradeDeProjeto(t, ANEL, 102, p, null));
    expect(pelaGrade.corteM3).toBeCloseTo(conta.corteTotalM3, -1);
    expect(Math.abs(pelaGrade.aterroM3 - conta.aterroTotalM3) / Math.max(1, conta.aterroTotalM3)).toBeLessThan(0.15);
  });

  it('SUAVE + CORTE: não aterra nem no talude', () => {
    const r = terraplenagemComTalude(rampa(), ANEL, COTA, { ...BASE, formaDoTalude: 'SUAVE', larguraDoTaludeSuaveM: 5, modoDoBalanco: 'CORTE' });
    expect(r.aterroTotalM3).toBe(0);
    expect(r.taludeCorteM3).toBeGreaterThan(0);
  });
});
