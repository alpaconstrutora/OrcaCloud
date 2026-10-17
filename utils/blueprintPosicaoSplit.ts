/**
 * POSIÇÃO AUTOMÁTICA DO SPLIT (04/10/2026, E4.2 + E4.3 do roadmap de
 * climatização — "vai além").
 *
 * Para cada ambiente climatizado SEM equipamento (ou só com o que este mesmo
 * planejador sugeriu antes), o modelo escolhido pela seleção (E4.1) vira:
 *  - a EVAPORADORA numa parede livre do ambiente — sem porta, fora dos vãos,
 *    de preferência a parede EXTERNA (a linha frigorígena sai mais curta) e,
 *    entre as que servem, a de maior trecho livre —, a 2,20 m, encostada na
 *    face e girada para soprar para dentro;
 *  - a CONDENSADORA do lado de FORA dessa parede externa (ou da maior parede
 *    externa do ambiente), com a folga de manutenção; sem fachada externa, num
 *    ambiente TÉCNICO do pavimento pelo nome (área técnica, serviço, varanda,
 *    casa de máquinas); sem nada disso, o relatório pede a posição;
 *  - o PONTO ELÉTRICO do aparelho (E4.3) junto da evaporadora, com a potência
 *    da placa do modelo — ou estimada pelo EER — no lugar dos 1400 VA fixos;
 *  - a relação evaporadora → condensadora (o SISTEMA), no MESMO lote.
 *
 * Tudo nasce `sugerida` e some ao relançar; aceitar fixa. Um lote = um Ctrl+Z.
 *
 * ⚠️ A relação precisa dos ids que o lote ainda vai criar. O caminho aqui é o
 * mesmo da prova da rede de hidrantes (`conferirPlanoDaRede`): aplicar os
 * `AddTerminal` numa CÓPIA do modelo — o contador de ids é determinístico — e
 * ler os ids que nasceram. Se o modelo mudar entre planejar e lançar, o plano é
 * recalculado (ele é derivado do modelo), então os ids batem.
 */
import type { BlueprintModel, Command, ObjectId, Point, Space, Wall } from './blueprintKernel';
import { TIPOS_DE_EVAPORADORA, applyBatch, contornoDoComponente, pegadaEmPlanta } from './blueprintKernel';
import { pointInPolygon, signedArea, interiorPoint } from './blueprintKernel/geom';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { ladosDePiso, trechosUtilizaveis, type LadoDoAmbiente } from './blueprintDistribuicao';
import type { CargaTermicaDoNivel } from './blueprintCargaTermica';
import type { HipotesesDeSelecao } from './blueprintClimatizacao';
import { potenciaEletricaVA, type ModeloDoCatalogo, type SelecaoDoNivel } from './blueprintSelecaoClimatizacao';
import { comandosDaCapacidadeDaCondensadora, comandosDaPotenciaDaEvaporadora, nomeDaCondensadora, pontoEletricoDaEvaporadora } from './blueprintPontosHidraulicos';
import { encostoNaParede, giroParaSoprarParaDentro, lugaresDoPontoDeForca } from './blueprintEncostoNaParede';

// 11/10/2026: o giro mora com o encosto (a inserção à mão usa o mesmo); exportado daqui também, como antes.
export { giroParaSoprarParaDentro };

/** As peças de climatização que o planejador do split cria (e as únicas que o relançar dele apaga). */
const PECAS_DO_SPLIT = [...TIPOS_DE_EVAPORADORA, 'CONDENSADORA_SPLIT'] as const;

/** Folga de canto e de vão ao posicionar a evaporadora, mm. */
export const FOLGA_DA_EVAPORADORA_MM = 300;
/** Folga de manutenção da condensadora à parede, mm (a mesma da reserva da E11.1). */
export const FOLGA_DA_CONDENSADORA_MM = 300;
/** Ambientes que servem de lugar da condensadora quando o ambiente não tem fachada. */
export const AMBIENTE_TECNICO = /t[eé]cnic|servi[çc]o|varanda|terra[çc]o|casa de m[aá]quinas|cobertura|garagem|quintal|p[aá]tio/i;

export interface EquipamentoPlanejado {
  spaceId: ObjectId;
  nome: string;
  modelo: ModeloDoCatalogo;
  evaporadora: Point;
  rotacaoGraus: number;
  condensadora: Point | null;
  /** Onde a condensadora ficou: fora da parede externa, num ambiente técnico, ou em lugar nenhum. */
  lugarDaCondensadora: 'FACHADA' | 'AMBIENTE_TECNICO' | null;
  potenciaVA: number;
}

/**
 * 11/10/2026 (teste do usuário no app real): a evaporadora CONFIRMADA sem
 * condensadora (inserida à mão) ganha a condensadora — o mesmo lugar que o split
 * novo teria — e as duas são ligadas no mesmo lote. Antes o ambiente contava como
 * "já atendido" e nada seguia: sem condensadora não há linha nem dreno.
 */
export interface CondensadoraParaExistente {
  spaceId: ObjectId;
  nome: string;
  evaporadoraId: ObjectId;
  condensadora: Point;
  lugarDaCondensadora: 'FACHADA' | 'AMBIENTE_TECNICO';
}

export interface PlanoDeEquipamentosSplit {
  comandos: Command[];
  aCriar: EquipamentoPlanejado[];
  /** 11/10/2026: as condensadoras lançadas para evaporadoras já confirmadas que não tinham uma. */
  condensadorasParaExistentes: CondensadoraParaExistente[];
  /** 11/10/2026: as evaporadoras confirmadas SEM capacidade que receberam a do modelo que a carga pede. */
  capacidadesPreenchidas: { nome: string; capacidadeBtuH: number }[];
  /** Ambientes já atendidos por equipamento CONFIRMADO (não sugerido) — o planejador não mexe. */
  jaAtendidos: string[];
  /** Ambientes em que não houve como posicionar, com o motivo. */
  semLugar: { nome: string; motivo: string }[];
  /** Peças sugeridas anteriores que o relançar apaga. */
  apagados: number;
  motivo: string | null;
  resumo: string[];
}

const comprimento = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** A normal que aponta para DENTRO do anel, no lado `lado` (unitária). */
function normalInterna(lado: LadoDoAmbiente, ring: Point[]): { x: number; y: number } {
  const L = comprimento(lado.a, lado.b);
  if (L === 0) return { x: 0, y: 0 };
  const ux = (lado.b.x - lado.a.x) / L;
  const uy = (lado.b.y - lado.a.y) / L;
  const horario = signedArea(ring) < 0;
  const n = horario ? { x: uy, y: -ux } : { x: -uy, y: ux };
  const meio = { x: (lado.a.x + lado.b.x) / 2, y: (lado.a.y + lado.b.y) / 2 };
  const dentro = { x: meio.x + n.x * 50, y: meio.y + n.y * 50 };
  return pointInPolygon(ring, dentro) ? n : { x: -n.x, y: -n.y };
}

interface LugarDaEvaporadora {
  lado: LadoDoAmbiente;
  at: Point;
  normal: { x: number; y: number };
  externa: boolean;
  livreMm: number;
  /** F14d: a cota do centro quando ela sobe para passar sobre a janela; ausente = a do modelo. */
  cotaMm?: number;
  /** F14d: onde a linha e o dreno atravessam a parede (na face, sobre parede cheia, na ponta da evaporadora). */
  saida?: Point;
}

/**
 * F14d da casa automática (decisão do usuário, 16/10/2026: "Evaporadora na parede externa"): a evaporadora vai para a
 * parede EXTERNA do ambiente mesmo sobre a janela — sobe até a base dela passar da verga, sem passar do `topoMaximoMm`
 * (o forro) — com uma PONTA sobre parede cheia, por onde a linha e o dreno saem juntos; a condensadora fica do lado de
 * fora, sob essa saída. Ausente = a regra de antes (parede livre de vão, externa de preferência).
 */
export interface OpcoesDaPosicaoDoSplit {
  naParedeExterna?: { topoMaximoMm: number } | null;
  /**
   * F18 da casa automática: a folga entre o ponto de força do ar e o tubo de outra rede, além do raio dele, mm (o
   * eletroduto desce até o ponto). Ausente = `AFASTAMENTO_DO_PONTO_AS_REDES_MM` (60).
   */
  afastamentoDoPontoAsRedesMm?: number;
}

/** F14d: a faixa de parede cheia por onde a linha e o dreno atravessam juntos (12 cm entre eles e os raios), mm. */
const FAIXA_DA_SAIDA_MM = 200;
/** F14d: até onde, além da ponta da evaporadora, a saída dos tubos pode ficar ("ao lado dela"), mm. */
const SAIDA_ALEM_DA_PONTA_MM = 400;
/** F14d: o "alcance" da saída acima da verga — atrás da evaporadora, a última escolha (a de parede cheia ganha). */
const SAIDA_ACIMA_DA_VERGA = 1_000_000;
/** F14d: a folga entre a ponta da saída e o batente da janela, mm. */
const FOLGA_DA_SAIDA_AO_VAO_MM = 50;

/** 11/10/2026: até esta distância da face (mm), o componente está "encostado" na parede e ocupa o trecho. */
const ENCOSTADO_NA_PAREDE_MM = 300;

/**
 * 11/10/2026 (teste do usuário no app real): os trechos do lado OCUPADOS por componente
 * encostado na parede (louça, armário, cama…) — a evaporadora ia para cima do vaso
 * sanitário. Em mm ao longo do lado, já com a folga da evaporadora dos dois lados.
 */
function ocupadosPorComponentes(model: BlueprintModel, lado: LadoDoAmbiente, levelId: ObjectId, baseDaEvaporadoraMm: number | null = null): { de: number; ate: number }[] {
  const L = comprimento(lado.a, lado.b);
  if (L === 0) return [];
  const ux = (lado.b.x - lado.a.x) / L;
  const uy = (lado.b.y - lado.a.y) / L;
  const saida: { de: number; ate: number }[] = [];
  for (const c of model.componentes ?? []) {
    if (c.levelId !== levelId || c.familia === 'CLIMATIZACAO') continue;
    // F14d (conferência no app real, 16/10/2026): o MÓVEL baixo (cama, sofá, mesa) cujo topo fica abaixo da base da
    // evaporadora não ocupa a parede — a cama encostada na parede externa da suíte mandava o split para a parede
    // interna. Louça, bancada, armário e equipamento seguem ocupando (o vaso sanitário de 11/10).
    if (baseDaEvaporadoraMm != null && c.familia === 'MOBILIARIO' && (c.cotaMm ?? 0) + c.alturaMm <= baseDaEvaporadoraMm) continue;
    const pts = contornoDoComponente(c);
    const ao = pts.map((p) => (p.x - lado.a.x) * ux + (p.y - lado.a.y) * uy);
    const perp = Math.min(...pts.map((p) => Math.abs((p.x - lado.a.x) * uy - (p.y - lado.a.y) * ux)));
    const de = Math.min(...ao);
    const ate = Math.max(...ao);
    if (perp > ENCOSTADO_NA_PAREDE_MM || ate < 0 || de > L) continue;
    saida.push({ de: Math.max(0, de - FOLGA_DA_EVAPORADORA_MM), ate: Math.min(L, ate + FOLGA_DA_EVAPORADORA_MM) });
  }
  return saida;
}

/**
 * F24 da casa automática (17/10/2026): o PILAR que sobressai da face para dentro do cômodo (19 cm numa parede de 15) —
 * a caixa da evaporadora encostada entrava 2 cm nele. O faceado dentro da parede não ocupa. Vale com ou sem o desvio
 * dos componentes.
 */
function ocupadosPorPilares(model: BlueprintModel, lado: LadoDoAmbiente, levelId: ObjectId): { de: number; ate: number }[] {
  const L = comprimento(lado.a, lado.b);
  if (L === 0) return [];
  const ux = (lado.b.x - lado.a.x) / L;
  const uy = (lado.b.y - lado.a.y) / L;
  const saida: { de: number; ate: number }[] = [];
  const w = lado.wallId ? model.walls.find((x) => x.id === lado.wallId) : null;
  const Lw = w ? Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) : 0;
  if (w && Lw > 0) {
    const assinada = (p: { x: number; y: number }) => ((p.x - w.a.x) * (w.b.y - w.a.y) - (p.y - w.a.y) * (w.b.x - w.a.x)) / Lw;
    const lado0 = Math.sign(assinada(lado.a)) || 1;
    for (const st of model.structures ?? []) {
      if (st.levelId !== levelId || st.kind !== 'PILAR') continue;
      const pts = pegadaEmPlanta(st);
      if (!pts.some((p) => assinada(p) * lado0 > w.thicknessMm / 2 + 1)) continue;
      // E é desta parede: o centro dele no corpo dela.
      const c = { x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length };
      if (Math.abs(assinada(c)) > w.thicknessMm / 2) continue;
      const ao = pts.map((p) => (p.x - lado.a.x) * ux + (p.y - lado.a.y) * uy);
      const de = Math.min(...ao);
      const ate = Math.max(...ao);
      if (ate < 0 || de > L) continue;
      saida.push({ de: Math.max(0, de - FOLGA_DA_EVAPORADORA_MM), ate: Math.min(L, ate + FOLGA_DA_EVAPORADORA_MM) });
    }
  }
  return saida;
}

/**
 * F24 da casa automática (17/10/2026): onde um tubo de OUTRA rede atravessa a parede acima da evaporadora (rumo ao forro)
 * — a linha frigorígena sobe dali até a faixa dela e cruzava a água quente que passava pela parede (12 × 30 sem
 * garagem). O trecho em volta da travessia fica ocupado.
 */
function ocupadosPorTravessias(model: BlueprintModel, lado: LadoDoAmbiente, levelId: ObjectId, acimaDeMm: number): { de: number; ate: number }[] {
  const L = comprimento(lado.a, lado.b);
  const w = lado.wallId ? model.walls.find((x) => x.id === lado.wallId) : null;
  if (L === 0 || !w) return [];
  const ux = (lado.b.x - lado.a.x) / L;
  const uy = (lado.b.y - lado.a.y) / L;
  const saida: { de: number; ate: number }[] = [];
  for (const t of model.trechos ?? []) {
    if (t.levelId !== levelId || t.disciplina === 'FRIGORIGENA' || t.disciplina === 'DRENO_AC') continue;
    if (Math.max(t.cotaAMm, t.cotaBMm) < acimaDeMm || (t.a.x === t.b.x && t.a.y === t.b.y)) continue;
    // O cruzamento do tubo com o eixo da parede (em planta).
    const d1 = { x: t.b.x - t.a.x, y: t.b.y - t.a.y };
    const d2 = { x: w.b.x - w.a.x, y: w.b.y - w.a.y };
    const den = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(den) < 1e-9) continue;
    const k = ((w.a.x - t.a.x) * d2.y - (w.a.y - t.a.y) * d2.x) / den;
    const j = ((w.a.x - t.a.x) * d1.y - (w.a.y - t.a.y) * d1.x) / den;
    if (k < 0 || k > 1 || j < 0 || j > 1) continue;
    const p = { x: t.a.x + d1.x * k, y: t.a.y + d1.y * k };
    const ao = (p.x - lado.a.x) * ux + (p.y - lado.a.y) * uy;
    const meio = (t.bitolaMm ?? 25) / 2 + AFASTAMENTO_DA_TRAVESSIA_MM;
    if (ao + meio < 0 || ao - meio > L) continue;
    saida.push({ de: Math.max(0, ao - meio - FOLGA_DA_EVAPORADORA_MM), ate: Math.min(L, ao + meio + FOLGA_DA_EVAPORADORA_MM) });
  }
  return saida;
}

/** F24: entre a travessia de outra rede pela parede e a subida da linha da evaporadora, além dos raios, mm. */
const AFASTAMENTO_DA_TRAVESSIA_MM = 60;

/**
 * F17 da casa automática (16/10/2026): os PONTOS na parede abaixo do topo da evaporadora — tomada, interruptor, água.
 * A descida deles vem do forro e atravessaria o aparelho e o dreno (na térrea a 30°, o eletroduto de uma tomada sob a
 * evaporadora cruzava o dreno): ocupam o trecho como um componente encostado, com a folga da evaporadora.
 */
function ocupadosPorPontos(model: BlueprintModel, lado: LadoDoAmbiente, levelId: ObjectId, topoDaEvaporadoraMm: number): { de: number; ate: number }[] {
  const L = comprimento(lado.a, lado.b);
  if (L === 0) return [];
  const ux = (lado.b.x - lado.a.x) / L;
  const uy = (lado.b.y - lado.a.y) / L;
  const saida: { de: number; ate: number }[] = [];
  for (const t of model.terminais ?? []) {
    if (t.levelId !== levelId || t.cotaMm >= topoDaEvaporadoraMm || t.tipoEletrico === 'AR_CONDICIONADO') continue;
    if (!t.tipoEletrico && t.disciplina !== 'AGUA_FRIA' && t.disciplina !== 'AGUA_QUENTE') continue;
    const ao = (t.at.x - lado.a.x) * ux + (t.at.y - lado.a.y) * uy;
    const perp = Math.abs((t.at.x - lado.a.x) * uy - (t.at.y - lado.a.y) * ux);
    if (perp > ENCOSTADO_NA_PAREDE_MM || ao < 0 || ao > L) continue;
    saida.push({ de: Math.max(0, ao - FOLGA_DA_EVAPORADORA_MM), ate: Math.min(L, ao + FOLGA_DA_EVAPORADORA_MM) });
  }
  return saida;
}

/** F18: o padrão de `OpcoesDaPosicaoDoSplit.afastamentoDoPontoAsRedesMm`. */
const AFASTAMENTO_DO_PONTO_AS_REDES_MM = 60;

/** F18: a distância do ponto (na cota) ao eixo do trecho, no espaço. */
export function distanciaAoTrecho3D(q: Point, cotaMm: number, t: { a: Point; b: Point; cotaAMm: number; cotaBMm: number }): number {
  const d = { x: t.b.x - t.a.x, y: t.b.y - t.a.y, z: t.cotaBMm - t.cotaAMm };
  const L2 = d.x * d.x + d.y * d.y + d.z * d.z;
  const k = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - t.a.x) * d.x + (q.y - t.a.y) * d.y + (cotaMm - t.cotaAMm) * d.z) / L2));
  return Math.hypot(q.x - (t.a.x + k * d.x), q.y - (t.a.y + k * d.y), cotaMm - (t.cotaAMm + k * d.z));
}

/** Os trechos livres menos os ocupados. */
function semOcupados(trechos: readonly { de: number; ate: number }[], ocupados: readonly { de: number; ate: number }[]): { de: number; ate: number }[] {
  let livres = trechos.map((t) => ({ ...t }));
  for (const o of ocupados) {
    livres = livres.flatMap((t) => {
      if (o.ate <= t.de || o.de >= t.ate) return [t];
      return [
        ...(o.de > t.de ? [{ de: t.de, ate: o.de }] : []),
        ...(o.ate < t.ate ? [{ de: o.ate, ate: t.ate }] : []),
      ];
    });
  }
  return livres;
}

/**
 * A parede livre: sem porta, trecho sem vão ≥ largura da peça + folgas; externa
 * primeiro, depois a de maior trecho livre. O ponto fica no MEIO do trecho,
 * recuado meia profundidade para dentro (a peça encosta na face).
 *
 * 11/10/2026: o trecho com componente encostado (louça, armário, cama) também não
 * serve — e, se NENHUMA parede tem trecho livre deles, vale a regra de antes (o
 * split sai mesmo assim, e o desenho mostra onde).
 */
export function lugarDaEvaporadora(
  model: BlueprintModel,
  space: Space,
  larguraMm: number,
  profundidadeMm: number,
  ehExterna: (wallId: string) => boolean,
  /** F24: a cota da evaporadora — as travessias de outras redes pela parede acima dela ocupam o trecho. Ausente = não confere. */
  cotaMm: number | null = null,
): LugarDaEvaporadora | null {
  return lugarDaEvaporadoraNaParede(model, space, larguraMm, profundidadeMm, ehExterna, true, cotaMm) ?? lugarDaEvaporadoraNaParede(model, space, larguraMm, profundidadeMm, ehExterna, false, cotaMm);
}

function lugarDaEvaporadoraNaParede(
  model: BlueprintModel,
  space: Space,
  larguraMm: number,
  profundidadeMm: number,
  ehExterna: (wallId: string) => boolean,
  desviarDosComponentes: boolean,
  cotaMm: number | null = null,
): LugarDaEvaporadora | null {
  const walls = model.walls.filter((w) => w.levelId === space.levelId);
  const idsDasParedes = new Set(walls.map((w) => w.id));
  const openings = model.openings.filter((o) => idsDasParedes.has(o.wallId));
  const lados = ladosDePiso(space, walls);
  const candidatos: LugarDaEvaporadora[] = [];
  for (const lado of lados) {
    if (!lado.wallId) continue;
    // A parede da PORTA do ambiente não recebe a evaporadora. Só a porta que cai NESTE lado: o eixo de uma parede
    // longa (o corredor da casa) atravessa vários cômodos, e a porta do vizinho tirava a parede inteira — a suíte
    // e a sala da casa automática ficavam sem split (F9, 15/10/2026).
    const portas = openings.filter((o) => o.wallId === lado.wallId && (o.kind === 'door' || o.kind === 'sliding' || o.kind === 'passage'));
    if (portas.length > 0) {
      const soma = (ts: readonly { de: number; ate: number }[]) => ts.reduce((acc, t) => acc + (t.ate - t.de), 0);
      if (soma(trechosUtilizaveis(lado, walls, portas, 0)) < soma(trechosUtilizaveis(lado, walls, [], 0)) - 1) continue;
    }
    const utilizaveis = trechosUtilizaveis(lado, walls, openings, FOLGA_DA_EVAPORADORA_MM);
    const trechos = semOcupados(desviarDosComponentes ? semOcupados(utilizaveis, ocupadosPorComponentes(model, lado, space.levelId)) : utilizaveis, [...ocupadosPorPilares(model, lado, space.levelId), ...(cotaMm == null ? [] : ocupadosPorTravessias(model, lado, space.levelId, cotaMm))]).filter((t) => t.ate - t.de >= larguraMm);
    if (trechos.length === 0) continue;
    const melhor = trechos.reduce((m, t) => (t.ate - t.de > m.ate - m.de ? t : m));
    const L = comprimento(lado.a, lado.b);
    const f = L > 0 ? (melhor.de + melhor.ate) / 2 / L : 0.5;
    const n = normalInterna(lado, space.ring);
    const base = { x: lado.a.x + (lado.b.x - lado.a.x) * f, y: lado.a.y + (lado.b.y - lado.a.y) * f };
    candidatos.push({
      lado,
      at: { x: Math.round(base.x + n.x * (profundidadeMm / 2)), y: Math.round(base.y + n.y * (profundidadeMm / 2)) },
      normal: n,
      externa: ehExterna(lado.wallId),
      livreMm: melhor.ate - melhor.de,
    });
  }
  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => Number(b.externa) - Number(a.externa) || b.livreMm - a.livreMm);
  return candidatos[0];
}

/**
 * F14d: o lugar na parede EXTERNA, mesmo sobre a janela (ver `OpcoesDaPosicaoDoSplit`). Por lado externo sem a porta
 * do ambiente: a evaporadora inteira no trecho útil (fora dos cantos e dos componentes encostados) e, a até
 * `SAIDA_ALEM_DA_PONTA_MM` das pontas dela, uma faixa de parede CHEIA de `FAIXA_DA_SAIDA_MM` — por onde a linha e o dreno
 * atravessam juntos. A que não passa sobre janela ganha; depois a de saída mais perto do aparelho e a do meio do lado.
 */
function lugarNaParedeExterna(
  model: BlueprintModel,
  space: Space,
  larguraMm: number,
  profundidadeMm: number,
  alturaMm: number,
  cotaMm: number,
  topoMaximoMm: number,
  ehExterna: (wallId: string) => boolean,
): LugarDaEvaporadora | null {
  const walls = model.walls.filter((w) => w.levelId === space.levelId);
  const idsDasParedes = new Set(walls.map((w) => w.id));
  const openings = model.openings.filter((o) => idsDasParedes.has(o.wallId));
  const candidatos: (LugarDaEvaporadora & { sobreJanela: boolean; alcance: number; doMeio: number })[] = [];
  for (const lado of ladosDePiso(space, walls)) {
    if (!lado.wallId || !ehExterna(lado.wallId)) continue;
    const doLado = openings.filter((o) => o.wallId === lado.wallId);
    if (doLado.some((o) => o.kind === 'door' || o.kind === 'sliding' || o.kind === 'passage')) continue;
    const L = comprimento(lado.a, lado.b);
    if (L < larguraMm) continue;
    // O útil (cantos e componentes), o CHEIO (fora das janelas, com folga) e as janelas com a cabeça de cada uma.
    const util = semOcupados(trechosUtilizaveis(lado, walls, [], FOLGA_DA_EVAPORADORA_MM), [...ocupadosPorComponentes(model, lado, space.levelId, cotaMm - alturaMm / 2), ...ocupadosPorPontos(model, lado, space.levelId, cotaMm + alturaMm / 2), ...ocupadosPorPilares(model, lado, space.levelId), ...ocupadosPorTravessias(model, lado, space.levelId, cotaMm)]);
    const cheio = trechosUtilizaveis(lado, walls, doLado, FOLGA_DA_SAIDA_AO_VAO_MM).filter((t) => t.ate - t.de >= FAIXA_DA_SAIDA_MM);
    const janelas = doLado.map((o) => {
      // O intervalo do vão ao longo do lado: o buraco entre os trechos livres sem ele (folga zero).
      const fora = trechosUtilizaveis(lado, walls, [o], 0).sort((a, b) => a.de - b.de);
      const vao =
        fora.length >= 2 ? { de: fora[0].ate, ate: fora[1].de }
        : fora.length === 1 ? (fora[0].de > 1 ? { de: 0, ate: fora[0].de } : { de: fora[0].ate, ate: L })
        : { de: 0, ate: L };
      return { ...vao, cabeca: o.sillMm + o.heightMm };
    });
    const n = normalInterna(lado, space.ring);
    const ponto = (t: number) => ({ x: lado.a.x + ((lado.b.x - lado.a.x) * t) / L, y: lado.a.y + ((lado.b.y - lado.a.y) * t) / L });
    let melhorDoLado: (typeof candidatos)[number] | null = null;
    for (const t of util) {
      for (let c = t.de + larguraMm / 2; c <= t.ate - larguraMm / 2; c += 50) {
        const [e0, e1] = [c - larguraMm / 2, c + larguraMm / 2];
        // A saída: o ponto de parede cheia mais perto do aparelho, a até `SAIDA_ALEM_DA_PONTA_MM` das pontas.
        let saida: number | null = null;
        let alcance = Infinity;
        for (const f of cheio) {
          const de = f.de + FAIXA_DA_SAIDA_MM / 2;
          const ate = f.ate - FAIXA_DA_SAIDA_MM / 2;
          if (ate < de) continue;
          const alvo = Math.min(Math.max(c, de), ate);
          const fora = Math.max(0, e0 - alvo, alvo - e1);
          if (fora > SAIDA_ALEM_DA_PONTA_MM) continue;
          const d = Math.abs(alvo - c);
          if (d < alcance) [saida, alcance] = [alvo, d];
        }
        const sobre = janelas.filter((j) => j.ate > e0 && j.de < e1);
        const cota = sobre.length ? Math.max(cotaMm, ...sobre.map((j) => j.cabeca + alturaMm / 2)) : cotaMm;
        if (cota + alturaMm / 2 > topoMaximoMm) continue;
        // Sem parede cheia ao alcance (o lado inteiro é janela — a suíte de cima do sobrado), a saída é ATRÁS dela,
        // acima da verga: os tubos correm por fora, acima da janela, até passar do batente (ver `saidaPelaParede`).
        if (saida == null && sobre.length) [saida, alcance] = [c, SAIDA_ACIMA_DA_VERGA];
        if (saida == null) continue;
        const base = ponto(c);
        const sp = ponto(saida);
        const cand: LugarDaEvaporadora & { sobreJanela: boolean; alcance: number; doMeio: number } = {
          lado,
          at: { x: Math.round(base.x + n.x * (profundidadeMm / 2)), y: Math.round(base.y + n.y * (profundidadeMm / 2)) } as Point,
          normal: n,
          externa: true,
          livreMm: t.ate - t.de,
          ...(cota !== cotaMm ? { cotaMm: Math.round(cota) } : {}),
          saida: { x: Math.round(sp.x), y: Math.round(sp.y) } as Point,
          sobreJanela: sobre.length > 0,
          alcance,
          doMeio: Math.abs(c - L / 2),
        };
        const melhor = (a: LugarDaEvaporadora & { sobreJanela: boolean; alcance: number; doMeio: number }, b: LugarDaEvaporadora & { sobreJanela: boolean; alcance: number; doMeio: number }) => Number(a.sobreJanela) - Number(b.sobreJanela) || a.alcance - b.alcance || a.doMeio - b.doMeio;
        if (!melhorDoLado || melhor(cand, melhorDoLado) < 0) melhorDoLado = cand;
      }
    }
    if (melhorDoLado) candidatos.push(melhorDoLado);
  }
  if (!candidatos.length) return null;
  candidatos.sort((a, b) => Number(a.sobreJanela) - Number(b.sobreJanela) || b.livreMm - a.livreMm || a.alcance - b.alcance);
  const { sobreJanela: _s, alcance: _a, doMeio: _d, ...lugar } = candidatos[0];
  return lugar;
}

/** O ponto do lado de FORA da parede externa `lado` (face externa + meia profundidade + folga). */
function foraDaParede(model: BlueprintModel, space: Space, lado: LadoDoAmbiente, profundidadeMm: number): Point | null {
  const parede = model.walls.find((w) => w.id === lado.wallId);
  if (!parede) return null;
  const n = normalInterna(lado, space.ring);
  const meio = { x: (lado.a.x + lado.b.x) / 2, y: (lado.a.y + lado.b.y) / 2 };
  const recuo = parede.thicknessMm + FOLGA_DA_CONDENSADORA_MM + profundidadeMm / 2;
  const p = { x: Math.round(meio.x - n.x * recuo), y: Math.round(meio.y - n.y * recuo) };
  // Do lado de fora de verdade: não pode cair dentro de outro ambiente do pavimento.
  const dentroDeAlgum = model.spaces.some((s) => s.levelId === space.levelId && pointInPolygon(s.ring, p));
  return dentroDeAlgum ? null : p;
}

/** O lugar da condensadora: fora da parede externa do ambiente, ou num ambiente técnico do pavimento. */
export function lugarDaCondensadora(
  model: BlueprintModel,
  space: Space,
  evaporadora: LugarDaEvaporadora,
  profundidadeMm: number,
  ehExterna: (wallId: string) => boolean,
): { at: Point; lugar: 'FACHADA' | 'AMBIENTE_TECNICO' } | null {
  // F14d: com a saída dos tubos na parede externa, a condensadora fica do lado de fora, sob ela.
  if (evaporadora.saida && evaporadora.lado.wallId && ehExterna(evaporadora.lado.wallId)) {
    const parede = model.walls.find((w) => w.id === evaporadora.lado.wallId);
    if (parede) {
      const recuo = parede.thicknessMm + FOLGA_DA_CONDENSADORA_MM + profundidadeMm / 2;
      const n = evaporadora.normal;
      const p = { x: Math.round(evaporadora.saida.x - n.x * recuo), y: Math.round(evaporadora.saida.y - n.y * recuo) } as Point;
      if (!model.spaces.some((x) => x.levelId === space.levelId && pointInPolygon(x.ring, p))) return { at: p, lugar: 'FACHADA' };
    }
  }
  const walls = model.walls.filter((w) => w.levelId === space.levelId);
  const lados = ladosDePiso(space, walls).filter((l) => l.wallId && ehExterna(l.wallId));
  const ordem = [...lados].sort((a, b) => Number(b.wallId === evaporadora.lado.wallId) - Number(a.wallId === evaporadora.lado.wallId) || comprimento(b.a, b.b) - comprimento(a.a, a.b));
  for (const lado of ordem) {
    const p = foraDaParede(model, space, lado, profundidadeMm);
    if (p) return { at: p, lugar: 'FACHADA' };
  }
  const tecnico = model.spaces
    .filter((s) => s.levelId === space.levelId && s.id !== space.id)
    .map((s) => ({ s, nome: model.labels.find((l) => l.levelId === s.levelId && pointInPolygon(s.ring, l.at))?.name ?? '' }))
    .find((x) => AMBIENTE_TECNICO.test(x.nome));
  if (tecnico) {
    // F18 da casa automática: ENCOSTADA numa parede do ambiente técnico (a externa primeiro), fora de porta e vão —
    // no ponto interior (o meio da garagem) ela ficava sob a luz de teto, e a linha descia pelo eletroduto dela.
    const ladosT = ladosDePiso(tecnico.s, walls).filter((l) => !!l.wallId && comprimento(l.a, l.b) >= 1000);
    const vaosDe = (l: LadoDoAmbiente) => trechosUtilizaveis(l, walls, model.openings.filter((o) => o.wallId === l.wallId), FOLGA_DA_CONDENSADORA_MM).filter((t) => t.ate - t.de >= 1000);
    const ordemT = [...ladosT].sort((a, b) => Number(!!b.wallId && ehExterna(b.wallId)) - Number(!!a.wallId && ehExterna(a.wallId)) || comprimento(b.a, b.b) - comprimento(a.a, a.b));
    for (const l of ordemT) {
      const livre = vaosDe(l)[0];
      if (!livre) continue;
      const L = comprimento(l.a, l.b);
      const t = (livre.de + livre.ate) / 2;
      const n = normalInterna(l, tecnico.s.ring);
      const d = profundidadeMm / 2 + FOLGA_DA_CONDENSADORA_MM;
      return { at: { x: Math.round(l.a.x + ((l.b.x - l.a.x) * t) / L + n.x * d), y: Math.round(l.a.y + ((l.b.y - l.a.y) * t) / L + n.y * d) } as Point, lugar: 'AMBIENTE_TECNICO' };
    }
    return { at: interiorPoint(tecnico.s.ring, tecnico.s.holes), lugar: 'AMBIENTE_TECNICO' };
  }
  return null;
}

/** O plano: um split por ambiente climatizado sem equipamento confirmado. */
export function planejarEquipamentosSplit(model: BlueprintModel, selecao: SelecaoDoNivel, carga: CargaTermicaDoNivel, hip: HipotesesDeSelecao, opcoes: OpcoesDaPosicaoDoSplit = {}): PlanoDeEquipamentosSplit {
  const vazio = (motivo: string, apagados = 0, comandos: Command[] = []): PlanoDeEquipamentosSplit => ({ comandos, aCriar: [], condensadorasParaExistentes: [], capacidadesPreenchidas: [], jaAtendidos: [], semLugar: [], apagados, motivo, resumo: [] });
  const levelId = selecao.levelId;
  // As sugestões anteriores deste planejador somem no relançar (peça de climatização sugerida + o ponto elétrico sugerido do aparelho).
  // ⚠️ E6 (05/10/2026): só as peças que ESTE planejador cria (evaporadora, condensadora de split, ponto de
  // força). Antes apagava qualquer peça de climatização sugerida — levava junto o ponto/bomba de dreno da E5
  // e os derivadores do VRF da E6.
  const sugeridas = (model.terminais ?? []).filter(
    (t) => t.levelId === levelId && !!t.sugerida && ((!!t.tipoHidraulico && (PECAS_DO_SPLIT as readonly string[]).includes(t.tipoHidraulico)) || t.tipoEletrico === 'AR_CONDICIONADO'),
  );
  const apagar: Command[] = sugeridas.map((t) => ({ type: 'DeleteTerminal', terminalId: t.id }) as Command);
  const idsSugeridas = new Set(sugeridas.map((t) => t.id));
  if (selecao.ambientes.length === 0) return vazio('nenhum ambiente climatizado no pavimento — marque o uso ou "climatizado" nas premissas por ambiente', apagar.length, apagar);

  const externaPorParede = new Map<string, boolean>();
  for (const a of carga.ambientes) for (const f of a.exposicao.faces) if (f.wallId) externaPorParede.set(f.wallId, !!f.externa);
  const ehExterna = (wallId: string) => externaPorParede.get(wallId) ?? false;

  const adds: Command[] = [];
  const aCriar: EquipamentoPlanejado[] = [];
  const jaAtendidos: string[] = [];
  const semLugar: { nome: string; motivo: string }[] = [];
  /** Por ambiente planejado: índices (na lista `adds`) da evaporadora e da condensadora, para ligar depois. */
  const pares: { evap: number; cond: number | null }[] = [];
  /** 11/10/2026: a evaporadora confirmada (id) e o índice da condensadora nova dela. */
  const paresExistentes: { evapId: ObjectId; cond: number }[] = [];
  const condensadorasParaExistentes: CondensadoraParaExistente[] = [];
  /** 11/10/2026: comandos sobre peças que já existem (não criam id) — vão no fim, depois das ligações. */
  const ajustes: Command[] = [];
  const capacidadesPreenchidas: { nome: string; capacidadeBtuH: number }[] = [];
  const porIdDoTerminal = new Map((model.terminais ?? []).map((t) => [t.id, t]));
  /** O modelo como fica depois de apagar as sugestões — para saber o que a evaporadora aceita perde. */
  const semSugeridas: BlueprintModel = { ...model, terminais: (model.terminais ?? []).filter((t) => !idsSugeridas.has(t.id)) };
  /** A condensadora vale se existe e não é uma sugestão que este relançar apaga. */
  const temCondensadora = (e: { condensadoraId?: ObjectId | null }) => !!e.condensadoraId && porIdDoTerminal.has(e.condensadoraId) && !idsSugeridas.has(e.condensadoraId);

  for (const amb of selecao.ambientes) {
    const confirmadas = amb.evaporadoras.filter((e) => !idsSugeridas.has(e.id));
    if (confirmadas.length > 0) {
      // 11/10/2026: atendido é a evaporadora COM condensadora; a sem condensadora ganha a dela aqui.
      const space = model.spaces.find((s) => s.id === amb.spaceId);
      // 11/10/2026: a CAPACIDADE vazia da evaporadora aceita vem do modelo que a seleção escolheu
      // para a carga (o app preenche o que já sabe; a declarada não é tocada) — a potência do
      // ponto e a condensadora acompanham.
      const capacidadePelaCarga = amb.sugestao.escolhido?.capacidadeBtuH ?? null;
      const capacidadeDe = (x: { capacidadeBtuH?: number | null }) => x.capacidadeBtuH ?? capacidadePelaCarga;
      for (const e of confirmadas) {
        const evap = porIdDoTerminal.get(e.id);
        if (!evap || evap.capacidadeBtuH != null || capacidadePelaCarga == null) continue;
        ajustes.push({ type: 'SetTerminalProps', terminalId: evap.id, capacidadeBtuH: capacidadePelaCarga } as Command);
        ajustes.push(...comandosDaPotenciaDaEvaporadora(semSugeridas, evap, capacidadePelaCarga, hip.eerWW));
        // A condensadora JÁ aceita e ligada, se ainda sem capacidade (a sugerida é refeita abaixo, com a nova).
        if (temCondensadora(evap)) ajustes.push(...comandosDaCapacidadeDaCondensadora(semSugeridas, evap, capacidadePelaCarga));
        capacidadesPreenchidas.push({ nome: amb.nome, capacidadeBtuH: capacidadePelaCarga });
      }
      // 11/10/2026: o ponto de força da evaporadora aceita — se era uma sugestão que este relançar apaga,
      // ele volta (a mesma regra da inserção pelo menu); com um ponto aceito, nada muda.
      for (const e of confirmadas) {
        const evap = porIdDoTerminal.get(e.id);
        if (!evap) continue;
        for (const c of pontoEletricoDaEvaporadora(semSugeridas, { ...evap, capacidadeBtuH: capacidadeDe(evap) }, hip.eerWW)) adds.push({ ...c, sugerida: true } as Command);
      }
      const fichaCond = FICHA_DO_PONTO_HIDRAULICO.CONDENSADORA_SPLIT;
      const medCond = fichaCond.medidasMm ?? { larguraMm: 850, profundidadeMm: 330, alturaMm: 700 };
      for (const e of confirmadas.filter((x) => !temCondensadora(porIdDoTerminal.get(x.id) ?? {}))) {
        const evap = porIdDoTerminal.get(e.id);
        if (!evap || !space) continue;
        // O lado do ambiente em que a evaporadora está (a parede mais perto dela): a condensadora prefere a mesma fachada.
        const walls = model.walls.filter((w) => w.levelId === space.levelId);
        const lados = ladosDePiso(space, walls).filter((l) => !!l.wallId);
        const dist = (l: LadoDoAmbiente) => {
          const dx = l.b.x - l.a.x;
          const dy = l.b.y - l.a.y;
          const c2 = dx * dx + dy * dy || 1;
          const f = Math.max(0, Math.min(1, ((evap.at.x - l.a.x) * dx + (evap.at.y - l.a.y) * dy) / c2));
          return Math.hypot(evap.at.x - (l.a.x + dx * f), evap.at.y - (l.a.y + dy * f));
        };
        const lado = lados.sort((a, b) => dist(a) - dist(b))[0];
        const cond = lado ? lugarDaCondensadora(model, space, { lado, at: evap.at, normal: normalInterna(lado, space.ring), externa: ehExterna(lado.wallId!), livreMm: 0 }, medCond.profundidadeMm, ehExterna) : null;
        if (!cond) {
          semLugar.push({ nome: amb.nome, motivo: 'a evaporadora existente não tem condensadora, e não há fachada externa nem ambiente técnico no pavimento para ela — posicione à mão e ligue o sistema no painel da evaporadora' });
          continue;
        }
        const cap = capacidadeDe(evap);
        paresExistentes.push({ evapId: evap.id, cond: adds.length });
        adds.push({
          type: 'AddTerminal',
          levelId,
          disciplina: 'FRIGORIGENA',
          tipo: nomeDaCondensadora(cap),
          tipoHidraulico: 'CONDENSADORA_SPLIT',
          at: cond.at,
          cotaMm: Math.round(medCond.alturaMm / 2),
          ...(cap ? { capacidadeBtuH: cap } : {}),
          larguraMm: medCond.larguraMm,
          profundidadeMm: medCond.profundidadeMm,
          alturaMm: medCond.alturaMm,
          sugerida: true,
        } as Command);
        condensadorasParaExistentes.push({ spaceId: amb.spaceId, nome: amb.nome, evaporadoraId: evap.id, condensadora: cond.at, lugarDaCondensadora: cond.lugar });
      }
      if (confirmadas.every((x) => temCondensadora(porIdDoTerminal.get(x.id) ?? {}))) jaAtendidos.push(amb.nome);
      continue;
    }
    const modelo = amb.sugestao.escolhido;
    if (!modelo) {
      semLugar.push({ nome: amb.nome, motivo: amb.sugestao.motivo ?? 'sem modelo' });
      continue;
    }
    const space = model.spaces.find((s) => s.id === amb.spaceId);
    if (!space) continue;
    const fichaEvap = FICHA_DO_PONTO_HIDRAULICO[modelo.tipoHidraulico];
    const larguraMm = modelo.larguraMm ?? fichaEvap.medidasMm?.larguraMm ?? 900;
    const profundidadeMm = modelo.profundidadeMm ?? fichaEvap.medidasMm?.profundidadeMm ?? 220;
    const alturaMm = modelo.alturaMm ?? fichaEvap.medidasMm?.alturaMm ?? 300;
    const lugar =
      (opcoes.naParedeExterna ? lugarNaParedeExterna(model, space, larguraMm, profundidadeMm, alturaMm, modelo.cotaMm, opcoes.naParedeExterna.topoMaximoMm, ehExterna) : null) ??
      lugarDaEvaporadora(model, space, larguraMm, profundidadeMm, ehExterna, modelo.cotaMm);
    if (!lugar) {
      semLugar.push({ nome: amb.nome, motivo: `nenhuma parede sem porta com ${(larguraMm / 1000).toLocaleString('pt-BR')} m livres fora dos vãos — posicione a evaporadora à mão` });
      continue;
    }
    const fichaCond = FICHA_DO_PONTO_HIDRAULICO.CONDENSADORA_SPLIT;
    const medCond = fichaCond.medidasMm ?? { larguraMm: 850, profundidadeMm: 330, alturaMm: 700 };
    const cond = lugarDaCondensadora(model, space, lugar, medCond.profundidadeMm, ehExterna);
    const potenciaVA = modelo.potenciaVA ?? potenciaEletricaVA(modelo.capacidadeBtuH, hip.eerWW);
    const rotacaoGraus = giroParaSoprarParaDentro(lugar.normal);
    const iEvap = adds.length;
    adds.push({
      type: 'AddTerminal',
      levelId,
      disciplina: 'FRIGORIGENA',
      tipo: modelo.nome,
      tipoHidraulico: modelo.tipoHidraulico,
      at: lugar.at,
      cotaMm: lugar.cotaMm ?? modelo.cotaMm,
      capacidadeBtuH: modelo.capacidadeBtuH,
      potenciaW: potenciaVA,
      larguraMm,
      profundidadeMm,
      alturaMm,
      rotacaoGraus,
      sugerida: true,
    } as Command);
    let iCond: number | null = null;
    if (cond) {
      iCond = adds.length;
      adds.push({
        type: 'AddTerminal',
        levelId,
        disciplina: 'FRIGORIGENA',
        tipo: `Condensadora ${modelo.capacidadeBtuH.toLocaleString('pt-BR')} BTU/h`,
        tipoHidraulico: 'CONDENSADORA_SPLIT',
        at: cond.at,
        cotaMm: Math.round(medCond.alturaMm / 2),
        capacidadeBtuH: modelo.capacidadeBtuH,
        larguraMm: medCond.larguraMm,
        profundidadeMm: medCond.profundidadeMm,
        alturaMm: medCond.alturaMm,
        sugerida: true,
      } as Command);
    }
    // E4.3: o ponto de força do aparelho, com a potência da placa (ou do EER) — não os 1400 VA fixos.
    // 11/10/2026: na face, AO LADO do aparelho — no centro dele ficava escondido sob a peça.
    const encDoSplit = encostoNaParede(model, levelId, lugar.at, profundidadeMm);
    // F18 da casa automática: o lado (dos dois) em que nenhum tubo de outra rede passa na altura do ponto — a água
    // corria 2 cm acima dele na parede, e o eletroduto que desce até ele não tinha por onde passar (R1-B).
    const candidatosDoPonto = encDoSplit ? lugaresDoPontoDeForca(model, encDoSplit, larguraMm) : [];
    const longeDasRedes = (q: Point) =>
      (model.trechos ?? []).every((t) => t.levelId !== levelId || distanciaAoTrecho3D(q, modelo.cotaMm, t) > t.bitolaMm / 2 + (opcoes.afastamentoDoPontoAsRedesMm ?? AFASTAMENTO_DO_PONTO_AS_REDES_MM));
    const pontoDeForca = candidatosDoPonto.find(longeDasRedes) ?? candidatosDoPonto[0] ?? { x: lugar.at.x, y: lugar.at.y };
    adds.push({
      type: 'AddTerminal',
      levelId,
      disciplina: 'ELETRICA',
      tipo: `Ar-condicionado ${modelo.capacidadeBtuH.toLocaleString('pt-BR')} BTU/h`,
      tipoEletrico: 'AR_CONDICIONADO',
      at: pontoDeForca,
      cotaMm: modelo.cotaMm,
      potenciaW: potenciaVA,
      sugerida: true,
    } as Command);
    pares.push({ evap: iEvap, cond: iCond });
    aCriar.push({ spaceId: amb.spaceId, nome: amb.nome, modelo, evaporadora: lugar.at, rotacaoGraus, condensadora: cond?.at ?? null, lugarDaCondensadora: cond?.lugar ?? null, potenciaVA });
    if (!cond) semLugar.push({ nome: amb.nome, motivo: 'condensadora: sem fachada externa nem ambiente técnico no pavimento — posicione à mão e ligue o sistema no painel' });
  }

  const resumoDaCapacidade = capacidadesPreenchidas.map(
    (c) => `${c.nome}: a evaporadora existente estava sem capacidade — recebe ${c.capacidadeBtuH.toLocaleString('pt-BR')} BTU/h, o modelo que a carga pede (CONFERIR); a potência do ponto e a condensadora acompanham`,
  );
  if (adds.length === 0 && ajustes.length > 0) {
    return { comandos: [...apagar, ...ajustes], aCriar: [], condensadorasParaExistentes: [], capacidadesPreenchidas, jaAtendidos, semLugar, apagados: apagar.length, motivo: null, resumo: resumoDaCapacidade };
  }
  if (adds.length === 0) {
    const motivo = semLugar.length ? `nenhum equipamento a lançar: ${semLugar.map((s) => `${s.nome} (${s.motivo})`).join('; ')}` : apagar.length ? null : 'todos os ambientes climatizados já têm equipamento confirmado';
    return { comandos: apagar, aCriar: [], condensadorasParaExistentes: [], capacidadesPreenchidas: [], jaAtendidos, semLugar, apagados: apagar.length, motivo, resumo: [] };
  }

  // Os ids que o lote vai criar, lidos numa cópia; depois a relação evaporadora → condensadora no mesmo lote.
  const ligar: Command[] = [];
  try {
    const antes = new Set((model.terminais ?? []).map((t) => t.id));
    const previa = applyBatch(model, [...apagar, ...adds]).model;
    const novos = (previa.terminais ?? []).filter((t) => !antes.has(t.id));
    if (novos.length !== adds.length) throw new Error(`esperava ${adds.length} peças novas, nasceram ${novos.length}`);
    for (const par of pares) {
      if (par.cond == null) continue;
      ligar.push({ type: 'SetTerminalProps', terminalId: novos[par.evap].id, condensadoraId: novos[par.cond].id } as Command);
    }
    // 11/10/2026: a evaporadora confirmada aponta a condensadora nova dela.
    for (const par of paresExistentes) ligar.push({ type: 'SetTerminalProps', terminalId: par.evapId, condensadoraId: novos[par.cond].id } as Command);
  } catch (e) {
    return vazio(`o plano não aplica: ${e instanceof Error ? e.message : String(e)}`, apagar.length);
  }

  const resumo: string[] = [];
  for (const p of aCriar) {
    resumo.push(
      `${p.nome}: ${p.modelo.nome} (${p.modelo.capacidadeBtuH.toLocaleString('pt-BR')} BTU/h, ${p.potenciaVA.toLocaleString('pt-BR')} VA) — evaporadora na parede, condensadora ${p.lugarDaCondensadora === 'FACHADA' ? 'na fachada' : p.lugarDaCondensadora === 'AMBIENTE_TECNICO' ? 'no ambiente técnico' : 'A POSICIONAR'}`,
    );
  }
  for (const c of condensadorasParaExistentes) {
    resumo.push(`${c.nome}: a evaporadora existente ganha a condensadora ${c.lugarDaCondensadora === 'FACHADA' ? 'na fachada' : 'no ambiente técnico'}, ligada a ela`);
  }
  resumo.push(...resumoDaCapacidade);
  return { comandos: [...apagar, ...adds, ...ligar, ...ajustes], aCriar, condensadorasParaExistentes, capacidadesPreenchidas, jaAtendidos, semLugar, apagados: apagar.length, motivo: null, resumo };
}
