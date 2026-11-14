/**
 * Módulo ÒPURA Riscos — tipos. Espelham as tabelas de
 * supabase/migrations/aplicar_20271114637000_modulo_riscos_estrutura.sql.
 * Plano: docs/planos/2026-11-13-modulo-riscos.md.
 *
 * ⚠️ Nomes próprios (`Risk*`) de propósito: `RiskCategory`/`RiskStatus` de
 * `services/opportunityRiskService.ts` são da Oportunidade (Investidor) e
 * `RiskLevel` de `types/organizationGovernance.ts` é da Governança — outros domínios.
 */

export const RISK_DIMENSOES = ['financeira', 'prazo', 'seguranca', 'qualidade', 'juridica', 'ambiental', 'reputacional', 'operacional'] as const;
export type RiskDimensao = typeof RISK_DIMENSOES[number];

export const RISK_FASES = ['aquisicao', 'viabilidade', 'projeto_aprovacao', 'contratacao', 'inicio_obra', 'fundacoes', 'estrutura', 'instalacoes', 'acabamentos', 'entrega', 'pos_obra'] as const;
export type RiskFase = typeof RISK_FASES[number];

export const RISK_TIPOLOGIAS = ['residencial', 'comercial', 'galpao_industrial', 'loteamento', 'reforma', 'obra_publica'] as const;
export type RiskTipologia = typeof RISK_TIPOLOGIAS[number];

export type RiskEscopo = 'corporativo' | 'empreendimento' | 'obra' | 'contrato';
export type RiskTipo = 'ameaca' | 'oportunidade';
export type RiskEstrategia = 'evitar' | 'mitigar' | 'transferir' | 'aceitar' | 'escalar';
export type RiskStatus = 'identificado' | 'em_avaliacao' | 'em_tratamento' | 'monitorado' | 'materializado' | 'encerrado';
export type RiskRevisaoTecnica = 'rascunho' | 'revisado' | 'aprovado';
export type RiskNivel = 'baixo' | 'medio' | 'alto' | 'critico';
export type RiskAvaliacaoTipo = 'inerente' | 'residual';
export type RiskAcaoStatus = 'planejada' | 'em_andamento' | 'concluida' | 'cancelada';
export type RiskEficacia = 'nao_verificada' | 'eficaz' | 'ineficaz';

export const RISK_ROTULO = {
    dimensao: { financeira: 'Financeira', prazo: 'Prazo', seguranca: 'Segurança', qualidade: 'Qualidade', juridica: 'Jurídica', ambiental: 'Ambiental', reputacional: 'Reputacional', operacional: 'Operacional' } as Record<RiskDimensao, string>,
    fase: { aquisicao: 'Aquisição', viabilidade: 'Viabilidade', projeto_aprovacao: 'Projeto e aprovação', contratacao: 'Contratação', inicio_obra: 'Início da obra', fundacoes: 'Fundações', estrutura: 'Estrutura', instalacoes: 'Instalações', acabamentos: 'Acabamentos', entrega: 'Entrega', pos_obra: 'Pós-obra' } as Record<RiskFase, string>,
    tipologia: { residencial: 'Residencial', comercial: 'Comercial', galpao_industrial: 'Galpão industrial', loteamento: 'Loteamento', reforma: 'Reforma', obra_publica: 'Obra pública' } as Record<RiskTipologia, string>,
    escopo: { corporativo: 'Corporativo', empreendimento: 'Empreendimento', obra: 'Obra', contrato: 'Contrato' } as Record<RiskEscopo, string>,
    estrategia: { evitar: 'Evitar', mitigar: 'Mitigar', transferir: 'Transferir ou compartilhar', aceitar: 'Aceitar', escalar: 'Escalar' } as Record<RiskEstrategia, string>,
    status: { identificado: 'Identificado', em_avaliacao: 'Em avaliação', em_tratamento: 'Em tratamento', monitorado: 'Monitorado', materializado: 'Materializado', encerrado: 'Encerrado' } as Record<RiskStatus, string>,
    nivel: { baixo: 'Baixo', medio: 'Médio', alto: 'Alto', critico: 'Crítico' } as Record<RiskNivel, string>,
    acaoStatus: { planejada: 'Planejada', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada' } as Record<RiskAcaoStatus, string>,
    eficacia: { nao_verificada: 'Não verificada', eficaz: 'Eficaz', ineficaz: 'Ineficaz' } as Record<RiskEficacia, string>,
    revisao: { rascunho: 'Rascunho em revisão técnica', revisado: 'Revisado', aprovado: 'Aprovado' } as Record<RiskRevisaoTecnica, string>,
};

export interface RiskCategoryRow {
    id: string;
    organization_id: string | null;
    codigo: string;
    nome: string;
    ordem: number;
}

export interface RiskCatalogItem {
    id: string;
    organization_id: string | null;
    category_id: string;
    codigo: string;
    evento: string;
    causas: string[];
    consequencias: string[];
    controles_preventivos: string[];
    controles_resposta: string[];
    sinais_alerta: string[];
    dimensoes: RiskDimensao[];
    fases: RiskFase[];
    tipologias: RiskTipologia[];
    condicoes_sugestao: string[];
    integracoes: string[];
    referencias: string[];
    gatilho_critico: boolean;
    gatilho_motivo: string | null;
    revisao_tecnica: RiskRevisaoTecnica;
    versao: number;
    ativo: boolean;
    updated_at: string;
}

/** Faixas da matriz por organização. Sem linha no banco = `RISK_MATRIZ_PADRAO`. */
export interface RiskMatrixConfig {
    limite_medio: number;
    limite_alto: number;
    limite_critico: number;
}

export interface ProjectRisk {
    id: string;
    organization_id: string;
    numero: number;
    codigo: string;
    catalog_id: string | null;
    catalog_codigo: string | null;
    catalog_versao: number | null;
    category_id: string | null;
    tipo: RiskTipo;
    titulo: string;
    causa: string;
    evento: string;
    consequencia: string;
    tags: string[];
    dimensoes: RiskDimensao[];
    escopo: RiskEscopo;
    empreendimento_id: string | null;
    project_id: string | null;
    contract_id: string | null;
    frente: string | null;
    localizacao: string | null;
    fase: RiskFase | null;
    partes_afetadas: string | null;
    owner_user_id: string;
    owner_nome: string | null;
    avaliador_user_id: string | null;
    aprovador_user_id: string | null;
    data_identificacao: string;
    proxima_revisao: string;
    controles_existentes: string | null;
    estrategia: RiskEstrategia | null;
    plano_resposta: string | null;
    contingencia: string | null;
    justificativa_aceite: string | null;
    status: RiskStatus;
    encerramento_motivo: string | null;
    encerrado_em: string | null;
    gatilho_critico: boolean;
    gatilho_motivo: string | null;
    inerente_probabilidade: number | null;
    inerente_impacto: number | null;
    inerente_pontuacao: number | null;
    residual_probabilidade: number | null;
    residual_impacto: number | null;
    residual_pontuacao: number | null;
    valor_esperado: number | null;
    ultima_avaliacao_em: string | null;
    sst_document_tipo: 'risk_assessment' | 'sst_regulatory_doc' | null;
    sst_document_id: string | null;
    created_at: string;
    updated_at: string;
}

/** Campos editáveis na ficha (o resto é do banco: código, espelho da avaliação, datas). */
export type ProjectRiskInput = Pick<ProjectRisk,
    'catalog_id' | 'catalog_codigo' | 'catalog_versao' | 'category_id' | 'tipo' | 'titulo' | 'causa' | 'evento' |
    'consequencia' | 'tags' | 'dimensoes' | 'escopo' | 'empreendimento_id' | 'project_id' | 'contract_id' | 'frente' |
    'localizacao' | 'fase' | 'partes_afetadas' | 'owner_user_id' | 'owner_nome' | 'avaliador_user_id' |
    'aprovador_user_id' | 'data_identificacao' | 'proxima_revisao' | 'controles_existentes' | 'estrategia' |
    'plano_resposta' | 'contingencia' | 'justificativa_aceite' | 'status' | 'encerramento_motivo' |
    'gatilho_critico' | 'gatilho_motivo' | 'sst_document_tipo' | 'sst_document_id'>;

export interface RiskEvaluation {
    id: string;
    organization_id: string;
    project_risk_id: string;
    tipo: RiskAvaliacaoTipo;
    metodo: 'matriz_5x5' | 'multidimensional';
    probabilidade: number;
    impactos: Partial<Record<RiskDimensao, number>>;
    impacto: number;
    pontuacao: number;
    probabilidade_pct: number | null;
    perda_estimada: number | null;
    atraso_dias: number | null;
    valor_esperado: number | null;
    premissas: string | null;
    justificativa: string;
    evidencia_url: string | null;
    evidencia_document_id: string | null;
    avaliado_por: string | null;
    avaliado_por_nome: string | null;
    avaliado_em: string;
}

export type RiskEvaluationInput = Pick<RiskEvaluation,
    'tipo' | 'metodo' | 'probabilidade' | 'impactos' | 'probabilidade_pct' | 'perda_estimada' | 'atraso_dias' |
    'premissas' | 'justificativa' | 'evidencia_url' | 'evidencia_document_id' | 'avaliado_por_nome'>;

export interface RiskAction {
    id: string;
    organization_id: string;
    project_risk_id: string;
    tipo: 'preventiva' | 'resposta';
    descricao: string;
    responsavel_user_id: string;
    responsavel_nome: string | null;
    prazo: string;
    custo_previsto: number;
    custo_realizado: number | null;
    status: RiskAcaoStatus;
    concluida_em: string | null;
    evidencia_url: string | null;
    evidencia_document_id: string | null;
    evidencia_descricao: string | null;
    eficacia: RiskEficacia;
    eficacia_verificada_por: string | null;
    eficacia_verificada_em: string | null;
    eficacia_observacao: string | null;
    task_id: string | null;
    created_at: string;
    updated_at: string;
}

export type RiskActionInput = Pick<RiskAction,
    'tipo' | 'descricao' | 'responsavel_user_id' | 'responsavel_nome' | 'prazo' | 'custo_previsto' | 'custo_realizado' |
    'status' | 'concluida_em' | 'evidencia_url' | 'evidencia_document_id' | 'evidencia_descricao' | 'eficacia' |
    'eficacia_observacao'>;

export interface RiskAuditLog {
    id: string;
    organization_id: string;
    project_risk_id: string | null;
    entity_type: 'risk' | 'evaluation' | 'action' | 'catalog' | 'config';
    entity_id: string | null;
    entity_label: string | null;
    action: 'create' | 'update' | 'delete' | 'evaluate' | 'close' | 'reopen' | 'link' | 'unlink';
    field_name: string | null;
    old_value: unknown;
    new_value: unknown;
    metadata: Record<string, unknown>;
    reason: string | null;
    user_id: string | null;
    user_email: string | null;
    created_at: string;
}
