// utils/dxfConferirPortas.ts
//
// CONFERIR O LADO DAS PORTAS contra o desenho de origem (P2.39).
//
// ─── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
//
// A porta tem duas orientações independentes — de que ponta sai a dobradiça
// (`hingeAtStart`) e para que lado a folha abre (`swingReversed`) — e o
// reconhecimento as deriva do arco do DXF. Quando erra, ou quando o desenho já
// entrou por uma versão anterior do leitor, o arco aparece espelhado na tela: o
// sintoma que o usuário vê, e que nenhuma conta interna denuncia, porque o
// modelo está coerente consigo mesmo.
//
// Aqui a pergunta é outra e é verificável: **o arco que o app DESENHA cai em
// cima do arco do arquivo?** Com o desenho guardado ao lado da prancha (P2.38)
// dá para responder porta por porta, e propor a correção — que é sempre um
// giro de um dos dois booleanos, nunca uma mudança de geometria.
//
// ─── O CRITÉRIO ─────────────────────────────────────────────────────────────
//
// Para cada porta, montam-se as QUATRO combinações de dobradiça × lado e
// mede-se o quanto o arco desenhado se afasta do arco do arquivo em DOIS
// pontos: o PIVÔ (que é a dobradiça) contra o centro do arco, e o ponto médio
// do quarto de volta contra o do arquivo. Os dois somados, porque cada um pega
// um erro:
//
//  - o lado errado joga o meio do arco para o outro lado da parede (~1,3 m numa
//    porta de 80 cm), mas quase não mexe no pivô;
//  - ⚠️ a DOBRADIÇA errada move o meio só ~370 mm — menos que meia porta, e
//    perto demais do ruído para decidir sozinha. No pivô, porém, o erro é a
//    largura inteira do vão. Medir só o meio, como a primeira versão fazia,
//    deixava passar exatamente a metade dos casos.
//
// A combinação vencedora só substitui a atual quando a atual está claramente
// errada (acima de `LONGE_MM`) e a vencedora claramente certa (abaixo de
// `PERTO_MM`) — na dúvida, não se mexe no desenho de ninguém.

import { lerDxf, type ArcoDxf } from './dxfLeitor';
import type { BlueprintModel, Command, ObjectId } from './blueprintKernel';

/** Abaixo disto o arco desenhado é o arco do arquivo (pivô + meio somados). */
export const PERTO_MM = 350;
/** Acima disto ele está em outro lugar — e a porta merece correção. */
export const LONGE_MM = 600;
/**
 * O centro do arco tem de estar perto de uma das ombreiras para ser o arco DESTA porta.
 *
 * ⚠️ APERTADO DE PROPÓSITO. Medido no projeto real, o centro cai a 15–136 mm da ombreira (o desenhista
 * põe a dobradiça na face ou no eixo). Com 450 mm de tolerância, um deslocamento errado de meio metro
 * fazia o arco de uma porta casar com a ombreira da porta VIZINHA — e a conferência "corrigiria" o que
 * estava certo. Frouxo aqui é pior que apertado: porta sem par é relatada, porta com par errado é dano.
 */
const CENTRO_MAX_MM = 300;

export interface PortaParaCorrigir {
  openingId: ObjectId;
  wallId: ObjectId;
  /** Onde a porta está, para a mensagem e para o teste. */
  offsetMm: number;
  widthMm: number;
  distanciaAtualMm: number;
  distanciaCorrigidaMm: number;
  virarDobradica: boolean;
  virarLado: boolean;
}

export interface ConferenciaDePortas {
  /** Portas que têm um arco correspondente no desenho — as únicas sobre as quais há o que dizer. */
  conferidas: number;
  certas: number;
  corrigir: PortaParaCorrigir[];
  /** Portas sem arco no desenho (porta sem símbolo, ou desenhada à mão depois). */
  semArco: number;
}

interface Ponto {
  x: number;
  y: number;
}

const graus = (g: number) => (g * Math.PI) / 180;

/** Os arcos de folha do desenho, em mm do modelo (com a unidade e o deslocamento da importação). */
function arcosDeFolha(arcos: readonly ArcoDxf[], mmPorUnidade: number, dx: number, dy: number) {
  const saida: { c: Ponto; raio: number; meio: Ponto }[] = [];
  for (const a of arcos) {
    const raio = a.raio * mmPorUnidade;
    if (raio < 500 || raio > 1600) continue;
    let v = (a.anguloFinal - a.anguloInicial) % 360;
    if (v < 0) v += 360;
    if (v < 60 || v > 120) continue;
    const c = { x: a.centro.x * mmPorUnidade + dx, y: a.centro.y * mmPorUnidade + dy };
    saida.push({ c, raio, meio: { x: c.x + raio * Math.cos(graus(a.anguloInicial + v / 2)), y: c.y + raio * Math.sin(graus(a.anguloInicial + v / 2)) } });
  }
  return saida;
}

/**
 * O pivô e o ponto médio do arco que o app desenha — a MESMA fórmula do canvas
 * (`BlueprintCanvas`) e do PDF (`blueprintExport`): pivô na ponta da dobradiça
 * deslocado meia espessura para o lado que abre, folha na normal, raio = largura.
 */
export function arcoDaPorta(
  a: Ponto,
  b: Ponto,
  espessuraMm: number,
  offsetMm: number,
  widthMm: number,
  hingeAtStart: boolean,
  swingReversed: boolean,
): { piv: Ponto; meio: Ponto } {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / L;
  const uy = (b.y - a.y) / L;
  const nx = -uy;
  const ny = ux;
  const ini = { x: a.x + ux * offsetMm, y: a.y + uy * offsetMm };
  const fim = { x: a.x + ux * (offsetMm + widthMm), y: a.y + uy * (offsetMm + widthMm) };
  const lado = swingReversed ? -1 : 1;
  const base = hingeAtStart ? ini : fim;
  const piv = { x: base.x + nx * (espessuraMm / 2) * lado, y: base.y + ny * (espessuraMm / 2) * lado };
  const eixo = { x: hingeAtStart ? ux : -ux, y: hingeAtStart ? uy : -uy };
  const folha = { x: nx * lado, y: ny * lado };
  const c45 = Math.SQRT1_2;
  return { piv, meio: { x: piv.x + (eixo.x + folha.x) * c45 * widthMm, y: piv.y + (eixo.y + folha.y) * c45 * widthMm } };
}

export interface DesenhoParaConferir {
  texto: string;
  mmPorUnidade: number;
  dx: number;
  dy: number;
}

/** Confere cada porta do pavimento contra o arco do desenho. Não muda nada: só diz. */
export function conferirPortas(model: BlueprintModel, levelId: ObjectId, desenho: DesenhoParaConferir): ConferenciaDePortas {
  const arcos = arcosDeFolha(lerDxf(desenho.texto).arcos, desenho.mmPorUnidade, desenho.dx, desenho.dy);
  const paredes = new Map(model.walls.filter((w) => w.levelId === levelId).map((w) => [w.id, w]));
  const saida: ConferenciaDePortas = { conferidas: 0, certas: 0, corrigir: [], semArco: 0 };
  if (arcos.length === 0) return saida;

  for (const o of model.openings) {
    if (o.kind !== 'door') continue;
    const w = paredes.get(o.wallId);
    if (!w) continue;
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const ux = (w.b.x - w.a.x) / L;
    const uy = (w.b.y - w.a.y) / L;
    const ini = { x: w.a.x + ux * o.offsetMm, y: w.a.y + uy * o.offsetMm };
    const fim = { x: w.a.x + ux * (o.offsetMm + o.widthMm), y: w.a.y + uy * (o.offsetMm + o.widthMm) };

    let arco: (typeof arcos)[number] | null = null;
    let perto = Infinity;
    for (const a of arcos) {
      const d = Math.min(Math.hypot(a.c.x - ini.x, a.c.y - ini.y), Math.hypot(a.c.x - fim.x, a.c.y - fim.y));
      if (d < perto) {
        perto = d;
        arco = a;
      }
    }
    if (!arco || perto > CENTRO_MAX_MM) {
      saida.semArco++;
      continue;
    }
    saida.conferidas++;

    const distancia = (hinge: boolean, swing: boolean) => {
      const r = arcoDaPorta(w.a, w.b, w.thicknessMm, o.offsetMm, o.widthMm, hinge, swing);
      return Math.hypot(r.piv.x - arco!.c.x, r.piv.y - arco!.c.y) + Math.hypot(r.meio.x - arco!.meio.x, r.meio.y - arco!.meio.y);
    };
    const atual = distancia(o.hingeAtStart, o.swingReversed);
    let melhor = { hinge: o.hingeAtStart, swing: o.swingReversed, d: atual };
    for (const hinge of [true, false]) {
      for (const swing of [true, false]) {
        const d = distancia(hinge, swing);
        if (d < melhor.d) melhor = { hinge, swing, d };
      }
    }
    if (atual <= PERTO_MM || melhor.d > PERTO_MM || atual <= LONGE_MM) {
      // Ou já está certa, ou nenhuma combinação convence: não se mexe.
      if (atual <= PERTO_MM) saida.certas++;
      else saida.semArco++;
      continue;
    }
    saida.corrigir.push({
      openingId: o.id,
      wallId: w.id,
      offsetMm: o.offsetMm,
      widthMm: o.widthMm,
      distanciaAtualMm: Math.round(atual),
      distanciaCorrigidaMm: Math.round(melhor.d),
      virarDobradica: melhor.hinge !== o.hingeAtStart,
      virarLado: melhor.swing !== o.swingReversed,
    });
  }
  return saida;
}

/** Os comandos que corrigem o que a conferência achou — um giro por eixo, nada de geometria. */
export function comandosDaCorrecao(portas: readonly PortaParaCorrigir[]): Command[] {
  const saida: Command[] = [];
  for (const p of portas) {
    if (p.virarDobradica) saida.push({ type: 'FlipOpening', openingId: p.openingId, axis: 'hinge' });
    if (p.virarLado) saida.push({ type: 'FlipOpening', openingId: p.openingId, axis: 'swing' });
  }
  return saida;
}
