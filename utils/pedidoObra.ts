// utils/pedidoObra.ts
//
// Regras puras da dupla Empreendimento → Obra no formulário do pedido de compra
// (`components/SupplyChainOrderForm.tsx`) e do que desliga o "Salvar alterações".
//
// O pedido NÃO tem coluna de empreendimento: ele pendura na OBRA, e o
// empreendimento é derivado dela (`empreendimentoService.mapObrasToEmpreendimentos`,
// que é o mesmo vínculo usado pela coluna Empreendimento da lista e pela
// numeração PC-{empreendimento}-{obra}-{seq}). O seletor de empreendimento no
// formulário existe para recortar a lista de obras e mostrar a hierarquia.
//
// Consequência que gerou o bug de 22/09/2026: trocar de empreendimento limpava a
// obra sem nada para pôr no lugar, e o "Salvar alterações" — que exige obra —
// morria calado. Por isso a troca de empreendimento tem de RESOLVER a obra, e
// quando não dá, a tela precisa dizer o que falta em vez de só desbotar o botão.

export type EmpreendimentoPorObra = Record<string, { id: string; name: string; towerName?: string }>;

/**
 * Obras oferecidas para um empreendimento. `''` (Todos os empreendimentos) não
 * recorta nada.
 */
export function obrasDoEmpreendimento<T extends { id: string }>(
    obras: T[],
    empreendimentoId: string,
    empreendimentoPorObra: EmpreendimentoPorObra,
): T[] {
    if (!empreendimentoId) return obras;
    return obras.filter(obra => empreendimentoPorObra[obra.id]?.id === empreendimentoId);
}

/**
 * Empreendimentos que têm pelo menos uma obra entre as oferecidas. Os demais são
 * beco sem saída no seletor: escolher um deles deixaria o pedido sem obra e sem
 * nenhuma para escolher. 10 dos 18 empreendimentos do banco em 22/09/2026 estão
 * nessa situação — não é caso de borda.
 */
export function empreendimentosComObra<T extends { id: string }>(
    obras: T[],
    empreendimentoPorObra: EmpreendimentoPorObra,
): Set<string> {
    const comObra = new Set<string>();
    for (const obra of obras) {
        const emp = empreendimentoPorObra[obra.id];
        if (emp) comObra.add(emp.id);
    }
    return comObra;
}

/**
 * Qual obra fica selecionada ao escolher um empreendimento:
 *
 * - "Todos os empreendimentos" (`''`) é só filtro — não mexe na obra;
 * - obra atual pertence ao empreendimento escolhido → continua;
 * - empreendimento com UMA obra → ela é escolhida sozinha (caso normal: em
 *   22/09/2026 todo empreendimento com obra tem exatamente uma);
 * - com mais de uma → `''`, e a tela pede a escolha explicitamente;
 * - sem nenhuma → mantém a obra atual, porque limpar só tiraria o pedido do ar
 *   sem oferecer substituta (o seletor já desabilita essas opções).
 */
export function obraAoTrocarEmpreendimento<T extends { id: string }>(
    obraAtualId: string,
    empreendimentoId: string,
    obras: T[],
    empreendimentoPorObra: EmpreendimentoPorObra,
): string {
    if (!empreendimentoId) return obraAtualId;
    if (obraAtualId && empreendimentoPorObra[obraAtualId]?.id === empreendimentoId) return obraAtualId;

    const candidatas = obrasDoEmpreendimento(obras, empreendimentoId, empreendimentoPorObra);
    if (candidatas.length === 1) return candidatas[0].id;
    if (candidatas.length === 0) return obraAtualId;
    return '';
}

export interface EstadoDoSalvar {
    fornecedorId: string;
    obraId: string;
    /** Itens do orçamento marcados. */
    itensSelecionados: number;
    /** Itens avulsos digitados. */
    itensAvulsos: number;
}

/**
 * Por que o "Salvar alterações" está desligado — `null` quando dá para salvar.
 * O texto é o que a tela mostra ao lado do botão: botão desbotado sem motivo foi
 * exatamente o que fez o usuário achar que a alteração não tinha sido aceita.
 */
export function motivoSalvarBloqueado(estado: EstadoDoSalvar): string | null {
    const faltando: string[] = [];
    if (!estado.fornecedorId) faltando.push('o fornecedor');
    if (!estado.obraId) faltando.push('a obra');
    if (estado.itensSelecionados === 0 && estado.itensAvulsos === 0) faltando.push('pelo menos um item');

    if (faltando.length === 0) return null;
    if (faltando.length === 1) return `Falta escolher ${faltando[0]}.`;
    return `Falta escolher ${faltando.slice(0, -1).join(', ')} e ${faltando[faltando.length - 1]}.`;
}
