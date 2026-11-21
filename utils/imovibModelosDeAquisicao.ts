/**
 * Modelos de aquisição do terreno, calculados PELO MOTOR do Imovib.
 * Plano: docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, item 1.4.
 *
 * Antes (components/investor/LandDealComparatorPanel + services/landDealComparatorService):
 * a diferença de custo do terreno ia inteira para o mês 0 e o VPL usava 1% a.m. fixo —
 * nem a TMA do estudo, nem as parcelas do terreno, nem a permuta sobre o VGV.
 * Agora cada modelo vira uma VARIANTE das premissas do estudo e roda computeImovibMath:
 *
 *  - compra direta    → custo do terreno = valor total; parcelas: entrada no mês da aquisição
 *                       e o saldo em N parcelas mensais corrigidas pela taxa;
 *  - permuta física   → terreno sem caixa; permuta física = valor das unidades ÷ VGV
 *                       (sem valor, unidades prometidas ÷ unidades do estudo);
 *  - permuta financeira → terreno sem caixa; permuta financeira = % do VGV, com o mínimo garantido;
 *  - opção de compra  → prêmio no mês da aquisição + exercício N meses depois;
 *  - sociedade        → terreno sem caixa; o proprietário recebe a % dele do LUCRO
 *                       (depois que o incorporador recuperou o que pôs — a regra das outras
 *                       fontes, utils/imovibFontes.ts).
 * Puro. Testes: __tests__/imovibModelosDeAquisicao.test.ts.
 */
import type { ImovibStudy, ImovibParcelaDoTerreno } from '../types';
import { computeImovibMath, calcularTirMensal, type ImovibMathResult } from './imovibMotor';
import { calcularIndicadores } from './imovibIndicadores';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';

export type TipoDeAquisicao = 'compra_direta' | 'permuta_fisica' | 'permuta_financeira' | 'opcao_compra' | 'sociedade';

export const ROTULO_DA_AQUISICAO: Record<TipoDeAquisicao, string> = {
    compra_direta: 'Compra direta',
    permuta_fisica: 'Permuta física',
    permuta_financeira: 'Permuta financeira',
    opcao_compra: 'Opção de compra',
    sociedade: 'Sociedade com o proprietário',
};

/** Premissas por tipo — só as do tipo escolhido valem. */
export interface PremissasDaAquisicao {
    valor_total?: number | null;
    entrada?: number | null;
    num_parcelas?: number | null;
    taxa_correcao_mensal_pct?: number | null;
    unidades_prometidas?: number | null;
    valor_referencia_unidades?: number | null;
    percentual_sobre_vgv?: number | null;
    valor_minimo_garantido?: number | null;
    premio_opcao?: number | null;
    prazo_opcao_meses?: number | null;
    valor_exercicio?: number | null;
    participacao_pct?: number | null;
}

export interface ModeloDeAquisicao {
    id: string;
    name: string;
    deal_type: TipoDeAquisicao;
    premises_json: PremissasDaAquisicao;
}

export interface ResultadoDoModelo {
    /** O que muda nas premissas do estudo (o mesmo que "Usar no estudo" grava). */
    premissas: Pick<ImovibStudy, 'land_cost' | 'land_payment_schedule' | 'swap_physical_percent' | 'swap_financial_percent'>;
    vpl: number;
    /** % a.a.; null sem TIR. */
    tirAnual: number | null;
    lucro: number;
    exposicaoMaxima: number;
    /** Desembolso de terreno em caixa (soma das parcelas). */
    caixaDoTerreno: number;
    /** Sociedade: o que vai ao proprietário (parte do lucro). */
    parteDoProprietario: number;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const ROUND = (v: number) => Math.round(v * 1e6) / 1e6;

/** Premissas do estudo para o modelo (uma variante: o estudo gravado não muda). */
export function premissasDoModelo(study: ImovibStudy, m: ModeloDeAquisicao, base: ImovibMathResult = computeImovibMath(study)): ResultadoDoModelo['premissas'] {
    const p = m.premises_json ?? {};
    const aquisicao = Math.max(1, Math.round(n(study.acquisition_month ?? IMOVIB_DEFAULTS.acquisition_month) || 1));
    const semCaixa = { land_cost: 0, land_payment_schedule: null, swap_physical_percent: 0, swap_financial_percent: 0 };
    switch (m.deal_type) {
        case 'compra_direta': {
            const total = n(p.valor_total);
            if (!(total > 0)) return { ...semCaixa };
            const entrada = Math.min(total, Math.max(0, n(p.entrada)));
            const nParcelas = Math.max(0, Math.round(n(p.num_parcelas)));
            const taxa = n(p.taxa_correcao_mensal_pct) / 100;
            const saldo = total - entrada;
            const parcelas: ImovibParcelaDoTerreno[] = [];
            if (entrada > 0 || nParcelas === 0) parcelas.push({ month: aquisicao, percent: ROUND(((nParcelas === 0 ? total : entrada) / total) * 100) });
            for (let k = 1; k <= nParcelas; k++) {
                // Parcela k corrigida k meses: a soma passa de 100% quando há correção (o motor usa como está).
                parcelas.push({ month: aquisicao + k, percent: ROUND(((saldo / nParcelas) * Math.pow(1 + taxa, k) / total) * 100) });
            }
            return { land_cost: total, land_payment_schedule: parcelas, swap_physical_percent: 0, swap_financial_percent: 0 };
        }
        case 'permuta_fisica': {
            const vgv = base.vgvTotal;
            const valor = n(p.valor_referencia_unidades);
            const unidades = n(p.unidades_prometidas);
            const totalDeUnidades = base.produto?.unidadesVendaveis ?? 0;
            const pct = valor > 0 && vgv > 0 ? (valor / vgv) * 100 : unidades > 0 && totalDeUnidades > 0 ? (unidades / totalDeUnidades) * 100 : 0;
            return { ...semCaixa, swap_physical_percent: ROUND(Math.min(100, pct)) };
        }
        case 'permuta_financeira': {
            // A permuta financeira incide sobre o VGV depois da permuta física (o motor desconta nessa ordem).
            const vgvBase = base.vgvTotal;
            const pct = n(p.percentual_sobre_vgv);
            const minimo = n(p.valor_minimo_garantido);
            const pctDoMinimo = minimo > 0 && vgvBase > 0 ? (minimo / vgvBase) * 100 : 0;
            return { ...semCaixa, swap_financial_percent: ROUND(Math.min(100, Math.max(pct, pctDoMinimo))) };
        }
        case 'opcao_compra': {
            const premio = Math.max(0, n(p.premio_opcao));
            const exercicio = Math.max(0, n(p.valor_exercicio));
            const total = premio + exercicio;
            if (!(total > 0)) return { ...semCaixa };
            const prazo = Math.max(0, Math.round(n(p.prazo_opcao_meses)));
            const parcelas: ImovibParcelaDoTerreno[] = [];
            if (premio > 0) parcelas.push({ month: aquisicao, percent: ROUND((premio / total) * 100) });
            if (exercicio > 0) parcelas.push({ month: aquisicao + prazo, percent: ROUND((exercicio / total) * 100) });
            return { land_cost: total, land_payment_schedule: parcelas, swap_physical_percent: 0, swap_financial_percent: 0 };
        }
        case 'sociedade':
        default:
            return { ...semCaixa };
    }
}

/**
 * Fluxo do incorporador na sociedade: o proprietário leva `pct` de cada real de lucro —
 * o que o caixa acumulado sobe ACIMA de zero (antes disso é capital voltando).
 */
export function fluxoNaSociedade(net: number[], pct: number): { fluxo: number[]; parteDoProprietario: number } {
    const p = Math.max(0, Math.min(100, pct)) / 100;
    let acc = 0;
    let parte = 0;
    const fluxo = net.map(f => {
        const novo = acc + f;
        const lucroDoMes = Math.max(0, novo) - Math.max(0, acc);
        acc = novo;
        const dele = lucroDoMes > 0 ? lucroDoMes * p : 0;
        parte += dele;
        return f - dele;
    });
    return { fluxo, parteDoProprietario: parte };
}

const vplMensal = (taxa: number, fluxo: number[]) => fluxo.reduce((a, v, i) => a + v / Math.pow(1 + taxa, i), 0);

export function resultadoDoModelo(study: ImovibStudy, m: ModeloDeAquisicao, base: ImovibMathResult = computeImovibMath(study)): ResultadoDoModelo {
    const premissas = premissasDoModelo(study, m, base);
    const variante = { ...study, ...premissas } as ImovibStudy;
    const r = computeImovibMath(variante);
    const tma = n(study.discount_rate ?? IMOVIB_DEFAULTS.discount_rate);
    const ind = calcularIndicadores(r, tma);
    const caixaDoTerreno = n(premissas.land_cost) * (premissas.land_payment_schedule?.length
        ? premissas.land_payment_schedule.reduce((a, x) => a + n(x.percent), 0) / 100
        : 1);
    const exposicaoMaxima = Math.max(0, -r.maxExposure);
    if (m.deal_type !== 'sociedade') {
        return {
            premissas, vpl: r.vpl, tirAnual: Number.isFinite(r.annualIrr) ? r.annualIrr : null,
            lucro: ind.lucroLiquido, exposicaoMaxima, caixaDoTerreno, parteDoProprietario: 0,
        };
    }
    const { fluxo, parteDoProprietario } = fluxoNaSociedade(r.monthlyFlows.map(f => f.net), n(m.premises_json?.participacao_pct));
    const mensal = calcularTirMensal(fluxo).taxa;
    return {
        premissas,
        vpl: vplMensal(Math.pow(1 + tma / 100, 1 / 12) - 1, fluxo),
        tirAnual: Number.isFinite(mensal) ? (Math.pow(1 + mensal, 12) - 1) * 100 : null,
        lucro: ind.lucroLiquido - parteDoProprietario,
        exposicaoMaxima,
        caixaDoTerreno: 0,
        parteDoProprietario,
    };
}

/** O estudo como está, para a linha "Estudo atual" da comparação. */
export function resultadoDoEstudo(study: ImovibStudy, base: ImovibMathResult = computeImovibMath(study)): Omit<ResultadoDoModelo, 'premissas'> {
    const ind = calcularIndicadores(base, n(study.discount_rate ?? IMOVIB_DEFAULTS.discount_rate));
    const custo = n(study.land_cost);
    const parcelas = study.land_payment_schedule ?? [];
    return {
        vpl: base.vpl,
        tirAnual: Number.isFinite(base.annualIrr) ? base.annualIrr : null,
        lucro: ind.lucroLiquido,
        exposicaoMaxima: Math.max(0, -base.maxExposure),
        caixaDoTerreno: parcelas.length ? custo * parcelas.reduce((a, x) => a + n(x.percent), 0) / 100 : custo,
        parteDoProprietario: 0,
    };
}
