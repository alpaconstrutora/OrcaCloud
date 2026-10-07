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
  consultaDeEndereco,
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

describe('consulta de geocodificação: pelo endereço, não pelo bairro', () => {
  it('rua + número + bairro + cidade', () => {
    expect(consultaDeEndereco({ rua: 'Rua Tiradentes', numero: '80', bairro: 'Centro', cidade: 'Cambuí', uf: 'MG' }))
      .toEqual({ q: 'Rua Tiradentes 80, Centro, Cambuí - MG, Brasil', temRua: true });
  });

  it('não repete o número quando a rua já o traz', () => {
    expect(consultaDeEndereco({ rua: 'Rua Tiradentes, 80', numero: '80', cidade: 'Cambuí', uf: 'MG' })!.q)
      .toBe('Rua Tiradentes, 80, Cambuí - MG, Brasil');
  });

  it('sem rua, cai para o bairro e marca que não há rua', () => {
    expect(consultaDeEndereco({ bairro: 'Vale do Sol', cidade: 'Cambuí', uf: 'MG' }))
      .toEqual({ q: 'Vale do Sol, Cambuí - MG, Brasil', temRua: false });
  });

  it('sem rua e sem bairro não consulta — o centro da cidade não localiza imóvel', () => {
    expect(consultaDeEndereco({ cidade: 'Cambuí', uf: 'MG' })).toBeNull();
  });
});

describe('resultado do Nominatim → precisão', () => {
  const comRua = { q: 'Rua Tiradentes 80, Cambuí - MG, Brasil', temRua: true };
  const soBairro = { q: 'Vale do Sol, Cambuí - MG, Brasil', temRua: false };
  const r = (rank: number, display = 'Rua Tiradentes, Centro, Cambuí, Minas Gerais, Brasil', lat = -22.61, lon = -46.05) =>
    ({ lat: String(lat), lon: String(lon), place_rank: rank, display_name: display });

  it('rua ou número com rua na consulta → endereco', () => {
    expect(localizacaoDoResultado(r(30), comRua, 'Cambuí')).toEqual({ lat: -22.61, lng: -46.05, precisao: 'endereco' });
    expect(localizacaoDoResultado(r(26), comRua, 'Cambuí')!.precisao).toBe('endereco');
  });

  it('bairro ou localidade → bairro', () => {
    expect(localizacaoDoResultado(r(20), comRua, 'Cambuí')!.precisao).toBe('bairro');
    expect(localizacaoDoResultado(r(22), soBairro, 'Cambuí')!.precisao).toBe('bairro');
  });

  it('consulta sem rua nunca vira "endereco", mesmo que o resultado seja uma rua', () => {
    expect(localizacaoDoResultado(r(27), soBairro, 'Cambuí')!.precisao).toBe('bairro');
  });

  it('nível de cidade ou maior é descartado', () => {
    expect(localizacaoDoResultado(r(16, 'Cambuí, Minas Gerais, Brasil'), comRua, 'Cambuí')).toBeNull();
  });

  it('resultado em OUTRA cidade é descartado (a rua "Rosa" caía a 30 km)', () => {
    expect(localizacaoDoResultado(r(26, 'Rua Rosa, Pouso Alegre, Minas Gerais, Brasil', -22.88), comRua, 'Cambuí')).toBeNull();
  });

  it('sem resultado, coordenada (0,0) ou rank ausente → null', () => {
    expect(localizacaoDoResultado(null, comRua, 'Cambuí')).toBeNull();
    expect(localizacaoDoResultado(r(30, undefined, 0, 0), comRua, 'Cambuí')).toBeNull();
    expect(localizacaoDoResultado({ lat: '-22.6', lon: '-46.0', display_name: 'Cambuí' }, comRua, 'Cambuí')).toBeNull();
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
