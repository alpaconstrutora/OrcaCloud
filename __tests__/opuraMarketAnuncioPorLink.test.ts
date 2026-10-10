import { describe, it, expect } from 'vitest';
import {
  lerAnuncioDaPagina,
  lerAnuncioConexao381,
  anuncioEmBranco,
  anuncioConferido,
  numeroBr,
  tipoDoTexto,
  dadosDoTitulo,
  urlEstavel,
  urlDeLeitura,
  idDoGrupoZap,
  codigoConexao381,
  pontoPadraoDeCidade,
  bairroNoTexto,
  nomeDoSite,
  textoDeHtml,
  objetoJsonEm,
  urlDeFeedPermitida,
} from '../supabase/functions/opura-market-import/logica';

/**
 * "Colar link de anúncio" — Fase B do plano docs/planos/2026-10-10-opura-market-fontes.md.
 * Os trechos abaixo são reduções das páginas REAIS baixadas em 10/10/2026 (mesmos
 * campos, mesma estrutura, mesmos valores): ZAP Imóveis / VivaReal (anúncio
 * 2833700148), OLX (1538937428), Arbo (wandreimoveis AP0044_WP), ImobiBrasil
 * (imoveiscambui 1983768), WordPress/Houzez (imobiliariasulminas) e a API da
 * Conexão 381 (código 01006).
 */

// ZAP e VivaReal: o anúncio vai no payload do Next.js, como texto JSON escapado.
const LISTING_ZAP = {
  id: '2833700148',
  prices: { rental: null, sale: { iptu: null, value: 2500000, condominium: 0, multiple: false, period: null, values: [2500000] } },
  title: 'Casa para comprar com 280 m², 3 quartos, 3 banheiros, 4 vagas',
  href: 'https://www.zapimoveis.com.br/imovel/venda-casa-3-quartos-mobiliado-cambui-mg-280m2-id-2833700148/',
  business: 'SALE',
  address: {
    city: 'Cambuí', state: 'Minas Gerais', stateAcronym: 'MG', neighborhood: 'Vila Nossa Senhora Aparecida',
    isApproximateLocation: true, streetNumber: '$undefined', street: '$undefined', coordinates: '$undefined',
  },
  amenities: { usableAreas: [280], bedrooms: [3], bathrooms: [3], suites: [2], parkingSpaces: [4] },
  description: 'Casa de alto padrão, com 280m², em Cambuí - MG',
  unitType: 'HOME',
};
const paginaZap = (listing: unknown) => `<html><head>
<link rel="canonical" href="https://www.zapimoveis.com.br/imovel/venda-casa-3-quartos-mobiliado-cambui-mg-280m2-id-2833700148/"/>
<script type="application/ld+json">{"@context":"https://schema.org/","@type":"Organization","url":"https://www.zapimoveis.com.br","name":"Zap Imóveis"}</script>
</head><body>
<script>self.__next_f.push([1,${JSON.stringify('1:"$Sreact.fragment"\n')}])</script>
<script>self.__next_f.push([1,${JSON.stringify(`7:["$","div",null,{"listing":${JSON.stringify(listing)},"x":1}]\n`)}])</script>
</body></html>`;

const atributo = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const AD_OLX = {
  listId: 1538937428,
  body: 'Aceita FINANCIAMENTO!<br>2 quartos bem distribuídos<br>66,9m² construídos e uma área total de 174m²',
  subject: 'CASA no Vale do Sol Em Cambuí-MG, 2 quartos, 1 banheiro, garagem coberta, sala + cozinha..',
  priceValue: 'R$ 320.000',
  categoryName: 'Casas',
  canonicalUrl: 'https://mg.olx.com.br/regiao-de-pocos-de-caldas-e-varginha/imoveis/casa-no-vale-do-sol-em-cambui-mg-2-quartos-1-banheiro-garagem-coberta-sala-cozinha-1538937428',
  location: { address: null, neighbourhood: '', municipality: 'Cambuí', zipcode: '37600000', mapLati: -22.610027, mapLong: -46.05763, uf: 'MG' },
  properties: [
    { name: 'category', label: 'Categoria', value: 'Casas' },
    { name: 'real_estate_type', label: 'Tipo', value: 'Venda - casa em vila' },
    { name: 'condominio', label: 'Condomínio', value: 'R$ 0' },
    { name: 'size', label: 'Área construída', value: '174m²' },
    { name: 'rooms', label: 'Quartos', value: '2' },
    { name: 'bathrooms', label: 'Banheiros', value: '1' },
    { name: 'garage_spaces', label: 'Vagas na garagem', value: '1' },
  ],
};
const paginaOlx = (ad: unknown) =>
  `<html><head><link rel="canonical" href="${AD_OLX.canonicalUrl}"/></head><body>` +
  `<script id="initial-data" type="text/plain" data-json="${atributo(JSON.stringify({ ad }))}"></script></body></html>`;

const IMOVEL_ARBO = {
  imv_location: { lng: -46.056283, lat: -22.614056 },
  imv_titulo: 'Apartamento com 3 dormitórios à venda por R$ 420.000,00 - Centro - Cambuí/MG',
  imv_preco_venda: 420000, imv_preco_cond: 0, imv_preco_iptu: 0, imv_area_util: 0, imv_area_total: 0,
  imv_qtd_dorm: 3, imv_qtd_suite: 1, imv_qtd_vagas: 0, imv_qtd_banheiros: 1,
  imv_obs: 'OPORTUNIDADE!!Apartamento á venda no centro de Cambuí',
  imv_estado: 'MG', imv_cidade: 'Cambuí', imv_bairro: 'Centro', imv_endereco: 'Rua Padre Caramuru', imv_end_numero: 32323,
  imv_longitude: -46.056283, imv_latitude: -22.614056, imv_hide_address_wl: false, imv_ocultar_preco: false,
  tipo_imovel: { timv_nome: 'Apartamento' }, tipo_negocio: { tpng_nome: 'Venda' },
  url_amiga: 'https://www.wandreimoveis.com.br/imovel/apartamento/venda/cambui/mg/centro/AP0044_WP',
};
const paginaArbo = (imovel: unknown) => `<html><head>
<meta property="og:site_name" content="Wandré Imóveis em Extrema, Minas Gerais, Brasil | Encontre Seu Lar Ideal"/>
<script type="application/ld+json">{"@id":"Wandré Imóveis","@context":"https://schema.org","@type":"Organization","name":"Wandré Imóveis","address":{"@type":"PostalAddress","addressLocality":"Extrema","streetAddress":"RUA BENJAMIN CONSTANT"}}</script>
</head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { imovel } } })}</script></body></html>`;

// ImobiBrasil: o 1º bloco é a IMOBILIÁRIA (endereço dela, não do imóvel).
const PAGINA_IMOBIBRASIL = `<html><head>
<link rel="canonical" href="https://www.imoveiscambui.com.br/imovel/1983768/casa-venda-cambui-mg" />
<meta property="og:title" content="Casa para Venda, Cambu&iacute; / MG, 3 dormit&oacute;rios, sendo 1 su&iacute;te, 4 vagas de garagem, &aacute;rea total 250 m&sup2;, &aacute;rea constru&iacute;da 260 m&sup2;"/>
<script type="application/ld+json"> {"@context":"https://schema.org", "@type":"RealEstateAgent", "name":"Jose Higino Raimundo da Cunha", "address":{"@type":"PostalAddress","streetAddress":"Rua Silviano Brandão, Centro, 79","addressLocality":"Cambuí", "addressRegion":"MG", "postalCode":"37600000"} } </script>
<script type="application/ld+json"> { "@context": "https://schema.org", "@type": "BuyAction", "price":"550000.00", "priceSpecification": {"@type": "PriceSpecification","priceCurrency": "BRL"}, "object": { "@type": "Place", "address": { "@type": "PostalAddress","addressCountry":"BR", "addressLocality": "Cambuí", "addressRegion": "MG" ,"streetAddress": "" ,"postalCode":"37600000" }, "name": "Casa para Venda, Cambuí / MG, 3 dormitórios, sendo 1 suíte, 4 vagas de garagem, área total 250 m&sup2;, área construída 260 m&sup2;", "url": "https://imoveiscambui.com.br/imovel/1983768/casa-venda-cambui-mg" } } </script>
<script type="application/ld+json"> { "@context": "https://schema.org", "@type": "Product", "sku": "1983768", "name": "Casa para Venda, Cambuí / MG, 3 dormitórios", "offers": {"@type": "Offer", "priceCurrency": "BRL","price":"550000" } } </script>
</head><body></body></html>`;

// WordPress (tema Houzez + Yoast): grafo do Yoast com a ORGANIZAÇÃO e um RealEstateListing.
const PAGINA_WORDPRESS = `<html><head>
<link rel="canonical" href="https://imobiliariasulminas.com.br/imovel/casa-com-3-dormitorios-a-venda-em-cambui-mg-2/" />
<meta property="og:site_name" content="Imobiliária Sul Minas" />
<script type="application/ld+json" class="yoast-schema-graph">{"@context":"https:\\/\\/schema.org","@graph":[{"@type":"WebPage","name":"Casa Com 3 Dormitórios"},{"@type":"Organization","name":"Imobiliária Sul Minas","address":{"@type":"PostalAddress","streetAddress":"Rua da Imobiliária, 1","addressLocality":"Cambuí"}}]}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"RealEstateListing","name":"Casa Com 3 Dormitórios À Venda em Cambuí MG","url":"https://imobiliariasulminas.com.br/imovel/casa-com-3-dormitorios-a-venda-em-cambui-mg-2/","numberOfBedrooms":3,"numberOfBathroomsTotal":1,"floorSize":{"@type":"QuantitativeValue","value":600,"unitText":"SQM"},"address":{"@type":"PostalAddress","addressLocality":"Cambuí - MG"},"offers":{"@type":"Offer","priceCurrency":"BRL","price":370000}}</script>
</head><body></body></html>`;

const DETALHE_C381 = {
  id: '48195', codigo: '01006', titulo: 'Apartamento residencial à venda ou para locação no Centro de Cambuí/MG', descricao: null,
  finalidade: 'Venda e Locação', tipo: 'Apartamento', valor_venda: '700000.00', valor_locacao: '2000.00',
  area_terreno: null, area_util: null, dormitorios: 2, suites: 0, banheiros: 1, vagas: 1,
  estado: null, uf: null, cidade: 'Cambuí', bairro: 'Centro', endereco: 'Rua Quintino Bocaiuva', numero: '155', cep: '37600000',
  latitude: null, longitude: null, built_area: '80', builtArea: 80, hide_sale_price: false, addressVisibility: 'Aproximada',
};

describe('ZAP Imóveis e VivaReal (payload do Next.js)', () => {
  it('lê preço, área, quartos, bairro e cidade do anúncio real', () => {
    const r = lerAnuncioDaPagina(paginaZap(LISTING_ZAP), 'https://www.zapimoveis.com.br/imovel/venda-casa-3-quartos-mobiliado-cambui-mg-280m2-id-2833700148/?utm_source=x');
    expect(r.leitor).toBe('zap');
    expect(r.site).toBe('ZAP Imóveis');
    expect(r.anuncio).toMatchObject({
      tipo: 'Casa', preco: 2500000, area: 280, quartos: 3, banheiros: 3, suites: 2, vagas: 4,
      bairro: 'Vila Nossa Senhora Aparecida', cidade: 'Cambuí', uf: 'MG', rua: null, numero: null, condominio: null,
    });
    expect(r.faltando).toEqual([]);
  });

  it('o link gravado é o do id, o MESMO para ZAP e VivaReal (o mesmo anúncio não duplica)', () => {
    const zap = lerAnuncioDaPagina(paginaZap(LISTING_ZAP), 'https://www.zapimoveis.com.br/imovel/venda-casa-3-quartos-mobiliado-cambui-mg-280m2-id-2833700148/');
    const vr = lerAnuncioDaPagina(paginaZap(LISTING_ZAP), 'https://www.vivareal.com.br/imovel/casa-3-quartos-cambui-com-garagem-280m2-venda-RS2500000-id-2833700148/');
    expect(zap.anuncio.url).toBe('https://www.zapimoveis.com.br/imovel/id-2833700148/');
    expect(vr.anuncio.url).toBe(zap.anuncio.url);
    expect(vr.site).toBe('VivaReal');
  });

  it('localização "aproximada" do portal não vira posição do imóvel', () => {
    const r = lerAnuncioDaPagina(paginaZap({ ...LISTING_ZAP, address: { ...LISTING_ZAP.address, coordinates: { lat: -22.61, lon: -46.05 } } }), LISTING_ZAP.href);
    expect(r.anuncio.lat).toBeNull();
    expect(r.avisos.join(' ')).toMatch(/aproximada/);
    const exata = lerAnuncioDaPagina(paginaZap({ ...LISTING_ZAP, address: { ...LISTING_ZAP.address, isApproximateLocation: false, coordinates: { lat: -22.6131, lon: -46.0601 } } }), LISTING_ZAP.href);
    expect([exata.anuncio.lat, exata.anuncio.lng]).toEqual([-22.6131, -46.0601]);
  });

  it('anúncio só de aluguel avisa e fica sem preço', () => {
    const r = lerAnuncioDaPagina(paginaZap({ ...LISTING_ZAP, prices: { rental: { value: 3000 }, sale: null } }), LISTING_ZAP.href);
    expect(r.anuncio.preco).toBe(0);
    expect(r.faltando).toContain('preço');
    expect(r.avisos.join(' ')).toMatch(/aluguel/);
  });

  it('VivaReal (403 a leitura automática) é lido pela página do ZAP, pelo id', () => {
    expect(urlDeLeitura('https://www.vivareal.com.br/imovel/casa-3-quartos-cambui-com-garagem-280m2-venda-RS2500000-id-2833700148/'))
      .toEqual({ url: 'https://www.zapimoveis.com.br/imovel/id-2833700148/', formato: 'html' });
    expect(idDoGrupoZap('https://www.zapimoveis.com.br/imovel/id-2833700148/')).toBe('2833700148');
    expect(idDoGrupoZap('https://www.olx.com.br/imovel-id-2833700148')).toBeNull();
  });
});

describe('OLX (initial-data)', () => {
  it('lê o anúncio real; preço "R$ 320.000" vira 320000', () => {
    const r = lerAnuncioDaPagina(paginaOlx(AD_OLX), AD_OLX.canonicalUrl + '?lis=home');
    expect(r.leitor).toBe('olx');
    expect(r.anuncio).toMatchObject({ tipo: 'Casa', preco: 320000, area: 174, quartos: 2, banheiros: 1, vagas: 1, cidade: 'Cambuí', uf: 'MG', cep: '37600000', condominio: null });
    expect(r.anuncio.url).toBe(AD_OLX.canonicalUrl);
    expect(r.anuncio.descricao).toContain('2 quartos bem distribuídos');
  });

  it('bairro vazio fica faltando; o centro padrão da cidade não vira posição', () => {
    const r = lerAnuncioDaPagina(paginaOlx(AD_OLX), AD_OLX.canonicalUrl);
    expect(r.anuncio.bairro).toBeNull();
    expect(r.faltando).toEqual(['bairro']);
    expect(r.anuncio.lat).toBeNull();
  });

  it('anúncio de aluguel avisa', () => {
    const ad = { ...AD_OLX, properties: [{ name: 'real_estate_type', value: 'Aluguel - casa' }] };
    expect(lerAnuncioDaPagina(paginaOlx(ad), AD_OLX.canonicalUrl).avisos.join(' ')).toMatch(/Aluguel - casa/);
  });
});

describe('sites Arbo (__NEXT_DATA__ imv_*)', () => {
  it('lê o imóvel com rua, bairro e a posição da fonte', () => {
    const r = lerAnuncioDaPagina(paginaArbo(IMOVEL_ARBO), 'https://www.wandreimoveis.com.br/imovel/apartamento/venda/cambui/mg/centro/AP0044_WP');
    expect(r.leitor).toBe('arbo');
    expect(r.anuncio).toMatchObject({
      tipo: 'Apartamento', preco: 420000, quartos: 3, suites: 1, banheiros: 1, rua: 'Rua Padre Caramuru',
      bairro: 'Centro', cidade: 'Cambuí', lat: -22.614056, lng: -46.056283, area: null, condominio: null,
    });
    expect(r.faltando).toEqual(['área']);
  });

  it('o slogan no og:site_name não vira nome do site; o endereço da Organization é ignorado', () => {
    const r = lerAnuncioDaPagina(paginaArbo(IMOVEL_ARBO), IMOVEL_ARBO.url_amiga);
    expect(r.site).toBe('wandreimoveis.com.br');
    expect(r.anuncio.rua).not.toMatch(/BENJAMIN/);
  });

  it('endereço escondido pelo anunciante: sem rua, número nem ponto; preço oculto é marcado', () => {
    const r = lerAnuncioDaPagina(paginaArbo({ ...IMOVEL_ARBO, imv_hide_address_wl: true, imv_ocultar_preco: true }), IMOVEL_ARBO.url_amiga);
    expect([r.anuncio.rua, r.anuncio.numero, r.anuncio.lat]).toEqual([null, null, null]);
    expect(r.anuncio.precoOcultoNaFonte).toBe(true);
  });

  it('ponto padrão da cidade (o mesmo da OLX) vira "sem posição"', () => {
    const r = lerAnuncioDaPagina(paginaArbo({ ...IMOVEL_ARBO, imv_latitude: -22.610027, imv_longitude: -46.05763 }), IMOVEL_ARBO.url_amiga);
    expect(r.anuncio.lat).toBeNull();
  });
});

describe('dados estruturados (JSON-LD)', () => {
  it('ImobiBrasil: preço do BuyAction e área do título; o endereço da IMOBILIÁRIA não entra', () => {
    const r = lerAnuncioDaPagina(PAGINA_IMOBIBRASIL, 'https://www.imoveiscambui.com.br/imovel/1983768/casa-venda-cambui-mg');
    expect(r.leitor).toBe('json-ld');
    expect(r.anuncio).toMatchObject({ tipo: 'Casa', preco: 550000, area: 260, areaTotal: 250, quartos: 3, suites: 1, vagas: 4, cidade: 'Cambuí', uf: 'MG', rua: null });
    expect(r.anuncio.titulo).toContain('área construída 260 m²');
    expect(r.site).toBe('imoveiscambui.com.br');
  });

  it('WordPress: RealEstateListing com preço, área e "Cambuí - MG" separado em cidade e UF', () => {
    const r = lerAnuncioDaPagina(PAGINA_WORDPRESS, 'https://imobiliariasulminas.com.br/imovel/casa-com-3-dormitorios-a-venda-em-cambui-mg-2/');
    expect(r.anuncio).toMatchObject({ tipo: 'Casa', preco: 370000, area: 600, quartos: 3, banheiros: 1, cidade: 'Cambuí', uf: 'MG', rua: null });
    expect(r.site).toBe('Imobiliária Sul Minas');
    expect(r.faltando).toEqual(['bairro']);
  });

  it('página sem anúncio (lista de busca) → nada inventado, tudo faltando', () => {
    const lista = '<html><head><title>Imóveis à venda em Cambuí</title><script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"@type":"ListItem","item":{"@type":"RealEstateListing","offers":{"price":260000}}}]}</script></head></html>';
    const r = lerAnuncioDaPagina(lista, 'https://www.wandreimoveis.com.br/imoveis/cambui');
    expect(r.leitor).toBe('nenhum');
    expect(r.anuncio.preco).toBe(0);
    expect(r.faltando).toEqual(['preço', 'área', 'cidade', 'bairro', 'tipo']);
  });
});

describe('Conexão 381 (API pública de detalhe)', () => {
  it('lê o anúncio real com rua, número e CEP; link estável pelo código', () => {
    const r = lerAnuncioConexao381(DETALHE_C381, 'https://conexao381.com.br/imoveis/01006');
    expect(r.anuncio).toMatchObject({
      url: 'https://conexao381.com.br/imoveis/01006', tipo: 'Apartamento', preco: 700000, area: 80, quartos: 2, banheiros: 1, vagas: 1,
      rua: 'Rua Quintino Bocaiuva', numero: '155', bairro: 'Centro', cidade: 'Cambuí', cep: '37600000', precoOcultoNaFonte: false,
    });
    expect(r.faltando).toEqual([]);
  });

  it('preço escondido no site é usado e marcado (decisão F1)', () => {
    const r = lerAnuncioConexao381({ ...DETALHE_C381, hide_sale_price: true }, 'https://conexao381.com.br/imoveis/01006');
    expect(r.anuncio.preco).toBe(700000);
    expect(r.anuncio.precoOcultoNaFonte).toBe(true);
    expect(r.avisos.join(' ')).toMatch(/esconde o preço/);
  });

  it('rua que é link do Google Maps ou Plus Code é descartada; ponto padrão vira sem posição', () => {
    const maps = lerAnuncioConexao381({ ...DETALHE_C381, endereco: 'https://maps.app.goo.gl/abc', latitude: '-22.61002670', longitude: '-46.05763010' }, 'https://conexao381.com.br/imoveis/01006');
    expect(maps.anuncio.rua).toBeNull();
    expect(maps.anuncio.lat).toBeNull();
    expect(lerAnuncioConexao381({ ...DETALHE_C381, endereco: 'C2X4+7M Cambuí' }, 'x').anuncio.rua).toBeNull();
  });

  it('anúncio inexistente → em branco com aviso', () => {
    const r = lerAnuncioConexao381({ error: 'imovel_nao_encontrado' }, 'https://conexao381.com.br/imoveis/99999');
    expect(r.anuncio.preco).toBe(0);
    expect(r.avisos[0]).toMatch(/não encontrou/);
  });

  it('o link do site vira a chamada da API', () => {
    expect(codigoConexao381('https://conexao381.com.br/imoveis/01006')).toBe('01006');
    expect(codigoConexao381('https://conexao381.com.br/sobre')).toBeNull();
    expect(urlDeLeitura('https://www.conexao381.com.br/imoveis/01006/'))
      .toEqual({ url: 'https://conexao381.com.br/api/public-property-by-code/01006', formato: 'json-conexao381' });
  });
});

describe('regras de apoio', () => {
  it('número brasileiro e de máquina', () => {
    expect(numeroBr('R$ 320.000')).toBe(320000);
    expect(numeroBr('R$ 1.800.000,00')).toBe(1800000);
    expect(numeroBr('550000.00')).toBe(550000);
    expect(numeroBr('66,9m²')).toBe(66.9);
    expect(numeroBr('174m²')).toBe(174);
    expect(numeroBr('Consulte')).toBeNull();
  });

  it('tipo pelo texto: vale o que aparece primeiro', () => {
    expect(tipoDoTexto('Casa com terreno de 600 m²')).toBe('Casa');
    expect(tipoDoTexto('Terreno com casa antiga')).toBe('Terreno');
    expect(tipoDoTexto('Casas')).toBe('Casa');
    expect(tipoDoTexto('Apartamentos')).toBe('Apartamento');
    expect(tipoDoTexto('Galpão industrial')).toBe('Comercial');
    expect(tipoDoTexto('Sala e cozinha conjugadas')).toBeNull();
  });

  it('título: área construída × total, quartos, bairro "no bairro X" e " - X - Cidade/UF"', () => {
    expect(dadosDoTitulo('Casa, área total 250 m², área construída 260 m²')).toMatchObject({ area: 260, areaTotal: 250 });
    expect(dadosDoTitulo('Apartamento residencial à venda no bairro Vale do Sol, em Cambuí/MG').bairro).toBe('Vale do Sol');
    expect(dadosDoTitulo('Apartamento com 3 dormitórios à venda por R$ 420.000,00 - Centro - Cambuí/MG')).toMatchObject({ bairro: 'Centro', quartos: 3, preco: 420000 });
  });

  it('link estável: canônico do mesmo site, sem utm e sem #; canônico de outro host é ignorado', () => {
    expect(urlEstavel('https://imob.com.br/imovel/1?utm_source=fb#fotos')).toBe('https://imob.com.br/imovel/1');
    expect(urlEstavel('https://imob.com.br/i?id=1', 'https://www.imob.com.br/imovel/1-casa')).toBe('https://www.imob.com.br/imovel/1-casa');
    // Visto no WordPress da Sul Minas: canônico apontando para o ambiente de teste.
    expect(urlEstavel('https://imobiliariasulminas.com.br/cidade/cambui-mg/', 'http://publichtml-ism.test/cidade/cambui-mg/')).toBe('https://imobiliariasulminas.com.br/cidade/cambui-mg/');
  });

  it('ponto padrão de cidade', () => {
    expect(pontoPadraoDeCidade(-22.610027, -46.05763)).toBe(true);
    expect(pontoPadraoDeCidade(-22.614056, -46.056283)).toBe(false);
  });

  it('bairro cadastrado citado no título (palavra inteira, o mais longo ganha)', () => {
    const bairros = [{ id: 'c', name: 'Centro' }, { id: 'vs', name: 'Vale do Sol' }, { id: 'n', name: 'Nova' }, { id: 'vn', name: 'Vila Nova' }];
    expect(bairroNoTexto('CASA no Vale do Sol Em Cambuí-MG', bairros)?.id).toBe('vs');
    expect(bairroNoTexto('Casa na Vila Nova', bairros)?.id).toBe('vn');
    expect(bairroNoTexto('Casa renovada', bairros)).toBeNull();
  });

  it('nome do site e entidades HTML', () => {
    expect(nomeDoSite('https://mg.olx.com.br/x')).toBe('OLX');
    expect(nomeDoSite('https://imob.com.br/x', 'Imob Cambuí')).toBe('Imob Cambuí');
    expect(textoDeHtml('Cambu&iacute; 250 m&sup2; &amp; mais')).toBe('Cambuí 250 m² & mais');
    expect(objetoJsonEm('x{"a":"}{","b":{"c":1}}y', 1)).toBe('{"a":"}{","b":{"c":1}}');
  });

  it('link do anúncio: mesma trava de rede do feed, com o texto certo', () => {
    expect(urlDeFeedPermitida('http://imob.com.br/1', 'do anúncio')).toEqual({ ok: false, motivo: 'O link do anúncio precisa começar com https://.' });
    expect(urlDeFeedPermitida('https://10.0.0.1/1', 'do anúncio').ok).toBe(false);
    expect(urlDeFeedPermitida('ftp://x').ok).toBe(false);
  });

  it('site que bloqueia: anúncio em branco com o link, para preencher à mão', () => {
    const r = anuncioEmBranco('https://mg.olx.com.br/x/casa-1538937428?lis=1#a');
    expect(r.anuncio.url).toBe('https://mg.olx.com.br/x/casa-1538937428?lis=1');
    expect(r.site).toBe('OLX');
    expect(r.leitor).toBe('nenhum');
  });

  it('em branco também usa o link estável: ZAP pelo id, Conexão 381 pelo código', () => {
    // Visto na prova de 10/10/2026: ZAP bloqueado no servidor; colar de novo tem de reconhecer o gravado.
    expect(anuncioEmBranco('https://www.zapimoveis.com.br/imovel/venda-casa-id-2833700148/?utm_source=x').anuncio.url)
      .toBe('https://www.zapimoveis.com.br/imovel/id-2833700148/');
    expect(anuncioEmBranco('https://www.conexao381.com.br/imoveis/01006/').anuncio.url).toBe('https://conexao381.com.br/imoveis/01006');
  });
});

describe('anúncio conferido (o corpo da requisição não é confiável)', () => {
  const base = { url: 'https://www.zapimoveis.com.br/imovel/id-1/', preco: '320.000', area: '74,5', cidade: 'Cambuí', tipo: 'Casa', quartos: '2' };

  it('aceita e normaliza', () => {
    const r = anuncioConferido({ ...base, uf: 'Minas Gerais', lat: -22.610027, lng: -46.05763, precoOcultoNaFonte: true, tipo: 'Castelo' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.anuncio).toMatchObject({ preco: 320000, area: 74.5, quartos: 2, uf: 'MG', lat: null, tipo: 'Outro', precoOcultoNaFonte: true });
    }
  });

  it('recusa sem link, sem preço, sem área ou sem cidade', () => {
    expect(anuncioConferido({ ...base, url: 'javascript:alert(1)' })).toEqual({ ok: false, motivo: 'O link do anúncio é obrigatório (http ou https).' });
    expect(anuncioConferido({ ...base, preco: 0 })).toEqual({ ok: false, motivo: 'Informe o preço de venda.' });
    expect(anuncioConferido({ ...base, area: '' })).toEqual({ ok: false, motivo: 'Informe a área (m²).' });
    expect(anuncioConferido({ ...base, cidade: '  ' })).toEqual({ ok: false, motivo: 'Informe a cidade.' });
    expect(anuncioConferido(null).ok).toBe(false);
  });
});
