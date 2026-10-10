/**
 * CLIMATIZAÇÃO E3.4 (04/10/2026): o símbolo técnico 2D de cada peça de
 * climatização — fonte única para o canvas e a prancha — e a climatização inteira
 * saindo da vista de uma vez.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { DesenhistaDeProva } from '../utils/blueprintExport';
import {
  TIPOS_COM_SIMBOLO_DE_CLIMATIZACAO,
  desenharSimboloDeClimatizacao,
  idsDaClimatizacao,
  proporcaoDoSimbolo,
  simboloDeClimatizacao,
  temSimboloDeClimatizacao,
} from '../utils/blueprintSimbolosClimatizacao';
import { FICHA_DO_PONTO_HIDRAULICO } from '../utils/blueprintHidraulica';

describe('climatização E3.4 · símbolos', () => {
  it('todo tipo de climatização tem símbolo, e os vinte são DIFERENTES entre si', () => {
    const assinaturas = TIPOS_COM_SIMBOLO_DE_CLIMATIZACAO.map((t) => JSON.stringify(simboloDeClimatizacao(t)));
    expect(assinaturas.every((a) => a !== '[]')).toBe(true);
    expect(new Set(assinaturas).size).toBe(TIPOS_COM_SIMBOLO_DE_CLIMATIZACAO.length);
    // E a lista é exatamente a dos tipos dos grupos de climatização.
    const doGrupo = Object.entries(FICHA_DO_PONTO_HIDRAULICO).filter(([, f]) => f.grupo.startsWith('Climatização')).map(([t]) => t).sort();
    expect([...TIPOS_COM_SIMBOLO_DE_CLIMATIZACAO].sort()).toEqual(doGrupo);
    expect(temSimboloDeClimatizacao('DIFUSOR')).toBe(true);
    expect(temSimboloDeClimatizacao('HIDRANTE_SIMPLES')).toBe(false);
    expect(temSimboloDeClimatizacao(null)).toBe(false);
  });

  it('as primitivas ficam no quadrado unitário (lado 1 centrado na origem)', () => {
    for (const t of TIPOS_COM_SIMBOLO_DE_CLIMATIZACAO) {
      for (const p of simboloDeClimatizacao(t)) {
        const xs = p.tipo === 'circulo' ? [p.cx - p.r, p.cx + p.r] : p.tipo === 'linha' ? [p.x1, p.x2] : p.tipo === 'poligono' ? p.pontos.map((q) => q[0]) : [p.x];
        const ys = p.tipo === 'circulo' ? [p.cy - p.r, p.cy + p.r] : p.tipo === 'linha' ? [p.y1, p.y2] : p.tipo === 'poligono' ? p.pontos.map((q) => q[1]) : [p.y];
        for (const v of [...xs, ...ys]) expect(Math.abs(v), `${t} ${p.tipo}`).toBeLessThanOrEqual(0.5 + 1e-9);
      }
    }
  });

  it('na prancha o símbolo sai no lugar e no tamanho pedidos (centro 100,200; lado 6 mm)', () => {
    const d = new DesenhistaDeProva();
    desenharSimboloDeClimatizacao(d, 'DIFUSOR', 100, 200, 6, { cor: '#000', espessuraMm: 0.25 });
    // O quadrado 6 × 6 centrado: cantos em 97/103 × 197/203; as diagonais entre eles.
    const linhas = d.chamadas.filter((c) => c.tipo === 'linha').map((c) => c.args as [number, number, number, number]);
    const xs = linhas.flatMap((l) => [l[0], l[2]]);
    const ys = linhas.flatMap((l) => [l[1], l[3]]);
    expect(Math.min(...xs)).toBeCloseTo(97, 6);
    expect(Math.max(...xs)).toBeCloseTo(103, 6);
    expect(Math.min(...ys)).toBeCloseTo(197, 6);
    expect(Math.max(...ys)).toBeCloseTo(203, 6);
    expect(d.chamadas.filter((c) => c.tipo === 'poligono')).toHaveLength(1);
  });

  it('idsDaClimatizacao: linha, dreno, duto e peças — e nada da água', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m.levels[0].id;
    m = applyBatch(m, [
      { type: 'AddTrecho', levelId: t, disciplina: 'FRIGORIGENA', a: point(0, 0), b: point(3000, 0), cotaAMm: 2500, cotaBMm: 2500, bitolaMm: 6 } as Command,
      { type: 'AddTrecho', levelId: t, disciplina: 'DRENO_AC', a: point(0, 0), b: point(3000, 0), cotaAMm: 2400, cotaBMm: 2400, bitolaMm: 25 } as Command,
      { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(0, 500), b: point(3000, 500), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 25 } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'EVAPORADORA_HI_WALL', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(0, 0), cotaMm: 2200 } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Difusor', at: point(1500, 0), cotaMm: 2600 } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'LAVATORIO', tipoHidraulico: 'LAVATORIO', at: point(0, 500), cotaMm: 600 } as Command,
    ]).model;
    const ids = idsDaClimatizacao(m);
    expect(ids).toHaveLength(4);
    expect(ids).not.toContain(m.trechos!.find((x) => x.disciplina === 'AGUA_FRIA')!.id);
    expect(ids).not.toContain(m.terminais!.find((x) => x.tipoHidraulico === 'LAVATORIO')!.id);
  });
});

describe('pendência D1 (10/10/2026) · o equipamento retangular na proporção da peça', () => {
  const caixa = (prims: ReturnType<typeof simboloDeClimatizacao>, lado: number) => {
    const contorno = prims.find((p) => p.tipo === 'poligono')!;
    if (contorno.tipo !== 'poligono') throw new Error('sem contorno');
    const xs = contorno.pontos.map(([x]) => x * lado);
    const ys = contorno.pontos.map(([, y]) => y * lado);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };

  it('a hi-wall de 900 × 220 desenha 900 × 220 (antes: 900 × 360, no quadrado da maior medida)', () => {
    const p = proporcaoDoSimbolo('EVAPORADORA_HI_WALL', 900, 220)!;
    const c = caixa(simboloDeClimatizacao('EVAPORADORA_HI_WALL', p), 900);
    expect(c.w).toBeCloseTo(900, 6);
    expect(c.h).toBeCloseTo(220, 6);
    // Sem proporção (a legenda), a forma de sempre.
    expect(caixa(simboloDeClimatizacao('EVAPORADORA_HI_WALL'), 900).h).toBeCloseTo(360, 6);
  });

  it('a condensadora e as outras retangulares também; a hélice cabe na profundidade', () => {
    const p = proporcaoDoSimbolo('CONDENSADORA_SPLIT', 850, 330)!;
    const prims = simboloDeClimatizacao('CONDENSADORA_SPLIT', p);
    expect(caixa(prims, 850).h).toBeCloseTo(330, 6);
    for (const c of prims) if (c.tipo === 'circulo') expect(Math.abs(c.cy) + c.r).toBeLessThanOrEqual(p / 2 + 1e-9);
    for (const t of ['EVAPORADORA_PISO_TETO', 'EVAPORADORA_DUTADA', 'CONDENSADORA_VRF'] as const) expect(proporcaoDoSimbolo(t, 1000, 400)).toBeCloseTo(0.4, 9);
  });

  it('os demais tipos (difusor, cassete, bomba) continuam no quadrado; medida estragada também', () => {
    expect(proporcaoDoSimbolo('DIFUSOR', 600, 600)).toBeNull();
    expect(proporcaoDoSimbolo('EVAPORADORA_CASSETE', 840, 840)).toBeNull();
    expect(proporcaoDoSimbolo('EVAPORADORA_HI_WALL', 0, 220)).toBeNull();
    expect(proporcaoDoSimbolo('EVAPORADORA_HI_WALL', 900, 10)).toBe(0.15);
  });

  it('a prancha desenha a hi-wall com a largura como lado (o contorno tem a profundidade da peça)', () => {
    const d = new DesenhistaDeProva();
    desenharSimboloDeClimatizacao(d, 'EVAPORADORA_HI_WALL', 0, 0, 18, { cor: '#000', espessuraMm: 0.25 }, 220 / 900);
    const poligono = d.chamadas.find((c) => c.tipo === 'poligono');
    expect(poligono).toBeTruthy();
    const ys = (poligono!.args[0] as { x: number; y: number }[]).map((q) => q.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo((18 * 220) / 900, 6);
  });
});

