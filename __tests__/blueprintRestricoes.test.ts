/**
 * Restrições (18/09/2026, E1.4b): comandos e invariantes no kernel, cascata de
 * órfãs, canônico por índice, e a conferência com o comando corretivo.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  type BlueprintModel,
} from '../utils/blueprintKernel';
import { conferirRestricoes, violacoes } from '../utils/blueprintRestricoes';

function cena() {
  const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
  const t = nivel.model.levels[0].id;
  const m = applyBatch(nivel.model, [
    { type: 'AddWall', levelId: t, a: point(0, 300), b: point(6000, 300), thicknessMm: 150, heightMm: 2800 },
    { type: 'AddWall', levelId: t, a: point(0, 4000), b: point(3950, 4000), thicknessMm: 150, heightMm: 2800 },
    { type: 'AddWall', levelId: t, a: point(8000, 0), b: point(8000, 4000), thicknessMm: 150, heightMm: 2800 },
    { type: 'AddEixo', a: point(-500, 0), b: point(9000, 0), nome: 'A' },
    { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(2000, 250)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800 },
  ]).model;
  const [w1, w2, w3] = m.walls;
  const eixoA = m.eixos[0];
  const pilar = m.structures[0];
  return { m, t, w1, w2, w3, eixoA, pilar };
}

describe('kernel', () => {
  it('cria com alvo/referência por id, recusa combinação errada e valor faltando; a igual substitui; a órfã some quando o alvo é apagado', () => {
    const { m, w1, w2, eixoA } = cena();
    let x = applyCommand(m, { type: 'AddRestricao', tipo: 'ALINHADO_A_EIXO', alvo: { familia: 'wall', id: w1.id }, referencia: { familia: 'eixo', id: eixoA.id } }).model;
    expect(x.restricoes).toHaveLength(1);
    expect(x.restricoes[0]).toMatchObject({ tipo: 'ALINHADO_A_EIXO', alvo: { familia: 'wall', uid: w1.uid }, referencia: { familia: 'eixo', uid: eixoA.uid } });
    // A mesma (tipo, alvo, referência) de novo substitui, não duplica.
    x = applyCommand(x, { type: 'AddRestricao', tipo: 'ALINHADO_A_EIXO', alvo: { familia: 'wall', id: w1.id }, referencia: { familia: 'eixo', id: eixoA.id } }).model;
    expect(x.restricoes).toHaveLength(1);
    expect(() => applyCommand(x, { type: 'AddRestricao', tipo: 'ALINHADO_A_EIXO', alvo: { familia: 'wall', id: w1.id }, referencia: { familia: 'wall', id: w2.id } })).toThrow(/pede referência eixo/);
    expect(() => applyCommand(x, { type: 'AddRestricao', tipo: 'TRAVA_COMPRIMENTO', alvo: { familia: 'wall', id: w1.id } })).toThrow(/pede valorMm/);
    expect(() => applyCommand(x, { type: 'AddRestricao', tipo: 'IGUAL_COMPRIMENTO', alvo: { familia: 'wall', id: w1.id }, referencia: { familia: 'wall', id: w1.id } })).toThrow(/a si mesma/);
    x = applyCommand(x, { type: 'AddRestricao', tipo: 'IGUAL_COMPRIMENTO', alvo: { familia: 'wall', id: w2.id }, referencia: { familia: 'wall', id: w1.id } }).model;
    expect(x.restricoes).toHaveLength(2);
    // Apagar a parede w1 leva as DUAS restrições (alvo de uma, referência da outra).
    const semW1 = applyCommand(x, { type: 'DeleteWall', wallId: w1.id });
    expect(semW1.model.restricoes).toHaveLength(0);
    expect(semW1.diff.deleted).toEqual(expect.arrayContaining(x.restricoes.map((r) => r.id)));
    // Dividir a parede mantém a restrição no fragmento que herdou o uid.
    const dividida = applyCommand(x, { type: 'SplitWall', wallId: w1.id, at: point(3000, 300) }).model;
    expect(dividida.restricoes).toHaveLength(2);
  });

  it('canônico por ÍNDICE, ida e volta; só sai quando há restrição', () => {
    const { m, w1, eixoA } = cena();
    expect(canonicalPayload(m)).not.toContain('"restricoes":[{');
    const x = applyBatch(m, [
      { type: 'AddRestricao', tipo: 'DISTANCIA_AO_EIXO', alvo: { familia: 'wall', id: w1.id }, referencia: { familia: 'eixo', id: eixoA.id }, valorMm: 300 },
    ]).model;
    const json = canonicalPayload(x);
    expect(json).toContain('"restricoes":[{"alvo":{"familia":"wall","indice":0},"referencia":{"familia":"eixo","indice":0},"tipo":"DISTANCIA_AO_EIXO","valorMm":300}]');
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(json));
    expect(volta.restricoes).toHaveLength(1);
    expect(volta.restricoes[0].alvo.uid).toBe(volta.walls[0].uid);
    expect(canonicalPayload(volta)).toBe(json);
  });
});

describe('conferirRestricoes', () => {
  function com(m: BlueprintModel, cmds: Parameters<typeof applyBatch>[1]) {
    return applyBatch(m, cmds).model;
  }

  it('sobre o eixo: parede a 300 mm acusa 300 e a correção a põe no eixo mantendo junções; o pilar idem', () => {
    const { m, w1, eixoA, pilar } = cena();
    const x = com(m, [
      { type: 'AddRestricao', tipo: 'ALINHADO_A_EIXO', alvo: { familia: 'wall', id: w1.id }, referencia: { familia: 'eixo', id: eixoA.id } },
      { type: 'AddRestricao', tipo: 'ALINHADO_A_EIXO', alvo: { familia: 'structural', id: pilar.id }, referencia: { familia: 'eixo', id: eixoA.id } },
    ]);
    const c = conferirRestricoes(x);
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ atendida: false, desvio: 300, unidade: 'mm' });
    expect(c[0].correcao).toMatchObject({ type: 'TranslateEntities', delta: { x: 0, y: -300 }, manterJuncoes: true });
    expect(c[1]).toMatchObject({ atendida: false, desvio: 250 });
    const corrigido = applyBatch(x, [c[0].correcao!, c[1].correcao!]).model;
    expect(corrigido.walls[0].a).toEqual({ x: 0, y: 0 });
    expect(corrigido.structures[0].pontos[0]).toEqual({ x: 2000, y: 0 });
    expect(violacoes(conferirRestricoes(corrigido))).toHaveLength(0);
  });

  it('distância ao eixo respeita o lado; comprimento travado estica pela ponta B; igual comprimento usa a referência', () => {
    const { m, w1, w2, eixoA } = cena();
    const x = com(m, [
      { type: 'AddRestricao', tipo: 'DISTANCIA_AO_EIXO', alvo: { familia: 'wall', id: w1.id }, referencia: { familia: 'eixo', id: eixoA.id }, valorMm: 500 },
      { type: 'AddRestricao', tipo: 'TRAVA_COMPRIMENTO', alvo: { familia: 'wall', id: w2.id }, valorMm: 4000 },
      { type: 'AddRestricao', tipo: 'IGUAL_COMPRIMENTO', alvo: { familia: 'wall', id: w2.id }, referencia: { familia: 'wall', id: w1.id } },
    ]);
    const c = conferirRestricoes(x);
    expect(c[0]).toMatchObject({ desvio: 200 });
    expect(c[0].correcao).toMatchObject({ type: 'TranslateEntities', delta: { x: 0, y: 200 } }); // mais longe, do mesmo lado
    expect(c[1]).toMatchObject({ desvio: 50 });
    expect(c[1].correcao).toMatchObject({ type: 'MoveVertex', end: 'b', to: { x: 4000, y: 4000 }, manterJuncoes: true });
    expect(c[2]).toMatchObject({ desvio: 2050 });
    expect(c[2].correcao).toMatchObject({ type: 'MoveVertex', to: { x: 6000, y: 4000 } });
    const depois = applyCommand(x, c[1].correcao!).model;
    expect(conferirRestricoes(depois)[1].atendida).toBe(true);
  });

  it('paralela: acusa o ângulo e corrige com um giro inteiro em torno do centro; já paralela não tem correção', () => {
    const { m, w1, w3, eixoA } = cena();
    const x = com(m, [
      { type: 'AddRestricao', tipo: 'PARALELO', alvo: { familia: 'wall', id: w3.id }, referencia: { familia: 'eixo', id: eixoA.id } },
      { type: 'AddRestricao', tipo: 'PARALELO', alvo: { familia: 'wall', id: w1.id }, referencia: { familia: 'eixo', id: eixoA.id } },
    ]);
    const c = conferirRestricoes(x);
    expect(c[0]).toMatchObject({ atendida: false, desvio: 90, unidade: '°' });
    expect(c[0].correcao).toMatchObject({ type: 'RotateEntities', wallIds: [w3.id], centro: { x: 8000, y: 2000 } });
    expect(Math.abs((c[0].correcao as { anguloGraus: number }).anguloGraus)).toBe(90);
    expect(c[1]).toMatchObject({ atendida: true, correcao: null });
    const girada = applyCommand(x, c[0].correcao!).model;
    expect(conferirRestricoes(girada)[0].atendida).toBe(true);
  });

  it('sobre o eixo com parede NÃO paralela: acusa o ângulo e não oferece correção (é giro à mão)', () => {
    const { m, w3, eixoA } = cena();
    const x = com(m, [{ type: 'AddRestricao', tipo: 'ALINHADO_A_EIXO', alvo: { familia: 'wall', id: w3.id }, referencia: { familia: 'eixo', id: eixoA.id } }]);
    const [c] = conferirRestricoes(x);
    expect(c).toMatchObject({ atendida: false, unidade: '°', correcao: null });
    expect(c.semCorrecaoPorque).toMatch(/Rotacionar/);
  });
});
