/**
 * A MALHA da parede quando o concreto a interrompe.
 *
 * ─── POR QUE ESTE ARQUIVO EXISTE ────────────────────────────────────────────
 *
 * O usuário relatou CINCO vezes que "continua sobreposto", e as cinco
 * verificações anteriores olharam a coisa errada: o payload (que estava certo),
 * o perfil (que estava certo) e prints de cenas SINTÉTICAS com o pilar no meio
 * da parede (onde o defeito não aparece).
 *
 * O defeito estava na malha, e só com o pilar na PONTA: o vão era um
 * `THREE.Path` em `shape.holes`, e furo que encosta na borda do retângulo não é
 * furo — a triangulação do `ExtrudeGeometry` o ignora e a parede sai inteira.
 * Como quase todo pilar fica em canto de parede, o recurso não funcionava
 * justamente onde ele é usado.
 *
 * `ExtrudeGeometry` é JavaScript puro: roda em node, sem WebGL. Não havia
 * desculpa para não ter medido isto antes.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyBatch, emptyModel, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { perfilDaParedeComVaos } from '../utils/blueprintElevation';

/** Reproduz o que `geometriaDaParede` faz, em milímetros do modelo. */
function trechosDaParede(model: BlueprintModel, wall: BlueprintModel['walls'][number]) {
  const perfil = perfilDaParedeComVaos(model, wall);
  const xIni = -perfil.avancoAMm;
  const xFim = perfil.comprimentoMm + perfil.avancoBMm;
  const removidos = perfil.furosEstruturais
    // Mesma regra do desenho: só o que atravessa de cima a baixo remove trecho.
    .filter((f) => f.y0 <= 0 && f.y1 >= perfil.alturaMm)
    .map((f) => ({ x0: Math.max(xIni, f.x0), x1: Math.min(xFim, f.x1) }))
    .filter((r) => r.x1 > r.x0)
    .sort((a, b) => a.x0 - b.x0);
  const trechos: { x0: number; x1: number }[] = [];
  let cursor = xIni;
  for (const r of removidos) {
    if (r.x0 > cursor) trechos.push({ x0: cursor, x1: r.x0 });
    cursor = Math.max(cursor, r.x1);
  }
  if (cursor < xFim) trechos.push({ x0: cursor, x1: xFim });
  // 1 mm, como o `EPS` de `geometriaDaParede`. Sem isto, o ruído de ponto
  // flutuante da extensão de mitra (−75,00000000000001 contra −75) deixa um
  // "trecho" de 1e−14 mm e o teste acusa dois onde o desenho faz um.
  return trechos.filter((t) => t.x1 - t.x0 > 1);
}

function cena(posPilar: { x: number; y: number }, cede: boolean): BlueprintModel {
  const base = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 },
  ]).model;
  const levelId = base.levels[0].id;
  const m = applyBatch(base, [
    {
      type: 'AddWall',
      levelId,
      a: { x: 23425, y: -38080 },
      b: { x: 26945, y: -38080 },
      thicknessMm: 150,
      heightMm: 2800,
    },
    {
      type: 'AddStructural',
      levelId,
      kind: 'PILAR',
      pontos: [posPilar],
      larguraMm: 150,
      profundidadeMm: 400,
      alturaMm: 2800,
    },
  ] as Command[]).model;
  return cede
    ? applyBatch(m, [
        { type: 'SetCedeSobreposicao', id: m.walls[0].id, cede: true },
      ] as Command[]).model
    : m;
}

describe('3D · a parede encurta onde o concreto passa', () => {
  it('pilar na PONTA: a parede vira UM trecho, mais curto', () => {
    // As coordenadas do estudo real do usuário.
    const m = cena({ x: 26945, y: -37955 }, true);
    const t = trechosDaParede(m, m.walls[0]);

    expect(t).toHaveLength(1);
    expect(t[0].x0).toBeCloseTo(0, 6);
    // A parede tem 3520 e para em 3445: os últimos 75 mm são do pilar.
    expect(t[0].x1).toBe(3445);
  });

  it('pilar no MEIO: a parede vira DOIS trechos', () => {
    const m = cena({ x: 25000, y: -38080 }, true);
    const t = trechosDaParede(m, m.walls[0]);

    expect(t).toHaveLength(2);
    expect(t[0].x1).toBe(1500);
    expect(t[1].x0).toBe(1650);
  });

  it('sem a marca, a parede continua inteira', () => {
    const m = cena({ x: 26945, y: -37955 }, false);
    const t = trechosDaParede(m, m.walls[0]);
    expect(t).toHaveLength(1);
    expect(t[0].x1).toBe(3520);
  });

  it('⚠️ A MALHA muda de verdade — e como FURO ela não mudava', () => {
    const m = cena({ x: 26945, y: -37955 }, true);
    const perfil = perfilDaParedeComVaos(m, m.walls[0]);
    const A = 2.8;

    // (a) O jeito ANTIGO: retângulo inteiro com o vão como furo na borda.
    const comFuro = new THREE.Shape();
    comFuro.moveTo(0, 0);
    comFuro.lineTo(3.52, 0);
    comFuro.lineTo(3.52, A);
    comFuro.lineTo(0, A);
    comFuro.lineTo(0, 0);
    const f = perfil.furosEstruturais[0];
    const furo = new THREE.Path();
    furo.moveTo(f.x0 / 1000, 0.001);
    furo.lineTo(3.52 - 0.001, 0.001);
    furo.lineTo(3.52 - 0.001, A - 0.001);
    furo.lineTo(f.x0 / 1000, A - 0.001);
    furo.lineTo(f.x0 / 1000, 0.001);
    comFuro.holes.push(furo);
    const geomFuro = new THREE.ExtrudeGeometry(comFuro, { depth: 0.15, bevelEnabled: false });

    // (b) O jeito NOVO: o retângulo já nasce curto.
    const curta = new THREE.Shape();
    curta.moveTo(0, 0);
    curta.lineTo(3.445, 0);
    curta.lineTo(3.445, A);
    curta.lineTo(0, A);
    curta.lineTo(0, 0);
    const geomCurta = new THREE.ExtrudeGeometry(curta, { depth: 0.15, bevelEnabled: false });

    const caixa = (g: THREE.BufferGeometry) => {
      g.computeBoundingBox();
      return g.boundingBox!.max.x;
    };

    // A prova: com o furo na borda, a malha ainda vai até 3,52 m — a parede
    // atravessa o pilar, exatamente o que o usuário via. Encurtando, ela para
    // em 3,445 m, na face do concreto.
    expect(caixa(geomFuro)).toBeCloseTo(3.52, 3);
    expect(caixa(geomCurta)).toBeCloseTo(3.445, 3);
  });
});

/**
 * ─── O QUE NÃO PODE INTERROMPER A PAREDE ────────────────────────────────────
 *
 * Achado ao renderizar a planta REAL do usuário em 01/09/2026: a laje do piso
 * (12 cm, cota 0) encostava na base de uma parede ao longo de **2,69 m**, e a
 * versão nova — que remove o TRECHO — ia apagar 2,69 m de parede inteira,
 * porque a informação de altura estava sendo jogada fora.
 *
 * Fisicamente é óbvio: laje passa por baixo, viga passa por cima. Quem
 * interrompe alvenaria é o pilar.
 */
describe('3D · o que NÃO interrompe a parede', () => {
  function comPeca(cmd: Command): BlueprintModel {
    const base = applyBatch(emptyModel(), [
      { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 },
    ]).model;
    const levelId = base.levels[0].id;
    const m = applyBatch(base, [
      {
        type: 'AddWall',
        levelId,
        a: { x: 0, y: 0 },
        b: { x: 5000, y: 0 },
        thicknessMm: 150,
        heightMm: 2800,
      },
      { ...cmd, levelId } as Command,
    ] as Command[]).model;
    return applyBatch(m, [
      { type: 'SetCedeSobreposicao', id: m.walls[0].id, cede: true },
    ] as Command[]).model;
  }

  it('LAJE no piso não abre vão nenhum na parede', () => {
    const m = comPeca({
      type: 'AddStructural',
      kind: 'LAJE',
      pontos: [
        { x: 500, y: -500 },
        { x: 4000, y: -500 },
        { x: 4000, y: 500 },
        { x: 500, y: 500 },
      ],
      larguraMm: 0,
      profundidadeMm: 0,
      alturaMm: 120,
      baseMm: 0,
    } as unknown as Command);

    expect(perfilDaParedeComVaos(m, m.walls[0]).furosEstruturais).toHaveLength(0);
  });

  it('VIGA no topo não abre vão nenhum na parede', () => {
    const m = comPeca({
      type: 'AddStructural',
      kind: 'VIGA',
      pontos: [
        { x: 0, y: 0 },
        { x: 5000, y: 0 },
      ],
      larguraMm: 150,
      profundidadeMm: 0,
      alturaMm: 500,
      baseMm: 2300,
    } as unknown as Command);

    expect(perfilDaParedeComVaos(m, m.walls[0]).furosEstruturais).toHaveLength(0);
  });

  it('PILAR mais BAIXO que a parede não vira trecho removido — vira furo', () => {
    const m = comPeca({
      type: 'AddStructural',
      kind: 'PILAR',
      pontos: [{ x: 2500, y: 0 }],
      larguraMm: 300,
      profundidadeMm: 300,
      alturaMm: 1000,
      baseMm: 0,
    } as unknown as Command);

    const f = perfilDaParedeComVaos(m, m.walls[0]).furosEstruturais;
    expect(f).toHaveLength(1);
    // Ele sobe só 1,00 m numa parede de 2,80 m: sobra alvenaria em cima, e o
    // trecho NÃO pode ser apagado de cima a baixo.
    expect(f[0].y1).toBe(1000);
    expect(f[0].y1).toBeLessThan(2800);
  });
});

/**
 * ─── O TOCO DA MITRA ────────────────────────────────────────────────────────
 *
 * Sexto e último defeito da série, achado medindo a planta real do usuário
 * depois que ele disse "continua do mesmo jeito, nada resolvido" — com um print
 * onde se via uma lasca de alvenaria na face do pilar.
 *
 * O retângulo DESENHADO da parede não morre no vértice do eixo: ele avança
 * `extensaoDeCanto` (meia espessura num canto de 90°) para o canto fechar. O vão
 * do concreto era calculado só contra o corpo RETO e parava no eixo — então o
 * avanço sobrevivia como um trecho SOLTO de 75 mm dentro do pilar.
 *
 * Medido na planta dele: parede terminando em 3520 com avanço de 75; o vão ia
 * até 3520 e o trecho [3520, 3595] ficava de pé, dentro do concreto.
 */
describe('3D · o toco da mitra', () => {
  it('parede em canto NÃO deixa lasca dentro do pilar', () => {
    const base = applyBatch(emptyModel(), [
      { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 },
    ]).model;
    const levelId = base.levels[0].id;
    // Duas paredes em L — é o encontro que cria a extensão de mitra.
    const m = applyBatch(base, [
      {
        type: 'AddWall', levelId,
        a: { x: 0, y: 0 }, b: { x: 4000, y: 0 },
        thicknessMm: 150, heightMm: 2800,
      },
      {
        type: 'AddWall', levelId,
        a: { x: 4000, y: 0 }, b: { x: 4000, y: 3000 },
        thicknessMm: 150, heightMm: 2800,
      },
      {
        type: 'AddStructural', levelId, kind: 'PILAR',
        pontos: [{ x: 4000, y: 0 }],
        larguraMm: 300, profundidadeMm: 300, alturaMm: 2800,
      },
    ] as Command[]).model;

    const comMarca = applyBatch(
      m,
      m.walls.map((w) => ({ type: 'SetCedeSobreposicao', id: w.id, cede: true }) as const) as Command[],
    ).model;

    for (const w of comMarca.walls) {
      const perfil = perfilDaParedeComVaos(comMarca, w);
      const xIni = -perfil.avancoAMm;
      const xFim = perfil.comprimentoMm + perfil.avancoBMm;
      const f = perfil.furosEstruturais[0];
      expect(f).toBeTruthy();

      // O vão tem de ALCANÇAR a borda do retângulo desenhado — a que estiver
      // dentro do pilar, que é o começo numa parede e o fim na outra. Parando no
      // vértice do eixo, o avanço da mitra sobrevive como toco.
      const tocaBorda = f.x0 <= xIni + 1 || f.x1 >= xFim - 1;
      expect(tocaBorda).toBe(true);

      // E a propriedade que importa: UM trecho só. O toco apareceria como um
      // segundo, de 75 mm, dentro do concreto.
      expect(trechosDaParede(comMarca, w)).toHaveLength(1);
    }
  });
});
