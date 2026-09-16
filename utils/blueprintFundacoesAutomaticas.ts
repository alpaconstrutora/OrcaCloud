import {
  applyBatch,
  contornoEmPlanta,
  pointInPolygon,
  type BlueprintModel,
  type Command,
  type ObjectId,
  type Point,
  type Structural,
} from './blueprintKernel';
import { idsPrevistosDeEstrutura, pilaresExistentesNoNivel, proximoNumeroDoRotulo } from './blueprintPilaresAutomaticos';

/**
 * LANÇAMENTO AUTOMÁTICO DE FUNDAÇÕES — blocos de coroamento e estacas (16/09/2026).
 *
 * Pedido: *"Implemente também estacas e blocos de coroamento"*.
 *
 * O mesmo molde dos pilares, vigas e lajes: o sistema PROPÕE, quem projeta
 * confirma, Ctrl+Z desfaz o lote inteiro; prévia na gaveta e tracejada no
 * desenho; um `runBatch` provado antes por simulação; "Relançar" apaga as
 * fundações do pavimento e lança de novo. Sem campo novo no kernel.
 *
 * ─── O QUE SE PROPÕE (decidido com o usuário em 16/09/2026) ───────────────
 *
 *  1. UM BLOCO por pilar do pavimento ativo, centrado no pilar e girado com
 *     ele. Sem pilar, não há o que fundar — lance os pilares antes.
 *  2. Uma estaca por bloco (padrão) no centro; ou duas, com o bloco alongado
 *     ao longo do eixo do pilar e as estacas a 3Ø uma da outra.
 *  3. Lado do bloco = o maior entre Ø + 30 cm e lado do pilar + 20 cm, a cada
 *     5 cm. Bloco de duas estacas: comprimento 4Ø + 30 cm.
 *  4. Cotas: topo do bloco no ARRASAMENTO (50 cm abaixo do piso, hipótese);
 *     a estaca começa na base do bloco e desce o comprimento declarado.
 *  5. Peça enterrada não cruza o piso: não sobrepõe parede (nada cede) e não
 *     entra no arranjo dos ambientes.
 *  6. O PILAR DESCE até o topo do bloco (16/09/2026, print do 3D do usuário:
 *     a casa flutuava 50 cm acima dos blocos). O lote acrescenta um
 *     `SetStructuralProps` por pilar cujo pé está acima do arrasamento: base =
 *     −arrasamento, altura = topo − base. O pilar continua cruzando o piso
 *     (base ≤ 0 < topo), então nada muda no arranjo nem no desconto da parede.
 *
 * ─── O QUE É NORMA E O QUE É HIPÓTESE ───────────────────────────────────────
 *
 * Aqui é tudo hipótese nomeada na gaveta: Ø, comprimento, altura do bloco,
 * arrasamento, estacas por bloco. Fundação se dimensiona com a sondagem na mão
 * (NBR 6122) — capacidade de carga, comprimento útil e armadura são do
 * responsável técnico. O lançamento só marca ONDE a fundação fica e com que
 * dimensões declaradas o quantitativo vai contar.
 */

export interface HipotesesDeFundacoes {
  estacasPorBloco: 1 | 2;
  diametroDaEstacaMm: number;
  comprimentoDaEstacaMm: number;
  alturaDoBlocoMm: number;
  /** Quanto o TOPO do bloco fica abaixo do piso (cota de arrasamento), em mm. */
  arrasamentoMm: number;
}

export const HIPOTESES_FUNDACOES_PADRAO: HipotesesDeFundacoes = {
  estacasPorBloco: 1,
  diametroDaEstacaMm: 300,
  comprimentoDaEstacaMm: 8000,
  alturaDoBlocoMm: 600,
  arrasamentoMm: 500,
};
export const ESTACAS_POR_BLOCO = [1, 2] as const;
export const DIAMETROS_DE_ESTACA = [250, 300, 400] as const;
export const COMPRIMENTOS_DE_ESTACA = [6000, 8000, 10000, 12000] as const;
export const ALTURAS_DE_BLOCO = [400, 500, 600, 800] as const;
export const ARRASAMENTOS = [300, 500, 800] as const;

/** Folga do bloco além da estaca (15 cm por lado) e além do pilar (10 cm por lado). */
const FOLGA_DA_ESTACA_MM = 300;
const FOLGA_DO_PILAR_MM = 200;
/** Espaçamento entre estacas de um bloco, em diâmetros. */
const ESPACAMENTO_EM_DIAMETROS = 3;
const PASSO_MM = 50;

const arred5 = (mm: number) => Math.ceil(mm / PASSO_MM) * PASSO_MM;

/** Lado (transversal) do bloco: o maior entre Ø + 30 cm e lado do pilar + 20 cm, a cada 5 cm. */
export function ladoDoBloco(diametroMm: number, ladoMaiorDoPilarMm: number): number {
  return arred5(Math.max(diametroMm + FOLGA_DA_ESTACA_MM, ladoMaiorDoPilarMm + FOLGA_DO_PILAR_MM));
}

/** Comprimento do bloco de duas estacas, ao longo do eixo do pilar: 3Ø entre eixos + Ø + folgas. */
export function comprimentoDoBlocoDeDuas(diametroMm: number): number {
  return arred5(ESPACAMENTO_EM_DIAMETROS * diametroMm + diametroMm + FOLGA_DA_ESTACA_MM);
}

export interface EstacaPrevista {
  idPrevisto: ObjectId;
  rotulo: string;
  at: Point;
  diametroMm: number;
  comprimentoMm: number;
  baseMm: number;
}

export interface BlocoPrevisto {
  idPrevisto: ObjectId;
  rotulo: string;
  pilarId: ObjectId;
  pilarRotulo: string | null;
  at: Point;
  /** Ao longo do eixo do pilar (`rotacaoDeg`). */
  larguraMm: number;
  profundidadeMm: number;
  rotacaoDeg: number;
  alturaMm: number;
  baseMm: number;
  estacas: EstacaPrevista[];
  aviso: string | null;
}

export interface PlanoDeFundacoes {
  levelId: ObjectId;
  blocos: BlocoPrevisto[];
  /** Todas as estacas, na ordem dos comandos. */
  estacas: EstacaPrevista[];
  /** Todos os `AddStructural` de BLOCO (ordem de `blocos`), depois os de ESTACA, depois os pilares que descem. */
  comandos: Command[];
  /** Pilares cujo pé desce até o topo do bloco (`SetStructuralProps`). */
  pilaresQueDescem: ObjectId[];
  /** Pilares que já têm bloco — mantidos. */
  pilaresComBloco: number;
  avisos: string[];
  motivo: string | null;
}

export function fundacoesExistentesNoNivel(model: BlueprintModel, levelId: ObjectId): Structural[] {
  return (model.structures ?? []).filter(
    (s) => s.levelId === levelId && (s.kind === 'ESTACA' || s.kind === 'BLOCO_COROAMENTO'),
  );
}

const dist = (p: Point, q: Point) => Math.hypot(q.x - p.x, q.y - p.y);

export function planejarFundacoes(
  model: BlueprintModel,
  levelId: ObjectId,
  hip: HipotesesDeFundacoes = HIPOTESES_FUNDACOES_PADRAO,
): PlanoDeFundacoes {
  const vazio = (motivo: string, extras: Partial<PlanoDeFundacoes> = {}): PlanoDeFundacoes => ({
    levelId,
    blocos: [],
    estacas: [],
    comandos: [],
    pilaresQueDescem: [],
    pilaresComBloco: 0,
    avisos: [],
    motivo,
    ...extras,
  });
  const level = model.levels.find((l) => l.id === levelId);
  if (!level) return vazio('pavimento não encontrado');
  const pilares = [...pilaresExistentesNoNivel(model, levelId)].sort(
    (p, q) => p.pontos[0].x - q.pontos[0].x || p.pontos[0].y - q.pontos[0].y,
  );
  if (pilares.length === 0) return vazio('lance os pilares antes');

  const avisos: string[] = [];
  const maisBaixo = Math.min(...model.levels.map((l) => l.elevationMm));
  if (level.elevationMm > maisBaixo) avisos.push('fundação sob pavimento que não é o mais baixo');

  const diametro = Math.max(100, Math.round(hip.diametroDaEstacaMm));
  const comprimento = Math.max(1000, Math.round(hip.comprimentoDaEstacaMm));
  const hBloco = Math.max(200, Math.round(hip.alturaDoBlocoMm));
  const arrasamento = Math.max(0, Math.round(hip.arrasamentoMm));
  const duas = hip.estacasPorBloco === 2;
  const baseDoBloco = -(arrasamento + hBloco);
  const baseDaEstaca = baseDoBloco - comprimento;

  const blocosExistentes = fundacoesExistentesNoNivel(model, levelId).filter((s) => s.kind === 'BLOCO_COROAMENTO');
  let pilaresComBloco = 0;
  type Candidato = Omit<BlocoPrevisto, 'idPrevisto' | 'rotulo' | 'estacas'> & { estacas: Omit<EstacaPrevista, 'idPrevisto' | 'rotulo'>[] };
  const candidatos: Candidato[] = [];
  for (const p of pilares) {
    const centro = p.pontos[0];
    if (blocosExistentes.some((b) => pointInPolygon(contornoEmPlanta(b), centro))) {
      pilaresComBloco++;
      continue;
    }
    const ladoMaior = Math.max(p.larguraMm, p.circular ? p.larguraMm : p.profundidadeMm);
    const lb = ladoDoBloco(diametro, ladoMaior);
    const lc = duas ? Math.max(lb, comprimentoDoBlocoDeDuas(diametro)) : lb;
    const rad = (p.rotacaoDeg * Math.PI) / 180;
    const u = { x: Math.cos(rad), y: Math.sin(rad) };
    const meio = (ESPACAMENTO_EM_DIAMETROS * diametro) / 2;
    const estacas = (duas
      ? [
          { x: Math.round(centro.x - u.x * meio), y: Math.round(centro.y - u.y * meio) },
          { x: Math.round(centro.x + u.x * meio), y: Math.round(centro.y + u.y * meio) },
        ]
      : [{ x: centro.x, y: centro.y }]
    ).map((at) => ({ at, diametroMm: diametro, comprimentoMm: comprimento, baseMm: baseDaEstaca }));
    // Dois pilares mais perto que um bloco: os blocos se sobrepõem — avisado, não impedido.
    const vizinho = pilares.find((q) => q !== p && dist(q.pontos[0], centro) < Math.max(lb, lc));
    candidatos.push({
      pilarId: p.id,
      pilarRotulo: p.rotulo ?? null,
      at: { x: centro.x, y: centro.y },
      larguraMm: lc,
      profundidadeMm: lb,
      rotacaoDeg: p.rotacaoDeg,
      alturaMm: hBloco,
      baseMm: baseDoBloco,
      estacas,
      aviso: vizinho ? `bloco sobrepõe o do pilar ${vizinho.rotulo ?? 'vizinho'} — unifique à mão` : null,
    });
  }
  if (candidatos.length === 0) {
    return vazio('todos os pilares já têm bloco', { pilaresComBloco, avisos });
  }

  const nB = proximoNumeroDoRotulo(model, 'B');
  const nE = proximoNumeroDoRotulo(model, 'E');
  const totalEstacas = candidatos.reduce((n, c) => n + c.estacas.length, 0);
  const ids = idsPrevistosDeEstrutura(model, candidatos.length + totalEstacas);
  let kE = 0;
  const blocos: BlocoPrevisto[] = candidatos.map((c, k) => ({
    ...c,
    idPrevisto: ids[k],
    rotulo: `B${nB + k}`,
    estacas: c.estacas.map((e) => {
      const previsto: EstacaPrevista = { ...e, idPrevisto: ids[candidatos.length + kE], rotulo: `E${nE + kE}` };
      kE++;
      return previsto;
    }),
  }));
  const estacas = blocos.flatMap((b) => b.estacas);
  // O pilar desce até o topo do bloco (todos os do pavimento, inclusive os que
  // já tinham bloco): pé em −arrasamento, topo onde estava.
  const topoDoBloco = -arrasamento;
  const descem = pilares.filter((p) => p.baseMm > topoDoBloco);
  const comandos: Command[] = [
    ...blocos.map(
      (b): Command => ({
        type: 'AddStructural',
        levelId,
        kind: 'BLOCO_COROAMENTO',
        pontos: [b.at],
        larguraMm: b.larguraMm,
        profundidadeMm: b.profundidadeMm,
        alturaMm: b.alturaMm,
        baseMm: b.baseMm,
        circular: false,
        rotacaoDeg: b.rotacaoDeg,
        rotulo: b.rotulo,
      }),
    ),
    ...estacas.map(
      (e): Command => ({
        type: 'AddStructural',
        levelId,
        kind: 'ESTACA',
        pontos: [e.at],
        larguraMm: e.diametroMm,
        profundidadeMm: e.diametroMm,
        alturaMm: e.comprimentoMm,
        baseMm: e.baseMm,
        circular: true,
        rotulo: e.rotulo,
      }),
    ),
    ...descem.map(
      (p): Command => ({
        type: 'SetStructuralProps',
        structuralId: p.id,
        baseMm: topoDoBloco,
        alturaMm: p.baseMm + p.alturaMm - topoDoBloco,
      }),
    ),
  ];
  return { levelId, blocos, estacas, comandos, pilaresQueDescem: descem.map((p) => p.id), pilaresComBloco, avisos, motivo: null };
}

/** Apaga blocos e estacas do pavimento e lança de novo — ver `relancarPilares`. */
export function relancarFundacoes(
  model: BlueprintModel,
  levelId: ObjectId,
  hip: HipotesesDeFundacoes = HIPOTESES_FUNDACOES_PADRAO,
): PlanoDeFundacoes & { apagados: ObjectId[] } {
  const apagados = fundacoesExistentesNoNivel(model, levelId).map((s) => s.id);
  if (apagados.length === 0) return { ...planejarFundacoes(model, levelId, hip), apagados };
  const sem: BlueprintModel = { ...model, structures: (model.structures ?? []).filter((s) => !apagados.includes(s.id)) };
  const plano = planejarFundacoes(sem, levelId, hip);
  const deletes: Command[] = apagados.map((structuralId) => ({ type: 'DeleteStructural', structuralId }));
  return { ...plano, comandos: plano.comandos.length > 0 ? [...deletes, ...plano.comandos] : [], apagados };
}

export function conferirPlanoDeFundacoes(
  model: BlueprintModel,
  plano: PlanoDeFundacoes,
): { ok: true } | { ok: false; motivo: string } {
  if (plano.comandos.length === 0) return { ok: false, motivo: plano.motivo ?? 'nada a lançar' };
  try {
    const r = applyBatch(model, plano.comandos);
    const criados = r.diff.created.filter((id) => id.startsWith('str_'));
    const previstos = [...plano.blocos.map((b) => b.idPrevisto), ...plano.estacas.map((e) => e.idPrevisto)];
    if (criados.length !== previstos.length || criados.some((id, i) => id !== previstos[i])) {
      return { ok: false, motivo: `ids previstos (${previstos.join(', ')}) diferem dos criados (${criados.join(', ')})` };
    }
    for (const id of plano.pilaresQueDescem) {
      const p = r.model.structures.find((x) => x.id === id);
      if (!p || p.baseMm > 0) return { ok: false, motivo: `pilar ${id} não desceu até o bloco` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}
