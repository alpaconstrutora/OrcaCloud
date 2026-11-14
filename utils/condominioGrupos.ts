import { agruparLinhas, chavePorCombinacao, chavePorNome, type ChaveDeGrupo, type DirecaoGrupos, type Grupo } from './agruparLinhas';

/**
 * "Agrupar" de Comercial › Condomínios (`components/condominio/CondominiosModule.tsx`).
 * Mesmo recurso das demais telas (guia de UI §6.12, `agruparLinhas`), com as colunas
 * desta tabela. Função pura: recebe os condomínios já filtrados e ordenados e devolve
 * os grupos. Plano: docs/planos/2026-11-14-condominios-organizacao-agrupar.md
 *
 * Só entram colunas que a tabela MOSTRA e que têm UM valor por linha — Código, nome e
 * CNPJ ficam fora (um grupo por condomínio não agrupa nada). Centro de custo pode ter
 * VÁRIOS por condomínio: agrupa pela combinação (`chavePorCombinacao`), sem duplicar a linha.
 */

export type CampoAgruparCondominio = 'organizacao' | 'cidade' | 'centro-custo';

export const OPCOES_AGRUPAR_CONDOMINIO: { value: CampoAgruparCondominio; label: string }[] = [
    { value: 'organizacao', label: 'Organização' },
    { value: 'cidade', label: 'Cidade' },
    { value: 'centro-custo', label: 'Centro de custo' },
];

/** O que a célula de cada coluna mostra — a tela resolve, o agrupamento só lê. */
export interface LeitorDoCondominio<T> {
    /** Organização que OPERA o condomínio (`orgDoCondominio`) com o nome da célula; null = sem nome. */
    organizacao: (c: T) => { id: string; name: string } | null;
    cidade: (c: T) => string | null | undefined;
    /** Centros de custo vinculados, com o rótulo da célula ("013 — Bella Vista"). */
    centrosDeCusto: (c: T) => { id: string; name: string }[];
}

const SEM: Record<CampoAgruparCondominio, string> = {
    organizacao: 'Sem organização',
    cidade: 'Sem cidade',
    'centro-custo': 'Sem centro de custo',
};

export function chaveDoGrupoCondominio<T>(campo: CampoAgruparCondominio, c: T, leitor: LeitorDoCondominio<T>): ChaveDeGrupo {
    switch (campo) {
        case 'organizacao': {
            // A chave é o id: duas organizações com o mesmo nome não se fundem.
            const org = leitor.organizacao(c);
            return org && org.name.trim() ? { key: org.id, label: org.name.trim() } : null;
        }
        case 'cidade': return chavePorNome(leitor.cidade(c));
        case 'centro-custo': return chavePorCombinacao(leitor.centrosDeCusto(c));
    }
}

export function agruparCondominios<T>(
    condominios: T[],
    campo: CampoAgruparCondominio,
    direcao: DirecaoGrupos,
    leitor: LeitorDoCondominio<T>,
): Grupo<T>[] {
    return agruparLinhas(condominios, {
        chave: c => chaveDoGrupoCondominio(campo, c, leitor),
        semRotulo: SEM[campo],
        ordem: 'rotulo',
        direcao,
    });
}
