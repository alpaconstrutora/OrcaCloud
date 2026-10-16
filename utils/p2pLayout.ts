/**
 * Geometria do canvas da Torre de Controle (fluxo P2P) — puro, sem React e
 * sem Supabase, para o desenho ser testável e determinístico.
 *
 * O fluxo tem posições FIXAS por id (coluna × linha), não um algoritmo de
 * layout: são 8 etapas conhecidas, e um arranjo escolhido à mão lê melhor do
 * que qualquer heurística. Id que o serviço vier a inventar cai numa grade de
 * reserva (abaixo das linhas conhecidas) em vez de sumir do desenho.
 */

export interface Ret {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Ponto {
  x: number;
  y: number;
}

export const NODE_W = 208;
export const NODE_H = 148;
/** Vão entre colunas: cabe o rótulo curto da aresta ("Orquestrada · 3") sem invadir os cartões. */
export const COL_GAP = 112;
export const ROW_GAP = 32;
/** Respiro entre a caixa do grupo e os nós que ela contém. */
export const GROUP_PAD = 20;
/** Margem do desenho inteiro (deixa a caixa do grupo da primeira coluna aparecer). */
export const MARGEM = 32;

/** Coluna × linha de cada etapa. A linha 0.5 = centrada entre as duas linhas. */
const CELULA_DO_NO: Record<string, { col: number; linha: number }> = {
  solicitacao: { col: 0, linha: 0.5 },
  cotacao:     { col: 1, linha: 0.5 },
  pedido:      { col: 2, linha: 0.5 },
  recebimento: { col: 3, linha: 0.5 },
  estoque:     { col: 4, linha: 0 },
  fiscal:      { col: 4, linha: 1 },
  financeiro:  { col: 5, linha: 0.5 },
  pagamento:   { col: 6, linha: 0.5 },
};

const PASSO_X = NODE_W + COL_GAP;
const PASSO_Y = NODE_H + ROW_GAP;

/** Retângulo de uma célula (coluna × linha) em px do desenho. */
function retDaCelula(col: number, linha: number): Ret {
  return { x: MARGEM + col * PASSO_X, y: MARGEM + linha * PASSO_Y, w: NODE_W, h: NODE_H };
}

/**
 * Posição de cada nó. Ids desconhecidos ganham uma linha de reserva (linha 2),
 * em colunas sucessivas — ficam visíveis e não se sobrepõem aos conhecidos.
 */
export function posicoesDosNos(ids: readonly string[]): Record<string, Ret> {
  const out: Record<string, Ret> = {};
  let reserva = 0;
  for (const id of ids) {
    const c = CELULA_DO_NO[id];
    out[id] = c ? retDaCelula(c.col, c.linha) : retDaCelula(reserva++, 2);
  }
  return out;
}

/** Caixa que envolve os nós de um grupo, com `GROUP_PAD` de respiro. Null se nenhum nó do grupo está no desenho. */
export function caixaDoGrupo(nodeIds: readonly string[], posicoes: Record<string, Ret>): Ret | null {
  const rets = nodeIds.map(id => posicoes[id]).filter((r): r is Ret => !!r);
  if (rets.length === 0) return null;
  const minX = Math.min(...rets.map(r => r.x)) - GROUP_PAD;
  const minY = Math.min(...rets.map(r => r.y)) - GROUP_PAD;
  const maxX = Math.max(...rets.map(r => r.x + r.w)) + GROUP_PAD;
  const maxY = Math.max(...rets.map(r => r.y + r.h)) + GROUP_PAD;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Tamanho do desenho inteiro (para enquadrar e para o `<svg>`), incluindo as caixas de grupo e a margem. */
export function tamanhoDoDesenho(posicoes: Record<string, Ret>): { w: number; h: number } {
  const rets = Object.values(posicoes);
  if (rets.length === 0) return { w: 0, h: 0 };
  return {
    w: Math.max(...rets.map(r => r.x + r.w)) + GROUP_PAD + MARGEM,
    h: Math.max(...rets.map(r => r.y + r.h)) + GROUP_PAD + MARGEM,
  };
}

/**
 * Caminho ortogonal de A para B: sai pelo meio da borda direita de A e entra
 * pelo meio da borda esquerda de B. Mesma linha → um traço reto; linhas
 * diferentes → desce/sobe no meio do vão (`H xm V y1 H x1`), nunca antes de
 * `degrau` px para a seta não nascer colada no cartão. `meio` é o centro do
 * primeiro trecho horizontal — onde o rótulo da aresta senta.
 */
export function caminhoOrtogonal(a: Ret, b: Ret, degrau = 24): { d: string; meio: Ponto } {
  const x0 = a.x + a.w;
  const y0 = a.y + a.h / 2;
  const x1 = b.x;
  const y1 = b.y + b.h / 2;
  if (Math.abs(y0 - y1) < 1) {
    return { d: `M ${x0} ${y0} H ${x1}`, meio: { x: (x0 + x1) / 2, y: y0 } };
  }
  const xm = x0 + Math.max(degrau, (x1 - x0) / 2);
  return { d: `M ${x0} ${y0} H ${xm} V ${y1} H ${x1}`, meio: { x: (x0 + xm) / 2, y: y0 } };
}

/** Dois retângulos se sobrepõem (área comum > 0)? */
export function sobrepoe(a: Ret, b: Ret): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Vista que enquadra o desenho na área, centralizado, sem passar de `max`.
 *
 * `legivel` (opcional) é o piso da vista INICIAL: o fluxo tem 7 colunas e, num
 * canvas de ~700px, caber inteiro significa 35% — cartões ilegíveis (medido em
 * 16/10/2026). Com o piso, a vista abre legível, alinhada ao início do fluxo
 * (dx = 0) e centrada na vertical; o resto fica à direita, para o pan. O
 * botão "Enquadrar" chama sem o piso e mostra tudo.
 */
export function enquadrarDesenho(
  desenho: { w: number; h: number },
  area: { w: number; h: number },
  limites: { min: number; max: number; legivel?: number },
): { escala: number; dx: number; dy: number } {
  if (desenho.w <= 0 || desenho.h <= 0 || area.w <= 0 || area.h <= 0) return { escala: 1, dx: 0, dy: 0 };
  const cabe = Math.min(limites.max, Math.max(limites.min, Math.min(area.w / desenho.w, area.h / desenho.h)));
  const escala = limites.legivel != null ? Math.max(cabe, Math.min(limites.legivel, limites.max)) : cabe;
  const sobraX = area.w - desenho.w * escala;
  return {
    escala,
    dx: sobraX >= 0 ? sobraX / 2 : 0,
    dy: (area.h - desenho.h * escala) / 2,
  };
}
