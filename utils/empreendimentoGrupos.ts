import { agruparLinhas, chavePorRotulo, type ChaveDeGrupo, type DirecaoGrupos, type Grupo } from './agruparLinhas';
import { OBJETIVOS, ROTULO_DO_OBJETIVO, objetivoDe } from './empreendimentoObjetivo';

/**
 * "Agrupar" da lista de Empreendimentos (`components/empreendimento/EmpreendimentoModule.tsx`).
 * Mesmo recurso das demais telas (guia de UI §6.12, `agruparLinhas`): recebe a lista já
 * filtrada e ordenada e devolve os grupos. Até 21/11/2026 a tela fazia isso à mão, sem o
 * "recolher/expandir todos" — docs/planos/2026-11-21-empreendimentos-objetivo-servico-agrupar.md.
 *
 * Só colunas que a tabela MOSTRA e com UM valor por linha (código, nome e VGV ficam fora).
 */

export type CampoAgruparEmpreendimento = 'tipo' | 'objetivo' | 'status' | 'organizacao';

export const OPCOES_AGRUPAR_EMPREENDIMENTO: { value: CampoAgruparEmpreendimento; label: string }[] = [
    { value: 'tipo', label: 'Tipo' },
    { value: 'objetivo', label: 'Objetivo' },
    { value: 'status', label: 'Status' },
    { value: 'organizacao', label: 'Organização' },
];

interface EmpreendimentoAgrupavel {
    tipo?: string | null;
    objetivo?: string | null;
    status: string;
    organization_id?: string | null;
    vgv_total?: number | null;
}

/** O que a célula de cada coluna mostra — a tela resolve, o agrupamento só lê. */
export interface LeitorDoEmpreendimento {
    /** Rótulo do tipo (catálogo de Tipos de Empreendimento) ou '' quando não há. */
    tipo: (id: string) => string;
    /** Nome da organização, '—' quando não se acha. */
    organizacao: (id: string) => string;
    /** Rótulos de status NA ORDEM do ciclo de vida (Planejamento → … → Encerrado). */
    rotulosDeStatus: Record<string, string>;
}

const SEM: Record<CampoAgruparEmpreendimento, string> = {
    tipo: 'Sem tipo',
    objetivo: 'Sem objetivo',
    status: 'Sem status',
    organizacao: 'Sem organização',
};

export function chaveDoGrupoEmpreendimento(campo: CampoAgruparEmpreendimento, e: EmpreendimentoAgrupavel, leitor: LeitorDoEmpreendimento): ChaveDeGrupo {
    switch (campo) {
        case 'tipo': {
            const rotulo = e.tipo ? leitor.tipo(e.tipo).trim() : '';
            return e.tipo && rotulo ? { key: e.tipo, label: rotulo } : null;
        }
        // Registro sem objetivo conta como Misto — o mesmo que a célula mostra.
        case 'objetivo': return chavePorRotulo(objetivoDe(e.objetivo), ROTULO_DO_OBJETIVO);
        case 'status': return chavePorRotulo(e.status, leitor.rotulosDeStatus);
        case 'organizacao': {
            // A chave é o id: duas organizações com o mesmo nome não se fundem.
            const nome = e.organization_id ? leitor.organizacao(e.organization_id).trim() : '';
            return e.organization_id && nome && nome !== '—' ? { key: e.organization_id, label: nome } : null;
        }
    }
}

/** Objetivo e Status na ordem da tela (seletor / ciclo de vida); Tipo e Organização em A→Z. */
export function agruparEmpreendimentos<T extends EmpreendimentoAgrupavel>(
    lista: T[],
    campo: CampoAgruparEmpreendimento,
    direcao: DirecaoGrupos,
    leitor: LeitorDoEmpreendimento,
): Grupo<T>[] {
    const ordem = campo === 'objetivo' ? [...OBJETIVOS] : campo === 'status' ? Object.keys(leitor.rotulosDeStatus) : 'rotulo';
    return agruparLinhas(lista, {
        chave: e => chaveDoGrupoEmpreendimento(campo, e, leitor),
        semRotulo: SEM[campo],
        // Total do grupo = soma do VGV (a tela só mostra com a coluna VGV visível).
        valor: e => e.vgv_total,
        ordem,
        direcao,
    });
}
