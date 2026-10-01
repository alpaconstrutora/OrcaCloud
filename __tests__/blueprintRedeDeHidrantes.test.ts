/**
 * INCÊNDIO E3.1 (30/09/2026): a rede de hidrantes automática — colunas que
 * atravessam as lajes, ramais no forro, geral da bomba; sugerida, num lote,
 * provada por `conferirPlanoDaRede` e calculável pela E2.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { conferirPlanoDaRede, planejarRedeDeHidrantes } from '../utils/blueprintRedeDeHidrantes';
import { HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO as HIP, calculoDeIncendio } from '../utils/blueprintCalculoIncendio';
import { marcasDoLancamentoDeIncendio } from '../utils/blueprintConferenciaIncendio';

const peca = (l: string, tipo: string, x: number, y: number, c: number): Command =>
  ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, at: point(x, y), cotaMm: c, tipoHidraulico: tipo }) as Command;

/** `andares` pavimentos de 2,90 m; a bomba no térreo; um hidrante por andar perto da escada (x 8000) e, se `dois`, outro longe (x 20000). */
function predio(andares: number, dois = false): BlueprintModel {
  let m = emptyModel();
  for (let i = 0; i < andares; i++) m = applyCommand(m, { type: 'AddLevel', name: `P${i}`, elevationMm: i * 2900, defaultHeightMm: 2800 }).model;
  const cmds: Command[] = [peca(m.levels[0].id, 'BOMBA_INCENDIO', 0, 0, 300)];
  for (const l of m.levels) {
    cmds.push(peca(l.id, 'HIDRANTE_SIMPLES', 8000, 4000, 1300));
    if (dois) cmds.push(peca(l.id, 'HIDRANTE_SIMPLES', 20000, 4000, 1300));
  }
  return applyBatch(m, cmds).model;
}

describe('E3.1 · rede de hidrantes automática', () => {
  it('⚠️ PRONTO QUANDO: um prédio de 5 andares vira UMA coluna, e todo hidrante chega à bomba', () => {
    const m = predio(5);
    const plano = planejarRedeDeHidrantes(m);
    expect(plano.motivo).toBeNull();
    expect(plano.colunas).toHaveLength(1);
    expect(plano.colunas[0].pavimentos).toBe(5);
    expect(conferirPlanoDaRede(m, plano)).toEqual({ ok: true });
    const depois = applyBatch(m, plano.comandos).model;
    expect(marcasDoLancamentoDeIncendio(depois)).toEqual([]);
    // Tudo sugerido, num lote.
    expect(depois.trechos!.every((t) => t.sugerido)).toBe(true);
  });

  it('a rede lançada se CALCULA: o mais desfavorável é o do último andar', () => {
    const m = predio(5);
    const depois = applyBatch(m, planejarRedeDeHidrantes(m).comandos).model;
    const c = calculoDeIncendio(depois, HIP);
    expect(c.motivo).toBeNull();
    const pior = depois.terminais!.find((t) => t.id === c.desfavoraveis[0].terminalId)!;
    expect(pior.levelId).toBe(depois.levels[4].id);
  });

  it('dois grupos de hidrantes longe um do outro viram duas colunas, ligadas pelo geral', () => {
    const m = predio(3, true);
    const plano = planejarRedeDeHidrantes(m);
    expect(plano.colunas).toHaveLength(2);
    expect(conferirPlanoDaRede(m, plano)).toEqual({ ok: true });
  });

  it('relançar apaga o sugerido anterior e não duplica a rede', () => {
    const m = predio(3);
    const uma = applyBatch(m, planejarRedeDeHidrantes(m).comandos).model;
    const plano2 = planejarRedeDeHidrantes(uma);
    expect(plano2.apagados).toBe(uma.trechos!.length);
    const duas = applyBatch(uma, plano2.comandos).model;
    expect(duas.trechos!.length).toBe(uma.trechos!.length);
  });

  it('hidrante já ligado por tubo CONFIRMADO não é religado', () => {
    const m = predio(2);
    const lancado = applyBatch(m, planejarRedeDeHidrantes(m).comandos).model;
    const confirmado = applyBatch(lancado, lancado.trechos!.map((t) => ({ type: 'SetTrechoProps', trechoId: t.id, sugerido: false }) as Command)).model;
    const plano = planejarRedeDeHidrantes(confirmado);
    expect(plano.aLigar).toEqual([]);
    expect(plano.jaLigados).toHaveLength(2);
    expect(plano.comandos).toEqual([]);
  });

  it('sem fonte: o motivo diz o que fazer; hidrante ABAIXO da bomba: a coluna desce até ele (E3.2)', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    m = applyCommand(m, peca(m.levels[0].id, 'HIDRANTE_SIMPLES', 0, 0, 1300)).model;
    expect(planejarRedeDeHidrantes(m).motivo).toMatch(/lance a bomba de incêndio \(ou a caixa de incêndio\) primeiro/);
    let n = applyCommand(emptyModel(), { type: 'AddLevel', name: 'S', elevationMm: -2900, defaultHeightMm: 2800 }).model;
    n = applyCommand(n, { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const [sub, ter] = [...n.levels].sort((a, b) => a.elevationMm - b.elevationMm);
    n = applyBatch(n, [peca(ter.id, 'BOMBA_INCENDIO', 0, 0, 300), peca(sub.id, 'HIDRANTE_SIMPLES', 5000, 0, 1300)]).model;
    const plano = planejarRedeDeHidrantes(n);
    expect(plano.motivo).toBeNull();
    expect(conferirPlanoDaRede(n, plano)).toEqual({ ok: true });
  });
});
