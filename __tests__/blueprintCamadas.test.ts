/**
 * Parede em CAMADAS (kernel 0.11.0, política de quantitativo quant-1.6.0).
 *
 * Uma parede real não é homogênea: bloco cerâmico 140 com chapisco e reboco de
 * 25 em cada face são três materiais, três preços e três serviços. Este arquivo
 * trava as quatro coisas que fazem isso ser confiável em vez de decorativo:
 *
 *   1. a SOMA das camadas é a espessura da parede, e o kernel se recusa a
 *      guardar um estado onde as duas divergem;
 *   2. a ORDEM é da face esquerda para a direita, e comando que inverta o
 *      sentido `a → b` inverte a composição junto;
 *   3. o payload canônico não ganha chave nenhuma em parede homogênea, e fecha
 *      byte a byte na volta quando há camadas;
 *   4. a soma dos volumes das camadas é EXATAMENTE o volume da parede.
 *
 * Como em `blueprintQuantities.test.ts`, os números esperados são calculados à
 * mão no comentário de cada caso, nunca copiados da saída do código.
 */

import { describe, expect, it } from 'vitest';
import {
  KERNEL_VERSION,
  KernelError,
  POLITICA_PADRAO,
  applyBatch,
  applyCommand,
  assertModelInvariants,
  assinaturaDasCamadas,
  canonicalPayload,
  clonarCamadas,
  computeQuantities,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  somaDasCamadas,
  type CamadaParede,
  type Command,
} from '../utils/blueprintKernel';

const H = 2800;

/** Bloco 140 com reboco de 25 em cada face — a composição de referência. */
const COMPOSICAO: CamadaParede[] = [
  { espessuraMm: 25, itemCode: '87879', descricao: 'Reboco externo', funcao: 'REVESTIMENTO' },
  { espessuraMm: 140, itemCode: '103333', descricao: 'Bloco cerâmico', funcao: 'VEDACAO' },
  { espessuraMm: 25, itemCode: '87879', descricao: 'Reboco interno', funcao: 'REVESTIMENTO' },
];

function base() {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  return { model: r.model, levelId: r.model.levels[0].id };
}

function wall(
  levelId: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  t = 150,
): Command {
  return {
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: t,
    heightMm: H,
  };
}

/** Uma parede de `comprimento` mm, já com a composição de referência aplicada. */
function paredeComCamadas(comprimento = 4000, camadas = COMPOSICAO) {
  const { model, levelId } = base();
  const comAParede = applyCommand(model, wall(levelId, 0, 0, comprimento, 0)).model;
  const wallId = comAParede.walls[0].id;
  const r = applyCommand(comAParede, { type: 'SetWallLayers', wallId, camadas });
  return { model: r.model, wallId, levelId };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. A soma manda
// ─────────────────────────────────────────────────────────────────────────────

describe('camadas · a soma é a espessura', () => {
  it('SetWallLayers recalcula a espessura da parede a partir das camadas', () => {
    // 25 + 140 + 25 = 190 mm. A parede nasceu com 150 e não foi informada de
    // espessura nenhuma no comando — ela é DERIVADA.
    const { model, wallId } = paredeComCamadas();
    const parede = model.walls.find((w) => w.id === wallId)!;

    expect(parede.thicknessMm).toBe(190);
    expect(somaDasCamadas(parede.camadas)).toBe(190);
    expect(parede.camadas).toHaveLength(3);
  });

  it('recusa SetThickness numa parede que tem camadas', () => {
    // Redistribuir 190 → 250 exigiria escolher de quais faixas tirar os
    // milímetros. Recusar é o certo: escalar proporcionalmente mexeria em
    // material que ninguém mandou mexer, e daria espessura fracionária.
    const { model, wallId } = paredeComCamadas();

    expect(() =>
      applyCommand(model, { type: 'SetThickness', wallId, thicknessMm: 250 }),
    ).toThrow(KernelError);

    try {
      applyCommand(model, { type: 'SetThickness', wallId, thicknessMm: 250 });
    } catch (e) {
      expect((e as KernelError).code).toBe('THICKNESS_FROM_LAYERS');
    }
  });

  it('SetThickness segue funcionando em parede homogênea', () => {
    // A recusa acima não pode ter custado o comportamento de sempre.
    const { model, levelId } = base();
    const comAParede = applyCommand(model, wall(levelId, 0, 0, 4000, 0)).model;
    const wallId = comAParede.walls[0].id;

    const r = applyCommand(comAParede, { type: 'SetThickness', wallId, thicknessMm: 250 });
    expect(r.model.walls[0].thicknessMm).toBe(250);
    expect(r.model.walls[0].camadas).toBeUndefined();
  });

  it('camadas: null volta a parede a homogênea preservando a espessura', () => {
    // Largar a decomposição não pode mexer na geometria: as camadas somavam
    // exatamente `thicknessMm`, então a parede continua com 190 mm.
    const { model, wallId } = paredeComCamadas();
    const r = applyCommand(model, { type: 'SetWallLayers', wallId, camadas: null });
    const parede = r.model.walls.find((w) => w.id === wallId)!;

    expect(parede.camadas).toBeUndefined();
    expect(parede.thicknessMm).toBe(190);
  });

  it('recusa lista de camadas vazia — ausente é que significa homogênea', () => {
    // Duas escritas para o mesmo estado fariam o round-trip do payload parar de
    // fechar: `[]` não é emitido no canônico e voltaria como ausente.
    const { model, levelId } = base();
    const comAParede = applyCommand(model, wall(levelId, 0, 0, 4000, 0)).model;
    const wallId = comAParede.walls[0].id;

    try {
      applyCommand(comAParede, { type: 'SetWallLayers', wallId, camadas: [] });
      throw new Error('deveria ter recusado');
    } catch (e) {
      // ⚠️ `EMPTY_LAYERS`, e não `BAD_THICKNESS`: a lista vazia zera a espessura
      // derivada, e a mensagem tinha de apontar para a causa (a lista) e não
      // para o sintoma (a espessura). É a razão de o bloco de camadas rodar
      // ANTES da checagem de espessura em `assertModelInvariants`.
      expect((e as KernelError).code).toBe('EMPTY_LAYERS');
    }
  });

  it('recusa camada de espessura não positiva', () => {
    const { model, levelId } = base();
    const comAParede = applyCommand(model, wall(levelId, 0, 0, 4000, 0)).model;
    const wallId = comAParede.walls[0].id;

    try {
      applyCommand(comAParede, {
        type: 'SetWallLayers',
        wallId,
        camadas: [
          { espessuraMm: 0, itemCode: '', descricao: '', funcao: 'ACABAMENTO' },
          { espessuraMm: 150, itemCode: '', descricao: '', funcao: 'VEDACAO' },
        ],
      });
      throw new Error('deveria ter recusado');
    } catch (e) {
      expect((e as KernelError).code).toBe('BAD_LAYER_THICKNESS');
    }
  });

  it('recusa um modelo em que a soma das camadas não bate com a espessura', () => {
    // O invariante existe para o caso que NÃO passa por `SetWallLayers` — que
    // recalcula a espessura e por construção nunca a deixa divergir. O caso real
    // é outro: um payload corrompido, um comando futuro que mexa em espessura
    // sem olhar a composição. Por isso a asserção é sobre `assertModelInvariants`
    // direto, e não sobre um comando: é ele a rede, e é ele que tem de pegar.
    const { model, wallId } = paredeComCamadas();
    const adulterado = structuredClone(model);
    adulterado.walls.find((w) => w.id === wallId)!.thicknessMm = 300;

    expect(() => assertModelInvariants(adulterado)).toThrow(KernelError);
    try {
      assertModelInvariants(adulterado);
      throw new Error('deveria ter recusado');
    } catch (e) {
      expect((e as KernelError).code).toBe('LAYERS_THICKNESS_MISMATCH');
      // A mensagem diz os dois números, senão quem lê não sabe qual ajustar.
      expect((e as KernelError).message).toContain('190');
      expect((e as KernelError).message).toContain('300');
    }

    // E o modelo íntegro passa — o invariante não pode ser um "sempre falha".
    expect(() => assertModelInvariants(model)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. A ordem e a identidade da composição
// ─────────────────────────────────────────────────────────────────────────────

describe('camadas · ordem e identidade', () => {
  it('a assinatura ignora a descrição e enxerga espessura, código e função', () => {
    // A descrição é cache de rótulo: o catálogo pode mudar a grafia sem que a
    // parede tenha mudado. Se ela entrasse na assinatura, unir duas paredes
    // idênticas passaria a falhar depois de um recadastro no SINAPI.
    const outraGrafia = COMPOSICAO.map((c) => ({ ...c, descricao: `${c.descricao} (revisado)` }));
    expect(assinaturaDasCamadas(outraGrafia)).toBe(assinaturaDasCamadas(COMPOSICAO));

    // Já trocar o material é outra composição.
    const outroBloco = COMPOSICAO.map((c) =>
      c.funcao === 'VEDACAO' ? { ...c, itemCode: '99999' } : c,
    );
    expect(assinaturaDasCamadas(outroBloco)).not.toBe(assinaturaDasCamadas(COMPOSICAO));

    // E a ORDEM importa: reboco fora/dentro invertidos não é a mesma parede.
    expect(assinaturaDasCamadas([...COMPOSICAO].reverse())).not.toBe(
      assinaturaDasCamadas(
        COMPOSICAO.map((c, i) => ({ ...c, itemCode: i === 0 ? 'X' : c.itemCode })),
      ),
    );

    // Parede homogênea tem assinatura vazia — é o que as mantém indistinguíveis
    // por este critério, como sempre foram.
    expect(assinaturaDasCamadas(undefined)).toBe('');
  });

  it('MergeWalls recusa unir paredes de composições diferentes', () => {
    // 25+140+25 e 190 homogênea somam o MESMO: a checagem de espessura não pega,
    // e unir escolheria uma das duas em silêncio, apagando um material do
    // orçamento sem nada na tela dizendo que sumiu.
    const { model, levelId } = base();
    const r = applyBatch(model, [
      wall(levelId, 0, 0, 4000, 0),
      wall(levelId, 4000, 0, 8000, 0, 190),
    ]);
    const [primeira, segunda] = r.model.walls;
    const comCamadas = applyCommand(r.model, {
      type: 'SetWallLayers',
      wallId: primeira.id,
      camadas: COMPOSICAO,
    }).model;

    // As duas têm 190 mm agora — só a composição difere.
    expect(comCamadas.walls.find((w) => w.id === primeira.id)!.thicknessMm).toBe(190);
    expect(comCamadas.walls.find((w) => w.id === segunda.id)!.thicknessMm).toBe(190);

    try {
      applyCommand(comCamadas, {
        type: 'MergeWalls',
        firstId: primeira.id,
        secondId: segunda.id,
      });
      throw new Error('deveria ter recusado');
    } catch (e) {
      expect((e as KernelError).code).toBe('MERGE_LAYERS_MISMATCH');
    }
  });

  it('MergeWalls inverte a ordem das camadas quando inverte o sentido a → b', () => {
    // Duas paredes que compartilham a ponta `a`: unir percorre a primeira ao
    // contrário, e a face que era à esquerda passa a ser à direita. Sem inverter
    // a composição junto, o reboco externo iria para dentro — e como os dois
    // rebocos têm a mesma espessura, o desenho continuaria plausível.
    const { model, levelId } = base();
    const r = applyBatch(model, [
      wall(levelId, 0, 0, -4000, 0),
      wall(levelId, 0, 0, 4000, 0),
    ]);
    const [primeira, segunda] = r.model.walls;

    // Composição ASSIMÉTRICA, senão a inversão seria invisível.
    const assimetrica: CamadaParede[] = [
      { espessuraMm: 10, itemCode: 'FORA', descricao: 'Externo', funcao: 'ACABAMENTO' },
      { espessuraMm: 140, itemCode: 'BLOCO', descricao: 'Bloco', funcao: 'VEDACAO' },
    ];
    const comCamadas = applyBatch(r.model, [
      { type: 'SetWallLayers', wallId: primeira.id, camadas: assimetrica },
      { type: 'SetWallLayers', wallId: segunda.id, camadas: assimetrica },
    ]).model;

    const unida = applyCommand(comCamadas, {
      type: 'MergeWalls',
      firstId: primeira.id,
      secondId: segunda.id,
    }).model.walls[0];

    // A `first` foi percorrida ao contrário (o eixo unido começa em -4000 e a
    // `first.a` era 0), então a composição dela veio invertida.
    expect(unida.a.x).toBe(-4000);
    expect(unida.camadas!.map((c) => c.itemCode)).toEqual(['BLOCO', 'FORA']);
    expect(unida.thicknessMm).toBe(150);
  });

  it('SplitWall dá a cada metade uma CÓPIA da composição, não a mesma lista', () => {
    // `{ ...wall }` copia a referência do array: as duas metades ficariam com a
    // mesma lista, e editar uma reescreveria a outra.
    const { model, wallId } = paredeComCamadas(8000);
    const r = applyCommand(model, { type: 'SplitWall', wallId, at: point(4000, 0) });
    const [a, b] = r.model.walls;

    expect(a.camadas).toHaveLength(3);
    expect(b.camadas).toHaveLength(3);
    expect(a.camadas).not.toBe(b.camadas);
    expect(assinaturaDasCamadas(a.camadas)).toBe(assinaturaDasCamadas(b.camadas));
  });

  it('clonarCamadas devolve cópia profunda, e undefined continua undefined', () => {
    const copia = clonarCamadas(COMPOSICAO)!;
    copia[0].espessuraMm = 999;
    expect(COMPOSICAO[0].espessuraMm).toBe(25);
    expect(clonarCamadas(undefined)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Payload canônico
// ─────────────────────────────────────────────────────────────────────────────

describe('camadas · payload canônico', () => {
  it('não acrescenta chave nenhuma em parede homogênea', () => {
    // É a razão de o campo ser opcional: emitir `camadas` sempre mudaria a forma
    // canônica de TODO desenho do acervo, e o hash de todos eles.
    const { model, levelId } = base();
    const r = applyCommand(model, wall(levelId, 0, 0, 4000, 0));
    expect(canonicalPayload(r.model)).not.toContain('camadas');
  });

  it('fecha o round-trip byte a byte com camadas', () => {
    const { model } = paredeComCamadas();
    const payload = canonicalPayload(model);

    expect(payload).toContain('camadas');
    expect(payload).toContain('103333');

    const devolta = modelFromCanonicalPayload(parseCanonicalPayload(payload));
    expect(canonicalPayload(devolta)).toBe(payload);

    const parede = devolta.walls[0];
    expect(parede.thicknessMm).toBe(190);
    expect(parede.camadas!.map((c) => c.espessuraMm)).toEqual([25, 140, 25]);
    expect(parede.camadas![1].descricao).toBe('Bloco cerâmico');
  });

  it('o payload carrega a versão 0.11.0 do kernel', () => {
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.11.0');
  });

  it('desempata a ordem canônica por composição', () => {
    // O caso que o desempate existe para resolver: duas paredes que empatam em
    // TODOS os critérios anteriores — mesmo nível, mesmo `a`, mesmo `b`, mesma
    // espessura total — e diferem só na composição. Sem o desempate, a ordem no
    // payload era a do array (ordem de criação), e a mesma planta serializava
    // diferente conforme quem foi desenhado primeiro: o hash mudava sem a
    // geometria ter mudado.
    //
    // O modelo é montado À MÃO, e não por comandos, porque o que se testa é a
    // ORDENAÇÃO do serializador: precisa-se das mesmas duas paredes nas duas
    // ordens de array possíveis, e é a única forma de forçar isso.
    const outra: CamadaParede[] = [
      { espessuraMm: 190, itemCode: 'CONCRETO', descricao: 'Concreto', funcao: 'ESTRUTURAL' },
    ];

    const parede = (id: string, camadas: CamadaParede[]) => ({
      id,
      levelId: 'lvl_0001',
      a: point(0, 0),
      b: point(4000, 0),
      thicknessMm: 190,
      heightMm: H,
      camadas,
    });

    const comAsParedesEmOrdem = (invertido: boolean) => {
      const p1 = parede('wal_0001', COMPOSICAO);
      const p2 = parede('wal_0002', outra);
      return {
        levels: [{ id: 'lvl_0001', name: 'Térreo', elevationMm: 0, defaultHeightMm: H }],
        walls: invertido ? [p2, p1] : [p1, p2],
        openings: [],
        boundaries: [],
        structures: [],
        labels: [],
        spaces: [],
        seq: {},
      };
    };

    // A MESMA planta nas duas ordens de criação: um payload só.
    expect(canonicalPayload(comAsParedesEmOrdem(false))).toBe(
      canonicalPayload(comAsParedesEmOrdem(true)),
    );

    // E o desempate ordena de fato pela assinatura: `CONCRETO` (que começa com
    // "190|CONCRETO") vem antes de "25|87879". Se a asserção acima passasse por
    // acidente — por o serializador ignorar a segunda parede, por exemplo — esta
    // pegaria.
    const payload = canonicalPayload(comAsParedesEmOrdem(false));
    expect(payload.indexOf('CONCRETO')).toBeLessThan(payload.indexOf('103333'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Quantitativos
// ─────────────────────────────────────────────────────────────────────────────

describe('camadas · quantitativos', () => {
  it('a soma dos volumes das camadas é EXATAMENTE o volume da parede', () => {
    // Parede de 4,00 m × 2,80 m de altura, composição 25+140+25 = 190 mm.
    //   área de face líquida = 4,00 × 2,80          = 11,20 m²
    //   volume total         = 11,20 × 0,190        =  2,128 m³
    //   reboco externo       = 11,20 × 0,025        =  0,280 m³
    //   bloco                = 11,20 × 0,140        =  1,568 m³
    //   reboco interno       = 11,20 × 0,025        =  0,280 m³
    //   soma                 = 0,280+1,568+0,280    =  2,128 m³ ✓
    const { model } = paredeComCamadas();
    const q = computeQuantities(model, POLITICA_PADRAO);
    const parede = q.paredes[0];

    expect(parede.areaFaceLiquidaM2).toBeCloseTo(11.2, 6);
    expect(parede.volumeM3).toBeCloseTo(2.128, 6);
    expect(parede.camadas).toHaveLength(3);
    expect(parede.camadas[1].volumeM3).toBeCloseTo(1.568, 6);

    const soma = parede.camadas.reduce((s, c) => s + c.volumeM3, 0);
    expect(soma).toBeCloseTo(parede.volumeM3, 9);
  });

  it('toda camada carrega a área de face da parede, e não uma fatia dela', () => {
    // O vão atravessa a espessura inteira: o mesmo desconto vale para as três.
    const { model } = paredeComCamadas();
    const q = computeQuantities(model, POLITICA_PADRAO);
    const parede = q.paredes[0];

    for (const c of parede.camadas) {
      expect(c.areaFaceM2).toBeCloseTo(parede.areaFaceLiquidaM2, 9);
    }
  });

  it('desconta o vão de todas as camadas', () => {
    // Porta de 0,80 × 2,10 = 1,68 m² numa parede de 4,00 × 2,80.
    //   área líquida = 11,20 − 1,68 = 9,52 m²
    //   bloco        = 9,52 × 0,140 = 1,3328 m³
    const { model, wallId } = paredeComCamadas();
    const comPorta = applyCommand(model, {
      type: 'AddOpening',
      wallId,
      kind: 'door',
      offsetMm: 1000,
      widthMm: 800,
      heightMm: 2100,
      sillMm: 0,
    }).model;

    const q = computeQuantities(comPorta, POLITICA_PADRAO);
    const parede = q.paredes[0];

    expect(parede.areaFaceLiquidaM2).toBeCloseTo(9.52, 6);
    expect(parede.camadas[1].volumeM3).toBeCloseTo(1.3328, 6);
    expect(parede.camadas.reduce((s, c) => s + c.volumeM3, 0)).toBeCloseTo(parede.volumeM3, 9);
  });

  it('agrupa por material somando paredes diferentes', () => {
    // Duas paredes de 4,00 m com a MESMA composição.
    //   bloco  = 2 × 1,568 = 3,136 m³
    //   reboco = 4 faixas × 0,280 = 1,120 m³ (duas por parede, mesmo itemCode)
    const { model, levelId } = base();
    const r = applyBatch(model, [
      wall(levelId, 0, 0, 4000, 0),
      wall(levelId, 0, 3000, 4000, 3000),
    ]);
    const comCamadas = applyBatch(r.model, [
      { type: 'SetWallLayers', wallId: r.model.walls[0].id, camadas: COMPOSICAO },
      { type: 'SetWallLayers', wallId: r.model.walls[1].id, camadas: COMPOSICAO },
    ]).model;

    const q = computeQuantities(comCamadas, POLITICA_PADRAO);

    // Duas linhas, e não quatro: o reboco das duas faces tem o mesmo código.
    expect(q.totais.porMaterial).toHaveLength(2);

    const bloco = q.totais.porMaterial.find((m) => m.itemCode === '103333')!;
    const reboco = q.totais.porMaterial.find((m) => m.itemCode === '87879')!;

    expect(bloco.volumeM3).toBeCloseTo(3.136, 6);
    expect(reboco.volumeM3).toBeCloseTo(1.12, 6);
    // Área de reboco: quatro faces de 11,20 m².
    expect(reboco.areaFaceM2).toBeCloseTo(44.8, 6);

    // Ordenado por código — determinístico, não pela ordem de desenho.
    expect(q.totais.porMaterial.map((m) => m.itemCode)).toEqual(['103333', '87879']);
  });

  it('separa por FUNÇÃO o que ainda não foi vinculado a um item', () => {
    // Código vazio é legítimo — a camada existe e o material ainda não foi
    // escolhido. Sem a função na chave, bloco e reboco não vinculados cairiam
    // numa linha só, num "sem material" que não significa nada.
    const semVinculo: CamadaParede[] = [
      { espessuraMm: 25, itemCode: '', descricao: '', funcao: 'REVESTIMENTO' },
      { espessuraMm: 140, itemCode: '', descricao: '', funcao: 'VEDACAO' },
    ];
    const { model } = paredeComCamadas(4000, semVinculo);
    const q = computeQuantities(model, POLITICA_PADRAO);

    expect(q.totais.porMaterial).toHaveLength(2);
    expect(q.totais.porMaterial.map((m) => m.funcao).sort()).toEqual(['REVESTIMENTO', 'VEDACAO']);
  });

  it('parede homogênea segue sem camadas e sem materiais, com o volume de sempre', () => {
    // A garantia de que nada do que já existia mudou: 4,00 × 2,80 × 0,150.
    const { model, levelId } = base();
    const r = applyCommand(model, wall(levelId, 0, 0, 4000, 0));
    const q = computeQuantities(r.model, POLITICA_PADRAO);

    expect(q.paredes[0].camadas).toEqual([]);
    expect(q.totais.porMaterial).toEqual([]);
    expect(q.paredes[0].volumeM3).toBeCloseTo(1.68, 6);
  });
});
