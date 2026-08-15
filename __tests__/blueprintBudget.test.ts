/**
 * RF-122 — de-para entre a geometria e o orçamento.
 *
 * O caso central aqui não é "gera linha". É **RECUSAR** de-para com unidade
 * incompatível: é o único erro desta camada que não se anuncia sozinho. Uma
 * linha gerada a partir de m² num item cotado por metro sai plausível, passa
 * pela revisão e só aparece na compra do material.
 *
 * Como em `blueprintQuantities.test.ts`, os valores esperados são calculados à
 * mão no comentário de cada caso, nunca copiados da saída.
 */

import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  computeQuantities,
  emptyModel,
  point,
  type Command,
  type Quantitativos,
} from '../utils/blueprintKernel';
import {
  MEDIDAS,
  aplicarNoOrcamento,
  dimensaoDaUnidade,
  gerarLancamentos,
  type MapeamentoOrcamento,
  type MapeamentoResolvido,
} from '../utils/blueprintBudget';
import type { BudgetEntry, SinapiItem } from '../types/budget';
import { SinapiType } from '../types/budget';

const H = 2800;
const T = 150;

const CTX = {
  studyId: 'estudo-1',
  studyName: 'Casa térrea',
  snapshotId: 'snap-1',
  snapshotHash: 'abcdef0123456789',
  revision: 3,
};

/** Sala 4 × 3 m, parede de 150 mm, sem abertura. */
function quantSala(nome = 'Sala'): Quantitativos {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  const levelId = r.model.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: T,
    heightMm: H,
  });

  const built = applyBatch(r.model, [
    w(0, 0, 4000, 0),
    w(4000, 0, 4000, 3000),
    w(4000, 3000, 0, 3000),
    w(0, 3000, 0, 0),
  ]).model;

  const comNome = applyCommand(built, {
    type: 'NameSpace',
    spaceId: built.spaces[0].id,
    name: nome,
  }).model;

  return computeQuantities(comNome);
}

function item(code: string, unit: string, price = 100): SinapiItem {
  return {
    code,
    description: `Item ${code}`,
    unit,
    price,
    type: SinapiType.COMPOSITION,
    category: 'Material',
  };
}

function mapa(over: Partial<MapeamentoOrcamento> = {}): MapeamentoOrcamento {
  return {
    id: 'm1',
    organization_id: 'org',
    medida: 'AREA_PISO',
    item_code: '87251',
    phase: 'Acabamento',
    budget_group: 'Revestimentos',
    agrupamento: 'TOTAL',
    filtro_ambiente: [],
    active: true,
    ...over,
  };
}

function resolvido(m: MapeamentoOrcamento, it: SinapiItem | null): MapeamentoResolvido[] {
  return [{ mapeamento: m, item: it }];
}

describe('de-para · a trava de unidade', () => {
  it('RECUSA área de piso apontada para item cotado por metro linear', () => {
    // É o erro que este módulo existe para impedir. A sala tem 10,97 m² de piso
    // e 14,00 m de perímetro; mandar a área para um item por metro geraria uma
    // linha com 10,97 "metros" de rodapé — 22% a menos, e nada denunciaria.
    const q = quantSala();
    const r = gerarLancamentos(q, resolvido(mapa(), item('87251', 'M')), CTX);

    expect(r.entries, 'nenhuma linha pode ser gerada').toHaveLength(0);
    expect(r.divergencias).toHaveLength(1);
    expect(r.divergencias[0].motivo).toContain('M2');
    expect(r.divergencias[0].motivo).toContain('plausível e errado');
  });

  it('aceita a mesma dimensão escrita de outro jeito', () => {
    // O SINAPI é irregular: 'M2', 'M²', 'm2'. Reprovar grafia correta empurraria
    // o usuário a desligar a trava — e trava desligada é pior que trava nenhuma,
    // porque dá a impressão de que alguém conferiu.
    for (const unidade of ['M2', 'M²', 'm2', 'M 2']) {
      const r = gerarLancamentos(quantSala(), resolvido(mapa(), item('87251', unidade)), CTX);
      expect(r.divergencias, `unidade "${unidade}" deveria passar`).toHaveLength(0);
      expect(r.entries).toHaveLength(1);
    }
  });

  it('unidade que ninguém reconhece também é recusada', () => {
    // 'VB' (verba) não tem dimensão. Deixar passar seria pior que reprovar: a
    // quantidade viraria multiplicador de um preço fechado.
    const r = gerarLancamentos(quantSala(), resolvido(mapa(), item('87251', 'VB')), CTX);
    expect(r.entries).toHaveLength(0);
    expect(r.divergencias[0].motivo).toContain('não reconhecida');
  });

  it('normaliza unidade de forma previsível', () => {
    expect(dimensaoDaUnidade('M2')).toBe('M2');
    expect(dimensaoDaUnidade('m³')).toBe('M3');
    expect(dimensaoDaUnidade('ML')).toBe('M');
    expect(dimensaoDaUnidade('UND')).toBe('UN');
    expect(dimensaoDaUnidade('VB')).toBeNull();
    expect(dimensaoDaUnidade(undefined)).toBeNull();
  });

  it('item ausente do catálogo vira divergência, não linha vazia', () => {
    const r = gerarLancamentos(quantSala(), resolvido(mapa(), null), CTX);
    expect(r.entries).toHaveLength(0);
    expect(r.divergencias[0].motivo).toContain('não encontrado');
  });

  it('medida que não existe no catálogo é recusada', () => {
    const r = gerarLancamentos(
      quantSala(),
      resolvido(mapa({ medida: 'AREA_TELHADO' }), item('87251', 'M2')),
      CTX,
    );
    expect(r.entries).toHaveLength(0);
    expect(r.divergencias[0].motivo).toContain('não existe');
  });

  it('toda medida do catálogo declara uma dimensão conhecida', () => {
    // Trava de coerência do próprio catálogo: medida sem dimensão passaria pela
    // verificação de unidade sem ser verificada.
    for (const m of MEDIDAS) {
      expect(['M2', 'M', 'M3', 'UN'], `medida ${m.id}`).toContain(m.dimensao);
    }
  });
});

describe('de-para · quantidade gerada', () => {
  it('a quantidade é a área de PISO, não a de eixo', () => {
    // Sala 4 × 3 com parede de 150 mm:
    //   eixo = 12,00 m²   piso = 3,85 × 2,85 = 10,9725 m²
    // Se a linha saísse com 12,00 estaria comprando 9,4% de piso a mais.
    const r = gerarLancamentos(quantSala(), resolvido(mapa(), item('87251', 'M2')), CTX);

    expect(r.entries[0].quantity).toBeCloseTo(10.9725, 3);
    expect(r.entries[0].quantity).not.toBeCloseTo(12, 2);
  });

  it('rodapé sai em metro, e o item por metro é aceito', () => {
    // Perímetro de eixo = 2 × (4 + 3) = 14,00 m, sem porta para descontar.
    const r = gerarLancamentos(
      quantSala(),
      resolvido(mapa({ medida: 'COMPRIMENTO_RODAPE' }), item('88489', 'M')),
      CTX,
    );
    expect(r.entries[0].quantity).toBeCloseTo(14, 2);
  });

  it('parede de duas faces é o dobro de uma face', () => {
    // Face líquida total = 14,00 m × 2,80 m = 39,20 m²; duas faces = 78,40 m².
    const q = quantSala();
    const uma = gerarLancamentos(
      q,
      resolvido(mapa({ medida: 'AREA_PAREDE_UMA_FACE' }), item('X', 'M2')),
      CTX,
    );
    const duas = gerarLancamentos(
      q,
      resolvido(mapa({ medida: 'AREA_PAREDE_DUAS_FACES' }), item('X', 'M2')),
      CTX,
    );

    expect(uma.entries[0].quantity).toBeCloseTo(39.2, 2);
    expect(duas.entries[0].quantity).toBeCloseTo(78.4, 2);
  });

  it('volume de alvenaria em m³ exige item em m³', () => {
    // 39,20 m² × 0,15 m = 5,88 m³.
    const q = quantSala();
    const ok = gerarLancamentos(
      q,
      resolvido(mapa({ medida: 'VOLUME_ALVENARIA' }), item('X', 'M3')),
      CTX,
    );
    expect(ok.entries[0].quantity).toBeCloseTo(5.88, 2);

    const errado = gerarLancamentos(
      q,
      resolvido(mapa({ medida: 'VOLUME_ALVENARIA' }), item('X', 'M2')),
      CTX,
    );
    expect(errado.entries).toHaveLength(0);
  });
});

describe('de-para · vão livre não é esquadria', () => {
  /** Sala 4 × 3 com uma abertura de 900 × 2100 na parede de baixo. */
  function salaCom(kind: 'door' | 'window' | 'passage'): Quantitativos {
    const r = applyCommand(emptyModel(), {
      type: 'AddLevel',
      name: 'Térreo',
      elevationMm: 0,
      defaultHeightMm: H,
    });
    const levelId = r.model.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({
      type: 'AddWall',
      levelId,
      a: point(ax, ay),
      b: point(bx, by),
      thicknessMm: T,
      heightMm: H,
    });
    const built = applyBatch(r.model, [
      w(0, 0, 4000, 0),
      w(4000, 0, 4000, 3000),
      w(4000, 3000, 0, 3000),
      w(0, 3000, 0, 0),
    ]).model;

    const comAbertura = applyCommand(built, {
      type: 'AddOpening',
      wallId: built.walls[0].id,
      kind,
      offsetMm: 1000,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    }).model;

    return computeQuantities(comAbertura);
  }

  it('ÁREA DE ESQUADRIAS ignora o vão livre — não há caixilho para comprar', () => {
    const comVao = gerarLancamentos(
      salaCom('passage'),
      resolvido(mapa({ medida: 'AREA_ESQUADRIAS' }), item('X', 'M2')),
      CTX,
    );
    expect(comVao.entries).toHaveLength(0);

    // A mesma abertura, agora como porta, entra normalmente: o que muda é o
    // TIPO, não a geometria.
    const comPorta = gerarLancamentos(
      salaCom('door'),
      resolvido(mapa({ medida: 'AREA_ESQUADRIAS' }), item('X', 'M2')),
      CTX,
    );
    expect(comPorta.entries).toHaveLength(1);
    expect(comPorta.entries[0].quantity).toBeCloseTo(0.9 * 2.1, 4);
  });

  it('não entra nem em contagem de portas nem na de janelas', () => {
    const q = salaCom('passage');
    for (const medida of ['CONTAGEM_PORTAS', 'CONTAGEM_JANELAS'] as const) {
      const r = gerarLancamentos(q, resolvido(mapa({ medida }), item('X', 'UN')), CTX);
      expect(r.entries, `${medida} contou um vão livre`).toHaveLength(0);
    }
  });

  it('mas DESCONTA área de parede, como qualquer buraco', () => {
    // Face líquida de uma face: 14,00 × 2,80 − (0,90 × 2,10) = 37,31 m².
    const r = gerarLancamentos(
      salaCom('passage'),
      resolvido(mapa({ medida: 'AREA_PAREDE_UMA_FACE' }), item('X', 'M2')),
      CTX,
    );
    expect(r.entries[0].quantity).toBeCloseTo(39.2 - 1.89, 2);
  });

  it('e INTERROMPE o rodapé, como porta', () => {
    // Perímetro de eixo 14,00 m menos os 0,90 m do vão.
    const r = gerarLancamentos(
      salaCom('passage'),
      resolvido(mapa({ medida: 'COMPRIMENTO_RODAPE' }), item('88489', 'M')),
      CTX,
    );
    expect(r.entries[0].quantity).toBeCloseTo(13.1, 2);
  });
});

describe('de-para · agrupamento e filtro', () => {
  function duasSalas(): Quantitativos {
    const r = applyCommand(emptyModel(), {
      type: 'AddLevel',
      name: 'Térreo',
      elevationMm: 0,
      defaultHeightMm: H,
    });
    const levelId = r.model.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({
      type: 'AddWall',
      levelId,
      a: point(ax, ay),
      b: point(bx, by),
      thicknessMm: T,
      heightMm: H,
    });

    let m = applyBatch(r.model, [
      w(0, 0, 6000, 0),
      w(6000, 0, 6000, 3000),
      w(6000, 3000, 0, 3000),
      w(0, 3000, 0, 0),
      w(3000, 0, 3000, 3000),
    ]).model;

    // Nomes escolhidos para exercitar o filtro por área molhada.
    m = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Banheiro' }).model;
    m = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[1].id, name: 'Quarto' }).model;
    return computeQuantities(m);
  }

  it('POR_ELEMENTO gera uma linha por ambiente, com o nome na localização', () => {
    // Perder qual ambiente é qual inviabiliza a medição depois — por isso
    // `location.room` viaja junto.
    const r = gerarLancamentos(
      duasSalas(),
      resolvido(mapa({ agrupamento: 'POR_ELEMENTO' }), item('87251', 'M2')),
      CTX,
    );

    expect(r.entries).toHaveLength(2);
    expect(r.entries.map((e) => e.location?.room).sort()).toEqual(['Banheiro', 'Quarto']);
  });

  it('TOTAL soma os ambientes numa linha só', () => {
    const q = duasSalas();
    const total = gerarLancamentos(q, resolvido(mapa(), item('87251', 'M2')), CTX);
    const porAmbiente = gerarLancamentos(
      q,
      resolvido(mapa({ agrupamento: 'POR_ELEMENTO' }), item('87251', 'M2')),
      CTX,
    );

    expect(total.entries).toHaveLength(1);
    expect(total.entries[0].quantity).toBeCloseTo(
      porAmbiente.entries.reduce((s, e) => s + e.quantity, 0),
      6,
    );
  });

  it('o filtro por ambiente existe porque revestimento é de área molhada', () => {
    // Sem filtro, azulejo de banheiro seria orçado para a casa inteira.
    const r = gerarLancamentos(
      duasSalas(),
      resolvido(
        mapa({ agrupamento: 'POR_ELEMENTO', filtro_ambiente: ['banh'] }),
        item('87251', 'M2'),
      ),
      CTX,
    );

    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].location?.room).toBe('Banheiro');
  });

  it('mapeamento desligado não gera nada e não vira divergência', () => {
    const r = gerarLancamentos(
      quantSala(),
      resolvido(mapa({ active: false }), item('87251', 'M')),
      CTX,
    );
    expect(r.entries).toHaveLength(0);
    expect(r.divergencias, 'desligado não é erro').toHaveLength(0);
  });
});

describe('de-para · procedência (RF-121 → §22.1)', () => {
  it('a linha carrega a fórmula, o resultado e a versão que a originou', () => {
    const r = gerarLancamentos(quantSala(), resolvido(mapa(), item('87251', 'M2')), CTX);
    const e = r.entries[0];

    expect(e.calculationMemory?.formula).toContain('A_eixo');
    expect(e.calculationMemory?.result).toBeCloseTo(10.9725, 3);
    expect(e.calculationMemory?.justification).toContain('versão 3');
    expect(e.calculationMemory?.justification).toContain('abcdef012345');
    expect(e.calculationMemory?.variables?.snapshot).toBe('snap-1');
  });
});

describe('de-para · reenviar não pode duplicar', () => {
  const manual: BudgetEntry = {
    id: 'digitado-a-mao',
    sinapiItem: item('99999', 'M2'),
    quantity: 5,
    phase: 'Fundação',
    group: 'Estrutura',
  };

  it('regerar substitui as linhas da mesma planta', () => {
    // Se empilhasse, o orçamento dobraria em silêncio a cada revisão publicada —
    // o pior desfecho possível para um módulo cujo propósito é dar confiança no
    // número.
    const q = quantSala();
    const primeira = gerarLancamentos(q, resolvido(mapa(), item('87251', 'M2')), CTX).entries;

    const passo1 = aplicarNoOrcamento([manual], primeira, CTX.studyId);
    expect(passo1.budget).toHaveLength(2);

    const segunda = gerarLancamentos(q, resolvido(mapa(), item('87251', 'M2')), CTX).entries;
    const passo2 = aplicarNoOrcamento(passo1.budget, segunda, CTX.studyId);

    expect(passo2.budget).toHaveLength(2);
    expect(passo2.removidas).toBe(1);
    expect(passo2.adicionadas).toBe(1);
  });

  it('linha digitada à mão nunca é tocada', () => {
    const q = quantSala();
    const geradas = gerarLancamentos(q, resolvido(mapa(), item('87251', 'M2')), CTX).entries;
    const { budget } = aplicarNoOrcamento([manual], geradas, CTX.studyId);

    expect(budget.find((e) => e.id === 'digitado-a-mao')).toEqual(manual);
  });

  it('duas plantas diferentes convivem no mesmo orçamento', () => {
    // O prefixo é por ESTUDO. Regerar a planta do térreo não pode limpar as
    // linhas da planta do pavimento tipo.
    const q = quantSala();
    const terreo = gerarLancamentos(q, resolvido(mapa(), item('87251', 'M2')), CTX).entries;
    const tipo = gerarLancamentos(
      q,
      resolvido(mapa(), item('87251', 'M2')),
      { ...CTX, studyId: 'estudo-2' },
    ).entries;

    const a = aplicarNoOrcamento([], terreo, CTX.studyId);
    const b = aplicarNoOrcamento(a.budget, tipo, 'estudo-2');
    expect(b.budget).toHaveLength(2);

    // Regerar só o térreo mantém o pavimento tipo.
    const c = aplicarNoOrcamento(b.budget, terreo, CTX.studyId);
    expect(c.budget).toHaveLength(2);
    expect(c.budget.some((e) => String(e.id).startsWith('bp:estudo-2:'))).toBe(true);
  });

  it('o id é determinístico — o mesmo de-para produz o mesmo id', () => {
    const q = quantSala();
    const a = gerarLancamentos(q, resolvido(mapa(), item('87251', 'M2')), CTX).entries;
    const b = gerarLancamentos(q, resolvido(mapa(), item('87251', 'M2')), CTX).entries;
    expect(b[0].id).toBe(a[0].id);
  });
});
