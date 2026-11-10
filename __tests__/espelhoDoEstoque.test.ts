/**
 * ESPELHO DE VENDAS 3D NO ESTOQUE DO CORRETOR (F3, 09/11/2026): do estoque que o corretor vê (imóveis + negócios)
 * para a cena. A estrutura do Empreendimento quando o prédio a tem; senão, o próprio estoque (bloco e andar do
 * imóvel). O status é o do espelho 2D ao lado. Puro. Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import { describe, expect, it } from 'vitest';
import { montarEspelhoDoEstoque, statusDoEspelhoDoCorretor, PALETA_DO_CORRETOR, type ImovelDoEstoque, type TorreDaEstrutura } from '../utils/espelhoDoEstoque';
import { saleUnitClassifier } from '../lib/salesAnalysis';
import { negocioAtivoDaUnidade, statusEfetivoDaUnidade } from '../utils/statusEfetivoDaUnidade';

const imovel = (id: string, floor: number | undefined, extra: Partial<ImovelDoEstoque> = {}): ImovelDoEstoque => ({
  id,
  name: `Apto ${id}`,
  number: id,
  type: 'APARTMENT',
  parent_id: 'predio',
  status: 'AVAILABLE' as never,
  block: 'A',
  floor,
  private_area: 80,
  ...extra,
});

/** Bloco A: 2 andares × 2 unidades; 101 vendida no cadastro. */
const ESTOQUE = [imovel('101', 1, { status: 'SOLD' as never }), imovel('102', 1), imovel('201', 2), imovel('202', 2, { price: 500_000, current_price: 520_000, typology: '2 quartos', bedrooms: 2, images: ['https://x/capa.jpg'] })];

const unidadeDaTorre = (id: string, name: string, floor: number, property_id: string | null) => ({
  id, name, floor, floor_tipo: null, private_area: 80, position_type: null, sun_orientation: null, sort_order: 0, vaga_na_planta: null, property_id,
});
const ESTRUTURA: TorreDaEstrutura[] = [
  {
    id: 'tw1', name: 'Torre Sol', commercial_building_id: 'predio', sort_order: 0, pe_direito_padrao_m: 2.9, elevacao_terreo_m: null,
    ordem_das_unidades_na_planta: 'POSICAO', floors_count: 3, units_per_floor: 2, blueprint_quadra_uid: null, distancias_entre_torres: null, floors: [],
    units: [
      unidadeDaTorre('u101', '101', 1, '101'),
      unidadeDaTorre('u102', '102', 1, '102'),
      unidadeDaTorre('u201', '201', 2, '201'),
      unidadeDaTorre('u202', '202', 2, null), // não liberada a este corretor
    ],
  },
];

describe('statusDoEspelhoDoCorretor', () => {
  it('traduz o status efetivo do 2D para as cinco categorias', () => {
    expect(['AVAILABLE', 'RESERVED', 'SOLD', 'EXCHANGED', 'MAINTENANCE', 'RENTED', 'STUDY', null].map(statusDoEspelhoDoCorretor)).toEqual([
      'available', 'reserved', 'sold', 'exchanged', 'other', 'other', 'other', 'other',
    ]);
  });

  it('"vendida" é vermelha, como no espelho 2D ao lado', () => {
    expect(PALETA_DO_CORRETOR.sold).toMatchObject({ cor: '#dc2626', rotulo: 'Vendida' });
  });

  // A matriz que prende as três regras de status (2D do corretor, Análise de Vendas, e o SQL do investidor na F4):
  // onde elas concordam, e a ÚNICA divergência conhecida.
  const caso = (cadastro: string, negocio?: { status: string }) => {
    const deals = negocio ? [{ id: 'd', property_id: 'x', status: negocio.status }] : [];
    return {
      corretor: statusDoEspelhoDoCorretor(statusEfetivoDaUnidade(cadastro, negocioAtivoDaUnidade('x', deals))),
      analise: saleUnitClassifier(deals).statusOf({ id: 'x', status: cadastro }),
    };
  };

  it('sem negócio, o cadastro manda nas duas regras', () => {
    for (const [cadastro, esperado] of [['AVAILABLE', 'available'], ['RESERVED', 'reserved'], ['SOLD', 'sold'], ['EXCHANGED', 'exchanged']] as const) {
      expect(caso(cadastro)).toEqual({ corretor: esperado, analise: esperado });
    }
  });

  it('negócio concluído = vendida nas duas', () => {
    expect(caso('AVAILABLE', { status: 'COMPLETED' })).toEqual({ corretor: 'sold', analise: 'sold' });
  });

  it('divergência conhecida: negócio "em negociação" bloqueia no portal do corretor e é reserva na Análise', () => {
    expect(caso('AVAILABLE', { status: 'IN_NEGOTIATION' })).toEqual({ corretor: 'other', analise: 'reserved' });
  });
});

describe('montarEspelhoDoEstoque — pelo estoque (prédio sem estrutura no Empreendimento)', () => {
  it('uma torre por bloco, um prisma por imóvel com andar, chaveado pelo id do imóvel', () => {
    const r = montarEspelhoDoEstoque({ imoveis: ESTOQUE, negocios: [] });
    expect(r.fonte).toBe('ESTOQUE');
    expect(r.cena.torres.map((t) => t.nome)).toEqual(['Torre A']);
    expect(r.cena.prismas.filter((p) => p.unitId).map((p) => [p.unitId, p.andar, p.status])).toEqual([
      ['101', 1, 'sold'], ['102', 1, 'available'], ['201', 2, 'available'], ['202', 2, 'available'],
    ]);
    expect(r.semPosicao).toBe(0);
  });

  it('a ficha sai do imóvel: preço corrente antes do de tabela, tipologia, capa', () => {
    const r = montarEspelhoDoEstoque({ imoveis: ESTOQUE, negocios: [] });
    expect(r.dados.get('202')).toMatchObject({ preco: 520_000, tipologia: '2 quartos', dormitorios: 2, areaPrivativaM2: 80, fotoUrl: 'https://x/capa.jpg' });
  });

  it('o negócio muda o status, como no 2D: proposta enviada reserva', () => {
    const r = montarEspelhoDoEstoque({ imoveis: ESTOQUE, negocios: [{ property_id: '102', status: 'PENDING' }] });
    expect(r.cena.prismas.find((p) => p.unitId === '102')!.status).toBe('reserved');
  });

  it('imóvel sem andar não entra na torre e é contado; o prédio (BUILDING) nunca é unidade', () => {
    const r = montarEspelhoDoEstoque({ imoveis: [...ESTOQUE, imovel('S/N', undefined), imovel('predio', undefined, { type: 'BUILDING', parent_id: undefined })], negocios: [] });
    expect(r.cena.prismas.filter((p) => p.unitId)).toHaveLength(4);
    expect(r.semPosicao).toBe(1);
  });

  it('o andar que só existe em `specs.floor` vale; dois blocos viram duas torres', () => {
    const r = montarEspelhoDoEstoque({ imoveis: [imovel('11', undefined, { specs: { floor: 1 } as never }), imovel('21', 1, { block: 'B' })], negocios: [] });
    expect(r.cena.torres.map((t) => t.nome)).toEqual(['Torre A', 'Torre B']);
    expect(r.cena.prismas.find((p) => p.unitId === '11')!.andar).toBe(1);
  });

  it('nenhum imóvel com andar (lotes, casas): cena vazia e todos contados', () => {
    const r = montarEspelhoDoEstoque({ imoveis: [imovel('L1', undefined), imovel('L2', undefined)], negocios: [] });
    expect(r.cena.prismas).toEqual([]);
    expect(r.semPosicao).toBe(2);
  });
});

describe('montarEspelhoDoEstoque — pela estrutura do Empreendimento', () => {
  it('usa as torres do Empreendimento, com o prisma chaveado pelo id do IMÓVEL e o status do estoque', () => {
    const r = montarEspelhoDoEstoque({ imoveis: ESTOQUE.slice(0, 3), negocios: [], estrutura: ESTRUTURA });
    expect(r.fonte).toBe('EMPREENDIMENTO');
    expect(r.cena.torres.map((t) => t.nome)).toEqual(['Torre Sol']);
    expect(r.cena.prismas.filter((p) => p.unitId).map((p) => [p.unitId, p.status])).toEqual([['101', 'sold'], ['102', 'available'], ['201', 'available']]);
    // O pé-direito é o do Empreendimento.
    expect(r.cena.prismas.find((p) => p.unitId === '201')).toMatchObject({ baseMm: 2900, topoMm: 5800 });
  });

  it('a unidade que o corretor não vê ocupa o lugar, neutra', () => {
    const r = montarEspelhoDoEstoque({ imoveis: ESTOQUE.slice(0, 3), negocios: [], estrutura: ESTRUTURA });
    const doAndar2 = r.cena.prismas.filter((p) => p.andar === 2);
    expect(doAndar2).toHaveLength(2);
    expect(doAndar2.filter((p) => !p.unitId)).toHaveLength(1);
  });

  it('imóvel do estoque sem unidade na torre é contado como sem posição', () => {
    const r = montarEspelhoDoEstoque({ imoveis: [...ESTOQUE.slice(0, 3), imovel('999', 9)], negocios: [], estrutura: ESTRUTURA });
    expect(r.semPosicao).toBe(1);
  });

  it('estrutura sem nenhuma unidade ligada ao que o corretor vê: cai no estoque', () => {
    const r = montarEspelhoDoEstoque({ imoveis: [imovel('777', 1)], negocios: [], estrutura: ESTRUTURA });
    expect(r.fonte).toBe('ESTOQUE');
    expect(r.cena.prismas.filter((p) => p.unitId).map((p) => p.unitId)).toEqual(['777']);
  });
});
