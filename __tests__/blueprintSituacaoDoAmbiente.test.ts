/**
 * A situação de cada disciplina no cartão do ambiente (14/10/2026) — plano
 * `docs/planos/2026-10-14-ambiente-uso-disciplinas.md`, F1.2.
 */
import { describe, expect, it } from 'vitest';
import { situacaoClimatizacao, situacaoEletrica, situacaoHidraulica } from '../utils/blueprintSituacaoDoAmbiente';
import type { ConferenciaDeIluminacao, ConferenciaDeTomadas } from '../utils/blueprintDistribuicao';
import type { PlanoDePontosDoAmbiente } from '../utils/blueprintPontosHidraulicos';

const tomadas = (parcial: Partial<ConferenciaDeTomadas>): ConferenciaDeTomadas =>
  ({ minimo: 4, regra: '1 a cada 5 m', medias: 0, existentes: 4, existentesMedias: 0, deficit: 0, deficitMedias: 0, semTipo: 0, existentesFora: 0, ...parcial }) as ConferenciaDeTomadas;
const luz = (parcial: Partial<ConferenciaDeIluminacao>): ConferenciaDeIluminacao =>
  ({ minimoVA: 160, luzesDeTeto: 1, luzes: 1, interruptores: 1, declaradoVA: 160, semPotencia: 0, faltaLuzDeTeto: false, luzNaParedeAdmitida: false, faltaInterruptor: false, deficitVA: 0, faltaComando: false, ...parcial }) as ConferenciaDeIluminacao;
const plano = (parcial: Partial<PlanoDePontosDoAmbiente>): PlanoDePontosDoAmbiente => ({
  spaceId: 's1', levelId: 'l1', nome: 'Banho', kit: 'BANHEIRO', pecas: [{ papel: 'vaso', tipo: 'VASO_SANITARIO', disciplinas: ['AGUA_FRIA'], ponto: { x: 0, y: 0 }, existentes: [] }],
  comandos: [], aCriar: 0, jaExistentes: 0, motivo: null, ...parcial,
});

describe('situacaoEletrica', () => {
  it('sem tipo: as tomadas pedem classificação, a iluminação é conferida mesmo assim', () => {
    const s = situacaoEletrica(null, luz({}));
    expect(s.estado).toBe('neutro');
    expect(s.texto).toBe('tomadas: classifique o ambiente · iluminação ✓');
  });
  it('sem tipo e sem luz de teto: falta', () => {
    const s = situacaoEletrica(null, luz({ faltaLuzDeTeto: true, deficitVA: 820 }));
    expect(s.estado).toBe('falta');
    expect(s.texto).toBe('tomadas: classifique o ambiente · falta luz de teto, 820 VA');
  });
  it('classificado e atendendo: ok, com a contagem', () => {
    const s = situacaoEletrica(tomadas({ existentes: 5, minimo: 4 }), luz({}));
    expect(s.estado).toBe('ok');
    expect(s.texto).toBe('tomadas ✓ (5/4) · iluminação ✓');
  });
  it('déficit de tomadas e de altura média: conta o maior', () => {
    const s = situacaoEletrica(tomadas({ deficit: 1, deficitMedias: 2 }), luz({ faltaComando: true }));
    expect(s.estado).toBe('falta');
    expect(s.texto).toBe('faltam 2 tomadas · falta comando');
    // Concordância: uma só é "falta" (o print de 14/10 mostrou "faltam 1 tomada").
    expect(situacaoEletrica(tomadas({ deficit: 1 }), luz({})).texto).toBe('falta 1 tomada · iluminação ✓');
  });
});

describe('situacaoHidraulica', () => {
  it('sem kit: diz se falta classificar ou se o uso é seco', () => {
    expect(situacaoHidraulica(undefined, false)).toMatchObject({ estado: 'neutro', texto: 'classifique o ambiente para prever os pontos' });
    expect(situacaoHidraulica(undefined, true)).toMatchObject({ estado: 'neutro', texto: 'sem pontos de água previstos para este uso' });
  });
  it('kit incompleto: quantos há de quantos', () => {
    expect(situacaoHidraulica(plano({ jaExistentes: 3, aCriar: 5 }), true)).toMatchObject({ estado: 'falta', texto: 'kit banheiro: 3 de 8 pontos · faltam 5' });
    expect(situacaoHidraulica(plano({ jaExistentes: 7, aCriar: 1 }), true)).toMatchObject({ texto: 'kit banheiro: 7 de 8 pontos · falta 1' });
  });
  it('kit completo: ok', () => {
    expect(situacaoHidraulica(plano({ kit: 'COZINHA', jaExistentes: 3 }), true)).toMatchObject({ estado: 'ok', texto: 'kit cozinha completo (3 pontos)' });
  });
  it('kit sem como posicionar: o motivo do plano', () => {
    expect(situacaoHidraulica(plano({ pecas: [], motivo: 'ambiente sem parede suficiente para posicionar o kit' }), true)).toMatchObject({
      estado: 'falta',
      texto: 'kit banheiro: ambiente sem parede suficiente para posicionar o kit',
    });
  });
});

describe('situacaoClimatizacao', () => {
  it('não climatizado: neutro', () => {
    expect(situacaoClimatizacao({ uso: 'Banheiro', climatizado: false, evaporadoras: 0 })).toMatchObject({ estado: 'neutro', texto: 'Banheiro · não climatizado' });
  });
  it('climatizado sem evaporadora: falta', () => {
    expect(situacaoClimatizacao({ uso: 'Dormitório', climatizado: true, evaporadoras: 0 })).toMatchObject({ estado: 'falta', texto: 'Dormitório · climatizado, sem evaporadora' });
  });
  it('com evaporadora: ok; uso não reconhecido é dito', () => {
    expect(situacaoClimatizacao({ uso: null, climatizado: true, evaporadoras: 2 })).toMatchObject({ estado: 'ok', texto: 'uso não reconhecido · 2 evaporadoras' });
  });
});
