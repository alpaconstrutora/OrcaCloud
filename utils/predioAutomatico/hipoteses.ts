/**
 * Prédio automático — os tipos do motor (PA2 do plano docs/planos/2026-11-12-predio-automatico.md, 13/11/2026). Molde:
 * `utils/casaAutomatica/hipoteses.ts`. Na PA2 o prédio tem a arquitetura (pavimento tipo, cópias vivas e a planta das
 * unidades); a PA3 acrescenta o térreo, a cobertura e os reservatórios; a PA4, a estrutura e as fundações; cada fase
 * seguinte acrescenta as suas etapas aqui.
 */
import type { BlueprintModel, Command, ObjectId } from '../blueprintKernel';
import type { PendenciaDoPpci, SituacaoDaEtapa } from '../blueprintGeradorPpci';
import type { EsquemaDoPavimento } from '../blueprintPavimentoTipoDaMassa';

export type EtapaDoPredioId = 'PAVIMENTO_TIPO' | 'TERREO' | 'ESTRUTURA' | 'FUNDACOES' | 'PLANTAS' | 'COBERTURA' | 'RESERVATORIOS' | 'ELETRICA' | 'CLIMATIZACAO' | 'ELETRODUTOS' | 'LOUCAS' | 'AGUA_FRIA' | 'ESGOTO' | 'INSTALACOES_NO_TIPO' | 'PRESSAO_DA_AGUA' | 'CONFERENCIA';

/** Rótulo de cada etapa, na ordem em que rodam (a tela e o relatório leem daqui). */
export const ROTULO_DA_ETAPA_DO_PREDIO: Record<EtapaDoPredioId, string> = {
  PAVIMENTO_TIPO: 'Pavimento tipo (corredor, núcleo, unidades) e os andares como cópias vivas',
  TERREO: 'Térreo (hall e portaria, acesso, centro de medição, casa de bombas) e o núcleo desde ele',
  ESTRUTURA: 'Estrutura (pilares, vigas e lajes no tipo — vão às cópias —, a mesma malha no térreo, os eixos)',
  FUNDACOES: 'Fundações (blocos e estacas sob os pilares — pré-dimensionamento, exige cálculo)',
  PLANTAS: 'Planta interna das unidades (cômodos, portas e janelas)',
  COBERTURA: 'Cobertura (laje, platibanda, área técnica; a escada e o shaft chegam nela)',
  RESERVATORIOS: 'Reservatórios inferior (casa de bombas) e superior (sobre o núcleo)',
  ELETRICA: 'Elétrica coletiva (pontos, QD por unidade, QGBT e medidores, quadro de serviço, DR)',
  CLIMATIZACAO: 'Climatização no tipo (splits, linhas e drenos; o circuito no QD da unidade)',
  ELETRODUTOS: 'Eletrodutos por quadro e a prumada dos alimentadores no shaft',
  LOUCAS: 'Louças e pontos de água no tipo (o kit de cada ambiente e os pontos de cada louça)',
  AGUA_FRIA: 'Água fria (alimentador, recalque, barrilete, coluna no shaft, hidrômetro por unidade no hall, rede das unidades)',
  ESGOTO: 'Esgoto e ventilação (ramais, tubo de queda por grupo molhado, ventilação, desvio no térreo, coletor)',
  INSTALACOES_NO_TIPO: 'Instalações desenhadas no tipo vão aos andares (cópia viva)',
  PRESSAO_DA_AGUA: 'Pressão da água fria no prédio inteiro (pressurizador em cima, VRP embaixo)',
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
  /** PA4: pilares, vigas, lajes, eixos e fundações (os planejadores da casa, com as hipóteses padrão das gavetas). */
  estrutura: boolean;
  /** PA5: a elétrica coletiva — pontos, QD por unidade, QGBT, medição, quadro de serviço. */
  eletrica: boolean;
  /** PA5b: a climatização das unidades (precisa do catálogo de evaporadoras da organização) — só com a elétrica. */
  climatizacao: boolean;
  /** PA6: a água fria — louças e pontos no tipo, hidrômetro por unidade, coluna, barrilete, recalque e a pressão. */
  agua: boolean;
  /** PA7a: o esgoto e a ventilação — pede a água (as louças vêm com ela). */
  esgoto: boolean;
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
  estrutura: true,
  eletrica: true,
  climatizacao: true,
  agua: true,
  esgoto: true,
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
  /**
   * PA5: o `snapshotHash` do desenho de onde o plano saiu. O motor é determinístico: o mesmo desenho (e a mesma
   * assinatura do pedido) dá o mesmo lote — a trava compara o hash em vez de reaplicar centenas de comandos.
   */
  hashDoOriginal: string;
  /** O `snapshotHash` do `resultado` — o editor o leva aos colaboradores sem recalcular (o lançamento não reaplica). */
  hashDoResultado: string;
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
    /**
     * PA4: a estrutura — peças do tipo (cada cópia repete), as coladas no térreo, os eixos e a fundação; `null` com a
     * estrutura desligada.
     */
    estrutura: { pilares: number; vigas: number; lajes: number; noTerreo: number; eixos: number; blocos: number; estacas: number } | null;
    /**
     * PA5: a elétrica coletiva — por andar (QDs, circuitos), o serviço, a medição e a entrada do QGBT (a demanda pela
     * diversidade, a categoria do padrão, as unidades atendidas × medidas); `null` desligada.
     */
    eletrica: {
      pontos: number;
      quadros: number;
      circuitos: number;
      servico: number;
      medidores: number;
      drs: number;
      demandaKva: number | null;
      categoria: string | null;
      unidadesAtendidas: number;
      unidadesMedidas: number;
      faltas: number;
      avisos: number;
      /** PA5b: splits no tipo (cada cópia repete); `null` sem a climatização. */
      splits: number | null;
      /** PA5b: trechos de eletroduto no tipo e no térreo, e os trechos da prumada no shaft. */
      eletrodutos: number;
      prumadas: number;
    } | null;
    /** PA3: a reservação — pessoas contadas e o volume de cada reservatório lançado (`null` = não lançado). */
    reservacao: { pessoas: number; totalL: number; inferiorL: number | null; superiorL: number | null } | null;
    /**
     * PA6: a água fria — por andar (pontos, hidrômetros), a coluna, o recalque, a reserva de incêndio no superior e a
     * pressão do prédio inteiro; `null` desligada.
     */
    agua: {
      pontos: number;
      hidrometros: number;
      /** No prédio inteiro: hidrômetros por andar × pavimentos. */
      unidadesMedidas: number;
      colunaDnMm: number | null;
      recalque: { dnMm: number; motorCv: number; alturaManometricaM: number } | null;
      alimentadorDnMm: number | null;
      rtiL: number | null;
      estaticaMaxKpa: number | null;
      dinamicaMinKpa: number | null;
      pressurizador: boolean;
      vrp: boolean;
      insuficientes: number;
      excessivas: number;
      naoAvaliados: number;
    } | null;
    /**
     * PA7a: o esgoto — por andar (tubos de queda, pontos, UHC), o maior DN de tubo de queda, a ventilação e o coletor;
     * `null` desligado.
     */
    esgoto: {
      tubosDeQueda: number;
      pontos: number;
      uhcPorAndar: number;
      dnTuboDeQuedaMm: number;
      dnVentilacaoMm: number;
      /** Cada tubo de queda do tipo: as UHC que ele recebe por andar, se tem bacia, e o DN (a Tabela 6 pelos andares). */
      tubos: { uhcPorAndar: number; comBacia: boolean; dnMm: number }[];
      coletor: { dnMm: number; declividadePct: number; porGravidade: boolean } | null;
    } | null;
  };
}

export interface OpcoesDoPlanoDoPredio {
  aoConcluirEtapa?: (e: EtapaDoPredio, indice: number, total: number) => void;
}
