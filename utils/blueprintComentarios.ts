// utils/blueprintComentarios.ts
//
// O que a tela mostra de um comentário — puro, sem banco e sem React.
//
// ─── O PROBLEMA QUE ISTO RESOLVE ─────────────────────────────────────────────
//
// Um comentário ancorado num elemento sobrevive à revisão seguinte, mas o
// ELEMENTO pode não sobreviver. As três situações são diferentes e a tela tem
// de saber distingui-las:
//
//   • o elemento está lá             → o marcador vai em cima dele
//   • o elemento SUMIU               → o marcador vai no ponto guardado, e a
//                                       tela DIZ que a peça não existe mais
//   • o comentário é de LUGAR        → nunca teve elemento; vai no ponto
//
// ⚠️ O caso do meio é o que exige cuidado. Esconder o comentário quando a peça
// some seria apagar uma pendência sem que ninguém decidisse apagá-la: a pessoa
// que comentou nunca saberia que o assunto virou pó junto com a parede.

import { contornoEmPlanta, type BlueprintModel, type Point } from './blueprintKernel';

/** O mínimo que esta conta precisa saber de um comentário. */
export interface ComentarioAncorado {
  element_uid: string | null;
  ponto_x_mm: number | null;
  ponto_y_mm: number | null;
  level_uid: string | null;
  resolvido_em: string | null;
}

export type SituacaoDoComentario = 'ANCORADO' | 'ELEMENTO_SUMIU' | 'LUGAR';

/** Índice uid → posição em planta, de todas as famílias que têm identidade. */
export function posicoesPorUid(model: BlueprintModel): Map<string, Point> {
  const mapa = new Map<string, Point>();
  const meio = (pontos: Point[]): Point | null => {
    if (pontos.length === 0) return null;
    const sx = pontos.reduce((s, p) => s + p.x, 0);
    const sy = pontos.reduce((s, p) => s + p.y, 0);
    return { x: Math.round(sx / pontos.length), y: Math.round(sy / pontos.length) };
  };

  for (const w of model.walls) {
    if (w.uid) mapa.set(w.uid, meio([w.a, w.b])!);
  }
  for (const b of model.boundaries) {
    if (b.uid) mapa.set(b.uid, meio([b.a, b.b])!);
  }
  for (const e of model.structures ?? []) {
    if (!e.uid) continue;
    const p = meio(contornoEmPlanta(e));
    if (p) mapa.set(e.uid, p);
  }
  for (const s of model.stairs ?? []) {
    if (s.uid) {
      const p = meio(s.pontos ?? []);
      if (p) mapa.set(s.uid, p);
    }
  }
  for (const r of model.roofs ?? []) {
    if (r.uid) {
      const p = meio(r.pontos ?? []);
      if (p) mapa.set(r.uid, p);
    }
  }
  for (const l of model.labels ?? []) {
    if (l.uid) mapa.set(l.uid, { x: l.at.x, y: l.at.y });
  }

  // A ABERTURA fica no eixo da parede que a hospeda, no meio do vão. Sem isto o
  // comentário de uma porta cairia na origem do desenho — longe da porta, e num
  // lugar que parece proposital.
  const paredePorId = new Map(model.walls.map((w) => [w.id, w]));
  for (const o of model.openings) {
    if (!o.uid) continue;
    const w = paredePorId.get(o.wallId);
    if (!w) continue;
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const comp = Math.hypot(dx, dy);
    if (!(comp > 0)) continue;
    const t = (o.offsetMm + o.widthMm / 2) / comp;
    mapa.set(o.uid, {
      x: Math.round(w.a.x + dx * t),
      y: Math.round(w.a.y + dy * t),
    });
  }

  return mapa;
}

export interface ComentarioNaTela<T extends ComentarioAncorado> {
  comentario: T;
  situacao: SituacaoDoComentario;
  /** Onde desenhar o marcador. `null` = não há onde. */
  ponto: Point | null;
}

/**
 * Situa cada comentário contra o modelo ATUAL.
 *
 * ⚠️ Comentário cujo elemento sumiu NÃO é escondido: ele volta com
 * `ELEMENTO_SUMIU`, e cabe à tela dizer isso. Escondê-lo apagaria uma pendência
 * que ninguém decidiu apagar.
 *
 * ⚠️ E o ponto do elemento vence o ponto guardado quando os dois existem: a
 * peça pode ter sido MOVIDA depois do comentário, e o marcador tem de seguir a
 * peça — é para isso que a âncora por identidade serve. Um marcador parado onde
 * a parede estava é pior que nenhum, porque aponta para o lugar errado com
 * confiança.
 */
export function situarComentarios<T extends ComentarioAncorado>(
  comentarios: T[],
  model: BlueprintModel,
): ComentarioNaTela<T>[] {
  const posicoes = posicoesPorUid(model);
  return comentarios.map((comentario) => {
    const guardado =
      comentario.ponto_x_mm !== null && comentario.ponto_y_mm !== null
        ? { x: comentario.ponto_x_mm, y: comentario.ponto_y_mm }
        : null;

    if (!comentario.element_uid) {
      return { comentario, situacao: 'LUGAR' as const, ponto: guardado };
    }
    const doElemento = posicoes.get(comentario.element_uid);
    if (doElemento) {
      return { comentario, situacao: 'ANCORADO' as const, ponto: doElemento };
    }
    return { comentario, situacao: 'ELEMENTO_SUMIU' as const, ponto: guardado };
  });
}

/** Quantos comentários abertos há em cada situação — o resumo do painel. */
export function resumo<T extends ComentarioAncorado>(situados: ComentarioNaTela<T>[]) {
  const abertos = situados.filter((s) => !s.comentario.resolvido_em);
  return {
    abertos: abertos.length,
    resolvidos: situados.length - abertos.length,
    // Contado só entre os ABERTOS: um comentário já resolvido cujo elemento
    // sumiu não é pendência nenhuma — provavelmente sumiu porque foi resolvido.
    orfaos: abertos.filter((s) => s.situacao === 'ELEMENTO_SUMIU').length,
  };
}
