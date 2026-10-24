/**
 * ENCAMINHAMENTO DO PONTO PELA LUZ DO AMBIENTE (24/10/2026) — a regra pura.
 *
 * Pedido: na obra o eletroduto da tomada e do interruptor não corre sozinho
 * até o quadro; ele *desce da luz do ambiente*, que já está ligada ao quadro.
 * Esta regra diz, para cada ponto de PAREDE de uma lista, ONDE ele se pendura:
 *
 *   - `LUZ`      na luz de teto do ambiente (a que desce até ele);
 *   - `VIZINHA`  na tomada vizinha da mesma parede, por dentro dela — a cadeia
 *                de tomadas que na obra é uma só descida;
 *   - `REDE`     como hoje: o ponto liga na rede do quadro (ambiente sem luz,
 *                ou ponto que não se acha em ambiente nenhum — inclusive o que
 *                cai dentro de um FURO do `Space`, caso raro: ali o fallback
 *                do cômodo mais perto também não o aceita).
 *
 * Quem consome é o planejador de eletrodutos (`planejarEletrodutos`); ele
 * entrega os pontos DO MESMO QUADRO naquele pavimento — por isso as luzes
 * candidatas são só as da lista: a luz de outro quadro nunca recebe o ponto.
 *
 * ─── AS REGRAS ──────────────────────────────────────────────────────────────
 *
 *  - AMBIENTE: `ambienteDoPonto` (a mesma regra da lista e da NBR 5410). Ponto
 *    na FACE da parede, fora de todo contorno de eixo, vale o cômodo mais perto
 *    até o raio de encaixe — a tomada na face de uma parede de 15 cm está a
 *    7,5 cm do eixo, fora do polígono, e nem por isso deixa de ser do cômodo.
 *  - INFRAESTRUTURA (`TIPOS_DE_INFRAESTRUTURA_ELETRICA`: caixa de passagem,
 *    aterramento, entrada de serviço, medidor) não é ponto de carga: fica FORA
 *    do mapa e não serve de vizinha, como a luz.
 *  - INTERRUPTOR: desce da luz que ele COMANDA (a relação derivada das letras,
 *    `comandosDoModelo`), se ela estiver no ambiente; senão, da luz mais perto
 *    do ambiente. É a convenção do retorno: a fiação já deriva o retorno pelo
 *    caminho interruptor → luz. Interruptor nunca encadeia em vizinha.
 *    Exceção do HALL → SALA: se o ambiente do interruptor NÃO tem luz de teto
 *    mas ele comanda uma luz da lista (de outro ambiente), desce dessa — o
 *    retorno atravessa a parede. Sem comando, REDE. Se o ambiente TEM luz e a
 *    comandada é de outro, vale a luz mais perto do próprio ambiente.
 *  - TOMADA × VIZINHA: vizinha = ponto da MESMA parede (o encaixe), da mesma
 *    FACE (mesmo lado do eixo), do mesmo ambiente e da MESMA COTA (±50 mm — a
 *    tomada baixa não se pendura na média). A tomada liga na vizinha quando a
 *    distância AO LONGO da parede é MENOR que a distância em planta até a luz
 *    escolhida para ela. Correção 1 (24/10/2026): a vizinha corre DENTRO da
 *    parede, então NÃO vale quando entre as duas caixas há um VÃO da mesma
 *    parede na altura delas (porta; a janela com peitoril acima da tomada
 *    deixa passar por baixo) ou um PILAR cruzando o segmento entre elas. Sem
 *    vizinha válida, o ponto desce da luz.
 *  - A cadeia TERMINA NUMA LUZ: os pontos são processados do mais perto da luz
 *    para o mais longe (desempate por id) e só se pendura em quem já foi
 *    resolvido. Sem ciclo e sem cadeia solta, na ordem que a lista chegar.
 *
 * Puro: não grava, não lê nada além do modelo.
 */
import { TIPOS_DE_INFRAESTRUTURA_ELETRICA, comandosDoModelo, pointInPolygon, type BlueprintModel, type ObjectId, type Point, type Terminal, type Wall } from './blueprintKernel';
import { ambienteDoPonto } from './blueprintAgrupamentoDePontos';
import { encaixarNaParede } from './blueprintRotaPelasParedes';
import { fracaoDentro, pegadasDePilares } from './blueprintObstaculosEstruturais';

/**
 * O raio de encaixe do ponto na parede e do "cômodo mais perto", em mm — o MESMO de
 * `RAIO_DE_ENCAIXE_ELETRICO_MM` (`blueprintEletrodutos.ts`). Definido aqui porque o planejador
 * importa este arquivo: importar de lá fecharia um ciclo. O teste confere que os dois não se afastam.
 */
export const RAIO_DO_ENCAMINHAMENTO_MM = 600;
/** Pontos na mesma altura: a diferença de cota que ainda conta como a mesma, mm. */
export const MESMA_COTA_MM = 50;

export type Pendura =
  | { tipo: 'LUZ'; luzId: ObjectId }
  | { tipo: 'VIZINHA'; terminalId: ObjectId }
  | { tipo: 'REDE' };

const ehLuzDeTeto = (t: Terminal) => t.tipoEletrico === 'ILUMINACAO_TETO';
const porId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const distancia = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** A distância de `p` ao segmento a→b. */
function distanciaAoSegmento(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** A distância de `p` ao contorno (anel) fechado. */
function distanciaAoAnel(p: Point, anel: readonly Point[]): number {
  let melhor = Infinity;
  for (let i = 0; i < anel.length; i++) melhor = Math.min(melhor, distanciaAoSegmento(p, anel[i], anel[(i + 1) % anel.length]));
  return melhor;
}

/** O lado do eixo da parede em que `p` está: -1, 0 (no eixo) ou 1. */
function ladoDoEixo(p: Point, w: Wall): -1 | 0 | 1 {
  const cruz = (w.b.x - w.a.x) * (p.y - w.a.y) - (w.b.y - w.a.y) * (p.x - w.a.x);
  const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
  const d = cruz / L;
  return Math.abs(d) < 1 ? 0 : d > 0 ? 1 : -1;
}

/**
 * O id do cômodo do ponto: o que o contém ou, na FACE da parede (fora de todo contorno de eixo), o cômodo mais perto até
 * `RAIO_DO_ENCAMINHAMENTO_MM`; `null` fora de todos. É a regra do AMBIENTE acima — e, desde 24/10/2026, a região de cada
 * nó da árvore das luzes no forro (`blueprintForroEntreComodos.ts`), o quadro na face da parede inclusive.
 */
export function comodoDoPonto(model: BlueprintModel, levelId: ObjectId, at: Point): ObjectId | null {
  const dentro = ambienteDoPonto(model, { levelId, at });
  if (dentro) return dentro.space.id;
  let melhor: { id: string; d: number } | null = null;
  for (const s of model.spaces) {
    if (s.levelId !== levelId) continue;
    if (s.holes.some((h) => pointInPolygon(h, at))) continue; // dentro de um furo: não é deste cômodo
    const d = distanciaAoAnel(at, s.ring);
    if (d <= RAIO_DO_ENCAMINHAMENTO_MM && (!melhor || d < melhor.d || (d === melhor.d && s.id < melhor.id))) melhor = { id: s.id, d };
  }
  return melhor ? melhor.id : null;
}

export function encaminhamentoPorAmbiente(
  model: BlueprintModel,
  levelId: ObjectId,
  pontos: readonly Terminal[],
): Map<ObjectId, Pendura> {
  const saida = new Map<ObjectId, Pendura>();
  const doNivel = pontos.filter((t) => t.levelId === levelId).sort(porId);
  const luzes = doNivel.filter(ehLuzDeTeto);
  const deParede = doNivel.filter((t) => !ehLuzDeTeto(t) && !(t.tipoEletrico && TIPOS_DE_INFRAESTRUTURA_ELETRICA.has(t.tipoEletrico)));
  if (deParede.length === 0) return saida;

  const paredes = model.walls.filter((w) => w.levelId === levelId);
  const pilares = pegadasDePilares(model, levelId);

  /**
   * Correção 1: entre as caixas `q1` e `q2` (encaixadas em `parede`, na cota `cotaMm`) há vão da parede na altura
   * delas, ou pilar cruzando o eixo `q1`→`q2` ou o segmento `a`→`b` entre os pontos? Então o eletroduto não passa por dentro da parede.
   */
  const bloqueadoEntre = (parede: Wall, q1: Point, q2: Point, a: Point, b: Point, cotaMm: number): boolean => {
    const L = Math.hypot(parede.b.x - parede.a.x, parede.b.y - parede.a.y) || 1;
    const ao = (q: Point) => ((q.x - parede.a.x) * (parede.b.x - parede.a.x) + (q.y - parede.a.y) * (parede.b.y - parede.a.y)) / L;
    const [s0, s1] = [Math.min(ao(q1), ao(q2)), Math.max(ao(q1), ao(q2))];
    for (const o of model.openings) {
      if (o.wallId !== parede.id) continue;
      const sobrepoe = o.offsetMm < s1 && o.offsetMm + o.widthMm > s0;
      const naAltura = cotaMm >= o.sillMm && cotaMm <= o.sillMm + o.heightMm;
      if (sobrepoe && naAltura) return true;
    }
    // O pilar vale no EIXO da parede (por onde o eletroduto corre: `q1`→`q2`) e na linha entre as caixas (a face):
    // o pilar mais fino que a parede, centrado no eixo, não toca a linha da face e passaria despercebido.
    return fracaoDentro(q1, q2, pilares) > 0 || fracaoDentro(a, b, pilares) > 0;
  };

  /** O id do ambiente do ponto: o que o contém ou, na face da parede, o cômodo mais perto (até o raio). */
  const ambienteDe = (t: Terminal): string | null => comodoDoPonto(model, levelId, t.at);

  const ambienteDoId = new Map<ObjectId, string | null>();
  for (const t of [...luzes, ...deParede]) ambienteDoId.set(t.id, ambienteDe(t));

  // As luzes que cada interruptor comanda (letras iguais no pavimento, ou globais).
  const comandadas = new Map<ObjectId, Set<ObjectId>>();
  for (const c of comandosDoModelo(model)) {
    for (const i of c.interruptorIds) {
      const s = comandadas.get(i) ?? new Set<ObjectId>();
      for (const l of c.luzIds) s.add(l);
      comandadas.set(i, s);
    }
  }

  const maisPerto = (t: Terminal, candidatas: readonly Terminal[]): Terminal | null => {
    let melhor: Terminal | null = null;
    let dm = Infinity;
    for (const l of candidatas) {
      const d = distancia(t.at, l.at);
      if (d < dm) { melhor = l; dm = d; } // `luzes` já vem por id: o empate fica com o menor
    }
    return melhor;
  };

  // 1) A luz escolhida de cada ponto de parede.
  const luzDoPonto = new Map<ObjectId, Terminal>();
  for (const t of deParede) {
    const amb = ambienteDoId.get(t.id);
    if (!amb) { saida.set(t.id, { tipo: 'REDE' }); continue; }
    const doAmbiente = luzes.filter((l) => ambienteDoId.get(l.id) === amb);
    const que = t.tipoEletrico === 'INTERRUPTOR' ? comandadas.get(t.id) : undefined;
    const comandando = que ? doAmbiente.filter((l) => que.has(l.id)) : [];
    // Hall → sala: sem luz no próprio ambiente, o interruptor desce da luz (da lista) que ele comanda.
    const deFora = doAmbiente.length === 0 && que ? luzes.filter((l) => que.has(l.id)) : [];
    const candidatas = comandando.length > 0 ? comandando : doAmbiente.length > 0 ? doAmbiente : deFora;
    if (candidatas.length === 0) { saida.set(t.id, { tipo: 'REDE' }); continue; }
    const luz = maisPerto(t, candidatas);
    if (luz) luzDoPonto.set(t.id, luz);
  }

  // 2) Interruptor: direto na luz. Tomada: pela vizinha, do mais perto da luz para o mais longe.
  const encaixe = new Map<ObjectId, { parede: Wall; q: Point; lado: -1 | 0 | 1 } | null>();
  const encaixeDe = (t: Terminal) => {
    if (!encaixe.has(t.id)) {
      const e = encaixarNaParede(t.at, paredes, RAIO_DO_ENCAMINHAMENTO_MM);
      encaixe.set(t.id, e ? { parede: e.parede, q: e.q, lado: ladoDoEixo(t.at, e.parede) } : null);
    }
    return encaixe.get(t.id)!;
  };

  const fila = deParede
    .filter((t) => luzDoPonto.has(t.id))
    .map((t) => ({ t, d: distancia(t.at, luzDoPonto.get(t.id)!.at) }))
    .sort((a, b) => a.d - b.d || porId(a.t, b.t));

  const resolvidas: Terminal[] = [];
  for (const { t, d } of fila) {
    const luz = luzDoPonto.get(t.id)!;
    let vizinha: { t: Terminal; aoLongoMm: number } | null = null;
    const meu = t.tipoEletrico === 'INTERRUPTOR' ? null : encaixeDe(t);
    if (meu) {
      for (const n of resolvidas) {
        if (n.tipoEletrico === 'INTERRUPTOR') continue;
        if (ambienteDoId.get(n.id) !== ambienteDoId.get(t.id)) continue;
        if (Math.abs(n.cotaMm - t.cotaMm) > MESMA_COTA_MM) continue;
        const dele = encaixeDe(n);
        if (!dele || dele.parede.id !== meu.parede.id || dele.lado !== meu.lado) continue;
        const aoLongo = distancia(meu.q, dele.q);
        if (aoLongo >= d) continue;
        if (bloqueadoEntre(meu.parede, meu.q, dele.q, t.at, n.at, t.cotaMm)) continue;
        if (!vizinha || aoLongo < vizinha.aoLongoMm || (aoLongo === vizinha.aoLongoMm && n.id < vizinha.t.id)) vizinha = { t: n, aoLongoMm: aoLongo };
      }
    }
    saida.set(t.id, vizinha ? { tipo: 'VIZINHA', terminalId: vizinha.t.id } : { tipo: 'LUZ', luzId: luz.id });
    resolvidas.push(t);
  }
  return saida;
}
