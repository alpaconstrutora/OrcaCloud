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
 *   2. o DESTINO (14/10/2026): rede pública — o coletor até ela (a ligação nasce se faltar,
 *      `planejarColetorPredial`) — ou tratamento individual (`planejarTratamento`), pela hipótese
 *      `destino`; o que for do outro destino sai (o confirmado, só com autorização);
 *   3. a ventilação.
 *
 * O que foi PRESUMIDO volta em texto, para a gaveta dizer ao usuário o que
 * conferir; o que falta do mundo (a frente do lote) volta como pendência, e
 * não impede as outras etapas.
 */
import { applyBatch, type BlueprintModel, type Command, type ObjectId } from './blueprintKernel';
import { HIPOTESES_ESGOTO_PADRAO, destinoDoEsgoto, planejarEsgoto, relancarEsgoto, type DestinoDoEsgoto, type HipotesesDeEsgoto, type PlanoDeEsgoto } from './blueprintEsgotoAutomatico';
import { ROTULO_DO_TRATAMENTO, UNIDADES_DE_TRATAMENTO, planejarTratamento, type MedidasDaUnidade, type PlanoDeTratamento, type UnidadeDeTratamento } from './blueprintTratamento';
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
  /** Destino TRATAMENTO: o plano do tratamento individual (null com rede pública ou bloqueado). */
  tratamento: PlanoDeTratamento | null;
  destino: DestinoDoEsgoto;
  /** Peças CONFIRMADAS do outro destino que impediram o lançamento — pedir autorização e chamar de novo com `apagarConfirmadosDoOutroDestino`. */
  confirmadosDoOutroDestino: ObjectId[];
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

/** O que o lançamento pode receber além das hipóteses do esgoto (14/10/2026). */
export interface OpcoesDoEsgotoCompleto {
  /** Destino TRATAMENTO: o filtro e as medidas dimensionadas (`medidasDimensionadas` das premissas). */
  tratamento?: { comFiltro: boolean; medidas?: Partial<Record<UnidadeDeTratamento, MedidasDaUnidade>> };
  /** O usuário AUTORIZOU apagar o que está CONFIRMADO do outro destino (ligação/coletor ou o tratamento). */
  apagarConfirmadosDoOutroDestino?: boolean;
}

/**
 * As peças do OUTRO destino no desenho (14/10/2026): com destino tratamento, a ligação à rede, o
 * coletor e as caixas dele; com rede pública, as unidades de tratamento e os tubos delas. Sem isto o
 * desenho ficava com DOIS destinos (o lançamento sempre punha a ligação).
 */
function pecasDoOutroDestino(model: BlueprintModel, destino: DestinoDoEsgoto) {
  const terminais = (model.terminais ?? []).filter((t) =>
    destino === 'TRATAMENTO'
      ? t.tipoHidraulico === 'LIGACAO_ESGOTO' || t.rotulo === ROTULO_DA_CI_DO_COLETOR
      : (UNIDADES_DE_TRATAMENTO as readonly string[]).includes(t.tipoHidraulico ?? ''),
  );
  const trechos = (model.trechos ?? []).filter((t) => t.rotulo === (destino === 'TRATAMENTO' ? ROTULO_DO_COLETOR : ROTULO_DO_TRATAMENTO));
  return { terminais, trechos };
}

export function planejarEsgotoCompleto(
  model: BlueprintModel,
  hip: HipotesesDeEsgoto = HIPOTESES_ESGOTO_PADRAO,
  terreno: LeitorDoTerreno | null = null,
  opcoes: OpcoesDoEsgotoCompleto = {},
): PlanoDoEsgotoCompleto {
  const presumido: string[] = [];
  const pendencias: string[] = [];
  const destino = destinoDoEsgoto(hip);

  // 0. O que é do OUTRO destino: o sugerido sai; o confirmado só com autorização (decisão do usuário,
  //    14/10/2026: "o sistema avisa e pede autorizacao para apagar sozinho").
  const outro = pecasDoOutroDestino(model, destino);
  const confirmados = [...outro.terminais.filter((t) => !t.sugerida).map((t) => t.id), ...outro.trechos.filter((t) => !t.sugerido).map((t) => t.id)];
  const apagaConfirmados = !!opcoes.apagarConfirmadosDoOutroDestino;
  const c0: Command[] = [
    ...outro.trechos.filter((t) => t.sugerido || apagaConfirmados).map((t): Command => ({ type: 'DeleteTrecho', trechoId: t.id })),
    ...outro.terminais.filter((t) => t.sugerida || apagaConfirmados).map((t): Command => ({ type: 'DeleteTerminal', terminalId: t.id })),
  ];
  const bloqueado = confirmados.length > 0 && !apagaConfirmados;
  const confirmadosDoOutroDestino = bloqueado ? confirmados : [];
  const m0 = c0.length > 0 ? applyBatch(model, c0).model : model;

  // 1. A rede até a caixa — o mesmo critério do botão de antes: lança o que falta; sem nada novo, relança os sugeridos.
  const esgoto = planejarEsgoto(m0, hip);
  const c1 = esgoto.comandos.length > 0 ? esgoto.comandos : esgoto.sugeridos > 0 ? relancarEsgoto(m0, hip).comandos : [];
  if (esgoto.caixaProposta) {
    const onde = esgoto.caixaProposta.rumo === 'FACHADA' ? 'junto à fachada mais próxima' : 'entre a fachada e a frente do lote';
    presumido.push(`Caixa de inspeção posta ${onde}, com o fundo a −${metros(esgoto.caixaProposta.cotaMm)} m.`);
  }
  const m1 = c1.length > 0 ? applyBatch(m0, c1).model : m0;
  // Sem caixa no fim da etapa 1 (sem aparelho, louça sem ponto), não há destino nem ventilação a planejar.
  const temCaixa = (m1.terminais ?? []).some((t) => t.disciplina === 'ESGOTO' && t.tipoHidraulico === 'CAIXA_INSPECAO');
  if (!temCaixa) {
    return {
      comandos: [...c0, ...c1], esgoto, coletor: null, lancaColetor: false, tratamento: null, ventilacao: null,
      destino, confirmadosDoOutroDestino, presumido, pendencias: esgoto.motivo ? [esgoto.motivo] : [],
    };
  }

  // 2. O destino. Com o outro destino confirmado e sem autorização, NÃO lança o deste (seriam dois destinos).
  let coletor: PlanoDoColetor | null = null;
  let lancaColetor = false;
  let tratamento: PlanoDeTratamento | null = null;
  let c2: Command[] = [];
  if (bloqueado) {
    pendencias.push(
      destino === 'TRATAMENTO'
        ? 'A ligação à rede pública está CONFIRMADA no desenho e o destino agora é tratamento individual: autorize apagá-la para lançar o tratamento.'
        : 'O tratamento individual tem peças CONFIRMADAS no desenho e o destino agora é a rede pública: autorize apagá-las para lançar a ligação.',
    );
  } else if (destino === 'TRATAMENTO') {
    tratamento = planejarTratamento(m1, { comFiltro: opcoes.tratamento?.comFiltro ?? true, medidas: opcoes.tratamento?.medidas });
    if (tratamento.motivo) pendencias.push(tratamento.motivo);
    else {
      c2 = tratamento.comandos;
      presumido.push(
        `Tratamento individual (tanque séptico${opcoes.tratamento?.comFiltro === false ? '' : ', filtro anaeróbio'} e sumidouro) posto em fila a partir da caixa de inspeção — confira a infiltração do solo e as distâncias da NBR 7229/13969.`,
      );
    }
  } else {
    // O coletor até a rede pública. Coletor com trecho CONFIRMADO à mão é decisão do usuário: não se relança.
    coletor = planejarColetorPredial(m1, hip, terreno);
    const confirmadoAMao = (m1.trechos ?? []).some((t) => t.rotulo === ROTULO_DO_COLETOR && !t.sugerido);
    lancaColetor = !coletor.motivo && coletor.comandos.length > 0 && !confirmadoAMao && !coletorIgualAoPlano(m1, coletor);
    if (coletor.motivo) pendencias.push(coletor.motivo);
    if (lancaColetor && coletor.ligacaoProposta) {
      presumido.push(
        `Ligação à rede pública posta na frente do lote, com a rede ESTIMADA a ${metros(hip.profundidadeDaRedeMm ?? 1500)} m de profundidade (cota −${metros(coletor.ligacaoProposta.cotaMm)} m).`,
      );
    }
    c2 = lancaColetor ? coletor.comandos : [];
  }
  const m2 = c2.length > 0 ? applyBatch(m1, c2).model : m1;

  // 3. A ventilação (vazia quando já atende).
  const ventilacao = planejarVentilacao(m2, hip);
  const c3 = ventilacao.comandos;

  if (presumido.length > 0) {
    presumido.push(
      lancaColetor && coletor?.ligacaoProposta
        ? 'Arraste as peças para onde estão de verdade (o plano recalcula) e confirme a cota da rede com a concessionária.'
        : 'Arraste as peças para onde estão de verdade (o plano recalcula).',
    );
  }
  return { comandos: [...c0, ...c1, ...c2, ...c3], esgoto, coletor, lancaColetor, tratamento, ventilacao, destino, confirmadosDoOutroDestino, presumido, pendencias };
}
