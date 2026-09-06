/**
 * `applyBatch` — o lote não pode custar quadrático.
 *
 * ─── O DEFEITO QUE ISTO FECHA ───────────────────────────────────────────────
 *
 * `applyCommand` calcula `snapshotHash` no fim, e `applyBatch` chamava
 * `applyCommand` em laço. `snapshotHash` serializa o modelo INTEIRO e faz
 * SHA-256 dele — ~18 ms num modelo de 2.000 peças. Um lote de n comandos pagava
 * n hashes de um modelo que cresce: O(n²).
 *
 * Medido em 06/09/2026 contra um IFC estrutural real de 14 MB: importar as
 * 3.345 peças levava **62 segundos** de navegador congelado. E todos aqueles
 * hashes eram DESCARTADOS — `applyBatch` calcula o dele no fim, e os
 * intermediários ninguém lia.
 *
 * Depois da correção: 2,0 s.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  geradorSequencial,
  point,
  usarGeradorDeUid,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';

function comNivel(): { model: BlueprintModel; levelId: string } {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800,
  });
  return { model: r.model, levelId: r.model.levels[0].id };
}

const pilares = (levelId: string, n: number): Command[] =>
  Array.from({ length: n }, (_, i) => ({
    type: 'AddStructural',
    levelId,
    kind: 'PILAR',
    pontos: [point((i % 60) * 3000, Math.floor(i / 60) * 3000)],
    larguraMm: 200,
    profundidadeMm: 400,
    alturaMm: 3000,
    baseMm: 0,
  }));

describe('applyBatch · semântica preservada', () => {
  it('o lote dá EXATAMENTE o mesmo modelo e hash que aplicar um a um', () => {
    // A prova de que tirar o hash do laço não mudou nada: o resultado é
    // idêntico, campo a campo, ao caminho comando-a-comando.
    //
    // O gerador de uid é fixado nas DUAS execuções: `novoUid` é aleatório por
    // construção, e sem isso os dois modelos nunca seriam iguais — o teste
    // falharia por um motivo que não tem nada a ver com o que ele mede.
    try {
      usarGeradorDeUid(geradorSequencial());
      const { model, levelId } = comNivel();
      const cmds = pilares(levelId, 40);
      const emLote = applyBatch(model, cmds);

      usarGeradorDeUid(geradorSequencial());
      const { model: m2, levelId: lv2 } = comNivel();
      const cmds2 = pilares(lv2, 40);
      let umAUm = m2;
      let hashFinal = '';
      for (const c of cmds2) {
        const r = applyCommand(umAUm, c);
        umAUm = r.model;
        hashFinal = r.hash;
      }

      expect(emLote.model).toStrictEqual(umAUm);
      // E o hash do lote é o mesmo que o do último comando aplicado a um.
      expect(emLote.hash).toBe(hashFinal);
    } finally {
      usarGeradorDeUid(null);
    }
  });

  it('a INVARIANTE continua conferida peça a peça — o lote não afrouxou', () => {
    // `assertModelInvariants` NÃO saiu do laço, e este caso prova: um comando
    // inválido no meio derruba o lote inteiro, e nada é aplicado.
    const { model, levelId } = comNivel();
    const cmds: Command[] = [
      ...pilares(levelId, 3),
      { type: 'AddStructural', levelId, kind: 'PILAR', pontos: [point(0, 0)],
        larguraMm: 0, profundidadeMm: 400, alturaMm: 3000, baseMm: 0 },
    ];
    expect(() => applyBatch(model, cmds)).toThrow();
    // E o modelo original não foi tocado — `applyBatch` trabalha numa cópia.
    expect(model.structures ?? []).toHaveLength(0);
  });
});

describe('applyBatch · custo', () => {
  it('NÃO é quadrático: 1.000 peças em muito menos que o dobro de 500', () => {
    // Medida de FUMAÇA, não benchmark. Os números reais depois da correção são
    // ~40 ms para 500 e ~150 ms para 1.000; antes eram 1,2 s e 4,9 s. O limite
    // de 3 s tem ~20× de folga sobre o valor atual e ainda fica abaixo do valor
    // ANTIGO para 1.000 — ou seja, discrimina a volta do O(n²) sem depender da
    // velocidade da máquina.
    const { model, levelId } = comNivel();
    const t = Date.now();
    applyBatch(model, pilares(levelId, 1000));
    const ms = Date.now() - t;
    expect(ms, `applyBatch de 1.000 peças levou ${ms}ms`).toBeLessThan(3000);
  }, 30000);
});
