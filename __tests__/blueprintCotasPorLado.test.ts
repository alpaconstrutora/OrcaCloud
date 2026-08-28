/**
 * Cadeias de cota POR LADO, com a régua de face/eixo.
 *
 * Pedido de 24/08/2026, literal:
 *
 *   "Cota interna é traves da face interna sempre. A cota externa é atrave da
 *   face externa. Mas se existir uma cota intermediaria, por exemplo, se uma
 *   lateral tivermos 3 ambientes em serie … cotas começando e terminando no
 *   eixo para o ambiente do meio e dos dois ambientes da extremidade uma cota
 *   começando na face externa e a outra terminando no eixo do ambiente do
 *   centro."
 *
 * O teste central deste arquivo é exatamente esse caso.
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
import { DesenhistaDeProva, PAPEIS, desenharPlanta, enquadrar } from '../utils/blueprintExport';
import { gerarDxf } from '../utils/blueprintDxf';
import {
  cadeiasDoModelo,
  cadeiasDoLado,
  cadeiasPorLado,
  ladosDoContorno,
  parcialFecha,
  pontoDaCota,
  referencialDoLado,
  normalParaODentro,
} from '../utils/blueprintCotas';
import { contornoExternoDoNivel, pointInPolygon } from '../utils/blueprintKernel';

const T = 200; // espessura de parede, mm
const H = 2800;

function base(): { model: BlueprintModel; levelId: string } {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  return { model: r.model, levelId: r.model.levels[0].id };
}

const w = (
  levelId: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  t = T,
): Command => ({
  type: 'AddWall',
  levelId,
  a: point(ax, ay),
  b: point(bx, by),
  thicknessMm: t,
  heightMm: H,
});

/**
 * A LATERAL DO PEDIDO: 3 ambientes em série ao longo de X.
 *
 * Eixo de 0 a 9000, divisórias nos eixos 3000 e 6000. Parede de 200 mm.
 */
function tresAmbientes(): { model: BlueprintModel; levelId: string } {
  const { model, levelId } = base();
  const m = applyBatch(model, [
    w(levelId, 0, 0, 9000, 0), // fachada sul — o lado que vamos cotar
    w(levelId, 9000, 0, 9000, 4000),
    w(levelId, 9000, 4000, 0, 4000),
    w(levelId, 0, 4000, 0, 0),
    w(levelId, 3000, 0, 3000, 4000), // divisória 1
    w(levelId, 6000, 0, 6000, 4000), // divisória 2
  ]).model;
  return { model: m, levelId };
}

describe('ladosDoContorno', () => {
  it('funde as arestas colineares num lado só, guardando os intermediários', () => {
    const { model } = tresAmbientes();
    const anel = contornoExternoDoNivel(model, model.levels[0])[0];
    const lados = ladosDoContorno(anel);

    // Quatro lados, apesar dos vértices extras das divisórias.
    expect(lados).toHaveLength(4);

    // O lado sul tem os DOIS encontros de divisória guardados.
    const sul = lados.find(
      (l) => l.a.y === 0 && l.b.y === 0 && Math.abs(l.b.x - l.a.x) === 9000,
    );
    expect(sul).toBeDefined();
    expect(sul!.intermediarios).toHaveLength(2);
  });
});

describe('cadeiasDoLado — o caso do pedido', () => {
  const montar = () => {
    const { model } = tresAmbientes();
    const anel = contornoExternoDoNivel(model, model.levels[0])[0];
    const sul = ladosDoContorno(anel).find(
      (l) => l.a.y === 0 && l.b.y === 0 && Math.abs(l.b.x - l.a.x) === 9000,
    )!;
    return cadeiasDoLado(model, model.levels[0], sul)!;
  };

  it('a cota TOTAL vai de face externa a face externa', () => {
    const c = montar();
    // Eixo 9000 + meia espessura em cada canto = 9000 + 200 = 9200.
    expect(c.total.ate - c.total.de).toBeCloseTo(9200, 0);
    expect(c.total.rotulo).toBe('9,20');
  });

  it('a PARCIAL começa e termina na face externa e quebra nos EIXOS', () => {
    const c = montar();
    expect(c.parcial).toHaveLength(3);

    // Ambiente da extremidade: face externa (−100) até o eixo da divisória
    // (3000) = 3100.
    expect(c.parcial[0].ate - c.parcial[0].de).toBeCloseTo(3100, 0);
    expect(c.parcial[0].rotulo).toBe('3,10');

    // Ambiente do MEIO: eixo a eixo = 3000.
    expect(c.parcial[1].de).toBeCloseTo(3000, 0);
    expect(c.parcial[1].ate).toBeCloseTo(6000, 0);
    expect(c.parcial[1].rotulo).toBe('3,00');

    // Outra extremidade: eixo (6000) até a face externa (9100) = 3100.
    expect(c.parcial[2].ate - c.parcial[2].de).toBeCloseTo(3100, 0);
  });

  it('a parcial FECHA contra o total', () => {
    expect(parcialFecha(montar())).toBe(true);
  });

  it('as INTERNAS vão de face interna a face interna', () => {
    const c = montar();
    expect(c.internas).toHaveLength(3);

    // Extremidade: face interna do canto (+100) até a face da divisória
    // (3000 − 100) = 2800.
    expect(c.internas[0].de).toBeCloseTo(100, 0);
    expect(c.internas[0].ate).toBeCloseTo(2900, 0);
    expect(c.internas[0].rotulo).toBe('2,80');

    // Meio: entre as duas faces das divisórias = 3000 − 200 = 2800.
    expect(c.internas[1].rotulo).toBe('2,80');
  });

  it('a soma das internas + as paredes dá o total — nada some no caminho', () => {
    const c = montar();
    const somaInternas = c.internas.reduce((s, x) => s + (x.ate - x.de), 0);
    // 3 ambientes de 2800 = 8400; sobram 4 paredes de 200 = 800. Total 9200.
    expect(somaInternas + 4 * T).toBeCloseTo(c.total.ate - c.total.de, 0);
  });
});

describe('cadeiasDoLado — casos de contorno', () => {
  it('lado sem divisória tem UMA parcial, igual ao total', () => {
    const { model, levelId } = base();
    const m = applyBatch(model, [
      w(levelId, 0, 0, 5000, 0),
      w(levelId, 5000, 0, 5000, 3000),
      w(levelId, 5000, 3000, 0, 3000),
      w(levelId, 0, 3000, 0, 0),
    ]).model;
    const anel = contornoExternoDoNivel(m, m.levels[0])[0];
    const lado = ladosDoContorno(anel)[0];
    const c = cadeiasDoLado(m, m.levels[0], lado)!;

    expect(c.parcial).toHaveLength(1);
    expect(c.parcial[0].ate - c.parcial[0].de).toBeCloseTo(c.total.ate - c.total.de, 0);
    expect(c.internas).toHaveLength(1);
  });

  it('LADO OBLÍQUO cota o comprimento REAL, sem projetar em X/Y', () => {
    // Triângulo retângulo de catetos 3000 e 4000: a hipotenusa mede 5000 de
    // eixo. Projetar em X ou Y daria 4000 ou 3000 — a coordenada local é o que
    // faz o lado inclinado não precisar de caso especial.
    const { model, levelId } = base();
    const m = applyBatch(model, [
      w(levelId, 0, 0, 4000, 0),
      w(levelId, 4000, 0, 0, 3000),
      w(levelId, 0, 3000, 0, 0),
    ]).model;
    const anel = contornoExternoDoNivel(m, m.levels[0])[0];
    const hipotenusa = ladosDoContorno(anel).find(
      (l) => Math.round(Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y)) === 5000,
    );
    expect(hipotenusa).toBeDefined();
    const c = cadeiasDoLado(m, m.levels[0], hipotenusa!)!;
    expect(c.comprimentoMm).toBeCloseTo(5000, 0);
  });

  it('cadeiasPorLado devolve os quatro lados de um retângulo', () => {
    const { model } = tresAmbientes();
    const todas = cadeiasPorLado(model, model.levels[0]);
    expect(todas).toHaveLength(4);
    // E TODAS fecham — é a autoconferência que a prancha faz somando na mão.
    for (const c of todas) expect(parcialFecha(c)).toBe(true);
  });

  it('nível vazio não produz cadeia', () => {
    const { model } = base();
    expect(cadeiasPorLado(model, model.levels[0])).toHaveLength(0);
  });
});

/**
 * A NORMAL PARA FORA — a invariante que os três renderizadores consomem.
 *
 * Os números da cota podem estar todos certos e o desenho sair com as cotas
 * POR DENTRO da planta, sobrepostas à geometria. É defeito que passa em teste
 * de valor e só aparece no print; por isso é fixado aqui como invariante.
 */
describe('referencialDoLado — para que lado é fora', () => {
  it('a linha de cota cai FORA do contorno, nos quatro lados', () => {
    const { model } = tresAmbientes();
    const nivel = model.levels[0];
    const anel = contornoExternoDoNivel(model, nivel)[0];

    // Centro da edificação: 9000 × 4000 de eixo.
    const centro = { x: 4500, y: 2000 };

    for (const c of cadeiasPorLado(model, nivel)) {
      const meio = c.comprimentoMm / 2;
      const noEixo = pontoDaCota(c.lado, meio, 0);
      const afastado = pontoDaCota(c.lado, meio, 1000);

      const distEixo = Math.hypot(noEixo.x - centro.x, noEixo.y - centro.y);
      const distAfastado = Math.hypot(afastado.x - centro.x, afastado.y - centro.y);

      // Afastar tem de AUMENTAR a distância ao centro — senão é para dentro.
      expect(distAfastado).toBeGreaterThan(distEixo);

      // E o ponto afastado tem de cair fora do polígono do contorno.
      expect(pointInPolygon(afastado, anel)).toBe(false);
    }
  });

  it('a normal é perpendicular à direção do lado', () => {
    const { model } = tresAmbientes();
    for (const c of cadeiasPorLado(model, model.levels[0])) {
      const { ux, uy, nx, ny } = referencialDoLado(c.lado);
      expect(ux * nx + uy * ny).toBeCloseTo(0, 9);
      expect(Math.hypot(nx, ny)).toBeCloseTo(1, 9);
    }
  });
});

/**
 * OS TRÊS DESTINOS TÊM DE TRAZER OS MESMOS NÚMEROS.
 *
 * É a razão declarada de as cadeias serem compartilhadas: "cota que diverge
 * entre o papel e o arquivo do CAD é pior que cota nenhuma". A tela, o PDF e o
 * DXF passam todos por `cadeiasDoModelo` + `pontoDaCota` — este teste é o que
 * impede alguém de "otimizar" um deles fazendo a conta por conta própria.
 */
describe('tela × PDF × DXF', () => {
  it('os rótulos de cota são os mesmos nos três', () => {
    // Com ABERTURA: sem ela, um renderizador poderia deixar de desenhar a
    // cadeia de esquadria e este teste aprovaria assim mesmo.
    const { model: semPorta } = tresAmbientes();
    const fachada = semPorta.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
    const model = applyCommand(semPorta, {
      type: 'AddOpening',
      wallId: fachada.id,
      kind: 'window',
      offsetMm: 1000,
      widthMm: 1200,
      heightMm: 1200,
      sillMm: 900,
    }).model;

    // 1. A FONTE — é o que o canvas desenha.
    const daFonte = new Set(
      cadeiasDoModelo(model).flatMap((c) => [
        c.total.rotulo,
        ...c.parcial.map((s) => s.rotulo),
        ...c.internas.map((s) => s.rotulo),
        ...c.aberturas.map((s) => s.rotulo),
      ]),
    );
    // A janela de 1,20 tem de estar entre eles.
    expect(daFonte.has('1,20')).toBe(true);
    expect(daFonte.size).toBeGreaterThan(0);

    // 2. O PAPEL.
    const d = new DesenhistaDeProva();
    const op = {
      denominador: 100,
      papel: PAPEIS[0],
      titulo: 'teste',
      revisao: 1,
      hash: 'abc123',
      data: new Date('2026-08-24T12:00:00Z'),
      cotas: true,
    } as Parameters<typeof desenharPlanta>[2];
    desenharPlanta(d, model, op, enquadrar(model, 100, PAPEIS[0], true));
    const noPapel = new Set(d.textos());

    // 3. O CAD.
    const dxf = gerarDxf(model, { cotas: true });

    for (const rotulo of daFonte) {
      expect(noPapel.has(rotulo), `"${rotulo}" não saiu no PDF`).toBe(true);
      expect(dxf.includes(rotulo), `"${rotulo}" não saiu no DXF`).toBe(true);
    }
  });

  it('o número de EIXO não aparece em destino nenhum', () => {
    // A lateral tem 9000 de eixo e 9200 de face externa. Se "9,00" reaparecer,
    // alguém voltou a cotar pelo eixo em algum dos caminhos.
    const { model } = tresAmbientes();
    const d = new DesenhistaDeProva();
    const op = {
      denominador: 100,
      papel: PAPEIS[0],
      titulo: 'teste',
      revisao: 1,
      hash: 'abc123',
      data: new Date('2026-08-24T12:00:00Z'),
      cotas: true,
    } as Parameters<typeof desenharPlanta>[2];
    desenharPlanta(d, model, op, enquadrar(model, 100, PAPEIS[0], true));

    expect(d.textos()).not.toContain('9,00');
    expect(cadeiasDoModelo(model).some((c) => c.total.rotulo === '9,20')).toBe(true);
  });
});

/**
 * CADEIA DE ESQUADRIAS — a linha própria das aberturas.
 *
 * `blueprintCotas.ts` sempre registrou que abertura não entra na cadeia da
 * estrutura ("dobra o número de segmentos"). A razão vale contra MISTURAR, não
 * contra existir: na prancha a esquadria tem a sua linha.
 */
describe('cadeia de aberturas', () => {
  const comPorta = () => {
    const { model, levelId } = base();
    const m = applyBatch(model, [
      w(levelId, 0, 0, 9000, 0),
      w(levelId, 9000, 0, 9000, 4000),
      w(levelId, 9000, 4000, 0, 4000),
      w(levelId, 0, 4000, 0, 0),
    ]).model;
    const sul = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
    return applyCommand(m, {
      type: 'AddOpening',
      wallId: sul.id,
      kind: 'door',
      offsetMm: 4000,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    }).model;
  };

  const ladoSul = (m: BlueprintModel) => {
    const anel = contornoExternoDoNivel(m, m.levels[0])[0];
    return ladosDoContorno(anel).find(
      (l) => l.a.y === 0 && l.b.y === 0 && Math.abs(l.b.x - l.a.x) === 9000,
    )!;
  };

  it('a porta de 0,90 a 4,00 do canto sai nessa posição', () => {
    const m = comPorta();
    const c = cadeiasDoLado(m, m.levels[0], ladoSul(m))!;

    const vaos = c.aberturas.filter((s) => s.vao);
    expect(vaos).toHaveLength(1);
    expect(vaos[0].de).toBeCloseTo(4000, 0);
    expect(vaos[0].rotulo).toBe('0,90');
  });

  it('a cadeia de esquadria FECHA contra o total', () => {
    const m = comPorta();
    const c = cadeiasDoLado(m, m.levels[0], ladoSul(m))!;
    const soma = c.aberturas.reduce((s, x) => s + (x.ate - x.de), 0);
    expect(soma).toBeCloseTo(c.total.ate - c.total.de, 0);
  });

  it('o trecho de PAREDE entre os vãos também é cotado', () => {
    const m = comPorta();
    const c = cadeiasDoLado(m, m.levels[0], ladoSul(m))!;
    // Antes da porta e depois dela: dois trechos de parede, nenhum marcado.
    const paredes = c.aberturas.filter((s) => !s.vao);
    expect(paredes).toHaveLength(2);
  });

  it('lado SEM abertura não gasta linha de cota', () => {
    const { model } = tresAmbientes();
    for (const c of cadeiasPorLado(model, model.levels[0])) {
      expect(c.aberturas).toHaveLength(0);
    }
  });

  it('a abertura NÃO contamina a cadeia da estrutura', () => {
    // É a razão original de excluí-la: misturar dobraria os segmentos.
    const m = comPorta();
    const c = cadeiasDoLado(m, m.levels[0], ladoSul(m))!;
    expect(c.parcial).toHaveLength(1);
    expect(c.internas).toHaveLength(1);
  });

  it('a abertura de uma parede de OUTRO lado não entra neste', () => {
    const m = comPorta();
    const anel = contornoExternoDoNivel(m, m.levels[0])[0];
    const leste = ladosDoContorno(anel).find(
      (l) => Math.abs(l.b.y - l.a.y) === 4000,
    )!;
    const c = cadeiasDoLado(m, m.levels[0], leste)!;
    expect(c.aberturas).toHaveLength(0);
  });
});

describe('normalParaODentro — de que lado da parede fica o cômodo', () => {
  /**
   * Print do usuário em 28/08/2026: "as medidas internas e externas estão
   * trocadas em um dos lados".
   *
   * Estavam. A cota de face interna era jogada para o lado OPOSTO ao da cota de
   * eixo, e o lado da de eixo saía de uma normal normalizada pela orientação da
   * TELA — não pelo cômodo. Num retângulo isso erra em DUAS das quatro paredes.
   */
  function retangulo() {
    const { model, levelId } = base();
    const m = applyBatch(model, [
      w(levelId, 0, 0, 6000, 0), // baixo
      w(levelId, 6000, 0, 6000, 4000), // direita
      w(levelId, 6000, 4000, 0, 4000), // cima
      w(levelId, 0, 4000, 0, 0), // esquerda
    ]).model;
    return m;
  }

  it('nas QUATRO paredes do retângulo a normal aponta para dentro', () => {
    const m = retangulo();
    expect(m.spaces).toHaveLength(1);
    // O centro do cômodo: andar na direção devolvida tem de aproximar dele.
    const centro = { x: 3000, y: 2000 };
    for (const parede of m.walls) {
      const n = normalParaODentro(m.spaces, parede)!;
      expect(n).not.toBeNull();
      const meio = {
        x: (parede.a.x + parede.b.x) / 2,
        y: (parede.a.y + parede.b.y) / 2,
      };
      const antes = Math.hypot(meio.x - centro.x, meio.y - centro.y);
      const depois = Math.hypot(meio.x + n.x * 500 - centro.x, meio.y + n.y * 500 - centro.y);
      expect(depois).toBeLessThan(antes);
    }
  });

  it('a normal é UNITÁRIA e perpendicular ao eixo da parede', () => {
    const m = retangulo();
    for (const parede of m.walls) {
      const n = normalParaODentro(m.spaces, parede)!;
      expect(Math.hypot(n.x, n.y)).toBeCloseTo(1, 6);
      const dx = parede.b.x - parede.a.x;
      const dy = parede.b.y - parede.a.y;
      expect(Math.abs(n.x * dx + n.y * dy)).toBeLessThan(1e-6);
    }
  });

  it('parede ENTRE dois ambientes devolve null — ali não existe "o interior"', () => {
    // A divisória do meio, com cômodo dos dois lados.
    const { model } = tresAmbientes();
    const divisoria = model.walls.find((x) => x.a.x === 3000 && x.b.x === 3000)!;
    expect(model.spaces.length).toBeGreaterThan(1);
    expect(normalParaODentro(model.spaces, divisoria)).toBeNull();

    // E a fachada do mesmo desenho continua tendo resposta.
    const fachada = model.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
    expect(normalParaODentro(model.spaces, fachada)).not.toBeNull();
  });

  it('parede solta, sem ambiente nenhum, devolve null', () => {
    const { model, levelId } = base();
    const m = applyBatch(model, [w(levelId, 0, 0, 4000, 0)]).model;
    expect(m.spaces).toHaveLength(0);
    expect(normalParaODentro(m.spaces, m.walls[0])).toBeNull();
  });

  it('não depende do SENTIDO em que a parede foi desenhada', () => {
    // O defeito original nascia justamente de uma normal que dependia da
    // orientação. Desenhar o mesmo retângulo no sentido inverso não pode mudar
    // para que lado o número interno cai.
    const { model, levelId } = base();
    const horario = applyBatch(model, [
      w(levelId, 0, 0, 0, 4000),
      w(levelId, 0, 4000, 6000, 4000),
      w(levelId, 6000, 4000, 6000, 0),
      w(levelId, 6000, 0, 0, 0),
    ]).model;
    const centro = { x: 3000, y: 2000 };
    for (const parede of horario.walls) {
      const n = normalParaODentro(horario.spaces, parede)!;
      const meio = {
        x: (parede.a.x + parede.b.x) / 2,
        y: (parede.a.y + parede.b.y) / 2,
      };
      const antes = Math.hypot(meio.x - centro.x, meio.y - centro.y);
      const depois = Math.hypot(meio.x + n.x * 500 - centro.x, meio.y + n.y * 500 - centro.y);
      expect(depois).toBeLessThan(antes);
    }
  });
});
