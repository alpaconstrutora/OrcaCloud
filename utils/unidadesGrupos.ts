import { agruparLinhas, chavePorNome, chavePorRotulo, type ChaveDeGrupo, type DirecaoGrupos, type Grupo } from './agruparLinhas';

/**
 * "Agrupar" da seção Unidades de uma torre (`components/empreendimento/UnitEditor.tsx`, Empreendimento ›
 * Torres e Unidades). Até 25/11/2026 a tabela agrupava SEMPRE por pavimento, sem escolha, sem a ordem dos
 * grupos e sem o recolher/expandir todos — docs/planos/2026-11-25-unidades-agrupar.md. Mesmo recurso das
 * demais telas (guia de UI §6.12, `agruparLinhas`): recebe as unidades já ordenadas pela coluna da tabela
 * e devolve os grupos; dentro do grupo, a ordem que entrou.
 *
 * Todas as colunas da tabela, menos Unidade (uma por linha — um grupo por unidade não agrupa nada). Elevação,
 * áreas, banheiros, suítes e vagas entraram em 25/11/2026 ("esta faltando muitas colunas no filtro grupo" —
 * docs/planos/2026-11-25-unidades-grupo-colunas-autofit.md). A ordem das opções é a das colunas.
 */

export type CampoAgruparUnidade =
    | 'pavimento' | 'floor_tipo' | 'elevacao' | 'typology' | 'private_area' | 'common_area'
    | 'bedrooms' | 'bathrooms' | 'suites' | 'parking_spaces' | 'position_type' | 'view_type' | 'sun_orientation';

export const OPCOES_AGRUPAR_UNIDADE: { value: CampoAgruparUnidade; label: string }[] = [
    { value: 'pavimento', label: 'Pavimento' },
    { value: 'floor_tipo', label: 'Tipo do pavimento' },
    { value: 'elevacao', label: 'Elevação' },
    { value: 'typology', label: 'Tipologia' },
    { value: 'private_area', label: 'Área privativa' },
    { value: 'common_area', label: 'Área comum' },
    { value: 'bedrooms', label: 'Dormitórios' },
    { value: 'bathrooms', label: 'Banheiros' },
    { value: 'suites', label: 'Suítes' },
    { value: 'parking_spaces', label: 'Vagas' },
    { value: 'position_type', label: 'Posição' },
    { value: 'view_type', label: 'Vista' },
    { value: 'sun_orientation', label: 'Orientação' },
];

export interface UnidadeAgrupavel {
    floor?: number | null;
    floor_tipo?: string | null;
    typology?: string | null;
    private_area?: number | null;
    common_area?: number | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    suites?: number | null;
    parking_spaces?: number | null;
    position_type?: string | null;
    view_type?: string | null;
    sun_orientation?: string | null;
}

/** O que a célula / o cabeçalho mostra — a tela resolve, o agrupamento só lê. Os mapas de rótulo vêm NA
 *  ORDEM em que os grupos devem sair (a do seletor do formulário). */
export interface LeitorDaUnidade {
    /** Nome do pavimento como está na seção Pavimentos ("Estacionamento 2"); `undefined` sem cadastro. */
    nomeDoAndar: (andar: number) => string | undefined;
    /** Elevação do andar: milímetros (ordem e chave) e o texto da coluna ("+2,70 m (calc.)"); `undefined` sem andar. */
    elevacaoDoAndar?: (andar: number) => { mm: number; texto: string } | undefined;
    tipoDoPavimento: Record<string, string>;
    posicao: Record<string, string>;
    vista: Record<string, string>;
    orientacao: Record<string, string>;
}

const SEM: Record<CampoAgruparUnidade, string> = {
    pavimento: 'Sem pavimento',
    floor_tipo: 'Sem tipo do pavimento',
    elevacao: 'Sem elevação',
    typology: 'Sem tipologia',
    private_area: 'Sem área privativa',
    common_area: 'Sem área comum',
    bedrooms: 'Sem dormitórios informados',
    bathrooms: 'Sem banheiros informados',
    suites: 'Sem suítes informadas',
    parking_spaces: 'Sem vagas informadas',
    position_type: 'Sem posição',
    view_type: 'Sem vista',
    sun_orientation: 'Sem orientação',
};

/** Rótulo das contagens, no singular e no plural. */
const CONTAGEM: Partial<Record<CampoAgruparUnidade, [string, string]>> = {
    bedrooms: ['dormitório', 'dormitórios'],
    bathrooms: ['banheiro', 'banheiros'],
    suites: ['suíte', 'suítes'],
    parking_spaces: ['vaga', 'vagas'],
};

const numero = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
/** A mesma escrita da célula de área ("81 m²", "127,5 m²"). */
const m2 = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²`;

function chaveDeContagem(campo: CampoAgruparUnidade, v: number | null | undefined): ChaveDeGrupo {
    const [um, varios] = CONTAGEM[campo]!;
    return numero(v) ? { key: String(v), label: `${v} ${v === 1 ? um : varios}` } : null;
}

export function chaveDoGrupoUnidade(campo: CampoAgruparUnidade, u: UnidadeAgrupavel, leitor: LeitorDaUnidade): ChaveDeGrupo {
    switch (campo) {
        case 'pavimento':
            return numero(u.floor) ? { key: String(u.floor), label: leitor.nomeDoAndar(u.floor) ?? `Pavimento ${u.floor}` } : null;
        case 'floor_tipo': return chavePorRotulo(u.floor_tipo, leitor.tipoDoPavimento);
        case 'elevacao': {
            const e = numero(u.floor) ? leitor.elevacaoDoAndar?.(u.floor) : undefined;
            return e ? { key: String(e.mm), label: e.texto } : null;
        }
        case 'typology': return chavePorNome(u.typology);
        case 'private_area': return numero(u.private_area) ? { key: String(u.private_area), label: m2(u.private_area) } : null;
        case 'common_area': return numero(u.common_area) ? { key: String(u.common_area), label: m2(u.common_area) } : null;
        case 'bedrooms': return chaveDeContagem(campo, u.bedrooms);
        case 'bathrooms': return chaveDeContagem(campo, u.bathrooms);
        case 'suites': return chaveDeContagem(campo, u.suites);
        case 'parking_spaces': return chaveDeContagem(campo, u.parking_spaces);
        case 'position_type': return chavePorRotulo(u.position_type, leitor.posicao);
        case 'view_type': return chavePorRotulo(u.view_type, leitor.vista);
        case 'sun_orientation': return chavePorRotulo(u.sun_orientation, leitor.orientacao);
    }
}

/** Campos numéricos: os grupos saem em ordem numérica (subsolo −2 antes do térreo 0; 1 vaga antes de 10). */
const NUMERICOS: Partial<Record<CampoAgruparUnidade, keyof UnidadeAgrupavel>> = {
    pavimento: 'floor',
    private_area: 'private_area',
    common_area: 'common_area',
    bedrooms: 'bedrooms',
    bathrooms: 'bathrooms',
    suites: 'suites',
    parking_spaces: 'parking_spaces',
};

/** Numéricos (e Elevação, pelos milímetros) em ordem numérica; Tipo do pavimento, Posição, Vista e Orientação
 *  na ordem do seletor; Tipologia em A→Z. O grupo "Sem …" vai sempre por último. */
export function agruparUnidades<T extends UnidadeAgrupavel>(
    lista: T[],
    campo: CampoAgruparUnidade,
    direcao: DirecaoGrupos,
    leitor: LeitorDaUnidade,
): Grupo<T>[] {
    const emOrdemNumerica = (valores: (number | null | undefined)[]) =>
        [...new Set(valores.filter(numero))].sort((a, b) => a - b).map(String);
    const coluna = NUMERICOS[campo];
    const ordem = coluna ? emOrdemNumerica(lista.map(u => u[coluna] as number | null | undefined))
        : campo === 'elevacao' ? emOrdemNumerica(lista.map(u => (numero(u.floor) ? leitor.elevacaoDoAndar?.(u.floor)?.mm : undefined)))
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
