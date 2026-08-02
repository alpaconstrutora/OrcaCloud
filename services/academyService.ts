/**
 * Academia ÒPURA — serviço do app logado.
 *
 * Cobre a administração (versões, módulos, aulas, materiais, questões, provas,
 * atribuições) e o consumo pelo colaborador autenticado.
 *
 * Regras que este arquivo respeita e que NÃO devem ser afrouxadas:
 *  - `orgId?: string | null` em toda leitura, com `.eq()` condicional. Com
 *    "Todas as organizações" o id chega null e a RLS já recorta (REGRA #5).
 *  - Colunas explícitas — nada de `select('*')`.
 *  - Mídia: grava PATH, nunca URL. A signed URL é gerada na leitura, 15 min.
 *  - Progresso e conclusão são decididos por RPC, no servidor. O cliente
 *    apenas reporta o que aconteceu e reage à resposta.
 *
 * Portal externo (sem sessão Supabase): ver `academyPortalService.ts`.
 */

import { supabase } from '../lib/supabase';
import { storageService } from './storageService';
import type {
    AcademyCourseVersion, AcademyPublishPreview, AcademyModule, AcademyLesson,
    AcademyMaterial, AcademyAssignment, AcademyEnrollment, AcademyLessonProgress,
    AcademyAccessLog, AcademyQuestion, AcademyQuestionOption, AcademyAssessment,
    AcademyAttemptStart, AcademyAttemptResult, AcademyHeartbeatResult,
    AcademyCompleteLessonResult, AcademyFinalizeResult, AcademyCertificate,
    AcademyCertificateValidation, AcademyPlayerContent, AcademyPortalEnrollment,
    AcademyManagerRow, AcademyHrKpis, AcademyLessonTipo,
} from '../types/academy';

export const ACADEMY_BUCKET = 'academy-media';
const SIGNED_URL_TTL = 60 * 15;   // 15 min (PLANO_STORAGE_PRIVATIZACAO)

const VERSION_COLS =
    'id, org_id, course_id, versao, status, titulo_versao, notas_versao, carga_horaria_ead, ' +
    'validade_meses_override, regra_percentual_minimo, regra_nota_minima, regra_exige_aceite, ' +
    'regra_texto_aceite, regra_ordem_obrigatoria, regra_tentativas_max, exige_reciclagem, ' +
    'migrar_em_andamento, publicada_em, publicada_por, arquivada_em, created_at, updated_at';

const MODULE_COLS = 'id, org_id, version_id, titulo, descricao, ordem, obrigatorio';

const LESSON_COLS =
    'id, org_id, module_id, version_id, titulo, descricao, ordem, tipo, storage_path, ' +
    'video_url, conteudo_html, duracao_segundos, tempo_minimo_segundos, ' +
    'percentual_minimo_override, obrigatoria, permite_avanco_rapido';

const MATERIAL_COLS =
    'id, org_id, version_id, module_id, lesson_id, titulo, tipo, storage_path, url, ' +
    'mime_type, tamanho_bytes, ordem, exige_download';

const ASSIGNMENT_COLS =
    'id, org_id, course_id, alvo_tipo, alvo_id, version_id, obrigatorio, prazo_dias, ' +
    'data_limite, reciclagem_automatica, status, observacoes, created_by, created_at, updated_at';

const ENROLLMENT_COLS =
    'id, org_id, course_id, version_id, employee_id, assignment_id, origem, status, ' +
    'data_atribuicao, data_limite, data_inicio, data_conclusao, percentual_progresso, ' +
    'segundos_assistidos, nota_final, tentativas_usadas, aceite_em, employee_training_id, ' +
    'certificate_id, substituida_por_id, cancelamento_motivo, created_at, updated_at';

const CERTIFICATE_COLS =
    'id, org_id, enrollment_id, employee_id, course_id, version_id, numero, codigo_validacao, ' +
    'emitido_em, carga_horaria, nota_final, data_conclusao, data_validade, storage_path, ' +
    'revogado_em, revogado_motivo';

const ASSESSMENT_COLS =
    'id, org_id, version_id, module_id, titulo, tipo, nota_minima, qtd_questoes, ' +
    'embaralhar_questoes, embaralhar_opcoes, tentativas_max, tempo_limite_minutos, ' +
    'mostrar_gabarito, ativa';

/** Extensão segura para compor o path do objeto no bucket. */
const extOf = (file: File) => (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');

export const academyService = {
    // ══ VERSÕES ═════════════════════════════════════════════════════════

    async listVersions(courseId: string): Promise<AcademyCourseVersion[]> {
        const { data, error } = await supabase
            .from('academy_course_versions')
            .select(VERSION_COLS)
            .eq('course_id', courseId)
            .order('versao', { ascending: false });
        if (error) throw error;
        return (data || []) as unknown as AcademyCourseVersion[];
    },

    async getVersion(versionId: string): Promise<AcademyCourseVersion | null> {
        const { data, error } = await supabase
            .from('academy_course_versions')
            .select(VERSION_COLS)
            .eq('id', versionId)
            .maybeSingle();
        if (error) throw error;
        return (data as unknown as AcademyCourseVersion) ?? null;
    },

    /** Versão vigente (a que o aluno recebe). Null = curso ainda sem conteúdo. */
    async getPublishedVersion(courseId: string): Promise<AcademyCourseVersion | null> {
        const { data, error } = await supabase
            .from('academy_course_versions')
            .select(VERSION_COLS)
            .eq('course_id', courseId)
            .eq('status', 'PUBLICADA')
            .maybeSingle();
        if (error) throw error;
        return (data as unknown as AcademyCourseVersion) ?? null;
    },

    /**
     * Abre (ou cria) o rascunho. Se já existe versão publicada, o rascunho
     * nasce como clone estrutural dela — inclusive as regras de conclusão.
     */
    async ensureDraftVersion(courseId: string): Promise<string> {
        const { data, error } = await supabase.rpc('fn_academy_ensure_draft_version', {
            p_course_id: courseId,
        });
        if (error) throw error;
        return data as string;
    },

    async updateVersion(versionId: string, updates: Partial<AcademyCourseVersion>): Promise<AcademyCourseVersion> {
        const { id: _i, org_id: _o, course_id: _c, versao: _v, created_at: _ca, updated_at: _ua, ...clean } = updates;
        const { data, error } = await supabase
            .from('academy_course_versions')
            .update(clean)
            .eq('id', versionId)
            .select(VERSION_COLS)
            .single();
        if (error) throw error;
        return data as unknown as AcademyCourseVersion;
    },

    /** Alimenta o bloco de contexto do useConfirm antes de publicar. */
    async getPublishPreview(versionId: string): Promise<AcademyPublishPreview> {
        const { data, error } = await supabase.rpc('fn_academy_publish_preview', {
            p_version_id: versionId,
        });
        if (error) throw error;
        return data as AcademyPublishPreview;
    },

    /** Arquiva a vigente, publica esta e gera as reciclagens. Não toca no passado. */
    async publishVersion(versionId: string): Promise<{
        version_id: string; versao: number; arquivada?: string;
        reciclagens: number; migradas: number;
    }> {
        const { data, error } = await supabase.rpc('fn_academy_publish_version', {
            p_version_id: versionId,
        });
        if (error) throw error;
        return data;
    },

    async archiveVersion(versionId: string): Promise<void> {
        const { error } = await supabase.rpc('fn_academy_archive_version', { p_version_id: versionId });
        if (error) throw error;
    },

    // ══ MÓDULOS ═════════════════════════════════════════════════════════

    async listModules(versionId: string): Promise<AcademyModule[]> {
        const { data, error } = await supabase
            .from('academy_modules')
            .select(MODULE_COLS)
            .eq('version_id', versionId)
            .order('ordem');
        if (error) throw error;
        return (data || []) as unknown as AcademyModule[];
    },

    async createModule(input: Omit<AcademyModule, 'id' | 'created_at' | 'updated_at'>): Promise<AcademyModule> {
        const { data, error } = await supabase
            .from('academy_modules').insert(input).select(MODULE_COLS).single();
        if (error) throw error;
        return data as unknown as AcademyModule;
    },

    async updateModule(id: string, updates: Partial<AcademyModule>): Promise<AcademyModule> {
        const { id: _i, created_at: _ca, updated_at: _ua, ...clean } = updates;
        const { data, error } = await supabase
            .from('academy_modules').update(clean).eq('id', id).select(MODULE_COLS).single();
        if (error) throw error;
        return data as unknown as AcademyModule;
    },

    async deleteModule(id: string): Promise<void> {
        const { error } = await supabase.from('academy_modules').delete().eq('id', id);
        if (error) throw error;
    },

    // ══ AULAS ═══════════════════════════════════════════════════════════

    async listLessons(versionId: string): Promise<AcademyLesson[]> {
        const { data, error } = await supabase
            .from('academy_lessons')
            .select(LESSON_COLS)
            .eq('version_id', versionId)
            .order('ordem');
        if (error) throw error;
        return (data || []) as unknown as AcademyLesson[];
    },

    async createLesson(input: Omit<AcademyLesson, 'id' | 'created_at' | 'updated_at'>): Promise<AcademyLesson> {
        const { data, error } = await supabase
            .from('academy_lessons').insert(input).select(LESSON_COLS).single();
        if (error) throw error;
        return data as unknown as AcademyLesson;
    },

    async updateLesson(id: string, updates: Partial<AcademyLesson>): Promise<AcademyLesson> {
        const { id: _i, created_at: _ca, updated_at: _ua, ...clean } = updates;
        const { data, error } = await supabase
            .from('academy_lessons').update(clean).eq('id', id).select(LESSON_COLS).single();
        if (error) throw error;
        return data as unknown as AcademyLesson;
    },

    async deleteLesson(id: string): Promise<void> {
        const { error } = await supabase.from('academy_lessons').delete().eq('id', id);
        if (error) throw error;
    },

    // ══ MÍDIA ═══════════════════════════════════════════════════════════

    /**
     * Sobe o arquivo e devolve o PATH (nunca URL).
     * Path: {org_id}/{course_id}/{version_id}/{lesson_id}.{ext} — o primeiro
     * segmento precisa ser o org_id, é o que a policy do bucket lê.
     */
    async uploadLessonMedia(args: {
        orgId: string; courseId: string; versionId: string; lessonId: string; file: File;
    }): Promise<string> {
        const path = `${args.orgId}/${args.courseId}/${args.versionId}/${args.lessonId}.${extOf(args.file)}`;
        await storageService.upsertFile(ACADEMY_BUCKET, path, args.file);
        return path;
    },

    async uploadMaterialFile(args: {
        orgId: string; versionId: string; materialId: string; file: File;
    }): Promise<string> {
        const path = `${args.orgId}/materiais/${args.versionId}/${args.materialId}.${extOf(args.file)}`;
        await storageService.upsertFile(ACADEMY_BUCKET, path, args.file);
        return path;
    },

    /** URL temporária. Gerar na leitura; NUNCA persistir no banco. */
    async getSignedMediaUrl(storagePath: string): Promise<string> {
        return storageService.createSignedUrl(ACADEMY_BUCKET, storagePath, SIGNED_URL_TTL);
    },

    /** Path da mídia de uma aula. Só o app logado lê isto — o portal nunca. */
    async listLessonPath(lessonId: string): Promise<string | null> {
        const { data, error } = await supabase
            .from('academy_lessons').select('storage_path').eq('id', lessonId).maybeSingle();
        if (error) throw error;
        return data?.storage_path ?? null;
    },

    async listMaterialPath(materialId: string): Promise<string | null> {
        const { data, error } = await supabase
            .from('academy_materials').select('storage_path').eq('id', materialId).maybeSingle();
        if (error) throw error;
        return data?.storage_path ?? null;
    },

    /**
     * Só apaga o objeto se nenhuma outra aula/material apontar para ele.
     * O clone de versão REAPROVEITA o mesmo path — apagar sem checar
     * arrancaria a mídia de uma versão antiga que ainda é evidência.
     */
    async deleteMediaIfUnused(storagePath: string): Promise<boolean> {
        const [lessons, materials] = await Promise.all([
            supabase.from('academy_lessons').select('id').eq('storage_path', storagePath).limit(2),
            supabase.from('academy_materials').select('id').eq('storage_path', storagePath).limit(2),
        ]);
        const usos = (lessons.data?.length ?? 0) + (materials.data?.length ?? 0);
        if (usos > 1) return false;

        await storageService.remove(ACADEMY_BUCKET, [storagePath]);
        return true;
    },

    // ══ MATERIAIS ═══════════════════════════════════════════════════════

    async listMaterials(versionId: string): Promise<AcademyMaterial[]> {
        const { data, error } = await supabase
            .from('academy_materials')
            .select(MATERIAL_COLS)
            .eq('version_id', versionId)
            .order('ordem');
        if (error) throw error;
        return (data || []) as unknown as AcademyMaterial[];
    },

    async createMaterial(input: Omit<AcademyMaterial, 'id' | 'created_at' | 'updated_at'>): Promise<AcademyMaterial> {
        const { data, error } = await supabase
            .from('academy_materials').insert(input).select(MATERIAL_COLS).single();
        if (error) throw error;
        return data as unknown as AcademyMaterial;
    },

    async updateMaterial(id: string, updates: Partial<AcademyMaterial>): Promise<AcademyMaterial> {
        const { id: _i, created_at: _ca, updated_at: _ua, ...clean } = updates;
        const { data, error } = await supabase
            .from('academy_materials').update(clean).eq('id', id).select(MATERIAL_COLS).single();
        if (error) throw error;
        return data as unknown as AcademyMaterial;
    },

    async deleteMaterial(id: string): Promise<void> {
        const { error } = await supabase.from('academy_materials').delete().eq('id', id);
        if (error) throw error;
    },

    // ══ QUESTÕES E PROVAS ═══════════════════════════════════════════════

    async listQuestions(versionId: string): Promise<AcademyQuestion[]> {
        const { data, error } = await supabase
            .from('academy_questions')
            .select(`id, org_id, version_id, module_id, enunciado, tipo, explicacao, peso, ordem, ativa,
                     opcoes:academy_question_options(id, org_id, question_id, texto, correta, ordem)`)
            .eq('version_id', versionId)
            .order('ordem');
        if (error) throw error;
        return (data || []) as unknown as AcademyQuestion[];
    },

    async createQuestion(
        question: Omit<AcademyQuestion, 'id' | 'opcoes'>,
        opcoes: Array<Pick<AcademyQuestionOption, 'texto' | 'correta' | 'ordem'>>
    ): Promise<AcademyQuestion> {
        const { data: created, error: insertError } = await supabase
            .from('academy_questions')
            .insert(question)
            .select('id, org_id, version_id, module_id, enunciado, tipo, explicacao, peso, ordem, ativa')
            .single();
        if (insertError) throw insertError;

        if (opcoes.length) {
            const { error: optError } = await supabase.from('academy_question_options').insert(
                opcoes.map(o => ({ ...o, org_id: question.org_id, question_id: created.id }))
            );
            if (optError) throw optError;
        }
        return created as unknown as AcademyQuestion;
    },

    async updateQuestion(
        id: string,
        updates: Partial<AcademyQuestion>,
        opcoes?: Array<Pick<AcademyQuestionOption, 'texto' | 'correta' | 'ordem'>>
    ): Promise<void> {
        const { id: _i, opcoes: _op, ...clean } = updates;
        const { error } = await supabase.from('academy_questions').update(clean).eq('id', id);
        if (error) throw error;

        if (opcoes) {
            // Substituição total: editar alternativa a alternativa não vale a
            // complexidade, e a questão ainda não foi respondida nesta versão.
            await supabase.from('academy_question_options').delete().eq('question_id', id);
            if (opcoes.length) {
                const orgId = updates.org_id;
                const { error: optError } = await supabase.from('academy_question_options').insert(
                    opcoes.map(o => ({ ...o, org_id: orgId, question_id: id }))
                );
                if (optError) throw optError;
            }
        }
    },

    async deleteQuestion(id: string): Promise<void> {
        const { error } = await supabase.from('academy_questions').delete().eq('id', id);
        if (error) throw error;
    },

    async listAssessments(versionId: string): Promise<AcademyAssessment[]> {
        const { data, error } = await supabase
            .from('academy_assessments')
            .select(`${ASSESSMENT_COLS}, vinculos:academy_assessment_questions(id)`)
            .eq('version_id', versionId);
        if (error) throw error;
        return ((data || []) as any[]).map(a => ({
            ...a,
            questoes_vinculadas: Array.isArray(a.vinculos) ? a.vinculos.length : 0,
        })) as AcademyAssessment[];
    },

    async createAssessment(input: Omit<AcademyAssessment, 'id' | 'questoes_vinculadas'>): Promise<AcademyAssessment> {
        const { data, error } = await supabase
            .from('academy_assessments').insert(input).select(ASSESSMENT_COLS).single();
        if (error) throw error;
        return data as unknown as AcademyAssessment;
    },

    async updateAssessment(id: string, updates: Partial<AcademyAssessment>): Promise<AcademyAssessment> {
        const { id: _i, questoes_vinculadas: _q, ...clean } = updates;
        const { data, error } = await supabase
            .from('academy_assessments').update(clean).eq('id', id).select(ASSESSMENT_COLS).single();
        if (error) throw error;
        return data as unknown as AcademyAssessment;
    },

    async deleteAssessment(id: string): Promise<void> {
        const { error } = await supabase.from('academy_assessments').delete().eq('id', id);
        if (error) throw error;
    },

    async listAssessmentQuestionIds(assessmentId: string): Promise<string[]> {
        const { data, error } = await supabase
            .from('academy_assessment_questions')
            .select('question_id, ordem')
            .eq('assessment_id', assessmentId)
            .order('ordem');
        if (error) throw error;
        return (data || []).map(r => r.question_id as string);
    },

    /** Define de uma vez quais questões compõem a prova. */
    async setAssessmentQuestions(args: {
        orgId: string; assessmentId: string; questionIds: string[];
    }): Promise<void> {
        const del = await supabase
            .from('academy_assessment_questions').delete().eq('assessment_id', args.assessmentId);
        if (del.error) throw del.error;

        if (!args.questionIds.length) return;
        const { error } = await supabase.from('academy_assessment_questions').insert(
            args.questionIds.map((qid, i) => ({
                org_id: args.orgId, assessment_id: args.assessmentId, question_id: qid, ordem: i,
            }))
        );
        if (error) throw error;
    },

    // ══ ATRIBUIÇÕES ═════════════════════════════════════════════════════

    async listAssignments(orgId?: string | null): Promise<AcademyAssignment[]> {
        let query = supabase
            .from('academy_assignments')
            .select(`${ASSIGNMENT_COLS}, course:training_courses!course_id(nome)`)
            .order('created_at', { ascending: false });
        if (orgId) query = query.eq('org_id', orgId);

        const { data, error } = await query;
        if (error) throw error;
        return ((data || []) as any[]).map(a => ({
            ...a, course_nome: a.course?.nome,
        })) as AcademyAssignment[];
    },

    async createAssignment(input: Omit<AcademyAssignment, 'id' | 'created_at' | 'updated_at' | 'course_nome' | 'alvo_nome' | 'matriculas'>): Promise<AcademyAssignment> {
        const { data, error } = await supabase
            .from('academy_assignments').insert(input).select(ASSIGNMENT_COLS).single();
        if (error) throw error;
        return data as unknown as AcademyAssignment;
    },

    async updateAssignment(id: string, updates: Partial<AcademyAssignment>): Promise<AcademyAssignment> {
        const { id: _i, course_nome: _c, alvo_nome: _a, matriculas: _m,
                created_at: _ca, updated_at: _ua, ...clean } = updates;
        const { data, error } = await supabase
            .from('academy_assignments').update(clean).eq('id', id).select(ASSIGNMENT_COLS).single();
        if (error) throw error;
        return data as unknown as AcademyAssignment;
    },

    async deleteAssignment(id: string): Promise<void> {
        const { error } = await supabase
            .from('academy_assignments').update({ status: 'INATIVA' }).eq('id', id);
        if (error) throw error;
    },

    /**
     * Cargos e funções disponíveis como alvo de atribuição.
     * ⚠️ `org_roles`/`org_funcoes` são escopadas por `company_id`, não por
     * `org_id` — a consulta precisa passar por `companies`.
     */
    async listCargoFuncaoOptions(orgId?: string | null): Promise<{
        cargos: Array<{ id: string; nome: string }>;
        funcoes: Array<{ id: string; nome: string }>;
    }> {
        let empresas = supabase.from('companies').select('id');
        if (orgId) empresas = empresas.eq('org_id', orgId);

        const { data: companies, error } = await empresas;
        if (error) throw error;

        const ids = (companies || []).map(c => c.id as string);
        if (!ids.length) return { cargos: [], funcoes: [] };

        const [cargos, funcoes] = await Promise.all([
            supabase.from('org_roles').select('id, nome').in('company_id', ids).order('nome'),
            supabase.from('org_funcoes').select('id, nome').in('company_id', ids).order('nome'),
        ]);
        if (cargos.error) throw cargos.error;
        if (funcoes.error) throw funcoes.error;

        return {
            cargos: (cargos.data || []) as Array<{ id: string; nome: string }>,
            funcoes: (funcoes.data || []) as Array<{ id: string; nome: string }>,
        };
    },

    /** Quem essa atribuição alcança HOJE. Mesma função que o cron usa. */
    async previewAssignmentTargets(assignmentId: string): Promise<string[]> {
        const { data, error } = await supabase.rpc('fn_academy_resolve_assignment', {
            p_assignment_id: assignmentId,
        });
        if (error) throw error;
        return ((data || []) as Array<{ employee_id: string }>).map(r => r.employee_id);
    },

    /** Materializa atribuições, expira prazos e cria reciclagens (idempotente). */
    async runAlerts(daysAhead = 7): Promise<{
        expiradas: number; novas: number; reciclagens: number; notificadas: number;
    }> {
        const { data, error } = await supabase.rpc('generate_academy_alerts', {
            p_days_ahead: daysAhead,
        });
        if (error) throw error;
        return data;
    },

    // ══ MATRÍCULAS ══════════════════════════════════════════════════════

    async listEnrollments(filters: {
        orgId?: string | null;
        employeeId?: string;
        courseId?: string;
        status?: AcademyEnrollment['status'];
    }): Promise<AcademyEnrollment[]> {
        let query = supabase
            .from('academy_enrollments')
            .select(`${ENROLLMENT_COLS},
                employee:employees!employee_id(name, role),
                course:training_courses!course_id(nome, nr_referencia, categoria, carga_horaria),
                versao:academy_course_versions!version_id(versao)`)
            .neq('status', 'CANCELADO')
            .order('data_limite', { nullsFirst: false });

        if (filters.orgId)      query = query.eq('org_id', filters.orgId);
        if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
        if (filters.courseId)   query = query.eq('course_id', filters.courseId);
        if (filters.status)     query = query.eq('status', filters.status);

        const { data, error } = await query;
        if (error) throw error;

        return ((data || []) as any[]).map(e => ({
            ...e,
            employee_name: e.employee?.name,
            employee_role: e.employee?.role,
            course_nome:   e.course?.nome,
            nr_referencia: e.course?.nr_referencia,
            categoria:     e.course?.categoria,
            carga_horaria: e.course?.carga_horaria,
            versao:        e.versao?.versao,
        })) as AcademyEnrollment[];
    },

    /** Matrícula avulsa (fora de atribuição), usada pelo RH na tela de curso. */
    async enrollEmployees(args: {
        orgId: string; courseId: string; versionId: string;
        employeeIds: string[]; dataLimite?: string;
    }): Promise<number> {
        if (!args.employeeIds.length) return 0;

        // Não recria quem já tem matrícula viva nesta versão (índice único
        // parcial cobre, mas evitar o erro é mais barato que tratá-lo).
        const { data: existentes } = await supabase
            .from('academy_enrollments')
            .select('employee_id')
            .eq('version_id', args.versionId)
            .neq('status', 'CANCELADO')
            .in('employee_id', args.employeeIds);

        const jaTem = new Set((existentes || []).map(r => r.employee_id as string));
        const novos = args.employeeIds.filter(id => !jaTem.has(id));
        if (!novos.length) return 0;

        const { error } = await supabase.from('academy_enrollments').insert(
            novos.map(employeeId => ({
                org_id: args.orgId,
                course_id: args.courseId,
                version_id: args.versionId,
                employee_id: employeeId,
                origem: 'MANUAL' as const,
                status: 'NAO_INICIADO' as const,
                data_limite: args.dataLimite || null,
            }))
        );
        if (error) throw error;
        return novos.length;
    },

    async cancelEnrollment(id: string, motivo: string): Promise<void> {
        const { error } = await supabase
            .from('academy_enrollments')
            .update({ status: 'CANCELADO', cancelamento_motivo: motivo })
            .eq('id', id);
        if (error) throw error;
    },

    /**
     * Resolve o colaborador correspondente ao usuário logado.
     *
     * Duas fontes, nesta ordem:
     *   1. `employees.user_id` — vínculo explícito, feito na ficha do
     *      colaborador (migration 20270851000000). É o caminho confiável.
     *   2. e-mail — fallback para quem ainda não foi vinculado. Mantido porque
     *      o vínculo não foi backfillado em massa de propósito: casar e-mail
     *      automaticamente ligaria a pessoa errada em base com e-mail repetido.
     *
     * O recorte "só as minhas matrículas" é feito aqui, no cliente — a policy
     * é org-wide, coerente com o resto do RH (evita policy por-employee, que
     * dobraria o custo de cada query).
     */
    async getMyEmployeeId(orgId?: string | null): Promise<string | null> {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id;
        const email = auth?.user?.email;
        if (!userId && !email) return null;

        if (userId) {
            let porUsuario = supabase.from('employees').select('id').eq('user_id', userId).limit(1);
            if (orgId) porUsuario = porUsuario.eq('org_id', orgId);

            const { data, error } = await porUsuario;
            if (error) throw error;
            if (data?.[0]?.id) return data[0].id;
        }

        if (!email) return null;

        let porEmail = supabase.from('employees').select('id').ilike('email', email).limit(1);
        if (orgId) porEmail = porEmail.eq('org_id', orgId);

        const { data, error } = await porEmail;
        if (error) throw error;
        return data?.[0]?.id ?? null;
    },

    /**
     * Quantos treinamentos o usuário logado tem em aberto.
     * Alimenta o badge de "Meus Treinamentos" na sidebar. Devolve 0 (e nunca
     * lança) quando o usuário não é colaborador vinculado — o badge não pode
     * derrubar o menu.
     */
    async countMyPending(orgId?: string | null): Promise<number> {
        try {
            const employeeId = await this.getMyEmployeeId(orgId);
            if (!employeeId) return 0;

            let query = supabase
                .from('academy_enrollments')
                .select('id', { count: 'exact', head: true })
                .eq('employee_id', employeeId)
                .in('status', ['NAO_INICIADO', 'EM_ANDAMENTO', 'AGUARDANDO_AVALIACAO', 'REPROVADO', 'EXPIRADO']);
            if (orgId) query = query.eq('org_id', orgId);

            const { count, error } = await query;
            if (error) return 0;
            return count ?? 0;
        } catch {
            return 0;
        }
    },

    // ══ CONSUMO DA AULA (app logado) ════════════════════════════════════

    /** Mesma forma do portal, para o player ser um componente só. */
    async getPlayerContent(enrollmentId: string): Promise<AcademyPlayerContent> {
        const [enrollRes, versionRes] = await Promise.all([
            supabase.from('academy_enrollments').select(ENROLLMENT_COLS).eq('id', enrollmentId).single(),
            supabase.from('academy_enrollments').select('version_id').eq('id', enrollmentId).single(),
        ]);
        if (enrollRes.error) throw enrollRes.error;
        if (versionRes.error) throw versionRes.error;

        const enrollment = enrollRes.data as any;
        const versionId = versionRes.data.version_id as string;

        const [versao, modulos, aulas, materiais, avaliacoes, progresso, tentativas] = await Promise.all([
            supabase.from('academy_course_versions').select(VERSION_COLS).eq('id', versionId).single(),
            supabase.from('academy_modules').select(MODULE_COLS).eq('version_id', versionId).order('ordem'),
            supabase.from('academy_lessons').select(LESSON_COLS).eq('version_id', versionId).order('ordem'),
            supabase.from('academy_materials').select(MATERIAL_COLS).eq('version_id', versionId).order('ordem'),
            supabase.from('academy_assessments').select(ASSESSMENT_COLS).eq('version_id', versionId).eq('ativa', true),
            supabase.from('academy_lesson_progress')
                .select('lesson_id, percentual, posicao_segundos, concluida')
                .eq('enrollment_id', enrollmentId),
            supabase.from('academy_attempts')
                .select('assessment_id, nota, status')
                .eq('enrollment_id', enrollmentId),
        ]);

        if (versao.error) throw versao.error;

        const v = versao.data as any;
        const progressoPorAula = new Map(
            (progresso.data || []).map((p: any) => [p.lesson_id, p])
        );

        return {
            enrollment: {
                id: enrollment.id,
                status: enrollment.status,
                percentual: Number(enrollment.percentual_progresso ?? 0),
                nota_final: enrollment.nota_final ?? undefined,
                aceite_em: enrollment.aceite_em ?? undefined,
                data_limite: enrollment.data_limite ?? undefined,
                certificate_id: enrollment.certificate_id ?? undefined,
            },
            versao: {
                id: v.id,
                versao: v.versao,
                notas_versao: v.notas_versao ?? undefined,
                percentual_minimo: v.regra_percentual_minimo,
                nota_minima: v.regra_nota_minima ?? undefined,
                exige_aceite: v.regra_exige_aceite,
                texto_aceite: v.regra_texto_aceite ?? undefined,
                ordem_obrigatoria: v.regra_ordem_obrigatoria,
            },
            modulos: (modulos.data || []).map((m: any) => ({
                id: m.id, titulo: m.titulo, descricao: m.descricao ?? undefined, ordem: m.ordem,
                aulas: (aulas.data || [])
                    .filter((l: any) => l.module_id === m.id)
                    .map((l: any) => {
                        const p = progressoPorAula.get(l.id);
                        return {
                            id: l.id, titulo: l.titulo, descricao: l.descricao ?? undefined,
                            ordem: l.ordem, tipo: l.tipo as AcademyLessonTipo,
                            video_url: l.video_url ?? undefined,
                            conteudo_html: l.conteudo_html ?? undefined,
                            tem_midia: !!l.storage_path,
                            duracao_segundos: l.duracao_segundos ?? undefined,
                            tempo_minimo_segundos: l.tempo_minimo_segundos ?? undefined,
                            obrigatoria: l.obrigatoria,
                            permite_avanco_rapido: l.permite_avanco_rapido,
                            progresso: {
                                percentual: Number(p?.percentual ?? 0),
                                posicao_segundos: Number(p?.posicao_segundos ?? 0),
                                concluida: !!p?.concluida,
                            },
                        };
                    }),
            })),
            materiais: (materiais.data || []).map((mt: any) => ({
                id: mt.id, titulo: mt.titulo, tipo: mt.tipo, url: mt.url ?? undefined,
                lesson_id: mt.lesson_id ?? undefined, module_id: mt.module_id ?? undefined,
                tem_arquivo: !!mt.storage_path, exige_download: mt.exige_download,
            })),
            avaliacoes: (avaliacoes.data || []).map((a: any) => {
                const minhas = (tentativas.data || []).filter((t: any) => t.assessment_id === a.id);
                return {
                    id: a.id, titulo: a.titulo, tipo: a.tipo, nota_minima: Number(a.nota_minima),
                    tentativas_max: a.tentativas_max,
                    tempo_limite_minutos: a.tempo_limite_minutos ?? undefined,
                    tentativas_usadas: minhas.filter((t: any) => t.status !== 'EM_ANDAMENTO').length,
                    melhor_nota: minhas.length
                        ? Math.max(...minhas.map((t: any) => Number(t.nota ?? 0)))
                        : undefined,
                };
            }),
        };
    },

    /** O servidor decide quanto creditar. `creditado: 0` é resposta normal. */
    async heartbeat(args: {
        enrollmentId: string; lessonId: string; posicao: number; delta: number;
    }): Promise<AcademyHeartbeatResult> {
        const { data, error } = await supabase.rpc('academy_heartbeat', {
            p_enrollment_id: args.enrollmentId,
            p_lesson_id: args.lessonId,
            p_posicao: Math.round(args.posicao),
            p_delta: Math.round(args.delta),
        });
        if (error) throw error;
        return data as AcademyHeartbeatResult;
    },

    /** Nunca decidir no cliente: chamar e reagir à resposta. */
    async completeLesson(enrollmentId: string, lessonId: string): Promise<AcademyCompleteLessonResult> {
        const { data, error } = await supabase.rpc('academy_complete_lesson', {
            p_enrollment_id: enrollmentId,
            p_lesson_id: lessonId,
        });
        if (error) throw error;
        return data as AcademyCompleteLessonResult;
    },

    async startAttempt(enrollmentId: string, assessmentId: string): Promise<AcademyAttemptStart> {
        const { data, error } = await supabase.rpc('academy_start_attempt', {
            p_enrollment_id: enrollmentId,
            p_assessment_id: assessmentId,
        });
        if (error) throw error;
        return data as AcademyAttemptStart;
    },

    async submitAttempt(args: {
        enrollmentId: string; attemptId: string;
        answers: Array<{ question_id: string; option_ids: string[] }>;
    }): Promise<AcademyAttemptResult> {
        const { data, error } = await supabase.rpc('academy_submit_attempt', {
            p_enrollment_id: args.enrollmentId,
            p_attempt_id: args.attemptId,
            p_answers: args.answers,
        });
        if (error) throw error;
        return data as AcademyAttemptResult;
    },

    async accept(enrollmentId: string): Promise<void> {
        const { error } = await supabase.rpc('academy_accept', {
            p_enrollment_id: enrollmentId,
            p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        });
        if (error) throw error;
    },

    /** Revalida os 3 critérios no servidor, grava o registro legal e emite. */
    async finalize(enrollmentId: string): Promise<AcademyFinalizeResult> {
        const { data, error } = await supabase.rpc('academy_finalize', {
            p_enrollment_id: enrollmentId,
        });
        if (error) throw error;
        return data as AcademyFinalizeResult;
    },

    // ══ EVIDÊNCIA E CERTIFICADOS ════════════════════════════════════════

    async listAccessLogs(enrollmentId: string, limit = 200): Promise<AcademyAccessLog[]> {
        const { data, error } = await supabase
            .from('academy_access_logs')
            .select('id, org_id, enrollment_id, lesson_id, employee_id, evento, canal, posicao_segundos, delta_segundos, ip, user_agent, created_at')
            .eq('enrollment_id', enrollmentId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return (data || []) as unknown as AcademyAccessLog[];
    },

    async listCertificates(orgId?: string | null, employeeId?: string): Promise<AcademyCertificate[]> {
        let query = supabase
            .from('academy_certificates')
            .select(`${CERTIFICATE_COLS},
                employee:employees!employee_id(name),
                course:training_courses!course_id(nome, nr_referencia)`)
            .order('emitido_em', { ascending: false });
        if (orgId)      query = query.eq('org_id', orgId);
        if (employeeId) query = query.eq('employee_id', employeeId);

        const { data, error } = await query;
        if (error) throw error;
        return ((data || []) as any[]).map(c => ({
            ...c,
            employee_name: c.employee?.name,
            course_nome:   c.course?.nome,
            nr_referencia: c.course?.nr_referencia,
        })) as AcademyCertificate[];
    },

    async getCertificate(certificateId: string): Promise<AcademyCertificate | null> {
        const { data, error } = await supabase
            .from('academy_certificates')
            .select(`${CERTIFICATE_COLS},
                employee:employees!employee_id(name, cpf),
                course:training_courses!course_id(nome, nr_referencia),
                versao:academy_course_versions!version_id(versao)`)
            .eq('id', certificateId)
            .maybeSingle();
        if (error) throw error;
        if (!data) return null;

        const c = data as any;
        return {
            ...c,
            employee_name: c.employee?.name,
            course_nome:   c.course?.nome,
            nr_referencia: c.course?.nr_referencia,
            versao:        c.versao?.versao,
        } as AcademyCertificate;
    },

    async setCertificateStoragePath(certificateId: string, storagePath: string): Promise<void> {
        const { error } = await supabase
            .from('academy_certificates')
            .update({ storage_path: storagePath })
            .eq('id', certificateId);
        if (error) throw error;
    },

    /**
     * Espelha o PDF no registro legal (`employee_trainings.certificado_url`),
     * para a coluna "certificado" da aba Registros funcionar sem mudança.
     */
    async mirrorCertificadoNoRegistro(enrollmentId: string, storagePath: string): Promise<void> {
        const { error } = await supabase
            .from('employee_trainings')
            .update({ certificado_url: storagePath })
            .eq('enrollment_id', enrollmentId);
        if (error) throw error;
    },

    async revokeCertificate(certificateId: string, motivo: string): Promise<void> {
        const { error } = await supabase
            .from('academy_certificates')
            .update({ revogado_em: new Date().toISOString(), revogado_motivo: motivo })
            .eq('id', certificateId);
        if (error) throw error;
    },

    /** Rota pública do QR. Funciona sem sessão. */
    async validateCertificate(codigo: string): Promise<AcademyCertificateValidation> {
        const { data, error } = await supabase.rpc('academy_validate_certificate', {
            p_codigo: codigo,
        });
        if (error) throw error;
        return data as AcademyCertificateValidation;
    },

    // ══ PAINÉIS ═════════════════════════════════════════════════════════

    /** Uma pessoa por linha, com aderência. Recorte por equipe/obra vem do chamador. */
    async getManagerPanel(args: {
        orgId?: string | null; employeeIds?: string[];
    }): Promise<AcademyManagerRow[]> {
        let query = supabase
            .from('academy_enrollments')
            .select(`employee_id, status, data_limite,
                     employee:employees!employee_id(name, role)`)
            .neq('status', 'CANCELADO');
        if (args.orgId) query = query.eq('org_id', args.orgId);
        if (args.employeeIds?.length) query = query.in('employee_id', args.employeeIds);

        const { data, error } = await query;
        if (error) throw error;

        const hoje = new Date().toISOString().split('T')[0];
        const porPessoa = new Map<string, AcademyManagerRow>();

        for (const row of (data || []) as any[]) {
            const id = row.employee_id as string;
            if (!porPessoa.has(id)) {
                porPessoa.set(id, {
                    employee_id: id,
                    employee_name: row.employee?.name ?? '—',
                    employee_role: row.employee?.role ?? undefined,
                    total: 0, concluidos: 0, pendentes: 0, atrasados: 0, aderencia_pct: 0,
                });
            }
            const r = porPessoa.get(id)!;
            r.total += 1;
            if (row.status === 'CONCLUIDO') r.concluidos += 1;
            else {
                r.pendentes += 1;
                if (row.status === 'EXPIRADO' || (row.data_limite && row.data_limite < hoje)) {
                    r.atrasados += 1;
                }
            }
        }

        return [...porPessoa.values()]
            .map(r => ({ ...r, aderencia_pct: r.total ? Math.round((r.concluidos / r.total) * 100) : 0 }))
            .sort((a, b) => b.atrasados - a.atrasados || a.aderencia_pct - b.aderencia_pct);
    },

    async getHrKpis(orgId?: string | null): Promise<AcademyHrKpis> {
        const hoje = new Date();
        const em30 = new Date(hoje); em30.setDate(em30.getDate() + 30);
        const hojeStr = hoje.toISOString().split('T')[0];
        const em30Str = em30.toISOString().split('T')[0];

        let enrollQuery = supabase
            .from('academy_enrollments')
            .select('id, employee_id, status, data_limite')
            .neq('status', 'CANCELADO');
        if (orgId) enrollQuery = enrollQuery.eq('org_id', orgId);

        let nrQuery = supabase
            .from('employee_trainings')
            .select('id, data_validade, carga_horaria, status');
        if (orgId) nrQuery = nrQuery.eq('org_id', orgId);

        const [enrolls, nrs] = await Promise.all([enrollQuery, nrQuery]);
        if (enrolls.error) throw enrolls.error;
        if (nrs.error) throw nrs.error;

        const rows = (enrolls.data || []) as any[];
        const concluidas = rows.filter(r => r.status === 'CONCLUIDO').length;
        const atrasadas = rows.filter(
            r => r.status !== 'CONCLUIDO' && (r.status === 'EXPIRADO' || (r.data_limite && r.data_limite < hojeStr))
        ).length;

        const evidencias = (nrs.data || []) as any[];

        return {
            matriculas: rows.length,
            concluidas,
            em_andamento: rows.filter(r => r.status === 'EM_ANDAMENTO' || r.status === 'AGUARDANDO_AVALIACAO').length,
            atrasadas,
            aderencia_pct: rows.length ? Math.round((concluidas / rows.length) * 100) : 0,
            nr_vencendo_30d: evidencias.filter(
                e => e.data_validade && e.data_validade >= hojeStr && e.data_validade <= em30Str).length,
            nr_vencidas: evidencias.filter(e => e.data_validade && e.data_validade < hojeStr).length,
            horas_treinamento: evidencias.reduce((s, e) => s + Number(e.carga_horaria ?? 0), 0),
            colaboradores_alcancados: new Set(rows.map(r => r.employee_id)).size,
        };
    },
};

export type { AcademyPortalEnrollment, AcademyLessonProgress };
