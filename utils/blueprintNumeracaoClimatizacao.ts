/**
 * A NUMERAÇÃO da climatização (04/10/2026, E3.4 do roadmap de climatização):
 * EV-1, CD-1, DV-3, DF-12… DERIVADA, pelo mesmo algoritmo do incêndio
 * (`blueprintNumeracaoDerivada.ts`): o rótulo declarado vence e reserva o número.
 *
 * As evaporadoras dividem UMA série (EV) seja qual for o tipo — quem lê a
 * planta conta evaporadoras, não hi-walls; o mesmo para as condensadoras (CD).
 * Os terminais de ar têm série por função (DF, GI, GR…), porque o quantitativo
 * e a prancha os separam assim.
 */
import type { BlueprintModel, ObjectId, Terminal, TipoDePontoHidraulico } from './blueprintKernel';
import { TIPOS_DE_CLIMATIZACAO } from './blueprintKernel';
import { numeracaoDerivada, type NumeroDaPeca } from './blueprintNumeracaoDerivada';

export type { NumeroDaPeca };

/** O prefixo de cada tipo numerado — a sigla da ficha, que é o que a planta já escreve. */
export const PREFIXO_DA_NUMERACAO_CLIMATIZACAO: Partial<Record<TipoDePontoHidraulico, string>> = {
  EVAPORADORA_HI_WALL: 'EV',
  EVAPORADORA_PISO_TETO: 'EV',
  EVAPORADORA_CASSETE: 'EV',
  EVAPORADORA_DUTADA: 'EV',
  CONDENSADORA_SPLIT: 'CD',
  CONDENSADORA_VRF: 'CD',
  DERIVADOR_VRF: 'DV',
  EXAUSTOR_AR: 'EX',
  BOMBA_DRENO: 'BD',
  PONTO_DRENO: 'PD',
  CAIXA_DISTRIBUICAO_AR: 'CX',
  DIFUSOR: 'DF',
  GRELHA_INSUFLAMENTO: 'GI',
  GRELHA_RETORNO: 'GR',
  BOCAL_AR: 'BC',
  TOMADA_AR_EXTERIOR: 'TA',
  VENEZIANA_AR: 'VN',
  CAIXA_PLENUM: 'PL',
  DAMPER: 'DP',
  EQUIPAMENTO_CLIMATIZACAO: 'EQ',
};

const ehDeClimatizacao = (t: Terminal): t is Terminal & { tipoHidraulico: TipoDePontoHidraulico } =>
  !!t.tipoHidraulico && (TIPOS_DE_CLIMATIZACAO as readonly string[]).includes(t.tipoHidraulico);

/** O número de cada peça de climatização numerável, por id do terminal. */
export function numeracaoDeClimatizacao(model: BlueprintModel): Map<ObjectId, NumeroDaPeca> {
  return numeracaoDerivada(model, (t) => (ehDeClimatizacao(t) ? PREFIXO_DA_NUMERACAO_CLIMATIZACAO[t.tipoHidraulico] : null));
}
