/**
 * A NUMERAÇÃO da rede de incêndio (30/09/2026, E1.4 do roadmap de incêndio):
 * H-1, H-2…, MG-1, SPK-12, VGA-1. DERIVADA, nunca gravada — o mesmo modelo de
 * `nomesDasColunas` (`blueprintEsquemaVertical.ts`): apagar o H-2 renumera o
 * desenho sem comando nenhum. Quem precisa de um número fixo (a prancha
 * aprovada chama o hidrante de "H-3") DECLARA o rótulo da peça, e o declarado
 * vence: ele reserva o número, e os derivados pulam por cima dele.
 *
 * A ordem é a de quem lê o projeto: pavimento de baixo para cima; dentro do
 * pavimento, de cima para baixo e da esquerda para a direita na planta (y do
 * modelo cresce para cima).
 */
import type { BlueprintModel, ObjectId, TipoDePontoHidraulico } from './blueprintKernel';
import { numeracaoDerivada, type NumeroDaPeca } from './blueprintNumeracaoDerivada';

/** O prefixo de cada tipo numerado. Tipos com o MESMO prefixo dividem a série (hidrante simples e duplo). */
export const PREFIXO_DA_NUMERACAO: Partial<Record<TipoDePontoHidraulico, string>> = {
  HIDRANTE_SIMPLES: 'H',
  HIDRANTE_DUPLO: 'H',
  MANGOTINHO: 'MG',
  HIDRANTE_RECALQUE: 'RR',
  SPRINKLER: 'SPK',
  VGA: 'VGA',
  CHAVE_FLUXO: 'CF',
  BOMBA_INCENDIO: 'BI',
  BOMBA_JOCKEY: 'BJ',
  PRESSOSTATO: 'PS',
  EXTINTOR: 'EXT',
  PLACA: 'PL',
  LUMINARIA_EMERGENCIA: 'LE',
  DETECTOR_FUMACA: 'DF',
  DETECTOR_TEMPERATURA: 'DT',
  DETECTOR_CHAMA: 'DC',
  MANOMETRO: 'MN',
  ACIONADOR_MANUAL: 'AM',
  AVISADOR: 'AV',
  CENTRAL_ALARME: 'CA',
  PREVENTIVO_PERSONALIZADO: 'PP',
};

export type { NumeroDaPeca } from './blueprintNumeracaoDerivada';

/**
 * O número de cada peça de incêndio numerável, por id do terminal. O laço vive em
 * `blueprintNumeracaoDerivada.ts` desde 04/10/2026 (a climatização numera igual).
 */
export function numeracaoDeIncendio(model: BlueprintModel): Map<ObjectId, NumeroDaPeca> {
  return numeracaoDerivada(model, (t) => (t.disciplina === 'INCENDIO' && t.tipoHidraulico ? PREFIXO_DA_NUMERACAO[t.tipoHidraulico] : null));
}
