/**
 * O que fazer depois de chamar o motor no servidor (Edge `reconciliation-engine`).
 * Puro, para teste. Plano: docs/planos/2026-10-01-conciliacao-motor-duplicado.md
 *
 * A regra que importa: **só cai para o motor do navegador quando o servidor NÃO está
 * rodando.** Até 01/10/2026 qualquer erro caía — inclusive o corte de 20 s do cliente
 * com a Edge ainda trabalhando (26–61 s na Alpa) —, e eram dois motores na mesma conta.
 */
export type ResultadoDaChamada =
    | { tipo: 'resposta'; status: number; corpo: unknown }
    | { tipo: 'cortada' }            // nosso corte de tempo disparou: o servidor PODE estar rodando
    | { tipo: 'sem_rede'; mensagem: string };  // não chegou ao servidor

export type Decisao =
    | { acao: 'usar'; corpo: Record<string, number> }
    | { acao: 'navegador'; motivo: string }
    | { acao: 'erro'; mensagem: string };

export const MOTOR_JA_RODANDO = 'Já há uma execução do motor rodando nesta conta. Aguarde ela terminar e confira a última execução.';
export const MOTOR_CONTINUA_NO_SERVIDOR = 'O motor continua rodando no servidor (passou de 3 minutos). Aguarde e confira a última execução — não clique de novo agora.';

export function decidirAposMotorServidor(r: ResultadoDaChamada): Decisao {
    if (r.tipo === 'cortada') return { acao: 'erro', mensagem: MOTOR_CONTINUA_NO_SERVIDOR };
    if (r.tipo === 'sem_rede') return { acao: 'navegador', motivo: `servidor inalcançável: ${r.mensagem}` };

    const corpo = (r.corpo ?? {}) as Record<string, unknown>;
    if (r.status >= 200 && r.status < 300) return { acao: 'usar', corpo: corpo as Record<string, number> };
    if (r.status === 409) return { acao: 'erro', mensagem: typeof corpo.error === 'string' ? corpo.error : MOTOR_JA_RODANDO };
    // 401/403: sem permissão — o navegador teria a mesma resposta da RLS; não adianta rodar lá.
    if (r.status === 401 || r.status === 403) {
        return { acao: 'erro', mensagem: typeof corpo.error === 'string' ? corpo.error : 'Sem permissão para rodar o motor nesta conta.' };
    }
    // 404 (função fora), 5xx (falhou ou caiu): a execução do servidor TERMINOU — o navegador pode tentar.
    return { acao: 'navegador', motivo: `servidor respondeu ${r.status}${typeof corpo.error === 'string' ? `: ${corpo.error}` : ''}` };
}
