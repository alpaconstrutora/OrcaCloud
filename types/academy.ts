/**
 * Academia ÒPURA — Treinamento e Desenvolvimento (T&D).
 *
 * Tipos do LMS pendurado em `training_courses`. O treinamento continua sendo
 * UMA entidade só (RH/SESMT/obra compartilham a mesma linha); a Academia
 * acrescenta conteúdo versionado e, ao concluir, escreve de volta em
 * `employee_trainings` — que segue sendo a fonte de "treinamento realizado".
 *
 * Cadeia: Treinamento → versão → módulos → aulas → materiais → atribuições
 *         → acessos → avaliações → conclusão → certificado
 *
 * Spec: PLANO_MODULO_TREINAMENTOS.md
 */

// ── Catálogo (tabelas legadas, tipos migrados de laborService) ────────────

export type TrainingCategoria =
    | 'NR_OBRIGATORIA' | 'INTEGRACAO' | 'DDS'
    | 'QUALIDADE' | 'LIDERANCA' | 'TECNICO' | 'OUTROS';

export type TrainingModalidade = 'PRESENCIAL' | 'EAD' | 'HIBRIDO';

export interface TrainingCourse {
    id: string;
    org_id: string;
    nome: string;
    descricao?: string;
    nr_referencia?: string;
    categoria: TrainingCategoria;
    carga_horaria: number;
    validade_meses?: number;
    instrutor?: string;
    is_obrigatorio: boolean;
    roles_obrigatorios: string[];
    status: 'ATIVO' | 'INATIVO';
    // Academia (20270850000000)
    modalidade?: TrainingModalidade;
    cargos_obrigatorios?: string[];
    funcoes_obrigatorias?: string[];
    capa_storage_path?: string;
    created_at?: string;
    updated_at?: string;
}

export type EmployeeTrainingOrigem = 'MANUAL' | 'ACADEMIA';

export interface EmployeeTraining {
    id: string;
    org_id: string;
    employee_id: string;
    employee_name?: string;
    course_id: string;
    course_nome?: string;
    nr_referencia?: string;
    data_realizacao: string;
    data_validade?: string;
    instrutor?: string;
    local?: string;
    carga_horaria?: number;
    certificado_url?: string;
    nota?: number;
    aprovado: boolean;
    status: 'ATIVO' | 'VENCIDO' | 'PENDENTE';
    observacoes?: string;
    // Academia (20270850000000)
    origem?: EmployeeTrainingOrigem;
    enrollment_id?: string;
    version_id?: string;
    academy_certificate_id?: string;
    created_at?: string;
    updated_at?: string;
}

// ── Versões ──────────────────────────────────────────────────────────────

export type AcademyVersionStatus = 'RASCUNHO' | 'PUBLICADA' | 'ARQUIVADA';

export interface AcademyCourseVersion {
    id: string;
    org_id: string;
    course_id: string;
    versao: number;
    status: AcademyVersionStatus;
    titulo_versao?: string;
    notas_versao?: string;
    carga_horaria_ead: number;
    validade_meses_override?: number;
    /** Critérios de conclusão — congelados na versão de propósito. */
    regra_percentual_minimo: number;
    regra_nota_minima?: number;
    regra_exige_aceite: boolean;
    regra_texto_aceite?: string;
    regra_ordem_obrigatoria: boolean;
    regra_tentativas_max: number;
    exige_reciclagem: boolean;
    migrar_em_andamento: boolean;
    publicada_em?: string;
    publicada_por?: string;
    arquivada_em?: string;
    created_at?: string;
    updated_at?: string;
}

/** Prévia do impacto da publicação (bloco de contexto do useConfirm). */
export interface AcademyPublishPreview {
    versao: number;
    modulos: number;
    aulas: number;
    provas: number;
    reciclagens: number;
    em_andamento: number;
    migrar_em_andamento: boolean;
}

// ── Conteúdo ─────────────────────────────────────────────────────────────

export interface AcademyModule {
    id: string;
    org_id: string;
    version_id: string;
    titulo: string;
    descricao?: string;
    ordem: number;
    obrigatorio: boolean;
    created_at?: string;
    updated_at?: string;
}

export type AcademyLessonTipo =
    | 'VIDEO_UPLOAD' | 'VIDEO_LINK' | 'PDF' | 'AUDIO' | 'IMAGEM' | 'TEXTO';

export interface AcademyLesson {
    id: string;
    org_id: string;
    module_id: string;
    version_id: string;
    titulo: string;
    descricao?: string;
    ordem: number;
    tipo: AcademyLessonTipo;
    /** PATH no bucket privado. NUNCA guardar URL. */
    storage_path?: string;
    video_url?: string;
    conteudo_html?: string;
    duracao_segundos?: number;
    tempo_minimo_segundos?: number;
    percentual_minimo_override?: number;
    obrigatoria: boolean;
    /** FALSE = arrastar a barra para frente não credita progresso. */
    permite_avanco_rapido: boolean;
    created_at?: string;
    updated_at?: string;
}

export type AcademyMaterialTipo = 'ARQUIVO' | 'LINK';

export interface AcademyMaterial {
    id: string;
    org_id: string;
    version_id: string;
    module_id?: string;
    lesson_id?: string;
    titulo: string;
    tipo: AcademyMaterialTipo;
    storage_path?: string;
    url?: string;
    mime_type?: string;
    tamanho_bytes?: number;
    ordem: number;
    exige_download: boolean;
    created_at?: string;
    updated_at?: string;
}

// ── Atribuição e matrícula ───────────────────────────────────────────────

export type AcademyAssignmentAlvo =
    | 'COLABORADOR' | 'CARGO' | 'FUNCAO' | 'EQUIPE' | 'OBRA' | 'TODOS';

export interface AcademyAssignment {
    id: string;
    org_id: string;
    course_id: string;
    course_nome?: string;
    alvo_tipo: AcademyAssignmentAlvo;
    /** Polimórfico: employees | org_roles | org_funcoes | labor_teams | projects. */
    alvo_id?: string;
    alvo_nome?: string;
    version_id?: string;
    obrigatorio: boolean;
    prazo_dias?: number;
    data_limite?: string;
    reciclagem_automatica: boolean;
    status: 'ATIVA' | 'INATIVA';
    observacoes?: string;
    created_by?: string;
    /** Agregado de leitura: quantas matrículas essa atribuição já gerou. */
    matriculas?: number;
    created_at?: string;
    updated_at?: string;
}

export type AcademyEnrollmentStatus =
    | 'NAO_INICIADO' | 'EM_ANDAMENTO' | 'AGUARDANDO_AVALIACAO'
    | 'REPROVADO' | 'CONCLUIDO' | 'EXPIRADO' | 'CANCELADO';

export type AcademyEnrollmentOrigem =
    | 'ATRIBUICAO' | 'MANUAL' | 'AUTOMATICA' | 'RECICLAGEM';

export interface AcademyEnrollment {
    id: string;
    org_id: string;
    course_id: string;
    version_id: string;
    employee_id: string;
    assignment_id?: string;
    origem: AcademyEnrollmentOrigem;
    status: AcademyEnrollmentStatus;
    data_atribuicao: string;
    data_limite?: string;
    data_inicio?: string;
    data_conclusao?: string;
    percentual_progresso: number;
    segundos_assistidos: number;
    nota_final?: number;
    tentativas_usadas: number;
    aceite_em?: string;
    employee_training_id?: string;
    certificate_id?: string;
    substituida_por_id?: string;
    cancelamento_motivo?: string;
    // Enriquecidos na leitura (join resolvido no cliente — sem FK por design)
    employee_name?: string;
    employee_role?: string;
    course_nome?: string;
    nr_referencia?: string;
    categoria?: TrainingCategoria;
    versao?: number;
    carga_horaria?: number;
    created_at?: string;
    updated_at?: string;
}

export interface AcademyLessonProgress {
    id: string;
    org_id: string;
    enrollment_id: string;
    lesson_id: string;
    employee_id: string;
    segundos_assistidos: number;
    /** Ponto de retomada. */
    posicao_segundos: number;
    maior_posicao_segundos: number;
    percentual: number;
    concluida: boolean;
    primeira_visualizacao_em?: string;
    ultima_visualizacao_em?: string;
    concluida_em?: string;
}

export type AcademyAccessEvento =
    | 'ABERTURA' | 'HEARTBEAT' | 'PAUSA' | 'CONCLUSAO_AULA' | 'DOWNLOAD_MATERIAL'
    | 'INICIO_AVALIACAO' | 'ENVIO_AVALIACAO' | 'ACEITE' | 'EMISSAO_CERTIFICADO';

export interface AcademyAccessLog {
    id: number;
    org_id: string;
    enrollment_id: string;
    lesson_id?: string;
    employee_id: string;
    evento: AcademyAccessEvento;
    canal: 'PORTAL' | 'APP';
    posicao_segundos?: number;
    delta_segundos?: number;
    ip?: string;
    user_agent?: string;
    created_at: string;
}

// ── Avaliações ───────────────────────────────────────────────────────────

export type AcademyQuestionTipo =
    | 'MULTIPLA_ESCOLHA' | 'MULTIPLA_RESPOSTA' | 'VERDADEIRO_FALSO';

export interface AcademyQuestionOption {
    id: string;
    org_id: string;
    question_id: string;
    texto: string;
    /** Só existe no lado do RH. O aluno nunca recebe este campo. */
    correta: boolean;
    ordem: number;
}

export interface AcademyQuestion {
    id: string;
    org_id: string;
    version_id: string;
    module_id?: string;
    enunciado: string;
    tipo: AcademyQuestionTipo;
    explicacao?: string;
    peso: number;
    ordem: number;
    ativa: boolean;
    opcoes?: AcademyQuestionOption[];
}

export interface AcademyAssessment {
    id: string;
    org_id: string;
    version_id: string;
    module_id?: string;
    titulo: string;
    tipo: 'FINAL' | 'MODULO';
    nota_minima: number;
    qtd_questoes?: number;
    embaralhar_questoes: boolean;
    embaralhar_opcoes: boolean;
    tentativas_max: number;
    tempo_limite_minutos?: number;
    mostrar_gabarito: boolean;
    ativa: boolean;
    /** Agregado de leitura. */
    questoes_vinculadas?: number;
}

/** Questão como o ALUNO a recebe: sem gabarito. */
export interface AcademyRunnerQuestion {
    id: string;
    enunciado: string;
    tipo: AcademyQuestionTipo;
    ordem: number;
    opcoes: Array<{ id: string; texto: string }>;
}

export interface AcademyAttemptStart {
    attempt_id: string;
    numero_tentativa: number;
    expira_em?: string;
    nota_minima: number;
    questoes: AcademyRunnerQuestion[];
}

export interface AcademyAttemptResult {
    status: 'ENVIADA' | 'EXPIRADA';
    nota: number;
    acertos: number;
    total: number;
    aprovado: boolean;
    nota_minima?: number;
    gabarito?: Array<{ question_id: string; correta: boolean; explicacao?: string }>;
}

// ── Resultados do motor ──────────────────────────────────────────────────

export interface AcademyHeartbeatResult {
    segundos_assistidos: number;
    percentual: number;
    /** Quanto o SERVIDOR realmente creditou. Pode ser 0 (clamp/seek/rate limit). */
    creditado: number;
}

export interface AcademyCompleteLessonResult {
    concluida: boolean;
    percentual: number;
    minimo: number;
    motivo?: string;
    progresso_matricula?: number;
}

export interface AcademyFinalizeResult {
    concluido: boolean;
    certificate_id?: string;
    numero?: string;
    codigo_validacao?: string;
    employee_training_id?: string;
    percentual?: number;
    pendencias?: string[];
    motivo?: string;
}

// ── Certificado ──────────────────────────────────────────────────────────

export interface AcademyCertificate {
    id: string;
    org_id: string;
    enrollment_id: string;
    employee_id: string;
    course_id: string;
    version_id: string;
    numero: string;
    codigo_validacao: string;
    emitido_em: string;
    carga_horaria?: number;
    nota_final?: number;
    data_conclusao: string;
    data_validade?: string;
    storage_path?: string;
    revogado_em?: string;
    revogado_motivo?: string;
    // Enriquecidos na leitura
    employee_name?: string;
    course_nome?: string;
    nr_referencia?: string;
    versao?: number;
}

/** Retorno da rota pública do QR. Nunca traz CPF, employee_id ou nota. */
export interface AcademyCertificateValidation {
    valid: boolean;
    numero?: string;
    colaborador?: string;
    treinamento?: string;
    nr_referencia?: string;
    versao?: number;
    carga_horaria?: number;
    data_conclusao?: string;
    data_validade?: string;
    emitido_em?: string;
    organizacao?: string;
    status?: 'VALIDO' | 'VENCIDO' | 'REVOGADO';
}

// ── Conteúdo consumido pelo aluno (mesma forma nos dois canais) ──────────

export interface AcademyPlayerLesson {
    id: string;
    titulo: string;
    descricao?: string;
    ordem: number;
    tipo: AcademyLessonTipo;
    video_url?: string;
    conteudo_html?: string;
    /** O path nunca chega ao cliente — só a informação de que existe mídia. */
    tem_midia: boolean;
    duracao_segundos?: number;
    tempo_minimo_segundos?: number;
    obrigatoria: boolean;
    permite_avanco_rapido: boolean;
    progresso: { percentual: number; posicao_segundos: number; concluida: boolean };
}

export interface AcademyPlayerModule {
    id: string;
    titulo: string;
    descricao?: string;
    ordem: number;
    aulas: AcademyPlayerLesson[];
}

export interface AcademyPlayerContent {
    enrollment: {
        id: string;
        status: AcademyEnrollmentStatus;
        percentual: number;
        nota_final?: number;
        aceite_em?: string;
        data_limite?: string;
        certificate_id?: string;
    };
    versao: {
        id: string;
        versao: number;
        notas_versao?: string;
        percentual_minimo: number;
        nota_minima?: number;
        exige_aceite: boolean;
        texto_aceite?: string;
        ordem_obrigatoria: boolean;
    };
    modulos: AcademyPlayerModule[];
    materiais: Array<{
        id: string; titulo: string; tipo: AcademyMaterialTipo; url?: string;
        lesson_id?: string; module_id?: string; tem_arquivo: boolean; exige_download: boolean;
    }>;
    avaliacoes: Array<{
        id: string; titulo: string; tipo: 'FINAL' | 'MODULO'; nota_minima: number;
        tentativas_max: number; tempo_limite_minutos?: number;
        tentativas_usadas: number; melhor_nota?: number;
    }>;
}

/** Item da Sala de Treinamento / lista do portal. */
export interface AcademyPortalEnrollment {
    id: string;
    course_id: string;
    curso: string;
    nr_referencia?: string;
    categoria?: TrainingCategoria;
    version_id: string;
    versao: number;
    status: AcademyEnrollmentStatus;
    origem: AcademyEnrollmentOrigem;
    percentual: number;
    nota_final?: number;
    data_limite?: string;
    data_conclusao?: string;
    certificate_id?: string;
    carga_horaria?: number;
}

// ── Agregados de painel ──────────────────────────────────────────────────

export interface AcademyManagerRow {
    employee_id: string;
    employee_name: string;
    employee_role?: string;
    total: number;
    concluidos: number;
    pendentes: number;
    atrasados: number;
    aderencia_pct: number;
}

export interface AcademyHrKpis {
    matriculas: number;
    concluidas: number;
    em_andamento: number;
    atrasadas: number;
    aderencia_pct: number;
    nr_vencendo_30d: number;
    nr_vencidas: number;
    horas_treinamento: number;
    colaboradores_alcancados: number;
}
