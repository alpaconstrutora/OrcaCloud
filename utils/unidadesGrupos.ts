import { agruparLinhas, chavePorNome, chavePorRotulo, type ChaveDeGrupo, type DirecaoGrupos, type Grupo } from './agruparLinhas';

/**
 * "Agrupar" da seção Unidades de uma torre (`components/empreendimento/UnitEditor.tsx`, Empreendimento ›
 * Torres e Unidades). Até 25/11/2026 a tabela agrupava SEMPRE por pavimento, sem escolha, sem a ordem dos
 * grupos e sem o recolher/expandir todos — docs/planos/2026-11-25-unidades-agrupar.md. Mesmo recurso das
 * demais telas (guia de UI §6.12, `agruparLinhas`): recebe as unidades já ordenadas pela coluna da tabela
 * e devolve os grupos; dentro do grupo, a ordem que entrou.
 *
 * Só colunas que a tabela MOSTRA e com UM valor por linha (nome e áreas ficam fora).
 */

export type CampoAgruparUnidade = 'pavimento' | 'floor_tipo' | 'typology' | 'bedrooms' | 'position_type' | 'view_type' | 'sun_orientation';

export const OPCOES_AGRUPAR_UNIDADE: { value: CampoAgruparUnidade; label: string }[] = [
    { value: 'pavimento', label: 'Pavimento' },
    { value: 'floor_tipo', label: 'Tipo do pavimento' },
    { value: 'typology', label: 'Tipologia' },
    { value: 'bedrooms', label: 'Dormitórios' },
    { value: 'position_type', label: 'Posição' },
    { value: 'view_type', label: 'Vista' },
    { value: 'sun_orientation', label: 'Orientação' },
];

export interface UnidadeAgrupavel {
    floor?: number | null;
    floor_tipo?: string | null;
    typology?: string | null;
    bedrooms?: number | null;
    position_type?: string | null;
    view_type?: string | null;
    sun_orientation?: string | null;
    private_area?: number | null;
}

/** O que a célula / o cabeçalho mostra — a tela resolve, o agrupamento só lê. Os mapas de rótulo vêm NA
 *  ORDEM em que os grupos devem sair (a do seletor do formulário). */
export interface LeitorDaUnidade {
    /** Nome do pavimento como está na seção Pavimentos ("Estacionamento 2"); `undefined` sem cadastro. */
    nomeDoAndar: (andar: number) => string | undefined;
    tipoDoPavimento: Record<string, string>;
    posicao: Record<string, string>;
    vista: Record<string, string>;
    orientacao: Record<string, string>;
}

const SEM: Record<CampoAgruparUnidade, string> = {
    pavimento: 'Sem pavimento',
    floor_tipo: 'Sem tipo do pavimento',
    typology: 'Sem tipologia',
    bedrooms: 'Sem dormitórios informados',
    position_type: 'Sem posição',
    view_type: 'Sem vista',
    sun_orientation: 'Sem orientação',
};

const numero = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

export function chaveDoGrupoUnidade(campo: CampoAgruparUnidade, u: UnidadeAgrupavel, leitor: LeitorDaUnidade): ChaveDeGrupo {
    switch (campo) {
        case 'pavimento':
            return numero(u.floor) ? { key: String(u.floor), label: leitor.nomeDoAndar(u.floor) ?? `Pavimento ${u.floor}` } : null;
        case 'floor_tipo': return chavePorRotulo(u.floor_tipo, leitor.tipoDoPavimento);
        case 'typology': return chavePorNome(u.typology);
        case 'bedrooms':
            return numero(u.bedrooms) ? { key: String(u.bedrooms), label: `${u.bedrooms} ${u.bedrooms === 1 ? 'dormitório' : 'dormitórios'}` } : null;
        case 'position_type': return chavePorRotulo(u.position_type, leitor.posicao);
        case 'view_type': return chavePorRotulo(u.view_type, leitor.vista);
        case 'sun_orientation': return chavePorRotulo(u.sun_orientation, leitor.orientacao);
    }
}

/** Pavimento e Dormitórios em ordem numérica (subsolo −2 antes do térreo 0); Tipo do pavimento, Posição,
 *  Vista e Orientação na ordem do seletor; Tipologia em A→Z. O grupo "Sem …" vai sempre por último. */
export function agruparUnidades<T extends UnidadeAgrupavel>(
    lista: T[],
    campo: CampoAgruparUnidade,
    direcao: DirecaoGrupos,
    leitor: LeitorDaUnidade,
): Grupo<T>[] {
    const numericos = (valores: (number | null | undefined)[]) =>
        [...new Set(valores.filter(numero))].sort((a, b) => a - b).map(String);
    const ordem = campo === 'pavimento' ? numericos(lista.map(u => u.floor))
        : campo === 'bedrooms' ? numericos(lista.map(u => u.bedrooms))
        : campo === 'floor_tipo' ? Object.keys(leitor.tipoDoPavimento)
        : campo === 'position_type' ? Object.keys(leitor.posicao)
        : campo === 'view_type' ? Object.keys(leitor.vista)
        : campo === 'sun_orientation' ? Object.keys(leitor.orientacao)
        : 'rotulo';
    return agruparLinhas(lista, {
        chave: u => chaveDoGrupoUnidade(campo, u, leitor),
        semRotulo: SEM[campo],
        // A tabela mostra a soma das áreas no cabeçalho; o total genérico fica com a área privativa.
        valor: u => u.private_area,
        ordem,
        direcao,
    });
}
