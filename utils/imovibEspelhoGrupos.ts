import { chavePorNome, type ChaveDeGrupo } from './agruparLinhas';

/**
 * "Agrupar" do Espelho de vendas do estudo de viabilidade (guia de UI §6.12; plano
 * docs/planos/2026-11-20-imovib-espelho-aba-tabela-padrao.md). Só colunas que a tabela MOSTRA, com UM valor por
 * linha: Torre, Andar, Status e a situação no VGV. O rótulo é o texto da célula. Total do grupo = o que a unidade
 * SOMA no VGV (a mesma regra do motor: preço, ou área × preço/m² da torre; permutada e fora do VGV não somam).
 */

export type CampoAgruparEspelho = 'torre' | 'andar' | 'status' | 'vgv';

export const OPCOES_AGRUPAR_ESPELHO: { value: CampoAgruparEspelho; label: string }[] = [
    { value: 'torre', label: 'Torre' },
    { value: 'andar', label: 'Andar' },
    { value: 'status', label: 'Status' },
    { value: 'vgv', label: 'No VGV' },
];

/** O que o agrupamento lê de cada unidade (a tela monta a partir da instância + torre + marca). */
export interface LinhaDoEspelho {
    torre: string | null | undefined;
    andar: number | null | undefined;
    status: string | null | undefined;
    marca?: 'nao_vendavel' | 'sem_unidade';
    preco: number | null | undefined;
    area: number | null | undefined;
    /** Preço/m² da torre (o motor usa quando a unidade não tem preço). */
    precoM2: number | null | undefined;
}

export const SEM_ROTULO_ESPELHO: Record<CampoAgruparEspelho, string> = {
    torre: 'Sem torre',
    andar: 'Sem andar',
    status: 'Sem status',
    vgv: 'Sem situação',
};

const ORDEM_STATUS = ['DISPONÍVEL', 'RESERVADO', 'VENDIDO', 'PERMUTADO'];
const VGV: Record<'conta' | 'nao_vendavel' | 'sem_unidade', string> = {
    conta: 'Conta no VGV',
    nao_vendavel: 'Não vendável no empreendimento',
    sem_unidade: 'Sem unidade no empreendimento',
};

/** Andar com chave que ordena como número (subsolo antes do térreo): -3 → "00997", 10 → "01010". */
const chaveDoAndar = (andar: number) => String(andar + 1000).padStart(5, '0');

export function chaveDoEspelho(campo: string, l: LinhaDoEspelho): ChaveDeGrupo {
    switch (campo) {
        case 'torre': return chavePorNome(l.torre);
        case 'andar': return l.andar == null ? null : { key: chaveDoAndar(l.andar), label: String(l.andar) };
        case 'status': return l.status ? { key: l.status, label: l.status } : null;
        case 'vgv': { const k = l.marca ?? 'conta'; return { key: k, label: VGV[k] }; }
        default: return null;
    }
}

export function ordemDoEspelho(campo: string): 'rotulo' | 'chave' | string[] {
    if (campo === 'andar') return 'chave';
    if (campo === 'status') return ORDEM_STATUS;
    if (campo === 'vgv') return ['conta', 'nao_vendavel', 'sem_unidade'];
    return 'rotulo';
}

/** Quanto a unidade soma no VGV — a regra de `computeImovibMath` (utils/imovibMotor.ts). */
export function valorNoVgv(l: LinhaDoEspelho): number | null {
    if (l.marca || l.status === 'PERMUTADO') return null;
    const preco = Number(l.preco) || 0;
    return preco > 0 ? preco : (Number(l.area) || 0) * (Number(l.precoM2) || 0);
}
