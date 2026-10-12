/**
 * F11 do plano `2026-10-11-planta-recursos-video-synaps.md` — GERAR A PLANTA DENTRO DE UM CONTORNO
 * DESENHADO: o contorno em L é usado inteiro (não só o maior retângulo), nenhuma parede sai dele,
 * todo ambiente tem porta, e a aplicação é um lote de 3 comandos (um Ctrl+Z).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, pointInPolygon, type Point } from '../utils/blueprintKernel';
import { comandosDeAplicacao, gerar } from '../utils/blueprintGerador';
import { programaSemente } from '../utils/blueprintPrograma';
import { subtrairBorda } from '../utils/blueprintContorno';

// L de 161 m²: 14 × 9 (126 m²) + ala de 5 × 7 (35 m²) subindo à esquerda.
const L161 = [point(0, 0), point(14000, 0), point(14000, 9000), point(5000, 9000), point(5000, 16000), point(0, 16000)];
const entrada = { programa: programaSemente('APTO_3Q_SUITE'), envelope: L161, direcaoDaFrente: null, rotacaoNorteDeg: null, latitudeGraus: -23.5 };

/** Dentro do contorno OU sobre a borda dele (as externas correm na borda). */
const noContorno = (p: Point) => pointInPolygon(L161, p) || subtrairBorda(point(p.x - 1, p.y), point(p.x + 1, p.y), L161).length === 0 || subtrairBorda(point(p.x, p.y - 1), point(p.x, p.y + 1), L161).length === 0;

describe('gerador dentro do contorno (F11)', () => {
  for (const semente of [1, 2, 3]) {
    it(`L de 161 m² com 3 quartos (semente ${semente}): ≥ 90 % da área em ambientes, nenhuma parede fora, todos com porta e nome`, () => {
      const r = gerar(entrada, semente, { automaticos: false, iteracoes: 120 });
      expect(r.anexos.length).toBeGreaterThanOrEqual(1);
      const areaAmbientes = r.ambientes.reduce((s, a) => s + (a.ret.x1 - a.ret.x0) * (a.ret.y1 - a.ret.y0), 0);
      expect(areaAmbientes / 161e6).toBeGreaterThanOrEqual(0.9);
      // Nenhuma parede fora do polígono: pontas e meio dentro ou sobre a borda.
      for (const w of r.model.walls) for (const p of [w.a, w.b, point((w.a.x + w.b.x) / 2, (w.a.y + w.b.y) / 2)]) expect(noContorno(p), `${JSON.stringify(p)}`).toBe(true);
      // Os três quartos e a suíte: o programa inteiro virou ambiente fechado e nomeado.
      expect(r.avisos.filter((a) => /não fechou|sem acesso/.test(a))).toEqual([]);
      expect(r.model.spaces.filter((s) => s.name).length).toBe(r.ambientes.length);
      expect(r.ambientes.filter((a) => /Dormitório|Suíte/i.test(a.nome)).length).toBeGreaterThanOrEqual(3);
      // A ala do L recebeu ambiente (antes ela era jogada fora).
      const ala = r.anexos[0];
      expect(r.ambientes.some((a) => a.ret.x0 >= ala.x0 && a.ret.x1 <= ala.x1 && a.ret.y0 >= ala.y0 && a.ret.y1 <= ala.y1)).toBe(true);
      // Entrada pela frente (sul).
      expect(r.decisoes.some((d) => /^Entrada de 0,90 m pela frente/.test(d))).toBe(true);
    });
  }

  it('aplicar = 3 comandos de LOTE (paredes, aberturas por wallUid, etiquetas) — o mesmo desenho, nomes inclusos', () => {
    const r = gerar(entrada, 1, { automaticos: false, iteracoes: 120 });
    let alvo = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const lvl = alvo.levels[0].id;
    const cmds = comandosDeAplicacao(r, lvl);
    expect(cmds.map((c) => c.type)).toEqual(['AddWalls', 'AddOpenings', 'PlaceSpaceLabels']);
    alvo = applyBatch(alvo, cmds).model;
    expect(alvo.walls.length).toBe(r.model.walls.length);
    expect(alvo.openings.length).toBe(r.model.openings.length);
    expect(alvo.spaces.map((s) => s.name).filter(Boolean).sort()).toEqual(r.model.spaces.map((s) => s.name).filter(Boolean).sort());
  });

  it('contorno oblíquo: segue no maior retângulo e AVISA o percentual que ficou de fora', () => {
    const torto = [point(0, 0), point(12000, 0), point(14000, 10000), point(0, 10000)];
    const r = gerar({ ...entrada, envelope: torto }, 1, { automaticos: false, iteracoes: 60 });
    expect(r.anexos).toEqual([]);
    expect(r.avisos.some((a) => /não é ortogonal: \d+,\d+ % da área ficou fora/.test(a))).toBe(true);
  });
});
