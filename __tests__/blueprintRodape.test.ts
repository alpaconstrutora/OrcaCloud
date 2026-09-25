/**
 * RODAPÉ COMO ELEMENTO (21/09/2026, backlog P2 — P2.21, kernel 0.55.0,
 * quant-1.16.0): trechos de rodapé — comandos, gerador por ambiente
 * (descontando portas, respeitando a declaração E7.2, idempotente), quantitativo
 * que soma os trechos quando há algum, orçamento e canônico.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, canonicalPayload, computeQuantities, emptyModel, KERNEL_VERSION, modelFromCanonicalPayload, parseCanonicalPayload, point, POLITICA_PADRAO, rotuloCurto, type Command } from '../utils/blueprintKernel';
import { comprimentoDoRodape, resumirRodapes, sugerirRodapes, trechosDoLado } from '../utils/blueprintRodape';
import { gerarLancamentos, MEDIDAS } from '../utils/blueprintBudget';

function casa() {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  // Duas salas 4×3 lado a lado, parede do meio em x=4000.
  m = applyBatch(m, [w(0, 0, 8000, 0), w(8000, 0, 8000, 3000), w(8000, 3000, 0, 3000), w(0, 3000, 0, 0), w(4000, 0, 4000, 3000)]).model;
  const [a, b] = [...m.spaces].sort((p, q) => p.ring[0].x - q.ring[0].x);
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: a.id, name: 'Sala', acabamentos: { rodape: { alturaMm: 100, itemCode: 'ROD-PORC', descricao: 'Rodapé porcelanato' } } },
    { type: 'NameSpace', spaceId: b.id, name: 'Garagem', acabamentos: { rodape: null } },
  ]).model;
  // Porta de 0,90 m na parede da frente da Sala, a 1,0 m do canto.
  const frente = m.walls[0];
  m = applyCommand(m, { type: 'AddOpening', wallId: frente.id, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 } as Command).model;
  return { m, t };
}

describe('rodapé como elemento (P2.21)', () => {
  it('trechosDoLado desconta os vãos; gerador: Sala com a declaração dela, Garagem pulada, porta descontada, idempotente por etiqueta', () => {
    expect(trechosDoLado(point(0, 0), point(4000, 0), [[1000, 1900]])).toEqual([[point(0, 0), point(1000, 0)], [point(1900, 0), point(4000, 0)]]);
    expect(trechosDoLado(point(0, 0), point(4000, 0), [])).toEqual([[point(0, 0), point(4000, 0)]]);
    const { m, t } = casa();
    const s = sugerirRodapes(m, t);
    expect(s.pulados.map((p) => [p.nome, p.motivo])).toEqual([['Garagem', 'declarado sem rodapé']]);
    // Sala: 4 lados, a frente partida em 2 pela porta → 5 trechos; 14 m − 0,9 m.
    expect(s.sugestoes).toHaveLength(5);
    expect(s.sugestoes.every((x) => x.nomeDoAmbiente === 'Sala')).toBe(true);
    const total = s.sugestoes.reduce((acc, x) => acc + x.comprimentoMm, 0);
    expect(Math.round(total)).toBe(14000 - 900);
    const cmd = s.sugestoes[0].comando as Extract<Command, { type: 'AddRodape' }>;
    expect(cmd).toMatchObject({ type: 'AddRodape', alturaMm: 100, itemCode: 'ROD-PORC', descricao: 'Rodapé porcelanato', sugerido: true });
    expect(cmd.spaceUid).toBeTruthy();
    // Lançar e sugerir de novo: nada (a Sala já tem trecho).
    const lancado = applyBatch(m, s.sugestoes.map((x) => x.comando)).model;
    expect(lancado.rodapes).toHaveLength(5);
    expect(sugerirRodapes(lancado, t).sugestoes).toHaveLength(0);
    expect(resumirRodapes(lancado, t)).toEqual({ trechos: 5, sugeridos: 5, metros: 13.1 });
    expect(rotuloCurto(lancado.rodapes[0].uid, 'rodape')).toMatch(/^F-/);
  });

  it('comandos e invariantes; quantitativo soma os trechos quando existem (senão o derivado); orçamento por trecho; canônico ida e volta com a etiqueta por índice', () => {
    const { m, t } = casa();
    const qSem = computeQuantities(m, POLITICA_PADRAO, KERNEL_VERSION);
    expect(POLITICA_PADRAO.version).toBe('quant-1.16.0');
    expect(qSem.totais.origemDoRodape).toBe('DERIVADO');
    expect(qSem.totais.comprimentoRodapeM).toBeCloseTo(13.1, 3); // Sala 14 − 0,9; Garagem declarou sem rodapé
    // Trechos: um à mão de 2 m com 70 mm e os 5 do gerador.
    let r = applyCommand(m, { type: 'AddRodape', levelId: t, pontos: [point(4200, 200), point(6200, 200)], alturaMm: 70, itemCode: 'ROD-MDF', descricao: 'Rodapé MDF' }).model;
    r = applyBatch(r, sugerirRodapes(r, t).sugestoes.map((x) => x.comando)).model;
    expect(r.rodapes).toHaveLength(6);
    const q = computeQuantities(r, POLITICA_PADRAO, KERNEL_VERSION);
    expect(q.rodapes).toHaveLength(6);
    expect(q.totais.origemDoRodape).toBe('TRECHOS');
    expect(q.totais.comprimentoRodapeM).toBeCloseTo(15.1, 3);
    expect(q.totais.porRodape.map((x) => [x.itemCode, x.alturaMm, Math.round(x.comprimentoM * 100) / 100, x.trechos])).toEqual([['ROD-MDF', 70, 2, 1], ['ROD-PORC', 100, 13.1, 5]]);
    const mdf = q.rodapes.find((x) => x.itemCode === 'ROD-MDF')!;
    expect(mdf.areaM2).toBeCloseTo(0.14, 6);
    // Comandos.
    const id = r.rodapes[0].id;
    r = applyCommand(r, { type: 'SetRodapeProps', rodapeId: id, alturaMm: 120, sugerido: false }).model;
    expect(r.rodapes[0]).toMatchObject({ alturaMm: 120 });
    expect(r.rodapes[0].sugerido).toBeUndefined();
    r = applyCommand(r, { type: 'MoveRodape', rodapeId: id, dx: 100, dy: 0 }).model;
    expect(r.rodapes[0].pontos[0].x).toBe(4300);
    expect(() => applyCommand(r, { type: 'SetRodapeProps', rodapeId: id, alturaMm: 900 })).toThrow(/BAD_BASEBOARD|altura/);
    expect(() => applyCommand(r, { type: 'AddRodape', levelId: t, pontos: [point(0, 0)] })).toThrow(/BAD_BASEBOARD|2 vértices/);
    expect(applyCommand(r, { type: 'DeleteRodape', rodapeId: id }).model.rodapes).toHaveLength(5);
    expect(applyCommand(applyCommand(r, { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 2800 }).model, { type: 'RemoveLevel', levelId: t }).model.rodapes).toHaveLength(0);
    // Orçamento: a medida de rodapé lista os trechos.
    const medida = MEDIDAS.find((x) => x.id === 'COMPRIMENTO_RODAPE')!;
    const lanc = gerarLancamentos(
      q,
      [{ mapeamento: { id: 'm1', organization_id: 'org', medida: medida.id, item_code: '88648', phase: 'Acabamento', budget_group: 'Revestimentos', agrupamento: 'TOTAL', filtro_ambiente: [], active: true } as never, item: { code: '88648', description: 'Rodapé', unit: 'M', price: 30, type: 'COMPOSITION' } as never }],
      { studyId: 's', studyName: 'Casa', snapshotId: 'n', snapshotHash: 'h', revision: 1 },
      {},
    );
    expect(lanc.entries.length).toBeGreaterThan(0);
    expect(lanc.entries.reduce((acc, l) => acc + l.quantity, 0)).toBeCloseTo(15.1, 2);
    // Canônico.
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.58.0');
    expect(parseCanonicalPayload(canonicalPayload(m)).rodapes).toBeUndefined();
    const payload = parseCanonicalPayload(canonicalPayload(r));
    expect(payload.rodapes).toHaveLength(6);
    expect(payload.rodapes!.filter((x) => x.etiqueta !== undefined)).toHaveLength(5);
    const volta = modelFromCanonicalPayload(payload);
    expect(canonicalPayload(volta)).toBe(canonicalPayload(r));
    expect(volta.rodapes.filter((x) => x.spaceUid).length).toBe(5);
    expect(comprimentoDoRodape(volta.rodapes.find((x) => x.itemCode === 'ROD-MDF')!)).toBe(2000);
  });
});
