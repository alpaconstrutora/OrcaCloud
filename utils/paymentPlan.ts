// utils/paymentPlan.ts
//
// Plano de Pagamento de uma negociação — a parte pura, sem React.
//
// O plano é montado por BLOCOS ("12 parcelas mensais de R$ 25.000 a partir de
// 10/10/2026"), mas é PERSISTIDO expandido, uma linha por parcela, em
// `commercial_deals.custom_installments` (`PaymentInstallment[]`). O formato
// expandido é o que o resto do sistema já entende — a proposta em PDF
// (`services/propertyExportService.ts`) imprime linha a linha e soma o rodapé.
// Inventar um formato de "bloco" no banco obrigaria todo consumidor a aprender
// a expandir; expandir aqui não obriga ninguém a nada.
//
// ⚠️ O SINAL não entra em `custom_installments`: ele vive em
// `commercial_deals.down_payment` (+ `down_payment_installment_type`), e a
// proposta soma os dois. Gravado nos dois lugares, dobraria de valor.
import { PaymentInstallment } from '../types/financial';

/** Um bloco do plano, como o usuário pensa: tipo + quantas + de quanto + quando. */
export interface BlocoPagamento {
    /** Código do tipo (`SINAL`, `MENSAL`, `CHAVES`, `CUSTOM_*`…). */
    tipo: string;
    quantidade: number;
    valorParcela: number;
    /** Vencimento da primeira parcela, `YYYY-MM-DD`. */
    primeiroVencimento: string;
    /** Meses entre parcelas. `null`/0 = bloco de parcela única. */
    intervaloMeses: number | null;
    paymentType?: PaymentInstallment['paymentType'];
    notes?: string;
    /** Ids das linhas que compõem o bloco — presente quando veio de `agruparPlano`. */
    ids?: string[];
    /**
     * Venda com juros (utils/jurosParcelamento): parte de juros e de principal
     * de CADA parcela do bloco, na ordem das linhas. Ausente = parcela sem
     * decomposição conhecida (plano sem juros, ou bloco editado à mão).
     */
    juros?: number[];
    principal?: number[];
}

const dois = (n: number) => Number(n.toFixed(2));

/** Último dia do mês (para não transbordar 31/jan + 1 mês). */
const ultimoDiaDoMes = (ano: number, mes: number) => new Date(ano, mes + 1, 0).getDate();

/**
 * Soma meses a uma data `YYYY-MM-DD` preservando o dia sempre que ele existir
 * no mês de destino (31/jan + 1 mês = 28/fev, não 03/mar).
 *
 * ⚠️ Aritmética de ano/mês/dia em números, NUNCA `new Date('YYYY-MM-DD')`: esse
 * parse é UTC e em UTC-3 volta um dia — foi o defeito que fez a curva do
 * dashboard começar em "Dez 25" com o campo marcando janeiro/26.
 */
export function somarMeses(iso: string, meses: number): string {
    const [a, m, d] = iso.split('-').map(Number);
    if (!a || !m || !d) return iso;
    const alvoMes = m - 1 + meses;
    const ano = a + Math.floor(alvoMes / 12);
    const mes = ((alvoMes % 12) + 12) % 12;
    const dia = Math.min(d, ultimoDiaDoMes(ano, mes));
    return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Soma dias a uma data `YYYY-MM-DD`. Aritmética em UTC de ponta a ponta
 * (`Date.UTC` + `getUTC*`), pelo mesmo motivo de `somarMeses`: `new
 * Date('YYYY-MM-DD')` é UTC e qualquer método local volta um dia em UTC-3.
 */
export function somarDias(iso: string, dias: number): string {
    const [a, m, d] = iso.split('-').map(Number);
    if (!a || !m || !d) return iso;
    const alvo = new Date(Date.UTC(a, m - 1, d + dias));
    return `${alvo.getUTCFullYear()}-${String(alvo.getUTCMonth() + 1).padStart(2, '0')}-${String(alvo.getUTCDate()).padStart(2, '0')}`;
}

/** Diferença em meses entre duas datas `YYYY-MM-DD` (só ano/mês). */
export function mesesEntre(isoA: string, isoB: string): number {
    const [aa, ma] = isoA.split('-').map(Number);
    const [ab, mb] = isoB.split('-').map(Number);
    if (!aa || !ab) return 0;
    return (ab - aa) * 12 + (mb - ma);
}

/**
 * Expande um bloco nas suas parcelas. `idBase` prefixa os ids para as linhas do
 * mesmo bloco continuarem reconhecíveis ao reagrupar.
 */
export function expandirBloco(bloco: BlocoPagamento, idBase: string): PaymentInstallment[] {
    const qtd = Math.max(1, Math.floor(bloco.quantidade || 1));
    const intervalo = bloco.intervaloMeses ?? 0;
    return Array.from({ length: qtd }, (_, i) => ({
        id: `${idBase}-${i + 1}`,
        dueDate: intervalo > 0 ? somarMeses(bloco.primeiroVencimento, intervalo * i) : bloco.primeiroVencimento,
        value: dois(bloco.valorParcela),
        status: 'PENDING' as const,
        // `description` é campo interno (a proposta NÃO o usa — ver o comentário
        // em propertyExportService), mas fica legível para quem abrir o jsonb.
        description: qtd > 1 ? `Parcela ${i + 1}/${qtd}` : 'Parcela única',
        installmentType: bloco.tipo,
        ...(bloco.paymentType ? { paymentType: bloco.paymentType } : {}),
        ...(bloco.notes ? { notes: bloco.notes } : {}),
        // Juros/principal só quando o bloco sabe os dois desta parcela — a linha
        // de um plano sem juros continua sem as chaves (nada novo no jsonb).
        ...(bloco.juros?.[i] != null && bloco.principal?.[i] != null
            ? { interest: dois(bloco.juros[i]), principal: dois(bloco.principal[i]) }
            : {}),
    }));
}

/**
 * Caminho inverso: reconstitui os blocos a partir das linhas salvas, para a
 * tela mostrar "12× R$ 25.000" em vez de doze linhas iguais.
 *
 * Agrupa linhas CONSECUTIVAS (por vencimento) que compartilham tipo e valor e
 * mantêm o mesmo intervalo em meses. Qualquer quebra — valor diferente, buraco
 * na cadência, outro tipo — abre um bloco novo. Plano montado fora daqui (ou
 * editado linha a linha no futuro) continua legível: no pior caso vira uma
 * sequência de blocos de uma parcela.
 *
 * Linhas com `interest`/`principal` (venda com juros) devolvem o bloco com
 * `juros[]`/`principal[]`, para que reescrever o plano a partir dos blocos
 * (ex.: editar OUTRO bloco no Sheet) não apague a decomposição de quem não mudou.
 */
const temJuros = (l: PaymentInstallment) => l.interest != null && l.principal != null;

export function agruparPlano(installments: PaymentInstallment[]): BlocoPagamento[] {
    const linhas = [...(installments || [])]
        .filter(i => i && i.dueDate)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const blocos: BlocoPagamento[] = [];
    for (const linha of linhas) {
        const atual = blocos[blocos.length - 1];
        const mesmoTipo = atual && (atual.tipo || '') === (linha.installmentType || '');
        const mesmoValor = atual && Math.abs(atual.valorParcela - linha.value) < 0.005;
        if (atual && mesmoTipo && mesmoValor) {
            const ultimo = atual.ids![atual.ids!.length - 1];
            const passo = mesesEntre(
                atual.quantidade === 1
                    ? atual.primeiroVencimento
                    : somarMeses(atual.primeiroVencimento, (atual.intervaloMeses || 0) * (atual.quantidade - 1)),
                linha.dueDate,
            );
            const cadenciaOk = atual.quantidade === 1
                ? passo > 0
                : passo === (atual.intervaloMeses || 0);
            if (cadenciaOk) {
                atual.quantidade += 1;
                if (atual.quantidade === 2) atual.intervaloMeses = passo;
                atual.ids!.push(linha.id);
                // Juros por parcela acompanham o bloco só se TODAS as linhas
                // dele os têm; uma linha sem decomposição apaga a do bloco
                // inteiro (os arrays deixariam de casar com as parcelas).
                if (atual.juros && atual.principal && temJuros(linha)) {
                    atual.juros.push(linha.interest!);
                    atual.principal.push(linha.principal!);
                } else {
                    delete atual.juros;
                    delete atual.principal;
                }
                void ultimo;
                continue;
            }
        }
        blocos.push({
            tipo: linha.installmentType || 'AVULSA',
            quantidade: 1,
            valorParcela: linha.value,
            primeiroVencimento: linha.dueDate,
            intervaloMeses: null,
            paymentType: linha.paymentType,
            notes: linha.notes,
            ids: [linha.id],
            ...(temJuros(linha) ? { juros: [linha.interest!], principal: [linha.principal!] } : {}),
        });
    }
    return blocos;
}

/** Soma de um bloco. */
export const subtotalDoBloco = (b: Pick<BlocoPagamento, 'quantidade' | 'valorParcela'>) =>
    dois(Math.max(1, Math.floor(b.quantidade || 1)) * (b.valorParcela || 0));

/**
 * Saldo a distribuir: total do contrato menos o sinal e menos tudo que já está
 * no cronograma. Positivo = falta distribuir; negativo = o plano passou do total.
 */
export function saldoDoPlano(
    totalContrato: number,
    downPayment: number,
    installments: PaymentInstallment[],
): number {
    const somaLinhas = (installments || []).reduce((s, i) => s + (Number(i.value) || 0), 0);
    return dois((Number(totalContrato) || 0) - (Number(downPayment) || 0) - somaLinhas);
}

/**
 * Espelho para o gerador de parcelas do contrato, que só sabe fazer UMA série
 * homogênea e lê `installment_value`/`installments` (ver `geracaoContrato` em
 * DealModal). Escolhe o maior bloco periódico do plano; sem nenhum, devolve
 * null e o gerador segue com o valor do próprio contrato.
 */
export function blocoParaGerador(blocos: BlocoPagamento[]): { valor: number; quantidade: number } | null {
    const periodicos = blocos.filter(b => (b.intervaloMeses || 0) > 0 && b.quantidade > 1);
    if (periodicos.length === 0) return null;
    const maior = periodicos.reduce((a, b) => (subtotalDoBloco(b) > subtotalDoBloco(a) ? b : a));
    return { valor: maior.valorParcela, quantidade: maior.quantidade };
}

/** Entrada do gerador rápido: o que o usuário digita ao escolher "Parcelado". */
export interface PlanoRapido {
    /** Valor Total do Contrato (venda) — entrada + parcelas. */
    total: number;
    /** Entrada/sinal; 0 = sem entrada (locação nunca tem). */
    entrada: number;
    parcelas: number;
    /** Código do tipo da série (`MENSAL`, `TRIMESTRAL`, `CUSTOM_*`…). */
    tipo: string;
    intervaloMeses: number;
    primeiroVencimento: string;
    /**
     * Valor de cada parcela já conhecido (locação: o aluguel mensal). Quando
     * informado, as parcelas NÃO são derivadas do total — são N × este valor.
     */
    valorParcelaFixo?: number;
}

/**
 * Gerador rápido do Plano de Pagamento: "entrada + N parcelas de X em X meses".
 *
 * Nasceu em 2026-09-21 porque a aba Financeiro da negociação tinha o select
 * "Parcelado" sem nenhum campo ao lado — o plano por blocos existia, mas quem
 * escolhia "Parcelado" não via onde dizer quantas parcelas, com qual entrada e
 * de quanto em quanto tempo. Devolve os blocos no formato que a tela já usa
 * (`aplicarBlocos`), então nada muda na persistência.
 *
 * As parcelas dividem `total − entrada` truncando em centavos; a sobra vai
 * para a ÚLTIMA parcela, que vira um bloco próprio de 1× — é como
 * `agruparPlano` reconstituiria de qualquer jeito, e a soma fecha no total.
 */
export function montarPlanoRapido(p: PlanoRapido): { entrada: number; blocos: BlocoPagamento[] } {
    const total = Math.max(0, Number(p.total) || 0);
    const n = Math.max(1, Math.floor(Number(p.parcelas) || 1));
    const intervalo = Math.max(1, Math.floor(Number(p.intervaloMeses) || 1));
    const fixo = Number(p.valorParcelaFixo) || 0;
    const entrada = fixo > 0 ? 0 : Math.min(total, Math.max(0, Number(p.entrada) || 0));

    const base = fixo > 0 ? dois(fixo) : Math.floor(((total - entrada) / n) * 100) / 100;
    const sobra = fixo > 0 ? 0 : dois(total - entrada - base * n);
    const comum = { tipo: p.tipo, primeiroVencimento: p.primeiroVencimento, intervaloMeses: intervalo };

    const blocos: BlocoPagamento[] = [];
    if (sobra === 0 || n === 1) {
        blocos.push({ ...comum, quantidade: n, valorParcela: dois(base + (n === 1 ? sobra : 0)) });
    } else {
        blocos.push({ ...comum, quantidade: n - 1, valorParcela: base });
        blocos.push({
            ...comum,
            quantidade: 1,
            valorParcela: dois(base + sobra),
            primeiroVencimento: somarMeses(p.primeiroVencimento, intervalo * (n - 1)),
        });
    }
    return { entrada: dois(entrada), blocos };
}

/**
 * Uma SÉRIE do plano como a tabela da aba Financeiro a mostra: blocos do mesmo
 * tipo, na mesma cadência, numa linha só — mesmo com blocos de outro tipo
 * intercalados por data. Três casos que `agruparPlano` devolve partidos:
 * a sobra do arredondamento vira um bloco de 1× no fim (59 + 1); no SAC cada
 * parcela tem valor próprio (um bloco por parcela); e um reforço semestral cai
 * no meio das mensais por data, partindo a série mensal em pedaços.
 */
export interface SerieDoPlano {
    tipo: string;
    primeiroVencimento: string;
    /** Meses entre parcelas; 0 = linha de parcela única. */
    intervaloMeses: number;
    parcelas: number;
    subtotal: number;
    valorPrimeira: number;
    valorUltima: number;
    /** Índices, em `blocos`, dos blocos que formam a série (em ordem de data). */
    membros: number[];
}

export function agruparSeries(blocos: BlocoPagamento[]): SerieDoPlano[] {
    const ordem = (blocos || [])
        .map((b, i) => ({ b, i }))
        .filter(({ b }) => b && b.primeiroVencimento && b.quantidade > 0)
        .sort((x, y) => x.b.primeiroVencimento.localeCompare(y.b.primeiroVencimento) || x.i - y.i);

    const series: (SerieDoPlano & { ultimoVencimento: string })[] = [];
    for (const { b, i } of ordem) {
        const qtd = Math.max(1, Math.floor(b.quantidade));
        const passoDoBloco = qtd > 1 ? (b.intervaloMeses || 0) : 0;
        const ultimoDoBloco = somarMeses(b.primeiroVencimento, passoDoBloco * (qtd - 1));
        // A última série DO MESMO TIPO, não a imediatamente anterior (reforços intercalados).
        const atual = [...series].reverse().find(s => s.tipo === b.tipo);
        if (atual) {
            const passo = mesesEntre(atual.ultimoVencimento, b.primeiroVencimento);
            const cadenciaOk = passo > 0
                && (atual.intervaloMeses === 0 || passo === atual.intervaloMeses)
                && (passoDoBloco === 0 || passoDoBloco === passo);
            if (cadenciaOk) {
                atual.intervaloMeses = passo;
                atual.parcelas += qtd;
                atual.subtotal = dois(atual.subtotal + subtotalDoBloco(b));
                atual.valorUltima = b.valorParcela;
                atual.ultimoVencimento = ultimoDoBloco;
                atual.membros.push(i);
                continue;
            }
        }
        series.push({
            tipo: b.tipo,
            primeiroVencimento: b.primeiroVencimento,
            intervaloMeses: passoDoBloco,
            parcelas: qtd,
            subtotal: subtotalDoBloco(b),
            valorPrimeira: b.valorParcela,
            valorUltima: b.valorParcela,
            membros: [i],
            ultimoVencimento: ultimoDoBloco,
        });
    }
    return series.map(({ ultimoVencimento: _u, ...s }) => s);
}

/**
 * A série PRINCIPAL — a que fecha a conta na tabela do plano: entre as de 2+
 * parcelas, a de maior subtotal (a mesma escolha do `blocoParaGerador`). -1 se
 * o plano não tem série.
 */
export function indiceDaSeriePrincipal(series: SerieDoPlano[]): number {
    let melhor = -1;
    series.forEach((s, i) => {
        if (s.parcelas > 1 && (melhor === -1 || s.subtotal > series[melhor].subtotal)) melhor = i;
    });
    return melhor;
}

/**
 * O inverso do `montarPlanoRapido`: a série principal de um plano já gravado,
 * para o montador da aba Financeiro abrir com ela em vez de "12×" fixo.
 *
 * Até 2026-11-10 o montador nascia `{ entrada: '', parcelas: '12' }` e o botão
 * virava "Substituir plano" — num plano de sinal + 60 parcelas, um clique
 * trocava tudo por 12× sem entrada (crítica de design da aba, 10/11/2026).
 *
 * A série é a de `agruparSeries` (sobra 1×, SAC e reforços intercalados numa
 * linha só); vale a principal (`indiceDaSeriePrincipal`). Sem série, `null`.
 */
export function serieDoPlanoGravado(
    blocos: BlocoPagamento[],
): { parcelas: number; tipo: string; primeiroVencimento: string } | null {
    const series = agruparSeries(blocos);
    const p = indiceDaSeriePrincipal(series);
    if (p < 0) return null;
    return { parcelas: series[p].parcelas, tipo: series[p].tipo, primeiroVencimento: series[p].primeiroVencimento };
}
