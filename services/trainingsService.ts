/**
 * Catálogo de treinamentos e registro de treinamento realizado.
 *
 * Extraído de `laborService.ts` (que passou de 2.200 linhas) sem mudança de
 * comportamento: `laborService` mantém wrappers delegantes de uma linha, então
 * nenhum call site precisou mudar.
 *
 * `training_courses` e `employee_trainings` são as tabelas COMPARTILHADAS com a
 * Academia (`academyService.ts`): o catálogo é o mesmo e a conclusão de um
 * curso EAD escreve aqui, com `origem = 'ACADEMIA'`.
 */

import { supabase } from '../lib/supabase';
import { validateDocumentFile } from '../lib/mimeValidation';
import type { TrainingCourse, EmployeeTraining } from '../types/academy';

const COURSE_COLS =
    'id, org_id, nome, descricao, nr_referencia, categoria, carga_horaria, validade_meses, ' +
    'instrutor, is_obrigatorio, roles_obrigatorios, status, modalidade, cargos_obrigatorios, ' +
    'funcoes_obrigatorias, capa_storage_path, created_at, updated_at';

const TRAINING_COLS =
    'id, org_id, employee_id, course_id, data_realizacao, data_validade, instrutor, local, ' +
    'carga_horaria, certificado_url, nota, aprovado, status, observacoes, origem, ' +
    'enrollment_id, version_id, academy_certificate_id, created_at, updated_at';

type ETRow = EmployeeTraining & {
    employee?: { name: string };
    course?: { nome: string; nr_referencia?: string };
};

const enrich = (rows: ETRow[] | null): EmployeeTraining[] =>
    (rows || []).map(r => ({
        ...r,
        employee_name: r.employee?.name,
        course_nome: r.course?.nome,
        nr_referencia: r.course?.nr_referencia,
    }));

export const trainingsService = {
    // ── Catálogo ────────────────────────────────────────────────────────

    /** orgId opcional: com "Todas as organizações" a RLS já recorta (REGRA #5). */
    async listTrainingCourses(orgId?: string | null): Promise<TrainingCourse[]> {
        let query = supabase.from('training_courses').select(COURSE_COLS).order('nome');
        if (orgId) query = query.eq('org_id', orgId);

        const { data, error } = await query;
        if (error) throw error;
        return (data || []) as unknown as TrainingCourse[];
    },

    async createTrainingCourse(
        course: Omit<TrainingCourse, 'id' | 'created_at' | 'updated_at'>
    ): Promise<TrainingCourse> {
        const { data, error } = await supabase
            .from('training_courses')
            .insert(course)
            .select(COURSE_COLS)
            .single();
        if (error) throw error;
        return data as unknown as TrainingCourse;
    },

    async updateTrainingCourse(id: string, updates: Partial<TrainingCourse>): Promise<TrainingCourse> {
        const { id: _id, created_at: _ca, updated_at: _ua, ...clean } = updates;
        const { data, error } = await supabase
            .from('training_courses')
            .update(clean)
            .eq('id', id)
            .select(COURSE_COLS)
            .single();
        if (error) throw error;
        return data as unknown as TrainingCourse;
    },

    /** Inativa (não exclui): curso é registro de negócio referenciado por evidência. */
    async deleteTrainingCourse(id: string): Promise<void> {
        const { error } = await supabase
            .from('training_courses')
            .update({ status: 'INATIVO' })
            .eq('id', id);
        if (error) throw error;
    },

    // ── Registro de treinamento realizado ───────────────────────────────

    async listEmployeeTrainings(filters: {
        orgId?: string | null;
        employeeId?: string;
        courseId?: string;
        status?: EmployeeTraining['status'];
        origem?: EmployeeTraining['origem'];
    }): Promise<EmployeeTraining[]> {
        let query = supabase
            .from('employee_trainings')
            .select(`${TRAINING_COLS},
                employee:employees!employee_id(name),
                course:training_courses!course_id(nome, nr_referencia)`)
            .order('data_realizacao', { ascending: false });

        if (filters.orgId)      query = query.eq('org_id', filters.orgId);
        if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
        if (filters.courseId)   query = query.eq('course_id', filters.courseId);
        if (filters.status)     query = query.eq('status', filters.status);
        if (filters.origem)     query = query.eq('origem', filters.origem);

        const { data, error } = await query;
        if (error) throw error;
        return enrich(data as unknown as ETRow[]);
    },

    async createEmployeeTraining(
        training: Omit<EmployeeTraining,
            'id' | 'created_at' | 'updated_at' | 'employee_name' | 'course_nome' | 'nr_referencia'>
    ): Promise<EmployeeTraining> {
        const { data, error } = await supabase
            .from('employee_trainings')
            .insert(training)
            .select(TRAINING_COLS)
            .single();
        if (error) throw error;
        return data as unknown as EmployeeTraining;
    },

    async updateEmployeeTraining(id: string, updates: Partial<EmployeeTraining>): Promise<EmployeeTraining> {
        const {
            id: _id, created_at: _ca, updated_at: _ua,
            employee_name: _en, course_nome: _cn, nr_referencia: _nr, ...clean
        } = updates;
        const { data, error } = await supabase
            .from('employee_trainings')
            .update(clean)
            .eq('id', id)
            .select(TRAINING_COLS)
            .single();
        if (error) throw error;
        return data as unknown as EmployeeTraining;
    },

    async deleteEmployeeTraining(id: string): Promise<void> {
        const { error } = await supabase.from('employee_trainings').delete().eq('id', id);
        if (error) throw error;
    },

    async uploadTrainingCertificado(trainingId: string, orgId: string, file: File): Promise<string> {
        const validation = validateDocumentFile(file);
        if (!validation.valid) throw new Error(validation.error);

        const ext = file.name.split('.').pop();
        const path = `trainings/${orgId}/${trainingId}.${ext}`;
        const { error } = await supabase.storage
            .from('organization-assets')
            .upload(path, file, { upsert: true });
        if (error) throw error;

        await supabase.from('employee_trainings').update({ certificado_url: path }).eq('id', trainingId);
        return path;
    },

    /** Evidências vencendo nos próximos 30 dias. */
    async getTrainingAlerts(orgId?: string | null): Promise<EmployeeTraining[]> {
        const in30 = new Date();
        in30.setDate(in30.getDate() + 30);

        let query = supabase
            .from('employee_trainings')
            .select(`${TRAINING_COLS},
                employee:employees!employee_id(name),
                course:training_courses!course_id(nome, nr_referencia)`)
            .lte('data_validade', in30.toISOString().split('T')[0])
            .eq('status', 'ATIVO')
            .order('data_validade');

        if (orgId) query = query.eq('org_id', orgId);

        const { data, error } = await query;
        if (error) throw error;
        return enrich(data as unknown as ETRow[]);
    },
};
