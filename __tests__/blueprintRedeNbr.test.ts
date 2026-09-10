/**
 * A convenção da NBR 5410 no traço, e o trecho que liga dois componentes.
 *
 * ─── OS DOIS PEDIDOS (09/09/2026) ───────────────────────────────────────────
 *
 * 1. *"este é o padrão da NBR 5410 para trecho elétrico: linha contínua =
 *    embutido na parede ou teto; linha pontilhada = embutida no piso"*
 * 2. *"implementar trecho automático ou clicar em um componente elétrico e
 *    outro"*
 */
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
} from '../utils/blueprintKernel';
import {
  MEDIDAS_PADRAO_QUADRO,
  TOLERANCIA_ENCAIXE_MM,
  embutidoNoPiso,
  encaixarEmPecaEletrica,
} from '../utils/blueprintRede';

function cena(): BlueprintModel {
  let m = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const levelId = m.levels[0].id;
  m = applyCommand(m, {
    type: 'AddQuadro',
    levelId,
    nome: 'QDC',
    at: point(0, 0),
    cotaMm: 1600,
  }).model;
  return applyCommand(m, {
    type: 'AddTerminal',
    levelId,
    disciplina: 'ELETRICA',
    tipo: 'Tomada',
    at: point(3000, 0),
    cotaMm: 300,
  }).model;
}

describe('NBR 5410 · contínua × pontilhada', () => {
  it('⚠️ no PISO quando as DUAS pontas estão em zero ou abaixo', () => {
    expect(embutidoNoPiso({ cotaAMm: 0, cotaBMm: 0 })).toBe(true);
    expect(embutidoNoPiso({ cotaAMm: -50, cotaBMm: -80 })).toBe(true);
  });

  it('na parede ou no teto quando sobe', () => {
    expect(embutidoNoPiso({ cotaAMm: 300, cotaBMm: 300 })).toBe(false);
    expect(embutidoNoPiso({ cotaAMm: 2800, cotaBMm: 2800 })).toBe(false);
  });

  it('⚠️ a PRUMADA que sai do piso NÃO é trecho de piso', () => {
    // As duas pontas, e não a média: um trecho que deixa o piso deixou de ser
    // dele, e desenhá-lo pontilhado diria que ele corre onde não corre.
    expect(embutidoNoPiso({ cotaAMm: -50, cotaBMm: 2500 })).toBe(false);
    expect(embutidoNoPiso({ cotaAMm: 2500, cotaBMm: -50 })).toBe(false);

    // ⚠️ E o caso que distingue "as duas pontas" de "a MÉDIA das pontas": sai
    // do contrapiso a −500 e sobe só 300. A média dá −100 e diria "piso"; o
    // trecho está na parede em toda a metade de cima. Sem este caso, uma
    // implementação por média passaria — medi, e passava.
    expect(embutidoNoPiso({ cotaAMm: -500, cotaBMm: 300 })).toBe(false);
  });
});

describe('trecho ligando dois componentes', () => {
  const m = cena();
  const levelId = m.levels[0].id;
  const agarrar = (p: { x: number; y: number }) =>
    encaixarEmPecaEletrica(point(p.x, p.y), m, levelId, TOLERANCIA_ENCAIXE_MM);

  it('⚠️ o QUADRO agarra — antes ele era invisível para o encaixe', () => {
    // `encaixarNoTerminal` só enxergava terminais. Ligar o QDC à primeira
    // tomada era mirar um ponto no vazio e torcer.
    const r = agarrar({ x: 0, y: 0 });
    expect(r.id).toBe(m.quadros[0].id);
    expect(r.ponto).toEqual({ x: 0, y: 0 });
  });

  it('⚠️ agarra pela PEGADA, e não só por um raio na âncora', () => {
    // O quadro tem 400 × 200 mm: clicar na borda dele é clicar NELE. Com um
    // raio fixo de 150 mm no centro, a borda ficava de fora — e num zoom
    // afastado 150 mm é menos de um pixel.
    const naBorda = { x: MEDIDAS_PADRAO_QUADRO.larguraMm / 2, y: 0 };
    expect(agarrar(naBorda).id).toBe(m.quadros[0].id);
  });

  it('a COTA da peça vem junto', () => {
    // Encaixar em planta e deixar a cota da barra põe o cano passando dois
    // metros acima da tomada, com o desenho parecendo ligado.
    expect(agarrar({ x: 0, y: 0 }).cotaMm).toBe(1600);
    expect(agarrar({ x: 3000, y: 0 }).cotaMm).toBe(300);
  });

  it('longe de tudo não agarra, e devolve o ponto original', () => {
    const r = agarrar({ x: 9000, y: 9000 });
    expect(r.id).toBeNull();
    expect(r.cotaMm).toBeNull();
    expect(r.ponto).toEqual({ x: 9000, y: 9000 });
  });

  it('⚠️ entre duas peças, ganha a MAIS PERTO do clique', () => {
    // Uma tomada dentro da pegada do quadro acontece — ele é grande. Ganhar por
    // ordem de varredura daria a peça errada conforme a família que eu li
    // primeiro.
    const comTomadaNoQuadro = applyCommand(m, {
      type: 'AddTerminal',
      levelId,
      disciplina: 'ELETRICA',
      tipo: 'Tomada',
      at: point(150, 0),
      cotaMm: 300,
    }).model;
    const r = encaixarEmPecaEletrica(
      point(150, 0),
      comTomadaNoQuadro,
      levelId,
      TOLERANCIA_ENCAIXE_MM,
    );
    expect(r.id).toBe(comTomadaNoQuadro.terminais[1].id);
    expect(r.cotaMm).toBe(300);
  });

  it('peça de OUTRO pavimento não agarra', () => {
    const outro = applyCommand(m, {
      type: 'AddLevel',
      name: 'Superior',
      elevationMm: 2800,
      defaultHeightMm: 2800,
    }).model;
    expect(encaixarEmPecaEletrica(point(0, 0), outro, outro.levels[1].id, TOLERANCIA_ENCAIXE_MM).id)
      .toBeNull();
  });
});
