/**
 * PROJEÇÃO EM CORTE — a edificação seccionada por um plano vertical.
 *
 * Irmão de `blueprintElevation.ts`, e fora do kernel pela mesma razão: é função
 * PURA (sem React, sem canvas), mas é VISTA, não geometria do modelo. A linha
 * de corte em si mora no kernel (`Corte` em `model.ts`), porque ela é conteúdo
 * do desenho e precisa sobreviver ao snapshot.
 *
 * ─── O QUE UM CORTE MOSTRA, EM TRÊS DESTINOS ────────────────────────────────
 *
 * O plano parte o mundo em dois. Quem olha está de um lado; o que se desenha é:
 *
 *   1. o que o plano ATRAVESSA — sai CHEIO, é a face cortada;
 *   2. o que está ATRÁS do plano — sai como elevação, exatamente como numa
 *      fachada;
 *   3. o que está NA FRENTE — é a metade removida, e simplesmente some.
 *
 * O terceiro é o que separa um corte de uma elevação, e é o que faz o corte
 * mostrar o pé-direito, a escada e a inclinação do telhado ao mesmo tempo.
 *
 * ─── A CLASSIFICAÇÃO É PELA PEGADA, NUNCA PELO CENTRO ───────────────────────
 *
 * Para cada peça, o MÍNIMO e o MÁXIMO da profundidade sobre os vértices da
 * pegada em planta. Sinais opostos = o plano atravessa. Testar o CENTRO seria
 * mais barato e erraria exatamente na peça longa e quase paralela ao plano —
 * que é onde o corte decide o que mostrar. Uma fachada de 12 m com o centro na
 * frente do plano sumiria inteira, levando junto a metade dela que estava atrás.
 *
 * ─── O PLANO É INFINITO ─────────────────────────────────────────────────────
 *
 * O segmento que o usuário traça é a MARCA — a linha com as setas e a letra que
 * aparece em planta. A classificação usa o plano infinito que passa por ela. É
 * o que "corte" significa, e é a regra que não depende de alguém ter esticado a
 * linha até o fim da casa.
 */

import {
  alturaNaAgua,
  cantosDaParede,
  contornoEmPlanta,
  extensaoDeCanto,
  normalDaAgua,
  wallLength,
  type Agua,
  type BlueprintModel,
  type Corte,
  type ObjectId,
  type Point,
  type Structural,
  type Wall,
} from './blueprintKernel';
import {
  projetarElevacao,
  type AberturaElevacao,
  type AguaElevacao,
  type BaseElevacao,
  type EstruturaElevacao,
  type RetanguloElevacao,
} from './blueprintElevation';

/**
 * A base do corte: `u` corre ao longo da linha, `d` aponta para onde se olha.
 *
 * Com `olharPara: 'ESQUERDA'`, `d` é a normal esquerda de `a → b` e o `u` que
 * dela se deriva (`direitaDe(d)`) cai EXATAMENTE sobre `a → b` — quem traçou da
 * esquerda para a direita vê o corte na mesma mão em que desenhou. Olhar para a
 * direita espelha o desenho, que é o correto: é a mesma casa vista do outro
 * lado.
 */
export function baseDoCorte(corte: Corte): BaseElevacao {
  const dx = corte.b.x - corte.a.x;
  const dy = corte.b.y - corte.a.y;
  const comp = Math.hypot(dx, dy);
  // `assertModelInvariants` já recusa corte de comprimento zero; o guarda aqui
  // existe para quem monta um `Corte` à mão em teste.
  const t = comp === 0 ? { x: 1, y: 0 } : { x: dx / comp, y: dy / comp };
  // `+ 0` normaliza `-0` para `0`. É a mesma armadilha que `blueprintElevation`
  // já documenta: um `-0` invisível reprova `toEqual({ x: 0, y: 1 })` e manda
  // quem lê a falha procurar um erro de sinal que não existe.
  const z = (v: number) => v + 0;
  const d =
    corte.olharPara === 'ESQUERDA'
      ? { x: z(-t.y), y: z(t.x) }
      : { x: z(t.y), y: z(-t.x) };
  return { origem: 'LINHA_DE_CORTE', d, u: { x: z(d.y), y: z(-d.x) } };
}

/** Onde uma peça está em relação ao plano. */
export type DestinoNoCorte = 'CORTADO' | 'ATRAS' | 'FRENTE';

/**
 * Classifica uma pegada em planta contra o plano.
 *
 * `folga` absorve o vértice que cai exatamente sobre o plano: sem ela, uma
 * parede que ENCOSTA no plano sem atravessá-lo (mín = 0) seria classificada
 * como cortada e sairia cheia, com espessura zero — um risco preto no meio do
 * desenho, vindo de uma parede que o corte não toca.
 */
export function classificarNoCorte(
  pegada: Point[],
  base: BaseElevacao,
  origem: Point,
  folga = 1,
): DestinoNoCorte {
  if (pegada.length === 0) return 'FRENTE';
  const fs = pegada.map((p) => (p.x - origem.x) * base.d.x + (p.y - origem.y) * base.d.y);
  const min = Math.min(...fs);
  const max = Math.max(...fs);
  if (min < -folga && max > folga) return 'CORTADO';
  return min >= -folga ? 'ATRAS' : 'FRENTE';
}

/**
 * Os TRECHOS em que o plano atravessa um polígono, em coordenada `u`.
 *
 * Devolve PARES ordenados, e não um único mín–máx: num contorno em "L" o plano
 * pode entrar e sair duas vezes, e o mín–máx costuraria os dois pedaços num só,
 * preenchendo o vazio entre eles com massa que não existe.
 */
export function trechosCortados(
  pegada: Point[],
  base: BaseElevacao,
  origem: Point,
): { uMin: number; uMax: number }[] {
  const f = (p: Point) => (p.x - origem.x) * base.d.x + (p.y - origem.y) * base.d.y;
  // ⚠️ `u` é ABSOLUTO — `p · u`, sem subtrair a origem —, e `f` NÃO. São coisas
  // diferentes: a profundidade se mede a partir do PLANO (que passa por
  // `origem`), mas o eixo horizontal do desenho tem de ser o MESMO que
  // `projetarElevacao` usa, senão o que é cortado e o que está atrás saem
  // deslocados um do outro no mesmo desenho — por `origem · u`, que é um número
  // qualquer.
  const projU = (p: Point) => p.x * base.u.x + p.y * base.u.y;

  const cruzamentos: number[] = [];
  for (let i = 0; i < pegada.length; i++) {
    const p = pegada[i];
    const q = pegada[(i + 1) % pegada.length];
    const fp = f(p);
    const fq = f(q);
    if (fp === fq) continue;
    // Meio-aberto (`fp <= 0 < fq` ou o inverso): um vértice exatamente sobre o
    // plano contaria DUAS vezes se as duas arestas o incluíssem, e os pares
    // sairiam trocados.
    const cruza = (fp <= 0 && fq > 0) || (fq <= 0 && fp > 0);
    if (!cruza) continue;
    const t = fp / (fp - fq);
    cruzamentos.push(projU({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }));
  }

  cruzamentos.sort((x, y) => x - y);
  const trechos: { uMin: number; uMax: number }[] = [];
  for (let i = 0; i + 1 < cruzamentos.length; i += 2) {
    trechos.push({ uMin: cruzamentos[i], uMax: cruzamentos[i + 1] });
  }
  return trechos;
}

/** Uma peça ATRAVESSADA pelo plano — a face cortada, desenhada cheia. */
export interface ItemCortado {
  id: ObjectId;
  familia: 'PAREDE' | 'ESTRUTURA' | 'TELHADO';
  /** Contorno da face cortada no plano `(u, v)`, fechado pela ordem. */
  pontos: { u: number; v: number }[];
  /**
   * Vãos recortados DENTRO da face — só parede, e só quando o plano passa pela
   * abertura. É o motivo de se escolher onde cortar: passar pela porta.
   */
  vaos: { uMin: number; uMax: number; vMin: number; vMax: number }[];
  /** Abaixo do piso: o renderer traceja, como na elevação. */
  enterrada: boolean;
  rotulo: string | null;
}

export interface ProjecaoCorte {
  corteId: ObjectId;
  rotulo: string;
  base: BaseElevacao;
  levelIds: ObjectId[];
  /** O que o plano atravessa. Pintado por CIMA da vista. */
  cortados: ItemCortado[];
  /** O que está ATRÁS do plano — os mesmos tipos da elevação. */
  paredes: RetanguloElevacao[];
  aberturas: AberturaElevacao[];
  estruturas: EstruturaElevacao[];
  telhados: AguaElevacao[];
  linhaDoSolo: { uMin: number; uMax: number; v: number };
  bbox: { uMin: number; uMax: number; vMin: number; vMax: number };
}

/** A pegada em planta de uma parede — o CORPO, com o avanço de canto. */
function pegadaDaParede(paredesDoNivel: Wall[], w: Wall): Point[] {
  return cantosDaParede(
    w.a,
    w.b,
    w.thicknessMm,
    extensaoDeCanto(paredesDoNivel, w, 'a'),
    extensaoDeCanto(paredesDoNivel, w, 'b'),
  );
}

/** Retângulo `(u, v)` como contorno fechado. */
function caixa(uMin: number, uMax: number, vMin: number, vMax: number) {
  return [
    { u: uMin, v: vMin },
    { u: uMax, v: vMin },
    { u: uMax, v: vMax },
    { u: uMin, v: vMax },
  ];
}

export function projetarCorte(
  model: BlueprintModel,
  opts: { corte: Corte; levelIds?: ObjectId[] },
): ProjecaoCorte {
  const { corte } = opts;
  const base = baseDoCorte(corte);
  const origem = corte.a;

  // A vista do que está ATRÁS sai da MESMA máquina da elevação, com a base do
  // corte injetada. `direcao` vai só porque a assinatura pede; com `base`
  // presente ela não é lida.
  const vista = projetarElevacao(model, {
    direcao: 'FRENTE',
    levelIds: opts.levelIds,
    base,
  });

  const niveis = model.levels.filter((l) => !opts.levelIds || opts.levelIds.includes(l.id));
  const idsDeNivel = new Set(niveis.map((l) => l.id));
  // ABSOLUTO, como o da elevação — ver `trechosCortados`.
  const projU = (p: Point) => p.x * base.u.x + p.y * base.u.y;

  const cortados: ItemCortado[] = [];
  const destino = new Map<ObjectId, DestinoNoCorte>();

  // ── Paredes ───────────────────────────────────────────────────────────────
  for (const level of niveis) {
    const paredesDoNivel = model.walls.filter((w) => w.levelId === level.id);
    for (const w of paredesDoNivel) {
      const pegada = pegadaDaParede(paredesDoNivel, w);
      const dest = classificarNoCorte(pegada, base, origem);
      destino.set(w.id, dest);
      if (dest !== 'CORTADO') continue;

      const vMin = level.elevationMm;
      const vMax = level.elevationMm + w.heightMm;

      // Onde, ao longo do eixo da parede, o plano passa — é o que decide quais
      // aberturas o corte atravessa.
      const comp = wallLength(w);
      const fa = (w.a.x - origem.x) * base.d.x + (w.a.y - origem.y) * base.d.y;
      const fb = (w.b.x - origem.x) * base.d.x + (w.b.y - origem.y) * base.d.y;
      const sNoEixo = fa === fb ? null : (fa / (fa - fb)) * comp;

      for (const trecho of trechosCortados(pegada, base, origem)) {
        const vaos =
          sNoEixo === null
            ? []
            : model.openings
                .filter(
                  (o) =>
                    o.wallId === w.id &&
                    sNoEixo >= o.offsetMm &&
                    sNoEixo <= o.offsetMm + o.widthMm,
                )
                // O vão atravessa a espessura inteira: no corte ele ocupa TODO
                // o trecho, não uma fatia dele.
                .map((o) => ({
                  uMin: trecho.uMin,
                  uMax: trecho.uMax,
                  vMin: vMin + o.sillMm,
                  vMax: vMin + o.sillMm + o.heightMm,
                }));

        cortados.push({
          id: w.id,
          familia: 'PAREDE',
          pontos: caixa(trecho.uMin, trecho.uMax, vMin, vMax),
          vaos,
          enterrada: false,
          rotulo: null,
        });
      }
    }

    // ── Estrutura ───────────────────────────────────────────────────────────
    for (const s of (model.structures ?? []).filter((x) => x.levelId === level.id)) {
      const pegada = contornoEmPlanta(s);
      const dest = classificarNoCorte(pegada, base, origem);
      destino.set(s.id, dest);
      if (dest !== 'CORTADO') continue;

      const vMin = level.elevationMm + s.baseMm;
      const vMax = vMin + s.alturaMm;
      for (const trecho of trechosCortados(pegada, base, origem)) {
        cortados.push({
          id: s.id,
          familia: 'ESTRUTURA',
          pontos: caixa(trecho.uMin, trecho.uMax, vMin, vMax),
          vaos: [],
          enterrada: s.baseMm < 0,
          rotulo: s.rotulo ?? null,
        });
      }
    }

    // ── Telhado ─────────────────────────────────────────────────────────────
    //
    // A ÚNICA face cortada que não é retângulo: a água é inclinada, e o corte
    // dela é um paralelogramo. É por isso que o corte é o desenho em que a
    // inclinação se lê — e um retângulo aqui apagaria justamente isso.
    for (const r of (model.roofs ?? []).filter((x) => x.levelId === level.id)) {
      const dest = classificarNoCorte(r.pontos, base, origem);
      destino.set(r.id, dest);
      if (dest !== 'CORTADO') continue;
      cortados.push(...faceCortadaDaAgua(r, level.elevationMm, base, origem, projU));
    }
  }

  const noCorte = (id: ObjectId) => destino.get(id) ?? 'ATRAS';
  const paredes = vista.paredes.filter((p) => idsDeNivel.has(p.levelId) && noCorte(p.wallId) === 'ATRAS');
  const idsDeParedeAtras = new Set(paredes.map((p) => p.wallId));

  const proj: ProjecaoCorte = {
    corteId: corte.id,
    rotulo: corte.rotulo,
    base,
    levelIds: vista.levelIds,
    cortados,
    paredes,
    aberturas: vista.aberturas.filter((o) => idsDeParedeAtras.has(o.wallId)),
    estruturas: vista.estruturas.filter((e) => noCorte(e.structuralId) === 'ATRAS'),
    telhados: (vista.telhados ?? []).filter((t) => noCorte(t.aguaId) === 'ATRAS'),
    linhaDoSolo: vista.linhaDoSolo,
    bbox: vista.bbox,
  };

  return { ...proj, bbox: bboxDoCorte(proj) };
}

/**
 * A face cortada de uma água: um paralelogramo por trecho.
 *
 * A aresta de CIMA são os dois pontos do trecho na cota que a água tem ali; a
 * de baixo é a mesma deslocada de uma espessura ao longo da normal do plano
 * inclinado. Como essa normal tem componente horizontal, o deslocamento anda
 * também em `u` — desenhar a face como um retângulo de altura `espessura`
 * mostraria uma laje horizontal onde há uma rampa.
 */
function faceCortadaDaAgua(
  r: Agua,
  elevacaoDoNivelMm: number,
  base: BaseElevacao,
  origem: Point,
  projU: (p: Point) => number,
): ItemCortado[] {
  const f = (p: Point) => (p.x - origem.x) * base.d.x + (p.y - origem.y) * base.d.y;
  const n = normalDaAgua(r);
  const duPorEspessura = -(n.x * base.u.x + n.y * base.u.y);
  const dvPorEspessura = -n.z;

  // Os cruzamentos em PLANTA, para poder ler a cota de cada um.
  const pontos: Point[] = [];
  for (let i = 0; i < r.pontos.length; i++) {
    const p = r.pontos[i];
    const q = r.pontos[(i + 1) % r.pontos.length];
    const fp = f(p);
    const fq = f(q);
    if (fp === fq) continue;
    if (!((fp <= 0 && fq > 0) || (fq <= 0 && fp > 0))) continue;
    const t = fp / (fp - fq);
    pontos.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  }
  pontos.sort((a, b) => projU(a) - projU(b));

  const saida: ItemCortado[] = [];
  for (let i = 0; i + 1 < pontos.length; i += 2) {
    const p1 = pontos[i];
    const p2 = pontos[i + 1];
    const topo = [p1, p2].map((p) => ({
      u: projU(p),
      v: elevacaoDoNivelMm + alturaNaAgua(r, p),
    }));
    const baixo = topo.map((t) => ({
      u: t.u + duPorEspessura * r.espessuraMm,
      v: t.v + dvPorEspessura * r.espessuraMm,
    }));
    // Ordem que fecha o paralelogramo: topo da esquerda → topo da direita →
    // baixo da direita → baixo da esquerda.
    saida.push({
      id: r.id,
      familia: 'TELHADO',
      pontos: [topo[0], topo[1], baixo[1], baixo[0]],
      vaos: [],
      enterrada: false,
      rotulo: `${r.inclinacaoPct}%`,
    });
  }
  return saida;
}

/**
 * O enquadramento do CORTE — e ele NÃO é o da elevação.
 *
 * `projetarElevacao` mediu a caixa com a edificação inteira, inclusive a metade
 * que o corte descarta. Reaproveitá-la deixaria o desenho encolhido num canto,
 * com o vazio da metade removida ocupando o resto do papel.
 */
function bboxDoCorte(proj: ProjecaoCorte): ProjecaoCorte['bbox'] {
  const us: number[] = [];
  const vs: number[] = [];
  for (const c of proj.cortados) {
    for (const p of c.pontos) {
      us.push(p.u);
      vs.push(p.v);
    }
  }
  for (const p of proj.paredes) {
    if (p.degenerada) continue;
    us.push(p.uMin, p.uMax);
    vs.push(p.vMin, p.vMax);
  }
  for (const e of proj.estruturas) {
    if (e.degenerada) continue;
    us.push(e.uMin, e.uMax);
    vs.push(e.vMin, e.vMax);
  }
  for (const t of proj.telhados) {
    if (t.degenerada) continue;
    us.push(t.uMin, t.uMax);
    vs.push(t.vMin, t.vMax);
  }
  if (us.length === 0) return proj.bbox;
  return {
    uMin: Math.min(...us),
    uMax: Math.max(...us),
    // O solo entra sempre: um corte que só pega o telhado ainda se lê a partir
    // do chão, e sem ele o desenho flutuaria.
    vMin: Math.min(proj.linhaDoSolo.v, ...vs),
    vMax: Math.max(...vs),
  };
}
