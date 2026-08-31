/**
 * Agregações da aba Análise de Pós-Obra & Garantia.
 *
 * Tudo aqui é função pura sobre o array de chamados que a tela JÁ carregou —
 * nenhuma consulta nova. Antes desta camada, `warrantyService.getKPIs` fazia
 * uma segunda leitura da mesma tabela só para contar, e o filtro de estado ia
 * para o servidor: a aba Análise mostraria só o recorte escolhido na aba
 * Chamados. Aqui os números vêm sempre do conjunto inteiro.
 *
 * Extraído em 2026-08-30 — plano em
 * `docs/planos/2026-08-30-pos-obra-garantia-vinculos-abas-ui.md`.
 */

import type { ClaimState, WarrantyClaim, WarrantyKPIs } from '../types/warranty';

/**
 * Estados que tiram o chamado da fila de trabalho.
 *
 * `getKPIs` repetia este par em três contagens diferentes; um dia alguém
 * acrescentaria um estado terminal em duas delas e esqueceria a terceira.
 */
export const ESTADOS_TERMINAIS: readonly ClaimState[] = ['ENCERRADO', 'FORA_GARANTIA'];

/** Só o que as agregações leem — a consulta de KPI não precisa da linha inteira. */
export type WarrantyKPIRow = Pick<
    WarrantyClaim,
    'state' | 'in_warranty' | 'nps_nota' | 'custo_real' | 'sla_deadline' | 'created_at'
>;

/** `YYYY-MM-DD` de hoje no fuso local — nunca `toISOString()`, que é UTC. */
function hojeLocal(agora: Date): string {
    const y = agora.getFullYear();
    const m = String(agora.getMonth() + 1).padStart(2, '0');
    const d = String(agora.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Primeiro dia do mês corrente, `YYYY-MM-DD`, no fuso local. */
function inicioDoMes(agora: Date): string {
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * SLA vencido: prazo no passado e chamado ainda na fila.
 *
 * Comparação de strings `YYYY-MM-DD`, não de `Date`: `sla_deadline` é DATE puro
 * e `new Date('2026-08-30')` é meia-noite UTC, que em UTC-3 volta um dia.
 */
export function slaVencido(
    claim: Pick<WarrantyClaim, 'sla_deadline' | 'state'>,
    hoje: string,
): boolean {
    if (!claim.sla_deadline) return false;
    return claim.sla_deadline < hoje && !ESTADOS_TERMINAIS.includes(claim.state);
}

/**
 * Os 7 KPIs do topo da aba Análise.
 *
 * ⚠️ `encerrados_mes` e `custo_total_mes` filtram por `created_at`, não pela
 * data de encerramento — é o comportamento que `warrantyService.getKPIs` tinha
 * desde 20260708 e que esta extração **preserva de propósito**. Na prática lê
 * "chamados ABERTOS neste mês que já foram encerrados". Trocar para data de
 * encerramento é mudança de semântica: `warranty_claims` não tem `closed_at`,
 * só `updated_at`, que qualquer edição posterior move.
 */
export function computeWarrantyKPIs(
    rows: WarrantyKPIRow[],
    agora: Date = new Date(),
): WarrantyKPIs {
    const hoje = hojeLocal(agora);
    const primeiroDoMes = inicioDoMes(agora);
    const doMes = rows.filter(r => r.state === 'ENCERRADO' && r.created_at >= primeiroDoMes);
    const notas = rows.filter(r => r.nps_nota != null).map(r => r.nps_nota as number);

    return {
        total_abertos:   rows.filter(r => !ESTADOS_TERMINAIS.includes(r.state)).length,
        em_garantia:     rows.filter(r => r.in_warranty === true && r.state !== 'ENCERRADO').length,
        fora_garantia:   rows.filter(r => r.in_warranty === false).length,
        encerrados_mes:  doMes.length,
        nps_medio:       notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null,
        custo_total_mes: doMes.reduce((s, r) => s + (r.custo_real || 0), 0),
        sla_vencidos:    rows.filter(r => slaVencido(r, hoje)).length,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Gráficos
// ────────────────────────────────────────────────────────────────────────────

/** Uma barra/fatia: o rótulo que aparece e quantos chamados caíram nele. */
export interface BreakdownItem {
    key: string;
    label: string;
    total: number;
}

/** Rótulo das linhas que não têm o atributo. Um só, para não haver dois "vazios". */
export const SEM_CLASSIFICACAO = 'Não informado';

/**
 * Conta chamados por um atributo e devolve os `limite` maiores.
 *
 * `chaveDe` devolvendo `undefined`/`''` cai em `SEM_CLASSIFICACAO` — uma fatia
 * visível, não uma omissão: "40% dos chamados sem patologia classificada" é
 * exatamente o tipo de coisa que a aba Análise existe para mostrar.
 */
export function breakdownPor<T>(
    rows: T[],
    chaveDe: (row: T) => string | null | undefined,
    rotuloDe: (chave: string) => string,
    limite = 8,
): BreakdownItem[] {
    const contagem = new Map<string, number>();
    for (const row of rows) {
        const chave = chaveDe(row) || '';
        contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    }
    return [...contagem.entries()]
        .map(([key, total]) => ({
            key,
            label: key === '' ? SEM_CLASSIFICACAO : rotuloDe(key),
            total,
        }))
        .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
        .slice(0, limite);
}

/** Um mês da série de abertura × encerramento. */
export interface MonthlyFlowItem {
    /** `YYYY-MM` — a chave, não o rótulo. Quem exibe usa `formatMonthLabel`. */
    month: string;
    abertos: number;
    encerrados: number;
}

/**
 * Abertura × encerramento nos últimos `meses` meses.
 *
 * Encerramento usa `updated_at` porque não existe `closed_at` na tabela: é a
 * melhor aproximação disponível, e só é lida para chamados que já estão em
 * `ENCERRADO`. Uma edição posterior ao encerramento move a barra de mês — o
 * gráfico mostra tendência, não fecha competência.
 *
 * O mês sai por `slice(0, 7)` da string ISO, nunca por `new Date(...)` — um
 * timestamp de 01/09 às 00:30 em UTC-3 vira 31/08 em UTC e cairia no mês
 * anterior (mesma família de bug de `formatMonthLabel`).
 */
export function fluxoMensal(
    rows: Pick<WarrantyClaim, 'state' | 'created_at' | 'updated_at'>[],
    meses = 12,
    agora: Date = new Date(),
): MonthlyFlowItem[] {
    const serie = new Map<string, MonthlyFlowItem>();
    for (let i = meses - 1; i >= 0; i--) {
        const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        serie.set(month, { month, abertos: 0, encerrados: 0 });
    }

    for (const row of rows) {
        const mesAbertura = (row.created_at ?? '').slice(0, 7);
        const balde = serie.get(mesAbertura);
        if (balde) balde.abertos += 1;

        if (row.state === 'ENCERRADO') {
            const mesFecho = (row.updated_at ?? row.created_at ?? '').slice(0, 7);
            const baldeFecho = serie.get(mesFecho);
            if (baldeFecho) baldeFecho.encerrados += 1;
        }
    }

    return [...serie.values()];
}
