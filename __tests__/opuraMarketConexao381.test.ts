import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  lerListaConexao381,
  juntarDetalheConexao381,
  lerAnuncioConexao381,
  maxDetalhesDaFonte,
  MAX_DETALHES_PADRAO,
  urlDaListaConexao381,
  urlDoDetalheConexao381,
  fonteEhConexao381,
  fonteTemColetaDiaria,
  FONTES_SO_SOB_COMANDO,
} from '../supabase/functions/opura-market-import/logica';

/**
 * Conector da API da Conexão 381 — Fase D do plano docs/planos/2026-10-10-opura-market-fontes.md.
 * Os itens são reduções de `/api/properties-fast` de 10/10/2026 (Cambuí: 351
 * anúncios, 6 páginas de 60), mantidos campos e valores reais.
 */

const ITENS = [
  { code: '190', title: 'Terreno rural à venda no bairro Sao Miguel, em Cambuí/MG', purpose: 'For Sale', type: 'Terreno', salePrice: 600000, rentalPrice: null, hideSalePrice: false, city: 'Cambuí', neighborhood: 'Bairro Sao Miguel', state: 'MG', bedrooms: null, suites: null, bathrooms: null, parkingSpaces: null, usableArea: null, landArea: 10000 },
  { code: '80', title: 'Ponto comercial à venda ou para locação no Centro de Cambuí/MG', purpose: 'Sale/Rent', type: 'Commercial / Business', salePrice: 150000, rentalPrice: 1200, hideSalePrice: false, city: 'Cambuí', neighborhood: 'Centro', state: 'MG', bedrooms: null, suites: null, bathrooms: 2, parkingSpaces: null, usableArea: 20, landArea: 20 },
  { code: '01002', title: 'Casa residencial para locação no bairro Vale do Sol, em Cambuí/MG', purpose: 'Locação', type: 'Casa', salePrice: 0, rentalPrice: 800, hideSalePrice: true, city: 'Cambuí', neighborhood: 'Vale do Sol', state: '', bedrooms: 1, suites: 0, bathrooms: 1, parkingSpaces: null, usableArea: null, landArea: null },
  { code: '01017', title: 'Apartamento residencial à venda no bairro Vale do Sol, em Cambuí/MG', purpose: 'Venda', type: 'Apartamento', salePrice: 360000, rentalPrice: null, hideSalePrice: true, city: 'Cambuí', neighborhood: 'Vale do Sol', state: '', bedrooms: 2, suites: 1, bathrooms: 1, parkingSpaces: 1, usableArea: 60, landArea: 200 },
  { code: '3', title: 'Sobrado residencial à venda ou para locação no bairro Lagoa das Garças, em Cambuí/MG', purpose: 'Sale/Rent', type: 'Residential / Sobrado', salePrice: 3000000, rentalPrice: 7000, hideSalePrice: false, city: 'Cambuí', neighborhood: 'Lagoa das Garças', state: 'MG', bedrooms: 5, suites: 4, bathrooms: 5, parkingSpaces: 5, usableArea: 500, landArea: 875 },
];
const PAGINA = { ok: true, total: 351, page: 1, limit: 60, pages: 6, items: ITENS };

describe('lista da API (properties-fast)', () => {
  it('fica só o que tem venda: "For Sale", "Sale/Rent" e "Venda"; "Locação" é ignorado e contado', () => {
    const r = lerListaConexao381(PAGINA);
    expect(r.anuncios.map((a) => a.url)).toEqual([
      'https://conexao381.com.br/imoveis/190',
      'https://conexao381.com.br/imoveis/80',
      'https://conexao381.com.br/imoveis/01017',
      'https://conexao381.com.br/imoveis/3',
    ]);
    expect(r.ignorados).toEqual({ 'só aluguel': 1 });
    expect([r.paginas, r.total]).toEqual([6, 351]);
  });

  it('tipos em português e em inglês viram os tipos do módulo', () => {
    const tipos = Object.fromEntries(lerListaConexao381(PAGINA).anuncios.map((a) => [a.url!.split('/').pop(), a.tipo]));
    expect(tipos).toEqual({ '190': 'Terreno', '80': 'Comercial', '01017': 'Apartamento', '3': 'Casa' });
  });

  it('área útil e terreno como no feed; preço escondido no site é usado e marcado (F1)', () => {
    const [terreno, , apto] = lerListaConexao381(PAGINA).anuncios;
    expect(terreno).toMatchObject({ preco: 600000, area: null, areaTotal: 10000, quartos: 0, bairro: 'Bairro Sao Miguel', uf: 'MG', precoOcultoNaFonte: false });
    expect(apto).toMatchObject({ preco: 360000, area: 60, areaTotal: 200, quartos: 2, suites: 1, vagas: 1, uf: null, precoOcultoNaFonte: true });
    expect([apto.rua, apto.cep, apto.lat]).toEqual([null, null, null]);
  });

  it('venda sem preço e item sem código ficam de fora, contados', () => {
    const r = lerListaConexao381({ pages: 1, total: 2, items: [{ ...ITENS[0], salePrice: 0 }, { ...ITENS[1], code: '' }] });
    expect(r.anuncios).toHaveLength(0);
    expect(r.ignorados).toEqual({ 'sem preço de venda': 1, 'sem código do anúncio': 1 });
  });

  it('resposta sem "items" é erro (não pode virar lista vazia e marcar tudo como saída)', () => {
    expect(() => lerListaConexao381({ error: 'rate_limited' })).toThrow(/formato inesperado/);
    expect(() => lerListaConexao381(null)).toThrow();
  });
});

describe('detalhe completa a lista', () => {
  const DETALHE = {
    codigo: '01017', finalidade: 'Venda', tipo: 'Apartamento', valor_venda: '360000.00', area_util: null, builtArea: 60,
    dormitorios: 2, cidade: 'Cambuí', bairro: 'Vale do Sol', endereco: 'Rua Benedito Ribeiro', numero: '120', cep: '37600-000',
    latitude: '-22.6031', longitude: '-46.0632', descricao: 'APARTAMENTOS NA PLANTA', hide_sale_price: true,
  };

  it('endereço, CEP, posição e descrição vêm do detalhe; preço, tipo e bairro ficam os da lista', () => {
    const daLista = lerListaConexao381(PAGINA).anuncios[2];
    const doDetalhe = lerAnuncioConexao381({ ...DETALHE, valor_venda: '999999.00', bairro: 'Outro' }, daLista.url!).anuncio;
    const a = juntarDetalheConexao381(daLista, doDetalhe);
    expect(a).toMatchObject({
      preco: 360000, bairro: 'Vale do Sol', tipo: 'Apartamento', area: 60,
      rua: 'Rua Benedito Ribeiro', numero: '120', cep: '37600000', lat: -22.6031, lng: -46.0632, descricao: 'APARTAMENTOS NA PLANTA',
    });
  });

  it('o ponto padrão do centro da cidade no detalhe não vira posição', () => {
    const daLista = lerListaConexao381(PAGINA).anuncios[2];
    const doDetalhe = lerAnuncioConexao381({ ...DETALHE, latitude: '-22.61002670', longitude: '-46.05763010' }, daLista.url!).anuncio;
    expect(juntarDetalheConexao381(daLista, doDetalhe).lat).toBeNull();
  });

  it('sem detalhe, fica o da lista', () => {
    const daLista = lerListaConexao381(PAGINA).anuncios[0];
    expect(juntarDetalheConexao381(daLista, null)).toBe(daLista);
  });
});

describe('fonte e limites', () => {
  it('detalhes por rodada: hipótese editável em config.max_detalhes, de 0 a 300', () => {
    expect(maxDetalhesDaFonte(null)).toBe(MAX_DETALHES_PADRAO);
    expect(maxDetalhesDaFonte({})).toBe(60);
    expect(maxDetalhesDaFonte({ max_detalhes: 120 })).toBe(120);
    expect(maxDetalhesDaFonte({ max_detalhes: '30' })).toBe(30);
    expect(maxDetalhesDaFonte({ max_detalhes: 5000 })).toBe(300);
    expect(maxDetalhesDaFonte({ max_detalhes: -1 })).toBe(0);
    expect(maxDetalhesDaFonte({ max_detalhes: 'muitos' })).toBe(60);
  });

  it('endereços da API', () => {
    expect(urlDaListaConexao381('Cambuí', 2)).toBe('https://conexao381.com.br/api/properties-fast?page=2&limit=60&purpose=Venda&city=Cambu%C3%AD&sort=recent');
    expect(urlDoDetalheConexao381('01017')).toBe('https://conexao381.com.br/api/public-property-by-code/01017');
  });

  it('o conector só aceita fonte do site da Conexão 381', () => {
    expect(fonteEhConexao381('https://conexao381.com.br')).toBe(true);
    expect(fonteEhConexao381('https://www.conexao381.com.br/')).toBe(true);
    expect(fonteEhConexao381('https://conexao381.com.br.evil.com')).toBe(false);
    expect(fonteEhConexao381('x')).toBe(false);
  });
});

describe('Conexão 381 só sob comando (decisão de 10/10/2026)', () => {
  it('nunca tem coleta diária; as outras fontes podem ter', () => {
    expect(fonteTemColetaDiaria('api_conexao381')).toBe(false);
    expect(fonteTemColetaDiaria('vrsync')).toBe(true);
    expect(FONTES_SO_SOB_COMANDO).toContain('api_conexao381');
  });

  it('o banco trava (CHECK) e o cron pula o tipo', () => {
    const migration = readFileSync(resolve(__dirname, '../supabase/migrations/aplicar_20271010004200_opura_market_c381_so_sob_comando.sql'), 'utf-8');
    expect(migration).toMatch(/CHECK \(tipo <> 'api_conexao381' OR NOT ativo\)/);
    const fn = readFileSync(resolve(__dirname, '../supabase/functions/opura-market-import/index.ts'), 'utf-8');
    expect(fn).toMatch(/if \(!fonteTemColetaDiaria\(fonte\.tipo\)\)/);
  });
});
