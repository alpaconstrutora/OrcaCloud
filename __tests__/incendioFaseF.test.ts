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
