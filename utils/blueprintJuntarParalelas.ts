// utils/blueprintJuntarParalelas.ts
//
// A JUNTA PARALELA QUE SÓ PRECISA DE UM EMPURRÃO (P2.51, 24/09/2026).
//
// ─── O BECO, E O QUE A MEDIÇÃO MOSTROU ──────────────────────────────────────
//
// `juntasParalelasSemCanto` nomeia uma ponta solta que morreu de frente para
// uma parede PARALELA. Dois eixos paralelos não se cruzam, então não há canto a
// calcular: a ferramenta Juntar recusa, "Conectar automaticamente" não alcança,
// e a lista de vãos não pega (ela só emparelha pontas na mesma linha). O painel
// dizia, com razão, que a saída era selecionar os dois segmentos e mover o
// conjunto — orientação escrita para o caso que a originou, o de uma DIVISA
// colinear que não acompanha a parede de propósito.
//
// ⚠️ Medido na planta real do usuário (24/09): **56 juntas paralelas, ZERO com
// divisa**. São parede contra parede, vindas do DXF. E o afastamento LATERAL
// delas se divide em dois mundos:
//
//     0–50 mm .... 26   ← junção desfeita por milímetros
//     0,3–1 m .... 13
//     acima de 1 m  17
//
// As 26 primeiras não são "decisão de projeto" nenhuma: são o mesmo canto
// desenhado duas vezes com 2 cm de diferença. Elas têm conserto automático — e
// sem ele o contorno não fecha, o ambiente não nasce, e não há área, piso nem
// rodapé. As outras 30 são paredes distintas que por acaso se olham; encostá-las
// seria inventar geometria, e ficam de fora por construção.
//
// ─── QUEM ANDA ──────────────────────────────────────────────────────────────
//
// A parede MAIS LONGA fica parada e a mais curta encosta nela. A longa é a que
// estrutura o desenho — mover a ponta dela arrastaria o alinhamento de um trecho
// grande para consertar um detalhe. Empate de comprimento resolve pela mais
// ESPESSA (a estrutural manda na de vedação) e, persistindo, pelo id, para que
// dois carregamentos da mesma planta produzam a mesma lista.

import { applyCommand, pontasSoltasDoNivel, wallLength, type BlueprintModel, type Command, type Level, type ObjectId, type Point, type Wall } from './blueprintKernel';

/**
 * Afastamento lateral máximo para considerar "junta desfeita", em milímetro.
 *
 * 50 mm sai da medição: abaixo disso estão as 26 juntas que o DXF partiu, e o
 * próximo caso real só aparece a 300 mm — uma distância que já é parede outra.
 */
export const LATERAL_MAXIMA_MM = 50;

/** Cosseno máximo do desvio para dois eixos contarem como paralelos (≈ 4,6°). */
const SENO_PARALELO = 0.08;

export interface JuntaProxima {
  /** A parede que ANDA — a mais curta das duas. */
  wallId: ObjectId;
  end: 'a' | 'b';
  /** Onde a ponta está hoje. */
  de: Point;
  /** Onde ela vai: a ponta da parede que fica. */
  to: Point;
  /** A parede que fica parada. */
  alvoId: ObjectId;
  /**
   * Quanto a ponta anda no total, em mm.
   *
   * ⚠️ PODE SER MAIOR QUE A TOLERÂNCIA, e isso não é defeito: a tolerância
   * limita o desalinho LATERAL, e a ponta também desliza no próprio eixo até
   * chegar na ponta da outra parede (o quanto couber na espessura). Na planta
   * real o desalinho máximo foi de 4 cm e a ponta que mais andou percorreu
   * 223 mm — numa parede de 386 mm de espessura. A tela tem de dizer as duas
   * coisas, senão o botão promete "5 cm" e a mensagem confessa "223 mm".
   */
  distanciaMm: number;
  /** O desalinho lateral — este sim, limitado pela tolerância. */
  lateralMm: number;
}

/** Comprimento, espessura e id — o desempate de quem anda, nesta ordem. */
function mandaMais(a: Wall, b: Wall): Wall {
  const ca = wallLength(a);
  const cb = wallLength(b);
  if (ca !== cb) return ca > cb ? a : b;
  if (a.thicknessMm !== b.thicknessMm) return a.thicknessMm > b.thicknessMm ? a : b;
  return a.id < b.id ? a : b;
}

/**
 * As juntas paralelas que estão a um empurrão de fechar.
 *
 * Só entra a ponta SOLTA (é o critério de quem precisa de conserto) que esteja
 * de frente para a ponta de uma parede paralela — "de frente" no sentido de
 * `juntasParalelasSemCanto`: o afastamento ao longo do próprio eixo cabe dentro
 * da espessura, e o que sobra é lateral.
 */
export function juncoesParalelasProximas(
  model: BlueprintModel,
  level: Level,
  lateralMaximaMm = LATERAL_MAXIMA_MM,
): JuntaProxima[] {
  if (lateralMaximaMm <= 0) return [];
  const paredes = model.walls.filter((w) => w.levelId === level.id);
  const porId = new Map(paredes.map((w) => [w.id, w]));
  const saida: JuntaProxima[] = [];
  // Uma ponta não pode ser movida duas vezes no mesmo lote, e um alvo que ANDOU
  // deixaria a primeira junta desfeita — por isso os dois conjuntos.
  const jaAndou = new Set<string>();
  const jaFoiAlvo = new Set<string>();

  const soltas = pontasSoltasDoNivel(model, level);
  // Quais pontas estão soltas, para saber se a do ALVO também está.
  const pontaSolta = new Set(soltas.map((s) => `${s.wallId}:${s.end}`));

  for (const solta of soltas) {
    const parede = porId.get(solta.wallId);
    if (!parede) continue;
    const ux = solta.p.x - solta.oposta.x;
    const uy = solta.p.y - solta.oposta.y;
    const comp = Math.hypot(ux, uy);
    if (comp === 0) continue;

    let melhor: { alvo: Wall; ponta: Point; lateral: number; alvoSolto: boolean } | null = null;
    for (const v of paredes) {
      if (v.id === parede.id) continue;
      const vx = v.b.x - v.a.x;
      const vy = v.b.y - v.a.y;
      const cv = Math.hypot(vx, vy);
      if (cv === 0) continue;
      // Não paralelas: há canto, e a ferramenta Juntar resolve. Não é este caso.
      if (Math.abs(ux * vy - uy * vx) / (comp * cv) >= SENO_PARALELO) continue;
      for (const [ponta, q] of [['a', v.a], ['b', v.b]] as const) {
        const dx = q.x - solta.p.x;
        const dy = q.y - solta.p.y;
        const aoLongo = Math.abs((dx * ux + dy * uy) / comp);
        // "De frente": o desencontro no próprio eixo cabe na espessura.
        if (aoLongo > parede.thicknessMm) continue;
        const lateral = Math.abs((dx * uy - dy * ux) / comp);
        if (lateral <= 0 || lateral > lateralMaximaMm) continue;
        if (!melhor || lateral < melhor.lateral) {
          melhor = { alvo: v, ponta: q, lateral, alvoSolto: pontaSolta.has(`${v.id}:${ponta}`) };
        }
      }
    }
    if (!melhor) continue;

    // ⚠️ A PAREDE NÃO PODE COLAPSAR. `MoveVertex` recusa levar a ponta para
    // cima da oposta ("Mover o vértice colapsaria a parede") — e recusaria o
    // LOTE inteiro por causa de uma. Foi o kernel que apontou isto, na medição
    // da planta real: um toco de parede cuja ponta ia parar exatamente na outra.
    if (melhor.ponta.x === solta.oposta.x && melhor.ponta.y === solta.oposta.y) continue;

    // ⚠️ QUEM ANDA É QUEM ESTÁ SOLTO. O desempate por comprimento só vale
    // quando as DUAS pontas estão soltas; medido na planta real, exigi-lo sempre
    // deixava 8 juntas de 26 — porque na maioria dos casos só uma das paredes
    // tem a ponta livre, e muitas vezes é justamente a mais longa. Ela é a que
    // está errada: mover a outra seria consertar o desenho no lugar certo pelo
    // motivo errado.
    if (melhor.alvoSolto && mandaMais(parede, melhor.alvo).id === parede.id) continue;
    // ⚠️ UMA PONTA POR PAREDE, POR LOTE. O kernel aplica os comandos em
    // sequência: mover as duas pontas da mesma parede curta no mesmo lote pode
    // levar a segunda para cima do lugar onde a primeira acabou de parar — e aí
    // "Mover o vértice colapsaria a parede" derruba o lote todo. Foi assim que
    // isto apareceu, aplicando o lote sobre a planta real. A outra ponta entra
    // no próximo clique, com o desenho já atualizado.
    if (jaAndou.has(parede.id) || jaFoiAlvo.has(parede.id) || jaAndou.has(melhor.alvo.id)) continue;
    jaAndou.add(parede.id);
    jaFoiAlvo.add(melhor.alvo.id);
    saida.push({
      wallId: parede.id,
      end: solta.end,
      de: { x: solta.p.x, y: solta.p.y },
      to: { x: melhor.ponta.x, y: melhor.ponta.y },
      alvoId: melhor.alvo.id,
      distanciaMm: Math.round(Math.hypot(melhor.ponta.x - solta.p.x, melhor.ponta.y - solta.p.y)),
      lateralMm: Math.round(melhor.lateral),
    });
  }

  saida.sort((a, b) => (a.wallId === b.wallId ? a.end.localeCompare(b.end) : a.wallId.localeCompare(b.wallId)));

  // ⚠️ SÓ ENTRA O QUE MELHORA — e isso se MEDE, uma a uma.
  //
  // Medido na planta real: as 14 candidatas resolviam as 14 pontas visadas, mas
  // faziam **11 OUTRAS** ficarem soltas. Mover a ponta tira a parede de onde ela
  // estava, e uma vizinhança que dependia daquele contato se desfaz. Saldo
  // positivo no total, e ainda assim o usuário apertaria um botão de consertar
  // e veria bolinhas novas aparecerem — o pior tipo de ferramenta.
  //
  // Então cada junta é aplicada sobre o acumulado e só fica se o número de
  // pontas soltas do pavimento CAIR. É guloso e sequencial de propósito: é a
  // mesma ordem em que o kernel vai aplicar o lote.
  let acumulado = model;
  let soltasAgora = soltas.length;
  const aprovadas: JuntaProxima[] = [];
  for (const j of saida) {
    let tentativa: BlueprintModel;
    try {
      tentativa = applyCommand(acumulado, { type: 'MoveVertex', wallId: j.wallId, end: j.end, to: j.to }).model;
    } catch {
      // O kernel recusou (parede colapsaria, por exemplo): a junta não existe.
      continue;
    }
    const nivelDepois = tentativa.levels.find((l) => l.id === level.id);
    if (!nivelDepois) continue;
    const quantas = pontasSoltasDoNivel(tentativa, nivelDepois).length;
    if (quantas >= soltasAgora) continue;
    acumulado = tentativa;
    soltasAgora = quantas;
    aprovadas.push(j);
  }
  return aprovadas;
}

/** O lote: cada ponta vai para a ponta da parede que fica. Um desfazer só. */
export function comandosDeJuntarParalelas(juntas: readonly JuntaProxima[]): Command[] {
  return juntas.map((j): Command => ({ type: 'MoveVertex', wallId: j.wallId, end: j.end, to: j.to }));
}
