/**
 * Snapshot do Credit Room (PRD §6–7) e indicadores calculados SOBRE ele.
 *
 * Puro: nada aqui toca banco. Quem coleta os pedaços (posição da dívida,
 * KPIs da obra, NOI, unidades, documentos) é `services/creditRoomService.ts`;
 * este módulo só congela o que recebeu e faz as contas do PRD §41–53.
 *
 * Duas regras que o desenho inteiro respeita:
 *
 *   · "Dado ausente ≠ zero." LTV sem garantia, LTC sem custo, DSCR sem fluxo
 *     elegível devolvem `null`, e a tela mostra "—". Um zero aqui viraria
 *     "LTV 0% — operação sem risco" na frente do banco.
 *
 *   · R8: só entra no DSCR o fluxo que a OPERAÇÃO marcou como elegível
 *     (`eligible_flows`). O DSCR global do módulo Dívida não serve — cada
 *     banco aceita uma base diferente, e é isso que se negocia.
 *
 * Plano: docs/planos/2026-09-07-portal-credito-credit-room.md (item 3)
 */

import { round2 } from './financialMath';

export const CREDIT_ROOM_SNAPSHOT_SCHEMA = 1 as const;

// ── Tipos que a operação carrega ─────────────────────────────────────────────

export interface CreditRoomEligibleFlows {
    /** NOI do portfólio de renda (PRD §35). */
    noi: boolean;
    /** Recebíveis de vendas (PRD §25). Sem fonte nesta versão do MVP. */
    receivables: boolean;
    /** Geração operacional de caixa (PRD §41). Sem fonte nesta versão do MVP. */
    operating_cash: boolean;
}

/** PRD §51 — os tipos de garantia. */
export type CreditRoomGuaranteeKind =
    | 'IMOVEL' | 'ALIENACAO_FIDUCIARIA' | 'HIPOTECA' | 'RECEBIVEIS' | 'QUOTAS'
    | 'AVAL' | 'FIANCA' | 'CONTA_VINCULADA' | 'APLICACAO_FINANCEIRA' | 'ESTOQUE' | 'OUTRA';

export interface CreditRoomGuarantee {
    kind: CreditRoomGuaranteeKind;
    description?: string;
    /** Valor bruto (avaliação). */
    value: number;
    /** R9 — desconto que o banco aplica sobre o bruto. 0–100. */
    haircut_pct: number;
}

// ── Blocos do snapshot ───────────────────────────────────────────────────────
// Cada bloco leva `fonte` (de onde veio — PRD §96, proveniência) e
// `data_base` (R3). Bloco `null` = a operação não tem aquele vínculo, ou a
// fonte não respondeu; a diferença fica em `fontes_ausentes` dos indicadores.

interface BlocoBase {
    fonte: string;
    data_base: string;
}

export interface SnapshotOperacao {
    requested_amount: number;
    term_months: number | null;
    grace_months: number | null;
    modality: string | null;
    purpose: string | null;
    institution_name: string | null;
    eligible_flows: CreditRoomEligibleFlows;
    guarantees: CreditRoomGuarantee[];
    equity_committed: number;
    equity_contributed: number;
    /**
     * Serviço da NOVA dívida nos 12 primeiros meses do cronograma da proposta
     * vinculada (`debt_contract_id`). `null` quando não há proposta com
     * cronograma — e aí o DSCR pós-operação também é `null`, de propósito:
     * estimar por `valor ÷ prazo` ignoraria juros e carência.
     */
    novo_servico_12m: number | null;
}

export interface SnapshotDivida extends BlocoBase {
    divida_total: number;
    curto_prazo: number;
    longo_prazo: number;
    encargos_a_pagar: number;
    servico_90: number;
    servico_365: number;
    vencido: number;
    custo_medio_mensal: number;
    prazo_medio_meses: number;
    n_contratos: number;
    n_instituicoes: number;
}

export interface SnapshotObra extends BlocoBase {
    project_id: string;
    project_name: string;
    /** Σ qty·preço·(1+bdi/100) — a fórmula canônica de CentralObra. */
    orcado: number;
    contratado_custo: number;
    pago: number;
    a_pagar: number;
    vencido_pagar: number;
    /** % físico pelo diário de obra; `null` sem RDO. */
    avanco_fisico_pct: number | null;
}

export interface SnapshotVendas extends BlocoBase {
    unidades_total: number;
    vendidas: number;
    permutadas: number;
    reservadas: number;
    disponiveis: number;
    vgv_total: number;
    vgv_vendido: number;
    vgv_disponivel: number;
    /** `null` quando não há unidade com preço. */
    pct_vendido: number | null;
}

export interface SnapshotPortfolio extends BlocoBase {
    /**
     * R7 do PRD: a receita aqui é CONTRATADA × meses, não recebida. O rótulo
     * vai junto porque a tela precisa dizer isso ao banco, não esconder.
     */
    base: 'CONTRATADA';
    janela_meses: number;
    receita_periodo: number;
    despesa_periodo: number;
    noi_periodo: number;
    noi_mensal: number;
    /**
     * NOI ÷ receita, **em percentual** (99.62, não 0.9962).
     *
     * O sufixo `_pct` não é enfeite: `rentalNoiService` devolve os dois como
     * FRAÇÃO, e a primeira versão disto os congelou crus. A tela mostrou
     * "Margem NOI 1%" para uma carteira de 99,6% — número plausível o
     * bastante para ninguém desconfiar, na frente de um banco. Achado no
     * passeio de 07/09, não em teste.
     */
    margem_pct: number | null;
    /** NOI anualizado ÷ patrimônio, **em percentual**. Mesma história. */
    cap_rate_pct: number | null;
}

/**
 * Aging de recebíveis (PRD §25).
 *
 * As faixas são do PRD e a régua é a data-base da versão, não "hoje": um
 * snapshot reaberto em dezembro precisa mostrar o aging de setembro, senão
 * deixa de ser snapshot.
 */
export interface SnapshotRecebiveis extends BlocoBase {
    /**
     * De onde vieram estas parcelas. **Não é detalhe de implementação.**
     *
     * A fonte (`vw_receivables`) tem `project_id`, mas medido em 07/09 apenas
     * **1 das 362 linhas** o traz preenchido. Recortar pela obra do room
     * mostraria "R$ 0,00 a receber" para uma carteira real de 344 parcelas em
     * aberto — e o banco leria como ausência de recebíveis o que é ausência de
     * vínculo no cadastro. Enquanto isso não mudar na origem, o escopo é a
     * organização, e o rótulo viaja com o número para a tela poder dizer qual
     * dos dois o leitor está vendo.
     */
    escopo: 'OBRA' | 'ORGANIZACAO';
    /** Parcelas em aberto: nem recebidas, nem canceladas. */
    a_vencer: number;
    vencido_1_30: number;
    vencido_31_60: number;
    vencido_61_90: number;
    vencido_90_mais: number;
    total_em_aberto: number;
    /** Soma do que já foi recebido — separado do em aberto (R6 do PRD). */
    recebido: number;
    /** Vencido ÷ total em aberto, em %. `null` sem recebível em aberto. */
    inadimplencia_pct: number | null;
    n_parcelas_abertas: number;
    n_parcelas_vencidas: number;
}

/**
 * EAC (PRD §22). Mora em bloco próprio, e não dentro de `obra`, porque
 * depende de uma fonte a mais: o vínculo `contract_items.budget_item_id`. Sem
 * ele o bloco é `null`, e a obra continua aparecendo — a ausência de um não
 * pode apagar o outro.
 */
export interface SnapshotEac extends BlocoBase {
    orcado: number;
    contratado: number;
    orcado_dos_contratados: number;
    a_contratar: number;
    /** Contratado ÷ orçado dos mesmos itens. `null` sem nada contratado. */
    fator: number | null;
    eac: number | null;
    desvio_pct: number | null;
    /** Contratado sem item de orçamento correspondente — fora do fator. */
    contratado_sem_orcamento: number;
    /**
     * Soma de `contracts.current_value` dos mesmos contratos. Diverge de
     * `contratado` (que soma itens) sempre que o contrato vale mais do que
     * suas linhas detalham — medido em 07/09: 466.622,84 contra 340.882,42.
     */
    contratado_cabecalho: number;
    /** `contratado ÷ contratado_cabecalho`. Abaixo de 100%, o EAC fala por
     *  uma parte do contratado, e a tela tem de dizer por qual parte. */
    cobertura_pct: number | null;
    /** Projetos de onde o orçamento veio — a obra e/ou o orçamento-gêmeo. */
    origens: { id: string; name: string }[];
}

/**
 * Quadro de Fontes e Usos (PRD §47).
 *
 * O que o banco checa não são as linhas, é o **fechamento**: Σ fontes = Σ usos.
 * Um quadro que não fecha é uma operação sem resposta para "de onde sai o resto",
 * e por isso `diferenca` é campo de primeira classe aqui em vez de conta feita
 * na tela — congelado, ele fica igual para os dois lados da mesa.
 */
export interface SnapshotFontesUsos extends BlocoBase {
    fontes: { label: string; kind: string; amount: number }[];
    usos: { label: string; kind: string; amount: number }[];
    total_fontes: number;
    total_usos: number;
    /** Fontes − usos. Positivo sobra, negativo falta. Zero = fecha. */
    diferenca: number;
    fecha: boolean;
}

export interface SnapshotEmpreendimento extends BlocoBase {
    id: string;
    name: string;
    tipo: string | null;
    spe_razao_social: string | null;
    spe_cnpj: string | null;
    cidade: string | null;
    uf: string | null;
    terreno_area: number | null;
    vgv_total: number | null;
}

export interface CreditRoomSnapshot {
    schema: typeof CREDIT_ROOM_SNAPSHOT_SCHEMA;
    data_base: string;
    operacao: SnapshotOperacao;
    empreendimento: SnapshotEmpreendimento | null;
    divida: SnapshotDivida | null;
    obra: SnapshotObra | null;
    vendas: SnapshotVendas | null;
    portfolio: SnapshotPortfolio | null;
    recebiveis: SnapshotRecebiveis | null;
    eac: SnapshotEac | null;
    fontes_usos: SnapshotFontesUsos | null;
    documentos: { version_ids: string[] };
}

// ── Indicadores (PRD §42, §48–50, §53) ───────────────────────────────────────

export interface CreditRoomIndicators {
    divida_atual: number | null;
    /** Dívida atual + valor solicitado. */
    divida_pos: number | null;

    /** Custo total do empreendimento = orçado da obra. */
    custo_total: number | null;
    ltc_atual: number | null;
    ltc_pos: number | null;

    garantias_brutas: number | null;
    /** Σ valor × (1 − haircut). */
    garantias_elegiveis: number | null;
    ltv_atual: number | null;
    ltv_pos: number | null;
    /** Garantias elegíveis ÷ dívida. */
    cobertura_atual: number | null;
    cobertura_pos: number | null;

    /** Equity aportado ÷ custo total. */
    equity_pct: number | null;
    equity_previsto_pct: number | null;

    /** Só o que `eligible_flows` marcou E tem fonte no snapshot. */
    fluxo_elegivel_anual: number | null;
    servico_atual_anual: number | null;
    servico_pos_anual: number | null;
    dscr_atual: number | null;
    dscr_pos: number | null;

    pct_vendido: number | null;

    /** Fluxos marcados como elegíveis sem fonte nesta versão — a tela avisa. */
    fontes_ausentes: string[];
}

// ── Entradas do builder ──────────────────────────────────────────────────────
// Estruturais de propósito: o service passa os objetos dos outros módulos
// (DebtPosition, OpuraObraKpis, RentalNoiMetrics…) sem este arquivo importar
// nada de `services/`.

export interface SnapshotInputs {
    dataBase: string;
    operacao: {
        requestedAmount: number;
        termMonths?: number | null;
        graceMonths?: number | null;
        modality?: string | null;
        purpose?: string | null;
        institutionName?: string | null;
        eligibleFlows: CreditRoomEligibleFlows;
        guarantees: CreditRoomGuarantee[];
        equityCommitted: number;
        equityContributed: number;
        fundingSources?: { id: string; label: string; kind: string; amount: number }[];
        fundingUses?: { id: string; label: string; kind: string; amount: number }[];
    };
    novoServico12m: number | null;
    empreendimento?: {
        id: string;
        name: string;
        tipo?: string | null;
        spe_razao_social?: string | null;
        spe_cnpj?: string | null;
        endereco_city?: string | null;
        endereco_state?: string | null;
        terreno_area?: number | null;
        vgv_total?: number | null;
    } | null;
    divida?: {
        dataBase: string;
        dividaTotal: number;
        curtoPrazo: number;
        longoPrazo: number;
        encargosAPagar: number;
        servico90: number;
        servico365: number;
        vencido: number;
        custoMedioMensal: number;
        prazoMedioMeses: number;
        nContratos: number;
        nInstituicoes: number;
    } | null;
    obra?: {
        projectId: string;
        projectName: string;
        orcado: number;
        contratadoCusto: number;
        pago: number;
        aPagar: number;
        vencidoPagar: number;
        avancoFisicoPct: number | null;
    } | null;
    unidades?: { status: string; price?: number | null }[] | null;
    /**
     * Parcelas de venda como vêm de `deal_installments`. `settlement_status`
     * 'RECEBIDA' entra em `recebido`; 'CANCELADA' é descartada; o resto é
     * carteira em aberto e vai para as faixas.
     */
    recebiveis?: {
        escopo: 'OBRA' | 'ORGANIZACAO';
        parcelas: { dueDate: string; amount: number; settlementStatus: string }[];
    } | null;
    portfolio?: {
        janelaMeses: number;
        receita: number;
        despesa: number;
        noi: number;
        margem: number | null;
        capRate: number | null;
    } | null;
    documentVersionIds: string[];
    eac?: {
        orcado: number; contratado: number; orcadoDosContratados: number;
        aContratar: number; fator: number | null; eac: number | null;
        desvioPct: number | null; contratadosSemOrcamento: number;
        contratadoCabecalho: number; coberturaPct: number | null;
        origens: { id: string; name: string }[];
    } | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Razão em %, ou `null` quando não há como dividir. Nunca zero por falta de dado. */
export const ratioPct = (num: number | null | undefined, den: number | null | undefined): number | null => {
    if (num == null || den == null || !(den > 0)) return null;
    return round2((num / den) * 100);
};

/** Razão pura (x), com 2 casas, ou `null`. */
export const ratio = (num: number | null | undefined, den: number | null | undefined): number | null => {
    if (num == null || den == null || !(den > 0)) return null;
    return round2(num / den);
};

const n = (v: number | null | undefined): number => (v == null || Number.isNaN(v) ? 0 : v);

/**
 * Orçado da obra — a mesma fórmula de `CentralObra.calcOrcado`
 * (Σ qty·preço·(1+bdi/100), bdi do item caindo para o das configurações).
 * Copiada e não importada porque lá ela é local ao componente.
 */
export const orcadoDoOrcamento = (
    budget: { quantity?: number; bdi?: number; sinapiItem?: { price?: number } }[] | null | undefined,
    settingsBdi: number | null | undefined,
): number => {
    const bdiPadrao = settingsBdi ?? 0;
    return (Array.isArray(budget) ? budget : []).reduce((acc, item) => {
        const price = item.sinapiItem?.price || 0;
        const qty = item.quantity || 0;
        const bdi = item.bdi ?? bdiPadrao;
        return acc + qty * price * (1 + bdi / 100);
    }, 0);
};

/**
 * Dias de atraso de uma parcela em relação à data-base. Negativo ou zero = a
 * vencer.
 *
 * Compara as strings `YYYY-MM-DD` em vez de construir `Date`: `new Date('2026-09-07')`
 * é lido como UTC e retrocede um dia em UTC-3 — o mesmo bug de fuso que já
 * mordeu o cronograma neste projeto. A conta em dias usa `Date.UTC`, que não
 * tem fuso.
 */
export const diasDeAtraso = (dueDate: string, dataBase: string): number => {
    const ms = (d: string) => {
        const [y, m, dia] = d.slice(0, 10).split('-').map(Number);
        return Date.UTC(y, m - 1, dia);
    };
    return Math.round((ms(dataBase) - ms(dueDate)) / 86_400_000);
};

/** Serviço da nova dívida: soma das N primeiras parcelas (total) do cronograma. */
export const servicoPrimeirosMeses = (
    parcelas: { total: number }[],
    meses = 12,
): number | null => {
    if (!parcelas.length) return null;
    return round2(parcelas.slice(0, meses).reduce((a, p) => a + n(p.total), 0));
};

// ── Builder ──────────────────────────────────────────────────────────────────

/**
 * Congela os pedaços recebidos num snapshot. Copia por valor (`structuredClone`
 * nos arrays/objetos) para que mutar a entrada depois NÃO altere o que foi
 * congelado — R2 vale já em memória, antes de chegar ao banco.
 */
export function buildSnapshot(inputs: SnapshotInputs): CreditRoomSnapshot {
    const op = inputs.operacao;

    const vendas = ((): SnapshotVendas | null => {
        const units = inputs.unidades;
        if (!units) return null;
        const count = (s: string) => units.filter(u => u.status === s).length;
        const vgv = (pred: (u: { status: string }) => boolean) =>
            round2(units.filter(pred).reduce((a, u) => a + n(u.price), 0));
        const vgvTotal = vgv(() => true);
        const vgvVendido = vgv(u => u.status === 'VENDIDO' || u.status === 'PERMUTADO');
        return {
            fonte: 'empreendimento_units',
            data_base: inputs.dataBase,
            unidades_total: units.length,
            vendidas: count('VENDIDO'),
            permutadas: count('PERMUTADO'),
            reservadas: count('RESERVADO'),
            disponiveis: count('DISPONIVEL'),
            vgv_total: vgvTotal,
            vgv_vendido: vgvVendido,
            vgv_disponivel: vgv(u => u.status === 'DISPONIVEL'),
            pct_vendido: ratioPct(vgvVendido, vgvTotal),
        };
    })();

    const portfolio = ((): SnapshotPortfolio | null => {
        const p = inputs.portfolio;
        if (!p) return null;
        const meses = p.janelaMeses > 0 ? p.janelaMeses : 1;
        return {
            fonte: 'rentalNoiService',
            data_base: inputs.dataBase,
            base: 'CONTRATADA',
            janela_meses: meses,
            receita_periodo: round2(n(p.receita)),
            despesa_periodo: round2(n(p.despesa)),
            noi_periodo: round2(n(p.noi)),
            noi_mensal: round2(n(p.noi) / meses),
            // × 100 aqui, uma vez, para o snapshot já nascer na unidade que a
            // tela usa — quem lê um snapshot congelado não tem como perguntar
            // "isto é fração ou porcentagem?".
            margem_pct: p.margem == null ? null : round2(p.margem * 100),
            cap_rate_pct: p.capRate == null ? null : round2(p.capRate * 100),
        };
    })();

    const recebiveis = ((): SnapshotRecebiveis | null => {
        const rs = inputs.recebiveis;
        if (!rs) return null;
        const vivas = rs.parcelas.filter(r => r.settlementStatus !== 'CANCELADA');
        const recebido = round2(vivas.filter(r => r.settlementStatus === 'RECEBIDA')
            .reduce((a, r) => a + n(r.amount), 0));
        const abertas = vivas.filter(r => r.settlementStatus !== 'RECEBIDA');

        const faixa = { a_vencer: 0, v1: 0, v2: 0, v3: 0, v4: 0 };
        let nVencidas = 0;
        for (const r of abertas) {
            const dias = diasDeAtraso(r.dueDate, inputs.dataBase);
            const v = n(r.amount);
            if (dias <= 0) { faixa.a_vencer += v; continue; }
            nVencidas += 1;
            if (dias <= 30) faixa.v1 += v;
            else if (dias <= 60) faixa.v2 += v;
            else if (dias <= 90) faixa.v3 += v;
            else faixa.v4 += v;
        }
        const total = round2(faixa.a_vencer + faixa.v1 + faixa.v2 + faixa.v3 + faixa.v4);
        const vencido = round2(faixa.v1 + faixa.v2 + faixa.v3 + faixa.v4);
        return {
            fonte: 'deal_installments',
            data_base: inputs.dataBase,
            escopo: rs.escopo,
            a_vencer: round2(faixa.a_vencer),
            vencido_1_30: round2(faixa.v1),
            vencido_31_60: round2(faixa.v2),
            vencido_61_90: round2(faixa.v3),
            vencido_90_mais: round2(faixa.v4),
            total_em_aberto: total,
            recebido,
            inadimplencia_pct: ratioPct(vencido, total),
            n_parcelas_abertas: abertas.length,
            n_parcelas_vencidas: nVencidas,
        };
    })();

    const eacBloco = ((): SnapshotEac | null => {
        const e = inputs.eac;
        if (!e || e.eac == null) return null;
        return {
            fonte: 'projects.budget + contract_items.budget_item_id',
            data_base: inputs.dataBase,
            orcado: e.orcado,
            contratado: e.contratado,
            orcado_dos_contratados: e.orcadoDosContratados,
            a_contratar: e.aContratar,
            fator: e.fator,
            eac: e.eac,
            desvio_pct: e.desvioPct,
            contratado_sem_orcamento: e.contratadosSemOrcamento,
            contratado_cabecalho: e.contratadoCabecalho,
            cobertura_pct: e.coberturaPct,
            origens: e.origens,
        };
    })();

    const fontesUsos = ((): SnapshotFontesUsos | null => {
        const fs = inputs.operacao.fundingSources ?? [];
        const us = inputs.operacao.fundingUses ?? [];
        if (!fs.length && !us.length) return null;
        const limpar = (xs: typeof fs) =>
            xs.map(e => ({ label: e.label, kind: e.kind, amount: Number(e.amount) || 0 }));
        const somar = (xs: typeof fs) => round2(xs.reduce((a, e) => a + (Number(e.amount) || 0), 0));
        const totalFontes = somar(fs);
        const totalUsos = somar(us);
        const diferenca = round2(totalFontes - totalUsos);
        return {
            fonte: 'credit_rooms.funding_sources / funding_uses',
            data_base: inputs.dataBase,
            fontes: limpar(fs),
            usos: limpar(us),
            total_fontes: totalFontes,
            total_usos: totalUsos,
            diferenca,
            // Tolerância de um centavo: o quadro é digitado à mão e reprovar
            // por arredondamento treinaria o usuário a ignorar o alerta.
            fecha: Math.abs(diferenca) < 0.01,
        };
    })();

    const d = inputs.divida;
    const o = inputs.obra;
    const e = inputs.empreendimento;

    return {
        schema: CREDIT_ROOM_SNAPSHOT_SCHEMA,
        data_base: inputs.dataBase,
        operacao: {
            requested_amount: round2(n(op.requestedAmount)),
            term_months: op.termMonths ?? null,
            grace_months: op.graceMonths ?? null,
            modality: op.modality ?? null,
            purpose: op.purpose ?? null,
            institution_name: op.institutionName ?? null,
            eligible_flows: { ...op.eligibleFlows },
            guarantees: structuredClone(op.guarantees ?? []),
            equity_committed: round2(n(op.equityCommitted)),
            equity_contributed: round2(n(op.equityContributed)),
            novo_servico_12m: inputs.novoServico12m == null ? null : round2(inputs.novoServico12m),
        },
        empreendimento: e ? {
            fonte: 'empreendimentos',
            data_base: inputs.dataBase,
            id: e.id,
            name: e.name,
            tipo: e.tipo ?? null,
            spe_razao_social: e.spe_razao_social ?? null,
            spe_cnpj: e.spe_cnpj ?? null,
            cidade: e.endereco_city ?? null,
            uf: e.endereco_state ?? null,
            terreno_area: e.terreno_area ?? null,
            vgv_total: e.vgv_total ?? null,
        } : null,
        divida: d ? {
            fonte: 'fn_debt_position',
            data_base: d.dataBase,
            divida_total: round2(n(d.dividaTotal)),
            curto_prazo: round2(n(d.curtoPrazo)),
            longo_prazo: round2(n(d.longoPrazo)),
            encargos_a_pagar: round2(n(d.encargosAPagar)),
            servico_90: round2(n(d.servico90)),
            servico_365: round2(n(d.servico365)),
            vencido: round2(n(d.vencido)),
            custo_medio_mensal: n(d.custoMedioMensal),
            prazo_medio_meses: n(d.prazoMedioMeses),
            n_contratos: n(d.nContratos),
            n_instituicoes: n(d.nInstituicoes),
        } : null,
        obra: o ? {
            fonte: 'fn_opura_obra_kpis + projects.budget',
            data_base: inputs.dataBase,
            project_id: o.projectId,
            project_name: o.projectName,
            orcado: round2(n(o.orcado)),
            contratado_custo: round2(n(o.contratadoCusto)),
            pago: round2(n(o.pago)),
            a_pagar: round2(n(o.aPagar)),
            vencido_pagar: round2(n(o.vencidoPagar)),
            avanco_fisico_pct: o.avancoFisicoPct == null ? null : round2(o.avancoFisicoPct),
        } : null,
        vendas,
        portfolio,
        recebiveis,
        eac: eacBloco,
        fontes_usos: fontesUsos,
        documentos: { version_ids: [...inputs.documentVersionIds] },
    };
}

// ── Indicadores ──────────────────────────────────────────────────────────────

export function computeIndicators(s: CreditRoomSnapshot): CreditRoomIndicators {
    const op = s.operacao;
    const dividaAtual = s.divida ? s.divida.divida_total : null;
    const dividaPos = dividaAtual == null ? null : round2(dividaAtual + op.requested_amount);

    const custoTotal = s.obra && s.obra.orcado > 0 ? s.obra.orcado : null;

    const garantiasBrutas = op.guarantees.length
        ? round2(op.guarantees.reduce((a, g) => a + n(g.value), 0))
        : null;
    const garantiasElegiveis = op.guarantees.length
        ? round2(op.guarantees.reduce((a, g) => {
            const haircut = Math.min(100, Math.max(0, n(g.haircut_pct)));
            return a + n(g.value) * (1 - haircut / 100);
        }, 0))
        : null;

    // R8 — fluxo elegível. Só soma o que foi marcado E tem fonte no snapshot.
    const ausentes: string[] = [];
    let fluxo: number | null = null;
    if (op.eligible_flows.noi) {
        if (s.portfolio) fluxo = n(fluxo) + s.portfolio.noi_mensal * 12;
        else ausentes.push('noi');
    }
    if (op.eligible_flows.receivables) ausentes.push('receivables');
    if (op.eligible_flows.operating_cash) ausentes.push('operating_cash');
    if (fluxo != null) fluxo = round2(fluxo);

    const servicoAtual = s.divida ? s.divida.servico_365 : null;
    const servicoPos = servicoAtual == null || op.novo_servico_12m == null
        ? null
        : round2(servicoAtual + op.novo_servico_12m);

    return {
        divida_atual: dividaAtual,
        divida_pos: dividaPos,

        custo_total: custoTotal,
        ltc_atual: ratioPct(dividaAtual, custoTotal),
        ltc_pos: ratioPct(dividaPos, custoTotal),

        garantias_brutas: garantiasBrutas,
        garantias_elegiveis: garantiasElegiveis,
        ltv_atual: ratioPct(dividaAtual, garantiasBrutas),
        ltv_pos: ratioPct(dividaPos, garantiasBrutas),
        cobertura_atual: ratio(garantiasElegiveis, dividaAtual),
        cobertura_pos: ratio(garantiasElegiveis, dividaPos),

        equity_pct: ratioPct(op.equity_contributed, custoTotal),
        equity_previsto_pct: ratioPct(op.equity_committed, custoTotal),

        fluxo_elegivel_anual: fluxo,
        servico_atual_anual: servicoAtual,
        servico_pos_anual: servicoPos,
        dscr_atual: ratio(fluxo, servicoAtual),
        dscr_pos: ratio(fluxo, servicoPos),

        pct_vendido: s.vendas ? s.vendas.pct_vendido : null,

        fontes_ausentes: ausentes,
    };
}

/** Rótulos dos fluxos elegíveis (para o aviso de `fontes_ausentes`). */
export const ELIGIBLE_FLOW_PT: Record<keyof CreditRoomEligibleFlows, string> = {
    noi: 'NOI do portfólio de renda',
    receivables: 'Recebíveis de vendas',
    operating_cash: 'Geração operacional de caixa',
};

export const GUARANTEE_KIND_PT: Record<CreditRoomGuaranteeKind, string> = {
    IMOVEL: 'Imóvel',
    ALIENACAO_FIDUCIARIA: 'Alienação fiduciária',
    HIPOTECA: 'Hipoteca',
    RECEBIVEIS: 'Recebíveis',
    QUOTAS: 'Quotas',
    AVAL: 'Aval',
    FIANCA: 'Fiança',
    CONTA_VINCULADA: 'Conta vinculada',
    APLICACAO_FINANCEIRA: 'Aplicação financeira',
    ESTOQUE: 'Estoque',
    OUTRA: 'Outra',
};
