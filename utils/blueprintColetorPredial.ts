/**
 * E5.3 — O COLETOR PREDIAL (29/09/2026, roadmap hidrossanitário).
 *
 * Da caixa de inspeção final à LIGAÇÃO NA REDE PÚBLICA (a peça "Ligação à rede
 * pública", que o projetista põe no limite do lote com a cota da rede). Em
 * linha reta — o coletor sai do lote pelo caminho mais curto —, com:
 *
 *  - DECLIVIDADE única, do fundo da CI à cota da rede; abaixo da mínima do DN,
 *    a gravidade não resolve (aviso: elevatória — backlog); acima de 5 %, aviso;
 *  - DN pela TABELA 7 da NBR 8160 (UHC que chega à CI e a declividade), mínimo
 *    100;
 *  - CAIXAS DE INSPEÇÃO INTERMEDIÁRIAS: a última a no máximo 15 m da ligação e
 *    entre caixas no máximo 25 m (NBR 8160) — a linha é reta, então não há
 *    deflexão a inspecionar.
 *
 * Trechos "Coletor predial" e caixas "CI do coletor", sugeridos, num lote;
 * relançar apaga os sugeridos e refaz.
 *
 * ─── SEM LIGAÇÃO NO DESENHO (13/10/2026) ─────────────────────────────────────
 *
 * Antes, sem a peça, o plano parava em "Coloque a ligação à rede pública (no
 * limite do lote, com a cota da rede)…" — um passo manual num lançamento
 * automático (docs/planos/2026-10-13-hidro-ancoras-automaticas.md, item 3.1).
 * Agora a ligação é PROPOSTA na frente do lote (`pontoNaFrente`, a partir da
 * caixa de inspeção), `sugerida`, na cota do terreno ali menos
 * `profundidadeDaRedeMm`, com `cota_da_rede: 'estimada'` — e o coletor é traçado
 * até ela no mesmo lote. O que ainda para o plano é informação do MUNDO: não
 * se sabe onde é a frente, ou o desenho usa tratamento individual (sem rede).
 */
import type { BlueprintModel, Command, ObjectId, Terminal } from './blueprintKernel';
import { PARAMETRO_COTA_DA_REDE, applyBatch, extensaoVerticalDaCaixa } from './blueprintKernel';
import { caixasDeInspecao, esgotoTrechoATrecho, type HipotesesDeEsgoto } from './blueprintEsgotoAutomatico';
import { dnDoSubcoletor } from './blueprintNbr8160';
import { cotaDoTerrenoEm, pontoNaFrente, type LeitorDoTerreno, type OrigemDaFrente } from './blueprintAncorasHidro';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { temTratamentoIndividual } from './blueprintTratamento';

export const ROTULO_DO_COLETOR = 'Coletor predial';
export const ROTULO_DA_CI_DO_COLETOR = 'CI do coletor';
/** NBR 8160: distância máxima entre inspeções, e da última à ligação, mm. */
export const DISTANCIA_MAXIMA_ENTRE_CAIXAS_MM = 25000;
export const DISTANCIA_MAXIMA_ATE_A_LIGACAO_MM = 15000;
export const DECLIVIDADE_MAXIMA_PCT = 5;

export interface PlanoDoColetor {
  ligacaoId: ObjectId | null;
  caixaId: ObjectId | null;
  comandos: Command[];
  apagados: number;
  comprimentoM: number;
  uhc: number;
  dnMm: number;
  declividadePct: number;
  declividadeMinimaPct: number;
  caixasIntermediarias: number;
  /** A gravidade leva o esgoto da CI à rede? */
  porGravidade: boolean;
  avisos: string[];
  motivo: string | null;
  /** A cota da rede é a PRESUMIDA (ligação posta pelo automático, ninguém confirmou)? */
  cotaEstimada: boolean;
  /** Sem ligação no desenho, a que o lançamento põe; o `AddTerminal` dela é o primeiro dos `comandos`. */
  ligacaoProposta: LigacaoProposta | null;
}

export interface LigacaoProposta {
  levelId: ObjectId;
  at: { x: number; y: number };
  cotaMm: number;
  /** Como a frente foi achada: a divisa marcada, a testada do lote ou a via. */
  origem: OrigemDaFrente;
}

const vazio = (motivo: string): PlanoDoColetor => ({
  ligacaoId: null, caixaId: null, comandos: [], apagados: 0, comprimentoM: 0, uhc: 0, dnMm: 0, declividadePct: 0, declividadeMinimaPct: 0,
  caixasIntermediarias: 0, porGravidade: false, avisos: [], motivo, cotaEstimada: false, ligacaoProposta: null,
});

export const MOTIVO_SEM_FRENTE = 'Marque a divisa da frente do lote (a que dá para a rua): a ligação à rede pública vai nela.';
export const MOTIVO_TRATAMENTO_INDIVIDUAL = 'O desenho usa tratamento individual (sumidouro): não há ligação à rede pública.';

/** A cota da rede desta ligação é a presumida pelo automático (ninguém confirmou)? */
export function cotaDaRedeEstimada(ligacao: Pick<Terminal, 'parametros'>): boolean {
  return ligacao.parametros?.[PARAMETRO_COTA_DA_REDE] === 'estimada';
}

/** A ligação à rede pública do desenho (a primeira, por id). */
export function ligacaoDaRede(model: BlueprintModel): Terminal | null {
  return [...(model.terminais ?? [])].filter((t) => t.tipoHidraulico === 'LIGACAO_ESGOTO').sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

/**
 * Sem ligação no desenho: a PROPOSTA na frente do lote, e o coletor traçado num
 * rascunho que já a tem (os comandos dele não citam id de peça nova — só pontos).
 */
function comLigacaoProposta(model: BlueprintModel, hip: HipotesesDeEsgoto, terreno: LeitorDoTerreno | null): PlanoDoColetor {
  if (temTratamentoIndividual(model)) return vazio(MOTIVO_TRATAMENTO_INDIVIDUAL);
  const cis = caixasDeInspecao(model).filter((c) => c.rotulo !== ROTULO_DA_CI_DO_COLETOR);
  if (cis.length === 0) return vazio('Lance o esgoto primeiro: o coletor predial parte da caixa de inspeção.');
  // A caixa mais perto da frente é a que sai do lote.
  const candidatas = cis
    .flatMap((ci) => {
      const frente = pontoNaFrente(model, ci.at);
      return frente ? [{ ci, frente, d: Math.hypot(frente.ponto.x - ci.at.x, frente.ponto.y - ci.at.y) }] : [];
    })
    .sort((a, b) => a.d - b.d || a.ci.id.localeCompare(b.ci.id));
  if (candidatas.length === 0) return vazio(MOTIVO_SEM_FRENTE);
  const { ci, frente } = candidatas[0];
  const proposta: LigacaoProposta = {
    levelId: ci.levelId,
    at: frente.ponto,
    cotaMm: cotaDoTerrenoEm(frente.ponto, terreno) - (hip.profundidadeDaRedeMm ?? 1500),
    origem: frente.origem,
  };
  const ligacao: Command = {
    type: 'AddTerminal', levelId: proposta.levelId, disciplina: 'ESGOTO', tipo: FICHA_DO_PONTO_HIDRAULICO.LIGACAO_ESGOTO.rotulo,
    at: { ...proposta.at }, cotaMm: proposta.cotaMm, tipoHidraulico: 'LIGACAO_ESGOTO', sugerida: true,
    parametros: { [PARAMETRO_COTA_DA_REDE]: 'estimada' },
  };
  const plano = planejarColetorPredial(applyBatch(model, [ligacao]).model, hip, terreno);
  if (plano.motivo) return { ...plano, ligacaoId: null };
  return { ...plano, ligacaoId: null, comandos: [ligacao, ...plano.comandos], ligacaoProposta: proposta };
}

/**
 * `terreno`: a topografia exibida, quando há — dá a cota do terreno na frente para
 * a ligação PROPOSTA. Sem ela, o térreo (0). Não mexe numa ligação que já existe.
 */
export function planejarColetorPredial(model: BlueprintModel, hip: HipotesesDeEsgoto, terreno: LeitorDoTerreno | null = null): PlanoDoColetor {
  const ligacao = ligacaoDaRede(model);
  if (!ligacao) return comLigacaoProposta(model, hip, terreno);
  // A CI de ORIGEM: a do esgoto do prédio mais perto da ligação (não as do próprio coletor).
  const cis = caixasDeInspecao(model).filter((c) => c.rotulo !== ROTULO_DA_CI_DO_COLETOR && c.levelId === ligacao.levelId);
  if (cis.length === 0) return vazio('Não há caixa de inspeção no pavimento da ligação para o coletor partir.');
  const ci = [...cis].sort((a, b) => Math.hypot(a.at.x - ligacao.at.x, a.at.y - ligacao.at.y) - Math.hypot(b.at.x - ligacao.at.x, b.at.y - ligacao.at.y) || a.id.localeCompare(b.id))[0];
  const fundoCi = extensaoVerticalDaCaixa(ci)?.fundoMm ?? ci.cotaMm;
  const L = Math.hypot(ligacao.at.x - ci.at.x, ligacao.at.y - ci.at.y);
  if (L < 1) return vazio('A ligação está sobre a caixa de inspeção.');

  // UHC que chega à CI (a soma dos trechos que terminam nela).
  const trechoPorId = new Map((model.trechos ?? []).map((t) => [t.id, t]));
  const chegam = esgotoTrechoATrecho(model, hip).filter((c) => {
    const t = trechoPorId.get(c.trechoId);
    // Só o que chega ao NÓ da caixa (posição E cota): a horizontal que desce até ela pela prumada não conta duas vezes.
    return (
      t && t.levelId === ci.levelId && t.rotulo !== ROTULO_DO_COLETOR &&
      ((t.a.x === ci.at.x && t.a.y === ci.at.y && t.cotaAMm === ci.cotaMm) || (t.b.x === ci.at.x && t.b.y === ci.at.y && t.cotaBMm === ci.cotaMm))
    );
  });
  const uhc = chegam.reduce((s, c) => s + c.uhc, 0);
  const declividadePct = ((fundoCi - ligacao.cotaMm) / L) * 100;
  const dnMm = dnDoSubcoletor(uhc, declividadePct);
  const declividadeMinimaPct = dnMm >= 100 ? hip.caimentoPctDe100 : hip.caimentoPctAte75;
  const porGravidade = declividadePct + 1e-9 >= declividadeMinimaPct;
  const avisos: string[] = [];
  if (!porGravidade) {
    avisos.push(
      declividadePct <= 0
        ? `A rede pública (cota ${(ligacao.cotaMm / 1000).toFixed(2).replace('.', ',')}) está acima do fundo da caixa: o esgoto não chega por gravidade — precisa de estação elevatória.`
        : `Declividade de ${declividadePct.toFixed(2).replace('.', ',')} % abaixo da mínima de ${declividadeMinimaPct} %: aprofunde a caixa ou use estação elevatória.`,
    );
  }
  if (declividadePct > DECLIVIDADE_MAXIMA_PCT) avisos.push(`Declividade de ${declividadePct.toFixed(1).replace('.', ',')} % acima de 5 %: considere um degrau (queda) numa caixa.`);

  // As caixas intermediárias: de trás para a frente, a primeira a 15 m da ligação e depois a cada 25 m
  // (NBR 8160 — hipóteses do estudo desde 14/10/2026; ausentes = os da norma).
  const ateALigacao = hip.distanciaAteALigacaoMm && hip.distanciaAteALigacaoMm > 0 ? hip.distanciaAteALigacaoMm : DISTANCIA_MAXIMA_ATE_A_LIGACAO_MM;
  const entreCaixas = hip.distanciaEntreCaixasMm && hip.distanciaEntreCaixasMm > 0 ? hip.distanciaEntreCaixasMm : DISTANCIA_MAXIMA_ENTRE_CAIXAS_MM;
  const distancias: number[] = [];
  let d = L - ateALigacao;
  while (d > 1) {
    distancias.unshift(d);
    d -= entreCaixas;
  }
  const u = { x: (ligacao.at.x - ci.at.x) / L, y: (ligacao.at.y - ci.at.y) / L };
  const noPercurso = (s: number) => ({ at: { x: Math.round(ci.at.x + u.x * s), y: Math.round(ci.at.y + u.y * s) }, cota: Math.round(fundoCi - (fundoCi - ligacao.cotaMm) * (s / L)) });
  const nos = [{ at: { ...ci.at }, cota: fundoCi }, ...distancias.map(noPercurso), { at: { ...ligacao.at }, cota: ligacao.cotaMm }];

  const existentes = (model.trechos ?? []).filter((t) => t.rotulo === ROTULO_DO_COLETOR && t.sugerido);
  const cisAntigas = (model.terminais ?? []).filter((t) => t.rotulo === ROTULO_DA_CI_DO_COLETOR && t.sugerida);
  const comandos: Command[] = [
    ...existentes.map((t): Command => ({ type: 'DeleteTrecho', trechoId: t.id })),
    ...cisAntigas.map((t): Command => ({ type: 'DeleteTerminal', terminalId: t.id })),
  ];
  for (const n of nos.slice(1, -1)) {
    comandos.push({ type: 'AddTerminal', levelId: ligacao.levelId, disciplina: 'ESGOTO', tipo: 'Caixa de inspeção', at: n.at, cotaMm: n.cota, tipoHidraulico: 'CAIXA_INSPECAO', rotulo: ROTULO_DA_CI_DO_COLETOR, sugerida: true });
  }
  for (let i = 1; i < nos.length; i++) {
    comandos.push({
      type: 'AddTrecho', levelId: ligacao.levelId, disciplina: 'ESGOTO', a: nos[i - 1].at, b: nos[i].at,
      cotaAMm: nos[i - 1].cota, cotaBMm: nos[i].cota, bitolaMm: dnMm, rotulo: ROTULO_DO_COLETOR, sugerido: true,
    });
  }
  return {
    ligacaoId: ligacao.id, caixaId: ci.id, comandos, apagados: existentes.length, comprimentoM: L / 1000, uhc, dnMm, declividadePct, declividadeMinimaPct,
    caixasIntermediarias: distancias.length, porGravidade, avisos, motivo: null,
    cotaEstimada: cotaDaRedeEstimada(ligacao), ligacaoProposta: null,
  };
}
