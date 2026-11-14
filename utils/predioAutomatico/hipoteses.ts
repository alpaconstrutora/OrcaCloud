/**
 * Prédio automático — os tipos do motor (PA2 do plano docs/planos/2026-11-12-predio-automatico.md, 13/11/2026). Molde:
 * `utils/casaAutomatica/hipoteses.ts`. Na PA2 o prédio tem a arquitetura (pavimento tipo, cópias vivas e a planta das
 * unidades); cada fase seguinte acrescenta as suas etapas aqui.
 */
import type { BlueprintModel, Command, ObjectId } from '../blueprintKernel';
import type { PendenciaDoPpci, SituacaoDaEtapa } from '../blueprintGeradorPpci';
import type { EsquemaDoPavimento } from '../blueprintPavimentoTipoDaMassa';

export type EtapaDoPredioId = 'PAVIMENTO_TIPO' | 'PLANTAS' | 'INSTALACOES_NO_TIPO' | 'CONFERENCIA';

/** Rótulo de cada etapa, na ordem em que rodam (a tela e o relatório leem daqui). */
export const ROTULO_DA_ETAPA_DO_PREDIO: Record<EtapaDoPredioId, string> = {
  PAVIMENTO_TIPO: 'Pavimento tipo (corredor, núcleo, unidades) e os andares como cópias vivas',
  PLANTAS: 'Planta interna das unidades (cômodos, portas e janelas)',
  INSTALACOES_NO_TIPO: 'Instalações desenhadas no tipo vão aos andares (cópia viva)',
  CONFERENCIA: 'Conferência (avisos da divisão, da montagem e das plantas)',
};

export const ORDEM_DAS_ETAPAS_DO_PREDIO = Object.keys(ROTULO_DA_ETAPA_DO_PREDIO) as EtapaDoPredioId[];

export interface EtapaDoPredio {
  id: EtapaDoPredioId;
  rotulo: string;
  situacao: SituacaoDaEtapa;
  comandos: number;
  nota: string | null;
}

export interface HipotesesDoPredio {
  /** `false` = o prédio sai com as unidades vazias (só o perímetro de cada uma), como o "Montar neste estudo" de antes. */
  plantas: boolean;
}

export const HIPOTESES_DO_PREDIO_PADRAO: HipotesesDoPredio = { plantas: true };

export interface PlanoDoPredio {
  blocoId: ObjectId;
  /** O LOTE: aplicado no modelo original de uma vez, um Ctrl+Z. */
  comandos: Command[];
  /** Os ids que o lote cria, na ordem — para conferir a reaplicação. */
  criados: ObjectId[];
  etapas: EtapaDoPredio[];
  pendencias: PendenciaDoPpci[];
  /** O modelo DEPOIS do lote (a prévia). */
  resultado: BlueprintModel;
  /** O pavimento tipo criado — onde a prévia abre. */
  tipoLevelId: ObjectId;
  decisoes: string[];
  resumo: {
    esquema: EsquemaDoPavimento;
    /** Pavimentos do bloco com unidade: o tipo e as cópias. */
    pavimentos: number;
    copias: number;
    unidadesPorAndar: number;
    /** No prédio inteiro: unidades por andar × pavimentos. */
    unidades: number;
    elevadores: number;
    eficienciaDesenhadaPct: number | null;
    /** `null` quando as plantas não foram pedidas. */
    plantas: { unidades: number; comodos: number; grupos: number; semFachada: number } | null;
  };
}

export interface OpcoesDoPlanoDoPredio {
  aoConcluirEtapa?: (e: EtapaDoPredio, indice: number, total: number) => void;
}
