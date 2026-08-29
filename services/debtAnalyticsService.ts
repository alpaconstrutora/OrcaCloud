/**
 * Indicadores de dívida (PRD item 10) e relatórios (item 12).
 *
 * Serviço fino sobre `fn_debt_position`, `fn_debt_concentration`,
 * `fn_debt_schedule_curve` e `vw_debt_by_target` — a conta mora no SQL, aqui só
 * o de-para de nomes e o CSV.
 *
 * REGRA #5: `organizationId` null é "Todas as organizações" e é passado como
 * `null` para a RPC, que trata NULL como "todas as do usuário" e deixa a RLS
 * recortar. Nunca bloquear a leitura por falta de org.
 *
 * Plano: docs/planos/2026-08-29-gestao-dividas-financiamentos.md
 */

import { supabase } from '../lib/supabase';
import type {
    DebtByTargetRow,
    DebtConcentrationDimension,
    DebtConcentrationRow,
    DebtCurvePoint,
    DebtPosition,
} from '../types/debt';

const num = (v: unknown): number => (v == null ? 0 : Number(v));

/** Posição zerada — o que a tela mostra antes de existir dívida cadastrada. */
export const POSICAO_VAZIA: DebtPosition = {
    nContratos: 0, nInstituicoes: 0, dividaTotal: 0, curtoPrazo: 0, longoPrazo: 0,
    encargosAPagar: 0, servico30: 0, servico90: 0, servico365: 0, vencido: 0,
    nParcelasVencidas: 0, custoMedioMensal: 0, prazoMedioMeses: 0,
    pctTaxaVariavel: 0, pctIndexada: 0,
};

const VW_DEBT_BY_TARGET_COLS =
    'organization_id, target_kind, target_id, debt_contract_id, percent, saldo_rateado, encargos_rateados, servico_rateado, proximo_vencimento, n_parcelas';

export const debtAnalyticsService = {

    async position(organizationId: string | null, refDate?: string): Promise<DebtPosition> {
        const { data, error } = await supabase.rpc('fn_debt_position', {
            p_organization_id: organizationId,
            p_ref_date: refDate ?? new Date().toISOString().slice(0, 10),
        });
        if (error) throw error;

        const row = (data as Record<string, unknown>[] | null)?.[0];
        // A função devolve sempre uma linha; array vazio só acontece se a RPC
        // mudar de forma. Cair para zeros é melhor que a tela explodir com
        // `undefined.dividaTotal`.
        if (!row) return POSICAO_VAZIA;

        return {
            nContratos: num(row.n_contratos),
            nInstituicoes: num(row.n_instituicoes),
            dividaTotal: num(row.divida_total),
            curtoPrazo: num(row.curto_prazo),
            longoPrazo: num(row.longo_prazo),
            encargosAPagar: num(row.encargos_a_pagar),
            servico30: num(row.servico_30),
            servico90: num(row.servico_90),
            servico365: num(row.servico_365),
            vencido: num(row.vencido),
            nParcelasVencidas: num(row.n_parcelas_vencidas),
            custoMedioMensal: num(row.custo_medio_mensal),
            prazoMedioMeses: num(row.prazo_medio_meses),
            pctTaxaVariavel: num(row.pct_taxa_variavel),
            pctIndexada: num(row.pct_indexada),
        };
    },

    async concentration(
        organizationId: string | null,
        dimension: DebtConcentrationDimension,
    ): Promise<DebtConcentrationRow[]> {
        const { data, error } = await supabase.rpc('fn_debt_concentration', {
            p_organization_id: organizationId,
            p_dimension: dimension,
        });
        if (error) throw error;
        return ((data ?? []) as Record<string, unknown>[]).map(r => ({
            chave: String(r.chave ?? ''),
            rotulo: String(r.rotulo ?? ''),
            saldo: num(r.saldo),
            encargos: num(r.encargos),
            pct: num(r.pct),
            nContratos: num(r.n_contratos),
        }));
    },

    async curve(
        organizationId: string | null,
        opts?: { from?: string; months?: number },
    ): Promise<DebtCurvePoint[]> {
        const { data, error } = await supabase.rpc('fn_debt_schedule_curve', {
            p_organization_id: organizationId,
            p_from: opts?.from ?? new Date().toISOString().slice(0, 10),
            p_months: opts?.months ?? 24,
        });
        if (error) throw error;
        return ((data ?? []) as Record<string, unknown>[]).map(r => ({
            mes: String(r.mes ?? ''),
            amortizacao: num(r.amortizacao),
            juros: num(r.juros),
            encargos: num(r.encargos),
            parcela: num(r.parcela),
            saldoRemanescente: num(r.saldo_remanescente),
        }));
    },

    /**
     * Dívida rateada por destino. Uma linha por (destino, contrato) — a tela
     * agrupa. É a única fonte quando o rateio tem mais de uma obra: a linha do
     * razão só tem UMA coluna de obra.
     */
    async byTarget(organizationId: string | null): Promise<DebtByTargetRow[]> {
        let query = supabase
            .from('vw_debt_by_target')
            .select(VW_DEBT_BY_TARGET_COLS)
            .order('saldo_rateado', { ascending: false });
        if (organizationId) query = query.eq('organization_id', organizationId);
        const { data, error } = await query;
        if (error) throw error;
        return ((data ?? []) as Record<string, unknown>[]).map(r => ({
            organizationId: String(r.organization_id ?? ''),
            targetKind: r.target_kind as DebtByTargetRow['targetKind'],
            targetId: String(r.target_id ?? ''),
            debtContractId: String(r.debt_contract_id ?? ''),
            percent: num(r.percent),
            saldoRateado: num(r.saldo_rateado),
            encargosRateados: num(r.encargos_rateados),
            servicoRateado: num(r.servico_rateado),
            proximoVencimento: r.proximo_vencimento ? String(r.proximo_vencimento) : undefined,
            nParcelas: num(r.n_parcelas),
        }));
    },
};

/**
 * CSV que o Excel brasileiro abre sem assistente: separador `;`, decimal com
 * vírgula e BOM UTF-8. Sem o BOM, acento vira `Ã§` na abertura por duplo clique.
 */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
    const celula = (v: string | number): string => {
        if (typeof v === 'number') return v.toFixed(2).replace('.', ',');
        const t = String(v ?? '');
        return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const corpo = [headers.map(celula).join(';'), ...rows.map(r => r.map(celula).join(';'))].join('\r\n');
    return `﻿${corpo}`;
}

/** Dispara o download no navegador. */
export function baixarCsv(nome: string, conteudo: string): void {
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome.endsWith('.csv') ? nome : `${nome}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
