/**
 * A VISTA DA TORRE (PE7a, `utils/predioAutomatico/vistaDaTorre.ts`) com o que NÃO tem pavimento — achados da revisão do
 * PR #587 (18/11/2026):
 *  - a unidade da outra torre: a vista a tirava, e o segundo prédio (sem Empreendimento, os números do produto) recriava
 *    o "101" dela — a junção acusava número repetido e o caminho lento quebrava;
 *  - a restrição do usuário numa peça da outra torre: ficava na vista apontando para a peça que saiu, e o primeiro
 *    comando da torre gerada era recusado ("alvo inexistente").
 */
import { describe, expect, it } from 'vitest';
import { aplicarLote, applyBatch, assertModelInvariants, emptyModel, type Command } from '../utils/blueprintKernel';
import { juntarComOsPavimentos, semOsPavimentos } from '../utils/predioAutomatico/vistaDaTorre';

function desenho() {
  let m = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Lote', elevationMm: 0, defaultHeightMm: 3000 },
    { type: 'AddLevel', name: 'Torre A · tipo', elevationMm: 3000, defaultHeightMm: 3000 },
  ] as Command[]).model;
  const [lote, a] = m.levels.map((l) => l.id);
  m = applyBatch(m, [
    { type: 'AddWall', levelId: a, a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thicknessMm: 150, heightMm: 3000 },
    { type: 'AddWall', levelId: a, a: { x: 4000, y: 0 }, b: { x: 4000, y: 4000 }, thicknessMm: 150, heightMm: 3000 },
    { type: 'AddWall', levelId: a, a: { x: 4000, y: 4000 }, b: { x: 0, y: 4000 }, thicknessMm: 150, heightMm: 3000 },
    { type: 'AddWall', levelId: a, a: { x: 0, y: 4000 }, b: { x: 0, y: 0 }, thicknessMm: 150, heightMm: 3000 },
  ] as Command[]).model;
  const sala = m.spaces.find((s) => s.levelId === a)!;
  m = applyBatch(m, [{ type: 'NameSpace', spaceId: sala.id, name: 'Sala' } as Command]).model;
  const etiqueta = m.labels.find((l) => l.levelId === a)!;
  m = applyBatch(m, [
    { type: 'AddUnidade', numero: '101', labelIds: [etiqueta.id] } as Command,
    { type: 'AddRestricao', tipo: 'TRAVA_COMPRIMENTO', alvo: { familia: 'wall', id: m.walls[0].id }, valorMm: 4000 } as Command,
  ]).model;
  return { m, lote, deFora: new Set([a]) };
}

describe('vista da torre — o que não tem pavimento', () => {
  it('a unidade da outra torre fica na vista sem etiquetas (o número reservado) e volta inteira na junção', () => {
    const { m, lote, deFora } = desenho();
    const v = semOsPavimentos(m, deFora);
    expect((v.unidades ?? []).map((u) => u.numero)).toEqual(['101']);
    expect(v.unidades![0].etiquetaUids).toEqual([]);
    // A unidade do desenho não foi tocada (a vista trabalha em cópias).
    expect(m.unidades![0].etiquetaUids.length).toBe(1);
    // Na vista, a torre gerada não pode criar outro "101".
    expect(() => aplicarLote(v, [{ type: 'AddUnidade', numero: '101' } as Command])).toThrow(/101/);
    const r = aplicarLote(v, [{ type: 'AddLevel', name: 'Torre B · tipo', elevationMm: 3000, defaultHeightMm: 3000 } as Command, { type: 'AddUnidade', numero: '201' } as Command]);
    const junto = juntarComOsPavimentos(r.model, m, deFora);
    expect(() => assertModelInvariants(junto)).not.toThrow();
    expect((junto.unidades ?? []).map((u) => u.numero).sort()).toEqual(['101', '201']);
    expect(junto.unidades!.find((u) => u.numero === '101')!.etiquetaUids.length).toBe(1);
    expect(lote).toBeTruthy();
  });

  it('a restrição numa peça da outra torre sai da vista (a vista aceita comandos) e volta na junção', () => {
    const { m, lote, deFora } = desenho();
    const v = semOsPavimentos(m, deFora);
    expect(v.restricoes ?? []).toEqual([]);
    const r = aplicarLote(v, [{ type: 'AddWall', levelId: lote, a: { x: 9000, y: 0 }, b: { x: 12000, y: 0 }, thicknessMm: 150, heightMm: 3000 } as Command]);
    const junto = juntarComOsPavimentos(r.model, m, deFora);
    expect(() => assertModelInvariants(junto)).not.toThrow();
    expect((junto.restricoes ?? []).length).toBe(1);
  });
});
