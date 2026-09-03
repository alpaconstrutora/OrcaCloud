/**
 * MITRA DA JUNÇÃO — o corpo da parede recortado face a face.
 *
 * ─── POR QUE ESTE ARQUIVO EXISTE ────────────────────────────────────────────
 *
 * `extensaoDeCanto` avança IGUAL nas duas faces, e por isso as duas paredes de
 * um canto cobrem o quadrado da junção inteiro — cada uma. No 2D isso é
 * invisível (o preenchimento é uma união); no 3D são dois sólidos, e o usuário
 * fotografou o resultado em 03/09/2026: face contra face no canto e ponta de
 * divisória saindo do outro lado da parede que a recebe.
 *
 * O último bloco é o que prova o conserto de verdade: numa planta com canto, T e
 * vértice de três pontas, a soma das interseções par a par tem de ser ZERO (não
 * sobrou sobreposição) e tudo que o desenho antigo cobria tem de continuar
 * coberto (não abriu vão). Os casos de cima existem para dizer ONDE quebrou
 * quando esse invariante cair.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  emptyModel,
  extensaoDeCanto,
  mitraDaPonta,
  pointInPolygon,
  poligonoDaJuncao,
  type BlueprintModel,
  type Command,
  type Point,
  type Wall,
} from '../utils/blueprintKernel';

const H = 2800;

function planta(paredes: [number, number, number, number, number][]): BlueprintModel {
  const base = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: H },
  ]).model;
  const levelId = base.levels[0].id;
  const cmds: Command[] = paredes.map(([ax, ay, bx, by, t]) => ({
    type: 'AddWall',
    levelId,
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    thicknessMm: t,
    heightMm: H,
  }));
  return applyBatch(base, cmds).model;
}

/**
 * O corpo da parede com a mitra aplicada — a MESMA construção do viewer 3D:
 * a face `+n` vai de `−mitraA.esquerda` a `L + mitraB.esquerda`, a face `−n` vai
 * pelos números `direita`. Se estes quatro cantos deixarem de bater com o que o
 * `Blueprint3DViewer` monta, é o viewer que está errado, não este teste.
 */
function corpoMitrado(walls: Wall[], w: Wall): Point[] {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const comp = Math.hypot(dx, dy);
  const u = { x: dx / comp, y: dy / comp };
  const n = { x: -u.y, y: u.x };
  const meia = w.thicknessMm / 2;
  const mA = mitraDaPonta(walls, w, 'a');
  const mB = mitraDaPonta(walls, w, 'b');
  return [
    { x: w.a.x - u.x * mA.esquerdaMm + n.x * meia, y: w.a.y - u.y * mA.esquerdaMm + n.y * meia },
    { x: w.b.x + u.x * mB.esquerdaMm + n.x * meia, y: w.b.y + u.y * mB.esquerdaMm + n.y * meia },
    { x: w.b.x + u.x * mB.direitaMm - n.x * meia, y: w.b.y + u.y * mB.direitaMm - n.y * meia },
    { x: w.a.x - u.x * mA.direitaMm - n.x * meia, y: w.a.y - u.y * mA.direitaMm - n.y * meia },
  ];
}

/** O corpo como o 3D montava antes: avanço único, igual nas duas faces. */
function corpoComAvancoUnico(walls: Wall[], w: Wall): Point[] {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const comp = Math.hypot(dx, dy);
  const u = { x: dx / comp, y: dy / comp };
  const n = { x: -u.y, y: u.x };
  const meia = w.thicknessMm / 2;
  const eA = extensaoDeCanto(walls, w, 'a');
  const eB = extensaoDeCanto(walls, w, 'b');
  const pa = { x: w.a.x - u.x * eA, y: w.a.y - u.y * eA };
  const pb = { x: w.b.x + u.x * eB, y: w.b.y + u.y * eB };
  return [
    { x: pa.x + n.x * meia, y: pa.y + n.y * meia },
    { x: pb.x + n.x * meia, y: pb.y + n.y * meia },
    { x: pb.x - n.x * meia, y: pb.y - n.y * meia },
    { x: pa.x - n.x * meia, y: pa.y - n.y * meia },
  ];
}

const area = (poly: Point[]) => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
};

/** Sutherland–Hodgman. Os corpos de parede são quadriláteros convexos. */
function intersecao(sub: Point[], clip: Point[]): Point[] {
  let orientacao = 0;
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    orientacao += a.x * b.y - b.x * a.y;
  }
  const o = orientacao > 0 ? 1 : -1;
  let saida = sub.slice();
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const dentro = (p: Point) =>
      o * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) >= 0;
    const entrada = saida;
    saida = [];
    for (let j = 0; j < entrada.length; j++) {
      const P = entrada[j];
      const Q = entrada[(j + 1) % entrada.length];
      const corta = () => {
        const d1 = (b.x - a.x) * (P.y - a.y) - (b.y - a.y) * (P.x - a.x);
        const d2 = (b.x - a.x) * (Q.y - a.y) - (b.y - a.y) * (Q.x - a.x);
        const t = d1 / (d1 - d2);
        return { x: P.x + t * (Q.x - P.x), y: P.y + t * (Q.y - P.y) };
      };
      if (dentro(P) && dentro(Q)) saida.push(Q);
      else if (dentro(P)) saida.push(corta());
      else if (dentro(Q)) {
        saida.push(corta());
        saida.push(Q);
      }
    }
    if (!saida.length) return [];
  }
  return saida;
}

const areaComum = (a: Point[], b: Point[]) => {
  const i = intersecao(a, b);
  return i.length >= 3 ? area(i) : 0;
};

describe('mitraDaPonta — canto de duas paredes', () => {
  it('em 90° e espessura igual avança meia espessura de um lado e recua do outro', () => {
    // ┌ com o vértice em (3000, 0): horizontal chegando, vertical subindo.
    const m = planta([
      [0, 0, 3000, 0, 150],
      [3000, 0, 3000, 2500, 150],
    ]);
    const [horizontal, vertical] = m.walls;

    const b = mitraDaPonta(m.walls, horizontal, 'b');
    // Uma face avança 75, a outra recua 75 — nunca as duas avançando.
    expect(Math.max(b.esquerdaMm, b.direitaMm)).toBeCloseTo(75, 6);
    expect(Math.min(b.esquerdaMm, b.direitaMm)).toBeCloseTo(-75, 6);

    // A face que AVANÇA vale exatamente o que `extensaoDeCanto` dá: a silhueta
    // externa do 3D continua batendo com a da planta baixa e a do PDF. É a trava
    // contra as duas réguas divergirem, que já aconteceu antes neste módulo.
    expect(Math.max(b.esquerdaMm, b.direitaMm)).toBeCloseTo(
      extensaoDeCanto(m.walls, horizontal, 'b'),
      6,
    );

    // A vizinha vê o MESMO canto pela ponta dela.
    const a = mitraDaPonta(m.walls, vertical, 'a');
    expect(Math.max(a.esquerdaMm, a.direitaMm)).toBeCloseTo(75, 6);
    expect(Math.min(a.esquerdaMm, a.direitaMm)).toBeCloseTo(-75, 6);
  });

  it('em 120° usa o ângulo, e não meia espessura', () => {
    // Vértice em (3000,0); a segunda parede sai a 60° do eixo x.
    const m = planta([
      [0, 0, 3000, 0, 150],
      [3000, 0, 4500, 2598, 150],
    ]);
    const esperado = 75 / Math.tan((120 * Math.PI) / 360);
    const b = mitraDaPonta(m.walls, m.walls[0], 'b');
    expect(Math.max(b.esquerdaMm, b.direitaMm)).toBeCloseTo(esperado, 1);
    expect(Math.min(b.esquerdaMm, b.direitaMm)).toBeCloseTo(-esperado, 1);
    expect(esperado).toBeLessThan(75); // obtuso avança MENOS que meia espessura
  });

  it('com espessuras diferentes o avanço é pela metade da VIZINHA', () => {
    // Divisória de 100 morrendo num canto com parede de 300.
    const m = planta([
      [0, 0, 3000, 0, 100],
      [3000, 0, 3000, 2500, 300],
    ]);
    const b = mitraDaPonta(m.walls, m.walls[0], 'b');
    expect(Math.max(b.esquerdaMm, b.direitaMm)).toBeCloseTo(150, 6);
    expect(Math.min(b.esquerdaMm, b.direitaMm)).toBeCloseTo(-150, 6);
    // É AQUI que a régua nova e a antiga legitimamente discordam: a antiga
    // avança a própria meia espessura (50) e deixa entalhe de 100 mm na face.
    expect(extensaoDeCanto(m.walls, m.walls[0], 'b')).toBeCloseTo(50, 6);
  });

  it('continuação colinear não avança nada', () => {
    const m = planta([
      [0, 0, 3000, 0, 150],
      [3000, 0, 6000, 0, 150],
    ]);
    const b = mitraDaPonta(m.walls, m.walls[0], 'b');
    expect(b.esquerdaMm).toBeCloseTo(0, 6);
    expect(b.direitaMm).toBeCloseTo(0, 6);
  });

  it('ponta livre não avança nada', () => {
    const m = planta([[0, 0, 3000, 0, 150]]);
    const a = mitraDaPonta(m.walls, m.walls[0], 'a');
    expect(a.esquerdaMm).toBe(0);
    expect(a.direitaMm).toBe(0);
  });
});

describe('mitraDaPonta — junção em T', () => {
  it('perpendicular: a divisória PARA na face da hospedeira, não a atravessa', () => {
    // Hospedeira de 300 na horizontal; divisória de 100 morrendo no meio dela.
    const m = planta([
      [0, 0, 6000, 0, 300],
      [3000, -2500, 3000, 0, 100],
    ]);
    const divisoria = m.walls[1];
    const b = mitraDaPonta(m.walls, divisoria, 'b');
    // Recua 150 = meia espessura DA HOSPEDEIRA. Antes avançava +50 (a própria
    // meia espessura), e com espessuras iguais isso punha a ponta exatamente na
    // face de trás da hospedeira — o "entrando uma na outra" do relato.
    expect(b.esquerdaMm).toBeCloseTo(-150, 6);
    expect(b.direitaMm).toBeCloseTo(-150, 6);
    expect(extensaoDeCanto(m.walls, divisoria, 'b')).toBeCloseTo(50, 6);
  });

  it('oblíqua: cada face para num ponto diferente da face da hospedeira', () => {
    const m = planta([
      [0, 0, 6000, 0, 300],
      [1000, -2000, 3000, 0, 200],
    ]);
    const b = mitraDaPonta(m.walls, m.walls[1], 'b');
    expect(b.esquerdaMm).not.toBeCloseTo(b.direitaMm, 3);
    expect(b.esquerdaMm).toBeLessThan(0);
    expect(b.direitaMm).toBeLessThan(0);
  });
});

describe('poligonoDaJuncao', () => {
  it('não existe em canto de duas paredes — a mitra já reparte o quadrado', () => {
    const m = planta([
      [0, 0, 3000, 0, 150],
      [3000, 0, 3000, 2500, 150],
    ]);
    expect(poligonoDaJuncao(m.walls, { x: 3000, y: 0 })).toBeNull();
  });

  it('em vértice de três pontas fecha exatamente o miolo que sobrou', () => {
    // Trecho reto partido em (3000,0) mais um ramo descendo: três pontas.
    const m = planta([
      [0, 0, 3000, 0, 200],
      [3000, 0, 6000, 0, 200],
      [3000, -2500, 3000, 0, 200],
    ]);
    const anel = poligonoDaJuncao(m.walls, { x: 3000, y: 0 });
    expect(anel).not.toBeNull();
    // Triângulo de base 200 (largura do ramo) e altura 200 (espessura da
    // hospedeira): 2 × 100 × 200 / 2 = 20 000 mm².
    expect(area(anel!)).toBeCloseTo(20000, 0);
  });
});

describe('invariante da união — nem sobreposição, nem vão', () => {
  /**
   * Canto, T sem vértice, vértice de TRÊS pontas e ponta livre na mesma planta.
   *
   * A fachada de baixo vem partida em (3000,0) de propósito: é assim que nasce o
   * vértice de três pontas, o único caso em que a mitra sozinha abriria buraco e
   * o miolo precisa entrar. Sem ele o terceiro teste passaria sem exercitar
   * `poligonoDaJuncao` — e foi o que aconteceu na primeira versão deste arquivo.
   */
  const m = planta([
    [0, 0, 3000, 0, 200],
    [3000, 0, 6000, 0, 200],
    [6000, 0, 6000, 4000, 200],
    [6000, 4000, 0, 4000, 200],
    [0, 4000, 0, 0, 200],
    [3000, 0, 3000, 4000, 150],
    [3000, 2000, 5000, 2000, 150],
    [1000, 2000, 1000, 3200, 100],
  ]);

  const corposNovos = m.walls.map((w) => corpoMitrado(m.walls, w));
  const corposAntigos = m.walls.map((w) => corpoComAvancoUnico(m.walls, w));
  const miolos = [...new Set(m.walls.flatMap((w) => [w.a, w.b]))]
    .map((p) => poligonoDaJuncao(m.walls, p))
    .filter((x): x is Point[] => x !== null);

  it('a planta de prova tem mesmo um vértice de três pontas', () => {
    // Guarda contra o teste virar teatro: sem miolo nenhum, o caso perigoso da
    // mitra (o buraco no meio da junção) não estaria sendo exercitado.
    expect(miolos.length).toBeGreaterThan(0);
  });

  it('o desenho de hoje se invade, e é isso que o usuário vê', () => {
    let total = 0;
    for (let i = 0; i < corposAntigos.length; i++)
      for (let j = i + 1; j < corposAntigos.length; j++)
        total += areaComum(corposAntigos[i], corposAntigos[j]);
    // Não é folga de arredondamento: é quadrado de junção inteiro, várias vezes.
    expect(total).toBeGreaterThan(100000);
  });

  it('com a mitra, parede nenhuma invade outra', () => {
    let total = 0;
    for (let i = 0; i < corposNovos.length; i++)
      for (let j = i + 1; j < corposNovos.length; j++)
        total += areaComum(corposNovos[i], corposNovos[j]);
    // 1 cm² de tolerância para o ponto flutuante das interseções de reta.
    expect(total).toBeLessThan(100);
  });

  it('e não abriu vão: tudo que o desenho antigo cobria continua coberto', () => {
    const cobertoNovo = (p: Point) =>
      corposNovos.some((c) => pointInPolygon(c, p)) || miolos.some((c) => pointInPolygon(c, p));

    // Amostragem a cada 25 mm sobre a planta inteira. Um vão de mitra tem
    // centenas de milímetros; a malha é fina o bastante para não deixar passar.
    let descobertos = 0;
    for (let x = -400; x <= 6400; x += 25) {
      for (let y = -400; y <= 4400; y += 25) {
        const p = { x, y };
        if (!corposAntigos.some((c) => pointInPolygon(c, p))) continue;
        if (!cobertoNovo(p)) descobertos++;
      }
    }
    expect(descobertos).toBe(0);
  });
});
