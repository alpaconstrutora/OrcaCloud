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

import { desenharIncendio } from './blueprintPranchaIncendio';
import { desenharClimatizacao } from './blueprintPranchaClimatizacao';
import { COR_DA_DISCIPLINA } from './blueprintRede';
import { nomesDasColunas } from './blueprintEsquemaVertical';
import { desenharHidrossanitaria, type RedeDaPrancha } from './blueprintPranchaHidro';
import { type Anotacao,
  planoDaAgua,
  type Agua,
  FORMA_ESTRUTURAL,
  contornoEmPlanta,
  isFreeWallEnd,
  nomeDoTipoEstrutural,
  wallLength,
  type BlueprintModel,
  type Point,
  type Structural,
  type Wall,
} from './blueprintKernel';
import {
  AFASTAMENTO_COTA,
  AVISO_COTA_POR_FACE,
  anelDoLoteFechado,
  cadeiasDoContorno,
  detalhesDoLote,
  cadeiasPorLado,
  chamadasDoLado,
  LINHA_DE_CHAMADA,
  larguraEstimadaDoTexto,
  ondeFicaORotulo,
  alcanceAlemDoLado,
  deslocamentoDaCadeiaDoLote,
  referencialDoLado,
  pontoDaCota,
  type LadoDoContorno,
  type SegmentoDeCota,
} from './blueprintCotas';
import { contornoDaNuvem, posicaoDaEtiquetaDaNuvem, cotaAngularDesenhada, linhasDaHachura, pontaDaSeta } from './blueprintAnotacoes';
import type { ProjecaoElevacao } from './blueprintElevation';
import type { ProjecaoCorte } from './blueprintCorte';
import { contornoDaEscada, degrausDaEscada } from './blueprintKernel';

/** Camadas previsíveis. Nome estável é o que permite filtrar e plotar por camada. */
export const CAMADAS = {
  /**
   * TOPOGRAFIA em camadas próprias, no MESMO espaço de coordenada da planta
   * (mm do desenho): a curva cai sobre o lote no CAD sem alinhar nada à mão.
   * Mestra separada da intermediária porque quem plota dá espessura diferente
   * às duas — é a convenção de toda planta topográfica.
   */
  TOPO_CURVA: 'TOPO-CURVA',
  TOPO_MESTRA: 'TOPO-MESTRA',
  TOPO_PONTO: 'TOPO-PONTO',
  TOPO_TEXTO: 'TOPO-TEXTO',
  /** Drenagem traçada e muros de arrimo (fase 8): sobre a planta, no mesmo mm. */
  TOPO_DRENAGEM: 'TOPO-DRENAGEM',
  TOPO_MURO: 'TOPO-MURO',
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
   * EIXOS DA MALHA (07/10/2026): A, B… / 1, 2…, com a bolha nas pontas. NÃO é `PLANTA-EIXOS`, que é o eixo de cada
   * PAREDE: quem plota a fôrma liga a malha e desliga o resto.
   */
  MALHA_EIXOS: 'PLANTA-MALHA-EIXOS',
  /** O ENVELOPE recuado (10/10/2026): o que sobra do lote depois dos recuos da zona e das faixas de restrição. */
  ENVELOPE: 'PLANTA-ENVELOPE',
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
  /** ANOTAÇÕES (E8.1): texto, leader, linha, hachura e cota angular — planta e vistas, mesma camada. */
  ANOTACOES: 'PLANTA-ANOTACOES',
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
  /**
   * ESCADA em camada própria nas três vistas. Em planta ela se sobrepõe ao
   * piso do ambiente e à laje; quem plota a locação a desliga, quem plota a
   * arquitetura a deixa. Camada compartilhada com a estrutura misturaria a
   * pedra com o concreto no mesmo traço.
   */
  ESCADA: 'PLANTA-ESCADA',
  ELEV_ESCADA: 'ELEVACAO-ESCADA',
  CORTE_ESCADA: 'CORTE-ESCADA',
  /**
   * ELÉTRICA (F8, 13/09/2026) em duas camadas: os símbolos e eletrodutos, e
   * os textos (sigla · circuito, Ø, #seção, potência). Quem plota a
   * arquitetura desliga as duas; quem plota a elétrica plota as duas.
   */
  ELETRICA: 'PLANTA-ELETRICA',
  ELETRICA_TEXTO: 'PLANTA-ELETRICA-TEXTO',
  /**
   * E5.1 (29/09/2026): a elétrica separada em ILUMINAÇÃO e FORÇA — cada
   * elemento numa camada só (o comum — quadro, caixa, eletroduto compartilhado
   * — fica em PLANTA-ELETRICA). Tudo ligado = a planta unificada.
   */
  ELETRICA_ILUMINACAO: 'PLANTA-ELETRICA-ILUMINACAO',
  ELETRICA_ILUMINACAO_TEXTO: 'PLANTA-ELETRICA-ILUMINACAO-TEXTO',
  ELETRICA_FORCA: 'PLANTA-ELETRICA-FORCA',
  ELETRICA_FORCA_TEXTO: 'PLANTA-ELETRICA-FORCA-TEXTO',
  /**
   * HIDROSSANITÁRIO (E2.1, 28/09/2026): a rede de água (fria e quente) e a de
   * esgoto, cada uma com a camada dos rótulos (ø, i %, siglas) à parte.
   */
  AGUA: 'PLANTA-AGUA',
  AGUA_TEXTO: 'PLANTA-AGUA-TEXTO',
  /** E8.1: a rede e as peças de incêndio, e os números/DN. */
  INCENDIO: 'PLANTA-INCENDIO',
  INCENDIO_TEXTO: 'PLANTA-INCENDIO-TEXTO',
  /** E8.1 da climatização (07/10/2026): linha frigorígena, dreno e dutos, cada um na sua camada; peças e rótulos em -TEXTO. */
  CLIMA_LINHA: 'PLANTA-CLIMA-LINHA',
  CLIMA_DRENO: 'PLANTA-CLIMA-DRENO',
  CLIMA_DUTO: 'PLANTA-CLIMA-DUTO',
  CLIMA_TEXTO: 'PLANTA-CLIMA-TEXTO',
  ESGOTO: 'PLANTA-ESGOTO',
  ESGOTO_TEXTO: 'PLANTA-ESGOTO-TEXTO',
  /**
   * O DIAGRAMA UNIFILAR (E4.5, 29/09/2026): traçado e textos em camadas
   * próprias, à direita da planta — quem plota a planta desliga as duas.
   */
  UNIFILAR: 'UNIFILAR',
  UNIFILAR_TEXTO: 'UNIFILAR-TEXTO',
} as const;

/** Cor por índice ACI, como o R12 espera. */
const COR_CAMADA: Record<string, number> = {
  [CAMADAS.TOPO_CURVA]: 33, // marrom claro
  [CAMADAS.TOPO_MESTRA]: 32, // marrom
  [CAMADAS.TOPO_PONTO]: 5, // azul
  [CAMADAS.TOPO_TEXTO]: 32,
  [CAMADAS.TOPO_DRENAGEM]: 4, // ciano
  [CAMADAS.TOPO_MURO]: 8, // cinza escuro
  [CAMADAS.PAREDES]: 7, // preto/branco
  [CAMADAS.EIXOS]: 1, // vermelho
  [CAMADAS.AMBIENTES]: 3, // verde
  [CAMADAS.ABERTURAS]: 5, // azul
  [CAMADAS.TEXTO]: 2, // amarelo
  [CAMADAS.COTAS]: 8, // cinza
  [CAMADAS.MALHA_EIXOS]: 9, // cinza claro
  [CAMADAS.ENVELOPE]: 30, // laranja
  [CAMADAS.ANOTACOES]: 30, // laranja
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
  [CAMADAS.ESCADA]: 9, // cinza claro — pedra, distinto do magenta do concreto
  [CAMADAS.ELEV_ESCADA]: 9,
  [CAMADAS.CORTE_ESCADA]: 9,
  [CAMADAS.ELETRICA]: 2, // amarelo — a cor da elétrica no canvas
  [CAMADAS.ELETRICA_TEXTO]: 2,
  [CAMADAS.ELETRICA_ILUMINACAO]: 30, // laranja — luz
  [CAMADAS.ELETRICA_ILUMINACAO_TEXTO]: 30,
  [CAMADAS.ELETRICA_FORCA]: 1, // vermelho — força
  [CAMADAS.ELETRICA_FORCA_TEXTO]: 1,
  [CAMADAS.AGUA]: 5, // azul — a cor da água no canvas
  [CAMADAS.AGUA_TEXTO]: 5,
  [CAMADAS.INCENDIO]: 30,
  [CAMADAS.INCENDIO_TEXTO]: 30,
  [CAMADAS.CLIMA_LINHA]: 6, // magenta — o roxo da linha no canvas
  [CAMADAS.CLIMA_DRENO]: 4, // ciano
  [CAMADAS.CLIMA_DUTO]: 3, // verde
  [CAMADAS.CLIMA_TEXTO]: 7,
  [CAMADAS.ESGOTO]: 32, // marrom — a convenção de esgoto em prancha
  [CAMADAS.ESGOTO_TEXTO]: 32,
  [CAMADAS.UNIFILAR]: 7,
  [CAMADAS.UNIFILAR_TEXTO]: 2,
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
/** Polilinha ABERTA — a curva de nível que termina na divisa não fecha. */
function polilinhaAberta(camada: string, pontos: Ponto[]): string {
  if (pontos.length < 2) return '';
  let saida = par(0, 'POLYLINE') + par(8, camada) + par(66, 1) + par(70, 0);
  for (const p of pontos) {
    saida +=
      par(0, 'VERTEX') + par(8, camada) + par(10, num(p.x)) + par(20, num(p.y)) + par(30, num(0));
  }
  return saida + par(0, 'SEQEND') + par(8, camada);
}

/** As entidades da topografia: curvas, cotas nas mestras e pontos cotados. */
export interface TopografiaParaDxf {
  curvas: { cotaM: number; mestra: boolean; fechada: boolean; pontos: Ponto[] }[];
  pontosCotados: { x: number; y: number; cotaM: number; nome?: string }[];
  /** A2: as linhas das feições do levantamento (cerca, muro, meio-fio…), cada uma na sua camada `LEV-*`. */
  feicoes?: { camada: string; pontos: Ponto[] }[];
  /** Fase 8: linhas de drenagem (no sentido do escoamento) e muros de arrimo (a aresta e a normal para fora). */
  drenagem?: { nome: string; pontos: Ponto[] }[];
  muros?: { a: Ponto; b: Ponto; normal: Ponto }[];
}

function entidadesDaTopografia(t: TopografiaParaDxf): string {
  let saida = '';
  for (const d of t.drenagem ?? []) {
    if (d.pontos.length < 2) continue;
    saida += polilinhaAberta(CAMADAS.TOPO_DRENAGEM, d.pontos);
    // Seta no meio do último trecho: para onde a água vai.
    const a = d.pontos[d.pontos.length - 2];
    const b = d.pontos[d.pontos.length - 1];
    const comp = Math.hypot(b.x - a.x, b.y - a.y);
    if (comp > 0) {
      const ux = (b.x - a.x) / comp;
      const uy = (b.y - a.y) / comp;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = 250;
      saida += linha(CAMADAS.TOPO_DRENAGEM, { x: m.x + ux * r, y: m.y + uy * r }, { x: m.x - ux * r - uy * r * 0.6, y: m.y - uy * r + ux * r * 0.6 });
      saida += linha(CAMADAS.TOPO_DRENAGEM, { x: m.x + ux * r, y: m.y + uy * r }, { x: m.x - ux * r + uy * r * 0.6, y: m.y - uy * r - ux * r * 0.6 });
    }
    saida += texto(CAMADAS.TOPO_TEXTO, { x: d.pontos[0].x + 150, y: d.pontos[0].y + 150 }, d.nome, 160);
  }
  for (const m of t.muros ?? []) {
    saida += linha(CAMADAS.TOPO_MURO, m.a, m.b);
    // "Dentes" curtos para o lado do terreno contido — a convenção do muro em planta.
    const comp = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y);
    for (let s = 300; s < comp; s += 600) {
      const t0 = s / comp;
      const p = { x: m.a.x + (m.b.x - m.a.x) * t0, y: m.a.y + (m.b.y - m.a.y) * t0 };
      saida += linha(CAMADAS.TOPO_MURO, p, { x: p.x + m.normal.x * 300, y: p.y + m.normal.y * 300 });
    }
  }
  for (const c of t.curvas) {
    const camada = c.mestra ? CAMADAS.TOPO_MESTRA : CAMADAS.TOPO_CURVA;
    saida += c.fechada ? polilinha(camada, c.pontos.slice(0, -1)) : polilinhaAberta(camada, c.pontos);
    if (c.mestra && c.pontos.length > 1) {
      const m = c.pontos[Math.floor(c.pontos.length / 2)];
      saida += texto(CAMADAS.TOPO_TEXTO, m, c.cotaM.toFixed(2), 200);
    }
  }
  for (const p of t.pontosCotados) {
    const r = 150;
    saida += linha(CAMADAS.TOPO_PONTO, { x: p.x - r, y: p.y }, { x: p.x + r, y: p.y });
    saida += linha(CAMADAS.TOPO_PONTO, { x: p.x, y: p.y - r }, { x: p.x, y: p.y + r });
    saida += texto(CAMADAS.TOPO_TEXTO, { x: p.x + r * 1.3, y: p.y + r * 1.3 }, p.cotaM.toFixed(2), 160);
    // A2: o nome do ponto (o do caderno de campo) embaixo da cota.
    if (p.nome) saida += texto(CAMADAS.TOPO_TEXTO, { x: p.x + r * 1.3, y: p.y - r * 1.3 - 160 }, p.nome, 120);
  }
  for (const f of t.feicoes ?? []) saida += polilinhaAberta(f.camada, f.pontos);
  return saida;
}

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

import type { Desenhista } from './blueprintExport';
import type { HipotesesEletricas } from './blueprintEletricaDimensionamento';
import { desenharEletrica, linhasDoQuadroDeCargas } from './blueprintPranchaEletrica';
import { bolhasDosEixos, crescerFaixa, faixaVazia, type FaixaDasCotas } from './blueprintEixosAutomaticos';
import { caixaDoDesenho } from './blueprintExport';
import { desenharUnifilar, desenharUnifilarEmArvore, medidasDoUnifilar, montarUnifilar, rodapeDoUnifilar, temHierarquia } from './blueprintUnifilar';

export interface OpcoesDxf {
  titulo: string;
  revisao: number;
  hash: string;
  cotas?: boolean;
  /** EIXOS DA MALHA (07/10/2026) em `PLANTA-MALHA-EIXOS`; ausente = sim (o padrão da tela). */
  eixos?: boolean;
  /**
   * ENVELOPE RECUADO por pavimento (10/10/2026, `envelopesParaExportacao`): em `PLANTA-ENVELOPE` e repartindo as cotas
   * do lote. Ausente = sem recuo.
   */
  envelopes?: Map<string, Point[][]>;
  /**
   * Elevações a incluir, cada uma como um bloco de geometria (u, v) deslocado
   * para a DIREITA da planta. É a convenção de prancha — elevação não é planta
   * baixa, então elas não compartilham espaço de coordenada com a planta.
   */
  elevacoes?: (ProjecaoElevacao | ProjecaoCorte)[];
  /** Curvas de nível e pontos cotados, nas camadas `TOPO-*`, sobre a planta. */
  topografia?: TopografiaParaDxf;
  /** F8: símbolos elétricos em PLANTA-ELETRICA e o quadro de cargas em texto, abaixo da planta. */
  eletrica?: boolean;
  hipotesesEletricas?: HipotesesEletricas;
  /** E2.1: as redes hidrossanitárias a desenhar, cada uma nas suas camadas `PLANTA-AGUA*` / `PLANTA-ESGOTO*`. */
  redes?: RedeDaPrancha[];
  /** E8.1: o incêndio inteiro (rede, hidrantes, sprinklers, preventivo) em `PLANTA-INCENDIO*`. */
  incendio?: boolean;
  /** E8.1 da climatização: linha, dreno e dutos em `PLANTA-CLIMA-*`. */
  climatizacao?: boolean;
}

/**
 * DXF SÓ da topografia — para quem quer as curvas num arquivo à parte, no
 * mesmo mm do desenho (cai por cima do DXF da planta no CAD). Mesmas camadas,
 * mesmo escritor: um segundo escritor divergiria do primeiro na primeira
 * correção.
 */
export function gerarDxfDaTopografia(
  t: TopografiaParaDxf,
  anel: Ponto[],
  o: { titulo: string; versao: number; aviso: string },
): string {
  const camadas = [
    CAMADAS.TOPO_CURVA,
    CAMADAS.TOPO_MESTRA,
    CAMADAS.TOPO_PONTO,
    CAMADAS.TOPO_TEXTO,
    CAMADAS.TOPO_DRENAGEM,
    CAMADAS.TOPO_MURO,
    CAMADAS.AMBIENTES,
    // A2: uma camada por feição presente — quem abre no CAD liga e desliga cerca, muro, meio-fio.
    ...new Set((t.feicoes ?? []).map((f) => f.camada)),
  ];
  let dxf =
    par(999, `${o.titulo} - curvas de nivel v${o.versao} - unidades: mm; cota em m`) +
    par(999, o.aviso) +
    par(0, 'SECTION') +
    par(2, 'HEADER') +
    par(9, '$ACADVER') +
    par(1, 'AC1009') +
    par(9, '$INSUNITS') +
    par(70, 4) +
    par(9, '$MEASUREMENT') +
    par(70, 1) +
    par(0, 'ENDSEC');
  // `CONTINUOUS` declarado (10/10/2026): toda camada o usa, e leitor estrito recusa tipo de linha não definido.
  dxf += par(0, 'SECTION') + par(2, 'TABLES') + tabelaDeTiposDeLinha(500);
  dxf += par(0, 'TABLE') + par(2, 'LAYER') + par(70, camadas.length);
  for (const c of camadas) {
    dxf += par(0, 'LAYER') + par(2, c) + par(70, 0) + par(62, COR_CAMADA[c] ?? 7) + par(6, 'CONTINUOUS');
  }
  dxf += par(0, 'ENDTAB') + par(0, 'ENDSEC');
  dxf += par(0, 'SECTION') + par(2, 'ENTITIES');
  if (anel.length >= 3) dxf += polilinha(CAMADAS.AMBIENTES, anel);
  dxf += entidadesDaTopografia(t);
  dxf += par(0, 'ENDSEC') + par(0, 'EOF');
  return dxf;
}

/**
 * Geometria de uma vista em coordenada (u, v), deslocada por `offsetX`.
 *
 * Serve às DUAS: elevação e corte compartilham os mesmos campos, e o corte só
 * acrescenta o que o plano atravessa. Uma segunda função divergiria da primeira
 * na primeira correção de camada.
 */
/**
 * ANOTAÇÕES (E8.1) como entidades DXF: TEXT, LINE, POLYLINE fechada + linhas
 * da hachura, e a cota angular como as duas retas + o arco em POLYLINE aberta
 * + TEXT do ângulo. `P` leva o ponto da vista ao mm do arquivo. A geometria é
 * a de `blueprintAnotacoes.ts` — a mesma da tela e do PDF.
 */
function entidadesDeAnotacoes(anotacoes: readonly Anotacao[], P: (p: Ponto) => Ponto): string {
  let saida = '';
  for (const a of anotacoes) {
    const alt = a.alturaMm;
    switch (a.tipo) {
      case 'TEXTO':
        (a.texto ?? '').split('\n').forEach((l, i) => {
          saida += texto(CAMADAS.ANOTACOES, P({ x: a.pontos[0].x, y: a.pontos[0].y - i * alt * 1.25 }), l, alt);
        });
        break;
      case 'LEADER': {
        for (let i = 1; i < a.pontos.length; i++) saida += linha(CAMADAS.ANOTACOES, P(a.pontos[i - 1]), P(a.pontos[i]));
        const [w1, w2] = pontaDaSeta(a.pontos[1], a.pontos[0], alt);
        saida += polilinha(CAMADAS.ANOTACOES, [P(a.pontos[0]), P(w1), P(w2)]);
        const fim = a.pontos[a.pontos.length - 1];
        (a.texto ?? '').split('\n').forEach((l, i) => {
          saida += texto(CAMADAS.ANOTACOES, P({ x: fim.x + alt * 0.4, y: fim.y - i * alt * 1.25 }), l, alt);
        });
        break;
      }
      case 'LINHA':
        saida += polilinhaAberta(CAMADAS.ANOTACOES, a.pontos.map(P));
        break;
      case 'HACHURA': {
        saida += polilinha(CAMADAS.ANOTACOES, a.pontos.map(P));
        for (const [p, q] of linhasDaHachura(a.pontos, a.hachura ?? 'DIAGONAL', alt)) saida += linha(CAMADAS.ANOTACOES, P(p), P(q));
        if (a.texto) {
          const cx = a.pontos.reduce((s, p) => s + p.x, 0) / a.pontos.length;
          const cy = a.pontos.reduce((s, p) => s + p.y, 0) / a.pontos.length;
          saida += texto(CAMADAS.ANOTACOES, P({ x: Math.round(cx), y: Math.round(cy) }), a.texto, alt);
        }
        break;
      }
      case 'NUVEM': {
        saida += polilinha(CAMADAS.ANOTACOES, contornoDaNuvem(a.pontos, alt).map(P));
        const e = posicaoDaEtiquetaDaNuvem(a.pontos, alt);
        saida += texto(CAMADAS.ANOTACOES, P(e), `Δ${a.revisao?.numero ?? ''}${a.texto ? ' ' + a.texto : ''}`, alt);
        break;
      }
      case 'COTA_ANGULAR': {
        saida += linha(CAMADAS.ANOTACOES, P(a.pontos[0]), P(a.pontos[1]));
        saida += linha(CAMADAS.ANOTACOES, P(a.pontos[0]), P(a.pontos[2]));
        const c = cotaAngularDesenhada(a);
        if (c) {
          saida += polilinhaAberta(CAMADAS.ANOTACOES, c.arco.map(P));
          saida += texto(CAMADAS.ANOTACOES, P(c.posicaoDoRotulo), c.rotulo, alt);
        }
        break;
      }
      default:
        break;
    }
  }
  return saida;
}

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
  // ESCADA E RAMPA: uma polilinha fechada por fatia, na ordem de subida.
  for (const e of proj.escadas ?? []) {
    if (e.degenerada) continue;
    for (const fatia of e.fatias) {
      if (fatia.length < 3) continue;
      saida += polilinha(
        CAMADAS.ELEV_ESCADA,
        fatia.map((q) => P(q.u, q.v)),
      );
    }
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
            : c.familia === 'ESCADA'
              ? CAMADAS.CORTE_ESCADA
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
 * A escada em planta: o contorno da pegada, um traço por espelho e a seta de
 * subida do primeiro ao último. A rampa sai sem os espelhos, com a inclinação
 * escrita — é o que a distingue no papel.
 *
 * Sem a quebra a 45° da planta de tela: no DXF quem recebe corta o desenho
 * onde quiser, e uma quebra gravada esconderia degraus que o CAD dele pode
 * precisar mostrar.
 */
function entidadesDeEscada(model: BlueprintModel): string {
  let saida = '';
  for (const e of model.stairs ?? []) {
    const contorno = contornoDaEscada(e);
    if (contorno.length < 3) continue;
    saida += polilinha(CAMADAS.ESCADA, contorno);
    for (const d of degrausDaEscada(model, e)) {
      saida += linha(CAMADAS.ESCADA, d.a, d.b);
    }
    // A seta de subida pelo eixo, do primeiro ao último ponto.
    for (let i = 0; i + 1 < e.pontos.length; i++) {
      saida += linha(CAMADAS.ESCADA, e.pontos[i], e.pontos[i + 1]);
    }
    const fim = e.pontos[e.pontos.length - 1];
    saida += texto(
      CAMADAS.TEXTO,
      { x: fim.x + 150, y: fim.y + 150 },
      e.tipo === 'RAMPA' ? 'SOBE (RAMPA)' : 'SOBE',
      160,
    );
  }
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
    par(9, '$LTSCALE') +
    par(40, num(1)) + // o padrão do traço-ponto já vem em mm reais (`tabelaDeTiposDeLinha`)
    par(0, 'ENDSEC');

  // ── TABLES: os tipos de linha e as camadas, declarados ────────────────────
  dxf += par(0, 'SECTION') + par(2, 'TABLES') + tabelaDeTiposDeLinha(escalaDoDxf(model));
  dxf += par(0, 'TABLE') + par(2, 'LAYER') + par(70, camadas.length);
  for (const c of camadas) {
    dxf += par(0, 'LAYER') + par(2, c) + par(70, 0) + par(62, COR_CAMADA[c] ?? 7) + par(6, c === CAMADAS.MALHA_EIXOS ? 'EIXO' : 'CONTINUOUS');
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

  // Topografia logo depois das divisas: é o chão, e vem antes do que se
  // constrói sobre ele — a mesma ordem do canvas.
  if (o.topografia) dxf += entidadesDaTopografia(o.topografia);

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

  // As cotas antes dos eixos (08/10/2026): a bolha do eixo fica por fora da faixa que as cotas ocuparam.
  for (const pecas of o.envelopes?.values() ?? []) for (const peca of pecas) dxf += polilinha(CAMADAS.ENVELOPE, peca);
  const faixaDasCotas = faixaVazia();
  if (o.cotas) dxf += entidadesDeCota(model, faixaDasCotas, o.envelopes);
  // A bolha fora do desenho inteiro (10/10/2026, pendência 8): cotas ∪ a caixa do desenho sem os eixos.
  const caixa = caixaDoDesenho(model);
  if (caixa) crescerFaixa(faixaDasCotas, { x: caixa.minX, y: caixa.minY }, { x: caixa.maxX, y: caixa.maxY });
  if (o.eixos !== false) dxf += entidadesDosEixosDaMalha(model, Number.isFinite(faixaDasCotas.minX) ? faixaDasCotas : null);
  // ANOTAÇÕES (E8.1) da planta, no mm do desenho.
  dxf += entidadesDeAnotacoes((model.anotacoes ?? []).filter((a) => a.vista.tipo === 'PLANTA'), (p) => ({ x: p.x, y: p.y }));

  // A marca sai SEMPRE que houver corte desenhado, mesmo que a vista do
  // corte não tenha sido pedida: ela é informação da planta, e uma planta
  // que esconde por onde o corte passa é uma planta incompleta.
  dxf += entidadesDeMarcaDeCorte(model);
  dxf += entidadesDeEscada(model);
  if (o.eletrica) dxf += entidadesDeEletrica(model, o.hipotesesEletricas);
  for (const rede of o.redes ?? []) dxf += entidadesDaRedeHidro(model, rede);
  if (o.incendio) dxf += entidadesDeIncendio(model);
  if (o.climatizacao) dxf += entidadesDeClimatizacao(model);

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
      // As anotações desta vista (E8.1), no mesmo deslocamento do bloco.
      const daVista = (model.anotacoes ?? []).filter((a) =>
        'corteId' in proj ? a.vista.tipo === 'CORTE' && a.vista.corteId === proj.corteId : a.vista.tipo === 'ELEVACAO' && a.vista.direcao === proj.direcao,
      );
      const dxV = offsetX - proj.bbox.uMin;
      const bv = proj.bbox.vMin;
      dxf += entidadesDeAnotacoes(daVista, (p) => ({ x: p.x + dxV, y: p.y - bv }));
      offsetX += passo;
    }
  }

  dxf += par(0, 'ENDSEC') + par(0, 'EOF');
  return dxf;
}

/**
 * A ELÉTRICA no DXF (F8): o MESMO desenho da prancha em papel, passado por um
 * `Desenhista` que escreve LINE/POLYLINE/TEXT em mm REAIS.
 *
 * ─── O TRUQUE DO Y ─────────────────────────────────────────────────────────
 *
 * O desenhista do papel trabalha com Y para BAIXO; o DXF, com Y para CIMA.
 * Projeta-se o modelo num espaço "de papel" (py = −y), desenha-se ali, e o
 * adaptador desfaz o sinal ao escrever cada entidade. Sem isto o triângulo
 * da tomada sairia espelhado e o rótulo "embaixo" cairia em cima.
 *
 * Os tamanhos de símbolo são de PAPEL; a 1:1 seriam invisíveis. Entram
 * multiplicados por 50 — a prancha elétrica residencial se plota a 1:50 — e
 * a cobertura diz isso.
 */
function entidadesDeEletrica(model: BlueprintModel, hip?: HipotesesEletricas): string {
  let saida = '';
  const FATOR = 50;
  // E5.1: a camada do elemento que está sendo desenhado — `desenharEletrica` avisa a categoria.
  let traco: string = CAMADAS.ELETRICA;
  let rotulo: string = CAMADAS.ELETRICA_TEXTO;
  const d: Desenhista = {
    linha: (x1, y1, x2, y2) => {
      saida += linha(traco, { x: x1, y: -y1 }, { x: x2, y: -y2 });
    },
    poligono: (pontos) => {
      saida += polilinha(traco, pontos.map((p) => ({ x: p.x, y: -p.y })));
    },
    texto: (x, y, t, alturaMm) => {
      saida += texto(rotulo, { x, y: -y }, t, alturaMm * FATOR);
    },
    retangulo: (x, y, w, h) => {
      saida += polilinha(traco, [
        { x, y: -y },
        { x: x + w, y: -y },
        { x: x + w, y: -(y + h) },
        { x, y: -(y + h) },
      ]);
    },
  };
  desenharEletrica(d, model, { px: (x) => x, py: (y) => -y }, FATOR, {
    aoMudarCategoria: (c) => {
      traco = c === 'ILUMINACAO' ? CAMADAS.ELETRICA_ILUMINACAO : c === 'FORCA' ? CAMADAS.ELETRICA_FORCA : CAMADAS.ELETRICA;
      rotulo = c === 'ILUMINACAO' ? CAMADAS.ELETRICA_ILUMINACAO_TEXTO : c === 'FORCA' ? CAMADAS.ELETRICA_FORCA_TEXTO : CAMADAS.ELETRICA_TEXTO;
    },
  });
  traco = CAMADAS.ELETRICA;
  rotulo = CAMADAS.ELETRICA_TEXTO;

  // Quadro de cargas e legenda, abaixo da planta, uma linha de TEXT por linha.
  const bb = boundingBoxDoModelo(model);
  const altura = 200; // mm reais — 4 mm no papel a 1:50
  let y = (bb?.minY ?? 0) - 1500;
  const x = bb?.minX ?? 0;
  for (const l of linhasDoQuadroDeCargas(model, hip)) {
    saida += texto(CAMADAS.ELETRICA_TEXTO, { x, y }, l, altura);
    y -= altura * 1.8;
  }
  // E4.5: o UNIFILAR à direita da planta, em camadas próprias — o mesmo
  // traçado da folha (árvore com hierarquia), no "papel a 1:50" escrito ×50.
  saida += entidadesDoUnifilar(model, hip, (bb?.maxX ?? 0) + 2000, bb?.maxY ?? 0);
  return saida;
}

/** O diagrama unifilar como entidades DXF, com o canto superior esquerdo em (xReal, yReal) mm do mundo. */
function entidadesDoUnifilar(model: BlueprintModel, hip: HipotesesEletricas | undefined, xReal: number, yReal: number): string {
  const diagramas = montarUnifilar(model, hip);
  if (diagramas.length === 0) return '';
  let saida = '';
  const FATOR = 50;
  // Papel: (0,0) no canto do diagrama, Y para baixo; mundo: Y para cima, ×50.
  const real = (x: number, y: number) => ({ x: xReal + x * FATOR, y: yReal - y * FATOR });
  const d: Desenhista = {
    linha: (x1, y1, x2, y2) => {
      saida += linha(CAMADAS.UNIFILAR, real(x1, y1), real(x2, y2));
    },
    poligono: (pontos) => {
      saida += polilinha(CAMADAS.UNIFILAR, pontos.map((p) => real(p.x, p.y)));
    },
    texto: (x, y, t, alturaMm) => {
      saida += texto(CAMADAS.UNIFILAR_TEXTO, real(x, y), t, alturaMm * FATOR);
    },
    retangulo: (x, y, w, h) => {
      saida += polilinha(CAMADAS.UNIFILAR, [real(x, y), real(x + w, y), real(x + w, y + h), real(x, y + h)]);
    },
  };
  d.texto(0, 3.2, 'DIAGRAMA UNIFILAR', 3);
  let y = 8;
  if (temHierarquia(diagramas)) {
    y += desenharUnifilarEmArvore(d, diagramas, 0, y, 1).alturaMm + 6;
  } else {
    for (const dg of diagramas) {
      desenharUnifilar(d, dg, 0, y, 1);
      y += medidasDoUnifilar(dg).alturaMm + 8;
    }
  }
  for (const l of rodapeDoUnifilar(diagramas)) {
    d.texto(0, y, l, 1.9);
    y += 3.6;
  }
  return saida;
}

/**
 * A REDE HIDROSSANITÁRIA no DXF (E2.1): o MESMO desenho da prancha, feito no
 * "papel a 1:50" (x/50, −y/50) e escrito de volta ×50 — assim o tubo sai na
 * LARGURA REAL (bifilar), as peças no lugar certo em mm do mundo e os textos
 * e símbolos no tamanho de papel a 1:50, como na elétrica.
 */
function entidadesDaRedeHidro(model: BlueprintModel, rede: RedeDaPrancha): string {
  let saida = '';
  const FATOR = 50;
  const traco = rede === 'AGUA' ? CAMADAS.AGUA : CAMADAS.ESGOTO;
  const rotulo = rede === 'AGUA' ? CAMADAS.AGUA_TEXTO : CAMADAS.ESGOTO_TEXTO;
  const real = (x: number, y: number) => ({ x: x * FATOR, y: -y * FATOR });
  const d: Desenhista = {
    linha: (x1, y1, x2, y2) => {
      saida += linha(traco, real(x1, y1), real(x2, y2));
    },
    poligono: (pontos) => {
      saida += polilinha(traco, pontos.map((p) => real(p.x, p.y)));
    },
    texto: (x, y, t, alturaMm) => {
      saida += texto(rotulo, real(x, y), t, alturaMm * FATOR);
    },
    retangulo: (x, y, w, h) => {
      saida += polilinha(traco, [real(x, y), real(x + w, y), real(x + w, y + h), real(x, y + h)]);
    },
  };
  desenharHidrossanitaria(d, model, { px: (x) => x / FATOR, py: (y) => -y / FATOR }, rede, FATOR, null, nomesDasColunas(model));
  return saida;
}

/** E8.1: o incêndio pelo MESMO desenho da prancha, num Desenhista que escreve DXF (o molde da rede hidro). */
function entidadesDeIncendio(model: BlueprintModel): string {
  let saida = '';
  const FATOR = 50;
  const real = (x: number, y: number) => ({ x: x * FATOR, y: -y * FATOR });
  const d: Desenhista = {
    linha: (x1, y1, x2, y2) => {
      saida += linha(CAMADAS.INCENDIO, real(x1, y1), real(x2, y2));
    },
    poligono: (pontos) => {
      saida += polilinha(CAMADAS.INCENDIO, pontos.map((p) => real(p.x, p.y)));
    },
    texto: (x, y, t, alturaMm) => {
      saida += texto(CAMADAS.INCENDIO_TEXTO, real(x, y), t, alturaMm * FATOR);
    },
    retangulo: (x, y, w, h) => {
      saida += polilinha(CAMADAS.INCENDIO, [real(x, y), real(x + w, y), real(x + w, y + h), real(x, y + h)]);
    },
  };
  desenharIncendio(d, model, { px: (x) => x / FATOR, py: (y) => -y / FATOR }, 'TODAS', FATOR, null);
  return saida;
}

/**
 * E8.1 da climatização: o MESMO desenho da prancha num Desenhista que escreve
 * DXF. A camada sai da COR do traço (a cor é a da disciplina): linha, dreno e
 * duto separados, para quem plota desligar um deles.
 */
function entidadesDeClimatizacao(model: BlueprintModel): string {
  let saida = '';
  const FATOR = 50;
  const real = (x: number, y: number) => ({ x: x * FATOR, y: -y * FATOR });
  const camada = (cor?: string) =>
    cor === COR_DA_DISCIPLINA.FRIGORIGENA ? CAMADAS.CLIMA_LINHA : cor === COR_DA_DISCIPLINA.DRENO_AC ? CAMADAS.CLIMA_DRENO : cor === COR_DA_DISCIPLINA.MECANICA ? CAMADAS.CLIMA_DUTO : CAMADAS.CLIMA_TEXTO;
  const d: Desenhista = {
    linha: (x1, y1, x2, y2, estilo) => {
      saida += linha(camada(estilo?.cor), real(x1, y1), real(x2, y2));
    },
    poligono: (pontos, cor) => {
      // O branco é o "apagar o papel" por baixo do símbolo — no CAD não há o que apagar.
      if (cor.toLowerCase() === '#ffffff') return;
      saida += polilinha(camada(cor), pontos.map((p) => real(p.x, p.y)));
    },
    texto: (x, y, t, alturaMm) => {
      saida += texto(CAMADAS.CLIMA_TEXTO, real(x, y), t, alturaMm * FATOR);
    },
    retangulo: (x, y, w, h, estilo) => {
      saida += polilinha(camada(estilo?.cor), [real(x, y), real(x + w, y), real(x + w, y + h), real(x, y + h)]);
    },
  };
  desenharClimatizacao(d, model, { px: (x) => x / FATOR, py: (y) => -y / FATOR }, FATOR, null);
  return saida;
}

function boundingBoxDoModelo(model: BlueprintModel): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const w of model.walls) {
    xs.push(w.a.x, w.b.x);
    ys.push(w.a.y, w.b.y);
  }
  if (xs.length === 0) return null;
  // E4.5: o máximo também — o unifilar vai à DIREITA da planta, a partir do topo dela.
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/**
 * EIXOS DA MALHA (07/10/2026): a linha, a BOLHA (CIRCLE) e o nome nas duas pontas, em `PLANTA-MALHA-EIXOS`. Em mm
 * reais, com o tamanho proporcional à planta — a mesma régua das cotas. Linha contínua: tipo de linha traço-ponto
 * exige tabela LTYPE, e a camada própria já deixa quem recebe aplicar o seu.
 */
function entidadesDosEixosDaMalha(model: BlueprintModel, faixaDasCotas: FaixaDasCotas | null = null): string {
  const eixos = model.eixos ?? [];
  if (eixos.length === 0) return '';
  const escala = escalaDoDxf(model);
  const RAIO = escala * 0.5;
  const ALTURA = escala * 0.35;
  // A bolha fica por fora da faixa das cotas (08/10/2026), com um respiro proporcional.
  const respiro = escala * 0.3;
  const faixa = faixaDasCotas && Number.isFinite(faixaDasCotas.minX)
    ? { minX: faixaDasCotas.minX - respiro, minY: faixaDasCotas.minY - respiro, maxX: faixaDasCotas.maxX + respiro, maxY: faixaDasCotas.maxY + respiro }
    : null;
  let saida = '';
  // Por fora das cotas e ESCALONADAS (a que encostaria na vizinha vai para a fileira de fora).
  const todas = bolhasDosEixos(eixos, RAIO, faixa);
  for (const [i, e] of eixos.entries()) {
    const bolhas = todas[i];
    if (!bolhas) {
      saida += linha(CAMADAS.MALHA_EIXOS, e.a, e.b);
      continue;
    }
    saida += linha(CAMADAS.MALHA_EIXOS, bolhas.linhaA, bolhas.linhaB);
    for (const c of [bolhas.centroA, bolhas.centroB]) {
      saida += circulo(CAMADAS.MALHA_EIXOS, c, RAIO);
      saida += texto(CAMADAS.MALHA_EIXOS, { x: c.x - larguraEstimadaDoTexto(e.nome, ALTURA) / 2, y: c.y - ALTURA / 2 }, e.nome, ALTURA);
    }
  }
  return saida;
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
/**
 * A ESCALA DO DXF (mm reais): o maior comprimento do desenho / 10, nunca menos de 50 mm. Proporciona o que o CAD mostra
 * em tamanho fixo de papel — afastamento e texto das cotas, a bolha do eixo e o padrão do traço-ponto —, para não
 * sumir numa casa grande nem dominar numa pequena.
 */
function escalaDoDxf(model: BlueprintModel): number {
  return Math.max(500, ...model.walls.map((w) => wallLength(w)), ...model.boundaries.map((b) => Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y))) / 10;
}

/**
 * TIPOS DE LINHA (10/10/2026): `CONTINUOUS` (que toda camada usa e nunca tinha sido declarado) e `EIXO`, o traço-ponto
 * da malha — traço, vazio, ponto, vazio (R12: 72 = 65, 73 = nº de elementos, 40 = comprimento do padrão, 49 = cada
 * elemento; negativo = vazio, 0 = ponto). Em mm reais, proporcional à escala do desenho.
 */
function tabelaDeTiposDeLinha(escala: number): string {
  const traco = escala * 0.6;
  const vazio = escala * 0.1;
  return (
    par(0, 'TABLE') + par(2, 'LTYPE') + par(70, 2) +
    par(0, 'LTYPE') + par(2, 'CONTINUOUS') + par(70, 0) + par(3, 'Solid line') + par(72, 65) + par(73, 0) + par(40, num(0)) +
    par(0, 'LTYPE') + par(2, 'EIXO') + par(70, 0) + par(3, 'Eixo da malha __ . __') + par(72, 65) + par(73, 4) +
    par(40, num(traco + 2 * vazio)) + par(49, num(traco)) + par(49, num(-vazio)) + par(49, num(0)) + par(49, num(-vazio)) +
    par(0, 'ENDTAB')
  );
}

function entidadesDeCota(
  model: BlueprintModel,
  /** Cresce com o que as cotas ocupam (mm reais) — os eixos põem a bolha por fora. */
  faixa: FaixaDasCotas = faixaVazia(),
  envelopes?: Map<string, Point[][]>,
): string {
  let saida = '';

  // Afastamentos em mm REAIS — no CAD tudo é 1:1. Proporcionais ao tamanho da
  // planta para não sumirem numa casa grande nem dominarem numa pequena.
  // A divisa do lote também conta (07/10/2026): sem parede nenhuma, o estudo de massa ficava com a escala mínima.
  const escala = escalaDoDxf(model);
  const PASSO = escala * 0.8;
  const FOLGA = escala * 0.6;
  const ALTURA = escala * 0.35;
  // Tique e linha de chamada (07/10/2026), na MESMA proporção do PDF: lá o passo é 5 mm de papel, o tique 1,2 mm, a
  // folga da chamada 1 mm e a ultrapassagem 1,5 mm (`LINHA_DE_CHAMADA`).
  const mmPorMmDePapel = PASSO / 5;
  const TIQUE = 1.2 * mmPorMmDePapel;
  const FOLGA_DA_CHAMADA = LINHA_DE_CHAMADA.folgaPapelMm * mmPorMmDePapel;
  const ULTRAPASSA = LINHA_DE_CHAMADA.ultrapassaPapelMm * mmPorMmDePapel;

  // Os pontos (mm reais) do que as cotas já ocupam — a cadeia do LOTE começa além das da edificação (10/10/2026).
  const pontosDasCotas: { x: number; y: number }[] = [];
  const marcar = (...pts: { x: number; y: number }[]) => {
    crescerFaixa(faixa, ...pts);
    pontosDasCotas.push(...pts);
  };

  const desenharLado = (lado: LadoDoContorno, faceMm: number, cadeias: [SegmentoDeCota[], number][], extra = 0) => {
    const desenhar = (
      segmentos: { de: number; ate: number; rotulo: string }[],
      nivel: number,
    ) => {
      const afasta = FOLGA + PASSO * nivel + extra;
      for (const [indice, seg] of segmentos.entries()) {
        const a = pontoDaCota(lado, seg.de, afasta);
        const b = pontoDaCota(lado, seg.ate, afasta);
        saida += linha(CAMADAS.COTAS, a, b);
        marcar(a, b);
        // Tique a 45° nas duas pontas — a marca de fim de cota que o PDF já tinha.
        for (const p of [a, b]) saida += linha(CAMADAS.COTAS, { x: p.x - TIQUE / 2, y: p.y - TIQUE / 2 }, { x: p.x + TIQUE / 2, y: p.y + TIQUE / 2 });
        // Texto no meio, empurrado mais um pouco para fora para não montar na
        // linha. Sem rotação: o DXF guardaria o ângulo, mas o leitor que abre
        // com estilo próprio pode ignorá-lo, e número deitado é legível.
        //
        // O texto é deitado (sem giro): a sua extensão AO LONGO do lado é a largura num lado horizontal e a altura num
        // vertical. Não cabe no trecho → a regra única (`ondeFicaORotulo`, 10/10/2026): antes do início, depois do fim
        // ou do outro lado da linha — a mesma da tela e do PDF.
        const largura = larguraEstimadaDoTexto(seg.rotulo, ALTURA);
        const dx = (lado.b.x - lado.a.x) / (Math.hypot(lado.b.x - lado.a.x, lado.b.y - lado.a.y) || 1);
        const dy = (lado.b.y - lado.a.y) / (Math.hypot(lado.b.x - lado.a.x, lado.b.y - lado.a.y) || 1);
        const extensao = Math.abs(dx) * largura + Math.abs(dy) * ALTURA;
        const onde = ondeFicaORotulo(indice, segmentos.length, seg.ate - seg.de, extensao, ALTURA * 0.3);
        const folgaDoTexto = ALTURA * 0.3;
        const centro =
          onde === 'ANTES'
            ? pontoDaCota(lado, seg.de - extensao / 2 - folgaDoTexto, afasta + ALTURA * 0.4)
            : onde === 'DEPOIS'
              ? pontoDaCota(lado, seg.ate + extensao / 2 + folgaDoTexto, afasta + ALTURA * 0.4)
              : onde === 'OUTRO_LADO'
                ? pontoDaCota(lado, (seg.de + seg.ate) / 2, afasta - ALTURA * 1.2)
                : pontoDaCota(lado, (seg.de + seg.ate) / 2, afasta + ALTURA * 0.4);
        // TEXT ancora à esquerda, na linha de base: centra-se à mão.
        const insercao = { x: centro.x - largura / 2, y: centro.y - ALTURA / 2 };
        saida += texto(CAMADAS.COTAS, insercao, seg.rotulo, ALTURA);
        // O número fica PARA FORA da linha: a caixa dele também é do que as cotas ocupam.
        marcar(insercao, { x: insercao.x + largura, y: insercao.y + ALTURA }, { x: insercao.x, y: insercao.y + ALTURA }, { x: insercao.x + largura, y: insercao.y });
      }
    };

    for (const [segmentos, nivel] of cadeias) desenhar(segmentos, nivel);

    // LINHAS DE CHAMADA: da face do objeto + folga até além da linha mais externa que quebra ali — a regra do PDF.
    const inicio = faceMm + FOLGA_DA_CHAMADA;
    for (const ch of chamadasDoLado(cadeias.map(([segmentos, nivel]) => ({ segmentos, nivel })))) {
      const fim = FOLGA + PASSO * ch.nivel + extra + ULTRAPASSA;
      if (fim > inicio) {
        const ponta = pontoDaCota(lado, ch.t, fim);
        saida += linha(CAMADAS.COTAS, pontoDaCota(lado, ch.t, inicio), ponta);
        marcar(ponta);
      }
    }
  };

  for (const nivel of model.levels) {
    pontosDasCotas.length = 0;
    const dasParedes = cadeiasPorLado(model, nivel);
    for (const c of dasParedes) {
      desenharLado(c.lado, c.faceExternaMm, [
        [c.aberturas, AFASTAMENTO_COTA.aberturas - 1],
        [c.internas, AFASTAMENTO_COTA.internas - 1],
        [c.parcial, AFASTAMENTO_COTA.parcial - 1],
        [[c.total], AFASTAMENTO_COTA.total - 1],
      ]);
    }
    // As cotas do LOTE, por fora da divisa — a mesma conta da tela e do PDF.
    // + as faixas de restrição e as divisas internas (08/10/2026). O envelope recuado não: os recuos são da zona, não do
    // modelo, e a prancha não o desenha.
    const limites = model.boundaries.filter((b) => b.levelId === nivel.id);
    // ALÉM DAS COTAS DA EDIFICAÇÃO (10/10/2026): a cadeia do lote começa além do que as das paredes já ocupam.
    const ocupado = [...pontosDasCotas];
    for (const c of cadeiasDoContorno(anelDoLoteFechado(limites), [], dasParedes, detalhesDoLote(limites, envelopes?.get(nivel.id) ?? []))) {
      const { ux, uy, nx, ny } = referencialDoLado(c.lado);
      const comprimento = Math.hypot(c.lado.b.x - c.lado.a.x, c.lado.b.y - c.lado.a.y);
      const alcance = alcanceAlemDoLado(ocupado, { a: c.lado.a, u: { x: ux, y: uy }, n: { x: nx, y: ny }, comprimento });
      const extra = deslocamentoDaCadeiaDoLote(alcance, ALTURA * 0.5, FOLGA);
      desenharLado(c.lado, 0, c.parcial.length > 0 ? [[c.parcial, 0], [[c.total], 1]] : [[[c.total], 0]], extra);
    }
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
  'Hidrossanitário (quando pedido): tubos na largura real (bifilar), conexões, caixas e pontos em PLANTA-AGUA e PLANTA-ESGOTO; ø, i % e siglas em PLANTA-AGUA-TEXTO e PLANTA-ESGOTO-TEXTO, no tamanho de papel a 1:50. A cota do tubo não está na geometria 2D — só no IFC.',
  'Elétrica (quando pedida): símbolos NBR 5444 e eletrodutos em PLANTA-ELETRICA-ILUMINACAO (luminárias, interruptores e os eletrodutos só deles) e PLANTA-ELETRICA-FORCA (tomadas, TUE, ligação direta, equipamentos, dados, entrada) — o comum (quadros, caixas, eletroduto de circuitos dos dois tipos) em PLANTA-ELETRICA —, rótulos (sigla · circuito, Ø, #seção, VA) nas camadas -TEXTO de cada uma; os símbolos têm tamanho de papel a 1:50. O quadro de cargas e a legenda saem como TEXT abaixo da planta; o diagrama unifilar (em árvore quando há hierarquia de quadros) em UNIFILAR / UNIFILAR-TEXTO, à direita da planta.',
  'Climatização (quando pedida): linha frigorígena em PLANTA-CLIMA-LINHA, dreno em PLANTA-CLIMA-DRENO e dutos (bifilar na largura real quando cabe) em PLANTA-CLIMA-DUTO; números, Ø líquido/sucção, DN, L×A e capacidade em PLANTA-CLIMA-TEXTO. A cota não está na geometria 2D — só no IFC.',
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
  'Escada e rampa: pegada, um traço por espelho e o eixo de subida em PLANTA-ESCADA; nas vistas, um polígono por degrau em ELEVACAO-ESCADA e a face cortada em CORTE-ESCADA. Sem a quebra a 45° — quem recebe corta o desenho onde quiser.',
  'Cortes (quando incluídos): o que o plano atravessa sai em camadas CORTE-* (paredes, estrutura, telhado e os vãos), separadas das ELEVACAO-* para que se possa plotar o corte com traço mais grosso que a vista. O DXF não carrega espessura de traço por si: quem plota escolhe por camada.',
  'Não exporta: materiais, hachuras, blocos, mobiliário, armadura ou cotas como entidade DIMENSION.',
];
