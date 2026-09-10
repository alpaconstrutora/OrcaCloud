/**
 * O MÍNIMO de tomadas pela NBR 5410, 9.5.2.2.1 — fatia 2 (10/09/2026).
 *
 * *"também queria a distribuição automática"* — e a distribuição automática
 * de verdade é a que sabe QUANTAS a norma pede. Esta suíte fixa a tabela da
 * norma, a contagem do que já existe e a regra de que só o DÉFICIT vira
 * sugestão.
 *
 * ─── ⚠️ OS CASOS QUE UMA CONTA INGÊNUA ERRA ─────────────────────────────────
 *
 * · "ou fração" é TETO: 14,2 m ÷ 5 = 2,84 → 3, não 2;
 * · cozinha com 4 baixas ATENDE a contagem e ainda deve 2 sobre a bancada;
 * · ponto SEM tipo dentro do ambiente não conta — e é dito, não engolido;
 * · o mínimo nunca vira "remova 2".
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import {
  COTA_TOMADA_MEDIA_MM,
  COTA_TOMADA_SUGERIDA_MM,
  comandosParaCompletar,
  conferirTomadas,
  distribuirAoLongo,
  ladosDePiso,
  minimoDeTomadas,
  perimetroInternoM,
} from '../utils/blueprintDistribuicao';

describe('9.5.2.2.1 · a tabela', () => {
  it('sala/dormitório: 1 a cada 5 m OU FRAÇÃO — 14,2 m dá 3', () => {
    expect(minimoDeTomadas('SALA_DORMITORIO', 14.2, 12).minimo).toBe(3);
    expect(minimoDeTomadas('SALA_DORMITORIO', 15, 14).minimo).toBe(3);
    expect(minimoDeTomadas('SALA_DORMITORIO', 15.01, 14).minimo).toBe(4);
  });

  it('cozinha/serviço: 1 a cada 3,5 m, e 2 na altura média (bancada)', () => {
    const c = minimoDeTomadas('COZINHA_SERVICO', 12, 9);
    expect(c.minimo).toBe(4); // 12 ÷ 3,5 = 3,43 → 4
    expect(c.medias).toBe(2);
    expect(c.ondeAMedia).toMatch(/bancada/);
  });

  it('⚠️ cozinha minúscula: o mínimo nunca é menor que as 2 da bancada', () => {
    expect(minimoDeTomadas('COZINHA_SERVICO', 3, 0.5).minimo).toBe(2);
  });

  it('banheiro: 1, junto ao lavatório, na altura média', () => {
    const b = minimoDeTomadas('BANHEIRO', 8, 4);
    expect(b).toMatchObject({ minimo: 1, medias: 1 });
    expect(b.ondeAMedia).toMatch(/lavatório/);
  });

  it('varanda: pelo menos 1, sem altura média', () => {
    expect(minimoDeTomadas('VARANDA', 20, 15)).toMatchObject({ minimo: 1, medias: 0 });
  });

  it('demais: área ≤ 6 m² → 1; acima, 1 a cada 5 m', () => {
    expect(minimoDeTomadas('OUTRO', 6, 2).minimo).toBe(1);
    expect(minimoDeTomadas('OUTRO', 9.8, 6).minimo).toBe(1);
    expect(minimoDeTomadas('OUTRO', 12, 8).minimo).toBe(3);
  });

  it('a regra vem escrita, com o perímetro em vírgula', () => {
    expect(minimoDeTomadas('SALA_DORMITORIO', 14.2, 12).regra).toBe('1 a cada 5 m de 14,2 m');
  });
});

/** Uma sala de 6 × 4 m (eixo), paredes de 150 → interno 5,85 × 3,85. */
function sala(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId: t,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: 150,
    heightMm: 2800,
  });
  return applyBatch(base, [p(0, 0, 6000, 0), p(6000, 0, 6000, 4000), p(6000, 4000, 0, 4000), p(0, 4000, 0, 0)])
    .model;
}

const tomada = (m: BlueprintModel, x: number, y: number, cota = 300, tipoEletrico: 'TUG' | 'TUE' | null = 'TUG') =>
  applyCommand(m, {
    type: 'AddTerminal',
    levelId: m.levels[0].id,
    disciplina: 'ELETRICA',
    tipo: 'TUG',
    at: point(x, y),
    cotaMm: cota,
    tipoEletrico,
  }).model;

describe('conferir · o perímetro e a contagem', () => {
  it('⚠️ o perímetro é o INTERNO, pelas faces — não o de eixo', () => {
    const m = sala();
    // Eixo: 20 m. Interno: 2 × (5,85 + 3,85) = 19,4 m.
    expect(perimetroInternoM(m.spaces[0], m.walls)).toBeCloseTo(19.4, 6);
    expect(m.spaces[0].perimeterMm / 1000).toBe(20);
  });

  it('sem tipo, não há o que conferir', () => {
    const m = sala();
    expect(conferirTomadas(m.spaces[0], null, m.walls, m.terminais, 22.5)).toBeNull();
  });

  it('sala de 19,4 m: mínimo 4; com 2 tomadas dentro, faltam 2', () => {
    let m = sala();
    m = tomada(m, 1000, 75);
    m = tomada(m, 3000, 75);
    const c = conferirTomadas(m.spaces[0], 'SALA_DORMITORIO', m.walls, m.terminais, 22.5)!;
    expect(c.minimo).toBe(4);
    expect(c.existentes).toBe(2);
    expect(c.deficit).toBe(2);
  });

  it('⚠️ tomada FORA do ambiente não conta; ponto SEM tipo dentro não conta e é dito', () => {
    let m = sala();
    m = tomada(m, 9000, 75); // fora
    m = tomada(m, 2000, 75, 300, null); // dentro, a classificar
    const c = conferirTomadas(m.spaces[0], 'VARANDA', m.walls, m.terminais, 22.5)!;
    expect(c.existentes).toBe(0);
    expect(c.semTipo).toBe(1);
    expect(c.deficit).toBe(1);
  });

  it('⚠️ mais que o mínimo NÃO é déficit negativo — atende, e ponto', () => {
    let m = sala();
    for (const x of [500, 1500, 2500, 3500, 4500, 5500]) m = tomada(m, x, 75);
    const c = conferirTomadas(m.spaces[0], 'SALA_DORMITORIO', m.walls, m.terminais, 22.5)!;
    expect(c.deficit).toBe(0);
    expect(c.existentes).toBe(6);
  });

  it('⚠️ cozinha com 4 BAIXAS atende a contagem e ainda deve 2 sobre a bancada', () => {
    let m = sala();
    for (const x of [1000, 2000, 3000, 4000, 5000, 5500]) m = tomada(m, x, 75);
    const c = conferirTomadas(m.spaces[0], 'COZINHA_SERVICO', m.walls, m.terminais, 22.5)!;
    expect(c.minimo).toBe(6); // 19,4 ÷ 3,5 = 5,54 → 6
    expect(c.deficit).toBe(0);
    expect(c.deficitMedias).toBe(2);
  });

  it('a de altura média conta como média pela MESMA fronteira do símbolo', () => {
    let m = sala();
    m = tomada(m, 1000, 75, 1300);
    m = tomada(m, 2000, 75, 800); // limiar inferior da média
    m = tomada(m, 3000, 75, 1650); // já é alta
    const c = conferirTomadas(m.spaces[0], 'COZINHA_SERVICO', m.walls, m.terminais, 22.5)!;
    expect(c.existentesMedias).toBe(2);
  });
});

describe('completar · só o déficit, como sugeridas', () => {
  it('cria max(déficit, déficit de médias); as médias vêm primeiro, a 1,30 m, com o rótulo', () => {
    let m = sala();
    for (const x of [1000, 2000, 3000, 4000, 5000, 5500]) m = tomada(m, x, 75);
    const c = conferirTomadas(m.spaces[0], 'COZINHA_SERVICO', m.walls, m.terminais, 22.5)!;
    const pontos = distribuirAoLongo(ladosDePiso(m.spaces[0], m.walls), 2, m.walls, m.openings);
    const cmds = comandosParaCompletar(m.levels[0].id, pontos, c);
    expect(cmds).toHaveLength(2);
    for (const cmd of cmds) {
      expect(cmd).toMatchObject({
        type: 'AddTerminal',
        tipoEletrico: 'TUG',
        cotaMm: COTA_TOMADA_MEDIA_MM,
        sugerida: true,
      });
      expect((cmd as { rotulo?: string | null }).rotulo).toMatch(/bancada/);
    }
  });

  it('sala: as sugeridas nascem baixas e sem rótulo', () => {
    let m = sala();
    m = tomada(m, 1000, 75);
    const c = conferirTomadas(m.spaces[0], 'SALA_DORMITORIO', m.walls, m.terminais, 22.5)!;
    const pontos = distribuirAoLongo(ladosDePiso(m.spaces[0], m.walls), c.deficit, m.walls, m.openings);
    const cmds = comandosParaCompletar(m.levels[0].id, pontos, c);
    expect(cmds).toHaveLength(3);
    for (const cmd of cmds) {
      expect(cmd).toMatchObject({ cotaMm: COTA_TOMADA_SUGERIDA_MM, sugerida: true });
      expect((cmd as { rotulo?: string | null }).rotulo ?? null).toBeNull();
    }
  });

  it('⚠️ as sugeridas NÃO caem coladas nas tomadas que já existem', () => {
    let m = sala();
    // Uma tomada bem no meio da face de baixo; a sugerida única deveria cair
    // exatamente ali se ninguém a bloqueasse.
    m = tomada(m, 3000, 75);
    const lados = ladosDePiso(m.spaces[0], m.walls).slice(0, 1);
    const ocupados = m.terminais.map((t) => t.at);
    const [semBloqueio] = distribuirAoLongo(lados, 1, m.walls, m.openings);
    expect(semBloqueio.at.x).toBe(3000);
    const [comBloqueio] = distribuirAoLongo(lados, 1, m.walls, m.openings, 150, ocupados);
    expect(Math.abs(comBloqueio.at.x - 3000)).toBeGreaterThanOrEqual(300);
  });

  it('depois de completar, a conferência ATENDE', () => {
    let m = sala();
    m = tomada(m, 1000, 75);
    const c = conferirTomadas(m.spaces[0], 'SALA_DORMITORIO', m.walls, m.terminais, 22.5)!;
    const pontos = distribuirAoLongo(
      ladosDePiso(m.spaces[0], m.walls),
      c.deficit,
      m.walls,
      m.openings,
      150,
      m.terminais.map((t) => t.at),
    );
    const depois = applyBatch(m, comandosParaCompletar(m.levels[0].id, pontos, c)).model;
    const c2 = conferirTomadas(depois.spaces[0], 'SALA_DORMITORIO', depois.walls, depois.terminais, 22.5)!;
    expect(c2.deficit).toBe(0);
    expect(depois.terminais.filter((t) => t.sugerida)).toHaveLength(3);
  });
});
