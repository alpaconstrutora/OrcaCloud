/**
 * O ESGOTO INTEIRO NUM CLIQUE (13/10/2026).
 *
 * Plano: `docs/planos/2026-10-13-hidro-ancoras-automaticas.md`, item 4.1. O
 * pedido: *"Se é para ser automatico, por que pedirmos um passo manual ao
 * usuário"*. A gaveta tinha quatro botões e duas peças a pôr à mão; aqui sai UM
 * lote de comandos — um Ctrl+Z desfaz tudo —, cada etapa planejada sobre o
 * modelo já com a anterior aplicada:
 *
 *   1. a rede até a caixa de inspeção (a caixa nasce se faltar — `planejarEsgoto`);
 *   2. o coletor até a rede pública (a ligação nasce se faltar — `planejarColetorPredial`);
 *   3. a ventilação.
 *
 * O que foi PRESUMIDO volta em texto, para a gaveta dizer ao usuário o que
 * conferir; o que falta do mundo (a frente do lote) volta como pendência, e
 * não impede as outras etapas.
 */
import { applyBatch, type BlueprintModel, type Command } from './blueprintKernel';
import { HIPOTESES_ESGOTO_PADRAO, planejarEsgoto, relancarEsgoto, type HipotesesDeEsgoto, type PlanoDeEsgoto } from './blueprintEsgotoAutomatico';
import { ROTULO_DA_CI_DO_COLETOR, ROTULO_DO_COLETOR, planejarColetorPredial, type PlanoDoColetor } from './blueprintColetorPredial';
import { planejarVentilacao, type PlanoDaVentilacao } from './blueprintVentilacao';
import type { LeitorDoTerreno } from './blueprintAncorasHidro';

export interface PlanoDoEsgotoCompleto {
  comandos: Command[];
  esgoto: PlanoDeEsgoto;
  /** null = a etapa não roda (a rede não chegou a uma caixa). */
  coletor: PlanoDoColetor | null;
  /** O coletor entra no lote? (não, quando já está como o plano faria, ou quando o usuário o confirmou à mão) */
  lancaColetor: boolean;
  ventilacao: PlanoDaVentilacao | null;
  /** O que o lançamento presumiu e o usuário deve conferir. */
  presumido: string[];
  /** O que ficou de fora por falta de informação do mundo. */
  pendencias: string[];
}

const metros = (mm: number) => (Math.abs(mm) / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** O coletor sugerido do desenho já é o que o plano lançaria? (então relançar só faria barulho no Ctrl+Z) */
function coletorIgualAoPlano(model: BlueprintModel, plano: PlanoDoColetor): boolean {
  const chave = (a: { x: number; y: number }, b: { x: number; y: number }, ca: number, cb: number, dn: number) => `${a.x},${a.y},${ca}>${b.x},${b.y},${cb}/${dn}`;
  const existentes = (model.trechos ?? []).filter((t) => t.rotulo === ROTULO_DO_COLETOR).map((t) => chave(t.a, t.b, t.cotaAMm, t.cotaBMm, t.bitolaMm)).sort();
  const planejados = plano.comandos.flatMap((c) => (c.type === 'AddTrecho' ? [chave(c.a, c.b, c.cotaAMm, c.cotaBMm, c.bitolaMm)] : [])).sort();
  const cisExistentes = (model.terminais ?? []).filter((t) => t.rotulo === ROTULO_DA_CI_DO_COLETOR).length;
  const cisPlanejadas = plano.comandos.filter((c) => c.type === 'AddTerminal' && c.rotulo === ROTULO_DA_CI_DO_COLETOR).length;
  return existentes.length > 0 && existentes.join('|') === planejados.join('|') && cisExistentes === cisPlanejadas;
}

export function planejarEsgotoCompleto(
  model: BlueprintModel,
  hip: HipotesesDeEsgoto = HIPOTESES_ESGOTO_PADRAO,
  terreno: LeitorDoTerreno | null = null,
): PlanoDoEsgotoCompleto {
  const presumido: string[] = [];
  const pendencias: string[] = [];

  // 1. A rede até a caixa — o mesmo critério do botão de antes: lança o que falta; sem nada novo, relança os sugeridos.
  const esgoto = planejarEsgoto(model, hip);
  const c1 = esgoto.comandos.length > 0 ? esgoto.comandos : esgoto.sugeridos > 0 ? relancarEsgoto(model, hip).comandos : [];
  if (esgoto.caixaProposta) {
    const onde = esgoto.caixaProposta.rumo === 'FACHADA' ? 'junto à fachada mais próxima' : 'entre a fachada e a frente do lote';
    presumido.push(`Caixa de inspeção posta ${onde}, com o fundo a −${metros(esgoto.caixaProposta.cotaMm)} m.`);
  }
  const m1 = c1.length > 0 ? applyBatch(model, c1).model : model;
  // Sem caixa no fim da etapa 1 (sem aparelho, louça sem ponto), não há coletor nem ventilação a planejar.
  const temCaixa = (m1.terminais ?? []).some((t) => t.disciplina === 'ESGOTO' && t.tipoHidraulico === 'CAIXA_INSPECAO');
  if (!temCaixa) {
    return { comandos: c1, esgoto, coletor: null, lancaColetor: false, ventilacao: null, presumido, pendencias: esgoto.motivo ? [esgoto.motivo] : [] };
  }

  // 2. O coletor até a rede pública. Coletor com trecho CONFIRMADO à mão é decisão do usuário: não se relança.
  const coletor = planejarColetorPredial(m1, hip, terreno);
  const confirmadoAMao = (m1.trechos ?? []).some((t) => t.rotulo === ROTULO_DO_COLETOR && !t.sugerido);
  const lancaColetor = !coletor.motivo && coletor.comandos.length > 0 && !confirmadoAMao && !coletorIgualAoPlano(m1, coletor);
  if (coletor.motivo) pendencias.push(coletor.motivo);
  if (lancaColetor && coletor.ligacaoProposta) {
    presumido.push(
      `Ligação à rede pública posta na frente do lote, com a rede ESTIMADA a ${metros(hip.profundidadeDaRedeMm ?? 1500)} m de profundidade (cota −${metros(coletor.ligacaoProposta.cotaMm)} m).`,
    );
  }
  const c2 = lancaColetor ? coletor.comandos : [];
  const m2 = c2.length > 0 ? applyBatch(m1, c2).model : m1;

  // 3. A ventilação (vazia quando já atende).
  const ventilacao = planejarVentilacao(m2, hip);
  const c3 = ventilacao.comandos;

  if (presumido.length > 0) {
    presumido.push(
      lancaColetor && coletor.ligacaoProposta
        ? 'Arraste as peças para onde estão de verdade (o plano recalcula) e confirme a cota da rede com a concessionária.'
        : 'Arraste as peças para onde estão de verdade (o plano recalcula).',
    );
  }
  return { comandos: [...c1, ...c2, ...c3], esgoto, coletor, lancaColetor, ventilacao, presumido, pendencias };
}
