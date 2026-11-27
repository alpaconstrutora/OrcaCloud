/**
 * Condomínio › Ficha: "Conta do condomínio" (27/11/2026).
 * Plano: docs/planos/2026-11-27-condominio-conta-de-recebimento.md
 *
 * As contas de Minha Organização › Contas que o usuário enxerga, agrupadas por
 * organização para o `<select>` da Ficha. Inativa só aparece se for a já gravada.
 */
import type { PaymentAccount } from '../types/financial';

export const MOTIVO_SEM_ORG_PROPRIA = 'O condomínio não tem organização própria — a conta não teria onde valer.';

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
