import { describe, it, expect } from 'vitest';
import {
  pedacosDoHtml,
  pedacosDoPacote,
  ehPaginaDeBusca,
  lerAnunciosDaLista,
  situacaoNoLote,
  listaJsonEm,
  type AnuncioLido,
} from '../supabase/functions/opura-market-import/logica';

/**
 * Página de BUSCA — Fase C2 do plano docs/planos/2026-10-10-opura-market-fontes.md.
 * Trechos reduzidos das páginas reais de 10/10/2026: busca de Cambuí no ZAP
 * (30 `listings`, os mesmos ids no VivaReal), na OLX (`ads`) e o JSON-LD
 * `ItemList` de um site Arbo (wandreimoveis).
 */

const LISTINGS_ZAP = [
  {
    id: '2902293944', prices: { rental: null, sale: { iptu: 0, value: 410000, condominium: 0 } },
    title: 'Fazenda/Sítio/Chácara para comprar com 5000 m², 3 quartos, 2 banheiros, 5 vagas',
    href: 'https://www.zapimoveis.com.br/imovel/venda-fazenda-sitio-chacara-3-quartos-com-quintal-zona-rural-cambui-mg-5000m2-id-2902293944/',
    business: 'SALE',
    address: { city: 'Cambuí', stateAcronym: 'MG', neighborhood: '', isApproximateLocation: false, streetNumber: 'Estrada', street: '', coordinates: { latitude: -22.610027, longitude: -46.05763 } },
    amenities: { usableAreas: [5000], bedrooms: [3], bathrooms: [2], suites: null, parkingSpaces: [5] },
    medias: { images: [{ dangerousSrc: 'https://resizedimgs.zapimoveis.com.br/x.webp' }] },
    advertiser: { name: 'Imobiliária Facility', phoneNumbers: ['19998398889'] },
    unitType: 'FARM',
  },
  {
    id: '2882519478', prices: { sale: { value: 550000 } },
    title: 'Sobrado para comprar com 88 m², 2 quartos, 3 banheiros, 2 vagas',
    address: { city: 'Cambuí', stateAcronym: 'MG', neighborhood: 'Jardim das Colinas', isApproximateLocation: false, coordinates: { latitude: -22.603554, longitude: -46.055307 } },
    amenities: { usableAreas: [88], bedrooms: [2] },
    unitType: 'TWO_STORY_HOUSE',
  },
  { id: '2700000001', prices: { rental: { value: 1500 }, sale: null }, title: 'Casa para alugar', address: { city: 'Cambuí' }, amenities: { usableAreas: [70] }, unitType: 'HOME' },
];

const paginaDeBuscaZap = `<html><head><title>Imóveis para venda - Cambuí, MG | ZAP Imóveis</title></head><body>
<script>self.__next_f.push([1,${JSON.stringify(`5:["$","$L33",null,{"pageName":"RESULT PAGE","children":[["$","$L34",null,{"content":{"listings":${JSON.stringify(LISTINGS_ZAP)}}}]]}]\n`)}])</script>
</body></html>`;

const ADS_OLX = [
  {
    subject: 'CASA no Vale do Sol Em Cambuí-MG, 2 quartos, 1 banheiro, garagem coberta, sala + cozinha..', priceValue: 'R$ 320.000', listId: 1538937428,
    categoryName: 'Casas', location: 'Cambuí', locationDetails: { municipality: 'Cambuí', ddd: '35', neighbourhood: '', uf: 'MG' },
    properties: [{ name: 'size', value: '174m²' }, { name: 'rooms', value: '2' }, { name: 'real_estate_type', value: 'Venda - casa em vila' }],
    url: 'https://mg.olx.com.br/regiao-de-pocos-de-caldas-e-varginha/imoveis/casa-no-vale-do-sol-em-cambui-mg-2-quartos-1-banheiro-garagem-coberta-sala-cozinha-1538937428',
    images: [{ original: 'https://img.olx.com.br/images/10/102699441169514.jpg' }],
  },
  {
    subject: 'Vendo linda cobertura no Jardim Cambuí, em SeteLagoas-Mg.', priceValue: 'R$ 1.250.000', listId: 1305100206, categoryName: 'Apartamentos',
    locationDetails: { municipality: 'Sete Lagoas', neighbourhood: 'Jardim Cambuí', uf: 'MG' },
    properties: [{ name: 'size', value: '214m²' }], url: 'https://mg.olx.com.br/belo-horizonte-e-regiao/imoveis/vendo-linda-cobertura-no-jardim-cambui-em-setelagoas-mg-1305100206',
  },
  { subject: 'Terreno sem área informada', priceValue: 'R$ 90.000', listId: 1, categoryName: 'Terrenos', locationDetails: { municipality: 'Cambuí', uf: 'MG' }, properties: [], url: 'https://mg.olx.com.br/x/terreno-1' },
];

const paginaDeBuscaOlx = `<html><body>
<script>self.__next_f.push([1,${JSON.stringify(`1a:["$","main",null,{"children":["$","$L25",null,{"ads":${JSON.stringify(ADS_OLX)}}]}]\n`)}])</script>
</body></html>`;

const ITEMLIST_ARBO = {
  '@context': 'https://schema.org', '@type': 'ItemList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, item: {
      '@type': 'RealEstateListing', name: 'Apartamento com 2 dormitórios à venda por R$ 260.000,00 - Santo Antônio - Cambuí/MG',
      url: 'www.wandreimoveis.com.br/imovel/apartamento-com-dormitorios-a-venda-por-r-santo-antonio-cambuimg/AP0060_WP',
      itemOffered: { '@type': 'Apartment', numberOfBedrooms: 2, floorSize: { value: 50 }, address: { '@type': 'PostalAddress', streetAddress: 'Rua Vereador Adolfo Jonas da Silva', addressLocality: 'Cambuí', addressRegion: 'MG' }, geo: { latitude: -22.604034, longitude: -46.060752 } },
    } },
    { '@type': 'ListItem', position: 2, item: {
      '@type': 'RealEstateListing', name: 'Apartamento com 2 dormitórios à venda, 60 m² por R$ 290.000,00 - Vila Mariana - Cambuí/MG',
      url: 'www.wandreimoveis.com.br/imovel/apartamento-com-dormitorios-a-venda-m2-por-r-vila-mariana-cambuimg/AP0225_WP',
      itemOffered: { '@type': 'Apartment', numberOfBedrooms: 2, address: { '@type': 'PostalAddress', addressLocality: 'Cambuí', addressRegion: 'MG' } },
    } },
  ],
};
const paginaDeBuscaArbo = `<html><head><script type="application/ld+json">${JSON.stringify(ITEMLIST_ARBO)}</script></head><body></body></html>`;

describe('ZAP e VivaReal: "listings" da página de busca', () => {
  it('lê cada anúncio pelo mesmo leitor do anúncio individual, com o link pelo id', () => {
    const pd = pedacosDoHtml(paginaDeBuscaZap);
    expect(ehPaginaDeBusca(pd)).toBe(true);
    const itens = lerAnunciosDaLista(pd, 'https://www.zapimoveis.com.br/venda/imoveis/mg+cambui/');
    expect(itens.map((i) => i.anuncio.url)).toEqual([
      'https://www.zapimoveis.com.br/imovel/id-2902293944/',
      'https://www.zapimoveis.com.br/imovel/id-2882519478/',
      'https://www.zapimoveis.com.br/imovel/id-2700000001/',
    ]);
    expect(itens[0].anuncio).toMatchObject({ tipo: 'Terreno', preco: 410000, area: 5000, quartos: 3, vagas: 5, cidade: 'Cambuí', bairro: null });
    expect(itens[0].site).toBe('ZAP Imóveis');
  });

  it('coordenada da busca vem como latitude/longitude; o centro padrão da cidade não vira posição', () => {
    const itens = lerAnunciosDaLista(pedacosDoHtml(paginaDeBuscaZap), 'https://www.zapimoveis.com.br/venda/');
    expect([itens[0].anuncio.lat, itens[0].anuncio.lng]).toEqual([null, null]);
    expect([itens[1].anuncio.lat, itens[1].anuncio.lng]).toEqual([-22.603554, -46.055307]);
  });

  it('"Estrada" no campo número não é número', () => {
    expect(lerAnunciosDaLista(pedacosDoHtml(paginaDeBuscaZap), 'https://www.zapimoveis.com.br/venda/')[0].anuncio.numero).toBeNull();
  });

  it('na VivaReal o site é VivaReal e o link é o mesmo do ZAP (não duplica)', () => {
    const itens = lerAnunciosDaLista(pedacosDoHtml(paginaDeBuscaZap), 'https://www.vivareal.com.br/venda/minas-gerais/cambui/');
    expect(itens[1].site).toBe('VivaReal');
    expect(itens[1].anuncio.url).toBe('https://www.zapimoveis.com.br/imovel/id-2882519478/');
  });
});

describe('OLX: "ads" da página de busca', () => {
  it('lê preço, área, quartos e cidade; mantém o link do anúncio', () => {
    const pd = pedacosDoHtml(paginaDeBuscaOlx);
    expect(ehPaginaDeBusca(pd)).toBe(true);
    const [casa, sete] = lerAnunciosDaLista(pd, 'https://www.olx.com.br/imoveis/venda/estado-mg/regiao-de-pocos-de-caldas-e-varginha/cambui');
    expect(casa.anuncio).toMatchObject({ tipo: 'Casa', preco: 320000, area: 174, quartos: 2, cidade: 'Cambuí', uf: 'MG', bairro: null, url: ADS_OLX[0].url });
    expect(sete.anuncio).toMatchObject({ cidade: 'Sete Lagoas', bairro: 'Jardim Cambuí' });
  });
});

describe('site de imobiliária: JSON-LD ItemList', () => {
  it('lê os itens; link sem "https://" ganha o esquema; preço vem do nome', () => {
    const pd = pedacosDoHtml(paginaDeBuscaArbo);
    expect(ehPaginaDeBusca(pd)).toBe(true);
    const [a, b] = lerAnunciosDaLista(pd, 'https://www.wandreimoveis.com.br/imoveis/cambui');
    expect(a.anuncio).toMatchObject({
      url: 'https://www.wandreimoveis.com.br/imovel/apartamento-com-dormitorios-a-venda-por-r-santo-antonio-cambuimg/AP0060_WP',
      tipo: 'Apartamento', preco: 260000, area: 50, quartos: 2, bairro: 'Santo Antônio', rua: 'Rua Vereador Adolfo Jonas da Silva', lat: -22.604034,
    });
    expect(b.anuncio).toMatchObject({ preco: 290000, area: 60, bairro: 'Vila Mariana' });
  });
});

describe('página de anúncio único nunca é tratada como busca', () => {
  it('o anúncio único ganha da lista', () => {
    const zapUnico = `<script>self.__next_f.push([1,${JSON.stringify(`7:{"listing":${JSON.stringify(LISTINGS_ZAP[1])},"listings":${JSON.stringify(LISTINGS_ZAP)}}`)}])</script>`;
    const pd = pedacosDoHtml(zapUnico);
    expect(pd.zap).not.toBeNull();
    expect(ehPaginaDeBusca(pd)).toBe(false);
  });

  it('um único item de ItemList não é página de busca', () => {
    const um = { ...ITEMLIST_ARBO, itemListElement: [ITEMLIST_ARBO.itemListElement[0]] };
    expect(ehPaginaDeBusca(pedacosDoHtml(`<script type="application/ld+json">${JSON.stringify(um)}</script>`))).toBe(false);
  });
});

describe('o pacote do navegador (não confiável)', () => {
  it('fica só lista de objetos, no máximo 100', () => {
    const pd = pedacosDoPacote({ zapLista: [...Array(150)].map((_, i) => ({ id: String(1000000 + i) })), olxLista: 'x' });
    expect(pd!.zapLista).toHaveLength(100);
    expect(pd!.olxLista).toEqual([]);
    expect(pedacosDoPacote({ zapLista: [1, 'a', null, { id: '1' }] })!.zapLista).toEqual([{ id: '1' }]);
  });

  it('item com link "javascript:" fica de fora do lote', () => {
    const pd = pedacosDoPacote({ olxLista: [{ subject: 'Casa', priceValue: 'R$ 100.000', url: 'javascript:alert(1)', locationDetails: { municipality: 'Cambuí' }, properties: [{ name: 'size', value: '50m²' }] }] });
    expect(lerAnunciosDaLista(pd!, 'https://www.olx.com.br/busca')).toEqual([]);
  });
});

describe('situação no lote', () => {
  const base: AnuncioLido = {
    url: 'https://x.com.br/1', titulo: 'Casa', tipo: 'Casa', preco: 300000, area: 80, areaTotal: null, quartos: 2, banheiros: 1, suites: 0, vagas: 1,
    condominio: null, iptu: null, descricao: null, rua: null, numero: null, bairro: 'Centro', cidade: 'Cambuí', uf: 'MG', cep: null, lat: null, lng: null,
  };

  it('grava o que a gravação aceita; o resto diz por quê', () => {
    expect(situacaoNoLote(base, false, 'Cambuí')).toEqual({ gravavel: true, texto: 'Novo' });
    expect(situacaoNoLote({ ...base, bairro: null }, false, 'Cambuí')).toEqual({ gravavel: true, texto: 'Novo, sem bairro' });
    expect(situacaoNoLote(base, true, 'cambui')).toEqual({ gravavel: true, texto: 'Já na base: atualiza o preço' });
    expect(situacaoNoLote({ ...base, cidade: 'Sete Lagoas' }, false, 'Cambuí')).toEqual({ gravavel: false, texto: 'Outra cidade (Sete Lagoas)' });
    expect(situacaoNoLote({ ...base, preco: 0, area: null }, false, 'Cambuí')).toEqual({ gravavel: false, texto: 'Falta preço, área' });
    expect(situacaoNoLote({ ...base, cidade: null }, false, 'Cambuí')).toEqual({ gravavel: false, texto: 'Falta cidade' });
  });

  it('listaJsonEm respeita colchetes dentro de texto', () => {
    expect(listaJsonEm('x[{"a":"]["},[1]]y', 1)).toBe('[{"a":"]["},[1]]');
  });
});
