/**
 * Mandato do síndico — espelho TS de `fn_sindico_predios`
 * (supabase/migrations/aplicar_20271020400000_portal_sindico_acesso_leitura.sql),
 * que é quem de fato autoriza o Portal do Síndico. Aqui só se DIZ o estado na
 * tela (Ficha do condomínio, Portais › Portal do Condomínio); a mesma regra nos
 * dois lados evita a tela dizer "vigente" para um acesso que o banco recusa.
 *
 *  - início vazio = vigente desde sempre;
 *  - fim vazio = sem prazo;
 *  - "hoje" é a data de Brasília — `toISOString()` é UTC e venceria o mandato
 *    às 21h da véspera (mesmo cuidado do SQL com `AT TIME ZONE`).
 *
 * Plano: docs/planos/2026-10-20-portal-do-sindico.md
 */

/** A data (AAAA-MM-DD) em Brasília no instante `agora`. */
export function hojeEmBrasilia(agora: Date = new Date()): string {
    // en-CA formata como AAAA-MM-DD.
    return agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export function mandatoVigente(
    inicio: string | null | undefined,
    fim: string | null | undefined,
    hoje: string = hojeEmBrasilia(),
): boolean {
    const i = inicio ? inicio.slice(0, 10) : '';
    const f = fim ? fim.slice(0, 10) : '';
    if (i && i > hoje) return false;
    if (f && f < hoje) return false;
    return true;
}

/** Mandato que já terminou (o alerta da Ficha). Início no futuro não é "vencido". */
export function mandatoVencido(fim: string | null | undefined, hoje: string = hojeEmBrasilia()): boolean {
    return !!fim && fim.slice(0, 10) < hoje;
}
