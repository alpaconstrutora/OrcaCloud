/**
 * A linha de orçamento tem de apontar para o ELEMENTO, não para a posição dele.
 *
 * ─── O DEFEITO QUE ISTO EXPÕE ───────────────────────────────────────────────
 *
 * O id da linha é `bp:<estudo>:<mapeamento>:<ref>`, e até 06/09/2026 `ref` era
 * o `id` do kernel (`wal_0003`, `spc_0001`…). Esse id é POSICIONAL: ele é
 * reatribuído a cada `modelFromCanonicalPayload`, ou seja, a cada publicação.
 *
 * A Etapa 1 criou o `uid` justamente para isso — identidade que sobrevive ao
 * publish — e o orçamento nunca passou a usá-lo. A consequência: inserir uma
 * parede ANTES das outras renumera todo mundo, e as linhas de orçamento das
 * paredes que ninguém tocou trocam de identidade. Quem tiver anotação,
 * medição ou vínculo preso ao id perde o vínculo, em silêncio.
 *
 * O caso abaixo é o que discrimina: ele não olha o formato do id, olha se a
 * MESMA parede continua com a MESMA linha depois de uma inserção.
 */
import { describe, expect, it } from 'vitest';
import {
  POLITICA_PADRAO,
  applyCommand,
  canonicalPayload,
  computeQuantities,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  type BlueprintModel,
} from '../utils/blueprintKernel';
import { gerarLancamentos, type ContextoGeracao, type MapeamentoResolvido } from '../utils/blueprintBudget';

const CONTEXTO: ContextoGeracao = {
  studyId: 'std_1',
  studyName: 'Estudo',
  snapshotId: 'snap_1',
  snapshotHash: 'h',
  revision: 1,
};

/** De-para de comprimento de parede, agrupado POR ELEMENTO. */
const POR_ELEMENTO: MapeamentoResolvido[] = [
  {
    mapeamento: {
      id: 'map_1',
      organization_id: 'org_1',
      medida: 'COMPRIMENTO_PAREDE',
      item_code: '00001',
      phase: '',
      budget_group: 'Planta',
      agrupamento: 'POR_ELEMENTO',
      filtro_ambiente: [],
      active: true,
    },
    item: { code: '00001', description: 'Alvenaria', unit: 'M', price: 10 },
  } as unknown as MapeamentoResolvido,
];

function comDuasParedes(): BlueprintModel {
  const n = applyCommand(emptyModel(), {
    type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800,
  });
  const levelId = n.model.levels[0].id;
  const a = applyCommand(n.model, {
    type: 'AddWall', levelId, a: point(0, 0), b: point(4000, 0),
    thicknessMm: 150, heightMm: 2800,
  });
  return applyCommand(a.model, {
    type: 'AddWall', levelId, a: point(4000, 0), b: point(4000, 3000),
    thicknessMm: 150, heightMm: 2800,
  }).model;
}

/** O id da linha gerada para a parede que vai de (4000,0) a (4000,3000). */
function idDaParedeVertical(model: BlueprintModel): string {
  const alvo = model.walls.find((w) => w.a.x === 4000 && w.b.x === 4000);
  expect(alvo, 'a parede vertical tem de existir').toBeDefined();
  const quant = computeQuantities(model, POLITICA_PADRAO, 'k');
  const { entries } = gerarLancamentos(quant, POR_ELEMENTO, CONTEXTO);
  // A linha cujo ref corresponde à parede vertical.
  const dela = entries.filter((e) => e.id.endsWith(alvo!.id) || e.id.endsWith(alvo!.uid));
  expect(dela, 'uma linha para a parede vertical').toHaveLength(1);
  return dela[0].id;
}

/**
 * O que uma PUBLICAÇÃO faz ao modelo.
 *
 * É aqui que os ids do kernel são reatribuídos: `modelFromCanonicalPayload`
 * numera por posição na ordem canônica. Em memória os ids não mudam — por isso
 * um teste que só chame `applyCommand` NÃO reproduz o defeito, e passa dando a
 * impressão de que está tudo bem.
 */
const publicar = (m: BlueprintModel): BlueprintModel =>
  modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));

describe('orçamento · a linha segue o elemento, não a posição', () => {
  it('o publish sozinho não mexe na linha — a base de comparação', () => {
    const m = comDuasParedes();
    expect(idDaParedeVertical(publicar(m))).toBe(idDaParedeVertical(m));
  });

  it('INSERIR uma parede antes e republicar não pode mudar o id da linha das outras', () => {
    const antes = publicar(comDuasParedes());
    const idAntes = idDaParedeVertical(antes);
    const uidAntes = antes.walls.find((w) => w.a.x === 4000)!.uid;

    // A parede nova nasce ANTES das outras na ordem canônica (x menor), e a
    // republicação renumera: a vertical deixa de ser `wal_0002`.
    const depois = publicar(
      applyCommand(antes, {
        type: 'AddWall',
        levelId: antes.levels[0].id,
        a: point(-5000, -5000),
        b: point(-1000, -5000),
        thicknessMm: 150,
        heightMm: 2800,
      }).model,
    );

    const alvo = depois.walls.find((w) => w.a.x === 4000)!;
    expect(alvo.uid, 'o uid é a identidade e não pode mudar no publish').toBe(uidAntes);
    // A prova de que a renumeração de fato aconteceu — sem isto o caso poderia
    // passar por não ter exercitado nada.
    const alvoAntes = antes.walls.find((w) => w.a.x === 4000)!;
    expect(alvo.id, 'o id posicional tinha de ter mudado').not.toBe(alvoAntes.id);

    expect(idDaParedeVertical(depois), 'a linha da parede intocada trocou de id').toBe(idAntes);
  });
});
