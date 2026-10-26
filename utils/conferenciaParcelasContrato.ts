/**
 * Contrato › Financeiro › Parcelas — as parcelas batem com o valor do contrato?
 * Plano: docs/planos/2026-10-26-contrato-parcelas-conferencia-e-gerador.md.
 *
 * Regras puras, sem rede. O valor que as parcelas devem igualar é o VALOR ATUAL
 * (original + aditivos aprovados + reajustes) — decisão do usuário, 26/10/2026.
 * O caso que originou: CTS-042-0001, Atual R$ 2.850, parcelas R$ 2.700 — o
 * aditivo AD-001 (+R$ 150) subiu o valor e não virou parcela.
 *
 * As ações de correção devolvem o CRONOGRAMA novo (`payment_schedule`) e os ids
 * das parcelas abertas que ele reescreve: quem grava é o serviço, pela
 * sincronização que já existe (um caminho de gravação só).
 */
import type { ContractInstallment } from '../types/contracts';
import { parcelaBaixada } from './contratoParcelaVariavel';
import { gerarCronogramaContrato, type ParametrosCronograma } from './contractInstallments';

export interface ContratoConferido {
    is_recurring?: boolean | null;
    payment_term_type?: 'Vista' | 'Parcelado' | null;
    original_value?: number | null;
    current_value?: number | null;
}

export interface ParcelaConferida {
    id: string;
    source_system: string;
    reference_id: string | null;
    status: string;
    business_status?: string | null;
    amount: number;
    original_amount?: number | null;
}

export interface AditivoConferido {
    number: string;
    value_impact: number;
    status: string;
}

export type SituacaoDaConferencia = 'confere' | 'faltam' | 'excedem';

export interface Conferencia {
    /** Só contrato À Vista/Parcelado: recorrente e medição não têm total a casar. */
    aplica: boolean;
    valorContrato: number;
    somaParcelas: number;
    /** Contrato − parcelas: > 0 faltam parcelas; < 0 as parcelas excedem. */
    saldo: number;
    situacao: SituacaoDaConferencia;
    /** Aditivos aprovados com valor quando o ORIGINAL bate com as parcelas — a causa provável. */
    aditivosSemParcela: { numero: string; valor: number }[];
}

const TOLERANCIA = 0.01;
const dois = (n: number) => Math.round(n * 100) / 100;
const SOURCES_COM_TOTAL = ['CONTRACT_PARCELADO', 'CONTRACT_AVISTA'];

/** Valor bruto da parcela (antes do desconto da linha — o desconto não muda o acordado). */
const bruto = (p: ParcelaConferida) => Number(p.original_amount ?? p.amount ?? 0);
const ativa = (p: ParcelaConferida) => p.status !== 'CANCELLED' && p.business_status !== 'CANCELADO';

export function conferirParcelas(
    contrato: ContratoConferido,
    parcelas: ParcelaConferida[],
    aditivos: AditivoConferido[],
): Conferencia {
    const aplica = !contrato.is_recurring && !parcelas.some(p => p.source_system === 'CONTRACT_MEASUREMENT');
    const valorContrato = dois(Number(contrato.current_value ?? contrato.original_value ?? 0));
    const somaParcelas = dois(parcelas
        .filter(p => SOURCES_COM_TOTAL.includes(p.source_system) && ativa(p))
        .reduce((s, p) => s + bruto(p), 0));
    const bruta = dois(valorContrato - somaParcelas);
    const saldo = Math.abs(bruta) < TOLERANCIA ? 0 : bruta;
    const situacao: SituacaoDaConferencia = saldo === 0 ? 'confere' : saldo > 0 ? 'faltam' : 'excedem';

    const original = dois(Number(contrato.original_value ?? 0));
    const aditivosSemParcela = saldo !== 0 && Math.abs(original - somaParcelas) < TOLERANCIA
        ? aditivos
            .filter(a => a.status === 'Aprovado' && Number(a.value_impact) !== 0)
            .map(a => ({ numero: a.number, valor: dois(Number(a.value_impact)) }))
        : [];

    return { aplica, valorContrato, somaParcelas, saldo, situacao, aditivosSemParcela };
}

/** "Lançar uma parcela com a diferença": o complemento vai no fim do cronograma. */
export function parcelaComplementar(cronograma: ContractInstallment[], saldo: number, vencimento: string): ContractInstallment[] {
    if (!(saldo > 0)) throw new Error('Só há complemento a lançar quando faltam parcelas.');
    return [...cronograma, { date: vencimento, value: dois(saldo) }];
}

export type PlanoDeCronograma = { cronograma: ContractInstallment[]; reescritas: string[] } | { motivo: string };

/** Posição `n` (1-based) da parcela no cronograma, pelo `:pN` da referência. */
const posicao = (p: ParcelaConferida): number | null => {
    const m = /:p(\d+)$/.exec(p.reference_id ?? '');
    return m ? Number(m[1]) : null;
};

/**
 * Pagas e abertas do cronograma parcelado. A sincronização casa parcela por
 * POSIÇÃO (`:pN`): remontar o cronograma com uma aberta ANTES de uma paga
 * trocaria as parcelas de lugar — por isso as pagas têm de formar um prefixo.
 */
function separar(parcelas: ParcelaConferida[], asaasEmCurso: Set<string>):
    { pagas: ParcelaConferida[]; abertas: ParcelaConferida[] } | { motivo: string } {
    const doCronograma = parcelas
        .filter(p => p.source_system === 'CONTRACT_PARCELADO' && ativa(p) && posicao(p) != null)
        .sort((a, b) => posicao(a)! - posicao(b)!);
    const pagas = doCronograma.filter(parcelaBaixada);
    const abertas = doCronograma.filter(p => !parcelaBaixada(p));
    const ultimaPaga = Math.max(0, ...pagas.map(p => posicao(p)!));
    if (abertas.some(p => posicao(p)! < ultimaPaga)) {
        return { motivo: 'Há parcela em aberto antes de uma paga — corrija pelo "Alterar valor" de cada parcela.' };
    }
    if (abertas.some(p => asaasEmCurso.has(p.id))) {
        return { motivo: 'Uma parcela em aberto tem pagamento Asaas em andamento — aguarde ou cancele o pagamento.' };
    }
    return { pagas, abertas };
}

/** "Distribuir a diferença entre as parcelas em aberto": partes iguais, centavos na última. */
export function planoDeDistribuicao(
    cronograma: ContractInstallment[],
    parcelas: ParcelaConferida[],
    saldo: number,
    asaasEmCurso: Set<string>,
): PlanoDeCronograma {
    const s = separar(parcelas, asaasEmCurso);
    if ('motivo' in s) return s;
    if (s.abertas.length === 0) return { motivo: 'Não há parcela em aberto para receber a diferença.' };
    if (s.abertas.some(p => posicao(p)! > cronograma.length)) {
        return { motivo: 'O cronograma do contrato está desatualizado em relação às parcelas — salve os Dados Gerais.' };
    }

    const n = s.abertas.length;
    const parte = Math.trunc((saldo / n) * 100) / 100;
    const sobra = dois(saldo - parte * n);
    const novo = cronograma.map(l => ({ ...l }));
    s.abertas.forEach((p, i) => {
        const idx = posicao(p)! - 1;
        novo[idx].value = dois(bruto(p) + parte + (i === n - 1 ? sobra : 0));
    });
    if (s.abertas.some(p => !(novo[posicao(p)! - 1].value > 0))) {
        return { motivo: 'A redução deixaria parcela zerada ou negativa — ajuste o valor do contrato ou cancele uma parcela.' };
    }
    return { cronograma: novo, reescritas: s.abertas.map(p => p.id) };
}

export type ParametrosDoGerador = Omit<ParametrosCronograma, 'total'>;

/**
 * "Gerar parcelas": as pagas ficam; o saldo (Valor Atual − pago) vira N parcelas
 * novas, que substituem as em aberto. À vista paga conta como pago e não entra
 * no cronograma (a sincronização do parcelado nunca apaga cobrança baixada).
 */
export function planoDoGerador(
    valorAtual: number,
    cronograma: ContractInstallment[],
    parcelas: ParcelaConferida[],
    gerador: ParametrosDoGerador,
    asaasEmCurso: Set<string>,
): PlanoDeCronograma {
    const s = separar(parcelas, asaasEmCurso);
    if ('motivo' in s) return s;
    if (parcelas.some(p => p.source_system === 'CONTRACT_AVISTA' && ativa(p) && !parcelaBaixada(p) && asaasEmCurso.has(p.id))) {
        return { motivo: 'A cobrança à vista tem pagamento Asaas em andamento — aguarde ou cancele o pagamento.' };
    }
    const pagoAvista = parcelas
        .filter(p => p.source_system === 'CONTRACT_AVISTA' && ativa(p) && parcelaBaixada(p))
        .reduce((t, p) => t + bruto(p), 0);
    const pago = dois(s.pagas.reduce((t, p) => t + bruto(p), 0) + pagoAvista);
    const base = dois(valorAtual - pago);
    if (!(base > 0)) return { motivo: 'O que já foi pago já cobre o valor do contrato — não há parcela a gerar.' };
    if (s.pagas.some(p => posicao(p)! > cronograma.length)) {
        return { motivo: 'O cronograma do contrato está desatualizado em relação às parcelas — salve os Dados Gerais.' };
    }

    const mantidas = s.pagas.map(p => cronograma[posicao(p)! - 1]);
    const novas = gerarCronogramaContrato({ ...gerador, total: base });
    return {
        cronograma: [...mantidas, ...novas],
        reescritas: [
            ...s.abertas.map(p => p.id),
            ...parcelas.filter(p => p.source_system === 'CONTRACT_AVISTA' && ativa(p) && !parcelaBaixada(p)).map(p => p.id),
        ],
    };
}
