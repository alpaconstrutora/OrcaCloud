/**
 * PA22 do prédio automático (17/11/2026, decisão do usuário 4a): as redes que o prédio traça em linha reta contornam pilar.
 * Aqui, o contorno das redes sob pressão (o alimentador e a rede de incêndio enterrados, a água do tipo) e a luz de teto
 * dentro do pilar ou num resíduo de geometria; o desvio do tubo de queda, o condutor pluvial e a drenagem da garagem têm a
 * prova no marco do prédio (o conflito com pilar zero nos quatro).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, conflitosDoModelo, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { contornarPilaresDasRedesSobPressao } from '../utils/predioAutomatico/contornoDePilar';
import { LUZ_LONGE_DO_PILAR_MM, luzesLongeDasDescidasDeCima } from '../utils/predioAutomatico/climatizacaoERede';

const pilar = (levelId: string, x: number, y: number, baseMm = 0, alturaMm = 3000): Command => ({ type: 'AddStructural', levelId, kind: 'PILAR', pontos: [{ x, y }], larguraMm: 300, profundidadeMm: 300, alturaMm, baseMm }) as Command;
const comPilar = (m: BlueprintModel) => conflitosDoModelo(m).filter((c) => c.classe === 'ESTRUTURA' && c.comprimentoDentroMm > 0);

describe('PA22 — as redes sob pressão por fora do pilar', () => {
  it('o alimentador enterrado a −0,30 m no lote passa por fora do pé do pilar do térreo (que desce até −0,50 m); as pontas não mudam', () => {
    let m = applyBatch(emptyModel(), [
      { type: 'AddLevel', name: 'Lote', elevationMm: 0, defaultHeightMm: 3000 },
      { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 },
    ]).model;
    const [lote, terreo] = m.levels.map((l) => l.id);
    m = applyBatch(m, [
      pilar(terreo, 5000, 5000, -500, 3500),
      { type: 'AddTrecho', levelId: lote, disciplina: 'AGUA_FRIA', a: point(5000, 300), b: point(5000, 9000), cotaAMm: -300, cotaBMm: -300, bitolaMm: 25, rotulo: 'Alimentador', sugerido: true } as Command,
    ]).model;
    expect(comPilar(m).length).toBe(1);
    const { comandos, trechos } = contornarPilaresDasRedesSobPressao(m, [lote]);
    expect(trechos).toBe(1);
    const depois = applyBatch(m, comandos).model;
    expect(comPilar(depois)).toEqual([]);
    const agua = (depois.trechos ?? []).filter((t) => t.disciplina === 'AGUA_FRIA');
    expect(agua.length).toBeGreaterThan(1);
    expect(agua.every((t) => t.rotulo === 'Alimentador' && t.cotaAMm === -300 && t.cotaBMm === -300 && t.bitolaMm === 25)).toBe(true);
    const pontas = agua.flatMap((t) => [`${t.a.x},${t.a.y}`, `${t.b.x},${t.b.y}`]);
    expect(pontas).toContain('5000,300');
    expect(pontas).toContain('5000,9000');
  });

  it('o pilar que não alcança a cota do tubo não muda nada (o do térreo começa no piso; o tubo, enterrado)', () => {
    let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
    const t = m.levels[0].id;
    m = applyBatch(m, [pilar(t, 5000, 5000, 0, 3000), { type: 'AddTrecho', levelId: t, disciplina: 'INCENDIO', a: point(5000, 300), b: point(5000, 9000), cotaAMm: -300, cotaBMm: -300, bitolaMm: 65 } as Command]).model;
    expect(contornarPilaresDasRedesSobPressao(m, [t]).trechos).toBe(0);
  });
});

describe('PA22c — a luz de teto fora do pilar e fora do resíduo de geometria', () => {
  /** Um cômodo 4 × 3 m com um pilar no meio e a luz de teto 50 mm ao lado do centro dele. */
  function sala(extras: (t: string) => Command[] = () => []) {
    let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Tipo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
    const t = m.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 });
    m = applyBatch(m, [w(0, 0, 4000, 0), w(4000, 0, 4000, 3000), w(4000, 3000, 0, 3000), w(0, 3000, 0, 0), pilar(t, 2000, 1500), ...extras(t)]).model;
    return { m, t };
  }
  const luz = (t: string, x: number, y: number): Command => ({ type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Luz', at: point(x, y), cotaMm: 3000, tipoEletrico: 'ILUMINACAO_TETO' }) as Command;

  it('a luz dentro do pilar anda no cômodo até 15 cm da pegada dele (sem andar de cima copiado — vale igual)', () => {
    const { m, t } = sala((t) => [luz(t, 2000, 1550)]);
    const r = luzesLongeDasDescidasDeCima(m, t);
    expect(r.luzes).toBe(1);
    const a = (applyBatch(m, r.comandos).model.terminais ?? []).find((x) => x.tipoEletrico === 'ILUMINACAO_TETO')!;
    // Fora do quadrado de 300 mm do pilar crescido de 150: |dx| ou |dy| ≥ 300.
    expect(Math.max(Math.abs(a.at.x - 2000), Math.abs(a.at.y - 1500))).toBeGreaterThanOrEqual(150 + LUZ_LONGE_DO_PILAR_MM);
  });

  it('a luz num resíduo de geometria (um triângulo de milímetros entre paredes) sai', () => {
    // Duas paredes que se encontram desalinhadas deixam um triângulo fino — o cômodo de menos de 0,1 m².
    const { m, t } = sala();
    const residuo = { ...m, spaces: [...m.spaces, { ...m.spaces[0], id: 'sp_residuo', uid: 'sp_residuo', ring: [point(3000, 2000), point(3003, 1925), point(3006, 2000)], holes: [], name: undefined }] } as BlueprintModel;
    const com = applyBatch(residuo, [luz(t, 3003, 1975)]).model;
    const r = luzesLongeDasDescidasDeCima({ ...com, spaces: residuo.spaces }, t);
    expect(r.removidas).toBe(1);
    expect(r.comandos).toEqual([{ type: 'DeleteTerminal', terminalId: (com.terminais ?? [])[0].id }]);
  });
});
