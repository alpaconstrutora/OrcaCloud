/**
 * Escape de HTML para os e-mails montados nas Edge Functions.
 *
 * ─── O problema ──────────────────────────────────────────────────────────────
 *
 * Achado C5-03 da auditoria de 2026-09-01. Os e-mails de notificação eram
 * montados por template string, sem escape nenhum:
 *
 *     <p style="...">"${interest.message}"</p>
 *     <a href="mailto:${interest.contact_email}">${interest.contact_email}</a>
 *
 * `message`, `contact_name`, `contact_email` e `contact_phone` vêm de
 * `opportunity_interests`, alimentada pelo formulário PÚBLICO de manifestação
 * de interesse (RPC `fn_investor_portal_submit_interest`, executável por anon).
 * É texto de atacante anônimo indo direto para a caixa de entrada de todos os
 * owners e admins da organização, num e-mail que chega pelo domínio corporativo
 * da própria empresa.
 *
 * Cliente de e-mail moderno bloqueia <script>, então não é XSS clássico. O que
 * se consegue é quebrar a estrutura do HTML e injetar conteúdo e âncoras — um
 * <a href> convincente dentro de uma mensagem que o destinatário confia.
 *
 * ─── Dois contextos, duas funções ────────────────────────────────────────────
 *
 * `escapeHtml` serve para TEXTO entre tags. `escapeAttr` serve para valor
 * DENTRO de atributo, que é o contexto mais frouxo: lá, além das aspas, vale a
 * pena barrar esquemas perigosos de URL. Usar o primeiro onde cabia o segundo é
 * o erro clássico — por isso são separados, e não um só "escape".
 */

/** Texto entre tags. Cobre os cinco caracteres que mudam a estrutura do HTML. */
export function escapeHtml(valor: unknown): string {
    if (valor === null || valor === undefined) return '';
    return String(valor)
        .replace(/&/g, '&amp;')   // primeiro, senão re-escapa os outros
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Valor dentro de atributo (`href`, `title`, ...). */
export function escapeAttr(valor: unknown): string {
    return escapeHtml(valor);
}

/**
 * URL para `href`/`src`. Só deixa passar esquema seguro; qualquer outro vira
 * string vazia, e o chamador decide se omite o link.
 *
 * `javascript:`, `data:` e `vbscript:` ficam de fora de propósito.
 */
export function urlSegura(valor: unknown): string {
    const bruto = String(valor ?? '').trim();
    if (!bruto) return '';
    const permitidos = /^(https?:|mailto:|tel:)/i;
    if (!permitidos.test(bruto)) return '';
    return escapeAttr(bruto);
}

/** Valida formato de e-mail antes de virar `mailto:`. */
export function emailValido(valor: unknown): string | null {
    const bruto = String(valor ?? '').trim();
    if (!bruto) return null;
    // Deliberadamente conservador: o objetivo é barrar injeção, não validar
    // RFC 5322. Um endereço exótico e legítimo aparece como texto, sem link.
    return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(bruto) ? bruto : null;
}

/** Corta texto longo, para que uma mensagem enorme não domine o e-mail. */
export function truncar(valor: unknown, max = 2000): string {
    const s = String(valor ?? '');
    return s.length <= max ? s : s.slice(0, max) + '…';
}
