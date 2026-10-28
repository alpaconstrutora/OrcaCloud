/**
 * NOMES DOS BLOCOS E DAS UNIDADES NO 3D (28/10/2026, *"implementar identificação dos blocos e das unidades
 * diretamente na planta 3d. Coloque também no filtro de exibir de forma que o usuário possa ocultar e exibir"*).
 *
 * Onde cada etiqueta fica, a partir dos prismas da massa que o 3D já desenha:
 *  - BLOCO: uma etiqueta por bloco, acima do último pavimento, no centro do contorno. O bloco que mora inteiro
 *    abaixo do chão (o subsolo "Torre A · Garagem") leva a etiqueta ABAIXO do fundo — em cima ela cairia sobre a
 *    torre e as duas se confundiriam.
 *  - UNIDADE: uma etiqueta por fatia (unidade × pavimento), no centro da fatia, a meia altura do pavimento. Só
 *    existe quando a massa está dividida nas unidades do Empreendimento.
 *
 * Coordenadas do 3D, em metros: o desenho (x, y) em mm vira (x/1000, altura, y/1000), como `shapeDoAnel` +
 * `rotateX(-π/2)` no visualizador.
 *
 * Puro: sem React, sem Three.
 */
import { centroDoAnel } from './blueprintMassa';

export interface PecaDaMassaParaRotulo {
  /** Id do bloco. */
  id: string;
  /** Chave do prisma (bloco × pavimento × unidade). */
  chave: string;
  anel: readonly { x: number; y: number }[];
  baseMm: number;
  topoMm: number;
  /** Nome do bloco ("Torre A"). */
  bloco?: string;
  /** Nome da unidade desta fatia ("101"); ausente quando a massa não está dividida em unidades. */
  rotuloDaUnidade?: string;
}

export interface RotuloDaMassa {
  chave: string;
  texto: string;
  tipo: 'BLOCO' | 'UNIDADE';
  /** Metros, no espaço do 3D. */
  posicao: [number, number, number];
}

/** Folga, em metros, entre a etiqueta do bloco e o topo (ou o fundo) dele. */
export const FOLGA_DO_ROTULO_DO_BLOCO_M = 1.5;

const S = 0.001;

export function rotulosDaMassa(
  pecas: readonly PecaDaMassaParaRotulo[],
  mostrar: { blocos: boolean; unidades: boolean },
): RotuloDaMassa[] {
  const out: RotuloDaMassa[] = [];

  if (mostrar.blocos) {
    const porBloco = new Map<string, { nome: string; minX: number; maxX: number; minY: number; maxY: number; base: number; topo: number }>();
    for (const p of pecas) {
      const nome = p.bloco?.trim();
      if (!nome || p.anel.length < 3) continue;
      const atual = porBloco.get(p.id) ?? { nome, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, base: Infinity, topo: -Infinity };
      for (const q of p.anel) {
        atual.minX = Math.min(atual.minX, q.x);
        atual.maxX = Math.max(atual.maxX, q.x);
        atual.minY = Math.min(atual.minY, q.y);
        atual.maxY = Math.max(atual.maxY, q.y);
      }
      atual.base = Math.min(atual.base, p.baseMm);
      atual.topo = Math.max(atual.topo, p.topoMm);
      porBloco.set(p.id, atual);
    }
    for (const [id, b] of porBloco) {
      const abaixoDoChao = b.topo <= 0;
      const y = abaixoDoChao ? b.base * S - FOLGA_DO_ROTULO_DO_BLOCO_M : b.topo * S + FOLGA_DO_ROTULO_DO_BLOCO_M;
      out.push({ chave: `bloco-${id}`, texto: b.nome, tipo: 'BLOCO', posicao: [((b.minX + b.maxX) / 2) * S, y, ((b.minY + b.maxY) / 2) * S] });
    }
  }

  if (mostrar.unidades) {
    for (const p of pecas) {
      const nome = p.rotuloDaUnidade?.trim();
      if (!nome || p.anel.length < 3 || p.topoMm <= p.baseMm) continue;
      const c = centroDoAnel(p.anel);
      out.push({ chave: `unidade-${p.chave}`, texto: nome, tipo: 'UNIDADE', posicao: [c.x * S, ((p.baseMm + p.topoMm) / 2) * S, c.y * S] });
    }
  }

  return out;
}
