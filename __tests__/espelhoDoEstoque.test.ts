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

  // 10/11/2026, Garden Cambuhy em produção: todo imóvel com `number` = 1201 (o número do endereço) e a unidade no
  // nome — a lista e a ficha do 3D diziam "Unidade 1201" para as 34.
  it('o rótulo da unidade é o NOME do imóvel, como no 2D; o número só quando não há nome', () => {
    const r = montarEspelhoDoEstoque({ imoveis: [imovel('a', 1, { name: '101', number: '1201' }), imovel('b', 1, { name: '', number: '102' })], negocios: [] });
    expect(r.cena.prismas.filter((p) => p.unitId).map((p) => p.rotulo).sort()).toEqual(['101', '102']);
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

  it('torre com o contorno enviado pela Planta sai com a forma do desenho; sem ele, esquemática', () => {
    const anel = [{ x: 50000, y: 20000 }, { x: 61000, y: 20000 }, { x: 61000, y: 36000 }, { x: 50000, y: 36000 }];
    const comContorno = montarEspelhoDoEstoque({ imoveis: ESTOQUE.slice(0, 3), negocios: [], estrutura: [{ ...ESTRUTURA[0], contorno_na_planta: anel, contorno_frente: { x: 0, y: -1 }, contorno_norte_deg: 0 }] });
    expect(comContorno.cena.torres[0]).toMatchObject({ origem: 'PLANTA', caixa: { minX: 50000, minY: 20000, maxX: 61000, maxY: 36000 } });
    const sem = montarEspelhoDoEstoque({ imoveis: ESTOQUE.slice(0, 3), negocios: [], estrutura: ESTRUTURA });
    expect(sem.cena.torres[0].origem).toBe('ESQUEMATICA');
    // jsonb estragado não derruba: sai esquemática.
    const estragado = montarEspelhoDoEstoque({ imoveis: ESTOQUE.slice(0, 3), negocios: [], estrutura: [{ ...ESTRUTURA[0], contorno_na_planta: 'x' }] });
    expect(estragado.cena.torres[0].origem).toBe('ESQUEMATICA');
  });

  it('a unidade que o corretor não vê ocupa o lugar, neutra', () => {
    const r = montarEspelhoDoEstoque({ imoveis: ESTOQUE.slice(0, 3), negocios: [], estrutura: ESTRUTURA });
    const doAndar2 = r.cena.prismas.filter((p) => p.andar === 2);
    expect(doAndar2).toHaveLength(2);
    expect(doAndar2.filter((p) => !p.unitId)).toHaveLength(1);
  });

  it('imóvel do estoque sem unidade na torre (e sem andar) é contado como sem posição', () => {
    const r = montarEspelhoDoEstoque({ imoveis: [...ESTOQUE.slice(0, 3), imovel('999', undefined)], negocios: [], estrutura: ESTRUTURA });
    expect(r.fonte).toBe('EMPREENDIMENTO');
    expect(r.semPosicao).toBe(1);
  });

  // 10/11/2026, Garden Cambuhy em produção: 17 dos 41 imóveis ligados ao Empreendimento, todos os 41 com bloco e
  // andar. Com o Empreendimento, a Torre B saía neutra e 20 unidades sumiam do 3D ("Vendidas 0" com 4 no 2D).
  it('prédio ligado só em parte: vale a fonte que acha lugar para MAIS imóveis — aqui, o estoque', () => {
    const r = montarEspelhoDoEstoque({ imoveis: [...ESTOQUE.slice(0, 3), imovel('901', 9, { status: 'SOLD' as never })], negocios: [], estrutura: ESTRUTURA });
    expect(r.fonte).toBe('ESTOQUE');
    expect(r.semPosicao).toBe(0);
    expect(r.cena.prismas.find((p) => p.unitId === '901')!.status).toBe('sold');
    expect(r.cena.prismas.every((p) => !p.unitId || p.status)).toBe(true);
  });

  // 10/11/2026, Garden Cambuhy em produção: contorno das Torres A e B enviado pela Planta e gravado, mas o 3D do
  // corretor seguia esquemático — a fonte que valia era o estoque, e as torres dela (pelo bloco) não liam o contorno.
  it('fonte do estoque: a torre do bloco leva o contorno da torre de mesmo nome no Empreendimento', () => {
    const anel = [{ x: 2281, y: 6342 }, { x: 2281, y: 32342 }, { x: 15781, y: 32342 }, { x: 15781, y: 6342 }];
    const torreA = { ...ESTRUTURA[0], name: 'Torre A', contorno_na_planta: anel, contorno_frente: { x: 0, y: -1 }, contorno_norte_deg: null };
    const imoveis = [...ESTOQUE.slice(0, 3), imovel('901', 9), imovel('B11', 1, { block: 'B' })];
    const r = montarEspelhoDoEstoque({ imoveis, negocios: [], estrutura: [torreA] });
    expect(r.fonte).toBe('ESTOQUE');
    expect(r.cena.torres.map((t) => [t.nome, t.origem])).toEqual([['Torre A', 'PLANTA'], ['Torre B', 'ESQUEMATICA']]);
    // Misturada com uma esquemática, a torre é posta lado a lado — mas com a FORMA do desenho (13,5 m × 26 m).
    const c = r.cena.torres[0].caixa;
    expect([c.maxX - c.minX, c.maxY - c.minY]).toEqual([13500, 26000]);
    // As duas com contorno: ficam onde o desenho as pôs.
    const torreB = { ...torreA, id: 'tw2', name: 'Torre B', contorno_na_planta: anel.map((q) => ({ x: q.x, y: q.y + 26000 })) };
    const duas = montarEspelhoDoEstoque({ imoveis, negocios: [], estrutura: [torreA, torreB] });
    expect(duas.fonte).toBe('ESTOQUE');
    expect(duas.cena.torres.map((t) => t.origem)).toEqual(['PLANTA', 'PLANTA']);
    expect(duas.cena.torres[1].caixa).toMatchObject({ minX: 2281, minY: 32342, maxX: 15781, maxY: 58342 });
  });

  it('fonte do estoque: o nome casa sem "Torre"/"Bloco", acento ou caixa; dois candidatos = nenhum (esquemática)', () => {
    const anel = [{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 20000 }, { x: 0, y: 20000 }];
    const com = (name: string, id = 'tw1') => ({ ...ESTRUTURA[0], id, name, contorno_na_planta: anel });
    const imoveis = [...ESTOQUE.slice(0, 3), imovel('901', 9)];
    expect(montarEspelhoDoEstoque({ imoveis, negocios: [], estrutura: [com('BLOCO a')] }).cena.torres[0].origem).toBe('PLANTA');
    expect(montarEspelhoDoEstoque({ imoveis, negocios: [], estrutura: [com('Torre Sol')] }).cena.torres[0].origem).toBe('ESQUEMATICA');
    expect(montarEspelhoDoEstoque({ imoveis, negocios: [], estrutura: [com('Torre A'), com('Bloco A', 'tw2')] }).cena.torres[0].origem).toBe('ESQUEMATICA');
  });

  // F5 (10/11/2026): a planta é do empreendimento, por tipologia; a tipologia do corretor é a do IMÓVEL.
  it('a ficha leva a planta da tipologia do imóvel, nas duas fontes; sem tipologia ou sem planta, nada', () => {
    const plantas = [{ tipologia: '2 Quartos', tipologia_chave: '2 quartos', imagem_url: 'https://x/2q.png' }];
    const peloEmpreendimento = montarEspelhoDoEstoque({ imoveis: ESTOQUE, negocios: [], estrutura: ESTRUTURA, plantas });
    expect(peloEmpreendimento.dados.get('202')!.plantaUrl).toBe('https://x/2q.png');
    expect(peloEmpreendimento.dados.get('101')!.plantaUrl).toBeNull();
    const peloEstoque = montarEspelhoDoEstoque({ imoveis: ESTOQUE, negocios: [], plantas });
    expect(peloEstoque.fonte).toBe('ESTOQUE');
    expect(peloEstoque.dados.get('202')!.plantaUrl).toBe('https://x/2q.png');
    expect(montarEspelhoDoEstoque({ imoveis: ESTOQUE, negocios: [] }).dados.get('202')!.plantaUrl).toBeNull();
  });

  // F8 (10/11/2026): o decorado é do empreendimento, por tipologia — a do IMÓVEL, como a planta.
  it('a ficha leva o decorado da tipologia do imóvel; tipologia sem decorado = null; prédio sem decorado = ausente', () => {
    const decorado = [
      { tipologia: '2 Quartos', tipologia_chave: '2 quartos', papel: 'AMBIENTE' as const, legenda: 'Sala', ordem: 0, imagem_url: 'https://x/sala.jpg', origem: 'ENVIADA' as const },
      { tipologia: '2 Quartos', tipologia_chave: '2 quartos', papel: 'CORTE' as const, legenda: null, ordem: 0, imagem_url: 'https://x/corte.jpg', origem: 'ENVIADA' as const },
    ];
    const r = montarEspelhoDoEstoque({ imoveis: ESTOQUE, negocios: [], estrutura: ESTRUTURA, decorado });
    expect(r.dados.get('202')!.decorado!.imagens.map((i) => i.url)).toEqual(['https://x/corte.jpg', 'https://x/sala.jpg']);
    expect(r.dados.get('101')!.decorado).toBeNull();
    expect('decorado' in montarEspelhoDoEstoque({ imoveis: ESTOQUE, negocios: [] }).dados.get('202')!).toBe(false);
  });

  // F6 (10/11/2026): a vista da janela é da torre do Empreendimento, por faixa de andares.
  describe('vista da janela', () => {
    const vistas = [
      { andar_de: 1, andar_ate: 1, orientacao: null, imagem_url: 'https://x/baixo.jpg', legenda: 'Praça' },
      { andar_de: 2, andar_ate: 9, orientacao: 'NORTE' as const, imagem_url: 'https://x/norte.jpg', legenda: null },
    ];
    const comVistas: TorreDaEstrutura[] = [{ ...ESTRUTURA[0], vistas }];

    it('pela unidade ligada ao imóvel: a faixa do andar dela; fora de toda faixa (ou de outra face), null', () => {
      const r = montarEspelhoDoEstoque({ imoveis: ESTOQUE.slice(0, 3), negocios: [], estrutura: comVistas });
      expect(r.fonte).toBe('EMPREENDIMENTO');
      expect(r.dados.get('101')!.vista).toEqual({ url: 'https://x/baixo.jpg', legenda: 'Praça', cobre: '1º pavimento · qualquer face' });
      // 201 está no 2º andar, mas a unidade não tem orientação: a vista da face Norte não serve.
      expect(r.dados.get('201')!.vista).toBeNull();
    });

    it('a orientação da unidade do Empreendimento escolhe a vista da face', () => {
      const norte: TorreDaEstrutura[] = [{ ...comVistas[0], units: comVistas[0].units.map((u) => (u.id === 'u201' ? { ...u, sun_orientation: 'NORTE' as const } : u)) }];
      const r = montarEspelhoDoEstoque({ imoveis: ESTOQUE.slice(0, 3), negocios: [], estrutura: norte });
      expect(r.dados.get('201')!.vista?.url).toBe('https://x/norte.jpg');
    });

    it('fonte do estoque (Garden): o imóvel sem unidade ligada acha a torre pelo nome do bloco e usa o próprio andar e orientação', () => {
      const torreA: TorreDaEstrutura[] = [{ ...comVistas[0], name: 'Torre A' }];
      const imoveis = [...ESTOQUE.slice(0, 3), imovel('901', 9, { sun_orientation: 'NORTH' as never }), imovel('B11', 1, { block: 'B' })];
      const r = montarEspelhoDoEstoque({ imoveis, negocios: [], estrutura: torreA });
      expect(r.fonte).toBe('ESTOQUE');
      expect(r.dados.get('901')!.vista?.url).toBe('https://x/norte.jpg');
      // Bloco B não tem torre no Empreendimento: sem vista, mas o prédio tem — botão desligado.
      expect(r.dados.get('B11')!.vista).toBeNull();
    });

    // 10/11/2026: a vista de UMA unidade vence a faixa, e só ela a recebe.
    it('vista de uma unidade: a ligada acha pelo id; o imóvel sem unidade ligada (Garden) acha pelo nome', () => {
      const daUnidade = { andar_de: 1, andar_ate: 1, orientacao: null, imagem_url: 'https://x/so-da-102.jpg', legenda: null, unit_id: 'u102', unit_name: '102' };
      const torre: TorreDaEstrutura[] = [{ ...comVistas[0], name: 'Torre A', vistas: [...vistas, daUnidade] }];
      const ligados = montarEspelhoDoEstoque({ imoveis: ESTOQUE.slice(0, 3), negocios: [], estrutura: torre });
      expect(ligados.dados.get('102')!.vista).toEqual({ url: 'https://x/so-da-102.jpg', legenda: null, cobre: 'Unidade 102' });
      // A vizinha do mesmo andar segue com a faixa.
      expect(ligados.dados.get('101')!.vista?.url).toBe('https://x/baixo.jpg');

      // Sem ligação nenhuma (property_id nulo): o imóvel "102" do bloco A acha a vista pelo nome.
      const semLigacao: TorreDaEstrutura[] = [{ ...torre[0], units: torre[0].units.map((u) => ({ ...u, property_id: null })) }];
      const peloNome = montarEspelhoDoEstoque({ imoveis: [imovel('p1', 1, { name: '102' }), imovel('p2', 1, { name: '101' })], negocios: [], estrutura: semLigacao });
      expect(peloNome.fonte).toBe('ESTOQUE');
      expect(peloNome.dados.get('p1')!.vista?.url).toBe('https://x/so-da-102.jpg');
      expect(peloNome.dados.get('p2')!.vista?.url).toBe('https://x/baixo.jpg');
    });

    it('nenhuma vista no prédio: `vista` nem aparece nos dados (a ficha não fala nisso)', () => {
      const r = montarEspelhoDoEstoque({ imoveis: ESTOQUE.slice(0, 3), negocios: [], estrutura: ESTRUTURA });
      expect('vista' in r.dados.get('101')!).toBe(false);
      expect('vista' in montarEspelhoDoEstoque({ imoveis: ESTOQUE, negocios: [] }).dados.get('101')!).toBe(false);
    });
  });

  it('empate de cobertura fica com o Empreendimento (a forma de verdade)', () => {
    const r = montarEspelhoDoEstoque({ imoveis: ESTOQUE.slice(0, 3), negocios: [], estrutura: ESTRUTURA });
    expect(r.fonte).toBe('EMPREENDIMENTO');
    expect(r.semPosicao).toBe(0);
  });

  it('estrutura sem nenhuma unidade ligada ao que o corretor vê: cai no estoque', () => {
    const r = montarEspelhoDoEstoque({ imoveis: [imovel('777', 1)], negocios: [], estrutura: ESTRUTURA });
    expect(r.fonte).toBe('ESTOQUE');
    expect(r.cena.prismas.filter((p) => p.unitId).map((p) => p.unitId)).toEqual(['777']);
  });
});
