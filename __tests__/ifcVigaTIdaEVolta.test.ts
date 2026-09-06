import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { gerarIfc } from '../utils/blueprintIfc';

/**
 * IDA E VOLTA da viga T pelo IFC, com o parser de TERCEIROS no meio.
 *
 * Escrever um perfil e ler o próprio perfil de volta não prova quase nada. O
 * que este caso prova é que o arquivo que geramos é lido pelo `web-ifc` — o
 * mesmo que lê os modelos do calculista — e que a seção volta com as MESMAS
 * quatro medidas. Se o placement do perfil estivesse girado, ou a extrusão na
 * direção errada, a seção voltaria deitada ou com largura e altura trocadas.
 */
describe('ifc · ida e volta da viga T', () => {
  it('o web-ifc relê a viga, e a seção volta idêntica', async () => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 });
    const m = applyBatch(base.model, [{
      type: 'AddStructural', levelId: base.model.levels[0].id, kind: 'VIGA',
      pontos: [point(0, 0), point(6000, 0)], larguraMm: 990, profundidadeMm: 990,
      alturaMm: 700, baseMm: 2000, secaoT: { mesaAlturaMm: 120, almaLarguraMm: 190 },
    } as Command]).model;
    const ifc = gerarIfc(m, { titulo: 'T', revisao: 1, hash: 'h', data: new Date('2026-09-06T12:00:00Z') });
    const arq = join(tmpdir(), `vigaT-${Date.now()}.ifc`);
    writeFileSync(arq, ifc);

    const { obterApi, usarCaminhoDoWasm } = await import('../services/ifcViewerService');
    const { lerPecasParametricas } = await import('../services/ifcParametricoService');
    const { traduzirPecas } = await import('../utils/ifcParaKernel');
    usarCaminhoDoWasm('');
    const api = await obterApi();
    const { readFileSync } = await import('node:fs');
    const id = api.OpenModel(new Uint8Array(readFileSync(arq)));
    const leitura = await lerPecasParametricas(id);
    const trad = traduzirPecas(leitura.pecas);
    expect(leitura.recusas, 'o arquivo que geramos foi recusado na leitura').toHaveLength(0);
    expect(trad.recusas).toHaveLength(0);
    expect(trad.pecas).toHaveLength(1);

    const [viga] = trad.pecas;
    expect(viga.kind).toBe('VIGA');
    // As quatro medidas, de volta pelo caminho inteiro.
    expect(viga.larguraMm).toBe(990);
    expect(viga.alturaMm).toBe(700);
    expect(viga.secaoT).toEqual({ mesaAlturaMm: 120, almaLarguraMm: 190 });
    api.CloseModel(id);
  }, 120000);
});
