// utils/blueprintGuardaCorpoEncosto.ts
//
// A PONTA DO GUARDA-CORPO QUE NÃO ENCOSTA EM NADA (P2.45, 23/09/2026).
//
// ─── O DEFEITO, MEDIDO NA PLANTA DO USUÁRIO ─────────────────────────────────
//
// O guarda-corpo inserido em 24/09 na Planta 14/09 vai de (3480, 975) a
// (3480, 6470), vertical. A primeira ponta caiu a **0 mm** do eixo de uma
// parede — o ímã do traçado pegou. A segunda parou a **163 mm** da ponta de uma
// parede que está NO MESMO EIXO x = 3480, isto é, é a continuação exata dela:
// 88 mm de folga até a face. Em planta, com o guarda-corpo desenhado como linha
// fina, esses 163 mm não se veem no zoom de trabalho; no 3D viram um buraco de
// 16 cm no peitoril — justamente na peça cuja função é ser barreira.
//
// Por que o ímã não pegou: ele existe (a ferramenta usa o mesmo `capturar` da
// parede), mas o alcance é `SNAP_PX / escala` — 12 px convertidos em milímetro
// pelo zoom. Em zoom de trabalho 163 mm ficam fora. Não é uma ferramenta sem
// ímã: é uma ferramenta cujo ímã não alcança, sem nada depois que verifique.
//
// ─── O QUE ESTE MÓDULO FAZ ──────────────────────────────────────────────────
//
// Responde uma pergunta só: **para onde esta ponta deveria ir?** A resposta
// serve tanto para encostar na hora de desenhar quanto para listar depois o que
// ficou solto — a mesma conta nos dois lugares, para que o aviso nunca discorde
// do que o botão faz.
//
// ⚠️ DOIS CANDIDATOS, E O PARALELO SÓ ACEITA UM. A ponta pode ir para o EIXO do
// alvo (projeção perpendicular) ou para uma PONTA dele. Contra um alvo
// atravessado, a projeção é o gesto certo: leva a ponta ao eixo da parede e o
// painel entra nela, sem fresta. Contra um alvo PARALELO, a projeção seria um
// desastre — puxaria o traço de lado, torcendo o desenho de quem correu o
// guarda-corpo rente a uma parede de propósito. Por isso o paralelo só encosta
// em ponta, que é o encontro que existe entre duas retas paralelas: o canto.
// (Foi o caso real acima: parede colinear, encontro na ponta dela.)

import type { BlueprintModel, ObjectId, Point } from './blueprintKernel';

/**
 * Até onde uma ponta é puxada, em milímetro.
 *
 * 300 mm é a mesma régua de `fecharCantos` na importação DXF (`MAX_CANTO_MM`):
 * acima disso não é junção mal fechada, é vão de propósito. O caso real do
 * usuário tinha 163 mm — dentro, mas não com folga: uma régua de 150 mm o
 * deixaria de fora por 13 mm.
 */
export const MAX_ENCOSTO_MM = 300;

/**
 * Espessura nominal do guarda-corpo como ALVO, em milímetro.
 *
 * O mesmo 50 mm que o painel tem no 3D (`Blueprint3DViewer`). Serve só para
 * decidir se uma ponta já está encostada nele — guarda-corpo não tem espessura
 * no modelo.
 */
export const ESPESSURA_DO_GUARDA_CORPO_MM = 50;

/** Abaixo disto dois segmentos são paralelos e o encosto no eixo não vale. */
const SENO_MINIMO = Math.sin((15 * Math.PI) / 180);

export interface AlvoDeEncosto {
  id: ObjectId;
  a: Point;
  b: Point;
  /** Largura do corpo desenhado, para saber se a ponta já está dentro dele. */
  espessuraMm: number;
}

export interface Encosto {
  /** Para onde a ponta vai, em mm inteiro. */
  to: Point;
  /** Quem a recebeu. */
  alvoId: ObjectId;
  /** Quanto a ponta anda, em mm — é a folga que estava aberta. */
  folgaMm: number;
  /** `PONTA` = canto com a extremidade do alvo; `EIXO` = entra no corpo dele. */
  tipo: 'PONTA' | 'EIXO';
}

/** Quadrado da distância entre dois pontos. */
function dist2(p: Point, q: Point): number {
  return (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
}

/** Projeção de `p` no segmento `a`–`b`, com o parâmetro preso em [0, 1]. */
function projetar(p: Point, a: Point, b: Point): { ponto: Point; t: number; dist: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  const ponto = { x: a.x + t * dx, y: a.y + t * dy };
  return { ponto, t, dist: Math.hypot(p.x - ponto.x, p.y - ponto.y) };
}

/** A ponta já está DENTRO do corpo desenhado do alvo? Então não há o que encostar. */
function dentroDoCorpo(p: Point, alvo: AlvoDeEncosto): boolean {
  const { dist } = projetar(p, alvo.a, alvo.b);
  return dist <= alvo.espessuraMm / 2;
}

/** Seno do ângulo entre a direção da ponta e o eixo do alvo. `null` = sem direção. */
function senoEntre(direcao: Point | null, alvo: AlvoDeEncosto): number | null {
  if (!direcao) return null;
  const n1 = Math.hypot(direcao.x, direcao.y);
  const n2 = Math.hypot(alvo.b.x - alvo.a.x, alvo.b.y - alvo.a.y);
  if (n1 === 0 || n2 === 0) return null;
  const cruz = direcao.x * (alvo.b.y - alvo.a.y) - direcao.y * (alvo.b.x - alvo.a.x);
  return Math.abs(cruz) / (n1 * n2);
}

/**
 * Para onde esta ponta vai — ou `null`, se ela já encosta ou não há nada perto.
 *
 * `direcao` é o vetor do trecho que chega na ponta (do outro vértice para ela).
 * Sem ela, todo alvo é tratado como paralelo: só encosta em ponta. É o que se
 * quer quando não se sabe de onde o traço vem — puxar de lado seria chute.
 */
export function encostoDaPonta(
  p: Point,
  direcao: Point | null,
  alvos: readonly AlvoDeEncosto[],
  maxMm = MAX_ENCOSTO_MM,
): Encosto | null {
  const candidatos: Encosto[] = [];
  const guardar = (c: Encosto) => {
    // Zero não é encosto: a ponta já está lá.
    if (c.folgaMm <= 0 || c.folgaMm > maxMm) return;
    candidatos.push(c);
  };

  for (const alvo of alvos) {
    if (dentroDoCorpo(p, alvo)) return null;

    const seno = senoEntre(direcao, alvo);
    // Sem direcao (`seno === null`) tudo conta como paralelo: puxar de lado
    // sem saber de onde o traco vem seria chute.
    const paralelo = seno === null || seno < SENO_MINIMO;

    // 1) A PONTA do alvo — o canto.
    //
    // ⚠️ Contra um alvo PARALELO, só topo a topo. Uma parede paralela que
    // termina ao lado da ponta está a menos de 300 mm dela, e grudar ali
    // torceria o traço de lado — é o guarda-corpo que corre rente à parede, de
    // propósito. Topo a topo significa que a ponta do alvo está praticamente
    // sobre a reta do traço: aí o encontro é o do caso real (parede colinear,
    // guarda-corpo continuando o eixo dela).
    for (const q of [alvo.a, alvo.b]) {
      const folgaMm = Math.sqrt(dist2(p, q));
      if (paralelo && direcao) {
        const n = Math.hypot(direcao.x, direcao.y);
        const lateral = n === 0 ? Infinity : Math.abs((q.x - p.x) * direcao.y - (q.y - p.y) * direcao.x) / n;
        if (lateral > ESPESSURA_DO_GUARDA_CORPO_MM) continue;
      }
      guardar({ to: { x: q.x, y: q.y }, alvoId: alvo.id, folgaMm, tipo: 'PONTA' });
    }

    // 2) O EIXO do alvo — só quando ele atravessa a direção do traço, e só
    //    quando a projeção cai DENTRO do segmento (t estritamente interno):
    //    projeção presa numa das pontas é o candidato 1 disfarçado, e aceitá-la
    //    aqui deixaria o paralelo entrar pela porta dos fundos.
    if (!paralelo) {
      const { ponto, t, dist } = projetar(p, alvo.a, alvo.b);
      if (t > 0 && t < 1) {
        guardar({ to: { x: Math.round(ponto.x), y: Math.round(ponto.y) }, alvoId: alvo.id, folgaMm: dist, tipo: 'EIXO' });
      }
    }
  }

  if (candidatos.length === 0) return null;
  const melhor = candidatos.reduce((a, b) => (b.folgaMm < a.folgaMm ? b : a));
  return {
    ...melhor,
    to: { x: Math.round(melhor.to.x), y: Math.round(melhor.to.y) },
    folgaMm: Math.round(melhor.folgaMm),
  };
}

/**
 * Tudo em que uma ponta pode encostar no pavimento: paredes e os OUTROS
 * guarda-corpos.
 *
 * `exceto` tira do conjunto o guarda-corpo que está sendo corrigido — sem isso
 * a ponta encostaria na peça dela mesma, que é o encontro que ela já tem.
 */
export function alvosDeEncosto(model: BlueprintModel, levelId: ObjectId, exceto?: ObjectId): AlvoDeEncosto[] {
  const saida: AlvoDeEncosto[] = [];
  for (const w of model.walls) {
    if (w.levelId !== levelId) continue;
    saida.push({ id: w.id, a: w.a, b: w.b, espessuraMm: w.thicknessMm });
  }
  for (const g of model.guardaCorpos ?? []) {
    if (g.levelId !== levelId || g.id === exceto) continue;
    for (let i = 1; i < g.pontos.length; i++) {
      saida.push({
        id: g.id,
        a: g.pontos[i - 1],
        b: g.pontos[i],
        espessuraMm: ESPESSURA_DO_GUARDA_CORPO_MM,
      });
    }
  }
  return saida;
}

export interface PontaSoltaDeGuardaCorpo extends Encosto {
  guardaCorpoId: ObjectId;
  /** Índice do vértice dentro de `pontos`. */
  index: number;
  /** Onde a ponta está hoje. */
  de: Point;
}

/**
 * As pontas de guarda-corpo do pavimento que deveriam encostar e não encostam.
 *
 * Só as PONTAS da polilinha (primeira e última): vértice do meio é dobra da
 * própria peça, e ali não falta encontro nenhum.
 */
export function guardaCorposSoltos(
  model: BlueprintModel,
  levelId: ObjectId,
  maxMm = MAX_ENCOSTO_MM,
): PontaSoltaDeGuardaCorpo[] {
  const saida: PontaSoltaDeGuardaCorpo[] = [];
  for (const g of model.guardaCorpos ?? []) {
    if (g.levelId !== levelId || g.pontos.length < 2) continue;
    const alvos = alvosDeEncosto(model, levelId, g.id);
    if (alvos.length === 0) continue;
    const ultimo = g.pontos.length - 1;
    for (const index of [0, ultimo]) {
      const p = g.pontos[index];
      const vizinho = g.pontos[index === 0 ? 1 : ultimo - 1];
      const direcao = { x: p.x - vizinho.x, y: p.y - vizinho.y };
      const encosto = encostoDaPonta(p, direcao, alvos, maxMm);
      if (encosto) saida.push({ ...encosto, guardaCorpoId: g.id, index, de: { x: p.x, y: p.y } });
    }
  }
  return saida;
}

/**
 * Os pontos novos de um guarda-corpo depois de aplicar as correções dele.
 *
 * Fica aqui, e não em quem chama, porque a lista vem achatada por ponta e
 * `SetGuardaCorpoProps` recebe a polilinha inteira: montar isso na UI seria
 * repetir a mesma costura em cada chamador.
 */
export function pontosCorrigidos(
  pontos: readonly Point[],
  correcoes: readonly PontaSoltaDeGuardaCorpo[],
): Point[] {
  const saida = pontos.map((p) => ({ x: p.x, y: p.y }));
  for (const c of correcoes) {
    if (c.index >= 0 && c.index < saida.length) saida[c.index] = { x: c.to.x, y: c.to.y };
  }
  return saida;
}
