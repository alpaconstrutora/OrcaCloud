import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  normalizarNome,
  casarBairro,
  bairroDoEndereco,
  enderecoEhSoBairro,
  lerFeedVrsync,
  tipoDoImovel,
  consultasDeEndereco,
  estadoPorExtenso,
  separarNumero,
  semTipoDeVia,
  nomeContem,
  primeiraLocalizacao,
  localizacaoDoResultado,
  urlDeFeedPermitida,
} from '../supabase/functions/opura-market-import/logica';

/**
 * Regras puras da Edge Function opura-market-import (Fase 3 revisada, D7, do
 * plano docs/planos/2026-10-07-opura-market-intelligence.md). Os casos vêm dos
 * dados reais medidos em 07/10/2026: endereço do robô = "Bairro, Cambuí-MG";
 * 296 de 325 anúncios jogados no "Centro"; rua "Rosa" geocodificada a 30 km.
 */

const BAIRROS = [
  { id: 'centro', name: 'Centro' },
  { id: 'vsa', name: 'Vila Santo Antônio' },
  { id: 'colinas', name: 'Jardim das Colinas' },
];

describe('logica.ts não importa nada (vale no Deno e no Vitest)', () => {
  it('nenhuma linha de import', () => {
    const fonte = readFileSync(resolve(__dirname, '../supabase/functions/opura-market-import/logica.ts'), 'utf-8');
    expect(fonte).not.toMatch(/^\s*import\s/m);
  });

  it('a function importa a lógica deste arquivo, não uma cópia', () => {
    const fonte = readFileSync(resolve(__dirname, '../supabase/functions/opura-market-import/index.ts'), 'utf-8');
    expect(fonte).toMatch(/from\s+["']\.\/logica\.ts["']/);
  });
});

describe('bairro: casa exato ou fica sem bairro — nunca "Centro" por falta de opção', () => {
  it('normaliza caixa, acento e pontuação', () => {
    expect(normalizarNome('  Vila  Santo-Antônio ')).toBe('vila santo antonio');
  });

  it('casa o cadastrado mesmo com acento ou caixa diferente', () => {
    expect(casarBairro('VILA SANTO ANTONIO', BAIRROS)).toBe('vsa');
  });

  it('bairro desconhecido → null (antes caía no Centro)', () => {
    expect(casarBairro('Vale do Sol', BAIRROS)).toBeNull();
    expect(casarBairro('Colinas da Mantiqueira', BAIRROS)).toBeNull();
  });

  it('"contém" não basta: "Centro Comercial" não é "Centro"', () => {
    expect(casarBairro('Centro Comercial', BAIRROS)).toBeNull();
  });

  it('vazio → null', () => {
    expect(casarBairro('', BAIRROS)).toBeNull();
    expect(casarBairro(null, BAIRROS)).toBeNull();
  });

  it('extrai o bairro do endereço do robô e reconhece que não há rua', () => {
    expect(bairroDoEndereco('Vale do Sol, Cambuí-MG')).toBe('Vale do Sol');
    expect(enderecoEhSoBairro('Vale do Sol, Cambuí-MG', 'Cambuí', 'MG')).toBe(true);
    expect(enderecoEhSoBairro('Rua Tiradentes, 80', 'Cambuí', 'MG')).toBe(false);
    expect(enderecoEhSoBairro('Tiradentes', 'Cambuí', 'MG')).toBe(false);
  });
});

describe('tentativas de geocodificação: pelo endereço, e o bairro só no fim', () => {
  it('estado por extenso, tipo de via e separação do número', () => {
    expect(estadoPorExtenso('mg')).toBe('Minas Gerais');
    expect(semTipoDeVia('Avenida Tiradentes')).toBe('Tiradentes');
    expect(semTipoDeVia('Padre Caramuru')).toBe('Padre Caramuru');
    expect(separarNumero('Rua Tiradentes, 80')).toEqual({ nome: 'Rua Tiradentes', numero: '80' });
    expect(separarNumero('Av. do Carmo nº 100')).toEqual({ nome: 'Av. do Carmo', numero: '100' });
    expect(separarNumero('Tiradentes')).toEqual({ nome: 'Tiradentes', numero: null });
  });

  it('rua com número → rua sem número → rua sem o tipo → bairro', () => {
    expect(consultasDeEndereco({ rua: 'Rua Tiradentes', numero: '80', bairro: 'Centro', cidade: 'Cambuí', uf: 'MG' })).toEqual([
      { q: 'Rua Tiradentes 80, Cambuí, Minas Gerais', alvo: 'tiradentes', temRua: true },
      { q: 'Rua Tiradentes, Cambuí, Minas Gerais', alvo: 'tiradentes', temRua: true },
      // "Rua Tiradentes" não existe no mapa de Cambuí; "Tiradentes" acha a Avenida (medido em 07/10/2026)
      { q: 'Tiradentes, Cambuí, Minas Gerais', alvo: 'tiradentes', temRua: true },
      { q: 'Centro, Cambuí, Minas Gerais', alvo: 'centro', temRua: false },
    ]);
  });

  it('o número que vem dentro da rua não é repetido', () => {
    expect(consultasDeEndereco({ rua: 'Rua Tiradentes, 80', cidade: 'Cambuí', uf: 'MG' })[0].q)
      .toBe('Rua Tiradentes 80, Cambuí, Minas Gerais');
  });

  it('rua sem tipo não gera tentativa repetida', () => {
    expect(consultasDeEndereco({ rua: 'Padre Caramuru', cidade: 'Cambuí', uf: 'MG' }).map((c) => c.q))
      .toEqual(['Padre Caramuru, Cambuí, Minas Gerais']);
  });

  it('sem rua, só o bairro, marcado como sem rua', () => {
    expect(consultasDeEndereco({ bairro: 'Vale do Sol', cidade: 'Cambuí', uf: 'MG' }))
      .toEqual([{ q: 'Vale do Sol, Cambuí, Minas Gerais', alvo: 'vale do sol', temRua: false }]);
  });

  it('sem rua e sem bairro não há tentativa — o centro da cidade não localiza imóvel', () => {
    expect(consultasDeEndereco({ cidade: 'Cambuí', uf: 'MG' })).toEqual([]);
  });
});

describe('resultado do Photon → precisão, com as duas travas', () => {
  const rua = { q: 'Tiradentes, Cambuí, Minas Gerais', alvo: 'tiradentes', temRua: true };
  const bairro = { q: 'Vale do Sol, Cambuí, Minas Gerais', alvo: 'vale do sol', temRua: false };
  const f = (type: string, props: Record<string, string>, lon = -46.056, lat = -22.6157) =>
    ({ geometry: { coordinates: [lon, lat] as [number, number] }, properties: { type, city: 'Cambuí', ...props } });

  it('número achado → endereco; só a rua → rua (respostas reais de 07/10/2026)', () => {
    expect(localizacaoDoResultado(f('street', { name: 'Avenida Tiradentes' }), rua, 'Cambuí'))
      .toEqual({ lat: -22.6157, lng: -46.056, precisao: 'rua' });
    expect(localizacaoDoResultado(f('house', { name: '80', street: 'Avenida Tiradentes' }), rua, 'Cambuí')!.precisao)
      .toBe('endereco');
  });

  it('localidade/bairro → bairro', () => {
    expect(localizacaoDoResultado(f('locality', { name: 'Vale do Sol' }), bairro, 'Cambuí')!.precisao).toBe('bairro');
    expect(localizacaoDoResultado(f('district', { name: 'Vale do Sol' }), bairro, 'Cambuí')!.precisao).toBe('bairro');
  });

  it('consulta sem rua nunca vira "endereco", mesmo que o resultado seja uma rua', () => {
    expect(localizacaoDoResultado(f('street', { name: 'Rua Vale do Sol' }), bairro, 'Cambuí')!.precisao).toBe('bairro');
  });

  it('trava 1 — OUTRA cidade é descartada ("Rua Tiradentes 80" caiu na cidade de Tiradentes)', () => {
    const outraCidade = { geometry: { coordinates: [-44.17, -21.10] as [number, number] },
      properties: { type: 'house', name: '80', street: 'Rua Custódio Gomes', city: 'Tiradentes' } };
    expect(localizacaoDoResultado(outraCidade, { ...rua, alvo: 'tiradentes' }, 'Cambuí')).toBeNull();
  });

  it('trava 2 — nome procurado precisa estar no nome do resultado', () => {
    expect(localizacaoDoResultado(f('street', { name: 'Rua Padre Caramuru' }), rua, 'Cambuí')).toBeNull();
  });

  it('nome por palavras: cada palavra procurada começa uma palavra do resultado', () => {
    expect(nomeContem('Rua Prefeito David Bueno', 'davi bueno')).toBe(true);        // caso real de 07/10/2026
    expect(nomeContem('Rua Capitão Zeferino de Barros Lima', 'Cap Zeferino de B L')).toBe(true);
    expect(nomeContem('Rua Manoel P. da Rosa', 'rosa')).toBe(true);
    expect(nomeContem('Avenida Tiradentes', 'padre caramuru')).toBe(false);
    expect(nomeContem('Rua Prefeito José Bartosa', 'prefeito jose barbosa')).toBe(false); // grafia diferente no mapa
    expect(nomeContem('Qualquer', 'de da')).toBe(false);                             // nada sobra para comparar
  });

  it('usa o primeiro resultado que passa nas travas (o 1º pode ser de outra cidade)', () => {
    const outraCidade = { geometry: { coordinates: [-45.5, -21.3] as [number, number] },
      properties: { type: 'street', name: 'Avenida Prefeito José Barbosa Leão', city: 'Córrego Danta' } };
    const certo = f('street', { name: 'Avenida Prefeito José Barbosa' });
    const consulta = { q: 'Prefeito José Barbosa, Cambuí, Minas Gerais', alvo: 'prefeito jose barbosa', temRua: true };
    expect(primeiraLocalizacao([outraCidade, certo], consulta, 'Cambuí')).toEqual({ lat: -22.6157, lng: -46.056, precisao: 'rua' });
    expect(primeiraLocalizacao([outraCidade], consulta, 'Cambuí')).toBeNull();
    expect(primeiraLocalizacao(null, consulta, 'Cambuí')).toBeNull();
  });

  it('nível de cidade, sem resultado ou coordenada (0,0) → null', () => {
    expect(localizacaoDoResultado(f('city', { name: 'Tiradentes' }), rua, 'Cambuí')).toBeNull();
    expect(localizacaoDoResultado(null, rua, 'Cambuí')).toBeNull();
    expect(localizacaoDoResultado(f('street', { name: 'Avenida Tiradentes' }, 0, 0), rua, 'Cambuí')).toBeNull();
  });
});

describe('feed VRSync', () => {
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<ListingDataFeed xmlns="http://www.vivareal.com/schemas/1.0/VRSync">
  <Listings>
    <Listing>
      <ListingID>A1</ListingID>
      <Title><![CDATA[Apartamento 3 quartos & varanda]]></Title>
      <TransactionType>For Sale</TransactionType>
      <DetailViewUrl>https://imob.exemplo.com.br/imovel/a1</DetailViewUrl>
      <Details>
        <PropertyType>Residential / Apartment</PropertyType>
        <Description><![CDATA[Perto da praça]]></Description>
        <ListPrice currency="BRL">450000</ListPrice>
        <PropertyAdministrationFee currency="BRL">500</PropertyAdministrationFee>
        <YearlyTax currency="BRL">1200</YearlyTax>
        <LivingArea unit="square metres">80</LivingArea>
        <Bedrooms>3</Bedrooms><Bathrooms>2</Bathrooms><Suites>1</Suites>
        <Garage type="Parking Space">2</Garage>
      </Details>
      <Location displayAddress="All">
        <Country abbreviation="BR">Brasil</Country>
        <State abbreviation="MG">Minas Gerais</State>
        <City>Cambuí</City>
        <Neighborhood>Vila Santo Antônio</Neighborhood>
        <Address>Rua Tiradentes</Address>
        <StreetNumber>80</StreetNumber>
        <PostalCode>37600000</PostalCode>
        <Latitude>-22.6101</Latitude>
        <Longitude>-46.0577</Longitude>
      </Location>
    </Listing>
    <Listing>
      <ListingID>A2</ListingID>
      <TransactionType>For Rent</TransactionType>
      <Details><RentalPrice>1500</RentalPrice></Details>
    </Listing>
    <Listing>
      <ListingID>A3</ListingID>
      <TransactionType>Sale/Rent</TransactionType>
      <Details><PropertyType>Residential / Land Lot</PropertyType><ListPrice>0</ListPrice></Details>
    </Listing>
    <Listing>
      <ListingID>A4</ListingID>
      <TransactionType>For Sale</TransactionType>
      <Details><PropertyType>Residential / Home</PropertyType><ListPrice>390000</ListPrice><LivingArea>120</LivingArea></Details>
      <Location><City>Cambuí</City><State abbreviation="MG">Minas Gerais</State><Neighborhood>Vale do Sol</Neighborhood>
        <Latitude>0</Latitude><Longitude>0</Longitude></Location>
    </Listing>
  </Listings>
</ListingDataFeed>`;

  it('lê venda com rua, número, bairro, coordenada e valores', () => {
    const { anuncios } = lerFeedVrsync(feed);
    expect(anuncios[0]).toMatchObject({
      url: 'https://imob.exemplo.com.br/imovel/a1',
      titulo: 'Apartamento 3 quartos & varanda',
      tipo: 'Apartamento',
      preco: 450000, area: 80, quartos: 3, banheiros: 2, suites: 1, vagas: 2,
      condominio: 500, iptu: 1200, descricao: 'Perto da praça',
      rua: 'Rua Tiradentes', numero: '80', bairro: 'Vila Santo Antônio',
      cidade: 'Cambuí', uf: 'MG', cep: '37600000', lat: -22.6101, lng: -46.0577,
    });
  });

  it('ignora aluguel e venda sem preço, e conta o motivo', () => {
    const { anuncios, ignorados } = lerFeedVrsync(feed);
    expect(anuncios).toHaveLength(2);
    expect(ignorados).toEqual({ 'só aluguel': 1, 'sem preço de venda': 1 });
  });

  it('coordenada (0,0) do feed vira "sem coordenada", não um ponto no oceano', () => {
    const { anuncios } = lerFeedVrsync(feed);
    expect(anuncios[1]).toMatchObject({ tipo: 'Casa', lat: null, lng: null, bairro: 'Vale do Sol' });
  });

  it('arquivo que não é VRSync é recusado com mensagem clara', () => {
    expect(() => lerFeedVrsync('<html><body>Página</body></html>')).toThrow('nenhum <Listing>');
  });

  it('traduz os tipos de imóvel', () => {
    expect(tipoDoImovel('Commercial / Office')).toBe('Comercial');
    expect(tipoDoImovel('Residential / Condo')).toBe('Casa');
    expect(tipoDoImovel('Residential / Farm Ranch')).toBe('Terreno');
    expect(tipoDoImovel(null)).toBe('Outro');
  });
});

describe('URL do feed: só https e host público', () => {
  it('aceita https com domínio', () => {
    expect(urlDeFeedPermitida('https://imob.exemplo.com.br/feed.xml').ok).toBe(true);
  });

  it.each([
    ['http://imob.exemplo.com.br/feed.xml', 'https'],
    ['https://localhost/feed.xml', 'interno'],
    ['https://169.254.169.254/latest', 'IP'],
    ['https://10.0.0.5/feed', 'IP'],
    ['https://[::1]/feed', 'IP'],
    ['https://servidor/feed', 'interno'],
    ['não é url', 'inválido'],
  ])('recusa %s', (url) => {
    expect(urlDeFeedPermitida(url).ok).toBe(false);
  });
});
