import { cantosDaParede, polygonArea, signedArea, type Point } from './geom';
import {
  FORMA_ESTRUTURAL,
  contornoEmPlanta,
  type BlueprintModel,
  type ObjectId,
  type Structural,
  type Wall,
} from './model';

/**
 * SOBREPOSIÇÃO entre componentes — onde dois volumes ocupam o mesmo espaço.
 *
 * ─── O PEDIDO ───────────────────────────────────────────────────────────────
 *
 * Usuário, 01/09/2026, com print do 3D: *"ao criar um pilar onde ja existe
 * parede criada os dois componentes ficam se sobrepondo. Ao criar um componente
 * que sobrepoe um outro, emitir um aviso ao usuário se ele quer desfazer ou se
 * ele quer subtrair o volume de um componente ou do outro"*.
 *
 * ─── O PROBLEMA NÃO É A IMAGEM, É O DINHEIRO ────────────────────────────────
 *
 * A imagem é o sintoma. O pilar embutido numa parede é normal na obra — ele
 * ocupa aquele espaço mesmo. O que não pode é ser PAGO DUAS VEZES, e era o que
 * acontecia: a área da parede saía de `comprimento × altura − vãos`, sem
 * desconto nenhum de estrutura, e o volume do pilar era contado à parte. O
 * mesmo metro cúbico entrava como concreto e como alvenaria.
 *
 * ─── POR QUE O VOLUME É RECALCULADO, E NÃO GRAVADO ──────────────────────────
 *
 * A decisão do usuário ("quem cede") vive no modelo; o NÚMERO, não. Gravar o
 * volume descontado o deixaria obsoleto no instante em que alguém movesse o
 * pilar ou engrossasse a parede — e um desconto obsoleto não some da tela: ele
 * vira um número plausível, que é a pior espécie de erro num orçamento. Aqui o
 * quantitativo recalcula a interseção a cada leitura; mover a peça corrige o
 * desconto sozinho.
 */

/** Uma sobreposição entre dois componentes, já medida. */
export interface Sobreposicao {
  /** Ids dos dois lados. `a` é sempre o de tipo "menor" (parede antes de peça). */
  aId: ObjectId;
  bId: ObjectId;
  /** Área comum EM PLANTA. */
  areaPlantaMm2: number;
  /** Altura da faixa vertical em que os dois convivem. */
  alturaMm: number;
  /** O que os dois disputam: `areaPlantaMm2 × alturaMm`. */
  volumeMm3: number;
}

/** Faixa vertical que um componente ocupa, do piso do pavimento. */
function faixaVertical(x: Wall | Structural): { base: number; topo: number } {
  if ('thicknessMm' in x) return { base: 0, topo: x.heightMm };
  return { base: x.baseMm, topo: x.baseMm + x.alturaMm };
}

/**
 * A pegada em planta, para efeito de sobreposição.
 *
 * ⚠️ A parede entra pelo corpo SEM a extensão de mitra. Com ela, duas paredes
 * que se encontram num canto se sobrepõem por construção — a mitra é
 * exatamente o pedaço compartilhado —, e toda planta acusaria sobreposição em
 * cada esquina. O corpo reto é o que a peça de fato ocupa sozinha.
 *
 * ⚠️ Peça CIRCULAR vira polígono de 24 lados. É aproximação, e ela NUNCA toca o
 * volume próprio da peça (esse sai exato de `medirEstrutura`): serve só para
 * medir o pedaço disputado. O quadrado envolvente daria 27% a mais de área
 * disputada, e o desconto sairia maior que a peça.
 */
function pegada(x: Wall | Structural): Point[] {
  if ('thicknessMm' in x) return cantosDaParede(x.a, x.b, x.thicknessMm);
  if (x.circular && FORMA_ESTRUTURAL[x.kind] === 'PONTO') {
    const c = x.pontos[0];
    const r = x.larguraMm / 2;
    return Array.from({ length: 24 }, (_, i) => {
      const t = (i / 24) * Math.PI * 2;
      return { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) };
    });
  }
  return contornoEmPlanta(x);
}

/** O anel é convexo? Só o convexo serve de FACA no recorte abaixo. */
function ehConvexo(anel: Point[]): boolean {
  if (anel.length < 3) return false;
  let sinal = 0;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    const c = anel[(i + 2) % anel.length];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (z === 0) continue;
    const s = z > 0 ? 1 : -1;
    if (sinal === 0) sinal = s;
    else if (s !== sinal) return false;
  }
  return sinal !== 0;
}

/**
 * Recorte de Sutherland–Hodgman: devolve `sujeito` cortado por `faca`.
 *
 * `faca` PRECISA ser convexa — o algoritmo corta por um semiplano de cada
 * aresta, e numa faca côncava um pedaço legítimo do sujeito cairia fora de um
 * semiplano e sumiria. O sujeito pode ser côncavo à vontade (é o caso da laje
 * em L). Por isso quem chama escolhe qual dos dois é a faca.
 */
function recortar(sujeito: Point[], faca: Point[]): Point[] {
  const horario = signedArea(faca) < 0;
  let saida = sujeito;

  for (let i = 0; i < faca.length && saida.length > 0; i++) {
    const a = faca[i];
    const b = faca[(i + 1) % faca.length];
    // "Dentro" = à esquerda da aresta num anel anti-horário; o sinal se inverte
    // no horário. Sem isso o recorte devolveria o complemento — área zero, e a
    // sobreposição passaria despercebida em metade dos desenhos.
    const dentro = (p: Point) => {
      const z = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      return horario ? z <= 0 : z >= 0;
    };
    const corta = (p: Point, q: Point): Point => {
      const d1 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      const d2 = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
      const t = d1 / (d1 - d2);
      return { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
    };

    const entrada = saida;
    saida = [];
    for (let k = 0; k < entrada.length; k++) {
      const atual = entrada[k];
      const anterior = entrada[(k + entrada.length - 1) % entrada.length];
      if (dentro(atual)) {
        if (!dentro(anterior)) saida.push(corta(anterior, atual));
        saida.push(atual);
      } else if (dentro(anterior)) {
        saida.push(corta(anterior, atual));
      }
    }
  }

  return saida;
}

/**
 * O POLÍGONO comum entre dois anéis. `[]` quando não se tocam.
 *
 * Exportado além da área porque o desenho precisa da forma, não do número: para
 * abrir o vão do pilar na parede em 3D é preciso saber ONDE, ao longo do eixo,
 * o concreto atravessa.
 */
export function recorteComum(um: Point[], outro: Point[]): Point[] {
  if (um.length < 3 || outro.length < 3) return [];
  const faca = ehConvexo(outro) ? outro : ehConvexo(um) ? um : null;
  if (!faca) return [];
  const sujeito = faca === outro ? um : outro;
  return recortar(sujeito, faca);
}

/**
 * Onde uma peça de concreto atravessa a parede, em coordenada LOCAL do perfil:
 * `x` medido ao longo do eixo a partir de `wall.a`, `y` a partir do piso.
 *
 * `null` quando não se cruzam. É o que abre o vão do pilar embutido no 3D —
 * mesma mecânica dos furos de porta e janela, que aquele perfil já tinha.
 *
 * ⚠️ NÃO clampa `x` em `[0, comprimento]` como o furo de abertura faz: o pilar
 * de canto invade a extensão de mitra da parede, e cortar em zero deixaria uma
 * lasca de alvenaria justamente na quina, que é onde ela mais salta à vista.
 * Quem desenha volta a clampar contra o retângulo do perfil, que já inclui o
 * avanço.
 */
export function faixaDaEstruturaNaParede(
  wall: Wall,
  s: Structural,
): { x0: number; x1: number; y0: number; y1: number } | null {
  const y0 = Math.max(0, s.baseMm);
  const y1 = Math.min(wall.heightMm, s.baseMm + s.alturaMm);
  if (y1 <= y0) return null;

  const comum = recorteComum(cantosDaParede(wall.a, wall.b, wall.thicknessMm), pegada(s));
  if (comum.length < 3) return null;

  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const comp = Math.hypot(dx, dy);
  if (comp === 0) return null;
  const ux = dx / comp;
  const uy = dy / comp;

  let x0 = Infinity;
  let x1 = -Infinity;
  for (const p of comum) {
    const t = (p.x - wall.a.x) * ux + (p.y - wall.a.y) * uy;
    if (t < x0) x0 = t;
    if (t > x1) x1 = t;
  }
  if (!(x1 > x0)) return null;
  return { x0, x1, y0, y1 };
}

/** Área comum entre dois anéis. `0` quando não se tocam. */
export function areaComum(um: Point[], outro: Point[]): number {
  if (um.length < 3 || outro.length < 3) return 0;
  // A faca tem de ser convexa. Quando os dois são côncavos (duas lajes em L, o
  // caso raro), não há resposta exata aqui e o zero é honesto: o aviso ainda
  // sai pela caixa envolvente de quem chama, mas nenhum desconto é inventado.
  const faca = ehConvexo(outro) ? outro : ehConvexo(um) ? um : null;
  if (!faca) return 0;
  const sujeito = faca === outro ? um : outro;
  return polygonArea(recortar(sujeito, faca));
}

/**
 * Todas as sobreposições de um componente contra os outros do mesmo pavimento.
 *
 * ─── O QUE NÃO CONTA COMO SOBREPOSIÇÃO ──────────────────────────────────────
 *
 * **Parede com parede** fica de fora. Duas paredes que se encontram num canto
 * compartilham a mitra por construção, e uma parede que cruza outra num T é
 * desenho legítimo — o arranjo planar já cuida das duas. Acusar aqui faria toda
 * planta nascer com dezenas de avisos e o aviso perderia o sentido.
 *
 * **Peças que não se cruzam na vertical** também não contam: a laje na cota
 * 2,80 passa POR CIMA da parede que vai de 0 a 2,80, e a estaca enterrada passa
 * por baixo de tudo. É o teste que evita o falso positivo mais comum.
 */
export function sobreposicoesDe(
  model: BlueprintModel,
  id: ObjectId,
): Sobreposicao[] {
  const alvo =
    model.walls.find((w) => w.id === id) ??
    (model.structures ?? []).find((s) => s.id === id) ??
    null;
  if (!alvo) return [];

  const nivel = alvo.levelId;
  const candidatos: (Wall | Structural)[] = [
    // Parede só entra como candidata quando o alvo NÃO é parede.
    ...('thicknessMm' in alvo ? [] : model.walls.filter((w) => w.levelId === nivel)),
    ...(model.structures ?? []).filter((s) => s.levelId === nivel && s.id !== id),
  ];

  const meu = pegada(alvo);
  const minha = faixaVertical(alvo);
  const achadas: Sobreposicao[] = [];

  for (const outro of candidatos) {
    const dele = faixaVertical(outro);
    const alturaMm = Math.min(minha.topo, dele.topo) - Math.max(minha.base, dele.base);
    if (alturaMm <= 0) continue;

    const areaPlantaMm2 = areaComum(meu, pegada(outro));
    if (areaPlantaMm2 <= 0) continue;

    achadas.push({
      aId: 'thicknessMm' in outro ? outro.id : alvo.id,
      bId: 'thicknessMm' in outro ? alvo.id : outro.id,
      areaPlantaMm2,
      alturaMm,
      volumeMm3: areaPlantaMm2 * alturaMm,
    });
  }

  return achadas;
}

/**
 * Todas as sobreposições do modelo, sem repetir par.
 *
 * É o que o quantitativo consome para descontar — e por isso varre tudo, não só
 * a peça recém-criada: mover um pilar para dentro de uma parede meses depois
 * cria a mesma disputa, e o desconto tem de acompanhar.
 */
export function sobreposicoesDoModelo(model: BlueprintModel): Sobreposicao[] {
  const vistas = new Set<string>();
  const todas: Sobreposicao[] = [];

  for (const s of model.structures ?? []) {
    for (const so of sobreposicoesDe(model, s.id)) {
      const chave = [so.aId, so.bId].sort().join('|');
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      todas.push(so);
    }
  }

  return todas;
}

/**
 * PONTAS DE PAREDE QUE PARARAM ANTES DA PEÇA — a marca do corte destrutivo.
 *
 * ─── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
 *
 * Entre 01/09/2026 e o mesmo dia, o corte era destrutivo: encurtava a parede na
 * posição que o pilar tinha NAQUELE instante. O usuário achou o defeito
 * reposicionando a peça — *"o recorte acaba ficando no local errado (...) fica
 * um vão onde não deveria e ainda com sobreposição"*. Medido no estudo dele: uma
 * parede terminou 100 mm ANTES da face do pilar, e outra terminou no CENTRO
 * dele (o snap a levou até lá depois do corte).
 *
 * O corte deixou de ser destrutivo, mas os desenhos já cortados continuam por
 * aí. Esta função acha o estrago para que a tela possa oferecer a emenda.
 *
 * ─── ATÉ ONDE A PONTA VOLTA ─────────────────────────────────────────────────
 *
 * Até a **projeção do centro da peça sobre o eixo da parede** — não até a face.
 * Duas razões: é exatamente de onde o corte a tirou (o corte encurtou até a
 * face, e a ponta original estava no centro, que é onde o desenho a colocou),
 * e é o único ponto que cai DENTRO da pegada, que é o que faz a ponte do
 * arranjo planar reconhecer a ponta e fechar o anel.
 */
export interface PontaEncurtada {
  wallId: ObjectId;
  end: 'a' | 'b';
  /** Para onde a ponta volta. */
  ate: Point;
  /** Quanto de parede o corte tirou, em mm. */
  faltaMm: number;
}

/** Quão longe da peça uma ponta ainda conta como "encurtada por ela". */
const ALCANCE_DA_EMENDA_MM = 1000;

export function pontasEncurtadasPorEstrutura(
  paredes: Wall[],
  s: Structural,
): PontaEncurtada[] {
  const centro = s.pontos[0];
  if (!centro || FORMA_ESTRUTURAL[s.kind] !== 'PONTO') return [];

  const anel = pegada(s);
  if (anel.length < 3) return [];
  // Meia diagonal da seção: o quanto o eixo de uma parede pode passar longe do
  // centro e ainda atravessar a peça.
  const alcanceLateral = Math.max(
    ...anel.map((p) => Math.hypot(p.x - centro.x, p.y - centro.y)),
  );

  const achadas: PontaEncurtada[] = [];
  for (const w of paredes) {
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const comp = Math.hypot(dx, dy);
    if (comp === 0) continue;
    const ux = dx / comp;
    const uy = dy / comp;

    // Projeção do centro sobre a RETA da parede.
    const t = (centro.x - w.a.x) * ux + (centro.y - w.a.y) * uy;
    const px = w.a.x + ux * t;
    const py = w.a.y + uy * t;
    // O eixo passa pela peça? Se não, esta parede não tem nada com ela.
    if (Math.hypot(centro.x - px, centro.y - py) > alcanceLateral) continue;

    const ate = { x: Math.round(px), y: Math.round(py) };
    // A ponta que interessa é a que está DO LADO da peça e ainda não chegou
    // nela. `t < 0` = a peça está antes de `a`; `t > comp` = depois de `b`.
    if (t < 0 && -t <= ALCANCE_DA_EMENDA_MM) {
      achadas.push({ wallId: w.id, end: 'a', ate, faltaMm: Math.round(-t) });
    } else if (t > comp && t - comp <= ALCANCE_DA_EMENDA_MM) {
      achadas.push({ wallId: w.id, end: 'b', ate, faltaMm: Math.round(t - comp) });
    }
  }
  return achadas;
}
