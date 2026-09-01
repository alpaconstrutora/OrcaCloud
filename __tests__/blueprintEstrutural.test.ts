/**
 * O grupo ESTRUTURAL — pilar, viga, laje, estaca, bloco de coroamento e viga de
 * fundação (kernel 0.9.0).
 *
 * Segue o molde que este repositório usa para tipo novo — o bloco "vão livre"
 * em `blueprintKernel.test.ts` e o arquivo `blueprintPortaDeCorrer.test.ts`.
 * São sete perguntas, e a sexta é a que mais importa:
 *
 *   1. o kernel aceita os seis tipos;
 *   2. efeito geométrico — volume e fôrma conferidos à mão;
 *   3. efeito de REGRA — a estrutura NÃO mexe nos ambientes;
 *   4. conta separado nos totais;
 *   5. sobrevive ao round-trip do payload;
 *   6. planta SEM estrutura continua com a MESMA FORMA canônica;  ← a guarda
 *   7. o rótulo é fonte única.
 */

import { describe, expect, it } from 'vitest';
import {
  FORMA_ESTRUTURAL,
  applyBatch,
  canonicalPayload,
  cloneModel,
  computeQuantities,
  emptyModel,
  medirEstrutura,
  modelFromCanonicalPayload,
  nomeDoTipoEstrutural,
  parseCanonicalPayload,
  pontosDeConexaoEstrutural,
  snapshotHash,
  type BlueprintModel,
  type Command,
  type StructuralKind,
} from '../utils/blueprintKernel';

const MM3 = 1_000_000_000;
const MM2 = 1_000_000;

/** Um modelo com um pavimento só, para as estruturas terem onde morar. */
function comNivel(): BlueprintModel {
  return applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 },
  ]).model;
}

function nivelDe(m: BlueprintModel): string {
  return m.levels[0].id;
}

/** Um quadrado de 4 paredes fechando um ambiente — a planta de referência. */
function comAmbiente(): BlueprintModel {
  const base = comNivel();
  const levelId = nivelDe(base);
  const cantos = [
    [0, 0, 4000, 0],
    [4000, 0, 4000, 3000],
    [4000, 3000, 0, 3000],
    [0, 3000, 0, 0],
  ];
  return applyBatch(
    base,
    cantos.map(([ax, ay, bx, by]) => ({
      type: 'AddWall',
      levelId,
      a: { x: ax, y: ay },
      b: { x: bx, y: by },
      thicknessMm: 150,
      heightMm: 2800,
    })) as Command[],
  ).model;
}

describe('estrutural · 1. o kernel aceita os seis tipos', () => {
  const CASOS: { kind: StructuralKind; pontos: { x: number; y: number }[] }[] = [
    { kind: 'PILAR', pontos: [{ x: 1000, y: 1000 }] },
    { kind: 'ESTACA', pontos: [{ x: 1000, y: 1000 }] },
    { kind: 'BLOCO_COROAMENTO', pontos: [{ x: 1000, y: 1000 }] },
    { kind: 'VIGA', pontos: [{ x: 0, y: 0 }, { x: 4000, y: 0 }] },
    { kind: 'VIGA_FUNDACAO', pontos: [{ x: 0, y: 0 }, { x: 4000, y: 0 }] },
    {
      kind: 'LAJE',
      pontos: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 3000 },
        { x: 0, y: 3000 },
      ],
    },
  ];

  it.each(CASOS)('$kind nasce com a cardinalidade da forma dele', ({ kind, pontos }) => {
    const base = comNivel();
    const { model } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: nivelDe(base),
        kind,
        pontos,
        larguraMm: 200,
        profundidadeMm: 400,
        alturaMm: 500,
      },
    ]);

    expect(model.structures).toHaveLength(1);
    expect(model.structures[0].kind).toBe(kind);
    expect(model.structures[0].pontos).toHaveLength(pontos.length);
    // Id determinístico, com o prefixo da família. Nunca `randomUUID`.
    expect(model.structures[0].id).toBe('str_0001');
  });

  it('RECUSA cardinalidade que não bate com a forma', () => {
    const base = comNivel();
    // Pilar com dois pontos: o gesto do PONTO é um clique só, e aceitar dois
    // faria a peça ler um centro que não existe.
    expect(() =>
      applyBatch(base, [
        {
          type: 'AddStructural',
          levelId: nivelDe(base),
          kind: 'PILAR',
          pontos: [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
          ],
          larguraMm: 200,
          profundidadeMm: 400,
          alturaMm: 2800,
        },
      ]),
    ).toThrow(/vértice/i);

    // Laje com dois vértices: não fecha polígono nenhum, e a área sairia zero.
    expect(() =>
      applyBatch(base, [
        {
          type: 'AddStructural',
          levelId: nivelDe(base),
          kind: 'LAJE',
          pontos: [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
          ],
          alturaMm: 120,
        },
      ]),
    ).toThrow(/vértice/i);
  });

  it('RECUSA viga de comprimento zero — volume zero numa peça desenhada', () => {
    const base = comNivel();
    expect(() =>
      applyBatch(base, [
        {
          type: 'AddStructural',
          levelId: nivelDe(base),
          kind: 'VIGA',
          pontos: [
            { x: 1000, y: 1000 },
            { x: 1000, y: 1000 },
          ],
          larguraMm: 150,
          alturaMm: 500,
        },
      ]),
    ).toThrow(/comprimento zero/i);
  });

  it('invariantes: medida não positiva e nível inexistente são recusados', () => {
    const base = comNivel();
    expect(() =>
      applyBatch(base, [
        {
          type: 'AddStructural',
          levelId: nivelDe(base),
          kind: 'PILAR',
          pontos: [{ x: 0, y: 0 }],
          larguraMm: 200,
          profundidadeMm: 400,
          alturaMm: 0,
        },
      ]),
    ).toThrow(/Altura não positiva/i);

    expect(() =>
      applyBatch(base, [
        {
          type: 'AddStructural',
          levelId: 'lvl_9999',
          kind: 'PILAR',
          pontos: [{ x: 0, y: 0 }],
          larguraMm: 200,
          profundidadeMm: 400,
          alturaMm: 2800,
        },
      ]),
    ).toThrow(/Nível inexistente|nível inexistente/i);
  });
});

describe('estrutural · 2. efeito geométrico (volume e fôrma)', () => {
  it('pilar retangular 20×40, pé-direito 2,80 — conta feita à mão', () => {
    const base = comNivel();
    const { model } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: nivelDe(base),
        kind: 'PILAR',
        pontos: [{ x: 1000, y: 1000 }],
        larguraMm: 200,
        profundidadeMm: 400,
        alturaMm: 2800,
      },
    ]);

    const m = medirEstrutura(model.structures[0]);
    // 0,20 × 0,40 × 2,80 = 0,224 m³
    expect(m.volumeMm3 / MM3).toBeCloseTo(0.224, 6);
    // Perímetro 2×(0,20+0,40) = 1,20 m; × 2,80 = 3,36 m²
    expect(m.areaFormaMm2 / MM2).toBeCloseTo(3.36, 6);
  });

  it('estaca ⌀30 de 8 m usa π, não o quadrado envolvente', () => {
    const base = comNivel();
    const { model } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: nivelDe(base),
        kind: 'ESTACA',
        pontos: [{ x: 0, y: 0 }],
        larguraMm: 300,
        alturaMm: 8000,
        baseMm: -9100,
        circular: true,
      },
    ]);

    const m = medirEstrutura(model.structures[0]);
    // π × 0,15² × 8 = 0,5655 m³
    expect(m.volumeMm3 / MM3).toBeCloseTo(Math.PI * 0.15 * 0.15 * 8, 6);
    // O quadrado envolvente daria 0,30² × 8 = 0,72 m³ — 27% a mais. Este caso
    // existe para pegar exatamente essa troca.
    expect(m.volumeMm3 / MM3).toBeLessThan(0.72);
    expect(m.areaFormaMm2 / MM2).toBeCloseTo(Math.PI * 0.3 * 8, 6);
  });

  it('viga 15×50 de 4 m: volume pelo eixo, fôrma em duas laterais e o fundo', () => {
    const base = comNivel();
    const { model } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: nivelDe(base),
        kind: 'VIGA',
        pontos: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
        ],
        larguraMm: 150,
        alturaMm: 500,
        baseMm: 2300,
      },
    ]);

    const m = medirEstrutura(model.structures[0]);
    expect(m.comprimentoMm).toBeCloseTo(4000, 6);
    // 4 × 0,15 × 0,50 = 0,30 m³
    expect(m.volumeMm3 / MM3).toBeCloseTo(0.3, 6);
    // (2 × 0,50 + 0,15) × 4 = 4,60 m²
    expect(m.areaFormaMm2 / MM2).toBeCloseTo(4.6, 6);
  });

  it('laje 4×3 com 12 cm: área do anel × espessura, fôrma = o fundo', () => {
    const base = comNivel();
    const { model } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: nivelDe(base),
        kind: 'LAJE',
        pontos: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 4000, y: 3000 },
          { x: 0, y: 3000 },
        ],
        alturaMm: 120,
        baseMm: 2800,
      },
    ]);

    const m = medirEstrutura(model.structures[0]);
    expect(m.areaPlantaMm2 / MM2).toBeCloseTo(12, 6);
    // 12 × 0,12 = 1,44 m³
    expect(m.volumeMm3 / MM3).toBeCloseTo(1.44, 6);
    expect(m.areaFormaMm2 / MM2).toBeCloseTo(12, 6);
  });
});

describe('estrutural · 3. efeito de REGRA: o ambiente segue INTEIRO', () => {
  it('um pilar no meio da sala não PARTE o ambiente — mas desconta o piso', () => {
    // ⚠️ Este caso mudou em 31/08/2026. Ele afirmava que o pilar não mexia em
    // NADA, inclusive na área de piso. A primeira metade continua valendo e é o
    // que mais importa — o ambiente não se fragmenta, porque a estrutura não
    // entra no arranjo planar. A segunda metade virou o oposto: o pilar passou
    // a descontar piso, no QUANTITATIVO, que é onde o desconto cabe.
    const semEstrutura = comAmbiente();
    expect(semEstrutura.spaces).toHaveLength(1);
    const areaAntes = semEstrutura.spaces[0].areaMm2;
    const perimetroAntes = semEstrutura.spaces[0].perimeterMm;

    const { model: comEstrutura } = applyBatch(semEstrutura, [
      {
        type: 'AddStructural',
        levelId: nivelDe(semEstrutura),
        kind: 'PILAR',
        // Bem no miolo: se a estrutura entrasse no arranjo planar, é aqui que
        // o ambiente se partiria em quatro.
        pontos: [{ x: 2000, y: 1500 }],
        larguraMm: 400,
        profundidadeMm: 400,
        alturaMm: 2800,
      },
    ]);

    // A TOPOLOGIA é intocada: um ambiente só, mesma área de eixo, mesmo perímetro.
    expect(comEstrutura.spaces).toHaveLength(1);
    expect(comEstrutura.spaces[0].areaMm2).toBe(areaAntes);
    expect(comEstrutura.spaces[0].perimeterMm).toBe(perimetroAntes);

    const qA = computeQuantities(semEstrutura);
    const qB = computeQuantities(comEstrutura);

    // O PISO diminui exatamente a seção do pilar: 0,40 × 0,40 = 0,16 m².
    expect(qA.totais.areaPisoM2 - qB.totais.areaPisoM2).toBeCloseTo(0.16, 6);
    expect(qB.ambientes[0].areaEstruturaM2).toBeCloseTo(0.16, 6);
    // E a conta fica auditável: a fórmula diz que houve desconto.
    expect(qB.ambientes[0].formulaAreaPiso).toMatch(/pilares/i);

    // RODAPÉ e PAREDE seguem intactos: um pilar no miolo não encosta em parede
    // nenhuma, então não interrompe rodapé nem muda área de revestimento.
    expect(qB.totais.comprimentoRodapeM).toBe(qA.totais.comprimentoRodapeM);
    expect(qB.totais.areaParedeDuasFacesM2).toBe(qA.totais.areaParedeDuasFacesM2);
  });
});

describe('estrutural · 3b. QUEM desconta piso, e quem não desconta', () => {
  /** Um pilar no miolo com a seção pedida; devolve o desconto em m². */
  function descontoDe(campos: Record<string, unknown>): number {
    const base = comAmbiente();
    const { model } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: nivelDe(base),
        kind: 'PILAR',
        pontos: [{ x: 2000, y: 1500 }],
        larguraMm: 400,
        profundidadeMm: 400,
        alturaMm: 2800,
        ...campos,
      } as Command,
    ]);
    return computeQuantities(model).ambientes[0].areaEstruturaM2;
  }

  it('PILAR que atravessa o piso desconta', () => {
    expect(descontoDe({})).toBeCloseTo(0.16, 6);
  });

  it('a LAJE não desconta NADA — ela É o piso, não uma ilha nele', () => {
    // O caso que zeraria o ambiente: uma laje na cota 0 atravessa o plano do
    // piso e, sem a trava de forma, descontaria a própria área inteira.
    const base = comAmbiente();
    const { model } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: nivelDe(base),
        kind: 'LAJE',
        pontos: [
          { x: 500, y: 500 },
          { x: 3500, y: 500 },
          { x: 3500, y: 2500 },
          { x: 500, y: 2500 },
        ],
        alturaMm: 120,
        baseMm: 0,
      } as Command,
    ]);
    const q = computeQuantities(model);
    expect(q.ambientes[0].areaEstruturaM2).toBe(0);
    expect(q.ambientes[0].areaPisoM2).toBeGreaterThan(10);
  });

  it('a VIGA não desconta — é horizontal e passa por cima', () => {
    const base = comAmbiente();
    const { model } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: nivelDe(base),
        kind: 'VIGA',
        pontos: [
          { x: 500, y: 1500 },
          { x: 3500, y: 1500 },
        ],
        larguraMm: 150,
        alturaMm: 500,
        baseMm: 2300,
      } as Command,
    ]);
    expect(computeQuantities(model).ambientes[0].areaEstruturaM2).toBe(0);
  });

  it('ESTACA e BLOCO enterrados não descontam — não emergem no piso', () => {
    expect(descontoDe({ kind: 'ESTACA', circular: true, baseMm: -9100, alturaMm: 8000 })).toBe(0);
    expect(descontoDe({ kind: 'BLOCO_COROAMENTO', baseMm: -1100, alturaMm: 600 })).toBe(0);
  });

  it('bloco cujo topo chega EXATAMENTE ao piso não desconta', () => {
    // Ele encosta por baixo, não emerge. A condição é `topo > 0`, estrita.
    expect(descontoDe({ kind: 'BLOCO_COROAMENTO', baseMm: -600, alturaMm: 600 })).toBe(0);
  });

  it('A ARMADILHA: pilar EMBUTIDO na parede não desconta duas vezes', () => {
    // A área da faixa de parede JÁ está fora do piso — a área de piso sai do
    // contorno recuado em meia espessura. Descontar o pilar embutido de novo
    // faria comprar piso a MENOS, e faltar material no assentamento.
    //
    // O pilar aqui está centrado no eixo da parede de baixo (y = 0), então tem
    // cantos dos dois lados dela: os de fora reprovam o teste de contenção.
    const base = comAmbiente();
    const { model } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: nivelDe(base),
        kind: 'PILAR',
        pontos: [{ x: 2000, y: 0 }],
        larguraMm: 400,
        profundidadeMm: 400,
        alturaMm: 2800,
      } as Command,
    ]);
    expect(computeQuantities(model).ambientes[0].areaEstruturaM2).toBe(0);
  });

  it('pilar de outro PAVIMENTO não desconta o piso deste', () => {
    const base = comAmbiente();
    const comSuperior = applyBatch(base, [
      { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 },
    ]).model;
    const { model } = applyBatch(comSuperior, [
      {
        type: 'AddStructural',
        levelId: comSuperior.levels[1].id,
        kind: 'PILAR',
        pontos: [{ x: 2000, y: 1500 }],
        larguraMm: 400,
        profundidadeMm: 400,
        alturaMm: 2800,
      } as Command,
    ]);
    expect(computeQuantities(model).ambientes[0].areaEstruturaM2).toBe(0);
  });

  it('pilar REDONDO desconta pela área do círculo, não do quadrado', () => {
    // ⌀400 → π × 0,20² = 0,1257 m². O quadrado daria 0,16 — 27% a mais.
    const d = descontoDe({ circular: true, larguraMm: 400 });
    expect(d).toBeCloseTo(Math.PI * 0.2 * 0.2, 6);
    expect(d).toBeLessThan(0.16);
  });
});

describe('estrutural · 4. conta separado nos totais', () => {
  it('cada família soma no seu próprio total, e a fundação junta as três', () => {
    const base = comNivel();
    const levelId = nivelDe(base);
    const { model } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId,
        kind: 'PILAR',
        pontos: [{ x: 0, y: 0 }],
        larguraMm: 200,
        profundidadeMm: 400,
        alturaMm: 2800,
      },
      {
        type: 'AddStructural',
        levelId,
        kind: 'VIGA',
        pontos: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
        ],
        larguraMm: 150,
        alturaMm: 500,
      },
      {
        type: 'AddStructural',
        levelId,
        kind: 'ESTACA',
        pontos: [{ x: 0, y: 0 }],
        larguraMm: 300,
        alturaMm: 8000,
        baseMm: -9100,
        circular: true,
      },
      {
        type: 'AddStructural',
        levelId,
        kind: 'BLOCO_COROAMENTO',
        pontos: [{ x: 0, y: 0 }],
        larguraMm: 800,
        profundidadeMm: 800,
        alturaMm: 600,
        baseMm: -1100,
      },
    ]);

    const t = computeQuantities(model).totais;
    expect(t.volumeConcretoPilarM3).toBeCloseTo(0.224, 6);
    expect(t.volumeConcretoVigaM3).toBeCloseTo(0.3, 6);
    expect(t.volumeConcretoLajeM3).toBe(0);
    // Estaca (π×0,15²×8) + bloco (0,8×0,8×0,6) = 0,5655 + 0,384
    expect(t.volumeConcretoFundacaoM3).toBeCloseTo(Math.PI * 0.0225 * 8 + 0.384, 6);
    expect(t.pilares).toBe(1);
    expect(t.estacas).toBe(1);
    expect(t.blocosCoroamento).toBe(1);
    expect(t.comprimentoEstacasM).toBeCloseTo(8, 6);
    expect(t.comprimentoVigasM).toBeCloseTo(4, 6);

    // ⚠️ O pilar NÃO entra no volume de alvenaria. Somar concreto com bloco
    // cerâmico é o erro que o grupo separado existe para não cometer.
    expect(t.volumeAlvenariaM3).toBe(0);
  });
});

describe('estrutural · 5. sobrevive ao round-trip do payload', () => {
  it('modelo → payload → modelo devolve o MESMO hash', () => {
    const base = comAmbiente();
    const levelId = nivelDe(base);
    const { model } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId,
        kind: 'PILAR',
        pontos: [{ x: 1000, y: 1000 }],
        larguraMm: 200,
        profundidadeMm: 400,
        alturaMm: 2800,
        rotacaoDeg: 30,
        rotulo: 'P1',
      },
      {
        type: 'AddStructural',
        levelId,
        kind: 'LAJE',
        pontos: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 4000, y: 3000 },
          { x: 0, y: 3000 },
        ],
        alturaMm: 120,
        baseMm: 2800,
      },
    ]);

    const payload = canonicalPayload(model);
    const devolta = modelFromCanonicalPayload(parseCanonicalPayload(payload));

    expect(snapshotHash(devolta)).toBe(snapshotHash(model));
    expect(devolta.structures).toHaveLength(2);
    expect(devolta.structures.find((s) => s.kind === 'PILAR')?.rotulo).toBe('P1');
    expect(devolta.structures.find((s) => s.kind === 'PILAR')?.rotacaoDeg).toBe(30);
    // `level` viaja por ÍNDICE — o id `str_` é reatribuído na volta, e é por
    // isso que os atributos têm de morar DENTRO do payload.
    expect(devolta.structures.every((s) => s.levelId === devolta.levels[0].id)).toBe(true);
  });

  it('a ORDEM de criação não muda o payload — ordem canônica é geométrica', () => {
    const levelId = (m: BlueprintModel) => m.levels[0].id;
    const pilar = (x: number): Command => ({
      type: 'AddStructural',
      levelId: 'PLACEHOLDER',
      kind: 'PILAR',
      pontos: [{ x, y: 0 }],
      larguraMm: 200,
      profundidadeMm: 400,
      alturaMm: 2800,
    });

    const a = comNivel();
    const b = comNivel();
    const r1 = applyBatch(a, [
      { ...pilar(0), levelId: levelId(a) },
      { ...pilar(3000), levelId: levelId(a) },
    ] as Command[]);
    const r2 = applyBatch(b, [
      { ...pilar(3000), levelId: levelId(b) },
      { ...pilar(0), levelId: levelId(b) },
    ] as Command[]);

    expect(canonicalPayload(r2.model)).toBe(canonicalPayload(r1.model));
  });
});

describe('estrutural · 6. A GUARDA: planta sem estrutura não muda de forma', () => {
  it('a chave `structures` NÃO existe no payload de um desenho sem peça nenhuma', () => {
    const semEstrutura = comAmbiente();
    const payload = JSON.parse(canonicalPayload(semEstrutura));

    // A asserção é sobre as CHAVES, não sobre o valor: `structures: []` também
    // passaria num teste de "está vazio", e é justamente `[]` que mudaria a
    // forma canônica de todo desenho do acervo.
    expect(Object.keys(payload)).not.toContain('structures');
    expect(Object.keys(payload).sort()).toEqual(
      ['boundaries', 'kernel', 'labels', 'levels', 'openings', 'spaces', 'toleranceMm', 'walls'].sort(),
    );
  });

  it('payload SEM a chave volta a ler como lista vazia, não como erro', () => {
    const semEstrutura = comAmbiente();
    const payload = canonicalPayload(semEstrutura);
    const devolta = modelFromCanonicalPayload(parseCanonicalPayload(payload));

    expect(devolta.structures).toEqual([]);
    expect(snapshotHash(devolta)).toBe(snapshotHash(semEstrutura));
  });
});

describe('estrutural · 7. o rótulo é fonte única', () => {
  it('nomeDoTipoEstrutural cobre os seis, sem repetir nome', () => {
    const nomes = (Object.keys(FORMA_ESTRUTURAL) as StructuralKind[]).map(nomeDoTipoEstrutural);
    expect(nomes).toHaveLength(6);
    expect(new Set(nomes).size).toBe(6);
    expect(nomeDoTipoEstrutural('BLOCO_COROAMENTO')).toBe('Bloco de coroamento');
    expect(nomeDoTipoEstrutural('VIGA_FUNDACAO')).toBe('Viga de fundação');
  });

  it('FORMA_ESTRUTURAL declara os seis — um tipo novo sem forma é erro de tipo', () => {
    expect(FORMA_ESTRUTURAL.PILAR).toBe('PONTO');
    expect(FORMA_ESTRUTURAL.ESTACA).toBe('PONTO');
    expect(FORMA_ESTRUTURAL.BLOCO_COROAMENTO).toBe('PONTO');
    expect(FORMA_ESTRUTURAL.VIGA).toBe('LINHA');
    expect(FORMA_ESTRUTURAL.VIGA_FUNDACAO).toBe('LINHA');
    expect(FORMA_ESTRUTURAL.LAJE).toBe('AREA');
  });
});

// ── Comandos ────────────────────────────────────────────────────────────────

describe('estrutural · comandos', () => {
  function comPilar() {
    const base = comNivel();
    return applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: nivelDe(base),
        kind: 'PILAR',
        pontos: [{ x: 1000, y: 1000 }],
        larguraMm: 200,
        profundidadeMm: 400,
        alturaMm: 2800,
        rotulo: 'P1',
      },
    ]).model;
  }

  it('SetStructuralProps muda uma medida e deixa o resto como estava', () => {
    const antes = comPilar();
    const { model } = applyBatch(antes, [
      { type: 'SetStructuralProps', structuralId: 'str_0001', larguraMm: 250 },
    ]);
    const s = model.structures[0];
    expect(s.larguraMm).toBe(250);
    expect(s.profundidadeMm).toBe(400);
    expect(s.alturaMm).toBe(2800);
    expect(s.rotulo).toBe('P1');
  });

  it('SetStructuralProps normaliza o giro para [0, 360)', () => {
    const antes = comPilar();
    const { model } = applyBatch(antes, [
      { type: 'SetStructuralProps', structuralId: 'str_0001', rotacaoDeg: 450 },
    ]);
    // Sem a normalização, girar dez vezes guardaria 3600 no payload e duas peças
    // visualmente idênticas teriam hashes diferentes.
    expect(model.structures[0].rotacaoDeg).toBe(90);

    const { model: negativo } = applyBatch(antes, [
      { type: 'SetStructuralProps', structuralId: 'str_0001', rotacaoDeg: -90 },
    ]);
    expect(negativo.structures[0].rotacaoDeg).toBe(270);
  });

  it('rótulo em branco vira null, não string vazia', () => {
    const antes = comPilar();
    const { model } = applyBatch(antes, [
      { type: 'SetStructuralProps', structuralId: 'str_0001', rotulo: '   ' },
    ]);
    expect(model.structures[0].rotulo).toBeNull();
  });

  it('SetStructuralKind troca DENTRO da forma e RECUSA fora dela', () => {
    const antes = comPilar();

    // Pilar → estaca: as duas são PONTO, e a seção/cota já ajustadas ficam.
    const { model } = applyBatch(antes, [
      { type: 'SetStructuralKind', structuralId: 'str_0001', kind: 'ESTACA' },
    ]);
    expect(model.structures[0].kind).toBe('ESTACA');
    expect(model.structures[0].larguraMm).toBe(200);
    expect(model.structures[0].rotulo).toBe('P1');

    // Pilar → viga: um centro não é um eixo. Recusar é melhor do que inventar
    // geometria que ninguém desenhou.
    expect(() =>
      applyBatch(antes, [{ type: 'SetStructuralKind', structuralId: 'str_0001', kind: 'VIGA' }]),
    ).toThrow(/formas geométricas são diferentes/i);
  });

  it('MoveStructuralVertex move um vértice; colapsar a viga é recusado', () => {
    const base = comNivel();
    const { model: comViga } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: nivelDe(base),
        kind: 'VIGA',
        pontos: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
        ],
        larguraMm: 150,
        alturaMm: 500,
      },
    ]);

    const { model } = applyBatch(comViga, [
      { type: 'MoveStructuralVertex', structuralId: 'str_0001', index: 1, to: { x: 5000, y: 0 } },
    ]);
    expect(model.structures[0].pontos[1]).toEqual({ x: 5000, y: 0 });

    expect(() =>
      applyBatch(comViga, [
        { type: 'MoveStructuralVertex', structuralId: 'str_0001', index: 1, to: { x: 0, y: 0 } },
      ]),
    ).toThrow(/colapsaria/i);
  });

  it('DeleteStructural tira só a peça pedida', () => {
    const antes = comPilar();
    const { model, diff } = applyBatch(antes, [
      { type: 'DeleteStructural', structuralId: 'str_0001' },
    ]);
    expect(model.structures).toHaveLength(0);
    expect(diff.deleted).toContain('str_0001');
  });

  it('TranslateEntities leva a estrutura junto, rígida', () => {
    const base = comAmbiente();
    const { model: comPeca } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: nivelDe(base),
        kind: 'VIGA',
        pontos: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
        ],
        larguraMm: 150,
        alturaMm: 500,
      },
    ]);

    const { model } = applyBatch(comPeca, [
      {
        type: 'TranslateEntities',
        wallIds: [],
        boundaryIds: [],
        structuralIds: ['str_0001'],
        delta: { x: 1000, y: 500 },
        manterJuncoes: false,
      },
    ]);

    // Rígida: as duas pontas andaram o MESMO delta, e o comprimento não mudou.
    expect(model.structures[0].pontos).toEqual([
      { x: 1000, y: 500 },
      { x: 5000, y: 500 },
    ]);
  });

  it('DuplicateEntities copia a estrutura deslocada', () => {
    const base = comAmbiente();
    const { model: comPeca } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: nivelDe(base),
        kind: 'PILAR',
        pontos: [{ x: 0, y: 0 }],
        larguraMm: 200,
        profundidadeMm: 400,
        alturaMm: 2800,
        rotulo: 'P1',
      },
    ]);

    const { model } = applyBatch(comPeca, [
      {
        type: 'DuplicateEntities',
        levelId: nivelDe(comPeca),
        wallIds: [],
        boundaryIds: [],
        structuralIds: ['str_0001'],
        openings: [],
        delta: { x: 3000, y: 0 },
      },
    ]);

    expect(model.structures).toHaveLength(2);
    expect(model.structures[1].pontos[0]).toEqual({ x: 3000, y: 0 });
    expect(model.structures[1].larguraMm).toBe(200);
  });

  it('RemoveLevel apaga em cascata; DuplicateLevel copia', () => {
    const base = applyBatch(comNivel(), [
      { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 },
    ]).model;

    const { model: comPeca } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: base.levels[0].id,
        kind: 'PILAR',
        pontos: [{ x: 0, y: 0 }],
        larguraMm: 200,
        profundidadeMm: 400,
        alturaMm: 2800,
      },
    ]);

    const { model: duplicado } = applyBatch(comPeca, [
      {
        type: 'DuplicateLevel',
        levelId: base.levels[0].id,
        novoNome: 'Cópia',
        elevationMm: 5600,
      },
    ]);
    expect(duplicado.structures).toHaveLength(2);

    const { model: removido, diff } = applyBatch(comPeca, [
      { type: 'RemoveLevel', levelId: base.levels[0].id },
    ]);
    expect(removido.structures).toHaveLength(0);
    expect(diff.deleted).toContain('str_0001');
  });
});

describe('estrutural · cloneModel copia os pontos em profundidade', () => {
  it('mexer no clone não reescreve o original', () => {
    const base = comNivel();
    const { model } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: nivelDe(base),
        kind: 'PILAR',
        pontos: [{ x: 1000, y: 1000 }],
        larguraMm: 200,
        profundidadeMm: 400,
        alturaMm: 2800,
      },
    ]);

    const copia = cloneModel(model);
    copia.structures[0].pontos[0].x = 9999;

    // Um `...s` cru deixaria o array compartilhado, e mover um vértice
    // reescreveria o estado que o desfazer guardou — perda silenciosa.
    expect(model.structures[0].pontos[0].x).toBe(1000);
  });
});

/**
 * ─── PONTOS DE CONEXÃO (31/08/2026) ─────────────────────────────────────────
 *
 * Pedido do usuário, com print de uma viga selecionada: *"os pontos de conexão
 * para os componentes estruturais são apenas no eixo. deve ser também nos
 * cantos"*. O que este bloco fixa é o CONTRATO — quais pontos cada forma
 * oferece. Que o ímã de fato pegue neles é pergunta de pixel, e vive no harness
 * `docs/spikes/encaixe-estrutural/`.
 */
describe('estrutural · pontos de conexão', () => {
  it('a VIGA oferece as duas pontas do eixo e os quatro cantos do corpo', () => {
    const base = comNivel();
    const { model } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: nivelDe(base),
        kind: 'VIGA',
        pontos: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
        ],
        larguraMm: 200,
        profundidadeMm: 0,
        alturaMm: 500,
      },
    ]);

    const { eixo, cantos } = pontosDeConexaoEstrutural(model.structures[0]);
    expect(eixo).toEqual([
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
    ]);
    // Os cantos são os do CORPO — meia largura de cada lado do eixo. É a mesma
    // figura que o desenho mostra, que é o ponto do pedido: encaixar onde se vê.
    expect(cantos).toHaveLength(4);
    expect(new Set(cantos.map((p) => p.y))).toEqual(new Set([-100, 100]));
    expect(new Set(cantos.map((p) => p.x))).toEqual(new Set([0, 4000]));
  });

  it('o PILAR retangular oferece o centro e os quatro cantos da seção', () => {
    const base = comNivel();
    const { model } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: nivelDe(base),
        kind: 'PILAR',
        pontos: [{ x: 1000, y: 1000 }],
        larguraMm: 200,
        profundidadeMm: 400,
        alturaMm: 2800,
      },
    ]);

    const { eixo, cantos } = pontosDeConexaoEstrutural(model.structures[0]);
    expect(eixo).toEqual([{ x: 1000, y: 1000 }]);
    expect(cantos).toEqual([
      { x: 900, y: 800 },
      { x: 1100, y: 800 },
      { x: 1100, y: 1200 },
      { x: 900, y: 1200 },
    ]);
  });

  it('a peça CIRCULAR não oferece canto nenhum', () => {
    const base = comNivel();
    const { model } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: nivelDe(base),
        kind: 'ESTACA',
        pontos: [{ x: 0, y: 0 }],
        larguraMm: 300,
        profundidadeMm: 300,
        alturaMm: 8000,
        circular: true,
      },
    ]);

    const { eixo, cantos } = pontosDeConexaoEstrutural(model.structures[0]);
    expect(eixo).toEqual([{ x: 0, y: 0 }]);
    // O vértice do quadrado envolvente fica ~62 mm FORA do concreto de uma
    // estaca ⌀300 — encaixar ali conectaria a peça a um ponto onde não há peça.
    expect(cantos).toEqual([]);
  });

  it('a LAJE não repete: o contorno dela JÁ é o eixo', () => {
    const base = comNivel();
    const anel = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const { model } = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId: nivelDe(base),
        kind: 'LAJE',
        pontos: anel,
        larguraMm: 0,
        profundidadeMm: 0,
        alturaMm: 120,
      },
    ]);

    const { eixo, cantos } = pontosDeConexaoEstrutural(model.structures[0]);
    expect(eixo).toEqual(anel);
    // Oferecido duas vezes, o mesmo ponto disputaria as duas urnas do ímã e o
    // `preferirCanto` deixaria de significar coisa alguma nesta forma.
    expect(cantos).toEqual([]);
  });
});
