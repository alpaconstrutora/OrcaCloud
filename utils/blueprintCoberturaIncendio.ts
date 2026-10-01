/**
 * A COBERTURA DOS HIDRANTES (30/09/2026, E3.3 do roadmap de incêndio — vai além
 * do AltoQi, que só lança): todo ponto de todo ambiente tem de estar ao ALCANCE
 * de algum hidrante, e o alcance é a MANGUEIRA esticada pelo caminho que uma
 * pessoa faz — de porta em porta — mais o JATO.
 *
 * A distância de um hidrante a um ponto q de um ambiente é a do percurso das
 * portas do grafo espacial (`blueprintGrafoEspacial.percursoEntre`):
 *   hidrante → 1ª porta → … → última porta → q.
 * No próprio ambiente do hidrante, a reta até q. Um pavimento por vez (a
 * mangueira não sobe escada).
 *
 * ⚠️ O ambiente está coberto quando TODO ponto dele tem algum hidrante ao
 * alcance — e não quando um hidrante só alcança o ambiente inteiro: o corredor
 * de 60 m é coberto por dois hidrantes, cada um com a sua metade (o primeiro
 * critério, "um hidrante para o ambiente todo", deixava esse corredor sem
 * solução; uma sonda pegou). Os pontos testados são os cantos e um a cada
 * `PASSO_DA_AMOSTRA_MM` ao longo das paredes.
 *
 * ⚠️ Mangueira e jato são PREMISSAS (CONFERIR NA IT): o comprimento é o da
 * mangueira do cálculo (E2.3) e o jato, `alcanceDoJatoM`.
 *
 * A PROPOSTA é gulosa (cobertura de conjunto, sobre os pontos): candidatos na
 * face da parede mais próxima do centro de cada ambiente e ao longo da
 * circulação; escolhe o que cobre mais pontos ainda descobertos, preferindo a
 * circulação. Nasce SUGERIDA — mover confirma.
 */
import { pointInPolygon, type BlueprintModel, type Command, type ObjectId, type Point, type Space } from './blueprintKernel';
import { centroDoAmbiente, construirGrafoEspacial, percursoEntre, type GrafoEspacial } from './blueprintGrafoEspacial';
import { faceDaParede } from './blueprintRotaPelasParedes';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import type { HipotesesHidraulicasDeIncendio } from './blueprintCalculoIncendio';
import type { MarcaDeVerificacao } from './blueprintVerificacaoRede';

/** As marcas do desenho: um aviso no centro de cada ambiente fora do alcance. */
export function marcasDaCobertura(c: CoberturaDosHidrantes): MarcaDeVerificacao[] {
  return c.descobertos.map((a) => ({
    chave: `inccob|${a.spaceId}`,
    tipo: 'INCENDIO_SEM_COBERTURA',
    levelId: a.levelId,
    at: { x: Math.round(a.centro.x), y: Math.round(a.centro.y) },
    texto: a.distanciaM == null ? 'sem hidrante ao alcance' : `fora do alcance (${a.distanciaM.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m)`,
    severidade: 'ERRO',
    alvoId: a.spaceId,
    disciplina: 'INCENDIO',
  }));
}

/** Ambiente menor que isto (shaft, nicho) não entra na cobertura. */
export const AREA_MINIMA_COBERTA_M2 = 2;
/** Um ponto testado a cada tanto ao longo das paredes do ambiente. */
export const PASSO_DA_AMOSTRA_MM = 2000;

export interface CoberturaDoAmbiente {
  spaceId: ObjectId;
  levelId: ObjectId;
  nome: string;
  centro: Point;
  /** O hidrante mais perto do PIOR ponto do ambiente, e a distância (m) desse pior ponto ao hidrante que melhor o alcança. */
  hidranteId: ObjectId | null;
  distanciaM: number | null;
  coberto: boolean;
}

export interface CoberturaDosHidrantes {
  alcanceHidranteM: number;
  alcanceMangotinhoM: number;
  ambientes: CoberturaDoAmbiente[];
  descobertos: CoberturaDoAmbiente[];
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Os pontos testados do ambiente: os cantos e um a cada `PASSO_DA_AMOSTRA_MM` nas paredes. */
export function amostrasDoAmbiente(s: Space): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < s.ring.length; i++) {
    const a = s.ring[i];
    const b = s.ring[(i + 1) % s.ring.length];
    const n = Math.max(1, Math.ceil(dist(a, b) / PASSO_DA_AMOSTRA_MM));
    for (let k = 0; k < n; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return pts;
}

/** O ambiente que contém o ponto; senão o de centro mais próximo (hidrante na face da parede). */
function ambienteDoPonto(espacos: readonly Space[], p: Point): Space | null {
  return espacos.find((s) => pointInPolygon(s.ring, p)) ?? [...espacos].sort((a, b) => dist(centroDoAmbiente(a), p) - dist(centroDoAmbiente(b), p))[0] ?? null;
}

/**
 * Mede distâncias pelo percurso num pavimento, com cache dos percursos entre
 * ambientes (o Dijkstra é o caro).
 */
function medidor(g: GrafoEspacial, espacos: readonly Space[]) {
  const cache = new Map<string, Point[] | null>();
  const portasEntre = (de: ObjectId, para: ObjectId): Point[] | null => {
    const k = `${de}>${para}`;
    if (!cache.has(k)) {
      const p = percursoEntre(g, de, para);
      cache.set(k, p && p.portas.length ? p.portas.map((x) => x.ponto) : null);
    }
    return cache.get(k)!;
  };
  /** Distância (mm) de `de` a cada ponto de `alvo`, pelas portas; `null` = não há caminho. */
  return (de: Point, alvo: Space, pontos: readonly Point[]): (number | null)[] => {
    const origem = ambienteDoPonto(espacos, de);
    if (!origem) return pontos.map(() => null);
    if (origem.id === alvo.id) return pontos.map((q) => dist(de, q));
    const portas = portasEntre(origem.id, alvo.id);
    if (!portas) return pontos.map(() => null);
    let ate = dist(de, portas[0]);
    for (let i = 0; i + 1 < portas.length; i++) ate += dist(portas[i], portas[i + 1]);
    const ultima = portas[portas.length - 1];
    return pontos.map((q) => ate + dist(ultima, q));
  };
}

/** A distância (mm) de um ponto ao canto mais desfavorável de `alvo`, pelas portas — o pior dos pontos testados. */
export function distanciaPeloPercursoMm(g: GrafoEspacial, espacos: readonly Space[], de: Point, alvo: Space): number | null {
  const d = medidor(g, espacos)(de, alvo, amostrasDoAmbiente(alvo));
  return d.some((x) => x == null) ? null : Math.max(...(d as number[]));
}

const COMBATE = new Set(['HIDRANTE_SIMPLES', 'HIDRANTE_DUPLO', 'MANGOTINHO']);

function espacosDoNivel(model: BlueprintModel, levelId: ObjectId): Space[] {
  return model.spaces.filter((s) => s.levelId === levelId && s.areaMm2 / 1e6 >= AREA_MINIMA_COBERTA_M2);
}

export function coberturaDosHidrantes(model: BlueprintModel, hip: HipotesesHidraulicasDeIncendio): CoberturaDosHidrantes {
  const alcanceHidranteM = hip.comprimentoMangueiraHidranteM + hip.alcanceDoJatoM;
  const alcanceMangotinhoM = hip.comprimentoMangueiraMangotinhoM + hip.alcanceDoJatoM;
  const hidrantes = (model.terminais ?? []).filter((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico && COMBATE.has(t.tipoHidraulico));
  const ambientes: CoberturaDoAmbiente[] = [];
  for (const nivel of model.levels) {
    const espacos = espacosDoNivel(model, nivel.id);
    if (espacos.length === 0) continue;
    const medir = medidor(construirGrafoEspacial(model, nivel.id), espacos);
    const doNivel = hidrantes.filter((h) => h.levelId === nivel.id);
    for (const s of espacos) {
      const pontos = amostrasDoAmbiente(s);
      // Por ponto: a menor FOLGA (distância − alcance) entre os hidrantes; o ambiente vale o pior ponto.
      const porHidrante = doNivel.map((h) => ({ h, alcanceMm: (h.tipoHidraulico === 'MANGOTINHO' ? alcanceMangotinhoM : alcanceHidranteM) * 1000, d: medir(h.at, s, pontos) }));
      let pior: { folga: number; distancia: number; hidranteId: ObjectId } | null = null;
      let algumSemCaminho = doNivel.length === 0;
      for (let i = 0; i < pontos.length; i++) {
        let melhor: { folga: number; distancia: number; hidranteId: ObjectId } | null = null;
        for (const x of porHidrante) {
          const d = x.d[i];
          if (d == null) continue;
          if (!melhor || d - x.alcanceMm < melhor.folga) melhor = { folga: d - x.alcanceMm, distancia: d, hidranteId: x.h.id };
        }
        if (!melhor) {
          algumSemCaminho = true;
          continue;
        }
        if (!pior || melhor.folga > pior.folga) pior = melhor;
      }
      ambientes.push({
        spaceId: s.id,
        levelId: nivel.id,
        nome: s.name?.trim() || 'Ambiente sem nome',
        centro: centroDoAmbiente(s),
        hidranteId: pior?.hidranteId ?? null,
        distanciaM: pior ? pior.distancia / 1000 : null,
        coberto: !algumSemCaminho && !!pior && pior.folga <= 1e-6,
      });
    }
  }
  return { alcanceHidranteM, alcanceMangotinhoM, ambientes, descobertos: ambientes.filter((a) => !a.coberto) };
}

export interface PropostaDeHidrantes {
  comandos: Command[];
  /** Ambientes que nem os hidrantes novos alcançam inteiros (ilhados, sem porta). */
  semSolucao: ObjectId[];
}

/** O ponto 10 cm para DENTRO do ambiente a partir de `p`, rumo ao centro — arredondado e dentro, ou `null`. */
function paraDentro(s: Space, p: Point, mm = 100): Point | null {
  const c = centroDoAmbiente(s);
  const d = dist(p, c);
  const q = d > mm ? { x: Math.round(p.x + ((c.x - p.x) / d) * mm), y: Math.round(p.y + ((c.y - p.y) / d) * mm) } : { x: Math.round(c.x), y: Math.round(c.y) };
  return pointInPolygon(s.ring, q) ? q : null;
}

/** Hidrantes novos (sugeridos) que cobrem os pontos descobertos — guloso, pavimento a pavimento. */
export function proporHidrantes(model: BlueprintModel, hip: HipotesesHidraulicasDeIncendio): PropostaDeHidrantes {
  const alcanceMm = (hip.comprimentoMangueiraHidranteM + hip.alcanceDoJatoM) * 1000;
  const alcanceMangotinhoMm = (hip.comprimentoMangueiraMangotinhoM + hip.alcanceDoJatoM) * 1000;
  const comandos: Command[] = [];
  const semSolucao: ObjectId[] = [];
  const cota = FICHA_DO_PONTO_HIDRAULICO.HIDRANTE_SIMPLES.cotaMm.INCENDIO ?? 1300;
  const existentes = (model.terminais ?? []).filter((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico && COMBATE.has(t.tipoHidraulico));
  for (const nivel of model.levels) {
    const espacos = espacosDoNivel(model, nivel.id);
    if (espacos.length === 0) continue;
    const g = construirGrafoEspacial(model, nivel.id);
    const medir = medidor(g, espacos);
    // O universo: cada ponto testado de cada ambiente, ainda sem hidrante ao alcance.
    const pontosPorAmbiente = new Map(espacos.map((s) => [s.id, amostrasDoAmbiente(s)]));
    const faltam = new Set<string>();
    for (const s of espacos) {
      const pts = pontosPorAmbiente.get(s.id)!;
      const cobertos = new Set<number>();
      for (const h of existentes.filter((x) => x.levelId === nivel.id)) {
        const lim = h.tipoHidraulico === 'MANGOTINHO' ? alcanceMangotinhoMm : alcanceMm;
        medir(h.at, s, pts).forEach((d, i) => d != null && d <= lim + 1e-6 && cobertos.add(i));
      }
      pts.forEach((_, i) => !cobertos.has(i) && faltam.add(`${s.id}#${i}`));
    }
    if (faltam.size === 0) continue;
    const paredes = model.walls.filter((w) => w.levelId === nivel.id);
    const circulacao = new Set(g.nos.filter((n) => n.circulacao).map((n) => n.spaceId));
    // Candidatos: a face da parede mais próxima do centro de cada ambiente, e os
    // pontos testados da circulação (para o corredor longo, que pede mais de um).
    // D1.2: e os de todo ambiente que ainda tem ponto descoberto — sem o jato (IT 17, 5.8.2) um
    // salão em L de 30 m não cabe num hidrante só na face do centro (a lei A1 pegou).
    const comFalta = new Set([...faltam].map((k) => k.split('#')[0]));
    const posicoes: { at: Point; circulacao: boolean }[] = [];
    for (const s of espacos) {
      const f = faceDaParede(centroDoAmbiente(s), paredes, 1e9);
      const at = (f?.face && paraDentro(s, f.face)) ?? paraDentro(s, centroDoAmbiente(s));
      if (at) posicoes.push({ at, circulacao: circulacao.has(s.id) });
      if (circulacao.has(s.id) || comFalta.has(s.id)) for (const q of pontosPorAmbiente.get(s.id)!) {
        const dentro = paraDentro(s, q, 300);
        if (dentro) posicoes.push({ at: dentro, circulacao: circulacao.has(s.id) });
      }
    }
    const candidatos = posicoes.map((p) => {
      const cobre = new Set<string>();
      for (const s of espacos) medir(p.at, s, pontosPorAmbiente.get(s.id)!).forEach((d, i) => d != null && d <= alcanceMm + 1e-6 && cobre.add(`${s.id}#${i}`));
      return { ...p, cobre };
    });
    while (faltam.size > 0) {
      let melhor: (typeof candidatos)[number] | null = null;
      let ganho = 0;
      for (const c of candidatos) {
        let n = 0;
        for (const k of c.cobre) if (faltam.has(k)) n++;
        if (n > ganho || (n === ganho && n > 0 && c.circulacao && !melhor?.circulacao)) {
          melhor = c;
          ganho = n;
        }
      }
      if (!melhor || ganho === 0) {
        semSolucao.push(...new Set([...faltam].map((k) => k.split('#')[0])));
        break;
      }
      comandos.push({ type: 'AddTerminal', levelId: nivel.id, disciplina: 'INCENDIO', tipo: 'Hidrante', at: melhor.at, cotaMm: cota, tipoHidraulico: 'HIDRANTE_SIMPLES', sugerida: true } as Command);
      for (const k of melhor.cobre) faltam.delete(k);
    }
  }
  return { comandos, semSolucao };
}
