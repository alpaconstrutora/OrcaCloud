/**
 * Condomínio › Ficha: "Conta do condomínio" (27/11/2026).
 * Plano: docs/planos/2026-11-27-condominio-conta-de-recebimento.md
 *
 * As contas de Minha Organização › Contas que o usuário enxerga, agrupadas por
 * organização para o `<select>` da Ficha. Inativa só aparece se for a já gravada.
 */
import type { PaymentAccount } from '../types/financial';

export const MOTIVO_SEM_ORG_PROPRIA = 'O condomínio não tem organização própria — a conta não teria onde valer.';

/**
 * Aviso ao trocar/limpar a conta (decisão do usuário, 27/11/2026, opção "a"): a conta de OUTRA
 * organização que sai da Ficha continua atendendo o condomínio ("Atende também" em Minha
 * Organização › Contas) — inclusive no Portal do Síndico. A Ficha não desmarca; avisa.
 * null = nada a avisar (não mudou, não havia conta, ou a conta antiga é do próprio condomínio).
 */
export function avisoContaAnteriorContinua(
    anterior: string | null | undefined,
    nova: string | null | undefined,
    contas: Pick<PaymentAccount, 'id' | 'name' | 'organization_id'>[],
    orgs: { id: string; name: string }[],
    orgDoCondominio: string | null | undefined,
): string | null {
    if (!anterior || anterior === (nova || null) || !orgDoCondominio) return null;
    const conta = contas.find(c => c.id === anterior);
    if (!conta || conta.organization_id === orgDoCondominio) return null;
    const nomeDaOrg = (id: string) => orgs.find(o => o.id === id)?.name;
    const dona = nomeDaOrg(conta.organization_id);
    const condominio = nomeDaOrg(orgDoCondominio) ?? 'o condomínio';
    return `A conta ${conta.name}${dona ? ` (${dona})` : ''} continua atendendo ${condominio}, inclusive no Portal do Síndico. `
        + `Para tirar, desmarque ${condominio} em "Atende também" dessa conta, em Minha Organização › Contas.`;
}

export interface GrupoDeContas {
    orgId: string;
    orgNome: string;
    contas: { id: string; rotulo: string }[];
}

export function gruposDeContas(
    contas: Pick<PaymentAccount, 'id' | 'name' | 'bank' | 'organization_id' | 'is_active'>[],
    orgs: { id: string; name: string }[],
    atual: string | null | undefined,
): GrupoDeContas[] {
    const nomeDaOrg = new Map(orgs.map(o => [o.id, o.name]));
    const grupos = new Map<string, GrupoDeContas>();
    for (const c of contas) {
        if (c.is_active === false && c.id !== atual) continue;
        const g = grupos.get(c.organization_id)
            ?? { orgId: c.organization_id, orgNome: nomeDaOrg.get(c.organization_id) ?? 'Outra organização', contas: [] };
        const banco = c.bank && c.bank.trim() && c.bank.trim() !== c.name ? ` — ${c.bank.trim()}` : '';
        g.contas.push({ id: c.id, rotulo: `${c.name}${banco}${c.is_active === false ? ' (inativa)' : ''}` });
        grupos.set(c.organization_id, g);
    }
    const porNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR');
    return [...grupos.values()]
        .map(g => ({ ...g, contas: g.contas.sort((a, b) => porNome(a.rotulo, b.rotulo)) }))
        .sort((a, b) => porNome(a.orgNome, b.orgNome));
}
