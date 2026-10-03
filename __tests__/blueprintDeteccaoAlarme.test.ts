/**
 * INCÊNDIO E7.4 (01/10/2026): detecção e alarme no kernel (0.88.0) — o laço
 * como relação com a central — e a regra: cobertura dos detectores por
 * ambiente, 30 m até um acionador, avisador por pavimento, laço (CONFERIR NA
 * NBR 17240), e a proposta que fecha tudo num lote.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, canonicalPayload, emptyModel, modelFromCanonicalPayload, parseCanonicalPayload, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { analisarAlarme, detectorDoAmbiente, proporAlarme } from '../utils/blueprintDeteccaoAlarme';

/** Corredor de 60 × 2 m com saída a oeste e dez salas de 6 × 6 m; a sala 1 é "Cozinha", a sala 2 "Banheiro". */
function andar(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Command;
  const cmds: Command[] = [w(0, 0, 60000, 0), w(60000, 0, 60000, 8000), w(60000, 8000, 0, 8000), w(0, 8000, 0, 2000), w(0, 2000, 0, 0)];
  for (let k = 0; k < 10; k++) cmds.push(w(k * 6000, 2000, (k + 1) * 6000, 2000));
  for (let k = 1; k < 10; k++) cmds.push(w(k * 6000, 2000, k * 6000, 8000));
  m = applyBatch(m, cmds).model;
  const portas = m.walls.filter((x) => x.a.y === 2000 && x.b.y === 2000).map((x) => ({ type: 'AddOpening', wallId: x.id, kind: 'door', offsetMm: 2500, widthMm: 900, heightMm: 2100, sillMm: 0 }) as Command);
  const saida = m.walls.find((x) => x.a.x === 0 && x.b.x === 0 && x.a.y === 2000)!;
  m = applyBatch(m, [...portas, { type: 'AddOpening', wallId: saida.id, kind: 'door', offsetMm: 550, widthMm: 900, heightMm: 2100, sillMm: 0 } as Command]).model;
  return applyBatch(
    m,
    m.spaces.map((s) => {
      const k = Math.round(Math.min(...s.ring.map((p) => p.x)) / 6000) + 1;
      return { type: 'NameSpace', spaceId: s.id, name: s.ring.every((p) => p.y <= 2000) ? 'Corredor' : k === 1 ? 'Cozinha' : k === 2 ? 'Banheiro' : `Sala ${k}` } as Command;
    }),
  ).model;
}
const ponto = (m: BlueprintModel, tipo: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
  applyCommand(m, { type: 'AddTerminal', levelId: m.levels[0].id, disciplina: 'INCENDIO', tipo, tipoHidraulico: tipo, at: point(x, y), cotaMm: 2700, ...extra } as Command).model;

describe('E7.4 · o laço no kernel (0.88.0)', () => {
  it('a central só nos do laço, e tem de ser uma central; apagar a central solta o laço', () => {
    let m = ponto(andar(), 'CENTRAL_ALARME', 500, 1000);
    const c = m.terminais![0].id;
    m = ponto(m, 'DETECTOR_FUMACA', 9000, 5000, { centralAlarmeId: c });
    const d = m.terminais![1].id;
    expect(m.terminais![1].centralAlarmeId).toBe(c);
    expect(() => applyCommand(m, { type: 'SetTerminalProps', terminalId: d, centralAlarmeId: d } as Command)).toThrow(/não é uma central de alarme/);
    expect(() => ponto(m, 'EXTINTOR', 1000, 1000, { centralAlarmeId: c })).not.toThrow(); // o AddTerminal ignora o campo fora do laço
    m = applyCommand(m, { type: 'DeleteTerminal', terminalId: c } as Command).model;
    expect(m.terminais![0].centralAlarmeId).toBeNull();
  });

  it('ida e volta pelo canônico preserva o laço (por índice)', () => {
    let m = ponto(andar(), 'CENTRAL_ALARME', 500, 1000);
    m = ponto(m, 'ACIONADOR_MANUAL', 1500, 1000, { centralAlarmeId: m.terminais![0].id, cotaMm: 1200 });
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    const c = volta.terminais!.find((t) => t.tipoHidraulico === 'CENTRAL_ALARME')!;
    expect(volta.terminais!.find((t) => t.tipoHidraulico === 'ACIONADOR_MANUAL')!.centralAlarmeId).toBe(c.id);
    expect(canonicalPayload(volta)).toBe(canonicalPayload(m));
  });
});

describe('E7.4 · a regra', () => {
  it('o detector do ambiente: temperatura na cozinha, nenhum no banheiro, fumaça no resto', () => {
    const m = andar();
    const s = (n: string) => m.spaces.find((x) => x.name === n)!;
    expect(detectorDoAmbiente(s('Cozinha'))).toBe('DETECTOR_TEMPERATURA');
    expect(detectorDoAmbiente(s('Banheiro'))).toBeNull();
    expect(detectorDoAmbiente(s('Sala 5'))).toBe('DETECTOR_FUMACA');
  });

  it('um detector de fumaça no centro da sala de 6 × 6 m cobre ela inteira (raio 6,3 m); o da sala ao lado não conta (parede)', () => {
    const m = ponto(andar(), 'DETECTOR_FUMACA', 27000, 5000);
    const a = analisarAlarme(m, true, false);
    expect(a.ambientes.find((x) => x.rotulo === 'Sala 5')!.atende).toBe(true);
    expect(a.ambientes.find((x) => x.rotulo === 'Sala 6')!.atende).toBe(false);
    expect(a.ambientes.some((x) => x.rotulo === 'Banheiro')).toBe(false);
  });

  // Tempo próprio: ~0,6 s local, mas 6+ s no runner da CI (10× mais lento nesta conta) — o limite
  // padrão de 5 s derrubou a CI em todos os runs desde 02/10/2026. Só este teste; a régua dos outros fica.
  it('⚠️ PRONTO QUANDO: sem nada, tudo falta (laço sem central incluído); a proposta fecha detecção, acionadores, avisador e laço num lote', () => {
    const m = andar();
    const a = analisarAlarme(m, true, true);
    expect(a.semCentral).toBe(true);
    expect(a.ambientes.every((x) => !x.atende)).toBe(true);
    expect(a.longeDoAcionador.length).toBe(m.spaces.length);
    expect(a.pavimentosSemAvisador).toHaveLength(1);
    const depois = applyBatch(m, proporAlarme(m, a)).model;
    const b = analisarAlarme(depois, true, true);
    expect(b.semCentral).toBe(false);
    expect(b.ambientes.every((x) => x.atende)).toBe(true);
    expect(b.longeDoAcionador).toEqual([]);
    expect(b.pavimentosSemAvisador).toEqual([]);
    expect(b.foraDoLaco).toEqual([]);
    // O corredor de 60 m pede mais de um acionador (30 m a percorrer de cada ponto).
    expect(depois.terminais!.filter((t) => t.tipoHidraulico === 'ACIONADOR_MANUAL').length).toBeGreaterThanOrEqual(2);
    // A cozinha ganhou detector de temperatura.
    const coz = depois.spaces.find((s) => s.name === 'Cozinha')!;
    expect(depois.terminais!.some((t) => t.tipoHidraulico === 'DETECTOR_TEMPERATURA' && t.at.x < 6000 && t.at.y > 2000 && coz)).toBe(true);
  }, 20_000);

  it('dispositivo existente fora do laço é dito, e a proposta o liga à central', () => {
    let m = ponto(andar(), 'CENTRAL_ALARME', 500, 1000);
    m = ponto(m, 'AVISADOR', 30000, 1000, { cotaMm: 2200 });
    const a = analisarAlarme(m, false, false);
    expect(a.foraDoLaco).toEqual([m.terminais![1].id]);
    const depois = applyBatch(m, proporAlarme(m, a)).model;
    expect(depois.terminais![1].centralAlarmeId).toBe(m.terminais![0].id);
  });
});
