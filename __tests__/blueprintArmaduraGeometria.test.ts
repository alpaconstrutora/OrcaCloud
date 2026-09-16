/**
 * ARMADURA DESENHADA (16/09/2026) — ver `utils/blueprintArmaduraGeometria.ts`.
 *
 * O que se prova: as barras ficam DENTRO da seção (cobrimento), no número do
 * esquema, ao longo da peça inteira; estribos/malha no espaçamento; a malha da
 * laje é recortada ao contorno; a estaca arma só o trecho armado (+ arranque);
 * a distribuição na seção é simétrica e a mesma do SVG.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, computeQuantities, emptyModel, POLITICA_PADRAO, type Command, type Structural } from '../utils/blueprintKernel';
import { HIPOTESES_ARMADURA_PADRAO, armaduraDaPeca, armaduraDoModelo } from '../utils/blueprintArmadura';
import {
  posicoesNaLinha,
  posicoesNoCirculo,
  posicoesNoRetangulo,
  recortarAoPoligono,
  segmentosDaArmadura,
  segmentosDaArmaduraDoModelo,
} from '../utils/blueprintArmaduraGeometria';

const H = { ...HIPOTESES_ARMADURA_PADRAO, perdaPct: 0 };
const peca = (over: Partial<Structural>): Structural => ({
  id: 'str_1', uid: 'u1', levelId: 'lvl', kind: 'PILAR', pontos: [{ x: 1000, y: 2000 }],
  larguraMm: 190, profundidadeMm: 190, alturaMm: 2800, baseMm: 0, circular: false, rotacaoDeg: 0, rotulo: 'P1', ...over,
});
const quantDe = (s: Structural) => ({ comprimentoM: s.kind === 'VIGA' ? 6 : s.alturaMm / 1000, areaPlantaM2: s.kind === 'LAJE' ? 12 : 0, volumeConcretoM3: 0.5 });

describe('distribuição na seção', () => {
  it('retângulo: 4 nos cantos; 8 → um no meio de cada lado; simétrico; círculo: n igualmente espaçadas; linha: extremos ocupados', () => {
    expect(posicoesNoRetangulo(4, 100, 60)).toEqual([{ x: -50, y: -30 }, { x: 50, y: -30 }, { x: 50, y: 30 }, { x: -50, y: 30 }]);
    const oito = posicoesNoRetangulo(8, 100, 60);
    expect(oito).toHaveLength(8);
    for (const p of oito) expect(oito.some((q) => q.x === -p.x && q.y === -p.y)).toBe(true);
    expect(oito.filter((p) => p.y === -30)).toHaveLength(3);
    const seis = posicoesNoRetangulo(6, 200, 60);
    // Lado maior (200) recebe a sobra: 3 embaixo, 3 em cima.
    expect(seis.filter((p) => p.y === -30)).toHaveLength(3);
    expect(posicoesNoCirculo(6, 100)).toHaveLength(6);
    expect(posicoesNoCirculo(4, 100)[0]).toEqual({ x: 100, y: 0 });
    expect(posicoesNaLinha(3, 50)).toEqual([-50, 0, 50]);
    expect(posicoesNaLinha(1, 50)).toEqual([0]);
  });
});

describe('segmentosDaArmadura — pilar', () => {
  it('4 barras verticais dentro do cobrimento, do pé ao topo; estribos retangulares a cada 15 cm', () => {
    const s = peca({});
    const a = armaduraDaPeca(s, quantDe(s), H);
    const segs = segmentosDaArmadura(s, a, H, 0);
    const barras = segs.filter((g) => g.papel === 'longitudinal');
    expect(barras).toHaveLength(4);
    for (const b of barras) {
      expect(b.a.z).toBe(0);
      expect(b.b.z).toBe(2800);
      // Dentro da seção 190 × 190 centrada em (1000, 2000), com cobrimento 30 + estribo 5 + Ø/2.
      expect(Math.abs(b.a.x - 1000)).toBeLessThanOrEqual(95 - 30);
      expect(Math.abs(b.a.y - 2000)).toBeLessThanOrEqual(95 - 30);
    }
    const estribos = segs.filter((g) => g.papel === 'estribo');
    expect(estribos.length % 4).toBe(0);
    const cotas = [...new Set(estribos.map((g) => g.a.z))].sort((p, q) => p - q);
    expect(cotas[0]).toBe(50);
    expect(cotas[1] - cotas[0]).toBe(150);
    expect(cotas[cotas.length - 1]).toBeLessThanOrEqual(2750);
  });
  it('pilar girado 90° e com elevação do pavimento: as barras seguem a rotação e a cota', () => {
    const s = peca({ larguraMm: 400, profundidadeMm: 140, rotacaoDeg: 90 });
    const a = armaduraDaPeca(s, quantDe(s), H);
    const barras = segmentosDaArmadura(s, a, H, 3000).filter((g) => g.papel === 'longitudinal');
    // Lado de 400 está em y (girado): a extensão em y é maior que em x.
    const dx = Math.max(...barras.map((b) => b.a.x)) - Math.min(...barras.map((b) => b.a.x));
    const dy = Math.max(...barras.map((b) => b.a.y)) - Math.min(...barras.map((b) => b.a.y));
    expect(dy).toBeGreaterThan(dx);
    expect(barras[0].a.z).toBe(3000);
  });
});

describe('segmentosDaArmadura — viga, laje, bloco, estaca', () => {
  it('viga: barras inferiores e superiores de ponta a ponta nas cotas certas; estribos ao longo do eixo', () => {
    const s = peca({ kind: 'VIGA', pontos: [{ x: 0, y: 0 }, { x: 6000, y: 0 }], larguraMm: 150, alturaMm: 400, baseMm: 2400 });
    const a = armaduraDaPeca(s, quantDe(s), H);
    const segs = segmentosDaArmadura(s, a, H, 0);
    const inf = segs.filter((g) => g.papel === 'longitudinal');
    const sup = segs.filter((g) => g.papel === 'superior');
    expect(inf).toHaveLength(2);
    expect(sup).toHaveLength(2);
    for (const b of inf) {
      expect(b.a.x).toBe(0);
      expect(b.b.x).toBe(6000);
      expect(b.a.z).toBe(2400 + 30 + 5 + 5);
      expect(Math.abs(b.a.y)).toBeLessThanOrEqual(75 - 30);
    }
    expect(sup[0].a.z).toBe(2800 - 30 - 5 - 5);
    const est = segs.filter((g) => g.papel === 'estribo');
    const xs = [...new Set(est.map((g) => g.a.x))].sort((p, q) => p - q);
    expect(xs[0]).toBe(50);
    expect(xs[1] - xs[0]).toBe(210);
  });
  it('laje em L: a malha é recortada ao contorno (nenhum segmento fora)', () => {
    const anel = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 2000 }, { x: 2000, y: 2000 }, { x: 2000, y: 4000 }, { x: 0, y: 4000 }];
    const s = peca({ kind: 'LAJE', pontos: anel, alturaMm: 100, baseMm: 2800 });
    const a = armaduraDaPeca(s, { ...quantDe(s), areaPlantaM2: 12 }, H);
    const segs = segmentosDaArmadura(s, a, H, 0);
    expect(segs.length).toBeGreaterThan(0);
    for (const g of segs) {
      expect(g.papel).toBe('malha');
      const meio = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 };
      // O canto vazio do L (x > 2000, y > 2000) não recebe barra.
      expect(meio.x > 2000 && meio.y > 2000).toBe(false);
    }
    // A linha y = 3000 (no braço vertical) vai só até x = 2000.
    const y3000 = segs.filter((g) => g.a.y === g.b.y && Math.abs(g.a.y - 3000) <= 100);
    expect(y3000.length).toBeGreaterThan(0);
    expect(Math.max(...y3000.map((g) => Math.max(g.a.x, g.b.x)))).toBeLessThanOrEqual(2000);
    expect(recortarAoPoligono({ x: -1, y: 3000 }, { x: 4001, y: 3000 }, anel)).toHaveLength(1);
  });
  it('bloco: malha nas duas direções perto da base e estribos verticais; estaca: barras só no trecho armado + arranque, espiral contínua', () => {
    const b = peca({ kind: 'BLOCO_COROAMENTO', larguraMm: 600, profundidadeMm: 600, alturaMm: 600, baseMm: -1100 });
    const ab = armaduraDaPeca(b, quantDe(b), H);
    const sb = segmentosDaArmadura(b, ab, H, 0);
    expect(sb.filter((g) => g.papel === 'malha')).toHaveLength(10);
    expect(sb.filter((g) => g.papel === 'malha').every((g) => g.a.z > -1100 && g.a.z < -1100 + 100)).toBe(true);
    expect(sb.filter((g) => g.papel === 'estribo').length).toBeGreaterThan(0);

    const e = peca({ kind: 'ESTACA', circular: true, larguraMm: 300, profundidadeMm: 300, alturaMm: 8000, baseMm: -9100 });
    const ae = armaduraDaPeca(e, quantDe(e), H);
    const se = segmentosDaArmadura(e, ae, H, 0);
    const barras = se.filter((g) => g.papel === 'longitudinal');
    expect(barras).toHaveLength(6);
    // Topo da estaca em −1100; trecho armado 6 m → de −7100 até −1100 + 400 (arranque 40 Ø).
    expect(barras[0].a.z).toBe(-7100);
    expect(barras[0].b.z).toBe(-700);
    const esp = se.filter((g) => g.papel === 'espiral');
    expect(esp.length).toBeGreaterThan(24 * 20);
    expect(Math.min(...esp.map((g) => g.a.z))).toBeGreaterThanOrEqual(-7100);
    expect(Math.max(...esp.map((g) => g.b.z))).toBeLessThanOrEqual(-1100 + 1e-6);
  });
});

describe('segmentosDaArmaduraDoModelo', () => {
  it('soma a elevação do pavimento, respeita o filtro e ignora peça sem esquema', () => {
    const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Superior', elevationMm: 3000, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const m = applyBatch(nivel.model, [
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [{ x: 0, y: 0 }], larguraMm: 190, profundidadeMm: 190, alturaMm: 2800, rotulo: 'P1' },
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [{ x: 5000, y: 0 }], larguraMm: 190, profundidadeMm: 190, alturaMm: 2800, rotulo: 'P2' },
    ] as Command[]).model;
    const arm = armaduraDoModelo(m, computeQuantities(m, POLITICA_PADRAO), H);
    const todos = segmentosDaArmaduraDoModelo(m, arm.pecas, H);
    expect(todos.filter((g) => g.papel === 'longitudinal')).toHaveLength(8);
    expect(todos[0].a.z).toBe(3000);
    const soP1 = segmentosDaArmaduraDoModelo(m, arm.pecas, H, (s) => s.rotulo === 'P1');
    expect(soP1.filter((g) => g.papel === 'longitudinal')).toHaveLength(4);
  });
});
