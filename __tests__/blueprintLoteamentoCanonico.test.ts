/**
 * LOTEAMENTO (B1) — o payload canônico: ida e volta, omissão quando vazio, e a
 * quadra do lote por ÍNDICE.
 *
 * O ponto que este arquivo existe para travar: id é reatribuído ao recarregar
 * o payload (`modelFromCanonicalPayload`), então gravar a quadra do lote por id
 * perderia o vínculo em silêncio — o lote voltaria solto, e o memorial sairia
 * sem quadra. Por isso o canônico grava o índice.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  KERNEL_VERSION,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  snapshotHash,
  type BlueprintModel,
} from '../utils/blueprintKernel';

function base(): BlueprintModel {
  return applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
}

function comLoteamento(): BlueprintModel {
  const m = base();
  const nivel = m.levels[0].id;
  const comQuadra = applyBatch(m, [
    { type: 'AddQuadra', levelId: nivel, nome: 'A', pontos: [{ x: 0, y: 0 }, { x: 60000, y: 0 }, { x: 60000, y: 30000 }, { x: 0, y: 30000 }] },
    { type: 'AddQuadra', levelId: nivel, nome: 'B', pontos: [{ x: 80000, y: 0 }, { x: 140000, y: 0 }, { x: 140000, y: 30000 }, { x: 80000, y: 30000 }] },
    { type: 'AddVia', levelId: nivel, nome: 'Rua 1', eixo: [{ x: -10000, y: -6000 }, { x: 150000, y: -6000 }], larguraMm: 12000, calcadaMm: 2000 },
    { type: 'AddAreaPublica', levelId: nivel, tipo: 'VERDE', nome: 'Praça', pontos: [{ x: 160000, y: 0 }, { x: 180000, y: 0 }, { x: 180000, y: 20000 }] },
  ]).model;
  const quadraB = comQuadra.quadras.find((q) => q.nome === 'B');
  return applyBatch(comQuadra, [
    { type: 'AddLote', levelId: nivel, quadraId: comQuadra.quadras[0].id, numero: '1', pontos: [{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 30000 }, { x: 0, y: 30000 }], testadaIndex: 0 },
    { type: 'AddLote', levelId: nivel, quadraId: quadraB?.id ?? null, numero: '1', pontos: [{ x: 80000, y: 0 }, { x: 92000, y: 0 }, { x: 92000, y: 30000 }, { x: 80000, y: 30000 }] },
  ]).model;
}

describe('payload canônico do loteamento', () => {
  it('desenho SEM loteamento não ganha chave nenhuma', () => {
    const payload = parseCanonicalPayload(canonicalPayload(base()));
    expect(payload.quadras).toBeUndefined();
    expect(payload.lotes).toBeUndefined();
    expect(payload.vias).toBeUndefined();
    expect(payload.areasPublicas).toBeUndefined();
    expect(payload.kernelVersion ?? KERNEL_VERSION).toBe(KERNEL_VERSION);
  });

  it('ida e volta preserva quadra, lote, via e área pública', () => {
    const m = comLoteamento();
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));

    expect(volta.quadras.map((q) => q.nome).sort()).toEqual(['A', 'B']);
    expect(volta.vias).toHaveLength(1);
    expect(volta.vias[0]).toMatchObject({ nome: 'Rua 1', larguraMm: 12000, calcadaMm: 2000 });
    expect(volta.vias[0].eixo).toHaveLength(2);
    expect(volta.areasPublicas).toHaveLength(1);
    expect(volta.areasPublicas[0]).toMatchObject({ tipo: 'VERDE', nome: 'Praça' });
    expect(volta.lotes).toHaveLength(2);
    expect(volta.lotes.every((l) => l.pontos.length === 4)).toBe(true);
  });

  it('cada lote volta para a SUA quadra — o vínculo vai por índice, não por id', () => {
    // A quadra B é criada ANTES da A, mas a ordem canônica é por posição: o
    // canônico devolve [A, B]. Então `qdr_0001` na volta é a quadra A, e na ida
    // era a B — gravar o vínculo pelo id cru trocaria os lotes de quadra sem
    // erro nenhum, que é o defeito que este teste existe para impedir.
    const m0 = base();
    const nivel = m0.levels[0].id;
    const comQuadras = applyBatch(m0, [
      { type: 'AddQuadra', levelId: nivel, nome: 'B', pontos: [{ x: 80000, y: 0 }, { x: 140000, y: 0 }, { x: 140000, y: 30000 }, { x: 80000, y: 30000 }] },
      { type: 'AddQuadra', levelId: nivel, nome: 'A', pontos: [{ x: 0, y: 0 }, { x: 60000, y: 0 }, { x: 60000, y: 30000 }, { x: 0, y: 30000 }] },
    ]).model;
    const idDeB = comQuadras.quadras.find((q) => q.nome === 'B')?.id ?? null;
    const idDeA = comQuadras.quadras.find((q) => q.nome === 'A')?.id ?? null;
    expect(idDeB).toBe('qdr_0001'); // criada primeiro
    const m = applyBatch(comQuadras, [
      { type: 'AddLote', levelId: nivel, quadraId: idDeA, numero: '1', pontos: [{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 30000 }, { x: 0, y: 30000 }] },
      { type: 'AddLote', levelId: nivel, quadraId: idDeB, numero: '1', pontos: [{ x: 80000, y: 0 }, { x: 92000, y: 0 }, { x: 92000, y: 30000 }, { x: 80000, y: 30000 }] },
    ]).model;

    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    // Na volta, `qdr_0001` é a quadra A — o id trocou de dono.
    expect(volta.quadras.find((q) => q.id === 'qdr_0001')?.nome).toBe('A');

    for (const lote of volta.lotes) {
      const quadra = volta.quadras.find((q) => q.id === lote.quadraId);
      expect(quadra).toBeDefined();
      // O lote 1 da quadra A começa em x=0; o da B, em x=80000.
      const esperado = lote.pontos[0].x === 0 ? 'A' : 'B';
      expect(quadra?.nome).toBe(esperado);
    }
  });

  it('a testada declarada sobrevive à ida e volta', () => {
    const m = comLoteamento();
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    const comTestada = volta.lotes.find((l) => l.testadaIndex != null);
    expect(comTestada?.testadaIndex).toBe(0);
    expect(volta.lotes.filter((l) => l.testadaIndex == null)).toHaveLength(1);
  });

  it('o hash muda quando o loteamento muda, e não muda ao recalcular', () => {
    const semLoteamento = base();
    const com = comLoteamento();
    expect(snapshotHash(com)).not.toBe(snapshotHash(semLoteamento));
    expect(snapshotHash(com)).toBe(snapshotHash(com));

    const renomeada = applyBatch(com, [{ type: 'SetQuadraProps', quadraId: com.quadras[0].id, nome: 'C' }]).model;
    expect(snapshotHash(renomeada)).not.toBe(snapshotHash(com));
  });

  it('o payload não guarda id nenhum das famílias novas', () => {
    const texto = canonicalPayload(comLoteamento());
    expect(texto).not.toMatch(/qdr_/);
    expect(texto).not.toMatch(/lot_/);
    expect(texto).not.toMatch(/via_/);
    expect(texto).not.toMatch(/apb_/);
  });
});
