/**
 * INCÊNDIO E1.4 (30/09/2026): a numeração DERIVADA da rede de incêndio (H-1,
 * SPK-3…), o rótulo declarado vencendo e reservando o número, e o tipo salvo
 * do sprinkler levando o fator K e a posição.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { numeracaoDeIncendio } from '../utils/blueprintNumeracaoIncendio';
import { assinaturaDoTipo, camposDoTerminal, propriedadesDoTerminal } from '../utils/blueprintTipos';

function predio(): { m: BlueprintModel; t: string; s: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id, s: m.levels[1].id };
}
const peca = (levelId: string, tipoHidraulico: string, x: number, y: number, rotulo?: string): Command =>
  ({ type: 'AddTerminal', levelId, disciplina: 'INCENDIO', tipo: tipoHidraulico, at: point(x, y), cotaMm: 1300, tipoHidraulico, ...(rotulo ? { rotulo } : {}) }) as Command;

const numeros = (m: BlueprintModel) => Object.fromEntries([...numeracaoDeIncendio(m)].map(([id, n]) => [m.terminais!.find((t) => t.id === id)!.at.x + '@' + m.terminais!.find((t) => t.id === id)!.levelId, n.numero]));

describe('incêndio E1.4 · numeração derivada', () => {
  it('pavimento de baixo para cima; no pavimento, de cima para baixo e da esquerda para a direita', () => {
    const { m, t, s } = predio();
    const mm = applyBatch(m, [
      peca(s, 'HIDRANTE_SIMPLES', 0, 5000),
      peca(t, 'HIDRANTE_SIMPLES', 9000, 0),
      peca(t, 'HIDRANTE_DUPLO', 1000, 5000),
      peca(t, 'HIDRANTE_SIMPLES', 0, 0),
    ]).model;
    const n = numeros(mm);
    expect(n[`1000@${t}`]).toBe('H-1'); // térreo, mais alto na planta
    expect(n[`0@${t}`]).toBe('H-2'); // térreo, y = 0, mais à esquerda
    expect(n[`9000@${t}`]).toBe('H-3');
    expect(n[`0@${s}`]).toBe('H-4'); // o superior vem depois
  });

  it('cada tipo tem a sua série; sprinkler e mangotinho não entram na dos hidrantes', () => {
    const { m, t } = predio();
    const mm = applyBatch(m, [peca(t, 'HIDRANTE_SIMPLES', 0, 0), peca(t, 'MANGOTINHO', 1000, 0), peca(t, 'SPRINKLER', 2000, 0), peca(t, 'SPRINKLER', 3000, 0)]).model;
    expect(Object.values(numeros(mm)).sort()).toEqual(['H-1', 'MG-1', 'SPK-1', 'SPK-2']);
  });

  it('⚠️ o rótulo declarado vence e RESERVA o número: os derivados pulam por cima dele', () => {
    const { m, t } = predio();
    const mm = applyBatch(m, [peca(t, 'HIDRANTE_SIMPLES', 0, 0, 'H-1'), peca(t, 'HIDRANTE_SIMPLES', 1000, 0), peca(t, 'HIDRANTE_SIMPLES', 2000, 0, 'Hidrante da garagem')]).model;
    const r = numeracaoDeIncendio(mm);
    const porX = (x: number) => r.get(mm.terminais!.find((p) => p.at.x === x)!.id)!;
    expect(porX(0)).toEqual({ numero: 'H-1', origem: 'DECLARADO' });
    expect(porX(1000)).toEqual({ numero: 'H-2', origem: 'DERIVADO' });
    expect(porX(2000)).toEqual({ numero: 'Hidrante da garagem', origem: 'DECLARADO' });
  });

  it('apagar uma peça renumera as outras — sem comando nenhum', () => {
    const { m, t } = predio();
    const mm = applyBatch(m, [peca(t, 'SPRINKLER', 0, 0), peca(t, 'SPRINKLER', 1000, 0), peca(t, 'SPRINKLER', 2000, 0)]).model;
    const sem = applyCommand(mm, { type: 'DeleteTerminal', terminalId: mm.terminais![0].id } as Command).model;
    expect(Object.values(numeros(sem)).sort()).toEqual(['SPK-1', 'SPK-2']);
  });

  it('ponto de outra rede e ponto de incêndio sem tipo não são numerados', () => {
    const { m, t } = predio();
    const mm = applyBatch(m, [
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'LV', at: point(0, 0), cotaMm: 600, tipoHidraulico: 'LAVATORIO' } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'INCENDIO', tipo: 'Ponto', at: point(1000, 0), cotaMm: 600 } as Command,
    ]).model;
    expect(numeracaoDeIncendio(mm).size).toBe(0);
  });
});

describe('incêndio E1.4 · o tipo salvo do sprinkler', () => {
  it('leva o fator K e a posição; e um ponto SEM K tem a mesma assinatura de antes (nada de "fatorK=null")', () => {
    const { m, t } = predio();
    const mm = applyBatch(m, [
      { ...peca(t, 'SPRINKLER', 0, 0), fatorK: 115, posicaoSprinkler: 'EM_PE' } as Command,
      peca(t, 'HIDRANTE_SIMPLES', 1000, 0),
    ]).model;
    const [spk, h] = mm.terminais!;
    const p = propriedadesDoTerminal(spk);
    expect(p).toMatchObject({ fatorK: 115, posicaoSprinkler: 'EM_PE' });
    expect(camposDoTerminal(p)).toMatchObject({ fatorK: 115, posicaoSprinkler: 'EM_PE' });
    expect(assinaturaDoTipo(propriedadesDoTerminal(h))).not.toMatch(/fatorK|posicaoSprinkler/);
  });
});
