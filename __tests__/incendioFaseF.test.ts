/**
 * FASE F (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — F1 o kit da peça
 * (placa; VGA com manômetros e registro; manômetro do barrilete) e F4 o detector
 * de chama (kernel 0.89.0: cobertura por cone, a sala que o pede, a proposta).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { kitDaPeca } from '../utils/blueprintKitsIncendio';
import { CONE_DO_DETECTOR_DE_CHAMA, analisarAlarme, detectorCobre, detectorDoAmbiente, proporAlarme } from '../utils/blueprintDeteccaoAlarme';
import { proporFonte } from '../utils/blueprintCasaDeBombas';
import { HIPOTESES_INCENDIO_PADRAO as H } from '../utils/blueprintIncendioClassificacao';
import { DesenhistaDeProva } from '../utils/blueprintExport';
import { desenharDetalheDaVga } from '../utils/blueprintDetalhesIncendio';

import { proporEletrodutoDoLaco, ROTULO_DO_LACO } from '../utils/blueprintLacoDeAlarme';
import { analisarAntipanico, proporAntipanico } from '../utils/blueprintAntipanico';
import { analisarSaidas } from '../utils/blueprintSaidasIncendio';
import { percursoDeFuga } from '../utils/blueprintRotaDeFuga';
import { alimentacaoDasLuminarias, POTENCIA_DA_LUMINARIA_W } from '../utils/blueprintKitsIncendio';
import { HIPOTESES_CIRCUITOS_PADRAO, planejarCircuitos } from '../utils/blueprintCircuitosAutomaticos';
import { HIPOTESES_PADRAO as HIP_ELETRICA } from '../utils/blueprintEletricaDimensionamento';
import { KERNEL_VERSION, POLITICA_PADRAO, computeQuantities } from '../utils/blueprintKernel';
function nivel(): { m: BlueprintModel; l: string } {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, l: m.levels[0].id };
}
const tubo = (l: string, ax: number, bx: number): Command => ({ type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(ax, 0), b: point(bx, 0), cotaAMm: 1200, cotaBMm: 1200, bitolaMm: 100 }) as Command;
const peca = (l: string, tipo: string, x: number, y = 0, cota = 1200, extra: Record<string, unknown> = {}): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, tipoHidraulico: tipo, at: point(x, y), cotaMm: cota, ...extra }) as Command;

describe('F1 · o kit da peça', () => {
  it('⚠️ PRONTO QUANDO: a VGA entre dois tubos entra com o manômetro de montante, o de jusante e o registro — num lote só', () => {
    const { m: m0, l } = nivel();
    const m = applyBatch(m0, [tubo(l, 0, 3000), tubo(l, 3000, 6000)]).model;
    const kit = kitDaPeca(m, [peca(l, 'VGA', 3000)]);
    expect(kit.aviso).toBeNull();
    const depois = applyBatch(m, kit.comandos).model;
    const tipos = depois.terminais!.map((t) => t.tipoHidraulico).sort();
    expect(tipos).toEqual(['MANOMETRO', 'MANOMETRO', 'REGISTRO_GAVETA', 'VGA']);
    const manometros = depois.terminais!.filter((t) => t.tipoHidraulico === 'MANOMETRO').map((t) => t.at.x).sort((a, b) => a - b);
    expect(manometros).toEqual([2700, 3300]); // um de cada lado, a 30 cm
    expect(depois.terminais!.find((t) => t.tipoHidraulico === 'REGISTRO_GAVETA')!.cotaMm).toBe(1200);
  });

  it('a VGA fora da rede não ganha manômetro — o aviso diz por quê', () => {
    const { m, l } = nivel();
    const kit = kitDaPeca(m, [peca(l, 'VGA', 3000)]);
    expect(kit.comandos).toHaveLength(1);
    expect(kit.aviso).toMatch(/VGA fora da rede/);
  });

  it('o hidrante inserido à mão entra com a placa dele (o mesmo kit das propostas)', () => {
    const { m, l } = nivel();
    const kit = kitDaPeca(m, [peca(l, 'HIDRANTE_SIMPLES', 1000, 0, 1300)]);
    const depois = applyBatch(m, kit.comandos).model;
    const placa = depois.terminais!.find((t) => t.tipoHidraulico === 'PLACA')!;
    expect(placa.codigoPlaca).toBe('E8');
    expect(placa.alvoId).toBe(depois.terminais!.find((t) => t.tipoHidraulico === 'HIDRANTE_SIMPLES')!.id);
  });

  it('a casa de bombas ganha o manômetro do barrilete, e o detalhe típico da VGA conta os manômetros', () => {
    let { m, l } = nivel();
    m = applyCommand(m, peca(l, 'BOMBA_INCENDIO', 1000, 1000, 300)).model;
    const f = proporFonte(m, H);
    const depois = applyBatch(m, f.comandos).model;
    expect(depois.terminais!.filter((t) => t.tipoHidraulico === 'MANOMETRO')).toHaveLength(1);
    const comVga = applyCommand(depois, peca(l, 'VGA', 5000)).model;
    const d = new DesenhistaDeProva();
    desenharDetalheDaVga(d, comVga, 0, 0, 200, 80);
    expect(d.textos().join(' | ')).toMatch(/Manômetros: 1 no desenho/);
  });
});

describe('F4 · o detector de chama (0.89.0)', () => {
  const det = (rot: number) => ({ at: { x: 0, y: 0 }, tipo: 'DETECTOR_CHAMA', rotacaoGraus: rot });
  it('o cone: à frente até o alcance; não atrás, não fora da abertura, não além do alcance', () => {
    expect(detectorCobre(det(0), { x: 10000, y: 0 })).toBe(true);
    expect(detectorCobre(det(0), { x: 10000, y: 9900 })).toBe(true); // 44,7° — dentro da abertura de 90°
    expect(detectorCobre(det(0), { x: 10000, y: 12000 })).toBe(false); // 50° — fora
    expect(detectorCobre(det(0), { x: -5000, y: 0 })).toBe(false); // atrás
    expect(detectorCobre(det(0), { x: CONE_DO_DETECTOR_DE_CHAMA.alcanceMm + 10, y: 0 })).toBe(false);
    expect(detectorCobre(det(90), { x: 0, y: 8000 })).toBe(true); // a rotação é o eixo
  });

  it('o depósito de inflamáveis pede o de chama; o resto segue fumaça/temperatura', () => {
    const s = (name: string) => ({ name }) as never;
    expect(detectorDoAmbiente(s('Depósito de inflamáveis'))).toBe('DETECTOR_CHAMA');
    expect(detectorDoAmbiente(s('Sala do gerador'))).toBe('DETECTOR_CHAMA');
    expect(detectorDoAmbiente(s('Garagem'))).toBe('DETECTOR_TEMPERATURA');
    expect(detectorDoAmbiente(s('Sala'))).toBe('DETECTOR_FUMACA');
  });

  it('⚠️ PRONTO QUANDO: a proposta cobre o depósito com detectores de chama olhando para dentro, e a análise fecha (a lei da Fase A)', () => {
    let { m, l } = nivel();
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Command;
    m = applyBatch(m, [w(0, 0, 12000, 0), w(12000, 0, 12000, 9000), w(12000, 9000, 0, 9000), w(0, 9000, 0, 0)]).model;
    m = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Depósito de inflamáveis' } as Command).model;
    const lote = proporAlarme(m, analisarAlarme(m, true, false));
    const depois = applyBatch(m, lote).model;
    const chamas = depois.terminais!.filter((t) => t.tipoHidraulico === 'DETECTOR_CHAMA');
    expect(chamas.length).toBeGreaterThan(0);
    // Cada um olha para DENTRO do depósito (o cone não cobre nada virado para a parede).
    expect(chamas.every((t) => t.rotacaoGraus != null)).toBe(true);
    expect(analisarAlarme(depois, true, false).ambientes.filter((a) => !a.atende)).toEqual([]);
    expect(proporAlarme(depois, analisarAlarme(depois, true, false))).toEqual([]);
  });
});

// ─── F3 · F5 · F6 ─────────────────────────────────────────────────────────────

/** Corredor (y 0–2 m) e 3 salas de 6 × 6 com porta para ele; a porta da rua no fim do corredor. */
function andarComSalas(): BlueprintModel {
  let { m, l } = nivel();
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Command;
  m = applyBatch(m, [w(0, 0, 18000, 0), w(18000, 0, 18000, 8000), w(18000, 8000, 0, 8000), w(0, 8000, 0, 0), ...[0, 1, 2].map((k) => w(k * 6000, 2000, (k + 1) * 6000, 2000)), w(6000, 2000, 6000, 8000), w(12000, 2000, 12000, 8000)]).model;
  m = applyBatch(m, m.walls.filter((x) => x.a.y === 2000 && x.b.y === 2000).map((x) => ({ type: 'AddOpening', wallId: x.id, kind: 'door', offsetMm: 2500, widthMm: 900, heightMm: 2100, sillMm: 0 }) as Command)).model;
  return applyCommand(m, { type: 'AddOpening', wallId: m.walls.find((x) => x.a.x === 0 && x.b.x === 0)!.id, kind: 'door', offsetMm: 6500, widthMm: 1200, heightMm: 2100, sillMm: 0 } as Command).model;
}

describe('F5 · a barra antipânico', () => {
  it('⚠️ PRONTO QUANDO: na reunião de público (F), a porta da rota sem barra é falta e a proposta a resolve — mantendo as outras marcas; a 2ª sai vazia', () => {
    let m = andarComSalas();
    const portaDaRua = m.openings.find((o) => o.widthMm === 1200)!;
    m = applyCommand(m, { type: 'SetOpeningEmergencia', openingId: portaDaRua.id, marcas: ['CORTA_FOGO'] } as Command).model;
    const analise = () => analisarAntipanico(m, percursoDeFuga(m, 'F', m.levels[0].id, null), analisarSaidas(m, 'F-1', H.saidas, m.levels[0].id, 0));
    const portas = analise();
    expect(portas.length).toBeGreaterThanOrEqual(2); // as das salas e a da rua
    expect(portas.every((p) => p.exigida && !p.tem)).toBe(true);
    m = applyBatch(m, proporAntipanico(m, portas)).model;
    expect(analise().every((p) => p.tem)).toBe(true);
    expect(m.openings.find((o) => o.id === portaDaRua.id)!.emergencia).toEqual(['CORTA_FOGO', 'ANTIPANICO']);
    expect(proporAntipanico(m, analise())).toEqual([]);
  });

  it('residencial com pouca gente: a porta da rota não pede a barra (regra CONFERIR NA IT)', () => {
    const m = andarComSalas();
    const portas = analisarAntipanico(m, percursoDeFuga(m, 'A', m.levels[0].id, null), analisarSaidas(m, 'A-2', H.saidas, m.levels[0].id, 0));
    expect(portas.length).toBeGreaterThan(0);
    expect(portas.every((p) => !p.exigida)).toBe(true);
  });
});

describe('F3 · o eletroduto do laço', () => {
  it('⚠️ PRONTO QUANDO: da central aos dispositivos, com a prumada para o pavimento de cima — o quantitativo conta o eletroduto; a 2ª proposta sai vazia', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    m = applyCommand(m, { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 2800 }).model;
    const [t, s] = m.levels.map((x) => x.id);
    m = applyCommand(m, peca(t, 'CENTRAL_ALARME', 1000, 1000, 1500)).model;
    const central = m.terminais![0].id;
    m = applyBatch(m, [peca(t, 'DETECTOR_FUMACA', 5000, 1000, 2700, { centralAlarmeId: central }), peca(t, 'ACIONADOR_MANUAL', 1000, 5000, 1200, { centralAlarmeId: central }), peca(s, 'DETECTOR_FUMACA', 4000, 4000, 2700, { centralAlarmeId: central })]).model;
    const lote = proporEletrodutoDoLaco(m);
    const depois = applyBatch(m, lote).model;
    const laco = depois.trechos!.filter((x) => x.rotulo === ROTULO_DO_LACO);
    expect(laco.every((x) => x.disciplina === 'ELETRICA' && x.sugerido)).toBe(true);
    // A prumada sobe da central até o teto do térreo; no 1º, a cadeia parte do pé dela.
    expect(laco.some((x) => x.levelId === t && x.a.x === 1000 && x.b.x === 1000 && x.a.y === 1000 && x.b.y === 1000 && Math.max(x.cotaAMm, x.cotaBMm) === 2800)).toBe(true);
    expect(laco.some((x) => x.levelId === s && x.a.x === 1000 && x.a.y === 1000 && x.cotaAMm === 0)).toBe(true);
    // Todo dispositivo é ponta de um eletroduto do laço.
    for (const d of depois.terminais!.filter((x) => x.centralAlarmeId)) expect(laco.some((x) => [x.a, x.b].some((p) => p.x === d.at.x && p.y === d.at.y) && x.levelId === d.levelId), d.tipoHidraulico!).toBe(true);
    const q = computeQuantities(depois, POLITICA_PADRAO, KERNEL_VERSION);
    expect(q.totais.porBitola.find((b) => b.disciplina === 'ELETRICA' && b.bitolaMm === 20)!.comprimentoM).toBeGreaterThan(5);
    expect(proporEletrodutoDoLaco(depois)).toEqual([]);
  });
});

describe('F6 · a luminária de emergência no circuito', () => {
  it('⚠️ PRONTO QUANDO: a luminária entra com o ponto de alimentação (iluminação, 10 W) e os circuitos automáticos o põem num circuito de ILUMINAÇÃO', () => {
    let { m, l } = nivel();
    m = applyCommand(m, { type: 'AddQuadro', levelId: l, nome: 'QDC', at: point(0, 0) } as Command).model;
    const kit = kitDaPeca(m, [peca(l, 'LUMINARIA_EMERGENCIA', 3000, 1000, 2200)]);
    m = applyBatch(m, kit.comandos).model;
    const alim = m.terminais!.find((t) => t.disciplina === 'ELETRICA')!;
    expect(alim).toMatchObject({ tipoEletrico: 'ILUMINACAO_PAREDE', potenciaW: POTENCIA_DA_LUMINARIA_W, at: { x: 3000, y: 1000 } });
    const plano = planejarCircuitos(m, l, m.quadros![0].id, HIPOTESES_CIRCUITOS_PADRAO, HIP_ELETRICA);
    const circuito = plano.circuitos.find((c) => c.terminalIds.includes(alim.id))!;
    expect(circuito.funcao).toBe('ILUMINACAO');
    expect(circuito.somaVA).toBeGreaterThanOrEqual(POTENCIA_DA_LUMINARIA_W);
    // Idempotente: a luminária que já tem alimentação não ganha outra.
    expect(alimentacaoDasLuminarias(m)).toEqual([]);
  });
});
