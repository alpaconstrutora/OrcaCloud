/**
 * Sequência de parcelas de contrato (Conciliação › Central).
 *
 * Um contrato de N parcelas gera N títulos que devem casar com N movimentos do
 * extrato. Ao longo do contrato o cliente pula um mês (FURO), paga atrasado, ou
 * paga duas parcelas juntas. Este util lê a SÉRIE inteira de cada contrato, na
 * ordem de vencimento, e aponta onde ela quebrou — e sugere "Conciliar juntas"
 * quando um movimento pendente do extrato = soma de parcelas abertas e seguidas.
 *
 * Puro: quem carrega os dados é `services/sequenciaParcelasService.ts`.
 * Baixado ≠ conferido: `status = CONCILIATED` é só "baixado" (Asaas, baixa manual…);
 * conferido no extrato é `bank_reconciled_at` (gravado só pela conciliação).
 */
import { groupTol, partyMatchesText } from '../services/reconciliationGroupService';

/** Folga, em dias, entre o vencimento e o banco (pagou até 5 dias depois = em dia). */
const TOLERANCIA_DIAS = 5;
/** O crédito que paga parcelas juntas pode vir até 10 dias antes da 1ª delas. */
const ANTECIPACAO_DIAS = 10;
/** …e até 120 dias depois (pagou 3 meses de uma vez). */
const ATRASO_MAX_JUNTAS_DIAS = 120;
const MAX_PARCELAS_JUNTAS = 4;

export interface VinculoNoExtrato {
    bank_transaction_id: string;
    /** Data do movimento no extrato (YYYY-MM-DD). */
    data: string;
    bank_account_id?: string | null;
}

export interface ParcelaDeContrato {
    id: string;
    contract_id: string;
    due_date: string;
    /** Valor que o banco deve mostrar: já é o `valor_esperado` (líquido do retido). */
    amount: number;
    direction: 'CREDIT' | 'DEBIT';
    status: string;
    business_status?: string | null;
    bank_reconciled_at?: string | null;
    payment_date?: string | null;
    reference_id?: string | null;
    party_name?: string | null;
    entity_name?: string | null;
    contrato?: { number?: string | null; title?: string | null; domain?: string | null; payment_account_id?: string | null } | null;
    vinculos: VinculoNoExtrato[];
}

export type SituacaoParcela =
    | 'conferida'
    | 'conferida_atrasada'
    | 'baixada_fora'
    | 'a_vencer'
    | 'sem_extrato'
    | 'furo'
    | 'vencida';

export interface ParcelaNaSerie extends ParcelaDeContrato {
    /** Posição na série (1..N), pela ordem de vencimento. */
    numero: number;
    situacao: SituacaoParcela;
    /** Data do (último) movimento do extrato que a conferiu. */
    dataBanco: string | null;
    /** Dias entre o vencimento e o banco (só conferida). */
    diasAtraso: number;
    /** O banco caiu num mês posterior ao do vencimento. */
    mesPosterior: boolean;
    /** Números das parcelas pagas junto com esta (mesma linha ou mesmo mês do banco). */
    juntoCom: number[];
}

export interface SerieDeParcelas {
    contractId: string;
    numeroContrato: string;
    titulo: string;
    dominio: string | null;
    parte: string;
    direction: 'CREDIT' | 'DEBIT';
    /** Já foi conferida na conta selecionada, ou o contrato aponta essa conta. */
    daConta: boolean;
    parcelas: ParcelaNaSerie[];
    conferidas: number;
    ocorrencias: { furos: number; atrasadas: number; juntas: number; vencidas: number };
}

export interface ExtratoPendente {
    id: string;
    transaction_date: string;
    amount: number;
    direction: 'CREDIT' | 'DEBIT';
    description_normalized?: string | null;
    description_raw?: string | null;
    counterparty_name?: string | null;
}

export interface CandidatoJuntas {
    contractId: string;
    bank: ExtratoPendente;
    parcelas: ParcelaNaSerie[];
    total: number;
    diff: number;
}

export interface OpcoesDaSequencia {
    /** Hoje (YYYY-MM-DD). */
    hoje: string;
    /** Primeiro e último dia com extrato importado na conta (null = sem extrato). */
    primeiroExtrato: string | null;
    ultimoExtrato: string | null;
    /** Conta selecionada na Central. */
    contaId: string;
}

const DIA = 86_400_000;
const dia = (d: string) => d.slice(0, 10);
const ms = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const somarDias = (d: string, n: number) => new Date(ms(d) + n * DIA).toISOString().slice(0, 10);
const diasEntre = (de: string, ate: string) => Math.round((ms(ate) - ms(de)) / DIA);
const mes = (d: string) => d.slice(0, 7);
const centavos = (v: number) => Math.round(v * 100) / 100;

const entraNaSerie = (p: Pick<ParcelaDeContrato, 'status' | 'business_status'>) => p.status !== 'CANCELLED' && p.business_status !== 'RETIDO';
const conferidaNoExtrato = (p: Pick<ParcelaDeContrato, 'bank_reconciled_at'>) => !!p.bank_reconciled_at;
const paga = (p: Pick<ParcelaDeContrato, 'status' | 'bank_reconciled_at'>) => conferidaNoExtrato(p) || p.status === 'CONCILIATED';
const aberta = (p: Pick<ParcelaDeContrato, 'status' | 'bank_reconciled_at'>) => !paga(p);

/** O mínimo para montar a série: identidade, vencimento e se está paga. */
type ParcelaDaSerie = Pick<ParcelaDeContrato, 'id' | 'contract_id' | 'due_date' | 'reference_id' | 'status' | 'business_status' | 'bank_reconciled_at' | 'contrato'>
    & { amount?: number };

/** Séries por contrato (sem RETIDO e CANCELLED), na ordem 1..N: vencimento, depois `reference_id`. */
function seriesOrdenadas<T extends ParcelaDaSerie>(parcelas: T[]): Map<string, T[]> {
    const porContrato = new Map<string, T[]>();
    for (const p of parcelas) {
        if (!entraNaSerie(p)) continue;
        const l = porContrato.get(p.contract_id) ?? [];
        l.push(p);
        porContrato.set(p.contract_id, l);
    }
    for (const lista of porContrato.values())
        lista.sort((a, b) => dia(a.due_date).localeCompare(dia(b.due_date))
            || (a.reference_id ?? '').localeCompare(b.reference_id ?? '')
            || a.id.localeCompare(b.id));
    return porContrato;
}

export interface PosicaoNaSerie {
    contractId: string;
    numeroContrato: string;
    /** Posição 1..N na série do contrato. */
    numero: number;
    total: number;
    /** Números das parcelas ANTERIORES ainda em aberto (não pagas). */
    abertasAntes: number[];
    /** Valor esperado desta parcela (líquido do retido), quando informado. */
    valor?: number;
    /** A parcela aberta MAIS ANTIGA da série, anterior a esta (alvo de "usar a NN"). */
    maisAntigaAberta?: { id: string; numero: number; due_date: string; valor?: number };
}

/**
 * "Usar a NN": a parcela aberta mais antiga do contrato, quando ela tem o MESMO valor
 * esperado (ao centavo) da sugerida — aí as duas são trocáveis para o banco e o
 * pagamento vai para a dívida vencida há mais tempo (CC art. 355). Valor diferente
 * (reajuste, parcela variável) não troca: o vínculo passaria a ter outra diferença.
 */
export function trocaPelaMaisAntiga(p?: PosicaoNaSerie): PosicaoNaSerie['maisAntigaAberta'] | null {
    const a = p?.maisAntigaAberta;
    if (!p || !a || p.valor == null || a.valor == null) return null;
    return Math.abs(a.valor - p.valor) <= 0.005 ? a : null;
}

/**
 * Coluna "Sequência sugerida" da Central: em que posição da série do contrato está
 * cada parcela ("Parcela 05 de 30") e quais anteriores seguem em aberto — sinal de
 * que a sugestão pula uma parcela mais antiga (quem paga atrasado costuma quitar a
 * mais antiga primeiro; CC art. 355 imputa o pagamento à dívida vencida há mais tempo).
 */
export function posicoesNasSeries(parcelas: ParcelaDaSerie[]): Map<string, PosicaoNaSerie> {
    const r = new Map<string, PosicaoNaSerie>();
    for (const [contractId, lista] of seriesOrdenadas(parcelas)) {
        const abertas: number[] = [];
        let maisAntiga: PosicaoNaSerie['maisAntigaAberta'];
        lista.forEach((p, i) => {
            r.set(p.id, {
                contractId,
                numeroContrato: p.contrato?.number || lista[0].contrato?.number || '',
                numero: i + 1,
                total: lista.length,
                abertasAntes: [...abertas],
                valor: p.amount,
                maisAntigaAberta: maisAntiga,
            });
            if (aberta(p)) {
                abertas.push(i + 1);
                maisAntiga ??= { id: p.id, numero: i + 1, due_date: dia(p.due_date), valor: p.amount };
            }
        });
    }
    return r;
}

export function analisarSequencias(parcelas: ParcelaDeContrato[], o: OpcoesDaSequencia): SerieDeParcelas[] {
    const series: SerieDeParcelas[] = [];
    for (const [contractId, lista] of seriesOrdenadas(parcelas)) {

        // Índice da última parcela paga: aberta antes dela é furo.
        let ultimaPaga = -1;
        lista.forEach((p, i) => { if (paga(p)) ultimaPaga = i; });

        const naSerie: ParcelaNaSerie[] = lista.map((p, i) => {
            const venc = dia(p.due_date);
            const datas = p.vinculos.map(v => dia(v.data)).sort();
            const dataBanco = conferidaNoExtrato(p) ? (datas[datas.length - 1] ?? (p.payment_date ? dia(p.payment_date) : null)) : null;
            let situacao: SituacaoParcela;
            let diasAtraso = 0;
            let mesPosterior = false;
            if (conferidaNoExtrato(p)) {
                diasAtraso = dataBanco ? Math.max(0, diasEntre(venc, dataBanco)) : 0;
                mesPosterior = !!dataBanco && mes(dataBanco) > mes(venc);
                situacao = diasAtraso > TOLERANCIA_DIAS ? 'conferida_atrasada' : 'conferida';
            } else if (p.status === 'CONCILIATED') {
                situacao = 'baixada_fora';
            } else if (venc >= o.hoje) {
                situacao = 'a_vencer';
            } else if (!o.ultimoExtrato || !o.primeiroExtrato
                || venc < o.primeiroExtrato || somarDias(venc, TOLERANCIA_DIAS) > o.ultimoExtrato) {
                // O extrato da conta não cobre o vencimento: não dá para afirmar que faltou.
                situacao = 'sem_extrato';
            } else {
                situacao = i < ultimaPaga ? 'furo' : 'vencida';
            }
            return { ...p, numero: i + 1, situacao, dataBanco, diasAtraso, mesPosterior, juntoCom: [] };
        });

        // Pagas juntas: mesma linha do extrato, ou mesmo mês do banco.
        const juntar = (grupo: ParcelaNaSerie[]) => {
            if (grupo.length < 2) return;
            for (const p of grupo)
                for (const q of grupo)
                    if (q !== p && !p.juntoCom.includes(q.numero)) p.juntoCom.push(q.numero);
        };
        const porLinha = new Map<string, ParcelaNaSerie[]>();
        const porMes = new Map<string, ParcelaNaSerie[]>();
        for (const p of naSerie) {
            if (!p.dataBanco) continue;
            for (const v of p.vinculos) {
                const l = porLinha.get(v.bank_transaction_id) ?? [];
                l.push(p);
                porLinha.set(v.bank_transaction_id, l);
            }
            const l = porMes.get(mes(p.dataBanco)) ?? [];
            l.push(p);
            porMes.set(mes(p.dataBanco), l);
        }
        porLinha.forEach(juntar);
        porMes.forEach(juntar);
        naSerie.forEach(p => p.juntoCom.sort((a, b) => a - b));

        const primeira = lista[0];
        const daConta = lista.some(p => p.contrato?.payment_account_id === o.contaId
            || p.vinculos.some(v => v.bank_account_id === o.contaId));
        series.push({
            contractId,
            numeroContrato: primeira.contrato?.number || '',
            titulo: primeira.contrato?.title || '',
            dominio: primeira.contrato?.domain ?? null,
            parte: primeira.party_name || primeira.entity_name || '',
            direction: primeira.direction,
            daConta,
            parcelas: naSerie,
            conferidas: naSerie.filter(p => p.situacao === 'conferida' || p.situacao === 'conferida_atrasada').length,
            ocorrencias: {
                furos: naSerie.filter(p => p.situacao === 'furo').length,
                atrasadas: naSerie.filter(p => p.situacao === 'conferida_atrasada').length,
                juntas: naSerie.filter(p => p.juntoCom.length > 0).length,
                vencidas: naSerie.filter(p => p.situacao === 'vencida').length,
            },
        });
    }
    return series;
}

/** Trechos de 2..4 parcelas abertas e SEGUIDAS, das mais antigas para as mais novas. */
function trechosAbertos(serie: SerieDeParcelas, usadas: Set<string>): ParcelaNaSerie[][] {
    const trechos: ParcelaNaSerie[][] = [];
    const ps = serie.parcelas;
    for (let i = 0; i < ps.length; i++) {
        for (let k = 2; k <= MAX_PARCELAS_JUNTAS && i + k <= ps.length; k++) {
            const t = ps.slice(i, i + k);
            if (t.some(p => !aberta(p) || usadas.has(p.id))) break;
            trechos.push(t);
        }
    }
    return trechos;
}

const textoDoExtrato = (b: ExtratoPendente) =>
    `${b.counterparty_name || ''} ${b.description_normalized || b.description_raw || ''}`;

/**
 * Movimento pendente do extrato = soma de parcelas abertas e seguidas de UM contrato.
 * Desempate entre contratos: o nome do cliente/fornecedor no extrato. Sem o nome,
 * só vale se um único contrato da conta casar (contrato que nunca passou pela conta
 * exige o nome). Cada movimento e cada parcela entram em uma sugestão só.
 */
export function acharPagamentosJuntos(series: SerieDeParcelas[], extrato: ExtratoPendente[]): CandidatoJuntas[] {
    const usadas = new Set<string>();
    const candidatos: CandidatoJuntas[] = [];
    const ordenado = [...extrato].sort((a, b) => dia(a.transaction_date).localeCompare(dia(b.transaction_date)));

    for (const b of ordenado) {
        const data = dia(b.transaction_date);
        const tol = groupTol(b.amount);
        const achados: { serie: SerieDeParcelas; trecho: ParcelaNaSerie[]; total: number; nome: boolean }[] = [];
        for (const serie of series) {
            if (serie.direction !== b.direction) continue;
            const trecho = trechosAbertos(serie, usadas).find(t => {
                const total = t.reduce((s, p) => s + p.amount, 0);
                const venc1 = dia(t[0].due_date);
                return Math.abs(total - b.amount) <= tol
                    && data >= somarDias(venc1, -ANTECIPACAO_DIAS)
                    && data <= somarDias(venc1, ATRASO_MAX_JUNTAS_DIAS);
            });
            if (!trecho) continue;
            achados.push({
                serie, trecho,
                total: centavos(trecho.reduce((s, p) => s + p.amount, 0)),
                nome: partyMatchesText(serie.parte || undefined, textoDoExtrato(b)),
            });
        }
        const comNome = achados.filter(a => a.nome);
        const escolhido = comNome.length === 1 ? comNome[0]
            : comNome.length === 0 && achados.length === 1 && achados[0].serie.daConta ? achados[0]
                : null;
        if (!escolhido) continue;
        escolhido.trecho.forEach(p => usadas.add(p.id));
        candidatos.push({
            contractId: escolhido.serie.contractId,
            bank: b,
            parcelas: escolhido.trecho,
            total: escolhido.total,
            diff: centavos(b.amount - escolhido.total),
        });
    }
    return candidatos;
}

/** Diferença máxima de valor para "crédito parecido" (reajuste, juros, desconto). */
const DIFERENCA_PARECIDO = 0.15;
/** Janela do crédito parecido em torno do vencimento: 10 dias antes a 40 depois. */
const PARECIDO_ANTES_DIAS = 10;
const PARECIDO_DEPOIS_DIAS = 40;

/**
 * Parcela em FURO ou VENCIDA que talvez não esteja em aberto: há um movimento
 * pendente do extrato do MESMO cliente/fornecedor (nome no extrato), perto do
 * vencimento, com valor até 15% diferente — típico de aluguel reajustado com o
 * título ainda no valor antigo. Só aponta (a conciliação 1:1 é na Pendentes);
 * não usa os movimentos já sugeridos em "Conciliar juntas". Cada movimento aponta
 * uma parcela só — a de vencimento mais próximo.
 */
export function acharCreditosParecidos(
    series: SerieDeParcelas[],
    extrato: ExtratoPendente[],
    jaSugeridos: string[],
): Map<string, ExtratoPendente> {
    const usados = new Set(jaSugeridos);
    const porParcela = new Map<string, ExtratoPendente>();
    const ordenado = [...extrato].sort((a, b) => dia(a.transaction_date).localeCompare(dia(b.transaction_date)));
    for (const b of ordenado) {
        if (usados.has(b.id)) continue;
        const data = dia(b.transaction_date);
        let melhor: { p: ParcelaNaSerie; distancia: number } | null = null;
        for (const serie of series) {
            if (serie.direction !== b.direction) continue;
            if (!partyMatchesText(serie.parte || undefined, textoDoExtrato(b))) continue;
            for (const p of serie.parcelas) {
                if ((p.situacao !== 'furo' && p.situacao !== 'vencida') || porParcela.has(p.id)) continue;
                const venc = dia(p.due_date);
                if (data < somarDias(venc, -PARECIDO_ANTES_DIAS) || data > somarDias(venc, PARECIDO_DEPOIS_DIAS)) continue;
                if (p.amount <= 0 || Math.abs(b.amount - p.amount) / p.amount > DIFERENCA_PARECIDO) continue;
                const distancia = Math.abs(diasEntre(venc, data));
                if (!melhor || distancia < melhor.distancia) melhor = { p, distancia };
            }
        }
        if (!melhor) continue;
        usados.add(b.id);
        porParcela.set(melhor.p.id, b);
    }
    return porParcela;
}
