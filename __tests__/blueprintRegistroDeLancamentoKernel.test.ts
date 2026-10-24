/**
 * REGISTRO DO LANÇAMENTO (kernel 0.105.0, F1 do plano `2026-10-24-relancar-quando-escolha-muda.md`): com que
 * ESCOLHAS cada motor de lançamento (eletrodutos, água, esgoto, pluvial, circuitos automáticos) lançou a rede.
 *
 * Pedido: *"quando o usuário faz uma allteracao em preferencias, porem exemplo alterar o tipo de lançamento de
 * eletroduto para Sem caixas de passagem, o motor de lançar Eletrodutos por circuito deve ficar disponivel para
 * relançar e incluir essa nova preferencia. Isto deve valer para qualquer alteracao de preferencia"*.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  KERNEL_VERSION,
  ModelHistory,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  payloadDoHash,
  point,
  type BlueprintModel,
} from '../utils/blueprintKernel';

function comQuadro(): { model: BlueprintModel; t: string; q: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QD1', at: point(1000, 1000) }).model;
  return { model: m, t, q: m.quadros[0].id };
}
const esperaCodigo = (fn: () => unknown, codigo: string) => {
  try {
    fn();
  } catch (e) {
    expect((e as { code?: string }).code).toBe(codigo);
    return;
  }
  throw new Error(`esperava ${codigo}, e nada foi lançado`);
};

describe('registro do lançamento · versão', () => {
  it('kernel 0.105.0', () => {
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.105.0');
  });
});

describe('registro do lançamento · o comando', () => {
  it('RegistrarLancamento cria o registro (sem id, sem diff de elemento)', () => {
    const { model, q } = comQuadro();
    const r = applyCommand(model, { type: 'RegistrarLancamento', motor: 'ELETRODUTOS', alvoId: q, escolhas: { caixasDePassagem: true, bitolaMm: 25 } });
    expect(r.model.registrosDeLancamento).toEqual([{ motor: 'ELETRODUTOS', alvoId: q, escolhas: { caixasDePassagem: true, bitolaMm: 25 } }]);
    expect(r.diff).toEqual({ created: [], updated: [], deleted: [], ancestry: {} });
    // O modelo de entrada não foi tocado.
    expect(model.registrosDeLancamento ?? []).toEqual([]);
  });

  it('upsert por (motor, alvo): atualiza sem duplicar e SUBSTITUI as escolhas inteiras', () => {
    const { model, t, q } = comQuadro();
    const m = applyBatch(model, [
      { type: 'RegistrarLancamento', motor: 'ELETRODUTOS', alvoId: q, escolhas: { caixasDePassagem: true, bitolaMm: 25 } },
      { type: 'RegistrarLancamento', motor: 'AGUA', alvoId: t, escolhas: { material: 'PVC' } },
      { type: 'RegistrarLancamento', motor: 'CIRCUITOS', alvoId: null, escolhas: { tug: 8 } },
      { type: 'RegistrarLancamento', motor: 'ELETRODUTOS', alvoId: q, escolhas: { caixasDePassagem: false } },
    ]).model;
    expect(m.registrosDeLancamento).toHaveLength(3);
    expect(m.registrosDeLancamento!.find((r) => r.motor === 'ELETRODUTOS')!.escolhas).toEqual({ caixasDePassagem: false });
  });

  it('o mesmo alvo em motores diferentes são registros diferentes', () => {
    const { model, t } = comQuadro();
    const m = applyBatch(model, [
      { type: 'RegistrarLancamento', motor: 'AGUA', alvoId: t, escolhas: { a: 1 } },
      { type: 'RegistrarLancamento', motor: 'ESGOTO', alvoId: t, escolhas: { a: 2 } },
    ]).model;
    expect(m.registrosDeLancamento!.map((r) => r.motor)).toEqual(['AGUA', 'ESGOTO']);
  });

  it('recusa alvo que não é quadro nem pavimento, motor desconhecido e número não finito', () => {
    const { model } = comQuadro();
    esperaCodigo(() => applyCommand(model, { type: 'RegistrarLancamento', motor: 'ELETRODUTOS', alvoId: 'qdr_9999', escolhas: {} }), 'BAD_REGISTRO');
    esperaCodigo(() => applyCommand(model, { type: 'RegistrarLancamento', motor: 'XPTO' as never, alvoId: null, escolhas: {} }), 'BAD_REGISTRO');
    esperaCodigo(() => applyCommand(model, { type: 'RegistrarLancamento', motor: 'AGUA', alvoId: null, escolhas: { x: Number.NaN } }), 'BAD_REGISTRO');
  });

  it('ApagarRegistroDeLancamento tira o registro; ausente não é erro', () => {
    const { model, q } = comQuadro();
    const m1 = applyCommand(model, { type: 'RegistrarLancamento', motor: 'ELETRODUTOS', alvoId: q, escolhas: { caixasDePassagem: true } }).model;
    const m2 = applyCommand(m1, { type: 'ApagarRegistroDeLancamento', motor: 'ELETRODUTOS', alvoId: q }).model;
    expect(m2.registrosDeLancamento).toEqual([]);
    expect(applyCommand(m2, { type: 'ApagarRegistroDeLancamento', motor: 'AGUA', alvoId: null }).model.registrosDeLancamento).toEqual([]);
  });
});

describe('registro do lançamento · o desfazer (Ctrl+Z)', () => {
  it('o lote que registra volta inteiro: ausente → registro → ausente; e a atualização volta à anterior', () => {
    const { model, q } = comQuadro();
    const h = new ModelHistory(model);
    h.applyMany([{ type: 'RegistrarLancamento', motor: 'ELETRODUTOS', alvoId: q, escolhas: { caixasDePassagem: true } }]);
    expect(h.current.registrosDeLancamento).toHaveLength(1);
    h.applyMany([{ type: 'RegistrarLancamento', motor: 'ELETRODUTOS', alvoId: q, escolhas: { caixasDePassagem: false } }]);
    expect(h.current.registrosDeLancamento![0].escolhas).toEqual({ caixasDePassagem: false });
    h.undo();
    expect(h.current.registrosDeLancamento![0].escolhas).toEqual({ caixasDePassagem: true });
    h.undo();
    expect(h.current.registrosDeLancamento ?? []).toEqual([]);
    h.redo();
    expect(h.current.registrosDeLancamento![0].escolhas).toEqual({ caixasDePassagem: true });
  });
});

describe('registro do lançamento · o canônico', () => {
  it('planta sem registro não ganha a chave (o hash do acervo só muda pela versão)', () => {
    const { model, q } = comQuadro();
    expect(payloadDoHash(model)).not.toContain('registrosDeLancamento');
    expect(canonicalPayload(model)).not.toContain('registrosDeLancamento');
    // Registrar e apagar devolve exatamente o payload de antes.
    const ida = applyCommand(model, { type: 'RegistrarLancamento', motor: 'ELETRODUTOS', alvoId: q, escolhas: { caixasDePassagem: true } }).model;
    expect(payloadDoHash(ida)).not.toBe(payloadDoHash(model));
    const volta = applyCommand(ida, { type: 'ApagarRegistroDeLancamento', motor: 'ELETRODUTOS', alvoId: q }).model;
    expect(payloadDoHash(volta)).toBe(payloadDoHash(model));
  });

  it('ida e volta: o alvo vai por ÍNDICE (quadro, pavimento) e volta para o id novo; o hash é o mesmo', () => {
    const { model, t, q } = comQuadro();
    const m = applyBatch(model, [
      { type: 'RegistrarLancamento', motor: 'ELETRODUTOS', alvoId: q, escolhas: { caixasDePassagem: false, bitolaMm: 25, encaminhamento: 'TETO', obs: null } },
      { type: 'RegistrarLancamento', motor: 'AGUA', alvoId: t, escolhas: { material: 'PVC' } },
      { type: 'RegistrarLancamento', motor: 'CIRCUITOS', alvoId: null, escolhas: { tug: 8 } },
    ]).model;
    const texto = canonicalPayload(m);
    expect(texto).not.toContain(q); // o id da sessão não vai para o payload
    const devolta = modelFromCanonicalPayload(parseCanonicalPayload(texto));
    expect(payloadDoHash(devolta)).toBe(payloadDoHash(m));
    const porMotor = Object.fromEntries(devolta.registrosDeLancamento!.map((r) => [r.motor, r]));
    expect(porMotor.ELETRODUTOS).toEqual({ motor: 'ELETRODUTOS', alvoId: devolta.quadros[0].id, escolhas: { caixasDePassagem: false, bitolaMm: 25, encaminhamento: 'TETO', obs: null } });
    expect(porMotor.AGUA).toEqual({ motor: 'AGUA', alvoId: devolta.levels[0].id, escolhas: { material: 'PVC' } });
    expect(porMotor.CIRCUITOS).toEqual({ motor: 'CIRCUITOS', alvoId: null, escolhas: { tug: 8 } });
  });

  it('a ordem é estável: a ordem dos comandos não muda o hash', () => {
    const { model, t, q } = comQuadro();
    const a = applyBatch(model, [
      { type: 'RegistrarLancamento', motor: 'ELETRODUTOS', alvoId: q, escolhas: { x: 1, y: 'b' } },
      { type: 'RegistrarLancamento', motor: 'AGUA', alvoId: t, escolhas: { m: 'PVC' } },
      { type: 'RegistrarLancamento', motor: 'CIRCUITOS', alvoId: null, escolhas: {} },
    ]).model;
    const b = applyBatch(model, [
      { type: 'RegistrarLancamento', motor: 'CIRCUITOS', alvoId: null, escolhas: {} },
      { type: 'RegistrarLancamento', motor: 'AGUA', alvoId: t, escolhas: { m: 'PVC' } },
      { type: 'RegistrarLancamento', motor: 'ELETRODUTOS', alvoId: q, escolhas: { y: 'b', x: 1 } },
    ]).model;
    expect(payloadDoHash(a)).toBe(payloadDoHash(b));
  });

  it('registro de quadro apagado não vai para o payload (órfão)', () => {
    const { model, q } = comQuadro();
    const m1 = applyCommand(model, { type: 'RegistrarLancamento', motor: 'ELETRODUTOS', alvoId: q, escolhas: { a: true } }).model;
    const m2 = applyCommand(m1, { type: 'DeleteQuadro', quadroId: q }).model;
    expect(payloadDoHash(m2)).not.toContain('registrosDeLancamento');
  });
});
