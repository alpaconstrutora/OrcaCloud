/**
 * RF-126 — exportar DXF em camadas previsíveis e unidades explícitas.
 *
 * ─── DXF É 1:1, EM MILÍMETRO REAL ───────────────────────────────────────────
 *
 * Escala é assunto de PAPEL. No CAD o desenho vive em unidades do mundo, e é a
 * prancha que define 1:50 na hora de plotar. Exportar DXF "em 1:100" — dividindo
 * as coordenadas — produziria um arquivo em que uma parede de 4 m mede 4 cm, e
 * toda medição feita nele sairia errada por duas ordens de grandeza.
 *
 * Por isso `$INSUNITS = 4` (milímetro) vai no cabeçalho: unidade EXPLÍCITA é
 * metade do requisito. Sem ela o AutoCAD assume o que estiver configurado na
 * máquina de quem abre, e a mesma geometria vira metro ou polegada.
 *
 * ─── R12 ASCII, DE PROPÓSITO ────────────────────────────────────────────────
 *
 * É a versão que TODO programa lê — AutoCAD, BricsCAD, QCAD, LibreCAD,
 * Illustrator. Versões novas trazem entidades melhores e leitores piores. Para
 * geometria de planta baixa (linha, polilinha, texto) o R12 não deixa nada de
 * fora, e o arquivo é texto puro: dá para conferir com o olho e para testar por
 * igualdade de string, sem depender de biblioteca.
 *
 * ─── PAREDE SAI COMO SÓLIDO NÃO APARADO, E ISSO É DECLARADO ─────────────────
 *
 * Cada parede vira um retângulo fechado — o material que realmente existe. Nas
 * junções os retângulos SE SOBREPÕEM, como num desenho antes do aparo. Não é
 * erro: é geometria honesta. Aparar exige decidir prioridade entre paredes num
 * encontro, que é escolha de projeto, não de exportação — e aparar errado
 * apagaria material de verdade.
 *
 * O eixo vai junto, em camada própria: é dele que se reeditam as paredes.
 */

import { isFreeWallEnd, wallLength, type BlueprintModel, type Wall } from './blueprintKernel';
import { AFASTAMENTO_COTA, AVISO_COTA_POR_FACE, cadeiasDoModelo, pontoDaCota } from './blueprintCotas';
import type { ProjecaoElevacao } from './blueprintElevation';

/** Camadas previsíveis. Nome estável é o que permite filtrar e plotar por camada. */
export const CAMADAS = {
  PAREDES: 'PLANTA-PAREDES',
  EIXOS: 'PLANTA-EIXOS',
  AMBIENTES: 'PLANTA-AMBIENTES',
  ABERTURAS: 'PLANTA-ABERTURAS',
  TEXTO: 'PLANTA-TEXTO',
  COTAS: 'PLANTA-COTAS',
  ELEV_PAREDES: 'ELEVACAO-PAREDES',
  ELEV_ABERTURAS: 'ELEVACAO-ABERTURAS',
  ELEV_SOLO: 'ELEVACAO-SOLO',
} as const;

/** Cor por índice ACI, como o R12 espera. */
const COR_CAMADA: Record<string, number> = {
  [CAMADAS.PAREDES]: 7, // preto/branco
  [CAMADAS.EIXOS]: 1, // vermelho
  [CAMADAS.AMBIENTES]: 3, // verde
  [CAMADAS.ABERTURAS]: 5, // azul
  [CAMADAS.TEXTO]: 2, // amarelo
  [CAMADAS.COTAS]: 8, // cinza
  [CAMADAS.ELEV_PAREDES]: 7,
  [CAMADAS.ELEV_ABERTURAS]: 5,
  [CAMADAS.ELEV_SOLO]: 8,
};

const ROTULO_ELEVACAO: Record<string, string> = {
  FRENTE: 'FRENTE',
  FUNDOS: 'FUNDOS',
  LATERAL_DIREITA: 'LATERAL DIREITA',
  LATERAL_ESQUERDA: 'LATERAL ESQUERDA',
};

type Ponto = { x: number; y: number };

/** Par código/valor do DXF. O formato é literalmente isto, uma linha cada. */
function par(codigo: number, valor: string | number): string {
  return `${codigo}\n${valor}\n`;
}

/**
 * Número no formato do DXF.
 *
 * Sem notação exponencial: `1e-7` é sintaticamente válido em muitos leitores e
 * quebra em outros. Milímetro com 4 casas cobre qualquer planta sem inflar o
 * arquivo.
 */
function num(v: number): string {
  return v.toFixed(4);
}

function linha(camada: string, a: Ponto, b: Ponto): string {
  return (
    par(0, 'LINE') +
    par(8, camada) +
    par(10, num(a.x)) +
    par(20, num(a.y)) +
    par(30, num(0)) +
    par(11, num(b.x)) +
    par(21, num(b.y)) +
    par(31, num(0))
  );
}

/** Polilinha FECHADA — o R12 exige a sequência POLYLINE / VERTEX* / SEQEND. */
function polilinha(camada: string, pontos: Ponto[]): string {
  if (pontos.length < 2) return '';
  let saida =
    par(0, 'POLYLINE') + par(8, camada) + par(66, 1) + par(70, 1); // 1 = fechada
  for (const p of pontos) {
    saida +=
      par(0, 'VERTEX') + par(8, camada) + par(10, num(p.x)) + par(20, num(p.y)) + par(30, num(0));
  }
  return saida + par(0, 'SEQEND') + par(8, camada);
}

function texto(camada: string, p: Ponto, conteudo: string, alturaMm: number): string {
  return (
    par(0, 'TEXT') +
    par(8, camada) +
    par(10, num(p.x)) +
    par(20, num(p.y)) +
    par(30, num(0)) +
    par(40, num(alturaMm)) +
    par(1, conteudo)
  );
}

/** Os quatro cantos do sólido da parede, já com as pontas estendidas nas junções. */
export function retanguloDaParede(model: BlueprintModel, w: Wall): Ponto[] {
  const comp = wallLength(w);
  if (comp === 0) return [];

  const ux = (w.b.x - w.a.x) / comp;
  const uy = (w.b.y - w.a.y) / comp;
  // Normal unitária.
  const nx = -uy;
  const ny = ux;
  const meia = w.thicknessMm / 2;

  // Mesma regra do desenho: estende onde encontra outra parede, não estende na
  // ponta livre — ali a parede ficaria mais longa do que é.
  const extA = isFreeWallEnd(model.walls, w.a, w.id) ? 0 : meia;
  const extB = isFreeWallEnd(model.walls, w.b, w.id) ? 0 : meia;

  const a = { x: w.a.x - ux * extA, y: w.a.y - uy * extA };
  const b = { x: w.b.x + ux * extB, y: w.b.y + uy * extB };

  return [
    { x: a.x + nx * meia, y: a.y + ny * meia },
    { x: b.x + nx * meia, y: b.y + ny * meia },
    { x: b.x - nx * meia, y: b.y - ny * meia },
    { x: a.x - nx * meia, y: a.y - ny * meia },
  ];
}

export interface OpcoesDxf {
  titulo: string;
  revisao: number;
  hash: string;
  cotas?: boolean;
  /**
   * Elevações a incluir, cada uma como um bloco de geometria (u, v) deslocado
   * para a DIREITA da planta. É a convenção de prancha — elevação não é planta
   * baixa, então elas não compartilham espaço de coordenada com a planta.
   */
  elevacoes?: ProjecaoElevacao[];
}

/** Geometria de uma elevação em coordenada (u, v), deslocada por `offsetX`. */
function entidadesDeElevacao(proj: ProjecaoElevacao, offsetX: number): string {
  const dx = offsetX - proj.bbox.uMin;
  const bv = proj.bbox.vMin;
  const P = (u: number, v: number) => ({ x: u + dx, y: v - bv });
  let saida = '';

  saida += linha(
    CAMADAS.ELEV_SOLO,
    P(proj.bbox.uMin, proj.linhaDoSolo.v),
    P(proj.bbox.uMax, proj.linhaDoSolo.v),
  );

  for (const p of proj.paredes) {
    if (p.degenerada) continue;
    saida += polilinha(CAMADAS.ELEV_PAREDES, [
      P(p.uMin, p.vMin),
      P(p.uMax, p.vMin),
      P(p.uMax, p.vMax),
      P(p.uMin, p.vMax),
    ]);
  }
  for (const a of proj.aberturas) {
    saida += polilinha(CAMADAS.ELEV_ABERTURAS, [
      P(a.uMin, a.vMin),
      P(a.uMax, a.vMin),
      P(a.uMax, a.vMax),
      P(a.uMin, a.vMax),
    ]);
  }
  saida += texto(
    CAMADAS.TEXTO,
    P(proj.bbox.uMin, proj.bbox.vMin - 400),
    `ELEVACAO ${ROTULO_ELEVACAO[proj.direcao] ?? proj.direcao}`,
    200,
  );
  return saida;
}

/**
 * Gera o DXF completo, como string.
 *
 * Devolver string e não arquivo é o que permite testar por conteúdo — contar
 * entidades, conferir a unidade, achar a camada. Teste de exportação binária
 * costuma virar comparação de bytes que ninguém sabe interpretar quando falha.
 */
export function gerarDxf(model: BlueprintModel, o: OpcoesDxf): string {
  const camadas = Object.values(CAMADAS);

  // ── HEADER: a unidade explícita que o requisito cobra ─────────────────────
  let dxf =
    par(0, 'SECTION') +
    par(2, 'HEADER') +
    par(9, '$ACADVER') +
    par(1, 'AC1009') + // R12
    par(9, '$INSUNITS') +
    par(70, 4) + // 4 = milímetro
    par(9, '$MEASUREMENT') +
    par(70, 1) + // 1 = métrico
    par(0, 'ENDSEC');

  // ── TABLES: as camadas, declaradas ────────────────────────────────────────
  dxf +=
    par(0, 'SECTION') + par(2, 'TABLES') + par(0, 'TABLE') + par(2, 'LAYER') + par(70, camadas.length);
  for (const c of camadas) {
    dxf += par(0, 'LAYER') + par(2, c) + par(70, 0) + par(62, COR_CAMADA[c] ?? 7) + par(6, 'CONTINUOUS');
  }
  dxf += par(0, 'ENDTAB') + par(0, 'ENDSEC');

  // ── ENTITIES ──────────────────────────────────────────────────────────────
  dxf += par(0, 'SECTION') + par(2, 'ENTITIES');

  for (const w of model.walls) {
    const r = retanguloDaParede(model, w);
    if (r.length === 4) dxf += polilinha(CAMADAS.PAREDES, r);
    dxf += linha(CAMADAS.EIXOS, w.a, w.b);
  }

  for (const b of model.boundaries) {
    dxf += linha(CAMADAS.AMBIENTES, b.a, b.b);
  }

  for (const s of model.spaces) {
    dxf += polilinha(CAMADAS.AMBIENTES, s.ring);
    const cx = s.ring.reduce((soma, p) => soma + p.x, 0) / s.ring.length;
    const cy = s.ring.reduce((soma, p) => soma + p.y, 0) / s.ring.length;
    if (s.name) dxf += texto(CAMADAS.TEXTO, { x: cx, y: cy }, s.name, 200);
    dxf += texto(
      CAMADAS.TEXTO,
      { x: cx, y: cy - 250 },
      `${(s.areaMm2 / 1_000_000).toFixed(2).replace('.', ',')} m2`,
      160,
    );
  }

  // Abertura: as duas bordas do vão, atravessando a parede. É o suficiente para
  // o CAD saber onde ela está sem inventar bloco de porta que o modelo não tem.
  for (const abertura of model.openings) {
    const w = model.walls.find((x) => x.id === abertura.wallId);
    if (!w) continue;
    const comp = wallLength(w);
    if (comp === 0) continue;
    const ux = (w.b.x - w.a.x) / comp;
    const uy = (w.b.y - w.a.y) / comp;
    const nx = -uy;
    const ny = ux;
    const meia = w.thicknessMm / 2;

    for (const d of [abertura.offsetMm, abertura.offsetMm + abertura.widthMm]) {
      const cx = w.a.x + ux * d;
      const cy = w.a.y + uy * d;
      dxf += linha(
        CAMADAS.ABERTURAS,
        { x: cx + nx * meia, y: cy + ny * meia },
        { x: cx - nx * meia, y: cy - ny * meia },
      );
    }
  }

  if (o.cotas) dxf += entidadesDeCota(model);

  // Elevações, uma após a outra à direita da planta. O passo entre elas é a
  // largura da mais larga mais uma folga, para não se sobreporem.
  if (o.elevacoes?.length) {
    const xs = model.walls.flatMap((w) => [w.a.x, w.b.x]);
    let offsetX = (xs.length ? Math.max(...xs) : 0) + 3000;
    const passo =
      Math.max(...o.elevacoes.map((p) => p.bbox.uMax - p.bbox.uMin), 1) + 3000;
    for (const proj of o.elevacoes) {
      dxf += entidadesDeElevacao(proj, offsetX);
      offsetX += passo;
    }
  }

  dxf += par(0, 'ENDSEC') + par(0, 'EOF');
  return dxf;
}

/**
 * Cotas como LINE + TEXT, não como entidade DIMENSION.
 *
 * DIMENSION exige um DIMSTYLE completo e um bloco de geometria associado; se
 * qualquer detalhe divergir, o leitor mostra a cota fora do lugar ou nada. Linha
 * mais texto abre em qualquer programa e diz exatamente o que se vê no PDF — que
 * é o que importa: cota que diverge entre o papel e o CAD é pior que cota
 * nenhuma.
 */
function entidadesDeCota(model: BlueprintModel): string {
  let saida = '';

  // Afastamentos em mm REAIS — no CAD tudo é 1:1. Proporcionais ao tamanho da
  // planta para não sumirem numa casa grande nem dominarem numa pequena.
  const escala = Math.max(500, ...model.walls.map((w) => wallLength(w))) / 10;
  const PASSO = escala * 0.8;
  const FOLGA = escala * 0.6;
  const ALTURA = escala * 0.35;

  for (const c of cadeiasDoModelo(model)) {
    const desenhar = (
      segmentos: { de: number; ate: number; rotulo: string }[],
      nivel: number,
    ) => {
      const afasta = FOLGA + PASSO * nivel;
      for (const seg of segmentos) {
        const a = pontoDaCota(c.lado, seg.de, afasta);
        const b = pontoDaCota(c.lado, seg.ate, afasta);
        saida += linha(CAMADAS.COTAS, a, b);
        // Texto no meio, empurrado mais um pouco para fora para não montar na
        // linha. Sem rotação: o DXF guardaria o ângulo, mas o leitor que abre
        // com estilo próprio pode ignorá-lo, e número deitado é legível.
        const meio = pontoDaCota(
          c.lado,
          (seg.de + seg.ate) / 2,
          afasta + ALTURA * 0.4,
        );
        saida += texto(CAMADAS.COTAS, meio, seg.rotulo, ALTURA);
      }
    };

    desenhar(c.aberturas, AFASTAMENTO_COTA.aberturas - 1);
    desenhar(c.internas, AFASTAMENTO_COTA.internas - 1);
    desenhar(c.parcial, AFASTAMENTO_COTA.parcial - 1);
    desenhar([c.total], AFASTAMENTO_COTA.total - 1);
  }

  return saida;
}

/**
 * O que o DXF representa e o que não representa.
 *
 * Vai junto do arquivo. Quem recebe um DXF de origem desconhecida não tem como
 * saber se a ausência de porta significa "não tem porta" ou "não foi exportada"
 * — e as duas levam a decisões opostas.
 */
export const COBERTURA_DXF = [
  'Unidade: MILÍMETRO, declarada em $INSUNITS. O desenho está em 1:1 — a escala é da prancha.',
  'Paredes: sólido fechado por parede, NÃO APARADO nas junções (os retângulos se sobrepõem).',
  'Eixos: em camada própria, para reeditar as paredes.',
  'Ambientes: polígono do EIXO das paredes, não do piso acabado.',
  'Aberturas: apenas as bordas do vão. Não há bloco de porta nem de janela.',
  AVISO_COTA_POR_FACE,
  'Elevações (quando incluídas): polígono por parede no plano (u, v), deslocadas para a DIREITA da planta, camadas ELEVACAO-*. Sem remoção de linha oculta, sem telhado.',
  'Não exporta: materiais, hachuras, blocos, mobiliário ou cotas como entidade DIMENSION.',
];
