/**
 * O ESTILO "CONCEPÇÃO" DO 3D (29/10/2026): *"para visualização de massa esse design está ok. Fazer uma nova opção
 * chamada Concepção para o usuário mostrar para o cliente"* — com quatro imagens de referência: diagramas de
 * concepção de massa (volumes claros, contorno forte, as camadas dos pavimentos, uma cor por bloco/uso, etiquetas de
 * chamada com linha tracejada, vista axonométrica sobre o lote em cor sólida). Decisões do usuário: um 4º estilo do
 * 3D, com os quatro elementos; unidades e envelope seguem o Exibir.
 *
 * Aqui, o que não depende do Three:
 *  - os BLOCOS: os prismas da massa (um por pavimento, ou por unidade) juntados de volta em um volume por bloco — o
 *    contorno forte é do bloco, não de cada pavimento;
 *  - a COR de destaque de cada uso e o tom claro do volume;
 *  - a CHAMADA de cada bloco: a caixa ao lado, para FORA da cena, ligada ao bloco por uma linha.
 *
 * Coordenadas do 3D em metros, como `blueprintRotulosDaMassa`: o desenho (x, y) em mm vira (x/1000, altura, y/1000).
 * Puro: sem React, sem Three.
 */
import { ROTULO_DO_USO_DO_BLOCO, type UsoDoBloco } from './blueprintKernel/model';

/** A cor forte de cada uso — contorno e etiqueta (a 1ª referência: torre azul, embasamento laranja). */
export const DESTAQUE_DO_USO: Record<UsoDoBloco, string> = {
  RESIDENCIAL: '#2563eb',
  COMERCIAL: '#ea580c',
  MISTO: '#7c3aed',
  GARAGEM: '#475569',
  LAZER: '#16a34a',
  TECNICO: '#dc2626',
};

/** O lote na Concepção: chão em cor sólida e contorno. */
export const COR_DO_LOTE_NA_CONCEPCAO = '#e7e2d9';
export const CONTORNO_DO_LOTE_NA_CONCEPCAO = '#57534e';

/** `cor` (#rrggbb) misturada com branco: `quanto` = 0 a cor, 1 o branco. */
export function tomClaro(cor: string, quanto: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(cor.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const canal = (c: number) => Math.round(c + (255 - c) * Math.min(1, Math.max(0, quanto)));
  const r = canal((n >> 16) & 255);
  const g = canal((n >> 8) & 255);
  const b = canal(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export interface PecaParaConcepcao {
  id: string;
  anel: readonly { x: number; y: number }[];
  baseMm: number;
  topoMm: number;
  /** Nome do bloco ("Torre A"). */
  bloco?: string;
  uso?: string;
  /** O contorno do BLOCO (a peça pode ser a fatia de uma unidade). Ausente = o próprio anel. */
  contornoDoBloco?: readonly { x: number; y: number }[];
  indice?: number;
}

export interface BlocoDaConcepcao {
  id: string;
  nome: string;
  uso: UsoDoBloco | null;
  /** Contorno e etiqueta. */
  cor: string;
  /** O volume: a cor quase branca. */
  corClara: string;
  contorno: { x: number; y: number }[];
  baseMm: number;
  topoMm: number;
  pavimentos: number;
}

const USOS = Object.keys(DESTAQUE_DO_USO) as UsoDoBloco[];

/** Um volume por bloco, a partir dos prismas da massa (na ordem em que os blocos aparecem). */
export function blocosDaConcepcao(pecas: readonly PecaParaConcepcao[]): BlocoDaConcepcao[] {
  const porId = new Map<string, BlocoDaConcepcao & { indices: Set<number> }>();
  for (const p of pecas) {
    const contorno = p.contornoDoBloco ?? p.anel;
    if (contorno.length < 3 || p.topoMm <= p.baseMm) continue;
    let b = porId.get(p.id);
    if (!b) {
      const uso = USOS.includes(p.uso as UsoDoBloco) ? (p.uso as UsoDoBloco) : null;
      const cor = uso ? DESTAQUE_DO_USO[uso] : '#334155';
      b = { id: p.id, nome: p.bloco?.trim() || 'Bloco', uso, cor, corClara: tomClaro(cor, 0.9), contorno: contorno.map((q) => ({ x: q.x, y: q.y })), baseMm: p.baseMm, topoMm: p.topoMm, pavimentos: 0, indices: new Set() };
      porId.set(p.id, b);
    }
    b.baseMm = Math.min(b.baseMm, p.baseMm);
    b.topoMm = Math.max(b.topoMm, p.topoMm);
    b.indices.add(p.indice ?? b.indices.size + 1);
  }
  return [...porId.values()].map(({ indices, ...b }) => ({ ...b, pavimentos: indices.size }));
}

export type V3 = [number, number, number];

export interface ChamadaDoBloco {
  chave: string;
  titulo: string;
  subtitulo: string;
  cor: string;
  /** Onde a linha encosta no bloco (na face, a meia altura). */
  ancora: V3;
  /** Onde fica a caixa. */
  rotulo: V3;
}

const S = 0.001;
/** O afastamento da caixa até o bloco: um mínimo e mais um tanto do tamanho do bloco. */
const AFASTAMENTO_MIN_M = 6;
const AFASTAMENTO_DO_TAMANHO = 0.35;

/**
 * A chamada de cada bloco: a caixa do lado de FORA da cena (do centro dos blocos para o centro deste), na altura do
 * meio do bloco. Blocos de mesmo contorno (a torre e o subsolo dela) saem para o mesmo lado, cada um na sua altura.
 */
export function chamadasDaConcepcao(blocos: readonly BlocoDaConcepcao[]): ChamadaDoBloco[] {
  if (blocos.length === 0) return [];
  const caixas = blocos.map((b) => {
    const xs = b.contorno.map((q) => q.x);
    const ys = b.contorno.map((q) => q.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, hx: (maxX - minX) / 2, hy: (maxY - minY) / 2 };
  });
  const centro = { x: caixas.reduce((s, c) => s + c.cx, 0) / caixas.length, y: caixas.reduce((s, c) => s + c.cy, 0) / caixas.length };
  return blocos.map((b, i) => {
    const c = caixas[i];
    let dx = c.cx - centro.x;
    let dy = c.cy - centro.y;
    const len = Math.hypot(dx, dy);
    // No centro (um bloco só, ou o do meio): para +x, o lado direito da vista padrão.
    if (len < 1) {
      dx = 1;
      dy = 0;
    } else {
      dx /= len;
      dy /= len;
    }
    // Até a face da caixa do bloco, na direção escolhida.
    const t = Math.min(Math.abs(dx) > 1e-9 ? c.hx / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-9 ? c.hy / Math.abs(dy) : Infinity);
    const afastamento = AFASTAMENTO_MIN_M * 1000 + AFASTAMENTO_DO_TAMANHO * 2 * Math.max(c.hx, c.hy);
    const meio = ((b.baseMm + b.topoMm) / 2) * S;
    const ancora: V3 = [(c.cx + dx * t) * S, meio, (c.cy + dy * t) * S];
    const rotulo: V3 = [(c.cx + dx * (t + afastamento)) * S, meio, (c.cy + dy * (t + afastamento)) * S];
    const uso = b.uso ? ROTULO_DO_USO_DO_BLOCO[b.uso] : null;
    const subtitulo = [uso, `${b.pavimentos} pav`].filter(Boolean).join(' · ');
    return { chave: `chamada-${b.id}`, titulo: b.nome, subtitulo, cor: b.cor, ancora, rotulo };
  });
}
