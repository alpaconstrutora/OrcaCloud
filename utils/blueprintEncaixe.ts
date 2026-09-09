/**
 * O ÍMÃ do desenho — os pontos notáveis em que o cursor prende.
 *
 * ─── O QUE FALTAVA, E POR QUE ISSO IMPORTAVA (09/09/2026) ───────────────────
 *
 * Usuário, testando o sistema elétrico: *"sinto falta de um componente snap"*.
 *
 * O ímã existia e pegava ponta de parede, canto de parede, eixo e canto de peça
 * estrutural, terminal e grade. Faltava justamente o que o gesto de instalação
 * pede: **encaixar SOBRE a parede**. Uma tomada fica no MEIO de uma parede, não
 * na ponta dela — e ali não havia alvo nenhum, então o ponto caía na grade,
 * perto da parede e fora dela.
 *
 * E faltava dizer o que estava acontecendo: o ponto pulava e nada na tela
 * explicava por quê. Quem desenha precisa saber se prendeu no canto certo ou na
 * grade, porque as duas coisas parecem iguais e produzem plantas diferentes.
 *
 * ─── ⚠️ POR QUE ISTO É UM MÓDULO PURO ──────────────────────────────────────
 *
 * Porque é geometria, e geometria dentro de um `<canvas>` só se testa
 * renderizando um contexto 2D que o jsdom não tem. O ímã antigo vive inline no
 * `BlueprintCanvas` e nunca teve um teste — o que era suportável quando ele
 * tinha dois casos, e deixa de ser com nove.
 *
 * ─── ⚠️ PRIORIDADE VENCE DISTÂNCIA ─────────────────────────────────────────
 *
 * Entre dois candidatos, ganha o de MAIOR PRIORIDADE, não o mais perto. É a
 * convenção de CAD e é a única previsível: com a distância decidindo, aproximar
 * o mouse um pixel trocaria "interseção de duas paredes" por "um ponto qualquer
 * sobre uma delas", e o desenho mudaria de significado sem que o gesto mudasse.
 *
 * Dentro do MESMO tipo, aí sim ganha o mais próximo.
 */

export interface Ponto2D {
  x: number;
  y: number;
}

/**
 * Os tipos de encaixe, **em ordem de prioridade** — do mais específico ao menos.
 *
 * `EXTREMIDADE` e `CANTO` não estão aqui: eles são resolvidos antes, pelo ímã
 * antigo do canvas, que carrega uma otimização de varredura que não vale a pena
 * duplicar. Este módulo cuida do que faltava.
 */
export const TIPOS_GEOMETRICOS = [
  'INTERSECAO',
  'CENTRO',
  'MEIO',
  'PERPENDICULAR',
  'EXTENSAO',
  'SOBRE',
] as const;

export type TipoGeometrico = (typeof TIPOS_GEOMETRICOS)[number];

/** Todos os tipos que o usuário pode ligar e desligar. */
export const TIPOS_DE_ENCAIXE = ['EXTREMIDADE', 'CANTO', ...TIPOS_GEOMETRICOS] as const;
export type TipoDeEncaixe = (typeof TIPOS_DE_ENCAIXE)[number] | 'GRADE';

/** O nome que aparece ao lado do cursor. Curto: ele compete com o desenho. */
export const ROTULO_DO_ENCAIXE: Record<TipoDeEncaixe, string> = {
  EXTREMIDADE: 'Extremidade',
  CANTO: 'Canto',
  INTERSECAO: 'Interseção',
  CENTRO: 'Centro',
  MEIO: 'Meio',
  PERPENDICULAR: 'Perpendicular',
  EXTENSAO: 'Extensão',
  SOBRE: 'Sobre',
  GRADE: 'Grade',
};

export interface SegmentoParaEncaixe {
  id: string;
  a: Ponto2D;
  b: Ponto2D;
  /** Espessura, quando a peça tem corpo — habilita o encaixe nas FACES. */
  espessuraMm?: number;
}

export interface CirculoParaEncaixe {
  id: string;
  centro: Ponto2D;
  raioMm: number;
}

export interface Achado {
  ponto: Ponto2D;
  tipo: TipoDeEncaixe;
  /** De qual peça ele saiu, quando saiu de uma. */
  id?: string;
}

const dist = (p: Ponto2D, q: Ponto2D) => Math.hypot(p.x - q.x, p.y - q.y);

/** O parâmetro `t` da projeção de `p` na reta `a`–`b`. Fora de [0,1] = além da ponta. */
function projetar(a: Ponto2D, b: Ponto2D, p: Ponto2D): { t: number; ponto: Ponto2D } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comp2 = dx * dx + dy * dy;
  if (comp2 === 0) return null;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / comp2;
  return { t, ponto: { x: a.x + t * dx, y: a.y + t * dy } };
}

/** As duas FACES de um segmento com espessura, deslocadas pela normal. */
function faces(s: SegmentoParaEncaixe): [Ponto2D, Ponto2D][] {
  const e = s.espessuraMm ?? 0;
  if (e <= 0) return [];
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const comp = Math.hypot(dx, dy);
  if (comp === 0) return [];
  const nx = (-dy / comp) * (e / 2);
  const ny = (dx / comp) * (e / 2);
  return [
    [
      { x: s.a.x + nx, y: s.a.y + ny },
      { x: s.b.x + nx, y: s.b.y + ny },
    ],
    [
      { x: s.a.x - nx, y: s.a.y - ny },
      { x: s.b.x - nx, y: s.b.y - ny },
    ],
  ];
}

/**
 * O cruzamento das RETAS de dois segmentos, se elas se cruzam.
 *
 * ⚠️ Devolve o ponto ainda que ele caia fora dos dois segmentos — quem chama
 * decide se aceita. Duas paredes que se encostam formando "L" têm o cruzamento
 * exatamente no canto; duas que quase se encontram têm o cruzamento no ar, e
 * esse é o caso em que a interseção NÃO deve prender: ali não há nada
 * construído, e prender criaria geometria a partir de uma linha imaginária.
 */
function cruzamento(
  a1: Ponto2D,
  a2: Ponto2D,
  b1: Ponto2D,
  b2: Ponto2D,
): { ponto: Ponto2D; ta: number; tb: number } | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const den = dax * dby - day * dbx;
  // Paralelas (ou degeneradas): não há UM ponto de cruzamento.
  if (Math.abs(den) < 1e-9) return null;
  const ta = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / den;
  const tb = ((b1.x - a1.x) * day - (b1.y - a1.y) * dax) / den;
  return { ponto: { x: a1.x + ta * dax, y: a1.y + ta * day }, ta, tb };
}

export interface OpcoesDeEncaixe {
  /** Alcance em unidades do MODELO — quem chama converte de pixels. */
  limite: number;
  /** Quais tipos valem agora. Tipo desligado nem é calculado. */
  ativos: ReadonlySet<string>;
  /**
   * De onde o traço está saindo, quando está saindo de algum lugar.
   *
   * Só o `PERPENDICULAR` precisa dela — perpendicular a quê, senão? Sem âncora
   * ele simplesmente não se oferece, em vez de escolher uma origem arbitrária.
   */
  ancora?: Ponto2D | null;
}

/**
 * O melhor encaixe geométrico sob o cursor, ou nulo.
 *
 * ⚠️ Uma passada de TRIAGEM antes de qualquer conta cara. `INTERSECAO` é
 * quadrática nos segmentos, e este código roda a cada movimento do mouse: com o
 * acervo do Spike B (20 mil paredes) uma passada quadrática trava a aba. A
 * triagem reduz a lista aos poucos segmentos que passam perto do cursor, e só
 * eles se cruzam entre si.
 */
export function encaixeGeometrico(
  segmentos: readonly SegmentoParaEncaixe[],
  circulos: readonly CirculoParaEncaixe[],
  mundo: Ponto2D,
  o: OpcoesDeEncaixe,
): Achado | null {
  const { limite, ativos, ancora } = o;
  const quer = (t: TipoGeometrico) => ativos.has(t);
  const candidatos: Achado[] = [];

  // ── Triagem: quem passa perto ─────────────────────────────────────────────
  const perto: SegmentoParaEncaixe[] = [];
  for (const s of segmentos) {
    const meia = (s.espessuraMm ?? 0) / 2;
    const proj = projetar(s.a, s.b, mundo);
    // O segmento degenerado (as duas pontas no mesmo lugar) não tem reta, e não
    // entra em nenhum dos tipos daqui — a ponta dele já é EXTREMIDADE.
    if (!proj) continue;
    const tNaFaixa = Math.max(0, Math.min(1, proj.t));
    const noSegmento = {
      x: s.a.x + tNaFaixa * (s.b.x - s.a.x),
      y: s.a.y + tNaFaixa * (s.b.y - s.a.y),
    };
    // Folga generosa: a EXTENSÃO mira ALÉM da ponta, e o cursor pode estar a até
    // `limite` da reta e bem longe do segmento. Por isso a triagem olha a
    // distância à RETA, e não ao segmento.
    if (dist(proj.ponto, mundo) <= limite + meia || dist(noSegmento, mundo) <= limite + meia) {
      perto.push(s);
    }
  }

  // ── MEIO, SOBRE, PERPENDICULAR, EXTENSÃO ──────────────────────────────────
  for (const s of perto) {
    if (quer('MEIO')) {
      const meio = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
      if (dist(meio, mundo) <= limite) candidatos.push({ ponto: meio, tipo: 'MEIO', id: s.id });
    }

    const proj = projetar(s.a, s.b, mundo)!;

    if (quer('EXTENSAO') && (proj.t < 0 || proj.t > 1) && dist(proj.ponto, mundo) <= limite) {
      // ⚠️ Só ALÉM da ponta. Dentro do segmento isto seria `SOBRE` com outro
      // nome, e dois tipos para o mesmo ponto fariam o rótulo na tela mentir.
      candidatos.push({ ponto: proj.ponto, tipo: 'EXTENSAO', id: s.id });
    }

    if (quer('SOBRE') && proj.t >= 0 && proj.t <= 1 && dist(proj.ponto, mundo) <= limite) {
      candidatos.push({ ponto: proj.ponto, tipo: 'SOBRE', id: s.id });
    }
    // As FACES entram como `SOBRE` também: quem aponta a linha que vê na tela
    // está apontando a face, e a face é onde a tomada encosta.
    if (quer('SOBRE')) {
      for (const [fa, fb] of faces(s)) {
        const pf = projetar(fa, fb, mundo);
        if (pf && pf.t >= 0 && pf.t <= 1 && dist(pf.ponto, mundo) <= limite) {
          candidatos.push({ ponto: pf.ponto, tipo: 'SOBRE', id: s.id });
        }
      }
    }

    if (quer('PERPENDICULAR') && ancora) {
      const pe = projetar(s.a, s.b, ancora);
      if (pe && pe.t >= 0 && pe.t <= 1 && dist(pe.ponto, mundo) <= limite) {
        candidatos.push({ ponto: pe.ponto, tipo: 'PERPENDICULAR', id: s.id });
      }
    }
  }

  // ── INTERSEÇÃO: só entre os que passaram na triagem ───────────────────────
  if (quer('INTERSECAO')) {
    for (let i = 0; i < perto.length; i++) {
      for (let j = i + 1; j < perto.length; j++) {
        const x = cruzamento(perto[i].a, perto[i].b, perto[j].a, perto[j].b);
        // Dentro dos DOIS segmentos: cruzamento no ar é linha imaginária, e
        // prender ali criaria geometria a partir de nada.
        if (!x || x.ta < 0 || x.ta > 1 || x.tb < 0 || x.tb > 1) continue;
        if (dist(x.ponto, mundo) <= limite) {
          candidatos.push({ ponto: x.ponto, tipo: 'INTERSECAO', id: perto[i].id });
        }
      }
    }
  }

  // ── CENTRO ────────────────────────────────────────────────────────────────
  if (quer('CENTRO')) {
    for (const c of circulos) {
      // Vale de qualquer ponto perto do centro OU perto da borda — é assim que
      // se pega o centro de um pilar circular sem mirar no meio dele.
      const dc = dist(c.centro, mundo);
      if (dc <= limite || Math.abs(dc - c.raioMm) <= limite) {
        candidatos.push({ ponto: c.centro, tipo: 'CENTRO', id: c.id });
      }
    }
  }

  if (candidatos.length === 0) return null;

  // PRIORIDADE primeiro, distância como desempate — ver o cabeçalho.
  const ordem = (t: TipoDeEncaixe) => TIPOS_GEOMETRICOS.indexOf(t as TipoGeometrico);
  candidatos.sort(
    (p, q) => ordem(p.tipo) - ordem(q.tipo) || dist(p.ponto, mundo) - dist(q.ponto, mundo),
  );
  return candidatos[0];
}
