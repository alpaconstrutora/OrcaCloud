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
import {
  custoPorElemento,
  gerarLancamentos,
  refDoElemento,
  type ContextoGeracao,
  type MapeamentoResolvido,
} from '../utils/blueprintBudget';

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

/**
 * O custo que se mostra ao lado de uma peça selecionada.
 *
 * O risco aqui não é errar a soma — é somar o que não é da peça. Três dos
 * quatro formatos de id que a Planta gera NÃO são de um elemento, e atribuir
 * qualquer um deles a uma parede daria um número plausível e errado, que é a
 * classe de defeito que este módulo persegue desde o começo.
 */
describe('orçamento · custo por elemento', () => {
  const linha = (id: string, quantity: number, price: number) => ({
    id,
    quantity,
    sinapiItem: { price },
  });

  it('só a linha POR ELEMENTO conta', () => {
    const uid = '9f1fda2c-0991-4b5f-913f-4c9c399e3b64';
    const mapa = custoPorElemento([
      linha(`bp:std_1:map_1:${uid}`, 10, 5),          // desta parede: 50
      linha('bp:std_1:map_1:total', 100, 5),          // total do desenho
      linha('bp:std_1:camada:87251:ESTRUTURAL', 8, 3), // por material
      linha('bp:std_1:esquadria:door|800|2100', 2, 9), // por TIPO de esquadria
    ]);
    expect(mapa.size).toBe(1);
    expect(mapa.get(uid)).toEqual({ totalBRL: 50, linhas: 1 });
  });

  it('duas medidas da MESMA parede somam', () => {
    const uid = 'abc';
    const mapa = custoPorElemento([
      linha('bp:std_1:map_1:abc', 10, 5),
      linha('bp:std_1:map_2:abc', 4, 2.5),
    ]);
    expect(mapa.get(uid)).toEqual({ totalBRL: 60, linhas: 2 });
  });

  it('linha sem preço não inventa custo', () => {
    const mapa = custoPorElemento([{ id: 'bp:s:m:abc', quantity: 10, sinapiItem: {} }]);
    expect(mapa.get('abc')).toEqual({ totalBRL: 0, linhas: 1 });
  });

  it('id de outra origem é ignorado, não quebra', () => {
    expect(refDoElemento('digitado-a-mao')).toBeNull();
    expect(refDoElemento('bp:std_1:map_1:total')).toBeNull();
    expect(refDoElemento('bp:std_1:camada:87251:ESTRUTURAL')).toBeNull();
    expect(refDoElemento('bp:std_1:esquadria:door|800')).toBeNull();
    expect(refDoElemento('bp:std_1:map_1:uid-x')).toBe('uid-x');
  });

  it('a ponta a ponta: o custo casa com o uid da parede, e sobrevive ao publish', () => {
    const m = publicar(comDuasParedes());
    const alvo = m.walls.find((w) => w.a.x === 4000)!;
    const quant = computeQuantities(m, POLITICA_PADRAO, 'k');
    const { entries } = gerarLancamentos(quant, POR_ELEMENTO, CONTEXTO);
    const mapa = custoPorElemento(entries);

    // A parede vertical tem 3,00 m de eixo, a R$ 10/m.
    expect(mapa.get(alvo.uid)?.totalBRL).toBeCloseTo(30, 2);
    // E casa pelo UID — não pelo id posicional.
    expect(mapa.has(alvo.id)).toBe(false);
  });
});
