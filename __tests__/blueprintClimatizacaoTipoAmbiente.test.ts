/**
 * 11/10/2026 (teste do usuário no app real, estudo "Planta 26/09/2026"): o
 * ambiente "Ambiente 1" com o TIPO "Sala/Dormitório" (o seletor da elétrica)
 * era tratado pela climatização como "outro, não climatizado" — ela só lia o
 * nome — e o gerador parava em "Nenhum ambiente climatizado". Agora o tipo de
 * ambiente da etiqueta vale como uso quando o nome não diz.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command, type TipoDeAmbiente } from '../utils/blueprintKernel';
import { HIPOTESES_CLIMATIZACAO_PADRAO } from '../utils/blueprintClimatizacao';
import { cargaTermicaDoEstudo } from '../utils/blueprintCargaTermica';
import { HIPOTESES_DO_AMBIENTE_VAZIAS, premissasDoAmbiente } from '../utils/blueprintClimatizacaoAmbientes';
import { USO_DO_TIPO_DE_AMBIENTE, usoDoAmbiente } from '../utils/blueprintPrograma';

/** A sala do estudo do usuário: 8,45 × 4,25 m, quatro paredes, o nome automático e o tipo escolhido. */
function sala(tipo: TipoDeAmbiente | null, nome = 'Ambiente 1') {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  const m = applyBatch(a, [w(3400, 1400, 12000, 1400), w(12000, 1400, 12000, 5800), w(12000, 5800, 3400, 5800), w(3400, 5800, 3400, 1400)]).model;
  return applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: nome, tipoDeAmbiente: tipo }).model;
}
const climatizados = (m: ReturnType<typeof sala>) => cargaTermicaDoEstudo(m, HIPOTESES_CLIMATIZACAO_PADRAO, {}).flatMap((n) => n.ambientes.filter((x) => x.climatizado).map((x) => x.nome));

describe('o tipo de ambiente vale como uso quando o nome não diz', () => {
  it('a tabela e a ordem: o nome vence; sem uso no nome, o tipo; "Outro" não diz nada', () => {
    expect(USO_DO_TIPO_DE_AMBIENTE).toEqual({ SALA_DORMITORIO: 'SALA', COZINHA_SERVICO: 'COZINHA', BANHEIRO: 'BANHEIRO', VARANDA: 'VARANDA', OUTRO: null });
    expect(usoDoAmbiente('Ambiente 1', 'SALA_DORMITORIO')).toBe('SALA');
    expect(usoDoAmbiente('Cozinha', 'SALA_DORMITORIO')).toBe('COZINHA');
    expect(usoDoAmbiente('Ambiente 1', 'OUTRO')).toBeNull();
    expect(usoDoAmbiente('Ambiente 1', null)).toBeNull();
  });

  it('o caso do usuário: "Ambiente 1" com tipo Sala/Dormitório é climatizado, e a carga dele roda', () => {
    expect(climatizados(sala('SALA_DORMITORIO'))).toEqual(['Ambiente 1']);
    // Controle: sem o tipo, o nome sozinho não diz — segue não climatizado (o comportamento de antes).
    expect(climatizados(sala(null))).toEqual([]);
    // Cozinha pelo tipo não é climatizada por padrão.
    expect(climatizados(sala('COZINHA_SERVICO'))).toEqual([]);
  });

  it('a premissa diz de onde veio: o uso pelo tipo aparece como "padrão do uso" e a declaração vence', () => {
    const ctx = { nome: 'Ambiente 1', areaPisoM2: 36, peDireitoMm: 2800, temperaturaDoEstudoC: 24, tipoDeAmbiente: 'SALA_DORMITORIO' as const };
    const p = premissasDoAmbiente(undefined, ctx);
    expect(p.uso).toBe('SALA');
    expect(p.climatizado).toEqual({ valor: true, origem: 'USO' });
    expect(premissasDoAmbiente({ ...HIPOTESES_DO_AMBIENTE_VAZIAS, climatizado: false }, ctx).climatizado.valor).toBe(false);
  });
});
