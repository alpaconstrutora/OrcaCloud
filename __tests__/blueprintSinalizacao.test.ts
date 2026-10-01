/**
 * INCÊNDIO E7.2 (01/10/2026): a placa no kernel (0.86.0) — código, alvo por
 * índice, placa órfã — e a sinalização: placa de equipamento, placas de rota
 * nas mudanças de direção e na saída, e o kit (equipamento + placa num lote).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, canonicalPayload, emptyModel, modelFromCanonicalPayload, parseCanonicalPayload, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { analisarSinalizacao, comPlacas, proporSinalizacao } from '../utils/blueprintSinalizacao';
import { percursoDeFuga } from '../utils/blueprintRotaDeFuga';

/** Dois pavimentos 10 × 10 m, caixa da escada (x 6–10, y 0–6) com porta para o hall; porta da rua no térreo em (2,45; 0). */
function predio(): BlueprintModel {
  let m = emptyModel();
  for (let i = 0; i < 2; i++) m = applyCommand(m, { type: 'AddLevel', name: i === 0 ? 'Térreo' : '1º', elevationMm: 3000 * i, defaultHeightMm: 3000 }).model;
  const w = (l: string, ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 }) as Command;
  m.levels.forEach((lv, i) => {
    const l = lv.id;
    m = applyBatch(m, [w(l, 0, 0, 6000, 0), w(l, 6000, 0, 10000, 0), w(l, 10000, 0, 10000, 10000), w(l, 10000, 10000, 0, 10000), w(l, 0, 10000, 0, 0), w(l, 6000, 0, 6000, 6000), w(l, 6000, 6000, 10000, 6000)]).model;
    const porta = (wallId: string): Command => ({ type: 'AddOpening', wallId, kind: 'door', offsetMm: 2000, widthMm: 900, heightMm: 2100, sillMm: 0 }) as Command;
    m = applyCommand(m, porta(m.walls.find((x) => x.levelId === l && x.a.x === 6000 && x.b.x === 6000)!.id)).model;
    if (i === 0) m = applyCommand(m, porta(m.walls.find((x) => x.levelId === l && x.a.y === 0 && x.b.y === 0 && x.a.x === 0)!.id)).model;
  });
  return applyCommand(m, { type: 'AddEscada', levelId: m.levels[0].id, pontos: [point(8000, 1000), point(8000, 5000)], larguraMm: 1200, rotulo: 'E1' } as Command).model;
}
const ponto = (m: BlueprintModel, tipo: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
  applyCommand(m, { type: 'AddTerminal', levelId: m.levels[0].id, disciplina: 'INCENDIO', tipo, tipoHidraulico: tipo, at: point(x, y), cotaMm: 1600, ...extra } as Command).model;

describe('E7.2 · a placa no kernel (0.86.0)', () => {
  it('código só na placa e no padrão; o alvo tem de ser equipamento de incêndio (não outra placa)', () => {
    let m = ponto(predio(), 'EXTINTOR', 3000, 3000);
    const ext = m.terminais![0].id;
    m = ponto(m, 'PLACA', 3000, 3000, { codigoPlaca: 'e5', alvoId: ext, cotaMm: 1800 });
    expect(m.terminais![1]).toMatchObject({ codigoPlaca: 'E5', alvoId: ext });
    const placa = m.terminais![1].id;
    expect(() => applyCommand(m, { type: 'SetTerminalProps', terminalId: placa, alvoId: placa } as Command)).toThrow(/não é um equipamento de incêndio/);
    expect(() => applyCommand(m, { type: 'SetTerminalProps', terminalId: placa, codigoPlaca: 'EXTINTOR' } as Command)).toThrow(/Código de placa inválido/);
  });

  it('⚠️ PRONTO QUANDO: apagar o equipamento deixa a placa sem alvo — e a análise a marca', () => {
    let m = ponto(predio(), 'EXTINTOR', 3000, 3000);
    const ext = m.terminais![0].id;
    m = ponto(m, 'PLACA', 3000, 3000, { codigoPlaca: 'E5', alvoId: ext });
    m = applyCommand(m, { type: 'DeleteTerminal', terminalId: ext } as Command).model;
    const placa = m.terminais!.find((t) => t.tipoHidraulico === 'PLACA')!;
    expect(placa.alvoId).toBeNull();
    expect(analisarSinalizacao(m, null, null).placasOrfas).toEqual([placa.id]);
  });

  it('ida e volta pelo canônico preserva código, alvo (por índice) e a rotação; sem placa, as chaves nem aparecem', () => {
    let m = ponto(predio(), 'EXTINTOR', 3000, 3000);
    expect(canonicalPayload(m)).not.toMatch(/codigoPlaca|"alvo"/);
    m = ponto(m, 'PLACA', 3000, 3000, { codigoPlaca: 'E5', alvoId: m.terminais![0].id });
    m = ponto(m, 'PLACA', 5000, 5000, { codigoPlaca: 'S3', rotacaoGraus: -90 });
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    const e = volta.terminais!.find((t) => t.tipoHidraulico === 'EXTINTOR')!;
    const p1 = volta.terminais!.find((t) => t.codigoPlaca === 'E5')!;
    const p2 = volta.terminais!.find((t) => t.codigoPlaca === 'S3')!;
    expect(p1).toMatchObject({ codigoPlaca: 'E5', alvoId: e.id });
    expect(p2).toMatchObject({ codigoPlaca: 'S3', rotacaoGraus: 270 });
    expect(canonicalPayload(volta)).toBe(canonicalPayload(m));
  });
});

describe('E7.2 · a sinalização', () => {
  it('equipamento sem placa é dito; a proposta põe a placa certa apontando para ele', () => {
    let m = ponto(predio(), 'EXTINTOR', 3000, 3000);
    m = ponto(m, 'HIDRANTE_SIMPLES', 1000, 9000, { cotaMm: 1300 });
    const a = analisarSinalizacao(m, null, null);
    expect(a.equipamentosSemPlaca).toHaveLength(2);
    const depois = applyBatch(m, proporSinalizacao(m, a)).model;
    const placas = depois.terminais!.filter((t) => t.tipoHidraulico === 'PLACA');
    expect(placas.map((p) => [p.codigoPlaca, depois.terminais!.find((t) => t.id === p.alvoId)!.tipoHidraulico]).sort()).toEqual([
      ['E5', 'EXTINTOR'],
      ['E8', 'HIDRANTE_SIMPLES'],
    ]);
    expect(analisarSinalizacao(depois, null, null).equipamentosSemPlaca).toEqual([]);
  });

  it('a rota de fuga pede placa na mudança de direção (seta para o trecho seguinte) e "saída" na porta da rua', () => {
    const m = predio();
    const desc = m.levels[0].id;
    const p = percursoDeFuga(m, 'A', desc);
    const a = analisarSinalizacao(m, p, desc);
    const saida = a.pontosDaRota.find((x) => x.codigo === 'S12')!;
    expect(saida).toMatchObject({ levelId: desc, at: point(2450, 0), coberto: false });
    // Quem desce a escada sai da caixa pela porta (6; 2,45) e dobra para a rua (70°): placa de seta ali, no térreo.
    expect(a.pontosDaRota.some((x) => x.codigo === 'S3' && x.levelId === desc && x.at.x === 6000 && x.at.y === 2450)).toBe(true);
    // A dobra de 14° no canto da caixa (6; 6) não pede placa (abaixo de 30°).
    expect(a.pontosDaRota.some((x) => x.at.x === 6000 && x.at.y === 6000)).toBe(false);
    // Lançadas, ficam cobertas; e as de rota nascem viradas.
    const depois = applyBatch(m, proporSinalizacao(m, a)).model;
    const b = analisarSinalizacao(depois, percursoDeFuga(depois, 'A', desc), desc);
    expect(b.pontosDaRota.every((x) => x.coberto)).toBe(true);
    const s12 = depois.terminais!.find((t) => t.codigoPlaca === 'S12')!;
    expect(s12).toMatchObject({ cotaMm: 2200, rotacaoGraus: saida.rotacaoGraus });
  });

  it('o kit: os extintores e a placa de cada um num lote só, cada placa apontando o SEU extintor', () => {
    const m = predio();
    const l = m.levels[0].id;
    const ext = (x: number, y: number) => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo: 'EXTINTOR', tipoHidraulico: 'EXTINTOR', at: point(x, y), cotaMm: 1600 }) as Command;
    const lote = comPlacas(m, [ext(1000, 1000), ext(4000, 9000)]);
    expect(lote).toHaveLength(4);
    const depois = applyBatch(m, lote).model;
    for (const e of depois.terminais!.filter((t) => t.tipoHidraulico === 'EXTINTOR')) {
      const p = depois.terminais!.find((t) => t.alvoId === e.id)!;
      // Ao lado do extintor (40 cm), não em cima dele.
      expect(p.codigoPlaca).toBe('E5');
      expect(Math.hypot(p.at.x - e.at.x, p.at.y - e.at.y)).toBeCloseTo(400, 0);
    }
  });
});
