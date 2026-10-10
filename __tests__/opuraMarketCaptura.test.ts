// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { codigoDoFavorito, pacoteDoHash, capturarAnuncio, MAX_PACOTE } from '../utils/opuraMarketCaptura';
import { pedacosDoPacote, lerAnuncioDosPedacos } from '../supabase/functions/opura-market-import/logica';

/**
 * Captura no navegador — Fase C do plano docs/planos/2026-10-10-opura-market-fontes.md.
 * O favorito é executado a partir do TEXTO do `javascript:` (como o navegador
 * faz), numa página montada com trechos reais reduzidos (ZAP 2833700148, OLX
 * 1538937428, Arbo AP0044_WP, WordPress da Sul Minas). O pacote volta pelo hash
 * e é lido pela MESMA leitura do servidor.
 */

const APP = 'https://app.exemplo.com.br/';

function rodarFavorito(): string {
  const abertos: string[] = [];
  vi.spyOn(window, 'open').mockImplementation((u?: string | URL) => { abertos.push(String(u)); return null; });
  const codigo = codigoDoFavorito(APP);
  expect(codigo.startsWith('javascript:')).toBe(true);
  // eslint-disable-next-line no-new-func
  new Function(decodeURIComponent(codigo.slice('javascript:'.length)))();
  expect(abertos).toHaveLength(1);
  return abertos[0];
}

function lerDoHash(endereco: string) {
  expect(endereco.startsWith(`${APP}#/opura-market?anuncio=`)).toBe(true);
  const recebido = pacoteDoHash(endereco.slice(endereco.indexOf('#')));
  expect(recebido).not.toBeNull();
  const pedacos = pedacosDoPacote(recebido!.pacote);
  expect(pedacos).not.toBeNull();
  return { recebido: recebido!, lido: lerAnuncioDosPedacos(pedacos!, recebido!.url) };
}

beforeEach(() => {
  vi.restoreAllMocks();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.title = '';
  delete (self as unknown as { __next_f?: unknown }).__next_f;
});

describe('favorito "Enviar ao ÒPURA"', () => {
  it('ZAP: lê o listing do self.__next_f; não leva fotos nem o anunciante', () => {
    const listing = {
      id: '2833700148',
      prices: { sale: { value: 2500000, condominium: 0, iptu: null } },
      title: 'Casa para comprar com 280 m², 3 quartos, 3 banheiros, 4 vagas',
      business: 'SALE',
      address: { city: 'Cambuí', stateAcronym: 'MG', neighborhood: 'Vila Nossa Senhora Aparecida', isApproximateLocation: true, street: '$undefined' },
      amenities: { usableAreas: [280], bedrooms: [3], bathrooms: [3], suites: [2], parkingSpaces: [4] },
      medias: { images: [{ dangerousSrc: 'https://resizedimgs.zapimoveis.com.br/img/x.webp' }] },
      advertiser: { name: 'Vanique Macedo Luz', phoneNumbers: ['3534227208'] },
      unitType: 'HOME',
    };
    (self as unknown as { __next_f: unknown[] }).__next_f = [
      [0],
      [1, '1:"$Sreact.fragment"\n'],
      [1, `7:["$","div",null,{"listing":${JSON.stringify(listing)},"x":1}]\n`],
    ];
    document.head.innerHTML = '<meta property="og:site_name" content="ZAP Imóveis">';
    const endereco = rodarFavorito();
    expect(endereco).not.toMatch(/resizedimgs|Vanique|3534227208/);
    const { recebido, lido } = lerDoHash(endereco);
    expect(JSON.stringify(recebido.pacote)).not.toMatch(/resizedimgs|Vanique|3534227208|medias|advertiser/);
    expect(lido.leitor).toBe('zap');
    expect(lido.anuncio).toMatchObject({
      url: 'https://www.zapimoveis.com.br/imovel/id-2833700148/', tipo: 'Casa', preco: 2500000, area: 280, quartos: 3, suites: 2, vagas: 4,
      bairro: 'Vila Nossa Senhora Aparecida', cidade: 'Cambuí', lat: null,
    });
  });

  it('ZAP depois de hidratar (global sem o anúncio): lê dos <script> da página', () => {
    const listing = { id: '2833700148', prices: { sale: { value: 2500000 } }, address: { city: 'Cambuí', isApproximateLocation: true }, amenities: { usableAreas: [280] }, unitType: 'HOME' };
    (self as unknown as { __next_f: unknown[] }).__next_f = [[1, '0:{}\n']];
    const el = document.createElement('script');
    // Tipo que o jsdom não executa: só o TEXTO interessa, como um pedaço já consumido
    // pelo Next. (Sem isso o jsdom rodava o push num `self` sem __next_f e a CI caía
    // com "Unhandled error", em 10/10/2026.) A captura lê qualquer <script>.
    el.type = 'text/x-pedaco-do-next';
    el.textContent = `self.__next_f.push([1,${JSON.stringify(`7:["$","div",null,{"listing":${JSON.stringify(listing)}}]\n`)}])`;
    document.body.appendChild(el);
    const { lido } = lerDoHash(rodarFavorito());
    expect(lido.leitor).toBe('zap');
    expect(lido.anuncio).toMatchObject({ preco: 2500000, area: 280, url: 'https://www.zapimoveis.com.br/imovel/id-2833700148/' });
  });

  it('OLX: lê o initial-data; o usuário e as fotos ficam de fora', () => {
    const ad = {
      listId: 1538937428, subject: 'CASA no Vale do Sol Em Cambuí-MG, 2 quartos', priceValue: 'R$ 320.000', categoryName: 'Casas',
      canonicalUrl: 'https://mg.olx.com.br/regiao-de-pocos-de-caldas-e-varginha/imoveis/casa-no-vale-do-sol-1538937428',
      location: { neighbourhood: '', municipality: 'Cambuí', uf: 'MG', zipcode: '37600000', mapLati: -22.610027, mapLong: -46.05763 },
      properties: [{ name: 'size', value: '174m²' }, { name: 'rooms', value: '2' }, { name: 'real_estate_type', value: 'Venda - casa em vila' }],
      images: [{ original: 'https://img.olx.com.br/images/10/102699441169514.jpg' }],
      user: { name: 'André', userId: 158710793 },
    };
    const el = document.createElement('script');
    el.id = 'initial-data';
    el.type = 'text/plain';
    el.setAttribute('data-json', JSON.stringify({ ad, urls: {} }));
    document.body.appendChild(el);
    const { recebido, lido } = lerDoHash(rodarFavorito());
    expect(JSON.stringify(recebido.pacote)).not.toMatch(/img\.olx|André|158710793/);
    expect(lido.leitor).toBe('olx');
    expect(lido.anuncio).toMatchObject({ tipo: 'Casa', preco: 320000, area: 174, quartos: 2, cidade: 'Cambuí', lat: null });
    expect(lido.faltando).toEqual(['bairro']);
  });

  it('Arbo: lê o __NEXT_DATA__ (só campos imv_* e o tipo); a lista de fotos fica de fora', () => {
    const imovel = {
      imv_titulo: 'Apartamento com 3 dormitórios à venda por R$ 420.000,00 - Centro - Cambuí/MG',
      imv_preco_venda: 420000, imv_qtd_dorm: 3, imv_bairro: 'Centro', imv_cidade: 'Cambuí', imv_estado: 'MG',
      imv_endereco: 'Rua Padre Caramuru', imv_latitude: -22.614056, imv_longitude: -46.056283, imv_area_util: 0,
      tipo_imovel: { timv_nome: 'Apartamento' }, tipo_negocio: { tpng_nome: 'Venda' },
      url_amiga: 'https://www.wandreimoveis.com.br/imovel/apartamento/venda/cambui/mg/centro/AP0044_WP',
      fotos: [{ url: 'https://static.arboimoveis.com.br/AP0044_WPIMOB/foto.jpg' }],
      imobiliaria: { imb_nome: 'Wandré Imóveis', imb_creci: '123' },
    };
    const el = document.createElement('script');
    el.id = '__NEXT_DATA__';
    el.type = 'application/json';
    el.textContent = JSON.stringify({ props: { pageProps: { imovel } } });
    document.body.appendChild(el);
    const { recebido, lido } = lerDoHash(rodarFavorito());
    expect(JSON.stringify(recebido.pacote)).not.toMatch(/arboimoveis|imb_creci/);
    expect(lido.leitor).toBe('arbo');
    expect(lido.anuncio).toMatchObject({ tipo: 'Apartamento', preco: 420000, rua: 'Rua Padre Caramuru', bairro: 'Centro', lat: -22.614056 });
    expect(lido.faltando).toEqual(['área']);
  });

  it('site de imobiliária: JSON-LD e o título; imagem do JSON-LD não vai', () => {
    document.head.innerHTML = [
      '<title>Casa Com 3 Dormitórios À Venda em Cambuí MG</title>',
      '<meta property="og:site_name" content="Imobiliária Sul Minas">',
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"RealEstateListing","name":"Casa Com 3 Dormitórios À Venda em Cambuí MG","image":["https://imobiliariasulminas.com.br/wp-content/uploads/foto.jpeg"],"numberOfBedrooms":3,"floorSize":{"value":600},"address":{"@type":"PostalAddress","addressLocality":"Cambuí - MG"},"offers":{"@type":"Offer","priceCurrency":"BRL","price":370000}}</script>',
    ].join('');
    const { recebido, lido } = lerDoHash(rodarFavorito());
    expect(JSON.stringify(recebido.pacote)).not.toMatch(/wp-content/);
    expect(lido.leitor).toBe('json-ld');
    expect(lido.site).toBe('Imobiliária Sul Minas');
    expect(lido.anuncio).toMatchObject({ tipo: 'Casa', preco: 370000, area: 600, quartos: 3, cidade: 'Cambuí', uf: 'MG' });
  });

  it('página grande demais: avisa e não abre o app', () => {
    const alerta = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const aberto = vi.spyOn(window, 'open').mockImplementation(() => null);
    document.head.innerHTML = `<meta property="og:description" content="${'x'.repeat(200)}">`;
    capturarAnuncio(APP, 100);
    expect(alerta).toHaveBeenCalledTimes(1);
    expect(aberto).not.toHaveBeenCalled();
    expect(MAX_PACOTE).toBeGreaterThan(100_000);
  });
});

describe('pacote recebido no hash (qualquer um pode montar o link)', () => {
  const codificar = (o: unknown) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  it('sem parâmetro, base64 inválido ou sem url → null', () => {
    expect(pacoteDoHash('#/opura-market')).toBeNull();
    expect(pacoteDoHash('#/opura-market?anuncio=%%%')).toBeNull();
    expect(pacoteDoHash(`#/opura-market?anuncio=${codificar({ zap: {} })}`)).toBeNull();
    expect(pacoteDoHash(`#/opura-market?anuncio=${codificar([1, 2])}`)).toBeNull();
  });

  it('acentos sobrevivem à ida e volta', () => {
    const r = pacoteDoHash(`#/opura-market?anuncio=${codificar({ url: 'https://x.com.br/a', ogTitulo: 'Cambuí — São João' })}`);
    expect(r?.pacote.ogTitulo).toBe('Cambuí — São João');
  });

  it('link "javascript:" montado no pacote nunca vira o link do anúncio', () => {
    const pd = pedacosDoPacote({ olx: { canonicalUrl: 'javascript:alert(1)', subject: 'Casa', priceValue: 'R$ 100.000' }, canonica: 'javascript:alert(2)' });
    const lido = lerAnuncioDosPedacos(pd!, 'https://mg.olx.com.br/x/casa-1');
    expect(lido.anuncio.url).toBe('https://mg.olx.com.br/x/casa-1');
  });

  it('pedacosDoPacote descarta o que não tem a forma esperada', () => {
    const p = pedacosDoPacote({ ogTitulo: 42, ld: 'x', zap: [1], olx: 'texto', arbo: null, canonica: ' https://a.com.br/1 ' });
    expect(p).toMatchObject({ ogTitulo: null, ld: [], zap: null, olx: null, arbo: null, canonica: 'https://a.com.br/1' });
    expect(pedacosDoPacote('x')).toBeNull();
  });
});
