/**
 * BALANCEAMENTO DE FASES (E6.1, 29/09/2026) — puro.
 *
 * Num quadro trifásico, distribui os circuitos F-N e F-F entre R, S e T para
 * que a carga por fase fique o mais parelha possível. A carga de cada circuito
 * é a MESMA `sVA` do pré-dimensionamento, e o desequilíbrio é a MESMA conta do
 * aviso do quadro ((maior − menor) / maior) — o "depois" da prévia é o que o
 * quadro vai mostrar depois de aplicar (`conferirPlanoDeBalanceamento` prova).
 *
 * Como:
 *  1. guloso por carga — do maior circuito para o menor, cada um na opção que
 *     deixa as fases mais parelhas (F-N numa fase; F-F num par, que ocupa duas);
 *  2. melhoria local — mover um circuito, ou trocar dois, enquanto o
 *     desequilíbrio cair;
 *  3. RÓTULOS — trocar R/S/T entre si não muda o desequilíbrio; entre as seis
 *     trocas, fica a que mantém mais circuitos onde já estavam (menos mudanças
 *     no quadro físico).
 *
 * F-F-F entra fixo (um terço em cada fase). Circuito sem carga (reserva,
 * pontos sem potência) fica como está. Se o arranjo atual já é tão bom quanto o
 * balanceado, nada é proposto. Tudo vira `SetCircuitoProps { fase }` para um
 * `runBatch` — um passo de Ctrl+Z.
 */
import type { BlueprintModel, Command, FaseDoCircuito, LigacaoDoCircuito, ObjectId } from './blueprintKernel';
import { FASES_DO_CIRCUITO, applyBatch } from './blueprintKernel';
import { HIPOTESES_PADRAO, preDimensionarQuadroCompleto, type HipotesesEletricas } from './blueprintEletricaDimensionamento';
import { desequilibrioDasFases, fasesOcupadas, rotuloDaFase, somarPorFase, type CargaPorFase } from './blueprintFasesEletricas';

export interface CircuitoParaBalancear {
  circuitoId: ObjectId;
  nome: string;
  ligacao: LigacaoDoCircuito | null | undefined;
  fase: FaseDoCircuito | null | undefined;
  sVA: number;
}

export interface MudancaDeFase {
  circuitoId: ObjectId;
  nome: string;
  /** Rótulos ("R", "R-S"); `null` = não tinha fase. */
  de: string | null;
  para: string;
}

export type PlanoDeBalanceamento =
  | {
      ok: true;
      quadroId: ObjectId;
      antes: CargaPorFase;
      /** Desequilíbrio atual; `null` sem carga com fase. Circuitos sem fase ficam fora dele (ver `semFaseAntes`). */
      antesPct: number | null;
      semFaseAntes: string[];
      depois: CargaPorFase;
      depoisPct: number;
      /** O limite tolerado (hipótese) — a prévia diz quando nem o melhor arranjo cabe nele. */
      limitePct: number;
      mudancas: MudancaDeFase[];
      comandos: Command[];
    }
  | { ok: false; motivo: string };

const EPS = 1e-9;

/** A dispersão (maior − menor) — o que o guloso e a melhoria local diminuem. */
function dispersao(f: CargaPorFase): number {
  return Math.max(f.R, f.S, f.T) - Math.min(f.R, f.S, f.T);
}

function somar(f: CargaPorFase, lig: LigacaoDoCircuito, fase: FaseDoCircuito, sVA: number, sinal: 1 | -1): void {
  const oc = fasesOcupadas(lig, fase);
  for (const x of oc) f[x] += (sinal * sVA) / oc.length;
}

/**
 * A atribuição balanceada: circuitoId → fase gravada (F-F pela primeira do par).
 * Só os que se movem (F-N e F-F com carga) aparecem.
 */
export function balancearFases(circuitos: readonly CircuitoParaBalancear[]): Map<ObjectId, FaseDoCircuito> {
  const moveis = circuitos
    .filter((c) => (c.ligacao ?? 'FN') !== 'FFF' && c.sVA > 0)
    .map((c) => ({ ...c, lig: (c.ligacao ?? 'FN') as LigacaoDoCircuito }))
    .sort((a, b) => b.sVA - a.sVA || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }) || a.circuitoId.localeCompare(b.circuitoId));
  const carga: CargaPorFase = { R: 0, S: 0, T: 0 };
  for (const c of circuitos) if ((c.ligacao ?? 'FN') === 'FFF') somar(carga, 'FFF', 'R', c.sVA, 1);

  // 1. Guloso: do maior para o menor, a opção que deixa a menor dispersão (empate: a menor fase máxima, depois R, S, T).
  const escolha = new Map<ObjectId, FaseDoCircuito>();
  for (const c of moveis) {
    let melhor: FaseDoCircuito = 'R';
    let melhorD = Infinity;
    let melhorMax = Infinity;
    for (const f of FASES_DO_CIRCUITO) {
      somar(carga, c.lig, f, c.sVA, 1);
      const d = dispersao(carga);
      const m = Math.max(carga.R, carga.S, carga.T);
      somar(carga, c.lig, f, c.sVA, -1);
      if (d < melhorD - EPS || (Math.abs(d - melhorD) <= EPS && m < melhorMax - EPS)) {
        melhor = f;
        melhorD = d;
        melhorMax = m;
      }
    }
    escolha.set(c.circuitoId, melhor);
    somar(carga, c.lig, melhor, c.sVA, 1);
  }

  // 2. Melhoria local: mover um, ou trocar dois, enquanto a dispersão cair. Termina: cada passo a diminui estritamente.
  for (let rodada = 0; rodada < 200; rodada++) {
    let melhorou = false;
    const atual = dispersao(carga);
    moverUm: for (const c of moveis) {
      const f0 = escolha.get(c.circuitoId) as FaseDoCircuito;
      for (const f of FASES_DO_CIRCUITO) {
        if (f === f0) continue;
        somar(carga, c.lig, f0, c.sVA, -1);
        somar(carga, c.lig, f, c.sVA, 1);
        if (dispersao(carga) < atual - EPS) {
          escolha.set(c.circuitoId, f);
          melhorou = true;
          break moverUm;
        }
        somar(carga, c.lig, f, c.sVA, -1);
        somar(carga, c.lig, f0, c.sVA, 1);
      }
    }
    if (melhorou) continue;
    trocarDois: for (let i = 0; i < moveis.length; i++) {
      for (let j = i + 1; j < moveis.length; j++) {
        const a = moveis[i];
        const b = moveis[j];
        const fa = escolha.get(a.circuitoId) as FaseDoCircuito;
        const fb = escolha.get(b.circuitoId) as FaseDoCircuito;
        for (const na of FASES_DO_CIRCUITO) {
          for (const nb of FASES_DO_CIRCUITO) {
            if (na === fa || nb === fb) continue; // mover só um já foi tentado acima
            somar(carga, a.lig, fa, a.sVA, -1);
            somar(carga, b.lig, fb, b.sVA, -1);
            somar(carga, a.lig, na, a.sVA, 1);
            somar(carga, b.lig, nb, b.sVA, 1);
            if (dispersao(carga) < atual - EPS) {
              escolha.set(a.circuitoId, na);
              escolha.set(b.circuitoId, nb);
              melhorou = true;
              break trocarDois;
            }
            somar(carga, a.lig, na, a.sVA, -1);
            somar(carga, b.lig, nb, b.sVA, -1);
            somar(carga, a.lig, fa, a.sVA, 1);
            somar(carga, b.lig, fb, b.sVA, 1);
          }
        }
      }
    }
    if (!melhorou) break;
  }

  // 3. Rótulos: das 6 trocas de R/S/T, a que deixa mais circuitos onde já estavam (empate: a identidade primeiro).
  const trocas: Record<FaseDoCircuito, FaseDoCircuito>[] = [
    { R: 'R', S: 'S', T: 'T' },
    { R: 'R', S: 'T', T: 'S' },
    { R: 'S', S: 'R', T: 'T' },
    { R: 'S', S: 'T', T: 'R' },
    { R: 'T', S: 'R', T: 'S' },
    { R: 'T', S: 'S', T: 'R' },
  ];
  const aplicar = (pi: Record<FaseDoCircuito, FaseDoCircuito>, lig: LigacaoDoCircuito, f: FaseDoCircuito): FaseDoCircuito => {
    if (lig !== 'FF') return pi[f];
    // O par {pi(f), pi(seguinte)} é um par; a fase gravada é a primeira dele no sentido R → S → T → R.
    const par = new Set(fasesOcupadas('FF', f).map((x) => pi[x]));
    return FASES_DO_CIRCUITO.find((x) => par.has(x) && par.has(fasesOcupadas('FF', x)[1])) as FaseDoCircuito;
  };
  let melhorPi = trocas[0];
  let melhorFicam = -1;
  for (const pi of trocas) {
    let ficam = 0;
    for (const c of moveis) if (c.fase && aplicar(pi, c.lig, escolha.get(c.circuitoId) as FaseDoCircuito) === c.fase) ficam++;
    if (ficam > melhorFicam) {
      melhorFicam = ficam;
      melhorPi = pi;
    }
  }
  const final = new Map<ObjectId, FaseDoCircuito>();
  for (const c of moveis) final.set(c.circuitoId, aplicar(melhorPi, c.lig, escolha.get(c.circuitoId) as FaseDoCircuito));
  return final;
}

/** O plano de um quadro: prévia (antes/depois, quem muda) e os comandos. */
export function planoDeBalanceamento(model: BlueprintModel, quadroId: ObjectId, hip: HipotesesEletricas = HIPOTESES_PADRAO): PlanoDeBalanceamento {
  const q = preDimensionarQuadroCompleto(model, quadroId, hip);
  if (!q) return { ok: false, motivo: 'Quadro não encontrado' };
  if (q.ligacao !== 'FFF') return { ok: false, motivo: 'Balanceamento só em quadro trifásico (F-F-F) — este quadro não tem três fases' };
  const itens: CircuitoParaBalancear[] = (model.circuitos ?? [])
    .filter((c) => c.quadroId === quadroId)
    .map((c) => ({ circuitoId: c.id, nome: c.nome, ligacao: c.ligacao, fase: c.fase, sVA: q.circuitos.find((x) => x.circuitoId === c.id)?.sVA ?? 0 }));
  if (!itens.some((c) => (c.ligacao ?? 'FN') !== 'FFF' && c.sVA > 0)) {
    return { ok: false, motivo: 'Nenhum circuito F-N ou F-F com carga para distribuir entre as fases' };
  }
  const antesSoma = somarPorFase(itens);
  const moveisSemFase = itens.filter((c) => (c.ligacao ?? 'FN') !== 'FFF' && c.sVA > 0 && !c.fase);
  const atribuicao = balancearFases(itens);
  const depoisItens = itens.map((c) => (atribuicao.has(c.circuitoId) ? { ...c, fase: atribuicao.get(c.circuitoId) } : c));
  const depois = somarPorFase(depoisItens).fases;
  const depoisPct = desequilibrioDasFases(depois) ?? 0;
  const antesPct = desequilibrioDasFases(antesSoma.fases);
  const mudancas: MudancaDeFase[] = [];
  const comandos: Command[] = [];
  for (const c of itens) {
    const nova = atribuicao.get(c.circuitoId);
    if (!nova || nova === c.fase) continue;
    mudancas.push({ circuitoId: c.circuitoId, nome: c.nome, de: rotuloDaFase(c.ligacao, c.fase), para: rotuloDaFase(c.ligacao, nova) as string });
    comandos.push({ type: 'SetCircuitoProps', circuitoId: c.circuitoId, fase: nova });
  }
  const n1 = (v: number) => v.toFixed(1).replace('.', ',');
  if (comandos.length === 0) {
    return { ok: false, motivo: `As fases já estão no arranjo balanceado (desequilíbrio ${n1(depoisPct)} %) — nada a mudar` };
  }
  // Todos já tinham fase e o arranjo atual é tão bom quanto: não mexe no quadro à toa.
  if (moveisSemFase.length === 0 && antesPct != null && depoisPct >= antesPct - 0.05) {
    return { ok: false, motivo: `O arranjo atual (desequilíbrio ${n1(antesPct)} %) já é tão bom quanto o balanceado — nada a mudar` };
  }
  return {
    ok: true,
    quadroId,
    antes: antesSoma.fases,
    antesPct,
    semFaseAntes: moveisSemFase.map((c) => c.nome),
    depois,
    depoisPct,
    limitePct: hip.desequilibrioMaxPct,
    mudancas,
    comandos,
  };
}

/**
 * Aplica o lote num modelo de rascunho e confere que o quadro, recalculado,
 * mostra exatamente o "depois" da prévia — a prévia não pode prometer o que o
 * quadro não vai dizer.
 */
export function conferirPlanoDeBalanceamento(
  model: BlueprintModel,
  plano: PlanoDeBalanceamento,
  hip: HipotesesEletricas = HIPOTESES_PADRAO,
): { ok: true } | { ok: false; motivo: string } {
  if (!plano.ok) return { ok: false, motivo: plano.motivo };
  try {
    const r = applyBatch(model, plano.comandos);
    const q = preDimensionarQuadroCompleto(r.model, plano.quadroId, hip);
    if (!q?.fases || q.desequilibrioPct == null) return { ok: false, motivo: 'o quadro recalculado não tem carga por fase' };
    for (const f of FASES_DO_CIRCUITO) {
      if (Math.abs(q.fases[f] - plano.depois[f]) > 1e-6) return { ok: false, motivo: `fase ${f}: prévia ${plano.depois[f]} VA, quadro ${q.fases[f]} VA` };
    }
    if (Math.abs(q.desequilibrioPct - plano.depoisPct) > 1e-6) return { ok: false, motivo: `desequilíbrio: prévia ${plano.depoisPct} %, quadro ${q.desequilibrioPct} %` };
    if (q.naoAvaliado.some((n) => n.startsWith('fora do balanceamento'))) {
      // Só sobra fora quem não tem carga (o balanceamento não mexe neles) — conferir que é isso.
      const semCarga = new Set(q.circuitos.filter((c) => c.sVA <= 0).map((c) => c.nome));
      const fora = q.naoAvaliado.find((n) => n.startsWith('fora do balanceamento')) as string;
      const nomes = fora.replace(/^fora do balanceamento \(sem fase\): /, '').split(', ').map((n) => n.replace(/ \(F-F\)$/, ''));
      const comCarga = nomes.filter((n) => !semCarga.has(n));
      if (comCarga.length) return { ok: false, motivo: `circuito com carga ainda sem fase: ${comCarga.join(', ')}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}
