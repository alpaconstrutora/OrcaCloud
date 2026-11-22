// Modelos de e-mail da assinatura interna. Todo valor de cadastro passa por
// escapeHtml/urlSegura (_shared/html.ts — achado C5-03).
import { escapeHtml, urlSegura } from "../_shared/html.ts";

const COR = '#047857';

function moldura(titulo: string, emitente: string, corpo: string): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(titulo)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr><td style="background:${COR};padding:24px 28px;">
          <p style="margin:0;color:rgba(255,255,255,.85);font-size:12px;font-weight:700;letter-spacing:.5px;">Assinatura eletrônica</p>
          <p style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:800;">${escapeHtml(emitente)}</p>
        </td></tr>
        <tr><td style="padding:24px 28px 28px;color:#111827;font-size:15px;line-height:1.6;">${corpo}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const botao = (url: string, rotulo: string) =>
    `<p style="margin:8px 0 24px;"><a href="${urlSegura(url)}" style="display:inline-block;background:${COR};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px;">${escapeHtml(rotulo)}</a></p>`;

export function emailDeConvite(p: { nome: string; titulo: string; emitente: string; link: string; expiraEm: string; papel: string }) {
    const assunto = `Documento para assinar: ${p.titulo}`;
    const html = moldura(assunto, p.emitente, `
      <p style="margin:0 0 16px;">Olá, ${escapeHtml(p.nome)}.</p>
      <p style="margin:0 0 16px;"><strong>${escapeHtml(p.emitente)}</strong> enviou o documento <strong>${escapeHtml(p.titulo)}</strong> para você assinar como ${escapeHtml(p.papel.toLowerCase())}.</p>
      <p style="margin:0 0 8px;">Para assinar, abra o documento, confirme o seu CPF e digite o código de 6 dígitos que vamos enviar para este e-mail.</p>
      ${botao(p.link, 'Abrir e assinar')}
      <p style="margin:0 0 8px;color:#4b5563;font-size:13px;">Prazo para assinar: ${escapeHtml(p.expiraEm)}.</p>
      <p style="margin:0;color:#9ca3af;font-size:12px;">Este link é pessoal. Não o encaminhe. Se você não esperava este documento, ignore este e-mail.</p>`);
    return { assunto, html };
}

export function emailDoCodigo(p: { nome: string; titulo: string; emitente: string; codigo: string }) {
    const assunto = `${p.codigo} é o seu código para assinar`;
    const html = moldura(assunto, p.emitente, `
      <p style="margin:0 0 16px;">Olá, ${escapeHtml(p.nome)}.</p>
      <p style="margin:0 0 16px;">Use este código para assinar <strong>${escapeHtml(p.titulo)}</strong>:</p>
      <p style="margin:0 0 20px;font-size:32px;font-weight:800;letter-spacing:8px;color:#111827;">${escapeHtml(p.codigo)}</p>
      <p style="margin:0 0 8px;color:#4b5563;font-size:13px;">O código vale por 10 minutos e só serve para este documento.</p>
      <p style="margin:0;color:#9ca3af;font-size:12px;">Não compartilhe este código com ninguém. Se não foi você que pediu, ignore este e-mail: sem o código ninguém assina em seu nome.</p>`);
    return { assunto, html };
}

export function emailDeConclusao(p: { nome: string; titulo: string; emitente: string; urlValidacao: string }) {
    const assunto = `Documento assinado por todos: ${p.titulo}`;
    const html = moldura(assunto, p.emitente, `
      <p style="margin:0 0 16px;">Olá, ${escapeHtml(p.nome)}.</p>
      <p style="margin:0 0 16px;">Todas as pessoas assinaram <strong>${escapeHtml(p.titulo)}</strong>. A via assinada, com o manifesto das assinaturas, segue anexa a este e-mail. Guarde-a.</p>
      <p style="margin:0 0 8px;">Para conferir a autenticidade a qualquer momento:</p>
      ${botao(p.urlValidacao, 'Validar documento')}`);
    return { assunto, html };
}
