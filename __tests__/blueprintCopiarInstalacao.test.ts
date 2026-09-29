/**
 * COPIAR A INSTALAÇÃO (E1.3 do roadmap elétrico, 29/09/2026).
 *
 * Até aqui `DuplicateEntities`, `DuplicateLevel` e a área de transferência só
 * levavam arquitetura e estrutura: o andar copiado nascia sem uma tomada, e
 * Ctrl+C num quadro dizia "nada que se possa copiar". Agora ponto, trecho e
 * quadro copiam — SEM circuito, e isso é dito. E o painel do ponto passa a
 * mostrar tensão/ligação do circuito e o padrão da tomada pela corrente.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { comandoDeColagem, copiarSelecao } from '../utils/blueprintAreaDeTransferencia';
import { padraoDaTomada } from '../utils/blueprintRede';

/** Térreo com QDC, C1 e uma TUG ligada, e um eletroduto da tomada ao quadro. */
function casa(): { m: BlueprintModel; t: string } {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  let m = applyCommand(base, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(500, 500), cotaMm: 1500, tensaoV: 127, ligacao: 'FN' }).model;
  const quadroId = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C1', tensaoV: 127 }).model;
  const c1 = m.circuitos[0].id;
  m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(3000, 500), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 600 }).model;
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[0].id, circuitoId: c1 }).model;
  const cmds: Command[] = [
    { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(500, 500), b: point(3000, 500), cotaAMm: 2800, cotaBMm: 2800, bitolaMm: 25, condutores: 3, circuitoIds: [c1], sugerido: true },
  ];
  m = applyBatch(m, cmds).model;
  return { m, t };
}

describe('DuplicateEntities · instalação (E1.3)', () => {
  it('⚠️ quadro, ponto e trecho copiam deslocados; a cópia nasce SEM circuito e sem a marca de sugerido; o original fica', () => {
    const { m, t } = casa();
    const r = applyCommand(m, {
      type: 'DuplicateEntities', levelId: t, wallIds: [], boundaryIds: [], structuralIds: [], openings: [],
      terminalIds: [m.terminais[0].id], trechoIds: [m.trechos[0].id], quadroIds: [m.quadros[0].id], delta: point(0, 4000),
    });
    expect(r.diff.created).toHaveLength(3);
    const quadros = r.model.quadros; const pontos = r.model.terminais; const trechos = r.model.trechos;
    expect(quadros).toHaveLength(2);
    expect(quadros[1].at).toEqual({ x: 500, y: 4500 });
    expect(quadros[1].uid).not.toBe(quadros[0].uid);
    expect(pontos).toHaveLength(2);
    expect(pontos[1].at).toEqual({ x: 3000, y: 4500 });
    expect(pontos[1].tipoEletrico).toBe('TUG');
    expect(pontos[1].potenciaW).toBe(600);
    expect(pontos[1].circuitoId ?? null).toBeNull();
    expect(trechos).toHaveLength(2);
    expect(trechos[1].a).toEqual({ x: 500, y: 4500 });
    expect(trechos[1].b).toEqual({ x: 3000, y: 4500 });
    expect(trechos[1].circuitoIds ?? []).toEqual([]);
    expect(trechos[1].sugerido ?? false).toBe(false);
    expect(trechos[1].condutores).toBe(3);
    // Original intacto.
    expect(pontos[0].circuitoId).toBe(m.circuitos[0].id);
    expect(trechos[0].circuitoIds).toEqual([m.circuitos[0].id]);
  });

  it('id inexistente derruba o comando inteiro, com o nome da família', () => {
    const { m, t } = casa();
    expect(() => applyCommand(m, { type: 'DuplicateEntities', levelId: t, wallIds: [], boundaryIds: [], structuralIds: [], openings: [], terminalIds: ['trm_9999'], delta: point(0, 1000) })).toThrow(/Terminal não encontrado/);
    expect(() => applyCommand(m, { type: 'DuplicateEntities', levelId: t, wallIds: [], boundaryIds: [], structuralIds: [], openings: [], quadroIds: ['qdr_9999'], delta: point(0, 1000) })).toThrow(/Quadro não encontrado/);
  });
});

describe('DuplicateLevel · instalação (E1.3)', () => {
  it('a cópia SOLTA do pavimento leva quadro, ponto e trecho, sem circuitos; o pavimento vinculado continua sem instalação', () => {
    const { m, t } = casa();
    const r = applyCommand(m, { type: 'DuplicateLevel', levelId: t, novoNome: '1º andar', elevationMm: 2900 });
    const p1 = r.model.levels[1].id;
    expect(r.model.quadros.filter((q) => q.levelId === p1)).toHaveLength(1);
    const ponto = r.model.terminais.filter((x) => x.levelId === p1);
    expect(ponto).toHaveLength(1);
    expect(ponto[0].circuitoId ?? null).toBeNull();
    const trecho = r.model.trechos.filter((x) => x.levelId === p1);
    expect(trecho).toHaveLength(1);
    expect(trecho[0].circuitoIds ?? []).toEqual([]);
    // Circuitos: só o original — a cópia não ganhou circuito nenhum.
    expect(r.model.circuitos).toHaveLength(1);
    const vinculado = applyCommand(m, { type: 'AddLevel', name: '2º andar', elevationMm: 5800, defaultHeightMm: 2800, tipoDeId: t }).model;
    const p2 = vinculado.levels[1].id;
    expect(vinculado.terminais.filter((x) => x.levelId === p2)).toHaveLength(0);
    expect(vinculado.quadros.filter((x) => x.levelId === p2)).toHaveLength(0);
  });
});

describe('área de transferência · instalação (E1.3)', () => {
  it('Ctrl+C num quadro/ponto/trecho copia; a âncora enxerga os pontos deles; colar avisa que a cópia nasce sem circuito', () => {
    const { m, t } = casa();
    const r = copiarSelecao(m, [m.quadros[0].id, m.terminais[0].id, m.trechos[0].id]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.area.quadroIds).toEqual([m.quadros[0].id]);
    expect(r.area.terminalIds).toEqual([m.terminais[0].id]);
    expect(r.area.trechoIds).toEqual([m.trechos[0].id]);
    expect(r.area.ancora).toEqual({ x: 500, y: 500 });
    const c = comandoDeColagem(m, r.area, { ponto: point(500, 4500), parede: null }, t);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.aviso).toMatch(/nasce sem circuito/);
    const depois = applyCommand(m, c.comando).model;
    expect(depois.terminais).toHaveLength(2);
    expect(depois.terminais[1].at).toEqual({ x: 3000, y: 4500 });
  });

  it('só um ponto SEM circuito copiado: cola sem aviso', () => {
    const { m, t } = casa();
    const solto = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(1000, 1000), cotaMm: 300, tipoEletrico: 'TUG' }).model;
    const r = copiarSelecao(solto, [solto.terminais[1].id]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = comandoDeColagem(solto, r.area, { ponto: point(1000, 2000), parede: null }, t);
    expect(c.ok && c.aviso).toBeNull();
  });
});

describe('padrão da tomada pela corrente (E1.3, NBR 14136)', () => {
  it('600 VA em 127 V → 10 A; 2.000 VA em 127 V → 20 A; 4.400 VA em 220 V → 20 A; 5.500 VA em 220 V → ligação direta; sem tensão → null', () => {
    expect(padraoDaTomada(600, 127)).toBe('2P+T 10 A (NBR 14136)');
    expect(padraoDaTomada(2000, 127)).toBe('2P+T 20 A (NBR 14136)');
    expect(padraoDaTomada(4400, 220)).toBe('2P+T 20 A (NBR 14136)');
    expect(padraoDaTomada(5500, 220)).toMatch(/acima de 20 A \(25,0 A\) — ligação direta/);
    expect(padraoDaTomada(600, null)).toBeNull();
    expect(padraoDaTomada(null, 127)).toBeNull();
  });
});
