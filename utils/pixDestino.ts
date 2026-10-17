// De quem é este título a pagar? — base para achar a chave PIX cadastrada.
//
// Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (item 3.1).
// SEM imports (Deno + Vitest).
//
// Medido em 17/10/2026 nos títulos a pagar abertos: `party_id` NUNCA é
// preenchido. O favorecido vem de:
//   • supplier_id (BOLETO, contratos, pedidos, NF-e)         → fornecedor
//   • reference_id da FOLHA (source_system LABOR):
//       labor-<folha>-indiv-<RUBRICA>-<colaborador>[-…]       → colaborador
//       labor-<folha>-<obra>-<colaborador>-(salario|encargos)  → colaborador
//       labor-<folha>-<obra>-salario / -unallocated-salario   → AGRUPADO (várias
//         pessoas — não pode virar um PIX para uma pessoa só)
//   • reference_id do PRÓ-LABORE (source_system PROLABORE) = id do item da folha
//     societária → sócio. Os encargos do pró-labore usam o id da FOLHA e não
//     resolvem para item nenhum (são imposto, não pagamento ao sócio).
//   • nada disso → só chave digitada na hora (avulso).

export type OrigemFavorecido = 'fornecedor' | 'colaborador' | 'socio' | 'avulso';

export interface TituloParaPix {
    source_system?: string | null;
    party_type?: string | null;
    supplier_id?: string | null;
    reference_id?: string | null;
}

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const FOLHA_INDIV = new RegExp(`^labor-${UUID}-indiv-[A-Za-z0-9_]+-(${UUID})(?:-|$)`);
const FOLHA_POR_COLAB = new RegExp(`^labor-${UUID}-${UUID}-(${UUID})-(?:salario|encargos)`);

/** Colaborador de um título da folha; null para os agrupados. */
export function colaboradorDoTituloDaFolha(referenceId: string | null | undefined): string | null {
    const r = referenceId ?? '';
    const indiv = FOLHA_INDIV.exec(r);
    if (indiv) return indiv[1].toLowerCase();
    const porColab = FOLHA_POR_COLAB.exec(r);
    if (porColab) return porColab[1].toLowerCase();
    return null;
}

export interface Favorecido {
    origem: OrigemFavorecido;
    /** supplier_id / employee_id / id do item do pró-labore. */
    id: string | null;
    /** Por que caiu em avulso — a tela mostra. */
    motivo: string | null;
}

export function favorecidoDoTitulo(t: TituloParaPix): Favorecido {
    if (t.supplier_id) return { origem: 'fornecedor', id: t.supplier_id, motivo: null };

    if (t.source_system === 'LABOR') {
        const colab = colaboradorDoTituloDaFolha(t.reference_id);
        if (colab) return { origem: 'colaborador', id: colab, motivo: null };
        return {
            origem: 'avulso', id: null,
            motivo: t.party_type === 'EMPLOYEE'
                ? 'Título da folha AGRUPADO (vários colaboradores) — pague cada um pelo título individual, ou digite a chave.'
                : 'Título da folha sem colaborador (encargo/tributo).',
        };
    }

    if (t.source_system === 'PROLABORE' && t.reference_id && new RegExp(`^${UUID}$`).test(t.reference_id)) {
        return { origem: 'socio', id: t.reference_id.toLowerCase(), motivo: null };
    }

    return { origem: 'avulso', id: null, motivo: 'Título sem favorecido cadastrado — digite a chave PIX.' };
}
