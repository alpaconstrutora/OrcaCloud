/**
 * O leitor de DXF (07/09/2026 — Etapa 4 do roadmap BIM).
 *
 * ─── DOIS DEFEITOS QUE ESTE ARQUIVO EXISTE PARA IMPEDIR ─────────────────────
 *
 * Os dois já aconteceram enquanto eu escrevia o leitor, e os dois falharam em
 * SILÊNCIO — devolvendo um resultado plausível em vez de um erro:
 *
 *  1. **O espaço à esquerda do código de grupo.** O nosso export escreve `0`;
 *     o AutoCAD escreve `  0`. Sem aparar, o leitor devolve ZERO entidade num
 *     arquivo de 8 MB e não reclama de nada.
 *  2. **A `LINE` guarda o ponto final em 11/21**, não num segundo par 10/20.
 *     Colher só 10/20 descartou as 2.373 paredes do projeto real, e o leitor
 *     entregou as outras camadas como se fossem tudo o que havia.
 *
 * Por isso os casos abaixo usam trechos com as DUAS formatações e conferem o
 * ponto final de verdade.
 */
import { describe, expect, it } from 'vitest';
import { lerDxf } from '../utils/dxfLeitor';

/** Monta um DXF mínimo com os pares na formatação pedida. */
function dxf(pares: [string, string][], comEspaco = false): string {
  const fmt = (c: string) => (comEspaco ? c.padStart(3, ' ') : c);
  return [
    ...pares.flatMap(([c, v]) => [fmt(c), v]),
  ].join('\n');
}

const CABECALHO: [string, string][] = [
  ['0', 'SECTION'],
  ['2', 'HEADER'],
  ['9', '$INSUNITS'],
  ['70', '4'],
  ['0', 'ENDSEC'],
  ['0', 'SECTION'],
  ['2', 'ENTITIES'],
];
const RODAPE: [string, string][] = [
  ['0', 'ENDSEC'],
  ['0', 'EOF'],
];

const LINHA = (x1: string, y1: string, x2: string, y2: string, camada = 'PAREDE') =>
  [
    ['0', 'LINE'],
    ['8', camada],
    ['10', x1],
    ['20', y1],
    ['11', x2],
    ['21', y2],
  ] as [string, string][];

describe('DXF · o formato', () => {
  it.each([
    ['sem espaço no código (nosso export)', false],
    ['com espaço no código (AutoCAD)', true],
  ])('lê %s', (_rotulo, comEspaco) => {
    // ⚠️ O caso 2 é o que devolvia ZERO entidade no arquivo cheio, sem erro.
    const r = lerDxf(dxf([...CABECALHO, ...LINHA('0', '0', '1000', '0'), ...RODAPE], comEspaco));
    expect(r.segmentos).toHaveLength(1);
    expect(r.segmentos[0]).toEqual({
      camada: 'PAREDE',
      a: { x: 0, y: 0 },
      b: { x: 1000, y: 0 },
    });
  });

  it('a LINE usa 11/21 para o ponto final — e é isso que se confere', () => {
    // Se o leitor lesse um segundo par 10/20, este caso devolveria nada.
    const r = lerDxf(dxf([...CABECALHO, ...LINHA('10', '20', '30', '40'), ...RODAPE]));
    expect(r.segmentos[0].a).toEqual({ x: 10, y: 20 });
    expect(r.segmentos[0].b).toEqual({ x: 30, y: 40 });
  });

  it('lê o CRLF do Windows sem sujar o valor', () => {
    const texto = dxf([...CABECALHO, ...LINHA('0', '0', '5', '0'), ...RODAPE]).replace(
      /\n/g,
      '\r\n',
    );
    expect(lerDxf(texto).segmentos[0].camada).toBe('PAREDE');
  });

  it('arquivo sem seção ENTITIES não quebra', () => {
    expect(lerDxf('0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF').segmentos).toEqual([]);
  });
});

describe('DXF · as formas', () => {
  it('LWPOLYLINE vira um segmento por lado, e fecha quando o desenho diz', () => {
    const aberta: [string, string][] = [
      ['0', 'LWPOLYLINE'],
      ['8', 'X'],
      ['70', '0'],
      ['10', '0'],
      ['20', '0'],
      ['10', '100'],
      ['20', '0'],
      ['10', '100'],
      ['20', '100'],
    ];
    expect(lerDxf(dxf([...CABECALHO, ...aberta, ...RODAPE])).segmentos).toHaveLength(2);

    const fechada = aberta.map(([c, v]) => (c === '70' ? (['70', '1'] as [string, string]) : [c, v] as [string, string]));
    expect(lerDxf(dxf([...CABECALHO, ...fechada, ...RODAPE])).segmentos).toHaveLength(3);
  });

  it('POLYLINE + VERTEX vira o mesmo que a LWPOLYLINE', () => {
    // O nosso próprio export usa esta forma. Sem o tratamento do SEQEND, os
    // vértices ficariam pendurados na entidade seguinte.
    const pares: [string, string][] = [
      ['0', 'POLYLINE'],
      ['8', 'PLANTA-PAREDES'],
      ['70', '1'],
      ['0', 'VERTEX'],
      ['10', '0'],
      ['20', '0'],
      ['0', 'VERTEX'],
      ['10', '100'],
      ['20', '0'],
      ['0', 'VERTEX'],
      ['10', '100'],
      ['20', '50'],
      ['0', 'SEQEND'],
    ];
    const r = lerDxf(dxf([...CABECALHO, ...pares, ...RODAPE]));
    expect(r.segmentos).toHaveLength(3);
    expect(r.segmentos.every((s) => s.camada === 'PLANTA-PAREDES')).toBe(true);
  });

  it('ARCO e CÍRCULO são LIDOS como arcos (centro, raio, ângulos) — não viram parede, viram símbolo (P2.33)', () => {
    // O kernel não tem parede curva, e retificar mudaria a área do ambiente em
    // silêncio. Mas o arco é o giro da folha de porta: 38 deles na camada
    // PORTAS do projeto real. Por isso sai em `arcos`, não em `recusas`.
    const curvas: [string, string][] = [
      ['0', 'ARC'],
      ['8', 'PORTAS'],
      ['10', '100'],
      ['20', '200'],
      ['40', '800'],
      ['50', '0'],
      ['51', '90'],
      ['0', 'CIRCLE'],
      ['8', 'PAREDE'],
      ['10', '0'],
      ['20', '0'],
      ['40', '50'],
    ];
    const r = lerDxf(dxf([...CABECALHO, ...curvas, ...RODAPE]));
    expect(r.segmentos).toEqual([]);
    expect(r.recusas).toEqual([]);
    expect(r.arcos).toEqual([
      { camada: 'PORTAS', centro: { x: 100, y: 200 }, raio: 800, anguloInicial: 0, anguloFinal: 90 },
      { camada: 'PAREDE', centro: { x: 0, y: 0 }, raio: 50, anguloInicial: 0, anguloFinal: 360 },
    ]);
    expect(r.porCamada.find((c) => c.camada === 'PORTAS')).toEqual({ camada: 'PORTAS', segmentos: 0, arcos: 1, comprimento: 0 });
  });

  it('elipse e spline continuam recusadas, e a recusa não corta nome de camada COM ESPAÇO', () => {
    // "LINHA DE CORTE" e "VEÍCULOS - VAGAS" são camadas reais do projeto da
    // empresa. Separar a chave por espaço entregaria "LINHA" como camada.
    const r = lerDxf(
      dxf([...CABECALHO, ['0', 'SPLINE'], ['8', 'LINHA DE CORTE'], ['10', '0'], ['0', 'ELLIPSE'], ['8', 'X'], ...RODAPE]),
    );
    expect(r.recusas).toEqual([
      { camada: 'LINHA DE CORTE', tipo: 'SPLINE', quantas: 1 },
      { camada: 'X', tipo: 'ELLIPSE', quantas: 1 },
    ]);
  });
});

describe('DXF · blocos (P2.33)', () => {
  /** Um bloco "PORTA" com uma reta de (0,0) a (100,0) e um arco de raio 100 de 0° a 90°, base (0,0). */
  const BLOCOS: [string, string][] = [
    ['0', 'SECTION'],
    ['2', 'BLOCKS'],
    ['0', 'BLOCK'],
    ['8', '0'],
    ['2', 'PORTA'],
    ['10', '0'],
    ['20', '0'],
    ['0', 'LINE'],
    ['8', '0'],
    ['10', '0'],
    ['20', '0'],
    ['11', '100'],
    ['21', '0'],
    ['0', 'ARC'],
    ['8', 'FOLHA'],
    ['10', '0'],
    ['20', '0'],
    ['40', '100'],
    ['50', '0'],
    ['51', '90'],
    ['0', 'ENDBLK'],
    ['0', 'ENDSEC'],
  ];
  const INSERT = (nome: string, x: number, y: number, extra: [string, string][] = [], camada = 'ESQUADRIAS'): [string, string][] => [
    ['0', 'INSERT'],
    ['8', camada],
    ['2', nome],
    ['10', String(x)],
    ['20', String(y)],
    ...extra,
  ];
  const arredonda = (p: { x: number; y: number }) => ({ x: Math.round(p.x), y: Math.round(p.y) });

  it('INSERT expande o bloco na posição, com escala 2 e giro de 90°; a camada 0 herda a do INSERT e o nome do bloco vai junto', () => {
    const texto = dxf([
      ['0', 'SECTION'], ['2', 'HEADER'], ['9', '$INSUNITS'], ['70', '4'], ['0', 'ENDSEC'],
      ...BLOCOS,
      ['0', 'SECTION'], ['2', 'ENTITIES'],
      ...INSERT('PORTA', 1000, 500, [['41', '2'], ['42', '2'], ['50', '90']]),
      ...RODAPE,
    ]);
    const r = lerDxf(texto);
    expect(r.blocosExpandidos).toBe(1);
    expect(r.recusas).toEqual([]);
    // A reta (0,0)→(100,0), escalada por 2 e girada 90°, vai de (1000,500) a (1000,700).
    expect(r.segmentos).toHaveLength(1);
    expect(r.segmentos[0].camada).toBe('ESQUADRIAS');
    expect(r.segmentos[0].bloco).toBe('PORTA');
    expect(arredonda(r.segmentos[0].a)).toEqual({ x: 1000, y: 500 });
    expect(arredonda(r.segmentos[0].b)).toEqual({ x: 1000, y: 700 });
    // O arco: raio 200, de 90° a 180°, camada própria preservada.
    expect(r.arcos).toHaveLength(1);
    expect(r.arcos[0]).toMatchObject({ camada: 'FOLHA', raio: 200, bloco: 'PORTA' });
    expect(arredonda(r.arcos[0].centro)).toEqual({ x: 1000, y: 500 });
    expect(Math.round(r.arcos[0].anguloInicial)).toBe(90);
    expect(Math.round(r.arcos[0].anguloFinal)).toBe(180);
  });

  it('espelhado (escala X negativa) inverte o sentido do arco, e as pontas trocam', () => {
    const r = lerDxf(dxf([...BLOCOS, ['0', 'SECTION'], ['2', 'ENTITIES'], ...INSERT('PORTA', 0, 0, [['41', '-1']]), ...RODAPE]));
    // O arco 0°→90° espelhado em X vai de 90° a 180° (anti-horário, como o DXF exige).
    expect(Math.round(r.arcos[0].anguloInicial)).toBe(90);
    expect(Math.round(r.arcos[0].anguloFinal)).toBe(180);
    expect(arredonda(r.segmentos[0].b)).toEqual({ x: -100, y: 0 });
  });

  it('INSERT de bloco que não existe vai para as recusas; bloco anônimo (*D…, cota) é ignorado sem alarde', () => {
    const r = lerDxf(dxf([...BLOCOS, ['0', 'SECTION'], ['2', 'ENTITIES'], ...INSERT('JANELA-120', 0, 0), ...INSERT('*D12', 0, 0), ...RODAPE]));
    expect(r.recusas).toEqual([{ camada: 'ESQUADRIAS', tipo: 'INSERT', quantas: 1 }]);
    expect(r.blocosExpandidos).toBe(0);
    expect(r.segmentos).toEqual([]);
  });

  it('bloco dentro de bloco compõe as duas transformações', () => {
    const aninhado: [string, string][] = [
      ['0', 'SECTION'], ['2', 'BLOCKS'],
      ['0', 'BLOCK'], ['8', '0'], ['2', 'RETA'], ['10', '0'], ['20', '0'],
      ['0', 'LINE'], ['8', '0'], ['10', '0'], ['20', '0'], ['11', '10'], ['21', '0'],
      ['0', 'ENDBLK'],
      ['0', 'BLOCK'], ['8', '0'], ['2', 'PAR'], ['10', '0'], ['20', '0'],
      ['0', 'INSERT'], ['8', '0'], ['2', 'RETA'], ['10', '0'], ['20', '0'],
      ['0', 'INSERT'], ['8', '0'], ['2', 'RETA'], ['10', '0'], ['20', '5'],
      ['0', 'ENDBLK'],
      ['0', 'ENDSEC'],
    ];
    const r = lerDxf(dxf([...aninhado, ['0', 'SECTION'], ['2', 'ENTITIES'], ...INSERT('PAR', 100, 100, [['50', '90']], 'MOB'), ...RODAPE]));
    expect(r.blocosExpandidos).toBe(3);
    expect(r.segmentos.map((s) => [s.camada, s.bloco, arredonda(s.a), arredonda(s.b)])).toEqual([
      ['MOB', 'PAR', { x: 100, y: 100 }, { x: 100, y: 110 }],
      ['MOB', 'PAR', { x: 95, y: 100 }, { x: 95, y: 110 }],
    ]);
  });
});

describe('DXF · camadas e unidade', () => {
  it('conta segmentos e comprimento por camada — é o que a tela oferece', () => {
    const r = lerDxf(
      dxf([
        ...CABECALHO,
        ...LINHA('0', '0', '300', '0', 'PAREDE'),
        ...LINHA('0', '0', '400', '0', 'PAREDE'),
        ...LINHA('0', '0', '100', '0', 'COTAS'),
        ...RODAPE,
      ]),
    );
    expect(r.porCamada[0]).toEqual({ camada: 'PAREDE', segmentos: 2, arcos: 0, comprimento: 700 });
    expect(r.porCamada[1].camada).toBe('COTAS');
  });

  it('lê o $INSUNITS — como SUGESTÃO, e o produto sabe que ele mente', () => {
    const r = lerDxf(dxf([...CABECALHO, ...LINHA('0', '0', '1', '0'), ...RODAPE]));
    expect(r.mmPorUnidadeDeclarado).toBe(1);
  });
});
