/**
 * O PRODUTO da massa a partir das Torres & Unidades do Empreendimento (25/10/2026, pedido "construir através
 * dos dados de incorporação > empreendimento"). Plano: docs/planos/2026-10-25-planta-construir-pelo-empreendimento.md.
 */
import { describe, expect, it } from 'vitest';
import { produtoDoEmpreendimento, type TorreParaOProduto, type UnidadeParaOProduto } from '../utils/blueprintProdutoDoEmpreendimento';
import { problemasDoProduto, produtoSemente, produtoVazio } from '../utils/blueprintProduto';

const un = (nome: string, extra: Partial<UnidadeParaOProduto> = {}): UnidadeParaOProduto => ({ name: nome, ...extra });
const torre = (nome: string, units: UnidadeParaOProduto[], extra: Partial<TorreParaOProduto> = {}): TorreParaOProduto => ({ name: nome, units, ...extra });

describe('produtoDoEmpreendimento', () => {
  it('agrupa por tipologia: média de área e vagas, moda de dormitórios, mix pela contagem, preço/m² pela média', () => {
    const r = produtoDoEmpreendimento(
      [
        torre('Torre A', [
          un('101', { typology: '2 dorm.', private_area: 58, bedrooms: 2, parking_spaces: 1, price: 464000 }),
          un('102', { typology: '2 dorm.', private_area: 62, bedrooms: 2, parking_spaces: 2, price: 527000 }),
          un('103', { typology: '3 dorm. (1 suíte)', private_area: 80, bedrooms: 3, parking_spaces: 2 }),
        ]),
        torre('Torre B', [un('201', { typology: '2 Dorm.', private_area: 60, bedrooms: 2, parking_spaces: 1 })]),
      ],
      produtoVazio(),
    );
    expect(r.motivo).toBeNull();
    const p = r.produto!;
    expect(p.metaUnidades).toBe(4);
    expect(p.tipologias).toHaveLength(2);
    const [dois, tres] = p.tipologias;
    // "2 Dorm." e "2 dorm." são a mesma tipologia — o nome é o da primeira que aparece.
    expect(dois).toMatchObject({ nome: '2 dorm.', uso: 'RESIDENCIAL', dormitorios: 2, areaPrivativaM2: 60, proporcaoPct: 75 });
    expect(dois.vagasPorUnidade).toBeCloseTo(4 / 3, 2);
    // (464000/58 + 527000/62) / 2 = (8000 + 8500) / 2 — só as que têm preço E área.
    expect(dois.precoM2).toBe(8250);
    expect(tres).toMatchObject({ nome: '3 dorm. (1 suíte)', dormitorios: 3, areaPrivativaM2: 80, vagasPorUnidade: 2, proporcaoPct: 25, precoM2: 0 });
    expect(problemasDoProduto(p)).toEqual([]);
  });

  it('sem tipologia, agrupa pelos dormitórios; sala, loja e comercial viram uso COMERCIAL com mix próprio', () => {
    const r = produtoDoEmpreendimento(
      [
        torre('Torre', [
          un('101', { private_area: 50, bedrooms: 2 }),
          un('102', { private_area: 54, bedrooms: 2 }),
          un('Loja 01', { private_area: 90 }),
          un('Sala 3', { typology: 'Sala comercial', private_area: 40 }),
        ]),
      ],
      produtoVazio(),
    );
    const p = r.produto!;
    expect(p.tipologias.map((t) => [t.nome, t.uso, t.proporcaoPct])).toEqual([
      ['2 dorm.', 'RESIDENCIAL', 100],
      // Sem tipologia, a loja vira o grupo "Loja" pelo nome (Loja 01, Loja 02… são a mesma coisa).
      ['Loja', 'COMERCIAL', 50],
      ['Sala comercial', 'COMERCIAL', 50],
    ]);
    expect(p.tipologias[0].areaPrivativaM2).toBe(52);
  });

  it('deixa de fora as unidades que vieram da própria massa e os lotes do loteamento, e diz', () => {
    const r = produtoDoEmpreendimento(
      [
        torre('Bloco 1', [un('B1-101', { typology: '2 dorm.', private_area: 60, blueprint_massa_chave: 'u1:1:1' })], { blueprint_bloco_uid: 'u1' }),
        torre('Quadra A', [un('Lote 1', { private_area: 300, blueprint_lote_uid: 'l1' })], { blueprint_quadra_uid: 'q1' }),
        torre('Torre real', [un('101', { typology: '3 dorm.', private_area: 90, bedrooms: 3 })]),
      ],
      produtoVazio(),
    );
    expect(r.produto!.tipologias.map((t) => t.nome)).toEqual(['3 dorm.']);
    expect(r.produto!.metaUnidades).toBe(1);
    expect(r.avisos.join(' ')).toMatch(/1 unidade.*Estudo de massa/);
    expect(r.avisos.join(' ')).toMatch(/1 lote.*loteamento/);
  });

  it('só unidades da própria massa: não há o que importar', () => {
    const r = produtoDoEmpreendimento([torre('Bloco 1', [un('B1-101', { private_area: 60, blueprint_massa_chave: 'u1:1:1' })], { blueprint_bloco_uid: 'u1' })], produtoVazio());
    expect(r.produto).toBeNull();
    expect(r.motivo).toMatch(/Estudo de massa/);
  });

  it('tipologia sem nenhuma área privativa fica fora do mix, com aviso', () => {
    const r = produtoDoEmpreendimento(
      [torre('T', [un('101', { typology: '2 dorm.', private_area: 60, bedrooms: 2 }), un('Cobertura', { typology: 'Cobertura', bedrooms: 4 })])],
      produtoVazio(),
    );
    expect(r.produto!.tipologias.map((t) => t.nome)).toEqual(['2 dorm.']);
    expect(r.produto!.tipologias[0].proporcaoPct).toBe(100);
    expect(r.avisos.join(' ')).toMatch(/Cobertura.*sem área privativa/);
    // A meta conta as unidades do Empreendimento, inclusive a que não entrou no mix.
    expect(r.produto!.metaUnidades).toBe(2);
  });

  it('torre sem unidades cadastradas soma andares × unidades por andar na meta', () => {
    const r = produtoDoEmpreendimento(
      [torre('Torre A', [un('101', { typology: '2 dorm.', private_area: 60, bedrooms: 2 })]), torre('Torre B', [], { floors_count: 10, units_per_floor: 4 })],
      produtoVazio(),
    );
    expect(r.produto!.metaUnidades).toBe(41);
    expect(r.avisos.join(' ')).toMatch(/Torre B.*10 pavimentos × 4/);
  });

  it('só torres sem unidades: a meta entra e as tipologias atuais ficam', () => {
    const atual = produtoSemente('RESIDENCIAL_MEDIO');
    const r = produtoDoEmpreendimento([torre('Torre A', [], { floors_count: 12, units_per_floor: 6 })], atual);
    expect(r.produto!.metaUnidades).toBe(72);
    expect(r.produto!.tipologias).toEqual(atual.tipologias);
    expect(r.avisos.join(' ')).toMatch(/nenhuma unidade cadastrada/i);
  });

  it('sem unidades e sem andares: nada a importar, com o motivo', () => {
    expect(produtoDoEmpreendimento([], produtoVazio())).toMatchObject({ produto: null, motivo: expect.stringMatching(/Torres & Unidades/) });
    expect(produtoDoEmpreendimento([torre('Torre A', [])], produtoVazio()).produto).toBeNull();
  });

  it('padrão, hipóteses e financeiro vêm do produto atual; o padrão só muda quando a tipologia o nomeia', () => {
    const atual = { ...produtoSemente('RESIDENCIAL_ALTO'), nome: 'Meu produto' };
    const r = produtoDoEmpreendimento([torre('T', [un('101', { typology: '2 dorm.', private_area: 60 })])], atual);
    expect(r.produto).toMatchObject({ nome: 'Meu produto', padrao: 'R16-A', hipoteses: atual.hipoteses, financeiro: atual.financeiro });

    const nomeado = produtoDoEmpreendimento([torre('T', [un('101', { typology: 'Apto R8-B 2 dorm.', private_area: 60 })])], atual);
    expect(nomeado.produto!.padrao).toBe('R8-B');

    // Dois padrões diferentes nas tipologias: não escolhe, avisa.
    const dois = produtoDoEmpreendimento([torre('T', [un('1', { typology: 'R8-B', private_area: 50 }), un('2', { typology: 'R8-A', private_area: 90 })])], atual);
    expect(dois.produto!.padrao).toBe('R16-A');
    expect(dois.avisos.join(' ')).toMatch(/mais de um padrão/);
  });

  it('nome da tipologia cabe no campo (40 caracteres) e os ids não colidem', () => {
    const longo = 'Apartamento tipo garden com terraço privativo e churrasqueira';
    const r = produtoDoEmpreendimento([torre('T', [un('1', { typology: longo, private_area: 120 }), un('2', { typology: 'Studio', private_area: 30 })])], produtoVazio());
    const [a, b] = r.produto!.tipologias;
    expect(a.nome.length).toBeLessThanOrEqual(40);
    expect(new Set([a.id, b.id]).size).toBe(2);
  });
});
