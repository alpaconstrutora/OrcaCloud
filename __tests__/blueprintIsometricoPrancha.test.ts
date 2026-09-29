/**
 * E2.2 — O ISOMÉTRICO DE PRANCHA (28/09/2026, roadmap hidrossanitário): a rede
 * de cada ambiente molhado em isométrico a 30°, recortada no ambiente, com ø,
 * sigla e altura dos pontos, na folha "Legenda e detalhes hidrossanitários".
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, recomputeSpaces, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { DesenhistaDeProva, PAPEIS, desenharFolhaDeDetalhesHidro, enquadrar, orientar, type OpcoesExportacao } from '../utils/blueprintExport';
import { desenharIsometrico, desenharIsometricos, isometricosDoModelo, projetarIsometrico, recortarNaCaixa } from '../utils/blueprintIsometricoPrancha';

/** Banheiro (0–2000) e área (2000–4500) no térreo; a CI lá fora, a 1,5 m da casa. */
function casa(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [w(0, 0, 4500, 0), w(4500, 0, 4500, 3000), w(4500, 3000, 0, 3000), w(0, 3000, 0, 0), w(2000, 0, 2000, 3000)]).model;
  m = recomputeSpaces(m);
  for (const s of m.spaces) m = applyCommand(m, { type: 'NameSpace', spaceId: s.id, name: s.ring.every((p) => p.x <= 2000) ? 'Banheiro' : 'Área' }).model;
  m = applyBatch(m, [
    // Água: desce da laje (2,80) ao lavatório (0,60) na parede do banheiro.
    { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(75, 75), b: point(75, 2500), cotaAMm: 2800, cotaBMm: 2800, bitolaMm: 25 },
    { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(75, 2500), b: point(75, 2500), cotaAMm: 2800, cotaBMm: 600, bitolaMm: 20 },
    { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Lav', at: point(75, 2500), cotaMm: 600, tipoHidraulico: 'LAVATORIO' },
    // Esgoto: do vaso do banheiro até a CI lá fora, atravessando a área.
    { type: 'AddTrecho', levelId: t, disciplina: 'ESGOTO', a: point(600, 800), b: point(6000, 800), cotaAMm: -100, cotaBMm: -200, bitolaMm: 100 },
    { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'VS', at: point(600, 800), cotaMm: 0, tipoHidraulico: 'VASO_SANITARIO' },
    { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'CI', at: point(6000, 800), cotaMm: -600, tipoHidraulico: 'CAIXA_INSPECAO' },
  ] as Command[]).model;
  return m;
}

describe('E2.2 — a geometria', () => {
  it('isométrico VERDADEIRO: 1 m no eixo x, no y ou no z mede 1 m no papel', () => {
    const o = projetarIsometrico({ x: 0, y: 0, z: 0 });
    for (const p of [{ x: 1000, y: 0, z: 0 }, { x: 0, y: 1000, z: 0 }, { x: 0, y: 0, z: 1000 }]) {
      const q = projetarIsometrico(p);
      expect(Math.hypot(q.u - o.u, q.v - o.v)).toBeCloseTo(1000, 6);
    }
    // O z sobe no papel (v menor), x e y descem a 30° para lados opostos.
    expect(projetarIsometrico({ x: 0, y: 0, z: 1000 }).v).toBeLessThan(0);
    expect(projetarIsometrico({ x: 1000, y: 0, z: 0 }).u).toBeGreaterThan(0);
    expect(projetarIsometrico({ x: 0, y: 1000, z: 0 }).u).toBeLessThan(0);
  });

  it('recorte: a ponta de fora para na borda da caixa, com a cota interpolada; o que não passa some', () => {
    const c = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
    const r = recortarNaCaixa({ x: 500, y: 500, z: 0 }, { x: 2500, y: 500, z: -200 }, c)!;
    expect(r[1]).toEqual({ x: 1000, y: 500, z: -50 });
    expect(recortarNaCaixa({ x: 2000, y: 0, z: 0 }, { x: 3000, y: 0, z: 0 }, c)).toBeNull();
    // Prumada (mesmo x, y): entra inteira se está dentro.
    expect(recortarNaCaixa({ x: 10, y: 10, z: 2800 }, { x: 10, y: 10, z: 600 }, c)).toEqual([{ x: 10, y: 10, z: 2800 }, { x: 10, y: 10, z: 600 }]);
  });
});

describe('E2.2 — quais isométricos', () => {
  it('um por ambiente × rede que tem ponto; o tronco que sai da casa é CORTADO no ambiente', () => {
    const isos = isometricosDoModelo(casa());
    expect(isos.map((i) => i.titulo)).toEqual(['Água — Banheiro (Térreo)', 'Esgoto — Banheiro (Térreo)']);
    const esgoto = isos[1];
    // O ramal de 5,4 m vai até a CI (x = 6000), mas no banheiro para na folga (2000 + 300).
    expect(Math.max(...esgoto.segmentos.flatMap((s) => [s.a.x, s.b.x]))).toBe(2300);
    expect(esgoto.pontos.map((p) => p.sigla)).toEqual(['VS']);
    // A água leva a prumada da descida (2,80 → 0,60).
    expect(isos[0].segmentos.some((s) => s.a.x === s.b.x && s.a.y === s.b.y && s.a.z === 2800 && s.b.z === 600)).toBe(true);
    expect(isometricosDoModelo(casa())).toEqual(isos);
  });

  it('sem rede: nenhum', () => {
    const m = casa();
    expect(isometricosDoModelo({ ...m, trechos: [], terminais: [] })).toEqual([]);
  });
});

describe('E2.2 — no papel', () => {
  it('título, escala da lista, ø do tubo e a sigla com a altura do ponto', () => {
    const [agua] = isometricosDoModelo(casa());
    const d = new DesenhistaDeProva();
    const den = desenharIsometrico(d, agua, 10, 10, 120, 80);
    expect([10, 20, 25, 50, 75, 100, 125, 200]).toContain(den);
    const textos = d.textos();
    expect(textos).toContain('Água — Banheiro (Térreo)');
    expect(textos).toContain(`Isométrico · 1:${den} (medidas em verdadeira grandeza nos eixos)`);
    expect(textos).toContain('ø25');
    expect(textos).toContain('LV · h 0,60');
    // E2.4: a peça no nó pela sigla — a descida do lavatório faz um joelho no teto.
    expect(textos).toContain('J90');
    // Tudo dentro da caixa do papel.
    for (const c of d.chamadas.filter((x) => x.tipo === 'linha')) {
      const [x1, y1, x2, y2] = c.args as number[];
      for (const [x, y] of [[x1, y1], [x2, y2]]) {
        expect(x).toBeGreaterThanOrEqual(10 - 1e-6);
        expect(x).toBeLessThanOrEqual(130 + 1e-6);
        expect(y).toBeGreaterThanOrEqual(10 - 1e-6);
        expect(y).toBeLessThanOrEqual(90 + 1e-6);
      }
    }
  });

  it('a folha de detalhes traz "ISOMÉTRICOS" abaixo da legenda; área pequena demais diz quantos ficaram de fora', () => {
    const m = casa();
    const papel = orientar(PAPEIS.find((p) => p.id === 'A3') ?? PAPEIS[0], true);
    const o: OpcoesExportacao = { denominador: 0, papel, titulo: 'Casa', revisao: 1, hash: 'h'.repeat(64), data: new Date('2026-09-28T12:00:00Z') };
    const d = new DesenhistaDeProva();
    desenharFolhaDeDetalhesHidro(d, m, o, enquadrar(m, 50, papel, false));
    expect(d.textos()).toContain('ISOMÉTRICOS');
    expect(d.textos()).toContain('Esgoto — Banheiro (Térreo)');
    const isos = isometricosDoModelo(m);
    expect(desenharIsometricos(new DesenhistaDeProva(), isos, 0, 0, 200, 20)).toEqual({ desenhados: 0, deFora: 2 });
    expect(desenharIsometricos(new DesenhistaDeProva(), isos, 0, 0, 200, 100)).toEqual({ desenhados: 2, deFora: 0 });
  });
});
