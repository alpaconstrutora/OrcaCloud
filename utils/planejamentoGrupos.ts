import { agruparLinhas, chavePorMes, chavePorNome, type ChaveDeGrupo, type DirecaoGrupos, type Grupo } from './agruparLinhas';
import type { IndicadoresDePrazo } from './planejamentoIndicadores';

/**
 * Situação de prazo e "Agrupar" de Engenharia › Planejamento (`ProjectList.tsx`, contexto
 * PLANEJAMENTO). Crítica de design 2026-11-14, itens 3 e 4 de
 * docs/planos/2026-11-14-planejamento-lista-critica.md.
 *
 * A situação usa a MESMA régua da Central de Comando (SPI ≥ 1 = no prazo). A coluna Prazo e o
 * grupo leem daqui, para o rótulo do grupo ser o texto da célula (sem os dias).
 *
 * 2ª crítica (15/11/2026, docs/planos/2026-11-15-planejamento-lista-critica-2.md): a célula diz
 * QUANTO — "Vencido há 230 dias", "Atrasado · 12 dias" — em vez de contar tarefas ("Atrasado · 33
 * tarefas" punha o Garden, vencido havia 7 meses, no mesmo peso do Divino).
 */

export type ChaveSituacaoPrazo = 'vencido' | 'atrasado' | 'no-prazo' | 'nao-comecou' | 'sem-datas' | 'concluido';

export interface SituacaoDePrazo {
    chave: ChaveSituacaoPrazo;
    /** Rótulo da situação ("Atrasado") — é o rótulo do grupo. */
    rotulo: string;
    /** Texto da célula ("Atrasado · 12 dias"). */
    texto: string;
    /** Dias de atraso (vencido: desde o término; atrasado: pelo cronograma ganho). Ordena a coluna. */
    dias: number;
    /** Cor do texto (status = cor de texto, sem pílula — §8). */
    cor: string;
}

/** O que pede atenção primeiro. Ordem da coluna Prazo e dos grupos. */
export const ORDEM_SITUACAO: ChaveSituacaoPrazo[] = ['vencido', 'atrasado', 'no-prazo', 'nao-comecou', 'sem-datas', 'concluido'];

export const diasPorExtenso = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

export function situacaoDePrazo(ind: IndicadoresDePrazo): SituacaoDePrazo {
    if (!ind.temDatas) return { chave: 'sem-datas', rotulo: 'Sem datas', texto: 'Sem datas', cor: 'text-gray-600', dias: 0 };
    if (ind.avancoFisicoPct >= 100) return { chave: 'concluido', rotulo: 'Concluído', texto: 'Concluído', cor: 'text-emerald-700', dias: 0 };
    if (ind.terminoVencidoDias !== null) {
        const n = ind.terminoVencidoDias;
        return { chave: 'vencido', rotulo: 'Término vencido', texto: n === 0 ? 'Vence hoje' : `Vencido há ${diasPorExtenso(n)}`, cor: 'text-red-700', dias: n };
    }
    const atrasado = (): SituacaoDePrazo => {
        const n = ind.atrasoDias ?? 0;
        return {
            chave: 'atrasado', rotulo: 'Atrasado',
            texto: n >= 1 ? `Atrasado · ${diasPorExtenso(n)}` : 'Atrasado · menos de 1 dia',
            cor: 'text-red-700', dias: n,
        };
    };
    if (ind.spi === null) {
        return ind.atrasadas > 0 ? atrasado() : { chave: 'nao-comecou', rotulo: 'Não começou', texto: 'Não começou', cor: 'text-gray-600', dias: 0 };
    }
    if (ind.spi >= 1) return { chave: 'no-prazo', rotulo: 'No prazo', texto: 'No prazo', cor: 'text-emerald-700', dias: 0 };
    return atrasado();
}

/** Chave de ordenação da coluna Prazo: pior primeiro (vencido há mais tempo, depois mais atrasado). */
export const ordemDoPrazo = (ind: IndicadoresDePrazo): number => {
    const s = situacaoDePrazo(ind);
    return ORDEM_SITUACAO.indexOf(s.chave) * 1_000_000 - s.dias;
};

export type CampoAgruparPlanejamento = 'prazo' | 'termino' | 'obra' | 'cliente';

export const OPCOES_AGRUPAR_PLANEJAMENTO: { value: CampoAgruparPlanejamento; label: string }[] = [
    { value: 'prazo', label: 'Prazo' },
    { value: 'termino', label: 'Mês de término' },
    { value: 'obra', label: 'Obra Vinculada' },
    { value: 'cliente', label: 'Cliente' },
];

/** O que cada célula mostra — a tela resolve, o agrupamento só lê. */
export interface LeitorDoPlanejamento<T> {
    /** Indicadores de prazo da linha; ausente enquanto calcula ou se a busca falhou. */
    indicadores: (p: T) => IndicadoresDePrazo | undefined;
    /** Rótulo do grupo das linhas sem indicadores: "Calculando" (padrão) ou "Sem dados" na falha. */
    semIndicadores?: string;
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
        semRotulo: campo === 'prazo' && leitor.semIndicadores ? leitor.semIndicadores : SEM[campo],
        ordem: campo === 'prazo' ? ORDEM_SITUACAO : campo === 'termino' ? 'chave' : 'rotulo',
        direcao,
    });
}
