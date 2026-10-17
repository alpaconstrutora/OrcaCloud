/**
 * Status que o portal MOSTRA para uma unidade: o do cadastro
 * (`commercial_properties.status`), sobreposto pelo negócio ativo dela —
 * proposta aprovada / negócio concluído = vendida (ou alugada, se for locação),
 * proposta enviada / negócio pendente = reservada, em negociação = bloqueada.
 *
 * Nasceu no espelho de unidades (`PropertyUnitMap`). A aba Empreendimentos lia só
 * o cadastro, então a mesma unidade aparecia "Vendido" no Estoque e "Disponível"
 * em Empreendimentos (plano docs/planos/2026-10-17-portal-corretor-pendencias.md,
 * item 1.2). Uma função só para os dois.
 */

export interface NegocioDaUnidade {
    property_id?: string | null;
    status?: string | null;
    type?: string | null;
    value?: number | null;
}

/** Negócio que vale para a unidade: o primeiro não cancelado (ou, se só houver cancelados, o primeiro). */
export function negocioAtivoDaUnidade<T extends NegocioDaUnidade>(unitId: string | null | undefined, negocios: readonly T[] | null | undefined): T | undefined {
    if (!unitId || !negocios?.length) return undefined;
    const alvo = String(unitId).toLowerCase();
    const daUnidade = negocios.filter(n => n && n.property_id && String(n.property_id).toLowerCase() === alvo);
    return daUnidade.find(n => n.status !== 'CANCELLED') || daUnidade[0];
}

/**
 * Status efetivo. Devolve o código no vocabulário do cadastro (`AVAILABLE`,
 * `RESERVED`, `SOLD`, `RENTED`, `MAINTENANCE`…); sem negócio que mude algo,
 * devolve o próprio status do cadastro.
 */
export function statusEfetivoDaUnidade(statusDoCadastro: string | null | undefined, negocio?: NegocioDaUnidade): string | null | undefined {
    if (!negocio) return statusDoCadastro;
    const status = String(negocio.status || '');
    if (status === 'COMPLETED' || status === 'CLOSED' || status === 'APROVADA') {
        return negocio.type === 'RENTAL' ? 'RENTED' : 'SOLD';
    }
    if (status === 'PENDING' || status === 'ENVIADA') return 'RESERVED';
    if (status === 'IN_NEGOTIATION') return 'MAINTENANCE';
    return statusDoCadastro;
}
