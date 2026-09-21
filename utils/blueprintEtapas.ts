/**
 * ETAPAS DE OBRA — fases personalizadas (21/09/2026, backlog P2).
 *
 * A fase de reforma (E10.2) é um STATUS de três valores: existente, a demolir,
 * novo. Serve à reforma de uma etapa só. A obra real tem várias — "Existente",
 * "Fase 1 — demolições e estrutura", "Fase 2 — vedações", "Fase 3 —
 * acabamentos" — e a mesma parede é NOVA numa e EXISTENTE nas seguintes.
 *
 * ─── DERIVAÇÃO ──────────────────────────────────────────────────────────────
 *
 * Cada peça diz em que etapa nasce (`etapaId`) e, se sai, em que etapa é
 * demolida (`demolidaEmEtapaId`). Escolhida uma etapa EM VISTA, o status de
 * cada peça é derivado por ordem:
 *
 *   nasce depois da vista ............... não aparece
 *   já foi demolida antes da vista ...... não aparece
 *   é demolida NA vista ................. A DEMOLIR (vermelho tracejado)
 *   nasce NA vista ...................... NOVA
 *   nasceu antes ........................ EXISTENTE (cinza)
 *   sem etapa ........................... segue o status `fase` da peça
 *
 * O canvas e a tela Antes/Depois já sabem pintar EXISTENTE/DEMOLIR/NOVO: a
 * etapa em vista só troca o MAPA que eles recebem. Nada de desenho novo.
 */
import type { BlueprintModel, Etapa, FaseDeReforma, ObjectId, Quantitativos } from './blueprintKernel';
import { faseDe } from './blueprintKernel';

export interface PecaNaLinhaDoTempo {
  id: ObjectId;
  familia: 'parede' | 'abertura' | 'estrutura' | 'componente';
  etapaId: ObjectId | null;
  demolidaEmEtapaId: ObjectId | null;
  fase: FaseDeReforma;
}

/** As etapas na ordem da linha do tempo (ordem, depois nome). */
export function etapasOrdenadas(model: BlueprintModel): Etapa[] {
  return [...(model.etapas ?? [])].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Toda peça que pode ter etapa (as mesmas que têm fase). */
export function pecasNaLinhaDoTempo(model: BlueprintModel): PecaNaLinhaDoTempo[] {
  const f = (p: { id: ObjectId; etapaId?: ObjectId | null; demolidaEmEtapaId?: ObjectId | null; fase?: FaseDeReforma }, familia: PecaNaLinhaDoTempo['familia']): PecaNaLinhaDoTempo => ({ id: p.id, familia, etapaId: p.etapaId ?? null, demolidaEmEtapaId: p.demolidaEmEtapaId ?? null, fase: faseDe(p) });
  return [
    ...model.walls.map((w) => f(w, 'parede')),
    ...model.openings.map((o) => f(o, 'abertura')),
    ...(model.structures ?? []).map((s) => f(s, 'estrutura')),
    ...(model.componentes ?? []).map((c) => f(c, 'componente')),
  ];
}

/** O status de UMA peça numa etapa em vista; `null` = não aparece. */
export function statusNaEtapa(peca: Pick<PecaNaLinhaDoTempo, 'etapaId' | 'demolidaEmEtapaId' | 'fase'>, ordemDaVista: number, ordemDaEtapa: ReadonlyMap<ObjectId, number>): FaseDeReforma | null {
  const nasce = peca.etapaId != null ? ordemDaEtapa.get(peca.etapaId) : undefined;
  const sai = peca.demolidaEmEtapaId != null ? ordemDaEtapa.get(peca.demolidaEmEtapaId) : undefined;
  if (nasce === undefined && sai === undefined) return peca.fase;
  if (nasce !== undefined && nasce > ordemDaVista) return null;
  if (sai !== undefined && sai < ordemDaVista) return null;
  if (sai !== undefined && sai === ordemDaVista) return 'DEMOLIR';
  if (nasce !== undefined && nasce === ordemDaVista) return 'NOVO';
  return 'EXISTENTE';
}

export interface VistaDaEtapa {
  etapa: Etapa;
  /** id → status (só EXISTENTE/DEMOLIR — NOVO é a ausência, como o canvas espera). */
  fases: Map<ObjectId, FaseDeReforma>;
  ocultos: Set<ObjectId>;
  contagem: Record<FaseDeReforma, number>;
}

/** Tudo que o canvas precisa para mostrar o desenho COMO ESTÁ numa etapa. */
export function vistaDaEtapa(model: BlueprintModel, etapaId: ObjectId): VistaDaEtapa | null {
  const etapa = (model.etapas ?? []).find((e) => e.id === etapaId);
  if (!etapa) return null;
  const ordemDaEtapa = new Map((model.etapas ?? []).map((e) => [e.id, e.ordem]));
  const fases = new Map<ObjectId, FaseDeReforma>();
  const ocultos = new Set<ObjectId>();
  const contagem: Record<FaseDeReforma, number> = { EXISTENTE: 0, DEMOLIR: 0, NOVO: 0 };
  for (const p of pecasNaLinhaDoTempo(model)) {
    const st = statusNaEtapa(p, etapa.ordem, ordemDaEtapa);
    if (st === null) {
      ocultos.add(p.id);
      continue;
    }
    contagem[st]++;
    if (st !== 'NOVO') fases.set(p.id, st);
  }
  return { etapa, fases, ocultos, contagem };
}

export interface LinhaDoQuadroDeEtapas {
  etapa: Etapa;
  /** Peças que nascem na etapa. */
  nascem: { paredes: number; comprimentoParedeM: number; aberturas: number; estruturas: number; componentes: number };
  /** Peças demolidas na etapa. */
  saem: { paredes: number; comprimentoParedeM: number; aberturas: number; estruturas: number; componentes: number };
}

/** Quanto entra e quanto sai em cada etapa — o cronograma físico em números. Comprimentos pelo quantitativo (`paredes` traz TODAS, com a fase em cada linha). */
export function quadroDeEtapas(model: BlueprintModel, quant: Pick<Quantitativos, 'paredes'> | null): LinhaDoQuadroDeEtapas[] {
  const compDaParede = new Map<ObjectId, number>();
  for (const p of quant?.paredes ?? []) compDaParede.set(p.wallId, p.comprimentoM);
  const vazio = () => ({ paredes: 0, comprimentoParedeM: 0, aberturas: 0, estruturas: 0, componentes: 0 });
  const linhas = etapasOrdenadas(model).map((etapa) => ({ etapa, nascem: vazio(), saem: vazio() }));
  const porId = new Map(linhas.map((l) => [l.etapa.id, l]));
  const soma = (alvo: ReturnType<typeof vazio>, p: PecaNaLinhaDoTempo) => {
    if (p.familia === 'parede') {
      alvo.paredes++;
      alvo.comprimentoParedeM += compDaParede.get(p.id) ?? 0;
    } else if (p.familia === 'abertura') alvo.aberturas++;
    else if (p.familia === 'estrutura') alvo.estruturas++;
    else alvo.componentes++;
  };
  for (const p of pecasNaLinhaDoTempo(model)) {
    if (p.etapaId) {
      const l = porId.get(p.etapaId);
      if (l) soma(l.nascem, p);
    }
    if (p.demolidaEmEtapaId) {
      const l = porId.get(p.demolidaEmEtapaId);
      if (l) soma(l.saem, p);
    }
  }
  for (const l of linhas) {
    l.nascem.comprimentoParedeM = Math.round(l.nascem.comprimentoParedeM * 100) / 100;
    l.saem.comprimentoParedeM = Math.round(l.saem.comprimentoParedeM * 100) / 100;
  }
  return linhas;
}

/** Quantas peças ainda não têm etapa (para o botão do ribbon). */
export function pecasSemEtapa(model: BlueprintModel): number {
  if ((model.etapas ?? []).length === 0) return 0;
  return pecasNaLinhaDoTempo(model).filter((p) => !p.etapaId).length;
}

/** Sementes: a linha do tempo típica de uma reforma. */
export const ETAPAS_SUGERIDAS: readonly string[] = ['Existente', 'Fase 1 — demolições e estrutura', 'Fase 2 — vedações e instalações', 'Fase 3 — acabamentos'];
