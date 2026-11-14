/**
 * Prédio automático — o TÉRREO, a COBERTURA e os RESERVATÓRIOS (PA3 do plano docs/planos/2026-11-12-predio-automatico.md,
 * 14/11/2026). O orquestrador chama cada etapa com o modelo corrente e o `aplicar` do lote; elas decidem e aplicam.
 *
 * - Térreo: pavimento próprio do bloco com o esqueleto do tipo (paredes da montagem e as portas delas), as fatias das
 *   unidades viram salas do condomínio, a porta de entrada no hall voltada para a rua, e o núcleo passa a partir dele.
 * - Cobertura: pavimento sobre o último andar com a laje, a platibanda e a área técnica nomeada.
 * - Reservatórios: o volume pela população contada nos dormitórios (todas as unidades), 60 % no inferior.
 */
import { pointInPolygon, signedArea, uidDeterministico } from '../blueprintKernel';
import type { BlueprintModel, Bloco, Command, ObjectId, Point, Wall } from '../blueprintKernel';
import type { DivisaoDoPavimento } from '../blueprintPavimentoTipoDaMassa';
import { dimensionarReservacao, HIPOTESES_RESERVATORIO_PADRAO } from '../blueprintReservacao';
import type { HipotesesDoPredio } from './hipoteses';

/** O que as etapas leem do orquestrador: o modelo de agora e o acumulador do lote. */
export interface ContextoDoPredio {
  readonly m: BlueprintModel;
  aplicar: (lote: Command[]) => number;
}

export interface BaseDoPredio {
  bloco: Bloco;
  divisao: DivisaoDoPavimento;
  tipoLevelId: ObjectId;
  /** O último andar com unidades (a última cópia, ou o tipo sem cópias). */
  ultimoLevelId: ObjectId;
  /** As cotas dos pavimentos acima do solo do bloco. */
  pisos: number[];
  /** Unitário, do lote para a rua; null sem frente marcada. */
  rua: Point | null;
}

export const SALA_HALL = 'Hall de entrada e portaria';
export const SALA_MEDICAO = 'Centro de medição';
export const SALA_BOMBAS = 'Casa de bombas e reservatório inferior';
export const SALA_MEDICAO_E_BOMBAS = 'Centro de medição, casa de bombas e reservatório inferior';
export const SALA_COMUM = 'Área comum';
export const NOME_DA_COBERTURA = 'Cobertura — área técnica (condensadoras e reservatório superior)';

const centro = (pts: readonly Point[]): Point => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const inteiro = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });

/** Distância do ponto ao contorno fechado (o menor afastamento a uma aresta). */
function distanciaAoContorno(p: Point, anel: readonly Point[]): number {
  let melhor = Infinity;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    melhor = Math.min(melhor, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return melhor;
}

const meio = (w: Pick<Wall, 'a' | 'b'>): Point => ({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 });
const comprimento = (w: Pick<Wall, 'a' | 'b'>) => dist(w.a, w.b);

/**
 * O trecho da parede (mm desde a ponta `a`) que faz divisa com o ambiente: os vértices do anel a até 300 mm do eixo
 * dela, projetados nele e limitados às pontas; null quando o ambiente não encosta.
 */
function trechoNaParede(w: Pick<Wall, 'a' | 'b'>, anel: readonly Point[]): { ini: number; fim: number } | null {
  const L = comprimento(w);
  if (L <= 0) return null;
  const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
  const ts = anel.filter((p) => Math.abs((p.x - w.a.x) * u.y - (p.y - w.a.y) * u.x) <= 300).map((p) => (p.x - w.a.x) * u.x + (p.y - w.a.y) * u.y);
  if (ts.length < 2) return null;
  const ini = Math.max(0, Math.min(...ts));
  const fim = Math.min(L, Math.max(...ts));
  return fim > ini ? { ini, fim } : null;
}
/** A parede na borda do bloco (fachada): o meio dela a menos de 300 mm do contorno. */
const naFachada = (w: Wall, contorno: readonly Point[]) => distanciaAoContorno(meio(w), contorno) <= 300;

/** O centro do núcleo do tipo (os anéis dos elevadores e do shaft), ou o do corredor sem núcleo desenhado. */
export function centroDoNucleo(m: BlueprintModel, base: BaseDoPredio): Point {
  const aneis = (m.nucleos ?? []).filter((n) => n.levelId === base.tipoLevelId || pavimentoDoNucleoEhDoBloco(m, n.levelId, base)).flatMap((n) => n.ring);
  if (aneis.length) return centro(aneis);
  const corredor = m.spaces.find((s) => s.levelId === base.tipoLevelId && m.labels.some((l) => l.levelId === base.tipoLevelId && l.name === 'Circulação' && pointInPolygon(s.ring, l.at)));
  return corredor ? centro(corredor.ring) : centro(base.bloco.pontos);
}
const pavimentoDoNucleoEhDoBloco = (m: BlueprintModel, levelId: ObjectId, base: BaseDoPredio) => m.levels.find((l) => l.id === levelId)?.uid === uidDoTerreo(base.bloco);

export const uidDoTerreo = (b: Pick<Bloco, 'uid'>) => uidDeterministico(`massa:pavimento-terreo:${b.uid}`);
export const uidDaCobertura = (b: Pick<Bloco, 'uid'>) => uidDeterministico(`massa:cobertura:${b.uid}`);

/** As funções das fatias do térreo, na ordem em que as fatias são escolhidas (a 1ª é o hall). */
export function salasDoTerreo(fatias: number): string[] {
  if (fatias <= 0) return [];
  if (fatias === 1) return [SALA_HALL];
  if (fatias === 2) return [SALA_HALL, SALA_MEDICAO_E_BOMBAS];
  return [SALA_HALL, SALA_MEDICAO, SALA_BOMBAS, ...Array.from({ length: fatias - 3 }, () => SALA_COMUM)];
}

export interface TerreoMontado {
  levelId: ObjectId;
  comandos: number;
  /** As salas na ordem das fatias escolhidas; a 1ª é o hall. */
  salas: { nome: string; numeroDaFatia: string; ponto: Point }[];
  acesso: boolean;
  avisos: string[];
}

/** O térreo: o pavimento, o esqueleto do tipo, o núcleo desde ele, os nomes das salas e a porta de entrada. */
export function montarTerreo(ctx: ContextoDoPredio, base: BaseDoPredio, hip: HipotesesDoPredio): TerreoMontado {
  const { bloco: b, divisao: dv, tipoLevelId: tipo } = base;
  const avisos: string[] = [];
  let n = 0;
  n += ctx.aplicar([{ type: 'AddLevel', name: `${b.nome} · 1º pav (térreo)`.slice(0, 60), elevationMm: base.pisos[0], defaultHeightMm: b.peDireitoMm, uid: uidDoTerreo(b) }]);
  const terreo = ctx.m.levels.find((l) => l.uid === uidDoTerreo(b))!.id;

  // O esqueleto do tipo — as paredes da MONTAGEM (a etapa roda antes das plantas) com as portas hospedadas.
  const paredes = ctx.m.walls.filter((w) => w.levelId === tipo).map((w) => w.id);
  n += ctx.aplicar([{ type: 'DuplicateEntities', levelId: terreo, wallIds: paredes, boundaryIds: [], structuralIds: [], openings: [], delta: { x: 0, y: 0 } }]);

  // O núcleo passa a partir do térreo: UMA peça por elevador e shaft (os do tipo e das cópias saem). O elevador vai até o
  // último andar com unidades — a casa de máquinas assenta sobre a laje da cobertura; o shaft vai até o mais alto.
  const doTipo = (ctx.m.nucleos ?? []).filter((x) => x.levelId === tipo);
  const novos: Command[] = doTipo.map((x) => ({
    type: 'AddNucleo',
    levelId: terreo,
    tipo: x.tipo,
    ring: x.ring.map((p) => ({ ...p })),
    ateLevelId: x.tipo === 'ELEVADOR' ? base.ultimoLevelId : null,
    rotulo: x.rotulo ?? null,
    ...(x.disciplina ? { disciplina: x.disciplina } : {}),
    ...(x.tipo === 'ELEVADOR' ? { pocoMm: x.pocoMm ?? null, casaDeMaquinasMm: x.casaDeMaquinasMm ?? null, capacidade: x.capacidade ?? null } : {}),
  }));
  n += ctx.aplicar([...novos, ...doTipo.map((x): Command => ({ type: 'DeleteNucleo', nucleoId: x.id }))]);
  // O lance da escada do térreo ao tipo: a mesma escada do tipo, no térreo.
  const escadas = ctx.m.stairs.filter((e) => e.levelId === tipo);
  n += ctx.aplicar(escadas.map((e): Command => ({ type: 'AddEscada', levelId: terreo, pontos: e.pontos.map((p) => ({ ...p })), tipo: e.tipo, larguraMm: e.larguraMm, alvoEspelhoMm: e.alvoEspelhoMm, rotulo: e.rotulo ?? null })));

  // Os nomes: circulação e núcleo repetem os do tipo; cada fatia de unidade vira sala do condomínio.
  const daUnidade = new Set((ctx.m.unidades ?? []).flatMap((u) => u.etiquetaUids));
  const espacoEm = (p: Point) => ctx.m.spaces.find((s) => s.levelId === terreo && pointInPolygon(s.ring, p)) ?? null;
  const nomes: Command[] = [];
  const nomeados = new Set<ObjectId>();
  for (const l of ctx.m.labels.filter((x) => x.levelId === tipo && !daUnidade.has(x.uid))) {
    const s = espacoEm(l.at);
    if (s && !nomeados.has(s.id)) {
      nomes.push({ type: 'NameSpace', spaceId: s.id, name: l.name });
      nomeados.add(s.id);
    }
  }
  const nucleo = centroDoNucleo(ctx.m, base);
  const rua = base.rua;
  const fatias = dv.unidades.map((u) => ({ u, c: centro(u.anel) }));
  // O hall: a fatia da FRENTE mais perto do núcleo; sem frente, a mais voltada para a rua.
  const deFrente = fatias.filter((f) => f.u.posicaoNoLote === 'FRENTE').sort((a, c) => dist(a.c, nucleo) - dist(c.c, nucleo));
  const paraRua = (f: { c: Point }) => (rua ? (f.c.x - nucleo.x) * rua.x + (f.c.y - nucleo.y) * rua.y : 0);
  const hall = deFrente[0] ?? [...fatias].sort((a, c) => paraRua(c) - paraRua(a) || dist(a.c, nucleo) - dist(c.c, nucleo))[0];
  const ordem = hall ? [hall, ...fatias.filter((f) => f !== hall).sort((a, c) => dist(a.c, nucleo) - dist(c.c, nucleo))] : [];
  const funcoes = salasDoTerreo(ordem.length);
  const salas: TerreoMontado['salas'] = [];
  ordem.forEach((f, i) => {
    const s = espacoEm(f.c);
    if (!s || nomeados.has(s.id)) {
      avisos.push(`Térreo: a fatia da unidade ${f.u.numero} não fechou um ambiente — "${funcoes[i]}" ficou sem nome.`);
      return;
    }
    nomes.push({ type: 'NameSpace', spaceId: s.id, name: funcoes[i] });
    nomeados.add(s.id);
    salas.push({ nome: funcoes[i], numeroDaFatia: f.u.numero, ponto: inteiro(f.c) });
  });
  n += ctx.aplicar(nomes);

  // A porta de entrada: no TRECHO de fachada do hall mais voltado para a rua (sem frente marcada, o mais longo). A parede
  // de fachada pode correr o lado inteiro do bloco — o que conta é o trecho dela que faz divisa com o hall.
  let acesso = false;
  const espacoDoHall = hall ? espacoEm(hall.c) : null;
  if (espacoDoHall) {
    const cHall = centro(espacoDoHall.ring);
    const candidatas = ctx.m.walls
      .filter((w) => w.levelId === terreo && naFachada(w, b.pontos))
      .flatMap((w) => {
        const t = trechoNaParede(w, espacoDoHall.ring);
        if (!t || t.fim - t.ini < hip.larguraDoAcessoMm + 300) return [];
        const L = comprimento(w);
        const meioDoTrecho = (t.ini + t.fim) / 2;
        const p = { x: w.a.x + ((w.b.x - w.a.x) * meioDoTrecho) / L, y: w.a.y + ((w.b.y - w.a.y) * meioDoTrecho) / L };
        const v = { x: p.x - cHall.x, y: p.y - cHall.y };
        const l = Math.hypot(v.x, v.y) || 1;
        return [{ w, meioDoTrecho, nota: rua ? (v.x * rua.x + v.y * rua.y) / l : t.fim - t.ini }];
      })
      .sort((a, c) => c.nota - a.nota);
    const alvo = candidatas[0];
    if (alvo) {
      n += ctx.aplicar([{ type: 'AddOpening', wallId: alvo.w.id, kind: 'door', offsetMm: Math.round(alvo.meioDoTrecho - hip.larguraDoAcessoMm / 2), widthMm: hip.larguraDoAcessoMm, heightMm: 2100, sillMm: 0 }]);
      acesso = true;
    } else avisos.push(`Térreo: nenhuma parede de fachada do hall comporta a porta de entrada de ${hip.larguraDoAcessoMm} mm — desenhe o acesso.`);
  }
  if (ordem.length < 3) avisos.push(`Térreo: ${ordem.length} fatia(s) — ${ordem.length === 2 ? 'centro de medição e casa de bombas dividem a mesma sala' : 'sem sala para o centro de medição e a casa de bombas'}; confira com o projetista.`);
  return { levelId: terreo, comandos: n, salas, acesso, avisos };
}

export interface CoberturaMontada {
  levelId: ObjectId;
  comandos: number;
  cotaMm: number;
  avisos: string[];
}

/** A cobertura: o pavimento sobre o último andar, a laje, a platibanda (pelas paredes de fachada do tipo) e o nome. */
export function montarCobertura(ctx: ContextoDoPredio, base: BaseDoPredio, hip: HipotesesDoPredio): CoberturaMontada {
  const { bloco: b, tipoLevelId: tipo } = base;
  const avisos: string[] = [];
  let n = 0;
  const cotaMm = base.pisos[base.pisos.length - 1] + b.peDireitoMm;
  n += ctx.aplicar([{ type: 'AddLevel', name: `${b.nome} · cobertura`.slice(0, 60), elevationMm: cotaMm, defaultHeightMm: hip.peDireitoDaCoberturaMm, uid: uidDaCobertura(b) }]);
  const cob = ctx.m.levels.find((l) => l.uid === uidDaCobertura(b))!.id;
  // Sem rótulo: a prancha escreve o da estrutura no centro da peça e o nome do ambiente no centro do espaço — aqui a laje
  // É o espaço, e os dois textos caíam um sobre o outro. A numeração das lajes (L1, L2…) vem com a estrutura (PA4).
  n += ctx.aplicar([{ type: 'AddStructural', levelId: cob, kind: 'LAJE', pontos: b.pontos.map((p) => ({ ...p })), alturaMm: hip.espessuraDaLajeMm, baseMm: 0, rotulo: null }]);
  // A platibanda segue as paredes de fachada do tipo (a mesma linha da fachada), na altura dela.
  const fachada = ctx.m.walls.filter((w) => w.levelId === tipo && naFachada(w, b.pontos));
  n += ctx.aplicar(fachada.map((w): Command => ({ type: 'AddWall', levelId: cob, a: { ...w.a }, b: { ...w.b }, thicknessMm: w.thicknessMm, heightMm: hip.alturaDaPlatibandaMm })));
  const maior = ctx.m.spaces.filter((s) => s.levelId === cob).sort((a, c) => Math.abs(signedArea(c.ring)) - Math.abs(signedArea(a.ring)))[0];
  if (maior) n += ctx.aplicar([{ type: 'NameSpace', spaceId: maior.id, name: NOME_DA_COBERTURA }]);
  else avisos.push('Cobertura: a platibanda não fechou um ambiente — a área técnica ficou sem nome.');
  return { levelId: cob, comandos: n, cotaMm, avisos };
}

export interface ReservatoriosLancados {
  comandos: number;
  pessoas: number;
  totalL: number;
  inferiorL: number | null;
  superiorL: number | null;
  texto: string;
  avisos: string[];
}

/** Os reservatórios: o inferior na casa de bombas do térreo, o superior sobre o núcleo na cobertura. */
export function lancarReservatorios(
  ctx: ContextoDoPredio,
  base: BaseDoPredio,
  hip: HipotesesDoPredio,
  terreo: { levelId: ObjectId; bombas: Point | null } | null,
  cobertura: { levelId: ObjectId } | null,
): ReservatoriosLancados {
  const avisos: string[] = [];
  const dim = dimensionarReservacao(ctx.m, HIPOTESES_RESERVATORIO_PADRAO, new Set());
  const pessoas = dim.populacao.pessoas;
  const totalL = Math.round(dim.volumeNecessarioL);
  if (pessoas <= 0 || totalL <= 0) {
    avisos.push('Reservatórios: nenhum dormitório contado (plantas desligadas?) — declare a população para dimensionar a reservação.');
    return { comandos: 0, pessoas, totalL: 0, inferiorL: null, superiorL: null, texto: dim.texto, avisos };
  }
  const comInferior = !!terreo?.bombas;
  const inferiorL = comInferior ? Math.round(totalL * HIPOTESES_RESERVATORIO_PADRAO.fracaoInferior) : null;
  const superiorL = cobertura ? totalL - (inferiorL ?? 0) : null;
  const lote: Command[] = [];
  if (comInferior && inferiorL) {
    lote.push({ type: 'AddTerminal', levelId: terreo!.levelId, disciplina: 'AGUA_FRIA', tipo: 'Reservatório inferior', at: terreo!.bombas!, cotaMm: 0, tipoHidraulico: 'RESERVATORIO', papelReservatorio: 'INFERIOR', volumeL: inferiorL, sugerida: true });
  } else if (terreo) avisos.push('Reservatórios: o térreo não tem a casa de bombas — o reservatório inferior ficou para o projetista.');
  if (cobertura && superiorL) {
    lote.push({ type: 'AddTerminal', levelId: cobertura.levelId, disciplina: 'AGUA_FRIA', tipo: 'Reservatório superior', at: inteiro(centroDoNucleo(ctx.m, base)), cotaMm: hip.cotaDoReservatorioSuperiorMm, tipoHidraulico: 'RESERVATORIO', papelReservatorio: 'SUPERIOR', volumeL: superiorL, sugerida: true });
  } else avisos.push('Reservatórios: sem a cobertura, o reservatório superior ficou para o projetista.');
  const comandos = ctx.aplicar(lote);
  const litros = (v: number) => `${v.toLocaleString('pt-BR')} L`;
  const texto = `${pessoas} pessoa(s) pelos dormitórios × ${HIPOTESES_RESERVATORIO_PADRAO.perCapitaLDia} L/dia × ${HIPOTESES_RESERVATORIO_PADRAO.diasDeReserva} dia(s) = ${litros(totalL)}${inferiorL != null ? `: inferior ${litros(inferiorL)}` : ''}${superiorL != null ? `${inferiorL != null ? ',' : ':'} superior ${litros(superiorL)}` : ''}.`;
  return { comandos, pessoas, totalL, inferiorL, superiorL, texto, avisos };
}
