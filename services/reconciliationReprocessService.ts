import { bankReconciliationService, type MatchingRunResult } from './bankReconciliationService';
import { reconciliationMemoryService } from './reconciliationMemoryService';

/**
 * O "Reprocessar" da Central: toda a automação da conciliação, numa ordem só.
 *
 * Até 30/09/2026 eram três botões em três lugares, que se sobrepunham e enganavam:
 * "Aplicar memória" (barra do extrato), "Aplicar Regras Agora" (aba Regras) e
 * "Reprocessar" (Central) — este último rodava só o motor, e quem clicava achava que
 * tinha rodado tudo. Plano: docs/planos/2026-09-30-conciliacao-regras-absorvidas-pela-central.md
 *
 * Ordem, e por quê:
 *   1. Memória — só preenche campo VAZIO, com o que já foi decidido para a mesma
 *      contraparte. É a fonte mais confiável (decisão humana repetida).
 *   2. Regras — só em movimento que continuou sem categoria (a trava de
 *      `linhaAceitaRegra`). Rodar depois da memória faz a regra não brigar com ela.
 *   3. Motor — casa extrato × título. Categoria não é pré-requisito dele, mas as
 *      contrapartes preenchidas em 1 e 2 melhoram o score.
 *
 * Arquivo próprio porque `reconciliationMemoryService` já importa
 * `bankReconciliationService`: pôr isto lá dentro criaria import circular.
 *
 * Etapa que falha NÃO derruba as outras: o motor roda mesmo se a memória ou as
 * regras falharem, e o erro volta no resultado para a tela mostrar — não some no
 * console.
 */
export interface ResultadoDoReprocesso {
    memoria: { aplicados: number; campos: number } | null;
    regras: number | null;
    motor: MatchingRunResult | null;
    erros: { etapa: 'memória' | 'regras' | 'motor'; mensagem: string }[];
}

function mensagemDeErro(e: unknown): string {
    if (e instanceof Error) return e.message;
    const o = e as { message?: string; details?: string; code?: string } | null;
    return [o?.message, o?.details].filter(Boolean).join(' · ') + (o?.code ? ` (${o.code})` : '') || String(e);
}

export const reconciliationReprocessService = {
    async reprocessarTudo(bankAccountId: string, organizationId?: string | null): Promise<ResultadoDoReprocesso> {
        const r: ResultadoDoReprocesso = { memoria: null, regras: null, motor: null, erros: [] };

        try {
            const m = await reconciliationMemoryService.aplicar(bankAccountId, organizationId);
            r.memoria = { aplicados: m.aplicados, campos: m.campos };
        } catch (e) {
            r.erros.push({ etapa: 'memória', mensagem: mensagemDeErro(e) });
        }

        try {
            r.regras = await bankReconciliationService.applyCustomRules(bankAccountId, organizationId);
        } catch (e) {
            r.erros.push({ etapa: 'regras', mensagem: mensagemDeErro(e) });
        }

        try {
            r.motor = await bankReconciliationService.runMatchingEngineTracked(bankAccountId, organizationId, 'MANUAL');
        } catch (e) {
            r.erros.push({ etapa: 'motor', mensagem: mensagemDeErro(e) });
        }

        return r;
    },
};

/** Frase do toast: diz de ONDE veio cada número. Pura, para teste. */
export function resumoDoReprocesso(r: ResultadoDoReprocesso): string {
    const partes: string[] = [];
    if (r.memoria && r.memoria.aplicados > 0) partes.push(`${r.memoria.aplicados} classificado(s) pela memória`);
    if (r.regras && r.regras > 0) partes.push(`${r.regras} por regra`);
    if (r.motor) {
        if (r.motor.autoApplied > 0) {
            partes.push(`${r.motor.autoApplied} conciliado(s) automaticamente${r.motor.exactUnique > 0 ? ` (${r.motor.exactUnique} por valor exato e candidato único)` : ''}`);
        }
        if (r.motor.transfersPaired > 0) partes.push(`${r.motor.transfersPaired} transferência(s) entre contas pareada(s)`);
        partes.push(`${r.motor.suggestions} sugestão(ões) para revisar`);
    }
    if (partes.length === 0 && r.erros.length === 0) partes.push('Nada novo para classificar ou conciliar');
    const erros = r.erros.map(e => `falhou na ${e.etapa}: ${e.mensagem}`);
    return [...partes, ...erros].join(' · ');
}
