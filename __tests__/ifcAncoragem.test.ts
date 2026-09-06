/**
 * Onde o modelo importado do IFC cai.
 *
 * ─── A PENDÊNCIA QUE ISTO FECHA ─────────────────────────────────────────────
 *
 * Em 06/09/2026 o usuário importou um modelo e encontrou a estrutura longe do
 * desenho de paredes. A suspeita registrada no plano era que a tradução
 * estivesse ignorando a `GetCoordinationMatrix` do arquivo.
 *
 * A suspeita foi REFUTADA por medição no arquivo real (Igreja Divino, AltoQi
 * Eberick, 449 produtos): aquela matriz é a IDENTIDADE — translação (0,0,0),
 * escala 1 — e as peças ocupam de 0,15 m a 19,93 m em X. O prédio simplesmente
 * nasce no canto da origem do próprio IFC, e a tradução o entrega fiel.
 *
 * O que faltava não era conta: era a tela dizer onde as peças iriam cair e
 * deixar escolher. Estes casos travam a escolha.
 */

import { describe, expect, it } from 'vitest';
import { applyCommand, emptyModel, point, type BlueprintModel } from '../utils/blueprintKernel';
import {
  caixaDasPecas,
  caixaDoDesenho,
  deslocamentoDaImportacao,
  type PecaTraduzida,
} from '../utils/ifcParaKernel';

/** Uma peça mínima; só os pontos importam para a pegada. */
const peca = (pontos: { x: number; y: number }[]): PecaTraduzida => ({
  expressID: 1,
  globalId: 'g',
  nome: 'P1',
  kind: 'PILAR',
  pontos,
  larguraMm: 200,
  profundidadeMm: 400,
  alturaMm: 3000,
  cotaBaseMm: 0,
  circular: false,
  rotacaoDeg: 0,
  pavimento: null,
});

/**
 * A pegada MEDIDA no arquivo real, convertida para o plano do kernel
 * (`plano.x = mundo.X`, `plano.y = −mundo.Z`), em mm.
 */
const IGREJA = [peca([point(150, 750)]), peca([point(19930, 19930)])];

function comParedes(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  });
  return applyCommand(base.model, {
    type: 'AddWall',
    levelId: base.model.levels[0].id,
    a: point(50000, 50000),
    b: point(56000, 50000),
    thicknessMm: 150,
    heightMm: 2800,
  }).model;
}

describe('importação de IFC · onde o modelo cai', () => {
  it('a pegada sai dos pontos das peças que VÃO entrar', () => {
    const c = caixaDasPecas(IGREJA);
    expect(c).toEqual({ minX: 150, minY: 750, maxX: 19930, maxY: 19930 });
  });

  it('sem peça nenhuma não há pegada — e ninguém desloca o que não existe', () => {
    expect(caixaDasPecas([])).toBeNull();
    expect(deslocamentoDaImportacao('ORIGEM', null, null)).toEqual({ dx: 0, dy: 0 });
  });

  it('ARQUIVO não mexe em nada — é o padrão, e o certo quando a origem é a mesma', () => {
    expect(deslocamentoDaImportacao('ARQUIVO', caixaDasPecas(IGREJA), null)).toEqual({
      dx: 0,
      dy: 0,
    });
  });

  it('ORIGEM encosta o canto da pegada em (0,0)', () => {
    expect(deslocamentoDaImportacao('ORIGEM', caixaDasPecas(IGREJA), null)).toEqual({
      dx: -150,
      dy: -750,
    });
  });

  it('DESENHO casa os CENTROS, não os cantos', () => {
    // Centro da parede: (53000, 50000). Centro da pegada: (10040, 10340).
    const d = deslocamentoDaImportacao('DESENHO', caixaDasPecas(IGREJA), caixaDoDesenho(comParedes()));
    expect(d.dx).toBeCloseTo(53000 - 10040, 6);
    expect(d.dy).toBeCloseTo(50000 - 10340, 6);
  });

  it('DESENHO sem nada desenhado NÃO inventa alvo', () => {
    const vazio = applyCommand(emptyModel(), {
      type: 'AddLevel',
      name: 'Térreo',
      elevationMm: 0,
      defaultHeightMm: 2800,
    }).model;
    expect(caixaDoDesenho(vazio)).toBeNull();
    expect(deslocamentoDaImportacao('DESENHO', caixaDasPecas(IGREJA), null)).toEqual({
      dx: 0,
      dy: 0,
    });
  });

  it('depois de centralizar, os centros COINCIDEM — a prova do arrasto', () => {
    const pegada = caixaDasPecas(IGREJA)!;
    const desenho = caixaDoDesenho(comParedes())!;
    const { dx, dy } = deslocamentoDaImportacao('DESENHO', pegada, desenho);
    const movida = caixaDasPecas(
      IGREJA.map((p) => peca(p.pontos.map((q) => ({ x: q.x + dx, y: q.y + dy })))),
    )!;
    expect((movida.minX + movida.maxX) / 2).toBeCloseTo((desenho.minX + desenho.maxX) / 2, 6);
    expect((movida.minY + movida.maxY) / 2).toBeCloseTo((desenho.minY + desenho.maxY) / 2, 6);
  });

  it('o LOTE não conta na caixa do desenho — senão a estrutura iria para o meio do terreno', () => {
    const base = comParedes();
    // Uma divisa de lote a 200 m daqui: se ela contasse, o centro do "desenho"
    // saltaria para o meio do terreno e a estrutura importada iria junto.
    const comLote = applyCommand(base, {
      type: 'AddBoundary',
      levelId: base.levels[0].id,
      kind: 'TERRENO',
      a: point(0, 0),
      b: point(200000, 0),
    }).model;
    expect(comLote.boundaries.length).toBe(1);
    expect(caixaDoDesenho(comLote)).toEqual(caixaDoDesenho(base));
  });
});
