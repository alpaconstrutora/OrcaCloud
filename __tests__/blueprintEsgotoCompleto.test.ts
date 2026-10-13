/**
 * O ESGOTO INTEIRO NUM CLIQUE (13/10/2026) — `planejarEsgotoCompleto`.
 * Plano: `docs/planos/2026-10-13-hidro-ancoras-automaticas.md`, item 4.1.
 *
 * A casa: `fixtures/casaEsgotoNoLote.ts` — sem caixa de inspeção e sem ligação.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, type BlueprintModel } from '../utils/blueprintKernel';
import { planejarEsgoto, trechosDeEsgotoSemDestino } from '../utils/blueprintEsgotoAutomatico';
import { MOTIVO_SEM_FRENTE, ROTULO_DO_COLETOR, cotaDaRedeEstimada, ligacaoDaRede, planejarColetorPredial } from '../utils/blueprintColetorPredial';
import { planejarEsgotoCompleto } from '../utils/blueprintEsgotoCompleto';
import { HIPOTESES_ESGOTO_PADRAO } from '../utils/blueprintEsgotoAutomatico';
import { casa } from './fixtures/casaEsgotoNoLote';

const lancar = (m: BlueprintModel) => applyBatch(m, planejarEsgotoCompleto(m).comandos).model;
const tipos = (m: BlueprintModel) => (m.terminais ?? []).map((t) => t.tipoHidraulico).filter((t) => t === 'CAIXA_INSPECAO' || t === 'LIGACAO_ESGOTO').sort();
/** A rede em geometria (sem ids): o que o desenho mostra. */
const geometria = (m: BlueprintModel) =>
  (m.trechos ?? []).map((t) => `${t.levelId}|${t.a.x},${t.a.y},${t.cotaAMm}>${t.b.x},${t.b.y},${t.cotaBMm}/${t.bitolaMm}/${t.rotulo ?? ''}`).sort();

describe('planejarEsgotoCompleto', () => {
  it('UM lote, do vaso à rede pública: caixa, ramais, ligação, coletor', () => {
    const m = casa();
    const p = planejarEsgotoCompleto(m);
    expect(p.pendencias).toEqual([]);
    expect(p.lancaColetor).toBe(true);
    const depois = applyBatch(m, p.comandos).model;
    expect(tipos(depois)).toEqual(['CAIXA_INSPECAO', 'LIGACAO_ESGOTO']);
    expect(planejarEsgoto(depois).aLigar).toBe(0);
    expect(trechosDeEsgotoSemDestino(depois)).toEqual([]);
    expect((depois.trechos ?? []).some((t) => t.rotulo === ROTULO_DO_COLETOR)).toBe(true);
    const lr = ligacaoDaRede(depois)!;
    expect(lr).toMatchObject({ sugerida: true, at: { x: 600, y: -7700 } });
    expect(cotaDaRedeEstimada(lr)).toBe(true);
    // O coletor lançado é o que o plano faria: nada mais a fazer nele.
    expect(planejarColetorPredial(depois, HIPOTESES_ESGOTO_PADRAO)).toMatchObject({ motivo: null, ligacaoId: lr.id });
  });

  it('diz o que presumiu — e o que conferir', () => {
    const p = planejarEsgotoCompleto(casa());
    expect(p.presumido).toEqual([
      expect.stringMatching(/^Caixa de inspeção posta entre a fachada e a frente do lote, com o fundo a −\d,\d\d m\.$/),
      'Ligação à rede pública posta na frente do lote, com a rede ESTIMADA a 1,50 m de profundidade (cota −1,50 m).',
      'Arraste as peças para onde estão de verdade (o plano recalcula) e confirme a cota da rede com a concessionária.',
    ]);
  });

  it('clicar de novo não duplica peça nem muda a rede', () => {
    const uma = lancar(casa());
    const p2 = planejarEsgotoCompleto(uma);
    // O 2º clique RELANÇA a rede (como o "Relançar" de sempre), e o relançar apaga os sugeridos
    // ligados à caixa — o coletor e a ventilação juntos. O coletor volta no mesmo lote, igual.
    expect(p2.presumido).toEqual([]);
    const duas = applyBatch(uma, p2.comandos).model;
    expect(tipos(duas)).toEqual(tipos(uma));
    expect(geometria(duas)).toEqual(geometria(uma));
  });

  it('sem frente do lote: lança o que dá (caixa, ramais, ventilação) e devolve a pendência', () => {
    const m = casa({ frenteY: null });
    const p = planejarEsgotoCompleto(m);
    expect(p.pendencias).toEqual([MOTIVO_SEM_FRENTE]);
    expect(p.lancaColetor).toBe(false);
    expect(p.presumido[0]).toMatch(/junto à fachada mais próxima/);
    expect(p.presumido[p.presumido.length - 1]).toBe('Arraste as peças para onde estão de verdade (o plano recalcula).');
    const depois = applyBatch(m, p.comandos).model;
    expect(tipos(depois)).toEqual(['CAIXA_INSPECAO']);
    expect(planejarEsgoto(depois).aLigar).toBe(0);
  });

  it('sem aparelho de esgoto: nada a lançar, e a pendência diz o que falta', () => {
    const p = planejarEsgotoCompleto(casa({ semAparelhos: true }));
    expect(p.comandos).toEqual([]);
    expect(p.pendencias[0]).toMatch(/coloque os aparelhos/);
  });

  it('coletor confirmado à mão é decisão do usuário: o botão não o relança', () => {
    const uma = lancar(casa());
    const trecho = uma.trechos!.find((t) => t.rotulo === ROTULO_DO_COLETOR)!;
    const confirmado = applyCommand(uma, { type: 'SetTrechoProps', trechoId: trecho.id, sugerido: false }).model;
    // Mover a ligação mudaria o plano do coletor — mesmo assim ele não entra no lote.
    const lr = ligacaoDaRede(confirmado)!;
    const movida = applyCommand(confirmado, { type: 'SetTerminalProps', terminalId: lr.id, cotaMm: lr.cotaMm - 300 }).model;
    expect(planejarEsgotoCompleto(movida).lancaColetor).toBe(false);
  });
});
