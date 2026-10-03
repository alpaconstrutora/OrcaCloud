/**
 * ESTUDO DE MASSA — A PLANTA INTERNA DE CADA UNIDADE (fase M6b do plano
 * `2026-10-01-estudo-de-massa.md`, §19 e §20 do pedido).
 *
 * Depois do pavimento tipo montado (M6a), cada unidade é um ambiente só. Aqui
 * o GERADOR DE PLANTAS da E6.2 roda DENTRO de cada uma — o programa da
 * tipologia (2 quartos, 3 quartos com suíte…), o retângulo da unidade como
 * envelope, a ENTRADA voltada para o corredor — e as paredes internas, as
 * portas internas e as janelas da fachada entram no pavimento tipo, com cada
 * cômodo como parte da unidade (E2.2). As cópias vivas (E2.1) levam tudo para
 * os outros andares.
 *
 * ─── NO QUADRO DO BLOCO ─────────────────────────────────────────────────────
 *
 * O gerador trabalha num retângulo de eixos alinhados. O bloco pode estar
 * girado (o gerador de massa orienta pela frente do lote): rodar o gerador no
 * desenho perderia área no retângulo inscrito. Por isso ele roda no quadro do
 * bloco — o retângulo exato da unidade, na origem — e o resultado volta ao
 * desenho por transformação rígida (offsets de abertura não mudam).
 *
 * ─── O QUE ENTRA, E O QUE NÃO ───────────────────────────────────────────────
 *
 *  - Entram as paredes INTERNAS do gerador e as portas nelas.
 *  - As paredes EXTERNAS dele não entram: a unidade já tem as dela (fachada,
 *    corredor, divisa com o vizinho). As janelas que ele pôs nelas entram só
 *    se caem numa parede de FACHADA (o perímetro do bloco) — janela para o
 *    corredor ou para o apartamento vizinho não existe.
 *  - A porta de entrada do gerador não entra: a M6a já abriu a da unidade no
 *    corredor.
 *  - O zoneamento do gerador (faixa social na frente, íntima no fundo) foi
 *    feito para casa; numa unidade rasa e larga, com a "frente" no corredor, a
 *    sala cai longe da fachada e perde a janela. Por isso cada unidade testa a
 *    frente pelo corredor e pelas duas pontas, com duas sementes, e fica com o
 *    arranjo em que MAIS cômodos que pedem luz tocam a fachada (empate: o do
 *    corredor, que põe a entrada certa). Medido na exploração: só com a frente
 *    no corredor, 12 janelas caíam no corredor ou no vizinho.
 *  - Unidade comercial (sala, loja) fica aberta: o gerador é de residência.
 *
 * ─── UNIDADES IGUAIS VIRAM GRUPO (E2.3) ─────────────────────────────────────
 *
 * IGUAIS = mesma tipologia, mesmas medidas e a mesma situação de fachada a
 * menos de um espelho: a unidade de canto à esquerda é a da direita espelhada
 * ao longo do bloco; a do lado da rua é a dos fundos espelhada através do
 * corredor; as duas coisas juntas são o giro de 180°. A planta é gerada UMA
 * vez, na primeira da classe (a ORIGEM), e cada igual vira uma INSTÂNCIA do
 * grupo — editar a planta da origem (mover uma parede, trocar uma porta,
 * renomear um cômodo) propaga para as iguais; editar a cópia é recusado pelo
 * kernel (`GROUP_INSTANCE`), que manda editar a origem. Os cômodos copiados
 * passam a ser a unidade da M6a (o mesmo número, a mesma unidade).
 *
 * O kernel espelha nos eixos do mundo e gira de 90 em 90°: a instância só
 * existe quando a composição dos dois quadros (o da origem e o da igual) é
 * isso — num bloco girado, a canto espelhada fica com a planta própria.
 * Unidade de canto e unidade do meio NÃO são iguais: a de canto tem a fachada
 * da ponta, e a planta dela foi escolhida por isso.
 *
 * ─── O QUADRO DE CADA UNIDADE (pendências de 03/10/2026) ────────────────────
 *
 * Cada unidade é gerada no SEU quadro, tirado do ambiente dela: a fachada
 * principal (o lado mais longo sobre o contorno do bloco) embaixo, o corredor
 * do outro lado. Vale para o bloco retangular e para L, U, T e H — nas asas
 * verticais a fachada fica de lado no desenho, e o quadro do bloco não servia.
 * Unidade em L (a de canto que dobra a esquina) fica aberta: o gerador é de
 * retângulo.
 *
 * O que fica fora do grupo, dito: as JANELAS da fachada. A fachada é uma
 * parede só para o andar inteiro (o contorno do bloco), e a janela é da
 * parede que a hospeda — cada unidade continua com as suas, na posição
 * espelhada. Se o grupo não fechar (o kernel recusar, ou uma igual não sair
 * com os mesmos cômodos), tudo volta para a cópia do desenho, com aviso.
 */
import {
  applyBatch,
  pointInPolygon,
  transformarPontoDoGrupo,
  uidDeterministico,
  type BlueprintModel,
  type Bloco,
  type Command,
  type EspelhoDoGrupo,
  type ObjectId,
  type Point,
  type RotacaoDoGrupo,
  type Wall,
} from './blueprintKernel';
import { gerar, type ResultadoDoGerador } from './blueprintGerador';
import { atualizarItem, programaSemente, removerItem, type Programa } from './blueprintPrograma';
import { FICHA_DO_USO } from './blueprintPrograma';
import type { Produto, TipologiaDoProduto } from './blueprintProduto';
import { ALEM_MM, pavimentoTipoMontado, type QuadroDoBloco } from './blueprintPavimentoTipoDaMassa';

/** O programa de necessidades de uma tipologia do produto (sementes da E4.1 ajustadas aos dormitórios). */
export function programaDaTipologia(t: Pick<TipologiaDoProduto, 'uso' | 'dormitorios' | 'nome'>): Programa | null {
  if (t.uso !== 'RESIDENCIAL') return null;
  if (t.dormitorios >= 3) {
    let p = programaSemente('APTO_3Q_SUITE');
    p = atualizarItem(p, 'dorm', { quantidade: t.dormitorios - 1 });
    return { ...p, nome: t.nome };
  }
  let p = programaSemente('APTO_2Q');
  if (t.dormitorios <= 0) p = removerItem(p, 'dorm');
  else p = atualizarItem(p, 'dorm', { quantidade: t.dormitorios });
  return { ...p, nome: t.nome };
}

export interface PlantaDeUmaUnidade {
  numero: string;
  tipologia: string;
  /** Os cômodos que nasceram (nome e área do gerador). */
  ambientes: { nome: string; areaM2: number }[];
  /** "gerada" | "instância da 101 (espelhada)" | o motivo de não ter. */
  origem: string;
  janelas: number;
  portas: number;
  /** Cômodos que pedem luz/fachada e ficaram SEM fachada (não há onde pôr janela) — para o projetista ajustar. */
  semFachada: string[];
}

/** Um grupo da E2.3 criado aqui: a unidade de origem e as iguais (instâncias). */
export interface GrupoDeUnidadesIguais {
  nome: string;
  origem: string;
  iguais: { numero: string; repeticao: string }[];
}

export interface PlantasDasUnidades {
  comandos: Command[];
  model: BlueprintModel;
  unidades: PlantaDeUmaUnidade[];
  geracoes: number;
  grupos: GrupoDeUnidadesIguais[];
  avisos: string[];
}

/** Como uma unidade igual repete a planta de outra, no quadro DELA (fachada embaixo): igual, ou espelhada (troca as pontas). */
export interface Repeticao {
  espelhaA: boolean;
}

const noMundo = (q: QuadroDoBloco, a: number, b: number): Point => ({ x: Math.round(q.o.x + q.u.x * a + q.v.x * b), y: Math.round(q.o.y + q.u.y * a + q.v.y * b) });
const paraLocal = (q: QuadroDoBloco, p: Point) => {
  const dx = p.x - q.o.x;
  const dy = p.y - q.o.y;
  return { a: dx * q.u.x + dy * q.u.y, b: dx * q.v.x + dy * q.v.y };
};
const r2 = (v: number) => Math.round(v * 100) / 100;
const girado = (q: QuadroDoBloco) => Math.abs(q.u.x * q.u.y) > 1e-9;

/** O rótulo da instância como o desenho a vê: espelhada, girada ou repetida. */
export function rotuloDaInstancia(i: { rotacaoGraus: RotacaoDoGrupo; espelho: EspelhoDoGrupo }): string {
  if (i.espelho !== 'NENHUM') return 'espelhada';
  if (i.rotacaoGraus === 180) return 'girada 180°';
  if (i.rotacaoGraus !== 0) return 'girada 90°';
  return 'repetida';
}

/** O ponto está sobre o contorno (a menos de 5 mm de um lado dele)? */
function noContorno(contorno: readonly Point[], p: Point): boolean {
  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i];
    const b = contorno[(i + 1) % contorno.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len;
    const dist = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
    if (dist <= 5 && t >= -5 && t <= len + 5) return true;
  }
  return false;
}
/** O segmento está sobre o contorno (as duas pontas e o meio)? — a parede que hospeda janela. */
const segmentoNoContorno = (contorno: readonly Point[], a: Point, b: Point) => noContorno(contorno, a) && noContorno(contorno, b) && noContorno(contorno, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
/** Quanto do segmento [a, b] corre sobre o contorno (colinear, a menos de 5 mm), mm. */
function trechoNoContorno(contorno: readonly Point[], a: Point, b: Point): number {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1) return 0;
  let soma = 0;
  for (let i = 0; i < contorno.length; i++) {
    const c = contorno[i];
    const d = contorno[(i + 1) % contorno.length];
    const lc = Math.hypot(d.x - c.x, d.y - c.y);
    if (lc < 1) continue;
    // Colinear: as duas pontas do segmento a menos de 5 mm da reta do lado.
    const dist = (p: Point) => Math.abs((p.x - c.x) * (d.y - c.y) - (p.y - c.y) * (d.x - c.x)) / lc;
    if (dist(a) > 5 || dist(b) > 5) continue;
    const t = (p: Point) => ((p.x - c.x) * (d.x - c.x) + (p.y - c.y) * (d.y - c.y)) / lc;
    const lo = Math.max(Math.min(t(a), t(b)), 0);
    const hi = Math.min(Math.max(t(a), t(b)), lc);
    if (hi > lo) soma += hi - lo;
  }
  return soma;
}
/** O lado da unidade é FACHADA: corre sobre o contorno por pelo menos 1 m (ou 30 % dele). Parcial vale — a janela
 * só cai onde há parede de fachada (o perímetro confere na hora de pôr). */
const ladoDeFachada = (contorno: readonly Point[], a: Point, b: Point) => trechoNoContorno(contorno, a, b) >= Math.min(1000, 0.3 * Math.hypot(b.x - a.x, b.y - a.y));

/**
 * O QUADRO de uma unidade retangular: origem na ponta da fachada principal (o lado mais longo sobre o contorno do
 * bloco), `u` ao longo dela, `v` para dentro (quadro destro); W ao longo da fachada, D até o corredor. `e`/`d`: o
 * lado em a = 0 / a = W também é fachada (unidade de canto); `fundo`: o lado oposto também.
 */
export function quadroDaUnidade(anel: readonly Point[], contorno: readonly Point[]): { q: QuadroDoBloco; e: boolean; d: boolean; fundo: boolean } | { motivo: string } {
  // Limpeza até estabilizar: pontos coincidentes (< 6 mm), AGULHAS (A → B → A: a ponta de 3 mm que passa do
  // encontro, somada ao arredondamento do bloco girado, deixa um bico de ~5 mm no anel) e colineares.
  let pts = [...anel];
  for (let volta = 0; volta < 10; volta++) {
    const antes = pts.length;
    pts = pts.filter((p, i) => {
      const a = pts[(i - 1 + pts.length) % pts.length];
      return Math.hypot(p.x - a.x, p.y - a.y) >= 6;
    });
    pts = pts.filter((p, i) => {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const c = pts[(i + 1) % pts.length];
      if (Math.hypot(a.x - c.x, a.y - c.y) < 6) return false; // a ponta da agulha
      const cruz = (p.x - a.x) * (c.y - p.y) - (p.y - a.y) * (c.x - p.x);
      return Math.abs(cruz) / ((Math.hypot(p.x - a.x, p.y - a.y) || 1) * (Math.hypot(c.x - p.x, c.y - p.y) || 1)) > 0.01;
    });
    if (pts.length === antes || pts.length < 3) break;
  }
  if (pts.length !== 4) return { motivo: 'unidade em L (não retangular): fica aberta — o gerador é de retângulo' };
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const c = pts[(i + 2) % 4];
    const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
    if (Math.abs(dot) / ((Math.hypot(b.x - a.x, b.y - a.y) || 1) * (Math.hypot(c.x - b.x, c.y - b.y) || 1)) > 0.01) return { motivo: 'unidade não retangular: fica aberta' };
  }
  const lados = [0, 1, 2, 3].map((i) => ({ i, a: pts[i], b: pts[(i + 1) % 4], len: Math.hypot(pts[(i + 1) % 4].x - pts[i].x, pts[(i + 1) % 4].y - pts[i].y), fachada: trechoNoContorno(contorno, pts[i], pts[(i + 1) % 4]) }));
  // A principal: a de mais fachada (não a mais longa — um lado longo com 1 m no contorno perde para um curto inteiro).
  const principal = lados.filter((l) => ladoDeFachada(contorno, l.a, l.b)).sort((x, y) => y.fachada - x.fachada || y.len - x.len || x.i - y.i)[0];
  if (!principal) return { motivo: 'unidade sem fachada: fica aberta' };
  const cx = pts.reduce((sm, p) => sm + p.x, 0) / 4;
  const cy = pts.reduce((sm, p) => sm + p.y, 0) / 4;
  // Quadro destro com v para dentro: se rot90(u) aponta para fora, a fachada é percorrida ao contrário.
  let [P, Q] = [principal.a, principal.b];
  let u = { x: (Q.x - P.x) / principal.len, y: (Q.y - P.y) / principal.len };
  let v = { x: -u.y, y: u.x };
  if ((cx - P.x) * v.x + (cy - P.y) * v.y < 0) {
    [P, Q] = [Q, P];
    u = { x: -u.x, y: -u.y };
    v = { x: -u.y, y: u.x };
  }
  const D = Math.max(...pts.map((p) => (p.x - P.x) * v.x + (p.y - P.y) * v.y));
  const q: QuadroDoBloco = { o: P, u, v, W: principal.len, D };
  const lado = (a0: number, b0: number, a1: number, b1: number) => ladoDeFachada(contorno, noMundo(q, a0, b0), noMundo(q, a1, b1));
  return { q, e: lado(0, 0, 0, D), d: lado(q.W, 0, q.W, D), fundo: lado(0, D, q.W, D) };
}

/**
 * A instância de grupo (E2.3) que leva a planta da unidade de quadro `qO` para a de quadro `qT` (mesmas medidas):
 * no quadro, igual ou espelhada; no desenho, a composição dos dois quadros — que o kernel só representa como espelho
 * nos eixos do mundo e giro de 90 em 90°. `null` quando não é isso (quadros girados com espelho, por exemplo).
 * Pivô no centro da origem; a translação leva ao centro da igual.
 */
export function instanciaEntreUnidades(
  qO: QuadroDoBloco,
  qT: QuadroDoBloco,
  rep: Repeticao,
): { pivo: Point; translacao: Point; rotacaoGraus: RotacaoDoGrupo; espelho: EspelhoDoGrupo } | null {
  const f = rep.espelhaA ? -1 : 1;
  // L = M_T · diag(f, 1) · M_Oᵀ, com M = [u v] em colunas.
  const L = [
    [qT.u.x * f * qO.u.x + qT.v.x * qO.v.x, qT.u.x * f * qO.u.y + qT.v.x * qO.v.y],
    [qT.u.y * f * qO.u.x + qT.v.y * qO.v.x, qT.u.y * f * qO.u.y + qT.v.y * qO.v.y],
  ];
  const inteiro = (x: number) => {
    const r = Math.round(x);
    return Math.abs(x - r) < 2e-3 && Math.abs(r) <= 1 ? r : null;
  };
  const Li = L.map((l) => l.map(inteiro));
  if (Li.some((l) => l.some((x) => x === null))) return null;
  const Lm = Li as number[][];
  const GIROS: [number, number, RotacaoDoGrupo][] = [[1, 0, 0], [0, 1, 90], [-1, 0, 180], [0, -1, 270]];
  const opcoes: { espelho: EspelhoDoGrupo; rot: RotacaoDoGrupo }[] = [];
  // O kernel espelha ANTES de girar: L = R(k) · E, então R(k) = L · E (E = E⁻¹).
  for (const [espelho, E] of [['NENHUM', [[1, 0], [0, 1]]], ['X', [[-1, 0], [0, 1]]], ['Y', [[1, 0], [0, -1]]]] as [EspelhoDoGrupo, number[][]][]) {
    const R = [
      [Lm[0][0] * E[0][0] + Lm[0][1] * E[1][0], Lm[0][0] * E[0][1] + Lm[0][1] * E[1][1]],
      [Lm[1][0] * E[0][0] + Lm[1][1] * E[1][0], Lm[1][0] * E[0][1] + Lm[1][1] * E[1][1]],
    ];
    const g = GIROS.find(([c, sn]) => R[0][0] === c && R[1][0] === sn && R[0][1] === -sn && R[1][1] === c);
    if (g) opcoes.push({ espelho, rot: g[2] });
  }
  // Preferência: sem espelho; espelho sem giro; o resto.
  const escolha = opcoes.find((o) => o.espelho === 'NENHUM') ?? opcoes.find((o) => o.rot === 0) ?? opcoes[0];
  if (!escolha) return null;
  const centro = (q: QuadroDoBloco) => ({ x: q.o.x + (q.u.x * q.W) / 2 + (q.v.x * q.D) / 2, y: q.o.y + (q.u.y * q.W) / 2 + (q.v.y * q.D) / 2 });
  const cO = centro(qO);
  const pivo = { x: Math.round(cO.x), y: Math.round(cO.y) };
  const semT = transformarPontoDoGrupo({ pivo }, { translacao: { x: 0, y: 0 }, rotacaoGraus: escolha.rot, espelho: escolha.espelho }, cO);
  const cT = centro(qT);
  return { pivo, translacao: { x: Math.round(cT.x - semT.x), y: Math.round(cT.y - semT.y) }, rotacaoGraus: escolha.rot, espelho: escolha.espelho };
}

/**
 * O erro (mm) da instância nos cantos: o canto da origem levado pela instância × o canto da igual lido no quadro dela.
 * Quadros tirados de anéis arredondados (bloco girado) e centros em meio milímetro (giro de 90°) deixam a cópia uns mm
 * fora — a parede copiada não encontraria a divisória da igual. Acima de 1,5 mm (metade do ALEM_MM) não vale grupo.
 */
export function erroDaInstanciaMm(qO: QuadroDoBloco, qT: QuadroDoBloco, rep: Repeticao, inst: { pivo: Point; translacao: Point; rotacaoGraus: RotacaoDoGrupo; espelho: EspelhoDoGrupo }): number {
  let pior = 0;
  for (const [x, y] of [[0, 0], [qO.W, 0], [0, qO.D], [qO.W, qO.D]]) {
    const levado = transformarPontoDoGrupo({ pivo: inst.pivo }, inst, noMundo(qO, x, y));
    const certo = noMundo(qT, rep.espelhaA ? qT.W - x * (qT.W / (qO.W || 1)) : x * (qT.W / (qO.W || 1)), y * (qT.D / (qO.D || 1)));
    pior = Math.max(pior, Math.hypot(levado.x - certo.x, levado.y - certo.y));
  }
  return pior;
}

/** A unidade já tem planta interna? (mais de um ambiente no pavimento.) */
export function unidadeTemPlanta(model: BlueprintModel, numero: string, levelId: ObjectId): boolean {
  const u = (model.unidades ?? []).find((x) => x.numero === numero);
  if (!u) return false;
  return model.labels.filter((l) => l.levelId === levelId && u.etiquetaUids.includes(l.uid)).length > 1;
}

/** A parede (do pavimento) cujo eixo contém o ponto. */
function paredeNoPonto(paredes: readonly Wall[], p: Point): { w: Wall; off: number } | null {
  for (const w of paredes) {
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const t = ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / len;
    const dist = Math.abs((p.x - w.a.x) * dy - (p.y - w.a.y) * dx) / len;
    if (dist <= 5 && t >= 0 && t <= len) return { w, off: t };
  }
  return null;
}

/** O grupo não fechou: volta tudo para a cópia do desenho. */
class FalhaDoGrupo extends Error {}

/**
 * Gera a planta das unidades do pavimento tipo do bloco. `agrupar: false` (o caminho de volta quando o grupo
 * não fecha) desenha as iguais como cópia do desenho, sem grupo.
 */
export function plantasDasUnidades(model: BlueprintModel, b: Bloco, produto: Produto, semente = 1, opcoes: { agrupar?: boolean } = {}): PlantasDasUnidades {
  if (opcoes.agrupar === false) return gerarPlantas(model, b, produto, semente, false);
  try {
    return gerarPlantas(model, b, produto, semente, true);
  } catch (e) {
    if (!(e instanceof FalhaDoGrupo)) throw e;
    const r = gerarPlantas(model, b, produto, semente, false);
    return { ...r, avisos: [`O grupo das unidades iguais não fechou (${e.message}): as iguais ficaram como cópia do desenho — editar uma não muda as outras.`, ...r.avisos] };
  }
}

function gerarPlantas(model: BlueprintModel, b: Bloco, produto: Produto, semente: number, agrupar: boolean): PlantasDasUnidades {
  const avisos: string[] = [];
  const tipo = pavimentoTipoMontado(model, b);
  if (!tipo) return { comandos: [], model, unidades: [], geracoes: 0, grupos: [], avisos: [`Monte o pavimento tipo de "${b.nome}" primeiro (painel do bloco).`] };
  // A FACHADA é o contorno do bloco (retângulo, L, U, T, H): parede cujo eixo está sobre ele.
  const contorno = b.pontos;
  const perimetro = (w: Wall) => segmentoNoContorno(contorno, w.a, w.b);

  // As unidades do pavimento tipo, com o ambiente, o QUADRO dela e a tipologia do produto.
  // `e`/`d`: o lado em a = 0 / a = W do quadro também é fachada (unidade de canto); `fundo`: o oposto à fachada também.
  type Alvo = { numero: string; unidadeId: ObjectId; t: TipologiaDoProduto | null; tipologiaNome: string; q: QuadroDoBloco; e: boolean; d: boolean; fundo: boolean; W: number; D: number };
  const alvos: Alvo[] = [];
  const abertas: PlantaDeUmaUnidade[] = [];
  for (const u of model.unidades ?? []) {
    const etiquetas = model.labels.filter((l) => l.levelId === tipo.id && u.etiquetaUids.includes(l.uid));
    if (etiquetas.length === 0) continue;
    if (etiquetas.length > 1) {
      avisos.push(`Unidade ${u.numero}: já tem planta interna (${etiquetas.length} ambientes) — não foi refeita.`);
      continue;
    }
    const s = model.spaces.find((x) => x.levelId === tipo.id && x.labelUid === etiquetas[0].uid);
    if (!s) continue;
    // O anel do ambiente JÁ está nos EIXOS das paredes (o arranjo do kernel é pelas linhas de centro): o quadro da
    // unidade sai dele. (Expandir pela meia espessura — a primeira versão — empurrava a unidade 75–100 mm para fora.)
    const qu = quadroDaUnidade(s.ring, contorno);
    if ('motivo' in qu) {
      abertas.push({ numero: u.numero, tipologia: u.tipologia ?? '—', ambientes: [], origem: qu.motivo, janelas: 0, portas: 0, semFachada: [] });
      continue;
    }
    const t = produto.tipologias.find((x) => x.nome === u.tipologia) ?? null;
    alvos.push({ numero: u.numero, unidadeId: u.id, t, tipologiaNome: u.tipologia ?? '—', q: qu.q, e: qu.e, d: qu.d, fundo: qu.fundo, W: Math.round(qu.q.W), D: Math.round(qu.q.D) });
  }
  if (abertas.length) avisos.push(`${abertas.length} unidade(s) ficaram abertas: ${abertas.map((x) => `${x.numero} (${x.origem.split(':')[0]})`).join(', ')}.`);
  if (alvos.length === 0) return { comandos: [], model, unidades: abertas, geracoes: 0, grupos: [], avisos: avisos.length ? avisos : ['O pavimento tipo não tem unidade sem planta.'] };

  // As classes de unidades IGUAIS (ver o cabeçalho): a primeira de cada uma é a origem.
  // Cada quadro tem a fachada embaixo: as iguais são as de mesma tipologia e medidas, com as pontas iguais ou
  // trocadas (espelho), e a composição dos quadros representável pelo kernel. Tolerância: alinhado, o anel sai em mm
  // inteiro; girado, o arredondamento e o `ALEM_MM` mexem uns mm.
  const REPETICOES: Repeticao[] = [{ espelhaA: false }, { espelhaA: true }];
  const repeticaoEntre = (o: Alvo, x: Alvo): Repeticao | null => {
    const tolMm = girado(o.q) || girado(x.q) ? 5 : 2;
    if (!o.t || o.t.id !== x.t?.id || Math.abs(o.W - x.W) > tolMm || Math.abs(o.D - x.D) > tolMm || o.fundo !== x.fundo) return null;
    for (const rep of REPETICOES) {
      const [e, d] = rep.espelhaA ? [o.d, o.e] : [o.e, o.d];
      if (e !== x.e || d !== x.d) continue;
      const inst = instanciaEntreUnidades(o.q, x.q, rep);
      if (inst && erroDaInstanciaMm(o.q, x.q, rep, inst) <= ALEM_MM / 2) return rep;
    }
    return null;
  };
  type Classe = { origem: Alvo; membros: { a: Alvo; rep: Repeticao }[] };
  const classes: Classe[] = [];
  const membroDe = new Map<string, { classe: Classe; rep: Repeticao }>();
  for (const a of alvos) {
    if (!a.t || a.t.uso !== 'RESIDENCIAL') continue;
    let achou = false;
    for (const c of classes) {
      const rep = repeticaoEntre(c.origem, a);
      if (!rep) continue;
      c.membros.push({ a, rep });
      membroDe.set(a.numero, { classe: c, rep });
      achou = true;
      break;
    }
    if (!achou) classes.push({ origem: a, membros: [] });
  }

  let geracoes = 0;
  const comandos: Command[] = [];
  let m = model;
  const aplicar = (cs: Command[]) => {
    if (!cs.length) return;
    m = applyBatch(m, cs).model;
    comandos.push(...cs);
  };
  /** O melhor arranjo do gerador para a ORIGEM de uma classe (a situação de fachada dela). */
  const gerada = new Map<string, { res: ResultadoDoGerador; semFachada: string[] } | null>();
  const resultadoDe = (a: Alvo): { res: ResultadoDoGerador; semFachada: string[] } | null => {
    if (gerada.has(a.numero)) return gerada.get(a.numero)!;
    const { W, D } = a;
    const programa = a.t ? programaDaTipologia(a.t) : null;
    let melhor: { res: ResultadoDoGerador; nota: number; corredor: boolean } | null = null;
    const yFachada = 0;
    const pedeLuz = (amb: ResultadoDoGerador['ambientes'][number]) => {
      const f = FICHA_DO_USO[amb.item.uso];
      return f.exigeFachada || f.exigeIluminacao;
    };
    const tocaFachada = (amb: ResultadoDoGerador['ambientes'][number]) => {
      const r = amb.ret;
      return Math.abs(r.y0 - yFachada) < 60 || (a.e && r.x0 < 60) || (a.d && r.x1 > W - 60) || (a.fundo && r.y1 > D - 60);
    };
    if (programa) {
      const nota = (res: ResultadoDoGerador) => res.ambientes.filter((amb) => pedeLuz(amb) && tocaFachada(amb)).length;
      // Frente pelo corredor (a entrada certa) e pelas duas pontas; duas sementes cada.
      const frentes: { dir: Point; corredor: boolean }[] = [
        { dir: { x: 0, y: 1 }, corredor: true },
        { dir: { x: -1, y: 0 }, corredor: false },
        { dir: { x: 1, y: 0 }, corredor: false },
      ];
      let erro: string | null = null;
      for (const f of frentes) {
        for (const sem of [semente, semente + 1]) {
          try {
            const res = gerar({ programa, envelope: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: 0, y: D }], direcaoDaFrente: f.dir, rotacaoNorteDeg: null, latitudeGraus: -15.79 }, sem, { automaticos: false });
            geracoes++;
            const n = nota(res);
            if (!melhor || n > melhor.nota || (n === melhor.nota && f.corredor && !melhor.corredor)) melhor = { res, nota: n, corredor: f.corredor };
          } catch (e) {
            erro = e instanceof Error ? e.message : String(e);
          }
        }
      }
      if (!melhor && erro) avisos.push(`Unidade ${a.numero}: o gerador não fechou a planta (${erro}).`);
    }
    const res = melhor ? (melhor as { res: ResultadoDoGerador }).res : null;
    const saida = res ? { res, semFachada: res.ambientes.filter((amb) => pedeLuz(amb) && !tocaFachada(amb)).map((amb) => amb.nome) } : null;
    gerada.set(a.numero, saida);
    return saida;
  };

  const resumo: PlantaDeUmaUnidade[] = [...abertas];
  /** Por unidade desenhada: o arranjo e como ele é lido no quadro dela (espelhos). */
  const nomesPorUnidade: { a: Alvo; res: ResultadoDoGerador; plano: (p: Point) => Point }[] = [];
  const paredesDaUnidade: Extract<Command, { type: 'AddWall' }>[] = [];
  const uidsDasParedesDe = new Map<string, string[]>();
  /** Aberturas: a de parede interna já vira comando (pela identidade da parede); a de fachada espera achar a parede do perímetro. */
  type Pendente = { tipo: 'interna'; cmd: Command } | { tipo: 'fachada'; centro: Point; widthMm: number; heightMm: number; sillMm: number };
  const aberturasPendentes: Pendente[] = [];
  /** As iguais que viram instância (desenhadas pelo grupo, não aqui). */
  const instancias = new Set<string>();
  for (const a of alvos) {
    if (!a.t || a.t.uso !== 'RESIDENCIAL') {
      resumo.push({ numero: a.numero, tipologia: a.tipologiaNome, ambientes: [], origem: !a.t ? `tipologia "${a.tipologiaNome}" não está no produto` : 'unidade comercial: fica aberta', janelas: 0, portas: 0, semFachada: [] });
      continue;
    }
    const membro = membroDe.get(a.numero);
    const fonte = membro ? membro.classe.origem : a;
    const rep = membro?.rep ?? { espelhaA: false };
    const espec = membro ? instanciaEntreUnidades(membro.classe.origem.q, a.q, rep) : null;
    const g = resultadoDe(fonte);
    if (!g) {
      resumo.push({ numero: a.numero, tipologia: a.tipologiaNome, ambientes: [], origem: 'o gerador não fechou a planta', janelas: 0, portas: 0, semFachada: [] });
      continue;
    }
    const { res } = g;
    const viraInstancia = agrupar && !!membro;
    if (viraInstancia) instancias.add(a.numero);
    const { W, D } = a;
    // O arranjo foi gerado no quadro da ORIGEM; a igual o lê espelhado (ver `Repeticao`).
    const plano = (p: Point): Point => ({ x: rep.espelhaA ? W - p.x : p.x, y: p.y });
    // ⚠️ O gerador encaixa o retângulo na malha de 50 mm: a borda dele pode ficar até 25 mm DENTRO da unidade.
    // As paredes de borda são reconhecidas pelo retângulo DELE; as pontas das internas que chegam nessa borda
    // são esticadas até a borda da unidade (o eixo das paredes dela) — senão nasciam paredes duplicadas coladas
    // na divisória, e as internas não encostavam nas paredes da unidade.
    const rg = res.retangulo;
    const esticar = (p: Point): Point => ({
      x: Math.abs(p.x - rg.x0) < 60 ? 0 : Math.abs(p.x - rg.x1) < 60 ? W : p.x,
      y: Math.abs(p.y - rg.y0) < 60 ? 0 : Math.abs(p.y - rg.y1) < 60 ? D : p.y,
    });
    const paraDesenho = (p: Point) => {
      const l = plano(p);
      return noMundo(a.q, l.x, l.y);
    };
    // A parede interna passa ALEM_MM de cada ponta para a junção em T existir depois de qualquer arredondamento (o
    // kernel só corta em interseção EXATA): no bloco girado, e na CÓPIA do grupo — girada 90° entre uma asa e outra,
    // o centro da unidade cai em meio milímetro e a cópia ficava até 0,5 mm fora (achado no H: "8 de 11 cômodos").
    // A ponta de 3 mm some no vértice (tolerância de 5 mm do arranjo).
    const pontas = (w: Wall): [Point, Point] => {
      const ea = esticar(w.a);
      const eb = esticar(w.b);
      const l = Math.hypot(eb.x - ea.x, eb.y - ea.y) || 1;
      const dx = ((eb.x - ea.x) / l) * ALEM_MM;
      const dy = ((eb.y - ea.y) / l) * ALEM_MM;
      return [{ x: ea.x - dx, y: ea.y - dy }, { x: eb.x + dx, y: eb.y + dy }];
    };
    const naBorda = (w: Wall) => {
      const on = (p: Point) => Math.abs(p.x - rg.x0) < 2 || Math.abs(p.x - rg.x1) < 2 || Math.abs(p.y - rg.y0) < 2 || Math.abs(p.y - rg.y1) < 2;
      const mesmaLinha = Math.abs(w.a.x - w.b.x) < 2 ? Math.abs(w.a.x - rg.x0) < 2 || Math.abs(w.a.x - rg.x1) < 2 : Math.abs(w.a.y - rg.y0) < 2 || Math.abs(w.a.y - rg.y1) < 2;
      return on(w.a) && on(w.b) && mesmaLinha;
    };
    const paredesGer = res.model.walls.filter((w) => w.levelId === res.levelId);
    const uidDe = new Map<ObjectId, string>();
    let janelas = 0;
    let portas = 0;
    paredesGer.forEach((w, k) => {
      if (naBorda(w)) return;
      const uid = uidDeterministico(`massa:planta:${tipo.uid}:${a.numero}:parede:${k}`);
      uidDe.set(w.id, uid);
      if (viraInstancia) return; // a parede vem como cópia do grupo
      uidsDasParedesDe.set(a.numero, [...(uidsDasParedesDe.get(a.numero) ?? []), uid]);
      const [pa, pb] = pontas(w);
      paredesDaUnidade.push({ type: 'AddWall', levelId: tipo.id, a: paraDesenho(pa), b: paraDesenho(pb), thicknessMm: w.thicknessMm, heightMm: w.heightMm, uid });
    });
    for (const o of res.model.openings) {
      const w = paredesGer.find((x) => x.id === o.wallId);
      if (!w) continue;
      const uid = uidDe.get(w.id);
      if (uid) {
        if (o.kind === 'door') portas++;
        if (viraInstancia) continue; // a porta vem com a parede copiada
        // `a` esticado (e, girado, passado do encontro) anda para trás ao longo da parede: o offset cresce o mesmo tanto.
        const ea = pontas(w)[0];
        const len0 = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
        const anda = ((w.a.x - ea.x) * (w.b.x - w.a.x) + (w.a.y - ea.y) * (w.b.y - w.a.y)) / len0;
        aberturasPendentes.push({ tipo: 'interna', cmd: { type: 'AddOpening', wallId: '', wallUid: uid, kind: o.kind, offsetMm: Math.round(o.offsetMm + anda), widthMm: o.widthMm, heightMm: o.heightMm, sillMm: o.sillMm } });
        continue;
      }
      // Abertura numa parede EXTERNA do gerador: só janela, e só se cai na fachada do bloco. A fachada é uma parede
      // só para o andar — a janela é dela, não do grupo: a igual também põe as suas (na posição espelhada).
      if (o.kind !== 'window') continue;
      const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
      const t = (o.offsetMm + o.widthMm / 2) / len;
      // O centro na borda DO GERADOR (até 25 mm para dentro): esticado até a borda da unidade, onde está a parede.
      const centro = paraDesenho(esticar({ x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t }));
      aberturasPendentes.push({ tipo: 'fachada', centro, widthMm: o.widthMm, heightMm: o.heightMm, sillMm: o.sillMm });
      janelas++;
    }
    if (!viraInstancia) nomesPorUnidade.push({ a, res, plano });
    resumo.push({
      numero: a.numero,
      tipologia: a.tipologiaNome,
      ambientes: res.ambientes.map((x) => ({ nome: x.nome, areaM2: r2(x.areaM2) })),
      origem: membro ? `${agrupar ? 'instância' : 'a mesma planta'} da ${fonte.numero} (${espec ? rotuloDaInstancia(espec) : rep.espelhaA ? 'espelhada' : 'repetida'})` : 'gerada',
      janelas,
      portas,
      semFachada: g.semFachada,
    });
  }

  // ⚠️ LOTE ATÔMICO (`AddWalls`, `AddOpenings`, `PlaceSpaceLabels`): UM comando para as paredes, um para as aberturas,
  // um para os nomes. Cada comando refaz a cauda do kernel (sincronizar as cópias vivas, rederivar os ambientes,
  // conferir os invariantes) — com centenas de comandos unitários, a planta de um bloco em H levava 22–40 s.

  // 1. Paredes internas das unidades desenhadas.
  if (paredesDaUnidade.length) aplicar([{ type: 'AddWalls', walls: paredesDaUnidade.map(({ type: _t, ...w }) => w) }]);

  // 2. Aberturas: as das paredes internas por uid; as da fachada resolvidas na parede do perímetro.
  const paredesTipo = m.walls.filter((w) => w.levelId === tipo.id);
  const fachada = paredesTipo.filter(perimetro);
  const aberturas: Command[] = [];
  let janelasDescartadas = 0;
  for (const p of aberturasPendentes) {
    if (p.tipo === 'interna') {
      aberturas.push(p.cmd);
      continue;
    }
    // Janela: só na parede do PERÍMETRO (fachada). No corredor ou na divisa com o vizinho, não existe.
    const hit = paredeNoPonto(fachada, p.centro);
    if (!hit) {
      janelasDescartadas++;
      continue;
    }
    aberturas.push({ type: 'AddOpening', wallId: hit.w.id, kind: 'window', offsetMm: Math.max(0, Math.round(hit.off - p.widthMm / 2)), widthMm: p.widthMm, heightMm: p.heightMm, sillMm: p.sillMm });
  }
  // O kernel recusa vão sobreposto: confere ANTES (por parede, com folga) e aplica num lote só — aplicar um a um
  // re-sincroniza as cópias vivas a cada comando (medido: 3 s para 5 unidades).
  const ocupado = new Map<string, { ini: number; fim: number }[]>();
  for (const o of m.openings) {
    const w = m.walls.find((x) => x.id === o.wallId);
    if (w) ocupado.set(w.uid, [...(ocupado.get(w.uid) ?? []), { ini: o.offsetMm, fim: o.offsetMm + o.widthMm }]);
  }
  const aceitas: Command[] = [];
  for (const o of aberturas) {
    if (o.type !== 'AddOpening') continue;
    const uid = o.wallUid ?? m.walls.find((x) => x.id === o.wallId)?.uid;
    if (!uid) continue;
    const lista = ocupado.get(uid) ?? [];
    if (lista.some((x) => o.offsetMm < x.fim + 100 && o.offsetMm + o.widthMm > x.ini - 100)) {
      janelasDescartadas++;
      continue;
    }
    ocupado.set(uid, [...lista, { ini: o.offsetMm, fim: o.offsetMm + o.widthMm }]);
    aceitas.push(o);
  }
  try {
    if (aceitas.length) aplicar([{ type: 'AddOpenings', openings: aceitas.map((o) => { const { type: _t, ...resto } = o as Extract<Command, { type: 'AddOpening' }>; return resto; }) }]);
  } catch {
    // Algum vão que a conferência não pegou (fim de parede, por exemplo): cai para um a um.
    for (const o of aceitas) {
      try {
        aplicar([o]);
      } catch {
        janelasDescartadas++;
      }
    }
  }
  if (janelasDescartadas > 0) avisos.push(`${janelasDescartadas} abertura(s) do gerador ficaram de fora (janela que daria para o corredor ou para o vizinho, ou vão sobreposto).`);

  // 3. Os cômodos: a etiqueta de cada um num comando só (a da M6a, que já está num deles, é RENOMEADA — mantém o uid
  // e a unidade), com o tipo de ambiente da NBR 5410; depois a unidade (E2.2) recebe todas as etiquetas dela.
  const etiquetas: Omit<Extract<Command, { type: 'PlaceSpaceLabel' }>, 'type'>[] = [];
  for (const { a, res, plano } of nomesPorUnidade) {
    for (const amb of res.ambientes) {
      const l = plano({ x: (amb.ret.x0 + amb.ret.x1) / 2, y: (amb.ret.y0 + amb.ret.y1) / 2 });
      const c = noMundo(a.q, l.x, l.y);
      if (!m.spaces.some((x) => x.levelId === tipo.id && pointInPolygon(x.ring, c))) continue;
      etiquetas.push({ levelId: tipo.id, at: c, name: amb.nome, tipoDeAmbiente: FICHA_DO_USO[amb.item.uso].tipoNbr5410 });
    }
  }
  if (etiquetas.length) aplicar([{ type: 'PlaceSpaceLabels', labels: etiquetas }]);
  const dentroDaUnidade = (x: { q: QuadroDoBloco; W: number; D: number }, p: Point) => {
    const l = paraLocal(x.q, p);
    return l.a > 0 && l.a < x.W && l.b > 0 && l.b < x.D;
  };
  aplicar(
    nomesPorUnidade.map(({ a }) => ({
      type: 'SetUnidadeProps' as const,
      unidadeId: a.unidadeId,
      labelIds: m.labels.filter((l) => l.levelId === tipo.id && dentroDaUnidade(a, l.at)).map((l) => l.id),
    })),
  );

  // 4. As iguais: um GRUPO por classe (a planta da origem) com uma instância por igual (E2.3).
  const grupos: GrupoDeUnidadesIguais[] = [];
  const etiquetasDaUnidade = (unidadeId: ObjectId) => {
    const u = (m.unidades ?? []).find((x) => x.id === unidadeId);
    return u ? m.labels.filter((l) => l.levelId === tipo.id && u.etiquetaUids.includes(l.uid)) : [];
  };
  for (const c of classes) {
    const iguais = c.membros.filter((x) => instancias.has(x.a.numero));
    if (iguais.length === 0) continue;
    const etiquetasDaOrigem = etiquetasDaUnidade(c.origem.unidadeId);
    const paredesDaOrigem = (uidsDasParedesDe.get(c.origem.numero) ?? []).map((uid) => m.walls.find((w) => w.uid === uid)?.id).filter((id): id is ObjectId => !!id);
    if (etiquetasDaOrigem.length < 2 || paredesDaOrigem.length === 0) throw new FalhaDoGrupo(`a planta da ${c.origem.numero} não fechou`);
    const especs = iguais.map((x) => instanciaEntreUnidades(c.origem.q, x.a.q, x.rep));
    if (especs.some((x) => !x)) throw new FalhaDoGrupo(`a ${c.origem.numero} não se repete nas iguais pelos eixos do desenho`);
    // A etiqueta única que a M6a pôs em cada igual sai: a instância traz os cômodos copiados, e duas etiquetas
    // no mesmo ambiente seriam duas identidades. (Um a um: tirar uma rederiva os ambientes.)
    for (const x of iguais) {
      for (const l of etiquetasDaUnidade(x.a.unidadeId)) {
        const s = m.spaces.find((sp) => sp.levelId === tipo.id && sp.labelUid === l.uid);
        if (s) aplicar([{ type: 'NameSpace', spaceId: s.id, name: '' }]);
      }
    }
    const nome = `Planta ${c.origem.tipologiaNome}`.slice(0, 32) + ` (${c.origem.numero})`;
    try {
      aplicar([
        {
          type: 'AddGrupo',
          nome: nome.slice(0, 40),
          wallIds: paredesDaOrigem,
          labelIds: etiquetasDaOrigem.map((l) => l.id),
          pivo: especs[0]!.pivo,
          instancias: especs.map((x) => ({ translacao: x!.translacao, rotacaoGraus: x!.rotacaoGraus, espelho: x!.espelho })),
        },
      ]);
    } catch (e) {
      throw new FalhaDoGrupo(e instanceof Error ? e.message : String(e));
    }
    // Os cômodos copiados passam a ser a unidade da M6a (o mesmo número).
    aplicar(
      iguais.map((x) => ({
        type: 'SetUnidadeProps' as const,
        unidadeId: x.a.unidadeId,
        labelIds: m.labels.filter((l) => l.levelId === tipo.id && dentroDaUnidade(x.a, l.at)).map((l) => l.id),
      })),
    );
    // Conferência: cada igual com os mesmos cômodos da origem, todos fechados.
    for (const x of iguais) {
      const ets = etiquetasDaUnidade(x.a.unidadeId);
      const fechados = ets.filter((l) => m.spaces.some((s) => s.levelId === tipo.id && s.labelUid === l.uid)).length;
      if (ets.length !== etiquetasDaOrigem.length || fechados !== ets.length) throw new FalhaDoGrupo(`a ${x.a.numero} saiu com ${fechados} de ${etiquetasDaOrigem.length} cômodos`);
    }
    grupos.push({ nome: nome.slice(0, 40), origem: c.origem.numero, iguais: iguais.map((x, k) => ({ numero: x.a.numero, repeticao: rotuloDaInstancia(especs[k]!) })) });
  }

  const semLuz = resumo.reduce((n, u) => n + u.semFachada.length, 0);
  if (semLuz > 0) avisos.push(`${semLuz} cômodo(s) que pedem luz ficaram sem fachada (sem onde pôr janela): o gerador é de casa, e a unidade rasa e larga não cabe no zoneamento dele — ajuste à mão (a lista está por unidade).`);
  return { comandos, model: m, unidades: resumo, geracoes, grupos, avisos };
}
