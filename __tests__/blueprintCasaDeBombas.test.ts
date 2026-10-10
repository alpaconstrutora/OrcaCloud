/**
 * FASE B (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — a casa de
 * bombas, o recalque e a reserva técnica propostos pelo gerador de PPCI, nos
 * QUATRO arranjos da decisão D-3 (reserva própria / parcela da caixa de água
 * fria × bomba / gravidade), o lugar que o relatório pede (D-1), a bomba sem
 * curva (D-2) e a curva do catálogo.
 */
import { describe, expect, it, vi } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_INCENDIO_PADRAO, type HipotesesIncendio } from '../utils/blueprintIncendioClassificacao';
import { gerarPpci } from '../utils/blueprintGeradorPpci';
import { analisesDeIncendio, verificacoesIncendio } from '../utils/blueprintIncendioExecutivo';
import { RESPONSAVEL_VAZIO } from '../utils/blueprintTopografiaExecutivo';
import { redeDeIncendio } from '../utils/blueprintCalculoIncendio';
import { moduloComercialL } from '../utils/blueprintCasaDeBombas';
import { hipotesesDoBombeamentoDaColuna } from '../utils/blueprintBombeamentoIncendio';

// Teto de tempo por ARQUIVO (padrão de __tests__/components/BlueprintEditor.test.tsx).
// Em 08/10/2026 a CI do commit 9c53b2c0 rodou ~1,6x mais lenta (até o tsc) e casos
// pesados deste arquivo passaram dos 5 s padrão; na reexecução, passaram. É contenção
// da máquina, não regressão. Subir AQUI mantém o teto curto no resto da suíte.
vi.setConfig({ testTimeout: 30_000 });

const hip = (alimentacao: 'BOMBA' | 'GRAVIDADE', reserva: 'PROPRIA' | 'PARCELA'): HipotesesIncendio => ({
  ...HIPOTESES_INCENDIO_PADRAO,
  classificacao: { ...HIPOTESES_INCENDIO_PADRAO.classificacao, divisao: 'A-2' },
  bombeamento: { ...HIPOTESES_INCENDIO_PADRAO.bombeamento, alimentacao, reserva },
});

/**
 * 5 pavimentos de 20 × 12 m (área > 750 m²: hidrantes exigidos): corredor e 4 salas por andar, porta da
 * rua no térreo. A 1ª sala do térreo é a "Casa de bombas"; a 1ª do último andar, o "Reservatório".
 * `caixa`: uma caixa de água fria de 5.000 L no último andar.
 */
function predio(o: { casaDeBombas?: boolean; reservatorio?: boolean; caixa?: boolean } = {}): BlueprintModel {
  let m = emptyModel();
  for (let i = 0; i < 5; i++) m = applyCommand(m, { type: 'AddLevel', name: i === 0 ? 'Térreo' : `${i}º`, elevationMm: i * 3000, defaultHeightMm: 2800 }).model;
  for (const l of m.levels) {
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l.id, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Command;
    m = applyBatch(m, [w(0, 0, 20000, 0), w(20000, 0, 20000, 12000), w(20000, 12000, 0, 12000), w(0, 12000, 0, 0), w(0, 2000, 20000, 2000), ...[5000, 10000, 15000].map((x) => w(x, 2000, x, 12000))]).model;
    const corredor = m.walls.find((x) => x.levelId === l.id && x.a.y === 2000 && x.b.y === 2000)!;
    m = applyBatch(m, [0, 1, 2, 3].map((k) => ({ type: 'AddOpening', wallId: corredor.id, kind: 'door', offsetMm: k * 5000 + 2000, widthMm: 900, heightMm: 2100, sillMm: 0 }) as Command)).model;
  }
  const [t0] = m.levels.map((l) => l.id);
  const topo = m.levels[m.levels.length - 1].id;
  const fundo = m.walls.find((x) => x.levelId === t0 && x.a.x === 0 && x.b.x === 0)!;
  m = applyCommand(m, { type: 'AddOpening', wallId: fundo.id, kind: 'door', offsetMm: 10500, widthMm: 1200, heightMm: 2100, sillMm: 0 } as Command).model;
  const sala1 = (levelId: string) => m.spaces.find((s) => s.levelId === levelId && Math.min(...s.ring.map((p) => p.x)) < 1000 && Math.min(...s.ring.map((p) => p.y)) >= 1900)!;
  if (o.casaDeBombas) m = applyCommand(m, { type: 'NameSpace', spaceId: sala1(t0).id, name: 'Casa de bombas' } as Command).model;
  if (o.reservatorio) m = applyCommand(m, { type: 'NameSpace', spaceId: sala1(topo).id, name: 'Reservatório' } as Command).model;
  if (o.caixa) m = applyCommand(m, { type: 'AddTerminal', levelId: topo, disciplina: 'AGUA_FRIA', tipo: 'Caixa', tipoHidraulico: 'RESERVATORIO', at: point(2500, 7000), cotaMm: 0, volumeL: 5000 } as Command).model;
  return m;
}

const verificacao = (m: BlueprintModel, h: HipotesesIncendio, item: string) => verificacoesIncendio(m, h, RESPONSAVEL_VAZIO, analisesDeIncendio(m, h)).verificacoes.find((v) => v.item === item);

describe('Fase B · os quatro arranjos da reserva (D-3)', () => {
  const casos: [string, HipotesesIncendio, Parameters<typeof predio>[0]][] = [
    ['reserva PRÓPRIA com BOMBA', hip('BOMBA', 'PROPRIA'), { casaDeBombas: true }],
    ['reserva PRÓPRIA por GRAVIDADE', hip('GRAVIDADE', 'PROPRIA'), { reservatorio: true }],
    ['PARCELA da caixa com BOMBA', hip('BOMBA', 'PARCELA'), { casaDeBombas: true, caixa: true }],
    ['PARCELA da caixa por GRAVIDADE', hip('GRAVIDADE', 'PARCELA'), { caixa: true }],
  ];
  for (const [nome, h, o] of casos) {
    it(`⚠️ PRONTO QUANDO: ${nome} — a reserva técnica atende e toda peça recebe água da fonte`, () => {
      const p = gerarPpci(predio(o), h);
      const m = p.resultado;
      expect(verificacao(m, h, 'Reserva técnica de incêndio')?.atende, JSON.stringify(verificacao(m, h, 'Reserva técnica de incêndio'))).toBe(true);
      expect(verificacao(m, h, 'Toda peça recebe água da bomba')?.atende).toBe(true);
      const fonte = redeDeIncendio(m).tipoDaFonte;
      expect(fonte).toBe(h.bombeamento.alimentacao === 'BOMBA' ? 'BOMBA' : 'GRAVIDADE');
      if (h.bombeamento.reserva === 'PARCELA') {
        const caixa = m.terminais!.find((t) => t.disciplina === 'AGUA_FRIA' && t.tipoHidraulico === 'RESERVATORIO')!;
        expect(caixa.volumeRtiL).toBeGreaterThan(0);
        expect(caixa.volumeL! - caixa.volumeRtiL!).toBeGreaterThanOrEqual(5000); // o consumo que a caixa já tinha continua lá
      }
      if (h.bombeamento.alimentacao === 'BOMBA') {
        expect(verificacao(m, h, 'Bomba jockey ligada à principal')?.atende).toBe(true);
        expect(verificacao(m, h, 'Pressostatos (um por bomba)')?.atende).toBe(true);
      }
      expect(verificacao(m, h, 'Registro de recalque ligado à rede')?.atende).toBe(true);
    });
  }
});

describe('Fase B · o que o relatório pede (D-1) e a curva (D-2)', () => {
  it('sem casa de bombas no desenho: não posiciona — o relatório pede o lugar, e a rede não roda', () => {
    const p = gerarPpci(predio(), hip('BOMBA', 'PROPRIA'));
    expect(p.pendencias.some((x) => x.grupo === 'NAO_DECIDIDO' && /Casa de bombas: o desenho não diz onde/.test(x.texto))).toBe(true);
    expect((p.resultado.terminais ?? []).some((t) => t.tipoHidraulico === 'BOMBA_INCENDIO')).toBe(false);
    expect(p.etapas.find((e) => e.id === 'REDE')!.situacao).toBe('NAO_RODOU');
  });

  it('gravidade sem lugar para a caixa elevada: o relatório pede', () => {
    const p = gerarPpci(predio(), hip('GRAVIDADE', 'PROPRIA'));
    expect(p.pendencias.some((x) => /Caixa elevada de incêndio: o desenho não diz onde/.test(x.texto))).toBe(true);
  });

  it('com o ambiente "Casa de bombas": a bomba entra nele, SEM curva (catálogo vazio), e o relatório diz o ponto de projeto', () => {
    const m0 = predio({ casaDeBombas: true });
    const p = gerarPpci(m0, hip('BOMBA', 'PROPRIA'));
    const bomba = p.resultado.terminais!.find((t) => t.tipoHidraulico === 'BOMBA_INCENDIO')!;
    const casa = m0.spaces.find((s) => s.name === 'Casa de bombas')!;
    expect(bomba.levelId).toBe(casa.levelId);
    expect(bomba.curvaBomba ?? null).toBeNull();
    expect(p.pendencias.some((x) => /curva a escolher — ponto de projeto \d+ L\/min a [\d,]+ mca; o catálogo da organização não tem bomba de incêndio/.test(x.texto))).toBe(true);
  });

  it('com o catálogo: escolhe a bomba que atende o ponto de projeto e aplica a curva', () => {
    const grande = { id: 'tp1', nome: 'Bomba 15 cv', curva: [{ vazaoLmin: 0, alturaMm: 140000 }, { vazaoLmin: 800, alturaMm: 110000 }, { vazaoLmin: 1600, alturaMm: 60000 }] };
    const pequena = { id: 'tp2', nome: 'Bomba 1 cv', curva: [{ vazaoLmin: 0, alturaMm: 20000 }, { vazaoLmin: 100, alturaMm: 15000 }, { vazaoLmin: 200, alturaMm: 5000 }] };
    const p = gerarPpci(predio({ casaDeBombas: true }), hip('BOMBA', 'PROPRIA'), [pequena, grande]);
    const bomba = p.resultado.terminais!.find((t) => t.tipoHidraulico === 'BOMBA_INCENDIO')!;
    expect(bomba.tipo).toBe('Bomba 15 cv');
    expect(bomba.curvaBomba).toEqual(grande.curva);
    expect(p.pendencias.some((x) => /curva a escolher/.test(x.texto))).toBe(false);
  });
});

describe('Fase B · peças auxiliares', () => {
  it('gerar DE NOVO sobre o resultado não lança peça nenhuma (a lei da Fase A, agora com a casa de bombas)', () => {
    for (const [h, o] of [[hip('BOMBA', 'PROPRIA'), { casaDeBombas: true }], [hip('GRAVIDADE', 'PARCELA'), { caixa: true }]] as const) {
      const p1 = gerarPpci(predio(o), h);
      const p2 = gerarPpci(p1.resultado, h);
      expect(p2.comandos.filter((c) => c.type === 'AddTerminal' || c.type === 'SetTerminalProps')).toEqual([]);
    }
  });

  it('o módulo comercial: de 500 em 500 até 5.000 L; acima, de 1.000 em 1.000', () => {
    expect([1, 500, 501, 4999, 5001, 36644].map(moduloComercialL)).toEqual([500, 500, 1000, 5000, 6000, 37000]);
  });

  it('as premissas novas leem o banco antigo (sem os campos) com o padrão: bomba e reserva própria', () => {
    expect(hipotesesDoBombeamentoDaColuna({ altitudeM: 850 })).toMatchObject({ altitudeM: 850, alimentacao: 'BOMBA', reserva: 'PROPRIA' });
    expect(hipotesesDoBombeamentoDaColuna({ alimentacao: 'GRAVIDADE', reserva: 'PARCELA' })).toMatchObject({ alimentacao: 'GRAVIDADE', reserva: 'PARCELA' });
  });
});
