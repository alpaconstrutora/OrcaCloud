/**
 * OS BLOCOS DE MASSA NO CORTE E NAS FACHADAS (29/10/2026): *"Massa: coloquei um corte na planta porém a mensagem que
 * recebo é nada para mostrar nesta vista. desenhe paredes na planta baixa"*. A vista (corte e elevação) só projetava
 * paredes, estrutura, telhado, escada e instalações — o estudo de massa, que é só blocos, saía "vazio".
 *
 * Cada bloco vira um retângulo no plano da vista (`u` ao longo, `v` a cota), com as linhas dos pavimentos:
 *  - no CORTE, o bloco que o plano atravessa sai CORTADO, um retângulo por trecho atravessado (num contorno em "L" o
 *    plano entra e sai duas vezes — `trechosCortados`); o que está atrás sai em VISTA; o que está na frente, não sai;
 *  - na FACHADA, todo bloco sai em vista.
 * A ordem é de trás para a frente (os mais fundos primeiro): quem desenha na ordem pinta o da frente por cima.
 *
 * Puro: sem React, sem canvas.
 */
import type { BlueprintModel, ObjectId, Point } from './blueprintKernel';
import type { BaseElevacao, ProjecaoElevacao } from './blueprintElevation';
import { classificarNoCorte, trechosCortados, type ProjecaoCorte } from './blueprintCorte';

export interface BlocoNaVista {
  blocoId: ObjectId;
  nome: string;
  uso: string;
  /** O plano atravessa o bloco (só no corte). */
  cortado: boolean;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  /** A cota de cada divisa entre pavimentos (as linhas do piso), de baixo para cima. */
  pisos: number[];
  /** Inteiro abaixo do chão (o subsolo): quem desenha traceja, como a fundação. */
  enterrado: boolean;
}

/**
 * `origem` = um ponto da linha de corte (o corte); `null` = a fachada. `levelIds` = os níveis da vista (omitido,
 * todos) — o bloco mora num nível, como as paredes.
 */
export function massaNaVista(model: BlueprintModel, base: BaseElevacao, origem: Point | null, levelIds?: readonly ObjectId[]): BlocoNaVista[] {
  const projU = (p: Point) => p.x * base.u.x + p.y * base.u.y;
  const profundidade = (p: Point) => p.x * base.d.x + p.y * base.d.y;
  const out: (BlocoNaVista & { fundo: number })[] = [];
  for (const b of model.blocos ?? []) {
    if (b.pontos.length < 3 || b.pavimentos <= 0 || b.peDireitoMm <= 0) continue;
    if (levelIds && !levelIds.includes(b.levelId)) continue;
    const vMin = b.cotaBaseMm;
    const vMax = b.cotaBaseMm + b.pavimentos * b.peDireitoMm;
    const pisos = Array.from({ length: b.pavimentos - 1 }, (_, k) => vMin + (k + 1) * b.peDireitoMm);
    const comum = { blocoId: b.id, nome: b.nome, uso: b.uso, vMin, vMax, pisos, enterrado: vMax <= 0 };
    const fundo = Math.min(...b.pontos.map(profundidade));
    if (origem) {
      const destino = classificarNoCorte(b.pontos, base, origem);
      if (destino === 'FRENTE') continue;
      if (destino === 'CORTADO') {
        for (const t of trechosCortados(b.pontos, base, origem)) out.push({ ...comum, cortado: true, uMin: t.uMin, uMax: t.uMax, fundo: -Infinity });
        continue;
      }
    }
    const us = b.pontos.map(projU);
    out.push({ ...comum, cortado: false, uMin: Math.min(...us), uMax: Math.max(...us), fundo });
  }
  // De trás para a frente: o mais fundo primeiro; o cortado (no plano) por último.
  return out.sort((a, b) => b.fundo - a.fundo).map(({ fundo: _f, ...x }) => x);
}

/**
 * A PROJEÇÃO COM A MASSA: a mesma projeção (corte ou fachada) com os blocos em `massa` e a caixa crescida para
 * eles. É ela que a tela, a prancha (PDF/PNG) e o DXF recebem — os três desenham a mesma coisa. Só com blocos, a
 * caixa é a deles (e a linha do solo); com peças, a união.
 */
export function comMassa<P extends ProjecaoElevacao | ProjecaoCorte>(model: BlueprintModel, proj: P, origem: Point | null, levelIds?: readonly ObjectId[]): P {
  const massa = massaNaVista(model, proj.base, origem, levelIds);
  if (massa.length === 0) return proj;
  const semPecas =
    proj.paredes.every((p) => p.degenerada) &&
    proj.estruturas.every((e) => e.degenerada) &&
    (proj.telhados ?? []).every((t) => t.degenerada) &&
    !('cortados' in proj && proj.cortados.length > 0) &&
    !('perfilDoTerreno' in proj && (proj.perfilDoTerreno ?? []).some((pedaco) => pedaco.length >= 2));
  const uMin = Math.min(...massa.map((b) => b.uMin));
  const uMax = Math.max(...massa.map((b) => b.uMax));
  const vMin = Math.min(proj.linhaDoSolo.v, ...massa.map((b) => b.vMin));
  const vMax = Math.max(...massa.map((b) => b.vMax));
  const bbox = semPecas
    ? { uMin, uMax, vMin, vMax }
    : { uMin: Math.min(proj.bbox.uMin, uMin), uMax: Math.max(proj.bbox.uMax, uMax), vMin: Math.min(proj.bbox.vMin, vMin), vMax: Math.max(proj.bbox.vMax, vMax) };
  // A linha do solo atravessa a caixa toda: sem estender, ela parava onde acabavam as peças.
  const linhaDoSolo = { ...proj.linhaDoSolo, uMin: Math.min(proj.linhaDoSolo.uMin, bbox.uMin), uMax: Math.max(proj.linhaDoSolo.uMax, bbox.uMax) };
  return { ...proj, massa, bbox, linhaDoSolo };
}
