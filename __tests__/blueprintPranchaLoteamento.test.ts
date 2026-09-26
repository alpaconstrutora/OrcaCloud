/**
 * PRANCHAS DO LOTEAMENTO (B4) — medidas com o `DesenhistaDeProva`.
 *
 * Aqui não se olha figura: conta-se o que foi DESENHADO. É o que separa
 * "a função rodou" de "a folha tem o que precisa ter" — e foi por isso que o
 * dublê existe desde a E4.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel } from '../utils/blueprintKernel';
import { DesenhistaDeProva, boundingBox, type Enquadramento } from '../utils/blueprintExport';
import { desenharLote, desenharLoteamento, desenharTabelasDoLoteamento, enquadrarPontos, paraPapel } from '../utils/blueprintPranchaLoteamento';

/** Área útil de um A3 paisagem, descontadas margens e carimbo. */
const ENQ: Enquadramento = {
  cabe: true,
  vazio: false,
  ocupacao: 0.8,
  desenhoLarguraMm: 300,
  desenhoAlturaMm: 200,
  utilLarguraMm: 380,
  utilAlturaMm: 240,
  offsetXMm: 12,
  offsetYMm: 12,
  escalaSugerida: 500,
};

function base(): BlueprintModel {
  return applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
}

function loteamento(): BlueprintModel {
  const m = base();
  const levelId = m.levels[0].id;
  const comEstrutura = applyBatch(m, [
    { type: 'AddQuadra', levelId, nome: 'A', pontos: [{ x: 0, y: 0 }, { x: 36000, y: 0 }, { x: 36000, y: 30000 }, { x: 0, y: 30000 }] },
    { type: 'AddVia', levelId, nome: 'Rua das Acácias', eixo: [{ x: -20000, y: -6000 }, { x: 56000, y: -6000 }], larguraMm: 12000, calcadaMm: 2000 },
    { type: 'AddAreaPublica', levelId, tipo: 'VERDE', nome: 'Praça Central', pontos: [{ x: 40000, y: 0 }, { x: 55000, y: 0 }, { x: 55000, y: 20000 }, { x: 40000, y: 20000 }] },
  ]).model;
  const quadraId = comEstrutura.quadras[0].id;
  return applyBatch(
    comEstrutura,
    [0, 1, 2].map((i) => ({
      type: 'AddLote' as const,
      levelId,
      quadraId,
      numero: String(i + 1),
      pontos: [
        { x: i * 12000, y: 0 },
        { x: (i + 1) * 12000, y: 0 },
        { x: (i + 1) * 12000, y: 30000 },
        { x: i * 12000, y: 30000 },
      ],
    })),
  ).model;
}

const textos = (d: DesenhistaDeProva) => d.chamadas.filter((c) => c.tipo === 'texto').map((c) => String(c.args[2]));

describe('o enquadramento vê o loteamento', () => {
  it('⚠️ um loteamento SEM parede tem caixa envolvente — senão a prancha sairia vazia', () => {
    const m = loteamento();
    expect(m.walls).toHaveLength(0);
    const caixa = boundingBox(m);
    expect(caixa).not.toBeNull();
    // A praça vai até x = 55.000 e a rua desce até y = −12.000 (eixo −6.000
    // menos meia caixa), então a caixa tem de passar do quarteirão.
    expect(caixa!.maxX).toBeGreaterThanOrEqual(55000);
    expect(caixa!.minY).toBeLessThanOrEqual(-6000);
  });

  it('a escala cabe nas duas dimensões e o desenho fica centrado', () => {
    const ctx = enquadrarPontos([{ x: 0, y: 0 }, { x: 36000, y: 0 }, { x: 36000, y: 30000 }, { x: 0, y: 30000 }], ENQ, 0);
    expect(ctx).not.toBeNull();
    // 380/36000 = 0,01055 · 240/30000 = 0,008 → manda o menor.
    expect(ctx!.escala).toBeCloseTo(0.008, 5);

    // O canto superior esquerdo do modelo cai no offset (com a sobra em X).
    const canto = paraPapel({ x: 0, y: 30000 }, ctx!);
    expect(canto.y).toBeCloseTo(ENQ.offsetYMm, 5);
    expect(canto.x).toBeGreaterThan(ENQ.offsetXMm); // centrado na horizontal
  });

  it('sem ponto nenhum não há o que enquadrar', () => {
    expect(enquadrarPontos([], ENQ)).toBeNull();
  });
});

describe('planta individual do lote', () => {
  it('desenha o lote, a quadra, os vizinhos e escreve medida e confrontante', () => {
    const m = loteamento();
    const d = new DesenhistaDeProva();
    desenharLote(d, m, m.lotes[1], ENQ);

    const escritos = textos(d);
    expect(escritos).toContain('Quadra A · Lote 2');
    expect(escritos).toContain('360,00 m²');
    expect(escritos).toContain('testada 12,00 m');
    // As quatro medidas dos lados.
    expect(escritos.filter((t) => t === '12,00 m')).toHaveLength(2);
    expect(escritos.filter((t) => t === '30,00 m')).toHaveLength(2);
    // Os confrontantes: a rua na frente e os vizinhos nas laterais.
    expect(escritos).toContain('Rua das Acácias');
    expect(escritos.some((t) => t.includes('Lote 1'))).toBe(true);
    expect(escritos.some((t) => t.includes('Lote 3'))).toBe(true);
    // Os vizinhos aparecem numerados, para situar.
    expect(escritos).toContain('1');
    expect(escritos).toContain('3');

    // O lote em destaque é preenchido; os vizinhos, não.
    const preenchimentos = d.chamadas.filter((c) => c.tipo === 'poligono');
    expect(preenchimentos).toHaveLength(1);
    expect(preenchimentos[0].args[1]).toBe('#dbeafe');
  });

  it('lote sem quadra ainda desenha — enquadra por ele mesmo', () => {
    const m = base();
    const solto = applyBatch(m, [
      { type: 'AddLote', levelId: m.levels[0].id, numero: '9', pontos: [{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 30000 }, { x: 0, y: 30000 }] },
    ]).model;
    const d = new DesenhistaDeProva();
    desenharLote(d, solto, solto.lotes[0], ENQ);
    expect(textos(d)).toContain('Lote 9');
    expect(d.chamadas.filter((c) => c.tipo === 'linha').length).toBeGreaterThanOrEqual(4);
  });
});

describe('planta geral do loteamento', () => {
  it('desenha via, área pública, lotes numerados e a quadra nomeada', () => {
    const m = loteamento();
    const d = new DesenhistaDeProva();
    desenharLoteamento(d, m, ENQ);

    const escritos = textos(d);
    expect(escritos).toContain('QUADRA A');
    expect(escritos).toContain('Praça Central');
    expect(escritos).toContain('300,00 m²');
    expect(escritos).toContain('Rua das Acácias');
    for (const n of ['1', '2', '3']) expect(escritos).toContain(n);

    // Uma área preenchida por via, por área pública e por lote.
    const poligonos = d.chamadas.filter((c) => c.tipo === 'poligono');
    expect(poligonos).toHaveLength(1 + 1 + 3);
  });

  it('desenho vazio não quebra e não desenha nada', () => {
    const d = new DesenhistaDeProva();
    desenharLoteamento(d, base(), ENQ);
    expect(d.chamadas).toHaveLength(0);
  });
});

describe('folha de tabelas', () => {
  it('traz o quadro de lotes, o resumo por quadra e a área da gleba', () => {
    const m = loteamento();
    const d = new DesenhistaDeProva();
    desenharTabelasDoLoteamento(d, m, 1080 * 1e6, ENQ);

    const escritos = textos(d);
    expect(escritos).toContain('QUADRO DE LOTES');
    expect(escritos).toContain('RESUMO POR QUADRA');
    expect(escritos).toContain('Testada (m)');
    expect(escritos).toContain('Frente para');
    expect(escritos).toContain('Rua das Acácias');
    expect(escritos).toContain('Área da gleba: 1080,00 m²');
    // Três linhas de lote com a área, mais o menor e o maior do resumo da
    // quadra — que aqui são iguais, porque os três lotes têm a mesma medida.
    expect(escritos.filter((t) => t === '360,00')).toHaveLength(3 + 2);
  });

  it('a tabela não transborda a folha: corta e avisa que continua', () => {
    const m0 = loteamento();
    // 60 lotes não cabem numa folha só.
    const muitos = applyBatch(
      m0,
      Array.from({ length: 60 }, (_, i) => ({
        type: 'AddLote' as const,
        levelId: m0.levels[0].id,
        quadraId: m0.quadras[0].id,
        numero: String(i + 100),
        pontos: [
          { x: i * 1000, y: 40000 },
          { x: i * 1000 + 900, y: 40000 },
          { x: i * 1000 + 900, y: 50000 },
          { x: i * 1000, y: 50000 },
        ],
      })),
    ).model;
    const d = new DesenhistaDeProva();
    desenharTabelasDoLoteamento(d, muitos, null, ENQ);
    expect(textos(d)).toContain('… (continua)');
  });
});
