/**
 * Quais folhas formam o "custo de mão de obra" de uma competência.
 *
 * Regra única do Dashboard RH e do Custo por Obra (passo 3 de
 * docs/planos/2026-10-28-dashboard-rh-numeros-e-paineis.md):
 *
 * - Só folha MENSAL. A de adiantamento não tem custo próprio: o adiantamento
 *   sai da mensal (rubrica ADIANTAMENTO) — somar as duas duplicaria.
 * - Status FECHADO ou PROCESSANDO (os dois que existem no banco). O Custo por
 *   Obra filtrava FECHADO/RASCUNHO, e RASCUNHO não existe: as folhas da Alpa,
 *   todas em PROCESSANDO, ficavam fora. A tela diz quando a folha não fechou.
 * - Competência = a mais recente até o mês de referência. A folha de outubro só
 *   é calculada em novembro, então "o mês corrente" quase nunca tem folha.
 * - Uma folha por organização: a FECHADA vence; entre iguais, a mais recente.
 */

export const STATUS_FOLHA_COM_CUSTO = ['FECHADO', 'PROCESSANDO'] as const;

export interface FolhaParaCusto {
    id: string;
    org_id: string;
    start_date: string;
    status: string;
    type: string;
    created_at?: string;
}

export const ehFolhaComCusto = (f: FolhaParaCusto): boolean =>
    f.type === 'mensal' && (STATUS_FOLHA_COM_CUSTO as readonly string[]).includes(f.status);

export function folhasDaCompetencia<F extends FolhaParaCusto>(
    folhas: F[],
    refDate: string,
): { competencia: string | null; folhas: F[] } {
    const refMes = refDate.slice(0, 7);
    const validas = folhas.filter(f => ehFolhaComCusto(f) && f.start_date.slice(0, 7) <= refMes);
    if (validas.length === 0) return { competencia: null, folhas: [] };

    const competencia = validas.map(f => f.start_date.slice(0, 7)).sort().at(-1)!;
    const porOrg = new Map<string, F>();
    for (const f of validas.filter(v => v.start_date.slice(0, 7) === competencia)) {
        const atual = porOrg.get(f.org_id);
        if (!atual || prefere(f, atual)) porOrg.set(f.org_id, f);
    }
    return { competencia, folhas: [...porOrg.values()] };
}

const prefere = (a: FolhaParaCusto, b: FolhaParaCusto): boolean => {
    const fa = a.status === 'FECHADO', fb = b.status === 'FECHADO';
    if (fa !== fb) return fa;
    return (a.created_at ?? '') > (b.created_at ?? '');
};
