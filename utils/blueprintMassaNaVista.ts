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
  /** Quantos pavimentos e o piso a piso (09/11/2026): o pavimento k (1 = o de baixo) vai de vMin + (k−1)·pé-direito. */
  pavimentos: number;
  peDireitoMm: number;
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
    const comum = { blocoId: b.id, nome: b.nome, uso: b.uso, vMin, vMax, pisos, enterrado: vMax <= 0, pavimentos: b.pavimentos, peDireitoMm: b.peDireitoMm };
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

/** Uma unidade de um pavimento do bloco, na planta (a fatia do 3D e da planta baixa). */
export interface FatiaDoPiso {
  nome: string;
  /** A Posição do cadastro (FRENTE, FUNDOS, LATERAL), ou null. */
  posicao: string | null;
  anel: readonly Point[];
}

/** Um trecho de unidade na vista: o retângulo dela no pavimento, onde o nome é escrito. */
export interface UnidadeNaVista {
  blocoId: ObjectId;
  /** O pavimento do bloco (1 = o de baixo). */
  indice: number;
  nome: string;
  posicao: string | null;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  /** Atravessada pelo plano (corte) ou vista. */
  cortada: boolean;
}

const MIN_TRECHO_MM = 1;

/** [a, b] menos os intervalos já cobertos, em pedaços. */
function semOsCobertos(a: number, b: number, cobertos: readonly [number, number][]): [number, number][] {
  let pedacos: [number, number][] = [[a, b]];
  for (const [c0, c1] of cobertos) {
    pedacos = pedacos.flatMap(([p0, p1]): [number, number][] => {
      if (c1 <= p0 || c0 >= p1) return [[p0, p1]];
      const out: [number, number][] = [];
      if (c0 > p0) out.push([p0, c0]);
      if (c1 < p1) out.push([c1, p1]);
      return out;
    });
  }
  return pedacos.filter(([p0, p1]) => p1 - p0 > MIN_TRECHO_MM);
}

/**
 * AS UNIDADES NA VISTA (09/11/2026, *"nos corte habilite exibir/ocultar identificação dos blocos, unidades, posição
 * etc"*): em cada pavimento de cada bloco da vista, os trechos de unidade, para escrever o número (e a Posição).
 *  - bloco CORTADO: as unidades que o plano atravessa, no trecho do bloco (`trechosCortados` de cada fatia);
 *  - bloco em VISTA (a fachada, ou atrás do plano): a unidade mais perto de quem olha cobre as de trás — cada
 *    fatia, da mais perto para a mais longe, fica com o que ainda não foi coberto.
 * `fatiasDoPiso(bloco, k)` diz as unidades do pavimento k; null (ou vazio) = o pavimento sai sem unidades.
 */
export function unidadesNaVista(
  blocos: readonly BlocoNaVista[],
  base: BaseElevacao,
  origem: Point | null,
  fatiasDoPiso: (blocoId: ObjectId, indice: number) => readonly FatiaDoPiso[] | null | undefined,
): UnidadeNaVista[] {
  const projU = (p: Point) => p.x * base.u.x + p.y * base.u.y;
  const profundidade = (p: Point) => p.x * base.d.x + p.y * base.d.y;
  const out: UnidadeNaVista[] = [];
  for (const b of blocos) {
    for (let k = 1; k <= b.pavimentos; k++) {
      const fatias = fatiasDoPiso(b.blocoId, k);
      if (!fatias || fatias.length === 0) continue;
      const vMin = b.vMin + (k - 1) * b.peDireitoMm;
      const vMax = vMin + b.peDireitoMm;
      const comum = (f: FatiaDoPiso) => ({ blocoId: b.blocoId, indice: k, nome: f.nome, posicao: f.posicao, vMin, vMax, cortada: b.cortado });
      if (b.cortado && origem) {
        for (const f of fatias) {
          if (f.anel.length < 3) continue;
          for (const t of trechosCortados([...f.anel], base, origem)) {
            const u0 = Math.max(t.uMin, b.uMin);
            const u1 = Math.min(t.uMax, b.uMax);
            if (u1 - u0 > MIN_TRECHO_MM) out.push({ ...comum(f), uMin: u0, uMax: u1 });
          }
        }
        continue;
      }
      const porPerto = fatias
        .filter((f) => f.anel.length >= 3)
        .map((f) => ({ f, perto: Math.min(...f.anel.map(profundidade)), us: f.anel.map(projU) }))
        .sort((x, y) => x.perto - y.perto);
      const cobertos: [number, number][] = [];
      for (const { f, us } of porPerto) {
        const u0 = Math.max(Math.min(...us), b.uMin);
        const u1 = Math.min(Math.max(...us), b.uMax);
        if (u1 - u0 <= MIN_TRECHO_MM) continue;
        for (const [p0, p1] of semOsCobertos(u0, u1, cobertos)) out.push({ ...comum(f), uMin: p0, uMax: p1 });
        cobertos.push([u0, u1]);
      }
    }
  }
  return out;
}
