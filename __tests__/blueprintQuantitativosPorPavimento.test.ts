/**
 * Quantitativos POR PAVIMENTO (17/09/2026): a junção entidade → nível e a
 * prova de que a soma das linhas fecha com o total geral.
 */
import { describe, expect, it } from 'vitest';
import { POLITICA_PADRAO, applyBatch, applyCommand, computeQuantities, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { familiaDoPonto, pavimentoDasEntidades, quantitativosPorPavimento, redeDoPavimento, reservatoriosPorVolume } from '../utils/blueprintQuantitativosPorPavimento';
import { planejarEsgoto } from '../utils/blueprintEsgotoAutomatico';

/** Térreo com uma sala 4×3 e uma porta; Superior com uma sala 6×3 e um pilar. */
function sobrado() {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
  const [terreo, superior] = m.levels.map((l) => l.id);
  const sala = (levelId: string, w: number, h: number): Command[] =>
    (
      [
        [0, 0, w, 0],
        [w, 0, w, h],
        [w, h, 0, h],
        [0, h, 0, 0],
      ] as const
    ).map(([ax, ay, bx, by]) => ({ type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }));
  m = applyBatch(m, sala(terreo, 4000, 3000)).model;
  const paredeDoTerreo = m.walls[0].id;
  m = applyCommand(m, { type: 'AddOpening', wallId: paredeDoTerreo, kind: 'door', offsetMm: 1000, widthMm: 800, heightMm: 2100, sillMm: 0 }).model;
  m = applyBatch(m, sala(superior, 6000, 3000)).model;
  m = applyCommand(m, {
    type: 'AddStructural', levelId: superior, kind: 'PILAR', pontos: [point(3000, 1500)],
    larguraMm: 200, profundidadeMm: 200, alturaMm: 2800, rotulo: 'P1',
  }).model;
  return { m, terreo, superior };
}

describe('quantitativos por pavimento', () => {
  it('cada linha traz só o que é do seu nível, na ordem da cota', () => {
    const { m, terreo, superior } = sobrado();
    const quant = computeQuantities(m, POLITICA_PADRAO);
    const linhas = quantitativosPorPavimento(m, quant);
    expect(linhas.map((l) => l.nome)).toEqual(['Térreo', 'Superior']);
    const [t, s] = linhas;
    expect(t.levelId).toBe(terreo);
    expect(s.levelId).toBe(superior);
    expect(t.ambientes).toBe(1);
    expect(s.ambientes).toBe(1);
    // A porta é do térreo (herdada da parede); o pilar, do superior.
    expect(t.portas).toBe(1);
    expect(s.portas).toBe(0);
    expect(t.pecas).toBe(0);
    expect(s.pecas).toBe(1);
    expect(s.volumeConcretoM3).toBeCloseTo(0.2 * 0.2 * 2.8, 3);
    // O superior é maior: piso maior.
    expect(s.areaPisoM2).toBeGreaterThan(t.areaPisoM2);
  });

  it('a soma das linhas FECHA com o total geral — são as mesmas somas', () => {
    const { m } = sobrado();
    const quant = computeQuantities(m, POLITICA_PADRAO);
    const linhas = quantitativosPorPavimento(m, quant);
    const soma = (k: keyof (typeof linhas)[number]) => linhas.reduce((a, l) => a + (l[k] as number), 0);
    expect(soma('areaPisoM2')).toBeCloseTo(quant.totais.areaPisoM2, 6);
    expect(soma('areaParedeDuasFacesM2')).toBeCloseTo(quant.totais.areaParedeDuasFacesM2, 6);
    expect(soma('volumeAlvenariaM3')).toBeCloseTo(quant.totais.volumeAlvenariaM3, 6);
    expect(soma('comprimentoRodapeM')).toBeCloseTo(quant.totais.comprimentoRodapeM, 6);
    expect(soma('areaAberturasM2')).toBeCloseTo(quant.totais.areaAberturasM2, 6);
    expect(soma('areaConstruidaM2')).toBeCloseTo(quant.totais.areaConstruidaM2, 6);
    expect(soma('volumeConcretoM3')).toBeCloseTo(quant.totais.volumeConcretoPilarM3, 6);
    expect(soma('portas')).toBe(quant.totais.portas);
  });

  it('o mapa dá o pavimento de ambiente, parede, abertura (pela parede) e estrutura', () => {
    const { m, terreo, superior } = sobrado();
    const mapa = pavimentoDasEntidades(m);
    expect(mapa.get(m.openings[0].id)).toBe(terreo);
    expect(mapa.get(m.structures[0].id)).toBe(superior);
    expect(m.spaces.every((s) => mapa.get(s.id) === s.levelId)).toBe(true);
  });
});

describe('instalações por pavimento (28/09/2026, E0.2 do roadmap hidrossanitário)', () => {
  /** Sobrado com banheiro em cima e a CI no térreo, e o esgoto automático (TQ, ramal sob o piso do andar). */
  function sobradoComEsgoto() {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
    const [terreo, superior] = m.levels.map((l) => l.id);
    const esg = (levelId: string, tipo: 'LAVATORIO' | 'CAIXA_SIFONADA' | 'VASO_SANITARIO' | 'CAIXA_INSPECAO', x: number, y: number, cota: number): Command =>
      ({ type: 'AddTerminal', levelId, disciplina: 'ESGOTO', tipo, at: point(x, y), cotaMm: cota, tipoHidraulico: tipo });
    m = applyBatch(m, [
      esg(superior, 'LAVATORIO', 600, 2500, 500),
      esg(superior, 'CAIXA_SIFONADA', 1200, 2100, 0),
      esg(superior, 'VASO_SANITARIO', 600, 800, 0),
      esg(terreo, 'CAIXA_INSPECAO', 5000, -1500, -700),
      { type: 'AddTerminal', levelId: superior, disciplina: 'AGUA_FRIA', tipo: 'Caixa', at: point(0, 0), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO', volumeL: 1000 },
      { type: 'AddTerminal', levelId: superior, disciplina: 'AGUA_FRIA', tipo: 'Caixa', at: point(500, 0), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO', volumeL: 1000 },
      { type: 'AddTerminal', levelId: terreo, disciplina: 'AGUA_FRIA', tipo: 'Caixa', at: point(0, 500), cotaMm: 0, tipoHidraulico: 'RESERVATORIO', volumeL: 500 },
    ]).model;
    m = applyBatch(m, planejarEsgoto(m).comandos).model;
    return { m, terreo, superior };
  }

  it('a SOMA dos pavimentos fecha com o total — tubo por DN, pontos e conexões', () => {
    const { m, terreo, superior } = sobradoComEsgoto();
    const q = computeQuantities(m, POLITICA_PADRAO);
    const t = redeDoPavimento(m, q, terreo);
    const s = redeDoPavimento(m, q, superior);
    const total = redeDoPavimento(m, q, null);
    const metros = (r: typeof t) => r.porBitola.reduce((x, b) => x + b.comprimentoM, 0);
    expect(metros(t) + metros(s)).toBeCloseTo(metros(total), 9);
    const n = (r: typeof t) => r.porConexao.reduce((x, c) => x + c.quantidade, 0);
    expect(n(t) + n(s)).toBe(n(total));
    const p = (r: typeof t) => r.porTerminal.reduce((x, c) => x + c.quantidade, 0);
    expect(p(t) + p(s)).toBe(p(total));
    // Cada pavimento tem rede: o TQ desce pelo térreo; os ramais são do superior.
    expect(metros(t)).toBeGreaterThan(0);
    expect(metros(s)).toBeGreaterThan(0);
    // A linha do pavimento traz o resumo das instalações.
    const linhas = quantitativosPorPavimento(m, q);
    expect(linhas.reduce((x, l) => x + l.tuboHidraulicoM, 0)).toBeCloseTo(metros(total), 9);
    expect(linhas.reduce((x, l) => x + l.conexoesHidraulicas, 0)).toBe(n(total));
    expect(linhas.find((l) => l.levelId === superior)!.pontosHidraulicos).toBe(5);
  });

  it('a conexão sob o piso do andar é do ANDAR (o nó dela está no teto do térreo)', () => {
    const { m, superior } = sobradoComEsgoto();
    const q = computeQuantities(m, POLITICA_PADRAO);
    const conexoesDoAndar = redeDoPavimento(m, q, superior).porConexao.reduce((x, c) => x + c.quantidade, 0);
    const noTetoDoTerreo = q.conexoes.filter((c) => c.levelId !== superior && c.trechoIds.some((id) => m.trechos!.find((t) => t.id === id)?.levelId === superior)).length;
    expect(noTetoDoTerreo).toBeGreaterThan(0);
    expect(conexoesDoAndar).toBeGreaterThanOrEqual(noTetoDoTerreo);
  });

  it("caixa d'água pelo VOLUME e fora da lista de pontos; equipamentos e caixas com família própria", () => {
    const { m, superior } = sobradoComEsgoto();
    expect(reservatoriosPorVolume(m, null)).toEqual([{ volumeL: 1000, quantidade: 2 }, { volumeL: 500, quantidade: 1 }]);
    expect(reservatoriosPorVolume(m, superior)).toEqual([{ volumeL: 1000, quantidade: 2 }]);
    expect(familiaDoPonto('RESERVATORIO')).toBe('Reservatório');
    expect(familiaDoPonto('AQUECEDOR')).toBe('Equipamento');
    expect(familiaDoPonto('CAIXA_INSPECAO')).toBe('Caixa');
    expect(familiaDoPonto('LAVATORIO')).toBe('Ponto');
    expect(familiaDoPonto(null)).toBe('Ponto');
  });
});

