/**
 * PRÉDIO AUTOMÁTICO — a ÁGUA FRIA (PA6 do plano docs/planos/2026-11-12-predio-automatico.md, 14/11/2026).
 *
 * Roda no TIPO antes da marca `copiaInstalacoes` (como a elétrica): o que se desenha nele vai aos andares numa
 * sincronização só. A rede, da rua à torneira:
 *
 *   rua ─ hidrômetro geral (cavalete na frente) ─ alimentador ─ reservatório INFERIOR (casa de bombas, térreo)
 *       ─ sucção ─ bomba ─ RECALQUE (pelo shaft) ─ reservatório SUPERIOR (cobertura)
 *       ─ BARRILETE (cobertura) ─ COLUNA (shaft, um trecho por andar: o tipo e as cópias)
 *       ─ em cada andar: rede do HALL (no forro da circulação) ─ HIDRÔMETRO de cada unidade (na parede dela, lado do hall)
 *       ─ rede da UNIDADE (no forro dos cômodos dela) ─ pontos das louças.
 *
 * Três escolhas, cada uma com o porquê:
 * - Cada rede é traçada pelo motor da casa (`planejarAgua`) numa VISTA só com o que é dela: a unidade vê só os cômodos
 *   e os pontos dela e nenhum tubo de água; o hall, só a circulação. Com a vista inteira, a origem da unidade já estava
 *   ligada (pelo ramal do hidrômetro) à rede do hall, e o motor pendurava colunas da unidade direto nela — a água de uma
 *   unidade passava por fora do hidrômetro dela (spike de 14/11: 4 das 5 unidades do R8 numa componente só).
 * - No FORRO (as faixas da casa, `forroDaAguaDaCasa`): pelos anéis de cada cômodo, afastados da face. "Pelas paredes",
 *   os ramais de duas unidades vizinhas corriam no mesmo eixo da parede comum e se ligavam.
 * - O ramal da unidade sai da parede `AFASTAMENTO_DO_RAMAL_NA_PAREDE_MM` ao lado do do hall: as duas descidas do forro
 *   entram na parede pelo eixo, e no mesmo ponto dividiam o trecho vertical dentro dela (de novo, uma rede só).
 *
 * A PRESSÃO é conferida DEPOIS da marca (`conferirPressaoDaAgua`): a rede do superior até o último ponto do 2º
 * pavimento só existe com as cópias. Ponto sem pressão mínima → pressurizador na saída do superior; estática acima de
 * 400 kPa (NBR 5626) → VRP no ramal de cada unidade, depois do hidrômetro (no tipo: todos os andares levam; nos de cima,
 * abaixo do ajuste, ela não atua).
 */
import { applyBatch, pointInPolygon } from '../blueprintKernel';
import { fazerChave } from '../blueprintGrafoDeRede';
import type { BlueprintModel, Command, ObjectId, Point, Space, Terminal } from '../blueprintKernel';
import { comandosDeMobiliario, HIPOTESES_MOBILIARIO_PADRAO, mobiliarNivel } from '../blueprintMobiliario';
import { HIPOTESES_PONTOS_PADRAO, planejarPontosDoNivel, pontosDasLoucasCriadas, type HipotesesDePontos } from '../blueprintPontosHidraulicos';
import { dimensionarDN, HIPOTESES_AGUA_PADRAO, pesoDoPonto, planejarAgua, vazaoDeProjetoLs, type HipotesesDeAgua } from '../blueprintAguaAutomatica';
import { anelDoPilar, pegadasDePilares } from '../blueprintObstaculosEstruturais';
import { cotaDaFaixa } from '../blueprintRotaPeloForro';
import { HIPOTESES_ALIMENTACAO_PADRAO, planejarAlimentador } from '../blueprintAlimentador';
import { dimensionarReservacao, HIPOTESES_RESERVATORIO_PADRAO } from '../blueprintReservacao';
import { diametroDeForchheimerMm, HIPOTESES_RECALQUE_PADRAO, MOTORES_CV, ROTULO_DA_SUCCAO, ROTULO_DO_RECALQUE } from '../blueprintRecalque';
import { FICHA_DO_MATERIAL, G, comprimentoEquivalenteM, perdaDistribuida } from '../blueprintHidraulicaPressao';
import { FICHA_DO_PONTO_HIDRAULICO } from '../blueprintHidraulica';
import { HIPOTESES_PRESSAO_PADRAO, pressoesDaOrigem, type HipotesesDePressao, type PressoesDaRede } from '../blueprintPressaoDaRede';
import { sistemaDeHidrantesMG, temSistema } from '../blueprintIncendioHidrantesMG';
import { localDoElemento } from '../blueprintLocalDaPendencia';
import type { LocalDaPendencia, PendenciaDoPpci } from '../blueprintGeradorPpci';
import { forroDaAguaDaCasa } from '../casaAutomatica/forroEPressao';
import type { BaseDoPredio, ContextoDoPredio } from './terreoECobertura';

/** A altura do hidrômetro da unidade (o nicho na parede do hall) e do ramal que o atravessa, mm. */
export const COTA_DO_HIDROMETRO_MM = 1000;
export const ROTULO_DA_COLUNA_DE_AGUA = 'Coluna de água fria';
export const ROTULO_DO_BARRILETE = 'Barrilete';
/** O ramal da unidade sai da parede a isto do ponto em que a rede do hall chega, ao longo dela (ver o cabeçalho). */
export const AFASTAMENTO_DO_RAMAL_NA_PAREDE_MM = 400;
/** O ramal do hidrômetro fica a isto, no mínimo, de qualquer vão da parede, mm. */
const FOLGA_DO_VAO_MM = 300;
/** Cota do barrilete na cobertura, sob o reservatório superior, mm. */
const COTA_DO_BARRILETE_MM = 2600;
/** Cota do percurso horizontal do recalque no térreo, mm. */
const COTA_DO_PERCURSO_DO_RECALQUE_MM = 2400;
/** As colunas ficam a esta fração do caminho do canto do shaft ao centro dele (o centro é da prumada elétrica). */
const POSICAO_NO_CANTO_DO_SHAFT = 0.3;
/** Onde a rede do hall começa: a isto da face do shaft, do lado do hall, mm. */
const SAIDA_DO_SHAFT_MM = 250;
/**
 * A velocidade máxima com que a rede do prédio é dimensionada, m/s. A NBR 5626 limita a 3 e a casa usa 2; no prédio o
 * último andar tem só a lâmina do superior (uns 5 m) e o ramal de cada unidade, no forro, contorna vigas e pilares com
 * dezenas de curvas — a 2 m/s a perda passava da carga (R8: −89 kPa no último andar).
 */
export const VELOCIDADE_MAXIMA_NO_PREDIO_MS = 1;
/** Afastamento mínimo do ramal do hidrômetro à face de um pilar, mm. */
const FOLGA_DO_PILAR_MM = 100;
/** Os hidrômetros comerciais (Qn 1,5 · 2,5 · 3,5 · 5 · 10), pela vazão máxima, m³/h. */
const QMAX_DOS_HIDROMETROS_M3H = [3, 5, 7, 10, 20] as const;
/** O hidrômetro é escolhido com a vazão de projeto da unidade até esta fração da máxima: perda de até 25 kPa (Δh = (36·Q)²/Qmáx²). */
const FRACAO_DA_VAZAO_MAXIMA = 0.5;
/** Tubos do PVC soldável na ordem dos diâmetros. */
const SERIE_PVC = FICHA_DO_MATERIAL.PVC_SOLDAVEL.diametros;
const W_POR_CV = 735.5;
/** Sem aquecedor no tipo: chuveiro elétrico — nenhum ponto de água quente (não há rede para ligá-los). */
const HIP_PONTOS: HipotesesDePontos = { ...HIPOTESES_PONTOS_PADRAO, aguaQuenteEm: [], afastamentoFriaQuenteMm: 150 };
/** IT 01 do CBMMG (premissa — o PPCI da PA9 confere): A-2 exige hidrantes acima de 750 m² ou de 12 m de altura. */
const AREA_QUE_EXIGE_HIDRANTES_M2 = 750;
const ALTURA_QUE_EXIGE_HIDRANTES_M = 12;

const f1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const area = (r: readonly Point[]) => Math.abs(r.reduce((s, q, i) => s + q.x * r[(i + 1) % r.length].y - r[(i + 1) % r.length].x * q.y, 0)) / 2;
const centro = (r: readonly Point[]): Point => ({ x: r.reduce((s, q) => s + q.x, 0) / r.length, y: r.reduce((s, q) => s + q.y, 0) / r.length }) as Point;
const inteiro = (p: { x: number; y: number }): Point => ({ x: Math.round(p.x), y: Math.round(p.y) }) as Point;
const comLocal = (l: LocalDaPendencia | null) => (l ? { locais: [l] } : {});
/** A perda no hidrômetro em kPa, com a vazão em m³/h (a fórmula de `perdaNoHidrometroKpa`, que recebe L/s). */
const perdaNoHidrometro = (qM3h: number, qMaxM3h: number) => (36 * (qM3h / 3.6)) ** 2 / qMaxM3h ** 2;

/** O ramal do hidrômetro de uma unidade: E (rede do hall), H (o hidrômetro), O (a rede da unidade), no tipo. */
export interface RamalDaUnidade {
  numero: string;
  unidadeId: ObjectId | null;
  E: Point;
  H: Point;
  O: Point;
  /** Soma dos pesos (NBR 5626) dos pontos da unidade. */
  peso: number;
}

// ─── Louças e pontos ─────────────────────────────────────────────────────────

export interface LoucasDoPredio {
  comandos: number;
  pecas: number;
  pontos: number;
  pendencias: PendenciaDoPpci[];
}

/** O kit de cada ambiente do tipo (cama, bancada, vaso, box…), os pontos de cada louça e os do kit que nenhuma cobre. */
export function lancarLoucasEPontos(ctx: ContextoDoPredio, base: BaseDoPredio): LoucasDoPredio {
  const tipo = base.tipoLevelId;
  const pendencias: PendenciaDoPpci[] = [];
  const lista = mobiliarNivel(ctx.m, tipo, HIPOTESES_MOBILIARIO_PADRAO);
  const lote = comandosDeMobiliario(lista, tipo, ctx.m);
  // O kernel é determinístico: a simulação dá os ids que a aplicação vai dar — os pontos das louças são planejados para eles.
  const criados = lote.length ? applyBatch(ctx.m, lote).diff.created : [];
  // Uma pendência por tipo de achado (no prédio, uma por peça davam dezenas), com o lugar de cada ambiente.
  const agrupar = (de: (a: (typeof lista)[number]) => string[], grupo: PendenciaDoPpci['grupo'], titulo: string) => {
    const comAchado = lista.filter((a) => de(a).length);
    if (!comAchado.length) return;
    const itens = comAchado.flatMap((a) => de(a).map((x) => `${a.rotulo}: ${x}`));
    const locais = comAchado.map((a) => localDoElemento(ctx.m, [a.spaceId])).filter((l): l is LocalDaPendencia => !!l);
    pendencias.push({ grupo, texto: `Mobiliário: ${itens.length} ${titulo} no tipo (cada andar repete) — ${itens.slice(0, 6).join('; ')}${itens.length > 6 ? '…' : ''}`, ...(locais.length ? { locais } : {}) });
  };
  agrupar((a) => a.naoCouberam, 'VERIFICACAO', 'peça(s) que não couberam');
  agrupar((a) => a.reduzidas, 'CONFERIR', 'peça(s) menores (a maior não coube)');
  let comandos = ctx.aplicar(lote);
  const loucas = pontosDasLoucasCriadas(ctx.m, criados, HIP_PONTOS, { sugerida: true });
  comandos += ctx.aplicar(loucas);
  const kit = planejarPontosDoNivel(ctx.m, tipo, HIP_PONTOS).flatMap((p) => p.comandos);
  comandos += ctx.aplicar(kit);
  pendencias.push({ grupo: 'PREMISSA', texto: 'Água quente: sem aquecedor nas unidades — chuveiro elétrico (o ponto de força dele é da elétrica); a rede de água quente fica para o projetista.' });
  return { comandos, pecas: lote.length, pontos: loucas.length + kit.length, pendencias };
}

// ─── Água fria ───────────────────────────────────────────────────────────────

export interface AguaFriaDoPredio {
  comandos: number;
  /** Hidrômetros por andar (cada cópia repete). */
  hidrometros: number;
  /** Pontos de água fria por andar, ligados à rede da unidade. */
  pontos: number;
  ramais: RamalDaUnidade[];
  /** DN da coluna e do barrilete (o do trecho mais carregado: o do último andar leva o prédio inteiro). */
  colunaDnMm: number | null;
  recalque: { dnMm: number; dnSuccaoMm: number; vazaoLs: number; alturaManometricaM: number; motorCv: number } | null;
  alimentador: { dnMm: number; atende: boolean } | null;
  /** Reserva técnica de incêndio no superior, L; `null` = não exigida ou sem superior. */
  rtiL: number | null;
  /** A vazão máxima do hidrômetro das unidades, m³/h (pela vazão de projeto da maior). */
  qMaxDoHidrometroM3h: number;
  pendencias: PendenciaDoPpci[];
}

/** Os cômodos do tipo de cada unidade (pela fatia da divisão) e os do hall (os demais com nome). */
function comodosDoTipo(m: BlueprintModel, base: BaseDoPredio) {
  const tipo = base.tipoLevelId;
  const espacos = m.spaces.filter((s) => s.levelId === tipo);
  // Um ponto DENTRO de cada cômodo: a etiqueta dele, senão o centro do anel (se cair dentro).
  const menor = (q: Point) => espacos.filter((s) => pointInPolygon(s.ring as Point[], q)).sort((a, b) => area(a.ring as Point[]) - area(b.ring as Point[]))[0] ?? null;
  const dentro = new Map<ObjectId, Point>();
  for (const l of m.labels.filter((x) => x.levelId === tipo)) {
    const s = menor(l.at as Point);
    if (s && !dentro.has(s.id)) dentro.set(s.id, l.at as Point);
  }
  for (const s of espacos) {
    const c = inteiro(centro(s.ring as Point[]));
    if (!dentro.has(s.id) && pointInPolygon(s.ring as Point[], c)) dentro.set(s.id, c);
  }
  const daUnidade = new Map<ObjectId, string>();
  for (const s of espacos) {
    const p = dentro.get(s.id);
    const u = p ? base.divisao.unidades.find((x) => pointInPolygon(x.anel, p)) : null;
    if (u) daUnidade.set(s.id, u.numero);
  }
  const hall = espacos.filter((s) => !daUnidade.has(s.id) && (s.name ?? '').trim() && !/shaft|elevador/i.test(s.name ?? '') || (!daUnidade.has(s.id) && /escada/i.test(s.name ?? '')));
  return { espacos, daUnidade, hall, menor };
}

/** As bitolas de uma árvore de trechos novos pela soma dos pesos a jusante (folhas em `pesoNoNo`), da `raiz`. */
function bitolasPelaArvore(lote: Extract<Command, { type: 'AddTrecho' }>[], chave: (l: ObjectId, x: number, y: number, z: number) => string, raiz: string, pesoNoNo: Map<string, number>, hip: HipotesesDeAgua): void {
  const nos = lote.map((t) => [chave(t.levelId, t.a.x, t.a.y, t.cotaAMm), chave(t.levelId, t.b.x, t.b.y, t.cotaBMm)] as const);
  const adj = new Map<string, number[]>();
  nos.forEach(([a, b], i) => {
    adj.set(a, [...(adj.get(a) ?? []), i]);
    adj.set(b, [...(adj.get(b) ?? []), i]);
  });
  const ordem: string[] = [raiz];
  const pai = new Map<string, { de: string; i: number }>();
  const vistos = new Set([raiz]);
  for (let k = 0; k < ordem.length; k++) {
    for (const i of adj.get(ordem[k]) ?? []) {
      const outro = nos[i][0] === ordem[k] ? nos[i][1] : nos[i][0];
      if (vistos.has(outro)) continue;
      vistos.add(outro);
      pai.set(outro, { de: ordem[k], i });
      ordem.push(outro);
    }
  }
  const soma = new Map<string, number>();
  for (let k = ordem.length - 1; k > 0; k--) {
    const n = ordem[k];
    const s = (soma.get(n) ?? 0) + (pesoNoNo.get(n) ?? 0);
    soma.set(n, s);
    const p = pai.get(n)!;
    soma.set(p.de, (soma.get(p.de) ?? 0) + s);
    lote[p.i].bitolaMm = Math.max(lote[p.i].bitolaMm ?? 0, dimensionarDN(s, 'PVC_SOLDAVEL', hip, hip.dnMinimoAguaFriaMm).dn);
  }
}

/**
 * O lote sem os trechos que FECHAM ANEL: a árvore a partir da `raiz` (busca em largura) e, fora dela, os trechos que ligam
 * dois nós já alcançados. O motor da casa, no forro, fechava às vezes um laço na rede da unidade (2 por andar no R8) — o
 * cálculo de pressão é em árvore e ignora o laço, com aviso; sem ele a rede é a mesma, ligada do mesmo jeito.
 */
function semAneis(lote: readonly Command[], chave: (l: ObjectId, x: number, y: number, z: number) => string, raiz: string): Command[] {
  const trechos = lote.map((c, i) => ({ c, i })).filter((x): x is { c: Extract<Command, { type: 'AddTrecho' }>; i: number } => x.c.type === 'AddTrecho');
  const nos = trechos.map(({ c }) => [chave(c.levelId, c.a.x, c.a.y, c.cotaAMm), chave(c.levelId, c.b.x, c.b.y, c.cotaBMm)] as const);
  const adj = new Map<string, number[]>();
  nos.forEach(([a, b], k) => {
    adj.set(a, [...(adj.get(a) ?? []), k]);
    adj.set(b, [...(adj.get(b) ?? []), k]);
  });
  const vistos = new Set([raiz]);
  const daArvore = new Set<number>();
  const fila = [raiz];
  for (let q = 0; q < fila.length; q++) {
    for (const k of adj.get(fila[q]) ?? []) {
      const outro = nos[k][0] === fila[q] ? nos[k][1] : nos[k][0];
      if (vistos.has(outro)) continue;
      vistos.add(outro);
      daArvore.add(k);
      fila.push(outro);
    }
  }
  const fora = new Set(trechos.filter((_, k) => !daArvore.has(k) && vistos.has(nos[k][0]) && vistos.has(nos[k][1])).map((x) => x.i));
  return lote.filter((_, i) => !fora.has(i));
}

const trecho = (levelId: ObjectId, a: Point, ca: number, b: Point, cb: number, bitolaMm: number, rotulo: string | null = null): Extract<Command, { type: 'AddTrecho' }> => ({
  type: 'AddTrecho', levelId, disciplina: 'AGUA_FRIA', a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, cotaAMm: ca, cotaBMm: cb, bitolaMm, sugerido: true, ...(rotulo ? { rotulo } : {}),
});
/** Uma polilinha ortogonal (primeiro em x, depois em y) de `a` a `b` na cota `z`, sem trechos de comprimento zero. */
function emL(levelId: ObjectId, a: Point, b: Point, z: number, dn: number, rotulo: string): Extract<Command, { type: 'AddTrecho' }>[] {
  const k = { x: b.x, y: a.y } as Point;
  const pts = [a, k, b].filter((p, i, arr) => i === 0 || p.x !== arr[i - 1].x || p.y !== arr[i - 1].y);
  return pts.slice(1).map((p, i) => trecho(levelId, pts[i], z, p, z, dn, rotulo));
}

export function lancarAguaFria(
  ctx: ContextoDoPredio,
  base: BaseDoPredio,
  terreo: { levelId: ObjectId } | null,
  cobertura: { levelId: ObjectId } | null,
  andares: number,
): AguaFriaDoPredio {
  const tipo = base.tipoLevelId;
  const pendencias: PendenciaDoPpci[] = [];
  const pe = (id: ObjectId) => ctx.m.levels.find((l) => l.id === id)?.defaultHeightMm ?? 3000;
  const hipA: HipotesesDeAgua = { ...HIPOTESES_AGUA_PADRAO, velocidadeMaxMs: VELOCIDADE_MAXIMA_NO_PREDIO_MS, raioDoShaftMm: 0, noForro: forroDaAguaDaCasa({}) };
  let comandos = 0;
  const reservatorios = (ctx.m.terminais ?? []).filter((t) => t.tipoHidraulico === 'RESERVATORIO' && t.disciplina === 'AGUA_FRIA');
  const inferior = reservatorios.find((t) => t.papelReservatorio === 'INFERIOR' && t.levelId === terreo?.levelId) ?? null;
  const superior = reservatorios.find((t) => t.papelReservatorio === 'SUPERIOR' && t.levelId === cobertura?.levelId) ?? null;
  const resultado: AguaFriaDoPredio = { comandos: 0, hidrometros: 0, pontos: 0, ramais: [], colunaDnMm: null, recalque: null, alimentador: null, rtiL: null, qMaxDoHidrometroM3h: HIPOTESES_PRESSAO_PADRAO.qMaxDoHidrometroM3h, pendencias };

  // ── O alimentador, ANTES dos hidrômetros das unidades (o planejador toma o primeiro hidrômetro do desenho pela entrada;
  // sem nenhum, propõe o cavalete na frente do lote). Só até o INFERIOR: até o superior ele subiria pelas cópias.
  if (inferior) {
    try {
      const pa = planejarAlimentador(ctx.m, HIPOTESES_ALIMENTACAO_PADRAO, HIPOTESES_RESERVATORIO_PADRAO, HIPOTESES_PRESSAO_PADRAO.qMaxDoHidrometroM3h);
      if (pa.motivo) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: `Alimentador: ${pa.motivo}` });
      else {
        comandos += ctx.aplicar(pa.comandos);
        resultado.alimentador = { dnMm: pa.dnMm, atende: pa.atende };
        for (const a of pa.avisos) pendencias.push({ grupo: 'CONFERIR', texto: `Alimentador: ${a}` });
      }
    } catch (e) {
      pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Alimentador: ${e instanceof Error ? e.message : String(e)}` });
    }
  } else pendencias.push({ grupo: 'NAO_DECIDIDO', texto: 'Alimentador: sem o reservatório inferior (casa de bombas no térreo), a ligação da rua fica para o projetista.' });

  // ── O shaft e o lado dele que dá para o hall.
  const { espacos, daUnidade, hall, menor } = comodosDoTipo(ctx.m, base);
  const shaft = (ctx.m.nucleos ?? []).find((n) => n.tipo === 'SHAFT' && pointInPolygon(base.bloco.pontos as Point[], inteiro(centro(n.ring as Point[])))) ?? null;
  if (!shaft) {
    pendencias.push({ grupo: 'SEM_SOLUCAO', texto: 'Água fria: o núcleo não tem shaft — sem onde passar a coluna; a água fria fica para o projetista.' });
    return { ...resultado, comandos };
  }
  const anel = shaft.ring as Point[];
  const c = centro(anel);
  let C: Point | null = null;
  let P0: Point | null = null;
  let Rc: Point | null = null;
  for (let i = 0; i < anel.length && !C; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1) continue;
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    let n = { x: -u.y, y: u.x };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if ((mid.x - c.x) * n.x + (mid.y - c.y) * n.y < 0) n = { x: -n.x, y: -n.y };
    const fora = menor(inteiro({ x: mid.x + n.x * 500, y: mid.y + n.y * 500 }));
    if (!fora || !hall.some((s) => s.id === fora.id)) continue;
    C = inteiro({ x: a.x + (c.x - a.x) * POSICAO_NO_CANTO_DO_SHAFT, y: a.y + (c.y - a.y) * POSICAO_NO_CANTO_DO_SHAFT });
    const aoLongo = (C.x - a.x) * u.x + (C.y - a.y) * u.y;
    P0 = inteiro({ x: a.x + u.x * aoLongo + n.x * SAIDA_DO_SHAFT_MM, y: a.y + u.y * aoLongo + n.y * SAIDA_DO_SHAFT_MM });
    // O recalque no canto mais longe deste.
    const longe = [...anel].sort((p, q) => Math.hypot(q.x - a.x, q.y - a.y) - Math.hypot(p.x - a.x, p.y - a.y))[0];
    Rc = inteiro({ x: longe.x + (c.x - longe.x) * POSICAO_NO_CANTO_DO_SHAFT, y: longe.y + (c.y - longe.y) * POSICAO_NO_CANTO_DO_SHAFT });
  }
  if (!C || !P0 || !Rc) {
    pendencias.push({ grupo: 'SEM_SOLUCAO', texto: 'Água fria: nenhum lado do shaft dá para a circulação — sem por onde a coluna chegar aos hidrômetros.', ...comLocal(localDoElemento(ctx.m, [shaft.id])) });
    return { ...resultado, comandos };
  }

  // ── O ramal de cada unidade: na parede entre ela e o hall, longe dos vãos.
  const paredes = ctx.m.walls.filter((w) => w.levelId === tipo);
  // Longe dos pilares também: o motor da casa, com o ponto dentro de um, varre a parede inteira atrás de lugar (no R8, 5 s).
  const pilares = pegadasDePilares(ctx.m, tipo).map((g) => anelDoPilar(g, FOLGA_DO_PILAR_MM) as Point[]);
  const noPilar = (q: { x: number; y: number }) => pilares.some((g) => pointInPolygon(g, inteiro(q)));
  const ehHall = (s: Space | null) => !!s && hall.some((h) => h.id === s.id);
  const ramais: RamalDaUnidade[] = [];
  for (const u of base.divisao.unidades) {
    const reg = (ctx.m.unidades ?? []).find((x) => x.numero === u.numero) ?? null;
    let achou: Omit<RamalDaUnidade, 'peso'> | null = null;
    for (const w of paredes) {
      if (achou) break;
      const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      if (L < 2 * FOLGA_DO_VAO_MM + AFASTAMENTO_DO_RAMAL_NA_PAREDE_MM) continue;
      const ux = (w.b.x - w.a.x) / L;
      const uy = (w.b.y - w.a.y) / L;
      const vaos = ctx.m.openings.filter((o) => o.wallId === w.id);
      for (let s = FOLGA_DO_VAO_MM; s <= L - FOLGA_DO_VAO_MM - AFASTAMENTO_DO_RAMAL_NA_PAREDE_MM && !achou; s += 100) {
        if (vaos.some((o) => s + AFASTAMENTO_DO_RAMAL_NA_PAREDE_MM > o.offsetMm - FOLGA_DO_VAO_MM && s < o.offsetMm + o.widthMm + FOLGA_DO_VAO_MM)) continue;
        const mid = { x: w.a.x + ux * s, y: w.a.y + uy * s };
        if (noPilar(mid) || noPilar({ x: mid.x + ux * AFASTAMENTO_DO_RAMAL_NA_PAREDE_MM, y: mid.y + uy * AFASTAMENTO_DO_RAMAL_NA_PAREDE_MM })) continue;
        const d = w.thicknessMm / 2 + 300;
        const l1 = menor(inteiro({ x: mid.x - uy * d, y: mid.y + ux * d }));
        const l2 = menor(inteiro({ x: mid.x + uy * d, y: mid.y - ux * d }));
        const sinal = l1 && daUnidade.get(l1.id) === u.numero && ehHall(l2) ? 1 : l2 && daUnidade.get(l2.id) === u.numero && ehHall(l1) ? -1 : 0;
        if (!sinal) continue;
        // Na FACE da parede (o ponto na face não é "encostado" pelo motor), cada lado no seu.
        const face = (lado: number, ao: number) => inteiro({ x: mid.x + ux * ao - uy * lado * (w.thicknessMm / 2), y: mid.y + uy * ao + ux * lado * (w.thicknessMm / 2) });
        const E = face(-sinal, 0);
        const O = face(sinal, AFASTAMENTO_DO_RAMAL_NA_PAREDE_MM);
        achou = { numero: u.numero, unidadeId: reg?.id ?? null, E, O, H: inteiro({ x: E.x + (O.x - E.x) * 0.1, y: E.y + (O.y - E.y) * 0.1 }) };
      }
    }
    if (!achou) {
      pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Água fria: a unidade ${u.numero} não tem parede com a circulação longe das portas — sem lugar para o hidrômetro; a água dela fica para o projetista.` });
      continue;
    }
    ramais.push({ ...achou, peso: 0 });
  }

  // ── A rede de cada unidade, do ramal aos pontos dela, só nos cômodos dela.
  const falso = (id: string, at: Point, tipoHidraulico: string): Terminal => ({ id, uid: id, levelId: tipo, disciplina: 'AGUA_FRIA', tipo: id, at, cotaMm: COTA_DO_HIDROMETRO_MM, tipoHidraulico } as unknown as Terminal);
  // A vista tem SÓ o pavimento tipo: a rede da unidade e a do hall vivem nele, e o motor da casa escolhe a posição de
  // cada coluna fugindo dos pilares e vãos de todos os pavimentos da vista (na casa a coluna atravessa os andares) — com
  // os 8 andares do R8, 8,7 s só nessa busca.
  const vista = (terminais: Terminal[], comodos: Space[]): BlueprintModel => {
    const paredesDoTipo = new Set(ctx.m.walls.filter((w) => w.levelId === tipo).map((w) => w.id));
    return {
      ...ctx.m,
      levels: ctx.m.levels.filter((l) => l.id === tipo),
      walls: ctx.m.walls.filter((w) => paredesDoTipo.has(w.id)),
      openings: ctx.m.openings.filter((o) => paredesDoTipo.has(o.wallId)),
      structures: (ctx.m.structures ?? []).filter((x) => x.levelId === tipo),
      terminais,
      trechos: (ctx.m.trechos ?? []).filter((t) => t.levelId === tipo && t.disciplina !== 'AGUA_FRIA'),
      spaces: comodos,
    };
  };
  const chaveDoTipo = fazerChave(ctx.m.levels.filter((l) => l.id === tipo));
  for (const [i, r] of ramais.entries()) {
    const meus = espacos.filter((s) => daUnidade.get(s.id) === r.numero);
    const pts = (ctx.m.terminais ?? []).filter((t) => t.levelId === tipo && t.disciplina === 'AGUA_FRIA' && t.tipoHidraulico && t.tipoHidraulico !== 'HIDROMETRO' && meus.some((s) => pointInPolygon(s.ring as Point[], t.at as Point)));
    r.peso = pts.reduce((s, t) => s + pesoDoPonto(ctx.m, t, 'AGUA_FRIA'), 0);
    if (!pts.length) continue;
    const origem = falso(`__origem-da-unidade-${i}`, r.O, 'RESERVATORIO');
    const pa = planejarAgua(vista([origem, ...pts], meus), origem, hipA);
    if (pa.motivo && !pa.comandos.length) {
      pendencias.push({ grupo: 'VERIFICACAO', texto: `Água fria da unidade ${r.numero}: ${pa.motivo}` });
      continue;
    }
    // O ponto encostado na face (TranslateEntities) perde a marca "sugerida" — ninguém decidiu: volta a ser proposta.
    const sugeridos = new Set(pts.filter((t) => t.sugerida).map((t) => t.id));
    comandos += ctx.aplicar(semAneis(pa.comandos.filter((x) => x.type !== 'SetTrechoProps'), chaveDoTipo, chaveDoTipo(tipo, r.O.x, r.O.y, COTA_DO_HIDROMETRO_MM)));
    comandos += ctx.aplicar((ctx.m.terminais ?? []).filter((t) => sugeridos.has(t.id) && !t.sugerida).map((t): Command => ({ type: 'SetTerminalProps', terminalId: t.id, sugerida: true })));
    resultado.pontos += pa.pontos;
  }

  // ── A rede do hall: do shaft aos ramais, só na circulação. Os "consumidores" são os pontos E dos ramais; as bitolas
  // saem do peso de cada unidade (o motor dimensionaria pelo peso de uma torneira).
  const pesoDoAndar = ramais.reduce((s, r) => s + r.peso, 0);
  const dnDe = (peso: number) => dimensionarDN(peso, 'PVC_SOLDAVEL', hipA, hipA.dnMinimoAguaFriaMm).dn;
  const chave = fazerChave(ctx.m.levels);
  const lote: Extract<Command, { type: 'AddTrecho' }>[] = [];
  if (ramais.length) {
    const zf = cotaDaFaixa(pe(tipo), hipA.noForro!.aguaFria);
    const dv = base.divisao;
    let doHall: Extract<Command, { type: 'AddTrecho' }>[];
    if (dv.esquema !== 'ASAS' && !dv.ortogonal) {
      // CORREDOR RETO: o barrilete do andar corre no forro pelo EIXO do corredor, com uma derivação a cada hidrômetro. O
      // motor da casa, no forro, só anda pelo anel do cômodo — e para chegar ao lado de lá do corredor dava a volta pela
      // ponta dele (no R8, 13 m para um lado e 18 m de volta).
      const { o, u, v } = dv.quadro;
      const local = (p: Point) => (p.x - o.x) * u.x + (p.y - o.y) * u.y;
      const bm = (dv.corredor.b0 + dv.corredor.b1) / 2;
      const noEixo = (a: number) => inteiro({ x: o.x + u.x * a + v.x * bm, y: o.y + u.y * a + v.y * bm });
      const A0 = noEixo(local(P0));
      doHall = [trecho(tipo, P0, COTA_DO_HIDROMETRO_MM, P0, zf, hipA.dnMinimoAguaFriaMm)];
      if (A0.x !== P0.x || A0.y !== P0.y) doHall.push(trecho(tipo, P0, zf, A0, zf, hipA.dnMinimoAguaFriaMm));
      const noEixoDe = ramais.map((r) => ({ a: local(r.E), p: noEixo(local(r.E)) }));
      const sobre = [{ a: local(P0), p: A0 }, ...noEixoDe].sort((x, y) => x.a - y.a).filter((x, i, arr) => i === 0 || x.p.x !== arr[i - 1].p.x || x.p.y !== arr[i - 1].p.y);
      for (let i = 1; i < sobre.length; i++) doHall.push(trecho(tipo, sobre[i - 1].p, zf, sobre[i].p, zf, hipA.dnMinimoAguaFriaMm));
      for (const [i, r] of ramais.entries()) {
        const A = noEixoDe[i].p;
        if (A.x !== r.E.x || A.y !== r.E.y) doHall.push(trecho(tipo, A, zf, r.E, zf, hipA.dnMinimoAguaFriaMm));
        doHall.push(trecho(tipo, r.E, zf, r.E, COTA_DO_HIDROMETRO_MM, hipA.dnMinimoAguaFriaMm));
      }
    } else {
      // Asas (L, U, T, H): os corredores se ligam nos nós — o motor da casa, só na circulação.
      const origemHall = falso('__origem-do-hall', P0, 'RESERVATORIO');
      const pa = planejarAgua(vista([origemHall, ...ramais.map((r, i) => falso(`__ramal-${i}`, r.E, 'TORNEIRA'))], hall), origemHall, hipA);
      doHall = pa.comandos.filter((x): x is Extract<Command, { type: 'AddTrecho' }> => x.type === 'AddTrecho').map((x) => ({ ...x, bitolaMm: hipA.dnMinimoAguaFriaMm }));
      if (pa.motivo && !doHall.length) pendencias.push({ grupo: 'VERIFICACAO', texto: `Água fria do hall: ${pa.motivo}` });
    }
    const pesoNoNo = new Map(ramais.map((r) => [chave(tipo, r.E.x, r.E.y, COTA_DO_HIDROMETRO_MM), r.peso]));
    bitolasPelaArvore(doHall, chave, chave(tipo, P0.x, P0.y, COTA_DO_HIDROMETRO_MM), pesoNoNo, hipA);
    lote.push(trecho(tipo, C, COTA_DO_HIDROMETRO_MM, P0, COTA_DO_HIDROMETRO_MM, dnDe(pesoDoAndar)), ...doHall);
    for (const r of ramais) lote.push(trecho(tipo, r.E, COTA_DO_HIDROMETRO_MM, r.O, COTA_DO_HIDROMETRO_MM, dnDe(r.peso)));
  }
  // ── A coluna no tipo (as cópias repetem): um trecho até o ramal do andar e outro até o teto. O DN é o do trecho mais
  // carregado — o do último andar, que leva o prédio inteiro (com a cópia viva os andares têm o mesmo tubo).
  const dnColuna = dnDe(pesoDoAndar * Math.max(1, andares));
  resultado.colunaDnMm = dnColuna;
  lote.unshift(trecho(tipo, C, 0, C, COTA_DO_HIDROMETRO_MM, dnColuna, ROTULO_DA_COLUNA_DE_AGUA), trecho(tipo, C, COTA_DO_HIDROMETRO_MM, C, pe(tipo), dnColuna, ROTULO_DA_COLUNA_DE_AGUA));
  comandos += ctx.aplicar(lote);
  // Os hidrômetros, um por unidade, no nicho da parede do hall (sobre o ramal, antes da parede).
  comandos += ctx.aplicar(
    ramais.map((r): Command => ({
      type: 'AddTerminal', levelId: tipo, disciplina: 'AGUA_FRIA', tipo: FICHA_DO_PONTO_HIDRAULICO.HIDROMETRO.rotulo, at: r.H, cotaMm: COTA_DO_HIDROMETRO_MM,
      tipoHidraulico: 'HIDROMETRO', rotulo: `Hidrômetro ${r.numero}`, ...(r.unidadeId ? { unidadeId: r.unidadeId } : {}), sugerida: true,
    }) as Command),
  );
  resultado.hidrometros = ramais.length;
  resultado.ramais = ramais;
  if (ramais.length) {
    const qMaiorM3h = Math.max(...ramais.map((r) => vazaoDeProjetoLs(r.peso))) * 3.6;
    const qMax = QMAX_DOS_HIDROMETROS_M3H.find((x) => qMaiorM3h <= FRACAO_DA_VAZAO_MAXIMA * x) ?? QMAX_DOS_HIDROMETROS_M3H[QMAX_DOS_HIDROMETROS_M3H.length - 1];
    resultado.qMaxDoHidrometroM3h = qMax;
    pendencias.push({ grupo: 'CONFERIR', texto: `Hidrômetros das unidades: vazão máxima de ${qMax} m³/h (a de projeto da maior unidade é ${f1(qMaiorM3h)} m³/h — a perda nele fica em até ${Math.round(perdaNoHidrometro(qMaiorM3h, qMax))} kPa); confira o modelo com a concessionária.` });
  }

  // ── O barrilete na cobertura: do fundo do superior à cabeça da coluna (o topo do trecho do último andar).
  if (superior && cobertura) {
    const S = superior.at as Point;
    const lb: Extract<Command, { type: 'AddTrecho' }>[] = [
      trecho(cobertura.levelId, S, superior.cotaMm, S, COTA_DO_BARRILETE_MM, dnColuna, ROTULO_DO_BARRILETE),
      ...emL(cobertura.levelId, S, C, COTA_DO_BARRILETE_MM, dnColuna, ROTULO_DO_BARRILETE),
      trecho(cobertura.levelId, C, COTA_DO_BARRILETE_MM, C, 0, dnColuna, ROTULO_DO_BARRILETE),
    ];
    comandos += ctx.aplicar(lb);
  } else pendencias.push({ grupo: 'NAO_DECIDIDO', texto: 'Água fria: sem o reservatório superior (cobertura), a coluna fica sem origem — ligue-a ao reservatório que o projeto definir.' });

  // ── O recalque: do inferior, pela bomba, subindo pelo shaft até o alto do superior.
  if (inferior && superior && terreo && cobertura) {
    const medidas = FICHA_DO_PONTO_HIDRAULICO.RESERVATORIO.medidasMm!;
    const I = inferior.at as Point;
    const d0 = { x: Rc.x - I.x, y: Rc.y - I.y };
    const n0 = Math.hypot(d0.x, d0.y) || 1;
    const afast = (inferior.larguraMm ?? medidas.larguraMm) / 2 + 600;
    const B = inteiro({ x: I.x + (d0.x / n0) * afast, y: I.y + (d0.y / n0) * afast });
    const chegada = superior.cotaMm + (superior.alturaMm ?? medidas.alturaMm) - 100;
    const S = superior.at as Point;
    // ── Dimensionamento (NBR 5626: Forchheimer pelas horas de funcionamento; a altura manométrica pelo desnível + perdas).
    const consumoL = dimensionarReservacao(ctx.m, HIPOTESES_RESERVATORIO_PADRAO).consumoDiarioL;
    const horas = HIPOTESES_RECALQUE_PADRAO.horasDeFuncionamento;
    const vazaoLs = consumoL / (horas * 3600);
    const dForch = diametroDeForchheimerMm(vazaoLs, horas);
    const dn = SERIE_PVC.find((x) => x.internoMm >= dForch - 1e-9)?.dn ?? SERIE_PVC[SERIE_PVC.length - 1].dn;
    const dnS = SERIE_PVC.find((x) => x.dn > dn)?.dn ?? dn;
    const lr: Extract<Command, { type: 'AddTrecho' }>[] = [
      trecho(terreo.levelId, B, inferior.cotaMm, B, COTA_DO_PERCURSO_DO_RECALQUE_MM, dn, ROTULO_DO_RECALQUE),
      ...emL(terreo.levelId, B, Rc, COTA_DO_PERCURSO_DO_RECALQUE_MM, dn, ROTULO_DO_RECALQUE),
      trecho(terreo.levelId, Rc, COTA_DO_PERCURSO_DO_RECALQUE_MM, Rc, pe(terreo.levelId), dn, ROTULO_DO_RECALQUE),
      trecho(tipo, Rc, 0, Rc, pe(tipo), dn, ROTULO_DO_RECALQUE),
      trecho(cobertura.levelId, Rc, 0, Rc, chegada, dn, ROTULO_DO_RECALQUE),
      ...emL(cobertura.levelId, Rc, S, chegada, dn, ROTULO_DO_RECALQUE),
    ];
    const elev = new Map(ctx.m.levels.map((l) => [l.id, l.elevationMm]));
    const comprimentoM = lr.reduce((s, t) => s + Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y, t.cotaBMm - t.cotaAMm), 0) / 1000 + (pe(tipo) / 1000) * Math.max(0, andares - 1);
    const desnivelM = ((elev.get(cobertura.levelId) ?? 0) + chegada - ((elev.get(terreo.levelId) ?? 0) + inferior.cotaMm)) / 1000;
    const curvas = lr.length + 1;
    const leqR = curvas * comprimentoEquivalenteM('JOELHO_90', dn) + comprimentoEquivalenteM('VALVULA_RETENCAO', dn) + comprimentoEquivalenteM('REGISTRO_GAVETA', dn) + comprimentoEquivalenteM('SAIDA', dn);
    const Ls = Math.hypot(B.x - I.x, B.y - I.y) / 1000;
    const leqS = comprimentoEquivalenteM('ENTRADA', dnS) + comprimentoEquivalenteM('JOELHO_90', dnS) + comprimentoEquivalenteM('REGISTRO_GAVETA', dnS);
    const hman = desnivelM + perdaDistribuida(vazaoLs, 'PVC_SOLDAVEL', dn, comprimentoM + leqR).perdaMca + perdaDistribuida(vazaoLs, 'PVC_SOLDAVEL', dnS, Ls + leqS).perdaMca;
    const potCv = (1000 * G * (vazaoLs / 1000) * hman) / HIPOTESES_RECALQUE_PADRAO.rendimento / W_POR_CV;
    const motorCv = MOTORES_CV.find((x) => x >= potCv - 1e-9) ?? MOTORES_CV[MOTORES_CV.length - 1];
    comandos += ctx.aplicar([
      { type: 'AddTerminal', levelId: terreo.levelId, disciplina: 'AGUA_FRIA', tipo: 'Bomba de recalque', at: B, cotaMm: inferior.cotaMm, tipoHidraulico: 'BOMBA', sugerida: true } as Command,
      trecho(terreo.levelId, I, inferior.cotaMm, B, inferior.cotaMm, dnS, ROTULO_DA_SUCCAO),
      ...lr,
    ]);
    resultado.recalque = { dnMm: dn, dnSuccaoMm: dnS, vazaoLs, alturaManometricaM: hman, motorCv };
    pendencias.push({ grupo: 'CONFERIR', texto: `Recalque: ${f1(vazaoLs)} L/s (o consumo diário em ${horas} h), DN ${dn} (sucção DN ${dnS}), altura manométrica ${f1(hman)} m → motor de ${motorCv.toLocaleString('pt-BR')} cv (duas bombas, uma reserva) — confira a curva no catálogo.` });
  } else if (inferior || superior) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: 'Recalque: falta um dos reservatórios (o inferior no térreo e o superior na cobertura) — o recalque fica para o projetista.' });

  // ── A reserva técnica de incêndio, no superior (por gravidade) — pela Tabela 4 da IT 17 do CBMMG.
  if (superior) {
    const areaM2 = (area(base.bloco.pontos as Point[]) / 1e6) * (andares + (terreo ? 1 : 0));
    const alturaM = (Math.max(...base.pisos, 0) - Math.min(...base.pisos, 0)) / 1000;
    if (areaM2 <= AREA_QUE_EXIGE_HIDRANTES_M2 && alturaM <= ALTURA_QUE_EXIGE_HIDRANTES_M) {
      pendencias.push({ grupo: 'PREMISSA', texto: `Reserva de incêndio: ${f1(areaM2)} m² e ${f1(alturaM)} m de altura — sem hidrantes pela IT 01 (até ${AREA_QUE_EXIGE_HIDRANTES_M2} m² e ${ALTURA_QUE_EXIGE_HIDRANTES_M} m); confira no PPCI.` });
    } else {
      const s = sistemaDeHidrantesMG({ divisao: { valor: 'A-2' }, carga: { valorMJm2: 300 }, areaTotalM2: areaM2 } as unknown as Parameters<typeof sistemaDeHidrantesMG>[0]);
      if (temSistema(s)) {
        const rti = s.reservaM3 * 1000;
        resultado.rtiL = rti;
        comandos += ctx.aplicar([{ type: 'SetTerminalProps', terminalId: superior.id, volumeL: (superior.volumeL ?? 0) + rti, volumeRtiL: rti } as Command]);
        pendencias.push({ grupo: 'CONFERIR', texto: `Reserva de incêndio: ${s.reservaM3} m³ no reservatório superior (${s.motivo}; área total ≈ ${f1(areaM2)} m² — o bloco × os pavimentos) — ${s.fonte}. O PPCI confere com a rede de hidrantes.` });
      } else pendencias.push({ grupo: 'NAO_DECIDIDO', texto: `Reserva de incêndio: ${s.motivo}` });
    }
  }
  resultado.comandos = comandos;
  return resultado;
}

// ─── Pressão ─────────────────────────────────────────────────────────────────

export interface PressaoDoPredio {
  comandos: number;
  estaticaMaxKpa: number | null;
  dinamicaMinKpa: number | null;
  pontos: number;
  insuficientes: number;
  excessivas: number;
  naoAvaliados: number;
  pressurizador: boolean;
  vrp: boolean;
  pendencias: PendenciaDoPpci[];
}

/**
 * A pressão da rede do superior (DEPOIS da cópia viva — só então a rede chega a todos os andares): pressurizador na
 * saída do superior se algum ponto fica abaixo da mínima; VRP no ramal de cada unidade se a estática passa de 400 kPa.
 */
export function conferirPressaoDaAgua(ctx: ContextoDoPredio, base: BaseDoPredio, ramais: readonly RamalDaUnidade[], hip: HipotesesDePressao = HIPOTESES_PRESSAO_PADRAO): PressaoDoPredio {
  const pendencias: PendenciaDoPpci[] = [];
  const superior = (ctx.m.terminais ?? []).find((t) => t.tipoHidraulico === 'RESERVATORIO' && t.disciplina === 'AGUA_FRIA' && t.papelReservatorio === 'SUPERIOR') ?? null;
  const vazio: PressaoDoPredio = { comandos: 0, estaticaMaxKpa: null, dinamicaMinKpa: null, pontos: 0, insuficientes: 0, excessivas: 0, naoAvaliados: 0, pressurizador: false, vrp: false, pendencias };
  if (!superior) return vazio;
  let comandos = 0;
  let r: PressoesDaRede = pressoesDaOrigem(ctx.m, superior, hip);
  if (r.motivo) {
    pendencias.push({ grupo: 'VERIFICACAO', texto: `Pressão da água fria: ${r.motivo}` });
    return vazio;
  }
  const kpa = (v: number) => `${Math.round(v)} kPa`;
  let pressurizador = false;
  const faltando = r.pontos.filter((p) => p.estado === 'INSUFICIENTE');
  if (faltando.length) {
    const pior = [...faltando].sort((a, b) => a.disponivelKpa! - a.minimaKpa - (b.disponivelKpa! - b.minimaKpa))[0];
    comandos += ctx.aplicar([{ type: 'AddTerminal', levelId: superior.levelId, disciplina: 'AGUA_FRIA', tipo: 'Pressurizador', at: { x: superior.at.x + 400, y: superior.at.y }, cotaMm: superior.cotaMm, tipoHidraulico: 'BOMBA', rotulo: 'Pressurizador', sugerida: true } as Command]);
    pressurizador = true;
    pendencias.push({ grupo: 'CONFERIR', texto: `Pressão: ${faltando.length} ponto(s) abaixo da mínima (o pior, ${pior.nome}, com ${kpa(pior.disponivelKpa!)} de ${kpa(pior.minimaKpa)}) — pressurizador na saída do reservatório superior (+${hip.ganhoDoPressurizadorKpa} kPa); o ponto de força e o circuito dele no quadro de serviço ficam para o projetista. Confira o modelo no catálogo.` });
    r = pressoesDaOrigem(ctx.m, superior, hip);
  }
  let vrp = false;
  const excessivas = r.pontos.filter((p) => p.estado === 'EXCESSIVA');
  if (excessivas.length && ramais.length) {
    const andares = new Set(excessivas.map((p) => p.levelId));
    // No ramal de cada unidade, depois do hidrômetro: o tipo leva, e as cópias repetem (uma sincronização só).
    comandos += ctx.aplicar(
      ramais.map((x): Command => ({ type: 'AddTerminal', levelId: base.tipoLevelId, disciplina: 'AGUA_FRIA', tipo: 'VRP', at: inteiro({ x: x.E.x + (x.O.x - x.E.x) * 0.4, y: x.E.y + (x.O.y - x.E.y) * 0.4 }), cotaMm: COTA_DO_HIDROMETRO_MM, tipoHidraulico: 'VRP', rotulo: `VRP ${x.numero}`, sugerida: true }) as Command),
    );
    vrp = true;
    const nomes = ctx.m.levels.filter((l) => andares.has(l.id)).sort((a, b) => a.elevationMm - b.elevationMm).map((l) => l.name);
    pendencias.push({ grupo: 'CONFERIR', texto: `Pressão: a estática passa de ${hip.estaticaMaximaKpa} kPa (NBR 5626) em ${excessivas.length} ponto(s) de ${nomes.length} andar(es) (${nomes.slice(0, 3).join(', ')}${nomes.length > 3 ? '…' : ''}) — VRP no ramal de cada unidade, depois do hidrômetro, ajustada em ${hip.ajusteDaVrpKpa} kPa. Com a cópia viva todos os andares levam; nos de cima, com a pressão abaixo do ajuste, ela não atua — confira se o projeto prefere uma estação redutora na coluna.` });
    r = pressoesDaOrigem(ctx.m, superior, hip);
  }
  const avaliados = r.pontos.filter((p) => p.disponivelKpa != null);
  const res: PressaoDoPredio = {
    comandos,
    estaticaMaxKpa: avaliados.length ? Math.max(...avaliados.map((p) => p.estaticaKpa!)) : null,
    dinamicaMinKpa: avaliados.length ? Math.min(...avaliados.map((p) => p.disponivelKpa!)) : null,
    pontos: r.pontos.length,
    insuficientes: r.pontos.filter((p) => p.estado === 'INSUFICIENTE').length,
    excessivas: r.pontos.filter((p) => p.estado === 'EXCESSIVA').length,
    naoAvaliados: r.pontos.filter((p) => p.estado === 'NAO_AVALIADO').length,
    pressurizador,
    vrp,
    pendencias,
  };
  for (const estado of ['INSUFICIENTE', 'EXCESSIVA', 'NAO_AVALIADO'] as const) {
    const lista = r.pontos.filter((p) => p.estado === estado);
    if (!lista.length) continue;
    const locais = lista.slice(0, 20).map((p): LocalDaPendencia => ({ levelId: p.levelId, ids: [p.terminalId], ponto: p.at as Point }));
    const texto =
      estado === 'NAO_AVALIADO'
        ? `${lista.length} ponto(s) de água fria fora da rede do reservatório superior (${lista[0].nome}: ${lista[0].motivo ?? 'sem caminho'})`
        : `${lista.length} ponto(s) ainda ${estado === 'INSUFICIENTE' ? 'abaixo da pressão mínima' : 'com estática acima do limite'} (${lista[0].nome})`;
    pendencias.push({ grupo: 'VERIFICACAO', texto: `Pressão da água fria: ${texto}.`, locais });
  }
  for (const a of r.avisos) pendencias.push({ grupo: 'CONFERIR', texto: `Pressão da água fria: ${a}` });
  return res;
}
