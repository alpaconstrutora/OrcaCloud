// types/blueprint.ts
//
// Domínio de persistência do módulo Planta Inteligente (épico E0).
//
// Separado de `utils/blueprintKernel` de propósito: o kernel é geometria pura, sem
// noção de organização, usuário ou banco. Estes tipos são a borda — o que atravessa
// a rede e o que a RLS protege.

import type { Georreferencia, Point } from '../utils/blueprintKernel';
import type { LinhaDeDrenagem } from '../utils/blueprintTopografiaAnalises';
import type { ParametrosEstruturais, ParametrosHidraulicos } from '../utils/blueprintTopografiaDimensionamento';
import type { ResponsavelTecnico, Sondagem, VerificacaoExecutiva } from '../utils/blueprintTopografiaExecutivo';

/**
 * Qual versão de topografia estava em uso quando a versão do estudo foi
 * publicada (fase 7). Fora do hash do desenho; imutável; some com o snapshot.
 */
export interface BlueprintSnapshotTopografiaRow {
  snapshot_id: string;
  organization_id: string;
  study_id: string;
  /** `null` se a versão de topografia foi apagada depois. */
  topografia_id: string | null;
  versao: number;
  fonte_codigo: string;
  hash_resultado: string;
  created_by: string | null;
  created_at: string;
}
import type {
  ClasseDeQualidade,
  CurvaDeNivel,
  EstatisticasDoTerreno,
  GradeDeElevacao,
  LinhaDeQuebra,
  ModoDeNiveis,
  PontoCotado,
  TinImportada,
} from '../utils/blueprintTopografia';

export type BlueprintStudyStatus = 'RASCUNHO' | 'EM_EDICAO' | 'PUBLICADO' | 'ARQUIVADO';

/**
 * Uma versão de topografia (curvas de nível) de um estudo — linha de
 * `blueprint_study_topografia` (migration `aplicar_20270921000005`).
 *
 * Vive FORA do payload canônico e é IMUTÁVEL: a tabela não concede UPDATE.
 * Toda proveniência da fonte é copiada para a linha, para a versão continuar
 * dizendo de onde veio mesmo que o registro de fontes mude.
 */
/**
 * Premissa de terraplenagem de um estudo — linha de
 * `blueprint_study_terraplenagem` (migration `aplicar_20270921000006`). Uma
 * por estudo; volumes são derivados, nunca gravados.
 */
/**
 * Uma via de projeto (C2, migration `aplicar_20270926000020`): eixo em mm do
 * desenho, passo do estaqueamento, PIVs do greide e seção tipo. Estacas,
 * seções, volumes e nota de serviço são derivados na tela.
 */
export interface BlueprintViaRow {
  id: string;
  study_id: string;
  organization_id: string;
  nome: string;
  via_uid: string | null;
  eixo: Point[];
  passo_m: number;
  greide: { pontos: { distM: number; cotaM: number; curvaM?: number }[] } | null;
  secao_tipo: { pistaM?: number; calcadaM?: number; taludeCorteH?: number; taludeAterroH?: number } | null;
  topografia_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlueprintTerraplenagemRow {
  id: string;
  study_id: string;
  organization_id: string;
  base: 'ENVELOPE' | 'LOTE';
  /** Cota do platô em metro; `null` = usar a cota de equilíbrio. */
  cota_plato_m: number | null;
  /**
   * C1 (migration `aplicar_20270926000010`): caimento do platô — longitudinal
   * ao longo do azimute de desenho, transversal a 90°. `null`/0 = horizontal.
   */
  inclinacao_long_pct: number | null;
  inclinacao_transv_pct: number | null;
  inclinacao_azimute_deg: number | null;
  /** Parâmetros de projeto (fase 3, migration `aplicar_20270921000007`). */
  talude_corte_h: number;
  talude_aterro_h: number;
  empolamento_pct: number;
  contracao_pct: number;
  /** Fase 4 (migration `aplicar_20270921000008`). */
  altura_do_lance_m: number;
  largura_da_banqueta_m: number;
  largura_da_via_m: number;
  talude_por_aresta: ({ corteH?: number | null; aterroH?: number | null; muro?: boolean | null } | null)[];
  /** Fase 6 (migration `aplicar_20270921000010`): drenagem traçada e caimento mínimo. */
  drenagem: LinhaDeDrenagem[];
  caimento_min_pct: number;
  /** Fase 7 (migration `aplicar_20270921000011`): hipóteses do pré-dimensionamento, parciais. */
  hidraulica: Partial<ParametrosHidraulicos>;
  estrutura: Partial<ParametrosEstruturais>;
  /**
   * Linhas desenhadas do perfil, em mm do desenho; `null` = usa um corte.
   * Fase 5 grava a LISTA (`Point[][]`); a fase 4 gravava uma linha só
   * (`Point[]`) — `linhasDoPerfilDaColuna` lê as duas formas.
   */
  perfil_polilinha: Point[][] | Point[] | null;
  created_at: string;
  updated_at: string;
}

/**
 * Emissão do projeto executivo (fase 17, migration `aplicar_20270921000016`):
 * RASCUNHO editável, EMITIDO imutável e amarrado ao hash da base.
 */
export interface BlueprintProjetoExecutivoRow {
  id: string;
  study_id: string;
  organization_id: string;
  status: 'RASCUNHO' | 'EMITIDO';
  /**
   * Qual projeto executivo a linha emite (migration `aplicar_20270921000018`):
   * TERRAPLENAGEM (topografia) ou ELETRICA (NBR 5410). Um rascunho por
   * estudo POR disciplina.
   */
  disciplina: 'TERRAPLENAGEM' | 'ELETRICA';
  responsavel: ResponsavelTecnico;
  /** Só a terraplenagem usa; a elétrica grava `{}`. */
  sondagem: Sondagem;
  topografia_id: string | null;
  topografia_versao: number | null;
  topografia_hash: string | null;
  hash_da_base: string | null;
  /** Da terraplenagem (`VerificacaoExecutiva`) ou da elétrica (`VerificacaoEletrica`) — mesma forma. */
  verificacoes: (VerificacaoExecutiva | { grupo: string; item: string; norma: string; exigido: string; obtido: string; atende: boolean })[];
  memorial: string | null;
  emitido_em: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Hipóteses do pré-dimensionamento elétrico de um estudo — linha de
 * `blueprint_study_eletrica` (migration `aplicar_20270921000018`). Uma por
 * estudo; JSONB parcial, completado com `HIPOTESES_PADRAO` na leitura.
 */
export interface BlueprintEletricaRow {
  id: string;
  study_id: string;
  organization_id: string;
  hipoteses: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Hipóteses da armadura esquemática de um estudo — linha de
 * `blueprint_study_armadura` (migration `aplicar_20270921000023`). Uma por
 * estudo; JSONB parcial, completado com `HIPOTESES_ARMADURA_PADRAO` na leitura.
 */
export interface BlueprintArmaduraRow {
  id: string;
  study_id: string;
  organization_id: string;
  hipoteses: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** PROGRAMA DE NECESSIDADES (E4.1) — uma linha por estudo; `programa` é `Programa` (utils/blueprintPrograma.ts). */
export interface BlueprintProgramRow {
  id: string;
  study_id: string;
  organization_id: string;
  nome: string;
  programa: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Biblioteca de materiais da organização (E7.4) — `blueprint_materials`. */
export interface BlueprintMaterialRow {
  id: string;
  organization_id: string;
  codigo: string;
  nome: string;
  fonte: 'SINAPI' | 'INTERNA';
  unidade: string;
  custo: number;
  fabricante: string | null;
  densidade_kg_m3: number | null;
  condutividade_w_mk: number | null;
  cor: string | null;
  funcao: string | null;
  espessura_padrao_mm: number | null;
  propriedades: Record<string, unknown>;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BlueprintTopografiaRow {
  id: string;
  study_id: string;
  organization_id: string;
  versao: number;
  fonte_codigo: string;
  fonte_nome: string;
  dataset_versao: string | null;
  resolucao_fonte_m: number | null;
  referencia_vertical: string | null;
  classe_qualidade: ClasseDeQualidade;
  grade: GradeDeElevacao;
  equidistancia_m: number;
  /** Fase 12 (migration `aplicar_20270921000013`; INTERVALO na fase 13, `aplicar_20270921000014`): como os níveis foram escolhidos; `niveis_m` só fora da equidistância. */
  modo_niveis: ModoDeNiveis;
  niveis_m: number[] | null;
  curvas: CurvaDeNivel[];
  estatisticas: EstatisticasDoTerreno;
  pontos_cotados: PontoCotado[];
  /** Fase 15 (migration `aplicar_20270921000015`): linhas de quebra honradas pela TIN e, se importada, as faces dela. */
  linhas_de_quebra: LinhaDeQuebra[];
  tin_importada: TinImportada | null;
  anel: Point[];
  georreferencia: Georreferencia | null;
  algoritmo_nome: string;
  algoritmo_versao: string;
  hash_entrada: string;
  hash_resultado: string;
  avisos: string[];
  created_by: string | null;
  created_at: string;
}

export interface BlueprintStudy {
  id: string;
  organization_id: string;
  project_id: string | null;
  name: string;
  unit_system: 'METRIC';
  status: BlueprintStudyStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlueprintLevelRow {
  id: string;
  study_id: string;
  organization_id: string;
  name: string;
  elevation_mm: number;
  default_height_mm: number;
  ordinal: number;
  created_at: string;
  updated_at: string;
}

export interface BlueprintBranch {
  id: string;
  study_id: string;
  organization_id: string;
  name: string;
  parent_snapshot_id: string | null;
  /** Revisão publicada mais recente deste ramo. Token de concorrência otimista. */
  base_revision: number;
  draft_payload: unknown | null;
  draft_kernel_version: string | null;
  draft_hash: string | null;
  draft_saved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** DESIGN OPTIONS (E6.1): a alternativa principal do estudo (uma por estudo). */
  principal: boolean;
  descricao: string | null;
  /** A versão publicada de onde a alternativa nasceu (informativo). */
  origem_snapshot_id: string | null;
}

export interface BlueprintSnapshot {
  id: string;
  study_id: string;
  branch_id: string;
  organization_id: string;
  revision: number;
  hash: string;
  kernel_version: string;
  payload: unknown;
  notes: string | null;
  published_by: string | null;
  published_at: string;
}

/** Snapshot sem o payload — para listagens, que não devem trafegar o JSON inteiro. */
export type BlueprintSnapshotSummary = Omit<BlueprintSnapshot, 'payload'>;

export interface BlueprintAuditEvent {
  id: string;
  organization_id: string;
  study_id: string | null;
  actor: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BlueprintQuantitySnapshot {
  id: string;
  snapshot_id: string;
  organization_id: string;
  policy_version: string;
  policy: unknown;
  kernel_version: string;
  payload: unknown;
  totais: unknown;
  computed_by: string | null;
  computed_at: string;
}

/** Erro de concorrência: o ramo avançou desde a leitura do cliente (PRD CA-05). */
export class BlueprintRevisionConflict extends Error {
  constructor(
    readonly sentRevision: number,
    message: string,
  ) {
    super(message);
    this.name = 'BlueprintRevisionConflict';
  }
}

/**
 * Zona do Mapa Regulatório aplicada a um estudo, com os números em vigor.
 *
 * Vive FORA do payload canônico de propósito: parâmetro urbanístico do município
 * não é geometria do desenho, e gravá-lo no snapshot faria o hash da planta
 * mudar porque alguém digitou um recuo. Tabela
 * `blueprint_study_urban_context` (migration `aplicar_20270914000000`).
 */
export interface BlueprintUrbanContext {
  id: string;
  study_id: string;
  organization_id: string;
  /** De onde os números vieram. `null` = zona de origem apagada ou nunca houve. */
  empreendimento_id: string | null;
  regulatory_zone_id: string | null;
  /** Cópia do rótulo, para a tela continuar legível se a zona sumir. */
  zona_rotulo: string | null;
  lei_referencia: string | null;
  /** Recuos em MILÍMETRO inteiro — a unidade do kernel. */
  recuo_frente_mm: number | null;
  recuo_fundos_mm: number | null;
  recuo_lateral_direita_mm: number | null;
  recuo_lateral_esquerda_mm: number | null;
  /** Taxas em PORCENTAGEM (80 = 80%), já resolvidas na leitura. */
  taxa_ocupacao_max: number | null;
  taxa_permeabilidade_min: number | null;
  coeficiente_max: number | null;
  /** Em METRO. */
  gabarito_altura_max_m: number | null;
  gabarito_pavimentos: number | null;
  /**
   * VOCABULÁRIO COMPLEMENTAR (E3.1, migration `aplicar_20270919000044`). `null`
   * = a lei não disse (ou linha anterior à migration).
   */
  testada_minima_mm?: number | null;
  area_minima_lote_m2?: number | null;
  vagas_por_unidade?: number | null;
  insolacao_minima_h?: number | null;
  afastamento_progressivo_a_partir_m?: number | null;
  afastamento_progressivo_formula?: string | null;
  /** P2.10 (migration `aplicar_20270920000059`): recuo de frente escalonado. */
  recuo_frente_escalonado_mm?: number | null;
  recuo_frente_escalonado_pavimento?: number | null;
  /**
   * Em qual tabela procurar `regulatory_zone_id`. `null` em linha anterior à
   * migration `aplicar_20270914000001` — lida como EMPREENDIMENTO, que é o que
   * ela era: à época o catálogo ainda não era um caminho.
   */
  zona_origem: 'EMPREENDIMENTO' | 'CATALOGO' | null;
  /** Só com origem CATALOGO: por onde a zona do mapa da cidade é relida. */
  regulatory_map_id: string | null;
  /** Por campo: veio da lei ou foi digitado por cima. */
  origem_valores: Record<string, 'ZONA' | 'MANUAL'>;
  aplicado_em: string | null;
  created_at: string;
  updated_at: string;
}
