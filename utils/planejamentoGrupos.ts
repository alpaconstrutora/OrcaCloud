import { agruparLinhas, chavePorMes, chavePorNome, type ChaveDeGrupo, type DirecaoGrupos, type Grupo } from './agruparLinhas';
import type { IndicadoresDePrazo } from './planejamentoIndicadores';

/**
 * Situação de prazo e "Agrupar" de Engenharia › Planejamento (`ProjectList.tsx`, contexto
 * PLANEJAMENTO). Crítica de design 2026-11-14, itens 3 e 4 de
 * docs/planos/2026-11-14-planejamento-lista-critica.md.
 *
 * A situação usa a MESMA régua da Central de Comando (SPI ≥ 1 = no prazo). A coluna Prazo e o
 * grupo leem daqui, para o rótulo do grupo ser o texto da célula (sem a contagem de tarefas).
 */

export type ChaveSituacaoPrazo = 'atrasado' | 'no-prazo' | 'nao-comecou' | 'sem-datas' | 'concluido';

export interface SituacaoDePrazo {
    chave: ChaveSituacaoPrazo;
    /** Rótulo da situação ("Atrasado") — é o rótulo do grupo. */
    rotulo: string;
    /** Texto da célula ("Atrasado · 33 tarefas"). */
    texto: string;
    /** Cor do texto (status = cor de texto, sem pílula — §8). */
    cor: string;
}

/** O que pede atenção primeiro. Ordem da coluna Prazo e dos grupos. */
export const ORDEM_SITUACAO: ChaveSituacaoPrazo[] = ['atrasado', 'no-prazo', 'nao-comecou', 'sem-datas', 'concluido'];

const tarefas = (n: number) => `${n} ${n === 1 ? 'tarefa' : 'tarefas'}`;

export function situacaoDePrazo(ind: IndicadoresDePrazo): SituacaoDePrazo {
    if (!ind.temDatas) return { chave: 'sem-datas', rotulo: 'Sem datas', texto: 'Sem datas', cor: 'text-gray-600' };
    if (ind.avancoFisicoPct >= 100) return { chave: 'concluido', rotulo: 'Concluído', texto: 'Concluído', cor: 'text-emerald-700' };
    const atrasado = (): SituacaoDePrazo => ({
        chave: 'atrasado', rotulo: 'Atrasado',
        texto: ind.atrasadas > 0 ? `Atrasado · ${tarefas(ind.atrasadas)}` : 'Atrasado',
        cor: 'text-red-700',
    });
    if (ind.spi === null) {
        return ind.atrasadas > 0 ? atrasado() : { chave: 'nao-comecou', rotulo: 'Não começou', texto: 'Não começou', cor: 'text-gray-600' };
    }
    if (ind.spi >= 1) return { chave: 'no-prazo', rotulo: 'No prazo', texto: 'No prazo', cor: 'text-emerald-700' };
    return atrasado();
}

export type CampoAgruparPlanejamento = 'prazo' | 'termino' | 'obra' | 'cliente';

export const OPCOES_AGRUPAR_PLANEJAMENTO: { value: CampoAgruparPlanejamento; label: string }[] = [
    { value: 'prazo', label: 'Prazo' },
    { value: 'termino', label: 'Mês de término' },
    { value: 'obra', label: 'Obra Vinculada' },
    { value: 'cliente', label: 'Cliente' },
];

/** O que cada célula mostra — a tela resolve, o agrupamento só lê. */
export interface LeitorDoPlanejamento<T> {
    /** Indicadores de prazo da linha; ausente enquanto calcula. */
    indicadores: (p: T) => IndicadoresDePrazo | undefined;
    obra: (p: T) => string | null | undefined;
    cliente: (p: T) => string | null | undefined;
}

const SEM: Record<CampoAgruparPlanejamento, string> = {
    prazo: 'Calculando',
    termino: 'Sem término',
    obra: 'Sem obra vinculada',
    cliente: 'Sem cliente',
};

export function chaveDoGrupoPlanejamento<T>(campo: CampoAgruparPlanejamento, p: T, leitor: LeitorDoPlanejamento<T>): ChaveDeGrupo {
    switch (campo) {
        case 'prazo': {
            const ind = leitor.indicadores(p);
            if (!ind) return null;
            const s = situacaoDePrazo(ind);
            return { key: s.chave, label: s.rotulo };
        }
        case 'termino': return chavePorMes(leitor.indicadores(p)?.fimPrevisto);
        case 'obra': return chavePorNome(leitor.obra(p));
        case 'cliente': return chavePorNome(leitor.cliente(p));
    }
}

export function agruparPlanejamentos<T>(
    planejamentos: T[],
    campo: CampoAgruparPlanejamento,
    direcao: DirecaoGrupos,
    leitor: LeitorDoPlanejamento<T>,
): Grupo<T>[] {
    return agruparLinhas(planejamentos, {
        chave: p => chaveDoGrupoPlanejamento(campo, p, leitor),
        semRotulo: SEM[campo],
        ordem: campo === 'prazo' ? ORDEM_SITUACAO : campo === 'termino' ? 'chave' : 'rotulo',
        direcao,
    });
}
