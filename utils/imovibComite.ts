/**
 * Comitê & Gates do estudo (item 1.5 do plano
 * docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md; decisão D5).
 * Regras puras — testes em __tests__/imovibComite.test.ts.
 *
 * - Os gates vão em ordem: só se decide o próximo gate em aberto (ou rever um já decidido).
 * - Decisão que não seja "pendente" exige a versão congelada avaliada (o banco também exige).
 * - "Aprovado" não passa com pendência que trava (DD alta/crítica sem ok; risco alto/crítico
 *   em aberto). Com pendência, só "Aprovado com condicionantes", e com as condicionantes escritas.
 */
export type GateDoComite = 1 | 2 | 3 | 4 | 5 | 6;
export type DecisaoDoComite = 'pendente' | 'aprovado' | 'aprovado_condicionantes' | 'reprovado' | 'devolvido' | 'suspenso' | 'arquivado';

export const GATES: GateDoComite[] = [1, 2, 3, 4, 5, 6];

export const ROTULO_DO_GATE: Record<GateDoComite, string> = {
    1: 'Gate 1 — Triagem',
    2: 'Gate 2 — Viabilidade preliminar',
    3: 'Gate 3 — Negociação',
    4: 'Gate 4 — Aquisição',
    5: 'Gate 5 — Desenvolvimento',
    6: 'Gate 6 — Lançamento',
};

export const ROTULO_DA_DECISAO: Record<DecisaoDoComite, string> = {
    pendente: 'Pendente',
    aprovado: 'Aprovado',
    aprovado_condicionantes: 'Aprovado com condicionantes',
    reprovado: 'Reprovado',
    devolvido: 'Devolvido para revisão',
    suspenso: 'Suspenso',
    arquivado: 'Arquivado',
};

export interface DecisaoDoGate {
    id: string;
    study_id: string;
    version_id: string | null;
    gate: GateDoComite;
    decision: DecisaoDoComite;
    condicionantes?: string | null;
    parecer?: string | null;
    decided_by?: string | null;
    decided_by_nome?: string | null;
    decided_at?: string | null;
    created_at?: string;
    updated_at?: string;
}

const aprovou = (d: DecisaoDoComite) => d === 'aprovado' || d === 'aprovado_condicionantes';

/** O primeiro gate ainda não aprovado (7 = todos aprovados). */
export function proximoGate(decisoes: Pick<DecisaoDoGate, 'gate' | 'decision'>[]): GateDoComite | 7 {
    const aprovados = new Set(decisoes.filter(d => aprovou(d.decision)).map(d => d.gate));
    for (const g of GATES) if (!aprovados.has(g)) return g;
    return 7;
}

/** Por que este gate não pode ser aberto para decisão agora (undefined = pode). */
export function motivoParaNaoAbrir(gate: GateDoComite, decisoes: Pick<DecisaoDoGate, 'gate' | 'decision'>[]): string | undefined {
    const proximo = proximoGate(decisoes);
    const jaDecidido = decisoes.some(d => d.gate === gate && d.decision !== 'pendente');
    if (jaDecidido || gate <= proximo) return undefined;
    return `Decida antes o ${ROTULO_DO_GATE[proximo as GateDoComite]}.`;
}

/** Por que esta decisão não pode ser registrada (undefined = pode). */
export function motivoParaNaoDecidir(f: {
    decision: DecisaoDoComite;
    version_id: string | null;
    condicionantes: string;
    bloqueios: number;
}): string | undefined {
    if (f.decision !== 'pendente' && !f.version_id) return 'Escolha a versão congelada que o comitê avaliou.';
    if (f.decision === 'aprovado' && f.bloqueios > 0) {
        return `Há ${f.bloqueios} pendência(s) que travam (due diligence alta/crítica sem ok ou risco alto/crítico em aberto): aprove com condicionantes ou resolva antes.`;
    }
    if (f.decision === 'aprovado_condicionantes' && !f.condicionantes.trim()) return 'Escreva as condicionantes.';
    return undefined;
}
