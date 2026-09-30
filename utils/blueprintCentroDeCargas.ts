/**
 * CENTRO DE CARGAS (E6.2, 29/09/2026) — puro.
 *
 * O quadro perto de onde a carga está encurta os circuitos: menos cobre, menos
 * queda de tensão. O centro de cargas é o BARICENTRO dos pontos ponderado pela
 * potência (VA) — os pontos do quadro, ou todos os pontos com potência quando
 * ainda não há quadro.
 *
 * A REGIÃO sugerida é um círculo em volta do centro: onde o momento quadrático
 * Σ VA·d² fica até 10 % acima do mínimo. Como Σ w·|p − x|² = Σ w·|c − x|² +
 * W·|p − c|² (c o baricentro, W a soma dos pesos), isso dá um raio fechado:
 * r = √(0,10 · Σ w·|c − x|² / W) — 0,32 × a distância quadrática média dos
 * pontos ao centro. Quanto mais espalhada a carga, maior a região (e menos
 * importa onde o quadro fica).
 *
 * A POSIÇÃO SUGERIDA é o centro encaixado no eixo da parede mais próxima do
 * nível (até 3 m): quadro de embutir fica na parede, não no meio da sala. Sem
 * parede perto, o próprio centro. É SUGESTÃO — quem decide é o projetista
 * (área molhada, circulação, acesso da concessionária o software não sabe).
 *
 * O ganho é dito pelo momento linear Σ VA·d (em planta, reta): proporcional ao
 * "comprimento × carga" que os circuitos vão ter. Pontos de outros pavimentos
 * entram pela posição em planta (a prumada é a mesma para todos).
 */
import type { BlueprintModel, Command, ObjectId, Point } from './blueprintKernel';
import { encaixarNaParede } from './blueprintRotaPelasParedes';

/** Fração acima do mínimo do momento quadrático que define a região. */
export const TOLERANCIA_DA_REGIAO = 0.1;
/** Até onde se procura uma parede para encaixar a posição sugerida, mm. */
export const RAIO_DE_ENCAIXE_NA_PAREDE_MM = 3000;
/** O círculo não fica menor que isto, mm (carga concentrada num ponto só). */
export const RAIO_MINIMO_DA_REGIAO_MM = 300;

export interface CentroDeCargas {
  /** O quadro cujos pontos entraram; `null` = todos os pontos (não há quadro). */
  quadroId: ObjectId | null;
  /** Onde desenhar: o pavimento do quadro, ou o de maior carga. */
  levelId: ObjectId;
  centro: Point;
  raioMm: number;
  totalVA: number;
  pontos: number;
  /** Pontos do conjunto sem potência — ficaram fora do baricentro (dito). */
  pontosSemPotencia: number;
  posicaoSugerida: Point;
  /** A parede onde a posição sugerida encaixou; `null` = sem parede a menos de 3 m. */
  paredeId: ObjectId | null;
  /**
   * A posição sugerida cai dentro da região? Nem sempre: a parede mais próxima
   * pode passar fora do círculo (sala grande, carga concentrada). Aí o quadro
   * na parede é o melhor PRÁTICO, e a tela diz isso em vez de "fora da região".
   */
  sugeridaDentroDaRegiao: boolean;
  /** O quadro já está na posição sugerida. */
  quadroNaSugerida: boolean | null;
  /** Só com quadro: onde ele está, a distância ao centro e se já está dentro da região. */
  quadroEm: Point | null;
  distanciaDoQuadroMm: number | null;
  dentroDaRegiao: boolean | null;
  /** Σ VA·d, em VA·m: com o quadro onde está e na posição sugerida. */
  momentoAtualVAm: number | null;
  momentoSugeridoVAm: number;
}

const momento = (pontos: readonly { at: Point; va: number }[], p: Point) =>
  pontos.reduce((s, x) => s + (x.va * Math.hypot(x.at.x - p.x, x.at.y - p.y)) / 1000, 0);

/**
 * O centro de cargas de um quadro (`quadroId`) ou de todos os pontos (`null`).
 * `null` quando não há ponto com potência — não há o que ponderar.
 */
export function centroDeCargas(model: BlueprintModel, quadroId: ObjectId | null): CentroDeCargas | null {
  const quadro = quadroId ? (model.quadros ?? []).find((q) => q.id === quadroId) ?? null : null;
  if (quadroId && !quadro) return null;
  const doQuadro = quadro ? new Set((model.circuitos ?? []).filter((c) => c.quadroId === quadro.id).map((c) => c.id)) : null;
  const conjunto = (model.terminais ?? []).filter(
    (t) => t.disciplina === 'ELETRICA' && (doQuadro ? t.circuitoId != null && doQuadro.has(t.circuitoId) : true),
  );
  const comPotencia = conjunto.filter((t) => t.potenciaW != null && t.potenciaW > 0).map((t) => ({ at: t.at, va: t.potenciaW as number, levelId: t.levelId }));
  if (comPotencia.length === 0) return null;
  const W = comPotencia.reduce((s, x) => s + x.va, 0);
  const cx = comPotencia.reduce((s, x) => s + x.va * x.at.x, 0) / W;
  const cy = comPotencia.reduce((s, x) => s + x.va * x.at.y, 0) / W;
  const centro = { x: Math.round(cx), y: Math.round(cy) };
  const inercia = comPotencia.reduce((s, x) => s + x.va * ((x.at.x - cx) ** 2 + (x.at.y - cy) ** 2), 0);
  const raioMm = Math.max(RAIO_MINIMO_DA_REGIAO_MM, Math.round(Math.sqrt((TOLERANCIA_DA_REGIAO * inercia) / W)));

  // Pavimento: o do quadro; sem quadro, o de maior carga (empate: o primeiro na ordem dos pavimentos).
  let levelId: ObjectId;
  if (quadro) levelId = quadro.levelId;
  else {
    const porNivel = new Map<ObjectId, number>();
    for (const x of comPotencia) porNivel.set(x.levelId, (porNivel.get(x.levelId) ?? 0) + x.va);
    const ordem = model.levels.map((l) => l.id);
    levelId = [...porNivel.entries()].sort((a, b) => b[1] - a[1] || ordem.indexOf(a[0]) - ordem.indexOf(b[0]))[0][0];
  }

  const paredes = model.walls.filter((w) => w.levelId === levelId);
  const encaixe = encaixarNaParede(centro, paredes, RAIO_DE_ENCAIXE_NA_PAREDE_MM);
  const posicaoSugerida = encaixe ? { x: Math.round(encaixe.q.x), y: Math.round(encaixe.q.y) } : centro;

  const distancia = quadro ? Math.hypot(quadro.at.x - cx, quadro.at.y - cy) : null;
  return {
    quadroId: quadro?.id ?? null,
    levelId,
    centro,
    raioMm,
    totalVA: W,
    pontos: comPotencia.length,
    pontosSemPotencia: conjunto.length - comPotencia.length,
    posicaoSugerida,
    paredeId: encaixe?.parede.id ?? null,
    sugeridaDentroDaRegiao: Math.hypot(posicaoSugerida.x - cx, posicaoSugerida.y - cy) <= raioMm,
    quadroNaSugerida: quadro ? quadro.at.x === posicaoSugerida.x && quadro.at.y === posicaoSugerida.y : null,
    quadroEm: quadro ? quadro.at : null,
    distanciaDoQuadroMm: distancia,
    dentroDaRegiao: distancia == null ? null : distancia <= raioMm,
    momentoAtualVAm: quadro ? momento(comPotencia, quadro.at) : null,
    momentoSugeridoVAm: momento(comPotencia, posicaoSugerida),
  };
}

/**
 * O comando que leva o quadro à posição sugerida — ou, sem quadro, que CRIA um
 * "QDC" nela (no pavimento de maior carga). Vazio quando o quadro já está lá.
 * Os eletrodutos traçados até o quadro NÃO andam junto (o kernel não mexe na
 * rede de quem move): `trechosNoQuadro` conta os que tocam o quadro, para a
 * tela avisar que a rede precisa ser relançada.
 */
export function comandosParaOCentro(model: BlueprintModel, c: CentroDeCargas): Command[] {
  if (!c.quadroId) {
    const nomes = new Set((model.quadros ?? []).map((q) => q.nome));
    let nome = 'QDC';
    for (let i = 2; nomes.has(nome); i++) nome = `QDC ${i}`;
    return [{ type: 'AddQuadro', levelId: c.levelId, nome, at: c.posicaoSugerida, cotaMm: 1600 }];
  }
  if (!c.quadroEm) return [];
  const delta = { x: c.posicaoSugerida.x - c.quadroEm.x, y: c.posicaoSugerida.y - c.quadroEm.y };
  if (delta.x === 0 && delta.y === 0) return [];
  return [{ type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], quadroIds: [c.quadroId], delta, manterJuncoes: false }];
}

/** A marca do centro de cargas na planta: de qual quadro ('TODOS' sem quadro) e onde ele estava ao marcar. */
export interface MarcaDoCentro {
  alvo: ObjectId | 'TODOS';
  quadroEm: Point | null;
}

export interface CentroNaPlanta {
  levelId: ObjectId;
  centro: Point;
  raioMm: number;
  posicaoSugerida: Point;
  rotulo: string;
}

/**
 * O que o canvas desenha para a marca — ou `null` quando ela ficou VELHA:
 * o quadro se moveu (pelo botão ou arrastado) ou sumiu; na de 'TODOS', o
 * primeiro quadro foi criado. É a regra "mover apaga a marca": a marca é de
 * vista, e a vista de antes do movimento não vale mais.
 */
export function centroNaPlanta(model: BlueprintModel, marca: MarcaDoCentro | null): CentroNaPlanta | null {
  if (!marca) return null;
  const quadros = model.quadros ?? [];
  if (marca.alvo === 'TODOS') {
    if (quadros.length > 0) return null;
  } else {
    const q = quadros.find((x) => x.id === marca.alvo);
    if (!q || !marca.quadroEm || q.at.x !== marca.quadroEm.x || q.at.y !== marca.quadroEm.y) return null;
  }
  const c = centroDeCargas(model, marca.alvo === 'TODOS' ? null : marca.alvo);
  if (!c) return null;
  const nome = c.quadroId ? quadros.find((x) => x.id === c.quadroId)?.nome ?? '' : '';
  return { levelId: c.levelId, centro: c.centro, raioMm: c.raioMm, posicaoSugerida: c.posicaoSugerida, rotulo: nome ? `Centro de cargas · ${nome}` : 'Centro de cargas' };
}

/** Quantos trechos elétricos têm uma ponta no quadro (a menos de 1 cm do centro dele). */
export function trechosNoQuadro(model: BlueprintModel, quadroId: ObjectId): number {
  const q = (model.quadros ?? []).find((x) => x.id === quadroId);
  if (!q) return 0;
  const perto = (p: Point) => Math.hypot(p.x - q.at.x, p.y - q.at.y) <= 10;
  return (model.trechos ?? []).filter((t) => t.disciplina === 'ELETRICA' && t.levelId === q.levelId && (perto(t.a) || perto(t.b))).length;
}
