/**
 * Spike A — kernel geométrico, braço TypeScript (PRD §30).
 *
 * Os 25 casos que o PRD exige: junções T/L/X, split/merge, aberturas próximas às
 * pontas, ambientes com ilha, tolerâncias e undo.
 *
 * Critério de aprovação: igualdade bit a bit do payload canônico entre navegador e
 * servidor. Como o kernel é puro e sem dependência de runtime, "navegador × servidor"
 * se traduz aqui em: a mesma geometria construída por caminhos diferentes produz
 * exatamente o mesmo payload — que é a propriedade que torna a igualdade entre
 * runtimes possível por construção.
 */

import { describe, expect, it } from 'vitest';
import {
  type BlueprintModel,
  type Command,
  type Wall,
  KernelError,
  ModelHistory,
  applyBatch,
  applyCommand,
  areCollinear,
  buildArrangement,
  canonicalPayload,
  cantoEntreEixos,
  cantosDaParede,
  computeQuantities,
  eixoDaParede,
  emptyModel,
  pontaEsticada,
  interiorPoint,
  extensaoDeCanto,
  modelFromCanonicalPayload,
  nomeDoTipoDeAbertura,
  parseCanonicalPayload,
  poligonoRegular,
  poligonoPeloLado,
  retanguloPorCantos,
  pointInPolygon,
  intersectSegments,
  point,
  sha256,
  snapshotHash,
  travarOrtogonal,
  vertexDegrees,
  wallLength,
} from '../utils/blueprintKernel';

// ─────────────────────────────────────────────────────────────────────────────
// Ajuda
// ─────────────────────────────────────────────────────────────────────────────

const T = 150; // espessura padrão, mm
const H = 2800; // altura padrão, mm

function withLevel(): { model: BlueprintModel; levelId: string } {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  return { model: base.model, levelId: base.model.levels[0].id };
}

function wall(levelId: string, ax: number, ay: number, bx: number, by: number): Command {
  return {
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: T,
    heightMm: H,
  };
}

/** Sala retangular fechada: 4 paredes em anel. */
function room(levelId: string, x0: number, y0: number, x1: number, y1: number): Command[] {
  return [
    wall(levelId, x0, y0, x1, y0),
    wall(levelId, x1, y0, x1, y1),
    wall(levelId, x1, y1, x0, y1),
    wall(levelId, x0, y1, x0, y0),
  ];
}

function level0(model: BlueprintModel) {
  return model.levels[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Junções (casos 1–6)
// ─────────────────────────────────────────────────────────────────────────────

describe('Spike A · junções', () => {
  it('caso 01 — junção em L: duas paredes com ponta comum formam um vértice de grau 2', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [wall(levelId, 0, 0, 4000, 0), wall(levelId, 4000, 0, 4000, 3000)]);

    const degrees = vertexDegrees(built.model, level0(built.model));
    expect(degrees.get('4000,0')).toBe(2);
    expect(degrees.get('0,0')).toBe(1);
  });

  it('caso 02 — junção em T: parede que termina no meio de outra divide a hospedeira', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      wall(levelId, 0, 0, 6000, 0),
      wall(levelId, 3000, 0, 3000, 3000),
    ]);

    const degrees = vertexDegrees(built.model, level0(built.model));
    // O vértice do T tem grau 3: dois trechos da parede base + a que chega.
    expect(degrees.get('3000,0')).toBe(3);
  });

  it('caso 03 — junção em X: duas paredes que se cruzam geram vértice de grau 4', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      wall(levelId, 0, 2000, 6000, 2000),
      wall(levelId, 3000, 0, 3000, 4000),
    ]);

    const degrees = vertexDegrees(built.model, level0(built.model));
    expect(degrees.get('3000,2000')).toBe(4);
  });

  it('caso 04 — vão dentro da tolerância: pontas a 3 mm são unificadas', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      wall(levelId, 0, 0, 4000, 0),
      wall(levelId, 4003, 0, 4003, 3000), // 3 mm de folga, tolerância é 5
    ]);

    const degrees = vertexDegrees(built.model, level0(built.model));
    const merged = [...degrees.entries()].filter(([, d]) => d === 2);
    expect(merged.length).toBe(1);
  });

  it('caso 05 — vão além da tolerância: pontas a 40 mm permanecem separadas', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      wall(levelId, 0, 0, 4000, 0),
      wall(levelId, 4040, 0, 4040, 3000),
    ]);

    const degrees = vertexDegrees(built.model, level0(built.model));
    expect(degrees.get('4000,0')).toBe(1);
    expect(degrees.get('4040,0')).toBe(1);
  });

  it('caso 06 — paredes colineares sobrepostas produzem sobreposição, não ponto', () => {
    const hit = intersectSegments(
      { a: point(0, 0), b: point(4000, 0) },
      { a: point(2000, 0), b: point(6000, 0) },
    );

    expect(hit.kind).toBe('overlap');
    expect(hit.overlap?.a).toEqual({ x: 2000, y: 0 });
    expect(hit.overlap?.b).toEqual({ x: 4000, y: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ambientes (casos 7–12)
// ─────────────────────────────────────────────────────────────────────────────

describe('Spike A · ambientes', () => {
  it('caso 07 — quatro paredes fechadas derivam exatamente um ambiente com a área certa', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000));

    expect(built.model.spaces).toHaveLength(1);
    expect(built.model.spaces[0].areaMm2).toBe(4000 * 3000);
    expect(built.model.spaces[0].perimeterMm).toBe(2 * (4000 + 3000));
  });

  it('caso 08 — duas salas com parede comum derivam dois ambientes', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      ...room(levelId, 0, 0, 6000, 3000),
      wall(levelId, 3000, 0, 3000, 3000), // divisória
    ]);

    expect(built.model.spaces).toHaveLength(2);
    const areas = built.model.spaces.map((s) => s.areaMm2).sort((a, b) => a - b);
    expect(areas).toEqual([3000 * 3000, 3000 * 3000]);
  });

  it('caso 09 — ilha interna vira buraco do ambiente, não ambiente próprio', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      ...room(levelId, 0, 0, 8000, 6000),
      ...room(levelId, 3000, 2000, 5000, 4000), // ilha central, sem tocar o contorno
    ]);

    const outer = built.model.spaces.find((s) => s.holes.length > 0);
    expect(outer).toBeDefined();
    expect(outer!.holes).toHaveLength(1);
    // Área líquida desconta a ilha.
    expect(outer!.areaMm2).toBe(8000 * 6000 - 2000 * 2000);
  });

  it('caso 10 — contorno aberto não fecha ambiente e reporta as pontas soltas', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      wall(levelId, 0, 0, 4000, 0),
      wall(levelId, 4000, 0, 4000, 3000),
      wall(levelId, 4000, 3000, 0, 3000),
      // falta a quarta parede
    ]);

    const arrangement = buildArrangement(built.model, level0(built.model));
    expect(arrangement.spaces).toHaveLength(0);
    expect(arrangement.danglingVertices).toHaveLength(2);
  });

  it('caso 11 — limite sem material divide o ambiente como uma parede dividiria', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      ...room(levelId, 0, 0, 6000, 3000),
      { type: 'AddBoundary', levelId, a: point(3000, 0), b: point(3000, 3000) },
    ]);

    expect(built.model.spaces).toHaveLength(2);
  });

  it('caso 12 — identidade do ambiente sobrevive a mudança de espessura', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000));
    const before = built.model.spaces[0];

    const after = applyCommand(built.model, {
      type: 'SetThickness',
      wallId: built.model.walls[0].id,
      thicknessMm: 250,
    });

    // Espessura é propriedade, não geometria do eixo: a face não muda.
    expect(after.model.spaces[0].id).toBe(before.id);
    expect(after.model.spaces[0].areaMm2).toBe(before.areaMm2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Aberturas (casos 13–17)
// ─────────────────────────────────────────────────────────────────────────────

describe('Spike A · aberturas', () => {
  function roomWithWall() {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000));
    return { model: built.model, wallId: built.model.walls[0].id };
  }

  it('caso 13 — abertura no meio da parede é aceita', () => {
    const { model, wallId } = roomWithWall();
    const after = applyCommand(model, {
      type: 'AddOpening',
      wallId,
      kind: 'door',
      offsetMm: 1500,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    });

    expect(after.model.openings).toHaveLength(1);
    expect(after.model.openings[0].offsetMm).toBe(1500);
  });

  it('caso 14 — abertura encostada na ponta (offset 0) é aceita', () => {
    const { model, wallId } = roomWithWall();
    const after = applyCommand(model, {
      type: 'AddOpening',
      wallId,
      kind: 'window',
      offsetMm: 0,
      widthMm: 1200,
      heightMm: 1200,
      sillMm: 900,
    });

    expect(after.model.openings[0].offsetMm).toBe(0);
  });

  it('caso 15 — abertura que ultrapassa a parede é rejeitada', () => {
    const { model, wallId } = roomWithWall();
    expect(() =>
      applyCommand(model, {
        type: 'AddOpening',
        wallId,
        kind: 'door',
        offsetMm: 3500,
        widthMm: 900, // 3500+900 = 4400 > 4000
        heightMm: 2100,
        sillMm: 0,
      }),
    ).toThrow(KernelError);
  });

  it('caso 16 — abertura migra para o fragmento certo quando a parede é dividida', () => {
    const { model, wallId } = roomWithWall();
    const withOpening = applyCommand(model, {
      type: 'AddOpening',
      wallId,
      kind: 'door',
      offsetMm: 2500,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    });

    const split = applyCommand(withOpening.model, {
      type: 'SplitWall',
      wallId,
      at: point(2000, 0),
    });

    const opening = split.model.openings[0];
    const host = split.model.walls.find((w) => w.id === opening.wallId)!;
    // Foi para o segundo fragmento, com offset medido a partir do novo início.
    expect(host.a).toEqual({ x: 2000, y: 0 });
    expect(opening.offsetMm).toBe(500);
  });

  it('caso 17 — duas aberturas sobrepostas na mesma parede são rejeitadas', () => {
    const { model, wallId } = roomWithWall();
    const first = applyCommand(model, {
      type: 'AddOpening',
      wallId,
      kind: 'door',
      offsetMm: 1000,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    });

    expect(() =>
      applyCommand(first.model, {
        type: 'AddOpening',
        wallId,
        kind: 'window',
        offsetMm: 1500, // invade a anterior (1000..1900)
        widthMm: 900,
        heightMm: 1200,
        sillMm: 900,
      }),
    ).toThrow(/sobrep/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tamanho da abertura depois de inserida (SetOpeningSize)
// ─────────────────────────────────────────────────────────────────────────────

describe('SetOpeningSize · editar o tamanho da abertura', () => {
  /** Sala 4000×3000, parede de 2800 de pé-direito, porta 900×2100 a 1000. */
  function comPorta() {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000));
    const wallId = built.model.walls[0].id;
    const withOpening = applyCommand(built.model, {
      type: 'AddOpening',
      wallId,
      kind: 'door',
      offsetMm: 1000,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    });
    return { model: withOpening.model, openingId: withOpening.model.openings[0].id, wallId };
  }

  it('muda a largura e deixa o resto intacto', () => {
    const { model, openingId } = comPorta();
    const depois = applyCommand(model, { type: 'SetOpeningSize', openingId, widthMm: 800 }).model;

    expect(depois.openings[0].widthMm).toBe(800);
    expect(depois.openings[0].heightMm).toBe(2100);
    expect(depois.openings[0].offsetMm).toBe(1000);
  });

  it('muda a altura sem tocar na largura', () => {
    const { model, openingId } = comPorta();
    const depois = applyCommand(model, { type: 'SetOpeningSize', openingId, heightMm: 2300 }).model;

    expect(depois.openings[0].heightMm).toBe(2300);
    expect(depois.openings[0].widthMm).toBe(900);
  });

  it('campo omitido não muda — o painel edita uma medida por vez', () => {
    const { model, openingId } = comPorta();
    const antes = model.openings[0];
    const depois = applyCommand(model, { type: 'SetOpeningSize', openingId }).model.openings[0];

    expect(depois).toEqual(antes);
  });

  it('A ALTURA CHEGA AO QUANTITATIVO: a área descontada da parede acompanha', () => {
    // É a razão de a altura ser editável, e não só a largura. Enquanto ela era
    // um 2100 fixo, o desconto saía de uma suposição que ninguém escolheu.
    const { model, openingId } = comPorta();
    const antes = computeQuantities(model).paredes.find((p) => p.areaAberturasM2 > 0)!;
    expect(antes.areaAberturasM2).toBeCloseTo((900 * 2100) / 1_000_000, 6);

    const depois = applyCommand(model, { type: 'SetOpeningSize', openingId, heightMm: 2400 }).model;
    const dep = computeQuantities(depois).paredes.find((p) => p.areaAberturasM2 > 0)!;

    expect(dep.areaAberturasM2).toBeCloseTo((900 * 2400) / 1_000_000, 6);
    expect(dep.areaFaceLiquidaM2).toBeLessThan(antes.areaFaceLiquidaM2);
  });

  it('largura que estoura a parede é RECUSADA, com a medida máxima na mensagem', () => {
    // Porta a 1000 mm numa parede de 4000: cabe no máximo 3000 mm.
    const { model, openingId } = comPorta();
    expect(() =>
      applyCommand(model, { type: 'SetOpeningSize', openingId, widthMm: 3500 }),
    ).toThrow(/3000 mm/);
  });

  it('ALTURA MAIOR QUE A PAREDE É RECUSADA — senão o volume sairia NEGATIVO', () => {
    // Sem esta trava, `areaAberturas > areaBruta` e o quantitativo entregaria
    // área líquida e volume negativos, calado, dentro do orçamento.
    const { model, openingId } = comPorta();
    expect(() =>
      applyCommand(model, { type: 'SetOpeningSize', openingId, heightMm: 3000 }),
    ).toThrow(/2800 mm/);
  });

  it('peitoril + altura também precisam caber no pé-direito', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000)).model;
    const comJanela = applyCommand(built, {
      type: 'AddOpening',
      wallId: built.walls[0].id,
      kind: 'window',
      offsetMm: 1000,
      widthMm: 1200,
      heightMm: 1200,
      sillMm: 900,
    }).model;
    const openingId = comJanela.openings[0].id;

    // 900 + 1900 = 2800: cabe justo. 900 + 2000 estoura.
    expect(() =>
      applyCommand(comJanela, { type: 'SetOpeningSize', openingId, heightMm: 1900 }),
    ).not.toThrow();
    expect(() =>
      applyCommand(comJanela, { type: 'SetOpeningSize', openingId, heightMm: 2000 }),
    ).toThrow(KernelError);
  });

  it('largura, altura ou peitoril inválidos são recusados', () => {
    const { model, openingId } = comPorta();
    expect(() => applyCommand(model, { type: 'SetOpeningSize', openingId, widthMm: 0 })).toThrow(
      KernelError,
    );
    expect(() => applyCommand(model, { type: 'SetOpeningSize', openingId, heightMm: -1 })).toThrow(
      KernelError,
    );
    expect(() => applyCommand(model, { type: 'SetOpeningSize', openingId, sillMm: -1 })).toThrow(
      KernelError,
    );
  });

  it('alargar por cima da abertura vizinha é recusado', () => {
    const { model, openingId, wallId } = comPorta();
    // Segunda porta logo adiante: 2200..3100.
    const duas = applyCommand(model, {
      type: 'AddOpening',
      wallId,
      kind: 'door',
      offsetMm: 2200,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    }).model;

    // A primeira começa em 1000; 1500 de largura chegaria a 2500, invadindo.
    expect(() =>
      applyCommand(duas, { type: 'SetOpeningSize', openingId, widthMm: 1500 }),
    ).toThrow(/sobrep/i);
  });

  it('abertura inexistente é recusada', () => {
    const { model } = comPorta();
    expect(() =>
      applyCommand(model, { type: 'SetOpeningSize', openingId: 'opn_9999', widthMm: 800 }),
    ).toThrow(KernelError);
  });

  it('o novo tamanho sobrevive ao round-trip do payload', () => {
    const { model, openingId } = comPorta();
    const redim = applyCommand(model, {
      type: 'SetOpeningSize',
      openingId,
      widthMm: 700,
      heightMm: 2300,
    }).model;

    const rebuilt = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(redim)));
    expect(rebuilt.openings[0].widthMm).toBe(700);
    expect(rebuilt.openings[0].heightMm).toBe(2300);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Vão livre — abertura sem esquadria (kind: 'passage')
// ─────────────────────────────────────────────────────────────────────────────

describe('vão livre · abertura sem esquadria', () => {
  /**
   * Sala 4000×3000 com uma abertura de 900 mm na parede de baixo.
   *
   * A altura acompanha o peitoril porque a parede tem 2800 de pé-direito e o
   * kernel recusa `peitoril + altura` maior que isso — a trava que entrou junto
   * com a altura editável.
   */
  function comAbertura(kind: 'door' | 'window' | 'passage', sillMm = 0) {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000)).model;
    return applyCommand(built, {
      type: 'AddOpening',
      wallId: built.walls[0].id,
      kind,
      offsetMm: 1000,
      widthMm: 900,
      heightMm: sillMm > 0 ? 1200 : 2100,
      sillMm,
    }).model;
  }

  it('o kernel aceita o tipo novo', () => {
    expect(comAbertura('passage').openings[0].kind).toBe('passage');
  });

  it('desconta área da parede como qualquer abertura — é um buraco', () => {
    const comVao = computeQuantities(comAbertura('passage'));
    const comPorta = computeQuantities(comAbertura('door'));
    const parede = (q: typeof comVao) => q.paredes.find((p) => p.areaAberturasM2 > 0)!;

    expect(parede(comVao).areaAberturasM2).toBeCloseTo(parede(comPorta).areaAberturasM2, 9);
    expect(parede(comVao).areaFaceLiquidaM2).toBeCloseTo(parede(comPorta).areaFaceLiquidaM2, 9);
  });

  it('INTERROMPE O RODAPÉ como porta — não há parede no piso ali', () => {
    const comVao = computeQuantities(comAbertura('passage'));
    const comPorta = computeQuantities(comAbertura('door'));
    const comJanela = computeQuantities(comAbertura('window', 900));

    expect(comVao.totais.comprimentoRodapeM).toBeCloseTo(
      comPorta.totais.comprimentoRodapeM,
      9,
    );
    // Janela não interrompe: o rodapé passa por baixo dela.
    expect(comJanela.totais.comprimentoRodapeM).toBeGreaterThan(
      comVao.totais.comprimentoRodapeM,
    );
  });

  it('com PEITORIL ALTO (passa-prato) o rodapé volta a passar por baixo', () => {
    // Vão sem esquadria não é sempre passagem: com peitoril, é guichê/balcão, e
    // aí existe parede embaixo dele para receber rodapé.
    const rasteiro = computeQuantities(comAbertura('passage', 0)).totais.comprimentoRodapeM;
    const alto = computeQuantities(comAbertura('passage', 900)).totais.comprimentoRodapeM;

    expect(alto).toBeGreaterThan(rasteiro);
  });

  it('PORTA-JANELA interrompe o rodapé — corrigido em 15/08/2026', () => {
    // O DEFEITO: a regra perguntava `kind === 'door'`, então uma janela com
    // peitoril ZERO — porta-janela, que se atravessa a pé — contava rodapé ao
    // longo de um vão onde não há parede para pregá-lo. Vinha rodapé a mais no
    // orçamento, calado, com o desenho na tela certo o tempo todo.
    const portaJanela = computeQuantities(comAbertura('window', 0));
    const porta = computeQuantities(comAbertura('door'));

    expect(portaJanela.totais.comprimentoRodapeM).toBeCloseTo(
      porta.totais.comprimentoRodapeM,
      9,
    );
    // E é MENOR que o perímetro: o vão saiu da conta.
    expect(portaJanela.totais.comprimentoRodapeM).toBeLessThan(
      portaJanela.ambientes[0].perimetroEixoM,
    );
  });

  it('janela com peitoril NÃO interrompe — o rodapé passa por baixo dela', () => {
    // O outro lado da mesma regra: mudar o critério para o peitoril não podia
    // fazer toda janela virar interrupção.
    const janela = computeQuantities(comAbertura('window', 900));
    expect(janela.totais.comprimentoRodapeM).toBeCloseTo(
      janela.ambientes[0].perimetroEixoM,
      9,
    );
  });

  it('conta separado de porta e janela nos totais', () => {
    const t = computeQuantities(comAbertura('passage')).totais;
    expect(t.vaosLivres).toBe(1);
    expect(t.portas).toBe(0);
    expect(t.janelas).toBe(0);
  });

  it('sobrevive ao round-trip do payload', () => {
    const modelo = comAbertura('passage');
    const rebuilt = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(modelo)));
    expect(rebuilt.openings[0].kind).toBe('passage');
  });

  it('planta SEM vão livre continua com o mesmo hash de antes', () => {
    // O tipo novo alarga a união, mas não muda o formato do payload: quem nunca
    // usou vão livre não pode ver o hash do seu estudo mudar por causa disso.
    const modelo = comAbertura('door');
    const payload = JSON.parse(canonicalPayload(modelo));
    expect(payload.openings[0].kind).toBe('door');
    expect(Object.keys(payload.openings[0]).sort()).toEqual([
      'heightMm',
      'hingeAtStart',
      'kind',
      'offsetMm',
      'sillMm',
      'swingReversed',
      'wall',
      'widthMm',
    ]);
  });

  it('o rótulo do tipo é fonte única, e cobre os três', () => {
    expect(nomeDoTipoDeAbertura('door')).toBe('Porta');
    expect(nomeDoTipoDeAbertura('window')).toBe('Janela');
    expect(nomeDoTipoDeAbertura('passage')).toBe('Vão livre');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mover abertura ao longo da parede (MoveOpening)
// ─────────────────────────────────────────────────────────────────────────────

describe('MoveOpening · deslizar a abertura na parede', () => {
  /** Sala 4000×3000; porta de 900 a 1000 mm do início da primeira parede. */
  function comPorta() {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000));
    const wallId = built.model.walls[0].id;
    const withOpening = applyCommand(built.model, {
      type: 'AddOpening',
      wallId,
      kind: 'door',
      offsetMm: 1000,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    });
    return { model: withOpening.model, openingId: withOpening.model.openings[0].id, wallId };
  }

  it('move e SÓ o offset muda', () => {
    const { model, openingId } = comPorta();
    const antes = model.openings[0];
    const depois = applyCommand(model, { type: 'MoveOpening', openingId, offsetMm: 2000 }).model
      .openings[0];

    expect(depois.offsetMm).toBe(2000);
    expect(depois.widthMm).toBe(antes.widthMm);
    expect(depois.heightMm).toBe(antes.heightMm);
    expect(depois.wallId).toBe(antes.wallId);
    expect(depois.hingeAtStart).toBe(antes.hingeAtStart);
    expect(depois.swingReversed).toBe(antes.swingReversed);
  });

  it('encostar na ponta da parede é permitido nos dois extremos', () => {
    const { model, openingId } = comPorta();
    expect(
      applyCommand(model, { type: 'MoveOpening', openingId, offsetMm: 0 }).model.openings[0]
        .offsetMm,
    ).toBe(0);
    // 4000 − 900 = 3100 é o último offset que cabe.
    expect(
      applyCommand(model, { type: 'MoveOpening', openingId, offsetMm: 3100 }).model.openings[0]
        .offsetMm,
    ).toBe(3100);
  });

  it('offset que estoura a parede é RECUSADO, com a distância máxima na mensagem', () => {
    const { model, openingId } = comPorta();
    expect(() => applyCommand(model, { type: 'MoveOpening', openingId, offsetMm: 3200 })).toThrow(
      /3100 mm/,
    );
  });

  it('offset negativo é recusado', () => {
    const { model, openingId } = comPorta();
    expect(() => applyCommand(model, { type: 'MoveOpening', openingId, offsetMm: -1 })).toThrow(
      KernelError,
    );
  });

  it('mover para cima da abertura vizinha é recusado', () => {
    const { model, openingId, wallId } = comPorta();
    // Segunda porta em 2200..3100.
    const duas = applyCommand(model, {
      type: 'AddOpening',
      wallId,
      kind: 'door',
      offsetMm: 2200,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    }).model;

    // Levar a primeira para 2000 faria 2000..2900 invadir 2200..3100.
    expect(() => applyCommand(duas, { type: 'MoveOpening', openingId, offsetMm: 2000 })).toThrow(
      /sobrep/i,
    );
  });

  it('abertura inexistente é recusada', () => {
    const { model } = comPorta();
    expect(() =>
      applyCommand(model, { type: 'MoveOpening', openingId: 'opn_9999', offsetMm: 500 }),
    ).toThrow(KernelError);
  });

  it('o offset novo sobrevive ao round-trip do payload', () => {
    const { model, openingId } = comPorta();
    const movida = applyCommand(model, { type: 'MoveOpening', openingId, offsetMm: 2500 }).model;

    const rebuilt = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(movida)));
    expect(rebuilt.openings[0].offsetMm).toBe(2500);
  });

  it('mover NÃO mexe no quantitativo de área — o vão é o mesmo, só mudou de lugar', () => {
    const { model, openingId } = comPorta();
    const antes = computeQuantities(model).paredes.find((p) => p.areaAberturasM2 > 0)!;
    const depois = applyCommand(model, { type: 'MoveOpening', openingId, offsetMm: 2500 }).model;
    const dep = computeQuantities(depois).paredes.find((p) => p.areaAberturasM2 > 0)!;

    expect(dep.areaAberturasM2).toBeCloseTo(antes.areaAberturasM2, 9);
    expect(dep.areaFaceLiquidaM2).toBeCloseTo(antes.areaFaceLiquidaM2, 9);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Girar/espelhar porta (FlipOpening) — dois eixos independentes
// ─────────────────────────────────────────────────────────────────────────────

describe('FlipOpening · girar e espelhar', () => {
  function comPorta() {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000));
    const wallId = built.model.walls[0].id;
    const withOpening = applyCommand(built.model, {
      type: 'AddOpening',
      wallId,
      kind: 'door',
      offsetMm: 1000,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    });
    return { model: withOpening.model, openingId: withOpening.model.openings[0].id };
  }

  it('AddOpening nasce com o padrão de sempre: dobradiça no início, sem espelhar', () => {
    const { model } = comPorta();
    expect(model.openings[0].hingeAtStart).toBe(true);
    expect(model.openings[0].swingReversed).toBe(false);
  });

  it('aceita o estado inicial explícito, para quem já sabe qual quer', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000)).model;
    const after = applyCommand(built, {
      type: 'AddOpening',
      wallId: built.walls[0].id,
      kind: 'door',
      offsetMm: 1000,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
      hingeAtStart: false,
      swingReversed: true,
    });
    expect(after.model.openings[0].hingeAtStart).toBe(false);
    expect(after.model.openings[0].swingReversed).toBe(true);
  });

  it('"hinge" alterna SÓ a dobradiça — espelhar não muda', () => {
    const { model, openingId } = comPorta();
    const after = applyCommand(model, { type: 'FlipOpening', openingId, axis: 'hinge' });
    expect(after.model.openings[0].hingeAtStart).toBe(false);
    expect(after.model.openings[0].swingReversed).toBe(false);
  });

  it('"swing" alterna SÓ o lado da folha — dobradiça não muda', () => {
    const { model, openingId } = comPorta();
    const after = applyCommand(model, { type: 'FlipOpening', openingId, axis: 'swing' });
    expect(after.model.openings[0].hingeAtStart).toBe(true);
    expect(after.model.openings[0].swingReversed).toBe(true);
  });

  it('os dois eixos alternam de volta ao original — são toggles, não valores fixos', () => {
    const { model, openingId } = comPorta();
    const uma = applyCommand(model, { type: 'FlipOpening', openingId, axis: 'hinge' }).model;
    const duas = applyCommand(uma, { type: 'FlipOpening', openingId, axis: 'hinge' }).model;
    expect(duas.openings[0].hingeAtStart).toBe(true);
  });

  it('as 4 combinações são alcançáveis independentemente', () => {
    const { model, openingId } = comPorta();
    const flip = (m: BlueprintModel, axis: 'hinge' | 'swing') =>
      applyCommand(m, { type: 'FlipOpening', openingId, axis }).model;

    const soHinge = flip(model, 'hinge');
    const soSwing = flip(model, 'swing');
    const ambos = flip(soHinge, 'swing');

    expect([model, soHinge, soSwing, ambos].map((m) => m.openings[0])).toEqual([
      { ...model.openings[0], hingeAtStart: true, swingReversed: false },
      { ...model.openings[0], hingeAtStart: false, swingReversed: false },
      { ...model.openings[0], hingeAtStart: true, swingReversed: true },
      { ...model.openings[0], hingeAtStart: false, swingReversed: true },
    ]);
  });

  it('não muda offset, largura nem parede hospedeira — só o símbolo', () => {
    const { model, openingId } = comPorta();
    const antes = model.openings[0];
    const depois = applyCommand(model, { type: 'FlipOpening', openingId, axis: 'hinge' }).model
      .openings[0];

    expect(depois.offsetMm).toBe(antes.offsetMm);
    expect(depois.widthMm).toBe(antes.widthMm);
    expect(depois.wallId).toBe(antes.wallId);
  });

  it('abertura inexistente é rejeitada, como as outras operações sobre abertura', () => {
    const { model } = comPorta();
    expect(() =>
      applyCommand(model, { type: 'FlipOpening', openingId: 'opn_9999', axis: 'hinge' }),
    ).toThrow(KernelError);
  });

  it('payload canônico registra os dois eixos, e o hash muda quando eles mudam', () => {
    const { model, openingId } = comPorta();
    const girada = applyCommand(model, { type: 'FlipOpening', openingId, axis: 'hinge' }).model;

    expect(canonicalPayload(model)).not.toBe(canonicalPayload(girada));
    expect(snapshotHash(model)).not.toBe(snapshotHash(girada));
  });

  it('round-trip do payload preserva os dois eixos', () => {
    const { model, openingId } = comPorta();
    const girada = applyCommand(model, { type: 'FlipOpening', openingId, axis: 'swing' }).model;

    const rebuilt = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(girada)));
    expect(rebuilt.openings[0].hingeAtStart).toBe(true);
    expect(rebuilt.openings[0].swingReversed).toBe(true);
  });

  it('payload GRAVADO ANTES dos dois campos existirem reabre com o padrão de sempre', () => {
    // Simula um snapshot publicado sob kernel < 0.4.0: o JSON gravado não tem
    // `hingeAtStart`/`swingReversed` nenhum. Reabrir não pode fazer a porta
    // "virar" sozinha — o padrão tem que ser o mesmo que `AddOpening` sempre usou.
    const { model } = comPorta();
    const payload = JSON.parse(canonicalPayload(model));
    delete payload.openings[0].hingeAtStart;
    delete payload.openings[0].swingReversed;

    const rebuilt = modelFromCanonicalPayload(payload);
    expect(rebuilt.openings[0].hingeAtStart).toBe(true);
    expect(rebuilt.openings[0].swingReversed).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Split / merge (casos 18–21)
// ─────────────────────────────────────────────────────────────────────────────

describe('Spike A · split e merge', () => {
  it('caso 18 — split produz dois fragmentos e registra ancestralidade', () => {
    const { model, levelId } = withLevel();
    const built = applyCommand(model, wall(levelId, 0, 0, 4000, 0));
    const original = built.model.walls[0].id;

    const split = applyCommand(built.model, {
      type: 'SplitWall',
      wallId: original,
      at: point(1500, 0),
    });

    expect(split.model.walls).toHaveLength(2);
    expect(split.diff.deleted).toContain(original);
    expect(split.diff.created).toHaveLength(2);
    for (const created of split.diff.created) {
      expect(split.diff.ancestry[created]).toEqual([original]);
    }
  });

  it('caso 19 — merge de colineares adjacentes devolve uma parede só', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [wall(levelId, 0, 0, 2000, 0), wall(levelId, 2000, 0, 5000, 0)]);
    const [first, second] = built.model.walls.map((w) => w.id);

    const merged = applyCommand(built.model, {
      type: 'MergeWalls',
      firstId: first,
      secondId: second,
    });

    expect(merged.model.walls).toHaveLength(1);
    expect(merged.model.walls[0].a).toEqual({ x: 0, y: 0 });
    expect(merged.model.walls[0].b).toEqual({ x: 5000, y: 0 });
    expect(merged.diff.ancestry[merged.model.walls[0].id]).toEqual([first, second]);
  });

  it('caso 20 — merge de não colineares é rejeitado', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [wall(levelId, 0, 0, 2000, 0), wall(levelId, 2000, 0, 2000, 3000)]);
    const [first, second] = built.model.walls.map((w) => w.id);

    expect(() =>
      applyCommand(built.model, { type: 'MergeWalls', firstId: first, secondId: second }),
    ).toThrow(/colinear/i);
  });

  it('caso 21b — numa sala, a vizinha que encosta NÃO é candidata a unir', () => {
    // Regressão de um bug de UI: a busca por "vizinha para unir" pegava a
    // primeira parede que compartilhasse uma ponta. Numa sala retangular toda
    // vizinha é PERPENDICULAR, então ela escolhia a errada e o kernel recusava
    // com "Paredes não são colineares" — depois do clique, não antes.
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000)).model;

    const primeira = built.walls[0]; // (0,0) -> (4000,0)
    const encostadas = built.walls.filter(
      (o) =>
        o.id !== primeira.id &&
        [o.a, o.b].some((p) =>
          [primeira.a, primeira.b].some((q) => p.x === q.x && p.y === q.y),
        ),
    );

    // Duas paredes encostam nela, e nenhuma serve para unir.
    expect(encostadas).toHaveLength(2);
    for (const o of encostadas) {
      const colinear =
        areCollinear(primeira.a, primeira.b, o.a) && areCollinear(primeira.a, primeira.b, o.b);
      expect(colinear).toBe(false);
      expect(() =>
        applyCommand(built, { type: 'MergeWalls', firstId: primeira.id, secondId: o.id }),
      ).toThrow(/colinear/i);
    }
  });

  it('caso 21 — split seguido de merge devolve o payload canônico original', () => {
    const { model, levelId } = withLevel();
    const built = applyCommand(model, wall(levelId, 0, 0, 4000, 0));
    const before = canonicalPayload(built.model);

    const split = applyCommand(built.model, {
      type: 'SplitWall',
      wallId: built.model.walls[0].id,
      at: point(1500, 0),
    });
    const [a, b] = split.model.walls.map((w) => w.id);
    const merged = applyCommand(split.model, { type: 'MergeWalls', firstId: a, secondId: b });

    // Os IDs mudaram, mas o payload canônico ignora ID de parede de propósito:
    // o que identifica o desenho é a geometria, não o número de série do objeto.
    expect(canonicalPayload(merged.model)).toBe(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Determinismo, tolerância e undo (casos 22–25)
// ─────────────────────────────────────────────────────────────────────────────

describe('Spike A · determinismo e histórico', () => {
  it('caso 22 — a mesma sala desenhada em ordem diferente tem o mesmo hash', () => {
    const { model, levelId } = withLevel();
    const forward = room(levelId, 0, 0, 4000, 3000);
    const shuffled = [forward[2], forward[0], forward[3], forward[1]];

    const a = applyBatch(model, forward);
    const b = applyBatch(model, shuffled);

    expect(canonicalPayload(a.model)).toBe(canonicalPayload(b.model));
    expect(a.hash).toBe(b.hash);
  });

  it('caso 23 — undo restaura o hash exato do estado anterior', () => {
    const { model, levelId } = withLevel();
    const history = new ModelHistory(model);
    history.apply(wall(levelId, 0, 0, 4000, 0));
    const afterFirst = history.hash;

    history.apply(wall(levelId, 4000, 0, 4000, 3000));
    expect(history.hash).not.toBe(afterFirst);

    history.undo();
    expect(history.hash).toBe(afterFirst);
  });

  it('caso 24 — redo volta ao estado desfeito e comando idempotente não duplica', () => {
    const { model, levelId } = withLevel();
    const history = new ModelHistory(model);
    history.apply(wall(levelId, 0, 0, 4000, 0));
    const beforeSecond = history.hash;

    const second = history.apply(wall(levelId, 4000, 0, 4000, 3000), 'cmd-42');
    history.undo();
    expect(history.hash).toBe(beforeSecond);

    history.redo();
    expect(history.hash).toBe(second.hash);

    // Reenviar o mesmo commandId não cria uma segunda parede.
    const replay = history.apply(wall(levelId, 4000, 0, 4000, 3000), 'cmd-42');
    expect(replay.hash).toBe(second.hash);
    expect(history.current.walls).toHaveLength(2);
  });

  it('caso 25 — mil operações não acumulam deriva: coordenadas seguem inteiras', () => {
    const { model, levelId } = withLevel();
    let current = applyCommand(model, wall(levelId, 0, 0, 4000, 0)).model;
    const wallId = current.walls[0].id;

    // Vai e volta 500 vezes; em ponto flutuante isso acumularia erro.
    for (let i = 0; i < 500; i++) {
      current = applyCommand(current, {
        type: 'MoveVertex',
        wallId,
        end: 'b',
        to: point(4000 + (i % 7), 0),
      }).model;
      current = applyCommand(current, {
        type: 'MoveVertex',
        wallId,
        end: 'b',
        to: point(4000, 0),
      }).model;
    }

    expect(current.walls[0].b).toEqual({ x: 4000, y: 0 });
    expect(Number.isInteger(current.walls[0].b.x)).toBe(true);

    const fresh = applyCommand(model, wall(levelId, 0, 0, 4000, 0));
    expect(snapshotHash(current)).toBe(fresh.hash);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regressão — geometria oblíqua
//
// Os 25 casos acima são todos ortogonais, porque nasceram do helper `room()`. Esse
// viés escondeu um bug: a interseção era arredondada para mm inteiro e depois
// validada por colinearidade EXATA, teste que o próprio arredondamento invalida. Em
// planta ortogonal a interseção cai em inteiro por sorte e nada quebra; em parede
// oblíqua todos os cortes eram descartados e a planta não produzia ambiente nenhum.
// ─────────────────────────────────────────────────────────────────────────────

describe('Spike A · geometria oblíqua', () => {
  function fromSegments(segs: [number, number, number, number][]) {
    const { model, levelId } = withLevel();
    return applyBatch(
      model,
      segs.map(([ax, ay, bx, by]) => wall(levelId, ax, ay, bx, by)),
    ).model;
  }

  it('caso 26 — triângulo fechado oblíquo deriva um ambiente com a área correta', () => {
    const built = fromSegments([
      [0, 0, 6000, 0],
      [6000, 0, 3000, 5000],
      [3000, 5000, 0, 0],
    ]);

    expect(built.spaces).toHaveLength(1);
    expect(built.spaces[0].areaMm2).toBe((6000 * 5000) / 2);
  });

  it('caso 27 — três retas oblíquas que se cruzam formam o triângulo interno', () => {
    // Nenhuma ponta é compartilhada: a face só existe por causa dos cruzamentos.
    // Antes da correção este caso devolvia zero ambientes.
    const built = fromSegments([
      [0, 0, 9000, 3000],
      [0, 3000, 9000, 0],
      [4000, -2000, 4600, 6000],
    ]);

    expect(built.spaces).toHaveLength(1);
    // Área exata em reais é ~18912 mm²; os vértices arredondam para mm.
    expect(built.spaces[0].areaMm2).toBeGreaterThan(18000);
    expect(built.spaces[0].areaMm2).toBeLessThan(19500);
  });

  it('caso 28 — quadrilátero oblíquo irregular fecha e mede certo', () => {
    const built = fromSegments([
      [0, 0, 5000, 1000],
      [5000, 1000, 4000, 6000],
      [4000, 6000, -1000, 5000],
      [-1000, 5000, 0, 0],
    ]);

    expect(built.spaces).toHaveLength(1);
    expect(built.spaces[0].areaMm2).toBe(26000000);
  });

  it('caso 29 — corte oblíquo divide a sala ortogonal em dois ambientes', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      ...room(levelId, 0, 0, 6000, 4000),
      wall(levelId, 0, 0, 6000, 4000), // diagonal completa
    ]);

    expect(built.model.spaces).toHaveLength(2);
    const total = built.model.spaces.reduce((sum, s) => sum + s.areaMm2, 0);
    expect(total).toBe(6000 * 4000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E0 — persistência: o payload canônico é ida E VOLTA
//
// Sem estes casos o payload é só um hash. Para o snapshot ser útil ele precisa
// reconstruir um modelo editável, e o modelo reconstruído precisa re-serializar
// para exatamente o mesmo payload — senão publicar e reabrir muda a planta.
// ─────────────────────────────────────────────────────────────────────────────

describe('E0 · round-trip do payload canônico', () => {
  it('caso 30 — modelo → payload → modelo → payload é idempotente', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      ...room(levelId, 0, 0, 6000, 4000),
      wall(levelId, 3000, 0, 3000, 4000),
    ]).model;

    const payload = canonicalPayload(built);
    const rebuilt = modelFromCanonicalPayload(parseCanonicalPayload(payload));

    expect(canonicalPayload(rebuilt)).toBe(payload);
    expect(snapshotHash(rebuilt)).toBe(snapshotHash(built));
    expect(rebuilt.spaces).toHaveLength(built.spaces.length);
  });

  it('caso 31 — aberturas sobrevivem ao round-trip presas na parede certa', () => {
    const { model, levelId } = withLevel();
    const base = applyBatch(model, room(levelId, 0, 0, 4000, 3000)).model;
    const withOpening = applyCommand(base, {
      type: 'AddOpening',
      wallId: base.walls[1].id,
      kind: 'door',
      offsetMm: 900,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    }).model;

    const payload = canonicalPayload(withOpening);
    const rebuilt = modelFromCanonicalPayload(parseCanonicalPayload(payload));

    expect(rebuilt.openings).toHaveLength(1);
    // A abertura tem que reencontrar a MESMA parede geometricamente, ainda que o id
    // seja outro depois da reconstrução.
    const originalHost = withOpening.walls.find((w) => w.id === withOpening.openings[0].wallId)!;
    const rebuiltHost = rebuilt.walls.find((w) => w.id === rebuilt.openings[0].wallId)!;
    expect(rebuiltHost.a).toEqual(originalHost.a);
    expect(rebuiltHost.b).toEqual(originalHost.b);
    expect(canonicalPayload(rebuilt)).toBe(payload);
  });

  it('caso 32 — com abertura, a ordem de desenho não muda o hash', () => {
    // Este é o caso que o payload antigo errava. Ele guardava `wallId` na abertura,
    // então a mesma planta desenhada em outra ordem gerava outro hash assim que
    // tivesse uma porta. Os goldens não pegavam porque nenhum deles tem abertura.
    const { model, levelId } = withLevel();
    const forward = room(levelId, 0, 0, 4000, 3000);
    const shuffled = [forward[3], forward[1], forward[0], forward[2]];

    const build = (order: Command[]) => {
      const built = applyBatch(model, order).model;
      // Mesma parede geométrica nos dois: a que vai de (0,0) a (4000,0).
      const host = built.walls.find(
        (w) => w.a.x === 0 && w.a.y === 0 && w.b.x === 4000 && w.b.y === 0,
      )!;
      return applyCommand(built, {
        type: 'AddOpening',
        wallId: host.id,
        kind: 'door',
        offsetMm: 1500,
        widthMm: 900,
        heightMm: 2100,
        sillMm: 0,
      }).model;
    };

    expect(snapshotHash(build(shuffled))).toBe(snapshotHash(build(forward)));
  });

  it('caso 33 — o payload não carrega identificador volátil nenhum', () => {
    const { model, levelId } = withLevel();
    const base = applyBatch(model, room(levelId, 0, 0, 4000, 3000)).model;
    const built = applyCommand(base, {
      type: 'AddOpening',
      wallId: base.walls[0].id,
      kind: 'window',
      offsetMm: 500,
      widthMm: 1200,
      heightMm: 1200,
      sillMm: 900,
    }).model;

    const payload = canonicalPayload(built);
    for (const prefix of ['wal_', 'lvl_', 'opn_', 'bnd_', 'spc_', 'seq']) {
      expect(payload).not.toContain(prefix);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Critério de saída do spike
// ─────────────────────────────────────────────────────────────────────────────

describe('Spike A · critério de saída', () => {
  it('SHA-256 próprio bate com os vetores conhecidos', () => {
    // Sem esses vetores o hash poderia estar consistentemente errado e os testes
    // de determinismo passariam mesmo assim.
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('o payload canônico é estável entre execuções repetidas', () => {
    const { model, levelId } = withLevel();
    const build = () => applyBatch(model, [...room(levelId, 0, 0, 4000, 3000)]).model;

    const runs = Array.from({ length: 5 }, build).map(canonicalPayload);
    expect(new Set(runs).size).toBe(1);
  });

  it('o payload canônico não carrega ID volátil nem estado do alocador', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000));
    const payload = canonicalPayload(built.model);

    expect(payload).not.toContain('wal_');
    expect(payload).not.toContain('seq');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Nome de ambiente (etiqueta ancorada)
// ─────────────────────────────────────────────────────────────────────────────

describe('nome de ambiente', () => {
  function salaNomeada(nome = 'Cozinha') {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000)).model;
    return {
      levelId,
      built,
      nomeada: applyCommand(built, {
        type: 'NameSpace',
        spaceId: built.spaces[0].id,
        name: nome,
      }).model,
    };
  }

  it('o nome aparece no ambiente', () => {
    const { nomeada } = salaNomeada();
    expect(nomeada.spaces[0].name).toBe('Cozinha');
  });

  it('O QUE ESTE RECURSO EXISTE PARA FAZER: o nome sobrevive a mudar a geometria', () => {
    // Ambiente é DERIVADO: a cada rederivação os `Space` são recriados, e o id
    // deles é posicional. Um nome guardado por `spaceId` não some — faz coisa
    // pior: reaparece colado no ambiente ERRADO quando a ordem muda.
    //
    // Este caso passa por um estado INTERMEDIÁRIO em que a sala está aberta e
    // não existe ambiente nenhum. A etiqueta é persistente, não derivada, então
    // atravessa o buraco e volta a colar quando a sala fecha de novo.
    const { nomeada } = salaNomeada();
    const direita = nomeada.walls.find((w) => w.a.x === 4000 && w.b.x === 4000)!;
    const topo = nomeada.walls.find((w) => w.a.y === 3000 && w.b.y === 3000)!;

    const aberta = applyCommand(nomeada, {
      type: 'MoveVertex',
      wallId: direita.id,
      end: 'b',
      to: point(6000, 3000),
    }).model;
    expect(aberta.spaces, 'a sala precisa ficar aberta no meio do caminho').toHaveLength(0);
    expect(aberta.labels, 'a etiqueta não pode sumir com o ambiente').toHaveLength(1);

    const maior = applyCommand(aberta, {
      type: 'MoveVertex',
      wallId: topo.id,
      end: 'a',
      to: point(6000, 3000),
    }).model;

    expect(maior.spaces).toHaveLength(1);
    expect(maior.spaces[0].name, 'o nome tinha que ter voltado').toBe('Cozinha');
    // E é outra sala: virou trapézio, base 4,00 e topo 6,00 com 3,00 de altura.
    //   (4,00 + 6,00) / 2 × 3,00 = 15,00 m²
    expect(maior.spaces[0].areaMm2).toBe(15_000_000);
  });

  it('renomear substitui a etiqueta, não empilha outra', () => {
    const { nomeada } = salaNomeada();
    const rebatizada = applyCommand(nomeada, {
      type: 'NameSpace',
      spaceId: nomeada.spaces[0].id,
      name: 'Sala de jantar',
    }).model;

    expect(rebatizada.labels).toHaveLength(1);
    expect(rebatizada.spaces[0].name).toBe('Sala de jantar');
  });

  it('nome vazio remove a etiqueta', () => {
    const { nomeada } = salaNomeada();
    const limpa = applyCommand(nomeada, {
      type: 'NameSpace',
      spaceId: nomeada.spaces[0].id,
      name: '   ',
    }).model;

    expect(limpa.labels).toHaveLength(0);
    expect(limpa.spaces[0].name).toBeUndefined();
  });

  it('o nome é CONTEÚDO: renomear muda o hash', () => {
    // Se não mudasse, publicar depois de renomear seria idempotente pela regra
    // (ramo, revisão, hash) e o nome nunca chegaria ao snapshot.
    const { built, nomeada } = salaNomeada();
    expect(snapshotHash(nomeada)).not.toBe(snapshotHash(built));
  });

  it('o nome atravessa o ciclo canônico de ida e volta', () => {
    const { nomeada } = salaNomeada();
    const voltou = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(nomeada)));

    expect(voltou.spaces[0].name).toBe('Cozinha');
    expect(snapshotHash(voltou)).toBe(snapshotHash(nomeada));
  });

  it('etiqueta não vaza para o ambiente vizinho', () => {
    const { model, levelId } = withLevel();
    const duas = applyBatch(model, [
      ...room(levelId, 0, 0, 6000, 3000),
      wall(levelId, 3000, 0, 3000, 3000),
    ]).model;

    const nomeada = applyCommand(duas, {
      type: 'NameSpace',
      spaceId: duas.spaces[0].id,
      name: 'Banheiro',
    }).model;

    expect(nomeada.spaces.filter((s) => s.name === 'Banheiro')).toHaveLength(1);
    expect(nomeada.spaces.filter((s) => s.name === undefined)).toHaveLength(1);
  });

  it('a âncora cai dentro mesmo num ambiente em "L"', () => {
    // O centroide de um "L" cai FORA dele. Se a âncora fosse o centroide, o nome
    // sumiria na primeira rederivação — e sem aviso.
    const emL = [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 2000 },
      { x: 2000, y: 2000 },
      { x: 2000, y: 6000 },
      { x: 0, y: 6000 },
    ];
    const p = interiorPoint(emL);
    expect(pointInPolygon(emL, p), `âncora ${p.x},${p.y} caiu fora do L`).toBe(true);
  });

  it('a âncora não cai dentro de um buraco', () => {
    const anel = [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 10000 },
      { x: 0, y: 10000 },
    ];
    const buraco = [
      { x: 2000, y: 2000 },
      { x: 8000, y: 2000 },
      { x: 8000, y: 8000 },
      { x: 2000, y: 8000 },
    ];
    const p = interiorPoint(anel, [buraco]);

    expect(pointInPolygon(anel, p)).toBe(true);
    expect(pointInPolygon(buraco, p), 'a âncora caiu no vazio central').toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Trava ortogonal
// ─────────────────────────────────────────────────────────────────────────────

describe('trava ortogonal', () => {
  it('projeta no eixo de MAIOR deslocamento', () => {
    const de = point(0, 0);
    // Mais longe em x que em y: vira horizontal.
    expect(travarOrtogonal(de, point(4000, 200))).toEqual({ x: 4000, y: 0 });
    // Mais longe em y: vira vertical.
    expect(travarOrtogonal(de, point(200, 4000))).toEqual({ x: 0, y: 4000 });
  });

  it('O DEFEITO QUE ELA IMPEDE: um passo de grade fora do esquadro', () => {
    // Caso real. A ponta encaixou na grade de 200 mm, mas 200 mm ACIMA da
    // outra: a parede saiu com 2,6° de inclinação, invisível na escala da tela,
    // e só apareceu quando o desenho foi aberto no CAD.
    const de = point(0, 0);
    const torto = point(4400, 200);

    expect(travarOrtogonal(de, torto)).toEqual({ x: 4400, y: 0 });
  });

  it('o resultado CONTINUA na grade', () => {
    // A trava roda depois do encaixe, e copia uma coordenada da âncora — que já
    // está na grade. Travar antes de encaixar devolveria o ponto para fora dela.
    const de = point(1000, 2000);
    const encaixado = point(3400, 2600);
    const travado = travarOrtogonal(de, encaixado);

    expect(travado.x % 200).toBe(0);
    expect(travado.y % 200).toBe(0);
  });

  it('no empate a escolha é estável, não oscila', () => {
    // Qual eixo vence num deslocamento igual é arbitrário. O que não pode é a
    // mesma posição devolver respostas diferentes.
    const de = point(0, 0);
    const diagonal = point(1000, 1000);
    const a = travarOrtogonal(de, diagonal);
    const b = travarOrtogonal(de, diagonal);

    expect(a).toEqual(b);
  });

  it('travar duas vezes não muda o resultado', () => {
    const de = point(0, 0);
    const uma = travarOrtogonal(de, point(4000, 300));
    expect(travarOrtogonal(de, uma)).toEqual(uma);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Alinhamento do traçado: eixo × face
// ─────────────────────────────────────────────────────────────────────────────

describe('eixoDaParede', () => {
  it('pelo EIXO devolve o traçado intacto', () => {
    const t = { a: point(0, 0), b: point(4000, 0) };
    expect(eixoDaParede(t, 200, 'EIXO')).toEqual(t);
    // Com vizinhos também: no eixo não existe mitra a aplicar.
    expect(eixoDaParede(t, 200, 'EIXO', { antes: point(0, 3000) })).toEqual(t);
  });

  it('pela FACE, o traçado é a face e a parede cresce para o lado pedido', () => {
    // Y do modelo aponta para CIMA. Andando em +x, "à direita" é −y.
    const t = { a: point(0, 0), b: point(4000, 0) };
    expect(eixoDaParede(t, 200, 'DIREITA')).toEqual({
      a: { x: 0, y: -100 },
      b: { x: 4000, y: -100 },
    });
    expect(eixoDaParede(t, 200, 'ESQUERDA')).toEqual({
      a: { x: 0, y: 100 },
      b: { x: 4000, y: 100 },
    });
  });

  it('o CLIQUE fica no canto do corpo da parede, não no meio da espessura', () => {
    // É o pedido de uso: apontando o canto que está na planta de fundo, a parede
    // tem de nascer inteira para dentro dele. Prova: o ponto clicado é um dos
    // quatro cantos do corpo resultante.
    const clicado = point(1000, 2000);
    const eixo = eixoDaParede({ a: clicado, b: point(5000, 2000) }, 150, 'DIREITA');
    const cantos = cantosDaParede(eixo.a, eixo.b, 150);

    expect(cantos).toContainEqual({ x: clicado.x, y: clicado.y });
  });

  it('MITRA o canto: as duas paredes se encontram num único vértice', () => {
    // Contorno pelo lado de fora, sentido do relógio na tela, parede à direita
    // (= para dentro). O canto do eixo tem de recuar meia espessura nos DOIS
    // eixos, senão as pontas ficam a meia espessura uma da outra.
    const p0 = point(0, 3000);
    const p1 = point(4000, 3000);
    const p2 = point(4000, 0);

    const primeiro = eixoDaParede({ a: p0, b: p1 }, 200, 'DIREITA');
    const segundo = eixoDaParede({ a: p1, b: p2 }, 200, 'DIREITA', { antes: p0 });

    expect(segundo.a).toEqual({ x: 3900, y: 2900 });
    // A ponta do primeiro, corrigida pelo trecho seguinte, cai no MESMO ponto.
    const primeiroCorrigido = eixoDaParede({ a: p0, b: p1 }, 200, 'DIREITA', { depois: p2 });
    expect(primeiroCorrigido.b).toEqual(segundo.a);
    // E sem a correção ela ficava fora — este é o defeito que a mitra evita.
    expect(primeiro.b).not.toEqual(segundo.a);
  });

  it('O CONTORNO FECHA: quatro trechos mitrados formam um retângulo de eixos', () => {
    // Sem mitra, cada canto sobra meia espessura e o arranjo planar não fecha
    // ambiente nenhum — o sintoma é a lista de ambientes vazia depois de uma
    // sala inteira desenhada.
    const t = 200;
    const p = [point(0, 3000), point(4000, 3000), point(4000, 0), point(0, 0)];
    const eixos = p.map((_, i) =>
      eixoDaParede(
        { a: p[i], b: p[(i + 1) % 4] },
        t,
        'DIREITA',
        { antes: p[(i + 3) % 4], depois: p[(i + 2) % 4] },
      ),
    );

    for (let i = 0; i < 4; i++) {
      expect(eixos[i].b, `canto ${i} não fechou`).toEqual(eixos[(i + 1) % 4].a);
    }
    // O eixo é o retângulo original encolhido em meia espessura de cada lado.
    const xs = eixos.map((e) => e.a.x);
    const ys = eixos.map((e) => e.a.y);
    expect(Math.min(...xs)).toBe(100);
    expect(Math.max(...xs)).toBe(3900);
    expect(Math.min(...ys)).toBe(100);
    expect(Math.max(...ys)).toBe(2900);
  });

  it('o modelo ACEITA o contorno mitrado e ele deriva um ambiente', () => {
    // O teste de verdade: o kernel fecha ambiente com esses eixos. Prova que a
    // conta não é só bonita — é topologicamente válida.
    const t = 200;
    const { model, levelId } = withLevel();
    const p = [point(0, 3000), point(4000, 3000), point(4000, 0), point(0, 0)];
    const comandos: Command[] = p.map((_, i) => {
      const eixo = eixoDaParede(
        { a: p[i], b: p[(i + 1) % 4] },
        t,
        'DIREITA',
        { antes: p[(i + 3) % 4], depois: p[(i + 2) % 4] },
      );
      return {
        type: 'AddWall',
        levelId,
        a: eixo.a,
        b: eixo.b,
        thicknessMm: t,
        heightMm: H,
      };
    });

    const pronto = applyBatch(model, comandos).model;

    expect(pronto.spaces.length).toBe(1);
    // 3800 × 2800 mm de eixo a eixo.
    expect(pronto.spaces[0].areaMm2).toBe(3800 * 2800);
  });

  it('trecho colinear não inventa canto', () => {
    // Continuar em linha reta: as faces deslocadas são a MESMA reta, não há
    // interseção, e a ponta só pode ser deslocada em reta.
    const eixo = eixoDaParede({ a: point(2000, 0), b: point(4000, 0) }, 200, 'DIREITA', {
      antes: point(0, 0),
    });
    expect(eixo.a).toEqual({ x: 2000, y: -100 });
  });

  it('canto agudo demais NÃO produz farpa quilométrica', () => {
    // A interseção das faces vai para longe quando a dobra é rasa. Com o teto da
    // mitra, a ponta volta ao deslocamento em reta: falha visível de meia
    // espessura em vez de coordenada absurda (que o kernel recusaria).
    const q = point(0, 0);
    const eixo = eixoDaParede({ a: q, b: point(10_000, 0) }, 200, 'DIREITA', {
      antes: point(-10_000, 60),
    });
    expect(Math.hypot(eixo.a.x - q.x, eixo.a.y - q.y)).toBeLessThanOrEqual(100 * 4);
  });

  it('traço degenerado devolve o traçado, sem estourar', () => {
    const t = { a: point(500, 500), b: point(500, 500) };
    expect(eixoDaParede(t, 200, 'DIREITA')).toEqual(t);
  });
});

describe('extensaoDeCanto', () => {
  /** Duas paredes de 200 mm partindo de (0,0), com o ângulo pedido entre elas. */
  function canto(grausEntreEixos: number): { walls: Wall[]; alvo: Wall } {
    const r = 4000;
    const rad = (grausEntreEixos * Math.PI) / 180;
    const a: Wall = {
      id: 'wal_0001',
      levelId: 'lvl_0001',
      a: point(0, 0),
      b: point(r, 0),
      thicknessMm: 200,
      heightMm: H,
    };
    const b: Wall = {
      id: 'wal_0002',
      levelId: 'lvl_0001',
      a: point(0, 0),
      b: point(Math.round(r * Math.cos(rad)), Math.round(r * Math.sin(rad))),
      thicknessMm: 200,
      heightMm: H,
    };
    return { walls: [a, b], alvo: a };
  }

  it('em 90° dá meia espessura — o valor que estava cravado no código', () => {
    // Toda planta ortogonal desenha exatamente como desenhava. É o que torna a
    // correção segura para o acervo: só muda o que estava errado.
    const { walls, alvo } = canto(90);
    expect(extensaoDeCanto(walls, alvo, 'a')).toBeCloseTo(100, 6);
  });

  it('CANTO OBTUSO avança MENOS — era aqui que sobrava farpa', () => {
    // Hexágono: 120° entre os eixos. Meia espessura ultrapassaria o canto
    // verdadeiro, e a silhueta de cada parede aparecia além dele.
    const { walls, alvo } = canto(120);
    const esperado = 100 / Math.tan((120 * Math.PI) / 180 / 2);
    expect(extensaoDeCanto(walls, alvo, 'a')).toBeCloseTo(esperado, 0);
    expect(extensaoDeCanto(walls, alvo, 'a')).toBeLessThan(100);
  });

  it('canto AGUDO avança mais — meia espessura deixaria degrau', () => {
    const { walls, alvo } = canto(60);
    expect(extensaoDeCanto(walls, alvo, 'a')).toBeGreaterThan(100);
  });

  it('canto agudo demais é limitado, para não virar farpa quilométrica', () => {
    const { walls, alvo } = canto(1);
    expect(extensaoDeCanto(walls, alvo, 'a')).toBeLessThanOrEqual(100 * 4);
  });

  it('quase colinear quase não avança — não há canto para fechar', () => {
    const { walls, alvo } = canto(179);
    expect(extensaoDeCanto(walls, alvo, 'a')).toBeLessThan(5);
  });

  it('ponta LIVRE não avança — a parede ficaria mais longa do que é', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [wall(levelId, 0, 0, 4000, 0)]).model;
    expect(extensaoDeCanto(built.walls, built.walls[0], 'a')).toBe(0);
    expect(extensaoDeCanto(built.walls, built.walls[0], 'b')).toBe(0);
  });

  it('junção em X mantém meia espessura — não há canto único para mitrar', () => {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, [
      wall(levelId, 0, 0, 4000, 0),
      wall(levelId, 0, 0, 0, 4000),
      wall(levelId, 0, 0, -4000, 0),
    ]).model;
    expect(extensaoDeCanto(built.walls, built.walls[0], 'a')).toBe(T / 2);
  });
});

describe('poligonoRegular', () => {
  const raio = (c: Point, p: Point) => Math.hypot(p.x - c.x, p.y - c.y);
  const lado = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

  it('devolve um vértice por lado, todos no raio pedido', () => {
    const centro = point(0, 0);
    const v = poligonoRegular(centro, 5000, 6);

    expect(v).toHaveLength(6);
    for (const p of v) expect(raio(centro, p)).toBeCloseTo(5000, 0);
  });

  it('todos os lados saem iguais — é o que "regular" quer dizer', () => {
    const v = poligonoRegular(point(1000, 2000), 4000, 8);
    const lados = v.map((p, i) => lado(p, v[(i + 1) % v.length]));

    for (const l of lados) expect(l).toBeCloseTo(lados[0], 0);
  });

  it('o ângulo posiciona o PRIMEIRO vértice — é o cursor que gira o polígono', () => {
    const centro = point(0, 0);
    // 0 rad = eixo +x.
    expect(poligonoRegular(centro, 1000, 4, 0)[0]).toEqual({ x: 1000, y: 0 });
    // 90° = +y do modelo, que é para CIMA na tela.
    expect(poligonoRegular(centro, 1000, 4, Math.PI / 2)[0]).toEqual({ x: 0, y: 1000 });
  });

  it('SENTIDO HORÁRIO NA TELA — é o que faz a parede nascer para dentro', () => {
    // O Y do modelo aponta para cima, então horário na tela é área com sinal
    // NEGATIVO. Gerar ao contrário faria o polígono crescer para fora do que se
    // apontou no alinhamento "à direita", sem nada explicando na tela.
    //
    // Laço do agrimensor à mão: o `signedArea` do kernel é interno, e alargar a
    // superfície pública só para um teste seria pior que quatro linhas aqui.
    const v = poligonoRegular(point(0, 0), 3000, 5);
    const areaComSinal = v.reduce((soma, p, i) => {
      const q = v[(i + 1) % v.length];
      return soma + (p.x * q.y - q.x * p.y);
    }, 0);

    expect(areaComSinal).toBeLessThan(0);
  });

  it('entrada degenerada devolve vazio, sem levantar erro', () => {
    // Roda a cada movimento do mouse na prévia: exceção aqui derrubaria a aba.
    expect(poligonoRegular(point(0, 0), 0, 6)).toEqual([]);
    expect(poligonoRegular(point(0, 0), -100, 6)).toEqual([]);
    expect(poligonoRegular(point(0, 0), 1000, 2)).toEqual([]);
    expect(poligonoRegular(point(0, 0), 1000, 6.5)).toEqual([]);
  });

  it('raio pequeno demais para o número de lados devolve vazio', () => {
    // Com 12 lados num raio de 1 mm, os vértices a −30° e −60° caem os dois em
    // (1, −1) depois do arredondamento ao milímetro, e o kernel recusaria a
    // parede de comprimento zero. Melhor não oferecer o polígono.
    expect(poligonoRegular(point(0, 0), 1, 12)).toEqual([]);

    // O mesmo raio com 4 lados continua válido: o problema é a relação entre
    // raio e número de lados, não o raio sozinho.
    expect(poligonoRegular(point(0, 0), 1, 4)).toHaveLength(4);
  });

  it('O CONTORNO FECHA e deriva UM ambiente, com os cantos mitrados', () => {
    // O caso que importa: o polígono não é só desenho, tem que produzir
    // ambiente. Mesma montagem que o canvas faz — cada lado consulta os dois
    // vizinhos do contorno.
    const { model, levelId } = withLevel();
    const v = poligonoRegular(point(0, 0), 6000, 6);
    const n = v.length;

    const comandos: Command[] = v.map((_, i) => {
      const eixo = eixoDaParede({ a: v[i], b: v[(i + 1) % n] }, 200, 'DIREITA', {
        antes: v[(i + n - 1) % n],
        depois: v[(i + 2) % n],
      });
      return {
        type: 'AddWall',
        levelId,
        a: eixo.a,
        b: eixo.b,
        thicknessMm: 200,
        heightMm: H,
      };
    });

    const pronto = applyBatch(model, comandos).model;

    expect(pronto.walls).toHaveLength(6);
    expect(pronto.spaces).toHaveLength(1);
    // Cada canto é um vértice compartilhado: a ponta de um lado é o começo do
    // seguinte. Sem a mitra, ficariam a meia espessura umas das outras.
    for (let i = 0; i < n; i++) {
      const atual = pronto.walls[i];
      const proxima = pronto.walls[(i + 1) % n];
      expect(atual.b, `canto ${i} não fechou`).toEqual(proxima.a);
    }
  });
});

describe('retanguloPorCantos', () => {
  it('os dois cantos CLICADOS são cantos do retângulo', () => {
    // É o pedido: "o ponto inicial deve ser no canto". Clica um canto, arrasta
    // até o oposto — o gesto de fazer um cômodo depressa.
    const v = retanguloPorCantos(point(1000, 2000), point(5000, 6000));

    expect(v).toHaveLength(4);
    expect(v).toContainEqual({ x: 1000, y: 2000 });
    expect(v).toContainEqual({ x: 5000, y: 6000 });
  });

  it('sai sempre alinhado aos eixos — lado nenhum sai torto', () => {
    const v = retanguloPorCantos(point(0, 0), point(4000, 3000));
    for (let i = 0; i < 4; i++) {
      const a = v[i];
      const b = v[(i + 1) % 4];
      // Cada lado é horizontal OU vertical, nunca oblíquo.
      expect(a.x === b.x || a.y === b.y, `lado ${i} saiu torto`).toBe(true);
    }
  });

  it('TANTO FAZ de qual canto se arrasta — os 4 caminhos dão o mesmo contorno', () => {
    // O contorno é normalizado para o sentido horário da tela. Sem isso,
    // arrastar da direita para a esquerda inverteria o sentido e a parede
    // nasceria para FORA no alinhamento "à direita".
    const alvo = retanguloPorCantos(point(0, 0), point(4000, 3000));
    for (const [p, q] of [
      [point(4000, 3000), point(0, 0)],
      [point(0, 3000), point(4000, 0)],
      [point(4000, 0), point(0, 3000)],
    ] as const) {
      expect(retanguloPorCantos(p, q)).toEqual(alvo);
    }
  });

  it('sentido HORÁRIO na tela, como o polígono', () => {
    const v = retanguloPorCantos(point(0, 0), point(4000, 3000));
    const areaComSinal = v.reduce((soma, p, i) => {
      const q = v[(i + 1) % v.length];
      return soma + (p.x * q.y - q.x * p.y);
    }, 0);
    expect(areaComSinal).toBeLessThan(0);
  });

  it('cantos na mesma linha ou coluna não formam retângulo', () => {
    expect(retanguloPorCantos(point(0, 0), point(4000, 0))).toEqual([]);
    expect(retanguloPorCantos(point(0, 0), point(0, 3000))).toEqual([]);
    expect(retanguloPorCantos(point(0, 0), point(0, 0))).toEqual([]);
  });

  it('vira um ambiente com a área do cômodo, cantos mitrados', () => {
    // A prova que importa: o gesto produz cômodo, não quatro riscos.
    const { model, levelId } = withLevel();
    const v = retanguloPorCantos(point(0, 0), point(5000, 4000));
    const n = v.length;

    const comandos: Command[] = v.map((_, i) => {
      const eixo = eixoDaParede({ a: v[i], b: v[(i + 1) % n] }, 200, 'DIREITA', {
        antes: v[(i + n - 1) % n],
        depois: v[(i + 2) % n],
      });
      return {
        type: 'AddWall',
        levelId,
        a: eixo.a,
        b: eixo.b,
        thicknessMm: 200,
        heightMm: H,
      };
    });

    const pronto = applyBatch(model, comandos).model;
    expect(pronto.walls).toHaveLength(4);
    expect(pronto.spaces).toHaveLength(1);
    // Traçado 5000 × 4000 pela face, parede de 200: eixo 4800 × 3800.
    expect(pronto.spaces[0].areaMm2).toBe(4800 * 3800);
  });
});

describe('poligonoPeloLado', () => {
  it('O QUADRADO SAI ALINHADO AOS EIXOS, não como losango', () => {
    // DEFEITO RELATADO EM USO (16/08/2026, com print): a ferramenta media pelo
    // VÉRTICE, então arrastar na horizontal punha as esquinas nos eixos e o
    // quadrado nascia girado 45° em relação à planta ortogonal.
    //
    // Medindo pelo lado, arrastar na horizontal deixa dois lados verticais e
    // dois horizontais — que é o que a planta pede.
    const v = poligonoPeloLado(point(0, 0), 2000, 4, 0);

    expect(v).toHaveLength(4);
    // Os quatro cantos de um quadrado 4000 × 4000 centrado na origem.
    expect([...v].sort((a, b) => a.x - b.x || a.y - b.y)).toEqual([
      { x: -2000, y: -2000 },
      { x: -2000, y: 2000 },
      { x: 2000, y: -2000 },
      { x: 2000, y: 2000 },
    ]);
  });

  it('a distância arrastada é a APÓTEMA — metade da medida do quadrado', () => {
    // Arrastar 2 m dá um cômodo de 4 × 4 m. Medindo pelo vértice, os mesmos
    // 2 m dariam 2,83 m de lado, que ninguém consegue prever enquanto desenha.
    const v = poligonoPeloLado(point(0, 0), 2000, 4, 0);
    const lado = Math.hypot(v[1].x - v[0].x, v[1].y - v[0].y);
    expect(lado).toBeCloseTo(4000, 0);
  });

  it('todo polígono de lados PARES fica alinhado ao arrastar num eixo', () => {
    // É a consequência que importa em planta: com a trava ortogonal ligada, o
    // arraste cai sempre num eixo, e aí todo par nasce alinhado.
    for (const lados of [4, 6, 8, 10, 12]) {
      const v = poligonoPeloLado(point(0, 0), 3000, lados, 0);
      // O lado sob o cursor é vertical: seus dois vértices têm o mesmo x.
      expect(v[0].x, `${lados} lados`).toBe(v[1].x);
    }
  });

  it('mantém o sentido horário na tela, como o polígono por vértice', () => {
    const v = poligonoPeloLado(point(0, 0), 3000, 6, 0);
    const areaComSinal = v.reduce((soma, p, i) => {
      const q = v[(i + 1) % v.length];
      return soma + (p.x * q.y - q.x * p.y);
    }, 0);
    expect(areaComSinal).toBeLessThan(0);
  });

  it('entrada degenerada devolve vazio, sem levantar erro', () => {
    expect(poligonoPeloLado(point(0, 0), 0, 6)).toEqual([]);
    expect(poligonoPeloLado(point(0, 0), 3000, 2)).toEqual([]);
  });
});

describe('cantosDaParede', () => {
  it('devolve os quatro cantos do corpo', () => {
    expect(cantosDaParede(point(0, 0), point(4000, 0), 200)).toEqual([
      { x: 0, y: 100 },
      { x: 4000, y: 100 },
      { x: 4000, y: -100 },
      { x: 0, y: -100 },
    ]);
  });

  it('AVANÇA a ponta que encontra outra parede — é lá que está o canto visível', () => {
    // O avanço vem em MILÍMETRO, e quem chama passa exatamente o que o desenho
    // usa (`extensaoDeCanto`). Aqui, os 100 mm de um canto reto.
    const cantos = cantosDaParede(point(0, 0), point(4000, 0), 200, 0, 100);
    expect(cantos).toContainEqual({ x: 4100, y: 100 });
    expect(cantos).toContainEqual({ x: 4100, y: -100 });
    expect(cantos).toContainEqual({ x: 0, y: 100 });
  });

  it('CANTO OBLÍQUO: o avanço vem de fora, e é o do desenho', () => {
    // Foi aqui que encaixe e desenho divergiram por um dia: o desenho passou a
    // avançar pelo ÂNGULO do canto (57,7 mm num hexágono) e o encaixe seguia
    // oferecendo meia espessura (100 mm) — 42 mm além do canto que estava na
    // tela. Passando a mesma medida, não há como divergir.
    const cantos = cantosDaParede(point(0, 0), point(4000, 0), 200, 0, 57.7);
    expect(cantos).toContainEqual({ x: 4058, y: 100 });
  });

  it('parede de comprimento zero não tem canto', () => {
    expect(cantosDaParede(point(0, 0), point(0, 0), 200)).toEqual([]);
  });
});

describe('pontaEsticada', () => {
  it('estica no eixo horizontal', () => {
    expect(pontaEsticada(point(0, 0), point(4000, 0), 5000)).toEqual({ x: 5000, y: 0 });
  });

  it('encolhe: comprimento menor aproxima da âncora', () => {
    expect(pontaEsticada(point(0, 0), point(4000, 0), 1500)).toEqual({ x: 1500, y: 0 });
  });

  it('preserva a DIREÇÃO em parede oblíqua — a parede não gira', () => {
    // Direção 3-4-5, comprimento 5000. Esticando para 10000, o ponto fica no
    // dobro da distância na mesma reta.
    const de = point(0, 0);
    const para = point(3000, 4000);
    const esticado = pontaEsticada(de, para, 10_000);

    expect(esticado).toEqual({ x: 6000, y: 8000 });
    // Mesma direção: o produto vetorial com o segmento original é zero.
    expect(areCollinear(de, para, esticado)).toBe(true);
  });

  it('comprimento zero devolve a própria âncora', () => {
    expect(pontaEsticada(point(1000, 2000), point(5000, 2000), 0)).toEqual({
      x: 1000,
      y: 2000,
    });
  });

  it('âncora e direção iguais não propagam NaN — devolvem a âncora', () => {
    const p = point(2000, 3000);
    expect(pontaEsticada(p, p, 4000)).toEqual(p);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Esticar parede pelo painel de propriedades — o LOTE que arrasta o canto
// ─────────────────────────────────────────────────────────────────────────────

describe('esticar parede arrastando o canto junto (decisão de produto de 12/08/2026)', () => {
  it('sala fechada: esticar uma parede em lote com a vizinha mantém 1 ambiente', () => {
    // Retângulo 4000×3000. `room()` cria, nesta ordem: sul, leste, norte, oeste.
    // A parede SUL termina em (0,0) — encostada na OESTE — e em (4000,0) —
    // encostada na LESTE. As duas pontas estão presas, então a regra "anda a
    // final" manda mexer em `b` (4000,0), e a vizinha que compartilha esse
    // vértice (LESTE, pela ponta `a`) tem que andar JUNTO, no MESMO lote —
    // senão o canto abre e o ambiente desaparece.
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000));
    const [sul, leste] = built.model.walls;
    expect(sul.b).toEqual({ x: 4000, y: 0 });
    expect(leste.a).toEqual({ x: 4000, y: 0 });

    const novaPonta = pontaEsticada(sul.a, sul.b, 5000);
    const lote: Command[] = [
      { type: 'MoveVertex', wallId: sul.id, end: 'b', to: novaPonta },
      { type: 'MoveVertex', wallId: leste.id, end: 'a', to: novaPonta },
    ];
    const depois = applyBatch(built.model, lote).model;

    expect(depois.spaces).toHaveLength(1);
    // Trapézio (0,0)-(5000,0)-(4000,3000)-(0,3000): a parede LESTE, que ficou
    // presa pela ponta oposta ao norte, saiu OBLÍQUA — é a consequência
    // combinada, não um defeito. Área pelo laço do agrimensor.
    expect(depois.spaces[0].areaMm2).toBe(13_500_000);
  });

  it('lote recusado (colapsaria a parede) não deixa o modelo pela metade', () => {
    // `MoveVertex` para cima da OUTRA ponta é uma parede degenerada — o kernel
    // recusa (`assertModelInvariants`/`DEGENERATE_WALL`). Isso tem de abortar o
    // LOTE INTEIRO: se só a correção da vizinha entrasse, o canto ficaria pior
    // do que estava antes do gesto.
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000));
    const [sul, leste] = built.model.walls;

    const lote: Command[] = [
      { type: 'MoveVertex', wallId: sul.id, end: 'b', to: sul.a }, // colapsa
      { type: 'MoveVertex', wallId: leste.id, end: 'a', to: sul.a },
    ];

    expect(() => applyBatch(built.model, lote)).toThrow(KernelError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mover a seleção — `TranslateWalls` (pedido de 19/08/2026)
// ─────────────────────────────────────────────────────────────────────────────

describe('TranslateEntities — mover um conjunto de paredes e limites', () => {
  /** Sala 4000×3000 com uma porta na parede sul, colada no fim dela. */
  function salaComPorta() {
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000));
    const [sul, leste, norte, oeste] = built.model.walls;
    // Porta de 900 mm terminando exatamente em 4000 — o pior caso para
    // `OPENING_OUT_OF_BOUNDS`: qualquer encurtamento da parede a expulsa.
    const comPorta = applyCommand(built.model, {
      type: 'AddOpening',
      wallId: sul.id,
      kind: 'door',
      offsetMm: 3100,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    }).model;
    return { model: comPorta, sul, leste, norte, oeste };
  }

  const comprimentos = (m: BlueprintModel) =>
    Object.fromEntries(m.walls.map((w) => [w.id, wallLength(w)]));

  it('translação rígida preserva TODOS os comprimentos e não expulsa a abertura', () => {
    const { model, sul, leste, norte, oeste } = salaComPorta();
    const antes = comprimentos(model);

    const depois = applyCommand(model, {
      type: 'TranslateEntities',
      wallIds: [sul.id, leste.id, norte.id, oeste.id],
      boundaryIds: [],
      delta: point(2000, -1500),
      arrastarVizinhas: false,
    }).model;

    expect(comprimentos(depois)).toEqual(antes);
    expect(depois.spaces).toHaveLength(1);
    expect(depois.spaces[0].areaMm2).toBe(model.spaces[0].areaMm2);
    const sulDepois = depois.walls.find((w) => w.id === sul.id)!;
    expect(sulDepois.a).toEqual({ x: 2000, y: -1500 });
    expect(sulDepois.b).toEqual({ x: 6000, y: -1500 });
  });

  it('o mesmo gesto por lote de MoveVertex seria RECUSADO — é a razão de o comando existir', () => {
    // Prova a justificativa escrita no cabeçalho do comando: ponta a ponta cria
    // um estado intermediário mais curto, e a porta colada no limite cai fora.
    // Se algum dia isto passar, o comentário do kernel envelheceu junto.
    const { model, sul } = salaComPorta();
    const lote: Command[] = [
      { type: 'MoveVertex', wallId: sul.id, end: 'a', to: point(2000, 0) },
      { type: 'MoveVertex', wallId: sul.id, end: 'b', to: point(6000, 0) },
    ];
    expect(() => applyBatch(model, lote)).toThrow(/OPENING_OUT_OF_BOUNDS|fora da parede/);
  });

  it('sem arrastarVizinhas o bloco DESPRENDE: a vizinha fica onde estava', () => {
    const { model, sul, leste } = salaComPorta();

    const depois = applyCommand(model, {
      type: 'TranslateEntities',
      wallIds: [sul.id],
      boundaryIds: [],
      delta: point(0, -1000),
      arrastarVizinhas: false,
    }).model;

    expect(depois.walls.find((w) => w.id === leste.id)!.a).toEqual({ x: 4000, y: 0 });
    // Desencostou: o anel abriu e não há mais ambiente fechado.
    expect(depois.spaces).toHaveLength(0);
  });

  it('com arrastarVizinhas a ponta da vizinha acompanha — e SÓ ela', () => {
    const { model, sul, leste, oeste } = salaComPorta();
    const compAntes = comprimentos(model);

    const depois = applyCommand(model, {
      type: 'TranslateEntities',
      wallIds: [sul.id],
      boundaryIds: [],
      delta: point(0, -1000),
      arrastarVizinhas: true,
    }).model;

    const lesteDepois = depois.walls.find((w) => w.id === leste.id)!;
    const oesteDepois = depois.walls.find((w) => w.id === oeste.id)!;
    // A ponta compartilhada andou; a do outro extremo NÃO.
    expect(lesteDepois.a).toEqual({ x: 4000, y: -1000 });
    expect(lesteDepois.b).toEqual({ x: 4000, y: 3000 });
    expect(oesteDepois.b).toEqual({ x: 0, y: -1000 });
    expect(oesteDepois.a).toEqual({ x: 0, y: 3000 });
    // Nada desencostou: ambiente fechado, agora 1000 mm mais alto.
    expect(depois.spaces).toHaveLength(1);
    expect(depois.spaces[0].areaMm2).toBe(16_000_000);
    // A vizinha MUDOU de comprimento — é o que distingue esticar de mover.
    expect(wallLength(lesteDepois)).toBe(compAntes[leste.id] + 1000);
    // A selecionada, não.
    expect(wallLength(depois.walls.find((w) => w.id === sul.id)!)).toBe(compAntes[sul.id]);
  });

  it('vizinha que encolheria abaixo da abertura é recusada, e o original fica intacto', () => {
    // Porta ocupando quase toda a parede LESTE. Empurrar a SUL para cima com
    // "esticar" encurta a LESTE, e a porta não cabe mais.
    const { model, levelId } = withLevel();
    const built = applyBatch(model, room(levelId, 0, 0, 4000, 3000));
    const [sul, leste] = built.model.walls;
    const comPorta = applyCommand(built.model, {
      type: 'AddOpening',
      wallId: leste.id,
      kind: 'door',
      offsetMm: 100,
      widthMm: 2800,
      heightMm: 2100,
      sillMm: 0,
    }).model;
    const antes = snapshotHash(comPorta);

    expect(() =>
      applyCommand(comPorta, {
        type: 'TranslateEntities',
        wallIds: [sul.id],
        boundaryIds: [],
        delta: point(0, 2000),
        arrastarVizinhas: true,
      }),
    ).toThrow(KernelError);

    // A cópia antes de validar é o que garante isto: nada ficou pela metade.
    expect(snapshotHash(comPorta)).toBe(antes);
    expect(comPorta.walls.find((w) => w.id === sul.id)!.a).toEqual({ x: 0, y: 0 });
  });

  it('recusa lista vazia, id inexistente e coordenada fora do alcance', () => {
    const { model, sul, leste } = salaComPorta();

    expect(() =>
      applyCommand(model, {
        type: 'TranslateEntities',
        wallIds: [],
        boundaryIds: [],
        delta: point(100, 0),
        arrastarVizinhas: false,
      }),
    ).toThrow(KernelError);

    // Id inexistente no MEIO da lista: nenhuma parede pode ter andado.
    const antes = snapshotHash(model);
    expect(() =>
      applyCommand(model, {
        type: 'TranslateEntities',
        wallIds: [sul.id, 'wal_9999', leste.id],
        boundaryIds: [],
        delta: point(100, 0),
        arrastarVizinhas: false,
      }),
    ).toThrow(KernelError);
    expect(snapshotHash(model)).toBe(antes);

    expect(() =>
      applyCommand(model, {
        type: 'TranslateEntities',
        wallIds: [sul.id],
        boundaryIds: [],
        delta: point(9_000_000, 0),
        arrastarVizinhas: false,
      }),
    ).toThrow(KernelError);

    // Delta zero não é erro — o canvas já não emite, e o kernel não precisa de
    // uma segunda trava para a mesma coisa.
    const parado = applyCommand(model, {
      type: 'TranslateEntities',
      wallIds: [sul.id],
      boundaryIds: [],
      delta: point(0, 0),
      arrastarVizinhas: false,
    });
    expect(parado.hash).toBe(antes);
  });

  it('delta fracionário é arredondado a milímetro inteiro, não propagado', () => {
    const { model, sul } = salaComPorta();
    const depois = applyCommand(model, {
      type: 'TranslateEntities',
      wallIds: [sul.id],
      boundaryIds: [],
      delta: { x: 1000.4, y: -999.6 },
      arrastarVizinhas: false,
    }).model;
    expect(depois.walls.find((w) => w.id === sul.id)!.a).toEqual({ x: 1000, y: -1000 });
  });

  it('um gesto é UM passo de desfazer, mesmo movendo o desenho inteiro', () => {
    const { model, sul, leste, norte, oeste } = salaComPorta();
    const historico = new ModelHistory(model);
    historico.apply({
      type: 'TranslateEntities',
      wallIds: [sul.id, leste.id, norte.id, oeste.id],
      boundaryIds: [],
      delta: point(500, 500),
      arrastarVizinhas: false,
    });
    expect(historico.current.walls.find((w) => w.id === sul.id)!.a).toEqual({ x: 500, y: 500 });

    historico.undo();
    expect(historico.current.walls.find((w) => w.id === sul.id)!.a).toEqual({ x: 0, y: 0 });
    expect(historico.canUndo).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Limites de primeira classe — a ferramenta de Terreno (pedido de 21/08/2026)
// ─────────────────────────────────────────────────────────────────────────────

describe('Boundary — mover, apagar e validar', () => {
  /** Lote triangular fechado, só de limites de TERRENO. */
  function lote() {
    const { model, levelId } = withLevel();
    const cantos = [point(0, 0), point(10_000, 0), point(10_000, 8000)];
    const built = applyBatch(
      model,
      cantos.map((a, i) => ({
        type: 'AddBoundary' as const,
        levelId,
        a,
        b: cantos[(i + 1) % cantos.length],
        kind: 'TERRENO' as const,
      })),
    );
    return { model: built.model, levelId, cantos };
  }

  it('⚠️ anel de TERRENO NÃO vira ambiente — senão o lote entraria como PISO', () => {
    // Boundary sempre participou do arranjo planar, e um anel fechado dele
    // produzia um `Space`. Para o contorno de LOTE isso é estrago, não recurso:
    // `computeQuantities` deriva piso de cada ambiente, e uma casa de 18,67 m²
    // num lote de 30×30 passava a somar 900 m² de piso no orçamento. Era o mesmo
    // dano que desenhar o lote com a ferramenta Parede faria com alvenaria — só
    // que na outra linha da planilha.
    const { model } = lote();
    expect(model.boundaries).toHaveLength(3);
    expect(model.spaces).toHaveLength(0);
  });

  it('mas DIVISA continua dividindo ambiente, como sempre dividiu', () => {
    // A separação só existe porque os dois casos são diferentes de verdade:
    // divisória sem material é geometria de cômodo; contorno de lote não é.
    const { model, levelId } = withLevel();
    const sala = applyBatch(model, room(levelId, 0, 0, 6000, 3000)).model;
    expect(sala.spaces).toHaveLength(1);

    const dividida = applyCommand(sala, {
      type: 'AddBoundary',
      levelId,
      a: point(3000, 0),
      b: point(3000, 3000),
      kind: 'DIVISA',
    }).model;
    expect(dividida.spaces).toHaveLength(2);
  });

  it('desenhar o lote não muda uma linha do quantitativo', () => {
    const { model, levelId } = withLevel();
    const casa = applyBatch(model, room(levelId, 0, 0, 5000, 4000)).model;
    const antes = computeQuantities(casa).totais.areaPisoM2;

    const comLote = applyBatch(casa, [
      [-5000, -5000, 25_000, -5000],
      [25_000, -5000, 25_000, 25_000],
      [25_000, 25_000, -5000, 25_000],
      [-5000, 25_000, -5000, -5000],
    ].map(([ax, ay, bx, by]) => ({
      type: 'AddBoundary' as const,
      levelId,
      a: point(ax, ay),
      b: point(bx, by),
      kind: 'TERRENO' as const,
    }))).model;

    expect(computeQuantities(comLote).totais.areaPisoM2).toBe(antes);
    expect(comLote.spaces).toHaveLength(casa.spaces.length);
  });

  it('MoveBoundaryVertex move a ponta e recusa colapsar o limite', () => {
    const { model } = lote();
    const primeiro = model.boundaries[0];

    const depois = applyCommand(model, {
      type: 'MoveBoundaryVertex',
      boundaryId: primeiro.id,
      end: 'b',
      to: point(12_000, 0),
    }).model;
    expect(depois.boundaries.find((b) => b.id === primeiro.id)!.b).toEqual({ x: 12_000, y: 0 });

    expect(() =>
      applyCommand(model, {
        type: 'MoveBoundaryVertex',
        boundaryId: primeiro.id,
        end: 'b',
        to: primeiro.a,
      }),
    ).toThrow(KernelError);
  });

  it('DeleteBoundary tira a divisa do modelo', () => {
    const { model } = lote();
    const alvo = model.boundaries[0].id;
    const depois = applyCommand(model, { type: 'DeleteBoundary', boundaryId: alvo }).model;
    expect(depois.boundaries).toHaveLength(2);
    expect(depois.boundaries.some((b) => b.id === alvo)).toBe(false);
  });

  it('SetBoundaryPapel grava qual recuo se aplica àquela divisa', () => {
    const { model } = lote();
    const alvo = model.boundaries[0];
    const depois = applyCommand(model, {
      type: 'SetBoundaryPapel',
      boundaryId: alvo.id,
      papel: 'FRENTE',
    }).model;
    expect(depois.boundaries.find((b) => b.id === alvo.id)!.papel).toBe('FRENTE');
  });

  it('SetBoundaryEscritura grava a medida da matrícula SEM mexer no desenho', () => {
    // O ponto do campo é justamente guardar as duas: o que foi levantado e o que
    // o título diz. "Corrigir" a geometria para a escritura apagaria a
    // divergência, que é a informação que se quer ver.
    const { model } = lote();
    const alvo = model.boundaries[0];
    const depois = applyCommand(model, {
      type: 'SetBoundaryEscritura',
      boundaryId: alvo.id,
      medidaMm: 9800,
      confrontante: 'Rua das Acácias',
    }).model;

    const gravada = depois.boundaries.find((b) => b.id === alvo.id)!;
    expect(gravada.medidaEscrituraMm).toBe(9800);
    expect(gravada.confrontante).toBe('Rua das Acácias');
    expect(gravada.a).toEqual(alvo.a);
    expect(gravada.b).toEqual(alvo.b);
  });

  it('confrontante em branco vira null, não string vazia', () => {
    // String vazia passa por "informado" em toda checagem de presença e desenharia
    // uma coluna de confrontantes cheia de nada.
    const { model } = lote();
    const alvo = model.boundaries[0];
    const depois = applyCommand(model, {
      type: 'SetBoundaryEscritura',
      boundaryId: alvo.id,
      medidaMm: null,
      confrontante: '   ',
    }).model;

    const gravada = depois.boundaries.find((b) => b.id === alvo.id)!;
    expect(gravada.confrontante).toBeNull();
    expect(gravada.medidaEscrituraMm).toBeNull();
  });

  it('recusa medida de escritura fracionária — ela é SUBTRAÍDA da desenhada', () => {
    const { model } = lote();
    expect(() =>
      applyCommand(model, {
        type: 'SetBoundaryEscritura',
        boundaryId: model.boundaries[0].id,
        medidaMm: 9800.4,
        confrontante: null,
      }),
    ).toThrow(KernelError);
  });

  it('SetAreaEscritura guarda a área do título, e null a tira', () => {
    const { model } = lote();
    const com = applyCommand(model, { type: 'SetAreaEscritura', areaMm2: 360_000_000 }).model;
    expect(com.areaEscrituraMm2).toBe(360_000_000);

    const sem = applyCommand(com, { type: 'SetAreaEscritura', areaMm2: null }).model;
    expect(sem.areaEscrituraMm2).toBeNull();
  });

  it('recusa área de escritura negativa — lote de área zero não existe em matrícula', () => {
    const { model } = lote();
    expect(() => applyCommand(model, { type: 'SetAreaEscritura', areaMm2: -1 })).toThrow(
      KernelError,
    );
  });

  it('recusa limite de comprimento zero — a guarda que faltava', () => {
    // Enquanto nenhuma UI criava limite, isto era inalcançável. Desenhando lote
    // por clique, vira um clique duplo no mesmo vértice: a aresta nula some do
    // anel dentro do arranjo planar SEM ERRO, e a área do lote sai menor.
    const { model, levelId } = withLevel();
    expect(() =>
      applyCommand(model, {
        type: 'AddBoundary',
        levelId,
        a: point(1000, 1000),
        b: point(1000, 1000),
        kind: 'TERRENO',
      }),
    ).toThrow(KernelError);
  });

  it('kind omitido continua sendo DIVISA — o chamador antigo não decide sobre terreno', () => {
    const { model, levelId } = withLevel();
    const depois = applyCommand(model, {
      type: 'AddBoundary',
      levelId,
      a: point(0, 0),
      b: point(3000, 0),
    }).model;
    expect(depois.boundaries[0].kind).toBe('DIVISA');
    expect(depois.boundaries[0].papel).toBeNull();
  });

  it('a escritura sobrevive ao round-trip do payload canônico', () => {
    // É a razão de ela morar DENTRO do payload: `modelFromCanonicalPayload`
    // reconstrói os limites com ids `bnd_` NOVOS, então qualquer tabela ao lado
    // chaveada por id perderia o vínculo — e não só ao publicar: o rascunho de
    // autosave (`draft_payload`) é este mesmo payload.
    const { model } = lote();
    const comEscritura = applyBatch(model, [
      {
        type: 'SetBoundaryEscritura',
        boundaryId: model.boundaries[0].id,
        medidaMm: 9800,
        confrontante: 'Rua das Acácias',
      },
      { type: 'SetAreaEscritura', areaMm2: 360_000_000 },
    ]).model;

    const devolta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(comEscritura)));

    expect(devolta.areaEscrituraMm2).toBe(360_000_000);
    const comMedida = devolta.boundaries.filter((b) => b.medidaEscrituraMm !== null);
    expect(comMedida).toHaveLength(1);
    expect(comMedida[0].medidaEscrituraMm).toBe(9800);
    expect(comMedida[0].confrontante).toBe('Rua das Acácias');
    // E o hash tem que bater: se não batesse, publicar duas vezes o mesmo desenho
    // criaria snapshots diferentes.
    expect(snapshotHash(devolta)).toBe(snapshotHash(comEscritura));
  });

  it('payload de kernel 0.5.0 (sem escritura) carrega com null, sem inventar medida', () => {
    const { model } = lote();
    const antigo = parseCanonicalPayload(canonicalPayload(model));
    // Simula o gravado antes de 0.6.0: sem a chave de topo e sem os campos.
    delete antigo.areaEscrituraMm2;
    for (const b of antigo.boundaries) {
      delete b.medidaEscrituraMm;
      delete b.confrontante;
    }

    const carregado = modelFromCanonicalPayload(antigo);
    expect(carregado.areaEscrituraMm2).toBeNull();
    expect(carregado.boundaries.every((b) => b.medidaEscrituraMm === null)).toBe(true);
    expect(carregado.boundaries.every((b) => b.confrontante === null)).toBe(true);
  });

  it('TranslateEntities move parede E limite no MESMO passo', () => {
    const { model, levelId } = withLevel();
    const comParede = applyBatch(model, room(levelId, 0, 0, 4000, 3000)).model;
    const comLimite = applyCommand(comParede, {
      type: 'AddBoundary',
      levelId,
      a: point(0, 0),
      b: point(4000, 0),
      kind: 'TERRENO',
    }).model;
    const parede = comLimite.walls[0];
    const limite = comLimite.boundaries[0];

    const depois = applyCommand(comLimite, {
      type: 'TranslateEntities',
      wallIds: [parede.id],
      boundaryIds: [limite.id],
      delta: point(1000, 2000),
      arrastarVizinhas: false,
    }).model;

    expect(depois.walls.find((w) => w.id === parede.id)!.a).toEqual({ x: 1000, y: 2000 });
    expect(depois.boundaries.find((b) => b.id === limite.id)!.a).toEqual({ x: 1000, y: 2000 });
  });

  it('com arrastarVizinhas, a divisa encostada na parede ACOMPANHA — o defeito latente', () => {
    // Enquanto a conta só olhava paredes, arrastar um bloco deixava a divisa
    // para trás: o anel do lote abria e o ambiente sumia, sem erro na tela.
    const { model, levelId } = withLevel();
    const comParede = applyBatch(model, room(levelId, 0, 0, 4000, 3000)).model;
    const sul = comParede.walls[0]; // (0,0) → (4000,0)
    const comLimite = applyCommand(comParede, {
      type: 'AddBoundary',
      levelId,
      a: point(4000, 0),
      b: point(9000, 0),
      kind: 'TERRENO',
    }).model;
    const limite = comLimite.boundaries[0];

    const depois = applyCommand(comLimite, {
      type: 'TranslateEntities',
      wallIds: [sul.id],
      boundaryIds: [],
      delta: point(0, -1500),
      arrastarVizinhas: true,
    }).model;

    // A ponta do limite que compartilhava o vértice (4000,0) andou junto.
    expect(depois.boundaries.find((b) => b.id === limite.id)!.a).toEqual({ x: 4000, y: -1500 });
    // A outra ponta, não.
    expect(depois.boundaries.find((b) => b.id === limite.id)!.b).toEqual({ x: 9000, y: 0 });
  });

  it('id de limite inexistente aborta o comando inteiro', () => {
    const { model } = lote();
    const antes = snapshotHash(model);
    expect(() =>
      applyCommand(model, {
        type: 'TranslateEntities',
        wallIds: [],
        boundaryIds: [model.boundaries[0].id, 'bnd_9999'],
        delta: point(100, 0),
        arrastarVizinhas: false,
      }),
    ).toThrow(KernelError);
    expect(snapshotHash(model)).toBe(antes);
  });

  it('payload de kernel 0.4.0 (sem kind) carrega como DIVISA, sem quebrar', () => {
    const { model } = lote();
    const payload = JSON.parse(canonicalPayload(model));
    // Simula o snapshot antigo: apaga os campos que só existem desde 0.5.0.
    payload.kernel = 'blueprint-kernel-ts-0.4.0';
    for (const b of payload.boundaries) {
      delete b.kind;
      delete b.papel;
    }
    const recarregado = modelFromCanonicalPayload(parseCanonicalPayload(JSON.stringify(payload)));
    expect(recarregado.boundaries).toHaveLength(3);
    expect(recarregado.boundaries.every((b) => b.kind === 'DIVISA')).toBe(true);
    // A GEOMETRIA sobrevive: é o que garante que acervo antigo continua legível.
    expect(recarregado.spaces).toHaveLength(1);
    expect(recarregado.spaces[0].areaMm2).toBe(40_000_000);
  });
});

describe('cantoEntreEixos · juntar duas pontas soltas', () => {
  // Pedido de 23/08/2026, com print: uma parede vertical cuja ponta PASSOU do
  // canto e uma horizontal cuja ponta PAROU antes dele. Levar as duas ao
  // cruzamento dos próprios eixos fecha o canto sem girar nenhuma.

  it('perpendiculares: o canto é o cruzamento dos dois eixos', () => {
    // Vertical em x=0, ponta em y=3000 (passou 500 do canto).
    // Horizontal em y=2500, ponta em x=4000 (parou 4000 antes).
    const canto = cantoEntreEixos(
      point(0, 0),
      point(0, 3000),
      point(9000, 2500),
      point(4000, 2500),
    );
    expect(canto).toEqual({ x: 0, y: 2500 });
  });

  it('a ordem dos dois pares não muda o canto', () => {
    const a = cantoEntreEixos(point(0, 0), point(0, 3000), point(9000, 2500), point(4000, 2500));
    const b = cantoEntreEixos(point(9000, 2500), point(4000, 2500), point(0, 0), point(0, 3000));
    expect(a).toEqual(b);
  });

  it('1° torto do ortogonal ainda dá canto — é o "levemente desalinhadas" do pedido', () => {
    // Planta vinda de PDF quase nunca está no ortogonal exato: medido no
    // ALLAN.pdf, 71 de 133 faces já saem tortas do arquivo. Recusar por isso
    // deixaria a ferramenta inútil justamente onde ela é necessária.
    const torto = Math.round(3000 * Math.tan((1 * Math.PI) / 180));
    const canto = cantoEntreEixos(
      point(0, 0),
      point(torto, 3000),
      point(9000, 2500),
      point(4000, 2500),
    );
    expect(canto).not.toBeNull();
    expect(canto!.y).toBe(2500);
    // O eixo NÃO é endireitado: o canto acompanha a inclinação de quem foi
    // desenhado torto, em vez de girar a parede sem o usuário mandar.
    expect(canto!.x).toBeGreaterThan(0);
  });

  it('paralelas não têm canto', () => {
    expect(
      cantoEntreEixos(point(0, 0), point(0, 3000), point(2000, 6000), point(2000, 3500)),
    ).toBeNull();
  });

  it('quase colineares também não — aquilo é VÃO, e vão tem lista própria', () => {
    // Duas paredes na mesma linha com um buraco entre elas. O cruzamento dos
    // eixos existe, mas cai a quilômetros e é decidido por arredondamento.
    expect(
      cantoEntreEixos(point(0, 0), point(3000, 0), point(9000, 30), point(4000, 30)),
    ).toBeNull();
  });

  it('canto longe demais é recusado — esticar 20 m não é juntar pontas', () => {
    // Perpendiculares de verdade, mas a segunda ponta está a 50 m do cruzamento.
    expect(
      cantoEntreEixos(point(0, 0), point(0, 3000), point(90_000, 2500), point(50_000, 2500)),
    ).toBeNull();
  });

  it('parede degenerada (ponta em cima da outra) não define eixo', () => {
    expect(
      cantoEntreEixos(point(0, 0), point(0, 0), point(9000, 2500), point(4000, 2500)),
    ).toBeNull();
  });

  it('o canto sai em milímetro INTEIRO, como todo vértice do kernel', () => {
    const canto = cantoEntreEixos(
      point(0, 0),
      point(1000, 3000),
      point(9000, 2501),
      point(4000, 2500),
    );
    expect(canto).not.toBeNull();
    expect(Number.isInteger(canto!.x)).toBe(true);
    expect(Number.isInteger(canto!.y)).toBe(true);
  });
});
