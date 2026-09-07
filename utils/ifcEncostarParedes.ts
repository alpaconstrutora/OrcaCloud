// utils/ifcEncostarParedes.ts
//
// Encostar no EIXO a ponta que o arquivo desenhou até a FACE.
//
// ─── O PROBLEMA, MEDIDO ──────────────────────────────────────────────────────
//
// As paredes do IFC entram com a geometria certa e o desenho não fecha em
// ambiente. Medido no FZK-Haus já importado, a distância de cada ponta de parede
// ao segmento mais próximo:
//
//   16 pontas a 0 mm · 9 entre 120 e 170 mm · 1 a 1.624 mm
//
// E as espessuras do arquivo são 240 e 300. As folgas de **120 e 150** são
// exatamente METADE delas: a parede interna foi desenhada até a FACE da parede
// que ela encontra, não até o eixo. É a convenção normal de quem desenha.
//
// O kernel guarda o EIXO, e `recomputeSpaces` já parte os segmentos onde eles se
// cruzam (`splitAtIntersections`) — então o T em si não é problema. O problema é
// que a ponta para meia espessura ANTES de cruzar. O anel não fecha, não há
// ambiente, e sem ambiente não há área, piso, forro nem quantitativo: a parede
// entra certa e o desenho não vira orçamento.
//
// ─── POR QUE ISTO NÃO É "CONSERTAR O DESENHO ALHEIO" ─────────────────────────
//
// A permissão para mover a ponta é estreita e verificável: ela só se move quando
// já está DENTRO do corpo da outra parede. Estar dentro do concreto é a prova de
// que o traço foi até a face; levá-la ao eixo é ler a convenção, não inventar
// geometria. Fora dessa condição a ponta fica onde está e é RELATADA — o caso de
// 1.624 mm é uma parede de fato solta, e emendá-la seria desenhar por cima do
// projeto de outra pessoa.
//
// A ponta anda só na DIREÇÃO DA PRÓPRIA PAREDE. Movê-la de lado giraria o
// trecho, e uma parede girada meio grau some do alinhamento de tudo o que vem
// depois.

/** O mínimo que esta conta precisa saber de uma parede. */
export interface ParedeEncostavel {
  a: { x: number; y: number };
  b: { x: number; y: number };
  espessuraMm: number;
}

export interface ResultadoDoEncosto<T> {
  paredes: T[];
  /** Quantas pontas foram levadas da face até o eixo. */
  encostadas: number;
  /** Pontas que continuam sem tocar em parede nenhuma — relatadas, não emendadas. */
  soltas: number;
}

/** Ponto mais próximo de `q` no segmento `a→b`, e a que distância. */
function noSegmento(
  q: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): { t: number; distancia: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return { t: 0, distancia: Math.hypot(q.x - a.x, q.y - a.y) };
  const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2));
  return { t, distancia: Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy)) };
}

/**
 * Onde a reta de `p→d` cruza a reta `a→b`, como múltiplo de `d` a partir de `p`.
 * `null` quando são paralelas.
 */
function cruzamento(
  p: { x: number; y: number },
  d: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number | null {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const den = d.x * ey - d.y * ex;
  if (den === 0) return null;
  return ((a.x - p.x) * ey - (a.y - p.y) * ex) / den;
}

/**
 * Leva ao eixo cada ponta que parou dentro do corpo da parede vizinha.
 *
 * Genérico no tipo para não amarrar a tradução do IFC: a conta é de geometria e
 * vale para qualquer lista de paredes com eixo e espessura.
 *
 * `folgaMm` é o quanto se aceita além de meia espessura — 1 mm, porque a
 * conversão para milímetro inteiro já arredonda e a folga medida bate na casa
 * do milímetro. Frouxo aqui é pior que apertado: uma ponta que NÃO estava na
 * face passaria a andar sem que ninguém tivesse desenhado aquilo.
 */
export function encostarNasFaces<T extends ParedeEncostavel>(
  paredes: T[],
  folgaMm = 1,
): ResultadoDoEncosto<T> {
  const pontas = paredes.flatMap((p) => [p.a, p.b]);
  const jaTocaOutraPonta = (q: { x: number; y: number }, meu: number) =>
    pontas.some((r, k) => Math.floor(k / 2) !== meu && r.x === q.x && r.y === q.y);

  let encostadas = 0;
  let soltas = 0;

  const saida = paredes.map((parede, i) => {
    const novo = { ...parede };

    for (const chave of ['a', 'b'] as const) {
      const q = novo[chave];
      // Ponta que já coincide com a ponta de outra parede está conectada: o
      // arranjo tem nó ali, e mexer nela só afastaria as duas.
      if (jaTocaOutraPonta(q, i)) continue;

      // A direção em que esta ponta pode andar: a da própria parede, para fora.
      const outra = chave === 'a' ? novo.b : novo.a;
      const dx = q.x - outra.x;
      const dy = q.y - outra.y;
      const comp = Math.hypot(dx, dy);
      if (comp === 0) continue;
      const dir = { x: dx / comp, y: dy / comp };

      let melhor: { alvo: T; distancia: number } | null = null;
      for (let j = 0; j < paredes.length; j++) {
        if (j === i) continue;
        const alvo = paredes[j];
        const { t, distancia } = noSegmento(q, alvo.a, alvo.b);
        if (distancia === 0) {
          // Já cruza: `splitAtIntersections` resolve, não há o que fazer.
          melhor = null;
          break;
        }
        // A PERMISSÃO: estar dentro do corpo da outra parede.
        if (distancia > alvo.espessuraMm / 2 + folgaMm) continue;
        // E o encontro tem de ser no MEIO dela — encostar além da ponta do alvo
        // seria emendar duas paredes que terminam perto, e isso é outra coisa.
        if (t <= 0 || t >= 1) continue;
        if (!melhor || distancia < melhor.distancia) melhor = { alvo, distancia };
      }

      if (!melhor) {
        // Só conta como solta a ponta que não toca NADA — não a que já cruza.
        const tocaAlgo = paredes.some(
          (r, j) => j !== i && noSegmento(q, r.a, r.b).distancia === 0,
        );
        if (!tocaAlgo) soltas++;
        continue;
      }

      const k = cruzamento(q, dir, melhor.alvo.a, melhor.alvo.b);
      // Paralelas não se encontram, e um encontro longe demais não é o eixo
      // vizinho: é outra parede lá adiante. O teto é a espessura inteira do
      // alvo, que cobre até uma junção bem oblíqua.
      if (k === null || Math.abs(k) > melhor.alvo.espessuraMm) {
        soltas++;
        continue;
      }

      novo[chave] = { x: Math.round(q.x + dir.x * k), y: Math.round(q.y + dir.y * k) };
      encostadas++;
    }

    return novo;
  });

  return { paredes: saida, encostadas, soltas };
}
