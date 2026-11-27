// utils/manutencaoDoSindico.ts
//
// Portal do Síndico › Manutenção e Equipamentos (G4, 26/11/2026). A parte pura.
// Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
//
// O banco decide (RPCs `sindico_portal_manutencao`, `_os_*`, `_plano_item_*`,
// `_ativo_*` — migration aplicar_20271126950200); isto existe para o botão
// desligado dizer o motivo ANTES do clique, com as mesmas frases.

export type TipoOs = 'PREVENTIVA' | 'CORRETIVA' | 'INSPECAO';
export type PrioridadeOs = 'BAIXA' | 'NORMAL' | 'ALTA' | 'EMERGENCIA';
export type StatusOs = 'ABERTA' | 'AGENDADA' | 'EM_EXECUCAO' | 'CONCLUIDA' | 'CANCELADA';
export type UnidadePeriodo = 'DIA' | 'SEMANA' | 'MES' | 'ANO';
export type Responsavel = 'EQUIPE_LOCAL' | 'EMPRESA_ESPECIALIZADA' | 'FABRICANTE' | 'ORGAO_PUBLICO';

export const ROTULO_TIPO_OS: Record<TipoOs, string> = { PREVENTIVA: 'Preventiva', CORRETIVA: 'Corretiva', INSPECAO: 'Inspeção' };
export const ROTULO_PRIORIDADE: Record<PrioridadeOs, string> = { BAIXA: 'Baixa', NORMAL: 'Normal', ALTA: 'Alta', EMERGENCIA: 'Emergência' };
export const ROTULO_STATUS_OS: Record<StatusOs, string> = {
    ABERTA: 'Aberta', AGENDADA: 'Agendada', EM_EXECUCAO: 'Em execução', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada',
};
export const ROTULO_RESPONSAVEL: Record<Responsavel, string> = {
    EQUIPE_LOCAL: 'Equipe do prédio', EMPRESA_ESPECIALIZADA: 'Empresa especializada', FABRICANTE: 'Fabricante', ORGAO_PUBLICO: 'Órgão público',
};
const UNIDADE: Record<UnidadePeriodo, [string, string]> = {
    DIA: ['dia', 'dias'], SEMANA: ['semana', 'semanas'], MES: ['mês', 'meses'], ANO: ['ano', 'anos'],
};

export interface SistemaDoPredio { id: string; nome: string }

export interface ItemDoPlano {
    id: string;
    descricao: string;
    sistemaId: string | null;
    sistema: string | null;
    periodicidadeValor: number;
    periodicidadeUnidade: UnidadePeriodo;
    responsavel: Responsavel | null;
    proximo: string | null;
    ultimaExecucao: string | null;
}

export interface OrdemDeServico {
    id: string;
    codigo: string | null;
    tipo: TipoOs;
    prioridade: PrioridadeOs | null;
    status: StatusOs;
    descricao: string;
    sistemaId: string | null;
    sistema: string | null;
    itemId: string | null;
    ativoId: string | null;
    ativo: string | null;
    previsto: string | null;
    executado: string | null;
    custo: number | null;
    fornecedorId: string | null;
    fornecedor: string | null;
    achados: string | null;
}

export interface EquipamentoDoPredio {
    id: string;
    codigo: string | null;
    nome: string;
    sistemaId: string | null;
    sistema: string | null;
    marca: string | null;
    modelo: string | null;
    serie: string | null;
    local: string | null;
    compra: string | null;
    garantiaAte: string | null;
    obs: string | null;
    /** Quantas OS apontam para ele (com OS não se remove). */
    ordens: number;
}

export interface ManutencaoDoPredio {
    sistemas: SistemaDoPredio[];
    plano: { id: string; nome: string; desde: string | null } | null;
    itens: ItemDoPlano[];
    ordens: OrdemDeServico[];
    ativos: EquipamentoDoPredio[];
    marcas: string[];
    podeOperar: boolean;
    motivoNaoOpera: string | null;
}

/** "a cada 6 meses" / "todo mês". */
export function textoDaPeriodicidade(valor: number, unidade: UnidadePeriodo): string {
    const [um, varios] = UNIDADE[unidade] ?? ['', ''];
    return valor === 1 ? `a cada ${um}` : `a cada ${valor} ${varios}`;
}

const FECHADA: StatusOs[] = ['CONCLUIDA', 'CANCELADA'];

/** Mesma frase de `sindico_portal_os_salvar` para OS fechada. */
export const MOTIVO_OS_FECHADA = 'Ordem concluída ou cancelada não se edita — é o registro do que aconteceu.';

export function motivoNaoEditaOs(o: Pick<OrdemDeServico, 'status'>, base: string | null): string | null {
    if (base) return base;
    return FECHADA.includes(o.status) ? MOTIVO_OS_FECHADA : null;
}

/** Concluir e cancelar: só OS em aberto. */
export function motivoNaoFechaOs(o: Pick<OrdemDeServico, 'status'>, base: string | null): string | null {
    if (base) return base;
    return FECHADA.includes(o.status) ? 'Esta ordem já está concluída ou cancelada.' : null;
}

export function motivoNaoRemoveEquipamento(a: Pick<EquipamentoDoPredio, 'ordens'>, base: string | null): string | null {
    if (base) return base;
    return a.ordens > 0 ? 'Este equipamento tem ordens de serviço no histórico — não dá para remover.' : null;
}

/** Dias até o próximo vencimento (negativo = vencido). `hoje` e `data` em 'AAAA-MM-DD'. */
export function diasAte(data: string | null, hoje: string): number | null {
    if (!data) return null;
    const ms = Date.UTC(+data.slice(0, 4), +data.slice(5, 7) - 1, +data.slice(8, 10))
        - Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10));
    return Math.round(ms / 86400000);
}

/** Situação do item do plano pelo próximo vencimento: vencido, nos próximos 30 dias, em dia. */
export function situacaoDoItem(proximo: string | null, hoje: string): 'VENCIDO' | 'PROXIMO' | 'EM_DIA' | 'SEM_DATA' {
    const d = diasAte(proximo, hoje);
    if (d === null) return 'SEM_DATA';
    if (d < 0) return 'VENCIDO';
    return d <= 30 ? 'PROXIMO' : 'EM_DIA';
}
