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
 */
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
