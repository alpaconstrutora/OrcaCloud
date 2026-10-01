/**
 * INCÊNDIO E4.3 (01/10/2026): a jockey e os pressostatos — os ajustes saem do
 * shutoff da principal (esquema da NFPA 20, CONFERIR NA IT), e a conferência
 * cobra a jockey ligada, os pressostatos e a rede pressurizada no topo.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO as HIP, calculoDeIncendio } from '../utils/blueprintCalculoIncendio';
import { HIPOTESES_BOMBEAMENTO_PADRAO as HB, analisarBomba, pressurizacaoDaRede } from '../utils/blueprintBombeamentoIncendio';
import { conferenciaDeIncendio } from '../utils/blueprintConferenciaIncendio';

const PRINCIPAL = [{ vazaoLmin: 0, alturaMm: 70000 }, { vazaoLmin: 600, alturaMm: 55000 }, { vazaoLmin: 1200, alturaMm: 30000 }];
const JOCKEY_BOA = [{ vazaoLmin: 0, alturaMm: 75000 }, { vazaoLmin: 20, alturaMm: 72000 }, { vazaoLmin: 40, alturaMm: 60000 }];
const JOCKEY_FRACA = [{ vazaoLmin: 0, alturaMm: 50000 }, { vazaoLmin: 20, alturaMm: 45000 }, { vazaoLmin: 40, alturaMm: 30000 }];

/** O galpão da E2 com a principal (curva) e, se pedido, a jockey e os pressostatos. Um hidrante sobe a `alturaDoTopoMm`. */
function casaDeBombas(opts: { jockey?: typeof JOCKEY_BOA | null; pressostatos?: number; alturaDoTopoMm?: number } = {}): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const t = (ax: number, ca: number, bx: number, cb: number): Command => ({ type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(ax, 0), b: point(bx, 0), cotaAMm: ca, cotaBMm: cb, bitolaMm: 65 }) as Command;
  const p = (tipo: string, x: number, cota: number, extra: Record<string, unknown> = {}): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, at: point(x, 0), cotaMm: cota, tipoHidraulico: tipo, ...extra }) as Command;
  const topo = opts.alturaDoTopoMm ?? 1300;
  let x = applyBatch(m, [
    p('BOMBA_INCENDIO', 0, 300, { curvaBomba: PRINCIPAL }),
    t(0, 300, 0, 2600), t(0, 2600, 5000, 2600), t(5000, 2600, 30000, 2600), t(5000, 2600, 5000, 1300), t(30000, 2600, 30000, topo),
    p('HIDRANTE_SIMPLES', 5000, 1300), p('HIDRANTE_SIMPLES', 30000, topo),
    ...Array.from({ length: opts.pressostatos ?? 0 }, (_, i) => p('PRESSOSTATO', 1000 + i * 500, 2600)),
  ]).model;
  if (opts.jockey) x = applyCommand(x, p('BOMBA_JOCKEY', -2000, 300, { curvaBomba: opts.jockey, bombaPrincipalId: x.terminais![0].id })).model;
  return x;
}
const pz = (m: BlueprintModel) => pressurizacaoDaRede(m, HB, calculoDeIncendio(m, HIP))!;

describe('E4.3 · ajustes dos pressostatos', () => {
  it('conferido à mão: shutoff 70 m → parada 686 kPa, partida da jockey 616, partida da principal 581', () => {
    const r = pz(casaDeBombas({ jockey: JOCKEY_BOA, pressostatos: 2 }));
    expect(r.ajustes!.paradaJockeyKpa).toBeCloseTo(70 * 9.80665, 6);
    expect(r.ajustes!.partidaJockeyKpa).toBeCloseTo(70 * 9.80665 - 70, 6);
    expect(r.ajustes!.partidaPrincipalKpa).toBeCloseTo(70 * 9.80665 - 105, 6);
    expect(r.jockeyId).not.toBeNull();
    expect(r.jockeyAlcancaParada).toBe(true);
  });

  it('a jockey fraca (shutoff 50 m) não alcança a parada', () => {
    expect(pz(casaDeBombas({ jockey: JOCKEY_FRACA })).jockeyAlcancaParada).toBe(false);
  });

  it('o hidrante mais alto: a 60 m acima da bomba a rede esvazia antes de a principal partir', () => {
    expect(pz(casaDeBombas({ jockey: JOCKEY_BOA })).topoPressurizado!.atende).toBe(true);
    expect(pz(casaDeBombas({ jockey: JOCKEY_BOA, alturaDoTopoMm: 60000 })).topoPressurizado!.atende).toBe(false);
  });
});

describe('E4.3 · conferência', () => {
  const itens = (m: BlueprintModel) => {
    const c = calculoDeIncendio(m, HIP);
    return conferenciaDeIncendio(m, c, HIP, analisarBomba(m, HIP, HB, c), pressurizacaoDaRede(m, HB, c));
  };
  it('sem jockey e sem pressostato: as duas FALTAM', () => {
    const r = itens(casaDeBombas());
    expect(r.find((i) => i.item === 'Bomba jockey ligada à principal')!.estado).toBe('FALTA');
    expect(r.find((i) => i.item === 'Pressostatos (um por bomba)')!.estado).toBe('FALTA');
  });
  it('com jockey ligada e dois pressostatos: atendem', () => {
    const r = itens(casaDeBombas({ jockey: JOCKEY_BOA, pressostatos: 2 }));
    expect(r.find((i) => i.item === 'Bomba jockey ligada à principal')!.estado).toBe('ATENDE');
    expect(r.find((i) => i.item === 'Pressostatos (um por bomba)')!.estado).toBe('ATENDE');
    expect(r.find((i) => i.item === 'Jockey alcança a pressão de parada')!.estado).toBe('ATENDE');
  });
});
