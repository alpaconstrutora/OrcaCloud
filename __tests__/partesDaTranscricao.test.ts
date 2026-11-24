// Partes identificadas na transcrição (24/11/2026).
// Plano: docs/planos/2026-11-24-partes-identificadas-na-transcricao.md
// Texto no molde das escrituras do cartório de Cambuí — nomes e números fictícios
// (CPF/CNPJ de exemplo com dígito verificador válido).
import { describe, expect, it } from 'vitest';
import { formatarCnpj, formatarCpf, identificarPartes } from '../utils/partesDaTranscricao';
import type { LinhaTranscrita } from '../utils/transcricaoDocumento';

const L = (...textos: string[]): LinhaTranscrita[] => textos.map(t => ({ t, c: 95 }));

const ESCRITURA = L(
  'REPÚBLICA FEDERATIVA DO BRASIL',
  'COMARCA DE CAMBUÍ - ESTADO DE MINAS GERAIS',
  'ESCRITURA PÚBLICA DE COMPRA E VENDA',
  'saber: de um lado, como outorgante(s) vendedor(a-es) – ANA PAULA DOS SANTOS,',
  'brasileira, solteira, maior e capaz, dentista, portadora do RG nº 12.345.678-9-SSP/SP e do CPF nº',
  '529.982.247-25, residente nesta cidade e JOANA',
  'MARIA DE SOUZA, brasileira, divorciada, portadora do RG nº M-',
  '1.234.567-SSP/MG e do CPF nº 111.444. 777r35, residente nesta cidade e, de outro lado, como',
  'outorgado(a-es) comprador(a-es) – CARLOS EDUARDO LIMA, brasileiro, corretor, portador do RG nº',
  'M-7.654.321-SSP/MG e do CPF nº 529.982.247-26, casado no regime da comunhão parcial de bens na vigência',
  'da lei 6.515/77 com BEATRIZ LIMA, brasileira, portadora do RG nº M-1.111.111-SSP/MG.',
  'pelo preço certo de R$ 50.000,00 (CINQUENTA MIL REAIS). DIREITO DE SERVIDÃO DE PASSAGEM.',
  'Vendedoras (aa) ANA PAULA DOS SANTOS, brasileira, conforme acima.',
);

describe('identificarPartes', () => {
  const partes = identificarPartes(ESCRITURA);

  it('acha só as partes qualificadas — títulos e valores em maiúsculas ficam de fora', () => {
    expect(partes.map(p => p.nome)).toEqual([
      'ANA PAULA DOS SANTOS', 'JOANA MARIA DE SOUZA', 'CARLOS EDUARDO LIMA', 'BEATRIZ LIMA',
    ]);
  });

  it('papel vem do último marcador antes do nome e passa para quem vem depois', () => {
    expect(partes.map(p => p.papel)).toEqual(['Vendedor', 'Vendedor', 'Comprador', 'Comprador']);
  });

  it('"casado ... com" antes do nome = cônjuge da parte anterior (ponto de "6.515/77" não corta)', () => {
    expect(partes[3].conjugeDe).toBe('CARLOS EDUARDO LIMA');
    expect(partes[2].conjugeDe).toBeNull();
  });

  it('documentos: RG com órgão, CPF tolerante a espaço e hífen lido errado; quebra de linha no meio', () => {
    expect(partes[0]).toMatchObject({ rg: '12.345.678-9 SSP/SP', cpf: '52998224725', documentoInvalido: false });
    expect(partes[1]).toMatchObject({ rg: 'M-1.234.567 SSP/MG', cpf: '11144477735', documentoInvalido: false });
    expect(partes[3]).toMatchObject({ rg: 'M-1.111.111 SSP/MG', cpf: null });
  });

  it('CPF cujo dígito verificador não fecha é marcado', () => {
    expect(partes[2]).toMatchObject({ cpf: '52998224726', documentoInvalido: true });
  });

  it('nome repetido no fim da escritura aparece uma vez, na 1ª linha em que surge', () => {
    expect(partes.filter(p => p.nome === 'ANA PAULA DOS SANTOS')).toHaveLength(1);
    expect(partes[0].linha).toBe(3);
    expect(partes[1].linha).toBe(5); // nome que quebrou de linha: começa onde começa
  });

  it('linha duvidosa no nome ou no documento deixa a parte duvidosa', () => {
    const linhas = ESCRITURA.map((l, i) => (i === 5 ? { ...l, c: 40 } : l));
    const [ana, joana] = identificarPartes(linhas);
    expect(ana.duvidosa).toBe(true);   // CPF dela está na linha 5
    expect(joana.duvidosa).toBe(true); // o nome dela começa na linha 5
    expect(identificarPartes(ESCRITURA).some(p => p.duvidosa)).toBe(false);
  });

  it('empresa: CNPJ e sigla colada ao nome sem vírgula', () => {
    const [empresa, pessoa] = identificarPartes(L(
      'como outorgante cedente ALFA CONSTRUÇÕES LTDA, pessoa jurídica de direito privado, inscrita no CNPJ',
      'sob nº 11.222.333/0001-81, e como cessionário PEDRO HENRIQUE ALVES CPF 529.982.247-25.',
    ));
    expect(empresa).toMatchObject({ nome: 'ALFA CONSTRUÇÕES LTDA', papel: 'Cedente', cnpj: '11222333000181', cpf: null });
    expect(pessoa).toMatchObject({ nome: 'PEDRO HENRIQUE ALVES', papel: 'Cessionário', cpf: '52998224725' });
  });

  it('texto sem partes', () => {
    expect(identificarPartes(L('MATRÍCULA Nº 12.198', 'IMÓVEL: UM TERRENO RURAL'))).toEqual([]);
    expect(identificarPartes([])).toEqual([]);
  });
});

describe('formatar', () => {
  it('CPF e CNPJ', () => {
    expect(formatarCpf('52998224725')).toBe('529.982.247-25');
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });
});
