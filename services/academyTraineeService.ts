/**
 * Portal de Treinamentos — serviço do TREINANDO logado (e-mail e senha).
 *
 * Plano: docs/planos/2026-10-15-portal-de-treinamentos.md
 *
 * O treinando (colaborador ou terceirizado em `academy_portal_users`) NÃO é
 * membro da organização: qualquer `.from('academy_*')` devolveria [] pela
 * RLS, sem erro. Por isso este arquivo só fala com RPCs `academy_portal_user_*`
 * (aplicar_20271015000200), que resolvem as fichas dele pelo e-mail do JWT.
 *
 * Mídia: a policy do bucket `academy-media` exige membro da organização; o
 * portal passa pela Edge Function `academy-portal-media` SEM token — ela usa
 * o Authorization do treinando e deixa a RPC `academy_portal_user_media_path`
 * decidir se ele é dono do recurso.
 *
 * `verComo` (16/10, docs/planos/2026-10-16-portal-treinamentos-previa-ver-como.md):
 * prévia do gestor na gestão — as LEITURAS aceitam o id de `academy_portal_users`
 * e o banco autoriza por membro da organização da pessoa. As escritas não
 * recebem alvo: na prévia nada é gravado (canal createTraineePreviewChannel).
 */

import { supabase } from '../lib/supabase';
import type {
    AcademyPortalIdentity, AcademyTraineeEnrollment, AcademyTraineeCertificate,
    AcademyTraineeHistoryItem, AcademyTraineeCatalogItem,
    AcademyPlayerContent, AcademyHeartbeatResult, AcademyCompleteLessonResult,
    AcademyAttemptStart, AcademyAttemptResult, AcademyFinalizeResult,
} from '../types/academy';
import type { AcademyPortalCertificate } from './academyPortalService';

const ua = () => (typeof navigator !== 'undefined' ? navigator.userAgent : null);

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.rpc(nome, args ?? {});
    if (error) throw error;
    return data as T;
}

/** Só manda `p_ver_como` quando há alvo: sem ele a chamada é a de sempre. */
const alvo = (verComo?: string | null) => (verComo ? { p_ver_como: verComo } : {});

export const academyTraineeService = {
    /** Identidades ativas do e-mail logado. Vazio = não cadastrado. */
    async myAccess(verComo?: string | null): Promise<AcademyPortalIdentity[]> {
        return (await rpc<AcademyPortalIdentity[] | null>('academy_portal_user_my_access', alvo(verComo))) ?? [];
    },

    async listEnrollments(verComo?: string | null): Promise<AcademyTraineeEnrollment[]> {
        return (await rpc<AcademyTraineeEnrollment[] | null>('academy_portal_user_list_enrollments', alvo(verComo))) ?? [];
    },

    getContent(enrollmentId: string, verComo?: string | null): Promise<AcademyPlayerContent> {
        return rpc<AcademyPlayerContent>('academy_portal_user_get_content', { p_enrollment_id: enrollmentId, ...alvo(verComo) });
    },

    heartbeat(args: { enrollmentId: string; lessonId: string; posicao: number; delta: number }): Promise<AcademyHeartbeatResult> {
        return rpc<AcademyHeartbeatResult>('academy_portal_user_heartbeat', {
            p_enrollment_id: args.enrollmentId,
            p_lesson_id: args.lessonId,
            p_posicao: Math.round(args.posicao),
            p_delta: Math.round(args.delta),
            p_user_agent: ua(),
        });
    },

    completeLesson(enrollmentId: string, lessonId: string): Promise<AcademyCompleteLessonResult> {
        return rpc<AcademyCompleteLessonResult>('academy_portal_user_complete_lesson', {
            p_enrollment_id: enrollmentId, p_lesson_id: lessonId,
        });
    },

    startAttempt(enrollmentId: string, assessmentId: string): Promise<AcademyAttemptStart> {
        return rpc<AcademyAttemptStart>('academy_portal_user_start_attempt', {
            p_enrollment_id: enrollmentId, p_assessment_id: assessmentId,
        });
    },

    submitAttempt(args: {
        enrollmentId: string; attemptId: string;
        answers: Array<{ question_id: string; option_ids: string[] }>;
    }): Promise<AcademyAttemptResult> {
        return rpc<AcademyAttemptResult>('academy_portal_user_submit_attempt', {
            p_enrollment_id: args.enrollmentId, p_attempt_id: args.attemptId, p_answers: args.answers,
        });
    },

    ackVersion(enrollmentId: string): Promise<string> {
        return rpc<string>('academy_portal_user_ack_version', { p_enrollment_id: enrollmentId, p_user_agent: ua() });
    },

    async accept(enrollmentId: string): Promise<void> {
        await rpc<null>('academy_portal_user_accept', { p_enrollment_id: enrollmentId, p_user_agent: ua() });
    },

    finalize(enrollmentId: string): Promise<AcademyFinalizeResult> {
        return rpc<AcademyFinalizeResult>('academy_portal_user_finalize', { p_enrollment_id: enrollmentId });
    },

    getCertificate(enrollmentId: string, verComo?: string | null): Promise<AcademyPortalCertificate> {
        return rpc<AcademyPortalCertificate>('academy_portal_user_certificate', { p_enrollment_id: enrollmentId, ...alvo(verComo) });
    },

    async listCertificates(verComo?: string | null): Promise<AcademyTraineeCertificate[]> {
        return (await rpc<AcademyTraineeCertificate[] | null>('academy_portal_user_certificates', alvo(verComo))) ?? [];
    },

    async listHistory(verComo?: string | null): Promise<AcademyTraineeHistoryItem[]> {
        return (await rpc<AcademyTraineeHistoryItem[] | null>('academy_portal_user_history', alvo(verComo))) ?? [];
    },

    async listCatalog(verComo?: string | null): Promise<AcademyTraineeCatalogItem[]> {
        return (await rpc<AcademyTraineeCatalogItem[] | null>('academy_portal_user_catalog', alvo(verComo))) ?? [];
    },

    enroll(courseId: string): Promise<{ enrollment_id: string; ja_existia: boolean }> {
        return rpc<{ enrollment_id: string; ja_existia: boolean }>('academy_portal_user_enroll', { p_course_id: courseId });
    },

    /**
     * URL assinada de mídia (15 min) pela Edge Function, com o JWT do
     * treinando (o `functions.invoke` já manda o Authorization da sessão).
     * Envia lessonId/materialId/certificateId — NUNCA um storagePath.
     */
    async getMediaUrl(args: { lessonId?: string; materialId?: string; certificateId?: string; verComo?: string | null }): Promise<string> {
        const { data, error } = await supabase.functions.invoke('academy-portal-media', {
            body: {
                lessonId: args.lessonId, materialId: args.materialId, certificateId: args.certificateId,
                verComo: args.verComo || undefined,
            },
        });
        if (error) {
            let msg = error.message || 'Não foi possível liberar a mídia.';
            try {
                const body = await (error as { context?: Response }).context?.json();
                if (body?.error) msg = body.error;
            } catch { /* corpo não era JSON */ }
            throw new Error(msg);
        }
        if (!data?.signedUrl) throw new Error(data?.error || 'Não foi possível liberar a mídia.');
        return data.signedUrl as string;
    },
};
