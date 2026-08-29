/**
 * Exportação das ELEVAÇÕES para papel — `desenharElevacao` / `enquadrarElevacao`.
 *
 * Mesmo princípio de `blueprintExport.test.ts`: a comparação é sobre as chamadas
 * de desenho (via `DesenhistaDeProva`), não sobre pixel. O que se confere é que
 * a escala é entrada (recusa se não couber), que cada parede vira um retângulo e
 * cada vão um recorte, e que o carimbo sai.
 */

import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import {
  DesenhistaDeProva,
  PAPEIS,
  desenharElevacao,
  enquadrarElevacao,
  type OpcoesExportacao,
} from '../utils/blueprintExport';
import { projetarElevacao } from '../utils/blueprintElevation';

const T = 150;
const H = 2800;

function sala(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  const levelId = base.model.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: T,
    heightMm: H,
  });
  let m = applyBatch(base.model, [
    w(0, 0, 5000, 0),
    w(5000, 0, 5000, 4000),
    w(5000, 4000, 0, 4000),
    w(0, 4000, 0, 0),
  ]).model;
  m = applyBatch(m, [
    { type: 'AddOpening', wallId: m.walls[0].id, kind: 'door', offsetMm: 500, widthMm: 900, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: m.walls[0].id, kind: 'window', offsetMm: 2500, widthMm: 1500, heightMm: 1200, sillMm: 1000 },
  ]).model;
  return m;
}

const opcoes = (denominador: number): OpcoesExportacao => ({
  denominador,
  papel: PAPEIS[0], // A4
  titulo: 'Estudo teste',
  revisao: 3,
  hash: 'abc123def456',
});

describe('enquadrarElevacao', () => {
  it('recusa a escala que não cabe e sugere a que caberia', () => {
    const proj = projetarElevacao(sala(), { direcao: 'FRENTE' });
    const apertado = enquadrarElevacao(proj, 5, PAPEIS[0]); // 1:5 numa fachada de 5 m
    expect(apertado.cabe).toBe(false);
    expect(apertado.escalaSugerida).toBeGreaterThan(5);

    const folgado = enquadrarElevacao(proj, apertado.escalaSugerida!, PAPEIS[0]);
    expect(folgado.cabe).toBe(true);
  });

  it('marca vazio quando não há parede sólida', () => {
    const vazio = projetarElevacao(emptyModel(), { direcao: 'FRENTE' });
    expect(enquadrarElevacao(vazio, 100, PAPEIS[0]).vazio).toBe(true);
  });
});

describe('desenharElevacao', () => {
  it('emite linha do solo, um retângulo por parede, um recorte por vão e o carimbo', () => {
    const proj = projetarElevacao(sala(), { direcao: 'FRENTE' });
    const enq = enquadrarElevacao(proj, 100, PAPEIS[0]);
    const d = new DesenhistaDeProva();
    desenharElevacao(d, proj, opcoes(100), enq);

    // 4 paredes → 4 polígonos de preenchimento + 4 retângulos de contorno;
    // 2 vãos → 2 recortes brancos + 2 molduras.
    const poligonos = d.chamadas.filter((c) => c.tipo === 'poligono');
    const retangulos = d.chamadas.filter((c) => c.tipo === 'retangulo');
    expect(poligonos.length).toBe(4);
    // 4 contornos de parede + 2 recortes brancos + 2 molduras + carimbo (1) + escala gráfica
    expect(retangulos.length).toBeGreaterThanOrEqual(4 + 2 + 2 + 1);

    // Linha do solo: uma linha horizontal atravessando toda a largura do desenho.
    const linhas = d.chamadas.filter((c) => c.tipo === 'linha');
    expect(linhas.length).toBeGreaterThan(0);

    // O carimbo traz o título e o aviso.
    const textos = d.textos().join(' | ');
    expect(textos).toContain('Estudo teste');
    expect(textos).toContain('ESTUDO PRELIMINAR');
  });

  it('tudo dentro da folha A4 (210 × 297 mm)', () => {
    const proj = projetarElevacao(sala(), { direcao: 'LATERAL_DIREITA' });
    const enq = enquadrarElevacao(proj, 100, PAPEIS[0]);
    const d = new DesenhistaDeProva();
    desenharElevacao(d, proj, opcoes(100), enq);

    for (const c of d.chamadas) {
      if (c.tipo === 'linha') {
        const [x1, y1, x2, y2] = c.args as number[];
        for (const v of [x1, x2]) expect(v).toBeGreaterThanOrEqual(-1);
        for (const v of [x1, x2]) expect(v).toBeLessThanOrEqual(211);
        for (const v of [y1, y2]) expect(v).toBeLessThanOrEqual(298);
      }
    }
  });
});
