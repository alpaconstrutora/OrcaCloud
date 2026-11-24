import type { ContractInstallment } from '../types/contracts';
import { parcelaBaixada, type ParcelaExistente } from './contratoParcelaVariavel';

const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * Valor atual do contrato NÃO recorrente: original + aditivos aprovados + reajuste
 * acumulado. Fórmula única do "Salvar" do contrato e da aprovação de aditivo — até
 * 09/11/2026 as duas paravam nos aditivos e apagavam o reajuste.
 */
export function valorAtualDoContrato(original: number, aditivosAprovados: number, reajusteAcumulado: number | null | undefined): number {
    return centavos(Number(original || 0) + Number(aditivosAprovados || 0) + Number(reajusteAcumulado || 0));
}

/**
 * Parcela de venda com juros (Price/SAC) carrega `interest` + `principal` = `value`.
 * O reajuste escala os dois pelo mesmo fator; o principal sai por diferença para a
 * soma continuar fechando o valor depois do arredondamento em centavos. Sem isto o
 * título ficava com o valor reajustado e os juros antigos (plano
 * 2026-11-09-negociacao-parcelamento-com-juros, Review Focus 2). Linha sem juros
 * não ganha as chaves.
 */
function jurosReajustados(linha: ContractInstallment, valor: number, fator: number): Partial<ContractInstallment> {
    const temJuros = typeof linha.interest === 'number';
    const temPrincipal = typeof linha.principal === 'number';
    if (!temJuros && !temPrincipal) return {};
    const juros = temJuros ? centavos((linha.interest as number) * fator) : null;
    if (temJuros && temPrincipal) return { interest: juros, principal: centavos(valor - (juros as number)) };
    return temJuros ? { interest: juros } : { principal: centavos((linha.principal as number) * fator) };
}

/**
 * Reajuste de contrato PARCELADO: aplica o fator ao CRONOGRAMA, que é de onde
 * `syncParceladoScheduleToFinance` tira o valor de cada parcela. Até 09/11/2026
 * `applyReajuste` só mudava `current_value` e o sync seguinte regravava as parcelas
 * com os valores antigos — o reajuste nunca chegava a Contas a Receber.
 *
 * Sobe só o SALDO: parcela que vence a partir de `hoje`, não baixada e sem valor
 * alterado à mão. A linha `i` do cronograma é o título `<contrato>:p<i+1>`; com
 * vencimento alterado à mão, vale a data do título.
 *
 * `acrescimo` é o que o contrato passa a valer a mais — o chamador soma em
 * `current_value`, para a soma das parcelas continuar batendo com o valor atual.
 */
export function reajustarCronograma(
    cronograma: ContractInstallment[],
    parcelas: ParcelaExistente[],
    contractId: string,
    fator: number,
    hoje: string,
): { cronograma: ContractInstallment[]; acrescimo: number; reajustadas: number } {
    const porRef = new Map(parcelas.filter(p => p.reference_id).map(p => [p.reference_id as string, p]));
    let acrescimo = 0;
    let reajustadas = 0;

    const novo = cronograma.map((linha, i) => {
        const titulo = porRef.get(`${contractId}:p${i + 1}`);
        if (titulo && (parcelaBaixada(titulo) || titulo.valor_manual)) return { ...linha };
        const vencimento = (titulo?.vencimento_manual && titulo.due_date ? titulo.due_date : linha.date).slice(0, 10);
        if (vencimento < hoje) return { ...linha };
        const valor = centavos(linha.value * fator);
        acrescimo += valor - linha.value;
        reajustadas++;
        return { ...linha, value: valor, ...jurosReajustados(linha, valor, fator) };
    });

    return { cronograma: novo, acrescimo: centavos(acrescimo), reajustadas };
}

/**
 * Aniversário do reajuste depois de uma RENOVAÇÃO (aditivo ou contrato novo).
 *
 * Renovar estende a vigência; reajustar corrige o valor no aniversário. São
 * coisas diferentes (decisão do usuário, 24/11/2026 — plano
 * 2026-11-24-locacoes-reajustes-separados-das-renovacoes). Até então as duas vias
 * de renovação regravavam `reajuste_data_base = início do período novo` e
 * `reajuste_proximo = início + 12 meses` mesmo sem mudar o aluguel — o reajuste
 * anual era pulado.
 *
 * - Valor igual (diferença < 1 centavo): o aniversário continua o do contrato.
 * - Valor diferente: quem renovou reajustou à mão; o aniversário reinicia no
 *   período novo, como antes.
 */
export function aniversarioAposRenovacao(
    contrato: { start_date?: string | null; reajuste_data_base?: string | null; reajuste_proximo?: string | null },
    inicioNovo: string,
    valorAtual: number,
    valorNovo: number,
): { reajuste_data_base: string; reajuste_proximo: string } {
    const maisUmAno = (iso: string) => {
        const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
        const dt = new Date(Date.UTC(y + 1, m - 1, d));
        // 29/02 + 1 ano não existe: fica no último dia de fevereiro.
        if (dt.getUTCMonth() !== m - 1) dt.setUTCDate(0);
        return dt.toISOString().slice(0, 10);
    };
    if (Math.abs(Number(valorNovo || 0) - Number(valorAtual || 0)) >= 0.01) {
        return { reajuste_data_base: inicioNovo, reajuste_proximo: maisUmAno(inicioNovo) };
    }
    const base = (contrato.reajuste_data_base || contrato.start_date || inicioNovo).slice(0, 10);
    return { reajuste_data_base: base, reajuste_proximo: (contrato.reajuste_proximo || maisUmAno(base)).slice(0, 10) };
}
