/**
 * DIAGRAMA UNIFILAR (15/09/2026): *"implementar diagrama unifilar"*.
 *
 * O que se prova: os ramais saem do quadro de cargas (declarado vence
 * sugerido, e o sugerido é marcado); os condutores seguem a ligação; o
 * traçado sai pelo `Desenhista` com os textos que a prancha tem de ter; a
 * folha do PDF empilha os quadros e encolhe o que não cabe.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { DesenhistaDeProva, PAPEIS, desenharFolhaDoUnifilar, enquadrar, orientar } from '../utils/blueprintExport';
import { HIPOTESES_PADRAO } from '../utils/blueprintEletricaDimensionamento';
import {
  UNIFILAR,
  condutoresDoRamal,
  desenharUnifilar,
  medidasDoUnifilar,
  montarUnifilar,
  rodapeDoUnifilar,
} from '../utils/blueprintUnifilar';

/** QDC 127 V FN com C1 (declarado 2,5 / 16 A, DR) de 3×600 VA e C2 (nada declarado) com uma luz de 160 VA. */
function casa(): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
  });
  let m = applyBatch(base, [p(0, 0, 6000, 0), p(6000, 0, 6000, 4000), p(6000, 4000, 0, 4000), p(0, 4000, 0, 0)]).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(75, 1000), cotaMm: 1600, ligacao: 'FN', tensaoV: 127, alimentadorM: 8 }).model;
  const quadroId = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C1 — TUG Cozinha', tensaoV: 127, secaoMm2: 2.5, disjuntorA: 16, protecaoDR: true }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C2 — Iluminação', tensaoV: 127 }).model;
  const [c1, c2] = m.circuitos.map((c) => c.id);
  const ponto = (x: number, y: number, tipoEletrico: 'TUG' | 'ILUMINACAO_TETO', potenciaW: number, circuitoId: string) => {
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: tipoEletrico, at: point(x, y), cotaMm: 300, tipoEletrico, potenciaW }).model;
    const id = m.terminais[m.terminais.length - 1].id;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: id, circuitoId }).model;
  };
  ponto(2000, 75, 'TUG', 600, c1);
  ponto(3000, 75, 'TUG', 600, c1);
  ponto(4000, 75, 'TUG', 600, c1);
  ponto(3000, 2000, 'ILUMINACAO_TETO', 160, c2);
  return m;
}

describe('montarUnifilar — os ramais saem do quadro de cargas', () => {
  it('um diagrama por quadro; C1 com o declarado (16 A, 2,5, DR); C2 com o sugerido/calculado, marcado', () => {
    const [d] = montarUnifilar(casa(), HIPOTESES_PADRAO);
    expect(d.nome).toBe('QDC');
    expect(d.ligacao).toBe('FN');
    expect(d.tensaoV).toBe(127);
    expect(d.ramais).toHaveLength(2);
    const [c1, c2] = d.ramais;
    expect(c1).toMatchObject({ numero: '1', disjuntorA: 16, disjuntorOrigem: 'DECLARADO', secaoMm2: 2.5, secaoOrigem: 'DECLARADA', dr: true, cargaVA: 1800, pontos: 3 });
    expect(c1.condutores).toBe('2#2,5 + T2,5');
    // C2: 160 VA / 127 V = 1,26 A → seção mínima por uso (iluminação) 1,5; disjuntor sugerido pelo catálogo.
    expect(c2).toMatchObject({ numero: '2', disjuntorOrigem: 'SUGERIDO', secaoMm2: 1.5, secaoOrigem: 'CALCULADA', dr: false, cargaVA: 160 });
    expect(c2.disjuntorA).not.toBeNull();
    expect(c2.condutores).toBe('2#1,5 + T1,5');
    expect(d.comDR).toBe(true);
    expect(d.comSugerido).toBe(true);
    // Entrada: geral e alimentador do pré-dimensionamento; demandada = instalada (sem demanda).
    expect(d.entrada.instaladaVA).toBe(1960);
    expect(d.entrada.demandadaVA).toBe(1960);
    expect(d.entrada.disjuntorGeralA).not.toBeNull();
    expect(d.entrada.alimentadorM).toBe(8);
    expect(d.entrada.condutores).toMatch(/^2#/);
  });

  it('condutores pela ligação: FN e FF = 2 carregados; FFF = 3; sem seção, nada', () => {
    expect(condutoresDoRamal('FN', 2.5)).toBe('2#2,5 + T2,5');
    expect(condutoresDoRamal('FF', 4)).toBe('2#4 + T4');
    expect(condutoresDoRamal('FFF', 6)).toBe('3#6 + T6');
    expect(condutoresDoRamal('FN', null)).toBeNull();
  });

  it('sem quadro, lista vazia; quadro sem circuitos, diagrama sem ramais', () => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    expect(montarUnifilar(base)).toEqual([]);
    const comQuadro = applyCommand(base, { type: 'AddQuadro', levelId: base.levels[0].id, nome: 'Q', at: point(0, 0), cotaMm: 1500 }).model;
    const [d] = montarUnifilar(comQuadro);
    expect(d.ramais).toEqual([]);
    expect(d.comDR).toBe(false);
  });
});

describe('desenharUnifilar — o traçado pelo Desenhista', () => {
  it('escreve título, GERAL, os C1/C2 com In, condutores, DR e carga; a largura cresce um passo por ramal', () => {
    const [dg] = montarUnifilar(casa());
    const d = new DesenhistaDeProva();
    desenharUnifilar(d, dg, 0, 0, 1);
    const textos = d.textos();
    expect(textos.some((t) => t.startsWith('QDC — FN 127 V'))).toBe(true);
    expect(textos.some((t) => /^GERAL \d+ A$/.test(t))).toBe(true);
    expect(textos).toContain('C1');
    expect(textos).toContain('C2');
    expect(textos).toContain('16 A');
    expect(textos).toContain('2#2,5 + T2,5');
    expect(textos).toContain('2#1,5 + T1,5 sug.');
    expect(textos).toContain('DR');
    expect(textos).toContain('1800 VA · 3 pts');
    expect(textos).toContain('160 VA · 1 pt');
    // Barramento: um traço grosso (1,1 mm) do começo ao fim.
    const grosso = d.chamadas.find((c) => c.tipo === 'linha' && (c.args[4] as { espessuraMm: number }).espessuraMm === 1.1);
    expect(grosso).toBeDefined();
    const m = medidasDoUnifilar(dg);
    expect(m.larguraMm).toBe(UNIFILAR.entradaMm + 2 * UNIFILAR.ramalMm + UNIFILAR.fimMm);
    expect(medidasDoUnifilar(dg, 0.5).larguraMm).toBe(m.larguraMm / 2);
  });

  it('o rodapé só cita DR e "sug." quando aparecem', () => {
    const [dg] = montarUnifilar(casa());
    const linhas = rodapeDoUnifilar([dg]);
    expect(linhas.some((l) => l.startsWith('DR:'))).toBe(true);
    expect(linhas.some((l) => l.includes('"sug."'))).toBe(true);
    expect(rodapeDoUnifilar([{ ...dg, comDR: false, comSugerido: false }]).some((l) => l.startsWith('DR:') || l.includes('"sug."'))).toBe(false);
  });

  it('a folha do PDF empilha os quadros com título e carimbo; um quadro largo é encolhido para caber', () => {
    const m = casa();
    const papel = orientar(PAPEIS.find((p) => p.id === 'A4') ?? PAPEIS[0], false);
    const opcoes = { denominador: 50, papel, titulo: 'Casa', revisao: 1, hash: 'p'.repeat(64), data: new Date('2026-09-15T12:00:00Z') };
    const enq = enquadrar(m, 50, papel, false);
    const d = new DesenhistaDeProva();
    desenharFolhaDoUnifilar(d, m, opcoes, enq);
    const textos = d.textos();
    expect(textos).toContain('DIAGRAMA UNIFILAR');
    expect(textos).toContain('C1');
    // 20 circuitos num A4 retrato: a largura natural passa da folha → k < 1, e tudo cabe.
    let largo = m;
    const quadroId = largo.quadros[0].id;
    for (let i = 3; i <= 20; i++) largo = applyCommand(largo, { type: 'AddCircuito', quadroId, nome: `C${i}`, tensaoV: 127 }).model;
    const d2 = new DesenhistaDeProva();
    desenharFolhaDoUnifilar(d2, largo, opcoes, enq);
    const xs = d2.chamadas.filter((c) => c.tipo === 'linha').flatMap((c) => [c.args[0] as number, c.args[2] as number]);
    expect(Math.max(...xs)).toBeLessThanOrEqual(papel.larguraMm);
    expect(d2.textos()).toContain('C20');
  });
});
