/**
 * Tipo × instância (18/09/2026, E1.1): o que é "o tipo" de cada família, a
 * assinatura que diz "são iguais" e a volta para os comandos do kernel.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point } from '../utils/blueprintKernel';
import {
  assinaturaDoTipo,
  camposDaEstrutura,
  camposDoTerminal,
  propriedadesDaEstrutura,
  propriedadesDoTerminal,
  resumoDoTipo,
} from '../utils/blueprintTipos';

function cena() {
  const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
  const t = nivel.model.levels[0].id;
  const m = applyBatch(nivel.model, [
    { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(1000, 1000)], larguraMm: 200, profundidadeMm: 400, alturaMm: 2800, rotacaoDeg: 30, rotulo: 'P1' },
    { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(5000, 1000)], larguraMm: 200, profundidadeMm: 400, alturaMm: 2800, rotacaoDeg: 0, rotulo: 'P2' },
    { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(9000, 1000)], larguraMm: 300, profundidadeMm: 300, alturaMm: 2800 },
    { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(500, 500), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 100 },
    { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(2500, 500), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 100 },
  ]).model;
  return { m, t };
}

describe('propriedades e assinatura', () => {
  it('posição, rotação e rótulo ficam FORA do tipo: P1 (girado, rotulado) e P2 têm a mesma assinatura; o 30×30 não', () => {
    const { m } = cena();
    const [p1, p2, p3] = m.structures;
    expect(assinaturaDoTipo(propriedadesDaEstrutura(p1))).toBe(assinaturaDoTipo(propriedadesDaEstrutura(p2)));
    expect(assinaturaDoTipo(propriedadesDaEstrutura(p1))).not.toBe(assinaturaDoTipo(propriedadesDaEstrutura(p3)));
    expect(propriedadesDaEstrutura(p1)).toEqual({ familia: 'ESTRUTURA', kind: 'PILAR', larguraMm: 200, profundidadeMm: 400, alturaMm: 2800, baseMm: 0, circular: false });
    expect(resumoDoTipo(propriedadesDaEstrutura(p1))).toBe('Pilar 20×40 · 2,80 m');
  });

  it('dois pontos TUG iguais em lugares diferentes são o mesmo tipo; circuito e posição não entram', () => {
    const { m } = cena();
    const [a, b] = m.terminais!;
    expect(assinaturaDoTipo(propriedadesDoTerminal(a))).toBe(assinaturaDoTipo(propriedadesDoTerminal(b)));
    expect(resumoDoTipo(propriedadesDoTerminal(a))).toBe('TUG 100 VA · 30 cm');
    // `null` e `undefined` assinam igual — o catálogo devolve JSON sem undefined.
    const viaJson = JSON.parse(JSON.stringify(propriedadesDoTerminal(a)));
    expect(assinaturaDoTipo(viaJson)).toBe(assinaturaDoTipo(propriedadesDoTerminal(a)));
  });
});

describe('aplicar de volta', () => {
  it('as propriedades do 30×30 aplicadas ao P1 o deixam 30×30 SEM mexer na posição, no giro nem no rótulo', () => {
    const { m } = cena();
    const [p1, , p3] = m.structures;
    const depois = applyCommand(m, { type: 'SetStructuralProps', structuralId: p1.id, ...camposDaEstrutura(propriedadesDaEstrutura(p3)) }).model;
    const novo = depois.structures.find((s) => s.id === p1.id)!;
    expect([novo.larguraMm, novo.profundidadeMm]).toEqual([300, 300]);
    expect(novo.pontos[0]).toEqual({ x: 1000, y: 1000 });
    expect(novo.rotacaoDeg).toBe(30);
    expect(novo.rotulo).toBe('P1');
    expect(assinaturaDoTipo(propriedadesDaEstrutura(novo))).toBe(assinaturaDoTipo(propriedadesDaEstrutura(p3)));
  });

  it('o tipo de terminal aplicado leva classificação, potência e cota; a posição fica', () => {
    const { m, t } = cena();
    const r = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Luz', at: point(4000, 4000), cotaMm: 2800, tipoEletrico: 'ILUMINACAO_TETO', potenciaW: 100 });
    const luz = r.model.terminais!.find((x) => x.id === r.diff.created[0])!;
    const depois = applyCommand(r.model, { type: 'SetTerminalProps', terminalId: luz.id, ...camposDoTerminal(propriedadesDoTerminal(m.terminais![0])) }).model;
    const novo = depois.terminais!.find((x) => x.id === luz.id)!;
    expect(novo).toMatchObject({ tipo: 'TUG', tipoEletrico: 'TUG', potenciaW: 100, cotaMm: 300 });
    expect(novo.at).toEqual({ x: 4000, y: 4000 });
  });
});
