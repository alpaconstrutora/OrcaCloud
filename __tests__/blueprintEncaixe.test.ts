/**
 * O ÍMÃ do desenho — os pontos notáveis (09/09/2026).
 *
 * ─── O PEDIDO ───────────────────────────────────────────────────────────────
 *
 * "sinto falta de um componente snap", testando o sistema elétrico.
 *
 * O ímã pegava ponta de parede, canto, eixo e canto de estrutura, terminal e
 * grade — e não pegava o que o gesto de instalação pede: **encaixar SOBRE a
 * parede**. Uma tomada fica no meio de uma parede, e ali não havia alvo nenhum:
 * o ponto caía na grade, perto da parede e fora dela.
 */
import { describe, expect, it } from 'vitest';
import {
  TIPOS_GEOMETRICOS,
  encaixeGeometrico,
  type SegmentoParaEncaixe,
} from '../utils/blueprintEncaixe';

const TODOS = new Set<string>(TIPOS_GEOMETRICOS);
const LIM = 100;

/** Uma parede de 5 m ao longo do X, com 150 mm de espessura. */
const parede: SegmentoParaEncaixe = {
  id: 'w1',
  a: { x: 0, y: 0 },
  b: { x: 5000, y: 0 },
  espessuraMm: 150,
};

const achar = (
  mundo: { x: number; y: number },
  ativos: Set<string> = TODOS,
  segmentos: SegmentoParaEncaixe[] = [parede],
  ancora?: { x: number; y: number },
) => encaixeGeometrico(segmentos, [], mundo, { limite: LIM, ativos, ancora });

describe('encaixe · SOBRE a parede — o que faltava', () => {
  it('⚠️ o ponto no MEIO de uma parede prende NA parede', () => {
    // O caso do pedido. Antes, aqui não havia alvo nenhum e o ponto caía na
    // grade: a tomada ficava perto da parede e fora dela.
    const r = achar({ x: 1234, y: 10 });
    expect(r?.tipo).toBe('SOBRE');
    expect(r?.ponto).toEqual({ x: 1234, y: 0 });
  });

  it('EIXO e FACE são os dois `SOBRE`, e ganha o mais PERTO do cursor', () => {
    // Quem aponta a linha desenhada está apontando a FACE, e é nela que a
    // tomada encosta; quem aponta o miolo quer o eixo, que é por onde o
    // eletroduto corre. Os dois são "sobre a parede", e dentro do mesmo tipo a
    // distância decide — é o que mantém o ímã previsível sem inventar uma
    // hierarquia entre eixo e face que ninguém pediu.
    expect(achar({ x: 2000, y: 10 })?.ponto.y).toBe(0); // eixo, a 10
    expect(achar({ x: 2000, y: 70 })?.ponto.y).toBeCloseTo(75, 6); // face, a 5
    expect(achar({ x: 2000, y: 40 })?.ponto.y).toBeCloseTo(75, 6); // face, a 35 < 40
  });

  it('longe da parede não prende em nada', () => {
    expect(achar({ x: 2000, y: 900 })).toBeNull();
  });

  it('além da ponta, o eixo não é `SOBRE` — vira EXTENSÃO', () => {
    const r = achar({ x: 5400, y: 10 });
    expect(r?.tipo).toBe('EXTENSAO');
    expect(r?.ponto.x).toBeCloseTo(5400, 6);
  });
});

describe('encaixe · os notáveis', () => {
  it('MEIO vence SOBRE no mesmo ponto — prioridade, não distância', () => {
    // No meio da parede os dois valem. Com a distância decidindo, mover o mouse
    // um pixel trocaria "meio da parede" por "um ponto qualquer sobre ela", e o
    // desenho mudaria de significado sem o gesto mudar.
    const r = achar({ x: 2500, y: 20 });
    expect(r?.tipo).toBe('MEIO');
    expect(r?.ponto).toEqual({ x: 2500, y: 0 });
  });

  it('INTERSEÇÃO vence tudo onde duas paredes se cruzam', () => {
    const cruzada: SegmentoParaEncaixe = {
      id: 'w2',
      a: { x: 2000, y: -2000 },
      b: { x: 2000, y: 2000 },
      espessuraMm: 150,
    };
    const r = achar({ x: 2030, y: 30 }, TODOS, [parede, cruzada]);
    expect(r?.tipo).toBe('INTERSECAO');
    expect(r?.ponto).toEqual({ x: 2000, y: 0 });
  });

  it('⚠️ cruzamento NO AR não prende — não há nada construído ali', () => {
    // Duas paredes que quase se encontram têm o cruzamento das RETAS fora das
    // duas. Prender ali criaria geometria a partir de uma linha imaginária.
    const solta: SegmentoParaEncaixe = {
      id: 'w2',
      a: { x: 2000, y: 500 },
      b: { x: 2000, y: 2000 },
    };
    const r = achar({ x: 2010, y: 10 }, new Set(['INTERSECAO']), [parede, solta]);
    expect(r).toBeNull();
  });

  it('PERPENDICULAR só existe com âncora, e cai no pé da perpendicular', () => {
    const semAncora = achar({ x: 3000, y: 30 }, new Set(['PERPENDICULAR']));
    expect(semAncora).toBeNull();

    const com = achar({ x: 3010, y: 30 }, new Set(['PERPENDICULAR']), [parede], {
      x: 3000,
      y: 2000,
    });
    expect(com?.tipo).toBe('PERPENDICULAR');
    expect(com?.ponto).toEqual({ x: 3000, y: 0 });
  });

  it('CENTRO pega pelo miolo E pela borda do círculo', () => {
    const circulo = [{ id: 'p1', centro: { x: 0, y: 0 }, raioMm: 300 }];
    const opc = { limite: LIM, ativos: new Set(['CENTRO']) };
    // Pelo miolo.
    expect(encaixeGeometrico([], circulo, { x: 50, y: 0 }, opc)?.ponto).toEqual({ x: 0, y: 0 });
    // Pela borda — é assim que se pega o centro de um pilar sem mirar no meio.
    expect(encaixeGeometrico([], circulo, { x: 320, y: 0 }, opc)?.tipo).toBe('CENTRO');
    // E no vazio entre os dois, não.
    expect(encaixeGeometrico([], circulo, { x: 180, y: 0 }, opc)).toBeNull();
  });
});

describe('encaixe · o que o usuário desliga não é calculado', () => {
  it('com SOBRE desligado, o meio da parede não prende', () => {
    expect(achar({ x: 1234, y: 40 }, new Set(['MEIO', 'INTERSECAO']))).toBeNull();
  });

  it('com tudo desligado, nada prende', () => {
    expect(achar({ x: 2500, y: 0 }, new Set())).toBeNull();
  });

  it('desligar um tipo revela o de baixo, e não apaga o ponto', () => {
    // No meio da parede, sem MEIO, ainda há SOBRE — o cursor continua preso à
    // parede, só que dizendo outra coisa. Um tipo desligado não pode fazer o
    // ponto cair na grade se outro ainda vale.
    const r = achar({ x: 2500, y: 20 }, new Set(['SOBRE']));
    expect(r?.tipo).toBe('SOBRE');
  });
});

describe('encaixe · casos degenerados', () => {
  it('segmento de comprimento zero não entra em nada', () => {
    const zero: SegmentoParaEncaixe = { id: 'z', a: { x: 0, y: 0 }, b: { x: 0, y: 0 } };
    // A ponta dele já é EXTREMIDADE, que é resolvida antes deste módulo.
    expect(achar({ x: 0, y: 0 }, TODOS, [zero])).toBeNull();
  });

  it('paralelas não têm interseção — e não estouram com divisão por zero', () => {
    const outra: SegmentoParaEncaixe = { id: 'w2', a: { x: 0, y: 1000 }, b: { x: 5000, y: 1000 } };
    expect(achar({ x: 2500, y: 500 }, new Set(['INTERSECAO']), [parede, outra])).toBeNull();
  });

  it('lista vazia devolve nulo', () => {
    expect(encaixeGeometrico([], [], { x: 0, y: 0 }, { limite: LIM, ativos: TODOS })).toBeNull();
  });

  it('⚠️ a triagem não come candidato válido — 200 paredes, e acha a certa', () => {
    // A triagem existe para a INTERSEÇÃO não ser quadrática no acervo inteiro.
    // Um filtro apertado demais faria o ímã falhar só em desenho grande, que é
    // onde ninguém testa.
    const muitas: SegmentoParaEncaixe[] = Array.from({ length: 200 }, (_, i) => ({
      id: `w${i}`,
      a: { x: 0, y: i * 3000 },
      b: { x: 5000, y: i * 3000 },
      espessuraMm: 150,
    }));
    const r = encaixeGeometrico(muitas, [], { x: 2500, y: 150 * 3000 + 20 }, {
      limite: LIM,
      ativos: TODOS,
    });
    expect(r?.tipo).toBe('MEIO');
    expect(r?.id).toBe('w150');
  });
});
