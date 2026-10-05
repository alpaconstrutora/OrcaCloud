/**
 * CLIMATIZAÇÃO E4.1 (04/10/2026): a carga vira equipamento pelo CATÁLOGO —
 * o menor modelo que alcança carga × (1 + folga); o declarado vence e é
 * conferido (atende / sub / super / sem capacidade / sem equipamento).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_CLIMATIZACAO_PADRAO, HIPOTESES_DE_SELECAO_PADRAO, hipotesesClimatizacaoDaColuna, type HipotesesClimatizacao } from '../utils/blueprintClimatizacao';
import { cargaTermicaDoNivel } from '../utils/blueprintCargaTermica';
import { SEMENTES_DE_TIPOS } from '../utils/blueprintCatalogoDeTipos';
import { avaliarCapacidade, conferenciaDeSelecao, modelosDoCatalogo, necessarioBtuH, potenciaEletricaVA, selecaoDoNivel, selecionarModelo } from '../utils/blueprintSelecaoClimatizacao';

const catalogo = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));
const hip = HIPOTESES_DE_SELECAO_PADRAO;

function casa() {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(a, [w(0, 0, 8000, 0), w(8000, 0, 8000, 4000), w(8000, 4000, 0, 4000), w(0, 4000, 0, 0), w(4000, 0, 4000, 4000)]).model;
  const sala = m.spaces.find((s) => s.ring.every((p) => p.x <= 4100))!;
  const coz = m.spaces.find((s) => s.id !== sala.id)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala.id, name: 'Sala' },
    { type: 'NameSpace', spaceId: coz.id, name: 'Cozinha' },
  ]).model;
  return { m, t, sala: m.spaces.find((s) => s.ring.every((p) => p.x <= 4100))! };
}
const hipClima: HipotesesClimatizacao = { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } };

describe('climatização E4.1 · catálogo e seleção', () => {
  it('as sementes dão 8 modelos hi-wall de 9.000 a 60.000, com potência de placa; só tipos ativos de TERMINAL com capacidade entram', () => {
    expect(catalogo.map((m) => m.capacidadeBtuH)).toEqual([9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000]);
    expect(catalogo.every((m) => m.tipoHidraulico === 'EVAPORADORA_HI_WALL' && (m.potenciaVA ?? 0) > 0)).toBe(true);
    const sujo = modelosDoCatalogo([
      { id: 'x', nome: 'Inativo', familia: 'TERMINAL', active: false, propriedades: { tipoHidraulico: 'EVAPORADORA_HI_WALL', capacidadeBtuH: 9000 } },
      { id: 'y', nome: 'Difusor com BTU', familia: 'TERMINAL', active: true, propriedades: { tipoHidraulico: 'DIFUSOR', capacidadeBtuH: 9000 } },
      { id: 'z', nome: 'Pilar', familia: 'ESTRUTURA', active: true, propriedades: { capacidadeBtuH: 9000 } },
      { id: 'ok', nome: 'Cassete 36k', familia: 'TERMINAL', active: true, propriedades: { tipoHidraulico: 'EVAPORADORA_CASSETE', capacidadeBtuH: 36000 } },
    ]);
    expect(sujo.map((m) => m.id)).toEqual(['ok']);
    expect(sujo[0].potenciaVA).toBeNull();
  });

  it('carga de 10.500 BTU/h com folga de 10 % escolhe 12.000 (necessário 11.550); 11.000 pede 12.100 → 18.000', () => {
    expect(necessarioBtuH(10500, 10)).toBe(11550);
    const s = selecionarModelo(10500, catalogo, hip);
    expect(s.escolhido?.capacidadeBtuH).toBe(12000);
    expect(s.alternativas.map((m) => m.capacidadeBtuH)).toEqual([18000, 24000, 30000, 36000, 48000, 60000]);
    expect(selecionarModelo(11000, catalogo, hip).escolhido?.capacidadeBtuH).toBe(18000);
    // Folga zero: 12.000 em cima atende.
    expect(selecionarModelo(12000, catalogo, { ...hip, folgaPct: 0 }).escolhido?.capacidadeBtuH).toBe(12000);
  });

  it('sem modelo que alcance, ou sem catálogo, o motivo diz; o tipo preferido sem modelo cai em qualquer evaporadora', () => {
    expect(selecionarModelo(70000, catalogo, hip).motivo).toMatch(/nenhum modelo alcança 77.000 BTU\/h .*60.000/);
    expect(selecionarModelo(10000, [], hip).motivo).toMatch(/catálogo sem modelo/);
    const soCassete = modelosDoCatalogo([{ id: 'c', nome: 'Cassete 18k', familia: 'TERMINAL', active: true, propriedades: { tipoHidraulico: 'EVAPORADORA_CASSETE', capacidadeBtuH: 18000 } }]);
    expect(selecionarModelo(10000, soCassete, hip).escolhido?.id).toBe('c');
  });

  it('o declarado é conferido: sub abaixo do necessário, super acima de carga × 1,5, sem capacidade quando não declarada', () => {
    expect(avaliarCapacidade(12000, 10500, hip)).toBe('ATENDE');
    expect(avaliarCapacidade(9000, 10500, hip)).toBe('SUBDIMENSIONADO');
    expect(avaliarCapacidade(18000, 10500, hip)).toBe('SUPERDIMENSIONADO');
    expect(avaliarCapacidade(null, 10500, hip)).toBe('SEM_CAPACIDADE');
    // A potência pelo EER: 12.000 BTU/h = 3.517 W de frio ÷ 3,0 = 1.172 VA.
    expect(potenciaEletricaVA(12000, 3.0)).toBe(1172);
  });

  it('a hipótese de seleção vem da coluna com faixa e padrão (tipo inválido cai no hi-wall)', () => {
    const h = hipotesesClimatizacaoDaColuna({ selecao: { folgaPct: 15, superPct: 999, eerWW: 'x', tipoPreferido: 'DIFUSOR' } }).selecao;
    expect(h).toEqual({ folgaPct: 15, superPct: 50, eerWW: 3, tipoPreferido: 'EVAPORADORA_HI_WALL' });
    expect(hipotesesClimatizacaoDaColuna({}).selecao).toEqual(HIPOTESES_DE_SELECAO_PADRAO);
  });

  it('no pavimento: a Sala sem equipamento ganha sugestão; com evaporadora declarada é conferida; o declarado VENCE a sugestão', () => {
    const { m, t, sala } = casa();
    const carga = cargaTermicaDoNivel(m, hipClima, t);
    const sel0 = selecaoDoNivel(m, carga, hip, catalogo);
    expect(sel0.ambientes.map((a) => a.nome)).toEqual(['Sala']);
    const sala0 = sel0.ambientes[0];
    expect(sala0.estado).toBe('SEM_EQUIPAMENTO');
    expect(sala0.sugestao.escolhido?.capacidadeBtuH).toBeGreaterThanOrEqual(sala0.necessarioBtuH);
    expect(sel0.conferencia.find((c) => c.codigo === 'EQUIPAMENTO')?.estado).toBe('FALTA');
    // Uma evaporadora de 9.000 declarada na Sala (a carga passa de 10.000): subdimensionada, e sem sistema.
    const com9 = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'EV', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(2000, 3700), cotaMm: 2200, capacidadeBtuH: 9000 } as Command).model;
    const sel9 = selecaoDoNivel(com9, cargaTermicaDoNivel(com9, hipClima, t), hip, catalogo);
    expect(sel9.ambientes[0].estado).toBe('SUBDIMENSIONADO');
    expect(sel9.ambientes[0].instaladaBtuH).toBe(9000);
    expect(sel9.ambientes[0].pendencias.some((p) => /sem condensadora/.test(p))).toBe(true);
    expect(sel9.conferencia.find((c) => c.codigo === 'CAPACIDADE')).toMatchObject({ estado: 'FALTA', spaceIds: [sala.id] });
    expect(sel9.conferencia.find((c) => c.codigo === 'SISTEMA')?.estado).toBe('FALTA');
    // Sem capacidade declarada: não se soma o que não se sabe.
    const semCap = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'EV', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(2000, 3700), cotaMm: 2200 } as Command).model;
    expect(selecaoDoNivel(semCap, cargaTermicaDoNivel(semCap, hipClima, t), hip, catalogo).ambientes[0]).toMatchObject({ estado: 'SEM_CAPACIDADE', instaladaBtuH: null });
    // Conferência sem ambiente climatizado: não avaliado, e o catálogo vazio é FALTA.
    expect(conferenciaDeSelecao([], 0).map((c) => c.estado)).toEqual(['FALTA', 'NAO_AVALIADO']);
  });
});
