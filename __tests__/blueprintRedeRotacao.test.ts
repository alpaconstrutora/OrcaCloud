/**
 * O GIRO da peça e a BITOLA do trecho em planta (09/09/2026).
 *
 * ─── O PEDIDO ───────────────────────────────────────────────────────────────
 *
 * "implentar rotacao e bitola do trecho em planta" — as duas lacunas que eu
 * havia declarado ao entregar as medidas, no dia anterior.
 *
 * ─── ⚠️ ONDE UM ERRO AQUI PASSARIA CALADO ───────────────────────────────────
 *
 * No SINAL do giro em 3D. O viewer está sob `@ts-nocheck`, o Y da planta vira o
 * Z do mundo, e uma peça virada para o lado errado é plausível demais para
 * alguém notar olhando — ainda mais numa caixa quase quadrada. Por isso a
 * matemática vive no módulo puro e é afirmada aqui contra a MESMA direção que a
 * planta usa: se as duas divergirem, o desenho e o 3D discordam, e é isso que o
 * teste pega.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  assertModelInvariants,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  payloadDoHash,
  point,
  type BlueprintModel,
} from '../utils/blueprintKernel';
import {
  MEDIDAS_PADRAO_QUADRO,
  cantosDaPeca,
  dentroDaPeca,
  giroDaPeca,
  quadroSob,
  rotacaoY3D,
  terminalEhRedondo,
  terminalSob,
} from '../utils/blueprintRede';

const CAIXA = { larguraMm: 400, alturaMm: 300, profundidadeMm: 200 };

function comQuadro(): { model: BlueprintModel; quadroId: string; terminalId: string } {
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
  m = applyCommand(m, {
    type: 'AddTerminal',
    levelId,
    disciplina: 'ELETRICA',
    tipo: 'Tomada',
    at: point(3000, 0),
    cotaMm: 300,
  }).model;
  return { model: m, quadroId: m.quadros[0].id, terminalId: m.terminais[0].id };
}

describe('giro · a pegada em planta', () => {
  it('sem giro, os cantos são os do retângulo alinhado', () => {
    const k = cantosDaPeca({ x: 0, y: 0 }, CAIXA, 0);
    expect(k[0]).toEqual({ x: -200, y: -100 });
    expect(k[2]).toEqual({ x: 200, y: 100 });
  });

  it('⚠️ a 90° a peça TROCA de eixo — 400 passa a medir no Y', () => {
    // É a prova de que o giro é do MODELO e não da tela: a largura de 400 mm
    // passa a ocupar o Y do desenho.
    const k = cantosDaPeca({ x: 0, y: 0 }, CAIXA, 90);
    const xs = k.map((p) => p.x);
    const ys = k.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(200, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(400, 6);
  });

  it('o giro é ANTI-HORÁRIO no modelo — o canto direito sobe', () => {
    // Sentido trocado espelharia a peça em relação à parede que a segura, e
    // numa caixa quase quadrada isso não chama atenção nenhuma.
    const [, direitoBaixo] = cantosDaPeca({ x: 0, y: 0 }, CAIXA, 45);
    expect(direitoBaixo.y).toBeGreaterThan(-100);
  });

  it('girar não move o CENTRO da peça', () => {
    for (const g of [0, 30, 90, 180, 270, 359]) {
      const k = cantosDaPeca({ x: 1000, y: 2000 }, CAIXA, g);
      const cx = k.reduce((a, p) => a + p.x, 0) / 4;
      const cy = k.reduce((a, p) => a + p.y, 0) / 4;
      expect(cx, `giro ${g}`).toBeCloseTo(1000, 6);
      expect(cy, `giro ${g}`).toBeCloseTo(2000, 6);
    }
  });
});

describe('giro · o 3D concorda com a planta', () => {
  it('⚠️ o eixo da LARGURA aponta para o mesmo lado nas duas vistas', () => {
    // O caso que um sinal trocado quebraria, e que nenhum tipo acusaria: o
    // viewer é `@ts-nocheck`. Em três.js, girar em torno de Y por `a` leva
    // (1,0,0) para (cos a, 0, −sen a); com Z = y da planta, o lado da largura
    // tem de acabar em (cos θ, sen θ), que é para onde a planta o manda.
    for (const graus of [0, 30, 90, 135, 270]) {
      const a = rotacaoY3D(graus);
      const eixo3d = { x: Math.cos(a), z: -Math.sin(a) };

      // Para onde a PLANTA aponta o mesmo lado: do canto esquerdo-baixo ao
      // direito-baixo, normalizado.
      const [p0, p1] = cantosDaPeca({ x: 0, y: 0 }, CAIXA, graus);
      const comp = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const eixoPlanta = { x: (p1.x - p0.x) / comp, z: (p1.y - p0.y) / comp };

      expect(eixo3d.x, `giro ${graus} · x`).toBeCloseTo(eixoPlanta.x, 9);
      expect(eixo3d.z, `giro ${graus} · z`).toBeCloseTo(eixoPlanta.z, 9);
    }
  });
});

describe('giro · o clique segue o desenho', () => {
  it('⚠️ a 90°, o clique pega onde a peça ESTÁ, e não onde ela estava', () => {
    // Sem o giro no acerto, um quadro deitado seria clicável numa faixa
    // perpendicular à que aparece na tela — pior que não ser clicável, porque
    // funciona às vezes.
    const q = [{ at: { x: 0, y: 0 }, ...CAIXA, rotacaoGraus: 90 }];
    // 180 mm no Y: dentro da peça girada (metade de 400), fora da não girada.
    expect(quadroSob(q, { x: 0, y: 180 }, 0)).not.toBeNull();
    // 180 mm no X: fora da girada (metade de 200), dentro da não girada.
    expect(quadroSob(q, { x: 180, y: 0 }, 0)).toBeNull();
  });

  it('a folga continua somando à pegada girada', () => {
    expect(dentroDaPeca({ x: 0, y: 0 }, CAIXA, 90, { x: 0, y: 240 }, 50)).toBe(true);
    expect(dentroDaPeca({ x: 0, y: 0 }, CAIXA, 90, { x: 0, y: 260 }, 50)).toBe(false);
  });

  it('o ponto REDONDO ignora o giro — e é reconhecido como redondo', () => {
    const redondo = { at: { x: 0, y: 0 }, larguraMm: 200, profundidadeMm: 200, rotacaoGraus: 45 };
    expect(terminalEhRedondo(redondo)).toBe(true);
    // Em qualquer direção, o alcance é o mesmo raio.
    expect(terminalSob([redondo], { x: 90, y: 0 }, 0)).not.toBeNull();
    expect(terminalSob([redondo], { x: 0, y: 90 }, 0)).not.toBeNull();
  });

  it('o ponto RETANGULAR girado é pego pela pegada', () => {
    const reto = { at: { x: 0, y: 0 }, larguraMm: 300, profundidadeMm: 100, rotacaoGraus: 90 };
    expect(terminalEhRedondo(reto)).toBe(false);
    expect(terminalSob([reto], { x: 0, y: 140 }, 0)).not.toBeNull();
    expect(terminalSob([reto], { x: 140, y: 0 }, 0)).toBeNull();
  });
});

describe('giro · o kernel', () => {
  it('⚠️ NORMALIZA para 0–359 — senão 0 e 360 seriam hashes diferentes', () => {
    const { model, quadroId } = comQuadro();
    const casos: [number, number][] = [
      [360, 0],
      [-90, 270],
      [450, 90],
      [-360, 0],
    ];
    for (const [entrada, esperado] of casos) {
      const m = applyCommand(model, {
        type: 'SetQuadroProps',
        quadroId,
        rotacaoGraus: entrada,
      }).model;
      expect(m.quadros[0].rotacaoGraus, `${entrada}°`).toBe(esperado);
    }
  });

  it('a invariante recusa o giro fora da faixa posto à mão', () => {
    const { model } = comQuadro();
    const sujo = { ...model, quadros: [{ ...model.quadros[0], rotacaoGraus: 360 }] };
    try {
      assertModelInvariants(sujo);
      throw new Error('deveria ter recusado');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('BAD_ROTATION');
    }
  });

  it('⚠️ desenho sem giro declarado NÃO ganha a chave no payload', () => {
    const { model } = comQuadro();
    const payload = JSON.parse(payloadDoHash(model));
    expect(Object.keys(payload.quadros[0])).not.toContain('rotacaoGraus');
    expect(Object.keys(payload.terminais[0])).not.toContain('rotacaoGraus');
  });

  it('o giro sobrevive ao ida e volta, e `null` volta a zero', () => {
    const { model, quadroId, terminalId } = comQuadro();
    let m = applyCommand(model, { type: 'SetQuadroProps', quadroId, rotacaoGraus: 45 }).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId, rotacaoGraus: 180 }).model;

    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    expect(giroDaPeca(volta.quadros[0])).toBe(45);
    expect(giroDaPeca(volta.terminais[0])).toBe(180);

    const zerado = applyCommand(m, { type: 'SetQuadroProps', quadroId, rotacaoGraus: null }).model;
    expect(zerado.quadros[0].rotacaoGraus).toBeNull();
    expect(giroDaPeca(zerado.quadros[0])).toBe(0);
  });
});

describe('giro · o IFC', () => {
  async function ifcCom(rotacaoGraus: number | null): Promise<string> {
    const { gerarIfc } = await import('../utils/blueprintIfc');
    const { model, quadroId } = comQuadro();
    const m =
      rotacaoGraus === null
        ? model
        : applyCommand(model, { type: 'SetQuadroProps', quadroId, rotacaoGraus }).model;
    return gerarIfc(m, {
      titulo: 'giro',
      revisao: 1,
      hash: 'g'.repeat(64),
      data: new Date('2026-09-09T12:00:00Z'),
    });
  }

  /** Quantas `IFCDIRECTION` o arquivo tem. */
  const quantasDirecoes = (ifc: string) => [...ifc.matchAll(/IFCDIRECTION\(/g)].length;

  it('⚠️ sem giro, o arquivo NÃO ganha direção nenhuma a mais', async () => {
    // Emitir `IFCDIRECTION((1.,0.,0.))` para giro zero seria correto pela norma
    // e mudaria o IFC de TODO desenho já publicado, porque todos têm giro zero.
    // `$` é o padrão, e é o que este arquivo sempre emitiu.
    expect(quantasDirecoes(await ifcCom(null))).toBe(quantasDirecoes(await ifcCom(0)));
  });

  it('com giro, sai a direção do eixo X local — e ela é EXATA a 90°', async () => {
    const semGiro = await ifcCom(null);
    const comGiro = await ifcCom(90);
    expect(quantasDirecoes(comGiro)).toBe(quantasDirecoes(semGiro) + 1);
    // `0.`, e não `0.000000`: ver o arredondamento em `direcaoDaPeca`.
    expect(comGiro).toContain('IFCDIRECTION((0.,1.,0.))');
  });
});
