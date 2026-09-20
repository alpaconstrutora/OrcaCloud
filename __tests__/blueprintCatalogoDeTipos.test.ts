/**
 * Catálogo de tipos (20/09/2026, backlog P2 — P2.3): sementes coerentes com o
 * kernel (aplicáveis e com resumo), o que falta semear, usos por assinatura no
 * desenho, agrupamento por família, validação de nome e o que se copia.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { assinaturaDoTipo, camposDaEstrutura, camposDoTerminal, resumoDoTipo, type PropriedadesDeEstrutura, type PropriedadesDeTerminal } from '../utils/blueprintTipos';
import { SEMENTES_DE_TIPOS, agruparPorFamilia, faltamSementes, paraCopiar, usosDoTipo, usosPorAssinatura, validarNomeDeTipo, type TipoDoCatalogo } from '../utils/blueprintCatalogoDeTipos';

const tipo = (id: string, s: (typeof SEMENTES_DE_TIPOS)[number], extra: Partial<TipoDoCatalogo> = {}): TipoDoCatalogo => ({ id, organizationId: 'org', familia: s.propriedades.familia, nome: s.nome, propriedades: s.propriedades, active: true, ...extra });

describe('catálogo de tipos (P2.3)', () => {
  it('as sementes têm nome único por família, resumo legível, e as de estrutura/terminal aplicam-se a uma peça sem o kernel recusar', () => {
    const chaves = SEMENTES_DE_TIPOS.map((s) => `${s.propriedades.familia}::${s.nome}`);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const s of SEMENTES_DE_TIPOS) expect(resumoDoTipo(s.propriedades).length).toBeGreaterThan(3);
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m.levels[0].id;
    m = applyBatch(m, [
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(1000, 1000)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800, baseMm: 0 } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Ponto', at: point(2000, 0), cotaMm: 300 } as Command,
    ]).model;
    for (const s of SEMENTES_DE_TIPOS) {
      if (s.propriedades.familia === 'ESTRUTURA' && s.propriedades.kind === 'PILAR') {
        const r = applyCommand(m, { type: 'SetStructuralProps', structuralId: m.structures[0].id, ...camposDaEstrutura(s.propriedades as PropriedadesDeEstrutura) } as Command);
        expect(assinaturaDoTipo(s.propriedades)).toBe(assinaturaDoTipo({ ...s.propriedades, familia: 'ESTRUTURA' }));
        expect(r.model.structures[0].larguraMm).toBe(s.propriedades.larguraMm);
      }
      if (s.propriedades.familia === 'TERMINAL') {
        const r = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais![0].id, ...camposDoTerminal(s.propriedades as PropriedadesDeTerminal) } as Command);
        expect(r.model.terminais![0].cotaMm).toBe(s.propriedades.cotaMm);
      }
    }
  });

  it('faltamSementes ignora maiúsculas; usos por assinatura contam as peças iguais; agrupa por família; nome duplicado na família é recusado', () => {
    const [pilar1430, pilar1940] = SEMENTES_DE_TIPOS;
    const tipos = [tipo('a', pilar1430, { nome: 'PILAR 14×30' }), tipo('b', pilar1940, { active: false })];
    const faltam = faltamSementes(tipos);
    expect(faltam.map((s) => s.nome)).not.toContain('Pilar 14×30');
    expect(faltam.map((s) => s.nome)).not.toContain('Pilar 19×40');
    expect(faltam).toHaveLength(SEMENTES_DE_TIPOS.length - 2);
    // Dois pilares 14×30 e um 19×40 no desenho.
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m.levels[0].id;
    m = applyBatch(m, [
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(0, 0)], larguraMm: 140, profundidadeMm: 300, alturaMm: 2800, baseMm: 0 } as Command,
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(3000, 0)], larguraMm: 140, profundidadeMm: 300, alturaMm: 2800, baseMm: 0 } as Command,
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(6000, 0)], larguraMm: 190, profundidadeMm: 400, alturaMm: 2800, baseMm: 0 } as Command,
    ]).model;
    const usos = usosPorAssinatura(m);
    expect(usosDoTipo(tipos[0], usos)).toBe(2);
    expect(usosDoTipo(tipos[1], usos)).toBe(1);
    expect(usosDoTipo(tipo('c', SEMENTES_DE_TIPOS.find((s) => s.nome === 'Viga 14×40')!), usos)).toBe(0);
    const grupos = agruparPorFamilia([...tipos, tipo('d', SEMENTES_DE_TIPOS.find((s) => s.nome === 'Luz de teto 100 VA')!)]);
    expect(grupos.map((g) => g.familia)).toEqual(['ESTRUTURA', 'TERMINAL']);
    expect(grupos[0].tipos.map((x) => x.nome)).toEqual(['PILAR 14×30', 'Pilar 19×40']);
    expect(validarNomeDeTipo('pilar 19×40', tipos, 'ESTRUTURA', 'a')).toMatch(/Já existe/);
    expect(validarNomeDeTipo('Pilar 19×40', tipos, 'ESTRUTURA', 'b')).toBeNull(); // o próprio
    expect(validarNomeDeTipo('Pilar 19×40', tipos, 'TERMINAL', null)).toBeNull(); // outra família
    expect(validarNomeDeTipo('x', tipos, 'ESTRUTURA', null)).toMatch(/2 caracteres/);
    expect(paraCopiar(tipos)).toEqual([{ nome: 'PILAR 14×30', propriedades: pilar1430.propriedades }]);
  });
});
