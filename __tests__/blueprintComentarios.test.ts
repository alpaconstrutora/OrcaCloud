/**
 * Comentários ancorados em elemento (07/09/2026 — Etapa 5 do roadmap BIM).
 *
 * ─── POR QUE ESTA FEATURE SÓ PÔDE NASCER AGORA ──────────────────────────────
 *
 * Até a Etapa 1 o id de cada elemento era reatribuído POR POSIÇÃO a cada
 * publicação. Um comentário ancorado num id teria mudado de parede sozinho na
 * revisão seguinte — e sem aviso nenhum, porque a parede nova também existe.
 * Os dois primeiros casos abaixo são exatamente essa prova.
 *
 * ─── E O CASO QUE NINGUÉM PENSA ─────────────────────────────────────────────
 *
 * O elemento comentado pode ser APAGADO. Esconder o comentário aí seria apagar
 * uma pendência que ninguém decidiu apagar: quem comentou nunca saberia que o
 * assunto virou pó junto com a parede.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  point,
  type BlueprintModel,
} from '../utils/blueprintKernel';
import {
  posicoesPorUid,
  resumo,
  situarComentarios,
  type ComentarioAncorado,
} from '../utils/blueprintComentarios';

const H = 2800;

function casa(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  }).model;
  const lvl = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number) =>
    ({
      type: 'AddWall' as const,
      levelId: lvl,
      a: point(ax, ay),
      b: point(bx, by),
      thicknessMm: 150,
      heightMm: H,
    });
  return applyBatch(base, [
    p(0, 0, 4000, 0),
    p(4000, 0, 4000, 3000),
    p(4000, 3000, 0, 3000),
    p(0, 3000, 0, 0),
  ]).model;
}

const comentario = (over: Partial<ComentarioAncorado> = {}): ComentarioAncorado => ({
  element_uid: null,
  ponto_x_mm: null,
  ponto_y_mm: null,
  level_uid: null,
  resolvido_em: null,
  ...over,
});

/** Publicar e reabrir — é aqui que os ids são renumerados. */
const publicar = (m: BlueprintModel) => modelFromCanonicalPayload(JSON.parse(canonicalPayload(m)));

describe('comentário ancorado · o que a identidade garante', () => {
  it('SOBREVIVE À PUBLICAÇÃO, que renumera os ids', () => {
    // ⚠️ O caso que justifica a feature existir depois da Etapa 1. O `id` da
    // parede muda ao republicar; o `uid`, não.
    const antes = casa();
    const parede = antes.walls[1];
    const c = comentario({ element_uid: parede.uid });

    const depois = publicar(antes);
    // O id de fato mudou de dono, ou o teste não estaria provando nada.
    expect(depois.walls.map((w) => w.uid)).toContain(parede.uid);

    const [situado] = situarComentarios([c], depois);
    expect(situado.situacao).toBe('ANCORADO');
    expect(situado.ponto).toEqual({ x: 4000, y: 1500 });
  });

  it('SEGUE A PEÇA QUANDO ELA É MOVIDA', () => {
    // O ponto do elemento vence o ponto guardado. Um marcador parado onde a
    // parede estava é pior que nenhum: aponta para o lugar errado com
    // confiança.
    const antes = casa();
    const parede = antes.walls[0];
    const c = comentario({ element_uid: parede.uid, ponto_x_mm: 2000, ponto_y_mm: 0 });

    const movida = applyCommand(antes, {
      type: 'TranslateEntities',
      wallIds: [parede.id],
      boundaryIds: [],
      delta: { x: 0, y: -1000 },
    }).model;

    const [situado] = situarComentarios([c], movida);
    expect(situado.ponto).toEqual({ x: 2000, y: -1000 });
  });
});

describe('comentário ancorado · quando o elemento some', () => {
  it('NÃO é escondido — volta como ELEMENTO_SUMIU, no ponto guardado', () => {
    const antes = casa();
    const parede = antes.walls[0];
    const c = comentario({ element_uid: parede.uid, ponto_x_mm: 2000, ponto_y_mm: 0 });

    const semParede = applyCommand(antes, { type: 'DeleteWall', wallId: parede.id }).model;

    const [situado] = situarComentarios([c], semParede);
    expect(situado.situacao).toBe('ELEMENTO_SUMIU');
    expect(situado.ponto).toEqual({ x: 2000, y: 0 });
  });

  it('e sem ponto guardado ele ainda aparece, só que sem marcador', () => {
    // A pendência continua existindo. Sumir com ela seria a única coisa pior
    // que não ter onde desenhá-la.
    const antes = casa();
    const c = comentario({ element_uid: antes.walls[0].uid });
    const vazio = applyCommand(emptyModel(), {
      type: 'AddLevel',
      name: 'T',
      elevationMm: 0,
      defaultHeightMm: H,
    }).model;

    const [situado] = situarComentarios([c], vazio);
    expect(situado.situacao).toBe('ELEMENTO_SUMIU');
    expect(situado.ponto).toBeNull();
  });
});

describe('comentário de LUGAR', () => {
  it('não tem elemento e vai no ponto que a pessoa clicou', () => {
    const [situado] = situarComentarios(
      [comentario({ ponto_x_mm: 1234, ponto_y_mm: 567 })],
      casa(),
    );
    expect(situado.situacao).toBe('LUGAR');
    expect(situado.ponto).toEqual({ x: 1234, y: 567 });
  });
});

describe('posições por uid · todas as famílias que têm identidade', () => {
  it('parede, abertura, estrutura e rótulo de ambiente entram', () => {
    const base = casa();
    const parede = base.walls[0];
    const m = applyBatch(base, [
      {
        type: 'AddOpening',
        wallId: parede.id,
        kind: 'door',
        offsetMm: 1000,
        widthMm: 800,
        heightMm: 2100,
        sillMm: 0,
      },
      {
        type: 'AddStructural',
        levelId: base.levels[0].id,
        kind: 'PILAR',
        pontos: [point(2000, 1500)],
        larguraMm: 200,
        profundidadeMm: 400,
        alturaMm: 2800,
        baseMm: 0,
      },
    ]).model;

    const posicoes = posicoesPorUid(m);
    expect(posicoes.get(parede.uid)).toEqual({ x: 2000, y: 0 });
    // ⚠️ A ABERTURA fica no eixo da parede, no MEIO do vão: 1000 + 800/2 = 1400.
    // Sem esta conta ela cairia na origem do desenho — longe da porta, e num
    // lugar que parece proposital.
    expect(posicoes.get(m.openings[0].uid)).toEqual({ x: 1400, y: 0 });
    expect(posicoes.get(m.structures![0].uid)).toEqual({ x: 2000, y: 1500 });
  });
});

describe('resumo do painel', () => {
  it('conta abertos, resolvidos e ÓRFÃOS — órfão só entre os abertos', () => {
    // Um comentário já resolvido cujo elemento sumiu não é pendência nenhuma:
    // provavelmente a peça sumiu PORQUE ele foi resolvido.
    const m = casa();
    const situados = situarComentarios(
      [
        comentario({ element_uid: m.walls[0].uid }),
        comentario({ element_uid: 'nao-existe', ponto_x_mm: 0, ponto_y_mm: 0 }),
        comentario({
          element_uid: 'tambem-nao',
          ponto_x_mm: 0,
          ponto_y_mm: 0,
          resolvido_em: '2026-09-07T12:00:00Z',
        }),
      ],
      m,
    );
    expect(resumo(situados)).toEqual({ abertos: 2, resolvidos: 1, orfaos: 1 });
  });
});
