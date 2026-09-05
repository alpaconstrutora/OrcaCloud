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

import {
  planoDaAgua,
  type Agua,
  FORMA_ESTRUTURAL,
  contornoEmPlanta,
  isFreeWallEnd,
  nomeDoTipoEstrutural,
  wallLength,
  type BlueprintModel,
  type Structural,
  type Wall,
} from './blueprintKernel';
import { AFASTAMENTO_COTA, AVISO_COTA_POR_FACE, cadeiasDoModelo, pontoDaCota } from './blueprintCotas';
import type { ProjecaoElevacao } from './blueprintElevation';
import type { ProjecaoCorte } from './blueprintCorte';

/** Camadas previsíveis. Nome estável é o que permite filtrar e plotar por camada. */
export const CAMADAS = {
  PAREDES: 'PLANTA-PAREDES',
  EIXOS: 'PLANTA-EIXOS',
  AMBIENTES: 'PLANTA-AMBIENTES',
  ABERTURAS: 'PLANTA-ABERTURAS',
  TEXTO: 'PLANTA-TEXTO',
  COTAS: 'PLANTA-COTAS',
  /**
   * ESTRUTURA e FUNDAÇÃO em camadas SEPARADAS, e não uma "PLANTA-ESTRUTURAL".
   *
   * Quem recebe o DXF plota fôrmas e fundação em pranchas diferentes — são
   * etapas de obra diferentes, com equipes diferentes. Numa camada só, separar
   * as duas viraria seleção manual peça a peça no CAD.
   */
  ESTRUTURA: 'PLANTA-ESTRUTURA',
  FUNDACAO: 'PLANTA-FUNDACAO',
  /**
   * TELHADO em camada própria: em planta ele cobre tudo, e quem plota a
   * planta de arquitetura desliga a cobertura para ler os ambientes.
   */
  TELHADO: 'PLANTA-TELHADO',
  /**
   * As INTERFACES entre camadas da parede — uma linha por junta, ao longo do
   * eixo, dentro do sólido que `PLANTA-PAREDES` já desenha.
   *
   * Camada própria porque nem todo destinatário quer ver a composição: em
   * prancha de locação ela vira ruído, e desligar uma camada no CAD é um clique.
   *
   * ⚠️ UMA camada para todas as composições, e não uma por material. `CAMADAS` é
   * uma constante fechada; camada nascida de dado do usuário deixaria o DXF com
   * uma tabela de layers diferente a cada planta, e o destinatário perderia
   * justamente a previsibilidade que o comentário no topo deste bloco promete.
   */
  PAREDES_CAMADAS: 'PLANTA-PAREDES-CAMADAS',
  ELEV_PAREDES: 'ELEVACAO-PAREDES',
  ELEV_ABERTURAS: 'ELEVACAO-ABERTURAS',
  ELEV_SOLO: 'ELEVACAO-SOLO',
  ELEV_ESTRUTURA: 'ELEVACAO-ESTRUTURA',
  ELEV_TELHADO: 'ELEVACAO-TELHADO',

  /**
   * CORTE em camadas PRÓPRIAS, e não reaproveitando as de elevação.
   *
   * Num corte, o que o plano atravessa e o que está atrás dele têm pesos de
   * traço diferentes — é isso que faz o desenho se ler como corte. Na mesma
   * camada, quem plota escolheria uma espessura só e perderia a distinção que
   * justifica o desenho.
   *
   * A MARCA em planta é outra camada ainda: ela pertence à planta baixa, não ao
   * corte, e quem plota a planta de locação quer poder desligá-la.
   */
  CORTE_MARCA: 'PLANTA-CORTE',
  CORTE_PAREDES: 'CORTE-PAREDES',
  CORTE_ESTRUTURA: 'CORTE-ESTRUTURA',
  CORTE_TELHADO: 'CORTE-TELHADO',
  CORTE_ABERTURAS: 'CORTE-ABERTURAS',
} as const;

/** Cor por índice ACI, como o R12 espera. */
const COR_CAMADA: Record<string, number> = {
  [CAMADAS.PAREDES]: 7, // preto/branco
  [CAMADAS.EIXOS]: 1, // vermelho
  [CAMADAS.AMBIENTES]: 3, // verde
  [CAMADAS.ABERTURAS]: 5, // azul
  [CAMADAS.TEXTO]: 2, // amarelo
  [CAMADAS.COTAS]: 8, // cinza
  [CAMADAS.ESTRUTURA]: 6, // magenta — concreto, distinto do preto da alvenaria
  [CAMADAS.FUNDACAO]: 4, // ciano
  [CAMADAS.PAREDES_CAMADAS]: 8, // cinza — juntas internas, subordinadas ao contorno
  [CAMADAS.ELEV_PAREDES]: 7,
  [CAMADAS.ELEV_ABERTURAS]: 5,
  [CAMADAS.ELEV_SOLO]: 8,
  [CAMADAS.ELEV_ESTRUTURA]: 6,
  // Telhado em laranja (ACI 30): a cor de telha de todo padrão de prancha.
  [CAMADAS.TELHADO]: 30,
  [CAMADAS.ELEV_TELHADO]: 30,
  [CAMADAS.CORTE_MARCA]: 1, // vermelho — a marca chama, como no papel
  [CAMADAS.CORTE_PAREDES]: 7,
  [CAMADAS.CORTE_ESTRUTURA]: 6,
  [CAMADAS.CORTE_TELHADO]: 30,
  [CAMADAS.CORTE_ABERTURAS]: 5,
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

/**
 * Círculo de verdade — R12 tem a entidade `CIRCLE`.
 *
 * Existe para a peça de seção redonda (estaca escavada, pilar circular). O
 * quadrado envolvente que `contornoEmPlanta` devolve serve ao acerto do cursor
 * e à silhueta em elevação; num DXF ele seria MEDIDO por quem recebe, e a área
 * sairia 27% maior. Aqui a geometria é o produto.
 */
function circulo(camada: string, c: Ponto, raio: number): string {
  return (
    par(0, 'CIRCLE') +
    par(8, camada) +
    par(10, num(c.x)) +
    par(20, num(c.y)) +
    par(30, num(0)) +
    par(40, num(raio))
  );
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

/**
 * As linhas de INTERFACE entre as camadas de uma parede.
 *
 * São N−1 linhas paralelas ao eixo, uma por junta, com a mesma extensão de canto
 * que `retanguloDaParede` aplica — herdar a extensão é o que faz as juntas
 * morrerem exatamente na face do contorno já desenhado, em vez de pararem antes
 * e deixarem um degrau visível no canto.
 *
 * Vazio na parede homogênea: não há junta nenhuma para desenhar.
 */
export function juntasDasCamadas(
  model: BlueprintModel,
  w: Wall,
): { a: Ponto; b: Ponto }[] {
  if (!w.camadas || w.camadas.length < 2) return [];

  const comp = wallLength(w);
  if (comp === 0) return [];

  const ux = (w.b.x - w.a.x) / comp;
  const uy = (w.b.y - w.a.y) / comp;
  const nx = -uy;
  const ny = ux;
  const meia = w.thicknessMm / 2;

  const extA = isFreeWallEnd(model.walls, w.a, w.id) ? 0 : meia;
  const extB = isFreeWallEnd(model.walls, w.b, w.id) ? 0 : meia;
  const a = { x: w.a.x - ux * extA, y: w.a.y - uy * extA };
  const b = { x: w.b.x + ux * extB, y: w.b.y + uy * extB };

  // A composição é gravada da face ESQUERDA para a DIREITA do sentido `a → b`, e
  // a normal `(-uy, ux)` aponta para a esquerda — então o percurso começa em
  // `+meia` e desce. Sair de `-meia` desenharia as juntas espelhadas, o que só
  // se notaria numa composição assimétrica.
  const juntas: { a: Ponto; b: Ponto }[] = [];
  let desloc = meia;
  for (const c of w.camadas.slice(0, -1)) {
    desloc -= c.espessuraMm;
    juntas.push({
      a: { x: a.x + nx * desloc, y: a.y + ny * desloc },
      b: { x: b.x + nx * desloc, y: b.y + ny * desloc },
    });
  }
  return juntas;
}

/**
 * Uma peça estrutural em planta: o contorno, e o rótulo com a seção.
 *
 * Camada por PROFUNDIDADE (`baseMm < 0` = fundação), não por tipo: é assim que
 * a prancha se separa na obra. Um baldrame e um bloco vão juntos porque são a
 * mesma etapa, mesmo sendo formas geométricas diferentes.
 */
function entidadesDeEstrutura(s: Structural): string {
  const camada = s.baseMm < 0 ? CAMADAS.FUNDACAO : CAMADAS.ESTRUTURA;
  const anel = contornoEmPlanta(s);
  if (anel.length === 0) return '';

  let saida = '';
  if (s.circular && FORMA_ESTRUTURAL[s.kind] === 'PONTO') {
    saida += circulo(camada, s.pontos[0], s.larguraMm / 2);
  } else {
    saida += polilinha(camada, anel);
  }

  // O rótulo carrega a SEÇÃO junto do nome, porque o DXF não guarda a altura
  // nem a cota: sem isso, quem abre o arquivo vê um retângulo 20×40 e não tem
  // como saber se é um pilar de 2,80 m ou um bloco de 60 cm.
  const cx = anel.reduce((t, p) => t + p.x, 0) / anel.length;
  const cy = anel.reduce((t, p) => t + p.y, 0) / anel.length;
  const cm = (mm: number) => (mm / 10).toFixed(0);
  const secao =
    FORMA_ESTRUTURAL[s.kind] === 'AREA'
      ? `e=${cm(s.alturaMm)}`
      : s.circular
        ? `D${cm(s.larguraMm)}`
        : `${cm(s.larguraMm)}x${cm(
            FORMA_ESTRUTURAL[s.kind] === 'LINHA' ? s.alturaMm : s.profundidadeMm,
          )}`;
  const nome = s.rotulo ? `${s.rotulo} ${secao}` : `${nomeDoTipoEstrutural(s.kind)} ${secao}`;
  saida += texto(CAMADAS.TEXTO, { x: cx, y: cy }, nome, 160);
  return saida;
}

/**
 * A ÁGUA em planta: o contorno em `PLANTA-TELHADO` e o rótulo da inclinação.
 *
 * O DXF não guarda cota nem inclinação, então o rótulo carrega o "30%" — sem
 * ele, quem abre o arquivo vê um polígono e não sabe se é laje ou telhado. A
 * seta de caimento sai como uma LINE do centro para o beiral, pela mesma razão
 * que o canvas a desenha: é a única coisa que diz para onde a água escorre.
 */
function entidadesDeAgua(r: Agua): string {
  if (r.pontos.length < 3) return '';
  let saida = polilinha(CAMADAS.TELHADO, r.pontos);

  const plano = planoDaAgua(r);
  const cx = r.pontos.reduce((t, p) => t + p.x, 0) / r.pontos.length;
  const cy = r.pontos.reduce((t, p) => t + p.y, 0) / r.pontos.length;
  // Contra a normal interna = para o beiral. 600 mm de seta, em mm reais.
  const ponta = { x: cx - plano.n.x * 600, y: cy - plano.n.y * 600 };
  saida += linha(CAMADAS.TELHADO, { x: cx, y: cy }, ponta);
  saida += texto(CAMADAS.TEXTO, { x: cx, y: cy }, `TELHADO ${r.inclinacaoPct}%`, 160);
  return saida;
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
  elevacoes?: (ProjecaoElevacao | ProjecaoCorte)[];
}

/**
 * Geometria de uma vista em coordenada (u, v), deslocada por `offsetX`.
 *
 * Serve às DUAS: elevação e corte compartilham os mesmos campos, e o corte só
 * acrescenta o que o plano atravessa. Uma segunda função divergiria da primeira
 * na primeira correção de camada.
 */
function entidadesDeElevacao(proj: ProjecaoElevacao | ProjecaoCorte, offsetX: number): string {
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
  for (const e of proj.estruturas) {
    if (e.degenerada) continue;
    saida += polilinha(CAMADAS.ELEV_ESTRUTURA, [
      P(e.uMin, e.vMin),
      P(e.uMax, e.vMin),
      P(e.uMax, e.vMax),
      P(e.uMin, e.vMax),
    ]);
  }
  // TELHADO como POLÍGONO — o único item que não é retângulo na elevação,
  // porque é inclinado. Os vértices já vêm na ordem da água.
  for (const t of proj.telhados ?? []) {
    if (t.degenerada) continue;
    saida += polilinha(
      CAMADAS.ELEV_TELHADO,
      t.pontos.map((q) => P(q.u, q.v)),
    );
  }
  for (const a of proj.aberturas) {
    saida += polilinha(CAMADAS.ELEV_ABERTURAS, [
      P(a.uMin, a.vMin),
      P(a.uMax, a.vMin),
      P(a.uMax, a.vMax),
      P(a.uMin, a.vMax),
    ]);
  }
  // ── O QUE O PLANO CORTA ───────────────────────────────────────────────────
  //
  // Depois de tudo, porque no DXF a ordem das entidades é a ordem de pintura em
  // muitos leitores — e a face cortada está por definição à frente do que a
  // vista mostra.
  if ('cortados' in proj) {
    for (const c of proj.cortados) {
      saida += polilinha(
        c.familia === 'TELHADO'
          ? CAMADAS.CORTE_TELHADO
          : c.familia === 'ESTRUTURA'
            ? CAMADAS.CORTE_ESTRUTURA
            : CAMADAS.CORTE_PAREDES,
        c.pontos.map((q) => P(q.u, q.v)),
      );
      for (const v of c.vaos) {
        saida += polilinha(CAMADAS.CORTE_ABERTURAS, [
          P(v.uMin, v.vMin),
          P(v.uMax, v.vMin),
          P(v.uMax, v.vMax),
          P(v.uMin, v.vMax),
        ]);
      }
    }
  }

  saida += texto(
    CAMADAS.TEXTO,
    P(proj.bbox.uMin, proj.bbox.vMin - 400),
    'cortados' in proj
      ? `CORTE ${proj.rotulo}`
      : `ELEVACAO ${ROTULO_ELEVACAO[proj.direcao] ?? proj.direcao}`,
    200,
  );
  return saida;
}

/**
 * A MARCA do corte na planta baixa: a linha, as setas e a letra nas duas pontas.
 *
 * Sem ela o DXF traria o desenho do corte sem dizer por onde ele passa — e onde
 * o plano corta é metade da informação. Quem recebe o arquivo tem de conseguir
 * responder "corte AA é onde?" sem abrir o sistema que o gerou.
 */
function entidadesDeMarcaDeCorte(model: BlueprintModel): string {
  let saida = '';
  for (const c of model.sections ?? []) {
    const dx = c.b.x - c.a.x;
    const dy = c.b.y - c.a.y;
    const comp = Math.hypot(dx, dy) || 1;
    const t = { x: dx / comp, y: dy / comp };
    // A normal do lado para onde se olha — a mesma convenção de `baseDoCorte`.
    const d =
      c.olharPara === 'ESQUERDA' ? { x: -t.y, y: t.x } : { x: t.y, y: -t.x };

    saida += linha(CAMADAS.CORTE_MARCA, c.a, c.b);
    for (const ponta of [c.a, c.b]) {
      const cabo = { x: ponta.x + d.x * 700, y: ponta.y + d.y * 700 };
      saida += linha(CAMADAS.CORTE_MARCA, ponta, cabo);
      saida += texto(
        CAMADAS.TEXTO,
        { x: cabo.x + d.x * 200 - 120, y: cabo.y + d.y * 200 - 120 },
        c.rotulo,
        250,
      );
    }
  }
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
    for (const junta of juntasDasCamadas(model, w)) {
      dxf += linha(CAMADAS.PAREDES_CAMADAS, junta.a, junta.b);
    }
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

  for (const s of model.structures ?? []) {
    dxf += entidadesDeEstrutura(s);
  }
  for (const r of model.roofs ?? []) {
    dxf += entidadesDeAgua(r);
  }

  if (o.cotas) dxf += entidadesDeCota(model);

  // A marca sai SEMPRE que houver corte desenhado, mesmo que a vista do
  // corte não tenha sido pedida: ela é informação da planta, e uma planta
  // que esconde por onde o corte passa é uma planta incompleta.
  dxf += entidadesDeMarcaDeCorte(model);

  // Elevações, uma após a outra à direita da planta. O passo entre elas é a
  // largura da mais larga mais uma folga, para não se sobreporem.
  if (o.elevacoes?.length) {
    // As ESTRUTURAS entram na conta do afastamento: uma laje em balanço passa
    // da última parede, e sem ela a primeira elevação nasceria por cima da
    // planta.
    const xs = [
      ...model.walls.flatMap((w) => [w.a.x, w.b.x]),
      ...(model.structures ?? []).flatMap((s) => contornoEmPlanta(s).map((p) => p.x)),
      // O beiral avança além da última parede: sem ele aqui, a primeira
      // elevação nasceria por cima da ponta do telhado.
      ...(model.roofs ?? []).flatMap((r) => r.pontos.map((p) => p.x)),
    ];
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
  'Estrutura: contorno em planta por peça, em PLANTA-ESTRUTURA (acima do piso) e PLANTA-FUNDACAO (abaixo). Seção redonda sai como CIRCLE, não como quadrado.',
  'Telhado: contorno de cada água em PLANTA-TELHADO (inclui o beiral), com seta de caimento e rótulo da inclinação em PLANTA-TEXTO. O DXF não guarda a cota nem a inclinação — só o rótulo as declara.',
  'O rótulo da peça traz a seção em cm; a ALTURA e a COTA não estão na geometria 2D — só na elevação e no IFC.',
  'Elevações (quando incluídas): polígono por parede no plano (u, v), deslocadas para a DIREITA da planta, camadas ELEVACAO-*; o telhado sai como polígono inclinado em ELEVACAO-TELHADO. Sem remoção de linha oculta.',
  'Marca de corte: a linha, o cabo e a letra de cada corte saem SEMPRE em PLANTA-CORTE, mesmo sem a vista pedida — a planta tem de dizer por onde o plano passa.',
  'Cortes (quando incluídos): o que o plano atravessa sai em camadas CORTE-* (paredes, estrutura, telhado e os vãos), separadas das ELEVACAO-* para que se possa plotar o corte com traço mais grosso que a vista. O DXF não carrega espessura de traço por si: quem plota escolhe por camada.',
  'Não exporta: materiais, hachuras, blocos, mobiliário, armadura ou cotas como entidade DIMENSION.',
];
