/**
 * Prédio automático — os tipos do motor (PA2 do plano docs/planos/2026-11-12-predio-automatico.md, 13/11/2026). Molde:
 * `utils/casaAutomatica/hipoteses.ts`. Na PA2 o prédio tem a arquitetura (pavimento tipo, cópias vivas e a planta das
 * unidades); a PA3 acrescenta o térreo, a cobertura e os reservatórios; cada fase seguinte acrescenta as suas etapas aqui.
 */
import type { BlueprintModel, Command, ObjectId } from '../blueprintKernel';
import type { PendenciaDoPpci, SituacaoDaEtapa } from '../blueprintGeradorPpci';
import type { EsquemaDoPavimento } from '../blueprintPavimentoTipoDaMassa';

export type EtapaDoPredioId = 'PAVIMENTO_TIPO' | 'TERREO' | 'PLANTAS' | 'COBERTURA' | 'RESERVATORIOS' | 'INSTALACOES_NO_TIPO' | 'CONFERENCIA';

/** Rótulo de cada etapa, na ordem em que rodam (a tela e o relatório leem daqui). */
export const ROTULO_DA_ETAPA_DO_PREDIO: Record<EtapaDoPredioId, string> = {
  PAVIMENTO_TIPO: 'Pavimento tipo (corredor, núcleo, unidades) e os andares como cópias vivas',
  TERREO: 'Térreo (hall e portaria, acesso, centro de medição, casa de bombas) e o núcleo desde ele',
  PLANTAS: 'Planta interna das unidades (cômodos, portas e janelas)',
  COBERTURA: 'Cobertura (laje, platibanda, área técnica; a escada e o shaft chegam nela)',
  RESERVATORIOS: 'Reservatórios inferior (casa de bombas) e superior (sobre o núcleo)',
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
  /** PA3: o térreo do bloco (só quando o tipo é o 2º pavimento). `false` = fica para o projetista, como antes. */
  terreo: boolean;
  /** PA3: a cobertura sobre o último andar. */
  cobertura: boolean;
  /** Largura da porta de entrada do prédio, no hall, mm. */
  larguraDoAcessoMm: number;
  /** Pé-direito do pavimento da cobertura (a área técnica), mm. */
  peDireitoDaCoberturaMm: number;
  /** Espessura da laje de cobertura, mm. */
  espessuraDaLajeMm: number;
  /** Altura da platibanda no contorno da cobertura, mm. */
  alturaDaPlatibandaMm: number;
  /** Cota do reservatório superior acima do piso da cobertura (sobre a casa de máquinas e a caixa de escada), mm. */
  cotaDoReservatorioSuperiorMm: number;
}

export const HIPOTESES_DO_PREDIO_PADRAO: HipotesesDoPredio = {
  plantas: true,
  terreo: true,
  cobertura: true,
  larguraDoAcessoMm: 1200,
  peDireitoDaCoberturaMm: 3000,
  espessuraDaLajeMm: 120,
  alturaDaPlatibandaMm: 1100,
  cotaDoReservatorioSuperiorMm: 3000,
};

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
    /** Pavimentos que o lote cria: térreo, tipo, cópias e cobertura. */
    pavimentosLancados: number;
    copias: number;
    unidadesPorAndar: number;
    /** No prédio inteiro: unidades por andar × pavimentos. */
    unidades: number;
    elevadores: number;
    eficienciaDesenhadaPct: number | null;
    /** `null` quando as plantas não foram pedidas. */
    plantas: { unidades: number; comodos: number; grupos: number; semFachada: number } | null;
    /** PA3: as salas do térreo, na ordem das fatias, e se a porta de entrada coube; `null` sem térreo. */
    terreo: { salas: string[]; acesso: boolean } | null;
    /** PA3: a cota do piso da cobertura, m; `null` sem cobertura. */
    cobertura: { cotaM: number } | null;
    /** PA3: a reservação — pessoas contadas e o volume de cada reservatório lançado (`null` = não lançado). */
    reservacao: { pessoas: number; totalL: number; inferiorL: number | null; superiorL: number | null } | null;
  };
}

export interface OpcoesDoPlanoDoPredio {
  aoConcluirEtapa?: (e: EtapaDoPredio, indice: number, total: number) => void;
}
