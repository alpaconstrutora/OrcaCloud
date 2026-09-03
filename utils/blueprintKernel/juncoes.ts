/**
 * MITRA DA JUNÇÃO — o corpo da parede recortado FACE A FACE.
 *
 * ─── POR QUE UM AVANÇO SÓ NÃO BASTA ─────────────────────────────────────────
 *
 * `extensaoDeCanto` (model.ts) devolve UM número por ponta: quanto a pincelada
 * avança além do eixo. Ele fecha o entalhe do canto e é o que a planta baixa, o
 * encaixe, as cotas e o PDF usam — e está certo para o que fazem, porque o 2D
 * pinta uma UNIÃO: o que está desenhado duas vezes ninguém vê.
 *
 * O 3D não tem esse luxo. Lá são dois SÓLIDOS, e um número igual nas duas faces
 * faz as duas paredes cobrirem o quadrado inteiro do canto — cada uma por
 * inteiro. Medido nas duas plantas reais do acervo em 03/09/2026: 56 e 33 pares
 * de paredes se invadindo, 0,88 m² e 0,80 m² de planta desenhada duas vezes, com
 * a maior sobreposição valendo exatamente `t × t`. É o que o usuário fotografou:
 * face contra face no canto, e ponta de divisória saindo do outro lado da parede
 * que a recebe (com espessuras iguais, avançar `t/2` num T põe a ponta
 * exatamente na face de trás da hospedeira).
 *
 * A régua daqui devolve DOIS números por ponta, um por face. Cada um é a
 * interseção da linha daquela face com a linha da face correspondente da
 * vizinha — a construção clássica de offset de polilinha. Com isso as duas
 * paredes de um canto caem na MESMA reta de mitra: nem vão, nem sobra.
 *
 * ─── AS DUAS RÉGUAS NÃO PODEM DIVERGIR ──────────────────────────────────────
 *
 * Em canto reto de espessura igual — a esmagadora maioria — o avanço da face
 * EXTERNA daqui é idêntico a `extensaoDeCanto`, e há teste travando isso
 * (`blueprintJuncoes.test.ts`). A silhueta externa do 3D continua batendo com a
 * do 2D; o que muda é só a face interna, que passa a recuar em vez de invadir.
 *
 * Onde elas legitimamente discordam é em canto de espessuras DIFERENTES: o
 * avanço certo é pela metade da VIZINHA, não pela própria — a mesma confusão
 * que `recuoAteFace` documenta ter sido defeito real. Aqui sai certo por
 * construção; no 2D segue como está (pendência registrada no plano de
 * 03/09/2026), porque mexer lá move encaixe, cota e golden de exportação.
 */

import { DEFAULT_TOLERANCE_MM, roundToMm } from './units';
import { signedArea, type Point } from './geom';
import { extensaoDeCanto, isFreeWallEnd, SENO_MINIMO_MITRA, type ObjectId, type Wall } from './model';

/**
 * Teto do avanço/recuo, em múltiplos de meia espessura. Canto muito agudo pede
 * mitra que tende ao infinito; sem teto vira farpa. Mesmo espírito (e mesmo
 * valor) do `AVANCO_MAX` de `extensaoDeCanto`.
 */
const MITRA_MAX = 4;

/** Avanço do corpo além do vértice do eixo, EM CADA FACE. Negativo = recua. */
export interface MitraDaPonta {
  /** Face do lado `+n`, com `n = rot90(a→b)`. */
  esquerdaMm: number;
  /** Face do lado `−n`. */
  direitaMm: number;
}

/** Uma ponta de parede que nasce num vértice da junção. */
export interface PontaNaJuncao {
  wallId: ObjectId;
  end: 'a' | 'b';
  /** Versor que SAI do vértice ao longo do eixo desta parede. */
  d: Point;
  /** Ângulo de `d`, em radianos — a ordem do leque. */
  anguloRad: number;
  meiaMm: number;
  /**
   * A ponta REAL desta parede, que não é necessariamente o vértice consultado.
   *
   * As retas de face são traçadas a partir daqui, e não do vértice: numa junção
   * tolerada (ou num canto que o desenho deixou aberto) a ponta da vizinha está
   * a alguns centímetros dali, e usar o vértice como se fosse o eixo dela erra a
   * mitra pelo tamanho da folga.
   */
  origem: Point;
}

const cruz = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const rot90 = (v: Point): Point => ({ x: -v.y, y: v.x });
const escala = (v: Point, k: number): Point => ({ x: v.x * k, y: v.y * k });

function versorDoEixo(de: Point, para: Point): Point | null {
  const dx = para.x - de.x;
  const dy = para.y - de.y;
  const comp = Math.hypot(dx, dy);
  return comp === 0 ? null : { x: dx / comp, y: dy / comp };
}

/**
 * As pontas de parede que nascem em `p`, ORDENADAS POR ÂNGULO.
 *
 * A ordem é o que transforma uma junção qualquer num leque de setores: a face de
 * cada ponta mitra com a vizinha ADJACENTE em ângulo, e não com "a vizinha" — em
 * vértice de três ou mais pontas não existe uma vizinha só.
 *
 * `walls` deve vir recortado ao MESMO nível. Coordenada não carrega pavimento:
 * uma parede do 2º em cima de uma do térreo compartilha o vértice e entraria no
 * leque como se estivesse encostada nela.
 *
 * ⚠️ A comparação é por TOLERÂNCIA, não por igualdade. `DEFAULT_TOLERANCE_MM` é
 * a mesma folga com que o arranjo planar já solda vértices, então duas pontas a
 * 5 mm uma da outra são o mesmo canto para a topologia — e têm de ser o mesmo
 * canto aqui. Exigir igualdade exata fazia o canto (24455, −18355) da planta de
 * 23/08, desenhado com 5 mm de folga, cair fora do leque.
 */
export function pontasNaJuncao(
  walls: Wall[],
  p: Point,
  toleranciaMm = DEFAULT_TOLERANCE_MM,
): PontaNaJuncao[] {
  const pontas: PontaNaJuncao[] = [];
  for (const w of walls) {
    for (const end of ['a', 'b'] as const) {
      if (Math.hypot(w[end].x - p.x, w[end].y - p.y) > toleranciaMm) continue;
      const d = versorDoEixo(w[end], end === 'a' ? w.b : w.a);
      if (!d) continue;
      pontas.push({
        wallId: w.id,
        end,
        d,
        anguloRad: Math.atan2(d.y, d.x),
        meiaMm: w.thicknessMm / 2,
        origem: w[end],
      });
    }
  }
  // Desempate por id: duas paredes duplicadas na mesma direção teriam ordem
  // dependente da ordem de descoberta, e o polígono do miolo mudaria de forma
  // conforme a ordem da lista — o kernel não pode ter saída assim.
  pontas.sort((a, b) => a.anguloRad - b.anguloRad || a.wallId.localeCompare(b.wallId));
  return pontas;
}

/**
 * Avanço da face `V + off + τ·d` até cruzar a reta `Q + ρ·w`, medido para FORA
 * do vértice (isto é, no sentido `−d`). `null` quando as duas são paralelas.
 */
function avancoAteAReta(V: Point, off: Point, d: Point, Q: Point, w: Point): number | null {
  const den = cruz(d, w);
  if (Math.abs(den) < SENO_MINIMO_MITRA) return null;
  const r: Point = { x: V.x + off.x - Q.x, y: V.y + off.y - Q.y };
  // (r + τ d) × w = 0  →  τ = −(r × w)/(d × w);  e o avanço é −τ.
  return cruz(r, w) / den;
}

/**
 * Como `p` encosta na parede `o`: pelo MEIO do corpo dela (junção em T) ou pela
 * QUINA (canto que o desenho deixou aberto). `null` quando não encosta.
 *
 * ─── POR QUE A DISTINÇÃO EXISTE ─────────────────────────────────────────────
 *
 * Ela nasceu de duas medições na planta real, não de gosto:
 *
 * - **23/08**: um canto desenhado com 5 mm de folga fazia as duas paredes serem
 *   hospedeira UMA DA OUTRA. As duas recuavam até a face da outra e abria um
 *   buraco de `t × t` na quina.
 * - **01/09**: uma parede morrendo a 157 mm da ponta de outra recuava até a face
 *   de uma hospedeira que acabava logo ali, e sobrava uma lasca sem massa.
 *
 * A margem que separa os dois casos é meia espessura DAS DUAS: a da hospedeira,
 * que é o que ela precisa ter de sobra para receber, e a de quem chega, que é a
 * largura da própria pegada.
 *
 * Quina vira vizinha de canto (mitra normal, contra as retas de face de `o`), e
 * não hospedeira. É por isso que o retorno diz QUAL dos dois.
 */
type Encosto =
  | { tipo: 'MEIO'; wall: Wall }
  | { tipo: 'QUINA'; wall: Wall; origem: Point; d: Point };

function encostoEm(o: Wall, p: Point, meiaPropria: number): Encosto | null {
  const dx = o.b.x - o.a.x;
  const dy = o.b.y - o.a.y;
  const comp2 = dx * dx + dy * dy;
  if (comp2 === 0) return null;
  const comp = Math.sqrt(comp2);
  const s = ((p.x - o.a.x) * dx + (p.y - o.a.y) * dy) / comp;
  const sPreso = Math.max(0, Math.min(comp, s));
  const dist = Math.hypot(o.a.x + (sPreso / comp) * dx - p.x, o.a.y + (sPreso / comp) * dy - p.y);
  if (dist > o.thicknessMm / 2) return null;

  const margem = o.thicknessMm / 2 + meiaPropria;
  if (s >= margem && s <= comp - margem) return { tipo: 'MEIO', wall: o };

  const naPontaA = s < comp / 2;
  return {
    tipo: 'QUINA',
    wall: o,
    origem: naPontaA ? o.a : o.b,
    d: naPontaA ? { x: dx / comp, y: dy / comp } : { x: -dx / comp, y: -dy / comp },
  };
}

/**
 * A reta da face da vizinha que limita um setor: `lado = −1` para a face no
 * sentido horário dela (a que fecha o setor anti-horário DESTA parede) e `+1`
 * para a outra. Devolve um ponto DA RETA — a direção é `vizinha.d`.
 */
function faceDaVizinha(vizinha: PontaNaJuncao, lado: number): Point {
  const off = escala(rot90(vizinha.d), lado * vizinha.meiaMm);
  return { x: vizinha.origem.x + off.x, y: vizinha.origem.y + off.y };
}

/**
 * O leque desta ponta: as vizinhas que decidem os dois biséis dela.
 *
 * São as pontas que nascem no mesmo vértice MAIS as paredes em que esta encosta
 * PELA QUINA (canto que o desenho deixou aberto — ver `encostoEm`). A quina
 * entra como vizinha de canto, com a direção que sai da ponta DELA: a reta da
 * face é a mesma, esteja o vértice soldado ou a 14 cm de distância, e é a reta
 * que decide a mitra.
 *
 * Nas duas plantas reais isso não é hipótese: há cantos desenhados com 5, 38, 76
 * e 144 mm de folga. Sem esta parte, cada um deles caía no avanço antigo e
 * continuava com as duas paredes se invadindo — que é o que o usuário vê.
 */
function lequeNoVertice(walls: Wall[], p: Point, meiaRef: number): PontaNaJuncao[] {
  const leque = pontasNaJuncao(walls, p);
  const jaTem = new Set(leque.map((x) => x.wallId));

  for (const o of walls) {
    if (jaTem.has(o.id)) continue;
    const e = encostoEm(o, p, meiaRef);
    if (e?.tipo !== 'QUINA') continue;
    leque.push({
      wallId: o.id,
      // A quina é a ponta DELA que está mais perto; qual das duas, `encostoEm`
      // já decidiu ao devolver a origem.
      end: e.origem === o.a ? 'a' : 'b',
      d: e.d,
      anguloRad: Math.atan2(e.d.y, e.d.x),
      meiaMm: o.thicknessMm / 2,
      origem: e.origem,
    });
  }

  leque.sort((a, b) => a.anguloRad - b.anguloRad || a.wallId.localeCompare(b.wallId));
  return leque;
}

/**
 * A ponta de `wall` recortada contra quem ela encontra — um avanço por face.
 *
 * Quatro casos, todos pela mesma conta (interseção de retas de face):
 *
 * | encontro | resultado |
 * |---|---|
 * | ponta livre | `0` e `0` |
 * | canto (1 vizinha no vértice) | `+e` na face externa, `−e` na interna |
 * | continuação colinear | `0` e `0` — as duas se encontram no vértice |
 * | T (morre no corpo de outra) | recua até a FACE DE CHEGADA da hospedeira |
 * | estrela (3+ pontas) | cada face com a vizinha adjacente EM ÂNGULO |
 *
 * ⚠️ Vértice de 3+ pontas deixa um MIOLO que parede nenhuma cobre — ver
 * `poligonoDaJuncao`. Mitrar sem desenhar o miolo abre buraco onde hoje há massa.
 */
export function mitraDaPonta(walls: Wall[], wall: Wall, end: 'a' | 'b'): MitraDaPonta {
  const V = wall[end];
  const meia = wall.thicknessMm / 2;

  const u = versorDoEixo(wall.a, wall.b);
  if (!u) return { esquerdaMm: 0, direitaMm: 0 };
  const n = rot90(u);
  /** Direção que SAI do vértice ao longo desta parede. */
  const d: Point = end === 'a' ? u : { x: -u.x, y: -u.y };

  // A face do lado `+rot90(d)` é a que limita o setor no sentido anti-horário.
  // Em 'a' ela é a esquerda (`+n`); em 'b' o eixo saiu ao contrário e ela é a
  // direita. É a única troca de sinal do módulo, e é por causa dela que os
  // testes cobrem a MESMA parede pelas duas pontas.
  const antiHorariaEhEsquerda = end === 'a';
  const offAntiHoraria = escala(rot90(d), meia);
  const offHoraria = escala(rot90(d), -meia);

  const limite = (m: number, meiaOutra: number) => {
    const teto = MITRA_MAX * Math.max(meia, meiaOutra);
    return Math.max(-teto, Math.min(teto, m));
  };

  let antiHoraria = 0;
  let horaria = 0;

  const leque = lequeNoVertice(walls, V, meia);
  const iEu = leque.findIndex((x) => x.wallId === wall.id && x.end === end);
  const hosp: Wall[] = [];
  for (const o of walls) {
    if (o.id === wall.id) continue;
    if (leque.some((x) => x.wallId === o.id)) continue;
    const e = encostoEm(o, V, meia);
    if (e?.tipo === 'MEIO') hosp.push(o);
  }

  if (leque.length >= 2 && iEu >= 0) {
    // ─── LEQUE: cada face mitra com a vizinha ADJACENTE em ângulo ────────────
    const proxima = leque[(iEu + 1) % leque.length];
    const anterior = leque[(iEu - 1 + leque.length) % leque.length];

    // O setor anti-horário (de `d` para `proxima.d`) é limitado pela face
    // `+rot90(d)` desta parede e pela face `−rot90(proxima.d)` da vizinha.
    // As retas da vizinha saem da ORIGEM dela, não do vértice consultado.
    const aAnti = avancoAteAReta(V, offAntiHoraria, d, faceDaVizinha(proxima, -1), proxima.d);
    if (aAnti !== null) antiHoraria = limite(aAnti, proxima.meiaMm);

    const aHor = avancoAteAReta(V, offHoraria, d, faceDaVizinha(anterior, +1), anterior.d);
    if (aHor !== null) horaria = limite(aHor, anterior.meiaMm);
  }

  // ─── JUNÇÃO QUE NÃO SE DEIXA CLASSIFICAR: FICA COMO ESTAVA ────────────────
  //
  // Nem vizinha de leque, nem hospedeira, mas alguma coisa encostada. Não há
  // reta de mitra a calcular, e chutar zero abriria vão. O avanço único de
  // `extensaoDeCanto` sobrepõe, mas nunca deixa buraco: entre os dois defeitos,
  // sobrepor num canto malfeito é o menos grave, e é o que já estava em uso.
  if (leque.length < 2 && hosp.length === 0) {
    if (isFreeWallEnd(walls, V, wall.id)) return { esquerdaMm: 0, direitaMm: 0 };
    const e = extensaoDeCanto(walls, wall, end);
    return { esquerdaMm: e, direitaMm: e };
  }

  // ─── T: a ponta morre no CORPO de outra parede, e para na face dela ────────
  //
  // Vale também quando já houve leque: uma ponta pode partilhar vértice com uma
  // e ainda assim atravessar o corpo de outra. Fica o mais RECUADO dos dois,
  // porque atravessar a hospedeira é justamente o defeito relatado.
  for (const o of hosp) {
    const w = versorDoEixo(o.a, o.b);
    if (!w) continue;
    const m = rot90(w);
    const longe = end === 'a' ? wall.b : wall.a;
    // De que lado da hospedeira esta parede vem: é essa a face em que ela para.
    const lado = Math.sign((longe.x - V.x) * m.x + (longe.y - V.y) * m.y) || 1;
    const Q: Point = {
      x: o.a.x + m.x * lado * (o.thicknessMm / 2),
      y: o.a.y + m.y * lado * (o.thicknessMm / 2),
    };
    const meiaO = o.thicknessMm / 2;
    const aAnti = avancoAteAReta(V, offAntiHoraria, d, Q, w);
    if (aAnti !== null) antiHoraria = Math.min(antiHoraria, limite(aAnti, meiaO));
    const aHor = avancoAteAReta(V, offHoraria, d, Q, w);
    if (aHor !== null) horaria = Math.min(horaria, limite(aHor, meiaO));
  }

  return antiHorariaEhEsquerda
    ? { esquerdaMm: antiHoraria, direitaMm: horaria }
    : { esquerdaMm: horaria, direitaMm: antiHoraria };
}

/**
 * O MIOLO de um vértice de 3+ pontas — o polígono que parede nenhuma cobre
 * depois que todas mitram. `null` quando não há miolo.
 *
 * Numa junção de duas paredes a mitra parte o quadrado do canto em dois e as
 * duas metades são das paredes: não sobra nada. Com três ou mais, cada parede
 * recua até a reta do setor e o centro fica vazio — num "T" de eixo partilhado
 * (dois trechos colineares mais um ramo) o buraco tem a largura do ramo pela
 * espessura da hospedeira, e apareceria na tela como falta de massa onde hoje
 * há massa demais. Este polígono é o que fecha isso.
 *
 * É geometria de DESENHO: não entra em quantitativo, não entra no payload
 * canônico, não tem id. Quem consome é o renderizador 3D.
 */
export function poligonoDaJuncao(walls: Wall[], p: Point): Point[] | null {
  const naPonta = pontasNaJuncao(walls, p);
  if (!naPonta.length) return null;
  // O MESMO leque que `mitraDaPonta` usa para recuar as pontas — quinas
  // incluídas. Contar só quem tem vértice soldado deixava sem miolo justamente
  // as junções que o desenho fechou com folga, e é lá que o buraco aparece.
  const pontas = lequeNoVertice(walls, p, Math.max(...naPonta.map((x) => x.meiaMm)));
  if (pontas.length < 3) return null;

  const anel: Point[] = [];
  for (let i = 0; i < pontas.length; i++) {
    const eu = pontas[i];
    const proxima = pontas[(i + 1) % pontas.length];
    const anterior = pontas[(i - 1 + pontas.length) % pontas.length];

    const offAnti = escala(rot90(eu.d), eu.meiaMm);
    const offHor = escala(rot90(eu.d), -eu.meiaMm);

    // As contas saem da ORIGEM de cada ponta — a ponta real dela — e não do
    // vértice consultado: com a junção soldada por tolerância os dois podem
    // estar a alguns milímetros um do outro.
    const aHor =
      avancoAteAReta(eu.origem, offHor, eu.d, faceDaVizinha(anterior, +1), anterior.d) ?? 0;
    const aAnti =
      avancoAteAReta(eu.origem, offAnti, eu.d, faceDaVizinha(proxima, -1), proxima.d) ?? 0;

    // A aresta da ponta é percorrida do lado horário para o anti-horário — é
    // isso que faz o anel sair no mesmo sentido do leque.
    anel.push({
      x: eu.origem.x + offHor.x - eu.d.x * aHor,
      y: eu.origem.y + offHor.y - eu.d.y * aHor,
    });
    anel.push({
      x: eu.origem.x + offAnti.x - eu.d.x * aAnti,
      y: eu.origem.y + offAnti.y - eu.d.y * aAnti,
    });
  }

  // Vértices coincidentes são o caso NORMAL, não exceção: num setor com ângulo
  // de verdade as duas paredes caem no mesmo ponto de mitra, por construção.
  const limpo: Point[] = [];
  for (const q of anel) {
    const r = { x: roundToMm(q.x), y: roundToMm(q.y) };
    const ultimo = limpo[limpo.length - 1];
    if (ultimo && ultimo.x === r.x && ultimo.y === r.y) continue;
    limpo.push(r);
  }
  while (limpo.length > 1) {
    const primeiro = limpo[0];
    const ultimo = limpo[limpo.length - 1];
    if (primeiro.x === ultimo.x && primeiro.y === ultimo.y) limpo.pop();
    else break;
  }
  if (limpo.length < 3) return null;
  // Paredes duplicadas na mesma direção produzem anel degenerado (área ~0) ou
  // laçado; desenhar isso não fecha buraco nenhum e ainda arrisca triangulação
  // torta. Área de 1 cm² é o piso.
  if (Math.abs(signedArea(limpo)) < 100) return null;
  return limpo;
}
