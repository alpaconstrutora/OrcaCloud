/**
 * TELHADO — a geometria da ÁGUA (plano inclinado de cobertura).
 *
 * ─── POR QUE A UNIDADE É A ÁGUA, E NÃO O TELHADO ────────────────────────────
 *
 * A tentação é pedir o contorno da casa mais uma inclinação e gerar o telhado
 * inteiro — quatro águas de um telhado em tacaniça saindo sozinhas. Isso é o
 * ESQUELETO RETO (straight skeleton), e é um algoritmo com casos degenerados
 * notórios: lados colineares, furos, vértices que colidem no mesmo instante.
 * Errado, ele não falha: produz um telhado plausível e errado, que é o modo de
 * falha que este módulo inteiro existe para evitar.
 *
 * Então o usuário desenha o contorno de CADA água — que é como ele já pensa a
 * cobertura, e é o que ele sabe fazer — e o kernel resolve a ALTURA, que é o que
 * ele não quer fazer à mão.
 *
 * ─── A ALTURA É UM PLANO, E ISSO NÃO É DETALHE ──────────────────────────────
 *
 *     z(p) = baseMm + d(p) · tg
 *
 * onde `d(p)` é a distância de `p` até a LINHA DO BEIRAL, medida em planta, com
 * sinal positivo para dentro do polígono, e `tg = inclinacaoPct / 100`.
 *
 * Como `z` é função AFIM de `x` e `y`, o resultado é um plano exato: qualquer
 * polígono em planta — convexo, em "L", com reentrância — sobe para um polígono
 * PLANAR no espaço. Não há triangulação, não há interpolação entre vértices, não
 * há caso especial. Um "telhado" que interpolasse alturas vértice a vértice
 * produziria uma superfície empenada, que não existe em obra e da qual não se
 * consegue tirar área.
 *
 * ─── ÁREA REAL ≠ ÁREA PROJETADA ─────────────────────────────────────────────
 *
 *     areaReal = areaProjetada · √(1 + tg²)
 *
 * A 30% são 4,4% a mais; a 100% (45°), 41% a mais. Quem compra telha pela área
 * em planta compra a menos, e o erro é silencioso porque o número é plausível —
 * a mesma família do "área de eixo × área de piso" que o ambiente já carrega.
 * Por isso as duas saem no quantitativo, lado a lado, e nenhuma delas sozinha.
 */

import { KernelError, roundToMm } from './units';
import { polygonArea, signedArea, type Point } from './geom';

/** Uma água qualquer, na forma mínima de que a geometria precisa. */
export interface AguaGeometrica {
  pontos: Point[];
  /** Índice do lado BAIXO: vai de `pontos[i]` a `pontos[(i+1) % n]`. */
  beiralIndex: number;
  /** Inclinação em POR CENTO — convenção brasileira ("telhado 30%"). */
  inclinacaoPct: number;
  /** Cota da LINHA DO BEIRAL, relativa ao piso do pavimento, em mm. */
  baseMm: number;
}

/**
 * Inclinação máxima aceita, em por cento. 300% são 71,6°.
 *
 * Não é limite de física — mansarda passa de 100% —, é limite de erro de
 * digitação: quem quis 30 e digitou 300 vê a recusa, não um telhado de doze
 * metros de altura. Telhado plano (0%) é legítimo: laje impermeabilizada.
 */
export const AGUA_INCLINACAO_MAX_PCT = 300;

/** Versores do plano da água, em planta e no espaço. */
export interface PlanoDaAgua {
  /** Origem: a primeira ponta do beiral, na cota `baseMm`. */
  origem: Point;
  /** Versor da LINHA DO BEIRAL, em planta. É o `u` do perfil e o X local. */
  e: Point;
  /** Normal INTERNA do beiral, em planta. A água sobe nesta direção. */
  n: Point;
  /** `inclinacaoPct / 100`. */
  tg: number;
  /** `√(1 + tg²)` — o fator que separa área real de área projetada. */
  fator: number;
}

/**
 * O plano da água: origem, direção do beiral e para que lado ela sobe.
 *
 * ⚠️ **O sentido do anel decide qual normal é a interna.** Anti-horário
 * (`signedArea > 0`) → a normal interna do lado `a → b` é a da ESQUERDA;
 * horário → a da DIREITA. É a mesma regra de `anelRecuado`, e pelo mesmo motivo:
 * sem ela, metade das águas desenhadas subiria para FORA do polígono — o
 * telhado ficaria de cabeça para baixo em todo desenho traçado no outro sentido,
 * e nada na tela explicaria por quê.
 */
export function planoDaAgua(agua: AguaGeometrica): PlanoDaAgua {
  const n = agua.pontos.length;
  const i = agua.beiralIndex;
  const a = agua.pontos[i];
  const b = agua.pontos[(i + 1) % n];

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comp = Math.hypot(dx, dy);
  if (comp === 0) {
    throw new KernelError('DEGENERATE_ROOF', 'Beiral de comprimento zero');
  }
  const e = { x: dx / comp, y: dy / comp };

  const antiHorario = signedArea(agua.pontos) > 0;
  const normal = antiHorario ? { x: -e.y, y: e.x } : { x: e.y, y: -e.x };

  const tg = agua.inclinacaoPct / 100;
  return { origem: a, e, n: normal, tg, fator: Math.sqrt(1 + tg * tg) };
}

/**
 * Distância de `p` até a linha do beiral, em planta, positiva para dentro.
 *
 * É a única grandeza de que a altura depende — e é medida até a LINHA, não até
 * o segmento: um ponto além da ponta do beiral continua tendo cota, que é o que
 * um telhado sobre uma planta em "L" precisa.
 */
export function distanciaAoBeiralMm(agua: AguaGeometrica, p: Point): number {
  const plano = planoDaAgua(agua);
  return (p.x - plano.origem.x) * plano.n.x + (p.y - plano.origem.y) * plano.n.y;
}

/**
 * Cota da água em `p`, relativa ao PISO DO PAVIMENTO, em mm.
 *
 * Relativa ao piso, e não absoluta, pela mesma decisão de `Structural.baseMm`:
 * é o `IfcLocalPlacement` do pavimento que carrega `elevationMm`, e somar as
 * duas aqui faria a mesma água mudar de cota ao ser duplicada para outro
 * pavimento.
 */
export function alturaNaAgua(agua: AguaGeometrica, p: Point): number {
  return agua.baseMm + distanciaAoBeiralMm(agua, p) * (agua.inclinacaoPct / 100);
}

/** O contorno da água no espaço: cada vértice com a sua cota. */
export function contornoDaAguaEm3d(agua: AguaGeometrica): { x: number; y: number; z: number }[] {
  return agua.pontos.map((p) => ({ x: p.x, y: p.y, z: alturaNaAgua(agua, p) }));
}

/**
 * O polígono da água NO PRÓPRIO PLANO — a forma verdadeira, sem encurtamento.
 *
 * `u` corre ao longo do beiral; `v` sobe a rampa. O `v` NÃO é a distância em
 * planta: é ela multiplicada por `√(1 + tg²)`, porque subir a rampa percorre
 * mais que andar embaixo dela. É essa multiplicação que faz a área deste
 * polígono ser a área REAL do telhado — e é assim que ela é conferida em teste,
 * comparando com `areaProjetada · fator` calculado por outro caminho.
 *
 * Serve ao IFC: é o perfil que, extrudado ao longo da normal do plano, dá o
 * sólido da água sem nenhuma matriz de rotação escrita à mão.
 */
export function perfilDaAguaNoPlano(agua: AguaGeometrica): Point[] {
  const plano = planoDaAgua(agua);
  return agua.pontos.map((p) => {
    const dx = p.x - plano.origem.x;
    const dy = p.y - plano.origem.y;
    return {
      x: dx * plano.e.x + dy * plano.e.y,
      y: (dx * plano.n.x + dy * plano.n.y) * plano.fator,
    };
  });
}

/**
 * A NORMAL do plano da água, apontando para CIMA. Unitária.
 *
 * O sólido do IFC é extrudado ao longo dela, e o 3D a usa para orientar a peça.
 * Com `Axis = normal` e `RefDirection = e`, o Y local que o IFC deriva
 * (`Axis × RefDirection`) cai exatamente na direção de subida da rampa — que é
 * o `v` de `perfilDaAguaNoPlano`. Os dois se encaixam por construção, sem
 * ninguém escrever uma matriz.
 */
export function normalDaAgua(agua: AguaGeometrica): { x: number; y: number; z: number } {
  const plano = planoDaAgua(agua);
  return {
    x: (-plano.tg * plano.n.x) / plano.fator,
    y: (-plano.tg * plano.n.y) / plano.fator,
    z: 1 / plano.fator,
  };
}

const MM2 = 1_000_000;

export interface MedidaDaAgua {
  /** Área da SOMBRA em planta, em m². Não é o que se compra. */
  areaProjetadaM2: number;
  /** Área da superfície inclinada, em m². É o que se compra. */
  areaRealM2: number;
  /** Inclinação em graus, DERIVADA — nunca gravada. */
  inclinacaoGraus: number;
  /** Comprimento da linha do beiral, em m. */
  comprimentoBeiralM: number;
  /** Cota do ponto mais alto da água, relativa ao piso, em mm. */
  alturaMaximaMm: number;
  /** De onde saiu a área real, para conferência (RF-121). */
  formula: string;
}

/** Mede uma água. Fonte única: quantitativo, painel, elevação e IFC leem daqui. */
export function medirAgua(agua: AguaGeometrica): MedidaDaAgua {
  const plano = planoDaAgua(agua);
  const areaProjetadaMm2 = polygonArea(agua.pontos);
  const areaProjetadaM2 = areaProjetadaMm2 / MM2;
  const areaRealM2 = areaProjetadaM2 * plano.fator;

  const n = agua.pontos.length;
  const a = agua.pontos[agua.beiralIndex];
  const b = agua.pontos[(agua.beiralIndex + 1) % n];

  const alturas = agua.pontos.map((p) => alturaNaAgua(agua, p));

  return {
    areaProjetadaM2,
    areaRealM2,
    inclinacaoGraus: (Math.atan(plano.tg) * 180) / Math.PI,
    comprimentoBeiralM: Math.hypot(b.x - a.x, b.y - a.y) / 1000,
    alturaMaximaMm: roundToMm(Math.max(...alturas)),
    formula:
      `área real = área projetada × √(1 + (${agua.inclinacaoPct}/100)²) = ` +
      `${areaProjetadaM2.toFixed(2)} × ${plano.fator.toFixed(4)}`,
  };
}
