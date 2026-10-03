/**
 * ESTUDO DE MASSA — DA MASSA AO PAVIMENTO TIPO (fase M6a do plano
 * `2026-10-01-estudo-de-massa.md`, §19 e §20 do pedido).
 *
 * Do BLOCO de massa e do PRODUTO distribuído nele (M2: quantas unidades de
 * cada tipologia cabem no pavimento tipo), o PAVIMENTO TIPO esquemático:
 *
 *  - ESQUEMA: corredor central (unidades dos dois lados) quando a
 *    profundidade comporta duas unidades de pelo menos 6 m + o corredor;
 *    senão corredor lateral (unidades de um lado só).
 *  - NÚCLEO: elevadores (ficha de 8 passageiros, NBR NM 207), shaft e escada
 *    numa fatia do lado A, onde a divisão das unidades cai mais perto do meio;
 *    o comprimento dela sai da área do núcleo da M2.
 *  - UNIDADES: fatias ao longo do eixo maior, com a largura proporcional à
 *    área alvo da tipologia, ajustadas para preencher cada lado. As de ponta
 *    são de CANTO; a orientação de cada uma é a da fachada (azimute da normal
 *    externa, com o norte do estudo) — é o que o Empreendimento recebe como
 *    `position_type` e `sun_orientation`.
 *
 * A montagem (`montarPavimentoTipo`) põe isso no kernel: um pavimento novo na
 * cota do 2º pavimento do bloco (o térreo fica com o projetista — portaria,
 * lazer, pilotis), paredes externas, do corredor e entre unidades, a porta de
 * cada unidade, o núcleo e a escada, cada unidade como `Unidade` (E2.2) com o
 * número do andar, e os demais pavimentos como CÓPIAS VIVAS do tipo (E2.1) —
 * o quantitativo e o IFC contam todos os andares.
 *
 * ─── ESTE MÓDULO É PURO ─────────────────────────────────────────────────────
 *
 * Os ids do kernel são determinísticos: quem chama simula com `applyBatch` e
 * aplica a MESMA lista de comandos no editor — os ids batem. A planta INTERNA
 * de cada unidade (o gerador da E6.2 dentro da fatia) é a etapa seguinte (M6b).
 *
 * Fora, dito: o pavimento térreo. Bloco em L, U, T ou H tem o caminho próprio
 * (`blueprintPavimentoOrtogonal`, pendências de 03/10/2026) — quem chama usa
 * `dividirPavimentoDoBloco`/`montarPavimentoTipoDoBloco`, que escolhem.
 */
import { applyBatch, pointInPolygon, signedArea, uidDeterministico, type BlueprintModel, type Bloco, type Command, type Level, type ObjectId, type Point, type Wall } from './blueprintKernel';
import { divisasDoLote, medirTerreno } from './blueprintTerreno';
import { azimuteDaDirecao, pontoCardeal, type PontoCardeal } from './blueprintGrafoEspacial';
import { FICHA_DO_ELEVADOR } from './blueprintNucleoVertical';
import type { Produto } from './blueprintProduto';
import type { PlanoOrtogonal } from './blueprintPavimentoOrtogonal';

/** "301", "1202"; o 1º pavimento acima do solo é o térreo: "T01". (A mesma regra do envio ao Empreendimento.) */
export function nomeDaUnidadeDaMassa(ordinal: number, posicao: number): string {
  const andar = ordinal - 1;
  const pos = String(posicao).padStart(2, '0');
  return andar <= 0 ? `T${pos}` : `${andar}${pos}`;
}

export interface HipotesesDoPavimentoTipo {
  corredorMm: number;
  paredeExternaMm: number;
  paredeInternaMm: number;
  /** Abaixo disto a unidade não tem profundidade de apartamento. */
  profundidadeMinDaUnidadeMm: number;
  portaMm: number;
  alturaPortaMm: number;
  larguraDaEscadaMm: number;
}

export const HIPOTESES_DO_PAVIMENTO_TIPO_PADRAO: HipotesesDoPavimentoTipo = {
  corredorMm: 1500,
  paredeExternaMm: 200,
  paredeInternaMm: 150,
  profundidadeMinDaUnidadeMm: 6000,
  portaMm: 900,
  alturaPortaMm: 2100,
  larguraDaEscadaMm: 1200,
};

/** `ASAS`: bloco em L, U, T ou H — um corredor por asa, ligados nos nós (`blueprintPavimentoOrtogonal`). */
export type EsquemaDoPavimento = 'CORREDOR_CENTRAL' | 'CORREDOR_LATERAL' | 'ASAS';
export const ROTULO_DO_ESQUEMA: Record<EsquemaDoPavimento, string> = { CORREDOR_CENTRAL: 'corredor central', CORREDOR_LATERAL: 'corredor lateral', ASAS: 'asas (L, U, T, H) com os corredores ligados nos nós' };

/** Quanto a parede interna de bloco GIRADO passa do encontro (< tolerância de 5 mm do arranjo) — ver `montarPavimentoTipo`. */
export const ALEM_MM = 3;

/** Retângulo no quadro do bloco: `a` ao longo do eixo maior, `b` atravessa (0 = fachada do lado A). */
export interface RetLocal {
  a0: number;
  b0: number;
  a1: number;
  b1: number;
}

export interface UnidadeDoPavimento {
  /** A mesma posição do envio ao Empreendimento: tipologias na ordem do produto. */
  posicao: number;
  numero: string;
  tipologiaId: string;
  tipologiaNome: string;
  anel: Point[];
  /** Área da fatia entre os eixos das paredes, m². */
  areaM2: number;
  alvoM2: number;
  lado: 'A' | 'B';
  canto: boolean;
  fachadaAzimuteGraus: number;
  orientacao: PontoCardeal;
  /** Para o Empreendimento (`sun_orientation`): o ponto cardeal principal mais perto da fachada. */
  solCardinal: 'NORTE' | 'SUL' | 'LESTE' | 'OESTE';
  /** Para o Empreendimento (`position_type`): a fachada olha para a rua, para o lado ou para os fundos; null sem divisa FRENTE. */
  posicaoNoLote: 'FRENTE' | 'LATERAL' | 'FUNDOS' | null;
  /** Interno: o retângulo no quadro do bloco. */
  local: RetLocal;
}

export interface DivisaoDoPavimento {
  blocoId: ObjectId;
  nomeDoBloco: string;
  esquema: EsquemaDoPavimento;
  larguraM: number;
  profundidadeM: number;
  /** Ordinal do pavimento tipo no prédio (2 = o primeiro acima do térreo). */
  ordinalDoTipo: number;
  unidades: UnidadeDoPavimento[];
  elevadores: number;
  decisoes: string[];
  avisos: string[];
  /** Internos: o quadro e as fatias de corredor e núcleo. */
  quadro: QuadroDoBloco;
  corredor: RetLocal;
  nucleo: RetLocal | null;
  profundidades: { a: number; b: number };
  /** Bloco em L, U, T ou H: o plano das regiões (corredores, núcleo, áreas comuns, partes de cada unidade). */
  ortogonal?: PlanoOrtogonal;
}

export interface QuadroDoBloco {
  o: Point;
  u: Point;
  v: Point;
  W: number;
  D: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const f1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('pt-BR');

/** O quadro do bloco retangular: origem num canto, `u` ao longo do lado maior, `v` para dentro. Null se não é retângulo. */
export function quadroDoBloco(b: Pick<Bloco, 'pontos'>): QuadroDoBloco | null {
  if (b.pontos.length !== 4) return null;
  const [p0, p1, p2, p3] = b.pontos;
  const e0 = { x: p1.x - p0.x, y: p1.y - p0.y };
  const e1 = { x: p2.x - p1.x, y: p2.y - p1.y };
  const l0 = Math.hypot(e0.x, e0.y);
  const l1 = Math.hypot(e1.x, e1.y);
  if (l0 < 1 || l1 < 1) return null;
  if (Math.abs(e0.x * e1.x + e0.y * e1.y) / (l0 * l1) > 0.01) return null;
  // p3 tem de fechar o retângulo (a menos do arredondamento do mm).
  if (Math.hypot(p0.x + e1.x - p3.x, p0.y + e1.y - p3.y) > 5) return null;
  if (l0 >= l1) return { o: p0, u: { x: e0.x / l0, y: e0.y / l0 }, v: { x: e1.x / l1, y: e1.y / l1 }, W: l0, D: l1 };
  return { o: p1, u: { x: e1.x / l1, y: e1.y / l1 }, v: { x: -e0.x / l0, y: -e0.y / l0 }, W: l1, D: l0 };
}

const noMundo = (q: QuadroDoBloco, a: number, b: number): Point => ({ x: Math.round(q.o.x + q.u.x * a + q.v.x * b), y: Math.round(q.o.y + q.u.y * a + q.v.y * b) });
const anelDe = (q: QuadroDoBloco, r: RetLocal): Point[] => [noMundo(q, r.a0, r.b0), noMundo(q, r.a1, r.b0), noMundo(q, r.a1, r.b1), noMundo(q, r.a0, r.b1)];

export interface EntradaDaDivisao {
  bloco: Bloco;
  produto: Produto;
  /** Unidades por tipologia no pavimento tipo (a distribuição da M2). */
  porTipologia: Record<string, number>;
  /** Área do núcleo por pavimento (M2) e quantos elevadores. */
  nucleoM2: number;
  elevadores: number;
  ordinalDoTipo: number;
  rotacaoNorteDeg: number | null;
  /** Unitário, do lote para a rua (a normal externa da divisa FRENTE); null sem frente marcada. */
  direcaoDaRua?: Point | null;
}

/** A direção da rua: do centro do lote para o meio da divisa FRENTE mais longa (unitária); null sem frente. */
export function direcaoDaRua(model: BlueprintModel): Point | null {
  const terreno = medirTerreno(divisasDoLote(model.boundaries));
  if (!terreno || terreno.anel.length < 3) return null;
  const doLote = new Set(terreno.ladosIds);
  const f = model.boundaries.filter((b) => doLote.has(b.id) && b.papel === 'FRENTE').sort((a, b) => Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y) - Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y))[0];
  if (!f) return null;
  const c = terreno.anel.reduce((s, p) => ({ x: s.x + p.x / terreno.anel.length, y: s.y + p.y / terreno.anel.length }), { x: 0, y: 0 });
  const dx = (f.a.x + f.b.x) / 2 - c.x;
  const dy = (f.a.y + f.b.y) / 2 - c.y;
  const l = Math.hypot(dx, dy);
  return l > 0 ? { x: dx / l, y: dy / l } : null;
}

const CARDINAIS = ['NORTE', 'LESTE', 'SUL', 'OESTE'] as const;

export type ResultadoDaDivisao = { ok: true; divisao: DivisaoDoPavimento } | { ok: false; motivo: string };

export function dividirPavimento(e: EntradaDaDivisao, hipParcial: Partial<HipotesesDoPavimentoTipo> = {}): ResultadoDaDivisao {
  const hip = { ...HIPOTESES_DO_PAVIMENTO_TIPO_PADRAO, ...hipParcial };
  const q = quadroDoBloco(e.bloco);
  if (!q) return { ok: false, motivo: `"${e.bloco.nome}" não é um retângulo: este é o caminho do bloco retangular — L, U, T e H vão por \`dividirPavimentoDoBloco\`.` };
  const lista: { t: Produto['tipologias'][number] }[] = [];
  for (const t of e.produto.tipologias) for (let k = 0; k < (e.porTipologia[t.id] ?? 0); k++) lista.push({ t });
  if (lista.length === 0) return { ok: false, motivo: `"${e.bloco.nome}" não recebe unidade no pavimento tipo (sem produto do uso do bloco, ou o pavimento é pequeno para o mix).` };

  const decisoes: string[] = [];
  const avisos: string[] = [];
  const { W, D } = q;
  const central = D >= 2 * hip.profundidadeMinDaUnidadeMm + hip.corredorMm;
  const esquema: EsquemaDoPavimento = central ? 'CORREDOR_CENTRAL' : 'CORREDOR_LATERAL';
  const dA = central ? (D - hip.corredorMm) / 2 : D - hip.corredorMm;
  const dB = central ? dA : 0;
  if (dA < 4000) return { ok: false, motivo: `"${e.bloco.nome}" tem ${f1(D / 1000)} m de profundidade: tirando o corredor de ${f1(hip.corredorMm / 1000)} m, a unidade ficaria com menos de 4 m.` };
  decisoes.push(
    `${e.bloco.nome}: ${f1(W / 1000)} × ${f1(D / 1000)} m → ${ROTULO_DO_ESQUEMA[esquema]} de ${f1(hip.corredorMm / 1000)} m ao longo do lado maior; unidades com ${f1(dA / 1000)} m de profundidade${central ? ' dos dois lados' : ' de um lado só'}${central ? '' : ` (a profundidade não comporta duas unidades de ${f1(hip.profundidadeMinDaUnidadeMm / 1000)} m + corredor)`}.`,
  );

  // Núcleo: a área da M2 numa fatia do lado A (mínimo 4 m, no máximo 40 % do comprimento).
  const temNucleo = e.nucleoM2 > 0;
  // A fatia comporta as PEÇAS: os elevadores lado a lado (caixa da ficha de 8 + 10 cm), o shaft de 1 m e as folgas.
  const caixa = FICHA_DO_ELEVADOR.find((f) => f.capacidade === 8)!.caixaMm[0];
  const pelasPecas = 200 + e.elevadores * (caixa + 100) + 1000 + 200;
  const Ln = temNucleo ? Math.min(W * 0.4, Math.max(4000, pelasPecas, (e.nucleoM2 * 1e6) / dA)) : 0;
  if (temNucleo) decisoes.push(`Núcleo de ${f1(e.nucleoM2)} m² (M2) → fatia de ${f1(Ln / 1000)} m no lado A: ${e.elevadores} elevador(es), shaft e escada.`);

  // Repartição entre os lados: cada unidade vai para o lado menos cheio (pela largura alvo).
  const capA = W - Ln;
  const capB = central ? W : 0;
  const ladoA: number[] = [];
  const ladoB: number[] = [];
  let somaA = 0;
  let somaB = 0;
  const largura = (i: number, d: number) => (lista[i].t.areaPrivativaM2 * 1e6) / d;
  lista.forEach((_, i) => {
    const wa = largura(i, dA);
    const wb = central ? largura(i, dB) : Infinity;
    const ra = capA > 0 ? (somaA + wa) / capA : Infinity;
    const rb = capB > 0 ? (somaB + wb) / capB : Infinity;
    if (rb < ra) {
      ladoB.push(i);
      somaB += wb;
    } else {
      ladoA.push(i);
      somaA += wa;
    }
  });

  const unidades: UnidadeDoPavimento[] = [];
  const pos = new Map<number, RetLocal>();
  const ajuste = (soma: number, cap: number, rot: string) => {
    if (soma <= 0) return 1;
    const f = cap / soma;
    if (f < 0.9) avisos.push(`Lado ${rot}: as unidades ficaram ${f1((1 - f) * 100)} % menores que a área alvo para caber.`);
    else if (f > 1.15) avisos.push(`Lado ${rot}: as unidades ficaram ${f1((f - 1) * 100)} % maiores que a área alvo (sobra comprimento — confira o mix).`);
    return f;
  };
  // Lado A: o núcleo entra onde a divisão das unidades cai mais perto do meio.
  const fA = ajuste(somaA, capA, 'A');
  let nucleo: RetLocal | null = null;
  {
    let melhorK = 0;
    let melhorErro = Infinity;
    let acc = 0;
    for (let k = 0; k <= ladoA.length; k++) {
      const erro = Math.abs(acc + Ln / 2 - W / 2);
      if (erro < melhorErro) {
        melhorErro = erro;
        melhorK = k;
      }
      if (k < ladoA.length) acc += largura(ladoA[k], dA) * fA;
    }
    let a = 0;
    ladoA.forEach((i, k) => {
      if (k === melhorK && temNucleo) {
        nucleo = { a0: a, b0: 0, a1: a + Ln, b1: dA };
        a += Ln;
      }
      const w = largura(i, dA) * fA;
      pos.set(i, { a0: a, b0: 0, a1: a + w, b1: dA });
      a += w;
    });
    if (temNucleo && melhorK === ladoA.length) nucleo = { a0: a, b0: 0, a1: a + Ln, b1: dA };
    if (ladoA.length === 0 && temNucleo) nucleo = { a0: (W - Ln) / 2, b0: 0, a1: (W + Ln) / 2, b1: dA };
  }
  if (ladoA.length === 0) avisos.push('Lado A sem unidade: fica como área comum.');
  if (central) {
    const fB = ajuste(somaB, capB, 'B');
    let a = 0;
    for (const i of ladoB) {
      const w = largura(i, dB) * fB;
      pos.set(i, { a0: a, b0: D - dB, a1: a + w, b1: D });
      a += w;
    }
    if (ladoB.length === 0) avisos.push('Lado B sem unidade: fica como área comum.');
  }

  const normalA = { x: -q.v.x, y: -q.v.y };
  const normalB = { x: q.v.x, y: q.v.y };
  lista.forEach(({ t }, i) => {
    const r = pos.get(i)!;
    const lado: 'A' | 'B' = r.b0 < 1 ? 'A' : 'B';
    const normal = lado === 'A' ? normalA : normalB;
    const az = azimuteDaDirecao(normal, e.rotacaoNorteDeg);
    const rua = e.direcaoDaRua ?? null;
    const cosRua = rua ? normal.x * rua.x + normal.y * rua.y : null;
    unidades.push({
      posicao: i + 1,
      numero: nomeDaUnidadeDaMassa(e.ordinalDoTipo, i + 1),
      tipologiaId: t.id,
      tipologiaNome: t.nome,
      anel: anelDe(q, r),
      areaM2: r2(((r.a1 - r.a0) * (r.b1 - r.b0)) / 1e6),
      alvoM2: t.areaPrivativaM2,
      lado,
      canto: r.a0 < 1 || r.a1 > W - 1,
      fachadaAzimuteGraus: az,
      orientacao: pontoCardeal(az),
      solCardinal: CARDINAIS[Math.round((((az % 360) + 360) % 360) / 90) % 4],
      posicaoNoLote: cosRua == null ? null : cosRua > 0.7 ? 'FRENTE' : cosRua < -0.7 ? 'FUNDOS' : 'LATERAL',
      local: r,
    });
  });
  decisoes.push(
    `${unidades.length} unidade(s) no pavimento tipo (${unidades.filter((u) => u.canto).length} de canto): ${e.produto.tipologias
      .filter((t) => (e.porTipologia[t.id] ?? 0) > 0)
      .map((t) => `${e.porTipologia[t.id]} × ${t.nome}`)
      .join(', ')}.`,
  );
  const corredor: RetLocal = central ? { a0: 0, b0: dA, a1: W, b1: D - dB } : { a0: 0, b0: dA, a1: W, b1: D };
  return {
    ok: true,
    divisao: { blocoId: e.bloco.id, nomeDoBloco: e.bloco.nome, esquema, larguraM: r2(W / 1000), profundidadeM: r2(D / 1000), ordinalDoTipo: e.ordinalDoTipo, unidades, elevadores: e.elevadores, decisoes, avisos, quadro: q, corredor, nucleo, profundidades: { a: dA, b: dB } },
  };
}

// ─── A montagem no kernel ────────────────────────────────────────────────────

export interface PavimentoTipoMontado {
  /** UMA lista: aplicada de uma vez no modelo de origem, dá os mesmos ids da simulação. */
  comandos: Command[];
  model: BlueprintModel;
  tipoLevelId: ObjectId;
  copias: number;
  /** Área do ambiente de cada unidade no desenho (o anel do arranjo, entre os EIXOS das paredes), m². */
  areasDesenhadas: { numero: string; areaM2: number }[];
  eficienciaDesenhadaPct: number | null;
  avisos: string[];
}

/** A parede (do pavimento) cujo eixo contém o ponto; offset ao longo dela. */
function paredeNoPonto(paredes: readonly Wall[], p: Point): { w: Wall; off: number; len: number } | null {
  for (const w of paredes) {
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const t = ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / len;
    const dist = Math.abs((p.x - w.a.x) * dy - (p.y - w.a.y) * dx) / len;
    if (dist <= 3 && t >= 0 && t <= len) return { w, off: t, len };
  }
  return null;
}

/** As cotas dos pavimentos ACIMA DO SOLO do bloco (absolutas). */
export function pisosAcimaDoSolo(model: BlueprintModel, b: Bloco): number[] {
  const elev = model.levels.find((l) => l.id === b.levelId)?.elevationMm ?? 0;
  const base = elev + b.cotaBaseMm;
  const out: number[] = [];
  for (let i = 0; i < b.pavimentos; i++) if (base + i * b.peDireitoMm >= 0) out.push(base + i * b.peDireitoMm);
  return out;
}

/**
 * A identidade do pavimento tipo de UM bloco: uid derivado do bloco. É o que
 * impede montar duas vezes — achado da prova no app real: montar e depois
 * criar a alternativa empilhava um segundo tipo (e, com o núcleo já desenhado
 * contando menos área, ainda nascia uma unidade a mais).
 */
export function uidDoPavimentoTipo(b: Pick<Bloco, 'uid'>): string {
  return uidDeterministico(`massa:pavimento-tipo:${b.uid}`);
}

/** O pavimento tipo já montado deste bloco, ou null. */
export function pavimentoTipoMontado(model: BlueprintModel, b: Pick<Bloco, 'uid'>): Level | null {
  const uid = uidDoPavimentoTipo(b);
  return model.levels.find((l) => l.uid === uid) ?? null;
}

/** Ordinal do pavimento tipo: o 2º acima do solo quando há; senão o 1º. */
export function ordinalDoTipo(model: BlueprintModel, b: Bloco): number {
  return pisosAcimaDoSolo(model, b).length >= 2 ? 2 : 1;
}

export function montarPavimentoTipo(model: BlueprintModel, b: Bloco, d: DivisaoDoPavimento, hipParcial: Partial<HipotesesDoPavimentoTipo> = {}): PavimentoTipoMontado {
  const hip = { ...HIPOTESES_DO_PAVIMENTO_TIPO_PADRAO, ...hipParcial };
  const avisos: string[] = [];
  const ja = pavimentoTipoMontado(model, b);
  if (ja) throw new Error(`O pavimento tipo de "${b.nome}" já está montado ("${ja.name}"). Para refazer, remova esse pavimento (as cópias se desvinculam) e monte de novo.`);
  const q = d.quadro;
  const pisos = pisosAcimaDoSolo(model, b);
  const iTipo = Math.min(pisos.length, d.ordinalDoTipo) - 1;
  const comandos: Command[] = [];
  let m = model;
  const aplicar = (cs: Command[]) => {
    if (cs.length === 0) return;
    m = applyBatch(m, cs).model;
    comandos.push(...cs);
  };

  // 1. O pavimento tipo.
  aplicar([{ type: 'AddLevel', name: `${b.nome} · ${d.ordinalDoTipo}º pav (tipo)`.slice(0, 60), elevationMm: pisos[iTipo] ?? 0, defaultHeightMm: b.peDireitoMm, uid: uidDoPavimentoTipo(b) }]);
  const tipo = m.levels[m.levels.length - 1].id;

  // 2. Paredes: perímetro, corredor e divisórias (pelas bordas das fatias, sem repetir).
  const { W, D } = q;
  const seg = (a0: number, b0: number, a1: number, b1: number, esp: number): Command => ({ type: 'AddWall', levelId: tipo, a: noMundo(q, a0, b0), b: noMundo(q, a1, b1), thicknessMm: esp, heightMm: b.peDireitoMm });
  /**
   * ⚠️ BLOCO GIRADO: o kernel só corta parede em interseção EXATA, e a ponta de
   * uma divisória arredondada ao mm fica a < 1 mm da parede que ela devia tocar
   * — a junção em T não acontece e os ambientes se fundem (achado do teste da
   * M6b: no estudo girado, 101 e 103 ficaram sem ambiente). Girado, a parede
   * interna passa ALÉM_MM de cada encontro: elas se cruzam de verdade, e a ponta
   * de 3 mm some no vértice (a tolerância do arranjo é 5 mm). Alinhado ao
   * desenho, nada muda.
   */
  const girado = Math.abs(q.u.x * q.u.y) > 1e-9;
  const segInterna = (a0: number, b0: number, a1: number, b1: number, esp: number): Command => {
    if (!girado) return seg(a0, b0, a1, b1, esp);
    const l = Math.hypot(a1 - a0, b1 - b0) || 1;
    const da = ((a1 - a0) / l) * ALEM_MM;
    const db = ((b1 - b0) / l) * ALEM_MM;
    return seg(a0 - da, b0 - db, a1 + da, b1 + db, esp);
  };
  const paredes: Command[] = [seg(0, 0, W, 0, hip.paredeExternaMm), seg(W, 0, W, D, hip.paredeExternaMm), seg(W, D, 0, D, hip.paredeExternaMm), seg(0, D, 0, 0, hip.paredeExternaMm)];
  paredes.push(segInterna(0, d.corredor.b0, W, d.corredor.b0, hip.paredeInternaMm));
  if (d.esquema === 'CORREDOR_CENTRAL') paredes.push(segInterna(0, d.corredor.b1, W, d.corredor.b1, hip.paredeInternaMm));
  const fatias = [...d.unidades.map((u) => u.local), ...(d.nucleo ? [d.nucleo] : [])];
  for (const lado of ['A', 'B'] as const) {
    const doLado = fatias.filter((r) => (lado === 'A' ? r.b0 < 1 : r.b0 >= 1));
    const cortes = new Set<number>();
    for (const r of doLado) for (const a of [r.a0, r.a1]) if (a > 1 && a < W - 1) cortes.add(Math.round(a));
    const [b0, b1] = lado === 'A' ? [0, d.profundidades.a] : [D - d.profundidades.b, D];
    if (lado === 'B' && d.profundidades.b <= 0) continue;
    for (const a of [...cortes].sort((x, y) => x - y)) paredes.push(segInterna(a, b0, a, b1, hip.paredeInternaMm));
  }
  aplicar(paredes);

  // 3. Os ambientes: unidade por unidade (Unidade + etiqueta), corredor e núcleo nomeados.
  const espacoEm = (r: { a0: number; b0: number; a1: number; b1: number }) => {
    const c = noMundo(q, (r.a0 + r.a1) / 2, (r.b0 + r.b1) / 2);
    return m.spaces.find((s) => s.levelId === tipo && pointInPolygon(s.ring, c)) ?? null;
  };
  const nomes: Command[] = [];
  const corr = espacoEm(d.corredor);
  if (corr) nomes.push({ type: 'NameSpace', spaceId: corr.id, name: 'Circulação' });
  const nuc = d.nucleo ? espacoEm(d.nucleo) : null;
  if (nuc) nomes.push({ type: 'NameSpace', spaceId: nuc.id, name: 'Núcleo (escada e elevadores)' });
  const numerosLivres = d.unidades.filter((u) => !(m.unidades ?? []).some((x) => x.numero === u.numero));
  if (numerosLivres.length < d.unidades.length) avisos.push('Algumas unidades já existiam com o mesmo número no estudo: não foram recriadas.');
  aplicar([...nomes, ...numerosLivres.map((u): Command => ({ type: 'AddUnidade', numero: u.numero, tipologia: u.tipologiaNome }))]);
  const vinculos: Command[] = [];
  for (const u of numerosLivres) {
    const s = espacoEm(u.local);
    const und = (m.unidades ?? []).find((x) => x.numero === u.numero);
    if (!s || !und) {
      avisos.push(`Unidade ${u.numero}: o ambiente não fechou no desenho.`);
      continue;
    }
    vinculos.push({ type: 'SetUnidadeDoAmbiente', spaceId: s.id, unidadeId: und.id, nome: `Apto ${u.numero}` });
  }
  aplicar(vinculos);

  // 4. Portas: cada unidade abre para o corredor; o núcleo também.
  const paredesDoTipo = () => m.walls.filter((w) => w.levelId === tipo);
  const portas: Command[] = [];
  const ocupados = new Map<ObjectId, { ini: number; fim: number }[]>();
  const abrir = (r: { a0: number; b0: number; a1: number; b1: number }, rotulo: string) => {
    const bPorta = r.b0 < 1 ? d.corredor.b0 : d.corredor.b1;
    const hit = paredeNoPonto(paredesDoTipo(), noMundo(q, (r.a0 + r.a1) / 2, bPorta));
    if (!hit) {
      avisos.push(`${rotulo}: não achei a parede do corredor para a porta.`);
      return;
    }
    // A fatia na parede (projeção dos dois cantos), com folga das divisórias.
    const p0 = paredeNoPonto([hit.w], noMundo(q, r.a0, bPorta));
    const p1 = paredeNoPonto([hit.w], noMundo(q, r.a1, bPorta));
    const lo = Math.min(p0?.off ?? 0, p1?.off ?? hit.len) + 250;
    const hi = Math.max(p0?.off ?? 0, p1?.off ?? hit.len) - 250;
    if (hi - lo < hip.portaMm) {
      avisos.push(`${rotulo}: a frente para o corredor é estreita para a porta.`);
      return;
    }
    const off = Math.round(Math.min(hi - hip.portaMm, Math.max(lo, hit.off - hip.portaMm / 2)));
    const lista = ocupados.get(hit.w.id) ?? [];
    if (lista.some((o) => off < o.fim + 100 && off + hip.portaMm > o.ini - 100)) return;
    ocupados.set(hit.w.id, [...lista, { ini: off, fim: off + hip.portaMm }]);
    portas.push({ type: 'AddOpening', wallId: hit.w.id, kind: 'door', offsetMm: off, widthMm: hip.portaMm, heightMm: hip.alturaPortaMm, sillMm: 0 });
  };
  for (const u of d.unidades) abrir(u.local, `Unidade ${u.numero}`);
  if (d.nucleo) abrir(d.nucleo, 'Núcleo');
  aplicar(portas);

  // 5. Núcleo: elevadores encostados no corredor, shaft ao lado, escada no fundo da fatia.
  if (d.nucleo) {
    const n = d.nucleo;
    const ficha = FICHA_DO_ELEVADOR.find((f) => f.capacidade === 8)!;
    const [ew, ed] = ficha.caixaMm;
    const pecas: Command[] = [];
    let a = n.a0 + 200;
    const bElev = n.b1 - ed - 200; // encostado no corredor (b1 é a parede do corredor no lado A)
    for (let i = 0; i < d.elevadores; i++) {
      if (a + ew > n.a1 - 200) {
        avisos.push('O núcleo não comporta todos os elevadores na fatia.');
        break;
      }
      pecas.push({ type: 'AddNucleo', levelId: tipo, tipo: 'ELEVADOR', ring: anelDe(q, { a0: a, b0: bElev, a1: a + ew, b1: bElev + ed }), rotulo: `${b.nome} · E${i + 1}`.slice(0, 40), capacidade: 8, pocoMm: ficha.pocoMm, casaDeMaquinasMm: ficha.casaDeMaquinasMm });
      a += ew + 100;
    }
    if (a + 1000 <= n.a1 - 200) pecas.push({ type: 'AddNucleo', levelId: tipo, tipo: 'SHAFT', ring: anelDe(q, { a0: a, b0: bElev, a1: a + 1000, b1: bElev + 1000 }), rotulo: `${b.nome} · shaft`.slice(0, 40) });
    const bEsc = n.b0 + 200 + hip.larguraDaEscadaMm / 2;
    if (bEsc + hip.larguraDaEscadaMm / 2 < bElev - 200) {
      pecas.push({ type: 'AddEscada', levelId: tipo, pontos: [noMundo(q, n.a0 + 300, bEsc), noMundo(q, n.a1 - 300, bEsc)], larguraMm: hip.larguraDaEscadaMm, rotulo: `${b.nome} · escada` });
    } else avisos.push('A fatia do núcleo é rasa para escada e elevadores: a escada ficou para o projetista.');
    aplicar(pecas);
  }

  // 6. Os demais pavimentos como cópias vivas do tipo.
  const copias: Command[] = [];
  for (let i = iTipo + 1; i < pisos.length; i++) copias.push({ type: 'AddLevel', name: `${b.nome} · ${i + 1}º pav`.slice(0, 60), elevationMm: pisos[i], defaultHeightMm: b.peDireitoMm, tipoDeId: tipo, uid: uidDeterministico(`massa:pavimento-tipo:${b.uid}:copia:${i + 1}`) });
  aplicar(copias);
  if (iTipo > 0) avisos.push(`O ${iTipo === 1 ? '1º pavimento (térreo)' : 'pavimento abaixo do tipo'} ficou para o projetista: portaria, lazer, pilotis.`);

  // Áreas desenhadas.
  const areasDesenhadas = d.unidades.map((u) => {
    const s = m.spaces.find((x) => x.levelId === tipo && pointInPolygon(x.ring, noMundo(q, (u.local.a0 + u.local.a1) / 2, (u.local.b0 + u.local.b1) / 2)));
    return { numero: u.numero, areaM2: s ? r2(Math.abs(signedArea(s.ring)) / 1e6) : 0 };
  });
  const somaUnidades = areasDesenhadas.reduce((s, x) => s + x.areaM2, 0);
  return { comandos, model: m, tipoLevelId: tipo, copias: copias.length, areasDesenhadas, eficienciaDesenhadaPct: W * D > 0 ? Math.round((somaUnidades / ((W * D) / 1e6)) * 1000) / 10 : null, avisos };
}
