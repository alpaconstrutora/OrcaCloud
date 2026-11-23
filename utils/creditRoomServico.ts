/**
 * Contratos de SERVIÇO de um empreendimento (objetivo "Serviço") — peças puras da coleta do Credit Room.
 *
 * Valem os contratos `SERVICOS` da obra do empreendimento em `Ativo` ou `Concluído`; Minuta, Rascunho,
 * Revisão e os demais NÃO entram (decisão do usuário, 22/11/2026). Faturado = títulos a receber gerados
 * no financeiro para esses contratos (recebidos ou não); a faturar = valor dos contratos − faturado, mínimo 0.
 */
import type { SnapshotEmpreendimentoItem } from './creditRoomSnapshot';

/** Textos exatos de `contracts.status`. */
export const STATUS_SERVICO_VALIDOS: readonly string[] = ['Ativo', 'Concluído'];

export interface ContratoDeServico {
    id: string;
    status: string | null;
    current_value: number | null;
}

export type ResumoDeServico = NonNullable<SnapshotEmpreendimentoItem['servico']>;

const round2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * Resumo do serviço de UM empreendimento. `faturadoPorContrato`: Σ do valor dos títulos por id de contrato
 * (título de contrato fora da lista, ou de status não válido, é ignorado). Sem contrato válido devolve
 * `n_contratos = 0` — "sem contrato de serviço ativo", que é diferente de "não foi possível ler" (`null`).
 */
export function resumirServico(contratos: ContratoDeServico[], faturadoPorContrato: ReadonlyMap<string, number>): ResumoDeServico {
    const validos = contratos.filter(c => STATUS_SERVICO_VALIDOS.includes(String(c.status)));
    const valor = round2(validos.reduce((a, c) => a + num(c.current_value), 0));
    const faturado = round2(validos.reduce((a, c) => a + (faturadoPorContrato.get(c.id) ?? 0), 0));
    return {
        n_contratos: validos.length,
        valor_contratos: valor,
        faturado,
        a_faturar: Math.max(0, round2(valor - faturado)),
    };
}
