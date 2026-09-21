/**
 * SKETCHUP — COLLADA (.dae) (21/09/2026, backlog P2 — "SKP"): a parede vira
 * prisma com o vão aberto (volume confere), triângulos com normal para fora,
 * anel côncavo triangulado certo, estrutura e telhado entram, XML em metros
 * e Z para cima com um nó por pavimento, cobertura no cabeçalho e ao lado.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { COBERTURA_COLLADA, fatiasDaParede, gerarCollada, malhasDoModelo, prisma, triangularAnel } from '../utils/blueprintCollada';
import { artefatosDoFormato } from '../services/blueprintGedService';
import { PAPEIS } from '../utils/blueprintExport';

/** Volume assinado pela divergência: positivo quando os triângulos olham para fora. */
function volume(posicoes: number[], triangulos: number[]): number {
  let v = 0;
  for (let i = 0; i < triangulos.length; i += 3) {
    const [a, b, c] = [triangulos[i], triangulos[i + 1], triangulos[i + 2]].map((k) => [posicoes[3 * k], posicoes[3 * k + 1], posicoes[3 * k + 2]]);
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return v;
}

function casa() {
  const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
  const t = nivel.model.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(nivel.model, [w(0, 0, 4000, 0), w(4000, 0, 4000, 3000), w(4000, 3000, 0, 3000), w(0, 3000, 0, 0)]).model;
  const frente = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
  m = applyCommand(m, { type: 'AddOpening', wallId: frente.id, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 } as Command).model;
  m = applyCommand(m, { type: 'AddOpening', wallId: frente.id, kind: 'window', offsetMm: 2500, widthMm: 1200, heightMm: 1200, sillMm: 1000 } as Command).model;
  return { m, t, frente };
}

describe('SKP · COLLADA', () => {
  it('fatia a parede em torno dos vãos: peitoril, verga e trechos cheios', () => {
    const fatias = fatiasDaParede(4000, 2800, [
      { offsetMm: 1000, widthMm: 900, sillMm: 0, heightMm: 2100 },
      { offsetMm: 2500, widthMm: 1200, sillMm: 1000, heightMm: 1200 },
    ]);
    expect(fatias).toEqual([
      { t0: 0, t1: 1000, z0: 0, z1: 2800 },
      { t0: 1000, t1: 1900, z0: 2100, z1: 2800 }, // verga da porta (sem peitoril)
      { t0: 1900, t1: 2500, z0: 0, z1: 2800 },
      { t0: 2500, t1: 3700, z0: 0, z1: 1000 }, // peitoril da janela
      { t0: 2500, t1: 3700, z0: 2200, z1: 2800 }, // verga da janela
      { t0: 3700, t1: 4000, z0: 0, z1: 2800 },
    ]);
  });

  it('prisma e anel côncavo: normais para fora (volume positivo) e área da triangulação = área do polígono', () => {
    const caixa = prisma([point(0, 0), point(2000, 0), point(2000, 1000), point(0, 1000)], 0, 3000);
    expect(volume(caixa.posicoes, caixa.triangulos)).toBeCloseTo(2 * 1 * 3, 6);
    // O mesmo anel no sentido oposto dá o mesmo sólido.
    const invertida = prisma([point(0, 1000), point(2000, 1000), point(2000, 0), point(0, 0)], 0, 3000);
    expect(volume(invertida.posicoes, invertida.triangulos)).toBeCloseTo(6, 6);
    // Um L (côncavo): 6 vértices → 4 triângulos, área 3 + 1 = 4 m² → prisma de 1 m = 4 m³.
    const L = [point(0, 0), point(3000, 0), point(3000, 1000), point(1000, 1000), point(1000, 2000), point(0, 2000)];
    expect(triangularAnel(L)).toHaveLength(12);
    const pl = prisma(L, 0, 1000);
    expect(volume(pl.posicoes, pl.triangulos)).toBeCloseTo(4, 6);
  });

  it('a parede com porta e janela perde exatamente o volume dos vãos; esquadrias, estrutura e telhado entram', () => {
    const { m, t, frente } = casa();
    const { malhas, resumo } = malhasDoModelo(m);
    const parede = malhas.find((x) => x.id === `parede-${frente.uid}`)!;
    // 4,00 × 0,15 × 2,80 − porta 0,9×0,15×2,1 − janela 1,2×0,15×1,2 = 1,68 − 0,2835 − 0,216 = 1,1805 m³
    expect(volume(parede.posicoes, parede.triangulos)).toBeCloseTo(1.1805, 4);
    expect(resumo).toMatchObject({ paredes: 4, esquadrias: 2, estruturas: 0, aguas: 0 });
    expect(malhas.find((x) => x.nome.startsWith('Porta'))?.material).toBe('mat-porta');
    expect(malhas.find((x) => x.nome.startsWith('Janela'))?.material).toBe('mat-vidro');

    let m2 = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(2000, 1500)], larguraMm: 300, profundidadeMm: 300, alturaMm: 2800, baseMm: 0, circular: true, rotacaoDeg: 0 } as Command).model;
    m2 = applyCommand(m2, { type: 'AddStructural', levelId: t, kind: 'LAJE', pontos: [point(0, 0), point(4000, 0), point(4000, 3000), point(0, 3000)], larguraMm: 0, profundidadeMm: 0, alturaMm: 120, baseMm: 2800, circular: false, rotacaoDeg: 0 } as Command).model;
    m2 = applyCommand(m2, { type: 'AddAgua', levelId: t, pontos: [point(-500, -500), point(4500, -500), point(4500, 3500), point(-500, 3500)], beiralIndex: 0, inclinacaoPct: 30, baseMm: 2920, espessuraMm: 150 } as Command).model;
    const r2 = malhasDoModelo(m2);
    expect(r2.resumo).toMatchObject({ estruturas: 2, aguas: 1 });
    const pilar = r2.malhas.find((x) => x.nome.startsWith('Pilar'))!;
    // Cilindro ⌀0,30 × 2,80 facetado em 24: ≈ π·0,15²·2,8 = 0,198 m³ (um pouco menos pelas facetas).
    expect(volume(pilar.posicoes, pilar.triangulos)).toBeGreaterThan(0.19);
    expect(volume(pilar.posicoes, pilar.triangulos)).toBeLessThan(0.198);
    const laje = r2.malhas.find((x) => x.nome.startsWith('Laje'))!;
    expect(volume(laje.posicoes, laje.triangulos)).toBeCloseTo(4 * 3 * 0.12, 6);
    // A laje nasce na cota base (2,80 m): todo Z ≥ 2,8.
    expect(Math.min(...laje.posicoes.filter((_, i) => i % 3 === 2))).toBeCloseTo(2.8, 6);
    const agua = r2.malhas.find((x) => x.nome.startsWith('Água'))!;
    // 5×4 m em planta, 150 mm de placa pela normal: volume ≈ área real × espessura = 20·√(1+0,09)·0,15 ≈ 3,13 m³.
    expect(volume(agua.posicoes, agua.triangulos)).toBeCloseTo(20 * Math.sqrt(1.09) * 0.15, 1);
    // Sobe: o beiral (y=-500) fica na base e o fundo (y=3500) 1,2 m acima.
    const zs = agua.posicoes.filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(1.2);
  });

  it('XML: metros, Z para cima, materiais, um nó por pavimento com as peças, cobertura no cabeçalho; determinístico', () => {
    const { m } = casa();
    const o = { titulo: 'Casa & Cia', revisao: 3, hash: 'abc123', kernelVersion: 'blueprint-kernel-ts-x' };
    const xml = gerarCollada(m, o);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">')).toBe(true);
    expect(xml).toContain('<unit name="meter" meter="1"/>');
    expect(xml).toContain('<up_axis>Z_UP</up_axis>');
    expect(xml).toContain('Casa &amp; Cia — rev. 3 — hash abc123');
    expect(xml).toContain('<node id="pav-');
    expect(xml).toContain('name="Térreo"');
    expect((xml.match(/<geometry /g) ?? []).length).toBe(6); // 4 paredes + porta + janela
    expect((xml.match(/<material /g) ?? []).length).toBe(6);
    expect(xml).toContain('4 parede(s), 2 esquadria(s), 0 peça(s) estrutural(is), 0 água(s)');
    for (const linha of COBERTURA_COLLADA) expect(xml).toContain(linha.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
    expect(gerarCollada(m, o)).toBe(xml);
    expect(xml).not.toContain('NaN');
  });

  it('o serviço monta .dae + cobertura, e o GED aceita o formato', () => {
    const { m } = casa();
    const artefatos = artefatosDoFormato('dae', m, { titulo: 'Casa', revisao: 1, hash: 'h', denominador: 50, papel: PAPEIS.find((p) => p.id === 'A3')!, data: new Date('2026-09-21T12:00:00Z') } as never);
    expect(artefatos[0].tipo).toBe('dae');
    expect(artefatos[0].nome.endsWith('.dae')).toBe(true);
    expect(artefatos[0].blob.size).toBeGreaterThan(0);
    expect(artefatos[1].tipo).toBe('cobertura');
  });
});
