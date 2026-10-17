/**
 * GERADOR DETERMINÍSTICO DE PLANTAS (19/09/2026, roadmap E6.2) — o coração.
 *
 * Entrada: o PROGRAMA (E4.1: itens com área ideal, largura mínima, exigências,
 * privacidade; matriz de proximidade), o ENVELOPE em planta (E3.3: o anel
 * edificável do pavimento — ou um retângulo declarado nas hipóteses quando não
 * há lote), a orientação (frente do lote e norte do desenho) e as hipóteses.
 * Saída: para cada SEMENTE, uma alternativa completa — comandos do kernel,
 * modelo, avaliação (E5.2) e o LOG DE DECISÕES (a base do "explicar solução"
 * da E6.4). Mesma entrada + mesma semente = mesma planta, sempre.
 *
 * Passos:
 *  (a) ZONA POR FLUXO — o retângulo de trabalho (o maior inscrito no envelope,
 *      eixos alinhados) é fatiado da FRENTE para os FUNDOS: faixa social +
 *      serviço à frente (social primeiro, serviço encostado nela — a cozinha
 *      quer a sala), corredor (quando o programa tem CIRCULAÇÃO) e a faixa
 *      íntima aos fundos, protegida. Cada faixa tem a profundidade
 *      proporcional à área dos seus itens.
 *  (b) ALOCAÇÃO — treemap em FAIXAS ("strip"), que preserva a ordem (a zona
 *      não se perde) e mantém as proporções razoáveis; áreas ideais escaladas
 *      para caber no retângulo (nunca abaixo da mínima quando dá).
 *  (c) REFINAMENTO — recozimento simulado com PRNG semeado (mulberry32):
 *      trocas de ordem dentro das faixas e passagem de item entre a frente e
 *      o fundo; função objetivo = proxy do score da E5.2 (largura mínima,
 *      proporção, fachada e sol de quem exige, relações da matriz,
 *      privacidade). O score completo (E5.2) entra no fim, sobre o modelo
 *      pronto — rodá-lo a cada iteração exigiria remontar o arranjo planar.
 *  (d) PAREDES — externas com a espessura externa, internas pela união dos
 *      lados dos retângulos (colineares fundidos), tudo na malha de 50 mm;
 *      NOMES e tipo NBR 5410 pelas etiquetas; PORTAS junto da circulação (ou
 *      da sala), ENTRADA na frente; JANELAS na fachada de quem exige
 *      iluminação/fachada (basculante no banheiro).
 *  (e) AUTOMÁTICOS já existentes: pilares, vigas, lajes, tomadas e luz pela
 *      NBR 5410, pontos hidráulicos. Água e esgoto precisam de reservatório e
 *      caixa de inspeção — ficam para a mão do projetista (declarado no log).
 *  (f) AVALIAÇÃO (E5.2) com o programa, as regras semente e a insolação.
 *
 * `frenteDePareto` separa as alternativas não dominadas em área construída
 * (menor), metros de parede (o proxy de custo — o orçamento é da E7) e nota.
 */
import {
  applyBatch,
  emptyModel,
  pointInPolygon,
  polygonArea,
  point,
  type BlueprintModel,
  type Command,
  type ObjectId,
  type Point,
  TIPO_NBR5410_DO_USO,
  type TipoDeAmbiente,
  type Wall,
} from './blueprintKernel';
import { areaRecuada, uidDeterministico, wallLength } from './blueprintKernel';
import { type ItemDoPrograma, type Programa, type RelacaoDoPrograma } from './blueprintPrograma';
import { avaliar, type Avaliacao, type HipotesesDaAvaliacao, HIPOTESES_DA_AVALIACAO_PADRAO } from './blueprintAvaliacao';
import { conferirPrograma } from './blueprintConferenciaDoPrograma';
import { avaliarRegras, REGRAS_SEMENTE, type ContextoDeRegras, type ResultadoDeRegra } from './blueprintRegras';
import { planejarPilares } from './blueprintPilaresAutomaticos';
import { planejarLajes, planejarVigas } from './blueprintVigasLajesAutomaticas';
import { planejarPontosDoNivel } from './blueprintPontosHidraulicos';
import { comandosDePontosDoNivel } from './blueprintPontosEletricosDoNivel';
import { anelDoRetangulo, areaDoRetangulo, ladoComumDosRetangulos, retangulosDoContorno, subtrairBorda, trechosNaBorda, type LadoNoDesenho } from './blueprintContorno';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type LadoDaFrente = 'S' | 'N' | 'L' | 'O';

export interface HipotesesDoGerador {
  sementes: number;
  iteracoes: number;
  malhaMm: number;
  espessuraExternaMm: number;
  espessuraInternaMm: number;
  peDireitoMm: number;
  larguraCorredorMm: number;
  larguraPortaMm: number;
  larguraEntradaMm: number;
  alturaPortaMm: number;
  janela: { alturaMm: number; peitorilMm: number; fracaoDoLado: number; minMm: number; maxMm: number };
  /** Quando não há envelope (sem lote): o retângulo a preencher. */
  retanguloSemEnvelope: { larguraMm: number; profundidadeMm: number };
  automaticos: boolean;
  /**
   * F3b (casa automática, 15/10/2026): pisos por tipo NBR 5410 — LARGURA LIVRE e ÁREA ÚTIL mínimas, os
   * mesmos das regras semente (`sem-banheiro-*`, `sem-cozinha-*`, `sem-sala-*`). O gerador soma a parede
   * externa (a mais grossa — conservador) para chegar ao eixo; a ficha do uso continua valendo quando é maior.
   */
  minimosPorTipo: Partial<Record<TipoDeAmbiente, { larguraLivreMm: number; areaUtilM2: number }>>;
  /** Fração mínima da janela sobre o piso (regras semente): 1/6 no habitável, 1/8 em banheiro e cozinha/serviço. */
  iluminacaoMinima: { habitavel: number; servico: number };
  /** F6: área de garagem por vaga, m² — conta as vagas do item Garagem pela área (a mesma do programa da casa). */
  areaPorVagaM2: number;
}

export const HIPOTESES_DO_GERADOR_PADRAO: HipotesesDoGerador = {
  sementes: 4,
  iteracoes: 300,
  malhaMm: 50,
  espessuraExternaMm: 200,
  espessuraInternaMm: 150,
  peDireitoMm: 2800,
  larguraCorredorMm: 1000,
  larguraPortaMm: 800,
  larguraEntradaMm: 900,
  alturaPortaMm: 2100,
  janela: { alturaMm: 1200, peitorilMm: 1000, fracaoDoLado: 0.4, minMm: 1000, maxMm: 2000 },
  retanguloSemEnvelope: { larguraMm: 10000, profundidadeMm: 12000 },
  automaticos: true,
  minimosPorTipo: {
    BANHEIRO: { larguraLivreMm: 1200, areaUtilM2: 2.5 },
    COZINHA_SERVICO: { larguraLivreMm: 1500, areaUtilM2: 4 },
    SALA_DORMITORIO: { larguraLivreMm: 2400, areaUtilM2: 8 },
  },
  iluminacaoMinima: { habitavel: 1 / 6, servico: 1 / 8 },
  areaPorVagaM2: 15,
};

// ─── F3b: os mínimos de cada ambiente, no EIXO das paredes ───────────────────

/** Largura LIVRE mínima do item: a maior entre a ficha do uso e o piso do tipo NBR 5410. */
function livreMinMm(item: ItemDoPrograma, hip: HipotesesDoGerador): number {
  return Math.max(item.larguraMinMm, hip.minimosPorTipo[TIPO_NBR5410_DO_USO[item.uso]]?.larguraLivreMm ?? 0);
}

/** Largura mínima no EIXO das paredes: a livre + uma parede externa inteira (conservador: meia de cada lado). */
function eixoMinMm(item: ItemDoPrograma, hip: HipotesesDoGerador): number {
  return livreMinMm(item, hip) + hip.espessuraExternaMm;
}

/** Área mínima no eixo para a área ÚTIL do tipo caber com a largura livre mínima. */
function areaEixoMinMm2(item: ItemDoPrograma, hip: HipotesesDoGerador): number {
  const m = hip.minimosPorTipo[TIPO_NBR5410_DO_USO[item.uso]];
  if (!m) return 0;
  const L = livreMinMm(item, hip);
  const e = hip.espessuraExternaMm;
  return (L + e) * ((m.areaUtilM2 * 1e6) / L + e);
}

const ehMolhado = (item: ItemDoPrograma) => item.uso === 'BANHEIRO' || item.uso === 'LAVABO';

export interface EntradaDoGerador {
  programa: Programa;
  /** O anel edificável do pavimento (E3.3), em mm; `null` = usa o retângulo das hipóteses. */
  envelope: Point[] | null;
  /** Direção da RUA a partir do centro do lote (unitária, no desenho) — decide a frente; `null` = sul (−Y). */
  direcaoDaFrente: Point | null;
  rotacaoNorteDeg: number | null;
  latitudeGraus: number;
  /** Hipóteses da avaliação (pesos) para a nota final. */
  hipotesesDaAvaliacao?: HipotesesDaAvaliacao;
  /**
   * Casa automática F2 (14/10/2026): o LOTE e a ZONA para as regras de lote e edificação. A TO
   * e o CA saem da própria planta (área construída ÷ lote — térrea, os dois são iguais) e a
   * altura do pé-direito. Ausente = como antes: regras avaliadas sem zona (ficam NAO_AVALIADAS).
   */
  contextoDeRegras?: Pick<ContextoDeRegras, 'lote' | 'zona'> | null;
}

export interface Retangulo {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface AmbienteGerado {
  item: ItemDoPrograma;
  /** "Dormitório 2" quando a quantidade é > 1. */
  nome: string;
  zona: 'SOCIAL' | 'SERVICO' | 'INTIMO' | 'CIRCULACAO';
  /** Retângulo no MUNDO (mm, já na malha). */
  ret: Retangulo;
  areaM2: number;
  larguraMinM: number;
  ladosExternos: LadoDaFrente[];
}

export interface ResultadoDoGerador {
  semente: number;
  hipoteses: HipotesesDoGerador;
  /** O retângulo PRINCIPAL (zonas, corredor, recozimento). */
  retangulo: Retangulo;
  /** F11: o CONTORNO de trabalho (a casca das paredes externas) e os retângulos ANEXOS dele. */
  contorno: Point[];
  anexos: Retangulo[];
  frente: LadoDaFrente;
  ambientes: AmbienteGerado[];
  /** Comandos aplicados na ordem sobre um modelo vazio + pavimento. */
  comandos: Command[];
  model: BlueprintModel;
  levelId: ObjectId;
  avaliacao: Avaliacao;
  /** As regras avaliadas (F2 da casa automática: com o lote e a zona quando a entrada os traz). */
  regras: ResultadoDeRegra[];
  resumo: { areaConstruidaM2: number; areaUtilM2: number; paredesM: number; objetivoInicial: number; objetivoFinal: number };
  decisoes: string[];
  avisos: string[];
}

// ─── PRNG semeado ────────────────────────────────────────────────────────────

/** mulberry32: 32 bits, rápido, determinístico. */
export function prng(semente: number): () => number {
  let a = (semente >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Geometria de apoio ──────────────────────────────────────────────────────

const f2 = (v: number) => v.toFixed(2).replace('.', ',');
const snap = (v: number, malha: number) => Math.round(v / malha) * malha;

/** O maior retângulo de eixos alinhados dentro do anel (busca em grade de 250 mm sobre a caixa). */
export function maiorRetanguloInscrito(anel: Point[], passoMm = 250): Retangulo | null {
  if (anel.length < 3) return null;
  const xs = anel.map((p) => p.x);
  const ys = anel.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // Caixa inteira dentro? (retângulo já) — o caso comum de lote retangular.
  const cantos = [point(minX, minY), point(maxX, minY), point(maxX, maxY), point(minX, maxY)];
  const dentro = (p: Point) => pointInPolygon(anel, p) || anel.some((q) => Math.abs(q.x - p.x) < 1 && Math.abs(q.y - p.y) < 1);
  if (cantos.every(dentro) && Math.abs(Math.abs(polygonArea(anel)) - (maxX - minX) * (maxY - minY)) < 1) return { x0: minX, y0: minY, x1: maxX, y1: maxY };
  // Grade de ocupação e maior retângulo por histograma.
  const nx = Math.max(1, Math.floor((maxX - minX) / passoMm));
  const ny = Math.max(1, Math.floor((maxY - minY) / passoMm));
  const ocupado: boolean[][] = [];
  for (let j = 0; j < ny; j++) {
    const linha: boolean[] = [];
    for (let i = 0; i < nx; i++) {
      const cx = minX + (i + 0.5) * passoMm;
      const cy = minY + (j + 0.5) * passoMm;
      // A célula inteira tem de estar dentro: testa o centro e os 4 cantos.
      const d = passoMm / 2 - 1;
      linha.push([point(cx, cy), point(cx - d, cy - d), point(cx + d, cy - d), point(cx + d, cy + d), point(cx - d, cy + d)].every((p) => pointInPolygon(anel, p)));
    }
    ocupado.push(linha);
  }
  let melhor: { area: number; ret: Retangulo } | null = null;
  const alturas = new Array(nx).fill(0) as number[];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) alturas[i] = ocupado[j][i] ? alturas[i] + 1 : 0;
    // maior retângulo no histograma (pilha)
    const pilha: number[] = [];
    for (let i = 0; i <= nx; i++) {
      const h = i < nx ? alturas[i] : 0;
      while (pilha.length && alturas[pilha[pilha.length - 1]] >= h) {
        const topo = pilha.pop()!;
        const altura = alturas[topo];
        const esquerda = pilha.length ? pilha[pilha.length - 1] + 1 : 0;
        const largura = i - esquerda;
        const area = altura * largura;
        if (altura > 0 && (!melhor || area > melhor.area)) {
          melhor = { area, ret: { x0: minX + esquerda * passoMm, y0: minY + (j - altura + 1) * passoMm, x1: minX + i * passoMm, y1: minY + (j + 1) * passoMm } };
        }
      }
      pilha.push(i);
    }
  }
  return melhor?.ret ?? null;
}

/** A frente: o lado do retângulo cuja normal externa mais aponta para a rua. */
export function ladoDaFrente(direcao: Point | null): LadoDaFrente {
  if (!direcao) return 'S';
  const c = Math.hypot(direcao.x, direcao.y) || 1;
  const dx = direcao.x / c;
  const dy = direcao.y / c;
  const candidatos: [LadoDaFrente, number][] = [
    ['S', -dy],
    ['N', dy],
    ['L', dx],
    ['O', -dx],
  ];
  return candidatos.sort((a, b) => b[1] - a[1])[0][0];
}

// ─── Plano (retângulos em coordenadas canônicas: x ao longo da frente, y da frente para o fundo) ──

interface ItemPlanejado {
  item: ItemDoPrograma;
  nome: string;
  zona: AmbienteGerado['zona'];
  areaAlvoMm2: number;
}

interface CaixaCanonica {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Plano {
  frente: ItemPlanejado[];
  fundo: ItemPlanejado[];
  corredor: ItemPlanejado | null;
  /**
   * F6b (casa automática, 15/10/2026): a frente fatiada em COLUNAS (perpendiculares à rua) em vez de linhas.
   * Ao lado de uma garagem em fila, o resto da frente só tem a rua e UMA lateral como fachada: em linhas, só o
   * último de cada linha a toca, e cozinha, serviço e lavabo caíam no miolo; em colunas, todos os da última
   * coluna a tocam. O recozimento escolhe — a função objetivo já pune quem fica sem fachada.
   */
  frenteEmColunas?: boolean;
}

/** O treemap em LINHAS (paralelas à frente) ou em COLUNAS (o mesmo, com os eixos trocados). */
function fatiar(itens: readonly ItemPlanejado[], W: number, D: number, y0: number, emColunas: boolean, hip: HipotesesDoGerador): Map<ItemPlanejado, CaixaCanonica> {
  if (!emColunas) return treemapEmFaixas(itens, W, D, y0, false, hip);
  // Trocados: a "largura" do treemap corre ao longo de y (o fundo) e as "linhas" empilham ao longo de x — cada
  // coluna vai da rua para dentro; a 1ª fica à esquerda e o 1º item de cada coluna encosta na rua.
  const out = new Map<ItemPlanejado, CaixaCanonica>();
  for (const [k, b] of treemapEmFaixas(itens, D, W, 0, false, hip)) out.set(k, { x0: b.y0, x1: b.y1, y0: y0 + b.x0, y1: y0 + b.x1 });
  return out;
}

/** Treemap em faixas (ordem preservada): itens em linhas paralelas à frente, dentro de uma faixa W × D. */
function treemapEmFaixas(itens: readonly ItemPlanejado[], W: number, D: number, y0: number, umaLinha = false, hip: HipotesesDoGerador | null = null): Map<ItemPlanejado, CaixaCanonica> {
  const out = new Map<ItemPlanejado, CaixaCanonica>();
  const total = itens.reduce((s, i) => s + i.areaAlvoMm2, 0) || 1;
  const escala = (W * D) / total;
  let y = y0;
  let i = 0;
  while (i < itens.length) {
    // Cresce a linha enquanto a pior proporção melhora.
    let linha = [itens[i]];
    let melhorPior = Infinity;
    let j = i + 1;
    // As larguras de uma linha: com `hip`, cada um recebe primeiro o seu mínimo e a SOBRA vai pela área — a MESMA
    // repartição do layout abaixo (F6: avaliar pela área e desenhar pelo mínimo discordavam; a linha "lavabo +
    // varanda + serviço", viável no desenho, era julgada inviável e o serviço ia sozinho para uma tira de 1,30 m).
    const largurasDa = (ls: ItemPlanejado[]): number[] => {
      const areaLinha = ls.reduce((s, x) => s + x.areaAlvoMm2 * escala, 0) || 1;
      const minimos = ls.map((t) => (hip ? eixoMinMm(t.item, hip) : 0));
      const somaMin = minimos.reduce((s, v) => s + v, 0);
      const pelaArea = !hip || somaMin > W;
      return ls.map((t, k) => {
        const parte = (t.areaAlvoMm2 * escala) / areaLinha;
        return pelaArea ? parte * W : minimos[k] + parte * (W - somaMin);
      });
    };
    const piorDe = (ls: ItemPlanejado[]) => {
      const area = ls.reduce((s, x) => s + x.areaAlvoMm2 * escala, 0);
      const h = area / W;
      const ws = largurasDa(ls);
      return Math.max(...ls.map((x, k) => {
        const w = ws[k];
        // F3b: na linha, ninguém fica mais estreito (nem mais raso) que o seu mínimo no eixo. Uma linha inviável
        // vale infinito: a de um item só também (sozinho, o lavabo virava uma tira de 9,00 × 0,40 m) — e
        // infinito ≤ infinito deixa a linha crescer até ficar viável, puxando os próximos itens.
        if (hip && Math.min(w, h) < eixoMinMm(x.item, hip)) return Infinity;
        return Math.max(w / h, h / w);
      }));
    };
    melhorPior = piorDe(linha);
    while (j < itens.length) {
      const teste = [...linha, itens[j]];
      const pior = piorDe(teste);
      // F6: recusar o próximo só se o que SOBRA, em linhas próprias, ainda tem o fundo mínimo — a área de serviço
      // sozinha na última linha ficava com 1,40 m (pede 1,70) por um ganho de proporção na linha de cima.
      const sobra = itens.slice(j);
      const sobraRasa = !!hip && pior !== Infinity && (sobra.reduce((s2, x) => s2 + x.areaAlvoMm2 * escala, 0) / W) < Math.max(...sobra.map((x) => eixoMinMm(x.item, hip)));
      if (umaLinha || pior <= melhorPior || sobraRasa) {
        linha = teste;
        melhorPior = pior;
        j++;
      } else break;
    }
    const areaLinha = linha.reduce((s, x) => s + x.areaAlvoMm2 * escala, 0);
    const h = i + linha.length >= itens.length ? y0 + D - y : areaLinha / W; // a última linha fecha a faixa
    // F3b: dentro da linha, cada um recebe primeiro o seu mínimo no eixo e só a SOBRA vai pela área — a
    // última linha fecha a faixa com o que restou, e repartida só pela área deixava o lavabo em 0,95 m.
    const ws = largurasDa(linha);
    let x = 0;
    linha.forEach((x0, k) => {
      const w = k === linha.length - 1 ? W - x : ws[k];
      out.set(x0, { x0: x, y0: y, x1: x + w, y1: y + h });
      x += w;
    });
    y += h;
    i += linha.length;
  }
  return out;
}

/**
 * F3b (15/10/2026) — O FUNDO EM COLUNAS. Antes era um treemap de UMA linha: a faixa íntima inteira com uma
 * profundidade só, e a largura repartida pela área — banheiro de 0,80 × 5,75 m num lote de 9 m (achado da
 * F3 da casa automática: ≥ 5 regras de ambiente violadas em todas as sementes). Agora:
 *  - cada íntimo é uma COLUNA encostada no corredor, nunca mais estreita que o seu mínimo no eixo;
 *  - o banheiro com relação OBRIGATÓRIA com um não-molhado do fundo (o da suíte) EMPILHA atrás dele, na
 *    mesma coluna — porta direta pela relação, janela na fachada dos fundos;
 *  - se os mínimos não cabem na largura, o banheiro SEM par (o social) passa para o lado de cá do corredor:
 *    `transbordo`, que vai para a ÚLTIMA linha da faixa da frente (a que encosta no corredor).
 * A sobra de largura é repartida pela área de cada coluna.
 */
function colunasDoFundo(
  fundo: readonly ItemPlanejado[],
  W: number,
  Dfundo: number,
  y0: number,
  programa: Programa,
  hip: HipotesesDoGerador,
): { caixas: Map<ItemPlanejado, CaixaCanonica>; transbordo: ItemPlanejado[] } {
  const obrigatoria = (a: ItemPlanejado, b: ItemPlanejado) =>
    programa.relacoes.some((r) => r.tipo === 'OBRIGATORIA' && ((r.a === a.item.id && r.b === b.item.id) || (r.a === b.item.id && r.b === a.item.id)));
  // Quem empilha atrás de quem (um molhado por hospedeiro) — só se os DOIS mínimos cabem na profundidade.
  // Não cabendo (faixa rasa), o molhado vira coluna IMEDIATAMENTE ao lado do par: encostam, e a porta direta
  // da relação obrigatória sai igual (achado de 15/10: suíte 3,0 + banheiro 1,4 numa faixa de 4,2 m
  // espremia o banheiro em 1,20 m).
  const hospedeiro = new Map<ItemPlanejado, ItemPlanejado>();
  const aoLadoDe = new Map<ItemPlanejado, ItemPlanejado>();
  const hospedados = new Set<ItemPlanejado>();
  for (const t of fundo) {
    if (!ehMolhado(t.item)) continue;
    const h = fundo.find((y) => !ehMolhado(y.item) && !hospedados.has(y) && obrigatoria(t, y));
    if (!h) continue;
    hospedados.add(h);
    if (eixoMinMm(h.item, hip) + eixoMinMm(t.item, hip) <= Dfundo) hospedeiro.set(t, h);
    else aoLadoDe.set(t, h);
  }
  const naOrdem: ItemPlanejado[] = [];
  for (const t of fundo) {
    if (hospedeiro.has(t) || aoLadoDe.has(t)) continue;
    naOrdem.push(t);
    for (const [m, h] of aoLadoDe) if (h === t) naOrdem.push(m);
  }
  let colunas = naOrdem.map((t) => ({ frente: t, atras: fundo.filter((x) => hospedeiro.get(x) === t) }));
  const minDaColuna = (c: { frente: ItemPlanejado; atras: ItemPlanejado[] }) => Math.max(eixoMinMm(c.frente.item, hip), ...c.atras.map((x) => eixoMinMm(x.item, hip)));
  const transbordo: ItemPlanejado[] = [];
  // Não cabe: o molhado sem par sai primeiro (o último da ordem), um de cada vez.
  while (colunas.reduce((s, c) => s + minDaColuna(c), 0) > W) {
    const i = [...colunas.keys()].reverse().find((k) => ehMolhado(colunas[k].frente.item) && colunas[k].atras.length === 0 && !aoLadoDe.has(colunas[k].frente));
    if (i === undefined) break;
    transbordo.push(colunas[i].frente);
    colunas = colunas.filter((_, k) => k !== i);
  }
  const mins = colunas.map(minDaColuna);
  const areas = colunas.map((c) => c.frente.areaAlvoMm2 + c.atras.reduce((s, x) => s + x.areaAlvoMm2, 0));
  const somaMin = mins.reduce((s, v) => s + v, 0);
  const somaArea = areas.reduce((s, v) => s + v, 0) || 1;
  const sobra = W - somaMin;
  const caixas = new Map<ItemPlanejado, CaixaCanonica>();
  let x = 0;
  colunas.forEach((c, k) => {
    const w = k === colunas.length - 1 ? W - x : sobra >= 0 ? mins[k] + (sobra * areas[k]) / somaArea : (mins[k] * W) / (somaMin || 1);
    // Os empilhados atrás: profundidade pela área, nunca menor que o mínimo deles, e deixando o mínimo do da frente.
    const minFrente = eixoMinMm(c.frente.item, hip);
    let resto = Dfundo;
    const fundos: { t: ItemPlanejado; d: number }[] = [];
    for (const a of [...c.atras].reverse()) {
      const d = Math.min(Math.max(eixoMinMm(a.item, hip), a.areaAlvoMm2 / Math.max(1, w)), resto - minFrente);
      if (d <= 0) continue;
      fundos.push({ t: a, d });
      resto -= d;
    }
    caixas.set(c.frente, { x0: x, y0, x1: x + w, y1: y0 + resto });
    let y = y0 + resto;
    for (const f of fundos.reverse()) {
      caixas.set(f.t, { x0: x, y0: y, x1: x + w, y1: y + f.d });
      y += f.d;
    }
    // Um empilhado que não coube (d ≤ 0) volta a ser coluna? Não: fica sem caixa e o chamador o põe no transbordo.
    for (const a of c.atras) if (!caixas.has(a)) transbordo.push(a);
    x += w;
  });
  return { caixas, transbordo };
}

/** A vaga comum (2,50 × 5,00 m — `DIMENSAO_DA_VAGA.COMUM` do kernel). */
const LARGURA_DA_VAGA_MM = 2500;
const COMPRIMENTO_DA_VAGA_MM = 5000;
/** Largura mínima que sobra ao lado da garagem para o resto da frente; abaixo disso, a garagem volta ao treemap. */
const RESTO_MINIMO_AO_LADO_DA_GARAGEM_MM = 3000;
/** Com pelo menos isto ao lado, as vagas ficam LADO A LADO; abaixo, EM FILA (lote estreito). */
const RESTO_CONFORTAVEL_AO_LADO_DA_GARAGEM_MM = 5000;
/** Fundo mínimo atrás da garagem para virar a linha de trás da frente (sala, cozinha, serviço). */
const LINHA_MINIMA_ATRAS_DA_GARAGEM_MM = 3000;

function caixasDoPlano(plano: Plano, W: number, D: number, corredorMm: number, programa: Programa, hip: HipotesesDoGerador): Map<ItemPlanejado, CaixaCanonica> {
  const areaFrente = plano.frente.reduce((s, i) => s + i.areaAlvoMm2, 0);
  const areaFundo = plano.fundo.reduce((s, i) => s + i.areaAlvoMm2, 0);
  const dCorredor = plano.corredor ? corredorMm : 0;
  const disponivel = D - dCorredor;
  let dFrente = plano.fundo.length === 0 ? disponivel : plano.frente.length === 0 ? 0 : (disponivel * areaFrente) / (areaFrente + areaFundo || 1);
  const out = new Map<ItemPlanejado, CaixaCanonica>();
  // F6 (casa automática, 15/10/2026) — A GARAGEM NUM CANTO DA FRENTE. No treemap, o mínimo garante a largura de cada
  // item na linha, não a PROFUNDIDADE da linha — e a vaga pede 5 m de fundo (sonda: garagem "de 2 vagas" de
  // 7,30 × 4,05 m; a de 1 vaga, 5,05 × 2,60 m e sem fachada). Retângulo próprio, encostado na rua e num lado
  // (acesso de carro e ventilação), na profundidade TODA da faixa da frente (sem buraco atrás). As vagas:
  //  - LADO A LADO quando sobram ≥ 5 m ao lado;
  //  - EM FILA (largura de uma vaga, fundo de n) no lote estreito — lado a lado, a casa de 9 m ficava com
  //    3,2 m para sala, cozinha e serviço (3 regras violadas na melhor semente);
  //  - nenhuma cabe → a garagem volta ao treemap, como antes.
  // As vagas saem da área do item (`areaPorVagaM2` — a do programa da casa).
  const garagem = plano.frente.find((t) => t.item.uso === 'GARAGEM') ?? null;
  let caixaDaGaragem: CaixaCanonica | null = null;
  if (garagem && plano.frente.length > 1) {
    const e = hip.espessuraExternaMm;
    const n = Math.max(1, Math.round(garagem.areaAlvoMm2 / (hip.areaPorVagaM2 * 1e6)));
    const fundoMinimo = plano.fundo.length ? 3000 : 0;
    const opcoes = [
      { gw: n * LARGURA_DA_VAGA_MM + e, gd: COMPRIMENTO_DA_VAGA_MM + e },
      { gw: LARGURA_DA_VAGA_MM + e, gd: n * COMPRIMENTO_DA_VAGA_MM + e },
    ]
      .map((o) => ({ ...o, d: Math.min(Math.max(dFrente, o.gd), disponivel - fundoMinimo) }))
      .filter((o) => o.d >= o.gd && W - o.gw >= RESTO_MINIMO_AO_LADO_DA_GARAGEM_MM);
    const escolhida = opcoes.find((o) => W - o.gw >= RESTO_CONFORTAVEL_AO_LADO_DA_GARAGEM_MM) ?? [...opcoes].sort((a, b) => a.gw - b.gw)[0];
    if (escolhida) {
      dFrente = escolhida.d;
      caixaDaGaragem = { x0: 0, y0: 0, x1: escolhida.gw, y1: escolhida.d };
      // Sobrando fundo atrás da garagem para uma LINHA de cômodos, a frente vira duas linhas: na rua, a garagem
      // (só o fundo das vagas) e o que couber ao lado; atrás, o resto na LARGURA TODA da casa — com as duas
      // fachadas laterais. A garagem na profundidade toda deixava o resto da frente com uma fachada só e, no lote
      // de 12 m, a cozinha sem parede externa (sem janela).
      if (escolhida.d - escolhida.gd >= LINHA_MINIMA_ATRAS_DA_GARAGEM_MM) caixaDaGaragem.y1 = escolhida.gd;
    }
  }
  const fundo = plano.fundo.length ? colunasDoFundo(plano.fundo, W, disponivel - dFrente, dFrente + dCorredor, programa, hip) : { caixas: new Map<ItemPlanejado, CaixaCanonica>(), transbordo: [] };
  // O transbordo entra no FIM da frente: a última linha do treemap é a que encosta no corredor.
  const daFrente = [...plano.frente.filter((t) => !(caixaDaGaragem && t === garagem)), ...fundo.transbordo];
  if (caixaDaGaragem && garagem) {
    out.set(garagem, caixaDaGaragem);
    const x0 = caixaDaGaragem.x1;
    if (caixaDaGaragem.y1 < dFrente - 1) {
      // Duas linhas. Ao lado da garagem, na rua: os pequenos sociais primeiro (varanda, lavabo — a entrada), depois
      // o que mais couber INTEIRO; o resto vai à linha de trás, na largura toda.
      const areaAoLado = (W - x0) * caixaDaGaragem.y1;
      const preferencia = (t: ItemPlanejado) => (t.item.uso === 'VARANDA' ? 0 : t.item.uso === 'LAVABO' ? 1 : t.zona === 'SOCIAL' && t.item.uso !== 'SALA' ? 2 : 3);
      const aoLado: ItemPlanejado[] = [];
      let soma = 0;
      for (const t of [...daFrente].sort((a, b) => preferencia(a) - preferencia(b) || a.areaAlvoMm2 - b.areaAlvoMm2)) {
        if (t.item.uso === 'SALA' || soma + t.areaAlvoMm2 > areaAoLado) continue;
        aoLado.push(t);
        soma += t.areaAlvoMm2;
      }
      const atras = daFrente.filter((t) => !aoLado.includes(t));
      // F22 da casa automática (17/10/2026): a VARANDA (a entrada) é uma COLUNA na profundidade toda da linha da rua, junto
      // da garagem — encosta na rua e na linha de trás, onde está a sala. No treemap ela ficava na 1ª linha e o serviço na 2ª,
      // atrás dela: a varanda não tocava a sala (relação obrigatória sem porta direta em 4 das 8 casas).
      const varanda = aoLado.find((t) => t.item.uso === 'VARANDA') ?? null;
      let xAoLado = x0;
      if (varanda && aoLado.length > 1) {
        const wv = Math.max(eixoMinMm(varanda.item, hip), Math.ceil(varanda.areaAlvoMm2 / caixaDaGaragem.y1 / hip.malhaMm) * hip.malhaMm);
        if (W - x0 - wv >= Math.max(...aoLado.filter((t) => t !== varanda).map((t) => eixoMinMm(t.item, hip)))) {
          out.set(varanda, { x0, y0: 0, x1: x0 + wv, y1: caixaDaGaragem.y1 });
          aoLado.splice(aoLado.indexOf(varanda), 1);
          xAoLado = x0 + wv;
        }
      }
      if (aoLado.length) for (const [k, v] of treemapEmFaixas(aoLado, W - xAoLado, caixaDaGaragem.y1, 0, false, hip)) out.set(k, { x0: v.x0 + xAoLado, y0: v.y0, x1: v.x1 + xAoLado, y1: v.y1 });
      else caixaDaGaragem.x1 = W; // nada coube ao lado: a garagem fica com a linha da rua inteira
      if (atras.length) for (const [k, v] of fatiar(atras, W, dFrente - caixaDaGaragem.y1, caixaDaGaragem.y1, !!plano.frenteEmColunas, hip)) out.set(k, v);
      else caixaDaGaragem.y1 = dFrente;
    } else {
      // O resto da frente ao lado da garagem, na mesma profundidade da faixa.
      for (const [k, v] of fatiar(daFrente, W - x0, dFrente, 0, !!plano.frenteEmColunas, hip)) out.set(k, { x0: v.x0 + x0, y0: v.y0, x1: v.x1 + x0, y1: v.y1 });
    }
  } else if (daFrente.length) for (const [k, v] of fatiar(daFrente, W, dFrente, 0, !!plano.frenteEmColunas, hip)) out.set(k, v);
  if (plano.corredor) out.set(plano.corredor, { x0: 0, y0: dFrente, x1: W, y1: dFrente + dCorredor });
  for (const [k, v] of fundo.caixas) out.set(k, v);
  return out;
}

// ─── Função objetivo (proxy do score) ────────────────────────────────────────

function adjacentes(a: CaixaCanonica, b: CaixaCanonica): boolean {
  const tocaX = Math.abs(a.x1 - b.x0) < 1 || Math.abs(b.x1 - a.x0) < 1;
  const tocaY = Math.abs(a.y1 - b.y0) < 1 || Math.abs(b.y1 - a.y0) < 1;
  const sobreX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 300;
  const sobreY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 300;
  return (tocaX && sobreY) || (tocaY && sobreX);
}

function ladosExternosDe(c: CaixaCanonica, W: number, D: number): ('FRENTE' | 'FUNDO' | 'ESQ' | 'DIR')[] {
  const out: ('FRENTE' | 'FUNDO' | 'ESQ' | 'DIR')[] = [];
  if (c.y0 < 1) out.push('FRENTE');
  if (c.y1 > D - 1) out.push('FUNDO');
  if (c.x0 < 1) out.push('ESQ');
  if (c.x1 > W - 1) out.push('DIR');
  return out;
}

/** Azimute da normal externa de cada lado canônico, dado o lado da frente e o norte do desenho. */
function azimuteDoLado(lado: 'FRENTE' | 'FUNDO' | 'ESQ' | 'DIR', frente: LadoDaFrente, rotacaoNorteDeg: number | null): number {
  const azFrente: Record<LadoDaFrente, number> = { N: 0, L: 90, S: 180, O: 270 };
  const base = (azFrente[frente] - (rotacaoNorteDeg ?? 0) + 360) % 360; // azimute da normal da frente
  // Canônico: olhando da frente para o fundo, ESQ está à esquerda (−90° no sentido horário do azimute do fundo).
  const azFundo = (base + 180) % 360;
  if (lado === 'FRENTE') return base;
  if (lado === 'FUNDO') return azFundo;
  if (lado === 'DIR') return (azFundo + 90) % 360; // à direita de quem entra = à esquerda de quem olha da rua… convenção estável
  return (azFundo + 270) % 360;
}

function objetivo(plano: Plano, caixas: Map<ItemPlanejado, CaixaCanonica>, W: number, D: number, programa: Programa, frente: LadoDaFrente, rotacaoNorteDeg: number | null, hip: HipotesesDoGerador): number {
  let J = 0;
  const todos = [...plano.frente, ...(plano.corredor ? [plano.corredor] : []), ...plano.fundo];
  const porItemId = new Map<string, ItemPlanejado[]>();
  for (const t of todos) porItemId.set(t.item.id, [...(porItemId.get(t.item.id) ?? []), t]);
  for (const t of todos) {
    const c = caixas.get(t)!;
    const w = c.x1 - c.x0;
    const h = c.y1 - c.y0;
    const menor = Math.min(w, h);
    if (t.zona !== 'CIRCULACAO') {
      // F3b: o mínimo no EIXO (livre da ficha ou do tipo NBR + parede), o mesmo das colunas do fundo.
      const minimo = eixoMinMm(t.item, hip);
      if (menor < minimo) J += (10 * (minimo - menor)) / minimo;
      const prop = Math.max(w, h) / Math.max(1, menor);
      if (prop > 2.2) J += 2 * (prop - 2.2);
    }
    const lados = ladosExternosDe(c, W, D);
    if (t.item.exigeFachada && lados.length === 0) J += 8;
    // F6b: sem lado externo, quem exige ILUMINAÇÃO (dormitório, cozinha) fica sem janela — exigência de código de
    // obras. Pesava 6, menos que a PREFERÊNCIA de a sala dar para a rua (12): o recozimento preferia uma cozinha
    // sem janela a tirar a sala da frente. Agora pesa mais.
    if (t.item.exigeIluminacao && lados.length === 0) J += 15;
    // F6 (15/10/2026): quem só exige VENTILAÇÃO (serviço, lavabo, banheiro, garagem) não pesava nada sem lado
    // externo — com a garagem num canto da fachada, o serviço e o lavabo iam para o miolo e o aquecedor e a
    // caixa de gordura ficavam sem parede externa.
    if (t.item.exigeVentilacao && !t.item.exigeIluminacao && !t.item.exigeFachada && lados.length === 0) J += 5;
    if (t.item.exigeIluminacao && lados.length > 0) {
      // Sol: quanto mais ao norte (hemisfério sul) a melhor fachada, menor a penalidade (0 a 2).
      const melhor = Math.min(...lados.map((l) => Math.min(azimuteDoLado(l, frente, rotacaoNorteDeg), 360 - azimuteDoLado(l, frente, rotacaoNorteDeg))));
      J += (2 * melhor) / 180;
    }
    // Privacidade: íntimo na frente (rua) pesa um pouco.
    if (t.zona === 'INTIMO' && lados.includes('FRENTE')) J += 1.5;
    // Zona por fluxo: a sala (social) quer a frente; o serviço não.
    if (t.zona === 'SOCIAL' && !lados.includes('FRENTE')) J += t.item.uso === 'SALA' ? 12 : 2;
    if (t.zona === 'SERVICO' && lados.includes('FRENTE')) J += 1;
  }
  const relacoes: RelacaoDoPrograma[] = programa.relacoes;
  for (const r of relacoes) {
    const as = porItemId.get(r.a) ?? [];
    const bs = porItemId.get(r.b) ?? [];
    if (!as.length || !bs.length) continue;
    let melhorAdj = false;
    let melhorDist = Infinity;
    for (const a of as)
      for (const b of bs) {
        const ca = caixas.get(a)!;
        const cb = caixas.get(b)!;
        if (adjacentes(ca, cb)) melhorAdj = true;
        const d = Math.hypot((ca.x0 + ca.x1 - cb.x0 - cb.x1) / 2, (ca.y0 + ca.y1 - cb.y0 - cb.y1) / 2);
        melhorDist = Math.min(melhorDist, d);
      }
    if (r.tipo === 'OBRIGATORIA' && !melhorAdj) J += 10;
    else if (r.tipo === 'PROIBIDA' && melhorAdj) J += 10;
    else if (r.tipo === 'DESEJAVEL' && !melhorAdj) J += (r.peso / 10) * Math.min(1, melhorDist / Math.hypot(W, D)) * 4;
  }
  return Math.round(J * 100) / 100;
}

// ─── Geração ─────────────────────────────────────────────────────────────────

function itensPlanejados(programa: Programa, hip: HipotesesDoGerador): { frente: ItemPlanejado[]; fundo: ItemPlanejado[]; corredor: ItemPlanejado | null } {
  const frente: ItemPlanejado[] = [];
  const fundo: ItemPlanejado[] = [];
  let corredor: ItemPlanejado | null = null;
  for (const item of programa.itens) {
    for (let k = 0; k < item.quantidade; k++) {
      const nome = item.quantidade > 1 ? `${item.nome} ${k + 1}` : item.nome;
      // F3b: nunca abaixo do que o tipo NBR exige de área útil (no eixo, com a largura livre mínima).
      const areaAlvoMm2 = Math.max(item.areaIdealM2 * 1e6, item.areaMinM2 * 1e6, item.uso === 'CIRCULACAO' ? 0 : areaEixoMinMm2(item, hip));
      if (item.uso === 'CIRCULACAO') {
        if (!corredor) corredor = { item, nome: item.nome, zona: 'CIRCULACAO', areaAlvoMm2 };
        continue;
      }
      const zona: AmbienteGerado['zona'] = item.privacidade === 'INTIMO' ? 'INTIMO' : item.privacidade === 'SERVICO' ? 'SERVICO' : 'SOCIAL';
      (zona === 'INTIMO' ? fundo : frente).push({ item, nome, zona, areaAlvoMm2 });
    }
  }
  // Frente: social antes de serviço (a sala na rua, a cozinha encostada nela).
  frente.sort((a, b) => (a.zona === b.zona ? 0 : a.zona === 'SOCIAL' ? -1 : 1));
  return { frente, fundo, corredor };
}

function recozer(plano: Plano, W: number, D: number, programa: Programa, frente: LadoDaFrente, rotacaoNorteDeg: number | null, corredorMm: number, iteracoes: number, rnd: () => number, hip: HipotesesDoGerador): { plano: Plano; inicial: number; final: number } {
  let atual: Plano = { frente: [...plano.frente], fundo: [...plano.fundo], corredor: plano.corredor, frenteEmColunas: plano.frenteEmColunas };
  let J = objetivo(atual, caixasDoPlano(atual, W, D, corredorMm, programa, hip), W, D, programa, frente, rotacaoNorteDeg, hip);
  const inicial = J;
  let melhor = atual;
  let melhorJ = J;
  const T0 = Math.max(1, J) / 2;
  for (let it = 0; it < iteracoes; it++) {
    const T = T0 * (1 - it / iteracoes) + 0.01;
    const cand: Plano = { frente: [...atual.frente], fundo: [...atual.fundo], corredor: atual.corredor, frenteEmColunas: atual.frenteEmColunas };
    const tipo = rnd();
    if (tipo < 0.08) {
      // F6b: linhas ⇄ colunas na frente.
      cand.frenteEmColunas = !cand.frenteEmColunas;
    } else if (tipo < 0.45 && cand.frente.length > 1) {
      const i = Math.floor(rnd() * cand.frente.length);
      const j = Math.floor(rnd() * cand.frente.length);
      [cand.frente[i], cand.frente[j]] = [cand.frente[j], cand.frente[i]];
    } else if (tipo < 0.9 && cand.fundo.length > 1) {
      const i = Math.floor(rnd() * cand.fundo.length);
      const j = Math.floor(rnd() * cand.fundo.length);
      [cand.fundo[i], cand.fundo[j]] = [cand.fundo[j], cand.fundo[i]];
    } else if (cand.frente.length > 1 && cand.fundo.length > 0) {
      // Um serviço pode ir para o fundo (área de serviço atrás) e voltar.
      const i = cand.frente.findIndex((x) => x.zona === 'SERVICO');
      if (i >= 0 && rnd() < 0.5) cand.fundo.push(...cand.frente.splice(i, 1));
      else {
        const k = cand.fundo.findIndex((x) => x.zona === 'SERVICO');
        if (k >= 0) cand.frente.push(...cand.fundo.splice(k, 1));
        else continue;
      }
    } else continue;
    const Jc = objetivo(cand, caixasDoPlano(cand, W, D, corredorMm, programa, hip), W, D, programa, frente, rotacaoNorteDeg, hip);
    if (Jc <= J || rnd() < Math.exp((J - Jc) / T)) {
      atual = cand;
      J = Jc;
      if (J < melhorJ) {
        melhor = cand;
        melhorJ = J;
      }
    }
  }
  return { plano: melhor, inicial, final: melhorJ };
}

/** Une segmentos colineares (horizontais/verticais) sobrepostos ou encostados. */
function unirSegmentos(segs: { a: Point; b: Point }[]): { a: Point; b: Point }[] {
  const porLinha = new Map<string, { ini: number; fim: number }[]>();
  for (const s of segs) {
    const vertical = Math.abs(s.a.x - s.b.x) < 1;
    const chave = vertical ? `v:${s.a.x}` : `h:${s.a.y}`;
    const ini = vertical ? Math.min(s.a.y, s.b.y) : Math.min(s.a.x, s.b.x);
    const fim = vertical ? Math.max(s.a.y, s.b.y) : Math.max(s.a.x, s.b.x);
    porLinha.set(chave, [...(porLinha.get(chave) ?? []), { ini, fim }]);
  }
  const out: { a: Point; b: Point }[] = [];
  for (const [chave, lista] of [...porLinha.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lista.sort((p, q) => p.ini - q.ini);
    const fundidos: { ini: number; fim: number }[] = [];
    for (const l of lista) {
      const ult = fundidos[fundidos.length - 1];
      if (ult && l.ini <= ult.fim + 1) ult.fim = Math.max(ult.fim, l.fim);
      else fundidos.push({ ...l });
    }
    const [tipo, coord] = chave.split(':');
    const c = Number(coord);
    for (const f of fundidos) {
      if (f.fim - f.ini < 1) continue;
      out.push(tipo === 'v' ? { a: point(c, f.ini), b: point(c, f.fim) } : { a: point(f.ini, c), b: point(f.fim, c) });
    }
  }
  return out;
}

/** A parede do modelo que contém o segmento (colinear e dentro). */
function paredeDoSegmento(paredes: readonly Wall[], a: Point, b: Point): Wall | null {
  for (const w of paredes) {
    const vertical = Math.abs(w.a.x - w.b.x) < 1;
    if (vertical) {
      if (Math.abs(a.x - w.a.x) > 1 || Math.abs(b.x - w.a.x) > 1) continue;
      const lo = Math.min(w.a.y, w.b.y) - 1;
      const hi = Math.max(w.a.y, w.b.y) + 1;
      if (a.y >= lo && a.y <= hi && b.y >= lo && b.y <= hi) return w;
    } else {
      if (Math.abs(a.y - w.a.y) > 1 || Math.abs(b.y - w.a.y) > 1) continue;
      const lo = Math.min(w.a.x, w.b.x) - 1;
      const hi = Math.max(w.a.x, w.b.x) + 1;
      if (a.x >= lo && a.x <= hi && b.x >= lo && b.x <= hi) return w;
    }
  }
  return null;
}

function offsetNaParede(w: Wall, p: Point): number {
  return Math.hypot(p.x - w.a.x, p.y - w.a.y);
}

export function gerar(entrada: EntradaDoGerador, semente: number, hipParcial: Partial<HipotesesDoGerador> = {}): ResultadoDoGerador {
  const hip: HipotesesDoGerador = {
    ...HIPOTESES_DO_GERADOR_PADRAO,
    ...hipParcial,
    janela: { ...HIPOTESES_DO_GERADOR_PADRAO.janela, ...(hipParcial.janela ?? {}) },
    minimosPorTipo: { ...HIPOTESES_DO_GERADOR_PADRAO.minimosPorTipo, ...(hipParcial.minimosPorTipo ?? {}) },
    iluminacaoMinima: { ...HIPOTESES_DO_GERADOR_PADRAO.iluminacaoMinima, ...(hipParcial.iluminacaoMinima ?? {}) },
  };
  const decisoes: string[] = [];
  const avisos: string[] = [];
  const rnd = prng(semente);
  const { programa } = entrada;

  // Retângulo de trabalho — e, desde a F11 (12/10/2026), o CONTORNO: um contorno ORTOGONAL
  // (L, U, T…) é decomposto em retângulos; o maior é o principal (zonas, corredor, recozimento)
  // e os outros são ANEXOS que recebem ambientes — antes, o "maior inscrito" jogava fora a ala.
  // Contorno oblíquo segue no maior inscrito, com o percentual que ficou de fora dito.
  let ret: Retangulo;
  let anexos: Retangulo[] = [];
  let contorno: Point[];
  if (entrada.envelope && entrada.envelope.length >= 3) {
    const naMalha = entrada.envelope
      .map((p) => point(snap(p.x, hip.malhaMm), snap(p.y, hip.malhaMm)))
      .filter((p, i, xs) => i === 0 || p.x !== xs[i - 1].x || p.y !== xs[i - 1].y);
    const pecas = retangulosDoContorno(naMalha);
    const areaDoEnvelope = Math.abs(polygonArea(entrada.envelope));
    if (pecas.length > 0) {
      ret = pecas[0];
      anexos = pecas.slice(1);
      contorno = naMalha;
      decisoes.push(
        `Contorno ortogonal de ${f2(areaDoEnvelope / 1e6)} m² em ${pecas.length} retângulo(s): o principal de ${f2((ret.x1 - ret.x0) / 1000)} × ${f2((ret.y1 - ret.y0) / 1000)} m (zonas e corredor)` +
          (anexos.length ? ` e ${anexos.length} anexo(s) — ${anexos.map((a) => `${f2((a.x1 - a.x0) / 1000)} × ${f2((a.y1 - a.y0) / 1000)} m`).join(', ')}` : '') +
          ` — ${f2((pecas.reduce((s, r) => s + areaDoRetangulo(r), 0) / (areaDoEnvelope || 1)) * 100)} % da área do contorno.`,
      );
    } else {
      const r = maiorRetanguloInscrito(entrada.envelope);
      if (!r) throw new Error('gerador: o envelope não contém um retângulo de eixos alinhados');
      ret = { x0: snap(r.x0, hip.malhaMm), y0: snap(r.y0, hip.malhaMm), x1: snap(r.x1, hip.malhaMm), y1: snap(r.y1, hip.malhaMm) };
      contorno = anelDoRetangulo(ret);
      const usado = areaDoRetangulo(ret) / (areaDoEnvelope || 1);
      decisoes.push(`Retângulo de trabalho ${f2((r.x1 - r.x0) / 1000)} × ${f2((r.y1 - r.y0) / 1000)} m — o maior de eixos alinhados dentro do envelope (oblíquo): ${f2(usado * 100)} % da área.`);
      if (usado < 0.98) avisos.push(`O contorno não é ortogonal: ${f2((1 - usado) * 100)} % da área ficou fora do retângulo de trabalho.`);
    }
  } else {
    ret = { x0: 0, y0: 0, x1: hip.retanguloSemEnvelope.larguraMm, y1: hip.retanguloSemEnvelope.profundidadeMm };
    decisoes.push(`Sem envelope: retângulo declarado ${f2(ret.x1 / 1000)} × ${f2(ret.y1 / 1000)} m na origem.`);
    ret = { x0: snap(ret.x0, hip.malhaMm), y0: snap(ret.y0, hip.malhaMm), x1: snap(ret.x1, hip.malhaMm), y1: snap(ret.y1, hip.malhaMm) };
    contorno = anelDoRetangulo(ret);
  }
  const frente = ladoDaFrente(entrada.direcaoDaFrente);
  const nomeDaFrente: Record<LadoDaFrente, string> = { S: 'sul (−Y)', N: 'norte (+Y)', L: 'leste (+X)', O: 'oeste (−X)' };
  decisoes.push(`Frente do lote a ${nomeDaFrente[frente]}${entrada.direcaoDaFrente ? ' (pela divisa FRENTE)' : ' (suposição: sem divisa marcada)'}; norte do desenho ${entrada.rotacaoNorteDeg == null ? '= +Y' : `girado ${entrada.rotacaoNorteDeg}°`}.`);

  // Frame canônico.
  const aoLongo = frente === 'S' || frente === 'N';
  const W = aoLongo ? ret.x1 - ret.x0 : ret.y1 - ret.y0;
  const D = aoLongo ? ret.y1 - ret.y0 : ret.x1 - ret.x0;
  const mundo = (px: number, py: number): Point => {
    switch (frente) {
      case 'S':
        return point(ret.x0 + px, ret.y0 + py);
      case 'N':
        return point(ret.x0 + px, ret.y1 - py);
      case 'O':
        return point(ret.x0 + py, ret.y0 + px);
      case 'L':
        return point(ret.x1 - py, ret.y0 + px);
    }
  };

  // (a)+(b) zona e alocação.
  const base = itensPlanejados(programa, hip);
  if (base.frente.length + base.fundo.length === 0) throw new Error('gerador: o programa não tem ambientes (fora a circulação)');

  // F11 — OS ANEXOS: cada um recebe ambientes íntimos (depois, de serviço) até a sua parte da área,
  // em UMA linha ao longo do lado que encosta no principal — assim todo ambiente do anexo encosta
  // na casa e ganha porta pela busca em largura. A sala e o resto do social ficam no principal.
  const noAnexo: { ret: Retangulo; itens: ItemPlanejado[] }[] = [];
  if (anexos.length) {
    const areaDosItens = [...base.frente, ...base.fundo].reduce((s, i) => s + i.areaAlvoMm2, 0);
    const areaTotal = areaDoRetangulo(ret) + anexos.reduce((s, a) => s + areaDoRetangulo(a), 0);
    const fatorGlobal = areaTotal / (areaDosItens || 1);
    for (const ax of anexos) {
      const menorLado = Math.min(ax.x1 - ax.x0, ax.y1 - ax.y0);
      if (menorLado < 1500) {
        avisos.push(`Anexo de ${f2((ax.x1 - ax.x0) / 1000)} × ${f2((ax.y1 - ax.y0) / 1000)} m estreito demais para ambiente (< 1,50 m) — ficou sem uso.`);
        continue;
      }
      let capacidade = areaDoRetangulo(ax) / fatorGlobal;
      const escolhidos: ItemPlanejado[] = [];
      const candidatos = () => [...base.fundo, ...base.frente.filter((i) => i.zona === 'SERVICO')];
      for (;;) {
        const c = candidatos()
          .filter((i) => i.areaAlvoMm2 <= capacidade * 1.25)
          .sort((a, b) => b.areaAlvoMm2 - a.areaAlvoMm2)[0];
        if (!c) break;
        escolhidos.push(c);
        capacidade -= c.areaAlvoMm2;
        base.fundo = base.fundo.filter((x) => x !== c);
        base.frente = base.frente.filter((x) => x !== c);
      }
      if (!escolhidos.length) {
        const menor = candidatos().sort((a, b) => a.areaAlvoMm2 - b.areaAlvoMm2)[0];
        if (menor) {
          escolhidos.push(menor);
          base.fundo = base.fundo.filter((x) => x !== menor);
          base.frente = base.frente.filter((x) => x !== menor);
        }
      }
      if (escolhidos.length) noAnexo.push({ ret: ax, itens: escolhidos });
      else avisos.push(`Anexo de ${f2((ax.x1 - ax.x0) / 1000)} × ${f2((ax.y1 - ax.y0) / 1000)} m sem ambiente íntimo ou de serviço para receber — ficou sem uso.`);
    }
    if (noAnexo.length) decisoes.push(`Anexos: ${noAnexo.map((n) => n.itens.map((i) => i.nome).join(', ')).join(' | ')} — em linha ao longo do lado que encosta na casa.`);
    // Sem íntimo no principal, o corredor não serve a ninguém: sai, e o anexo encosta direto na casa.
    if (base.fundo.length === 0 && base.corredor) {
      decisoes.push('Todo o íntimo foi para os anexos: o retângulo principal fica sem corredor.');
      base.corredor = null;
    }
  }
  const areaPedida = [...base.frente, ...base.fundo].reduce((s, i) => s + i.areaAlvoMm2, 0) + (base.corredor ? W * hip.larguraCorredorMm : 0);
  const areaDisponivel = W * D;
  const fator = areaDisponivel / (areaPedida || 1);
  decisoes.push(
    `Programa pede ${f2(areaPedida / 1e6)} m² (áreas ideais${base.corredor ? ` + corredor de ${f2(hip.larguraCorredorMm / 1000)} m` : ''}); o retângulo tem ${f2(areaDisponivel / 1e6)} m² — áreas ${fator >= 1 ? 'ampliadas' : 'reduzidas'} em ${f2(fator * 100)} % para preencher.`,
  );
  if (fator < 1) {
    const abaixoDoMinimo = [...base.frente, ...base.fundo].filter((i) => i.areaAlvoMm2 * fator < i.item.areaMinM2 * 1e6).map((i) => i.nome);
    if (abaixoDoMinimo.length) avisos.push(`Cabem abaixo da área mínima: ${abaixoDoMinimo.join(', ')} — o envelope é pequeno para o programa.`);
  }
  decisoes.push(`Zonas: ${base.frente.filter((i) => i.zona === 'SOCIAL').length} social + ${base.frente.filter((i) => i.zona === 'SERVICO').length} serviço à frente; ${base.corredor ? 'corredor; ' : ''}${base.fundo.length} íntimo(s) ao fundo.`);

  // (c) recozimento — cada semente parte de uma ordem própria (embaralha dentro de
  // cada zona, mantendo social antes de serviço), senão todas convergem ao mesmo vale.
  const embaralhar = <T,>(xs: T[]): T[] => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const inicialDoPlano: Plano = {
    frente: [...embaralhar(base.frente.filter((i) => i.zona === 'SOCIAL')), ...embaralhar(base.frente.filter((i) => i.zona === 'SERVICO'))],
    fundo: embaralhar(base.fundo),
    corredor: base.corredor,
    // F6b: as sementes pares partem da frente em colunas, as ímpares em linhas — as 8 tentadas exploram os dois.
    frenteEmColunas: semente % 2 === 0,
  };
  const { plano, inicial, final } = recozer(inicialDoPlano, W, D, programa, frente, entrada.rotacaoNorteDeg, hip.larguraCorredorMm, hip.iteracoes, rnd, hip);
  decisoes.push(`Recozimento simulado: ${hip.iteracoes} iterações com a semente ${semente}; função objetivo ${f2(inicial)} → ${f2(final)} (largura mínima, proporção, fachada e sol de quem exige, matriz de proximidade, privacidade).`);
  const caixas = caixasDoPlano(plano, W, D, hip.larguraCorredorMm, programa, hip);

  // Malha: arredonda as coordenadas cumulativas (mantém adjacência).
  const snapC = (c: CaixaCanonica): CaixaCanonica => ({ x0: snap(c.x0, hip.malhaMm), y0: snap(c.y0, hip.malhaMm), x1: snap(c.x1, hip.malhaMm), y1: snap(c.y1, hip.malhaMm) });
  const ambientes: AmbienteGerado[] = [];
  const todos = [...plano.frente, ...(plano.corredor ? [plano.corredor] : []), ...plano.fundo];
  for (const t of todos) {
    const c = snapC(caixas.get(t)!);
    const p1 = mundo(c.x0, c.y0);
    const p2 = mundo(c.x1, c.y1);
    const r: Retangulo = { x0: Math.min(p1.x, p2.x), y0: Math.min(p1.y, p2.y), x1: Math.max(p1.x, p2.x), y1: Math.max(p1.y, p2.y) };
    const lados = ladosExternosDe(c, W, D).map((l): LadoDaFrente => {
      const az = azimuteDoLado(l, frente, entrada.rotacaoNorteDeg);
      return az < 45 || az >= 315 ? 'N' : az < 135 ? 'L' : az < 225 ? 'S' : 'O';
    });
    ambientes.push({ item: t.item, nome: t.nome, zona: t.zona, ret: r, areaM2: Math.round(((r.x1 - r.x0) * (r.y1 - r.y0)) / 10_000) / 100, larguraMinM: Math.min(r.x1 - r.x0, r.y1 - r.y0) / 1000, ladosExternos: lados });
  }
  /** Os lados do retângulo que caem na borda do CONTORNO, com a normal externa (F11). */
  const ladosNaBorda = (r: Retangulo) =>
    [
      [point(r.x0, r.y0), point(r.x1, r.y0)],
      [point(r.x1, r.y0), point(r.x1, r.y1)],
      [point(r.x1, r.y1), point(r.x0, r.y1)],
      [point(r.x0, r.y1), point(r.x0, r.y0)],
    ].flatMap(([a, b]) => trechosNaBorda(a, b, contorno));
  // F11: os ANEXOS pelo MESMO treemap em faixas do principal, com a 1ª faixa encostada no lado comum
  // com a casa: quem está nela ganha porta para a casa; quem fica atrás, para o vizinho da faixa
  // (o banheiro da suíte atrás da suíte). "Uma linha só" esticava o ambiente (1,15 × 7 m num anexo fundo).
  for (const { ret: ax, itens } of noAnexo) {
    const comum = ladoComumDosRetangulos(ax, ret) ?? anexos.map((o) => (o === ax ? null : ladoComumDosRetangulos(ax, o))).find(Boolean) ?? null;
    const aoLongoDeX = comum ? comum.horizontal : ax.x1 - ax.x0 >= ax.y1 - ax.y0;
    // Onde está o lado comum: embaixo/em cima (aoLongoDeX) ou à esquerda/à direita.
    const noInicio = comum ? (aoLongoDeX ? Math.abs(comum.a.y - ax.y0) < 1 : Math.abs(comum.a.x - ax.x0) < 1) : true;
    const Wa = aoLongoDeX ? ax.x1 - ax.x0 : ax.y1 - ax.y0;
    const Da = aoLongoDeX ? ax.y1 - ax.y0 : ax.x1 - ax.x0;
    const doAnexo = (cx: number, cy: number): Point =>
      aoLongoDeX ? point(ax.x0 + cx, noInicio ? ax.y0 + cy : ax.y1 - cy) : point(noInicio ? ax.x0 + cy : ax.x1 - cy, ax.y0 + cx);
    const ordenados = [...itens].sort((p, q) => q.areaAlvoMm2 - p.areaAlvoMm2);
    for (const [it, c] of treemapEmFaixas(ordenados, Wa, Da, 0)) {
      const s = { x0: snap(c.x0, hip.malhaMm), y0: snap(c.y0, hip.malhaMm), x1: snap(c.x1, hip.malhaMm), y1: snap(c.y1, hip.malhaMm) };
      const p1 = doAnexo(s.x0, s.y0);
      const p2 = doAnexo(s.x1, s.y1);
      const r: Retangulo = { x0: Math.min(p1.x, p2.x), y0: Math.min(p1.y, p2.y), x1: Math.max(p1.x, p2.x), y1: Math.max(p1.y, p2.y) };
      ambientes.push({ item: it.item, nome: it.nome, zona: it.zona, ret: r, areaM2: Math.round(((r.x1 - r.x0) * (r.y1 - r.y0)) / 10_000) / 100, larguraMinM: Math.min(r.x1 - r.x0, r.y1 - r.y0) / 1000, ladosExternos: [] });
    }
  }
  // Com anexo, "lado externo" é o que cai na borda do CONTORNO — o lado do principal que encosta no
  // anexo não é fachada (no desenho: S/N/L/O pela normal externa da borda).
  if (anexos.length) for (const a of ambientes) a.ladosExternos = [...new Set(ladosNaBorda(a.ret).map((x) => x.lado as LadoDaFrente))];

  // F21 da casa automática (17/10/2026): bordas a menos de uma espessura de parede uma da outra viram UMA coordenada —
  // duas paredes que se encontram desalinhadas em 5 cm (uma de cada lado de uma terceira) sobrepõem as faces, e o kernel
  // fechava ali um "Ambiente N" de 5 cm² (sem nome, luz sem interruptor, laje < 0,5 m², luz no pilar).
  alinharBordas(ambientes, contorno, hip.espessuraInternaMm);

  // (d) paredes.
  let model = emptyModel();
  const comandos: Command[] = [];
  const aplicar = (cmds: Command[]) => {
    if (cmds.length === 0) return;
    model = applyBatch(model, cmds).model;
    comandos.push(...cmds);
  };
  aplicar([{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: hip.peDireitoMm }]);
  const levelId = model.levels[0].id;
  // F11: as externas são as ARESTAS DO CONTORNO (no retângulo, os 4 lados de sempre).
  const externas = contorno.map((p, i) => ({ a: p, b: contorno[(i + 1) % contorno.length] })).filter((s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > 1);
  const internas = unirSegmentos(
    ambientes.flatMap((a) => [
      { a: point(a.ret.x0, a.ret.y0), b: point(a.ret.x1, a.ret.y0) },
      { a: point(a.ret.x1, a.ret.y0), b: point(a.ret.x1, a.ret.y1) },
      { a: point(a.ret.x1, a.ret.y1), b: point(a.ret.x0, a.ret.y1) },
      { a: point(a.ret.x0, a.ret.y1), b: point(a.ret.x0, a.ret.y0) },
    ]),
  ).flatMap((s) => subtrairBorda(s.a, s.b, contorno)); // a borda já é parede externa (F11)
  const uidDaParede = (k: number) => uidDeterministico(`gerador:${semente}:parede:${k}`);
  aplicar(externas.map((s, k): Command => ({ type: 'AddWall', levelId, a: s.a, b: s.b, thicknessMm: hip.espessuraExternaMm, heightMm: hip.peDireitoMm, uid: uidDaParede(k) })));
  aplicar(internas.map((s, k): Command => ({ type: 'AddWall', levelId, a: s.a, b: s.b, thicknessMm: hip.espessuraInternaMm, heightMm: hip.peDireitoMm, uid: uidDaParede(externas.length + k) })));
  decisoes.push(`${externas.length} paredes externas de ${hip.espessuraExternaMm} mm e ${internas.length} internas de ${hip.espessuraInternaMm} mm, na malha de ${hip.malhaMm} mm.`);

  // Nomes.
  const centro = (r: Retangulo) => point((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
  const nomes: Command[] = [];
  for (const a of ambientes) {
    const s = model.spaces.find((x) => x.levelId === levelId && pointInPolygon(x.ring, centro(a.ret)));
    if (s) nomes.push({ type: 'NameSpace', spaceId: s.id, name: a.nome, uso: a.item.uso });
    else avisos.push(`${a.nome}: o arranjo não fechou o ambiente (retângulo ${f2((a.ret.x1 - a.ret.x0) / 1000)} × ${f2((a.ret.y1 - a.ret.y0) / 1000)} m).`);
  }
  aplicar(nomes);

  // Portas e janelas.
  const paredes = () => model.walls.filter((w) => w.levelId === levelId);
  const aberturas: Command[] = [];
  const corredor = ambientes.find((a) => a.zona === 'CIRCULACAO') ?? null;
  const sala = ambientes.find((a) => a.item.uso === 'SALA') ?? ambientes.find((a) => a.zona === 'SOCIAL') ?? null;
  const ladoComum = (a: Retangulo, b: Retangulo): { a: Point; b: Point } | null => {
    if (Math.abs(a.x1 - b.x0) < 1 || Math.abs(b.x1 - a.x0) < 1) {
      const x = Math.abs(a.x1 - b.x0) < 1 ? a.x1 : a.x0;
      const lo = Math.max(a.y0, b.y0);
      const hi = Math.min(a.y1, b.y1);
      if (hi - lo >= hip.larguraPortaMm + 300) return { a: point(x, lo), b: point(x, hi) };
    }
    if (Math.abs(a.y1 - b.y0) < 1 || Math.abs(b.y1 - a.y0) < 1) {
      const y = Math.abs(a.y1 - b.y0) < 1 ? a.y1 : a.y0;
      const lo = Math.max(a.x0, b.x0);
      const hi = Math.min(a.x1, b.x1);
      if (hi - lo >= hip.larguraPortaMm + 300) return { a: point(lo, y), b: point(hi, y) };
    }
    return null;
  };
  /** Intervalos já ocupados por vão em cada parede (offset inicial, final) — dois vãos não se sobrepõem. */
  const ocupados = new Map<ObjectId, { ini: number; fim: number }[]>();
  const FOLGA = 150;
  /** O offset livre mais perto do desejado dentro de [lo, hi] (offsets na parede), ou null. */
  const encaixar = (w: Wall, desejado: number, largura: number, lo: number, hi: number): number | null => {
    const lista = ocupados.get(w.id) ?? [];
    const cabe = (off: number) => off >= lo && off + largura <= hi && !lista.some((o) => off < o.fim + FOLGA && off + largura > o.ini - FOLGA);
    const alvo = snap(desejado, hip.malhaMm);
    if (cabe(alvo)) return alvo;
    for (let d = hip.malhaMm; d <= hi - lo; d += hip.malhaMm) {
      if (cabe(alvo - d)) return alvo - d;
      if (cabe(alvo + d)) return alvo + d;
    }
    return null;
  };
  const reservar = (w: Wall, off: number, largura: number) => ocupados.set(w.id, [...(ocupados.get(w.id) ?? []), { ini: off, fim: off + largura }]);
  /** F20: o meio de cada porta interna já lançada (para agrupar as portas de um cômodo numa ponta). */
  const meiosDasPortas: Point[] = [];
  const porta = (seg: { a: Point; b: Point }, largura: number, noCanto = false, junto: Retangulo[] | null = null): Command | null => {
    const w = paredeDoSegmento(paredes(), seg.a, seg.b);
    if (!w) return null;
    const lo = Math.min(offsetNaParede(w, seg.a), offsetNaParede(w, seg.b)) + FOLGA;
    const hi = Math.max(offsetNaParede(w, seg.a), offsetNaParede(w, seg.b)) - FOLGA;
    // F6b: a porta de ENTRADA vai para a ponta da fachada — no meio, partia a fachada da sala em dois trechos
    // curtos e a janela (1/6 do piso) não cabia em nenhum (sala de 33 m² com 2 m² de janela).
    // F20 da casa automática (17/10/2026): a porta INTERNA também vai para uma ponta (a `FOLGA` do canto), a mais perto
    // das outras portas dos cômodos dela — no meio, as duas portas da suíte (entrada e banheiro) e a janela partiam três
    // lados ao meio, e o armário só cabia com 0,90 m.
    const naBorda = (r: Retangulo, q: Point) => q.x >= r.x0 - 1 && q.x <= r.x1 + 1 && q.y >= r.y0 - 1 && q.y <= r.y1 + 1 && (Math.abs(q.x - r.x0) < 1 || Math.abs(q.x - r.x1) < 1 || Math.abs(q.y - r.y0) < 1 || Math.abs(q.y - r.y1) < 1);
    const vizinhas = meiosDasPortas.filter((q) => (junto ?? []).some((r) => naBorda(r, q)));
    const pontoDoOffset = (off: number) => point(w.a.x + ((w.b.x - w.a.x) * off) / (wallLength(w) || 1), w.a.y + ((w.b.y - w.a.y) * off) / (wallLength(w) || 1));
    const distAsVizinhas = (off: number) => Math.min(...vizinhas.map((q) => Math.hypot(q.x - pontoDoOffset(off + largura / 2).x, q.y - pontoDoOffset(off + largura / 2).y)));
    const meio = point((seg.a.x + seg.b.x) / 2, (seg.a.y + seg.b.y) / 2);
    // `junto` ausente = a porta no meio (a do banheiro: na ponta, o giro dela tomava o lado do lavatório).
    const ponta = noCanto || (junto && (!vizinhas.length || distAsVizinhas(lo) <= distAsVizinhas(hi - largura))) ? lo : junto ? hi - largura : offsetNaParede(w, meio) - largura / 2;
    const off = encaixar(w, ponta, largura, lo, hi);
    if (off === null) return null;
    reservar(w, off, largura);
    meiosDasPortas.push(pontoDoOffset(off + largura / 2));
    return { type: 'AddOpening', wallId: w.id, wallUid: w.uid, kind: 'door', offsetMm: off, widthMm: largura, heightMm: hip.alturaPortaMm, sillMm: 0 };
  };
  // PORTAS por busca em largura a partir do HUB (corredor; senão a sala): cada
  // ambiente ganha porta para o vizinho pelo qual foi alcançado — assim todos
  // se ligam ao hub (a sala atrás da cozinha abre para a cozinha, não fica
  // ilhada). Preferência de pai: corredor > sala > mesma zona > outros.
  const portasFeitas = new Set<string>();
  const abrirPorta = (a: AmbienteGerado, b: AmbienteGerado): boolean => {
    const chave = [a.nome, b.nome].sort().join('|');
    if (portasFeitas.has(chave)) return true;
    const seg = ladoComum(a.ret, b.ret);
    if (!seg) return false;
    // As portas dos cômodos (não as do corredor e da sala, que têm muitas) se agrupam numa ponta.
    const cmd = porta(seg, hip.larguraPortaMm, false, ehMolhado(a.item) || ehMolhado(b.item) ? null : [a, b].filter((x) => x !== corredor && x !== sala).map((x) => x.ret));
    if (!cmd) return false;
    aberturas.push(cmd);
    portasFeitas.add(chave);
    return true;
  };
  const hub = corredor ?? sala ?? ambientes[0];
  const alcancados = new Set<AmbienteGerado>([hub]);
  const fila: AmbienteGerado[] = [hub];
  const prioridade = (x: AmbienteGerado, de: AmbienteGerado) => (x === corredor ? 0 : x === sala ? 1 : x.zona === de.zona ? 2 : 3);
  // F20 da casa automática (17/10/2026): o banheiro e o lavabo são FOLHAS — uma porta, nunca passagem; o banheiro com
  // relação OBRIGATÓRIA com um vizinho (o da suíte) só abre para ele. Alcançado pelo vizinho na busca, o banheiro da
  // suíte abria para o dormitório ao lado (e a relação dava a segunda porta, para a suíte); o banheiro social, alcançado
  // pela sala, abria para a varanda de entrada — e as duas portas tomavam os lados do vaso e do lavatório.
  const parDoMolhado = (m: AmbienteGerado): AmbienteGerado | null =>
    ehMolhado(m.item)
      ? (ambientes.find(
          (x) => x !== m && !ehMolhado(x.item) && programa.relacoes.some((r) => r.tipo === 'OBRIGATORIA' && ((r.a === m.item.id && r.b === x.item.id) || (r.b === m.item.id && r.a === x.item.id))) && !!ladoComum(m.ret, x.ret),
        ) ?? null)
      : null;
  while (fila.length) {
    const atual = fila.shift()!;
    const vizinhos = ambientes.filter((x) => !alcancados.has(x) && ladoComum(atual.ret, x.ret)).sort((p, q) => prioridade(p, atual) - prioridade(q, atual) || p.nome.localeCompare(q.nome, 'pt-BR'));
    for (const v of vizinhos) {
      if (alcancados.has(v)) continue;
      const par = parDoMolhado(v);
      if (par && par !== atual) continue;
      if (abrirPorta(v, atual)) {
        alcancados.add(v);
        if (!ehMolhado(v.item)) fila.push(v);
      }
    }
  }
  // F20: sobrou cômodo que só se alcança ATRAVÉS de um molhado (o desenho não deu outro lado comum) — a passagem pelo
  // banheiro, dita, é melhor que o cômodo sem acesso.
  if (ambientes.some((a) => !alcancados.has(a))) {
    const fila2 = [...alcancados];
    while (fila2.length) {
      const atual = fila2.shift()!;
      for (const v of ambientes.filter((x) => !alcancados.has(x) && ladoComum(atual.ret, x.ret)).sort((p, q) => prioridade(p, atual) - prioridade(q, atual) || p.nome.localeCompare(q.nome, 'pt-BR'))) {
        if (alcancados.has(v) || !abrirPorta(v, atual)) continue;
        alcancados.add(v);
        fila2.push(v);
        if (ehMolhado(atual.item)) avisos.push(`${v.nome}: só tem acesso passando por ${atual.nome}.`);
      }
    }
  }
  for (const a of ambientes) if (!alcancados.has(a)) avisos.push(`${a.nome}: sem lado comum largo o bastante para uma porta — ficou sem acesso.`);
  // Relações OBRIGATÓRIAS da matriz = porta direta quando os dois encostam.
  for (const r of programa.relacoes) {
    if (r.tipo !== 'OBRIGATORIA') continue;
    for (const a of ambientes.filter((x) => x.item.id === r.a))
      for (const b of ambientes.filter((x) => x.item.id === r.b)) {
        if (!ladoComum(a.ret, b.ret)) continue;
        // F20: o molhado que já tem a sua porta não ganha outra (folha).
        const jaTemPorta = (m: AmbienteGerado) => ehMolhado(m.item) && [...portasFeitas].some((k) => k.split('|').includes(m.nome)) && !portasFeitas.has([a.nome, b.nome].sort().join('|'));
        if (jaTemPorta(a) || jaTemPorta(b)) continue;
        abrirPorta(a, b);
      }
  }
  // F21: a relação obrigatória que ficou SEM porta direta é dita (a casa conta como problema grave ao escolher a semente).
  for (const r of programa.relacoes) {
    if (r.tipo !== 'OBRIGATORIA') continue;
    const as = ambientes.filter((x) => x.item.id === r.a);
    const bs = ambientes.filter((x) => x.item.id === r.b);
    if (!as.length || !bs.length) continue;
    if (!as.some((a) => bs.some((b) => portasFeitas.has([a.nome, b.nome].sort().join('|'))))) avisos.push(`${as[0].nome} × ${bs[0].nome}: sem porta direta (relação obrigatória).`);
  }
  // Entrada: no lado da frente da sala (ou do corredor).
  // F11: o lado da FRENTE é o trecho do ambiente na borda do contorno que olha para a frente.
  const trechoDaFrente = (a: AmbienteGerado | null) =>
    a ? ladosNaBorda(a.ret).filter((x) => x.lado === (frente as LadoNoDesenho)).sort((p, q) => Math.hypot(q.b.x - q.a.x, q.b.y - q.a.y) - Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y))[0] ?? null : null;
  // F20: nunca pelo banheiro/lavabo (sem lado da sala na frente, a entrada caía no lavabo — 10,5 × 14,5 m).
  const entradaEm = [sala, ...ambientes.filter((a) => a.zona === 'SOCIAL' && a !== sala), corredor, ...ambientes].find((a) => !!a && !ehMolhado(a.item) && !!trechoDaFrente(a)) ?? null;
  if (entradaEm) {
    const seg = trechoDaFrente(entradaEm)!;
    const cmd = porta(seg, hip.larguraEntradaMm, true);
    if (cmd) {
      aberturas.push(cmd);
      decisoes.push(`Entrada de ${f2(hip.larguraEntradaMm / 1000)} m pela frente, em ${entradaEm.nome}.`);
    }
  }
  // Janelas.
  const janelas: string[] = [];
  for (const a of ambientes) {
    if (a.zona === 'CIRCULACAO') continue;
    const precisa = a.item.exigeIluminacao || a.item.exigeFachada || a.item.exigeVentilacao;
    if (!precisa) continue;
    // F11: os lados EXTERNOS são os trechos do ambiente na borda do contorno (não só do retângulo).
    const ladosExt: { a: Point; b: Point; lado: LadoDaFrente }[] = ladosNaBorda(a.ret).map((x) => ({ a: x.a, b: x.b, lado: x.lado as LadoDaFrente }));
    if (ladosExt.length === 0) {
      avisos.push(`${a.nome} exige ${a.item.exigeIluminacao ? 'iluminação' : a.item.exigeFachada ? 'fachada' : 'ventilação'} e ficou sem lado externo.`);
      continue;
    }
    // Prefere o lado mais ao norte (sol de inverno no hemisfério sul); desempate pelo comprimento.
    const az = (l: LadoDaFrente) => ({ N: 0, L: 90, S: 180, O: 270 })[l];
    const porPreferencia = [...ladosExt].sort((p, q) => Math.min(az(p.lado), 360 - az(p.lado)) - Math.min(az(q.lado), 360 - az(q.lado)) || Math.hypot(q.b.x - q.a.x, q.b.y - q.a.y) - Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y));
    const banheiro = a.item.uso === 'BANHEIRO' || a.item.uso === 'LAVABO';
    const alturaDaJanela = banheiro ? 600 : hip.janela.alturaMm;
    // F3b: a janela cobre a fração mínima do piso (1/6 habitável, 1/8 banheiro/cozinha — as regras semente),
    // acima do teto estético `maxMm` se preciso. O piso é o ÚTIL, como a regra mede (eixo − meia parede de
    // cada lado, pela interna — a externa é mais grossa, então a conta sobra a favor da regra).
    const tipo = TIPO_NBR5410_DO_USO[a.item.uso];
    const fracao = tipo === 'SALA_DORMITORIO' ? hip.iluminacaoMinima.habitavel : tipo === 'BANHEIRO' || tipo === 'COZINHA_SERVICO' ? hip.iluminacaoMinima.servico : 0;
    const pisoUtilMm2 = Math.max(0, a.ret.x1 - a.ret.x0 - hip.espessuraInternaMm) * Math.max(0, a.ret.y1 - a.ret.y0 - hip.espessuraInternaMm);
    // F6b (15/10/2026): JANELA EM MAIS DE UM LADO. Uma janela só, no melhor lado, deixava a sala de 33 m² do
    // apartamento com 2 m² (a porta de entrada divide a fachada; 1/6 pede 5,6). Agora: no melhor lado, e
    // enquanto faltar área, no lado externo seguinte. Os lados seguintes só entram por FALTA (não por estética).
    let faltaMm2 = pisoUtilMm2 * fracao;
    let algumaJanela = false;
    for (const [n, escolhido] of porPreferencia.entries()) {
      if (n > 0 && faltaMm2 <= 0) break;
      const comprimento = Math.hypot(escolhido.b.x - escolhido.a.x, escolhido.b.y - escolhido.a.y);
      const pelaNorma = Math.ceil(Math.max(0, faltaMm2) / alturaDaJanela / hip.malhaMm) * hip.malhaMm;
      const estetica = n > 0 ? 0 : banheiro ? 600 : Math.max(hip.janela.minMm, Math.min(hip.janela.maxMm, snap(comprimento * hip.janela.fracaoDoLado, hip.malhaMm)));
      const desejada = Math.min(Math.max(estetica, pelaNorma, 600), Math.floor((comprimento - 400) / hip.malhaMm) * hip.malhaMm);
      if (desejada < 600) continue;
      const w = paredeDoSegmento(paredes(), escolhido.a, escolhido.b);
      if (!w) continue;
      const meio = point((escolhido.a.x + escolhido.b.x) / 2, (escolhido.a.y + escolhido.b.y) / 2);
      const lo = Math.min(offsetNaParede(w, escolhido.a), offsetNaParede(w, escolhido.b)) + FOLGA;
      const hi = Math.max(offsetNaParede(w, escolhido.a), offsetNaParede(w, escolhido.b)) - FOLGA;
      // F3b: a maior que cabe ao lado do que já está na parede (a porta de entrada na fachada da sala): desce de
      // 250 em 250 mm até 0,60 m — desistir da janela inteira, como era, deixava a sala sem janela nenhuma.
      let largura = desejada;
      let off = encaixar(w, offsetNaParede(w, meio) - largura / 2, largura, lo, hi);
      while (off === null && largura - 250 >= 600) {
        largura -= 250;
        off = encaixar(w, offsetNaParede(w, meio) - largura / 2, largura, lo, hi);
      }
      if (off === null) continue;
      // Sem aviso quando ainda falta área: a estimativa do piso útil é conservadora e o aviso saía com a regra de
      // iluminação CONFORME. Quem acusa é a regra (`sem-iluminacao-*`), pela área útil de verdade.
      reservar(w, off, largura);
      aberturas.push({ type: 'AddOpening', wallId: w.id, wallUid: w.uid, kind: 'window', offsetMm: off, widthMm: largura, heightMm: alturaDaJanela, sillMm: banheiro ? 1600 : hip.janela.peitorilMm });
      janelas.push(`${a.nome} (${escolhido.lado})`);
      faltaMm2 -= largura * alturaDaJanela;
      algumaJanela = true;
    }
    // F22: a VARANDA é aberta — sem janela não é falta (estreita, junto da garagem, a porta de entrada ocupa a frente dela).
    if (!algumaJanela && a.item.uso !== 'VARANDA') avisos.push(`${a.nome}: não coube janela na parede externa (a porta ocupa o trecho).`);
  }
  aplicar(aberturas);
  if (janelas.length) decisoes.push(`Janelas na fachada de quem exige, preferindo o norte: ${janelas.join(', ')}.`);

  // (e) automáticos.
  if (hip.automaticos) {
    const contagem: string[] = [];
    const tentar = (nome: string, fn: () => Command[]) => {
      try {
        const cmds = fn();
        aplicar(cmds);
        contagem.push(`${nome}: ${cmds.length}`);
      } catch (e) {
        avisos.push(`automático "${nome}" falhou: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    tentar('pilares', () => planejarPilares(model, levelId).comandos);
    tentar('vigas', () => planejarVigas(model, levelId).comandos);
    tentar('lajes', () => planejarLajes(model, levelId).comandos);
    tentar('tomadas e luz (NBR 5410)', () => comandosDePontosDoNivel(model, levelId, { peDireitoMm: hip.peDireitoMm }));
    tentar('pontos hidráulicos', () => planejarPontosDoNivel(model, levelId).flatMap((p) => p.comandos));
    decisoes.push(`Automáticos: ${contagem.join(' · ')}. Água e esgoto ficam para depois (precisam de reservatório e caixa de inspeção posicionados).`);
  }

  // (f) avaliação — a área construída vem antes: a TO e o CA das regras saem dela.
  const perimetro = contorno.reduce((s, p, i) => s + Math.hypot(contorno[(i + 1) % contorno.length].x - p.x, contorno[(i + 1) % contorno.length].y - p.y), 0);
  const areaConstruidaM2 = anexos.length
    ? (Math.abs(polygonArea(contorno)) + (perimetro * hip.espessuraExternaMm) / 2) / 1e6
    : ((ret.x1 - ret.x0 + hip.espessuraExternaMm) * (ret.y1 - ret.y0 + hip.espessuraExternaMm)) / 1e6;
  const conferencia = conferirPrograma(model, programa);
  const lote = entrada.contextoDeRegras?.lote ?? null;
  const regras = avaliarRegras(
    model,
    REGRAS_SEMENTE,
    entrada.contextoDeRegras
      ? {
          lote,
          zona: entrada.contextoDeRegras.zona ?? null,
          taxaOcupacaoPct: lote && lote.areaM2 > 0 ? Math.round((areaConstruidaM2 / lote.areaM2) * 1000) / 10 : null,
          coeficiente: lote && lote.areaM2 > 0 ? Math.round((areaConstruidaM2 / lote.areaM2) * 100) / 100 : null,
          alturaM: hip.peDireitoMm / 1000,
        }
      : {},
  );
  const avaliacao = avaliar(
    { model, programa, conferencia, resultadosDeRegras: regras, insolacao: { latitudeGraus: entrada.latitudeGraus, rotacaoNorteDeg: entrada.rotacaoNorteDeg, prismas: [] }, insolacaoMinimaH: null, custoTotalBRL: null },
    entrada.hipotesesDaAvaliacao ?? HIPOTESES_DA_AVALIACAO_PADRAO,
  );
  const paredesM = model.walls.reduce((s, w) => s + wallLength(w), 0) / 1000;
  const areaUtilM2 = model.spaces.reduce((s, sp) => s + areaRecuada(sp.ring, model.walls).areaMm2, 0) / 1e6;
  decisoes.push(`Resultado: ${f2(areaConstruidaM2)} m² construídos, ${f2(areaUtilM2)} m² úteis, ${f2(paredesM)} m de parede; nota ${avaliacao.notaGeral ?? '—'}.`);
  return {
    semente,
    hipoteses: hip,
    retangulo: ret,
    contorno,
    anexos,
    frente,
    ambientes,
    comandos,
    model,
    levelId,
    avaliacao,
    regras,
    resumo: { areaConstruidaM2: Math.round(areaConstruidaM2 * 100) / 100, areaUtilM2: Math.round(areaUtilM2 * 100) / 100, paredesM: Math.round(paredesM * 100) / 100, objetivoInicial: inicial, objetivoFinal: final },
    decisoes,
    avisos,
  };
}

/** N sementes (1..N) → N alternativas, ranqueadas pela nota (desempate: menor objetivo, menor semente). */
export function gerarAlternativas(entrada: EntradaDoGerador, hip: Partial<HipotesesDoGerador> = {}): ResultadoDoGerador[] {
  const n = Math.max(1, Math.min(12, hip.sementes ?? HIPOTESES_DO_GERADOR_PADRAO.sementes));
  const out: ResultadoDoGerador[] = [];
  for (let s = 1; s <= n; s++) out.push(gerar(entrada, s, hip));
  return out.sort((a, b) => (b.avaliacao.notaGeral ?? -1) - (a.avaliacao.notaGeral ?? -1) || a.resumo.objetivoFinal - b.resumo.objetivoFinal || a.semente - b.semente);
}

/** Não dominadas em (área construída ↓, metros de parede ↓, nota ↑). */
export function frenteDePareto(resultados: readonly ResultadoDoGerador[]): Set<number> {
  const front = new Set<number>();
  for (const a of resultados) {
    const dominado = resultados.some(
      (b) =>
        b !== a &&
        b.resumo.areaConstruidaM2 <= a.resumo.areaConstruidaM2 &&
        b.resumo.paredesM <= a.resumo.paredesM &&
        (b.avaliacao.notaGeral ?? -1) >= (a.avaliacao.notaGeral ?? -1) &&
        (b.resumo.areaConstruidaM2 < a.resumo.areaConstruidaM2 || b.resumo.paredesM < a.resumo.paredesM || (b.avaliacao.notaGeral ?? -1) > (a.avaliacao.notaGeral ?? -1)),
    );
    if (!dominado) front.add(a.semente);
  }
  return front;
}

/**
 * F21: une as coordenadas x (e as y) das bordas dos retângulos que distam menos de `tolerancia` (a espessura da parede) —
 * a do contorno vale (é a fachada); senão, a mais repetida (empate: a menor). Atualiza área e largura mínima.
 */
function alinharBordas(ambientes: AmbienteGerado[], contorno: readonly Point[], tolerancia: number): void {
  const mapa = (valores: number[], ancoras: Set<number>): Map<number, number> => {
    const conta = new Map<number, number>();
    for (const v of valores) conta.set(v, (conta.get(v) ?? 0) + 1);
    const distintos = [...conta.keys()].sort((a, b) => a - b);
    const saida = new Map<number, number>();
    let grupo: number[] = [];
    const fechar = () => {
      if (!grupo.length) return;
      const ancora = grupo.find((v) => ancoras.has(v));
      const rep = ancora ?? [...grupo].sort((a, b) => conta.get(b)! - conta.get(a)! || a - b)[0];
      for (const v of grupo) saida.set(v, rep);
      grupo = [];
    };
    for (const v of distintos) {
      if (grupo.length && v - grupo[grupo.length - 1] >= tolerancia) fechar();
      grupo.push(v);
    }
    fechar();
    return saida;
  };
  const mx = mapa(ambientes.flatMap((a) => [a.ret.x0, a.ret.x1]), new Set(contorno.map((p) => p.x)));
  const my = mapa(ambientes.flatMap((a) => [a.ret.y0, a.ret.y1]), new Set(contorno.map((p) => p.y)));
  for (const a of ambientes) {
    const r = { x0: mx.get(a.ret.x0) ?? a.ret.x0, y0: my.get(a.ret.y0) ?? a.ret.y0, x1: mx.get(a.ret.x1) ?? a.ret.x1, y1: my.get(a.ret.y1) ?? a.ret.y1 };
    if (r.x1 - r.x0 < tolerancia || r.y1 - r.y0 < tolerancia) continue;
    a.ret = r;
    a.areaM2 = Math.round(((r.x1 - r.x0) * (r.y1 - r.y0)) / 10_000) / 100;
    a.larguraMinM = Math.min(r.x1 - r.x0, r.y1 - r.y0) / 1000;
  }
}

/**
 * "APLICAR AQUI": a geometria da alternativa (paredes com uid determinístico e
 * aberturas por `wallUid`) remapeada para OUTRO pavimento — cabe num lote só.
 * Os NOMES dependem dos ambientes derivados: `nomesParaOModelo` os calcula
 * sobre o modelo já com as paredes (o kernel é determinístico: aplicar o mesmo
 * lote ao mesmo modelo dá os mesmos ids, então quem chama pode simular com
 * `applyBatch` e depois rodar os dois lotes no editor).
 */
export function comandosDeGeometria(r: ResultadoDoGerador, levelId: ObjectId): Command[] {
  return r.comandos
    .filter((c) => c.type === 'AddWall' || c.type === 'AddOpening')
    .map((c) => {
      if (c.type === 'AddWall') return { ...c, levelId };
      // A abertura vai pela identidade da parede — o id é do modelo gerado.
      return { ...c, wallId: '' };
    });
}

/**
 * F11 — APLICAR EM LOTE (12/10/2026): as paredes, as aberturas e os nomes em TRÊS comandos de
 * lote (`AddWalls`, `AddOpenings` por `wallUid`, `PlaceSpaceLabels` no centro de cada ambiente) —
 * um `runBatch`, UM Ctrl+Z, e a cauda do kernel (arranjo, invariantes) roda uma vez por lote em
 * vez de uma vez por parede (ver o custo por comando do kernel). Os nomes não precisam mais de
 * simulação: a etiqueta nomeia o ambiente em que cai.
 */
export function comandosDeAplicacao(r: ResultadoDoGerador, levelId: ObjectId): Command[] {
  const walls = r.comandos.flatMap((c) => (c.type === 'AddWall' ? [(({ type: _t, ...resto }) => ({ ...resto, levelId }))(c)] : []));
  const openings = r.comandos.flatMap((c) => (c.type === 'AddOpening' ? [(({ type: _t, ...resto }) => ({ ...resto, wallId: '' }))(c)] : []));
  const labels = r.ambientes.map((a) => ({ levelId, at: point(snap((a.ret.x0 + a.ret.x1) / 2, 10), snap((a.ret.y0 + a.ret.y1) / 2, 10)), name: a.nome, uso: a.item.uso }));
  const out: Command[] = [];
  if (walls.length) out.push({ type: 'AddWalls', walls });
  if (openings.length) out.push({ type: 'AddOpenings', openings });
  if (labels.length) out.push({ type: 'PlaceSpaceLabels', labels });
  return out;
}

export function nomesParaOModelo(r: ResultadoDoGerador, model: BlueprintModel, levelId: ObjectId): Command[] {
  const out: Command[] = [];
  for (const a of r.ambientes) {
    const c = point((a.ret.x0 + a.ret.x1) / 2, (a.ret.y0 + a.ret.y1) / 2);
    const s = model.spaces.find((x) => x.levelId === levelId && pointInPolygon(x.ring, c));
    if (s) out.push({ type: 'NameSpace', spaceId: s.id, name: a.nome, uso: a.item.uso });
  }
  return out;
}
