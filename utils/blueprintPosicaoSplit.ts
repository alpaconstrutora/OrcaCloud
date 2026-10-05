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
import { TIPOS_DE_CLIMATIZACAO, applyBatch } from './blueprintKernel';
import { pointInPolygon, signedArea, interiorPoint } from './blueprintKernel/geom';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { ladosDePiso, trechosUtilizaveis, type LadoDoAmbiente } from './blueprintDistribuicao';
import type { CargaTermicaDoNivel } from './blueprintCargaTermica';
import type { HipotesesDeSelecao } from './blueprintClimatizacao';
import { potenciaEletricaVA, type ModeloDoCatalogo, type SelecaoDoNivel } from './blueprintSelecaoClimatizacao';

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

export interface PlanoDeEquipamentosSplit {
  comandos: Command[];
  aCriar: EquipamentoPlanejado[];
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

/**
 * O giro da peça para o símbolo soprar para dentro: as lâminas do símbolo
 * ficam no +y LOCAL da tela (y para baixo), e o canvas desenha com
 * `rotate(-giro)`. Para a normal interna `n` do modelo (y para cima), o vetor
 * na tela é (n.x, −n.y), e R(−g)·(0, 1) = (sin g, cos g) ⇒ g = atan2(n.x, −n.y).
 */
export function giroParaSoprarParaDentro(n: { x: number; y: number }): number {
  return Math.round((Math.atan2(n.x, -n.y) * 180) / Math.PI);
}

interface LugarDaEvaporadora {
  lado: LadoDoAmbiente;
  at: Point;
  normal: { x: number; y: number };
  externa: boolean;
  livreMm: number;
}

/**
 * A parede livre: sem porta, trecho sem vão ≥ largura da peça + folgas; externa
 * primeiro, depois a de maior trecho livre. O ponto fica no MEIO do trecho,
 * recuado meia profundidade para dentro (a peça encosta na face).
 */
export function lugarDaEvaporadora(
  model: BlueprintModel,
  space: Space,
  larguraMm: number,
  profundidadeMm: number,
  ehExterna: (wallId: string) => boolean,
): LugarDaEvaporadora | null {
  const walls = model.walls.filter((w) => w.levelId === space.levelId);
  const idsDasParedes = new Set(walls.map((w) => w.id));
  const openings = model.openings.filter((o) => idsDasParedes.has(o.wallId));
  const lados = ladosDePiso(space, walls);
  const candidatos: LugarDaEvaporadora[] = [];
  for (const lado of lados) {
    if (!lado.wallId) continue;
    if (openings.some((o) => o.wallId === lado.wallId && (o.kind === 'door' || o.kind === 'sliding' || o.kind === 'passage'))) continue;
    const trechos = trechosUtilizaveis(lado, walls, openings, FOLGA_DA_EVAPORADORA_MM).filter((t) => t.ate - t.de >= larguraMm);
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
  if (tecnico) return { at: interiorPoint(tecnico.s.ring, tecnico.s.holes), lugar: 'AMBIENTE_TECNICO' };
  return null;
}

/** O plano: um split por ambiente climatizado sem equipamento confirmado. */
export function planejarEquipamentosSplit(model: BlueprintModel, selecao: SelecaoDoNivel, carga: CargaTermicaDoNivel, hip: HipotesesDeSelecao): PlanoDeEquipamentosSplit {
  const vazio = (motivo: string, apagados = 0, comandos: Command[] = []): PlanoDeEquipamentosSplit => ({ comandos, aCriar: [], jaAtendidos: [], semLugar: [], apagados, motivo, resumo: [] });
  const levelId = selecao.levelId;
  // As sugestões anteriores deste planejador somem no relançar (peça de climatização sugerida + o ponto elétrico sugerido do aparelho).
  const sugeridas = (model.terminais ?? []).filter(
    (t) => t.levelId === levelId && !!t.sugerida && ((!!t.tipoHidraulico && (TIPOS_DE_CLIMATIZACAO as readonly string[]).includes(t.tipoHidraulico)) || t.tipoEletrico === 'AR_CONDICIONADO'),
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

  for (const amb of selecao.ambientes) {
    const confirmadas = amb.evaporadoras.filter((e) => !idsSugeridas.has(e.id));
    if (confirmadas.length > 0) {
      jaAtendidos.push(amb.nome);
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
    const lugar = lugarDaEvaporadora(model, space, larguraMm, profundidadeMm, ehExterna);
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
      cotaMm: modelo.cotaMm,
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
    adds.push({
      type: 'AddTerminal',
      levelId,
      disciplina: 'ELETRICA',
      tipo: `Ar-condicionado ${modelo.capacidadeBtuH.toLocaleString('pt-BR')} BTU/h`,
      tipoEletrico: 'AR_CONDICIONADO',
      at: { x: lugar.at.x, y: lugar.at.y },
      cotaMm: modelo.cotaMm,
      potenciaW: potenciaVA,
      sugerida: true,
    } as Command);
    pares.push({ evap: iEvap, cond: iCond });
    aCriar.push({ spaceId: amb.spaceId, nome: amb.nome, modelo, evaporadora: lugar.at, rotacaoGraus, condensadora: cond?.at ?? null, lugarDaCondensadora: cond?.lugar ?? null, potenciaVA });
    if (!cond) semLugar.push({ nome: amb.nome, motivo: 'condensadora: sem fachada externa nem ambiente técnico no pavimento — posicione à mão e ligue o sistema no painel' });
  }

  if (adds.length === 0) {
    const motivo = semLugar.length ? `nenhum equipamento a lançar: ${semLugar.map((s) => `${s.nome} (${s.motivo})`).join('; ')}` : apagar.length ? null : 'todos os ambientes climatizados já têm equipamento confirmado';
    return { comandos: apagar, aCriar: [], jaAtendidos, semLugar, apagados: apagar.length, motivo, resumo: [] };
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
  } catch (e) {
    return vazio(`o plano não aplica: ${e instanceof Error ? e.message : String(e)}`, apagar.length);
  }

  const resumo: string[] = [];
  for (const p of aCriar) {
    resumo.push(
      `${p.nome}: ${p.modelo.nome} (${p.modelo.capacidadeBtuH.toLocaleString('pt-BR')} BTU/h, ${p.potenciaVA.toLocaleString('pt-BR')} VA) — evaporadora na parede, condensadora ${p.lugarDaCondensadora === 'FACHADA' ? 'na fachada' : p.lugarDaCondensadora === 'AMBIENTE_TECNICO' ? 'no ambiente técnico' : 'A POSICIONAR'}`,
    );
  }
  return { comandos: [...apagar, ...adds, ...ligar], aCriar, jaAtendidos, semLugar, apagados: apagar.length, motivo: null, resumo };
}
