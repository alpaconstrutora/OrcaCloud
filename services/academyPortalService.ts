/**
 * Academia ÒPURA — serviço do Portal do Colaborador (canal externo).
 *
 * Roda SEM sessão Supabase: o colaborador entra por `/portal?token=…` e não
 * tem login. Por isso este arquivo é separado de `academyService.ts` — ele
 * não pode depender de nada que assuma `auth.uid()`.
 *
 * Contrato de segurança: TODA chamada leva `p_token`. Nenhuma leva
 * `employee_id` — o padrão legado do portal (portal_get_trainings recebendo
 * o UUID cru, grantada a anon) é enumerável e não deve ser replicado.
 *
 * Mídia: o portal nunca fala com o Storage direto (a policy exige
 * authenticated). Passa pela Edge Function `academy-portal-media`, que valida
 * o token e a matrícula antes de assinar.
 */

import { supabase } from '../lib/supabase';
import type {
    AcademyPortalEnrollment, AcademyPlayerContent, AcademyHeartbeatResult,
    AcademyCompleteLessonResult, AcademyAttemptStart, AcademyAttemptResult,
    AcademyFinalizeResult,
} from '../types/academy';

export interface AcademyPortalCertificate {
    exists: boolean;
    id?: string;
    numero?: string;
    codigo_validacao?: string;
    emitido_em?: string;
    carga_horaria?: number;
    data_conclusao?: string;
    data_validade?: string;
    tem_pdf?: boolean;
}

const ua = () => (typeof navigator !== 'undefined' ? navigator.userAgent : null);

export const academyPortalService = {
    async listEnrollments(token: string): Promise<AcademyPortalEnrollment[]> {
        const { data, error } = await supabase.rpc('academy_portal_list_enrollments', {
            p_token: token,
        });
        if (error) throw error;
        return (data || []) as AcademyPortalEnrollment[];
    },

    async getContent(token: string, enrollmentId: string): Promise<AcademyPlayerContent> {
        const { data, error } = await supabase.rpc('academy_portal_get_content', {
            p_token: token,
            p_enrollment_id: enrollmentId,
        });
        if (error) throw error;
        return data as AcademyPlayerContent;
    },

    async heartbeat(args: {
        token: string; enrollmentId: string; lessonId: string; posicao: number; delta: number;
    }): Promise<AcademyHeartbeatResult> {
        const { data, error } = await supabase.rpc('academy_portal_heartbeat', {
            p_token: args.token,
            p_enrollment_id: args.enrollmentId,
            p_lesson_id: args.lessonId,
            p_posicao: Math.round(args.posicao),
            p_delta: Math.round(args.delta),
            p_user_agent: ua(),
        });
        if (error) throw error;
        return data as AcademyHeartbeatResult;
    },

    async completeLesson(token: string, enrollmentId: string, lessonId: string): Promise<AcademyCompleteLessonResult> {
        const { data, error } = await supabase.rpc('academy_portal_complete_lesson', {
            p_token: token,
            p_enrollment_id: enrollmentId,
            p_lesson_id: lessonId,
        });
        if (error) throw error;
        return data as AcademyCompleteLessonResult;
    },

    async startAttempt(token: string, enrollmentId: string, assessmentId: string): Promise<AcademyAttemptStart> {
        const { data, error } = await supabase.rpc('academy_portal_start_attempt', {
            p_token: token,
            p_enrollment_id: enrollmentId,
            p_assessment_id: assessmentId,
        });
        if (error) throw error;
        return data as AcademyAttemptStart;
    },

    async submitAttempt(args: {
        token: string; enrollmentId: string; attemptId: string;
        answers: Array<{ question_id: string; option_ids: string[] }>;
    }): Promise<AcademyAttemptResult> {
        const { data, error } = await supabase.rpc('academy_portal_submit_attempt', {
            p_token: args.token,
            p_enrollment_id: args.enrollmentId,
            p_attempt_id: args.attemptId,
            p_answers: args.answers,
        });
        if (error) throw error;
        return data as AcademyAttemptResult;
    },

    async accept(token: string, enrollmentId: string): Promise<void> {
        const { error } = await supabase.rpc('academy_portal_accept', {
            p_token: token,
            p_enrollment_id: enrollmentId,
            p_user_agent: ua(),
        });
        if (error) throw error;
    },

    async finalize(token: string, enrollmentId: string): Promise<AcademyFinalizeResult> {
        const { data, error } = await supabase.rpc('academy_portal_finalize', {
            p_token: token,
            p_enrollment_id: enrollmentId,
        });
        if (error) throw error;
        return data as AcademyFinalizeResult;
    },

    async getCertificate(token: string, enrollmentId: string): Promise<AcademyPortalCertificate> {
        const { data, error } = await supabase.rpc('academy_portal_certificate', {
            p_token: token,
            p_enrollment_id: enrollmentId,
        });
        if (error) throw error;
        return data as AcademyPortalCertificate;
    },

    /**
     * URL assinada de mídia (15 min). Passa por Edge Function porque a
     * sessão anon do portal não satisfaz a policy do bucket.
     * Envia lessonId/materialId/certificateId — NUNCA um storagePath.
     */
    async getMediaUrl(args: {
        token: string; lessonId?: string; materialId?: string; certificateId?: string;
    }): Promise<string> {
        const { data, error } = await supabase.functions.invoke('academy-portal-media', {
            body: {
                token: args.token,
                lessonId: args.lessonId,
                materialId: args.materialId,
                certificateId: args.certificateId,
            },
        });
        if (error) throw error;
        if (!data?.signedUrl) throw new Error(data?.error || 'Não foi possível liberar a mídia.');
        return data.signedUrl as string;
    },
};
