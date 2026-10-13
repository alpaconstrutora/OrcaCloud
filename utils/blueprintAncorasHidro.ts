/**
 * AS ÂNCORAS DA HIDRÁULICA NA FRENTE DO LOTE (13/10/2026).
 *
 * Plano: `docs/planos/2026-10-13-hidro-ancoras-automaticas.md`. O pedido:
 * *"Se é para ser automatico, por que pedirmos um passo manual ao usuário"* —
 * o esgoto automático parava em "Coloque a ligação à rede pública (no limite
 * do lote…)", e o hidrômetro e a saída pluvial pedem o mesmo.
 *
 * Essas peças guardam POSIÇÃO e COTA, e o desenho já sabe as duas o bastante
 * para começar: a frente do lote é a divisa com `papel: 'FRENTE'` (ou a
 * testada do lote, ou o lado que dá para a via), e a cota sai do terreno ali.
 * A peça nasce `sugerida`; mover apaga a marca (mover é decidir), e os planos
 * da gaveta recalculam sozinhos. Daqui saem só a geometria e a cota — quem
 * lança é cada planejador.
 *
 * ─── A ORDEM DA FRENTE ─────────────────────────────────────────────────────
 *
 *   1. divisa de TERRENO com `papel === 'FRENTE'` — o usuário disse; vale tudo
 *      o que ele marcou (lote de esquina tem duas);
 *   2. a TESTADA do lote do loteamento que contém o alvo (`testadaIndex`; sem
 *      índice, o lado dele mais perto de uma via);
 *   3. o lado do anel de divisas mais perto de uma VIA desenhada;
 *   4. nada: `null`. Quem chama diz ao usuário para marcar a frente — é a única
 *      pergunta que sobra, e a resposta serve também aos recuos.
 *
 * ⚠️ O LADO DE DENTRO sai do POLÍGONO (o ponto recuado cai dentro do lote?),
 * não do sentido do anel: errar o sinal da normal num anel horário poria a
 * peça na calçada — o erro que `papeisSugeridos` documenta. Sem polígono
 * fechado (contorno aberto), dentro é o lado do alvo.
 */
import { pointInPolygon, projecaoNoSegmento, type BlueprintModel, type Point } from './blueprintKernel';
import { medirTerreno } from './blueprintTerreno';

/** A peça fica no lote, não na calçada: tanto para dentro da divisa, mm. */
export const RECUO_DA_ANCORA_MM = 300;

export type OrigemDaFrente = 'PAPEL' | 'TESTADA' | 'VIA';

export interface SegmentoDaFrente {
  a: Point;
  b: Point;
  /** Normal unitária que aponta para DENTRO do lote. */
  dentro: { x: number; y: number };
}

export interface FrenteDoLote {
  origem: OrigemDaFrente;
  segmentos: SegmentoDaFrente[];
}

export interface PontoNaFrente {
  /** Na divisa, recuado `RECUO_DA_ANCORA_MM` para dentro; mm inteiros. */
  ponto: Point;
  /** O pé na própria divisa (antes do recuo). */
  naDivisa: Point;
  origem: OrigemDaFrente;
}

/**
 * Leitor da cota do terreno: o mesmo formato do `TerrenoParaCorte` — a versão
 * de topografia exibida (`amostradorDaGrade`) e a cota absoluta do zero do
 * desenho. A topografia NÃO mora no modelo; quem tem é o editor.
 */
export interface LeitorDoTerreno {
  cotaEmM: (p: Point) => number | null;
  cotaZeroM: number;
}

const unit = (x: number, y: number) => {
  const n = Math.hypot(x, y);
  return n === 0 ? null : { x: x / n, y: y / n };
};

/** Normal para dentro: a que, recuada a partir do meio do lado, cai no polígono (ou, sem polígono, para o lado do alvo). */
function normalParaDentro(a: Point, b: Point, poligono: Point[] | null, alvo: Point | null): { x: number; y: number } | null {
  const d = unit(b.x - a.x, b.y - a.y);
  if (!d) return null;
  const esquerda = { x: -d.y, y: d.x };
  const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (poligono && poligono.length >= 3) {
    const teste = { x: meio.x + esquerda.x * RECUO_DA_ANCORA_MM, y: meio.y + esquerda.y * RECUO_DA_ANCORA_MM };
    return pointInPolygon(poligono, teste) ? esquerda : { x: -esquerda.x, y: -esquerda.y };
  }
  if (alvo) {
    const lado = (alvo.x - meio.x) * esquerda.x + (alvo.y - meio.y) * esquerda.y;
    return lado >= 0 ? esquerda : { x: -esquerda.x, y: -esquerda.y };
  }
  return null;
}

/** Distância do ponto ao ALINHAMENTO da via mais próxima (eixo menos meia caixa); Infinity sem via. */
function distanciaAViaMaisProxima(model: BlueprintModel, p: Point): number {
  let melhor = Infinity;
  for (const v of model.vias ?? []) {
    for (let i = 0; i + 1 < v.eixo.length; i++) {
      const pr = projecaoNoSegmento(p, v.eixo[i], v.eixo[i + 1]);
      if (pr) melhor = Math.min(melhor, Math.max(0, pr.distanciaMm - v.larguraMm / 2));
    }
  }
  return melhor;
}

const meioDe = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** O lado mais perto de uma via; null sem via. Contorno aberto: só os lados desenhados (o último não fecha no primeiro). */
function ladoPelaVia(model: BlueprintModel, pontos: Point[], fechado = true): number | null {
  if ((model.vias ?? []).length === 0) return null;
  let melhor: number | null = null;
  let menor = Infinity;
  for (let i = 0; i < (fechado ? pontos.length : pontos.length - 1); i++) {
    const d = distanciaAViaMaisProxima(model, meioDe(pontos[i], pontos[(i + 1) % pontos.length]));
    if (d < menor) {
      menor = d;
      melhor = i;
    }
  }
  return Number.isFinite(menor) ? melhor : null;
}

/**
 * A frente do lote — ver a ordem no cabeçalho. `alvo` (a caixa, o prédio)
 * escolhe o lote do loteamento e decide o lado de dentro num contorno aberto.
 */
export function frenteDoLote(model: BlueprintModel, alvo: Point | null = null): FrenteDoLote | null {
  const terreno = medirTerreno(model.boundaries ?? []);
  const anel = terreno && terreno.fechado ? terreno.anel : null;

  // 1. O papel que o usuário marcou.
  const marcadas = (model.boundaries ?? []).filter((b) => b.kind === 'TERRENO' && b.papel === 'FRENTE');
  const porPapel = marcadas.flatMap((b): SegmentoDaFrente[] => {
    const dentro = normalParaDentro(b.a, b.b, anel, alvo);
    return dentro ? [{ a: { ...b.a }, b: { ...b.b }, dentro }] : [];
  });
  if (porPapel.length > 0) return { origem: 'PAPEL', segmentos: porPapel };

  // 2. A testada do lote do loteamento que contém o alvo.
  const lote = alvo ? (model.lotes ?? []).find((l) => l.pontos.length >= 3 && pointInPolygon(l.pontos, alvo)) : undefined;
  if (lote) {
    const i = lote.testadaIndex ?? ladoPelaVia(model, lote.pontos);
    if (i != null) {
      const a = lote.pontos[i];
      const b = lote.pontos[(i + 1) % lote.pontos.length];
      const dentro = normalParaDentro(a, b, lote.pontos, alvo);
      if (dentro) return { origem: 'TESTADA', segmentos: [{ a: { ...a }, b: { ...b }, dentro }] };
    }
  }

  // 3. O lado do anel de divisas que dá para a via.
  if (terreno && terreno.anel.length >= 2) {
    const pontos = terreno.anel;
    const i = ladoPelaVia(model, pontos, terreno.fechado);
    if (i != null) {
      const a = pontos[i];
      const b = pontos[(i + 1) % pontos.length];
      const dentro = normalParaDentro(a, b, anel, alvo);
      if (dentro) return { origem: 'VIA', segmentos: [{ a: { ...a }, b: { ...b }, dentro }] };
    }
  }
  return null;
}

/**
 * O ponto da frente mais perto do alvo — a projeção dele no segmento mais
 * próximo, longe das pontas (canto do lote não é lugar de ligação) e recuado
 * para dentro. `null` sem frente.
 */
export function pontoNaFrente(model: BlueprintModel, alvo: Point): PontoNaFrente | null {
  const frente = frenteDoLote(model, alvo);
  if (!frente) return null;
  let melhor: { pe: Point; s: SegmentoDaFrente; dist: number } | null = null;
  for (const s of frente.segmentos) {
    const comp = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    const pr = projecaoNoSegmento(alvo, s.a, s.b);
    if (!pr || comp === 0) continue;
    // Longe das pontas: o recuo da peça também ao longo da divisa (no máximo o meio do lado).
    const margem = Math.min(RECUO_DA_ANCORA_MM, comp / 2) / comp;
    const u = Math.max(margem, Math.min(1 - margem, pr.u));
    const pe = { x: s.a.x + (s.b.x - s.a.x) * u, y: s.a.y + (s.b.y - s.a.y) * u };
    const dist = Math.hypot(pe.x - alvo.x, pe.y - alvo.y);
    if (!melhor || dist < melhor.dist) melhor = { pe, s, dist };
  }
  if (!melhor) return null;
  const { pe, s } = melhor;
  return {
    naDivisa: { x: Math.round(pe.x), y: Math.round(pe.y) },
    ponto: { x: Math.round(pe.x + s.dentro.x * RECUO_DA_ANCORA_MM), y: Math.round(pe.y + s.dentro.y * RECUO_DA_ANCORA_MM) },
    origem: frente.origem,
  };
}

/**
 * Cota do terreno no ponto, em mm relativos ao ZERO do desenho. Sem
 * topografia, ou fora da grade: 0 — o térreo, a mesma referência das cotas
 * padrão das fichas (a ligação nasce a −1500 dela).
 */
export function cotaDoTerrenoEm(p: Point, terreno: LeitorDoTerreno | null = null): number {
  const c = terreno?.cotaEmM(p);
  if (c == null || !Number.isFinite(c)) return 0;
  return Math.round((c - terreno!.cotaZeroM) * 1000);
}
