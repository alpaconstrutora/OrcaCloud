/**
 * Quantitativos (PRD §8.7).
 *
 * Os valores esperados aqui são calculados À MÃO no comentário de cada caso, e
 * não copiados da saída do código. Teste que aceita o que o código produziu não
 * mede nada além de "não mudou" — e o erro que interessa em quantitativo é o que
 * já nasce errado.
 */

import { describe, expect, it } from 'vitest';
import {
  POLITICA_PADRAO,
  applyBatch,
  applyCommand,
  canonicalPayload,
  computeQuantities,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  type Command,
} from '../utils/blueprintKernel';

const T = 150;
const H = 2800;

function base() {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  return { model: r.model, levelId: r.model.levels[0].id };
}

function wall(levelId: string, ax: number, ay: number, bx: number, by: number, t = T): Command {
  return {
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: t,
    heightMm: H,
  };
}

function sala(levelId: string, x0: number, y0: number, x1: number, y1: number, t = T): Command[] {
  return [
    wall(levelId, x0, y0, x1, y0, t),
    wall(levelId, x1, y0, x1, y1, t),
    wall(levelId, x1, y1, x0, y1, t),
    wall(levelId, x0, y1, x0, y0, t),
  ];
}

describe('quantitativos · área de eixo × área de piso', () => {
  it('separa a área do eixo da área que se assenta no piso', () => {
    // Sala 4 × 3 m, eixo a eixo, parede de 150 mm.
    //   área de EIXO  = 4,00 × 3,00           = 12,00 m²
    //   piso real     = (4 − 0,15) × (3 − 0,15)
    //                 = 3,85 × 2,85           = 10,9725 m²
    // Diferença de 9,4% — é o erro que ir direto pela área de eixo introduz
    // no orçamento de piso, revestimento e rodapé.
    const { model, levelId } = base();
    const built = applyBatch(model, sala(levelId, 0, 0, 4000, 3000)).model;

    const q = computeQuantities(built);
    expect(q.ambientes).toHaveLength(1);

    const a = q.ambientes[0];
    expect(a.areaEixoM2).toBe(12);
    expect(a.areaPisoM2).toBeCloseTo(10.97, 2);
  });

  it('a correção de canto é exata em planta ortogonal', () => {
    // A fórmula é A_eixo − Σ(d·L) + Σ(d²·tan(giro/2)).
    // Para o retângulo acima, com d = 75 mm:
    //   Σ(d·L)              = 0,075 × 14,00 = 1,05 m²
    //   Σ(d²·tan(giro/2))   = 4 × 0,075²    = 0,0225 m²   (4 cantos retos)
    //   A' = 12,00 − 1,05 + 0,0225          = 10,9725 m²
    // Sem o termo do canto sairia 10,95 — o canto seria descontado duas vezes.
    const { model, levelId } = base();
    const built = applyBatch(model, sala(levelId, 0, 0, 4000, 3000)).model;

    const a = computeQuantities(built).ambientes[0];
    expect(a.areaPisoM2).toBeCloseTo(10.9725, 3);
    expect(a.areaPisoM2).not.toBeCloseTo(10.95, 3);
  });

  it('parede mais grossa recua mais', () => {
    // Mesma sala com parede de 250 mm:
    //   piso = (4 − 0,25) × (3 − 0,25) = 3,75 × 2,75 = 10,3125 m²
    const { model, levelId } = base();
    const built = applyBatch(model, sala(levelId, 0, 0, 4000, 3000, 250)).model;

    expect(computeQuantities(built).ambientes[0].areaPisoM2).toBeCloseTo(10.3125, 3);
  });

  it('limite sem material não recua — não há espessura para descontar', () => {
    // `Boundary` divide ambiente sem ser parede. O trecho de contorno que ele
    // forma tem espessura ZERO, então não pode encolher a área de piso.
    const { model, levelId } = base();
    const built = applyBatch(model, [
      ...sala(levelId, 0, 0, 6000, 3000),
      { type: 'AddBoundary', levelId, a: point(3000, 0), b: point(3000, 3000) },
    ]).model;

    const q = computeQuantities(built);
    expect(q.ambientes).toHaveLength(2);

    // Cada metade: 3,00 de eixo em x, recuando só nas 3 paredes reais.
    //   x: 3,00 − 0,075 (só um lado tem parede)  = 2,925
    //   y: 3,00 − 0,15                            = 2,85
    //   ≈ 8,33 m², contra 8,55 se recuasse nos quatro lados.
    const somaPiso = q.ambientes.reduce((s, a) => s + a.areaPisoM2, 0);
    expect(somaPiso).toBeGreaterThan(16.5);
    expect(somaPiso).toBeLessThan(17.0);
  });
});

describe('quantitativos · paredes e aberturas', () => {
  it('a abertura desconta da face e do volume de alvenaria', () => {
    // Parede de 4 m × 2,80 m × 0,15 m com uma porta de 0,90 × 2,10.
    //   face bruta    = 4,00 × 2,80          = 11,20 m²
    //   porta         = 0,90 × 2,10          =  1,89 m²
    //   face líquida  = 11,20 − 1,89         =  9,31 m²
    //   volume        = 9,31 × 0,15          =  1,3965 m³
    const { model, levelId } = base();
    const comParede = applyCommand(model, wall(levelId, 0, 0, 4000, 0)).model;
    const built = applyCommand(comParede, {
      type: 'AddOpening',
      wallId: comParede.walls[0].id,
      kind: 'door',
      offsetMm: 1000,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    }).model;

    const p = computeQuantities(built).paredes[0];
    expect(p.areaFaceBrutaM2).toBeCloseTo(11.2, 2);
    expect(p.areaAberturasM2).toBeCloseTo(1.89, 2);
    expect(p.areaFaceLiquidaM2).toBeCloseTo(9.31, 2);
    expect(p.volumeM3).toBeCloseTo(1.3965, 3);
  });

  it('o total de parede conta as DUAS faces', () => {
    // Reveste-se e pinta-se dos dois lados. Contar uma face subestima pela
    // metade — erro que só aparece na compra do material.
    const { model, levelId } = base();
    const built = applyCommand(model, wall(levelId, 0, 0, 4000, 0)).model;

    const q = computeQuantities(built);
    expect(q.paredes[0].areaFaceLiquidaM2).toBeCloseTo(11.2, 2);
    expect(q.totais.areaParedeDuasFacesM2).toBeCloseTo(22.4, 2);
  });

  it('porta interrompe o rodapé, janela não', () => {
    // Sala 4 × 3: perímetro de eixo = 14,00 m.
    //   com porta de 0,90  -> rodapé = 13,10 m
    //   com janela de 1,20 -> rodapé = 14,00 m (passa por baixo)
    const { model, levelId } = base();
    const salaBase = applyBatch(model, sala(levelId, 0, 0, 4000, 3000)).model;

    const comPorta = applyCommand(salaBase, {
      type: 'AddOpening',
      wallId: salaBase.walls[0].id,
      kind: 'door',
      offsetMm: 1000,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    }).model;
    expect(computeQuantities(comPorta).ambientes[0].comprimentoRodapeM).toBeCloseTo(13.1, 2);

    const comJanela = applyCommand(salaBase, {
      type: 'AddOpening',
      wallId: salaBase.walls[0].id,
      kind: 'window',
      offsetMm: 1000,
      widthMm: 1200,
      heightMm: 1200,
      sillMm: 900,
    }).model;
    expect(computeQuantities(comJanela).ambientes[0].comprimentoRodapeM).toBeCloseTo(14, 2);
  });
});

describe('quantitativos · política', () => {
  it('a perda é aplicada sem esconder o valor sem perda', () => {
    // Os dois números têm que continuar visíveis: o de projeto e o de compra.
    const { model, levelId } = base();
    const built = applyBatch(model, sala(levelId, 0, 0, 4000, 3000)).model;

    const a = computeQuantities(built).ambientes[0];
    expect(a.areaPisoComPerdaM2).toBeCloseTo(a.areaPisoM2 * 1.1, 2);
    expect(a.areaPisoComPerdaM2).toBeGreaterThan(a.areaPisoM2);
  });

  it('trocar a política muda o resultado, e a versão viaja junto', () => {
    const { model, levelId } = base();
    const built = applyBatch(model, sala(levelId, 0, 0, 4000, 3000)).model;

    const semPerda = computeQuantities(built, {
      ...POLITICA_PADRAO,
      version: 'quant-teste',
      perdaRevestimento: 0,
    });

    expect(semPerda.policy.version).toBe('quant-teste');
    expect(semPerda.ambientes[0].areaPisoComPerdaM2).toBeCloseTo(
      semPerda.ambientes[0].areaPisoM2,
      2,
    );
  });

  it('cada ambiente carrega a fórmula que produziu a área', () => {
    // RF-121: resultado sem procedência não pode ser conferido.
    const { model, levelId } = base();
    const built = applyBatch(model, sala(levelId, 0, 0, 4000, 3000)).model;

    expect(computeQuantities(built).ambientes[0].formulaAreaPiso).toContain('A_eixo');
  });

  it('MUDOU A FÓRMULA? A VERSÃO TEM QUE SUBIR — o cache é chaveado por ela', () => {
    // `computeAndStoreQuantities` é idempotente por (snapshot, versão): com a
    // mesma versão ele devolve o registro GRAVADO e não recalcula. Uma correção
    // de fórmula sem bump fica invisível em todo estudo já quantificado — o
    // sistema segue servindo o número velho, e a tela afirma que está atual.
    //
    // Este caso existe para quebrar quando alguém mexer na conta e esquecer o
    // bump. Ao alterar uma fórmula de propósito: suba `POLITICA_PADRAO.version`
    // e atualize a linha abaixo, com o motivo no comentário da constante.
    expect(POLITICA_PADRAO.version).toBe('quant-1.1.0');
  });
});

describe('quantitativos · reprodutibilidade (CA-08)', () => {
  it('o mesmo snapshot com a mesma política produz valores idênticos', () => {
    // É a garantia que o CA-08 cobra e que a persistência depende: o número que
    // o orçamento cita tem que sobreviver a ser recalculado, senão a conferência
    // nunca fecha.
    const { model, levelId } = base();
    const built = applyBatch(model, [
      ...sala(levelId, 0, 0, 6000, 4000),
      wall(levelId, 3000, 0, 3000, 4000),
    ]).model;

    const a = computeQuantities(built);
    const b = computeQuantities(built);
    expect(JSON.stringify(b.totais)).toBe(JSON.stringify(a.totais));
  });

  it('recalcular a partir do payload publicado dá o mesmo resultado', () => {
    // O caminho real da persistência: o quantitativo NÃO é calculado sobre o que
    // está na tela, e sim sobre o modelo reconstruído do payload canônico. Se os
    // dois divergissem, o número gravado não seria conferível.
    const { model, levelId } = base();
    const original = applyBatch(model, [
      ...sala(levelId, 0, 0, 6000, 4000),
      wall(levelId, 3000, 0, 3000, 4000),
    ]).model;

    const reconstruido = modelFromCanonicalPayload(
      parseCanonicalPayload(canonicalPayload(original)),
    );

    const daTela = computeQuantities(original);
    const doPayload = computeQuantities(reconstruido);
    expect(JSON.stringify(doPayload.totais)).toBe(JSON.stringify(daTela.totais));
  });

  it('trocar a política muda o resultado — por isso cria outro registro', () => {
    // A chave única é (snapshot, versão da política). Se políticas diferentes
    // dessem o mesmo número, guardar duas linhas seria desperdício; como dão
    // números diferentes, sobrescrever apagaria o que o orçamento já citou.
    const { model, levelId } = base();
    const built = applyBatch(model, sala(levelId, 0, 0, 4000, 3000)).model;

    const padrao = computeQuantities(built, POLITICA_PADRAO);
    const outra = computeQuantities(built, {
      ...POLITICA_PADRAO,
      version: 'quant-sem-perda',
      perdaRevestimento: 0,
    });

    expect(outra.totais.areaPisoComPerdaM2).not.toBeCloseTo(
      padrao.totais.areaPisoComPerdaM2,
      2,
    );
    expect(outra.totais.areaPisoM2).toBeCloseTo(padrao.totais.areaPisoM2, 6);
  });
});
