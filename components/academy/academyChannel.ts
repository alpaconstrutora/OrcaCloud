/**
 * Canal de consumo da Academia.
 *
 * O aluno consome o mesmo conteúdo por dois caminhos muito diferentes:
 *  - APP    → sessão Supabase, RLS normal, Storage assinado direto;
 *  - PORTAL → sem sessão, tudo por RPC com token e mídia por Edge Function.
 *
 * Em vez de duplicar player, quiz e sala, os componentes recebem um
 * `AcademyChannel` por prop. É a única coisa que muda entre os canais.
 */

import { academyService } from '../../services/academyService';
import { academyPortalService } from '../../services/academyPortalService';
import type {
    AcademyPlayerContent, AcademyHeartbeatResult, AcademyCompleteLessonResult,
    AcademyAttemptStart, AcademyAttemptResult, AcademyFinalizeResult,
} from '../../types/academy';

export interface AcademyChannel {
    canal: 'APP' | 'PORTAL';
    getContent(enrollmentId: string): Promise<AcademyPlayerContent>;
    heartbeat(a: { enrollmentId: string; lessonId: string; posicao: number; delta: number }): Promise<AcademyHeartbeatResult>;
    completeLesson(enrollmentId: string, lessonId: string): Promise<AcademyCompleteLessonResult>;
    startAttempt(enrollmentId: string, assessmentId: string): Promise<AcademyAttemptStart>;
    submitAttempt(a: { enrollmentId: string; attemptId: string; answers: Array<{ question_id: string; option_ids: string[] }> }): Promise<AcademyAttemptResult>;
    accept(enrollmentId: string): Promise<void>;
    /** Ciência da mudança de versão (evidência no log). */
    ackVersion(enrollmentId: string): Promise<string>;
    finalize(enrollmentId: string): Promise<AcademyFinalizeResult>;
    /** URL temporária da mídia da aula (15 min). */
    getLessonMediaUrl(lessonId: string): Promise<string>;
    getMaterialUrl(materialId: string): Promise<string>;
    /** PDF do certificado já emitido. */
    getCertificateUrl(certificateId: string): Promise<string>;
}

/** Canal do app logado. */
export function createAppChannel(): AcademyChannel {
    return {
        canal: 'APP',
        getContent: id => academyService.getPlayerContent(id),
        heartbeat: a => academyService.heartbeat(a),
        completeLesson: (e, l) => academyService.completeLesson(e, l),
        startAttempt: (e, a) => academyService.startAttempt(e, a),
        submitAttempt: a => academyService.submitAttempt(a),
        accept: e => academyService.accept(e),
        ackVersion: e => academyService.ackVersion(e),
        finalize: e => academyService.finalize(e),

        async getLessonMediaUrl(lessonId) {
            // No app o path pode ser lido direto (RLS org-scoped) e assinado
            // pelo próprio cliente — não precisa de Edge Function.
            const lesson = await academyService.listLessonPath(lessonId);
            if (!lesson) throw new Error('Aula sem mídia.');
            return academyService.getSignedMediaUrl(lesson);
        },

        async getMaterialUrl(materialId) {
            const path = await academyService.listMaterialPath(materialId);
            if (!path) throw new Error('Material sem arquivo.');
            return academyService.getSignedMediaUrl(path);
        },

        async getCertificateUrl(certificateId) {
            const cert = await academyService.getCertificate(certificateId);
            if (!cert?.storage_path) throw new Error('Certificado ainda não gerado.');
            return academyService.getSignedMediaUrl(cert.storage_path);
        },
    };
}

/** Canal do Portal do Colaborador — tudo amarrado ao token. */
export function createPortalChannel(token: string): AcademyChannel {
    return {
        canal: 'PORTAL',
        getContent: id => academyPortalService.getContent(token, id),
        heartbeat: a => academyPortalService.heartbeat({ token, ...a }),
        completeLesson: (e, l) => academyPortalService.completeLesson(token, e, l),
        startAttempt: (e, a) => academyPortalService.startAttempt(token, e, a),
        submitAttempt: a => academyPortalService.submitAttempt({ token, ...a }),
        accept: e => academyPortalService.accept(token, e),
        ackVersion: e => academyPortalService.ackVersion(token, e),
        finalize: e => academyPortalService.finalize(token, e),
        getLessonMediaUrl: lessonId => academyPortalService.getMediaUrl({ token, lessonId }),
        getMaterialUrl: materialId => academyPortalService.getMediaUrl({ token, materialId }),
        getCertificateUrl: certificateId => academyPortalService.getMediaUrl({ token, certificateId }),
    };
}
