/**
 * As NOTAS e exceções de 9.5.2 da NBR 5410 (13/09/2026) — conferidas contra o
 * texto da norma que o usuário mandou, cláusula a cláusula:
 *
 *   · 9.5.2.1.1, nota 2: em lavabo, varanda, depósito/despensa/sob escada de
 *     pequenas dimensões, a luz de PAREDE vale pela de teto;
 *   · 9.5.2.2.1 c, nota: varanda < 2 m² (ou < 0,80 m de profundidade) pode ter
 *     o ponto junto ao acesso, fora dela;
 *   · 9.5.2.2.1 e.1: cômodo ≤ 2,25 m² pode ter o ponto a até 0,80 m da porta;
 *   · 9.5.2.2.1 b: as 2 tomadas da bancada podem ser no MESMO ponto — dito.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import {
  DISTANCIA_PONTO_EXTERNO_MM,
  conferirIluminacao,
  conferirTomadas,
  distanciaAoAnelMm,
  minimoDeTomadas,
} from '../utils/blueprintDistribuicao';

/** Um cômodo retangular fechado `l × p` (mm) com origem em (0,0). */
function comodo(lMm: number, pMm: number) {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
  });
  const m = applyBatch(base, [w(0, 0, lMm, 0), w(lMm, 0, lMm, pMm), w(lMm, pMm, 0, pMm), w(0, pMm, 0, 0)]).model;
  return { m, t };
}

const tomada = (m: BlueprintModel, t: string, x: number, y: number): BlueprintModel =>
  applyCommand(m, {
    type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(x, y), cotaMm: 300, tipoEletrico: 'TUG',
  }).model;

const arandela = (m: BlueprintModel, t: string, x: number, y: number): BlueprintModel =>
  applyCommand(m, {
    type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Arandela', at: point(x, y), cotaMm: 2100, tipoEletrico: 'ILUMINACAO_PAREDE', potenciaW: 100,
  }).model;

describe('9.5.2.2.1 — o ponto externo admitido', () => {
  it('e.1: cômodo ≤ 2,25 m² admite a tomada a até 0,80 m da porta; acima disso, falta', () => {
    expect(minimoDeTomadas('OUTRO', 5.6, 1.96).admiteFora).toEqual({ ateMm: 800, motivo: expect.stringMatching(/2,25 m²/) });
    expect(minimoDeTomadas('OUTRO', 8, 3).admiteFora).toBeNull();
    expect(DISTANCIA_PONTO_EXTERNO_MM).toBe(800);

    // Depósito 1,5 × 1,5 m (eixos), tomada 500 mm para fora da parede de baixo.
    const { m, t } = comodo(1500, 1500);
    const perto = tomada(m, t, 750, -500);
    const c = conferirTomadas(perto.spaces[0], 'OUTRO', perto.walls, perto.terminais!, 1.8)!;
    expect(c).toMatchObject({ existentes: 0, existentesFora: 1, deficit: 0 });

    const longe = tomada(m, t, 750, -1200);
    const c2 = conferirTomadas(longe.spaces[0], 'OUTRO', longe.walls, longe.terminais!, 1.8)!;
    expect(c2).toMatchObject({ existentes: 0, existentesFora: 0, deficit: 1 });
  });

  it('c (nota): varanda < 2 m² ou com menos de 0,80 m de profundidade aceita o ponto junto ao acesso', () => {
    expect(minimoDeTomadas('VARANDA', 5.6, 1.9).admiteFora?.motivo).toMatch(/menos de 2 m²/);
    expect(minimoDeTomadas('VARANDA', 9, 2.8, 0.7).admiteFora?.motivo).toMatch(/0,80 m de profundidade/);
    expect(minimoDeTomadas('VARANDA', 12, 8, 2).admiteFora).toBeNull();

    // Varanda estreita 4,0 × 0,7 m (eixos) — profundidade útil < 0,80 m.
    const { m, t } = comodo(4000, 700);
    const comPontoNoAcesso = tomada(m, t, 2000, -300);
    const c = conferirTomadas(comPontoNoAcesso.spaces[0], 'VARANDA', comPontoNoAcesso.walls, comPontoNoAcesso.terminais!, 2.2)!;
    expect(c.admiteFora?.motivo).toMatch(/profundidade/);
    expect(c).toMatchObject({ existentesFora: 1, deficit: 0 });
  });

  it('b: a regra da cozinha DIZ que as 2 da bancada podem ser no mesmo ponto', () => {
    expect(minimoDeTomadas('COZINHA_SERVICO', 12, 9).regra).toMatch(/no mesmo ponto ou em pontos distintos/);
  });

  it('distanciaAoAnelMm: zero na borda, perpendicular ao lado, canto quando fora da projeção', () => {
    const anel = [point(0, 0), point(1000, 0), point(1000, 1000), point(0, 1000)];
    expect(distanciaAoAnelMm(anel, point(500, 0))).toBe(0);
    expect(distanciaAoAnelMm(anel, point(500, -300))).toBe(300);
    expect(distanciaAoAnelMm(anel, point(1300, -400))).toBe(500);
  });
});

describe('9.5.2.1.1, nota 2 — luz na parede em cômodo pequeno', () => {
  it('lavabo de 3 m² com arandela e sem luz de teto: NÃO é falta, e é dito como admitido', () => {
    const { m, t } = comodo(2000, 1500);
    const comArandela = arandela(m, t, 1000, 75);
    const c = conferirIluminacao(comArandela.spaces[0], comArandela.terminais!, 2.6, 'BANHEIRO');
    expect(c.luzNaParedeAdmitida).toBe(true);
    expect(c.faltaLuzDeTeto).toBe(false);
  });

  it('sala de 12 m² só com arandela: falta a luz de teto — a nota não vale para sala nem para cômodo grande', () => {
    const { m, t } = comodo(4000, 3000);
    const comArandela = arandela(m, t, 2000, 75);
    expect(conferirIluminacao(comArandela.spaces[0], comArandela.terminais!, 11.1, 'SALA_DORMITORIO').faltaLuzDeTeto).toBe(true);
    // Depósito grande (OUTRO, 11 m²) também não: "pequenas dimensões".
    expect(conferirIluminacao(comArandela.spaces[0], comArandela.terminais!, 11.1, 'OUTRO').faltaLuzDeTeto).toBe(true);
    // E sem tipo não se afirma a exceção.
    expect(conferirIluminacao(comArandela.spaces[0], comArandela.terminais!, 2.6, null).faltaLuzDeTeto).toBe(true);
  });
});
