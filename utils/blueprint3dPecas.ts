// utils/blueprint3dPecas.ts
//
// ONDE UMA PEÇA CAI NO 3D — a convenção do viewer, num lugar só e testável.
//
// ─── A CONVENÇÃO ─────────────────────────────────────────────────────────────
//
// Modelo: plano XY, Y para cima na planta, milímetro.
// Mundo:  X = x do modelo, Y = altura, **Z = y do modelo, SEM trocar o sinal**.
//
// É o que `geometriaDaEstrutural` e a parede fazem: `new Vector3(b.x - a.x, 0,
// b.y - a.y)` para a direção e `((a.y + b.y) / 2) * S` para a posição. O
// `shapeDoAnel` nega o `y` por outro motivo — ele passa por um `rotateX(-π/2)`
// que leva `y → −z`, e as duas negações se cancelam.
//
// ⚠️ O GIRO, POR CONSEQUÊNCIA, INVERTE DE SINAL. Um giro positivo em planta
// (anti-horário no XY) é negativo em torno do Y do mundo. A seção estrutural já
// fazia `-rotacaoDeg` por isso.
//
// ─── O DEFEITO QUE ISTO CONSERTA (23/09/2026) ───────────────────────────────
//
// Guarda-corpo e componentes usavam `-y` como Z e o giro com o sinal do modelo:
// no 3D eles saíam ESPELHADOS em relação às paredes, em torno do eixo X do
// mundo. Numa planta centrada na origem a diferença é pequena e passa; numa
// planta real, que vive a dezenas de metros da origem (ou a quilômetros, como o
// projeto importado da empresa), a peça vai parar longe do prédio — foi o que o
// usuário viu: o guarda-corpo desenhado na varanda aparecendo solto, fora da
// edificação.

/** Milímetro do modelo → metro do mundo. O mesmo do viewer. */
export const S_3D = 0.001;

export interface Ponto2D {
  x: number;
  y: number;
}

export interface PecaNoMundo {
  /** Posição do centro da caixa, em metros do mundo. */
  pos: [number, number, number];
  /** Giro em torno do eixo vertical, em radianos. */
  rot: number;
}

/**
 * Onde uma peça pontual (móvel, louça, equipamento) fica no mundo.
 *
 * `cotaMm` é a base acima do piso do pavimento (evaporadora, exaustor); a caixa
 * do three é centrada, então soma-se meia altura.
 */
export function pecaNoMundo(
  at: Ponto2D,
  rotacaoGraus: number,
  alturaMm: number,
  cotaMm: number,
  elevacaoDoNivelMm: number,
): PecaNoMundo {
  return {
    pos: [at.x * S_3D, (elevacaoDoNivelMm + cotaMm + alturaMm / 2) * S_3D, at.y * S_3D],
    rot: (-rotacaoGraus * Math.PI) / 180,
  };
}

export interface PainelNoMundo extends PecaNoMundo {
  /** Comprimento do trecho, em metros — vira o X local da caixa. */
  comprimentoM: number;
  /** Índice do trecho dentro da peça (1 = primeiro), para a chave de render. */
  trecho: number;
}

/**
 * Um painel por trecho de uma polilinha (guarda-corpo, corrimão).
 *
 * Trecho de menos de 1 mm é ruído de clique duplo e não vira painel: uma caixa
 * de comprimento zero aparece como um risco preto no meio do desenho.
 */
export function paineisDaPolilinha(
  pontos: readonly Ponto2D[],
  alturaMm: number,
  elevacaoDoNivelMm: number,
): PainelNoMundo[] {
  const saida: PainelNoMundo[] = [];
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1];
    const b = pontos[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1) continue;
    saida.push({
      comprimentoM: L * S_3D,
      pos: [((a.x + b.x) / 2) * S_3D, (elevacaoDoNivelMm + alturaMm / 2) * S_3D, ((a.y + b.y) / 2) * S_3D],
      // O mesmo giro da parede: a direção do trecho vira o X local, e o sinal
      // inverte porque o Z do mundo é o y do modelo.
      rot: -Math.atan2(b.y - a.y, b.x - a.x),
      trecho: i,
    });
  }
  return saida;
}
