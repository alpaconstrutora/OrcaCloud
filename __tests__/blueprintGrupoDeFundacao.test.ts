/**
 * GRUPO DE FUNDAÇÃO — bloco + estacas (16/09/2026), ver
 * `utils/blueprintGrupoDeFundacao.ts`.
 *
 * O que se prova: os arranjos de 1 a 12 obedecem aos três critérios (centro de
 * carga, ≥ 3φ, simetria); o bloco envolve o arranjo e reproduz os valores de
 * 1 e 2 estacas; o grupo é derivado por geometria (bloco ↔ estacas ↔ pilar);
 * redistribuir as estacas do bloco é um lote atômico que reaproveita rótulos,
 * recentra, redimensiona e gira o bloco.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, snapshotHash, type Command, type ObjectId } from '../utils/blueprintKernel';
import {
  ARRANJOS_CANONICOS,
  QUANTIDADE_MAXIMA_DE_ESTACAS,
  arranjoDeEstacas,
  dimensoesDoBloco,
  grupoDaSelecao,
  grupoDeFundacao,
  idsDoGrupo,
  nomeDoArranjo,
  planejarEstacasDoBloco,
  posicionarEstacas,
} from '../utils/blueprintGrupoDeFundacao';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('arranjoDeEstacas — os três critérios, de 1 a 12', () => {
  for (let n = 1; n <= QUANTIDADE_MAXIMA_DE_ESTACAS; n++) {
    it(`${n} estaca(s) · ${nomeDoArranjo(n)}: centroide no eixo, ≥ 3φ entre eixos, simétrico`, () => {
      const { offsets, espacamentoMm } = arranjoDeEstacas(n, 300);
      expect(offsets).toHaveLength(n);
      expect(espacamentoMm).toBe(900);
      // 3.1 centro de carga: centroide na origem (o eixo do pilar).
      const cx = offsets.reduce((s, p) => s + p.x, 0) / n;
      const cy = offsets.reduce((s, p) => s + p.y, 0) / n;
      expect(Math.abs(cx)).toBeLessThanOrEqual(1);
      expect(Math.abs(cy)).toBeLessThanOrEqual(1);
      // 3.2 espaçamento: nenhum par mais perto que 3φ (tolerância de arredondamento a mm).
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(dist(offsets[i], offsets[j])).toBeGreaterThanOrEqual(900 - 2);
      // 3.3 simetria: espelhar no eixo do pilar (u → −u) devolve o mesmo
      // conjunto — vale para o triângulo (simetria de 3 eixos, não de 180°) e
      // para todos os outros; de 4 em diante também gira 180°.
      for (const p of offsets) {
        expect(offsets.some((q) => Math.abs(q.x + p.x) <= 1 && Math.abs(q.y - p.y) <= 1)).toBe(true);
        if (n !== 3) expect(offsets.some((q) => Math.abs(q.x + p.x) <= 1 && Math.abs(q.y + p.y) <= 1)).toBe(true);
      }
    });
  }

  it('nomes e o aviso do primo', () => {
    expect(ARRANJOS_CANONICOS.map(nomeDoArranjo)).toEqual(['centro', 'linha', 'triângulo', 'quadrado', 'quadrado com centro', 'retângulo 2 × 3']);
    expect(nomeDoArranjo(7)).toBe('hexágono com centro');
    expect(nomeDoArranjo(10)).toBe('malha 2 × 5');
    expect(nomeDoArranjo(12)).toBe('malha 3 × 4');
    expect(arranjoDeEstacas(11, 300).aviso).toMatch(/em linha/);
    expect(arranjoDeEstacas(4, 300).aviso).toBeNull();
  });

  it('3 é triângulo equilátero de lado 3φ; 5 tem canto–centro = 3φ (lado 3φ√2)', () => {
    const t = arranjoDeEstacas(3, 300).offsets;
    expect(dist(t[0], t[1])).toBeCloseTo(900, -1);
    expect(dist(t[1], t[2])).toBeCloseTo(900, -1);
    expect(dist(t[0], t[2])).toBeCloseTo(900, -1);
    const q = arranjoDeEstacas(5, 300).offsets;
    const centro = q.find((p) => p.x === 0 && p.y === 0)!;
    for (const p of q) if (p !== centro) expect(dist(p, centro)).toBeCloseTo(900, -1);
  });
});

describe('dimensoesDoBloco e posicionarEstacas', () => {
  const pilar19 = { larguraMm: 190, profundidadeMm: 190, circular: false };
  it('1 estaca φ30 sob pilar 19: 60 × 60; 2: 150 × 60; 4: 150 × 150; 3: envolvente do triângulo', () => {
    expect(dimensoesDoBloco(arranjoDeEstacas(1, 300).offsets, 300, pilar19)).toEqual({ larguraMm: 600, profundidadeMm: 600 });
    expect(dimensoesDoBloco(arranjoDeEstacas(2, 300).offsets, 300, pilar19)).toEqual({ larguraMm: 1500, profundidadeMm: 600 });
    expect(dimensoesDoBloco(arranjoDeEstacas(4, 300).offsets, 300, pilar19)).toEqual({ larguraMm: 1500, profundidadeMm: 1500 });
    // Triângulo: ΔU = 900, ΔV = 3R/2 = 779 → 1500 × arred5(779 + 600) = 1400.
    expect(dimensoesDoBloco(arranjoDeEstacas(3, 300).offsets, 300, pilar19)).toEqual({ larguraMm: 1500, profundidadeMm: 1400 });
  });
  it('o pilar manda quando é maior que o arranjo (40 × 14, φ25): 60 × 55', () => {
    expect(dimensoesDoBloco([{ x: 0, y: 0 }], 250, { larguraMm: 400, profundidadeMm: 140, circular: false })).toEqual({ larguraMm: 600, profundidadeMm: 550 });
  });
  it('posicionar gira com o pilar: 2 estacas a 90° alongam em y', () => {
    expect(posicionarEstacas({ x: 1000, y: 2000 }, 90, arranjoDeEstacas(2, 300).offsets)).toEqual([
      { x: 1000, y: 1550 },
      { x: 1000, y: 2450 },
    ]);
  });
});

// ─── O grupo derivado ───────────────────────────────────────────────────────

function cena() {
  const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
  const t = nivel.model.levels[0].id;
  const m = applyBatch(nivel.model, [
    { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [{ x: 1000, y: 1000 }], larguraMm: 190, profundidadeMm: 190, alturaMm: 3300, baseMm: -500, rotulo: 'P1' },
    { type: 'AddStructural', levelId: t, kind: 'BLOCO_COROAMENTO', pontos: [{ x: 1000, y: 1000 }], larguraMm: 600, profundidadeMm: 600, alturaMm: 600, baseMm: -1100, rotulo: 'B1' },
    { type: 'AddStructural', levelId: t, kind: 'ESTACA', pontos: [{ x: 1000, y: 1000 }], larguraMm: 300, profundidadeMm: 300, alturaMm: 8000, baseMm: -9100, circular: true, rotulo: 'E1' },
    // Estaca órfã, longe de qualquer bloco.
    { type: 'AddStructural', levelId: t, kind: 'ESTACA', pontos: [{ x: 9000, y: 9000 }], larguraMm: 300, profundidadeMm: 300, alturaMm: 8000, baseMm: -9100, circular: true, rotulo: 'E7' },
  ] as Command[]).model;
  const id = (r: string) => m.structures.find((s) => s.rotulo === r)!.id;
  return { m, t, pilar: id('P1'), bloco: id('B1'), estaca: id('E1'), orfa: id('E7') };
}

describe('grupoDeFundacao — bloco ↔ estacas ↔ pilar por geometria', () => {
  it('pelo bloco ou pela estaca chega-se ao mesmo grupo; a órfã não tem grupo', () => {
    const { m, pilar, bloco, estaca, orfa } = cena();
    const g = grupoDeFundacao(m, bloco)!;
    expect(g.bloco.id).toBe(bloco);
    expect(g.estacas.map((e) => e.id)).toEqual([estaca]);
    expect(g.pilar?.id).toBe(pilar);
    expect(idsDoGrupo(m, estaca)).toEqual([bloco, estaca]);
    expect(idsDoGrupo(m, orfa)).toBeNull();
    expect(idsDoGrupo(m, pilar)).toBeNull();
  });

  it('grupoDaSelecao só quando o conjunto É o grupo', () => {
    const { m, bloco, estaca, orfa } = cena();
    expect(grupoDaSelecao(m, [bloco, estaca])?.bloco.id).toBe(bloco);
    expect(grupoDaSelecao(m, [estaca, bloco])?.bloco.id).toBe(bloco);
    expect(grupoDaSelecao(m, [bloco])).toBeNull();
    expect(grupoDaSelecao(m, [bloco, estaca, orfa])).toBeNull();
    expect(grupoDaSelecao(m, [])).toBeNull();
  });
});

describe('planejarEstacasDoBloco — redistribuir num lote', () => {
  it('1 → 3: apaga E1, cria E1 (reaproveitado), E8, E9 em triângulo no eixo do pilar; bloco 150 × 140; base das estacas = base do bloco − comprimento', () => {
    const { m, bloco, estaca } = cena();
    const plano = planejarEstacasDoBloco(m, bloco, { quantidade: 3 });
    expect(plano.motivo).toBeNull();
    expect(plano.removidas).toEqual([estaca]);
    expect(plano.previstas.map((p) => p.rotulo)).toEqual(['E1', 'E8', 'E9']);
    expect(plano.nomeDoArranjo).toBe('triângulo');
    expect(plano.bloco).toEqual({ larguraMm: 1500, profundidadeMm: 1400, rotacaoDeg: 0 });
    const r = applyBatch(m, plano.comandos).model;
    const estacas = r.structures.filter((s) => s.kind === 'ESTACA' && s.rotulo !== 'E7');
    expect(estacas).toHaveLength(3);
    // Centroide no pilar (1000, 1000).
    expect(Math.round(estacas.reduce((s, e) => s + e.pontos[0].x, 0) / 3)).toBe(1000);
    expect(Math.round(estacas.reduce((s, e) => s + e.pontos[0].y, 0) / 3)).toBe(1000);
    for (const e of estacas) expect(e).toMatchObject({ circular: true, larguraMm: 300, alturaMm: 8000, baseMm: -9100 });
    const b = r.structures.find((s) => s.id === bloco)!;
    expect(b).toMatchObject({ larguraMm: 1500, profundidadeMm: 1400 });
    // O grupo continua íntegro depois: as três estão dentro do bloco.
    expect(grupoDeFundacao(r, bloco)!.estacas).toHaveLength(3);
    expect(grupoDaSelecao(r, [bloco, ...estacas.map((e) => e.id)])).not.toBeNull();
  });

  it('Ø e comprimento novos entram; 3 → 1 volta ao bloco de 60 × 60', () => {
    const { m, bloco } = cena();
    const tres = applyBatch(m, planejarEstacasDoBloco(m, bloco, { quantidade: 3, diametroMm: 400, comprimentoMm: 10000 }).comandos).model;
    const e = tres.structures.filter((s) => s.kind === 'ESTACA' && s.rotulo !== 'E7');
    expect(e.every((x) => x.larguraMm === 400 && x.alturaMm === 10000 && x.baseMm === -11100)).toBe(true);
    const uma = applyBatch(tres, planejarEstacasDoBloco(tres, bloco, { quantidade: 1 }).comandos).model;
    expect(uma.structures.filter((s) => s.kind === 'ESTACA' && s.rotulo !== 'E7')).toHaveLength(1);
    // Herda o Ø 40 das atuais: bloco max(400 + 300, 190 + 200) = 700.
    expect(uma.structures.find((s) => s.id === bloco)).toMatchObject({ larguraMm: 700, profundidadeMm: 700 });
  });

  it('bloco desenhado fora do eixo é recentrado no pilar; pilar girado gira o bloco e o arranjo', () => {
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const m = applyBatch(nivel.model, [
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [{ x: 1000, y: 1000 }], larguraMm: 400, profundidadeMm: 190, alturaMm: 2800, rotacaoDeg: 90, rotulo: 'P1' },
      { type: 'AddStructural', levelId: t, kind: 'BLOCO_COROAMENTO', pontos: [{ x: 1100, y: 1050 }], larguraMm: 800, profundidadeMm: 800, alturaMm: 600, baseMm: -1100, rotulo: 'B1' },
    ] as Command[]).model;
    const bloco = m.structures.find((s) => s.rotulo === 'B1')!.id;
    const plano = planejarEstacasDoBloco(m, bloco, { quantidade: 2 });
    expect(plano.comandos.some((c) => c.type === 'MoveStructuralVertex')).toBe(true);
    const r = applyBatch(m, plano.comandos).model;
    const b = r.structures.find((s) => s.id === bloco)!;
    expect(b.pontos[0]).toEqual({ x: 1000, y: 1000 });
    expect(b).toMatchObject({ larguraMm: 1500, profundidadeMm: 600, rotacaoDeg: 90 });
    const e = r.structures.filter((s) => s.kind === 'ESTACA').map((s) => s.pontos[0]);
    expect(e).toEqual([{ x: 1000, y: 550 }, { x: 1000, y: 1450 }]);
  });

  it('sem pilar usa o centro do bloco; bloco inexistente dá motivo; lote atômico', () => {
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const m = applyCommand(nivel.model, { type: 'AddStructural', levelId: t, kind: 'BLOCO_COROAMENTO', pontos: [{ x: 500, y: 500 }], larguraMm: 600, profundidadeMm: 600, alturaMm: 600, baseMm: -1100 }).model;
    const bloco = m.structures[0].id;
    const plano = planejarEstacasDoBloco(m, bloco, { quantidade: 4 });
    const r = applyBatch(m, plano.comandos).model;
    const e = r.structures.filter((s) => s.kind === 'ESTACA');
    expect(e).toHaveLength(4);
    expect(e.reduce((s, x) => s + x.pontos[0].x, 0) / 4).toBe(500);
    expect(planejarEstacasDoBloco(m, 'str_nope' as ObjectId, { quantidade: 2 }).motivo).toBe('bloco não encontrado');
    const antes = snapshotHash(m);
    expect(() => applyBatch(m, [...plano.comandos, { type: 'DeleteStructural', structuralId: 'str_nope' }])).toThrow();
    expect(snapshotHash(m)).toBe(antes);
  });
});
