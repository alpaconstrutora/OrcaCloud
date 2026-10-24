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
 *                ou ponto que não se acha em ambiente nenhum).
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
 *  - INTERRUPTOR: desce da luz que ele COMANDA (a relação derivada das letras,
 *    `comandosDoModelo`), se ela estiver no ambiente; senão, da luz mais perto
 *    do ambiente. É a convenção do retorno: a fiação já deriva o retorno pelo
 *    caminho interruptor → luz. Interruptor nunca encadeia em vizinha.
 *  - TOMADA × VIZINHA: vizinha = ponto da MESMA parede (o encaixe), da mesma
 *    FACE (mesmo lado do eixo), do mesmo ambiente e da MESMA COTA (±50 mm — a
 *    tomada baixa não se pendura na média). A tomada liga na vizinha quando a
 *    distância AO LONGO da parede é MENOR que a distância em planta até a luz
 *    escolhida para ela.
 *  - A cadeia TERMINA NUMA LUZ: os pontos são processados do mais perto da luz
 *    para o mais longe (desempate por id) e só se pendura em quem já foi
 *    resolvido. Sem ciclo e sem cadeia solta, na ordem que a lista chegar.
 *
 * Puro: não grava, não lê nada além do modelo.
 */
import { comandosDoModelo, type BlueprintModel, type ObjectId, type Point, type Terminal, type Wall } from './blueprintKernel';
import { ambienteDoPonto } from './blueprintAgrupamentoDePontos';
import { encaixarNaParede } from './blueprintRotaPelasParedes';

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

export function encaminhamentoPorAmbiente(
  model: BlueprintModel,
  levelId: ObjectId,
  pontos: readonly Terminal[],
): Map<ObjectId, Pendura> {
  const saida = new Map<ObjectId, Pendura>();
  const doNivel = pontos.filter((t) => t.levelId === levelId).sort(porId);
  const luzes = doNivel.filter(ehLuzDeTeto);
  const deParede = doNivel.filter((t) => !ehLuzDeTeto(t));
  if (deParede.length === 0) return saida;

  const espacos = model.spaces.filter((s) => s.levelId === levelId);
  const paredes = model.walls.filter((w) => w.levelId === levelId);

  /** O id do ambiente do ponto: o que o contém ou, na face da parede, o cômodo mais perto (até o raio). */
  const ambienteDe = (t: Terminal): string | null => {
    const dentro = ambienteDoPonto(model, t);
    if (dentro) return dentro.space.id;
    let melhor: { id: string; d: number } | null = null;
    for (const s of espacos) {
      const d = distanciaAoAnel(t.at, s.ring);
      if (d <= RAIO_DO_ENCAMINHAMENTO_MM && (!melhor || d < melhor.d || (d === melhor.d && s.id < melhor.id))) melhor = { id: s.id, d };
    }
    return melhor ? melhor.id : null;
  };

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
    const doAmbiente = amb ? luzes.filter((l) => ambienteDoId.get(l.id) === amb) : [];
    if (doAmbiente.length === 0) { saida.set(t.id, { tipo: 'REDE' }); continue; }
    const que = t.tipoEletrico === 'INTERRUPTOR' ? comandadas.get(t.id) : undefined;
    const comandando = que ? doAmbiente.filter((l) => que.has(l.id)) : [];
    const luz = maisPerto(t, comandando.length > 0 ? comandando : doAmbiente);
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
        if (!vizinha || aoLongo < vizinha.aoLongoMm || (aoLongo === vizinha.aoLongoMm && n.id < vizinha.t.id)) vizinha = { t: n, aoLongoMm: aoLongo };
      }
    }
    saida.set(t.id, vizinha ? { tipo: 'VIZINHA', terminalId: vizinha.t.id } : { tipo: 'LUZ', luzId: luz.id });
    resolvidas.push(t);
  }
  return saida;
}
