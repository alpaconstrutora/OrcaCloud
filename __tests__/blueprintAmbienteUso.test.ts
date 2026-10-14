/**
 * O USO do ambiente no kernel (14/10/2026, 0.102.0) — plano
 * `docs/planos/2026-10-14-ambiente-uso-disciplinas.md`, F2.
 *
 * *"parece que o ambiente ficou misturado com eletrica. Ambiente nao esta
 * vinculado a apenas eletrica, mas tambem hidraulica, climatizazacao etc."* —
 * o único "tipo" do ambiente era o balde da NBR 5410; agora o uso é a fonte e o
 * tipo é derivado dele.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  assertModelInvariants,
  canonicalPayload,
  emptyModel,
  KernelError,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  snapshotHash,
  TIPO_NBR5410_DO_USO,
  USOS_DO_AMBIENTE,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { FICHA_DO_USO, USOS_DO_AMBIENTE as USOS_DO_PROGRAMA, usoDoAmbiente } from '../utils/blueprintPrograma';
import { HIPOTESES_CLIMATIZACAO_PADRAO } from '../utils/blueprintClimatizacao';
import { cargaTermicaDoEstudo } from '../utils/blueprintCargaTermica';
import { sugerirDepartamento, sugestoesDeDepartamento } from '../utils/blueprintDepartamentos';

/** Um cômodo de 4 × 3 m, com o nome dado. */
function comodo(nome = 'Ambiente 1'): BlueprintModel {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  const m = applyBatch(a, [w(0, 0, 4000, 0), w(4000, 0, 4000, 3000), w(4000, 3000, 0, 3000), w(0, 3000, 0, 0)]).model;
  return applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: nome }).model;
}
const etiqueta = (m: BlueprintModel) => m.labels[0];

describe('a ponte uso → tipo NBR 5410', () => {
  it('é uma só: o Programa reexporta o vocabulário do kernel e a ficha usa a mesma ponte', () => {
    expect(USOS_DO_PROGRAMA).toBe(USOS_DO_AMBIENTE);
    for (const u of USOS_DO_AMBIENTE) expect(FICHA_DO_USO[u].tipoNbr5410).toBe(TIPO_NBR5410_DO_USO[u]);
    expect(TIPO_NBR5410_DO_USO.LAVABO).toBe('BANHEIRO');
    expect(TIPO_NBR5410_DO_USO.AREA_DE_SERVICO).toBe('COZINHA_SERVICO');
    expect(TIPO_NBR5410_DO_USO.DORMITORIO).toBe('SALA_DORMITORIO');
  });
});

describe('comandos que classificam', () => {
  it('NameSpace com uso grava o uso e DERIVA o tipo', () => {
    const m = comodo();
    const r = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Lavabo', uso: 'LAVABO' }).model;
    expect(etiqueta(r)).toMatchObject({ name: 'Lavabo', uso: 'LAVABO', tipoDeAmbiente: 'BANHEIRO' });
  });

  it('renomear (sem uso nem tipo) não reclassifica', () => {
    const m = comodo();
    const a = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Dorm', uso: 'DORMITORIO' }).model;
    const b = applyCommand(a, { type: 'NameSpace', spaceId: a.spaces[0].id, name: 'Dormitório 1' }).model;
    expect(etiqueta(b)).toMatchObject({ name: 'Dormitório 1', uso: 'DORMITORIO', tipoDeAmbiente: 'SALA_DORMITORIO' });
  });

  it('SetSpaceLabelProps com só o tipo: mantém o uso que ainda bate; derruba o que não bate', () => {
    const m = comodo();
    const a = applyCommand(m, { type: 'SetSpaceLabelProps', labelId: etiqueta(m).id, uso: 'SUITE' }).model;
    const mesmo = applyCommand(a, { type: 'SetSpaceLabelProps', labelId: etiqueta(a).id, tipoDeAmbiente: 'SALA_DORMITORIO' }).model;
    expect(etiqueta(mesmo).uso).toBe('SUITE');
    const outro = applyCommand(a, { type: 'SetSpaceLabelProps', labelId: etiqueta(a).id, tipoDeAmbiente: 'BANHEIRO' }).model;
    expect(etiqueta(outro).tipoDeAmbiente).toBe('BANHEIRO');
    expect('uso' in etiqueta(outro)).toBe(false);
  });

  it('uso null volta a "a classificar" — o tipo cai junto', () => {
    const m = comodo();
    const a = applyCommand(m, { type: 'SetSpaceLabelProps', labelId: etiqueta(m).id, uso: 'COZINHA' }).model;
    const b = applyCommand(a, { type: 'SetSpaceLabelProps', labelId: etiqueta(a).id, uso: null }).model;
    expect(etiqueta(b).tipoDeAmbiente).toBeNull();
    expect('uso' in etiqueta(b)).toBe(false);
  });

  it('uso e tipo que se contradizem no mesmo comando: recusado', () => {
    const m = comodo();
    expect(() => applyCommand(m, { type: 'SetSpaceLabelProps', labelId: etiqueta(m).id, uso: 'LAVABO', tipoDeAmbiente: 'VARANDA' })).toThrow(KernelError);
    // Os dois de acordo: aceito.
    const ok = applyCommand(m, { type: 'SetSpaceLabelProps', labelId: etiqueta(m).id, uso: 'LAVABO', tipoDeAmbiente: 'BANHEIRO' }).model;
    expect(etiqueta(ok).uso).toBe('LAVABO');
  });

  it('PlaceSpaceLabels leva o uso (é o lote do gerador)', () => {
    const m = comodo();
    const semEtiqueta = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: '' }).model;
    const r = applyCommand(semEtiqueta, { type: 'PlaceSpaceLabels', labels: [{ levelId: m.levels[0].id, at: point(2000, 1500), name: 'Serviço', uso: 'AREA_DE_SERVICO' }] }).model;
    expect(etiqueta(r)).toMatchObject({ name: 'Serviço', uso: 'AREA_DE_SERVICO', tipoDeAmbiente: 'COZINHA_SERVICO' });
  });
});

describe('invariante e canônico', () => {
  it('a invariante recusa uso fora da lista e tipo que não é o do uso', () => {
    const m = applyCommand(comodo(), { type: 'NameSpace', spaceId: comodo().spaces[0].id, name: 'Sala', uso: 'SALA' }).model;
    expect(() => assertModelInvariants(m)).not.toThrow();
    expect(() => assertModelInvariants({ ...m, labels: [{ ...etiqueta(m), tipoDeAmbiente: 'BANHEIRO' }] })).toThrow(/conta como SALA_DORMITORIO/);
    expect(() => assertModelInvariants({ ...m, labels: [{ ...etiqueta(m), uso: 'COPA' as never }] })).toThrow(/Uso de ambiente inválido/);
  });

  it('o uso vai e volta pelo canônico; sem uso, a chave nem aparece (hash do desenho antigo intacto)', () => {
    const m = comodo();
    const comTipo = applyCommand(m, { type: 'SetSpaceLabelProps', labelId: etiqueta(m).id, tipoDeAmbiente: 'SALA_DORMITORIO' }).model;
    expect(canonicalPayload(comTipo)).not.toContain('"uso"');
    const comUso = applyCommand(m, { type: 'SetSpaceLabelProps', labelId: etiqueta(m).id, uso: 'ESCRITORIO' }).model;
    expect(canonicalPayload(comUso)).toContain('"uso":"ESCRITORIO"');
    // Mesmo tipo da norma, uso diferente: hashes diferentes (o uso é dado do desenho).
    expect(snapshotHash(comUso)).not.toBe(snapshotHash(comTipo));
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(comUso)));
    expect(volta.labels[0]).toMatchObject({ uso: 'ESCRITORIO', tipoDeAmbiente: 'SALA_DORMITORIO' });
  });
});

describe('as disciplinas leem o uso declarado', () => {
  it('climatização: o declarado vence o nome e o tipo', () => {
    expect(usoDoAmbiente('Cozinha', 'COZINHA_SERVICO', 'DORMITORIO')).toBe('DORMITORIO');
    expect(usoDoAmbiente('Ambiente 1', 'SALA_DORMITORIO', null)).toBe('SALA');
    // "Ambiente 1" declarado como dormitório: climatizado (o padrão do uso), sem depender do nome.
    const m = comodo();
    const dorm = applyCommand(m, { type: 'SetSpaceLabelProps', labelId: etiqueta(m).id, uso: 'DORMITORIO' }).model;
    const ambientes = cargaTermicaDoEstudo(dorm, HIPOTESES_CLIMATIZACAO_PADRAO, {}).flatMap((n) => n.ambientes);
    expect(ambientes.find((a) => a.nome === 'Ambiente 1')?.climatizado).toBe(true);
    // E o banheiro declarado não é climatizado, mesmo com nome neutro.
    const banho = applyCommand(m, { type: 'SetSpaceLabelProps', labelId: etiqueta(m).id, uso: 'BANHEIRO' }).model;
    expect(cargaTermicaDoEstudo(banho, HIPOTESES_CLIMATIZACAO_PADRAO, {}).flatMap((n) => n.ambientes).find((a) => a.nome === 'Ambiente 1')?.climatizado).toBe(false);
  });

  it('departamento: o uso declarado vence o nome', () => {
    expect(sugerirDepartamento('Sala de jogos', 'SALA_DORMITORIO', 'GARAGEM')).toBe('Serviço');
    expect(sugerirDepartamento('Ambiente 1', null, 'CIRCULACAO')).toBe('Circulação');
    // OUTRO não diz nada: cai no nome.
    expect(sugerirDepartamento('Hall', 'OUTRO', 'OUTRO')).toBe('Circulação');
    const m = comodo();
    const lavabo = applyCommand(m, { type: 'SetSpaceLabelProps', labelId: etiqueta(m).id, uso: 'LAVABO' }).model;
    expect(sugestoesDeDepartamento(lavabo, m.levels[0].id).map((s) => s.departamento)).toEqual(['Íntimo']);
  });
});
