// utils/jurosParcelamento.ts
//
// Parcelamento COM JUROS de uma negociação (Tabela Price e SAC) — a parte pura,
// sem React nem Supabase. Quem não cobra juros continua em `montarPlanoRapido`
// (utils/paymentPlan.ts); este módulo só entra quando há taxa.
//
// Regras do cálculo:
// - A taxa é AO MÊS (`1` = 1% a.m.). Periodicidade de k meses usa a taxa
//   equivalente `r = (1 + i)^k − 1`, não `i × k`.
// - A ENTRADA não paga juros: a base financiada é `precoSemJuros − entrada`.
// - Carência: o saldo cresce à taxa mensal entre a Data Efetiva (`dataBase`) e a
//   data em que a PRIMEIRA parcela deixa de ser "o primeiro período", ou seja,
//   `base × (1 + i)^(meses − intervalo)`. O juro dessa carência
//   (`baseAjustada − base`) é tirado do principal das primeiras linhas e somado
//   ao juros delas até esgotar — assim Σ principal = base EXATAMENTE.
// - Tudo em centavos inteiros (a parcela é arredondada UMA vez); a ÚLTIMA linha
//   absorve o resíduo: `saldo + juros`. Σ juros = Σ parcelas − base.
import {
    BlocoPagamento,
    somarMeses,
    mesesEntre,
    montarPlanoRapido,
    expandirBloco,
    blocoParaGerador,
    subtotalDoBloco,
} from './paymentPlan';
import type { PropertyDeal } from '../types/imovib';
import type { Contract, ContractInstallment } from '../types/contracts';

export type SistemaAmortizacao = 'PRICE' | 'SAC';

export interface PlanoComJuros {
    /** Preço de tabela, sem juros — entrada + principal financiado. */
    precoSemJuros: number;
    /** Entrada/sinal; não paga juros. */
    entrada: number;
    parcelas: number;
    /** Código do tipo da série (`MENSAL`, `TRIMESTRAL`, `CUSTOM_*`…). */
    tipo: string;
    intervaloMeses: number;
    /** Vencimento da primeira parcela, `YYYY-MM-DD`. */
    primeiroVencimento: string;
    /** Data Efetiva da negociação, `YYYY-MM-DD` — de onde os juros começam a correr. */
    dataBase: string;
    /** Taxa ao mês em %, `1` = 1% a.m. */
    taxaMensal: number;
    sistema: SistemaAmortizacao;
}

export interface LinhaComJuros {
    vencimento: string;
    valor: number;
    juros: number;
    principal: number;
}

const dois = (n: number) => Number(n.toFixed(2));
/** Reais → centavos inteiros. */
const emCentavos = (n: number) => Math.round(n * 100);
const deCentavos = (c: number) => c / 100;

/**
 * Gera as linhas (vencimento, valor, juros, principal) do parcelamento.
 * Taxa 0 não quebra: devolve parcelas iguais (a última absorve o resíduo) e
 * juros 0 — mas quem não tem juros deve seguir usando `montarPlanoRapido`.
 */
export function calcularParcelasComJuros(p: PlanoComJuros): LinhaComJuros[] {
    const n = Math.max(1, Math.floor(Number(p.parcelas) || 1));
    const k = Math.max(1, Math.floor(Number(p.intervaloMeses) || 1));
    const i = Math.max(0, Number(p.taxaMensal) || 0) / 100;
    const preco = Math.max(0, Number(p.precoSemJuros) || 0);
    const entrada = Math.min(preco, Math.max(0, Number(p.entrada) || 0));
    const baseC = emCentavos(preco - entrada);

    const r = Math.pow(1 + i, k) - 1;
    // Meses de carência além do primeiro período; nunca negativo (não desconta).
    const mesesCarencia = Math.max(0, mesesEntre(p.dataBase, p.primeiroVencimento) - k);
    const baseAjustadaC = Math.round(baseC * Math.pow(1 + i, mesesCarencia));

    // Juros da carência ainda a tirar do principal das primeiras linhas.
    let carenciaRestante = baseAjustadaC - baseC;

    // Parcela fixa (Price) / amortização fixa (SAC), em centavos.
    const pmtC = r === 0
        ? Math.round(baseAjustadaC / n)
        : Math.round((baseAjustadaC * r) / (1 - Math.pow(1 + r, -n)));
    const amortSacC = Math.floor(baseAjustadaC / n);

    const linhas: LinhaComJuros[] = [];
    let saldoC = baseAjustadaC;
    for (let j = 0; j < n; j++) {
        const jurosC = Math.round(saldoC * r);
        const ultima = j === n - 1;
        const amortC = ultima
            ? saldoC
            : p.sistema === 'SAC' ? amortSacC : pmtC - jurosC;
        const valorC = amortC + jurosC;
        saldoC -= amortC;

        // Move o juros da carência do principal para o juros da linha.
        const mover = Math.min(carenciaRestante, Math.max(0, amortC));
        carenciaRestante -= mover;

        linhas.push({
            vencimento: somarMeses(p.primeiroVencimento, k * j),
            valor: deCentavos(valorC),
            juros: deCentavos(jurosC + mover),
            principal: deCentavos(amortC - mover),
        });
    }
    return linhas;
}

/**
 * Agrupa as linhas em blocos de valor igual consecutivo (Price: N−1 iguais + a
 * última; SAC: normalmente 1× por parcela), no formato que a tela já usa. Cada
 * bloco leva `juros[]`/`principal[]` por parcela, na ordem das linhas.
 */
export function montarPlanoComJuros(p: PlanoComJuros): {
    entrada: number;
    blocos: (BlocoPagamento & { juros?: number[]; principal?: number[] })[];
    totalComJuros: number;
    totalJuros: number;
} {
    const preco = Math.max(0, Number(p.precoSemJuros) || 0);
    const entrada = dois(Math.min(preco, Math.max(0, Number(p.entrada) || 0)));
    const intervalo = Math.max(1, Math.floor(Number(p.intervaloMeses) || 1));
    const linhas = calcularParcelasComJuros(p);

    const blocos: (BlocoPagamento & { juros?: number[]; principal?: number[] })[] = [];
    for (const l of linhas) {
        const atual = blocos[blocos.length - 1];
        if (atual && atual.valorParcela === l.valor) {
            atual.quantidade += 1;
            atual.juros!.push(l.juros);
            atual.principal!.push(l.principal);
        } else {
            blocos.push({
                tipo: p.tipo,
                quantidade: 1,
                valorParcela: l.valor,
                primeiroVencimento: l.vencimento,
                intervaloMeses: intervalo,
                juros: [l.juros],
                principal: [l.principal],
            });
        }
    }

    const somaParcelas = dois(linhas.reduce((s, l) => s + l.valor, 0));
    const somaJuros = dois(linhas.reduce((s, l) => s + l.juros, 0));
    return { entrada, blocos, totalComJuros: dois(entrada + somaParcelas), totalJuros: somaJuros };
}

// ─────────────────────────────────────────────────────────────────────────────
// "Montar plano" da negociação (aba Financeiro do DealModal) — a transição de
// estado, pura. O componente junta os campos do painel em `CamposDoPlano` e faz
// `setFormData(prev => ({ ...prev, ...montarPlanoNoNegocio(prev, campos, id) }))`.
//
// Duas regras que só existem aqui:
// - Juros 0/vazio (ou locação) ⇒ é o `montarPlanoRapido` de sempre. Negócio que
//   nunca teve juros não ganha NENHUMA coluna nova no patch (o `saveDeal` manda o
//   formData inteiro para o banco).
// - A base dos juros é o PREÇO SEM JUROS (`price_before_interest`), não o Valor
//   Total do Contrato — que, depois de montar com juros, já inclui os juros.
//   Remontar sobre o total aplicaria juros sobre juros.
// ─────────────────────────────────────────────────────────────────────────────

/** O que o painel "Montar plano" tem em mãos, já convertido em números. */
export interface CamposDoPlano {
    /** Entrada/sinal (venda). Locação ignora. */
    entrada: number;
    parcelas: number;
    tipo: string;
    intervaloMeses: number;
    primeiroVencimento: string;
    /** Taxa ao mês em % (`1` = 1% a.m.); 0 = sem juros. Só vale em venda. */
    taxaMensal: number;
    sistema: SistemaAmortizacao;
    /**
     * Preço sem juros digitado. Ausente = `price_before_interest ?? contract_total_value`.
     * O componente só manda quando o campo está NA TELA (taxa > 0 ou negócio com
     * `price_before_interest`): valor digitado em campo escondido não vale.
     */
    precoSemJuros?: number;
}

/** Os campos da negociação que o "Montar plano" lê (o formulário é parcial). */
export type NegocioDoPlano = Partial<Pick<PropertyDeal,
    'type' | 'value' | 'date' | 'contract_total_value' | 'price_before_interest' | 'interest_rate_monthly' | 'amortization_system'>>;

export interface PreviaDoPlano {
    entrada: number;
    blocos: BlocoPagamento[];
    /**
     * O valor SEM juros que o plano distribui (entrada + parcelas, antes dos
     * juros): o preço sem juros, ou o Valor Total quando não há preço. É o que
     * a validação do botão confere — não o `contract_total_value`, que com
     * juros gravados já inclui os juros.
     */
    base: number;
    /** null = plano sem juros (o gerador simples). */
    juros: null | {
        taxaMensal: number;
        sistema: SistemaAmortizacao;
        precoSemJuros: number;
        totalComJuros: number;
        totalJuros: number;
    };
}

/** Preço sem juros que o painel mostra quando o usuário não digitou nenhum. */
export const precoSemJurosPadrao = (d: Pick<PropertyDeal, 'contract_total_value' | 'price_before_interest'>): number =>
    Number(d.price_before_interest ?? d.contract_total_value) || 0;

/** O que "Montar plano" vai gravar — também alimenta a linha de resumo. */
export function preverPlano(deal: NegocioDoPlano, c: CamposDoPlano): PreviaDoPlano {
    const venda = deal.type === 'SALE';
    const taxa = Number(c.taxaMensal) || 0;
    if (venda && taxa > 0) {
        const precoSemJuros = c.precoSemJuros ?? precoSemJurosPadrao(deal);
        const r = montarPlanoComJuros({
            precoSemJuros,
            entrada: c.entrada,
            parcelas: c.parcelas,
            tipo: c.tipo,
            intervaloMeses: c.intervaloMeses,
            primeiroVencimento: c.primeiroVencimento,
            dataBase: deal.date || c.primeiroVencimento,
            taxaMensal: taxa,
            sistema: c.sistema,
        });
        return {
            entrada: r.entrada,
            blocos: r.blocos,
            base: dois(precoSemJuros),
            juros: {
                taxaMensal: taxa,
                sistema: c.sistema,
                precoSemJuros: dois(precoSemJuros),
                totalComJuros: r.totalComJuros,
                totalJuros: r.totalJuros,
            },
        };
    }
    // Sem juros: exatamente o gerador de antes. A única diferença é a base de um
    // negócio que JÁ teve juros: o total gravado inclui os juros, então volta ao
    // preço sem juros (o digitado no campo, que aparece nesse caso, ou o gravado).
    const total = venda && (c.precoSemJuros != null || deal.price_before_interest != null)
        ? Number(c.precoSemJuros ?? deal.price_before_interest) || 0
        : Number(deal.contract_total_value) || 0;
    const simples = montarPlanoRapido({
        total,
        entrada: venda ? c.entrada : 0,
        parcelas: c.parcelas,
        tipo: c.tipo,
        intervaloMeses: c.intervaloMeses,
        primeiroVencimento: c.primeiroVencimento,
        // Locação: a parcela é o aluguel mensal (`value`), não o total ÷ nº.
        valorParcelaFixo: deal.type === 'RENTAL' ? (Number(deal.value) || 0) : undefined,
    });
    return { entrada: simples.entrada, blocos: simples.blocos, base: dois(total), juros: null };
}

/**
 * Valor Total do Contrato editado À MÃO. Num negócio com juros, o preço sem
 * juros gravado deixa de valer: o total digitado passa a ser a base da próxima
 * montagem. Sem isto, um `price_before_interest` velho reescrevia em silêncio o
 * total que o usuário acabou de digitar (achado da revisão da Task 3).
 * Negócio sem juros não ganha a chave (nada novo no payload do `saveDeal`).
 */
export function editarValorTotal(
    deal: Pick<PropertyDeal, 'price_before_interest'>,
    valor: number | undefined,
): Partial<PropertyDeal> {
    return {
        contract_total_value: valor,
        ...(deal.price_before_interest != null ? { price_before_interest: null } : {}),
    };
}

/**
 * Espelho `installment_value`/`installments` da negociação (Nº de Parcelas e Valor
 * Mensal — o contrato nasce com `payment_installments` = este nº).
 *
 * Sem juros é o `blocoParaGerador` de sempre (maior série com mais de 1 parcela).
 * Com juros a série é UMA só — Price ou SAC — espalhada em blocos: no Price a
 * última parcela absorve os centavos e vira bloco próprio (12× virava "11"); no
 * SAC cada parcela tem um valor, N blocos de 1× — e o espelho nem era gravado
 * (ficava o nº/valor antigo). Com juros: nº = todas as parcelas com juros, valor
 * = a 1ª delas (Price: a parcela fixa; SAC: a maior).
 */
export function espelhoDoPlano(
    blocos: (BlocoPagamento & { juros?: number[] })[],
): { valor: number; quantidade: number } | null {
    const comJuros = blocos
        .filter(b => (b.juros?.length ?? 0) > 0)
        .sort((a, b) => (a.primeiroVencimento || '').localeCompare(b.primeiroVencimento || ''));
    if (comJuros.length === 0) return blocoParaGerador(blocos);
    return {
        valor: comJuros[0].valorParcela,
        quantidade: comJuros.reduce((soma, b) => soma + b.quantidade, 0),
    };
}

/**
 * O patch que "Montar plano" aplica sobre a negociação: sinal, 1º vencimento,
 * cronograma expandido (+ espelho do gerador de contrato) e, em venda com
 * juros, as três colunas de juros e o total com juros. `idBase` prefixa os ids
 * das linhas (`${idBase}-${i}-${k}`).
 */
export function montarPlanoNoNegocio(deal: NegocioDoPlano, c: CamposDoPlano, idBase: string): Partial<PropertyDeal> {
    const { entrada, blocos, juros, base } = preverPlano(deal, c);
    const linhas = blocos.flatMap((b, i) => expandirBloco(b, `${idBase}-${i}`));
    // Espelho para o gerador do contrato, que só sabe UMA série homogênea e lê
    // estes dois campos (ver geracaoContrato no DealModal).
    const espelho = espelhoDoPlano(blocos);
    const venda = deal.type === 'SALE';
    const tinhaJuros = deal.interest_rate_monthly != null
        || deal.amortization_system != null
        || deal.price_before_interest != null;

    let colunasDeJuros: Partial<PropertyDeal> = {};
    if (juros) {
        colunasDeJuros = {
            interest_rate_monthly: juros.taxaMensal,
            amortization_system: juros.sistema,
            price_before_interest: juros.precoSemJuros,
            contract_total_value: juros.totalComJuros,
        };
    } else if (venda) {
        // Juros zerado num negócio que tinha juros: limpa as três colunas e o
        // total volta à base usada (preço sem juros digitado ou gravado). Sem
        // juros e sem preço sem juros, nada muda aqui — é o caminho de sempre.
        colunasDeJuros = {
            ...(tinhaJuros
                ? { interest_rate_monthly: null, amortization_system: null, price_before_interest: null }
                : {}),
            ...(c.precoSemJuros != null || deal.price_before_interest != null
                ? { contract_total_value: base }
                : {}),
        };
    }

    return {
        ...(venda
            ? (entrada > 0
                ? { down_payment: entrada, down_payment_installment_type: 'SINAL' }
                : { down_payment: 0, down_payment_installment_type: undefined, down_payment_notes: undefined })
            : {}),
        payment_due_date: c.primeiroVencimento,
        // Locação: o total do contrato É mensal × nº (não vem das unidades,
        // que somam o valor de UM mês).
        ...(deal.type === 'RENTAL'
            ? { contract_total_value: dois(blocos.reduce((soma, b) => soma + subtotalDoBloco(b), 0)) }
            : {}),
        ...colunasDeJuros,
        custom_installments: linhas,
        ...(espelho ? { installment_value: espelho.valor, installments: espelho.quantidade } : {}),
    };
}

/** A série principal como a tabela do plano a edita na linha. */
export interface SerieAlvo {
    parcelas: number;
    tipo: string;
    intervaloMeses: number;
    primeiroVencimento: string;
    /** Detalhe da série (gaveta) — vai para todas as parcelas recalculadas. */
    paymentType?: BlocoPagamento['paymentType'];
    notes?: string;
}

/**
 * Edição NA LINHA da série principal (tabela do plano, aba Financeiro): a série
 * fecha a conta sobre o que sobra do sinal e das demais linhas (reforços,
 * chaves, avulsas), que ficam como estão — inclusive juros/principal já
 * conhecidos. O `montarPlanoNoNegocio`, ao contrário, troca o plano inteiro por
 * entrada + série; aqui ele é reusado com a entrada = sinal + demais linhas, e
 * o resultado é remontado com as linhas de volta.
 *
 * Com juros, eles incidem só sobre a série (o saldo financiado); sinal e demais
 * linhas entram pelo valor nominal. Locação: a parcela é o aluguel (`value`),
 * não há sinal, e o total do contrato é a soma de tudo.
 *
 * Recusa (`ok: false`) quando sinal + demais linhas já cobrem a base: a série
 * ficaria zerada ou negativa — a tela diz quanto excede.
 */
export function replanejarSerie(
    deal: NegocioDoPlano,
    sinal: number,
    outros: BlocoPagamento[],
    serie: SerieAlvo,
    juros: { taxaMensal: number; sistema: SistemaAmortizacao; precoSemJuros?: number },
    idBase: string,
): { ok: true; patch: Partial<PropertyDeal> } | { ok: false; motivo: string; excesso: number } {
    const venda = deal.type === 'SALE';
    const fixos = dois((venda ? Math.max(0, sinal) : 0) + outros.reduce((t, b) => t + subtotalDoBloco(b), 0));
    const campos: CamposDoPlano = {
        entrada: venda ? fixos : 0,
        parcelas: Math.max(1, Math.floor(serie.parcelas || 1)),
        tipo: serie.tipo,
        intervaloMeses: Math.max(1, Math.floor(serie.intervaloMeses || 1)),
        primeiroVencimento: serie.primeiroVencimento,
        taxaMensal: venda ? (Number(juros.taxaMensal) || 0) : 0,
        sistema: juros.sistema,
        ...(juros.precoSemJuros != null ? { precoSemJuros: juros.precoSemJuros } : {}),
    };

    if (venda) {
        const { base } = preverPlano(deal, campos);
        if (fixos >= base - 0.005) {
            return {
                ok: false,
                motivo: 'O sinal e as demais linhas já cobrem o valor do contrato — não sobra nada para a série.',
                excesso: dois(fixos - base),
            };
        }
    }

    const montado = montarPlanoNoNegocio(deal, campos, idBase);
    const linhasDosOutros = outros.flatMap((b, i) => expandirBloco(b, `${idBase}-o${i}`));
    const linhasDaSerie = (montado.custom_installments || []).map(l => ({
        ...l,
        ...(serie.paymentType ? { paymentType: serie.paymentType } : {}),
        ...(serie.notes ? { notes: serie.notes } : {}),
    }));
    const linhas = [...linhasDosOutros, ...linhasDaSerie]
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const blocosDaSerie = preverPlano(deal, campos).blocos;
    const espelho = espelhoDoPlano([...outros, ...blocosDaSerie]);

    const patch: Partial<PropertyDeal> = {
        ...montado,
        custom_installments: linhas,
        ...(espelho ? { installment_value: espelho.valor, installments: espelho.quantidade } : {}),
    };
    if (venda) {
        // O sinal é o de antes — o `montarPlanoNoNegocio` o recebeu somado às demais linhas.
        Object.assign(patch, sinal > 0
            ? { down_payment: dois(sinal), down_payment_installment_type: 'SINAL' }
            : { down_payment: 0, down_payment_installment_type: undefined, down_payment_notes: undefined });
    } else {
        patch.contract_total_value = dois(linhas.reduce((t, l) => t + (Number(l.value) || 0), 0));
    }
    return { ok: true, patch };
}

/**
 * Bloco salvo no Sheet "Editar pagamento" (`salvarBloco` do DealModal). O
 * formulário do Sheet não tem juros, então o bloco novo nasce sem `juros`/
 * `principal` — a decomposição deixa de ser conhecida quando o bloco muda de
 * verdade (nº, valor, 1º vencimento ou intervalo). Mas quem só troca a forma de
 * pagamento ou a observação (o caminho natural depois do "Montar plano", que não
 * escolhe Boleto/PIX; no SAC são N blocos de 1×) não mudou parcela nenhuma: o
 * destaque do bloco original vem junto. Sem isto os títulos iam a Contas a
 * Receber sem juros e a DRE punha a parcela inteira na receita da venda.
 * Bloco de 1×: o intervalo não importa (`agruparPlano` o devolve `null`, o Sheet
 * devolve o do tipo).
 */
export function manterJurosDoBlocoEditado(
    original: BlocoPagamento | undefined,
    novo: BlocoPagamento,
): BlocoPagamento {
    if (!original?.juros || !original.principal) return novo;
    const n = Math.max(1, Math.floor(novo.quantidade || 1));
    const mesmasParcelas = n === Math.max(1, Math.floor(original.quantidade || 1))
        && original.juros.length === n && original.principal.length === n
        && Math.abs((Number(novo.valorParcela) || 0) - (Number(original.valorParcela) || 0)) < 0.005
        && (novo.primeiroVencimento || '') === (original.primeiroVencimento || '')
        && (n === 1 || (novo.intervaloMeses || 0) === (original.intervaloMeses || 0));
    return mesmasParcelas
        ? { ...novo, juros: [...original.juros], principal: [...original.principal] }
        : novo;
}

const fmtMoeda = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const fmtTaxa = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

/**
 * Linha de resumo do painel (sem o "Vai gerar:" e sem o ponto final):
 * - sem juros: "entrada de R$ 20.000,00 + 10× parcelas mensais de R$ 10.000,00";
 * - Price: "… 12× parcelas mensais de R$ 8.884,88 (Price, 1% a.m.) — juros R$ 6.618,53, total R$ 126.618,53";
 * - SAC: "… de R$ 11.200,00 a R$ 10.100,00 (SAC, 1% a.m.) — …" (a parcela cai).
 * `rotuloTipo` é o nome do tipo da série ("Parcelas mensais").
 */
export function resumoDoPlano(previa: PreviaDoPlano, rotuloTipo: string): string {
    const { entrada, blocos, juros } = previa;
    const n = blocos.reduce((s, b) => s + b.quantidade, 0);
    const rotulo = rotuloTipo.toLowerCase();
    const valores = blocos.map(b => fmtMoeda(b.valorParcela));
    let parcelas: string;
    if (juros) {
        const faixa = juros.sistema === 'SAC' && valores.length > 1
            ? `de ${valores[0]} a ${valores[valores.length - 1]}`
            : `de ${valores[0]}`;
        parcelas = `${n}× ${rotulo} ${faixa} (${juros.sistema === 'SAC' ? 'SAC' : 'Price'}, ${fmtTaxa(juros.taxaMensal)}% a.m.)`
            + ` — juros ${fmtMoeda(juros.totalJuros)}, total ${fmtMoeda(juros.totalComJuros)}`;
    } else {
        parcelas = valores.length === 2
            ? `${n}× ${rotulo} (${blocos[0].quantidade}× ${valores[0]} + 1× ${valores[1]})`
            : `${n}× ${rotulo} de ${valores[0]}`;
    }
    return (entrada > 0 ? `entrada de ${fmtMoeda(entrada)} + ` : '') + parcelas;
}

/** O que importa do `payment_schedule` gravado: se alguma linha tinha juros. */
export type CronogramaDoContrato = ReadonlyArray<Pick<ContractInstallment, 'interest'>>;

/**
 * Valor do contrato que o "Lançar no Financeiro" / "Gerar no contrato" manda junto
 * com o plano (`aplicarPlanoNoContrato` do DealModal). Decisão do usuário: o valor
 * da venda com juros é o TOTAL com juros. `createFromDeal` já faz o contrato NASCER
 * assim; este é o caso do contrato que já existia antes do plano com juros — ele
 * ficava no preço à vista enquanto as parcelas somavam o total com juros.
 *
 * Venda sem juros: vazio (nada muda) — EXCETO quando o `payment_schedule` atual do
 * contrato (`cronogramaAtualDoContrato`, gravado antes desta atualização) tinha
 * juros: aí o juro foi zerado depois de lançar e o contrato volta ao total sem
 * juros (revisão final, I-2). Locação: nunca (aluguel não tem juros, e o
 * `original_value` do recorrente é o valor da PARCELA). `updateContract` recalcula
 * `current_value` por `valorAtualDoContrato` — original + aditivos + reajuste
 * acumulado —, então o reajuste já aplicado continua somado.
 */
export function valorDoContratoPeloPlano(
    deal: Partial<Pick<PropertyDeal, 'type' | 'interest_rate_monthly' | 'contract_total_value'>>,
    cronogramaAtualDoContrato?: CronogramaDoContrato,
): { original_value?: number } {
    if (deal.type === 'RENTAL') return {};
    const total = Number(deal.contract_total_value) || 0;
    if (total <= 0) return {};
    if ((Number(deal.interest_rate_monthly) || 0) > 0) return { original_value: total };
    // Juros zerado DEPOIS de lançar: o contrato ficou no total COM juros do
    // lançamento anterior, e o cronograma novo soma o total sem juros. Só o
    // `payment_schedule` gravado sabe que houve juros (a negociação zerada não
    // guarda rastro), então é ele que decide. Venda que nunca teve juros: nada.
    const contratoTeveJuros = (cronogramaAtualDoContrato || []).some(l => (Number(l?.interest) || 0) > 0);
    return contratoTeveJuros ? { original_value: total } : {};
}

// ─────────────────────────────────────────────────────────────────────────────
// O elo negociação → contrato ("Lançar no Financeiro" / "Gerar no contrato" do
// DealModal, `aplicarPlanoNoContrato`). Puro para ser testado: o componente só
// lê o cronograma atual do contrato e manda o resultado ao `updateContract`.
// ─────────────────────────────────────────────────────────────────────────────

/** Os campos da negociação que viram o `payment_schedule` do contrato. */
export type NegocioDoCronograma = Partial<Pick<PropertyDeal,
    'date' | 'down_payment' | 'down_payment_installment_type' | 'down_payment_payment_type' | 'custom_installments'>>;

/**
 * O plano no formato `payment_schedule` do contrato: sinal + cronograma, por
 * data. Leva junto o TIPO de cada parcela (Sinal/Mensal/Chaves…) e a forma de
 * pagamento — sem isso a coluna "Tipo" da aba Parcelas nascia vazia e o
 * usuário teria de reclassificar à mão o que o plano já sabia.
 * Parcela com juros (Price/SAC) leva `interest`/`principal`: o sync do contrato
 * grava a parte de juros no título (`interest_amount`) para a DRE separá-la.
 * O sinal nunca tem juros.
 */
export function planoComoSchedule(deal: NegocioDoCronograma): ContractInstallment[] {
    return [
        ...((Number(deal.down_payment) || 0) > 0 && deal.date
            ? [{
                date: deal.date,
                value: Number(deal.down_payment) || 0,
                installment_type: deal.down_payment_installment_type || 'SINAL',
                payment_type: deal.down_payment_payment_type ?? null,
            }]
            : []),
        ...(deal.custom_installments || []).map(i => ({
            date: i.dueDate,
            value: Number(i.value) || 0,
            installment_type: i.installmentType ?? null,
            payment_type: i.paymentType ?? null,
            ...(typeof i.interest === 'number' ? { interest: i.interest, principal: i.principal ?? null } : {}),
        })),
    ]
        .filter(i => i.date && i.value > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * O `updateContract` inteiro de `aplicarPlanoNoContrato`: cronograma, prazo
 * Parcelado, as dimensões contábeis do cabeçalho da negociação (é delas que a
 * parcela herda Centro de Custo e Plano de Contas) e, em venda, o valor do
 * contrato (`valorDoContratoPeloPlano`). `cronogramaAtualDoContrato` é o
 * `payment_schedule` gravado ANTES desta atualização (ver lá por quê).
 */
export function atualizacaoDoContratoPeloPlano(
    deal: NegocioDoCronograma & Partial<Pick<PropertyDeal,
        'type' | 'interest_rate_monthly' | 'contract_total_value' | 'cost_center_id' | 'plano_de_contas_id'>>,
    cronogramaAtualDoContrato: CronogramaDoContrato | undefined,
): Partial<Contract> {
    return {
        payment_schedule: planoComoSchedule(deal),
        payment_term_type: 'Parcelado',
        ...(deal.cost_center_id ? { cost_center_id: deal.cost_center_id } : {}),
        ...(deal.plano_de_contas_id ? { plano_de_contas_id: deal.plano_de_contas_id } : {}),
        ...valorDoContratoPeloPlano(deal, cronogramaAtualDoContrato),
    };
}
