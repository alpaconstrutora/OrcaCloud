// @vitest-environment jsdom
/**
 * A4 — GeoINCRA / SIGEF.
 *
 * Um lote de 200 × 300 m georreferenciado em Minas (SIRGAS 2000 / UTM 23S),
 * com os quatro vértices tipados, sigmas, altitudes e métodos, e as quatro
 * divisas com tipo de limite e confrontante. O que se protege:
 *  - a ORDEM do SIGEF: sentido horário começando pelo vértice mais ao norte;
 *  - o FORMATO do manual: "45 30 25,892 W", sigma "0,02", altitude "812,35";
 *  - a VALIDAÇÃO pelas regras do INCRA (método × tipo, precisão × limite, código);
 *  - a PLANILHA: o modelo oficial preenchido, abas e parâmetros intactos;
 *  - memorial em GMS com 3 casas, carta por confrontante, retorno conferido.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel, type TipoDeLimite } from '../utils/blueprintKernel';
import {
  cartasDeAnuencia,
  conferirRetornoSigef,
  gmsSigef,
  IDENTIFICACAO_VAZIA,
  lerCoordenadaSigef,
  memorialGeoIncra,
  perimetroSigef,
  planilhaOdsSigef,
  precisaoMaximaM,
  preencherContentXml,
  relatorioDeVerticesCsv,
  validarSigef,
  type IdentificacaoSigef,
} from '../utils/geo/sigef';
import { DesenhistaDeProva, type Enquadramento } from '../utils/blueprintExport';
import { desenharPlantaTopografica } from '../utils/blueprintPranchaTopografica';
import { planejarConjunto, TEMPLATE_DE_PRANCHA_PADRAO } from '../utils/blueprintPranchas';

const MODELO = readFileSync(path.join(__dirname, '..', 'public', 'sigef', 'sigef_planilha_modelo_1.4_rc5.ods'));

const CANTOS = [
  { x: 0, y: 0 },
  { x: 200_000, y: 0 },
  { x: 200_000, y: 300_000 },
  { x: 0, y: 300_000 },
];
const LIMITES: TipoDeLimite[] = ['LA1', 'LA3', 'LN1', 'LA2'];
const CONFRONTANTES = ['Fazenda Boa Vista', 'Estrada Municipal MG-10', 'Córrego do Meio', 'Sítio Esperança'];

function imovel(extra: (m: BlueprintModel) => BlueprintModel = (m) => m): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const lv = m.levels[0].id;
  m = applyBatch(
    m,
    CANTOS.map((a, i) => ({ type: 'AddBoundary' as const, levelId: lv, a, b: CANTOS[(i + 1) % 4], kind: 'TERRENO' as const })),
  ).model;
  m = applyCommand(m, {
    type: 'SetGeorreferencia',
    georreferencia: { latitude: -19.9, longitude: -43.95, elevacaoM: 850, projetada: { lesteM: 0, norteM: 0, crs: 'EPSG:31983' } },
  } as never).model;
  // O lado que COMEÇA em cada canto (a→b): sul, leste, norte, oeste.
  const porCanto = CANTOS.map((c) => m.boundaries.find((b) => b.a.x === c.x && b.a.y === c.y)!);
  m = applyBatch(m, [
    ...CANTOS.map((c, i) => ({
      type: 'SetVerticeDoTerreno' as const,
      ponto: c,
      nome: 'x',
      tipo: (i % 2 === 0 ? 'M' : 'P') as 'M' | 'P',
      sigmaEMm: 20,
      sigmaNMm: 25,
      sigmaHMm: 40,
      altitudeM: 850 + i * 1.5,
      metodo: 'PG6',
    })),
    ...porCanto.map((b, i) => ({ type: 'SetBoundaryEscritura' as const, boundaryId: b.id, medidaMm: null, confrontante: CONFRONTANTES[i] })),
    ...porCanto.map((b, i) => ({ type: 'SetBoundarySigef' as const, boundaryId: b.id, tipoDeLimite: LIMITES[i], confrontanteMatricula: `${1000 + i}`, confrontanteCns: '04.567-8', confrontanteDocumento: '123.456.789-09' })),
  ]).model;
  m = applyCommand(m, { type: 'NomearVerticesDoTerreno', pontos: CANTOS, sigef: { credenciado: 'ABC1' } }).model;
  return extra(m);
}

const ID: IdentificacaoSigef = {
  ...IDENTIFICACAO_VAZIA,
  nome: 'João da Silva',
  cpfCnpj: '123.456.789-09',
  denominacao: 'Fazenda Santa Luzia',
  cns: '04.567-8',
  matricula: '12.345',
  municipio: 'Belo Horizonte-MG',
  credenciado: 'ABC1',
  responsavelTecnico: 'Eng. Maria Souza (CREA-MG 123456)',
  codigoSncr: '950.123.456.789-0',
};

describe('formato do manual', () => {
  it('GMS com espaço, 3 casas, vírgula e hemisfério', () => {
    expect(gmsSigef(-45.50719222, 'LON')).toBe('45 30 25,892 W');
    expect(gmsSigef(-34.50703167, 'LAT')).toBe('34 30 25,314 S');
    expect(gmsSigef(-19.0000001, 'LAT')).toBe('19 00 00,000 S');
  });

  it('lê de volta o GMS, o GMS com sinal e o decimal', () => {
    expect(lerCoordenadaSigef('45 30 25,892 W')).toBeCloseTo(-45.50719222, 7);
    expect(lerCoordenadaSigef('-45 30 25.892')).toBeCloseTo(-45.50719222, 7);
    expect(lerCoordenadaSigef('-45,5071922')).toBeCloseTo(-45.5071922, 7);
    expect(lerCoordenadaSigef('abc')).toBeNull();
  });

  it('precisão máxima: M 0,50; P 0,50 em LA e 3,00 em LN; V sem limite', () => {
    expect(precisaoMaximaM('M', 'LN1')).toBe(0.5);
    expect(precisaoMaximaM('P', 'LA1')).toBe(0.5);
    expect(precisaoMaximaM('P', 'LN3')).toBe(3);
    expect(precisaoMaximaM('V', 'LA1')).toBeNull();
  });
});

describe('perímetro na ordem do SIGEF', () => {
  it('horário a partir do vértice mais ao norte; o trecho que SAI do vértice leva o limite e o confrontante dele', () => {
    const p = perimetroSigef(imovel())!;
    expect(p).toBeTruthy();
    // O norte é y = 300 m. Empate entre (0,300) e (200,300): o mais a leste → (200, 300).
    expect(p.linhas.map((l) => [l.ponto.x, l.ponto.y])).toEqual([
      [200_000, 300_000],
      [200_000, 0],
      [0, 0],
      [0, 300_000],
    ]);
    // de (200,300) para (200,0) é o lado LESTE, desenhado de (200,0) a (200,300) com LA3
    expect(p.linhas[0].tipoDeLimite).toBe('LA3');
    expect(p.linhas[0].confrontante).toBe('Estrada Municipal MG-10');
    expect(p.linhas[0].azimuteGraus).toBeCloseTo(180, 0);
    expect(p.linhas[0].distanciaM).toBeCloseTo(300, 0);
    expect(p.linhas[0].longitudeTexto).toMatch(/^43 \d{2} \d{2},\d{3} W$/);
    expect(p.linhas[0].sigmaLongM).toBe(0.02);
    // área no SGL ≈ 60 000 m² (o desenho é o plano do terreno)
    expect(Math.abs(p.areaSglM2 - 60_000) / 60_000).toBeLessThan(0.002);
    expect(p.linhas.map((l) => l.codigo)).toEqual(['ABC1-M-0002', 'ABC1-P-0001', 'ABC1-M-0001', 'ABC1-P-0002']);
  });

  it('sem georreferência: null', () => {
    const m = imovel((x) => applyCommand(x, { type: 'SetGeorreferencia', georreferencia: null } as never).model);
    expect(perimetroSigef(m)).toBeNull();
    expect(validarSigef(null, ID)[0].texto).toMatch(/Sem georreferência/);
  });
});

describe('validação pelas regras do INCRA', () => {
  it('o imóvel completo passa sem ERRO', () => {
    const erros = validarSigef(perimetroSigef(imovel()), ID).filter((p) => p.gravidade === 'ERRO');
    expect(erros).toEqual([]);
  });

  it('método × tipo, sigma × limite, código fora do padrão, identificação incompleta', () => {
    const m = imovel((x) =>
      applyBatch(x, [
        { type: 'SetVerticeDoTerreno', ponto: { x: 0, y: 0 }, nome: 'P9', metodo: 'PA1' }, // PA1 só serve para V
        { type: 'SetVerticeDoTerreno', ponto: { x: 200_000, y: 0 }, nome: 'ABC1-P-0001', sigmaEMm: 800 }, // 0,80 m em LA3 > 0,50
      ]).model,
    );
    const pend = validarSigef(perimetroSigef(m), { ...ID, cpfCnpj: '123', municipio: 'Belo Horizonte' });
    const textos = pend.map((p) => `${p.onde}: ${p.texto}`).join('\n');
    expect(textos).toMatch(/P9: Código fora do padrão/);
    expect(textos).toMatch(/P9: PA1 \(Paralela\) não serve para vértice M/);
    expect(textos).toMatch(/ABC1-P-0001: Sigma de 0,80 m acima do máximo de 0,50 m para vértice P em LA/);
    expect(textos).toMatch(/CPF do detentor com 3 dígitos/);
    expect(textos).toMatch(/Município no formato/);
  });
});

describe('a planilha ODS (o modelo oficial preenchido)', () => {
  it('as abas e os parâmetros do modelo continuam; identificação e vértices nas células certas', async () => {
    const p = perimetroSigef(imovel())!;
    const ods = await planilhaOdsSigef(new Uint8Array(MODELO), ID, p, -45);
    const PizZip = (await import('pizzip')).default;
    const zip = new PizZip(ods);
    // o mimetype primeiro e sem compressão — é o que diz que é um ODS
    expect(Object.keys(zip.files)[0]).toBe('mimetype');
    expect(zip.file('mimetype')!.asText()).toBe('application/vnd.oasis.opendocument.spreadsheet');
    const doc = new DOMParser().parseFromString(zip.file('content.xml')!.asText(), 'application/xml');
    const NS = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0';
    const nomes = Array.from(doc.getElementsByTagNameNS(NS, 'table')).map((t) => t.getAttributeNS(NS, 'name'));
    expect(nomes).toEqual(['identificacao', 'perimetro_1', 'sobre', 'parametros_controles', 'parametros_vertice', 'parametros_imovel_validacao', 'parametros_vertice_validacao', 'parametros_vertice_validacao_excecao']);
    const celula = (aba: string, a1: string) => lerCelula(doc, aba, a1);
    expect(celula('identificacao', 'B6')).toBe('João da Silva');
    expect(celula('identificacao', 'B10')).toBe('Fazenda Santa Luzia');
    expect(celula('identificacao', 'B16')).toBe('Belo Horizonte-MG');
    expect(celula('perimetro_1', 'B9')).toBe('Geográfica');
    expect(celula('perimetro_1', 'F9')).toBe('Sul');
    expect(celula('perimetro_1', 'A11')).toBe('Vértice'); // o cabeçalho intacto
    expect(celula('perimetro_1', 'A12')).toBe('ABC1-M-0002');
    expect(celula('perimetro_1', 'B12')).toBe(p.linhas[0].longitudeTexto);
    expect(celula('perimetro_1', 'C12')).toBe('0,02');
    expect(celula('perimetro_1', 'H12')).toBe('PG6');
    expect(celula('perimetro_1', 'I12')).toBe('LA3');
    expect(celula('perimetro_1', 'L12')).toBe('Estrada Municipal MG-10');
    expect(celula('perimetro_1', 'A15')).toBe('ABC1-P-0002');
    expect(celula('perimetro_1', 'A16')).toBe('');
    // parâmetros do INCRA intactos
    expect(celula('parametros_vertice', 'C6')).toBe('M;P;V');
  });

  it('modelo de outra versão (sem a aba): erro dito', () => {
    expect(() => preencherContentXml('<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"/>', ID, perimetroSigef(imovel())!, -45)).toThrow(/não tem a aba "identificacao"/);
  });
});

describe('memorial, cartas, relatório e retorno', () => {
  it('memorial: começa no vértice mais ao norte, GMS com 3 casas, fecha no inicial', () => {
    const t = memorialGeoIncra(perimetroSigef(imovel())!, ID);
    expect(t).toMatch(/Inicia-se a descrição deste perímetro no vértice ABC1-M-0002, de coordenadas Longitude -43°\d{2}'\d{2},\d{3}", Latitude -19°\d{2}'\d{2},\d{3}", h 853,00 m/); // o canto (200, 300) é o 3º dos CANTOS: 850 + 2 × 1,5
    expect(t).toMatch(/confrontando com Estrada Municipal MG-10 \(estrada\), com azimute de 180°00'00" e distância de 300,0\d m/);
    expect(t).toMatch(/até o vértice ABC1-M-0002, ponto inicial da descrição deste perímetro\./);
    expect(t).toMatch(/Área \(SGL\): 6,0\d{3} ha/);
  });

  it('uma carta por confrontante, com os trechos dele', () => {
    const cartas = cartasDeAnuencia(perimetroSigef(imovel())!, ID);
    expect(cartas.map((c) => c.confrontante).sort()).toEqual([...CONFRONTANTES].sort());
    const corrego = cartas.find((c) => c.confrontante === 'Córrego do Meio')!;
    expect(corrego.texto).toMatch(/matrícula 1002 \(CNS 04\.567-8\)/);
    expect(corrego.texto).toMatch(/limite corpo d'água ou curso d'água \(LN1\)/);
  });

  it('relatório CSV: uma linha por vértice', () => {
    const csv = relatorioDeVerticesCsv(perimetroSigef(imovel())!);
    expect(csv.split('\n')).toHaveLength(5);
    expect(csv.split('\n')[1].split(';')[0]).toBe('ABC1-M-0002');
  });

  it('retorno do SIGEF: diferença em metros por vértice, e o que só existe de um lado', () => {
    const p = perimetroSigef(imovel())!;
    // o certificado moveu o 1º vértice ~1 m para o norte (1" de latitude ≈ 30,9 m → 1/30,9")
    const um = p.linhas[0];
    const texto = [
      'codigo;longitude;latitude',
      `${um.codigo};${gmsSigef(um.longitude, 'LON')};${gmsSigef(um.latitude + 1 / 111_000, 'LAT')}`,
      `${p.linhas[1].codigo};${p.linhas[1].longitudeTexto};${p.linhas[1].latitudeTexto}`,
      'XYZ9-M-0001;45 00 00,000 W;19 00 00,000 S',
    ].join('\n');
    const c = conferirRetornoSigef(texto, p);
    expect(c.diferencas).toHaveLength(2);
    expect(c.diferencas[0].dNorteM).toBeCloseTo(1, 1);
    expect(c.diferencas[1].distanciaM).toBeLessThan(0.01);
    expect(c.soNoRetorno).toEqual(['XYZ9-M-0001']);
    expect(c.soNoDesenho).toEqual([p.linhas[2].codigo, p.linhas[3].codigo]);
    expect(c.maiorM).toBeCloseTo(1, 1);
  });
});

/** Lê uma célula (A1) de uma aba, contando repetições de linha e de coluna. */
function lerCelula(doc: Document, aba: string, a1: string): string {
  const NS = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0';
  const m = a1.match(/^([A-Z]+)(\d+)$/)!;
  const col = m[1].split('').reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const lin = Number(m[2]) - 1;
  const t = Array.from(doc.getElementsByTagNameNS(NS, 'table')).find((x) => x.getAttributeNS(NS, 'name') === aba)!;
  let r = 0;
  for (const row of Array.from(t.childNodes).filter((n) => (n as Element).localName === 'table-row') as Element[]) {
    const rep = Number(row.getAttributeNS(NS, 'number-rows-repeated') || '1');
    if (lin < r + rep) {
      let c = 0;
      for (const cel of Array.from(row.childNodes).filter((n) => ['table-cell', 'covered-table-cell'].includes((n as Element).localName)) as Element[]) {
        const rc = Number(cel.getAttributeNS(NS, 'number-columns-repeated') || '1');
        if (col < c + rc) return Array.from(cel.childNodes).filter((n) => (n as Element).localName === 'p').map((n) => n.textContent).join('\n');
        c += rc;
      }
      return '';
    }
    r += rep;
  }
  return '';
}

describe('prancha no padrão INCRA', () => {
  const ENQ = { offsetXMm: 10, offsetYMm: 10, utilLarguraMm: 400, utilAlturaMm: 270 } as Enquadramento;
  const textos = (d: DesenhistaDeProva) => d.chamadas.filter((c) => c.tipo === 'texto').map((c) => String(c.args[2]));

  it('o quadro de vértices do SIGEF: códigos, GMS, limite, área no SGL e a legenda dos limites usados', () => {
    const d = new DesenhistaDeProva();
    desenharPlantaTopografica(d, imovel(), ENQ, 2.2, 'INCRA');
    const t = textos(d);
    expect(t).toContain('VÉRTICES — SIRGAS 2000');
    expect(t).toContain('ABC1-M-0002');
    expect(t.some((x) => /^43 \d{2} \d{2},\d{3} W$/.test(x))).toBe(true);
    expect(t).toContain('LA3 — Estrada');
    expect(t).toContain("LN1 — Corpo d'água ou curso d'água");
    expect(t.some((x) => /^Área \(SGL\) 6,0\d{3} ha/.test(x))).toBe(true);
    expect(t).not.toContain('ROTEIRO PERIMÉTRICO');
  });

  it('entra no conjunto de pranchas só quando pedida', () => {
    const m = imovel();
    expect(planejarConjunto(m, TEMPLATE_DE_PRANCHA_PADRAO).some((p) => p.tipo === 'INCRA')).toBe(false);
    const com = planejarConjunto(m, { ...TEMPLATE_DE_PRANCHA_PADRAO, incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, incra: true } });
    expect(com.find((p) => p.tipo === 'INCRA')?.titulo).toBe('Planta do imóvel — padrão INCRA');
  });
});
