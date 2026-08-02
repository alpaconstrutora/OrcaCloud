/**
 * Geração do PDF do certificado da Academia ÒPURA.
 *
 * Paleta e helpers no molde de `services/pdfReportService.ts`.
 *
 * O que este arquivo NÃO faz: decidir se a pessoa merece o certificado. A
 * emissão (número, código de validação, registro legal) já aconteceu no
 * servidor — aqui só se desenha o papel a partir do que foi emitido.
 *
 * Naming em português de propósito: `components/CertificateExpiryWarning.tsx`
 * já existe e trata de certificado digital A1 fiscal, coisa sem relação.
 */

import { jsPDF } from 'jspdf';
import { academyService } from './academyService';
import { storageService } from './storageService';
import { ACADEMY_BUCKET } from './academyService';
import type { AcademyCertificate } from '../types/academy';

const PRIMARY = [30,  64, 175] as [number, number, number];  // blue-800
const LIGHT   = [241, 245, 249] as [number, number, number]; // slate-100
const DARK    = [15,  23,  42]  as [number, number, number]; // slate-900
const GRAY    = [100, 116, 139] as [number, number, number]; // slate-500

/** Datas puras não podem passar por new Date(): viram o dia anterior no fuso BR. */
const fmtData = (iso?: string) => {
    if (!iso) return '—';
    const [a, m, d] = iso.split('T')[0].split('-');
    return `${d}/${m}/${a}`;
};

const mascararCpf = (cpf?: string) => {
    const so = (cpf || '').replace(/\D/g, '');
    if (so.length !== 11) return '';
    return `***.${so.slice(3, 6)}.${so.slice(6, 9)}-**`;
};

/**
 * QR do link público de validação. O repo não tem lib de QR — o padrão em uso
 * é o serviço externo (DocumentQrLabelModal.tsx).
 * Se a busca falhar, o PDF sai com o código em texto: nunca abortar por causa
 * do QR.
 */
async function carregarQr(url: string): Promise<string | null> {
    try {
        const endpoint = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`;
        const resp = await fetch(endpoint);
        if (!resp.ok) return null;
        const blob = await resp.blob();
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

export const academyCertificadoService = {
    urlDeValidacao(codigo: string) {
        return `${window.location.origin}/publico/validar-certificado/${codigo}`;
    },

    /** Desenha o certificado. `cpf` é opcional e sai mascarado. */
    async gerarPdf(cert: AcademyCertificate, opts?: { cpf?: string; organizacao?: string }): Promise<Blob> {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const W = doc.internal.pageSize.getWidth();
        const H = doc.internal.pageSize.getHeight();

        // Moldura
        doc.setDrawColor(...PRIMARY);
        doc.setLineWidth(1.2);
        doc.rect(10, 10, W - 20, H - 20);
        doc.setLineWidth(0.3);
        doc.rect(13, 13, W - 26, H - 26);

        // Faixa do topo
        doc.setFillColor(...LIGHT);
        doc.rect(13, 13, W - 26, 20, 'F');
        doc.setTextColor(...PRIMARY);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('CERTIFICADO DE CONCLUSÃO', W / 2, 26, { align: 'center' });

        if (opts?.organizacao) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...GRAY);
            doc.text(opts.organizacao, W / 2, 39, { align: 'center' });
        }

        // Corpo
        doc.setTextColor(...GRAY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text('Certificamos que', W / 2, 52, { align: 'center' });

        doc.setTextColor(...DARK);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.text(cert.employee_name || '—', W / 2, 65, { align: 'center' });

        const cpf = mascararCpf(opts?.cpf);
        if (cpf) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...GRAY);
            doc.text(`CPF ${cpf}`, W / 2, 72, { align: 'center' });
        }

        doc.setTextColor(...GRAY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text('concluiu o treinamento', W / 2, 84, { align: 'center' });

        doc.setTextColor(...PRIMARY);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        const titulo = cert.nr_referencia
            ? `${cert.course_nome} (${cert.nr_referencia})`
            : (cert.course_nome || '—');
        doc.text(titulo, W / 2, 95, { align: 'center', maxWidth: W - 80 });

        // Dados
        doc.setTextColor(...DARK);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const linhas = [
            `Carga horária: ${cert.carga_horaria ?? '—'} hora(s)`,
            `Conclusão: ${fmtData(cert.data_conclusao)}`,
            cert.data_validade ? `Válido até: ${fmtData(cert.data_validade)}` : 'Sem prazo de validade',
            `Versão do conteúdo: v${cert.versao ?? 1}`,
            cert.nota_final != null ? `Aproveitamento: ${cert.nota_final}` : null,
        ].filter(Boolean) as string[];

        let y = 110;
        linhas.forEach(l => { doc.text(l, 30, y); y += 6; });

        // QR + número, canto inferior direito
        const qr = await carregarQr(this.urlDeValidacao(cert.codigo_validacao));
        const qrX = W - 62;
        const qrY = H - 62;

        if (qr) {
            doc.addImage(qr, 'PNG', qrX, qrY, 34, 34);
            doc.setFontSize(7);
            doc.setTextColor(...GRAY);
            doc.text('Aponte a câmera para validar', qrX + 17, qrY + 39, { align: 'center' });
        } else {
            // Fallback: sem QR, o código precisa aparecer legível.
            doc.setFontSize(8);
            doc.setTextColor(...GRAY);
            doc.text('Validação em:', qrX, qrY + 10);
            doc.setFontSize(7);
            doc.text(this.urlDeValidacao(cert.codigo_validacao), qrX, qrY + 15, { maxWidth: 50 });
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...DARK);
        doc.text(cert.numero, 30, H - 30);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...GRAY);
        doc.text('Número do certificado', 30, H - 25);
        doc.text(`Código de validação: ${cert.codigo_validacao}`, 30, H - 20);

        return doc.output('blob');
    },

    /**
     * Gera, sobe no bucket privado e grava o PATH (nunca URL).
     * Devolve uma signed URL de 15 min só para abrir na hora.
     */
    async emitirEArmazenar(certificateId: string, opts?: { cpf?: string; organizacao?: string }): Promise<string> {
        const cert = await academyService.getCertificate(certificateId);
        if (!cert) throw new Error('Certificado não encontrado.');

        const blob = await this.gerarPdf(cert, opts);
        const path = `${cert.org_id}/certificados/${cert.id}.pdf`;

        await storageService.upsertFile(ACADEMY_BUCKET, path, blob, 'application/pdf');
        await academyService.setCertificateStoragePath(cert.id, path);

        // Espelha no registro legal: a coluna "certificado" da aba Registros
        // passa a funcionar sem nenhuma mudança lá.
        await academyService.mirrorCertificadoNoRegistro(cert.enrollment_id, path);

        return academyService.getSignedMediaUrl(path);
    },
};
