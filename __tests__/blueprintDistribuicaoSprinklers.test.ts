/**
 * INCÊNDIO E5.3 (01/10/2026): a distribuição automática de sprinklers num
 * ambiente — cobertura, espaçamentos dentro da norma (CONFERIR), alternativas
 * com contagem e comprimento, viga e o lote de comandos.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, contornoEmPlanta, emptyModel, point, pointInPolygon, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { HIPOTESES_SPRINKLERS_PADRAO as HS, criterioDeSprinklers, type RiscoDeSprinkler } from '../utils/blueprintSprinklersIncendio';
import { ESPACAMENTO_MAXIMO_MM, comandosDaDistribuicao, distribuirSprinklers, type AlternativaDeDistribuicao } from '../utils/blueprintDistribuicaoSprinklers';

function sala(contorno: Point[], extra: Command[] = []): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  m = applyBatch(m, contorno.map((a, i) => ({ type: 'AddWall', levelId: l, a, b: contorno[(i + 1) % contorno.length], thicknessMm: 150, heightMm: 2800 }) as Command)).model;
  if (extra.length) m = applyBatch(m, extra.map((c) => ({ ...c, levelId: l }) as Command)).model;
  return m;
}
const retangulo = (w: number, h: number) => [point(0, 0), point(w, 0), point(w, h), point(0, h)];
const EM_L = [point(0, 0), point(30000, 0), point(30000, 10000), point(6000, 10000), point(6000, 30000), point(0, 30000)];
const crit = (risco: RiscoDeSprinkler) => criterioDeSprinklers({ ...HS, risco }, null);

/** Toda amostra do ambiente (a cada 25 cm) tem um sprinkler a até `alcance` mm. */
function maiorDistancia(ring: Point[], pontos: Point[]): number {
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  let pior = 0;
  for (let x = Math.min(...xs) + 1; x < Math.max(...xs); x += 250) {
    for (let y = Math.min(...ys) + 1; y < Math.max(...ys); y += 250) {
      if (!pointInPolygon(ring, { x, y })) continue;
      pior = Math.max(pior, Math.min(...pontos.map((p) => Math.hypot(p.x - x, p.y - y))));
    }
  }
  return pior;
}

describe('E5.3 · a distribuição num retângulo', () => {
  it('⚠️ PRONTO QUANDO: risco leve, 12 × 8 m — 6 sprinklers a 4 × 4 m, cobertura total e 2+ alternativas com contagem e comprimento', () => {
    const m = sala(retangulo(12000, 8000));
    const p = distribuirSprinklers(m, m.spaces[0].id, crit('LEVE'), HS);
    expect(p.motivo).toBeNull();
    expect(p.alternativas.length).toBeGreaterThanOrEqual(2);
    for (const a of p.alternativas) {
      expect(a.contagem).toBe(6);
      expect(a.areaPorSprinklerM2).toBeLessThanOrEqual(20.9 + 1e-9);
      expect(Math.max(a.espacamentoNoRamalMm, a.espacamentoEntreRamaisMm)).toBeLessThanOrEqual(ESPACAMENTO_MAXIMO_MM.LEVE);
      // No centro de células de 4 × 4 m, nenhum ponto da sala fica a mais de meia diagonal (2,83 m).
      expect(maiorDistancia(m.spaces[0].ring, a.pontos)).toBeLessThanOrEqual(Math.hypot(2000, 2000) + 1);
    }
    // Ramais em y: 3 ramais de 4 m (12 m); em x: 2 de 8 m (16 m) — a mais curta vem primeiro.
    expect(p.alternativas.map((a) => [a.sentido, a.comprimentoDosRamaisM])).toEqual([
      ['Y', 12],
      ['X', 16],
    ]);
    // O defletor fica 150 mm abaixo do teto (pé-direito 2800).
    expect(p.cotaMm).toBe(2650);
  });

  it('ordinário: 12,1 m² por sprinkler — ramais em x dão 9 ou 12; em y, 4 × 3 m dá 8 e vem primeiro', () => {
    const m = sala(retangulo(12000, 8000));
    const p = distribuirSprinklers(m, m.spaces[0].id, crit('ORDINARIO_1'), HS);
    const x = (k: string) => p.alternativas.find((a) => a.chave === k)!;
    expect(x('X|MAXIMO').contagem).toBe(9); // 3 × 3: 4,0 × 2,67 m = 10,7 m²
    expect(x('X|MAXIMO').areaPorSprinklerM2).toBeCloseTo(4 * (8 / 3), 6);
    expect(x('X|QUADRADO').contagem).toBe(12); // 4 × 3: lado ≤ √12,1 = 3,48 m
    // Ramais em y (8 m): 2 por ramal a 4 m; entre ramais 12 ÷ 4 = 3 m → 4 × 3 = 12 m² ≤ 12,1.
    expect(x('Y|MAXIMO').contagem).toBe(8);
    for (const a of p.alternativas) expect(a.areaPorSprinklerM2).toBeLessThanOrEqual(12.1 + 1e-9);
    expect(p.alternativas[0].chave).toBe('Y|MAXIMO');
  });

  it('o extraordinário usa 3,7 m de espaçamento máximo', () => {
    const m = sala(retangulo(12000, 8000));
    const p = distribuirSprinklers(m, m.spaces[0].id, crit('EXTRA_1'), HS);
    for (const a of p.alternativas) expect(Math.max(a.espacamentoNoRamalMm, a.espacamentoEntreRamaisMm)).toBeLessThanOrEqual(3700);
  });
});

describe('E5.3 · salão em L, viga e o lote', () => {
  it('no L, todo ponto fica coberto (o canto interno não perde sprinkler) e nenhum sprinkler cai fora', () => {
    const m = sala(EM_L);
    const p = distribuirSprinklers(m, m.spaces[0].id, crit('LEVE'), HS);
    for (const a of p.alternativas) {
      expect(a.pontos.every((q) => pointInPolygon(EM_L, q))).toBe(true);
      expect(a.contagem).toBeGreaterThanOrEqual(Math.ceil(420 / 20.9));
      expect(maiorDistancia(EM_L, a.pontos)).toBeLessThanOrEqual(Math.hypot(a.espacamentoNoRamalMm, a.espacamentoEntreRamaisMm));
    }
  });

  it('sprinkler sob a viga anda através do ramal até sair dela', () => {
    const viga = { type: 'AddStructural', kind: 'VIGA', pontos: [point(0, 2000), point(12000, 2000)], larguraMm: 200, profundidadeMm: 500, alturaMm: 500 } as unknown as Command;
    const m = sala(retangulo(12000, 8000), [viga]);
    const contorno = contornoEmPlanta(m.structures.find((s) => s.kind === 'VIGA')!);
    const p = distribuirSprinklers(m, m.spaces[0].id, crit('LEVE'), HS);
    const x = p.alternativas.find((a) => a.sentido === 'X')!;
    expect(x.deslocadosPorViga).toBe(3);
    expect(x.pontos.some((q) => pointInPolygon(contorno, q))).toBe(false);
  });

  it('confirmar é um lote: um sprinkler por ponto, na cota do plano, com o K escolhido', () => {
    const m = sala(retangulo(12000, 8000));
    const p = distribuirSprinklers(m, m.spaces[0].id, crit('LEVE'), { ...HS, distanciaAoTetoMm: 300 });
    const alt: AlternativaDeDistribuicao = p.alternativas[0];
    const depois = applyBatch(m, comandosDaDistribuicao(p, alt, 80)).model;
    const spk = depois.terminais!.filter((t) => t.tipoHidraulico === 'SPRINKLER');
    expect(spk).toHaveLength(alt.contagem);
    expect(spk.every((t) => t.cotaMm === 2500 && t.fatorK === 80 && t.disciplina === 'INCENDIO')).toBe(true);
  });

  it('sem risco, diz por quê', () => {
    const m = sala(retangulo(12000, 8000));
    expect(distribuirSprinklers(m, m.spaces[0].id, criterioDeSprinklers(HS, null), HS).motivo).toMatch(/sem o risco/);
  });
});
